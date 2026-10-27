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
	v_base jsonb := p_item_snapshot -> 'item_base';
	v_is_identified boolean;
	v_public_snapshot jsonb;
	v_secret_snapshot jsonb;
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
	IF v_is_identified THEN
		v_public_snapshot := p_item_snapshot - 'is_identified';
		v_secret_snapshot := NULL;
	ELSE
		v_public_snapshot := public.campaign_shop_public_item_snapshot(v_base);
		v_secret_snapshot := p_item_snapshot - 'is_identified';
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

DROP FUNCTION public.save_campaign_shop_item(
	text, text, text, jsonb, numeric, integer, boolean, boolean, text, text
);
GRANT EXECUTE ON FUNCTION public.save_campaign_shop_item(
	text, text, text, jsonb, numeric, integer, boolean, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.checkout_campaign_shop_cart_as_actor(
	p_actor_id uuid,
	p_campaign_id text,
	p_shop_id text,
	p_character_id text,
	p_wallet_type text,
	p_items jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $checkout_campaign_shop_cart_as_actor$
BEGIN
	IF auth.role() IS DISTINCT FROM 'service_role'
		OR p_actor_id IS NULL
		OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor_id) THEN
		RAISE EXCEPTION '無權呼叫商店購買交易。'
			USING ERRCODE = '42501';
	END IF;

	PERFORM set_config('request.jwt.claim.sub', p_actor_id::text, true);
	RETURN public.checkout_campaign_shop_cart(
		p_campaign_id, p_shop_id, p_character_id, p_wallet_type, p_items
	);
END
$checkout_campaign_shop_cart_as_actor$;

REVOKE ALL ON FUNCTION public.checkout_campaign_shop_cart_as_actor(
	uuid, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_campaign_shop_cart_as_actor(
	uuid, text, text, text, text, jsonb
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.checkout_campaign_shop_cart(
	text, text, text, text, jsonb
), public.purchase_campaign_shop_item(text, text, text, text, integer),
public.request_campaign_shop_item(text, text, text, text, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_campaign_shop_cart(
	text, text, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_campaign_shop_items(
	p_campaign_id text,
	p_shop_id text,
	p_expected_shop_updated_at timestamptz,
	p_expected_items jsonb,
	p_keep_items boolean,
	p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $refresh_campaign_shop_items$
DECLARE
	v_shop public.campaign_shops%ROWTYPE;
	v_expected jsonb;
	v_change jsonb;
	v_source_id text;
	v_expected_updated_at timestamptz;
	v_actual_updated_at timestamptz;
	v_expected_count integer;
	v_current_count integer;
	v_created integer := 0;
	v_deleted integer := 0;
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_dm(p_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以刷新商店商品。'
			USING ERRCODE = '42501';
	END IF;
	IF p_campaign_id IS NULL OR p_shop_id IS NULL
		OR p_expected_shop_updated_at IS NULL
		OR p_keep_items IS NULL
		OR jsonb_typeof(p_expected_items) IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_changes) IS DISTINCT FROM 'array' THEN
		RAISE EXCEPTION '商店刷新參數格式無效。' USING ERRCODE = '22023';
	END IF;

	SELECT shop.* INTO v_shop
	FROM public.campaign_shops AS shop
	WHERE shop.id = p_shop_id AND shop.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店不存在或不屬於此戰役。' USING ERRCODE = '22023';
	END IF;
	IF v_shop.updated_at IS DISTINCT FROM p_expected_shop_updated_at
		OR v_shop.refresh_policy #>> '{flags,keepItemsOnRefresh}'
			IS DISTINCT FROM p_keep_items::text THEN
		RAISE EXCEPTION '商店或刷新政策已更新，請重新產生預覽。'
			USING ERRCODE = '40001';
	END IF;
	IF jsonb_array_length(p_expected_items) > 10000
		OR jsonb_array_length(p_changes) > 10000
		OR EXISTS (
			SELECT 1 FROM jsonb_array_elements(p_expected_items) AS expected(value)
			WHERE jsonb_typeof(expected.value) IS DISTINCT FROM 'object'
				OR jsonb_typeof(expected.value -> 'id') IS DISTINCT FROM 'string'
				OR jsonb_typeof(expected.value -> 'updated_at') IS DISTINCT FROM 'string'
		)
		OR (
			SELECT count(*) <> count(DISTINCT value ->> 'id')
			FROM jsonb_array_elements(p_expected_items)
		) THEN
		RAISE EXCEPTION '刷新預覽的商品版本清單無效。' USING ERRCODE = '22023';
	END IF;
	IF EXISTS (
		SELECT 1 FROM jsonb_array_elements(p_changes) AS change(value)
		WHERE jsonb_typeof(change.value) IS DISTINCT FROM 'object'
			OR jsonb_typeof(change.value -> 'source_id') IS DISTINCT FROM 'string'
			OR (change.value ->> 'source_id') !~ '^[^:]+:[^:]+$'
			OR jsonb_typeof(change.value -> 'item_snapshot') IS DISTINCT FROM 'object'
			OR NOT public.is_valid_item_base(change.value #> '{item_snapshot,item_base}')
			OR COALESCE((change.value #>> '{item_snapshot,is_identified}')::boolean, true)
				IS DISTINCT FROM true
			OR jsonb_typeof(change.value -> 'unit_price_gp') IS DISTINCT FROM 'number'
			OR (change.value ->> 'unit_price_gp') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
			OR (change.value ->> 'unit_price_gp')::numeric <= 0
			OR jsonb_typeof(change.value -> 'stock_available') IS DISTINCT FROM 'number'
			OR (change.value ->> 'stock_available') !~ '^(0|[1-9][0-9]{0,9})$'
			OR (change.value ->> 'stock_available')::numeric > 2147483647
	) OR (
		SELECT count(*) <> count(DISTINCT value ->> 'source_id')
		FROM jsonb_array_elements(p_changes)
	) THEN
		RAISE EXCEPTION '刷新預覽包含無效或重複的商品資料。'
			USING ERRCODE = '22023';
	END IF;

	PERFORM item.id
	FROM public.campaign_shop_items AS item
	WHERE item.campaign_id = p_campaign_id AND item.shop_id = p_shop_id
	ORDER BY item.id
	FOR UPDATE;
	GET DIAGNOSTICS v_current_count = ROW_COUNT;
	v_expected_count := jsonb_array_length(p_expected_items);
	IF v_current_count <> v_expected_count THEN
		RAISE EXCEPTION '商品清單已更新，請重新產生刷新預覽。'
			USING ERRCODE = '40001';
	END IF;

	FOR v_expected IN SELECT value FROM jsonb_array_elements(p_expected_items)
	LOOP
		BEGIN
			v_expected_updated_at := (v_expected ->> 'updated_at')::timestamptz;
		EXCEPTION
			WHEN invalid_datetime_format OR datetime_field_overflow THEN
				RAISE EXCEPTION '刷新預覽包含無效的商品版本時間。'
					USING ERRCODE = '22023';
		END;
		SELECT item.updated_at INTO v_actual_updated_at
		FROM public.campaign_shop_items AS item
		WHERE item.id = v_expected ->> 'id'
			AND item.campaign_id = p_campaign_id
			AND item.shop_id = p_shop_id;
		IF NOT FOUND OR v_actual_updated_at IS DISTINCT FROM v_expected_updated_at THEN
			RAISE EXCEPTION '商品資料已更新，請重新產生預覽。'
				USING ERRCODE = '40001';
		END IF;
	END LOOP;

	IF NOT p_keep_items THEN
		UPDATE public.campaign_shop_items
		SET is_active = false, stock_available = 0
		WHERE campaign_id = p_campaign_id AND shop_id = p_shop_id
			AND (is_active OR stock_available <> 0);
		GET DIAGNOSTICS v_deleted = ROW_COUNT;
	END IF;

	FOR v_change IN SELECT value FROM jsonb_array_elements(p_changes)
	LOOP
		v_source_id := v_change ->> 'source_id';
		IF NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements(v_shop.refresh_policy -> 'rules') AS rule(value)
			CROSS JOIN jsonb_array_elements(
				rule.value -> 'possibleItemsOrFilters'
			) AS candidate(value)
			WHERE (
				(candidate.value ->> 'catalogId')
					|| ':' || (candidate.value ->> 'itemId')
			) = v_source_id
			OR (
				candidate.value ->> 'source' = split_part(v_source_id, ':', 1)
				AND jsonb_typeof(candidate.value -> 'param') = 'object'
			)
		) THEN
			RAISE EXCEPTION '刷新預覽包含不在目前政策來源中的目錄商品。'
				USING ERRCODE = '22023';
		END IF;
		INSERT INTO public.campaign_shop_items (
			campaign_id, shop_id, item_snapshot, is_identified,
			unit_price_gp, stock_available, stock_reserved,
			requires_approval, is_active
		) VALUES (
			p_campaign_id, p_shop_id, v_change -> 'item_snapshot', true,
			(v_change ->> 'unit_price_gp')::numeric,
			(v_change ->> 'stock_available')::integer, 0, false, true
		);
		v_created := v_created + 1;
	END LOOP;

	UPDATE public.campaign_shops
	SET updated_at = now()
	WHERE id = p_shop_id AND campaign_id = p_campaign_id;
	RETURN jsonb_build_object('created', v_created, 'deleted', v_deleted);
END
$refresh_campaign_shop_items$;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.campaign_inventory_assert_write(
	p_campaign_id text,
	p_owner_id text,
	p_is_private boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_inventory_assert_write$
BEGIN
	IF auth.uid() IS NULL
		OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權修改此戰役背包。' USING ERRCODE = '42501';
	END IF;
	IF public.is_campaign_dm(p_campaign_id)
		OR p_owner_id = 'camp-chest'
		OR EXISTS (
			SELECT 1
			FROM public.characters AS character
			WHERE character.id = p_owner_id
				AND character.campaign_id = p_campaign_id
				AND character.user_id = auth.uid()::text
		)
		OR EXISTS (
			SELECT 1
			FROM public.character_permissions AS permission
			WHERE permission.campaign_id = p_campaign_id
				AND permission.character_id = p_owner_id
				AND permission.user_id = auth.uid()
				AND CASE WHEN p_is_private
					THEN permission.private_bag_access
					ELSE permission.public_bag_access
				END = 2
		) THEN
		RETURN;
	END IF;
	RAISE EXCEPTION '沒有此角色背包的修改權限。'
		USING ERRCODE = '42501';
END
$campaign_inventory_assert_write$;

CREATE OR REPLACE FUNCTION public.split_inventory_item(
	p_campaign_id text,
	p_item_id text,
	p_split_quantity integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $split_inventory_item$
DECLARE
	v_item public.inventory_items%ROWTYPE;
	v_new_id text := gen_random_uuid()::text;
BEGIN
	SELECT item.* INTO v_item
	FROM public.inventory_items AS item
	WHERE item.id = p_item_id AND item.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '物品不存在或不屬於此戰役。' USING ERRCODE = '22023';
	END IF;
	PERFORM public.campaign_inventory_assert_write(
		p_campaign_id, v_item.owner_id, v_item.is_private
	);
	IF p_split_quantity IS NULL OR p_split_quantity < 1
		OR p_split_quantity >= v_item.quantity THEN
		RAISE EXCEPTION '拆堆數量必須小於目前物品數量。'
			USING ERRCODE = '22023';
	END IF;

	v_item.id := v_new_id;
	v_item.quantity := p_split_quantity;
	INSERT INTO public.inventory_items SELECT v_item.*;
	UPDATE public.inventory_items
	SET quantity = quantity - p_split_quantity
	WHERE id = p_item_id AND campaign_id = p_campaign_id;
	RETURN v_new_id;
END
$split_inventory_item$;

CREATE OR REPLACE FUNCTION public.transfer_inventory_item(
	p_campaign_id text,
	p_item_id text,
	p_target_owner_id text,
	p_quantity integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $transfer_inventory_item$
DECLARE
	v_item public.inventory_items%ROWTYPE;
	v_stack public.inventory_items%ROWTYPE;
	v_new_id text := gen_random_uuid()::text;
BEGIN
	SELECT item.* INTO v_item
	FROM public.inventory_items AS item
	WHERE item.id = p_item_id AND item.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '物品不存在或不屬於此戰役。' USING ERRCODE = '22023';
	END IF;
	PERFORM public.campaign_inventory_assert_write(
		p_campaign_id, v_item.owner_id, v_item.is_private
	);
	IF p_target_owner_id IS NULL OR p_target_owner_id = v_item.owner_id
		OR p_quantity IS NULL OR p_quantity < 1
		OR p_quantity > v_item.quantity THEN
		RAISE EXCEPTION '移轉目標或數量無效。' USING ERRCODE = '22023';
	END IF;
	IF p_target_owner_id <> 'camp-chest' AND NOT EXISTS (
		SELECT 1 FROM public.characters AS character
		WHERE character.id = p_target_owner_id
			AND character.campaign_id = p_campaign_id
	) THEN
		RAISE EXCEPTION '移轉目標不存在或不屬於此戰役。'
			USING ERRCODE = '22023';
	END IF;

	SELECT item.* INTO v_stack
	FROM public.inventory_items AS item
	WHERE item.campaign_id = p_campaign_id
		AND item.owner_id = p_target_owner_id
		AND item.id <> p_item_id
		AND NOT item.equipped
		AND NOT item.attuned
		AND NOT item.is_private
		AND item.max_charges = 0
		AND item.name = v_item.name
		AND item.category = v_item.category
		AND item.sub_type = v_item.sub_type
		AND item.rarity = v_item.rarity
		AND item.weight = v_item.weight
		AND item.value_gp = v_item.value_gp
		AND item.requires_attunement = v_item.requires_attunement
		AND item.is_identified = v_item.is_identified
		AND item.item_base = v_item.item_base
		AND item.item_identified_snapshot
			IS NOT DISTINCT FROM v_item.item_identified_snapshot
		AND item.affixes = v_item.affixes
		AND NOT v_item.equipped
		AND NOT v_item.attuned
		AND v_item.max_charges = 0
	ORDER BY item.id
	LIMIT 1
	FOR UPDATE;

	IF FOUND THEN
		IF v_stack.quantity > 2147483647 - p_quantity THEN
			RAISE EXCEPTION '目標堆疊數量超出上限。' USING ERRCODE = '22003';
		END IF;
		UPDATE public.inventory_items
		SET quantity = quantity + p_quantity
		WHERE id = v_stack.id AND campaign_id = p_campaign_id;
		IF p_quantity = v_item.quantity THEN
			DELETE FROM public.inventory_items
			WHERE id = p_item_id AND campaign_id = p_campaign_id;
		ELSE
			UPDATE public.inventory_items
			SET quantity = quantity - p_quantity
			WHERE id = p_item_id AND campaign_id = p_campaign_id;
		END IF;
		RETURN v_stack.id;
	END IF;

	IF p_quantity = v_item.quantity THEN
		UPDATE public.inventory_items
		SET owner_id = p_target_owner_id,
			equipped = false,
			attuned = false,
			is_private = false
		WHERE id = p_item_id AND campaign_id = p_campaign_id;
		RETURN p_item_id;
	END IF;

	v_item.id := v_new_id;
	v_item.owner_id := p_target_owner_id;
	v_item.quantity := p_quantity;
	v_item.equipped := false;
	v_item.attuned := false;
	v_item.is_private := false;
	INSERT INTO public.inventory_items SELECT v_item.*;
	UPDATE public.inventory_items
	SET quantity = quantity - p_quantity
	WHERE id = p_item_id AND campaign_id = p_campaign_id;
	RETURN v_new_id;
END
$transfer_inventory_item$;

REVOKE ALL ON FUNCTION public.campaign_inventory_assert_write(text, text, boolean),
	public.split_inventory_item(text, text, integer),
	public.transfer_inventory_item(text, text, text, integer)
	FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_inventory_item(text, text, integer),
	public.transfer_inventory_item(text, text, text, integer)
	TO authenticated;

ALTER TABLE public.campaign_shop_items
	DROP COLUMN source_type,
	DROP COLUMN source_id;
