import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	AlertCircle,
	Check,
	Clock3,
	HelpCircle,
	Minus,
	Plus,
	ShoppingBag,
	X,
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/contexts/FeedbackContext';
import {
	approveCampaignShopOrder,
	cancelCampaignShopOrder,
	checkoutCampaignShopCart,
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
import ItemIcon from '../../-parts/ItemIcon';

interface ShopTransactionsPanelProps {
	campaignId: string;
	shop: CampaignShop;
	items: CampaignShopItem[];
	isDm: boolean;
	canManageOrders: boolean;
	userId: string;
	showPurchaseForm?: boolean;
	showPublicHistory?: boolean;
	cartItems?: { item: CampaignShopItem; quantity: number }[];
	checkoutOpen?: boolean;
	onCheckoutOpenChange?: (open: boolean) => void;
	onCartQuantityChange?: (itemId: string, quantity: number) => void;
	onCheckoutComplete?: () => void;
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

function getItemDisplayName(
	itemSnapshot: CampaignShopOrder['itemSnapshot'],
	isDm: boolean,
): string {
	return !isDm && itemSnapshot.isIdentified === false
		? '未鑑定的物品'
		: itemSnapshot.name;
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
	showPurchaseForm = true,
	showPublicHistory = true,
	cartItems,
	checkoutOpen = false,
	onCheckoutOpenChange,
	onCartQuantityChange,
	onCheckoutComplete,
}: ShopTransactionsPanelProps) {
	const toast = useToast();
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
	const checkoutDialogRef = useRef<HTMLDialogElement>(null);

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
	const purchasableCartItems = (cartItems ?? []).filter(
		({ quantity: lineQuantity }) => lineQuantity > 0,
	);
	const cartTotalGp = purchasableCartItems.reduce(
		(total, entry) => total + entry.item.unitPriceGp * entry.quantity,
		0,
	);
	const cartTotalCp = Math.round(cartTotalGp * 100);
	const cartHasApproval = purchasableCartItems.some(
		(entry) => entry.item.requiresApproval,
	);
	const cartIsValid =
		purchasableCartItems.length > 0 &&
		purchasableCartItems.every(
			({ item, quantity: lineQuantity }) =>
				item.isActive &&
				Number.isSafeInteger(lineQuantity) &&
				lineQuantity >= 1 &&
				lineQuantity <= item.stockAvailable,
		) &&
		Number.isSafeInteger(cartTotalCp);
	const displayedOrders = showPublicHistory
		? orders
		: orders.filter(
				(order) =>
					canManageOrders &&
					order.status === 'pending' &&
					order.requiresApproval,
			);
	const orderGroups = useMemo(() => {
		const groups = new Map<string, CampaignShopOrder[]>();
		for (const order of displayedOrders) {
			const groupId = order.checkoutId ?? order.id;
			const group = groups.get(groupId) ?? [];
			group.push(order);
			groups.set(groupId, group);
		}
		return [...groups.entries()].map(([id, groupOrders]) => ({
			id,
			orders: groupOrders,
		}));
	}, [displayedOrders]);

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

	useEffect(() => {
		const dialog = checkoutDialogRef.current;
		if (!dialog) return;
		if (checkoutOpen && !dialog.open) dialog.showModal();
		if (!checkoutOpen && dialog.open) dialog.close();
	}, [checkoutOpen]);

	const runOrderAction = async (
		orderId: string,
		action: () => Promise<string>,
		successMessage: string,
	) => {
		setBusyOrderId(orderId);
		setErrorMessage(null);
		try {
			await action();
			toast.success(successMessage);
			try {
				await reloadOrders();
			} catch (error) {
				toast.error(
					`操作已完成，但無法重新載入最新紀錄：${getErrorMessage(
						error,
						'同步訂單資料失敗。',
					)}`,
				);
			}
		} catch (error) {
			toast.error(getErrorMessage(error, '處理購買請求失敗。'));
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
				toast.success('購買請求已送出；核准前不會扣款，商品庫存已保留。');
			} else {
				await purchaseCampaignShopItem(details);
				toast.success('購買完成，商品已加入角色公開背包。');
			}
			try {
				await reload();
			} catch (error) {
				toast.error(
					`交易已成立，但無法重新載入最新紀錄：${getErrorMessage(
						error,
						'同步購物資料失敗。',
					)}`,
				);
			}
		} catch (error) {
			toast.error(getErrorMessage(error, '送出購買失敗，請稍後重試。'));
		} finally {
			setIsSubmittingPurchase(false);
		}
	};

	const handleCartCheckout = async () => {
		if (
			!cartItems ||
			purchasableCartItems.length === 0 ||
			!cartIsValid ||
			!selectedCharacter ||
			!walletAllowed ||
			!shop.isActive
		) {
			return;
		}
		if (!cartHasApproval && walletBalanceCp < cartTotalCp) {
			setErrorMessage('所選錢包餘額不足，請調整付款錢包或購物車內容。');
			return;
		}
		setIsSubmittingPurchase(true);
		setErrorMessage(null);
		try {
			await checkoutCampaignShopCart({
				campaignId,
				shopId: shop.id,
				characterId: selectedCharacter.id,
				walletType: effectiveWalletType,
				items: purchasableCartItems.map(({ item, quantity: lineQuantity }) => ({
					shopItemId: item.id,
					quantity: lineQuantity,
				})),
			});
			onCheckoutComplete?.();
			onCheckoutOpenChange?.(false);
			toast.success(
				cartHasApproval
					? '購買請求已送出；整筆交易待 DM 審查，核准前不會扣款。'
					: '結帳完成，商品已加入角色公開背包。',
			);
			try {
				await reload();
			} catch (error) {
				toast.error(
					`交易已成立，但無法重新載入最新紀錄：${getErrorMessage(
						error,
						'同步購物資料失敗。',
					)}`,
				);
			}
		} catch (error) {
			toast.error(getErrorMessage(error, '結帳失敗，請稍後重試。'));
		} finally {
			setIsSubmittingPurchase(false);
		}
	};

	return (
		<section className='space-y-6' data-testid='shop-transactions-panel'>
			{errorMessage && !checkoutOpen && (
				<div
					role='alert'
					className='flex items-start gap-2 rounded-md border border-red-800/70 bg-red-950/40 p-3 text-sm text-red-200'
				>
					<AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
					<span>{errorMessage}</span>
				</div>
			)}
			{cartItems && (
				<dialog
					ref={checkoutDialogRef}
					aria-labelledby='shop-checkout-title'
					onClose={() => onCheckoutOpenChange?.(false)}
					className='m-auto max-h-[90vh] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-lg border border-stone-700 bg-stone-950 p-0 text-stone-100 shadow-2xl backdrop:bg-black/70'
					data-testid='shop-checkout-dialog'
				>
					<div className='space-y-5 p-5'>
						<div className='flex items-start justify-between gap-4 border-b border-stone-800 pb-4'>
							<div>
								<p className='text-xs font-semibold tracking-[0.18em] text-amber-500'>
									確認交易
								</p>
								<h2
									id='shop-checkout-title'
									className='mt-1 font-serif text-2xl font-bold text-amber-100'
								>
									結帳清單
								</h2>
							</div>
							<Button
								type='button'
								variant='ghost'
								size='sm'
								aria-label='關閉結帳視窗'
								onClick={() => onCheckoutOpenChange?.(false)}
								className='text-stone-400'
							>
								<X className='h-4 w-4' />
							</Button>
						</div>

						{errorMessage && (
							<div
								role='alert'
								className='rounded-md border border-red-800/70 bg-red-950/40 p-3 text-sm text-red-200'
							>
								{errorMessage}
							</div>
						)}

						<div className='max-h-64 space-y-2 overflow-y-auto'>
							{cartItems.map(({ item, quantity: lineQuantity }) => {
								const displayName = getItemDisplayName(
									item.itemSnapshot,
									isDm,
								);
								const isMasked =
									!isDm && item.itemSnapshot.isIdentified === false;
								return (
								<div
									key={item.id}
									data-testid={`shop-checkout-item-${item.id}`}
									className={`flex items-start justify-between gap-4 rounded-md border p-3 ${
										item.requiresApproval
											? 'border-amber-700/70 bg-amber-950/30'
											: 'border-stone-800 bg-stone-900/60'
									}`}
								>
									<div className='flex min-w-0 items-start gap-3'>
										<div
											className='relative h-10 w-10 shrink-0 overflow-hidden rounded border border-stone-700 bg-stone-950'
											data-testid={`shop-checkout-item-icon-${item.id}`}
										>
											{isMasked ? (
												<HelpCircle className='h-6 w-6 text-purple-400' />
											) : (
												<ItemIcon
													iconName={item.itemSnapshot.icon}
													className='h-6 w-6 text-stone-300'
												/>
											)}
										</div>
										<div className='min-w-0'>
											<p className='font-serif font-bold text-stone-100'>
												{displayName}
											</p>
											<p className='mt-1 text-xs text-stone-400'>
												單價{' '}
												<span className='font-mono'>
													{formatGpFromCp(
														Math.round(item.unitPriceGp * 100),
													)}{' '}
													gp
												</span>
											</p>
											<div className='mt-2 flex items-center gap-2'>
												<Button
													type='button'
													variant='secondary'
													size='sm'
													aria-label={`減少${displayName}數量`}
													disabled={lineQuantity === 0 || isSubmittingPurchase}
													onClick={() =>
														onCartQuantityChange?.(
															item.id,
															Math.max(0, lineQuantity - 1),
														)
													}
													className='h-7 min-w-7 px-1.5'
												>
													<Minus className='h-3 w-3' />
												</Button>
												<span
													className='min-w-6 text-center font-mono text-sm text-stone-200'
													data-testid={`shop-checkout-quantity-${item.id}`}
												>
													{lineQuantity}
												</span>
												<Button
													type='button'
													variant='secondary'
													size='sm'
													aria-label={`增加${displayName}數量`}
													disabled={
														lineQuantity >= item.stockAvailable ||
														isSubmittingPurchase
													}
													onClick={() =>
														onCartQuantityChange?.(
															item.id,
															Math.min(item.stockAvailable, lineQuantity + 1),
														)
													}
													className='h-7 min-w-7 px-1.5'
												>
													<Plus className='h-3 w-3' />
												</Button>
												<span className='text-xs text-stone-500'>
													庫存 {item.stockAvailable}
												</span>
											</div>
											{item.requiresApproval && (
												<p className='mt-2 rounded bg-amber-900/50 px-2 py-1 text-xs font-semibold text-amber-200'>
													注意：此商品需要 DM 審查，整筆交易將等待核准。
												</p>
											)}
										</div>
									</div>
									<p className='shrink-0 font-mono text-amber-300'>
										{formatGpFromCp(
											Math.round(item.unitPriceGp * lineQuantity * 100),
										)}{' '}
										gp
									</p>
								</div>
								);
							})}
						</div>

						<div className='grid gap-3 sm:grid-cols-2'>
							<label className='text-sm text-stone-300'>
								結帳角色
								<select
									aria-label='結帳角色'
									value={selectedCharacterId}
									onChange={(event) =>
										setSelectedCharacterId(event.target.value)
									}
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
								付款錢包
								<select
									aria-label='結帳錢包'
									value={effectiveWalletType}
									onChange={(event) =>
										setWalletType(
											event.target.value as CampaignShopWalletType,
										)
									}
									disabled={!selectedCharacter || availableWallets.length === 0}
									className='mt-1 w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 disabled:opacity-50'
								>
									{availableWallets.length === 0 ? (
										<option value='public'>沒有可修改的錢包</option>
									) : (
										availableWallets.map((wallet) => (
											<option key={wallet} value={wallet}>
												{wallet === 'public'
													? '公開錢包'
													: '私人暗袋錢包'}
												・餘額{' '}
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
						</div>

						{characters.length === 0 && (
							<p className='text-sm text-amber-200'>
								找不到可用角色或具有修改權（2）的錢包；請確認角色與 ACL 設定。
							</p>
						)}
						{purchasableCartItems.some(
							({ item, quantity: lineQuantity }) =>
								lineQuantity > item.stockAvailable || !item.isActive,
						) && (
							<p role='alert' className='text-sm text-red-300'>
								購物車中有商品庫存不足或已停用，請返回目錄調整數量。
							</p>
						)}

						<div className='flex flex-wrap items-center justify-between gap-4 border-t border-stone-800 pt-4'>
							<div>
								<p className='text-xs text-stone-500'>
									{cartHasApproval ? '待審交易總額' : '應付總額'}
								</p>
								<p className='font-mono text-xl text-amber-300'>
									{formatGpFromCp(cartTotalCp)} gp
								</p>
								{cartHasApproval && (
									<p className='mt-1 text-xs text-amber-300'>
										DM 核准前不扣款，商品庫存會先保留。
									</p>
								)}
							</div>
							<Button
								type='button'
								disabled={
									isSubmittingPurchase ||
									!shop.isActive ||
									!cartIsValid ||
									!selectedCharacter ||
									!walletAllowed ||
									availableWallets.length === 0 ||
									(!cartHasApproval && walletBalanceCp < cartTotalCp)
								}
								onClick={() => void handleCartCheckout()}
								data-testid='shop-checkout-confirm'
								className='border border-amber-700/60 bg-amber-900 text-amber-100'
							>
								<ShoppingBag className='h-4 w-4' />
								{isSubmittingPurchase
									? '處理中…'
									: cartHasApproval
										? '向 DM 申請購買'
										: '結帳'}
							</Button>
						</div>
					</div>
				</dialog>
			)}

			{showPurchaseForm && (
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
										{getItemDisplayName(item.itemSnapshot, isDm)}・
										{item.unitPriceGp} gp・庫存{' '}
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
			)}

			<div className={PANEL_CLASS}>
				<div className='mb-4 flex items-center justify-between'>
					<div>
						<h2 className='font-serif text-xl font-bold text-amber-100'>
							{showPublicHistory ? '公開購買紀錄' : '待審核購買請求'}
						</h2>
						<p className='mt-1 text-xs text-stone-500'>
							{showPublicHistory
								? '戰役成員可見；不顯示付款錢包種類或餘額。'
								: '僅顯示待 DM 核准的購買請求。'}
						</p>
					</div>
					<span className='font-mono text-xs text-stone-500'>
						{orderGroups.length} 筆
					</span>
				</div>
				{orderGroups.length === 0 ? (
					<p className='rounded-md border border-dashed border-stone-700 p-6 text-center text-sm text-stone-500'>
						{showPublicHistory ? '目前沒有購買紀錄。' : '目前沒有待審核請求。'}
					</p>
				) : (
					<div className='space-y-2'>
						{orderGroups.map((group) => {
							const order = group.orders[0];
							if (!order) return null;
							const quantity = group.orders.reduce(
								(total, entry) => total + entry.quantity,
								0,
							);
							const groupTotalGp = group.orders.reduce(
								(total, entry) => total + entry.totalPriceGp,
								0,
							);
							const isPendingApproval = group.orders.every(
								(entry) =>
									entry.status === 'pending' && entry.requiresApproval,
							);
							const canCancel =
								isPendingApproval &&
								characterOwners.get(order.characterId) === userId;
							return (
								<article
									key={group.id}
									className='rounded-md border border-stone-800 bg-stone-950/60 p-3'
									data-testid='shop-order-row'
								>
									<div className='flex flex-wrap items-start justify-between gap-3'>
										<div className='min-w-0'>
											{showPublicHistory ? (
												<p
													className='font-serif font-bold text-stone-100'
													data-testid='shop-order-title'
												>
													{group.orders
														.map(
															(entry) =>
																`${getItemDisplayName(
																	entry.itemSnapshot,
																	isDm,
																)}${entry.quantity === 1 ? '' : `x${entry.quantity}`}`,
														)
														.join(', ')}
												</p>
											) : (
												<div className='space-y-1'>
													{group.orders.map((entry) => (
														<p
															key={entry.id}
															className='font-serif font-bold text-stone-100'
														>
															{getItemDisplayName(entry.itemSnapshot, isDm)}
														</p>
													))}
												</div>
											)}
											<p className='mt-1 text-xs text-stone-400'>
												{characterNames.get(order.characterId) ?? '未知角色'}・
												{order.shopNameSnapshot}・共 {quantity} 件・
												<span className='font-mono text-amber-300'>
													{groupTotalGp} gp
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
														'已拒絕整筆請求並釋放保留庫存。',
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
														'整筆請求已核准，已扣款並交付商品。',
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
														'已取消整筆請求並釋放保留庫存。',
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
