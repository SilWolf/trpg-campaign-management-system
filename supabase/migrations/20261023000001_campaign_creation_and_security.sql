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
