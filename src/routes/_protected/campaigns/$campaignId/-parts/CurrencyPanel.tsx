import { useEffect, useRef, useState } from 'react';
import { Coins, Send, Tent, X } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { CAMP_CHEST_ID, type Character } from '@/types';

export interface CurrencyWalletOption {
	characterId: string;
	characterName: string;
	walletType: 'public' | 'private';
	balanceGp?: number;
}

interface CurrencyPanelProps {
	isOpen: boolean;
	activeCharacter: Character;
	initialWalletTab: 'public' | 'private';
	sourceWallets: CurrencyWalletOption[];
	destinationWallets: CurrencyWalletOption[];
	onClose: () => void;
	onTransferCurrency: (
		sourceCharacterId: string,
		sourceWallet: 'public' | 'private',
		targetCharacterId: string | null,
		targetWallet: 'public' | 'private',
		amountCents: number,
	) => boolean | Promise<boolean>;
}

const MAX_GP_CENTS = 100_000_000;
const SPLIT_OTHER_CHARACTERS = '__split_other_characters__';

function walletOptionId(wallet: CurrencyWalletOption): string {
	return JSON.stringify([wallet.characterId, wallet.walletType]);
}

function parseGpInputToCents(value: string): number | null {
	const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value.trim());
	if (!match) return null;
	const cents =
		Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
	return Number.isSafeInteger(cents) && cents <= MAX_GP_CENTS ? cents : null;
}

function formatGpCents(cents: number): string {
	return (cents / 100).toFixed(2).replace(/\.?0+$/, '');
}

function walletTypeLabel(
	walletType: CurrencyWalletOption['walletType'],
): string {
	return walletType === 'private' ? '私人錢包' : '公開錢包';
}

function walletOptionLabel(wallet: CurrencyWalletOption): string {
	const typeLabel =
		wallet.characterId === CAMP_CHEST_ID
			? '公共錢包'
			: walletTypeLabel(wallet.walletType);
	const balance =
		wallet.balanceGp === undefined
			? ''
			: `（${formatGpCents(Math.round(wallet.balanceGp * 100))} GP）`;
	return `${wallet.characterName} — ${typeLabel}${balance}`;
}

function canTransferToWallet(
	source: CurrencyWalletOption,
	target: CurrencyWalletOption,
): boolean {
	if (walletOptionId(source) === walletOptionId(target)) return false;
	if (source.characterId === CAMP_CHEST_ID) {
		return (
			target.characterId !== CAMP_CHEST_ID && target.walletType === 'public'
		);
	}
	return source.walletType === 'private' || target.walletType === 'public';
}

export default function CurrencyPanel({
	isOpen,
	activeCharacter,
	initialWalletTab,
	sourceWallets,
	destinationWallets,
	onClose,
	onTransferCurrency,
}: CurrencyPanelProps) {
	const [sourceWalletId, setSourceWalletId] = useState('');
	const [targetWalletId, setTargetWalletId] = useState('');
	const [transferAmount, setTransferAmount] = useState('0.01');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const wasOpen = useRef(false);

	const sourceWallet = sourceWallets.find(
		(wallet) => walletOptionId(wallet) === sourceWalletId,
	);
	const targetWallet = destinationWallets.find(
		(wallet) => walletOptionId(wallet) === targetWalletId,
	);
	const availableDestinationWallets = sourceWallet
		? destinationWallets.filter((wallet) =>
				canTransferToWallet(sourceWallet, wallet),
			)
		: [];
	const splitRecipientIds = Array.from(
		new Set(
			destinationWallets
				.filter(
					(wallet) =>
						wallet.walletType === 'public' &&
						wallet.characterId !== CAMP_CHEST_ID &&
						wallet.characterId !== sourceWallet?.characterId,
				)
				.map((wallet) => wallet.characterId),
		),
	);
	const isSplitTarget = targetWalletId === SPLIT_OTHER_CHARACTERS;
	const amountCents = parseGpInputToCents(transferAmount);
	const sourceBalanceCents =
		sourceWallet?.balanceGp === undefined
			? 0
			: Math.round(sourceWallet.balanceGp * 100);
	const targetBalanceCents =
		targetWallet?.balanceGp === undefined
			? null
			: Math.round(targetWallet.balanceGp * 100);
	const validTransfer =
		sourceWallet !== undefined &&
		((isSplitTarget && splitRecipientIds.length > 0) ||
			(!isSplitTarget &&
				targetWallet !== undefined &&
				canTransferToWallet(sourceWallet, targetWallet))) &&
		amountCents !== null &&
		amountCents > 0 &&
		amountCents <= sourceBalanceCents &&
		(isSplitTarget
			? Math.floor(amountCents / splitRecipientIds.length) > 0
			: targetBalanceCents === null ||
				targetBalanceCents + amountCents <= MAX_GP_CENTS);

	useEffect(() => {
		if (!isOpen) {
			wasOpen.current = false;
			return;
		}

		const opening = !wasOpen.current;
		wasOpen.current = true;
		const preferredSourceId = walletOptionId({
			characterId: activeCharacter.id,
			characterName: activeCharacter.name,
			walletType: initialWalletTab,
		});
		const preferredSource = sourceWallets.find(
			(wallet) => walletOptionId(wallet) === preferredSourceId,
		);
		const previousSource = sourceWallets.find(
			(wallet) => walletOptionId(wallet) === sourceWalletId,
		);
		const nextSource = opening
			? (preferredSource ?? previousSource ?? sourceWallets[0])
			: (previousSource ?? preferredSource ?? sourceWallets[0]);
		const nextSourceId = nextSource ? walletOptionId(nextSource) : '';
		const hasSplitRecipients = destinationWallets.some(
			(wallet) =>
				wallet.walletType === 'public' &&
				wallet.characterId !== CAMP_CHEST_ID &&
				wallet.characterId !== nextSource?.characterId,
		);
		const keepSplitTarget =
			targetWalletId === SPLIT_OTHER_CHARACTERS && hasSplitRecipients;
		const availableTargets = nextSource
			? destinationWallets.filter((wallet) =>
					canTransferToWallet(nextSource, wallet),
				)
			: [];
		const currentTarget = availableTargets.find(
			(wallet) => walletOptionId(wallet) === targetWalletId,
		);
		const nextTarget = keepSplitTarget
			? SPLIT_OTHER_CHARACTERS
			: (currentTarget ??
				availableTargets[0]);

		setSourceWalletId(nextSourceId);
		setTargetWalletId(
			typeof nextTarget === 'string'
				? nextTarget
				: nextTarget
					? walletOptionId(nextTarget)
					: '',
		);
		if (opening) setTransferAmount('0.01');
	}, [
		isOpen,
		activeCharacter.id,
		activeCharacter.name,
		initialWalletTab,
		sourceWallets,
		destinationWallets,
		sourceWalletId,
		targetWalletId,
	]);

	if (!isOpen) return null;

	const isCampChestSource = sourceWallet?.characterId === CAMP_CHEST_ID;

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
							{isCampChestSource && (
								<Tent className='inline-block h-5 w-5 align-middle text-primary-foreground' />
							)}{' '}
							轉帳
						</h2>
					</div>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						aria-label='關閉轉帳'
						onClick={onClose}
						prefixIcon={<X />}
					/>
				</div>

				<div className='space-y-4'>
					<Select
						label='轉出戶口'
						aria-label='轉出戶口'
						data-testid='currency-source-wallet'
						value={sourceWalletId}
						onChange={(event) => {
							const nextSourceId = event.target.value;
							setSourceWalletId(nextSourceId);
						}}
					>
						{sourceWallets.map((wallet) => (
							<option
								key={walletOptionId(wallet)}
								value={walletOptionId(wallet)}
							>
								{walletOptionLabel(wallet)}
							</option>
						))}
					</Select>

					<div className='flex items-end gap-2'>
						<Input
							label='金額（GP）'
							type='number'
							min='0.01'
							max={sourceBalanceCents / 100}
							step='0.01'
							value={transferAmount}
							aria-label='金額（GP）'
							data-testid='currency-transfer-amount'
							containerClassName='flex-1'
							aria-invalid={
								transferAmount !== '' &&
								(amountCents === null ||
									amountCents <= 0 ||
									amountCents > sourceBalanceCents)
							}
							onChange={(event) => setTransferAmount(event.target.value)}
						/>
						<Button
							type='button'
							variant='secondary'
							data-testid='currency-transfer-all'
							disabled={!sourceWallet || sourceBalanceCents <= 0}
							onClick={() =>
								setTransferAmount(formatGpCents(sourceBalanceCents))
							}
						>
							全部
						</Button>
					</div>

					<Select
						label='轉入戶口'
						aria-label='轉入戶口'
						data-testid='currency-target-wallet'
						value={targetWalletId}
						onChange={(event) => setTargetWalletId(event.target.value)}
					>
						<option value={SPLIT_OTHER_CHARACTERS}>
							平分給其他角色（{splitRecipientIds.length} 名）
						</option>
						{availableDestinationWallets.map((wallet) => {
							const id = walletOptionId(wallet);
							return (
								<option key={id} value={id}>
									{walletOptionLabel(wallet)}
								</option>
							);
						})}
					</Select>

					<div className='flex items-center justify-between border-t border-border pt-3'>
						<span className='text-xs text-muted-foreground'></span>
						<div className='flex gap-2'>
							<Button type='button' variant='secondary' onClick={onClose}>
								取消
							</Button>
							<Button
								type='button'
								variant='primary'
								data-testid='currency-transfer-submit'
								disabled={!validTransfer || isSubmitting}
								onClick={async () => {
									if (
										!sourceWallet ||
										(!targetWallet && !isSplitTarget) ||
										amountCents === null ||
										isSubmitting
									) {
										return;
									}
									setIsSubmitting(true);
									try {
										const transferred = await onTransferCurrency(
											sourceWallet.characterId,
											sourceWallet.walletType,
											isSplitTarget ? null : (targetWallet?.characterId ?? null),
											isSplitTarget
												? 'public'
												: (targetWallet?.walletType ?? 'public'),
											amountCents,
										);
										if (transferred) onClose();
									} finally {
										setIsSubmitting(false);
									}
								}}
								prefixIcon={<Send />}
							>
								{isSubmitting ? '處理中…' : '轉帳'}
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
