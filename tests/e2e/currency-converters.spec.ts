import { expect, test } from '@playwright/test';

test('GP 錢包轉換器保留邊界餘額並拒絕不合法資料', async ({ page }) => {
	await page.goto('/');
	const result = await page.evaluate(async () => {
		const {
			fromDbCampaignCurrency,
			fromDbCharacter,
			toDbCampaignCurrency,
			toDbCharacter,
		} = await import('/src/lib/supabase.ts');
		const amounts = [
			0, 0.01, 0.99, 1, 1.99, 999999.99, 1000000,
		];
		const roundTrips = amounts.map((amount) => {
			const cents = Math.round(amount * 100);
			const legacyWallet = {
				pp: 0,
				gp: Math.floor(cents / 100),
				ep: 0,
				sp: 0,
				cp: cents % 100,
			};
			const character = fromDbCharacter({
				id: 'currency-test-character',
				name: '測試角色',
				title: '冒險者',
				avatar: null,
				str: 10,
				user_id: 'currency-test-user',
				campaign_id: 'currency-test-campaign',
				gp: String(amount),
				private_gp: String(amount),
				currencies: legacyWallet,
				private_currencies: legacyWallet,
			});
			const encodedCharacter = toDbCharacter(character);
			const encodedCampaign = toDbCampaignCurrency(
				fromDbCampaignCurrency({ camp_chest_gp: String(amount) }),
			);
			return {
				gp: character.gp,
				privateGp: character.privateGp,
				encodedGp: encodedCharacter.gp,
				encodedPrivateGp: encodedCharacter.private_gp,
				encodedCampChestGp: encodedCampaign.camp_chest_gp,
			};
		});
		const invalidValues: (number | string)[] = [
			-0.01,
			0.001,
			1000000.01,
			NaN,
			Infinity,
			'invalid',
		];
		const invalidValuesRejected = invalidValues.map((value) => {
			try {
				fromDbCharacter({
					id: 'invalid-currency-test-character',
					name: '測試角色',
					title: '冒險者',
					avatar: null,
					str: 10,
					user_id: 'currency-test-user',
					campaign_id: 'currency-test-campaign',
					gp: value,
					private_gp: 0,
				});
				return false;
			} catch {
				return true;
			}
		});
		let mismatchedLegacyWalletRejected = false;
		try {
			fromDbCharacter({
				id: 'mismatched-currency-test-character',
				name: '測試角色',
				title: '冒險者',
				avatar: null,
				str: 10,
				user_id: 'currency-test-user',
				campaign_id: 'currency-test-campaign',
				gp: 1,
				private_gp: 0,
				currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
			});
		} catch {
			mismatchedLegacyWalletRejected = true;
		}
		return { amounts, roundTrips, invalidValuesRejected, mismatchedLegacyWalletRejected };
	});

	expect(result.roundTrips).toEqual(
		result.amounts.map((amount) => ({
			gp: amount,
			privateGp: amount,
			encodedGp: amount,
			encodedPrivateGp: amount,
			encodedCampChestGp: amount,
		})),
	);
	expect(result.invalidValuesRejected).toEqual([
		true,
		true,
		true,
		true,
		true,
		true,
	]);
	expect(result.mismatchedLegacyWalletRejected).toBe(true);
});
