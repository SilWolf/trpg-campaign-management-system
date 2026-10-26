REVOKE DELETE ON TABLE public.campaign_shop_items FROM PUBLIC, anon, authenticated;
GRANT DELETE ON TABLE public.campaign_shop_items TO authenticated;

CREATE POLICY campaign_shop_items_dm_delete
	ON public.campaign_shop_items
	FOR DELETE TO authenticated
	USING (public.is_campaign_dm(campaign_id));

CREATE POLICY campaign_shop_items_dm_delete_boundary
	ON public.campaign_shop_items
	AS RESTRICTIVE FOR DELETE TO authenticated
	USING (public.is_campaign_dm(campaign_id));
