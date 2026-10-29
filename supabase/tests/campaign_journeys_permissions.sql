BEGIN;

DO $campaign_journeys_permissions$
DECLARE
	v_column_type text;
	v_policy_count integer;
BEGIN
	SELECT format_type(attribute.atttypid, attribute.atttypmod)
	INTO v_column_type
	FROM pg_attribute AS attribute
	WHERE attribute.attrelid = 'public.campaign_journeys'::regclass
		AND attribute.attname = 'campaign_id'
		AND attribute.attnum > 0
		AND NOT attribute.attisdropped;
	IF v_column_type IS DISTINCT FROM 'text' THEN
		RAISE EXCEPTION 'campaign_journeys.campaign_id 必須為 text。';
	END IF;

	SELECT format_type(attribute.atttypid, attribute.atttypmod)
	INTO v_column_type
	FROM pg_attribute AS attribute
	WHERE attribute.attrelid = 'public.campaign_journeys'::regclass
		AND attribute.attname = 'character_id'
		AND attribute.attnum > 0
		AND NOT attribute.attisdropped;
	IF v_column_type IS DISTINCT FROM 'text' THEN
		RAISE EXCEPTION 'campaign_journeys.character_id 必須為 text。';
	END IF;

	SELECT format_type(attribute.atttypid, attribute.atttypmod)
	INTO v_column_type
	FROM pg_attribute AS attribute
	WHERE attribute.attrelid = 'public.campaign_journeys'::regclass
		AND attribute.attname = 'created_by'
		AND attribute.attnum > 0
		AND NOT attribute.attisdropped;
	IF v_column_type IS DISTINCT FROM 'uuid' THEN
		RAISE EXCEPTION 'campaign_journeys.created_by 必須為 uuid。';
	END IF;

	SELECT format_type(attribute.atttypid, attribute.atttypmod)
	INTO v_column_type
	FROM pg_attribute AS attribute
	WHERE attribute.attrelid = 'public.character_permissions'::regclass
		AND attribute.attname = 'journey_access'
		AND attribute.attnum > 0
		AND NOT attribute.attisdropped;
	IF v_column_type IS DISTINCT FROM 'smallint' THEN
		RAISE EXCEPTION 'character_permissions.journey_access 必須為 smallint。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conrelid = 'public.character_permissions'::regclass
			AND conname = 'character_permissions_journey_access_check'
			AND pg_get_constraintdef(oid) LIKE '%journey_access%0%1%2%'
	) THEN
		RAISE EXCEPTION 'journey_access 缺少 0/1/2 檢查限制。';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_class
		WHERE oid = 'public.campaign_journeys'::regclass AND relrowsecurity
	) OR NOT EXISTS (
		SELECT 1 FROM pg_class
		WHERE oid = 'public.campaign_journey_dm_notes'::regclass AND relrowsecurity
	) THEN
		RAISE EXCEPTION '冒險筆記資料表必須啟用 RLS。';
	END IF;

	SELECT count(*)
	INTO v_policy_count
	FROM pg_policies
	WHERE schemaname = 'public'
		AND tablename = 'campaign_journeys'
		AND policyname IN (
			'Campaign members can read accessible journeys',
			'Campaign members can create journeys',
			'Journey owners and authorized users can update journeys',
			'Journey owners and authorized users can delete journeys'
		);
	IF v_policy_count <> 4 THEN
		RAISE EXCEPTION 'campaign_journeys 的 SELECT/INSERT/UPDATE/DELETE RLS policies 不完整。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'campaign_journey_dm_notes'
			AND policyname = 'Only campaign DMs can access DM journey notes'
			AND cmd = 'ALL'
	) THEN
		RAISE EXCEPTION 'DM 私密筆記缺少 DM-only RLS policy。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename = 'characters'
			AND policyname = 'Characters are deleted only by trusted transaction'
			AND cmd = 'DELETE'
			AND permissive = 'RESTRICTIVE'
			AND qual = 'false'
	) THEN
		RAISE EXCEPTION '直接刪除角色未被限制在交易 RPC。';
	END IF;

	IF has_table_privilege('anon', 'public.campaign_journeys', 'SELECT')
		OR has_table_privilege('anon', 'public.campaign_journey_dm_notes', 'SELECT')
		OR has_table_privilege('anon', 'public.campaign_journey_dm_notes', 'INSERT')
		OR has_table_privilege('anon', 'public.campaign_journey_dm_notes', 'UPDATE')
		OR has_table_privilege('anon', 'public.campaign_journey_dm_notes', 'DELETE') THEN
		RAISE EXCEPTION 'anon 不可取得冒險筆記資料表權限。';
	END IF;

	IF has_table_privilege('authenticated', 'public.characters', 'DELETE')
		OR has_table_privilege('anon', 'public.characters', 'DELETE') THEN
		RAISE EXCEPTION 'authenticated／anon 不可直接刪除角色。';
	END IF;

	IF has_column_privilege(
		'authenticated', 'public.campaign_journeys', 'created_by', 'UPDATE'
	) OR has_column_privilege(
		'authenticated', 'public.campaign_journeys', 'created_at', 'UPDATE'
	) OR has_column_privilege(
		'authenticated', 'public.campaign_journeys', 'campaign_id', 'UPDATE'
	) THEN
		RAISE EXCEPTION 'authenticated 不可更新冒險筆記的建立者、建立時間或戰役 ID。';
	END IF;

	IF NOT has_function_privilege(
		'authenticated',
		'public.campaign_journey_has_access(text,text,integer)',
		'EXECUTE'
	) OR has_function_privilege(
		'anon',
		'public.campaign_journey_has_access(text,text,integer)',
		'EXECUTE'
	) THEN
		RAISE EXCEPTION '冒險筆記 ACL helper 執行權限不符合預期。';
	END IF;

	IF NOT has_function_privilege(
		'service_role',
		'public.delete_campaign_character_with_journeys(text,text,uuid)',
		'EXECUTE'
	) OR has_function_privilege(
		'authenticated',
		'public.delete_campaign_character_with_journeys(text,text,uuid)',
		'EXECUTE'
	) OR has_function_privilege(
		'anon',
		'public.delete_campaign_character_with_journeys(text,text,uuid)',
		'EXECUTE'
	) THEN
		RAISE EXCEPTION '角色刪除交易 RPC 執行權限不符合預期。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'campaign_journeys'
	) OR EXISTS (
		SELECT 1
		FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'campaign_journey_dm_notes'
	) THEN
		RAISE EXCEPTION 'Realtime 必須只發布主筆記表，不得發布 DM 私密筆記表。';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger
		WHERE tgrelid = 'public.inventory_items'::regclass
			AND tgname = 'lock_inventory_character_owner'
			AND NOT tgisinternal
	) THEN
		RAISE EXCEPTION '物品 owner 缺少角色刪除競爭保護 trigger。';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_trigger
		WHERE tgrelid = 'public.character_permissions'::regclass
			AND tgname = 'initialize_character_owner_journey_access'
			AND NOT tgisinternal
	) OR NOT EXISTS (
		SELECT 1 FROM pg_trigger
		WHERE tgrelid = 'public.characters'::regclass
			AND tgname = 'sync_character_owner_journey_access'
			AND NOT tgisinternal
	) THEN
		RAISE EXCEPTION '角色擁有者的 journey_access 預設／轉移 trigger 不完整。';
	END IF;
END;
$campaign_journeys_permissions$;

ROLLBACK;
