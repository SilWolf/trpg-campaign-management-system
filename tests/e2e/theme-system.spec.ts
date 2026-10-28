import { expect, test } from '@playwright/test';

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
