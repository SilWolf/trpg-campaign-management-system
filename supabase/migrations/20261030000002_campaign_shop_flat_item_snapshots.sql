CREATE OR REPLACE FUNCTION public.campaign_shop_item_snapshot_base(
	p_snapshot jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $campaign_shop_item_snapshot_base$
	SELECT CASE
		WHEN public.is_valid_item_base(p_snapshot -> 'item_base')
			THEN p_snapshot -> 'item_base'
		WHEN public.is_valid_item_base(p_snapshot)
			THEN p_snapshot - ARRAY[
				'item_base', 'is_identified', 'sub_type', 'damage', 'mastery',
				'ac', 'value_gp', 'requires_attunement', 'is_homebrew',
				'max_charges', 'dm_notes', 'is_equippable', 'is_consumable',
				'is_important'
			]
		ELSE NULL
	END
$campaign_shop_item_snapshot_base$;

ALTER TABLE public.campaign_shop_items
	DROP CONSTRAINT campaign_shop_items_item_snapshot_safe_check;
ALTER TABLE public.campaign_shop_orders
	DROP CONSTRAINT campaign_shop_orders_secret_snapshot_object_check;

UPDATE public.campaign_shop_items AS item
SET item_snapshot = CASE
		WHEN item.is_identified AND item.item_snapshot ? 'item_base'
			THEN (item.item_snapshot - 'item_base' - 'is_identified')
				|| (item.item_snapshot -> 'item_base')
		ELSE item.item_snapshot
	END,
	item_identified_snapshot = CASE
		WHEN NOT item.is_identified
			AND item.item_identified_snapshot ? 'item_base'
			THEN (item.item_identified_snapshot - 'item_base' - 'is_identified')
				|| (item.item_identified_snapshot -> 'item_base')
		ELSE item.item_identified_snapshot
	END;

UPDATE public.campaign_shop_orders AS order_row
SET item_snapshot = CASE
		WHEN order_row.is_identified AND order_row.item_snapshot ? 'item_base'
			THEN (order_row.item_snapshot - 'item_base' - 'is_identified')
				|| (order_row.item_snapshot -> 'item_base')
		ELSE order_row.item_snapshot
	END,
	item_identified_snapshot = CASE
		WHEN NOT order_row.is_identified
			AND order_row.item_identified_snapshot ? 'item_base'
			THEN (order_row.item_identified_snapshot - 'item_base' - 'is_identified')
				|| (order_row.item_identified_snapshot -> 'item_base')
		ELSE order_row.item_identified_snapshot
	END;

ALTER TABLE public.campaign_shop_items
	ADD CONSTRAINT campaign_shop_items_item_snapshot_safe_check CHECK (
		(
			is_identified
			AND item_identified_snapshot IS NULL
			AND jsonb_typeof(item_snapshot) = 'object'
			AND item_snapshot ?& ARRAY['name', 'category', 'rarity', 'icon']
			AND public.is_valid_item_base(
				public.campaign_shop_item_snapshot_base(item_snapshot)
			)
		)
		OR (
			NOT is_identified
			AND item_identified_snapshot IS NOT NULL
			AND jsonb_typeof(item_snapshot) = 'object'
			AND item_snapshot ?& ARRAY['category', 'subTypes', 'weight']
			AND jsonb_typeof(item_snapshot -> 'category') = 'string'
			AND jsonb_typeof(item_snapshot -> 'subTypes') = 'array'
			AND jsonb_typeof(item_snapshot -> 'weight') = 'number'
			AND jsonb_typeof(item_identified_snapshot) = 'object'
			AND public.is_valid_item_base(
				public.campaign_shop_item_snapshot_base(item_identified_snapshot)
			)
		)
	);

ALTER TABLE public.campaign_shop_orders
	ADD CONSTRAINT campaign_shop_orders_secret_snapshot_object_check CHECK (
		item_identified_snapshot IS NULL
		OR (
			jsonb_typeof(item_identified_snapshot) = 'object'
			AND public.is_valid_item_base(
				public.campaign_shop_item_snapshot_base(item_identified_snapshot)
			)
		)
	);

CREATE OR REPLACE FUNCTION public.campaign_shop_flatten_item_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $campaign_shop_flatten_item_snapshot$
DECLARE
	v_base jsonb;
BEGIN
	IF NEW.is_identified IS TRUE
		AND jsonb_typeof(NEW.item_snapshot) = 'object'
		AND NEW.item_snapshot ? 'item_base' THEN
		v_base := public.campaign_shop_item_snapshot_base(NEW.item_snapshot);
		IF public.is_valid_item_base(v_base) IS DISTINCT FROM true THEN
			RAISE EXCEPTION '商店商品快照中的物品定義格式無效。'
				USING ERRCODE = '23514';
		END IF;
		NEW.item_snapshot :=
			(NEW.item_snapshot - 'item_base' - 'is_identified') || v_base;
	END IF;
	RETURN NEW;
END
$campaign_shop_flatten_item_snapshot$;

CREATE TRIGGER campaign_shop_items_flatten_item_snapshot
	BEFORE INSERT OR UPDATE OF item_snapshot, is_identified
	ON public.campaign_shop_items
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_flatten_item_snapshot();

CREATE OR REPLACE FUNCTION public.save_campaign_shop_item(
	p_campaign_id text,
	p_shop_id text,
	p_item_id text,
	p_item_snapshot jsonb,
	p_unit_price_gp numeric,
	p_stock_available integer,
	p_requires_approval boolean,
	p_is_active boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $save_campaign_shop_item$
DECLARE
	v_id text := COALESCE(p_item_id, gen_random_uuid()::text);
	v_base jsonb := public.campaign_shop_item_snapshot_base(p_item_snapshot);
	v_is_identified boolean;
	v_public_snapshot jsonb;
	v_secret_snapshot jsonb;
	v_definition jsonb;
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_dm(p_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以管理商店商品。'
			USING ERRCODE = '42501';
	END IF;
	IF jsonb_typeof(p_item_snapshot) IS DISTINCT FROM 'object'
		OR NOT public.is_valid_item_base(v_base)
		OR p_unit_price_gp IS NULL OR p_unit_price_gp <= 0
		OR p_stock_available IS NULL OR p_stock_available < 0 THEN
		RAISE EXCEPTION '商店商品資料無效。' USING ERRCODE = '22023';
	END IF;

	v_is_identified := COALESCE((p_item_snapshot ->> 'is_identified')::boolean, true);
	v_definition :=
		(p_item_snapshot - 'is_identified' - 'item_base') || v_base;
	IF v_is_identified THEN
		v_public_snapshot := v_definition;
		v_secret_snapshot := NULL;
	ELSE
		v_public_snapshot := public.campaign_shop_public_item_snapshot(v_base);
		v_secret_snapshot := v_definition;
	END IF;

	IF p_item_id IS NOT NULL THEN
		UPDATE public.campaign_shop_items
		SET item_snapshot = v_public_snapshot,
			item_identified_snapshot = v_secret_snapshot,
			is_identified = v_is_identified,
			unit_price_gp = p_unit_price_gp,
			stock_available = p_stock_available,
			requires_approval = COALESCE(p_requires_approval, false),
			is_active = COALESCE(p_is_active, true)
		WHERE id = p_item_id
			AND campaign_id = p_campaign_id
			AND shop_id = p_shop_id;
		IF NOT FOUND THEN
			RAISE EXCEPTION '商店商品不存在或不屬於指定商店。'
				USING ERRCODE = '22023';
		END IF;
	ELSE
		INSERT INTO public.campaign_shop_items (
			id, campaign_id, shop_id, item_snapshot, item_identified_snapshot,
			is_identified, unit_price_gp, stock_available, requires_approval,
			is_active
		)
		VALUES (
			v_id, p_campaign_id, p_shop_id, v_public_snapshot,
			v_secret_snapshot, v_is_identified, p_unit_price_gp,
			p_stock_available, COALESCE(p_requires_approval, false),
			COALESCE(p_is_active, true)
		);
	END IF;
	RETURN v_id;
END
$save_campaign_shop_item$;

REVOKE ALL ON FUNCTION public.save_campaign_shop_item(
	text, text, text, jsonb, numeric, integer, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_campaign_shop_item(
	text, text, text, jsonb, numeric, integer, boolean, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.load_campaign_shop_item_definitions(
	p_campaign_id text,
	p_shop_id text
)
RETURNS TABLE (item_id text, item_snapshot jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $load_campaign_shop_item_definitions$
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_dm(p_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以讀取未鑑定商品定義。'
			USING ERRCODE = '42501';
	END IF;
	RETURN QUERY
	SELECT item.id, item.item_identified_snapshot
	FROM public.campaign_shop_items AS item
	WHERE item.campaign_id = p_campaign_id
		AND item.shop_id = p_shop_id
		AND item.is_identified IS FALSE;
END
$load_campaign_shop_item_definitions$;

REVOKE ALL ON FUNCTION public.load_campaign_shop_item_definitions(text, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_campaign_shop_item_definitions(text, text)
	TO authenticated;

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
	v_wallet jsonb;
	v_wallet_total_cp numeric;
	v_price_cp numeric;
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
		SET private_currencies =
			public.shop_wallet_from_cp(v_wallet_total_cp - v_price_cp)
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
