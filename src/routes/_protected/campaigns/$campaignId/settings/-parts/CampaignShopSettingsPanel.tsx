import { useEffect, useState, type FormEvent } from 'react';
import { Check, Save } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/contexts/FeedbackContext';
import {
	loadBlacksmithCatalogDefinitions,
} from '@/lib/blacksmithCatalog';
import type { BlacksmithCatalogDefinition } from '@/types';

interface CampaignShopSettingsPanelProps {
	isDm: boolean;
	selectedCatalogIds: string[];
	onSave: (catalogIds: string[]) => Promise<void>;
}

export function CampaignShopSettingsPanel({
	isDm,
	selectedCatalogIds,
	onSave,
}: CampaignShopSettingsPanelProps) {
	const toast = useToast();
	const [definitions, setDefinitions] = useState<BlacksmithCatalogDefinition[]>(
		[],
	);
	const [draft, setDraft] = useState({
		source: selectedCatalogIds,
		catalogIds: selectedCatalogIds,
	});
	const draftCatalogIds =
		draft.source === selectedCatalogIds ? draft.catalogIds : selectedCatalogIds;
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		let isMounted = true;
		loadBlacksmithCatalogDefinitions()
			.then((catalogDefinitions) => {
				if (isMounted) setDefinitions(catalogDefinitions);
			})
			.catch((error: unknown) => {
				if (isMounted) {
					setErrorMessage(
						error instanceof Error ? error.message : '載入官方規則書失敗。',
					);
				}
			})
			.finally(() => {
				if (isMounted) setIsLoading(false);
			});
		return () => {
			isMounted = false;
		};
	}, []);

	const toggleCatalog = (catalogId: string, checked: boolean) => {
		setDraft({
			source: selectedCatalogIds,
			catalogIds: checked
				? [...draftCatalogIds, catalogId]
				: draftCatalogIds.filter((entry) => entry !== catalogId),
		});
	};

	const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsSaving(true);
		setErrorMessage(null);
		try {
			await onSave(draftCatalogIds);
			toast.success('戰役商店規則書設定已儲存。');
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : '儲存戰役商店規則書設定失敗。',
			);
		} finally {
			setIsSaving(false);
		}
	};

	const invalidSelectedCatalogIds = draftCatalogIds.filter(
		(catalogId) =>
			!definitions.some((definition) => definition.catalogId === catalogId),
	);

	return (
		<section
			className='rounded-lg border border-border/70 bg-background p-6 shadow-xl'
			data-testid='campaign-shop-settings'
		>
			<div className='border-b border-border pb-3'>
				<h2 className='font-serif text-lg font-bold text-foreground'>
					戰役商店規則書
				</h2>
				<p className='mt-1 text-xs leading-relaxed text-muted-foreground'>
					選擇此戰役商店可使用的官方規則書，可複選。商店刷新政策使用「此戰役的規則書」時，會以此處選取的目錄建立候選篩選器。
				</p>
			</div>

			{!isDm && (
				<p className='mt-4 rounded border border-border bg-card px-3 py-2 text-xs text-muted-foreground'>
					唯讀模式（僅 DM 可修改）
				</p>
			)}
			{errorMessage && (
				<p role='alert' className='mt-4 text-sm text-destructive-foreground'>
					{errorMessage}
				</p>
			)}
			{invalidSelectedCatalogIds.length > 0 && (
				<p role='alert' className='mt-4 text-sm text-destructive-foreground'>
					目前設定包含不存在的官方規則書：
					{invalidSelectedCatalogIds.join('、')}
				</p>
			)}

			<form onSubmit={(event) => void saveSettings(event)} className='mt-4 space-y-4'>
				{isLoading ? (
					<p className='text-sm text-muted-foreground'>載入官方規則書中…</p>
				) : definitions.length === 0 ? (
					<p className='text-sm text-muted-foreground'>目前沒有可用的官方規則書。</p>
				) : (
					<div className='grid gap-2 sm:grid-cols-2'>
						{definitions.map((definition) => (
							<label
								key={definition.catalogId}
								className='flex cursor-pointer items-start gap-3 rounded-md border border-border bg-card/60 p-3 text-sm text-foreground'
							>
								<input
									type='checkbox'
									data-testid={`campaign-official-catalog-${definition.catalogId}`}
									checked={draftCatalogIds.includes(definition.catalogId)}
									disabled={!isDm || isSaving}
									onChange={(event) =>
										toggleCatalog(definition.catalogId, event.target.checked)
									}
									className='mt-0.5 h-4 w-4 accent-primary'
								/>
								<span>
									<span className='block font-medium'>{definition.title}</span>
									<span className='mt-1 block font-mono text-[11px] text-muted-foreground'>
										{definition.catalogId}
									</span>
								</span>
							</label>
						))}
					</div>
				)}

				{isDm && (
					<div className='flex justify-end border-t border-border pt-4'>
						<Button
							type='submit'
							disabled={
								isLoading ||
								isSaving ||
								invalidSelectedCatalogIds.length > 0 ||
								(draftCatalogIds.length === 0 && definitions.length === 0)
							}
							prefixIcon={
								isSaving ? (
									<Check />
								) : (
									<Save />
								)
							}
						>
							<span>{isSaving ? '儲存中…' : '儲存設定'}</span>
						</Button>
					</div>
				)}
			</form>
		</section>
	);
}
