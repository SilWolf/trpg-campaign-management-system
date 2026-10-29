import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
	DEFAULT_AVATAR_REFERENCE,
	normalizeAvatarReference,
	resolveImageReference,
} from '@/lib/imageReferences';

interface CharacterAvatarProps {
	avatar: string | null | undefined;
	alt: string;
	className?: string;
}

function getAvatarUrl(avatar: string): string {
	const resolved = resolveImageReference(
		normalizeAvatarReference(avatar),
		import.meta.env.BASE_URL,
	);
	if (resolved?.kind === 'static') return resolved.url;
	if (resolved?.kind === 'storage' && supabase) {
		return supabase.storage
			.from(resolved.bucket)
			.getPublicUrl(resolved.objectPath).data.publicUrl;
	}

	const fallback = resolveImageReference(
		DEFAULT_AVATAR_REFERENCE,
		import.meta.env.BASE_URL,
	);
	return fallback?.kind === 'static' ? fallback.url : '';
}

export function CharacterAvatar({
	avatar,
	alt,
	className,
}: CharacterAvatarProps) {
	const imageUrl = getAvatarUrl(avatar ?? DEFAULT_AVATAR_REFERENCE);
	const fallback = getAvatarUrl(DEFAULT_AVATAR_REFERENCE);
	const [failedSource, setFailedSource] = useState<string | null>(null);

	return (
		<img
			key={imageUrl}
			src={failedSource === imageUrl ? fallback : imageUrl}
			alt={alt}
			className={className}
			loading='lazy'
			onError={() => setFailedSource(imageUrl)}
		/>
	);
}
