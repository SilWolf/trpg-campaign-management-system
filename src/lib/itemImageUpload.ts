import { normalizeImage } from '@/lib/imageProcessing';
import { IMAGE_REFERENCE_PREFIX, type ImageStorageBucket } from '@/lib/imageReferences';
import { supabase } from '@/lib/supabase';

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMPAIGN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export async function uploadItemImage(
	file: File,
	bucket: Extract<ImageStorageBucket, 'blacksmith-assets' | 'campaign-assets'>,
	scopeId: string,
): Promise<string> {
	if (!supabase) throw new Error('目前未設定 Supabase，無法上傳物品圖片。');
	if (
		(bucket === 'blacksmith-assets' && !UUID_PATTERN.test(scopeId)) ||
		(bucket === 'campaign-assets' && !CAMPAIGN_ID_PATTERN.test(scopeId))
	) {
		throw new Error('圖片資產範圍識別值格式錯誤，請重新載入頁面後再試。');
	}

	const variants = await normalizeImage(file, 'item');
	const assetId = crypto.randomUUID();
	const assetPath = `${scopeId}/items/${assetId}`;
	const uploadedPaths: string[] = [];

	for (const variant of variants) {
		const objectPath = `${assetPath}/${variant.variant}.webp`;
		const { error } = await supabase.storage.from(bucket).upload(
			objectPath,
			variant.blob,
			{
				cacheControl: '31536000',
				contentType: 'image/webp',
				upsert: false,
			},
		);
		if (!error) {
			uploadedPaths.push(objectPath);
			continue;
		}

		if (bucket === 'campaign-assets') {
			const cleanup = await supabase.storage
				.from(bucket)
				.remove([...uploadedPaths, objectPath]);
			if (cleanup.error) {
				throw new Error(
					`物品圖片上傳失敗：${error.message}。未切換圖片參照；部分戰役圖片清理失敗（${cleanup.error.message}），資產路徑為 ${assetPath}。`,
				);
			}
			throw new Error(
				`物品圖片上傳失敗：${error.message}。未切換圖片參照，已清理本次部分上傳的戰役圖片。`,
			);
		}

		throw new Error(
			`物品圖片上傳失敗：${error.message}。未切換圖片參照；鍛造來源圖片不可刪除，請檢查可能未完成的資產路徑 ${assetPath}。`,
		);
	}

	return `${IMAGE_REFERENCE_PREFIX.storage}${bucket}/${assetPath}/128.webp`;
}
