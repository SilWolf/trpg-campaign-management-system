import ItemIcon from '@/components/ItemIcon';
import {
	getItemSection,
	resolveItemFlags,
	type InventoryDisplayMode,
	type InventoryItem,
	type ItemSection,
	type Rarity,
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
	Lock,
	EyeOff,
	Coins,
} from 'lucide-react';

interface InventoryGridProps {
	items: InventoryItem[];
	viewMode: ViewMode;
	displayMode: InventoryDisplayMode;
	inspectedItemId: string | null;
	totalItemsValueGp: number;
	rarityConfig: Record<Rarity, RarityStyle>;
	isItemMatchingFilter: (item: InventoryItem | null | undefined) => boolean;
	setSelectedItemId: (id: string) => void;
	toggleEquip: (item: InventoryItem) => void;
}

const SECTION_CONFIG: {
	key: ItemSection;
	title: string;
	subtitle: string;
	icon: typeof Sword;
	accentColor: string;
	badgeClass: string;
}[] = [
	{
		key: 'Equipment',
		title: '裝備 (Equipment)',
		subtitle: '可穿戴或持用的武器、護甲與奇物',
		icon: Sword,
		accentColor: 'text-amber-300 border-amber-800/50 bg-amber-950/20',
		badgeClass: 'bg-amber-900/60 text-amber-200 border-amber-600/50',
	},
	{
		key: 'Consumable',
		title: '消耗品 (Consumables)',
		subtitle: '藥水、卷軸、食物與拋擲物',
		icon: FlaskConical,
		accentColor: 'text-emerald-300 border-emerald-800/50 bg-emerald-950/20',
		badgeClass: 'bg-emerald-900/60 text-emerald-200 border-emerald-600/50',
	},
	{
		key: 'Important',
		title: '重要物品 (Key Items)',
		subtitle: '劇情信物、任務鑰匙與關鍵遺物',
		icon: Star,
		accentColor: 'text-purple-300 border-purple-800/50 bg-purple-950/20',
		badgeClass: 'bg-purple-900/60 text-purple-200 border-purple-600/50',
	},
	{
		key: 'Misc',
		title: '雜物 (Miscellaneous)',
		subtitle: '戰利品、材料、工具與一般行囊物品',
		icon: Package,
		accentColor: 'text-stone-300 border-stone-800 bg-stone-900/40',
		badgeClass: 'bg-stone-800 text-stone-300 border-stone-600/50',
	},
];

export default function InventoryGrid({
	items,
	viewMode,
	displayMode,
	inspectedItemId,
	totalItemsValueGp,
	rarityConfig,
	isItemMatchingFilter,
	setSelectedItemId,
	toggleEquip,
}: InventoryGridProps) {
	// 將物品依四大類別分組
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
				<div className='py-16 text-center text-stone-500 text-xs border border-dashed border-stone-800 rounded-md'>
					此行囊目前空無一物。
				</div>
			) : (
				<div className='space-y-4'>
					{SECTION_CONFIG.map((sec) => {
						const sectionItems = groupedItems[sec.key];
						const IconComp = sec.icon;

						return (
							<div
								key={sec.key}
								className='rounded-md border border-stone-800/90 bg-stone-950/60 overflow-hidden'
							>
								{/* 分類標題列 */}
								<div
									className={`px-3 py-1.5 border-b flex items-center justify-between ${sec.accentColor}`}
								>
									<div className='flex items-center gap-2'>
										<IconComp className='w-3.5 h-3.5 shrink-0' />
										<span className='text-xs font-serif font-bold tracking-wide'>
											{sec.title}
										</span>
										<span className='text-[10px] text-stone-400 hidden sm:inline'>
											— {sec.subtitle}
										</span>
									</div>

									{/* 右側：數量、grid6 模式下額外顯示總重與總價值 */}
									<div className='flex items-center gap-2 font-mono'>
										{displayMode === 'grid6' && sectionItems.length > 0 && (
											<span className='text-[10px] text-stone-400 hidden md:inline'>
												(
												{
													+sectionItems
														.reduce((sum, i) => sum + i.weight * i.quantity, 0)
														.toFixed(1)
												}{' '}
												lb /{' '}
												{sectionItems.reduce(
													(sum, i) => sum + i.valueGp * i.quantity,
													0,
												)}{' '}
												GP)
											</span>
										)}
										<span
											className={`text-[10px] px-1.5 py-0.2 rounded border ${sec.badgeClass}`}
										>
											{sectionItems.length} 件
										</span>
									</div>
								</div>

								{/* 分類內容區 */}
								{sectionItems.length === 0 ? (
									<div className='px-3 py-2.5 text-[11px] text-stone-600 italic'>
										尚無{sec.title.split(' ')[0]}
									</div>
								) : displayMode === 'grid6' || displayMode === 'grid' ? (
									/* ========================================== */
									/* 模式 A：格字展示 (一行6個 grid6 / 緊湊 grid) */
									/* ========================================== */
									<div
										className={
											isSixPerRow
												? 'p-2.5 grid grid-cols-6 gap-2'
												: 'p-2 grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5'
										}
									>
										{sectionItems.map((item) => {
											const masked =
												!item.isIdentified && viewMode === 'player';
											const rStyle = masked
												? rarityConfig.Uncommon
												: rarityConfig[item.rarity] || rarityConfig.Common;
											const isInspected = inspectedItemId === item.id;
											const matches = isItemMatchingFilter(item);
											const { isEquippable } = resolveItemFlags(item);

											return (
												<div
													key={item.id}
													onClick={() => setSelectedItemId(item.id)}
													onDoubleClick={() => {
														if (isEquippable) toggleEquip(item);
													}}
													title={masked ? '未知魔法物品' : item.name}
													className={`aspect-square rounded border ${rStyle.border} ${rStyle.bg} ${rStyle.glow} relative flex items-center justify-center cursor-pointer select-none transition-all duration-150 ${
														isInspected
															? 'ring-2 ring-amber-400 scale-[1.04] z-10'
															: 'hover:brightness-125'
													} ${!matches ? 'opacity-20 grayscale' : ''}`}
												>
													{/* 物品圖示 */}
													{masked ? (
														<HelpCircle
															className={`${
																isSixPerRow
																	? 'w-6 h-6 sm:w-7 sm:h-7'
																	: 'w-5 h-5'
															} text-purple-400 animate-pulse`}
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

													{/* 左上角：已裝備標記 (E) 或 同調星號 */}
													<div className='absolute top-1 left-1 flex items-center gap-0.5'>
														{item.equipped && (
															<span className='px-1 text-[9px] font-bold leading-tight rounded-xs bg-amber-500 text-stone-950 shadow'>
																E
															</span>
														)}
														{item.attuned && (
															<Sparkles className='w-3 h-3 text-purple-300 drop-shadow' />
														)}
													</div>

													{/* 右上角：私人或未鑑定圖示 */}
													<div className='absolute top-1 right-1 flex items-center gap-0.5'>
														{item.isPrivate && (
															<Lock className='w-3 h-3 text-emerald-400 drop-shadow' />
														)}
														{!item.isIdentified && viewMode === 'dm' && (
															<EyeOff className='w-3 h-3 text-red-400 drop-shadow' />
														)}
													</div>

													{/* 右下角：堆疊數量 */}
													{item.quantity > 1 && (
														<span className='absolute bottom-0.5 right-1.5 text-[11px] font-mono font-bold text-stone-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]'>
															{item.quantity}
														</span>
													)}
												</div>
											);
										})}
									</div>
								) : (
									/* ========================================== */
									/* 模式 B：詳細列表展示 (List View)            */
									/* ========================================== */
									<div className='divide-y divide-stone-800/70'>
										{sectionItems.map((item) => {
											const masked =
												!item.isIdentified && viewMode === 'player';
											const rStyle = masked
												? rarityConfig.Uncommon
												: rarityConfig[item.rarity] || rarityConfig.Common;
											const isInspected = inspectedItemId === item.id;
											const matches = isItemMatchingFilter(item);
											const { isEquippable } = resolveItemFlags(item);

											return (
												<div
													key={item.id}
													onClick={() => setSelectedItemId(item.id)}
													onDoubleClick={() => {
														if (isEquippable) toggleEquip(item);
													}}
													className={`px-3 py-2 flex items-center justify-between gap-3 cursor-pointer transition ${
														isInspected
															? 'bg-amber-950/35 border-l-2 border-l-amber-400'
															: 'hover:bg-stone-900/80'
													} ${!matches ? 'opacity-25 grayscale' : ''}`}
												>
													{/* 左側：小圖框 + 名稱 + 狀態標籤 */}
													<div className='flex items-center gap-2.5 min-w-0 flex-1'>
														<div
															className={`w-8 h-8 rounded border ${rStyle.border} ${rStyle.bg} flex items-center justify-center shrink-0`}
														>
															{masked ? (
																<HelpCircle className='w-4 h-4 text-purple-400' />
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
																	<span className='text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-800 text-stone-200'>
																		x{item.quantity}
																	</span>
																)}
																{item.equipped && (
																	<span className='text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/60 text-amber-200 font-semibold'>
																		已裝備
																	</span>
																)}
																{item.attuned && (
																	<span className='text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 border border-purple-400/60 text-purple-200 flex items-center gap-0.5'>
																		<Sparkles className='w-2.5 h-2.5' /> 同調
																	</span>
																)}
																{item.isPrivate && (
																	<Lock className='w-3 h-3 text-emerald-400' />
																)}
																{!item.isIdentified && viewMode === 'dm' && (
																	<EyeOff className='w-3 h-3 text-red-400' />
																)}
															</div>
															<div className='text-[10px] text-stone-400 truncate'>
																{masked ? '未鑑定' : rStyle.label} •{' '}
																{item.subType}
																{!masked && item.damage
																	? ` • ${item.damage}`
																	: ''}
																{!masked && item.ac ? ` • AC ${item.ac}` : ''}
															</div>
														</div>
													</div>

													{/* 右側：重量與價值 */}
													<div className='flex items-center gap-4 text-[11px] font-mono shrink-0 text-right'>
														<div className='text-stone-400 w-16'>
															{+(item.weight * item.quantity).toFixed(1)} lb
														</div>
														<div className='text-amber-300 font-semibold w-20'>
															{masked
																? '???'
																: `${item.valueGp * item.quantity} GP`}
														</div>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}

			{/* 底部統計列 */}
			<div className='pt-2.5 border-t border-stone-800/80 flex items-center justify-between text-xs text-stone-400'>
				<span>
					共 <strong className='text-stone-200'>{items.length}</strong> 項物品
					（雙擊「裝備」類別物品可快速穿脫）
				</span>
				<span className='flex items-center gap-1 text-amber-300 font-mono'>
					<Coins className='w-3.5 h-3.5 text-amber-400' />
					<span>行囊物品總估值：{totalItemsValueGp} GP</span>
				</span>
			</div>
		</div>
	);
}
