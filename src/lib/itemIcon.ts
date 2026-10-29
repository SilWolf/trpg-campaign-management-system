import {
	IMAGE_REFERENCE_PREFIX,
	resolveImageReference,
	resolveItemImageUrl,
} from '@/lib/imageReferences';
import { supabase } from '@/lib/supabase';

export const ITEM_IMAGE_ICON_PREFIX = IMAGE_REFERENCE_PREFIX.external;

export const getItemImageUrl = (
	icon: string,
	variant: '128' | '512' = '128',
): string | null => {
	const resolved = resolveImageReference(icon, import.meta.env.BASE_URL);
	if (
		resolved?.kind === 'storage' &&
		(resolved.assetType === 'blacksmith-item' ||
			resolved.assetType === 'campaign-item')
	) {
		const objectPath = resolved.objectPath.replace(
			/\/(?:128|512)\.webp$/,
			`/${variant}.webp`,
		);
		return (
			supabase?.storage.from(resolved.bucket).getPublicUrl(objectPath).data
				.publicUrl ?? null
		);
	}
	if (
		resolved?.kind === 'static' &&
		variant === '512' &&
		resolved.url.includes('/images/blacksmith/catalogs/') &&
		resolved.url.endsWith('.webp')
	) {
		return resolved.url.replace(/\.webp$/, '-4x.webp');
	}
	return resolveItemImageUrl(icon, import.meta.env.BASE_URL);
};
