ALTER TABLE public.campaign_shops
	ADD COLUMN flavor text NOT NULL DEFAULT ''
		CHECK (length(flavor) <= 1000);
