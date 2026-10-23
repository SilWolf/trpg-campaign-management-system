import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

test('登入頁可完成註冊並顯示電子郵件驗證提示', async ({ page }) => {
	const { requests } = await mockSupabase(page);
	await page.goto('/login');

	await page.getByRole('button', { name: '尚未有帳號？立即註冊' }).click();
	await page.getByLabel('電子郵件').fill('new-adventurer@example.test');
	await page.getByLabel('密碼', { exact: true }).fill('safe-test-password');
	await page.getByRole('button', { name: '建立冒險者帳號' }).click();

	await expect(page.getByText(
		'註冊成功！請先至電子郵件收取驗證信，再返回登入。',
	)).toBeVisible();
	expect(requests).toContain('POST /auth/v1/signup');
});

test('登入表單驗證必填欄位並呈現驗證失敗訊息', async ({ page }) => {
	await mockSupabase(page);
	await page.goto('/login');

	const email = page.getByLabel('電子郵件');
	const password = page.getByLabel('密碼', { exact: true });
	await expect(email).toBeVisible();
	await page.keyboard.press('Tab');
	await expect(email).toBeFocused();
	await page.getByRole('button', { name: '登入戰役軍械庫' }).click();
	await expect(email).toBeFocused();

	await email.fill('wrong@example.com');
	await password.fill('incorrect-password');
	await page.getByRole('button', { name: '顯示密碼' }).click();
	await expect(password).toHaveAttribute('type', 'text');
	await page.getByRole('button', { name: '隱藏密碼' }).click();
	await expect(password).toHaveAttribute('type', 'password');
	await page.getByRole('button', { name: '登入戰役軍械庫' }).click();
	await expect(page.getByRole('alert')).toContainText(
		'Invalid login credentials',
	);
});

test('無效邀請連結會顯示可理解的錯誤', async ({ page }) => {
	await mockSupabase(page);
	await page.goto('/invite/mock-campaign-id');

	await expect(page.getByRole('alert')).toContainText(
		'邀請連結無效或已過期',
	);
});

test('邀請註冊可檢查密碼一致並接受邀請', async ({ page }) => {
	const { requests } = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/invite/mock-campaign-id');

	await expect(page.getByLabel('電子郵件')).toHaveValue(
		'adventurer@example.test',
	);
	await page.getByLabel('設定密碼').fill('safe-test-password');
	await page.getByLabel('再次輸入密碼').fill('different-password');
	await page.getByRole('button', { name: '設定密碼並加入戰役' }).click();
	await expect(page.getByRole('alert')).toHaveText(
		'兩次輸入的密碼不一致。',
	);

	await page.getByLabel('再次輸入密碼').fill('safe-test-password');
	await page.getByRole('button', { name: '設定密碼並加入戰役' }).click();
	await expect(page).toHaveURL(/\/campaigns\/mock-campaign-id$/);
	expect(requests).toContain('POST /rest/v1/rpc/accept_campaign_invite');
});

test('大廳可建立戰役並進入該戰役', async ({ page }) => {
	const { requests, functionRequests } = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/');

	await expect(page.getByRole('heading', { name: '我的戰役列表' })).toBeVisible();
	await expect(
		page.getByText('博德之門：腦噬者危機 (預設戰役)', { exact: true }),
	).toHaveCount(0);
	await page.getByRole('button', { name: '建立新戰役 (DM)' }).click();
	const dialog = page.getByRole('dialog', { name: '建立新戰役 (DM)' });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('戰役名稱').fill('Playwright 隔離測試戰役');
	await dialog.getByRole('button', { name: '確認建立戰役' }).click();

	await expect(page).toHaveURL(/\/campaigns\/mock-created-campaign$/);
	await expect(page.getByTestId('system-link-blacksmith')).toBeVisible();
	expect(requests).toContain('POST /functions/v1/create-campaign');
	expect(functionRequests).toHaveLength(1);
	const payload = functionRequests[0] as {
		name: string;
		template: string;
		seed: {
			characters: { id: string }[];
			items: unknown[];
			camp_chest_currency: Record<string, number>;
		};
	};
	expect(payload.name).toBe('Playwright 隔離測試戰役');
	expect(payload.template).toBe('sample');
	expect(payload.seed.characters).toHaveLength(3);
	expect(payload.seed.characters.map((character) => character.id)).not.toContain(
		'camp-chest',
	);
	expect(payload.seed.items).toHaveLength(9);
	expect(payload.seed.camp_chest_currency).toEqual({
		pp: 0,
		gp: 0,
		ep: 0,
		sp: 0,
		cp: 0,
	});
});

test('大廳可建立不帶角色與物品的空白戰役', async ({ page }) => {
	const { functionRequests } = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/');

	await page.getByRole('button', { name: '建立新戰役 (DM)' }).click();
	const dialog = page.getByRole('dialog', { name: '建立新戰役 (DM)' });
	await dialog.getByLabel('戰役名稱').fill('空白測試戰役');
	await dialog.getByLabel('戰役初始內容').selectOption('blank');
	await dialog.getByRole('button', { name: '確認建立戰役' }).click();

	await expect(page).toHaveURL(/\/campaigns\/mock-created-campaign$/);
	const payload = functionRequests[0] as {
		template: string;
		seed: {
			characters: unknown[];
			items: unknown[];
			camp_chest_currency: Record<string, number>;
		};
	};
	expect(payload.template).toBe('blank');
	expect(payload.seed.characters).toEqual([]);
	expect(payload.seed.items).toEqual([]);
	expect(payload.seed.camp_chest_currency).toEqual({
		pp: 0,
		gp: 0,
		ep: 0,
		sp: 0,
		cp: 0,
	});
});

test('大廳建立戰役失敗會顯示伺服器錯誤且不導向', async ({ page }) => {
	await mockSupabase(page, { createCampaignError: '資料庫建立失敗' });
	await seedAuthenticatedSession(page);
	await page.goto('/');

	await page.getByRole('button', { name: '建立新戰役 (DM)' }).click();
	const dialog = page.getByRole('dialog', { name: '建立新戰役 (DM)' });
	await dialog.getByLabel('戰役名稱').fill('失敗測試戰役');
	await dialog.getByRole('button', { name: '確認建立戰役' }).click();

	await expect(page.getByTestId('lobby-error')).toHaveText('資料庫建立失敗');
	await expect(page).toHaveURL('/');
});

test('大廳對話框可用 Escape 關閉並將焦點還給觸發按鈕', async ({ page }) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/');

	const trigger = page.getByRole('button', { name: '建立新戰役 (DM)' });
	await trigger.click();

	const dialog = page.getByRole('dialog', { name: '建立新戰役 (DM)' });
	const campaignName = dialog.getByLabel('戰役名稱');
	await expect(dialog).toBeVisible();
	await expect(campaignName).toBeFocused();
	await page.keyboard.press('Escape');

	await expect(dialog).not.toBeVisible();
	await expect(trigger).toBeFocused();
});

test('大廳可用邀請碼加入戰役', async ({ page }) => {
	const { requests } = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/');

	await page.getByRole('button', { name: '輸入邀請碼加入戰役' }).click();
	const dialog = page.getByRole('dialog', { name: '加入戰役' });
	await dialog.getByLabel('邀請碼').fill('testcode');
	await dialog.getByRole('button', { name: '確認加入' }).click();

	await expect(page).toHaveURL(/\/campaigns\/mock-campaign-id$/);
	expect(requests).toContain('POST /rest/v1/rpc/join_campaign_by_invite_code');
});

test('大廳帳號設定與共用系統導覽列可導覽', async ({ page }) => {
	await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/');

	await page.getByRole('link', { name: '帳號設定' }).click();
	await expect(page).toHaveURL(/\/settings\/profile$/);
	await expect(page.getByRole('heading', { name: '個人資料設定' })).toBeVisible();
	await expect(page.getByTestId('system-link-blacksmith')).toBeVisible();

	await page.getByTestId('system-link-campaign').click();
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: '我的戰役列表' })).toBeVisible();
});

test('帳號設定可儲存個人資料並顯示成功狀態', async ({ page }) => {
	const { requests } = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/settings/profile');

	await page.getByLabel('顯示名字 (Full Name)').fill('Playwright 測試冒險者');
	await page.getByRole('button', { name: '儲存變更' }).click();

	await expect(page.getByText(
		'個人資料已成功更新！',
	)).toBeVisible();
	expect(requests).toContain('PUT /auth/v1/user');
	expect(requests).toContain('POST /rest/v1/profiles');
});

test('Phase 1 頁面在窄螢幕沒有水平溢出', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await mockSupabase(page);

	const expectNoHorizontalOverflow = async () => {
		const hasHorizontalOverflow = await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth,
		);
		expect(hasHorizontalOverflow).toBe(false);
	};

	await page.goto('/login');
	await expect(
		page.getByRole('heading', { name: '博德之門戰役軍械庫' }),
	).toBeVisible();
	await expectNoHorizontalOverflow();

	await seedAuthenticatedSession(page);
	await page.goto('/');
	await expect(
		page.getByRole('heading', { name: '我的戰役列表' }),
	).toBeVisible();
	await expectNoHorizontalOverflow();

	await page.goto('/settings/profile');
	await expect(
		page.getByRole('heading', { name: '個人資料設定' }),
	).toBeVisible();
	await expectNoHorizontalOverflow();

	await page.goto('/invite/mock-campaign-id');
	await expect(
		page.getByRole('heading', { name: '完成冒險者帳號註冊' }),
	).toBeVisible();
	await expectNoHorizontalOverflow();
});
