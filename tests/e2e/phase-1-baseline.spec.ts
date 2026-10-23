import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

test('登入頁可完成註冊並顯示電子郵件驗證提示', async ({ page }) => {
	const { requests } = await mockSupabase(page);
	await page.goto('/login');

	await page.getByTestId('login-toggle-mode').click();
	await page.getByTestId('login-email').fill('new-adventurer@example.test');
	await page.getByTestId('login-password').fill('safe-test-password');
	await page.getByTestId('login-submit').click();

	await expect(page.getByTestId('login-success')).toContainText(
		'註冊成功！請先至電子郵件收取驗證信，再返回登入。',
	);
	expect(requests).toContain('POST /auth/v1/signup');
});

test('登入表單驗證必填欄位並呈現驗證失敗訊息', async ({ page }) => {
	await mockSupabase(page);
	await page.goto('/login');

	const email = page.getByTestId('login-email');
	const password = page.getByTestId('login-password');
	await expect(email).toBeVisible();
	await page.keyboard.press('Tab');
	await expect(email).toBeFocused();
	await page.getByTestId('login-submit').click();
	await expect(email).toBeFocused();

	await email.fill('wrong@example.com');
	await password.fill('incorrect-password');
	await page.getByTestId('login-submit').click();
	await expect(page.getByTestId('login-error')).toContainText(
		'Invalid login credentials',
	);
});

test('無效邀請連結會顯示可理解的錯誤', async ({ page }) => {
	await mockSupabase(page);
	await page.goto('/invite/mock-campaign-id');

	await expect(page.getByTestId('invite-error')).toContainText(
		'邀請連結無效或已過期',
	);
});

test('邀請註冊可檢查密碼一致並接受邀請', async ({ page }) => {
	const { requests } = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/invite/mock-campaign-id');

	await expect(page.getByTestId('invite-email')).toHaveValue(
		'adventurer@example.test',
	);
	await page.getByTestId('invite-password').fill('safe-test-password');
	await page
		.getByTestId('invite-confirm-password')
		.fill('different-password');
	await page.getByTestId('invite-submit').click();
	await expect(page.getByTestId('invite-error')).toHaveText(
		'兩次輸入的密碼不一致。',
	);

	await page
		.getByTestId('invite-confirm-password')
		.fill('safe-test-password');
	await page.getByTestId('invite-submit').click();
	await expect(page).toHaveURL(/\/campaigns\/mock-campaign-id$/);
	expect(requests).toContain('POST /rest/v1/rpc/accept_campaign_invite');
});

test('大廳可建立戰役並進入該戰役', async ({ page }) => {
	const { requests } = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/');

	await expect(page.getByTestId('lobby-heading')).toContainText('我的戰役列表');
	await page.getByTestId('lobby-create-trigger').click();
	await expect(page.getByTestId('lobby-dialog')).toBeVisible();
	await page
		.getByTestId('lobby-campaign-name')
		.fill('Playwright 隔離測試戰役');
	await page.getByTestId('lobby-create-submit').click();

	await expect(page).toHaveURL(/\/campaigns\/campaign-\d+$/);
	expect(requests).toContain('POST /rest/v1/campaigns');
});

test('大廳可用邀請碼加入戰役', async ({ page }) => {
	const { requests } = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/');

	await page.getByTestId('lobby-join-trigger').click();
	await page.getByTestId('lobby-invite-code').fill('testcode');
	await page.getByTestId('lobby-join-submit').click();

	await expect(page).toHaveURL(/\/campaigns\/mock-campaign-id$/);
	expect(requests).toContain(
		'GET /rest/v1/campaigns?select=id%2Cname&invite_code=eq.TESTCODE',
	);
});

test('帳號設定可儲存個人資料並顯示成功狀態', async ({ page }) => {
	const { requests } = await mockSupabase(page);
	await seedAuthenticatedSession(page);
	await page.goto('/settings/profile');

	await page
		.getByTestId('profile-full-name')
		.fill('Playwright 測試冒險者');
	await page.getByTestId('profile-submit').click();

	await expect(page.getByTestId('profile-success')).toContainText(
		'個人資料已成功更新！',
	);
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
	await expect(page.getByTestId('login-heading')).toBeVisible();
	await expectNoHorizontalOverflow();

	await seedAuthenticatedSession(page);
	await page.goto('/');
	await expect(page.getByTestId('lobby-heading')).toBeVisible();
	await expectNoHorizontalOverflow();

	await page.goto('/settings/profile');
	await expect(page.getByTestId('profile-heading')).toBeVisible();
	await expectNoHorizontalOverflow();

	await page.goto('/invite/mock-campaign-id');
	await expect(page.getByTestId('invite-heading')).toBeVisible();
	await expectNoHorizontalOverflow();
});
