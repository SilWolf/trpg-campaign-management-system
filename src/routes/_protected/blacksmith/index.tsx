/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
	AlertCircle,
	BookOpen,
	Coins,
	Package,
	RotateCw,
	Search,
	Weight,
} from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import {
	getBlacksmithIconUrl,
	loadBlacksmithCatalogs,
} from '@/lib/blacksmithCatalog';
import type { BlacksmithItem, ItemCategory } from '@/types';

export const Route = createFileRoute('/_protected/blacksmith/')({
	component: BlacksmithCatalogPage,
});

const CATEGORY_LABELS: Record<ItemCategory, string> = {
	Weapon: '武器',
	Armor: '護甲',
	Consumable: '消耗品',
	Misc: '雜物',
};
const RARITY_LABELS: Record<string, string> = {
	Common: '普通',
	Uncommon: '非普通',
	Rare: '稀有',
	VeryRare: '極稀有',
	Legendary: '傳奇',
	Artifact: '神器',
};

function searchableText(item: BlacksmithItem): string {
	return [
		item.name,
		item.category,
		CATEGORY_LABELS[item.category],
		...item.subTypes,
		item.rarity,
		RARITY_LABELS[item.rarity],
		item.catalogTitle,
		item.source,
		item.description,
		...item.aliases,
		...item.searchTerms,
	]
		.join(' ')
		.toLocaleLowerCase();
}

function BlacksmithCatalogPage() {
	const [items, setItems] = useState<BlacksmithItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [reloadKey, setReloadKey] = useState(0);
	const [query, setQuery] = useState('');
	const [catalogFilter, setCatalogFilter] = useState('all');
	const [categoryFilter, setCategoryFilter] = useState('all');
	const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(
		null,
	);

	useEffect(() => {
		let isMounted = true;
		loadBlacksmithCatalogs()
			.then((catalogItems) => {
				if (isMounted) setItems(catalogItems);
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

	const catalogs = useMemo(
		() =>
			Array.from(
				new Map(
					items.map((item) => [item.catalogId, item.catalogTitle]),
				).entries(),
			),
		[items],
	);
	const categories = useMemo(
		() => Array.from(new Set(items.map((item) => item.category))),
		[items],
	);
	const filteredItems = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return items.filter(
			(item) =>
				(catalogFilter === 'all' || item.catalogId === catalogFilter) &&
				(categoryFilter === 'all' || item.category === categoryFilter) &&
				(!normalizedQuery || searchableText(item).includes(normalizedQuery)),
		);
	}, [items, query, catalogFilter, categoryFilter]);
	const selectedItem =
		filteredItems.find((item) => item.sourceKey === selectedSourceKey) ??
		filteredItems[0] ??
		null;

	const retryLoading = () => {
		setErrorMessage(null);
		setIsLoading(true);
		setReloadKey((current) => current + 1);
	};

	return (
		<main className='min-h-screen bg-[#0c0a09] px-4 py-8 text-stone-200 sm:px-8'>
			<div className='mx-auto max-w-7xl'>
				<header className='mb-7 border-b border-amber-900/50 pb-5'>
					<p className='text-xs font-semibold tracking-[0.2em] text-amber-500'>
						BLACKSMITH · 規則書目錄
					</p>
					<h1
						data-testid='blacksmith-heading'
						className='mt-2 flex items-center gap-3 font-serif text-2xl font-bold text-amber-100 sm:text-3xl'
					>
						<BookOpen className='h-7 w-7 text-amber-400' />
						鍛造工坊
					</h1>
					<p className='mt-2 max-w-2xl text-sm leading-relaxed text-stone-400'>
						瀏覽隨附規則書中的物品定義。此目錄為唯讀；目前不會建立或修改戰役物品。
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

				<div className='mb-5 grid gap-3 rounded-xl border border-stone-800 bg-stone-950/80 p-4 md:grid-cols-[minmax(15rem,1fr)_minmax(12rem,0.5fr)_minmax(10rem,0.4fr)]'>
					<div className='relative'>
						<Search
							aria-hidden='true'
							className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500'
						/>
						<Input
							data-testid='blacksmith-search'
							aria-label='搜尋物品'
							placeholder='搜尋名稱、描述、別名或關鍵字'
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className='pl-9'
						/>
					</div>
					<Select
						aria-label='依規則書篩選'
						value={catalogFilter}
						onChange={(event) => setCatalogFilter(event.target.value)}
					>
						<option value='all'>所有規則書</option>
						{catalogs.map(([catalogId, title]) => (
							<option key={catalogId} value={catalogId}>
								{title}
							</option>
						))}
					</Select>
					<Select
						aria-label='依分類篩選'
						value={categoryFilter}
						onChange={(event) => setCategoryFilter(event.target.value)}
					>
						<option value='all'>所有分類</option>
						{categories.map((category) => (
							<option key={category} value={category}>
								{CATEGORY_LABELS[category]}
							</option>
						))}
					</Select>
				</div>

				{isLoading ? (
					<div
						data-testid='blacksmith-loading'
						role='status'
						className='rounded-xl border border-stone-800 bg-stone-950/70 px-6 py-16 text-center text-sm text-stone-400'
					>
						正在讀取規則書目錄…
					</div>
				) : errorMessage ? (
					<div className='rounded-xl border border-stone-800 bg-stone-950/70 px-6 py-12 text-center text-sm text-stone-400'>
						目錄資料無法顯示，請確認連線後重新載入。
					</div>
				) : items.length === 0 ? (
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
				) : filteredItems.length === 0 ? (
					<div
						data-testid='blacksmith-no-results'
						className='rounded-xl border border-stone-800 bg-stone-950/70 px-6 py-16 text-center'
					>
						<Search className='mx-auto h-8 w-8 text-stone-500' />
						<h2 className='mt-3 font-serif text-lg font-bold text-stone-200'>
							找不到符合條件的物品
						</h2>
						<p className='mt-1 text-sm text-stone-400'>
							請調整搜尋文字或篩選條件。
						</p>
					</div>
				) : (
					<div className='grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]'>
						<section aria-label='規則書物品列表'>
							<p
								data-testid='blacksmith-result-count'
								className='mb-3 text-xs text-stone-400'
							>
								找到 <span className='font-mono text-amber-300'>{filteredItems.length}</span>{' '}
								筆物品
							</p>
							<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
								{filteredItems.map((item) => (
									<button
										key={item.sourceKey}
										type='button'
										data-testid='blacksmith-item-card'
										aria-pressed={selectedItem?.sourceKey === item.sourceKey}
										onClick={() => setSelectedSourceKey(item.sourceKey)}
										className={`group flex min-h-24 w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
											selectedItem?.sourceKey === item.sourceKey
												? 'border-amber-500/70 bg-amber-950/30'
												: 'border-stone-800 bg-stone-950/70 hover:border-amber-800/70 hover:bg-stone-900'
										}`}
									>
										<div className='relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-stone-700 bg-stone-900'>
											<Package className='absolute inset-0 m-auto h-6 w-6 text-stone-500' />
											<img
												src={getBlacksmithIconUrl(item.icon)}
												alt=''
												loading='lazy'
												decoding='async'
												className='absolute inset-0 h-full w-full object-cover'
												onError={(event) => {
													event.currentTarget.hidden = true;
												}}
											/>
										</div>
										<span className='min-w-0 flex-1'>
											<span className='block truncate font-serif font-bold text-stone-100 group-hover:text-amber-100'>
												{item.name}
											</span>
											<span className='mt-1 block truncate text-xs text-stone-400'>
												{CATEGORY_LABELS[item.category]} · {item.subTypes.join('、')}
											</span>
											<span className='mt-2 block text-[11px] text-amber-400/80'>
												{item.catalogTitle}
											</span>
										</span>
									</button>
								))}
							</div>
						</section>

						{selectedItem && (
							<aside
								data-testid='blacksmith-item-detail'
								aria-label={`${selectedItem.name}物品詳情`}
								className='rounded-xl border border-amber-900/50 bg-gradient-to-b from-stone-900 to-stone-950 p-5 lg:sticky lg:top-5'
							>
								<div className='flex items-start gap-4'>
									<div className='relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-amber-800/60 bg-stone-950'>
										<Package className='absolute inset-0 m-auto h-7 w-7 text-stone-500' />
										<img
											src={getBlacksmithIconUrl(selectedItem.icon)}
											alt=''
											className='absolute inset-0 h-full w-full object-cover'
											onError={(event) => {
												event.currentTarget.hidden = true;
											}}
										/>
									</div>
									<div className='min-w-0'>
										<p className='text-xs text-amber-500'>
											{selectedItem.catalogTitle}
										</p>
										<h2 className='mt-1 font-serif text-xl font-bold text-amber-100'>
											{selectedItem.name}
										</h2>
										<p className='mt-1 text-xs text-stone-400'>
											{CATEGORY_LABELS[selectedItem.category]} · {selectedItem.subTypes.join('、')}
										</p>
									</div>
								</div>

								<div className='mt-5 grid grid-cols-2 gap-2 text-xs'>
									<div className='rounded-md border border-stone-800 bg-stone-950/80 p-3'>
										<p className='text-stone-500'>稀有度</p>
										<p className='mt-1 text-stone-200'>
											{RARITY_LABELS[selectedItem.rarity]}
										</p>
									</div>
									<div className='rounded-md border border-stone-800 bg-stone-950/80 p-3'>
										<p className='flex items-center gap-1 text-stone-500'>
											<Weight className='h-3 w-3' />
											重量
										</p>
										<p className='mt-1 font-mono text-stone-200'>
											{selectedItem.weight} 磅
										</p>
									</div>
									<div className='rounded-md border border-stone-800 bg-stone-950/80 p-3'>
										<p className='flex items-center gap-1 text-stone-500'>
											<Coins className='h-3 w-3' />
											價值
										</p>
										<p className='mt-1 font-mono text-stone-200'>
											{selectedItem.valueGp} GP
										</p>
									</div>
									<div className='rounded-md border border-stone-800 bg-stone-950/80 p-3'>
										<p className='text-stone-500'>調諧</p>
										<p className='mt-1 text-stone-200'>
											{selectedItem.requiresAttunement ? '需要' : '不需要'}
										</p>
									</div>
								</div>

								{selectedItem.damage !== null && (
									<p className='mt-4 rounded-md border border-stone-800 bg-stone-950/80 px-3 py-2 text-sm'>
										<span className='text-stone-500'>傷害：</span>
										<span className='font-mono text-stone-200'>
											{selectedItem.damage}
										</span>
									</p>
								)}

								<div className='mt-5 border-t border-stone-800 pt-4'>
									<h3 className='text-xs font-semibold tracking-wide text-stone-400'>
										物品描述
									</h3>
									<p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-200'>
										{selectedItem.description || '此物品沒有附加描述。'}
									</p>
								</div>
								{selectedItem.source && (
									<p className='mt-4 border-t border-stone-800 pt-3 text-xs text-stone-500'>
										來源：{selectedItem.source}
									</p>
								)}
							</aside>
						)}
					</div>
				)}
			</div>
		</main>
	);
}
