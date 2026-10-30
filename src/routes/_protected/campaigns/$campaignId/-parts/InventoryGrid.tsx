import ItemIcon from './ItemIcon';
import {
	getItemArmorClass,
	getItemDamage,
	getItemSection,
	resolveItemFlags,
	type InventoryDisplayMode,
	type InventoryItem,
	type ItemSection,
	type ItemBaseRarity,
	type RarityStyle,
	type ViewMode,
} from '@/types';
import {
	Sword,
	FlaskConical,
	Star,
	Package,
	HelpCircle,
	Sparkles,
	EyeOff,
	Coins,
} from 'lucide-react';
import { Button } from '@/components/ui';

interface InventoryGridProps {
	items: InventoryItem[];
	viewMode: ViewMode;
	displayMode: InventoryDisplayMode;
	inspectedItemId: string | null;
	totalItemsValueGp: number;
	rarityConfig: Record<ItemBaseRarity, RarityStyle>;
	canEditAnyBag: boolean;
	canEditItem: (item: InventoryItem) => boolean;
	isItemMatchingFilter: (item: InventoryItem | null | undefined) => boolean;
	setSelectedItemId: (id: string) => void;
	toggleEquip: (item: InventoryItem) => void;
}

const SECTION_CONFIG: {
	key: ItemSection;
	title: string;
	subtitle: string;
	icon: typeof Sword;
}[] = [
	{
		key: 'Equipment',
		title: '裝備 (Equipment)',
		subtitle: '可穿戴或持用的武器、護甲與奇物',
		icon: Sword,
	},
	{
		key: 'Consumable',
		title: '消耗品 (Consumables)',
		subtitle: '藥水、卷軸、食物與拋擲物',
		icon: FlaskConical,
	},
	{
		key: 'Important',
		title: '重要物品 (Key Items)',
		subtitle: '劇情信物、任務鑰匙與關鍵遺物',
		icon: Star,
	},
	{
		key: 'Misc',
		title: '雜物 (Miscellaneous)',
		subtitle: '戰利品、材料、工具與一般行囊物品',
		icon: Package,
	},
];

export default function InventoryGrid({
	items,
	viewMode,
	displayMode,
	inspectedItemId,
	totalItemsValueGp,
	rarityConfig,
	canEditAnyBag,
	canEditItem,
	isItemMatchingFilter,
	setSelectedItemId,
	toggleEquip,
}: InventoryGridProps) {
	const groupedItems: Record<ItemSection, InventoryItem[]> = {
		Equipment: [],
		Consumable: [],
		Important: [],
		Misc: [],
	};

	items.forEach((item) => {
		const section = getItemSection(item);
		groupedItems[section].push(item);
	});

	const isSixPerRow = displayMode === 'grid6';

	return (
		<div className='p-3.5 flex-1 flex flex-col justify-between space-y-4'>
			{items.length === 0 ? (
				<div className='py-16 text-center text-muted-foreground text-xs border border-dashed border-border rounded-md'>
					此行囊目前空無一物。
				</div>
			) : (
				<div className='space-y-4'>
					{SECTION_CONFIG.map((sec) => {
						const sectionItems = groupedItems[sec.key];
						const itemGroups = [
							{
								isPrivate: false,
								items: sectionItems.filter((item) => !item.isPrivate),
							},
							{
								isPrivate: true,
								items: sectionItems.filter((item) => item.isPrivate),
							},
						].filter((group) => group.items.length > 0);
						const IconComp = sec.icon;

						return (
							<div
								key={sec.key}
								className='rounded-md border border-border/90 bg-background/60 overflow-hidden'
							>
								{/* 分類標題列 */}
								<div
									className={`px-3 py-1.5 border-b flex items-center justify-between`}
								>
									<div className='flex items-center gap-2'>
										<IconComp className='w-3.5 h-3.5 shrink-0' />
										<span className='text-xs font-serif font-bold tracking-wide'>
											{sec.title}
										</span>
										<span className='text-[10px] text-muted-foreground hidden sm:inline'>
											— {sec.subtitle}
										</span>
									</div>

									<div className='flex items-center gap-2 font-mono'>
										{displayMode === 'grid6' && sectionItems.length > 0 && (
											<span className='text-[10px] text-muted-foreground hidden md:inline'>
												(
												{
													+sectionItems
														.reduce((sum, i) => sum + i.weight * i.quantity, 0)
														.toFixed(1)
												}{' '}
												lb /{' '}
												<span className='text-money'>
													{sectionItems.reduce(
														(sum, i) => sum + i.valueGp * i.quantity,
														0,
													)}{' '}
													GP
												</span>
												)
											</span>
										)}
										<span className={`text-[10px]`}>
											{sectionItems.length} 件
										</span>
									</div>
								</div>

								{/* 分類內容區 */}
								{sectionItems.length === 0 ? (
									<div className='px-3 py-2.5 text-[11px] text-muted-foreground italic'>
										尚無{sec.title.split(' ')[0]}
									</div>
								) : (
									<div className='space-y-2 p-2.5'>
										{itemGroups.map((group) => (
											<div
												key={group.isPrivate ? 'private' : 'public'}
												data-testid={
													group.isPrivate ? 'inventory-private-group' : undefined
												}
												className={
													group.isPrivate
														? 'rounded-md border border-private/70 bg-private-surface/20 overflow-hidden'
														: ''
												}
											>
												{group.isPrivate && (
													<div className='flex items-center gap-1.5 border-b border-private/50 bg-private-surface/40 px-2.5 py-1.5 text-[11px] font-semibold text-private'>
														<EyeOff className='size-3.5' />
														<span>秘密物品</span>
													</div>
												)}
												{displayMode === 'grid6' || displayMode === 'grid' ? (
													<div
														className={
															isSixPerRow
																? 'p-2.5 grid grid-cols-6 gap-2'
																: 'p-2 grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5'
														}
													>
														{group.items.map((item) => {
											const masked =
												!item.isIdentified && viewMode === 'player';
											const rStyle = masked
												? rarityConfig.Uncommon
												: rarityConfig[item.rarity] || rarityConfig.Common;
											const isInspected = inspectedItemId === item.id;
											const matches = isItemMatchingFilter(item);
											const { isEquippable } = resolveItemFlags(item);

											return (
												<Button
													key={item.id}
													type='button'
													variant='ghost'
													aria-label={masked ? '未知魔法物品' : item.name}
													aria-pressed={isInspected}
													data-testid={`inventory-item-${item.id}`}
													data-filter-match={matches}
													onClick={() => setSelectedItemId(item.id)}
													onDoubleClick={() => {
														if (isEquippable && canEditItem(item)) {
															toggleEquip(item);
														}
													}}
													title={masked ? '未知魔法物品' : item.name}
													className={`aspect-square p-0 rounded border ${rStyle.border} ${rStyle.bg} ${rStyle.glow} relative flex items-center justify-center cursor-pointer select-none transition-all duration-150 ${
														isInspected
															? 'ring-2 ring-ring scale-[1.04] z-10'
															: 'hover:brightness-125'
													} ${!matches ? 'opacity-20 grayscale' : ''}`}
												>
													{masked ? (
														<HelpCircle
															className={`${
																isSixPerRow
																	? 'w-6 h-6 sm:w-7 sm:h-7'
																	: 'w-5 h-5'
															} text-muted-foreground animate-pulse`}
														/>
													) : (
														<ItemIcon
															iconName={item.icon}
															className={`${
																isSixPerRow
																	? 'w-6 h-6 sm:w-8 sm:h-8'
																	: 'w-5 h-5 sm:w-6 sm:h-6'
															} ${rStyle.text}`}
														/>
													)}

													<div className='absolute top-1 left-1 flex items-center gap-0.5'>
														{item.equipped && (
															<span className='px-1 text-[9px] font-bold leading-tight rounded-xs bg-primary text-primary-foreground shadow'>
																E
															</span>
														)}
														{item.attuned && (
															<Sparkles className='w-3 h-3 text-foreground drop-shadow' />
														)}
													</div>

													<div className='absolute top-1 right-1 flex items-center gap-0.5'>
														{item.isPrivate && (
															<EyeOff
																className='w-3 h-3 text-private drop-shadow'
																aria-label='秘密物品'
															/>
														)}
														{!item.isIdentified && viewMode === 'dm' && (
															<EyeOff className='w-3 h-3 text-muted-foreground drop-shadow' />
														)}
													</div>

													{item.quantity > 1 && (
														<span className='absolute bottom-0.5 right-1.5 text-[11px] font-mono font-bold text-foreground drop-shadow-sm'>
															{item.quantity}
														</span>
													)}
												</Button>
											);
														})}
													</div>
												) : (
													<div className='divide-y divide-border/70'>
														{group.items.map((item) => {
											const masked =
												!item.isIdentified && viewMode === 'player';
											const damage = getItemDamage(item);
											const armorClass = getItemArmorClass(item);
											const rStyle = masked
												? rarityConfig.Uncommon
												: rarityConfig[item.rarity] || rarityConfig.Common;
											const isInspected = inspectedItemId === item.id;
											const matches = isItemMatchingFilter(item);
											const { isEquippable } = resolveItemFlags(item);

											return (
												<Button
													key={item.id}
													type='button'
													variant='ghost'
													aria-label={masked ? '未知魔法物品' : item.name}
													aria-pressed={isInspected}
													data-testid={`inventory-item-${item.id}`}
													data-filter-match={matches}
													onClick={() => setSelectedItemId(item.id)}
													onDoubleClick={() => {
														if (isEquippable && canEditItem(item)) {
															toggleEquip(item);
														}
													}}
													style={{
														borderLeftColor: isInspected
															? 'var(--primary)'
															: 'transparent',
													}}
													className={`w-full rounded-none px-3 py-2 flex items-center justify-between gap-3 cursor-pointer transition border-l-2 hover:bg-card/80 ${!matches ? 'opacity-25 grayscale' : ''}`}
												>
													<div className='flex items-center gap-2.5 min-w-0 flex-1'>
														<div
															className={`relative w-8 h-8 rounded border ${rStyle.border} ${rStyle.bg} flex items-center justify-center shrink-0`}
														>
															{masked ? (
																<HelpCircle className='w-4 h-4 text-muted-foreground' />
															) : (
																<ItemIcon
																	iconName={item.icon}
																	className={`w-4 h-4 ${rStyle.text}`}
																/>
															)}
														</div>

														<div className='min-w-0 flex-1'>
															<div className='flex items-center gap-1.5 flex-wrap'>
																<span
																	className={`text-xs font-serif font-bold truncate ${rStyle.text}`}
																>
																	{masked ? '未知的魔法物品' : item.name}
																</span>
																{item.quantity > 1 && (
																	<span className='text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-foreground'>
																		x{item.quantity}
																	</span>
																)}
																{item.equipped && (
																	<span className='text-[9px] px-1.5 py-0.2 rounded bg-primary border border-primary/60 text-primary-foreground font-semibold'>
																		已裝備
																	</span>
																)}
																{item.attuned && (
																	<span className='text-[9px] px-1.5 py-0.2 rounded bg-secondary/20 border border-border/60 text-foreground flex items-center gap-0.5'>
																		<Sparkles className='w-2.5 h-2.5' /> 同調
																	</span>
																)}
																{item.isPrivate && (
																	<EyeOff className='w-3 h-3 text-private' />
																)}
																{!item.isIdentified && viewMode === 'dm' && (
																	<EyeOff className='w-3 h-3 text-muted-foreground' />
																)}
															</div>
															<div className='text-[10px] text-muted-foreground truncate text-left'>
																{masked ? '未鑑定' : rStyle.label} •{' '}
																{item.subTypes.join('、')}
																{!masked && damage ? ` • ${damage}` : ''}
																{!masked && armorClass
																	? ` • AC ${armorClass}`
																	: ''}
															</div>
														</div>
													</div>

													<div className='flex items-center gap-4 text-[11px] font-mono shrink-0 text-right'>
														<div className='text-muted-foreground w-16'>
															{+(item.weight * item.quantity).toFixed(1)} lb
														</div>
														<div
															className={`font-semibold w-20 ${masked ? 'text-muted-foreground' : 'text-money'}`}
														>
															{masked
																? '???'
																: `${item.valueGp * item.quantity} GP`}
														</div>
													</div>
												</Button>
											);
														})}
													</div>
												)}
											</div>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}

			<div className='pt-2.5 border-t border-border/80 flex items-center justify-between text-xs text-muted-foreground'>
				<span>
					共 <strong className='text-foreground'>{items.length}</strong> 項物品
					{canEditAnyBag
						? '（雙擊「裝備」類別物品可快速穿脫）'
						: '（唯讀模式）'}
				</span>
				<span className='flex items-center gap-1 font-mono'>
					<Coins className='w-3.5 h-3.5 text-money' />
					<span className='text-money'>
						行囊物品總估值：{totalItemsValueGp} GP
					</span>
				</span>
			</div>
		</div>
	);
}
