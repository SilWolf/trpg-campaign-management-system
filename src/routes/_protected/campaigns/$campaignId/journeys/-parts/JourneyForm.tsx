import { useRef, useState, type FormEvent } from 'react';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { useCampaignJourneys } from './CampaignJourneysContext';
import { JourneyImageUploadField } from './JourneyImageUploadField';
import { evaluateCharacterPermissions } from '@/hooks/useCharacterPermissions';
import type { CampaignJourney } from '@/types';

interface JourneyFormProps {
	initialJourney?: CampaignJourney;
	onCancel: () => void;
	onSaved: (journey: CampaignJourney) => void;
}

export function JourneyForm({
	initialJourney,
	onCancel,
	onSaved,
}: JourneyFormProps) {
	const {
		campaignId,
		characters,
		permissions,
		isDm,
		roleLoading,
		userId,
	} = useCampaignJourneys();
	const [title, setTitle] = useState(initialJourney?.title ?? '');
	const [tags, setTags] = useState(initialJourney?.tags.join(', ') ?? '');
	const [content, setContent] = useState(initialJourney?.content ?? '');
	const [characterId, setCharacterId] = useState(
		initialJourney?.characterId ?? '',
	);
	const [visibility, setVisibility] = useState(
		initialJourney?.visibility ?? 'public',
	);
	const [isQuest, setIsQuest] = useState(initialJourney?.isQuest ?? false);
	const [isCompleted, setIsCompleted] = useState(
		initialJourney?.isCompleted ?? false,
	);
	const [isSaving, setIsSaving] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const contentRef = useRef<HTMLTextAreaElement>(null);
	const visibleCharacters =
		visibility === 'private'
			? characters.filter(
					(character) =>
						evaluateCharacterPermissions(
							character.id,
							userId,
							permissions,
							isDm,
							'player',
							character.userId,
						).canManagePrivateJourneys,
				)
			: characters;

	function insertImageReference(reference: string) {
		const textarea = contentRef.current;
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
		const nextContent = `${before}${insertion}${after}`;
		setContent(nextContent);
		requestAnimationFrame(() => {
			textarea.focus();
			const cursor = before.length + insertion.length;
			textarea.setSelectionRange(cursor, cursor);
		});
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (roleLoading || isSaving) return;
		const trimmedTitle = title.trim();
		if (!trimmedTitle || trimmedTitle.length > 160) {
			setErrorMessage('標題須為 1 至 160 個字元。');
			return;
		}
		if (visibility === 'private' && !characterId) {
			setErrorMessage('私人筆記必須指定有管理權限的角色。');
			return;
		}
		if (
			visibility === 'private' &&
			!visibleCharacters.some((character) => character.id === characterId)
		) {
			setErrorMessage('目前帳號沒有管理所選角色私人筆記的權限。');
			return;
		}

		setErrorMessage(null);
		setIsSaving(true);
		try {
			const { createCampaignJourney, updateCampaignJourney } =
				await import('@/lib/campaignJourneys');
			const values = {
				title: trimmedTitle,
				tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
				content,
				characterId: characterId || null,
				visibility,
				isQuest,
				isCompleted,
			} as const;
			const savedJourney = initialJourney
				? await updateCampaignJourney(campaignId, initialJourney.id, values)
				: await createCampaignJourney(campaignId, values);
			onSaved(savedJourney);
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : '儲存冒險筆記失敗。',
			);
		} finally {
			setIsSaving(false);
		}
	}

	if (roleLoading) {
		return (
			<p className='rounded-lg border border-border bg-card/60 p-6 text-sm text-muted-foreground'>
				確認戰役身分中…
			</p>
		);
	}

	return (
		<form
			data-testid='journey-form'
			onSubmit={(event) => void handleSubmit(event)}
			className='grid gap-5 rounded-lg border border-border bg-card/70 p-4 sm:p-6'
		>
			{errorMessage && (
				<p
					role='alert'
					className='rounded-md border border-destructive/70 bg-destructive/20 p-3 text-sm text-destructive-foreground'
				>
					{errorMessage}
				</p>
			)}
			<Input
				label='標題'
				required
				maxLength={160}
				value={title}
				onChange={(event) => setTitle(event.target.value)}
				data-testid='journey-title'
			/>
			<Input
				label='標籤'
				value={tags}
				onChange={(event) => setTags(event.target.value)}
				description='以逗號分隔；空標籤會略過，重複標籤只保留一次。'
				data-testid='journey-tags'
			/>
			<Textarea
				ref={contentRef}
				label='筆記內容'
				value={content}
				onChange={(event) => setContent(event.target.value)}
				rows={10}
				description='支援 Markdown；不支援 HTML。'
				data-testid='journey-content'
			/>
			<JourneyImageUploadField
				campaignId={campaignId}
				journeyId={initialJourney?.id}
				onInsert={insertImageReference}
			/>
			<div className='grid gap-4 sm:grid-cols-2'>
				<Select
					label='可見性'
					value={visibility}
					onChange={(event) => {
						const nextVisibility = event.target.value as 'public' | 'private';
						setVisibility(nextVisibility);
						if (
							nextVisibility === 'private' &&
							!visibleCharacters.some(
								(character) => character.id === characterId,
							)
						) {
							setCharacterId('');
						}
					}}
					data-testid='journey-visibility'
				>
					<option value='public'>公開 — 戰役成員可閱讀</option>
					<option value='private'>私人 — 依角色筆記權限閱讀</option>
				</Select>
				<Select
					label='所屬角色'
					value={characterId}
					onChange={(event) => setCharacterId(event.target.value)}
					data-testid='journey-character'
				>
					<option value=''>
						{visibility === 'private' ? '請選擇角色' : '無所屬角色'}
					</option>
					{visibleCharacters.map((character) => (
						<option key={character.id} value={character.id}>
							{character.name}
						</option>
					))}
				</Select>
			</div>
			{visibility === 'private' && visibleCharacters.length === 0 && (
				<p className='-mt-3 text-xs text-muted-foreground'>
					目前沒有可管理私人筆記的角色；需有角色筆記等級 2 權限。
				</p>
			)}
			<div className='flex flex-wrap gap-x-6 gap-y-3 rounded-md border border-border bg-background/50 p-3'>
				<label className='flex items-center gap-2 text-sm text-foreground'>
					<input
						type='checkbox'
						checked={isQuest}
						onChange={(event) => setIsQuest(event.target.checked)}
						data-testid='journey-is-quest'
						className='accent-primary'
					/>
					標記為任務
				</label>
				<label className='flex items-center gap-2 text-sm text-foreground'>
					<input
						type='checkbox'
						checked={isCompleted}
						onChange={(event) => setIsCompleted(event.target.checked)}
						data-testid='journey-is-completed'
						className='accent-primary'
					/>
					標記為已結束
				</label>
			</div>
			<div className='flex flex-wrap justify-end gap-2'>
				<Button type='button' variant='secondary' onClick={onCancel}>
					取消
				</Button>
				<Button
					type='submit'
					loading={isSaving}
					data-testid='journey-save'
				>
					{initialJourney ? '儲存修改' : '建立筆記'}
				</Button>
			</div>
		</form>
	);
}
