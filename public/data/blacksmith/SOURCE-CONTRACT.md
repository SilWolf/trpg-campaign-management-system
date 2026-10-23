# Blacksmith 規則書來源資料合約

本文件鎖定 `public/data/blacksmith/` 目前實際提供的唯讀目錄格式。此合約描述來源資料，不代表可將來源 ID 當成戰役物品 ID，也不代表已確認來源內容的授權條款。

## 檔案與版本

- `catalog-index.json` 是目錄清單；`schemaVersion` 為整數 `3`。
- 每個目錄由 `catalogId`、顯示用 `title`、`itemsFile` 與 `lookupFile` 指定。資料檔路徑相對於 `public/data/blacksmith/`，目前指向 `./catalogs/` 下的 JSON。
- 每本目錄的物品檔與 lookup 檔皆包含整數 `schemaVersion` 和相同的 `catalogId`。
- 不同目錄即使有相同 `itemId`，仍是不同來源；識別一筆來源資料須使用 `catalogId + itemId`。

## 物品檔

根物件包含 `schemaVersion`、`catalogId` 與 `items` 陣列。每筆物品目前必須具備以下欄位：

| 欄位 | 合約型別 | 已觀察到的格式／語意 |
| --- | --- | --- |
| `itemId` | 非空字串 | 只在同一目錄內唯一；不是 `InventoryItem.id` |
| `name` | 非空字串 | 來源顯示名稱 |
| `category` | 非空字串 | 現有值遵循應用程式分類字串；不得由此推斷物品用途分類正確 |
| `subTypes` | 非空字串陣列 | 來源類型依逗號拆分並去除前後空白 |
| `rarity` | 非空字串 | 目前涵蓋 `Common`、`Uncommon`、`Rare`、`VeryRare`、`Legendary`、`Artifact` |
| `icon` | 非空字串 | 目前為 `./images/...` 靜態資產路徑 |
| `weight` | 有限且不小於 0 的數字 | 可為整數或小數 |
| `valueGp` | 不小於 0 的整數 | 以 GP 表示 |
| `requiresAttunement` | 布林值 | 調諧需求 |
| `description` | 字串 | 來源描述 |
| `source` | 字串 | 目前填有 `PHB'24`、`DMG'24` 等來源標記 |

`damage` 是依 `category` 決定的欄位：`Weapon` 必須包含字串或 `null` 的 `damage`；`Armor` 必須包含字串或 `null` 的 `ac`，且不得包含 `damage`；其他類別包含字串或 `null` 的 `damage`。來源 CSV 共用「伤害」欄位，類型包含「武器」時對應 `Weapon.damage`，包含輕甲／中甲／重甲標籤（來源亦可能以簡體呈現）時對應 `Armor.ac`。

`category` 為 `Weapon` 時，另須包含 `weaponProperties`（字串陣列，可為空）與 `weaponMastery`（非空字串）。武器 `subTypes` 不含泛用標籤「武器」。`category` 為 `Armor` 時另須包含 `ac`；護甲細分類型保留在 `subTypes`。不屬於武器的其他類別不得包含 `weaponProperties` 或 `weaponMastery`。

現行 schema 版本不接受未列出的物品欄位；來源格式有增修時，須先核對資料並明確更新合約與版本，不得靜默丟棄欄位。來源目前未提供 `mastery`、`maxCharges`、`effects`、`flavor`、`affixes` 等內容；不得將缺欄位解讀為來源明確提供了空值或預設值。

## Lookup 檔

根物件包含 `schemaVersion`、`catalogId` 與 `items` 陣列。每筆 lookup 必須具備：

- `sourceKey`：唯一且穩定，格式為 `${catalogId}:${itemId}`。
- `itemId`、`name`：必須分別對應同一目錄物品檔中的 ID 與名稱。
- `aliases`、`searchTerms`：字串陣列；可以為空。

每筆來源物品必須恰有一筆 lookup，lookup 不得指向不存在的物品。`sourceKey` 不取代 `catalogId + itemId`，也不可作為匯入後的戰役物品 ID。

## 樣板與戰役實例邊界

這些 JSON 是隨專案提供的唯讀規則書目錄，不含作者帳號、分享狀態或戰役歸屬。讀取後應轉成物品定義；匯入戰役時需複製定義、產生新的 `InventoryItem.id`，並另外初始化 `campaignId`、`ownerId`、數量、裝備／調諧狀態、目前充能、鑑定狀態等實例欄位。不得把 lookup 的 `itemId` 或 `sourceKey` 當成戰役實例 ID。

`source` 的書籍縮寫只能作為現有來源標記；目前 JSON 沒有授權名稱、授權版本或授權 URL 欄位，因此不能僅憑 `catalogId` 或書籍縮寫判定內容授權。新增或發布來源內容前，仍須由維護者確認來源與授權資訊。

## 目前資料集核對結果與範圍限制

目前 `dnd-2024-srd-5.2` 有 537 筆物品及 537 筆 lookup；`itemId`、`sourceKey` 均無重複，lookup 的 ID、名稱與來源物品全部相符。其中 147 筆 `Consumable`、63 筆 `Weapon`、32 筆 `Armor` 與 295 筆 `Misc`。武器資料包含來源提供的 `damage`、`weaponProperties` 與 `weaponMastery`；護甲資料以 `ac` 表示護甲值且不含 `damage`。資料包含 214 筆 `Common`、96 筆 `Uncommon`、106 筆 `Rare`、82 筆 `VeryRare`、38 筆 `Legendary`、1 筆 `Artifact`；63 筆有非空 `damage`，32 筆有非空 `ac`。`aliases` 均為空。

目前資料仍沒有可確認為可充能物品或帶附魔詞條的樣本。因開發規劃要求不得自行補寫未提供的規則書內容，這些情境的來源欄位與轉換規則尚未由實際資料驗證。下一批來源資料提供後，須補做欄位核對，再擴充本合約；在此之前不得宣稱已完成上述情境的來源覆蓋。

可用 `npm run validate:blacksmith-source` 驗證現有檔案結構、型別及 items／lookup 對照。
