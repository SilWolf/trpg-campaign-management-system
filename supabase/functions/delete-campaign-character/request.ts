export type DeleteCampaignCharacterRequest = {
	campaignId: string;
	characterId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseDeleteCampaignCharacterRequest(
	value: unknown,
): DeleteCampaignCharacterRequest | null {
	if (
		!isRecord(value) ||
		Object.keys(value).some(
			(key) => !['campaignId', 'characterId'].includes(key),
		) ||
		typeof value.campaignId !== 'string' ||
		value.campaignId.trim().length === 0 ||
		value.campaignId.length > 200 ||
		typeof value.characterId !== 'string' ||
		value.characterId.trim().length === 0 ||
		value.characterId.length > 200 ||
		value.characterId === 'camp-chest'
	) {
		return null;
	}

	return {
		campaignId: value.campaignId,
		characterId: value.characterId,
	};
}
