CREATE OR REPLACE FUNCTION public.campaign_shop_legacy_wallet_projection(
	p_gp numeric
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $campaign_shop_legacy_wallet_projection$
DECLARE
	v_cents numeric;
BEGIN
	IF p_gp IS NULL OR p_gp < 0 OR p_gp > 1000000
		OR p_gp <> trunc(p_gp, 2) THEN
		RAISE EXCEPTION '角色 GP 餘額無效。' USING ERRCODE = '22023';
	END IF;

	v_cents := p_gp * 100;
	IF v_cents <> trunc(v_cents) THEN
		RAISE EXCEPTION '角色 GP 餘額精度無效。' USING ERRCODE = '22023';
	END IF;

	RETURN jsonb_build_object(
		'pp', 0,
		'gp', floor(v_cents / 100)::bigint,
		'ep', 0,
		'sp', 0,
		'cp', mod(v_cents, 100)::bigint
	);
END
$campaign_shop_legacy_wallet_projection$;

REVOKE ALL ON FUNCTION public.campaign_shop_legacy_wallet_projection(numeric)
	FROM PUBLIC, anon, authenticated, service_role;

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
	v_definition jsonb;
	v_base jsonb;
	v_public_base jsonb;
	v_wallet_gp numeric;
	v_wallet_cents numeric;
	v_price_cents numeric;
	v_new_wallet_gp numeric;
	v_is_identified boolean;
	v_category text;
	v_inventory_id text := gen_random_uuid()::text;
BEGIN
	SELECT * INTO v_order
	FROM public.campaign_shop_orders AS order_row
	WHERE order_row.id = p_order_id
	FOR UPDATE;
	IF NOT FOUND OR v_order.status <> 'pending' THEN
		RAISE EXCEPTION '訂單不存在或已處理。' USING ERRCODE = '22023';
	END IF;

	IF p_reserved THEN
		IF NOT public.is_campaign_dm(v_order.campaign_id)
			OR v_order.requires_approval IS NOT TRUE THEN
			RAISE EXCEPTION '只有該戰役 DM 可以核准此訂單。'
				USING ERRCODE = '42501';
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

	v_wallet_gp := CASE v_payment.wallet_type
		WHEN 'public' THEN v_character.gp
		ELSE v_character.private_gp
	END;
	v_wallet_cents := v_wallet_gp * 100;
	v_price_cents := v_order.total_price_gp * 100;
	IF v_wallet_gp IS NULL OR v_order.total_price_gp IS NULL
		OR v_order.total_price_gp <= 0
		OR v_wallet_cents <> trunc(v_wallet_cents)
		OR v_price_cents <> trunc(v_price_cents)
		OR v_wallet_cents < v_price_cents THEN
		RAISE EXCEPTION '所選錢包餘額不足或商品價格精度無效。'
			USING ERRCODE = '23514';
	END IF;
	v_new_wallet_gp := v_wallet_gp - v_order.total_price_gp;

	IF v_payment.wallet_type = 'public' THEN
		UPDATE public.characters
		SET gp = v_new_wallet_gp,
			currencies =
				public.campaign_shop_legacy_wallet_projection(v_new_wallet_gp)
		WHERE id = v_character.id AND campaign_id = v_order.campaign_id;
	ELSE
		UPDATE public.characters
		SET private_gp = v_new_wallet_gp,
			private_currencies =
				public.campaign_shop_legacy_wallet_projection(v_new_wallet_gp)
		WHERE id = v_character.id AND campaign_id = v_order.campaign_id;
	END IF;

	v_is_identified := v_order.is_identified;
	v_definition := CASE
		WHEN v_is_identified THEN v_order.item_snapshot
		ELSE v_order.item_identified_snapshot
	END;
	v_base := public.campaign_shop_item_snapshot_base(v_definition);
	IF NOT public.is_valid_item_base(v_base) THEN
		RAISE EXCEPTION '訂單物品快照無效，交易已取消。'
			USING ERRCODE = '23514';
	END IF;
	v_public_base := CASE
		WHEN v_is_identified THEN v_base
		ELSE public.campaign_shop_unidentified_item_base(v_base)
	END;
	v_category := v_public_base ->> 'category';

	INSERT INTO public.inventory_items (
		id, campaign_id, owner_id, slot, name, category, sub_type, rarity, icon,
		damage, mastery, ac, weight, value_gp, quantity, equipped,
		requires_attunement, attuned, is_homebrew, is_identified, charges,
		max_charges, effects, flavor, dm_notes, player_notes, is_private,
		is_equippable, is_consumable, is_important, affixes, item_base,
		item_identified_snapshot
	)
	VALUES (
		v_inventory_id, v_order.campaign_id, v_order.character_id, 0,
		v_public_base ->> 'name',
		CASE
			WHEN v_category = 'Weapon' THEN 'Weapon'
			WHEN v_category = 'Armor' THEN 'Armor'
			WHEN COALESCE((v_public_base ->> 'isConsumable')::boolean, false)
				OR v_category IN ('Potion', 'Poison', 'Scroll') THEN 'Consumable'
			ELSE 'Misc'
		END,
		COALESCE(v_public_base #>> '{subTypes,0}', ''),
		v_public_base ->> 'rarity',
		COALESCE(v_public_base ->> 'icon', 'Package'),
		v_public_base #>> '{weaponProperties,damage}',
		COALESCE(v_public_base #>> '{weaponProperties,mastery}', 'None'),
		v_public_base #>> '{armorProperties,ac}',
		(v_public_base ->> 'weight')::numeric,
		(v_public_base ->> 'valueGp')::numeric,
		v_order.quantity, false,
		COALESCE((v_public_base ->> 'isRequireAttunement')::boolean, false),
		false, COALESCE((v_definition ->> 'is_homebrew')::boolean, false),
		v_is_identified, 0,
		COALESCE((v_public_base ->> 'maxCharges')::integer, 0),
		COALESCE(v_public_base ->> 'effects', ''),
		COALESCE(v_public_base ->> 'flavor', ''),
		COALESCE(v_public_base ->> 'dmNotes', ''), '', false,
		COALESCE((v_public_base ->> 'isEquippable')::boolean, false),
		COALESCE((v_public_base ->> 'isConsumable')::boolean, false),
		CASE WHEN v_is_identified
			THEN COALESCE((v_definition ->> 'is_important')::boolean, false)
			ELSE false
		END,
		COALESCE(v_public_base -> 'affixes', '[]'::jsonb),
		v_public_base,
		CASE WHEN v_is_identified THEN NULL ELSE jsonb_build_object(
			'item_base', v_base,
			'is_homebrew', COALESCE((v_definition ->> 'is_homebrew')::boolean, false),
			'is_important', false
		) END
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

GRANT SELECT (gp, private_gp)
	ON public.characters TO authenticated;

DROP FUNCTION public.shop_wallet_total_cp(jsonb);
DROP FUNCTION public.shop_wallet_from_cp(numeric);
