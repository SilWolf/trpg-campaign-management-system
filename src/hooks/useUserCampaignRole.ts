import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type UserRole = 'dm' | 'player' | 'guest';

interface CampaignRoleState {
	key: string;
	role: UserRole;
	loading: boolean;
}

export function useUserCampaignRole(campaignId: string) {
	const { user, isGuest } = useAuth();
	const userId = user?.id ?? null;
	const identityKey = JSON.stringify([campaignId, userId, isGuest]);
	const [roleState, setRoleState] = useState<CampaignRoleState>({
		key: '',
		role: 'player',
		loading: true,
	});
	const loading = roleState.key !== identityKey || roleState.loading;
	const role = loading ? 'player' : roleState.role;

	useEffect(() => {
		let isMounted = true;

		async function determineRole() {
			if (!campaignId) {
				if (isMounted) {
					setRoleState({ key: identityKey, role: 'player', loading: false });
				}
				return;
			}

			// 訪客模式或未設定 Supabase 時，預設給予 player 身分。
			if (isGuest || !supabase) {
				if (isMounted) {
					setRoleState({ key: identityKey, role: 'player', loading: false });
				}
				return;
			}

			try {
				if (!userId) {
					if (isMounted) {
						setRoleState({ key: identityKey, role: 'player', loading: false });
					}
					return;
				}

				// 以 campaign_members.role 判斷戰役成員身分，支援多名 DM。
				const { data: memberData, error: memberError } = await supabase
					.from('campaign_members')
					.select('role')
					.eq('campaign_id', campaignId)
					.eq('user_id', userId)
					.single();

				if (!memberError && memberData) {
					if (isMounted) {
						setRoleState({
							key: identityKey,
							role: memberData.role === 'dm' ? 'dm' : 'player',
							loading: false,
						});
					}
					return;
				}

				// 若非戰役成員，預設為一般玩家。
				if (isMounted) {
					setRoleState({ key: identityKey, role: 'player', loading: false });
				}
			} catch (err) {
				console.error('取得使用者戰役身分失敗:', err);
				if (isMounted) {
					setRoleState({ key: identityKey, role: 'player', loading: false });
				}
			}
		}

		determineRole();

		return () => {
			isMounted = false;
		};
	}, [campaignId, identityKey, isGuest, userId]);

	return {
		role,
		user,
		isDm: role === 'dm',
		isPlayer: role === 'player',
		loading,
	};
}
