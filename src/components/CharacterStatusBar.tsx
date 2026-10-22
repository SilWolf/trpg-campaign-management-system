import {
	Coins,
	Scale,
	Settings,
	Tent,
	UserPlus,
} from 'lucide-react';
import {
	CAMP_CHEST_ID,
	type Character,
	type CurrencyType,
	type ViewMode,
} from '../types';

export interface CharacterStatusBarProps {
	placement: 'characters' | 'status';
	characters: Character[];
	items: { ownerId: string }[];
	activeCharId: string;
	setActiveCharId: (id: string) => void;
	viewMode: ViewMode;
	viewerCharId: string;
	activeCharacter: Character;
	isCampChestActive: boolean;
	encumbranceStats: {
		totalWeight: number;
		maxWeight: number;
		percentage: number;
	};
	attunedCount: number;
	countCoinWeight: boolean;
	setCountCoinWeight: (count: boolean) => void;
	coinWeight: number;
	totalValueInGp: number;
	onOpenCurrencyPanel: () => void;
	onEditCharacter: () => void;
	onAddCharacter: () => void;
}

export default function CharacterStatusBar({
	placement,
	characters,
	items,
	activeCharId,
	setActiveCharId,
	viewMode,
	viewerCharId,
	activeCharacter,
	isCampChestActive,
	encumbranceStats,
	attunedCount,
	countCoinWeight,
	setCountCoinWeight,
	coinWeight,
	totalValueInGp,
	onOpenCurrencyPanel,
	onEditCharacter,
	onAddCharacter,
}: CharacterStatusBarProps) {
	if (placement === 'characters') {
		return (
			<section className='relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pt-5'>
				<div className='grid grid-cols-1 lg:grid-cols-12 gap-4 bg-gradient-to-b from-stone-900/90 to-stone-950/95 border border-amber-800/40 rounded-lg p-4 shadow-xl'>
					<div className='lg:col-span-12 flex flex-col sm:flex-row items-stretch sm:items-center gap-2'>
						<div className='flex flex-wrap sm:flex-nowrap items-center gap-2 flex-1'>
							{characters
								.filter((character) => character.id !== CAMP_CHEST_ID)
								.map((character) => {
									const isSelected = character.id === activeCharId;
									const isMe =
										viewMode === 'player' && character.id === viewerCharId;
									return (
										<button
											key={character.id}
											onClick={() => setActiveCharId(character.id)}
											className={`flex-1 min-w-[110px] flex items-center gap-2 p-2 rounded-md border text-left transition cursor-pointer relative ${
												isSelected
													? 'bg-gradient-to-b from-amber-950/80 to-stone-900 border-amber-400/80 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
													: 'bg-stone-900/60 border-stone-800 hover:border-amber-800/50 opacity-75 hover:opacity-100'
											}`}
										>
											{isMe && (
												<span className='absolute -top-2 right-2 text-[9px] px-1.5 py-0.2 rounded bg-emerald-900 border border-emerald-400 text-emerald-200 font-semibold'>
													我
												</span>
											)}
											<div className='w-8 h-8 rounded-full bg-stone-800 border border-amber-600/50 flex items-center justify-center text-base shrink-0'>
												{character.avatar}
											</div>
											<div className='overflow-hidden flex-1'>
												<div className='text-xs font-serif font-bold text-amber-100 truncate'>
													{character.name}
												</div>
												<div className='text-[10px] text-stone-400 truncate'>
													STR {character.str}
												</div>
											</div>
										</button>
									);
								})}
						</div>

						<div className='flex items-center gap-1.5 shrink-0'>
							<button
								onClick={onEditCharacter}
								title='編輯目前角色設定 (力量值、名稱)'
								className='p-2 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 hover:text-amber-300 transition cursor-pointer'
							>
								<Settings className='w-4 h-4' />
							</button>

							{viewMode === 'dm' && (
								<button
									onClick={onAddCharacter}
									title='DM 新增冒險者隊員'
									className='p-2 rounded bg-purple-950/90 hover:bg-purple-900 border border-purple-500/70 text-purple-200 transition cursor-pointer'
								>
									<UserPlus className='w-4 h-4' />
								</button>
							)}
						</div>

						<button
							onClick={() => setActiveCharId(CAMP_CHEST_ID)}
							className={`flex-1 min-w-[130px] flex items-center gap-2.5 p-2.5 rounded-md border text-left transition cursor-pointer relative ${
								isCampChestActive
									? 'bg-gradient-to-b from-cyan-950/90 to-stone-900 border-cyan-400/80 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
									: 'bg-stone-900/60 border-stone-800 hover:border-cyan-800/50 opacity-80 hover:opacity-100'
							}`}
						>
							<span className='absolute -top-2 right-2 text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-500/70 text-cyan-200 font-semibold'>
								共用
							</span>
							<div className='w-9 h-9 rounded-full bg-stone-800 border border-cyan-600/50 flex items-center justify-center text-lg shrink-0'>
								🏕️
							</div>
							<div className='overflow-hidden'>
								<div className='text-xs font-serif font-bold text-cyan-100 truncate'>
									營地儲物箱
								</div>
								<div className='text-[10px] text-stone-400 truncate'>
									共 {items.filter((item) => item.ownerId === CAMP_CHEST_ID).length}{' '}
									件公物
								</div>
							</div>
						</button>
					</div>
				</div>
			</section>
		);
	}

	return (
		<div className='grid grid-cols-1 lg:grid-cols-12 gap-4 p-3.5'>
			<div className='lg:col-span-6 flex flex-col justify-center gap-2 border-t lg:border-t-0 lg:border-x border-stone-800'>
				{isCampChestActive ? (
					<div className='space-y-1.5'>
						<div className='flex items-center justify-between text-xs'>
							<span className='flex items-center gap-1.5 text-cyan-300 font-medium'>
								<Tent className='w-3.5 h-3.5 text-cyan-400' />
								<span>營地儲物箱容量 (無限負重)</span>
							</span>
							<span className='font-mono font-semibold text-cyan-200'>
								目前已存放 {encumbranceStats.totalWeight} lbs
							</span>
						</div>
						<p className='text-[11px] text-stone-400 leading-relaxed'>
							所有隊員皆可隨時將笨重的戰利品、備用裝備或團隊物資送往營地，或從儲物箱領出至個人背包。
						</p>
					</div>
				) : (
					<>
						<div>
							<div className='flex items-center justify-between text-xs mb-1'>
								<span className='flex items-center gap-1.5 text-stone-300 font-medium'>
									<Scale className='w-3.5 h-3.5 text-amber-400' />
									<span>負重 (力量 {activeCharacter.str})</span>
								</span>
								<span
									className={`font-mono font-semibold ${
										encumbranceStats.percentage > 85
											? 'text-red-400'
											: 'text-amber-200'
									}`}
								>
									{encumbranceStats.totalWeight} / {encumbranceStats.maxWeight} lbs
								</span>
							</div>
							<div className='w-full h-2 bg-stone-950 rounded-full overflow-hidden border border-stone-700/80'>
								<div
									className={`h-full transition-all duration-300 ${
										encumbranceStats.percentage > 90
											? 'bg-gradient-to-r from-red-600 to-red-400'
											: encumbranceStats.percentage > 65
												? 'bg-gradient-to-r from-amber-600 to-yellow-400'
												: 'bg-gradient-to-r from-amber-700 to-amber-400'
									}`}
									style={{ width: `${encumbranceStats.percentage}%` }}
								/>
							</div>
						</div>

						<div className='flex items-center justify-between text-[11px] text-stone-400 pt-0.5'>
							<div className='flex items-center gap-1.5'>
								<span>同調欄位:</span>
								<div className='flex items-center gap-1'>
									{[1, 2, 3].map((slot) => (
										<span
											key={slot}
											className={`w-3 h-3 rounded-sm rotate-45 inline-block border transition ${
												slot <= attunedCount
													? 'bg-amber-400 border-amber-200 shadow-[0_0_6px_#f59e0b]'
													: 'bg-stone-900 border-stone-600'
											}`}
										/>
									))}
								</div>
								<span className='text-amber-300 font-mono ml-1'>
									{attunedCount}/3
								</span>
							</div>

							<label className='flex items-center gap-1.5 cursor-pointer hover:text-stone-200'>
								<input
									type='checkbox'
									checked={countCoinWeight}
									onChange={(e) => setCountCoinWeight(e.target.checked)}
									className='accent-amber-500 rounded'
								/>
								<span>計入硬幣重 ({coinWeight} lb)</span>
							</label>
						</div>
					</>
				)}
			</div>

			<div className='lg:col-span-6 flex flex-col justify-between border-t lg:border-t-0 border-stone-800 pt-3 lg:pt-0'>
				<div className='flex items-center justify-between mb-1.5'>
					<span className='text-xs text-stone-400 flex items-center gap-1'>
						<Coins className='w-3.5 h-3.5 text-amber-400' />
						<span>角色錢包 (折合 {totalValueInGp} GP)</span>
					</span>
					<button
						onClick={onOpenCurrencyPanel}
						className='text-[11px] px-2 py-0.5 rounded bg-amber-950/90 hover:bg-amber-900 text-amber-300 border border-amber-600/50 transition cursor-pointer'
					>
						管理金錢
					</button>
				</div>

				<div className='grid grid-cols-5 gap-1.5 text-center'>
					{[
						{
							key: 'pp',
							label: 'PP 鉑',
							color: 'text-slate-200 border-slate-400/50 bg-slate-900/70',
						},
						{
							key: 'gp',
							label: 'GP 金',
							color: 'text-amber-300 border-amber-500/60 bg-amber-950/50',
						},
						{
							key: 'ep',
							label: 'EP 電',
							color: 'text-cyan-300 border-cyan-600/50 bg-cyan-950/40',
						},
						{
							key: 'sp',
							label: 'SP 銀',
							color: 'text-stone-300 border-stone-500/50 bg-stone-800/70',
						},
						{
							key: 'cp',
							label: 'CP 銅',
							color: 'text-orange-400 border-orange-600/50 bg-orange-950/40',
						},
					].map((coin) => (
						<div
							key={coin.key}
							onClick={onOpenCurrencyPanel}
							className={`px-1 py-1 rounded border ${coin.color} cursor-pointer hover:brightness-125 transition`}
							title='點擊調整貨幣數量'
						>
							<div className='text-xs font-mono font-bold'>
								{activeCharacter.currencies[coin.key as CurrencyType]}
							</div>
							<div className='text-[9px] opacity-80'>{coin.label}</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
