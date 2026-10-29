import { expect, test } from '@playwright/test';
import { parseDeleteCampaignCharacterRequest } from '../../supabase/functions/delete-campaign-character/request';

test('角色刪除 Edge Function 只接受 campaign 與實體角色識別碼', () => {
	expect(
		parseDeleteCampaignCharacterRequest({
			campaignId: 'campaign-text-id',
			characterId: 'character-text-id',
		}),
	).toEqual({
		campaignId: 'campaign-text-id',
		characterId: 'character-text-id',
	});

	expect(
		parseDeleteCampaignCharacterRequest({
			campaignId: 'campaign-text-id',
			characterId: 'character-text-id',
			canDeleteCharacter: true,
		}),
	).toBeNull();
	expect(
		parseDeleteCampaignCharacterRequest({
			campaignId: 'campaign-text-id',
			characterId: 'camp-chest',
		}),
	).toBeNull();
	expect(
		parseDeleteCampaignCharacterRequest({
			campaignId: ' ',
			characterId: 'character-text-id',
		}),
	).toBeNull();
	expect(
		parseDeleteCampaignCharacterRequest({
			campaignId: 'campaign-text-id',
			characterId: 'x'.repeat(201),
		}),
	).toBeNull();
});
