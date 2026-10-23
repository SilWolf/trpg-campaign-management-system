# 移除預設戰役並改由 Edge Function 建立戰役：開發規劃

## 背景與資料模型決策

早期試用期間，專案以 `campaignId = 'default'` 顯示固定的「博德之門：腦噬者危機」示範戰役，示範角色和物品則同時存在前端與資料庫。本計畫逐步移除預設戰役特殊分支，改由使用者建立自己的戰役。

- 不建立 `campaign_templates`、範本角色／物品表或其他範本資料表。前端從版本控制中的 `src/data.ts` 組裝示範內容，隨請求 body 傳至 Edge Function。
- 建立戰役由前端呼叫 Supabase Edge Function；Function 驗證登入者，並呼叫 PostgreSQL 單一交易 RPC。交易建立 campaign、DM 成員、角色及物品，避免前端逐表寫入留下半成品。
- Edge Function 驗證 `sample`／`blank` 類型及 body 中種子資料的結構與數量；建立者 ID 僅取自已驗證的登入者，不接受客戶端提供。service role key 僅留在伺服器端，建團 RPC 僅授權 `service_role`。
- `camp-chest` 是每個戰役都有的虛擬公共儲存庫，不是角色、沒有擁有人，不提供私人背包／錢包。本次不含停用功能。
- 營地箱貨幣放在 `campaigns.camp_chest_currency`；營地箱物品使用 `owner_id = 'camp-chest'`，並以必填 `inventory_items.campaign_id` 隔離不同戰役。
- 資料庫資料列已由維護者清空；保留既有表格。migration 不重建表格、不清資料、不建立 `default` 戰役；SQL 由維護者手動部署。

## 程式現況及改造範圍

| 範圍 | 改造需求 |
| --- | --- |
| 戰役大廳 | 移除固定示範卡片及 `id === 'default'` 過濾，僅顯示使用者實際建立或加入的戰役。 |
| 建立戰役 | 以 Edge Function 建團；示範建團載入 3 角色／9 物品，空白建團建立零角色／物品；成功後使用伺服器回傳 ID，失敗明確顯示錯誤且不導向。 |
| 加入戰役 | campaign row 僅開放成員／DM 讀取後，邀請加入流程須改呼叫 `join_campaign_by_invite_code`，不可直接查 campaign 邀請碼。 |
| 示範資料 | [src/data.ts](../src/data.ts) 使用 `CAMP_CHEST_TEMPLATE`、`INITIAL_CHARACTERS`、`INITIAL_ITEMS`；Edge Function 必須排除虛擬 camp-chest 角色，僅複製三名真正角色和九件物品。 |
| 同步與離線 | 檢查 [useCampaignSync.ts](../src/hooks/useCampaignSync.ts) 等資料流，確保遠端空集合不會自動補入示範資料；保留未設定 Supabase 及訪客模式的退避行為。 |
| camp-chest UI | 保留目前特殊外觀、公共物品及金錢操作；改以 campaign 欄位與 campaign-scoped 物品資料作來源，不能把虛擬箱當成角色 CRUD。 |
| 預設戰役特例 | 逐步檢查角色權限、背包、設定、角色設定面板、開發指引及測試中的 `default` 分支；完成後只保留必要相容性，不再依預設戰役識別碼授權。 |

## 建立戰役與安全性規格

### 建立流程

1. 前端呼叫 `create-campaign`，傳入 `{ name, template: 'sample' | 'blank' }`。
2. Edge Function 驗證 HTTP method、名稱、template、seed 格式／數量和 Bearer token，再由 Supabase Auth `getUser(token)` 取得可信任的 user UUID。
3. Function 使用伺服器端 service-role client，將 request body 中的 seed 原樣傳入 `create_campaign_from_seed(p_name, p_user_id, p_seed)`。`sample` 種子由前端從 `src/data.ts` 組裝；`blank` 由前端傳入空陣列及零餘額錢包。
4. PostgreSQL 函式在單一交易建立 campaign、邀請碼、DM member、角色及物品，將角色擁有人設為建立者，將角色物品 owner 映射至新角色 ID，並回傳新 campaign ID、邀請碼和角色 ID 對照。
5. 任一步驟錯誤均回滾交易；前端只在收到完整成功結果時導向新戰役。

函式固定 `search_path`，使用者資料與 `auth.uid()` 比較時遵守 `uuid`／`text` 型別規則。`create_campaign_from_seed` 不授權 `anon` 或 `authenticated` 執行；只有完成登入驗證的 Edge Function service-role client 能呼叫。`join_campaign_by_invite_code` 則由登入中的 authenticated 使用者呼叫，RPC 使用 `auth.uid()` 確定加入者。

### camp-chest 與前端互動要求

- 每個真正戰役都預設有公共 camp-chest；空白戰役也保有 UI 虛擬庫及零值錢包。此次不加 DM 停用設定。
- `camp-chest` 不存在於 `characters`，不能有 userId／owner、角色權限列、私人背包／私人錢包、角色設定、刪除或角色上限。
- 存入／取出物品須保留 owner 轉移互動，目標 camp-chest 不要求角色擁有權；來源角色的修改權和既有 ACL 規則仍須檢查。
- 營地箱物品寫入時 `owner_id = 'camp-chest'`、`campaign_id = 當前戰役 ID`、`is_private = false`。查詢、排序、更新、刪除、移轉、Realtime、負重計算都依 campaign_id 過濾。
- 營地箱存錢／取錢讀寫 `campaigns.camp_chest_currency`，不可把虛擬錢包存入 `characters.currencies`。跨錢包轉帳需防止重複扣款／入帳及並行更新競爭。
- 保留專屬視覺樣式及公共物品／錢包操作；隱藏角色擁有者、角色設定、私人資料及刪除控制。切換戰役後不得看到其他戰役營地箱物品或錢幣。

## 分階段執行與狀態

### 階段一：確認範圍與資料來源 — 完成

- 前提為資料列已清空、既有 Schema 保留；不安排舊資料匯出、回填或 `default` 資料清理。
- 確認示範資料以 `src/data.ts` 為來源，角色為 `tav`、`shadowheart`、`gale`，物品為 9 件。
- 確認 Schema 快照 `external/schema.md` 不是即時資料庫結果；部署仍需維護者檢視目標專案及 migration history。
- 確立 camp-chest 為無擁有人的虛擬庫，以及戰役隔離欄位需求。

### 階段二：資料庫安全基線與建團後端 — 程式碼完成，待維護者手動部署

- 新增 Supabase 專案設定及既有 Schema 基線檢查；基線不建立既有業務表。
- 增量 migration 新增 `campaigns.camp_chest_currency`；要求 `inventory_items.campaign_id` 非空，建立 campaign 外鍵／索引，限制 camp-chest 物品不可設私人；加入 membership／DM helper、campaign／角色／物品／成員／邀請／權限 RLS、限制非 DM 僅能更新 campaign 公共錢包、邀請碼 RPC、建團交易 RPC 及 campaign Realtime publication。
- 不建立 `campaign_templates` 相關表格或範例 seed SQL。建團 RPC 接收受信任 Edge Function 的 JSON 種子，原子建立資料。
- 新增 `create-campaign` Edge Function：gateway JWT 驗證、伺服器端使用者驗證、固定的 sample／blank 兩種建立模式；service-role key 不進入前端。
- 更新部署文件，要求維護者手動檢查 Schema、Secrets、migration 計畫並部署 SQL／Function。**此工作階段未連線或執行 SQL，資料庫、Edge Function 尚未部署。**

### 階段三：前端建立／加入流程與營地箱資料串接 — 前端實作完成，待隔離環境驗收

- 大廳可選擇範例或空白戰役；範例模式從 `src/data.ts` 傳入三名角色、九件物品及營地箱初始錢包，空白模式傳入空集合和零錢包。正式登入者透過 `create-campaign` 建立並採用伺服器回傳的 ID；訪客／離線仍退回本地示範資料。
- 邀請加入呼叫 `join_campaign_by_invite_code`，不再直接查詢 campaign 邀請碼。
- 遠端同步不再以 `INITIAL_CHARACTERS`／`INITIAL_ITEMS` 回填空集合；camp-chest 僅是前端虛擬角色，不會寫入 `characters`。
- 營地箱物品透過 `inventory_items.campaign_id` 查詢、Realtime、建立、更新及刪除；寫入 camp-chest 的物品會強制公開。營地箱錢包讀寫 `campaigns.camp_chest_currency`，並訂閱 campaigns Realtime；角色刪除、存取／取出及平分操作已改用該錢包狀態。
- 同步失敗會記錄錯誤並將狀態列標示為「同步異常」。本階段未新增或執行 SQL，使用既有階段二 Schema／Edge Function。
- 跨角色與 campaign 錢包目前仍由前端分別寫入角色列與 campaign 列，並非資料庫單一交易；跨客戶端同時轉帳的原子性須在階段五特別驗證，若不能接受短暫或競爭狀態，需另增資料庫轉帳 RPC 並由維護者手動部署。

### 階段四：移除預設戰役特例 — 完成

- 已移除大廳固定示範戰役卡片與 `default` ID 過濾，列表僅呈現 Supabase 回傳的戰役。
- 已移除角色身分 Hook、背包頁、設定頁及角色設定面板內的 `default` 權限／操作分支；DM 身分只依 `campaign_members.role` 判定。
- 已移除設定頁綁定預設戰役的展示假資料與特殊操作限制；未設定 Supabase 時不發起遠端請求，通用訪客／離線模式仍可使用本地背包 seed。
- 保留 `INITIAL_CHARACTERS`／`INITIAL_ITEMS` 作為建立範例戰役的唯一 seed 來源及離線退避資料；將 seed 的 campaign 標記改為 `template`，不再引用 `default`。
- 角色移除改將雙錢包併入 `campaigns.camp_chest_currency`，並將物品移至 `owner_id = 'camp-chest'`；不再建立或更新 `camp-chest` 角色資料列。
- 已更新 `.github/copilot-instructions.md`，明確記錄不得以特殊 campaign ID 授權或切換離線行為。
- 本階段未新增或執行 SQL；遠端角色移除的跨列操作仍非單一資料庫交易，維護者部署後須在階段五驗收失敗情境與競爭狀態。

### 階段五：隔離環境驗收及手動上線 — 本機驗收完成，Supabase 隔離驗收／手動上線待維護者執行

- 維護者在隔離 Supabase 專案核對 Schema、套用 migration、部署 Edge Function 並驗證 Secrets；此階段不由程式碼任務自動部署。
- 執行建團成功／失敗回滾、service-role 權限、邀請加入、RLS、Realtime、跨戰役物品／錢包隔離驗收。
- 執行 `npm run typecheck`、`npm run lint`、相關 E2E 與 `npm run build`；端對端測試應 mock Edge Function，不接真實 Supabase。
- 本機驗收已完成：`npm run typecheck`、`npm run lint`、`npm run test:e2e`（23 項通過）及 `npm run build` 均通過。Playwright 的 Supabase Auth、REST、RPC 與 Edge Function 均使用測試替身，未連線真實 Supabase。
- 隔離 Supabase 的 migration／Function 部署、Secrets、資料庫交易回滾、RLS、Realtime 與跨客戶端競爭狀態尚未驗證；因本工作階段未取得維護者指定的 Supabase 專案與手動部署結果，不得視為已完成隔離環境驗收或上線。請依 [database-template-migration.md](./database-template-migration.md) 由維護者手動執行並記錄結果。

## 驗收清單

- 無 `campaign_templates` 或 template 相關資料表；不建立 `default` campaign。
- `sample` 建團有 3 個真正角色、9 件物品；不將 camp-chest 寫成角色。`blank` 建團不建立角色／物品，camp-chest 錢包五幣種皆為零。
- 每名 sample 角色的 `user_id` 及 `campaigns.dm_id` 指向經驗證登入者；成員列的 `user_id` 維持 UUID。
- 所有物品 campaign_id 指向新戰役；角色物品 owner 重新映射；camp-chest 物品若有，owner 為 camp-chest 且不私人。
- 未登入、錯誤輸入或資料庫錯誤不可留下半成品；authenticated／anon 不能直接呼叫建團 RPC。
- 非成員無法讀取其他戰役、錢包、物品或 Realtime 事件；有效邀請碼可加入、無效邀請碼失敗、重複加入不會改變原角色。
- UI 保留 camp-chest 專屬呈現與存取公共物品／貨幣互動，沒有 owner／private 的角色行為，不跨 campaign 顯示或寫入資料。
- 訪客、未設定 Supabase 和離線模式保有已支援的退避行為。

## 手動部署與操作說明

詳細 Schema 前置檢查、migration dry-run、Edge Function 部署、secrets 管理及手動驗收步驟，見 [database-template-migration.md](./database-template-migration.md)。執行任何 SQL 或部署前，維護者須確認 Supabase project ref 和遠端 migration history。
