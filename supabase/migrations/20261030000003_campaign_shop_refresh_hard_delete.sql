ALTER TABLE public.campaign_shop_orders
	ALTER COLUMN shop_item_id DROP NOT NULL;

ALTER FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) RENAME TO refresh_campaign_shop_items_before_hard_delete;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items_before_hard_delete(
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
	v_result := public.refresh_campaign_shop_items_before_hard_delete(
		p_campaign_id,
		p_shop_id,
		p_expected_shop_updated_at,
		p_expected_items,
		p_keep_items,
		p_changes
	);

	IF NOT p_keep_items THEN
		UPDATE public.campaign_shop_orders AS order_row
		SET status = 'rejected',
			reviewed_by = auth.uid(),
			reviewed_at = now(),
			updated_at = now()
		WHERE order_row.campaign_id = p_campaign_id
			AND order_row.shop_id = p_shop_id
			AND order_row.status = 'pending'
			AND EXISTS (
				SELECT 1
				FROM public.campaign_shop_items AS item
				WHERE item.id = order_row.shop_item_id
					AND item.campaign_id = p_campaign_id
					AND item.shop_id = p_shop_id
					AND NOT item.is_active
			);

		UPDATE public.campaign_shop_orders AS order_row
		SET shop_item_id = NULL
		WHERE order_row.campaign_id = p_campaign_id
			AND order_row.shop_id = p_shop_id
			AND EXISTS (
				SELECT 1
				FROM public.campaign_shop_items AS item
				WHERE item.id = order_row.shop_item_id
					AND item.campaign_id = p_campaign_id
					AND item.shop_id = p_shop_id
					AND NOT item.is_active
			);

		DELETE FROM public.campaign_shop_items
		WHERE campaign_id = p_campaign_id
			AND shop_id = p_shop_id
			AND NOT is_active;
		GET DIAGNOSTICS v_deleted = ROW_COUNT;
	END IF;

	RETURN (v_result - 'deleted' - 'retired')
		|| jsonb_build_object('deleted', v_deleted);
END
$refresh_campaign_shop_items$;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) TO authenticated;
