BEGIN;

DO $campaign_item_image_permissions$
DECLARE
	v_function_is_secdef boolean;
	v_function_config text[];
	v_trigger_definition text;
	v_trigger_enabled "char";
BEGIN
	SELECT p.prosecdef, p.proconfig
	INTO v_function_is_secdef, v_function_config
	FROM pg_proc AS p
	WHERE p.oid =
		to_regprocedure('public.guard_campaign_item_image_reference()');

	IF NOT FOUND
		OR v_function_is_secdef IS DISTINCT FROM true
		OR NOT COALESCE(
			v_function_config @> ARRAY['search_path=pg_catalog, public, auth'],
			false
		) THEN
		RAISE EXCEPTION
			'戰役物品圖片權限檢查失敗：guard function 必須存在、使用 SECURITY DEFINER 與固定 search_path。';
	END IF;

	SELECT pg_get_triggerdef(t.oid), t.tgenabled
	INTO v_trigger_definition, v_trigger_enabled
	FROM pg_trigger AS t
	WHERE t.tgrelid = 'public.inventory_items'::regclass
		AND t.tgname = 'guard_campaign_item_image_reference'
		AND NOT t.tgisinternal;

	IF NOT FOUND
		OR v_trigger_enabled IS DISTINCT FROM 'O'
		OR v_trigger_definition NOT LIKE '%BEFORE UPDATE OF icon, item_base%' THEN
		RAISE EXCEPTION
			'戰役物品圖片權限檢查失敗：inventory_items 的圖片參照保護 trigger 不存在、停用或監控欄位不符。';
	END IF;
END;
$campaign_item_image_permissions$;

ROLLBACK;
