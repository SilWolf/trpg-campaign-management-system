/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
	AlertCircle,
	BookOpen,
	ChevronLeft,
	ChevronRight,
	Coins,
	FlaskConical,
	LayoutGrid,
	List as ListIcon,
	Package,
	RotateCw,
	Search,
	Shield,
	Sparkles,
	Sword,
	Weight,
} from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { RARITY_CONFIG, WEAPON_MASTERIES } from '@/data';
import {
	getBlacksmithIconUrl,
	loadBlacksmithCatalogs,
} from '@/lib/blacksmithCatalog';
import type { BlacksmithItem, ItemCategory, Rarity } from '@/types';

export const Route = createFileRoute('/_protected/blacksmith/')({
	component: BlacksmithCatalogPage,
});

const CATEGORY_LABELS: Record<ItemCategory, string> = {
	Weapon: '武器',
	Armor: '護甲',
	Consumable: '消耗品',
	Misc: '雜物',
};
const RARITIES: Rarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];
const CATEGORY_STYLES: Record<
	ItemCategory,
	{ icon: typeof Sword; badge: string }
> = {
	Weapon: {
		icon: Sword,
		badge: 'border-amber-600/50 bg-amber-900/60 text-amber-200',
	},
	Armor: {
		icon: Shield,
		badge: 'border-amber-600/50 bg-amber-900/60 text-amber-200',
	},
	Consumable: {
		icon: FlaskConical,
		badge: 'border-emerald-600/50 bg-emerald-900/60 text-emerald-200',
	},
	Misc: {
		icon: Package,
		badge: 'border-stone-600/50 bg-stone-800 text-stone-300',
	},
};

function searchableText(item: BlacksmithItem): string {
	return [
		item.name,
		item.category,
		CATEGORY_LABELS[item.category],
		...item.subTypes,
		item.rarity,
		RARITY_CONFIG[item.rarity].label,
		item.catalogTitle,
		item.source,
		item.description,
		...item.aliases,
		...item.searchTerms,
	]
		.join(' ')
		.toLocaleLowerCase();
}

function getWeaponMasteryLabel(mastery: string): string {
	return (
		Object.entries(WEAPON_MASTERIES).find(([key]) => key === mastery)?.[1].name ??
		mastery
	);
}

function BlacksmithCatalogPage() {
	const [items, setItems] = useState<BlacksmithItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [reloadKey, setReloadKey] = useState(0);
	const [query, setQuery] = useState('');
	const [catalogFilter, setCatalogFilter] = useState('all');
	const [categoryFilter, setCategoryFilter] = useState('all');
	const [rarityFilter, setRarityFilter] = useState<Rarity | 'all'>('all');
	const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('grid');
	const [currentPage, setCurrentPage] = useState(1);
	const [pageInput, setPageInput] = useState('1');
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
				(rarityFilter === 'all' || item.rarity === rarityFilter) &&
				(!normalizedQuery || searchableText(item).includes(normalizedQuery)),
		);
	}, [items, query, catalogFilter, categoryFilter, rarityFilter]);
	const pageSize = displayMode === 'grid' ? 18 : 10;
	const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
	const visibleItems = filteredItems.slice(
		(currentPage - 1) * pageSize,
		currentPage * pageSize,
	);
	const goToPage = () => {
		const requestedPage = Number(pageInput);
		if (!Number.isInteger(requestedPage) || requestedPage < 1) {
			setPageInput(String(currentPage));
			return;
		}
		const page = Math.min(requestedPage, pageCount);
		setCurrentPage(page);
		setPageInput(String(page));
	};
	const selectedItem =
		visibleItems.find((item) => item.sourceKey === selectedSourceKey) ??
		visibleItems[0] ??
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

				<div className='mb-5 grid gap-3 rounded-xl border border-stone-800 bg-stone-950/80 p-4 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_repeat(3,minmax(10rem,0.45fr))]'>
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
							onChange={(event) => {
								setCurrentPage(1);
								setPageInput('1');
								setQuery(event.target.value);
							}}
							className='pl-9'
						/>
					</div>
					<Select
						aria-label='依規則書篩選'
						value={catalogFilter}
						onChange={(event) => {
							setCurrentPage(1);
							setPageInput('1');
							setCatalogFilter(event.target.value);
						}}
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
						onChange={(event) => {
							setCurrentPage(1);
							setPageInput('1');
							setCategoryFilter(event.target.value);
						}}
					>
						<option value='all'>所有分類</option>
						{categories.map((category) => (
							<option key={category} value={category}>
								{CATEGORY_LABELS[category]}
							</option>
						))}
					</Select>
					<Select
						aria-label='依稀有度篩選'
						value={rarityFilter}
						onChange={(event) => {
							setCurrentPage(1);
							setPageInput('1');
							setRarityFilter(event.target.value as Rarity | 'all');
						}}
					>
						<option value='all'>所有稀有度</option>
						{RARITIES.map((rarity) => (
							<option key={rarity} value={rarity}>
								{RARITY_CONFIG[rarity].label}
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
							<div className='mb-3 flex justify-end gap-2'>
								<Button
									type='button'
									variant={displayMode === 'grid' ? 'primary' : 'secondary'}
									size='sm'
									aria-label='格狀檢視'
									aria-pressed={displayMode === 'grid'}
									onClick={() => {
										setCurrentPage(1);
										setPageInput('1');
										setDisplayMode('grid');
									}}
									className='gap-2'
								>
									<LayoutGrid aria-hidden='true' className='h-4 w-4' />
									格狀
								</Button>
								<Button
									type='button'
									variant={displayMode === 'list' ? 'primary' : 'secondary'}
									size='sm'
									aria-label='列表檢視'
									aria-pressed={displayMode === 'list'}
									onClick={() => {
										setCurrentPage(1);
										setPageInput('1');
										setDisplayMode('list');
									}}
									className='gap-2'
								>
									<ListIcon aria-hidden='true' className='h-4 w-4' />
									列表
								</Button>
							</div>
							<div
								data-testid='blacksmith-item-results'
								className={
									displayMode === 'grid'
										? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3'
										: 'flex flex-col gap-2'
								}
							>
								{visibleItems.map((item) => {
									const rarityStyle = RARITY_CONFIG[item.rarity];
									const CategoryIcon = CATEGORY_STYLES[item.category].icon;
									return (
										<button
											key={item.sourceKey}
											type='button'
											data-testid='blacksmith-item-card'
											aria-pressed={selectedItem?.sourceKey === item.sourceKey}
											onClick={() => setSelectedSourceKey(item.sourceKey)}
											className={`group flex w-full text-left transition ${
												displayMode === 'list'
													? `min-h-12 items-center gap-2 border-b px-2 py-1.5 ${
															selectedItem?.sourceKey === item.sourceKey
																? 'border-l-2 border-l-amber-500 bg-amber-950/30'
																: 'border-stone-800/80 hover:bg-stone-900/70'
														}`
													: `min-h-24 items-start gap-3 rounded-xl border p-3 ${
															selectedItem?.sourceKey === item.sourceKey
																? 'border-amber-500/70 bg-amber-950/30'
																: 'border-stone-800 bg-stone-950/70 hover:border-amber-800/70 hover:bg-stone-900'
														}`
											}`}
										>
											<div className={`relative shrink-0 overflow-hidden border ${displayMode === 'list' ? 'h-8 w-8 rounded-md' : 'h-14 w-14 rounded-lg'} ${rarityStyle.border} bg-gradient-to-b ${rarityStyle.bg} ${rarityStyle.glow}`}>
												<Package className={`absolute inset-0 m-auto text-stone-500 ${displayMode === 'list' ? 'h-4 w-4' : 'h-6 w-6'}`} />
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
											{displayMode === 'list' ? (
												<>
													<span className='flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5'>
														<span className={`truncate font-serif text-sm font-bold ${rarityStyle.text} group-hover:text-amber-100`}>
															{item.name}
														</span>
														<span className={`inline-flex shrink-0 items-center gap-1 rounded border px-1 py-0.5 text-[10px] leading-none ${CATEGORY_STYLES[item.category].badge}`}>
															<CategoryIcon aria-hidden='true' className='h-2.5 w-2.5' />
															{CATEGORY_LABELS[item.category]}
														</span>
														<span className={`inline-flex shrink-0 rounded border px-1 py-0.5 text-[10px] leading-none ${rarityStyle.badgeBg}`}>
															{rarityStyle.label}
														</span>
														{item.subTypes.length > 0 && (
															<span className='min-w-0 truncate text-xs text-stone-400'>
																{item.subTypes.join('、')}
															</span>
														)}
													</span>
													<span className='hidden w-16 shrink-0 text-right font-mono text-xs text-stone-400 sm:block'>
														{item.weight} lb
													</span>
													<span className='hidden w-20 shrink-0 text-right font-mono text-xs font-semibold text-amber-300 sm:block'>
														{item.valueGp} GP
													</span>
												</>
											) : (
												<span className='min-w-0 flex-1'>
													<span className={`block truncate font-serif font-bold ${rarityStyle.text} group-hover:text-amber-100`}>
														{item.name}
													</span>
													<span className='mt-1 flex flex-wrap items-center gap-1'>
														<span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${CATEGORY_STYLES[item.category].badge}`}>
															<CategoryIcon aria-hidden='true' className='h-3 w-3' />
															{CATEGORY_LABELS[item.category]}
														</span>
														<span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${rarityStyle.badgeBg}`}>
															{rarityStyle.label}
														</span>
													</span>
													<span className='mt-1 block truncate text-[11px] text-stone-400'>
														{item.subTypes.join('、')}
													</span>
													<span className='mt-2 block truncate text-[11px] text-amber-400/80'>
														{item.catalogTitle}
													</span>
												</span>
											)}
										</button>
									);
								})}
							</div>
							{filteredItems.length > pageSize && (
								<nav
									aria-label='物品列表分頁'
									className='mt-4 flex items-center justify-between gap-3 border-t border-stone-800 pt-3'
								>
									<p
										data-testid='blacksmith-pagination-status'
										className='text-xs text-stone-400'
									>
										第 <span className='font-mono text-stone-200'>{currentPage}</span> /{' '}
										<span className='font-mono text-stone-200'>{pageCount}</span> 頁
										<span className='hidden sm:inline'>
											{' '}· 顯示 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredItems.length)} 筆
										</span>
									</p>
									<div className='flex gap-2'>
										<Button
											type='button'
											variant='secondary'
											size='sm'
											aria-label='上一頁'
											disabled={currentPage === 1}
											onClick={() => {
												const page = Math.max(1, currentPage - 1);
												setCurrentPage(page);
												setPageInput(String(page));
											}}
											className='gap-1'
										>
											<ChevronLeft aria-hidden='true' className='h-4 w-4' />
											上一頁
										</Button>
										<Button
											type='button'
											variant='secondary'
											size='sm'
											aria-label='下一頁'
											disabled={currentPage === pageCount}
											onClick={() => {
												const page = Math.min(pageCount, currentPage + 1);
												setCurrentPage(page);
												setPageInput(String(page));
											}}
											className='gap-1'
										>
											下一頁
											<ChevronRight aria-hidden='true' className='h-4 w-4' />
										</Button>
									</div>
									<form
										className='flex items-center gap-2'
										onSubmit={(event) => {
											event.preventDefault();
											goToPage();
										}}
									>
										<label
											htmlFor='blacksmith-page-input'
											className='whitespace-nowrap text-xs text-stone-400'
										>
											跳轉至
										</label>
										<Input
											id='blacksmith-page-input'
											data-testid='blacksmith-page-input'
											type='number'
											min={1}
											max={pageCount}
											step={1}
											inputMode='numeric'
											aria-label='跳轉至 X 頁'
											value={pageInput}
											onChange={(event) => setPageInput(event.target.value)}
											className='h-8 w-16 px-2 text-center font-mono'
										/>
										<span className='text-xs text-stone-400'>頁</span>
										<Button type='submit' variant='secondary' size='sm'>
											跳轉
										</Button>
									</form>
								</nav>
							)}
						</section>

						{selectedItem && (
							<aside
								data-testid='blacksmith-item-detail'
								aria-label={`${selectedItem.name}物品詳情`}
								className={`rounded-xl border-2 ${RARITY_CONFIG[selectedItem.rarity].border} bg-gradient-to-b from-stone-900 to-stone-950 p-5 ${RARITY_CONFIG[selectedItem.rarity].glow} lg:sticky lg:top-5`}
							>
								<div className={`-mx-5 -mt-5 mb-4 border-b border-stone-800 bg-gradient-to-r ${RARITY_CONFIG[selectedItem.rarity].headerGradient} p-5`}>
									<div className='flex items-start gap-4'>
										<div className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${RARITY_CONFIG[selectedItem.rarity].border} bg-stone-950`}>
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
											<h2 className={`mt-1 font-serif text-xl font-bold ${RARITY_CONFIG[selectedItem.rarity].text}`}>
												{selectedItem.name}
											</h2>
											<div className='mt-2 flex flex-wrap items-center gap-1.5'>
												<span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${CATEGORY_STYLES[selectedItem.category].badge}`}>
													{CATEGORY_LABELS[selectedItem.category]}
												</span>
												<span
													data-testid='blacksmith-item-rarity'
													className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${RARITY_CONFIG[selectedItem.rarity].badgeBg}`}
												>
													{RARITY_CONFIG[selectedItem.rarity].label}
												</span>
												{selectedItem.requiresAttunement && (
													<span className='inline-flex items-center gap-1 rounded border border-purple-500/60 bg-purple-950/80 px-1.5 py-0.5 text-[10px] text-purple-200'>
														<Sparkles aria-hidden='true' className='h-3 w-3' />
														需要調諧
													</span>
												)}
											</div>
											<p className='mt-1 text-xs text-stone-400'>
												{selectedItem.subTypes.join('、')}
											</p>
										</div>
									</div>
								</div>

								<div className='mt-5 grid grid-cols-2 gap-2 text-xs'>
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
										<p className={`mt-1 ${selectedItem.requiresAttunement ? 'text-purple-200' : 'text-stone-200'}`}>
											{selectedItem.requiresAttunement ? '需要' : '不需要'}
										</p>
									</div>
								</div>

								{selectedItem.category === 'Weapon' &&
									(selectedItem.weaponMastery ||
										(selectedItem.weaponProperties?.length ?? 0) > 0) && (
										<div className='mt-4 rounded-md border border-amber-800/50 bg-amber-950/20 p-3'>
											{selectedItem.weaponMastery && (
												<p className='text-xs text-amber-200'>
													武器精通：{getWeaponMasteryLabel(selectedItem.weaponMastery)}
												</p>
											)}
											{selectedItem.weaponProperties &&
												selectedItem.weaponProperties.length > 0 && (
													<div className='mt-2 flex flex-wrap gap-1'>
														{selectedItem.weaponProperties.map((property) => (
															<span
																key={property}
																className='rounded border border-amber-700/50 bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-200'
															>
																{property}
															</span>
														))}
													</div>
												)}
										</div>
									)}

								{(selectedItem.category === 'Armor'
									? selectedItem.ac
									: selectedItem.damage) != null && (
									<p className='mt-4 rounded-md border border-stone-800 bg-stone-950/80 px-3 py-2 text-sm'>
										<span className='text-stone-500'>
											{selectedItem.category === 'Armor' ? '護甲值：' : '傷害：'}
										</span>
										<span className='font-mono text-stone-200'>
											{selectedItem.category === 'Armor'
												? selectedItem.ac
												: selectedItem.damage}
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
