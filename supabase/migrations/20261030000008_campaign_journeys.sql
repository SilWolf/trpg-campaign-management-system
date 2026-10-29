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
