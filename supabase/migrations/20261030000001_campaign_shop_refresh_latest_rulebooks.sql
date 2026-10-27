ALTER FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) RENAME TO refresh_campaign_shop_items_before_unidentified_item_rulebooks;

REVOKE ALL ON FUNCTION
	public.refresh_campaign_shop_items_before_unidentified_item_rulebooks(
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
	v_shop public.campaign_shops%ROWTYPE;
	v_catalog_ids text[];
	v_expanded_policy jsonb;
	v_effective_updated_at timestamptz;
	v_result jsonb;
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_dm(p_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以刷新商店商品。'
			USING ERRCODE = '42501';
	END IF;

	SELECT shop.*
	INTO v_shop
	FROM public.campaign_shops AS shop
	WHERE shop.id = p_shop_id
		AND shop.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店不存在或不屬於此戰役。'
			USING ERRCODE = '22023';
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM jsonb_array_elements(v_shop.refresh_policy -> 'rules') AS rule(value)
		CROSS JOIN jsonb_array_elements(
			rule.value -> 'possibleItemsOrFilters'
		) AS candidate(value)
		WHERE candidate.value ->> 'source' = '__campaign_rulebooks__'
	) THEN
		RETURN public.refresh_campaign_shop_items_before_unidentified_item_rulebooks(
			p_campaign_id,
			p_shop_id,
			p_expected_shop_updated_at,
			p_expected_items,
			p_keep_items,
			p_changes
		);
	END IF;

	IF p_expected_shop_updated_at IS NULL
		OR v_shop.updated_at IS DISTINCT FROM p_expected_shop_updated_at THEN
		RAISE EXCEPTION '商店資料已更新，請重新載入並產生刷新預覽。'
			USING ERRCODE = '40001';
	END IF;

	SELECT campaign.official_catalog_ids
	INTO v_catalog_ids
	FROM public.campaigns AS campaign
	WHERE campaign.id = p_campaign_id;
	IF NOT FOUND OR v_catalog_ids IS NULL THEN
		RAISE EXCEPTION '找不到戰役目前的官方規則書設定。'
			USING ERRCODE = '22023';
	END IF;

	v_expanded_policy := public.campaign_shop_expand_rulebook_policy(
		v_shop.refresh_policy,
		v_catalog_ids
	);

	UPDATE public.campaign_shops
	SET refresh_policy = v_expanded_policy
	WHERE id = p_shop_id
		AND campaign_id = p_campaign_id
	RETURNING updated_at INTO v_effective_updated_at;

	v_result := public.refresh_campaign_shop_items_before_unidentified_item_rulebooks(
		p_campaign_id,
		p_shop_id,
		v_effective_updated_at,
		p_expected_items,
		p_keep_items,
		p_changes
	);

	UPDATE public.campaign_shops
	SET refresh_policy = v_shop.refresh_policy
	WHERE id = p_shop_id
		AND campaign_id = p_campaign_id;

	RETURN v_result;
END
$refresh_campaign_shop_items$;

REVOKE ALL ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_shop_items(
	text, text, timestamptz, jsonb, boolean, jsonb
) TO authenticated;
