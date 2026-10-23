/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertCircle, Eye, Hammer, Plus, RotateCw, Trash2 } from 'lucide-react';
import { BlacksmithImportButton } from '@/components/blacksmith/BlacksmithImportButton';
import { RARITY_CONFIG, WEAPON_MASTERIES } from '@/data';
import { useAuth } from '@/contexts/AuthContext';
import {
	deleteBlacksmithTemplate,
	loadBlacksmithTemplates,
	saveBlacksmithTemplate,
	type BlacksmithTemplateValues,
} from '@/lib/blacksmithItems';
import { isSupabaseConfigured } from '@/lib/supabase';
import type {
	BlacksmithTemplate,
	ItemAffix,
	ItemCategory,
	Rarity,
	WeaponMasteryKey,
} from '@/types';

export const Route = createFileRoute('/_protected/blacksmith/workshop')({
	component: BlacksmithWorkshopPage,
});

type EditorValues = {
	name: string;
	category: ItemCategory;
	subType: string;
	rarity: Rarity;
	icon: string;
	damage: string;
	mastery: WeaponMasteryKey;
	ac: string;
	weight: string;
	valueGp: string;
	requiresAttunement: boolean;
	maxCharges: string;
	effects: string;
	flavor: string;
	dmNotes: string;
	isEquippable: boolean;
	isConsumable: boolean;
	isImportant: boolean;
	affixesJson: string;
	isShared: boolean;
};

const EMPTY_FORM: EditorValues = {
	name: '',
	category: 'Misc',
	subType: '',
	rarity: 'Common',
	icon: 'Package',
	damage: '',
	mastery: 'None',
	ac: '',
	weight: '0',
	valueGp: '0',
	requiresAttunement: false,
	maxCharges: '0',
	effects: '',
	flavor: '',
	dmNotes: '',
	isEquippable: false,
	isConsumable: false,
	isImportant: false,
	affixesJson: '[]',
	isShared: false,
};

const CATEGORIES: { value: ItemCategory; label: string }[] = [
	{ value: 'Weapon', label: '武器' },
	{ value: 'Armor', label: '護甲' },
	{ value: 'Consumable', label: '消耗品' },
	{ value: 'Misc', label: '雜物' },
];
const CATEGORY_LABELS: Record<ItemCategory, string> = {
	Weapon: '武器',
	Armor: '護甲',
	Consumable: '消耗品',
	Misc: '雜物',
};
const RARITIES: Rarity[] = [
	'Common',
	'Uncommon',
	'Rare',
	'VeryRare',
	'Legendary',
	'Artifact',
];
const MASTERIES: WeaponMasteryKey[] = [
	'None',
	'Cleave',
	'Graze',
	'Nick',
	'Push',
	'Sap',
	'Slow',
	'Topple',
	'Vex',
];

function toEditorValues(item: BlacksmithTemplate): EditorValues {
	return {
		name: item.name,
		category: item.category,
		subType: item.subType,
		rarity: item.rarity,
		icon: item.icon,
		damage: item.damage ?? '',
		mastery: item.mastery,
		ac: item.ac ?? '',
		weight: String(item.weight),
		valueGp: String(item.valueGp),
		requiresAttunement: item.requiresAttunement,
		maxCharges: String(item.maxCharges),
		effects: item.effects,
		flavor: item.flavor,
		dmNotes: item.dmNotes,
		isEquippable: item.isEquippable,
		isConsumable: item.isConsumable,
		isImportant: item.isImportant,
		affixesJson: JSON.stringify(item.affixes, null, 2),
		isShared: item.isShared,
	};
}

function parseNonNegativeNumber(value: string, label: string): number {
	if (!value.trim()) throw new Error(`${label}不可空白。`);
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${label}必須是大於或等於 0 的有效數值。`);
	}
	return parsed;
}

function parseAffixes(value: string): ItemAffix[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error('附魔詞條必須是有效的 JSON 陣列。');
	}
	if (
		!Array.isArray(parsed) ||
		!parsed.every(
			(entry) =>
				typeof entry === 'object' &&
				entry !== null &&
				typeof entry.id === 'string' &&
				typeof entry.name === 'string' &&
				typeof entry.desc === 'string' &&
				(entry.isHidden === undefined || typeof entry.isHidden === 'boolean'),
		)
	) {
		throw new Error('每筆附魔詞條都必須包含字串 id、name、desc 及選用的布林 isHidden。');
	}
	return parsed;
}

function createTemplateValues(form: EditorValues): BlacksmithTemplateValues {
	const name = form.name.trim();
	if (!name || name.length > 120) {
		throw new Error('物品名稱必須為 1 至 120 個字元。');
	}
	if (form.subType.length > 120) throw new Error('物品子類型不可超過 120 個字元。');
	if (!form.icon.trim() || form.icon.trim().length > 500) {
		throw new Error('圖示名稱必須為 1 至 500 個字元。');
	}
	const maxCharges = parseNonNegativeNumber(form.maxCharges, '最大充能');
	if (!Number.isInteger(maxCharges)) throw new Error('最大充能必須是整數。');

	return {
		name,
		category: form.category,
		subType: form.subType.trim(),
		rarity: form.rarity,
		icon: form.icon.trim(),
		damage: form.damage.trim() || null,
		mastery: form.mastery,
		ac: form.ac.trim() || null,
		weight: parseNonNegativeNumber(form.weight, '重量'),
		valueGp: parseNonNegativeNumber(form.valueGp, '價值'),
		requiresAttunement: form.requiresAttunement,
		isHomebrew: true,
		maxCharges,
		effects: form.effects,
		flavor: form.flavor,
		dmNotes: form.dmNotes,
		isEquippable: form.isEquippable,
		isConsumable: form.isConsumable,
		isImportant: form.isImportant,
		affixes: parseAffixes(form.affixesJson),
		isShared: form.isShared,
	};
}

function BlacksmithWorkshopPage() {
	const { user, isGuest } = useAuth();
	const [mine, setMine] = useState<BlacksmithTemplate[]>([]);
	const [shared, setShared] = useState<BlacksmithTemplate[]>([]);
	const [activeTab, setActiveTab] = useState<'mine' | 'shared'>('mine');
	const [query, setQuery] = useState('');
	const [form, setForm] = useState<EditorValues>(EMPTY_FORM);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [isEditorOpen, setIsEditorOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(
		null,
	);
	const [reloadKey, setReloadKey] = useState(0);

	useEffect(() => {
		let isMounted = true;
		if (!isSupabaseConfigured || isGuest || !user) {
			return () => {
				isMounted = false;
			};
		}
		Promise.resolve().then(() => {
			if (isMounted) {
				setIsLoading(true);
				setErrorMessage(null);
			}
			return loadBlacksmithTemplates(user.id);
		})
			.then(({ mine: ownItems, shared: sharedItems }) => {
				if (!isMounted) return;
				setMine(ownItems);
				setShared(sharedItems);
			})
			.catch((error: unknown) => {
				if (isMounted) {
					setErrorMessage(
						error instanceof Error ? error.message : '載入鍛造物品失敗。',
					);
				}
			})
			.finally(() => {
				if (isMounted) setIsLoading(false);
			});
		return () => {
			isMounted = false;
		};
	}, [user, isGuest, reloadKey]);

	const visibleItems = useMemo(() => {
		const items = activeTab === 'mine' ? mine : shared;
		const needle = query.trim().toLocaleLowerCase();
		if (!needle) return items;
		return items.filter((item) =>
			[
				item.name,
				item.category,
				item.subType,
				item.rarity,
				item.effects,
				item.flavor,
				...item.affixes.flatMap((affix) => [affix.name, affix.desc]),
			]
				.join(' ')
				.toLocaleLowerCase()
				.includes(needle),
		);
	}, [activeTab, mine, query, shared]);

	const openNewEditor = () => {
		setEditingId(null);
		setForm(EMPTY_FORM);
		setErrorMessage(null);
		setIsEditorOpen(true);
	};

	const openEditor = (item: BlacksmithTemplate) => {
		setEditingId(item.id);
		setForm(toEditorValues(item));
		setErrorMessage(null);
		setIsEditorOpen(true);
	};

	const handleSave = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);
		if (!user || isGuest) {
			setErrorMessage('請登入正式帳號後再建立或修改鍛造物品。');
			return;
		}
		let values: BlacksmithTemplateValues;
		try {
			values = createTemplateValues(form);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : '物品資料格式錯誤。');
			return;
		}
		setIsSaving(true);
		try {
			const saved = await saveBlacksmithTemplate(values, user.id, editingId ?? undefined);
			setMine((items) => {
				const updated = items.filter((item) => item.id !== saved.id);
				return [saved, ...updated];
			});
			setIsEditorOpen(false);
			setNotice(editingId ? '鍛造樣板已更新。' : '鍛造樣板已保存。');
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : '保存失敗，請稍後重試。',
			);
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async (item: BlacksmithTemplate) => {
		if (deleteConfirmationId !== item.id) {
			setDeleteConfirmationId(item.id);
			return;
		}
		if (!user || isGuest) return;
		setErrorMessage(null);
		try {
			await deleteBlacksmithTemplate(item.id, user.id);
			setMine((items) => items.filter((candidate) => candidate.id !== item.id));
			setDeleteConfirmationId(null);
			setNotice('鍛造樣板已刪除；其他冒險者的已匯入副本不會受到影響。');
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : '刪除失敗，請稍後重試。',
			);
		}
	};

	const isCloudReady = isSupabaseConfigured && !isGuest && Boolean(user);
	const updateForm = <K extends keyof EditorValues>(
		key: K,
		value: EditorValues[K],
	) => setForm((current) => ({ ...current, [key]: value }));

	return (
		<main className='min-h-screen bg-[#0c0a09] px-4 py-8 text-stone-200 sm:px-8'>
			<div className='mx-auto max-w-6xl'>
				<div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
					<Link
						to='/blacksmith'
						className='text-sm text-amber-300 underline-offset-4 hover:underline'
					>
						返回鍛造工坊
					</Link>
					<button
						type='button'
						onClick={() => setReloadKey((key) => key + 1)}
						disabled={!isCloudReady || isLoading}
						className='inline-flex items-center gap-2 rounded-md border border-stone-700 px-3 py-2 text-sm text-stone-300 hover:border-amber-700 disabled:opacity-50'
					>
						<RotateCw className='h-4 w-4' />
						重新載入
					</button>
				</div>
				<header className='mb-6 border-b border-purple-900/50 pb-5'>
					<p className='text-xs font-semibold tracking-[0.2em] text-purple-300'>
						BLACKSMITH · 鍛造與分享
					</p>
					<h1 className='mt-2 flex items-center gap-3 font-serif text-3xl font-bold text-purple-100'>
						<Hammer className='h-7 w-7 text-purple-300' />
						我的鍛造與分享
					</h1>
					<p className='mt-2 text-sm text-stone-400'>
						樣板與戰役物品分開保存；分享只會公開樣板，不會變更已匯入戰役的副本。
					</p>
				</header>

				{!isCloudReady && (
					<div className='mb-5 rounded-lg border border-amber-800/70 bg-amber-950/30 p-4 text-sm text-amber-200'>
						{!isSupabaseConfigured
							? '鍛造、分享與雲端樣板需要 Supabase 設定；目前不會將資料假裝保存於本機。'
							: '請使用正式帳號登入，訪客模式無法讀取或保存雲端鍛造樣板。'}
					</div>
				)}

				{(errorMessage || notice) && (
					<div
						role={errorMessage ? 'alert' : 'status'}
						className={`mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
							errorMessage
								? 'border-red-800/70 bg-red-950/40 text-red-200'
								: 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200'
						}`}
					>
						{errorMessage && <AlertCircle className='h-4 w-4 shrink-0' />}
						{errorMessage ?? notice}
						{notice && (
							<button
								type='button'
								className='ml-auto text-xs underline'
								onClick={() => setNotice(null)}
							>
								關閉
							</button>
						)}
					</div>
				)}

				<div className='mb-5 flex flex-wrap items-center gap-3'>
					<div className='flex rounded-lg border border-stone-800 bg-stone-950 p-1'>
						<button
							type='button'
							aria-pressed={activeTab === 'mine'}
							onClick={() => setActiveTab('mine')}
							className={`rounded-md px-4 py-2 text-sm ${activeTab === 'mine' ? 'bg-purple-900/70 text-purple-100' : 'text-stone-400 hover:text-stone-200'}`}
						>
							我的樣板（{mine.length}）
						</button>
						<button
							type='button'
							aria-pressed={activeTab === 'shared'}
							onClick={() => setActiveTab('shared')}
							className={`rounded-md px-4 py-2 text-sm ${activeTab === 'shared' ? 'bg-amber-900/70 text-amber-100' : 'text-stone-400 hover:text-stone-200'}`}
						>
							冒險者分享（{shared.length}）
						</button>
					</div>
					<input
						aria-label='搜尋鍛造物品'
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder='搜尋名稱、類型、效果…'
						className='min-w-56 flex-1 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-600'
					/>
					{activeTab === 'mine' && (
						<button
							type='button'
							onClick={openNewEditor}
							disabled={!isCloudReady}
							className='inline-flex items-center gap-2 rounded-md bg-purple-800 px-4 py-2 text-sm font-semibold text-purple-50 hover:bg-purple-700 disabled:opacity-50'
						>
							<Plus className='h-4 w-4' />
							鍛造新物品
						</button>
					)}
				</div>

				{!isCloudReady ? (
					<div className='rounded-xl border border-stone-800 bg-stone-950 p-12 text-center text-sm text-stone-400'>
						登入正式帳號並設定 Supabase 後，即可管理自己的鍛造樣板及瀏覽社群分享。
					</div>
				) : isLoading ? (
					<div role='status' className='rounded-xl border border-stone-800 bg-stone-950 p-12 text-center text-stone-400'>
						正在讀取鍛造樣板…
					</div>
				) : errorMessage && isCloudReady ? (
					<div className='rounded-xl border border-stone-800 bg-stone-950 p-12 text-center text-stone-400'>
						無法載入樣板，請檢查連線與資料庫 migration 狀態。
					</div>
				) : visibleItems.length === 0 ? (
					<div className='rounded-xl border border-stone-800 bg-stone-950 p-12 text-center'>
						<Eye className='mx-auto h-7 w-7 text-stone-500' />
						<h2 className='mt-3 font-serif text-lg font-bold text-stone-200'>
							{activeTab === 'mine' ? '尚未鍛造任何物品' : '目前沒有公開分享物品'}
						</h2>
						<p className='mt-1 text-sm text-stone-400'>
							{activeTab === 'mine'
								? '建立的樣板預設為私人，之後可自行開啟分享。'
								: '其他冒險者分享的物品會顯示在這裡。'}
						</p>
					</div>
				) : (
					<ul className='grid gap-4 md:grid-cols-2'>
						{visibleItems.map((item) => (
							<li
								key={item.id}
								className='rounded-xl border border-stone-800 bg-stone-950/80 p-5'
							>
								<div className='flex items-start justify-between gap-4'>
									<div className='min-w-0'>
										<h2 className='truncate font-serif text-lg font-bold text-amber-100'>
											{item.name}
										</h2>
										<p className='mt-1 text-xs text-stone-400'>
											{CATEGORY_LABELS[item.category]} · {item.subType || '未分類'} · {RARITY_CONFIG[item.rarity].label}
										</p>
									</div>
									{activeTab === 'mine' ? (
										<span
											className={`rounded-full border px-2 py-1 text-xs ${item.isShared ? 'border-amber-700/70 bg-amber-950/40 text-amber-200' : 'border-stone-700 text-stone-400'}`}
										>
											{item.isShared ? '已分享' : '私人'}
										</span>
									) : (
										<span className='rounded-full border border-amber-700/70 bg-amber-950/40 px-2 py-1 text-xs text-amber-200'>
											分享樣板
										</span>
									)}
								</div>
								<p className='mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-stone-300'>
									{item.effects || item.flavor || '尚無效果描述。'}
								</p>
								<p className='mt-3 font-mono text-xs text-stone-500'>
									重量 {item.weight} lb · 價值 {item.valueGp} GP
								</p>
								<div className='mt-4'>
									<BlacksmithImportButton source={item} />
								</div>
								{activeTab === 'mine' && (
									<div className='mt-4 flex items-center gap-2 border-t border-stone-800 pt-3'>
										<button
											type='button'
											onClick={() => openEditor(item)}
											className='rounded-md border border-stone-700 px-3 py-1.5 text-xs text-stone-200 hover:border-purple-600'
										>
											編輯／分享設定
										</button>
										<button
											type='button'
											onClick={() => void handleDelete(item)}
											className='inline-flex items-center gap-1 rounded-md border border-red-900/70 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/50'
										>
											<Trash2 className='h-3.5 w-3.5' />
											{deleteConfirmationId === item.id ? '再次按下確認刪除' : '刪除'}
										</button>
										{deleteConfirmationId === item.id && (
											<button
												type='button'
												onClick={() => setDeleteConfirmationId(null)}
												className='text-xs text-stone-400 underline'
											>
												取消
											</button>
										)}
									</div>
								)}
							</li>
						))}
					</ul>
				)}
			</div>

			{isEditorOpen && (
				<div className='fixed inset-0 z-40 overflow-y-auto bg-black/80 px-4 py-8'>
					<form
						onSubmit={handleSave}
						className='mx-auto max-w-3xl space-y-4 rounded-xl border border-purple-800/70 bg-stone-950 p-5 shadow-2xl'
					>
						<div className='flex items-center justify-between border-b border-stone-800 pb-3'>
							<h2 className='font-serif text-xl font-bold text-purple-100'>
								{editingId ? '編輯鍛造樣板' : '鍛造新物品'}
							</h2>
							<button
								type='button'
								onClick={() => setIsEditorOpen(false)}
								className='text-sm text-stone-400 hover:text-stone-100'
							>
								關閉
							</button>
						</div>
						<div className='grid gap-3 sm:grid-cols-2'>
							<label className='text-xs text-stone-400'>
								物品名稱 *
								<input
									required
									maxLength={120}
									value={form.name}
									onChange={(event) => updateForm('name', event.target.value)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								/>
							</label>
							<label className='text-xs text-stone-400'>
								圖示名稱 *
								<input
									required
									maxLength={500}
									value={form.icon}
									onChange={(event) => updateForm('icon', event.target.value)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								/>
							</label>
							<label className='text-xs text-stone-400'>
								物品分類
								<select
									value={form.category}
									onChange={(event) => updateForm('category', event.target.value as ItemCategory)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								>
									{CATEGORIES.map((category) => (
										<option key={category.value} value={category.value}>{category.label}</option>
									))}
								</select>
							</label>
							<label className='text-xs text-stone-400'>
								子類型
								<input
									maxLength={120}
									value={form.subType}
									onChange={(event) => updateForm('subType', event.target.value)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								/>
							</label>
							<label className='text-xs text-stone-400'>
								稀有度
								<select
									value={form.rarity}
									onChange={(event) => updateForm('rarity', event.target.value as Rarity)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								>
									{RARITIES.map((rarity) => <option key={rarity} value={rarity}>{RARITY_CONFIG[rarity].label}</option>)}
								</select>
							</label>
							<label className='text-xs text-stone-400'>
								武器精通
								<select
									value={form.mastery}
									onChange={(event) => updateForm('mastery', event.target.value as WeaponMasteryKey)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								>
									{MASTERIES.map((mastery) => <option key={mastery} value={mastery}>{WEAPON_MASTERIES[mastery].name}</option>)}
								</select>
							</label>
							<label className='text-xs text-stone-400'>
								傷害
								<input
									value={form.damage}
									onChange={(event) => updateForm('damage', event.target.value)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								/>
							</label>
							<label className='text-xs text-stone-400'>
								護甲值
								<input
									value={form.ac}
									onChange={(event) => updateForm('ac', event.target.value)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								/>
							</label>
							<label className='text-xs text-stone-400'>
								重量（磅）
								<input
									type='number'
									min='0'
									step='any'
									value={form.weight}
									onChange={(event) => updateForm('weight', event.target.value)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								/>
							</label>
							<label className='text-xs text-stone-400'>
								價值（GP）
								<input
									type='number'
									min='0'
									step='any'
									value={form.valueGp}
									onChange={(event) => updateForm('valueGp', event.target.value)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								/>
							</label>
							<label className='text-xs text-stone-400'>
								最大充能
								<input
									type='number'
									min='0'
									step='1'
									value={form.maxCharges}
									onChange={(event) => updateForm('maxCharges', event.target.value)}
									className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100'
								/>
							</label>
						</div>
						<div className='grid gap-3 sm:grid-cols-2'>
							<label className='flex items-center gap-2 text-sm text-stone-300'>
								<input type='checkbox' checked={form.requiresAttunement} onChange={(event) => updateForm('requiresAttunement', event.target.checked)} />
								需要調諧
							</label>
							<label className='flex items-center gap-2 text-sm text-stone-300'>
								<input type='checkbox' checked={form.isEquippable} onChange={(event) => updateForm('isEquippable', event.target.checked)} />
								可裝備
							</label>
							<label className='flex items-center gap-2 text-sm text-stone-300'>
								<input type='checkbox' checked={form.isConsumable} onChange={(event) => updateForm('isConsumable', event.target.checked)} />
								消耗品
							</label>
							<label className='flex items-center gap-2 text-sm text-stone-300'>
								<input type='checkbox' checked={form.isImportant} onChange={(event) => updateForm('isImportant', event.target.checked)} />
								重要物品
							</label>
						</div>
						<label className='block text-xs text-stone-400'>
							效果
							<textarea value={form.effects} onChange={(event) => updateForm('effects', event.target.value)} rows={3} className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100' />
						</label>
						<label className='block text-xs text-stone-400'>
							風味描述
							<textarea value={form.flavor} onChange={(event) => updateForm('flavor', event.target.value)} rows={2} className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100' />
						</label>
						<label className='block text-xs text-stone-400'>
							鍛造備註（開啟分享時會一併公開）
							<textarea value={form.dmNotes} onChange={(event) => updateForm('dmNotes', event.target.value)} rows={2} className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100' />
						</label>
						<label className='block text-xs text-stone-400'>
							附魔詞條 JSON
							<textarea value={form.affixesJson} onChange={(event) => updateForm('affixesJson', event.target.value)} rows={5} spellCheck={false} className='mt-1 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 font-mono text-xs text-stone-100' />
						</label>
						<label className='flex items-start gap-2 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-100'>
							<input type='checkbox' checked={form.isShared} onChange={(event) => updateForm('isShared', event.target.checked)} />
							<span>
								與其他已登入冒險者分享此樣板
								<span className='mt-1 block text-xs text-amber-200/70'>
									分享後其他使用者可讀取完整樣板內容，但不能修改或刪除；取消分享後即不再提供他人讀取。
								</span>
							</span>
						</label>
						<div className='flex justify-end gap-2 border-t border-stone-800 pt-3'>
							<button type='button' onClick={() => setIsEditorOpen(false)} className='rounded-md border border-stone-700 px-4 py-2 text-sm text-stone-300'>取消</button>
							<button type='submit' disabled={isSaving} className='rounded-md bg-purple-800 px-4 py-2 text-sm font-semibold text-purple-50 hover:bg-purple-700 disabled:opacity-50'>
								{isSaving ? '正在保存…' : '保存樣板'}
							</button>
						</div>
					</form>
				</div>
			)}
		</main>
	);
}
