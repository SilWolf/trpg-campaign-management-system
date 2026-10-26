export const ITEM_IMAGE_ICON_PREFIX = 'image:';

export const getItemImageUrl = (icon: string): string | null => {
	if (icon.startsWith('./images/')) {
		const baseUrl = import.meta.env.BASE_URL.endsWith('/')
			? import.meta.env.BASE_URL
			: `${import.meta.env.BASE_URL}/`;
		return `${baseUrl}${icon.slice(2)}`;
	}

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
