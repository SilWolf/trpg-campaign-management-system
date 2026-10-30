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

test('一般成員只能閱讀公開物品與錢包，私人資料和負重不會洩漏', async ({
	page,
}) => {
	await mockSupabase(page, { campaignInventoryRole: 'player' });
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);

	await expect(page.getByTestId('inventory-item-inventory-public-potion')).toBeVisible();
	await expect(page.getByTestId('inventory-item-inventory-private-letter')).toHaveCount(
		0,
	);
	await expect(page.getByTestId('inventory-private-group')).toHaveCount(0);
	await expect(page.getByTestId('inventory-encumbrance')).toContainText('1.4 / 150 lbs');
	await expect(page.getByTestId('currency-summary-gp')).toContainText('20 GP');
	await expect(page.getByTestId('currency-summary-gp')).toContainText(
		'私人錢包',
	);
	await expect(page.getByTestId('currency-summary-gp')).not.toContainText('80 GP');

	await expect(page.getByTestId('inventory-currency-edit')).toHaveCount(0);
	await expect(page.getByTestId('inventory-currency-open')).toHaveCount(0);
	await expect(page.getByTestId('currency-summary-gp')).not.toHaveAttribute(
		'aria-label',
		'GP 餘額，點擊開啟轉帳',
	);
	await expect(page.getByTestId('currency-panel')).toHaveCount(0);
	await expect(page.getByTestId('currency-summary-pp')).toHaveCount(0);
	await expect(page.getByText('一鍵將零錢換整為金幣 (GP)')).toHaveCount(0);
});

test('DM 可在合併背包搜尋檢視物品並開啟雙錢包轉帳', async ({ page }) => {
	const { requests } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);

	await expect(page.getByTestId('inventory-item-inventory-public-potion')).toBeVisible();
	await expect(page.getByTestId('inventory-item-inventory-private-letter')).toBeVisible();
	await expect(page.getByTestId('inventory-private-group').first()).toBeVisible();

	await page.getByRole('searchbox', { name: '搜尋道具名稱' }).fill('治療');
	await expect(
		page.getByTestId('inventory-item-inventory-public-potion'),
	).toHaveAttribute('data-filter-match', 'true');
	await expect(
		page.getByTestId('inventory-item-inventory-private-letter'),
	).toHaveAttribute('data-filter-match', 'false');
	await page.getByRole('searchbox', { name: '搜尋道具名稱' }).fill('');
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
	await expect(page.getByTestId('currency-source-wallet')).toHaveValue(
		JSON.stringify(['inventory-character', 'public']),
	);
	await expect(page.getByTestId('currency-source-wallet')).toContainText(
		'測試冒險者 — 公開錢包（20 GP）',
	);
	await expect(
		page.getByTestId('currency-target-wallet').getByRole('option', {
			name: '測試冒險者 — 私人錢包（80 GP）',
		}),
	).toHaveCount(0);
	await expect(page.getByTestId('currency-panel')).not.toContainText('+1');
	await expect(page.getByTestId('currency-panel')).not.toContainText('−1');
	await expect(page.getByTestId('currency-panel')).not.toContainText('+0.01');
	await expect(page.getByTestId('currency-panel')).not.toContainText('−0.01');
	await page.getByRole('button', { name: '取消' }).click();
	await page.getByTestId('inventory-currency-open').last().click();
	await page.getByTestId('currency-source-wallet').selectOption(
		JSON.stringify(['inventory-character', 'private']),
	);
	await expect(page.getByTestId('currency-source-wallet')).toHaveValue(
		JSON.stringify(['inventory-character', 'private']),
	);
	await page.getByRole('button', { name: '取消' }).click();
	await expect(requests.some((request) => request.startsWith('POST /rest/v1/characters'))).toBe(
		false,
	);
});

test('秘密物品只能單向公開，且不得直接移入營地儲物箱', async ({ page }) => {
	const { requests, campaignShopRpcRequests } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);

	await page.getByTestId('inventory-item-inventory-public-potion').click();
	await expect(page.getByRole('button', { name: '公開物品' })).toHaveCount(0);

	await page.getByTestId('inventory-item-inventory-private-letter').click();
	await expect(page.getByRole('button', { name: '公開物品' })).toBeVisible();
	await expect(
		page.getByRole('button', { name: /送往營地儲物箱/ }),
	).toBeDisabled();
	await page.getByRole('button', { name: '公開物品' }).click();

	await expect
		.poll(() => campaignShopRpcRequests.at(-1))
		.toMatchObject({
			name: 'make_inventory_item_public',
			body: {
				p_campaign_id: 'inventory-campaign',
				p_item_id: 'inventory-private-letter',
			},
		});
	expect(
		requests.some(
			(request) =>
				request.startsWith('PATCH /rest/v1/inventory_items') &&
				request.includes('is_private'),
		),
	).toBe(false);
});

test('遠端角色錢包需使用授權交易；營地箱餘額仍可由 DM 設定', async ({ page }) => {
	const { characterWrites, campaignUpdates } = await mockSupabase(page, {
		campaignInventoryRole: 'dm',
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);

	await expect(page.getByTestId('inventory-currency-edit').last()).toBeVisible();
	await page.getByTestId('inventory-currency-edit').last().click();
	await expect(page.getByTestId('currency-edit-panel')).toBeVisible();
	await expect(page.getByTestId('currency-edit-balance')).toHaveValue('20');
	await page.getByTestId('currency-edit-balance').fill('123.45');
	await page.getByTestId('currency-edit-save').click();
	await expect(page.getByTestId('currency-edit-panel')).toBeVisible();
	await expect(page.getByRole('status').last()).toContainText(
		'遠端角色錢包目前只能透過轉帳異動',
	);
	expect(findCharacterWrite(characterWrites, 'inventory-character')).toBeUndefined();
	await page.getByRole('button', { name: '取消' }).click();

	await page.getByTestId('inventory-currency-edit').last().click();
	await page.getByTestId('currency-edit-wallet').selectOption({
		label: '測試冒險者 — 私人錢包（80 GP）',
	});
	await page.getByTestId('currency-edit-balance').fill('0');
	await page.getByTestId('currency-edit-save').click();
	await expect(page.getByTestId('currency-edit-panel')).toBeVisible();
	await expect(page.getByRole('status').last()).toContainText(
		'遠端角色錢包目前只能透過轉帳異動',
	);
	expect(findCharacterWrite(characterWrites, 'inventory-character')).toBeUndefined();
	await page.getByRole('button', { name: '取消' }).click();

	await page.getByTestId('inventory-currency-edit').last().click();
	await page.getByTestId('currency-edit-wallet').selectOption({
		label: '營地儲物箱 — 公共錢包（0 GP）',
	});
	await page.getByTestId('currency-edit-balance').fill('5.67');
	await page.getByTestId('currency-edit-save').click();
	await expect
		.poll(() => campaignUpdates.at(-1))
		.toMatchObject({
			camp_chest_gp: 5.67,
			camp_chest_currency: { gp: 5, cp: 67 },
		});
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
	await expect(page.getByTestId('currency-source-wallet')).toContainText(
		'營地儲物箱 — 公共錢包（0 GP）',
	);
	await expect(page.getByTestId('currency-transfer-submit')).toBeDisabled();
	expect(
		requests.some((request) => request.startsWith('POST /rest/v1/characters')),
	).toBe(false);
	expect(
		requests.some((request) =>
			request.startsWith('POST /rest/v1/inventory_items'),
		),
	).toBe(false);
	await expect.poll(() => campaignUpdates).toEqual([]);
});

test('可選擇來源與目標錢包並在單筆轉帳後關閉對話框', async ({
	page,
}) => {
	const { characterWrites, campaignUpdates, campaignShopRpcRequests } =
		await mockSupabase(page, {
			campaignInventoryRole: 'dm',
		});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-currency-open').last().click();

	const amountInput = page.getByRole('spinbutton', { name: '金額（GP）' });
	await amountInput.fill('0.01');
	await page.getByTestId('currency-target-wallet').selectOption({
		label: '移轉目標 — 公開錢包（0 GP）',
	});
	await page.getByTestId('currency-transfer-submit').click();
	await expect(page.getByTestId('currency-panel')).toHaveCount(0);
	expect(campaignShopRpcRequests.at(-1)).toMatchObject({
		name: 'transfer_campaign_currency',
		body: {
			p_campaign_id: 'inventory-campaign',
			p_source_character_id: 'inventory-character',
			p_source_wallet: 'public',
			p_target_character_id: 'inventory-target-character',
			p_target_wallet: 'public',
			p_amount_cents: 1,
		},
	});

	await page.getByTestId('inventory-currency-open').last().click();
	await page.getByTestId('currency-source-wallet').selectOption({
		label: '測試冒險者 — 公開錢包（20 GP）',
	});
	await expect(
		page.getByTestId('currency-target-wallet').getByRole('option', {
			name: '測試冒險者 — 私人錢包（80 GP）',
		}),
	).toHaveCount(0);
	await page.getByTestId('currency-source-wallet').selectOption({
		label: '測試冒險者 — 私人錢包（80 GP）',
	});
	await page.getByTestId('currency-target-wallet').selectOption({
		label: '測試冒險者 — 公開錢包（20 GP）',
	});
	await amountInput.fill('0.01');
	await page.getByTestId('currency-transfer-submit').click();
	await expect(page.getByTestId('currency-panel')).toHaveCount(0);
	expect(campaignShopRpcRequests.at(-1)).toMatchObject({
		name: 'transfer_campaign_currency',
		body: {
			p_source_character_id: 'inventory-character',
			p_source_wallet: 'private',
			p_target_character_id: 'inventory-character',
			p_target_wallet: 'public',
			p_amount_cents: 1,
		},
	});

	await page.getByTestId('inventory-currency-open').last().click();
	await page.getByTestId('currency-source-wallet').selectOption({
		label: '測試冒險者 — 私人錢包（80 GP）',
	});
	await page.getByTestId('currency-target-wallet').selectOption({
		label: '移轉目標 — 私人錢包（0 GP）',
	});
	await amountInput.fill('0.01');
	await page.getByTestId('currency-transfer-submit').click();
	await expect(page.getByTestId('currency-panel')).toHaveCount(0);
	expect(campaignShopRpcRequests.at(-1)).toMatchObject({
		name: 'transfer_campaign_currency',
		body: {
			p_source_character_id: 'inventory-character',
			p_source_wallet: 'private',
			p_target_character_id: 'inventory-target-character',
			p_target_wallet: 'private',
			p_amount_cents: 1,
		},
	});

	await page.getByTestId('inventory-character-camp-chest').click();
	await page.getByTestId('inventory-currency-open').last().click();
	await page.getByTestId('currency-source-wallet').selectOption({
		label: '測試冒險者 — 公開錢包（20 GP）',
	});
	await page.getByTestId('currency-target-wallet').selectOption({
		label: '營地儲物箱 — 公共錢包（0 GP）',
	});
	await amountInput.fill('0.02');
	await page.getByTestId('currency-transfer-submit').click();
	await expect(page.getByTestId('currency-panel')).toHaveCount(0);
	expect(campaignShopRpcRequests.at(-1)).toMatchObject({
		name: 'transfer_campaign_currency',
		body: {
			p_source_character_id: 'inventory-character',
			p_source_wallet: 'public',
			p_target_character_id: 'camp-chest',
			p_amount_cents: 2,
		},
	});

	await page.getByTestId('inventory-currency-open').last().click();
	await page.getByTestId('currency-source-wallet').selectOption(
		JSON.stringify(['camp-chest', 'public']),
	);
	await expect(
		page
			.getByTestId('currency-target-wallet')
			.locator('option')
			.filter({ hasText: '私人錢包' }),
	).toHaveCount(0);
	await expect(
		page.getByTestId('currency-target-wallet').getByRole('option', {
			name: '移轉目標 — 公開錢包（0 GP）',
		}),
	).toHaveCount(1);
	await page.getByRole('button', { name: '取消' }).click();

	expect(characterWrites).toEqual([]);
	expect(campaignUpdates).toEqual([]);
});

test('轉帳驗證至少 0.01 GP、來源餘額與不同戶口', async ({
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

	const amountInput = page.getByRole('spinbutton', { name: '金額（GP）' });
	const transferButton = page.getByTestId('currency-transfer-submit');
	await amountInput.fill('0.001');
	await expect(amountInput).toHaveAttribute('aria-invalid', 'true');
	await expect(transferButton).toBeDisabled();
	await amountInput.fill('0.02');
	await expect(amountInput).toHaveAttribute('aria-invalid', 'true');
	await expect(transferButton).toBeDisabled();

	await amountInput.fill('0.01');
	await expect(
		page
			.getByTestId('currency-target-wallet')
			.locator('option')
			.filter({ hasText: '測試冒險者 — 私人錢包' }),
	).toHaveCount(0);
	await page.getByTestId('currency-target-wallet').selectOption({
		label: '移轉目標 — 公開錢包（1000000 GP）',
	});
	await expect(transferButton).toBeDisabled();
});

test('全部會填入來源餘額，平分轉帳排除來源與公庫並保留零頭', async ({
	page,
}) => {
	const { campaignShopRpcRequests, characterWrites, campaignUpdates } =
		await mockSupabase(page, {
		campaignInventoryRole: 'dm',
		campaignInventoryThirdCharacter: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await page.getByTestId('inventory-currency-open').last().click();

	const amountInput = page.getByRole('spinbutton', { name: '金額（GP）' });
	await page.getByTestId('currency-transfer-all').click();
	await expect(amountInput).toHaveValue('20');
	await amountInput.fill('0.05');
	await page.getByTestId('currency-target-wallet').selectOption({
		label: '平分給其他角色（2 名）',
	});
	await expect(page.getByTestId('currency-transfer-submit')).toBeEnabled();
	await page.getByTestId('currency-transfer-submit').click();
	await expect(page.getByTestId('currency-panel')).toHaveCount(0);

	expect(campaignShopRpcRequests.at(-1)).toMatchObject({
		name: 'transfer_campaign_currency',
		body: {
			p_source_character_id: 'inventory-character',
			p_source_wallet: 'public',
			p_target_character_id: null,
			p_target_wallet: 'public',
			p_amount_cents: 5,
		},
	});
	expect(characterWrites).toEqual([]);
	expect(campaignUpdates).toEqual([]);
	await expect(page.getByText(/未能平分的 0.01 GP 留在轉出戶口/)).toBeVisible();
	expect(campaignUpdates).toEqual([]);
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
