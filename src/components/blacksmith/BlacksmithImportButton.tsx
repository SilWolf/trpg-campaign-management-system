import { useEffect, useState } from 'react';
import { PackagePlus, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
	toDbBlacksmithImportDefinition,
	toBlacksmithImportDefinition,
	type BlacksmithImportSource,
} from '@/lib/blacksmithImport';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { CAMP_CHEST_ID } from '@/types';

interface CampaignOption {
	id: string;
	name: string;
}

interface CharacterOption {
	id: string;
	name: string;
}

interface BlacksmithImportButtonProps {
	source: BlacksmithImportSource;
	className?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error) return error.message;
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}
	return fallback;
}

export function BlacksmithImportButton({
	source,
	className = '',
}: BlacksmithImportButtonProps) {
	const { user, isGuest } = useAuth();
	const [isOpen, setIsOpen] = useState(false);
	const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
	const [characters, setCharacters] = useState<CharacterOption[]>([]);
	const [campaignId, setCampaignId] = useState('');
	const [ownerId, setOwnerId] = useState(CAMP_CHEST_ID);
	const [quantity, setQuantity] = useState('1');
	const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
	const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	useEffect(() => {
		const client = supabase;
		const currentUserId = user?.id;
		if (!isOpen || !currentUserId || isGuest || !client) return;
		let isMounted = true;

		async function loadCampaigns(
			importClient: NonNullable<typeof supabase>,
			importUserId: string,
		) {
			setIsLoadingCampaigns(true);
			setErrorMessage(null);
			try {
				const { data, error } = await importClient
					.from('campaigns')
					.select('id, name')
					.eq('dm_id', importUserId)
					.order('created_at', { ascending: false });
				if (error) throw error;
				if (isMounted) {
					const options = data ?? [];
					setCampaigns(options);
					setCampaignId((current) =>
						options.some((campaign) => campaign.id === current)
							? current
							: (options[0]?.id ?? ''),
					);
				}
			} catch (error) {
				if (isMounted) {
					setErrorMessage(getErrorMessage(error, '載入 DM 戰役失敗。'));
				}
			} finally {
				if (isMounted) setIsLoadingCampaigns(false);
			}
		}

		void loadCampaigns(client, currentUserId);
		return () => {
			isMounted = false;
		};
	}, [isOpen, user, isGuest]);

	useEffect(() => {
		const client = supabase;
		if (!isOpen || !campaignId || !client) return;
		let isMounted = true;

		async function loadCharacters(
			importClient: NonNullable<typeof supabase>,
		) {
			setIsLoadingCharacters(true);
			setErrorMessage(null);
			try {
				const { data, error } = await importClient
					.from('characters')
					.select('id, name')
					.eq('campaign_id', campaignId)
					.neq('id', CAMP_CHEST_ID)
					.order('name');
				if (error) throw error;
				if (isMounted) {
					setCharacters(data ?? []);
					setOwnerId(CAMP_CHEST_ID);
				}
			} catch (error) {
				if (isMounted) {
					setErrorMessage(getErrorMessage(error, '載入接收角色失敗。'));
				}
			} finally {
				if (isMounted) setIsLoadingCharacters(false);
			}
		}

		void loadCharacters(client);
		return () => {
			isMounted = false;
		};
	}, [isOpen, campaignId]);

	const handleImport = async () => {
		if (!supabase || !user || isGuest) {
			setErrorMessage('匯入戰役需要 Supabase 正式帳號登入。');
			return;
		}
		const parsedQuantity = Number(quantity);
		if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1) {
			setErrorMessage('數量必須是大於或等於 1 的整數。');
			return;
		}
		if (!campaignId || !ownerId) {
			setErrorMessage('請選擇戰役與接收目標。');
			return;
		}

		setIsImporting(true);
		setErrorMessage(null);
		setSuccessMessage(null);
		try {
			const { error } = await supabase.rpc('import_blacksmith_item', {
				p_campaign_id: campaignId,
				p_owner_id: ownerId,
				p_item: toDbBlacksmithImportDefinition(
					toBlacksmithImportDefinition(source),
				),
				p_quantity: parsedQuantity,
			});
			if (error) throw error;
			const campaignName =
				campaigns.find((campaign) => campaign.id === campaignId)?.name ??
				'戰役';
			const ownerName =
				ownerId === CAMP_CHEST_ID
					? '營地儲物箱'
					: (characters.find((character) => character.id === ownerId)?.name ??
						'角色');
			setSuccessMessage(
				`已將 ${parsedQuantity} 個「${source.name}」匯入「${campaignName}」的「${ownerName}」。`,
			);
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '匯入失敗，請稍後重試。'));
		} finally {
			setIsImporting(false);
		}
	};

	const canImport = isSupabaseConfigured && !isGuest && Boolean(user);

	return (
		<>
			<button
				type='button'
				disabled={!canImport}
				onClick={() => {
					setErrorMessage(null);
					setSuccessMessage(null);
					setIsOpen(true);
				}}
				className={`inline-flex items-center justify-center gap-2 rounded-md border border-cyan-700/70 bg-cyan-950/50 px-3 py-2 text-sm font-semibold text-cyan-200 hover:border-cyan-500 hover:bg-cyan-900/50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
				title={
					canImport
						? '複製此物品定義到 DM 戰役'
						: '匯入戰役需要 Supabase 正式帳號'
				}
			>
				<PackagePlus aria-hidden='true' className='h-4 w-4' />
				匯入戰役
			</button>

			{isOpen && (
				<div className='fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4'>
					<section
						role='dialog'
						aria-modal='true'
						aria-labelledby='blacksmith-import-title'
						className='w-full max-w-lg space-y-4 rounded-xl border border-cyan-800/70 bg-stone-950 p-5 shadow-2xl'
					>
						<header className='flex items-start justify-between gap-4 border-b border-stone-800 pb-3'>
							<div>
								<p className='text-xs tracking-wider text-cyan-400'>
									複製目錄定義 · 不會綁定來源樣板
								</p>
								<h2
									id='blacksmith-import-title'
									className='mt-1 font-serif text-xl font-bold text-cyan-100'
								>
									匯入「{source.name}」
								</h2>
							</div>
							<button
								type='button'
								aria-label='關閉匯入視窗'
								onClick={() => setIsOpen(false)}
								className='rounded p-1 text-stone-400 hover:bg-stone-800 hover:text-stone-100'
							>
								<X className='h-5 w-5' />
							</button>
						</header>

						{!isSupabaseConfigured ? (
							<p className='rounded-md border border-amber-800/70 bg-amber-950/30 p-3 text-sm text-amber-200'>
								目前未設定 Supabase；匯入戰役需要雲端資料庫連線。
							</p>
						) : isGuest || !user ? (
							<p className='rounded-md border border-amber-800/70 bg-amber-950/30 p-3 text-sm text-amber-200'>
								請使用正式帳號登入後再匯入戰役。
							</p>
						) : (
							<>
								<label className='block text-sm text-stone-300'>
									目標戰役
									<select
										aria-label='目標戰役'
										value={campaignId}
										disabled={isLoadingCampaigns || campaigns.length === 0}
										onChange={(event) => setCampaignId(event.target.value)}
										className='mt-1 w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-stone-100'
									>
										{campaigns.length === 0 && (
											<option value=''>
												{isLoadingCampaigns
													? '正在載入…'
													: '沒有可管理的 DM 戰役'}
											</option>
										)}
										{campaigns.map((campaign) => (
											<option key={campaign.id} value={campaign.id}>
												{campaign.name}
											</option>
										))}
									</select>
								</label>
								<label className='block text-sm text-stone-300'>
									接收目標
									<select
										aria-label='接收目標'
										value={ownerId}
										disabled={!campaignId || isLoadingCharacters}
										onChange={(event) => setOwnerId(event.target.value)}
										className='mt-1 w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-stone-100'
									>
										<option value={CAMP_CHEST_ID}>營地儲物箱（公開）</option>
										{characters.map((character) => (
											<option key={character.id} value={character.id}>
												{character.name}
											</option>
										))}
									</select>
								</label>
								<label className='block text-sm text-stone-300'>
									數量
									<input
										aria-label='匯入數量'
										type='number'
										min='1'
										step='1'
										required
										value={quantity}
										onChange={(event) => setQuantity(event.target.value)}
										className='mt-1 w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 font-mono text-stone-100'
									/>
								</label>
								<p className='rounded-md border border-stone-800 bg-stone-900/70 p-3 text-xs leading-relaxed text-stone-400'>
									匯入會建立新的戰役物品 ID，初始化為未裝備、未調諧、未鑑定及 0
									充能；營地儲物箱物品固定為公開。
								</p>
							</>
						)}

						{errorMessage && (
							<p role='alert' className='rounded-md bg-red-950/50 p-3 text-sm text-red-200'>
								{errorMessage}
							</p>
						)}
						{successMessage && (
							<p role='status' className='rounded-md bg-emerald-950/50 p-3 text-sm text-emerald-200'>
								{successMessage}
							</p>
						)}

						<footer className='flex justify-end gap-2'>
							<button
								type='button'
								onClick={() => setIsOpen(false)}
								className='rounded-md border border-stone-700 px-4 py-2 text-sm text-stone-300 hover:bg-stone-900'
							>
								{successMessage ? '完成' : '取消'}
							</button>
							{!successMessage && canImport && (
								<button
									type='button'
									onClick={() => void handleImport()}
									disabled={
										isImporting ||
										isLoadingCampaigns ||
										isLoadingCharacters ||
										campaigns.length === 0
									}
									className='rounded-md bg-cyan-800 px-4 py-2 text-sm font-semibold text-cyan-50 hover:bg-cyan-700 disabled:opacity-50'
								>
									{isImporting ? '匯入中…' : '確認匯入'}
								</button>
							)}
						</footer>
					</section>
				</div>
			)}
		</>
	);
}
