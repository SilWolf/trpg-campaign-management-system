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

			// 訪客模式或未設定 Supabase 時，預設給予 player 身分。
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

				// 以 campaign_members.role 判斷戰役成員身分，支援多名 DM。
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

				// 若非戰役成員，預設為一般玩家。
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
