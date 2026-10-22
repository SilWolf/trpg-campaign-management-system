import {
	useState,
	useEffect,
	useCallback,
	useRef,
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
} from '../lib/supabase';
import type { Character, InventoryItem } from '../types';

export type SyncStatus = 'offline' | 'connecting' | 'synced' | 'error';

export function useCampaignSync(
	initialCharacters: Character[],
	initialItems: InventoryItem[],
) {
	const [characters, setCharactersState] =
		useState<Character[]>(initialCharacters);
	const [items, setItemsState] = useState<InventoryItem[]>(initialItems);
	const [syncStatus, setSyncStatus] = useState<SyncStatus>(
		isSupabaseConfigured ? 'connecting' : 'offline',
	);

	const itemsRef = useRef<InventoryItem[]>(items);
	itemsRef.current = items;

	const charactersRef = useRef<Character[]>(characters);
	charactersRef.current = characters;

	// 1. 初始載入與自動植入預設資料 (Auto-Seed)
	useEffect(() => {
		if (!supabase) return;
		let isMounted = true;

		async function initData() {
			if (!supabase) return;
			try {
				const [
					{ data: charRows, error: charErr },
					{ data: itemRows, error: itemErr },
				] = await Promise.all([
					supabase.from('characters').select('*'),
					supabase.from('inventory_items').select('*'),
				]);

				if (charErr || itemErr) throw charErr || itemErr;

				// 若資料庫是空的，自動將 INITIAL_CHARACTERS 與 INITIAL_ITEMS 寫入雲端
				if (!charRows || charRows.length === 0) {
					await supabase
						.from('characters')
						.upsert(initialCharacters.map(toDbCharacter));
					if (isMounted) setCharactersState(initialCharacters);
				} else {
					// 依照初始角色順序排列
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
					await supabase
						.from('inventory_items')
						.upsert(initialItems.map(toDbItem));
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

		// 2. 訂閱 Supabase Realtime WebSockets 即時更新
		const channel = supabase
			.channel('dnd5r-campaign-realtime')
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'characters' },
				(payload) => {
					if (payload.eventType === 'DELETE') {
						const deletedId = (payload.old as { id: string }).id;
						setCharactersState((prev) =>
							prev.filter((c) => c.id !== deletedId),
						);
					} else {
						const updatedChar = toDbCharacter(payload.new as DbCharacter);
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
				{ event: '*', schema: 'public', table: 'inventory_items' },
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
	}, [initialCharacters, initialItems]);

	// 3. 封裝 setCharacters：樂觀更新畫面 + 自動同步被修改的角色至 Supabase
	const setCharacters: Dispatch<SetStateAction<Character[]>> = useCallback(
		(updater) => {
			setCharactersState((prev) => {
				const next = typeof updater === 'function' ? updater(prev) : updater;

				if (supabase) {
					// 1. 找出被刪除的角色 ID
					const nextIds = new Set(next.map((c) => c.id));
					const deletedIds = prev
						.filter((c) => !nextIds.has(c.id))
						.map((c) => c.id);

					// 2. 若有被刪除的角色，同步從 Supabase characters 表移除
					if (deletedIds.length > 0) {
						supabase
							.from('characters')
							.delete()
							.in('id', deletedIds)
							.then(({ error }) => {
								if (error) console.error('刪除角色同步失敗:', error);
							});
					}

					// 3. Upsert 留存或更新的角色 (例如接收了遺產金幣的 camp-chest)
					if (next.length > 0) {
						const dbRows = next.map(toDbCharacter); // 對齊你 supabase.ts 的轉換函式名
						supabase
							.from('characters')
							.upsert(dbRows)
							.then(({ error }) => {
								if (error) console.error('更新角色同步失敗:', error);
							});
					}
				}

				return next;
			});
		},
		[],
	);

	// 4. 封裝 setItems：樂觀更新畫面 + 自動比對新增/修改/刪除的物品並同步至 Supabase
	const setItems = useCallback((updater: SetStateAction<InventoryItem[]>) => {
		setItemsState((prev) => {
			const next = typeof updater === 'function' ? updater(prev) : updater;
			if (supabase) {
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
						.then(({ error }) => {
							if (error) console.error('刪除雲端物品失敗:', error);
						});
				}

				if (upserted.length > 0) {
					supabase
						.from('inventory_items')
						.upsert(upserted.map(toDbItem))
						.then(({ error }) => {
							if (error) console.error('同步雲端物品失敗:', error);
						});
				}
			}
			return next;
		});
	}, []);

	return { characters, setCharacters, items, setItems, syncStatus };
}
