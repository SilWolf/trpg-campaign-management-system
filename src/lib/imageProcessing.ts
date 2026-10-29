export type ImagePurpose = 'avatar' | 'item' | 'journey';

export type NormalizedImage = {
	variant: 'avatar' | '128' | '512' | 'journey';
	blob: Blob;
	width: number;
	height: number;
};

export type ImageNormalizationErrorCode =
	| 'file-too-large'
	| 'unsupported-format'
	| 'invalid-image'
	| 'image-too-large'
	| 'canvas-unavailable'
	| 'encoding-failed';

export class ImageNormalizationError extends Error {
	constructor(
		public readonly code: ImageNormalizationErrorCode,
		message: string,
	) {
		super(message);
		this.name = 'ImageNormalizationError';
	}
}

export const DEFAULT_IMAGE_LIMITS = {
	maxFileBytes: 10 * 1024 * 1024,
	maxPixels: 40_000_000,
} as const;

const INPUT_FORMATS = {
	'image/jpeg': 'image/jpeg',
	'image/jpg': 'image/jpeg',
	'image/png': 'image/png',
	'image/webp': 'image/webp',
	'image/avif': 'image/avif',
} as const;

type InputMimeType = keyof typeof INPUT_FORMATS;

function detectImageMime(bytes: Uint8Array): InputMimeType | null {
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return 'image/png';
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'image/jpeg';
	}
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return 'image/webp';
	}
	if (
		bytes.length >= 12 &&
		bytes[4] === 0x66 &&
		bytes[5] === 0x74 &&
		bytes[6] === 0x79 &&
		bytes[7] === 0x70 &&
		bytes[8] === 0x61 &&
		bytes[9] === 0x76 &&
		bytes[10] === 0x69 &&
		(bytes[11] === 0x66 || bytes[11] === 0x73)
	) {
		return 'image/avif';
	}
	return null;
}

function getOutputDimensions(
	width: number,
	height: number,
	maxWidth: number,
	maxHeight: number,
): { width: number; height: number } {
	const scale = Math.min(1, maxWidth / width, maxHeight / height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

function encodeCanvas(
	canvas: HTMLCanvasElement,
	quality: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		try {
			canvas.toBlob(
				(blob) => {
					if (!blob || blob.type !== 'image/webp') {
						reject(
							new ImageNormalizationError(
								'encoding-failed',
								'瀏覽器無法將圖片編碼為 WebP。',
							),
						);
						return;
					}
					resolve(blob);
				},
				'image/webp',
				quality,
			);
		} catch {
			reject(
				new ImageNormalizationError(
					'encoding-failed',
					'瀏覽器無法將圖片編碼為 WebP。',
				),
			);
		}
	});
}

async function normalizeVariant(
	bitmap: ImageBitmap,
	variant: NormalizedImage['variant'],
	maxWidth: number,
	maxHeight: number,
	quality: number,
	cropSquare: boolean,
): Promise<NormalizedImage> {
	const dimensions = cropSquare
		? { width: maxWidth, height: maxHeight }
		: getOutputDimensions(bitmap.width, bitmap.height, maxWidth, maxHeight);
	const canvas = document.createElement('canvas');
	canvas.width = dimensions.width;
	canvas.height = dimensions.height;
	try {
		const context = canvas.getContext('2d');
		if (!context) {
			throw new ImageNormalizationError(
				'canvas-unavailable',
				'瀏覽器無法建立圖片處理畫布。',
			);
		}

		if (cropSquare) {
			const scale = Math.max(
				dimensions.width / bitmap.width,
				dimensions.height / bitmap.height,
			);
			const sourceWidth = dimensions.width / scale;
			const sourceHeight = dimensions.height / scale;
			const sourceX = (bitmap.width - sourceWidth) / 2;
			const sourceY = (bitmap.height - sourceHeight) / 2;
			context.drawImage(
				bitmap,
				sourceX,
				sourceY,
				sourceWidth,
				sourceHeight,
				0,
				0,
				dimensions.width,
				dimensions.height,
			);
		} else {
			context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
		}

		return {
			variant,
			blob: await encodeCanvas(canvas, quality),
			width: dimensions.width,
			height: dimensions.height,
		};
	} catch (error) {
		if (error instanceof ImageNormalizationError) throw error;
		throw new ImageNormalizationError(
			'encoding-failed',
			'圖片轉換失敗，請嘗試其他圖片。',
		);
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
}

export async function normalizeImage(
	file: File,
	purpose: ImagePurpose,
): Promise<NormalizedImage[]> {
	if (file.size > DEFAULT_IMAGE_LIMITS.maxFileBytes) {
		throw new ImageNormalizationError(
			'file-too-large',
			'圖片檔案超過 10 MB 限制。',
		);
	}

	const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
	const detectedMime = detectImageMime(header);
	const declaredMime = file.type.toLowerCase() as InputMimeType | '';
	if (
		!detectedMime ||
		(declaredMime !== '' &&
			(!Object.hasOwn(INPUT_FORMATS, declaredMime) ||
				INPUT_FORMATS[declaredMime] !== detectedMime))
	) {
		throw new ImageNormalizationError(
			'unsupported-format',
			'僅支援有效的 JPEG、PNG、WebP 或 AVIF 圖片。',
		);
	}

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new ImageNormalizationError(
			'invalid-image',
			'圖片無法解碼，請選擇未損毀的圖片檔案。',
		);
	}

	try {
		if (
			bitmap.width <= 0 ||
			bitmap.height <= 0 ||
			bitmap.width * bitmap.height > DEFAULT_IMAGE_LIMITS.maxPixels
		) {
			throw new ImageNormalizationError(
				'image-too-large',
				'圖片像素總數超出 4,000 萬像素限制。',
			);
		}

		if (purpose === 'avatar') {
			return [await normalizeVariant(bitmap, 'avatar', 256, 256, 0.85, true)];
		}

		if (purpose === 'item') {
			return await Promise.all([
				normalizeVariant(bitmap, '128', 128, 128, 0.85, false),
				normalizeVariant(bitmap, '512', 512, 512, 0.85, false),
			]);
		}

		return [
			await normalizeVariant(
				bitmap,
				'journey',
				1200,
				Number.POSITIVE_INFINITY,
				0.8,
				false,
			),
		];
	} finally {
		bitmap.close();
	}
}
