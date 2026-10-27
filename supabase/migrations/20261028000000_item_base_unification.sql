ALTER TABLE public.inventory_items
	ADD COLUMN item_base jsonb;

ALTER TABLE public.blacksmith_items
	ADD COLUMN item_base jsonb;

DO $category_constraints$
DECLARE
	v_table regclass;
	v_constraint record;
BEGIN
	FOREACH v_table IN ARRAY ARRAY[
		'public.inventory_items'::regclass,
		'public.blacksmith_items'::regclass
	]
	LOOP
		FOR v_constraint IN
			SELECT constraint_row.conname
			FROM pg_constraint AS constraint_row
			WHERE constraint_row.conrelid = v_table
				AND constraint_row.contype = 'c'
				AND pg_get_constraintdef(constraint_row.oid) ILIKE '%category%'
				AND pg_get_constraintdef(constraint_row.oid) ILIKE '%Consumable%'
		LOOP
			EXECUTE format(
				'ALTER TABLE %s DROP CONSTRAINT %I',
				v_table,
				v_constraint.conname
			);
		END LOOP;
		EXECUTE format(
			'ALTER TABLE %s ADD CONSTRAINT %I CHECK (category IN (
				''Weapon'', ''Armor'', ''Potion'', ''Poison'', ''Ring'', ''Rod'',
				''Scroll'', ''Staff'', ''Wand'', ''WondrousItem'', ''TradeGood'',
				''Gemstone'', ''Tool'', ''AdventureGear'', ''FoodAndDrink'',
				''Mount'', ''Vehicle'', ''Misc'', ''Consumable''
			))',
			v_table,
			CASE
				WHEN v_table = 'public.inventory_items'::regclass
					THEN 'inventory_items_category_item_base_check'
				ELSE 'blacksmith_items_category_item_base_check'
			END
		);
	END LOOP;
END
$category_constraints$;

ALTER TABLE public.inventory_items
	ADD CONSTRAINT inventory_items_item_base_object_check
	CHECK (item_base IS NULL OR jsonb_typeof(item_base) = 'object');

ALTER TABLE public.blacksmith_items
	ADD CONSTRAINT blacksmith_items_item_base_object_check
	CHECK (item_base IS NULL OR jsonb_typeof(item_base) = 'object');

CREATE OR REPLACE FUNCTION public.populate_legacy_item_base()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $populate_legacy_item_base$
DECLARE
	v_category text;
	v_properties jsonb;
BEGIN
	IF NEW.item_base IS NOT NULL THEN
		RETURN NEW;
	END IF;

	v_category := CASE
		WHEN NEW.category = 'Consumable' THEN 'AdventureGear'
		ELSE NEW.category
	END;
	NEW.item_base := jsonb_build_object(
		'name', NEW.name,
		'category', v_category,
		'subTypes', CASE
			WHEN COALESCE(NEW.sub_type, '') = '' THEN '[]'::jsonb
			ELSE jsonb_build_array(NEW.sub_type)
		END,
		'rarity', NEW.rarity,
		'icon', NEW.icon,
		'weight', NEW.weight,
		'valueGp', NEW.value_gp,
		'affixes', COALESCE(NEW.affixes, '[]'::jsonb),
		'effects', COALESCE(NEW.effects, ''),
		'flavor', COALESCE(NEW.flavor, ''),
		'dmNotes', COALESCE(NEW.dm_notes, ''),
		'maxCharges', NEW.max_charges,
		'isEquippable', NEW.is_equippable,
		'isConsumable', NEW.is_consumable,
		'isRequireAttunement', NEW.requires_attunement
	);

	IF v_category = 'Weapon' THEN
		v_properties := jsonb_build_object(
			'damage', COALESCE(NEW.damage, ''),
			'properties', '[]'::jsonb
		);
		IF NEW.mastery IS NOT NULL AND NEW.mastery <> 'None' THEN
			v_properties := v_properties || jsonb_build_object('mastery', NEW.mastery);
		END IF;
		NEW.item_base := NEW.item_base || jsonb_build_object(
			'weaponProperties', v_properties
		);
	ELSIF v_category = 'Armor' THEN
		NEW.item_base := NEW.item_base || jsonb_build_object(
			'armorProperties',
			jsonb_build_object('ac', COALESCE(NEW.ac, ''))
		);
	END IF;
	RETURN NEW;
END
$populate_legacy_item_base$;

CREATE TRIGGER inventory_items_populate_item_base
	BEFORE INSERT OR UPDATE OF item_base ON public.inventory_items
	FOR EACH ROW EXECUTE FUNCTION public.populate_legacy_item_base();

CREATE TRIGGER blacksmith_items_populate_item_base
	BEFORE INSERT OR UPDATE OF item_base ON public.blacksmith_items
	FOR EACH ROW EXECUTE FUNCTION public.populate_legacy_item_base();

CREATE OR REPLACE FUNCTION public.is_valid_item_base(p_item_base jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $is_valid_item_base$
DECLARE
	v_sub_type jsonb;
	v_weapon_property jsonb;
	v_category text;
	v_properties jsonb;
	v_weight numeric;
	v_value_gp numeric;
	v_max_charges numeric;
BEGIN
	IF jsonb_typeof(p_item_base) IS DISTINCT FROM 'object'
		OR jsonb_typeof(p_item_base -> 'name') IS DISTINCT FROM 'string'
		OR length(btrim(p_item_base ->> 'name')) NOT BETWEEN 1 AND 120
		OR jsonb_typeof(p_item_base -> 'category') IS DISTINCT FROM 'string'
		OR p_item_base ->> 'category' NOT IN (
			'Weapon', 'Armor', 'Potion', 'Poison', 'Ring', 'Rod', 'Scroll',
			'Staff', 'Wand', 'WondrousItem', 'TradeGood', 'Gemstone', 'Tool',
			'AdventureGear', 'FoodAndDrink', 'Mount', 'Vehicle', 'Misc'
		)
		OR jsonb_typeof(p_item_base -> 'subTypes') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_item_base -> 'rarity') IS DISTINCT FROM 'string'
		OR p_item_base ->> 'rarity' NOT IN (
			'Common', 'Uncommon', 'Rare', 'VeryRare', 'Legendary', 'Artifact'
		)
		OR jsonb_typeof(p_item_base -> 'weight') IS DISTINCT FROM 'number'
		OR jsonb_typeof(p_item_base -> 'valueGp') IS DISTINCT FROM 'number'
		OR jsonb_typeof(p_item_base -> 'affixes') IS DISTINCT FROM 'array'
		OR NOT public.is_valid_blacksmith_affixes(p_item_base -> 'affixes')
		OR jsonb_typeof(p_item_base -> 'effects') IS DISTINCT FROM 'string'
		OR jsonb_typeof(p_item_base -> 'dmNotes') IS DISTINCT FROM 'string'
		OR jsonb_typeof(p_item_base -> 'isEquippable') IS DISTINCT FROM 'boolean'
		OR jsonb_typeof(p_item_base -> 'isConsumable') IS DISTINCT FROM 'boolean'
		OR jsonb_typeof(p_item_base -> 'isRequireAttunement')
			IS DISTINCT FROM 'boolean'
		OR (
			p_item_base ? 'icon'
			AND jsonb_typeof(p_item_base -> 'icon') NOT IN ('string', 'null')
		)
		OR (
			jsonb_typeof(p_item_base -> 'icon') = 'string'
			AND length(btrim(p_item_base ->> 'icon')) NOT BETWEEN 1 AND 500
		)
		OR (
			p_item_base ? 'flavor'
			AND jsonb_typeof(p_item_base -> 'flavor') NOT IN ('string', 'null')
		)
		OR (
			p_item_base ? 'maxCharges'
			AND jsonb_typeof(p_item_base -> 'maxCharges') NOT IN ('number', 'null')
		) THEN
		RETURN false;
	END IF;

	v_weight := (p_item_base ->> 'weight')::numeric;
	v_value_gp := (p_item_base ->> 'valueGp')::numeric;
	IF v_weight < 0 OR v_value_gp < 0
		OR v_weight::text IN ('NaN', 'Infinity', '-Infinity')
		OR v_value_gp::text IN ('NaN', 'Infinity', '-Infinity') THEN
		RETURN false;
	END IF;
	IF jsonb_typeof(p_item_base -> 'maxCharges') = 'number' THEN
		v_max_charges := (p_item_base ->> 'maxCharges')::numeric;
		IF v_max_charges < 0
			OR v_max_charges <> trunc(v_max_charges)
			OR v_max_charges > 2147483647 THEN
			RETURN false;
		END IF;
	END IF;

	FOR v_sub_type IN SELECT value FROM jsonb_array_elements(p_item_base -> 'subTypes')
	LOOP
		IF jsonb_typeof(v_sub_type) IS DISTINCT FROM 'string'
			OR length(v_sub_type #>> '{}') > 120 THEN
			RETURN false;
		END IF;
	END LOOP;

	v_category := p_item_base ->> 'category';
	IF v_category = 'Weapon' THEN
		v_properties := p_item_base -> 'weaponProperties';
		IF jsonb_typeof(v_properties) IS DISTINCT FROM 'object'
			OR jsonb_typeof(v_properties -> 'damage') IS DISTINCT FROM 'string'
			OR length(btrim(v_properties ->> 'damage')) = 0
			OR jsonb_typeof(v_properties -> 'properties') IS DISTINCT FROM 'array' THEN
			RETURN false;
		END IF;
		FOR v_weapon_property IN
			SELECT value FROM jsonb_array_elements(v_properties -> 'properties')
		LOOP
			IF jsonb_typeof(v_weapon_property) IS DISTINCT FROM 'string' THEN
				RETURN false;
			END IF;
		END LOOP;
		IF v_properties ? 'mastery'
			AND (
				jsonb_typeof(v_properties -> 'mastery')
					IS DISTINCT FROM 'string'
				OR v_properties ->> 'mastery' NOT IN (
					'Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow',
					'Topple', 'Vex'
				)
			) THEN
			RETURN false;
		END IF;
	ELSIF v_category = 'Armor' THEN
		v_properties := p_item_base -> 'armorProperties';
		IF jsonb_typeof(v_properties) IS DISTINCT FROM 'object'
			OR jsonb_typeof(v_properties -> 'ac') IS DISTINCT FROM 'string'
			OR length(btrim(v_properties ->> 'ac')) = 0 THEN
			RETURN false;
		END IF;
	END IF;
	RETURN true;
END
$is_valid_item_base$;

REVOKE ALL ON FUNCTION public.is_valid_item_base(jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_item_base(jsonb)
	TO service_role;

CREATE OR REPLACE FUNCTION public.create_campaign_from_seed(
	p_name text,
	p_user_id uuid,
	p_seed jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $create_campaign$
DECLARE
	v_campaign_id text;
	v_invite_code text;
	v_character_id_map jsonb := '{}'::jsonb;
	v_character jsonb;
	v_item jsonb;
	v_new_character_id text;
	v_new_item_id text;
	v_item_owner_id text;
	v_camp_chest_currency jsonb;
BEGIN
	IF p_user_id IS NULL OR NOT EXISTS (
		SELECT 1 FROM auth.users AS user_row WHERE user_row.id = p_user_id
	) THEN
		RAISE EXCEPTION '建立者帳號不存在。' USING ERRCODE = '42501';
	END IF;
	IF NULLIF(btrim(p_name), '') IS NULL THEN
		RAISE EXCEPTION '戰役名稱不可空白。' USING ERRCODE = '22023';
	END IF;
	IF jsonb_typeof(p_seed) IS DISTINCT FROM 'object'
		OR jsonb_typeof(p_seed -> 'characters') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_seed -> 'items') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_seed -> 'camp_chest_currency') IS DISTINCT FROM 'object' THEN
		RAISE EXCEPTION '範例戰役資料格式無效。' USING ERRCODE = '22023';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_seed -> 'characters') AS character_row(value)
		WHERE character_row.value ->> 'id' IS NULL
			OR character_row.value ->> 'id' = 'camp-chest'
	) THEN
		RAISE EXCEPTION '範例戰役不得將 camp-chest 建立為角色。'
			USING ERRCODE = '22023';
	END IF;
	v_camp_chest_currency := p_seed -> 'camp_chest_currency';
	IF NOT (v_camp_chest_currency ?& ARRAY['pp', 'gp', 'ep', 'sp', 'cp']) THEN
		RAISE EXCEPTION '營地儲物箱貨幣資料不完整。' USING ERRCODE = '22023';
	END IF;

	v_campaign_id := gen_random_uuid()::text;
	LOOP
		v_invite_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
		EXIT WHEN NOT EXISTS (
			SELECT 1 FROM public.campaigns AS campaign
			WHERE campaign.invite_code = v_invite_code
		);
	END LOOP;
	INSERT INTO public.campaigns (
		id, name, dm_id, invite_code, max_characters_per_player,
		camp_chest_currency
	)
	VALUES (v_campaign_id, btrim(p_name), p_user_id::text, v_invite_code, 1,
		v_camp_chest_currency);
	INSERT INTO public.campaign_members (campaign_id, user_id, role)
	VALUES (v_campaign_id, p_user_id, 'dm');

	FOR v_character IN
		SELECT value FROM jsonb_array_elements(p_seed -> 'characters')
	LOOP
		IF v_character_id_map ? (v_character ->> 'id') THEN
			RAISE EXCEPTION '範例角色識別碼重複。' USING ERRCODE = '22023';
		END IF;
		v_new_character_id := gen_random_uuid()::text;
		INSERT INTO public.characters (
			id, name, title, avatar, str, user_id, campaign_id,
			currencies, private_currencies
		)
		VALUES (
			v_new_character_id, v_character ->> 'name',
			COALESCE(v_character ->> 'title', ''),
			COALESCE(v_character ->> 'avatar', ''),
			COALESCE((v_character ->> 'str')::integer, 10), p_user_id::text,
			v_campaign_id,
			COALESCE(v_character -> 'currencies',
				'{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'::jsonb),
			COALESCE(v_character -> 'private_currencies',
				'{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'::jsonb)
		);
		v_character_id_map := v_character_id_map
			|| jsonb_build_object(v_character ->> 'id', v_new_character_id);
	END LOOP;

	FOR v_item IN SELECT value FROM jsonb_array_elements(p_seed -> 'items')
	LOOP
		IF v_item ? 'item_base'
			AND NOT public.is_valid_item_base(v_item -> 'item_base') THEN
			RAISE EXCEPTION '範例物品的 item_base 格式無效。'
				USING ERRCODE = '22023';
		END IF;
		IF v_item ->> 'owner_id' = 'camp-chest' THEN
			v_item_owner_id := 'camp-chest';
			IF COALESCE((v_item ->> 'is_private')::boolean, false) THEN
				RAISE EXCEPTION '營地儲物箱物品不可設為私人。'
					USING ERRCODE = '22023';
			END IF;
		ELSE
			v_item_owner_id := v_character_id_map ->> (v_item ->> 'owner_id');
			IF v_item_owner_id IS NULL THEN
				RAISE EXCEPTION '範例物品擁有人不在範例角色清單中。'
					USING ERRCODE = '22023';
			END IF;
		END IF;

		v_new_item_id := gen_random_uuid()::text;
		INSERT INTO public.inventory_items (
			id, owner_id, slot, name, category, sub_type, rarity, icon,
			damage, mastery, ac, weight, value_gp, quantity, equipped,
			requires_attunement, attuned, is_homebrew, is_identified,
			charges, max_charges, effects, flavor, dm_notes, player_notes,
			is_private, is_equippable, is_consumable, is_important, affixes,
			campaign_id, item_base
		)
		VALUES (
			v_new_item_id, v_item_owner_id,
			COALESCE((v_item ->> 'slot')::integer, 0), v_item ->> 'name',
			v_item ->> 'category', COALESCE(v_item ->> 'sub_type', ''),
			COALESCE(v_item ->> 'rarity', 'Common'),
			COALESCE(v_item ->> 'icon', 'Package'), v_item ->> 'damage',
			COALESCE(v_item ->> 'mastery', 'None'), v_item ->> 'ac',
			COALESCE((v_item ->> 'weight')::numeric, 0),
			COALESCE((v_item ->> 'value_gp')::numeric, 0),
			COALESCE((v_item ->> 'quantity')::integer, 1),
			COALESCE((v_item ->> 'equipped')::boolean, false),
			COALESCE((v_item ->> 'requires_attunement')::boolean, false),
			COALESCE((v_item ->> 'attuned')::boolean, false),
			COALESCE((v_item ->> 'is_homebrew')::boolean, false),
			COALESCE((v_item ->> 'is_identified')::boolean, true),
			COALESCE((v_item ->> 'charges')::integer, 0),
			COALESCE((v_item ->> 'max_charges')::integer, 0),
			COALESCE(v_item ->> 'effects', ''),
			COALESCE(v_item ->> 'flavor', ''),
			COALESCE(v_item ->> 'dm_notes', ''),
			COALESCE(v_item ->> 'player_notes', ''),
			COALESCE((v_item ->> 'is_private')::boolean, false),
			COALESCE((v_item ->> 'is_equippable')::boolean, false),
			COALESCE((v_item ->> 'is_consumable')::boolean, false),
			COALESCE((v_item ->> 'is_important')::boolean, false),
			COALESCE(v_item -> 'affixes', '[]'::jsonb), v_campaign_id,
			v_item -> 'item_base'
		);
	END LOOP;

	RETURN jsonb_build_object(
		'campaign_id', v_campaign_id,
		'invite_code', v_invite_code,
		'character_id_map', v_character_id_map
	);
END
$create_campaign$;

REVOKE ALL ON FUNCTION public.create_campaign_from_seed(text, uuid, jsonb)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_campaign_from_seed(text, uuid, jsonb)
	TO service_role;

CREATE OR REPLACE FUNCTION public.import_blacksmith_item(
	p_campaign_id text,
	p_owner_id text,
	p_item jsonb,
	p_quantity integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $import_blacksmith_item$
DECLARE
	v_base jsonb := p_item -> 'item_base';
	v_item record;
	v_category_legacy text;
	v_id text := gen_random_uuid()::text;
	v_is_homebrew boolean;
	v_is_important boolean;
	v_mastery text;
	v_damage text;
	v_ac text;
	v_sub_type text;
BEGIN
	IF auth.uid() IS NULL THEN
		RAISE EXCEPTION '匯入戰役需要有效的登入帳號。'
			USING ERRCODE = '42501';
	END IF;
	IF p_campaign_id IS NULL OR NOT public.is_campaign_dm(p_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役的 DM 可以匯入物品。'
			USING ERRCODE = '42501';
	END IF;
	IF p_owner_id IS NULL OR (
		p_owner_id <> 'camp-chest'
		AND NOT EXISTS (
			SELECT 1
			FROM public.characters AS character
			WHERE character.id = p_owner_id
				AND character.campaign_id = p_campaign_id
		)
	) THEN
		RAISE EXCEPTION '接收角色不存在或不屬於指定戰役。'
			USING ERRCODE = '22023';
	END IF;
	IF p_quantity IS NULL OR p_quantity < 1 THEN
		RAISE EXCEPTION '物品數量必須是大於或等於 1 的整數。'
			USING ERRCODE = '22023';
	END IF;
	IF jsonb_typeof(p_item) IS DISTINCT FROM 'object'
		OR jsonb_typeof(v_base) IS DISTINCT FROM 'object'
		OR jsonb_typeof(p_item -> 'is_homebrew') IS DISTINCT FROM 'boolean'
		OR jsonb_typeof(p_item -> 'is_important') IS DISTINCT FROM 'boolean' THEN
		RAISE EXCEPTION '物品定義格式無效。' USING ERRCODE = '22023';
	END IF;

	SELECT *
	INTO v_item
	FROM jsonb_to_record(v_base) AS item(
		name text,
		category text,
		"subTypes" jsonb,
		rarity text,
		icon text,
		weight numeric,
		"valueGp" numeric,
		affixes jsonb,
		effects text,
		flavor text,
		"dmNotes" text,
		"maxCharges" integer,
		"isEquippable" boolean,
		"isConsumable" boolean,
		"isRequireAttunement" boolean,
		"weaponProperties" jsonb,
		"armorProperties" jsonb
	);
	v_is_homebrew := (p_item ->> 'is_homebrew')::boolean;
	v_is_important := (p_item ->> 'is_important')::boolean;

	IF v_item.name IS NULL OR length(btrim(v_item.name)) NOT BETWEEN 1 AND 120
		OR v_item.category IS NULL
		OR v_item.category NOT IN (
			'Weapon', 'Armor', 'Potion', 'Poison', 'Ring', 'Rod', 'Scroll',
			'Staff', 'Wand', 'WondrousItem', 'TradeGood', 'Gemstone', 'Tool',
			'AdventureGear', 'FoodAndDrink', 'Mount', 'Vehicle', 'Misc'
		)
		OR jsonb_typeof(v_base -> 'subTypes') IS DISTINCT FROM 'array'
		OR EXISTS (
			SELECT 1
			FROM jsonb_array_elements(v_base -> 'subTypes') AS sub_type(value)
			WHERE jsonb_typeof(sub_type.value) IS DISTINCT FROM 'string'
				OR length(sub_type.value #>> '{}') > 120
		)
		OR v_item.rarity IS NULL
		OR v_item.rarity NOT IN (
			'Common', 'Uncommon', 'Rare', 'VeryRare', 'Legendary', 'Artifact'
		)
		OR v_item.weight IS NULL OR v_item.weight < 0
		OR v_item.weight::text IN ('NaN', 'Infinity', '-Infinity')
		OR v_item."valueGp" IS NULL OR v_item."valueGp" < 0
		OR v_item."valueGp"::text IN ('NaN', 'Infinity', '-Infinity')
		OR (
			v_base ? 'icon'
			AND jsonb_typeof(v_base -> 'icon') NOT IN ('string', 'null')
		)
		OR (
			jsonb_typeof(v_base -> 'icon') = 'string'
			AND length(btrim(v_base ->> 'icon')) NOT BETWEEN 1 AND 500
		)
		OR jsonb_typeof(v_base -> 'effects') IS DISTINCT FROM 'string'
		OR jsonb_typeof(v_base -> 'dmNotes') IS DISTINCT FROM 'string'
		OR (
			v_base ? 'flavor'
			AND jsonb_typeof(v_base -> 'flavor') NOT IN ('string', 'null')
		)
		OR (
			v_base ? 'maxCharges'
			AND jsonb_typeof(v_base -> 'maxCharges') NOT IN ('number', 'null')
		)
		OR v_item."isEquippable" IS NULL
		OR v_item."isConsumable" IS NULL
		OR v_item."isRequireAttunement" IS NULL
		OR v_item.affixes IS NULL
		OR NOT public.is_valid_blacksmith_affixes(v_item.affixes)
		OR v_item."maxCharges" IS NOT NULL AND v_item."maxCharges" < 0 THEN
		RAISE EXCEPTION '物品定義包含無效或不完整欄位。'
			USING ERRCODE = '22023';
	END IF;

	IF v_item.category = 'Weapon' THEN
		IF jsonb_typeof(v_item."weaponProperties") IS DISTINCT FROM 'object'
			OR jsonb_typeof(v_item."weaponProperties" -> 'damage')
				IS DISTINCT FROM 'string'
			OR length(btrim(v_item."weaponProperties" ->> 'damage')) = 0
			OR jsonb_typeof(v_item."weaponProperties" -> 'properties')
				IS DISTINCT FROM 'array'
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(
					v_item."weaponProperties" -> 'properties'
				) AS weapon_property(value)
				WHERE jsonb_typeof(weapon_property.value) IS DISTINCT FROM 'string'
			)
			OR (
				v_item."weaponProperties" ? 'mastery'
				AND (
					jsonb_typeof(v_item."weaponProperties" -> 'mastery')
						IS DISTINCT FROM 'string'
					OR v_item."weaponProperties" ->> 'mastery' NOT IN (
						'Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow',
						'Topple', 'Vex'
					)
				)
			) THEN
			RAISE EXCEPTION '武器必須包含有效的傷害、特性與精通欄位。'
				USING ERRCODE = '22023';
		END IF;
		v_damage := v_item."weaponProperties" ->> 'damage';
		v_mastery := COALESCE(v_item."weaponProperties" ->> 'mastery', 'None');
	ELSIF v_item.category = 'Armor' THEN
		IF jsonb_typeof(v_item."armorProperties") IS DISTINCT FROM 'object'
			OR jsonb_typeof(v_item."armorProperties" -> 'ac') IS DISTINCT FROM 'string'
			OR length(btrim(v_item."armorProperties" ->> 'ac')) = 0 THEN
			RAISE EXCEPTION '護甲必須包含有效的護甲值。'
				USING ERRCODE = '22023';
		END IF;
		v_ac := v_item."armorProperties" ->> 'ac';
	END IF;

	v_sub_type := COALESCE(v_item."subTypes" ->> 0, '');
	v_category_legacy := CASE
		WHEN v_item.category IN ('Weapon', 'Armor') THEN v_item.category
		WHEN v_item."isConsumable" THEN 'Consumable'
		ELSE 'Misc'
	END;

	INSERT INTO public.inventory_items (
		id, campaign_id, owner_id, slot, name, category, sub_type, rarity, icon,
		damage, mastery, ac, weight, value_gp, quantity, equipped,
		requires_attunement, attuned, is_homebrew, is_identified, charges,
		max_charges, effects, flavor, dm_notes, player_notes, is_private,
		is_equippable, is_consumable, is_important, affixes, item_base
	)
	VALUES (
		v_id, p_campaign_id, p_owner_id, 0,
		v_item.name, v_category_legacy, v_sub_type, v_item.rarity,
		COALESCE(v_item.icon, 'Package'), v_damage, COALESCE(v_mastery, 'None'),
		v_ac, v_item.weight, v_item."valueGp", p_quantity, false,
		v_item."isRequireAttunement", false, v_is_homebrew, false, 0,
		COALESCE(v_item."maxCharges", 0), COALESCE(v_item.effects, ''),
		COALESCE(v_item.flavor, ''), COALESCE(v_item."dmNotes", ''), '',
		false, v_item."isEquippable", v_item."isConsumable", v_is_important,
		v_item.affixes, v_base
	);
	RETURN v_id;
END
$import_blacksmith_item$;

REVOKE ALL ON FUNCTION public.import_blacksmith_item(text, text, jsonb, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_blacksmith_item(text, text, jsonb, integer)
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
		false, 0,
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
