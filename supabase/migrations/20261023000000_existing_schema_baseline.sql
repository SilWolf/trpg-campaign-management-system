-- 驗證保留中的應用程式 Schema，記錄基線但不重建既有資料表。
DO $migration_preflight$
DECLARE
	required_columns text[][] := ARRAY[
		ARRAY['campaigns', 'id', 'text'],
		ARRAY['campaigns', 'name', 'text'],
		ARRAY['campaigns', 'dm_id', 'text'],
		ARRAY['campaigns', 'invite_code', 'text'],
		ARRAY['campaigns', 'max_characters_per_player', 'integer'],
		ARRAY['campaign_members', 'campaign_id', 'text'],
		ARRAY['campaign_members', 'user_id', 'uuid'],
		ARRAY['campaign_members', 'role', 'text'],
		ARRAY['characters', 'id', 'text'],
		ARRAY['characters', 'name', 'text'],
		ARRAY['characters', 'title', 'text'],
		ARRAY['characters', 'avatar', 'text'],
		ARRAY['characters', 'str', 'integer'],
		ARRAY['characters', 'user_id', 'text'],
		ARRAY['characters', 'campaign_id', 'text'],
		ARRAY['characters', 'currencies', 'jsonb'],
		ARRAY['characters', 'private_currencies', 'jsonb'],
		ARRAY['inventory_items', 'id', 'text'],
		ARRAY['inventory_items', 'owner_id', 'text'],
		ARRAY['inventory_items', 'slot', 'integer'],
		ARRAY['inventory_items', 'name', 'text'],
		ARRAY['inventory_items', 'category', 'text'],
		ARRAY['inventory_items', 'sub_type', 'text'],
		ARRAY['inventory_items', 'rarity', 'text'],
		ARRAY['inventory_items', 'icon', 'text'],
		ARRAY['inventory_items', 'damage', 'text'],
		ARRAY['inventory_items', 'mastery', 'text'],
		ARRAY['inventory_items', 'ac', 'text'],
		ARRAY['inventory_items', 'weight', 'numeric'],
		ARRAY['inventory_items', 'value_gp', 'numeric'],
		ARRAY['inventory_items', 'quantity', 'integer'],
		ARRAY['inventory_items', 'equipped', 'boolean'],
		ARRAY['inventory_items', 'requires_attunement', 'boolean'],
		ARRAY['inventory_items', 'attuned', 'boolean'],
		ARRAY['inventory_items', 'is_homebrew', 'boolean'],
		ARRAY['inventory_items', 'is_identified', 'boolean'],
		ARRAY['inventory_items', 'charges', 'integer'],
		ARRAY['inventory_items', 'max_charges', 'integer'],
		ARRAY['inventory_items', 'effects', 'text'],
		ARRAY['inventory_items', 'flavor', 'text'],
		ARRAY['inventory_items', 'dm_notes', 'text'],
		ARRAY['inventory_items', 'player_notes', 'text'],
		ARRAY['inventory_items', 'is_private', 'boolean'],
		ARRAY['inventory_items', 'is_equippable', 'boolean'],
		ARRAY['inventory_items', 'is_consumable', 'boolean'],
		ARRAY['inventory_items', 'is_important', 'boolean'],
		ARRAY['inventory_items', 'affixes', 'jsonb'],
		ARRAY['inventory_items', 'campaign_id', 'text'],
		ARRAY['character_permissions', 'campaign_id', 'text']
	];
	expected text[];
	actual_type text;
BEGIN
	FOREACH expected SLICE 1 IN ARRAY required_columns LOOP
		IF to_regclass(format('public.%I', expected[1])) IS NULL THEN
			RAISE EXCEPTION
				'遷移基線不符：public.% 資料表不存在。此基線僅適用於保留中的應用程式 Schema，不可套用至空資料庫。',
				expected[1];
		END IF;

		SELECT format_type(attribute.atttypid, attribute.atttypmod)
		INTO actual_type
		FROM pg_attribute AS attribute
		WHERE attribute.attrelid = to_regclass(format('public.%I', expected[1]))
			AND attribute.attname = expected[2]
			AND attribute.attnum > 0
			AND NOT attribute.attisdropped;

		IF actual_type IS NULL OR actual_type <> expected[3] THEN
			RAISE EXCEPTION
				'遷移基線不符：public.%.% 預期型別為 %，實際為 %。',
				expected[1],
				expected[2],
				expected[3],
				COALESCE(actual_type, '缺少欄位');
		END IF;
	END LOOP;
END
$migration_preflight$;

DO $campaign_members_unique_key$
DECLARE
	campaign_column smallint;
	user_column smallint;
BEGIN
	SELECT attribute.attnum INTO campaign_column
	FROM pg_attribute AS attribute
	WHERE attribute.attrelid = 'public.campaign_members'::regclass
		AND attribute.attname = 'campaign_id'
		AND attribute.attnum > 0
		AND NOT attribute.attisdropped;

	SELECT attribute.attnum INTO user_column
	FROM pg_attribute AS attribute
	WHERE attribute.attrelid = 'public.campaign_members'::regclass
		AND attribute.attname = 'user_id'
		AND attribute.attnum > 0
		AND NOT attribute.attisdropped;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint AS constraint_row
		WHERE constraint_row.conrelid = 'public.campaign_members'::regclass
			AND constraint_row.contype IN ('p', 'u')
			AND constraint_row.conkey =
				ARRAY[campaign_column, user_column]::smallint[]
	) THEN
		RAISE EXCEPTION
			'遷移基線不符：campaign_members 必須有 (campaign_id, user_id) 唯一鍵。';
	END IF;
END
$campaign_members_unique_key$;
