import {
	ArrowUpDown,
	Globe,
	Grid3x3,
	LayoutGrid,
	Lock,
	List,
	Search,
} from 'lucide-react';
import type { InventoryDisplayMode, InventoryItem } from '@/types';
import { Button, Input } from '@/components/ui';

export interface InventoryToolbarProps {
	allCharacterItems: InventoryItem[];
	canReadPublicBag: boolean;
	canViewPrivateBag: boolean;
	canEditCurrentBag: boolean;
	currentBagTab: 'public' | 'private';
	setBagTab: (tab: 'public' | 'private') => void;
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	displayMode: InventoryDisplayMode;
	setDisplayMode: (mode: InventoryDisplayMode) => void;
	handleAutoSort: (sortBy: 'rarity' | 'weight' | 'value') => void;
	handleConsolidateStacks: () => void;
}

export default function InventoryToolbar({
	allCharacterItems,
	canReadPublicBag,
	canViewPrivateBag,
	canEditCurrentBag,
	currentBagTab,
	setBagTab,
	searchQuery,
	setSearchQuery,
	displayMode,
	setDisplayMode,
	handleAutoSort,
	handleConsolidateStacks,
}: InventoryToolbarProps) {
	return (
		<div className='p-3.5 bg-stone-950/90 border-b border-amber-900/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
			<div className='flex items-center gap-2'>
				<Button
					type='button'
					variant='ghost'
					size='sm'
					data-testid='inventory-bag-public'
					aria-pressed={currentBagTab === 'public'}
					onClick={() => setBagTab('public')}
					className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
						currentBagTab === 'public'
							? 'bg-amber-800/80 text-amber-100 border border-amber-400/70 shadow'
							: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
					}`}
				>
					<Globe className='w-3.5 h-3.5 text-amber-300' />
					<span>
						公開行囊 (
						{canReadPublicBag
							? allCharacterItems.filter((item) => !item.isPrivate).length
							: '🔒'}
						)
					</span>
				</Button>

				{canViewPrivateBag ? (
					<Button
						type='button'
						variant='ghost'
						size='sm'
						data-testid='inventory-bag-private'
						aria-pressed={currentBagTab === 'private'}
						onClick={() => setBagTab('private')}
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
							currentBagTab === 'private'
								? 'bg-emerald-900/80 text-emerald-100 border border-emerald-400/70 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
								: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-emerald-300'
						}`}
					>
						<Lock className='w-3.5 h-3.5 text-emerald-400' />
						<span>
							私人暗袋 (
							{allCharacterItems.filter((item) => item.isPrivate).length})
						</span>
					</Button>
				) : (
					<span className='text-[11px] text-stone-500 flex items-center gap-1 px-2'>
						<Lock className='w-3 h-3' />
						<span>私人暗袋已隱藏</span>
					</span>
				)}
			</div>

			<div className='flex items-center gap-2'>
				<div className='relative flex-1 sm:w-40'>
					<Search className='w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2' />
					<Input
						type='search'
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder='搜尋道具名稱...'
						aria-label='搜尋道具名稱'
						data-testid='inventory-search'
						className='w-full bg-stone-900 border border-stone-700 focus:border-amber-500 rounded pl-8 pr-2.5 py-1.5 text-xs text-stone-200 placeholder:text-stone-500 outline-none'
					/>
				</div>

				<div
					className='flex bg-stone-900 p-0.5 rounded border border-stone-700'
					role='group'
					aria-label='背包檢視模式'
				>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						data-testid='inventory-display-grid6'
						aria-pressed={displayMode === 'grid6'}
						onClick={() => setDisplayMode('grid6')}
						title='一列 6 個展示'
						className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer ${
							displayMode === 'grid6'
								? 'bg-amber-700/80 text-amber-100'
								: 'text-stone-400 hover:text-stone-200'
						}`}
					>
						<Grid3x3 className='w-3.5 h-3.5' />
						<span className='hidden md:inline'>6格</span>
					</Button>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						data-testid='inventory-display-grid'
						aria-pressed={displayMode === 'grid'}
						onClick={() => setDisplayMode('grid')}
						title='緊湊格字展示'
						className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer ${
							displayMode === 'grid'
								? 'bg-amber-700/80 text-amber-100'
								: 'text-stone-400 hover:text-stone-200'
						}`}
					>
						<LayoutGrid className='w-3.5 h-3.5' />
						<span className='hidden md:inline'>格字</span>
					</Button>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						data-testid='inventory-display-list'
						aria-pressed={displayMode === 'list'}
						onClick={() => setDisplayMode('list')}
						title='詳細列表展示'
						className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition cursor-pointer ${
							displayMode === 'list'
								? 'bg-amber-700/80 text-amber-100'
								: 'text-stone-400 hover:text-stone-200'
						}`}
					>
						<List className='w-3.5 h-3.5' />
						<span className='hidden md:inline'>列表</span>
					</Button>
				</div>

				<details
					className='relative'
					data-testid='inventory-sort-menu'
					onClick={(event) => {
						if (
							event.target instanceof Element &&
							event.target.closest('button')
						) {
							event.currentTarget.open = false;
						}
					}}
				>
					<summary
						data-testid='inventory-sort-trigger'
						className='flex list-none items-center gap-1 px-2.5 py-1.5 rounded bg-stone-900 border border-stone-700 hover:border-amber-600/60 text-xs text-stone-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'
					>
						<ArrowUpDown className='w-3.5 h-3.5 text-amber-400' />
						<span>排序與整理</span>
					</summary>
					<div className='absolute right-0 mt-1 w-48 bg-stone-900 border border-amber-700/70 rounded shadow-xl z-30 py-1 text-xs'>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							data-testid='inventory-sort-rarity'
							className='w-full justify-start rounded-none'
							onClick={() => handleAutoSort('rarity')}
						>
							✨ 依稀有度排序
						</Button>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							data-testid='inventory-sort-value'
							className='w-full justify-start rounded-none'
							onClick={() => handleAutoSort('value')}
						>
							🪙 依價值排序
						</Button>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							data-testid='inventory-sort-weight'
							className='w-full justify-start rounded-none'
							onClick={() => handleAutoSort('weight')}
						>
							⚖️ 依重量排序
						</Button>
						{canEditCurrentBag && (
							<>
								<div className='border-t border-stone-800 my-1' />
								<Button
									type='button'
									variant='ghost'
									size='sm'
									data-testid='inventory-consolidate-stacks'
									className='w-full justify-start rounded-none text-emerald-300'
									onClick={handleConsolidateStacks}
								>
									<span>📦 合併同名同詞條堆疊</span>
								</Button>
							</>
						)}
					</div>
				</details>
			</div>
		</div>
	);
}
