/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useEffect, useState, type FormEvent } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Swords } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/components/ui';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

export const Route = createFileRoute('/invite/$campaignId/')({
	component: InviteRegistrationPage,
});

function InviteRegistrationPage() {
	const { campaignId } = Route.useParams();
	const navigate = useNavigate();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [isLoading, setIsLoading] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		let isMounted = true;

		async function loadInvitationSession() {
			if (!supabase) {
				if (isMounted) {
					setErrorMessage('目前尚未設定 Supabase 登入服務，無法接受邀請。');
					setIsLoading(false);
				}
				return;
			}

			const { data, error } = await supabase.auth.getSession();
			if (!isMounted) return;
			if (error) {
				setErrorMessage(`驗證邀請連結失敗：${error.message}`);
			} else if (!data.session?.user) {
				setErrorMessage('邀請連結無效或已過期，請聯絡 DM 重新發送邀請。');
			} else if (!data.session.user.email) {
				setErrorMessage('邀請帳號缺少電子郵件，請聯絡 DM 重新發送邀請。');
			} else {
				setEmail(data.session.user.email);
			}
			setIsLoading(false);
		}

		void loadInvitationSession();
		return () => {
			isMounted = false;
		};
	}, []);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!supabase) return;
		if (password !== confirmPassword) {
			setErrorMessage('兩次輸入的密碼不一致。');
			return;
		}

		setIsSubmitting(true);
		setErrorMessage(null);
		try {
			const { error: passwordError } = await supabase.auth.updateUser({
				password,
			});
			if (passwordError) throw passwordError;

			const { error: acceptanceError } = await supabase.rpc(
				'accept_campaign_invite',
				{ p_campaign_id: campaignId },
			);
			if (acceptanceError) throw acceptanceError;

			await navigate({
				to: '/campaigns/$campaignId',
				params: { campaignId },
			});
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : '完成帳號註冊失敗，請稍後再試。',
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<main className='relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground'>
			<div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--primary)_18%,transparent),var(--background)_70%)]' />
			<div className='relative z-10 w-full max-w-md rounded-xl border border-primary/60 bg-background/95 p-6 shadow-lg sm:p-8'>
				<div className='mb-7 text-center'>
					<div className='mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-primary/60 bg-gradient-to-br from-primary via-primary to-background'>
						<Swords className='h-7 w-7 text-primary-foreground' />
					</div>
					<h1
						data-testid='invite-heading'
						className='font-serif text-2xl font-bold tracking-wide text-foreground'
					>
						完成冒險者帳號註冊
					</h1>
					<p className='mt-2 text-sm text-muted-foreground'>
						設定登入密碼後，即可接受戰役邀請。
					</p>
				</div>

				{isLoading ? (
					<p data-testid='invite-loading' className='text-center text-sm text-muted-foreground'>
						正在驗證邀請連結…
					</p>
				) : errorMessage && !email ? (
					<p
						data-testid='invite-error'
						role='alert'
						className='rounded border border-destructive/70 bg-destructive/40 px-3 py-2 text-sm text-destructive-foreground'
					>
						{errorMessage}
					</p>
				) : (
					<form onSubmit={handleSubmit} className='space-y-4'>
						<Input
							id='invite-email'
							label='電子郵件'
							data-testid='invite-email'
							type='email'
							autoComplete='email'
							readOnly
							value={email}
							className='border-border bg-card py-2.5 text-muted-foreground'
						/>
						<Input
							id='invite-password'
							label='設定密碼'
							data-testid='invite-password'
							type='password'
							autoComplete='new-password'
							minLength={6}
							required
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							placeholder='至少 6 個字元'
						/>
						<Input
							id='invite-confirm-password'
							label='再次輸入密碼'
							data-testid='invite-confirm-password'
							type='password'
							autoComplete='new-password'
							minLength={6}
							required
							value={confirmPassword}
							onChange={(event) => setConfirmPassword(event.target.value)}
							placeholder='再次輸入密碼'
						/>

						{errorMessage && (
							<p
								data-testid='invite-error'
								role='alert'
								className='rounded border border-destructive/70 bg-destructive/40 px-3 py-2 text-sm text-destructive-foreground'
							>
								{errorMessage}
							</p>
						)}

						<Button
							data-testid='invite-submit'
							type='submit'
							loading={isSubmitting}
						>
							{isSubmitting ? '處理中…' : '設定密碼並加入戰役'}
						</Button>
					</form>
				)}
			</div>
			<div className='absolute right-4 top-4 z-20'>
				<ThemeSwitcher />
			</div>
		</main>
	);
}
