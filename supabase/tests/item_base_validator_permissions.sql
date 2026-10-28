BEGIN;

DO $check_permissions$
BEGIN
	IF NOT has_function_privilege('authenticated', 'public.is_valid_item_base(jsonb)', 'EXECUTE')
		OR NOT has_function_privilege('service_role', 'public.is_valid_item_base(jsonb)', 'EXECUTE')
		OR NOT has_function_privilege('authenticated', 'public.is_valid_blacksmith_affixes(jsonb)', 'EXECUTE')
		OR NOT has_function_privilege('service_role', 'public.is_valid_blacksmith_affixes(jsonb)', 'EXECUTE')
		OR has_function_privilege('anon', 'public.is_valid_item_base(jsonb)', 'EXECUTE')
		OR has_function_privilege('anon', 'public.is_valid_blacksmith_affixes(jsonb)', 'EXECUTE') THEN
		RAISE EXCEPTION '物品驗證函式權限不符合預期。';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.inventory_items'::regclass
			AND conname = 'inventory_items_item_base_valid_check'
	) OR NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.blacksmith_items'::regclass
			AND conname = 'blacksmith_items_item_base_valid_check'
	) THEN
		RAISE EXCEPTION '缺少物品定義驗證限制。';
	END IF;
END
$check_permissions$;

CREATE TEMP TABLE item_base_validator_test (
	item_base jsonb CHECK (public.is_valid_item_base(item_base))
);
GRANT INSERT, UPDATE, SELECT ON item_base_validator_test TO authenticated, service_role;

SET LOCAL ROLE authenticated;
INSERT INTO item_base_validator_test VALUES (
	'{"name":"護甲","category":"Armor","subTypes":[],"rarity":"Common","weight":10,"valueGp":50,"affixes":[],"effects":"","dmNotes":"","isEquippable":true,"isConsumable":false,"isRequireAttunement":false,"armorProperties":{"ac":"14"}}'::jsonb
);
UPDATE item_base_validator_test SET item_base = item_base || '{"weight":11}'::jsonb;
DO $authenticated_invalid$
BEGIN
	BEGIN
		UPDATE item_base_validator_test SET item_base = '{}'::jsonb;
		RAISE EXCEPTION '無效的物品定義未被拒絕。';
	EXCEPTION WHEN check_violation THEN
		NULL;
	END;
END
$authenticated_invalid$;

RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE item_base_validator_test SET item_base = item_base || '{"weight":12}'::jsonb;
DO $service_role_invalid$
BEGIN
	BEGIN
		UPDATE item_base_validator_test SET item_base = '{}'::jsonb;
		RAISE EXCEPTION '無效的物品定義未被拒絕。';
	EXCEPTION WHEN check_violation THEN
		NULL;
	END;
END
$service_role_invalid$;

ROLLBACK;
