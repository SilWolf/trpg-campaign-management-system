import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Sparkles } from 'lucide-react';
import type {
	HomebrewForm,
	ItemCategory,
	Rarity,
	WeaponMastery,
} from '../types';

type HomebrewModalProps = {
	isOpen: boolean;
	form: HomebrewForm;
	setForm: Dispatch<SetStateAction<HomebrewForm>>;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	characterName: string;
	onClose: () => void;
	weaponMasteries: Record<WeaponMastery, { name: string; desc: string }>;
};

const HomebrewModal = ({
	isOpen,
	form,
	setForm,
	onSubmit,
	characterName,
	onClose,
	weaponMasteries,
}: HomebrewModalProps) => {
	return (
isOpen && (
				<div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
					<div className='bg-[#141210] border-2 border-purple-500/70 rounded-lg max-w-xl w-full p-6 shadow-[0_0_50px_rgba(168,85,247,0.3)] my-8'>
						<div className='flex items-center justify-between border-b border-stone-800 pb-3 mb-4'>
							<div className='flex items-center gap-2'>
								<Sparkles className='w-5 h-5 text-purple-400' />
								<h3 className='text-lg font-serif font-bold text-purple-200'>
									DM 自創道具鍛造工坊 (Homebrew Forge)
								</h3>
							</div>
							<button
								onClick={onClose}
								className='text-stone-400 hover:text-stone-200 text-sm cursor-pointer'
							>
								✕ 關閉
							</button>
						</div>

						<form
							onSubmit={onSubmit}
							className='space-y-3.5 text-xs sm:text-sm'
						>
							<div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
								<div>
									<label className='block text-stone-400 mb-1'>
										道具名稱 *
									</label>
									<input
										type='text'
										required
										placeholder='例如：深淵凝視長弓'
										value={form.name}
										onChange={(e) =>
											setForm({ ...form, name: e.target.value })
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100 outline-none focus:border-purple-400'
									/>
								</div>
								<div>
									<label className='block text-stone-400 mb-1'>
										稀有度 (決定發光邊框)
									</label>
									<select
										value={form.rarity}
										onChange={(e) =>
											setForm({
												...form,
												rarity: e.target.value as Rarity,
											})
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100 outline-none focus:border-purple-400'
									>
										<option value='Common'>普通 (Common - 灰框)</option>
										<option value='Uncommon'>非普通 (Uncommon - 綠光)</option>
										<option value='Rare'>稀有 (Rare - 藍光)</option>
										<option value='VeryRare'>極珍稀 (Very Rare - 紫光)</option>
										<option value='Legendary'>傳奇 (Legendary - 金光)</option>
										<option value='Artifact'>神器 (Artifact - 橘紅光)</option>
									</select>
								</div>
							</div>

							<div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
								<div>
									<label className='block text-stone-400 mb-1'>分類</label>
									<select
										value={form.category}
										onChange={(e) =>
											setForm({
												...form,
												category: e.target.value as ItemCategory,
											})
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									>
										<option value='Weapon'>武器 (Weapon)</option>
										<option value='Armor'>護甲 (Armor)</option>
										<option value='Consumable'>消耗品 (Consumable)</option>
										<option value='Misc'>奇物/神器 (Misc)</option>
									</select>
								</div>
								<div>
									<label className='block text-stone-400 mb-1'>
										子類型描述
									</label>
									<input
										type='text'
										value={form.subType}
										onChange={(e) =>
											setForm({
												...form,
												subType: e.target.value,
											})
										}
										placeholder='如：長劍 (雙用)'
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									/>
								</div>
								<div>
									<label className='block text-stone-400 mb-1'>圖示樣式</label>
									<select
										value={form.icon}
										onChange={(e) =>
											setForm({ ...form, icon: e.target.value })
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									>
										<option value='Sword'>⚔️ 刀劍 (Sword)</option>
										<option value='Hammer'>🔨 戰錘 (Hammer)</option>
										<option value='Shield'>🛡️ 護盾/重甲 (Shield)</option>
										<option value='Wand2'>🪄 魔杖/法杖 (Wand)</option>
										<option value='FlaskConical'>🧪 藥水 (Potion)</option>
										<option value='Scroll'>📜 卷軸 (Scroll)</option>
										<option value='Gem'>💎 寶石/稜鏡 (Gem)</option>
										<option value='Flame'>🔥 聖火遺物 (Flame)</option>
										<option value='Crown'>👑 頭冠/飾品 (Crown)</option>
									</select>
								</div>
							</div>

							{/* 若為武器，顯示傷害與 5R 武器精通 */}
							{form.category === 'Weapon' && (
								<div className='grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded bg-stone-900/70 border border-stone-800'>
									<div>
										<label className='block text-amber-300 mb-1'>
											武器傷害骰與屬性
										</label>
										<input
											type='text'
											value={form.damage}
											onChange={(e) =>
												setForm({
													...form,
													damage: e.target.value,
												})
											}
											placeholder='1d8+2 揮砍 + 1d6 火焰'
											className='w-full bg-stone-950 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
										/>
									</div>
									<div>
										<label className='block text-amber-300 mb-1'>
											5R 武器精通 (Weapon Mastery)
										</label>
										<select
											value={form.mastery}
											onChange={(e) =>
												setForm({
													...form,
													mastery: e.target.value as WeaponMastery,
												})
											}
											className='w-full bg-stone-950 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
										>
											{Object.entries(weaponMasteries).map(([key, val]) => (
												<option key={key} value={key}>
													{val.name}
												</option>
											))}
										</select>
									</div>
								</div>
							)}

							{/* 重量、價值、充能次數 */}
							<div className='grid grid-cols-3 gap-3'>
								<div>
									<label className='block text-stone-400 mb-1'>
										重量 (lbs)
									</label>
									<input
										type='number'
										step='0.1'
										value={form.weight}
										onChange={(e) =>
											setForm({ ...form, weight: e.target.value })
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									/>
								</div>
								<div>
									<label className='block text-stone-400 mb-1'>價值 (GP)</label>
									<input
										type='number'
										value={form.valueGp}
										onChange={(e) =>
											setForm({
												...form,
												valueGp: e.target.value,
											})
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									/>
								</div>
								<div>
									<label className='block text-stone-400 mb-1'>
										每日充能上限
									</label>
									<input
										type='number'
										min='0'
										max='10'
										value={form.maxCharges}
										onChange={(e) =>
											setForm({
												...form,
												maxCharges: e.target.value,
											})
										}
										className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
									/>
								</div>
							</div>

							<div>
								<label className='block text-stone-400 mb-1'>
									規則效果描述 (玩家鑑定後可見)
								</label>
								<textarea
									rows={2}
									value={form.effects}
									onChange={(e) =>
										setForm({ ...form, effects: e.target.value })
									}
									placeholder='描述此道具的加值、主動技能或被動光環...'
									className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100'
								/>
							</div>

							<div>
								<label className='block text-red-400 mb-1'>
									🔒 DM 隱藏筆記 / 詛咒觸發條件 (僅在 DM 視角顯示)
								</label>
								<textarea
									rows={2}
									value={form.dmNotes}
									onChange={(e) =>
										setForm({ ...form, dmNotes: e.target.value })
									}
									placeholder='例如：每次使用技能須擲 DC15 感知豁免，失敗則受到精神控制...'
									className='w-full bg-red-950/20 border border-red-800/60 rounded px-3 py-1.5 text-red-100'
								/>
							</div>

							<div className='flex flex-wrap items-center gap-6 pt-1'>
								<label className='flex items-center gap-2 cursor-pointer'>
									<input
										type='checkbox'
										checked={form.requiresAttunement}
										onChange={(e) =>
											setForm({
												...form,
												requiresAttunement: e.target.checked,
											})
										}
										className='accent-amber-500'
									/>
									<span>需要同調 (Requires Attunement)</span>
								</label>

								<label className='flex items-center gap-2 cursor-pointer text-purple-300'>
									<input
										type='checkbox'
										checked={!form.isIdentified}
										onChange={(e) =>
											setForm({
												...form,
												isIdentified: !e.target.checked,
											})
										}
										className='accent-purple-500'
									/>
									<span>發放時設為「未鑑定」狀態 (隱藏真實效果)</span>
								</label>
							</div>

							<div className='pt-3 border-t border-stone-800 flex justify-end gap-3'>
								<button
									type='button'
									onClick={onClose}
									className='px-4 py-2 rounded bg-stone-800 text-stone-300 hover:bg-stone-700 cursor-pointer'
								>
									取消
								</button>
								<button
									type='submit'
									className='px-5 py-2 rounded bg-gradient-to-r from-purple-700 to-amber-700 hover:brightness-110 text-white font-semibold shadow-lg cursor-pointer'
								>
									✨ 鍛造並發放給 {characterName}
								</button>
							</div>
						</form>
					</div>
				</div>
			)
	);
};

export default HomebrewModal;
