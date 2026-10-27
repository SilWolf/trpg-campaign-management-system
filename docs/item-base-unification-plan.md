# 統一物品資料結構：開發規劃

## 目標

統一戰役背包、鍛造工坊及戰役商店快照的物品定義，建立共用的 `ItemBase`，讓三種物品共用名稱、分類、稀有度、重量、價值、附魔及描述等欄位。武器與護甲則以分類判別型別，分別要求 `weaponProperties` 與 `armorProperties`。

本次包含 TypeScript 型別、目錄／表單資料格式、轉換器、Supabase schema、UI 與測試的同步調整。假設相關資料表已清空，因此不需撰寫舊資料回填或轉換 SQL；仍須更新 schema 定義及部署 migration，讓新欄位能正確讀寫。

## 現況與相依範圍

- [`src/types.ts`](../src/types.ts) 目前以 `ItemCategory`、`Rarity`、`InventoryItem`、`BlacksmithItem`、`CampaignShopItemSnapshot` 分別描述物品。三者欄位不一致，附魔目前可選，且欄位使用 `requiresAttunement`。
- [`src/lib/supabase.ts`](../src/lib/supabase.ts) 負責 `inventory_items`、`blacksmith_items` 及商店 `item_snapshot` 的 snake_case ↔ camelCase 轉換；DB 介面、預設值及正規化須一併調整。
- [`src/lib/blacksmithCatalog.ts`](../src/lib/blacksmithCatalog.ts) 驗證官方目錄 JSON 的欄位及目前四種分類，需同步更新讀取、驗證與分類篩選。
- [`src/lib/blacksmithImport.ts`](../src/lib/blacksmithImport.ts) 將官方目錄或鍛造樣板轉成戰役物品，目前將官方 `description`、`source` 映射至 `effects`、`flavor`，需明確調整新欄位與來源資訊的對應。
- [`src/lib/campaignShopRefresh.ts`](../src/lib/campaignShopRefresh.ts) 驗證刷新政策候選、篩選分類並將鍛造項目轉成商店快照，需使用新型別及轉換器。
- 背包操作與顯示至少涉及 [`src/hooks/useInventoryActions.ts`](../src/hooks/useInventoryActions.ts)、[`src/hooks/useCampaignSync.ts`](../src/hooks/useCampaignSync.ts)、`src/routes/_protected/campaigns/$campaignId/` 下的物品表單、提示框、清單與商店頁面。
- 鍛造工坊表單與目錄 UI 位於 `src/routes/_protected/blacksmith/`。舊 `Consumable` 分類及舊武器／護甲欄位目前仍出現在表單與檢視中。
- 既有 schema 由 `supabase/migrations/` 管理；涉及 `inventory_items`、`blacksmith_items`、商店 `item_snapshot` 的 schema 必須與新的序列化格式一致。

## 新資料型別合約

### 共用分類與稀有度

建立 `ItemBaseCategory`，包含下列值及繁體中文標籤：

| 值             | 標籤       | 值              | 標籤     |
| -------------- | ---------- | --------------- | -------- |
| `Weapon`       | 武器       | `Armor`         | 護甲     |
| `Potion`       | 藥水       | `Poison`        | 毒藥     |
| `Ring`         | 戒指       | `Rod`           | 權杖     |
| `Scroll`       | 卷軸       | `Staff`         | 法杖     |
| `Wand`         | 魔杖       | `WondrousItem`  | 奇物     |
| `TradeGood`    | 商業貨物   | `Gemstone`      | 寶石     |
| `Tool`         | 工具       | `AdventureGear` | 冒險裝備 |
| `FoodAndDrink` | 食物及飲品 | `Mount`         | 座騎     |
| `Vehicle`      | 交通工具   | `Misc`          | 雜項     |

需求文字中的 `Vechicle` 應採正確拼字 `Vehicle` 作為程式識別值，避免錯字進入永久資料格式。舊分類 `Consumable` 不再保留為分類；消耗性由 `isConsumable` 表示，官方目錄來源資料須在載入／整理時將物品歸入適當的新分類，不能將所有舊 `Consumable` 一律視為 `Potion`。

建立 `ItemBaseRarity`，沿用目前 `Common`、`Uncommon`、`Rare`、`VeryRare`、`Legendary`、`Artifact` 六種值。

### `ItemBase`

共用物品定義至少包含：

```ts
type ItemBase = {
	name: string;
	category: ItemBaseCategory;
	subTypes: string[];
	rarity: ItemBaseRarity;
	icon?: string | null;
	weight: number;
	valueGp: number;
	affixes: ItemAffix[];
	effects: string;
	flavor?: string | null;
	dmNotes: string;
	maxCharges?: number | null;
	isEquippable: boolean;
	isConsumable: boolean;
	isRequireAttunement: boolean;
};
```

欄位要求以此合約為準：重量單位為 lb；`valueGp` 使用 GP 並允許小數；沒有圖示或風味文字時允許 `null`／省略；沒有附魔時仍以空陣列表示。新型別全面使用 `isRequireAttunement`，不得繼續在前端合約中暴露舊名 `requiresAttunement`。

### 武器、護甲與通用項目

沿用需求指定的特化形式，`WeaponItemMastery` 應明確定義為既有武器精通值的專用型別（可由 `WeaponMasteryKey` 別名或重用其值集合）：

```ts
type WeaponItem = Omit<ItemBase, 'category'> & {
	category: ItemBaseCategory.Weapon;
	weaponProperties: {
		damage: string;
		mastery?: WeaponItemMastery;
		properties: string[];
	};
};

type ArmorItem = Omit<ItemBase, 'category'> & {
	category: ItemBaseCategory.Armor;
	armorProperties: {
		ac: string;
	};
};
```

武器傷害與護甲 AC 從目前獨立的 `damage`、`ac` 欄位移入各自的屬性物件。未提供武器精通時省略 `mastery`；不適用的欄位不應用 `null` 或空字串偽裝成有效屬性。

需求範例 `AllItem = ItemBase | WeaponItem | ArmorItem` 在結構型別系統中有型別陷阱：若 `ItemBase.category` 已允許所有分類，`WeaponItem` 和 `ArmorItem` 仍可被當作一般 `ItemBase`，`AllItem` 不會保證武器／護甲屬性存在。實作時應保留 `ItemBase` 作為欄位基礎，並讓 `AllItem` 的一般分支排除 `Weapon`、`Armor`，或採用等效的泛型／判別聯集設計，確保 `category === 'Weapon'` 時必有 `weaponProperties`、`category === 'Armor'` 時必有 `armorProperties`。不要為符合表面型別宣告而犧牲執行期資料安全。

### 三種物品型別及實例欄位

- `InventoryItem` 由 `AllItem` 加上戰役持有狀態構成。保留 `id`、`ownerId`、`slot`、`quantity`、`equipped`、`attuned`、`isHomebrew`、`isIdentified`、目前 `charges`、`playerNotes`、`isPrivate`、`isImportant` 等既有實例／來源欄位。這些狀態不併入 `ItemBase`。
- `BlacksmithItem` 由 `AllItem` 加上官方目錄識別與來源中繼資料構成，例如 `catalogId`、`catalogTitle`、`itemId`、`sourceKey`、`source`、`aliases`、`searchTerms`。這些索引欄位不是共用物品定義，不得流入戰役實例或商店快照，除非作為獨立來源欄位明確保留。
- `CampaignShopItemSnapshot` 由 `AllItem` 加上商店快照必要的來源旗標（例如既有的 `isHomebrew`，若現行訂單顯示仍需要）構成，但不含角色擁有者、背包位置、數量、裝備／同調狀態、目前充能或玩家備註。商店商品數量仍由商店庫存管理，購買時再建立新的 `InventoryItem`。
- 以上三型別都直接重用共用定義及新屬性形式，不再各自複製一份物品基本欄位。避免 `CampaignShopItemSnapshot` 透過舊 `InventoryItem` 全型別 `Omit` 建立，造成新增實例狀態時意外滲入快照。

## 分階段執行

### 階段一：定稿型別與舊欄位對照

1. 在 `src/types.ts` 新增 `ItemBaseCategory`、`ItemBaseRarity`、`ItemBase`、`WeaponItemMastery`、`WeaponItem`、`ArmorItem`、安全的 `AllItem`。
2. 將 `InventoryItem`、`BlacksmithItem`、`CampaignShopItemSnapshot` 重構為共用 ItemBase 定義加上各自的資料邊界欄位。
3. 更新 `Rarity`、`ItemCategory` 與舊 `WeaponMasteryKey` 的使用位置：如需短期別名，僅供內部遷移編譯使用，完成後移除舊名稱及重複型別。
4. 定義舊資料來源欄位的明確對照表：

| 舊格式                       | 新格式／處理方式                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `subType: string`            | `subTypes: string[]`；單值轉成單元素陣列，空值轉成 `[]`                           |
| `rarity: Rarity`             | `rarity: ItemBaseRarity`；值集合維持相同                                          |
| `requiresAttunement`         | `isRequireAttunement`                                                             |
| `damage`                     | 只在武器分類轉為 `weaponProperties.damage`                                        |
| `weaponMastery`／`mastery`   | 武器 `weaponProperties.mastery`；未知值須驗證失敗或按明確規則略除，不可不安全轉型 |
| `ac`                         | 只在護甲分類轉為 `armorProperties.ac`                                             |
| `weaponProperties: string[]` | 保留為 `weaponProperties.properties`；與舊 `damage`、`weaponMastery` 分別轉成新物件的 `damage`、`mastery` |
| SRD `weaponMastery: "精通: …"` | 以明確繁中標籤對照轉為 `WeaponItemMastery`；未知標籤驗證失敗，不得直接斷言型別 |
| `description`                | 依來源語意映射至 `effects`；官方 `source` 保留為來源中繼資料，不再充當 `flavor`   |
| `subTypes`                   | 新格式原生保留字串陣列，不再以分隔符串接                                          |
| 舊 `Consumable`              | 改用實際物品類別，另以 `isConsumable` 保留可消耗語意                              |

### 階段一執行紀錄（2026-10-27）

- 已完成 `ItemBaseCategory`、`ItemBaseRarity`、共用 `ItemBase`、`WeaponItemMastery`、`WeaponItem`、`ArmorItem` 及安全判別聯集 `AllItem`。一般項目排除 Weapon／Armor，避免缺少特化屬性的資料通過型別檢查。
- `InventoryItem`、`BlacksmithTemplate`、`BlacksmithItem` 與 `CampaignShopItemSnapshot` 均已改用 `AllItem`；`ItemCategory`、`Rarity` 舊別名及其呼叫端已移除。狀態欄位留在 inventory instance，不滲入商店快照。
- `WeaponItemMastery` 不包含 `'None'` 哨兵；未指定精通時省略 `mastery`。SRD `weaponProperties: string[]` 已保留為 `weaponProperties.properties[]`。
- 官方目錄資料已轉為 schema v4，validator 以完整分類及巢狀武器／護甲屬性驗證 537 筆資料。`valueGp` 可為小數、`subTypes` 可為空、icon/flavor 可空；武器傷害及護甲 AC 仍必須有效。
- 新型別已完成各使用端切換，`npm run typecheck` 通過。階段一完成。
- 尚待規則來源確認的 mastery 對照：目前來源字串「精通: 失衡」與「精通: 削弱」都映射到 `Sap`；確認其原文語意前，不要把這項對照視為已由官方規則核實。

### 階段二執行紀錄（2026-10-28）

- 官方目錄 parser、分類／稀有度篩選、列表及詳情均使用 schema v4；`scripts/validate-blacksmith-source.mjs` 已通過 537 筆物品及 lookup 對照。
- 工坊、戰役自創物品及商店手動商品表單已使用 `subTypes[]`、`weaponProperties`／`armorProperties`、`affixes[]` 及 `isRequireAttunement`，並按 Weapon／Armor 分類驗證必填專屬欄位。
- 背包新增、鍛造樣板存取、官方目錄匯入及刷新快照建立已轉用新型別；匯入 RPC payload 僅傳 canonical camelCase `item_base` 與獨立的來源旗標。範例戰役建立也會透過 `toDbItem` 傳遞完整 `item_base`。
- 直接相關 Playwright 測試 fixture 與匯入／快照期待值已更新；目錄載入、分類屬性、匯入失敗提示及刷新預覽涵蓋測試通過。

### 階段二：更新來源解析與建立流程

1. 更新官方目錄 JSON 的 schema、驗證錯誤及分類標籤，讓輸入項目符合新物品定義；調整目錄來源資料與 validator，確認每一筆武器／護甲提供相應屬性物件。
2. 更新鍛造工坊官方目錄載入、分類／稀有度篩選、列表及詳情呈現；屬性區塊根據 `category` 讀取武器傷害／精通或護甲 AC。
3. 更新鍛造樣板表單與 `BlacksmithTemplate` 保存／載入流程，支援 `subTypes[]`、新分類、附魔必要陣列及 `isRequireAttunement`。表單要依所選分類顯示並驗證相應特化欄位。
4. 更新 `blacksmithImport`，將 `AllItem` 明確轉成新的戰役物品定義；官方來源描述、出處、充能上限、附魔及預設可裝備／可消耗狀態逐項指定，不採用含糊的物件展開或 cast。
5. 更新戰役自創物品表單、複製／堆疊／分類規則與物品提示框。角色背包新增及商店購買交付時，建立符合分類的屬性物件，並以 `isRequireAttunement` 判斷同調行為。

### 階段三：同步序列化格式與 schema

1. 已更新 `src/lib/supabase.ts` 的 `DbInventoryItem`、`DbBlacksmithItem`、`DbCampaignShopItemSnapshot` 及雙向轉換器；canonical JSON 與舊 snake_case DB 投影有明確轉換邊界。
2. 新資料庫 canonical 欄位使用 `item_base jsonb`，內容與前端 `AllItem` 同為 camelCase；既有扁平欄位暫留為相容投影，避免舊 RPC／客戶端立即失效。Weapon／Armor 的必填屬性存在 canonical JSON 的 `weaponProperties`／`armorProperties` 中。
3. 已同步 `blacksmith_items`、`inventory_items` 的新欄位 schema，以及商店 `item_snapshot` 寫入格式；商店與訂單快照仍是值複製，不新增來源表外鍵。
4. 已新增 [`20261028000000_item_base_unification.sql`](../supabase/migrations/20261028000000_item_base_unification.sql)：新增 nullable `item_base`、更新分類檢查、讓舊寫入以 trigger 產生相容 canonical base，並更新範例建團、鍛造匯入與商店購買 RPC 一併保存新結構。Migration 不回填或逐列轉換既有資料，符合相關資料表已清空的假設；若目標環境不符合此前提，必須先由維護者確認並另行規劃資料修復。
5. 已統一轉換器的可選文字、圖示、最大充能及附魔陣列處理；canonical 格式錯誤及缺少武器傷害／護甲 AC 時會明確回報，不以 `Misc` 或空特化欄位偽裝成功。

### 階段四：商店與刷新流程遷移

1. 已讓 `CampaignShopItemSnapshot` 在建立、載入、刷新、編輯售價／庫存、訂單紀錄與購買交付的整條前端流程維持相同 canonical 欄位形狀。
2. 已更新 `CampaignShopRefreshCandidate`、篩選政策解析器及候選生成器，使用完整 `ItemBaseCategory` 集合。為兼容目前 SQL refresh validator，商店 refresh policy 傳輸時保留舊版檢查欄位並附上 canonical `item_base`；讀回時以 canonical base 還原。
3. 商店快照的 DB JSON 同時保留必要 legacy 欄位及 canonical `item_base`；新增購買交付 RPC 依 canonical 快照保存新 inventory `item_base`，數量／擁有者仍由交易 RPC 設定。
4. 相關快照／刷新單元 E2E 已通過；需在隔離 Supabase 環境驗證 policy constraint、刷新 RPC、購買交付與回滾，未部署前不宣稱資料庫端驗收完成。

### 階段五：測試、驗收與部署

1. 型別測試：Weapon 必須有 `weaponProperties.damage`；Armor 必須有 `armorProperties.ac`；非武器／護甲不得被誤判為具備這些屬性。
2. 驗證測試：覆蓋所有分類、稀有度、空 `affixes`、可空圖示／風味文字、小數 GP、負重、最大充能、未知精通值、錯誤特化屬性及舊 `Consumable` 輸入。
3. 轉換器測試：三種物品的 DB ↔ 前端往返應保留共用欄位、武器／護甲屬性、商店快照及 `subTypes[]`；確認舊同調欄位不再由新寫入流程輸出。
4. 業務測試：官方目錄匯入、鍛造樣板匯入、背包堆疊／裝備／消耗、商店刷新、下單與交付皆可正常運作，且角色私有／公開可見性及營地箱規則不變。
5. 執行專案既有的 `npm run typecheck`、`npm run lint`、相關 unit／E2E 測試及 `npm run build`。若有 SQL 驗證，僅在維護者確認的隔離 Supabase 專案執行；本規劃不授權連線正式環境或部署。
6. 上線前核對 migration history、空資料表假設、RLS、Realtime 及商店快照 JSON 格式。測試替身通過不能視為真實資料庫驗收。

## 不變更的行為與風險控制

- 不更動物品擁有者、`campaign_id` 隔離、角色 ACL、私有暗袋、`camp-chest` 或商店交易原子性規則。
- 不把規則書 ID 或鍛造樣板 ID 沿用為新的戰役物品 ID；購買與匯入仍建立獨立物品實例。
- 不新增舊紀錄的轉換 SQL，因本次假設相關資料已清空；官方 JSON、測試 fixture 及本機種子資料仍需更新到新格式。
- 主要風險為分類重新整理造成目錄篩選結果改變、目前 `Consumable` 項目無法僅靠舊分類判定真實子類別，以及商店快照／刷新政策仍保存舊欄位形狀。每項都須透過來源清點、明確轉換及測試處理，不能以寬鬆型別斷言掩蓋。

## 完成條件

- `InventoryItem`、`BlacksmithItem`、`CampaignShopItemSnapshot` 的共用物品定義均符合 `ItemBase` 合約，並採用 `isRequireAttunement`。
- `WeaponItem`、`ArmorItem` 的分類與專屬屬性可由 TypeScript 判別，無法建立缺少必填武器傷害或護甲 AC 的有效資料。
- 舊 `Consumable`、`subType`、`damage`／`ac`、`requiresAttunement` 的轉換邊界已移除或集中於明確的 DB legacy adapter；canonical `item_base` 與匯入 RPC payload 不輸出舊結構。
- 官方目錄、工坊表單、戰役背包、商店管理／刷新／購買及訂單快照皆使用一致的新格式。
- schema migration 不包含舊資料回填，且既有型別檢查、lint、相關測試與 build 通過。

## 交接狀態

- 階段一及階段二程式碼已完成；階段三／四的前端 serializer、相容投影與增量 migration 已實作，但 Supabase schema/RPC 尚未在任何環境執行或驗收。
- 本次驗證：`npm run typecheck`、`npm run build`、`npm run validate:blacksmith-source`、`npm run test:e2e`（61 項通過）；`npm run lint` 0 errors，另有一個未修改路由檔的既存 unused-eslint-disable warning。
- 接續工作應先核對 [`campaign-shop-deployment.md`](./campaign-shop-deployment.md) 的隔離環境步驟，由維護者確認 migration history 與空資料表前提，再驗收新 migration、匯入、refresh policy、購買交付、RLS、Realtime 及交易回滾。不可將 mock 測試當成 Supabase 部署驗收。
- 另需由規則來源確認「精通: 失衡」／「精通: 削弱」映射 Sap 的正確性；未核實前不要改成確定的官方語意。
