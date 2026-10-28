/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, BookOpen, Hammer } from 'lucide-react';

export const Route = createFileRoute('/_protected/blacksmith/')({
	component: BlacksmithHomePage,
});

function BlacksmithHomePage() {
	return (
		<main className='min-h-screen bg-background px-4 py-10 text-foreground sm:px-8'>
			<div className='mx-auto max-w-5xl'>
				<header className='mb-8 border-b border-primary/50 pb-6'>
					<p className='text-xs font-semibold tracking-[0.2em] text-muted-foreground'>
						BLACKSMITH · 工坊大廳
					</p>
					<h1
						data-testid='blacksmith-heading'
						className='mt-2 font-serif text-3xl font-bold text-foreground sm:text-4xl'
					>
						鍛造工坊
					</h1>
					<p className='mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground'>
						探索官方規則書，鍛造專屬物品，並瀏覽其他冒險者分享的作品。
					</p>
				</header>

					<div className='grid gap-4 sm:grid-cols-2'>
						<Link
							data-testid='blacksmith-officials-link'
							to='/blacksmith/officials'
							className='group flex min-h-48 items-center justify-between gap-6 rounded-2xl border border-primary/60 bg-gradient-to-br from-primary to-primary/90 p-7 shadow-lg transition hover:border-primary/80 hover:from-primary/90 sm:p-8'
						>
							<span>
								<BookOpen
									aria-hidden='true'
									className='mb-4 h-8 w-8 text-primary-foreground'
								/>
								<span className='block font-serif text-2xl font-bold text-primary-foreground'>
									官方規則書
								</span>
								<span className='mt-2 block text-sm text-primary-foreground/80'>
									瀏覽各規則書收錄的物品
								</span>
							</span>
							<ArrowRight
								aria-hidden='true'
								className='h-7 w-7 shrink-0 text-primary-foreground transition-transform group-hover:translate-x-1'
							/>
						</Link>

						<Link
							data-testid='blacksmith-workshop-link'
							to='/blacksmith/workshop'
							className='group flex min-h-48 items-center justify-between gap-6 rounded-2xl border border-border/70 bg-gradient-to-br from-background/60 to-background p-7 shadow-lg transition hover:border-border/80 hover:from-card/40 sm:p-8'
						>
							<span>
								<Hammer
									aria-hidden='true'
									className='mb-4 h-8 w-8 text-foreground'
								/>
								<span className='block font-serif text-2xl font-bold text-foreground'>
									我的鍛造與分享
								</span>
								<span className='mt-2 block text-sm text-muted-foreground'>
									管理私人樣板，或瀏覽冒險者分享
								</span>
							</span>
							<ArrowRight
								aria-hidden='true'
								className='h-7 w-7 shrink-0 text-foreground transition-transform group-hover:translate-x-1'
							/>
						</Link>
					</div>
				</div>
		</main>
	);
}
