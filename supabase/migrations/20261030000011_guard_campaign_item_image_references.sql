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
