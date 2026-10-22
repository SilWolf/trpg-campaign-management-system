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

export interface InventoryToolbarProps {
	allCharacterItems: InventoryItem[];
	canViewPrivateBag: boolean;
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
	canViewPrivateBag,
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
				<button
					onClick={() => setBagTab('public')}
					className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
						currentBagTab === 'public'
							? 'bg-amber-800/80 text-amber-100 border border-amber-400/70 shadow'
							: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
					}`}
				>
					<Globe className='w-3.5 h-3.5 text-amber-300' />
					<span>
						公開行囊 ({allCharacterItems.filter((item) => !item.isPrivate).length})
					</span>
				</button>

				{canViewPrivateBag ? (
					<button
						onClick={() => setBagTab('private')}
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
							currentBagTab === 'private'
								? 'bg-emerald-900/80 text-emerald-100 border border-emerald-400/70 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
								: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-emerald-300'
						}`}
					>
						<Lock className='w-3.5 h-3.5 text-emerald-400' />
						<span>
							私人暗袋 ({allCharacterItems.filter((item) => item.isPrivate).length})
						</span>
					</button>
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
					<input
						type='text'
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder='搜尋道具名稱...'
						className='w-full bg-stone-900 border border-stone-700 focus:border-amber-500 rounded pl-8 pr-2.5 py-1.5 text-xs text-stone-200 placeholder:text-stone-500 outline-none'
					/>
				</div>

				<div className='flex bg-stone-900 p-0.5 rounded border border-stone-700'>
					<button
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
					</button>
					<button
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
					</button>
					<button
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
					</button>
				</div>

				<div className='relative group'>
					<button className='flex items-center gap-1 px-2.5 py-1.5 rounded bg-stone-900 border border-stone-700 hover:border-amber-600/60 text-xs text-stone-300 cursor-pointer'>
						<ArrowUpDown className='w-3.5 h-3.5 text-amber-400' />
						<span>排序與整理</span>
					</button>
					<div className='absolute right-0 mt-1 w-32 bg-stone-900 border border-amber-700/70 rounded shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-30 py-1 text-xs'>
						<button
							onClick={() => handleAutoSort('rarity')}
							className='w-full px-3 py-1.5 text-left hover:bg-amber-900/40 text-stone-200 cursor-pointer'
						>
							✨ 依稀有度排序
						</button>
						<button
							onClick={() => handleAutoSort('value')}
							className='w-full px-3 py-1.5 text-left hover:bg-amber-900/40 text-stone-200 cursor-pointer'
						>
							🪙 依價值排序
						</button>
						<button
							onClick={() => handleAutoSort('weight')}
							className='w-full px-3 py-1.5 text-left hover:bg-amber-900/40 text-stone-200 cursor-pointer'
						>
							⚖️ 依重量排序
						</button>
						<div className='border-t border-stone-800 my-1' />
						<button
							onClick={handleConsolidateStacks}
							className='w-full px-3 py-1.5 text-left hover:bg-emerald-950/60 text-emerald-300 font-medium cursor-pointer flex items-center gap-1'
						>
							<span>📦 合併同名同詞條堆疊</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
