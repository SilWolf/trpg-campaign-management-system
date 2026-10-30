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
	subscribeCampaignSecureChanges,
} from '@/lib/campaignShops';
import { supabase, type DbCharacterWallet } from '@/lib/supabase';
import type {
	CampaignShop,
	CampaignShopItem,
	CampaignShopOrder,
	CampaignShopWalletType,
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

interface CharacterWalletPermissionRow {
	character_id: string;
	public_wallet_access: number | null;
	private_wallet_access: number | null;
}

interface PurchasableCharacter {
	id: string;
	name: string;
	gpCents: number;
	privateGpCents: number;
	canUsePublicWallet: boolean;
	canUsePrivateWallet: boolean;
}

const ORDER_STATUS_LABELS: Record<CampaignShopOrder['status'], string> = {
	completed: '已完成',
	pending: '待審查',
	rejected: '已拒絕',
	cancelled: '已取消',
};

const PANEL_CLASS = 'rounded-lg border border-border bg-card/60 p-4';

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

function gpToCents(value: number | string): number {
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
	if (!match) {
		throw new Error('商店 GP 金額必須是非負且最多兩位小數的數值。');
	}
	const cents =
		Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || 0);
	if (!Number.isSafeInteger(cents)) {
		throw new Error('商店 GP 金額超出可計算範圍。');
	}
	return cents;
}

function formatGpFromCents(cents: number | bigint): string {
	const amount = typeof cents === 'bigint' ? cents : BigInt(cents);
	const whole = (amount / 100n).toLocaleString('zh-TW');
	const remainder = amount % 100n;
	const fractional =
		remainder === 0n
			? ''
			: remainder.toString().padStart(2, '0').replace(/0$/, '');
	return fractional ? `${whole}.${fractional}` : whole;
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
	const walletBalanceCents = selectedCharacter
		? effectiveWalletType === 'public'
			? selectedCharacter.gpCents
			: selectedCharacter.privateGpCents
		: 0;
	const totalPriceCents = selectedItem
		? BigInt(gpToCents(selectedItem.unitPriceGp)) *
			BigInt(isValidQuantity ? parsedQuantity : 0)
		: 0n;
	const purchasableCartItems = (cartItems ?? []).filter(
		({ quantity: lineQuantity }) => lineQuantity > 0,
	);
	const cartTotalCents = purchasableCartItems.reduce(
		(total, entry) =>
			total +
			BigInt(gpToCents(entry.item.unitPriceGp)) * BigInt(entry.quantity),
		0n,
	);
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
		);
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

		const { data: walletRows, error: walletError } = await client.rpc(
			'get_campaign_character_wallets',
			{
				p_campaign_id: campaignId,
				p_character_ids: permittedRows.map((row) => row.id),
			},
		);
		if (walletError) throw walletError;
		if (!Array.isArray(walletRows)) {
			throw new Error('商店錢包服務回傳了無效資料。');
		}
		const walletsByCharacter = new Map<string, DbCharacterWallet[]>();
		for (const wallet of walletRows as DbCharacterWallet[]) {
			if (
				!wallet ||
				typeof wallet.character_id !== 'string' ||
				(wallet.wallet_type !== 'public' && wallet.wallet_type !== 'private') ||
				(typeof wallet.balance_gp !== 'string' &&
					typeof wallet.balance_gp !== 'number')
			) {
				throw new Error('商店錢包服務回傳了無效資料。');
			}
			const wallets = walletsByCharacter.get(wallet.character_id) ?? [];
			wallets.push(wallet);
			walletsByCharacter.set(wallet.character_id, wallets);
		}
		const nextCharacters = permittedRows.flatMap((row) => {
			const wallets = walletsByCharacter.get(row.id) ?? [];
			const publicWallet = wallets.find(
				(wallet) => wallet.wallet_type === 'public',
			);
			const privateWallet = wallets.find(
				(wallet) => wallet.wallet_type === 'private',
			);
			if (!publicWallet && !privateWallet) return [];
			const permission = permissions.find(
				(candidate) => candidate.character_id === row.id,
			);
			return [
				{
					id: row.id,
					name: row.name,
					gpCents: publicWallet ? gpToCents(publicWallet.balance_gp) : 0,
					privateGpCents: privateWallet
						? gpToCents(privateWallet.balance_gp)
						: 0,
					canUsePublicWallet:
						Boolean(publicWallet) &&
						(isDm ||
						(permission
							? permission.public_wallet_access === 2
							: row.user_id === userId)),
					canUsePrivateWallet:
						Boolean(privateWallet) &&
						(isDm ||
						(permission
							? permission.private_wallet_access === 2
							: row.user_id === userId)),
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
		const channel = subscribeCampaignSecureChanges(
			campaignId,
			() => {
				void reloadOrders().catch((error: unknown) =>
					setErrorMessage(getErrorMessage(error, '同步訂單紀錄失敗。')),
				);
			},
			(error) => setErrorMessage(getErrorMessage(error, '安全同步頻道連線失敗。')),
		);
		return () => {
			channel();
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
		if (
			!selectedItem.requiresApproval &&
			BigInt(walletBalanceCents) < totalPriceCents
		) {
			setErrorMessage('所選錢包餘額不足，請調整付款錢包或購買數量。');
			return;
		}
		setIsSubmittingPurchase(true);
		setErrorMessage(null);
		try {
			const details = {
				campaignId,
				shopId: shop.id,
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
		if (
			!cartHasApproval &&
			BigInt(walletBalanceCents) < cartTotalCents
		) {
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
					className='flex items-start gap-2 rounded-md border border-destructive/70 bg-destructive/40 p-3 text-sm text-destructive-foreground'
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
					className='m-auto max-h-[90vh] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-lg border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-background/70'
					data-testid='shop-checkout-dialog'
				>
					<div className='space-y-5 p-5'>
						<div className='flex items-start justify-between gap-4 border-b border-border pb-4'>
							<div>
								<p className='text-xs font-semibold tracking-[0.18em] text-muted-foreground'>
									確認交易
								</p>
								<h2
									id='shop-checkout-title'
									className='mt-1 font-serif text-2xl font-bold text-foreground'
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
								prefixIcon={<X />}
							>
							</Button>
						</div>

						{errorMessage && (
							<div
								role='alert'
								className='rounded-md border border-destructive/70 bg-destructive/40 p-3 text-sm text-destructive-foreground'
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
									!isDm && !item.isIdentified;
								return (
								<div
									key={item.id}
									data-testid={`shop-checkout-item-${item.id}`}
									className={`flex items-start justify-between gap-4 rounded-md border p-3 ${
										item.requiresApproval
											? 'border-primary/70 bg-primary/30'
											: 'border-border bg-card/60'
									}`}
								>
									<div className='flex min-w-0 items-start gap-3'>
										<div
											className='relative h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-background'
											data-testid={`shop-checkout-item-icon-${item.id}`}
										>
											{isMasked ? (
												<HelpCircle className='h-6 w-6 text-muted-foreground' />
											) : (
												<ItemIcon
													iconName={item.itemSnapshot.icon}
													className='h-6 w-6 text-foreground'
													imageSize='512'
												/>
											)}
										</div>
										<div className='min-w-0'>
											<p className='font-serif font-bold text-foreground'>
												{displayName}
											</p>
											<p className='mt-1 text-xs text-muted-foreground'>
												單價{' '}
												<span className='font-mono'>
													{formatGpFromCents(
														gpToCents(item.unitPriceGp),
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
													prefixIcon={<Minus />}
												>
												</Button>
												<span
													className='min-w-6 text-center font-mono text-sm text-foreground'
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
													prefixIcon={<Plus />}
												>
												</Button>
												<span className='text-xs text-muted-foreground'>
													庫存 {item.stockAvailable}
												</span>
											</div>
											{item.requiresApproval && (
												<p className='mt-2 rounded bg-primary/50 px-2 py-1 text-xs font-semibold text-primary-foreground'>
													注意：此商品需要 DM 審查，整筆交易將等待核准。
												</p>
											)}
										</div>
									</div>
									<p className='shrink-0 font-mono text-primary-foreground'>
										{formatGpFromCents(
											BigInt(gpToCents(item.unitPriceGp)) *
												BigInt(lineQuantity),
										)}{' '}
										gp
									</p>
								</div>
								);
							})}
						</div>

						<div className='grid gap-3 sm:grid-cols-2'>
							<label className='text-sm text-foreground'>
								結帳角色
								<select
									aria-label='結帳角色'
									value={selectedCharacterId}
									onChange={(event) =>
										setSelectedCharacterId(event.target.value)
									}
									className='mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'
								>
									<option value=''>選擇角色</option>
									{characters.map((character) => (
										<option key={character.id} value={character.id}>
											{character.name}
										</option>
									))}
								</select>
							</label>
							<label className='text-sm text-foreground'>
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
									className='mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50'
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
												{formatGpFromCents(
													wallet === 'public'
														? selectedCharacter!.gpCents
														: selectedCharacter!.privateGpCents,
												)}{' '}
												gp
											</option>
										))
									)}
								</select>
							</label>
						</div>

						{characters.length === 0 && (
							<p className='text-sm text-primary-foreground'>
								找不到可用角色或具有修改權（2）的錢包；請確認角色與 ACL 設定。
							</p>
						)}
						{purchasableCartItems.some(
							({ item, quantity: lineQuantity }) =>
								lineQuantity > item.stockAvailable || !item.isActive,
						) && (
							<p role='alert' className='text-sm text-destructive-foreground'>
								購物車中有商品庫存不足或已停用，請返回目錄調整數量。
							</p>
						)}

						<div className='flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4'>
							<div>
								<p className='text-xs text-muted-foreground'>
									{cartHasApproval ? '待審交易總額' : '應付總額'}
								</p>
								<p className='font-mono text-xl text-primary-foreground'>
									{formatGpFromCents(cartTotalCents)} gp
								</p>
								{cartHasApproval && (
									<p className='mt-1 text-xs text-primary-foreground'>
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
									(!cartHasApproval &&
										BigInt(walletBalanceCents) < cartTotalCents)
								}
								onClick={() => void handleCartCheckout()}
								data-testid='shop-checkout-confirm'
								prefixIcon={<ShoppingBag />}
							>
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
					<ShoppingBag className='h-5 w-5 text-primary-foreground' />
					<div>
						<h2 className='font-serif text-xl font-bold text-card-foreground'>
							購買商品
						</h2>
						<p className='mt-1 text-xs text-muted-foreground'>
							只會使用你選取的錢包；交易由伺服器驗證並原子處理。
						</p>
					</div>
				</div>

				{isLoading ? (
					<p className='py-4 text-sm text-muted-foreground'>載入角色與訂單中…</p>
				) : (
					<div className='grid gap-3 sm:grid-cols-2'>
						<label className='text-sm text-foreground'>
							購物角色
							<select
								aria-label='購物角色'
								value={selectedCharacterId}
								onChange={(event) => setSelectedCharacterId(event.target.value)}
								className='mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'
							>
								<option value=''>選擇角色</option>
								{characters.map((character) => (
									<option key={character.id} value={character.id}>
										{character.name}
									</option>
								))}
							</select>
						</label>
						<label className='text-sm text-foreground'>
							購買商品
							<select
								aria-label='購買商品'
								value={selectedItemId}
								onChange={(event) => setSelectedItemId(event.target.value)}
								className='mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'
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
						<label className='text-sm text-foreground'>
							付款錢包
							<select
								aria-label='付款錢包'
								value={effectiveWalletType}
								onChange={(event) =>
									setWalletType(event.target.value as CampaignShopWalletType)
								}
								disabled={!selectedCharacter || availableWallets.length === 0}
								className='mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50'
							>
								{availableWallets.length === 0 ? (
									<option value='public'>沒有可修改的錢包</option>
								) : (
									availableWallets.map((wallet) => (
										<option key={wallet} value={wallet}>
											{wallet === 'public' ? '公開錢包' : '私人暗袋錢包'}・餘額{' '}
											{formatGpFromCents(
												wallet === 'public'
													? selectedCharacter!.gpCents
													: selectedCharacter!.privateGpCents,
											)}{' '}
											gp
										</option>
									))
								)}
							</select>
						</label>
						<label className='text-sm text-foreground'>
							購買數量
							<Input
								aria-label='購買數量'
								type='number'
								min={1}
								max={selectedItem?.stockAvailable}
								step={1}
								value={quantity}
								onChange={(event) => setQuantity(event.target.value)}
								className='mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground'
							/>
						</label>
						<div className='flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/60 p-3 sm:col-span-2'>
							<div>
								<p className='text-xs text-muted-foreground'>應付總額</p>
								<p className='font-mono text-lg text-primary-foreground'>
									{formatGpFromCents(totalPriceCents)} gp
								</p>
							</div>
							{selectedItem?.requiresApproval && (
								<p className='flex items-center gap-1.5 text-xs text-foreground'>
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
								prefixIcon={<ShoppingBag />}
							>
								{selectedItem?.requiresApproval ? '送出審查請求' : '確認購買'}
							</Button>
						</div>
						{characters.length === 0 && (
							<p className='text-sm text-primary-foreground sm:col-span-2'>
								找不到可用角色或具有修改權（2）的錢包；請確認角色與 ACL 設定。
							</p>
						)}
						{selectedItem && !isValidQuantity && (
							<p className='text-sm text-destructive-foreground sm:col-span-2'>
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
						<h2 className='font-serif text-xl font-bold text-card-foreground'>
							{showPublicHistory ? '公開購買紀錄' : '待審核購買請求'}
						</h2>
						<p className='mt-1 text-xs text-muted-foreground'>
							{showPublicHistory
								? '戰役成員可見；不顯示付款錢包種類或餘額。'
								: '僅顯示待 DM 核准的購買請求。'}
						</p>
					</div>
					<span className='font-mono text-xs text-muted-foreground'>
						{orderGroups.length} 筆
					</span>
				</div>
				{orderGroups.length === 0 ? (
					<p className='rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground'>
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
									className='rounded-md border border-border bg-background/60 p-3'
									data-testid='shop-order-row'
								>
									<div className='flex flex-wrap items-start justify-between gap-3'>
										<div className='min-w-0'>
											{showPublicHistory ? (
												<p
													className='font-serif font-bold text-foreground'
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
															className='font-serif font-bold text-foreground'
														>
															{getItemDisplayName(entry.itemSnapshot, isDm)}
														</p>
													))}
												</div>
											)}
											<p className='mt-1 text-xs text-muted-foreground'>
												{characterNames.get(order.characterId) ?? '未知角色'}・
												{order.shopNameSnapshot}・共 {quantity} 件・
												<span className='font-mono text-primary-foreground'>
													{groupTotalGp} gp
												</span>
											</p>
											<p className='mt-1 text-[11px] text-muted-foreground'>
												{formatDate(order.createdAt)}
											</p>
										</div>
										<span
											className={`rounded-full border px-2 py-1 text-xs ${
												order.status === 'completed'
													? 'border-border text-foreground'
													: order.status === 'pending'
														? 'border-border text-foreground'
														: 'border-border text-muted-foreground'
											}`}
										>
											{ORDER_STATUS_LABELS[order.status]}
										</span>
									</div>
									{canManageOrders && isPendingApproval && (
										<div className='mt-3 flex justify-end gap-2'>
											<Button
												type='button'
												variant='secondary-dm'
												disabled={busyOrderId === order.id}
												onClick={() =>
													void runOrderAction(
														order.id,
														() => rejectCampaignShopOrder(order.id),
														'已拒絕整筆請求並釋放保留庫存。',
													)
												}
												prefixIcon={<X />}
											>
												拒絕
											</Button>
											<Button
												type='button'
												variant='primary-dm'
												disabled={busyOrderId === order.id}
												onClick={() =>
													void runOrderAction(
														order.id,
														() => approveCampaignShopOrder(order.id),
														'整筆請求已核准，已扣款並交付商品。',
													)
												}
												prefixIcon={<Check />}
											>
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
												prefixIcon={<X />}
											>
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
