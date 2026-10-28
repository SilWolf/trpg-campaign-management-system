import { expect, test } from '@playwright/test';
import { mockSupabase, seedAuthenticatedSession } from './supabase-mock';

async function expectNoOverflowAndReadableMainText(
	page: import('@playwright/test').Page,
) {
	const result = await page.evaluate(() => {
		const main = document.querySelector('main');
		if (!main) throw new Error('找不到主要內容區。');

		let surface: Element | null = main;
		while (surface) {
			const background = getComputedStyle(surface).backgroundColor;
			const channels = background.match(/[\d.]+/g)?.map(Number) ?? [];
			if (channels.length < 4 || channels[3] > 0) break;
			surface = surface.parentElement;
		}

		if (!surface) throw new Error('找不到主要內容區的背景色。');
		const foreground = getComputedStyle(main).color.match(/[\d.]+/g)?.map(Number);
		const background = getComputedStyle(surface).backgroundColor
			.match(/[\d.]+/g)
			?.map(Number);
		if (!foreground || !background) {
			throw new Error('無法讀取主要內容區的前景色或背景色。');
		}

		const luminance = (channels: number[]) =>
			channels.slice(0, 3).reduce((sum, channel, index) => {
				const value = channel / 255;
				const linear =
					value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
				return sum + linear * [0.2126, 0.7152, 0.0722][index];
			}, 0);
		const [lighter, darker] = [
			luminance(foreground),
			luminance(background),
		].sort((left, right) => right - left);

		return {
			hasHorizontalOverflow:
				document.documentElement.scrollWidth > window.innerWidth,
			contrastRatio: (lighter + 0.05) / (darker + 0.05),
		};
	});

	expect(result.hasHorizontalOverflow).toBe(false);
	expect(result.contrastRatio).toBeGreaterThanOrEqual(4.5);
}

async function expectHeadingUsesMainForeground(
	page: import('@playwright/test').Page,
	selector: string,
) {
	const colors = await page.locator(selector).evaluate((heading) => {
		const main = heading.closest('main');
		if (!main) throw new Error('標題不在主要內容區中。');

		return {
			heading: getComputedStyle(heading).color,
			main: getComputedStyle(main).color,
		};
	});

	expect(colors.heading).toBe(colors.main);
}

test('主題可用鍵盤切換，並在重新載入後保留偏好', async ({ page }) => {
	await page.goto('/login');

	const themeSwitcher = page.getByRole('combobox', { name: '介面主題' });
	await expect(themeSwitcher).toHaveValue('default');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'default');

	await themeSwitcher.focus();
	await page.keyboard.press('ArrowDown');
	await expect(themeSwitcher).toHaveValue('dnd');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dnd');

	await themeSwitcher.selectOption('printing');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'printing');
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem('trpg-theme')))
		.toBe('printing');

	await page.reload();
	await expect(page.getByRole('combobox', { name: '介面主題' })).toHaveValue(
		'printing',
	);
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'printing');

	const mainBackground = await page.locator('main').evaluate((element) => {
		return getComputedStyle(element).backgroundColor;
	});
	expect(mainBackground).toBe('rgb(255, 255, 255)');
});

test('列印預覽移除操作介面並使用黑白背景', async ({ page }) => {
	await page.emulateMedia({ media: 'print' });
	await page.goto('/login');

	await expect(page.locator('nav')).toBeHidden();
	await expect(page.getByRole('button', { name: '登入戰役軍械庫' })).toBeHidden();

	const printColors = await page.evaluate(() => ({
		background: getComputedStyle(document.body).backgroundColor,
		foreground: getComputedStyle(document.querySelector('main')!).color,
	}));
	expect(printColors).toEqual({
		background: 'rgb(255, 255, 255)',
		foreground: 'rgb(17, 17, 17)',
	});
});

test('三套主題在登入與戰役設定頁維持文字對比並避免手機水平溢位', async ({
	page,
}) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await mockSupabase(page, { campaignSettingsRole: 'dm' });
	await seedAuthenticatedSession(page);

	for (const url of [
		'/login',
		'/campaigns/settings-campaign/settings',
		'/blacksmith',
	]) {
		await page.goto(url);
		if (url.includes('/settings')) {
			await expect(page.getByTestId('campaign-settings-heading')).toBeVisible();
		}

		const themeSwitcher = page.getByRole('combobox', { name: '介面主題' });
		for (const theme of ['default', 'dnd', 'printing']) {
			await themeSwitcher.selectOption(theme);
			await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
			await expectNoOverflowAndReadableMainText(page);
			await expectHeadingUsesMainForeground(
				page,
				url === '/login'
					? '[data-testid="login-heading"]'
					: url.includes('/settings')
						? '[data-testid="campaign-settings-heading"]'
						: '[data-testid="blacksmith-heading"]',
			);
		}
	}
});
