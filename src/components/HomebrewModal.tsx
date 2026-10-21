import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type {
	HomebrewForm,
	ItemAffix,
	ItemCategory,
	Rarity,
	WeaponMasteryInfo,
	WeaponMasteryKey,
} from '../types';
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
		<div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
			<div className='bg-stone-950 border-2 border-purple-500/60 rounded-lg max-w-2xl w-full p-5 shadow-[0_0_50px_rgba(168,85,247,0.3)] my-8'>
				<div className='flex items-center justify-between border-b border-stone-800 pb-3 mb-4'>
					<div className='flex items-center gap-2'>
						<Sparkles className='w-5 h-5 text-purple-400' />
						<h2 className='text-base sm:text-lg font-serif font-bold text-purple-200'>
							{isEditing
								? `DM 編輯物品內容 (${characterName})`
								: `DM 自創道具鍛造工坊 (發放至：${characterName})`}
						</h2>
					</div>
					<button
						onClick={onClose}
						className='text-stone-400 hover:text-stone-200 cursor-pointer'
					>
						<X className='w-5 h-5' />
					</button>
				</div>

				<form onSubmit={onSubmit} className='space-y-3.5 text-xs'>
					<div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
						<div className='sm:col-span-2'>
							<label className='block text-stone-400 mb-1'>道具名稱 *</label>
							<input
								type='text'
								required
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
								placeholder='例如：深淵凝視魔戒'
								className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100 focus:border-purple-400 outline-none'
							/>
						</div>
						<div>
							<label className='block text-stone-400 mb-1'>
								BG3 稀有度光框
							</label>
							<select
								value={form.rarity}
								onChange={(e) =>
									setForm({ ...form, rarity: e.target.value as Rarity })
								}
								className='w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
							>
								<option value='Common'>普通 (Common - 無框)</option>
								<option value='Uncommon'>非普通 (Uncommon - 綠)</option>
								<option value='Rare'>稀有 (Rare - 藍)</option>
								<option value='VeryRare'>極珍稀 (Very Rare - 紫)</option>
								<option value='Legendary'>傳奇 (Legendary - 金)</option>
								<option value='Artifact'>神器 (Artifact - 橘紅)</option>
							</select>
						</div>
					</div>

					{/* ========================================== */}
					{/* 新增：三大屬性判斷開關（決定背包分類）     */}
					{/* ========================================== */}
					<div className='p-3 rounded-md bg-stone-900/90 border border-amber-700/50 space-y-2'>
						<div className='flex items-center justify-between'>
							<span className='text-amber-300 font-semibold'>
								📂 背包自動歸類設定
							</span>
							<span className='text-[11px] px-2 py-0.5 rounded bg-stone-950 border border-amber-600/50 text-amber-200'>
								將歸類至：<strong>{previewSection}</strong>
							</span>
						</div>
						<div className='grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1'>
							<label
								className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition ${
									form.isEquippable
										? 'bg-amber-950/50 border-amber-500/70 text-amber-100'
										: 'bg-stone-950 border-stone-800 text-stone-400'
								}`}
							>
								<input
									type='checkbox'
									checked={form.isEquippable}
									onChange={(e) =>
										setForm({ ...form, isEquippable: e.target.checked })
									}
									className='accent-amber-500'
								/>
								<Sword className='w-3.5 h-3.5 text-amber-400 shrink-0' />
								<span>可否裝備？</span>
							</label>

							<label
								className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition ${
									form.isConsumable
										? 'bg-emerald-950/50 border-emerald-500/70 text-emerald-100'
										: 'bg-stone-950 border-stone-800 text-stone-400'
								}`}
							>
								<input
									type='checkbox'
									checked={form.isConsumable}
									onChange={(e) =>
										setForm({ ...form, isConsumable: e.target.checked })
									}
									className='accent-emerald-500'
								/>
								<FlaskConical className='w-3.5 h-3.5 text-emerald-400 shrink-0' />
								<span>可否消耗？</span>
							</label>

							<label
								className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition ${
									form.isImportant
										? 'bg-purple-950/50 border-purple-500/70 text-purple-100'
										: 'bg-stone-950 border-stone-800 text-stone-400'
								}`}
							>
								<input
									type='checkbox'
									checked={form.isImportant}
									onChange={(e) =>
										setForm({ ...form, isImportant: e.target.checked })
									}
									className='accent-purple-500'
								/>
								<Star className='w-3.5 h-3.5 text-purple-400 shrink-0' />
								<span>是否重要物品？</span>
							</label>
						</div>
					</div>

					<div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
						<div>
							<label className='block text-stone-400 mb-1'>規則子分類</label>
							<select
								value={form.category}
								onChange={(e) => {
									const nextCat = e.target.value as ItemCategory;
									setForm({
										...form,
										category: nextCat,
										isEquippable:
											nextCat === 'Weapon' || nextCat === 'Armor'
												? true
												: form.isEquippable,
										isConsumable:
											nextCat === 'Consumable' ? true : form.isConsumable,
									});
								}}
								className='w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
							>
								<option value='Weapon'>武器 (Weapon)</option>
								<option value='Armor'>護甲 (Armor)</option>
								<option value='Consumable'>消耗品 (Consumable)</option>
								<option value='Misc'>奇物/雜物 (Misc)</option>
							</select>
						</div>
						<div>
							<label className='block text-stone-400 mb-1'>子類型描述</label>
							<input
								type='text'
								value={form.subType}
								onChange={(e) => setForm({ ...form, subType: e.target.value })}
								placeholder='如：長劍、奇物、戒指'
								className='w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
							/>
						</div>
						<div>
							<label className='block text-stone-400 mb-1'>圖示樣式</label>
							<select
								value={form.icon}
								onChange={(e) => setForm({ ...form, icon: e.target.value })}
								className='w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
							>
								{ICON_OPTIONS.map((ic) => (
									<option key={ic} value={ic}>
										{ic}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className='block text-stone-400 mb-1'>每日充能上限</label>
							<input
								type='number'
								min='0'
								value={form.maxCharges}
								onChange={(e) =>
									setForm({ ...form, maxCharges: e.target.value })
								}
								className='w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
							/>
						</div>
					</div>

					{/* 武器或護甲專屬欄位 */}
					{form.category === 'Weapon' && (
						<div className='grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 rounded bg-stone-900/60 border border-stone-800'>
							<div>
								<label className='block text-amber-300/90 mb-1'>
									武器傷害骰與屬性
								</label>
								<input
									type='text'
									value={form.damage}
									onChange={(e) => setForm({ ...form, damage: e.target.value })}
									placeholder='例如：2d6+3 揮砍 + 1d4 黯蝕'
									className='w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
								/>
							</div>
							<div>
								<label className='block text-amber-300/90 mb-1'>
									D&amp;D 5R 武器精通 (Weapon Mastery)
								</label>
								<select
									value={form.mastery}
									onChange={(e) =>
										setForm({
											...form,
											mastery: e.target.value as WeaponMasteryKey,
										})
									}
									className='w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
								>
									{Object.entries(weaponMasteries).map(([k, v]) => (
										<option key={k} value={k}>
											{v.name}
										</option>
									))}
								</select>
							</div>
						</div>
					)}

					{form.category === 'Armor' && (
						<div className='p-2.5 rounded bg-stone-900/60 border border-stone-800'>
							<label className='block text-sky-300 mb-1'>
								護甲等級 (AC) 描述
							</label>
							<input
								type='text'
								value={form.ac}
								onChange={(e) => setForm({ ...form, ac: e.target.value })}
								placeholder='例如：18 (重甲，不加敏捷)'
								className='w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
							/>
						</div>
					)}

					{/* 重量、價值、數量 */}
					<div className='grid grid-cols-3 gap-3'>
						<div>
							<label className='block text-stone-400 mb-1'>單件重量 (lb)</label>
							<input
								type='number'
								step='0.1'
								value={form.weight}
								onChange={(e) => setForm({ ...form, weight: e.target.value })}
								className='w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
							/>
						</div>
						<div>
							<label className='block text-stone-400 mb-1'>單件價值 (GP)</label>
							<input
								type='number'
								value={form.valueGp}
								onChange={(e) => setForm({ ...form, valueGp: e.target.value })}
								className='w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
							/>
						</div>
						<div>
							<label className='block text-stone-400 mb-1'>堆疊數量</label>
							<input
								type='number'
								min='1'
								value={form.quantity}
								onChange={(e) => setForm({ ...form, quantity: e.target.value })}
								className='w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none'
							/>
						</div>
					</div>

					{/* 規則描述與風味文字 (支援 Markdown) */}
					<div>
						<label className='block text-stone-400 mb-1'>
							物品效果與規則描述 (支援 Markdown 語法：`**粗體**`、`-
							清單`、`&gt; 引用`)
						</label>
						<textarea
							rows={4}
							value={form.effects}
							onChange={(e) => setForm({ ...form, effects: e.target.value })}
							placeholder='例如：&#10;- **暗影步**：消耗 1 點充能，以附贈動作傳送至 30 呎內的陰影處。'
							className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100 font-mono outline-none'
						/>
					</div>

					{/* ========================================== */}
					{/* 新增：附魔詞條 (Affixes) 動態編輯器          */}
					{/* ========================================== */}
					<div className='p-3 rounded-md bg-stone-900/90 border border-purple-700/50 space-y-2.5'>
						<div className='flex flex-wrap items-center justify-between gap-2'>
							<span className='text-purple-300 font-semibold flex items-center gap-1.5'>
								<Wand2 className='w-3.5 h-3.5 text-purple-400' />
								<span>附魔詞條 (Affixes) — 同名物品可擁有不同詞條</span>
							</span>

							<div className='flex items-center gap-1.5'>
								{copiedAffix && (
									<button
										type='button'
										onClick={pasteAffixToForm}
										className='px-2 py-1 rounded bg-purple-950 hover:bg-purple-900 border border-purple-500/70 text-purple-200 flex items-center gap-1 cursor-pointer transition'
									>
										<ClipboardPaste className='w-3 h-3' />
										<span>貼上「{copiedAffix.name}」</span>
									</button>
								)}
								<button
									type='button'
									onClick={addEmptyAffix}
									className='px-2.5 py-1 rounded bg-amber-950/90 hover:bg-amber-900 border border-amber-500/70 text-amber-200 flex items-center gap-1 cursor-pointer transition'
								>
									<Plus className='w-3 h-3' />
									<span>新增詞條</span>
								</button>
							</div>
						</div>

						{affixes.length === 0 ? (
							<div className='text-[11px] text-stone-500 italic py-2 text-center border border-dashed border-stone-800 rounded'>
								尚未附加任何詞條。點擊右上角「新增詞條」或從其他物品複製貼上。
							</div>
						) : (
							<div className='space-y-2.5 max-h-60 overflow-y-auto pr-1'>
								{affixes.map((affix, idx) => (
									<div
										key={affix.id}
										className={`p-2.5 rounded border space-y-2 ${
											affix.isHidden
												? 'bg-red-950/20 border-red-800/50'
												: 'bg-stone-950 border-stone-800'
										}`}
									>
										<div className='flex items-center justify-between gap-2'>
											<div className='flex items-center gap-1.5 flex-1'>
												<span className='text-[10px] font-mono text-stone-500 shrink-0'>
													#{idx + 1}
												</span>
												<input
													type='text'
													required
													value={affix.name}
													onChange={(e) =>
														updateAffixField(idx, { name: e.target.value })
													}
													placeholder='詞條名稱（如：熾焰附魔、嗜血詛咒）'
													className='w-full bg-stone-900 border border-stone-700 focus:border-amber-500 rounded px-2 py-1 text-xs text-amber-200 font-semibold outline-none'
												/>
											</div>

											{/* 詞條工具列：排序、對玩家隱藏、複製、刪除 */}
											<div className='flex items-center gap-1 shrink-0'>
												<button
													type='button'
													onClick={() => moveAffixInForm(idx, -1)}
													disabled={idx === 0}
													title='上移'
													className='p-1 rounded bg-stone-900 hover:bg-stone-800 disabled:opacity-30 text-stone-400 hover:text-stone-200 cursor-pointer'
												>
													<ArrowUp className='w-3.5 h-3.5' />
												</button>
												<button
													type='button'
													onClick={() => moveAffixInForm(idx, 1)}
													disabled={idx === affixes.length - 1}
													title='下移'
													className='p-1 rounded bg-stone-900 hover:bg-stone-800 disabled:opacity-30 text-stone-400 hover:text-stone-200 cursor-pointer'
												>
													<ArrowDown className='w-3.5 h-3.5' />
												</button>

												<button
													type='button'
													onClick={() =>
														updateAffixField(idx, { isHidden: !affix.isHidden })
													}
													title={
														affix.isHidden
															? '目前對玩家隱藏（點擊改為公開）'
															: '目前對玩家公開（點擊設為隱藏）'
													}
													className={`px-1.5 py-1 rounded border flex items-center gap-1 text-[10px] cursor-pointer ${
														affix.isHidden
															? 'bg-red-950/80 border-red-500/60 text-red-200'
															: 'bg-stone-900 border-stone-700 text-stone-400 hover:text-stone-200'
													}`}
												>
													{affix.isHidden ? (
														<>
															<EyeOff className='w-3 h-3 text-red-400' />
															<span>隱藏中</span>
														</>
													) : (
														<>
															<Eye className='w-3 h-3' />
															<span>公開</span>
														</>
													)}
												</button>

												<button
													type='button'
													onClick={() => {
														if (affix.name.trim()) onCopyAffix(affix);
													}}
													title='複製此詞條'
													className='p-1 rounded bg-stone-900 hover:bg-amber-950 border border-stone-700 text-stone-300 hover:text-amber-200 cursor-pointer'
												>
													<Copy className='w-3.5 h-3.5' />
												</button>

												<button
													type='button'
													onClick={() => removeAffixFromForm(idx)}
													title='刪除此詞條'
													className='p-1 rounded bg-red-950/60 hover:bg-red-900 border border-red-800/60 text-red-300 cursor-pointer'
												>
													<Trash2 className='w-3.5 h-3.5' />
												</button>
											</div>
										</div>

										<textarea
											rows={2}
											value={affix.desc}
											onChange={(e) =>
												updateAffixField(idx, { desc: e.target.value })
											}
											placeholder='詞條描述（支援 Markdown，如：命中時額外造成 **1d6 火焰** 傷害）'
											className='w-full bg-stone-900 border border-stone-700 focus:border-amber-500 rounded px-2.5 py-1 text-xs text-stone-200 font-mono outline-none'
										/>
									</div>
								))}
							</div>
						)}
					</div>

					<div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
						<div>
							<label className='block text-stone-400 mb-1'>
								背景風味文字 (支援 Markdown)
							</label>
							<textarea
								rows={2}
								value={form.flavor}
								onChange={(e) => setForm({ ...form, flavor: e.target.value })}
								placeholder='「戒環內側刻著早已被遺忘的古精靈語...」'
								className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100 outline-none'
							/>
						</div>
						<div>
							<label className='block text-red-400 mb-1'>
								🔒 DM 隱藏筆記 / 詛咒真相 (支援 Markdown，僅 DM 可見)
							</label>
							<textarea
								rows={2}
								value={form.dmNotes}
								onChange={(e) => setForm({ ...form, dmNotes: e.target.value })}
								placeholder='記錄隱藏詛咒、劇情觸發條件或真實來歷...'
								className='w-full bg-red-950/30 border border-red-800/60 rounded px-3 py-1.5 text-red-100 outline-none'
							/>
						</div>
					</div>

					{/* 同調、未鑑定與私人背包開關 */}
					<div className='flex flex-wrap items-center gap-5 pt-1'>
						<label className='flex items-center gap-2 cursor-pointer text-stone-200'>
							<input
								type='checkbox'
								checked={form.requiresAttunement}
								onChange={(e) =>
									setForm({ ...form, requiresAttunement: e.target.checked })
								}
								className='accent-amber-500'
							/>
							<span>需同調 (Requires Attunement)</span>
						</label>

						<label className='flex items-center gap-2 cursor-pointer text-purple-300'>
							<input
								type='checkbox'
								checked={!form.isIdentified}
								onChange={(e) =>
									setForm({ ...form, isIdentified: !e.target.checked })
								}
								className='accent-purple-500'
							/>
							<EyeOff className='w-3.5 h-3.5' />
							<span>設為「未鑑定狀態」(對玩家隱藏屬性)</span>
						</label>

						<label className='flex items-center gap-2 cursor-pointer text-emerald-300'>
							<input
								type='checkbox'
								checked={Boolean(form.isPrivate)}
								onChange={(e) =>
									setForm({ ...form, isPrivate: e.target.checked })
								}
								className='accent-emerald-500'
							/>
							<Lock className='w-3.5 h-3.5' />
							<span>放入該角色的「私人暗袋」(其他玩家不可見)</span>
						</label>
					</div>

					<div className='flex justify-end gap-2 pt-3 border-t border-stone-800'>
						<button
							type='button'
							onClick={onClose}
							className='px-4 py-2 rounded bg-stone-900 border border-stone-700 text-stone-300 hover:bg-stone-800 cursor-pointer'
						>
							取消
						</button>
						<button
							type='submit'
							className='px-5 py-2 rounded bg-gradient-to-r from-purple-700 to-amber-700 hover:from-purple-600 hover:to-amber-600 text-white font-semibold shadow-lg flex items-center gap-1.5 cursor-pointer'
						>
							{isEditing ? (
								<>
									<Save className='w-4 h-4' />
									<span>儲存物品修改</span>
								</>
							) : (
								<>
									<Sparkles className='w-4 h-4' />
									<span>鑄造並放入背包</span>
								</>
							)}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
