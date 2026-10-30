import {
	ArrowUpDown,
	Grid3x3,
	LayoutGrid,
	List,
	Search,
	Gem,
	DollarSign,
	Weight,
	Boxes,
} from 'lucide-react';
import type { InventoryDisplayMode } from '@/types';
import { Button, Input } from '@/components/ui';

export interface InventoryToolbarProps {
	canEditAnyBag: boolean;
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	displayMode: InventoryDisplayMode;
	setDisplayMode: (mode: InventoryDisplayMode) => void;
	handleAutoSort: (sortBy: 'rarity' | 'weight' | 'value') => void;
	handleConsolidateStacks: () => void;
}

export default function InventoryToolbar({
	canEditAnyBag,
	searchQuery,
	setSearchQuery,
	displayMode,
	setDisplayMode,
	handleAutoSort,
	handleConsolidateStacks,
}: InventoryToolbarProps) {
	return (
		<div className='p-3.5 bg-background/90 border-b border-primary/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
			<div className='space-y-2 w-full'>
				<div className='flex items-center gap-2'>
					<div className='relative flex-1'>
						<Search className='w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2' />
						<Input
							type='search'
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder='搜尋道具名稱...'
							aria-label='搜尋道具名稱'
							data-testid='inventory-search'
							className='pl-8'
						/>
					</div>

					<div
						className='flex bg-card rounded border border-border'
						role='group'
						aria-label='背包檢視模式'
					>
						<Button
							type='button'
							variant={displayMode === 'grid6' ? 'primary' : 'ghost'}
							size='sm'
							data-testid='inventory-display-grid6'
							aria-pressed={displayMode === 'grid6'}
							onClick={() => setDisplayMode('grid6')}
							title='一列 6 個展示'
							prefixIcon={<Grid3x3 />}
						>
							<span className='hidden md:inline'>6格</span>
						</Button>
						<Button
							type='button'
							variant={displayMode === 'grid' ? 'primary' : 'ghost'}
							size='sm'
							data-testid='inventory-display-grid'
							aria-pressed={displayMode === 'grid'}
							onClick={() => setDisplayMode('grid')}
							title='緊湊格字展示'
							prefixIcon={<LayoutGrid />}
						>
							<span className='hidden md:inline'>格字</span>
						</Button>
						<Button
							type='button'
							variant={displayMode === 'list' ? 'primary' : 'ghost'}
							size='sm'
							data-testid='inventory-display-list'
							aria-pressed={displayMode === 'list'}
							onClick={() => setDisplayMode('list')}
							title='詳細列表展示'
							prefixIcon={<List />}
						>
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
						<summary data-testid='inventory-sort-trigger' className='list-none'>
							<Button
								asChild
								variant='secondary'
								size='sm'
								prefixIcon={<ArrowUpDown />}
							>
								<div>
									<span>排序與整理</span>
								</div>
							</Button>
						</summary>
						<div className='absolute right-0 mt-1 w-48 bg-card border border-primary/70 rounded shadow-xl z-30 py-1 text-xs'>
							<Button
								type='button'
								variant='ghost'
								size='sm'
								data-testid='inventory-sort-rarity'
								onClick={() => handleAutoSort('rarity')}
								prefixIcon={<Gem />}
							>
								依稀有度排序
							</Button>
							<Button
								type='button'
								variant='ghost'
								size='sm'
								data-testid='inventory-sort-value'
								onClick={() => handleAutoSort('value')}
								prefixIcon={<DollarSign />}
							>
								依價值排序
							</Button>
							<Button
								type='button'
								variant='ghost'
								size='sm'
								data-testid='inventory-sort-weight'
								onClick={() => handleAutoSort('weight')}
								prefixIcon={<Weight />}
							>
								依重量排序
							</Button>
							{canEditAnyBag && (
								<>
									<div className='border-t border-border my-1' />
									<Button
										type='button'
										variant='ghost'
										size='sm'
										data-testid='inventory-consolidate-stacks'
										onClick={handleConsolidateStacks}
										prefixIcon={<Boxes />}
									>
										合併同名同詞條堆疊
									</Button>
								</>
							)}
						</div>
					</details>
				</div>
			</div>
		</div>
	);
}
