import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const publicRoot = path.join(projectRoot, 'public');
const catalogRoot = path.join(publicRoot, 'data/blacksmith');
const distRoot = path.join(projectRoot, 'dist');
const checkDist = process.argv.includes('--dist');

function fail(message) {
	throw new Error(`靜態圖庫檢查失敗：${message}`);
}

async function readJson(filePath, label) {
	try {
		return JSON.parse(await readFile(filePath, 'utf8'));
	} catch (error) {
		if (error instanceof SyntaxError) {
			fail(`${label} 不是合法 JSON：${error.message}`);
		}
		throw error;
	}
}

function resolveSafeAsset(root, reference, label) {
	if (
		typeof reference !== 'string' ||
		!reference.startsWith('./') ||
		reference.includes('\\') ||
		reference.includes('?') ||
		reference.includes('#')
	) {
		fail(`${label} 必須是相對於 public/ 的穩定靜態路徑`);
	}
	const relativePath = reference.slice(2);
	const segments = relativePath.split('/');
	if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
		fail(`${label} 含有不安全的路徑片段`);
	}
	return path.join(root, ...segments);
}

async function verifyImage(filePath, expectedSize, label) {
	let metadata;
	try {
		metadata = await sharp(filePath).metadata();
	} catch (error) {
		fail(`${label} 無法讀取：${error.message}`);
	}
	if (
		metadata.format !== 'webp' ||
		metadata.width !== expectedSize ||
		metadata.height !== expectedSize
	) {
		fail(`${label} 必須是 ${expectedSize}×${expectedSize} WebP`);
	}
}

async function main() {
	const avatarIndex = await readJson(
		path.join(projectRoot, 'src/data/avatar-index.json'),
		'預設頭像索引',
	);
	if (
		avatarIndex.schemaVersion !== 1 ||
		!Array.isArray(avatarIndex.avatars) ||
		avatarIndex.avatars.length === 0
	) {
		fail('預設頭像索引版本或 avatars 陣列無效');
	}

	const avatarIds = new Set();
	const assets = [];
	for (const avatar of avatarIndex.avatars) {
		if (
			!avatar ||
			typeof avatar.id !== 'string' ||
			!/^[a-z0-9][a-z0-9-]*$/.test(avatar.id) ||
			avatarIds.has(avatar.id)
		) {
			fail('預設頭像 ID 無效或重複');
		}
		avatarIds.add(avatar.id);
		const filePath = resolveSafeAsset(publicRoot, avatar.image, `頭像 ${avatar.id}`);
		assets.push({ filePath, reference: avatar.image });
		await verifyImage(filePath, 256, `頭像 ${avatar.id}`);
	}
	if (!avatarIds.has('default')) fail('缺少 default 預設頭像');

	const catalogIndex = await readJson(
		path.join(catalogRoot, 'catalog-index.json'),
		'鍛造工坊圖鑑索引',
	);
	if (
		!Array.isArray(catalogIndex.catalogs) ||
		catalogIndex.catalogs.length === 0
	) {
		fail('鍛造工坊圖鑑索引缺少 catalogs');
	}

	const catalogIds = new Set();
	let itemCount = 0;
	for (const catalog of catalogIndex.catalogs) {
		if (
			!catalog ||
			typeof catalog.catalogId !== 'string' ||
			!/^[A-Za-z0-9._-]+$/.test(catalog.catalogId) ||
			catalogIds.has(catalog.catalogId)
		) {
			fail('圖鑑 ID 無效或重複');
		}
		catalogIds.add(catalog.catalogId);
		const itemsPath = resolveSafeAsset(
			catalogRoot,
			catalog.itemsFile,
			`圖鑑 ${catalog.catalogId} itemsFile`,
		);
		const document = await readJson(itemsPath, `圖鑑 ${catalog.catalogId}`);
		if (document.catalogId !== catalog.catalogId || !Array.isArray(document.items)) {
			fail(`圖鑑 ${catalog.catalogId} 的識別值或 items 欄位不符`);
		}

		const itemIds = new Set();
		for (const item of document.items) {
			if (
				!item ||
				typeof item.itemId !== 'string' ||
				!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(item.itemId) ||
				itemIds.has(item.itemId)
			) {
				fail(`圖鑑 ${catalog.catalogId} 有無效或重複的 itemId`);
			}
			itemIds.add(item.itemId);
			const stem = `./images/blacksmith/catalogs/${catalog.catalogId}/${item.itemId}`;
			if (item.icon !== `${stem}.webp`) {
				fail(`物品 ${catalog.catalogId}/${item.itemId} 的 icon 不是穩定靜態路徑`);
			}
			for (const [reference, size] of [
				[item.icon, 128],
				[`${stem}-4x.webp`, 512],
			]) {
				const filePath = resolveSafeAsset(
					publicRoot,
					reference,
					`物品 ${catalog.catalogId}/${item.itemId}`,
				);
				assets.push({ filePath, reference });
				await verifyImage(
					filePath,
					size,
					`物品 ${catalog.catalogId}/${item.itemId} (${size})`,
				);
			}
			itemCount += 1;
		}
	}

	if (checkDist) {
		try {
			await access(distRoot);
		} catch {
			fail('找不到 dist/；請先完成正式建置');
		}
		for (const { reference } of assets) {
			const filePath = resolveSafeAsset(distRoot, reference, '建置輸出資產');
			try {
				await access(filePath);
			} catch {
				fail(`正式建置未包含 ${reference}`);
			}
		}
		for (const catalog of catalogIndex.catalogs) {
			for (const reference of [catalog.itemsFile, catalog.lookupFile]) {
				if (typeof reference !== 'string') continue;
				const filePath = resolveSafeAsset(
					path.join(distRoot, 'data/blacksmith'),
					reference,
					`建置輸出圖鑑 ${catalog.catalogId}`,
				);
				try {
					await access(filePath);
				} catch {
					fail(`正式建置未包含圖鑑 ${catalog.catalogId} 的 ${reference}`);
				}
			}
		}
		try {
			await access(path.join(distRoot, 'data/blacksmith/catalog-index.json'));
		} catch {
			fail('正式建置未包含鍛造工坊圖鑑索引');
		}
	}

	console.log(
		`靜態圖庫檢查通過：${avatarIds.size} 個預設頭像、${itemCount} 項物品、${assets.length} 個 WebP${checkDist ? '（含 dist/ 輸出）' : ''}。`,
	);
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
