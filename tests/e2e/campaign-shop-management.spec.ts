import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const shopUrl = '/campaigns/settings-campaign/shops';

test('DM 可建立商店並預覽後批次匯入商品', async ({ page }) => {
	const { requests } = await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('campaign-shops-page')).toBeVisible();
	await page.getByRole('button', { name: '建立商店' }).click();
	await page.getByTestId('shop-name').fill('灰港冒險者商會');
	await page.getByRole('button', { name: '儲存商店' }).click();
	await expect(
		page.getByRole('heading', { name: '灰港冒險者商會' }).first(),
	).toBeVisible();

	await page.getByLabel('批次商品資料').fill('治療藥水 | 50 | 8\n火把 | 0.01 | 20');
	await expect(page.getByText('預覽 2 項：')).toBeVisible();
	await page.getByRole('button', { name: '確認匯入' }).click();
	await expect(page.getByRole('status')).toContainText('已匯入 2 項手動商品');
	await expect(page.getByTestId('shop-item-card')).toHaveCount(2);
	expect(requests.some((request) => request.startsWith('POST /rest/v1/campaign_shops'))).toBe(
		true,
	);
	expect(
		requests.some((request) =>
			request.startsWith('POST /rest/v1/campaign_shop_items'),
		),
	).toBe(true);
});

test('一般成員可瀏覽商店但看不到管理操作', async ({ page }) => {
	await mockSupabase(page, { campaignSettingsRole: 'player' });
	await seedAuthenticatedSession(page);
	await page.goto(shopUrl);

	await expect(page.getByTestId('campaign-shops-page')).toBeVisible();
	await expect(
		page.getByRole('button', { name: '建立商店' }),
	).toHaveCount(0);
	await expect(page.getByTestId('shop-item-editor')).toHaveCount(0);
	await expect(page.getByText('目前沒有啟用中的商店。').first()).toBeVisible();
});
