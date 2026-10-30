# 私人暗袋與錢包整合：開發規劃

## 目標

將角色公開行囊與私人暗袋合併為同一個背包檢視，並在各物品分類中以獨立的秘密語境區分 `isPrivate` 物品；角色公開及私人 GP 錢包則在同一處摘要顯示。移除日常物品操作中反覆選擇背包的步驟，同時保留 ACL，並確保無權限者不能透過 REST、RPC、Realtime 或其他網路回應取得秘密物品資料或私人錢包金額。

本文件只規劃本次 UI、交易與資料隔離改動，不授權執行 migration、部署 Edge Function 或連線／修改 Supabase 專案。

## 目前實作與安全基線

- 背包頁目前以 `bagTab` 在公開／私人背包間切換，分類與操作入口分別位於 [`index.tsx`](../src/routes/_protected/campaigns/$campaignId/index.tsx)、[`InventoryToolbar.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/InventoryToolbar.tsx) 及 [`InventoryGrid.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/InventoryGrid.tsx)。
- 物品以 `inventory_items.is_private` 表示秘密狀態；`CharacterPermission` 仍分別有公開／私人背包及錢包讀取、修改權限，見 [`types.ts`](../src/types.ts) 與 [`useCharacterPermissions.ts`](../src/hooks/useCharacterPermissions.ts)。
- 角色錢包為 `characters.gp`／`private_gp`，營地箱只有 `campaigns.camp_chest_gp`。GP 欄位、精度及相容欄位背景見 [`currency-simplification-plan.md`](./currency-simplification-plan.md)。
- DM 派發已有 `isPrivate` 請求欄位及營地箱強制公開的伺服器規則；現有 dialog 仍以公開／私人背包選項呈現，見 [`ItemDistributionDialog.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/ItemDistributionDialog.tsx)、[`dispatch-campaign-items/index.ts`](../supabase/functions/dispatch-campaign-items/index.ts) 及 [`20261030000015_campaign_activity_and_item_dispatch.sql`](../supabase/migrations/20261030000015_campaign_activity_and_item_dispatch.sql)。
- 目前物品轉移的本機 fallback 會把轉移品改成公開；錢包轉帳 UI 允許選來源與目的錢包。兩者都須與新規則同步，不能只改遠端 UI。相關程式為 [`useInventoryActions.ts`](../src/hooks/useInventoryActions.ts)、[`inventoryTransactions.ts`](../src/lib/inventoryTransactions.ts) 及 [`CurrencyPanel.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/CurrencyPanel.tsx)。
- **安全阻擋項：**本機 migration 定義中的 `inventory_items` RLS 以戰役成員資格為界，且 GP migration 對 authenticated 授予 `gp`、`private_gp` 欄位讀取權。不可把現有 UI 過濾視為網路層隔離；必須先盤點有效 grants、RLS、REST 查詢與 Realtime payload，再建立能依角色 ACL 回傳安全資料的資料庫邊界。參考 [`20261030000012_v0_1_0.sql`](../supabase/migrations/20261030000012_v0_1_0.sql) 與 [`20261030000014_gp_wallet_shop_checkout.sql`](../supabase/migrations/20261030000014_gp_wallet_shop_checkout.sql)。

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

## 驗收清單

### 使用者介面

- [ ] 公開與秘密物品不再以兩個分頁切換；各自出現在正確分類與顯示模式。
- [ ] 私人外框與私人 GP 使用紅色主色調及 `EyeOff` 代表 icon，不以綠色／鎖頭作為 private 語境的主視覺。
- [ ] 秘密物品有明確的整體外框語境；無閱讀權限者看不到秘密物品、數量、重量、搜尋結果或詳情。
- [ ] 錢包摘要以公開 GP 加私人 GP 呈現；私人部分使用 `text-private`，無權限時不透露實際餘額。
- [ ] 營地箱不顯示私人區塊／私人錢包，也不能由 UI 派發私人物品或收取秘密物品。
- [ ] DM 派發一般角色可勾選秘密狀態；選營地箱時強制公開。

### 交易規則

- [ ] 秘密物品轉至其他角色後仍是秘密；公開物品轉移後仍公開；UI 不再要求選擇接收背包。
- [ ] 私人物品不能直接轉入營地箱；公開後可依既有來源權限轉入。
- [ ] 秘密物品可公開，公開物品不可再轉回秘密；UI、本機 fallback、REST/RPC 均一致。
- [ ] 私人錢包可轉至角色公開／私人錢包；公開錢包只可轉至公開錢包；任何角色錢包均可轉至營地箱公開錢包，但營地箱來源只可用公開錢包。
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
