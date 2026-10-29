import { useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { CharacterAvatar } from '@/components/CharacterAvatar';
import { uploadCharacterAvatar } from '@/lib/characterAvatarUpload';
import {
	DEFAULT_AVATAR_REFERENCE,
	normalizeAvatarReference,
} from '@/lib/imageReferences';
import { useToast } from '@/contexts/FeedbackContext';
import { supabase } from '@/lib/supabase';

interface CharacterAvatarPickerProps {
	avatar: string;
	userId?: string;
	disabled?: boolean;
	onChange: (avatar: string) => void;
	onUploadingChange?: (isUploading: boolean) => void;
}

export function CharacterAvatarPicker({
	avatar,
	userId,
	disabled = false,
	onChange,
	onUploadingChange,
}: CharacterAvatarPickerProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);
	const toast = useToast();
	const canUpload = Boolean(userId && supabase);
	const selectedAvatar = normalizeAvatarReference(avatar);

	const handleFileChange = async (
		event: ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file) return;
		if (!userId) {
			toast.error('訪客或離線模式無法上傳雲端頭像；請改選本地預設頭像。');
			return;
		}

		setIsUploading(true);
		onUploadingChange?.(true);
		try {
			const reference = await uploadCharacterAvatar(file, userId);
			onChange(reference);
			toast.success('頭像已上傳，儲存角色資料後才會套用。');
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : '頭像處理或上傳失敗。',
			);
		} finally {
			setIsUploading(false);
			onUploadingChange?.(false);
		}
	};

	return (
		<div className='grid gap-3'>
			<label className='text-xs text-muted-foreground'>角色大頭像</label>
			<div className='flex items-center gap-3'>
				<CharacterAvatar
					avatar={avatar}
					alt='角色頭像預覽'
					className='h-14 w-14 rounded-full border border-primary/50 bg-card object-cover'
				/>
				<div className='min-w-0 flex-1 space-y-2'>
					<Select
						aria-label='選擇預設頭像'
						data-testid='character-avatar'
						disabled={disabled || isUploading}
						value={selectedAvatar}
						onChange={(event) => onChange(event.target.value)}
						className='bg-card'
					>
						<option value={DEFAULT_AVATAR_REFERENCE}>通用預設頭像</option>
						{selectedAvatar !== DEFAULT_AVATAR_REFERENCE && (
							<option value={selectedAvatar}>目前自訂頭像</option>
						)}
					</Select>
					<Button
						type='button'
						variant='secondary'
						size='sm'
						disabled={disabled || isUploading || !canUpload}
						onClick={() => fileInputRef.current?.click()}
						prefixIcon={
							isUploading ? (
								<LoaderCircle className='animate-spin' />
							) : (
								<ImagePlus />
							)
						}
					>
						{isUploading ? '正在處理並上傳…' : '上傳自訂頭像'}
					</Button>
					<input
						ref={fileInputRef}
						type='file'
						accept='image/jpeg,image/png,image/webp,image/avif'
						className='sr-only'
						aria-label='選擇要上傳的角色頭像'
						onChange={handleFileChange}
					/>
				</div>
			</div>
			<p className='text-[11px] leading-relaxed text-muted-foreground'>
				本地預設圖不會上傳；自訂圖片會轉為 256×256 WebP。上傳圖片採公開讀取，請勿放入私人或敏感內容。
			</p>
			{!canUpload && (
				<p className='text-[11px] text-muted-foreground'>
					訪客或離線模式無法使用雲端上傳。
				</p>
			)}
		</div>
	);
}
