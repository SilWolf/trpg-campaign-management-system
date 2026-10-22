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
	type DbInventoryItem,
	type DbCharacter,
} from '@/lib/supabase';
import type { Character, InventoryItem } from '@/types';

export type SyncStatus = 'offline' | 'connecting' | 'synced' | 'error';

export function useCampaignSync(
	campaignId: string,
	initialCharacters: Character[],
	initialItems: InventoryItem[],
) {
	const [characters, setCharactersState] =
		useState<Character[]>(initialCharacters);
	const [items, setItemsState] = useState<InventoryItem[]>(initialItems);
	const [syncStatus, setSyncStatus] = useState<SyncStatus>(
		isSupabaseConfigured ? 'connecting' : 'offline',
	);

	// 1. 根據 campaignId 初始載入與自動植入預設資料 (Auto-Seed)
	useEffect(() => {
		if (!supabase || !campaignId) return;
		let isMounted = true;

		async function initData() {
			if (!supabase) return;
			try {
				const [
					{ data: charRows, error: charErr },
					{ data: itemRows, error: itemErr },
				] = await Promise.all([
					supabase.from('characters').select('*').eq('campaign_id', campaignId),
					supabase
						.from('inventory_items')
						.select('*')
						.eq('campaign_id', campaignId),
				]);

				if (charErr || itemErr) throw charErr || itemErr;

				// 若該戰役在資料庫是空的，自動將 INITIAL_CHARACTERS 與 INITIAL_ITEMS 寫入並帶上 campaign_id
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

				if (isMounted) setSyncStatus('synced');
			} catch (err) {
				console.error('Supabase 初始同步失敗:', err);
				if (isMounted) setSyncStatus('error');
			}
		}

		initData();

		// 2. 訂閱 Supabase Realtime WebSockets（以 campaign_id 過濾）
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
			.subscribe();

		return () => {
			isMounted = false;
			supabase?.removeChannel(channel);
		};
	}, [campaignId, initialCharacters, initialItems]);

	// 3. 封裝 setCharacters：自動帶入 campaign_id 同步至 Supabase
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
							const { error: upsertErr } = await supabase
								.from('characters')
								.upsert(payload);
							if (upsertErr) console.error('更新角色同步失敗:', upsertErr);
						}

						if (deletedIds.length > 0) {
							const { error: delErr } = await supabase
								.from('characters')
								.delete()
								.in('id', deletedIds)
								.eq('campaign_id', campaignId);
							if (delErr) console.error('刪除角色同步失敗:', delErr);
						}
					})();
				}

				return next;
			});
		},
		[campaignId],
	);

	// 4. 封裝 setItems：自動帶入 campaign_id 同步至 Supabase
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
							.then(({ error }) => {
								if (error) console.error('刪除雲端物品失敗:', error);
							});
					}

					if (upserted.length > 0) {
						const payload = upserted.map((item) => ({
							...toDbItem(item),
							campaign_id: campaignId,
						}));
						supabase
							.from('inventory_items')
							.upsert(payload)
							.then(({ error }) => {
								if (error) console.error('同步雲端物品失敗:', error);
							});
					}
				}
				return next;
			});
		},
		[campaignId],
	);

	return { characters, setCharacters, items, setItems, syncStatus };
}
