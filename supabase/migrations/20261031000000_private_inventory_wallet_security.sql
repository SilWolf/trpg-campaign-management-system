DO $private_inventory_wallet_preflight$
DECLARE
	v_character_table_owner text;
BEGIN
	IF to_regclass('public.characters') IS NULL
		OR to_regclass('public.inventory_items') IS NULL
		OR to_regclass('public.character_permissions') IS NULL
		OR to_regclass('public.campaign_activity_log') IS NULL THEN
		RAISE EXCEPTION
			'私人背包安全 migration 前置檢查失敗：缺少必要資料表。';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM public.inventory_items
		WHERE is_private IS NULL
	) THEN
		RAISE EXCEPTION
			'私人背包安全 migration 前置檢查失敗：inventory_items.is_private 有 NULL，請先人工確認資料語意。';
	END IF;
	SELECT pg_catalog.pg_get_userbyid(relation.relowner)
	INTO v_character_table_owner
	FROM pg_catalog.pg_class AS relation
	WHERE relation.oid = 'public.characters'::regclass;
	IF current_user <> v_character_table_owner THEN
		RAISE EXCEPTION
			'私人錢包安全 migration 必須由 characters 資料表擁有者執行，才能確保受限交易 RPC 正確運作。';
	END IF;

	IF to_regprocedure(
		'public.transfer_campaign_currency(text,text,text,text,text,integer)'
	) IS NULL OR to_regprocedure(
		'public.transfer_inventory_item(text,text,text,integer)'
	) IS NULL OR to_regprocedure(
		'public.transfer_inventory_item_before_activity_log(text,text,text,integer)'
	) IS NULL THEN
		RAISE EXCEPTION
			'私人背包安全 migration 前置檢查失敗：找不到預期的交易 RPC。';
	END IF;
END
$private_inventory_wallet_preflight$;

CREATE OR REPLACE FUNCTION public.campaign_inventory_can_read(
	p_campaign_id text,
	p_owner_id text,
	p_is_private boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_inventory_can_read$
	SELECT auth.uid() IS NOT NULL
		AND p_is_private IS NOT NULL
		AND public.is_campaign_member_or_dm(p_campaign_id)
		AND (
			public.is_campaign_dm(p_campaign_id)
			OR p_owner_id = 'camp-chest'
			OR EXISTS (
				SELECT 1
				FROM public.characters AS character
				WHERE character.id = p_owner_id
					AND character.campaign_id = p_campaign_id
					AND character.user_id = auth.uid()::text
			)
			OR EXISTS (
				SELECT 1
				FROM public.character_permissions AS permission
				WHERE permission.campaign_id = p_campaign_id
					AND permission.character_id = p_owner_id
					AND permission.user_id = auth.uid()
					AND CASE WHEN p_is_private
						THEN permission.private_bag_access
						ELSE permission.public_bag_access
					END >= 1
			)
		);
$campaign_inventory_can_read$;

CREATE OR REPLACE FUNCTION public.campaign_inventory_can_write(
	p_campaign_id text,
	p_owner_id text,
	p_is_private boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_inventory_can_write$
	SELECT auth.uid() IS NOT NULL
		AND p_is_private IS NOT NULL
		AND public.is_campaign_member_or_dm(p_campaign_id)
		AND (
			public.is_campaign_dm(p_campaign_id)
			OR p_owner_id = 'camp-chest'
			OR EXISTS (
				SELECT 1
				FROM public.characters AS character
				WHERE character.id = p_owner_id
					AND character.campaign_id = p_campaign_id
					AND character.user_id = auth.uid()::text
			)
			OR EXISTS (
				SELECT 1
				FROM public.character_permissions AS permission
				WHERE permission.campaign_id = p_campaign_id
					AND permission.character_id = p_owner_id
					AND permission.user_id = auth.uid()
					AND CASE WHEN p_is_private
						THEN permission.private_bag_access
						ELSE permission.public_bag_access
					END = 2
			)
		);
$campaign_inventory_can_write$;

REVOKE ALL ON FUNCTION public.campaign_inventory_can_read(text, text, boolean),
	public.campaign_inventory_can_write(text, text, boolean)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_inventory_can_read(text, text, boolean),
	public.campaign_inventory_can_write(text, text, boolean)
	TO authenticated;

DROP POLICY IF EXISTS inventory_items_acl_read ON public.inventory_items;
CREATE POLICY inventory_items_acl_read
	ON public.inventory_items
	AS RESTRICTIVE
	FOR SELECT
	TO authenticated
	USING (
		public.campaign_inventory_can_read(campaign_id, owner_id, is_private)
	);

DROP POLICY IF EXISTS inventory_items_acl_insert ON public.inventory_items;
CREATE POLICY inventory_items_acl_insert
	ON public.inventory_items
	AS RESTRICTIVE
	FOR INSERT
	TO authenticated
	WITH CHECK (
		public.campaign_inventory_can_write(campaign_id, owner_id, is_private)
	);

DROP POLICY IF EXISTS inventory_items_acl_update ON public.inventory_items;
CREATE POLICY inventory_items_acl_update
	ON public.inventory_items
	AS RESTRICTIVE
	FOR UPDATE
	TO authenticated
	USING (
		public.campaign_inventory_can_write(campaign_id, owner_id, is_private)
	)
	WITH CHECK (
		public.campaign_inventory_can_write(campaign_id, owner_id, is_private)
	);

DROP POLICY IF EXISTS inventory_items_acl_delete ON public.inventory_items;
CREATE POLICY inventory_items_acl_delete
	ON public.inventory_items
	AS RESTRICTIVE
	FOR DELETE
	TO authenticated
	USING (
		public.campaign_inventory_can_write(campaign_id, owner_id, is_private)
	);

REVOKE UPDATE ON TABLE public.inventory_items
	FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (is_private) ON TABLE public.inventory_items
	FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
	owner_id, slot, name, category, sub_type, rarity, icon, damage, mastery,
	ac, weight, value_gp, quantity, equipped, requires_attunement, attuned,
	is_homebrew, charges, max_charges, effects, flavor, dm_notes, player_notes,
	is_equippable, is_consumable, is_important, affixes, item_base
) ON public.inventory_items TO authenticated;

CREATE OR REPLACE FUNCTION public.campaign_inventory_assert_write(
	p_campaign_id text,
	p_owner_id text,
	p_is_private boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_inventory_assert_write$
BEGIN
	IF auth.uid() IS NULL
		OR p_is_private IS NULL
		OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權修改此戰役背包。' USING ERRCODE = '42501';
	END IF;
	IF public.is_campaign_dm(p_campaign_id)
		OR p_owner_id = 'camp-chest'
		OR EXISTS (
			SELECT 1
			FROM public.characters AS character
			WHERE character.id = p_owner_id
				AND character.campaign_id = p_campaign_id
				AND character.user_id = auth.uid()::text
		) THEN
		RETURN;
	END IF;

	PERFORM 1
	FROM public.character_permissions AS permission
	WHERE permission.campaign_id = p_campaign_id
		AND permission.character_id = p_owner_id
		AND permission.user_id = auth.uid()
		AND CASE WHEN p_is_private
			THEN permission.private_bag_access
			ELSE permission.public_bag_access
		END = 2
	FOR SHARE;
	IF FOUND THEN
		RETURN;
	END IF;
	RAISE EXCEPTION '沒有此角色背包的修改權限。'
		USING ERRCODE = '42501';
END
$campaign_inventory_assert_write$;

REVOKE ALL ON FUNCTION public.campaign_inventory_assert_write(
	text, text, boolean
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_inventory_private_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $guard_inventory_private_transition$
BEGIN
	IF OLD.is_private IS DISTINCT FROM true AND NEW.is_private IS TRUE THEN
		RAISE EXCEPTION '已公開的物品不可重新設為秘密。'
			USING ERRCODE = '42501';
	END IF;
	RETURN NEW;
END
$guard_inventory_private_transition$;

REVOKE ALL ON FUNCTION public.guard_inventory_private_transition()
	FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS inventory_items_private_transition_guard
	ON public.inventory_items;
CREATE TRIGGER inventory_items_private_transition_guard
	BEFORE UPDATE OF is_private ON public.inventory_items
	FOR EACH ROW
	EXECUTE FUNCTION public.guard_inventory_private_transition();

CREATE OR REPLACE FUNCTION public.make_inventory_item_public(
	p_campaign_id text,
	p_item_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $make_inventory_item_public$
DECLARE
	v_owner_id text;
	v_is_private boolean;
BEGIN
	IF p_campaign_id IS NULL OR btrim(p_campaign_id) = ''
		OR auth.uid() IS NULL
		OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權修改此戰役背包。' USING ERRCODE = '42501';
	END IF;

	SELECT item.owner_id, item.is_private
	INTO v_owner_id, v_is_private
	FROM public.inventory_items AS item
	WHERE item.id = p_item_id
		AND item.campaign_id = p_campaign_id
		AND public.campaign_inventory_can_write(
			item.campaign_id, item.owner_id, item.is_private
		)
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '物品不存在或沒有修改權限。'
			USING ERRCODE = '42501';
	END IF;
	PERFORM public.campaign_inventory_assert_write(
		p_campaign_id, v_owner_id, v_is_private
	);
	IF v_is_private IS DISTINCT FROM true THEN
		RAISE EXCEPTION '只有秘密物品可以公開，公開後不能重新設為秘密。'
			USING ERRCODE = '22023';
	END IF;

	UPDATE public.inventory_items
	SET is_private = false
	WHERE id = p_item_id AND campaign_id = p_campaign_id;
END
$make_inventory_item_public$;

REVOKE ALL ON FUNCTION public.make_inventory_item_public(text, text)
	FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.make_inventory_item_public(text, text)
	TO authenticated;

CREATE OR REPLACE FUNCTION public.split_inventory_item(
	p_campaign_id text,
	p_item_id text,
	p_split_quantity integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $split_inventory_item$
DECLARE
	v_item public.inventory_items%ROWTYPE;
	v_new_id text := gen_random_uuid()::text;
BEGIN
	SELECT item.* INTO v_item
	FROM public.inventory_items AS item
	WHERE item.id = p_item_id
		AND item.campaign_id = p_campaign_id
		AND public.campaign_inventory_can_write(
			item.campaign_id, item.owner_id, item.is_private
		)
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '物品不存在或沒有來源背包修改權限。'
			USING ERRCODE = '42501';
	END IF;
	PERFORM public.campaign_inventory_assert_write(
		p_campaign_id, v_item.owner_id, v_item.is_private
	);
	IF p_split_quantity IS NULL OR p_split_quantity < 1
		OR p_split_quantity >= v_item.quantity THEN
		RAISE EXCEPTION '拆堆數量必須小於目前物品數量。'
			USING ERRCODE = '22023';
	END IF;

	v_item.id := v_new_id;
	v_item.quantity := p_split_quantity;
	INSERT INTO public.inventory_items SELECT v_item.*;
	UPDATE public.inventory_items
	SET quantity = quantity - p_split_quantity
	WHERE id = p_item_id AND campaign_id = p_campaign_id;
	RETURN v_new_id;
END
$split_inventory_item$;

REVOKE ALL ON FUNCTION public.split_inventory_item(text, text, integer)
	FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.split_inventory_item(text, text, integer)
	TO authenticated;

CREATE OR REPLACE FUNCTION public.campaign_wallet_json_is_zero(p_wallet jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $campaign_wallet_json_is_zero$
DECLARE
	v_currency_key text;
BEGIN
	IF jsonb_typeof(p_wallet) IS DISTINCT FROM 'object' THEN
		RETURN false;
	END IF;

	FOREACH v_currency_key IN ARRAY ARRAY['pp', 'gp', 'ep', 'sp', 'cp'] LOOP
		IF p_wallet ? v_currency_key THEN
			IF jsonb_typeof(p_wallet -> v_currency_key)
				IS DISTINCT FROM 'number' THEN
				RETURN false;
			END IF;
			IF (p_wallet ->> v_currency_key)::numeric <> 0 THEN
				RETURN false;
			END IF;
		END IF;
	END LOOP;
	RETURN true;
END
$campaign_wallet_json_is_zero$;

REVOKE ALL ON FUNCTION public.campaign_wallet_json_is_zero(jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.campaign_wallet_json_is_zero(jsonb)
	TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_character_wallet_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, auth
AS $guard_character_wallet_writes$
DECLARE
	v_table_owner text;
BEGIN
	SELECT pg_catalog.pg_get_userbyid(relation.relowner)
	INTO v_table_owner
	FROM pg_catalog.pg_class AS relation
	WHERE relation.oid = 'public.characters'::regclass;

	IF current_user = v_table_owner
		OR current_user = 'service_role'
		OR auth.role() = 'service_role' THEN
		RETURN NEW;
	END IF;

	IF TG_OP = 'INSERT' THEN
		IF NEW.gp IS DISTINCT FROM 0
			OR NEW.private_gp IS DISTINCT FROM 0
			OR NOT public.campaign_wallet_json_is_zero(NEW.currencies)
			OR NOT public.campaign_wallet_json_is_zero(NEW.private_currencies) THEN
			RAISE EXCEPTION '角色錢包必須透過授權交易建立或變更。'
				USING ERRCODE = '42501';
		END IF;
	ELSIF NEW.gp IS DISTINCT FROM OLD.gp
		OR NEW.private_gp IS DISTINCT FROM OLD.private_gp
		OR NEW.currencies IS DISTINCT FROM OLD.currencies
		OR NEW.private_currencies IS DISTINCT FROM OLD.private_currencies THEN
		RAISE EXCEPTION '角色錢包必須透過授權交易建立或變更。'
			USING ERRCODE = '42501';
	END IF;
	RETURN NEW;
END
$guard_character_wallet_writes$;

REVOKE ALL ON FUNCTION public.guard_character_wallet_writes()
	FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS characters_wallet_write_guard ON public.characters;
CREATE TRIGGER characters_wallet_write_guard
	BEFORE INSERT OR UPDATE OF gp, private_gp, currencies, private_currencies
	ON public.characters
	FOR EACH ROW
	EXECUTE FUNCTION public.guard_character_wallet_writes();

DO $character_wallet_read_boundary$
DECLARE
	v_column record;
BEGIN
	EXECUTE
		'REVOKE SELECT ON TABLE public.characters FROM PUBLIC, anon, authenticated';

	FOR v_column IN
		SELECT attribute.attname
		FROM pg_catalog.pg_attribute AS attribute
		WHERE attribute.attrelid = 'public.characters'::regclass
			AND attribute.attnum > 0
			AND NOT attribute.attisdropped
	LOOP
		EXECUTE format(
			'REVOKE SELECT (%I) ON TABLE public.characters FROM PUBLIC, anon, authenticated',
			v_column.attname
		);
		IF v_column.attname NOT IN (
			'gp', 'private_gp', 'currencies', 'private_currencies'
		) THEN
			EXECUTE format(
				'GRANT SELECT (%I) ON TABLE public.characters TO authenticated',
				v_column.attname
			);
		END IF;
	END LOOP;
END
$character_wallet_read_boundary$;

CREATE OR REPLACE FUNCTION public.get_campaign_character_wallets(
	p_campaign_id text,
	p_character_ids text[] DEFAULT NULL
)
RETURNS TABLE (
	character_id text,
	wallet_type text,
	balance_gp numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $get_campaign_character_wallets$
BEGIN
	IF p_campaign_id IS NULL OR btrim(p_campaign_id) = ''
		OR auth.uid() IS NULL
		OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權讀取此戰役錢包。' USING ERRCODE = '42501';
	END IF;

	RETURN QUERY
	SELECT character.id, wallet.wallet_type, wallet.balance_gp
	FROM public.characters AS character
	CROSS JOIN LATERAL (
		VALUES
			('public'::text, character.gp),
			('private'::text, character.private_gp)
	) AS wallet(wallet_type, balance_gp)
	WHERE character.campaign_id = p_campaign_id
		AND (
			p_character_ids IS NULL
			OR character.id = ANY(p_character_ids)
		)
		AND (
			public.is_campaign_dm(p_campaign_id)
			OR character.user_id = auth.uid()::text
			OR EXISTS (
				SELECT 1
				FROM public.character_permissions AS permission
				WHERE permission.campaign_id = p_campaign_id
					AND permission.character_id = character.id
					AND permission.user_id = auth.uid()
					AND CASE WHEN wallet.wallet_type = 'private'
						THEN permission.private_wallet_access
						ELSE permission.public_wallet_access
					END >= 1
			)
		);
END
$get_campaign_character_wallets$;

REVOKE ALL ON FUNCTION public.get_campaign_character_wallets(text, text[])
	FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_character_wallets(text, text[])
	TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_inventory_item(
	p_campaign_id text,
	p_item_id text,
	p_target_owner_id text,
	p_quantity integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $transfer_inventory_item$
DECLARE
	v_source public.inventory_items%ROWTYPE;
	v_target_character public.characters%ROWTYPE;
	v_stack public.inventory_items%ROWTYPE;
	v_source_owner_id text;
	v_source_item_id text;
	v_result_id text;
	v_event_id text := gen_random_uuid()::text;
	v_related_users uuid[];
BEGIN
	IF p_campaign_id IS NULL OR btrim(p_campaign_id) = ''
		OR auth.uid() IS NULL
		OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役移轉物品。' USING ERRCODE = '42501';
	END IF;

	SELECT item.* INTO v_source
	FROM public.inventory_items AS item
	WHERE item.id = p_item_id
		AND item.campaign_id = p_campaign_id
		AND public.campaign_inventory_can_write(
			item.campaign_id, item.owner_id, item.is_private
		)
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '物品不存在或沒有來源背包修改權限。'
			USING ERRCODE = '42501';
	END IF;
	PERFORM public.campaign_inventory_assert_write(
		p_campaign_id, v_source.owner_id, v_source.is_private
	);
	v_source_owner_id := v_source.owner_id;
	v_source_item_id := v_source.id;

	IF p_target_owner_id IS NULL
		OR p_target_owner_id = v_source.owner_id
		OR p_quantity IS NULL
		OR p_quantity < 1
		OR p_quantity > v_source.quantity THEN
		RAISE EXCEPTION '移轉目標或數量無效。' USING ERRCODE = '22023';
	END IF;
	IF p_target_owner_id = 'camp-chest'
		AND v_source.is_private IS TRUE THEN
		RAISE EXCEPTION '秘密物品必須先明確公開，才能移轉至營地儲物箱。'
			USING ERRCODE = '22023';
	END IF;

	IF p_target_owner_id <> 'camp-chest' THEN
		SELECT character.* INTO v_target_character
		FROM public.characters AS character
		WHERE character.id = p_target_owner_id
			AND character.campaign_id = p_campaign_id;
		IF NOT FOUND THEN
			RAISE EXCEPTION '移轉目標不存在或不屬於此戰役。'
				USING ERRCODE = '22023';
		END IF;
	END IF;

	SELECT item.* INTO v_stack
	FROM public.inventory_items AS item
	WHERE item.campaign_id = p_campaign_id
		AND item.owner_id = p_target_owner_id
		AND item.id <> p_item_id
		AND NOT item.equipped
		AND NOT item.attuned
		AND item.is_private = v_source.is_private
		AND item.max_charges = 0
		AND item.name = v_source.name
		AND item.category = v_source.category
		AND item.sub_type = v_source.sub_type
		AND item.rarity = v_source.rarity
		AND item.weight = v_source.weight
		AND item.value_gp = v_source.value_gp
		AND item.requires_attunement = v_source.requires_attunement
		AND item.is_identified = v_source.is_identified
		AND item.item_base = v_source.item_base
		AND item.item_identified_snapshot
			IS NOT DISTINCT FROM v_source.item_identified_snapshot
		AND item.affixes = v_source.affixes
		AND NOT v_source.equipped
		AND NOT v_source.attuned
		AND v_source.max_charges = 0
	ORDER BY item.id
	LIMIT 1
	FOR UPDATE;

	IF FOUND THEN
		IF v_stack.quantity > 1000000 - p_quantity THEN
			RAISE EXCEPTION '目標堆疊數量超出上限。' USING ERRCODE = '22003';
		END IF;
		UPDATE public.inventory_items
		SET quantity = quantity + p_quantity
		WHERE id = v_stack.id AND campaign_id = p_campaign_id;
		IF p_quantity = v_source.quantity THEN
			DELETE FROM public.inventory_items
			WHERE id = p_item_id AND campaign_id = p_campaign_id;
		ELSE
			UPDATE public.inventory_items
			SET quantity = quantity - p_quantity
			WHERE id = p_item_id AND campaign_id = p_campaign_id;
		END IF;
		v_result_id := v_stack.id;
	ELSE
		IF p_quantity = v_source.quantity THEN
			UPDATE public.inventory_items
			SET owner_id = p_target_owner_id,
				equipped = false,
				attuned = false
			WHERE id = p_item_id AND campaign_id = p_campaign_id;
			v_result_id := p_item_id;
		ELSE
			v_source.id := gen_random_uuid()::text;
			v_source.owner_id := p_target_owner_id;
			v_source.quantity := p_quantity;
			v_source.equipped := false;
			v_source.attuned := false;
			INSERT INTO public.inventory_items SELECT v_source.*;
			UPDATE public.inventory_items
			SET quantity = quantity - p_quantity
			WHERE id = p_item_id AND campaign_id = p_campaign_id;
			v_result_id := v_source.id;
		END IF;
	END IF;

	SELECT array_agg(DISTINCT member.user_id)
	INTO v_related_users
	FROM public.campaign_members AS member
	WHERE member.campaign_id = p_campaign_id
		AND (
			member.user_id = auth.uid()
			OR (
				EXISTS (
					SELECT 1
					FROM public.characters AS source_character
					WHERE source_character.id = v_source_owner_id
						AND source_character.campaign_id = p_campaign_id
						AND source_character.user_id = member.user_id::text
				)
			)
			OR (
				v_target_character.user_id IS NOT NULL
				AND member.user_id::text = v_target_character.user_id
			)
		);
	PERFORM public.campaign_activity_log_append(
		v_event_id,
		p_campaign_id,
		'item_transferred',
		auth.uid(),
		COALESCE(v_related_users, '{}'::uuid[]),
		ARRAY[v_source_owner_id, p_target_owner_id],
		v_source.is_private,
		CASE WHEN v_source.is_private
			THEN '私人背包物品已移轉。'
			ELSE '背包物品已移轉。'
		END,
		jsonb_build_object(
			'sourceCharacterId', v_source_owner_id,
			'targetCharacterId', p_target_owner_id,
			'itemId', v_source_item_id,
			'itemName', v_source.name,
			'quantity', p_quantity,
			'blacksmithItemId', v_source.blacksmith_item_id
		)
	);
	RETURN v_result_id;
END
$transfer_inventory_item$;

REVOKE ALL ON FUNCTION public.transfer_inventory_item(
	text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_inventory_item(
	text, text, text, integer
) TO authenticated;
REVOKE ALL ON FUNCTION public.transfer_inventory_item_before_activity_log(
	text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.transfer_campaign_currency(
	p_campaign_id text,
	p_source_character_id text,
	p_source_wallet text,
	p_target_character_id text,
	p_target_wallet text,
	p_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $transfer_campaign_currency$
DECLARE
	v_actor_id uuid := auth.uid();
	v_source_owner text;
	v_source_gp numeric;
	v_target_gp numeric;
	v_source_cents bigint;
	v_share_cents bigint;
	v_remainder_cents bigint;
	v_recipient_count integer;
	v_recipient_ids text[] := '{}'::text[];
	v_related_users uuid[];
	v_is_private boolean;
	v_amount_gp numeric;
	v_event_id text := gen_random_uuid()::text;
BEGIN
	IF v_actor_id IS NULL
		OR p_campaign_id IS NULL OR btrim(p_campaign_id) = ''
		OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役轉帳。' USING ERRCODE = '42501';
	END IF;
	IF p_source_character_id IS NULL
		OR p_source_wallet IS NULL
		OR p_target_wallet IS NULL
		OR p_source_wallet NOT IN ('public', 'private')
		OR p_target_wallet NOT IN ('public', 'private')
		OR p_amount_cents IS NULL
		OR p_amount_cents < 1
		OR p_amount_cents > 100000000 THEN
		RAISE EXCEPTION '轉帳來源、目標或金額無效。' USING ERRCODE = '22023';
	END IF;
	IF p_source_character_id = 'camp-chest'
		AND p_source_wallet <> 'public' THEN
		RAISE EXCEPTION '營地儲物箱只有公開錢包。' USING ERRCODE = '22023';
	END IF;
	IF (p_target_character_id IS NULL
			OR p_target_character_id = 'camp-chest')
		AND p_target_wallet <> 'public' THEN
		RAISE EXCEPTION '營地儲物箱與分配轉帳只支援公開錢包。'
			USING ERRCODE = '22023';
	END IF;
	IF p_source_wallet = 'public' AND p_target_wallet = 'private' THEN
		RAISE EXCEPTION '公開錢包不可轉入私人錢包。'
			USING ERRCODE = '42501';
	END IF;
	IF p_target_wallet = 'private'
		AND (p_source_wallet <> 'private'
			OR p_target_character_id IS NULL
			OR p_target_character_id = 'camp-chest') THEN
		RAISE EXCEPTION '只有私人錢包可以轉入角色私人錢包。'
			USING ERRCODE = '42501';
	END IF;
	IF p_target_character_id = p_source_character_id
		AND NOT (
			p_source_wallet = 'private'
			AND p_target_wallet = 'public'
		) THEN
		RAISE EXCEPTION '不可轉帳至相同錢包。' USING ERRCODE = '22023';
	END IF;

	PERFORM 1
	FROM public.characters AS character
	WHERE character.campaign_id = p_campaign_id
		AND (
			character.id = p_source_character_id
			OR character.id = p_target_character_id
			OR (
				p_target_character_id IS NULL
				AND character.id <> p_source_character_id
			)
		)
	ORDER BY character.id
	FOR UPDATE;

	IF p_source_character_id <> 'camp-chest' THEN
		SELECT character.user_id
		INTO v_source_owner
		FROM public.characters AS character
		WHERE character.id = p_source_character_id
			AND character.campaign_id = p_campaign_id;
		IF NOT FOUND THEN
			RAISE EXCEPTION '轉帳來源不存在或不屬於此戰役。'
				USING ERRCODE = '22023';
		END IF;

		IF NOT public.is_campaign_dm(p_campaign_id)
			AND v_source_owner <> v_actor_id::text THEN
			PERFORM 1
			FROM public.character_permissions AS permission
			WHERE permission.campaign_id = p_campaign_id
				AND permission.character_id = p_source_character_id
				AND permission.user_id = v_actor_id
				AND CASE WHEN p_source_wallet = 'public'
					THEN permission.public_wallet_access
					ELSE permission.private_wallet_access
				END = 2
			FOR SHARE;
			IF NOT FOUND THEN
				RAISE EXCEPTION '沒有來源錢包的修改權限。'
					USING ERRCODE = '42501';
			END IF;
		END IF;
	END IF;

	IF p_target_character_id IS NOT NULL
		AND p_target_character_id <> 'camp-chest'
		AND NOT EXISTS (
			SELECT 1
			FROM public.characters AS character
			WHERE character.id = p_target_character_id
				AND character.campaign_id = p_campaign_id
		) THEN
		RAISE EXCEPTION '轉帳目標不存在或不屬於此戰役。'
			USING ERRCODE = '22023';
	END IF;

	IF p_source_character_id = 'camp-chest' THEN
		SELECT campaign.camp_chest_gp
		INTO v_source_gp
		FROM public.campaigns AS campaign
		WHERE campaign.id = p_campaign_id
		FOR UPDATE;
	ELSE
		SELECT CASE WHEN p_source_wallet = 'public'
			THEN character.gp ELSE character.private_gp END
		INTO v_source_gp
		FROM public.characters AS character
		WHERE character.id = p_source_character_id
			AND character.campaign_id = p_campaign_id;
	END IF;
	IF v_source_gp IS NULL THEN
		RAISE EXCEPTION '轉帳來源不存在或不屬於此戰役。'
			USING ERRCODE = '22023';
	END IF;
	v_source_cents := (v_source_gp * 100)::bigint;
	IF v_source_gp * 100 <> v_source_cents
		OR v_source_cents < p_amount_cents THEN
		RAISE EXCEPTION '來源錢包餘額不足或精度無效。'
			USING ERRCODE = '23514';
	END IF;

	IF p_target_character_id IS NULL THEN
		SELECT array_agg(character.id ORDER BY character.id),
			count(*)::integer
		INTO v_recipient_ids, v_recipient_count
		FROM public.characters AS character
		WHERE character.campaign_id = p_campaign_id
			AND character.id <> p_source_character_id;
		IF COALESCE(v_recipient_count, 0) = 0 THEN
			RAISE EXCEPTION '沒有可平分轉帳的其他角色。'
				USING ERRCODE = '22023';
		END IF;
		v_share_cents := p_amount_cents / v_recipient_count;
		v_remainder_cents := p_amount_cents % v_recipient_count;
		IF v_share_cents < 1 THEN
			RAISE EXCEPTION '轉帳金額不足以分配給每名角色至少 0.01 GP。'
				USING ERRCODE = '22023';
		END IF;
		IF EXISTS (
			SELECT 1
			FROM public.characters AS character
			WHERE character.campaign_id = p_campaign_id
				AND character.id = ANY(v_recipient_ids)
				AND character.gp + v_share_cents / 100.0 > 1000000
		) THEN
			RAISE EXCEPTION '至少一名角色的公開錢包餘額將超過上限。'
				USING ERRCODE = '23514';
		END IF;
	ELSE
		v_recipient_ids := CASE
			WHEN p_target_character_id = 'camp-chest' THEN '{}'::text[]
			ELSE ARRAY[p_target_character_id]
		END;
		v_recipient_count := 1;
		v_share_cents := p_amount_cents;
		v_remainder_cents := 0;
		IF p_target_character_id = 'camp-chest' THEN
			SELECT campaign.camp_chest_gp
			INTO v_target_gp
			FROM public.campaigns AS campaign
			WHERE campaign.id = p_campaign_id
			FOR UPDATE;
		ELSE
			SELECT CASE WHEN p_target_wallet = 'public'
				THEN character.gp ELSE character.private_gp END
			INTO v_target_gp
			FROM public.characters AS character
			WHERE character.id = p_target_character_id
				AND character.campaign_id = p_campaign_id;
		END IF;
		IF v_target_gp IS NULL
			OR (v_target_gp * 100)::bigint + p_amount_cents > 100000000 THEN
			RAISE EXCEPTION '目標錢包不存在或餘額將超過上限。'
				USING ERRCODE = '23514';
		END IF;
	END IF;

	v_amount_gp := p_amount_cents / 100.0;
	v_is_private := p_source_wallet = 'private'
		OR p_target_wallet = 'private';
	IF p_source_character_id = 'camp-chest' THEN
		UPDATE public.campaigns AS campaign
		SET camp_chest_gp =
				(v_source_cents - p_amount_cents + v_remainder_cents) / 100.0,
			camp_chest_currency = public.campaign_activity_currency_projection(
				(v_source_cents - p_amount_cents + v_remainder_cents) / 100.0
			)
		WHERE campaign.id = p_campaign_id;
	ELSE
		UPDATE public.characters AS character
		SET gp = CASE WHEN p_source_wallet = 'public'
				THEN (v_source_cents - p_amount_cents + v_remainder_cents) / 100.0
				ELSE character.gp END,
			private_gp = CASE WHEN p_source_wallet = 'private'
				THEN (v_source_cents - p_amount_cents + v_remainder_cents) / 100.0
				ELSE character.private_gp END,
			currencies = CASE WHEN p_source_wallet = 'public'
				THEN public.campaign_activity_currency_projection(
					(v_source_cents - p_amount_cents + v_remainder_cents) / 100.0
				) ELSE character.currencies END,
			private_currencies = CASE WHEN p_source_wallet = 'private'
				THEN public.campaign_activity_currency_projection(
					(v_source_cents - p_amount_cents + v_remainder_cents) / 100.0
				) ELSE character.private_currencies END
		WHERE character.id = p_source_character_id
			AND character.campaign_id = p_campaign_id;
	END IF;

	IF p_target_character_id = 'camp-chest' THEN
		UPDATE public.campaigns AS campaign
		SET camp_chest_gp = v_target_gp + v_amount_gp,
			camp_chest_currency = public.campaign_activity_currency_projection(
				v_target_gp + v_amount_gp
			)
		WHERE campaign.id = p_campaign_id;
	ELSIF p_target_character_id IS NOT NULL THEN
		UPDATE public.characters AS character
		SET gp = CASE WHEN p_target_wallet = 'public'
				THEN v_target_gp + v_amount_gp ELSE character.gp END,
			private_gp = CASE WHEN p_target_wallet = 'private'
				THEN v_target_gp + v_amount_gp ELSE character.private_gp END,
			currencies = CASE WHEN p_target_wallet = 'public'
				THEN public.campaign_activity_currency_projection(
					v_target_gp + v_amount_gp
				) ELSE character.currencies END,
			private_currencies = CASE WHEN p_target_wallet = 'private'
				THEN public.campaign_activity_currency_projection(
					v_target_gp + v_amount_gp
				) ELSE character.private_currencies END
		WHERE character.id = p_target_character_id
			AND character.campaign_id = p_campaign_id;
	ELSE
		UPDATE public.characters AS character
		SET gp = character.gp + v_share_cents / 100.0,
			currencies = public.campaign_activity_currency_projection(
				character.gp + v_share_cents / 100.0
			)
		WHERE character.campaign_id = p_campaign_id
			AND character.id = ANY(v_recipient_ids);
	END IF;

	SELECT array_agg(DISTINCT member.user_id)
	INTO v_related_users
	FROM public.campaign_members AS member
	WHERE member.campaign_id = p_campaign_id
		AND (
			member.user_id = v_actor_id
			OR EXISTS (
				SELECT 1
				FROM public.characters AS character
				WHERE character.campaign_id = p_campaign_id
					AND character.id = ANY(
						array_append(v_recipient_ids, p_source_character_id)
					)
					AND character.user_id = member.user_id::text
			)
		);
	v_related_users := array_append(
		COALESCE(v_related_users, '{}'::uuid[]), v_actor_id
	);
	PERFORM public.campaign_activity_log_append(
		v_event_id,
		p_campaign_id,
		'currency_transferred',
		v_actor_id,
		v_related_users,
		array_append(v_recipient_ids, p_source_character_id),
		v_is_private,
		'GP 轉帳已完成。',
		jsonb_build_object(
			'sourceCharacterId', p_source_character_id,
			'sourceWallet', p_source_wallet,
			'targetCharacterId', p_target_character_id,
			'targetWallet', p_target_wallet,
			'amountCents', p_amount_cents,
			'shareCents', v_share_cents,
			'remainderCents', v_remainder_cents,
			'recipientCharacterIds', v_recipient_ids
		)
	);

	RETURN jsonb_build_object(
		'operationId', v_event_id,
		'shareCents', v_share_cents,
		'remainderCents', v_remainder_cents,
		'recipientCount', v_recipient_count
	);
END
$transfer_campaign_currency$;

REVOKE ALL ON FUNCTION public.transfer_campaign_currency(
	text, text, text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_campaign_currency(
	text, text, text, text, text, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.campaign_characters_notify_safe_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $campaign_characters_notify_safe_change$
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
$campaign_characters_notify_safe_change$;

REVOKE ALL ON FUNCTION public.campaign_characters_notify_safe_change()
	FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS characters_safe_change_broadcast
	ON public.characters;
CREATE TRIGGER characters_safe_change_broadcast
	AFTER INSERT OR UPDATE OR DELETE ON public.characters
	FOR EACH ROW
	EXECUTE FUNCTION public.campaign_characters_notify_safe_change();

DO $private_wallet_realtime_boundary$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_catalog.pg_publication
		WHERE pubname = 'supabase_realtime'
	) THEN
		RAISE EXCEPTION
			'私人錢包安全 migration 前置檢查失敗：找不到 supabase_realtime publication。';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM pg_catalog.pg_publication
		WHERE pubname = 'supabase_realtime'
			AND puballtables
	) OR EXISTS (
		SELECT 1
		FROM pg_catalog.pg_publication_namespace AS publication_namespace
		JOIN pg_catalog.pg_namespace AS namespace
			ON namespace.oid = publication_namespace.pnnspid
		JOIN pg_catalog.pg_publication AS publication
			ON publication.oid = publication_namespace.pnpubid
		WHERE publication.pubname = 'supabase_realtime'
			AND namespace.nspname = 'public'
	) THEN
		RAISE EXCEPTION
			'supabase_realtime 發布整個資料庫或 public schema，無法排除私人欄位。';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM pg_catalog.pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'characters'
	) THEN
		ALTER PUBLICATION supabase_realtime DROP TABLE public.characters;
	END IF;
	IF EXISTS (
		SELECT 1
		FROM pg_catalog.pg_publication_tables
		WHERE pubname = 'supabase_realtime'
			AND schemaname = 'public'
			AND tablename = 'inventory_items'
	) THEN
		ALTER PUBLICATION supabase_realtime DROP TABLE public.inventory_items;
	END IF;
END
$private_wallet_realtime_boundary$;
