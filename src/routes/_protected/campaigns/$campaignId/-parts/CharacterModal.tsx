/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, type FormEvent } from 'react';
import { CAMP_CHEST_ID, type Character } from '@/types';
import { UserPlus, Save, X, Shield } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useConfirm, useToast } from '@/contexts/FeedbackContext';
import { CharacterAvatarPicker } from '@/components/CharacterAvatarPicker';
import {
	DEFAULT_AVATAR_REFERENCE,
	normalizeAvatarReference,
} from '@/lib/imageReferences';

interface CharacterModalProps {
	isOpen: boolean;
	campaignId: string;
	userId: string;
	character: Character | null;
	canEditProfile?: boolean;
	canDeleteCharacter?: boolean;
	onClose: () => void;
	onSave: (charData: Character) => boolean | Promise<boolean>;
	onDelete?: (charId: string) => void;
}

export default function CharacterModal({
	isOpen,
	userId,
	campaignId,
	character,
	canEditProfile = true,
	canDeleteCharacter = true,
	onClose,
	onSave,
	onDelete,
}: CharacterModalProps) {
	const confirm = useConfirm();
	const toast = useToast();
	const [name, setName] = useState('');
	const [title, setTitle] = useState('');
	const [str, setStr] = useState(10);
	const [avatar, setAvatar] = useState(DEFAULT_AVATAR_REFERENCE);
	const [isSaving, setIsSaving] = useState(false);
	const [isAvatarUploading, setIsAvatarUploading] = useState(false);

	const isCreating = !character;
	const allowFormEdit = isCreating || canEditProfile;

	useEffect(() => {
		if (character) {
			setName(character.name);
			setTitle(character.title);
			setStr(character.str);
			setAvatar(normalizeAvatarReference(character.avatar));
		} else {
			setName('');
			setTitle('冒險者');
			setStr(10);
			setAvatar(DEFAULT_AVATAR_REFERENCE);
		}
	}, [character, isOpen]);

	if (!isOpen) return null;

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!allowFormEdit || !name.trim() || isSaving || isAvatarUploading) return;

		const savedCharacter: Character = {
			id: character ? character.id : `char-${Date.now()}`,
			name: name.trim(),
			title: title.trim() || '冒險者',
			str: Math.max(1, Math.min(30, Number(str) || 10)),
			avatar,
			userId: character ? character.userId : userId,
			campaignId: character ? character.campaignId : campaignId,
			currencies: character
				? character.currencies
				: { pp: 0, gp: 50, ep: 0, sp: 10, cp: 0 },
			privateCurrencies: character
				? character.privateCurrencies || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }
				: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
		};

		setIsSaving(true);
		try {
			if (await onSave(savedCharacter)) onClose();
		} catch (error) {
			toast.error(
				'新增角色失敗：' +
					(error instanceof Error ? error.message : '未知錯誤'),
			);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className='fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
			<div
				role='dialog'
				aria-modal='true'
				aria-labelledby='character-modal-heading'
				className='bg-background border-2 border-primary/70 rounded-lg max-w-md w-full p-5 shadow-lg'
			>
				<div className='flex items-center justify-between border-b border-border pb-3 mb-4'>
					<div className='flex items-center gap-2'>
						<UserPlus className='w-5 h-5 text-foreground' />
						<h2
							id='character-modal-heading'
							className='text-base font-serif font-bold text-foreground'
						>
							{character ? `編輯角色：${character.name}` : '招募新冒險者隊員'}
						</h2>
					</div>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						aria-label='關閉角色編輯'
						onClick={onClose}
						disabled={isSaving}
						prefixIcon={<X />}
					>
					</Button>
				</div>

				<form
					onSubmit={handleSubmit}
					data-testid='character-form'
					className='space-y-4 text-xs'
				>
					<div className='grid gap-1.5'>
						<label htmlFor='character-name' className='text-muted-foreground'>
							角色名稱 *
						</label>
						<Input
							id='character-name'
							required
							disabled={!allowFormEdit}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder='例如：阿斯代倫 (Astarion)'
							data-testid='character-name'
							className='w-full bg-card border border-border rounded px-3 py-1.5 text-foreground focus:border-primary outline-none disabled:opacity-50'
						/>
					</div>

					<div className='grid gap-1.5'>
						<label htmlFor='character-title' className='text-muted-foreground'>
							頭銜 / 職業背景
						</label>
						<Input
							id='character-title'
							disabled={!allowFormEdit}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder='例如：高等精靈 / 游蕩者'
							data-testid='character-title'
							className='w-full bg-card border border-border rounded px-3 py-1.5 text-foreground outline-none disabled:opacity-50'
						/>
					</div>

					<div className='grid grid-cols-2 gap-3'>
						<div>
							<label
								htmlFor='character-strength'
								className='text-primary-foreground mb-1 flex items-center gap-1'
							>
								<Shield className='w-3.5 h-3.5' />
								<span>力量屬性 (STR)</span>
							</label>
							<Input
								id='character-strength'
								type='number'
								min='1'
								max='30'
								required
								disabled={!allowFormEdit}
								value={str}
								onChange={(e) => setStr(parseInt(e.target.value, 10) || 10)}
								data-testid='character-strength'
								className='w-full bg-card border border-border rounded px-3 py-1.5 text-primary-foreground font-mono font-bold outline-none disabled:opacity-50'
							/>
							<span className='text-[10px] text-muted-foreground mt-0.5 block'>
								負重上限 = STR × 15 ({Number(str) * 15} lbs)
							</span>
						</div>

						<div className='col-span-2'>
							<CharacterAvatarPicker
								avatar={avatar}
								userId={userId}
								disabled={!allowFormEdit || isSaving}
								onChange={setAvatar}
								onUploadingChange={setIsAvatarUploading}
							/>
						</div>
					</div>

					<div className='flex items-center justify-between pt-3 border-t border-border'>
						{character &&
						character.id !== CAMP_CHEST_ID &&
						canDeleteCharacter &&
						onDelete ? (
							<Button
								type='button'
								variant='danger'
								onClick={async () => {
									const confirmed = await confirm({
										title: '移除角色',
										message: `確定要移除角色「${character.name}」嗎？該角色身上的所有物品與公開／私人金幣將自動打包移入「營地儲物箱」。`,
										confirmLabel: '移除角色',
										variant: 'danger',
									});
									if (!confirmed) return;
									onDelete(character.id);
									onClose();
								}}
							>
								移除角色 (遺物入庫)
							</Button>
						) : (
							<div />
						)}

						<div className='flex items-center gap-2'>
							<Button
								type='button'
								variant='secondary'
								onClick={onClose}
								disabled={isSaving || isAvatarUploading}
							>
								取消
							</Button>
							{allowFormEdit && (
								<Button
									type='submit'
									variant='primary'
									disabled={isSaving}
									prefixIcon={<Save />}
								>
									<span>{isSaving ? '正在儲存…' : '儲存角色'}</span>
								</Button>
							)}
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
