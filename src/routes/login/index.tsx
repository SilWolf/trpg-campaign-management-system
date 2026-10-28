/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useState, type FormEvent } from 'react';
import { useNavigate, createFileRoute } from '@tanstack/react-router';
import { Dice6, Eye, EyeOff, Swords } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button, Input } from '@/components/ui';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

export const Route = createFileRoute('/login/')({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const { loginAsGuest } = useAuth();
	const [isSignUp, setIsSignUp] = useState(false);
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!supabase) {
			setErrorMessage('目前尚未設定 Supabase 登入服務，請使用訪客模式。');
			return;
		}

		setIsSubmitting(true);
		setMessage(null);
		setErrorMessage(null);

		try {
			if (isSignUp) {
				const { data, error } = await supabase.auth.signUp({ email, password });
				if (error) throw error;
				if (!data.session) {
					setMessage('註冊成功！請先至電子郵件收取驗證信，再返回登入。');
					setIsSignUp(false);
					return;
				}
			} else {
				const { error } = await supabase.auth.signInWithPassword({
					email,
					password,
				});
				if (error) throw error;
			}
			await navigate({ to: '/' });
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : '登入或註冊失敗，請稍後再試。',
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleGuestLogin = async () => {
		loginAsGuest();
		await navigate({ to: '/' });
	};

	return (
		<main className='relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground'>
			<div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--primary)_18%,transparent),var(--background)_70%)]' />
			<div className='relative z-10 w-full max-w-md rounded-xl border border-primary/60 bg-background/95 p-6 shadow-lg sm:p-8'>
				<div className='mb-7 text-center'>
					<div className='mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-primary/60 bg-gradient-to-br from-primary via-primary to-background shadow-lg'>
						<Swords className='h-7 w-7 text-primary-foreground' />
					</div>
					<p className='mb-1 text-xs font-semibold tracking-[0.25em] text-muted-foreground'>
						D&amp;D 5R・2024
					</p>
					<h1
						data-testid='login-heading'
						className='font-serif text-2xl font-bold tracking-wide text-foreground'
					>
						博德之門戰役軍械庫
					</h1>
					<p className='mt-2 text-sm text-muted-foreground'>
						登入以繼續管理你的戰役與冒險者行囊
					</p>
				</div>

				<form onSubmit={handleSubmit} className='space-y-4'>
					<Input
						id='email'
						label='電子郵件'
						data-testid='login-email'
						type='email'
						autoComplete='email'
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						placeholder='adventurer@example.com'
						className='border-border bg-card py-2.5 placeholder:text-muted-foreground'
					/>

					<div>
						<div className='relative'>
							<Input
								id='password'
								label='密碼'
								data-testid='login-password'
								type={showPassword ? 'text' : 'password'}
								autoComplete={isSignUp ? 'new-password' : 'current-password'}
								minLength={6}
								required
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								placeholder='至少 6 個字元'
								className='border-border bg-card py-2.5 pr-11 placeholder:text-muted-foreground'
							/>
							<Button
								data-testid='login-password-visibility'
								type='button'
								variant='ghost'
								size='sm'
								onClick={() => setShowPassword((visible) => !visible)}
								aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
								className='absolute inset-y-0 right-0 h-full min-h-0 rounded-none px-3 text-muted-foreground hover:text-primary-foreground'
								prefixIcon={
									showPassword ? (
										<EyeOff className='h-4 w-4' />
									) : (
										<Eye className='h-4 w-4' />
									)
								}
							>
							</Button>
						</div>
					</div>

					{message && (
						<p
							data-testid='login-success'
							className='rounded border border-success/70 bg-success/30 px-3 py-2 text-sm text-success-foreground'
						>
							{message}
						</p>
					)}
					{errorMessage && (
						<p
							data-testid='login-error'
							role='alert'
							className='rounded border border-destructive/70 bg-destructive/40 px-3 py-2 text-sm text-destructive-foreground'
						>
							{errorMessage}
						</p>
					)}

					<Button
						data-testid='login-submit'
						type='submit'
						loading={isSubmitting}
						className='w-full py-2.5 text-primary-foreground shadow-lg'
					>
						{isSubmitting
							? '處理中...'
							: isSignUp
								? '建立冒險者帳號'
								: '登入戰役軍械庫'}
					</Button>
				</form>

				<Button
					data-testid='login-toggle-mode'
					type='button'
					variant='ghost'
					size='sm'
					onClick={() => {
						setIsSignUp((value) => !value);
						setMessage(null);
						setErrorMessage(null);
					}}
					className='mt-4 w-full text-center text-xs font-normal text-muted-foreground hover:text-primary-foreground'
				>
					{isSignUp ? '已有帳號？返回登入' : '尚未有帳號？立即註冊'}
				</Button>

				<div className='my-5 flex items-center gap-3'>
					<div className='h-px flex-1 bg-muted' />
					<span className='text-[10px] uppercase tracking-wider text-muted-foreground'>
						或
					</span>
					<div className='h-px flex-1 bg-muted' />
				</div>

				<Button
					type='button'
					variant='secondary'
					onClick={handleGuestLogin}
					className='w-full border-border/70 bg-gradient-to-r from-background via-card to-background py-3 text-sm font-bold text-foreground shadow-lg hover:border-border hover:brightness-125'
					prefixIcon={<Dice6 className='h-5 w-5 text-foreground' />}
				>
					<span>🎲 免登入・以訪客身分體驗測試戰役</span>
				</Button>
				<p className='mt-3 text-center text-[11px] leading-relaxed text-muted-foreground'>
					訪客模式使用此裝置的本機體驗資料，不需要建立帳號。
				</p>
			</div>
			<div className='absolute right-4 top-4 z-20'>
				<ThemeSwitcher />
			</div>
		</main>
	);
}
