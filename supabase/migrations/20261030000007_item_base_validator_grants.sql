REVOKE ALL ON FUNCTION public.is_valid_item_base(jsonb),
	public.is_valid_blacksmith_affixes(jsonb)
	FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_valid_item_base(jsonb),
	public.is_valid_blacksmith_affixes(jsonb)
	TO authenticated, service_role;
