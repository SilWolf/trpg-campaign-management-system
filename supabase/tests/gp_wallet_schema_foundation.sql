BEGIN;

DO $gp_wallet_schema_foundation$
DECLARE
	v_balance numeric;
	v_numeric_column_count integer;
	v_check_count integer;
BEGIN
	IF public.gp_from_legacy_currency_wallet(
		'{"pp":2,"gp":485,"ep":0,"sp":34,"cp":80}'::jsonb
	) <> 509.20 THEN
		RAISE EXCEPTION '舊面額換算未保留完整 GP 價值。';
	END IF;

	IF public.gp_from_legacy_currency_wallet(
		'{"gp":1,"sp":1.5,"cp":100}'::jsonb
	) <> 2 THEN
		RAISE EXCEPTION '無效面額未按零處理或有效面額遭到遺失。';
	END IF;

	IF public.gp_from_legacy_currency_wallet('[]'::jsonb) <> 0
		OR public.gp_from_legacy_currency_wallet('null'::jsonb) <> 0 THEN
		RAISE EXCEPTION '非物件錢包必須換算為零。';
	END IF;

	IF NOT public.legacy_currency_wallet_has_invalid_amount(
		'{"gp":-1}'::jsonb
	) OR NOT public.legacy_currency_wallet_has_invalid_amount(
		'[]'::jsonb
	) OR public.legacy_currency_wallet_has_invalid_amount(
		'{"gp":1,"sp":0}'::jsonb
	) THEN
		RAISE EXCEPTION '舊錢包無效資料預檢結果不正確。';
	END IF;

	IF public.legacy_currency_wallet_zeroed_field_count(
		'{"gp":1,"sp":0}'::jsonb
	) <> 3 OR public.legacy_currency_wallet_zeroed_field_count(
		'[]'::jsonb
	) <> 5 THEN
		RAISE EXCEPTION '舊錢包按零換算欄位統計不正確。';
	END IF;

	SELECT count(*)
	INTO v_check_count
	FROM pg_constraint
	WHERE (conrelid = 'public.characters'::regclass
			AND conname IN (
				'characters_gp_range_check',
				'characters_private_gp_range_check'
			))
		OR (conrelid = 'public.campaigns'::regclass
			AND conname = 'campaigns_camp_chest_gp_range_check');

	IF v_check_count <> 3 THEN
		RAISE EXCEPTION '角色與營地箱 GP 限制未完整建立。';
	END IF;

	SELECT count(*)
	INTO v_numeric_column_count
	FROM pg_attribute AS attribute
	WHERE attribute.attrelid IN (
			'public.characters'::regclass,
			'public.campaigns'::regclass
		)
		AND attribute.attname IN ('gp', 'private_gp', 'camp_chest_gp')
		AND attribute.attnum > 0
		AND NOT attribute.attisdropped
		AND format_type(attribute.atttypid, attribute.atttypmod) = 'numeric';

	IF v_numeric_column_count <> 3 THEN
		RAISE EXCEPTION '三個 GP 錢包欄位未使用未預先四捨五入的 numeric 型別。';
	END IF;

	CREATE TEMP TABLE gp_wallet_constraint_test (
		balance numeric NOT NULL
			CHECK (
				balance >= 0
				AND balance <= 1000000
				AND balance = trunc(balance, 2)
			)
	) ON COMMIT DROP;

	INSERT INTO gp_wallet_constraint_test VALUES
		(0), (0.01), (999999.99), (1000000);

	FOREACH v_balance IN ARRAY ARRAY[
		-0.01::numeric,
		0.001::numeric,
		1000000.01::numeric,
		'NaN'::numeric,
		'Infinity'::numeric,
		'-Infinity'::numeric
	] LOOP
		BEGIN
			INSERT INTO gp_wallet_constraint_test VALUES (v_balance);
			RAISE EXCEPTION 'GP 限制意外接受 %。', v_balance;
		EXCEPTION
			WHEN check_violation THEN
				NULL;
		END;
	END LOOP;
END
$gp_wallet_schema_foundation$;

ROLLBACK;
