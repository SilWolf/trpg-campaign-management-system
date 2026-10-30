/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import ItemIcon from './ItemIcon';
import {
	CAMP_CHEST_ID,
	getItemArmorClass,
	getItemDamage,
	getItemWeaponMastery,
	resolveItemFlags,
	type Character,
	type InventoryItem,
	type ItemBaseRarity,
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
	Edit3,
	StickyNote,
	Check,
	Star,
	Copy,
	ClipboardPaste,
	ArrowUp,
	ArrowDown,
	Wand2,
	Globe2,
} from 'lucide-react';
import { Button, Input, Textarea } from '@/components/ui';
import { CharacterAvatar } from '@/components/CharacterAvatar';

interface ItemTooltipProps {
	inspectedItem: InventoryItem | null;
	viewMode: ViewMode;
	rarityConfig: Record<ItemBaseRarity, RarityStyle>;
	weaponMasteries: Record<WeaponMasteryKey, WeaponMasteryInfo>;
	characters: Character[];
	activeCharId: string;
	viewerCharId: string;
	canEditItemBag?: boolean;
	canMakeItemPublic?: boolean;
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
	onMakeItemPublic: (item: InventoryItem) => void;
	copiedAffix: ItemAffix | null;
	onCopyAffix: (affix: ItemAffix) => void;
	onPasteAffix: (item: InventoryItem) => void;
	onUpdateAffixes: (item: InventoryItem, nextAffixes: ItemAffix[]) => void;
}

const markdownClass =
	'[&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-1.5 [&_strong]:text-primary-foreground [&_strong]:font-semibold [&_em]:text-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-primary/60 [&_blockquote]:pl-2.5 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-primary-foreground';

export default function ItemTooltip({
	inspectedItem,
	viewMode,
	rarityConfig,
	weaponMasteries,
	characters,
	activeCharId,
	viewerCharId,
	canEditItemBag = true,
	canMakeItemPublic = false,
	adjustCharges,
	toggleEquip,
	toggleAttune,
	consumeOrSplitStack,
	transferItemToCharacter,
	toggleIdentify,
	deleteItem,
	onOpenEditModal,
	onUpdatePlayerNotes,
	onMakeItemPublic,
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
	const canManagePrivacy =
		!isInCampChest && Boolean(inspectedItem?.isPrivate) && canMakeItemPublic;

	return (
		<div className='flex flex-col'>
			{inspectedItem ? (
				(() => {
					const masked = !inspectedItem.isIdentified && viewMode === 'player';
					const rStyle = masked
						? rarityConfig.Uncommon
						: rarityConfig[inspectedItem.rarity] || rarityConfig.Common;
					const damage = getItemDamage(inspectedItem);
					const armorClass = getItemArmorClass(inspectedItem);
					const weaponMastery = getItemWeaponMastery(inspectedItem);
					const masteryInfo =
						!masked && weaponMastery ? weaponMasteries[weaponMastery] : null;
					const { isEquippable, isConsumable, isImportant } =
						resolveItemFlags(inspectedItem);

					return (
						<div
							className={`rounded-lg border-2 ${rStyle.border} bg-card shadow-2xl overflow-hidden flex flex-col transition-all duration-200`}
						>
							{/* 頂部稀有度漸層標題區 */}
							<div
								className={`p-4 ${rStyle.headerGradient} border-b border-border relative`}
							>
								<div className='flex items-start justify-between gap-3'>
									<div className='flex items-center gap-3'>
										<div
											className={`w-14 h-14 rounded-md bg-background/90 border ${rStyle.border} ${rStyle.glow} flex items-center justify-center shrink-0 relative`}
										>
											{masked ? (
												<HelpCircle className='w-8 h-8 text-muted-foreground' />
											) : (
												<ItemIcon
													iconName={inspectedItem.icon}
													className={`w-8 h-8 ${rStyle.text}`}
													imageSize='512'
												/>
											)}
											{inspectedItem.isPrivate && (
												<span
													title='秘密物品（其他玩家不可見）'
													className='absolute -top-1.5 -right-1.5 bg-private-surface border border-private/60 text-private p-0.5 rounded-full shadow'
												>
													<EyeOff className='w-3 h-3' />
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
													<span className='text-[10px] px-1.5 py-0.5 rounded bg-background border border-border/70 text-foreground flex items-center gap-1 font-medium'>
														<Star className='w-2.5 h-2.5 text-foreground' />
														重要物品
													</span>
												)}
												{inspectedItem.isHomebrew && (
													<span className='text-[10px] px-1.5 py-0.5 rounded bg-background border border-border/60 text-foreground font-medium'>
														DM 自創
													</span>
												)}
												{inspectedItem.isPrivate && (
													<span className='text-[10px] px-1.5 py-0.5 rounded bg-private-surface/70 border border-private/50 text-private flex items-center gap-1 font-medium'>
														<EyeOff className='w-2.5 h-2.5' />
														秘密物品
													</span>
												)}
											</div>
											<div className='text-xs text-foreground mt-0.5 flex items-center gap-2'>
												<span className={`font-semibold ${rStyle.text}`}>
													{masked ? '未鑑定' : rStyle.label}
												</span>
												<span>•</span>
												<span>{inspectedItem.subTypes.join('、')}</span>
											</div>
										</div>
									</div>

									{/* 裝備 / 同調 / 未鑑定狀態標籤 */}
									<div className='flex flex-col items-end gap-1 shrink-0'>
										{inspectedItem.equipped && (
											<span className='text-[10px] px-2 py-0.5 rounded bg-primary border border-primary text-primary-foreground font-semibold'>
												已裝備
											</span>
										)}
										{inspectedItem.attuned && (
											<span className='text-[10px] px-2 py-0.5 rounded bg-secondary/20 border border-border text-foreground font-semibold flex items-center gap-1'>
												<Sparkles className='w-2.5 h-2.5' /> 已同調
											</span>
										)}
										{!inspectedItem.isIdentified && viewMode === 'dm' && (
											<span className='text-[10px] px-2 py-0.5 rounded bg-muted border border-border text-foreground flex items-center gap-1'>
												<EyeOff className='w-2.5 h-2.5' /> 對玩家隱藏中
											</span>
										)}
									</div>
								</div>
							</div>

							{/* 核心數值區 */}
							<div className='p-4 space-y-3.5 text-sm'>
								{!masked && (damage || armorClass) && (
									<div className='grid grid-cols-2 gap-2.5 bg-card/90 border border-border rounded-md p-2.5'>
										{damage && (
											<div>
												<div className='text-[10px] text-muted-foreground uppercase'>
													傷害
												</div>
												<div className='text-sm font-bold text-highlight flex items-center gap-1.5 mt-0.5'>
													<Sword className='w-4 h-4 text-highlight' />
													<span>{damage}</span>
												</div>
											</div>
										)}
										{armorClass && (
											<div>
												<div className='text-[10px] text-muted-foreground uppercase'>
													護甲等級 (Armor Class)
												</div>
												<div className='text-sm font-bold text-foreground flex items-center gap-1.5 mt-0.5'>
													<Shield className='w-4 h-4 text-muted-foreground' />
													<span>AC {armorClass}</span>
												</div>
											</div>
										)}
									</div>
								)}

								{/* D&D 5R (2024) 武器精通專屬區塊 */}
								{masteryInfo && (
									<div className='bg-primary/10 border border-primary/50 rounded-md p-2.5'>
										<div className='flex items-center justify-between text-xs font-bold text-highlight mb-1'>
											<span>⚔️ 5R 武器精通：{masteryInfo.name}</span>
											<span className='text-[10px] px-1.5 py-0.2 bg-primary/60 rounded text-primary-foreground'>
												2024 規則
											</span>
										</div>
										<p className='text-xs text-foreground leading-relaxed'>
											{masteryInfo.desc}
										</p>
									</div>
								)}

								{/* 充能次數管理 */}
								{!masked && inspectedItem.maxCharges > 0 && (
									<div className='bg-card/80 border border-border rounded-md p-2.5 flex items-center justify-between'>
										<div>
											<div className='text-xs text-foreground font-medium'>
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
																? 'bg-primary border-border shadow-lg'
																: 'bg-background border-border'
														}`}
													/>
												))}
											</div>
										</div>
										{canEditItemBag && (
											<div className='flex items-center gap-1.5'>
												<Button
													type='button'
													variant='secondary'
													size='sm'
													onClick={() => adjustCharges(inspectedItem, -1)}
												>
													消耗 -1
												</Button>
												<Button
													type='button'
													variant='secondary'
													size='sm'
													onClick={() => adjustCharges(inspectedItem, 1)}
												>
													恢復 +1
												</Button>
											</div>
										)}
									</div>
								)}

								{/* 物品魔法效果描述 */}
								<div className='bg-card/50 border border-border/80 rounded-md p-3'>
									<div className='text-[11px] text-muted-foreground font-semibold mb-1.5 flex items-center justify-between'>
										<span>物品效果與規則</span>
										{inspectedItem.isRequireAttunement && (
											<span className='text-primary-foreground'>* 需同調</span>
										)}
									</div>
									{masked ? (
										<p className='text-xs leading-relaxed text-foreground/90 italic'>
											此物品散發著晦澀難明的魔法波動。在透過《鑑定術》(Identify)
											或短休研究前，無法得知其確切能力與潛在詛咒。
										</p>
									) : (
										<div
											className={`text-xs leading-relaxed text-foreground ${markdownClass}`}
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
										<div className='bg-card/70 border border-primary/40 rounded-md p-3 space-y-2.5'>
											<div className='flex items-center justify-between'>
												<span className='text-[11px] font-semibold text-primary-foreground flex items-center gap-1.5'>
													<Wand2 className='w-3.5 h-3.5 text-primary-foreground' />
													<span>附魔詞條 (Affixes)</span>
												</span>

												{viewMode === 'dm' && copiedAffix && (
													<Button
														type='button'
														variant='secondary-dm'
														size='sm'
														onClick={() => onPasteAffix(inspectedItem)}
														title={`貼上詞條：${copiedAffix.name}`}
														prefixIcon={<ClipboardPaste />}
													>
														<span>貼上「{copiedAffix.name}」</span>
													</Button>
												)}
											</div>

											{visibleAffixes.length > 0 && (
												<div className='space-y-2'>
													{visibleAffixes.map((affix, idx) => (
														<div
															key={affix.id}
															className={`p-2.5 rounded border transition ${
																affix.isHidden
																	? 'bg-muted border-border'
																	: 'bg-background/80 border-border'
															}`}
														>
															<div className='flex items-center justify-between gap-2 mb-1'>
																<div className='flex items-center gap-1.5 flex-wrap'>
																	<span className='text-xs font-serif font-bold text-primary-foreground'>
																		✦ {affix.name}
																	</span>
																	{viewMode === 'dm' && affix.isHidden && (
																		<span className='text-[9px] px-1.5 py-0.2 rounded bg-muted border border-border text-foreground flex items-center gap-0.5'>
																			<EyeOff className='w-2.5 h-2.5' />{' '}
																			玩家隱藏中
																		</span>
																	)}
																</div>

																{viewMode === 'dm' && (
																	<div className='flex items-center gap-1 shrink-0'>
																		<Button
																			type='button'
																			variant='ghost-dm'
																			size='sm'
																			onClick={() => moveAffix(idx, -1)}
																			disabled={idx === 0}
																			title='上移詞條'
																			prefixIcon={<ArrowUp />}
																		>
																		</Button>
																		<Button
																			type='button'
																			variant='ghost-dm'
																			size='sm'
																			onClick={() => moveAffix(idx, 1)}
																			disabled={
																				idx === visibleAffixes.length - 1
																			}
																			title='下移詞條'
																			prefixIcon={<ArrowDown />}
																		>
																		</Button>
																		<Button
																			type='button'
																			variant='ghost-dm'
																			size='sm'
																			onClick={() =>
																				toggleAffixHidden(affix.id)
																			}
																			title={
																				affix.isHidden
																					? '向玩家揭露此詞條'
																					: '對玩家隱藏此詞條'
																			}
																			prefixIcon={
																				affix.isHidden ? (
																					<Eye />
																				) : (
																					<EyeOff />
																				)
																			}
																		>
																		</Button>
																		<Button
																			type='button'
																			variant='ghost-dm'
																			size='sm'
																			onClick={() => onCopyAffix(affix)}
																			title='複製此詞條以貼到其他物品'
																			prefixIcon={<Copy />}
																		>
																		</Button>
																	</div>
																)}
															</div>

															<div
																className={`text-xs leading-relaxed text-foreground ${markdownClass}`}
															>
																<ReactMarkdown>{affix.desc}</ReactMarkdown>
															</div>
														</div>
													))}
												</div>
											)}

											{viewMode === 'player' && !masked && hiddenCount > 0 && (
												<div className='px-2.5 py-1.5 rounded bg-background/20 border border-dashed border-border/40 text-[11px] text-foreground/80 italic flex items-center gap-1.5'>
													<Sparkles className='w-3 h-3 text-muted-foreground shrink-0' />
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
									className={`border-l-2 border-primary/60 pl-3 py-0.5 text-xs italic text-muted-foreground ${markdownClass}`}
								>
									<ReactMarkdown>{inspectedItem.flavor}</ReactMarkdown>
								</div>

								{/* 玩家個人備註區塊 */}
								<div className='bg-primary/15 border border-primary/40 rounded-md p-3'>
									<div className='flex items-start justify-between mb-1.5'>
										<span className='text-xs font-semibold text-highlight flex items-center gap-1.5'>
											<StickyNote className='w-3.5 h-3.5' />
											<span>玩家物品備註 (支援 Markdown)</span>
										</span>
										{canEditItemBag &&
											(!isEditingNote ? (
												<Button
													type='button'
													variant='secondary'
													size='sm'
													onClick={() => setIsEditingNote(true)}
													prefixIcon={<Edit3 />}
												>
													<span>
														{inspectedItem.playerNotes
															? '編輯備註'
															: '新增備註'}
													</span>
												</Button>
											) : (
												<div className='flex items-center gap-1.5'>
													<Button
														type='button'
														variant='secondary'
														size='sm'
														onClick={() => {
															setIsEditingNote(false);
															setNoteDraft(inspectedItem.playerNotes || '');
														}}
													>
														取消
													</Button>
													<Button
														type='button'
														variant='primary'
														size='sm'
														onClick={() => {
															onUpdatePlayerNotes(inspectedItem, noteDraft);
															setIsEditingNote(false);
														}}
														prefixIcon={<Check />}
													>
														<span>儲存</span>
													</Button>
												</div>
											))}
									</div>

									{isEditingNote ? (
										<Textarea
											aria-label='玩家物品備註'
											rows={3}
											value={noteDraft}
											onChange={(e) => setNoteDraft(e.target.value)}
											placeholder='在此寫下你的筆記（支援 **粗體** 與清單）'
											className='w-full bg-background border border-primary/60 rounded p-2 text-xs text-foreground outline-none font-mono'
										/>
									) : inspectedItem.playerNotes ? (
										<div
											className={`text-xs text-primary-foreground/90 leading-relaxed ${markdownClass}`}
										>
											<ReactMarkdown>{inspectedItem.playerNotes}</ReactMarkdown>
										</div>
									) : (
										<p className='text-[11px] text-muted-foreground italic'>
											尚無玩家備註。
										</p>
									)}
								</div>

								{/* DM 專屬秘密筆記 */}
								{viewMode === 'dm' && inspectedItem.dmNotes && (
									<div className='bg-muted border border-dm/60 rounded-md p-3'>
										<div className='flex items-center gap-1.5 text-xs font-bold text-dm mb-1'>
											<Eye className='w-3.5 h-3.5' />
											<span>DM 專屬隱藏筆記 (玩家不可見)</span>
										</div>
										<div
											className={`text-xs text-foreground leading-relaxed ${markdownClass}`}
										>
											<ReactMarkdown>{inspectedItem.dmNotes}</ReactMarkdown>
										</div>
									</div>
								)}

								{/* 底部重量與價值資訊 */}
								<div className='flex items-center justify-between pt-3 border-t border-border text-xs text-muted-foreground font-mono'>
									<div>
										單件重量:{' '}
										<span className='text-highlight'>
											{inspectedItem.weight} lb
										</span>
										{inspectedItem.quantity > 1 && (
											<span className='text-highlight'>
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
										<span
											className={`font-semibold ${masked ? 'text-muted-foreground' : 'text-money'}`}
										>
											{masked ? '???' : `${inspectedItem.valueGp} GP`}
										</span>
									</div>
								</div>

								{/* 互動操作按鈕列 */}
								<div className='pt-2 border-t border-border space-y-2'>
									{canEditItemBag ? (
										<>
											<div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
												{!isInCampChest && isEquippable && (
													<Button
														type='button'
														variant='secondary'
														size='sm'
														onClick={() => toggleEquip(inspectedItem)}
													>
														{inspectedItem.equipped ? '卸下裝備' : '穿戴裝備'}
													</Button>
												)}

												{!isInCampChest &&
													inspectedItem.isRequireAttunement && (
														<Button
															type='button'
															variant='secondary'
															size='sm'
															onClick={() => toggleAttune(inspectedItem)}
														>
															{inspectedItem.attuned
																? '解除同調'
																: '✨ 進行同調'}
														</Button>
													)}

												{canManagePrivacy && (
													<Button
														type='button'
														variant='secondary'
														size='sm'
														onClick={() => onMakeItemPublic(inspectedItem)}
														prefixIcon={<Globe2 />}
													>
														<span>公開物品</span>
													</Button>
												)}

												{isConsumable && (
													<Button
														type='button'
														variant='secondary'
														size='sm'
														data-testid='inventory-consume-item'
														onClick={() =>
															consumeOrSplitStack(inspectedItem, 'consume')
														}
													>
														飲用 / 消耗 (-1)
													</Button>
												)}

												{inspectedItem.quantity > 1 && (
													<Button
														type='button'
														variant='secondary'
														size='sm'
														onClick={() =>
															consumeOrSplitStack(inspectedItem, 'split')
														}
														prefixIcon={<Split />}
													>
														<span>拆分堆疊</span>
													</Button>
												)}
											</div>

											{/* 單向移交給隊友或營地儲物箱（只要有來源背包修改權即可移出） */}
											<div className='flex flex-col gap-2 pt-1.5 border-t border-border/70'>
												<div className='flex items-center justify-between gap-2 flex-wrap'>
													<span className='text-[11px] text-muted-foreground flex items-center gap-1'>
														<Send className='w-3 h-3 text-primary-foreground' />
														<span>
															{isInCampChest
																? '從儲物箱領取至：'
																: '單向移交或送往營地：'}
														</span>
													</span>

													{inspectedItem.quantity > 1 && (
														<div className='flex items-center gap-1 bg-background border border-border rounded px-1.5 py-0.5 text-[11px]'>
															<span className='text-muted-foreground mr-1'>
																數量:
															</span>
															<Button
																type='button'
																variant='ghost'
																size='sm'
																onClick={() =>
																	setTransferQty((q) => Math.max(1, q - 1))
																}
															>
																-
															</Button>
															<Input
																aria-label='移交道具數量'
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
																className='w-10 text-center bg-transparent font-mono font-bold outline-none'
															/>
															<Button
																type='button'
																variant='ghost'
																size='sm'
																onClick={() =>
																	setTransferQty((q) =>
																		Math.min(inspectedItem.quantity, q + 1),
																	)
																}
															>
																+
															</Button>
															<Button
																type='button'
																variant='secondary'
																size='sm'
																onClick={() =>
																	setTransferQty(inspectedItem.quantity)
																}
															>
																全部 ({inspectedItem.quantity})
															</Button>
														</div>
													)}
												</div>

												<div className='flex items-center gap-1.5 flex-wrap'>
													{!isInCampChest && (
														<Button
															type='button'
															variant='secondary'
															size='sm'
															disabled={Boolean(inspectedItem.isPrivate)}
															title={
																inspectedItem.isPrivate
																	? '秘密物品必須先公開才能移入營地儲物箱'
																	: undefined
															}
															onClick={() =>
																transferItemToCharacter(
																	inspectedItem,
																	CAMP_CHEST_ID,
																	transferQty,
																)
															}
														>
															🏕️ 送往營地儲物箱
															{inspectedItem.quantity > 1
																? ` (${transferQty})`
																: ''}
														</Button>
													)}
													{!isInCampChest && inspectedItem.isPrivate && (
														<span className='text-[10px] text-private'>
															秘密物品須先公開，才能移入營地儲物箱。
														</span>
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
																<Button
																	key={target.id}
																	type='button'
																	variant='secondary'
																	size='sm'
																	onClick={() =>
																		transferItemToCharacter(
																			inspectedItem,
																			target.id,
																			transferQty,
																		)
																	}
																>
																	<CharacterAvatar
																		avatar={target.avatar}
																		alt={`${target.name}頭像`}
																		className='inline-block h-4 w-4 rounded-full object-cover align-middle'
																	/>{' '}
																	{target.name.split(' ')[0]}
																	{inspectedItem.quantity > 1
																		? ` (${transferQty})`
																		: ''}
																	{isMe && isInCampChest ? ' 領回' : ''}
																</Button>
															);
														})}
												</div>
											</div>
										</>
									) : (
										<div className='py-2 text-xs text-muted-foreground italic flex items-center gap-1.5'>
											<Lock className='w-3.5 h-3.5 text-muted-foreground shrink-0' />
											<span>唯讀檢視：你沒有修改或轉移此背包物品的權限。</span>
										</div>
									)}

									{/* DM 專屬控制列 */}
									{viewMode === 'dm' && (
										<div className='pt-2 mt-2 border-t border-dm/50 flex flex-wrap items-center justify-between gap-2'>
											<div className='flex items-center gap-2'>
												<Button
													type='button'
													variant='secondary-dm'
													size='sm'
													onClick={() => onOpenEditModal(inspectedItem)}
													prefixIcon={<Edit3 />}
												>
													<span>DM 編輯物品</span>
												</Button>
												{!inspectedItem.isIdentified && (
													<Button
														type='button'
														variant='secondary-dm'
														size='sm'
														onClick={() => void toggleIdentify(inspectedItem)}
														prefixIcon={<Eye />}
													>
														<span>向玩家揭露鑑定</span>
													</Button>
												)}
											</div>

											<Button
												type='button'
												variant='destructive'
												size='sm'
												onClick={() => deleteItem(inspectedItem)}
												prefixIcon={<Trash2 />}
											>
												<span>銷毀</span>
											</Button>
										</div>
									)}
								</div>
							</div>
						</div>
					);
				})()
			) : (
				<div className='h-64 rounded-lg border border-border bg-background/70 flex flex-col items-center justify-center text-muted-foreground text-sm p-6 text-center'>
					<Backpack className='w-8 h-8 mb-2 opacity-40' />
					<p>點擊左側背包中的物品，即可檢視詳細規則與風味描述。</p>
				</div>
			)}
		</div>
	);
}
