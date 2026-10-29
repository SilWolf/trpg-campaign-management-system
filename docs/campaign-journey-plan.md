# 戰役冒險筆記（`campaign_journey`）：開發規劃

## 目標

在每個戰役中加入冒險筆記，供成員記錄劇情、線索與任務進度。戰役成員可依筆記的公開／私人閱覽權限瀏覽內容；DM 另有只對 DM 開放的筆記欄位。任務與結束狀態可供列表篩選。

本功能沿用現有 campaign 成員身分、角色 ACL、TanStack Router、Supabase 同步模式與暗黑奇幻 UI，不建立跨戰役的全域筆記。

## 已確認需求與待採用規則

| 項目 | 規則 |
| --- | --- |
| 筆記內容 | 標題為純文字；標籤為選填逗號分隔文字；主要內容及 DM 筆記為 Markdown。 |
| 所屬角色 | 可為角色 ID 或 `null`；`null` 表示公開筆記，不屬於任何角色。角色 ID 必須指向同一戰役內的角色。 |
| 閱覽權 | 每篇筆記有「公開」或「私人」設定。公開筆記可供戰役成員閱讀；私人筆記依所屬角色的「冒險筆記」ACL 控制。 |
| 私人筆記與角色 | 建議私人筆記必須指定所屬角色；`character_id IS NULL` 且為私人時由資料庫拒絕。這避免「無所屬角色的私人筆記」沒有可套用 ACL 的歧義。 |
| 公開筆記管理 | DM 可閱讀、新增、修改及刪除所有公開筆記。玩家可閱讀及新增公開筆記，但只有建立者可修改或刪除自己建立的公開筆記。 |
| 私人筆記管理 | 角色 ACL `journey_access = 1` 可閱讀該角色私人筆記；`journey_access = 2` 可閱讀、新增、修改及刪除。`0` 無權限。私人筆記不因建立者身分而繞過 ACL。 |
| DM 角色權限 | DM 對戰役內所有角色的冒險筆記皆視為 `journey_access = 2`，不依賴逐角色權限列是否存在。 |
| DM 筆記 | 僅 DM 可讀寫；非 DM 的查詢回應不得包含 DM 筆記欄位或其內容。 |
| 建立者與時間 | 建立者由登入者身分決定、建立時間由資料庫產生；一般更新不可改寫這兩欄。 |
| 任務狀態 | `is_quest` 與 `is_completed` 為布林旗標，供前端篩選；不隱含其他任務流程或通知。 |
| 持久化範圍 | 登入戰役成員使用 Supabase 遠端資料；離線／訪客不可冒充遠端同步或取得私人及 DM 資料。 |

## 範圍

### 第一階段包含

- 新增戰役冒險筆記列表、篩選、新增、檢視、編輯及刪除。
- 筆記公開／私人設定、角色歸屬、建立者及建立時間。
- 角色「冒險筆記」數值 ACL（`0`、`1`、`2`），整合現有角色設定與權限管理介面。
- DM 專屬 Markdown 筆記，於資料庫 RLS 和查詢介面雙重限制。
- campaign-scoped Supabase migration、RLS、索引、Realtime 及前端資料轉換。
- `/campaigns/$campaignId/journeys` 與 `/campaigns/$campaignId/journeys/$journeyId` 路由。
- 以 BG3 任務日誌為靈感的分類側欄／任務列表與筆記詳情介面。
- 純文字標題與標籤；Markdown 顯示沿用專案既有 Markdown 元件／安全設定。

### 第一階段不包含

- Markdown 附件、圖片上傳、富文字編輯器或版本歷史。
- 角色間共享私人筆記、筆記留言、通知或即時協作編輯。
- 子任務、任務依賴、完成獎勵或自動化任務狀態。
- 將訪客／離線本機筆記上傳或合併到遠端戰役。
- 讓非 DM 讀取或搜尋 DM 筆記內容。

## 路由與介面構想

依現有戰役商店的巢狀路由與側欄模式新增：

- `src/routes/_protected/campaigns/$campaignId/journeys/route.tsx`：筆記區共用導覽／列表側欄與巢狀頁面框架。
- `src/routes/_protected/campaigns/$campaignId/journeys/index.tsx`：總覽、建立入口及篩選結果。
- `src/routes/_protected/campaigns/$campaignId/journeys/$journeyId.tsx`：單篇筆記詳情及可用的編輯／刪除操作。
- 在戰役導覽列新增「冒險筆記」入口，保留現有背包、商店及設定連結。

介面方向：

- 採用 BG3 任務日誌的「任務分類／清單＋詳情」資訊層次，延續專案深石色底、琥珀色重點與襯線標題。
- 列表可切換全部、任務、已結束等條件，並以標籤或角色作為輔助篩選；預設不把私人筆記暴露在不具備該角色閱讀權的玩家列表中。
- 詳情顯示標題、標籤、角色、建立者、建立時間、任務／完成狀態及 Markdown 內容。
- 私人筆記標示所屬角色及私人狀態；DM 專屬內容只在 DM 身分確認後顯示。
- 只有具備相應權限時才顯示建立、編輯、刪除控制；前端隱藏控制只改善 UX，不能取代 RLS。
- 刪除前確認；載入、儲存、權限拒絕及同步錯誤需明確呈現，不可顯示成功狀態作為失敗退避。

## 資料模型建議

採用獨立 campaign-scoped 筆記資料表與獨立 DM 私密內容表，避免非 DM `SELECT *` 讀取一般筆記時接觸 DM 筆記欄位。

### `campaign_journeys`

| 欄位 | 型別／規則 |
| --- | --- |
| `id text` | 主鍵；使用應用程式既有文字 ID 格式。 |
| `campaign_id text NOT NULL` | 所屬戰役，外鍵指向 `campaigns(id)` 並 `ON DELETE CASCADE`。 |
| `title text NOT NULL` | 純文字標題，去除首尾空白後不可為空；設定合理長度上限。 |
| `tags text` | 可為 `NULL`／空字串的逗號分隔標籤；原始值保留為純文字。 |
| `content text NOT NULL DEFAULT ''` | 主要 Markdown 內容。 |
| `character_id text` | 可為 `NULL`；非空時指向同一戰役角色。不得以 UUID 型別處理角色 ID。 |
| `created_by uuid NOT NULL` | 建立者，指向登入帳號／`auth.users(id)`；由資料庫根據 `auth.uid()` 設定。 |
| `created_at timestamptz NOT NULL DEFAULT now()` | 建立時間；客戶端不可任意覆寫。 |
| `is_quest boolean NOT NULL DEFAULT false` | 是否為任務。 |
| `is_completed boolean NOT NULL DEFAULT false` | 是否已結束。 |
| `visibility text NOT NULL DEFAULT 'public'` | 僅接受 `public`／`private` 的 CHECK constraint。 |

資料庫需拒絕私人但沒有 `character_id` 的筆記，並驗證指定角色與 `campaign_id` 一致。可用 `(campaign_id, character_id)` 複合外鍵（前提是目標表有對應唯一鍵），或以受限 trigger 驗證；不可只依賴前端傳入正確角色。

角色刪除是明確例外：刪除前必須在同一資料庫交易中，將該角色所有冒險筆記的 `character_id` 設為 `NULL`，並將 `visibility` 設為 `public`，再刪除角色。不能單靠外鍵 `ON DELETE SET NULL`，因為它不會同步改變閱覽權；也不能因角色刪除而一併刪除筆記。轉為公開後，筆記保留標題、標籤、內容、任務旗標、建立者及建立時間；關聯的 DM 專屬內容仍僅 DM 可讀。

建議索引：

- `(campaign_id, created_at DESC)` 支援戰役列表及時間排序。
- `(campaign_id, is_quest, is_completed)` 支援任務狀態篩選。
- `(campaign_id, character_id, visibility)` 支援角色私人筆記篩選。

標籤為原始逗號分隔文字，前端解析時 trim、略過空標籤並避免重複呈現；第一階段不需要為標籤建立資料庫正規化關聯表。

### `campaign_journey_dm_notes`

- `journey_id text PRIMARY KEY`，外鍵指向 `campaign_journeys(id)` 並 `ON DELETE CASCADE`。
- `campaign_id text NOT NULL`，同時記錄戰役範圍，並以約束／trigger 保證與主筆記一致。
- `content text NOT NULL DEFAULT ''`，DM 專屬 Markdown 筆記。
- 可選擇加入 `updated_at timestamptz`，於更新時由資料庫維護。

DM 內容放在獨立資料表，可使非 DM 對主表的讀取完全不包含 DM 欄位。非 DM 不可讀取此表；不可把 DM 筆記放進所有成員可查詢的 JSON 欄位、一般筆記 API 回應或 Realtime payload。

## 角色 ACL 擴充

在 `character_permissions` 新增 `journey_access smallint NOT NULL DEFAULT 0`，constraint 限定 `0`、`1`、`2`。前端型別沿用 `AccessLevel`：

- `0`：不可檢視該角色的私人筆記。
- `1`：可閱讀該角色的私人筆記；不能新增、修改或刪除。
- `2`：可閱讀並管理該角色的私人筆記。

需同步更新：

- `CharacterPermission` 及 `DbCharacterPermission`。
- `toDbPermission`／`fromDbPermission` 雙向轉換及舊資料 fallback（`0`）。
- `useCharacterPermissions` 的 evaluated 權限與 DM／角色擁有者／其他玩家預設規則。
- 角色設定權限面板的中文欄位、`0/1/2` 控制與保存驗證。
- 權限 upsert、Realtime 更新，以及既有角色建立／權限列初始化路徑。

預設採取最低權限：DM 由資料庫 helper／policy 視為 `2`；角色擁有人沿用現有權限初始化方式取得 `2`；其他玩家預設 `0`，由 DM 明確授權。若既有 DB Trigger 負責建立預設 permission row，migration 必須更新該路徑，不能只修改前端 Hook。DM 權限不可仰賴前端 `isDm` 旗標。

## 角色刪除與筆記解除關聯

將戰役設定中的角色刪除操作由前端直接寫入改為呼叫專用 Edge Function。前端仍負責確認對話及成功／失敗提示，但不可再直接更新筆記、搬移物品／貨幣或刪除角色。

Edge Function 應驗證 Authorization 標頭中的登入憑證，並以 Supabase Auth 取得實際呼叫者 ID、驗證請求欄位，再呼叫受限的 PostgreSQL 交易 RPC。RPC 在同一交易內完成角色刪除流程，以資料庫讀取的最新資料為準：

1. 驗證呼叫者是該戰役 DM，或對目標角色具備 `can_delete_character`；不可相信前端傳入的權限旗標或角色快照。
2. 驗證角色屬於指定戰役、不是虛擬 `camp-chest`，且刪除後仍至少保留一名實體角色。
3. 將所有 `campaign_journeys.character_id` 指向目標角色的筆記改為 `NULL`，並將其 `visibility` 設為 `public`。此更新不改變建立者、建立時間、內容或任務狀態。
4. 按既有規則將角色公開／私人背包物品及公開／私人錢包貨幣併入該戰役 `camp-chest`；物品合併、公開化及裝備／調諧狀態清理必須一併處理。
5. 刪除角色及其角色權限資料，並確保不會因外鍵 cascade 刪除已解除關聯的冒險筆記。

RPC 撤銷一般 `authenticated`／`anon` 的直接執行權，只允許由 Edge Function 使用的 `service_role` 呼叫。Edge Function 先透過 Supabase Auth 驗證 token，再將驗證得到的 actor ID 傳給 RPC；RPC 仍須以資料庫資料確認該 actor 對目標角色具備刪除權限，不可把「呼叫端是 service role」當成使用者已獲授權。不可在 Edge Function 以多次 REST 寫入模擬交易，避免筆記已公開但角色刪除或營地箱移轉失敗的部分完成狀態。

角色刪除成功後，前端依 RPC 結果刷新角色、物品、貨幣及筆記資料；失敗時顯示錯誤，交易回滾後原角色與筆記關聯均須保留。離線／訪客模式只能依既有產品規則處理本機資料，不可呼叫遠端 Edge Function 或顯示雲端刪除成功。

## 資料庫授權與 DM 欄位保護

所有 policy/helper 以 `campaign_id text` 為主要隔離條件，並確認呼叫者為戰役成員或 DM。角色與建立者 ID 型別不同，授權時需遵守：

- `campaigns.dm_id`、`characters.user_id` 是 `text`；比較登入者時明確使用 `auth.uid()::text`。
- `character_permissions.user_id`、`created_by` 是 `uuid`；不可把角色文字 ID 直接轉成 UUID。
- 角色所屬戰役與建立者驗證要在資料庫完成。

建議建立具固定 `search_path = public`、`STABLE`、`SECURITY DEFINER` 的授權 helper，分別判定 campaign DM、筆記可讀／可寫及角色 `journey_access`。所有 helper 撤銷 `PUBLIC`／`anon` 的不必要權限，只授予適當角色執行權。

RLS 至少覆蓋：

1. **主筆記 SELECT**：戰役成員可讀公開筆記；私人筆記只對 DM 或具角色 `journey_access >= 1` 的成員可見。
2. **公開筆記 INSERT**：DM 或戰役成員可建立；`created_by` 必須等於 `auth.uid()`，且一般成員只能建立公開筆記。
3. **公開筆記 UPDATE／DELETE**：DM 可管理所有公開筆記；玩家僅能管理 `created_by = auth.uid()` 的公開筆記。玩家不得藉更新把建立者、campaign、角色歸屬或 visibility 改成其他值以繞過權限。
4. **私人筆記 INSERT／UPDATE／DELETE**：DM 或目標角色 `journey_access = 2` 的成員可管理；`journey_access = 1` 僅能讀取。
5. **DM 私密表 SELECT／INSERT／UPDATE／DELETE**：只允許 campaign DM；必要時透過安全 helper 驗證父筆記及 campaign 一致。
6. **欄位不可變性**：以資料庫約束／trigger 或安全 RPC 保護 `created_by`、`created_at`，並限制可更新欄位，避免依賴 UI 避免竄改。
7. **角色刪除**：一般成員不可直接刪除角色或任意清空筆記角色關聯；僅由授權 Edge Function 呼叫交易 RPC，於同一交易內解除關聯、將筆記轉公開並完成角色與營地箱資料處理。

RLS policy 不得在 policy 條件中直接查詢 `campaign_journeys` 或 `character_permissions` 自身表格造成遞迴；跨表授權檢查應封裝於符合專案規範的 `SECURITY DEFINER` helper。需特別測試 PostgreSQL 對 `UPDATE` 的 `USING`／`WITH CHECK` 行為，避免玩家透過同一筆更新改變 visibility、character 或 campaign 後取得額外權限。

DM 私密內容由 DM 專用查詢分支載入；非 DM 的前端程式不得發出 DM 私密表查詢。即使偽造請求，RLS 仍須拒絕。Realtime 不應讓非 DM 訂閱或收到 DM 私密表 payload。

## 前端資料流

- 新增 `CampaignJourney` 與資料庫 row 型別，camelCase／snake_case 雙向轉換集中於 `src/lib/supabase.ts`。
- 新增專屬 journey data helper 管理列表、單篇讀取、建立、更新、刪除與 DM 欄位載入；所有操作明確帶入當前 `campaign_id` 並處理 Supabase 錯誤。
- 列表主查詢只讀 `campaign_journeys` 可見欄位；完成 DM 身分確認後才額外讀取 `campaign_journey_dm_notes`。
- 前端依 ACL 與建立者資訊提供合適操作，但以資料庫 RLS 為最終授權依據。
- 使用 Realtime 訂閱 campaign 筆記表的變更，更新列表／詳情；DM 私密表只由 DM 頁面訂閱，或在第一階段選擇儲存後重新載入，避免暴露跨角色事件。
- 切換 campaign 或登入者時清除舊列表及詳情狀態，避免短暫顯示其他戰役內容。
- guest／未設定 Supabase 時明確提示雲端筆記不可用，不回填範例資料、不假裝已同步；如需離線筆記另立需求。

## 實作階段

以下階段可分別在新對話中執行。每次開工先讀本規劃、相關現有程式與工作目錄狀態；不得覆蓋其他未提交變更，也不可手動修改自動生成的 `src/routeTree.gen.ts`。一個階段完成並通過其退出條件後，再開始下一階段；若發現既有 schema／權限與假設不符，先停下記錄差異，不要猜測或直接套用正式環境。

### 階段一：Schema 與授權 migration

**目標與工作項目**

- 新增單一增量 migration，不修改已存在的歷史 migration。migration 檔名採 repository 現有時間戳命名慣例。
- 建立 `campaign_journeys`、`campaign_journey_dm_notes`，加入主鍵、必要欄位、外鍵、唯一／檢查條件及列表查詢索引。
- 確保 campaign ID、角色 ID 為 `text`，建立者及權限使用者 ID 為 `uuid`；角色與 campaign 的一致性在資料庫驗證。
- 為 `character_permissions` 新增 `journey_access`，提供舊資料 fallback `0` 並限制數值只能是 `0/1/2`。
- 加入 campaign 成員、DM、角色 ACL、建立者判斷所需的安全 helper 與 RLS policies。檢視／更新／刪除政策需分開推演 `USING` 與 `WITH CHECK`，不可只測正常查詢。
- 私人筆記必須綁定同 campaign 角色；刪除角色時由刪除交易 RPC 先解除筆記關聯並轉公開，不可讓 FK cascade 刪除筆記。
- DM 私密內容獨立存放並限制資料表 grants、RLS、Realtime；確認非 DM 主查詢及訂閱不會取得 DM 內容。
- 建立角色刪除交易 RPC：只允許 service role 呼叫，由 RPC 再以 actor ID 核實 DM／`can_delete_character` 授權，並確保完整刪除交易原子化。
- 檢查 Supabase Realtime publication 是否需要新增表；採用專案既有的顯式 publication 管理方式，避免重複加入或假設遠端設定。

**產出**

- 一個可重複檢查前置條件、失敗時安全中止的增量 migration。
- 如專案現有測試慣例適用，新增 SQL 權限驗收腳本；測試需能 rollback 或在隔離資料庫清理。
- 對手動部署／隔離環境驗收步驟的簡短文件更新；不得在此階段連線或執行正式環境 SQL。

**退出／驗收標準**

- [ ] Migration 僅依賴 repository 已確認存在的 schema；對必要欄位、型別或唯一鍵不符時明確失敗，不猜測補資料。
- [ ] 新增筆記可用 `character_id = NULL` 且為公開；私人筆記無角色或角色屬於其他 campaign 時被拒絕。
- [ ] 所有筆記 CRUD 都有 campaign 範圍限制；跨戰役讀寫、偽造建立者與玩家管理他人公開筆記的測試均被拒絕。
- [ ] 私人筆記 ACL 0/1/2、公開筆記建立者規則、DM 例外均以 SQL/RLS 測試覆蓋。
- [ ] 非 DM 直接讀取 DM 私密表被拒絕，且一般筆記查詢及 Realtime 不包含 DM 內容。
- [ ] 使用一般 `authenticated`／`anon` 直接執行角色刪除 RPC 被拒絕；service role 呼叫時仍由 RPC 驗證 actor 權限。
- [ ] 角色刪除 RPC 的成功路徑會解除關聯、把筆記轉公開並刪除角色；任一步驟失敗時所有資料回滾。
- [ ] 說明真實資料庫驗收的隔離環境、角色矩陣與結果；mock 測試不得描述成已驗證真實 RLS。

### 階段二：型別與資料存取

**目標與工作項目**

- 在 `src/types.ts` 新增筆記 domain type、可見性型別及必要的列表篩選型別。
- 在 `src/lib/supabase.ts` 新增 `DbCampaignJourney`、DM 私密 row 型別及明確的 `toDb*`／`fromDb*` 雙向轉換；對新增或可空欄位提供向下相容 fallback。
- 新增專用 journey data helper（建議 `src/lib/campaignJourneys.ts`），封裝 campaign-scoped 列表／單篇讀取、建立、更新、刪除及錯誤處理，不把 UI 元件直接耦合到 snake_case。
- 主筆記 query 明確選取允許讀取的欄位，不使用寬泛 `select('*')`；DM 私密內容使用獨立、僅在 DM 判定完成後呼叫的讀寫 helper。
- 建立與更新操作不得允許客戶端指定／改寫 `created_by`、`created_at`；資料庫仍為最終防線。
- 標籤解析與序列化採穩定規則：以逗號分隔、trim、忽略空值；不要把標籤文字當 HTML。
- 定義 helper 的錯誤契約，將 Supabase 錯誤往呼叫端明確回傳／拋出；不吞錯或回傳偽成功資料。

**可能涉及檔案**

- `src/types.ts`
- `src/lib/supabase.ts`
- `src/lib/campaignJourneys.ts`（新增）
- 對應的 Vitest／Node 測試或 repository 已使用的測試位置（先確認既有測試架構；不要為此任意新增測試工具）。

**退出／驗收標準**

- [ ] Domain type 與 DB type 分離，轉換器完整涵蓋所有欄位、null 值與 fallback。
- [ ] 轉換器 round-trip 測試驗證公開筆記、私人筆記、無角色筆記、旗標及標籤資料。
- [ ] 所有查詢、更新、刪除均綁定 `campaign_id`；單篇查詢不會跨 campaign 取得資料。
- [ ] DM 欄位不出現在一般 domain query 的 select shape；非 DM 不會呼叫 DM 私密 helper。
- [ ] Supabase 失敗會以可辨識錯誤回傳；沒有靜默忽略、預設成功或以空資料偽裝成功。
- [ ] `npm run typecheck` 通過；若專案沒有單元測試工具，明確採用可用的既有測試方式而非安裝額外框架。

### 階段三：角色權限設定

**目標與工作項目**

- 擴充 `CharacterPermission`、`DbCharacterPermission`、轉換器、Realtime／同步資料路徑與所有明確建構 permission object 的位置，新增 `journeyAccess`／`journey_access`。
- `useCharacterPermissions` 的 evaluated result 加入冒險筆記閱讀與管理能力，沿用 `0/1/2` 語意；DM 必須直接得到 `2`，不依賴 permission row。
- 在角色權限設定介面新增「冒險筆記」控制，清楚說明 `0` 無權限、`1` 可讀私人筆記、`2` 可讀寫私人筆記。
- 按既有自鎖規則限制誰可調整他人的 permission row，禁止一般玩家修改自己的 ACL；UI 權限仍須受資料庫 RLS 約束。
- 核對角色建立者預設權限的前端與 DB Trigger／RPC 初始化流程。所有舊角色／舊 permission row 的缺省值須一致為 `0` 或依已確認的建立者預設設為 `2`，不可由 UI 單邊補權。

**可能涉及檔案**

- `src/types.ts`、`src/lib/supabase.ts`
- `src/hooks/useCharacterPermissions.ts`、`src/hooks/useCampaignSync.ts`
- `src/routes/_protected/campaigns/$campaignId/settings/index.tsx`
- `src/routes/_protected/campaigns/$campaignId/settings/-parts/CharacterSettingsPanel.tsx`
- 若權限預設建立於 DB，回到階段一 migration 補足並重新執行 SQL 驗收。

**退出／驗收標準**

- [ ] 每個 permission 建構、DB 轉換及 upsert 都包含 `journeyAccess`，舊資料缺欄位時不造成 undefined。
- [ ] 權限矩陣測試覆蓋 DM、角色建立者、其他玩家及 `0/1/2`，並與 RLS 規則一致。
- [ ] UI 顯示中文名稱及明確等級描述；玩家不能藉 UI 修改自己的權限列。
- [ ] DM 權限無法被 permission row 的低值、缺值或 Realtime 更新降級。
- [ ] `npm run typecheck` 與 `npm run lint` 通過；相關權限 UI 測試通過。

### 階段四：角色刪除 Edge Function 與交易 RPC

**目標與工作項目**

- 新增專用 Edge Function（建議 `supabase/functions/delete-campaign-character/index.ts`），限制 POST、驗證請求大小／欄位、驗證 Authorization token 並以 Supabase Auth 取得 actor ID。
- Edge Function 不接受客戶端傳入的角色快照、物品列表、貨幣餘額或權限結果；請求只含必要 campaign／character 識別碼。
- 新增受限 RPC，於單一資料庫交易重新讀取 campaign、角色、權限、物品及貨幣，驗證 campaign／角色關係與 actor 權限。
- RPC 保留既有規則：不可刪除虛擬 `camp-chest` 或最後一名實體角色；整合角色公開／私人物品、堆疊、裝備狀態及雙錢包貨幣至營地箱。
- 在刪除角色之前，將所有關聯筆記 `character_id` 設為 `NULL` 且 `visibility` 設為 `public`；筆記其他欄位與 DM 私密表資料保留。
- 僅授予 `service_role` 執行 RPC；Edge Function 驗證 token 後傳入 actor ID，RPC 仍需驗證此 actor 是 DM 或有 `can_delete_character` 權限。
- 把目前 `settings/index.tsx` 的多次直接 REST 寫入替換成 Edge Function 呼叫；確認所有角色刪除入口都使用相同路徑，並在成功後更新前端狀態。
- 更新 `supabase/config.toml`／部署文件（若該 function 需調整 gateway 設定），不得把 service role key 放入前端。

**退出／驗收標準**

- [ ] 未登入、無效 token、格式錯誤或超量請求被拒絕且不觸碰資料。
- [ ] 無刪除權限玩家、跨戰役角色 ID、虛擬角色及最後一名實體角色均被拒絕。
- [ ] DM 與具 `can_delete_character` 的授權使用者成功刪除時，筆記轉公開、角色刪除、角色物品／雙錢包移轉同交易完成。
- [ ] 注入 RPC 中任一失敗情境後，確認筆記關聯／visibility、角色、物品與 campaign 貨幣全部回滾。
- [ ] 一般 authenticated／anon 不能直接呼叫刪除 RPC；Edge Function 不回傳 service role 或私密資料。
- [ ] UI 在成功時刷新正確狀態，在失敗時保留畫面資料並顯示明確錯誤；不可樂觀移除後不回復。
- [ ] 增加 Edge Function 請求合約測試及 SQL 交易測試；mock 通過後仍須列出隔離 Supabase 真實驗收步驟。

### 階段五：戰役導航、列表與一般筆記詳情

**目標與工作項目**

- 新增 journey 巢狀路由檔案，實作列表／詳情共用 layout、總覽及單篇頁；沿用 TanStack Router 慣例與路由頂部 lint 註解，不手改 `routeTree.gen.ts`。
- 在戰役導覽列加入入口，確認小螢幕導覽不溢位，原有背包、商店、設定路由不受影響。
- 實作 BG3 任務日誌式雙欄／窄螢幕適配：分類／篩選列表與右側（手機為獨立路由）筆記詳情，使用既有色彩 token 與 UI 元件。
- 實作公開筆記列表、新增、編輯、刪除、確認對話及空狀態；私人筆記依權限呈現，但本階段可先不顯示／載入 DM 專屬欄位。
- 提供全部／任務／已結束篩選，並可依角色、標籤輔助篩選；篩選只影響目前使用者已獲授權取得的資料。
- 讓 `character_id = NULL` 的筆記可在建立／編輯表單選為公開；私人筆記必須選擇角色。一般玩家新增公開筆記預設 `created_by` 由資料庫填入。
- Markdown 內容沿用 `react-markdown` 或專案現有安全元件；標題／標籤只以文字顯示。
- 明確處理載入、空清單、未知 ID、無權限、儲存失敗及刪除失敗；不以空白頁或 toast 成功掩蓋錯誤。

**可能涉及檔案**

- `src/routes/_protected/campaigns/$campaignId/route.tsx`
- `src/routes/_protected/campaigns/$campaignId/journeys/route.tsx`（新增）
- `src/routes/_protected/campaigns/$campaignId/journeys/index.tsx`（新增）
- `src/routes/_protected/campaigns/$campaignId/journeys/$journeyId.tsx`（新增）
- `src/routes/_protected/campaigns/$campaignId/journeys/-parts/*`（按需要新增）

**退出／驗收標準**

- [ ] 戰役入口、列表及詳情可直接導覽、重新整理，正確處理未知 campaign／journey ID。
- [ ] 建立／編輯／刪除公開筆記後，列表及詳情一致；玩家只能管理自己的公開筆記，DM 可管理所有公開筆記。
- [ ] 私人筆記依 ACL 0/1/2 正確隱藏、可讀或提供管理操作；伺服器拒絕時 UI 顯示錯誤。
- [ ] 任務及完成篩選、標籤與角色輔助篩選結果正確，不因篩選洩漏無權限筆記標題或筆數。
- [ ] Markdown／純文字欄位顯示安全；窄螢幕與桌面可用，沒有橫向溢出或路由導航迴歸。
- [ ] `npm run typecheck`、`npm run lint` 及相關 Playwright 測試通過；不修改自動生成路由樹。

### 階段六：DM 專屬欄位與即時同步

**目標與工作項目**

- 只有確認 `isDm` 且 campaign 身分已載入後，才讀取 `campaign_journey_dm_notes`；未知／載入中的身分不得先發出 DM 私密查詢。
- 實作 DM 專屬筆記編輯與儲存，區分空內容與尚未載入；寫入只走 DM 私密資料 helper，主筆記 CRUD 不攜帶 DM 內容。
- 若 DM 筆記不存在，定義首次讀取與儲存策略（建議讀取視為空內容、第一次儲存才 insert），處理唯一鍵競爭並呈現錯誤。
- 加入主筆記 Realtime 更新及 DM 專屬同步策略；DM 私密資料僅 DM 訂閱，或採儲存後重新載入。不要以所有成員可收到的頻道傳遞 DM payload。
- campaign、登入者或 DM／玩家身分變更時立即清除前一個 campaign 的列表、單篇、草稿與 DM 內容；請求晚回時不可覆寫新 campaign 狀態。
- 處理他人更新／刪除目前正在檢視筆記時的 UI 更新，保留明確錯誤與重新載入能力。

**退出／驗收標準**

- [ ] 玩家操作時 Network／mock 呼叫紀錄中沒有 DM 私密表查詢、寫入或訂閱。
- [ ] DM 可建立／更新 DM 專屬 Markdown 筆記；玩家直接 REST/RPC 嘗試讀寫均被 RLS 拒絕。
- [ ] DM 私密內容不出現在一般 query、主表 Realtime payload、錯誤訊息、非 DM DOM 或客戶端 log。
- [ ] 戰役／登入切換、請求競速及登出後不會殘留或回填前一狀態的內容。
- [ ] 多使用者修改主筆記時列表與詳情一致；DM 私密更新按選定策略同步，無權限事件不洩漏內容。
- [ ] 相關測試涵蓋角色載入時序、權限變更、同步錯誤與 campaign 切換；`npm run typecheck`、`npm run lint` 通過。

### 階段七：整合驗收與手動部署文件

**目標與工作項目**

- 整理全功能測試矩陣：資料轉換、權限 helper、路由、筆記 CRUD、私人 ACL、DM 欄位、角色刪除及錯誤回復。
- 執行變更範圍內的測試後，再跑專案既有完整驗證：`npm run typecheck`、`npm run lint`、`npm run test:e2e`、`npm run build`。遇到與變更無關的既存失敗需列明，不要掩蓋。
- 更新 `docs/database-template-migration.md` 或新增相鄰部署文件：migration 順序、Edge Function 名稱／部署步驟、所需 Secrets（只列名稱、不記錄值）、RPC 權限與 rollback／備份注意事項。
- 由維護者先確認目標 Supabase 專案、既有 schema 及 migration history，再在隔離專案手動套用 migration、部署 function、測試真實 RLS／Realtime；本階段不連線或部署正式環境。
- 驗收筆記刪除交易與 DM 保密，將 UI mock／E2E 證據和真實資料庫驗收結果分開記錄。

**退出／驗收標準**

- [ ] 所有自動化指令結果與必要的既存問題均記錄清楚；完整測試通過或有可重現、明確描述的環境阻塞。
- [ ] 隔離 Supabase 以 DM、筆記建立者、其他成員 ACL 0／1／2、非成員測試真實 RLS；檢查 REST 與 Realtime payload 不含 DM 內容。
- [ ] 真實 Edge Function 測試涵蓋有效／無效 token、權限拒絕、成功刪除及交易回滾。
- [ ] 部署說明包含 migration／Function 順序、驗收清單與失敗處理；不含任何 Secrets。
- [ ] 文件明確聲明 mock/E2E 通過不等於 Supabase 真實環境驗收；正式部署需維護者確認並執行。

### 新對話開工順序

建議先以**階段一**作為第一個開發對話，完成後依序處理階段二至七。每次新對話可提供本文件連結並指定單一階段，要求先檢查現有 worktree／schema／相關程式，再只完成該階段並回報：

1. 實際修改檔案與資料庫物件。
2. 已執行的測試命令及結果。
3. 尚未完成的驗收項與阻塞。
4. 是否需要維護者在隔離 Supabase 專案手動驗收。

不可把某一階段的 mock 測試結果當作後續階段的資料庫部署授權；不可自動連接或修改正式 Supabase 專案。

## 驗收清單

### 權限與資料隔離

- 非戰役成員不能讀寫戰役筆記；其他戰役的筆記不會出現在列表、詳情、Realtime 或錯誤回應中。
- 成員可閱讀公開筆記；玩家可建立公開筆記，並只能修改／刪除自己建立的公開筆記。
- DM 可修改／刪除任何公開筆記，不受建立者限制。
- 私人筆記只有 DM 或該角色 `journey_access >= 1` 的玩家可讀；`1` 無法新增、修改或刪除；`2` 可完整管理。
- DM 預設可讀寫任何角色私人筆記，即使沒有 permission row。
- `character_id IS NULL` 的公開筆記可正常讀寫；私人筆記無角色時由資料庫拒絕。
- 刪除角色時，與其關聯的公開及私人筆記都保留，`character_id` 變為 `NULL` 且 `visibility` 變為 `public`；筆記其他內容及建立資訊不變，DM 專屬內容仍只對 DM 開放。
- 未獲授權者不得直接刪除角色或呼叫角色刪除 RPC；授權刪除經 Edge Function 執行時，角色資料、營地箱物品／雙錢包及筆記轉公開同交易成功或一併回滾。
- 刪除最後一名實體角色或虛擬 `camp-chest` 必須失敗，且不得改變筆記、物品或貨幣。
- 將另一戰役角色 ID、偽造 `created_by`、更改 `campaign_id`、將公開筆記更新為私人或反向改寫，不會繞過資料庫授權。
- 非 DM 直接查詢 DM 私密表、透過 API/RLS 或 Realtime 取得 DM 筆記均被拒絕；非 DM 一般筆記資料回應不含 DM 內容。
- 刪除戰役或父筆記時依預期 cascade 刪除筆記及 DM 私密資料。

### 介面與同步

- 列表與詳情路由可直接載入、重新整理及正確處理未知 ID／無權限狀態。
- 任務與已結束篩選結果正確；建立、編輯、刪除後列表與詳情保持一致。
- Markdown 內容以專案安全的渲染方式顯示；標題與標籤作為純文字處理，不解讀為 HTML。
- 切換戰役、登入狀態或 DM／玩家身分時，不殘留上一狀態的私人或 DM 內容。
- Supabase 錯誤明確呈現，失敗不會被呈現為已儲存；訪客及離線不宣稱雲端同步成功。

### 測試與真實環境界線

- 自動化測試涵蓋資料轉換、ACL 權限矩陣、UI 控制顯示、錯誤處理及路由篩選。
- Edge Function／RPC 測試涵蓋呼叫者驗證、刪除權限、筆記解除關聯與轉公開、營地箱移轉、最後一名角色限制及交易失敗回滾。
- Playwright／Supabase mock 測試只驗證前端流程與 API 合約，不代表真實 PostgreSQL RLS、Realtime 或資料庫約束已驗收。
- 在隔離 Supabase 專案以 DM、建立者、其他玩家（ACL 0／1／2）及非成員測試真實 SQL/RLS；檢查非 DM API response 與 Realtime payload 不含 DM 內容。
- 依 [database-template-migration.md](./database-template-migration.md) 的維護者流程核對目標專案及 migration history，再手動部署；隔離環境驗收前不得宣稱正式上線。

## 非目標與待確認假設

- 第一階段將私人筆記限定為必須綁定角色；若產品希望支援「不屬於任何角色的私人筆記」，需先定義其讀者／ACL，再調整 schema 與授權矩陣。
- 第一階段採單一 campaign DM 身分；若將來支援多名 DM 或副 DM，需將 DM helper 與權限設定改為明確角色關係。
- 標籤採逗號分隔純文字，暫不支援標籤內包含逗號或標籤權限。
- 任務／已結束是列表篩選旗標，不改變筆記存取權、刪除規則或資料保留策略。
