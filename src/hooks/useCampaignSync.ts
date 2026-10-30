import {
	useState,
	useEffect,
	useCallback,
	useMemo,
	useRef,
	type SetStateAction,
	type Dispatch,
} from 'react';
import {
	supabase,
	toDbCampaignCurrency,
	fromDbCampaignCurrency,
	toDbItem,
	fromDbItem,
	toDbCharacter,
	fromDbCharacter,
	syncCharacterGpFromLegacyWallets,
	toDbPermission,
	fromDbPermission,
	type DbInventoryItem,
	type DbCharacter,
	type DbCharacterPermission,
	type CampaignCurrency,
	type DbCampaignCurrency,
} from '@/lib/supabase';
import {
	CAMP_CHEST_ID,
	type Character,
	type CharacterPermission,
	type InventoryItem,
} from '@/types';
import {
	INVENTORY_ITEM_SELECT,
	subscribeCampaignSecureChanges,
} from '@/lib/campaignShops';

const EMPTY_CURRENCY: CampaignCurrency = {
	pp: 0,
	gp: 0,
	ep: 0,
	sp: 0,
	cp: 0,
};

export type SyncStatus = 'offline' | 'connecting' | 'synced' | 'error';

export function useCampaignSync(
	campaignId: string,
	initialCharacters: Character[],
	initialItems: InventoryItem[],
	remoteEnabled: boolean,
) {
	const isRemoteCampaign = Boolean(supabase && remoteEnabled);
	const localCharacters = useMemo(
		() =>
			initialCharacters.map((character) => ({
				...character,
				campaignId,
			})),
		[campaignId, initialCharacters],
	);
	const localItems = useMemo(
		() => initialItems.map((item) => ({ ...item })),
		[initialItems],
	);
	const currencyWriteQueue = useRef<Promise<void>>(Promise.resolve());
	const lastQueuedCurrency = useRef<CampaignCurrency | null>(null);
	const [characters, setCharactersState] =
		useState<Character[]>(isRemoteCampaign ? [] : localCharacters);
	const [items, setItemsState] = useState<InventoryItem[]>(
		isRemoteCampaign ? [] : localItems,
	);
	const [campChestCurrency, setCampChestCurrencyState] =
		useState<CampaignCurrency>(
			isRemoteCampaign
				? EMPTY_CURRENCY
				: (initialCharacters.find((character) => character.id === CAMP_CHEST_ID)
						?.currencies ?? EMPTY_CURRENCY),
		);
	const [permissions, setPermissionsState] = useState<CharacterPermission[]>(
		[],
	);
	const [syncStatus, setSyncStatus] = useState<SyncStatus>(
		isRemoteCampaign ? 'connecting' : 'offline',
	);

	// 1. 初始化資料拉取
	useEffect(() => {
		if (!supabase || !isRemoteCampaign || !campaignId) return;
		const client = supabase;
		let isMounted = true;
		lastQueuedCurrency.current = null;
		// 切換戰役時先清掉上一個戰役的畫面資料，避免跨戰役短暫殘留。
		/* eslint-disable react-hooks/set-state-in-effect */
		setCharactersState([]);
		setItemsState([]);
		setCampChestCurrencyState(EMPTY_CURRENCY);
		setPermissionsState([]);
		setSyncStatus('connecting');
		/* eslint-enable react-hooks/set-state-in-effect */

		async function initData() {
			if (!supabase) return;
			try {
				const [
					{ data: campaignRow, error: campaignErr },
					{ data: charRows, error: charErr },
					{ data: itemRows, error: itemErr },
					{ data: permRows, error: permErr },
				] = await Promise.all([
					supabase
						.from('campaigns')
						.select('camp_chest_gp')
						.eq('id', campaignId)
						.single(),
					supabase.from('characters').select('*').eq('campaign_id', campaignId),
					supabase
						.from('inventory_items')
						.select(INVENTORY_ITEM_SELECT)
						.eq('campaign_id', campaignId),
					supabase
						.from('character_permissions')
						.select('*')
						.eq('campaign_id', campaignId),
				]);

				if (campaignErr || charErr || itemErr || permErr) {
					throw campaignErr || charErr || itemErr || permErr;
				}

				const loadedChars = ((charRows ?? []) as DbCharacter[])
					.filter((row) => row.id !== CAMP_CHEST_ID)
					.map(fromDbCharacter);
				const loadedItems = ((itemRows ?? []) as DbInventoryItem[]).map(
					fromDbItem,
				);
				const loadedCurrency = fromDbCampaignCurrency(campaignRow);
				if (isMounted) {
					setCharactersState(loadedChars);
					setItemsState(loadedItems);
					lastQueuedCurrency.current = loadedCurrency;
					setCampChestCurrencyState(loadedCurrency);
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

		void initData();

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
						try {
							const updatedChar = fromDbCharacter(
								payload.new as DbCharacter,
							);
							if (updatedChar.id === CAMP_CHEST_ID) return;
							setCharactersState((prev) => {
								const exists = prev.some((c) => c.id === updatedChar.id);
								return exists
									? prev.map((c) =>
											c.id === updatedChar.id ? updatedChar : c,
										)
									: [...prev, updatedChar];
							});
						} catch (error) {
							console.error('Realtime 角色 GP 資料無效：', error);
							if (isMounted) setSyncStatus('error');
						}
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
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'campaigns',
					filter: `id=eq.${campaignId}`,
				},
				(payload) => {
					const campaignRow = payload.new as DbCampaignCurrency;
					if (campaignRow.camp_chest_gp !== undefined) {
						try {
							const nextCurrency = fromDbCampaignCurrency(campaignRow);
							lastQueuedCurrency.current = nextCurrency;
							setCampChestCurrencyState(nextCurrency);
						} catch (error) {
							console.error('Realtime 營地箱 GP 資料無效：', error);
							if (isMounted) setSyncStatus('error');
						}
					}
				},
			)
			.subscribe();
		const secureChannel = subscribeCampaignSecureChanges(
			campaignId,
			() => {
				void (async () => {
					const { data, error } = await client
						.from('inventory_items')
						.select(INVENTORY_ITEM_SELECT)
						.eq('campaign_id', campaignId);
					if (error) throw error;
					if (isMounted) {
						setItemsState(((data ?? []) as DbInventoryItem[]).map(fromDbItem));
					}
				})().catch((error: unknown) => {
					console.error('戰役安全資料同步失敗：', error);
					if (isMounted) setSyncStatus('error');
				});
			},
			(error) => {
				console.error('戰役安全同步頻道失敗：', error);
				if (isMounted) setSyncStatus('error');
			},
		);

		return () => {
			isMounted = false;
			supabase?.removeChannel(channel);
			secureChannel();
		};
	}, [campaignId, isRemoteCampaign, initialCharacters, initialItems]);

	useEffect(() => {
		if (!supabase || !isRemoteCampaign || !campaignId) return;
		const previous = lastQueuedCurrency.current;
		if (!previous || JSON.stringify(previous) === JSON.stringify(campChestCurrency)) {
			return;
		}

		lastQueuedCurrency.current = campChestCurrency;
		const client = supabase;
		currencyWriteQueue.current = currencyWriteQueue.current
			.then(async () => {
				const { error } = await client
					.from('campaigns')
					.update(toDbCampaignCurrency(campChestCurrency))
					.eq('id', campaignId)
					.select('id')
					.single();
				if (error) throw error;
			})
			.catch((error: unknown) => {
				console.error('同步營地儲物箱錢包失敗：', error);
				setSyncStatus('error');
			});
	}, [campChestCurrency, campaignId, isRemoteCampaign]);

	// 封裝 setCharacters
	const setCharacters: Dispatch<SetStateAction<Character[]>> = useCallback(
		(updater) => {
			setCharactersState((prev) => {
				const next = (
					typeof updater === 'function' ? updater(prev) : updater
				).map(syncCharacterGpFromLegacyWallets);

				const persistedNext = isRemoteCampaign
					? next.filter((character) => character.id !== CAMP_CHEST_ID)
					: next;

				if (supabase && isRemoteCampaign && campaignId) {
					const nextIds = new Set(persistedNext.map((c) => c.id));
					const deletedIds = prev
						.filter((c) => !nextIds.has(c.id))
						.map((c) => c.id);

					const changedChars = persistedNext.filter((char) => {
						const old = prev.find((p) => p.id === char.id);
						return !old || JSON.stringify(old) !== JSON.stringify(char);
					});

					(async () => {
						if (changedChars.length > 0) {
							const payload = changedChars.map((char) => ({
								...toDbCharacter(char),
								campaign_id: campaignId,
							}));
							const { error } = await supabase
								.from('characters')
								.upsert(payload);
							if (error) throw error;
						}

						if (deletedIds.length > 0) {
							const { error } = await supabase
								.from('characters')
								.delete()
								.in('id', deletedIds)
								.eq('campaign_id', campaignId);
							if (error) throw error;
						}
					})().catch((error: unknown) => {
						console.error('同步戰役角色失敗：', error);
						setSyncStatus('error');
					});
				}

				return persistedNext;
			});
		},
		[campaignId, isRemoteCampaign],
	);

	// 封裝 setItems
	const setItems = useCallback(
		(updater: SetStateAction<InventoryItem[]>) => {
			setItemsState((prev) => {
				const next = typeof updater === 'function' ? updater(prev) : updater;
				if (supabase && isRemoteCampaign && campaignId) {
					const client = supabase;
					const nextIds = new Set(next.map((i) => i.id));
					const deletedIds = prev
						.filter((p) => !nextIds.has(p.id))
						.map((p) => p.id);

					const upserted = next.filter((item) => {
						const old = prev.find((p) => p.id === item.id);
						return !old || JSON.stringify(old) !== JSON.stringify(item);
					});
					const insertedItems = upserted.filter(
						(item) => !prev.some((existing) => existing.id === item.id),
					);
					const updatedItems = upserted.filter((item) =>
						prev.some((existing) => existing.id === item.id),
					);

					const syncItems = async () => {
						if (deletedIds.length > 0) {
							const { error } = await client
								.from('inventory_items')
								.delete()
								.in('id', deletedIds)
								.eq('campaign_id', campaignId);
							if (error) throw error;
						}

						if (insertedItems.length > 0) {
							const payload = insertedItems.map((item) => ({
								...toDbItem(
									item.ownerId === CAMP_CHEST_ID
										? { ...item, isPrivate: false }
										: item,
								),
								campaign_id: campaignId,
							}));
							const { error } = await client
								.from('inventory_items')
								.insert(payload);
							if (error) throw error;
						}
						for (const item of updatedItems) {
							const dbItem = toDbItem(
								item.ownerId === CAMP_CHEST_ID
									? { ...item, isPrivate: false }
									: item,
							);
							const { id, is_identified, ...updatePayload } = dbItem;
							void is_identified;
							const { error } = await client
								.from('inventory_items')
								.update(updatePayload)
								.eq('id', id)
								.eq('campaign_id', campaignId);
							if (error) throw error;
						}
					};
					void syncItems().catch((error: unknown) => {
						console.error('同步戰役物品失敗：', error);
						setSyncStatus('error');
					});
				}
				return next;
			});
		},
		[campaignId, isRemoteCampaign],
	);

	const refreshItems = useCallback(
		async (itemIds: readonly string[]) => {
			if (itemIds.length === 0) return;
			if (!supabase || !isRemoteCampaign || !campaignId) {
				throw new Error('重新載入派發物品需要連線至戰役伺服器。');
			}
			const uniqueItemIds = [...new Set(itemIds)];
			const { data, error } = await supabase
				.from('inventory_items')
				.select(INVENTORY_ITEM_SELECT)
				.eq('campaign_id', campaignId)
				.in('id', uniqueItemIds);
			if (error) throw error;

			const refreshedItems = ((data ?? []) as DbInventoryItem[]).map(fromDbItem);
			const refreshedIds = new Set(refreshedItems.map((item) => item.id));
			if (uniqueItemIds.some((id) => !refreshedIds.has(id))) {
				throw new Error('派發完成，但有物品尚未出現在目前戰役背包。');
			}
			setItemsState((previous) => {
				const refreshedById = new Map(
					refreshedItems.map((item) => [item.id, item]),
				);
				return previous.map((item) => refreshedById.get(item.id) ?? item).concat(
					refreshedItems.filter(
						(item) => !previous.some((existing) => existing.id === item.id),
					),
				);
			});
		},
		[campaignId, isRemoteCampaign],
	);

	const setCampChestCurrency: Dispatch<SetStateAction<CampaignCurrency>> =
		useCallback((updater) => {
			setCampChestCurrencyState(updater);
		}, []);

	// 封裝 setPermissions
	const setPermissions = useCallback(
		(updater: SetStateAction<CharacterPermission[]>) => {
			setPermissionsState((prev) => {
				const next = typeof updater === 'function' ? updater(prev) : updater;
				if (supabase && isRemoteCampaign && campaignId) {
					const changed = next.filter((p) => {
						const old = prev.find((o) => o.id === p.id);
						return !old || JSON.stringify(old) !== JSON.stringify(p);
					});

					if (changed.length > 0) {
						const client = supabase;
						const payload = changed.map((p) => toDbPermission(p));
						void (async () => {
							const { error } = await client
								.from('character_permissions')
								.upsert(payload);
							if (error) throw error;
						})().catch((error: unknown) => {
								console.error('同步角色權限失敗：', error);
								setSyncStatus('error');
							});
					}
				}
				return next;
			});
		},
		[campaignId, isRemoteCampaign],
	);

	return {
		characters,
		setCharacters,
		items,
		setItems,
		refreshItems,
		permissions,
		setPermissions,
		campChestCurrency,
		setCampChestCurrency,
		syncStatus,
		isRemoteCampaign,
	};
}
