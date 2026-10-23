/* eslint-disable react-refresh/only-export-components -- TanStack Router 路由模組需匯出 Route. */
import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
	supabase,
	fromDbCampaignCurrency,
	fromDbItem,
	fromDbPermission,
	toDbCampaignCurrency,
	toDbItem,
	type DbInventoryItem,
} from '@/lib/supabase';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import {
	CAMP_CHEST_ID,
	canStackItems,
	type Character,
	type CharacterPermission,
	type AccessLevel,
	type InventoryItem,
} from '@/types';
import { CampaignSettingsView } from './-parts/CampaignSettingsView';
import type { DisplayMember } from './-parts/types';

export const Route = createFileRoute(
	'/_protected/campaigns/$campaignId/settings/',
)({
	component: CampaignSettingsPage,
});

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
	const [transferTargetUserId, setTransferTargetUserId] = useState('');

	// 角色基本資料編輯表單狀態
	const [editCharName, setEditCharName] = useState('');
	const [editCharTitle, setEditCharTitle] = useState('');
	const [editCharStr, setEditCharStr] = useState(10);
	const [editCharAvatar, setEditCharAvatar] = useState('🛡️');

	useEffect(() => {
		async function fetchSettingsData() {
			if (!supabase) return;

			const { data: campData } = await supabase
				.from('campaigns')
				.select('*')
				.eq('id', campaignId)
				.single();

			if (campData) {
				setCampaignName(campData.name);
				setInviteCode(campData.invite_code || '無');
			}

			// 取得戰役成員與邀請接受狀態
			const { data: memberData } = await supabase
				.from('campaign_members')
				.select(
					`user_id, role, max_characters, invited_at, accepted_at, profiles (full_name, email)`,
				)
				.eq('campaign_id', campaignId);

			const membersList: DisplayMember[] = [];
			if (memberData) {
				memberData.forEach((m) => {
					const isCampDm = m.role === 'dm';
					const isPendingInvite = Boolean(m.invited_at && !m.accepted_at);
					const profile = Array.isArray(m.profiles)
						? m.profiles[0]
						: m.profiles;
					const displayName = profile?.full_name || profile?.email || m.user_id;
					membersList.push({
						id: m.user_id,
						identifier: displayName,
						type: isCampDm ? 'dm' : isPendingInvite ? 'pending' : 'player',
						roleText: isCampDm
							? '地下城主 (DM)'
							: isPendingInvite
								? '等待完成註冊'
								: '玩家',
						maxCharacters:
							typeof m.max_characters === 'number' ? m.max_characters : 1,
						invitationStatus: m.invited_at
							? m.accepted_at
								? '已接受邀請'
								: '等待接受邀請'
							: undefined,
						invitedAt: m.invited_at,
						acceptedAt: m.accepted_at,
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
	const transferCandidates = allMembers.filter(
		(member) => member.type === 'player',
	);
	const currentOwnerName =
		allMembers.find((member) => member.id === currentSelectedChar?.userId)
			?.identifier ?? currentSelectedChar?.userId;
	const selectedTransferTarget =
		transferCandidates.find(
			(member) =>
				member.id === transferTargetUserId &&
				member.id !== currentSelectedChar?.userId,
		) ??
		transferCandidates.find(
			(member) => member.id !== currentSelectedChar?.userId,
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
		if (!isDm) {
			setNotice('只有 DM 可以修改戰役設定。');
			return;
		}
		if (!supabase) {
			setNotice('離線模式無法儲存戰役設定。');
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

		if (supabase) {
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
		if (!inviteEmail.trim() || !supabase) {
			setNotice(
				!inviteEmail.trim()
					? '請輸入要邀請的電子郵件地址。'
					: '離線模式無法發送邀請。',
			);
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
					roleText: '等待完成註冊',
					invitationStatus: '等待接受邀請',
					invitedAt: new Date().toISOString(),
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

		if (supabase) {
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

	const handleTransferCharacter = async (char: Character, targetUserId: string) => {
		if (!isDm || !supabase) {
			setNotice('只有線上戰役的 DM 可以轉移角色擁有權。');
			return;
		}

		const targetMember = allMembers.find(
			(member) => member.id === targetUserId && member.type === 'player',
		);
		if (!targetMember || targetUserId === char.userId) {
			setNotice('請選擇一位已加入戰役、且尚未擁有此角色的玩家。');
			return;
		}

		if (
			!window.confirm(
				`確定將「${char.name}」的擁有權轉移給 ${targetMember.identifier} 嗎？\n對方將取得此角色的完整控制權，原擁有者的個別權限設定將被移除。`,
			)
		) {
			return;
		}

		try {
			const { data: updatedCharacter, error: ownerError } = await supabase
				.from('characters')
				.update({ user_id: targetUserId })
				.eq('id', char.id)
				.eq('campaign_id', campaignId)
				.select('id')
				.single();
			if (ownerError || !updatedCharacter) {
				throw ownerError ?? new Error('找不到要移轉的角色。');
			}

			const { data: permissionData, error: permissionError } = await supabase
				.from('character_permissions')
				.upsert(
					{
						campaign_id: campaignId,
						character_id: char.id,
						user_id: targetUserId,
						public_bag_access: 2,
						private_bag_access: 2,
						public_wallet_access: 2,
						private_wallet_access: 2,
						can_edit_profile: true,
						can_delete_character: true,
						can_manage_permissions: true,
						updated_at: new Date().toISOString(),
					},
					{ onConflict: 'character_id,user_id' },
				)
				.select('*')
				.single();

			if (permissionError || !permissionData) {
				const { data: rolledBackCharacter, error: rollbackError } = await supabase
					.from('characters')
					.update({ user_id: char.userId })
					.eq('id', char.id)
					.eq('campaign_id', campaignId)
					.select('id')
					.single();
				if (rollbackError || !rolledBackCharacter) {
					setNotice(
						`角色已更新擁有者，但權限設定失敗，且無法復原擁有者：${permissionError?.message ?? '未取得權限資料'}；${rollbackError?.message ?? '找不到要復原的角色'}`,
					);
					return;
				}
				throw permissionError ?? new Error('未取得更新後的角色權限資料。');
			}
			const updatedPermission = fromDbPermission(permissionData);

			if (char.userId && char.userId !== targetUserId) {
				const { error: revokeError } = await supabase
					.from('character_permissions')
					.delete()
					.eq('campaign_id', campaignId)
					.eq('character_id', char.id)
					.eq('user_id', char.userId);
				if (revokeError) {
					setCampaignCharacters((prev) =>
						prev.map((current) =>
							current.id === char.id
								? { ...current, userId: targetUserId }
								: current,
						),
					);
					setAllPermissions((prev) => [
						...prev.filter(
							(permission) =>
								!(
									permission.characterId === char.id &&
									permission.userId === targetUserId
								),
						),
						updatedPermission,
					]);
					setNotice(
						`擁有權已轉移給 ${targetMember.identifier}，但無法撤除原擁有者權限：${revokeError.message}`,
					);
					return;
				}
			}

			setCampaignCharacters((prev) =>
				prev.map((current) =>
					current.id === char.id
						? { ...current, userId: targetUserId }
						: current,
				),
			);
			setAllPermissions((prev) => [
				...prev.filter(
					(permission) =>
						!(
							permission.characterId === char.id &&
							(permission.userId === targetUserId ||
								permission.userId === char.userId)
						),
				),
				updatedPermission,
			]);
			setNotice(`✨ 已將「${char.name}」的擁有權轉移給 ${targetMember.identifier}。`);
			setTimeout(() => setNotice(null), 3500);
		} catch (error) {
			setNotice(
				'轉移角色擁有權失敗：' +
					(error instanceof Error ? error.message : '未知錯誤'),
			);
		}
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

		if (supabase) {
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
			if (supabase) {
				const { data: itemRows, error: itemError } = await supabase
					.from('inventory_items')
					.select('*')
					.eq('campaign_id', campaignId);

				if (itemError) throw itemError;
				if (!itemRows) {
					throw new Error('無法載入角色物品，未執行角色移除。');
				}

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
					const { error } = await supabase.from('inventory_items').upsert(
						campItems.map((i) => ({
							...toDbItem(i),
							campaign_id: campaignId,
						})),
					);
					if (error) throw error;
				}
				if (itemsToDelete.length > 0) {
					const { error } = await supabase
						.from('inventory_items')
						.delete()
						.in('id', itemsToDelete)
						.eq('campaign_id', campaignId);
					if (error) throw error;
				}

				const { data: campaignRow, error: campaignError } = await supabase
					.from('campaigns')
					.select('camp_chest_currency')
					.eq('id', campaignId)
					.single();
				if (campaignError) throw campaignError;

				const campChestCurrency = fromDbCampaignCurrency(campaignRow);
				const mergedCurrencies = {
					pp:
						campChestCurrency.pp +
						(char.currencies?.pp ?? 0) +
						(char.privateCurrencies?.pp ?? 0),
					gp:
						campChestCurrency.gp +
						(char.currencies?.gp ?? 0) +
						(char.privateCurrencies?.gp ?? 0),
					ep:
						campChestCurrency.ep +
						(char.currencies?.ep ?? 0) +
						(char.privateCurrencies?.ep ?? 0),
					sp:
						campChestCurrency.sp +
						(char.currencies?.sp ?? 0) +
						(char.privateCurrencies?.sp ?? 0),
					cp:
						campChestCurrency.cp +
						(char.currencies?.cp ?? 0) +
						(char.privateCurrencies?.cp ?? 0),
				};
				const { error: currencyError } = await supabase
					.from('campaigns')
					.update(toDbCampaignCurrency(mergedCurrencies))
					.eq('id', campaignId);
				if (currencyError) throw currencyError;

				const { error: characterError } = await supabase
					.from('characters')
					.delete()
					.eq('id', char.id)
					.eq('campaign_id', campaignId);
				if (characterError) throw characterError;
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
		<CampaignSettingsView
			activeTab={activeTab}
			setActiveTab={setActiveTab}
			isDm={isDm}
			notice={notice}
			campaignName={campaignName}
			setCampaignName={setCampaignName}
			inviteCode={inviteCode}
			copied={copied}
			setCopied={setCopied}
			allMembers={allMembers}
			campaignCharacters={campaignCharacters}
			inviteEmail={inviteEmail}
			setInviteEmail={setInviteEmail}
			currentSelectedChar={currentSelectedChar}
			currentOwnerName={currentOwnerName}
			transferCandidates={transferCandidates}
			selectedTransferTarget={selectedTransferTarget}
			setTransferTargetUserId={setTransferTargetUserId}
			myPermForSelectedChar={myPermForSelectedChar}
			editCharName={editCharName}
			setEditCharName={setEditCharName}
			editCharTitle={editCharTitle}
			setEditCharTitle={setEditCharTitle}
			editCharStr={editCharStr}
			setEditCharStr={setEditCharStr}
			editCharAvatar={editCharAvatar}
			setEditCharAvatar={setEditCharAvatar}
			allPermissions={allPermissions}
			userId={user?.id}
			onSaveGeneralSettings={handleSaveGeneralSettings}
			onUpdateMemberMaxChars={handleUpdateMemberMaxChars}
			onSendEmailInvite={handleSendEmailInvite}
			onDeleteCampaign={handleDeleteCampaign}
			onSaveCharacterProfile={handleSaveCharacterProfile}
			onUpdatePermission={handleUpdatePermission}
			onTransferCharacter={handleTransferCharacter}
			onDeleteCharacter={handleDeleteCharacterInSettings}
		/>
	);
}