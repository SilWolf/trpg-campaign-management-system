# 資料庫與 Edge Function 部署

本次不建立 `campaign_templates` 或其他範本資料表。前端將選用的範例內容放入請求 body，呼叫 `create-campaign` Edge Function；Function 驗證登入者與 payload 格式，再呼叫受限的 PostgreSQL 交易 RPC，一次建立戰役、DM 成員、角色與物品。

此 repo 的 Supabase CLI 目標固定為正式專案 `qbnghekzezuedzhkeotr`，部署命令會明確帶入此 project ref，不依賴本機目前連結的專案。npm scripts 透過 `npx` 使用固定版本 Supabase CLI `2.122.0`；可使用 `npm run supabase:login` 登入。不要將 access token、資料庫密碼或 service-role key 加入 repo、Vite 環境變數或聊天內容。

## v0.1.0 migration 整合說明

v0.1.0 將原本 27 個時間戳記 migration 依原順序合併至 [`20261030000012_v0_1_0.sql`](../supabase/migrations/20261030000012_v0_1_0.sql)；SQL 內的 `來源 migration` 註記保留各段來源。既有文件中的舊 migration 名稱是整合前的歷史名稱，不再是可個別套用的檔案。

此整合不會改寫任何 Supabase 專案的 migration history。既有環境若登記了舊的 27 個版本，不能直接把整合檔當成一般 pending migration 執行；需由維護者先確認目標專案、遠端版本與資料備份，並在隔離環境規劃及驗證 history 對齊。這項工作未連線、套用 SQL、執行 migration repair 或部署任何 Supabase 資源。

整合檔包含 `existing_schema_baseline` 檢核，要求核心應用程式資料表已存在且欄位型別相符；它不是可在全新空資料庫上建立所有核心資料表的初始化腳本。另有物品 schema 空資料表前提，若目標環境已有相關資料，必須先規劃資料修復，不可直接套用。

## GP-only 錢包 migration 狀態

[`20261030000013_gp_wallet_schema_foundation.sql`](../supabase/migrations/20261030000013_gp_wallet_schema_foundation.sql) 新增 `characters.gp`、`characters.private_gp` 與 `campaigns.camp_chest_gp`，並由舊錢包回填及設定 GP 精度／範圍限制；舊 JSONB 欄位仍保留作相容鏡像。依維護者確認，foundation migration 已發佈及驗證；此確認不代表本次重新連線檢查，亦不代表後續 GP cutover 已部署。

[`20261030000014_gp_wallet_shop_checkout.sql`](../supabase/migrations/20261030000014_gp_wallet_shop_checkout.sql) 將商店付款與結帳切換為扣除指定的公開或私人 GP 錢包，且在交易內維護舊 JSONB 相容鏡像。Repo 中該 migration 尚未標示為已套用；部署前仍須依本文件前述流程核對目標、migration history、隔離驗收與維護者授權。

本機 [gp_wallet_schema_foundation.sql](../supabase/tests/gp_wallet_schema_foundation.sql) 是需在相符的隔離資料庫執行的 SQL 合約測試；Playwright E2E 與 Supabase mock 則只驗證前端／mock 契約。兩者皆不能代替隔離 Supabase 的多帳號 RLS、Realtime、RPC 授權、競爭交易及失敗回滾測試。`external/schema.md` 是歷史 schema 快照，目前仍記錄舊 JSONB 欄位；只有維護者核對實際部署 schema 後才可更新，不可用 migration source 或本機 mock 推定遠端狀態。

## 部署前檢核

1. 在目標 Supabase 專案確認既有 `campaigns`、`campaign_members`、`characters`、`inventory_items` 等資料表與 Schema 保留。此處假設資料列已清空，不代表資料表也已刪除。
2. 核對 `campaigns.id`、`campaigns.dm_id`、角色及物品 ID／`campaign_id` 為 `text`，`campaign_members.user_id` 為 `uuid`，並比對 `external/schema.md` 及 v0.1.0 整合 migration 中的 `existing_schema_baseline` 段落。該檢核只驗證保留中的 Schema，不會從空資料庫建立表格。
3. 確認所有 `inventory_items.campaign_id` 均有值且指向既有戰役。增量 migration 不推測未知的戰役歸屬；遇到 `NULL` 或既有非 cascade 外鍵時會停止，先由維護者處理。
4. 核對遠端 migration history。如歷史版本與此 repo 不一致，先處理基線／版本對齊，不可直接標記 migration 已套用。
5. 先在隔離的 Supabase 專案驗證 SQL、RLS、函式權限和 Edge Function，再部署正式環境。

## 套用資料庫 migration

先查詢遠端 migration history 並檢視 v0.1.0 整合 migration。由於整合前的遠端 history 仍可能保留舊版的 27 個 migration ID，以下只讀查詢／預覽不可視為已完成版本對齊：

```sh
npm run supabase:migrations:list
npm run supabase:db:dry-run
```

在維護者完成 history 對齊、隔離環境驗收並明確核准前，**不可執行 `db:push`**。不得用 `migration repair`、`--include-all` 或直接修改遠端 history 繞過差異。

整合前文件所記錄的「正式專案 dry-run 為 up-to-date」只適用於當時仍有 27 個獨立 migration 檔案的版本；不得據此推斷目前整合後的 repo 與任何遠端 history 一致。

此 SQL 會新增 `campaigns.camp_chest_currency`；強制 `inventory_items.campaign_id`、外鍵、索引及 camp-chest 不可設私人等限制；限制 campaign、角色、物品、成員、邀請及角色權限資料依 campaign 成員資格存取；玩家只能更新 campaign 的公共營地箱錢包，DM 才能更新其他 campaign 欄位或刪除戰役。直接建立 campaign 或 campaign member 列會被限制，需使用安全函式。Migration 另提供邀請碼加入 RPC、僅 `service_role` 可執行的建團 RPC，並確認 `campaigns` 在 `supabase_realtime` publication 中。它不建立範本表、不放入範例 seed，也不建立 `default` 戰役。

### 物品驗證函式權限

若修改物品時出現 `permission denied for function is_valid_item_base`，先確認目標專案與 migration history。[20261028000000_item_base_unification.sql](../supabase/migrations/20261030000012_v0_1_0.sql) 原已授權 `authenticated` 與 `service_role`；錯誤可能表示遠端權限或版本與此 repo 不一致，不能單憑訊息判定原因。

[20261030000007_item_base_validator_grants.sql](../supabase/migrations/20261030000012_v0_1_0.sql) 重新授予上述角色執行物品定義驗證函式及其相依的附魔驗證函式，並維持 `PUBLIC`、`anon` 不直接取得執行權限。維護者應依前述流程先在隔離專案核對並套用所有待執行 migration；不要只修改已套用的歷史 migration。此變更不授予資料表存取權，也不取代 RLS。

套用後，由具備切換至 `authenticated`、`service_role` 權限的維護者在隔離專案執行 [item_base_validator_permissions.sql](../supabase/tests/item_base_validator_permissions.sql)。腳本檢查函式權限與既有 CHECK constraint，以兩個角色測試有效資料的寫入及無效資料的拒絕，最後回滾。另以實際登入帳號裝備、修改物品並保存鍛造樣板，確認真實資料表與 RLS 互動；測試腳本不取代這些驗收。

## 冒險筆記 Schema 與授權 migration

[20261030000008_campaign_journeys.sql](../supabase/migrations/20261030000012_v0_1_0.sql) 新增 campaign-scoped 主筆記與 DM 私密筆記資料表、`character_permissions.journey_access`、RLS、Realtime 設定，以及僅 `service_role` 可呼叫的角色刪除交易 RPC。新增的 `delete-campaign-character` Edge Function 會驗證登入 token 並呼叫該 RPC；正式專案 Functions 清單確認此 Function 為 ACTIVE，但清單不驗證實際請求行為。角色刪除 RPC 仍會依傳入的 actor UUID 從資料庫確認 DM／`can_delete_character` 授權，持有 service role 並不會替使用者取得角色刪除權。

此 migration 會檢查所依賴的既有欄位型別、角色主鍵、授權 helper、物品 owner 關聯及 `supabase_realtime` 設定。既有角色擁有者權限列會取得 `journey_access = 2`；新增或轉移擁有權時亦由 DB trigger 同步。另以 restrictive RLS policy 阻止直接刪除角色，只有受限交易 RPC 能執行完整刪除。遇到缺欄位、型別不符、遺留孤兒物品或整個 schema 的 Realtime publication 時會停止，請先人工釐清，不要略過檢查或直接修改正式資料。migration 另以物品 owner trigger 與角色列鎖，避免刪角交易期間新增／移轉物品形成孤兒 owner。

部署前先確認 Supabase 專案與 migration history，並只在隔離專案套用及驗收。以 [campaign_journeys_permissions.sql](../supabase/tests/campaign_journeys_permissions.sql) 執行唯讀目錄／grants／RLS 設定檢查；該腳本以交易回滾，不會建立測試資料，也**不代表已驗證真實列層級 RLS 行為**。在隔離專案再使用專用測試帳號與至少兩個戰役，逐項驗證：

- `authenticated` 戰役成員只能讀取本戰役公開筆記；`anon`、非成員及跨戰役讀寫皆遭拒。
- 玩家只能新增 `created_by = auth.uid()` 的公開筆記；偽造建立者被拒；玩家只能更新／刪除自己建立的公開筆記，DM 可管理所有公開筆記。
- 私人筆記綁定同戰役角色；ACL `0` 無法讀寫、`1` 僅可讀、`2` 可讀寫；DM 即使沒有權限列也可完整管理。以 `UPDATE` 測試更改 visibility、角色及 campaign，確認 `USING`／`WITH CHECK` 和不可變欄位無法繞過 ACL。
- 非 DM 直接查詢 `campaign_journey_dm_notes` 被拒，且該表不在 `supabase_realtime` publication；一般筆記與 Realtime payload 不包含 DM 內容。
- `anon`／`authenticated` 直接執行角色刪除 RPC 被拒；`service_role` 搭配未授權 actor 仍被拒。授權刪除後筆記轉公開且保留、背包和雙錢包併入營地箱；透過隔離測試觸發交易中途失敗，確認物品、貨幣、筆記與角色全部回滾。
- 以平行角色移轉／新增物品及刪角請求驗證 owner 鎖定；確認不會留下指向已刪角色的物品，並確認每個戰役至少保留一名實體角色。

本節記錄此功能的隔離環境驗收要求，不代表已完成真實 Supabase RLS／Realtime／交易驗收。整合前曾記錄維護者確認正式專案的 migrations 已手動套用，且只更新 migration history、沒有重新執行 SQL；該紀錄不代表整合後的新 migration ID 已部署或已完成 history 對齊。正式 Function 的 ACTIVE 狀態也不等同於整合驗收完成。

### 冒險筆記隔離部署步驟

以下步驟是**隔離 Supabase 專案**的驗收與首次部署流程。關於正式專案曾手動套用 migrations 及 dry-run 為 up-to-date 的說明，均是整合前的歷史紀錄；目前不得將其視為 v0.1.0 整合 migration 已套用。

1. **備份並核對目標。** 建立可還原的資料庫備份／還原點，確認 CLI 登入帳號、project ref、既有 Schema 與 migration history。核對必要前置 migration（包含既有 campaign 授權及 `20261030000007_item_base_validator_grants.sql`）已套用。只有在維護者確認 SQL 已手動執行後，才可將 `20261030000008_campaign_journeys.sql` 登記為已套用；不得只為消除待套用清單而標記。

   ```sh
   supabase migration list --linked
   supabase db push --dry-run --linked
   ```

   確認 CLI 輸出的 project ref 與待套用清單正確後，維護者才明確執行：

   ```sh
   supabase db push --linked
   ```

   預期依 migration 順序套用 `20261030000008_campaign_journeys.sql`。此 migration 會檢查既有欄位型別、授權 helper、角色／物品關聯及 Realtime publication；檢查失敗即停止，應先查明資料狀態，不要移除檢查或直接改正式資料。

2. **檢查資料庫設定。** 在同一隔離專案執行 [campaign_journeys_permissions.sql](../supabase/tests/campaign_journeys_permissions.sql)。它只驗證 schema、policy、grants、trigger 與 publication 設定，透過 `ROLLBACK` 不保留資料變更；這不是角色矩陣或列層級 RLS 的行為測試。

3. **部署刪角 Edge Function。** 確認 migration 成功後，再明確指定同一個隔離專案部署；`supabase/config.toml` 中 `delete-campaign-character` 必須維持 gateway JWT 驗證啟用。

   ```sh
   supabase functions deploy delete-campaign-character --project-ref <隔離專案參照>
   ```

   由維護者在 Supabase Functions 設定中確認伺服器端可用的 Secrets **名稱**為 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。本文件及前端不得記錄或使用這些值；`SUPABASE_SERVICE_ROLE_KEY` 僅可供伺服器端 Function 使用。Function 以登入 token 取得 actor，再呼叫 `delete_campaign_character_with_journeys(text, text, uuid)`；資料庫只授予 `service_role` 執行 RPC，RPC 仍會依資料庫狀態驗證 actor 權限。一般使用者不可直接執行該 RPC。

4. **執行真實環境驗收。** 準備 DM、筆記建立者、ACL `0`／`1`／`2` 玩家、非成員，以及至少兩個測試戰役。依前一節逐項檢查真實 REST/RLS、Realtime payload、刪角授權與失敗回滾；另外確認有效／無效 token、拒絕狀態及成功後筆記、角色、物品與雙錢包結果。保留驗收結果及 migration version，避免在測試資料或身份不明時操作。

5. **失敗與回復。** 若 migration、RLS 檢查或 Function 驗收失敗，停止後續部署和測試寫入，記錄錯誤並保留 migration history。此 migration 沒有供維護者直接執行的 down migration；不可手動刪表、移除 policy／trigger 或標記 migration 已回退。先依備份與還原點評估影響，再以經審查的向前修正 migration 修復；只有無法安全向前修正且已評估資料損失時，才由維護者按既定災難復原程序還原。Function 部署失敗可在確認前端相容性後重新部署修正版；不要以停用授權或公開 service role 權限作為回復方式。

Playwright／Supabase mock 只驗證前端流程與 API 合約；所有隔離專案實測須另行記錄。未完成維護者驗收前，不得將本地測試通過描述為 Supabase 上線或真實 RLS／Realtime／交易驗收完成。

## 部署 Edge Function

1. 維護者確認資料庫 migration 已成功套用，`create_campaign_from_seed(text, uuid, jsonb)` 僅授予 `service_role` 執行。
2. 透過 Supabase Dashboard 或 CLI 的 secrets 管理機制確認 Edge Function 可取得 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 及 `SUPABASE_SERVICE_ROLE_KEY`。service role key 僅能存在伺服器端，不能放入 Vite 環境變數、前端程式碼或版本控制。
3. 確認資料庫前置條件完成後，部署所有 repo 中的 Edge Functions：

   ```sh
   npm run supabase:functions:list
   npm run supabase:functions:deploy
   ```

4. `supabase/config.toml` 對此 function 開啟 gateway JWT 驗證；程式內仍以 Supabase Auth `getUser(token)` 驗證實際登入者，並只把該 user UUID 傳入交易 RPC。函式不接受客戶端提供任意種子資料或建立者 ID。

`supabase:functions:deploy` 只部署 repo 內的 Functions，且不會刪除遠端多出的 Function（不可加 `--prune`）。`invite-player` source 已從正式部署下載並納入 repo，設定維持 `verify_jwt = true`；secrets 仍由 Supabase 遠端管理。

使用者已回報角色刪除 Edge Function 部署完成。下列命令供維護者確認正確專案及 migration 前置條件後，用於重新部署或更新：

```sh
supabase functions deploy delete-campaign-character --project-ref <正確的專案參照>
```

此 Function 同樣使用 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 與 `SUPABASE_SERVICE_ROLE_KEY`；service role key 僅供伺服器端使用。請求只接受 `campaignId`／`characterId`，actor ID 一律由已驗證的 Auth token 取得。設定與背包兩個刪除入口都呼叫此 Function，不可由前端直接執行交易 RPC 或以多次 REST 寫入代替。

前端從 `src/data.ts` 組出 3 名真正角色與 9 件示範物品後放入 `seed`；會排除虛擬 `camp-chest`，不寫入角色列。Function 不自行產生或替換 seed，而是將收到的內容傳給交易 RPC。選用 `sample` 時送出範例內容；`blank` 則送出空角色／物品陣列與零餘額公共錢包。Function 限制陣列數量及資料形狀；SQL 交易為完整原子操作，任何角色／物品欄位錯誤都會回滾整筆建立。

## 前端整合與邀請碼

- 戰役大廳提供範例／空白選擇，使用 Supabase `functions.invoke('create-campaign', ...)` 傳送對應 template 與 seed，並以 RPC 回傳的新戰役 ID 導向頁面；錯誤會顯示給使用者，不會導向半成品。
- 邀請加入使用 `join_campaign_by_invite_code` RPC，不直接讀取受 RLS 保護的 campaign 邀請碼。
- 遠端空白集合不會被前端範例資料回填；離線、訪客及 `default` 相容模式仍採本地資料退避。
- 因 campaign row 只允許成員／DM 讀取，邀請加入必須呼叫 `join_campaign_by_invite_code`，不可再用前端直接查詢 `campaigns.invite_code` 後寫入成員表。
- 既有資料表與 `campaigns` RLS 還需依照專案 ACL 規則，持續驗證角色、物品和 `camp_chest_currency` 的寫入權限；Realtime 僅提供資料同步，不取代授權。

## camp-chest 與隔離規則

- `camp-chest` 是每個戰役都有的虛擬公共儲存庫，不屬於角色或使用者，沒有私人背包／錢包；不建立 `characters` 列、不建立範本表。
- 公共貨幣存於該戰役的 `campaigns.camp_chest_currency`；營地箱物品使用 `owner_id = 'camp-chest'`，且每列都必須帶正確的 `campaign_id`。
- 前端所有營地箱物品查詢、建立、更新、刪除及移轉均由同步 Hook 加上當前 `campaign_id`；Realtime 同樣以 campaign 篩選。跨戰役相同 owner ID 不可互通。
- UI 保留 camp-chest 專用外觀與公共庫存互動：營地箱是虛擬角色，不寫入 `characters`，不顯示角色設定、刪除、擁有人或私人欄位。公共錢包改讀寫 campaign row，並透過 Realtime 更新畫面。
- 角色↔營地箱的貨幣移轉目前是前端對角色列與 campaign 列分開寫入，尚未提供跨列資料庫交易；部署前需在隔離環境驗證競爭情境，必要時新增轉帳 RPC。

## 手動驗收清單

- 確認資料庫沒有任何 `campaign_templates` 相關表格或 seed 資料。
- 未登入呼叫 function 應被拒絕；錯誤名稱、未知 template、無效登入均不得建立 campaign。
- `sample` 建團成功後有 3 名角色和 9 件物品，沒有 `camp-chest` 角色；DM、campaign member、角色 user ID 都對應已驗證登入者。
- 每件物品的 `campaign_id` 指向剛建立的戰役，角色物品 owner 映射至新角色；camp-chest 物品若存在，維持 `owner_id = 'camp-chest'` 且非私人。
- `blank` 建團只建立 campaign 和 DM 成員，沒有角色／物品，公共錢包五幣種皆為零。
- 故意傳入無效物品欄位觸發 RPC 錯誤，確認 campaign、成員、角色、物品均完全回滾。
- 在隔離環境以有效／無效 token、未授權玩家、跨戰役或不存在角色、`camp-chest`、最後一名實體角色測試 `delete-campaign-character`；拒絕請求不得改變資料。
- 以 DM 與具 `can_delete_character` 權限的玩家刪除角色，確認筆記解除角色關聯並轉公開、角色物品／雙錢包合併及角色刪除同一交易完成；刻意在交易末段觸發錯誤，確認所有資料回滾。
- 驗證 authenticated／anon 不能直接執行角色刪除 RPC，Edge Function 回應不含 service role 或私密資料。Playwright Supabase mock 只驗證請求合約及 UI 錯誤處理，不等於上述真實環境驗收。
- 一般 `authenticated`／`anon` 不能直接執行 `create_campaign_from_seed`；只有 `service_role` 有 EXECUTE 權限。
- 有效邀請碼透過加入 RPC 後可以讀取新戰役；無效邀請碼失敗，重複加入不會改變既有成員角色。
- 非成員無法讀取另一戰役 campaign row、物品或 Realtime 事件。不同 campaign 的 camp-chest 錢包及物品互相隔離。
- `inventory_items.campaign_id` 不可為 NULL、不可以指向不存在 campaign；刪除 campaign cascade 清除對應物品。
- camp-chest 物品若設 `is_private = true`，資料庫應拒絕寫入。

## 部署狀態

> 以下是 v0.1.0 整合前的歷史紀錄，不代表目前整合 migration 的遠端狀態。

使用者確認 repo 內 27 個 migrations 與既有 Edge Functions 曾手動部署，且正式資料庫留有手動測試資料。經使用者明確授權，本次以 `supabase migration repair --status applied` 將 27 個版本寫入正式專案 migration history；此操作只更新 migration tracking metadata，沒有執行 SQL migration 或改動應用資料。之後 `supabase migration list` 顯示 27 個版本一致，`supabase db push --dry-run` 回報 up-to-date。沒有清除測試資料、部署 Function 或存取／變更 secrets。

正式專案 Functions 查詢顯示 5 個 ACTIVE：`create-campaign`、`campaign-shop-purchase`、`delete-campaign-character`、`identify-inventory-item` 及 `invite-player`；目前 repo 皆有對應 source 與 JWT 驗證設定。`invite-player` source 是從正式部署匯入的，任何修改都需先檢視並依隔離環境流程驗收。部署命令不會刪除遠端 Function，不可加 `--prune`。
