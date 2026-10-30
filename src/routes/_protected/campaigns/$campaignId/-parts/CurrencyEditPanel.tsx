import { useState } from 'react';
import { Coins, X } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { CAMP_CHEST_ID } from '@/types';
import type { CurrencyWalletOption } from './CurrencyPanel';

interface CurrencyEditPanelProps {
	isOpen: boolean;
	wallets: CurrencyWalletOption[];
	initialWalletId: string;
	onClose: () => void;
	onSave: (
		characterId: string,
		walletType: 'public' | 'private',
		balanceCents: number,
	) => boolean;
}

const MAX_GP_CENTS = 100_000_000;

function walletOptionId(wallet: CurrencyWalletOption): string {
	return JSON.stringify([wallet.characterId, wallet.walletType]);
}

function formatGpCents(cents: number): string {
	return (cents / 100).toFixed(2).replace(/\.?0+$/, '');
}

function parseGpInputToCents(value: string): number | null {
	const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value.trim());
	if (!match) return null;
	const cents =
		Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
	return Number.isSafeInteger(cents) && cents <= MAX_GP_CENTS ? cents : null;
}

function getWalletLabel(wallet: CurrencyWalletOption): string {
	const walletName =
		wallet.characterId === CAMP_CHEST_ID
			? '公共錢包'
			: wallet.walletType === 'private'
				? '私人錢包'
				: '公開錢包';
	return `${wallet.characterName} — ${walletName}（${formatGpCents(
		Math.round((wallet.balanceGp ?? 0) * 100),
	)} GP）`;
}

export default function CurrencyEditPanel({
	isOpen,
	wallets,
	initialWalletId,
	onClose,
	onSave,
}: CurrencyEditPanelProps) {
	const initialWallet =
		wallets.find((wallet) => walletOptionId(wallet) === initialWalletId) ??
		wallets[0];
	const [walletId, setWalletId] = useState(
		initialWallet ? walletOptionId(initialWallet) : '',
	);
	const [balanceInput, setBalanceInput] = useState(
		formatGpCents(Math.round((initialWallet?.balanceGp ?? 0) * 100)),
	);
	const balanceCents = parseGpInputToCents(balanceInput);
	const selectedWallet = wallets.find(
		(wallet) => walletOptionId(wallet) === walletId,
	);

	if (!isOpen) return null;

	return (
		<div className='fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
			<div
				role='dialog'
				aria-modal='true'
				aria-labelledby='currency-edit-heading'
				data-testid='currency-edit-panel'
				className='bg-background border-2 border-dm/70 rounded-lg max-w-md w-full p-5 shadow-lg my-8'
			>
				<div className='flex items-center justify-between border-b border-border pb-3 mb-4'>
					<div className='flex items-center gap-2'>
						<Coins className='w-5 h-5 text-foreground' />
						<h2
							id='currency-edit-heading'
							className='text-base font-serif font-bold text-foreground'
						>
							修改戶口存款
						</h2>
					</div>
					<Button
						type='button'
						variant='ghost-dm'
						size='sm'
						aria-label='關閉修改存款'
						onClick={onClose}
						prefixIcon={<X />}
					/>
				</div>

				<div className='space-y-4'>
					<Select
						label='角色戶口'
						aria-label='角色戶口'
						data-testid='currency-edit-wallet'
						value={walletId}
						onChange={(event) => {
							const nextId = event.target.value;
							const nextWallet = wallets.find(
								(wallet) => walletOptionId(wallet) === nextId,
							);
							setWalletId(nextId);
							setBalanceInput(
								formatGpCents(Math.round((nextWallet?.balanceGp ?? 0) * 100)),
							);
						}}
					>
						{wallets.map((wallet) => (
							<option
								key={walletOptionId(wallet)}
								value={walletOptionId(wallet)}
							>
								{getWalletLabel(wallet)}
							</option>
						))}
					</Select>

					<Input
						label='存款（GP）'
						type='number'
						min='0'
						max={MAX_GP_CENTS / 100}
						step='0.01'
						value={balanceInput}
						aria-label='存款（GP）'
						data-testid='currency-edit-balance'
						aria-invalid={balanceInput !== '' && balanceCents === null}
						onChange={(event) => setBalanceInput(event.target.value)}
					/>

					<div className='flex items-center justify-between border-t border-border pt-3'>
						<span className='text-xs text-muted-foreground'></span>
						<div className='flex gap-2'>
							<Button type='button' variant='secondary-dm' onClick={onClose}>
								取消
							</Button>
							<Button
								type='button'
								variant='primary-dm'
								data-testid='currency-edit-save'
								disabled={!selectedWallet || balanceCents === null}
								onClick={() => {
									if (balanceCents === null || !selectedWallet) return;
									if (
										onSave(
											selectedWallet.characterId,
											selectedWallet.walletType,
											balanceCents,
										)
									) {
										onClose();
									}
								}}
							>
								儲存修改
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
