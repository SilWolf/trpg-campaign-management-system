import { expect, test } from '@playwright/test';

test('背包與鍛造樣板轉換器保留武器精通並以 None 表示無精通', async ({ page }) => {
	await page.goto('/');
	const results = await page.evaluate(async () => {
		const { INITIAL_ITEMS } = await import('/src/data.ts');
		const { toDbItem, fromDbItem, toDbBlacksmithItem, fromDbBlacksmithItem } =
			await import('/src/lib/supabase.ts');
		const weapon = INITIAL_ITEMS.find((item) => item.category === 'Weapon');
		const armor = INITIAL_ITEMS.find((item) => item.category === 'Armor');
		const other = INITIAL_ITEMS.find(
			(item) => item.category !== 'Weapon' && item.category !== 'Armor',
		);
		if (!weapon || weapon.category !== 'Weapon' || !armor || !other) {
			throw new Error('範本缺少測試所需的物品類型。');
		}
		const noMastery = {
			...weapon,
			weaponProperties: {
				damage: weapon.weaponProperties.damage,
				properties: weapon.weaponProperties.properties,
			},
		};
		return [weapon, noMastery, armor, other].map((item) => {
			const inventory = toDbItem(item);
			const template = toDbBlacksmithItem({
				...item,
				isShared: false,
				createdAt: '2026-01-01T00:00:00Z',
				updatedAt: '2026-01-01T00:00:00Z',
			});
			return {
				inventoryMastery: inventory.mastery,
				templateMastery: template.mastery,
				inventoryBase: fromDbItem(inventory),
				templateBase: fromDbBlacksmithItem(template),
			};
		});
	});

	expect(results.map((result) => result.inventoryMastery)).toEqual([
		'Cleave',
		'None',
		'None',
		'None',
	]);
	expect(results.map((result) => result.templateMastery)).toEqual([
		'Cleave',
		'None',
		'None',
		'None',
	]);
	for (const result of results) {
		expect(result.inventoryBase.category).toBe(result.templateBase.category);
		if (result.inventoryBase.category === 'Weapon' && result.templateBase.category === 'Weapon') {
			expect(result.inventoryBase.weaponProperties).toEqual(result.templateBase.weaponProperties);
			if (result.inventoryMastery === 'None') {
				expect(result.inventoryBase.weaponProperties).not.toHaveProperty('mastery');
			}
		}
	}
});
