import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCw } from 'lucide-react';
import { Checkbox, Button } from '@/components/ui';
import { loadBlacksmithCatalogDefinitions } from '@/lib/blacksmithCatalog';
import { loadSharedBlacksmithOwners } from '@/lib/blacksmithItems';
import type { BlacksmithCatalogDefinition } from '@/types';

export interface BlacksmithSourceSelection {
	mine: boolean;
	catalogIds: string[];
	sharedOwnerIds: string[];
}

interface BlacksmithSourceTreeProps {
	userId: string;
	selection: BlacksmithSourceSelection;
	onChange: (selection: BlacksmithSourceSelection) => void;
}

export default function BlacksmithSourceTree({
	userId,
	selection,
	onChange,
}: BlacksmithSourceTreeProps) {
	const [officialExpanded, setOfficialExpanded] = useState(false);
	const [sharedExpanded, setSharedExpanded] = useState(false);
	const [catalogs, setCatalogs] = useState<BlacksmithCatalogDefinition[]>([]);
	const [authors, setAuthors] = useState<string[]>([]);
	const [loadingCatalogs, setLoadingCatalogs] = useState(false);
	const [loadingAuthors, setLoadingAuthors] = useState(false);
	const [catalogError, setCatalogError] = useState<string | null>(null);
	const [authorError, setAuthorError] = useState<string | null>(null);
	const [catalogReload, setCatalogReload] = useState(0);
	const [authorReload, setAuthorReload] = useState(0);

	useEffect(() => {
		if (!officialExpanded) return;
		let active = true;
		void Promise.resolve()
			.then(() => {
				if (!active) return undefined;
				setLoadingCatalogs(true);
				setCatalogError(null);
				return loadBlacksmithCatalogDefinitions();
			})
			.then((items) => {
				if (active && items) setCatalogs(items);
			})
			.catch((error: unknown) => {
				if (active) {
					setCatalogError(
						error instanceof Error ? error.message : '官方規則書來源載入失敗。',
					);
				}
			})
			.finally(() => {
				if (active) setLoadingCatalogs(false);
			});
		return () => {
			active = false;
		};
	}, [officialExpanded, catalogReload]);

	useEffect(() => {
		if (!sharedExpanded || !userId) return;
		let active = true;
		void Promise.resolve()
			.then(() => {
				if (!active) return undefined;
				setLoadingAuthors(true);
				setAuthorError(null);
				return loadSharedBlacksmithOwners(userId);
			})
			.then((items) => {
				if (active && items) setAuthors(items);
			})
			.catch((error: unknown) => {
				if (active) {
					setAuthorError(
						error instanceof Error ? error.message : '分享來源載入失敗。',
					);
				}
			})
			.finally(() => {
				if (active) setLoadingAuthors(false);
			});
		return () => {
			active = false;
		};
	}, [sharedExpanded, userId, authorReload]);

	const toggleCatalog = (catalogId: string) => {
		const catalogIds = selection.catalogIds.includes(catalogId)
			? selection.catalogIds.filter((id) => id !== catalogId)
			: [...selection.catalogIds, catalogId];
		onChange({ ...selection, catalogIds });
	};

	const toggleAuthor = (ownerId: string) => {
		const sharedOwnerIds = selection.sharedOwnerIds.includes(ownerId)
			? selection.sharedOwnerIds.filter((id) => id !== ownerId)
			: [...selection.sharedOwnerIds, ownerId];
		onChange({ ...selection, sharedOwnerIds });
	};

	return (
		<section
			aria-label='鍛造工坊搜尋來源'
			className='space-y-2 rounded-lg border border-border bg-background/70 p-3'
		>
			<h3 className='text-sm font-semibold text-foreground'>搜尋來源</h3>
			<div className='pl-1'>
				<Checkbox
					label='我的鍛造工坊'
					checked={selection.mine}
					onChange={(event) =>
						onChange({ ...selection, mine: event.target.checked })
					}
				/>
			</div>

			<div className='rounded-md border border-border/70'>
				<button
					type='button'
					aria-expanded={officialExpanded}
					onClick={() => setOfficialExpanded((current) => !current)}
					className='flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm text-foreground hover:bg-card'
				>
					{officialExpanded ? (
						<ChevronDown aria-hidden='true' className='h-4 w-4' />
					) : (
						<ChevronRight aria-hidden='true' className='h-4 w-4' />
					)}
					官方規則書
				</button>
				{officialExpanded && (
					<div className='space-y-2 border-t border-border/70 p-2.5 pl-8'>
						{loadingCatalogs ? (
							<p role='status' className='text-xs text-muted-foreground'>
								正在載入規則書目錄…
							</p>
						) : catalogError ? (
							<div className='flex items-center justify-between gap-2'>
								<p role='alert' className='text-xs text-destructive-foreground'>
									{catalogError}
								</p>
								<Button
									type='button'
									variant='ghost'
									size='sm'
									onClick={() => setCatalogReload((current) => current + 1)}
									prefixIcon={<RotateCw />}
								>
									重試
								</Button>
							</div>
						) : catalogs.length === 0 ? (
							<p className='text-xs text-muted-foreground'>目前沒有可用目錄。</p>
						) : (
							catalogs.map((catalog) => (
								<Checkbox
									key={catalog.catalogId}
									label={
										<span>
											{catalog.title}
											<span className='ml-1 font-mono text-[10px] text-muted-foreground'>
												{catalog.catalogId}
											</span>
										</span>
									}
									checked={selection.catalogIds.includes(catalog.catalogId)}
									onChange={() => toggleCatalog(catalog.catalogId)}
								/>
							))
						)}
					</div>
				)}
			</div>

			<div className='rounded-md border border-border/70'>
				<button
					type='button'
					aria-expanded={sharedExpanded}
					onClick={() => setSharedExpanded((current) => !current)}
					className='flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm text-foreground hover:bg-card'
				>
					{sharedExpanded ? (
						<ChevronDown aria-hidden='true' className='h-4 w-4' />
					) : (
						<ChevronRight aria-hidden='true' className='h-4 w-4' />
					)}
					社群分享的鍛造工坊
				</button>
				{sharedExpanded && (
					<div className='space-y-2 border-t border-border/70 p-2.5 pl-8'>
						{loadingAuthors ? (
							<p role='status' className='text-xs text-muted-foreground'>
								正在載入分享來源…
							</p>
						) : authorError ? (
							<div className='flex items-center justify-between gap-2'>
								<p role='alert' className='text-xs text-destructive-foreground'>
									{authorError}
								</p>
								<Button
									type='button'
									variant='ghost'
									size='sm'
									onClick={() => setAuthorReload((current) => current + 1)}
									prefixIcon={<RotateCw />}
								>
									重試
								</Button>
							</div>
						) : authors.length === 0 ? (
							<p className='text-xs text-muted-foreground'>
								目前沒有可搜尋的分享來源。
							</p>
						) : (
							authors.map((authorId) => (
								<Checkbox
									key={authorId}
									label={
										<span className='font-mono text-xs'>
											分享者 {authorId}
										</span>
									}
									checked={selection.sharedOwnerIds.includes(authorId)}
									onChange={() => toggleAuthor(authorId)}
								/>
							))
						)}
					</div>
				)}
			</div>
		</section>
	);
}
