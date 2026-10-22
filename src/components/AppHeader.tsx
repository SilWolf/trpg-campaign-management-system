import { Backpack, Crown, Plus, User, type LucideIcon } from 'lucide-react';
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
		<header className='relative z-10 border-b border-amber-900/40 bg-stone-950/90 backdrop-blur-md px-4 lg:px-8 py-3'>
			<div className='max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3'>
				<div className='flex items-center gap-3'>
					<div className='w-10 h-10 rounded-lg bg-gradient-to-br from-amber-700 via-amber-900 to-stone-950 border border-amber-500/60 flex items-center justify-center shadow-[0_0_15px_rgba(217,119,6,0.3)]'>
						<Backpack className='w-5 h-5 text-amber-300' />
					</div>
					<div>
						<div className='flex items-center gap-2 flex-wrap'>
							<h1 className='text-lg sm:text-xl font-serif font-bold tracking-wider bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent'>
								博德之門戰役軍械庫
							</h1>
							<span className='text-[11px] px-2 py-0.5 rounded bg-amber-950/80 border border-amber-600/50 text-amber-300 font-semibold'>
								D&amp;D 5R (2024)
							</span>
							<span
								className={`text-[11px] px-2 py-0.5 rounded border flex items-center gap-1.5 font-medium ${
									syncStatus === 'synced'
										? 'bg-emerald-950/80 border-emerald-600/50 text-emerald-300'
										: syncStatus === 'connecting'
											? 'bg-amber-950/80 border-amber-600/50 text-amber-300 animate-pulse'
											: syncStatus === 'error'
												? 'bg-red-950/80 border-red-600/50 text-red-300'
												: 'bg-stone-900 border-stone-700 text-stone-400'
								}`}
							>
								<span
									className={`w-2 h-2 rounded-full ${
										syncStatus === 'synced'
											? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
											: syncStatus === 'connecting'
												? 'bg-amber-400'
												: syncStatus === 'error'
													? 'bg-red-400'
													: 'bg-stone-500'
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
						<p className='text-xs text-stone-400'>
							細粒度角色權限控制、公開與私人雙錢包、自動四大分類與 Markdown 支援
						</p>
					</div>
				</div>

				{isDm && (
					<div className='flex flex-wrap items-center gap-2.5'>
						{viewMode === 'dm' && (
							<button
								onClick={onCreateHomebrew}
								className='flex items-center gap-2 px-3.5 py-2 rounded bg-gradient-to-b from-purple-700 to-purple-950 border border-purple-400/70 hover:border-purple-300 text-purple-100 text-xs sm:text-sm font-medium shadow-[0_0_15px_rgba(168,85,247,0.35)] hover:brightness-110 transition cursor-pointer'
							>
								<Plus className='w-4 h-4 text-purple-300' />
								<span>鍛造自創道具 (Homebrew)</span>
							</button>
						)}

						<div className='flex bg-stone-900 p-1 rounded-lg border border-amber-800/50'>
							{(['player', 'dm'] as const).map((mode) => {
								const Icon = viewIcons[mode];
								return (
									<button
										key={mode}
										onClick={() => setViewMode(mode)}
										className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
											viewMode === mode
												? mode === 'player'
													? 'bg-amber-700/90 text-amber-50 border border-amber-400/60 shadow'
													: 'bg-red-900/90 text-red-100 border border-red-400/70 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
												: 'text-stone-400 hover:text-stone-200'
										}`}
									>
										<Icon
											className={`w-3.5 h-3.5 ${mode === 'dm' ? 'text-amber-400' : ''}`}
										/>
										<span>
											{mode === 'player' ? '玩家視角預覽' : 'DM 上帝視角'}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</header>
	);
}
