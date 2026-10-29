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
