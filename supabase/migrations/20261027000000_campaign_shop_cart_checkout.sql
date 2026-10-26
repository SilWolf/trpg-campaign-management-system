ALTER TABLE public.campaign_shop_orders
	ADD COLUMN checkout_id text;

CREATE INDEX campaign_shop_orders_checkout_idx
	ON public.campaign_shop_orders (checkout_id, created_at)
	WHERE checkout_id IS NOT NULL;

CREATE UNIQUE INDEX campaign_shop_orders_checkout_item_uidx
	ON public.campaign_shop_orders (checkout_id, shop_item_id)
	WHERE checkout_id IS NOT NULL;

GRANT SELECT (checkout_id)
	ON public.campaign_shop_orders TO authenticated;

CREATE OR REPLACE FUNCTION public.checkout_campaign_shop_cart(
	p_campaign_id text,
	p_shop_id text,
	p_character_id text,
	p_wallet_type text,
	p_items jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $checkout_campaign_shop_cart$
DECLARE
	v_checkout_id text := gen_random_uuid()::text;
	v_shop_name text;
	v_shop_active boolean;
	v_requires_approval boolean := false;
	v_line record;
	v_item public.campaign_shop_items%ROWTYPE;
	v_order_id text;
BEGIN
	IF auth.uid() IS NULL
		OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役結帳。' USING ERRCODE = '42501';
	END IF;
	IF p_wallet_type IS NULL OR p_wallet_type NOT IN ('public', 'private')
		OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
		RAISE EXCEPTION '購物車或付款錢包無效。' USING ERRCODE = '22023';
	END IF;
	IF jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 100 THEN
		RAISE EXCEPTION '購物車商品數量無效。' USING ERRCODE = '22023';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_items) AS line(value)
		WHERE jsonb_typeof(line.value) IS DISTINCT FROM 'object'
			OR COALESCE(line.value ->> 'shop_item_id', '') = ''
			OR COALESCE(line.value ->> 'quantity', '') !~ '^[1-9][0-9]{0,9}$'
		OR CASE
			WHEN (line.value ->> 'quantity') ~ '^[1-9][0-9]{0,9}$'
				THEN (line.value ->> 'quantity')::numeric > 2147483647
			ELSE false
		END
	) OR (
		SELECT count(*) <> count(DISTINCT line.value ->> 'shop_item_id')
		FROM jsonb_array_elements(p_items) AS line(value)
	) THEN
		RAISE EXCEPTION '購物車商品或數量無效，且每項商品只能出現一次。'
			USING ERRCODE = '22023';
	END IF;

	PERFORM public.campaign_shop_assert_buyer_access(
		p_campaign_id, p_character_id, p_wallet_type
	);

	SELECT shop.name, shop.is_active
	INTO v_shop_name, v_shop_active
	FROM public.campaign_shops AS shop
	WHERE shop.id = p_shop_id
		AND shop.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND OR NOT v_shop_active THEN
		RAISE EXCEPTION '商店不存在或已停用。' USING ERRCODE = '22023';
	END IF;

	FOR v_line IN
		SELECT
			line.value ->> 'shop_item_id' AS shop_item_id,
			(line.value ->> 'quantity')::integer AS quantity
		FROM jsonb_array_elements(p_items) AS line(value)
		ORDER BY line.value ->> 'shop_item_id'
	LOOP
		SELECT shop_item.*
		INTO v_item
		FROM public.campaign_shop_items AS shop_item
		WHERE shop_item.id = v_line.shop_item_id
			AND shop_item.campaign_id = p_campaign_id
			AND shop_item.shop_id = p_shop_id
			AND shop_item.is_active
		FOR UPDATE;
		IF NOT FOUND THEN
			RAISE EXCEPTION '商品不存在或已停用。' USING ERRCODE = '22023';
		END IF;
		IF v_item.stock_available < v_line.quantity THEN
			RAISE EXCEPTION '商品「%」庫存不足。', v_item.item_snapshot ->> 'name'
				USING ERRCODE = '23514';
		END IF;
		v_requires_approval :=
			v_requires_approval OR v_item.requires_approval;
	END LOOP;

	FOR v_line IN
		SELECT
			line.value ->> 'shop_item_id' AS shop_item_id,
			(line.value ->> 'quantity')::integer AS quantity
		FROM jsonb_array_elements(p_items) AS line(value)
		ORDER BY line.value ->> 'shop_item_id'
	LOOP
		SELECT shop_item.*
		INTO v_item
		FROM public.campaign_shop_items AS shop_item
		WHERE shop_item.id = v_line.shop_item_id
			AND shop_item.campaign_id = p_campaign_id
			AND shop_item.shop_id = p_shop_id;

		v_order_id := gen_random_uuid()::text;
		INSERT INTO public.campaign_shop_orders (
			id, checkout_id, campaign_id, shop_id, shop_item_id, buyer_user_id,
			character_id, item_snapshot, shop_name_snapshot, unit_price_gp,
			quantity, total_price_gp, status, requires_approval
		)
		VALUES (
			v_order_id, v_checkout_id, p_campaign_id, p_shop_id, v_item.id,
			auth.uid(), p_character_id, v_item.item_snapshot, v_shop_name,
			v_item.unit_price_gp, v_line.quantity,
			v_item.unit_price_gp * v_line.quantity, 'pending',
			v_requires_approval
		);
		INSERT INTO public.campaign_shop_order_payments (order_id, wallet_type)
		VALUES (v_order_id, p_wallet_type);

		IF v_requires_approval THEN
			UPDATE public.campaign_shop_items
			SET stock_available = stock_available - v_line.quantity,
				stock_reserved = stock_reserved + v_line.quantity
			WHERE id = v_item.id AND campaign_id = p_campaign_id;
		ELSE
			PERFORM public.campaign_shop_settle_order(v_order_id, false);
		END IF;
	END LOOP;

	RETURN v_checkout_id;
END
$checkout_campaign_shop_cart$;

CREATE OR REPLACE FUNCTION public.campaign_shop_transition_cart(
	p_order_id text,
	p_action text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_shop_transition_cart$
DECLARE
	v_seed public.campaign_shop_orders%ROWTYPE;
	v_order public.campaign_shop_orders%ROWTYPE;
	v_item public.campaign_shop_items%ROWTYPE;
	v_target_status text;
BEGIN
	IF auth.uid() IS NULL OR p_action NOT IN ('approve', 'reject', 'cancel') THEN
		RAISE EXCEPTION '購物車處理方式無效。' USING ERRCODE = '22023';
	END IF;
	SELECT * INTO v_seed
	FROM public.campaign_shop_orders
	WHERE id = p_order_id;
	IF NOT FOUND OR v_seed.checkout_id IS NULL THEN
		RAISE EXCEPTION '找不到購物車交易。' USING ERRCODE = '22023';
	END IF;

	IF p_action IN ('approve', 'reject') THEN
		IF NOT public.is_campaign_dm(v_seed.campaign_id) THEN
			RAISE EXCEPTION '只有該戰役 DM 可以審查此請求。'
				USING ERRCODE = '42501';
		END IF;
		v_target_status := CASE p_action
			WHEN 'approve' THEN 'completed'
			ELSE 'rejected'
		END;
	ELSE
		IF v_seed.buyer_user_id <> auth.uid()
			OR NOT public.is_campaign_member_or_dm(v_seed.campaign_id) THEN
			RAISE EXCEPTION '無權取消此購物車請求。' USING ERRCODE = '42501';
		END IF;
		v_target_status := 'cancelled';
	END IF;

	FOR v_order IN
		SELECT *
		FROM public.campaign_shop_orders
		WHERE checkout_id = v_seed.checkout_id
			AND campaign_id = v_seed.campaign_id
		ORDER BY shop_item_id, id
		FOR UPDATE
	LOOP
		IF v_order.status <> 'pending'
			OR v_order.requires_approval IS NOT TRUE
			OR v_order.buyer_user_id <> v_seed.buyer_user_id
			OR v_order.character_id <> v_seed.character_id THEN
			RAISE EXCEPTION '購物車請求已處理或資料不一致。'
				USING ERRCODE = '22023';
		END IF;

		IF p_action = 'approve' THEN
			PERFORM public.campaign_shop_settle_order(v_order.id, true);
		ELSE
			SELECT * INTO v_item
			FROM public.campaign_shop_items
			WHERE id = v_order.shop_item_id
				AND campaign_id = v_order.campaign_id
			FOR UPDATE;
			IF NOT FOUND OR v_item.stock_reserved < v_order.quantity THEN
				RAISE EXCEPTION '保留庫存資料不一致。' USING ERRCODE = '23514';
			END IF;
			UPDATE public.campaign_shop_items
			SET stock_reserved = stock_reserved - v_order.quantity,
				stock_available = stock_available + v_order.quantity
			WHERE id = v_item.id AND campaign_id = v_order.campaign_id;
			UPDATE public.campaign_shop_orders
			SET status = v_target_status,
				reviewed_by = CASE WHEN p_action = 'reject' THEN auth.uid() ELSE NULL END,
				reviewed_at = CASE WHEN p_action = 'reject' THEN now() ELSE NULL END,
				updated_at = now()
			WHERE id = v_order.id;
		END IF;
	END LOOP;

	RETURN v_seed.checkout_id;
END
$campaign_shop_transition_cart$;

ALTER FUNCTION public.approve_campaign_shop_order(text)
	RENAME TO approve_campaign_shop_order_single;
ALTER FUNCTION public.reject_campaign_shop_order(text)
	RENAME TO reject_campaign_shop_order_single;
ALTER FUNCTION public.cancel_campaign_shop_order(text)
	RENAME TO cancel_campaign_shop_order_single;

CREATE OR REPLACE FUNCTION public.approve_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $approve_campaign_shop_order$
DECLARE
	v_checkout_id text;
BEGIN
	SELECT checkout_id INTO v_checkout_id
	FROM public.campaign_shop_orders
	WHERE id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到待審請求。' USING ERRCODE = '22023';
	END IF;
	IF v_checkout_id IS NULL THEN
		RETURN public.approve_campaign_shop_order_single(p_order_id);
	END IF;
	RETURN public.campaign_shop_transition_cart(p_order_id, 'approve');
END
$approve_campaign_shop_order$;

CREATE OR REPLACE FUNCTION public.reject_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $reject_campaign_shop_order$
DECLARE
	v_checkout_id text;
BEGIN
	SELECT checkout_id INTO v_checkout_id
	FROM public.campaign_shop_orders
	WHERE id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到待審請求。' USING ERRCODE = '22023';
	END IF;
	IF v_checkout_id IS NULL THEN
		RETURN public.reject_campaign_shop_order_single(p_order_id);
	END IF;
	RETURN public.campaign_shop_transition_cart(p_order_id, 'reject');
END
$reject_campaign_shop_order$;

CREATE OR REPLACE FUNCTION public.cancel_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $cancel_campaign_shop_order$
DECLARE
	v_checkout_id text;
BEGIN
	SELECT checkout_id INTO v_checkout_id
	FROM public.campaign_shop_orders
	WHERE id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到待審請求。' USING ERRCODE = '22023';
	END IF;
	IF v_checkout_id IS NULL THEN
		RETURN public.cancel_campaign_shop_order_single(p_order_id);
	END IF;
	RETURN public.campaign_shop_transition_cart(p_order_id, 'cancel');
END
$cancel_campaign_shop_order$;

REVOKE ALL ON FUNCTION public.checkout_campaign_shop_cart(text, text, text, text, jsonb),
	public.campaign_shop_transition_cart(text, text),
	public.approve_campaign_shop_order_single(text),
	public.reject_campaign_shop_order_single(text),
	public.cancel_campaign_shop_order_single(text),
	public.approve_campaign_shop_order(text),
	public.reject_campaign_shop_order(text),
	public.cancel_campaign_shop_order(text)
	FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.checkout_campaign_shop_cart(text, text, text, text, jsonb),
	public.approve_campaign_shop_order(text),
	public.reject_campaign_shop_order(text),
	public.cancel_campaign_shop_order(text)
	TO authenticated;
