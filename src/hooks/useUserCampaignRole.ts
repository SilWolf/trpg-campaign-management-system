import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type UserRole = 'dm' | 'player' | 'guest';

export function useUserCampaignRole(campaignId: string) {
	const { user, isGuest } = useAuth();
	const [role, setRole] = useState<UserRole>('player');
	const [loading, setLoading] = useState<boolean>(true);

	useEffect(() => {
		let isMounted = true;

		async function determineRole() {
			if (!campaignId) {
				if (isMounted) setLoading(false);
				return;
			}

			// 1. 如果是預設戰役，直接視為 DM 方便測試體驗
			if (campaignId === 'default') {
				if (isMounted) {
					setRole('dm');
					setLoading(false);
				}
				return;
			}

			// 2. 如果是訪客模式，預設給予 player 身分
			if (isGuest || !supabase) {
				if (isMounted) {
					setRole('player');
					setLoading(false);
				}
				return;
			}

			try {
				const currentUserId = user?.id;
				if (!currentUserId) {
					if (isMounted) {
						setRole('player');
						setLoading(false);
					}
					return;
				}

				// 3. 查詢 campaigns 主表，檢查是否為該戰役的 DM (dm_id)
				const { data: campaignData, error: campaignError } = await supabase
					.from('campaigns')
					.select('dm_id')
					.eq('id', campaignId)
					.single();

				if (
					!campaignError &&
					campaignData &&
					campaignData.dm_id === currentUserId
				) {
					if (isMounted) {
						setRole('dm');
						setLoading(false);
					}
					return;
				}

				// 4. 查詢 campaign_members 關聯表，檢查成員身分
				const { data: memberData, error: memberError } = await supabase
					.from('campaign_members')
					.select('role')
					.eq('campaign_id', campaignId)
					.eq('user_id', currentUserId)
					.single();

				if (!memberError && memberData) {
					if (isMounted) {
						setRole(memberData.role === 'dm' ? 'dm' : 'player');
						setLoading(false);
					}
					return;
				}

				// 5. 若皆不符合，預設為一般玩家或訪客
				if (isMounted) {
					setRole('player');
					setLoading(false);
				}
			} catch (err) {
				console.error('取得使用者戰役身分失敗:', err);
				if (isMounted) {
					setRole('player');
					setLoading(false);
				}
			}
		}

		determineRole();

		return () => {
			isMounted = false;
		};
	}, [campaignId, user, isGuest]);

	return {
		role,
		user,
		isDm: role === 'dm',
		isPlayer: role === 'player',
		loading,
	};
}
