/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route. */
import { useEffect, useRef, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, LockKeyhole, Pencil, ScrollText, Trash2 } from 'lucide-react';
import { Button, Textarea } from '@/components/ui';
import { useConfirm } from '@/contexts/FeedbackContext';
import { evaluateCharacterPermissions } from '@/hooks/useCharacterPermissions';
import {
	deleteCampaignJourney,
	loadCampaignJourneyDmNote,
	saveCampaignJourneyDmNote,
} from '@/lib/campaignJourneys';
import { useCampaignJourneys } from './-parts/CampaignJourneysContext';
import { CampaignJourneyMarkdown } from './-parts/CampaignJourneyMarkdown';
import { JourneyForm } from './-parts/JourneyForm';
import { JourneyImageUploadField } from './-parts/JourneyImageUploadField';
import type { CampaignJourneyDmNote } from '@/types';

type DmNoteState = {
	key: string;
	status: 'loading' | 'ready' | 'error';
	note: CampaignJourneyDmNote | null;
	error?: string;
};

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/journeys/$journeyId',
)({
	component: CampaignJourneyDetails,
});

function CampaignJourneyDetails() {
	const { campaignId, journeyId } = Route.useParams();
	const navigate = useNavigate();
	const confirm = useConfirm();
	const {
		journeys,
		setJourneys,
		characters,
		permissions,
		isDm,
		roleLoading,
		userId,
		loading,
		errorMessage,
	} = useCampaignJourneys();
	const [isEditing, setIsEditing] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [dmNoteState, setDmNoteState] = useState<DmNoteState>({
		key: '',
		status: 'loading',
		note: null,
	});
	const [dmNoteDraft, setDmNoteDraft] = useState('');
	const dmNoteTextareaRef = useRef<HTMLTextAreaElement>(null);
	const [isEditingDmNote, setIsEditingDmNote] = useState(false);
	const [isSavingDmNote, setIsSavingDmNote] = useState(false);
	const [dmNoteReloadVersion, setDmNoteReloadVersion] = useState(0);
	const dmNoteRequestVersion = useRef(0);
	const journey = journeys.find((entry) => entry.id === journeyId);
	const currentJourneyId = journey?.id ?? null;
	const dmNoteKey = JSON.stringify([
		campaignId,
		userId,
		journeyId,
		isDm,
		roleLoading,
	]);
	const currentDmNoteState =
		dmNoteState.key === dmNoteKey
			? dmNoteState
			: { key: dmNoteKey, status: 'loading' as const, note: null };
	const character = characters.find(
		(entry) => entry.id === journey?.characterId,
	);
	const canManage = journey
		? isDm ||
			(journey.visibility === 'public'
				? journey.createdBy === userId
				: Boolean(
						character &&
							evaluateCharacterPermissions(
								character.id,
								userId,
								permissions,
								isDm,
								'player',
								character.userId,
							).canManagePrivateJourneys,
					))
		: false;

	function insertDmNoteImage(reference: string) {
		const textarea = dmNoteTextareaRef.current;
		if (!textarea) return;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const currentContent = textarea.value;
		const before = currentContent.slice(0, start);
		const after = currentContent.slice(end);
		const prefix = before.length > 0 && !before.endsWith('\n') ? '\n\n' : '';
		const suffix = after.length > 0 && !after.startsWith('\n') ? '\n\n' : '';
		const markdown = `![冒險筆記圖片](${reference})`;
		const insertion = `${prefix}${markdown}${suffix}`;
		setDmNoteDraft(`${before}${insertion}${after}`);
		requestAnimationFrame(() => {
			textarea.focus();
			const cursor = before.length + insertion.length;
			textarea.setSelectionRange(cursor, cursor);
		});
	}

	useEffect(() => {
		const version = ++dmNoteRequestVersion.current;
		let active = true;
		if (!roleLoading && (!isDm || !userId || !currentJourneyId)) {
			setDmNoteState({ key: dmNoteKey, status: 'ready', note: null });
			setDmNoteDraft('');
			setIsEditingDmNote(false);
			return () => {
				active = false;
				if (dmNoteRequestVersion.current === version) {
					dmNoteRequestVersion.current += 1;
				}
			};
		}
		if (roleLoading || !isDm || !userId || !currentJourneyId) {
			return () => {
				active = false;
				if (dmNoteRequestVersion.current === version) {
					dmNoteRequestVersion.current += 1;
				}
			};
		}

		setDmNoteState({ key: dmNoteKey, status: 'loading', note: null });
		setDmNoteDraft('');
		setIsEditingDmNote(false);
		void loadCampaignJourneyDmNote(campaignId, currentJourneyId, true)
			.then((note) => {
				if (!active || dmNoteRequestVersion.current !== version) return;
				setDmNoteState({ key: dmNoteKey, status: 'ready', note });
				setDmNoteDraft(note?.content ?? '');
			})
			.catch((error: unknown) => {
				if (!active || dmNoteRequestVersion.current !== version) return;
				setDmNoteState({
					key: dmNoteKey,
					status: 'error',
					note: null,
					error:
						error instanceof Error
							? error.message
							: '載入 DM 專屬筆記失敗。',
				});
			});

		return () => {
			active = false;
			if (dmNoteRequestVersion.current === version) {
				dmNoteRequestVersion.current += 1;
			}
		};
	}, [
		campaignId,
		currentJourneyId,
		dmNoteKey,
		dmNoteReloadVersion,
		isDm,
		roleLoading,
		userId,
	]);

	async function handleSaveDmNote() {
		if (!isDm || roleLoading || !journey || isSavingDmNote) return;
		const version = dmNoteRequestVersion.current;
		setIsSavingDmNote(true);
		setDmNoteState((current) => ({ ...current, error: undefined }));
		try {
			const note = await saveCampaignJourneyDmNote(
				campaignId,
				journey.id,
				dmNoteDraft,
				true,
			);
			if (dmNoteRequestVersion.current !== version) return;
			setDmNoteState({ key: dmNoteKey, status: 'ready', note });
			setDmNoteDraft(note.content);
			setIsEditingDmNote(false);
		} catch (error) {
			if (dmNoteRequestVersion.current !== version) return;
			setDmNoteState((current) => ({
				...current,
				status: 'error',
				error:
					error instanceof Error ? error.message : '儲存 DM 專屬筆記失敗。',
			}));
		} finally {
			if (dmNoteRequestVersion.current === version) {
				setIsSavingDmNote(false);
			}
		}
	}

	async function handleDelete() {
		if (!journey || !canManage || isDeleting) return;
		const confirmed = await confirm({
			title: '刪除冒險筆記',
			message: `確定永久刪除「${journey.title}」嗎？此操作無法復原。`,
			confirmLabel: '刪除筆記',
			variant: 'danger',
		});
		if (!confirmed) return;

		setDeleteError(null);
		setIsDeleting(true);
		try {
			await deleteCampaignJourney(campaignId, journey.id);
			setJourneys((current) =>
				current.filter((entry) => entry.id !== journey.id),
			);
			await navigate({
				to: '/campaigns/$campaignId/journeys',
				params: { campaignId },
			});
		} catch (error) {
			setDeleteError(
				error instanceof Error ? error.message : '刪除冒險筆記失敗。',
			);
		} finally {
			setIsDeleting(false);
		}
	}

	if (loading || roleLoading) {
		return (
			<main className='min-w-0 rounded-lg border border-border bg-card/60 p-8 text-center text-sm text-muted-foreground'>
				載入筆記詳情中…
			</main>
		);
	}

	if (errorMessage) {
		return (
			<main className='min-w-0 rounded-lg border border-destructive/70 bg-destructive/20 p-6'>
				<p role='alert' className='text-sm text-destructive-foreground'>
					{errorMessage}
				</p>
			</main>
		);
	}

	if (!journey) {
		return (
			<main
				data-testid='journey-not-found'
				className='min-w-0 rounded-lg border border-border bg-card/70 p-8 text-center'
			>
				<ScrollText className='mx-auto mb-3 h-8 w-8 text-muted-foreground' />
				<h1 className='font-serif text-2xl font-bold text-foreground'>
					找不到這篇筆記
				</h1>
				<p className='mt-2 text-sm text-muted-foreground'>
					筆記可能已刪除，或目前帳號沒有閱讀權限。
				</p>
				<Button asChild variant='secondary' className='mt-5'>
					<Link
						to='/campaigns/$campaignId/journeys'
						params={{ campaignId }}
					>
						<ArrowLeft className='h-4 w-4' />
						返回冒險筆記
					</Link>
				</Button>
			</main>
		);
	}

	if (isEditing && canManage) {
		return (
			<main className='min-w-0'>
				<div className='mb-4'>
					<Button
						type='button'
						variant='ghost'
						onClick={() => setIsEditing(false)}
						prefixIcon={<ArrowLeft />}
					>
						返回筆記
					</Button>
				</div>
				<h1 className='mb-4 font-serif text-2xl font-bold text-foreground'>
					編輯冒險筆記
				</h1>
				<JourneyForm
					initialJourney={journey}
					onCancel={() => setIsEditing(false)}
					onSaved={(updatedJourney) => {
						setJourneys((current) =>
							current.map((entry) =>
								entry.id === updatedJourney.id ? updatedJourney : entry,
							),
						);
						setIsEditing(false);
					}}
				/>
			</main>
		);
	}

	return (
		<main
			data-testid='campaign-journey-detail'
			data-journey-id={journey.id}
			className='min-w-0 overflow-hidden rounded-lg border border-border bg-card/70'
		>
			<header className='border-b border-border bg-background/40 p-4 sm:p-6'>
				<div className='flex flex-wrap items-center justify-between gap-3'>
					<div className='flex flex-wrap items-center gap-2'>
						<span
							className={`rounded border px-2 py-0.5 text-xs ${
								journey.visibility === 'private'
									? 'border-success/50 bg-success/10 text-success-foreground'
									: 'border-primary/50 bg-primary/10 text-primary-foreground'
							}`}
						>
							{journey.visibility === 'private' ? (
								<span className='inline-flex items-center gap-1'>
									<LockKeyhole className='h-3 w-3' />
									私人筆記
								</span>
							) : (
								'公開筆記'
							)}
						</span>
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
					</div>
					{canManage && (
						<div className='flex flex-wrap gap-2'>
							<Button
								type='button'
								variant='secondary'
								onClick={() => setIsEditing(true)}
								prefixIcon={<Pencil />}
								data-testid='journey-edit'
							>
								編輯
							</Button>
							<Button
								type='button'
								variant='danger'
								loading={isDeleting}
								onClick={() => void handleDelete()}
								prefixIcon={<Trash2 />}
								data-testid='journey-delete'
							>
								刪除
							</Button>
						</div>
					)}
				</div>
				<h1
					data-testid='journey-detail-title'
					className='mt-4 break-words font-serif text-3xl font-bold text-foreground'
				>
					{journey.title}
				</h1>
				<div className='mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
					<span>所屬角色：{character?.name ?? '無'}</span>
					<span>
						建立者：
						{journey.createdBy === userId
							? '你'
							: `${journey.createdBy.slice(0, 8)}…`}
					</span>
					<time dateTime={journey.createdAt}>
						{new Intl.DateTimeFormat('zh-TW', {
							dateStyle: 'medium',
							timeStyle: 'short',
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
			</header>
			{deleteError && (
				<p
					role='alert'
					className='m-4 rounded-md border border-destructive/70 bg-destructive/20 p-3 text-sm text-destructive-foreground'
				>
					刪除失敗：{deleteError}
				</p>
			)}
			<article
				data-testid='journey-markdown-content'
				className='min-w-0 overflow-hidden p-4 sm:p-6'
			>
				{journey.content ? (
					<CampaignJourneyMarkdown
						content={journey.content}
						campaignId={campaignId}
					/>
				) : (
					<p className='text-sm italic text-muted-foreground'>尚無筆記內容。</p>
				)}
			</article>
			{!roleLoading && isDm && (
				<section
					data-testid='journey-dm-note'
					className='border-t border-dm/50 bg-dm/10 p-4 sm:p-6'
				>
					<div className='flex flex-wrap items-center justify-between gap-3'>
						<h2 className='font-serif text-xl font-bold text-dm'>
							DM 專屬筆記
						</h2>
						{currentDmNoteState.status === 'ready' && !isEditingDmNote && (
							<Button
								type='button'
								variant='secondary-dm'
								onClick={() => {
									setDmNoteDraft(currentDmNoteState.note?.content ?? '');
									setIsEditingDmNote(true);
								}}
								prefixIcon={<Pencil />}
								data-testid='journey-dm-note-edit'
							>
								{currentDmNoteState.note ? '編輯 DM 筆記' : '新增 DM 筆記'}
							</Button>
						)}
					</div>
					{currentDmNoteState.status === 'loading' ? (
						<p className='mt-3 text-sm text-muted-foreground'>
							載入 DM 專屬筆記中…
						</p>
					) : currentDmNoteState.status === 'error' &&
					  !isEditingDmNote ? (
						<div className='mt-3 grid gap-2'>
							<p role='alert' className='text-sm text-destructive-foreground'>
								{currentDmNoteState.error}
							</p>
							<Button
								type='button'
								variant='secondary-dm'
								onClick={() =>
									setDmNoteReloadVersion((version) => version + 1)
								}
								data-testid='journey-dm-note-retry'
							>
								重新載入
							</Button>
						</div>
					) : isEditingDmNote ? (
						<div className='mt-3 grid gap-3'>
							{currentDmNoteState.status === 'error' &&
								currentDmNoteState.error && (
									<p
										role='alert'
										className='text-sm text-destructive-foreground'
									>
										{currentDmNoteState.error}
									</p>
								)}
							<Textarea
								ref={dmNoteTextareaRef}
								label='DM 專屬內容'
								value={dmNoteDraft}
								onChange={(event) => setDmNoteDraft(event.target.value)}
								rows={8}
								description='僅戰役 DM 可讀取；支援 Markdown。'
								data-testid='journey-dm-note-content'
							/>
							<JourneyImageUploadField
								campaignId={campaignId}
								journeyId={journey.id}
								onInsert={insertDmNoteImage}
								buttonVariant='secondary-dm'
							/>
							<div className='flex flex-wrap justify-end gap-2'>
								<Button
									type='button'
									variant='secondary-dm'
									onClick={() => {
										setDmNoteDraft(
											currentDmNoteState.note?.content ?? '',
										);
										setIsEditingDmNote(false);
									}}
								>
									取消
								</Button>
								<Button
									type='button'
									variant='primary-dm'
									loading={isSavingDmNote}
									onClick={() => void handleSaveDmNote()}
									data-testid='journey-dm-note-save'
								>
									儲存 DM 筆記
								</Button>
							</div>
						</div>
					) : currentDmNoteState.note ? (
						currentDmNoteState.note.content ? (
							<div className='mt-3'>
								<CampaignJourneyMarkdown
									content={currentDmNoteState.note.content}
									campaignId={campaignId}
								/>
							</div>
						) : (
							<p className='mt-3 text-sm italic text-muted-foreground'>
								DM 筆記已建立，但目前沒有內容。
							</p>
						)
					) : (
						<p className='mt-3 text-sm italic text-muted-foreground'>
							尚未建立 DM 專屬筆記。
						</p>
					)}
				</section>
			)}
		</main>
	);
}
