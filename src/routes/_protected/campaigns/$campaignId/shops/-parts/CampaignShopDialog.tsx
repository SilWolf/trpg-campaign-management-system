import { useEffect, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import { saveCampaignShop, type CampaignShopValues } from '@/lib/campaignShops';
import { Button, Input } from '@/components/ui';
import type { CampaignShop } from '@/types';

interface CampaignShopDialogProps {
	campaignId: string;
	shop?: CampaignShop | null;
	onClose: () => void;
	onSaved: (shop: CampaignShop) => void | Promise<void>;
}

const INPUT_CLASS =
	'mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600';

export function CampaignShopDialog({
	campaignId,
	shop = null,
	onClose,
	onSaved,
}: CampaignShopDialogProps) {
	const [name, setName] = useState(shop?.name ?? '');
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
			setErrorMessage(
				error instanceof Error ? error.message : '儲存商店失敗。',
			);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm'
			onClick={(event) => {
				if (event.target === event.currentTarget && !isSaving) onClose();
			}}
		>
			<form
				onSubmit={(event) => void handleSubmit(event)}
				className='my-auto grid w-full max-w-xl gap-4 rounded-lg border border-amber-800/50 bg-stone-900 p-4 shadow-2xl sm:grid-cols-2'
				data-testid='shop-editor'
				role='dialog'
				aria-modal='true'
				aria-labelledby='campaign-shop-dialog-title'
			>
				<div className='flex items-center justify-between sm:col-span-2'>
					<h2
						id='campaign-shop-dialog-title'
						className='font-serif text-xl font-bold text-amber-200'
					>
						{isEditing ? '編輯商店' : '建立商店'}
					</h2>
					<Button
						type='button'
						variant='ghost'
						aria-label='關閉商店編輯'
						disabled={isSaving}
						onClick={onClose}
						className='text-stone-400 hover:text-stone-100'
					>
						<X className='h-4 w-4' />
					</Button>
				</div>
				{errorMessage && (
					<p
						role='alert'
						className='rounded-md border border-red-800/70 bg-red-950/40 p-3 text-sm text-red-200 sm:col-span-2'
					>
						{errorMessage}
					</p>
				)}
				<label className='text-sm text-stone-300'>
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
				<label className='text-sm text-stone-300'>
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
					<div className='overflow-hidden rounded-md border border-stone-700 sm:col-span-2'>
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
					<label className='flex items-center gap-2 text-sm text-stone-300 sm:col-span-2'>
						<input
							type='checkbox'
							checked={isActive}
							onChange={(event) => setIsActive(event.target.checked)}
							className='accent-amber-500'
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
						className='text-stone-400'
					>
						取消
					</Button>
					<Button
						type='submit'
						loading={isSaving}
						className='border border-amber-500/60 bg-amber-800 text-amber-50'
					>
						<Check className='h-4 w-4' />
						儲存商店
					</Button>
				</div>
			</form>
		</div>
	);
}
