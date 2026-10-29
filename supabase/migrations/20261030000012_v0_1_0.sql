-- v0.1.0 SQL migration 依原時間順序整合，保留各來源檔名。

-- 來源 migration: 20261023000000_existing_schema_baseline.sql
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

-- 來源 migration: 20261023000001_campaign_creation_and_security.sql
-- 範例內容由 Edge Function 傳入；本 migration 不建立任何範本資料表。
ALTER TABLE public.campaigns
	ADD COLUMN IF NOT EXISTS camp_chest_currency jsonb NOT NULL DEFAULT
		'{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'::jsonb;

DO $campaign_camp_chest_currency$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.campaigns
		WHERE camp_chest_currency IS NULL
	) THEN
		RAISE EXCEPTION
			'campaigns.camp_chest_currency 有 NULL 資料列；請先設定有效的貨幣物件再套用 migration。';
	END IF;

	ALTER TABLE public.campaigns
		ALTER COLUMN camp_chest_currency SET DEFAULT
			'{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'::jsonb,
		ALTER COLUMN camp_chest_currency SET NOT NULL;
END
$campaign_camp_chest_currency$;

DO $campaign_scoped_inventory$
DECLARE
	v_campaign_column smallint;
	v_existing_delete_action text;
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.inventory_items
		WHERE campaign_id IS NULL
	) THEN
		RAISE EXCEPTION
			'inventory_items.campaign_id 有 NULL 資料列；請先確認每件物品所屬戰役再套用 migration。';
	END IF;

	ALTER TABLE public.inventory_items
		ALTER COLUMN campaign_id SET NOT NULL;

	SELECT attribute.attnum
	INTO v_campaign_column
	FROM pg_attribute AS attribute
	WHERE attribute.attrelid = 'public.inventory_items'::regclass
		AND attribute.attname = 'campaign_id'
		AND attribute.attnum > 0
		AND NOT attribute.attisdropped;

	SELECT constraint_row.confdeltype
	INTO v_existing_delete_action
	FROM pg_constraint AS constraint_row
	WHERE constraint_row.conrelid = 'public.inventory_items'::regclass
		AND constraint_row.contype = 'f'
		AND constraint_row.conkey = ARRAY[v_campaign_column]::smallint[]
		AND constraint_row.confrelid = 'public.campaigns'::regclass
	LIMIT 1;

	IF v_existing_delete_action IS NOT NULL AND v_existing_delete_action <> 'c' THEN
		RAISE EXCEPTION
			'inventory_items.campaign_id 已有非 ON DELETE CASCADE 的 campaigns 外鍵；請先人工處理既有外鍵再套用 migration。';
	END IF;

	IF v_existing_delete_action IS NULL THEN
		ALTER TABLE public.inventory_items
			ADD CONSTRAINT inventory_items_campaign_id_campaigns_fkey
			FOREIGN KEY (campaign_id)
			REFERENCES public.campaigns (id)
			ON DELETE CASCADE;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conrelid = 'public.inventory_items'::regclass
			AND conname = 'inventory_items_camp_chest_is_public_check'
	) THEN
		ALTER TABLE public.inventory_items
			ADD CONSTRAINT inventory_items_camp_chest_is_public_check
			CHECK (
				owner_id <> 'camp-chest'
				OR is_private IS NOT DISTINCT FROM false
			);
	END IF;
END
$campaign_scoped_inventory$;

CREATE INDEX IF NOT EXISTS inventory_items_campaign_owner_slot_idx
	ON public.inventory_items (campaign_id, owner_id, slot);
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_invite_code_unique_idx
	ON public.campaigns (upper(invite_code))
	WHERE invite_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_campaign_member_or_dm(p_campaign_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $campaign_membership$
	SELECT auth.uid() IS NOT NULL
		AND (
			EXISTS (
				SELECT 1
				FROM public.campaign_members AS member
				WHERE member.campaign_id = p_campaign_id
					AND member.user_id = auth.uid()
			)
			OR EXISTS (
				SELECT 1
				FROM public.campaigns AS campaign
				WHERE campaign.id = p_campaign_id
					AND campaign.dm_id = auth.uid()::text
			)
		);
$campaign_membership$;

REVOKE ALL ON FUNCTION public.is_campaign_member_or_dm(text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_campaign_member_or_dm(text)
	TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_campaign_dm(p_campaign_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $campaign_dm$
	SELECT auth.uid() IS NOT NULL
		AND EXISTS (
			SELECT 1
			FROM public.campaigns AS campaign
			WHERE campaign.id = p_campaign_id
				AND campaign.dm_id = auth.uid()::text
		);
$campaign_dm$;

REVOKE ALL ON FUNCTION public.is_campaign_dm(text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_campaign_dm(text)
	TO authenticated;

CREATE OR REPLACE FUNCTION public.join_campaign_by_invite_code(p_invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $join_campaign$
DECLARE
	v_user_id uuid := auth.uid();
	v_campaign_id text;
	v_campaign_name text;
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION '請先登入再加入戰役。'
			USING ERRCODE = '42501';
	END IF;

	SELECT campaign.id, campaign.name
	INTO v_campaign_id, v_campaign_name
	FROM public.campaigns AS campaign
	WHERE upper(campaign.invite_code) = upper(btrim(p_invite_code));

	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到對應的戰役，請確認邀請碼是否正確。'
			USING ERRCODE = '22023';
	END IF;

	INSERT INTO public.campaign_members (campaign_id, user_id, role)
	VALUES (v_campaign_id, v_user_id, 'player')
	ON CONFLICT (campaign_id, user_id) DO NOTHING;

	RETURN jsonb_build_object(
		'campaign_id', v_campaign_id,
		'name', v_campaign_name
	);
END
$join_campaign$;

REVOKE ALL ON FUNCTION public.join_campaign_by_invite_code(text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_campaign_by_invite_code(text)
	TO authenticated;

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
		RAISE EXCEPTION '建立者帳號不存在。'
			USING ERRCODE = '42501';
	END IF;

	IF NULLIF(btrim(p_name), '') IS NULL THEN
		RAISE EXCEPTION '戰役名稱不可空白。'
			USING ERRCODE = '22023';
	END IF;

	IF jsonb_typeof(p_seed) IS DISTINCT FROM 'object'
		OR jsonb_typeof(p_seed -> 'characters') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_seed -> 'items') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_seed -> 'camp_chest_currency') IS DISTINCT FROM 'object' THEN
		RAISE EXCEPTION '範例戰役資料格式無效。'
			USING ERRCODE = '22023';
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
		RAISE EXCEPTION '營地儲物箱貨幣資料不完整。'
			USING ERRCODE = '22023';
	END IF;

	v_campaign_id := gen_random_uuid()::text;

	LOOP
		v_invite_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
		EXIT WHEN NOT EXISTS (
			SELECT 1
			FROM public.campaigns AS campaign
			WHERE campaign.invite_code = v_invite_code
		);
	END LOOP;

	INSERT INTO public.campaigns (
		id, name, dm_id, invite_code, max_characters_per_player,
		camp_chest_currency
	)
	VALUES (
		v_campaign_id,
		btrim(p_name),
		p_user_id::text,
		v_invite_code,
		1,
		v_camp_chest_currency
	);

	INSERT INTO public.campaign_members (campaign_id, user_id, role)
	VALUES (v_campaign_id, p_user_id, 'dm');

	FOR v_character IN
		SELECT value
		FROM jsonb_array_elements(p_seed -> 'characters')
	LOOP
		IF v_character_id_map ? (v_character ->> 'id') THEN
			RAISE EXCEPTION '範例角色識別碼重複。'
				USING ERRCODE = '22023';
		END IF;

		v_new_character_id := gen_random_uuid()::text;
		INSERT INTO public.characters (
			id, name, title, avatar, str, user_id, campaign_id,
			currencies, private_currencies
		)
		VALUES (
			v_new_character_id,
			v_character ->> 'name',
			COALESCE(v_character ->> 'title', ''),
			COALESCE(v_character ->> 'avatar', ''),
			COALESCE((v_character ->> 'str')::integer, 10),
			p_user_id::text,
			v_campaign_id,
			COALESCE(v_character -> 'currencies', '{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'::jsonb),
			COALESCE(v_character -> 'private_currencies', '{"pp":0,"gp":0,"ep":0,"sp":0,"cp":0}'::jsonb)
		);
		v_character_id_map := v_character_id_map
			|| jsonb_build_object(v_character ->> 'id', v_new_character_id);
	END LOOP;

	FOR v_item IN
		SELECT value
		FROM jsonb_array_elements(p_seed -> 'items')
	LOOP
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
			campaign_id
		)
		VALUES (
			v_new_item_id,
			v_item_owner_id,
			COALESCE((v_item ->> 'slot')::integer, 0),
			v_item ->> 'name',
			v_item ->> 'category',
			COALESCE(v_item ->> 'sub_type', ''),
			COALESCE(v_item ->> 'rarity', 'Common'),
			COALESCE(v_item ->> 'icon', ''),
			v_item ->> 'damage',
			COALESCE(v_item ->> 'mastery', 'None'),
			v_item ->> 'ac',
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
			COALESCE(v_item -> 'affixes', '[]'::jsonb),
			v_campaign_id
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

CREATE OR REPLACE FUNCTION public.guard_campaign_updates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $guard_campaign_updates$
BEGIN
	IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
		RETURN NEW;
	END IF;

	IF NEW.id IS DISTINCT FROM OLD.id OR NEW.dm_id IS DISTINCT FROM OLD.dm_id THEN
		RAISE EXCEPTION '不得直接變更戰役 ID 或 DM 身分。'
			USING ERRCODE = '42501';
	END IF;

	IF OLD.dm_id IS DISTINCT FROM auth.uid()::text
		AND (to_jsonb(NEW) - 'camp_chest_currency')
			IS DISTINCT FROM (to_jsonb(OLD) - 'camp_chest_currency') THEN
		RAISE EXCEPTION '玩家只能更新戰役的營地儲物箱公共錢包。'
			USING ERRCODE = '42501';
	END IF;

	RETURN NEW;
END
$guard_campaign_updates$;

REVOKE ALL ON FUNCTION public.guard_campaign_updates()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_campaign_updates ON public.campaigns;
CREATE TRIGGER guard_campaign_updates
	BEFORE UPDATE ON public.campaigns
	FOR EACH ROW
	EXECUTE FUNCTION public.guard_campaign_updates();

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign members can read their campaign"
	ON public.campaigns
	AS PERMISSIVE
	FOR SELECT
	TO authenticated
	USING (public.is_campaign_member_or_dm(id));

CREATE POLICY "Campaign members can read only their campaign"
	ON public.campaigns
	AS RESTRICTIVE
	FOR SELECT
	TO public
	USING (public.is_campaign_member_or_dm(id));

CREATE POLICY "Campaign members can access campaign inventory"
	ON public.inventory_items
	AS PERMISSIVE
	FOR ALL
	TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id))
	WITH CHECK (public.is_campaign_member_or_dm(campaign_id));

CREATE POLICY "Campaign members can access their campaign inventory"
	ON public.inventory_items
	AS RESTRICTIVE
	FOR ALL
	TO public
	USING (public.is_campaign_member_or_dm(campaign_id))
	WITH CHECK (public.is_campaign_member_or_dm(campaign_id));

CREATE POLICY "Campaign members can access campaign characters"
	ON public.characters
	AS PERMISSIVE
	FOR ALL
	TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id))
	WITH CHECK (public.is_campaign_member_or_dm(campaign_id));

CREATE POLICY "Campaign members can access only their campaign characters"
	ON public.characters
	AS RESTRICTIVE
	FOR ALL
	TO public
	USING (public.is_campaign_member_or_dm(campaign_id))
	WITH CHECK (public.is_campaign_member_or_dm(campaign_id));

CREATE POLICY "Campaign members can access only their campaign permissions"
	ON public.character_permissions
	AS RESTRICTIVE
	FOR ALL
	TO public
	USING (public.is_campaign_member_or_dm(campaign_id))
	WITH CHECK (public.is_campaign_member_or_dm(campaign_id));

CREATE POLICY "Campaign members can update campaign"
	ON public.campaigns
	AS PERMISSIVE
	FOR UPDATE
	TO authenticated
	USING (public.is_campaign_member_or_dm(id))
	WITH CHECK (public.is_campaign_member_or_dm(id));

CREATE POLICY "Campaign members can update their campaign"
	ON public.campaigns
	AS RESTRICTIVE
	FOR UPDATE
	TO public
	USING (public.is_campaign_member_or_dm(id))
	WITH CHECK (public.is_campaign_member_or_dm(id));

CREATE POLICY "Campaign rows are created only through trusted functions"
	ON public.campaigns
	AS RESTRICTIVE
	FOR INSERT
	TO public
	WITH CHECK (false);

CREATE POLICY "Only campaign DMs can delete campaigns"
	ON public.campaigns
	AS RESTRICTIVE
	FOR DELETE
	TO public
	USING (public.is_campaign_dm(id));

CREATE POLICY "Campaign DMs can delete their campaigns"
	ON public.campaigns
	AS PERMISSIVE
	FOR DELETE
	TO authenticated
	USING (public.is_campaign_dm(id));

CREATE POLICY "Campaign members can read their membership rows"
	ON public.campaign_members
	AS RESTRICTIVE
	FOR SELECT
	TO public
	USING (public.is_campaign_member_or_dm(campaign_id));

CREATE POLICY "Campaign members can view membership rows"
	ON public.campaign_members
	AS PERMISSIVE
	FOR SELECT
	TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id));

CREATE POLICY "Membership rows are managed by trusted functions or DMs"
	ON public.campaign_members
	AS RESTRICTIVE
	FOR INSERT
	TO public
	WITH CHECK (false);

CREATE POLICY "Campaign DMs can manage membership rows"
	ON public.campaign_members
	AS PERMISSIVE
	FOR ALL
	TO authenticated
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));

CREATE POLICY "Only campaign DMs can update memberships"
	ON public.campaign_members
	AS RESTRICTIVE
	FOR UPDATE
	TO public
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));

CREATE POLICY "Only campaign DMs can delete memberships"
	ON public.campaign_members
	AS RESTRICTIVE
	FOR DELETE
	TO public
	USING (public.is_campaign_dm(campaign_id));

DO $campaign_realtime$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_publication
		WHERE pubname = 'supabase_realtime'
	) THEN
		RAISE EXCEPTION
			'找不到 supabase_realtime publication；請先確認 Supabase Realtime 設定。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'campaigns'
	) THEN
		ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
	END IF;
END
$campaign_realtime$;

-- 來源 migration: 20261024000000_blacksmith_items.sql
CREATE OR REPLACE FUNCTION public.is_valid_blacksmith_affixes(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $is_valid_blacksmith_affixes$
DECLARE
	affix jsonb;
BEGIN
	IF jsonb_typeof(value) <> 'array' THEN
		RETURN false;
	END IF;

	FOR affix IN SELECT jsonb_array_elements(value)
	LOOP
		IF jsonb_typeof(affix) <> 'object'
			OR NOT (affix ?& ARRAY['id', 'name', 'desc'])
			OR jsonb_typeof(affix -> 'id') <> 'string'
			OR jsonb_typeof(affix -> 'name') <> 'string'
			OR jsonb_typeof(affix -> 'desc') <> 'string'
			OR length(btrim(affix ->> 'id')) = 0
			OR length(btrim(affix ->> 'name')) = 0
			OR (
				affix ? 'isHidden'
				AND jsonb_typeof(affix -> 'isHidden') <> 'boolean'
			) THEN
			RETURN false;
		END IF;
	END LOOP;

	RETURN true;
END
$is_valid_blacksmith_affixes$;

REVOKE ALL ON FUNCTION public.is_valid_blacksmith_affixes(jsonb)
	FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_blacksmith_affixes(jsonb)
	TO authenticated;

CREATE TABLE public.blacksmith_items (
	id text PRIMARY KEY,
	owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
	category text NOT NULL CHECK (category IN ('Weapon', 'Armor', 'Consumable', 'Misc')),
	sub_type text NOT NULL DEFAULT '' CHECK (length(sub_type) <= 120),
	rarity text NOT NULL DEFAULT 'Common'
		CHECK (rarity IN ('Common', 'Uncommon', 'Rare', 'VeryRare', 'Legendary', 'Artifact')),
	icon text NOT NULL DEFAULT 'Package' CHECK (length(btrim(icon)) BETWEEN 1 AND 500),
	damage text CHECK (length(damage) <= 100),
	mastery text NOT NULL DEFAULT 'None'
		CHECK (mastery IN ('None', 'Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex')),
	ac text CHECK (length(ac) <= 100),
	weight numeric NOT NULL DEFAULT 0
		CHECK (weight >= 0 AND weight::text NOT IN ('NaN', 'Infinity', '-Infinity')),
	value_gp numeric NOT NULL DEFAULT 0
		CHECK (value_gp >= 0 AND value_gp::text NOT IN ('NaN', 'Infinity', '-Infinity')),
	requires_attunement boolean NOT NULL DEFAULT false,
	is_homebrew boolean NOT NULL DEFAULT true,
	max_charges integer NOT NULL DEFAULT 0 CHECK (max_charges >= 0),
	effects text NOT NULL DEFAULT '' CHECK (length(effects) <= 20000),
	flavor text NOT NULL DEFAULT '' CHECK (length(flavor) <= 20000),
	dm_notes text NOT NULL DEFAULT '' CHECK (length(dm_notes) <= 20000),
	is_equippable boolean NOT NULL DEFAULT false,
	is_consumable boolean NOT NULL DEFAULT false,
	is_important boolean NOT NULL DEFAULT false,
	affixes jsonb NOT NULL DEFAULT '[]'::jsonb
		CHECK (public.is_valid_blacksmith_affixes(affixes)),
	is_shared boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX blacksmith_items_owner_updated_idx
	ON public.blacksmith_items (owner_id, updated_at DESC);
CREATE INDEX blacksmith_items_shared_updated_idx
	ON public.blacksmith_items (updated_at DESC)
	WHERE is_shared = true;

CREATE OR REPLACE FUNCTION public.update_blacksmith_item_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $update_blacksmith_item_updated_at$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END
$update_blacksmith_item_updated_at$;

REVOKE ALL ON FUNCTION public.update_blacksmith_item_updated_at()
	FROM PUBLIC, anon, authenticated;

CREATE TRIGGER blacksmith_items_updated_at
	BEFORE UPDATE ON public.blacksmith_items
	FOR EACH ROW
	EXECUTE FUNCTION public.update_blacksmith_item_updated_at();

ALTER TABLE public.blacksmith_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.blacksmith_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.blacksmith_items TO authenticated;

CREATE POLICY "Authors and readers can select blacksmith items"
	ON public.blacksmith_items
	FOR SELECT
	TO authenticated
	USING (owner_id = auth.uid() OR is_shared = true);

CREATE POLICY "Authors can insert blacksmith items"
	ON public.blacksmith_items
	FOR INSERT
	TO authenticated
	WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Authors can update blacksmith items"
	ON public.blacksmith_items
	FOR UPDATE
	TO authenticated
	USING (owner_id = auth.uid())
	WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Authors can delete blacksmith items"
	ON public.blacksmith_items
	FOR DELETE
	TO authenticated
	USING (owner_id = auth.uid());

-- 來源 migration: 20261024000001_blacksmith_campaign_import.sql
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

-- 來源 migration: 20261026000000_campaign_shops.sql
DO $campaign_shop_preflight$
DECLARE
	required_columns text[][] := ARRAY[
		ARRAY['campaigns', 'id', 'text'],
		ARRAY['characters', 'id', 'text'],
		ARRAY['characters', 'campaign_id', 'text'],
		ARRAY['characters', 'user_id', 'text'],
		ARRAY['characters', 'currencies', 'jsonb'],
		ARRAY['characters', 'private_currencies', 'jsonb'],
		ARRAY['campaign_members', 'campaign_id', 'text'],
		ARRAY['campaign_members', 'user_id', 'uuid'],
		ARRAY['character_permissions', 'campaign_id', 'text'],
		ARRAY['character_permissions', 'character_id', 'text'],
		ARRAY['character_permissions', 'user_id', 'uuid'],
		ARRAY['character_permissions', 'public_wallet_access', 'smallint'],
		ARRAY['character_permissions', 'private_wallet_access', 'smallint'],
		ARRAY['inventory_items', 'id', 'text'],
		ARRAY['inventory_items', 'campaign_id', 'text'],
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
		ARRAY['inventory_items', 'affixes', 'jsonb']
	];
	expected text[];
	actual_type text;
BEGIN
	FOREACH expected SLICE 1 IN ARRAY required_columns LOOP
		IF to_regclass(format('public.%I', expected[1])) IS NULL THEN
			RAISE EXCEPTION '商店 migration 前置檢查失敗：public.% 不存在。', expected[1];
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
				'商店 migration 前置檢查失敗：public.%.% 預期型別為 %，實際為 %。',
				expected[1], expected[2], expected[3], COALESCE(actual_type, '缺少欄位');
		END IF;
	END LOOP;

	IF to_regprocedure('public.is_campaign_member_or_dm(text)') IS NULL
		OR to_regprocedure('public.is_campaign_dm(text)') IS NULL THEN
		RAISE EXCEPTION '商店 migration 需要既有戰役成員與 DM 授權函式。';
	END IF;
END
$campaign_shop_preflight$;

CREATE TABLE public.campaign_shops (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	campaign_id text NOT NULL
		REFERENCES public.campaigns(id) ON DELETE CASCADE,
	name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
	background_image_url text
		CHECK (background_image_url IS NULL OR length(background_image_url) <= 2048),
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (campaign_id, id)
);

CREATE TABLE public.campaign_shop_items (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	campaign_id text NOT NULL,
	shop_id text NOT NULL,
	item_snapshot jsonb NOT NULL CHECK (
		item_snapshot ?& ARRAY['name', 'category', 'rarity', 'icon']
		AND jsonb_typeof(item_snapshot) = 'object'
		AND jsonb_typeof(item_snapshot -> 'name') = 'string'
		AND length(btrim(item_snapshot ->> 'name')) BETWEEN 1 AND 120
		AND jsonb_typeof(item_snapshot -> 'category') = 'string'
		AND item_snapshot ->> 'category' IN ('Weapon', 'Armor', 'Consumable', 'Misc')
		AND jsonb_typeof(item_snapshot -> 'rarity') = 'string'
		AND item_snapshot ->> 'rarity' IN ('Common', 'Uncommon', 'Rare', 'VeryRare', 'Legendary', 'Artifact')
		AND jsonb_typeof(item_snapshot -> 'icon') = 'string'
		AND length(btrim(item_snapshot ->> 'icon')) BETWEEN 1 AND 500
	),
	source_type text NOT NULL CHECK (
		source_type IN ('catalog', 'blacksmith', 'manual')
	),
	source_id text,
	unit_price_gp numeric NOT NULL CHECK (
		unit_price_gp > 0
		AND unit_price_gp < 10000000000
		AND unit_price_gp = trunc(unit_price_gp, 2)
		AND unit_price_gp::text NOT IN ('NaN', 'Infinity', '-Infinity')
	),
	stock_available integer NOT NULL DEFAULT 0 CHECK (stock_available >= 0),
	stock_reserved integer NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
	requires_approval boolean NOT NULL DEFAULT false,
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (campaign_id, id),
	FOREIGN KEY (campaign_id, shop_id)
		REFERENCES public.campaign_shops(campaign_id, id) ON DELETE CASCADE
);

CREATE INDEX campaign_shops_campaign_active_idx
	ON public.campaign_shops (campaign_id, is_active);
CREATE INDEX campaign_shop_items_shop_active_idx
	ON public.campaign_shop_items (campaign_id, shop_id, is_active);

CREATE TABLE public.campaign_shop_orders (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	campaign_id text NOT NULL
		REFERENCES public.campaigns(id) ON DELETE CASCADE,
	shop_id text NOT NULL,
	shop_item_id text NOT NULL,
	buyer_user_id uuid NOT NULL,
	character_id text NOT NULL,
	item_snapshot jsonb NOT NULL,
	shop_name_snapshot text NOT NULL,
	unit_price_gp numeric NOT NULL CHECK (
		unit_price_gp > 0
		AND unit_price_gp < 10000000000
		AND unit_price_gp = trunc(unit_price_gp, 2)
	),
	quantity integer NOT NULL CHECK (quantity > 0),
	total_price_gp numeric NOT NULL CHECK (
		total_price_gp > 0
		AND total_price_gp < 1000000000000000000
		AND total_price_gp = trunc(total_price_gp, 2)
	),
	status text NOT NULL CHECK (
		status IN ('completed', 'pending', 'rejected', 'cancelled')
	),
	requires_approval boolean NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	reviewed_by uuid,
	reviewed_at timestamptz,
	UNIQUE (campaign_id, id),
	FOREIGN KEY (campaign_id, shop_id)
		REFERENCES public.campaign_shops(campaign_id, id) ON DELETE CASCADE,
	FOREIGN KEY (campaign_id, shop_item_id)
		REFERENCES public.campaign_shop_items(campaign_id, id) ON DELETE CASCADE,
	FOREIGN KEY (character_id)
		REFERENCES public.characters(id) ON DELETE CASCADE
);

CREATE INDEX campaign_shop_orders_campaign_created_idx
	ON public.campaign_shop_orders (campaign_id, created_at DESC);
CREATE INDEX campaign_shop_orders_pending_idx
	ON public.campaign_shop_orders (campaign_id, created_at)
	WHERE status = 'pending';

CREATE TABLE public.campaign_shop_order_payments (
	order_id text PRIMARY KEY
		REFERENCES public.campaign_shop_orders(id) ON DELETE CASCADE,
	wallet_type text NOT NULL CHECK (wallet_type IN ('public', 'private'))
);

CREATE OR REPLACE FUNCTION public.campaign_shop_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $campaign_shop_touch_updated_at$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END
$campaign_shop_touch_updated_at$;

REVOKE ALL ON FUNCTION public.campaign_shop_touch_updated_at()
	FROM PUBLIC, anon, authenticated;

CREATE TRIGGER campaign_shops_touch_updated_at
	BEFORE UPDATE ON public.campaign_shops
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_touch_updated_at();
CREATE TRIGGER campaign_shop_items_touch_updated_at
	BEFORE UPDATE ON public.campaign_shop_items
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_touch_updated_at();
CREATE TRIGGER campaign_shop_orders_touch_updated_at
	BEFORE UPDATE ON public.campaign_shop_orders
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_touch_updated_at();

ALTER TABLE public.campaign_shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_shop_order_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.campaign_shops,
	public.campaign_shop_items,
	public.campaign_shop_orders,
	public.campaign_shop_order_payments
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.campaign_shops TO authenticated;
GRANT INSERT (campaign_id, name, background_image_url, is_active)
	ON public.campaign_shops TO authenticated;
GRANT UPDATE (name, background_image_url, is_active)
	ON public.campaign_shops TO authenticated;
GRANT SELECT ON TABLE public.campaign_shop_items TO authenticated;
GRANT INSERT (
	campaign_id, shop_id, item_snapshot, source_type, source_id,
	unit_price_gp, stock_available, requires_approval, is_active
) ON public.campaign_shop_items TO authenticated;
GRANT UPDATE (
	item_snapshot, source_type, source_id, unit_price_gp,
	stock_available, requires_approval, is_active
) ON public.campaign_shop_items TO authenticated;
GRANT SELECT (
	id, campaign_id, shop_id, shop_item_id, character_id, item_snapshot,
	shop_name_snapshot, unit_price_gp, quantity, total_price_gp, status,
	requires_approval, created_at, updated_at, reviewed_at
) ON public.campaign_shop_orders TO authenticated;

CREATE POLICY campaign_shops_member_read
	ON public.campaign_shops
	FOR SELECT TO authenticated
	USING (is_active OR public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shops_member_boundary
	ON public.campaign_shops
	AS RESTRICTIVE FOR SELECT TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id));
CREATE POLICY campaign_shops_dm_insert
	ON public.campaign_shops
	FOR INSERT TO authenticated
	WITH CHECK (public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shops_dm_update
	ON public.campaign_shops
	FOR UPDATE TO authenticated
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shops_dm_update_boundary
	ON public.campaign_shops
	AS RESTRICTIVE FOR UPDATE TO authenticated
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shops_dm_insert_boundary
	ON public.campaign_shops
	AS RESTRICTIVE FOR INSERT TO authenticated
	WITH CHECK (public.is_campaign_dm(campaign_id));

CREATE POLICY campaign_shop_items_member_read
	ON public.campaign_shop_items
	FOR SELECT TO authenticated
	USING (
		(
			is_active AND EXISTS (
				SELECT 1
				FROM public.campaign_shops AS shop
				WHERE shop.id = campaign_shop_items.shop_id
					AND shop.campaign_id = campaign_shop_items.campaign_id
					AND shop.is_active
			)
		)
		OR public.is_campaign_dm(campaign_id)
	);
CREATE POLICY campaign_shop_items_member_boundary
	ON public.campaign_shop_items
	AS RESTRICTIVE FOR SELECT TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id));
CREATE POLICY campaign_shop_items_dm_insert
	ON public.campaign_shop_items
	FOR INSERT TO authenticated
	WITH CHECK (
		public.is_campaign_dm(campaign_id)
		AND EXISTS (
			SELECT 1 FROM public.campaign_shops AS shop
			WHERE shop.id = campaign_shop_items.shop_id
				AND shop.campaign_id = campaign_shop_items.campaign_id
		)
		AND stock_reserved = 0
	);
CREATE POLICY campaign_shop_items_dm_update
	ON public.campaign_shop_items
	FOR UPDATE TO authenticated
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shop_items_dm_write_boundary
	ON public.campaign_shop_items
	AS RESTRICTIVE FOR INSERT TO authenticated
	WITH CHECK (public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shop_items_dm_update_boundary
	ON public.campaign_shop_items
	AS RESTRICTIVE FOR UPDATE TO authenticated
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));

CREATE POLICY campaign_shop_orders_member_read
	ON public.campaign_shop_orders
	FOR SELECT TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id));
CREATE POLICY campaign_shop_orders_member_boundary
	ON public.campaign_shop_orders
	AS RESTRICTIVE FOR SELECT TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id));

CREATE OR REPLACE FUNCTION public.shop_wallet_total_cp(p_wallet jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $shop_wallet_total_cp$
DECLARE
	v_coin text;
	v_amount numeric;
	v_total numeric := 0;
	v_values integer[] := ARRAY[1000, 100, 50, 10, 1];
	v_coins text[] := ARRAY['pp', 'gp', 'ep', 'sp', 'cp'];
	v_index integer;
BEGIN
	IF jsonb_typeof(p_wallet) <> 'object' THEN
		RAISE EXCEPTION '錢包資料格式無效。' USING ERRCODE = '22023';
	END IF;

	FOREACH v_coin IN ARRAY v_coins LOOP
		v_index := array_position(v_coins, v_coin);
		IF COALESCE(jsonb_typeof(p_wallet -> v_coin), '') <> 'number'
			OR (p_wallet ->> v_coin) !~ '^[0-9]{1,12}$' THEN
			RAISE EXCEPTION '錢包中的 % 數量無效。', v_coin USING ERRCODE = '22023';
		END IF;
		v_amount := (p_wallet ->> v_coin)::numeric;
		v_total := v_total + v_amount * v_values[v_index];
	END LOOP;

	RETURN v_total;
END
$shop_wallet_total_cp$;

CREATE OR REPLACE FUNCTION public.shop_wallet_from_cp(p_total_cp numeric)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $shop_wallet_from_cp$
	SELECT jsonb_build_object(
		'pp', floor(p_total_cp / 1000)::bigint,
		'gp', floor(mod(p_total_cp, 1000) / 100)::bigint,
		'ep', floor(mod(p_total_cp, 100) / 50)::bigint,
		'sp', floor(mod(p_total_cp, 50) / 10)::bigint,
		'cp', mod(p_total_cp, 10)::bigint
	);
$shop_wallet_from_cp$;

CREATE OR REPLACE FUNCTION public.campaign_shop_assert_buyer_access(
	p_campaign_id text,
	p_character_id text,
	p_wallet_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_shop_assert_buyer_access$
DECLARE
	v_character_owner text;
	v_wallet_access smallint;
BEGIN
	IF auth.uid() IS NULL
		OR p_wallet_type IS NULL
		OR p_wallet_type NOT IN ('public', 'private')
		OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役購買商品。' USING ERRCODE = '42501';
	END IF;

	SELECT character.user_id
	INTO v_character_owner
	FROM public.characters AS character
	WHERE character.id = p_character_id
		AND character.campaign_id = p_campaign_id;

	IF v_character_owner IS NULL THEN
		RAISE EXCEPTION '購物角色不存在或不屬於此戰役。' USING ERRCODE = '22023';
	END IF;

	IF NOT public.is_campaign_dm(p_campaign_id) THEN
		IF v_character_owner <> auth.uid()::text THEN
			RAISE EXCEPTION '只能使用自己擁有的角色購物。' USING ERRCODE = '42501';
		END IF;

		SELECT CASE
			WHEN p_wallet_type = 'public' THEN max(permission.public_wallet_access)
			ELSE max(permission.private_wallet_access)
		END
		INTO v_wallet_access
		FROM public.character_permissions AS permission
		WHERE permission.campaign_id = p_campaign_id
			AND permission.character_id = p_character_id
			AND permission.user_id = auth.uid();

		IF COALESCE(v_wallet_access, 0) <> 2 THEN
			RAISE EXCEPTION '所選錢包需要修改權限才能購物。' USING ERRCODE = '42501';
		END IF;
	END IF;
END
$campaign_shop_assert_buyer_access$;

REVOKE ALL ON FUNCTION public.shop_wallet_total_cp(jsonb),
	public.shop_wallet_from_cp(numeric),
	public.campaign_shop_assert_buyer_access(text, text, text)
	FROM PUBLIC, anon, authenticated;

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
		is_equippable, is_consumable, is_important, affixes
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
		v_order.quantity,
		false,
		COALESCE((v_order.item_snapshot ->> 'requires_attunement')::boolean, false),
		false,
		COALESCE((v_order.item_snapshot ->> 'is_homebrew')::boolean, false),
		false,
		0,
		COALESCE((v_order.item_snapshot ->> 'max_charges')::integer, 0),
		COALESCE(v_order.item_snapshot ->> 'effects', ''),
		COALESCE(v_order.item_snapshot ->> 'flavor', ''),
		COALESCE(v_order.item_snapshot ->> 'dm_notes', ''),
		'',
		false,
		COALESCE((v_order.item_snapshot ->> 'is_equippable')::boolean, false),
		COALESCE((v_order.item_snapshot ->> 'is_consumable')::boolean, false),
		COALESCE((v_order.item_snapshot ->> 'is_important')::boolean, false),
		COALESCE(v_order.item_snapshot -> 'affixes', '[]'::jsonb)
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

CREATE OR REPLACE FUNCTION public.purchase_campaign_shop_item(
	p_campaign_id text,
	p_shop_item_id text,
	p_character_id text,
	p_wallet_type text,
	p_quantity integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $purchase_campaign_shop_item$
DECLARE
	v_item public.campaign_shop_items%ROWTYPE;
	v_shop_name text;
	v_order_id text := gen_random_uuid()::text;
	v_total numeric;
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役購買商品。' USING ERRCODE = '42501';
	END IF;
	IF p_quantity IS NULL OR p_quantity < 1
		OR p_wallet_type NOT IN ('public', 'private') THEN
		RAISE EXCEPTION '購買數量或付款錢包無效。' USING ERRCODE = '22023';
	END IF;

	PERFORM public.campaign_shop_assert_buyer_access(
		p_campaign_id, p_character_id, p_wallet_type
	);

	SELECT shop_item.*
	INTO v_item
	FROM public.campaign_shop_items AS shop_item
	JOIN public.campaign_shops AS shop
		ON shop.id = shop_item.shop_id AND shop.campaign_id = shop_item.campaign_id
	WHERE shop_item.id = p_shop_item_id
		AND shop_item.campaign_id = p_campaign_id
		AND shop_item.is_active
		AND shop.is_active
	FOR UPDATE OF shop_item, shop;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店或商品不存在或已停用。' USING ERRCODE = '22023';
	END IF;
	SELECT shop.name
	INTO v_shop_name
	FROM public.campaign_shops AS shop
	WHERE shop.id = v_item.shop_id
		AND shop.campaign_id = p_campaign_id;
	IF v_item.requires_approval THEN
		RAISE EXCEPTION '此商品需要審查，請建立待審請求。' USING ERRCODE = '22023';
	END IF;
	IF v_item.stock_available < p_quantity THEN
		RAISE EXCEPTION '商品庫存不足。' USING ERRCODE = '23514';
	END IF;

	v_total := v_item.unit_price_gp * p_quantity;
	INSERT INTO public.campaign_shop_orders (
		id, campaign_id, shop_id, shop_item_id, buyer_user_id, character_id,
		item_snapshot, shop_name_snapshot, unit_price_gp, quantity,
		total_price_gp, status, requires_approval
	)
	VALUES (
		v_order_id, p_campaign_id, v_item.shop_id, v_item.id, auth.uid(),
		p_character_id, v_item.item_snapshot, v_shop_name, v_item.unit_price_gp,
		p_quantity, v_total, 'pending', false
	);
	INSERT INTO public.campaign_shop_order_payments (order_id, wallet_type)
	VALUES (v_order_id, p_wallet_type);

	RETURN public.campaign_shop_settle_order(v_order_id, false);
END
$purchase_campaign_shop_item$;

CREATE OR REPLACE FUNCTION public.request_campaign_shop_item(
	p_campaign_id text,
	p_shop_item_id text,
	p_character_id text,
	p_wallet_type text,
	p_quantity integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $request_campaign_shop_item$
DECLARE
	v_item public.campaign_shop_items%ROWTYPE;
	v_shop_name text;
	v_order_id text := gen_random_uuid()::text;
	v_total numeric;
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役建立購買請求。' USING ERRCODE = '42501';
	END IF;
	IF p_quantity IS NULL OR p_quantity < 1
		OR p_wallet_type NOT IN ('public', 'private') THEN
		RAISE EXCEPTION '購買數量或付款錢包無效。' USING ERRCODE = '22023';
	END IF;

	PERFORM public.campaign_shop_assert_buyer_access(
		p_campaign_id, p_character_id, p_wallet_type
	);

	SELECT shop_item.*
	INTO v_item
	FROM public.campaign_shop_items AS shop_item
	JOIN public.campaign_shops AS shop
		ON shop.id = shop_item.shop_id AND shop.campaign_id = shop_item.campaign_id
	WHERE shop_item.id = p_shop_item_id
		AND shop_item.campaign_id = p_campaign_id
		AND shop_item.is_active
		AND shop.is_active
	FOR UPDATE OF shop_item, shop;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店或商品不存在或已停用。' USING ERRCODE = '22023';
	END IF;
	SELECT shop.name
	INTO v_shop_name
	FROM public.campaign_shops AS shop
	WHERE shop.id = v_item.shop_id
		AND shop.campaign_id = p_campaign_id;
	IF NOT v_item.requires_approval THEN
		RAISE EXCEPTION '此商品不需要審查，請直接購買。' USING ERRCODE = '22023';
	END IF;
	IF v_item.stock_available < p_quantity THEN
		RAISE EXCEPTION '商品庫存不足。' USING ERRCODE = '23514';
	END IF;

	v_total := v_item.unit_price_gp * p_quantity;
	UPDATE public.campaign_shop_items
	SET stock_available = stock_available - p_quantity,
		stock_reserved = stock_reserved + p_quantity
	WHERE id = v_item.id AND campaign_id = p_campaign_id;

	INSERT INTO public.campaign_shop_orders (
		id, campaign_id, shop_id, shop_item_id, buyer_user_id, character_id,
		item_snapshot, shop_name_snapshot, unit_price_gp, quantity,
		total_price_gp, status, requires_approval
	)
	VALUES (
		v_order_id, p_campaign_id, v_item.shop_id, v_item.id, auth.uid(),
		p_character_id, v_item.item_snapshot, v_shop_name, v_item.unit_price_gp,
		p_quantity, v_total, 'pending', true
	);
	INSERT INTO public.campaign_shop_order_payments (order_id, wallet_type)
	VALUES (v_order_id, p_wallet_type);

	RETURN v_order_id;
END
$request_campaign_shop_item$;

CREATE OR REPLACE FUNCTION public.approve_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $approve_campaign_shop_order$
DECLARE
	v_campaign_id text;
BEGIN
	IF auth.uid() IS NULL THEN
		RAISE EXCEPTION '需要登入才能審查購買請求。' USING ERRCODE = '42501';
	END IF;
	SELECT campaign_id INTO v_campaign_id
	FROM public.campaign_shop_orders
	WHERE id = p_order_id;
	IF NOT FOUND OR NOT public.is_campaign_dm(v_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以核准此請求。' USING ERRCODE = '42501';
	END IF;

	RETURN public.campaign_shop_settle_order(p_order_id, true);
END
$approve_campaign_shop_order$;

CREATE OR REPLACE FUNCTION public.reject_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $reject_campaign_shop_order$
DECLARE
	v_order public.campaign_shop_orders%ROWTYPE;
	v_item public.campaign_shop_items%ROWTYPE;
BEGIN
	IF auth.uid() IS NULL THEN
		RAISE EXCEPTION '需要登入才能審查購買請求。' USING ERRCODE = '42501';
	END IF;
	SELECT * INTO v_order
	FROM public.campaign_shop_orders
	WHERE id = p_order_id
	FOR UPDATE;
	IF NOT FOUND OR NOT public.is_campaign_dm(v_order.campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以拒絕此請求。' USING ERRCODE = '42501';
	END IF;
	IF v_order.status <> 'pending' OR NOT v_order.requires_approval THEN
		RAISE EXCEPTION '訂單不存在或已處理。' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_item
	FROM public.campaign_shop_items
	WHERE id = v_order.shop_item_id AND campaign_id = v_order.campaign_id
	FOR UPDATE;
	IF NOT FOUND OR v_item.stock_reserved < v_order.quantity THEN
		RAISE EXCEPTION '保留庫存資料不一致。' USING ERRCODE = '23514';
	END IF;
	UPDATE public.campaign_shop_items
	SET stock_reserved = stock_reserved - v_order.quantity,
		stock_available = stock_available + v_order.quantity
	WHERE id = v_item.id AND campaign_id = v_order.campaign_id;
	UPDATE public.campaign_shop_orders
	SET status = 'rejected', reviewed_by = auth.uid(),
		reviewed_at = now(), updated_at = now()
	WHERE id = p_order_id;
	RETURN p_order_id;
END
$reject_campaign_shop_order$;

CREATE OR REPLACE FUNCTION public.cancel_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $cancel_campaign_shop_order$
DECLARE
	v_order public.campaign_shop_orders%ROWTYPE;
	v_item public.campaign_shop_items%ROWTYPE;
BEGIN
	IF auth.uid() IS NULL THEN
		RAISE EXCEPTION '需要登入才能取消購買請求。' USING ERRCODE = '42501';
	END IF;
	SELECT * INTO v_order
	FROM public.campaign_shop_orders
	WHERE id = p_order_id
	FOR UPDATE;
	IF NOT FOUND OR v_order.buyer_user_id <> auth.uid()
		OR NOT public.is_campaign_member_or_dm(v_order.campaign_id) THEN
		RAISE EXCEPTION '無權取消此購買請求。' USING ERRCODE = '42501';
	END IF;
	IF v_order.status <> 'pending' OR NOT v_order.requires_approval THEN
		RAISE EXCEPTION '只有待審請求可以取消。' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_item
	FROM public.campaign_shop_items
	WHERE id = v_order.shop_item_id AND campaign_id = v_order.campaign_id
	FOR UPDATE;
	IF NOT FOUND OR v_item.stock_reserved < v_order.quantity THEN
		RAISE EXCEPTION '保留庫存資料不一致。' USING ERRCODE = '23514';
	END IF;
	UPDATE public.campaign_shop_items
	SET stock_reserved = stock_reserved - v_order.quantity,
		stock_available = stock_available + v_order.quantity
	WHERE id = v_item.id AND campaign_id = v_order.campaign_id;
	UPDATE public.campaign_shop_orders
	SET status = 'cancelled', updated_at = now()
	WHERE id = p_order_id;
	RETURN p_order_id;
END
$cancel_campaign_shop_order$;

REVOKE ALL ON FUNCTION public.campaign_shop_settle_order(text, boolean),
	public.purchase_campaign_shop_item(text, text, text, text, integer),
	public.request_campaign_shop_item(text, text, text, text, integer),
	public.approve_campaign_shop_order(text),
	public.reject_campaign_shop_order(text),
	public.cancel_campaign_shop_order(text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_campaign_shop_item(text, text, text, text, integer),
	public.request_campaign_shop_item(text, text, text, text, integer),
	public.approve_campaign_shop_order(text),
	public.reject_campaign_shop_order(text),
	public.cancel_campaign_shop_order(text)
	TO authenticated;

DO $campaign_shop_realtime$
DECLARE
	table_name text;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
	) THEN
		RAISE EXCEPTION '找不到 supabase_realtime publication，請先確認 Supabase Realtime 設定。';
	END IF;

	FOREACH table_name IN ARRAY ARRAY[
		'campaign_shops', 'campaign_shop_items', 'campaign_shop_orders'
	] LOOP
		IF NOT EXISTS (
			SELECT 1 FROM pg_publication_tables
			WHERE pubname = 'supabase_realtime'
				AND schemaname = 'public'
				AND tablename = table_name
		) THEN
			EXECUTE format(
				'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
				table_name
			);
		END IF;
	END LOOP;
END
$campaign_shop_realtime$;

-- 來源 migration: 20261026000001_campaign_shop_item_delete.sql
REVOKE DELETE ON TABLE public.campaign_shop_items FROM PUBLIC, anon, authenticated;
GRANT DELETE ON TABLE public.campaign_shop_items TO authenticated;

CREATE POLICY campaign_shop_items_dm_delete
	ON public.campaign_shop_items
	FOR DELETE TO authenticated
	USING (public.is_campaign_dm(campaign_id));

CREATE POLICY campaign_shop_items_dm_delete_boundary
	ON public.campaign_shop_items
	AS RESTRICTIVE FOR DELETE TO authenticated
	USING (public.is_campaign_dm(campaign_id));

-- 來源 migration: 20261027000000_campaign_shop_cart_checkout.sql
ALTER TABLE public.campaign_shop_orders
	ADD COLUMN checkout_id text;

CREATE INDEX campaign_shop_orders_checkout_idx
	ON public.campaign_shop_orders (checkout_id, created_at)
	WHERE checkout_id IS NOT NULL;

CREATE UNIQUE INDEX campaign_shop_orders_checkout_item_uidx
	ON public.campaign_shop_orders (checkout_id, shop_item_id)
	WHERE checkout_id IS NOT NULL;

GRANT SELECT (checkout_id)
	ON public.campaign_shop_orders TO authenticated;

CREATE OR REPLACE FUNCTION public.checkout_campaign_shop_cart(
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
AS $checkout_campaign_shop_cart$
DECLARE
	v_checkout_id text := gen_random_uuid()::text;
	v_shop_name text;
	v_shop_active boolean;
	v_requires_approval boolean := false;
	v_line record;
	v_item public.campaign_shop_items%ROWTYPE;
	v_order_id text;
BEGIN
	IF auth.uid() IS NULL
		OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役結帳。' USING ERRCODE = '42501';
	END IF;
	IF p_wallet_type IS NULL OR p_wallet_type NOT IN ('public', 'private')
		OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
		RAISE EXCEPTION '購物車或付款錢包無效。' USING ERRCODE = '22023';
	END IF;
	IF jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 100 THEN
		RAISE EXCEPTION '購物車商品數量無效。' USING ERRCODE = '22023';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_items) AS line(value)
		WHERE jsonb_typeof(line.value) IS DISTINCT FROM 'object'
			OR COALESCE(line.value ->> 'shop_item_id', '') = ''
			OR COALESCE(line.value ->> 'quantity', '') !~ '^[1-9][0-9]{0,9}$'
		OR CASE
			WHEN (line.value ->> 'quantity') ~ '^[1-9][0-9]{0,9}$'
				THEN (line.value ->> 'quantity')::numeric > 2147483647
			ELSE false
		END
	) OR (
		SELECT count(*) <> count(DISTINCT line.value ->> 'shop_item_id')
		FROM jsonb_array_elements(p_items) AS line(value)
	) THEN
		RAISE EXCEPTION '購物車商品或數量無效，且每項商品只能出現一次。'
			USING ERRCODE = '22023';
	END IF;

	PERFORM public.campaign_shop_assert_buyer_access(
		p_campaign_id, p_character_id, p_wallet_type
	);

	SELECT shop.name, shop.is_active
	INTO v_shop_name, v_shop_active
	FROM public.campaign_shops AS shop
	WHERE shop.id = p_shop_id
		AND shop.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND OR NOT v_shop_active THEN
		RAISE EXCEPTION '商店不存在或已停用。' USING ERRCODE = '22023';
	END IF;

	FOR v_line IN
		SELECT
			line.value ->> 'shop_item_id' AS shop_item_id,
			(line.value ->> 'quantity')::integer AS quantity
		FROM jsonb_array_elements(p_items) AS line(value)
		ORDER BY line.value ->> 'shop_item_id'
	LOOP
		SELECT shop_item.*
		INTO v_item
		FROM public.campaign_shop_items AS shop_item
		WHERE shop_item.id = v_line.shop_item_id
			AND shop_item.campaign_id = p_campaign_id
			AND shop_item.shop_id = p_shop_id
			AND shop_item.is_active
		FOR UPDATE;
		IF NOT FOUND THEN
			RAISE EXCEPTION '商品不存在或已停用。' USING ERRCODE = '22023';
		END IF;
		IF v_item.stock_available < v_line.quantity THEN
			RAISE EXCEPTION '商品「%」庫存不足。', v_item.item_snapshot ->> 'name'
				USING ERRCODE = '23514';
		END IF;
		v_requires_approval :=
			v_requires_approval OR v_item.requires_approval;
	END LOOP;

	FOR v_line IN
		SELECT
			line.value ->> 'shop_item_id' AS shop_item_id,
			(line.value ->> 'quantity')::integer AS quantity
		FROM jsonb_array_elements(p_items) AS line(value)
		ORDER BY line.value ->> 'shop_item_id'
	LOOP
		SELECT shop_item.*
		INTO v_item
		FROM public.campaign_shop_items AS shop_item
		WHERE shop_item.id = v_line.shop_item_id
			AND shop_item.campaign_id = p_campaign_id
			AND shop_item.shop_id = p_shop_id;

		v_order_id := gen_random_uuid()::text;
		INSERT INTO public.campaign_shop_orders (
			id, checkout_id, campaign_id, shop_id, shop_item_id, buyer_user_id,
			character_id, item_snapshot, shop_name_snapshot, unit_price_gp,
			quantity, total_price_gp, status, requires_approval
		)
		VALUES (
			v_order_id, v_checkout_id, p_campaign_id, p_shop_id, v_item.id,
			auth.uid(), p_character_id, v_item.item_snapshot, v_shop_name,
			v_item.unit_price_gp, v_line.quantity,
			v_item.unit_price_gp * v_line.quantity, 'pending',
			v_requires_approval
		);
		INSERT INTO public.campaign_shop_order_payments (order_id, wallet_type)
		VALUES (v_order_id, p_wallet_type);

		IF v_requires_approval THEN
			UPDATE public.campaign_shop_items
			SET stock_available = stock_available - v_line.quantity,
				stock_reserved = stock_reserved + v_line.quantity
			WHERE id = v_item.id AND campaign_id = p_campaign_id;
		ELSE
			PERFORM public.campaign_shop_settle_order(v_order_id, false);
		END IF;
	END LOOP;

	RETURN v_checkout_id;
END
$checkout_campaign_shop_cart$;

CREATE OR REPLACE FUNCTION public.campaign_shop_transition_cart(
	p_order_id text,
	p_action text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_shop_transition_cart$
DECLARE
	v_seed public.campaign_shop_orders%ROWTYPE;
	v_order public.campaign_shop_orders%ROWTYPE;
	v_item public.campaign_shop_items%ROWTYPE;
	v_target_status text;
BEGIN
	IF auth.uid() IS NULL OR p_action NOT IN ('approve', 'reject', 'cancel') THEN
		RAISE EXCEPTION '購物車處理方式無效。' USING ERRCODE = '22023';
	END IF;
	SELECT * INTO v_seed
	FROM public.campaign_shop_orders
	WHERE id = p_order_id;
	IF NOT FOUND OR v_seed.checkout_id IS NULL THEN
		RAISE EXCEPTION '找不到購物車交易。' USING ERRCODE = '22023';
	END IF;

	IF p_action IN ('approve', 'reject') THEN
		IF NOT public.is_campaign_dm(v_seed.campaign_id) THEN
			RAISE EXCEPTION '只有該戰役 DM 可以審查此請求。'
				USING ERRCODE = '42501';
		END IF;
		v_target_status := CASE p_action
			WHEN 'approve' THEN 'completed'
			ELSE 'rejected'
		END;
	ELSE
		IF v_seed.buyer_user_id <> auth.uid()
			OR NOT public.is_campaign_member_or_dm(v_seed.campaign_id) THEN
			RAISE EXCEPTION '無權取消此購物車請求。' USING ERRCODE = '42501';
		END IF;
		v_target_status := 'cancelled';
	END IF;

	FOR v_order IN
		SELECT *
		FROM public.campaign_shop_orders
		WHERE checkout_id = v_seed.checkout_id
			AND campaign_id = v_seed.campaign_id
		ORDER BY shop_item_id, id
		FOR UPDATE
	LOOP
		IF v_order.status <> 'pending'
			OR v_order.requires_approval IS NOT TRUE
			OR v_order.buyer_user_id <> v_seed.buyer_user_id
			OR v_order.character_id <> v_seed.character_id THEN
			RAISE EXCEPTION '購物車請求已處理或資料不一致。'
				USING ERRCODE = '22023';
		END IF;

		IF p_action = 'approve' THEN
			PERFORM public.campaign_shop_settle_order(v_order.id, true);
		ELSE
			SELECT * INTO v_item
			FROM public.campaign_shop_items
			WHERE id = v_order.shop_item_id
				AND campaign_id = v_order.campaign_id
			FOR UPDATE;
			IF NOT FOUND OR v_item.stock_reserved < v_order.quantity THEN
				RAISE EXCEPTION '保留庫存資料不一致。' USING ERRCODE = '23514';
			END IF;
			UPDATE public.campaign_shop_items
			SET stock_reserved = stock_reserved - v_order.quantity,
				stock_available = stock_available + v_order.quantity
			WHERE id = v_item.id AND campaign_id = v_order.campaign_id;
			UPDATE public.campaign_shop_orders
			SET status = v_target_status,
				reviewed_by = CASE WHEN p_action = 'reject' THEN auth.uid() ELSE NULL END,
				reviewed_at = CASE WHEN p_action = 'reject' THEN now() ELSE NULL END,
				updated_at = now()
			WHERE id = v_order.id;
		END IF;
	END LOOP;

	RETURN v_seed.checkout_id;
END
$campaign_shop_transition_cart$;

ALTER FUNCTION public.approve_campaign_shop_order(text)
	RENAME TO approve_campaign_shop_order_single;
ALTER FUNCTION public.reject_campaign_shop_order(text)
	RENAME TO reject_campaign_shop_order_single;
ALTER FUNCTION public.cancel_campaign_shop_order(text)
	RENAME TO cancel_campaign_shop_order_single;

CREATE OR REPLACE FUNCTION public.approve_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $approve_campaign_shop_order$
DECLARE
	v_checkout_id text;
BEGIN
	SELECT checkout_id INTO v_checkout_id
	FROM public.campaign_shop_orders
	WHERE id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到待審請求。' USING ERRCODE = '22023';
	END IF;
	IF v_checkout_id IS NULL THEN
		RETURN public.approve_campaign_shop_order_single(p_order_id);
	END IF;
	RETURN public.campaign_shop_transition_cart(p_order_id, 'approve');
END
$approve_campaign_shop_order$;

CREATE OR REPLACE FUNCTION public.reject_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $reject_campaign_shop_order$
DECLARE
	v_checkout_id text;
BEGIN
	SELECT checkout_id INTO v_checkout_id
	FROM public.campaign_shop_orders
	WHERE id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到待審請求。' USING ERRCODE = '22023';
	END IF;
	IF v_checkout_id IS NULL THEN
		RETURN public.reject_campaign_shop_order_single(p_order_id);
	END IF;
	RETURN public.campaign_shop_transition_cart(p_order_id, 'reject');
END
$reject_campaign_shop_order$;

CREATE OR REPLACE FUNCTION public.cancel_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $cancel_campaign_shop_order$
DECLARE
	v_checkout_id text;
BEGIN
	SELECT checkout_id INTO v_checkout_id
	FROM public.campaign_shop_orders
	WHERE id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到待審請求。' USING ERRCODE = '22023';
	END IF;
	IF v_checkout_id IS NULL THEN
		RETURN public.cancel_campaign_shop_order_single(p_order_id);
	END IF;
	RETURN public.campaign_shop_transition_cart(p_order_id, 'cancel');
END
$cancel_campaign_shop_order$;

REVOKE ALL ON FUNCTION public.checkout_campaign_shop_cart(text, text, text, text, jsonb),
	public.campaign_shop_transition_cart(text, text),
	public.approve_campaign_shop_order_single(text),
	public.reject_campaign_shop_order_single(text),
	public.cancel_campaign_shop_order_single(text),
	public.approve_campaign_shop_order(text),
	public.reject_campaign_shop_order(text),
	public.cancel_campaign_shop_order(text)
	FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.checkout_campaign_shop_cart(text, text, text, text, jsonb),
	public.approve_campaign_shop_order(text),
	public.reject_campaign_shop_order(text),
	public.cancel_campaign_shop_order(text)
	TO authenticated;

-- 來源 migration: 20261027000001_campaign_shop_refresh.sql
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

-- 來源 migration: 20261027000002_campaign_shop_refresh_delete.sql
ALTER FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) RENAME TO refresh_campaign_shop_items_with_retirement;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items_with_retirement(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.refresh_campaign_shop_items(
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
	v_result jsonb;
	v_deleted integer := 0;
BEGIN
	v_result := public.refresh_campaign_shop_items_with_retirement(
		p_campaign_id,
		p_shop_id,
		p_expected_shop_updated_at,
		p_expected_items,
		p_keep_items,
		p_changes
	);

	IF NOT p_keep_items THEN
		DELETE FROM public.campaign_shop_items
		WHERE campaign_id = p_campaign_id
			AND shop_id = p_shop_id
			AND NOT is_active;
		GET DIAGNOSTICS v_deleted = ROW_COUNT;
	END IF;

	RETURN (v_result - 'retired')
		|| jsonb_build_object('deleted', v_deleted);
END
$refresh_campaign_shop_items$;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) TO authenticated;

-- 來源 migration: 20261028000000_item_base_unification.sql
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
	v_base jsonb;
	v_properties jsonb;
BEGIN
	IF TG_OP = 'UPDATE'
		AND NEW.item_base IS NOT DISTINCT FROM OLD.item_base
		AND NEW.item_base IS NOT NULL THEN
		v_base := OLD.item_base;
		IF NEW.name IS DISTINCT FROM OLD.name THEN
			v_base := jsonb_set(v_base, '{name}', to_jsonb(NEW.name), true);
		END IF;
		IF NEW.category IS DISTINCT FROM OLD.category THEN
			v_category := CASE
				WHEN NEW.category = 'Consumable' THEN 'AdventureGear'
				ELSE NEW.category
			END;
			v_base := (v_base - 'weaponProperties' - 'armorProperties')
				|| jsonb_build_object('category', v_category);
		END IF;
		IF NEW.sub_type IS DISTINCT FROM OLD.sub_type THEN
			v_base := jsonb_set(
				v_base,
				'{subTypes}',
				CASE
					WHEN COALESCE(NEW.sub_type, '') = '' THEN '[]'::jsonb
					ELSE jsonb_build_array(NEW.sub_type)
				END,
				true
			);
		END IF;
		IF NEW.rarity IS DISTINCT FROM OLD.rarity THEN
			v_base := jsonb_set(v_base, '{rarity}', to_jsonb(NEW.rarity), true);
		END IF;
		IF NEW.icon IS DISTINCT FROM OLD.icon THEN
			v_base := jsonb_set(v_base, '{icon}', to_jsonb(NEW.icon), true);
		END IF;
		IF NEW.weight IS DISTINCT FROM OLD.weight THEN
			v_base := jsonb_set(v_base, '{weight}', to_jsonb(NEW.weight), true);
		END IF;
		IF NEW.value_gp IS DISTINCT FROM OLD.value_gp THEN
			v_base := jsonb_set(v_base, '{valueGp}', to_jsonb(NEW.value_gp), true);
		END IF;
		IF NEW.affixes IS DISTINCT FROM OLD.affixes THEN
			v_base := jsonb_set(
				v_base,
				'{affixes}',
				COALESCE(NEW.affixes, '[]'::jsonb),
				true
			);
		END IF;
		IF NEW.effects IS DISTINCT FROM OLD.effects THEN
			v_base := jsonb_set(v_base, '{effects}', to_jsonb(NEW.effects), true);
		END IF;
		IF NEW.flavor IS DISTINCT FROM OLD.flavor THEN
			v_base := jsonb_set(v_base, '{flavor}', to_jsonb(NEW.flavor), true);
		END IF;
		IF NEW.dm_notes IS DISTINCT FROM OLD.dm_notes THEN
			v_base := jsonb_set(v_base, '{dmNotes}', to_jsonb(NEW.dm_notes), true);
		END IF;
		IF NEW.max_charges IS DISTINCT FROM OLD.max_charges THEN
			v_base := jsonb_set(
				v_base,
				'{maxCharges}',
				to_jsonb(NEW.max_charges),
				true
			);
		END IF;
		IF NEW.is_equippable IS DISTINCT FROM OLD.is_equippable THEN
			v_base := jsonb_set(
				v_base,
				'{isEquippable}',
				to_jsonb(NEW.is_equippable),
				true
			);
		END IF;
		IF NEW.is_consumable IS DISTINCT FROM OLD.is_consumable
			OR NEW.category IS DISTINCT FROM OLD.category THEN
			v_base := jsonb_set(
				v_base,
				'{isConsumable}',
				to_jsonb(NEW.is_consumable OR NEW.category = 'Consumable'),
				true
			);
		END IF;
		IF NEW.requires_attunement IS DISTINCT FROM OLD.requires_attunement THEN
			v_base := jsonb_set(
				v_base,
				'{isRequireAttunement}',
				to_jsonb(NEW.requires_attunement),
				true
			);
		END IF;

		IF v_base ->> 'category' = 'Weapon'
			AND (
				NEW.category IS DISTINCT FROM OLD.category
				OR NEW.damage IS DISTINCT FROM OLD.damage
				OR NEW.mastery IS DISTINCT FROM OLD.mastery
			) THEN
			v_properties := COALESCE(
				v_base -> 'weaponProperties',
				'{"properties": []}'::jsonb
			);
			v_properties := jsonb_set(
				v_properties,
				'{damage}',
				to_jsonb(NEW.damage),
				true
			);
			IF NEW.mastery IS NULL OR NEW.mastery = 'None' THEN
				v_properties := v_properties - 'mastery';
			ELSE
				v_properties := jsonb_set(
					v_properties,
					'{mastery}',
					to_jsonb(NEW.mastery),
					true
				);
			END IF;
			v_base := jsonb_set(
				v_base,
				'{weaponProperties}',
				v_properties,
				true
			);
		ELSIF v_base ->> 'category' = 'Armor'
			AND (
				NEW.category IS DISTINCT FROM OLD.category
				OR NEW.ac IS DISTINCT FROM OLD.ac
			) THEN
			v_base := jsonb_set(
				v_base,
				'{armorProperties}',
				jsonb_build_object('ac', NEW.ac),
				true
			);
		END IF;

		NEW.item_base := v_base;
		RETURN NEW;
	END IF;

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
		'isConsumable', NEW.is_consumable OR NEW.category = 'Consumable',
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
	BEFORE INSERT OR UPDATE OF
		item_base, name, category, sub_type, rarity, icon, damage, mastery, ac,
		weight, value_gp, requires_attunement, max_charges, effects, flavor,
		dm_notes, is_equippable, is_consumable, affixes
	ON public.inventory_items
	FOR EACH ROW EXECUTE FUNCTION public.populate_legacy_item_base();

CREATE TRIGGER blacksmith_items_populate_item_base
	BEFORE INSERT OR UPDATE OF
		item_base, name, category, sub_type, rarity, icon, damage, mastery, ac,
		weight, value_gp, requires_attunement, max_charges, effects, flavor,
		dm_notes, is_equippable, is_consumable, affixes
	ON public.blacksmith_items
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
GRANT EXECUTE ON FUNCTION public.is_valid_blacksmith_affixes(jsonb)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.is_valid_item_base(jsonb)
	TO authenticated, service_role;

ALTER TABLE public.inventory_items
	ADD CONSTRAINT inventory_items_item_base_valid_check
	CHECK (item_base IS NULL OR public.is_valid_item_base(item_base));

ALTER TABLE public.blacksmith_items
	ADD CONSTRAINT blacksmith_items_item_base_valid_check
	CHECK (item_base IS NULL OR public.is_valid_item_base(item_base));

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

-- 來源 migration: 20261028000001_campaign_shop_refresh_categories.sql
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

-- 來源 migration: 20261028000002_campaign_official_catalogs.sql
CREATE OR REPLACE FUNCTION public.campaign_official_catalog_ids_are_valid(
	p_catalog_ids text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $campaign_official_catalog_ids_are_valid$
SELECT p_catalog_ids IS NOT NULL
	AND array_position(p_catalog_ids, NULL) IS NULL
		AND cardinality(p_catalog_ids) = (
			SELECT count(DISTINCT catalog_id)::integer
			FROM unnest(p_catalog_ids) AS catalog(catalog_id)
		)
		AND NOT EXISTS (
			SELECT 1
			FROM unnest(p_catalog_ids) AS catalog(catalog_id)
			WHERE catalog_id !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
				OR catalog_id LIKE '%..%'
		);
$campaign_official_catalog_ids_are_valid$;

REVOKE ALL ON FUNCTION public.campaign_official_catalog_ids_are_valid(text[])
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_official_catalog_ids_are_valid(text[])
	TO authenticated, service_role;

ALTER TABLE public.campaigns
	ADD COLUMN IF NOT EXISTS official_catalog_ids text[] NOT NULL
		DEFAULT ARRAY[]::text[];

DO $campaign_official_catalog_ids$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.campaigns
		WHERE official_catalog_ids IS NULL
			OR NOT public.campaign_official_catalog_ids_are_valid(
				official_catalog_ids
			)
	) THEN
		RAISE EXCEPTION
			'campaigns.official_catalog_ids 有無效資料；請先確認規則書 ID 後再套用 migration。';
	END IF;

	ALTER TABLE public.campaigns
		ALTER COLUMN official_catalog_ids SET DEFAULT ARRAY[]::text[],
		ALTER COLUMN official_catalog_ids SET NOT NULL;
END
$campaign_official_catalog_ids$;

ALTER TABLE public.campaigns
	DROP CONSTRAINT IF EXISTS campaigns_official_catalog_ids_valid;
ALTER TABLE public.campaigns
	ADD CONSTRAINT campaigns_official_catalog_ids_valid
	CHECK (
		public.campaign_official_catalog_ids_are_valid(official_catalog_ids)
	);

GRANT UPDATE (official_catalog_ids)
	ON public.campaigns TO authenticated;

-- 來源 migration: 20261028000003_campaign_shop_refresh_latest_rulebooks.sql
CREATE OR REPLACE FUNCTION public.campaign_shop_expand_rulebook_policy(
	p_policy jsonb,
	p_catalog_ids text[]
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $campaign_shop_expand_rulebook_policy$
DECLARE
	v_rule jsonb;
	v_candidate jsonb;
	v_candidates jsonb;
	v_rules jsonb := '[]'::jsonb;
BEGIN
	FOR v_rule IN
		SELECT value
		FROM jsonb_array_elements(p_policy -> 'rules')
	LOOP
		v_candidates := '[]'::jsonb;
		FOR v_candidate IN
			SELECT value
			FROM jsonb_array_elements(v_rule -> 'possibleItemsOrFilters')
		LOOP
			IF v_candidate ->> 'source' = '__campaign_rulebooks__' THEN
				v_candidates := v_candidates || COALESCE(
					(
						SELECT jsonb_agg(
							jsonb_set(v_candidate, '{source}', to_jsonb(catalog_id))
						)
						FROM unnest(p_catalog_ids) AS catalog(catalog_id)
					),
					'[]'::jsonb
				);
			ELSE
				v_candidates := v_candidates || jsonb_build_array(v_candidate);
			END IF;
		END LOOP;
		v_rules := v_rules || jsonb_build_array(
			jsonb_set(
				v_rule,
				'{possibleItemsOrFilters}',
				v_candidates,
				true
			)
		);
	END LOOP;

	RETURN jsonb_set(p_policy, '{rules}', v_rules, true);
END
$campaign_shop_expand_rulebook_policy$;

REVOKE ALL ON FUNCTION public.campaign_shop_expand_rulebook_policy(
	jsonb, text[]
) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) RENAME TO refresh_campaign_shop_items_before_latest_rulebooks;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items_before_latest_rulebooks(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.refresh_campaign_shop_items(
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
	v_catalog_ids text[];
	v_expanded_policy jsonb;
	v_effective_updated_at timestamptz;
	v_result jsonb;
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_dm(p_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以刷新商店商品。'
			USING ERRCODE = '42501';
	END IF;

	SELECT shop.*
	INTO v_shop
	FROM public.campaign_shops AS shop
	WHERE shop.id = p_shop_id
		AND shop.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店不存在或不屬於此戰役。'
			USING ERRCODE = '22023';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM jsonb_array_elements(v_shop.refresh_policy -> 'rules') AS rule(value)
		CROSS JOIN jsonb_array_elements(
			rule.value -> 'possibleItemsOrFilters'
		) AS candidate(value)
		WHERE candidate.value ->> 'source' = '__campaign_rulebooks__'
	) THEN
		RETURN public.refresh_campaign_shop_items_before_latest_rulebooks(
			p_campaign_id,
			p_shop_id,
			p_expected_shop_updated_at,
			p_expected_items,
			p_keep_items,
			p_changes
		);
	END IF;

	IF p_expected_shop_updated_at IS NULL
		OR v_shop.updated_at IS DISTINCT FROM p_expected_shop_updated_at THEN
		RAISE EXCEPTION '商店資料已更新，請重新載入並產生刷新預覽。'
			USING ERRCODE = '40001';
	END IF;

	SELECT campaign.official_catalog_ids
	INTO v_catalog_ids
	FROM public.campaigns AS campaign
	WHERE campaign.id = p_campaign_id;
	IF NOT FOUND OR v_catalog_ids IS NULL THEN
		RAISE EXCEPTION '找不到戰役目前的官方規則書設定。'
			USING ERRCODE = '22023';
	END IF;

	v_expanded_policy := public.campaign_shop_expand_rulebook_policy(
		v_shop.refresh_policy,
		v_catalog_ids
	);

	UPDATE public.campaign_shops
	SET refresh_policy = v_expanded_policy
	WHERE id = p_shop_id
		AND campaign_id = p_campaign_id
	RETURNING updated_at INTO v_effective_updated_at;

	v_result := public.refresh_campaign_shop_items_before_latest_rulebooks(
		p_campaign_id,
		p_shop_id,
		v_effective_updated_at,
		p_expected_items,
		p_keep_items,
		p_changes
	);

	UPDATE public.campaign_shops
	SET refresh_policy = v_shop.refresh_policy
	WHERE id = p_shop_id
		AND campaign_id = p_campaign_id;

	RETURN v_result;
END
$refresh_campaign_shop_items$;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) TO authenticated;

-- 來源 migration: 20261028000004_campaign_shop_unidentified_items.sql
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

-- 來源 migration: 20261029000000_unidentified_item_security.sql
DO $unidentified_items_preflight$
DECLARE
	required_columns text[][] := ARRAY[
		ARRAY['campaigns', 'id', 'text'],
		ARRAY['campaigns', 'dm_id', 'text'],
		ARRAY['campaign_shop_items', 'id', 'text'],
		ARRAY['campaign_shop_items', 'campaign_id', 'text'],
		ARRAY['campaign_shop_items', 'item_snapshot', 'jsonb'],
		ARRAY['campaign_shop_orders', 'id', 'text'],
		ARRAY['campaign_shop_orders', 'campaign_id', 'text'],
		ARRAY['campaign_shop_orders', 'item_snapshot', 'jsonb'],
		ARRAY['inventory_items', 'id', 'text'],
		ARRAY['inventory_items', 'campaign_id', 'text'],
		ARRAY['inventory_items', 'is_identified', 'boolean'],
		ARRAY['inventory_items', 'item_base', 'jsonb']
	];
	expected text[];
	actual_type text;
BEGIN
	FOREACH expected SLICE 1 IN ARRAY required_columns LOOP
		IF to_regclass(format('public.%I', expected[1])) IS NULL THEN
			RAISE EXCEPTION '未鑑定物品 migration 前置檢查失敗：public.% 不存在。',
				expected[1];
		END IF;
		SELECT format_type(attribute.atttypid, attribute.atttypmod)
		INTO actual_type
		FROM pg_attribute AS attribute
		WHERE attribute.attrelid = to_regclass(format('public.%I', expected[1]))
			AND attribute.attname = expected[2]
			AND attribute.attnum > 0
			AND NOT attribute.attisdropped;
		IF actual_type IS DISTINCT FROM expected[3] THEN
			RAISE EXCEPTION
				'未鑑定物品 migration 前置檢查失敗：public.%.% 預期型別為 %，實際為 %。',
				expected[1], expected[2], expected[3],
				COALESCE(actual_type, '缺少欄位');
		END IF;
	END LOOP;

	IF to_regprocedure('public.is_valid_item_base(jsonb)') IS NULL
		OR to_regprocedure('public.is_campaign_dm(text)') IS NULL
		OR to_regprocedure('public.is_campaign_member_or_dm(text)') IS NULL
		OR to_regprocedure('public.campaign_shop_assert_buyer_access(text, text, text)') IS NULL THEN
		RAISE EXCEPTION '未鑑定物品 migration 缺少必要的驗證函式。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.campaign_shop_items AS item
		WHERE jsonb_typeof(item.item_snapshot) IS DISTINCT FROM 'object'
			OR NOT public.is_valid_item_base(item.item_snapshot -> 'item_base')
	) THEN
		RAISE EXCEPTION
			'商店商品缺少有效 item_base；請先人工修復資料，未變更任何資料。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.inventory_items AS item
		WHERE item.is_identified IS NULL
			OR (
				item.is_identified IS FALSE
				AND public.is_valid_item_base(item.item_base) IS DISTINCT FROM true
			)
	) THEN
		RAISE EXCEPTION
			'背包物品鑑定狀態為 NULL 或未鑑定列缺少有效 item_base；請先人工修復資料，未變更任何資料。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.campaign_shop_orders AS order_row
		WHERE order_row.status = 'pending'
			AND NOT public.is_valid_item_base(order_row.item_snapshot -> 'item_base')
	) THEN
		RAISE EXCEPTION
			'待審訂單缺少有效 item_base；請先人工修復資料，未變更任何資料。';
	END IF;
END
$unidentified_items_preflight$;

ALTER TABLE public.campaign_shop_items
	ADD COLUMN item_identified_snapshot jsonb,
	ADD COLUMN is_identified boolean NOT NULL DEFAULT true;
ALTER TABLE public.campaign_shop_items
	ALTER COLUMN item_snapshot DROP NOT NULL;

ALTER TABLE public.inventory_items
	ADD COLUMN item_identified_snapshot jsonb;

ALTER TABLE public.campaign_shop_orders
	ADD COLUMN item_identified_snapshot jsonb,
	ADD COLUMN is_identified boolean NOT NULL DEFAULT true;

ALTER TABLE public.campaign_shop_items
	DROP CONSTRAINT IF EXISTS campaign_shop_items_item_snapshot_check;

CREATE OR REPLACE FUNCTION public.campaign_shop_unidentified_item_base(p_item_base jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $campaign_shop_unidentified_item_base$
DECLARE
	v_category text := p_item_base ->> 'category';
	v_safe jsonb;
BEGIN
	IF public.is_valid_item_base(p_item_base) IS DISTINCT FROM true THEN
		RAISE EXCEPTION '物品定義格式無效。' USING ERRCODE = '22023';
	END IF;
	v_safe := jsonb_build_object(
		'name', '未鑑定物品',
		'category', v_category,
		'subTypes', p_item_base -> 'subTypes',
		'rarity', 'Common',
		'icon', 'HelpCircle',
		'weight', p_item_base -> 'weight',
		'valueGp', 0,
		'affixes', '[]'::jsonb,
		'effects', '',
		'flavor', '',
		'dmNotes', '',
		'maxCharges', 0,
		'isEquippable', false,
		'isConsumable', false,
		'isRequireAttunement', false
	);
	IF v_category = 'Weapon' THEN
		v_safe := v_safe || jsonb_build_object(
			'weaponProperties',
			jsonb_build_object('damage', '未鑑定', 'properties', '[]'::jsonb)
		);
	ELSIF v_category = 'Armor' THEN
		v_safe := v_safe || jsonb_build_object(
			'armorProperties', jsonb_build_object('ac', '未鑑定')
		);
	END IF;
	RETURN v_safe;
END
$campaign_shop_unidentified_item_base$;

CREATE OR REPLACE FUNCTION public.campaign_shop_public_item_snapshot(p_item_base jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $campaign_shop_public_item_snapshot$
BEGIN
	IF public.is_valid_item_base(p_item_base) IS DISTINCT FROM true THEN
		RAISE EXCEPTION '物品定義格式無效。' USING ERRCODE = '22023';
	END IF;
	RETURN jsonb_build_object(
		'category', p_item_base -> 'category',
		'subTypes', p_item_base -> 'subTypes',
		'weight', p_item_base -> 'weight'
	);
END
$campaign_shop_public_item_snapshot$;

UPDATE public.campaign_shop_items AS item
SET is_identified = COALESCE((item.item_snapshot ->> 'is_identified')::boolean, true),
	item_identified_snapshot = CASE
		WHEN COALESCE((item.item_snapshot ->> 'is_identified')::boolean, true)
			THEN NULL
		ELSE item.item_snapshot - 'is_identified'
	END,
	item_snapshot = CASE
		WHEN COALESCE((item.item_snapshot ->> 'is_identified')::boolean, true)
			THEN item.item_snapshot - 'is_identified'
		ELSE jsonb_build_object(
			'category', item.item_snapshot #> '{item_base,category}',
			'subTypes', item.item_snapshot #> '{item_base,subTypes}',
			'weight', item.item_snapshot #> '{item_base,weight}'
		)
	END;

UPDATE public.inventory_items AS item
SET item_identified_snapshot = jsonb_build_object(
		'item_base', item.item_base,
		'is_homebrew', item.is_homebrew,
		'is_important', item.is_important
	),
	name = '未鑑定物品',
	category = CASE
		WHEN item.item_base ->> 'category' = 'Weapon' THEN 'Weapon'
		WHEN item.item_base ->> 'category' = 'Armor' THEN 'Armor'
		WHEN COALESCE((item.item_base ->> 'isConsumable')::boolean, false)
			OR item.item_base ->> 'category' IN ('Potion', 'Poison', 'Scroll')
			THEN 'Consumable'
		ELSE 'Misc'
	END,
	sub_type = COALESCE(item.item_base #>> '{subTypes,0}', ''),
	rarity = 'Common',
	icon = 'HelpCircle',
	damage = NULL,
	mastery = 'None',
	ac = NULL,
	weight = (item.item_base ->> 'weight')::numeric,
	value_gp = 0,
	is_homebrew = false,
	requires_attunement = false,
	is_identified = false,
	max_charges = 0,
	effects = '',
	flavor = '',
	dm_notes = '',
	is_equippable = false,
	is_consumable = false,
	is_important = false,
	affixes = '[]'::jsonb,
	item_base = public.campaign_shop_unidentified_item_base(item.item_base)
WHERE item.is_identified IS FALSE;

UPDATE public.campaign_shop_orders AS order_row
SET is_identified = COALESCE((order_row.item_snapshot ->> 'is_identified')::boolean, true),
	item_identified_snapshot = CASE
		WHEN order_row.status = 'pending'
			AND COALESCE((order_row.item_snapshot ->> 'is_identified')::boolean, true) = false
			THEN order_row.item_snapshot - 'is_identified'
		ELSE NULL
	END,
	item_snapshot = CASE
		WHEN COALESCE((order_row.item_snapshot ->> 'is_identified')::boolean, true)
			THEN order_row.item_snapshot - 'is_identified'
		ELSE jsonb_build_object(
			'category', order_row.item_snapshot #> '{item_base,category}',
			'subTypes', order_row.item_snapshot #> '{item_base,subTypes}',
			'weight', order_row.item_snapshot #> '{item_base,weight}'
		)
	END;

ALTER TABLE public.inventory_items
	ALTER COLUMN is_identified SET DEFAULT true,
	ALTER COLUMN is_identified SET NOT NULL;

CREATE OR REPLACE FUNCTION public.inventory_items_protect_unidentified_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $inventory_items_protect_unidentified_snapshot$
DECLARE
	v_snapshot jsonb;
	v_base jsonb;
	v_category text;
BEGIN
	IF NEW.is_identified IS TRUE THEN
		RETURN NEW;
	END IF;

	IF TG_OP = 'INSERT' OR OLD.is_identified IS TRUE THEN
		v_snapshot := NEW.item_identified_snapshot;
		IF v_snapshot IS NULL THEN
			v_snapshot := jsonb_build_object(
				'item_base', NEW.item_base,
				'is_homebrew', NEW.is_homebrew,
				'is_important', NEW.is_important
			);
		END IF;
	ELSE
		v_snapshot := COALESCE(NEW.item_identified_snapshot, OLD.item_identified_snapshot);
	END IF;

	v_base := v_snapshot -> 'item_base';
	IF jsonb_typeof(v_snapshot) IS DISTINCT FROM 'object'
		OR public.is_valid_item_base(v_base) IS DISTINCT FROM true THEN
		RAISE EXCEPTION '未鑑定物品必須具有有效的真實物品定義。'
			USING ERRCODE = '23514';
	END IF;
	NEW.item_identified_snapshot := v_snapshot;
	v_category := v_base ->> 'category';
	NEW.name := '未鑑定物品';
	NEW.category := CASE
		WHEN v_category = 'Weapon' THEN 'Weapon'
		WHEN v_category = 'Armor' THEN 'Armor'
		WHEN COALESCE((v_base ->> 'isConsumable')::boolean, false)
			OR v_category IN ('Potion', 'Poison', 'Scroll') THEN 'Consumable'
		ELSE 'Misc'
	END;
	NEW.sub_type := COALESCE(v_base #>> '{subTypes,0}', '');
	NEW.rarity := 'Common';
	NEW.icon := 'HelpCircle';
	NEW.damage := NULL;
	NEW.mastery := 'None';
	NEW.ac := NULL;
	NEW.weight := (v_base ->> 'weight')::numeric;
	NEW.value_gp := 0;
	NEW.requires_attunement := false;
	NEW.max_charges := 0;
	NEW.effects := '';
	NEW.flavor := '';
	NEW.dm_notes := '';
	NEW.is_equippable := false;
	NEW.is_consumable := false;
	NEW.is_homebrew := false;
	NEW.is_important := false;
	NEW.affixes := '[]'::jsonb;
	NEW.item_base := public.campaign_shop_unidentified_item_base(v_base);
	RETURN NEW;
END
$inventory_items_protect_unidentified_snapshot$;

CREATE TRIGGER inventory_items_protect_unidentified_snapshot
	BEFORE INSERT OR UPDATE ON public.inventory_items
	FOR EACH ROW EXECUTE FUNCTION public.inventory_items_protect_unidentified_snapshot();

ALTER TABLE public.campaign_shop_items
	ADD CONSTRAINT campaign_shop_items_item_snapshot_safe_check CHECK (
		(
			is_identified
			AND item_identified_snapshot IS NULL
			AND jsonb_typeof(item_snapshot) = 'object'
			AND item_snapshot ?& ARRAY['name', 'category', 'rarity', 'icon', 'item_base']
			AND public.is_valid_item_base(item_snapshot -> 'item_base')
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
			AND public.is_valid_item_base(item_identified_snapshot -> 'item_base')
		)
	),
	ADD CONSTRAINT campaign_shop_items_secret_snapshot_object_check CHECK (
		item_identified_snapshot IS NULL
		OR jsonb_typeof(item_identified_snapshot) = 'object'
	);

ALTER TABLE public.inventory_items
	ADD CONSTRAINT inventory_items_secret_snapshot_object_check CHECK (
		item_identified_snapshot IS NULL
		OR (
			jsonb_typeof(item_identified_snapshot) = 'object'
			AND public.is_valid_item_base(item_identified_snapshot -> 'item_base')
		)
	),
	ADD CONSTRAINT inventory_items_unidentified_snapshot_required_check CHECK (
		is_identified OR item_identified_snapshot IS NOT NULL
	);

ALTER TABLE public.campaign_shop_orders
	ADD CONSTRAINT campaign_shop_orders_secret_snapshot_object_check CHECK (
		item_identified_snapshot IS NULL
		OR (
			jsonb_typeof(item_identified_snapshot) = 'object'
			AND public.is_valid_item_base(item_identified_snapshot -> 'item_base')
		)
	),
	ADD CONSTRAINT campaign_shop_orders_unidentified_snapshot_required_check CHECK (
		is_identified OR status <> 'pending' OR item_identified_snapshot IS NOT NULL
	);

CREATE OR REPLACE FUNCTION public.campaign_shop_sync_order_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $campaign_shop_sync_order_snapshot$
DECLARE
	v_item public.campaign_shop_items%ROWTYPE;
BEGIN
	IF TG_OP = 'INSERT' THEN
		SELECT shop_item.*
		INTO v_item
		FROM public.campaign_shop_items AS shop_item
		WHERE shop_item.id = NEW.shop_item_id
			AND shop_item.campaign_id = NEW.campaign_id
			AND shop_item.shop_id = NEW.shop_id
		FOR SHARE;
		IF NOT FOUND THEN
			RAISE EXCEPTION '商店商品不存在或不屬於此戰役。'
				USING ERRCODE = '23503';
		END IF;
		NEW.item_snapshot := v_item.item_snapshot;
		NEW.item_identified_snapshot := v_item.item_identified_snapshot;
		NEW.is_identified := v_item.is_identified;
	ELSIF NEW.status IN ('completed', 'rejected', 'cancelled') THEN
		NEW.item_identified_snapshot := NULL;
	END IF;
	RETURN NEW;
END
$campaign_shop_sync_order_snapshot$;

CREATE TRIGGER campaign_shop_orders_sync_private_snapshot
	BEFORE INSERT OR UPDATE ON public.campaign_shop_orders
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_sync_order_snapshot();

CREATE OR REPLACE FUNCTION public.save_campaign_shop_item(
	p_campaign_id text,
	p_shop_id text,
	p_item_id text,
	p_item_snapshot jsonb,
	p_unit_price_gp numeric,
	p_stock_available integer,
	p_requires_approval boolean,
	p_is_active boolean,
	p_source_type text,
	p_source_id text
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
		OR p_stock_available IS NULL OR p_stock_available < 0
		OR p_source_type NOT IN ('catalog', 'blacksmith', 'manual') THEN
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
			is_active = COALESCE(p_is_active, true),
			source_type = p_source_type,
			source_id = p_source_id
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
			is_active, source_type, source_id
		)
		VALUES (
			v_id, p_campaign_id, p_shop_id, v_public_snapshot,
			v_secret_snapshot, v_is_identified, p_unit_price_gp,
			p_stock_available, COALESCE(p_requires_approval, false),
			COALESCE(p_is_active, true), p_source_type, p_source_id
		);
	END IF;
	RETURN v_id;
END
$save_campaign_shop_item$;

CREATE OR REPLACE FUNCTION public.identify_inventory_item(
	p_actor_id uuid,
	p_campaign_id text,
	p_item_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $identify_inventory_item$
DECLARE
	v_item public.inventory_items%ROWTYPE;
	v_snapshot jsonb;
	v_base jsonb;
	v_sub_type text;
	v_category text;
BEGIN
	IF p_actor_id IS NULL OR NOT EXISTS (
		SELECT 1 FROM auth.users AS user_row WHERE user_row.id = p_actor_id
	) OR NOT EXISTS (
		SELECT 1 FROM public.campaigns AS campaign
		WHERE campaign.id = p_campaign_id
			AND campaign.dm_id = p_actor_id::text
	) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以鑑定物品。'
			USING ERRCODE = '42501';
	END IF;

	SELECT item.*
	INTO v_item
	FROM public.inventory_items AS item
	WHERE item.id = p_item_id
		AND item.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND OR v_item.is_identified IS TRUE
		OR v_item.item_identified_snapshot IS NULL THEN
		RAISE EXCEPTION '物品不存在、已鑑定或缺少安全快照。'
			USING ERRCODE = '22023';
	END IF;

	v_snapshot := v_item.item_identified_snapshot;
	v_base := v_snapshot -> 'item_base';
	IF NOT public.is_valid_item_base(v_base) THEN
		RAISE EXCEPTION '物品的隱藏定義格式無效。' USING ERRCODE = '23514';
	END IF;
	v_category := v_base ->> 'category';
	v_sub_type := COALESCE(v_base #>> '{subTypes,0}', '');

	UPDATE public.inventory_items
	SET name = v_base ->> 'name',
		category = CASE
			WHEN v_category = 'Weapon' THEN 'Weapon'
			WHEN v_category = 'Armor' THEN 'Armor'
			WHEN COALESCE((v_base ->> 'isConsumable')::boolean, false)
				OR v_category IN ('Potion', 'Poison', 'Scroll')
				THEN 'Consumable'
			ELSE 'Misc'
		END,
		sub_type = v_sub_type,
		rarity = v_base ->> 'rarity',
		icon = COALESCE(v_base ->> 'icon', 'Package'),
		damage = v_base #>> '{weaponProperties,damage}',
		mastery = COALESCE(v_base #>> '{weaponProperties,mastery}', 'None'),
		ac = v_base #>> '{armorProperties,ac}',
		weight = (v_base ->> 'weight')::numeric,
		value_gp = (v_base ->> 'valueGp')::numeric,
		is_homebrew = COALESCE((v_snapshot ->> 'is_homebrew')::boolean, v_item.is_homebrew),
		is_identified = true,
		max_charges = COALESCE((v_base ->> 'maxCharges')::integer, 0),
		effects = COALESCE(v_base ->> 'effects', ''),
		flavor = COALESCE(v_base ->> 'flavor', ''),
		dm_notes = COALESCE(v_base ->> 'dmNotes', ''),
		is_equippable = COALESCE((v_base ->> 'isEquippable')::boolean, false),
		is_consumable = COALESCE((v_base ->> 'isConsumable')::boolean, false),
		is_important = COALESCE((v_snapshot ->> 'is_important')::boolean, v_item.is_important),
		affixes = COALESCE(v_base -> 'affixes', '[]'::jsonb),
		item_base = v_base,
		item_identified_snapshot = NULL
	WHERE id = v_item.id AND campaign_id = p_campaign_id;
	RETURN v_item.id;
END
$identify_inventory_item$;

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
		SET private_currencies = public.shop_wallet_from_cp(v_wallet_total_cp - v_price_cp)
		WHERE id = v_character.id AND campaign_id = v_order.campaign_id;
	END IF;

	v_is_identified := v_order.is_identified;
	v_definition := CASE
		WHEN v_is_identified THEN v_order.item_snapshot
		ELSE v_order.item_identified_snapshot
	END;
	v_base := v_definition -> 'item_base';
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
		CASE WHEN v_is_identified THEN NULL ELSE v_definition END
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

CREATE OR REPLACE FUNCTION public.campaign_shop_notify_safe_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $campaign_shop_notify_safe_change$
DECLARE
	v_campaign_id text := CASE WHEN TG_OP = 'DELETE'
		THEN OLD.campaign_id ELSE NEW.campaign_id END;
	v_row_id text := CASE WHEN TG_OP = 'DELETE'
		THEN OLD.id ELSE NEW.id END;
BEGIN
	PERFORM realtime.send(
		jsonb_build_object(
			'campaign_id', v_campaign_id,
			'row_id', v_row_id,
			'action', lower(TG_OP)
		),
		'campaign_data_changed',
		'campaign:' || v_campaign_id || ':secure-data',
		true
	);
	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;
	RETURN NEW;
END
$campaign_shop_notify_safe_change$;

CREATE TRIGGER inventory_items_safe_change_broadcast
	AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_notify_safe_change();
CREATE TRIGGER campaign_shop_items_safe_change_broadcast
	AFTER INSERT OR UPDATE OR DELETE ON public.campaign_shop_items
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_notify_safe_change();
CREATE TRIGGER campaign_shop_orders_safe_change_broadcast
	AFTER INSERT OR UPDATE OR DELETE ON public.campaign_shop_orders
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_notify_safe_change();

DO $unidentified_items_realtime$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
	) THEN
		RAISE EXCEPTION '找不到 supabase_realtime publication。';
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_publication
		WHERE pubname = 'supabase_realtime'
			AND puballtables
	) THEN
		RAISE EXCEPTION
			'supabase_realtime 使用 FOR ALL TABLES；請先調整 publication，避免廣播秘密欄位。';
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'inventory_items'
	) THEN
		ALTER PUBLICATION supabase_realtime DROP TABLE public.inventory_items;
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'campaign_shop_items'
	) THEN
		ALTER PUBLICATION supabase_realtime DROP TABLE public.campaign_shop_items;
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'campaign_shop_orders'
	) THEN
		ALTER PUBLICATION supabase_realtime DROP TABLE public.campaign_shop_orders;
	END IF;
END
$unidentified_items_realtime$;

DROP POLICY IF EXISTS campaign_secure_data_member_read ON realtime.messages;
DROP POLICY IF EXISTS campaign_secure_data_member_boundary ON realtime.messages;
CREATE POLICY campaign_secure_data_member_read
	ON realtime.messages
	FOR SELECT TO authenticated
	USING (
		split_part(realtime.topic(), ':', 1) = 'campaign'
		AND split_part(realtime.topic(), ':', 3) = 'secure-data'
		AND public.is_campaign_member_or_dm(split_part(realtime.topic(), ':', 2))
	);
CREATE POLICY campaign_secure_data_member_boundary
	ON realtime.messages
	AS RESTRICTIVE
	FOR SELECT TO authenticated
	USING (
		split_part(realtime.topic(), ':', 1) = 'campaign'
		AND split_part(realtime.topic(), ':', 3) = 'secure-data'
		AND public.is_campaign_member_or_dm(split_part(realtime.topic(), ':', 2))
	);

REVOKE ALL ON TABLE public.campaign_shop_items,
	public.campaign_shop_orders,
	public.inventory_items
	FROM PUBLIC, anon, authenticated;

GRANT SELECT (
	id, campaign_id, shop_id, item_snapshot, is_identified,
	source_type, source_id, unit_price_gp, stock_available, stock_reserved,
	requires_approval, is_active, created_at, updated_at
) ON public.campaign_shop_items TO authenticated;
GRANT DELETE ON TABLE public.campaign_shop_items TO authenticated;

GRANT SELECT (
	id, campaign_id, owner_id, slot, name, category, sub_type, rarity, icon,
	damage, mastery, ac, weight, value_gp, quantity, equipped,
	requires_attunement, attuned, is_homebrew, is_identified, charges,
	max_charges, effects, flavor, dm_notes, player_notes, is_private,
	is_equippable, is_consumable, is_important, affixes, item_base
) ON public.inventory_items TO authenticated;
GRANT INSERT (
	id, campaign_id, owner_id, slot, name, category, sub_type, rarity, icon,
	damage, mastery, ac, weight, value_gp, quantity, equipped,
	requires_attunement, attuned, is_homebrew, is_identified, charges,
	max_charges, effects, flavor, dm_notes, player_notes, is_private,
	is_equippable, is_consumable, is_important, affixes, item_base
) ON public.inventory_items TO authenticated;
GRANT UPDATE (
	owner_id, slot, name, category, sub_type, rarity, icon, damage, mastery,
	ac, weight, value_gp, quantity, equipped, requires_attunement, attuned,
	is_homebrew, charges, max_charges, effects, flavor, dm_notes, player_notes,
	is_private, is_equippable, is_consumable, is_important, affixes, item_base
) ON public.inventory_items TO authenticated;
GRANT DELETE ON TABLE public.inventory_items TO authenticated;

GRANT SELECT (
	id, checkout_id, campaign_id, shop_id, shop_item_id,
	character_id, item_snapshot, shop_name_snapshot, unit_price_gp, quantity,
	total_price_gp, status, requires_approval, created_at, updated_at,
	reviewed_at, is_identified
) ON public.campaign_shop_orders TO authenticated;

REVOKE INSERT, UPDATE ON TABLE public.campaign_shop_items
	FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (is_identified) ON public.inventory_items
	FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.campaign_shop_unidentified_item_base(jsonb),
	public.campaign_shop_public_item_snapshot(jsonb),
	public.campaign_shop_sync_order_snapshot(),
	public.campaign_shop_notify_safe_change(),
	public.inventory_items_protect_unidentified_snapshot()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_campaign_shop_item(
	text, text, text, jsonb, numeric, integer, boolean, boolean, text, text
), public.identify_inventory_item(uuid, text, text)
	FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_campaign_shop_item(
	text, text, text, jsonb, numeric, integer, boolean, boolean, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.identify_inventory_item(uuid, text, text)
	TO service_role;

-- 來源 migration: 20261030000000_unidentified_item_clients.sql
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

-- 來源 migration: 20261030000001_campaign_shop_refresh_latest_rulebooks.sql
ALTER FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) RENAME TO refresh_campaign_shop_items_before_unidentified_item_rulebooks;

REVOKE ALL ON FUNCTION
	public.refresh_campaign_shop_items_before_unidentified_item_rulebooks(
		text, text, timestamptz, jsonb, boolean, jsonb
	) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.refresh_campaign_shop_items(
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
	v_catalog_ids text[];
	v_expanded_policy jsonb;
	v_effective_updated_at timestamptz;
	v_result jsonb;
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_dm(p_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以刷新商店商品。'
			USING ERRCODE = '42501';
	END IF;

	SELECT shop.*
	INTO v_shop
	FROM public.campaign_shops AS shop
	WHERE shop.id = p_shop_id
		AND shop.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店不存在或不屬於此戰役。'
			USING ERRCODE = '22023';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM jsonb_array_elements(v_shop.refresh_policy -> 'rules') AS rule(value)
		CROSS JOIN jsonb_array_elements(
			rule.value -> 'possibleItemsOrFilters'
		) AS candidate(value)
		WHERE candidate.value ->> 'source' = '__campaign_rulebooks__'
	) THEN
		RETURN public.refresh_campaign_shop_items_before_unidentified_item_rulebooks(
			p_campaign_id,
			p_shop_id,
			p_expected_shop_updated_at,
			p_expected_items,
			p_keep_items,
			p_changes
		);
	END IF;

	IF p_expected_shop_updated_at IS NULL
		OR v_shop.updated_at IS DISTINCT FROM p_expected_shop_updated_at THEN
		RAISE EXCEPTION '商店資料已更新，請重新載入並產生刷新預覽。'
			USING ERRCODE = '40001';
	END IF;

	SELECT campaign.official_catalog_ids
	INTO v_catalog_ids
	FROM public.campaigns AS campaign
	WHERE campaign.id = p_campaign_id;
	IF NOT FOUND OR v_catalog_ids IS NULL THEN
		RAISE EXCEPTION '找不到戰役目前的官方規則書設定。'
			USING ERRCODE = '22023';
	END IF;

	v_expanded_policy := public.campaign_shop_expand_rulebook_policy(
		v_shop.refresh_policy,
		v_catalog_ids
	);

	UPDATE public.campaign_shops
	SET refresh_policy = v_expanded_policy
	WHERE id = p_shop_id
		AND campaign_id = p_campaign_id
	RETURNING updated_at INTO v_effective_updated_at;

	v_result := public.refresh_campaign_shop_items_before_unidentified_item_rulebooks(
		p_campaign_id,
		p_shop_id,
		v_effective_updated_at,
		p_expected_items,
		p_keep_items,
		p_changes
	);

	UPDATE public.campaign_shops
	SET refresh_policy = v_shop.refresh_policy
	WHERE id = p_shop_id
		AND campaign_id = p_campaign_id;

	RETURN v_result;
END
$refresh_campaign_shop_items$;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) TO authenticated;

-- 來源 migration: 20261030000002_campaign_shop_flat_item_snapshots.sql
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

-- 來源 migration: 20261030000003_campaign_shop_refresh_hard_delete.sql
ALTER TABLE public.campaign_shop_orders
	ALTER COLUMN shop_item_id DROP NOT NULL;

ALTER FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) RENAME TO refresh_campaign_shop_items_before_hard_delete;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items_before_hard_delete(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.refresh_campaign_shop_items(
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
	v_result jsonb;
	v_deleted integer := 0;
BEGIN
	v_result := public.refresh_campaign_shop_items_before_hard_delete(
		p_campaign_id,
		p_shop_id,
		p_expected_shop_updated_at,
		p_expected_items,
		p_keep_items,
		p_changes
	);

	IF NOT p_keep_items THEN
		UPDATE public.campaign_shop_orders AS order_row
		SET status = 'rejected',
			reviewed_by = auth.uid(),
			reviewed_at = now(),
			updated_at = now()
		WHERE order_row.campaign_id = p_campaign_id
			AND order_row.shop_id = p_shop_id
			AND order_row.status = 'pending'
			AND EXISTS (
				SELECT 1
				FROM public.campaign_shop_items AS item
				WHERE item.id = order_row.shop_item_id
					AND item.campaign_id = p_campaign_id
					AND item.shop_id = p_shop_id
					AND NOT item.is_active
			);

		UPDATE public.campaign_shop_orders AS order_row
		SET shop_item_id = NULL
		WHERE order_row.campaign_id = p_campaign_id
			AND order_row.shop_id = p_shop_id
			AND EXISTS (
				SELECT 1
				FROM public.campaign_shop_items AS item
				WHERE item.id = order_row.shop_item_id
					AND item.campaign_id = p_campaign_id
					AND item.shop_id = p_shop_id
					AND NOT item.is_active
			);

		DELETE FROM public.campaign_shop_items
		WHERE campaign_id = p_campaign_id
			AND shop_id = p_shop_id
			AND NOT is_active;
		GET DIAGNOSTICS v_deleted = ROW_COUNT;
	END IF;

	RETURN (v_result - 'deleted' - 'retired')
		|| jsonb_build_object('deleted', v_deleted);
END
$refresh_campaign_shop_items$;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) TO authenticated;

-- 來源 migration: 20261030000004_campaign_shop_refresh_unidentified_items.sql
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

-- 來源 migration: 20261030000005_campaign_shop_flavor.sql
ALTER TABLE public.campaign_shops
	ADD COLUMN flavor text NOT NULL DEFAULT ''
		CHECK (length(flavor) <= 1000);

-- 來源 migration: 20261030000006_campaign_shop_flavor_grants.sql
GRANT INSERT (flavor) ON public.campaign_shops TO authenticated;
GRANT UPDATE (flavor) ON public.campaign_shops TO authenticated;

-- 來源 migration: 20261030000007_item_base_validator_grants.sql
REVOKE ALL ON FUNCTION public.is_valid_item_base(jsonb),
	public.is_valid_blacksmith_affixes(jsonb)
	FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_valid_item_base(jsonb),
	public.is_valid_blacksmith_affixes(jsonb)
	TO authenticated, service_role;

-- 來源 migration: 20261030000008_campaign_journeys.sql
DO $campaign_journeys_preflight$
DECLARE
	required_columns text[][] := ARRAY[
		ARRAY['campaigns', 'id', 'text'],
		ARRAY['campaigns', 'dm_id', 'text'],
		ARRAY['campaigns', 'camp_chest_currency', 'jsonb'],
		ARRAY['campaign_members', 'campaign_id', 'text'],
		ARRAY['campaign_members', 'user_id', 'uuid'],
		ARRAY['characters', 'id', 'text'],
		ARRAY['characters', 'campaign_id', 'text'],
		ARRAY['characters', 'user_id', 'text'],
		ARRAY['characters', 'currencies', 'jsonb'],
		ARRAY['characters', 'private_currencies', 'jsonb'],
		ARRAY['character_permissions', 'campaign_id', 'text'],
		ARRAY['character_permissions', 'character_id', 'text'],
		ARRAY['character_permissions', 'user_id', 'uuid'],
		ARRAY['character_permissions', 'can_delete_character', 'boolean'],
		ARRAY['inventory_items', 'id', 'text'],
		ARRAY['inventory_items', 'campaign_id', 'text'],
		ARRAY['inventory_items', 'owner_id', 'text'],
		ARRAY['inventory_items', 'name', 'text'],
		ARRAY['inventory_items', 'category', 'text'],
		ARRAY['inventory_items', 'sub_type', 'text'],
		ARRAY['inventory_items', 'rarity', 'text'],
		ARRAY['inventory_items', 'weight', 'numeric'],
		ARRAY['inventory_items', 'value_gp', 'numeric'],
		ARRAY['inventory_items', 'quantity', 'integer'],
		ARRAY['inventory_items', 'equipped', 'boolean'],
		ARRAY['inventory_items', 'requires_attunement', 'boolean'],
		ARRAY['inventory_items', 'attuned', 'boolean'],
		ARRAY['inventory_items', 'is_private', 'boolean'],
		ARRAY['inventory_items', 'is_identified', 'boolean'],
		ARRAY['inventory_items', 'max_charges', 'integer'],
		ARRAY['inventory_items', 'affixes', 'jsonb'],
		ARRAY['inventory_items', 'item_base', 'jsonb'],
		ARRAY['inventory_items', 'item_identified_snapshot', 'jsonb']
	];
	expected text[];
	actual_type text;
	journey_access_type text;
	has_invalid_journey_access boolean;
BEGIN
	FOREACH expected SLICE 1 IN ARRAY required_columns LOOP
		IF to_regclass(format('public.%I', expected[1])) IS NULL THEN
			RAISE EXCEPTION
				'冒險筆記 migration 前置檢查失敗：public.% 不存在。',
				expected[1];
		END IF;

		SELECT format_type(attribute.atttypid, attribute.atttypmod)
		INTO actual_type
		FROM pg_attribute AS attribute
		WHERE attribute.attrelid = to_regclass(format('public.%I', expected[1]))
			AND attribute.attname = expected[2]
			AND attribute.attnum > 0
			AND NOT attribute.attisdropped;

		IF actual_type IS DISTINCT FROM expected[3] THEN
			RAISE EXCEPTION
				'冒險筆記 migration 前置檢查失敗：public.%.% 預期型別為 %，實際為 %。',
				expected[1],
				expected[2],
				expected[3],
				COALESCE(actual_type, '缺少欄位');
		END IF;
	END LOOP;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint AS constraint_row
		WHERE constraint_row.conrelid = 'public.characters'::regclass
			AND constraint_row.contype = 'p'
			AND constraint_row.conkey = ARRAY[
				(
					SELECT attribute.attnum
					FROM pg_attribute AS attribute
					WHERE attribute.attrelid = 'public.characters'::regclass
						AND attribute.attname = 'id'
						AND attribute.attnum > 0
						AND NOT attribute.attisdropped
				)
			]::smallint[]
	) THEN
		RAISE EXCEPTION
			'冒險筆記 migration 前置檢查失敗：characters.id 必須是主鍵。';
	END IF;

	IF to_regprocedure('public.is_campaign_member_or_dm(text)') IS NULL
		OR to_regprocedure('public.is_campaign_dm(text)') IS NULL THEN
		RAISE EXCEPTION
			'冒險筆記 migration 前置檢查失敗：缺少既有 campaign 成員／DM 授權函式。';
	END IF;

	SELECT format_type(attribute.atttypid, attribute.atttypmod)
	INTO journey_access_type
	FROM pg_attribute AS attribute
	WHERE attribute.attrelid = 'public.character_permissions'::regclass
		AND attribute.attname = 'journey_access'
		AND attribute.attnum > 0
		AND NOT attribute.attisdropped;

	IF journey_access_type IS NOT NULL
		AND journey_access_type IS DISTINCT FROM 'smallint' THEN
		RAISE EXCEPTION
			'冒險筆記 migration 前置檢查失敗：character_permissions.journey_access 預期 smallint，實際為 %。',
			journey_access_type;
	END IF;

	IF journey_access_type = 'smallint' THEN
		EXECUTE
			'SELECT EXISTS (
				SELECT 1
				FROM public.character_permissions
				WHERE journey_access IS NULL
					OR journey_access NOT IN (0, 1, 2)
			)'
		INTO has_invalid_journey_access;

		IF has_invalid_journey_access THEN
			RAISE EXCEPTION
				'冒險筆記 migration 前置檢查失敗：journey_access 已有 NULL 或非 0/1/2 資料，請先人工修正。';
		END IF;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conrelid = 'public.character_permissions'::regclass
			AND conname = 'character_permissions_journey_access_check'
			AND pg_get_constraintdef(oid) NOT LIKE '%journey_access%0%1%2%'
	) THEN
		RAISE EXCEPTION
			'冒險筆記 migration 前置檢查失敗：character_permissions_journey_access_check 定義不符。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM pg_publication
		WHERE pubname = 'supabase_realtime'
			AND puballtables
	) THEN
		RAISE EXCEPTION
			'冒險筆記 migration 前置檢查失敗：supabase_realtime 使用 FOR ALL TABLES，無法保證 DM 私密資料不進入 Realtime。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM pg_publication_namespace AS publication_namespace
		JOIN pg_namespace AS namespace
			ON namespace.oid = publication_namespace.pnnspid
		JOIN pg_publication AS publication
			ON publication.oid = publication_namespace.pnpubid
		WHERE publication.pubname = 'supabase_realtime'
			AND namespace.nspname = 'public'
	) THEN
		RAISE EXCEPTION
			'冒險筆記 migration 前置檢查失敗：supabase_realtime 發布整個 public schema，無法排除 DM 私密資料。';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
	) THEN
		RAISE EXCEPTION
			'冒險筆記 migration 前置檢查失敗：找不到 supabase_realtime publication。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.inventory_items AS item
		WHERE item.owner_id <> 'camp-chest'
			AND NOT EXISTS (
				SELECT 1
				FROM public.characters AS character
				WHERE character.id = item.owner_id
					AND character.campaign_id = item.campaign_id
			)
	) THEN
		RAISE EXCEPTION
			'冒險筆記 migration 前置檢查失敗：inventory_items 有不存在或跨戰役的角色 owner，請先人工修正。';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'
	) OR NOT EXISTS (
		SELECT 1 FROM pg_roles WHERE rolname = 'anon'
	) OR NOT EXISTS (
		SELECT 1 FROM pg_roles WHERE rolname = 'service_role'
	) THEN
		RAISE EXCEPTION
			'冒險筆記 migration 前置檢查失敗：缺少 Supabase authenticated、anon 或 service_role 角色。';
	END IF;
END;
$campaign_journeys_preflight$;

ALTER TABLE public.character_permissions
	ADD COLUMN IF NOT EXISTS journey_access smallint NOT NULL DEFAULT 0;

ALTER TABLE public.character_permissions
	ALTER COLUMN journey_access SET DEFAULT 0,
	ALTER COLUMN journey_access SET NOT NULL;

DO $campaign_journey_access_constraint$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conrelid = 'public.character_permissions'::regclass
			AND conname = 'character_permissions_journey_access_check'
	) THEN
		ALTER TABLE public.character_permissions
			ADD CONSTRAINT character_permissions_journey_access_check
			CHECK (journey_access IN (0, 1, 2));
	END IF;
END;
$campaign_journey_access_constraint$;

UPDATE public.character_permissions AS permission
SET journey_access = 2
FROM public.characters AS character
WHERE character.id = permission.character_id
	AND character.campaign_id = permission.campaign_id
	AND character.user_id = permission.user_id::text
	AND permission.journey_access < 2;

CREATE OR REPLACE FUNCTION public.initialize_character_owner_journey_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $initialize_character_owner_journey_access$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.characters AS character
		WHERE character.id = NEW.character_id
			AND character.campaign_id = NEW.campaign_id
			AND character.user_id = NEW.user_id::text
	) THEN
		NEW.journey_access := 2;
	END IF;
	RETURN NEW;
END;
$initialize_character_owner_journey_access$;

REVOKE ALL ON FUNCTION public.initialize_character_owner_journey_access()
	FROM PUBLIC, anon, authenticated;

CREATE TRIGGER initialize_character_owner_journey_access
	BEFORE INSERT ON public.character_permissions
	FOR EACH ROW
	EXECUTE FUNCTION public.initialize_character_owner_journey_access();

CREATE OR REPLACE FUNCTION public.sync_character_owner_journey_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $sync_character_owner_journey_access$
BEGIN
	IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
		UPDATE public.character_permissions AS permission
		SET journey_access = 2
		WHERE permission.campaign_id = NEW.campaign_id
			AND permission.character_id = NEW.id
			AND permission.user_id::text = NEW.user_id
			AND permission.journey_access < 2;
	END IF;
	RETURN NEW;
END;
$sync_character_owner_journey_access$;

REVOKE ALL ON FUNCTION public.sync_character_owner_journey_access()
	FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sync_character_owner_journey_access
	AFTER UPDATE OF user_id ON public.characters
	FOR EACH ROW
	EXECUTE FUNCTION public.sync_character_owner_journey_access();

CREATE UNIQUE INDEX IF NOT EXISTS characters_campaign_id_id_unique_idx
	ON public.characters (campaign_id, id);

CREATE TABLE public.campaign_journeys (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	campaign_id text NOT NULL
		REFERENCES public.campaigns(id) ON DELETE CASCADE,
	title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
	tags text,
	content text NOT NULL DEFAULT '',
	character_id text,
	created_by uuid NOT NULL DEFAULT auth.uid()
		REFERENCES auth.users(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	is_quest boolean NOT NULL DEFAULT false,
	is_completed boolean NOT NULL DEFAULT false,
	visibility text NOT NULL DEFAULT 'public'
		CHECK (visibility IN ('public', 'private')),
	CONSTRAINT campaign_journeys_campaign_id_id_key
		UNIQUE (campaign_id, id),
	CONSTRAINT campaign_journeys_private_character_check
		CHECK (visibility <> 'private' OR character_id IS NOT NULL),
	CONSTRAINT campaign_journeys_character_campaign_fkey
		FOREIGN KEY (campaign_id, character_id)
		REFERENCES public.characters (campaign_id, id)
		ON DELETE RESTRICT
);

CREATE TABLE public.campaign_journey_dm_notes (
	journey_id text PRIMARY KEY,
	campaign_id text NOT NULL,
	content text NOT NULL DEFAULT '',
	CONSTRAINT campaign_journey_dm_notes_campaign_journey_fkey
		FOREIGN KEY (campaign_id, journey_id)
		REFERENCES public.campaign_journeys (campaign_id, id)
		ON DELETE CASCADE
);

CREATE INDEX campaign_journeys_campaign_created_idx
	ON public.campaign_journeys (campaign_id, created_at DESC);
CREATE INDEX campaign_journeys_campaign_quest_status_idx
	ON public.campaign_journeys (campaign_id, is_quest, is_completed);
CREATE INDEX campaign_journeys_campaign_character_visibility_idx
	ON public.campaign_journeys (campaign_id, character_id, visibility);

CREATE OR REPLACE FUNCTION public.campaign_journey_has_access(
	p_campaign_id text,
	p_character_id text,
	p_min_access integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $campaign_journey_has_access$
	SELECT auth.uid() IS NOT NULL
		AND p_character_id IS NOT NULL
		AND p_min_access IN (1, 2)
		AND public.is_campaign_member_or_dm(p_campaign_id)
		AND (
			public.is_campaign_dm(p_campaign_id)
			OR EXISTS (
				SELECT 1
				FROM public.characters AS character
				WHERE character.id = p_character_id
					AND character.campaign_id = p_campaign_id
					AND character.user_id = auth.uid()::text
					AND NOT EXISTS (
						SELECT 1
						FROM public.character_permissions AS explicit_permission
						WHERE explicit_permission.campaign_id = p_campaign_id
							AND explicit_permission.character_id = p_character_id
							AND explicit_permission.user_id = auth.uid()
					)
			)
			OR EXISTS (
				SELECT 1
				FROM public.character_permissions AS permission
				WHERE permission.campaign_id = p_campaign_id
					AND permission.character_id = p_character_id
					AND permission.user_id = auth.uid()
					AND permission.journey_access >= p_min_access
			)
		);
$campaign_journey_has_access$;

REVOKE ALL ON FUNCTION public.campaign_journey_has_access(text, text, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_journey_has_access(text, text, integer)
	TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_campaign_journey_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $guard_campaign_journey_identity$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
		OR NEW.created_by IS DISTINCT FROM OLD.created_by
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION '冒險筆記的 ID、戰役、建立者與建立時間不可修改。'
			USING ERRCODE = '42501';
	END IF;
	RETURN NEW;
END;
$guard_campaign_journey_identity$;

REVOKE ALL ON FUNCTION public.guard_campaign_journey_identity()
	FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_campaign_journey_identity
	BEFORE UPDATE ON public.campaign_journeys
	FOR EACH ROW
	EXECUTE FUNCTION public.guard_campaign_journey_identity();

CREATE OR REPLACE FUNCTION public.lock_inventory_character_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $lock_inventory_character_owner$
BEGIN
	IF NEW.owner_id = 'camp-chest' THEN
		RETURN NEW;
	END IF;

	PERFORM 1
	FROM public.characters AS character
	WHERE character.id = NEW.owner_id
		AND character.campaign_id = NEW.campaign_id
	FOR KEY SHARE;

	IF NOT FOUND THEN
		RAISE EXCEPTION '物品 owner 必須是同戰役內存在的角色或 camp-chest。'
			USING ERRCODE = '23503';
	END IF;

	RETURN NEW;
END;
$lock_inventory_character_owner$;

REVOKE ALL ON FUNCTION public.lock_inventory_character_owner()
	FROM PUBLIC, anon, authenticated;

CREATE TRIGGER lock_inventory_character_owner
	BEFORE INSERT OR UPDATE OF campaign_id, owner_id
	ON public.inventory_items
	FOR EACH ROW
	EXECUTE FUNCTION public.lock_inventory_character_owner();

ALTER TABLE public.campaign_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_journey_dm_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.campaign_journeys FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.campaign_journeys TO authenticated;
GRANT INSERT (
	id, campaign_id, title, tags, content, character_id,
	is_quest, is_completed, visibility
) ON public.campaign_journeys TO authenticated;
GRANT UPDATE (
	title, tags, content, character_id, is_quest, is_completed, visibility
) ON public.campaign_journeys TO authenticated;

REVOKE ALL ON public.campaign_journey_dm_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.campaign_journey_dm_notes TO authenticated;
GRANT INSERT (journey_id, campaign_id, content)
	ON public.campaign_journey_dm_notes TO authenticated;
GRANT UPDATE (content) ON public.campaign_journey_dm_notes TO authenticated;

CREATE POLICY "Campaign members can read accessible journeys"
	ON public.campaign_journeys
	AS PERMISSIVE
	FOR SELECT
	TO authenticated
	USING (
		public.is_campaign_member_or_dm(campaign_id)
		AND (
			visibility = 'public'
			OR public.is_campaign_dm(campaign_id)
			OR public.campaign_journey_has_access(campaign_id, character_id, 1)
		)
	);

CREATE POLICY "Campaign members can create journeys"
	ON public.campaign_journeys
	AS PERMISSIVE
	FOR INSERT
	TO authenticated
	WITH CHECK (
		created_by = auth.uid()
		AND public.is_campaign_member_or_dm(campaign_id)
		AND (
			visibility = 'public'
			OR public.is_campaign_dm(campaign_id)
			OR public.campaign_journey_has_access(campaign_id, character_id, 2)
		)
	);

CREATE POLICY "Journey owners and authorized users can update journeys"
	ON public.campaign_journeys
	AS PERMISSIVE
	FOR UPDATE
	TO authenticated
	USING (
		public.is_campaign_dm(campaign_id)
		OR (
			visibility = 'public'
			AND created_by = auth.uid()
			AND public.is_campaign_member_or_dm(campaign_id)
		)
		OR (
			visibility = 'private'
			AND public.campaign_journey_has_access(campaign_id, character_id, 2)
		)
	)
	WITH CHECK (
		public.is_campaign_member_or_dm(campaign_id)
		AND (
			(
				visibility = 'public'
				AND (
					public.is_campaign_dm(campaign_id)
					OR created_by = auth.uid()
				)
			)
			OR (
				visibility = 'private'
				AND (
					public.is_campaign_dm(campaign_id)
					OR public.campaign_journey_has_access(campaign_id, character_id, 2)
				)
			)
		)
	);

CREATE POLICY "Journey owners and authorized users can delete journeys"
	ON public.campaign_journeys
	AS PERMISSIVE
	FOR DELETE
	TO authenticated
	USING (
		public.is_campaign_dm(campaign_id)
		OR (
			visibility = 'public'
			AND created_by = auth.uid()
			AND public.is_campaign_member_or_dm(campaign_id)
		)
		OR (
			visibility = 'private'
			AND public.campaign_journey_has_access(campaign_id, character_id, 2)
		)
	);

CREATE POLICY "Only campaign DMs can access DM journey notes"
	ON public.campaign_journey_dm_notes
	AS PERMISSIVE
	FOR ALL
	TO authenticated
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));

CREATE POLICY "Characters are deleted only by trusted transaction"
	ON public.characters
	AS RESTRICTIVE
	FOR DELETE
	TO public
	USING (false);

REVOKE DELETE ON public.characters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_campaign_character_with_journeys(
	p_campaign_id text,
	p_character_id text,
	p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $delete_campaign_character_with_journeys$
DECLARE
	v_campaign public.campaigns%ROWTYPE;
	v_character public.characters%ROWTYPE;
	v_item public.inventory_items%ROWTYPE;
	v_stack public.inventory_items%ROWTYPE;
	v_currency_key text;
	v_campaign_amount numeric;
	v_public_amount numeric;
	v_private_amount numeric;
	v_updated_currency jsonb;
	v_remaining_characters integer;
	v_is_dm boolean;
BEGIN
	IF p_campaign_id IS NULL OR btrim(p_campaign_id) = ''
		OR p_character_id IS NULL OR btrim(p_character_id) = ''
		OR p_character_id = 'camp-chest'
		OR p_actor_id IS NULL THEN
		RAISE EXCEPTION '戰役、實體角色或操作者資料無效。'
			USING ERRCODE = '22023';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM auth.users AS user_row WHERE user_row.id = p_actor_id
	) THEN
		RAISE EXCEPTION '操作者帳號不存在。' USING ERRCODE = '42501';
	END IF;

	SELECT campaign.*
	INTO v_campaign
	FROM public.campaigns AS campaign
	WHERE campaign.id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '戰役不存在。' USING ERRCODE = '22023';
	END IF;

	v_is_dm := v_campaign.dm_id = p_actor_id::text;
	IF NOT v_is_dm THEN
		PERFORM 1
		FROM public.campaign_members AS member
		WHERE member.campaign_id = p_campaign_id
			AND member.user_id = p_actor_id
		FOR KEY SHARE;

		IF NOT FOUND THEN
			RAISE EXCEPTION '操作者不是此戰役成員。'
				USING ERRCODE = '42501';
		END IF;
	END IF;

	SELECT character.*
	INTO v_character
	FROM public.characters AS character
	WHERE character.id = p_character_id
		AND character.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '角色不存在或不屬於此戰役。'
			USING ERRCODE = '22023';
	END IF;

	IF NOT v_is_dm THEN
		PERFORM 1
		FROM public.character_permissions AS permission
		WHERE permission.campaign_id = p_campaign_id
			AND permission.character_id = p_character_id
			AND permission.user_id = p_actor_id
		FOR SHARE;

		IF NOT EXISTS (
			SELECT 1
			FROM public.character_permissions AS permission
			WHERE permission.campaign_id = p_campaign_id
				AND permission.character_id = p_character_id
				AND permission.user_id = p_actor_id
				AND permission.can_delete_character
		) AND NOT (
			v_character.user_id = p_actor_id::text
			AND NOT EXISTS (
				SELECT 1
				FROM public.character_permissions AS permission
				WHERE permission.campaign_id = p_campaign_id
					AND permission.character_id = p_character_id
					AND permission.user_id = p_actor_id
			)
		) THEN
			RAISE EXCEPTION '沒有移除此角色的權限。'
				USING ERRCODE = '42501';
		END IF;
	END IF;

	SELECT count(*)::integer
	INTO v_remaining_characters
	FROM public.characters AS character
	WHERE character.campaign_id = p_campaign_id
		AND character.id <> p_character_id;
	IF v_remaining_characters < 1 THEN
		RAISE EXCEPTION '戰役中至少需保留一名實體角色。'
			USING ERRCODE = '23514';
	END IF;

	IF jsonb_typeof(v_campaign.camp_chest_currency) IS DISTINCT FROM 'object'
		OR jsonb_typeof(v_character.currencies) IS DISTINCT FROM 'object'
		OR jsonb_typeof(v_character.private_currencies) IS DISTINCT FROM 'object' THEN
		RAISE EXCEPTION '營地箱或角色錢包格式無效，未移除角色。'
			USING ERRCODE = '22023';
	END IF;

	v_updated_currency := v_campaign.camp_chest_currency;
	FOREACH v_currency_key IN ARRAY ARRAY['pp', 'gp', 'ep', 'sp', 'cp'] LOOP
		IF (v_campaign.camp_chest_currency ? v_currency_key
				AND jsonb_typeof(v_campaign.camp_chest_currency -> v_currency_key)
					IS DISTINCT FROM 'number')
			OR (v_character.currencies ? v_currency_key
				AND jsonb_typeof(v_character.currencies -> v_currency_key)
					IS DISTINCT FROM 'number')
			OR (v_character.private_currencies ? v_currency_key
				AND jsonb_typeof(v_character.private_currencies -> v_currency_key)
					IS DISTINCT FROM 'number') THEN
			RAISE EXCEPTION '角色或營地箱的 % 貨幣數值格式無效。', v_currency_key
				USING ERRCODE = '22023';
		END IF;

		v_campaign_amount := COALESCE(
			(v_campaign.camp_chest_currency ->> v_currency_key)::numeric,
			0
		);
		v_public_amount := COALESCE(
			(v_character.currencies ->> v_currency_key)::numeric,
			0
		);
		v_private_amount := COALESCE(
			(v_character.private_currencies ->> v_currency_key)::numeric,
			0
		);

		v_updated_currency := jsonb_set(
			v_updated_currency,
			ARRAY[v_currency_key],
			to_jsonb(v_campaign_amount + v_public_amount + v_private_amount),
			true
		);
	END LOOP;

	FOR v_item IN
		SELECT item.*
		FROM public.inventory_items AS item
		WHERE item.campaign_id = p_campaign_id
			AND item.owner_id = p_character_id
		ORDER BY item.id
		FOR UPDATE
	LOOP
		IF v_item.quantity < 1 THEN
			RAISE EXCEPTION '角色物品數量無效，未移除角色。'
				USING ERRCODE = '23514';
		END IF;

		SELECT target.*
		INTO v_stack
		FROM public.inventory_items AS target
		WHERE target.campaign_id = p_campaign_id
			AND target.owner_id = 'camp-chest'
			AND NOT target.equipped
			AND NOT target.attuned
			AND NOT target.is_private
			AND target.max_charges = 0
			AND target.quantity > 0
			AND v_item.max_charges = 0
			AND btrim(target.name) = btrim(v_item.name)
			AND target.category = v_item.category
			AND target.sub_type = v_item.sub_type
			AND target.rarity = v_item.rarity
			AND target.weight = v_item.weight
			AND target.value_gp = v_item.value_gp
			AND target.requires_attunement = v_item.requires_attunement
			AND target.is_identified = v_item.is_identified
			AND target.item_base IS NOT DISTINCT FROM v_item.item_base
			AND target.item_identified_snapshot
				IS NOT DISTINCT FROM v_item.item_identified_snapshot
			AND target.affixes = v_item.affixes
		ORDER BY target.id
		LIMIT 1
		FOR UPDATE;

		IF FOUND AND v_stack.quantity <= 2147483647 - v_item.quantity THEN
			UPDATE public.inventory_items
			SET quantity = quantity + v_item.quantity
			WHERE id = v_stack.id
				AND campaign_id = p_campaign_id;
			DELETE FROM public.inventory_items
			WHERE id = v_item.id
				AND campaign_id = p_campaign_id;
		ELSE
			UPDATE public.inventory_items
			SET owner_id = 'camp-chest',
				equipped = false,
				attuned = false,
				is_private = false
			WHERE id = v_item.id
				AND campaign_id = p_campaign_id;
		END IF;
	END LOOP;

	UPDATE public.campaigns
	SET camp_chest_currency = v_updated_currency
	WHERE id = p_campaign_id;

	UPDATE public.campaign_journeys
	SET character_id = NULL,
		visibility = 'public'
	WHERE campaign_id = p_campaign_id
		AND character_id = p_character_id;

	DELETE FROM public.characters
	WHERE id = p_character_id
		AND campaign_id = p_campaign_id;
END;
$delete_campaign_character_with_journeys$;

REVOKE ALL ON FUNCTION public.delete_campaign_character_with_journeys(text, text, uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_campaign_character_with_journeys(text, text, uuid)
	TO service_role;

DO $campaign_journeys_realtime$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_publication
		WHERE pubname = 'supabase_realtime'
	) THEN
		RAISE EXCEPTION
			'找不到 supabase_realtime publication；冒險筆記 migration 未完成。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'campaign_journey_dm_notes'
	) THEN
		ALTER PUBLICATION supabase_realtime
			DROP TABLE public.campaign_journey_dm_notes;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'campaign_journeys'
	) THEN
		ALTER PUBLICATION supabase_realtime
			ADD TABLE public.campaign_journeys;
	END IF;
END;
$campaign_journeys_realtime$;

-- 來源 migration: 20261030000009_image_storage_permissions.sql
DO $image_storage_preflight$
BEGIN
	IF to_regclass('storage.buckets') IS NULL
		OR to_regclass('storage.objects') IS NULL THEN
		RAISE EXCEPTION
			'圖片 Storage migration 前置檢查失敗：找不到 Supabase Storage buckets 或 objects。';
	END IF;

	IF to_regprocedure('public.is_campaign_dm(text)') IS NULL
		OR to_regprocedure('public.is_campaign_member_or_dm(text)') IS NULL
		OR to_regprocedure('public.campaign_journey_has_access(text, text, integer)') IS NULL THEN
		RAISE EXCEPTION
			'圖片 Storage migration 前置檢查失敗：缺少 campaign 或冒險筆記權限函式。';
	END IF;

	IF to_regclass('public.blacksmith_items') IS NULL
		OR to_regclass('public.campaign_journeys') IS NULL
		OR to_regclass('public.characters') IS NULL
		OR to_regclass('public.character_permissions') IS NULL THEN
		RAISE EXCEPTION
			'圖片 Storage migration 前置檢查失敗：找不到角色、角色權限、鍛造工坊或冒險筆記資料表。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_attribute
		WHERE attrelid = 'public.characters'::regclass
			AND attname = 'avatar'
			AND atttypid = 'text'::regtype
			AND attnum > 0
			AND NOT attisdropped
	) OR NOT EXISTS (
		SELECT 1
		FROM pg_attribute
		WHERE attrelid = 'public.character_permissions'::regclass
			AND attname = 'can_edit_profile'
			AND atttypid = 'boolean'::regtype
			AND attnum > 0
			AND NOT attisdropped
	) THEN
		RAISE EXCEPTION
			'圖片 Storage migration 前置檢查失敗：characters.avatar 必須為 text，character_permissions.can_edit_profile 必須為 boolean。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_class
		WHERE oid = 'storage.objects'::regclass
			AND relrowsecurity
	) THEN
		RAISE EXCEPTION
			'圖片 Storage migration 前置檢查失敗：storage.objects 必須啟用 RLS。';
	END IF;
END;
$image_storage_preflight$;

CREATE OR REPLACE FUNCTION public.guard_character_avatar_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $guard_character_avatar_permission$
DECLARE
	v_can_edit_profile boolean;
BEGIN
	IF NEW.avatar IS NOT DISTINCT FROM OLD.avatar THEN
		RETURN NEW;
	END IF;

	IF auth.uid() IS NULL THEN
		IF auth.role() = 'service_role'
			OR session_user IN ('postgres', 'supabase_admin') THEN
			RETURN NEW;
		END IF;

		RAISE EXCEPTION '必須登入才能修改角色頭像。'
			USING ERRCODE = '42501';
	END IF;

	IF public.is_campaign_dm(OLD.campaign_id) THEN
		RETURN NEW;
	END IF;

	SELECT permission.can_edit_profile
	INTO v_can_edit_profile
	FROM public.character_permissions AS permission
	WHERE permission.campaign_id = OLD.campaign_id
		AND permission.character_id = OLD.id
		AND permission.user_id = auth.uid()
	FOR SHARE;

	IF FOUND AND v_can_edit_profile THEN
		RETURN NEW;
	END IF;

	IF NOT FOUND AND OLD.user_id = auth.uid()::text THEN
		RETURN NEW;
	END IF;

	RAISE EXCEPTION '沒有修改此角色頭像的權限。'
		USING ERRCODE = '42501';
END;
$guard_character_avatar_permission$;

REVOKE ALL ON FUNCTION public.guard_character_avatar_permission()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_character_avatar_permission ON public.characters;
CREATE TRIGGER guard_character_avatar_permission
	BEFORE UPDATE OF avatar ON public.characters
	FOR EACH ROW
	EXECUTE FUNCTION public.guard_character_avatar_permission();

CREATE OR REPLACE FUNCTION public.can_upload_image_asset(
	p_bucket_id text,
	p_object_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $can_upload_image_asset$
DECLARE
	v_campaign_id text;
	v_journey_id text;
BEGIN
	IF auth.uid() IS NULL OR p_bucket_id IS NULL OR p_object_name IS NULL THEN
		RETURN false;
	END IF;

	IF p_bucket_id = 'user-uploads' THEN
		RETURN p_object_name ~
			'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/avatars/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/256\.webp$'
			AND split_part(p_object_name, '/', 1) = auth.uid()::text;
	END IF;

	IF p_bucket_id = 'blacksmith-assets' THEN
		RETURN p_object_name ~
			'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/items/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/(128|512)\.webp$'
			AND split_part(p_object_name, '/', 1) = auth.uid()::text;
	END IF;

	IF p_bucket_id <> 'campaign-assets' THEN
		RETURN false;
	END IF;

	v_campaign_id := split_part(p_object_name, '/', 1);
	IF v_campaign_id = '' THEN
		RETURN false;
	END IF;

	IF p_object_name ~
		'^[A-Za-z0-9._-]+/items/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/(128|512)\.webp$' THEN
		RETURN public.is_campaign_dm(v_campaign_id);
	END IF;

	IF p_object_name ~
		'^[A-Za-z0-9._-]+/journeys/[A-Za-z0-9._-]+/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/image\.webp$' THEN
		v_journey_id := split_part(p_object_name, '/', 3);

		RETURN public.is_campaign_dm(v_campaign_id)
			OR EXISTS (
				SELECT 1
				FROM public.campaign_journeys AS journey
				WHERE journey.campaign_id = v_campaign_id
					AND journey.id = v_journey_id
					AND journey.visibility = 'public'
					AND journey.created_by = auth.uid()
					AND public.is_campaign_member_or_dm(v_campaign_id)
			)
			OR public.campaign_journey_has_access(
				v_campaign_id,
				(
					SELECT journey.character_id
					FROM public.campaign_journeys AS journey
					WHERE journey.campaign_id = v_campaign_id
						AND journey.id = v_journey_id
				),
				2
			);
	END IF;

	RETURN false;
END;
$can_upload_image_asset$;

CREATE OR REPLACE FUNCTION public.can_delete_image_asset(
	p_bucket_id text,
	p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $can_delete_image_asset$
	SELECT CASE
		WHEN auth.uid() IS NULL OR p_object_name IS NULL THEN false
		WHEN p_bucket_id = 'user-uploads' THEN
			p_object_name ~
				'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/avatars/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/256\.webp$'
			AND split_part(p_object_name, '/', 1) = auth.uid()::text
		WHEN p_bucket_id = 'campaign-assets'
			AND p_object_name ~
				'^[A-Za-z0-9._-]+/(items/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/(128|512)\.webp|journeys/[A-Za-z0-9._-]+/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/image\.webp)$'
		THEN public.is_campaign_dm(split_part(p_object_name, '/', 1))
		ELSE false
	END;
$can_delete_image_asset$;

CREATE OR REPLACE FUNCTION public.can_list_image_assets(
	p_bucket_id text,
	p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $can_list_image_assets$
	SELECT CASE
		WHEN auth.uid() IS NULL OR p_object_name IS NULL THEN false
		WHEN p_bucket_id IN ('user-uploads', 'blacksmith-assets') THEN
			split_part(p_object_name, '/', 1) = auth.uid()::text
		WHEN p_bucket_id = 'campaign-assets' THEN
			public.is_campaign_dm(split_part(p_object_name, '/', 1))
		ELSE false
	END;
$can_list_image_assets$;

REVOKE ALL ON FUNCTION public.can_upload_image_asset(text, text)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_delete_image_asset(text, text)
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_list_image_assets(text, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_image_asset(text, text)
	TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_image_asset(text, text)
	TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_list_image_assets(text, text)
	TO anon, authenticated;

INSERT INTO storage.buckets (
	id,
	name,
	public,
	file_size_limit,
	allowed_mime_types
)
VALUES
	('user-uploads', 'user-uploads', true, 10485760, ARRAY['image/webp']),
	('blacksmith-assets', 'blacksmith-assets', true, 10485760, ARRAY['image/webp']),
	('campaign-assets', 'campaign-assets', true, 10485760, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
	public = EXCLUDED.public,
	file_size_limit = EXCLUDED.file_size_limit,
	allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS image_assets_insert_allowed ON storage.objects;
CREATE POLICY image_assets_insert_allowed
	ON storage.objects
	AS PERMISSIVE
	FOR INSERT
	TO authenticated
	WITH CHECK (
		bucket_id IN ('user-uploads', 'blacksmith-assets', 'campaign-assets')
		AND public.can_upload_image_asset(bucket_id, name)
	);

DROP POLICY IF EXISTS image_assets_insert_boundary ON storage.objects;
CREATE POLICY image_assets_insert_boundary
	ON storage.objects
	AS RESTRICTIVE
	FOR INSERT
	TO public
	WITH CHECK (
		bucket_id NOT IN ('user-uploads', 'blacksmith-assets', 'campaign-assets')
		OR (
			auth.uid() IS NOT NULL
			AND public.can_upload_image_asset(bucket_id, name)
		)
	);

DROP POLICY IF EXISTS image_assets_update_boundary ON storage.objects;
CREATE POLICY image_assets_update_boundary
	ON storage.objects
	AS RESTRICTIVE
	FOR UPDATE
	TO public
	USING (bucket_id NOT IN ('user-uploads', 'blacksmith-assets', 'campaign-assets'))
	WITH CHECK (bucket_id NOT IN ('user-uploads', 'blacksmith-assets', 'campaign-assets'));

DROP POLICY IF EXISTS image_assets_delete_allowed ON storage.objects;
CREATE POLICY image_assets_delete_allowed
	ON storage.objects
	AS PERMISSIVE
	FOR DELETE
	TO authenticated
	USING (
		bucket_id IN ('user-uploads', 'campaign-assets')
		AND public.can_delete_image_asset(bucket_id, name)
	);

DROP POLICY IF EXISTS image_assets_delete_boundary ON storage.objects;
CREATE POLICY image_assets_delete_boundary
	ON storage.objects
	AS RESTRICTIVE
	FOR DELETE
	TO public
	USING (
		bucket_id NOT IN ('user-uploads', 'blacksmith-assets', 'campaign-assets')
		OR (
			auth.uid() IS NOT NULL
			AND public.can_delete_image_asset(bucket_id, name)
		)
	);

DROP POLICY IF EXISTS image_assets_select_allowed ON storage.objects;
CREATE POLICY image_assets_select_allowed
	ON storage.objects
	AS PERMISSIVE
	FOR SELECT
	TO authenticated
	USING (
		bucket_id IN ('user-uploads', 'blacksmith-assets', 'campaign-assets')
		AND public.can_list_image_assets(bucket_id, name)
	);

DROP POLICY IF EXISTS image_assets_select_boundary ON storage.objects;
CREATE POLICY image_assets_select_boundary
	ON storage.objects
	AS RESTRICTIVE
	FOR SELECT
	TO public
	USING (
		bucket_id NOT IN ('user-uploads', 'blacksmith-assets', 'campaign-assets')
		OR (
			auth.uid() IS NOT NULL
			AND public.can_list_image_assets(bucket_id, name)
		)
	);

-- 來源 migration: 20261030000010_migrate_character_avatar_references.sql
BEGIN;

UPDATE public.characters
SET avatar = 'avatar:default'
WHERE avatar IS NULL
   OR (
       avatar <> 'avatar:default'
       AND avatar !~* '^storage:user-uploads/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/avatars/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/256[.]webp$'
   );

COMMIT;

-- 來源 migration: 20261030000011_guard_campaign_item_image_references.sql
DO $campaign_item_image_preflight$
BEGIN
	IF to_regclass('public.inventory_items') IS NULL
		OR to_regprocedure('public.is_campaign_dm(text)') IS NULL THEN
		RAISE EXCEPTION
			'戰役物品圖片權限 migration 前置檢查失敗：缺少 inventory_items 或 is_campaign_dm(text)。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_attribute
		WHERE attrelid = 'public.inventory_items'::regclass
			AND attname = 'campaign_id'
			AND atttypid = 'text'::regtype
			AND attnum > 0
			AND NOT attisdropped
	) OR NOT EXISTS (
		SELECT 1
		FROM pg_attribute
		WHERE attrelid = 'public.inventory_items'::regclass
			AND attname = 'icon'
			AND atttypid = 'text'::regtype
			AND attnum > 0
			AND NOT attisdropped
	) OR NOT EXISTS (
		SELECT 1
		FROM pg_attribute
		WHERE attrelid = 'public.inventory_items'::regclass
			AND attname = 'item_base'
			AND atttypid = 'jsonb'::regtype
			AND attnum > 0
			AND NOT attisdropped
	) THEN
		RAISE EXCEPTION
			'戰役物品圖片權限 migration 前置檢查失敗：inventory_items.campaign_id、icon、item_base 型別與預期不符。';
	END IF;
END;
$campaign_item_image_preflight$;

CREATE OR REPLACE FUNCTION public.guard_campaign_item_image_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $guard_campaign_item_image_reference$
DECLARE
	v_image_reference_changed boolean;
BEGIN
	v_image_reference_changed :=
		COALESCE((
			NEW.icon IS DISTINCT FROM OLD.icon
			AND (
				OLD.icon LIKE 'storage:%'
				OR OLD.icon LIKE 'image:%'
				OR OLD.icon LIKE './images/%'
				OR NEW.icon LIKE 'storage:%'
				OR NEW.icon LIKE 'image:%'
				OR NEW.icon LIKE './images/%'
			)
		), false)
		OR COALESCE((
			NEW.item_base ->> 'icon' IS DISTINCT FROM OLD.item_base ->> 'icon'
			AND (
				OLD.item_base ->> 'icon' LIKE 'storage:%'
				OR OLD.item_base ->> 'icon' LIKE 'image:%'
				OR OLD.item_base ->> 'icon' LIKE './images/%'
				OR NEW.item_base ->> 'icon' LIKE 'storage:%'
				OR NEW.item_base ->> 'icon' LIKE 'image:%'
				OR NEW.item_base ->> 'icon' LIKE './images/%'
			)
		), false);

	IF NOT v_image_reference_changed THEN
		RETURN NEW;
	END IF;

	IF auth.uid() IS NULL
		AND (
			auth.role() = 'service_role'
			OR session_user IN ('postgres', 'supabase_admin')
		) THEN
		RETURN NEW;
	END IF;

	IF public.is_campaign_dm(OLD.campaign_id) THEN
		RETURN NEW;
	END IF;

	RAISE EXCEPTION '只有此戰役的 DM 可以更換物品圖片參照。'
		USING ERRCODE = '42501';
END;
$guard_campaign_item_image_reference$;

REVOKE ALL ON FUNCTION public.guard_campaign_item_image_reference()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_campaign_item_image_reference
	ON public.inventory_items;
CREATE TRIGGER guard_campaign_item_image_reference
	BEFORE UPDATE OF icon, item_base ON public.inventory_items
	FOR EACH ROW
	EXECUTE FUNCTION public.guard_campaign_item_image_reference();
