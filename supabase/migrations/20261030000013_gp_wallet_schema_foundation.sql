CREATE OR REPLACE FUNCTION public.legacy_currency_wallet_zeroed_field_count(
	p_wallet jsonb
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $legacy_currency_wallet_zeroed_field_count$
DECLARE
	v_currency_key text;
	v_amount numeric;
	v_count integer := 0;
BEGIN
	IF jsonb_typeof(p_wallet) IS DISTINCT FROM 'object' THEN
		RETURN 5;
	END IF;

	FOREACH v_currency_key IN ARRAY ARRAY['pp', 'gp', 'ep', 'sp', 'cp'] LOOP
		IF NOT (p_wallet ? v_currency_key)
			OR jsonb_typeof(p_wallet -> v_currency_key) IS DISTINCT FROM 'number' THEN
			v_count := v_count + 1;
		ELSE
			v_amount := (p_wallet ->> v_currency_key)::numeric;
			IF v_amount < 0 OR v_amount <> trunc(v_amount) THEN
				v_count := v_count + 1;
			END IF;
		END IF;
	END LOOP;

	RETURN v_count;
END
$legacy_currency_wallet_zeroed_field_count$;

CREATE OR REPLACE FUNCTION public.legacy_currency_wallet_has_invalid_amount(
	p_wallet jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $legacy_currency_wallet_has_invalid_amount$
DECLARE
	v_currency_key text;
	v_amount numeric;
BEGIN
	IF jsonb_typeof(p_wallet) IS DISTINCT FROM 'object' THEN
		RETURN true;
	END IF;

	FOREACH v_currency_key IN ARRAY ARRAY['pp', 'gp', 'ep', 'sp', 'cp'] LOOP
		IF p_wallet ? v_currency_key THEN
			IF jsonb_typeof(p_wallet -> v_currency_key) IS DISTINCT FROM 'number' THEN
				RETURN true;
			END IF;

			v_amount := (p_wallet ->> v_currency_key)::numeric;
			IF v_amount < 0 OR v_amount <> trunc(v_amount) THEN
				RETURN true;
			END IF;
		END IF;
	END LOOP;

	RETURN false;
END
$legacy_currency_wallet_has_invalid_amount$;

CREATE OR REPLACE FUNCTION public.gp_from_legacy_currency_wallet(p_wallet jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $gp_from_legacy_currency_wallet$
DECLARE
	v_currency_key text;
	v_amount numeric;
	v_cp numeric := 0;
BEGIN
	IF jsonb_typeof(p_wallet) IS DISTINCT FROM 'object' THEN
		RETURN 0;
	END IF;

	FOREACH v_currency_key IN ARRAY ARRAY['pp', 'gp', 'ep', 'sp', 'cp'] LOOP
		IF jsonb_typeof(p_wallet -> v_currency_key) = 'number' THEN
			v_amount := (p_wallet ->> v_currency_key)::numeric;
			IF v_amount >= 0 AND v_amount = trunc(v_amount) THEN
				v_cp := v_cp + v_amount * CASE v_currency_key
					WHEN 'pp' THEN 1000
					WHEN 'gp' THEN 100
					WHEN 'ep' THEN 50
					WHEN 'sp' THEN 10
					ELSE 1
				END;
			END IF;
		END IF;
	END LOOP;

	RETURN v_cp / 100;
END
$gp_from_legacy_currency_wallet$;

REVOKE ALL ON FUNCTION public.legacy_currency_wallet_has_invalid_amount(jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.legacy_currency_wallet_zeroed_field_count(jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gp_from_legacy_currency_wallet(jsonb)
	FROM PUBLIC, anon, authenticated, service_role;

DO $gp_wallet_migration_preflight$
DECLARE
	v_invalid_public_wallets bigint;
	v_invalid_private_wallets bigint;
	v_invalid_camp_chests bigint;
	v_zeroed_public_fields bigint;
	v_zeroed_private_fields bigint;
	v_zeroed_camp_chest_fields bigint;
	v_over_limit_public_wallets bigint;
	v_over_limit_private_wallets bigint;
	v_over_limit_camp_chests bigint;
BEGIN
	SELECT
		count(*) FILTER (
			WHERE public.legacy_currency_wallet_has_invalid_amount(currencies)
		),
		count(*) FILTER (
			WHERE public.legacy_currency_wallet_has_invalid_amount(private_currencies)
		),
		COALESCE(
			sum(public.legacy_currency_wallet_zeroed_field_count(currencies)),
			0
		),
		COALESCE(
			sum(public.legacy_currency_wallet_zeroed_field_count(private_currencies)),
			0
		),
		count(*) FILTER (
			WHERE public.gp_from_legacy_currency_wallet(currencies) > 1000000
		),
		count(*) FILTER (
			WHERE public.gp_from_legacy_currency_wallet(private_currencies) > 1000000
		)
	INTO
		v_invalid_public_wallets,
		v_invalid_private_wallets,
		v_zeroed_public_fields,
		v_zeroed_private_fields,
		v_over_limit_public_wallets,
		v_over_limit_private_wallets
	FROM public.characters;

	SELECT
		count(*) FILTER (
			WHERE public.legacy_currency_wallet_has_invalid_amount(camp_chest_currency)
		),
		COALESCE(
			sum(public.legacy_currency_wallet_zeroed_field_count(camp_chest_currency)),
			0
		),
		count(*) FILTER (
			WHERE public.gp_from_legacy_currency_wallet(camp_chest_currency) > 1000000
		)
	INTO
		v_invalid_camp_chests,
		v_zeroed_camp_chest_fields,
		v_over_limit_camp_chests
	FROM public.campaigns;

	RAISE NOTICE
		'舊錢包無效資料列數（公開／私人／營地箱）：%／%／%',
		v_invalid_public_wallets,
		v_invalid_private_wallets,
		v_invalid_camp_chests;
	RAISE NOTICE
		'按零換算的舊面額欄位數（公開／私人／營地箱）：%／%／%',
		v_zeroed_public_fields,
		v_zeroed_private_fields,
		v_zeroed_camp_chest_fields;

	IF v_over_limit_public_wallets > 0
		OR v_over_limit_private_wallets > 0
		OR v_over_limit_camp_chests > 0 THEN
		RAISE EXCEPTION
			'舊錢包換算後超過 1,000,000 GP（公開／私人／營地箱資料列數：%／%／%）；請先由維護者檢視資料。',
			v_over_limit_public_wallets,
			v_over_limit_private_wallets,
			v_over_limit_camp_chests
			USING ERRCODE = '23514';
	END IF;
END
$gp_wallet_migration_preflight$;

-- Unconstrained numeric lets the CHECK reject sub-cent values before any rounding.
ALTER TABLE public.characters
	ADD COLUMN gp numeric NOT NULL DEFAULT 0,
	ADD COLUMN private_gp numeric NOT NULL DEFAULT 0;

ALTER TABLE public.campaigns
	ADD COLUMN camp_chest_gp numeric NOT NULL DEFAULT 0;

UPDATE public.characters
SET gp = public.gp_from_legacy_currency_wallet(currencies),
	private_gp = public.gp_from_legacy_currency_wallet(private_currencies);

UPDATE public.campaigns
SET camp_chest_gp =
	public.gp_from_legacy_currency_wallet(camp_chest_currency);

ALTER TABLE public.characters
	ADD CONSTRAINT characters_gp_range_check
		CHECK (gp >= 0 AND gp <= 1000000 AND gp = trunc(gp, 2)),
	ADD CONSTRAINT characters_private_gp_range_check
		CHECK (
			private_gp >= 0
			AND private_gp <= 1000000
			AND private_gp = trunc(private_gp, 2)
		);

ALTER TABLE public.campaigns
	ADD CONSTRAINT campaigns_camp_chest_gp_range_check
		CHECK (
			camp_chest_gp >= 0
			AND camp_chest_gp <= 1000000
			AND camp_chest_gp = trunc(camp_chest_gp, 2)
		);

DO $gp_wallet_schema_verification$
DECLARE
	v_column_type text;
	v_numeric_column_count integer;
	v_check_count integer;
BEGIN
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
		RAISE EXCEPTION '三個 GP 錢包欄位都必須使用不預先四捨五入的 numeric 型別。';
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
		RAISE EXCEPTION 'GP 錢包的範圍與精度檢查限制不完整。';
	END IF;
END
$gp_wallet_schema_verification$;
