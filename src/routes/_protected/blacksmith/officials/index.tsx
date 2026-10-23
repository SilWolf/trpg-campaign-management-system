/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertCircle, ArrowRight, BookOpen, RotateCw } from 'lucide-react';
import { Breadcrumbs, Button } from '@/components/ui';
import { loadBlacksmithCatalogDefinitions } from '@/lib/blacksmithCatalog';
import type { BlacksmithCatalogDefinition } from '@/types';

export const Route = createFileRoute('/_protected/blacksmith/officials/')({
	component: OfficialCatalogsPage,
});

function OfficialCatalogsPage() {
	const [catalogs, setCatalogs] = useState<BlacksmithCatalogDefinition[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	useEffect(() => {
		let isMounted = true;
		loadBlacksmithCatalogDefinitions()
			.then((definitions) => {
				if (isMounted) setCatalogs(definitions);
			})
			.catch((error: unknown) => {
				if (isMounted) {
					setErrorMessage(
						error instanceof Error
							? error.message
							: '規則書目錄載入失敗，請稍後重試。',
					);
				}
			})
			.finally(() => {
				if (isMounted) setIsLoading(false);
			});
		return () => {
			isMounted = false;
		};
	}, [reloadKey]);

	const retryLoading = () => {
		setErrorMessage(null);
		setIsLoading(true);
		setReloadKey((current) => current + 1);
	};

	return (
		<main className='min-h-screen bg-[#0c0a09] px-4 py-8 text-stone-200 sm:px-8'>
			<div className='mx-auto max-w-5xl'>
				<Breadcrumbs
					className='mb-5'
					items={[
						{ label: '鍛造工坊', to: '/blacksmith' },
						{ label: '官方規則書', current: true },
					]}
				/>
				<header className='mb-7 border-b border-amber-900/50 pb-5'>
					<p className='text-xs font-semibold tracking-[0.2em] text-amber-500'>
						BLACKSMITH · 官方規則書
					</p>
					<h1 className='mt-2 flex items-center gap-3 font-serif text-2xl font-bold text-amber-100 sm:text-3xl'>
						<BookOpen className='h-7 w-7 text-amber-400' />
						官方規則書
					</h1>
					<p className='mt-2 max-w-2xl text-sm leading-relaxed text-stone-400'>
						選擇規則書以瀏覽其中收錄的物品。
					</p>
				</header>

				{errorMessage && (
					<div
						data-testid='blacksmith-error'
						role='alert'
						className='mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-800/70 bg-red-950/40 px-4 py-3 text-sm text-red-200'
					>
						<span className='flex items-center gap-2'>
							<AlertCircle className='h-4 w-4 shrink-0 text-red-400' />
							{errorMessage}
						</span>
						<Button
							type='button'
							variant='secondary'
							size='sm'
							onClick={retryLoading}
							className='gap-2 border-red-800/70 text-red-200 hover:bg-red-950'
						>
							<RotateCw className='h-3.5 w-3.5' />
							重新載入
						</Button>
					</div>
				)}

				{isLoading ? (
					<div
						data-testid='blacksmith-loading'
						role='status'
						className='rounded-xl border border-stone-800 bg-stone-950/70 px-6 py-16 text-center text-sm text-stone-400'
					>
						正在讀取規則書清單…
					</div>
				) : errorMessage ? (
					<div className='rounded-xl border border-stone-800 bg-stone-950/70 px-6 py-12 text-center text-sm text-stone-400'>
						規則書清單無法顯示，請確認連線後重新載入。
					</div>
				) : catalogs.length === 0 ? (
					<div
						data-testid='blacksmith-empty-catalog'
						className='rounded-xl border border-stone-800 bg-stone-950/70 px-6 py-16 text-center'
					>
						<BookOpen className='mx-auto h-8 w-8 text-stone-500' />
						<h2 className='mt-3 font-serif text-lg font-bold text-stone-200'>
							目前沒有可瀏覽的規則書
						</h2>
						<p className='mt-1 text-sm text-stone-400'>
							目錄索引尚未登錄任何物品來源。
						</p>
					</div>
				) : (
					<ul
						data-testid='blacksmith-catalog-list'
						className='grid gap-4 sm:grid-cols-2'
					>
						{catalogs.map((catalog) => (
							<li key={catalog.catalogId}>
								<Link
									data-testid='blacksmith-catalog-link'
									to='/blacksmith/officials/$catelogId'
									params={{ catelogId: catalog.catalogId }}
									className='group flex min-h-32 items-center justify-between gap-4 rounded-xl border border-stone-800 bg-stone-950/70 p-5 transition hover:border-amber-700/70 hover:bg-stone-900'
								>
									<span className='flex min-w-0 items-center gap-4'>
										<BookOpen
											aria-hidden='true'
											className='h-6 w-6 shrink-0 text-amber-400'
										/>
										<span className='min-w-0'>
											<span className='block truncate font-serif text-lg font-bold text-amber-100'>
												{catalog.title}
											</span>
											<span className='mt-1 block truncate font-mono text-xs text-stone-500'>
												{catalog.catalogId}
											</span>
										</span>
									</span>
									<ArrowRight
										aria-hidden='true'
										className='h-5 w-5 shrink-0 text-stone-500 transition group-hover:translate-x-1 group-hover:text-amber-300'
									/>
								</Link>
							</li>
						))}
					</ul>
				)}
			</div>
		</main>
	);
}
