import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'src');
const checkMode = process.argv.includes('--check');
const colorUtility =
	/^(bg|text|border|ring|outline|decoration|fill|stroke|from|via|to|shadow|divide|placeholder|caret|accent)-(stone|amber|purple|emerald|cyan|red|slate|gray|zinc|neutral|orange|yellow|lime|green|teal|sky|blue|indigo|violet|fuchsia|pink|rose|white|black|transparent|current|inherit)(?:-([0-9]{2,3}))?(?:\/(?:[0-9]{1,3}|\[[^\]]+\]))?$/;
const arbitraryColorUtility =
	/^(?:bg|text|border|ring|outline|decoration|fill|stroke|from|via|to|shadow|divide|placeholder|caret|accent)-\[(?:[^\]]*#[\da-f]{3,8}\b|[^\]]*(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\()[^\]]*\]/i;
const nonChromaticPalettes = new Set(['transparent', 'current', 'inherit']);
const lexicalTokenPattern =
	/[A-Za-z0-9_:#.%/()\-]+(?:\[[^\]]*\][A-Za-z0-9_:#.%/()\-]*)?/g;
const interactionVariants = new Set([
	'active',
	'disabled',
	'enabled',
	'focus',
	'focus-visible',
	'focus-within',
	'group-focus',
	'group-hover',
	'hover',
	'visited',
]);

function splitVariants(token) {
	const parts = [];
	let current = '';
	let bracketDepth = 0;

	for (const character of token) {
		if (character === ':' && bracketDepth === 0) {
			parts.push(current);
			current = '';
			continue;
		}

		current += character;
		if (character === '[') bracketDepth += 1;
		if (character === ']') bracketDepth -= 1;
	}

	parts.push(current);
	return parts;
}

async function listFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const filePath = path.join(directory, entry.name);
			if (entry.isDirectory()) return listFiles(filePath);
			return [filePath];
		}),
	);
	return nested.flat();
}

function increment(record, key) {
	record[key] = (record[key] ?? 0) + 1;
}

const sourceFiles = (await listFiles(sourceRoot)).filter((filePath) =>
	/\.(?:jsx|tsx)$/.test(filePath),
);
const utilityCounts = {};
const paletteCounts = {};
const interactionCounts = {};
const uniqueTokens = new Set();
const uniqueUtilityForms = new Set();
const fileCounts = {};
const policyViolations = [];
let lexicalTokenOccurrences = 0;

for (const filePath of sourceFiles) {
	const source = await readFile(filePath, 'utf8');
	let fileCount = 0;

	for (const token of source.match(lexicalTokenPattern) ?? []) {
		const parts = splitVariants(token);
		const utility = parts.pop();
		const match = utility.match(colorUtility);
		const isPaletteColor =
			match && !nonChromaticPalettes.has(match[2]);
		const isLiteralArbitraryColor =
			arbitraryColorUtility.test(utility) ||
			/^(?:bg|text|border|ring|outline|decoration|fill|stroke|from|via|to|shadow|divide|placeholder|caret|accent)-\[(?:red|blue|green|yellow|orange|purple|pink|black|white|gray|grey|silver|maroon|navy|teal|olive|aqua|fuchsia|lime|indigo|violet)\]$/i.test(
				utility,
			);
		if (!isPaletteColor && !isLiteralArbitraryColor) continue;

		lexicalTokenOccurrences += 1;
		fileCount += 1;
		uniqueTokens.add(token);
		uniqueUtilityForms.add(utility);
		if (match) {
			increment(utilityCounts, match[1]);
			increment(paletteCounts, match[2]);
		} else {
			increment(utilityCounts, utility.slice(0, utility.indexOf('-[')));
			increment(paletteCounts, 'arbitrary-literal');
		}

		const interaction = parts.filter(
			(part) =>
				interactionVariants.has(part) ||
				part.startsWith('aria-') ||
				part.startsWith('data-'),
		);
		increment(interactionCounts, interaction.join(':') || 'base');
		policyViolations.push({
			file: path.relative(root, filePath),
			token,
		});
	}

	if (fileCount > 0) {
		fileCounts[path.relative(root, filePath)] = fileCount;
	}
}

const byFrequency = (record) =>
	Object.fromEntries(
		Object.entries(record).sort((left, right) => right[1] - left[1]),
	);
const topFiles = Object.entries(fileCounts)
	.sort((left, right) => right[1] - left[1])
	.slice(0, 15)
	.map(([file, occurrences]) => ({ file, occurrences }));

console.log(
	JSON.stringify(
		{
			scope: 'src/**/*.{jsx,tsx} literal color utility tokens',
			sourceFiles: sourceFiles.length,
			filesWithColorUtilities: Object.keys(fileCounts).length,
			lexicalTokenOccurrences,
			uniqueUtilityForms: uniqueUtilityForms.size,
			uniqueTokenForms: uniqueTokens.size,
			utilities: byFrequency(utilityCounts),
			palettes: byFrequency(paletteCounts),
			interactionVariants: byFrequency(interactionCounts),
			topFiles,
			policyStatus:
				policyViolations.length === 0 ? 'passed' : 'failed',
			policyViolations,
			limitations: [
				'Counts source-text tokens, not rendered DOM instances.',
				'Does not resolve runtime-generated classes or inline styles, CSS, SVG, and non-JSX color sources.',
				'Dynamic rarity colors in src/data.ts are a documented content-classification exception.',
			],
		},
		null,
		2,
	),
);

if (checkMode && policyViolations.length > 0) {
	console.error(
		'請將新增的硬編碼色彩 utility 改為核准的語意 token；若確有必要，先在主題規劃文件記錄例外。',
	);
	process.exitCode = 1;
}
