BEGIN;

DO $image_storage_permissions$
DECLARE
	v_bucket_errors text;
	v_policy_count integer;
	v_upload_function_is_secdef boolean;
	v_delete_function_is_secdef boolean;
	v_list_function_is_secdef boolean;
	v_avatar_guard_is_secdef boolean;
BEGIN
	SELECT string_agg(
		format(
			'%s：%s',
			expected.id,
			CASE
				WHEN bucket.id IS NULL THEN '不存在'
				ELSE format(
					'public=%s, file_size_limit=%s, allowed_mime_types=%s',
					COALESCE(bucket.public::text, 'NULL'),
					COALESCE(bucket.file_size_limit::text, 'NULL'),
					COALESCE(to_json(bucket.allowed_mime_types)::text, 'NULL')
				)
			END
		),
		E'\n'
		ORDER BY expected.id
	)
	INTO v_bucket_errors
	FROM (VALUES
		('user-uploads'),
		('blacksmith-assets'),
		('campaign-assets')
	) AS expected(id)
	LEFT JOIN storage.buckets AS bucket ON bucket.id = expected.id
	WHERE bucket.id IS NULL
		OR bucket.public IS DISTINCT FROM true
		OR bucket.file_size_limit IS DISTINCT FROM 10485760
		OR bucket.allowed_mime_types IS DISTINCT FROM ARRAY['image/webp']::text[];

	IF v_bucket_errors IS NOT NULL THEN
		RAISE EXCEPTION
			'圖片 Storage buckets 設定不符：%', E'\n' || v_bucket_errors
			USING HINT =
				'請確認目標專案與 migration history，檢查階段二 migration 是否成功執行；預期 public=true、file_size_limit=10485760、allowed_mime_types=["image/webp"]。';
	END IF;

	SELECT count(*)
	INTO v_policy_count
	FROM pg_policies
	WHERE schemaname = 'storage'
		AND tablename = 'objects'
		AND policyname IN (
			'image_assets_insert_allowed',
			'image_assets_insert_boundary',
			'image_assets_update_boundary',
			'image_assets_delete_allowed',
			'image_assets_delete_boundary',
			'image_assets_select_allowed',
			'image_assets_select_boundary'
		);
	IF v_policy_count <> 7 THEN
		RAISE EXCEPTION
			'圖片 Storage 的上傳、更新、刪除與受限列舉 policies 不完整。';
	END IF;

	SELECT function_row.prosecdef
	INTO v_upload_function_is_secdef
	FROM pg_proc AS function_row
	WHERE function_row.oid =
		'public.can_upload_image_asset(text, text)'::regprocedure;
	SELECT function_row.prosecdef
	INTO v_delete_function_is_secdef
	FROM pg_proc AS function_row
	WHERE function_row.oid =
		'public.can_delete_image_asset(text, text)'::regprocedure;
	SELECT function_row.prosecdef
	INTO v_list_function_is_secdef
	FROM pg_proc AS function_row
	WHERE function_row.oid =
		'public.can_list_image_assets(text, text)'::regprocedure;
	SELECT function_row.prosecdef
	INTO v_avatar_guard_is_secdef
	FROM pg_proc AS function_row
	WHERE function_row.oid =
		'public.guard_character_avatar_permission()'::regprocedure;
	IF v_upload_function_is_secdef IS DISTINCT FROM true
		OR v_delete_function_is_secdef IS DISTINCT FROM true
		OR v_list_function_is_secdef IS DISTINCT FROM true
		OR v_avatar_guard_is_secdef IS DISTINCT FROM true THEN
		RAISE EXCEPTION
			'圖片權限檢查函式必須以 SECURITY DEFINER 執行。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_trigger
		WHERE tgrelid = 'public.characters'::regclass
			AND tgname = 'guard_character_avatar_permission'
			AND NOT tgisinternal
			AND (tgtype & 16) = 16
	) THEN
		RAISE EXCEPTION
			'角色頭像參照更新必須由資料庫 trigger 檢查權限。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'storage'
			AND tablename = 'objects'
			AND policyname = 'image_assets_update_boundary'
			AND cmd = 'UPDATE'
			AND permissive = 'RESTRICTIVE'
	) THEN
		RAISE EXCEPTION '圖片 Storage 必須明確拒絕原地更新。';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_policies
		WHERE schemaname = 'storage'
			AND tablename = 'objects'
			AND policyname = 'image_assets_select_boundary'
			AND cmd = 'SELECT'
			AND permissive = 'RESTRICTIVE'
	) THEN
		RAISE EXCEPTION
			'公開圖片 bucket 必須限制 Storage 物件清單僅供擁有者或 DM 使用。';
	END IF;
END;
$image_storage_permissions$;

ROLLBACK;
