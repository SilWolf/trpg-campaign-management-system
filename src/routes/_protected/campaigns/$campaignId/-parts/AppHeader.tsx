import { Backpack, Crown, Plus, User, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui';
import { type Character, type ViewMode } from '@/types';
import type { SyncStatus } from '@/hooks/useCampaignSync';

export interface AppHeaderProps {
	isDm: boolean;
	viewMode: ViewMode;
	setViewMode: (mode: ViewMode) => void;
	characters?: Character[];
	viewerCharId?: string;
	setViewerCharId?: (id: string) => void;
	setActiveCharId?: (id: string) => void;
	syncStatus: SyncStatus;
	onCreateHomebrew: () => void;
}

const viewIcons: Record<'player' | 'dm', LucideIcon> = {
	player: User,
	dm: Crown,
};

export default function AppHeader({
	isDm,
	viewMode,
	setViewMode,
	syncStatus,
	onCreateHomebrew,
}: AppHeaderProps) {
	return (
		<header className='relative z-10 border-b border-primary/40 bg-background/90 backdrop-blur-md px-4 lg:px-8 py-3'>
			<div className='max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3'>
				<div className='flex items-center gap-3'>
					<div className='w-10 h-10 rounded-lg bg-gradient-to-br from-primary via-primary to-background border border-primary/60 flex items-center justify-center shadow-lg'>
						<Backpack className='w-5 h-5 text-primary-foreground' />
					</div>
					<div>
						<div className='flex items-center gap-2 flex-wrap'>
							<h1 className='text-lg sm:text-xl font-serif font-bold tracking-wider bg-gradient-to-r from-primary via-primary to-primary bg-clip-text text-transparent'>
								博德之門戰役軍械庫
							</h1>
							<span className='text-[11px] px-2 py-0.5 rounded bg-primary/80 border border-primary/50 text-primary-foreground font-semibold'>
								D&amp;D 5R (2024)
							</span>
							<span
								data-testid='campaign-sync-status'
								className={`text-[11px] px-2 py-0.5 rounded border flex items-center gap-1.5 font-medium ${
									syncStatus === 'synced'
										? 'bg-background/80 border-border/50 text-foreground'
										: syncStatus === 'connecting'
											? 'bg-primary/80 border-primary/50 text-primary-foreground animate-pulse'
											: syncStatus === 'error'
												? 'bg-destructive/80 border-destructive/50 text-destructive-foreground'
												: 'bg-card border-border text-muted-foreground'
								}`}
							>
								<span
									className={`w-2 h-2 rounded-full ${
										syncStatus === 'synced'
											? 'bg-secondary shadow-lg'
											: syncStatus === 'connecting'
												? 'bg-primary'
												: syncStatus === 'error'
													? 'bg-destructive'
													: 'bg-secondary'
									}`}
								/>
								{syncStatus === 'synced'
									? 'Supabase 即時同步中'
									: syncStatus === 'connecting'
										? '連線雲端中...'
										: syncStatus === 'error'
											? '同步異常'
											: '單機預覽模式'}
							</span>
						</div>
						<p className='text-xs text-muted-foreground'>
							細粒度角色權限控制、公開與私人雙錢包、自動四大分類與 Markdown 支援
						</p>
					</div>
				</div>

				{isDm && (
					<div className='flex flex-wrap items-center gap-2.5'>
						{viewMode === 'dm' && (
							<Button
								type='button'
								variant='secondary'
								data-testid='inventory-create-item'
								onClick={onCreateHomebrew}
								className='flex items-center gap-2 px-3.5 py-2 rounded bg-gradient-to-b from-accent to-background border border-border/70 hover:border-border text-foreground text-xs sm:text-sm font-medium shadow-lg hover:brightness-110 transition cursor-pointer'
							>
								<Plus className='w-4 h-4 text-foreground' />
								<span>鍛造自創道具 (Homebrew)</span>
							</Button>
						)}

						<div className='flex bg-card p-1 rounded-lg border border-primary/50'>
							{(['player', 'dm'] as const).map((mode) => {
								const Icon = viewIcons[mode];
								return (
									<Button
										key={mode}
										type='button'
										variant='ghost'
										data-testid={`inventory-view-mode-${mode}`}
										aria-pressed={viewMode === mode}
										onClick={() => setViewMode(mode)}
										className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
											viewMode === mode
												? mode === 'player'
													? 'bg-primary/90 text-primary-foreground border border-primary/60 shadow'
													: 'bg-accent text-accent-foreground border border-ring shadow'
												: 'text-muted-foreground hover:text-foreground'
										}`}
									>
										<Icon
											className={`w-3.5 h-3.5 ${mode === 'dm' ? 'text-primary-foreground' : ''}`}
										/>
										<span>
											{mode === 'player' ? '玩家視角預覽' : 'DM 上帝視角'}
										</span>
									</Button>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</header>
	);
}
