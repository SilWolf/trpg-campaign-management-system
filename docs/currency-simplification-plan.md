# GP-only 金錢系統：開發規劃

## 目標與範圍

將玩家錢包從 PP、GP、EP、SP、CP 五種面額改為可精確到 `0.01 GP` 的單一 GP 餘額。保留角色公開錢包與私人暗袋兩個獨立餘額，以及現有讀取／修改 ACL；此規劃取消面額換算，不合併錢包，也不改變商店價格、物品價值等以 GP 表示的欄位。

**錢包模型已確認：** 每名角色仍有公開與私人兩個錢包，各自儲存 GP。營地儲物箱仍只有公開錢包。私有錢包 ACL、DM 權限、角色擁有者權限及現有單向轉移規則繼續適用。

## 已確認的現況

- `characters.currencies` 與 `characters.private_currencies` 是 JSONB 五面額錢包；`campaigns.camp_chest_currency` 是營地箱的 JSONB 錢包。資料庫基線及 schema 快照記載於 [20261030000012_v0_1_0.sql](../supabase/migrations/20261030000012_v0_1_0.sql) 與 [external/schema.md](../external/schema.md)。
- 前端 `Character` 型別、`CurrencyType`、角色／營地箱資料轉換器及建團 seed 都依賴五面額格式，見 [types.ts](../src/types.ts)、[supabase.ts](../src/lib/supabase.ts)、[data.ts](../src/data.ts) 及 [create-campaign/index.ts](../supabase/functions/create-campaign/index.ts)。
- 錢包 UI 包含五種幣值增減、面額選擇、轉帳、公私錢包互轉、營地箱平分及「一鍵將零錢換整為金幣」；入口與摘要也逐一顯示面額。相關位置為 [CurrencyPanel.tsx](../src/routes/_protected/campaigns/$campaignId/-parts/CurrencyPanel.tsx)、[CharacterStatusBar.tsx](../src/routes/_protected/campaigns/$campaignId/-parts/CharacterStatusBar.tsx) 及 [campaign/$campaignId/index.tsx](../src/routes/_protected/campaigns/$campaignId/index.tsx)。
- 錢幣重量目前以錢幣枚數除以 50 計算，且依錢包閱讀 ACL 過濾；新算法必須保留此資訊隔離。錢包修改、角色間／營地箱移轉、平分及刪角併入營地箱分別涉及 [useInventoryActions.ts](../src/hooks/useInventoryActions.ts)、[useCampaignSync.ts](../src/hooks/useCampaignSync.ts) 及資料庫角色刪除交易。
- 商店直接購買與核准流程目前將 JSONB 面額換算成整數 CP，再以所選公開或私人錢包付款。前端位於 [ShopTransactionsPanel.tsx](../src/routes/_protected/campaigns/$campaignId/shops/-parts/ShopTransactionsPanel.tsx)；資料庫包含 `shop_wallet_total_cp`、`shop_wallet_from_cp`、購物／結帳／核准 RPC 與 `campaign_shop_settle_order`。商店下單、待審保留庫存、核准、拒絕、取消及付款需維持資料庫交易原子性。

## 建議的新資料與數值合約

### 資料庫欄位

建議使用明確表示單位與錢包歸屬的數值欄位：

| 資料列 | 建議欄位 | 型別與規則 |
| --- | --- | --- |
| `characters` | `gp`、`private_gp` | `numeric(10,2)`；範圍 `0` 至 `1,000,000.00` GP，最小單位 `0.01 GP`。 |
| `campaigns` | `camp_chest_gp` | `numeric(10,2)`；範圍 `0` 至 `1,000,000.00` GP，最小單位 `0.01 GP`。 |

欄位名稱已確認為 `characters.gp`、`characters.private_gp` 及 `campaigns.camp_chest_gp`；不得把兩種角色錢包併成一欄，也不得把營地箱存回虛擬角色。每個錢包的餘額上限為 `1,000,000.00 GP`，UI 最多顯示兩位小數。資料庫、RPC 與前端都必須拒絕使餘額超出上限的操作；不要使用浮點資料庫型別。

### 前端與 API

- 將 `Character` 改為 `gp: number`、`privateGp: number`；尚未切換的錢包 UI 暫時保留舊面額相容欄位，並由 GP 欄位作為遠端讀取來源。完成錢包 UI／交易切換後移除 `CurrencyType` 及相容欄位。
- 將 `DbCharacter`、`toDbCharacter`／`fromDbCharacter`、`toDbCampaignCurrency`／`fromDbCampaignCurrency`、Realtime 載入與樂觀同步一併改為新欄位。過渡期間同步寫入舊 JSONB 相容欄位；缺省仍為 `0`，但不合法的遠端 GP 金額須明確報錯，不可靜默變成有效餘額。
- 使用小數 GP 顯示與輸入，最多顯示兩位小數；輸入步進及轉帳最小值為 `0.01`，不得接受負數、非有限值、超過兩位小數、超出可用餘額或使目標餘額超過 `1,000,000.00 GP` 的金額。前端計算宜先以整數「分 GP」（`1 GP = 100`）運算，再轉回 GP，避免浮點累加誤差。
- 商店價格 `unit_price_gp`、`total_price_gp`、訂單快照，以及物品 `value_gp`／`valueGp` 已使用 GP，不應改成其他貨幣欄位；確認其小數精度與新錢包一致即可。

## 舊資料轉換與 migration 策略

每個舊錢包分開換算為 GP，保留公開／私人界線：

```text
GP = PP × 10 + GP + EP × 0.5 + SP × 0.1 + CP × 0.01
```

角色公開與私人錢包各自套用公式；營地箱換算 `camp_chest_currency`。缺少面額、非數值、負數或非整數面額數量均視為 `0`；若整個舊錢包不是 JSON 物件，該錢包視為零。有效面額只接受非負整數，確保換算結果精確至 `0.01 GP`。遷移預檢仍應統計並列出被視為零的欄位／錢包，供維護者檢視，但不因這些值中止轉換或逐筆人工修復。

1. 只新增一個 timestamped 增量 migration；**不得修改已整合／可能已套用的 v0.1.0 migration**。
2. 在隔離資料庫先驗證 schema、資料預檢、換算總額及 rollback；正式資料需先備份。對照每個舊錢包與新 GP，確認同一錢包價值不變。
3. 目前尚無已發佈上線的前端，因此不需支援新舊前端並行，也不需設計雙寫。完成隔離環境預演後，以協調的首次上線流程套用 migration（新增 GP 欄位、換算回填並移除舊 JSONB 欄位），再部署使用新 schema 的 Edge Function 與前端；正式環境仍須依維護者核准及部署文件操作。
4. 更新 [external/schema.md](../external/schema.md) 為維護者確認過的新 schema 快照；它是文件快照，不是即時資料庫檢查結果。
5. 不清除、重建或覆寫正式資料；依 [database-template-migration.md](./database-template-migration.md) 檢核 project ref、migration history、隔離驗收及部署授權。本規劃不授權執行任何正式 migration 或 Edge Function 部署。

## 完整改動清單

### 1. 資料庫、RLS 與建團／刪角流程

- **Schema foundation 已發佈及驗證完成（依使用者確認）：** [20261030000013_gp_wallet_schema_foundation.sql](../supabase/migrations/20261030000013_gp_wallet_schema_foundation.sql) 為三種錢包新增 GP numeric 欄位、舊五面額換算、無效錢包／歸零面額統計通知、超過新餘額上限時中止及 GP 精度／範圍限制；[gp_wallet_schema_foundation.sql](../supabase/tests/gp_wallet_schema_foundation.sql) 覆蓋換算與限制。
- **型別實作注意：** 欄位使用不帶 `(10,2)` typmod 的 `numeric`，並以 CHECK 拒絕超過兩位有效小數的餘額；PostgreSQL 的 `numeric(10,2)` 會先四捨五入輸入，再檢查限制，無法滿足拒絕 `0.001` 而非靜默捨入的要求。
- **仍待整合：** foundation migration 保留舊 JSONB 欄位；建團／刪角 RPC、錢包 ACL/RLS、campaign 欄位授權及相關 trigger，仍須依各階段更新。錢包 UI 與商店 RPC 也尚未完成 GP-only cutover。
- **驗收狀態：** foundation SQL 的發佈與驗證由使用者確認完成；此狀態不代表前端、Edge Function 或後續交易 RPC 已部署。 [external/schema.md](../external/schema.md) 快照更新仍待維護者依實際部署 schema 核對。
- 更新 `characters`／`campaigns` 欄位、預設值、非負與兩位小數限制；移除舊 JSONB 欄位前，確認所有讀寫端與函式已遷移。
- 更新 `existing_schema_baseline` 相關文件／未來基線檢查及 schema 快照。既有合併 migration 不回頭修改。
- 更新 `create_campaign_from_seed` 的 seed 欄位驗證與 insert，並同步更新 Edge Function `CampaignSeed` 型別及建團呼叫端；範例／空白戰役、角色新建及營地箱的餘額均使用 GP 數值。
- 更新 `delete_campaign_character_with_journeys`：刪角前將角色公開與私人 GP 加入該戰役 `camp_chest_gp`，一次資料庫交易內完成，且保留既有權限檢查、物品移轉及筆記處理。
- 保留 `character_permissions.public_wallet_access` 和 `private_wallet_access` 欄位及其 RLS／SECURITY DEFINER 授權規則；改的是錢包表示法，不是 ACL。確認角色建立、擁有權移交與預設權限 trigger 不再引用舊餘額欄位。
- 更新所有錢包相關政策、trigger、helper 及 campaign 欄位授權，確保一般成員仍不能讀寫無權限的私人 GP，也不能藉 Realtime、結帳或錯誤訊息推知餘額。

### 2. TypeScript、資料同步與本機 seed

- **階段二程式碼完成：** 已新增 `Character.gp`／`privateGp`、資料庫 GP 欄位轉換與範例角色 GP seed；`useCampaignSync` 改讀營地箱 GP 並維持離線／訪客本機資料。為遵守分階段範圍，暫留五面額相容資料，角色／營地箱遠端寫入會同步更新 GP 與舊格式，供尚未切換的 UI、操作與商店 RPC 使用；後續切換完畢後必須移除雙寫及相容欄位。E2E mocks 與營地箱同步合約測試亦已更新。
- **程式驗收：** `npm run typecheck`、`npm run lint`、`npm run test:e2e`（105 項通過）及 `npm run build` 通過；mock／本機驗收不代表真實 Supabase RLS、Realtime 或交易已驗收。
- `toDbCharacter` 會拒絕不合法、超限或與相容欄位不一致的 GP 餘額；`fromDbCharacter` 以 GP 為準，並驗證既有錢包欄位，避免靜默讀取不一致資料。
- 修改 `src/types.ts` 中 `CurrencyType`、`Character`、營地箱及所有錢包相關型別；保留 `CampaignShopWalletType = 'public' | 'private'`，因兩種付款來源仍存在。
- 修改 `src/lib/supabase.ts` DB 型別、camelCase／snake_case 轉換器、fallback 與 campaign 錢包轉換器；刪除五面額物件的假設。
- 修改 `src/hooks/useCampaignSync.ts` 初始讀取、campaign Realtime、寫入佇列及本機模式的營地箱餘額；確保空白戰役仍以零 GP 開始，且不寫入 `camp-chest` 角色列。
- 修改 `src/data.ts` 的範例角色與營地箱金額。按上述公式換算現有範例金額，不可只複製原 GP 欄而遺失零錢價值。
- 修改 [CharacterModal.tsx](../src/routes/_protected/campaigns/$campaignId/-parts/CharacterModal.tsx) 新角色的公開／私人初始 GP；編輯角色時完整保留原餘額。

### 3. 背包錢包、轉帳與負重 UI

- 修改 `CurrencyPanel`：只顯示 GP 餘額；支援精確到 `0.01` 的加減、設定／轉出數量、轉給角色及存入／領出營地箱。移除面額下拉與「一鍵將零錢換整為金幣」按鈕、callback、handler、toast 及相關測試。
- 保留公開／私人錢包分頁、無權限遮罩、自身錢包互轉、只有來源修改權即可單向轉出的規則；營地箱沒有私人錢包。
- 營地箱「平分給全隊」改以分 GP 分（整數）計算；無法平均分配的分數 GP 留在營地箱，不能捨去。
- 修改 `CharacterStatusBar` 的餘額摘要及「折合」標籤：直接顯示目前選定錢包 GP，不再列出 PP／EP／SP／CP。
- 負重定義為**可閱讀錢包餘額合計中，每滿 1 整數 GP 計 `0.02 lb`，不足 1 GP 的部分不計**。先按各自 ACL 過濾公開／私人錢包，再計算 `floor(可讀 GP 合計) × 0.02`；不可把無權限的私人餘額納入總重。保留使用者的「計入硬幣重」切換。
- 顯示及總負重精度至少保留到 `0.01 lb`，避免 `1 GP = 0.02 lb` 被現有一位小數格式四捨五入成 `0.0 lb`。整數分 GP 可先換算，再以整數分數運算重量。
- 修改 `useInventoryActions` 的增減、兩錢包間轉移、角色間轉移、營地箱存取與平分操作；遠端、多列寫入仍不可宣稱具資料庫原子性。若需防止跨客戶端競爭或重複扣款，另行設計並驗收交易 RPC。

### 4. 商店結帳與訂單

- 玩家選擇公開／私人錢包、依 ACL 顯示可用付款方式的流程不變；角色錢包查詢由 `currencies,private_currencies` 改成新 GP 欄位。
- 以選定錢包的單一 GP 餘額比較訂單總價。移除 CP 換算及 `shop_wallet_total_cp`／`shop_wallet_from_cp` 等面額 helper；付款時只從選定錢包扣除訂單金額，不找零、不合併公開與私人餘額。
- 更新立即結帳、待審申請、DM 核准／拒絕、玩家取消、整車結帳及其內部 settlement RPC；保留庫存保留／釋放、資料列鎖、授權檢查、訂單公開紀錄與單一 PostgreSQL 交易原子性。
- 價格與錢包都限制至 `0.01 GP`。前端 cart 計價改用整數分 GP；RPC 驗證價格乘 `100` 是整數且錢包足額，再以 `numeric` 精確扣款。不得因浮點誤差拒絕 `0.01 GP` 或多扣／少扣。
- 更新 [campaign-shop-plan.md](./campaign-shop-plan.md) 的五面額、CP、找零及錢包欄位敘述；保留「只從指定錢包支付」及交易原子性的規格。

### 5. 測試、mock 與文件

- 修改 `tests/e2e/supabase-mock.ts` 的角色／campaign 欄位、seed 及 shop checkout mock；同步更新 [phase-1-baseline.spec.ts](../tests/e2e/phase-1-baseline.spec.ts)、[phase-3-inventory.spec.ts](../tests/e2e/phase-3-inventory.spec.ts) 和 [campaign-shop-purchase.spec.ts](../tests/e2e/campaign-shop-purchase.spec.ts)。
- 搜尋並更新所有 `CurrencyType`、`currencies`、`privateCurrencies`、`camp_chest_currency`、幣值 key、幣值測試 ID、CP helper 及「換整」文案／測試；不要修改歷史發行紀錄來假裝舊版本已採用新規則。
- 更新當前 schema／部署文件及商店規格，清楚區分「程式／mock 測試通過」與「隔離 Supabase 的 migration、RLS、Realtime、RPC 交易已驗收」。

## 驗收清單

### 精度與資料遷移

- [ ] `0`、`0.01`、`0.99`、`1`、`1.99`、`999,999.99`、`1,000,000.00` GP 從 DB 到 UI 再回 DB round-trip 不變。
- [ ] `1,000,000.01 GP`、超過上限的加值／轉入／商店退款或其他入帳操作均由 UI、RPC 及資料庫限制拒絕；剛好到達上限可成功。
- [ ] `0.001`、負數、NaN／Infinity、無效字串及超出允許位數的值由前端與資料庫拒絕；不靜默 round。
- [ ] 舊五面額資料公開、私人、營地箱分別換算，總價值守恆至 `0.01 GP`；轉換報表可供維護者核對。
- [ ] 建立範例／空白戰役、新角色及離線／訪客模式都使用正確的 GP 初始值。

### 權限、重量與移轉

- [ ] 一般成員、角色擁有人、DM 的公開／私人錢包讀取與修改權維持原 ACL 行為；無權限資料不出現在 UI、負重、REST 或 Realtime payload。
- [ ] 重量例：可讀餘額 `0.99 GP → 0 lb`、`1 GP → 0.02 lb`、`1.99 GP → 0.02 lb`、`2 GP → 0.04 lb`；取消計重後為 `0 lb`。
- [ ] 只可讀公開錢包時，私人 GP 不影響顯示重量；讀取權限恢復後才計入。
- [ ] 轉帳、公私錢包互轉、存／取營地箱與平分維持 `0` 至 `1,000,000.00 GP`；全部操作接受 `0.01 GP`，平分餘數留在來源，來源／目標任何一方超上限時整筆操作失敗。
- [ ] 刪除角色時公開及私人 GP 均併入當前戰役營地箱一次，其他戰役餘額不變；失敗時整個刪除交易回滾。

### 商店交易

- [ ] 公開及私人錢包分別可用 `0.01 GP` 精度購物；不足 `0.01 GP` 時拒絕，正好足額時成功。
- [ ] 直接購買、整車結帳及 DM 核准只扣所選錢包 GP，不轉換面額、不找零、不跨錢包補足。
- [ ] 待審保留／拒絕／取消的庫存與款項行為維持原規則；結帳、扣款、交付、訂單狀態仍在一個 RPC 交易中完成或全部回滾。
- [ ] 隔離 Supabase 以多帳號驗證 RLS、RPC 授權、Realtime、併發重複購買、角色刪除與交易失敗回滾；mock E2E 不可替代此項。

## 建議執行順序

1. [ ] 在隔離資料庫驗證 `1,000,000.00 GP` 上限、超限拒絕、缺欄與不合格面額視為零的轉換及統計報告。
2. [ ] 在隔離資料庫完成只讀資料盤點及 migration 預演，取得維護者核准後建立增量 migration。
3. [ ] 更新 DB 型別、seed／建團 RPC、角色刪除 RPC、商店交易 RPC 及 schema 文件。
4. [ ] 更新 TypeScript 型別／轉換器、同步 hook、錢包行為、重量與 UI。
5. [ ] 更新 mock、E2E、資料庫測試與商店規劃文件；執行 typecheck、lint、相關測試及 build。
6. [ ] 先在隔離專案完成 migration、RLS、Realtime、交易與真實登入流程驗收；再由維護者確認部署目標、migration history 與備份，按核准順序部署。
7. [ ] 以協調的首次上線流程部署已驗收的 migration、Edge Function 與前端；更新並核對正式 schema 快照。

## 已確認決策與剩餘待辦

- **階段一執行狀態：** schema foundation migration 與 SQL 合約測試已發佈及驗證完成（依使用者確認）；後續 RPC、RLS／欄位授權及建團／刪角 cutover 仍待完成，不能以 foundation 驗收代替整體隔離環境驗收。
- **Migration 限制：** 新欄位目前是一次性回填，不會與舊 JSONB 錢包同步；在所有前端、Edge Function 與商店 RPC 切換完成前不得套用。
- **欄位命名：** `gp`、`private_gp`、`camp_chest_gp`。
- **顯示精度：** 最多兩位小數。
- **餘額上限：** 每個錢包最多 `1,000,000.00 GP`；任何會使餘額超限的操作均禁止。
- **舊資料清理：** 缺少欄位、非數值、負數、非整數面額數量及非物件錢包都按零換算；遷移預檢列出受影響資料。
- **客戶端相容：** 目前沒有已發佈上線的前端，不做新舊格式雙寫；migration 與首次前端上線需協調執行。
- **仍待完成：** 後續資料庫 RPC／RLS 整合、前端 GP-only 錢包與商店 cutover、schema 快照更新及整體隔離環境驗收。
