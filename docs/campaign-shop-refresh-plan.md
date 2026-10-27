# 戰役商店：刷新與刷新政策開發規劃

## 目標

在戰役商店 DM 設定中新增「店舖刷新政策」編輯介面，以及依政策產生預覽、重新隨機和確認套用的「店舖刷新」流程。刷新可補充既有商品庫存，或依 DM 設定產生新的商品清單；在 DM 確認前，不得變更目前商店資料。

本功能沿用既有戰役商店、商品快照、官方鍛造工坊目錄及 DM 權限。不新增玩家購買規則，不把商店商品改成全域資料，也不因刷新而刪除歷史訂單。

## 現況與設計邊界

- 商店及商品目前分別儲存在 `campaign_shops`、`campaign_shop_items`；商品的 `item_snapshot` 是獨立快照，來源識別由 `source_type`、`source_id` 記錄。
- DM 商店管理頁位於 `/campaigns/$campaignId/shops/$shopId/settings`。目前新增商品時以鍛造工坊來源商品價值作為初始售價（最低 `0.01 gp`），可手動調整售價、庫存、審查及啟用狀態。
- 官方目錄由 `loadBlacksmithCatalogDefinitions()` 和 `loadBlacksmithCatalogs(catalogId)` 讀取；目錄篩選應與鍛造工坊官方目錄頁採用相同的搜尋、稀有度及分類語意，不另外實作一套互不相容的搜尋規則。
- 商品刪除可能連帶影響訂單關聯。因此刷新不直接刪除舊商品列；已建立的商品快照和訂單紀錄必須保留。
- 商店目前遠端功能要求已設定 Supabase 且非訪客模式。本功能沿用此限制；不得假裝刷新已成功或只在本地產生遠端商店資料。

## 政策資料合約

建議政策型別：

```ts
interface CampaignShopRefreshPolicy {
	flags: {
		keepItemsOnRefresh: boolean;
	};
	rules: CampaignShopRefreshRule[];
}

interface CampaignShopRefreshRule {
	possibleItemsOrFilters: Array<
		| BlacksmithItem
		| {
				source: string;
				param: {
					search?: string;
					rarity?: Rarity;
					category?: ItemCategory;
				};
		  }
	>;
	pickCount: number | null | CampaignShopRefreshRange;
	stockAvailable: CampaignShopRefreshRange;
}

interface CampaignShopRefreshRange {
	min?: number;
	max?: number | null;
	p?: number;
	step?: number;
}
```

此型別是規劃示意；實作時以 `itemId` 辨識 `BlacksmithItem`、以 `source` 與 `param` 辨識篩選器，並在執行時完整驗證各自的必要欄位。

### 欄位語意與預設值

| 欄位                           | 規則                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `flags.keepItemsOnRefresh`    | 預設 `false`。`true` 時保留既有商品，再套用這次選取結果；`false` 時將既有商品從可購買目錄中退役，再建立本次選取的商品列。                 |
| `rules`                        | 依序處理；允許空陣列，空陣列表示政策不會新增候選商品。                                                                                  |
| `possibleItemsOrFilters`       | 每筆為指定的 `BlacksmithItem` 或官方目錄篩選器。篩選器的 `source` 必須是目錄索引中存在的 `catalogId`。                                 |
| `pickCount`                    | `null` 或省略代表選取該規則全部去重後的候選商品；數值物件代表隨機抽取數量。舊版純數字若需相容，代表固定抽取該數量。                     |
| `stockAvailable`               | 每個被選中的商品各自抽取一次可用庫存數量。                                                                                              |
| `min`                          | 非負安全整數，預設 `0`。                                                                                                                |
| `max`                          | 非負安全整數或 `null`；未指定／`null` 表示不設額外上限，但仍受商品候選數量或資料庫整數範圍限制。`stockAvailable.max` 未指定時預設 `1`。 |
| `p`                            | `0 < p <= 1`，預設 `1`。每次亂數結果 `Math.random() >= p` 時，數量增加一個 `step`；`p = 1` 表示不增加。                                 |
| `step`                         | 大於或等於 `1` 的安全整數，預設 `1`。                                                                                                   |

範圍物件的 `min` 不得大於有限的 `max`。`pickCount` 物件產生的數量不得超過候選總數；`stockAvailable` 不得超過資料庫 `integer` 上限。若未明確輸入 `max`，生成器必須有候選數量或資料庫上限作為迴圈上界。

## 刷新生成規則

1. **建立候選集**
   - 商品項目直接以政策中完整的 `BlacksmithItem` 作為候選。
   - 篩選器只對其 `source` 指定的官方目錄執行。搜尋、稀有度、分類分別沿用目錄頁現有行為；未指定篩選條件表示不以該條件限制。
   - 目錄載入失敗、來源 `catalogId` 無效或政策格式錯誤時，明確顯示錯誤並停止生成，不得略過失敗規則後仍回報成功。
2. **去除重複候選**
   - 以 `itemId` 作全規則去重依據。相同 `itemId` 只保留第一個出現的候選，順序以政策規則及來源陣列順序為準。
   - 候選須保留目錄來源 `catalogId`，供建立商店商品的 `sourceType: 'catalog'`、`sourceId` 及追蹤用途；商品快照使用現有的 `CampaignShopItemSnapshot` 轉換器。
3. **依 `pickCount` 抽選**
   - `null`／省略時全選；範圍物件先從 `min` 開始，每次 `Math.random() >= p` 增加 `step`，直到隨機條件停止或達到 `max`／候選總數。
   - 從候選集中不重複、等機率抽樣指定數量；不得以排序前 N 筆取代隨機抽樣。
   - 規則各自抽選後，再以 `itemId` 做一次全域去重；同商品同一刷新最多產生一筆商品與一筆庫存抽樣。
4. **抽取庫存**
   - 每個最終選中的商品獨立依 `stockAvailable` 範圍抽樣一次。
   - 抽樣庫存是該商品刷新後的「可用庫存目標」，不是把抽樣數字加到既有可用庫存上；`stock_reserved` 不由刷新器改寫。
5. **產生預覽**
   - 預覽列出商品名稱、稀有度、分類、來源、套用規則、售價、刷新後可用庫存，以及新增／補貨／保留／退役的預計動作。
   - DM 可再次隨機生成完整新預覽；再次生成只替換暫存預覽，不寫入資料庫。
   - 生成器接受可替換的亂數來源，確保單元測試可重現抽樣結果；正式 UI 使用 `Math.random()`。
6. **確認並套用**
   - DM 最後確認時，才將預覽中的變更送往單次資料庫交易。
   - 套用失敗時整筆回滾，畫面顯示錯誤並保留可重試的預覽；不可部分新增商品或先退役舊商品後才失敗。
   - 成功後重新載入商店及商品資料，顯示成功提示並讓既有 Realtime 訂閱同步其他成員畫面。

## 商品與訂單生命週期規則

刷新不得刪除 `campaign_shop_items` 列或其關聯訂單，也不得重寫訂單快照。

| 刷新情境                                      | 商品處理                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keepItemsOnRefresh = false`                  | 將刷新前既有商品設為 `is_active = false`、`stock_available = 0`，再建立本次選取的商品列。保留原商品列的 `stock_reserved` 和歷史訂單。                               |
| `keepItemsOnRefresh = true`，商品未被選中     | 商品列、庫存、啟用狀態及保留庫存維持不變。                                                                                                                          |
| 保留模式下選中已有相同來源商品                | 以 `source_type = 'catalog'` 及 `source_id = catalogId:itemId` 對應既有列，將 `stock_available` 設為本次抽樣值；保留其商品 ID、售價、審查設定、保留庫存及歷史訂單。 |
| 商品被選中但商店中不存在                      | 建立新商品列，使用既有目錄匯入轉換器；初始售價沿用目錄商品價值（最低 `0.01 gp`），審查預設關閉，商品啟用。                                                          |
| 清除模式下選中已有商品                        | 建立新商品列，避免重新啟用舊列而改變其歷史訂單意義；舊列及保留庫存仍保留供待審訂單處理。                                                                            |

刷新不自動取消待審訂單、不釋放待審保留庫存，也不改變訂單核准／拒絕流程。刷新完成後，DM 仍依既有待審訂單介面處理這些訂單。若資料庫交易 RPC 對停用商品的待審訂單核准有額外限制，實作前需確認其行為並確保退役商品不會導致保留訂單遭靜默丟失。

## 持久化、授權與一致性

### 政策儲存

- 在 `campaign_shops` 增加 `refresh_policy jsonb NOT NULL`，並由增量 migration 提供預設政策（清除模式、空規則）。若現有 schema 的命名或預設慣例有不同，依 migration 實際內容調整，但不得把政策寫入商品 `item_snapshot`。
- 在 `src/types.ts` 定義政策／規則／範圍型別；於 `src/lib/supabase.ts` 的商店轉換器完成 `refresh_policy` ↔ `refreshPolicy` 對應、執行時驗證及舊資料 fallback。
- 在 `src/lib/campaignShops.ts` 由商店建立與更新資料服務一併讀寫政策；載入或儲存錯誤須明確回報。
- 政策儲存和套用時均須驗證數值範圍、目錄 ID、必要欄位、候選商品快照及有效的商品來源識別，不可只信任前端表單。

### 刷新交易

- 新增受授權的資料庫 RPC，建議以 `refresh_campaign_shop_items` 為名。RPC 驗證呼叫者是所屬戰役 DM、戰役／商店 ID 一致，並在單一交易內鎖定商店及其商品資料、處理退役／補貨／新增。
- RPC 接收已確認的預覽變更，但需在伺服器端驗證其結構、ID、金額、庫存及目標商店；呼叫者未獲 DM 授權時必須拒絕。刷新不是以多次前端 `.insert()`／`.update()` 模擬交易。
- 同時刷新政策或商品資料可能造成預覽過期。最小方案是在預覽保存政策／商店 `updated_at` 或明確版本；確認時若版本已改變，拒絕舊預覽並要求重新載入／生成，不得覆蓋較新的資料。
- RPC 必須保留庫存保留量與訂單外鍵；不對 `campaign_shop_orders` 做更新或刪除。
- Realtime 仍透過現有 `campaign_shops`、`campaign_shop_items` 事件同步。若單次交易事件會導致多次重載，前端可合併同一刷新事件的載入，但不得因此隱藏錯誤。

## UI 與使用流程

1. 在商店設定頁新增「刷新政策」區塊／分頁，僅 DM 可操作。
2. DM 可設定清除舊商品選項，新增／刪除規則，並在每條規則中選擇指定目錄商品或目錄篩選器。
3. 篩選器可指定官方目錄、搜尋字串、稀有度及分類；提供與官方目錄相同的分類／稀有度中文標籤。
4. 以數字欄位設定 `pickCount` 與庫存範圍的 `min`、`max`、`p`、`step`；提供預設值、欄位驗證及易懂的 `p` 說明，避免把它誤解為「額外增加的機率」。
5. 政策先明確儲存，再可按「預覽刷新」。預覽載入中、空候選、載入失敗、驗證失敗及成功狀態均要明確顯示。
6. 預覽畫面提供「重新隨機」與「確認刷新」；確認前顯示影響數量及舊商品退役提示。若本次結果為零項，確認按鈕要求再次確認，避免誤清空目錄。
7. 操作期間防止重複送出；成功後更新本地頁面資料，失敗時不清除預覽。DM 以外成員看不到政策編輯與刷新控制。

採用既有深色奇幻商店管理介面、繁體中文提示及專案現有錯誤處理方式。路由檔案保留規範要求的 ESLint 註解，不手動修改自動生成的 `src/routeTree.gen.ts`。

## 實作分階段

### 階段一：資料合約與資料庫

1. 新增政策型別、預設值、驗證函式及舊格式相容轉換。
2. 新增 `campaign_shops.refresh_policy` 欄位與預設政策 migration。
3. 更新商店讀寫轉換器及資料服務。
4. 新增授權檢查完整、可原子退役／新增／補貨的刷新 RPC。
5. 檢查政策 JSON 欄位約束、DM 權限、campaign 隔離、鎖定順序、訂單外鍵及 Realtime publication。

**完成條件：** 舊商店讀取正常；未授權呼叫被拒；RPC 成功時完整套用、任一錯誤時全數回滾；既有訂單及 `stock_reserved` 保持完整。

**本機實作紀錄（2026-10-27）**

- 已完成政策型別、清除模式預設值、執行時驗證及舊商店缺少 `refresh_policy` 時的相容 fallback，實作於 [`src/types.ts`](../src/types.ts)、[`src/lib/campaignShopRefresh.ts`](../src/lib/campaignShopRefresh.ts) 與 [`src/lib/supabase.ts`](../src/lib/supabase.ts)。
- 新增 [`supabase/migrations/20261027000001_campaign_shop_refresh.sql`](../supabase/migrations/20261027000001_campaign_shop_refresh.sql)：加入 `campaign_shops.refresh_policy`、JSONB 結構與範圍檢查、authenticated 欄位權限，以及 `refresh_campaign_shop_items` DM 專用交易 RPC。
- 商店資料服務已支援儲存政策和呼叫刷新 RPC，實作於 [`src/lib/campaignShops.ts`](../src/lib/campaignShops.ts)。確認刷新時以商店 `updated_at` 及全部商品的 ID／`updated_at` 快照拒絕過期預覽，依「商店列 → 商品列 ID 順序」鎖定；資料庫交易會整批退役／新增／補貨，保留 `stock_reserved`、商品列及訂單關聯。
- 官方目錄 ID 在前端儲存政策與組裝 RPC 變更時會對照 `catalog-index.json`；資料庫沒有官方目錄索引資料表，因此 RPC 只驗證來源識別格式及商品是否屬於當前政策列出的目錄／指定商品，不能獨立證明該目錄 ID 仍存在於靜態目錄索引。候選解析階段仍必須再次驗證目錄和商品來源。
- 已新增商店資料轉換 E2E 覆蓋政策序列化、舊商店 fallback、無效目錄及庫存上限，位於 [`tests/e2e/campaign-shop-data.spec.ts`](../tests/e2e/campaign-shop-data.spec.ts)。
- 已同步更新 [`docs/campaign-shop-deployment.md`](./campaign-shop-deployment.md)，加入新 migration 的唯讀 schema／RPC 權限檢查，以及 DM 授權、過期預覽、回滾、待審保留庫存和 Realtime 的隔離驗收步驟。
- 本機驗證：`npm run typecheck`、`npm run build`、`npm run test:e2e -- tests/e2e/campaign-shop-data.spec.ts`（2 項通過）；E2E 執行時並行 Lint 曾碰到 Playwright 清理 `test-results` 的掃描競態，之後單獨重跑 `npm run lint` 成功，只有商店路由既有的 unused eslint-disable 警告。
- **部署與資料庫驗收尚未完成。** 尚未在 Supabase 套用 migration，也未對隔離環境實測 RLS／非 DM 拒絕、原子回滾、併發過期預覽及 Realtime；因此目前只標記為「本機實作完成」，上述完成條件仍待維護者手動部署與驗收。

### 階段二：候選解析與抽樣

1. 建立純函式候選解析／去重／抽樣模組，重用官方目錄載入器與搜尋語意。
2. 支援亂數來源注入，覆蓋 `p` 邊界、`min`／`max`／`step`、候選不足、重複 itemId、空目錄及錯誤政策。
3. 建立候選 BlacksmithItem 到商店商品快照及來源識別的轉換，重用現有匯入規則。
4. 產生不寫入資料庫的預覽模型，計算既有商品的預計操作及刷新後可用庫存。

**完成條件：** 同一亂數輸入可得到穩定結果；抽選不重複且不超出上限；任何來源解析錯誤都不回傳部分成功結果。

### 階段三：DM 政策編輯與刷新 UI

1. 在商店設定頁加入政策載入、編輯、驗證及儲存。
2. 加入目錄商品選擇與篩選器設定，確保只能選擇已載入的有效 `catalogId`。
3. 加入預覽、重新隨機、空結果警告及確認刷新流程。
4. 確認操作呼叫單一刷新 RPC；成功後重新載入商店／商品，並使用 Realtime 傳遞更新。
5. 加入 DM 權限、訪客模式、無 Supabase、載入錯誤、RPC 失敗及重複點擊的 UI 行為。

**完成條件：** DM 可完成「編輯政策 → 預覽 → 重抽 → 確認」全流程；確認前資料未改變；一般成員沒有刷新操作；更新錯誤有明確提示。

### 階段四：測試、部署與驗收

- 單元測試：政策驗證、舊格式轉換、官方目錄篩選、候選去重、隨機選取、庫存抽樣、快照轉換。
- 元件／E2E 測試：政策欄位驗證、保存與重新載入、預覽重抽、確認／取消、零結果警告、一般成員不可操作及錯誤提示。
- RPC／隔離環境測試：DM 與非 DM 授權、跨戰役隔離、同時刷新／編輯衝突、交易回滾、已完成訂單保留、待審保留庫存不變及 Realtime 更新。
- 執行專案既有 `npm run typecheck`、`npm run lint`、相關 E2E 與 `npm run build`。
- 新 migration 及 RPC 依商店部署文件流程，在維護者確認的隔離 Supabase 專案手動驗收及部署；mock E2E 不可宣稱等同真實 RLS、Realtime 或資料庫交易驗收。

## 驗收清單

- [ ] DM 可儲存、修改及重新載入商店刷新政策；舊商店可使用預設政策正常載入。
- [ ] `keepItemsOnRefresh` 的保留／清除行為符合政策，舊商品及歷史訂單不被刪除。
- [ ] 指定商品及官方目錄 filter 均可加入候選；filter 僅查詢其指定目錄並遵循官方目錄既有搜尋語意。
- [ ] 相同 `itemId` 的候選只產生一個結果；隨機抽樣不重複且受到 `pickCount`、候選總數及庫存上下界限制。
- [ ] 每項商品庫存獨立抽樣；`p = 1` 不會額外增加，且所有邊界均可透過固定亂數來源測試。
- [ ] 預覽及再次隨機不會寫入遠端；只有 DM 確認才套用刷新結果。
- [ ] 刷新成功後其他訂閱者收到更新；刷新失敗時沒有部分資料改變。
- [ ] 刷新不刪除訂單、不改寫歷史快照、不覆蓋 `stock_reserved`，待審訂單仍可依既有流程處理。
- [ ] 未授權使用者、跨戰役 ID、錯誤政策、失效目錄及過期預覽均被明確拒絕。

## 非目標

- 不支援依即時價格、角色等級、玩家數量、時間表或外部 API 動態調整政策。
- 不為刷新建立玩家排程、每日自動刷新或自動扣款機制。
- 不在本階段調整商店購買／審查的交易規則，不自動取消待審訂單。
- 不新增手動商品／鍛造樣板作為政策候選；首版政策候選限於 `BlacksmithItem` 官方目錄商品及官方目錄篩選器。
- 不宣稱前端預覽與資料庫套用跨程序原子；原子性僅由單一受授權資料庫交易 RPC 保證。
