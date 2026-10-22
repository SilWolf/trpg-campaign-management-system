/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route. */
import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
	Settings,
	Copy,
	Check,
	ShieldAlert,
	Save,
	Users,
	Shield,
	User,
	Trash2,
} from 'lucide-react';
import {
	supabase,
	fromDbItem,
	toDbItem,
	type DbInventoryItem,
} from '@/lib/supabase';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import { CAMP_CHEST_DEFAULT } from '@/data';
import {
	CAMP_CHEST_ID,
	canStackItems,
	type Character,
	type CharacterPermission,
	type AccessLevel,
	type InventoryItem,
} from '@/types';

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/settings/',
)({
	component: CampaignSettingsPage,
});

interface DisplayMember {
	id: string;
	identifier: string;
	type: 'dm' | 'player' | 'pending';
	roleText: string;
	maxCharacters?: number; // 新增：該玩家可創建的角色數量上限
}

const AVATAR_OPTIONS = [
	'🛡️',
	'🧙‍♂️',
	'🧝‍♀️',
	'🗡️',
	'🔮',
	'🦇',
	'🐉',
	'🍀',
	'🏹',
	'📜',
	'🌙',
];

function CampaignSettingsPage() {
	const navigate = useNavigate();
	const { campaignId } = Route.useParams();
	const { user, isDm } = useUserCampaignRole(campaignId);

	const [activeTab, setActiveTab] = useState<'general' | string>('general');

	const [campaignName, setCampaignName] = useState('');
	const [inviteCode, setInviteCode] = useState('');
	const [copied, setCopied] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [inviteEmail, setInviteEmail] = useState('');
	const [allMembers, setAllMembers] = useState<DisplayMember[]>([]);
	const [campaignCharacters, setCampaignCharacters] = useState<Character[]>([]);
	const [allPermissions, setAllPermissions] = useState<CharacterPermission[]>(
		[],
	);

	// 角色基本資料編輯表單狀態
	const [editCharName, setEditCharName] = useState('');
	const [editCharTitle, setEditCharTitle] = useState('');
	const [editCharStr, setEditCharStr] = useState(10);
	const [editCharAvatar, setEditCharAvatar] = useState('🛡️');

	useEffect(() => {
		async function fetchSettingsData() {
			if (!supabase || campaignId === 'default') {
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
						maxCharacters: 1,
					},
					{
						id: 'pending-1',
						identifier: 'pending_player@example.com',
						type: 'pending',
						roleText: '等待接受邀請',
					},
				]);
				setCampaignCharacters([
					{
						id: 'tav',
						name: '塔夫 (Tav)',
						title: 'Lv.8 復仇誓言聖武士',
						str: 18,
						avatar: '🛡️',
						userId: 'player-1',
						campaignId: 'default',
						currencies: { pp: 2, gp: 485, ep: 0, sp: 34, cp: 80 },
						privateCurrencies: { pp: 0, gp: 50, ep: 0, sp: 0, cp: 0 },
					},
				]);
				return;
			}

			const { data: campData } = await supabase
				.from('campaigns')
				.select('*')
				.eq('id', campaignId)
				.single();

			if (campData) {
				setCampaignName(campData.name);
				setInviteCode(campData.invite_code || '無');
			}

			// 取得已加入成員（包含每位玩家的 max_characters）
			const { data: memberData } = await supabase
				.from('campaign_members')
				.select(`user_id, role, max_characters, profiles (full_name, email)`)
				.eq('campaign_id', campaignId);

			const { data: inviteData } = await supabase
				.from('campaign_invites')
				.select('id, email')
				.eq('campaign_id', campaignId);

			const membersList: DisplayMember[] = [];
			if (memberData) {
				memberData.forEach((m) => {
					const isCampDm = campData && campData.dm_id === m.user_id;
					const profile = Array.isArray(m.profiles)
						? m.profiles[0]
						: m.profiles;
					const displayName = profile?.full_name || profile?.email || m.user_id;
					membersList.push({
						id: m.user_id,
						identifier: displayName,
						type: isCampDm ? 'dm' : 'player',
						roleText: isCampDm ? '地下城主 (DM)' : '玩家',
						maxCharacters:
							typeof m.max_characters === 'number' ? m.max_characters : 1,
					});
				});
			}
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
			const orderWeight = { dm: 1, player: 2, pending: 3 };
			membersList.sort((a, b) => orderWeight[a.type] - orderWeight[b.type]);
			setAllMembers(membersList);

			const [{ data: charData }, { data: permData }] = await Promise.all([
				supabase.from('characters').select('*').eq('campaign_id', campaignId),
				supabase
					.from('character_permissions')
					.select('*')
					.eq('campaign_id', campaignId),
			]);

			if (charData) {
				setCampaignCharacters(
					charData.map((c) => ({
						id: c.id,
						name: c.name,
						title: c.title,
						str: c.str,
						avatar: c.avatar,
						userId: c.user_id,
						campaignId: c.campaign_id,
						currencies: c.currencies || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
						privateCurrencies: c.private_currencies || {
							pp: 0,
							gp: 0,
							ep: 0,
							sp: 0,
							cp: 0,
						},
					})),
				);
			}

			if (permData) {
				setAllPermissions(
					permData.map((p) => ({
						id: p.id,
						campaignId: p.campaign_id,
						characterId: p.character_id,
						userId: p.user_id,
						publicBagAccess: p.public_bag_access ?? 1,
						privateBagAccess: p.private_bag_access ?? 0,
						publicWalletAccess: p.public_wallet_access ?? 1,
						privateWalletAccess: p.private_wallet_access ?? 0,
						canEditProfile: Boolean(p.can_edit_profile),
						canDeleteCharacter: Boolean(p.can_delete_character),
						canManagePermissions: Boolean(p.can_manage_permissions),
					})),
				);
			}
		}
		fetchSettingsData();
	}, [campaignId]);

	const currentSelectedChar = campaignCharacters.find(
		(c) => c.id === activeTab,
	);

	useEffect(() => {
		if (currentSelectedChar) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setEditCharName(currentSelectedChar.name);
			setEditCharTitle(currentSelectedChar.title);
			setEditCharStr(currentSelectedChar.str);
			setEditCharAvatar(currentSelectedChar.avatar || '🛡️');
		}
	}, [currentSelectedChar]);

	const myPermForSelectedChar = (() => {
		if (!currentSelectedChar) {
			return {
				canEditProfile: false,
				canDeleteCharacter: false,
				canManagePermissions: false,
			};
		}
		if (isDm) {
			return {
				canEditProfile: true,
				canDeleteCharacter: true,
				canManagePermissions: true,
			};
		}
		const found = allPermissions.find(
			(p) => p.characterId === currentSelectedChar.id && p.userId === user?.id,
		);
		if (found) {
			return {
				canEditProfile: found.canEditProfile,
				canDeleteCharacter: found.canDeleteCharacter,
				canManagePermissions: found.canManagePermissions,
			};
		}
		const isCreator = Boolean(
			user?.id && currentSelectedChar.userId === user.id,
		);
		return {
			canEditProfile: isCreator,
			canDeleteCharacter: isCreator,
			canManagePermissions: isCreator,
		};
	})();

	const handleSaveGeneralSettings = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!isDm || !supabase || campaignId === 'default') {
			setNotice('預設戰役或非 DM 無法修改戰役設定。');
			return;
		}

		const { error } = await supabase
			.from('campaigns')
			.update({ name: campaignName.trim() })
			.eq('id', campaignId);

		if (error) {
			setNotice('儲存失敗：' + error.message);
		} else {
			setNotice('✨ 戰役設定已成功更新！');
			setTimeout(() => setNotice(null), 3000);
		}
	};

	// DM 更新個別玩家的「可創建角色數量上限」
	const handleUpdateMemberMaxChars = async (
		memberUserId: string,
		nextMax: number,
	) => {
		if (!isDm) return;
		const cleanMax = Math.max(0, nextMax);

		setAllMembers((prev) =>
			prev.map((m) =>
				m.id === memberUserId ? { ...m, maxCharacters: cleanMax } : m,
			),
		);

		if (supabase && campaignId !== 'default') {
			const { error } = await supabase
				.from('campaign_members')
				.update({ max_characters: cleanMax })
				.eq('campaign_id', campaignId)
				.eq('user_id', memberUserId);

			if (error) {
				setNotice('更新玩家角色上限失敗：' + error.message);
			} else {
				setNotice('✨ 已更新該玩家的可創建角色數量上限！');
				setTimeout(() => setNotice(null), 2500);
			}
		}
	};

	const handleSendEmailInvite = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!inviteEmail.trim() || campaignId === 'default' || !supabase) {
			setNotice('預設戰役無法發送邀請。');
			return;
		}

		try {
			const { error } = await supabase.functions.invoke('invite-player', {
				body: {
					email: inviteEmail.trim(),
					campaignId,
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
			await navigate({ to: '/' });
		} catch (error) {
			setNotice(
				'刪除戰役失敗：' +
					(error instanceof Error ? error.message : '未知錯誤'),
			);
		}
	};

	const handleSaveCharacterProfile = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!currentSelectedChar || !myPermForSelectedChar.canEditProfile) return;

		const updatedChar: Character = {
			...currentSelectedChar,
			name: editCharName.trim() || currentSelectedChar.name,
			title: editCharTitle.trim() || '冒險者',
			str: Math.max(1, Math.min(30, Number(editCharStr) || 10)),
			avatar: editCharAvatar,
		};

		setCampaignCharacters((prev) =>
			prev.map((c) => (c.id === updatedChar.id ? updatedChar : c)),
		);

		if (supabase && campaignId !== 'default') {
			const { error } = await supabase
				.from('characters')
				.update({
					name: updatedChar.name,
					title: updatedChar.title,
					str: updatedChar.str,
					avatar: updatedChar.avatar,
				})
				.eq('id', updatedChar.id)
				.eq('campaign_id', campaignId);

			if (error) {
				setNotice('更新角色資料失敗：' + error.message);
				return;
			}
		}

		setNotice(`✨ 角色「${updatedChar.name}」基本資料已更新！`);
		setTimeout(() => setNotice(null), 3000);
	};

	const handleUpdatePermission = async (
		char: Character,
		targetUserId: string,
		field: keyof CharacterPermission,
		value: AccessLevel | boolean,
	) => {
		if (!myPermForSelectedChar.canManagePermissions) return;
		// 防自鎖保護：若不是 DM，絕對禁止修改自己的權限
		if (!isDm && user?.id && targetUserId === user.id) {
			setNotice('⚠️ 安全保護：玩家無法修改自己的角色權限，以免誤鎖自己。');
			return;
		}

		const isTargetCreator = targetUserId === char.userId;
		const existing = allPermissions.find(
			(p) => p.characterId === char.id && p.userId === targetUserId,
		);

		const basePerm: CharacterPermission = existing || {
			// eslint-disable-next-line react-hooks/purity
			id: `perm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			campaignId,
			characterId: char.id,
			userId: targetUserId,
			publicBagAccess: isTargetCreator ? 2 : 1,
			privateBagAccess: isTargetCreator ? 2 : 0,
			publicWalletAccess: isTargetCreator ? 2 : 1,
			privateWalletAccess: isTargetCreator ? 2 : 0,
			canEditProfile: isTargetCreator,
			canDeleteCharacter: isTargetCreator,
			canManagePermissions: isTargetCreator,
		};

		const nextPerm: CharacterPermission = {
			...basePerm,
			[field]: value,
		};

		setAllPermissions((prev) => {
			const hasOld = prev.some(
				(p) => p.characterId === char.id && p.userId === targetUserId,
			);
			return hasOld
				? prev.map((p) =>
						p.characterId === char.id && p.userId === targetUserId
							? nextPerm
							: p,
					)
				: [...prev, nextPerm];
		});

		if (supabase && campaignId !== 'default') {
			const { error } = await supabase.from('character_permissions').upsert(
				{
					campaign_id: campaignId,
					character_id: char.id,
					user_id: targetUserId,
					public_bag_access: nextPerm.publicBagAccess,
					private_bag_access: nextPerm.privateBagAccess,
					public_wallet_access: nextPerm.publicWalletAccess,
					private_wallet_access: nextPerm.privateWalletAccess,
					can_edit_profile: nextPerm.canEditProfile,
					can_delete_character: nextPerm.canDeleteCharacter,
					can_manage_permissions: nextPerm.canManagePermissions,
					updated_at: new Date().toISOString(),
				},
				{ onConflict: 'character_id,user_id' },
			);
			if (error) {
				setNotice('權限儲存失敗：' + error.message);
			}
		}
	};

	const handleDeleteCharacterInSettings = async (char: Character) => {
		if (!myPermForSelectedChar.canDeleteCharacter) return;
		const realChars = campaignCharacters.filter((c) => c.id !== CAMP_CHEST_ID);
		if (realChars.length <= 1) {
			alert('⚠️ 戰役中至少需保留一名冒險者角色！');
			return;
		}

		const confirmed = window.confirm(
			`⚠️ 確定要永久移除角色「${char.name}」嗎？\n該角色身上的所有公開/私人物品與雙錢包貨幣，將全數自動併入「🏕️ 營地儲物箱」！`,
		);
		if (!confirmed) return;

		try {
			if (supabase && campaignId !== 'default') {
				const existingChest = campaignCharacters.find(
					(c) => c.id === CAMP_CHEST_ID,
				) || {
					...CAMP_CHEST_DEFAULT,
					campaignId,
					userId: 'dm',
				};

				const mergedCurrencies = {
					pp:
						(existingChest.currencies?.pp ?? 0) +
						(char.currencies?.pp ?? 0) +
						(char.privateCurrencies?.pp ?? 0),
					gp:
						(existingChest.currencies?.gp ?? 0) +
						(char.currencies?.gp ?? 0) +
						(char.privateCurrencies?.gp ?? 0),
					ep:
						(existingChest.currencies?.ep ?? 0) +
						(char.currencies?.ep ?? 0) +
						(char.privateCurrencies?.ep ?? 0),
					sp:
						(existingChest.currencies?.sp ?? 0) +
						(char.currencies?.sp ?? 0) +
						(char.privateCurrencies?.sp ?? 0),
					cp:
						(existingChest.currencies?.cp ?? 0) +
						(char.currencies?.cp ?? 0) +
						(char.privateCurrencies?.cp ?? 0),
				};

				await supabase.from('characters').upsert({
					id: CAMP_CHEST_ID,
					name: existingChest.name,
					title: existingChest.title,
					avatar: existingChest.avatar,
					str: existingChest.str,
					user_id: existingChest.userId || 'dm',
					campaign_id: campaignId,
					currencies: mergedCurrencies,
					private_currencies: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
				});

				const { data: itemRows } = await supabase
					.from('inventory_items')
					.select('*')
					.eq('campaign_id', campaignId);

				if (itemRows) {
					const allItems = (itemRows as DbInventoryItem[]).map(fromDbItem);
					const campItems = allItems
						.filter((i) => i.ownerId === CAMP_CHEST_ID)
						.map((i) => ({ ...i }));
					const charItems = allItems.filter((i) => i.ownerId === char.id);
					const itemsToDelete: string[] = [];

					charItems.forEach((item) => {
						const movedItem: InventoryItem = {
							...item,
							ownerId: CAMP_CHEST_ID,
							equipped: false,
							attuned: false,
							isPrivate: false,
						};
						const existingStack = campItems.find((target) =>
							canStackItems(target, movedItem),
						);
						if (existingStack) {
							existingStack.quantity += movedItem.quantity;
							itemsToDelete.push(item.id);
						} else {
							campItems.push(movedItem);
						}
					});

					if (campItems.length > 0) {
						await supabase.from('inventory_items').upsert(
							campItems.map((i) => ({
								...toDbItem(i),
								campaign_id: campaignId,
							})),
						);
					}
					if (itemsToDelete.length > 0) {
						await supabase
							.from('inventory_items')
							.delete()
							.in('id', itemsToDelete)
							.eq('campaign_id', campaignId);
					}
				}

				await supabase
					.from('characters')
					.delete()
					.eq('id', char.id)
					.eq('campaign_id', campaignId);
			}

			setCampaignCharacters((prev) => prev.filter((c) => c.id !== char.id));
			setActiveTab('general');
			setNotice(
				`🏕️ 已移除角色「${char.name}」，其裝備與雙錢包已全數移入營地儲物箱！`,
			);
			setTimeout(() => setNotice(null), 3500);
		} catch (err) {
			setNotice(
				'移除角色失敗：' + (err instanceof Error ? err.message : '未知錯誤'),
			);
		}
	};

	return (
		<main className='max-w-5xl mx-auto px-4 py-8 space-y-6'>
			<div className='flex items-center gap-3 border-b border-amber-900/50 pb-4'>
				<div className='p-2.5 rounded-lg bg-amber-950 border border-amber-600/50 text-amber-300'>
					<Settings className='w-6 h-6' />
				</div>
				<div>
					<h1 className='text-xl font-serif font-bold text-amber-100'>
						戰役與角色控制權限中心
					</h1>
					<p className='text-xs text-stone-400'>
						管理戰役屬性、個別玩家可創建角色配額，以及各冒險者角色的細粒度存取權限矩陣
					</p>
				</div>
			</div>

			{notice && (
				<div className='p-3 rounded bg-amber-950/60 border border-amber-600/60 text-amber-200 text-xs'>
					{notice}
				</div>
			)}

			{/* 分頁導覽列 */}
			<div className='flex items-center gap-2 overflow-x-auto pb-2 border-b border-stone-800'>
				<button
					type='button'
					onClick={() => setActiveTab('general')}
					className={`px-4 py-2 rounded-md text-xs font-semibold shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
						activeTab === 'general'
							? 'bg-amber-800 text-amber-100 border border-amber-500/70 shadow'
							: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
					}`}
				>
					<Shield className='w-3.5 h-3.5 text-amber-400' />
					<span>⚙️ 戰役常規設定與成員配額</span>
				</button>

				{campaignCharacters
					.filter((c) => c.id !== CAMP_CHEST_ID)
					.map((char) => {
						const isActive = activeTab === char.id;
						return (
							<button
								key={char.id}
								type='button'
								onClick={() => setActiveTab(char.id)}
								className={`px-3.5 py-2 rounded-md text-xs font-semibold shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
									isActive
										? 'bg-purple-900 text-purple-100 border border-purple-500/70 shadow'
										: 'bg-stone-900 text-stone-400 border border-stone-800 hover:text-stone-200'
								}`}
							>
								<span>{char.avatar}</span>
								<span>{char.name}</span>
							</button>
						);
					})}
			</div>

			{/* ========================================== */}
			{/* 分頁 A：戰役常規設定與成員總覽                 */}
			{/* ========================================== */}
			{activeTab === 'general' && (
				<div className='space-y-6'>
					<form
						onSubmit={handleSaveGeneralSettings}
						className='bg-stone-950 border border-stone-800 rounded-lg p-6 space-y-5 shadow-xl'
					>
						<div className='flex items-center justify-between border-b border-stone-800 pb-2'>
							<h2 className='text-sm font-serif font-bold text-amber-200'>
								戰役基本參數
							</h2>
							{!isDm && (
								<span className='text-[11px] px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-stone-400'>
									唯讀模式 (僅 DM 可修改)
								</span>
							)}
						</div>

						<div>
							<label className='block text-xs font-semibold text-stone-300 mb-1.5'>
								戰役名稱
							</label>
							<input
								type='text'
								disabled={!isDm}
								value={campaignName}
								onChange={(e) => setCampaignName(e.target.value)}
								className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 outline-none focus:border-amber-500 disabled:opacity-60'
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
									onClick={() => {
										navigator.clipboard.writeText(inviteCode);
										setCopied(true);
										setTimeout(() => setCopied(false), 2000);
									}}
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

						{isDm && (
							<div className='flex justify-end pt-3 border-t border-stone-800'>
								<button
									type='submit'
									className='px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 text-stone-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow'
								>
									<Save className='w-4 h-4' />
									<span>儲存變更</span>
								</button>
							</div>
						)}
					</form>

					{/* 戰役成員總覽與個別角色數量上限設定 */}
					<div className='bg-stone-950 border border-stone-800 rounded-lg p-6 space-y-4 shadow-xl'>
						<div className='flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-3'>
							<div>
								<h2 className='text-sm font-serif font-bold text-amber-200 flex items-center gap-2'>
									<Users className='w-4 h-4 text-amber-400' />
									<span>戰役成員總覽與角色創建配額</span>
								</h2>
								<p className='text-[11px] text-stone-400 mt-0.5'>
									DM 可針對每名玩家個別設定允許創建的角色數量上限（預設為
									1，設為 0 代表禁止創建）。
								</p>
							</div>
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
									const badgeStyle =
										member.type === 'dm'
											? 'bg-amber-950/80 text-amber-300 border-amber-600/60'
											: member.type === 'player'
												? 'bg-purple-950/80 text-purple-300 border-purple-600/60'
												: 'bg-stone-900 text-stone-400 border-stone-700 border-dashed';

									const createdCount = campaignCharacters.filter(
										(c) => c.id !== CAMP_CHEST_ID && c.userId === member.id,
									).length;

									return (
										<div
											key={member.id}
											className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-stone-900/60 border border-stone-800 rounded-md px-4 py-2.5 text-xs'
										>
											<div className='flex items-center gap-2 min-w-0'>
												<span className='font-mono text-stone-200 truncate max-w-[240px] sm:max-w-md'>
													{member.identifier}
												</span>
												<span
													className={`px-2 py-0.5 rounded border text-[10px] font-medium shrink-0 ${badgeStyle}`}
												>
													{member.roleText}
												</span>
											</div>

											<div className='flex items-center gap-3 shrink-0'>
												{member.type === 'dm' && (
													<span className='text-[11px] text-amber-300/90 font-mono'>
														已建 {createdCount} 名角色（DM 無上限）
													</span>
												)}

												{member.type === 'player' && (
													<div className='flex items-center gap-2 bg-stone-950 border border-stone-800 rounded px-2.5 py-1'>
														<span className='text-[11px] text-stone-400'>
															角色配額 (已建 {createdCount} 名 / 上限:
														</span>
														{isDm ? (
															<input
																type='number'
																min={0}
																max={20}
																value={member.maxCharacters ?? 1}
																onChange={(e) =>
																	handleUpdateMemberMaxChars(
																		member.id,
																		parseInt(e.target.value, 10) || 0,
																	)
																}
																className='w-12 bg-stone-900 border border-amber-600/60 focus:border-amber-400 rounded px-1.5 py-0.5 text-center font-mono font-bold text-amber-300 outline-none'
															/>
														) : (
															<span className='font-mono font-bold text-amber-300'>
																{member.maxCharacters ?? 1}
															</span>
														)}
														<span className='text-[11px] text-stone-400'>
															名)
														</span>
													</div>
												)}
											</div>
										</div>
									);
								})}
							</div>
						)}

						{isDm && (
							<div className='pt-4 border-t border-stone-800 space-y-2.5'>
								<div className='flex items-center gap-2 text-amber-200 font-serif font-bold text-sm'>
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
							</div>
						)}
					</div>

					{/* DM 危險區域：刪除戰役 */}
					{isDm && (
						<div className='bg-red-950/30 border border-red-900/60 rounded-lg p-5 space-y-3'>
							<div className='flex items-center gap-2 text-red-300 font-serif font-bold text-sm'>
								<ShieldAlert className='w-4 h-4' />
								<span>戰役危險區域</span>
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
					)}
				</div>
			)}

			{/* ========================================== */}
			{/* 分頁 B：個別角色的設定與權限控制分頁           */}
			{/* ========================================== */}
			{currentSelectedChar && (
				<div className='space-y-6'>
					{/* 區塊 1：角色基本資料設定 (can_edit_profile) */}
					<form
						onSubmit={handleSaveCharacterProfile}
						className='bg-stone-950 border border-stone-800 rounded-lg p-6 space-y-4 shadow-xl'
					>
						<div className='flex items-center justify-between border-b border-stone-800 pb-3'>
							<div className='flex items-center gap-2'>
								<span className='text-xl'>{currentSelectedChar.avatar}</span>
								<h2 className='text-base font-serif font-bold text-amber-200'>
									{currentSelectedChar.name} — 角色基本資料
								</h2>
							</div>
							{!myPermForSelectedChar.canEditProfile && (
								<span className='text-[11px] px-2 py-0.5 rounded bg-stone-900 border border-stone-700 text-stone-400'>
									唯讀模式 (無基本資料修改權)
								</span>
							)}
						</div>

						<div className='grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs'>
							<div>
								<label className='block text-stone-400 mb-1'>角色名稱 *</label>
								<input
									type='text'
									required
									disabled={!myPermForSelectedChar.canEditProfile}
									value={editCharName}
									onChange={(e) => setEditCharName(e.target.value)}
									className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-500 disabled:opacity-60'
								/>
							</div>

							<div>
								<label className='block text-stone-400 mb-1'>
									頭銜 / 職業背景
								</label>
								<input
									type='text'
									disabled={!myPermForSelectedChar.canEditProfile}
									value={editCharTitle}
									onChange={(e) => setEditCharTitle(e.target.value)}
									className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-500 disabled:opacity-60'
								/>
							</div>

							<div>
								<label className='block text-amber-300 mb-1'>
									力量屬性 (STR)
								</label>
								<input
									type='number'
									min={1}
									max={30}
									required
									disabled={!myPermForSelectedChar.canEditProfile}
									value={editCharStr}
									onChange={(e) =>
										setEditCharStr(parseInt(e.target.value, 10) || 10)
									}
									className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-2 text-amber-200 font-mono font-bold outline-none focus:border-amber-500 disabled:opacity-60'
								/>
							</div>

							<div>
								<label className='block text-stone-400 mb-1'>頭像符號</label>
								<select
									disabled={!myPermForSelectedChar.canEditProfile}
									value={editCharAvatar}
									onChange={(e) => setEditCharAvatar(e.target.value)}
									className='w-full bg-stone-900 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none disabled:opacity-60'
								>
									{AVATAR_OPTIONS.map((icon) => (
										<option key={icon} value={icon}>
											{icon} 頭像
										</option>
									))}
								</select>
							</div>
						</div>

						{myPermForSelectedChar.canEditProfile && (
							<div className='flex justify-end pt-3 border-t border-stone-800'>
								<button
									type='submit'
									className='px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 text-stone-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow'
								>
									<Save className='w-4 h-4' />
									<span>儲存角色基本資料</span>
								</button>
							</div>
						)}
					</form>

					{/* 區塊 2：角色控制權限矩陣表 (can_manage_permissions) */}
					<div className='bg-stone-950 border border-stone-800 rounded-lg p-6 space-y-5 shadow-xl'>
						<div className='border-b border-stone-800 pb-3 flex flex-wrap items-center justify-between gap-2'>
							<div>
								<h2 className='text-base font-serif font-bold text-purple-200'>
									角色控制權限矩陣 (Access Control List)
								</h2>
								<p className='text-xs text-stone-400 mt-0.5'>
									設定戰役內各成員對「{currentSelectedChar.name}
									」的背包、錢包與管理控制權（為防誤鎖，玩家不可修改自己的權限列）。
								</p>
							</div>
							{!myPermForSelectedChar.canManagePermissions && (
								<span className='text-[11px] px-2.5 py-1 rounded bg-stone-900 border border-stone-700 text-stone-400'>
									🔒 唯讀檢視 (你沒有修改此角色權限表的控制權)
								</span>
							)}
						</div>

						<div className='space-y-4'>
							{allMembers
								.filter((m) => m.type !== 'pending')
								.map((member) => {
									const isTargetDm = member.type === 'dm';
									const isTargetCreator =
										member.id === currentSelectedChar.userId;
									const isTargetSelf = Boolean(
										user?.id && member.id === user.id,
									);
									const perm = allPermissions.find(
										(p) =>
											p.characterId === currentSelectedChar.id &&
											p.userId === member.id,
									);

									const pubBag = isTargetDm
										? 2
										: (perm?.publicBagAccess ?? (isTargetCreator ? 2 : 1));
									const privBag = isTargetDm
										? 2
										: (perm?.privateBagAccess ?? (isTargetCreator ? 2 : 0));
									const pubWallet = isTargetDm
										? 2
										: (perm?.publicWalletAccess ?? (isTargetCreator ? 2 : 1));
									const privWallet = isTargetDm
										? 2
										: (perm?.privateWalletAccess ?? (isTargetCreator ? 2 : 0));
									const editProfile = isTargetDm
										? true
										: (perm?.canEditProfile ?? isTargetCreator);
									const delChar = isTargetDm
										? true
										: (perm?.canDeleteCharacter ?? isTargetCreator);
									const managePerm = isTargetDm
										? true
										: (perm?.canManagePermissions ?? isTargetCreator);

									// 鎖定條件：目標是 DM、自己沒有管理權、或「非 DM 玩家看到自己這一列」
									const rowDisabled =
										isTargetDm ||
										!myPermForSelectedChar.canManagePermissions ||
										(!isDm && isTargetSelf);

									return (
										<div
											key={member.id}
											className='bg-stone-900/70 border border-stone-800 rounded-lg p-4 space-y-3'
										>
											<div className='flex items-center justify-between border-b border-stone-800/80 pb-2'>
												<div className='flex items-center gap-2'>
													<User className='w-4 h-4 text-amber-400' />
													<span className='text-xs font-bold text-stone-200'>
														{member.identifier}
													</span>
													<span className='text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-400'>
														{member.roleText}
													</span>
												</div>
												<div className='flex items-center gap-1.5 flex-wrap'>
													{isTargetDm && (
														<span className='text-[10px] px-2 py-0.5 rounded bg-red-950/80 text-red-200 border border-red-700/50 font-semibold'>
															👑 DM 預設全權限
														</span>
													)}
													{isTargetCreator && (
														<span className='text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700/50 font-semibold'>
															✨ 角色創造者
														</span>
													)}
													{!isDm && isTargetSelf && (
														<span className='text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-600 font-medium'>
															🔒 本人權限 (防誤鎖保護)
														</span>
													)}
												</div>
											</div>

											<div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs'>
												{/* 公開背包權限 */}
												<div>
													<label className='block text-stone-400 mb-1'>
														🎒 公開背包權限
													</label>
													<select
														disabled={rowDisabled}
														value={pubBag}
														onChange={(e) =>
															handleUpdatePermission(
																currentSelectedChar,
																member.id,
																'publicBagAccess',
																parseInt(e.target.value, 10) as AccessLevel,
															)
														}
														className='w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-amber-200 outline-none disabled:opacity-50 disabled:cursor-not-allowed'
													>
														<option value={0}>0 - 無權限 (隱藏)</option>
														<option value={1}>1 - 僅閱讀</option>
														<option value={2}>2 - 閱讀 + 修改</option>
													</select>
												</div>

												{/* 私人背包權限 */}
												<div>
													<label className='block text-stone-400 mb-1'>
														🔒 私人暗袋權限
													</label>
													<select
														disabled={rowDisabled}
														value={privBag}
														onChange={(e) =>
															handleUpdatePermission(
																currentSelectedChar,
																member.id,
																'privateBagAccess',
																parseInt(e.target.value, 10) as AccessLevel,
															)
														}
														className='w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-emerald-300 outline-none disabled:opacity-50 disabled:cursor-not-allowed'
													>
														<option value={0}>0 - 無權限 (隱藏)</option>
														<option value={1}>1 - 僅閱讀</option>
														<option value={2}>2 - 閱讀 + 修改</option>
													</select>
												</div>

												{/* 公開錢包權限 */}
												<div>
													<label className='block text-stone-400 mb-1'>
														🪙 公開錢包權限
													</label>
													<select
														disabled={rowDisabled}
														value={pubWallet}
														onChange={(e) =>
															handleUpdatePermission(
																currentSelectedChar,
																member.id,
																'publicWalletAccess',
																parseInt(e.target.value, 10) as AccessLevel,
															)
														}
														className='w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-amber-300 outline-none disabled:opacity-50 disabled:cursor-not-allowed'
													>
														<option value={0}>0 - 無權限 (隱藏餘額)</option>
														<option value={1}>1 - 僅閱讀餘額</option>
														<option value={2}>2 - 閱讀 + 修改/轉出</option>
													</select>
												</div>

												{/* 私人錢包權限 */}
												<div>
													<label className='block text-stone-400 mb-1'>
														💰 私人錢包權限
													</label>
													<select
														disabled={rowDisabled}
														value={privWallet}
														onChange={(e) =>
															handleUpdatePermission(
																currentSelectedChar,
																member.id,
																'privateWalletAccess',
																parseInt(e.target.value, 10) as AccessLevel,
															)
														}
														className='w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-cyan-300 outline-none disabled:opacity-50 disabled:cursor-not-allowed'
													>
														<option value={0}>0 - 無權限 (隱藏餘額)</option>
														<option value={1}>1 - 僅閱讀餘額</option>
														<option value={2}>2 - 閱讀 + 修改/轉出</option>
													</select>
												</div>
											</div>

											{/* 3 項布林權限勾選 */}
											<div className='flex flex-wrap items-center gap-5 pt-2 border-t border-stone-800/60 text-xs'>
												<label
													className={`flex items-center gap-2 text-stone-300 ${
														rowDisabled
															? 'opacity-50 cursor-not-allowed'
															: 'cursor-pointer'
													}`}
												>
													<input
														type='checkbox'
														disabled={rowDisabled}
														checked={editProfile}
														onChange={(e) =>
															handleUpdatePermission(
																currentSelectedChar,
																member.id,
																'canEditProfile',
																e.target.checked,
															)
														}
														className='accent-amber-500'
													/>
													<span>基本資料修改權 (`can_edit_profile`)</span>
												</label>

												<label
													className={`flex items-center gap-2 text-stone-300 ${
														rowDisabled
															? 'opacity-50 cursor-not-allowed'
															: 'cursor-pointer'
													}`}
												>
													<input
														type='checkbox'
														disabled={rowDisabled}
														checked={delChar}
														onChange={(e) =>
															handleUpdatePermission(
																currentSelectedChar,
																member.id,
																'canDeleteCharacter',
																e.target.checked,
															)
														}
														className='accent-red-500'
													/>
													<span>角色刪除權 (`can_delete_character`)</span>
												</label>

												<label
													className={`flex items-center gap-2 text-stone-300 ${
														rowDisabled
															? 'opacity-50 cursor-not-allowed'
															: 'cursor-pointer'
													}`}
												>
													<input
														type='checkbox'
														disabled={rowDisabled}
														checked={managePerm}
														onChange={(e) =>
															handleUpdatePermission(
																currentSelectedChar,
																member.id,
																'canManagePermissions',
																e.target.checked,
															)
														}
														className='accent-purple-500'
													/>
													<span>
														修改控制權的控制權 (`can_manage_permissions`)
													</span>
												</label>
											</div>
										</div>
									);
								})}
						</div>
					</div>

					{/* 區塊 3：角色危險操作區 (can_delete_character) */}
					{myPermForSelectedChar.canDeleteCharacter && (
						<div className='bg-red-950/30 border border-red-900/60 rounded-lg p-5 space-y-3'>
							<div className='flex items-center gap-2 text-red-300 font-serif font-bold text-sm'>
								<ShieldAlert className='w-4 h-4' />
								<span>角色危險操作區 — {currentSelectedChar.name}</span>
							</div>
							<p className='text-xs text-stone-400 leading-relaxed'>
								移除此角色後，該角色公開與私人背包內的所有物品、以及公開與私人錢包的所有貨幣，將自動全數轉入「🏕️
								營地儲物箱」。
							</p>
							<button
								type='button'
								onClick={() =>
									handleDeleteCharacterInSettings(currentSelectedChar)
								}
								className='px-4 py-2 rounded bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow'
							>
								<Trash2 className='w-4 h-4' />
								<span>移除角色「{currentSelectedChar.name}」(遺物入公庫)</span>
							</button>
						</div>
					)}
				</div>
			)}
		</main>
	);
}
