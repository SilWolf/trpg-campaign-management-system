import {
	Backpack,
	Eye,
	EyeOff,
	HelpCircle,
	Move,
	Shield,
	ShieldAlert,
	Sparkles,
	Star,
	Sword,
	Trash2,
	Zap,
} from 'lucide-react';
import ItemIcon from './ItemIcon';
import type {
	Character,
	InventoryItem,
	Rarity,
	RarityStyle,
	ViewMode,
	WeaponMastery,
} from '../types';

type ItemTooltipProps = {
	inspectedItem: InventoryItem | null;
	viewMode: ViewMode;
	rarityConfig: Record<Rarity, RarityStyle>;
	weaponMasteries: Record<WeaponMastery, { name: string; desc: string }>;
	characters: Character[];
	activeCharId: string;
	moveSourceSlot: number | null;
	setMoveSourceSlot: (slot: number | null) => void;
	adjustCharges: (item: InventoryItem, delta: number) => void;
	toggleEquip: (item: InventoryItem) => void;
	toggleAttune: (item: InventoryItem) => void;
	consumeOrSplitStack: (item: InventoryItem, action: 'consume' | 'split') => void;
	transferItemToCharacter: (item: InventoryItem, targetCharId: string) => void;
	toggleIdentify: (item: InventoryItem) => void;
	deleteItem: (item: InventoryItem) => void;
};

const ItemTooltip = ({
	inspectedItem,
	viewMode,
	rarityConfig,
	weaponMasteries,
	characters,
	activeCharId,
	moveSourceSlot,
	setMoveSourceSlot,
	adjustCharges,
	toggleEquip,
	toggleAttune,
	consumeOrSplitStack,
	transferItemToCharacter,
	toggleIdentify,
	deleteItem,
}: ItemTooltipProps) => (
<div className='lg:col-span-5'>
					{inspectedItem ? (
						(() => {
							const isMasked =
								!inspectedItem.isIdentified && viewMode === 'player';
							const rarity = isMasked
								? rarityConfig.Common
								: rarityConfig[inspectedItem.rarity] || rarityConfig.Common;
							const masteryInfo =
								weaponMasteries[inspectedItem.mastery] ||
								weaponMasteries.None;

							return (
								<div
									className={`rounded-lg border-2 ${rarity.border} bg-[#110f0d] shadow-[0_0_45px_rgba(0,0,0,0.95)] overflow-hidden transition-all duration-200 sticky top-5`}
								>
									{/* 卡片頂部：稀有度漸層標題區 */}
									<div
										className={`p-5 bg-gradient-to-b ${rarity.headerGradient} border-b border-amber-500/20 relative`}
									>
										<div className='flex items-start justify-between gap-4'>
											<div>
												{/* 稀有度與分類標籤 */}
												<div className='flex flex-wrap items-center gap-1.5 mb-1.5'>
													<span
														className={`text-[11px] font-bold px-2 py-0.5 rounded border ${rarity.badgeBg}`}
													>
														{isMasked ? '未知稀有度' : rarity.label}
													</span>
													<span className='text-xs text-stone-300'>
														{inspectedItem.subType}
													</span>
													{inspectedItem.isHomebrew &&
														(viewMode === 'dm' ||
															inspectedItem.isIdentified) && (
															<span className='text-[11px] px-2 py-0.5 rounded bg-purple-950/90 border border-purple-400/60 text-purple-200 font-medium'>
																✨ DM 自創道具
															</span>
														)}
													{!inspectedItem.isIdentified && (
														<span className='text-[11px] px-2 py-0.5 rounded bg-amber-950 border border-amber-500 text-amber-300 font-semibold'>
															{viewMode === 'dm'
																? '👁️ 玩家端目前未鑑定'
																: '❓ 未鑑定物品'}
														</span>
													)}
												</div>

												{/* 物品名稱 */}
												<h2
													className={`text-xl sm:text-2xl font-serif font-bold tracking-wide ${
														isMasked ? 'text-purple-300' : rarity.text
													}`}
												>
													{isMasked
														? '未知的魔法物品 (未鑑定)'
														: inspectedItem.name}
												</h2>
											</div>

											{/* 右上角大型道具圖示框 */}
											<div
												className={`w-14 h-14 rounded-lg bg-stone-950/80 border-2 ${rarity.border} flex items-center justify-center shrink-0 shadow-inner ${rarity.text}`}
											>
												{isMasked ? (
													<HelpCircle className='w-8 h-8 text-purple-400' />
												) : (
													<ItemIcon
														iconName={inspectedItem.icon}
														className='w-8 h-8'
													/>
												)}
											</div>
										</div>

										{/* 核心數值列 (傷害 / AC / 同調狀態) */}
										{!isMasked && (
											<div className='mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-4 text-sm'>
												{inspectedItem.damage && (
													<div className='flex items-center gap-1.5'>
														<Sword className='w-4 h-4 text-amber-400' />
														<span className='text-stone-300'>傷害/效果：</span>
														<strong className='text-amber-200 font-mono'>
															{inspectedItem.damage}
														</strong>
													</div>
												)}
												{inspectedItem.ac && (
													<div className='flex items-center gap-1.5'>
														<Shield className='w-4 h-4 text-amber-400' />
														<span className='text-stone-300'>
															護甲等級 (AC)：
														</span>
														<strong className='text-amber-200 font-mono'>
															{inspectedItem.ac}
														</strong>
													</div>
												)}
												{inspectedItem.requiresAttunement && (
													<div className='flex items-center gap-1 text-xs text-amber-300/90 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-600/40'>
														<Sparkles className='w-3.5 h-3.5' />
														<span>
															需同調 (
															{inspectedItem.attuned ? '已同調' : '未同調'})
														</span>
													</div>
												)}
											</div>
										)}
									</div>

									{/* 卡片中段：D&D 5R 規則細節、武器精通、充能與風味文字 */}
									<div className='p-5 space-y-4 text-sm'>
										{isMasked ? (
											<div className='p-4 rounded-md bg-purple-950/20 border border-purple-800/50 text-purple-200 space-y-2'>
												<div className='flex items-center gap-2 font-semibold'>
													<EyeOff className='w-4 h-4 text-purple-400' />
													<span>這件物品散發著晦澀難懂的奧術波動</span>
												</div>
												<p className='text-xs text-stone-400 leading-relaxed'>
													在完成《鑑定術
													(Identify)》或花費一次短休仔細研究之前，你無法得知它的真實名稱、魔法特性與潛在詛咒。請向你的
													DM 提出鑑定申請。
												</p>
											</div>
										) : (
											<>
												{/* 魔法特性與規則說明 */}
												<div className='space-y-1.5'>
													<div className='text-xs font-semibold uppercase tracking-wider text-amber-500/90'>
														物品特性與規則效果
													</div>
													<div className='text-stone-200 whitespace-pre-line leading-relaxed bg-stone-900/60 p-3 rounded border border-stone-800 text-xs sm:text-sm'>
														{inspectedItem.effects}
													</div>
												</div>

												{/* D&D 5R 武器精通專區 (Weapon Mastery) */}
												{inspectedItem.mastery &&
													inspectedItem.mastery !== 'None' && (
														<div className='p-3 rounded-md bg-gradient-to-r from-amber-950/50 to-stone-900/80 border border-amber-700/50'>
															<div className='flex items-center gap-2 text-amber-300 font-serif font-bold text-xs sm:text-sm mb-1'>
																<Star className='w-4 h-4 fill-amber-400 text-amber-400' />
																<span>5R 武器精通：{masteryInfo.name}</span>
															</div>
															<p className='text-xs text-stone-300 leading-relaxed'>
																{masteryInfo.desc}
															</p>
														</div>
													)}

												{/* 充能次數管理 (Charges) */}
												{inspectedItem.maxCharges > 0 && (
													<div className='flex items-center justify-between p-2.5 rounded bg-stone-900/90 border border-stone-800'>
														<div className='flex items-center gap-2'>
															<Zap className='w-4 h-4 text-cyan-400' />
															<span className='text-xs text-stone-300'>
																魔法充能 ({inspectedItem.charges} /{' '}
																{inspectedItem.maxCharges})
															</span>
														</div>
														<div className='flex items-center gap-1.5'>
															{Array.from({
																length: inspectedItem.maxCharges,
															}).map((_, idx) => (
																<span
																	key={idx}
																	className={`w-3 h-3 rounded-full border ${
																		idx < inspectedItem.charges
																			? 'bg-cyan-400 border-cyan-200 shadow-[0_0_8px_#22d3ee]'
																			: 'bg-stone-950 border-stone-700'
																	}`}
																/>
															))}
															<button
																onClick={() => adjustCharges(inspectedItem, -1)}
																className='ml-2 px-2 py-0.5 text-xs rounded bg-stone-800 hover:bg-stone-700 text-stone-200 cursor-pointer'
																title='消耗 1 發充能'
															>
																-1
															</button>
															<button
																onClick={() => adjustCharges(inspectedItem, 1)}
																className='px-2 py-0.5 text-xs rounded bg-stone-800 hover:bg-stone-700 text-stone-200 cursor-pointer'
																title='恢復 1 發充能'
															>
																+1
															</button>
														</div>
													</div>
												)}
											</>
										)}

										{/* DM 專屬隱藏筆記與詛咒觸發條件 (僅在 DM 視角顯示) */}
										{viewMode === 'dm' && inspectedItem.dmNotes && (
											<div className='p-3 rounded-md bg-red-950/35 border border-red-500/50 space-y-1'>
												<div className='flex items-center gap-1.5 text-xs font-bold text-red-400'>
													<ShieldAlert className='w-4 h-4' />
													<span>DM 隱藏筆記 / 暗線詛咒 (玩家不可見)</span>
												</div>
												<p className='text-xs text-red-200/90 leading-relaxed'>
													{inspectedItem.dmNotes}
												</p>
											</div>
										)}

										{/* BG3 古典斜體風味引言 */}
										<blockquote className='italic text-xs text-stone-400 border-l-2 border-amber-700/60 pl-3 py-0.5 font-serif'>
											{inspectedItem.flavor}
										</blockquote>

										{/* 底部重量與價值 */}
										<div className='pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs text-stone-400 font-mono'>
											<span>
												單件重量：
												<strong className='text-stone-200'>
													{inspectedItem.weight} lb
												</strong>
												{inspectedItem.quantity > 1 &&
													` (總重 ${(inspectedItem.weight * inspectedItem.quantity).toFixed(1)} lb)`}
											</span>
											<span>
												價值：
												<strong className='text-amber-300'>
													{isMasked ? '??? GP' : `${inspectedItem.valueGp} GP`}
												</strong>
											</span>
										</div>

										{/* 互動操作按鈕列 */}
										<div className='pt-3 border-t border-stone-800 space-y-2.5'>
											<div className='flex flex-wrap gap-2'>
												{/* 裝備/卸下 */}
												{(inspectedItem.category === 'Weapon' ||
													inspectedItem.category === 'Armor') && (
													<button
														onClick={() => toggleEquip(inspectedItem)}
														className={`flex-1 py-2 px-3 rounded text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
															inspectedItem.equipped
																? 'bg-stone-800 border-stone-600 text-stone-200 hover:bg-stone-700'
																: 'bg-gradient-to-b from-amber-600 to-amber-800 border-amber-400 text-amber-50 hover:brightness-110'
														}`}
													>
														<Sword className='w-3.5 h-3.5' />
														<span>
															{inspectedItem.equipped
																? '卸下裝備'
																: '裝備此物品'}
														</span>
													</button>
												)}

												{/* 同調/解除同調 */}
												{inspectedItem.requiresAttunement && (
													<button
														onClick={() => toggleAttune(inspectedItem)}
														className={`flex-1 py-2 px-3 rounded text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
															inspectedItem.attuned
																? 'bg-amber-950/90 border-amber-500 text-amber-300'
																: 'bg-stone-900 border-amber-700/60 text-amber-200 hover:bg-amber-950/50'
														}`}
													>
														<Sparkles className='w-3.5 h-3.5' />
														<span>
															{inspectedItem.attuned ? '解除同調' : '進行同調'}
														</span>
													</button>
												)}

												{/* 消耗品：飲用/使用 與 拆分堆疊 */}
												{inspectedItem.category === 'Consumable' && (
													<button
														onClick={() =>
															consumeOrSplitStack(inspectedItem, 'consume')
														}
														className='flex-1 py-2 px-3 rounded text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 border border-emerald-400 text-emerald-50 transition cursor-pointer'
													>
														🧪 使用 / 消耗 1 個
													</button>
												)}
												{inspectedItem.quantity > 1 && (
													<button
														onClick={() =>
															consumeOrSplitStack(inspectedItem, 'split')
														}
														className='py-2 px-3 rounded text-xs font-medium bg-stone-800 hover:bg-stone-700 border border-stone-600 text-stone-200 transition cursor-pointer'
													>
														拆分堆疊
													</button>
												)}

												{/* 點擊換位按鈕 (方便手機/平板操作) */}
												<button
													onClick={() => {
														setMoveSourceSlot(
															moveSourceSlot === inspectedItem.slot
																? null
																: inspectedItem.slot,
														);
													}}
													className={`py-2 px-3 rounded text-xs font-medium border transition cursor-pointer flex items-center gap-1 ${
														moveSourceSlot === inspectedItem.slot
															? 'bg-cyan-900 border-cyan-400 text-cyan-100'
															: 'bg-stone-900 border-stone-700 text-stone-300 hover:border-stone-500'
													}`}
												>
													<Move className='w-3.5 h-3.5' />
													<span>
														{moveSourceSlot === inspectedItem.slot
															? '取消移動'
															: '移動格位'}
													</span>
												</button>
											</div>

											{/* 移交給其他隊友或營地儲物箱 */}
											<div className='flex items-center justify-between gap-2 bg-stone-900/80 p-2 rounded border border-stone-800'>
												<span className='text-xs text-stone-400'>
													📦 移交給隊友：
												</span>
												<div className='flex items-center gap-1.5'>
													{characters
														.filter((c) => c.id !== activeCharId)
														.map((targetChar) => (
															<button
																key={targetChar.id}
																onClick={() =>
																	transferItemToCharacter(
																		inspectedItem,
																		targetChar.id,
																	)
																}
																className='px-2 py-1 rounded bg-stone-800 hover:bg-amber-900/60 border border-stone-700 hover:border-amber-500/60 text-[11px] text-stone-200 transition cursor-pointer'
																title={`發送至 ${targetChar.name}`}
															>
																{targetChar.avatar}{' '}
																{targetChar.name.split(' ')[0]}
															</button>
														))}
												</div>
											</div>

											{/* DM 專用控制列：一鍵切換鑑定狀態 & 刪除 */}
											{viewMode === 'dm' && (
												<div className='flex items-center justify-between gap-2 pt-2 border-t border-red-950/60'>
													<button
														onClick={() => toggleIdentify(inspectedItem)}
														className='flex-1 py-1.5 px-3 rounded text-xs font-medium bg-purple-950/80 hover:bg-purple-900 border border-purple-500/60 text-purple-200 flex items-center justify-center gap-1.5 transition cursor-pointer'
													>
														{inspectedItem.isIdentified ? (
															<>
																<EyeOff className='w-3.5 h-3.5' />
																<span>設為未鑑定 (對玩家隱藏)</span>
															</>
														) : (
															<>
																<Eye className='w-3.5 h-3.5' />
																<span>完成鑑定 (向玩家公開屬性)</span>
															</>
														)}
													</button>
													<button
														onClick={() => deleteItem(inspectedItem)}
														className='p-1.5 rounded bg-red-950/60 hover:bg-red-900 border border-red-700/60 text-red-300 transition cursor-pointer'
														title='銷毀此物品'
													>
														<Trash2 className='w-4 h-4' />
													</button>
												</div>
											)}
										</div>
									</div>
								</div>
							);
						})()
					) : (
						<div className='h-64 rounded-lg border border-stone-800 bg-stone-950/60 flex flex-col items-center justify-center text-stone-500 p-6 text-center'>
							<Backpack className='w-10 h-10 mb-2 opacity-40' />
							<p className='text-sm'>
								將游標懸停或點擊左側網格中的道具，即可檢視《博德之門3》風格詳細資訊卡。
							</p>
						</div>
					)}
				</div>
);

export default ItemTooltip;
