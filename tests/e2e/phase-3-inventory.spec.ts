import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const inventoryUrl = '/campaigns/inventory-campaign';

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
});

test('DM 可切換公開與私人背包、搜尋檢視並編輯公開錢包', async ({ page }) => {
	const { requests } = await mockSupabase(page, {
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
