/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { LogOut, Plus, Swords, Users, X, UserCog, Hammer } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, toDbItem } from '@/lib/supabase';
import { INITIAL_CHARACTERS, INITIAL_ITEMS } from '@/data';
import { Button, Input, Select } from '@/components/ui';
import { useToast } from '@/contexts/FeedbackContext';

export const Route = createFileRoute('/_protected/')({
	component: CampaignLobbyPage,
});

type LobbyDialog = 'create' | 'join' | null;
type CampaignTemplate = 'sample' | 'blank';

interface Campaign {
	id: string;
	name: string;
	dm_id: string;
	invite_code: string;
	created_at?: string;
}

function CampaignLobbyPage() {
	const navigate = useNavigate();
	const { user, isGuest, signOut } = useAuth();
	const toast = useToast();
	const [dialog, setDialog] = useState<LobbyDialog>(null);
	const [campaignName, setCampaignName] = useState('');
	const [campaignTemplate, setCampaignTemplate] =
		useState<CampaignTemplate>('sample');
	const [inviteCode, setInviteCode] = useState('');
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [campaigns, setCampaigns] = useState<Campaign[]>([]);
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		if (dialog && dialogRef.current && !dialogRef.current.open) {
			dialogRef.current.showModal();
			dialogRef.current.querySelector<HTMLElement>('[data-autofocus]')?.focus();
		}
	}, [dialog]);

	const closeDialog = () => {
		if (dialogRef.current?.open) dialogRef.current.close();
		setDialog(null);
	};

	// 載入使用者的戰役列表
	useEffect(() => {
		let isMounted = true;
		async function fetchCampaigns() {
			if (!supabase || isGuest) return;
			try {
				const { data, error } = await supabase
					.from('campaigns')
					.select('*')
					.order('created_at', { ascending: false });

				if (error) throw error;
				if (isMounted && data) {
					setCampaigns(data);
				}
			} catch (err) {
				console.error('載入戰役列表失敗:', err);
			}
		}
		fetchCampaigns();
		return () => {
			isMounted = false;
		};
	}, [isGuest]);

	const handleSignOut = async () => {
		try {
			await signOut();
			toast.success('已成功登出。');
			await navigate({ to: '/login' });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : '登出失敗，請稍後再試。',
			);
		}
	};

	// 真正建立新戰役的邏輯
	const handleCreateCampaign = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!campaignName.trim()) return;

		setIsSubmitting(true);
		setErrorMessage(null);

		try {
			let newCampaignId = `campaign-${Date.now()}`;
			if (supabase && !isGuest) {
				if (!user) throw new Error('登入狀態無效，請重新登入後再建立戰役。');

				const seed =
					campaignTemplate === 'sample'
						? {
								characters: INITIAL_CHARACTERS.filter(
									(character) => character.id !== 'camp-chest',
								).map((character) => ({
									id: character.id,
									name: character.name,
									title: character.title,
									avatar: character.avatar,
									str: character.str,
									currencies: character.currencies,
									private_currencies: character.privateCurrencies,
								})),
								items: INITIAL_ITEMS.map(toDbItem),
								camp_chest_currency: {
									pp: 0,
									gp: 0,
									ep: 0,
									sp: 0,
									cp: 0,
								},
							}
						: {
								characters: [],
								items: [],
								camp_chest_currency: {
									pp: 0,
									gp: 0,
									ep: 0,
									sp: 0,
									cp: 0,
								},
							};
				const { data, error } = await supabase.functions.invoke<{
					campaign_id: string;
					invite_code: string;
				}>('create-campaign', {
					body: {
						name: campaignName.trim(),
						template: campaignTemplate,
						seed,
					},
				});
				if (error) {
					if (error.context instanceof Response) {
						const errorBody: unknown = await error.context
							.clone()
							.json()
							.catch(() => null);
						if (
							errorBody &&
							typeof errorBody === 'object' &&
							'error' in errorBody &&
							typeof errorBody.error === 'string'
						) {
							throw new Error(errorBody.error);
						}
					}
					throw new Error(error.message);
				}
				if (!data?.campaign_id || !data.invite_code) {
					throw new Error('建立戰役服務未回傳完整結果，請稍後再試。');
				}

				newCampaignId = data.campaign_id;
				setCampaigns((current) => [
					{
						id: data.campaign_id,
						name: campaignName.trim(),
						dm_id: user.id,
						invite_code: data.invite_code,
					},
					...current,
				]);
			}

			// 3. 清理狀態並跳轉至新戰役背包
			closeDialog();
			setCampaignName('');
			toast.success(
				campaignTemplate === 'sample' ? '範例戰役已建立。' : '空白戰役已建立。',
			);
			await navigate({
				to: '/campaigns/$campaignId',
				params: { campaignId: newCampaignId },
			});
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : '建立新戰役失敗，請稍後再試。',
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleJoinCampaign = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!inviteCode.trim()) return;

		setIsSubmitting(true);
		setErrorMessage(null);

		try {
			const cleanCode = inviteCode.trim().toUpperCase();
			if (!supabase || isGuest || !user) {
				throw new Error('加入戰役需要有效的 Supabase 登入狀態。');
			}

			const { data, error } = await supabase.rpc(
				'join_campaign_by_invite_code',
				{ p_invite_code: cleanCode },
			);
			if (error) throw new Error(error.message);
			if (
				!data ||
				typeof data !== 'object' ||
				!('campaign_id' in data) ||
				typeof data.campaign_id !== 'string'
			) {
				throw new Error('加入戰役服務未回傳有效的戰役資料。');
			}

			closeDialog();
			setInviteCode('');
			toast.success('已成功加入戰役。');
			await navigate({
				to: '/campaigns/$campaignId',
				params: { campaignId: data.campaign_id },
			});
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : '加入戰役失敗，請稍後再試。',
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<main className='relative min-h-screen overflow-hidden bg-background px-4 py-8 text-foreground sm:px-8'>
			<div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--primary)_18%,transparent),var(--background)_70%)]' />
			<div className='relative z-10 mx-auto max-w-6xl'>
				<header className='mb-10 flex flex-col gap-5 border-b border-primary/50 pb-5 sm:flex-row sm:items-center sm:justify-between'>
					<div className='flex items-center gap-3'>
						<div className='flex h-12 w-12 items-center justify-center rounded-lg border border-primary/60 bg-gradient-to-br from-primary via-primary to-background'>
							<Swords className='h-6 w-6 text-primary-foreground' />
						</div>
						<div>
							<p className='text-xs font-semibold tracking-[0.2em] text-muted-foreground'>
								戰役軍械庫
							</p>
							<h1 className='font-serif text-2xl font-bold text-foreground'>
								冒險者大廳
							</h1>
						</div>
					</div>
					<div className='flex flex-wrap items-center gap-3'>
						<div className='rounded-md border border-border bg-card/80 px-3 py-2 text-xs'>
							<span className='text-muted-foreground'>目前身分：</span>
							<span className='font-semibold text-highlight'>
								{isGuest ? '訪客冒險者' : (user?.email ?? '已登入使用者')}
							</span>
						</div>
						<Button
							asChild
							variant='secondary'
							size='sm'
							prefixIcon={<Hammer />}
						>
							<Link data-testid='lobby-blacksmith-link' to='/blacksmith'>
								<span>鍛造工坊</span>
							</Link>
						</Button>
						<Button
							asChild
							variant='secondary'
							size='sm'
							prefixIcon={<UserCog />}
						>
							<Link data-testid='lobby-profile-link' to='/settings/profile'>
								<span>帳號設定</span>
							</Link>
						</Button>
						<Button
							type='button'
							variant='secondary'
							size='sm'
							onClick={handleSignOut}
							prefixIcon={<LogOut />}
						>
							登出
						</Button>
					</div>
				</header>

				{errorMessage && (
					<div
						data-testid='lobby-error'
						role='alert'
						className='mb-5 rounded-md border border-destructive/70 bg-destructive/40 px-4 py-3 text-sm text-destructive-foreground'
					>
						{errorMessage}
					</div>
				)}

				<div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
					<div>
						<p className='mb-1 text-xs font-semibold tracking-[0.15em] text-highlight'>
							你的冒險即將展開
						</p>
						<h2
							data-testid='lobby-heading'
							className='font-serif text-xl font-bold text-foreground'
						>
							我的戰役列表
						</h2>
					</div>
					<div className='flex flex-wrap gap-2'>
						<Button
							data-testid='lobby-join-trigger'
							type='button'
							variant='secondary'
							onClick={() => {
								setDialog('join');
								setErrorMessage(null);
							}}
							prefixIcon={<Users />}
						>
							輸入邀請碼加入戰役
						</Button>
						<Button
							data-testid='lobby-create-trigger'
							type='button'
							variant='primary'
							onClick={() => {
								setDialog('create');
								setCampaignTemplate('sample');
								setErrorMessage(null);
							}}
							prefixIcon={<Plus />}
						>
							建立新戰役 (DM)
						</Button>
					</div>
				</div>

				<section
					aria-label='我的戰役列表'
					className='grid gap-4 md:grid-cols-2'
				>
					{campaigns.length === 0 ? (
						<div
							data-testid='lobby-empty-state'
							className='col-span-full rounded-xl border border-primary/60 bg-gradient-to-br from-card/90 via-background to-background px-6 py-10 text-center shadow-lg'
						>
							<div className='mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/60 bg-primary/50'>
								<Swords className='h-7 w-7 text-primary-foreground' />
							</div>
							<h3 className='mt-4 font-serif text-lg font-bold text-foreground'>
								尚未加入任何戰役
							</h3>
							<p className='mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground'>
								建立一場專屬戰役，成為 DM 展開冒險；或使用邀請碼加入朋友的戰役。
							</p>
							<Button
								data-testid='lobby-empty-create-trigger'
								type='button'
								onClick={() => {
									setDialog('create');
									setCampaignTemplate('sample');
									setErrorMessage(null);
								}}
								prefixIcon={<Plus />}
							>
								建立我的第一場戰役
							</Button>
						</div>
					) : (
						<>
							{/* 顯示使用者建立或加入的戰役 */}
							{campaigns.map((camp) => (
								<Link
									key={camp.id}
									to='/campaigns/$campaignId'
									params={{ campaignId: camp.id }}
									className='group relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card via-background to-card p-5 shadow-lg transition hover:-translate-y-0.5 hover:border-border/80 hover:shadow-lg'
								>
									<div className='absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-10 rounded-full bg-secondary/10 blur-2xl transition group-hover:bg-secondary/20' />
									<div className='relative flex items-start justify-between gap-4'>
										<div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/60'>
											<Swords className='h-6 w-6 text-foreground' />
										</div>
										<span className='rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[10px] font-semibold text-foreground'>
											自建戰役
										</span>
									</div>
									<div className='relative mt-5'>
										<h3 className='font-serif text-lg font-bold text-foreground truncate'>
											{camp.name}
										</h3>
										<p className='mt-2 text-xs leading-relaxed text-muted-foreground'>
											ID: {camp.id} • DM 專屬管理世界
										</p>
										<p className='mt-1 text-xs text-muted-foreground'>
											邀請碼:{' '}
											<strong className='text-highlight font-mono'>
												{camp.invite_code || '無'}
											</strong>
										</p>
									</div>
								</Link>
							))}
						</>
					)}
				</section>
			</div>

			{dialog && (
				<dialog
					ref={dialogRef}
					data-testid='lobby-dialog'
					aria-labelledby='lobby-dialog-title'
					onCancel={(event) => {
						event.preventDefault();
						closeDialog();
					}}
					className='m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border-2 border-primary/70 bg-background p-5 text-foreground shadow-lg backdrop:bg-background/75 backdrop:backdrop-blur-sm'
				>
					<div className='mb-4 flex items-center justify-between border-b border-border pb-3'>
						<h2
							data-testid='lobby-dialog-heading'
							id='lobby-dialog-title'
							className='font-serif font-bold text-foreground'
						>
							{dialog === 'create' ? '建立新戰役 (DM)' : '加入戰役'}
						</h2>
						<Button
							data-testid='lobby-dialog-close'
							type='button'
							variant='ghost'
							size='sm'
							onClick={closeDialog}
							aria-label='關閉視窗'
							prefixIcon={<X />}
						></Button>
					</div>

					{dialog === 'create' ? (
						<form onSubmit={handleCreateCampaign} className='space-y-4'>
							<Input
								data-testid='lobby-campaign-name'
								data-autofocus=''
								label='戰役名稱'
								required
								value={campaignName}
								onChange={(event) => setCampaignName(event.target.value)}
								placeholder='例如：博德之門：血戰風雲'
							/>
							{supabase && user && !isGuest && (
								<Select
									data-testid='lobby-campaign-template'
									label='戰役初始內容'
									value={campaignTemplate}
									onChange={(event) =>
										setCampaignTemplate(
											event.target.value === 'blank' ? 'blank' : 'sample',
										)
									}
								>
									<option value='sample'>範例戰役（3 名角色、9 件物品）</option>
									<option value='blank'>空白戰役（不建立角色與物品）</option>
								</Select>
							)}
							<p className='text-[11px] leading-relaxed text-muted-foreground'>
								{campaignTemplate === 'sample'
									? '建立獨立戰役，載入三名範例冒險者與九件物品；營地儲物箱會獨立保存。'
									: '建立獨立空白戰役；營地儲物箱仍可使用，角色與物品可稍後新增。'}
							</p>
							<div className='flex justify-end gap-2 pt-2'>
								<Button
									type='button'
									variant='secondary'
									size='sm'
									onClick={closeDialog}
								>
									取消
								</Button>
								<Button
									data-testid='lobby-create-submit'
									type='submit'
									loading={isSubmitting}
									size='sm'
								>
									{isSubmitting ? '鑄造中...' : '確認建立戰役'}
								</Button>
							</div>
						</form>
					) : (
						<form onSubmit={handleJoinCampaign} className='space-y-4'>
							<Input
								data-testid='lobby-invite-code'
								data-autofocus=''
								label='邀請碼'
								required
								value={inviteCode}
								onChange={(event) => setInviteCode(event.target.value)}
								placeholder='輸入 DM 提供的邀請碼'
							/>
							<p className='text-[11px] leading-relaxed text-muted-foreground'>
								使用 DM 提供的六碼邀請碼加入戰役。
							</p>
							<div className='flex justify-end gap-2 pt-2'>
								<Button
									type='button'
									variant='secondary'
									size='sm'
									onClick={closeDialog}
								>
									取消
								</Button>
								<Button data-testid='lobby-join-submit' type='submit' size='sm'>
									確認加入
								</Button>
							</div>
						</form>
					)}
				</dialog>
			)}
		</main>
	);
}
