import { supabase } from '@/lib/supabase';

async function throwEdgeFunctionError(error: Error): Promise<never> {
	if ('context' in error && error.context instanceof Response) {
		let body: unknown;
		try {
			body = await error.context.clone().json();
		} catch {
			throw error;
		}
		if (
			typeof body === 'object' &&
			body !== null &&
			'error' in body &&
			typeof body.error === 'string'
		) {
			throw new Error(body.error);
		}
	}
	throw error;
}

export async function deleteCampaignCharacter(
	campaignId: string,
	characterId: string,
): Promise<void> {
	if (!supabase) {
		throw new Error('角色雲端移除需要設定 Supabase。');
	}

	const { data, error } = await supabase.functions.invoke<{
		deleted: boolean;
		characterId: string;
	}>('delete-campaign-character', {
		body: { campaignId, characterId },
	});
	if (error) await throwEdgeFunctionError(error);
	if (
		!data ||
		data.deleted !== true ||
		data.characterId !== characterId
	) {
		throw new Error('角色移除服務回傳了無效結果。');
	}
}
