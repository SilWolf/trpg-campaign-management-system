/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ItemIcon from '@/components/ItemIcon';
import {
	CAMP_CHEST_ID,
	resolveItemFlags,
	type Character,
	type InventoryItem,
	type Rarity,
	type RarityStyle,
	type ViewMode,
	type WeaponMasteryInfo,
	type WeaponMasteryKey,
	type ItemAffix,
} from '@/types';
import {
	Backpack,
	HelpCircle,
	EyeOff,
	Eye,
	Sparkles,
	Sword,
	Shield,
	Split,
	Send,
	Trash2,
	Lock,
	Unlock,
	Edit3,
	StickyNote,
	Check,
	Star,
	Copy,
	ClipboardPaste,
	ArrowUp,
	ArrowDown,
	Wand2,
} from 'lucide-react';

interface ItemTooltipProps {
	inspectedItem: InventoryItem | null;
	viewMode: ViewMode;
	rarityConfig: Record<Rarity, RarityStyle>;
	weaponMasteries: Record<WeaponMasteryKey, WeaponMasteryInfo>;
	characters: Character[];
	activeCharId: string;
	viewerCharId: string;
	canEditItemBag?: boolean;
	canMoveBetweenPublicAndPrivate?: boolean;
	adjustCharges: (item: InventoryItem, delta: number) => void;
	toggleEquip: (item: InventoryItem) => void;
	toggleAttune: (item: InventoryItem) => void;
	consumeOrSplitStack: (
		item: InventoryItem,
		action: 'consume' | 'split',
	) => void;
	transferItemToCharacter: (
		item: InventoryItem,
		targetCharId: string,
		transferQty?: number,
	) => void;
	toggleIdentify: (item: InventoryItem) => void;
	deleteItem: (item: InventoryItem) => void;
	onOpenEditModal: (item: InventoryItem) => void;
	onUpdatePlayerNotes: (item: InventoryItem, notes: string) => void;
	onTogglePrivate: (item: InventoryItem) => void;
	copiedAffix: ItemAffix | null;
	onCopyAffix: (affix: ItemAffix) => void;
	onPasteAffix: (item: InventoryItem) => void;
	onUpdateAffixes: (item: InventoryItem, nextAffixes: ItemAffix[]) => void;
}

const markdownClass =
	'[&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-1.5 [&_strong]:text-amber-200 [&_strong]:font-semibold [&_em]:text-stone-300 [&_blockquote]:border-l-2 [&_blockquote]:border-amber-600/60 [&_blockquote]:pl-2.5 [&_blockquote]:italic [&_blockquote]:text-stone-400 [&_code]:bg-stone-950 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-amber-300';

export default function ItemTooltip({
	inspectedItem,
	viewMode,
	rarityConfig,
	weaponMasteries,
	characters,
	activeCharId,
	viewerCharId,
	canEditItemBag = true,
	canMoveBetweenPublicAndPrivate = false,
	adjustCharges,
	toggleEquip,
	toggleAttune,
	consumeOrSplitStack,
	transferItemToCharacter,
	toggleIdentify,
	deleteItem,
	onOpenEditModal,
	onUpdatePlayerNotes,
	onTogglePrivate,
	copiedAffix,
	onCopyAffix,
	onPasteAffix,
	onUpdateAffixes,
}: ItemTooltipProps) {
	const [isEditingNote, setIsEditingNote] = useState(false);
	const [noteDraft, setNoteDraft] = useState('');
	const [transferQty, setTransferQty] = useState(1);

	useEffect(() => {
		setIsEditingNote(false);
		setNoteDraft(inspectedItem?.playerNotes || '');
		setTransferQty(inspectedItem?.quantity || 1);
	}, [inspectedItem?.id, inspectedItem?.playerNotes, inspectedItem?.quantity]);

	const isInCampChest = inspectedItem?.ownerId === CAMP_CHEST_ID;
	const canManagePrivacy = !isInCampChest && canMoveBetweenPublicAndPrivate;

	return (
		<div className='flex flex-col'>
			{inspectedItem ? (
				(() => {
					const masked = !inspectedItem.isIdentified && viewMode === 'player';
					const rStyle = masked
						? rarityConfig.Uncommon
						: rarityConfig[inspectedItem.rarity] || rarityConfig.Common;
					const masteryInfo =
						!masked && inspectedItem.mastery && inspectedItem.mastery !== 'None'
							? weaponMasteries[inspectedItem.mastery]
							: null;
					const { isEquippable, isConsumable, isImportant } =
						resolveItemFlags(inspectedItem);

					return (
						<div
							className={`rounded-lg border-2 ${rStyle.border} bg-[#110e0c] shadow-2xl overflow-hidden flex flex-col transition-all duration-200`}
						>
							{/* 頂部稀有度漸層標題區 */}
							<div
								className={`p-4 bg-gradient-to-r ${rStyle.headerGradient} border-b border-stone-800 relative`}
							>
								<div className='flex items-start justify-between gap-3'>
									<div className='flex items-center gap-3'>
										<div
											className={`w-14 h-14 rounded-md bg-stone-950/90 border ${rStyle.border} ${rStyle.glow} flex items-center justify-center shrink-0 relative`}
										>
											{masked ? (
												<HelpCircle className='w-8 h-8 text-purple-400' />
											) : (
												<ItemIcon
													iconName={inspectedItem.icon}
													className={`w-8 h-8 ${rStyle.text}`}
												/>
											)}
											{inspectedItem.isPrivate && (
												<span
													title='私人背包物品 (其他玩家不可見)'
													className='absolute -top-1.5 -right-1.5 bg-emerald-900 border border-emerald-400 text-emerald-200 p-0.5 rounded-full shadow'
												>
													<Lock className='w-3 h-3' />
												</span>
											)}
										</div>
										<div>
											<div className='flex items-center gap-2 flex-wrap'>
												<h2
													className={`text-lg font-serif font-bold ${rStyle.text}`}
												>
													{masked ? '未知的魔法物品' : inspectedItem.name}
												</h2>
												{isImportant && (
													<span className='text-[10px] px-1.5 py-0.5 rounded bg-purple-950 border border-purple-400/70 text-purple-200 flex items-center gap-1 font-medium'>
														<Star className='w-2.5 h-2.5 text-purple-300' />
														重要物品
													</span>
												)}
												{inspectedItem.isHomebrew && (
													<span className='text-[10px] px-1.5 py-0.5 rounded bg-purple-950 border border-purple-500/60 text-purple-200 font-medium'>
														DM 自創
													</span>
												)}
												{inspectedItem.isPrivate && (
													<span className='text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 flex items-center gap-1 font-medium'>
														<Lock className='w-2.5 h-2.5' />
														私人專屬
													</span>
												)}
											</div>
											<div className='text-xs text-stone-300 mt-0.5 flex items-center gap-2'>
												<span className={`font-semibold ${rStyle.text}`}>
													{masked ? '未鑑定' : rStyle.label}
												</span>
												<span>•</span>
												<span>{inspectedItem.subType}</span>
											</div>
										</div>
									</div>

									{/* 裝備 / 同調 / 未鑑定狀態標籤 */}
									<div className='flex flex-col items-end gap-1 shrink-0'>
										{inspectedItem.equipped && (
											<span className='text-[10px] px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400 text-amber-200 font-semibold'>
												已裝備
											</span>
										)}
										{inspectedItem.attuned && (
											<span className='text-[10px] px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400 text-purple-200 font-semibold flex items-center gap-1'>
												<Sparkles className='w-2.5 h-2.5' /> 已同調
											</span>
										)}
										{!inspectedItem.isIdentified && viewMode === 'dm' && (
											<span className='text-[10px] px-2 py-0.5 rounded bg-red-950 border border-red-500/70 text-red-300 flex items-center gap-1'>
												<EyeOff className='w-2.5 h-2.5' /> 對玩家隱藏中
											</span>
										)}
									</div>
								</div>
							</div>

							{/* 核心數值區 */}
							<div className='p-4 space-y-3.5 text-sm'>
								{!masked && (inspectedItem.damage || inspectedItem.ac) && (
									<div className='grid grid-cols-2 gap-2.5 bg-stone-900/90 border border-stone-800 rounded-md p-2.5'>
										{inspectedItem.damage && (
											<div>
												<div className='text-[10px] text-stone-400 uppercase'>
													傷害骰 (Damage)
												</div>
												<div className='text-sm font-bold text-amber-300 flex items-center gap-1.5 mt-0.5'>
													<Sword className='w-4 h-4 text-amber-500' />
													<span>{inspectedItem.damage}</span>
												</div>
											</div>
										)}
										{inspectedItem.ac && (
											<div>
												<div className='text-[10px] text-stone-400 uppercase'>
													護甲等級 (Armor Class)
												</div>
												<div className='text-sm font-bold text-sky-300 flex items-center gap-1.5 mt-0.5'>
													<Shield className='w-4 h-4 text-sky-400' />
													<span>AC {inspectedItem.ac}</span>
												</div>
											</div>
										)}
									</div>
								)}

								{/* D&D 5R (2024) 武器精通專屬區塊 */}
								{masteryInfo && (
									<div className='bg-amber-950/30 border border-amber-700/50 rounded-md p-2.5'>
										<div className='flex items-center justify-between text-xs font-bold text-amber-300 mb-1'>
											<span>⚔️ 5R 武器精通：{masteryInfo.name}</span>
											<span className='text-[10px] px-1.5 py-0.2 bg-amber-900/60 rounded text-amber-200'>
												2024 規則
											</span>
										</div>
										<p className='text-xs text-stone-300 leading-relaxed'>
											{masteryInfo.desc}
										</p>
									</div>
								)}

								{/* 充能次數管理 */}
								{!masked && inspectedItem.maxCharges > 0 && (
									<div className='bg-stone-900/80 border border-stone-800 rounded-md p-2.5 flex items-center justify-between'>
										<div>
											<div className='text-xs text-stone-300 font-medium'>
												魔法充能 (Charges)
											</div>
											<div className='flex items-center gap-1.5 mt-1'>
												{Array.from({
													length: inspectedItem.maxCharges,
												}).map((_, i) => (
													<span
														key={i}
														className={`w-3.5 h-3.5 rounded-full border transition ${
															i < inspectedItem.charges
																? 'bg-cyan-400 border-cyan-200 shadow-[0_0_8px_#22d3ee]'
																: 'bg-stone-950 border-stone-700'
														}`}
													/>
												))}
											</div>
										</div>
										{canEditItemBag && (
											<div className='flex items-center gap-1.5'>
												<button
													onClick={() => adjustCharges(inspectedItem, -1)}
													className='px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-200 border border-stone-600 cursor-pointer'
												>
													消耗 -1
												</button>
												<button
													onClick={() => adjustCharges(inspectedItem, 1)}
													className='px-2.5 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 text-xs font-bold text-cyan-200 border border-cyan-700/60 cursor-pointer'
												>
													恢復 +1
												</button>
											</div>
										)}
									</div>
								)}

								{/* 物品魔法效果描述 */}
								<div className='bg-stone-900/50 border border-stone-800/80 rounded-md p-3'>
									<div className='text-[11px] text-stone-400 font-semibold mb-1.5 flex items-center justify-between'>
										<span>物品效果與規則</span>
										{inspectedItem.requiresAttunement && (
											<span className='text-amber-400'>* 需同調</span>
										)}
									</div>
									{masked ? (
										<p className='text-xs leading-relaxed text-purple-300/90 italic'>
											此物品散發著晦澀難明的魔法波動。在透過《鑑定術》(Identify)
											或短休研究前，無法得知其確切能力與潛在詛咒。
										</p>
									) : (
										<div
											className={`text-xs leading-relaxed text-stone-200 ${markdownClass}`}
										>
											<ReactMarkdown>{inspectedItem.effects}</ReactMarkdown>
										</div>
									)}
								</div>

								{/* 物品附魔詞條 (Affixes) 區塊 */}
								{(() => {
									const allAffixes = inspectedItem.affixes || [];
									const visibleAffixes =
										viewMode === 'dm'
											? allAffixes
											: masked
												? []
												: allAffixes.filter((a) => !a.isHidden);
									const hiddenCount = allAffixes.filter(
										(a) => a.isHidden,
									).length;

									if (allAffixes.length === 0 && viewMode !== 'dm') return null;
									if (
										allAffixes.length === 0 &&
										viewMode === 'dm' &&
										!copiedAffix
									)
										return null;

									const moveAffix = (index: number, dir: -1 | 1) => {
										const targetIdx = index + dir;
										if (targetIdx < 0 || targetIdx >= allAffixes.length) return;
										const next = [...allAffixes];
										[next[index], next[targetIdx]] = [
											next[targetIdx],
											next[index],
										];
										onUpdateAffixes(inspectedItem, next);
									};

									const toggleAffixHidden = (affixId: string) => {
										const next = allAffixes.map((a) =>
											a.id === affixId ? { ...a, isHidden: !a.isHidden } : a,
										);
										onUpdateAffixes(inspectedItem, next);
									};

									return (
										<div className='bg-stone-900/70 border border-amber-700/40 rounded-md p-3 space-y-2.5'>
											<div className='flex items-center justify-between'>
												<span className='text-[11px] font-semibold text-amber-300 flex items-center gap-1.5'>
													<Wand2 className='w-3.5 h-3.5 text-amber-400' />
													<span>附魔詞條 (Affixes)</span>
												</span>

												{viewMode === 'dm' && copiedAffix && (
													<button
														onClick={() => onPasteAffix(inspectedItem)}
														className='text-[11px] px-2 py-0.5 rounded bg-purple-950/90 hover:bg-purple-900 border border-purple-500/60 text-purple-200 flex items-center gap-1 cursor-pointer transition'
														title={`貼上詞條：${copiedAffix.name}`}
													>
														<ClipboardPaste className='w-3 h-3 text-purple-300' />
														<span>貼上「{copiedAffix.name}」</span>
													</button>
												)}
											</div>

											{visibleAffixes.length > 0 && (
												<div className='space-y-2'>
													{visibleAffixes.map((affix, idx) => (
														<div
															key={affix.id}
															className={`p-2.5 rounded border transition ${
																affix.isHidden
																	? 'bg-red-950/25 border-red-800/50'
																	: 'bg-stone-950/80 border-stone-800'
															}`}
														>
															<div className='flex items-center justify-between gap-2 mb-1'>
																<div className='flex items-center gap-1.5 flex-wrap'>
																	<span className='text-xs font-serif font-bold text-amber-200'>
																		✦ {affix.name}
																	</span>
																	{viewMode === 'dm' && affix.isHidden && (
																		<span className='text-[9px] px-1.5 py-0.2 rounded bg-red-950 border border-red-500/60 text-red-300 flex items-center gap-0.5'>
																			<EyeOff className='w-2.5 h-2.5' />{' '}
																			玩家隱藏中
																		</span>
																	)}
																</div>

																{viewMode === 'dm' && (
																	<div className='flex items-center gap-1 shrink-0'>
																		<button
																			onClick={() => moveAffix(idx, -1)}
																			disabled={idx === 0}
																			title='上移詞條'
																			className='p-1 rounded bg-stone-900 hover:bg-stone-800 disabled:opacity-30 text-stone-400 hover:text-stone-200 cursor-pointer'
																		>
																			<ArrowUp className='w-3 h-3' />
																		</button>
																		<button
																			onClick={() => moveAffix(idx, 1)}
																			disabled={
																				idx === visibleAffixes.length - 1
																			}
																			title='下移詞條'
																			className='p-1 rounded bg-stone-900 hover:bg-stone-800 disabled:opacity-30 text-stone-400 hover:text-stone-200 cursor-pointer'
																		>
																			<ArrowDown className='w-3 h-3' />
																		</button>
																		<button
																			onClick={() =>
																				toggleAffixHidden(affix.id)
																			}
																			title={
																				affix.isHidden
																					? '向玩家揭露此詞條'
																					: '對玩家隱藏此詞條'
																			}
																			className={`p-1 rounded border cursor-pointer ${
																				affix.isHidden
																					? 'bg-purple-950/80 border-purple-500/60 text-purple-200 hover:bg-purple-900'
																					: 'bg-stone-900 border-stone-700 text-stone-400 hover:text-stone-200'
																			}`}
																		>
																			{affix.isHidden ? (
																				<Eye className='w-3 h-3' />
																			) : (
																				<EyeOff className='w-3 h-3' />
																			)}
																		</button>
																		<button
																			onClick={() => onCopyAffix(affix)}
																			title='複製此詞條以貼到其他物品'
																			className='p-1 rounded bg-stone-900 hover:bg-amber-950 border border-stone-700 hover:border-amber-600/60 text-stone-300 hover:text-amber-200 cursor-pointer'
																		>
																			<Copy className='w-3 h-3' />
																		</button>
																	</div>
																)}
															</div>

															<div
																className={`text-xs leading-relaxed text-stone-300 ${markdownClass}`}
															>
																<ReactMarkdown>{affix.desc}</ReactMarkdown>
															</div>
														</div>
													))}
												</div>
											)}

											{viewMode === 'player' && !masked && hiddenCount > 0 && (
												<div className='px-2.5 py-1.5 rounded bg-purple-950/20 border border-dashed border-purple-700/40 text-[11px] text-purple-300/80 italic flex items-center gap-1.5'>
													<Sparkles className='w-3 h-3 text-purple-400 shrink-0' />
													<span>
														此物品似乎還潛藏著 {hiddenCount}{' '}
														道尚未揭露的未知詞條...
													</span>
												</div>
											)}
										</div>
									);
								})()}

								{/* 背景風味文字 */}
								<div
									className={`border-l-2 border-amber-700/60 pl-3 py-0.5 text-xs italic text-stone-400 ${markdownClass}`}
								>
									<ReactMarkdown>{inspectedItem.flavor}</ReactMarkdown>
								</div>

								{/* 玩家個人備註區塊 */}
								<div className='bg-amber-950/15 border border-amber-800/40 rounded-md p-3'>
									<div className='flex items-center justify-between mb-1.5'>
										<span className='text-[11px] font-semibold text-amber-300/90 flex items-center gap-1.5'>
											<StickyNote className='w-3.5 h-3.5 text-amber-400' />
											<span>玩家物品備註 (支援 Markdown)</span>
										</span>
										{canEditItemBag &&
											(!isEditingNote ? (
												<button
													onClick={() => setIsEditingNote(true)}
													className='text-[11px] px-2 py-0.5 rounded bg-stone-900 hover:bg-stone-800 text-amber-300 border border-amber-700/50 flex items-center gap-1 cursor-pointer'
												>
													<Edit3 className='w-3 h-3' />
													<span>
														{inspectedItem.playerNotes
															? '編輯備註'
															: '新增備註'}
													</span>
												</button>
											) : (
												<div className='flex items-center gap-1.5'>
													<button
														onClick={() => {
															setIsEditingNote(false);
															setNoteDraft(inspectedItem.playerNotes || '');
														}}
														className='text-[11px] px-2 py-0.5 rounded bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-700 cursor-pointer'
													>
														取消
													</button>
													<button
														onClick={() => {
															onUpdatePlayerNotes(inspectedItem, noteDraft);
															setIsEditingNote(false);
														}}
														className='text-[11px] px-2 py-0.5 rounded bg-amber-700 hover:bg-amber-600 text-amber-50 flex items-center gap-1 font-medium cursor-pointer'
													>
														<Check className='w-3 h-3' />
														<span>儲存</span>
													</button>
												</div>
											))}
									</div>

									{isEditingNote ? (
										<textarea
											rows={3}
											value={noteDraft}
											onChange={(e) => setNoteDraft(e.target.value)}
											placeholder='在此寫下你的筆記（支援 **粗體** 與清單）'
											className='w-full bg-stone-950 border border-amber-600/60 rounded p-2 text-xs text-stone-200 outline-none font-mono'
										/>
									) : inspectedItem.playerNotes ? (
										<div
											className={`text-xs text-amber-100/90 leading-relaxed ${markdownClass}`}
										>
											<ReactMarkdown>{inspectedItem.playerNotes}</ReactMarkdown>
										</div>
									) : (
										<p className='text-[11px] text-stone-500 italic'>
											尚無玩家備註。
										</p>
									)}
								</div>

								{/* DM 專屬秘密筆記 */}
								{viewMode === 'dm' && inspectedItem.dmNotes && (
									<div className='bg-red-950/40 border border-red-500/60 rounded-md p-3'>
										<div className='flex items-center gap-1.5 text-xs font-bold text-red-300 mb-1'>
											<Eye className='w-3.5 h-3.5 text-red-400' />
											<span>DM 專屬隱藏筆記 (玩家不可見)</span>
										</div>
										<div
											className={`text-xs text-red-200/90 leading-relaxed ${markdownClass}`}
										>
											<ReactMarkdown>{inspectedItem.dmNotes}</ReactMarkdown>
										</div>
									</div>
								)}

								{/* 底部重量與價值資訊 */}
								<div className='flex items-center justify-between pt-2 border-t border-stone-800 text-xs text-stone-400 font-mono'>
									<div>
										單件重量:{' '}
										<span className='text-stone-200'>
											{inspectedItem.weight} lb
										</span>
										{inspectedItem.quantity > 1 && (
											<span className='text-stone-400'>
												{' '}
												(總重{' '}
												{
													+(
														inspectedItem.weight * inspectedItem.quantity
													).toFixed(1)
												}{' '}
												lb)
											</span>
										)}
									</div>
									<div>
										估價:{' '}
										<span className='text-amber-300 font-semibold'>
											{masked ? '???' : `${inspectedItem.valueGp} GP`}
										</span>
									</div>
								</div>

								{/* 互動操作按鈕列 */}
								<div className='pt-2 border-t border-stone-800 space-y-2'>
									{canEditItemBag ? (
										<>
											<div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
												{!isInCampChest && isEquippable && (
													<button
														onClick={() => toggleEquip(inspectedItem)}
														className={`px-3 py-1.5 rounded text-xs font-medium border transition cursor-pointer ${
															inspectedItem.equipped
																? 'bg-amber-900/60 border-amber-400 text-amber-100'
																: 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-200'
														}`}
													>
														{inspectedItem.equipped ? '卸下裝備' : '穿戴裝備'}
													</button>
												)}

												{!isInCampChest && inspectedItem.requiresAttunement && (
													<button
														onClick={() => toggleAttune(inspectedItem)}
														className={`px-3 py-1.5 rounded text-xs font-medium border transition cursor-pointer ${
															inspectedItem.attuned
																? 'bg-purple-900/70 border-purple-400 text-purple-100'
																: 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-200'
														}`}
													>
														{inspectedItem.attuned ? '解除同調' : '✨ 進行同調'}
													</button>
												)}

												{canManagePrivacy && (
													<button
														onClick={() => onTogglePrivate(inspectedItem)}
														className={`px-3 py-1.5 rounded text-xs font-medium border flex items-center justify-center gap-1 transition cursor-pointer ${
															inspectedItem.isPrivate
																? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-200 hover:bg-emerald-900'
																: 'bg-stone-900 hover:bg-stone-800 border-stone-700 text-stone-300'
														}`}
													>
														{inspectedItem.isPrivate ? (
															<>
																<Unlock className='w-3.5 h-3.5 text-emerald-400' />
																<span>移回公開袋</span>
															</>
														) : (
															<>
																<Lock className='w-3.5 h-3.5 text-stone-400' />
																<span>藏入私人袋</span>
															</>
														)}
													</button>
												)}

												{isConsumable && (
													<button
														onClick={() =>
															consumeOrSplitStack(inspectedItem, 'consume')
														}
														className='px-3 py-1.5 rounded text-xs font-medium bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/60 text-emerald-200 cursor-pointer'
													>
														飲用 / 消耗 (-1)
													</button>
												)}

												{inspectedItem.quantity > 1 && (
													<button
														onClick={() =>
															consumeOrSplitStack(inspectedItem, 'split')
														}
														className='px-3 py-1.5 rounded text-xs font-medium bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 flex items-center justify-center gap-1 cursor-pointer'
													>
														<Split className='w-3.5 h-3.5' />
														<span>拆分堆疊</span>
													</button>
												)}
											</div>

											{/* 單向移交給隊友或營地儲物箱（只要有來源背包修改權即可移出） */}
											<div className='flex flex-col gap-2 pt-1.5 border-t border-stone-800/70'>
												<div className='flex items-center justify-between gap-2 flex-wrap'>
													<span className='text-[11px] text-stone-400 flex items-center gap-1'>
														<Send className='w-3 h-3 text-amber-400' />
														<span>
															{isInCampChest
																? '從儲物箱領取至：'
																: '單向移交或送往營地：'}
														</span>
													</span>

													{inspectedItem.quantity > 1 && (
														<div className='flex items-center gap-1 bg-stone-950 border border-stone-700 rounded px-1.5 py-0.5 text-[11px]'>
															<span className='text-stone-400 mr-1'>數量:</span>
															<button
																type='button'
																onClick={() =>
																	setTransferQty((q) => Math.max(1, q - 1))
																}
																className='px-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold cursor-pointer'
															>
																-
															</button>
															<input
																type='number'
																min={1}
																max={inspectedItem.quantity}
																value={transferQty}
																onChange={(e) => {
																	const val = parseInt(e.target.value, 10);
																	if (isNaN(val)) setTransferQty(1);
																	else
																		setTransferQty(
																			Math.max(
																				1,
																				Math.min(inspectedItem.quantity, val),
																			),
																		);
																}}
																className='w-10 text-center bg-transparent font-mono font-bold text-amber-300 outline-none'
															/>
															<button
																type='button'
																onClick={() =>
																	setTransferQty((q) =>
																		Math.min(inspectedItem.quantity, q + 1),
																	)
																}
																className='px-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold cursor-pointer'
															>
																+
															</button>
															<button
																type='button'
																onClick={() =>
																	setTransferQty(inspectedItem.quantity)
																}
																className='ml-1 px-1.5 py-0.2 rounded bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-700/50 text-[10px] cursor-pointer'
															>
																全部 ({inspectedItem.quantity})
															</button>
														</div>
													)}
												</div>

												<div className='flex items-center gap-1.5 flex-wrap'>
													{!isInCampChest && (
														<button
															onClick={() =>
																transferItemToCharacter(
																	inspectedItem,
																	CAMP_CHEST_ID,
																	transferQty,
																)
															}
															className='text-[11px] px-2.5 py-1 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/70 text-cyan-100 font-medium transition cursor-pointer'
														>
															🏕️ 送往營地儲物箱
															{inspectedItem.quantity > 1
																? ` (${transferQty})`
																: ''}
														</button>
													)}

													{characters
														.filter(
															(c) =>
																c.id !== activeCharId && c.id !== CAMP_CHEST_ID,
														)
														.sort((a, b) =>
															a.id === viewerCharId
																? -1
																: b.id === viewerCharId
																	? 1
																	: 0,
														)
														.map((target) => {
															const isMe =
																viewMode === 'player' &&
																target.id === viewerCharId;
															return (
																<button
																	key={target.id}
																	onClick={() =>
																		transferItemToCharacter(
																			inspectedItem,
																			target.id,
																			transferQty,
																		)
																	}
																	className={`text-[11px] px-2 py-1 rounded border transition cursor-pointer ${
																		isMe && isInCampChest
																			? 'bg-emerald-950/90 hover:bg-emerald-900 border-emerald-500/70 text-emerald-100 font-semibold'
																			: 'bg-stone-900 hover:bg-amber-950 border-stone-700 hover:border-amber-600/60 text-stone-300'
																	}`}
																>
																	{target.avatar} {target.name.split(' ')[0]}
																	{inspectedItem.quantity > 1
																		? ` (${transferQty})`
																		: ''}
																	{isMe && isInCampChest ? ' 領回' : ''}
																</button>
															);
														})}
												</div>
											</div>
										</>
									) : (
										<div className='py-2 text-xs text-stone-500 italic flex items-center gap-1.5'>
											<Lock className='w-3.5 h-3.5 text-stone-500 shrink-0' />
											<span>唯讀檢視：你沒有修改或轉移此背包物品的權限。</span>
										</div>
									)}

									{/* DM 專屬控制列 */}
									{viewMode === 'dm' && (
										<div className='pt-2 mt-2 border-t border-red-900/40 flex flex-wrap items-center justify-between gap-2'>
											<div className='flex items-center gap-2'>
												<button
													onClick={() => onOpenEditModal(inspectedItem)}
													className='px-3 py-1.5 rounded text-xs font-medium bg-amber-950/90 hover:bg-amber-900 border border-amber-500/70 text-amber-200 flex items-center gap-1.5 cursor-pointer'
												>
													<Edit3 className='w-3.5 h-3.5' />
													<span>DM 編輯物品</span>
												</button>
												<button
													onClick={() => toggleIdentify(inspectedItem)}
													className='px-3 py-1.5 rounded text-xs font-medium bg-purple-950/90 hover:bg-purple-900 border border-purple-500/70 text-purple-200 flex items-center gap-1.5 cursor-pointer'
												>
													{inspectedItem.isIdentified ? (
														<>
															<EyeOff className='w-3.5 h-3.5' />
															<span>設為未鑑定</span>
														</>
													) : (
														<>
															<Eye className='w-3.5 h-3.5' />
															<span>向玩家揭露鑑定</span>
														</>
													)}
												</button>
											</div>

											<button
												onClick={() => deleteItem(inspectedItem)}
												className='px-2.5 py-1.5 rounded text-xs bg-red-950/70 hover:bg-red-900 border border-red-700/60 text-red-200 flex items-center gap-1 cursor-pointer'
											>
												<Trash2 className='w-3.5 h-3.5' />
												<span>銷毀</span>
											</button>
										</div>
									)}
								</div>
							</div>
						</div>
					);
				})()
			) : (
				<div className='h-64 rounded-lg border border-stone-800 bg-stone-950/70 flex flex-col items-center justify-center text-stone-500 text-sm p-6 text-center'>
					<Backpack className='w-8 h-8 mb-2 opacity-40' />
					<p>將滑鼠懸停或點擊左側背包中的物品，即可檢視詳細規則與風味描述。</p>
				</div>
			)}
		</div>
	);
}
