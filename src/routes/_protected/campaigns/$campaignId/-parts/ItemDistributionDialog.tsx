import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Gift, Plus, Search, Trash2, X } from 'lucide-react';

import { Button, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/contexts/FeedbackContext';
import { ITEM_CATEGORY_LABELS, WEAPON_MASTERIES, RARITY_CONFIG } from '@/data';
import { useModalFocus } from '@/hooks/useModalFocus';
import {
	dispatchCampaignItems,
	estimateNewInventoryRows,
	type CampaignItemDistributionLine,
} from '@/lib/campaignItemDistribution';
import {
	createBlankItemDefinitionForm,
	itemDefinitionFormToItem,
	itemToDefinitionForm,
} from '@/lib/itemDefinitions';
import type {
	AllItem,
	Character,
	HomebrewForm,
	InventoryItem,
} from '@/types';
import { CAMP_CHEST_ID } from '@/types';
import type { BlacksmithImportDraft } from '@/lib/blacksmithSearch';
import BlacksmithSearchDialog from './BlacksmithSearchDialog';
import ItemDefinitionDialog from './ItemDefinitionDialog';
import ItemIcon from './ItemIcon';

interface ItemDistributionDialogProps {
	isOpen: boolean;
	campaignId: string;
	userId: string;
	characters: Character[];
	items: InventoryItem[];
	onClose: () => void;
	refreshItems: (itemIds: readonly string[]) => Promise<void>;
}

interface DistributionDraftItem {
	id: string;
	itemBase: AllItem;
	blacksmithItemId: string | null;
	isHomebrew: boolean;
	isImportant: boolean;
	quantity: string;
}

function makeDraftItem(
	itemBase: AllItem,
	blacksmithItemId: string | null,
	isHomebrew: boolean,
	isImportant: boolean,
	quantity = '1',
): DistributionDraftItem {
	return {
		id: crypto.randomUUID(),
		itemBase,
		blacksmithItemId,
		isHomebrew,
		isImportant,
		quantity,
	};
}

function parseQuantity(
	value: string,
	isStackable: boolean,
): number | null {
	if (!/^[1-9]\d*$/.test(value)) return null;
	const quantity = Number(value);
	const maximum = isStackable ? 1_000_000 : 20;
	return Number.isSafeInteger(quantity) && quantity <= maximum
		? quantity
		: null;
}

export default function ItemDistributionDialog({
	isOpen,
	campaignId,
	userId,
	characters,
	items,
	onClose,
	refreshItems,
}: ItemDistributionDialogProps) {
	const campaignCharacters = useMemo(
		() =>
			characters.filter(
				(character) =>
					character.campaignId === campaignId &&
					character.id !== CAMP_CHEST_ID,
			),
		[characters, campaignId],
	);
	const [ownerId, setOwnerId] = useState(CAMP_CHEST_ID);
	const [isPrivate, setIsPrivate] = useState(false);
	const [draftItems, setDraftItems] = useState<DistributionDraftItem[]>([]);
	const [reason, setReason] = useState('');
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [isDefinitionOpen, setIsDefinitionOpen] = useState(false);
	const [editingItemId, setEditingItemId] = useState<string | null>(null);
	const [definitionForm, setDefinitionForm] = useState<HomebrewForm>(
		createBlankItemDefinitionForm,
	);
	const [definitionError, setDefinitionError] = useState<string | null>(null);
	const [definitionIsHomebrew, setDefinitionIsHomebrew] = useState(true);
	const [confirmationCount, setConfirmationCount] = useState<number | null>(
		null,
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const requestIdRef = useRef<string | null>(null);
	const dialogRef = useRef<HTMLElement | null>(null);
	const searchImportButtonRef = useRef<HTMLButtonElement | null>(null);
	const newDefinitionButtonRef = useRef<HTMLButtonElement | null>(null);
	const editorReturnFocusRef = useRef<HTMLElement | null>(null);
	const toast = useToast();
	const closeIfIdle = () => {
		if (!isSubmitting) {
			setIsSearchOpen(false);
			setIsDefinitionOpen(false);
			onClose();
		}
	};
	const restoreSearchImportButtonFocus = () => {
		window.requestAnimationFrame(() => searchImportButtonRef.current?.focus());
	};
	const restoreEditorFocus = () => {
		window.requestAnimationFrame(() =>
			(
				editorReturnFocusRef.current ?? newDefinitionButtonRef.current
			)?.focus(),
		);
	};
	const closeSearch = () => {
		setIsSearchOpen(false);
		restoreSearchImportButtonFocus();
	};
	const closeDefinition = () => {
		setIsDefinitionOpen(false);
		restoreEditorFocus();
	};
	useModalFocus(dialogRef, isOpen, closeIfIdle);

	const selectedCharacter = campaignCharacters.find(
		(character) => character.id === ownerId,
	);
	const selectedOwnerName =
		ownerId === CAMP_CHEST_ID ? '營地儲物箱' : selectedCharacter?.name;
	const canChoosePrivate = ownerId !== CAMP_CHEST_ID;

	const resetSubmission = () => {
		requestIdRef.current = null;
		setConfirmationCount(null);
		setErrorMessage(null);
	};

	const updateDraftItems = (
		updater: (previous: DistributionDraftItem[]) => DistributionDraftItem[],
	) => {
		resetSubmission();
		setDraftItems(updater);
	};

	const handleImport = (draft: BlacksmithImportDraft) => {
		updateDraftItems((previous) => [
			...previous,
			makeDraftItem(
				draft.definition,
				draft.itemId,
				draft.definition.isHomebrew,
				draft.definition.isImportant,
				String(draft.quantity),
			),
		]);
	};

	const openNewDefinition = () => {
		setEditingItemId(null);
		editorReturnFocusRef.current = newDefinitionButtonRef.current;
		setDefinitionForm(createBlankItemDefinitionForm());
		setDefinitionError(null);
		setDefinitionIsHomebrew(true);
		setIsDefinitionOpen(true);
	};

	const openCopiedDefinition = (form: HomebrewForm, isHomebrew: boolean) => {
		setEditingItemId(null);
		editorReturnFocusRef.current = searchImportButtonRef.current;
		setDefinitionForm(form);
		setDefinitionError(null);
		setDefinitionIsHomebrew(isHomebrew);
		setIsSearchOpen(false);
		setIsDefinitionOpen(true);
	};

	const openItemEditor = (
		item: DistributionDraftItem,
		trigger: HTMLElement,
	) => {
		setEditingItemId(item.id);
		editorReturnFocusRef.current = trigger;
		setDefinitionForm({
			...itemToDefinitionForm(item.itemBase),
			isImportant: item.isImportant,
		});
		setDefinitionError(null);
		setDefinitionIsHomebrew(item.isHomebrew);
		setIsDefinitionOpen(true);
	};

	const handleDefinitionSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		try {
			const itemBase = itemDefinitionFormToItem(definitionForm);
			updateDraftItems((previous) => {
				if (editingItemId) {
					return previous.map((item) =>
						item.id === editingItemId
							? {
									...item,
									itemBase,
									blacksmithItemId: null,
									isImportant: definitionForm.isImportant,
								}
							: item,
					);
				}
				return [
					...previous,
					makeDraftItem(
						itemBase,
						null,
						definitionIsHomebrew,
						definitionForm.isImportant,
					),
				];
			});
			setIsDefinitionOpen(false);
			setDefinitionError(null);
			restoreEditorFocus();
		} catch (error) {
			setDefinitionError(
				error instanceof Error ? error.message : '物品定義無效，請檢查欄位。',
			);
		}
	};

	const validateRequest = (): CampaignItemDistributionLine[] | null => {
		if (
			!campaignCharacters.some((character) => character.id === ownerId) &&
			ownerId !== CAMP_CHEST_ID
		) {
			setErrorMessage('接收目標不屬於目前戰役，請重新選擇。');
			return null;
		}
		if (draftItems.length < 1 || draftItems.length > 10) {
			setErrorMessage('派發清單必須包含 1 至 10 項物品。');
			return null;
		}
		if (reason.length > 200) {
			setErrorMessage('派發原因不可超過 200 個字元。');
			return null;
		}

		const lines: CampaignItemDistributionLine[] = [];
		for (const item of draftItems) {
			const quantity = parseQuantity(
				item.quantity,
				item.itemBase.isStackable,
			);
			if (quantity === null) {
				setErrorMessage(
					item.itemBase.isStackable
						? `「${item.itemBase.name}」數量須為 1 至 1,000,000 的整數。`
						: `「${item.itemBase.name}」數量須為 1 至 20 的整數。`,
				);
				return null;
			}
			lines.push({
				itemBase: item.itemBase,
				blacksmithItemId: item.blacksmithItemId,
				isHomebrew: item.isHomebrew,
				isImportant: item.isImportant,
				quantity,
			});
		}
		return lines;
	};

	const submitDistribution = async (confirmLargeBatch: boolean) => {
		const lines = validateRequest();
		if (!lines) return;

		const targetIsPrivate = ownerId === CAMP_CHEST_ID ? false : isPrivate;
		if (!confirmLargeBatch) {
			const estimatedCount = estimateNewInventoryRows(
				lines,
				items,
				ownerId,
				targetIsPrivate,
			);
			if (estimatedCount > 20) {
				setErrorMessage(
					'單次派發預計新增超過 20 筆背包記錄，請減少數量或分批派發。',
				);
				return;
			}
			if (estimatedCount > 10) {
				setConfirmationCount(estimatedCount);
				return;
			}
		}

		if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
		setIsSubmitting(true);
		setErrorMessage(null);
		try {
			const result = await dispatchCampaignItems({
				requestId: requestIdRef.current,
				campaignId,
				ownerId,
				isPrivate: targetIsPrivate,
				reason,
				confirmLargeBatch,
				items: lines,
			});
			if (result.requiresConfirmation) {
				setConfirmationCount(result.predictedInsertCount);
				return;
			}

			setDraftItems([]);
			setReason('');
			setConfirmationCount(null);
			requestIdRef.current = null;
			onClose();
			toast.success(
				`已完成派發至${selectedOwnerName ?? '指定目標'}：新增 ${result.insertedCount} 筆、更新 ${result.updatedCount} 筆背包記錄。`,
			);
			void refreshItems(result.inventoryIds).catch((error: unknown) => {
				console.error('派發後重新載入背包物品失敗：', error);
				toast.error('物品已派發，但背包同步暫時失敗；請稍後重新載入。');
			});
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : '派發失敗，請稍後重試。',
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void submitDistribution(confirmationCount !== null);
	};

	if (!isOpen) return null;

	return (
		<>
			<div className='fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-3 backdrop-blur-sm sm:p-5'>
				<section
					ref={dialogRef}
					role='dialog'
					aria-modal='true'
					aria-labelledby='item-distribution-title'
					tabIndex={-1}
					className='my-auto flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl'
				>
					<header className='flex items-center justify-between gap-3 border-b border-border p-4'>
						<div>
							<h2
								id='item-distribution-title'
								className='font-serif text-lg font-bold text-foreground'
							>
								派發物品
							</h2>
							<p className='text-xs text-muted-foreground'>
								物品只會寫入本次選擇的戰役背包，不會新增鍛造工坊樣板。
							</p>
						</div>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							aria-label='關閉物品派發'
							disabled={isSubmitting}
							onClick={closeIfIdle}
							prefixIcon={<X />}
						/>
					</header>

					<form
						onSubmit={handleSubmit}
						className='min-h-0 space-y-4 overflow-y-auto p-4'
					>
						<div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'>
							<label className='block text-sm font-medium text-foreground'>
								接收角色或儲存庫
								<Select
									aria-label='派發接收目標'
									value={ownerId}
									disabled={isSubmitting || confirmationCount !== null}
									onChange={(event) => {
										resetSubmission();
										setOwnerId(event.target.value);
										if (event.target.value === CAMP_CHEST_ID) {
											setIsPrivate(false);
										}
									}}
									className='mt-1 w-full'
								>
									<option value={CAMP_CHEST_ID}>營地儲物箱（公開）</option>
									{campaignCharacters.map((character) => (
										<option key={character.id} value={character.id}>
											{character.name}
										</option>
									))}
								</Select>
							</label>
							<label className='block text-sm font-medium text-foreground'>
								背包類型
								<Select
									aria-label='派發背包類型'
									value={isPrivate ? 'private' : 'public'}
									disabled={
										!canChoosePrivate ||
										isSubmitting ||
										confirmationCount !== null
									}
									onChange={(event) => {
										resetSubmission();
										setIsPrivate(event.target.value === 'private');
									}}
									className='mt-1 w-full'
								>
									<option value='public'>公開背包</option>
									<option value='private'>私人背包</option>
								</Select>
							</label>
						</div>
						{ownerId === CAMP_CHEST_ID && (
							<p className='text-xs text-info-foreground'>
								營地儲物箱是虛擬共用儲存庫，物品一律公開。
							</p>
						)}

						<section aria-labelledby='distribution-items-title'>
							<div className='mb-2 flex items-center justify-between gap-3'>
								<h3
									id='distribution-items-title'
									className='font-serif font-bold text-foreground'
								>
									派發清單
									<span className='ml-2 font-mono text-xs text-muted-foreground'>
										{draftItems.length}/10
									</span>
								</h3>
								<div className='flex flex-wrap gap-2'>
									<Button
										ref={searchImportButtonRef}
										type='button'
										variant='secondary'
										size='sm'
										disabled={
											draftItems.length >= 10 ||
											isSubmitting ||
											confirmationCount !== null
										}
										onClick={() => setIsSearchOpen(true)}
										prefixIcon={<Search />}
									>
										從鍛造工坊匯入
									</Button>
									<Button
										ref={newDefinitionButtonRef}
										type='button'
										variant='secondary'
										size='sm'
										disabled={
											draftItems.length >= 10 ||
											isSubmitting ||
											confirmationCount !== null
										}
										onClick={openNewDefinition}
										prefixIcon={<Plus />}
									>
										創造新的物品
									</Button>
								</div>
							</div>

							{draftItems.length === 0 ? (
								<p className='rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground'>
									尚未加入物品。請從鍛造工坊匯入，或建立新的物品定義。
								</p>
							) : (
								<ul className='space-y-2'>
									{draftItems.map((item) => {
										const maximum = item.itemBase.isStackable ? 1_000_000 : 20;
										return (
											<li
												key={item.id}
												className='grid gap-3 rounded-lg border border-border bg-card/60 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]'
											>
												<div className='flex min-w-0 items-center gap-3'>
													<div className='relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-background'>
														<ItemIcon
															iconName={item.itemBase.icon ?? 'Package'}
															className='h-full w-full p-1 text-muted-foreground'
														/>
													</div>
													<div className='min-w-0'>
														<p className='truncate font-semibold text-foreground'>
															{item.itemBase.name}
														</p>
														<p className='text-xs text-muted-foreground'>
															{ITEM_CATEGORY_LABELS[item.itemBase.category]} ·{' '}
															{RARITY_CONFIG[item.itemBase.rarity].label}
															{item.itemBase.isStackable ? ' · 可堆疊' : ''}
															{item.blacksmithItemId ? ' · 保留來源' : ' · 獨立定義'}
														</p>
													</div>
												</div>
												<label className='text-xs text-muted-foreground'>
													數量
													<Input
														type='number'
														min={1}
														max={maximum}
														step={1}
														aria-label={`物品數量 ${item.itemBase.name}`}
														value={item.quantity}
														disabled={
															isSubmitting || confirmationCount !== null
														}
														onChange={(event) => {
															updateDraftItems((previous) =>
																previous.map((entry) =>
																	entry.id === item.id
																		? {
																				...entry,
																				quantity: event.target.value,
																			}
																		: entry,
																),
															);
														}}
													/>
												</label>
												<div className='flex items-end justify-end gap-2'>
													<Button
														type='button'
														variant='secondary'
														size='sm'
														disabled={
															isSubmitting || confirmationCount !== null
														}
														onClick={(event) =>
															openItemEditor(item, event.currentTarget)
														}
													>
														編輯定義
													</Button>
													<Button
														type='button'
														variant='destructive'
														size='sm'
														aria-label={`刪除 ${item.itemBase.name}`}
														disabled={
															isSubmitting || confirmationCount !== null
														}
														onClick={() =>
															updateDraftItems((previous) =>
																previous.filter(
																	(entry) => entry.id !== item.id,
																),
															)
														}
														prefixIcon={<Trash2 />}
													/>
												</div>
											</li>
										);
									})}
								</ul>
							)}
						</section>

						<label className='block text-sm font-medium text-foreground'>
							派發原因（選填，最多 200 字）
							<Textarea
								aria-label='派發原因'
								value={reason}
								maxLength={200}
								rows={2}
								disabled={isSubmitting || confirmationCount !== null}
								onChange={(event) => {
									resetSubmission();
									setReason(event.target.value);
								}}
								className='mt-1 w-full'
							/>
							<span className='mt-1 block text-right font-mono text-xs text-muted-foreground'>
								{reason.length}/200
							</span>
						</label>

						{confirmationCount !== null && (
							<div
								role='alert'
								className='rounded-lg border border-warning/60 bg-warning/30 p-3 text-sm text-warning-foreground'
							>
								這次派發預計新增 {confirmationCount} 筆背包記錄。確認後才會送出整批操作；
								既有堆疊更新不計入新增筆數。
							</div>
						)}
						{errorMessage && (
							<p
								role='alert'
								className='rounded-lg border border-destructive/70 bg-destructive/30 p-3 text-sm text-destructive-foreground'
							>
								{errorMessage}
							</p>
						)}

						<footer className='flex flex-wrap justify-end gap-2 border-t border-border pt-3'>
							<Button
								type='button'
								variant='secondary'
								disabled={isSubmitting}
								onClick={() => {
									if (confirmationCount !== null) {
										resetSubmission();
										return;
									}
									onClose();
								}}
							>
								{confirmationCount !== null ? '返回修改' : '取消'}
							</Button>
							<Button
								type='submit'
								variant='primary'
								data-testid='item-distribution-submit'
								loading={isSubmitting}
								disabled={
									draftItems.length === 0 ||
									confirmationCount !== null && isSubmitting
								}
								prefixIcon={<Gift />}
							>
								{isSubmitting
									? '正在派發…'
									: confirmationCount !== null
										? '確認並派發'
										: '派發物品'}
							</Button>
						</footer>
					</form>
				</section>
			</div>

			<BlacksmithSearchDialog
				isOpen={isSearchOpen}
				userId={userId}
				onImport={handleImport}
				onCopy={openCopiedDefinition}
				onClose={closeSearch}
			/>

			<ItemDefinitionDialog
				isOpen={isDefinitionOpen}
				isEditing={Boolean(editingItemId)}
				campaignId={campaignId}
				canManageItemImage={false}
				form={definitionForm}
				setForm={setDefinitionForm}
				onSubmit={handleDefinitionSubmit}
				onClose={closeDefinition}
				weaponMasteries={WEAPON_MASTERIES}
				dialogTitle={editingItemId ? '編輯派發物品定義' : '建立派發物品'}
				submitLabel={editingItemId ? '儲存定義' : '加入派發清單'}
				showInventoryFields={false}
				errorMessage={definitionError}
			/>
		</>
	);
}
