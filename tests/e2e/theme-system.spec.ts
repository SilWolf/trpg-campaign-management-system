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

test('DM 語境色彩依主題切換並維持文字對比', async ({ page }) => {
	await page.goto('/login');

	const colors = await page.evaluate(() => {
		const root = document.documentElement;
		return ['default', 'dnd', 'printing'].map((theme) => {
			root.dataset.theme = theme;
			const styles = getComputedStyle(root);
			const probe = document.createElement('span');
			probe.style.color = 'var(--color-dm)';
			probe.style.backgroundColor = 'var(--color-dm-foreground)';
			document.body.append(probe);
			const utilityColors = getComputedStyle(probe);
			const mappedDm = utilityColors.color;
			const mappedForeground = utilityColors.backgroundColor;
			probe.remove();
			return {
				theme,
				dm: styles.getPropertyValue('--dm').trim(),
				foreground: styles.getPropertyValue('--dm-foreground').trim(),
				mappedDm,
				mappedForeground,
			};
		});
	});

	expect(colors).toEqual([
		{
			theme: 'default',
			dm: '#38bdf8',
			foreground: '#082f49',
			mappedDm: 'rgb(56, 189, 248)',
			mappedForeground: 'rgb(8, 47, 73)',
		},
		{
			theme: 'dnd',
			dm: '#2563eb',
			foreground: '#ffffff',
			mappedDm: 'rgb(37, 99, 235)',
			mappedForeground: 'rgb(255, 255, 255)',
		},
		{
			theme: 'printing',
			dm: '#6b21a8',
			foreground: '#ffffff',
			mappedDm: 'rgb(107, 33, 168)',
			mappedForeground: 'rgb(255, 255, 255)',
		},
	]);

	const contrastRatios = await page.evaluate((themeColors) => {
		const luminance = (hex: string) => {
			const channels = hex
				.slice(1)
				.match(/.{2}/g)
				?.map((channel) => parseInt(channel, 16) / 255);
			if (!channels || channels.length !== 3) {
				throw new Error(`無法解析 DM 主題色彩：${hex}`);
			}
			return channels
				.map((channel) =>
					channel <= 0.04045
						? channel / 12.92
						: ((channel + 0.055) / 1.055) ** 2.4,
				)
				.reduce(
					(sum, channel, index) =>
						sum + channel * [0.2126, 0.7152, 0.0722][index],
					0,
				);
		};

		return themeColors.map(({ dm, foreground }) => {
			const [lighter, darker] = [luminance(dm), luminance(foreground)].sort(
				(left, right) => right - left,
			);
			return (lighter + 0.05) / (darker + 0.05);
		});
	}, colors);

	for (const ratio of contrastRatios) {
		expect(ratio).toBeGreaterThanOrEqual(4.5);
	}
});

test('六種稀有度在三套主題維持 AA 對比與色彩區別', async ({ page }) => {
	await page.goto('/login');

	const rarities = [
		'common',
		'uncommon',
		'rare',
		'very-rare',
		'legendary',
		'artifact',
	] as const;
	const contrastResults: { theme: string; rarity: string; ratio: number }[] = [];

	for (const theme of ['default', 'dnd', 'printing']) {
		await page
			.getByRole('combobox', { name: '介面主題' })
			.selectOption(theme);
		const samples = await page.evaluate((rarityNames) => {
			const container = document.createElement('div');
			document.body.append(container);
			const elements = rarityNames.map((rarity) => {
				const element = document.createElement('span');
				element.className = `rarity-${rarity}`;
				element.style.color = 'var(--rarity-foreground)';
				element.style.backgroundColor = 'var(--rarity-background)';
				element.style.backgroundImage = 'var(--rarity-gradient)';
				element.style.border = '1px solid var(--rarity-border)';
				element.style.boxShadow = 'var(--rarity-glow)';
				container.append(element);

				const style = getComputedStyle(element);
				return {
					rarity,
					foreground: style.color,
					background: style.backgroundColor,
					backgroundImage: style.backgroundImage,
					border: style.borderTopColor,
					glow: style.getPropertyValue('--rarity-glow').trim(),
				};
			});
			container.remove();
			return elements;
		}, rarities);

		const luminance = (color: string) => {
			const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
			if (!channels || channels.length !== 3) {
				throw new Error(`無法解析稀有度色彩：${color}`);
			}
			return channels
				.map((channel) => channel / 255)
				.map((channel) =>
					channel <= 0.04045
						? channel / 12.92
						: ((channel + 0.055) / 1.055) ** 2.4,
				)
				.reduce(
					(sum, channel, index) =>
						sum + channel * [0.2126, 0.7152, 0.0722][index],
					0,
				);
		};

		const themeResults = samples.map((sample) => {
			const foregroundLuminance = luminance(sample.foreground);
			const backgrounds = [
				sample.background,
				...Array.from(
					sample.backgroundImage.matchAll(/rgba?\([^)]+\)/g),
					([color]) => color,
				),
			];
			const ratio = Math.min(
				...backgrounds.map((background) => {
					const backgroundLuminance = luminance(background);
					const [lighter, darker] = [
						foregroundLuminance,
						backgroundLuminance,
					].sort((left, right) => right - left);
					return (lighter + 0.05) / (darker + 0.05);
				}),
			);
			expect(ratio, `${theme}/${sample.rarity} 對比`).toBeGreaterThanOrEqual(4.5);
			expect(sample.border, `${theme}/${sample.rarity} 邊框`).not.toBe(
				'rgba(0, 0, 0, 0)',
			);
			contrastResults.push({ theme, rarity: sample.rarity, ratio });
			return sample;
		});

		if (theme === 'printing') {
			expect(themeResults.every((sample) => sample.glow === 'none')).toBe(true);
			const coloredBackgrounds = themeResults.map((sample) => {
				const channels = sample.background.match(/[\d.]+/g)?.slice(0, 3);
				expect(channels).toHaveLength(3);
				expect(new Set(channels).size).toBeGreaterThan(1);
				return sample.background;
			});
			expect(new Set(coloredBackgrounds).size).toBe(rarities.length);
		}
	}

	expect(contrastResults).toHaveLength(rarities.length * 3);
});

test('列印預覽移除操作介面並保留主題色彩', async ({ page }) => {
	await page.emulateMedia({ media: 'print' });
	await page.goto('/login');
	await page.locator('html').evaluate((element) => {
		element.dataset.theme = 'printing';
	});

	await expect(page.locator('nav')).toBeHidden();
	await expect(page.getByRole('button', { name: '登入戰役軍械庫' })).toBeHidden();

	const printStyles = await page.evaluate(() => {
		const main = document.querySelector('main');
		if (!main) throw new Error('找不到主要內容區。');
		const article = document.createElement('article');
		const link = document.createElement('a');
		const dmLabel = document.createElement('span');
		article.style.border = '1px solid red';
		article.className = 'border-dm';
		dmLabel.className = 'text-dm';
		dmLabel.style.color = 'red';
		article.append(link);
		article.append(dmLabel);
		main.append(article);

		const result = {
			background: getComputedStyle(document.body).backgroundColor,
			foreground: getComputedStyle(main).color,
			articleBorder: getComputedStyle(article).borderTopColor,
			dmText: getComputedStyle(dmLabel).color,
			articleBreakInside: getComputedStyle(article).breakInside,
			linkDecoration: getComputedStyle(link).textDecorationLine,
			hasBackgroundImage: Array.from(document.querySelectorAll('*')).some(
				(element) => getComputedStyle(element).backgroundImage !== 'none',
			),
			hasBoxShadow: Array.from(document.querySelectorAll('*')).some(
				(element) => getComputedStyle(element).boxShadow !== 'none',
			),
			hasTextShadow: Array.from(document.querySelectorAll('*')).some(
				(element) => getComputedStyle(element).textShadow !== 'none',
			),
		};
		article.remove();
		return result;
	});
	expect(printStyles).toEqual({
		background: 'rgb(255, 255, 255)',
		foreground: 'rgb(17, 17, 17)',
		articleBorder: 'rgb(107, 33, 168)',
		dmText: 'rgb(107, 33, 168)',
		articleBreakInside: 'avoid',
		linkDecoration: 'underline',
		hasBackgroundImage: false,
		hasBoxShadow: false,
		hasTextShadow: false,
	});
});

test('三套主題在登入與戰役設定頁維持文字對比並避免手機水平溢位', async ({
	page,
}) => {
	await mockSupabase(page, {
		campaignSettingsRole: 'dm',
		campaignInventoryRole: 'dm',
		campaignShopSeed: true,
	});
	await seedAuthenticatedSession(page);

	const pages = [
		{ url: '/login', heading: '[data-testid="login-heading"]' },
		{
			url: '/campaigns/settings-campaign/settings',
			heading: '[data-testid="campaign-settings-heading"]',
		},
		{ url: '/blacksmith', heading: '[data-testid="blacksmith-heading"]' },
		{ url: '/blacksmith/officials/dnd-2024-srd-5.2' },
		{ url: '/campaigns/inventory-campaign' },
		{ url: '/campaigns/settings-campaign/shops/mock-shop-1' },
	];
	const viewports = [
		{ width: 1280, height: 800 },
		{ width: 375, height: 812 },
	];

	for (const viewport of viewports) {
		await page.setViewportSize(viewport);
		for (const { url, heading } of pages) {
			await page.goto(url);
			if (url.endsWith('/settings')) {
				await expect(page.getByTestId('campaign-settings-heading')).toBeVisible();
			} else if (url.includes('/campaigns/inventory-campaign')) {
				await expect(
					page.getByTestId('inventory-item-inventory-public-potion'),
				).toBeVisible();
			} else if (url.includes('/shops/')) {
				await expect(page.getByTestId('shop-item-details')).toBeVisible();
			} else if (url.includes('/blacksmith/officials/')) {
				await page.getByTestId('blacksmith-search').fill('午夜之淚');
				await expect(page.getByTestId('blacksmith-item-rarity')).toBeVisible();
			}

			if (heading) {
				await expect(page.locator(heading)).toBeVisible();
			}

			const themeSwitcher = page.getByRole('combobox', { name: '介面主題' });
			for (const theme of ['default', 'dnd', 'printing']) {
				await themeSwitcher.selectOption(theme);
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				await expectNoOverflowAndReadableMainText(page);
				if (heading) await expectHeadingUsesMainForeground(page, heading);
				if (url.includes('/blacksmith/officials/')) {
					await expect(page.getByTestId('blacksmith-item-detail')).toBeVisible();
				}
				if (theme === 'printing') {
					const effects = await page.evaluate(() => {
						const hasEffect = (selector: string, property: string) =>
							Array.from(document.querySelectorAll(selector)).some(
								(element) =>
									getComputedStyle(element).getPropertyValue(property) !==
									'none',
							);

						return {
							hasGradient: hasEffect(
								'[class*="bg-gradient-to-"], [class*="bg-[radial-gradient"]',
								'background-image',
							),
							hasShadow: hasEffect(
								'[class*="shadow-"], [class~="shadow"]',
								'box-shadow',
							),
							hasDropShadow: hasEffect('[class*="drop-shadow"]', 'filter'),
						};
					});
					expect(effects).toEqual({
						hasGradient: false,
						hasShadow: false,
						hasDropShadow: false,
					});
				}
			}
		}
	}
});
