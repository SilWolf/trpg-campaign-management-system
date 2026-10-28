import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type {
	HomebrewForm,
	ItemAffix,
	ItemBaseCategory,
	ItemBaseRarity,
	WeaponMasteryInfo,
	WeaponMasteryKey,
} from '@/types';
import {
	Sparkles,
	X,
	EyeOff,
	Eye,
	Lock,
	Save,
	Sword,
	FlaskConical,
	Star,
	Plus,
	Trash2,
	ArrowUp,
	ArrowDown,
	Copy,
	ClipboardPaste,
	Wand2,
} from 'lucide-react';
import { Button, Checkbox, Input, Select, Textarea } from '@/components/ui';
import { ITEM_CATEGORY_LABELS } from '@/data';
import ItemIcon from './ItemIcon';
import { ITEM_IMAGE_ICON_PREFIX } from '@/lib/itemIcon';

interface HomebrewModalProps {
	isOpen: boolean;
	isEditing?: boolean;
	form: HomebrewForm;
	setForm: Dispatch<SetStateAction<HomebrewForm>>;
	onSubmit: (e: FormEvent<HTMLFormElement>) => void;
	characterName: string;
	onClose: () => void;
	weaponMasteries: Record<WeaponMasteryKey, WeaponMasteryInfo>;
	copiedAffix: ItemAffix | null;
	onCopyAffix: (affix: ItemAffix) => void;
}

const ICON_OPTIONS = [
	'Sword',
	'Shield',
	'FlaskConical',
	'Scroll',
	'Gem',
	'Ring',
	'Wand',
	'Skull',
	'BookOpen',
	'Key',
];

export default function HomebrewModal({
	isOpen,
	isEditing = false,
	form,
	setForm,
	onSubmit,
	characterName,
	onClose,
	weaponMasteries,
	copiedAffix,
	onCopyAffix,
}: HomebrewModalProps) {
	if (!isOpen) return null;
	const affixes = form.affixes || [];
	const isImageIcon = form.icon.startsWith(ITEM_IMAGE_ICON_PREFIX);
	const imageUrl = isImageIcon
		? form.icon.slice(ITEM_IMAGE_ICON_PREFIX.length)
		: '';

	// 新增空白詞條
	const addEmptyAffix = () => {
		const newAffix: ItemAffix = {
			id: `affix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			name: '',
			desc: '',
			isHidden: false,
		};
		setForm({ ...form, affixes: [...affixes, newAffix] });
	};

	// 貼上剪貼簿內的詞條
	const pasteAffixToForm = () => {
		if (!copiedAffix) return;
		const cloned: ItemAffix = {
			...copiedAffix,
			id: `affix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		};
		setForm({ ...form, affixes: [...affixes, cloned] });
	};

	// 更新指定詞條欄位
	const updateAffixField = (index: number, patch: Partial<ItemAffix>) => {
		const next = affixes.map((a, idx) =>
			idx === index ? { ...a, ...patch } : a,
		);
		setForm({ ...form, affixes: next });
	};

	// 上下移動詞條順序
	const moveAffixInForm = (index: number, dir: -1 | 1) => {
		const targetIdx = index + dir;
		if (targetIdx < 0 || targetIdx >= affixes.length) return;
		const next = [...affixes];
		[next[index], next[targetIdx]] = [next[targetIdx], next[index]];
		setForm({ ...form, affixes: next });
	};

	// 刪除詞條
	const removeAffixFromForm = (index: number) => {
		setForm({
			...form,
			affixes: affixes.filter((_, idx) => idx !== index),
		});
	};

	// 計算目前勾選狀態會歸類到哪一區
	const previewSection = form.isImportant
		? '🌟 重要物品 (Key Items)'
		: form.isEquippable
			? '⚔️ 裝備 (Equipment)'
			: form.isConsumable
				? '🧪 消耗品 (Consumables)'
				: '📦 雜物 (Miscellaneous)';

	return (
		<div className='fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
			<div className='bg-background border-2 border-border/60 rounded-lg max-w-2xl w-full p-5 shadow-lg my-8'>
				<div className='flex items-center justify-between border-b border-border pb-3 mb-4'>
					<div className='flex items-center gap-2'>
						<Sparkles className='w-5 h-5 text-muted-foreground' />
						<h2 className='text-base sm:text-lg font-serif font-bold text-foreground'>
							{isEditing
								? `DM 編輯物品內容 (${characterName})`
								: `DM 自創道具鍛造工坊 (發放至：${characterName})`}
						</h2>
					</div>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						aria-label='關閉自創道具編輯'
						onClick={onClose}
						className='text-muted-foreground hover:text-foreground cursor-pointer'
						prefixIcon={<X className='w-5 h-5' />}
					>
					</Button>
				</div>

				<form onSubmit={onSubmit} className='space-y-3.5 text-xs'>
					<div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
						<div className='sm:col-span-2'>
							<label className='block text-muted-foreground mb-1'>
								道具名稱 *
							</label>
							<Input
								aria-label='道具名稱'
								required
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
								placeholder='例如：深淵凝視魔戒'
								data-testid='homebrew-item-name'
								className='w-full bg-card border border-border rounded px-3 py-1.5 text-foreground focus:border-border outline-none'
							/>
						</div>
						<div>
							<label className='block text-muted-foreground mb-1'>
								BG3 稀有度光框
							</label>
							<Select
								aria-label='BG3 稀有度光框'
								value={form.rarity}
								onChange={(e) =>
									setForm({ ...form, rarity: e.target.value as ItemBaseRarity })
								}
								className='w-full bg-card border border-border rounded px-2.5 py-1.5 text-foreground outline-none'
							>
								<option value='Common'>普通 (Common - 無框)</option>
								<option value='Uncommon'>非普通 (Uncommon - 綠)</option>
								<option value='Rare'>稀有 (Rare - 藍)</option>
								<option value='VeryRare'>極珍稀 (Very Rare - 紫)</option>
								<option value='Legendary'>傳奇 (Legendary - 金)</option>
								<option value='Artifact'>神器 (Artifact - 橘紅)</option>
							</Select>
						</div>
					</div>

					{/* ========================================== */}
					{/* 新增：三大屬性判斷開關（決定背包分類）     */}
					{/* ========================================== */}
					<div className='p-3 rounded-md bg-card/90 border border-primary/50 space-y-2'>
						<div className='flex items-center justify-between'>
							<span className='font-semibold'>📂 背包自動歸類設定</span>
							<span className='text-[11px] px-2 py-0.5 rounded bg-background border border-primary/50'>
								將歸類至：<strong>{previewSection}</strong>
							</span>
						</div>
						<div className='grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1'>
							<Checkbox
								label={
									<div className='flex items-center gap-x-1.5'>
										<Sword className='w-3.5 h-3.5 shrink-0' />
										<span>可否裝備？</span>
									</div>
								}
								checked={form.isEquippable}
								onChange={(e) =>
									setForm({ ...form, isEquippable: e.target.checked })
								}
								labelClassName={`flex items-center gap-2 p-2 rounded border cursor-pointer`}
							/>

							<Checkbox
								label={
									<div className='flex items-center gap-x-1.5'>
										<FlaskConical className='w-3.5 h-3.5 text-muted-foreground shrink-0' />
										<span>可否消耗？</span>
									</div>
								}
								checked={form.isConsumable}
								onChange={(e) =>
									setForm({ ...form, isConsumable: e.target.checked })
								}
								labelClassName='flex items-center gap-2 p-2 rounded border cursor-pointer'
							/>

							<Checkbox
								label={
									<div className='flex items-center gap-x-1.5'>
										<Star className='w-3.5 h-3.5 text-muted-foreground shrink-0' />
										<span>是否重要物品？</span>
									</div>
								}
								checked={form.isImportant}
								onChange={(e) =>
									setForm({ ...form, isImportant: e.target.checked })
								}
								labelClassName='flex items-center gap-2 p-2 rounded border cursor-pointer'
							/>
						</div>
					</div>

					<div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
						<div>
							<label className='block text-muted-foreground mb-1'>
								規則子分類
							</label>
							<Select
								aria-label='規則子分類'
								value={form.category}
								onChange={(e) => {
									const nextCat = e.target.value as ItemBaseCategory;
									setForm({
										...form,
										category: nextCat,
										isEquippable:
											nextCat === 'Weapon' || nextCat === 'Armor'
												? true
												: form.isEquippable,
										isConsumable: [
											'Potion',
											'Poison',
											'Scroll',
											'FoodAndDrink',
										].includes(nextCat)
											? true
											: form.isConsumable,
									});
								}}
							>
								{Object.entries(ITEM_CATEGORY_LABELS).map(
									([category, label]) => (
										<option key={category} value={category}>
											{label} ({category})
										</option>
									),
								)}
							</Select>
						</div>
						<div className='sm:col-span-3'>
							<label className='block text-muted-foreground mb-1'>
								子類型描述
							</label>
							<Input
								aria-label='子類型描述'
								value={form.subTypes.join('、')}
								onChange={(e) =>
									setForm({
										...form,
										subTypes: e.target.value
											.split(/[、,，]/)
											.map((part) => part.trim())
											.filter(Boolean),
									})
								}
								placeholder='如：長劍、奇物、戒指'
							/>
						</div>

						<div className='sm:col-span-4'>
							{/* 武器或護甲專屬欄位 */}
							{form.category === 'Weapon' && (
								<div className='grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 rounded bg-card/60 border border-border'>
									<div>
										<label className='block mb-1'>武器傷害骰與屬性</label>
										<Input
											aria-label='武器傷害骰與屬性'
											value={form.weaponProperties.damage}
											onChange={(e) =>
												setForm({
													...form,
													weaponProperties: {
														...form.weaponProperties,
														damage: e.target.value,
													},
												})
											}
											placeholder='例如：2d6+3 揮砍 + 1d4 黯蝕'
											className='w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground outline-none'
										/>
									</div>
									<div>
										<label className='block mb-1'>
											D&amp;D 5R 武器精通 (Weapon Mastery)
										</label>
										<Select
											aria-label='D&D 5R 武器精通'
											value={form.weaponProperties.mastery}
											onChange={(e) =>
												setForm({
													...form,
													weaponProperties: {
														...form.weaponProperties,
														mastery: e.target
															.value as HomebrewForm['weaponProperties']['mastery'],
													},
												})
											}
											className='w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground outline-none'
										>
											<option value=''>無</option>
											{Object.entries(weaponMasteries)
												.filter(([key]) => key !== 'None')
												.map(([k, v]) => (
													<option key={k} value={k}>
														{v.name}
													</option>
												))}
										</Select>
									</div>
								</div>
							)}

							{form.category === 'Armor' && (
								<div className='p-2.5 rounded bg-card/60 border border-border'>
									<label className='block text-foreground mb-1'>
										護甲等級 (AC) 描述
									</label>
									<Input
										aria-label='護甲等級描述'
										value={form.armorProperties.ac}
										onChange={(e) =>
											setForm({
												...form,
												armorProperties: {
													ac: e.target.value,
												},
											})
										}
										placeholder='例如：18 (重甲，不加敏捷)'
										className='w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground outline-none'
									/>
								</div>
							)}
						</div>

						<div className='sm:col-span-3'>
							<label className='block text-muted-foreground mb-1'>
								物品圖示
							</label>
							<Select
								aria-label='物品圖示來源'
								value={isImageIcon ? 'image' : 'icon'}
								onChange={(e) =>
									setForm({
										...form,
										icon:
											e.target.value === 'image'
												? `${ITEM_IMAGE_ICON_PREFIX}${imageUrl}`
												: isImageIcon
													? 'Sword'
													: form.icon,
									})
								}
								className='w-full bg-card border border-border rounded px-2.5 py-1.5 text-foreground outline-none'
							>
								<option value='icon'>使用 Lucide 圖示</option>
								<option value='image'>使用圖片網址</option>
							</Select>
							{isImageIcon ? (
								<div className='mt-2 flex items-center gap-3'>
									<Input
										aria-label='物品圖片網址'
										type='url'
										required
										value={imageUrl}
										onChange={(e) =>
											setForm({
												...form,
												icon: `${ITEM_IMAGE_ICON_PREFIX}${e.target.value}`,
											})
										}
										placeholder='https://example.com/item-image'
										className='min-w-0 flex-1 bg-card border border-border rounded px-3 py-1.5 text-foreground outline-none'
									/>
									<div className='relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-background'>
										<ItemIcon
											iconName={form.icon}
											className='h-full w-full text-muted-foreground'
										/>
									</div>
								</div>
							) : (
								<Select
									aria-label='Lucide 圖示樣式'
									value={form.icon}
									onChange={(e) => setForm({ ...form, icon: e.target.value })}
									className='mt-2 w-full bg-card border border-border rounded px-2.5 py-1.5 text-foreground outline-none'
								>
									{ICON_OPTIONS.map((ic) => (
										<option key={ic} value={ic}>
											{ic}
										</option>
									))}
								</Select>
							)}
							<p className='mt-1 text-[10px] text-muted-foreground'>
								圖片網址須使用 HTTPS，建議使用正方形圖片。
							</p>
						</div>
						<div>
							<label className='block text-muted-foreground mb-1'>
								每日充能上限
							</label>
							<Input
								aria-label='每日充能上限'
								type='number'
								min='0'
								value={form.maxCharges}
								onChange={(e) =>
									setForm({ ...form, maxCharges: e.target.value })
								}
								className='w-full bg-card border border-border rounded px-2.5 py-1.5 text-foreground outline-none'
							/>
						</div>
					</div>

					{/* 規則描述與風味文字 (支援 Markdown) */}
					<div>
						<label className='block text-muted-foreground mb-1'>
							物品效果與規則描述 (支援 Markdown 語法：`**粗體**`、`-
							清單`、`&gt; 引用`)
						</label>
						<Textarea
							aria-label='物品效果與規則描述'
							rows={4}
							value={form.effects}
							onChange={(e) => setForm({ ...form, effects: e.target.value })}
							placeholder='例如：&#10;- **暗影步**：消耗 1 點充能，以附贈動作傳送至 30 呎內的陰影處。'
							className='w-full bg-card border border-border rounded px-3 py-1.5 text-foreground font-mono outline-none'
						/>
					</div>

					{/* ========================================== */}
					{/* 新增：附魔詞條 (Affixes) 動態編輯器          */}
					{/* ========================================== */}
					<div className='p-3 rounded-md bg-card/90 border border-border/50 space-y-2.5'>
						<div className='flex flex-wrap items-center justify-between gap-2'>
							<span className='text-foreground font-semibold flex items-center gap-1.5'>
								<Wand2 className='w-3.5 h-3.5 text-muted-foreground' />
								<span>附魔詞條 (Affixes) — 同名物品可擁有不同詞條</span>
							</span>

							<div className='flex items-center gap-1.5'>
								{copiedAffix && (
									<Button
										type='button'
										variant='secondary'
										size='sm'
										onClick={pasteAffixToForm}
										className='px-2 py-1 rounded bg-background hover:bg-card border border-border/70 text-foreground flex items-center gap-1 cursor-pointer transition'
										prefixIcon={<ClipboardPaste className='w-3 h-3' />}
									>
										<span>貼上「{copiedAffix.name}」</span>
									</Button>
								)}
								<Button
									type='button'
									variant='secondary'
									size='sm'
									onClick={addEmptyAffix}
									prefixIcon={<Plus className='w-3 h-3' />}
								>
									<span>新增詞條</span>
								</Button>
							</div>
						</div>

						{affixes.length === 0 ? (
							<div className='text-[11px] text-muted-foreground italic py-2 text-center border border-dashed border-border rounded'>
								尚未附加任何詞條。點擊右上角「新增詞條」或從其他物品複製貼上。
							</div>
						) : (
							<div className='space-y-2.5 max-h-60 overflow-y-auto pr-1'>
								{affixes.map((affix, idx) => (
									<div
										key={affix.id}
										className={`p-2.5 rounded border space-y-2 ${
											affix.isHidden
												? 'bg-muted border-border'
												: 'bg-background border-border'
										}`}
									>
										<div className='flex items-center justify-between gap-2'>
											<div className='flex items-center gap-1.5 flex-1'>
												<span className='text-[10px] font-mono text-muted-foreground shrink-0'>
													#{idx + 1}
												</span>
												<Input
													aria-label={`附魔詞條 ${idx + 1} 名稱`}
													required
													value={affix.name}
													onChange={(e) =>
														updateAffixField(idx, { name: e.target.value })
													}
													placeholder='詞條名稱（如：熾焰附魔、嗜血詛咒）'
												/>
											</div>

											{/* 詞條工具列：排序、對玩家隱藏、複製、刪除 */}
											<div className='flex items-center gap-1 shrink-0'>
												<Button
													type='button'
													variant='ghost'
													size='sm'
													onClick={() => moveAffixInForm(idx, -1)}
													disabled={idx === 0}
													title='上移'
													prefixIcon={<ArrowUp className='w-3.5 h-3.5' />}
												>
												</Button>
												<Button
													type='button'
													variant='ghost'
													size='sm'
													onClick={() => moveAffixInForm(idx, 1)}
													disabled={idx === affixes.length - 1}
													title='下移'
													prefixIcon={<ArrowDown className='w-3.5 h-3.5' />}
												>
												</Button>

												<Button
													type='button'
													variant='ghost'
													size='sm'
													onClick={() =>
														updateAffixField(idx, { isHidden: !affix.isHidden })
													}
													title={
														affix.isHidden
															? '目前對玩家隱藏（點擊改為公開）'
															: '目前對玩家公開（點擊設為隱藏）'
													}
													prefixIcon={
														affix.isHidden ? (
															<EyeOff className='w-3 h-3 text-muted-foreground' />
														) : (
															<Eye className='w-3 h-3' />
														)
													}
												>
													{affix.isHidden ? (
														<span>隱藏中</span>
													) : (
														<span>公開</span>
													)}
												</Button>

												<Button
													type='button'
													variant='ghost'
													size='sm'
													onClick={() => {
														if (affix.name.trim()) onCopyAffix(affix);
													}}
													title='複製此詞條'
													prefixIcon={<Copy className='w-3.5 h-3.5' />}
												>
												</Button>

												<Button
													type='button'
													variant='danger'
													size='sm'
													onClick={() => removeAffixFromForm(idx)}
													title='刪除此詞條'
													prefixIcon={<Trash2 className='w-3.5 h-3.5' />}
												>
												</Button>
											</div>
										</div>

										<Textarea
											aria-label={`附魔詞條 ${idx + 1} 描述`}
											rows={2}
											value={affix.desc}
											onChange={(e) =>
												updateAffixField(idx, { desc: e.target.value })
											}
											placeholder='詞條描述（支援 Markdown，如：命中時額外造成 **1d6 火焰** 傷害）'
										/>
									</div>
								))}
							</div>
						)}
					</div>

					<div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
						<div>
							<label className='block text-muted-foreground mb-1'>
								背景風味文字 (支援 Markdown)
							</label>
							<Textarea
								aria-label='背景風味文字'
								rows={2}
								value={form.flavor}
								onChange={(e) => setForm({ ...form, flavor: e.target.value })}
								placeholder='「戒環內側刻著早已被遺忘的古精靈語...」'
							/>
						</div>
						<div>
							<label className='block text-foreground mb-1'>
								🔒 DM 隱藏筆記 (支援 Markdown，僅 DM 可見)
							</label>
							<Textarea
								aria-label='DM 隱藏筆記'
								rows={2}
								value={form.dmNotes}
								onChange={(e) => setForm({ ...form, dmNotes: e.target.value })}
								placeholder='記錄隱藏詛咒、劇情觸發條件或真實來歷...'
							/>
						</div>
					</div>

					{/* 重量、價值、數量 */}
					<div className='grid grid-cols-3 gap-3'>
						<div>
							<label className='block text-muted-foreground mb-1'>
								單件重量 (lb)
							</label>
							<Input
								aria-label='單件重量'
								type='number'
								step='0.1'
								value={form.weight}
								onChange={(e) => setForm({ ...form, weight: e.target.value })}
								className='w-full bg-card border border-border rounded px-2.5 py-1.5 text-foreground outline-none'
							/>
						</div>
						<div>
							<label className='block text-muted-foreground mb-1'>
								單件價值 (GP)
							</label>
							<Input
								aria-label='單件價值'
								type='number'
								value={form.valueGp}
								onChange={(e) => setForm({ ...form, valueGp: e.target.value })}
								className='w-full bg-card border border-border rounded px-2.5 py-1.5 text-foreground outline-none'
							/>
						</div>
						<div>
							<label className='block text-muted-foreground mb-1'>
								堆疊數量
							</label>
							<Input
								aria-label='堆疊數量'
								type='number'
								min='1'
								value={form.quantity}
								onChange={(e) => setForm({ ...form, quantity: e.target.value })}
								className='w-full bg-card border border-border rounded px-2.5 py-1.5 text-foreground outline-none'
							/>
						</div>
					</div>

					{/* 同調、未鑑定與私人背包開關 */}
					<div className='flex flex-wrap items-center gap-5 pt-1'>
						<Checkbox
							label='需同調 (Requires Attunement)'
							checked={form.isRequireAttunement}
							onChange={(e) =>
								setForm({ ...form, isRequireAttunement: e.target.checked })
							}
						/>

						<Checkbox
							label={
								<div className='flex items-center gap-x-1.5'>
									<EyeOff className='w-3.5 h-3.5' />
									<span>設為「未鑑定狀態」(對玩家隱藏屬性)</span>
								</div>
							}
							checked={!form.isIdentified}
							onChange={(e) =>
								setForm({ ...form, isIdentified: !e.target.checked })
							}
						/>

						<Checkbox
							label={
								<div className='flex items-center gap-x-1.5'>
									<Lock className='w-3.5 h-3.5' />
									<span>放入該角色的「私人暗袋」(其他玩家不可見)</span>
								</div>
							}
							checked={Boolean(form.isPrivate)}
							onChange={(e) =>
								setForm({ ...form, isPrivate: e.target.checked })
							}
						/>
					</div>

					<div className='flex justify-end gap-2 pt-3 border-t border-border'>
						<Button
							type='button'
							variant='secondary'
							onClick={onClose}
							className='px-4 py-2 rounded bg-card border border-border text-foreground hover:bg-muted cursor-pointer'
						>
							取消
						</Button>
						<Button
							type='submit'
							variant='primary'
							prefixIcon={
								isEditing ? (
									<Save className='w-4 h-4' />
								) : (
									<Sparkles className='w-4 h-4' />
								)
							}
						>
							{isEditing ? (
								<span>儲存物品修改</span>
							) : (
								<span>鑄造並放入背包</span>
							)}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
