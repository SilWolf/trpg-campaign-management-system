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
							'Weapon', 'Armor', 'Potion', 'Poison', 'Ring', 'Rod',
							'Scroll', 'Staff', 'Wand', 'WondrousItem', 'TradeGood',
							'Gemstone', 'Tool', 'AdventureGear', 'FoodAndDrink',
							'Mount', 'Vehicle', 'Misc', 'Consumable'
						)) THEN
					RETURN false;
				END IF;
			END IF;
		END LOOP;
	END LOOP;
	RETURN true;
END
$campaign_shop_refresh_policy_is_valid$;

REVOKE ALL ON FUNCTION public.campaign_shop_refresh_policy_is_valid(jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_shop_refresh_policy_is_valid(jsonb)
	TO authenticated;
