/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route. */
import { useMemo } from 'react';
import {
	createFileRoute,
	Link,
	Outlet,
	useParams,
} from '@tanstack/react-router';
import { BookOpenText, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui';
import {
	CampaignJourneysProvider,
	useCampaignJourneys,
} from './-parts/CampaignJourneysContext';

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/journeys',
)({
	component: CampaignJourneysLayout,
});

function CampaignJourneysLayout() {
	const { campaignId } = useParams({
		from: '/_protected/campaigns/$campaignId/journeys',
	});

	return (
		<CampaignJourneysProvider key={campaignId} campaignId={campaignId}>
			<CampaignJourneysNavigation />
		</CampaignJourneysProvider>
	);
}

function CampaignJourneysNavigation() {
	const {
		campaignId,
		journeys,
		characters,
		loading,
		errorMessage,
		availabilityMessage,
		filter,
		setFilter,
		characterFilter,
		setCharacterFilter,
		tagFilter,
		setTagFilter,
	} = useCampaignJourneys();
	const tags = useMemo(
		() => [...new Set(journeys.flatMap((journey) => journey.tags))].sort(),
		[journeys],
	);
	const visibleJourneys = useMemo(
		() =>
			journeys.filter((journey) => {
				if (filter === 'quests' && !journey.isQuest) return false;
				if (filter === 'completed' && !journey.isCompleted) return false;
				if (
					characterFilter === '__unassigned__' &&
					journey.characterId !== null
				) {
					return false;
				}
				if (
					characterFilter &&
					characterFilter !== '__unassigned__' &&
					journey.characterId !== characterFilter
				) {
					return false;
				}
				if (tagFilter && !journey.tags.includes(tagFilter)) return false;
				return true;
			}),
		[characterFilter, filter, journeys, tagFilter],
	);

	return (
		<div
			data-testid='campaign-journeys-layout'
			className='mx-auto grid max-w-7xl gap-5 px-4 py-5 text-foreground lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8'
		>
			<aside
				aria-label='冒險筆記篩選與導覽'
				className='h-fit min-w-0 rounded-lg border border-border bg-card/70 p-3'
			>
				<div className='mb-3 flex items-center justify-between px-2'>
					<h2 className='font-serif font-bold text-foreground'>任務日誌</h2>
					<span
						data-testid='journey-visible-count'
						className='font-mono text-xs text-muted-foreground'
					>
						{visibleJourneys.length}
					</span>
				</div>
				<div className='grid grid-cols-3 gap-1'>
					{(
						[
							['all', '全部'],
							['quests', '任務'],
							['completed', '已結束'],
						] as const
					).map(([value, label]) => (
						<Button
							key={value}
							type='button'
							size='sm'
							variant={filter === value ? 'secondary-active' : 'ghost'}
							aria-pressed={filter === value}
							data-testid={`journey-filter-${value}`}
							onClick={() => setFilter(value)}
						>
							{label}
						</Button>
					))}
				</div>
				<label className='mt-3 grid gap-1.5 text-xs font-medium text-foreground'>
					依角色篩選
					<select
						aria-label='依角色篩選冒險筆記'
						value={characterFilter}
						onChange={(event) => setCharacterFilter(event.target.value)}
						className='w-full min-w-0 rounded-control border border-border bg-input px-2 py-2 text-sm text-foreground'
					>
						<option value=''>全部角色</option>
						<option value='__unassigned__'>無所屬角色</option>
						{characters.map((character) => (
							<option key={character.id} value={character.id}>
								{character.name}
							</option>
						))}
					</select>
				</label>
				<label className='mt-3 grid gap-1.5 text-xs font-medium text-foreground'>
					依標籤篩選
					<select
						aria-label='依標籤篩選冒險筆記'
						value={tagFilter}
						onChange={(event) => setTagFilter(event.target.value)}
						className='w-full min-w-0 rounded-control border border-border bg-input px-2 py-2 text-sm text-foreground'
					>
						<option value=''>全部標籤</option>
						{tags.map((tag) => (
							<option key={tag} value={tag}>
								{tag}
							</option>
						))}
					</select>
				</label>
				<Link
					to='/campaigns/$campaignId/journeys'
					params={{ campaignId }}
					activeOptions={{ exact: true }}
					className='mt-4 flex items-center gap-2 rounded-md border-t border-border px-2 pt-3 text-sm text-muted-foreground hover:text-foreground [&.active]:text-primary-foreground'
				>
					<BookOpenText className='h-4 w-4' />
					冒險筆記總覽
				</Link>
				{availabilityMessage ? (
					<p className='mt-3 rounded-md border border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground'>
						{availabilityMessage}
					</p>
				) : errorMessage ? (
					<p
						role='alert'
						className='mt-3 rounded-md border border-destructive/70 bg-destructive/20 px-3 py-2 text-xs text-destructive-foreground'
					>
						{errorMessage}
					</p>
				) : loading ? (
					<p className='px-2 py-4 text-sm text-muted-foreground'>
						載入冒險筆記中…
					</p>
				) : visibleJourneys.length === 0 ? (
					<div className='mt-3 rounded-md border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground'>
						<ScrollText className='mx-auto mb-2 h-5 w-5' />
						{journeys.length === 0 ? '目前沒有可閱讀的筆記。' : '篩選結果為空。'}
					</div>
				) : (
					<nav aria-label='可閱讀的冒險筆記' className='mt-3 grid gap-1'>
						{visibleJourneys.map((journey) => (
							<Link
								key={journey.id}
								to='/campaigns/$campaignId/journeys/$journeyId'
								params={{ campaignId, journeyId: journey.id }}
								activeOptions={{ exact: true }}
								data-testid={`journey-sidebar-link-${journey.id}`}
								className='flex min-w-0 items-start gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground [&.active]:bg-primary/50 [&.active]:text-primary-foreground'
							>
								<ScrollText className='mt-0.5 h-4 w-4 shrink-0' />
								<span className='min-w-0 break-words'>{journey.title}</span>
							</Link>
						))}
					</nav>
				)}
			</aside>
			<Outlet />
		</div>
	);
}
