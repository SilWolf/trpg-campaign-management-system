import { Coins, Lock, Scale, Tent } from 'lucide-react';
import { Button, Checkbox } from '@/components/ui';
import { CharacterAvatar } from '@/components/CharacterAvatar';
import {
	CAMP_CHEST_ID,
	type Character,
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
	displayedGp: number;
	isDisplayingPrivateWallet: boolean;
	canReadDisplayedWallet: boolean;
	canEditDisplayedWallet: boolean;
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
	displayedGp,
	isDisplayingPrivateWallet,
	canReadDisplayedWallet,
	canEditDisplayedWallet,
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
											variant={isSelected ? 'primary' : 'secondary'}
											data-testid={`inventory-character-${character.id}`}
											aria-pressed={isSelected}
											onClick={() => setActiveCharId(character.id)}
											className={`flex-1 min-w-[110px] flex items-center gap-2 p-2 text-left transition`}
										>
											{isMe && (
												<span className='absolute -top-2 right-2 text-[9px] px-1.5 py-0.2 rounded bg-card border border-border text-foreground font-semibold'>
													我
												</span>
											)}
											<CharacterAvatar
												avatar={character.avatar}
												alt={`${character.name}頭像`}
												className='h-8 w-8 shrink-0 rounded-full border border-primary/50 object-cover'
											/>
											<div className='overflow-hidden flex-1'>
												<div className='text-xs font-serif font-bold truncate'>
													{character.name}
												</div>
												<div className='text-[10px] truncate'>
													STR {character.str}
												</div>
											</div>
										</Button>
									);
								})}
						</div>

						<Button
							type='button'
							variant={isCampChestActive ? 'primary' : 'secondary'}
							data-testid='inventory-character-camp-chest'
							aria-pressed={isCampChestActive}
							onClick={() => setActiveCharId(CAMP_CHEST_ID)}
							className={`min-w-[130px] flex items-center gap-2 p-2 text-left transition relative`}
						>
							<span className='absolute -top-2 right-2 text-[9px] px-1.5 py-0.2 rounded bg-background border border-border/70 text-foreground font-semibold'>
								共用
							</span>
							<div className='w-8 h-8 rounded-full bg-muted border border-border/50 flex items-center justify-center text-lg shrink-0'>
								🏕️
							</div>
							<div className='overflow-hidden'>
								<div className='text-xs font-serif font-bold truncate'>
									營地儲物箱
								</div>
								<div className='text-[10px] truncate'>
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
			<div className='lg:col-span-6 flex flex-col justify-center gap-2 border-t lg:border-t-0 border-border'>
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
								<span className='flex items-center gap-1.5 text-highlight font-medium'>
									<Scale className='w-3.5 h-3.5' />
									<span>負重 (力量 {activeCharacter.str})</span>
								</span>
								<span
									data-testid='inventory-encumbrance'
									className={`font-mono font-semibold ${
										encumbranceStats.percentage > 85
											? 'text-warning-foreground'
											: ''
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
								<span className='font-mono ml-1'>{attunedCount}/3</span>
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
									: '角色公開錢包'}
						</span>
					</span>
					<div className='flex items-center gap-1.5'>
						{canEditDisplayedWallet && (
							<Button
								type='button'
								variant='secondary'
								size='sm'
								data-testid='inventory-currency-open'
								onClick={onOpenCurrencyPanel}
							>
								轉帳
							</Button>
						)}
					</div>
				</div>

				{canEditDisplayedWallet ? (
					<Button
						type='button'
						variant='ghost'
						size='sm'
						data-testid='currency-summary-gp'
						onClick={onOpenCurrencyPanel}
						aria-label='GP 餘額，點擊開啟轉帳'
					>
						<div className='text-xs font-mono font-bold text-money'>
							{canReadDisplayedWallet ? `${displayedGp} GP` : '🔒'}
						</div>
						<div className='text-[9px] opacity-80'>GP 餘額</div>
					</Button>
				) : (
					<div
						data-testid='currency-summary-gp'
						className='inline-flex flex-col items-center justify-center rounded-control px-3 py-2 text-sm'
					>
					<div className='text-xs font-mono font-bold text-money'>
						{canReadDisplayedWallet ? `${displayedGp} GP` : '🔒'}
					</div>
					<div className='text-[9px] opacity-80'>GP 餘額</div>
					</div>
				)}
			</div>
		</div>
	);
}
