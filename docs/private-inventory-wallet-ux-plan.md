# 私人暗袋與錢包整合：開發規劃

## 目標

將角色公開行囊與私人暗袋合併為同一個背包檢視，並在各物品分類中以獨立的秘密語境區分 `isPrivate` 物品；角色公開及私人 GP 錢包則在同一處摘要顯示。移除日常物品操作中反覆選擇背包的步驟，同時保留 ACL，並確保無權限者不能透過 REST、RPC、Realtime 或其他網路回應取得秘密物品資料或私人錢包金額。

本文件只規劃本次 UI、交易與資料隔離改動，不授權執行 migration、部署 Edge Function 或連線／修改 Supabase 專案。

## 目前實作與安全基線

- 背包頁目前以 `bagTab` 在公開／私人背包間切換，分類與操作入口分別位於 [`index.tsx`](../src/routes/_protected/campaigns/$campaignId/index.tsx)、[`InventoryToolbar.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/InventoryToolbar.tsx) 及 [`InventoryGrid.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/InventoryGrid.tsx)。
- 物品以 `inventory_items.is_private` 表示秘密狀態；`CharacterPermission` 仍分別有公開／私人背包及錢包讀取、修改權限，見 [`types.ts`](../src/types.ts) 與 [`useCharacterPermissions.ts`](../src/hooks/useCharacterPermissions.ts)。
- 角色錢包為 `characters.gp`／`private_gp`，營地箱只有 `campaigns.camp_chest_gp`。GP 欄位、精度及相容欄位背景見 [`currency-simplification-plan.md`](./currency-simplification-plan.md)。
- DM 派發沿用 `isPrivate` 請求欄位及營地箱強制公開的伺服器規則；dialog 以秘密物品 checkbox 設定狀態，見 [`ItemDistributionDialog.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/ItemDistributionDialog.tsx)、[`dispatch-campaign-items/index.ts`](../supabase/functions/dispatch-campaign-items/index.ts) 及 [`20261030000015_campaign_activity_and_item_dispatch.sql`](../supabase/migrations/20261030000015_campaign_activity_and_item_dispatch.sql)。
- 目前物品轉移的本機 fallback 會把轉移品改成公開；錢包轉帳 UI 允許選來源與目的錢包。兩者都須與新規則同步，不能只改遠端 UI。相關程式為 [`useInventoryActions.ts`](../src/hooks/useInventoryActions.ts)、[`inventoryTransactions.ts`](../src/lib/inventoryTransactions.ts) 及 [`CurrencyPanel.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/CurrencyPanel.tsx)。
- **安全阻擋項：**歷史 migration 中的 `inventory_items` RLS 只檢查戰役成員資格，GP migration 曾授予 authenticated 直接讀取 `gp`、`private_gp` 的欄位權限。階段一已新增增量安全 migration，但尚未套用或在隔離環境驗收；不能把 repo SQL 或 UI 過濾視為有效網路層隔離。正式與隔離專案的有效 grants、RLS、REST、RPC 及 Realtime 狀態仍須由維護者實測確認。

## 已確認的行為規格

### 1. 單一背包與秘密分類

- 移除公開／私人背包分頁、分頁狀態及依目前分頁篩選物品的邏輯；公開和有權限讀取的私人物品都呈現在同一個背包區域。
- 保留裝備、消耗品、重要物品、雜物四個分類。每個分類內分開呈現一般公開物品及 `isPrivate` 秘密物品；秘密物品集合以完整的私人語境外框包住，包含清楚的秘密標示，不只在單件物品圖示上放鎖頭。
- `private` 語境以紅色為主色調，代表性 icon 使用 `EyeOff`（Lucide `eye-off`）；秘密區塊外框、標題／標籤及錢包私人金額均沿用此語境。不要以綠色或鎖頭作為 private 語境的主色／代表 icon；鎖頭可在需要表達權限鎖定時作輔助使用。
- 秘密物品仍按原物品類型進入對應分類。搜尋、篩選、顯示模式、排序、堆疊整理、選取詳情與行動版 Drawer 均在合併後的清單上工作。
- 讀取權限分別套用到公開／私人區塊。沒有私人背包閱讀權限時，不回傳或顯示秘密物品；不得洩漏秘密物品數量、重量、名稱、搜尋命中、tooltip、無障礙標籤或其他可推知其存在的資訊。公開資料仍依公開背包 ACL 顯示。
- `camp-chest` 是 UI 虛擬 owner，只能顯示／存放公開物品；不得建立營地箱角色或角色權限資料列。

### 2. 雙錢包摘要

- 角色錢包固定在同一位置顯示公開與私人餘額，例如：

  ```tsx
  <span>123.45 GP</span>{' '}
  <span className='text-private'>(+ 67.89 GP)</span>
  ```

- 公開及私人金額各自按讀取 ACL 決定是否可呈現，金額使用 GP 精度格式；營地箱只顯示公開 GP，不顯示虛構的私人餘額。
- 私人 GP 的文字使用紅色 private 語境，並可搭配 `EyeOff` 圖示；公開 GP 維持公開／金錢既有視覺語境。
- 若無私人錢包讀取權限，只能顯示不含餘額及存在性線索的固定鎖定提示（例如 `(+ 🔒 私人錢包)`），不可顯示實際金額、以合計差額推算的數值或依是否有餘額改變提示。公開錢包無權讀取時亦套用既有遮罩語意。
- 負重只計入有閱讀權限的錢包金額；不得用雙錢包加總造成私人金額側漏。
- 轉帳 dialog 可保留「來源戶口」與「轉入戶口」選擇，因為兩種 GP 錢包仍是不同資料列／餘額；移除的是選擇公開／私人「背包」的步驟，不應將兩個錢包合併或削弱錢包 ACL。

### 3. DM 派發

- 接收者仍先選戰役角色或營地儲物箱，但不再選「公開／私人背包」。
- 一般角色提供「是否設為秘密物品？」勾選項，預設未勾選；勾選後派發物品的 `is_private` 為 `true`。
- 選擇營地儲物箱時該選項不可勾選，提交時強制 `isPrivate = false`。前端限制不能取代 Edge Function 與 RPC 驗證。
- 保留既有批次派發驗證、確認、交易原子性與操作錯誤處理；不在前端逐筆直接寫入物品。
- 既有 `isPrivate` payload 可維持不變，避免不必要的 API 改名；同步更新表單測試及 mock 合約。

### 4. 物品公開化與角色間轉移

- 玩家可以把自己有修改權限的秘密物品改為公開；不得把已公開物品改回秘密。UI 不提供反向控制，遠端寫入交易／資料庫亦須拒絕 `false → true`。
- 秘密物品在不同角色間轉移時保留原本 `is_private`；使用者只選接收角色，不選接收者的背包。
- 營地箱只能收公開物品。秘密物品不可被靜默公開後轉入營地箱；先由有權限者明確公開，再執行移轉。前端應禁用該接收目標並說明原因，資料庫交易也須拒絕直接轉移秘密物品至 `camp-chest`。
- 轉移授權仍由伺服器驗證來源角色及來源背包修改權、campaign 隔離、目標角色屬於同一戰役與物品數量；不要求操作者具有目標角色背包權限。
- 更新本機訪客／離線 fallback，確保它也保留 `isPrivate`、遵守不可逆公開化與營地箱限制，並維持堆疊合併的公開狀態一致性。

### 5. 錢包轉帳方向

| 轉出戶口 | 一般角色的允許轉入戶口 | 轉入營地箱 |
| --- | --- | --- |
| 角色私人錢包 | 同角色／其他角色的公開或私人錢包（不得是同一戶口） | 可轉入；營地箱目的端一律為公開錢包 |
| 角色公開錢包 | 同角色／其他角色的公開錢包（不得是同一戶口） | 可轉入公開錢包 |
| 營地箱公開錢包 | 角色公開錢包 | 不適用；營地箱沒有私人錢包 |

- 公開錢包轉出不得轉入任何角色私人錢包。私人錢包轉出可轉入角色公開或私人錢包；轉入營地箱時一律視為公開目的錢包。
- 玩家只能把私人錢包的金額轉入公開錢包，不能把公開餘額轉回私人錢包。私轉私只適用於私人來源轉至另一個不同的私人戶口；不得以同一角色內互轉形成公開化規則的逆向通道。
- 以上矩陣同時套用於 UI 選項、前端 handler、`transfer_campaign_currency` RPC 及其他可呼叫資料庫／HTTP 入口。UI 隱藏或停用選項不是授權邊界。
- 保留 `0.01 GP` 精度、來源足額、目標上限、角色／campaign 驗證與既有交易原子性；若某操作涉及多角色或多錢包，需確認其交易 RPC 仍在同一資料庫交易內處理。

## 網路層資料隔離要求

此節是整個工作的上線阻擋條件，必須先於 UI 驗收完成。

### 私人物品

- 為 `inventory_items` 建立伺服器端 ACL 篩選：只讓具備該角色相應公開／私人背包讀取權限的登入者讀到該類物品。沿用安全 helper／`SECURITY DEFINER` 慣例，固定 `search_path`，避免 RLS policy 直接查詢自身資料表造成遞迴。
- 審核並調整直接 PostgREST 查詢權限、所有 `SELECT` 欄位投影、Realtime publication／訂閱與安全通知。無權限的 REST 請求不得取得秘密物品列或其欄位；不得只在 React 隱藏。
- Realtime 不得廣播含未授權物品欄位的整列 `NEW`／`OLD` payload。使用只含必要 campaign／row 識別資訊的安全通知，收到後再以呼叫者 ACL 過濾的安全查詢重新載入；錯誤必須可見。
- 背包初始載入、`refreshItems`、搜尋／詳情資料、樂觀更新及同步錯誤處理都必須遵守同一安全投影。

### 私人錢包

- 移除 authenticated 對基礎 `characters.private_gp` 的無條件欄位讀取路徑；盤點 table-level 與 column-level grants，先撤銷可能涵蓋欄位 grant 的 table-level 權限，再只授予必要公開欄位。
- 公開及私人 GP 分別透過資料庫端按 `auth.uid()`、DM 身分及目標角色對應錢包 ACL 過濾的安全讀取介面回傳，避免合併流程意外放寬任一錢包權限。未授權時不得回傳數值、餘額衍生值或足以推算餘額的資料。角色 ID 為 `TEXT`、使用者 ID 為 `UUID`；比較 owner 時使用 `auth.uid()::text`。
- `characters` 的 `select('*')`、私人 GP 的直接 REST 查詢、角色 `postgres_changes` 完整 row payload、Realtime 重新載入、錯誤／操作紀錄都不得暴露私人餘額。若需要同步更新，改用安全通知及授權讀取介面。
- 保留 DM 永遠可管理、各使用者既有錢包讀取／修改 ACL 與營地箱只有公開錢包的規則；不要把隱藏金額傳至前端再依角色視圖隱藏。

### 寫入及不可逆狀態

- 直接 REST／RPC 寫入不可繞過 `isPrivate` 單向轉換規則、來源修改權與營地箱限制。對不允許的狀態轉換以明確錯誤拒絕，不作成功形狀 fallback。
- DM 派發由 Edge Function 驗證登入者，再呼叫受限交易 RPC；RPC 重新驗證 DM、campaign、角色目標、`isPrivate` 及 `camp-chest` 限制。
- 檢視既有物品移轉及錢包交易 RPC，確認它們不是因 service role 或 SECURITY DEFINER 而略過 actor／ACL 驗證。只新增增量 migration，不修改已部署的歷史 migration；migration 版本及部署前置檢查依 [`database-template-migration.md`](./database-template-migration.md)。

## 實作階段

### 階段一：安全讀取與資料庫交易

1. 盤點有效 grants、RLS、角色初始載入、所有物品 REST 查詢與 Realtime payload；以匿名／不同 ACL 使用者驗證哪些欄位目前可從網路取得。
2. 新增增量 migration：建立私人物品 ACL 讀取界線、安全的私人 GP 讀取介面及必要安全通知；撤銷不安全的直接讀取路徑。
3. 更新物品移轉 RPC，保留來源 `is_private`，拒絕私人物品直接進入營地箱，並伺服器端驗證來源權限與同戰役目標。
4. 更新錢包轉帳 RPC，依本規劃的方向矩陣驗證來源／目的錢包、操作者與 ACL。拒絕公開轉私人及同一戶口轉帳。
5. 確認玩家公開化物品／金額的資料庫寫入僅允許秘密至公開，不允許反向變更；任何其他既有寫入面也一併封閉。

### 階段二：讀取轉換器與同步

1. 更新 [`useCampaignSync.ts`](../src/hooks/useCampaignSync.ts)、[`supabase.ts`](../src/lib/supabase.ts) 及 [`campaignShops.ts`](../src/lib/campaignShops.ts)：改用明確安全投影與授權查詢，移除可能載入未授權秘密值的 `select('*')`／完整 row 監聽。
2. 保留既有 `Character` 與 `InventoryItem` camelCase 型別轉換規範；未授權資料不可進入 React state、cache、log 或錯誤訊息。
3. 更新 Realtime 事件通知及載入失敗處理；以登入者 ACL 驗證資料，而非前端 DM 預覽角色模擬存取權。

### 階段三：合併背包及雙錢包呈現

1. 從 [`index.tsx`](../src/routes/_protected/campaigns/$campaignId/index.tsx) 移除 `bagTab`、依分頁推導權限與只顯示單一背包的篩選；改以各物品自身的 `isPrivate` 決定所在子區塊與操作權限。
2. 修改 [`InventoryToolbar.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/InventoryToolbar.tsx) 移除公開／私人分頁按鈕，保留搜尋、排序及檢視模式。
3. 修改 [`InventoryGrid.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/InventoryGrid.tsx)，在每個既有物品分類內呈現公開項目與秘密外框；確認空分類、零物品、秘密區塊無權限及不同顯示模式。
4. 私人區塊與私人 GP 摘要採紅色 `private` 語境及 `EyeOff` 代表 icon；公開資料沿用既有視覺語境。
5. 修改 [`CharacterStatusBar.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/CharacterStatusBar.tsx) 顯示 `公開 GP (+ 私人 GP)`，並按每個錢包獨立 ACL 遮罩；負重仍只計入可讀金額。
6. 修改 [`CurrencyPanel.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/CurrencyPanel.tsx) 動態篩選目的戶口：公開來源只顯示公開目的端，私人來源允許公開／私人目的端，營地箱永遠只有公開戶口。
7. 修改 [`ItemTooltip.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/ItemTooltip.tsx) 及相關 actions，使物品公開化只有單向操作，轉移只選角色而不再選目標背包。

### 階段四：DM 派發與本機 fallback

1. 將 [`ItemDistributionDialog.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/ItemDistributionDialog.tsx) 的目標背包選擇改為秘密物品 checkbox；營地箱選取後固定公開。
2. 確認 [`dispatch-campaign-items/index.ts`](../supabase/functions/dispatch-campaign-items/index.ts) 及其 RPC 對 checkbox 值重新驗證，維持整批交易及既有防重送行為。
3. 更新 [`useInventoryActions.ts`](../src/hooks/useInventoryActions.ts) 的轉物品、公開化、GP 轉帳及訪客／離線 fallback；確保本機行為與遠端資料庫規則一致。

### 階段五：回歸測試與隔離驗收

1. 更新 [`phase-3-inventory.spec.ts`](../tests/e2e/phase-3-inventory.spec.ts)、[`item-distribution.spec.ts`](../tests/e2e/item-distribution.spec.ts) 及 [`supabase-mock.ts`](../tests/e2e/supabase-mock.ts)，移除舊分頁與派發背包選項的預期。
2. 為前端轉移矩陣、錢包目的端選項、公開化單向性及本機 fallback 增加測試。
3. 加入資料庫／API 層驗收：無私人讀取權限的使用者直接查詢私人 `inventory_items`、`private_gp`、安全 RPC 與 Realtime，均不得取得秘密內容或餘額；有權限者與 DM 的讀取結果須符合 ACL。
4. 在隔離 Supabase 專案驗證 migration、RLS/grants、REST、RPC、Realtime、交易回滾及多使用者 ACL。Playwright mock、型別檢查或 SQL 靜態檢查均不能取代真實網路層驗收。

## 階段一執行紀錄（2026-10-31）

### Repo 靜態盤點結果

- [`20261030000012_v0_1_0.sql`](../supabase/migrations/20261030000012_v0_1_0.sql) 的物品讀取政策只隔離戰役成員；authenticated 的物品欄位 grants 包含 `is_private` 及物品內容。該 migration 已將 `inventory_items` 移出 Postgres Changes publication，並以安全 Broadcast 通知 campaign、row ID 與動作，不直接廣播整列物品。
- [`20261030000014_gp_wallet_shop_checkout.sql`](../supabase/migrations/20261030000014_gp_wallet_shop_checkout.sql) 曾授予 authenticated 直接讀取 `characters.gp`／`private_gp`；歷史角色欄位 `currencies`／`private_currencies` 亦可能經 `select('*')` 帶出。前端 [`useCampaignSync.ts`](../src/hooks/useCampaignSync.ts) 對角色訂閱完整 Postgres Changes row，且初始載入使用 `select('*')`。
- 以上是 repo migration 與前端程式碼的靜態結果，不代表目前 Supabase 專案的有效 grants、publication、RLS 或網路回應；本階段沒有連線查詢遠端專案。

### 已加入的本機交付

- 新增 [`20261031000000_private_inventory_wallet_security.sql`](../supabase/migrations/20261031000000_private_inventory_wallet_security.sql)：依角色公開／私人背包 ACL 加上限制性 RLS；撤銷直接讀取兩個 GP 欄位與舊錢包鏡像；以 `get_campaign_character_wallets` 僅回傳呼叫者可讀的錢包；角色 Realtime 改用不含餘額欄位的安全通知並排除完整 row publication。
- 同一 migration 將物品轉移改為保留 `is_private`、禁止秘密物品直接移入營地箱、按秘密狀態分開堆疊合併，並由伺服器驗證來源寫入 ACL 與同戰役目標。新增秘密至公開的單向 RPC，並封鎖直接將已公開物品改回秘密；角色 GP 與舊錢包鏡像的直接變更改由資料庫觸發器拒絕。
- 更新 `transfer_campaign_currency` 交易 RPC：限制公開錢包不可轉入私人錢包、私人來源才可轉入角色私人錢包；允許私人轉公開（含同角色公開錢包），並拒絕相同錢包互轉。既有來源 ACL、campaign 範圍、餘額／上限檢查、列鎖及操作紀錄仍由同一資料庫交易處理。
- 新增 [`private_inventory_wallet_security.sql`](../supabase/tests/private_inventory_wallet_security.sql) 作為 grants、RLS、RPC 執行權限、觸發器及 publication 的 SQL 合約檢查。

### 驗證狀態與限制

- [x] 完成 repo migration、前端查詢／Realtime 訂閱及現有交易 RPC 的靜態盤點。
- [x] 新增增量 migration 與 SQL 合約測試；未改寫既有 migration。
- [ ] 尚未在隔離 PostgreSQL/Supabase 套用 migration 或執行 SQL 合約測試；目前環境沒有 `psql`、Supabase CLI 或 Docker。
- [ ] 尚未以匿名、不同 ACL 使用者及 DM 對 REST、RPC、Realtime 做真實網路驗收，也未驗證競爭交易與失敗回滾。
- [x] 階段二已完成本機前端讀取／同步改造；仍須先在隔離環境套用 migration 並驗收，**不可單獨部署 migration 或前端改動**。正式環境仍未部署。

## 階段二執行紀錄（2026-10-31）

### 已完成

- [`supabase.ts`](../src/lib/supabase.ts) 新增明確的 `CHARACTER_PROFILE_SELECT`、角色安全投影轉換及 `loadCampaignCharacters`。角色基本資料與 `get_campaign_character_wallets` 分開讀取；錢包 RPC 只使用登入者實際 ACL 回傳的餘額，未回傳的錢包在前端固定為 0，不從前端 DM 預覽角色推導讀取權。
- [`useCampaignSync.ts`](../src/hooks/useCampaignSync.ts) 移除角色 `select('*')` 與完整角色 Postgres Changes row 監聽；初始載入及安全 Broadcast 通知均重新讀取安全角色投影、授權錢包與物品。角色資料 upsert 僅送出非錢包欄位；物品仍使用明確欄位清單。
- [`settings/index.tsx`](../src/routes/_protected/campaigns/$campaignId/settings/index.tsx) 的角色初始載入改用安全讀取 helper；新增角色只回傳安全角色欄位，不再以 `select('*')` 讀取餘額。
- [`ShopTransactionsPanel.tsx`](../src/routes/_protected/campaigns/$campaignId/shops/-parts/ShopTransactionsPanel.tsx) 移除直接讀取 `characters.gp`／`private_gp`，改呼叫授權錢包 RPC；[`campaignShops.ts`](../src/lib/campaignShops.ts) 嚴格驗證安全 Broadcast 的操作種類。
- 階段一 migration 會拒絕角色錢包欄位直接寫入，但目前沒有 DM 直接設定角色餘額的授權 RPC。因此遠端角色錢包「直接設定」改為明確提示並拒絕；轉帳仍走既有交易 RPC，營地箱餘額仍寫入 campaigns。訪客／離線角色錢包編輯保留本機行為。部署前仍需決定是否新增受權限驗證的 DM 餘額設定 RPC。
- 更新 E2E Supabase mock，依呼叫者角色／擁有者與可讀 ACL 合約回傳錢包 RPC 結果；調整遠端直接設定錢包的測試預期。測試替身不證明實際資料庫授權正確。

### 驗證與限制

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run test:e2e -- tests/e2e/phase-3-inventory.spec.ts tests/e2e/campaign-shop-purchase.spec.ts tests/e2e/phase-2-settings.spec.ts`（42 項通過；均使用 Playwright/Supabase mock）
- [ ] 尚未在隔離 Supabase 驗證欄位 grants、`get_campaign_character_wallets`、REST 與安全 Broadcast；目前改動依賴階段一 migration 已套用。
- [x] 階段三與階段四已完成本機 UI、轉帳方向、DM 派發及 fallback 改造；執行部署前仍須完成階段五與隔離環境驗收，並決定遠端 DM 直接設定角色錢包的 RPC／UI 行為。

## 階段三執行紀錄（2026-10-31）

### 已完成

- [`index.tsx`](../src/routes/_protected/campaigns/$campaignId/index.tsx) 移除背包分頁狀態與分頁篩選；公開／秘密物品依各自讀取 ACL 合併呈現，角色操作權依物品 `isPrivate` 決定。負重、同調數及估值只使用可讀物品與可讀錢包。
- [`InventoryToolbar.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/InventoryToolbar.tsx) 移除公開／私人切換，保留搜尋、排序及三種檢視模式；[`InventoryGrid.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/InventoryGrid.tsx) 在各分類內分開呈現公開物品及紅色秘密外框，使用 `EyeOff` 與主題語意 token `private`／`private-surface`。
- [`CharacterStatusBar.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/CharacterStatusBar.tsx) 同處顯示公開與私人 GP，分別按錢包讀取權限遮罩；無私人讀取權時固定顯示鎖定提示，不顯示實際金額。營地箱只顯示公開錢包。
- [`CurrencyPanel.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/CurrencyPanel.tsx) 依來源錢包動態篩選目的戶口：公開來源只列公開目的端，私人來源可列公開／私人目的端，營地箱來源只列角色公開戶口；[`useInventoryActions.ts`](../src/hooks/useInventoryActions.ts) 同步拒絕公開轉私人。
- [`ItemTooltip.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/ItemTooltip.tsx) 移除公開物品改回秘密的操作，秘密物品只能呼叫 `make_inventory_item_public` RPC 公開；秘密物品不可選營地箱。訪客／離線轉移保留秘密狀態，並拒絕秘密物品直接移入營地箱。
- 為三套主題加入 `private` 前景與 `private-surface` 表面語意色彩，並更新 [`theme-system-plan.md`](./theme-system-plan.md) 說明此 token 標記秘密語境、不同於危險操作的 `destructive`。
- 更新 [`phase-3-inventory.spec.ts`](../tests/e2e/phase-3-inventory.spec.ts) 與 [`supabase-mock.ts`](../tests/e2e/supabase-mock.ts)，覆蓋合併背包、無權限遮罩、公開化 RPC 與錢包目的端方向。

### 驗證與限制

- [x] `npm run typecheck`
- [x] `npm run lint`（含語意色彩政策檢查）
- [x] `npm run build`
- [x] `npm run test:e2e -- tests/e2e/phase-3-inventory.spec.ts`（15 項通過；使用 Playwright／Supabase mock）
- [ ] 階段三 E2E 不代表真實 REST、RLS、RPC、Realtime 或資料庫交易驗收；隔離環境仍須套用 migration 並完成階段五驗收。正式環境未部署。
- [x] DM 派發秘密 checkbox、營地箱強制公開及整批伺服器驗證已於階段四完成。

## 階段四執行紀錄（2026-10-31）

### 已完成

- [`ItemDistributionDialog.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/ItemDistributionDialog.tsx) 將公開／私人背包選擇改為預設未勾選的「設為秘密物品」checkbox；選擇營地儲物箱時會清除並停用 checkbox，送出前及 payload 仍強制 `isPrivate = false`。
- 檢視 [`dispatch-campaign-items/index.ts`](../supabase/functions/dispatch-campaign-items/index.ts) 與既有派發交易 RPC：Edge Function 驗證 `isPrivate` 必須為 boolean 並拒絕營地箱秘密派發；RPC 再驗證 DM 身分、戰役與接收角色、營地箱公開限制及整批資料，維持單一交易、批次確認與 request ID 防重送。既有伺服器邊界已符合要求，未改寫既有 migration 或逐筆直接寫入。
- 檢視 [`useInventoryActions.ts`](../src/hooks/useInventoryActions.ts) 的本機 fallback：秘密物品公開化僅能單向進行；角色間移轉保留 `isPrivate`，私人物品直接移入營地箱會被拒絕；堆疊合併由 [`canStackItems`](../src/types.ts) 區分公開／秘密物品。GP fallback 同步限制公開來源不得轉入私人錢包、營地箱只有公開錢包，並驗證相同戶口、來源餘額及目標上限。
- 更新 [`item-distribution.spec.ts`](../tests/e2e/item-distribution.spec.ts)，覆蓋一般角色秘密派發及選擇營地箱後取消秘密狀態、停用選項並以公開狀態提交。

### 驗證與限制

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run test:e2e -- tests/e2e/item-distribution.spec.ts`（10 項通過；使用 Playwright／Supabase mock）
- [ ] 合併執行派發與階段三回歸測試時 24/25 項通過；階段三「DM 可在合併背包搜尋檢視物品並開啟雙錢包轉帳」在既有選取邊框顏色 assertion 失敗，與本階段派發改動無關，未在此擴大修改。
- [ ] Playwright／Supabase mock 只驗證前端流程與 mock 合約，不代表 Edge Function、RPC、RLS、Realtime 或資料庫交易已在真實隔離環境驗收；正式環境未部署。

## 驗收清單

### 使用者介面

- [x] 公開與秘密物品不再以兩個分頁切換；各自出現在正確分類與顯示模式。
- [x] 私人外框與私人 GP 使用紅色主色調及 `EyeOff` 代表 icon，不以綠色／鎖頭作為 private 語境的主視覺。
- [x] 秘密物品有明確的整體外框語境；前端對無閱讀權限者不呈現秘密物品、數量、重量、搜尋結果或詳情。真實 REST 隔離仍待驗收。
- [x] 錢包摘要以公開 GP 加私人 GP 呈現；私人部分使用 `text-private`，無權限時不透露實際餘額。
- [x] 營地箱不顯示私人區塊／私人錢包；派發 UI 固定公開且不能接收秘密物品。
- [x] DM 派發一般角色可勾選秘密狀態；選營地箱時清除並停用選項，提交值強制公開。

### 交易規則

- [x] 秘密物品轉至其他角色後仍是秘密；公開物品轉移後仍公開；UI 不再要求選擇接收背包。
- [x] 私人物品不能直接轉入營地箱；公開後可依既有來源權限轉入。
- [x] 秘密物品可公開，公開物品不可再轉回秘密；前端透過公開化 RPC、本機 fallback 維持單向規則。資料庫端仍待隔離環境驗收。
- [x] 前端依方向篩選錢包目的端；資料庫 `transfer_campaign_currency` 仍須完成真實 RPC 驗收。
- [ ] 私人 GP 可轉為公開；公開 GP 不能轉回私人。來源不足、同一戶口、目標上限、跨 campaign 或缺少來源修改權皆被拒絕。

### 網路隔離

- [ ] 無私人背包讀取權者的 REST 查詢不回傳任何秘密物品資料，直接請求不依賴 UI 過濾。
- [ ] 無私人錢包讀取權者不能直接讀 `private_gp`、透過角色同步或 Realtime 取得其值，也不能由其他回應推算餘額。
- [ ] 無權限時不會由物品／錢包同步通知、RPC 錯誤、操作摘要、前端 log 或負重指標側漏秘密資訊。
- [ ] 授權者可正常讀取／修改其 ACL 允許的資料；DM 可存取其戰役管理所需資料。
- [ ] 真實隔離環境中的 RLS、欄位 grants、Edge Function/RPC 權限及 Realtime 驗收完成前，不得宣稱安全需求已通過或執行正式部署。

## 開發注意事項

- 不修改已部署 migration；新增 migration 前先檢查 migration history 與 repo 狀態，並依部署文件執行隔離環境驗收。
- 不得讀取、輸出或提交 access token、DB 密碼或 service-role key；不得把 service-role key 放入前端。
- 保留訪客／離線模式與空白遠端戰役語意；不得以範例 seed 回填遠端空資料。
- 保持 `camp-chest` 虛擬 owner、campaign 隔離與文字 ID 慣例；RLS helper 遵守 `TEXT`／`UUID` 型別界線及固定 `search_path`。
- UI、錯誤、Toast、測試名稱與程式註解使用繁體中文；只新增必要註解。
