ALTER FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) RENAME TO refresh_campaign_shop_items_with_retirement;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items_with_retirement(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.refresh_campaign_shop_items(
	p_campaign_id text,
	p_shop_id text,
	p_expected_shop_updated_at timestamptz,
	p_expected_items jsonb,
	p_keep_items boolean,
	p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $refresh_campaign_shop_items$
DECLARE
	v_result jsonb;
	v_deleted integer := 0;
BEGIN
	v_result := public.refresh_campaign_shop_items_with_retirement(
		p_campaign_id,
		p_shop_id,
		p_expected_shop_updated_at,
		p_expected_items,
		p_keep_items,
		p_changes
	);

	IF NOT p_keep_items THEN
		DELETE FROM public.campaign_shop_items
		WHERE campaign_id = p_campaign_id
			AND shop_id = p_shop_id
			AND NOT is_active;
		GET DIAGNOSTICS v_deleted = ROW_COUNT;
	END IF;

	RETURN (v_result - 'retired')
		|| jsonb_build_object('deleted', v_deleted);
END
$refresh_campaign_shop_items$;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) TO authenticated;
