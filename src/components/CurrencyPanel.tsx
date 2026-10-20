import { Coins, RefreshCw } from 'lucide-react';
import type { Character, CurrencyType } from '../types';

type CurrencyPanelProps = {
	isOpen: boolean;
	activeCharacter: Character;
	onClose: () => void;
	onUpdateCurrency: (coinType: CurrencyType, delta: number) => void;
	onConsolidateCoinsToGold: () => void;
};

const CurrencyPanel = ({
	isOpen,
	activeCharacter,
	onClose,
	onUpdateCurrency,
	onConsolidateCoinsToGold,
}: CurrencyPanelProps) => (
isOpen && (
				<div className='fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4'>
					<div className='bg-[#141210] border-2 border-amber-500/70 rounded-lg max-w-md w-full p-6 shadow-2xl'>
						<div className='flex items-center justify-between border-b border-stone-800 pb-3 mb-4'>
							<div className='flex items-center gap-2'>
								<Coins className='w-5 h-5 text-amber-400' />
								<h3 className='text-lg font-serif font-bold text-amber-200'>
									{activeCharacter.name} 的錢包管理
								</h3>
							</div>
							<button
								onClick={onClose}
								className='text-stone-400 hover:text-stone-200 text-sm cursor-pointer'
							>
								✕ 關閉
							</button>
						</div>

						<div className='space-y-3'>
							{[
								{
									key: 'pp',
									name: '鉑幣 (PP)',
									rate: '1 PP = 10 GP',
									color: 'text-slate-200',
								},
								{
									key: 'gp',
									name: '金幣 (GP)',
									rate: '標準通用貨幣',
									color: 'text-amber-300',
								},
								{
									key: 'ep',
									name: '電金幣 (EP)',
									rate: '2 EP = 1 GP',
									color: 'text-cyan-300',
								},
								{
									key: 'sp',
									name: '銀幣 (SP)',
									rate: '10 SP = 1 GP',
									color: 'text-stone-300',
								},
								{
									key: 'cp',
									name: '銅幣 (CP)',
									rate: '100 CP = 1 GP',
									color: 'text-orange-400',
								},
							].map((coin) => (
								<div
									key={coin.key}
									className='flex items-center justify-between p-2.5 rounded bg-stone-900 border border-stone-800'
								>
									<div>
										<div className={`font-bold text-sm ${coin.color}`}>
											{coin.name}
										</div>
										<div className='text-[11px] text-stone-500'>
											{coin.rate}
										</div>
									</div>
									<div className='flex items-center gap-1.5'>
										<button
											onClick={() =>
												onUpdateCurrency(coin.key as CurrencyType, -10)
											}
											className='px-2 py-1 rounded bg-stone-800 hover:bg-red-950 text-xs text-stone-300 cursor-pointer'
										>
											-10
										</button>
										<button
											onClick={() =>
												onUpdateCurrency(coin.key as CurrencyType, -1)
											}
											className='px-2 py-1 rounded bg-stone-800 hover:bg-red-950 text-xs text-stone-300 cursor-pointer'
										>
											-1
										</button>
										<span className='w-16 text-center font-mono font-bold text-sm text-stone-100'>
											{activeCharacter.currencies[coin.key as CurrencyType]}
										</span>
										<button
											onClick={() =>
												onUpdateCurrency(coin.key as CurrencyType, 1)
											}
											className='px-2 py-1 rounded bg-stone-800 hover:bg-emerald-950 text-xs text-stone-300 cursor-pointer'
										>
											+1
										</button>
										<button
											onClick={() =>
												onUpdateCurrency(coin.key as CurrencyType, 10)
											}
											className='px-2 py-1 rounded bg-stone-800 hover:bg-emerald-950 text-xs text-stone-300 cursor-pointer'
										>
											+10
										</button>
									</div>
								</div>
							))}
						</div>

						<div className='mt-5 pt-3 border-t border-stone-800 flex items-center justify-between gap-2'>
							<button
								onClick={onConsolidateCoinsToGold}
								className='flex items-center gap-1.5 px-3 py-2 rounded bg-amber-950 hover:bg-amber-900 border border-amber-600/60 text-amber-200 text-xs font-medium cursor-pointer'
							>
								<RefreshCw className='w-3.5 h-3.5' />
								<span>一鍵將零錢換成金幣 (減輕硬幣重量)</span>
							</button>
							<button
								onClick={onClose}
								className='px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs cursor-pointer'
							>
								完成
							</button>
						</div>
					</div>
				</div>
			)
);

export default CurrencyPanel;
