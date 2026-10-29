import { normalizeImage } from '@/lib/imageProcessing';
import { IMAGE_REFERENCE_PREFIX } from '@/lib/imageReferences';
import { supabase } from '@/lib/supabase';

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;

export async function uploadJourneyImage(
	file: File,
	campaignId: string,
	journeyId: string,
): Promise<string> {
	if (!supabase) throw new Error('目前未設定 Supabase，無法上傳筆記圖片。');
	if (
		!SAFE_PATH_SEGMENT.test(campaignId) ||
		!SAFE_PATH_SEGMENT.test(journeyId) ||
		campaignId === '.' ||
		campaignId === '..' ||
		journeyId === '.' ||
		journeyId === '..'
	) {
		throw new Error('筆記圖片範圍識別值格式錯誤，請重新載入頁面後再試。');
	}

	const [image] = await normalizeImage(file, 'journey');
	const objectPath = `${campaignId}/journeys/${journeyId}/${crypto.randomUUID()}/image.webp`;
	const { error } = await supabase.storage
		.from('campaign-assets')
		.upload(objectPath, image.blob, {
			cacheControl: '31536000',
			contentType: 'image/webp',
			upsert: false,
		});
	if (error) throw new Error(`筆記圖片上傳失敗：${error.message}`);

	return `${IMAGE_REFERENCE_PREFIX.storage}campaign-assets/${objectPath}`;
}
