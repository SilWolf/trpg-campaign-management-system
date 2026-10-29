import ReactMarkdown from 'react-markdown';

export function CampaignJourneyMarkdown({ content }: { content: string }) {
	return (
		<ReactMarkdown
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
