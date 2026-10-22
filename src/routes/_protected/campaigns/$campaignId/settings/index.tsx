/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route. */
import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Settings, Copy, Check, ShieldAlert, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';

interface DisplayMember {
	id: string;
	identifier: string; // 顯示名稱或 Email
	type: 'dm' | 'player' | 'pending';
	roleText: string;
}

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/settings/',
)({
	component: CampaignSettingsPage,
});

function CampaignSettingsPage() {
	const navigate = useNavigate();
	const { campaignId } = Route.useParams();
	const { isDm } = useUserCampaignRole(campaignId);

	const [campaignName, setCampaignName] = useState('');
	const [inviteCode, setInviteCode] = useState('');
	const [copied, setCopied] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [inviteEmail, setInviteEmail] = useState('');
	const [allMembers, setAllMembers] = useState<DisplayMember[]>([]);

	useEffect(() => {
		async function checkPermissionAndFetch() {
			if (!supabase || campaignId === 'default') {
				// 預設示範戰役預設視為 DM 方便測試
				setCampaignName('博德之門：腦噬者危機 (預設戰役)');
				setInviteCode('DEFAULT');

				setAllMembers([
					{
						id: 'dm-1',
						identifier: '預設 DM (admin@example.com)',
						type: 'dm',
						roleText: '地下城主 (DM)',
					},
					{
						id: 'player-1',
						identifier: '塔夫 Tav',
						type: 'player',
						roleText: '玩家',
					},
					{
						id: 'pending-1',
						identifier: 'pending_player@example.com',
						type: 'pending',
						roleText: '等待接受邀請',
					},
				]);
				return;
			}

			// A. 取得戰役基本資訊 (dm_id)
			const { data: campData, error } = await supabase
				.from('campaigns')
				.select('*')
				.eq('id', campaignId)
				.single();

			if (!error && campData) {
				setCampaignName(campData.name);
				setInviteCode(campData.invite_code || '無');

				// B. 取得已加入的成員，並透過 Join 取得 profiles 的 full_name 與 email
				const { data: memberData } = await supabase
					.from('campaign_members')
					.select(
						`
							user_id,
							role,
							profiles (
								full_name,
								email
							)
						`,
					)
					.eq('campaign_id', campaignId);

				// C. 取得未接受邀請的 Email
				const { data: inviteData } = await supabase
					.from('campaign_invites')
					.select('id, email')
					.eq('campaign_id', campaignId);

				const membersList: DisplayMember[] = [];

				// 處理已加入的成員與 DM
				if (memberData) {
					memberData.forEach((m) => {
						const isDm = campData && campData.dm_id === m.user_id;
						// 優先順序：full_name -> email -> user_id
						const profile = Array.isArray(m.profiles)
							? m.profiles[0]
							: m.profiles;
						const displayName =
							profile?.full_name || profile?.email || m.user_id;

						membersList.push({
							id: m.user_id,
							identifier: displayName,
							type: isDm ? 'dm' : 'player',
							roleText: isDm ? '地下城主 (DM)' : '玩家',
						});
					});
				}

				// 處理未接受邀請的玩家
				if (inviteData) {
					inviteData.forEach((inv) => {
						membersList.push({
							id: inv.id,
							identifier: inv.email,
							type: 'pending',
							roleText: '等待接受邀請',
						});
					});
				}

				// ⭐️ 嚴格排序：DM (置頂) -> 玩家 -> 未接受邀請的玩家
				const orderWeight = { dm: 1, player: 2, pending: 3 };
				membersList.sort((a, b) => orderWeight[a.type] - orderWeight[b.type]);

				setAllMembers(membersList);
			}
		}
		checkPermissionAndFetch();
	}, [campaignId]);

	const handleCopyInvite = () => {
		navigator.clipboard.writeText(inviteCode);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleSaveSettings = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!supabase || campaignId === 'default') {
			setNotice('預設戰役無法修改設定。');
			return;
		}

		const { error } = await supabase
			.from('campaigns')
			.update({ name: campaignName })
			.eq('id', campaignId);

		if (error) {
			setNotice('儲存失敗：' + error.message);
		} else {
			setNotice('✨ 戰役設定已成功更新！');
			setTimeout(() => setNotice(null), 3000);
		}
	};

	const handleDeleteCampaign = async () => {
		if (campaignId === 'default') {
			alert('預設示範戰役無法刪除！');
			return;
		}

		const confirmed = window.confirm(
			'⚠️ 警告：確定要永久刪除此戰役嗎？\n此動作將會一併刪除該戰役底下的所有冒險者角色、背包物品與公庫資料，且無法復原！',
		);

		if (!confirmed) return;

		try {
			if (supabase) {
				const { error } = await supabase
					.from('campaigns')
					.delete()
					.eq('id', campaignId);

				if (error) throw error;
			}

			// 刪除成功後，自動導回冒險者大廳
			await navigate({ to: '/' });
		} catch (error) {
			setNotice(
				'刪除戰役失敗：' +
					(error instanceof Error ? error.message : '未知錯誤'),
			);
		}
	};

	const handleSendEmailInvite = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!inviteEmail.trim() || campaignId === 'default') {
			setNotice('預設戰役無法發送邀請。');
			return;
		}
		if (!supabase) {
			return;
		}

		try {
			// 呼叫 Supabase Edge Function
			const { error } = await supabase.functions.invoke('invite-player', {
				body: {
					email: inviteEmail.trim(),
					campaignId: campaignId,
				},
			});

			if (error) throw error;

			setNotice(
				`✨ 已成功透過 Supabase Auth 向 ${inviteEmail} 發送官方邀請信！`,
			);
			setAllMembers((prev) => [
				...prev,
				{
					id: inviteEmail.trim(),
					identifier: inviteEmail.trim(),
					type: 'pending',
					roleText: '等待接受邀請',
				},
			]);
			setInviteEmail('');
			setTimeout(() => setNotice(null), 3000);
		} catch (err) {
			setNotice(
				'發送邀請失敗：' + (err instanceof Error ? err.message : '未知錯誤'),
			);
		}
	};

	return (
		<main className='max-w-4xl mx-auto px-4 py-8 space-y-6'>
			<div className='flex items-center gap-3 border-b border-amber-900/50 pb-4'>
				<div className='p-2.5 rounded-lg bg-amber-950 border border-amber-600/50 text-amber-300'>
					<Settings className='w-6 h-6' />
				</div>
				<div>
					<h1 className='text-xl font-serif font-bold text-amber-100'>
						戰役屬性與設定
					</h1>
					<p className='text-xs text-stone-400'>
						管理此戰役世界的基本資訊與成員邀請碼
					</p>
				</div>
			</div>

			{notice && (
				<div className='p-3 rounded bg-amber-950/60 border border-amber-600/60 text-amber-200 text-xs'>
					{notice}
				</div>
			)}

			<form
				onSubmit={handleSaveSettings}
				className='bg-stone-950 border border-stone-800 rounded-lg p-6 space-y-5 shadow-xl'
			>
				<div>
					<label className='block text-xs font-semibold text-stone-300 mb-1.5'>
						戰役名稱
					</label>
					<input
						type='text'
						value={campaignName}
						onChange={(e) => setCampaignName(e.target.value)}
						className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-500'
					/>
				</div>

				<div>
					<label className='block text-xs font-semibold text-stone-300 mb-1.5'>
						戰役邀請碼 (Invite Code)
					</label>
					<div className='flex items-center gap-2'>
						<input
							type='text'
							readOnly
							value={inviteCode}
							className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-2 text-sm font-mono text-amber-300 outline-none'
						/>
						<button
							type='button'
							onClick={handleCopyInvite}
							className='px-3 py-2 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 text-xs flex items-center gap-1.5 shrink-0 cursor-pointer'
						>
							{copied ? (
								<Check className='w-4 h-4 text-emerald-400' />
							) : (
								<Copy className='w-4 h-4' />
							)}
							<span>{copied ? '已複製' : '複製邀請碼'}</span>
						</button>
					</div>
					<p className='text-[11px] text-stone-500 mt-1'>
						其他冒險者可在大廳輸入此邀請碼加入本戰役。
					</p>
				</div>

				<div className='flex justify-end pt-3 border-t border-stone-800'>
					<button
						type='submit'
						className='px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 text-stone-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow'
					>
						<Save className='w-4 h-4' />
						<span>儲存變更</span>
					</button>
				</div>
			</form>

			{/* 戰役成員總覽清單 */}
			<div className='bg-stone-950 border border-stone-800 rounded-lg p-6 space-y-4 shadow-xl mt-6'>
				<div className='flex items-center justify-between border-b border-stone-800 pb-3'>
					<h2 className='text-sm font-serif font-bold text-amber-200'>
						戰役成員總覽
					</h2>
					<span className='text-[11px] text-stone-400'>
						共 {allMembers.length} 位成員/名單
					</span>
				</div>

				{allMembers.length === 0 ? (
					<p className='text-xs text-stone-500 italic py-2'>
						目前尚無任何成員資料。
					</p>
				) : (
					<div className='space-y-2'>
						{allMembers.map((member) => {
							// 根據不同身分給予不同的標籤外觀
							const badgeStyle =
								member.type === 'dm'
									? 'bg-amber-950/80 text-amber-300 border-amber-600/60'
									: member.type === 'player'
										? 'bg-purple-950/80 text-purple-300 border-purple-600/60'
										: 'bg-stone-900 text-stone-400 border-stone-700 border-dashed';

							return (
								<div
									key={member.id}
									className='flex items-center justify-between bg-stone-900/60 border border-stone-800 rounded-md px-4 py-2.5 text-xs'
								>
									<span className='font-mono text-stone-200 truncate max-w-[260px] sm:max-w-md'>
										{member.identifier}
									</span>
									<span
										className={`px-2.5 py-0.5 rounded border text-[11px] font-medium shrink-0 ${badgeStyle}`}
									>
										{member.roleText}
									</span>
								</div>
							);
						})}
					</div>
				)}

				{isDm && (
					<>
						<div className='mt-8  flex items-center gap-2 text-amber-200 font-serif font-bold text-sm'>
							<span>📧 Email 邀請冒險者</span>
						</div>
						<p className='text-xs text-stone-400'>
							輸入玩家的電子郵件，將其納入本戰役的受邀名單中。
						</p>

						<form
							onSubmit={handleSendEmailInvite}
							className='flex items-center gap-2'
						>
							<input
								type='email'
								required
								value={inviteEmail}
								onChange={(e) => setInviteEmail(e.target.value)}
								placeholder='player@example.com'
								className='flex-1 bg-stone-900 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-500'
							/>
							<button
								type='submit'
								className='px-4 py-2 rounded bg-purple-900 hover:bg-purple-800 border border-purple-600 text-purple-100 font-semibold text-xs shrink-0 cursor-pointer shadow'
							>
								發送邀請
							</button>
						</form>
					</>
				)}
			</div>

			{isDm && (
				<>
					<div className='bg-red-950/30 border border-red-900/60 rounded-lg p-5 space-y-3'>
						<div className='flex items-center gap-2 text-red-300 font-serif font-bold text-sm'>
							<ShieldAlert className='w-4 h-4' />
							<span>危險區域</span>
						</div>
						<p className='text-xs text-stone-400 leading-relaxed'>
							刪除戰役將會永久移除該戰役底下的所有角色、背包物品與公庫資料，此動作無法復原。
						</p>
						<button
							type='button'
							onClick={handleDeleteCampaign}
							className='px-3.5 py-2 rounded bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-semibold cursor-pointer transition shadow'
						>
							永久刪除此戰役
						</button>
					</div>
				</>
			)}
		</main>
	);
}
