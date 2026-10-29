/* eslint-disable react-refresh/only-export-components -- Context 同時匯出 Provider 與 Hook。 */
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCampaignRole } from '@/hooks/useUserCampaignRole';
import { loadCampaignJourneys } from '@/lib/campaignJourneys';
import {
	fromDbPermission,
	isSupabaseConfigured,
	supabase,
	type DbCharacterPermission,
} from '@/lib/supabase';
import type {
	CampaignJourney,
	CampaignJourneyListFilter,
	CharacterPermission,
} from '@/types';

export interface JourneyCharacter {
	id: string;
	name: string;
	userId: string;
}

interface CampaignJourneysContextValue {
	campaignId: string;
	journeys: CampaignJourney[];
	setJourneys: Dispatch<SetStateAction<CampaignJourney[]>>;
	characters: JourneyCharacter[];
	permissions: CharacterPermission[];
	isDm: boolean;
	roleLoading: boolean;
	userId: string | null;
	isGuest: boolean;
	loading: boolean;
	errorMessage: string | null;
	availabilityMessage: string | null;
	filter: CampaignJourneyListFilter;
	setFilter: Dispatch<SetStateAction<CampaignJourneyListFilter>>;
	characterFilter: string;
	setCharacterFilter: Dispatch<SetStateAction<string>>;
	tagFilter: string;
	setTagFilter: Dispatch<SetStateAction<string>>;
}

const CampaignJourneysContext =
	createContext<CampaignJourneysContextValue | null>(null);

export function CampaignJourneysProvider({
	campaignId,
	children,
}: {
	campaignId: string;
	children: ReactNode;
}) {
	const { user, isGuest, loading: authLoading } = useAuth();
	const { isDm, loading: roleLoading } = useUserCampaignRole(campaignId);
	const identityKey = JSON.stringify([campaignId, user?.id ?? null, isGuest]);
	const [journeys, setJourneys] = useState<CampaignJourney[]>([]);
	const [characters, setCharacters] = useState<JourneyCharacter[]>([]);
	const [permissions, setPermissions] = useState<CharacterPermission[]>([]);
	const [dataIdentityKey, setDataIdentityKey] = useState('');
	const [loading, setLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [filter, setFilter] = useState<CampaignJourneyListFilter>('all');
	const [characterFilter, setCharacterFilter] = useState('');
	const [tagFilter, setTagFilter] = useState('');
	const requestVersion = useRef(0);
	const journeyRequestVersion = useRef(0);
	const availabilityMessage = !isSupabaseConfigured
		? '冒險筆記需要設定 Supabase 並登入；離線模式不會建立本機筆記或假冒雲端同步。'
		: isGuest
			? '訪客模式無法存取戰役筆記。請登入戰役帳號後再試。'
			: null;

	const reload = useCallback(async () => {
		const version = ++requestVersion.current;
		const journeyVersion = ++journeyRequestVersion.current;
		setDataIdentityKey(identityKey);
		setJourneys([]);
		setCharacters([]);
		setPermissions([]);
		setErrorMessage(null);
		if (authLoading) {
			setLoading(true);
			return;
		}
		if (!isSupabaseConfigured || isGuest || !user?.id || !supabase) {
			setLoading(false);
			return;
		}

		setLoading(true);
		setErrorMessage(null);
		try {
			const [nextJourneys, characterResult, permissionResult] =
				await Promise.all([
					loadCampaignJourneys(campaignId),
					supabase
						.from('characters')
						.select('id,name,user_id')
						.eq('campaign_id', campaignId),
					supabase
						.from('character_permissions')
						.select(
							'id,campaign_id,character_id,user_id,public_bag_access,private_bag_access,public_wallet_access,private_wallet_access,journey_access,can_edit_profile,can_delete_character,can_manage_permissions',
						)
						.eq('campaign_id', campaignId),
				]);
			if (characterResult.error) throw characterResult.error;
			if (permissionResult.error) throw permissionResult.error;
			if (
				version !== requestVersion.current
			) return;
			if (journeyVersion === journeyRequestVersion.current) {
				setJourneys(nextJourneys);
			}
			setCharacters(
				(characterResult.data ?? []).map((character) => ({
					id: character.id,
					name: character.name,
					userId: character.user_id,
				})),
			);
			setPermissions(
				((permissionResult.data ?? []) as DbCharacterPermission[]).map(
					fromDbPermission,
				),
			);
		} catch (error) {
			if (
				version !== requestVersion.current
			) return;
			setJourneys([]);
			setCharacters([]);
			setPermissions([]);
			setErrorMessage(
				error instanceof Error ? error.message : '載入冒險筆記失敗。',
			);
		} finally {
			if (version === requestVersion.current) setLoading(false);
		}
	}, [authLoading, campaignId, identityKey, isGuest, user?.id]);

	const refreshJourneys = useCallback(async () => {
		if (!isSupabaseConfigured || isGuest || !user?.id || !supabase) return;
		const version = ++journeyRequestVersion.current;
		try {
			const nextJourneys = await loadCampaignJourneys(campaignId);
			if (version === journeyRequestVersion.current) {
				setJourneys(nextJourneys);
				setErrorMessage(null);
			}
		} catch (error) {
			if (version === journeyRequestVersion.current) {
				setErrorMessage(
					error instanceof Error ? error.message : '同步冒險筆記失敗。',
				);
			}
		}
	}, [campaignId, isGuest, user?.id]);

	useEffect(() => {
		void Promise.resolve().then(reload);
		return () => {
			requestVersion.current += 1;
			journeyRequestVersion.current += 1;
		};
	}, [reload]);

	useEffect(() => {
		if (
			authLoading ||
			!isSupabaseConfigured ||
			isGuest ||
			!user?.id ||
			!supabase
		) {
			return;
		}

		const channel = supabase
			.channel(`campaign-journeys-${campaignId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'campaign_journeys',
					filter: `campaign_id=eq.${campaignId}`,
				},
				() => {
					void refreshJourneys();
				},
			)
			.subscribe();

		return () => {
			void supabase?.removeChannel(channel);
		};
	}, [authLoading, campaignId, isGuest, refreshJourneys, user?.id]);

	const hasCurrentIdentityData = dataIdentityKey === identityKey;
	const value = useMemo(
		() => ({
			campaignId,
			journeys: hasCurrentIdentityData ? journeys : [],
			setJourneys,
			characters: hasCurrentIdentityData ? characters : [],
			permissions: hasCurrentIdentityData ? permissions : [],
			isDm,
			roleLoading,
			userId: user?.id ?? null,
			isGuest,
			loading: loading || authLoading || !hasCurrentIdentityData,
			errorMessage: hasCurrentIdentityData ? errorMessage : null,
			availabilityMessage,
			filter,
			setFilter,
			characterFilter,
			setCharacterFilter,
			tagFilter,
			setTagFilter,
		}),
		[
			availabilityMessage,
			authLoading,
			campaignId,
			characters,
			characterFilter,
			errorMessage,
			filter,
			hasCurrentIdentityData,
			isDm,
			isGuest,
			journeys,
			loading,
			permissions,
			roleLoading,
			tagFilter,
			user?.id,
		],
	);

	return (
		<CampaignJourneysContext.Provider value={value}>
			{children}
		</CampaignJourneysContext.Provider>
	);
}

export function useCampaignJourneys() {
	const context = useContext(CampaignJourneysContext);
	if (!context) {
		throw new Error(
			'useCampaignJourneys 必須在 CampaignJourneysProvider 內使用。',
		);
	}
	return context;
}
