import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

const campaignSettingsUrl = '/campaigns/settings-campaign/settings';
const testUserId = 'a77ecb75-91dc-43a2-a20e-0a4c32fe8841';

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

async function createWebpBuffer(page: import('@playwright/test').Page) {
	const webpBase64 = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 2;
		canvas.height = 2;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('測試無法建立 WebP 圖片畫布。');
		context.fillStyle = '#d97706';
		context.fillRect(0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((result) => {
				if (result) resolve(result);
				else reject(new Error('測試 WebP 圖片建立失敗。'));
			}, 'image/webp');
		});
		const bytes = new Uint8Array(await blob.arrayBuffer());
		return btoa(String.fromCharCode(...bytes));
	});
	return Buffer.from(webpBase64, 'base64');
}

test('DM 可上傳規格化頭像並在儲存角色後持久化 Storage path', async ({
	page,
}) => {
	await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);

	const uploadedPaths: string[] = [];
	const publicImageRequests: string[] = [];
	const profileUpdates: Record<string, unknown>[] = [];
	const uploadedImage = await createWebpBuffer(page);
	let uploadPayloadBytes = 0;
	await page.route('http://127.0.0.1:54321/storage/v1/object/**', async (route) => {
		const request = route.request();
		if (request.method() === 'POST') {
			uploadedPaths.push(new URL(request.url()).pathname);
			uploadPayloadBytes = request.postDataBuffer()?.byteLength ?? 0;
			await route.fulfill({
				status: 200,
				json: { Key: uploadedPaths.at(-1) },
			});
			return;
		}
		publicImageRequests.push(request.url());
		await route.fulfill({
			status: 200,
			contentType: 'image/webp',
			body: uploadedImage,
		});
	});
	await page.route(
		'http://127.0.0.1:54321/rest/v1/characters**',
		async (route) => {
			if (route.request().method() === 'PATCH') {
				profileUpdates.push(route.request().postDataJSON());
			}
			await route.fallback();
		},
	);

	await page.goto(campaignSettingsUrl);
	await page.getByTestId('campaign-settings-tab-characters').click();
	await page.getByTestId('campaign-settings-tab-settings-character').click();

	await page.getByLabel('選擇要上傳的角色頭像').setInputFiles({
		name: 'avatar.png',
		mimeType: 'image/png',
		buffer: await createPngBuffer(page),
	});
	await expect(
		page.getByRole('status').filter({ hasText: '頭像已上傳' }),
	).toBeVisible();
	expect(publicImageRequests).toHaveLength(1);
	await expect(page.locator('img[alt="角色頭像預覽"]')).toHaveAttribute(
		'src',
		/^http:\/\/127\.0\.0\.1:54321\/storage\/v1\/object\/public\/user-uploads\//,
	);
	expect(uploadedPaths).toHaveLength(1);
	expect(uploadedPaths[0]).toMatch(
		new RegExp(
			`/storage/v1/object/user-uploads/${testUserId}/avatars/[0-9a-f-]+/256.webp$`,
		),
	);
	expect(uploadPayloadBytes).toBeGreaterThan(0);

	await page.getByRole('button', { name: '儲存角色基本資料' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: '基本資料已更新' }),
	).toBeVisible();
	expect(profileUpdates).toHaveLength(1);
	expect(profileUpdates[0].avatar).toMatch(
		new RegExp(
			`^storage:user-uploads/${testUserId}/avatars/[0-9a-f-]+/256[.]webp$`,
		),
	);

	await page.reload();
	await page.getByTestId('campaign-settings-tab-characters').click();
	await page.getByTestId('campaign-settings-tab-settings-character').click();
	await expect(page.locator('img[alt="角色頭像預覽"]')).toHaveAttribute(
		'src',
		/^http:\/\/127\.0\.0\.1:54321\/storage\/v1\/object\/public\/user-uploads\//,
	);
});

test('角色資料更新失敗時回復舊頭像並保留待確認的新上傳物件', async ({
	page,
}) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignCharacterUpdateError: '角色修改權限不足',
	});
	await seedAuthenticatedSession(page);

	const removedPaths: string[] = [];
	let uploadedImage = Buffer.alloc(0);
	await page.route('http://127.0.0.1:54321/storage/v1/object/**', async (route) => {
		const request = route.request();
		if (request.method() === 'POST') {
			uploadedImage = request.postDataBuffer() ?? Buffer.alloc(0);
			await route.fulfill({ status: 200, json: { Key: request.url() } });
			return;
		}
		if (request.method() === 'DELETE') {
			removedPaths.push(new URL(request.url()).pathname);
			await route.fulfill({ status: 200, json: [] });
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: 'image/webp',
			body: uploadedImage,
		});
	});

	await page.goto(campaignSettingsUrl);
	await page.getByTestId('campaign-settings-tab-characters').click();
	await page.getByTestId('campaign-settings-tab-settings-character').click();
	await page.getByLabel('選擇要上傳的角色頭像').setInputFiles({
		name: 'avatar.png',
		mimeType: 'image/png',
		buffer: await createPngBuffer(page),
	});
	await expect(
		page.getByRole('status').filter({ hasText: '頭像已上傳' }),
	).toBeVisible();

	await page.getByRole('button', { name: '儲存角色基本資料' }).click();
	await expect(page.getByText(/更新角色資料失敗：角色修改權限不足/)).toBeVisible();
	await expect(page.getByTestId('character-avatar')).toHaveValue('avatar:default');
	await expect(page.locator('img[alt="角色頭像預覽"]')).toHaveAttribute(
		'src',
		'/images/avatars/default.webp',
	);
	expect(removedPaths).toHaveLength(0);
});
