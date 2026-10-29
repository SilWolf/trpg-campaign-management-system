import { useRef, useState, type ChangeEvent } from 'react';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/FeedbackContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { uploadJourneyImage } from '@/lib/journeyImageUpload';

interface JourneyImageUploadFieldProps {
	campaignId: string;
	journeyId?: string;
	onInsert: (reference: string) => void;
	disabled?: boolean;
}

export function JourneyImageUploadField({
	campaignId,
	journeyId,
	onInsert,
	disabled = false,
}: JourneyImageUploadFieldProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);
	const { isGuest, user } = useAuth();
	const toast = useToast();
	const canUpload =
		Boolean(journeyId) &&
		isSupabaseConfigured &&
		Boolean(user) &&
		!isGuest &&
		!disabled;

	const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file) return;
		if (!journeyId || !canUpload) {
			toast.error('目前帳號或權限不可上傳此筆記圖片。');
			return;
		}

		setIsUploading(true);
		try {
			const reference = await uploadJourneyImage(file, campaignId, journeyId);
			onInsert(reference);
			toast.success('筆記圖片已轉為 WebP 並上傳；儲存筆記後才會插入內容。');
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : '筆記圖片處理或上傳失敗。',
			);
		} finally {
			setIsUploading(false);
		}
	};

	return (
		<div className='grid gap-2 rounded-md border border-border bg-background/50 p-3'>
			<div className='flex flex-wrap items-center gap-3'>
				<Button
					type='button'
					variant='secondary'
					size='sm'
					disabled={!canUpload || isUploading}
					onClick={() => fileInputRef.current?.click()}
					prefixIcon={
						isUploading ? (
							<LoaderCircle className='animate-spin' />
						) : (
							<ImagePlus />
						)
					}
					data-testid='journey-image-upload'
				>
					{isUploading ? '正在處理並上傳…' : '上傳並插入圖片'}
				</Button>
				<input
					ref={fileInputRef}
					type='file'
					accept='image/jpeg,image/png,image/webp,image/avif'
					className='sr-only'
					aria-label='選擇要上傳的筆記圖片'
					onChange={(event) => void handleFileChange(event)}
				/>
				{!journeyId && (
					<p className='text-xs text-muted-foreground'>
						請先建立並儲存筆記，再編輯插入圖片。
					</p>
				)}
				{journeyId && !canUpload && (
					<p className='text-xs text-muted-foreground'>
						需要已登入的 Supabase 帳號及此筆記的編輯權限。
					</p>
				)}
			</div>
			<p className='text-[11px] leading-relaxed text-muted-foreground'>
				圖片會依比例縮放至最大寬度 1,200 px，並轉為 WebP。圖片採公開讀取，請勿上傳私人或敏感圖像。
			</p>
		</div>
	);
}
