import { Backpack } from 'lucide-react';
import { Select } from '@/components/ui';
import type { SyncStatus } from '@/hooks/useCampaignSync';

export interface AppHeaderProps {
	isDm: boolean;
	viewSelection: string;
	onViewSelectionChange: (selection: string) => void;
	players: { id: string; name: string }[];
	syncStatus: SyncStatus;
}

export default function AppHeader({
	isDm,
	viewSelection,
	onViewSelectionChange,
	players,
	syncStatus,
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
											? 'bg-success shadow-lg'
											: syncStatus === 'connecting'
												? 'bg-primary'
												: syncStatus === 'error'
													? 'bg-destructive'
													: 'bg-success'
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
					<div className='flex w-full items-center gap-2 rounded-lg border border-dm/50 bg-dm/5 px-3 py-2 sm:w-auto sm:min-w-72'>
						<label
							htmlFor='inventory-view-selector'
							className='shrink-0 text-sm font-serif font-bold text-dm'
						>
							切換視角:
						</label>
						<Select
							id='inventory-view-selector'
							aria-label='切換預覽視角'
							data-testid='inventory-view-selector'
							value={viewSelection}
							onChange={(event) =>
								onViewSelectionChange(event.currentTarget.value)
							}
							className='min-w-0 flex-1 border-dm/50 bg-card'
						>
							<option value='dm'>DM</option>
							{players.map((player) => (
								<option key={player.id} value={player.id}>
									{player.name}
								</option>
							))}
						</Select>
					</div>
				)}
			</div>
		</header>
	);
}
