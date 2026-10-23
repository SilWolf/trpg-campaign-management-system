import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

test('規則書目錄可瀏覽、搜尋、篩選並從大廳進入', async ({ page }) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/blacksmith');

	await expect(
		page.getByRole('heading', { name: '鍛造工坊' }),
	).toBeVisible();
	await expect(page.getByTestId('blacksmith-result-count')).toContainText('91');

	await page.getByTestId('blacksmith-search').fill('午夜之淚');
	await expect(page.getByTestId('blacksmith-result-count')).toContainText('1');
	await expect(page.getByTestId('blacksmith-item-detail')).toContainText(
		'午夜之淚',
	);
	await expect(page.getByTestId('blacksmith-item-detail')).toContainText(
		"DMG'24",
	);

	await page.getByTestId('blacksmith-search').fill('不存在的測試物品');
	await expect(page.getByTestId('blacksmith-no-results')).toBeVisible();

	await page.goto('/');
	await page.getByTestId('lobby-blacksmith-link').click();
	await expect(page).toHaveURL(/\/blacksmith$/);
	await expect(page.getByTestId('blacksmith-result-count')).toContainText('91');
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
