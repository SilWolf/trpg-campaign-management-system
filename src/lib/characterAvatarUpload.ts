import { normalizeImage } from '@/lib/imageProcessing';
import {
	IMAGE_REFERENCE_PREFIX,
} from '@/lib/imageReferences';
import { supabase } from '@/lib/supabase';

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function uploadCharacterAvatar(
	file: File,
	userId: string,
): Promise<string> {
	if (!supabase) throw new Error('目前未設定 Supabase，無法上傳角色頭像。');
	if (!UUID_PATTERN.test(userId)) {
		throw new Error('只有已登入的 Supabase 使用者可以上傳角色頭像。');
	}

	const [avatar] = await normalizeImage(file, 'avatar');
	const objectPath = `${userId}/avatars/${crypto.randomUUID()}/256.webp`;
	const { error } = await supabase.storage
		.from('user-uploads')
		.upload(objectPath, avatar.blob, {
			cacheControl: '31536000',
			contentType: 'image/webp',
			upsert: false,
		});
	if (error) throw new Error(`頭像上傳失敗：${error.message}`);

	return `${IMAGE_REFERENCE_PREFIX.storage}user-uploads/${objectPath}`;
}
