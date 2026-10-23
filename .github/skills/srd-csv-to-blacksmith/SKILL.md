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
- `catalogs/<catalogId>.items.json`：`{ schemaVersion, catalogId, items }`。
- `catalogs/<catalogId>.lookup.json`：`{ schemaVersion, catalogId, items }`。

每筆 items 是可重用物品定義，欄位盡量對應 `src/types.ts` 的 `InventoryItem` 物品定義部分，而非完整戰役實例。常用欄位為 `itemId`、`name`、`category`、`subType`、`rarity`、`icon`、`requiresAttunement`、`damage`、`weight`、`valueGp`、`description`、`dmNotes`。`icon` 一律使用 `./images/blacksmith/catalogs/<catalogId>/<itemId>.webp` 路徑；此轉換只建立引用，不產生或複製圖片檔。不在目錄項目中虛構 `ownerId`、`campaignId`、`quantity`、裝備狀態或其他戰役實例資料。除非來源有可靠對應，`mastery`、`ac`、`effects`、`flavor` 等其他型別欄位不應捏造。

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
4. 執行 [CSV 轉換器](./scripts/convert_csv.py)。預設欄位名稱為中文 SRD CSV 格式：`名称`、`来源`、`页码`、`稀有度`、`类型`、`同调`、`伤害`、`重量`、`价值`、`文本`。常見映射為：
   - 名稱 → `name`
   - catalog ID 與 item ID → `icon`，格式為 `./images/blacksmith/catalogs/<catalogId>/<itemId>.webp`
   - 來源 → `dmNotes`
   - 稀有度 → `rarity`（空值或 `none` 轉成 `Common`）
   - 類型 → `subType` 字串
   - 同調 → `requiresAttunement` 布林值
   - 傷害 → `damage`（空白為 `null`）
   - 重量 → 磅數值（空白為 `0`；支援 `½`，並略過單位／括號註記）
   - 價值 → GP 數值（空白或低於 1 GP 為 `0`；CP、SP、EP、GP、PP 先換算為 GP）
   - 文本 → `description`
5. 檢查轉換器輸出訊息，確認項目數量和來源相符。轉換器遇到缺少必要欄位、不能解析的稀有度／數值、重複 ID 或既有檔案時會停止並顯示錯誤；不要略過錯誤列或把失敗偽裝成成功。
6. 驗證三個 JSON 均可解析；確認 index 路徑存在、items 數量等於 CSV 資料列數、每個 lookup `itemId` 恰好連到一筆 item、`sourceKey` 唯一且名稱相符，所有 `icon` 都符合指定的 catalog/item 路徑格式，並抽查空值、半磅、低於 1 GP 及高價物品。
7. 摘要輸出檔案、資料筆數、轉換規則及驗證結果。若資料欄位不適合既有 schema，先報告缺口，不要擅自擴增前端型別或假裝已完整對應 `InventoryItem`。

## 執行範例

```bash
python3 .github/skills/srd-csv-to-blacksmith/scripts/convert_csv.py \
  --input /path/to/items.csv \
  --catalog-id dnd-2024-srd-5.2 \
  --title "D&D 2024 SRD 5.2" \
  --category Consumable
```

欄名不同時可明確覆寫，例如 `--column name=Name --column description=Description`。支援的欄位鍵為 `name`、`source`、`page`、`rarity`、`types`、`requiresAttunement`、`damage`、`weight`、`value`、`description`。

如果輸出 items 或 lookup 檔已存在，預設拒絕覆寫。只有使用者明確要求重建同一 catalog 時，才加 `--force`。
