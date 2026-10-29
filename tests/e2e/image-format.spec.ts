import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('圖片參照支援舊格式、穩定 ID 與受限 Storage path', async ({ page }) => {
	const fallbackResponse = await page.request.get('/images/avatars/default.webp');
	expect(fallbackResponse.status()).toBe(200);
	expect(fallbackResponse.headers()['content-type']).toContain('image/webp');

	const results = await page.evaluate(async () => {
		const { resolveImageReference, resolveItemImageUrl } = await import(
			'/src/lib/imageReferences.ts'
		);
		const { getItemImageUrl } = await import('/src/lib/itemIcon.ts');
		const baseUrl = '/campaign-app/';
		return {
			avatar: resolveImageReference('avatar:default', baseUrl),
			static: resolveImageReference(
				'./images/blacksmith/catalogs/sample/item.webp',
				baseUrl,
			),
			external: resolveImageReference(
				'image:https://example.com/item.webp',
				baseUrl,
			),
			blacksmith: resolveImageReference(
				'storage:blacksmith-assets/123e4567-e89b-42d3-a456-426614174000/items/123e4567-e89b-42d3-a456-426614174001/128.webp',
				baseUrl,
			),
			campaign: resolveImageReference(
				'storage:campaign-assets/campaign-1/items/123e4567-e89b-42d3-a456-426614174001/512.webp',
				baseUrl,
			),
			journey: resolveImageReference(
				'storage:campaign-assets/campaign-1/journeys/journey-1/123e4567-e89b-42d3-a456-426614174001/image.webp',
				baseUrl,
			),
			rejectedProtocol: resolveImageReference(
				'image:http://example.com/item.webp',
				baseUrl,
			),
			rejectedUnknownBucket: resolveImageReference(
				'storage:unknown-assets/campaign-1/items/image.webp',
				baseUrl,
			),
			rejectedTraversal: resolveImageReference(
				'./images/../../private.webp',
				baseUrl,
			),
			rejectedUnknownAvatar: resolveImageReference(
				'avatar:not-in-catalog',
				baseUrl,
			),
			itemStorageUrl: resolveItemImageUrl(
				'storage:campaign-assets/campaign-1/items/123e4567-e89b-42d3-a456-426614174001/128.webp',
				baseUrl,
			),
			legacyStaticItemUrl: getItemImageUrl('./images/item.webp'),
			legacyExternalItemUrl: getItemImageUrl(
				'image:https://example.com/item.webp',
			),
		};
	});

	expect(results.avatar).toEqual({
		kind: 'static',
		url: '/campaign-app/images/avatars/default.webp',
	});
	expect(results.static).toEqual({
		kind: 'static',
		url: '/campaign-app/images/blacksmith/catalogs/sample/item.webp',
	});
	expect(results.external).toEqual({
		kind: 'external',
		url: 'https://example.com/item.webp',
	});
	expect(results.blacksmith).toMatchObject({
		kind: 'storage',
		bucket: 'blacksmith-assets',
		assetType: 'blacksmith-item',
	});
	expect(results.campaign).toMatchObject({
		kind: 'storage',
		bucket: 'campaign-assets',
		assetType: 'campaign-item',
	});
	expect(results.journey).toMatchObject({
		kind: 'storage',
		bucket: 'campaign-assets',
		assetType: 'journey',
	});
	expect(results.rejectedProtocol).toBeNull();
	expect(results.rejectedUnknownBucket).toBeNull();
	expect(results.rejectedTraversal).toBeNull();
	expect(results.rejectedUnknownAvatar).toBeNull();
	expect(results.itemStorageUrl).toBeNull();
	expect(results.legacyStaticItemUrl).toBe('/images/item.webp');
	expect(results.legacyExternalItemUrl).toBe('https://example.com/item.webp');
});

test('圖片規格化會輸出 WebP 並依用途縮放或裁切', async ({ page }) => {
	const results = await page.evaluate(async () => {
		const { normalizeImage } = await import('/src/lib/imageProcessing.ts');
		const source = document.createElement('canvas');
		source.width = 320;
		source.height = 160;
		const context = source.getContext('2d');
		if (!context) throw new Error('測試無法建立 Canvas。');
		context.fillStyle = '#d97706';
		context.fillRect(0, 0, source.width, source.height);
		const png = await new Promise<Blob>((resolve, reject) => {
			source.toBlob((blob) => {
				if (blob) resolve(blob);
				else reject(new Error('測試 PNG 編碼失敗。'));
			}, 'image/png');
		});
		const file = new File([png], 'source.png', { type: 'image/png' });
		const [avatar] = await normalizeImage(file, 'avatar');
		const item = await normalizeImage(file, 'item');
		const [journey] = await normalizeImage(file, 'journey');
		const portraitSource = document.createElement('canvas');
		portraitSource.width = 160;
		portraitSource.height = 320;
		const portraitContext = portraitSource.getContext('2d');
		if (!portraitContext) throw new Error('測試無法建立直式圖片 Canvas。');
		portraitContext.fillRect(
			0,
			0,
			portraitSource.width,
			portraitSource.height,
		);
		const portraitPng = await new Promise<Blob>((resolve, reject) => {
			portraitSource.toBlob((blob) => {
				if (blob) resolve(blob);
				else reject(new Error('測試直式 PNG 編碼失敗。'));
			}, 'image/png');
		});
		const [portraitJourney] = await normalizeImage(
			new File([portraitPng], 'portrait.png', { type: 'image/png' }),
			'journey',
		);
		return {
			avatar: {
				type: avatar.blob.type,
				width: avatar.width,
				height: avatar.height,
			},
			item: item.map(({ blob, width, height, variant }) => ({
				type: blob.type,
				width,
				height,
				variant,
			})),
			journey: {
				type: journey.blob.type,
				width: journey.width,
				height: journey.height,
			},
			portraitJourney: {
				type: portraitJourney.blob.type,
				width: portraitJourney.width,
				height: portraitJourney.height,
			},
		};
	});

	expect(results.avatar).toEqual({
		type: 'image/webp',
		width: 256,
		height: 256,
	});
	expect(results.item).toEqual([
		{ type: 'image/webp', width: 128, height: 64, variant: '128' },
		{ type: 'image/webp', width: 320, height: 160, variant: '512' },
	]);
	expect(results.journey).toEqual({
		type: 'image/webp',
		width: 320,
		height: 160,
	});
	expect(results.portraitJourney).toEqual({
		type: 'image/webp',
		width: 160,
		height: 320,
	});
});

test('圖片規格化會明確拒絕偽裝格式及無法解碼的圖片', async ({ page }) => {
	const errors = await page.evaluate(async () => {
		const { normalizeImage } = await import('/src/lib/imageProcessing.ts');
		const invalidFiles = [
			new File(['<svg></svg>'], 'vector.svg', { type: 'image/svg+xml' }),
			new File(['not a png'], 'spoofed.png', { type: 'image/png' }),
			new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', {
				type: 'image/png',
			}),
			new File(
				[new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
				'broken.png',
				{ type: 'image/png' },
			),
		];
		const errorCodes: string[] = [];
		for (const file of invalidFiles) {
			try {
				await normalizeImage(file, 'item');
			} catch (error) {
				errorCodes.push(
					typeof error === 'object' &&
						error !== null &&
						'code' in error &&
						typeof error.code === 'string'
						? error.code
						: 'unexpected-error',
				);
			}
		}

		const source = document.createElement('canvas');
		source.width = 1;
		source.height = 1;
		const context = source.getContext('2d');
		if (!context) throw new Error('測試無法建立 Canvas。');
		context.fillRect(0, 0, 1, 1);
		const png = await new Promise<Blob>((resolve, reject) => {
			source.toBlob((blob) => {
				if (blob) resolve(blob);
				else reject(new Error('測試 PNG 編碼失敗。'));
			}, 'image/png');
		});
		const originalToBlob = HTMLCanvasElement.prototype.toBlob;
		HTMLCanvasElement.prototype.toBlob = function (callback) {
			callback(null);
		};
		try {
			await normalizeImage(new File([png], 'valid.png', { type: 'image/png' }), 'avatar');
		} catch (error) {
			errorCodes.push(
				typeof error === 'object' &&
					error !== null &&
					'code' in error &&
					typeof error.code === 'string'
					? error.code
					: 'unexpected-error',
			);
		} finally {
			HTMLCanvasElement.prototype.toBlob = originalToBlob;
		}
		return errorCodes;
	});

	expect(errors).toEqual([
		'unsupported-format',
		'unsupported-format',
		'file-too-large',
		'invalid-image',
		'encoding-failed',
	]);
});
