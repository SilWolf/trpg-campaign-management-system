/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route. */
import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui';
import { CampaignJourneyMarkdown } from './-parts/CampaignJourneyMarkdown';
import { JourneyForm } from './-parts/JourneyForm';
import { useCampaignJourneys } from './-parts/CampaignJourneysContext';
import { useJourneyFilters } from './-parts/useJourneyFilters';

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/journeys/',
)({
	component: CampaignJourneysIndex,
});

function CampaignJourneysIndex() {
	const { campaignId, journeys, setJourneys, loading, errorMessage, userId, availabilityMessage } =
		useCampaignJourneys();
	const [isCreating, setIsCreating] = useState(false);
	const { visibleJourneys } = useJourneyFilters(journeys);
	const recentJourneys = useMemo(
		() => [...visibleJourneys].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
		[visibleJourneys],
	);
	const canCreate = Boolean(userId);

	return (
		<main
			data-testid='campaign-journeys-index'
			data-campaign-id={campaignId}
			className='min-w-0'
		>
			<div className='mb-6 flex flex-col justify-between gap-4 border-b border-primary/40 pb-5 sm:flex-row sm:items-end'>
				<div className='min-w-0'>
					<p className='text-xs font-semibold tracking-[0.2em] text-muted-foreground'>
						戰役任務日誌
					</p>
					<h1 className='mt-1 break-words font-serif text-3xl font-bold text-foreground'>
						冒險筆記
					</h1>
					<p className='mt-2 text-sm text-muted-foreground'>
						記錄劇情、線索與任務進度；私人筆記依角色權限顯示。
					</p>
				</div>
				{canCreate && !errorMessage && !availabilityMessage && (
					<Button
						type='button'
						onClick={() => setIsCreating((current) => !current)}
						prefixIcon={<Plus />}
						data-testid='journey-create-open'
					>
						{isCreating ? '取消新增' : '新增筆記'}
					</Button>
				)}
			</div>

			{errorMessage && (
				<p
					role='alert'
					className='mb-4 rounded-md border border-destructive/70 bg-destructive/20 p-3 text-sm text-destructive-foreground'
				>
					{errorMessage}
				</p>
			)}
			{isCreating && (
				<section className='mb-6' aria-label='新增冒險筆記'>
					<h2 className='mb-3 font-serif text-xl font-bold text-foreground'>
						記錄新的冒險
					</h2>
					<JourneyForm
						onCancel={() => setIsCreating(false)}
						onSaved={(journey) => {
							setJourneys((current) => [journey, ...current]);
							setIsCreating(false);
						}}
					/>
				</section>
			)}

			{loading ? (
				<p className='rounded-lg border border-border bg-card/60 p-8 text-center text-sm text-muted-foreground'>
					整理任務日誌中…
				</p>
			) : recentJourneys.length === 0 ? (
				<div
					data-testid='journey-empty-state'
					className='rounded-lg border border-dashed border-border bg-card/40 p-10 text-center'
				>
					<ScrollText className='mx-auto mb-3 h-9 w-9 text-muted-foreground' />
					<h2 className='font-serif text-xl font-bold text-foreground'>
						{journeys.length === 0 ? '這段冒險尚未留下筆記' : '沒有符合篩選條件的筆記'}
					</h2>
					<p className='mt-2 text-sm text-muted-foreground'>
						{journeys.length === 0
							? '把線索、傳聞與重要事件記錄下來，讓隊伍不再遺忘。'
							: '請調整左側的任務、角色或標籤篩選。'}
					</p>
					{canCreate && !availabilityMessage && journeys.length === 0 && (
						<Button
							type='button'
							className='mt-5'
							onClick={() => setIsCreating(true)}
							prefixIcon={<Plus />}
						>
							建立第一篇筆記
						</Button>
					)}
				</div>
			) : (
				<section aria-label='冒險筆記列表' className='grid min-w-0 gap-4'>
					{recentJourneys.map((journey) => (
						<Link
							key={journey.id}
							to='/campaigns/$campaignId/journeys/$journeyId'
							params={{ campaignId, journeyId: journey.id }}
							data-testid={`journey-card-${journey.id}`}
							className='group min-w-0 rounded-lg border border-border bg-card/70 p-4 transition hover:border-primary/70 sm:p-5'
						>
							<div className='flex min-w-0 flex-wrap items-start justify-between gap-3'>
								<div className='min-w-0'>
									<div className='flex flex-wrap items-center gap-2'>
										<h2 className='break-words font-serif text-xl font-bold text-foreground group-hover:text-primary-foreground'>
											{journey.title}
										</h2>
										{journey.isQuest && (
											<span className='rounded border border-primary/50 bg-primary/10 px-2 py-0.5 text-xs text-primary-foreground'>
												任務
											</span>
										)}
										{journey.isCompleted && (
											<span className='rounded border border-success/50 bg-success/10 px-2 py-0.5 text-xs text-success-foreground'>
												已結束
											</span>
										)}
										<span
											className={`rounded border px-2 py-0.5 text-xs ${
												journey.visibility === 'private'
													? 'border-success/50 bg-success/10 text-success-foreground'
													: 'border-primary/50 bg-primary/10 text-primary-foreground'
											}`}
										>
											{journey.visibility === 'private' ? '私人' : '公開'}
										</span>
									</div>
									<p className='mt-2 line-clamp-3 break-words text-sm text-muted-foreground'>
										{journey.content || '尚無筆記內容。'}
									</p>
								</div>
								<time
									dateTime={journey.createdAt}
									className='shrink-0 font-mono text-xs text-muted-foreground'
								>
									{new Intl.DateTimeFormat('zh-TW', {
										dateStyle: 'medium',
									}).format(new Date(journey.createdAt))}
								</time>
							</div>
							{journey.tags.length > 0 && (
								<div className='mt-4 flex flex-wrap gap-2'>
									{journey.tags.map((tag) => (
										<span
											key={tag}
											className='rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground'
										>
											{tag}
										</span>
									))}
								</div>
							)}
							{journey.content && (
								<div className='mt-4 hidden max-h-24 overflow-hidden border-t border-border pt-3 text-xs text-muted-foreground md:block'>
									<CampaignJourneyMarkdown
										content={journey.content}
										campaignId={campaignId}
									/>
								</div>
							)}
						</Link>
					))}
				</section>
			)}
		</main>
	);
}
