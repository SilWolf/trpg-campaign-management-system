import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const userId = 'a77ecb75-91dc-43a2-a20e-0a4c32fe8841';

async function createPngBuffer(page: import('@playwright/test').Page) {
	const pngBase64 = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 8;
		canvas.height = 4;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('測試無法建立圖片畫布。');
		context.fillStyle = '#d97706';
		context.fillRect(0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((result) => {
				if (result) resolve(result);
				else reject(new Error('測試圖片建立失敗。'));
			}, 'image/png');
		});
		const bytes = new Uint8Array(await blob.arrayBuffer());
		return btoa(String.fromCharCode(...bytes));
	});
	return Buffer.from(pngBase64, 'base64');
}

async function mockImageStorage(page: import('@playwright/test').Page) {
	const uploadedPaths: string[] = [];
	const removedPaths: string[] = [];
	const publicImageRequests: string[] = [];
	await page.route(
		'http://127.0.0.1:54321/storage/v1/object/**',
		async (route) => {
			const request = route.request();
			if (request.method() === 'POST') {
				uploadedPaths.push(new URL(request.url()).pathname);
				await route.fulfill({
					status: 200,
					json: { Key: uploadedPaths.at(-1) },
				});
				return;
			}
			if (request.method() === 'DELETE') {
				removedPaths.push(new URL(request.url()).pathname);
				await route.fulfill({ status: 200, json: [] });
				return;
			}
			publicImageRequests.push(request.url());
			await route.fulfill({
				status: 200,
				contentType: 'image/webp',
				body: Buffer.from('mock-image'),
			});
		},
	);
	return { uploadedPaths, removedPaths, publicImageRequests };
}

test('鍛造樣板上傳兩種 WebP 並保存來源圖片參照', async ({ page }) => {
	const { requests } = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	const { uploadedPaths, publicImageRequests } = await mockImageStorage(page);
	let insertedItem: Record<string, unknown> | null = null;
	await page.route(
		'http://127.0.0.1:54321/rest/v1/blacksmith_items**',
		async (route) => {
			if (route.request().method() === 'POST') {
				insertedItem = route.request().postDataJSON();
			}
			await route.fallback();
		},
	);

	await page.goto('/blacksmith/workshop');
	await page.getByRole('button', { name: '鍛造新物品' }).click();
	await page.getByLabel('物品名稱 *').fill('有插圖的鍛造護符');
	await page.getByLabel('選擇要上傳的物品圖片').setInputFiles({
		name: 'item.png',
		mimeType: 'image/png',
		buffer: await createPngBuffer(page),
	});

	await expect(
		page.getByRole('status').filter({ hasText: '128 與 512 WebP 圖片已上傳' }),
	).toBeVisible();
	expect(uploadedPaths).toHaveLength(2);
	expect(
		uploadedPaths.map((path) => path.slice(path.lastIndexOf('/') + 1)).sort(),
	).toEqual(['128.webp', '512.webp']);
	expect(uploadedPaths.every((path) => path.includes(`/blacksmith-assets/${userId}/items/`))).toBe(true);
	await expect(
		page.getByTestId('item-image-preview-128').locator('img'),
	).toHaveAttribute('src', /\/128\.webp$/);
	await expect(
		page.getByTestId('item-image-preview-512').locator('img'),
	).toHaveAttribute('src', /\/512\.webp$/);
	expect(publicImageRequests.some((url) => url.endsWith('/512.webp'))).toBe(true);

	await page.getByRole('button', { name: '保存樣板' }).click();
	await expect(page.getByRole('status').filter({ hasText: '鍛造樣板已保存' })).toBeVisible();
	expect(insertedItem?.icon).toMatch(
		new RegExp(
			`^storage:blacksmith-assets/${userId}/items/[0-9a-f-]+/128[.]webp$`,
		),
	);
	expect(
		requests.some((request) => request.startsWith('POST /rest/v1/blacksmith_items')),
	).toBe(true);
});

test('DM 覆寫商店來源圖片採 campaign 路徑並只保存 128 參照', async ({
	page,
}) => {
	const mocks = await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	const { uploadedPaths, publicImageRequests } = await mockImageStorage(page);

	await page.goto('/campaigns/settings-campaign/shops/mock-shop-1/settings');
	await page.getByRole('button', { name: '編輯治療藥水', exact: true }).click();
	await page.getByLabel('選擇要上傳的物品圖片').setInputFiles({
		name: 'campaign-item.png',
		mimeType: 'image/png',
		buffer: await createPngBuffer(page),
	});
	await expect(
		page.getByRole('status').filter({ hasText: '128 與 512 WebP 圖片已上傳' }),
	).toBeVisible();
	expect(uploadedPaths).toHaveLength(2);
	expect(uploadedPaths.every((path) => path.includes('/campaign-assets/settings-campaign/items/'))).toBe(true);
	await expect(
		page.getByTestId('item-image-preview-128').locator('img'),
	).toHaveAttribute('src', /\/128\.webp$/);
	await expect(
		page.getByTestId('item-image-preview-512').locator('img'),
	).toHaveAttribute('src', /\/512\.webp$/);
	expect(publicImageRequests.some((url) => url.endsWith('/512.webp'))).toBe(true);

	await page.getByRole('button', { name: '儲存商品' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: '商品設定已更新' }),
	).toBeVisible();
	const savedImageDefinition = mocks.campaignShopRpcRequests.find(
		(request) => request.name === 'save_campaign_shop_item',
	)?.body as { p_item_snapshot?: { icon?: string } } | undefined;
	expect(savedImageDefinition?.p_item_snapshot?.icon).toMatch(
		/^storage:campaign-assets\/settings-campaign\/items\/[0-9a-f-]+\/128[.]webp$/,
	);
});

test('DM 可將戰役圖片上傳到背包物品並同步其 campaign 參照', async ({
	page,
}) => {
	await mockSupabase(page, { campaignInventoryRole: 'dm' });
	await seedAuthenticatedSession(page);
	const { uploadedPaths } = await mockImageStorage(page);
	let insertedItems: Record<string, unknown>[] | null = null;
	await page.route(
		'http://127.0.0.1:54321/rest/v1/inventory_items**',
		async (route) => {
			if (route.request().method() === 'POST') {
				const payload = route.request().postDataJSON() as unknown;
				insertedItems = Array.isArray(payload)
					? (payload as Record<string, unknown>[])
					: [payload as Record<string, unknown>];
			}
			await route.fallback();
		},
	);

	await page.goto('/campaigns/inventory-campaign');
	await page.getByTestId('inventory-create-item').click();
	await page
		.getByTestId('homebrew-item-name')
		.fill('戰役專屬插圖護符');
	await page.getByLabel('選擇要上傳的物品圖片').setInputFiles({
		name: 'inventory-item.png',
		mimeType: 'image/png',
		buffer: await createPngBuffer(page),
	});
	await expect(
		page.getByRole('status').filter({ hasText: '128 與 512 WebP 圖片已上傳' }),
	).toBeVisible();
	expect(uploadedPaths).toHaveLength(2);
	expect(
		uploadedPaths.every((path) =>
			path.includes('/campaign-assets/inventory-campaign/items/'),
		),
	).toBe(true);

	await page.getByRole('button', { name: '鑄造並放入背包' }).click();
	await expect(
		page.getByRole('heading', { name: '戰役專屬插圖護符' }),
	).toBeVisible();
	await expect.poll(() => insertedItems).not.toBeNull();
	expect(insertedItems?.[0].icon).toMatch(
		/^storage:campaign-assets\/inventory-campaign\/items\/[0-9a-f-]+\/128[.]webp$/,
	);
});

test('鍛造圖片變體失敗時保留舊參照並回報不可清理的資產路徑', async ({
	page,
}) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	const uploadedPaths: string[] = [];
	let removalRequests = 0;
	await page.route(
		'http://127.0.0.1:54321/storage/v1/object/**',
		async (route) => {
			const request = route.request();
			const path = new URL(request.url()).pathname;
			if (request.method() === 'POST' && path.endsWith('/512.webp')) {
				await route.fulfill({
					status: 500,
					json: { message: '測試 512 版本失敗' },
				});
				return;
			}
			if (request.method() === 'POST') {
				uploadedPaths.push(path);
				await route.fulfill({ status: 200, json: { Key: path } });
				return;
			}
			if (request.method() === 'DELETE') {
				removalRequests += 1;
				await route.fulfill({ status: 200, json: [] });
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'image/webp',
				body: 'mock',
			});
		},
	);

	await page.goto('/blacksmith/workshop');
	await page.getByRole('button', { name: '鍛造新物品' }).click();
	await page.getByLabel('選擇要上傳的物品圖片').setInputFiles({
		name: 'blacksmith-item.png',
		mimeType: 'image/png',
		buffer: await createPngBuffer(page),
	});

	const errorToast = page
		.locator('[role="alert"]')
		.filter({ hasText: '鍛造來源圖片不可刪除' });
	await expect(errorToast).toContainText('未切換圖片參照');
	await expect(errorToast).toContainText(/items\/[0-9a-f-]+/);
	expect(uploadedPaths).toHaveLength(1);
	expect(uploadedPaths[0]).toMatch(/\/128\.webp$/);
	expect(removalRequests).toBe(0);
	await expect(page.getByLabel('圖示名稱 *')).toHaveValue('Package');
});

test('campaign 圖片變體上傳失敗時保留舊參照並清理部分新物件', async ({
	page,
}) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);
	const uploadedPaths: string[] = [];
	const removedPaths: string[] = [];
	await page.route(
		'http://127.0.0.1:54321/storage/v1/object/**',
		async (route) => {
			const path = new URL(route.request().url()).pathname;
			if (route.request().method() === 'POST') {
				if (path.endsWith('/512.webp')) {
					await route.fulfill({
						status: 500,
						json: { message: '測試 512 版本失敗' },
					});
					return;
				}
				uploadedPaths.push(path);
				await route.fulfill({ status: 200, json: { Key: path } });
				return;
			}
			if (route.request().method() === 'DELETE') {
				removedPaths.push(path);
				await route.fulfill({ status: 200, json: [] });
				return;
			}
			await route.fulfill({ status: 200, contentType: 'image/webp', body: 'mock' });
		},
	);

	await page.goto('/campaigns/settings-campaign/shops/mock-shop-1/settings');
	await page.getByRole('button', { name: '編輯治療藥水', exact: true }).click();
	const editor = page.getByTestId('shop-item-editor');
	await expect(editor.getByLabel('圖示名稱')).toHaveValue('FlaskConical');
	await editor.getByLabel('選擇要上傳的物品圖片').setInputFiles({
		name: 'campaign-item.png',
		mimeType: 'image/png',
		buffer: await createPngBuffer(page),
	});

	await expect(
		page.locator('[role="alert"]').filter({ hasText: '未切換圖片參照' }),
	).toBeVisible();
	expect(uploadedPaths).toHaveLength(1);
	expect(removedPaths).toHaveLength(1);
	await expect(editor.getByLabel('圖示名稱')).toHaveValue('FlaskConical');
});
