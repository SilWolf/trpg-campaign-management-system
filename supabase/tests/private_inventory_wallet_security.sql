BEGIN;

DO $private_inventory_wallet_security_contract$
DECLARE
	v_policy_count integer;
	v_trigger_count integer;
BEGIN
	IF has_column_privilege(
		'authenticated', 'public.characters', 'gp', 'SELECT'
	) OR has_column_privilege(
		'authenticated', 'public.characters', 'private_gp', 'SELECT'
	) OR has_column_privilege(
		'authenticated', 'public.characters', 'currencies', 'SELECT'
	) OR has_column_privilege(
		'authenticated', 'public.characters', 'private_currencies', 'SELECT'
	) THEN
		RAISE EXCEPTION '角色錢包欄位仍可由 authenticated 直接讀取。';
	END IF;

	IF has_column_privilege(
		'anon', 'public.characters', 'private_gp', 'SELECT'
	) OR NOT has_column_privilege(
		'authenticated', 'public.characters', 'id', 'SELECT'
	) THEN
		RAISE EXCEPTION '角色安全欄位授權範圍不正確。';
	END IF;

	IF has_column_privilege(
		'authenticated', 'public.inventory_items', 'is_private', 'UPDATE'
	) THEN
		RAISE EXCEPTION 'authenticated 仍可直接修改物品秘密狀態。';
	END IF;

	SELECT count(*)
	INTO v_policy_count
	FROM pg_catalog.pg_policies AS policy
	WHERE policy.schemaname = 'public'
		AND policy.tablename = 'inventory_items'
		AND policy.policyname IN (
			'inventory_items_acl_read',
			'inventory_items_acl_insert',
			'inventory_items_acl_update',
			'inventory_items_acl_delete'
		)
		AND policy.permissive = 'RESTRICTIVE';
	IF v_policy_count <> 4 THEN
		RAISE EXCEPTION '物品 ACL 的限制性 RLS policies 未完整建立。';
	END IF;

	IF NOT has_function_privilege(
		'authenticated',
		'public.get_campaign_character_wallets(text,text[])',
		'EXECUTE'
	) OR has_function_privilege(
		'anon',
		'public.get_campaign_character_wallets(text,text[])',
		'EXECUTE'
	) THEN
		RAISE EXCEPTION '安全錢包讀取 RPC 的執行權限不正確。';
	END IF;

	SELECT count(*)
	INTO v_trigger_count
	FROM pg_catalog.pg_trigger AS trigger_row
	WHERE NOT trigger_row.tgisinternal
		AND (
			(trigger_row.tgrelid = 'public.characters'::regclass
				AND trigger_row.tgname IN (
					'characters_wallet_write_guard',
					'characters_safe_change_broadcast'
				))
			OR (trigger_row.tgrelid = 'public.inventory_items'::regclass
				AND trigger_row.tgname = 'inventory_items_private_transition_guard')
		);
	IF v_trigger_count <> 3 THEN
		RAISE EXCEPTION '錢包／物品安全觸發器未完整建立。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM pg_catalog.pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename IN ('characters', 'inventory_items')
	) THEN
		RAISE EXCEPTION '敏感資料表仍在 supabase_realtime publication。';
	END IF;
END
$private_inventory_wallet_security_contract$;

ROLLBACK;
