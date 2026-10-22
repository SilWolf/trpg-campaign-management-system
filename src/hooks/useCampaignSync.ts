import {
	useState,
	useEffect,
	useCallback,
	type SetStateAction,
	type Dispatch,
} from 'react';
import {
	supabase,
	isSupabaseConfigured,
	toDbItem,
	fromDbItem,
	toDbCharacter,
	fromDbCharacter,
	toDbPermission,
	fromDbPermission,
	type DbInventoryItem,
	type DbCharacter,
	type DbCharacterPermission,
} from '@/lib/supabase';
import type { Character, InventoryItem, CharacterPermission } from '@/types';

export type SyncStatus = 'offline' | 'connecting' | 'synced' | 'error';

export function useCampaignSync(
	campaignId: string,
	initialCharacters: Character[],
	initialItems: InventoryItem[],
) {
	const [characters, setCharactersState] =
		useState<Character[]>(initialCharacters);
	const [items, setItemsState] = useState<InventoryItem[]>(initialItems);
	const [permissions, setPermissionsState] = useState<CharacterPermission[]>(
		[],
	);
	const [syncStatus, setSyncStatus] = useState<SyncStatus>(
		isSupabaseConfigured ? 'connecting' : 'offline',
	);

	// 1. 初始化資料拉取
	useEffect(() => {
		if (!supabase || !campaignId) return;
		let isMounted = true;

		async function initData() {
			if (!supabase) return;
			try {
				const [
					{ data: charRows, error: charErr },
					{ data: itemRows, error: itemErr },
					{ data: permRows, error: permErr },
				] = await Promise.all([
					supabase.from('characters').select('*').eq('campaign_id', campaignId),
					supabase
						.from('inventory_items')
						.select('*')
						.eq('campaign_id', campaignId),
					supabase
						.from('character_permissions')
						.select('*')
						.eq('campaign_id', campaignId),
				]);

				if (charErr || itemErr || permErr) throw charErr || itemErr || permErr;

				if (!charRows || charRows.length === 0) {
					const charsWithCampaign = initialCharacters.map((c) => ({
						...toDbCharacter(c),
						campaign_id: campaignId,
					}));
					await supabase.from('characters').upsert(charsWithCampaign);
					if (isMounted) setCharactersState(initialCharacters);
				} else {
					const orderMap = new Map(
						initialCharacters.map((c, idx) => [c.id, idx]),
					);
					const loadedChars = (charRows as DbCharacter[])
						.map(fromDbCharacter)
						.sort(
							(a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99),
						);
					if (isMounted) setCharactersState(loadedChars);
				}

				if (!itemRows || itemRows.length === 0) {
					const itemsWithCampaign = initialItems.map((i) => ({
						...toDbItem(i),
						campaign_id: campaignId,
					}));
					await supabase.from('inventory_items').upsert(itemsWithCampaign);
					if (isMounted) setItemsState(initialItems);
				} else {
					if (isMounted) {
						setItemsState((itemRows as DbInventoryItem[]).map(fromDbItem));
					}
				}

				if (permRows && isMounted) {
					setPermissionsState(
						(permRows as DbCharacterPermission[]).map(fromDbPermission),
					);
				}

				if (isMounted) setSyncStatus('synced');
			} catch (err) {
				console.error('Supabase 初始同步失敗:', err);
				if (isMounted) setSyncStatus('error');
			}
		}

		initData();

		// 2. 訂閱 Realtime
		const channel = supabase
			.channel(`campaign-realtime-${campaignId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'characters',
					filter: `campaign_id=eq.${campaignId}`,
				},
				(payload) => {
					if (payload.eventType === 'DELETE') {
						const deletedId = (payload.old as { id: string }).id;
						setCharactersState((prev) =>
							prev.filter((c) => c.id !== deletedId),
						);
					} else {
						const updatedChar = fromDbCharacter(payload.new as DbCharacter);
						setCharactersState((prev) => {
							const exists = prev.some((c) => c.id === updatedChar.id);
							return exists
								? prev.map((c) => (c.id === updatedChar.id ? updatedChar : c))
								: [...prev, updatedChar];
						});
					}
				},
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'inventory_items',
					filter: `campaign_id=eq.${campaignId}`,
				},
				(payload) => {
					if (
						payload.eventType === 'INSERT' ||
						payload.eventType === 'UPDATE'
					) {
						const updatedItem = fromDbItem(payload.new as DbInventoryItem);
						setItemsState((prev) => {
							const exists = prev.some((i) => i.id === updatedItem.id);
							return exists
								? prev.map((i) => (i.id === updatedItem.id ? updatedItem : i))
								: [...prev, updatedItem];
						});
					} else if (payload.eventType === 'DELETE') {
						const deletedId = (payload.old as { id: string }).id;
						setItemsState((prev) => prev.filter((i) => i.id !== deletedId));
					}
				},
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'character_permissions',
					filter: `campaign_id=eq.${campaignId}`,
				},
				(payload) => {
					if (
						payload.eventType === 'INSERT' ||
						payload.eventType === 'UPDATE'
					) {
						const updatedPerm = fromDbPermission(
							payload.new as DbCharacterPermission,
						);
						setPermissionsState((prev) => {
							const exists = prev.some((p) => p.id === updatedPerm.id);
							return exists
								? prev.map((p) => (p.id === updatedPerm.id ? updatedPerm : p))
								: [...prev, updatedPerm];
						});
					} else if (payload.eventType === 'DELETE') {
						const deletedId = (payload.old as { id: string }).id;
						setPermissionsState((prev) =>
							prev.filter((p) => p.id !== deletedId),
						);
					}
				},
			)
			.subscribe();

		return () => {
			isMounted = false;
			supabase?.removeChannel(channel);
		};
	}, [campaignId, initialCharacters, initialItems]);

	// 封裝 setCharacters
	const setCharacters: Dispatch<SetStateAction<Character[]>> = useCallback(
		(updater) => {
			setCharactersState((prev) => {
				const next = typeof updater === 'function' ? updater(prev) : updater;

				if (supabase && campaignId) {
					const nextIds = new Set(next.map((c) => c.id));
					const deletedIds = prev
						.filter((c) => !nextIds.has(c.id))
						.map((c) => c.id);

					const changedChars = next.filter((char) => {
						const old = prev.find((p) => p.id === char.id);
						return !old || JSON.stringify(old) !== JSON.stringify(char);
					});

					(async () => {
						if (changedChars.length > 0) {
							const payload = changedChars.map((char) => ({
								...toDbCharacter(char),
								campaign_id: campaignId,
							}));
							await supabase.from('characters').upsert(payload);
						}

						if (deletedIds.length > 0) {
							await supabase
								.from('characters')
								.delete()
								.in('id', deletedIds)
								.eq('campaign_id', campaignId);
						}
					})();
				}

				return next;
			});
		},
		[campaignId],
	);

	// 封裝 setItems
	const setItems = useCallback(
		(updater: SetStateAction<InventoryItem[]>) => {
			setItemsState((prev) => {
				const next = typeof updater === 'function' ? updater(prev) : updater;
				if (supabase && campaignId) {
					const nextIds = new Set(next.map((i) => i.id));
					const deletedIds = prev
						.filter((p) => !nextIds.has(p.id))
						.map((p) => p.id);

					const upserted = next.filter((item) => {
						const old = prev.find((p) => p.id === item.id);
						return !old || JSON.stringify(old) !== JSON.stringify(item);
					});

					if (deletedIds.length > 0) {
						supabase
							.from('inventory_items')
							.delete()
							.in('id', deletedIds)
							.eq('campaign_id', campaignId)
							.then();
					}

					if (upserted.length > 0) {
						const payload = upserted.map((item) => ({
							...toDbItem(item),
							campaign_id: campaignId,
						}));
						supabase.from('inventory_items').upsert(payload).then();
					}
				}
				return next;
			});
		},
		[campaignId],
	);

	// 封裝 setPermissions
	const setPermissions = useCallback(
		(updater: SetStateAction<CharacterPermission[]>) => {
			setPermissionsState((prev) => {
				const next = typeof updater === 'function' ? updater(prev) : updater;
				if (supabase && campaignId) {
					const changed = next.filter((p) => {
						const old = prev.find((o) => o.id === p.id);
						return !old || JSON.stringify(old) !== JSON.stringify(p);
					});

					if (changed.length > 0) {
						const payload = changed.map((p) => toDbPermission(p));
						supabase.from('character_permissions').upsert(payload).then();
					}
				}
				return next;
			});
		},
		[campaignId],
	);

	return {
		characters,
		setCharacters,
		items,
		setItems,
		permissions,
		setPermissions,
		syncStatus,
	};
}
