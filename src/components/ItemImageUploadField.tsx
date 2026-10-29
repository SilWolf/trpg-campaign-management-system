import { useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/FeedbackContext';
import { uploadItemImage } from '@/lib/itemImageUpload';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { ImageStorageBucket } from '@/lib/imageReferences';
import ItemIcon from '@/routes/_protected/campaigns/$campaignId/-parts/ItemIcon';

interface ItemImageUploadFieldProps {
	bucket: Extract<ImageStorageBucket, 'blacksmith-assets' | 'campaign-assets'>;
	scopeId: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

export function ItemImageUploadField({
	bucket,
	scopeId,
	value,
	onChange,
	disabled = false,
}: ItemImageUploadFieldProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);
	const { isGuest, user } = useAuth();
	const toast = useToast();
	const canUpload =
		isSupabaseConfigured &&
		Boolean(user) &&
		!isGuest &&
		(bucket !== 'blacksmith-assets' || user?.id === scopeId);

	const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file) return;
		if (!canUpload || disabled) {
			toast.error('目前帳號或權限不可上傳此物品圖片。');
			return;
		}

		setIsUploading(true);
		try {
			const reference = await uploadItemImage(file, bucket, scopeId);
			onChange(reference);
			toast.success('128 與 512 WebP 圖片已上傳；儲存物品後才會套用。');
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : '物品圖片處理或上傳失敗。',
			);
		} finally {
			setIsUploading(false);
		}
	};

	return (
		<div className='grid gap-2 rounded-md border border-border bg-card/60 p-3'>
			<p className='text-xs font-medium text-foreground'>物品圖片</p>
			<div className='flex items-center gap-3'>
				<div className='flex items-end gap-2'>
					<div
						data-testid='item-image-preview-128'
						className='relative flex h-10 w-10 items-center justify-center overflow-hidden rounded border border-border bg-background'
					>
						<ItemIcon iconName={value} className='h-6 w-6 text-foreground' />
					</div>
					<div
						data-testid='item-image-preview-512'
						className='relative flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-border bg-background'
					>
						<ItemIcon
							iconName={value}
							className='h-8 w-8 text-foreground'
							imageSize='512'
						/>
					</div>
				</div>
				<div className='space-y-2'>
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
						{isUploading ? '正在處理並上傳…' : '上傳或替換圖片'}
					</Button>
					<input
						ref={fileInputRef}
						type='file'
						accept='image/jpeg,image/png,image/webp,image/avif'
						className='sr-only'
						aria-label='選擇要上傳的物品圖片'
						onChange={(event) => void handleFileChange(event)}
					/>
					{!canUpload && (
						<p className='text-[11px] text-muted-foreground'>
							需要已登入的 Supabase 正式帳號才能上傳。
						</p>
					)}
				</div>
			</div>
			<p className='text-[11px] leading-relaxed text-muted-foreground'>
				圖片會轉為 128 與 512 WebP，且採公開讀取。請勿上傳私人或敏感圖像；替換會建立新資產，不會改寫來源圖片。
			</p>
		</div>
	);
}
