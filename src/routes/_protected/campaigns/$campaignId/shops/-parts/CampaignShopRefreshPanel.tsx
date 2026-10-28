import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Plus, RotateCw, Trash2, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useToast } from '@/contexts/FeedbackContext';
import { ITEM_CATEGORY_LABELS, RARITY_CONFIG } from '@/data';
import {
	BLACKSMITH_CATEGORY_LABELS,
	loadBlacksmithCatalogDefinitions,
	loadBlacksmithCatalogs,
} from '@/lib/blacksmithCatalog';
import {
	CAMPAIGN_RULEBOOKS_SOURCE,
	buildCampaignShopRefreshPreview,
	createDefaultCampaignShopRefreshPolicy,
	resolveCampaignShopRefreshCandidates,
} from '@/lib/campaignShopRefresh';
import {
	refreshCampaignShopItems,
	saveCampaignShopRefreshPolicy,
} from '@/lib/campaignShops';
import { Button, Input } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type {
	BlacksmithCatalogDefinition,
	BlacksmithItem,
	CampaignShop,
	CampaignShopItem,
	CampaignShopRefreshCandidate,
	CampaignShopRefreshPolicy,
	CampaignShopRefreshRange,
	CampaignShopRefreshRule,
	ItemBaseCategory,
	ItemBaseRarity,
} from '@/types';

interface CampaignShopRefreshPanelProps {
	campaignId: string;
	shop: CampaignShop;
	items: readonly CampaignShopItem[];
	onReloadShops: () => Promise<void>;
	onReloadItems: () => Promise<void>;
}

type CandidateDraft = {
	kind: 'item' | 'filter';
	catalogId: string;
	itemId: string;
	search: string;
	rarity: ItemBaseRarity | '';
	category: ItemBaseCategory | '';
};

const EMPTY_DRAFT: CandidateDraft = {
	kind: 'item',
	catalogId: '',
	itemId: '',
	search: '',
	rarity: '',
	category: '',
};

const INPUT_CLASS =
	'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-1 focus:ring-ring';

const RARITIES: readonly ItemBaseRarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];
const CATEGORIES: readonly ItemBaseCategory[] = Object.keys(
	ITEM_CATEGORY_LABELS,
) as ItemBaseCategory[];

async function loadCurrentCampaignCatalogIds(
	campaignId: string,
	definitions: readonly BlacksmithCatalogDefinition[],
): Promise<string[]> {
	if (!supabase) {
		throw new Error('無法連線至戰役資料庫，請先完成登入與環境設定。');
	}
	const { data, error } = await supabase
		.from('campaigns')
		.select('official_catalog_ids')
		.eq('id', campaignId)
		.single();
	if (error) throw error;

	const catalogIds = data.official_catalog_ids;
	if (
		!Array.isArray(catalogIds) ||
		!catalogIds.every((catalogId: unknown) => typeof catalogId === 'string')
	) {
		throw new Error('戰役商店規則書設定格式無效。');
	}
	const availableIds = new Set(
		definitions.map((definition) => definition.catalogId),
	);
	const unavailableIds = catalogIds.filter(
		(catalogId: string) => !availableIds.has(catalogId),
	);
	if (unavailableIds.length > 0) {
		throw new Error(
			`戰役設定包含目前不存在的官方規則書：${unavailableIds.join('、')}`,
		);
	}
	return catalogIds;
}

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error) return error.message;
	if (
		typeof error === 'object' &&
		error !== null &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}
	return fallback;
}

function createRule(): CampaignShopRefreshRule {
	return {
		possibleItemsOrFilters: [],
		pickCount: null,
		stockAvailable: { min: 0, max: 1, p: 1, step: 1 },
		listAsUnidentified: false,
	};
}

function displayRange(range: CampaignShopRefreshRange, fallbackMax: string) {
	return {
		min: String(range.min ?? 0),
		max: range.max === null ? '' : String(range.max ?? fallbackMax),
		p: String(range.p ?? 1),
		step: String(range.step ?? 1),
	};
}

function actionLabel(
	action: 'create' | 'keep' | 'delete',
) {
	switch (action) {
		case 'create':
			return '新增';
		case 'keep':
			return '保留';
		case 'delete':
			return '刪除';
	}
}

function actionClass(
	action: 'create' | 'keep' | 'delete',
) {
	switch (action) {
		case 'create':
			return 'text-foreground';
		case 'keep':
			return 'text-muted-foreground';
		case 'delete':
			return 'text-destructive-foreground';
	}
}

function isCatalogItem(
	candidate: CampaignShopRefreshCandidate,
): candidate is BlacksmithItem {
	return 'itemId' in candidate;
}

export function CampaignShopRefreshPanel({
	campaignId,
	shop,
	items,
	onReloadShops,
	onReloadItems,
}: CampaignShopRefreshPanelProps) {
	const toast = useToast();
	const [policy, setPolicy] = useState<CampaignShopRefreshPolicy>(
		shop.refreshPolicy ?? createDefaultCampaignShopRefreshPolicy(),
	);
	const [savedPolicy, setSavedPolicy] = useState<CampaignShopRefreshPolicy>(
		shop.refreshPolicy ?? createDefaultCampaignShopRefreshPolicy(),
	);
	const [definitions, setDefinitions] = useState<BlacksmithCatalogDefinition[]>(
		[],
	);
	const [catalogItems, setCatalogItems] = useState<Record<string, BlacksmithItem[]>>(
		{},
	);
	const [drafts, setDrafts] = useState<Record<number, CandidateDraft>>({});
	const [preview, setPreview] = useState<ReturnType<
		typeof buildCampaignShopRefreshPreview
	> | null>(null);
	const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isApplying, setIsApplying] = useState(false);
	const [confirmEmptyRefresh, setConfirmEmptyRefresh] = useState(false);
	const [deletingRuleIndex, setDeletingRuleIndex] = useState<number | null>(
		null,
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const deleteRuleDialogRef = useRef<HTMLDialogElement>(null);
	const previewDialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = deleteRuleDialogRef.current;
		if (!dialog) return;
		if (deletingRuleIndex !== null && !dialog.open) dialog.showModal();
		if (deletingRuleIndex === null && dialog.open) dialog.close();
	}, [deletingRuleIndex]);

	useEffect(() => {
		const dialog = previewDialogRef.current;
		if (!dialog) return;
		if (preview && !dialog.open) dialog.showModal();
		if (!preview && dialog.open) dialog.close();
	}, [preview]);

	useEffect(() => {
		let isMounted = true;
		loadBlacksmithCatalogDefinitions()
			.then((nextDefinitions) => {
				if (isMounted) setDefinitions(nextDefinitions);
			})
			.catch((error: unknown) => {
				if (isMounted) {
					setErrorMessage(getErrorMessage(error, '載入官方目錄索引失敗。'));
				}
			})
			.finally(() => {
				if (isMounted) setIsLoadingCatalogs(false);
			});
		return () => {
			isMounted = false;
		};
	}, []);

	const catalogIds = useMemo(
		() => new Set(definitions.map((definition) => definition.catalogId)),
		[definitions],
	);
	const isPolicyDirty = JSON.stringify(policy) !== JSON.stringify(savedPolicy);

	const loadCatalog = async (catalogId: string) => {
		if (!catalogId || catalogItems[catalogId]) return;
		const loadedItems = await loadBlacksmithCatalogs(catalogId);
		setCatalogItems((current) => ({ ...current, [catalogId]: loadedItems }));
	};

	const updatePolicy = (nextPolicy: CampaignShopRefreshPolicy) => {
		setPolicy(nextPolicy);
		setPreview(null);
		setConfirmEmptyRefresh(false);
	};

	const updateRule = (
		ruleIndex: number,
		update: (rule: CampaignShopRefreshRule) => CampaignShopRefreshRule,
	) => {
		updatePolicy({
			...policy,
			rules: policy.rules.map((rule, index) =>
				index === ruleIndex ? update(rule) : rule,
			),
		});
	};

	const updateDraft = (
		ruleIndex: number,
		update: Partial<CandidateDraft>,
	) => {
		setDrafts((current) => ({
			...current,
			[ruleIndex]: { ...(current[ruleIndex] ?? EMPTY_DRAFT), ...update },
		}));
	};

	const handleDraftCatalogChange = async (ruleIndex: number, catalogId: string) => {
		updateDraft(ruleIndex, {
			catalogId,
			itemId: '',
			...(catalogId === CAMPAIGN_RULEBOOKS_SOURCE ? { kind: 'filter' } : {}),
		});
		setErrorMessage(null);
		if (!catalogId || catalogId === CAMPAIGN_RULEBOOKS_SOURCE) {
			return;
		}
		try {
			await loadCatalog(catalogId);
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '載入官方目錄商品失敗。'));
		}
	};

	const addCandidate = (ruleIndex: number) => {
		const draft = drafts[ruleIndex] ?? EMPTY_DRAFT;
		if (!draft.catalogId) {
			setErrorMessage('請先選擇官方目錄。');
			return;
		}
		let candidates: CampaignShopRefreshCandidate[];
		if (draft.kind === 'item') {
			if (draft.catalogId === CAMPAIGN_RULEBOOKS_SOURCE) {
				setErrorMessage('「此戰役的規則書」僅支援官方目錄篩選器。');
				return;
			}
			const item = catalogItems[draft.catalogId]?.find(
				(entry) => entry.itemId === draft.itemId,
			);
			if (!item) {
				setErrorMessage('請選擇已載入的有效官方目錄商品。');
				return;
			}
			candidates = [item];
		} else {
			const param = {
				...(draft.search.trim() ? { search: draft.search.trim() } : {}),
				...(draft.rarity ? { rarity: draft.rarity } : {}),
				...(draft.category ? { category: draft.category } : {}),
			};
			candidates = [
				{
					source:
						draft.catalogId === CAMPAIGN_RULEBOOKS_SOURCE
							? CAMPAIGN_RULEBOOKS_SOURCE
							: draft.catalogId,
					param,
				},
			];
		}
		updateRule(ruleIndex, (rule) => ({
			...rule,
			possibleItemsOrFilters: [
				...rule.possibleItemsOrFilters,
				...candidates,
			],
		}));
		updateDraft(ruleIndex, { ...EMPTY_DRAFT, catalogId: draft.catalogId });
		setErrorMessage(null);
	};

	const savePolicy = async () => {
		setIsSaving(true);
		setErrorMessage(null);
		try {
			const saved = await saveCampaignShopRefreshPolicy(
				campaignId,
				shop.id,
				policy,
			);
			setPolicy(saved.refreshPolicy);
			setSavedPolicy(saved.refreshPolicy);
			setPreview(null);
			toast.success('店舖刷新政策已儲存。');
			try {
				await onReloadShops();
			} catch (error) {
				setErrorMessage(
					`刷新政策已儲存，但無法重新載入商店資料：${getErrorMessage(
						error,
						'同步商店資料失敗。',
					)}`,
				);
			}
		} catch (error) {
			toast.error(getErrorMessage(error, '儲存刷新政策失敗。'));
		} finally {
			setIsSaving(false);
		}
	};

	const generatePreview = async () => {
		if (isPolicyDirty) {
			setErrorMessage('請先儲存目前的刷新政策，才能產生預覽。');
			return;
		}
		setIsGenerating(true);
		setErrorMessage(null);
		setConfirmEmptyRefresh(false);
		try {
			const currentCatalogIds = await loadCurrentCampaignCatalogIds(
				campaignId,
				definitions,
			);
			const currentPolicy: CampaignShopRefreshPolicy = {
				...savedPolicy,
				rules: savedPolicy.rules.map((rule) => ({
					...rule,
					possibleItemsOrFilters: rule.possibleItemsOrFilters.flatMap(
						(candidate) =>
							!('itemId' in candidate) &&
							candidate.source === CAMPAIGN_RULEBOOKS_SOURCE
								? currentCatalogIds.map((source) => ({
										source,
										param: candidate.param,
									}))
								: [candidate],
					),
				})),
			};
			const selections = await resolveCampaignShopRefreshCandidates(
				currentPolicy,
				catalogIds,
				loadBlacksmithCatalogs,
			);
			setPreview(
				buildCampaignShopRefreshPreview(
					currentPolicy,
					selections,
					shop.updatedAt,
					items,
					catalogIds,
				),
			);
		} catch (error) {
			setErrorMessage(getErrorMessage(error, '產生刷新預覽失敗。'));
		} finally {
			setIsGenerating(false);
		}
	};

	const applyPreview = async () => {
		if (!preview) return;
		if (preview.changes.length === 0 && !confirmEmptyRefresh) {
			setConfirmEmptyRefresh(true);
			return;
		}
		setIsApplying(true);
		setErrorMessage(null);
		try {
			const result = await refreshCampaignShopItems(
				campaignId,
				shop.id,
				preview.expectedShopUpdatedAt,
				preview.expectedItems,
				preview.keepItemsOnRefresh,
				preview.changes,
			);
			setPreview(null);
			setConfirmEmptyRefresh(false);
			toast.success(
				`店舖刷新完成：新增 ${result.created} 項、刪除 ${result.deleted} 項。`,
			);
			try {
				await Promise.all([onReloadShops(), onReloadItems()]);
			} catch (error) {
				setErrorMessage(
					`店舖刷新已套用，但無法重新載入最新資料：${getErrorMessage(
						error,
						'同步商店資料失敗。',
					)}`,
				);
			}
		} catch (error) {
			setErrorMessage(
				getErrorMessage(
					error,
					'套用刷新失敗。預覽已保留，請確認資料版本後重試。',
				),
			);
		} finally {
			setIsApplying(false);
		}
	};

	const closePreview = () => {
		setPreview(null);
		setConfirmEmptyRefresh(false);
	};

	return (
		<section
			className='rounded-lg border border-border/70 bg-card/50 p-4'
			data-testid='shop-refresh-panel'
		>
			<div className='flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4'>
				<div>
					<h2 className='font-serif text-xl font-bold text-foreground'>
						店舖刷新政策
					</h2>
					<p className='mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground'>
						先儲存政策，再產生不會寫入資料庫的預覽。只有確認刷新才會以單一交易套用變更。
					</p>
				</div>
			</div>

			{errorMessage && !preview && (
				<div role='alert' className='mt-4 flex gap-2 rounded-md border border-destructive/70 bg-destructive/30 p-3 text-sm text-destructive-foreground'>
					<AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
					<span>{errorMessage}</span>
				</div>
			)}
			<label className='mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background/50 p-3 text-sm text-foreground'>
				<input
					type='checkbox'
					checked={policy.flags.keepItemsOnRefresh}
					onChange={(event) =>
						updatePolicy({
							...policy,
							flags: { keepItemsOnRefresh: event.target.checked },
						})
					}
					className='mt-0.5 h-4 w-4 accent-primary'
				/>
				<span>
					<span className='font-semibold text-foreground'>保留既有商品</span>
					<span className='mt-1 block text-xs text-muted-foreground'>
						啟用時保留既有商品，並將本次選中的商品另行新增（不會依來源自動補貨或合併）；關閉時，刷新前商品會直接刪除，再新增本次選中的商品。歷史訂單保留商品快照，待審訂單會標記為拒絕。
					</span>
				</span>
			</label>

			<div className='mt-4 space-y-4'>
				{policy.rules.map((rule, ruleIndex) => {
					const draft = drafts[ruleIndex] ?? EMPTY_DRAFT;
					const pickRange =
						typeof rule.pickCount === 'object' && rule.pickCount !== null
							? displayRange(rule.pickCount, '')
							: null;
					const stockRange = displayRange(rule.stockAvailable, '1');
					return (
						<article key={ruleIndex} className='rounded-md border border-border bg-background/40 p-3'>
							<div className='flex items-center justify-between gap-3'>
								<h3 className='font-serif font-bold text-foreground'>
									規則 {ruleIndex + 1}
								</h3>
								<Button
									type='button'
									variant='danger'
									size='sm'
									onClick={() => setDeletingRuleIndex(ruleIndex)}
								>
									<Trash2 className='h-3.5 w-3.5' />
									刪除規則
								</Button>
							</div>

							<div className='mt-3 space-y-2'>
								<p className='text-xs font-semibold text-muted-foreground'>候選商品與篩選器</p>
								{rule.possibleItemsOrFilters.length === 0 ? (
									<p className='rounded border border-dashed border-border p-2 text-xs text-muted-foreground'>
										尚未加入候選；此規則不會產生商品。
									</p>
								) : (
									rule.possibleItemsOrFilters.map((candidate, candidateIndex) => (
										<div key={`${candidateIndex}-${isCatalogItem(candidate) ? candidate.sourceKey : candidate.source}`} className='flex items-center justify-between gap-3 rounded border border-border px-2 py-1.5 text-xs'>
											<p className='min-w-0 text-foreground'>
												{isCatalogItem(candidate)
													? `${candidate.catalogTitle}・${candidate.name}`
													: `${candidate.source === CAMPAIGN_RULEBOOKS_SOURCE ? '此戰役的規則書' : definitions.find((definition) => definition.catalogId === candidate.source)?.title ?? candidate.source}・篩選：${candidate.param.search || '不限文字'}／${candidate.param.rarity ? RARITY_CONFIG[candidate.param.rarity].label : '不限稀有度'}／${candidate.param.category ? BLACKSMITH_CATEGORY_LABELS[candidate.param.category] : '不限分類'}`}
											</p>
											<Button
												type='button'
												variant='ghost'
												size='sm'
												aria-label={`移除規則 ${ruleIndex + 1} 的候選 ${candidateIndex + 1}`}
												onClick={() =>
													updateRule(ruleIndex, (current) => ({
														...current,
														possibleItemsOrFilters:
															current.possibleItemsOrFilters.filter(
																(_, index) => index !== candidateIndex,
															),
													}))
												}
												className='shrink-0 text-destructive-foreground'
											>
												<Trash2 className='h-3.5 w-3.5' />
											</Button>
										</div>
									))
								)}
							</div>

							<div className='mt-3 grid gap-2 rounded border border-border bg-background/60 p-3 md:grid-cols-2'>
								<label className='text-xs text-muted-foreground'>
									候選類型
									<select
										data-testid={`refresh-candidate-kind-${ruleIndex}`}
										value={draft.kind}
										onChange={(event) => {
											const kind = event.target.value as CandidateDraft['kind'];
											updateDraft(ruleIndex, {
												kind,
												itemId: '',
												...(kind === 'item' &&
												draft.catalogId === CAMPAIGN_RULEBOOKS_SOURCE
													? { catalogId: '' }
													: {}),
											});
										}}
										className={`mt-1 ${INPUT_CLASS}`}
									>
										<option value='item'>指定官方商品</option>
										<option value='filter'>官方目錄篩選器</option>
									</select>
								</label>
								<label className='text-xs text-muted-foreground'>
									官方目錄
									<select
										data-testid={`refresh-catalog-${ruleIndex}`}
										value={draft.catalogId}
										disabled={isLoadingCatalogs}
										onChange={(event) =>
											void handleDraftCatalogChange(ruleIndex, event.target.value)
										}
										className={`mt-1 ${INPUT_CLASS}`}
									>
										<option value=''>選擇目錄</option>
										<option
											value={CAMPAIGN_RULEBOOKS_SOURCE}
										>
											此戰役的規則書
										</option>
										{definitions.map((definition) => (
											<option key={definition.catalogId} value={definition.catalogId}>
												{definition.title}
											</option>
										))}
									</select>
									<p className='mt-1 leading-relaxed text-[11px] text-muted-foreground'>
										如要修改戰役的規則書，請前往
										<Link
											to='/campaigns/$campaignId/settings'
											params={{ campaignId }}
											className='mx-1 text-foreground underline underline-offset-2 hover:text-foreground'
										>
											戰役設定的商店分頁
										</Link>
									</p>
								</label>
								{draft.kind === 'item' ? (
									<label className='text-xs text-muted-foreground md:col-span-2'>
										官方商品
										<select
											value={draft.itemId}
											disabled={!draft.catalogId || !catalogItems[draft.catalogId]}
											onChange={(event) =>
												updateDraft(ruleIndex, { itemId: event.target.value })
											}
											className={`mt-1 ${INPUT_CLASS}`}
										>
											<option value=''>選擇商品</option>
											{(catalogItems[draft.catalogId] ?? []).map((item) => (
												<option key={item.itemId} value={item.itemId}>
													{item.name}・{RARITY_CONFIG[item.rarity].label}
												</option>
											))}
										</select>
									</label>
								) : (
									<>
										<label className='text-xs text-muted-foreground'>
											搜尋文字
											<Input value={draft.search} onChange={(event) => updateDraft(ruleIndex, { search: event.target.value })} className={`mt-1 ${INPUT_CLASS}`} />
										</label>
										<label className='text-xs text-muted-foreground'>
											稀有度
											<select value={draft.rarity} onChange={(event) => updateDraft(ruleIndex, { rarity: event.target.value as ItemBaseRarity | '' })} className={`mt-1 ${INPUT_CLASS}`}>
												<option value=''>不限</option>
												{RARITIES.map((rarity) => <option key={rarity} value={rarity}>{RARITY_CONFIG[rarity].label}</option>)}
											</select>
										</label>
										<label className='text-xs text-muted-foreground md:col-span-2'>
											分類
											<select value={draft.category} onChange={(event) => updateDraft(ruleIndex, { category: event.target.value as ItemBaseCategory | '' })} className={`mt-1 ${INPUT_CLASS}`}>
												<option value=''>不限</option>
												{CATEGORIES.map((category) => <option key={category} value={category}>{BLACKSMITH_CATEGORY_LABELS[category]}</option>)}
											</select>
										</label>
									</>
								)}
								<Button type='button' variant='secondary' data-testid={`refresh-add-candidate-${ruleIndex}`} onClick={() => addCandidate(ruleIndex)} disabled={isLoadingCatalogs} className='border border-border/70 bg-background/40 text-foreground md:col-span-2'>
									<Plus className='h-4 w-4' />
									加入候選
								</Button>
							</div>

							<div className='mt-3 grid gap-3 lg:grid-cols-2'>
								<div className='rounded border border-border p-3'>
									<div className='flex items-center justify-between gap-2'>
										<p className='text-xs font-semibold text-foreground'>抽選數量</p>
										<label className='flex items-center gap-2 text-xs text-muted-foreground'>
											<input type='checkbox' checked={pickRange !== null} onChange={(event) => updateRule(ruleIndex, (current) => ({ ...current, pickCount: event.target.checked ? { min: 0, max: null, p: 1, step: 1 } : null }))} className='accent-primary' />
											限制隨機數量
										</label>
									</div>
									{pickRange ? (
										<div className='mt-2 grid grid-cols-2 gap-2'>
											{(['min', 'max', 'p', 'step'] as const).map((field) => (
												<label key={field} className='text-xs text-muted-foreground'>
													{field === 'min' ? '最小值' : field === 'max' ? '最大值（空白不限）' : field === 'p' ? '停止機率 p' : '每次增加'}
													<Input type='number' min={field === 'p' ? 0.000001 : 0} max={field === 'p' ? 1 : undefined} step={field === 'p' ? '0.01' : '1'} value={pickRange[field]} onChange={(event) => updateRule(ruleIndex, (current) => ({ ...current, pickCount: { ...(typeof current.pickCount === 'object' && current.pickCount !== null ? current.pickCount : {}), [field]: field === 'max' && !event.target.value ? null : Number(event.target.value) } }))} className={`mt-1 ${INPUT_CLASS}`} />
												</label>
											))}
										</div>
									) : <p className='mt-2 text-xs text-muted-foreground'>未限制時會選取此規則的全部去重候選。</p>}
								</div>
								<div className='rounded border border-border p-3'>
									<p className='text-xs font-semibold text-foreground'>每項可用庫存</p>
									<div className='mt-2 grid grid-cols-2 gap-2'>
										{(['min', 'max', 'p', 'step'] as const).map((field) => (
											<label key={field} className='text-xs text-muted-foreground'>
												{field === 'min' ? '最小值' : field === 'max' ? '最大值（空白不限）' : field === 'p' ? '停止機率 p' : '每次增加'}
												<Input type='number' min={field === 'p' ? 0.000001 : 0} max={field === 'p' ? 1 : undefined} step={field === 'p' ? '0.01' : '1'} value={stockRange[field]} onChange={(event) => updateRule(ruleIndex, (current) => ({ ...current, stockAvailable: { ...current.stockAvailable, [field]: field === 'max' && !event.target.value ? null : Number(event.target.value) } }))} className={`mt-1 ${INPUT_CLASS}`} />
											</label>
										))}
									</div>
									<p className='mt-2 text-[11px] leading-relaxed text-muted-foreground'>從最小值開始；每次亂數結果大於或等於 p 才增加 step，直到達到最大值。p = 1 不會額外增加。</p>
								</div>
							</div>
							<label className='mt-3 flex cursor-pointer items-start gap-3 rounded border border-border/60 bg-background/20 p-3 text-xs text-foreground'>
								<input
									type='checkbox'
									data-testid={`refresh-list-unidentified-${ruleIndex}`}
									checked={rule.listAsUnidentified}
									onChange={(event) =>
										updateRule(ruleIndex, (current) => ({
											...current,
											listAsUnidentified: event.target.checked,
										}))
									}
									className='mt-0.5 h-4 w-4 accent-primary'
								/>
								<span>
									<span className='font-semibold text-foreground'>
										全部商品以未鑑定狀態列出
									</span>
									<span className='mt-1 block text-[11px] text-muted-foreground'>
										此規則新增的商品會對玩家隱藏物品內容，直到完成鑑定。
									</span>
								</span>
							</label>
						</article>
					);
				})}
			</div>

			<Button type='button' variant='secondary' onClick={() => updatePolicy({ ...policy, rules: [...policy.rules, createRule()] })} className='mt-4 border border-border bg-background text-foreground'>
				<Plus className='h-4 w-4' />
				新增規則
			</Button>

			<div className='mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4'>
				<p className='text-xs text-muted-foreground'>
					{isPolicyDirty ? '尚有未儲存的政策變更。' : '目前政策已儲存，可產生刷新預覽。'}
				</p>
				<div className='flex flex-wrap items-center justify-end gap-2'>
					<Button
						type='button'
						variant='secondary'
						disabled={isSaving || isLoadingCatalogs || !isPolicyDirty}
						onClick={() => void savePolicy()}
						className='border border-border/70 bg-background/40 text-foreground'
					>
						<Check className='h-4 w-4' />
						{isSaving ? '儲存中…' : '儲存政策'}
					</Button>
					<Button type='button' disabled={isGenerating || isSaving || isPolicyDirty || isLoadingCatalogs} onClick={() => void generatePreview()} className='bg-primary text-primary-foreground hover:bg-primary'>
						<RotateCw className='h-4 w-4' />
						{isGenerating ? '產生預覽中…' : '預覽刷新'}
					</Button>
				</div>
			</div>

			<dialog
				ref={previewDialogRef}
				aria-labelledby='shop-refresh-preview-title'
				data-testid='shop-refresh-preview-dialog'
				onClose={closePreview}
				onCancel={(event) => {
					if (isGenerating || isApplying) event.preventDefault();
				}}
				className='m-auto max-h-[90dvh] w-[min(48rem,calc(100%-2rem))] overflow-y-auto rounded-lg border border-primary/70 bg-background p-0 text-foreground shadow-2xl backdrop:bg-background/80'
			>
				{preview && (
					<div className='p-4 sm:p-5'>
						<div className='flex flex-wrap items-start justify-between gap-3'>
							<div>
								<h2
									id='shop-refresh-preview-title'
									className='font-serif text-lg font-bold text-foreground'
								>
									刷新預覽
								</h2>
								<p className='mt-1 text-xs text-muted-foreground'>
									新增 {preview.entries.filter((entry) => entry.action === 'create').length} 項、保留 {preview.entries.filter((entry) => entry.action === 'keep').length} 項、刪除 {preview.entries.filter((entry) => entry.action === 'delete').length} 項。
								</p>
							</div>
							<div className='flex items-center gap-2'>
								<Button
									type='button'
									variant='secondary'
									disabled={isGenerating || isApplying}
									onClick={() => void generatePreview()}
									className='border border-primary/70 bg-background text-primary-foreground'
								>
									<RotateCw className='h-4 w-4' />
									重新隨機
								</Button>
								<Button
									type='button'
									variant='ghost'
									aria-label='關閉刷新預覽'
									disabled={isGenerating || isApplying}
									onClick={closePreview}
									className='text-muted-foreground hover:text-foreground'
								>
									<X className='h-4 w-4' />
								</Button>
							</div>
						</div>
						{errorMessage && (
							<div
								role='alert'
								className='mt-3 flex gap-2 rounded-md border border-destructive/70 bg-destructive/30 p-3 text-sm text-destructive-foreground'
							>
								<AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
								<span>{errorMessage}</span>
							</div>
						)}
						{preview.entries.length > 0 && (
							<div className='mt-3 max-h-80 divide-y divide-border overflow-y-auto rounded border border-border'>
								{preview.entries.map((entry) => (
									<div
										key={entry.key}
										className='flex items-center justify-between gap-3 px-3 py-2 text-sm'
									>
										<div className='min-w-0'>
											<p className='truncate text-foreground'>{entry.name}</p>
											<p className='text-xs text-muted-foreground'>
												{entry.sourceTitle}・規則{' '}
												{entry.ruleIndex === null ? '—' : entry.ruleIndex + 1}・
												{BLACKSMITH_CATEGORY_LABELS[entry.category]}・
												{RARITY_CONFIG[entry.rarity].label}
												{entry.itemSnapshot.isIdentified === false && '・未鑑定'}
											</p>
										</div>
										<div className='shrink-0 text-right'>
											<p className={`font-semibold ${actionClass(entry.action)}`}>
												{actionLabel(entry.action)}
											</p>
											<p className='font-mono text-xs text-muted-foreground'>
												<span className='text-money'>{entry.unitPriceGp} gp</span>
												{' '}・庫存 {entry.stockAvailable}
											</p>
										</div>
									</div>
								))}
							</div>
						)}
						{preview.changes.length === 0 && (
							<p
								className={`mt-3 rounded border p-3 text-sm ${
									preview.keepItemsOnRefresh
										? 'border-primary/70 bg-primary/30 text-primary-foreground'
										: 'border-destructive/70 bg-destructive/30 text-destructive-foreground'
								}`}
							>
								{preview.keepItemsOnRefresh
									? '本次沒有選中商品，保留模式不會變更既有商品；請再次確認後才會送出空操作。'
									: '本次沒有選中商品。清除模式確認後會直接刪除既有商品，保留歷史訂單快照並拒絕待審訂單；請再次確認後才會套用。'}
							</p>
						)}
						<div className='mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-primary/40 pt-3'>
							<p className='text-xs text-muted-foreground'>
								確認後會呼叫單一交易 RPC。預覽過期或失敗時不會部分套用，且可保留預覽重試。
							</p>
							<Button
								type='button'
								variant='danger'
								disabled={isApplying || isGenerating}
								onClick={() => void applyPreview()}
							>
								<Check className='h-4 w-4' />
								{isApplying
									? '刷新中…'
									: confirmEmptyRefresh
										? '再次確認零項刷新'
										: '確認刷新'}
							</Button>
						</div>
					</div>
				)}
			</dialog>
			<dialog
				ref={deleteRuleDialogRef}
				aria-labelledby='delete-refresh-rule-title'
				onClose={() => setDeletingRuleIndex(null)}
				className='m-auto max-h-[90vh] w-[min(28rem,calc(100%-2rem))] overflow-y-auto rounded-lg border border-destructive/70 bg-background p-0 text-foreground shadow-2xl backdrop:bg-background/80'
			>
				<div className='p-5'>
					<h2
						id='delete-refresh-rule-title'
						className='font-serif text-lg font-bold text-destructive-foreground'
					>
						確認刪除規則
					</h2>
					<p className='mt-2 text-sm leading-relaxed text-foreground'>
						確定要刪除規則 {deletingRuleIndex === null ? '' : deletingRuleIndex + 1}？此變更需要儲存政策後才會生效。
					</p>
					<div className='mt-5 flex justify-end gap-2'>
						<Button
							type='button'
							variant='secondary'
							onClick={() => setDeletingRuleIndex(null)}
						>
							取消
						</Button>
						<Button
							type='button'
							variant='danger'
							onClick={() => {
								if (deletingRuleIndex === null) return;
								const ruleIndex = deletingRuleIndex;
								updatePolicy({
									...policy,
									rules: policy.rules.filter(
										(_, index) => index !== ruleIndex,
									),
								});
								setDeletingRuleIndex(null);
							}}
						>
							<Trash2 className='h-4 w-4' />
							確認刪除
						</Button>
					</div>
				</div>
			</dialog>
		</section>
	);
}
