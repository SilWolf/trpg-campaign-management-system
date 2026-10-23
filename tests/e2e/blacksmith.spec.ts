import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

test('規則書目錄可瀏覽、搜尋、篩選並從大廳進入', async ({ page }) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/blacksmith');

	await expect(
		page.getByRole('heading', { name: '鍛造工坊' }),
	).toBeVisible();
	await expect(page.getByTestId('blacksmith-result-count')).toContainText('537');

	await page.getByTestId('blacksmith-search').fill('午夜之淚');
	await expect(page.getByTestId('blacksmith-result-count')).toContainText('1');
	await expect(page.getByTestId('blacksmith-item-detail')).toContainText(
		'午夜之淚',
	);
	await expect(page.getByTestId('blacksmith-item-detail')).toContainText(
		"DMG'24",
	);
	await expect(page.getByTestId('blacksmith-item-rarity')).toBeVisible();

	await page.getByTestId('blacksmith-search').fill('不存在的測試物品');
	await expect(page.getByTestId('blacksmith-no-results')).toBeVisible();

	await page.goto('/');
	await page.getByTestId('lobby-blacksmith-link').click();
	await expect(page).toHaveURL(/\/blacksmith$/);
	await expect(page.getByTestId('blacksmith-result-count')).toContainText('537');
});

test('物品目錄支援分頁、列表檢視與稀有度篩選', async ({ page }) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/blacksmith');

	const itemCards = page.getByTestId('blacksmith-item-card');
	await expect(itemCards).toHaveCount(18);
	await expect(page.getByTestId('blacksmith-pagination-status')).toContainText(
		'第 1 /',
	);
	await page.getByRole('button', { name: '下一頁' }).click();
	await expect(itemCards).toHaveCount(18);
	await expect(page.getByTestId('blacksmith-pagination-status')).toContainText(
		'第 2 /',
	);
	await page.getByTestId('blacksmith-page-input').fill('5');
	await page.getByRole('button', { name: '跳轉', exact: true }).click();
	await expect(page.getByTestId('blacksmith-pagination-status')).toContainText(
		'第 5 /',
	);

	await page.getByRole('button', { name: '列表檢視' }).click();
	await expect(itemCards).toHaveCount(10);
	await expect(page.getByTestId('blacksmith-pagination-status')).toContainText(
		'第 1 /',
	);

	await page.getByLabel('依稀有度篩選').selectOption('Legendary');
	await expect(page.getByTestId('blacksmith-result-count')).not.toContainText(
		'537',
	);
	await expect(itemCards.first()).toContainText('傳奇');
});

test('目錄載入失敗會明確顯示錯誤並可重試', async ({ page }) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.route('**/data/blacksmith/catalog-index.json', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: '{}',
		}),
	);
	await page.goto('/blacksmith');

	await expect(page.getByTestId('blacksmith-error')).toContainText('HTTP 503');
	await page.getByRole('button', { name: '重新載入' }).click();
	await expect(page.getByTestId('blacksmith-error')).toContainText('HTTP 503');
});
