import { defaultUrlTransform, default as ReactMarkdown } from 'react-markdown';
import { resolveImageReference } from '@/lib/imageReferences';
import { supabase } from '@/lib/supabase';

function resolveJourneyImageUrl(
	source: string,
	campaignId: string,
): string | null {
	const reference = source.startsWith('https:')
		? `image:${source}`
		: source;
	const resolved = resolveImageReference(reference, import.meta.env.BASE_URL);
	if (resolved?.kind === 'external') return resolved.url;
	if (
		resolved?.kind !== 'storage' ||
		resolved.assetType !== 'journey' ||
		resolved.bucket !== 'campaign-assets' ||
		resolved.objectPath.split('/')[0] !== campaignId
	) {
		return null;
	}

	return (
		supabase?.storage.from(resolved.bucket).getPublicUrl(resolved.objectPath).data
			.publicUrl ?? null
	);
}

export function CampaignJourneyMarkdown({
	content,
	campaignId,
}: {
	content: string;
	campaignId: string;
}) {
	return (
		<ReactMarkdown
			urlTransform={(url, key, node) => {
				if (key === 'src' && node.tagName === 'img') {
					return resolveJourneyImageUrl(url, campaignId) ? url : '';
				}
				return defaultUrlTransform(url);
			}}
			components={{
				a: ({ children, href }) => (
					<a
						href={href}
						target='_blank'
						rel='noreferrer'
						className='text-primary-foreground underline underline-offset-2'
					>
						{children}
					</a>
				),
				img: ({ src, alt, title }) => {
					if (!src) return null;
					const imageUrl = resolveJourneyImageUrl(src, campaignId);
					if (!imageUrl) return null;
					return (
						<img
							src={imageUrl}
							alt={alt ?? ''}
							title={title}
							loading='lazy'
							referrerPolicy='no-referrer'
							className='my-3 h-auto max-w-full rounded-md border border-border'
						/>
					);
				},
				h1: ({ children }) => (
					<h1 className='my-3 font-serif text-2xl font-bold text-foreground'>
						{children}
					</h1>
				),
				h2: ({ children }) => (
					<h2 className='my-3 font-serif text-xl font-bold text-foreground'>
						{children}
					</h2>
				),
				h3: ({ children }) => (
					<h3 className='my-2 font-serif text-lg font-bold text-foreground'>
						{children}
					</h3>
				),
				p: ({ children }) => (
					<p className='my-2 break-words leading-7 text-foreground'>
						{children}
					</p>
				),
				ul: ({ children }) => (
					<ul className='my-2 list-disc space-y-1 pl-6 text-foreground'>
						{children}
					</ul>
				),
				ol: ({ children }) => (
					<ol className='my-2 list-decimal space-y-1 pl-6 text-foreground'>
						{children}
					</ol>
				),
				blockquote: ({ children }) => (
					<blockquote className='my-3 border-l-2 border-primary/70 pl-4 text-muted-foreground'>
						{children}
					</blockquote>
				),
				code: ({ children }) => (
					<code className='rounded bg-background px-1.5 py-0.5 font-mono text-sm text-primary-foreground'>
						{children}
					</code>
				),
				pre: ({ children }) => (
					<pre className='my-3 max-w-full overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground'>
						{children}
					</pre>
				),
			}}
		>
			{content}
		</ReactMarkdown>
	);
}
