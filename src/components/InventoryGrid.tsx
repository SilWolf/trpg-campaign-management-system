import { HelpCircle, Sparkles } from 'lucide-react';
import ItemIcon from './ItemIcon';
import type { InventoryItem, Rarity, RarityStyle, ViewMode } from '../types';

type InventoryGridProps = {
	items: InventoryItem[];
	totalSlots: number;
	viewMode: ViewMode;
	inspectedItemId: string | null;
	moveSourceSlot: number | null;
	draggedSlot: number | null;
	totalItemsValueGp: number;
	rarityConfig: Record<Rarity, RarityStyle>;
	isItemMatchingFilter: (item: InventoryItem) => boolean;
	setDraggedSlot: (slot: number | null) => void;
	setHoveredItemId: (id: string | null) => void;
	setSelectedItemId: (id: string) => void;
	setMoveSourceSlot: (slot: number | null) => void;
	swapOrMoveSlot: (fromSlot: number | null, toSlot: number | null) => void;
	toggleEquip: (item: InventoryItem) => void;
};

const InventoryGrid = ({
	items,
	totalSlots,
	viewMode,
	inspectedItemId,
	moveSourceSlot,
	draggedSlot,
	totalItemsValueGp,
	rarityConfig,
	isItemMatchingFilter,
	setDraggedSlot,
	setHoveredItemId,
	setSelectedItemId,
	setMoveSourceSlot,
	swapOrMoveSlot,
	toggleEquip,
}: InventoryGridProps) => (
	<>
		<div className='p-4 sm:p-5 grid grid-cols-6 gap-2.5 sm:gap-3 bg-[radial-gradient(circle_at_center,_rgba(28,25,23,0.8),_rgba(12,10,9,0.95))]'>
			{Array.from({ length: totalSlots }).map((_, slotIndex) => {
				const slotItem = items.find((item) => item.slot === slotIndex);
				const isSelected = slotItem?.id === inspectedItemId;
				const isMoveSource = moveSourceSlot === slotIndex;
				const isMaskedUnidentified =
					slotItem && !slotItem.isIdentified && viewMode === 'player';
				const rarityStyle = slotItem
					? isMaskedUnidentified
						? rarityConfig.Common
						: (rarityConfig[slotItem.rarity] ?? rarityConfig.Common)
					: rarityConfig.Common;
				const matchesFilter = slotItem
					? isItemMatchingFilter(slotItem)
					: true;

				return (
					<div
						key={slotIndex}
						draggable={!!slotItem}
						onDragStart={() => setDraggedSlot(slotIndex)}
						onDragOver={(event) => event.preventDefault()}
						onDrop={() => {
							swapOrMoveSlot(draggedSlot, slotIndex);
							setDraggedSlot(null);
						}}
						onMouseEnter={() => {
							if (slotItem) setHoveredItemId(slotItem.id);
						}}
						onMouseLeave={() => setHoveredItemId(null)}
						onClick={() => {
							if (moveSourceSlot !== null) {
								swapOrMoveSlot(moveSourceSlot, slotIndex);
								setMoveSourceSlot(null);
								return;
							}
							if (slotItem) setSelectedItemId(slotItem.id);
						}}
						onDoubleClick={() => {
							if (
								slotItem &&
								(slotItem.category === 'Weapon' ||
									slotItem.category === 'Armor')
							) {
								toggleEquip(slotItem);
							}
						}}
						className={`aspect-square rounded-md relative flex items-center justify-center transition-all duration-150 select-none ${
							slotItem
								? `bg-gradient-to-br ${rarityStyle.bg} border-2 ${rarityStyle.border} ${rarityStyle.glow} cursor-grab active:cursor-grabbing`
								: 'bg-[#100e0c] border border-stone-800/90 shadow-[inset_0_2px_8px_rgba(0,0,0,0.85)] hover:border-amber-900/60'
						} ${
							isSelected
								? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-stone-950 scale-[1.03] z-10'
								: ''
						} ${
							isMoveSource ? 'ring-2 ring-cyan-400 animate-pulse' : ''
						} ${!matchesFilter ? 'opacity-25 grayscale' : ''}`}
					>
						{!slotItem && (
							<div className='w-2 h-2 rotate-45 border border-stone-800/60 opacity-40' />
						)}
						{slotItem && (
							<>
								{slotItem.equipped && (
									<div
										className='absolute top-1 left-1 px-1 py-0.5 rounded bg-amber-500 text-stone-950 text-[9px] font-extrabold leading-none shadow'
										title='已裝備'
									>
										裝備
									</div>
								)}
								<div className='absolute top-1 right-1 flex items-center gap-0.5'>
									{!slotItem.isIdentified && (
										<span
											className='w-4 h-4 rounded-full bg-purple-950/90 border border-purple-400 text-purple-200 flex items-center justify-center text-[10px] font-bold shadow'
											title='未鑑定魔法物品'
										>
											?
										</span>
									)}
									{slotItem.attuned && (
										<span
											className='w-3.5 h-3.5 rounded-full bg-amber-950/90 border border-amber-400 text-amber-300 flex items-center justify-center shadow-[0_0_6px_#f59e0b]'
											title='已同調 (Attuned)'
										>
											<Sparkles className='w-2.5 h-2.5' />
										</span>
									)}
								</div>
								<div
									className={`${rarityStyle.text} drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]`}
								>
									{isMaskedUnidentified ? (
										<HelpCircle className='w-7 h-7 sm:w-8 sm:h-8 text-purple-400/80 animate-pulse' />
									) : (
										<ItemIcon
											iconName={slotItem.icon}
											className='w-7 h-7 sm:w-8 sm:h-8'
										/>
									)}
								</div>
								{slotItem.isHomebrew &&
									(viewMode === 'dm' || slotItem.isIdentified) && (
										<span
											className='absolute bottom-1 left-1 px-1 rounded bg-purple-950/90 border border-purple-500/60 text-[8px] text-purple-300 font-semibold'
											title='DM 自創道具 (Homebrew)'
										>
											自創
										</span>
									)}
								{slotItem.quantity > 1 && (
									<span className='absolute bottom-0.5 right-1.5 text-xs font-mono font-bold text-stone-100 drop-shadow-[0_1px_3px_rgba(0,0,0,1)]'>
										{slotItem.quantity}
									</span>
								)}
							</>
						)}
					</div>
				);
			})}
		</div>
		<div className='mt-auto px-4 py-3 bg-stone-950 border-t border-amber-900/40 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400'>
			<div className='flex items-center gap-4'>
				<span>
					已用格數：
					<strong className='text-stone-200'>{items.length}</strong> /{' '}
					{totalSlots}
				</span>
				<span>
					背包物品總估值：
					<strong className='text-amber-300'>{totalItemsValueGp} GP</strong>
				</span>
			</div>
			<div className='flex items-center gap-2 text-[11px]'>
				<span className='inline-block w-2 h-2 rounded-full bg-emerald-500' />{' '}
				非普通
				<span className='inline-block w-2 h-2 rounded-full bg-blue-500 ml-1' />{' '}
				稀有
				<span className='inline-block w-2 h-2 rounded-full bg-purple-500 ml-1' />{' '}
				極珍稀
				<span className='inline-block w-2 h-2 rounded-full bg-amber-400 ml-1' />{' '}
				傳奇
				<span className='inline-block w-2 h-2 rounded-full bg-red-500 ml-1' />{' '}
				神器
			</div>
		</div>
	</>
);

export default InventoryGrid;
