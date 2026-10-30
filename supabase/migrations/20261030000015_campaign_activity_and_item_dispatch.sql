DO $campaign_activity_preflight$
DECLARE
	v_invalid_quantities bigint;
BEGIN
	SELECT count(*) INTO v_invalid_quantities
	FROM public.inventory_items
	WHERE quantity < 1 OR quantity > 1000000;
	IF v_invalid_quantities > 0 THEN
		RAISE EXCEPTION
			'背包中有 % 筆數量不在 1 至 1,000,000 的物品；請先人工修正資料。',
			v_invalid_quantities
			USING ERRCODE = '23514';
	END IF;

END
$campaign_activity_preflight$;

ALTER TABLE public.inventory_items
	ADD COLUMN blacksmith_item_id text;

UPDATE public.inventory_items
SET item_base = jsonb_set(item_base, '{isStackable}', 'false'::jsonb, true)
WHERE item_base IS NOT NULL
	AND jsonb_typeof(item_base) = 'object'
	AND jsonb_typeof(item_base -> 'isStackable')
		IS DISTINCT FROM 'boolean';

UPDATE public.blacksmith_items
SET item_base = jsonb_set(item_base, '{isStackable}', 'false'::jsonb, true)
WHERE item_base IS NOT NULL
	AND jsonb_typeof(item_base) = 'object'
	AND jsonb_typeof(item_base -> 'isStackable')
		IS DISTINCT FROM 'boolean';

ALTER FUNCTION public.is_valid_item_base(jsonb)
	RENAME TO is_valid_item_base_without_stackable;

CREATE FUNCTION public.is_valid_item_base(p_item_base jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $is_valid_item_base$
	SELECT jsonb_typeof(p_item_base -> 'isStackable')
			IS NOT DISTINCT FROM 'boolean'
		AND public.is_valid_item_base_without_stackable(p_item_base)
$is_valid_item_base$;

REVOKE ALL ON FUNCTION public.is_valid_item_base_without_stackable(jsonb)
	FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_item_base_without_stackable(jsonb)
	TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_valid_item_base(jsonb)
	FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_item_base(jsonb)
	TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ensure_item_base_stackability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $ensure_item_base_stackability$
BEGIN
	IF NEW.item_base IS NOT NULL AND NOT (NEW.item_base ? 'isStackable') THEN
		NEW.item_base := jsonb_set(
			NEW.item_base, '{isStackable}', 'false'::jsonb, true
		);
	END IF;
	RETURN NEW;
END
$ensure_item_base_stackability$;

CREATE TRIGGER zzz_inventory_items_ensure_stackability
	BEFORE INSERT OR UPDATE ON public.inventory_items
	FOR EACH ROW EXECUTE FUNCTION public.ensure_item_base_stackability();
CREATE TRIGGER zzz_blacksmith_items_ensure_stackability
	BEFORE INSERT OR UPDATE ON public.blacksmith_items
	FOR EACH ROW EXECUTE FUNCTION public.ensure_item_base_stackability();

ALTER TABLE public.inventory_items
	ADD CONSTRAINT inventory_items_quantity_range_check
		CHECK (quantity BETWEEN 1 AND 1000000),
	ADD CONSTRAINT inventory_items_blacksmith_item_id_format_check
		CHECK (
			blacksmith_item_id IS NULL
			OR (
				length(blacksmith_item_id) BETWEEN 1 AND 200
				AND blacksmith_item_id ~
					'^(rulebook:[^:]+:.+|workshop:[^:]+)$'
			)
		),
	ADD CONSTRAINT inventory_items_item_base_stackable_check
		CHECK (
			item_base IS NULL
			OR (
				jsonb_typeof(item_base -> 'isStackable')
					IS NOT DISTINCT FROM 'boolean'
				AND public.is_valid_item_base(item_base)
			)
		);

ALTER TABLE public.blacksmith_items
	ADD CONSTRAINT blacksmith_items_item_base_stackable_check
		CHECK (
			item_base IS NULL
			OR (
				jsonb_typeof(item_base -> 'isStackable')
					IS NOT DISTINCT FROM 'boolean'
				AND public.is_valid_item_base(item_base)
			)
		);

CREATE UNIQUE INDEX inventory_items_source_stack_unique
	ON public.inventory_items (
		campaign_id, owner_id, is_private, blacksmith_item_id
	)
	WHERE blacksmith_item_id IS NOT NULL
		AND item_base ->> 'isStackable' = 'true';

CREATE TABLE public.campaign_activity_log (
	id text PRIMARY KEY,
	campaign_id text NOT NULL
		REFERENCES public.campaigns(id) ON DELETE CASCADE,
	event_type text NOT NULL,
	actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	related_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
	related_character_ids text[] NOT NULL DEFAULT '{}'::text[],
	is_private boolean NOT NULL DEFAULT false,
	public_summary text NOT NULL
		CHECK (length(btrim(public_summary)) BETWEEN 1 AND 500),
	payload jsonb NOT NULL DEFAULT '{}'::jsonb
		CHECK (jsonb_typeof(payload) = 'object'),
	created_at timestamptz NOT NULL
);

CREATE INDEX campaign_activity_log_recent_idx
	ON public.campaign_activity_log (campaign_id, created_at DESC, id DESC);

ALTER TABLE public.campaign_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_activity_log_member_read
	ON public.campaign_activity_log
	FOR SELECT TO authenticated
	USING (
		public.is_campaign_member_or_dm(campaign_id)
		AND (
			public.is_campaign_dm(campaign_id)
			OR NOT is_private
			OR actor_user_id = auth.uid()
			OR auth.uid() = ANY (related_user_ids)
		)
	);

REVOKE ALL ON public.campaign_activity_log
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.campaign_activity_log TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.campaign_activity_log_append(
	p_id text,
	p_campaign_id text,
	p_event_type text,
	p_actor_user_id uuid,
	p_related_user_ids uuid[],
	p_related_character_ids text[],
	p_is_private boolean,
	p_public_summary text,
	p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_activity_log_append$
BEGIN
	IF p_id IS NULL OR length(p_id) NOT BETWEEN 1 AND 200
		OR p_campaign_id IS NULL OR length(p_campaign_id) NOT BETWEEN 1 AND 200
		OR p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 80
		OR p_actor_user_id IS NULL OR p_public_summary IS NULL
		OR length(btrim(p_public_summary)) NOT BETWEEN 1 AND 500
		OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
		RAISE EXCEPTION '戰役操作紀錄格式無效。' USING ERRCODE = '22023';
	END IF;

	PERFORM pg_advisory_xact_lock(
		hashtextextended('campaign_activity:' || p_campaign_id, 0)
	);
	INSERT INTO public.campaign_activity_log (
		id, campaign_id, event_type, actor_user_id, related_user_ids,
		related_character_ids, is_private, public_summary, payload, created_at
	)
	VALUES (
		p_id, p_campaign_id, p_event_type, p_actor_user_id,
		COALESCE(p_related_user_ids, '{}'::uuid[]),
		COALESCE(p_related_character_ids, '{}'::text[]),
		COALESCE(p_is_private, false), p_public_summary, p_payload,
		clock_timestamp()
	);

	DELETE FROM public.campaign_activity_log AS old_event
	WHERE old_event.campaign_id = p_campaign_id
		AND old_event.id NOT IN (
			SELECT retained.id
			FROM public.campaign_activity_log AS retained
			WHERE retained.campaign_id = p_campaign_id
			ORDER BY retained.created_at DESC, retained.id DESC
			OFFSET 100
		);
END
$campaign_activity_log_append$;

REVOKE ALL ON FUNCTION public.campaign_activity_log_append(
	text, text, text, uuid, uuid[], text[], boolean, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.campaign_activity_currency_projection(
	p_gp numeric
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $campaign_activity_currency_projection$
DECLARE
	v_cents numeric;
BEGIN
	IF p_gp IS NULL OR p_gp < 0 OR p_gp > 1000000
		OR p_gp <> trunc(p_gp, 2) THEN
		RAISE EXCEPTION 'GP 餘額無效。' USING ERRCODE = '22023';
	END IF;
	v_cents := p_gp * 100;
	RETURN jsonb_build_object(
		'pp', 0,
		'gp', floor(v_cents / 100)::bigint,
		'ep', 0,
		'sp', 0,
		'cp', mod(v_cents, 100)::bigint
	);
END
$campaign_activity_currency_projection$;

REVOKE ALL ON FUNCTION public.campaign_activity_currency_projection(numeric)
	FROM PUBLIC, anon, authenticated, service_role;

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
	v_source_gp numeric;
	v_target_gp numeric;
	v_source_cents bigint;
	v_target_cents bigint;
	v_source_owner text;
	v_source_wallet_access smallint;
	v_share_cents bigint;
	v_remainder_cents bigint;
	v_recipient_count integer;
	v_recipient_ids text[];
	v_related_users uuid[];
	v_source_name text;
	v_target_name text;
	v_is_private boolean;
	v_event_id text := gen_random_uuid()::text;
	v_amount_gp numeric;
BEGIN
	IF v_actor_id IS NULL OR NOT public.is_campaign_member_or_dm(p_campaign_id) THEN
		RAISE EXCEPTION '無權在此戰役轉帳。' USING ERRCODE = '42501';
	END IF;
	IF p_source_wallet IS NULL OR p_source_wallet NOT IN ('public', 'private')
		OR p_target_wallet IS NULL OR p_target_wallet NOT IN ('public', 'private')
		OR p_source_character_id IS NULL
		OR p_target_character_id = p_source_character_id
		OR p_amount_cents IS NULL
		OR p_amount_cents < 1
		OR p_amount_cents > 100000000 THEN
		RAISE EXCEPTION '轉帳來源、目標或金額無效。' USING ERRCODE = '22023';
	END IF;
	IF p_source_character_id = 'camp-chest'
		AND p_source_wallet <> 'public' THEN
		RAISE EXCEPTION '營地儲物箱只有公開錢包。' USING ERRCODE = '22023';
	END IF;
	IF (p_target_character_id IS NULL OR p_target_character_id = 'camp-chest')
		AND p_target_wallet <> 'public' THEN
		RAISE EXCEPTION '平分轉帳與營地儲物箱只支援公開錢包。'
			USING ERRCODE = '22023';
	END IF;

	IF p_source_character_id <> 'camp-chest' THEN
		SELECT character.user_id INTO v_source_owner
		FROM public.characters AS character
		WHERE character.id = p_source_character_id
			AND character.campaign_id = p_campaign_id;
		IF NOT FOUND THEN
			RAISE EXCEPTION '轉帳來源不存在或不屬於此戰役。'
				USING ERRCODE = '22023';
		END IF;
		IF NOT public.is_campaign_dm(p_campaign_id)
			AND v_source_owner <> v_actor_id::text THEN
			SELECT CASE WHEN p_source_wallet = 'public'
				THEN max(permission.public_wallet_access)
				ELSE max(permission.private_wallet_access)
			END
			INTO v_source_wallet_access
			FROM public.character_permissions AS permission
			WHERE permission.campaign_id = p_campaign_id
				AND permission.character_id = p_source_character_id
				AND permission.user_id = v_actor_id;
			IF COALESCE(v_source_wallet_access, 0) <> 2 THEN
				RAISE EXCEPTION '沒有來源錢包的修改權限。'
					USING ERRCODE = '42501';
			END IF;
		END IF;
	END IF;
	IF p_target_character_id IS NOT NULL
		AND p_target_character_id <> 'camp-chest'
		AND NOT EXISTS (
			SELECT 1 FROM public.characters AS character
			WHERE character.id = p_target_character_id
				AND character.campaign_id = p_campaign_id
		) THEN
		RAISE EXCEPTION '轉帳目標不存在或不屬於此戰役。'
			USING ERRCODE = '22023';
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

	IF p_source_character_id = 'camp-chest' THEN
		SELECT campaign.camp_chest_gp INTO v_source_gp
		FROM public.campaigns AS campaign
		WHERE campaign.id = p_campaign_id
		FOR UPDATE;
		v_source_name := '營地儲物箱';
	ELSE
		SELECT
			CASE WHEN p_source_wallet = 'public'
				THEN character.gp ELSE character.private_gp END,
			character.name
		INTO v_source_gp, v_source_name
		FROM public.characters AS character
		WHERE character.id = p_source_character_id
			AND character.campaign_id = p_campaign_id
		FOR UPDATE;
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

	v_is_private := p_source_wallet = 'private'
		OR p_target_wallet = 'private';
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
			SELECT 1 FROM public.characters AS character
			WHERE character.campaign_id = p_campaign_id
				AND character.id = ANY(v_recipient_ids)
				AND (character.gp + v_share_cents / 100.0) > 1000000
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
			SELECT campaign.camp_chest_gp INTO v_target_gp
			FROM public.campaigns AS campaign
			WHERE campaign.id = p_campaign_id
			FOR UPDATE;
			v_target_name := '營地儲物箱';
		ELSE
			SELECT
				CASE WHEN p_target_wallet = 'public'
					THEN character.gp ELSE character.private_gp END,
				character.name
			INTO v_target_gp, v_target_name
			FROM public.characters AS character
			WHERE character.id = p_target_character_id
				AND character.campaign_id = p_campaign_id
			FOR UPDATE;
		END IF;
		IF v_target_gp IS NULL
			OR (v_target_gp * 100)::bigint + p_amount_cents > 100000000 THEN
			RAISE EXCEPTION '目標錢包不存在或餘額將超過上限。'
				USING ERRCODE = '23514';
		END IF;
	END IF;

	v_amount_gp := p_amount_cents / 100.0;
	IF p_source_character_id = 'camp-chest' THEN
		UPDATE public.campaigns AS campaign
		SET camp_chest_gp = (v_source_cents - p_amount_cents + v_remainder_cents) / 100.0,
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
				THEN public.campaign_activity_currency_projection(v_target_gp + v_amount_gp)
				ELSE character.currencies END,
			private_currencies = CASE WHEN p_target_wallet = 'private'
				THEN public.campaign_activity_currency_projection(v_target_gp + v_amount_gp)
				ELSE character.private_currencies END
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
				SELECT 1 FROM public.characters AS character
				WHERE character.campaign_id = p_campaign_id
					AND character.id = ANY(
						array_append(v_recipient_ids, p_source_character_id)
					)
					AND character.user_id = member.user_id::text
			)
		);
	v_related_users := array_append(COALESCE(v_related_users, '{}'::uuid[]), v_actor_id);
	PERFORM public.campaign_activity_log_append(
		v_event_id, p_campaign_id, 'currency_transferred', v_actor_id,
		v_related_users,
		array_append(
			COALESCE(v_recipient_ids, '{}'::text[]), p_source_character_id
		),
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
			'recipientCharacterIds', COALESCE(v_recipient_ids, '{}'::text[])
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
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_campaign_currency(
	text, text, text, text, text, integer
) TO authenticated;

ALTER FUNCTION public.transfer_inventory_item(text, text, text, integer)
	RENAME TO transfer_inventory_item_before_activity_log;
REVOKE ALL ON FUNCTION public.transfer_inventory_item_before_activity_log(
	text, text, text, integer
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.transfer_inventory_item(
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
	v_result_id text;
	v_event_id text := gen_random_uuid()::text;
	v_related_users uuid[];
	v_is_private boolean;
BEGIN
	SELECT item.* INTO v_source
	FROM public.inventory_items AS item
	WHERE item.id = p_item_id AND item.campaign_id = p_campaign_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION '物品不存在或不屬於此戰役。' USING ERRCODE = '22023';
	END IF;
	IF p_target_owner_id <> 'camp-chest' THEN
		SELECT character.* INTO v_target_character
		FROM public.characters AS character
		WHERE character.id = p_target_owner_id
			AND character.campaign_id = p_campaign_id;
	END IF;

	v_result_id := public.transfer_inventory_item_before_activity_log(
		p_campaign_id, p_item_id, p_target_owner_id, p_quantity
	);
	v_is_private := v_source.is_private;
	SELECT array_agg(DISTINCT member.user_id)
	INTO v_related_users
	FROM public.campaign_members AS member
	WHERE member.campaign_id = p_campaign_id
		AND (
			member.user_id = auth.uid()
			OR (
				v_target_character.user_id IS NOT NULL
				AND member.user_id::text = v_target_character.user_id
			)
		);
	PERFORM public.campaign_activity_log_append(
		v_event_id, p_campaign_id, 'item_transferred', auth.uid(),
		COALESCE(v_related_users, '{}'::uuid[]),
		ARRAY[v_source.owner_id, p_target_owner_id],
		v_is_private,
		CASE WHEN v_is_private THEN '私人背包物品已移轉。'
			ELSE '背包物品已移轉。' END,
		jsonb_build_object(
			'sourceCharacterId', v_source.owner_id,
			'targetCharacterId', p_target_owner_id,
			'itemId', v_source.id,
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
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_inventory_item(
	text, text, text, integer
) TO authenticated;

CREATE FUNCTION public.is_valid_dispatch_item_base(p_item_base jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $is_valid_dispatch_item_base$
	SELECT CASE
		WHEN public.is_valid_item_base(p_item_base) THEN
			NOT EXISTS (
				SELECT 1
				FROM jsonb_object_keys(p_item_base) AS key(name)
				WHERE key.name NOT IN (
					'name', 'category', 'subTypes', 'rarity', 'icon', 'weight',
					'valueGp', 'affixes', 'effects', 'flavor', 'dmNotes',
					'maxCharges', 'isEquippable', 'isConsumable',
					'isRequireAttunement', 'isStackable', 'weaponProperties',
					'armorProperties'
				)
			)
			AND (
				p_item_base ->> 'category' = 'Weapon'
				OR NOT (p_item_base ? 'weaponProperties')
			)
			AND (
				p_item_base ->> 'category' = 'Armor'
				OR NOT (p_item_base ? 'armorProperties')
			)
			AND CASE
				WHEN jsonb_typeof(p_item_base -> 'weaponProperties') = 'object'
					THEN NOT EXISTS (
						SELECT 1
						FROM jsonb_object_keys(p_item_base -> 'weaponProperties') AS key(name)
						WHERE key.name NOT IN ('damage', 'mastery', 'properties')
					)
				ELSE true
			END
			AND CASE
				WHEN jsonb_typeof(p_item_base -> 'armorProperties') = 'object'
					THEN NOT EXISTS (
						SELECT 1
						FROM jsonb_object_keys(p_item_base -> 'armorProperties') AS key(name)
						WHERE key.name <> 'ac'
					)
				ELSE true
			END
			AND NOT EXISTS (
				SELECT 1
				FROM jsonb_array_elements(p_item_base -> 'affixes') AS affix(value)
				WHERE jsonb_typeof(affix.value) = 'object'
					AND EXISTS (
						SELECT 1
						FROM jsonb_object_keys(affix.value) AS key(name)
						WHERE key.name NOT IN ('id', 'name', 'desc', 'isHidden')
					)
			)
		ELSE false
	END
$is_valid_dispatch_item_base$;

REVOKE ALL ON FUNCTION public.is_valid_dispatch_item_base(jsonb)
	FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_campaign_items(
	p_request_id text,
	p_campaign_id text,
	p_owner_id text,
	p_is_private boolean,
	p_reason text,
	p_items jsonb,
	p_confirm_large_batch boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $dispatch_campaign_items$
DECLARE
	v_actor_id uuid := auth.uid();
	v_line record;
	v_item_base jsonb;
	v_source_id text;
	v_quantity bigint;
	v_item_id text;
	v_existing public.inventory_items%ROWTYPE;
	v_new_count integer := 0;
	v_inserted_count integer := 0;
	v_updated_count integer := 0;
	v_affected_ids text[] := '{}'::text[];
	v_total_quantity bigint;
	v_result jsonb;
	v_payload jsonb;
	v_homebrew boolean;
	v_is_important boolean;
	v_category text;
	v_icon text;
	v_index integer;
	v_private_event boolean;
BEGIN
	IF v_actor_id IS NULL OR NOT public.is_campaign_dm(p_campaign_id) THEN
		RAISE EXCEPTION '只有該戰役 DM 可以派發物品。' USING ERRCODE = '42501';
	END IF;
	IF p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 1 AND 200
		OR p_owner_id IS NULL OR length(p_owner_id) NOT BETWEEN 1 AND 200
		OR p_is_private IS NULL
		OR p_reason IS NOT NULL AND length(p_reason) > 200
		OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
		RAISE EXCEPTION '派發請求欄位或數量無效。' USING ERRCODE = '22023';
	END IF;
	IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 10 THEN
		RAISE EXCEPTION '派發請求必須包含 1 至 10 列物品。'
			USING ERRCODE = '22023';
	END IF;
	IF p_owner_id = 'camp-chest' AND p_is_private THEN
		RAISE EXCEPTION '營地儲物箱只能接收公開物品。' USING ERRCODE = '22023';
	END IF;
	IF p_owner_id <> 'camp-chest' AND NOT EXISTS (
		SELECT 1 FROM public.characters AS character
		WHERE character.id = p_owner_id
			AND character.campaign_id = p_campaign_id
	) THEN
		RAISE EXCEPTION '接收角色不存在或不屬於此戰役。'
			USING ERRCODE = '22023';
	END IF;
	IF EXISTS (
		SELECT 1 FROM jsonb_array_elements(p_items) AS line(value)
		WHERE jsonb_typeof(line.value) IS DISTINCT FROM 'object'
			OR CASE WHEN jsonb_typeof(line.value) = 'object' THEN EXISTS (
				SELECT 1 FROM jsonb_object_keys(line.value) AS key(name)
				WHERE key.name NOT IN (
					'itemBase', 'blacksmithItemId', 'isHomebrew',
					'isImportant', 'quantity'
				)
			) ELSE false END
			OR jsonb_typeof(line.value -> 'itemBase') IS DISTINCT FROM 'object'
			OR CASE
				WHEN jsonb_typeof(line.value -> 'itemBase') = 'object' THEN EXISTS (
					SELECT 1
					FROM jsonb_object_keys(line.value -> 'itemBase') AS key(name)
					WHERE key.name NOT IN (
						'name', 'category', 'subTypes', 'rarity', 'icon', 'weight',
						'valueGp', 'affixes', 'effects', 'flavor', 'dmNotes',
						'maxCharges', 'isEquippable', 'isConsumable',
						'isRequireAttunement', 'isStackable', 'weaponProperties',
						'armorProperties'
					)
				)
				ELSE false
			END
			OR NOT public.is_valid_dispatch_item_base(line.value -> 'itemBase')
			OR jsonb_typeof(line.value -> 'isHomebrew')
				IS DISTINCT FROM 'boolean'
			OR jsonb_typeof(line.value -> 'isImportant')
				IS DISTINCT FROM 'boolean'
			OR (
				line.value ? 'blacksmithItemId'
				AND jsonb_typeof(line.value -> 'blacksmithItemId')
					NOT IN ('string', 'null')
			)
			OR (
				line.value ->> 'blacksmithItemId' IS NOT NULL
				AND (
					length(line.value ->> 'blacksmithItemId') NOT BETWEEN 1 AND 200
					OR line.value ->> 'blacksmithItemId' !~
						'^(rulebook:[^:]+:.+|workshop:[^:]+)$'
				)
			)
			OR COALESCE(line.value ->> 'quantity', '') !~ '^[1-9][0-9]{0,6}$'
			OR CASE
				WHEN (line.value ->> 'quantity') ~ '^[1-9][0-9]{0,6}$'
				THEN CASE
					WHEN (line.value -> 'itemBase' ->> 'isStackable')::boolean
						THEN (line.value ->> 'quantity')::bigint > 1000000
					ELSE (line.value ->> 'quantity')::bigint > 20
				END
				ELSE false
			END
	) THEN
		RAISE EXCEPTION '派發物品定義、來源 ID 或數量無效。'
			USING ERRCODE = '22023';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_items) AS line(value)
		WHERE line.value ->> 'blacksmithItemId' LIKE 'workshop:%'
			AND NOT EXISTS (
				SELECT 1
				FROM public.blacksmith_items AS source
				WHERE source.id = split_part(
					line.value ->> 'blacksmithItemId', ':', 2
				)
					AND source.item_base = line.value -> 'itemBase'
					AND source.is_homebrew =
						(line.value ->> 'isHomebrew')::boolean
					AND source.is_important =
						(line.value ->> 'isImportant')::boolean
					AND (
						source.owner_id = v_actor_id::text
						OR source.is_shared IS TRUE
					)
			)
			OR (
				line.value ->> 'blacksmithItemId' LIKE 'rulebook:%'
				AND (
					(line.value ->> 'isHomebrew')::boolean
					OR (line.value ->> 'isImportant')::boolean
				)
			)
	) THEN
		RAISE EXCEPTION '鍛造工坊來源不存在、不可見或定義已變更。'
			USING ERRCODE = '22023';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM jsonb_to_recordset(p_items)
			AS line(
				"itemBase" jsonb, "blacksmithItemId" text,
				"isHomebrew" boolean, "isImportant" boolean, quantity integer
			)
		WHERE line."blacksmithItemId" IS NOT NULL
		GROUP BY line."blacksmithItemId"
		HAVING count(DISTINCT jsonb_build_array(
			line."itemBase", line."isHomebrew", line."isImportant"
		)) > 1
	) THEN
		RAISE EXCEPTION '同一來源 ID 不可對應多種物品定義。'
			USING ERRCODE = '22023';
	END IF;

	PERFORM pg_advisory_xact_lock(
		hashtextextended('campaign_dispatch:' || p_campaign_id, 0)
	);
	SELECT jsonb_build_object(
		'operationId', event.id,
		'insertedCount', (event.payload ->> 'insertedCount')::integer,
		'updatedCount', (event.payload ->> 'updatedCount')::integer,
		'inventoryIds', event.payload -> 'inventoryIds',
		'replayed', true
	)
	INTO v_result
	FROM public.campaign_activity_log AS event
	WHERE event.id = p_request_id
		AND event.campaign_id = p_campaign_id
		AND event.event_type = 'item_dispatched'
		AND event.actor_user_id = v_actor_id;
	IF FOUND THEN
		RETURN v_result;
	END IF;
	IF EXISTS (
		SELECT 1 FROM public.campaign_activity_log AS event
		WHERE event.id = p_request_id
	) THEN
		RAISE EXCEPTION '派發識別碼已被其他操作使用。'
			USING ERRCODE = '23505';
	END IF;

	FOR v_line IN
		SELECT
			line.value -> 'itemBase' AS item_base,
			line.value ->> 'blacksmithItemId' AS source_id,
			(line.value ->> 'isHomebrew')::boolean AS is_homebrew,
			(line.value ->> 'isImportant')::boolean AS is_important,
			sum((line.value ->> 'quantity')::bigint) AS quantity
		FROM jsonb_array_elements(p_items) AS line(value)
		WHERE line.value ->> 'blacksmithItemId' IS NOT NULL
			AND line.value -> 'itemBase' ->> 'isStackable' = 'true'
		GROUP BY line.value ->> 'blacksmithItemId', line.value -> 'itemBase',
			line.value ->> 'isHomebrew', line.value ->> 'isImportant'
		ORDER BY line.value ->> 'blacksmithItemId'
	LOOP
		IF v_line.quantity > 1000000 THEN
			RAISE EXCEPTION '合併後的堆疊數量超過 1,000,000。'
				USING ERRCODE = '22003';
		END IF;
		SELECT item.* INTO v_existing
		FROM public.inventory_items AS item
		WHERE item.campaign_id = p_campaign_id
			AND item.owner_id = p_owner_id
			AND item.is_private = p_is_private
			AND item.blacksmith_item_id = v_line.source_id
		FOR UPDATE;
		IF FOUND THEN
			IF v_existing.item_base IS DISTINCT FROM v_line.item_base THEN
				RAISE EXCEPTION '來源 ID 與既有物品定義不一致。'
					USING ERRCODE = '23514';
			END IF;
			IF v_existing.is_homebrew IS DISTINCT FROM v_line.is_homebrew
				OR v_existing.is_important IS DISTINCT FROM v_line.is_important THEN
				RAISE EXCEPTION '來源 ID 與既有物品標記不一致。'
					USING ERRCODE = '23514';
			END IF;
			IF v_existing.equipped OR v_existing.attuned
				OR v_existing.charges <> 0 OR v_existing.max_charges <> 0 THEN
				RAISE EXCEPTION '已裝備、同調或帶有充能的物品不可合併堆疊。'
					USING ERRCODE = '23514';
			END IF;
			IF v_existing.quantity + v_line.quantity > 1000000 THEN
				RAISE EXCEPTION '更新後的堆疊數量超過 1,000,000。'
					USING ERRCODE = '22003';
			END IF;
			v_updated_count := v_updated_count + 1;
		ELSE
			v_new_count := v_new_count + 1;
		END IF;
	END LOOP;

	FOR v_line IN
		SELECT line.value -> 'itemBase' AS item_base,
			line.value ->> 'blacksmithItemId' AS source_id,
			(line.value ->> 'isHomebrew')::boolean AS is_homebrew,
			(line.value ->> 'isImportant')::boolean AS is_important,
			(line.value ->> 'quantity')::integer AS quantity
		FROM jsonb_array_elements(p_items) AS line(value)
		WHERE line.value ->> 'blacksmithItemId' IS NULL
			OR line.value -> 'itemBase' ->> 'isStackable' <> 'true'
	LOOP
		IF v_line.source_id IS NULL
			AND v_line.item_base ->> 'isStackable' = 'true' THEN
			v_new_count := v_new_count + 1;
		ELSE
			v_new_count := v_new_count + v_line.quantity;
		END IF;
	END LOOP;

	IF v_new_count > 20 THEN
		RAISE EXCEPTION '單次派發最多新增 20 筆背包物品。'
			USING ERRCODE = '22023';
	END IF;
	IF v_new_count > 10 AND NOT COALESCE(p_confirm_large_batch, false) THEN
		RETURN jsonb_build_object(
			'requiresConfirmation', true,
			'predictedInsertCount', v_new_count
		);
	END IF;

	FOR v_line IN
		SELECT
			line.value -> 'itemBase' AS item_base,
			line.value ->> 'blacksmithItemId' AS source_id,
			(line.value ->> 'isHomebrew')::boolean AS is_homebrew,
			(line.value ->> 'isImportant')::boolean AS is_important,
			sum((line.value ->> 'quantity')::bigint) AS quantity
		FROM jsonb_array_elements(p_items) AS line(value)
		WHERE line.value ->> 'blacksmithItemId' IS NOT NULL
			AND line.value -> 'itemBase' ->> 'isStackable' = 'true'
		GROUP BY line.value ->> 'blacksmithItemId', line.value -> 'itemBase',
			line.value ->> 'isHomebrew', line.value ->> 'isImportant'
		ORDER BY line.value ->> 'blacksmithItemId'
	LOOP
		SELECT item.* INTO v_existing
		FROM public.inventory_items AS item
		WHERE item.campaign_id = p_campaign_id
			AND item.owner_id = p_owner_id
			AND item.is_private = p_is_private
			AND item.blacksmith_item_id = v_line.source_id
		FOR UPDATE;
		IF FOUND THEN
			UPDATE public.inventory_items
			SET quantity = quantity + v_line.quantity
			WHERE id = v_existing.id AND campaign_id = p_campaign_id;
			v_item_id := v_existing.id;
		ELSE
			v_item_base := v_line.item_base;
			v_source_id := v_line.source_id;
			v_quantity := v_line.quantity;
			v_item_id := gen_random_uuid()::text;
			v_category := v_item_base ->> 'category';
			v_icon := COALESCE(v_item_base ->> 'icon', 'Package');
			v_homebrew := v_line.is_homebrew;
			v_is_important := v_line.is_important;
			INSERT INTO public.inventory_items (
				id, campaign_id, owner_id, slot, name, category, sub_type, rarity,
				icon, damage, mastery, ac, weight, value_gp, quantity, equipped,
				requires_attunement, attuned, is_homebrew, is_identified, charges,
				max_charges, effects, flavor, dm_notes, player_notes, is_private,
				is_equippable, is_consumable, is_important, affixes, item_base,
				blacksmith_item_id
			)
			VALUES (
				v_item_id, p_campaign_id, p_owner_id, 0,
				v_item_base ->> 'name',
				CASE
					WHEN v_category IN ('Weapon', 'Armor') THEN v_category
					WHEN COALESCE((v_item_base ->> 'isConsumable')::boolean, false)
						OR v_category IN ('Potion', 'Poison', 'Scroll')
						THEN 'Consumable'
					ELSE 'Misc'
				END,
				COALESCE(v_item_base #>> '{subTypes,0}', ''),
				v_item_base ->> 'rarity', v_icon,
				v_item_base #>> '{weaponProperties,damage}',
				COALESCE(v_item_base #>> '{weaponProperties,mastery}', 'None'),
				v_item_base #>> '{armorProperties,ac}',
				(v_item_base ->> 'weight')::numeric,
				(v_item_base ->> 'valueGp')::numeric, v_quantity, false,
				COALESCE((v_item_base ->> 'isRequireAttunement')::boolean, false),
				false, v_homebrew, true, 0,
				COALESCE((v_item_base ->> 'maxCharges')::integer, 0),
				COALESCE(v_item_base ->> 'effects', ''),
				COALESCE(v_item_base ->> 'flavor', ''),
				COALESCE(v_item_base ->> 'dmNotes', ''), '', p_is_private,
				COALESCE((v_item_base ->> 'isEquippable')::boolean, false),
				COALESCE((v_item_base ->> 'isConsumable')::boolean, false),
				v_is_important, COALESCE(v_item_base -> 'affixes', '[]'::jsonb),
				v_item_base, v_source_id
			);
			v_inserted_count := v_inserted_count + 1;
		END IF;
		v_affected_ids := array_append(v_affected_ids, v_item_id);
	END LOOP;

	FOR v_line IN
		SELECT
			line.value -> 'itemBase' AS item_base,
			line.value ->> 'blacksmithItemId' AS source_id,
			(line.value ->> 'isHomebrew')::boolean AS is_homebrew,
			(line.value ->> 'isImportant')::boolean AS is_important,
			(line.value ->> 'quantity')::integer AS quantity
		FROM jsonb_array_elements(p_items) AS line(value)
		WHERE line.value ->> 'blacksmithItemId' IS NULL
			OR line.value -> 'itemBase' ->> 'isStackable' <> 'true'
	LOOP
		v_item_base := v_line.item_base;
		v_source_id := v_line.source_id;
		v_category := v_item_base ->> 'category';
		v_icon := COALESCE(v_item_base ->> 'icon', 'Package');
		v_homebrew := v_line.is_homebrew;
		v_is_important := v_line.is_important;
		v_total_quantity := CASE
			WHEN v_item_base ->> 'isStackable' = 'true' THEN 1
			ELSE v_line.quantity
		END;
		FOR v_index IN 1..v_total_quantity LOOP
			v_item_id := gen_random_uuid()::text;
			INSERT INTO public.inventory_items (
				id, campaign_id, owner_id, slot, name, category, sub_type, rarity,
				icon, damage, mastery, ac, weight, value_gp, quantity, equipped,
				requires_attunement, attuned, is_homebrew, is_identified, charges,
				max_charges, effects, flavor, dm_notes, player_notes, is_private,
				is_equippable, is_consumable, is_important, affixes, item_base,
				blacksmith_item_id
			)
			VALUES (
				v_item_id, p_campaign_id, p_owner_id, 0,
				v_item_base ->> 'name',
				CASE
					WHEN v_category IN ('Weapon', 'Armor') THEN v_category
					WHEN COALESCE((v_item_base ->> 'isConsumable')::boolean, false)
						OR v_category IN ('Potion', 'Poison', 'Scroll')
						THEN 'Consumable'
					ELSE 'Misc'
				END,
				COALESCE(v_item_base #>> '{subTypes,0}', ''),
				v_item_base ->> 'rarity', v_icon,
				v_item_base #>> '{weaponProperties,damage}',
				COALESCE(v_item_base #>> '{weaponProperties,mastery}', 'None'),
				v_item_base #>> '{armorProperties,ac}',
				(v_item_base ->> 'weight')::numeric,
				(v_item_base ->> 'valueGp')::numeric,
				CASE WHEN v_item_base ->> 'isStackable' = 'true'
					THEN v_line.quantity ELSE 1 END,
				false,
				COALESCE((v_item_base ->> 'isRequireAttunement')::boolean, false),
				false, v_homebrew, true, 0,
				COALESCE((v_item_base ->> 'maxCharges')::integer, 0),
				COALESCE(v_item_base ->> 'effects', ''),
				COALESCE(v_item_base ->> 'flavor', ''),
				COALESCE(v_item_base ->> 'dmNotes', ''), '', p_is_private,
				COALESCE((v_item_base ->> 'isEquippable')::boolean, false),
				COALESCE((v_item_base ->> 'isConsumable')::boolean, false),
				v_is_important, COALESCE(v_item_base -> 'affixes', '[]'::jsonb),
				v_item_base, v_source_id
			);
			v_inserted_count := v_inserted_count + 1;
			v_affected_ids := array_append(v_affected_ids, v_item_id);
		END LOOP;
	END LOOP;

	v_payload := jsonb_build_object(
		'ownerId', p_owner_id,
		'isPrivate', p_is_private,
		'reason', COALESCE(p_reason, ''),
		'items', p_items,
		'insertedCount', v_inserted_count,
		'updatedCount', v_updated_count,
		'inventoryIds', to_jsonb(v_affected_ids)
	);
	PERFORM public.campaign_activity_log_append(
		p_request_id, p_campaign_id, 'item_dispatched', v_actor_id,
		ARRAY(SELECT character.user_id::uuid
			FROM public.characters AS character
			WHERE character.id = p_owner_id
				AND character.campaign_id = p_campaign_id
				AND character.user_id ~*
					'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
		ARRAY[p_owner_id],
		v_private_event, 'DM 已派發物品。', v_payload
	);
	RETURN jsonb_build_object(
		'operationId', p_request_id,
		'insertedCount', v_inserted_count,
		'updatedCount', v_updated_count,
		'inventoryIds', to_jsonb(v_affected_ids),
		'replayed', false
	);
END
$dispatch_campaign_items$;

REVOKE ALL ON FUNCTION public.dispatch_campaign_items(
	text, text, text, boolean, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_campaign_items(
	text, text, text, boolean, text, jsonb, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_campaign_items_as_actor(
	p_actor_id uuid,
	p_request_id text,
	p_campaign_id text,
	p_owner_id text,
	p_is_private boolean,
	p_reason text,
	p_items jsonb,
	p_confirm_large_batch boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $dispatch_campaign_items_as_actor$
BEGIN
	IF auth.role() IS DISTINCT FROM 'service_role'
		OR p_actor_id IS NULL
		OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor_id) THEN
		RAISE EXCEPTION '無權呼叫物品派發交易。' USING ERRCODE = '42501';
	END IF;
	PERFORM set_config('request.jwt.claim.sub', p_actor_id::text, true);
	RETURN public.dispatch_campaign_items(
		p_request_id, p_campaign_id, p_owner_id, p_is_private,
		p_reason, p_items, p_confirm_large_batch
	);
END
$dispatch_campaign_items_as_actor$;

REVOKE ALL ON FUNCTION public.dispatch_campaign_items_as_actor(
	uuid, text, text, text, boolean, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_campaign_items_as_actor(
	uuid, text, text, text, boolean, text, jsonb, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION public.checkout_campaign_shop_cart_as_actor(
	p_actor_id uuid,
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
AS $checkout_campaign_shop_cart_as_actor$
DECLARE
	v_checkout_id text;
	v_is_private boolean;
	v_related_users uuid[];
	v_item_summaries jsonb;
BEGIN
	IF auth.role() IS DISTINCT FROM 'service_role'
		OR p_actor_id IS NULL
		OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor_id) THEN
		RAISE EXCEPTION '無權呼叫商店購買交易。' USING ERRCODE = '42501';
	END IF;
	PERFORM set_config('request.jwt.claim.sub', p_actor_id::text, true);
	v_checkout_id := public.checkout_campaign_shop_cart(
		p_campaign_id, p_shop_id, p_character_id, p_wallet_type, p_items
	);
	v_is_private := p_wallet_type = 'private';
	SELECT COALESCE(
		array_agg(DISTINCT character.user_id::uuid) FILTER (
			WHERE character.user_id ~*
				'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		),
		'{}'::uuid[]
	)
	INTO v_related_users
	FROM public.characters AS character
	WHERE character.id = p_character_id AND character.campaign_id = p_campaign_id;
	v_related_users := array_append(v_related_users, p_actor_id);
	SELECT COALESCE(jsonb_agg(jsonb_build_object(
		'orderId', orders.id,
		'item', orders.item_snapshot,
		'quantity', orders.quantity,
		'status', orders.status
	) ORDER BY orders.id), '[]'::jsonb)
	INTO v_item_summaries
	FROM public.campaign_shop_orders AS orders
	WHERE orders.checkout_id = v_checkout_id
		AND orders.campaign_id = p_campaign_id;
	PERFORM public.campaign_activity_log_append(
		gen_random_uuid()::text, p_campaign_id, 'shop_checkout',
		p_actor_id, v_related_users, ARRAY[p_character_id], v_is_private,
		'商店購物車已送出。',
		jsonb_build_object(
			'checkoutId', v_checkout_id,
			'shopId', p_shop_id,
			'characterId', p_character_id,
			'items', v_item_summaries
		)
	);
	RETURN v_checkout_id;
END
$checkout_campaign_shop_cart_as_actor$;

REVOKE ALL ON FUNCTION public.checkout_campaign_shop_cart_as_actor(
	uuid, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_campaign_shop_cart_as_actor(
	uuid, text, text, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.campaign_shop_log_transition(
	p_order_id text,
	p_action text,
	p_checkout_id text,
	p_campaign_id text,
	p_character_id text,
	p_buyer_user_id uuid,
	p_is_private boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $campaign_shop_log_transition$
DECLARE
	v_actor_id uuid := auth.uid();
	v_orders jsonb;
	v_event_type text;
	v_summary text;
BEGIN
	v_event_type := CASE p_action
		WHEN 'approve' THEN 'shop_order_approved'
		WHEN 'reject' THEN 'shop_order_rejected'
		ELSE 'shop_order_cancelled'
	END;
	v_summary := CASE p_action
		WHEN 'approve' THEN '商店請求已核准。'
		WHEN 'reject' THEN '商店請求已拒絕。'
		ELSE '商店請求已取消。'
	END;
	SELECT COALESCE(jsonb_agg(jsonb_build_object(
		'orderId', orders.id,
		'item', orders.item_snapshot,
		'quantity', orders.quantity,
		'status', orders.status
	) ORDER BY orders.id), '[]'::jsonb)
	INTO v_orders
	FROM public.campaign_shop_orders AS orders
	WHERE orders.campaign_id = p_campaign_id
		AND (
			(p_checkout_id IS NOT NULL AND orders.checkout_id = p_checkout_id)
			OR (p_checkout_id IS NULL AND orders.id = p_order_id)
		);
	PERFORM public.campaign_activity_log_append(
		gen_random_uuid()::text, p_campaign_id, v_event_type, v_actor_id,
		ARRAY[p_buyer_user_id, v_actor_id], ARRAY[p_character_id],
		COALESCE(p_is_private, false), v_summary,
		jsonb_build_object(
			'orderId', p_order_id,
			'checkoutId', p_checkout_id,
			'action', p_action,
			'items', v_orders
		)
	);
END
$campaign_shop_log_transition$;

REVOKE ALL ON FUNCTION public.campaign_shop_log_transition(
	text, text, text, text, text, uuid, boolean
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_campaign_shop_order(p_order_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $approve_campaign_shop_order$
DECLARE
	v_order public.campaign_shop_orders%ROWTYPE;
	v_result text;
	v_private boolean;
BEGIN
	SELECT orders.* INTO v_order
	FROM public.campaign_shop_orders AS orders
	WHERE orders.id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到待審請求。' USING ERRCODE = '22023';
	END IF;
	SELECT payment.wallet_type = 'private' INTO v_private
	FROM public.campaign_shop_order_payments AS payment
	WHERE payment.order_id = p_order_id;
	IF v_order.checkout_id IS NULL THEN
		v_result := public.approve_campaign_shop_order_single(p_order_id);
	ELSE
		v_result := public.campaign_shop_transition_cart(p_order_id, 'approve');
	END IF;
	PERFORM public.campaign_shop_log_transition(
		p_order_id, 'approve', v_order.checkout_id, v_order.campaign_id,
		v_order.character_id, v_order.buyer_user_id, v_private
	);
	RETURN v_result;
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
	v_result text;
	v_private boolean;
BEGIN
	SELECT orders.* INTO v_order
	FROM public.campaign_shop_orders AS orders
	WHERE orders.id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到待審請求。' USING ERRCODE = '22023';
	END IF;
	SELECT payment.wallet_type = 'private' INTO v_private
	FROM public.campaign_shop_order_payments AS payment
	WHERE payment.order_id = p_order_id;
	IF v_order.checkout_id IS NULL THEN
		v_result := public.reject_campaign_shop_order_single(p_order_id);
	ELSE
		v_result := public.campaign_shop_transition_cart(p_order_id, 'reject');
	END IF;
	PERFORM public.campaign_shop_log_transition(
		p_order_id, 'reject', v_order.checkout_id, v_order.campaign_id,
		v_order.character_id, v_order.buyer_user_id, v_private
	);
	RETURN v_result;
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
	v_result text;
	v_private boolean;
BEGIN
	SELECT orders.* INTO v_order
	FROM public.campaign_shop_orders AS orders
	WHERE orders.id = p_order_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION '找不到待審請求。' USING ERRCODE = '22023';
	END IF;
	SELECT payment.wallet_type = 'private' INTO v_private
	FROM public.campaign_shop_order_payments AS payment
	WHERE payment.order_id = p_order_id;
	IF v_order.checkout_id IS NULL THEN
		v_result := public.cancel_campaign_shop_order_single(p_order_id);
	ELSE
		v_result := public.campaign_shop_transition_cart(p_order_id, 'cancel');
	END IF;
	PERFORM public.campaign_shop_log_transition(
		p_order_id, 'cancel', v_order.checkout_id, v_order.campaign_id,
		v_order.character_id, v_order.buyer_user_id, v_private
	);
	RETURN v_result;
END
$cancel_campaign_shop_order$;

REVOKE ALL ON FUNCTION public.approve_campaign_shop_order(text),
	public.reject_campaign_shop_order(text),
	public.cancel_campaign_shop_order(text)
	FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_campaign_shop_order(text),
	public.reject_campaign_shop_order(text),
	public.cancel_campaign_shop_order(text)
	TO authenticated;
