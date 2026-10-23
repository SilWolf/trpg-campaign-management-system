export const ITEM_IMAGE_ICON_PREFIX = 'image:';

export const getItemImageUrl = (icon: string): string | null => {
	if (!icon.startsWith(ITEM_IMAGE_ICON_PREFIX)) return null;

	const imageUrl = icon.slice(ITEM_IMAGE_ICON_PREFIX.length);
	try {
		const url = new URL(imageUrl);
		if (url.protocol !== 'https:') return null;
		return imageUrl;
	} catch {
		return null;
	}
};
