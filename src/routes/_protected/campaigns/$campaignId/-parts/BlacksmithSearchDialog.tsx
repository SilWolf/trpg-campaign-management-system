import { useEffect, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Hammer, Search, X } from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { ITEM_CATEGORY_LABELS, RARITY_CONFIG } from '@/data';
import {
	loadBlacksmithCatalogDefinitions,
	loadBlacksmithCatalogItems,
} from '@/lib/blacksmithCatalog';
import {
	loadMyBlacksmithTemplates,
	loadSharedBlacksmithTemplates,
} from '@/lib/blacksmithItems';
import {
	buildBlacksmithSearchGroups,
	createBlacksmithCopyForm,
	createBlacksmithImportDraft,
	type BlacksmithImportDraft,
	type BlacksmithSearchResult,
} from '@/lib/blacksmithSearch';
import type {
	BlacksmithCatalogDefinition,
	BlacksmithItem,
	BlacksmithTemplate,
	HomebrewForm,
	ItemBaseCategory,
	ItemBaseRarity,
} from '@/types';
import BlacksmithSourceTree, {
	type BlacksmithSourceSelection,
} from './BlacksmithSourceTree';
import ItemIcon from './ItemIcon';

interface BlacksmithSearchDialogProps {
	isOpen: boolean;
	userId: string;
	onImport: (draft: BlacksmithImportDraft) => void;
	onCopy: (form: HomebrewForm) => void;
	onClose: () => void;
}

type SearchSources = {
	mine: BlacksmithTemplate[];
	official: BlacksmithItem[];
	shared: BlacksmithTemplate[];
};

const EMPTY_SOURCES: SearchSources = {
	mine: [],
	official: [],
	shared: [],
};
const RARITIES: ItemBaseRarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];

export default function BlacksmithSearchDialog({
	isOpen,
	userId,
	onImport,
	onCopy,
	onClose,
}: BlacksmithSearchDialogProps) {
	const [search, setSearch] = useState('');
	const [category, setCategory] = useState<ItemBaseCategory | 'all'>('all');
	const [rarity, setRarity] = useState<ItemBaseRarity | 'all'>('all');
	const [selection, setSelection] = useState<BlacksmithSourceSelection>({
		mine: true,
		catalogIds: [],
		sharedOwnerIds: [],
	});
	const [groups, setGroups] = useState(() => buildBlacksmithSearchGroups(
		EMPTY_SOURCES,
		{ search: '', category: 'all', rarity: 'all' },
	));
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const requestId = useRef(0);
	const mineCache = useRef(new Map<string, Promise<BlacksmithTemplate[]>>());
	const sharedCache = useRef(new Map<string, Promise<BlacksmithTemplate[]>>());
	const catalogCache = useRef(new Map<string, Promise<BlacksmithItem[]>>());
	const definitionsPromise = useRef<Promise<BlacksmithCatalogDefinition[]> | null>(
		null,
	);

	useEffect(() => {
		const currentRequest = ++requestId.current;
		const normalizedSearch = search.trim();
		if (!isOpen || !normalizedSearch) {
			void Promise.resolve().then(() => {
				if (currentRequest !== requestId.current) return;
				setIsLoading(false);
				setErrorMessage(null);
			});
			return;
		}

		const timer = window.setTimeout(() => {
			setIsLoading(true);
			setErrorMessage(null);
			const readCached = <T,>(
				cache: Map<string, Promise<T>>,
				key: string,
				load: () => Promise<T>,
			): Promise<T> => {
				const existing = cache.get(key);
				if (existing) return existing;
				const pending = load().catch((error: unknown) => {
					cache.delete(key);
					throw error;
				});
				cache.set(key, pending);
				return pending;
			};

			const loadCatalog = async (catalogId: string) => {
				if (!definitionsPromise.current) {
					definitionsPromise.current = loadBlacksmithCatalogDefinitions().catch(
						(error: unknown) => {
							definitionsPromise.current = null;
							throw error;
						},
					);
				}
				const definitions = await definitionsPromise.current;
				const definition = definitions.find(
					(catalog) => catalog.catalogId === catalogId,
				);
				if (!definition) throw new Error(`找不到規則書目錄：${catalogId}`);
				return readCached(catalogCache.current, catalogId, () =>
					loadBlacksmithCatalogItems(definition),
				);
			};

			const runSearch = async () => {
				if (
					!selection.mine &&
					selection.catalogIds.length === 0 &&
					selection.sharedOwnerIds.length === 0
				) {
					if (currentRequest !== requestId.current) return;
					setGroups(
						buildBlacksmithSearchGroups(EMPTY_SOURCES, {
							search: normalizedSearch,
							category,
							rarity,
						}),
					);
					return;
				}
				const [mine, officialLists, sharedLists] = await Promise.all([
					selection.mine
						? readCached(mineCache.current, userId, () =>
								loadMyBlacksmithTemplates(userId),
							)
						: Promise.resolve([]),
					Promise.all(selection.catalogIds.map(loadCatalog)),
					Promise.all(
						selection.sharedOwnerIds.map((ownerId) =>
							readCached(sharedCache.current, ownerId, () =>
								loadSharedBlacksmithTemplates(userId, ownerId),
							),
						),
					),
				]);
				if (currentRequest !== requestId.current) return;
				const result = buildBlacksmithSearchGroups(
					{
						mine,
						official: officialLists.flat(),
						shared: sharedLists.flat(),
					},
					{ search: normalizedSearch, category, rarity },
				);
				setGroups(result);
			};

			void runSearch()
				.catch((error: unknown) => {
					if (currentRequest === requestId.current) {
						setErrorMessage(
							error instanceof Error
								? error.message
								: '鍛造工坊搜尋失敗，請稍後重試。',
						);
					}
				})
				.finally(() => {
					if (currentRequest === requestId.current) setIsLoading(false);
				});
		}, 300);

		return () => window.clearTimeout(timer);
	}, [category, isOpen, rarity, search, selection, userId]);

	if (!isOpen) return null;

	const resultCount = groups.mine.length + groups.official.length + groups.shared.length;
	const groupDefinitions = [
		{ key: 'mine', title: '我的自製物品', results: groups.mine, icon: <Hammer /> },
		{ key: 'official', title: '官方規則書物品', results: groups.official, icon: <BookOpen /> },
		{ key: 'shared', title: '其他人分享的物品', results: groups.shared, icon: <Hammer /> },
	] as const;

	const renderResult = (result: BlacksmithSearchResult) => (
		<li
			key={result.itemId}
			data-testid='blacksmith-search-result'
			className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/80 p-3'
		>
			<div className='flex min-w-0 items-center gap-3'>
				<ItemIcon
					iconName={result.item.icon ?? 'Package'}
					className='h-10 w-10 shrink-0 rounded border border-border p-1 text-muted-foreground'
				/>
				<div className='min-w-0'>
					<p className='truncate font-semibold text-foreground'>
						{result.item.name}
					</p>
					<p className='truncate text-xs text-muted-foreground'>
						{result.item.category} · {RARITY_CONFIG[result.item.rarity].label} ·{' '}
						{result.sourceLabel}
					</p>
				</div>
			</div>
			<div className='flex shrink-0 gap-2'>
				<Button
					type='button'
					variant='secondary'
					size='sm'
					onClick={() => onImport(createBlacksmithImportDraft(result))}
				>
					匯入
				</Button>
				<Button
					type='button'
					variant='ghost'
					size='sm'
					onClick={() => onCopy(createBlacksmithCopyForm(result))}
				>
					複製
				</Button>
			</div>
		</li>
	);

	return (
		<div className='fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-background/80 p-3 backdrop-blur-sm sm:p-5'>
			<section
				role='dialog'
				aria-modal='true'
				aria-labelledby='blacksmith-search-title'
				className='my-auto flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl'
			>
				<header className='flex items-center justify-between gap-3 border-b border-border p-4'>
					<div>
						<h2
							id='blacksmith-search-title'
							className='font-serif text-lg font-bold text-foreground'
						>
							從鍛造工坊匯入物品
						</h2>
						<p className='text-xs text-muted-foreground'>
							搜尋官方目錄、自己的樣板及可讀取的社群分享。
						</p>
					</div>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						aria-label='關閉鍛造工坊搜尋'
						onClick={onClose}
						prefixIcon={<X />}
					/>
				</header>

				<div className='grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.4fr)]'>
					<div className='space-y-4'>
						<div className='space-y-3 rounded-lg border border-border bg-card/60 p-3'>
							<label className='block text-sm font-medium text-foreground'>
								關鍵字
								<div className='relative mt-1'>
									<Search
										aria-hidden='true'
										className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground'
									/>
									<input
										aria-label='物品搜尋關鍵字'
										value={search}
										onChange={(event) => setSearch(event.target.value)}
										placeholder='名稱、效果、子類型…'
										className='w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary'
									/>
								</div>
							</label>
							<label className='block text-sm font-medium text-foreground'>
								物品類型
								<Select
									aria-label='物品類型篩選'
									value={category}
									onChange={(event) =>
										setCategory(event.target.value as ItemBaseCategory | 'all')
									}
									className='mt-1 w-full'
								>
									<option value='all'>所有類型</option>
									{Object.entries(ITEM_CATEGORY_LABELS).map(([value, label]) => (
										<option key={value} value={value}>
											{label}
										</option>
									))}
								</Select>
							</label>
							<label className='block text-sm font-medium text-foreground'>
								稀有度
								<Select
									aria-label='物品稀有度篩選'
									value={rarity}
									onChange={(event) =>
										setRarity(event.target.value as ItemBaseRarity | 'all')
									}
									className='mt-1 w-full'
								>
									<option value='all'>所有稀有度</option>
									{RARITIES.map((value) => (
										<option key={value} value={value}>
											{RARITY_CONFIG[value].label}
										</option>
									))}
								</Select>
							</label>
						</div>
						<BlacksmithSourceTree
							userId={userId}
							selection={selection}
							onChange={setSelection}
						/>
					</div>

					<section
						aria-label='搜尋結果'
						aria-busy={isLoading}
						className='min-h-64 space-y-4'
					>
						{isLoading && (
							<p role='status' className='rounded-lg border border-border p-4 text-sm text-muted-foreground'>
								正在搜尋所選來源…
							</p>
						)}
						{errorMessage && (
							<p
								role='alert'
								className='flex items-start gap-2 rounded-lg border border-destructive/70 bg-destructive/30 p-3 text-sm text-destructive-foreground'
							>
								<AlertCircle aria-hidden='true' className='mt-0.5 h-4 w-4 shrink-0' />
								{errorMessage}
							</p>
						)}
						{!search.trim() && resultCount === 0 ? (
							<p className='rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground'>
								輸入關鍵字開始搜尋；清空關鍵字時會保留上一組結果。
							</p>
						) : null}
						{!isLoading && !errorMessage && search.trim() && resultCount === 0 && (
							<p className='rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground'>
								沒有符合條件的物品，請調整關鍵字、篩選條件或來源。
							</p>
						)}
						{groupDefinitions.map(
							(group) =>
								group.results.length > 0 && (
									<div key={group.key} className='space-y-2'>
										<h3 className='flex items-center gap-2 font-serif font-bold text-foreground'>
											<span className='h-4 w-4'>{group.icon}</span>
											{group.title}
											<span className='font-mono text-xs text-muted-foreground'>
												{group.results.length}
											</span>
										</h3>
										<ul className='space-y-2'>{group.results.map(renderResult)}</ul>
									</div>
								),
						)}
					</section>
				</div>
			</section>
		</div>
	);
}
