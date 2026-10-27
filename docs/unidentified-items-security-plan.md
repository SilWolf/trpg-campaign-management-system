# 未鑑定物品資料隔離與鑑定流程：開發規劃

## 目標與安全不變條件

把未鑑定商品的真實物品定義留在伺服器端，避免玩家透過 REST、Edge Function 回應、Realtime 或訂單紀錄取得未揭露的資料。玩家購買後，角色背包只持有可公開的遮罩資料；DM 鑑定時才由伺服器把真實定義寫入物品公開欄位。

實作及驗收必須持續符合以下條件：

1. `item_identified_snapshot` 永不進入前端型別、資料轉換器、客戶端查詢結果、函式回應或 Realtime payload；此規則亦適用於待審訂單的私有快照。
2. 未鑑定商品／背包物品的 `item_snapshot`、舊欄位與 `item_base` 只包含可公開資料；不能以隱藏 UI 代替資料隔離。
3. 結帳、扣款、庫存、訂單及背包交付在同一資料庫交易完成；鑑定時的欄位覆寫及清除隱藏快照也在單一交易完成。
4. 所有伺服器交易均重新驗證操作者、戰役、角色／商品、錢包 ACL、DM 身分及資料狀態，不信任客戶端傳入的價格、物品內容或權限。
5. 繼續以 `campaign_id` 隔離資料；角色、戰役 ID 維持 `text`，使用者 ID 維持 `uuid`，比較角色 owner 與登入者時使用 `auth.uid()::text`。

## 已確認的設計決定

- `campaign_shop_items` 新增 `item_identified_snapshot`，`item_snapshot` 改為可為 `NULL`，並移除該表的 `source_type`、`source_id`。
- `inventory_items` 新增 `item_identified_snapshot`。
- `campaign_shop_orders` 增加私有 `item_identified_snapshot`，用來保存待審訂單建立當下的真實物品定義；這是維持不可變交易快照所需的額外欄位，不屬於公開訂單資料。
- 新增購買及 DM 鑑定 Edge Function；採用「Edge Function 驗證登入者 → 僅 `service_role` 可執行的交易 RPC」架構。交易 RPC 仍是資料庫原子性與授權檢查的實際邊界；service-role 金鑰只存在伺服器端。
- 為保留待審期間的交易時點物品內容，新增受保護的訂單秘密快照欄位。待審訂單不能只引用可被 DM 修改的現行商店商品；秘密欄位同樣不授予客戶端讀取，核准交付完成或訂單取消／拒絕後清除。
- 保留 `campaign_shop_items` 來源欄位移除的要求，不新增替代來源關聯表。商店刷新不再以來源 ID 比對既有目錄商品；保留模式下重新抽到的商品會新增為新列，不自動補貨或合併同來源商品。
- Realtime 不可再將含秘密欄位的整列資料廣播至客戶端。改用只含 campaign／row ID／事件類型的安全通知，收到通知後以明確欄位清單重新讀取公開資料。

## 現況與影響面

- 商店目前儲存於 `campaign_shops`、`campaign_shop_items`、`campaign_shop_orders`；商品的 `item_snapshot` 現為完整快照，結帳 RPC 會把它複製至公開訂單並建立 `inventory_items`。
- 結帳已由資料庫 RPC 以單一交易處理購物車、庫存、付款及交付。不得改成 Edge Function 以多次 REST 寫入模擬交易。
- 背包同步目前以 `inventory_items.select('*')` 及 `postgres_changes` 同步整列；商店商品查詢及管理亦有 `select('*')`。這些路徑必須一併改為安全欄位白名單和安全事件通知。
- 既有未鑑定功能只遮罩 UI，並允許前端直接切換 `isIdentified`；新流程需移除這種直接揭露方式，避免在沒有秘密快照或未經 DM 授權時修改狀態。
- 商店刷新目前靠 `source_type/source_id` 找到商品並補貨。依已確認的刪欄決定，移除此比對：`keepItemsOnRefresh = true` 時保留既有列並將預覽選出的商品新增為新列；`false` 時沿用既有退役方式，再新增選取商品。預覽及結果需清楚顯示「新增」而非「補貨」，移除不再適用的補貨計數。

## 資料模型與快照

### `campaign_shop_items`

- 新增 `item_identified_snapshot jsonb`，僅伺服器交易可讀取／寫入。
- `item_snapshot jsonb` 改為 nullable。
- 移除 `source_type`、`source_id` 列欄位及相依索引、商品型別與轉換器映射。刷新請求可暫時保留候選來源 ID 供伺服器驗證其符合目前政策，但不得把來源 ID 寫入商品列或用來比對／補貨既有商品。
- 新增公開的 `is_identified boolean NOT NULL`，讓客戶端無需探測隱藏欄位是否為空，即可顯示遮罩商品。
- 更新既有 `item_snapshot` constraint：已鑑定列要求完整快照；未鑑定列要求僅含允許的摘要欄位及對應秘密快照。欄位型別／JSON 結構以 `ItemBase` canonical category、`subTypes` 陣列及數值 `weight` 為準。
- 已鑑定商品：`item_snapshot` 保存完整可公開快照，`item_identified_snapshot` 為 `NULL`，`is_identified = true`。
- 未鑑定商品：`item_snapshot` 只保存 `category`、`subTypes`、`weight`；`item_identified_snapshot` 保存完整真實物品定義；`is_identified = false`。若未鑑定商品缺少真實快照，寫入必須失敗。
- 商店表單仍讓 DM 編輯真實定義，但儲存時由 DM-only 資料庫函式在伺服器端拆分公開及隱藏快照；查詢或更新回應只能回傳公開 DTO。不得在前端送出後透過 `select()` 把含秘密欄位的 row 回傳，亦不要求前端建立或接收 `item_identified_snapshot` 屬性。

### `inventory_items`

- 新增 nullable `item_identified_snapshot jsonb`，不加入 `InventoryItem`、`DbInventoryItem` 等前端資料型別。
- 未鑑定背包物品的 `is_identified = false`；既有可見欄位及 `item_base` 僅存公開遮罩資料（名稱採通用未鑑定名稱、分類、子類及重量），不得存入真實名稱、效果、稀有度、價值、附魔詞條、DM 備註等資訊。
- 背包物品的真實完整定義只存入 `item_identified_snapshot`。資料庫欄位及 JSON 結構需由 migration 加上 object／有效結構檢查；舊資料欄位允許 `NULL`，避免歷史已鑑定物品遷移時虛構隱藏快照。
- 已鑑定或舊有無隱藏快照的物品仍可正常讀取。不能只把舊資料 `is_identified = false`，卻沒有對應真實快照。

### 訂單與安全回應

- 訂單公開的 `item_snapshot` 僅存購買當時可公開的快照。購買未鑑定商品時，該欄位仍是遮罩資料；真實快照只可寫入訂單專用的私有 `item_identified_snapshot` 欄位。
- 直接購買於交易內由商店秘密快照建立背包隱藏快照；待審訂單建立時將當下秘密快照複製至訂單的私有欄位，不交付物品。DM 核准時從該訂單快照建立背包物品，不依賴可能已被編輯的商店商品。交付成功後清除訂單秘密欄位。
- 拒絕或取消待審訂單時，在釋放保留庫存的同一交易清除訂單秘密欄位；拒絕／取消後的公開紀錄仍只有遮罩快照。
- 購買 Edge Function 僅回傳 checkout／order 識別碼及必要的安全狀態，不回傳資料庫 row 或任何隱藏快照。
- DM 鑑定 Edge Function 僅回傳成功狀態及物品識別碼，不回傳 `item_identified_snapshot`。

## 權限、交易與 Realtime

### 資料庫權限

- Migration 撤銷 `anon`、`authenticated` 對含秘密快照資料表的 table-level `SELECT`，再只授予公開欄位的 column-level `SELECT`；同時禁止一般客戶端直接讀寫所有 `item_identified_snapshot` 欄位。單純撤銷欄位層級權限不足以覆蓋既有 table-level grant。
- 客戶端對含秘密欄位的資料表改用明確欄位投影；`select('*')` 不作為安全策略。直接嘗試讀取隱藏欄位必須遭資料庫拒絕，而非依靠 UI 或型別隱藏。
- 建立／更新商店商品的 DM 管理寫入需保留 DM 授權，並經 DM-only 資料庫函式於伺服器端拆分／寫入秘密快照；不能因新增欄位而留下可直接改寫隱藏快照的 REST 路徑。函式不得回傳含秘密欄位的 row。
- Edge Function 先以使用者 bearer token 呼叫 Auth `getUser`，再由 server-side service-role client 呼叫受限 RPC。RPC 接收已驗證的 actor UUID，並在 SQL 內重新驗證 campaign membership、DM／角色／錢包權限；RPC 僅授權 `service_role` 執行。
- DM 鑑定交易需確認操作者是該戰役 DM、物品屬於同一戰役且未鑑定、隱藏快照存在且格式有效。任何條件不符均回滾，不能降級成只切換 `is_identified`。
- 鑑定完成時，以隱藏快照更新物品的真實定義欄位及 `item_base`，設 `is_identified = true`，並將 `item_identified_snapshot` 清為 `NULL`。保留物品實例狀態，例如 ID、owner、數量、欄位位置、裝備／同調狀態、目前充能與玩家備註；對無效快照不得部分覆寫。
- 盤點所有物品移轉、複製、堆疊及刪除流程。只更新既有列時由資料庫保留秘密欄位；若流程會建立替代列，必須改由伺服器端交易保留秘密快照。未鑑定物品不得只依公開摘要合併堆疊；合併前須由伺服器確認秘密定義一致。

### Edge Functions

新增兩個函式，名稱可於實作時依專案命名慣例調整：

1. `campaign-shop-purchase`
   - 接收 campaign、shop、角色、錢包種類及商品 ID／數量；忽略或拒絕客戶端提供的單價、商品快照及 actor ID。
   - 驗證登入者後呼叫單一購物車交易 RPC。RPC 以資料庫當下商品價格、庫存、商品啟用狀態、購物角色所有權、公開／私人錢包 ACL 及付款餘額為準。
   - 保留既有直接購買、需審查、保留庫存、取消／拒絕及 DM 核准的原子交易語意。相關核准 RPC 仍須安全處理秘密快照交付，且不能取得隱藏快照的前端回應。
   - 前端改用 `functions.invoke`，移除對購物結帳 RPC 的 authenticated 直接呼叫權限；函式錯誤明確回傳，不得以成功形狀掩蓋交易失敗。
2. `identify-inventory-item`
   - 接收 campaign ID 與 inventory item ID；不接受要套用的名稱、效果或其他物品參數。
   - 驗證登入者及 DM 身分後呼叫 service-role-only 鑑定 RPC；由資料庫鎖定物品列、驗證隱藏快照並原子套用。
   - 前端只在 DM 操作介面呼叫此函式；移除通用 `toggleIdentify` 直接修改物品狀態的行為。一般物品不可藉此功能把已鑑定狀態反轉為未鑑定。

### Realtime 與前端資料讀取

- 停止對 `inventory_items`、`campaign_shop_items` 訂閱會傳送完整 `postgres_changes` row 的事件。
- 由資料庫 trigger 發送自訂、白名單事件，payload 最多包含 `campaign_id`、row ID、事件類型；不得序列化整個 `NEW`／`OLD`、完整 snapshot 或秘密欄位。事件仍需依戰役成員授權私有 channel。
- 客戶端收到通知後，使用明確安全欄位查詢重新載入資料；查詢錯誤需可見，不可當作成功同步。
- 更新 `useCampaignSync`、商店服務及相關 Realtime listener；確認交易成功後的本地狀態仍由安全查詢或通知更新，不能以含秘密欄位的 optimistic 物件更新。
- 在所有前端查詢、日誌、錯誤內容、React state、E2E fixture 及函式回應中，均不得包含 `item_identified_snapshot`。

## 前端型別、轉換器與互動

- `CampaignShopItem.itemSnapshot` 改為可表達公開摘要；新增 `isIdentified` 欄位對應 `campaign_shop_items.is_identified`。前端商品型別不包含 `item_identified_snapshot`、來源欄位。
- 更新 `fromDbCampaignShopItem`、寫入 DTO、訂單轉換器與資料服務，使可空及摘要快照有明確型別檢查，不把摘要當成完整 `AllItem` 使用。
- `InventoryItem` 不新增秘密快照屬性。`fromDbItem` 只消費安全投影，且前端快照序列化器不應能序列化秘密欄位。
- 商店管理表單在 DM 本地表單 state 編輯完整物品；儲存時以伺服器管理端點分流完整定義與公開摘要，回傳成功後只載入公開商品資料。
- 玩家商店卡片、詳情、購物車、訂單紀錄及背包均以安全的 `isIdentified` 狀態顯示通用名稱／遮罩；不以隱藏完整物品資料來做 UI mask。
- DM 背包鑑定操作呼叫 Edge Function，成功後透過安全 Realtime 通知重新載入已揭露的公開欄位。待處理或失敗期間不能樂觀地把物品標為已鑑定。
- 刷新預覽、管理商品、批次匯入、訂單紀錄及其他使用 `CampaignShopItemSnapshot` 的位置，逐一調整 nullable snapshot 與移除來源欄位後的型別／展示語意。

## 分階段實作

### 階段一：Schema 與授權交易

**本機實作狀態（尚未部署）：**已新增 [`20261029000000_unidentified_item_security.sql`](../supabase/migrations/20261029000000_unidentified_item_security.sql)，在 migration 中實作下列 schema、資料隔離、交易及資料庫授權。來源欄位移除與重建物品列流程當時尚未完成，已於階段二補齊。這些本機變更不代表真實 Supabase 已套用或驗收。

1. **已完成 schema 與歷史資料轉換。**新增三張資料表的私有快照欄位、商店及訂單的公開 `is_identified`，讓商店公開快照可為 `NULL`，並加入快照 JSON 檢查。Migration 先檢查現有商品、未鑑定背包物品及待審訂單的 `item_base`；無法安全保留時即中止。未鑑定公開資料只保留摘要，完整定義寫入私有欄位。
2. **已完成資料庫交易保護。**訂單寫入 trigger 從已鎖定的商店商品複製安全快照及私有快照；既有購物車／單項購買與核准仍沿用同一交易和資料列鎖。結帳 RPC 建立背包物品時保留私有定義，完成、拒絕或取消後清除訂單私有快照。DM 商品拆分／寫入改由 `save_campaign_shop_item` 處理，回應只含商品 ID。
3. **已新增鑑定 RPC。**`identify_inventory_item` 僅授權 `service_role` 執行，接受已驗證 actor UUID，重新確認該使用者存在且為指定戰役 DM；鎖定同戰役物品、驗證完整快照後才更新物品欄位，並在同一交易清除快照。
4. **已完成資料庫欄位授權與安全通知。**含秘密欄位的 table-level `SELECT` 已撤銷，改授予明確公開欄位；一般客戶端不能直接寫商店資料、更新既有背包物品的鑑定狀態或讀寫秘密快照。新建未鑑定背包物品由資料庫 trigger 拆分並遮罩快照。商店／背包／訂單已移出 `postgres_changes` publication，改由私有 campaign channel 發送僅含 campaign ID、row ID、事件類型的通知，並以 campaign 成員函式授權。
5. **來源欄位刪除已於階段二完成。**階段一 migration 曾暫時保留 `source_type/source_id` 及索引；階段二 migration 已同步更新刷新 RPC 並移除資料表欄位與來源比對。
6. **物品複製／拆堆已改為伺服器端交易。**階段二新增拆堆／移轉 RPC，在伺服器端複製私有快照，並以完整秘密快照比對未鑑定物品後才合併堆疊。此行為尚未在真實 Supabase 驗收。

**部署閘門：**階段一與階段二的相容呼叫端及資料庫 migration 已在本機完成，但尚未連線、套用或部署至 Supabase。維護者須先確認目標專案與 migration history，再依部署文件手動部署；隔離資料庫的 migration 執行／回滾、REST 欄位拒絕、Broadcast 授權及真實交易行為仍待階段三驗收。

### 階段二：Edge Functions 與客戶端服務

**本機實作狀態（已完成，尚未部署）：**

1. **購買與鑑定 Edge Functions 已新增。**[`campaign-shop-purchase`](../supabase/functions/campaign-shop-purchase/index.ts) 與 [`identify-inventory-item`](../supabase/functions/identify-inventory-item/index.ts) 均要求 JWT；先驗證 bearer token，再使用伺服器端 service-role client 呼叫受限交易 RPC。請求具欄位白名單、大小與數量限制，回應只含識別碼／安全錯誤，不回傳資料列或隱藏快照；函式 JWT 設定已加入 [`config.toml`](../supabase/config.toml)。
2. **客戶端商店服務已改接安全介面。**購買 UI 使用購買 Function；商品新增／編輯使用 `save_campaign_shop_item`，儲存 RPC 僅回傳商品 ID，之後由安全欄位 projection 重新載入。鑑定操作使用鑑定 Function，不再提供客戶端直接切換未鑑定狀態的路徑。
3. **背包與商店讀取已改用明確欄位清單。**秘密快照不加入前端型別與轉換器。安全 Broadcast 訂閱按 campaign 共用單一 channel 並支援多個 listener；收到通知後重新讀取安全 projection，避免 row-based Realtime 傳送完整資料列。
4. **商店來源欄位及刷新語意已更新。**[`20261030000000_unidentified_item_clients.sql`](../supabase/migrations/20261030000000_unidentified_item_clients.sql) 移除商店商品來源欄位與相依刷新比對；來源 ID 只作為刷新請求中的暫時政策候選驗證，不保存至資料列、不用來補貨或合併。保留模式會新增本次選取列；清除模式停用既有列並將庫存歸零，保留歷史訂單。介面已改用「新增／停用」文案。
5. **拆堆與移轉已改用資料庫交易。**拆堆／移轉 RPC 在伺服器端複製完整資料列及秘密快照；移轉堆疊合併會比較私有快照，避免不同的未鑑定物品定義被合併。
6. **E2E 測試替身與舊契約預期已更新。**本機 mock 驗證新 Function／RPC 呼叫與刷新停用語意；這些測試不替代真實 Supabase 的 RLS、Realtime、service-role、交易併發或回滾驗收。

**本機驗證結果：**`npm run typecheck` 通過；`npm run lint` 通過（0 errors，保留既有 unused eslint-disable 警告）；`npm run build` 通過；`npm run test:e2e` 全部 69 項通過；`git diff --check` 通過。環境未提供 `psql`、Supabase CLI 或 Deno，因此 migration 未經本機 PostgreSQL 執行，Edge Functions 亦未在 Deno runtime 進行獨立檢查。

**部署／驗收狀態：**沒有連線或變更 Supabase，沒有執行 migration、部署 Edge Functions 或修改 Secrets。階段三所列隔離專案實測仍待維護者確認目標專案及 migration history 後手動進行；不得將本機 mock／建置結果描述為已上線或真實資料庫驗收完成。

### 階段三：測試與手動部署驗收

1. 單元測試快照拆分／摘要、舊資料 fallback、null 驗證、完整物品欄位套用、可變實例狀態保留及刷新無來源比對的新結果。
2. Edge Function 測試未登入、無效 token、非成員、非 DM、錯誤 campaign／角色／商品、無效數量、服務錯誤及不洩漏回應。
3. E2E 測試 DM 設定未鑑定商品、玩家購買／待審、DM 核准交付、玩家視角遮罩、DM 鑑定及 Realtime 後顯示真實內容。
4. 以 REST 驗證 `select item_identified_snapshot` 被拒絕；一般安全 projection 可用；`select('*')` 不得成功回傳秘密欄位。
5. 監聽商店及背包 Realtime channel，檢查原始 payload、通知回應與客戶端 refetch 都沒有秘密快照；非成員不得收到事件。
6. 隔離 Supabase 雙帳號驗證：玩家不能購買他人角色、不能修改價格／快照、不能直接鑑定；DM 只能鑑定本 campaign 物品；併發購買不可超賣；付款、扣庫存或交付任一步失敗均完整回滾。
7. 依 [`database-template-migration.md`](./database-template-migration.md) 的手動部署原則，由維護者確認專案及 migration history，並確認階段二相容呼叫端已部署後，再部署 SQL／Functions；本規劃及本機 mock 測試不代表真實 Supabase 已驗收或上線。

## 驗收條件

- 未鑑定商店商品之公開 `item_snapshot` 僅含 `category`、`subTypes`、`weight`；完整定義只在資料庫秘密欄位。
- 玩家買入未鑑定物品後，訂單及背包公開欄位仍只含安全摘要；沒有任何 HTTP／Realtime／REST 路徑能取得秘密欄位。
- DM 鑑定後，物品真實名稱、分類屬性、稀有度、圖示、重量／價值、裝備／消耗屬性、效果、描述、附魔及其他 `ItemBase` 欄位正確覆寫；實例狀態不被意外重設；秘密快照已清除。
- 非 DM、跨戰役或無效物品識別碼均不能鑑定；攻擊者不能自行提交要套用的物品屬性。
- 購買與鑑定失敗均不留下部分更新；既有付款權限、庫存保留、訂單狀態及 Realtime 行為仍符合原規則。
- 商店刷新不再依賴商品來源欄位，且 UI 不再宣稱執行了來源商品補貨。
- 所有真實 Supabase schema、RLS、Realtime、Edge Function secrets、交易併發與回滾驗收皆由維護者在確認的隔離專案手動執行；驗收前不得宣稱已部署。
