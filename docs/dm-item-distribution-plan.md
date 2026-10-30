# DM 派發物品：開發規劃

## 目標與範圍

讓戰役 DM 可在背包頁一次建立多項物品，並將它們派發至該戰役角色的公開／私人背包，或公開的營地儲物箱。派發操作由 Edge Function 接收，並由單一資料庫交易完成授權檢查、物品建立及共用操作紀錄；前端不得以多次直接寫入模擬交易。

物品來源包括：

1. 從官方規則書、DM 自己的鍛造工坊、其他人分享的鍛造工坊搜尋後匯入。
2. 直接建立新物品。
3. 複製搜尋結果的物品定義後編輯，再加入派發清單。

以上操作建立的物品只屬於當次派發清單；不會新增或修改 `blacksmith_items`。提交成功後，派發物品成為所選戰役的 `inventory_items` 實例。

`ItemBase` 新增 `isStackable`，預設為 `false`；可堆疊物品的單列上限為 1000。搜尋 adapter 為官方目錄及鍛造工坊來源產生全域唯一的 canonical `itemId`；直接匯入且未進入新建／複製／編輯表單的清單項目保留來源 ID，派發後存入 `inventory_items.blacksmith_item_id`。新建、複製或經物品定義表單編輯過的項目清除來源 ID，且不得與任何其他物品合併。

所有重要操作共用同一張戰役操作紀錄表，涵蓋商店購買、玩家貨幣轉帳、玩家物品轉交及 DM 派發物品等事件；依 `campaign_id` 隔離，每個戰役只保留最近 100 次操作。操作紀錄唯讀，並與觸發操作在同一資料庫交易寫入。初版不包含操作歷史 UI、接收者通知、批次排程或自動撤回。

## 現有實作依據

- 戰役背包頁為 `src/routes/_protected/campaigns/$campaignId/index.tsx`；DM 身分由 `useUserCampaignRole` 提供，角色、物品及 Realtime 同步由 `useCampaignSync` 管理。
- 角色背包以 `InventoryItem.ownerId` 選擇角色；`isPrivate` 決定公開或私人背包。`CAMP_CHEST_ID`（`camp-chest`）是虛擬 owner，不應寫入 `characters`，且營地箱物品必須公開。
- `HomebrewModal` 與 `HomebrewForm` 已包含物品定義欄位，但目前表單提交也會建立戰役實例；新增流程應抽取／重用定義編輯部分，避免直接呼叫會改動目前背包的 `useInventoryActions` 提交處理。
- 官方規則書搜尋可重用 `src/lib/blacksmithCatalog.ts` 的目錄載入、分類／稀有度篩選及搜尋詞；自創與分享物品可重用 `src/lib/blacksmithItems.ts`、`src/lib/blacksmithImport.ts`。
- `inventory_items.item_base` 與資料庫 `is_valid_item_base(jsonb)` 是物品定義的標準化及驗證依據；既有商店和角色移除流程示範了 Edge Function 呼叫受限 RPC 的做法。
- 目前 migration 採整合／增量管理；資料庫變更及 Edge Function 部署仍須依 [`database-template-migration.md`](./database-template-migration.md) 的隔離驗收與維護者授權流程執行。

## 名詞與資料邊界

| 名稱 | 意義 | 儲存位置 |
| --- | --- | --- |
| 物品定義 | 名稱、類別、稀有度、效果、詞條等可複用內容 | 表單狀態或鍛造工坊／規則書來源 |
| 派發清單列 | 一個待派發物品定義及數量 | 僅前端表單狀態 |
| 來源物品 ID | 官方目錄或鍛造工坊物品的全域唯一 canonical `itemId`；只表示未修改來源定義 | 官方目錄／`blacksmith_items.id` 經 adapter 正規化，匯入時保留 |
| 派發物品實例 | 已屬於指定戰役及角色／背包的物品；可選 `blacksmith_item_id` 表示未修改來源副本 | `inventory_items` |
| 戰役操作紀錄 | 操作者、操作種類、相關角色、公開摘要／必要快照及時間；派發事件另含原因 | 共用 `campaign_activity_log` |

`blacksmith_item_id` 是來源識別，不是 `inventory_items.id`：每個新背包列仍由伺服器產生新的實例 ID。來源 ID 只在定義未經編輯的直接匯入時保留；表單建立／複製／編輯後必須清除。不得將派發物品寫回鍛造工坊。

`campaign_activity_log` 是跨功能的近期唯讀操作流水，不取代商店訂單、商店商品或背包等業務資料表；這些既有資料仍供交易狀態、庫存及功能流程使用。每次使用者操作記為一筆事件（例如同一購物車結帳或一次多物品派發記為一筆，明細放在事件 payload），每個 campaign 最多保留 100 筆，新增後刪除較舊事件。涉及私人錢包或私人背包的資料不可出現在所有成員可讀的公開摘要；權限必須按事件種類及相關操作者／收受者限制。

## 使用流程與 UI

### 入口與派發表單

1. 在戰役背包工具列加入「派發物品」按鈕。只有 `isDm` 為真時渲染；不是只停用按鈕。伺服器仍須獨立驗證 DM 身分。
2. 點擊後開啟派發 dialog，選擇接收背包：
   - 戰役內每名角色的公開背包。
   - 戰役內每名角色的私人背包。
   - 營地儲物箱（僅公開）。
3. 顯示派發物品清單。每列顯示名稱及數量，並提供數量編輯、編輯物品定義、刪除；列表底部提供「添加物品」按鈕。
4. 「添加物品」開啟選單，提供「從鍛造工坊匯入」與「創造新的物品」。
5. 「派發原因」為選填文字欄位。提交前驗證至少有一項物品、數量為正整數、目標屬於目前戰役及物品定義有效。
6. 派發原因選填，最多 200 字；UI、Edge Function 與 RPC 均須驗證，不得靜默截斷。提交期間鎖定重複提交並顯示進度。若預計新增 11 至 20 筆 `inventory_items` 記錄，先顯示確認警告；使用者確認後才派發。若預計新增超過 20 筆，禁止提交並提示減少單次派發的物品數量。只有 Edge Function 回報整批成功才關閉 dialog、清空草稿並顯示成功訊息；錯誤要保留草稿並明確顯示。

角色清單只列出當前 `campaignId` 的角色。私人背包選項不可用於 `camp-chest`；不應建立營地箱角色或角色權限列。

單次請求最多 10 列，每列派發數量為 1 至 99；這是請求列數／單列數量上限。堆疊上限 1000 則套用於提交後的每個 `inventory_items` 列；若合併既有堆疊後仍有餘量，伺服器建立一個或多個不超過 1000 的新堆疊列。

提交門檻以此次操作預計**新增的 `inventory_items` 資料列數**計算：既有堆疊更新不算新增、`campaign_activity_log` 操作紀錄也不算。預估為 0 至 10 列可直接提交；11 至 20 列必須先取得使用者明確確認；超過 20 列一律拒絕，提示縮減派發數量。不可堆疊物品每個單位新增一列；可堆疊物品先計入目標背包相同來源 ID 堆疊的可用容量，再計算需要建立的溢出列。

### 從鍛造工坊匯入

1. 開啟獨立搜尋 dialog，條件包含關鍵字、物品類型及稀有度。關鍵字在搜尋前 trim；trim 後為空字串時不發起新搜尋，保留目前顯示的上一組結果。
2. 來源使用可展開／收合的樹狀勾選選單，至少包含：
   - 我的鍛造工坊。
   - 官方規則書（可展開並選擇個別目錄）。
   - 社群分享的鍛造工坊（可展開並選擇作者／分享來源）。
3. 關鍵字、類型、稀有度或來源變更時以非同步方式搜尋；採 debounce，載入狀態與錯誤狀態分開顯示，並避免較舊請求覆寫較新的結果。只載入勾選來源所需資料，不在每次輸入時重新載入所有目錄。
4. 結果依「我的自製物品 → 官方規則書物品 → 其他人分享的物品」排序／分組。每次搜尋最多顯示 20 筆官方結果及 20 筆鍛造工坊結果；鍛造工坊結果總上限 20 筆，先列本人自製物品，再用剩餘名額列出其他人分享的物品。空結果、載入中及錯誤均須有明確 UI。
5. 每筆結果提供兩個不同操作：
   - **匯入**：將正規化後的來源物品定義及全域唯一 `itemId` 加入派發清單，初始數量為 1；不開啟物品定義表單，不保存至鍛造工坊。若之後只改數量，仍保留來源 ID。
   - **複製**：以來源物品定義預填新物品表單。送出表單後以新清單列加入派發清單，不保存來源引用或鍛造工坊資料。
6. 社群來源只查詢 RLS 允許目前使用者讀取的分享項目；自己的私有樣板可讀、他人未分享樣板不可被搜尋或回傳。前端來源樹不能取代 RLS。

官方靜態目錄使用 `loadBlacksmithCatalogs` 與現有搜尋正規化；鍛造工坊搜尋由 Supabase 非同步查詢並套用類型／稀有度／關鍵字篩選。初版應以可取消或忽略過期結果的搜尋控制器處理快速輸入；若實際目錄規模的效能量測顯示主執行緒搜尋造成卡頓，再評估 Web Worker，不預先引入額外架構。

### 創造新物品、編輯及複製

- 新增／複製／清單列編輯共用物品定義表單。盡可能重用 `HomebrewModal` 現有欄位與驗證，但抽離與 `campaignId`、目前角色、即時 `setItems` 耦合的部分。
- 從鍛造工坊「複製」時，預填可編輯的物品定義欄位；重新產生所有詞條 ID，不複製來源 ID、作者、分享狀態或工坊紀錄欄位。
- 新建或複製表單送出後只回傳定義給派發 dialog；不呼叫 `saveBlacksmithTemplate`，也不直接新增 `inventory_items`。
- 清單列的「編輯」只改該列的定義與數量，不影響其他列或工坊來源；送出物品定義表單後清除該列的 `blacksmith_item_id`。直接變更數量不清除來源 ID。
- 營地儲物箱的派發列一律標記為公開；不把使用者輸入的 `isPrivate` 傳給伺服器作為可覆寫的營地箱設定。
- `isStackable` 使用明確布林欄位；新增物品預設 `false`，既有目錄／樣板／背包資料缺少該欄位時相容預設為 `false`。只有 `isStackable = true` 且保留有效 `blacksmith_item_id` 的直接匯入物品才可按來源 ID 合併。
- 不可堆疊物品的派發數量仍可輸入 1 至 99；提交時展開為多個 `quantity = 1` 的獨立背包列，不與既有列或同一請求的其他列合併。

## 物品來源 ID、可堆疊與合併

### 全域來源識別

- 搜尋 adapter 統一輸出 canonical `itemId`。採用不相交的來源命名空間，例如官方物品使用 `rulebook:<catalogId>:<sourceItemId>`，鍛造工坊物品使用 `workshop:<templateId>`；如此跨規則書、官方／工坊與作者仍具全域唯一性，且不要求兩種來源的原始 ID 使用相同格式。
- 官方 catalog 的原始 `itemId` 仍須在來源資料中唯一且經載入驗證；來源 adapter 將它與穩定 `catalogId` 組合成 canonical ID。鍛造工坊以現有穩定主鍵作為 templateId，再加上保留命名空間的前綴，不另造會與資料列 ID 不一致的隨機來源鍵。
- 新增／匯入目錄或工坊項目時驗證 canonical ID 不為空、格式正確且不會跨來源碰撞；不可只依賴 UUID 碰撞機率或不同資料集各自唯一。
- `inventory_items.blacksmith_item_id` 為 nullable `text`，不設指向可刪除的工坊／靜態檔案列之外鍵；它是可堆疊與來源追溯鍵，不可代替 inventory row ID。物品被編輯或複製後設為 `NULL`。
- 從鍛造工坊搜尋或規則書匯入時，來源 ID 只在未進入新建／複製／編輯物品定義表單的路徑保留。複製或表單編輯會產生無來源 ID 的新定義；不得以名稱、類別、稀有度或相似欄位推斷相同物品。
- Edge Function／RPC 不可盲信前端提供的 `blacksmith_item_id`。鍛造工坊來源須以 actor 可存取的模板及其定義重新核對；官方來源須透過 server-trusted catalog／registry 或等效版本化來源驗證 canonical ID 與物品定義相符。若部署架構不能驗證來源，拒絕將該 ID 寫入背包，不可讓偽造 ID 觸發合併。

### 堆疊與派發合併規則

- `ItemBase.isStackable` 是定義的一部分，前端及資料庫 validator 都驗證其為 boolean；缺少欄位的既有／外部資料一律 fallback 為 `false`，不因消耗品、名稱相同或舊有堆疊狀態自動推定可堆疊。
- 在 `src/types.ts` 的 `ItemBase` 加入必填 boolean `isStackable`；表單初始值為 `false`，鍛造工坊保存／載入、官方 catalog parser、`item_base` 序列化／反序列化及既有物品 fallback 都須雙向支援。若官方 catalog JSON schema 採 exact keys，需升 schema version／更新來源合約及 validator，或明確將舊版缺欄位正規化為 `false`。資料庫 `is_valid_item_base` 同步接受並驗證欄位，既有 JSONB item_base 缺少欄位時相容處理為 `false`。
- 在 `InventoryItem` 狀態及 `DbInventoryItem` 轉換器加入 nullable `blacksmithItemId` ↔ `blacksmith_item_id`；既有資料預設為 `null`。`blacksmith_item_id` 不設唯一約束，因同一來源可在不同背包、不同角色或多個 1000 上限堆疊列重複出現。
- 可堆疊單一 `inventory_items` 列最多 1000 件。UI 的派發列最多 99 件；合併至既有堆疊後不得讓任何列超過 1000。超出容量的剩餘數量拆成新列，每列不超過 1000。
- 不可堆疊物品每列固定 `quantity = 1`；派發列輸入數量 N 時建立 N 個獨立背包列，各列使用新的 row ID 並保留相同有效 `blacksmith_item_id`（若為未修改的直接匯入），但不互相合併。
- 只有同 campaign、同 owner、同公開／私人背包、同非空 `blacksmith_item_id` 且 `isStackable = true` 的物品才可互相合併；營地箱只匹配公開列。無來源 ID 的自創、複製或被編輯物品一律建立獨立列，即使名稱及其他欄位完全相同也不合併。
- 相同 `blacksmith_item_id` 的現有列若定義快照不一致，視為資料不變條件遭破壞：交易明確失敗並回滾，不可把不同定義的物品併在一起。
- 併發派發須在交易中鎖定目標 owner／背包／來源 ID 的匹配列，再計算可用堆疊容量及更新／新增列；同一批 request 中重複匯入相同可堆疊來源亦依序合併，最後仍受 1000 上限約束。
- 預估「新增記錄數」只計算本次派發實際需要 INSERT 的 `inventory_items` 列，不計算更新既有堆疊或新增的一筆操作紀錄。對每個可堆疊來源與目標背包，將數量填入現有符合條件且未滿 1000 的列，再以每列最多 1000 計算剩餘新列；不可堆疊數量則直接計算為相同數目的新列。
- UI 可依已載入的背包資料先行顯示確認／禁止狀態，但該估算可能因併發變動；Edge Function／RPC 必須在鎖定目標堆疊後重新計算實際新增列數，作為權威門檻。若首次提交計算為 11–20 列而尚未確認，RPC 不得寫入任何資料，應回傳 confirmation-required 及筆數；UI 顯示確認後以同一派發識別碼重試，伺服器再次計算。實際數量超過 20 時即使已確認也必須拒絕。確認狀態或識別碼不能用來略過伺服器重算及 20 列上限。

## 非同步搜尋與結果上限

- 官方規則書：只載入所選目錄及其 lookup，套用既有搜尋詞、類別、稀有度篩選，再取最多 20 筆。
- 鍛造工坊：分別查詢本人樣板與可見分享樣板，依關鍵字／類別／稀有度過濾，合併後最多 20 筆；不可先無上限載入所有分享物品再在 UI 隱藏。
- 關鍵字一律 trim；trim 後為空字串時不發起新搜尋，保留目前顯示結果。非空關鍵字以 debounce 非同步搜尋。結果優先序固定為本人自製物品、官方規則書、其他人分享物品；單次搜尋最多回傳 20 筆官方物品及 20 筆鍛造工坊物品，工坊 20 筆名額優先給本人自製物品，剩餘名額才給分享物品。
- 查詢期間改變來源或條件時，取消可取消的請求；若底層呼叫不能取消，使用 request sequence／query key 丟棄過期結果。
- 搜尋回傳資料只供建立物品定義快照；正式派發仍重新做伺服器端格式及權限驗證。

## Edge Function 與資料庫交易

### 建議 API 邊界

新增 `dispatch-campaign-items` Edge Function。前端使用已登入的 Supabase client 呼叫，payload 僅包含：

- `campaignId`。
- 目標 `ownerId`、`isPrivate`（`camp-chest` 只能為公開）。
- 選填 `reason`。
- 物品列陣列：經驗證的物品定義與正整數 `quantity`。

Edge Function 應遵循既有 Function 慣例：限制 HTTP method、讀取有大小限制的 JSON、拒絕未知／無效欄位、驗證 bearer token，並使用伺服器環境變數建立 service client。`reason` 可省略或為空值；提供時最多 200 字，超出時回傳明確驗證錯誤，不得截斷。Actor ID 必須從已驗證使用者取得，不接受 payload 提供執行者或任意授權身分。不得在回應、日誌或前端暴露 service-role key。

Edge Function 負責 HTTP 層輸入驗證與錯誤狀態；由於多筆 `inventory_items` 與派發紀錄必須具備全有或全無語意，應呼叫受限 PostgreSQL 交易 RPC（例如 `dispatch_campaign_items_as_actor`）。不可由 Edge Function 逐筆 insert，亦不可由前端 `setItems` optimistic 寫入代替交易。

### RPC 權限與交易不變條件

RPC 在同一 PostgreSQL 交易內：

1. 以 `p_actor_id` 驗證呼叫者為目前已驗證 DM，並以 `public.is_campaign_dm(p_campaign_id)` 或等效安全 helper 確認其為該戰役 DM。
2. 驗證目標角色屬於指定 `campaign_id`；`owner_id` 與 campaign／character ID 依 schema 為 `text`。角色 owner 與 `auth.uid()` 比較時使用 `auth.uid()::text`；不要將 `camp-chest` 或其他文字 ID 轉為 UUID。
3. 若目標為一般角色，依 `isPrivate` 寫入指定背包；若目標為 `camp-chest`，強制公開。不可對 `camp-chest` 寫入角色資料列或權限資料列。
4. 驗證清單有 1 至 10 列、每列數量為 1 至 99、`reason` 缺省／空值或最多 200 字、每項定義符合 `is_valid_item_base`；並驗證名稱、字串、陣列及數值界限。前端、Edge Function 與 RPC 採用相同限制。只有伺服器驗證過的未修改來源匯入才接受 canonical `blacksmith_item_id`；新建、複製或表單編輯項目必須為 null。伺服器為每筆新實例產生新 row ID。
5. 將每項物品轉成 `inventory_items` 的完整欄位集合：`campaign_id` 使用目前戰役、`owner_id` 使用所選角色／營地箱、`is_private` 依目標背包、`equipped`／`attuned` 關閉、目前 `charges` 初始化為 0，其他資料按現有物品轉換規則設定。可堆疊來源依 canonical ID 合併到相同目標背包既有列，單列不超過 1000，剩餘數量建立新列；不可堆疊數量展開為多個 `quantity = 1` 的新列。無來源 ID 的自創／複製／編輯物品各自建立新列，不依名稱合併。鎖定並計算後，新增 inventory 列超過 20 筆即拒絕；新增 11 至 20 筆必須有明確確認才可提交。
6. 在共用 `campaign_activity_log` 寫入一筆 `item_dispatched` 事件，包含操作者、目標、原因、時間、來源識別、派發定義／數量及實際新增／更新列摘要；派發事件和所有堆疊更新／新列必須同交易提交。事件表以 `campaign_id text` 隔離並級聯刪除，禁止一般用戶直接新增、修改或刪除。
7. 以交易安全的方式序列化同 campaign 的操作記錄新增及清理，確保競爭寫入後仍只保留最近 100 筆。任一驗證或 insert／update 失敗時回滾全部物品與操作紀錄；成功回傳操作紀錄 ID 及所有受影響 inventory row ID（包含被合併更新的既有列）。

RPC 使用固定 `search_path`、明確撤銷 `PUBLIC`／`anon` 的執行權並只授權必要角色；若由 Edge Function service role 呼叫，資料庫仍須以 actor 參數和 DM helper 驗證操作者，不得因 service role 而略過業務授權。若使用者 ID 欄位需比較，遵守 `UUID`／`TEXT` 欄位界線及現有 ACL helper 慣例；RLS policy 不得直接查詢自身表格造成遞迴。

## 共用戰役操作紀錄

### 事件來源與保留

- 建立唯一的 `campaign_activity_log`，至少包括文字型 `id`、`campaign_id text`（刪除戰役時 cascade）、事件種類、操作者、相關角色／接收者、公開摘要、必要事件快照及 `created_at`。
- 以單一操作為一筆紀錄，而非每個物品／購物品項各一筆：一次購物車結帳、一筆貨幣轉帳、一筆物品移轉或一次批次派發各形成一個事件；多項明細存於該事件的受驗證 JSONB payload。
- 每次操作成功時，在負責該操作的同一資料庫交易中同步新增事件；不得讓 Edge Function 或前端另外呼叫記錄 API，避免業務成功但漏記或重複記錄。
- 新事件寫入後，同一交易只保留該 campaign 最新 100 筆操作並清理更舊資料。為避免併發造成超過上限或刪錯資料，新增與裁切需對 campaign 採序列化鎖定（例如 transaction-scoped advisory lock），取得鎖後再以 wall-clock 時間建立紀錄，並用穩定排序決定保留集合。
- 操作紀錄是唯讀事實：不提供一般使用者 UPDATE／DELETE，也不允許直接 INSERT；只能由具有明確授權及固定 `search_path` 的操作交易函式寫入。不得透過修改歷史事件來表達取消或撤銷，後續若需要反向操作應另記新事件。

### 必須記錄的操作

1. 商店購買：購物車送出、DM 核准／拒絕及玩家取消等各自是一次操作；每次操作一筆，記錄玩家、角色、商店、物品摘要、數量及狀態變化。不要記錄可揭露私人付款方式或錢包餘額的資料。
2. 玩家貨幣轉帳：一筆轉帳一筆，記錄操作者、來源及目的角色、幣別／金額；涉及私人錢包時套用私人事件可見性，公開摘要不可洩露私人錢包類型或餘額。
3. 玩家物品轉交：一筆物品移轉一筆，記錄操作者、來源及目的角色、物品快照／數量；私人背包相關明細不得公開給無關成員。
4. DM 派發：一次提交一筆，記錄 DM、目標角色／背包、原因、物品快照／數量。

新增派發時一併建立共用事件表及派發事件；商店購買送出／核准／拒絕／取消及物品轉交的交易 RPC 須擴充，在各自原交易內寫入相同事件表。若貨幣轉帳目前仍由前端多次寫入，須先改為單一交易 RPC，再於該交易內寫入事件；不得宣稱現有多列前端同步具備原子性。不得另外建立專屬派發紀錄表。擴充或新增這些交易前需核對 migration history 和函式定義；只新增 migration，不修改已部署的歷史 migration。

### 可見性與 RLS

- 該戰役 DM 可讀取該戰役全部事件。
- 其他戰役成員只能讀取可公開的事件摘要，以及自己作為操作者或相關收受者的事件。私人錢包／暗袋事件不得讓無關成員讀取；事件 payload 應避免混放不可見的敏感欄位與公開摘要。
- 操作記錄若需依 actor／recipient 欄位授權，RLS 必須透過安全 helper 避免同表自我查詢與無限遞迴。campaign 成員資格及 DM 身分皆由伺服器端 policy/helper 驗證，不能依前端過濾。
- 初版不建置操作歷史 UI；此可見性規則仍是資料庫 API、RLS 及未來 UI 的安全邊界。

### Reconcile 與同步

- 成功回應以資料庫 RPC 結果為準。由 `useCampaignSync` 的 `inventory_items` Realtime 更新畫面；同時可用 RPC 回傳的 ID 去重或觸發受限 reload，避免 Realtime 尚未抵達時 UI 暫時漏列。
- 失敗時不做成功形狀的 fallback、不清除草稿；將使用者可理解的錯誤呈現在 dialog，服務端保留詳細診斷日誌但不輸出敏感資料。
- 未設定 Supabase 或訪客狀態不可假裝已完成遠端派發；按鈕可隱藏或提供明確提示，最終仍以 Edge Function 驗證為準。

## 建議檔案範圍

| 範圍 | 預期位置 |
| --- | --- |
| 派發按鈕與 dialog 狀態 | `src/routes/_protected/campaigns/$campaignId/index.tsx`，或抽至同路由 `-parts/` |
| 派發表單、列表與背包選擇 | 新增 `-parts/ItemDistributionDialog.tsx` |
| 來源選取及搜尋結果 | 新增 `-parts/BlacksmithSearchDialog.tsx`、`-parts/BlacksmithSourceTree.tsx` |
| 可重用定義編輯表單 | 抽取 `HomebrewModal` 欄位／轉換，或新增 `ItemDefinitionDialog.tsx` |
| 搜尋 adapter／正規化 | `src/lib/blacksmithCatalog.ts`、`src/lib/blacksmithItems.ts` 或新增 `src/lib/blacksmithSearch.ts` |
| Edge Function 呼叫及錯誤解析 | 新增 `src/lib/campaignItemDistribution.ts` |
| 物品／表單轉換型別 | `src/types.ts`、`src/lib/supabase.ts`；`ItemBase.isStackable` 預設及相容值、`InventoryItem.blacksmithItemId` 欄位轉換 |
| Edge Function | `supabase/functions/dispatch-campaign-items/index.ts` |
| Schema／validator／共用操作記錄 | 新增增量 migration，加入 `inventory_items.blacksmith_item_id`、更新 `is_valid_item_base`、建立 `campaign_activity_log` 並擴充購買／轉帳／物品移轉／派發交易；先核對合併版 migration 流程，不修改已部署歷史 migration |
| 測試 | 搜尋與定義轉換、全域 itemId 唯一性、合併／容量／新增列門檻／確認重試／鎖定單元測試、UI/E2E、Edge Function payload、隔離 Supabase RPC/RLS／保留上限併發驗收 |

初版不預設新增 UI 套件。先驗證現有 `Button`、表單元件及 dialog/overlay 慣例能否支援巢狀 dialog、Escape 關閉、焦點返回及行動版捲動；如原生能力不足，先提出套件選項與影響，再決定是否安裝。

## 分階段實作

### 階段一：鎖定產品與資料合約

- [x] 相同物品不因清單列重複或名稱相同而自動合併；只有保留相同非空來源 ID 且 `isStackable = true` 的直接匯入物品，才依目標背包及 1000 上限合併。
- [x] 共用 `campaign_activity_log` 記錄商店購買、玩家貨幣轉帳、玩家物品轉交及 DM 派發；以 `campaign_id` 隔離，每個 campaign 保留最近 100 次操作，紀錄唯讀。
- [x] DM 可讀取該戰役所有操作；其他成員只讀公開摘要及自己相關的事件，私人錢包／暗袋資料不公開給無關成員。
- [x] 初版不做派發歷史 UI 或接收者通知。
- [x] 派發最多 10 列，每列數量為 1 至 99；前端、Edge Function 與 RPC 必須一致驗證。
- [x] `ItemBase.isStackable` 預設為 `false`；單一背包堆疊最多 1000 件。
- [x] 工坊來源全域唯一 `itemId`；未修改直接匯入保留 `blacksmith_item_id`，建立／複製／編輯後清除。
- [x] 只有相同目標背包、相同非空來源 ID 且可堆疊的物品合併；無來源 ID 的物品不因同名合併。不可堆疊數量展開為多個 `quantity = 1` 背包列。
- [x] 派發原因最多 200 字；UI、Edge Function 與 RPC 採相同限制，不可靜默截斷。
- [x] 搜尋關鍵字先 trim；trim 後為空值時保留前一次結果。排序為本人自製物品、官方規則書物品、其他人分享物品。
- [x] 新派發物品預設未裝備、未調諧、目前充能為 0；營地箱強制公開。
- [ ] 依現有資料庫 schema 核實 `inventory_items` 欄位／檢查約束、DM helper、既有交易 RPC 與 RLS，再定稿增量 migration。

### 階段二：物品定義與搜尋

- [ ] 抽取可被建立、複製與清單編輯共用的物品定義表單和轉換器，不讓提交表單直接寫戰役或鍛造工坊。
- [ ] 整合官方目錄及本人／分享鍛造工坊搜尋，提供來源樹、類型／稀有度／關鍵字、非同步載入、過期結果保護及每組 20 筆上限。
- [ ] 實作並驗證官方目錄與鍛造工坊 `itemId` 的全域唯一 canonical 格式；為 `ItemBase` 加入 `isStackable` 並處理既有資料 fallback。
- [ ] 實作匯入保留來源 ID、複製／新建／定義編輯清除來源 ID，並測試來源資料不會被修改。

### 階段三：交易與後端授權

- [ ] 新增共用 `campaign_activity_log` migration、RLS 及保留最近 100 筆的安全機制；擴充商店購買與玩家物品轉交 RPC，並為目前非交易式的玩家貨幣轉帳建立交易 RPC。
- [ ] 新增 `inventory_items.blacksmith_item_id` 欄位及 validator 增量 migration；派發 RPC 於單一交易內驗證 DM、campaign、接收 owner、來源 ID 與物品內容，依可堆疊規則合併／拆分實例並寫入 `item_dispatched` 事件。
- [ ] 實作 11–20 列確認握手及同一派發識別碼重試；確認前不寫入資料，重試時在鎖定後重新計算，超過 20 列仍拒絕。
- [ ] 新增 `dispatch-campaign-items` Edge Function，沿用安全的 body、token 驗證、錯誤回傳與服務端日誌慣例。
- [ ] 測試未登入、非 DM、跨戰役目標、超過 10 列、數量不在 1 至 99、私人營地箱、來源 ID 與定義不符、預計新增超過 20 列及多物品其中一筆無效時的拒絕與完整回滾。
- [ ] 測試 stackable 同 ID 合併、1000 容量拆列、不可堆疊不合併、被編輯／複製及同名無來源物品不合併、併發派發不超量。
- [ ] 驗證各種操作皆在原交易內寫入事件；並發操作仍只保留 campaign 最近 100 筆，唯讀權限及私人事件隔離符合規則。

### 階段四：派發 UI 與同步

- [ ] 僅向 DM 顯示入口；完成目標背包、逐項數量／編輯／刪除、原因、提交中、錯誤及成功狀態。
- [ ] 串接 Edge Function；確認成功後以 Realtime／回傳 ID 更新背包，不做前端多筆寫入。
- [ ] 驗證窄螢幕巢狀 dialog、焦點管理、鍵盤操作、Escape、重複提交及草稿保留。

### 階段五：驗收與部署準備

- [ ] 單元測試：定義正規化、表單往返、來源複製不沿用 ID、搜尋條件及結果數量上限。
- [ ] E2E：DM 完成官方匯入、自創、複製、編輯、刪除、私人／公開／營地箱派發；玩家看不到入口；失敗不清除草稿。
- [ ] 隔離 Supabase 多帳號驗收：RLS、RPC actor 授權、跨 campaign 隔離、Realtime、交易原子回滾、共用操作記錄可見性、唯讀限制及每戰役 100 筆保留（含併發）。
- [ ] 執行 repo 慣例的 typecheck、lint、相關測試及 build。
- [ ] 僅依維護者核准的隔離環境驗收、migration history 核對及部署程序發布；不得因本機測試通過而宣稱遠端已驗收或上線。

## 驗收清單

### UI 與操作

- [ ] 只有 DM 看得到並可使用「派發物品」；直接呼叫 Function 的非 DM 仍被拒絕。
- [ ] 目標選單只包含當前戰役角色；私人背包只對角色可選，營地箱始終公開。
- [ ] 清單每列均可調數量、編輯定義、刪除；至少一項才可提交。
- [ ] 派發原因最多 200 字；送出時計算預計新增的 `inventory_items` 列數；11–20 列顯示確認警告，使用者取消時不送出且保留草稿，確認後才重試提交；超過 20 列時禁止提交並提示減少單次派發的物品數量。
- [ ] 警告門檻只計新建 `inventory_items` 列，不計既有堆疊更新及 `campaign_activity_log`；UI 預估不可取代 RPC 在鎖定後的權威計算。
- [ ] 搜尋前 trim 關鍵字；trim 後空值不觸發搜尋，並保留上一組結果。非空搜尋結果按本人自製、官方規則書、他人分享排序。
- [ ] 搜尋最多回傳 20 筆官方物品及 20 筆鍛造工坊物品；工坊 20 筆名額先給本人自製物品，再給他人分享物品。來源、類型及稀有度篩選皆生效。
- [ ] 快速連續搜尋不會以舊結果覆蓋新條件；載入、空結果及錯誤狀態可辨識。
- [ ] 「匯入」直接加入清單；「複製」與「創造新的物品」進入表單後只加入派發草稿，不寫入鍛造工坊。
- [ ] 交易失敗時保留所有表單內容；成功時只顯示一次完成狀態，不重複派發。

### 資料、安全與一致性

- [ ] 所有新 inventory 列使用全新 row ID，正確設定 campaign、owner、數量、stackability、來源 ID 及公開／私人狀態；camp-chest 物品不會建立虛擬角色列且不能為私人。
- [ ] Edge Function 和 RPC 都驗證輸入；RPC 不信任前端提供的 actor、campaign、owner 或物品欄位。
- [ ] 每次派發最多 10 列、各列數量 1 至 99；可堆疊列最多 1000，不可堆疊列固定數量 1。
- [ ] 只有未修改直接匯入且 `isStackable = true`、`blacksmith_item_id` 相同及目標背包相同的物品才合併；超出容量會拆成多列。不可堆疊數量展開為 quantity=1 列；無來源 ID 的同名物品不合併。
- [ ] 實際預計新建列數 0–10 可直接提交、11–20 必須明確確認、超過 20 一律拒絕；服務端在任何寫入前重新計算並強制門檻。
- [ ] 非 DM、跨戰役目標、無效物品定義及非法數量均拒絕；任何單筆失敗都不留下部分物品或操作紀錄。
- [ ] 派發原因為 0–200 字；原因及物品快照與物品建立同交易提交；已建立的物品不依賴鍛造工坊項目仍存在。
- [ ] 商店購買、玩家貨幣轉帳、玩家物品轉交及 DM 派發都寫入同一 `campaign_activity_log`；每個 campaign 僅保留最近 100 次操作，記錄不可由一般成員修改或刪除。
- [ ] DM 可讀所有本戰役事件；其他成員僅可讀公開摘要或自己相關事件，無關成員不能讀取私人錢包／暗袋資料。
- [ ] Realtime／回傳結果使背包顯示新物品；失敗不透過 optimistic state 假報成功。
- [ ] 已在隔離 Supabase 環境驗證 schema、RPC 權限、RLS、回滾及部署步驟；本機 mock 測試不取代真實資料庫驗收。
