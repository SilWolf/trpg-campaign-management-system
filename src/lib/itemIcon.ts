import {
	IMAGE_REFERENCE_PREFIX,
	resolveItemImageUrl,
} from '@/lib/imageReferences';

export const ITEM_IMAGE_ICON_PREFIX = IMAGE_REFERENCE_PREFIX.external;

export const getItemImageUrl = (icon: string): string | null => {
	return resolveItemImageUrl(icon, import.meta.env.BASE_URL);
};
