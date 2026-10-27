CREATE OR REPLACE FUNCTION public.campaign_shop_settle_order(
	p_order_id text,
	p_reserved boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_shop_settle_order$
DECLARE
	v_order public.campaign_shop_orders%ROWTYPE;
	v_item public.campaign_shop_items%ROWTYPE;
	v_payment public.campaign_shop_order_payments%ROWTYPE;
	v_character public.characters%ROWTYPE;
	v_wallet jsonb;
	v_wallet_total_cp numeric;
	v_price_cp numeric;
	v_is_dm boolean;
	v_inventory_id text := gen_random_uuid()::text;
BEGIN
	SELECT * INTO v_order
	FROM public.campaign_shop_orders AS order_row
	WHERE order_row.id = p_order_id
	FOR UPDATE;
	IF NOT FOUND OR v_order.status <> 'pending' THEN
		RAISE EXCEPTION '訂單不存在或已處理。' USING ERRCODE = '22023';
	END IF;

	v_is_dm := public.is_campaign_dm(v_order.campaign_id);
	IF p_reserved THEN
		IF NOT v_is_dm OR v_order.requires_approval IS NOT TRUE THEN
			RAISE EXCEPTION '只有該戰役 DM 可以核准此訂單。' USING ERRCODE = '42501';
		END IF;
	ELSIF auth.uid() IS NULL OR v_order.buyer_user_id <> auth.uid()
		OR v_order.requires_approval IS TRUE THEN
		RAISE EXCEPTION '無權完成此購買。' USING ERRCODE = '42501';
	END IF;

	SELECT * INTO v_payment
	FROM public.campaign_shop_order_payments AS payment
	WHERE payment.order_id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到訂單付款設定。' USING ERRCODE = '23503';
	END IF;
	PERFORM public.campaign_shop_assert_buyer_access(
		v_order.campaign_id, v_order.character_id, v_payment.wallet_type
	);

	SELECT * INTO v_item
	FROM public.campaign_shop_items AS shop_item
	WHERE shop_item.id = v_order.shop_item_id
		AND shop_item.campaign_id = v_order.campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店商品已不存在。' USING ERRCODE = '23503';
	END IF;
	IF p_reserved THEN
		IF v_item.stock_reserved < v_order.quantity THEN
			RAISE EXCEPTION '保留庫存資料不一致。' USING ERRCODE = '23514';
		END IF;
		UPDATE public.campaign_shop_items
		SET stock_reserved = stock_reserved - v_order.quantity
		WHERE id = v_item.id AND campaign_id = v_order.campaign_id;
	ELSE
		IF v_item.stock_available < v_order.quantity THEN
			RAISE EXCEPTION '商品庫存不足。' USING ERRCODE = '23514';
		END IF;
		UPDATE public.campaign_shop_items
		SET stock_available = stock_available - v_order.quantity
		WHERE id = v_item.id AND campaign_id = v_order.campaign_id;
	END IF;

	SELECT * INTO v_character
	FROM public.characters AS character
	WHERE character.id = v_order.character_id
		AND character.campaign_id = v_order.campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '購物角色已不存在。' USING ERRCODE = '23503';
	END IF;

	v_wallet := CASE v_payment.wallet_type
		WHEN 'public' THEN v_character.currencies
		ELSE v_character.private_currencies
	END;
	v_wallet_total_cp := public.shop_wallet_total_cp(v_wallet);
	v_price_cp := v_order.total_price_gp * 100;
	IF v_price_cp <> trunc(v_price_cp) OR v_wallet_total_cp < v_price_cp THEN
		RAISE EXCEPTION '所選錢包餘額不足或商品價格精度無效。'
			USING ERRCODE = '23514';
	END IF;
	IF v_payment.wallet_type = 'public' THEN
		UPDATE public.characters
		SET currencies = public.shop_wallet_from_cp(v_wallet_total_cp - v_price_cp)
		WHERE id = v_character.id AND campaign_id = v_order.campaign_id;
	ELSE
		UPDATE public.characters
		SET private_currencies = public.shop_wallet_from_cp(v_wallet_total_cp - v_price_cp)
		WHERE id = v_character.id AND campaign_id = v_order.campaign_id;
	END IF;

	INSERT INTO public.inventory_items (
		id, campaign_id, owner_id, slot, name, category, sub_type, rarity, icon,
		damage, mastery, ac, weight, value_gp, quantity, equipped,
		requires_attunement, attuned, is_homebrew, is_identified, charges,
		max_charges, effects, flavor, dm_notes, player_notes, is_private,
		is_equippable, is_consumable, is_important, affixes, item_base
	)
	VALUES (
		v_inventory_id, v_order.campaign_id, v_order.character_id, 0,
		v_order.item_snapshot ->> 'name',
		v_order.item_snapshot ->> 'category',
		COALESCE(v_order.item_snapshot ->> 'sub_type', ''),
		v_order.item_snapshot ->> 'rarity',
		v_order.item_snapshot ->> 'icon',
		v_order.item_snapshot ->> 'damage',
		COALESCE(v_order.item_snapshot ->> 'mastery', 'None'),
		v_order.item_snapshot ->> 'ac',
		COALESCE((v_order.item_snapshot ->> 'weight')::numeric, 0),
		COALESCE((v_order.item_snapshot ->> 'value_gp')::numeric, 0),
		v_order.quantity, false,
		COALESCE((v_order.item_snapshot ->> 'requires_attunement')::boolean, false),
		false, COALESCE((v_order.item_snapshot ->> 'is_homebrew')::boolean, false),
		COALESCE((v_order.item_snapshot ->> 'is_identified')::boolean, true),
		0,
		COALESCE((v_order.item_snapshot ->> 'max_charges')::integer, 0),
		COALESCE(v_order.item_snapshot ->> 'effects', ''),
		COALESCE(v_order.item_snapshot ->> 'flavor', ''),
		COALESCE(v_order.item_snapshot ->> 'dm_notes', ''), '', false,
		COALESCE((v_order.item_snapshot ->> 'is_equippable')::boolean, false),
		COALESCE((v_order.item_snapshot ->> 'is_consumable')::boolean, false),
		COALESCE((v_order.item_snapshot ->> 'is_important')::boolean, false),
		COALESCE(v_order.item_snapshot -> 'affixes', '[]'::jsonb),
		v_order.item_snapshot -> 'item_base'
	);

	UPDATE public.campaign_shop_orders
	SET status = 'completed',
		reviewed_by = CASE WHEN p_reserved THEN auth.uid() ELSE NULL END,
		reviewed_at = CASE WHEN p_reserved THEN now() ELSE NULL END,
		updated_at = now()
	WHERE id = p_order_id;
	RETURN p_order_id;
END
$campaign_shop_settle_order$;
