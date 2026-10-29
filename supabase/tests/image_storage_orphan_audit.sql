BEGIN TRANSACTION READ ONLY;

WITH image_references AS (
	SELECT 'characters.avatar' AS source, avatar AS reference
	FROM public.characters
	WHERE avatar LIKE 'storage:%'

	UNION ALL

	SELECT 'blacksmith_items.icon', icon
	FROM public.blacksmith_items
	WHERE icon LIKE 'storage:%'

	UNION ALL

	SELECT 'blacksmith_items.item_base.icon', item_base ->> 'icon'
	FROM public.blacksmith_items
	WHERE item_base ->> 'icon' LIKE 'storage:%'

	UNION ALL

	SELECT 'inventory_items.icon', icon
	FROM public.inventory_items
	WHERE icon LIKE 'storage:%'

	UNION ALL

	SELECT 'inventory_items.item_base.icon', item_base ->> 'icon'
	FROM public.inventory_items
	WHERE item_base ->> 'icon' LIKE 'storage:%'

	UNION ALL

	SELECT 'inventory_items.item_identified_snapshot.icon',
		item_identified_snapshot ->> 'icon'
	FROM public.inventory_items
	WHERE item_identified_snapshot ->> 'icon' LIKE 'storage:%'

	UNION ALL

	SELECT 'inventory_items.item_identified_snapshot.item_base.icon',
		item_identified_snapshot #>> '{item_base,icon}'
	FROM public.inventory_items
	WHERE item_identified_snapshot #>> '{item_base,icon}' LIKE 'storage:%'

	UNION ALL

	SELECT 'campaign_shop_items.item_snapshot.icon',
		item_snapshot ->> 'icon'
	FROM public.campaign_shop_items
	WHERE item_snapshot ->> 'icon' LIKE 'storage:%'

	UNION ALL

	SELECT 'campaign_shop_items.item_snapshot.item_base.icon',
		item_snapshot #>> '{item_base,icon}'
	FROM public.campaign_shop_items
	WHERE item_snapshot #>> '{item_base,icon}' LIKE 'storage:%'

	UNION ALL

	SELECT 'campaign_shop_orders.item_snapshot.icon',
		item_snapshot ->> 'icon'
	FROM public.campaign_shop_orders
	WHERE item_snapshot ->> 'icon' LIKE 'storage:%'

	UNION ALL

	SELECT 'campaign_shop_orders.item_snapshot.item_base.icon',
		item_snapshot #>> '{item_base,icon}'
	FROM public.campaign_shop_orders
	WHERE item_snapshot #>> '{item_base,icon}' LIKE 'storage:%'
),
normalized_references AS (
	SELECT
		source,
		substring(reference FROM '^storage:([^/]+)/') AS bucket_id,
		substring(reference FROM '^storage:[^/]+/(.+)$') AS object_name
	FROM image_references
	WHERE reference ~ '^storage:(user-uploads|blacksmith-assets|campaign-assets)/.+$'
),
journey_references AS (
	SELECT
		'campaign_journeys.content' AS source,
		object.bucket_id,
		object.name AS object_name
	FROM storage.objects AS object
	JOIN public.campaign_journeys AS journey
		ON position(
			'storage:' || object.bucket_id || '/' || object.name
			IN journey.content
		) > 0
	WHERE object.bucket_id = 'campaign-assets'

	UNION ALL

	SELECT
		'campaign_journey_dm_notes.content',
		object.bucket_id,
		object.name
	FROM storage.objects AS object
	JOIN public.campaign_journey_dm_notes AS dm_note
		ON position(
			'storage:' || object.bucket_id || '/' || object.name
			IN dm_note.content
		) > 0
	WHERE object.bucket_id = 'campaign-assets'
),
all_references AS (
	SELECT source, bucket_id, object_name
	FROM normalized_references

	UNION ALL

	SELECT source, bucket_id, object_name
	FROM journey_references
),
references_by_object AS (
	SELECT
		bucket_id,
		object_name,
		array_agg(DISTINCT source ORDER BY source) AS reference_sources
	FROM all_references
	GROUP BY bucket_id, object_name
)
SELECT
	object.bucket_id,
	object.name AS object_name,
	object.created_at,
	COALESCE(ref_summary.reference_sources, ARRAY[]::text[]) AS reference_sources,
	CASE
		WHEN object.bucket_id = 'blacksmith-assets'
			THEN '受保護來源資產：不可清理'
		WHEN ref_summary.bucket_id IS NOT NULL
			THEN '仍被資料引用：不可清理'
		WHEN object.created_at >= now() - interval '7 days'
			THEN '七日內新物件：暫不列入清理'
		ELSE '待人工複核的孤立候選：本報表不會刪除'
	END AS audit_result
FROM storage.objects AS object
LEFT JOIN references_by_object AS ref_summary
	ON ref_summary.bucket_id = object.bucket_id
	AND ref_summary.object_name = object.name
WHERE object.bucket_id IN (
	'user-uploads',
	'blacksmith-assets',
	'campaign-assets'
)
ORDER BY object.bucket_id, object.name;

COMMIT;
