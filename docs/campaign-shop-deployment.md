# 戰役商店：手動部署與隔離環境驗收

本文件涵蓋戰役商店 migrations `20261026000000_campaign_shops.sql`、`20261026000001_campaign_shop_item_delete.sql`、`20261027000000_campaign_shop_cart_checkout.sql`、`20261027000001_campaign_shop_refresh.sql` 及 `20261027000002_campaign_shop_refresh_delete.sql`。第二個 migration 補上 `authenticated` 刪除商品所需的 SQL 權限，並將 RLS 刪除權限限定為該戰役 DM；第三個 migration 新增購物車交易識別碼、整車原子結帳及整筆審查處理；第四個 migration 新增刷新政策欄位與驗證，以及 DM 專用的原子刷新 RPC；第五個 migration 讓刷新清除模式在同一交易內實際刪除退役商品，並回報刪除數量。本文不會替維護者連線、套用 SQL、部署或修改任何 Supabase 專案。本機 Playwright 使用 mock；測試通過不代表實際資料庫、RLS、Realtime 或交易 RPC 已驗收。

## Migration 依賴與範圍

商店 migration 預期目標資料庫已具備本專案既有的 `campaigns`、`characters`、`campaign_members`、`character_permissions`、`inventory_items` 表格及 `is_campaign_member_or_dm(text)`、`is_campaign_dm(text)` 函式。它會先驗證必要欄位及型別；前置條件不符時應中止，不可略過檢查後強行部署。

在 repository 的 migration 順序中，商店 migration 位於既有 schema baseline、戰役安全增量 migration 與鍛造工坊 migrations 之後。部署前須確認所有先決 migration 已在目標環境套用，遠端 migration history 與 repository 一致，且沒有其他未經本次變更核准的 pending migration。

商店 migration 新增：

- `campaign_shops`、`campaign_shop_items`、`campaign_shop_orders` 及保存待審付款錢包類型的 `campaign_shop_order_payments`。
- campaign 範圍外鍵、商品與訂單快照、庫存約束、索引、RLS、管理欄位權限及交易 RPC。
- `campaign_shop_orders.checkout_id` 將同次購物車的多個商品列分組；`checkout_campaign_shop_cart` 在單一 PostgreSQL 交易內建立整筆直接交易或待審請求。只要購物車有一項需審查，整車都會保留庫存且不扣款；核准、拒絕或取消均以整車為單位。
- 後續刪除權限 migration 僅允許 authenticated DM 刪除所屬戰役商品；依現有外鍵，刪除商品也會 cascade 刪除其訂單與付款輔助列。
- 刷新 migration 在 `campaign_shops` 儲存 `refresh_policy` JSONB，使用 CHECK constraint 驗證政策形狀與範圍，並提供 `refresh_campaign_shop_items`。RPC 驗證 campaign DM、shop/campaign 對應、政策保留模式及商店／商品版本，依商店後商品 ID 順序鎖定，再於同一交易內刪除、補貨或新增商品。商品刪除依現有外鍵 cascade 刪除關聯訂單與付款輔助列；保留模式不修改 `stock_reserved`。
- 刷新刪除 migration 將原刷新 RPC 內部化為受限函式，再以同簽章的公開 RPC 包裝；使用者只能呼叫新 RPC，新 RPC 完成原有驗證與資料更新後，在同一資料庫交易刪除清除模式的退役商品，並以 `deleted` 回傳實際刪除數。
- 刷新政策的官方目錄 ID 由前端對照靜態 `catalog-index.json`；資料庫不維護目錄索引，RPC 只能驗證來源識別格式及來源符合目前政策，不可單獨證明靜態目錄 ID 仍有效。
- `authenticated` 可執行的購買、建立待審、購物車結帳、核准、拒絕及取消 RPC；`anon` 與 `PUBLIC` 不可執行。資料表仍由 grants 與 RLS 一起限制。
- `campaign_shops`、`campaign_shop_items`、`campaign_shop_orders` 的 `supabase_realtime` publication 設定。付款輔助表不屬於公開訂單，也不應加入 Realtime。

## 部署前安全檢查

1. 由維護者確認部署目標、環境用途、專案參照及目前資料庫備份／還原方式。先選用可丟棄的隔離 Supabase 專案，不在未確認目標時登入、連結或執行部署命令。
2. 確認隔離專案的 schema、migration history、先決 helper functions 與 publication，並檢視本文件所列的商店 migrations。
3. 在已連結且確認為隔離專案的工作站執行下列只讀清單／dry run；確認輸出只包含已核准的 pending migrations。`db push` 可能套用所有 pending migrations，若清單包含本功能以外的變更，停止並先由維護者處理 migration history。

   ```sh
   supabase migration list --linked
   supabase db push --dry-run --linked
   ```

4. 由維護者明確核准後，才在隔離專案套用 migration：

   ```sh
   supabase db push --linked
   ```

5. 驗證 migration history 已記錄 `20261026000000`、`20261026000001`、`20261027000000`、`20261027000001` 與 `20261027000002`，檢視套用輸出及下方資料庫檢查。若套用中止或部分狀態不明，停止後續測試並由維護者依 Supabase migration history 處理；不要直接重跑或手動標記已套用。
6. 隔離驗收通過並取得維護者核准後，才依相同檢查流程安排正式環境部署。正式部署前確認備份、回復方案、維護窗口，以及任何並行 migration。

本功能沒有新增 Edge Function 或 secrets。不可為此部署把 service-role key 放入前端、測試替身或版本控制。

## 部署後唯讀檢查

在隔離資料庫的 SQL Editor 以有權檢視 catalog 的維護者帳號執行唯讀檢查。預期每項檢查都回傳 `true`：

```sql
SELECT
  to_regclass('public.campaign_shops') IS NOT NULL AS shops_exists,
  to_regclass('public.campaign_shop_items') IS NOT NULL AS items_exist,
  to_regclass('public.campaign_shop_orders') IS NOT NULL AS orders_exist,
  to_regclass('public.campaign_shop_order_payments') IS NOT NULL AS payment_table_exists,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaign_shop_orders'
      AND column_name = 'checkout_id'
  ) AS checkout_group_exists,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaign_shops'
      AND column_name = 'refresh_policy'
      AND data_type = 'jsonb'
      AND is_nullable = 'NO'
  ) AS refresh_policy_exists;
```

確認三個公開資料表位於 Realtime publication：

```sql
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename IN (
    'campaign_shops',
    'campaign_shop_items',
    'campaign_shop_orders'
  )
ORDER BY tablename;
```

預期剛好回傳上述三個表名。確認付款輔助表不在清單中。檢查 RPC 權限：

```sql
SELECT
  has_function_privilege(
    'authenticated',
    'public.purchase_campaign_shop_item(text,text,text,text,integer)',
    'EXECUTE'
  ) AS authenticated_can_purchase,
  has_function_privilege(
    'authenticated',
    'public.checkout_campaign_shop_cart(text,text,text,text,jsonb)',
    'EXECUTE'
  ) AS authenticated_can_checkout_cart,
  NOT has_function_privilege(
    'anon',
    'public.checkout_campaign_shop_cart(text,text,text,text,jsonb)',
    'EXECUTE'
  ) AS anon_cannot_checkout_cart,
  NOT has_function_privilege(
    'anon',
    'public.purchase_campaign_shop_item(text,text,text,text,integer)',
    'EXECUTE'
  ) AS anon_cannot_purchase,
  has_function_privilege(
    'authenticated',
    'public.approve_campaign_shop_order(text)',
    'EXECUTE'
  ) AS authenticated_can_call_approval_rpc;
```

預期所有欄位均為 `true`。authenticated 能呼叫 RPC 不代表任意使用者能核准；實際 DM、成員、角色擁有權及錢包 ACL 均須由 RPC 驗證，請依下一節驗收拒絕未授權操作。

檢查刷新 RPC 與政策驗證約束：

```sql
SELECT
  has_function_privilege(
    'authenticated',
    'public.refresh_campaign_shop_items(text,text,timestamptz,jsonb,boolean,jsonb)',
    'EXECUTE'
  ) AS authenticated_can_call_refresh,
  NOT has_function_privilege(
    'authenticated',
    'public.refresh_campaign_shop_items_with_retirement(text,text,timestamptz,jsonb,boolean,jsonb)',
    'EXECUTE'
  ) AS authenticated_cannot_call_internal_refresh,
  NOT has_function_privilege(
    'anon',
    'public.refresh_campaign_shop_items(text,text,timestamptz,jsonb,boolean,jsonb)',
    'EXECUTE'
  ) AS anon_cannot_call_refresh,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.campaign_shops'::regclass
      AND conname = 'campaign_shops_refresh_policy_valid'
      AND convalidated
  ) AS refresh_policy_constraint_validated;
```

預期四欄均為 `true`。再確認 `campaign_shops.refresh_policy` 的預設值為清除模式、空規則；不要在正式 campaign 上執行刷新測試。

確認商品刪除權限已授予 authenticated，且沒有授予 anon：

```sql
SELECT
  has_table_privilege(
    'authenticated',
    'public.campaign_shop_items',
    'DELETE'
  ) AS authenticated_can_delete_shop_items,
  NOT has_table_privilege(
    'anon',
    'public.campaign_shop_items',
    'DELETE'
  ) AS anon_cannot_delete_shop_items;
```

預期兩欄均為 `true`。再以隔離測試帳號驗證 DM 可刪除自己戰役的商品、一般成員及其他戰役 DM 均無法刪除；刪除會 cascade 清除該商品的訂單及付款輔助列。

## 隔離環境雙帳號驗收

準備兩個一般登入帳號及至少兩個 campaign：帳號 A 管理戰役 A，帳號 B 是戰役 A 的一般成員；另準備帳號 B 無權加入的戰役 B。建立可丟棄的測試角色、測試商店及商品，不放入正式戰役資料。

### 角色及資料隔離

- A 可建立、修改、停用戰役 A 的商店與商品；B 不能建立／修改商店或商品。
- A、B 都可讀取所屬戰役的啟用商店、商品及公開訂單；停用資料只對 DM 顯示。
- 未加入戰役 B 的 A/B 均不能透過 REST 或 Realtime 讀取戰役 B 的商店、商品或訂單。
- 嘗試以 REST 直接新增或修改訂單狀態、價格、數量、角色、快照及審查者資料，應因缺少欄位權限或 RLS 被拒絕。一般成員不得直接將訂單設為 `completed`。
- 確認公開訂單欄位及 API 回應不含 buyer UUID、付款錢包種類、錢包餘額或私人貨幣；`campaign_shop_order_payments` 不可由一般 authenticated 使用者讀寫。
- 由第二個登入中的瀏覽器觀察商店／商品／訂單異動是否經 Realtime 更新；同時確認非成員訂閱不會收到另一 campaign 的變更。

### 錢包與交易

- 以玩家自有角色及公開錢包修改權 `2` 完成一次購買；另以私人錢包修改權 `2` 完成一次購買。確認付款及找零只影響被選取的錢包，不合併或改寫另一個錢包。
- 同一購物車加入多項直接購買商品，確認只呼叫一次購物車 RPC，並以整筆原子扣款、交付及建立同一 `checkout_id` 的公開紀錄。若購物車混入需審查商品，確認所有商品列均進入同一待審交易；核准、拒絕或取消任一筆都必須整車轉換，不可部分完成。
- 對公開或私人錢包只有閱讀權 `1`、無權 `0`、他人角色及 `camp-chest` 嘗試呼叫購買 RPC，均應失敗且訂單、庫存、錢包與背包維持原狀。
- 選擇不能整除的付款組合，確認依 D&D 幣值換算及同錢包找零正確；以兩位小數 gp 邊界及超出精度的值確認接受／拒絕結果符合 schema 約束。
- 對需審查商品送出請求，確認先保留庫存、不扣款、不交付；拒絕或玩家取消後可用庫存恢復。核准後才扣款、交付物品並將保留數量扣除。
- 建立待審請求後，讓綁定錢包餘額不足，再核准。核准應失敗，訂單仍為 `pending`，保留庫存仍在，沒有扣款或物品交付。
- 重複核准同一訂單（包含兩個並行請求），只有第一次可成功結算；不得重複扣款、交付或釋放庫存。一般成員執行核准／拒絕他人請求也應失敗。

### 刷新政策與交易 RPC

- 以 DM 帳號儲存有效政策並重新載入，確認 `refresh_policy` JSONB 欄位完整往返；以一般成員直接更新政策欄位應被 RLS 拒絕。
- 一般成員、其他戰役 DM、匿名呼叫者及錯誤 campaign/shop 組合呼叫刷新 RPC 均應被拒絕，資料列與訂單保持不變。
- 建立清除模式預覽後先修改政策或其中一項商品，再送出舊預覽；RPC 應以版本衝突拒絕，不可覆蓋較新的資料。亦確認新插入／刪除商品會使預覽失效。
- 在隔離資料中安排同來源重複商品，讓刷新先處理另一個有效商品再遇到該重複來源並失敗；確認整筆交易回滾，前一商品庫存及所有啟用狀態都維持原值。
- 分別驗證清除模式會停用舊商品並將 `stock_available` 設為 0、保留模式只補貨相同目錄來源商品；兩種模式都不可刪除商品列、訂單或改寫歷史快照。
- 為待審訂單保留庫存後執行清除刷新，確認 `stock_reserved` 不變；待審請求仍可依原有核准／拒絕／取消流程處理，刷新不會讓訂單靜默消失。
- 以兩個登入 session 同時刷新／編輯同一商店，確認鎖定與版本檢查會讓其中一個過期操作明確失敗；另一 campaign 的商店與商品不得受影響。
- 透過第二個成員 session 訂閱 `campaign_shops` 與 `campaign_shop_items`，確認成功刷新後可收到 Realtime 變更；非成員仍不可讀取事件。

### 併發、回滾及生命週期

- 將可用庫存設為 `1`，使用兩個已授權 session 同時購買最後一件商品。預期最多一筆成功、另一筆明確失敗；庫存不得負數，不能產生第二筆已交付訂單。
- 以付款不足觸發結算失敗，核對訂單狀態、available/reserved 庫存、對應角色錢包及 `inventory_items` 均與結算前一致。若測試環境提供可控的交付失敗注入點，再另測交付中途錯誤；不可在正式環境注入故障。
- 刪除隔離測試用 campaign，確認其商店、商品、訂單及付款輔助列 cascade 清除；確認另一 campaign 的商店與鍛造工坊來源樣板未受影響。
- 若任一結果與預期不同，保留錯誤訊息及最小重現步驟、停止部署；不要在正式資料上重試可能造成重複交易的操作。

## 前端測試與執行記錄

在程式碼工作目錄執行：

```sh
npm run typecheck
npm run lint
npm run test:e2e
npm run build
```

Playwright 對 Auth、REST、RPC 與 Edge Function 使用測試替身，適合確認前端流程、欄位轉換、錯誤呈現及呼叫合約；不連接 Supabase，也不驗證資料庫 migration、真實 RLS、Realtime 過濾、RPC 併發鎖或交易回滾。

每次驗收由維護者記錄目標環境（隔離／正式）、migration version、執行日期、帳號角色、通過／失敗項目及證據位置。不得記錄 access token、service-role key 或其他 secrets。正式環境部署只能在隔離驗收通過且維護者明確核准後記為完成。

## 目前狀態

刷新 migrations `20261027000001_campaign_shop_refresh.sql`、`20261027000002_campaign_shop_refresh_delete.sql` 已新增至 repository，但本文件與前端測試不代表 migration 已執行。本次工作不連線 Supabase、不執行 SQL、不部署任何 migration，也不修改 Secrets。目標環境的 schema、migration history、RLS、Realtime、併發交易及回滾狀態，均須由維護者依上列步驟手動驗收。
