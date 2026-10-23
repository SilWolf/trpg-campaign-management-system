/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, BookOpen, Hammer } from 'lucide-react';

export const Route = createFileRoute('/_protected/blacksmith/')({
	component: BlacksmithHomePage,
});

function BlacksmithHomePage() {
	return (
		<main className='min-h-screen bg-[#0c0a09] px-4 py-10 text-stone-200 sm:px-8'>
			<div className='mx-auto max-w-5xl'>
				<header className='mb-8 border-b border-amber-900/50 pb-6'>
					<p className='text-xs font-semibold tracking-[0.2em] text-amber-500'>
						BLACKSMITH · 工坊大廳
					</p>
					<h1
						data-testid='blacksmith-heading'
						className='mt-2 font-serif text-3xl font-bold text-amber-100 sm:text-4xl'
					>
						鍛造工坊
					</h1>
					<p className='mt-2 max-w-2xl text-sm leading-relaxed text-stone-400'>
						探索官方規則書，鍛造專屬物品，並瀏覽其他冒險者分享的作品。
					</p>
				</header>

					<div className='grid gap-4 sm:grid-cols-2'>
						<Link
							data-testid='blacksmith-officials-link'
							to='/blacksmith/officials'
							className='group flex min-h-48 items-center justify-between gap-6 rounded-2xl border border-amber-700/60 bg-gradient-to-br from-amber-950/70 to-stone-950 p-7 shadow-lg shadow-amber-950/20 transition hover:border-amber-400/80 hover:from-amber-900/50 sm:p-8'
						>
							<span>
								<BookOpen
									aria-hidden='true'
									className='mb-4 h-8 w-8 text-amber-400'
								/>
								<span className='block font-serif text-2xl font-bold text-amber-100'>
									官方規則書
								</span>
								<span className='mt-2 block text-sm text-stone-400'>
									瀏覽各規則書收錄的物品
								</span>
							</span>
							<ArrowRight
								aria-hidden='true'
								className='h-7 w-7 shrink-0 text-amber-400 transition-transform group-hover:translate-x-1'
							/>
						</Link>

						<Link
							data-testid='blacksmith-workshop-link'
							to='/blacksmith/workshop'
							className='group flex min-h-48 items-center justify-between gap-6 rounded-2xl border border-purple-800/70 bg-gradient-to-br from-purple-950/60 to-stone-950 p-7 shadow-lg shadow-purple-950/20 transition hover:border-purple-400/80 hover:from-purple-900/40 sm:p-8'
						>
							<span>
								<Hammer
									aria-hidden='true'
									className='mb-4 h-8 w-8 text-purple-300'
								/>
								<span className='block font-serif text-2xl font-bold text-purple-100'>
									我的鍛造與分享
								</span>
								<span className='mt-2 block text-sm text-stone-400'>
									管理私人樣板，或瀏覽冒險者分享
								</span>
							</span>
							<ArrowRight
								aria-hidden='true'
								className='h-7 w-7 shrink-0 text-purple-300 transition-transform group-hover:translate-x-1'
							/>
						</Link>
					</div>
				</div>
		</main>
	);
}
