import { useState, useEffect, type FormEvent } from 'react';
import { CAMP_CHEST_ID, type Character } from '../types';
import { UserPlus, Save, X, Shield } from 'lucide-react';

interface CharacterModalProps {
	isOpen: boolean;
	character: Character | null; // 若為 null 代表是「新增隊員」
	onClose: () => void;
	onSave: (charData: Character) => void;
	onDelete?: (charId: string) => void;
}

const AVATAR_OPTIONS = [
	'🛡️',
	'🧙‍♂️',
	'🧝‍♀️',
	'🗡️',
	'🔮',
	'🦇',
	'🐉',
	'🍀',
	'🏹',
	'📜',
];

export default function CharacterModal({
	isOpen,
	character,
	onClose,
	onSave,
	onDelete,
}: CharacterModalProps) {
	const [name, setName] = useState('');
	const [title, setTitle] = useState('');
	const [str, setStr] = useState(10);
	const [avatar, setAvatar] = useState('🛡️');

	useEffect(() => {
		if (character) {
			setName(character.name);
			setTitle(character.title);
			setStr(character.str);
			setAvatar(character.avatar || '🛡️');
		} else {
			setName('');
			setTitle('冒險者');
			setStr(10);
			setAvatar('🛡️');
		}
	}, [character, isOpen]);

	if (!isOpen) return null;

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!name.trim()) return;

		const savedCharacter: Character = {
			id: character ? character.id : `char-${Date.now()}`,
			name: name.trim(),
			title: title.trim() || '冒險者',
			str: Math.max(1, Math.min(30, Number(str) || 10)),
			avatar,
			currencies: character
				? character.currencies
				: { pp: 0, gp: 50, ep: 0, sp: 10, cp: 0 }, // 新角色的初始起手金幣
		};

		onSave(savedCharacter);
		onClose();
	};

	return (
		<div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
			<div className='bg-stone-950 border-2 border-amber-600/70 rounded-lg max-w-md w-full p-5 shadow-[0_0_40px_rgba(217,119,6,0.3)]'>
				<div className='flex items-center justify-between border-b border-stone-800 pb-3 mb-4'>
					<div className='flex items-center gap-2'>
						<UserPlus className='w-5 h-5 text-amber-400' />
						<h2 className='text-base font-serif font-bold text-amber-200'>
							{character ? `編輯角色：${character.name}` : '招募新冒險者隊員'}
						</h2>
					</div>
					<button
						onClick={onClose}
						className='text-stone-400 hover:text-stone-200 cursor-pointer'
					>
						<X className='w-5 h-5' />
					</button>
				</div>

				<form onSubmit={handleSubmit} className='space-y-4 text-xs'>
					<div>
						<label className='block text-stone-400 mb-1'>角色名稱 *</label>
						<input
							type='text'
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder='例如：阿斯代倫 (Astarion)'
							className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100 focus:border-amber-500 outline-none'
						/>
					</div>

					<div>
						<label className='block text-stone-400 mb-1'>頭銜 / 職業背景</label>
						<input
							type='text'
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder='例如：高等精靈 / 游蕩者'
							className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100 outline-none'
						/>
					</div>

					<div className='grid grid-cols-2 gap-3'>
						<div>
							<label className='text-amber-300 mb-1 flex items-center gap-1'>
								<Shield className='w-3.5 h-3.5' />
								<span>力量屬性 (STR)</span>
							</label>
							<input
								type='number'
								min='1'
								max='30'
								required
								value={str}
								onChange={(e) => setStr(parseInt(e.target.value, 10) || 10)}
								className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-amber-200 font-mono font-bold outline-none'
							/>
							<span className='text-[10px] text-stone-500 mt-0.5 block'>
								負重上限 = STR × 15 ({Number(str) * 15} lbs)
							</span>
						</div>

						<div>
							<label className='block text-stone-400 mb-1'>選擇頭像符號</label>
							<select
								value={avatar}
								onChange={(e) => setAvatar(e.target.value)}
								className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-stone-100 outline-none'
							>
								{AVATAR_OPTIONS.map((icon) => (
									<option key={icon} value={icon}>
										{icon} 符號頭像
									</option>
								))}
							</select>
						</div>
					</div>

					<div className='flex items-center justify-between pt-3 border-t border-stone-800'>
						{character && character.id !== CAMP_CHEST_ID && onDelete ? (
							<button
								type='button'
								onClick={() => {
									if (
										window.confirm(
											`確定要移除角色「${character.name}」嗎？\n（該角色身上的所有物品與金幣將自動打包移入「🏕️ 營地儲物箱」）`,
										)
									) {
										onDelete(character.id);
										onClose();
									}
								}}
								className='px-3 py-2 rounded bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-200 font-medium transition cursor-pointer'
							>
								移除角色 (遺物入庫)
							</button>
						) : (
							<div />
						)}

						<div className='flex items-center gap-2'>
							<button
								type='button'
								onClick={onClose}
								className='px-4 py-2 rounded bg-stone-900 border border-stone-700 text-stone-300 hover:bg-stone-800 cursor-pointer'
							>
								取消
							</button>
							<button
								type='submit'
								className='px-5 py-2 rounded bg-amber-700 hover:bg-amber-600 text-stone-950 font-bold shadow flex items-center gap-1.5 cursor-pointer'
							>
								<Save className='w-4 h-4' />
								<span>儲存角色</span>
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
