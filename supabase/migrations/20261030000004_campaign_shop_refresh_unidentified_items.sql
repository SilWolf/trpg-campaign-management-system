CREATE OR REPLACE FUNCTION
	public.refresh_campaign_shop_items_before_unidentified_item_rulebooks(
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
AS $refresh_campaign_shop_items_before_unidentified_item_rulebooks$
DECLARE
	v_shop public.campaign_shops%ROWTYPE;
	v_expected jsonb;
	v_change jsonb;
	v_source_id text;
	v_item_snapshot jsonb;
	v_item_base jsonb;
	v_item_definition jsonb;
	v_is_identified boolean;
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
			SELECT 1
			FROM jsonb_array_elements(p_expected_items) AS expected(value)
			WHERE jsonb_typeof(expected.value) IS DISTINCT FROM 'object'
				OR jsonb_typeof(expected.value -> 'id') IS DISTINCT FROM 'string'
				OR jsonb_typeof(expected.value -> 'updated_at') IS DISTINCT FROM 'string'
		)
		OR (
			SELECT count(*) <> count(DISTINCT value ->> 'id')
			FROM jsonb_array_elements(p_expected_items)
		) THEN
		RAISE EXCEPTION '刷新預覽的商品版本清單無效。'
			USING ERRCODE = '22023';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_changes) AS change(value)
		WHERE jsonb_typeof(change.value) IS DISTINCT FROM 'object'
			OR jsonb_typeof(change.value -> 'source_id') IS DISTINCT FROM 'string'
			OR (change.value ->> 'source_id') !~ '^[^:]+:[^:]+$'
			OR jsonb_typeof(change.value -> 'item_snapshot') IS DISTINCT FROM 'object'
			OR NOT public.is_valid_item_base(
				change.value #> '{item_snapshot,item_base}'
			)
			OR (
				change.value #> '{item_snapshot,is_identified}' IS NOT NULL
				AND jsonb_typeof(
					change.value #> '{item_snapshot,is_identified}'
				) IS DISTINCT FROM 'boolean'
			)
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
			RAISE EXCEPTION '商品資料已更新，請重新產生刷新預覽。'
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

		v_item_snapshot := v_change -> 'item_snapshot';
		v_item_base := v_item_snapshot -> 'item_base';
		v_is_identified := CASE
			WHEN jsonb_typeof(v_item_snapshot -> 'is_identified') = 'boolean'
				THEN (v_item_snapshot ->> 'is_identified')::boolean
			ELSE true
		END;
		v_item_definition :=
			(v_item_snapshot - 'item_base' - 'is_identified') || v_item_base;

		INSERT INTO public.campaign_shop_items (
			campaign_id, shop_id, item_snapshot, item_identified_snapshot,
			is_identified, unit_price_gp, stock_available, stock_reserved,
			requires_approval, is_active
		) VALUES (
			p_campaign_id,
			p_shop_id,
			CASE
				WHEN v_is_identified THEN v_item_definition
				ELSE public.campaign_shop_public_item_snapshot(v_item_base)
			END,
			CASE WHEN v_is_identified THEN NULL ELSE v_item_definition END,
			v_is_identified,
			(v_change ->> 'unit_price_gp')::numeric,
			(v_change ->> 'stock_available')::integer,
			0,
			false,
			true
		);
		v_created := v_created + 1;
	END LOOP;

	UPDATE public.campaign_shops
	SET updated_at = now()
	WHERE id = p_shop_id AND campaign_id = p_campaign_id;
	RETURN jsonb_build_object('created', v_created, 'deleted', v_deleted);
END
$refresh_campaign_shop_items_before_unidentified_item_rulebooks$;

REVOKE ALL ON FUNCTION
	public.refresh_campaign_shop_items_before_unidentified_item_rulebooks(
		text, text, timestamptz, jsonb, boolean, jsonb
	) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
	public.refresh_campaign_shop_items_before_unidentified_item_rulebooks(
		text, text, timestamptz, jsonb, boolean, jsonb
	) TO authenticated;
