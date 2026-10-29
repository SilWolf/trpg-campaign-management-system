# GP-only 金錢系統：開發規劃

## 目標與範圍

將玩家錢包從 PP、GP、EP、SP、CP 五種面額改為可精確到 `0.01 GP` 的單一 GP 餘額。保留角色公開錢包與私人暗袋兩個獨立餘額，以及現有讀取／修改 ACL；此規劃取消面額換算，不合併錢包，也不改變商店價格、物品價值等以 GP 表示的欄位。

**錢包模型已確認：** 每名角色仍有公開與私人兩個錢包，各自儲存 GP。營地儲物箱仍只有公開錢包。私有錢包 ACL、DM 權限、角色擁有者權限及現有單向轉移規則繼續適用。

## 已確認的現況

- v0.1.0 基線以 `characters.currencies`、`characters.private_currencies` 及 `campaigns.camp_chest_currency` 儲存 JSONB 五面額錢包；foundation migration 已新增 GP 欄位但暫保留舊欄位作相容鏡像。基線及 schema 快照記載於 [20261030000012_v0_1_0.sql](../supabase/migrations/20261030000012_v0_1_0.sql) 與 [external/schema.md](../external/schema.md)。
- 前端角色／營地箱轉換器以 GP 欄位為餘額來源，仍保留 `CurrencyType` 相容格式；範例 seed 與 `create-campaign` Edge Function 尚未切換到 GP API。相關位置為 [types.ts](../src/types.ts)、[supabase.ts](../src/lib/supabase.ts)、[data.ts](../src/data.ts) 及 [create-campaign/index.ts](../supabase/functions/create-campaign/index.ts)。
- 背包錢包 UI 已改為 GP 單一餘額；保留公開／私人分頁、錢包 ACL、轉帳與營地箱操作，已移除面額選擇及換整功能。現況見 [CurrencyPanel.tsx](../src/routes/_protected/campaigns/$campaignId/-parts/CurrencyPanel.tsx)、[CharacterStatusBar.tsx](../src/routes/_protected/campaigns/$campaignId/-parts/CharacterStatusBar.tsx) 及 [campaign/$campaignId/index.tsx](../src/routes/_protected/campaigns/$campaignId/index.tsx)。
- 錢幣重量改依可讀錢包的整數 GP 計算，每滿 1 GP 計 `0.02 lb`，並保留 ACL 隔離及計重切換。GP 修改、角色間／營地箱移轉與平分已在前端以整數分運算；跨列遠端移轉仍不是單一資料庫交易。
- 商店結帳已從選定公開／私人 `gp` 錢包扣款，不再以 CP helper 換算或找零；待審、核准、拒絕、取消與付款仍由資料庫交易 RPC 處理。GP migration 尚未部署及通過隔離 Supabase 驗收。

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
- **仍待整合：** foundation migration 保留舊 JSONB 欄位；建團／刪角 RPC、錢包 ACL/RLS、campaign 欄位授權及相關 trigger，仍須依各階段更新。背包錢包 UI／操作已完成 GP-only 切換；商店 RPC 尚未切換。
- **驗收狀態：** foundation SQL 的發佈與驗證由使用者確認完成；此狀態不代表前端、Edge Function 或後續交易 RPC 已部署。 [external/schema.md](../external/schema.md) 快照更新仍待維護者依實際部署 schema 核對。
- 更新 `characters`／`campaigns` 欄位、預設值、非負與兩位小數限制；移除舊 JSONB 欄位前，確認所有讀寫端與函式已遷移。
- 更新 `existing_schema_baseline` 相關文件／未來基線檢查及 schema 快照。既有合併 migration 不回頭修改。
- 更新 `create_campaign_from_seed` 的 seed 欄位驗證與 insert，並同步更新 Edge Function `CampaignSeed` 型別及建團呼叫端；範例／空白戰役、角色新建及營地箱的餘額均使用 GP 數值。
- 更新 `delete_campaign_character_with_journeys`：刪角前將角色公開與私人 GP 加入該戰役 `camp_chest_gp`，一次資料庫交易內完成，且保留既有權限檢查、物品移轉及筆記處理。
- 保留 `character_permissions.public_wallet_access` 和 `private_wallet_access` 欄位及其 RLS／SECURITY DEFINER 授權規則；改的是錢包表示法，不是 ACL。確認角色建立、擁有權移交與預設權限 trigger 不再引用舊餘額欄位。
- 更新所有錢包相關政策、trigger、helper 及 campaign 欄位授權，確保一般成員仍不能讀寫無權限的私人 GP，也不能藉 Realtime、結帳或錯誤訊息推知餘額。

### 2. TypeScript、資料同步與本機 seed

- **階段二程式碼完成：** 已新增 `Character.gp`／`privateGp`、資料庫 GP 欄位轉換與範例角色 GP seed；`useCampaignSync` 改讀營地箱 GP 並維持離線／訪客本機資料。為遵守分階段範圍，暫留五面額相容資料；角色／營地箱遠端寫入同步更新 GP 與舊格式，供尚未切換的商店 RPC 使用。背包 UI／操作已在階段三切換，但在商店 RPC 一併切換前仍須保留相容資料及雙寫；全部讀寫端切換完成後再移除。
- **程式驗收：** `npm run typecheck`、`npm run lint`、`npm run test:e2e`（105 項通過）及 `npm run build` 通過；mock／本機驗收不代表真實 Supabase RLS、Realtime 或交易已驗收。
- `toDbCharacter` 會拒絕不合法、超限或與相容欄位不一致的 GP 餘額；`fromDbCharacter` 以 GP 為準，並驗證既有錢包欄位，避免靜默讀取不一致資料。
- 修改 `src/types.ts` 中 `CurrencyType`、`Character`、營地箱及所有錢包相關型別；保留 `CampaignShopWalletType = 'public' | 'private'`，因兩種付款來源仍存在。
- 修改 `src/lib/supabase.ts` DB 型別、camelCase／snake_case 轉換器、fallback 與 campaign 錢包轉換器；刪除五面額物件的假設。
- 修改 `src/hooks/useCampaignSync.ts` 初始讀取、campaign Realtime、寫入佇列及本機模式的營地箱餘額；確保空白戰役仍以零 GP 開始，且不寫入 `camp-chest` 角色列。
- 修改 `src/data.ts` 的範例角色與營地箱金額。按上述公式換算現有範例金額，不可只複製原 GP 欄而遺失零錢價值。
- 修改 [CharacterModal.tsx](../src/routes/_protected/campaigns/$campaignId/-parts/CharacterModal.tsx) 新角色的公開／私人初始 GP；編輯角色時完整保留原餘額。

### 3. 背包錢包、轉帳與負重 UI

- [x] `CurrencyPanel` 僅顯示 GP；提供 `0.01 GP` 加減與轉出數量輸入，支援轉給角色、存入／領出營地箱。移除面額下拉、「一鍵將零錢換整為金幣」按鈕、callback、handler、toast 與舊面額 UI 測試。
- [x] 保留公開／私人錢包分頁、無權限遮罩、自身錢包互轉、只需來源修改權即可單向轉出的規則；營地箱仍只有公開錢包。
- [x] 營地箱「平分給全隊」以整數分 GP 計算，無法平均分配的分數 GP 留在營地箱。
- [x] `CharacterStatusBar` 直接顯示目前選定錢包 GP，移除「折合」標籤與 PP／EP／SP／CP 摘要。
- [x] 負重只計入 ACL 可讀錢包；每滿 1 整數 GP 計 `0.02 lb`，不足 1 GP 不計，並保留「計入硬幣重」切換。
- [x] 硬幣重量與總負重至少保留 `0.01 lb` 精度；GP 操作以整數分計算，避免小數累加誤差。
- [x] `useInventoryActions` 的加減、雙錢包互轉、角色間轉帳、營地箱存取與平分均以 GP 分運算，檢查來源足額及餘額上限。遠端多列寫入仍非單一資料庫交易，不宣稱具原子性；若需防止跨客戶端競爭或重複扣款，仍須另行設計並驗收交易 RPC。
- **階段三驗收：** 新增 E2E 覆蓋 `0.01 GP` 加減／轉帳、來源足額及目標上限、營地箱分帳餘數，以及 `0.99`、`1`、`1.99`、`2 GP` 的重量案例；測試使用 Supabase mock，不代表真實 RLS、Realtime 或跨列交易已驗收。

### 4. 商店結帳與訂單

- [x] 玩家選擇公開／私人錢包及依 ACL 顯示付款方式的流程不變；角色錢包餘額改讀 `gp`／`private_gp`，不再以舊面額 JSONB 計算。
- [x] 移除商店結帳對 `shop_wallet_total_cp`／`shop_wallet_from_cp` 的使用並刪除 helper；只從選定 GP 錢包扣除訂單金額，不找零、不合併公開與私人餘額。為尚未切換的舊端保留同交易更新的 JSONB 相容鏡像，不用它判斷餘額或付款。
- [x] 立即結帳、待審申請、DM 核准／拒絕、玩家取消與整車結帳沿用現有 RPC／settlement 交易流程；替換 settlement 錢包扣款來源，保留庫存保留／釋放、資料列鎖、授權檢查、公開訂單紀錄與單一 PostgreSQL 交易原子性。
- [x] 價格與錢包使用 `0.01 GP` 精度。前端購物車以整數分 GP 計價；RPC 驗證金額乘 `100` 為整數且指定錢包足額，再以 `numeric` 精確扣款，避免浮點誤差。
- [x] 更新 [campaign-shop-plan.md](./campaign-shop-plan.md) 的 CP 換算、找零及錢包欄位規格；保留「只從指定錢包付款」及交易原子性。
- **階段四程式完成：** 新增 [20261030000014_gp_wallet_shop_checkout.sql](../supabase/migrations/20261030000014_gp_wallet_shop_checkout.sql)，並更新商店結帳 UI、mock 與購買 E2E。`0.01 GP` 公開／私人錢包足額及不足情境由 mock E2E 驗證；migration 未套用，真實 Supabase 權限、RPC、併發及回滾仍待隔離環境驗收。

### 5. 測試、mock 與文件

- [x] 檢視並更新 GP-only UI／shop checkout 對應的角色 GP 欄位、舊 JSONB 相容鏡像及 RPC 行為 mock；更新 [phase-1-baseline.spec.ts](../tests/e2e/phase-1-baseline.spec.ts)、[phase-3-inventory.spec.ts](../tests/e2e/phase-3-inventory.spec.ts) 和 [campaign-shop-purchase.spec.ts](../tests/e2e/campaign-shop-purchase.spec.ts)。建團 seed 目前仍採舊欄位是因 Edge Function／建團 RPC 尚未 cut over，不可把測試改成尚未實作的 API 合約。
- [x] 更新 GP 操作與商店付款 E2E，新增 [currency-converters.spec.ts](../tests/e2e/currency-converters.spec.ts) 覆蓋角色公開／私人錢包及營地箱的 GP 往返、精度／上限邊界、不合法金額與相容欄位不一致。
- [x] 搜尋幣值 ID、舊 CP helper 與「換整」文案／測試；保留 `CurrencyType`、`currencies`、`privateCurrencies` 及 `camp_chest_currency` 僅作未切換讀寫端所需相容欄位，不修改歷史發行紀錄。
- [x] 更新 [campaign-shop-plan.md](./campaign-shop-plan.md) 與 [database-template-migration.md](./database-template-migration.md)，明確區分本機程式／mock／SQL 合約檢查及真實隔離 Supabase 驗收。未經維護者核對的 [schema.md](../external/schema.md) 快照維持原狀，不以規劃內容冒充實際 schema。
- [x] 驗證 `npm run typecheck`、`npm run lint`、`npm run test:e2e` 及 `npm run build`；具體結果記於本階段下方。SQL 合約檔案為 [gp_wallet_schema_foundation.sql](../supabase/tests/gp_wallet_schema_foundation.sql)，本次未連線資料庫執行。

**階段五執行結果：** 本機 Playwright E2E 共 117 項通過；新增轉換器回歸測試覆蓋 `0`、`0.01`、`0.99`、`1`、`1.99`、`999,999.99`、`1,000,000.00 GP` 的公開／私人角色錢包及營地箱往返，並確認負數、`0.001`、超限、NaN／Infinity、無效字串及新舊欄位不一致會被拒絕。上述結果不代表已執行資料庫 SQL 測試，也不代表隔離 Supabase 的 RLS、Realtime、RPC 權限、併發或回滾已驗收。

## 驗收清單

### 精度與資料遷移

- [ ] `0`、`0.01`、`0.99`、`1`、`1.99`、`999,999.99`、`1,000,000.00` GP 從 DB 到 UI 再回 DB round-trip 不變。
- [ ] `1,000,000.01 GP`、超過上限的加值／轉入／商店退款或其他入帳操作均由 UI、RPC 及資料庫限制拒絕；剛好到達上限可成功。
- [ ] `0.001`、負數、NaN／Infinity、無效字串及超出允許位數的值由前端與資料庫拒絕；不靜默 round。
- [ ] 舊五面額資料公開、私人、營地箱分別換算，總價值守恆至 `0.01 GP`；轉換報表可供維護者核對。
- [ ] 建立範例／空白戰役、新角色及離線／訪客模式都使用正確的 GP 初始值。

### 權限、重量與移轉

- [ ] 一般成員、角色擁有人、DM 的公開／私人錢包讀取與修改權維持原 ACL 行為；無權限資料不出現在 UI、負重、REST 或 Realtime payload。
- [x] 重量例：可讀餘額 `0.99 GP → 0 lb`、`1 GP → 0.02 lb`、`1.99 GP → 0.02 lb`、`2 GP → 0.04 lb`；取消計重後為 `0 lb`。
- [x] 只可讀公開錢包時，私人 GP 不影響顯示重量；此項由 UI／mock E2E 驗證，真實 ACL 尚待隔離 Supabase 驗收。
- [x] UI 操作涵蓋 `0` 至 `1,000,000.00 GP`、`0.01 GP` 精度、分帳餘數保留及來源／目標超上限拒絕；此處不代表資料庫交易原子性或遠端競爭保護。
- [ ] 刪除角色時公開及私人 GP 均併入當前戰役營地箱一次，其他戰役餘額不變；失敗時整個刪除交易回滾。

### 商店交易

- [x] UI／mock E2E 覆蓋公開及私人錢包 `0.01 GP` 足額成功與餘額不足時禁止結帳；真實 RPC 驗收待隔離環境。
- [x] 直接購買、整車結帳及 DM 核准的 settlement 僅扣所選錢包 GP，不換算面額、不找零、不跨錢包補足；資料庫端尚未實際執行驗收。
- [x] 保留待審庫存、拒絕／取消釋放及交易 RPC 的原子處理程式；資料庫端回滾與併發行為仍待隔離 Supabase 驗收。
- [ ] 隔離 Supabase 以多帳號驗證 RLS、RPC 授權、Realtime、併發重複購買、角色刪除與交易失敗回滾；mock E2E 不可替代此項。

## 建議執行順序

1. [ ] 在隔離資料庫驗證 `1,000,000.00 GP` 上限、超限拒絕、缺欄與不合格面額視為零的轉換及統計報告。
2. [ ] 在隔離資料庫完成只讀資料盤點及 migration 預演，取得維護者核准後建立增量 migration。
3. [ ] 更新 DB 型別、seed／建團 RPC、角色刪除 RPC、商店交易 RPC 及 schema 文件。
4. [ ] 更新 TypeScript 型別／轉換器、同步 hook、錢包行為、重量與 UI。（錢包行為、重量與 UI 的階段三已完成；其他 GP cutover 仍待辦。）
5. [x] 更新 mock、E2E 與商店／部署規劃文件，並執行 typecheck、lint、E2E 及 build。資料庫 SQL 合約測試已有版本，但本次未在資料庫執行；真實隔離 Supabase 驗收仍待辦。
6. [ ] 先在隔離專案完成 migration、RLS、Realtime、交易與真實登入流程驗收；再由維護者確認部署目標、migration history 與備份，按核准順序部署。
7. [ ] 以協調的首次上線流程部署已驗收的 migration、Edge Function 與前端；更新並核對正式 schema 快照。

## 已確認決策與剩餘待辦

- **階段一執行狀態：** schema foundation migration 與 SQL 合約測試已發佈及驗證完成（依使用者確認）；後續 RPC、RLS／欄位授權及建團／刪角 cutover 仍待完成，不能以 foundation 驗收代替整體隔離環境驗收。
- **Migration 限制：** foundation migration 的 GP 欄位是一次性回填；切換期間由前端同步及商店 settlement 維持舊 JSONB 相容鏡像。仍有其他舊讀寫端尚未切換，故不得只套用 foundation 或假設舊欄位可移除。
- **欄位命名：** `gp`、`private_gp`、`camp_chest_gp`。
- **顯示精度：** 最多兩位小數。
- **餘額上限：** 每個錢包最多 `1,000,000.00 GP`；任何會使餘額超限的操作均禁止。
- **舊資料清理：** 缺少欄位、非數值、負數、非整數面額數量及非物件錢包都按零換算；遷移預檢列出受影響資料。
- **客戶端相容：** 目前沒有已發佈上線的前端，不支援新舊前端並行；切換完成前保留舊 JSONB 相容鏡像，所有資料讀寫端遷移後再移除。
- **階段三執行狀態：** 背包錢包 UI、GP 分轉帳／平分、ACL 過濾負重與對應 mock E2E 已完成；程式測試不代表 Supabase 真實 RLS、Realtime、RPC 或跨列交易已驗收。
- **仍待完成：** 建團／刪角等其他資料庫 RPC／RLS 整合、移除舊錢包相容鏡像、schema 快照更新與整體隔離環境驗收；商店 GP cutover 的本機程式實作已完成，尚未部署或通過真實資料庫驗收。
