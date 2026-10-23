---
name: srd-csv-to-blacksmith
description: '將 D&D SRD 或其他規則書物品 CSV 轉成 Blacksmith 規則書目錄、catalog index 與 lookup JSON。適用於 CSV 物品資料匯入、欄位正規化、價格與重量轉換，以及新增 public/data/blacksmith/catalogs 目錄。'
argument-hint: '提供 CSV 路徑、catalogId 與標題'
---

# 規則書 CSV 轉 Blacksmith JSON

將使用者提供的物品 CSV 轉成專案使用的規則書目錄。先檢查資料與欄位對應，再執行轉換及完整驗證；不要修改或覆蓋使用者提供的唯讀附件。

## 輸出位置與格式

預設輸出至 `public/data/blacksmith/`：

- `catalog-index.json`：登錄每本書及其 items、lookup 相對路徑。
- `catalogs/<catalogId>.items.json`：`{ schemaVersion: 3, catalogId, items }`。
- `catalogs/<catalogId>.lookup.json`：`{ schemaVersion: 3, catalogId, items }`。

每筆 items 是可重用物品定義，欄位盡量對應 `src/types.ts` 的 `InventoryItem` 物品定義部分，而非完整戰役實例。常用欄位為 `itemId`、`name`、`category`、`subTypes`、`rarity`、`icon`、`requiresAttunement`、`damage`、`weight`、`valueGp`、`description`、`source`。`subTypes` 是字串陣列，從來源逗號分隔的類型拆分而來；`icon` 一律使用 `./images/blacksmith/catalogs/<catalogId>/<itemId>.webp` 路徑；此轉換只建立引用，不產生或複製圖片檔。不在目錄項目中虛構 `ownerId`、`campaignId`、`quantity`、裝備狀態或其他戰役實例資料。除非來源有可靠對應，`mastery`、`ac`、`effects`、`flavor` 等其他型別欄位不應捏造。

武器資料另可包含 `weaponProperties`（字串陣列）與 `weaponMastery`（字串）；僅來源明確提供時才輸出。轉換武器時，`subTypes` 排除完整相符的「武器」類型標籤，保留其他類型。

lookup 每筆項目使用：

```json
{
	"sourceKey": "<catalogId>:<itemId>",
	"itemId": "<itemId>",
	"name": "<名稱>",
	"aliases": [],
	"searchTerms": []
}
```

`itemId` 由 catalog、來源、頁碼及名稱穩定產生，不是匯入戰役時的 `InventoryItem.id`。lookup 的 `itemId` 必須唯一並能對回同一份 items JSON。

## 工作流程

1. 確認 CSV 路徑、輸出 `catalogId` 和書籍標題。`catalogId` 使用小寫英數字、句點與連字號，例如 `dnd-2024-srd-5.2`。
2. 檢查 CSV 編碼、標頭、資料列數、必填名稱／描述、重複名稱及來源欄位。不要假設另一份 CSV 與先前來源有相同欄名或分類；必要時使用轉換器的 `--column` 明確指定欄位對應。
3. 判斷本批資料適用的 `category`。先前來源全是冒險用品，因此指定 `Consumable`；不可把這個判斷套用至武器、護甲或其他新資料。若分類不明且會影響使用者資料，先釐清或回報，不要靜默猜測。
4. 執行 [CSV 轉換器](./scripts/convert_csv.py)。預設欄位名稱為中文 SRD CSV 格式：`名称`、`来源`、`页码`、`稀有度`、`类型`、`同调`、`伤害`、`属性`、`武器精通`、`重量`、`价值`、`文本`。常見映射為：
   - 名稱 → `name`
   - catalog ID 與 item ID → `icon`，格式為 `./images/blacksmith/catalogs/<catalogId>/<itemId>.webp`
   - 來源 → `source`
   - 稀有度 → `rarity`（空值或 `none` 轉成 `Common`）
   - 類型 → 以逗號分隔後拆分為 `subTypes` 字串陣列
   - 若 `category` 是 `Weapon`，從 `subTypes` 移除「武器」，並把「属性」以逗號拆分為 `weaponProperties`；「武器精通」原值寫入 `weaponMastery`
   - 同調 → `requiresAttunement` 布林值
   - 傷害 → `damage`（空白為 `null`）
   - 重量 → 磅數值（空白為 `0`；支援 `¼`、`½`、`¾`，並略過單位／括號註記）
   - 價值 → GP 數值（空白或低於 1 GP 為 `0`；CP、SP、EP、GP、PP 先換算為 GP）
   - 文本 → `description`
5. 輸出文字一律使用繁體中文；若來源為簡體中文，轉換 JSON 文字值（如名稱、類型、武器屬性、精通、描述及 lookup 搜尋詞）為繁體中文，並確認專有名詞與規則用語。不得改寫唯讀來源 CSV；來源標記、ID、JSON 欄位名稱及原始 CSV 欄名維持原樣。
6. 同一本書已有目錄且要加入新類別資料時，使用 `--append`；轉換器保留原有物品並拒絕重複 ID。`--replace` 僅限使用者明確要求重建整本目錄時使用。
7. 檢查轉換器輸出訊息，確認本次新增項目數量和來源相符。轉換器遇到缺少必要欄位、不能解析的稀有度／數值、重複 ID 或既有檔案時會停止並顯示錯誤；不要略過錯誤列或把失敗偽裝成成功。
8. 驗證三個 JSON 均可解析；確認 index 路徑存在、附加後 items 數量等於原有加上本次 CSV 資料列數、每個 lookup `itemId` 恰好連到一筆 item、`sourceKey` 唯一且名稱相符，所有 `icon` 都符合指定的 catalog/item 路徑格式，並抽查空值、¼／½／¾ 磅、低於 1 GP 及高價物品。
7. 摘要輸出檔案、資料筆數、轉換規則及驗證結果。若資料欄位不適合既有 schema，先報告缺口，不要擅自擴增前端型別或假裝已完整對應 `InventoryItem`。

## 執行範例

```bash
python3 .github/skills/srd-csv-to-blacksmith/scripts/convert_csv.py \
  --input /path/to/items.csv \
  --catalog-id dnd-2024-srd-5.2 \
  --title "D&D 2024 SRD 5.2" \
  --category Weapon \
  --append
```

欄名不同時可明確覆寫，例如 `--column name=Name --column description=Description`。支援的欄位鍵為 `name`、`source`、`page`、`rarity`、`types`、`requiresAttunement`、`damage`、`weaponProperties`、`weaponMastery`、`weight`、`value`、`description`。

如果輸出 items 或 lookup 檔已存在，預設拒絕覆寫。只有使用者明確要求新增資料時才使用 `--append`；只有使用者明確要求整本重建時才使用 `--force`（亦可用別名 `--replace`）。
