/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route。 */
import { useState, useEffect, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { User, Mail, Save, Sparkles, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export const Route = createFileRoute('/_protected/settings/profile/')({
	component: UserProfilePage,
});

function UserProfilePage() {
	const { user } = useAuth();
	const [fullName, setFullName] = useState('');
	const [email, setEmail] = useState('');
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
		setMessage(null);
		setErrorMessage(null);

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

			setMessage('✨ 個人資料已成功更新！');
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : '更新失敗。');
		} finally {
			setLoading(false);
		}
	};

	return (
		<main className='max-w-2xl mx-auto px-4 py-8 text-stone-200'>
			<div className='mb-6 border-b border-amber-900/50 pb-4'>
				<h1
					data-testid='profile-heading'
					className='font-serif text-xl font-bold text-amber-100 flex items-center gap-2'
				>
					<User className='w-5 h-5 text-amber-400' />
					<span>個人資料設定</span>
				</h1>
				<p className='text-xs text-stone-400 mt-1'>
					在此管理您的帳號顯示名稱與電子郵件信箱。
				</p>
			</div>

			{message && (
				<div
					data-testid='profile-success'
					className='mb-5 rounded-md border border-emerald-800/70 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2'
				>
					<Sparkles className='w-4 h-4 text-emerald-400 shrink-0' />
					<span>{message}</span>
				</div>
			)}

			{errorMessage && (
				<div
					data-testid='profile-error'
					role='alert'
					className='mb-5 rounded-md border border-red-800/70 bg-red-950/40 px-4 py-3 text-sm text-red-300 flex items-center gap-2'
				>
					<AlertCircle className='w-4 h-4 text-red-400 shrink-0' />
					<span>{errorMessage}</span>
				</div>
			)}

			<form
				onSubmit={handleUpdateProfile}
				className='rounded-xl border border-stone-800 bg-stone-950 p-6 shadow-xl space-y-5'
			>
				<div>
					<label className='block text-xs font-semibold text-stone-300 mb-1.5 flex items-center gap-1.5'>
						<User className='w-3.5 h-3.5 text-amber-400' />
						<span>顯示名字 (Full Name)</span>
					</label>
					<input
						data-testid='profile-full-name'
						type='text'
						required
						value={fullName}
						onChange={(e) => setFullName(e.target.value)}
						placeholder='例如：塔夫 (Tav)'
						className='w-full rounded-md border border-stone-700 bg-stone-900 px-3.5 py-2.5 text-sm text-stone-100 outline-none transition focus:border-amber-500'
					/>
				</div>

				<div>
					<label className='block text-xs font-semibold text-stone-300 mb-1.5 flex items-center gap-1.5'>
						<Mail className='w-3.5 h-3.5 text-amber-400' />
						<span>電子郵件 (Email)</span>
					</label>
					<input
						data-testid='profile-email'
						type='email'
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder='adventurer@example.com'
						className='w-full rounded-md border border-stone-700 bg-stone-900 px-3.5 py-2.5 text-sm text-stone-100 outline-none transition focus:border-amber-500'
					/>
					<p className='text-[11px] text-stone-500 mt-1.5'>
						⚠️ 注意：變更 Email 後系統會要求重新驗證新信箱。
					</p>
				</div>

				<div className='flex justify-end pt-4 border-t border-stone-800'>
					<button
						data-testid='profile-submit'
						type='submit'
						disabled={loading}
						className='flex items-center gap-2 rounded-md border border-amber-500/70 bg-gradient-to-r from-amber-700 to-amber-900 px-5 py-2.5 text-xs font-semibold text-stone-100 shadow hover:brightness-110 transition disabled:opacity-50 cursor-pointer'
					>
						<Save className='w-4 h-4' />
						<span>{loading ? '儲存中...' : '儲存變更'}</span>
					</button>
				</div>
			</form>
		</main>
	);
}
