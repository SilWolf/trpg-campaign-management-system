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
	v_item record;
	v_id text := gen_random_uuid()::text;
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

	IF jsonb_typeof(p_item) <> 'object' THEN
		RAISE EXCEPTION '物品定義格式無效。'
			USING ERRCODE = '22023';
	END IF;

	SELECT *
	INTO v_item
	FROM jsonb_to_record(p_item) AS item(
		name text,
		category text,
		sub_type text,
		rarity text,
		icon text,
		damage text,
		mastery text,
		ac text,
		weight numeric,
		value_gp numeric,
		requires_attunement boolean,
		is_homebrew boolean,
		max_charges integer,
		effects text,
		flavor text,
		dm_notes text,
		is_equippable boolean,
		is_consumable boolean,
		is_important boolean,
		affixes jsonb
	);

	IF v_item.name IS NULL OR length(btrim(v_item.name)) NOT BETWEEN 1 AND 120
		OR v_item.category IS NULL
		OR v_item.category NOT IN ('Weapon', 'Armor', 'Consumable', 'Misc')
		OR v_item.rarity IS NULL
		OR v_item.rarity NOT IN ('Common', 'Uncommon', 'Rare', 'VeryRare', 'Legendary', 'Artifact')
		OR v_item.icon IS NULL OR length(btrim(v_item.icon)) NOT BETWEEN 1 AND 500
		OR v_item.weight IS NULL OR v_item.weight < 0
		OR v_item.value_gp IS NULL OR v_item.value_gp < 0
		OR v_item.requires_attunement IS NULL
		OR v_item.is_homebrew IS NULL
		OR v_item.max_charges IS NULL OR v_item.max_charges < 0
		OR v_item.mastery IS NULL
		OR v_item.mastery NOT IN ('None', 'Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex')
		OR v_item.affixes IS NULL
		OR NOT public.is_valid_blacksmith_affixes(v_item.affixes) THEN
		RAISE EXCEPTION '物品定義包含無效或不完整欄位。'
			USING ERRCODE = '22023';
	END IF;

	INSERT INTO public.inventory_items (
		id,
		campaign_id,
		owner_id,
		slot,
		name,
		category,
		sub_type,
		rarity,
		icon,
		damage,
		mastery,
		ac,
		weight,
		value_gp,
		quantity,
		equipped,
		requires_attunement,
		attuned,
		is_homebrew,
		is_identified,
		charges,
		max_charges,
		effects,
		flavor,
		dm_notes,
		player_notes,
		is_private,
		is_equippable,
		is_consumable,
		is_important,
		affixes
	)
	VALUES (
		v_id,
		p_campaign_id,
		p_owner_id,
		0,
		v_item.name,
		v_item.category,
		coalesce(v_item.sub_type, ''),
		v_item.rarity,
		v_item.icon,
		v_item.damage,
		coalesce(v_item.mastery, 'None'),
		v_item.ac,
		v_item.weight,
		v_item.value_gp,
		p_quantity,
		false,
		v_item.requires_attunement,
		false,
		v_item.is_homebrew,
		false,
		0,
		v_item.max_charges,
		coalesce(v_item.effects, ''),
		coalesce(v_item.flavor, ''),
		coalesce(v_item.dm_notes, ''),
		'',
		false,
		coalesce(v_item.is_equippable, false),
		coalesce(v_item.is_consumable, false),
		coalesce(v_item.is_important, false),
		v_item.affixes
	);

	RETURN v_id;
END
$import_blacksmith_item$;

REVOKE ALL ON FUNCTION public.import_blacksmith_item(text, text, jsonb, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_blacksmith_item(text, text, jsonb, integer)
	TO authenticated;
