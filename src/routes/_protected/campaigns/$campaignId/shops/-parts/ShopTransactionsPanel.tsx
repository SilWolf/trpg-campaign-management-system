import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Clock3, ShoppingBag, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import {
	approveCampaignShopOrder,
	cancelCampaignShopOrder,
	loadCampaignShopOrders,
	purchaseCampaignShopItem,
	rejectCampaignShopOrder,
	requestCampaignShopItem,
} from '@/lib/campaignShops';
import { supabase } from '@/lib/supabase';
import type {
	CampaignShop,
	CampaignShopItem,
	CampaignShopOrder,
	CampaignShopWalletType,
	Character,
	CurrencyType,
} from '@/types';

interface ShopTransactionsPanelProps {
	campaignId: string;
	shop: CampaignShop;
	items: CampaignShopItem[];
	isDm: boolean;
	canManageOrders: boolean;
	userId: string;
}

interface CharacterNameRow {
	id: string;
	name: string;
	user_id: string;
}

interface CharacterWalletRow {
	id: string;
	currencies: Character['currencies'];
	private_currencies: Character['privateCurrencies'];
}

interface CharacterWalletPermissionRow {
	character_id: string;
	public_wallet_access: number | null;
	private_wallet_access: number | null;
}

interface PurchasableCharacter {
	id: string;
	name: string;
	currencies: Character['currencies'];
	privateCurrencies: Character['privateCurrencies'];
	canUsePublicWallet: boolean;
	canUsePrivateWallet: boolean;
}

const COIN_VALUES_CP: Record<CurrencyType, number> = {
	pp: 1000,
	gp: 100,
	ep: 50,
	sp: 10,
	cp: 1,
};

const ORDER_STATUS_LABELS: Record<CampaignShopOrder['status'], string> = {
	completed: '已完成',
	pending: '待審查',
	rejected: '已拒絕',
	cancelled: '已取消',
};

const PANEL_CLASS = 'rounded-lg border border-stone-800 bg-stone-900/60 p-4';

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error) return error.message;
	if (
		typeof error === 'object' &&
		error !== null &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}
	return fallback;
}

function getWalletTotalCp(wallet: Character['currencies']): number {
	return (Object.keys(COIN_VALUES_CP) as CurrencyType[]).reduce(
		(total, coin) => total + Number(wallet?.[coin] ?? 0) * COIN_VALUES_CP[coin],
		0,
	);
}

function formatGpFromCp(totalCp: number): string {
	return (totalCp / 100).toLocaleString('zh-TW', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	});
}

function formatDate(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: date.toLocaleString('zh-TW', { hour12: false });
}

export function ShopTransactionsPanel({
	campaignId,
	shop,
	items,
	isDm,
	canManageOrders,
	userId,
}: ShopTransactionsPanelProps) {
	const [characters, setCharacters] = useState<PurchasableCharacter[]>([]);
	const [characterNames, setCharacterNames] = useState<Map<string, string>>(
		() => new Map(),
	);
	const [characterOwners, setCharacterOwners] = useState<Map<string, string>>(
		() => new Map(),
	);
	const [orders, setOrders] = useState<CampaignShopOrder[]>([]);
	const [selectedCharacterId, setSelectedCharacterId] = useState('');
	const [selectedItemId, setSelectedItemId] = useState('');
	const [walletType, setWalletType] =
		useState<CampaignShopWalletType>('public');
	const [quantity, setQuantity] = useState('1');
	const [isLoading, setIsLoading] = useState(true);
	const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
	const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const activeItems = useMemo(
		() => items.filter((item) => item.isActive && item.stockAvailable > 0),
		[items],
	);
	const selectedItem =
		activeItems.find((item) => item.id === selectedItemId) ?? null;
	const selectedCharacter =
		characters.find((character) => character.id === selectedCharacterId) ??
		null;
	const availableWallets = [
		...(selectedCharacter?.canUsePublicWallet ? (['public'] as const) : []),
		...(selectedCharacter?.canUsePrivateWallet ? (['private'] as const) : []),
	];
	const effectiveWalletType = availableWallets.includes(walletType)
		? walletType
		: (availableWallets[0] ?? 'public');
	const walletAllowed =
		effectiveWalletType === 'public'
			? selectedCharacter?.canUsePublicWallet
			: selectedCharacter?.canUsePrivateWallet;
	const parsedQuantity = Number(quantity);
	const isValidQuantity =
		Number.isSafeInteger(parsedQuantity) &&
		parsedQuantity > 0 &&
		parsedQuantity <= 2_147_483_647 &&
		(!selectedItem || parsedQuantity <= selectedItem.stockAvailable);
	const walletBalanceCp = selectedCharacter
		? getWalletTotalCp(
				effectiveWalletType === 'public'
					? selectedCharacter.currencies
					: selectedCharacter.privateCurrencies,
			)
		: 0;
	const totalPriceGp = selectedItem
		? selectedItem.unitPriceGp * (isValidQuantity ? parsedQuantity : 0)
		: 0;
	const totalPriceCp = Math.round(totalPriceGp * 100);

	const reloadCharacters = useCallback(async () => {
		const client = supabase;
		if (!client) throw new Error('無法連線商店服務，請確認登入狀態。');
		const { data: characterRows, error: characterError } = await client
			.from('characters')
			.select('id,name,user_id')
			.eq('campaign_id', campaignId);
		if (characterError) throw characterError;

		const rows = (characterRows ?? []) as CharacterNameRow[];
		const names = new Map(rows.map((row) => [row.id, row.name]));
		setCharacterNames(names);
		setCharacterOwners(new Map(rows.map((row) => [row.id, row.user_id])));
		const eligibleRows = isDm
			? rows
			: rows.filter((row) => row.user_id === userId);
		if (eligibleRows.length === 0) {
			setCharacters([]);
			return;
		}

		let permissions: CharacterWalletPermissionRow[] = [];
		if (!isDm) {
			const { data: permissionRows, error: permissionError } = await client
				.from('character_permissions')
				.select('character_id,public_wallet_access,private_wallet_access')
				.eq('campaign_id', campaignId)
				.eq('user_id', userId)
				.in(
					'character_id',
					eligibleRows.map((row) => row.id),
				);
			if (permissionError) throw permissionError;
			permissions = (permissionRows ?? []) as CharacterWalletPermissionRow[];
		}

		const permittedRows = eligibleRows.filter((row) => {
			if (isDm) return true;
			const permission = permissions.find(
				(candidate) => candidate.character_id === row.id,
			);
			return permission
				? permission.public_wallet_access === 2 ||
						permission.private_wallet_access === 2
				: true;
		});
		if (permittedRows.length === 0) {
			setCharacters([]);
			return;
		}

		const { data: walletRows, error: walletError } = await client
			.from('characters')
			.select('id,currencies,private_currencies')
			.eq('campaign_id', campaignId)
			.in(
				'id',
				permittedRows.map((row) => row.id),
			);
		if (walletError) throw walletError;
		const wallets = new Map(
			((walletRows ?? []) as CharacterWalletRow[]).map((row) => [row.id, row]),
		);
		const nextCharacters = permittedRows.flatMap((row) => {
			const wallet = wallets.get(row.id);
			if (!wallet) return [];
			const permission = permissions.find(
				(candidate) => candidate.character_id === row.id,
			);
			return [
				{
					id: row.id,
					name: row.name,
					currencies: wallet.currencies,
					privateCurrencies: wallet.private_currencies,
					canUsePublicWallet:
						isDm ||
						(permission
							? permission.public_wallet_access === 2
							: row.user_id === userId),
					canUsePrivateWallet:
						isDm ||
						(permission
							? permission.private_wallet_access === 2
							: row.user_id === userId),
				},
			];
		});
		setCharacters(nextCharacters);
		setSelectedCharacterId((current) =>
			nextCharacters.some((character) => character.id === current)
				? current
				: (nextCharacters[0]?.id ?? ''),
		);
	}, [campaignId, isDm, userId]);

	const reloadOrders = useCallback(async () => {
		setOrders(await loadCampaignShopOrders(campaignId));
	}, [campaignId]);

	const reload = useCallback(async () => {
		await Promise.all([reloadCharacters(), reloadOrders()]);
	}, [reloadCharacters, reloadOrders]);

	useEffect(() => {
		let isMounted = true;
		Promise.resolve()
			.then(reload)
			.catch((error: unknown) => {
				if (isMounted) {
					setErrorMessage(getErrorMessage(error, '載入購物資料失敗。'));
				}
			})
			.finally(() => {
				if (isMounted) setIsLoading(false);
			});
		return () => {
			isMounted = false;
		};
	}, [reload]);

	useEffect(() => {
		if (!supabase) return;
		const channel = supabase
			.channel(`campaign-shop-orders-${campaignId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'campaign_shop_orders',
					filter: `campaign_id=eq.${campaignId}`,
				},
				() => {
					void reloadOrders().catch((error: unknown) =>
						setErrorMessage(getErrorMessage(error, '同步訂單紀錄失敗。')),
					);
				},
			)
			.subscribe();
		return () => {
			void supabase?.removeChannel(channel);
		};
	}, [campaignId, reloadOrders]);

	const runOrderAction = async (
		orderId: string,
		action: () => Promise<string>,
		successMessage: string,
	) => {
		setBusyOrderId(orderId);
		setErrorMessage(null);
		setNotice(null);
		try {
			await action();
			await reloadOrders();
			setNotice(successMessage);
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '處理購買請求失敗。'));
		} finally {
			setBusyOrderId(null);
		}
	};

	const handlePurchase = async () => {
		if (
			!selectedItem ||
			!selectedCharacter ||
			!walletAllowed ||
			!shop.isActive ||
			!isValidQuantity
		) {
			return;
		}
		if (!selectedItem.requiresApproval && walletBalanceCp < totalPriceCp) {
			setErrorMessage('所選錢包餘額不足，請調整付款錢包或購買數量。');
			return;
		}
		setIsSubmittingPurchase(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			const details = {
				campaignId,
				shopItemId: selectedItem.id,
				characterId: selectedCharacter.id,
				walletType: effectiveWalletType,
				quantity: parsedQuantity,
			};
			if (selectedItem.requiresApproval) {
				await requestCampaignShopItem(details);
				setNotice('購買請求已送出；核准前不會扣款，商品庫存已保留。');
			} else {
				await purchaseCampaignShopItem(details);
				setNotice('購買完成，商品已加入角色公開背包。');
			}
			await reload();
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '送出購買失敗，請稍後重試。'));
		} finally {
			setIsSubmittingPurchase(false);
		}
	};

	return (
		<section className='space-y-6' data-testid='shop-transactions-panel'>
			{errorMessage && (
				<div
					role='alert'
					className='flex items-start gap-2 rounded-md border border-red-800/70 bg-red-950/40 p-3 text-sm text-red-200'
				>
					<AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
					<span>{errorMessage}</span>
				</div>
			)}
			{notice && (
				<div
					role='status'
					className='rounded-md border border-emerald-800/70 bg-emerald-950/30 p-3 text-sm text-emerald-200'
				>
					{notice}
				</div>
			)}

			<div className={PANEL_CLASS}>
				<div className='mb-4 flex items-center gap-2'>
					<ShoppingBag className='h-5 w-5 text-amber-400' />
					<div>
						<h2 className='font-serif text-xl font-bold text-amber-100'>
							購買商品
						</h2>
						<p className='mt-1 text-xs text-stone-500'>
							只會使用你選取的錢包；交易由伺服器驗證並原子處理。
						</p>
					</div>
				</div>

				{isLoading ? (
					<p className='py-4 text-sm text-stone-400'>載入角色與訂單中…</p>
				) : (
					<div className='grid gap-3 sm:grid-cols-2'>
						<label className='text-sm text-stone-300'>
							購物角色
							<select
								aria-label='購物角色'
								value={selectedCharacterId}
								onChange={(event) => setSelectedCharacterId(event.target.value)}
								className='mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100'
							>
								<option value=''>選擇角色</option>
								{characters.map((character) => (
									<option key={character.id} value={character.id}>
										{character.name}
									</option>
								))}
							</select>
						</label>
						<label className='text-sm text-stone-300'>
							購買商品
							<select
								aria-label='購買商品'
								value={selectedItemId}
								onChange={(event) => setSelectedItemId(event.target.value)}
								className='mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100'
							>
								<option value=''>選擇商品</option>
								{activeItems.map((item) => (
									<option key={item.id} value={item.id}>
										{item.itemSnapshot.name}・{item.unitPriceGp} gp・庫存{' '}
										{item.stockAvailable}
										{item.requiresApproval ? '・需審查' : ''}
									</option>
								))}
							</select>
						</label>
						<label className='text-sm text-stone-300'>
							付款錢包
							<select
								aria-label='付款錢包'
								value={effectiveWalletType}
								onChange={(event) =>
									setWalletType(event.target.value as CampaignShopWalletType)
								}
								disabled={!selectedCharacter || availableWallets.length === 0}
								className='mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 disabled:opacity-50'
							>
								{availableWallets.length === 0 ? (
									<option value='public'>沒有可修改的錢包</option>
								) : (
									availableWallets.map((wallet) => (
										<option key={wallet} value={wallet}>
											{wallet === 'public' ? '公開錢包' : '私人暗袋錢包'}・餘額{' '}
											{formatGpFromCp(
												getWalletTotalCp(
													wallet === 'public'
														? selectedCharacter!.currencies
														: selectedCharacter!.privateCurrencies,
												),
											)}{' '}
											gp
										</option>
									))
								)}
							</select>
						</label>
						<label className='text-sm text-stone-300'>
							購買數量
							<Input
								aria-label='購買數量'
								type='number'
								min={1}
								max={selectedItem?.stockAvailable}
								step={1}
								value={quantity}
								onChange={(event) => setQuantity(event.target.value)}
								className='mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100'
							/>
						</label>
						<div className='flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-800 bg-stone-950/60 p-3 sm:col-span-2'>
							<div>
								<p className='text-xs text-stone-500'>應付總額</p>
								<p className='font-mono text-lg text-amber-300'>
									{formatGpFromCp(totalPriceCp)} gp
								</p>
							</div>
							{selectedItem?.requiresApproval && (
								<p className='flex items-center gap-1.5 text-xs text-purple-300'>
									<Clock3 className='h-4 w-4' />
									送出後保留庫存，DM 核准前不扣款
								</p>
							)}
							<Button
								type='button'
								disabled={
									isSubmittingPurchase ||
									!shop.isActive ||
									!selectedCharacter ||
									!selectedItem ||
									!walletAllowed ||
									!isValidQuantity ||
									availableWallets.length === 0
								}
								onClick={() => void handlePurchase()}
								className='border border-amber-700/60 bg-amber-900 text-amber-100'
							>
								<ShoppingBag className='h-4 w-4' />
								{selectedItem?.requiresApproval ? '送出審查請求' : '確認購買'}
							</Button>
						</div>
						{characters.length === 0 && (
							<p className='text-sm text-amber-200 sm:col-span-2'>
								找不到可用角色或具有修改權（2）的錢包；請確認角色與 ACL 設定。
							</p>
						)}
						{selectedItem && !isValidQuantity && (
							<p className='text-sm text-red-300 sm:col-span-2'>
								購買數量須為正整數，且不可超過可用庫存。
							</p>
						)}
					</div>
				)}
			</div>

			<div className={PANEL_CLASS}>
				<div className='mb-4 flex items-center justify-between'>
					<div>
						<h2 className='font-serif text-xl font-bold text-amber-100'>
							公開購買紀錄
						</h2>
						<p className='mt-1 text-xs text-stone-500'>
							戰役成員可見；不顯示付款錢包種類或餘額。
						</p>
					</div>
					<span className='font-mono text-xs text-stone-500'>
						{orders.length} 筆
					</span>
				</div>
				{orders.length === 0 ? (
					<p className='rounded-md border border-dashed border-stone-700 p-6 text-center text-sm text-stone-500'>
						目前沒有購買紀錄。
					</p>
				) : (
					<div className='space-y-2'>
						{orders.map((order) => {
							const isPendingApproval =
								order.status === 'pending' && order.requiresApproval;
							const canCancel =
								isPendingApproval &&
								characterOwners.get(order.characterId) === userId;
							return (
								<article
									key={order.id}
									className='rounded-md border border-stone-800 bg-stone-950/60 p-3'
									data-testid='shop-order-row'
								>
									<div className='flex flex-wrap items-start justify-between gap-3'>
										<div className='min-w-0'>
											<p className='font-serif font-bold text-stone-100'>
												{order.itemSnapshot.name}
											</p>
											<p className='mt-1 text-xs text-stone-400'>
												{characterNames.get(order.characterId) ?? '未知角色'}・
												{order.shopNameSnapshot}・數量 {order.quantity}・
												<span className='font-mono text-amber-300'>
													{order.totalPriceGp} gp
												</span>
											</p>
											<p className='mt-1 text-[11px] text-stone-500'>
												{formatDate(order.createdAt)}
											</p>
										</div>
										<span
											className={`rounded-full border px-2 py-1 text-xs ${
												order.status === 'completed'
													? 'border-emerald-800 text-emerald-300'
													: order.status === 'pending'
														? 'border-purple-800 text-purple-300'
														: 'border-stone-700 text-stone-400'
											}`}
										>
											{ORDER_STATUS_LABELS[order.status]}
										</span>
									</div>
									{canManageOrders && isPendingApproval && (
										<div className='mt-3 flex justify-end gap-2'>
											<Button
												type='button'
												variant='secondary'
												disabled={busyOrderId === order.id}
												onClick={() =>
													void runOrderAction(
														order.id,
														() => rejectCampaignShopOrder(order.id),
														'已拒絕請求並釋放保留庫存。',
													)
												}
												className='border border-red-900/70 bg-red-950/40 text-red-200'
											>
												<X className='h-4 w-4' />
												拒絕
											</Button>
											<Button
												type='button'
												disabled={busyOrderId === order.id}
												onClick={() =>
													void runOrderAction(
														order.id,
														() => approveCampaignShopOrder(order.id),
														'請求已核准，已扣款並交付商品。',
													)
												}
												className='border border-emerald-800 bg-emerald-950/60 text-emerald-200'
											>
												<Check className='h-4 w-4' />
												核准
											</Button>
										</div>
									)}
									{canCancel && (
										<div className='mt-3 flex justify-end'>
											<Button
												type='button'
												variant='secondary'
												disabled={busyOrderId === order.id}
												onClick={() =>
													void runOrderAction(
														order.id,
														() => cancelCampaignShopOrder(order.id),
														'已取消請求並釋放保留庫存。',
													)
												}
												className='border border-stone-700 bg-stone-900 text-stone-300'
											>
												<X className='h-4 w-4' />
												取消請求
											</Button>
										</div>
									)}
								</article>
							);
						})}
					</div>
				)}
			</div>
		</section>
	);
}
