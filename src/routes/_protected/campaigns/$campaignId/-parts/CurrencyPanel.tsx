/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { CAMP_CHEST_ID, type Character } from '@/types';
import {
	Coins,
	X,
	Send,
	Users,
	Globe,
	Lock,
	ArrowLeftRight,
	Tent,
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { CharacterAvatar } from '@/components/CharacterAvatar';

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
	onUpdateCurrency: (deltaCents: number, walletType: 'public' | 'private') => void;
	onTransferCurrency: (
		targetCharId: string,
		amountCents: number,
		fromWallet: 'public' | 'private',
	) => void;
	onTransferBetweenOwnWallets: (
		fromWallet: 'public' | 'private',
		amountCents: number,
	) => void;
	onSplitCampCoinToParty?: () => void;
}

const MAX_GP_CENTS = 100_000_000;

function parseGpInputToCents(value: string): number | null {
	const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value.trim());
	if (!match) return null;
	const cents =
		Number(match[1]) * 100 +
		Number((match[2] ?? '').padEnd(2, '0') || '0');
	return Number.isSafeInteger(cents) && cents <= MAX_GP_CENTS ? cents : null;
}

function formatGpCents(cents: number): string {
	return (cents / 100).toFixed(2).replace(/\.?0+$/, '');
}

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
	onTransferCurrency,
	onTransferBetweenOwnWallets,
	onSplitCampCoinToParty,
}: CurrencyPanelProps) {
	const [walletTab, setWalletTab] = useState<'public' | 'private'>(
		initialWalletTab,
	);
	const [transferAmount, setTransferAmount] = useState('10.00');

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

	const currentGp =
		walletTab === 'private' && !isCampChest
			? activeCharacter.privateGp
			: activeCharacter.gp;

	const canReadCurrent =
		walletTab === 'private' ? canReadPrivateWallet : canReadPublicWallet;
	const canEditCurrent =
		walletTab === 'private' ? canEditPrivateWallet : canEditPublicWallet;
	const canTransferBetweenOwn =
		!isCampChest && canEditPublicWallet && canEditPrivateWallet;
	const currentBalanceCents = parseGpInputToCents(String(currentGp)) ?? 0;
	const amountCents = parseGpInputToCents(transferAmount);
	const validTransferAmount =
		amountCents !== null &&
		amountCents > 0 &&
		amountCents <= currentBalanceCents;

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
							{isCampChest ? (
								<Tent className='inline-block h-5 w-5 align-middle text-primary-foreground' />
							) : (
								<CharacterAvatar
									avatar={activeCharacter.avatar}
									alt={`${activeCharacter.name}頭像`}
									className='inline-block h-5 w-5 rounded-full object-cover align-middle'
								/>
							)}{' '}
							{activeCharacter.name} — 錢包管理
						</h2>
					</div>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						aria-label='關閉錢包管理'
						onClick={onClose}
						prefixIcon={<X />}
					></Button>
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
							prefixIcon={<Globe />}
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
							prefixIcon={<Lock />}
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

						<div className='p-3 rounded-md border border-border space-y-3'>
							<div className='flex items-center justify-between gap-3'>
								<div>
									<div className='text-xs font-bold'>GP 餘額</div>
									<div className='text-[10px] opacity-75'>
										最小單位 0.01 GP
									</div>
								</div>
								<div className='flex items-center gap-1.5'>
									{canEditCurrent && (
										<>
											<Button
												type='button'
												variant='secondary'
												size='sm'
												data-testid='currency-remove-gp-cent'
												disabled={currentBalanceCents < 1}
												onClick={() => onUpdateCurrency(-1, walletTab)}
											>
												−0.01
											</Button>
											<Button
												type='button'
												variant='secondary'
												size='sm'
												data-testid='currency-remove-gp-1'
												disabled={currentBalanceCents < 100}
												onClick={() => onUpdateCurrency(-100, walletTab)}
											>
												−1
											</Button>
										</>
									)}
									<span
										data-testid='currency-balance-gp'
										className='min-w-20 text-center font-mono font-bold text-sm text-money'
									>
										{formatGpCents(currentBalanceCents)}
									</span>
									{canEditCurrent && (
										<>
											<Button
												type='button'
												variant='secondary'
												size='sm'
												data-testid='currency-add-gp-cent'
												disabled={currentBalanceCents >= MAX_GP_CENTS}
												onClick={() => onUpdateCurrency(1, walletTab)}
											>
												+0.01
											</Button>
											<Button
												type='button'
												variant='secondary'
												size='sm'
												data-testid='currency-add-gp-1'
												disabled={currentBalanceCents + 100 > MAX_GP_CENTS}
												onClick={() => onUpdateCurrency(100, walletTab)}
											>
												+1
											</Button>
										</>
									)}
								</div>
							</div>
						</div>

						{canEditCurrent && (
							<div className='mt-4 pt-3.5 border-t border-border space-y-2.5 text-xs'>
								<div className='flex items-center justify-between'>
									<span className='text-highlight font-semibold flex items-center gap-1.5'>
										<Send className='w-3.5 h-3.5 text-highlight' />
										<span>
											{isCampChest
												? '從營地公庫發放 / 均分 GP'
												: `從${walletTab === 'private' ? '私人錢包' : '公開錢包'}單向轉出`}
										</span>
									</span>
									<span className='text-[11px] font-mono text-money'>
										可用：{formatGpCents(currentBalanceCents)} GP
									</span>
								</div>

								<div className='flex items-center gap-2'>
									<Input
										type='number'
										min='0.01'
										max={currentBalanceCents / 100}
										step='0.01'
										value={transferAmount}
										aria-label='轉出 GP 數量'
										aria-invalid={transferAmount !== '' && amountCents === null}
										onChange={(e) => setTransferAmount(e.target.value)}
									/>

									<Button
										type='button'
										variant='secondary'
										size='sm'
										onClick={() =>
											setTransferAmount(formatGpCents(currentBalanceCents))
										}
										disabled={currentBalanceCents <= 0}
									>
										全部 ({formatGpCents(currentBalanceCents)} GP)
									</Button>
								</div>

								{/* 自己公開錢包 <-> 私人錢包互轉 */}
								{canTransferBetweenOwn && (
									<Button
										type='button'
										variant='secondary'
										size='sm'
										disabled={!validTransferAmount}
										onClick={() =>
											onTransferBetweenOwnWallets(
												walletTab,
												amountCents ?? 0,
											)
										}
										prefixIcon={<ArrowLeftRight />}
									>
										<span>
											{walletTab === 'public'
												? `🔒 將 ${formatGpCents(amountCents ?? 0)} GP 藏入私人錢包`
												: `🌐 將 ${formatGpCents(amountCents ?? 0)} GP 移回公開錢包`}
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
											disabled={!validTransferAmount}
											onClick={() =>
												onTransferCurrency(
													CAMP_CHEST_ID,
													amountCents ?? 0,
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
											disabled={currentBalanceCents <= 0}
											onClick={onSplitCampCoinToParty}
											prefixIcon={<Users />}
										>
											<span>平分所有 GP 給全隊</span>
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
												disabled={!validTransferAmount}
												onClick={() =>
													onTransferCurrency(
														target.id,
														amountCents ?? 0,
														walletTab,
													)
												}
											>
												轉給{' '}
												<CharacterAvatar
													avatar={target.avatar}
													alt={`${target.name}頭像`}
													className='inline-block h-4 w-4 rounded-full object-cover align-middle'
												/>{' '}
												{target.name.split(' ')[0]}
											</Button>
										))}
								</div>
							</div>
						)}

						<div className='mt-4 pt-3 border-t border-border flex justify-end'>
							<Button type='button' variant='secondary' onClick={onClose}>
								關閉
							</Button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
