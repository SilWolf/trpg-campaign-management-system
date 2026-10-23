# 鍛造工坊（Blacksmith）物品庫：開發規劃

## 目標與範圍

鍛造工坊是與戰役並列的獨立物品目錄，供 DM 瀏覽並管理可用物品，來源包括：

1. 專案隨附的規則書物品 JSON（第一批資料由維護者提供，預計為 D&D 2024 SRD 5.2）。
2. 使用者自己鍛造並儲存在 Supabase `public.blacksmith_items` 的物品。
3. 其他使用者設為分享、可供搜尋的鍛造物品。

DM 可將任一目錄物品複製到自己有權管理的戰役及角色／營地儲物箱。匯入後的物品成為該戰役獨立的 `inventory_items` 列，之後可依現有功能修改。

本功能不改造現有角色權限、錢包、物品移轉或戰役設定，也不要求預設規則書物品先寫進 Supabase。初版只涵蓋瀏覽、搜尋、檢視、自創物品保存／分享，以及匯入戰役。

## 目前進度與續接資訊

截至 2026-10-24，**階段一至階段五的程式與本機自動化驗收已完成；階段三及階段四 SQL 依維護者回報已手動執行，但離線環境端對端及真實 Supabase 多帳號驗收仍待進行**。目前成果如下：

- `public/data/blacksmith/SOURCE-CONTRACT.md`：記錄現有 index、物品 JSON、lookup 格式與欄位型別，並明確界定來源定義與戰役物品實例。
- `scripts/validate-blacksmith-source.mjs`：驗證目錄索引、資料結構、欄位型別、ID 唯一性及 items／lookup 一對一對照；可執行 `npm run validate:blacksmith-source`。
- 核對結果：`dnd-2024-srd-5.2` 有 537 筆物品與 537 筆 lookup，ID、名稱與來源鍵對照相符，未發現重複 ID／來源鍵。
- 已執行並通過 `npm run validate:blacksmith-source`、`npx eslint scripts/validate-blacksmith-source.mjs`、`npm run typecheck` 及 `git diff --check`。

**已知限制：**目前 537 筆包含 147 筆 `Consumable`、63 筆 `Weapon`、32 筆 `Armor`、295 筆 `Misc`；有 63 筆非空 `damage`、32 筆 `ac`，但沒有附魔詞條樣本。資料的授權名稱、版本與 URL 亦未包含在 JSON 中，發布來源內容前仍須由維護者確認。

**階段二已完成。**定義官方目錄型別，實作靜態目錄載入、結構／lookup 驗證及唯讀瀏覽 UI。現行路由為 `/blacksmith` 工坊大廳、`/blacksmith/officials` 規則書清單、`/blacksmith/officials/$catelogId` 單本目錄內容；`catelogId` 是既有路由參數拼字，新增功能沿用目前網址，不手動修改自動產生的路由樹。

**階段三已完成程式實作、本機型別與 UI 測試。**已新增獨立 `blacksmith_items` migration、snake_case ↔ camelCase 轉換、雲端 CRUD 服務及 `/blacksmith/workshop` 鍛造／分享頁。migration 依維護者回報已在 Supabase 手動執行；多帳號 RLS、實際 schema 相容、取消分享後的拒絕仍未由真實資料庫驗收。

## 現有實作依據

- `InventoryItem` 及物品分類、詞條型別位於 `src/types.ts`；目前戰役物品的 snake_case ↔ camelCase 轉換器在 `src/lib/supabase.ts`。
- 戰役背包由 `inventory_items`、`useCampaignSync` 和 `useInventoryActions` 管理，物品列以 `campaign_id` 隔離。營地儲物箱使用 `owner_id = 'camp-chest'`。
- 已有的自創物品表單及驗證可參考戰役頁的 `HomebrewModal`；鍛造工坊可沿用欄位與視覺，但要將「製作樣板」和「戰役內物品實例」分開。
- 登入後的頂層頁面使用 `src/routes/_protected/` 路由群組；戰役大廳在 `src/routes/_protected/index.tsx`，戰役子頁面在 `src/routes/_protected/campaigns/$campaignId/`。
- 鍛造工坊現有受保護路由共用 `src/routes/_protected/blacksmith/route.tsx` 與 `SystemLinkBar`；大廳、官方目錄清單、單本目錄與自創／分享頁分別位於對應檔案。新增路由需由 TanStack Router 產生路由樹。
- 現有 migration 使用 RLS、`auth.uid()`、`public.is_campaign_dm(text)` 與 `public.is_campaign_member_or_dm(text)` 等函式；任何新增跨表權限判斷都須避免 RLS 遞迴。

## 名詞與資料邊界

| 名稱 | 位置 | 用途 | 是否可寫 |
| --- | --- | --- | --- |
| 規則書目錄項目 | 版本控制中的 JSON | 官方／程序提供的唯讀內容 | 否 |
| `BlacksmithTemplate` | 前端型別與 `blacksmith_items` | 使用者可重用的物品樣板；附作者、分享狀態 | 作者可編輯 |
| `InventoryItem` | `inventory_items` | 某戰役中實際持有的物品實例 | 按既有戰役規則修改 |

`BlacksmithItem` 與 `InventoryItem` **不得共用或依賴同一個資料庫 ID**，也不得在 `inventory_items` 建立指向 `blacksmith_items` 的外鍵。匯入應複製可用的物品內容，並為新戰役物品產生全新 ID。匯入後修改戰役物品，不回寫目錄樣板；修改或刪除樣板，也不影響已匯入的物品。

## 建議的型別與欄位

新增樣板型別前，先把可重用的「物品定義」和戰役實例欄位分清楚；`BlacksmithTemplate` 作為使用者鍛造樣板，官方來源使用 `BlacksmithItem`，既有 `InventoryItem` 維持戰役完整型別，避免直接把任一來源型別當成它的子集強制轉型。

### `BlacksmithTemplate` 建議前端欄位

- 物品定義：`name`、`category`、`subType`、`rarity`、`icon`、`damage`、`mastery`、`ac`、`weight`、`valueGp`、`requiresAttunement`、`maxCharges`、`effects`、`flavor`、`dmNotes`、`isEquippable`、`isConsumable`、`isImportant`、`affixes`。
- 使用者鍛造記錄：`id`、`ownerId`、`isShared`、`createdAt`、`updatedAt`。
- 若保留 `isHomebrew`，它應描述樣板來源，而非授權依據；分享權限必須依 `ownerId` 和資料庫 RLS 判斷。

不放入樣板：`campaignId`、`ownerId`（`InventoryItem` 的角色／營地箱擁有人）、`slot`、`equipped`、`attuned`、目前 `charges`、`isIdentified`、`playerNotes`、`quantity` 等戰役／持有實例狀態。`maxCharges` 是物品定義的上限，可保留；匯入後的目前 `charges` 由匯入預設值或戰役編輯流程決定。

規則書 JSON 雖可沿用 `InventoryItem` 的現有欄位命名與值格式，載入後仍須經明確的正規化／驗證函式轉為物品定義；不得把 JSON 中的 `id` 當成新戰役物品 ID，也不得把缺少的戰役狀態欄位默默補成可寫入資料庫的實例。

### `public.blacksmith_items` 建議 Schema

以新增、獨立的增量 migration 建立，不修改既有 `inventory_items` 欄位。建議欄位：

| 欄位 | 建議型別 | 用途 |
| --- | --- | --- |
| `id` | `text` 主鍵 | 樣板自身識別碼，可由應用程式產生 UUID 字串；匯入時不沿用 |
| `owner_id` | `uuid`，FK 至 `auth.users(id)`，`ON DELETE CASCADE` | 作者帳號；查寫權限直接對照登入者 |
| `name` | `text` | 顯示名稱 |
| `category`、`sub_type`、`rarity`、`icon`、`damage`、`mastery`、`ac` | 與物品定義相容的 `text` 型別 | 物品基本資料 |
| `weight`、`value_gp` | `numeric` | 重量與金額 |
| `requires_attunement`、`is_homebrew`、`is_equippable`、`is_consumable`、`is_important` | `boolean` | 樣板性質與分類旗標 |
| `max_charges` | `integer` | 可選的最大充能數 |
| `effects`、`flavor`、`dm_notes` | `text` | 說明及 DM 備註 |
| `affixes` | `jsonb`，預設空陣列 | 詞條 |
| `is_shared` | `boolean`，預設 `false` | 作者是否公開分享 |
| `created_at`、`updated_at` | `timestamptz` | 建立／修改時間 |

採用與既有物品表相近的 snake_case 欄位，並在型別轉換器中雙向映射。數值、陣列及可空文字欄位須有明確驗證和預設行為。`updated_at` 可使用既有慣例或資料庫 trigger 維護。實際欄位集合應在實作前與收到的 SRD JSON 欄位逐項核對。

## 預設規則書 JSON 與 lookup 建議

現有檔案已採用「每本規則書各自一份 JSON、一份 lookup；另有一個目錄索引」的佈局，實際位於 `public/data/blacksmith/`（Vite 靜態資產路徑），例如：

```text
public/data/blacksmith/
  catalog-index.json
  catalogs/
    dnd-2024-srd-5.2.items.json
    dnd-2024-srd-5.2.lookup.json
```

`catalog-index.json` 只描述可載入的書籍，不複製物品資料：

```json
{
  "schemaVersion": 1,
  "catalogs": [
    {
      "catalogId": "dnd-2024-srd-5.2",
      "title": "D&D 2024 SRD 5.2",
      "itemsFile": "./catalogs/dnd-2024-srd-5.2.items.json",
      "lookupFile": "./catalogs/dnd-2024-srd-5.2.lookup.json"
    }
  ]
}
```

建議 lookup 使用穩定來源鍵，讓 UI、搜尋索引或工具可查名稱、別名與來源，而不必將來源 ID 當成實例 ID：

```json
{
  "schemaVersion": 1,
  "catalogId": "dnd-2024-srd-5.2",
  "items": [
    {
      "sourceKey": "dnd-2024-srd-5.2:source-item-key",
      "itemId": "source-json-item-id",
      "name": "物品名稱",
      "aliases": [],
      "searchTerms": []
    }
  ]
}
```

`itemId` 僅供 lookup 對回同一本書的物品 JSON；應用程式的唯一來源識別至少使用 `catalogId + itemId`，避免不同書籍的 `InventoryItem.id` 重複。可用 `name`、`aliases`、`searchTerms` 支援中文名稱、英文名稱及同義詞搜尋。若維護者提供的 lookup 已有等價欄位，優先建立 adapter 對應，不要求重做資料。

目前鎖定的詳細欄位、型別、null 規則、來源範圍與驗證方式以 [`public/data/blacksmith/SOURCE-CONTRACT.md`](../public/data/blacksmith/SOURCE-CONTRACT.md) 為準。資料讀取時須報告不合法 JSON、重複來源鍵、lookup 找不到物品、物品缺必要欄位等錯誤；不得靜默略過或在錯誤時回傳空目錄。現有資料可用 `npm run validate:blacksmith-source` 驗證。預設資料不寫入 `blacksmith_items`，也不提供修改／分享控制。

## 頁面與互動規劃

### 入口與路由

- 在登入後戰役大廳加入「鍛造工坊」入口，與戰役卡片並列；鍛造工坊是頂層頁面，不隸屬任一 `$campaignId`。
- `/blacksmith` 為工坊大廳；`/blacksmith/officials` 與 `/blacksmith/officials/$catelogId` 提供官方目錄清單及書籍內容；`/blacksmith/workshop` 管理自創樣板與社群分享。沿用受保護路由、暗黑石色背景及琥珀金／秘法紫強調色。
- 不要手動編輯 `src/routeTree.gen.ts`；依專案既有流程新增路由後產生。
- 入口應對登入者顯示；只有 DM 才能把目錄物品匯入戰役。玩家可否瀏覽物品庫、是否只看分享項目，若確有需求再另訂產品規則；初版依「用戶（DM）」需求以 DM 使用情境為主。

### 目錄瀏覽

- 分類標籤／篩選：官方規則書、我鍛造的、他人分享；支援類別、稀有度及名稱／別名搜尋。
- 列表顯示來源書籍或作者、名稱、類別、稀有度、圖示及分享狀態；點選後顯示完整描述、效果、詞條及 DM 備註。
- 規則書資料唯讀。自己建立的物品可編輯、刪除及切換分享狀態；他人分享的物品唯讀，不提供複製到自己的黑匠資料表作為初版必要功能。
- 載入、空結果、資料錯誤、保存錯誤均顯示清楚狀態，不以空列表冒充載入成功。

### 鍛造與分享

- 共用或抽取現有自創物品表單欄位和驗證，儲存為 `blacksmith_items` 樣板，不要求先選戰役或角色。
- 新建樣板由已驗證帳號作為 `owner_id`；不得接受客戶端任意指定作者 ID。
- 預設 `is_shared = false`。作者明確開啟分享後，其他已登入使用者才能瀏覽／匯入；作者仍是唯一可修改、刪除或取消分享的人。
- 取消分享後，其他使用者無法再從資料庫取得此項目；已匯入其他戰役的副本不撤回、不改動。
- 防止非作者偽造 `owner_id`，並對名稱、字串長度、數值範圍、affixes 形狀及必要欄位做前後端驗證。

### 匯入戰役

1. DM 從任一目錄來源按「匯入戰役」。
2. 選擇自己擔任 DM 的戰役，以及該戰役中要接收物品的角色或 `camp-chest`；只列出使用者可管理的目標。
3. 輸入數量，確認物品資訊和接收位置。
4. 從目錄定義建立完整 `InventoryItem`：產生全新 ID、填入目標 `campaignId`／`ownerId`、使用者輸入的數量與戰役既有格式，初始化裝備／調諧／充能／鑑定等實例欄位。`camp-chest` 匯入需確保 `isPrivate = false`。
5. 透過既有 campaign 背包資料同步路徑寫入 `inventory_items`，成功後顯示成功提示並可在戰役中找到副本；寫入失敗應保留表單並顯示實際錯誤。

預設規則書、自己鍛造及他人分享來源一律採相同的「複製定義 → 新建實例」流程。不可把來源表的 `id`、`owner_id` 或分享狀態複製到戰役資料。

## 資料安全與 Supabase 規劃

### `blacksmith_items` RLS

建立 migration 時啟用 RLS，並明確處理 SELECT、INSERT、UPDATE、DELETE：

- `SELECT`：作者可讀自己的所有樣板；其他已登入使用者只可讀 `is_shared = true` 的樣板。
- `INSERT`：`owner_id = auth.uid()`。
- `UPDATE`、`DELETE`：只允許 `owner_id = auth.uid()`；UPDATE 的 `WITH CHECK` 仍須確保新列作者是登入者。
- 前端呼叫 `.select()` 時遵守同樣的可見性條件，但 RLS 才是最終安全邊界。
- 不以 `profiles` 或 `blacksmith_items` policy 再查詢自身表格來決定權限。若未來需要跨表權限檢查，封裝於 `LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE` helper，並嚴格限制 EXECUTE。
- `owner_id` 為 UUID；比較使用 `auth.uid()`。不把 UUID cast 成文字來存入作者欄位。

### DM 才能匯入的授權

現有 campaign 層級的 inventory policy 以 campaign 成員資格為邊界，不能僅因 UI 隱藏按鈕就視為匯入已受 DM 保護。實作時要選擇並落實一種資料庫授權方案：

- 優先考慮安全的資料庫 RPC：由資料庫以 `auth.uid()` 驗證目前使用者是目標 campaign 的 DM，再驗證目標角色／`camp-chest` 屬於該 campaign，最後在單一交易建立新的 inventory 列；或
- 若採直接 insert，新增明確限制 inventory INSERT 僅允許 `public.is_campaign_dm(campaign_id)` 的 restrictive policy，先確認與現有所有 inventory 建立流程相容。

無論方案為何，資料庫須驗證 campaign、owner 與物品欄位；前端角色下拉選單不是授權機制。角色的 `user_id`、`campaign_id` 是 `text`，`campaigns.dm_id` 也是 `text`；若要和 `auth.uid()` 比較，使用 `auth.uid()::text` 或既有 `is_campaign_dm(text)` 函式。不得在 policy 中直接自我查詢造成遞迴。

`blacksmith_items` 不需要 campaign 欄位、campaign 外鍵或 `inventory_items` 外鍵。初版同步可採明確 reload；若之後加入 Realtime，仍由 RLS 決定可見資料，Realtime 不是授權替代品。

## 建議實作檔案範圍

以下是預期位置，實作時按既有命名及路由慣例調整：

| 範圍 | 建議位置 |
| --- | --- |
| 資料來源 | `public/data/blacksmith/catalog-index.json`、`public/data/blacksmith/catalogs/*`（由 `src/lib/blacksmithCatalog.ts` 讀取及驗證） |
| 型別 | `src/types.ts`，新增 `BlacksmithItem` 及必要來源型別 |
| snake_case ↔ camelCase 轉換 | `src/lib/supabase.ts`，新增 `DbBlacksmithItem`、轉換器及目錄正規化 helper（若適合） |
| Supabase Schema／RLS | 新增 `supabase/migrations/<timestamp>_blacksmith_items.sql` |
| Supabase CRUD | `src/lib/blacksmithItems.ts` |
| 頂層路由 | `src/routes/_protected/blacksmith/route.tsx`、`index.tsx`、`officials/` 及 `workshop.tsx` |
| 大廳入口 | `src/routes/_protected/index.tsx` |
| 自創表單重用 | 評估抽出共用表單，避免複製 `HomebrewModal` 全部欄位與驗證 |
| 測試 | 目錄 adapter／匯入轉換單元測試、路由互動測試、RLS／migration 手動驗收 |

不要直接改 `src/routeTree.gen.ts`。新增欄位必須在正反向轉換器處理，並為舊資料／缺少選用欄位提供明確相容預設值。

## 分階段實作

### 階段一：鎖定來源資料合約

- **狀態：已完成（以目前提供的資料為範圍；代表性類型仍有缺口）。**
- 已核實 `public/data/blacksmith/catalog-index.json`、`catalogs/dnd-2024-srd-5.2.items.json` 與 `catalogs/dnd-2024-srd-5.2.lookup.json` 的頂層結構、欄位型別、null 規則、ID 唯一性及 lookup 對照方式。
- 已鎖定樣板定義與戰役實例的欄位分界；來源 ID 不可沿用為 `InventoryItem.id`。具體格式見 [`public/data/blacksmith/SOURCE-CONTRACT.md`](../public/data/blacksmith/SOURCE-CONTRACT.md)。
- 已新增 `npm run validate:blacksmith-source`；目前 537 筆 items／lookup 對照通過，類別涵蓋 `Consumable`、`Weapon`、`Armor`、`Misc`，並包含 63 筆武器傷害及 32 筆護甲值。
- **未完成的資料覆蓋：**目前沒有附魔詞條樣本。JSON 亦未提供授權名稱／版本／URL。取得補充來源後，應先核對並更新合約，再擴充型別或轉換邏輯。
- 不將尚未提供的 SRD 物品內容自行補寫進 repository。

### 階段二：型別、目錄讀取及瀏覽 UI

- **狀態：已完成（2026-10-23）。**
- 在 `src/types.ts` 新增官方 `BlacksmithItem`、目錄索引及 lookup 型別；不將戰役實例欄位混入官方來源定義。
- 在 `src/lib/blacksmithCatalog.ts` 從 Vite 靜態目錄載入 index、items 與 lookup；驗證 schema 版本、欄位、數值、相對路徑、目錄識別、唯一 ID 及 items／lookup 的名稱與 sourceKey 對照，錯誤會明確回報而不略過資料。
- 目前官方頁面路徑為 `/blacksmith/officials` 清單及 `/blacksmith/officials/$catelogId` 單本書籍頁；搜尋支援名稱、描述、別名與搜尋詞，提供分類／稀有度篩選、詳情及明確的載入與錯誤狀態。
- 工坊大廳在 `/blacksmith`，戰役大廳有入口，鍛造區和戰役導覽透過 `SystemLinkBar` 切換；本階段不處理戰役匯入。
- 目前來源驗證為 537 筆 items／lookup 對照通過。測試數量以當前 `tests/e2e/blacksmith.spec.ts` 為準，不沿用較早期的 2 項摘要。

### 階段三：資料庫、鍛造及分享

- **狀態：程式實作及 mock 驗收完成；維護者已手動執行 migration，真實 RLS 驗收待完成。**
- `supabase/migrations/20261024000000_blacksmith_items.sql` 建立獨立樣板資料表、owner／shared 查詢索引、欄位與附魔 JSONB 結構限制、更新時間 trigger，以及作者 CRUD／已登入者僅讀已分享列的 RLS。作者 ID 為 `uuid` 並 FK 至 `auth.users(id)`；不關聯 campaign 或 inventory。
- `BlacksmithTemplate` 型別及 `DbBlacksmithItem` 正反轉換位於 `src/types.ts`、`src/lib/supabase.ts`；`src/lib/blacksmithItems.ts` 實作讀取、建立、更新、刪除。建立由前端產生新的 UUID 樣板 ID，作者 ID 取自已登入 session；DB trigger 維護 `updated_at`。
- `/blacksmith/workshop` 提供「我的樣板」與「冒險者分享」清單、名稱／類型／效果搜尋、建立／編輯／刪除及分享切換。新樣板預設私人；共享樣板為唯讀；取消分享只影響他人後續讀取，不會修改其他戰役中的既有副本。無 Supabase 或訪客模式會明確提示未保存，沒有本機成功假象。
- 分享會公開完整樣板列，包含鍛造備註與附魔詞條；表單已提示備註會隨分享公開。共享清單目前以「分享樣板」標示，不揭露帳號 UUID 或作者姓名；未建立 profiles 關聯顯示機制。
- 驗證：`npm run validate:blacksmith-source`、`npm run typecheck`、`npm run build`、受影響檔案 ESLint、`git diff --check`，以及 `npm run test:e2e -- tests/e2e/blacksmith.spec.ts`（5 項）通過。E2E 對 Supabase REST 使用測試替身，只驗證前端行為和 request contract，不等同真實 RLS／多 session 驗收。
- **SQL 執行紀錄（維護者於本次續接前回報）：**`20261024000000_blacksmith_items.sql` 已手動執行。此紀錄僅代表 SQL 已執行；尚未據此宣稱已完成多帳號 RLS、取消分享即時拒絕或完整 Supabase 驗收。
- **待手動驗收：**使用兩個正式帳號直接測試私人不可見、共享可讀不可寫、偽造 owner 被拒、取消分享後不可再讀及作者刪除後 FK 行為。未完成前不得宣稱上線。

**階段四續接條件：**階段三 SQL 已由維護者手動執行。新增匯入 RPC migration 仍須在真實環境驗收前由維護者確認目標專案及 migration history 後手動部署。匯入仍須遵守 DM 授權、產生新的 campaign item ID、維持 `camp-chest` 公開，以及既有多列同步非原子性的限制。

### 階段四：匯入戰役

- **狀態：前端與資料庫 migration 程式已完成；本機驗收後，新增匯入 RPC migration 仍待維護者手動部署及真實 Supabase 驗收。**
- `src/components/blacksmith/BlacksmithImportButton.tsx` 提供共用匯入流程，已接在官方目錄物品詳情及鍛造／分享樣板卡片；戰役選擇僅列出 `campaigns.dm_id` 為目前使用者的戰役，接收目標為該戰役角色或虛擬 `camp-chest`。
- `src/lib/blacksmithImport.ts` 將官方 `BlacksmithItem` 或 `BlacksmithTemplate` 明確轉為匯入定義，不沿用來源 ID、作者 ID 或分享狀態。官方物品初始化為非 homebrew，描述／來源分別映射至效果／風味；樣板則保留其物品定義屬性。
- 新增 `supabase/migrations/20261024000001_blacksmith_campaign_import.sql`，建立 `SECURITY DEFINER` RPC `public.import_blacksmith_item`。RPC 於單一資料庫交易內驗證登入者、DM 身分、目標角色／戰役歸屬及數量，並以全新 UUID 字串 ID 建立 `inventory_items` 列。實例狀態初始化為未裝備、未調諧、未鑑定及目前充能 0；`camp-chest` 強制公開。RPC 限制僅 `authenticated` 可執行，不依賴前端 picker 作為授權邊界，也不變更現有 inventory 一般寫入 policy。
- 匯入成功顯示戰役、接收角色及數量；失敗會顯示錯誤並保留匯入視窗。匯入寫入由 RPC 在單一列交易完成，之後由既有戰役初始載入及 inventory Realtime 訂閱顯示；此流程不涉及多列轉帳，不宣稱跨列原子性。
- 本機驗證：`npm run build`（含 TypeScript typecheck）、受影響檔案 `npx eslint`、`npm run validate:blacksmith-source`、`git diff --check`，以及 `npm run test:e2e -- tests/e2e/blacksmith.spec.ts`（7 項）通過。E2E 使用 Supabase 測試替身，只證明 UI 與 RPC request contract，未驗證真實 RPC、RLS、資料庫 migration 或 Realtime。
- **既有 inventory policy 邊界：**匯入介面只呼叫上述 DM 驗證 RPC；本階段沒有收窄既有 `inventory_items` 成員寫入 policy，避免破壞依角色 ACL 的日常新增物品、背包編輯及移轉流程。因此不能宣稱一般成員無法以既有直接 inventory REST INSERT 建立內容相同的物品列。若產品要求封鎖這種等效直寫，須另行設計並驗證兼容既有 ACL／新增／移轉的資料庫授權，不可只加 DM-only INSERT policy。
- **SQL 執行紀錄（維護者於階段五前回報）：**`20261024000001_blacksmith_campaign_import.sql` 已手動執行。此紀錄不代表本次已連線檢查目標專案或 migration history，也不代表 RPC、RLS 與資料庫結果已完成真實環境驗收。
- **待真實環境驗收：**驗證 DM 可匯入、非 DM／錯誤 campaign／不存在角色被拒，以及官方、私人自創與分享樣板均建立獨立副本；營地箱物品須為公開。須使用實際 Supabase 專案與多帳號執行，不能以 mock E2E 取代。

### 階段五：整合與驗收

- **狀態：本機自動化驗收與程式檢視完成；離線環境端對端及真實 Supabase 多帳號驗收待執行。**階段三與階段四 migration 已依維護者回報手動執行，但本次未連線至 Supabase，未驗證遠端 schema、RLS 或 RPC 執行結果。
- **離線／未登入行為：**程式檢視確認官方靜態目錄不依賴雲端；鍛造、分享與匯入在 Supabase 未設定或使用訪客帳號時會顯示明確不可用提示，不回報假保存成功。尚未在未設定 Supabase 的獨立執行環境做端對端測試；雲端操作 E2E 使用 Supabase 測試替身，不能替代此驗收。
- **本機驗證（2026-10-24）：**
  - `npm run validate:blacksmith-source` 通過：1 本目錄，537 筆物品及 537 筆 lookup 對照。
  - `npm run typecheck`、`npm run lint`、`npm run build` 通過。
  - `npm run test:e2e -- tests/e2e/blacksmith.spec.ts` 通過：7 項。
  - `npm run test:e2e` 通過：31 項。E2E 對 Supabase REST／RPC 使用測試替身，只驗證前端流程與請求合約。
- **真實 Supabase 待驗收：**以至少兩個帳號直接驗證私人樣板不可互見、分享樣板可讀不可改、取消分享後不可讀；再驗證 DM 匯入成功、非 DM／錯誤 campaign／不存在角色遭拒、每次匯入產生新 ID、`camp-chest` 保持公開，以及跨 campaign 隔離。這些項目未完成前，不宣稱 RLS、RPC 或整合已在真實資料庫驗收。
- **直接 INSERT 權限邊界仍待產品決策：**現有 `inventory_items` policy 未收窄；目前可確認匯入 UI 使用 DM 驗證 RPC，但尚未阻止或測試一般成員直接呼叫既有 INSERT 建立等效物品。若要求封鎖，須先設計兼容 ACL、日常新增及移轉的資料庫方案，再部署並測試。

## 驗收清單

### 目錄及 lookup

- 可以載入多份規則書 JSON；每本書可單獨出現在來源篩選中。
- lookup 能回到正確物品；同名或跨書重複 ID 不會造成覆蓋或錯誤匯入。
- JSON 語法錯誤、重複來源鍵、無效物品及無法對照 lookup 都會明確報錯。
- 規則書項目是唯讀，搜尋支援 lookup 提供的別名／搜尋詞。

### 鍛造、分享、RLS

- 登入 DM 可在沒有先建立戰役的情況下鍛造、編輯及刪除自己的樣板。
- 樣板預設不分享；作者分享後其他登入者可讀、可匯入但不能更新或刪除。
- 未登入／非作者不能新增或冒用別人 `owner_id`；取消分享後他人無法再查閱。
- RLS 測試以不同帳號直接呼叫 Supabase 驗證，不能只驗證 UI 按鈕狀態。

### 匯入與隔離

- DM 可匯入規則書、自己的樣板、他人分享樣板至自己 DM 的戰役。
- 每次匯入都產生新 `inventory_items.id`，資料表無來源外鍵；修改副本不影響原樣板。
- 非 DM 無法藉直接 API/RPC 寫入匯入物品；不能向他人戰役或不存在角色注入物品。
- `campaign_id`、`owner_id`、數量和實例狀態正確；`camp-chest` 物品維持公開。
- 私人未分享的樣板不出現在其他帳號查詢中；不同 campaign 的實例完全依既有隔離規則處理。

## 待首次實作時核對的決策

1. 收到 JSON／lookup 後，依真實資料格式確認上方建議 schema 是否需要欄位 adapter 或多語系欄位。
2. 首版預設目錄是否只允許 DM 瀏覽，或允許所有已登入成員瀏覽而僅限制 DM 匯入；本規劃按 DM 為核心使用者，入口可先只放在 DM／大廳，授權仍須由資料庫保障。
3. `charges`、`isIdentified` 等實例狀態的匯入預設及是否提供匯入對話框設定；不得將它們放回樣板資料表來解決。
4. **已決定：**樣板 ID 由前端 `crypto.randomUUID()` 產生為文字 ID，`updated_at` 由資料庫 trigger 維護；匯入階段仍須另產生全新的 inventory ID。
5. **已決定（初版）：**分享完整樣板內容，包含 `dm_notes`；UI 告知作者此欄會隨分享公開。未來若需隱藏備註，須改用獨立欄位授權／API，不可僅以 UI 隱藏。

## 部署及相容性提醒

- 新增 SQL 僅提供 migration 與部署步驟；由維護者在隔離 Supabase 專案確認既有 Schema、RLS、migration history 後套用。不要直接修改或重建現有表。
- `blacksmith_items.owner_id` 是 UUID；角色／戰役／inventory ID 為 text。依既有型別規則避免未檢查的 UUID cast。
- Supabase 未設定、訪客或單機情境可以讀取 bundled JSON，但雲端 CRUD／分享／戰役匯入不可回報假成功；要顯示功能需要登入或雲端設定的提示。
- 本功能不能使已分享的內容繞過原有 campaign ACL，也不能將 Realtime 或前端角色判斷當作資料庫授權。
