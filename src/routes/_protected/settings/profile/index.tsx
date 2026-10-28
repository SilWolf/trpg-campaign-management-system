/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useState, useEffect, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { User, Mail, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/contexts/FeedbackContext';

export const Route = createFileRoute('/_protected/settings/profile/')({
	component: UserProfilePage,
});

function UserProfilePage() {
	const { user } = useAuth();
	const toast = useToast();
	const [fullName, setFullName] = useState('');
	const [email, setEmail] = useState('');
	const [loading, setLoading] = useState(false);

	// 當用戶資料載入時，初始化表單狀態
	useEffect(() => {
		if (user) {
			setFullName(
				user.user_metadata?.full_name || user.user_metadata?.name || '',
			);
			setEmail(user.email || '');
		}
	}, [user]);

	const handleUpdateProfile = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setLoading(true);

		try {
			if (!supabase || !user) throw new Error('尚未登入。');

			// 1. 更新 Supabase Auth Metadata
			const { error: updateError } = await supabase.auth.updateUser({
				email: email.trim() !== user.email ? email.trim() : undefined,
				data: { full_name: fullName.trim() },
			});
			if (updateError) throw updateError;

			// 2. 同步更新 public.profiles 表
			const { error: profileError } = await supabase.from('profiles').upsert({
				id: user.id,
				full_name: fullName.trim(),
				email: email.trim(),
				updated_at: new Date().toISOString(),
			});
			if (profileError) throw profileError;

			toast.success('個人資料已成功更新！');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : '更新失敗。');
		} finally {
			setLoading(false);
		}
	};

	return (
		<main className='max-w-2xl mx-auto px-4 py-8 text-foreground'>
			<div className='mb-6 border-b border-primary/50 pb-4'>
				<h1
					data-testid='profile-heading'
					className='font-serif text-xl font-bold text-primary-foreground flex items-center gap-2'
				>
					<User className='w-5 h-5 text-primary-foreground' />
					<span>個人資料設定</span>
				</h1>
				<p className='text-xs text-muted-foreground mt-1'>
					在此管理您的帳號顯示名稱與電子郵件信箱。
				</p>
			</div>

			<form
				onSubmit={handleUpdateProfile}
				className='rounded-xl border border-border bg-background p-6 shadow-xl space-y-5'
			>
				<div>
					<label
						htmlFor='profile-full-name'
						className='block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5'
					>
						<User className='w-3.5 h-3.5 text-primary-foreground' />
						<span id='profile-full-name-label'>顯示名字 (Full Name)</span>
					</label>
					<Input
						id='profile-full-name'
						data-testid='profile-full-name'
						aria-labelledby='profile-full-name-label'
						type='text'
						required
						value={fullName}
						onChange={(e) => setFullName(e.target.value)}
						placeholder='例如：塔夫 (Tav)'
						className='border-border bg-card px-3.5 py-2.5'
					/>
				</div>

				<div>
					<label
						htmlFor='profile-email'
						className='block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5'
					>
						<Mail className='w-3.5 h-3.5 text-primary-foreground' />
						<span id='profile-email-label'>電子郵件 (Email)</span>
					</label>
					<Input
						id='profile-email'
						data-testid='profile-email'
						aria-labelledby='profile-email-label'
						type='email'
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder='adventurer@example.com'
						className='border-border bg-card px-3.5 py-2.5'
					/>
					<p className='text-[11px] text-muted-foreground mt-1.5'>
						⚠️ 注意：變更 Email 後系統會要求重新驗證新信箱。
					</p>
				</div>

				<div className='flex justify-end pt-4 border-t border-border'>
					<Button
						data-testid='profile-submit'
						type='submit'
						loading={loading}
						className='px-5 py-2.5 text-xs text-foreground shadow hover:brightness-110'
					>
						{!loading && <Save className='w-4 h-4' />}
						<span>{loading ? '儲存中...' : '儲存變更'}</span>
					</Button>
				</div>
			</form>
		</main>
	);
}
