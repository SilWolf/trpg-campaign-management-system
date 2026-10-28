import { Coins, Lock, Scale, Tent } from 'lucide-react';
import { Button, Checkbox } from '@/components/ui';
import {
	CAMP_CHEST_ID,
	type Character,
	type CurrencyType,
	type ViewMode,
} from '@/types';

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
	displayedCurrencies: Record<CurrencyType, number>;
	isDisplayingPrivateWallet: boolean;
	canReadDisplayedWallet: boolean;
	onOpenCurrencyPanel: () => void;
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
	displayedCurrencies,
	isDisplayingPrivateWallet,
	canReadDisplayedWallet,
	onOpenCurrencyPanel,
}: CharacterStatusBarProps) {
	if (placement === 'characters') {
		return (
			<section className='relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pt-5'>
				<div className='grid grid-cols-1 lg:grid-cols-12 gap-4 bg-gradient-to-b from-card/90 to-background/95 border border-primary/40 rounded-lg p-4 shadow-xl'>
					<div className='lg:col-span-12 flex flex-col sm:flex-row items-stretch sm:items-center gap-2'>
						<div className='flex flex-wrap sm:flex-nowrap items-center gap-2 flex-1'>
							{characters
								.filter((character) => character.id !== CAMP_CHEST_ID)
								.map((character) => {
									const isSelected = character.id === activeCharId;
									const isMe =
										viewMode === 'player' && character.id === viewerCharId;
									return (
										<Button
											key={character.id}
											type='button'
											variant='ghost'
											data-testid={`inventory-character-${character.id}`}
											aria-pressed={isSelected}
											onClick={() => setActiveCharId(character.id)}
											className={`flex-1 min-w-[110px] flex items-center gap-2 p-2 rounded-md border text-left transition cursor-pointer relative ${
												isSelected
													? 'bg-gradient-to-b from-primary/80 to-card border-primary/80 shadow-lg'
													: 'bg-card/60 border-border hover:border-primary/50 opacity-75 hover:opacity-100'
											}`}
										>
											{isMe && (
												<span className='absolute -top-2 right-2 text-[9px] px-1.5 py-0.2 rounded bg-card border border-border text-foreground font-semibold'>
													我
												</span>
											)}
											<div className='w-8 h-8 rounded-full bg-muted border border-primary/50 flex items-center justify-center text-base shrink-0'>
												{character.avatar}
											</div>
											<div className='overflow-hidden flex-1'>
												<div className='text-xs font-serif font-bold text-primary-foreground truncate'>
													{character.name}
												</div>
												<div className='text-[10px] text-muted-foreground truncate'>
													STR {character.str}
												</div>
											</div>
										</Button>
									);
								})}
						</div>

						<Button
							type='button'
							variant='ghost'
							data-testid='inventory-character-camp-chest'
							aria-pressed={isCampChestActive}
							onClick={() => setActiveCharId(CAMP_CHEST_ID)}
							className={`min-w-[130px] flex items-center gap-2.5 p-2.5 rounded-md border text-left transition cursor-pointer relative ${
								isCampChestActive
									? 'bg-accent text-accent-foreground border-ring shadow'
									: 'bg-card/60 border-border hover:border-border/50 opacity-80 hover:opacity-100'
							}`}
						>
							<span className='absolute -top-2 right-2 text-[9px] px-1.5 py-0.2 rounded bg-background border border-border/70 text-foreground font-semibold'>
								共用
							</span>
							<div className='w-9 h-9 rounded-full bg-muted border border-border/50 flex items-center justify-center text-lg shrink-0'>
								🏕️
							</div>
							<div className='overflow-hidden'>
								<div className='text-xs font-serif font-bold text-foreground truncate'>
									營地儲物箱
								</div>
								<div className='text-[10px] text-muted-foreground truncate'>
									共{' '}
									{
										items.filter((item) => item.ownerId === CAMP_CHEST_ID)
											.length
									}{' '}
									件公物
								</div>
							</div>
						</Button>
					</div>
				</div>
			</section>
		);
	}

	return (
		<div className='grid grid-cols-1 lg:grid-cols-12 gap-4 p-3.5'>
			<div className='lg:col-span-6 flex flex-col justify-center gap-2 border-t lg:border-t-0 lg:border-x border-border'>
				{isCampChestActive ? (
					<div className='space-y-1.5'>
						<div className='flex items-center justify-between text-xs'>
							<span className='flex items-center gap-1.5 text-foreground font-medium'>
								<Tent className='w-3.5 h-3.5 text-muted-foreground' />
								<span>營地儲物箱容量 (無限負重)</span>
							</span>
							<span className='font-mono font-semibold text-foreground'>
								目前已存放 {encumbranceStats.totalWeight} lbs
							</span>
						</div>
						<p className='text-[11px] text-muted-foreground leading-relaxed'>
							所有隊員皆可隨時將笨重的戰利品、備用裝備或團隊物資送往營地，或從儲物箱領出至個人背包。
						</p>
					</div>
				) : (
					<>
						<div>
							<div className='flex items-center justify-between text-xs mb-1'>
								<span className='flex items-center gap-1.5 text-foreground font-medium'>
									<Scale className='w-3.5 h-3.5 text-primary-foreground' />
									<span>負重 (力量 {activeCharacter.str})</span>
								</span>
								<span
									data-testid='inventory-encumbrance'
									className={`font-mono font-semibold ${
										encumbranceStats.percentage > 85
											? 'text-warning-foreground'
											: 'text-primary-foreground'
									}`}
								>
									{encumbranceStats.totalWeight} / {encumbranceStats.maxWeight}{' '}
									lbs
								</span>
							</div>
							<div className='w-full h-2 bg-background rounded-full overflow-hidden border border-border/80'>
								<div
									className={`h-full transition-all duration-300 ${
										encumbranceStats.percentage > 90
											? 'bg-warning'
											: encumbranceStats.percentage > 65
												? 'bg-gradient-to-r from-primary to-warning'
												: 'bg-gradient-to-r from-primary to-primary'
									}`}
									style={{ width: `${encumbranceStats.percentage}%` }}
								/>
							</div>
						</div>

						<div className='flex items-center justify-between text-[11px] text-muted-foreground pt-0.5'>
							<div className='flex items-center gap-1.5'>
								<span>同調欄位:</span>
								<div className='flex items-center gap-1'>
									{[1, 2, 3].map((slot) => (
										<span
											key={slot}
											className={`w-3 h-3 rounded-sm rotate-45 inline-block border transition ${
												slot <= attunedCount
													? 'bg-primary border-primary shadow-lg'
													: 'bg-card border-border'
											}`}
										/>
									))}
								</div>
								<span className='text-primary-foreground font-mono ml-1'>
									{attunedCount}/3
								</span>
							</div>

							<Checkbox
								label={`計入硬幣重 (${coinWeight} lb)`}
								data-testid='inventory-count-coin-weight'
								checked={countCoinWeight}
								onChange={(e) => setCountCoinWeight(e.target.checked)}
								labelClassName='gap-1.5 cursor-pointer text-[11px] text-muted-foreground hover:text-foreground'
							/>
						</div>
					</>
				)}
			</div>

			<div className='lg:col-span-6 flex flex-col justify-between border-t lg:border-t-0 border-border pt-3 lg:pt-0'>
				<div className='flex items-center justify-between mb-1.5'>
					<span className='text-xs text-muted-foreground flex items-center gap-1'>
						{isDisplayingPrivateWallet ? (
							<Lock className='w-3.5 h-3.5 text-muted-foreground' />
						) : (
							<Coins className='w-3.5 h-3.5 text-money' />
						)}
						<span className='text-highlight'>
							{isCampChestActive
								? '營地公庫錢包'
								: isDisplayingPrivateWallet
									? '私人暗袋錢包'
									: '角色公開錢包'}{' '}
							(折合{' '}
							<span
								className={`font-mono ${canReadDisplayedWallet ? 'text-money' : 'text-muted-foreground'}`}
							>
								{canReadDisplayedWallet ? `${totalValueInGp} GP` : '???'}
							</span>
							)
						</span>
					</span>
					<Button
						type='button'
						variant='secondary'
						size='sm'
						data-testid='inventory-currency-open'
						onClick={onOpenCurrencyPanel}
						className='text-[11px] px-2 py-0.5 rounded bg-primary/90 hover:bg-primary text-primary-foreground border border-primary/50 transition cursor-pointer'
					>
						管理錢包
					</Button>
				</div>

				<div className='grid grid-cols-5 gap-1.5 text-center'>
					{[
						{
							key: 'pp',
							label: 'PP 鉑',
							color: 'text-foreground border-border/50 bg-card/70',
						},
						{
							key: 'gp',
							label: 'GP 金',
							color: 'text-primary-foreground border-primary/60 bg-primary/50',
						},
						{
							key: 'ep',
							label: 'EP 電',
							color: 'text-foreground border-border/50 bg-background/40',
						},
						{
							key: 'sp',
							label: 'SP 銀',
							color: 'text-foreground border-border/50 bg-muted/70',
						},
						{
							key: 'cp',
							label: 'CP 銅',
							color: 'text-muted-foreground border-border/50 bg-background/40',
						},
					].map((coin) => (
						<Button
							type='button'
							variant='ghost'
							size='sm'
							key={coin.key}
							data-testid={`currency-summary-${coin.key}`}
							onClick={onOpenCurrencyPanel}
							className={`px-1 py-1 rounded border ${coin.color} cursor-pointer hover:brightness-125 transition`}
							aria-label={`${coin.label}，點擊開啟錢包管理`}
						>
							<div
								className={`text-xs font-mono font-bold ${coin.key === 'gp' && canReadDisplayedWallet ? 'text-money' : ''}`}
							>
								{canReadDisplayedWallet
									? (displayedCurrencies[coin.key as CurrencyType] ?? 0)
									: '🔒'}
							</div>
							<div className='text-[9px] opacity-80'>{coin.label}</div>
						</Button>
					))}
				</div>
			</div>
		</div>
	);
}
