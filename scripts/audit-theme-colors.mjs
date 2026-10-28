import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'src');
const colorUtility =
	/^(bg|text|border|ring|outline|decoration|fill|stroke|from|via|to|shadow|divide|placeholder|caret|accent)-(stone|amber|purple|emerald|cyan|red|slate|gray|zinc|neutral|orange|yellow|lime|green|teal|sky|blue|indigo|violet|fuchsia|pink|rose|white|black|transparent|current|inherit)(?:-([0-9]{2,3}))?(?:\/(?:[0-9]{1,3}|\[[^\]]+\]))?$/;
const lexicalTokenPattern = /[A-Za-z0-9_:\-\[\]#.%/()]+/g;
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
	filePath.endsWith('.tsx'),
);
const utilityCounts = {};
const paletteCounts = {};
const interactionCounts = {};
const uniqueTokens = new Set();
const uniqueUtilityForms = new Set();
const fileCounts = {};
let lexicalTokenOccurrences = 0;

for (const filePath of sourceFiles) {
	const source = await readFile(filePath, 'utf8');
	let fileCount = 0;

	for (const token of source.match(lexicalTokenPattern) ?? []) {
		const parts = token.split(':');
		const utility = parts.pop();
		const match = utility.match(colorUtility);
		if (!match) continue;

		lexicalTokenOccurrences += 1;
		fileCount += 1;
		uniqueTokens.add(token);
		uniqueUtilityForms.add(utility);
		increment(utilityCounts, match[1]);
		increment(paletteCounts, match[2]);

		const interaction = parts.filter(
			(part) =>
				interactionVariants.has(part) ||
				part.startsWith('aria-') ||
				part.startsWith('data-'),
		);
		increment(interactionCounts, interaction.join(':') || 'base');
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
			scope: 'src/**/*.tsx literal color utility tokens',
			sourceFiles: sourceFiles.length,
			filesWithColorUtilities: Object.keys(fileCounts).length,
			lexicalTokenOccurrences,
			uniqueUtilityForms: uniqueUtilityForms.size,
			uniqueTokenForms: uniqueTokens.size,
			utilities: byFrequency(utilityCounts),
			palettes: byFrequency(paletteCounts),
			interactionVariants: byFrequency(interactionCounts),
			topFiles,
			limitations: [
				'Counts source-text tokens, not rendered DOM instances.',
				'Does not resolve runtime-generated classes or non-TSX color sources.',
				'Palette utility count excludes arbitrary values such as bg-[#0c0a09].',
			],
		},
		null,
		2,
	),
);
