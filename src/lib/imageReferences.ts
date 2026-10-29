import avatarIndex from '@/data/avatar-index.json';

export const IMAGE_REFERENCE_PREFIX = {
	avatar: 'avatar:',
	storage: 'storage:',
	external: 'image:',
} as const;

export const DEFAULT_AVATAR_REFERENCE = `${IMAGE_REFERENCE_PREFIX.avatar}default`;

export const IMAGE_STORAGE_BUCKETS = [
	'user-uploads',
	'blacksmith-assets',
	'campaign-assets',
] as const;

export type ImageStorageBucket = (typeof IMAGE_STORAGE_BUCKETS)[number];

export type ResolvedImageReference =
	| { kind: 'static'; url: string }
	| { kind: 'external'; url: string }
	| {
			kind: 'storage';
			bucket: ImageStorageBucket;
			objectPath: string;
			assetType: 'avatar' | 'blacksmith-item' | 'campaign-item' | 'journey';
	  };

type StorageAssetType = Extract<
	ResolvedImageReference,
	{ kind: 'storage' }
>['assetType'];

const DEFAULT_AVATARS: Readonly<Record<string, string>> = Object.fromEntries(
	avatarIndex.avatars.map(({ id, image }) => [id, image]),
);

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

function isSafeStaticPath(path: string): boolean {
	return (
		path.length > 0 &&
		!path.includes('\\') &&
		!path.includes('?') &&
		!path.includes('#') &&
		path.split('/').every(
			(segment) =>
				segment.length > 0 &&
				segment !== '.' &&
				segment !== '..' &&
				SAFE_PATH_SEGMENT.test(segment),
		)
	);
}

function isSafeStoragePath(path: string): boolean {
	return (
		!path.includes('\\') &&
		!path.includes('?') &&
		!path.includes('#') &&
		path.split('/').every(
			(segment) =>
				segment.length > 0 &&
				segment !== '.' &&
				segment !== '..' &&
				SAFE_PATH_SEGMENT.test(segment),
		)
	);
}

function getStorageAssetType(
	bucket: ImageStorageBucket,
	segments: string[],
): StorageAssetType | null {
	if (
		bucket === 'user-uploads' &&
		segments.length === 4 &&
		UUID_PATTERN.test(segments[0]) &&
		segments[1] === 'avatars' &&
		UUID_PATTERN.test(segments[2]) &&
		segments[3] === '256.webp'
	) {
		return 'avatar';
	}

	if (
		bucket === 'blacksmith-assets' &&
		segments.length === 4 &&
		UUID_PATTERN.test(segments[0]) &&
		segments[1] === 'items' &&
		UUID_PATTERN.test(segments[2]) &&
		(segments[3] === '128.webp' || segments[3] === '512.webp')
	) {
		return 'blacksmith-item';
	}

	if (
		bucket === 'campaign-assets' &&
		segments.length === 4 &&
		SAFE_PATH_SEGMENT.test(segments[0]) &&
		segments[1] === 'items' &&
		UUID_PATTERN.test(segments[2]) &&
		(segments[3] === '128.webp' || segments[3] === '512.webp')
	) {
		return 'campaign-item';
	}

	if (
		bucket === 'campaign-assets' &&
		segments.length === 5 &&
		SAFE_PATH_SEGMENT.test(segments[0]) &&
		segments[1] === 'journeys' &&
		SAFE_PATH_SEGMENT.test(segments[2]) &&
		UUID_PATTERN.test(segments[3]) &&
		segments[4] === 'image.webp'
	) {
		return 'journey';
	}

	return null;
}

function withBaseUrl(path: string, baseUrl: string): string {
	const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
	return `${normalizedBaseUrl}${path}`;
}

function resolveStorageReference(
	value: string,
): Extract<ResolvedImageReference, { kind: 'storage' }> | null {
	const reference = value.slice(IMAGE_REFERENCE_PREFIX.storage.length);
	const separator = reference.indexOf('/');
	if (separator <= 0) return null;

	const bucket = reference.slice(0, separator);
	if (!IMAGE_STORAGE_BUCKETS.includes(bucket as ImageStorageBucket)) return null;

	const objectPath = reference.slice(separator + 1);
	if (!isSafeStoragePath(objectPath)) return null;

	const storageBucket = bucket as ImageStorageBucket;
	const assetType = getStorageAssetType(storageBucket, objectPath.split('/'));
	if (!assetType) return null;

	return { kind: 'storage', bucket: storageBucket, objectPath, assetType };
}

export function resolveImageReference(
	reference: string,
	baseUrl: string,
): ResolvedImageReference | null {
	if (reference.startsWith(IMAGE_REFERENCE_PREFIX.avatar)) {
		const avatarId = reference.slice(IMAGE_REFERENCE_PREFIX.avatar.length);
		const path = DEFAULT_AVATARS[avatarId];
		if (!path) return null;
		return { kind: 'static', url: withBaseUrl(path.slice(2), baseUrl) };
	}

	if (reference.startsWith(IMAGE_REFERENCE_PREFIX.storage)) {
		return resolveStorageReference(reference);
	}

	if (reference.startsWith('./images/')) {
		const path = reference.slice('./'.length);
		return isSafeStaticPath(path)
			? { kind: 'static', url: withBaseUrl(path, baseUrl) }
			: null;
	}

	if (!reference.startsWith(IMAGE_REFERENCE_PREFIX.external)) return null;

	const imageUrl = reference.slice(IMAGE_REFERENCE_PREFIX.external.length);
	try {
		const url = new URL(imageUrl);
		if (
			url.protocol !== 'https:' ||
			url.username.length > 0 ||
			url.password.length > 0
		) {
			return null;
		}
		return { kind: 'external', url: imageUrl };
	} catch {
		return null;
	}
}

export function normalizeAvatarReference(
	reference: string | null | undefined,
): string {
	if (!reference) return DEFAULT_AVATAR_REFERENCE;
	const resolved = resolveImageReference(reference, import.meta.env.BASE_URL);
	if (
		(reference.startsWith(IMAGE_REFERENCE_PREFIX.avatar) &&
			resolved?.kind === 'static') ||
		(resolved?.kind === 'storage' && resolved.assetType === 'avatar')
	) {
		return reference;
	}
	return DEFAULT_AVATAR_REFERENCE;
}

export function resolveItemImageUrl(
	icon: string,
	baseUrl: string,
): string | null {
	const resolved = resolveImageReference(icon, baseUrl);
	return resolved?.kind === 'static' || resolved?.kind === 'external'
		? resolved.url
		: null;
}
