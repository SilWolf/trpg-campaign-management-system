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

	await expect(page.getByTestId('inventory-bag-public')).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await expect(page.getByTestId('inventory-bag-private')).toHaveCount(0);
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
	await page.getByTestId('inventory-bag-private').click();
	await expect(page.getByTestId('inventory-item-inventory-private-letter')).toBeVisible();
	await expect(page.getByTestId('inventory-bag-private')).toHaveAttribute(
		'aria-pressed',
		'true',
	);

	await page.getByTestId('inventory-bag-public').click();
	await page.getByTestId('inventory-search').fill('治療');
	await expect(
		page.getByTestId('inventory-item-inventory-public-potion'),
	).toHaveAttribute('data-filter-match', 'true');
	await page.getByTestId('inventory-display-list').click();
	await expect(page.getByTestId('inventory-display-list')).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	const sortTrigger = page.getByTestId('inventory-sort-trigger');
	await sortTrigger.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('inventory-sort-rarity')).toBeVisible();
	await page.getByTestId('inventory-sort-rarity').click();
	await expect(page.getByTestId('inventory-sort-menu')).toHaveJSProperty(
		'open',
		false,
	);
	await page.getByTestId('inventory-item-inventory-public-potion').click();
	await page.getByTestId('inventory-consume-item').click();
	await expect
		.poll(() =>
			requests.some((request) => request.startsWith('POST /rest/v1/inventory_items')),
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

test('Campaign 背包頁在 375px 窄螢幕可用且沒有水平溢位', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await mockSupabase(page, { campaignInventoryRole: 'player' });
	await seedAuthenticatedSession(page);
	await page.goto(inventoryUrl);
	await expect(page.getByTestId('campaign-sync-status')).toHaveText(
		'Supabase 即時同步中',
	);

	await expect(page.getByTestId('inventory-search')).toBeVisible();
	await expect(page.getByTestId('inventory-item-inventory-public-potion')).toBeVisible();
	const hasHorizontalOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth,
	);
	expect(hasHorizontalOverflow).toBe(false);
});
