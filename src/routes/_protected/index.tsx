/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useState, type FormEvent } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { LogOut, Plus, ScrollText, Swords, Users, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export const Route = createFileRoute('/_protected/')({
	component: CampaignLobbyPage,
});

type LobbyDialog = 'create' | 'join' | null;

function CampaignLobbyPage() {
	const navigate = useNavigate();
	const { user, isGuest, signOut } = useAuth();
	const [dialog, setDialog] = useState<LobbyDialog>(null);
	const [campaignName, setCampaignName] = useState('');
	const [inviteCode, setInviteCode] = useState('');
	const [notice, setNotice] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

	const handleDialogSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setNotice(
			dialog === 'create'
				? `「${campaignName.trim()}」建立功能即將推出。`
				: '邀請碼加入功能即將推出。',
		);
		setDialog(null);
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
							className='flex items-center gap-1.5 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-xs text-stone-300 transition hover:border-red-700 hover:text-red-300'
						>
							<LogOut className='h-3.5 w-3.5' />
							登出
						</button>
					</div>
				</header>

				{notice && (
					<div className='mb-5 rounded-md border border-amber-800/70 bg-amber-950/40 px-4 py-3 text-sm text-amber-200'>
						{notice}
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
							}}
							className='flex items-center gap-2 rounded-md border border-purple-500/60 bg-purple-950/70 px-3 py-2 text-xs font-semibold text-purple-200 transition hover:border-purple-300 hover:bg-purple-900'
						>
							<Plus className='h-4 w-4' />
							建立新戰役 (DM)
						</button>
						<button
							type='button'
							onClick={() => {
								setDialog('join');
								setNotice(null);
							}}
							className='flex items-center gap-2 rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-300 transition hover:border-amber-700 hover:text-amber-200'
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
								示範戰役
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
								className='text-stone-500 transition hover:text-stone-200'
							>
								<X className='h-5 w-5' />
							</button>
						</div>
						<form onSubmit={handleDialogSubmit} className='space-y-4'>
							<label className='block text-xs text-stone-300'>
								{dialog === 'create' ? '戰役名稱' : '邀請碼'}
								<input
									required
									value={dialog === 'create' ? campaignName : inviteCode}
									onChange={(event) =>
										dialog === 'create'
											? setCampaignName(event.target.value)
											: setInviteCode(event.target.value)
									}
									placeholder={
										dialog === 'create' ? '輸入戰役名稱' : '輸入邀請碼'
									}
									className='mt-1.5 w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-500'
								/>
							</label>
							<p className='text-[11px] leading-relaxed text-stone-500'>
								此功能目前為介面預留，戰役建立與邀請碼驗證尚未啟用。
							</p>
							<div className='flex justify-end gap-2'>
								<button
									type='button'
									onClick={() => setDialog(null)}
									className='rounded-md border border-stone-700 px-3 py-2 text-xs text-stone-300 hover:bg-stone-900'
								>
									取消
								</button>
								<button
									type='submit'
									className='rounded-md border border-amber-600/70 bg-amber-800 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-700'
								>
									{dialog === 'create' ? '建立戰役' : '確認加入'}
								</button>
							</div>
						</form>
					</section>
				</div>
			)}
		</main>
	);
}
