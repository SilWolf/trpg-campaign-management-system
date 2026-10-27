CREATE OR REPLACE FUNCTION public.campaign_official_catalog_ids_are_valid(
	p_catalog_ids text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $campaign_official_catalog_ids_are_valid$
SELECT p_catalog_ids IS NOT NULL
	AND array_position(p_catalog_ids, NULL) IS NULL
		AND cardinality(p_catalog_ids) = (
			SELECT count(DISTINCT catalog_id)::integer
			FROM unnest(p_catalog_ids) AS catalog(catalog_id)
		)
		AND NOT EXISTS (
			SELECT 1
			FROM unnest(p_catalog_ids) AS catalog(catalog_id)
			WHERE catalog_id !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
				OR catalog_id LIKE '%..%'
		);
$campaign_official_catalog_ids_are_valid$;

REVOKE ALL ON FUNCTION public.campaign_official_catalog_ids_are_valid(text[])
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_official_catalog_ids_are_valid(text[])
	TO authenticated, service_role;

ALTER TABLE public.campaigns
	ADD COLUMN IF NOT EXISTS official_catalog_ids text[] NOT NULL
		DEFAULT ARRAY[]::text[];

DO $campaign_official_catalog_ids$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.campaigns
		WHERE official_catalog_ids IS NULL
			OR NOT public.campaign_official_catalog_ids_are_valid(
				official_catalog_ids
			)
	) THEN
		RAISE EXCEPTION
			'campaigns.official_catalog_ids 有無效資料；請先確認規則書 ID 後再套用 migration。';
	END IF;

	ALTER TABLE public.campaigns
		ALTER COLUMN official_catalog_ids SET DEFAULT ARRAY[]::text[],
		ALTER COLUMN official_catalog_ids SET NOT NULL;
END
$campaign_official_catalog_ids$;

ALTER TABLE public.campaigns
	DROP CONSTRAINT IF EXISTS campaigns_official_catalog_ids_valid;
ALTER TABLE public.campaigns
	ADD CONSTRAINT campaigns_official_catalog_ids_valid
	CHECK (
		public.campaign_official_catalog_ids_are_valid(official_catalog_ids)
	);

GRANT UPDATE (official_catalog_ids)
	ON public.campaigns TO authenticated;
