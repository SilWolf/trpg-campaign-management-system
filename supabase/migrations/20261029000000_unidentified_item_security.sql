DO $unidentified_items_preflight$
DECLARE
	required_columns text[][] := ARRAY[
		ARRAY['campaigns', 'id', 'text'],
		ARRAY['campaigns', 'dm_id', 'text'],
		ARRAY['campaign_shop_items', 'id', 'text'],
		ARRAY['campaign_shop_items', 'campaign_id', 'text'],
		ARRAY['campaign_shop_items', 'item_snapshot', 'jsonb'],
		ARRAY['campaign_shop_orders', 'id', 'text'],
		ARRAY['campaign_shop_orders', 'campaign_id', 'text'],
		ARRAY['campaign_shop_orders', 'item_snapshot', 'jsonb'],
		ARRAY['inventory_items', 'id', 'text'],
		ARRAY['inventory_items', 'campaign_id', 'text'],
		ARRAY['inventory_items', 'is_identified', 'boolean'],
		ARRAY['inventory_items', 'item_base', 'jsonb']
	];
	expected text[];
	actual_type text;
BEGIN
	FOREACH expected SLICE 1 IN ARRAY required_columns LOOP
		IF to_regclass(format('public.%I', expected[1])) IS NULL THEN
			RAISE EXCEPTION '未鑑定物品 migration 前置檢查失敗：public.% 不存在。',
				expected[1];
		END IF;
		SELECT format_type(attribute.atttypid, attribute.atttypmod)
		INTO actual_type
		FROM pg_attribute AS attribute
		WHERE attribute.attrelid = to_regclass(format('public.%I', expected[1]))
			AND attribute.attname = expected[2]
			AND attribute.attnum > 0
			AND NOT attribute.attisdropped;
		IF actual_type IS DISTINCT FROM expected[3] THEN
			RAISE EXCEPTION
				'未鑑定物品 migration 前置檢查失敗：public.%.% 預期型別為 %，實際為 %。',
				expected[1], expected[2], expected[3],
				COALESCE(actual_type, '缺少欄位');
		END IF;
	END LOOP;

	IF to_regprocedure('public.is_valid_item_base(jsonb)') IS NULL
		OR to_regprocedure('public.is_campaign_dm(text)') IS NULL
		OR to_regprocedure('public.is_campaign_member_or_dm(text)') IS NULL
		OR to_regprocedure('public.campaign_shop_assert_buyer_access(text, text, text)') IS NULL THEN
		RAISE EXCEPTION '未鑑定物品 migration 缺少必要的驗證函式。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.campaign_shop_items AS item
		WHERE jsonb_typeof(item.item_snapshot) IS DISTINCT FROM 'object'
			OR NOT public.is_valid_item_base(item.item_snapshot -> 'item_base')
	) THEN
		RAISE EXCEPTION
			'商店商品缺少有效 item_base；請先人工修復資料，未變更任何資料。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.inventory_items AS item
		WHERE item.is_identified IS NULL
			OR (
				item.is_identified IS FALSE
				AND public.is_valid_item_base(item.item_base) IS DISTINCT FROM true
			)
	) THEN
		RAISE EXCEPTION
			'背包物品鑑定狀態為 NULL 或未鑑定列缺少有效 item_base；請先人工修復資料，未變更任何資料。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.campaign_shop_orders AS order_row
		WHERE order_row.status = 'pending'
			AND NOT public.is_valid_item_base(order_row.item_snapshot -> 'item_base')
	) THEN
		RAISE EXCEPTION
			'待審訂單缺少有效 item_base；請先人工修復資料，未變更任何資料。';
	END IF;
END
$unidentified_items_preflight$;

ALTER TABLE public.campaign_shop_items
	ADD COLUMN item_identified_snapshot jsonb,
	ADD COLUMN is_identified boolean NOT NULL DEFAULT true;
ALTER TABLE public.campaign_shop_items
	ALTER COLUMN item_snapshot DROP NOT NULL;

ALTER TABLE public.inventory_items
	ADD COLUMN item_identified_snapshot jsonb;

ALTER TABLE public.campaign_shop_orders
	ADD COLUMN item_identified_snapshot jsonb,
	ADD COLUMN is_identified boolean NOT NULL DEFAULT true;

ALTER TABLE public.campaign_shop_items
	DROP CONSTRAINT IF EXISTS campaign_shop_items_item_snapshot_check;

CREATE OR REPLACE FUNCTION public.campaign_shop_unidentified_item_base(p_item_base jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $campaign_shop_unidentified_item_base$
DECLARE
	v_category text := p_item_base ->> 'category';
	v_safe jsonb;
BEGIN
	IF public.is_valid_item_base(p_item_base) IS DISTINCT FROM true THEN
		RAISE EXCEPTION '物品定義格式無效。' USING ERRCODE = '22023';
	END IF;
	v_safe := jsonb_build_object(
		'name', '未鑑定物品',
		'category', v_category,
		'subTypes', p_item_base -> 'subTypes',
		'rarity', 'Common',
		'icon', 'HelpCircle',
		'weight', p_item_base -> 'weight',
		'valueGp', 0,
		'affixes', '[]'::jsonb,
		'effects', '',
		'flavor', '',
		'dmNotes', '',
		'maxCharges', 0,
		'isEquippable', false,
		'isConsumable', false,
		'isRequireAttunement', false
	);
	IF v_category = 'Weapon' THEN
		v_safe := v_safe || jsonb_build_object(
			'weaponProperties',
			jsonb_build_object('damage', '未鑑定', 'properties', '[]'::jsonb)
		);
	ELSIF v_category = 'Armor' THEN
		v_safe := v_safe || jsonb_build_object(
			'armorProperties', jsonb_build_object('ac', '未鑑定')
		);
	END IF;
	RETURN v_safe;
END
$campaign_shop_unidentified_item_base$;

CREATE OR REPLACE FUNCTION public.campaign_shop_public_item_snapshot(p_item_base jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $campaign_shop_public_item_snapshot$
BEGIN
	IF public.is_valid_item_base(p_item_base) IS DISTINCT FROM true THEN
		RAISE EXCEPTION '物品定義格式無效。' USING ERRCODE = '22023';
	END IF;
	RETURN jsonb_build_object(
		'category', p_item_base -> 'category',
		'subTypes', p_item_base -> 'subTypes',
		'weight', p_item_base -> 'weight'
	);
END
$campaign_shop_public_item_snapshot$;

UPDATE public.campaign_shop_items AS item
SET is_identified = COALESCE((item.item_snapshot ->> 'is_identified')::boolean, true),
	item_identified_snapshot = CASE
		WHEN COALESCE((item.item_snapshot ->> 'is_identified')::boolean, true)
			THEN NULL
		ELSE item.item_snapshot - 'is_identified'
	END,
	item_snapshot = CASE
		WHEN COALESCE((item.item_snapshot ->> 'is_identified')::boolean, true)
			THEN item.item_snapshot - 'is_identified'
		ELSE jsonb_build_object(
			'category', item.item_snapshot #> '{item_base,category}',
			'subTypes', item.item_snapshot #> '{item_base,subTypes}',
			'weight', item.item_snapshot #> '{item_base,weight}'
		)
	END;

UPDATE public.inventory_items AS item
SET item_identified_snapshot = jsonb_build_object(
		'item_base', item.item_base,
		'is_homebrew', item.is_homebrew,
		'is_important', item.is_important
	),
	name = '未鑑定物品',
	category = CASE
		WHEN item.item_base ->> 'category' = 'Weapon' THEN 'Weapon'
		WHEN item.item_base ->> 'category' = 'Armor' THEN 'Armor'
		WHEN COALESCE((item.item_base ->> 'isConsumable')::boolean, false)
			OR item.item_base ->> 'category' IN ('Potion', 'Poison', 'Scroll')
			THEN 'Consumable'
		ELSE 'Misc'
	END,
	sub_type = COALESCE(item.item_base #>> '{subTypes,0}', ''),
	rarity = 'Common',
	icon = 'HelpCircle',
	damage = NULL,
	mastery = 'None',
	ac = NULL,
	weight = (item.item_base ->> 'weight')::numeric,
	value_gp = 0,
	is_homebrew = false,
	requires_attunement = false,
	is_identified = false,
	max_charges = 0,
	effects = '',
	flavor = '',
	dm_notes = '',
	is_equippable = false,
	is_consumable = false,
	is_important = false,
	affixes = '[]'::jsonb,
	item_base = public.campaign_shop_unidentified_item_base(item.item_base)
WHERE item.is_identified IS FALSE;

UPDATE public.campaign_shop_orders AS order_row
SET is_identified = COALESCE((order_row.item_snapshot ->> 'is_identified')::boolean, true),
	item_identified_snapshot = CASE
		WHEN order_row.status = 'pending'
			AND COALESCE((order_row.item_snapshot ->> 'is_identified')::boolean, true) = false
			THEN order_row.item_snapshot - 'is_identified'
		ELSE NULL
	END,
	item_snapshot = CASE
		WHEN COALESCE((order_row.item_snapshot ->> 'is_identified')::boolean, true)
			THEN order_row.item_snapshot - 'is_identified'
		ELSE jsonb_build_object(
			'category', order_row.item_snapshot #> '{item_base,category}',
			'subTypes', order_row.item_snapshot #> '{item_base,subTypes}',
			'weight', order_row.item_snapshot #> '{item_base,weight}'
		)
	END;

ALTER TABLE public.inventory_items
	ALTER COLUMN is_identified SET DEFAULT true,
	ALTER COLUMN is_identified SET NOT NULL;

CREATE OR REPLACE FUNCTION public.inventory_items_protect_unidentified_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $inventory_items_protect_unidentified_snapshot$
DECLARE
	v_snapshot jsonb;
	v_base jsonb;
	v_category text;
BEGIN
	IF NEW.is_identified IS TRUE THEN
		RETURN NEW;
	END IF;

	IF TG_OP = 'INSERT' OR OLD.is_identified IS TRUE THEN
		v_snapshot := NEW.item_identified_snapshot;
		IF v_snapshot IS NULL THEN
			v_snapshot := jsonb_build_object(
				'item_base', NEW.item_base,
				'is_homebrew', NEW.is_homebrew,
				'is_important', NEW.is_important
			);
		END IF;
	ELSE
		v_snapshot := COALESCE(NEW.item_identified_snapshot, OLD.item_identified_snapshot);
	END IF;

	v_base := v_snapshot -> 'item_base';
	IF jsonb_typeof(v_snapshot) IS DISTINCT FROM 'object'
		OR public.is_valid_item_base(v_base) IS DISTINCT FROM true THEN
		RAISE EXCEPTION '未鑑定物品必須具有有效的真實物品定義。'
			USING ERRCODE = '23514';
	END IF;
	NEW.item_identified_snapshot := v_snapshot;
	v_category := v_base ->> 'category';
	NEW.name := '未鑑定物品';
	NEW.category := CASE
		WHEN v_category = 'Weapon' THEN 'Weapon'
		WHEN v_category = 'Armor' THEN 'Armor'
		WHEN COALESCE((v_base ->> 'isConsumable')::boolean, false)
			OR v_category IN ('Potion', 'Poison', 'Scroll') THEN 'Consumable'
		ELSE 'Misc'
	END;
	NEW.sub_type := COALESCE(v_base #>> '{subTypes,0}', '');
	NEW.rarity := 'Common';
	NEW.icon := 'HelpCircle';
	NEW.damage := NULL;
	NEW.mastery := 'None';
	NEW.ac := NULL;
	NEW.weight := (v_base ->> 'weight')::numeric;
	NEW.value_gp := 0;
	NEW.requires_attunement := false;
	NEW.max_charges := 0;
	NEW.effects := '';
	NEW.flavor := '';
	NEW.dm_notes := '';
	NEW.is_equippable := false;
	NEW.is_consumable := false;
	NEW.is_homebrew := false;
	NEW.is_important := false;
	NEW.affixes := '[]'::jsonb;
	NEW.item_base := public.campaign_shop_unidentified_item_base(v_base);
	RETURN NEW;
END
$inventory_items_protect_unidentified_snapshot$;

CREATE TRIGGER inventory_items_protect_unidentified_snapshot
	BEFORE INSERT OR UPDATE ON public.inventory_items
	FOR EACH ROW EXECUTE FUNCTION public.inventory_items_protect_unidentified_snapshot();

ALTER TABLE public.campaign_shop_items
	ADD CONSTRAINT campaign_shop_items_item_snapshot_safe_check CHECK (
		(
			is_identified
			AND item_identified_snapshot IS NULL
			AND jsonb_typeof(item_snapshot) = 'object'
			AND item_snapshot ?& ARRAY['name', 'category', 'rarity', 'icon', 'item_base']
			AND public.is_valid_item_base(item_snapshot -> 'item_base')
		)
		OR (
			NOT is_identified
			AND item_identified_snapshot IS NOT NULL
			AND jsonb_typeof(item_snapshot) = 'object'
			AND item_snapshot ?& ARRAY['category', 'subTypes', 'weight']
			AND jsonb_typeof(item_snapshot -> 'category') = 'string'
			AND jsonb_typeof(item_snapshot -> 'subTypes') = 'array'
			AND jsonb_typeof(item_snapshot -> 'weight') = 'number'
			AND jsonb_typeof(item_identified_snapshot) = 'object'
			AND public.is_valid_item_base(item_identified_snapshot -> 'item_base')
		)
	),
	ADD CONSTRAINT campaign_shop_items_secret_snapshot_object_check CHECK (
		item_identified_snapshot IS NULL
		OR jsonb_typeof(item_identified_snapshot) = 'object'
	);

ALTER TABLE public.inventory_items
	ADD CONSTRAINT inventory_items_secret_snapshot_object_check CHECK (
		item_identified_snapshot IS NULL
		OR (
			jsonb_typeof(item_identified_snapshot) = 'object'
			AND public.is_valid_item_base(item_identified_snapshot -> 'item_base')
		)
	),
	ADD CONSTRAINT inventory_items_unidentified_snapshot_required_check CHECK (
		is_identified OR item_identified_snapshot IS NOT NULL
	);

ALTER TABLE public.campaign_shop_orders
	ADD CONSTRAINT campaign_shop_orders_secret_snapshot_object_check CHECK (
		item_identified_snapshot IS NULL
		OR (
			jsonb_typeof(item_identified_snapshot) = 'object'
			AND public.is_valid_item_base(item_identified_snapshot -> 'item_base')
		)
	),
	ADD CONSTRAINT campaign_shop_orders_unidentified_snapshot_required_check CHECK (
		is_identified OR status <> 'pending' OR item_identified_snapshot IS NOT NULL
	);

CREATE OR REPLACE FUNCTION public.campaign_shop_sync_order_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $campaign_shop_sync_order_snapshot$
DECLARE
	v_item public.campaign_shop_items%ROWTYPE;
BEGIN
	IF TG_OP = 'INSERT' THEN
		SELECT shop_item.*
		INTO v_item
		FROM public.campaign_shop_items AS shop_item
		WHERE shop_item.id = NEW.shop_item_id
			AND shop_item.campaign_id = NEW.campaign_id
			AND shop_item.shop_id = NEW.shop_id
		FOR SHARE;
		IF NOT FOUND THEN
			RAISE EXCEPTION '商店商品不存在或不屬於此戰役。'
				USING ERRCODE = '23503';
		END IF;
		NEW.item_snapshot := v_item.item_snapshot;
		NEW.item_identified_snapshot := v_item.item_identified_snapshot;
		NEW.is_identified := v_item.is_identified;
	ELSIF NEW.status IN ('completed', 'rejected', 'cancelled') THEN
		NEW.item_identified_snapshot := NULL;
	END IF;
	RETURN NEW;
END
$campaign_shop_sync_order_snapshot$;

CREATE TRIGGER campaign_shop_orders_sync_private_snapshot
	BEFORE INSERT OR UPDATE ON public.campaign_shop_orders
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_sync_order_snapshot();

CREATE OR REPLACE FUNCTION public.save_campaign_shop_item(
	p_campaign_id text,
	p_shop_id text,
	p_item_id text,
	p_item_snapshot jsonb,
	p_unit_price_gp numeric,
	p_stock_available integer,
	p_requires_approval boolean,
	p_is_active boolean,
	p_source_type text,
	p_source_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $save_campaign_shop_item$
DECLARE
	v_id text := COALESCE(p_item_id, gen_random_uuid()::text);
	v_base jsonb := p_item_snapshot -> 'item_base';
	v_is_identified boolean;
	v_public_snapshot jsonb;
	v_secret_snapshot jsonb;
BEGIN
	IF auth.uid() IS NULL OR NOT public.is_campaign_dm(p_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以管理商店商品。'
			USING ERRCODE = '42501';
	END IF;
	IF jsonb_typeof(p_item_snapshot) IS DISTINCT FROM 'object'
		OR NOT public.is_valid_item_base(v_base)
		OR p_unit_price_gp IS NULL OR p_unit_price_gp <= 0
		OR p_stock_available IS NULL OR p_stock_available < 0
		OR p_source_type NOT IN ('catalog', 'blacksmith', 'manual') THEN
		RAISE EXCEPTION '商店商品資料無效。' USING ERRCODE = '22023';
	END IF;

	v_is_identified := COALESCE((p_item_snapshot ->> 'is_identified')::boolean, true);
	IF v_is_identified THEN
		v_public_snapshot := p_item_snapshot - 'is_identified';
		v_secret_snapshot := NULL;
	ELSE
		v_public_snapshot := public.campaign_shop_public_item_snapshot(v_base);
		v_secret_snapshot := p_item_snapshot - 'is_identified';
	END IF;

	IF p_item_id IS NOT NULL THEN
		UPDATE public.campaign_shop_items
		SET item_snapshot = v_public_snapshot,
			item_identified_snapshot = v_secret_snapshot,
			is_identified = v_is_identified,
			unit_price_gp = p_unit_price_gp,
			stock_available = p_stock_available,
			requires_approval = COALESCE(p_requires_approval, false),
			is_active = COALESCE(p_is_active, true),
			source_type = p_source_type,
			source_id = p_source_id
		WHERE id = p_item_id
			AND campaign_id = p_campaign_id
			AND shop_id = p_shop_id;
		IF NOT FOUND THEN
			RAISE EXCEPTION '商店商品不存在或不屬於指定商店。'
				USING ERRCODE = '22023';
		END IF;
	ELSE
		INSERT INTO public.campaign_shop_items (
			id, campaign_id, shop_id, item_snapshot, item_identified_snapshot,
			is_identified, unit_price_gp, stock_available, requires_approval,
			is_active, source_type, source_id
		)
		VALUES (
			v_id, p_campaign_id, p_shop_id, v_public_snapshot,
			v_secret_snapshot, v_is_identified, p_unit_price_gp,
			p_stock_available, COALESCE(p_requires_approval, false),
			COALESCE(p_is_active, true), p_source_type, p_source_id
		);
	END IF;
	RETURN v_id;
END
$save_campaign_shop_item$;

CREATE OR REPLACE FUNCTION public.identify_inventory_item(
	p_actor_id uuid,
	p_campaign_id text,
	p_item_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $identify_inventory_item$
DECLARE
	v_item public.inventory_items%ROWTYPE;
	v_snapshot jsonb;
	v_base jsonb;
	v_sub_type text;
	v_category text;
BEGIN
	IF p_actor_id IS NULL OR NOT EXISTS (
		SELECT 1 FROM auth.users AS user_row WHERE user_row.id = p_actor_id
	) OR NOT EXISTS (
		SELECT 1 FROM public.campaigns AS campaign
		WHERE campaign.id = p_campaign_id
			AND campaign.dm_id = p_actor_id::text
	) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以鑑定物品。'
			USING ERRCODE = '42501';
	END IF;

	SELECT item.*
	INTO v_item
	FROM public.inventory_items AS item
	WHERE item.id = p_item_id
		AND item.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND OR v_item.is_identified IS TRUE
		OR v_item.item_identified_snapshot IS NULL THEN
		RAISE EXCEPTION '物品不存在、已鑑定或缺少安全快照。'
			USING ERRCODE = '22023';
	END IF;

	v_snapshot := v_item.item_identified_snapshot;
	v_base := v_snapshot -> 'item_base';
	IF NOT public.is_valid_item_base(v_base) THEN
		RAISE EXCEPTION '物品的隱藏定義格式無效。' USING ERRCODE = '23514';
	END IF;
	v_category := v_base ->> 'category';
	v_sub_type := COALESCE(v_base #>> '{subTypes,0}', '');

	UPDATE public.inventory_items
	SET name = v_base ->> 'name',
		category = CASE
			WHEN v_category = 'Weapon' THEN 'Weapon'
			WHEN v_category = 'Armor' THEN 'Armor'
			WHEN COALESCE((v_base ->> 'isConsumable')::boolean, false)
				OR v_category IN ('Potion', 'Poison', 'Scroll')
				THEN 'Consumable'
			ELSE 'Misc'
		END,
		sub_type = v_sub_type,
		rarity = v_base ->> 'rarity',
		icon = COALESCE(v_base ->> 'icon', 'Package'),
		damage = v_base #>> '{weaponProperties,damage}',
		mastery = COALESCE(v_base #>> '{weaponProperties,mastery}', 'None'),
		ac = v_base #>> '{armorProperties,ac}',
		weight = (v_base ->> 'weight')::numeric,
		value_gp = (v_base ->> 'valueGp')::numeric,
		is_homebrew = COALESCE((v_snapshot ->> 'is_homebrew')::boolean, v_item.is_homebrew),
		is_identified = true,
		max_charges = COALESCE((v_base ->> 'maxCharges')::integer, 0),
		effects = COALESCE(v_base ->> 'effects', ''),
		flavor = COALESCE(v_base ->> 'flavor', ''),
		dm_notes = COALESCE(v_base ->> 'dmNotes', ''),
		is_equippable = COALESCE((v_base ->> 'isEquippable')::boolean, false),
		is_consumable = COALESCE((v_base ->> 'isConsumable')::boolean, false),
		is_important = COALESCE((v_snapshot ->> 'is_important')::boolean, v_item.is_important),
		affixes = COALESCE(v_base -> 'affixes', '[]'::jsonb),
		item_base = v_base,
		item_identified_snapshot = NULL
	WHERE id = v_item.id AND campaign_id = p_campaign_id;
	RETURN v_item.id;
END
$identify_inventory_item$;

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
	v_definition jsonb;
	v_base jsonb;
	v_public_base jsonb;
	v_wallet jsonb;
	v_wallet_total_cp numeric;
	v_price_cp numeric;
	v_is_identified boolean;
	v_category text;
	v_inventory_id text := gen_random_uuid()::text;
BEGIN
	SELECT * INTO v_order
	FROM public.campaign_shop_orders AS order_row
	WHERE order_row.id = p_order_id
	FOR UPDATE;
	IF NOT FOUND OR v_order.status <> 'pending' THEN
		RAISE EXCEPTION '訂單不存在或已處理。' USING ERRCODE = '22023';
	END IF;

	IF p_reserved THEN
		IF NOT public.is_campaign_dm(v_order.campaign_id)
			OR v_order.requires_approval IS NOT TRUE THEN
			RAISE EXCEPTION '只有該戰役 DM 可以核准此訂單。'
				USING ERRCODE = '42501';
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

	v_is_identified := v_order.is_identified;
	v_definition := CASE
		WHEN v_is_identified THEN v_order.item_snapshot
		ELSE v_order.item_identified_snapshot
	END;
	v_base := v_definition -> 'item_base';
	IF NOT public.is_valid_item_base(v_base) THEN
		RAISE EXCEPTION '訂單物品快照無效，交易已取消。'
			USING ERRCODE = '23514';
	END IF;
	v_public_base := CASE
		WHEN v_is_identified THEN v_base
		ELSE public.campaign_shop_unidentified_item_base(v_base)
	END;
	v_category := v_public_base ->> 'category';

	INSERT INTO public.inventory_items (
		id, campaign_id, owner_id, slot, name, category, sub_type, rarity, icon,
		damage, mastery, ac, weight, value_gp, quantity, equipped,
		requires_attunement, attuned, is_homebrew, is_identified, charges,
		max_charges, effects, flavor, dm_notes, player_notes, is_private,
		is_equippable, is_consumable, is_important, affixes, item_base,
		item_identified_snapshot
	)
	VALUES (
		v_inventory_id, v_order.campaign_id, v_order.character_id, 0,
		v_public_base ->> 'name',
		CASE
			WHEN v_category = 'Weapon' THEN 'Weapon'
			WHEN v_category = 'Armor' THEN 'Armor'
			WHEN COALESCE((v_public_base ->> 'isConsumable')::boolean, false)
				OR v_category IN ('Potion', 'Poison', 'Scroll') THEN 'Consumable'
			ELSE 'Misc'
		END,
		COALESCE(v_public_base #>> '{subTypes,0}', ''),
		v_public_base ->> 'rarity',
		COALESCE(v_public_base ->> 'icon', 'Package'),
		v_public_base #>> '{weaponProperties,damage}',
		COALESCE(v_public_base #>> '{weaponProperties,mastery}', 'None'),
		v_public_base #>> '{armorProperties,ac}',
		(v_public_base ->> 'weight')::numeric,
		(v_public_base ->> 'valueGp')::numeric,
		v_order.quantity, false,
		COALESCE((v_public_base ->> 'isRequireAttunement')::boolean, false),
		false, COALESCE((v_definition ->> 'is_homebrew')::boolean, false),
		v_is_identified, 0,
		COALESCE((v_public_base ->> 'maxCharges')::integer, 0),
		COALESCE(v_public_base ->> 'effects', ''),
		COALESCE(v_public_base ->> 'flavor', ''),
		COALESCE(v_public_base ->> 'dmNotes', ''), '', false,
		COALESCE((v_public_base ->> 'isEquippable')::boolean, false),
		COALESCE((v_public_base ->> 'isConsumable')::boolean, false),
		CASE WHEN v_is_identified
			THEN COALESCE((v_definition ->> 'is_important')::boolean, false)
			ELSE false
		END,
		COALESCE(v_public_base -> 'affixes', '[]'::jsonb),
		v_public_base,
		CASE WHEN v_is_identified THEN NULL ELSE v_definition END
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

CREATE OR REPLACE FUNCTION public.campaign_shop_notify_safe_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $campaign_shop_notify_safe_change$
DECLARE
	v_campaign_id text := CASE WHEN TG_OP = 'DELETE'
		THEN OLD.campaign_id ELSE NEW.campaign_id END;
	v_row_id text := CASE WHEN TG_OP = 'DELETE'
		THEN OLD.id ELSE NEW.id END;
BEGIN
	PERFORM realtime.send(
		jsonb_build_object(
			'campaign_id', v_campaign_id,
			'row_id', v_row_id,
			'action', lower(TG_OP)
		),
		'campaign_data_changed',
		'campaign:' || v_campaign_id || ':secure-data',
		true
	);
	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;
	RETURN NEW;
END
$campaign_shop_notify_safe_change$;

CREATE TRIGGER inventory_items_safe_change_broadcast
	AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_notify_safe_change();
CREATE TRIGGER campaign_shop_items_safe_change_broadcast
	AFTER INSERT OR UPDATE OR DELETE ON public.campaign_shop_items
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_notify_safe_change();
CREATE TRIGGER campaign_shop_orders_safe_change_broadcast
	AFTER INSERT OR UPDATE OR DELETE ON public.campaign_shop_orders
	FOR EACH ROW EXECUTE FUNCTION public.campaign_shop_notify_safe_change();

DO $unidentified_items_realtime$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
	) THEN
		RAISE EXCEPTION '找不到 supabase_realtime publication。';
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_publication
		WHERE pubname = 'supabase_realtime'
			AND puballtables
	) THEN
		RAISE EXCEPTION
			'supabase_realtime 使用 FOR ALL TABLES；請先調整 publication，避免廣播秘密欄位。';
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'inventory_items'
	) THEN
		ALTER PUBLICATION supabase_realtime DROP TABLE public.inventory_items;
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'campaign_shop_items'
	) THEN
		ALTER PUBLICATION supabase_realtime DROP TABLE public.campaign_shop_items;
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'campaign_shop_orders'
	) THEN
		ALTER PUBLICATION supabase_realtime DROP TABLE public.campaign_shop_orders;
	END IF;
END
$unidentified_items_realtime$;

DROP POLICY IF EXISTS campaign_secure_data_member_read ON realtime.messages;
DROP POLICY IF EXISTS campaign_secure_data_member_boundary ON realtime.messages;
CREATE POLICY campaign_secure_data_member_read
	ON realtime.messages
	FOR SELECT TO authenticated
	USING (
		split_part(realtime.topic(), ':', 1) = 'campaign'
		AND split_part(realtime.topic(), ':', 3) = 'secure-data'
		AND public.is_campaign_member_or_dm(split_part(realtime.topic(), ':', 2))
	);
CREATE POLICY campaign_secure_data_member_boundary
	ON realtime.messages
	AS RESTRICTIVE
	FOR SELECT TO authenticated
	USING (
		split_part(realtime.topic(), ':', 1) = 'campaign'
		AND split_part(realtime.topic(), ':', 3) = 'secure-data'
		AND public.is_campaign_member_or_dm(split_part(realtime.topic(), ':', 2))
	);

REVOKE ALL ON TABLE public.campaign_shop_items,
	public.campaign_shop_orders,
	public.inventory_items
	FROM PUBLIC, anon, authenticated;

GRANT SELECT (
	id, campaign_id, shop_id, item_snapshot, is_identified,
	source_type, source_id, unit_price_gp, stock_available, stock_reserved,
	requires_approval, is_active, created_at, updated_at
) ON public.campaign_shop_items TO authenticated;
GRANT DELETE ON TABLE public.campaign_shop_items TO authenticated;

GRANT SELECT (
	id, campaign_id, owner_id, slot, name, category, sub_type, rarity, icon,
	damage, mastery, ac, weight, value_gp, quantity, equipped,
	requires_attunement, attuned, is_homebrew, is_identified, charges,
	max_charges, effects, flavor, dm_notes, player_notes, is_private,
	is_equippable, is_consumable, is_important, affixes, item_base
) ON public.inventory_items TO authenticated;
GRANT INSERT (
	id, campaign_id, owner_id, slot, name, category, sub_type, rarity, icon,
	damage, mastery, ac, weight, value_gp, quantity, equipped,
	requires_attunement, attuned, is_homebrew, is_identified, charges,
	max_charges, effects, flavor, dm_notes, player_notes, is_private,
	is_equippable, is_consumable, is_important, affixes, item_base
) ON public.inventory_items TO authenticated;
GRANT UPDATE (
	owner_id, slot, name, category, sub_type, rarity, icon, damage, mastery,
	ac, weight, value_gp, quantity, equipped, requires_attunement, attuned,
	is_homebrew, charges, max_charges, effects, flavor, dm_notes, player_notes,
	is_private, is_equippable, is_consumable, is_important, affixes, item_base
) ON public.inventory_items TO authenticated;
GRANT DELETE ON TABLE public.inventory_items TO authenticated;

GRANT SELECT (
	id, checkout_id, campaign_id, shop_id, shop_item_id,
	character_id, item_snapshot, shop_name_snapshot, unit_price_gp, quantity,
	total_price_gp, status, requires_approval, created_at, updated_at,
	reviewed_at, is_identified
) ON public.campaign_shop_orders TO authenticated;

REVOKE INSERT, UPDATE ON TABLE public.campaign_shop_items
	FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (is_identified) ON public.inventory_items
	FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.campaign_shop_unidentified_item_base(jsonb),
	public.campaign_shop_public_item_snapshot(jsonb),
	public.campaign_shop_sync_order_snapshot(),
	public.campaign_shop_notify_safe_change(),
	public.inventory_items_protect_unidentified_snapshot()
	FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_campaign_shop_item(
	text, text, text, jsonb, numeric, integer, boolean, boolean, text, text
), public.identify_inventory_item(uuid, text, text)
	FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_campaign_shop_item(
	text, text, text, jsonb, numeric, integer, boolean, boolean, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.identify_inventory_item(uuid, text, text)
	TO service_role;
