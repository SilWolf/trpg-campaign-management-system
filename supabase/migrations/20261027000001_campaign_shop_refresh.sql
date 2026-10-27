ALTER TABLE public.campaign_shops
	ADD COLUMN refresh_policy jsonb NOT NULL DEFAULT
		'{"flags":{"keepItemsOnRefresh":false},"rules":[]}'::jsonb;

CREATE OR REPLACE FUNCTION public.campaign_shop_refresh_range_is_valid(
	p_range jsonb,
	p_max_limit numeric,
	p_default_max numeric
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $campaign_shop_refresh_range_is_valid$
DECLARE
	v_min numeric := 0;
	v_max numeric := p_default_max;
	v_p numeric := 1;
	v_step numeric := 1;
BEGIN
	IF jsonb_typeof(p_range) IS DISTINCT FROM 'object' THEN
		RETURN false;
	END IF;

	IF p_range ? 'min' THEN
		IF jsonb_typeof(p_range -> 'min') IS DISTINCT FROM 'number' THEN
			RETURN false;
		END IF;
		v_min := (p_range ->> 'min')::numeric;
	END IF;
	IF v_min < 0 OR v_min <> trunc(v_min) OR v_min > p_max_limit THEN
		RETURN false;
	END IF;

	IF p_range ? 'max' THEN
		IF jsonb_typeof(p_range -> 'max') = 'null' THEN
			v_max := NULL;
		ELSIF jsonb_typeof(p_range -> 'max') = 'number' THEN
			v_max := (p_range ->> 'max')::numeric;
		ELSE
			RETURN false;
		END IF;
	END IF;
	IF v_max IS NOT NULL AND (
		v_max < 0 OR v_max <> trunc(v_max) OR v_max > p_max_limit
	) THEN
		RETURN false;
	END IF;
	IF v_max IS NOT NULL AND v_min > v_max THEN
		RETURN false;
	END IF;

	IF p_range ? 'p' THEN
		IF jsonb_typeof(p_range -> 'p') IS DISTINCT FROM 'number' THEN
			RETURN false;
		END IF;
		v_p := (p_range ->> 'p')::numeric;
	END IF;
	IF v_p <= 0 OR v_p > 1 THEN
		RETURN false;
	END IF;

	IF p_range ? 'step' THEN
		IF jsonb_typeof(p_range -> 'step') IS DISTINCT FROM 'number' THEN
			RETURN false;
		END IF;
		v_step := (p_range ->> 'step')::numeric;
	END IF;
	IF v_step < 1 OR v_step <> trunc(v_step) OR v_step > p_max_limit THEN
		RETURN false;
	END IF;

	RETURN true;
END
$campaign_shop_refresh_range_is_valid$;

CREATE OR REPLACE FUNCTION public.campaign_shop_refresh_policy_is_valid(
	p_policy jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $campaign_shop_refresh_policy_is_valid$
DECLARE
	v_rule jsonb;
	v_candidate jsonb;
	v_pick_count jsonb;
	v_param jsonb;
	v_category text;
	v_rarity text;
BEGIN
	IF jsonb_typeof(p_policy) IS DISTINCT FROM 'object'
		OR jsonb_typeof(p_policy -> 'flags') IS DISTINCT FROM 'object'
		OR jsonb_typeof(p_policy #> '{flags,keepItemsOnRefresh}')
			IS DISTINCT FROM 'boolean'
		OR jsonb_typeof(p_policy -> 'rules') IS DISTINCT FROM 'array' THEN
		RETURN false;
	END IF;

	FOR v_rule IN SELECT value FROM jsonb_array_elements(p_policy -> 'rules')
	LOOP
		IF jsonb_typeof(v_rule) IS DISTINCT FROM 'object'
			OR jsonb_typeof(v_rule -> 'possibleItemsOrFilters')
				IS DISTINCT FROM 'array'
			OR NOT public.campaign_shop_refresh_range_is_valid(
				v_rule -> 'stockAvailable', 2147483647, 1
			) THEN
			RETURN false;
		END IF;

		v_pick_count := v_rule -> 'pickCount';
		IF v_pick_count IS NOT NULL
			AND jsonb_typeof(v_pick_count) <> 'null' THEN
			IF jsonb_typeof(v_pick_count) = 'number' THEN
				IF (v_pick_count #>> '{}')::numeric < 0
					OR (v_pick_count #>> '{}')::numeric
						<> trunc((v_pick_count #>> '{}')::numeric)
					OR (v_pick_count #>> '{}')::numeric > 9007199254740991 THEN
					RETURN false;
				END IF;
			ELSIF jsonb_typeof(v_pick_count) IS DISTINCT FROM 'object'
				OR NOT public.campaign_shop_refresh_range_is_valid(
					v_pick_count, 9007199254740991, NULL
				) THEN
				RETURN false;
			END IF;
		END IF;

		FOR v_candidate IN
			SELECT value
			FROM jsonb_array_elements(v_rule -> 'possibleItemsOrFilters')
		LOOP
			IF jsonb_typeof(v_candidate) IS DISTINCT FROM 'object' THEN
				RETURN false;
			END IF;

			IF v_candidate ? 'itemId' OR v_candidate ? 'catalogId' THEN
				IF jsonb_typeof(v_candidate -> 'catalogId') IS DISTINCT FROM 'string'
					OR length(btrim(v_candidate ->> 'catalogId')) = 0
					OR jsonb_typeof(v_candidate -> 'itemId') IS DISTINCT FROM 'string'
					OR length(btrim(v_candidate ->> 'itemId')) = 0
					OR jsonb_typeof(v_candidate -> 'catalogTitle') IS DISTINCT FROM 'string'
					OR jsonb_typeof(v_candidate -> 'sourceKey') IS DISTINCT FROM 'string'
					OR jsonb_typeof(v_candidate -> 'name') IS DISTINCT FROM 'string'
					OR length(btrim(v_candidate ->> 'name')) = 0
					OR jsonb_typeof(v_candidate -> 'subTypes') IS DISTINCT FROM 'array'
					OR jsonb_typeof(v_candidate -> 'icon') IS DISTINCT FROM 'string'
					OR jsonb_typeof(v_candidate -> 'weight') IS DISTINCT FROM 'number'
					OR (v_candidate ->> 'weight')::numeric < 0
					OR jsonb_typeof(v_candidate -> 'valueGp') IS DISTINCT FROM 'number'
					OR (v_candidate ->> 'valueGp')::numeric < 0
					OR jsonb_typeof(v_candidate -> 'requiresAttunement') IS DISTINCT FROM 'boolean'
					OR jsonb_typeof(v_candidate -> 'description') IS DISTINCT FROM 'string'
					OR jsonb_typeof(v_candidate -> 'source') IS DISTINCT FROM 'string'
					OR jsonb_typeof(v_candidate -> 'aliases') IS DISTINCT FROM 'array'
					OR jsonb_typeof(v_candidate -> 'searchTerms') IS DISTINCT FROM 'array'
					OR jsonb_typeof(v_candidate -> 'category') IS DISTINCT FROM 'string'
					OR jsonb_typeof(v_candidate -> 'rarity') IS DISTINCT FROM 'string' THEN
					RETURN false;
				END IF;
				v_category := v_candidate ->> 'category';
				v_rarity := v_candidate ->> 'rarity';
				IF v_category NOT IN ('Weapon', 'Armor', 'Consumable', 'Misc')
					OR v_rarity NOT IN (
						'Common', 'Uncommon', 'Rare', 'VeryRare', 'Legendary', 'Artifact'
					) THEN
					RETURN false;
				END IF;
				IF v_category = 'Armor' AND (
					NOT (v_candidate ? 'ac')
					OR jsonb_typeof(v_candidate -> 'ac') NOT IN ('string', 'null')
				) THEN
					RETURN false;
				ELSIF v_category <> 'Armor' AND (
					NOT (v_candidate ? 'damage')
					OR jsonb_typeof(v_candidate -> 'damage') NOT IN ('string', 'null')
				) THEN
					RETURN false;
				END IF;
			ELSE
				IF jsonb_typeof(v_candidate -> 'source') IS DISTINCT FROM 'string'
					OR length(btrim(v_candidate ->> 'source')) = 0
					OR jsonb_typeof(v_candidate -> 'param') IS DISTINCT FROM 'object' THEN
					RETURN false;
				END IF;
				v_param := v_candidate -> 'param';
				IF v_param ? 'search'
					AND jsonb_typeof(v_param -> 'search')
						IS DISTINCT FROM 'string' THEN
					RETURN false;
				END IF;
				IF v_param ? 'rarity'
					AND (jsonb_typeof(v_param -> 'rarity')
							IS DISTINCT FROM 'string'
						OR v_param ->> 'rarity' NOT IN (
							'Common', 'Uncommon', 'Rare', 'VeryRare',
							'Legendary', 'Artifact'
						)) THEN
					RETURN false;
				END IF;
				IF v_param ? 'category'
					AND (jsonb_typeof(v_param -> 'category')
							IS DISTINCT FROM 'string'
						OR v_param ->> 'category' NOT IN (
							'Weapon', 'Armor', 'Consumable', 'Misc'
						)) THEN
					RETURN false;
				END IF;
			END IF;
		END LOOP;
	END LOOP;
	RETURN true;
END
$campaign_shop_refresh_policy_is_valid$;

REVOKE ALL ON FUNCTION public.campaign_shop_refresh_range_is_valid(
	jsonb, numeric, numeric
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_shop_refresh_policy_is_valid(jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_shop_refresh_range_is_valid(
	jsonb, numeric, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_shop_refresh_policy_is_valid(jsonb)
	TO authenticated;

ALTER TABLE public.campaign_shops
	ADD CONSTRAINT campaign_shops_refresh_policy_valid
	CHECK (public.campaign_shop_refresh_policy_is_valid(refresh_policy));

GRANT INSERT (refresh_policy)
	ON public.campaign_shops TO authenticated;
GRANT UPDATE (refresh_policy)
	ON public.campaign_shops TO authenticated;

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
	v_catalog_id text;
	v_item_id text;
	v_expected_updated_at timestamptz;
	v_actual_updated_at timestamptz;
	v_expected_count integer;
	v_current_count integer;
	v_source_matches integer;
	v_created integer := 0;
	v_restocked integer := 0;
	v_retired integer := 0;
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

	SELECT shop.*
	INTO v_shop
	FROM public.campaign_shops AS shop
	WHERE shop.id = p_shop_id
		AND shop.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店不存在或不屬於此戰役。' USING ERRCODE = '22023';
	END IF;
	IF v_shop.updated_at IS DISTINCT FROM p_expected_shop_updated_at THEN
		RAISE EXCEPTION '商店資料已更新，請重新載入並產生刷新預覽。'
			USING ERRCODE = '40001';
	END IF;
	IF v_shop.refresh_policy #>> '{flags,keepItemsOnRefresh}'
		IS DISTINCT FROM p_keep_items::text THEN
		RAISE EXCEPTION '刷新預覽與目前儲存的刷新政策不一致。'
			USING ERRCODE = '40001';
	END IF;

	IF jsonb_array_length(p_expected_items) > 2147483647
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(p_expected_items) AS expected(value)
			WHERE jsonb_typeof(expected.value) IS DISTINCT FROM 'object'
				OR jsonb_typeof(expected.value -> 'id') IS DISTINCT FROM 'string'
				OR length(btrim(expected.value ->> 'id')) = 0
				OR jsonb_typeof(expected.value -> 'updated_at') IS DISTINCT FROM 'string'
				OR length(btrim(expected.value ->> 'updated_at')) = 0
		)
		OR (
			SELECT count(*) <> count(DISTINCT value ->> 'id')
			FROM jsonb_array_elements(p_expected_items)
		) THEN
		RAISE EXCEPTION '刷新預覽的商品版本清單無效。' USING ERRCODE = '22023';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_changes) AS change(value)
		WHERE jsonb_typeof(change.value) IS DISTINCT FROM 'object'
			OR jsonb_typeof(change.value -> 'source_id') IS DISTINCT FROM 'string'
			OR (change.value ->> 'source_id') !~ '^[^:]+:[^:]+$'
			OR jsonb_typeof(change.value -> 'item_snapshot')
				IS DISTINCT FROM 'object'
			OR NOT (change.value -> 'item_snapshot' ?& ARRAY[
				'name', 'category', 'sub_type', 'rarity', 'icon', 'damage',
				'mastery', 'ac', 'weight', 'value_gp', 'requires_attunement',
				'is_homebrew', 'max_charges', 'effects', 'flavor', 'dm_notes',
				'is_equippable', 'is_consumable', 'is_important', 'affixes'
			])
			OR jsonb_typeof(change.value #> '{item_snapshot,name}') IS DISTINCT FROM 'string'
			OR length(btrim(change.value #>> '{item_snapshot,name}')) NOT BETWEEN 1 AND 120
			OR jsonb_typeof(change.value #> '{item_snapshot,category}') IS DISTINCT FROM 'string'
			OR change.value #>> '{item_snapshot,category}'
				NOT IN ('Weapon', 'Armor', 'Consumable', 'Misc')
			OR jsonb_typeof(change.value #> '{item_snapshot,rarity}') IS DISTINCT FROM 'string'
			OR change.value #>> '{item_snapshot,rarity}' NOT IN (
				'Common', 'Uncommon', 'Rare', 'VeryRare', 'Legendary', 'Artifact'
			)
			OR jsonb_typeof(change.value #> '{item_snapshot,icon}') IS DISTINCT FROM 'string'
			OR length(btrim(change.value #>> '{item_snapshot,icon}')) NOT BETWEEN 1 AND 500
			OR jsonb_typeof(change.value #> '{item_snapshot,sub_type}') IS DISTINCT FROM 'string'
			OR jsonb_typeof(change.value #> '{item_snapshot,damage}')
				NOT IN ('string', 'null')
			OR jsonb_typeof(change.value #> '{item_snapshot,mastery}') IS DISTINCT FROM 'string'
			OR jsonb_typeof(change.value #> '{item_snapshot,ac}')
				NOT IN ('string', 'null')
			OR jsonb_typeof(change.value #> '{item_snapshot,weight}') IS DISTINCT FROM 'number'
			OR (change.value #>> '{item_snapshot,weight}')::numeric < 0
			OR jsonb_typeof(change.value #> '{item_snapshot,value_gp}') IS DISTINCT FROM 'number'
			OR (change.value #>> '{item_snapshot,value_gp}')::numeric < 0
			OR jsonb_typeof(change.value #> '{item_snapshot,requires_attunement}')
				IS DISTINCT FROM 'boolean'
			OR jsonb_typeof(change.value #> '{item_snapshot,is_homebrew}')
				IS DISTINCT FROM 'boolean'
			OR jsonb_typeof(change.value #> '{item_snapshot,max_charges}') IS DISTINCT FROM 'number'
			OR (change.value #>> '{item_snapshot,max_charges}') !~ '^(0|[1-9][0-9]{0,9})$'
			OR (change.value #>> '{item_snapshot,max_charges}')::numeric > 2147483647
			OR jsonb_typeof(change.value #> '{item_snapshot,effects}') IS DISTINCT FROM 'string'
			OR jsonb_typeof(change.value #> '{item_snapshot,flavor}') IS DISTINCT FROM 'string'
			OR jsonb_typeof(change.value #> '{item_snapshot,dm_notes}') IS DISTINCT FROM 'string'
			OR jsonb_typeof(change.value #> '{item_snapshot,is_equippable}')
				IS DISTINCT FROM 'boolean'
			OR jsonb_typeof(change.value #> '{item_snapshot,is_consumable}')
				IS DISTINCT FROM 'boolean'
			OR jsonb_typeof(change.value #> '{item_snapshot,is_important}')
				IS DISTINCT FROM 'boolean'
			OR jsonb_typeof(change.value #> '{item_snapshot,affixes}') IS DISTINCT FROM 'array'
			OR jsonb_typeof(change.value -> 'unit_price_gp') IS DISTINCT FROM 'number'
			OR (change.value ->> 'unit_price_gp')
				!~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
			OR (change.value ->> 'unit_price_gp')::numeric <= 0
			OR (change.value ->> 'unit_price_gp')::numeric >= 10000000000
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
	WHERE item.campaign_id = p_campaign_id
		AND item.shop_id = p_shop_id
	ORDER BY item.id
	FOR UPDATE;
	GET DIAGNOSTICS v_current_count = ROW_COUNT;
	SELECT jsonb_array_length(p_expected_items) INTO v_expected_count;
	IF v_current_count <> v_expected_count THEN
		RAISE EXCEPTION '商品清單已更新，請重新載入並產生刷新預覽。'
			USING ERRCODE = '40001';
	END IF;

	FOR v_expected IN
		SELECT value FROM jsonb_array_elements(p_expected_items)
	LOOP
		BEGIN
			v_expected_updated_at := (v_expected ->> 'updated_at')::timestamptz;
		EXCEPTION
			WHEN invalid_datetime_format OR datetime_field_overflow THEN
			RAISE EXCEPTION '刷新預覽包含無效的商品版本時間。'
				USING ERRCODE = '22023';
		END;
		SELECT item.updated_at
		INTO v_actual_updated_at
		FROM public.campaign_shop_items AS item
		WHERE item.id = v_expected ->> 'id'
			AND item.campaign_id = p_campaign_id
			AND item.shop_id = p_shop_id;
		IF NOT FOUND OR v_actual_updated_at IS DISTINCT FROM v_expected_updated_at THEN
			RAISE EXCEPTION '商品資料已更新，請重新載入並產生刷新預覽。'
				USING ERRCODE = '40001';
		END IF;
	END LOOP;

	IF NOT p_keep_items THEN
		UPDATE public.campaign_shop_items
		SET is_active = false,
			stock_available = 0
		WHERE campaign_id = p_campaign_id
			AND shop_id = p_shop_id
			AND (is_active OR stock_available <> 0);
		GET DIAGNOSTICS v_retired = ROW_COUNT;
	END IF;

	FOR v_change IN
		SELECT value FROM jsonb_array_elements(p_changes)
	LOOP
		v_catalog_id := split_part(v_change ->> 'source_id', ':', 1);
		v_item_id := split_part(v_change ->> 'source_id', ':', 2);
		IF NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements(v_shop.refresh_policy -> 'rules') AS rule(value)
			CROSS JOIN jsonb_array_elements(
				rule.value -> 'possibleItemsOrFilters'
			) AS candidate(value)
			WHERE (
				candidate.value ->> 'catalogId' = v_catalog_id
				AND candidate.value ->> 'itemId' = v_item_id
			) OR (
				candidate.value ->> 'source' = v_catalog_id
				AND jsonb_typeof(candidate.value -> 'param') = 'object'
			)
		) THEN
			RAISE EXCEPTION '刷新預覽包含不在目前政策來源中的目錄商品。'
				USING ERRCODE = '22023';
		END IF;

		IF p_keep_items THEN
			SELECT count(*)
			INTO v_source_matches
			FROM public.campaign_shop_items AS item
			WHERE item.campaign_id = p_campaign_id
				AND item.shop_id = p_shop_id
				AND item.source_type = 'catalog'
				AND item.source_id = v_change ->> 'source_id';
			IF v_source_matches > 1 THEN
				RAISE EXCEPTION '商店內存在重複的目錄來源商品，無法安全補貨。'
					USING ERRCODE = '23514';
			END IF;
			IF v_source_matches = 1 THEN
				UPDATE public.campaign_shop_items
				SET stock_available = (v_change ->> 'stock_available')::integer,
					is_active = true
				WHERE campaign_id = p_campaign_id
					AND shop_id = p_shop_id
					AND source_type = 'catalog'
					AND source_id = v_change ->> 'source_id';
				v_restocked := v_restocked + 1;
				CONTINUE;
			END IF;
		END IF;

		INSERT INTO public.campaign_shop_items (
			campaign_id,
			shop_id,
			item_snapshot,
			source_type,
			source_id,
			unit_price_gp,
			stock_available,
			stock_reserved,
			requires_approval,
			is_active
		) VALUES (
			p_campaign_id,
			p_shop_id,
			v_change -> 'item_snapshot',
			'catalog',
			v_change ->> 'source_id',
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
	WHERE id = p_shop_id
		AND campaign_id = p_campaign_id;

	RETURN jsonb_build_object(
		'created', v_created,
		'restocked', v_restocked,
		'retired', v_retired
	);
END
$refresh_campaign_shop_items$;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) TO authenticated;
