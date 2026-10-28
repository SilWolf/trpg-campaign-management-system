import { useEffect, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import { useToast } from '@/contexts/FeedbackContext';
import { saveCampaignShop, type CampaignShopValues } from '@/lib/campaignShops';
import { Button, Input, Textarea } from '@/components/ui';
import type { CampaignShop } from '@/types';

interface CampaignShopDialogProps {
	campaignId: string;
	shop?: CampaignShop | null;
	onClose: () => void;
	onSaved: (shop: CampaignShop) => void | Promise<void>;
}

const INPUT_CLASS =
	'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring';

function getSaveErrorMessage(error: unknown): string {
	if (
		typeof error === 'object' &&
		error !== null &&
		'message' in error &&
		typeof error.message === 'string' &&
		error.message
	) {
		if (
			'code' in error &&
			error.code === 'PGRST204' &&
			error.message.includes('flavor') &&
			error.message.includes('campaign_shops')
		) {
			return `儲存商店失敗：資料庫缺少商店風味欄位或 schema 快取尚未更新，請維護者確認 migration。${error.message}`;
		}
		return `儲存商店失敗：${error.message}`;
	}
	return '儲存商店失敗，請稍後重試或聯絡維護者。';
}

export function CampaignShopDialog({
	campaignId,
	shop = null,
	onClose,
	onSaved,
}: CampaignShopDialogProps) {
	const toast = useToast();
	const [name, setName] = useState(shop?.name ?? '');
	const [flavor, setFlavor] = useState(shop?.flavor ?? '');
	const [backgroundImageUrl, setBackgroundImageUrl] = useState(
		shop?.backgroundImageUrl ?? '',
	);
	const [isActive, setIsActive] = useState(shop?.isActive ?? true);
	const [isSaving, setIsSaving] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const isEditing = Boolean(shop);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !isSaving) onClose();
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isSaving, onClose]);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const normalizedName = name.trim();
		if (!normalizedName || normalizedName.length > 120) {
			setErrorMessage('商店名稱必須為 1 至 120 個字元。');
			return;
		}
		if (flavor.length > 1000) {
			setErrorMessage('商店風味描述不可超過 1000 個字元。');
			return;
		}

		const imageUrl = backgroundImageUrl.trim();
		if (imageUrl) {
			try {
				const parsed = new URL(imageUrl);
				if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
					throw new Error('invalid protocol');
				}
			} catch {
				setErrorMessage('背景圖片網址必須是有效的 http 或 https 網址。');
				return;
			}
		}

		const values: CampaignShopValues = {
			name: normalizedName,
			flavor: flavor.trim(),
			backgroundImageUrl: imageUrl || null,
			isActive,
		};
		setIsSaving(true);
		setErrorMessage(null);
		try {
			const savedShop = await saveCampaignShop(campaignId, values, shop?.id);
			await onSaved(savedShop);
			onClose();
		} catch (error) {
			const message = getSaveErrorMessage(error);
			setErrorMessage(message);
			toast.error(message);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm'
			onClick={(event) => {
				if (event.target === event.currentTarget && !isSaving) onClose();
			}}
		>
			<form
				onSubmit={(event) => void handleSubmit(event)}
				className='my-auto grid w-full max-w-xl gap-4 rounded-lg border border-primary/50 bg-card p-4 shadow-2xl sm:grid-cols-2'
				data-testid='shop-editor'
				role='dialog'
				aria-modal='true'
				aria-labelledby='campaign-shop-dialog-title'
			>
				<div className='flex items-center justify-between sm:col-span-2'>
					<h2
						id='campaign-shop-dialog-title'
						className='font-serif text-xl font-bold text-card-foreground'
					>
						{isEditing ? '編輯商店' : '建立商店'}
					</h2>
					<Button
						type='button'
						variant='ghost'
						aria-label='關閉商店編輯'
						disabled={isSaving}
						onClick={onClose}
						className='text-muted-foreground hover:text-foreground'
					>
						<X className='h-4 w-4' />
					</Button>
				</div>
				{errorMessage && (
					<p
						role='alert'
						className='rounded-md border border-destructive/70 bg-destructive/40 p-3 text-sm text-destructive-foreground sm:col-span-2'
					>
						{errorMessage}
					</p>
				)}
				<label className='text-sm text-foreground'>
					商店名稱
					<Input
						required
						maxLength={120}
						value={name}
						onChange={(event) => setName(event.target.value)}
						className={INPUT_CLASS}
						placeholder='例如：灰港冒險者商會'
						data-testid='shop-name'
					/>
				</label>
				<label className='text-sm text-foreground sm:col-span-2'>
					商店風味描述（選填）
					<Textarea
						maxLength={1000}
						value={flavor}
						onChange={(event) => setFlavor(event.target.value)}
						className='mt-1 min-h-24 border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-ring/40'
						placeholder='描述商店的氛圍、店主或來訪時的感受…'
						data-testid='shop-flavor'
					/>
				</label>
				<label className='text-sm text-foreground'>
					背景圖片網址（選填）
					<Input
						type='url'
						maxLength={2048}
						value={backgroundImageUrl}
						onChange={(event) => setBackgroundImageUrl(event.target.value)}
						className={INPUT_CLASS}
						placeholder='https://example.com/shop.webp'
					/>
				</label>
				{backgroundImageUrl && (
					<div className='overflow-hidden rounded-md border border-border sm:col-span-2'>
						<img
							src={backgroundImageUrl}
							alt='商店背景預覽'
							className='h-36 w-full object-cover'
							onError={(event) => {
								event.currentTarget.style.display = 'none';
							}}
						/>
					</div>
				)}
				{isEditing && (
					<label className='flex items-center gap-2 text-sm text-foreground sm:col-span-2'>
						<input
							type='checkbox'
							checked={isActive}
							onChange={(event) => setIsActive(event.target.checked)}
							className='accent-primary'
						/>
						啟用商店（停用後只對 DM 顯示，歷史資料保留）
					</label>
				)}
				<div className='flex justify-end gap-2 sm:col-span-2'>
					<Button
						type='button'
						variant='ghost'
						disabled={isSaving}
						onClick={onClose}
						className='text-muted-foreground'
					>
						取消
					</Button>
					<Button
						type='submit'
						loading={isSaving}
						className='border border-primary/60 bg-primary text-primary-foreground'
					>
						<Check className='h-4 w-4' />
						儲存商店
					</Button>
				</div>
			</form>
		</div>
	);
}
