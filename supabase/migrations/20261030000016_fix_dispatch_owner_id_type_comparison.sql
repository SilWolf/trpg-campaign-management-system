DO $fix_dispatch_owner_id_type_comparison$
DECLARE
	v_function_definition text;
	v_old_expression constant text :=
		'source.owner_id = v_actor_id::text';
	v_new_expression constant text :=
		'source.owner_id = v_actor_id';
BEGIN
	SELECT pg_get_functiondef(
		'public.dispatch_campaign_items(text,text,text,boolean,text,jsonb,boolean)'
			::regprocedure
	)
	INTO v_function_definition;

	IF position(v_old_expression IN v_function_definition) = 0 THEN
		RAISE EXCEPTION
			'派發 RPC 未包含預期的 owner_id 型別比較；未修改函式。';
	END IF;
	IF length(v_function_definition)
			- length(replace(
				v_function_definition, v_old_expression, v_new_expression
			))
		<> length(v_old_expression) - length(v_new_expression) THEN
		RAISE EXCEPTION
			'派發 RPC 中預期的 owner_id 型別比較數量不符；未修改函式。';
	END IF;

	EXECUTE replace(
		v_function_definition, v_old_expression, v_new_expression
	);
END
$fix_dispatch_owner_id_type_comparison$;
