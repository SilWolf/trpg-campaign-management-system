CREATE OR REPLACE FUNCTION public.is_valid_blacksmith_affixes(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $is_valid_blacksmith_affixes$
DECLARE
	affix jsonb;
BEGIN
	IF jsonb_typeof(value) <> 'array' THEN
		RETURN false;
	END IF;

	FOR affix IN SELECT jsonb_array_elements(value)
	LOOP
		IF jsonb_typeof(affix) <> 'object'
			OR NOT (affix ?& ARRAY['id', 'name', 'desc'])
			OR jsonb_typeof(affix -> 'id') <> 'string'
			OR jsonb_typeof(affix -> 'name') <> 'string'
			OR jsonb_typeof(affix -> 'desc') <> 'string'
			OR length(btrim(affix ->> 'id')) = 0
			OR length(btrim(affix ->> 'name')) = 0
			OR (
				affix ? 'isHidden'
				AND jsonb_typeof(affix -> 'isHidden') <> 'boolean'
			) THEN
			RETURN false;
		END IF;
	END LOOP;

	RETURN true;
END
$is_valid_blacksmith_affixes$;

REVOKE ALL ON FUNCTION public.is_valid_blacksmith_affixes(jsonb)
	FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_blacksmith_affixes(jsonb)
	TO authenticated;

CREATE TABLE public.blacksmith_items (
	id text PRIMARY KEY,
	owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
	category text NOT NULL CHECK (category IN ('Weapon', 'Armor', 'Consumable', 'Misc')),
	sub_type text NOT NULL DEFAULT '' CHECK (length(sub_type) <= 120),
	rarity text NOT NULL DEFAULT 'Common'
		CHECK (rarity IN ('Common', 'Uncommon', 'Rare', 'VeryRare', 'Legendary', 'Artifact')),
	icon text NOT NULL DEFAULT 'Package' CHECK (length(btrim(icon)) BETWEEN 1 AND 500),
	damage text CHECK (length(damage) <= 100),
	mastery text NOT NULL DEFAULT 'None'
		CHECK (mastery IN ('None', 'Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex')),
	ac text CHECK (length(ac) <= 100),
	weight numeric NOT NULL DEFAULT 0
		CHECK (weight >= 0 AND weight::text NOT IN ('NaN', 'Infinity', '-Infinity')),
	value_gp numeric NOT NULL DEFAULT 0
		CHECK (value_gp >= 0 AND value_gp::text NOT IN ('NaN', 'Infinity', '-Infinity')),
	requires_attunement boolean NOT NULL DEFAULT false,
	is_homebrew boolean NOT NULL DEFAULT true,
	max_charges integer NOT NULL DEFAULT 0 CHECK (max_charges >= 0),
	effects text NOT NULL DEFAULT '' CHECK (length(effects) <= 20000),
	flavor text NOT NULL DEFAULT '' CHECK (length(flavor) <= 20000),
	dm_notes text NOT NULL DEFAULT '' CHECK (length(dm_notes) <= 20000),
	is_equippable boolean NOT NULL DEFAULT false,
	is_consumable boolean NOT NULL DEFAULT false,
	is_important boolean NOT NULL DEFAULT false,
	affixes jsonb NOT NULL DEFAULT '[]'::jsonb
		CHECK (public.is_valid_blacksmith_affixes(affixes)),
	is_shared boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX blacksmith_items_owner_updated_idx
	ON public.blacksmith_items (owner_id, updated_at DESC);
CREATE INDEX blacksmith_items_shared_updated_idx
	ON public.blacksmith_items (updated_at DESC)
	WHERE is_shared = true;

CREATE OR REPLACE FUNCTION public.update_blacksmith_item_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $update_blacksmith_item_updated_at$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END
$update_blacksmith_item_updated_at$;

REVOKE ALL ON FUNCTION public.update_blacksmith_item_updated_at()
	FROM PUBLIC, anon, authenticated;

CREATE TRIGGER blacksmith_items_updated_at
	BEFORE UPDATE ON public.blacksmith_items
	FOR EACH ROW
	EXECUTE FUNCTION public.update_blacksmith_item_updated_at();

ALTER TABLE public.blacksmith_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.blacksmith_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.blacksmith_items TO authenticated;

CREATE POLICY "Authors and readers can select blacksmith items"
	ON public.blacksmith_items
	FOR SELECT
	TO authenticated
	USING (owner_id = auth.uid() OR is_shared = true);

CREATE POLICY "Authors can insert blacksmith items"
	ON public.blacksmith_items
	FOR INSERT
	TO authenticated
	WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Authors can update blacksmith items"
	ON public.blacksmith_items
	FOR UPDATE
	TO authenticated
	USING (owner_id = auth.uid())
	WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Authors can delete blacksmith items"
	ON public.blacksmith_items
	FOR DELETE
	TO authenticated
	USING (owner_id = auth.uid());
