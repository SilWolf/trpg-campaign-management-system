import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const inventoryUrl = '/campaigns/inventory-campaign';

function findCharacterWrite(
	writes: unknown[],
	characterId: string,
): Record<string, unknown> | undefined {
	return writes
		.flatMap((write) => (Array.isArray(write) ? write : [write]))
		.reverse()
		.find(
			(write): write is Record<string, unknown> =>
				typeof write === 'object' &&
				write !== null &&
				'id' in write &&
				write.id === characterId,
		);
}

test('一般成員只能閱讀公開背包與公開錢包，私人資料和負重不會洩漏', async ({
	page,
}) => {
	await mockSupabase(page, { campaignInventoryRole: 'player' });
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await expect(page.getByTestId('campaign-sync-status')).toHaveText(
		'Supabase 即時同步中',
	);

	await expect(page.getByRole('button', { name: /公開行囊/ })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(page.getByRole('button', { name: /私人暗袋/ })).toHaveCount(0);
	await expect(page.getByTestId('inventory-item-inventory-public-potion')).toBeVisible();
	await expect(page.getByTestId('inventory-item-inventory-private-letter')).toHaveCount(
		0,
	);
	await expect(page.getByTestId('inventory-encumbrance')).toContainText('1.4 / 150 lbs');

	await page.getByTestId('inventory-currency-open').last().click();
	await expect(page.getByTestId('currency-panel')).toBeVisible();
	await expect(page.getByTestId('currency-balance-gp')).toContainText('20');
	await expect(page.getByTestId('currency-wallet-private')).toBeDisabled();
	await expect(page.getByTestId('currency-balance-gp')).not.toContainText('80');
	await expect(page.getByTestId('currency-summary-pp')).toHaveCount(0);
	await expect(page.getByText('一鍵將零錢換整為金幣 (GP)')).toHaveCount(0);
});

test('DM 可切換公開與私人背包、搜尋檢視並編輯公開錢包', async ({ page }) => {
	const { requests, characterWrites } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await expect(page.getByTestId('campaign-sync-status')).toHaveText(
		'Supabase 即時同步中',
	);

	await expect(page.getByTestId('inventory-item-inventory-public-potion')).toBeVisible();
	await page.getByRole('button', { name: /私人暗袋/ }).click();
	await expect(page.getByTestId('inventory-item-inventory-private-letter')).toBeVisible();
	await expect(page.getByRole('button', { name: /私人暗袋/ })).toHaveAttribute(
		'aria-pressed',
		'true',
	);

	await page.getByRole('button', { name: /公開行囊/ }).click();
	await page.getByRole('searchbox', { name: '搜尋道具名稱' }).fill('治療');
	await expect(
		page.getByTestId('inventory-item-inventory-public-potion'),
	).toHaveAttribute('data-filter-match', 'true');
	await page.getByRole('button', { name: '列表' }).click();
	await expect(page.getByRole('button', { name: '列表' })).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	const sortTrigger = page.getByTestId('inventory-sort-trigger');
	await sortTrigger.focus();
	await page.keyboard.press('Enter');
	await expect(
		page.getByRole('button', { name: /依稀有度排序/ }),
	).toBeVisible();
	await page.getByRole('button', { name: /依稀有度排序/ }).click();
	await expect(page.getByTestId('inventory-sort-menu')).toHaveJSProperty(
		'open',
		false,
	);
	const publicPotion = page.getByTestId(
		'inventory-item-inventory-public-potion',
	);
	await publicPotion.click();
	await expect(publicPotion).toHaveAttribute('aria-pressed', 'true');
	const selectionStyles = await publicPotion.evaluate((element) => {
		const primaryColorProbe = document.createElement('div');
		primaryColorProbe.style.borderLeftColor = 'var(--primary)';
		document.body.append(primaryColorProbe);
		const primaryColor = getComputedStyle(primaryColorProbe).borderLeftColor;
		primaryColorProbe.remove();

		const styles = getComputedStyle(element);
		return {
			borderLeftWidth: styles.borderLeftWidth,
			borderLeftColor: styles.borderLeftColor,
			primaryColor,
		};
	});
	expect(selectionStyles.borderLeftWidth).toBe('2px');
	expect(selectionStyles.borderLeftColor).toBe(selectionStyles.primaryColor);
	await page.getByTestId('inventory-consume-item').click();
	await expect
		.poll(() =>
			requests.some((request) => request.startsWith('PATCH /rest/v1/inventory_items')),
		)
		.toBe(true);

	await page.getByTestId('inventory-currency-open').last().click();
	await expect(page.getByTestId('currency-wallet-public')).toBeEnabled();
	await page.getByTestId('currency-add-gp-1').click();
	await expect(page.getByTestId('currency-balance-gp')).toHaveText('21');
	await page.getByTestId('currency-add-gp-cent').click();
	await expect(page.getByTestId('currency-balance-gp')).toHaveText('21.01');
	await page.getByTestId('currency-remove-gp-cent').click();
	await expect(page.getByTestId('currency-balance-gp')).toHaveText('21');
	await expect
		.poll(() => findCharacterWrite(characterWrites, 'inventory-character'))
		.toMatchObject({
			gp: 21,
			private_gp: 80,
			currencies: { gp: 21, cp: 0 },
		});
	await expect
		.poll(() =>
			requests.some((request) => request.startsWith('POST /rest/v1/characters')),
		)
		.toBe(true);
});

test('裝備沒有武器精通的護甲時同步使用 None', async ({ page }) => {
	await mockSupabase(page, {
		campaignInventoryRole: 'dm',
		extraInventoryItems: [
			{
				id: 'inventory-armor',
				owner_id: 'inventory-character',
				slot: 2,
				name: '影心的護甲',
				category: 'Armor',
				sub_type: '護甲',
				rarity: 'Common',
				icon: 'Shield',
				damage: null,
				mastery: 'None',
				ac: '14',
				weight: 10,
				value_gp: 50,
				quantity: 1,
				equipped: false,
				requires_attunement: false,
				attuned: false,
				is_homebrew: false,
				is_identified: true,
				charges: 0,
				max_charges: 0,
				effects: '',
				flavor: '',
				dm_notes: '',
				player_notes: '',
				is_private: false,
				is_equippable: true,
				is_consumable: false,
				is_important: false,
				affixes: [],
			},
		],
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await expect(page.getByTestId('campaign-sync-status')).toHaveText('Supabase 即時同步中');

	await page.getByTestId('inventory-item-inventory-armor').click();
	const update = page.waitForResponse(
		(response) =>
			response.request().method() === 'PATCH' &&
			response.url().includes('/rest/v1/inventory_items') &&
			response.url().includes('id=eq.inventory-armor'),
	);
	await page.getByRole('button', { name: '穿戴裝備' }).click();
	const response = await update;
	expect(response.ok()).toBe(true);
	expect(response.request().postDataJSON()).toEqual(
		expect.objectContaining({ mastery: 'None', equipped: true }),
	);
	await expect(page.getByTestId('campaign-sync-status')).toHaveText('Supabase 即時同步中');
});

test('空白戰役不回填範例資料，營地箱錢包寫入戰役資料列', async ({
	page,
}) => {
	const { campaignUpdates, requests } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
		blankCampaign: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);

	await expect(page.getByTestId('campaign-sync-status')).toHaveText(
		'Supabase 即時同步中',
	);
	await expect(
		page.getByTestId('inventory-character-inventory-character'),
	).toHaveCount(0);
	await expect(
		page.getByTestId('inventory-character-camp-chest'),
	).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('inventory-item-inventory-public-potion')).toHaveCount(
		0,
	);

	await page.getByTestId('inventory-currency-open').last().click();
	await page.getByTestId('currency-add-gp-1').click();
	await expect(page.getByTestId('currency-balance-gp')).toHaveText('1');
	expect(
		requests.some((request) => request.startsWith('POST /rest/v1/characters')),
	).toBe(false);
	expect(
		requests.some((request) =>
			request.startsWith('POST /rest/v1/inventory_items'),
		),
	).toBe(false);
	await expect
		.poll(() =>
			requests.some(
				(request) =>
					request.startsWith('PATCH /rest/v1/campaigns') &&
					request.includes('id=eq.inventory-campaign'),
			),
		)
		.toBe(true);
	await expect.poll(() => campaignUpdates).toEqual([
		{
			camp_chest_gp: 1,
			camp_chest_currency: { pp: 0, gp: 1, ep: 0, sp: 0, cp: 0 },
		},
	]);
});

test('GP 可精確轉給角色、存入營地箱、互轉錢包及從營地箱領出', async ({
	page,
}) => {
	const { characterWrites, campaignUpdates } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-currency-open').last().click();

	const amountInput = page.getByRole('spinbutton', { name: '轉出 GP 數量' });
	await amountInput.fill('0.01');
	await page.getByRole('button', { name: /轉給.*移轉目標/ }).click();
	await expect(page.getByTestId('currency-balance-gp')).toHaveText('19.99');
	await expect
		.poll(() => findCharacterWrite(characterWrites, 'inventory-target-character'))
		.toMatchObject({
			gp: 0.01,
			currencies: { gp: 0, cp: 1 },
		});

	await page.getByRole('button', { name: /存入營地公庫/ }).click();
	await expect(page.getByTestId('currency-balance-gp')).toHaveText('19.98');
	await expect
		.poll(() =>
			campaignUpdates.some(
				(update) =>
					typeof update === 'object' &&
					update !== null &&
					'camp_chest_gp' in update &&
					update.camp_chest_gp === 0.01,
			),
		)
		.toBe(true);

	await page.getByRole('button', { name: /藏入私人錢包/ }).click();
	await page.getByTestId('currency-wallet-private').click();
	await expect(page.getByTestId('currency-balance-gp')).toHaveText('80.01');

	await page
		.getByTestId('currency-panel')
		.getByRole('button', { name: '關閉', exact: true })
		.click();
	await page.getByTestId('inventory-character-camp-chest').click();
	await page.getByTestId('inventory-currency-open').last().click();
	await page.getByRole('spinbutton', { name: '轉出 GP 數量' }).fill('0.01');
	await page.getByRole('button', { name: /轉給.*移轉目標/ }).click();
	await expect(page.getByTestId('currency-balance-gp')).toHaveText('0');
	await expect
		.poll(() => findCharacterWrite(characterWrites, 'inventory-target-character'))
		.toMatchObject({
			gp: 0.02,
			currencies: { gp: 0, cp: 2 },
		});
});

test('營地箱平分以 GP 分計算並將無法平分的分數 GP 留在公庫', async ({
	page,
}) => {
	const { characterWrites, campaignUpdates } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-character-camp-chest').click();
	await page.getByTestId('inventory-currency-open').last().click();

	for (let cent = 0; cent < 5; cent += 1) {
		await page.getByTestId('currency-add-gp-cent').click();
	}
	await page.getByRole('button', { name: /平分所有 GP/ }).click();

	await expect(page.getByTestId('currency-balance-gp')).toHaveText('0.01');
	await expect
		.poll(() =>
			campaignUpdates.some(
				(update) =>
					typeof update === 'object' &&
					update !== null &&
					'camp_chest_gp' in update &&
					update.camp_chest_gp === 0.01,
			),
		)
		.toBe(true);
	await expect
		.poll(() => findCharacterWrite(characterWrites, 'inventory-character'))
		.toMatchObject({
			gp: 20.02,
			currencies: { gp: 20, cp: 2 },
		});
	await expect
		.poll(() => findCharacterWrite(characterWrites, 'inventory-target-character'))
		.toMatchObject({
			gp: 0.02,
			currencies: { gp: 0, cp: 2 },
		});
});

test('GP 轉帳拒絕超過兩位小數、超出可用餘額及超過目標上限', async ({
	page,
}) => {
	await mockSupabase(page, {
		campaignInventoryRole: 'dm',
		campaignInventoryWalletGp: { public: 0.01, private: 0 },
		campaignInventoryTargetGp: 1_000_000,
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-currency-open').last().click();

	const amountInput = page.getByRole('spinbutton', { name: '轉出 GP 數量' });
	const transferButton = page.getByRole('button', { name: /轉給.*移轉目標/ });
	await amountInput.fill('0.001');
	await expect(amountInput).toHaveAttribute('aria-invalid', 'true');
	await expect(transferButton).toBeDisabled();
	await amountInput.fill('0.02');
	await expect(amountInput).toHaveAttribute('aria-invalid', 'false');
	await expect(transferButton).toBeDisabled();

	await amountInput.fill('0.01');
	await expect(transferButton).toBeEnabled();
	await transferButton.click();
	await expect(
		page.getByText('目標錢包餘額不可超過 1,000,000.00 GP。'),
	).toBeVisible();
	await expect(page.getByTestId('currency-balance-gp')).toHaveText('0.01');
});

test('餘額達到 1,000,000 GP 後停止提供加值操作', async ({ page }) => {
	await mockSupabase(page, {
		campaignInventoryRole: 'dm',
		campaignInventoryWalletGp: { public: 999_999.99, private: 0 },
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-currency-open').last().click();

	await page.getByTestId('currency-add-gp-cent').click();
	await expect(page.getByTestId('currency-balance-gp')).toHaveText('1000000');
	await expect(page.getByTestId('currency-add-gp-cent')).toBeDisabled();
	await expect(page.getByTestId('currency-add-gp-1')).toBeDisabled();
});

for (const { gp, coinWeight, totalWeight } of [
	{ gp: 0.99, coinWeight: 0, totalWeight: 1 },
	{ gp: 1, coinWeight: 0.02, totalWeight: 1.02 },
	{ gp: 1.99, coinWeight: 0.02, totalWeight: 1.02 },
	{ gp: 2, coinWeight: 0.04, totalWeight: 1.04 },
]) {
	test(`${gp} GP 的硬幣負重為 ${coinWeight.toFixed(2)} lb`, async ({ page }) => {
		await mockSupabase(page, {
			campaignInventoryRole: 'player',
			campaignInventoryWalletGp: { public: gp, private: 0 },
		});
		await seedAuthenticatedSession(page);
		await page.goto(inventoryUrl);
		await expect(page.getByTestId('inventory-count-coin-weight')).toHaveAccessibleName(
			`計入硬幣重 (${coinWeight} lb)`,
		);
		await expect(page.getByTestId('inventory-encumbrance')).toContainText(
			`${totalWeight} / 150 lbs`,
		);
		await page.getByTestId('inventory-count-coin-weight').uncheck();
		await expect(page.getByTestId('inventory-encumbrance')).toContainText(
			'1 / 150 lbs',
		);
	});
}

test('擁有私人錢包閱讀權限時才將其 GP 納入負重', async ({ page }) => {
	await mockSupabase(page, {
		campaignInventoryRole: 'dm',
		campaignInventoryWalletGp: { public: 0.99, private: 0.02 },
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);

	await expect(page.getByTestId('inventory-count-coin-weight')).toHaveAccessibleName(
		'計入硬幣重 (0.02 lb)',
	);
	await expect(page.getByTestId('inventory-encumbrance')).toContainText(
		'2.52 / 150 lbs',
	);
});

test('Campaign 背包頁在 375px 窄螢幕可用且沒有水平溢位', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await mockSupabase(page, { campaignInventoryRole: 'player' });
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await expect(page.getByTestId('campaign-sync-status')).toHaveText(
		'Supabase 即時同步中',
	);

	await expect(
		page.getByRole('searchbox', { name: '搜尋道具名稱' }),
	).toBeVisible();
	await expect(page.getByTestId('inventory-item-inventory-public-potion')).toBeVisible();
	const hasHorizontalOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth,
	);
	expect(hasHorizontalOverflow).toBe(false);
});
