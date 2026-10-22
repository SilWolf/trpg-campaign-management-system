/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useState, useEffect, type FormEvent } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import {
	LogOut,
	Plus,
	ScrollText,
	Swords,
	Users,
	X,
	Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, toDbCharacter, toDbItem } from '@/lib/supabase';
import { INITIAL_CHARACTERS, INITIAL_ITEMS } from '@/data';

export const Route = createFileRoute('/_protected/')({
	component: CampaignLobbyPage,
});

type LobbyDialog = 'create' | 'join' | null;

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
	const [dialog, setDialog] = useState<LobbyDialog>(null);
	const [campaignName, setCampaignName] = useState('');
	const [inviteCode, setInviteCode] = useState('');
	const [notice, setNotice] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [campaigns, setCampaigns] = useState<Campaign[]>([]);

	// 載入使用者的戰役列表
	useEffect(() => {
		let isMounted = true;
		async function fetchCampaigns() {
			if (!supabase) return;
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
	}, []);

	const handleSignOut = async () => {
		try {
			await signOut();
			await navigate({ to: '/login' });
		} catch (error) {
			setErrorMessage(
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
			const newCampaignId = `campaign-${Date.now()}`;
			const dmId = user?.id ?? 'guest-dm';
			const inviteCodeGenerated = Math.random()
				.toString(36)
				.substring(2, 8)
				.toUpperCase();

			if (supabase) {
				// 1. 寫入 campaigns 主表
				const { error: campaignError } = await supabase
					.from('campaigns')
					.insert({
						id: newCampaignId,
						name: campaignName.trim(),
						dm_id: dmId,
						invite_code: inviteCodeGenerated,
					});

				if (campaignError) throw campaignError;

				await supabase.from('campaign_members').insert({
					campaign_id: newCampaignId,
					user_id: dmId,
					role: 'dm',
				});

				// 2. 自動為新戰役初始化預設角色與物品，帶上 campaign_id
				const initialCharsWithCampaign = INITIAL_CHARACTERS.map((c) => ({
					...toDbCharacter(c),
					campaign_id: newCampaignId,
				}));
				const initialItemsWithCampaign = INITIAL_ITEMS.map((i) => ({
					...toDbItem(i),
					campaign_id: newCampaignId,
				}));

				await supabase.from('characters').upsert(initialCharsWithCampaign);
				await supabase.from('inventory_items').upsert(initialItemsWithCampaign);
			}

			// 3. 清理狀態並跳轉至新戰役背包
			setDialog(null);
			setCampaignName('');
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
			const userId = user?.id ?? 'guest-user';

			if (supabase) {
				// 1. 根據邀請碼尋找戰役
				const { data: campaign, error: findError } = await supabase
					.from('campaigns')
					.select('id, name')
					.eq('invite_code', cleanCode)
					.single();

				if (findError || !campaign) {
					throw new Error('找不到對應的戰役，請確認邀請碼是否正確。');
				}

				// 2. 將使用者加入 campaign_members
				const { error: joinError } = await supabase
					.from('campaign_members')
					.upsert(
						{
							campaign_id: campaign.id,
							user_id: userId,
							role: 'player',
						},
						{ onConflict: 'campaign_id, user_id' },
					);

				if (joinError) throw joinError;

				// 3. 成功後跳轉至該戰役
				setDialog(null);
				setInviteCode('');
				await navigate({
					to: '/campaigns/$campaignId',
					params: { campaignId: campaign.id },
				});
			}
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : '加入戰役失敗，請稍後再試。',
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<main className='relative min-h-screen overflow-hidden bg-[#0c0a09] px-4 py-8 text-stone-200 sm:px-8'>
			<div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(120,83,35,0.18),_rgba(12,10,9,0.96)_70%)]' />
			<div className='relative z-10 mx-auto max-w-6xl'>
				<header className='mb-10 flex flex-col gap-5 border-b border-amber-900/50 pb-5 sm:flex-row sm:items-center sm:justify-between'>
					<div className='flex items-center gap-3'>
						<div className='flex h-12 w-12 items-center justify-center rounded-lg border border-amber-500/60 bg-gradient-to-br from-amber-700 via-amber-900 to-stone-950'>
							<Swords className='h-6 w-6 text-amber-300' />
						</div>
						<div>
							<p className='text-xs font-semibold tracking-[0.2em] text-amber-500'>
								戰役軍械庫
							</p>
							<h1 className='font-serif text-2xl font-bold text-amber-100'>
								冒險者大廳
							</h1>
						</div>
					</div>
					<div className='flex flex-wrap items-center gap-3'>
						<div className='rounded-md border border-stone-700 bg-stone-900/80 px-3 py-2 text-xs'>
							<span className='text-stone-400'>目前身分：</span>
							<span className='font-semibold text-amber-200'>
								{isGuest ? '訪客冒險者' : (user?.email ?? '已登入使用者')}
							</span>
						</div>
						<button
							type='button'
							onClick={handleSignOut}
							className='flex items-center gap-1.5 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-xs text-stone-300 transition hover:border-red-700 hover:text-red-300 cursor-pointer'
						>
							<LogOut className='h-3.5 w-3.5' />
							登出
						</button>
					</div>
				</header>

				{notice && (
					<div className='mb-5 rounded-md border border-amber-800/70 bg-amber-950/40 px-4 py-3 text-sm text-amber-200 flex items-center gap-2'>
						<Sparkles className='w-4 h-4 text-amber-400 shrink-0' />
						<span>{notice}</span>
					</div>
				)}
				{errorMessage && (
					<div
						role='alert'
						className='mb-5 rounded-md border border-red-800/70 bg-red-950/40 px-4 py-3 text-sm text-red-300'
					>
						{errorMessage}
					</div>
				)}

				<div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
					<div>
						<p className='mb-1 text-xs font-semibold tracking-[0.15em] text-amber-600'>
							你的冒險即將展開
						</p>
						<h2 className='font-serif text-xl font-bold text-stone-100'>
							我的戰役列表
						</h2>
					</div>
					<div className='flex flex-wrap gap-2'>
						<button
							type='button'
							onClick={() => {
								setDialog('create');
								setNotice(null);
								setErrorMessage(null);
							}}
							className='flex items-center gap-2 rounded-md border border-purple-500/60 bg-purple-950/70 px-3 py-2 text-xs font-semibold text-purple-200 transition hover:border-purple-300 hover:bg-purple-950 cursor-pointer shadow'
						>
							<Plus className='h-4 w-4' />
							建立新戰役 (DM)
						</button>
						<button
							type='button'
							onClick={() => {
								setDialog('join');
								setNotice(null);
								setErrorMessage(null);
							}}
							className='flex items-center gap-2 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-300 transition hover:border-amber-700 hover:text-amber-200 cursor-pointer'
						>
							<Users className='h-4 w-4' />
							輸入邀請碼加入戰役
						</button>
					</div>
				</div>

				<section
					aria-label='我的戰役列表'
					className='grid gap-4 md:grid-cols-2'
				>
					{/* 預設示範戰役 */}
					<Link
						to='/campaigns/$campaignId'
						params={{ campaignId: 'default' }}
						className='group relative overflow-hidden rounded-xl border border-amber-700/60 bg-gradient-to-br from-stone-900 via-stone-950 to-[#160f0b] p-5 shadow-[0_10px_35px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 hover:border-amber-400/80 hover:shadow-[0_0_28px_rgba(217,119,6,0.16)]'
					>
						<div className='absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-10 rounded-full bg-amber-600/10 blur-2xl transition group-hover:bg-amber-500/20' />
						<div className='relative flex items-start justify-between gap-4'>
							<div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-amber-700/60 bg-amber-950/60'>
								<ScrollText className='h-6 w-6 text-amber-300' />
							</div>
							<span className='rounded-full border border-emerald-700/60 bg-emerald-950/60 px-2.5 py-1 text-[10px] font-semibold text-emerald-300'>
								預設示範
							</span>
						</div>
						<div className='relative mt-5'>
							<h3 className='font-serif text-lg font-bold text-amber-100'>
								博德之門：腦噬者危機 (預設戰役)
							</h3>
							<p className='mt-2 text-xs leading-relaxed text-stone-400'>
								管理冒險者裝備、共享公庫與戰利品，準備迎接下一場冒險。
							</p>
						</div>
						<div className='relative mt-5 flex items-center justify-between border-t border-stone-800 pt-3 text-[11px] text-stone-500'>
							<span>點擊進入戰役背包</span>
							<span className='text-amber-400 transition group-hover:translate-x-1'>
								→
							</span>
						</div>
					</Link>

					{/* 動態渲染使用者在資料庫建立的戰役 */}
					{campaigns
						.filter((c) => c.id !== 'default')
						.map((camp) => (
							<Link
								key={camp.id}
								to='/campaigns/$campaignId'
								params={{ campaignId: camp.id }}
								className='group relative overflow-hidden rounded-xl border border-purple-700/60 bg-gradient-to-br from-stone-900 via-stone-950 to-[#1a0f1c] p-5 shadow-[0_10px_35px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 hover:border-purple-400/80 hover:shadow-[0_0_28px_rgba(168,85,247,0.2)]'
							>
								<div className='absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-10 rounded-full bg-purple-600/10 blur-2xl transition group-hover:bg-purple-500/20' />
								<div className='relative flex items-start justify-between gap-4'>
									<div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-purple-700/60 bg-purple-950/60'>
										<Swords className='h-6 w-6 text-purple-300' />
									</div>
									<span className='rounded-full border border-purple-700/60 bg-purple-950/60 px-2.5 py-1 text-[10px] font-semibold text-purple-300'>
										自建戰役
									</span>
								</div>
								<div className='relative mt-5'>
									<h3 className='font-serif text-lg font-bold text-purple-100 truncate'>
										{camp.name}
									</h3>
									<p className='mt-2 text-xs leading-relaxed text-stone-400'>
										ID: {camp.id} • DM 專屬管理世界
									</p>
									<p className='mt-1 text-xs text-stone-400'>
										邀請碼:{' '}
										<strong className='text-amber-300 font-mono'>
											{camp.invite_code || '無'}
										</strong>
									</p>
								</div>
								<div className='relative mt-5 flex items-center justify-between border-t border-stone-800 pt-3 text-[11px] text-stone-500'>
									<span>點擊進入自建戰役背包</span>
									<span className='text-purple-400 transition group-hover:translate-x-1'>
										→
									</span>
								</div>
							</Link>
						))}
				</section>
			</div>

			{dialog && (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm'>
					<section
						role='dialog'
						aria-modal='true'
						aria-labelledby='lobby-dialog-title'
						className='w-full max-w-md rounded-lg border-2 border-amber-700/70 bg-stone-950 p-5 shadow-[0_0_40px_rgba(0,0,0,0.7)]'
					>
						<div className='mb-4 flex items-center justify-between border-b border-stone-800 pb-3'>
							<h2
								id='lobby-dialog-title'
								className='font-serif font-bold text-amber-200'
							>
								{dialog === 'create' ? '建立新戰役 (DM)' : '加入戰役'}
							</h2>
							<button
								type='button'
								onClick={() => setDialog(null)}
								aria-label='關閉視窗'
								className='text-stone-500 transition hover:text-stone-200 cursor-pointer'
							>
								<X className='h-5 w-5' />
							</button>
						</div>

						{dialog === 'create' ? (
							<form onSubmit={handleCreateCampaign} className='space-y-4'>
								<label className='block text-xs text-stone-300'>
									戰役名稱
									<input
										required
										value={campaignName}
										onChange={(event) => setCampaignName(event.target.value)}
										placeholder='例如：博德之門：血戰風雲'
										className='mt-1.5 w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-500'
									/>
								</label>
								<p className='text-[11px] leading-relaxed text-stone-500'>
									建立後將自動在資料庫初始化獨立的戰役空間與預設冒險者隊員。
								</p>
								<div className='flex justify-end gap-2 pt-2'>
									<button
										type='button'
										onClick={() => setDialog(null)}
										className='rounded-md border border-stone-700 px-3 py-2 text-xs text-stone-300 hover:bg-stone-900 cursor-pointer'
									>
										取消
									</button>
									<button
										type='submit'
										disabled={isSubmitting}
										className='rounded-md border border-amber-600/70 bg-amber-800 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-700 disabled:opacity-50 cursor-pointer'
									>
										{isSubmitting ? '鑄造中...' : '確認建立戰役'}
									</button>
								</div>
							</form>
						) : (
							<form onSubmit={handleJoinCampaign} className='space-y-4'>
								<label className='block text-xs text-stone-300'>
									邀請碼
									<input
										required
										value={inviteCode}
										onChange={(event) => setInviteCode(event.target.value)}
										placeholder='輸入 DM 提供的邀請碼'
										className='mt-1.5 w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-500'
									/>
								</label>
								<p className='text-[11px] leading-relaxed text-stone-500'>
									此功能目前為介面預留，邀請碼驗證系統即將推出。
								</p>
								<div className='flex justify-end gap-2 pt-2'>
									<button
										type='button'
										onClick={() => setDialog(null)}
										className='rounded-md border border-stone-700 px-3 py-2 text-xs text-stone-300 hover:bg-stone-900 cursor-pointer'
									>
										取消
									</button>
									<button
										type='submit'
										className='rounded-md border border-amber-600/70 bg-amber-800 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-700 cursor-pointer'
									>
										確認加入
									</button>
								</div>
							</form>
						)}
					</section>
				</div>
			)}
		</main>
	);
}
