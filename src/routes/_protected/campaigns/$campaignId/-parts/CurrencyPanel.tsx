/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { CAMP_CHEST_ID, type Character, type CurrencyType } from '@/types';
import {
	Coins,
	X,
	Sparkles,
	Send,
	Users,
	Globe,
	Lock,
	ArrowLeftRight,
} from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';

interface CurrencyPanelProps {
	isOpen: boolean;
	activeCharacter: Character;
	characters: Character[];
	initialWalletTab?: 'public' | 'private';
	canReadPublicWallet: boolean;
	canEditPublicWallet: boolean;
	canReadPrivateWallet: boolean;
	canEditPrivateWallet: boolean;
	onClose: () => void;
	onUpdateCurrency: (
		coinType: CurrencyType,
		delta: number,
		walletType: 'public' | 'private',
	) => void;
	onConsolidateCoinsToGold: (walletType: 'public' | 'private') => void;
	onTransferCurrency: (
		targetCharId: string,
		coinType: CurrencyType,
		amount: number,
		fromWallet: 'public' | 'private',
	) => void;
	onTransferBetweenOwnWallets: (
		fromWallet: 'public' | 'private',
		coinType: CurrencyType,
		amount: number,
	) => void;
	onSplitCampCoinToParty?: (coinType: CurrencyType) => void;
}

const COIN_META: {
	key: CurrencyType;
	name: string;
	rate: string;
}[] = [
	{
		key: 'pp',
		name: '鉑金幣 (PP)',
		rate: '1 PP = 10 GP',
	},
	{
		key: 'gp',
		name: '金幣 (GP)',
		rate: '標準通用貨幣',
	},
	{
		key: 'ep',
		name: '電金幣 (EP)',
		rate: '2 EP = 1 GP',
	},
	{
		key: 'sp',
		name: '銀幣 (SP)',
		rate: '10 SP = 1 GP',
	},
	{
		key: 'cp',
		name: '銅幣 (CP)',
		rate: '100 CP = 1 GP',
	},
];

export default function CurrencyPanel({
	isOpen,
	activeCharacter,
	characters,
	initialWalletTab = 'public',
	canReadPublicWallet,
	canEditPublicWallet,
	canReadPrivateWallet,
	canEditPrivateWallet,
	onClose,
	onUpdateCurrency,
	onConsolidateCoinsToGold,
	onTransferCurrency,
	onTransferBetweenOwnWallets,
	onSplitCampCoinToParty,
}: CurrencyPanelProps) {
	const [walletTab, setWalletTab] = useState<'public' | 'private'>(
		initialWalletTab,
	);
	const [transferCoin, setTransferCoin] = useState<CurrencyType>('gp');
	const [transferAmount, setTransferAmount] = useState<number>(10);

	const isCampChest = activeCharacter.id === CAMP_CHEST_ID;

	useEffect(() => {
		if (isCampChest) {
			setWalletTab('public');
		} else if (initialWalletTab === 'private' && canReadPrivateWallet) {
			setWalletTab('private');
		} else if (canReadPublicWallet) {
			setWalletTab('public');
		} else if (canReadPrivateWallet) {
			setWalletTab('private');
		}
	}, [
		isOpen,
		isCampChest,
		initialWalletTab,
		canReadPublicWallet,
		canReadPrivateWallet,
	]);

	if (!isOpen) return null;

	const currentWallet =
		walletTab === 'private' && !isCampChest
			? activeCharacter.privateCurrencies || {
					pp: 0,
					gp: 0,
					ep: 0,
					sp: 0,
					cp: 0,
				}
			: activeCharacter.currencies;

	const canReadCurrent =
		walletTab === 'private' ? canReadPrivateWallet : canReadPublicWallet;
	const canEditCurrent =
		walletTab === 'private' ? canEditPrivateWallet : canEditPublicWallet;
	const canTransferBetweenOwn =
		!isCampChest && canEditPublicWallet && canEditPrivateWallet;

	const maxAvailable = currentWallet[transferCoin] ?? 0;

	return (
		<div className='fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
			<div
				role='dialog'
				aria-modal='true'
				aria-labelledby='currency-panel-heading'
				data-testid='currency-panel'
				className='bg-background border-2 border-primary/70 rounded-lg max-w-md w-full p-5 shadow-lg my-8'
			>
				<div className='flex items-center justify-between border-b border-border pb-3 mb-4'>
					<div className='flex items-center gap-2'>
						<Coins className='w-5 h-5 text-foreground' />
						<h2
							id='currency-panel-heading'
							className='text-base font-serif font-bold text-foreground'
						>
							{activeCharacter.avatar} {activeCharacter.name} — 錢包管理
						</h2>
					</div>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						aria-label='關閉錢包管理'
						onClick={onClose}
						prefixIcon={<X className='w-5 h-5' />}
					>
					</Button>
				</div>

				{/* 公開錢包 vs 私人錢包 分頁切換 */}
				{!isCampChest && (
					<div className='grid grid-cols-2 gap-2 mb-4'>
						<Button
							type='button'
							variant={walletTab === 'public' ? 'primary' : 'ghost'}
							data-testid='currency-wallet-public'
							aria-pressed={walletTab === 'public'}
							disabled={!canReadPublicWallet}
							onClick={() => setWalletTab('public')}
							prefixIcon={<Globe className='w-3.5 h-3.5' />}
						>
							<span>公開錢包 {!canReadPublicWallet && '(無權限)'}</span>
						</Button>

						<Button
							type='button'
							variant={walletTab === 'private' ? 'primary' : 'ghost'}
							data-testid='currency-wallet-private'
							aria-pressed={walletTab === 'private'}
							disabled={!canReadPrivateWallet}
							onClick={() => setWalletTab('private')}
							prefixIcon={<Lock className='w-3.5 h-3.5' />}
						>
							<span>私人錢包 {!canReadPrivateWallet && '(隱藏)'}</span>
						</Button>
					</div>
				)}

				{!canReadCurrent ? (
					<div className='py-12 text-center text-muted-foreground text-xs border border-dashed border-border rounded-md space-y-2'>
						<Lock className='w-6 h-6 text-muted-foreground mx-auto' />
						<p>你沒有閱讀此錢包的權限。</p>
					</div>
				) : (
					<>
						{!canEditCurrent && (
							<div className='mb-3 px-3 py-1.5 rounded bg-card border border-border text-[11px] text-muted-foreground flex items-center justify-between'>
								<span>👁️ 僅閱讀模式</span>
								<span>無修改或轉出此錢包的權限</span>
							</div>
						)}

						{/* 五種貨幣增減列表 */}
						<div className='space-y-2.5'>
							{COIN_META.map((coin) => (
								<div
									key={coin.key}
									className={`p-2.5 rounded-md border flex items-center justify-between`}
								>
									<div>
										<div className={`text-xs font-bold`}>{coin.name}</div>
										<div className='text-[10px] opacity-75'>{coin.rate}</div>
									</div>

									<div className='flex items-center gap-1.5'>
										{canEditCurrent &&
											[-10, -1].map((delta) => (
												<Button
													key={delta}
													type='button'
													variant='secondary'
													size='sm'
													data-testid={`currency-remove-${coin.key}-${Math.abs(delta)}`}
													onClick={() =>
														onUpdateCurrency(coin.key, delta, walletTab)
													}
													className='px-2 py-1 rounded bg-background/80 hover:bg-card border border-border text-[11px] font-mono cursor-pointer'
												>
													{delta}
												</Button>
											))}
										<span
											data-testid={`currency-balance-${coin.key}`}
											className={`w-14 text-center font-mono font-bold text-sm ${coin.key === 'gp' ? 'text-money' : ''}`}
										>
											{currentWallet[coin.key] ?? 0}
										</span>
										{canEditCurrent &&
											[1, 10].map((delta) => (
												<Button
													key={delta}
													type='button'
													variant='secondary'
													size='sm'
													data-testid={`currency-add-${coin.key}-${delta}`}
													onClick={() =>
														onUpdateCurrency(coin.key, delta, walletTab)
													}
													className='px-2 py-1 rounded bg-background/80 hover:bg-card border border-border text-[11px] font-mono cursor-pointer'
												>
													+{delta}
												</Button>
											))}
									</div>
								</div>
							))}
						</div>

						{/* 轉交隊友 / 存入公庫 / 公私錢包互轉（只要擁有當前錢包的修改權即可單向轉出） */}
						{canEditCurrent && (
							<div className='mt-4 pt-3.5 border-t border-border space-y-2.5 text-xs'>
								<div className='flex items-center justify-between'>
									<span className='text-highlight font-semibold flex items-center gap-1.5'>
										<Send className='w-3.5 h-3.5 text-highlight' />
										<span>
											{isCampChest
												? '從營地公庫發放 / 均分貨幣'
												: `從${walletTab === 'private' ? '私人錢包' : '公開錢包'}單向轉出`}
										</span>
									</span>
									<span
										className={`text-[11px] font-mono ${transferCoin === 'gp' ? 'text-money' : 'text-muted-foreground'}`}
									>
										可用: {maxAvailable} {transferCoin.toUpperCase()}
									</span>
								</div>

								<div className='flex items-center gap-2'>
									<Select
										value={transferCoin}
										aria-label='轉出貨幣類型'
										onChange={(e) =>
											setTransferCoin(e.target.value as CurrencyType)
										}
									>
										<option value='pp'>PP 鉑金幣</option>
										<option value='gp'>GP 金幣</option>
										<option value='ep'>EP 電金幣</option>
										<option value='sp'>SP 銀幣</option>
										<option value='cp'>CP 銅幣</option>
									</Select>

									<Input
										type='number'
										min={1}
										max={Math.max(1, maxAvailable)}
										value={transferAmount}
										aria-label='轉出貨幣數量'
										onChange={(e) =>
											setTransferAmount(
												Math.max(1, parseInt(e.target.value, 10) || 1),
											)
										}
									/>

									<Button
										type='button'
										variant='secondary'
										size='sm'
										onClick={() => setTransferAmount(maxAvailable)}
										disabled={maxAvailable <= 0}
									>
										全部 ({maxAvailable})
									</Button>
								</div>

								{/* 自己公開錢包 <-> 私人錢包互轉 */}
								{canTransferBetweenOwn && (
									<Button
										type='button'
										variant='secondary'
										size='sm'
										disabled={maxAvailable <= 0}
										onClick={() =>
											onTransferBetweenOwnWallets(
												walletTab,
												transferCoin,
												transferAmount,
											)
										}
										prefixIcon={<ArrowLeftRight className='w-3.5 h-3.5 text-muted-foreground' />}
									>
										<span>
											{walletTab === 'public'
												? `🔒 將 ${transferAmount} ${transferCoin.toUpperCase()} 藏入私人錢包`
												: `🌐 將 ${transferAmount} ${transferCoin.toUpperCase()} 移回公開錢包`}
										</span>
									</Button>
								)}

								{/* 單向轉帳給公庫或任何隊友（無須擁有目標角色的權限） */}
								<div className='flex items-center gap-1.5 flex-wrap pt-0.5'>
									{!isCampChest && (
										<Button
											type='button'
											variant='secondary'
											size='sm'
											disabled={maxAvailable <= 0}
											onClick={() =>
												onTransferCurrency(
													CAMP_CHEST_ID,
													transferCoin,
													transferAmount,
													walletTab,
												)
											}
										>
											🏕️ 存入營地公庫
										</Button>
									)}

									{isCampChest && onSplitCampCoinToParty && (
										<Button
											type='button'
											variant='secondary'
											size='sm'
											disabled={maxAvailable <= 0}
											onClick={() => onSplitCampCoinToParty(transferCoin)}
											prefixIcon={<Users className='w-3.5 h-3.5 text-muted-foreground' />}
										>
											<span>平分所有 {transferCoin.toUpperCase()} 給全隊</span>
										</Button>
									)}

									{characters
										.filter(
											(c) =>
												c.id !== activeCharacter.id && c.id !== CAMP_CHEST_ID,
										)
										.map((target) => (
											<Button
												key={target.id}
												type='button'
												variant='secondary'
												size='sm'
												disabled={maxAvailable <= 0}
												onClick={() =>
													onTransferCurrency(
														target.id,
														transferCoin,
														transferAmount,
														walletTab,
													)
												}
											>
												轉給 {target.avatar} {target.name.split(' ')[0]}
											</Button>
										))}
								</div>
							</div>
						)}

						{/* 底部一鍵換整金幣按鈕 */}
						<div className='mt-4 pt-3 border-t border-border flex items-center justify-between gap-2'>
							{canEditCurrent ? (
								<Button
									type='button'
									variant='secondary'
									onClick={() => onConsolidateCoinsToGold(walletTab)}
									prefixIcon={<Sparkles className='w-3.5 h-3.5' />}
								>
									<span>一鍵將零錢換整為金幣 (GP)</span>
								</Button>
							) : (
								<div />
							)}
							<Button
								type='button'
								variant='secondary'
								onClick={onClose}
								className='py-2 px-4 rounded bg-card hover:bg-muted border border-border text-foreground text-xs cursor-pointer'
							>
								關閉
							</Button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
