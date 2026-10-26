import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const inputDirectory = path.join(scriptDirectory, 'inputs');
const outputDirectory = path.join(scriptDirectory, 'outputs');
const sheetSize = 2048;
const gridSize = 4;
const iconSize = sheetSize / gridSize;
const outputSize = 128;
const itemsPerSheet = gridSize * gridSize;
const maxItemsPerJson = itemsPerSheet * 4;

const fail = (message) => {
	throw new Error(`圖示切割失敗：${message}`);
};

const readItemDocument = async (fileName) => {
	const filePath = path.join(inputDirectory, fileName);
	let document;

	try {
		document = JSON.parse(await readFile(filePath, 'utf8'));
	} catch (error) {
		if (error instanceof SyntaxError) {
			fail(`${fileName} 不是合法 JSON：${error.message}`);
		}
		throw error;
	}

	if (
		document === null ||
		typeof document !== 'object' ||
		!Array.isArray(document.items)
	) {
		fail(`${fileName} 必須包含 items 陣列`);
	}
	if (document.items.length > maxItemsPerJson) {
		fail(
			`${fileName} 有 ${document.items.length} 筆物品，最多只能有 ${maxItemsPerJson} 筆`,
		);
	}

	return document.items;
};

const getItemId = (item, fileName, index) => {
	if (item === null || typeof item !== 'object' || Array.isArray(item)) {
		fail(`${fileName} 第 ${index + 1} 筆物品不是物件`);
	}

	const id = item.itemId ?? item.id;
	if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
		fail(`${fileName} 第 ${index + 1} 筆物品的 itemId/id 無效`);
	}

	return id;
};

const main = async () => {
	let inputEntries;
	try {
		inputEntries = await readdir(inputDirectory, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT') {
			fail(`找不到輸入資料夾：${inputDirectory}`);
		}
		throw error;
	}

	const jsonFiles = inputEntries
		.filter((entry) => entry.isFile() && /^\d+\.json$/.test(entry.name))
		.map((entry) => entry.name)
		.sort(
			(left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10),
		);

	if (jsonFiles.length === 0) {
		fail(
			`輸入資料夾中找不到 1.json、2.json 等數字命名的 JSON 檔案：${inputDirectory}`,
		);
	}

	const imageFiles = new Set(
		inputEntries
			.filter((entry) => entry.isFile() && /^\d+-\d+\.jfif$/.test(entry.name))
			.map((entry) => entry.name),
	);
	const numericFileNames = new Set();
	const itemIds = new Set();
	const sheets = [];
	const itemGroups = [];

	for (const fileName of jsonFiles) {
		const fileNumber = Number.parseInt(fileName, 10);
		if (!Number.isSafeInteger(fileNumber) || fileNumber < 1) {
			fail(`JSON 檔名必須使用正整數編號：${fileName}`);
		}
		if (numericFileNames.has(fileNumber)) {
			fail(`有多個 JSON 對應到同一組圖片編號：${fileName}`);
		}
		numericFileNames.add(fileNumber);

		const items = await readItemDocument(fileName);
		const ids = items.map((item, index) => {
			const id = getItemId(item, fileName, index);
			if (itemIds.has(id)) {
				fail(`物品 ID 重複：${id}`);
			}
			itemIds.add(id);
			return id;
		});
		itemGroups.push({ fileNumber, ids });

		for (let sheetIndex = 0; sheetIndex < 4; sheetIndex += 1) {
			const start = sheetIndex * itemsPerSheet;
			const sheetItemIds = ids.slice(start, start + itemsPerSheet);
			const imageName = `${fileNumber}-${sheetIndex + 1}.jfif`;
			const hasImage = imageFiles.has(imageName);

			if (sheetItemIds.length === 0) {
				if (hasImage) {
					fail(`${imageName} 沒有對應的物品`);
				}
				continue;
			}
			if (hasImage) {
				sheets.push({ fileName, imageName, itemIds: sheetItemIds });
			}
		}
	}

	for (const imageName of imageFiles) {
		const [, fileNumberText, sheetNumberText] = /^(\d+)-(\d+)\.jfif$/.exec(
			imageName,
		);
		const fileNumber = Number.parseInt(fileNumberText, 10);
		const sheetNumber = Number.parseInt(sheetNumberText, 10);
		if (
			!Number.isSafeInteger(fileNumber) ||
			!Number.isSafeInteger(sheetNumber) ||
			fileNumber < 1 ||
			sheetNumber < 1 ||
			sheetNumber > 4 ||
			imageName !== `${fileNumber}-${sheetNumber}.jfif`
		) {
			fail(`${imageName} 圖片名稱必須是「正整數-1 至 4.jfif」`);
		}
		if (!numericFileNames.has(fileNumber)) {
			fail(`${imageName} 找不到對應的 JSON 檔案`);
		}
	}

	const outputs = [];
	const missingSheets = [];
	for (const { fileNumber, ids } of itemGroups) {
		for (
			let sheetIndex = 0;
			sheetIndex < Math.ceil(ids.length / itemsPerSheet);
			sheetIndex += 1
		) {
			const imageName = `${fileNumber}-${sheetIndex + 1}.jfif`;
			if (!imageFiles.has(imageName)) {
				const missingCount = Math.min(
					itemsPerSheet,
					ids.length - sheetIndex * itemsPerSheet,
				);
				missingSheets.push(`${imageName}（略過 ${missingCount} 個圖示）`);
			}
		}
	}

	for (const sheet of sheets) {
		const imagePath = path.join(inputDirectory, sheet.imageName);
		let metadata;
		try {
			metadata = await sharp(imagePath).metadata();
		} catch (error) {
			fail(`${sheet.imageName} 無法讀取：${error.message}`);
		}

		if (
			metadata.format !== 'jpeg' ||
			metadata.width !== sheetSize ||
			metadata.height !== sheetSize
		) {
			fail(
				`${sheet.imageName} 必須是 ${sheetSize}x${sheetSize} 的 JFIF/JPEG 圖片`,
			);
		}

		for (const [index, id] of sheet.itemIds.entries()) {
			try {
				const originalSizeBuffer = await sharp(imagePath)
					.extract({
						left: (index % gridSize) * iconSize,
						top: Math.floor(index / gridSize) * iconSize,
						width: iconSize,
						height: iconSize,
					})
					.webp({ quality: 90, effort: 4 })
					.toBuffer();
				outputs.push({ fileName: `${id}-4x.webp`, buffer: originalSizeBuffer });

				const buffer = await sharp(imagePath)
					.extract({
						left: (index % gridSize) * iconSize,
						top: Math.floor(index / gridSize) * iconSize,
						width: iconSize,
						height: iconSize,
					})
					.resize(outputSize, outputSize)
					.webp({ quality: 90, effort: 4 })
					.toBuffer();
				outputs.push({ fileName: `${id}.webp`, buffer });
			} catch (error) {
				fail(
					`${sheet.imageName} 的第 ${index + 1} 格無法處理：${error.message}`,
				);
			}
		}
	}

	await mkdir(outputDirectory, { recursive: true });
	for (const output of outputs) {
		await writeFile(path.join(outputDirectory, output.fileName), output.buffer);
	}

	console.log(
		`完成：輸出 ${outputs.length} 個 128x128 WebP 圖示至 ${outputDirectory}`,
	);
	if (missingSheets.length > 0) {
		console.warn(
			`以下圖片缺失，已略過對應圖示：\n- ${missingSheets.join('\n- ')}`,
		);
	}
};

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
