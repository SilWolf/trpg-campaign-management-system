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

	await page.getByRole('link', { name: '灰港冒險者商會' }).first().click();
	await page.getByRole('link', { name: '商店設定' }).click();
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

test('DM 可從鍛造工坊選擇來源並加入商店', async ({ page }) => {
	const { requests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	await expect(page.getByTestId('campaign-shops-page')).toBeVisible();
	await expect(page.getByRole('button', { name: '加入' }).first()).toBeVisible({
		timeout: 15_000,
	});
	await page.getByRole('button', { name: '加入' }).first().click();

	await expect(page.getByTestId('shop-item-editor')).toBeVisible();
	await expect(page.getByLabel('商品名稱')).not.toHaveValue('');
	await page.getByRole('button', { name: '儲存商品' }).click();

	await expect(page.getByRole('status')).toContainText('商品已加入商店');
	expect(
		requests.some((request) =>
			request.startsWith('POST /rest/v1/campaign_shop_items'),
		),
	).toBe(true);
	await expect(page.getByTestId('shop-item-card')).toHaveCount(3);
});

test('DM 可在商品對話框編輯鍛造欄位並刪除商品', async ({ page }) => {
	const { requests } = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);

	const itemCard = page.getByTestId('shop-item-card').first();
	await itemCard.getByRole('button', { name: '編輯商品' }).click();
	const editor = page.getByTestId('shop-item-editor');
	await expect(editor).toBeVisible();
	await expect(editor.getByLabel('圖示名稱')).toHaveValue('FlaskConical');
	await editor.getByLabel('效果描述').fill('恢復 2d4 + 2 點生命值。');
	await editor.getByLabel('重量（磅）').fill('0.5');
	await editor.getByRole('button', { name: '儲存商品' }).click();

	await expect(page.getByRole('status')).toContainText('商品設定已更新');
	await expect(page.getByText('恢復 2d4 + 2 點生命值。')).toBeVisible();
	await itemCard.getByRole('button', { name: '編輯商品' }).click();
	await page.getByRole('button', { name: '刪除商品' }).click();
	await expect(
		page.getByText(/刪除商品會一併刪除其所有關聯訂單/),
	).toBeVisible();
	await page.getByRole('button', { name: '再次按下確認刪除' }).click();

	await expect(page.getByRole('status')).toContainText('商品與其關聯的訂單紀錄已刪除');
	await expect(page.getByTestId('shop-item-card')).toHaveCount(1);
	expect(
		requests.some((request) =>
			request.startsWith('DELETE /rest/v1/campaign_shop_items'),
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

test('DM 的商店詳情與目錄管理分頁分離', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1`);

	await expect(page.getByTestId('campaign-shop-detail')).toBeVisible();
	await expect(page.getByRole('button', { name: '編輯商品' })).toHaveCount(0);
	await page.getByRole('link', { name: '商店設定' }).click();
	await expect(page.getByLabel('批次商品資料')).toBeVisible();
});

test('玩家可瀏覽商店詳情但無法進入 DM 管理功能', async ({ page }) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'player',
		campaignShopSeed: true,
		campaignShopItemIcon:
			'./images/blacksmith/catalogs/dnd-2024-srd-5.2/item-c8494aecf5bc9b72.webp',
	});
	await seedAuthenticatedSession(page);
	await page.goto(`${shopUrl}/mock-shop-1`);

	await expect(page.getByTestId('campaign-shop-detail')).toBeVisible();
	const itemImage = page.getByTestId('shop-item-icon').first().locator('img');
	await expect(itemImage).toHaveAttribute(
		'src',
		'/images/blacksmith/catalogs/dnd-2024-srd-5.2/item-c8494aecf5bc9b72.webp',
	);
	await expect
		.poll(() =>
			itemImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
		)
		.toBeGreaterThan(0);
	await expect(page.getByRole('link', { name: '商店設定' })).toHaveCount(0);
	await page.goto(`${shopUrl}/mock-shop-1/settings`);
	await expect(page.getByText('只有 DM 可以管理商店。')).toBeVisible();
	await expect(page.getByLabel('批次商品資料')).toHaveCount(0);
});
