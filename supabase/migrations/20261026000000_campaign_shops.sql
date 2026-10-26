DO $campaign_shop_preflight$
DECLARE
	required_columns text[][] := ARRAY[
		ARRAY['campaigns', 'id', 'text'],
		ARRAY['characters', 'id', 'text'],
		ARRAY['characters', 'campaign_id', 'text'],
		ARRAY['characters', 'user_id', 'text'],
		ARRAY['characters', 'currencies', 'jsonb'],
		ARRAY['characters', 'private_currencies', 'jsonb'],
		ARRAY['campaign_members', 'campaign_id', 'text'],
		ARRAY['campaign_members', 'user_id', 'uuid'],
		ARRAY['character_permissions', 'campaign_id', 'text'],
		ARRAY['character_permissions', 'character_id', 'text'],
		ARRAY['character_permissions', 'user_id', 'uuid'],
		ARRAY['character_permissions', 'public_wallet_access', 'smallint'],
		ARRAY['character_permissions', 'private_wallet_access', 'smallint'],
		ARRAY['inventory_items', 'id', 'text'],
		ARRAY['inventory_items', 'campaign_id', 'text'],
		ARRAY['inventory_items', 'owner_id', 'text'],
		ARRAY['inventory_items', 'slot', 'integer'],
		ARRAY['inventory_items', 'name', 'text'],
		ARRAY['inventory_items', 'category', 'text'],
		ARRAY['inventory_items', 'sub_type', 'text'],
		ARRAY['inventory_items', 'rarity', 'text'],
		ARRAY['inventory_items', 'icon', 'text'],
		ARRAY['inventory_items', 'damage', 'text'],
		ARRAY['inventory_items', 'mastery', 'text'],
		ARRAY['inventory_items', 'ac', 'text'],
		ARRAY['inventory_items', 'weight', 'numeric'],
		ARRAY['inventory_items', 'value_gp', 'numeric'],
		ARRAY['inventory_items', 'quantity', 'integer'],
		ARRAY['inventory_items', 'equipped', 'boolean'],
		ARRAY['inventory_items', 'requires_attunement', 'boolean'],
		ARRAY['inventory_items', 'attuned', 'boolean'],
		ARRAY['inventory_items', 'is_homebrew', 'boolean'],
		ARRAY['inventory_items', 'is_identified', 'boolean'],
		ARRAY['inventory_items', 'charges', 'integer'],
		ARRAY['inventory_items', 'max_charges', 'integer'],
		ARRAY['inventory_items', 'effects', 'text'],
		ARRAY['inventory_items', 'flavor', 'text'],
		ARRAY['inventory_items', 'dm_notes', 'text'],
		ARRAY['inventory_items', 'player_notes', 'text'],
		ARRAY['inventory_items', 'is_private', 'boolean'],
		ARRAY['inventory_items', 'is_equippable', 'boolean'],
		ARRAY['inventory_items', 'is_consumable', 'boolean'],
		ARRAY['inventory_items', 'is_important', 'boolean'],
		ARRAY['inventory_items', 'affixes', 'jsonb']
	];
	expected text[];
	actual_type text;
BEGIN
	FOREACH expected SLICE 1 IN ARRAY required_columns LOOP
		IF to_regclass(format('public.%I', expected[1])) IS NULL THEN
			RAISE EXCEPTION '商店 migration 前置檢查失敗：public.% 不存在。', expected[1];
		END IF;

		SELECT format_type(attribute.atttypid, attribute.atttypmod)
		INTO actual_type
		FROM pg_attribute AS attribute
		WHERE attribute.attrelid = to_regclass(format('public.%I', expected[1]))
			AND attribute.attname = expected[2]
			AND attribute.attnum > 0
			AND NOT attribute.attisdropped;

		IF actual_type IS NULL OR actual_type <> expected[3] THEN
			RAISE EXCEPTION
				'商店 migration 前置檢查失敗：public.%.% 預期型別為 %，實際為 %。',
				expected[1], expected[2], expected[3], COALESCE(actual_type, '缺少欄位');
		END IF;
	END LOOP;

	IF to_regprocedure('public.is_campaign_member_or_dm(text)') IS NULL
		OR to_regprocedure('public.is_campaign_dm(text)') IS NULL THEN
		RAISE EXCEPTION '商店 migration 需要既有戰役成員與 DM 授權函式。';
	END IF;
END
$campaign_shop_preflight$;

CREATE TABLE public.campaign_shops (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	campaign_id text NOT NULL
		REFERENCES public.campaigns(id) ON DELETE CASCADE,
	name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
	background_image_url text
		CHECK (background_image_url IS NULL OR length(background_image_url) <= 2048),
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (campaign_id, id)
);

CREATE TABLE public.campaign_shop_items (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	campaign_id text NOT NULL,
	shop_id text NOT NULL,
	item_snapshot jsonb NOT NULL CHECK (
		item_snapshot ?& ARRAY['name', 'category', 'rarity', 'icon']
		AND jsonb_typeof(item_snapshot) = 'object'
		AND jsonb_typeof(item_snapshot -> 'name') = 'string'
		AND length(btrim(item_snapshot ->> 'name')) BETWEEN 1 AND 120
		AND jsonb_typeof(item_snapshot -> 'category') = 'string'
		AND item_snapshot ->> 'category' IN ('Weapon', 'Armor', 'Consumable', 'Misc')
		AND jsonb_typeof(item_snapshot -> 'rarity') = 'string'
		AND item_snapshot ->> 'rarity' IN ('Common', 'Uncommon', 'Rare', 'VeryRare', 'Legendary', 'Artifact')
		AND jsonb_typeof(item_snapshot -> 'icon') = 'string'
		AND length(btrim(item_snapshot ->> 'icon')) BETWEEN 1 AND 500
	),
	source_type text NOT NULL CHECK (
		source_type IN ('catalog', 'blacksmith', 'manual')
	),
	source_id text,
	unit_price_gp numeric NOT NULL CHECK (
		unit_price_gp > 0
		AND unit_price_gp < 10000000000
		AND unit_price_gp = trunc(unit_price_gp, 2)
		AND unit_price_gp::text NOT IN ('NaN', 'Infinity', '-Infinity')
	),
	stock_available integer NOT NULL DEFAULT 0 CHECK (stock_available >= 0),
	stock_reserved integer NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
	requires_approval boolean NOT NULL DEFAULT false,
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (campaign_id, id),
	FOREIGN KEY (campaign_id, shop_id)
		REFERENCES public.campaign_shops(campaign_id, id) ON DELETE CASCADE
);

CREATE INDEX campaign_shops_campaign_active_idx
	ON public.campaign_shops (campaign_id, is_active);
CREATE INDEX campaign_shop_items_shop_active_idx
	ON public.campaign_shop_items (campaign_id, shop_id, is_active);

CREATE TABLE public.campaign_shop_orders (
	id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
	campaign_id text NOT NULL
		REFERENCES public.campaigns(id) ON DELETE CASCADE,
	shop_id text NOT NULL,
	shop_item_id text NOT NULL,
	buyer_user_id uuid NOT NULL,
	character_id text NOT NULL,
	item_snapshot jsonb NOT NULL,
	shop_name_snapshot text NOT NULL,
	unit_price_gp numeric NOT NULL CHECK (
		unit_price_gp > 0
		AND unit_price_gp < 10000000000
		AND unit_price_gp = trunc(unit_price_gp, 2)
	),
	quantity integer NOT NULL CHECK (quantity > 0),
	total_price_gp numeric NOT NULL CHECK (
		total_price_gp > 0
		AND total_price_gp < 1000000000000000000
		AND total_price_gp = trunc(total_price_gp, 2)
	),
	status text NOT NULL CHECK (
		status IN ('completed', 'pending', 'rejected', 'cancelled')
	),
	requires_approval boolean NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	reviewed_by uuid,
	reviewed_at timestamptz,
	UNIQUE (campaign_id, id),
	FOREIGN KEY (campaign_id, shop_id)
		REFERENCES public.campaign_shops(campaign_id, id) ON DELETE CASCADE,
	FOREIGN KEY (campaign_id, shop_item_id)
		REFERENCES public.campaign_shop_items(campaign_id, id) ON DELETE CASCADE,
	FOREIGN KEY (character_id)
		REFERENCES public.characters(id) ON DELETE CASCADE
);

CREATE INDEX campaign_shop_orders_campaign_created_idx
	ON public.campaign_shop_orders (campaign_id, created_at DESC);
CREATE INDEX campaign_shop_orders_pending_idx
	ON public.campaign_shop_orders (campaign_id, created_at)
	WHERE status = 'pending';

CREATE TABLE public.campaign_shop_order_payments (
	order_id text PRIMARY KEY
		REFERENCES public.campaign_shop_orders(id) ON DELETE CASCADE,
	wallet_type text NOT NULL CHECK (wallet_type IN ('public', 'private'))
);

CREATE OR REPLACE FUNCTION public.campaign_shop_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $campaign_shop_touch_updated_at$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END
$campaign_shop_touch_updated_at$;

REVOKE ALL ON FUNCTION public.campaign_shop_touch_updated_at()
	FROM PUBLIC, anon, authenticated;

CREATE TRIGGER campaign_shops_touch_updated_at
	BEFORE UPDATE ON public.campaign_shops
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_touch_updated_at();
CREATE TRIGGER campaign_shop_items_touch_updated_at
	BEFORE UPDATE ON public.campaign_shop_items
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_touch_updated_at();
CREATE TRIGGER campaign_shop_orders_touch_updated_at
	BEFORE UPDATE ON public.campaign_shop_orders
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_touch_updated_at();

ALTER TABLE public.campaign_shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_shop_order_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.campaign_shops,
	public.campaign_shop_items,
	public.campaign_shop_orders,
	public.campaign_shop_order_payments
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.campaign_shops TO authenticated;
GRANT INSERT (campaign_id, name, background_image_url, is_active)
	ON public.campaign_shops TO authenticated;
GRANT UPDATE (name, background_image_url, is_active)
	ON public.campaign_shops TO authenticated;
GRANT SELECT ON TABLE public.campaign_shop_items TO authenticated;
GRANT INSERT (
	campaign_id, shop_id, item_snapshot, source_type, source_id,
	unit_price_gp, stock_available, requires_approval, is_active
) ON public.campaign_shop_items TO authenticated;
GRANT UPDATE (
	item_snapshot, source_type, source_id, unit_price_gp,
	stock_available, requires_approval, is_active
) ON public.campaign_shop_items TO authenticated;
GRANT SELECT (
	id, campaign_id, shop_id, shop_item_id, character_id, item_snapshot,
	shop_name_snapshot, unit_price_gp, quantity, total_price_gp, status,
	requires_approval, created_at, updated_at, reviewed_at
) ON public.campaign_shop_orders TO authenticated;

CREATE POLICY campaign_shops_member_read
	ON public.campaign_shops
	FOR SELECT TO authenticated
	USING (is_active OR public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shops_member_boundary
	ON public.campaign_shops
	AS RESTRICTIVE FOR SELECT TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id));
CREATE POLICY campaign_shops_dm_insert
	ON public.campaign_shops
	FOR INSERT TO authenticated
	WITH CHECK (public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shops_dm_update
	ON public.campaign_shops
	FOR UPDATE TO authenticated
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shops_dm_update_boundary
	ON public.campaign_shops
	AS RESTRICTIVE FOR UPDATE TO authenticated
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shops_dm_insert_boundary
	ON public.campaign_shops
	AS RESTRICTIVE FOR INSERT TO authenticated
	WITH CHECK (public.is_campaign_dm(campaign_id));

CREATE POLICY campaign_shop_items_member_read
	ON public.campaign_shop_items
	FOR SELECT TO authenticated
	USING (
		(
			is_active AND EXISTS (
				SELECT 1
				FROM public.campaign_shops AS shop
				WHERE shop.id = campaign_shop_items.shop_id
					AND shop.campaign_id = campaign_shop_items.campaign_id
					AND shop.is_active
			)
		)
		OR public.is_campaign_dm(campaign_id)
	);
CREATE POLICY campaign_shop_items_member_boundary
	ON public.campaign_shop_items
	AS RESTRICTIVE FOR SELECT TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id));
CREATE POLICY campaign_shop_items_dm_insert
	ON public.campaign_shop_items
	FOR INSERT TO authenticated
	WITH CHECK (
		public.is_campaign_dm(campaign_id)
		AND EXISTS (
			SELECT 1 FROM public.campaign_shops AS shop
			WHERE shop.id = campaign_shop_items.shop_id
				AND shop.campaign_id = campaign_shop_items.campaign_id
		)
		AND stock_reserved = 0
	);
CREATE POLICY campaign_shop_items_dm_update
	ON public.campaign_shop_items
	FOR UPDATE TO authenticated
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shop_items_dm_write_boundary
	ON public.campaign_shop_items
	AS RESTRICTIVE FOR INSERT TO authenticated
	WITH CHECK (public.is_campaign_dm(campaign_id));
CREATE POLICY campaign_shop_items_dm_update_boundary
	ON public.campaign_shop_items
	AS RESTRICTIVE FOR UPDATE TO authenticated
	USING (public.is_campaign_dm(campaign_id))
	WITH CHECK (public.is_campaign_dm(campaign_id));

CREATE POLICY campaign_shop_orders_member_read
	ON public.campaign_shop_orders
	FOR SELECT TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id));
CREATE POLICY campaign_shop_orders_member_boundary
	ON public.campaign_shop_orders
	AS RESTRICTIVE FOR SELECT TO authenticated
	USING (public.is_campaign_member_or_dm(campaign_id));

CREATE OR REPLACE FUNCTION public.shop_wallet_total_cp(p_wallet jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $shop_wallet_total_cp$
DECLARE
	v_coin text;
	v_amount numeric;
	v_total numeric := 0;
	v_values integer[] := ARRAY[1000, 100, 50, 10, 1];
	v_coins text[] := ARRAY['pp', 'gp', 'ep', 'sp', 'cp'];
	v_index integer;
BEGIN
	IF jsonb_typeof(p_wallet) <> 'object' THEN
		RAISE EXCEPTION '錢包資料格式無效。' USING ERRCODE = '22023';
	END IF;

	FOREACH v_coin IN ARRAY v_coins LOOP
		v_index := array_position(v_coins, v_coin);
		IF COALESCE(jsonb_typeof(p_wallet -> v_coin), '') <> 'number'
			OR (p_wallet ->> v_coin) !~ '^[0-9]{1,12}$' THEN
			RAISE EXCEPTION '錢包中的 % 數量無效。', v_coin USING ERRCODE = '22023';
		END IF;
		v_amount := (p_wallet ->> v_coin)::numeric;
		v_total := v_total + v_amount * v_values[v_index];
	END LOOP;

	RETURN v_total;
END
$shop_wallet_total_cp$;

CREATE OR REPLACE FUNCTION public.shop_wallet_from_cp(p_total_cp numeric)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $shop_wallet_from_cp$
	SELECT jsonb_build_object(
		'pp', floor(p_total_cp / 1000)::bigint,
		'gp', floor(mod(p_total_cp, 1000) / 100)::bigint,
		'ep', floor(mod(p_total_cp, 100) / 50)::bigint,
		'sp', floor(mod(p_total_cp, 50) / 10)::bigint,
		'cp', mod(p_total_cp, 10)::bigint
	);
$shop_wallet_from_cp$;

CREATE OR REPLACE FUNCTION public.campaign_shop_assert_buyer_access(
	p_campaign_id text,
	p_character_id text,
	p_wallet_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_shop_assert_buyer_access$
DECLARE
	v_character_owner text;
	v_wallet_access smallint;
BEGIN
	IF auth.uid() IS NULL
		OR p_wallet_type IS NULL
		OR p_wallet_type NOT IN ('public', 'private')
		OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役購買商品。' USING ERRCODE = '42501';
	END IF;

	SELECT character.user_id
	INTO v_character_owner
	FROM public.characters AS character
	WHERE character.id = p_character_id
		AND character.campaign_id = p_campaign_id;

	IF v_character_owner IS NULL THEN
		RAISE EXCEPTION '購物角色不存在或不屬於此戰役。' USING ERRCODE = '22023';
	END IF;

	IF NOT public.is_campaign_dm(p_campaign_id) THEN
		IF v_character_owner <> auth.uid()::text THEN
			RAISE EXCEPTION '只能使用自己擁有的角色購物。' USING ERRCODE = '42501';
		END IF;

		SELECT CASE
			WHEN p_wallet_type = 'public' THEN max(permission.public_wallet_access)
			ELSE max(permission.private_wallet_access)
		END
		INTO v_wallet_access
		FROM public.character_permissions AS permission
		WHERE permission.campaign_id = p_campaign_id
			AND permission.character_id = p_character_id
			AND permission.user_id = auth.uid();

		IF COALESCE(v_wallet_access, 0) <> 2 THEN
			RAISE EXCEPTION '所選錢包需要修改權限才能購物。' USING ERRCODE = '42501';
		END IF;
	END IF;
END
$campaign_shop_assert_buyer_access$;

REVOKE ALL ON FUNCTION public.shop_wallet_total_cp(jsonb),
	public.shop_wallet_from_cp(numeric),
	public.campaign_shop_assert_buyer_access(text, text, text)
	FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campaign_shop_settle_order(
	p_order_id text,
	p_reserved boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_shop_settle_order$
DECLARE
	v_order public.campaign_shop_orders%ROWTYPE;
	v_item public.campaign_shop_items%ROWTYPE;
	v_payment public.campaign_shop_order_payments%ROWTYPE;
	v_character public.characters%ROWTYPE;
	v_wallet jsonb;
	v_wallet_total_cp numeric;
	v_price_cp numeric;
	v_is_dm boolean;
	v_inventory_id text := gen_random_uuid()::text;
BEGIN
	SELECT * INTO v_order
	FROM public.campaign_shop_orders AS order_row
	WHERE order_row.id = p_order_id
	FOR UPDATE;

	IF NOT FOUND OR v_order.status <> 'pending' THEN
		RAISE EXCEPTION '訂單不存在或已處理。' USING ERRCODE = '22023';
	END IF;

	v_is_dm := public.is_campaign_dm(v_order.campaign_id);
	IF p_reserved THEN
		IF NOT v_is_dm OR v_order.requires_approval IS NOT TRUE THEN
			RAISE EXCEPTION '只有該戰役 DM 可以核准此訂單。' USING ERRCODE = '42501';
		END IF;
	ELSIF auth.uid() IS NULL OR v_order.buyer_user_id <> auth.uid()
		OR v_order.requires_approval IS TRUE THEN
		RAISE EXCEPTION '無權完成此購買。' USING ERRCODE = '42501';
	END IF;

	SELECT * INTO v_payment
	FROM public.campaign_shop_order_payments AS payment
	WHERE payment.order_id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到訂單付款設定。' USING ERRCODE = '23503';
	END IF;

	PERFORM public.campaign_shop_assert_buyer_access(
		v_order.campaign_id, v_order.character_id, v_payment.wallet_type
	);

	SELECT * INTO v_item
	FROM public.campaign_shop_items AS shop_item
	WHERE shop_item.id = v_order.shop_item_id
		AND shop_item.campaign_id = v_order.campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店商品已不存在。' USING ERRCODE = '23503';
	END IF;

	IF p_reserved THEN
		IF v_item.stock_reserved < v_order.quantity THEN
			RAISE EXCEPTION '保留庫存資料不一致。' USING ERRCODE = '23514';
		END IF;
		UPDATE public.campaign_shop_items
		SET stock_reserved = stock_reserved - v_order.quantity
		WHERE id = v_item.id AND campaign_id = v_order.campaign_id;
	ELSE
		IF v_item.stock_available < v_order.quantity THEN
			RAISE EXCEPTION '商品庫存不足。' USING ERRCODE = '23514';
		END IF;
		UPDATE public.campaign_shop_items
		SET stock_available = stock_available - v_order.quantity
		WHERE id = v_item.id AND campaign_id = v_order.campaign_id;
	END IF;

	SELECT * INTO v_character
	FROM public.characters AS character
	WHERE character.id = v_order.character_id
		AND character.campaign_id = v_order.campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '購物角色已不存在。' USING ERRCODE = '23503';
	END IF;

	v_wallet := CASE v_payment.wallet_type
		WHEN 'public' THEN v_character.currencies
		ELSE v_character.private_currencies
	END;
	v_wallet_total_cp := public.shop_wallet_total_cp(v_wallet);
	v_price_cp := v_order.total_price_gp * 100;
	IF v_price_cp <> trunc(v_price_cp) OR v_wallet_total_cp < v_price_cp THEN
		RAISE EXCEPTION '所選錢包餘額不足或商品價格精度無效。'
			USING ERRCODE = '23514';
	END IF;

	IF v_payment.wallet_type = 'public' THEN
		UPDATE public.characters
		SET currencies = public.shop_wallet_from_cp(v_wallet_total_cp - v_price_cp)
		WHERE id = v_character.id AND campaign_id = v_order.campaign_id;
	ELSE
		UPDATE public.characters
		SET private_currencies = public.shop_wallet_from_cp(v_wallet_total_cp - v_price_cp)
		WHERE id = v_character.id AND campaign_id = v_order.campaign_id;
	END IF;

	INSERT INTO public.inventory_items (
		id, campaign_id, owner_id, slot, name, category, sub_type, rarity, icon,
		damage, mastery, ac, weight, value_gp, quantity, equipped,
		requires_attunement, attuned, is_homebrew, is_identified, charges,
		max_charges, effects, flavor, dm_notes, player_notes, is_private,
		is_equippable, is_consumable, is_important, affixes
	)
	VALUES (
		v_inventory_id, v_order.campaign_id, v_order.character_id, 0,
		v_order.item_snapshot ->> 'name',
		v_order.item_snapshot ->> 'category',
		COALESCE(v_order.item_snapshot ->> 'sub_type', ''),
		v_order.item_snapshot ->> 'rarity',
		v_order.item_snapshot ->> 'icon',
		v_order.item_snapshot ->> 'damage',
		COALESCE(v_order.item_snapshot ->> 'mastery', 'None'),
		v_order.item_snapshot ->> 'ac',
		COALESCE((v_order.item_snapshot ->> 'weight')::numeric, 0),
		COALESCE((v_order.item_snapshot ->> 'value_gp')::numeric, 0),
		v_order.quantity,
		false,
		COALESCE((v_order.item_snapshot ->> 'requires_attunement')::boolean, false),
		false,
		COALESCE((v_order.item_snapshot ->> 'is_homebrew')::boolean, false),
		false,
		0,
		COALESCE((v_order.item_snapshot ->> 'max_charges')::integer, 0),
		COALESCE(v_order.item_snapshot ->> 'effects', ''),
		COALESCE(v_order.item_snapshot ->> 'flavor', ''),
		COALESCE(v_order.item_snapshot ->> 'dm_notes', ''),
		'',
		false,
		COALESCE((v_order.item_snapshot ->> 'is_equippable')::boolean, false),
		COALESCE((v_order.item_snapshot ->> 'is_consumable')::boolean, false),
		COALESCE((v_order.item_snapshot ->> 'is_important')::boolean, false),
		COALESCE(v_order.item_snapshot -> 'affixes', '[]'::jsonb)
	);

	UPDATE public.campaign_shop_orders
	SET status = 'completed',
		reviewed_by = CASE WHEN p_reserved THEN auth.uid() ELSE NULL END,
		reviewed_at = CASE WHEN p_reserved THEN now() ELSE NULL END,
		updated_at = now()
	WHERE id = p_order_id;

	RETURN p_order_id;
END
$campaign_shop_settle_order$;

CREATE OR REPLACE FUNCTION public.purchase_campaign_shop_item(
	p_campaign_id text,
	p_shop_item_id text,
	p_character_id text,
	p_wallet_type text,
	p_quantity integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $purchase_campaign_shop_item$
DECLARE
	v_item public.campaign_shop_items%ROWTYPE;
	v_shop_name text;
	v_order_id text := gen_random_uuid()::text;
	v_total numeric;
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役購買商品。' USING ERRCODE = '42501';
	END IF;
	IF p_quantity IS NULL OR p_quantity < 1
		OR p_wallet_type NOT IN ('public', 'private') THEN
		RAISE EXCEPTION '購買數量或付款錢包無效。' USING ERRCODE = '22023';
	END IF;

	PERFORM public.campaign_shop_assert_buyer_access(
		p_campaign_id, p_character_id, p_wallet_type
	);

	SELECT shop_item.*
	INTO v_item
	FROM public.campaign_shop_items AS shop_item
	JOIN public.campaign_shops AS shop
		ON shop.id = shop_item.shop_id AND shop.campaign_id = shop_item.campaign_id
	WHERE shop_item.id = p_shop_item_id
		AND shop_item.campaign_id = p_campaign_id
		AND shop_item.is_active
		AND shop.is_active
	FOR UPDATE OF shop_item, shop;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店或商品不存在或已停用。' USING ERRCODE = '22023';
	END IF;
	SELECT shop.name
	INTO v_shop_name
	FROM public.campaign_shops AS shop
	WHERE shop.id = v_item.shop_id
		AND shop.campaign_id = p_campaign_id;
	IF v_item.requires_approval THEN
		RAISE EXCEPTION '此商品需要審查，請建立待審請求。' USING ERRCODE = '22023';
	END IF;
	IF v_item.stock_available < p_quantity THEN
		RAISE EXCEPTION '商品庫存不足。' USING ERRCODE = '23514';
	END IF;

	v_total := v_item.unit_price_gp * p_quantity;
	INSERT INTO public.campaign_shop_orders (
		id, campaign_id, shop_id, shop_item_id, buyer_user_id, character_id,
		item_snapshot, shop_name_snapshot, unit_price_gp, quantity,
		total_price_gp, status, requires_approval
	)
	VALUES (
		v_order_id, p_campaign_id, v_item.shop_id, v_item.id, auth.uid(),
		p_character_id, v_item.item_snapshot, v_shop_name, v_item.unit_price_gp,
		p_quantity, v_total, 'pending', false
	);
	INSERT INTO public.campaign_shop_order_payments (order_id, wallet_type)
	VALUES (v_order_id, p_wallet_type);

	RETURN public.campaign_shop_settle_order(v_order_id, false);
END
$purchase_campaign_shop_item$;

CREATE OR REPLACE FUNCTION public.request_campaign_shop_item(
	p_campaign_id text,
	p_shop_item_id text,
	p_character_id text,
	p_wallet_type text,
	p_quantity integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $request_campaign_shop_item$
DECLARE
	v_item public.campaign_shop_items%ROWTYPE;
	v_shop_name text;
	v_order_id text := gen_random_uuid()::text;
	v_total numeric;
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役建立購買請求。' USING ERRCODE = '42501';
	END IF;
	IF p_quantity IS NULL OR p_quantity < 1
		OR p_wallet_type NOT IN ('public', 'private') THEN
		RAISE EXCEPTION '購買數量或付款錢包無效。' USING ERRCODE = '22023';
	END IF;

	PERFORM public.campaign_shop_assert_buyer_access(
		p_campaign_id, p_character_id, p_wallet_type
	);

	SELECT shop_item.*
	INTO v_item
	FROM public.campaign_shop_items AS shop_item
	JOIN public.campaign_shops AS shop
		ON shop.id = shop_item.shop_id AND shop.campaign_id = shop_item.campaign_id
	WHERE shop_item.id = p_shop_item_id
		AND shop_item.campaign_id = p_campaign_id
		AND shop_item.is_active
		AND shop.is_active
	FOR UPDATE OF shop_item, shop;
	IF NOT FOUND THEN
		RAISE EXCEPTION '商店或商品不存在或已停用。' USING ERRCODE = '22023';
	END IF;
	SELECT shop.name
	INTO v_shop_name
	FROM public.campaign_shops AS shop
	WHERE shop.id = v_item.shop_id
		AND shop.campaign_id = p_campaign_id;
	IF NOT v_item.requires_approval THEN
		RAISE EXCEPTION '此商品不需要審查，請直接購買。' USING ERRCODE = '22023';
	END IF;
	IF v_item.stock_available < p_quantity THEN
		RAISE EXCEPTION '商品庫存不足。' USING ERRCODE = '23514';
	END IF;

	v_total := v_item.unit_price_gp * p_quantity;
	UPDATE public.campaign_shop_items
	SET stock_available = stock_available - p_quantity,
		stock_reserved = stock_reserved + p_quantity
	WHERE id = v_item.id AND campaign_id = p_campaign_id;

	INSERT INTO public.campaign_shop_orders (
		id, campaign_id, shop_id, shop_item_id, buyer_user_id, character_id,
		item_snapshot, shop_name_snapshot, unit_price_gp, quantity,
		total_price_gp, status, requires_approval
	)
	VALUES (
		v_order_id, p_campaign_id, v_item.shop_id, v_item.id, auth.uid(),
		p_character_id, v_item.item_snapshot, v_shop_name, v_item.unit_price_gp,
		p_quantity, v_total, 'pending', true
	);
	INSERT INTO public.campaign_shop_order_payments (order_id, wallet_type)
	VALUES (v_order_id, p_wallet_type);

	RETURN v_order_id;
END
$request_campaign_shop_item$;

CREATE OR REPLACE FUNCTION public.approve_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $approve_campaign_shop_order$
DECLARE
	v_campaign_id text;
BEGIN
	IF auth.uid() IS NULL THEN
		RAISE EXCEPTION '需要登入才能審查購買請求。' USING ERRCODE = '42501';
	END IF;
	SELECT campaign_id INTO v_campaign_id
	FROM public.campaign_shop_orders
	WHERE id = p_order_id;
	IF NOT FOUND OR NOT public.is_campaign_dm(v_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以核准此請求。' USING ERRCODE = '42501';
	END IF;

	RETURN public.campaign_shop_settle_order(p_order_id, true);
END
$approve_campaign_shop_order$;

CREATE OR REPLACE FUNCTION public.reject_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $reject_campaign_shop_order$
DECLARE
	v_order public.campaign_shop_orders%ROWTYPE;
	v_item public.campaign_shop_items%ROWTYPE;
BEGIN
	IF auth.uid() IS NULL THEN
		RAISE EXCEPTION '需要登入才能審查購買請求。' USING ERRCODE = '42501';
	END IF;
	SELECT * INTO v_order
	FROM public.campaign_shop_orders
	WHERE id = p_order_id
	FOR UPDATE;
	IF NOT FOUND OR NOT public.is_campaign_dm(v_order.campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以拒絕此請求。' USING ERRCODE = '42501';
	END IF;
	IF v_order.status <> 'pending' OR NOT v_order.requires_approval THEN
		RAISE EXCEPTION '訂單不存在或已處理。' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_item
	FROM public.campaign_shop_items
	WHERE id = v_order.shop_item_id AND campaign_id = v_order.campaign_id
	FOR UPDATE;
	IF NOT FOUND OR v_item.stock_reserved < v_order.quantity THEN
		RAISE EXCEPTION '保留庫存資料不一致。' USING ERRCODE = '23514';
	END IF;
	UPDATE public.campaign_shop_items
	SET stock_reserved = stock_reserved - v_order.quantity,
		stock_available = stock_available + v_order.quantity
	WHERE id = v_item.id AND campaign_id = v_order.campaign_id;
	UPDATE public.campaign_shop_orders
	SET status = 'rejected', reviewed_by = auth.uid(),
		reviewed_at = now(), updated_at = now()
	WHERE id = p_order_id;
	RETURN p_order_id;
END
$reject_campaign_shop_order$;

CREATE OR REPLACE FUNCTION public.cancel_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $cancel_campaign_shop_order$
DECLARE
	v_order public.campaign_shop_orders%ROWTYPE;
	v_item public.campaign_shop_items%ROWTYPE;
BEGIN
	IF auth.uid() IS NULL THEN
		RAISE EXCEPTION '需要登入才能取消購買請求。' USING ERRCODE = '42501';
	END IF;
	SELECT * INTO v_order
	FROM public.campaign_shop_orders
	WHERE id = p_order_id
	FOR UPDATE;
	IF NOT FOUND OR v_order.buyer_user_id <> auth.uid()
		OR NOT public.is_campaign_member_or_dm(v_order.campaign_id) THEN
		RAISE EXCEPTION '無權取消此購買請求。' USING ERRCODE = '42501';
	END IF;
	IF v_order.status <> 'pending' OR NOT v_order.requires_approval THEN
		RAISE EXCEPTION '只有待審請求可以取消。' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_item
	FROM public.campaign_shop_items
	WHERE id = v_order.shop_item_id AND campaign_id = v_order.campaign_id
	FOR UPDATE;
	IF NOT FOUND OR v_item.stock_reserved < v_order.quantity THEN
		RAISE EXCEPTION '保留庫存資料不一致。' USING ERRCODE = '23514';
	END IF;
	UPDATE public.campaign_shop_items
	SET stock_reserved = stock_reserved - v_order.quantity,
		stock_available = stock_available + v_order.quantity
	WHERE id = v_item.id AND campaign_id = v_order.campaign_id;
	UPDATE public.campaign_shop_orders
	SET status = 'cancelled', updated_at = now()
	WHERE id = p_order_id;
	RETURN p_order_id;
END
$cancel_campaign_shop_order$;

REVOKE ALL ON FUNCTION public.campaign_shop_settle_order(text, boolean),
	public.purchase_campaign_shop_item(text, text, text, text, integer),
	public.request_campaign_shop_item(text, text, text, text, integer),
	public.approve_campaign_shop_order(text),
	public.reject_campaign_shop_order(text),
	public.cancel_campaign_shop_order(text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_campaign_shop_item(text, text, text, text, integer),
	public.request_campaign_shop_item(text, text, text, text, integer),
	public.approve_campaign_shop_order(text),
	public.reject_campaign_shop_order(text),
	public.cancel_campaign_shop_order(text)
	TO authenticated;

DO $campaign_shop_realtime$
DECLARE
	table_name text;
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
	) THEN
		RAISE EXCEPTION '找不到 supabase_realtime publication，請先確認 Supabase Realtime 設定。';
	END IF;

	FOREACH table_name IN ARRAY ARRAY[
		'campaign_shops', 'campaign_shop_items', 'campaign_shop_orders'
	] LOOP
		IF NOT EXISTS (
			SELECT 1 FROM pg_publication_tables
			WHERE pubname = 'supabase_realtime'
				AND schemaname = 'public'
				AND tablename = table_name
		) THEN
			EXECUTE format(
				'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
				table_name
			);
		END IF;
	END LOOP;
END
$campaign_shop_realtime$;
