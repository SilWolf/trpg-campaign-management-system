import { useState } from 'react';
import { CAMP_CHEST_ID, type Character, type CurrencyType } from '../types';
import { Coins, X, Sparkles, Send, Users } from 'lucide-react';

interface CurrencyPanelProps {
	isOpen: boolean;
	activeCharacter: Character;
	characters: Character[]; // 新增：用於列出轉帳目標
	onClose: () => void;
	onUpdateCurrency: (coinType: CurrencyType, delta: number) => void;
	onConsolidateCoinsToGold: () => void;
	onTransferCurrency: (
		targetCharId: string,
		coinType: CurrencyType,
		amount: number,
	) => void;
	onSplitCampCoinToParty?: (coinType: CurrencyType) => void;
}

const COIN_META: {
	key: CurrencyType;
	name: string;
	rate: string;
	style: string;
}[] = [
	{
		key: 'pp',
		name: '鉑金幣 (PP)',
		rate: '1 PP = 10 GP',
		style: 'border-slate-400/50 bg-slate-900/60 text-slate-100',
	},
	{
		key: 'gp',
		name: '金幣 (GP)',
		rate: '標準通用貨幣',
		style: 'border-amber-500/60 bg-amber-950/40 text-amber-300',
	},
	{
		key: 'ep',
		name: '電金幣 (EP)',
		rate: '2 EP = 1 GP',
		style: 'border-cyan-500/50 bg-cyan-950/30 text-cyan-200',
	},
	{
		key: 'sp',
		name: '銀幣 (SP)',
		rate: '10 SP = 1 GP',
		style: 'border-stone-400/50 bg-stone-800/60 text-stone-200',
	},
	{
		key: 'cp',
		name: '銅幣 (CP)',
		rate: '100 CP = 1 GP',
		style: 'border-orange-500/50 bg-orange-950/30 text-orange-300',
	},
];

export default function CurrencyPanel({
	isOpen,
	activeCharacter,
	characters,
	onClose,
	onUpdateCurrency,
	onConsolidateCoinsToGold,
	onTransferCurrency,
	onSplitCampCoinToParty,
}: CurrencyPanelProps) {
	const [transferCoin, setTransferCoin] = useState<CurrencyType>('gp');
	const [transferAmount, setTransferAmount] = useState<number>(10);

	if (!isOpen) return null;

	const isCampChest = activeCharacter.id === CAMP_CHEST_ID;
	const maxAvailable = activeCharacter.currencies[transferCoin];

	return (
		<div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto'>
			<div className='bg-stone-950 border-2 border-amber-600/70 rounded-lg max-w-md w-full p-5 shadow-[0_0_45px_rgba(245,158,11,0.25)] my-8'>
				<div className='flex items-center justify-between border-b border-stone-800 pb-3 mb-4'>
					<div className='flex items-center gap-2'>
						<Coins className='w-5 h-5 text-amber-400' />
						<h2 className='text-base font-serif font-bold text-amber-200'>
							{activeCharacter.avatar} {activeCharacter.name} — 錢包與公庫管理
						</h2>
					</div>
					<button
						onClick={onClose}
						className='text-stone-400 hover:text-stone-200 cursor-pointer'
					>
						<X className='w-5 h-5' />
					</button>
				</div>

				{/* 五種貨幣增減列表 */}
				<div className='space-y-2.5'>
					{COIN_META.map((coin) => (
						<div
							key={coin.key}
							className={`p-2.5 rounded-md border flex items-center justify-between ${coin.style}`}
						>
							<div>
								<div className='text-xs font-bold'>{coin.name}</div>
								<div className='text-[10px] opacity-75'>{coin.rate}</div>
							</div>

							<div className='flex items-center gap-1.5'>
								{[-10, -1].map((delta) => (
									<button
										key={delta}
										onClick={() => onUpdateCurrency(coin.key, delta)}
										className='px-2 py-1 rounded bg-stone-950/80 hover:bg-stone-900 border border-stone-700 text-[11px] font-mono cursor-pointer'
									>
										{delta}
									</button>
								))}
								<span className='w-14 text-center font-mono font-bold text-sm'>
									{activeCharacter.currencies[coin.key]}
								</span>
								{[1, 10].map((delta) => (
									<button
										key={delta}
										onClick={() => onUpdateCurrency(coin.key, delta)}
										className='px-2 py-1 rounded bg-stone-950/80 hover:bg-stone-900 border border-stone-700 text-[11px] font-mono cursor-pointer'
									>
										+{delta}
									</button>
								))}
							</div>
						</div>
					))}
				</div>

				{/* ========================================== */}
				{/* 新增：貨幣轉交隊友 / 存入營地公庫區塊       */}
				{/* ========================================== */}
				<div className='mt-4 pt-3.5 border-t border-stone-800 space-y-2.5 text-xs'>
					<div className='flex items-center justify-between'>
						<span className='text-amber-300 font-semibold flex items-center gap-1.5'>
							<Send className='w-3.5 h-3.5 text-amber-400' />
							<span>
								{isCampChest
									? '從營地公庫發放 / 均分貨幣'
									: '轉交隊友或存入營地公庫'}
							</span>
						</span>
						<span className='text-[11px] text-stone-400 font-mono'>
							可用: {maxAvailable} {transferCoin.toUpperCase()}
						</span>
					</div>

					{/* 選擇幣種與輸入金額 */}
					<div className='flex items-center gap-2'>
						<select
							value={transferCoin}
							onChange={(e) => setTransferCoin(e.target.value as CurrencyType)}
							className='bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-amber-200 font-semibold outline-none'
						>
							<option value='pp'>PP 鉑金幣</option>
							<option value='gp'>GP 金幣</option>
							<option value='ep'>EP 電金幣</option>
							<option value='sp'>SP 銀幣</option>
							<option value='cp'>CP 銅幣</option>
						</select>

						<input
							type='number'
							min={1}
							max={Math.max(1, maxAvailable)}
							value={transferAmount}
							onChange={(e) =>
								setTransferAmount(
									Math.max(1, parseInt(e.target.value, 10) || 1),
								)
							}
							className='flex-1 bg-stone-900 border border-stone-700 focus:border-amber-500 rounded px-2.5 py-1.5 font-mono font-bold text-stone-100 outline-none'
						/>

						<button
							type='button'
							onClick={() => setTransferAmount(maxAvailable)}
							disabled={maxAvailable <= 0}
							className='px-2.5 py-1.5 rounded bg-stone-900 hover:bg-stone-800 disabled:opacity-40 border border-stone-700 text-amber-300 text-[11px] cursor-pointer'
						>
							全部 ({maxAvailable})
						</button>
					</div>

					{/* 轉帳目標按鈕列 */}
					<div className='flex items-center gap-1.5 flex-wrap pt-0.5'>
						{/* 若目前是角色錢包，顯示「🏕️ 存入營地公庫」 */}
						{!isCampChest && (
							<button
								type='button'
								disabled={maxAvailable <= 0}
								onClick={() =>
									onTransferCurrency(
										CAMP_CHEST_ID,
										transferCoin,
										transferAmount,
									)
								}
								className='px-2.5 py-1.5 rounded bg-cyan-950/80 hover:bg-cyan-900 disabled:opacity-40 border border-cyan-500/70 text-cyan-100 text-[11px] font-medium cursor-pointer transition'
							>
								🏕️ 存入營地公庫
							</button>
						)}

						{/* 若目前是營地公庫，提供「一鍵平分給全隊」 */}
						{isCampChest && onSplitCampCoinToParty && (
							<button
								type='button'
								disabled={maxAvailable <= 0}
								onClick={() => onSplitCampCoinToParty(transferCoin)}
								className='px-2.5 py-1.5 rounded bg-emerald-950/90 hover:bg-emerald-900 disabled:opacity-40 border border-emerald-500/70 text-emerald-100 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition'
							>
								<Users className='w-3.5 h-3.5 text-emerald-400' />
								<span>平分所有 {transferCoin.toUpperCase()} 給全隊</span>
							</button>
						)}

						{/* 個別隊員按鈕 */}
						{characters
							.filter(
								(c) => c.id !== activeCharacter.id && c.id !== CAMP_CHEST_ID,
							)
							.map((target) => (
								<button
									key={target.id}
									type='button'
									disabled={maxAvailable <= 0}
									onClick={() =>
										onTransferCurrency(target.id, transferCoin, transferAmount)
									}
									className='px-2.5 py-1.5 rounded bg-stone-900 hover:bg-amber-950 disabled:opacity-40 border border-stone-700 hover:border-amber-600/60 text-stone-200 text-[11px] cursor-pointer transition'
								>
									轉給 {target.avatar} {target.name.split(' ')[0]}
								</button>
							))}
					</div>
				</div>

				{/* 底部一鍵換整金幣按鈕 */}
				<div className='mt-4 pt-3 border-t border-stone-800 flex items-center justify-between gap-2'>
					<button
						onClick={onConsolidateCoinsToGold}
						className='flex-1 py-2 px-3 rounded bg-gradient-to-r from-amber-800 to-amber-700 hover:from-amber-700 hover:to-amber-600 text-amber-50 text-xs font-semibold flex items-center justify-center gap-1.5 shadow cursor-pointer'
					>
						<Sparkles className='w-3.5 h-3.5' />
						<span>一鍵將零錢換整為金幣 (GP)</span>
					</button>
					<button
						onClick={onClose}
						className='py-2 px-4 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 text-xs cursor-pointer'
					>
						完成
					</button>
				</div>
			</div>
		</div>
	);
}
