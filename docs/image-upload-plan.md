# 圖片上傳：開發規劃

## 目標與範圍

為角色大頭像、鍛造工坊物品、戰役背包／商店物品及冒險筆記加入安全、可維護的圖片選用與上傳流程。約 1,200 張預設道具圖鑑圖片則作為靜態資產隨前端部署，不經由使用者上傳流程或 Supabase Storage 管理。

本計畫採用「靜態預設圖示與動態使用者圖片分流」：

- **預設道具圖鑑**：約 600 組 128×128 與 512×512 WebP，放在前端 `public/` 目錄並由網站 CDN 提供。資料只保存穩定的檔名／識別值，不保存部署網域 URL。
- **角色大頭像**：玩家可選用應用程式隨附的本地 WebP 頭像圖庫，或上傳圖片；只有具有該角色 `can_edit_profile` 權限的玩家可變更角色大頭像。不再支援 Emoji avatar，需將既有 Emoji 資料遷移至預設圖庫 fallback。
- **鍛造工坊圖片**：鍛造工坊物品可上傳圖片，圖片屬於來源工坊資產；匯入戰役時沿用來源圖片參照。
- **戰役物品圖片**：背包與商店物品均可使用圖片。從鍛造工坊匯入的物品預設沿用來源圖片；DM 上傳替代圖片後改用 campaign 專屬資產，不修改或刪除工坊來源圖片。
- **冒險筆記圖片**：在支援 Markdown 的筆記內容中上傳並插入圖片；沿用筆記的 campaign 隔離及編輯權限。
- **使用者上傳圖片**：採用 Supabase Storage，沿用既有 Supabase Auth、資料庫與權限架構；由瀏覽器先裁切／縮放並轉成 WebP，再上傳衍生圖。
- **不在本計畫中**：改用 Cloudinary、UploadThing 或 R2；新增伺服器端圖片轉碼服務；宣稱 Supabase 已部署或已通過真實 RLS 驗收。

預設圖鑑約 30 MB 的初始容量相較動態圖片很小，適合跟隨版本控管與前端部署；主要需要管理容量與讀取流量的是動態上傳圖片。

## 已確認的圖片規格

| 用途         | 上傳處理與產物                                            | 使用情境                                                             |
| ------------ | --------------------------------------------------------- | -------------------------------------------------------------------- |
| 角色大頭像 | 預設圖庫提供 WebP 選項；上傳圖片裁切／縮放為 256×256 WebP，品質約 0.85 | 角色卡片、狀態列、背包與成員清單 |
| 鍛造工坊物品 | 同一原圖產生 128×128 與 512×512 WebP | 工坊目錄及物品詳情 |
| 戰役背包／商店物品 | 沿用工坊來源圖片，或由 DM 上傳替代圖片並產生 128×128、512×512 WebP | 背包格子使用小圖，物品詳情／商店使用大圖 |
| 冒險筆記 | 圖片依內容比例縮放，最大寬度 1,200 px，轉為品質約 0.8 的 WebP | 以 Markdown 圖片語法插入筆記 |
| 預設道具圖鑑 | 使用既有的 128×128、512×512 WebP；不重新上傳 | 專案內靜態圖示目錄 |

上述品質與尺寸是初始建議值。實際輸出大小會依圖片內容而異，不以固定 KB 數作成功條件；上傳前仍須限制原始檔大小、像素尺寸及瀏覽器解碼負載。

## 現況與相容性

- 角色 `avatar` 現為字串且現有資料包含 Emoji；產品決定不再支援 Emoji avatar。角色欄位改為可解析的預設圖庫 ID 或 Storage path，歷史 Emoji 需在停用舊 UI 前遷移為一致的預設頭像，避免直接將 Emoji 當圖片 URL。
- 道具 `icon` 為字串；[getItemImageUrl](../src/lib/itemIcon.ts) 已支援 `./images/` 靜態路徑及 `image:https://...` 圖片 URL。預設圖示與上傳圖示都要沿用共用解析流程，不能在各元件另造格式。
- 鍛造工坊及戰役物品目前共用 `icon` 字串參照；需將來源參照與 campaign 覆寫參照的語意明確化，確保匯入不複製或改寫來源資產。
- 冒險筆記（campaign journeys）以 Markdown 儲存內容並明確不支援 HTML；圖片上傳後插入安全的 Storage 參照，Markdown renderer 僅允許安全圖片來源。
- 商店背景已有 `background_image_url` 欄位及 HTTPS URL 驗證。冒險筆記圖片屬於筆記內容，不與商店背景欄位混用。
- 新增或調整資料庫欄位時，依專案規範同步更新 snake_case／camelCase 雙向轉換及既有資料 fallback。物品既有 `icon` 格式須向下相容；Emoji avatar 則按本計畫遷移並停止支援。

## 儲存桶與物件參照

### 儲存空間配置

建立 Supabase Storage buckets：

- `user-uploads`：大頭貼等使用者個人圖片。
- `blacksmith-assets`：由鍛造工坊建立及管理的來源物品圖片；campaign 匯入物品可唯讀沿用這些參照。
- `campaign-assets`：自訂道具圖示及戰役內容圖片；整個 bucket 都公開讀取，不依內容可見性區分圖片存取。

三個圖片 bucket 都採公開讀取：任何人只要取得物件 URL，即使不是該戰役成員也能讀取圖片；公開讀取不代表允許匿名列舉物件、上傳、覆寫或刪除。已登入的資產擁有者可列出自己的個人／鍛造工坊圖片，戰役 DM 可列出所屬戰役圖片。請勿上傳足以洩漏角色暗袋、DM 筆記或其他敏感資訊的圖片。角色／物品／筆記資料本身仍由資料庫 RLS 保護，但圖片 bytes 不受該資料列權限保護。建立及刪除由 Storage RLS 限制，更新採新路徑而非原地覆寫。

路徑需可判斷資產用途並避免互相覆寫，例如：

- `user-uploads/<user-uuid>/avatars/<asset-id>/256.webp`
- `blacksmith-assets/<owner-uuid>/items/<asset-id>/128.webp`
- `blacksmith-assets/<owner-uuid>/items/<asset-id>/512.webp`
- `campaign-assets/<campaign-id>/items/<asset-id>/128.webp`
- `campaign-assets/<campaign-id>/items/<asset-id>/512.webp`
- `campaign-assets/<campaign-id>/journeys/<journey-id>/<asset-id>/image.webp`

使用不可預測的 asset ID 建立新物件，更新圖片採新路徑上傳、資料參照切換成功後再清除舊物件。禁止用使用者提供的檔名直接當物件路徑。私人／DM-only 內容的圖片仍是公開可讀的圖片資產，不可把物件 URL 當成內容權限控制。

鍛造工坊來源圖片採不可變的版本路徑；匯入只保存來源 bucket／object path，不複製檔案。DM 替換圖片時建立新的 campaign-scoped 物件，僅將該 campaign 物品的有效圖片參照切換至新物件（copy-on-write）。不得原地覆寫工坊物件，也不得因 campaign 刪除／替換圖片而刪除來源資產。

### RLS 與權限

- `user-uploads` 上傳及刪除需驗證路徑中的 UUID 等於 `auth.uid()`；一般使用者不得寫入其他 UID 路徑。
- `blacksmith-assets` 上傳需驗證路徑中的 UUID 等於登入者；物品參照的新增／修改另由 `blacksmith_items` RLS 驗證擁有者。來源資產不可原地覆寫或直接刪除，避免已匯入的物品斷圖。
- `campaign-assets` 的戰役物品圖片由 DM 上傳；冒險筆記圖片依現有筆記編輯權限授權上傳。物件使用新路徑建立，原地更新一律拒絕；campaign 圖片刪除目前僅 DM 可執行。僅檢查路徑包含某 campaign ID 不足以授權。
- 三個 bucket 均為公開讀取；匿名與非戰役成員可直接取得已知圖片 URL，但不能列舉他人或其他戰役的物件。Storage RLS 只授權範圍內的列舉、寫入／刪除，不提供圖片保密性；敏感圖片不得上傳。
- 角色大頭像的上傳以使用者自己的 UID 作資產路徑；只有具該角色 `can_edit_profile` 權限的玩家能更新角色指向的圖片。預設頭像圖庫是唯讀靜態資產，不需上傳權限。
- 刪除工坊資產前需確定沒有任何工坊物品或匯入戰役物品仍參照該資產；若無法可靠檢查跨範圍引用，保留來源圖片，不提供使用者立即硬刪除。
- 既有 RLS 防遞迴規則照常適用：需要跨表檢查時，使用固定 `search_path` 的 `SECURITY DEFINER` 輔助函式；campaign／角色 ID 是 `text`，使用者 ID 是 `uuid`，比較角色 owner 與 `auth.uid()` 時使用 `auth.uid()::text`。
- Migration 必須明確檢視既有 Storage grants、policy 與 bucket 設定，不假設新 policy 會自動抵銷更寬鬆的既有權限。
- 前端僅使用 Supabase 公開 anon key；service-role key 不得出現在前端、瀏覽器日誌或建置產物。

### 資料庫儲存格式

- 資料庫保存穩定的 bucket／object path，不保存原始檔、不保存 Base64，也不將圖片二進位內容塞入 JSONB。
- 角色大頭像參照放在角色資料，因不同角色可有各自頭像；選擇預設頭像時保存圖庫 ID，選擇上傳圖片時保存 Storage path。個人 profile 頭像不在本次需求範圍內。
- 角色 `avatar` 不再接受或呈現 Emoji；遷移時將舊 Emoji／空值映射至預設圖庫中的通用頭像 ID。沒有對應 Emoji 美術時使用同一個通用 fallback，而不保留 Emoji 相容分支。
- 道具 `icon` 保留既有 `image:https://...` 及 `./images/...` 格式相容；擴充 [getItemImageUrl](../src/lib/itemIcon.ts) 或其共用 resolver 支援預設圖庫 ID、鍛造工坊來源 path 與 campaign 覆寫 path。
- 匯入的工坊物品保留來源圖片參照，除非 DM 上傳替代圖；有效解析順序需明確（campaign override 優先，否則 forge source）。campaign 覆寫只影響該 campaign，不回寫鍛造工坊原物品。
- 預設圖鑑識別值使用固定前綴或既有靜態路徑格式，解析到部署基底下的 `public/` 圖片。不得將靜態預設資產誤判為 Storage 上傳物件。
- 冒險筆記 Markdown 內容保存 campaign／journey-scoped Storage path 的圖片語法；筆記本身繼續使用既有 campaign／journey 權限與隔離，但圖片可公開讀取，不能放入敏感內容。
- 所有資料轉換器需容忍欄位為 `NULL` 及既有道具 URL 格式；角色 avatar 依遷移結果使用預設頭像 fallback，不保留 Emoji fallback。

## 前端處理與上傳流程

新增共用圖片處理工具與上傳入口，UI 可依資產用途設定尺寸、格式、大小限制及裁切方式，不重複實作影像轉換邏輯。

1. 選取檔案後檢查檔案大小、圖片解碼結果、寬高與像素總數；使用允許的 raster 圖片格式。拒絕 SVG、非圖片內容、超限檔案及無法解碼的輸入，不能只信任副檔名或瀏覽器提供的 MIME type。選取本地預設頭像時只保存圖庫 ID，不上傳檔案。
2. 使用 Canvas／瀏覽器影像解碼 API 於本機裁切、縮放並輸出 WebP Blob。預設圖示大小按 UI 用途載入；不得先把 512 版本顯示於所有高密度背包格子。
3. 角色大頭像產生一張 256 圖片；鍛造工坊及戰役物品一次產生 128、512 兩張圖片；冒險筆記圖片產生一張最大寬度 1,200 px 的圖片。
4. 顯示預覽、上傳進度、取消與明確錯誤；只在所有必要變體成功上傳後，才更新資料參照。多張物品圖示其中一張失敗時，嘗試清理本次已建立的物件並回報失敗，不將半成品設為目前圖片。
5. 更新資料成功後，僅在可確認不再被引用且具刪除權限時清除舊圖片；若更新失敗，保留舊參照並嘗試清理新圖片。清理失敗需記錄可追蹤錯誤，不能靜默當作成功。鍛造工坊來源圖目前不可直接刪除；campaign 圖片刪除由 DM 管理，正式清理仍須遵守引用檢查。角色圖片上傳者失去權限或刪除帳號時亦不能造成仍有效角色引用失效。
6. 刪除角色、campaign、冒險筆記或物品時，依其資產參照清理相應 Storage 物件；確認使用中的共用工坊來源不會因其中一筆資料刪除而被誤刪。若無法可靠確認引用數，先採新增版本及保留舊物件的安全策略，另行規劃受控清理程序。

## 分階段執行

### 階段一：圖片格式與參照解析

- 定義並實作共用的圖片參照格式、靜態預設圖示路徑與 Storage path resolver。
- 維持道具既有靜態路徑及 HTTPS 圖片 URL 的顯示相容性；角色 Emoji 不屬於相容目標，按階段二遷移。
- 新增可測試的影像規格化函式，涵蓋尺寸、WebP 轉換、錯誤輸入與資源釋放。

**進度紀錄（2026-10-29）**

- 已完成共用參照解析：保留 `./images/...` 與 `image:https://...`，新增 `avatar:default` 穩定識別值，以及 `storage:<bucket>/<object-path>` 解析。
- Storage resolver 僅接受 `user-uploads`、`blacksmith-assets`、`campaign-assets` 三個已知 bucket 和符合各用途路徑形狀的參照；它只回傳 bucket／object path，不產生公開 URL。未知 bucket、未知頭像 ID、不安全路徑及非 HTTPS 外部 URL 會明確解析失敗。
- 已新增 `avatar:default` 對應的通用靜態 WebP fallback，以及瀏覽器圖片規格化：驗證 JPEG／PNG／WebP／AVIF 檔案簽章，限制原始檔 10 MiB、解碼影像 4,000 萬像素；輸出頭像 256×256、物品 128／512 變體及最大寬度 1,200 的 WebP，並在完成或錯誤時釋放 ImageBitmap 與 Canvas 暫存資源。頭像採置中方形裁切；物品與筆記保持比例且不放大小圖。
- 背包物品與鍛造工坊圖示解析共用同一 resolver；Storage 參照保持為 bucket／path 中繼資料，待後續有權限驗證的讀取流程時才取得可載入 URL。
- 階段一自動化驗收涵蓋舊格式相容、BASE_URL 子路徑、預設頭像／工坊／campaign／筆記參照、未知 bucket 與不安全參照拒絕、WebP 輸出尺寸及無效／損毀輸入。
- **驗證結果：**`npm run build`、圖片模組 ESLint 及 `npx playwright test tests/e2e/image-format.spec.ts --project chromium` 通過（3 項）。本結果僅驗證前端解析與轉換；Storage 尚未部署或實測。本階段不連線、不執行 SQL、不宣稱 Supabase Storage 或 RLS 已驗收。

**階段驗收標準**

- 預設頭像 ID、預設道具圖示、工坊來源圖、campaign 覆寫圖及既有 `./images/...`、`image:https://...` 都有明確且互不混淆的解析結果；無效格式、非 HTTPS 外部 URL 及未知 bucket 不會產生可載入 URL。
- 以單元測試覆蓋參照格式解析、未知 ID／path、部署 `BASE_URL` 子路徑及既有道具圖示相容性。
- 圖片規格化器可依用途輸出 256 頭像、128／512 物品圖及最大寬度 1,200 的筆記圖；測試確認 WebP 輸出、等比例縮放／裁切規則及來源尺寸小於目標時不會錯誤放大（頭像明確要求方形裁切時除外）。
- 無效／損毀圖片、非允許格式、超出設定檔案大小／像素上限及 Canvas 編碼失敗均回傳明確錯誤；成功與失敗路徑都會釋放 ImageBitmap、Object URL 等暫存資源。
- 測試只驗證純前端解析與轉換，不宣稱 Storage 已可用；本階段不需 Supabase 部署。

### 階段二：Supabase Storage 與資料庫權限

- 建立 buckets、容量／MIME 限制及 Storage policies。
- 既有 `characters.avatar`、物品 `icon` 與冒險筆記 Markdown 欄位已是可保存穩定參照的文字欄位；本階段不重複新增圖片欄位。工坊／campaign 資產沿用現有 `icon` 參照格式，筆記沿用 campaign／journey Storage path。
- 將三個 bucket 設為公開讀取、限制 WebP MIME 與單檔容量，禁止公開列舉及原地覆寫；上傳、刪除依使用者 UID、DM 或筆記編輯權限控制。
- **頭像 Emoji 資料遷移移至階段三同一版本完成**：目前顯示與選擇介面仍直接處理 Emoji，若先改資料會讓既有客戶端顯示參照字串或送回舊格式。階段三需先完成參照顯示／選取，再用資料庫遷移把歷史值轉成預設圖庫 ID，並阻止舊格式重新寫入。
- 圖片內容可被持有 URL 的任何人讀取（包含非戰役成員）；角色暗袋、DM-only 筆記等資料的資料列仍受資料庫 RLS 保護，但其圖片不得視為私密。
- 逐項驗證 Storage 對象的讀取、上傳、覆寫及刪除權限；驗證 campaign 權限不會因錯誤路徑或猜測 object ID 而繞過。
- SQL migration 與 Storage 設定仍須由維護者確認目標 Supabase 專案及 migration history 後手動部署；此規劃本身不代表已執行。

**進度紀錄（2026-10-29）**

- 新增 `20261030000009_image_storage_permissions.sql`：建立／更新 `user-uploads`、`blacksmith-assets`、`campaign-assets` 三個公開 bucket，僅接受 WebP、單檔上限 10 MiB。
- Storage policy 以嚴格物件路徑形狀及登入者 UID 限制個人與鍛造工坊上傳；戰役物品圖片僅 DM 可上傳；冒險筆記圖片需 DM、筆記建立者或具筆記修改權限者。更新一律拒絕，必須使用新路徑；個人頭像可由路徑 UID 本人刪除，戰役圖片僅 DM 可刪除，鍛造工坊來源圖禁止直接刪除。
- 新增 `characters.avatar` 更新 trigger：DM 可更新所有角色；其他登入者必須有該角色 `can_edit_profile` 權限，只有角色擁有者且尚無明確 ACL 列時沿用預設擁有者權限。此限制由資料庫執行，不依賴前端隱藏控制項。
- 個人及鍛造工坊物件限定寫入者自己的 UUID 目錄；鍛造工坊物件 ID 尚未與資料列 ID 一對一綁定，因此 Storage 允許物件擁有者建立自己的圖片物件，物品圖示參照仍由 `blacksmith_items` 資料列 RLS 控制。
- 對目標 bucket 的 Storage 物件清單查詢限制為擁有者（個人／鍛造工坊）或該 campaign 的 DM；公開 bucket 仍可透過已知 URL 讀取圖片。
- 本次無需新增資料欄位：角色頭像、鍛造工坊／戰役物品圖示及筆記內容已有 `text` 欄位可保存階段一定義的參照。歷史 Emoji 轉換與新格式驗證待階段三 UI 參照支援時一併實作，避免目前直接顯示／輸入 Emoji 的客戶端壞掉。
- **狀態：Storage／資料庫權限程式碼已完成；頭像格式遷移依賴階段三；待 Supabase 部署及隔離環境驗收。** 未連線、部署或執行 SQL；不代表 bucket、Storage RLS 或真實 Auth 權限已驗收。

**階段驗收標準**

- Migration 可在確認過的既有 Schema 上重複安全部署；檢查欄位、索引、bucket、MIME／大小限制及 policies 的預期狀態，並有明確錯誤而非靜默略過不符的基線。
- 正式／隔離環境的 Storage policy 實測覆蓋：未登入寫入被拒、登入者不可寫入其他 UID、非成員不可寫入 campaign、具權限者可執行允許操作；已知公開圖片 URL 可由非成員讀取，物件清單僅能由資產擁有者或 campaign DM 讀取。
- 預設靜態資產不需 Storage 權限；工坊來源圖片可由獲授權的匯入戰役讀取，但 campaign 使用者不能覆寫或刪除來源資產。
- 角色 `can_edit_profile`、DM、工坊物品擁有者、campaign 成員及筆記編輯權限均以真實 Auth／Storage API 測試，不只驗證前端隱藏控制項；所有未授權的直接 REST／Storage 請求均遭拒絕。
- 階段三完成後，角色 Emoji 舊值遷移為合法預設頭像 ID；空值亦有 fallback，且沒有任何遷移步驟將 Emoji 當成圖片 URL。
- 留存部署前／後 Schema 與 policy 檢查結果。若維護者尚未確認隔離專案或未手動部署，階段狀態只能標記為「程式碼完成、待部署驗收」，不得標記為資料庫已驗收。

### 階段三：角色大頭像

- 建立隨前端部署的預設 WebP 頭像圖庫；即使目前尚未提供圖庫素材，也先定義穩定 ID、解析方式與通用預設圖，之後可增補素材而不改資料格式。
- 角色編輯者需具 `can_edit_profile` 權限才能從本地圖庫選擇頭像或上傳新圖；DM 依既有權限規則可編輯。
- 移除 Emoji avatar 選取及顯示；遷移既有 Emoji／空值至預設圖庫 fallback，確保無破圖的過渡。
- 在角色頭像顯示處統一解析圖庫 ID 或 Storage path，並處理載入失敗 fallback。
- 沿用 optimistic UI 與 Realtime 同步模式；同步失敗要回復／保留可辨識狀態並提示使用者，不能顯示成功狀態。
- 保留訪客／離線模式的既有操作；雲端上傳在不可用時明確提示，不能假稱已上傳。

**階段驗收標準**

- 有 `can_edit_profile` 的玩家與 DM 可選取本地圖庫頭像及上傳新圖；無該權限的玩家無法透過 UI 或直接資料更新改變頭像。
- 在本地頭像素材尚未提供時，通用 WebP fallback 可正常顯示；頭像選取保存穩定 ID，不會上傳本地預設資產。
- 上傳頭像會在瀏覽器產生 256×256 WebP；成功後持久化 Storage path，重新載入頁面及另一個已授權客戶端均顯示相同圖片。
- 角色卡片、狀態列、角色清單、設定頁及其他角色頭像顯示點皆使用共用解析器；舊 Emoji／空值經遷移後均顯示 fallback，不會出現 Emoji 或破圖。
- 上傳取消、檔案驗證失敗、上傳失敗、資料同步失敗與無權限操作均呈現失敗狀態，且不會把 UI 顯示成已儲存；訪客／離線行為不假稱已完成雲端上傳。
- 以元件／E2E 測試覆蓋選取、預覽、替換、回復錯誤及權限狀態；真實 Storage 寫入另由階段二隔離環境測試證明。

### 階段四：鍛造工坊及戰役物品

- 在鍛造工坊物品建立／編輯流程提供圖片上傳及預覽，輸出 128、512 WebP 版本。
- 在戰役背包與商店物品編輯流程提供圖片預覽、DM 替換圖片及權限檢查；背包格子顯示 128 版本，詳情／商店顯示 512 版本。
- 鍛造工坊匯入流程保存並沿用來源圖片參照；campaign 中沒有覆寫時顯示工坊原圖。DM 上傳替代圖後，以 campaign-scoped 圖片覆寫來源參照，不能改寫工坊原圖或影響其他匯入的戰役。
- 圖片清理依來源及 campaign 資產範圍執行；campaign 刪除或覆寫不得刪除仍被引用的鍛造工坊圖片。
- 私人背包物品及 DM-only 筆記的資料列維持既有權限；對應圖片仍為公開讀取，不得放置敏感圖像或依賴隱藏 URL 保護內容。

**階段驗收標準**

- 鍛造工坊建立及編輯物品可上傳、預覽及替換圖片；成功後同一 asset ID 下的 128、512 WebP 均可解析，任一版本上傳失敗時不切換資料參照，且本次新建的不完整物件會被清理或明確記錄。
- 從鍛造工坊匯入物品時保存可追蹤的來源參照，不複製圖片；未覆寫時 campaign 背包、商店及詳情均能載入來源圖。
- DM 上傳 campaign 覆寫後，只該 campaign／該物品使用覆寫圖；其他戰役及鍛造工坊仍使用原圖。背包格子請求 128 版本，詳情與商店使用 512 版本。
- 只有獲授權的工坊物品編輯者能上傳工坊圖；只有 DM 能替換戰役商店／背包物品圖片。UI 測試及直接資料／Storage 請求均驗證相同權限。
- 以跨戰役案例驗證：覆寫圖片、刪除 campaign 物品、刪除 campaign 或清理替換圖片，不會更改或刪除工坊來源圖及其他 campaign 資產。
- 驗證背包／筆記資料列 ACL 不變；已知 campaign 圖片 URL 對非成員可讀，campaign 物件清單只對 DM 開放。此公開讀取行為是明確產品決策，不是 ACL 洩漏。
- 至少覆蓋直接建立物品、工坊匯入、更新既有圖片、任一變體失敗、Realtime 更新及重載後解析等整合／E2E 流程。

### 階段五：冒險筆記與靜態圖庫

- 在支援 Markdown 的冒險筆記編輯器加入圖片上傳／插入功能；圖片使用 campaign-scoped 儲存路徑並符合現有筆記編輯權限。
- Markdown renderer 僅載入允許的 HTTPS／受控 Storage 圖片，不允許任意 HTML 或危險 URL scheme。
- 將約 600 組預設道具圖示整理到版本控管中的靜態資產目錄，提供可重複執行的索引／檔名驗證方式；確認正式建置會將檔案納入輸出。
- 建立隨前端部署的預設頭像 WebP 圖庫及索引；本地選取只保存穩定識別值，不上傳至 Storage。
- 預設圖鑑不寫入 Storage、不複製至每個 campaign；資料只保存穩定識別值，確保不同部署基底 URL 均能解析。

**階段驗收標準**

- 有筆記編輯權限者可上傳圖片並插入 Markdown；重新編輯、儲存、重新載入及不同授權客戶端檢視時，圖片參照均保留且正確顯示。
- 筆記圖片以最大寬度 1,200 px 的 WebP 上傳，長寬比依規格保留；非編輯者無法上傳或替換筆記圖片。
- Markdown renderer 僅允許核准的 HTTPS／受控 Storage 圖片 URL；`javascript:`、`data:`、不允許的協定、HTML 注入及任意非核准圖片來源不會被呈現或執行。
- DM-only 筆記文字仍只有 DM 可讀；其圖片若已取得 URL 仍可公開讀取，因此上傳流程與文件必須提示不得放入敏感圖像。公開筆記圖片同樣可由非成員讀取。
- 預設道具圖鑑與預設頭像各有穩定索引 ID；所有已提供素材均可由索引定位，重複執行的檔名／索引檢查通過，正式 build 輸出含該靜態檔案。
- 靜態圖示解析在根路徑與非根 `BASE_URL` 部署均正確；沒有素材或索引項目時回到明確 fallback。靜態資產不會寫入 Storage，也不會複製到 campaign。
- 圖片上傳、筆記內容儲存及 Markdown 顯示均有自動化測試；私有讀取需由隔離 Supabase 實測，不以 mock 測試取代。

### 階段六：孤立物件清理與上線驗收

- 完成替換、刪除、半途失敗及孤立物件的處理流程。
- 驗證工坊圖片仍被引用時無法硬刪除；campaign 覆寫、角色頭像替換及筆記圖片刪除不會清除他人／其他戰役使用中的資產。
- 依實際 Storage policy、RLS、角色／campaign／journey 資料模型及部署狀態進行隔離環境驗收。
- 維護者確認正式專案、migration history、bucket、policy 與環境 Secrets 後才部署；不可在未確認時連線、執行 SQL 或修改 Secrets。

**階段驗收標準**

- 角色頭像替換、工坊圖更新、campaign 覆寫、筆記刪圖／刪除及多尺寸部分失敗的生命週期均有測試；更新失敗時舊參照仍可用。
- 依實際引用關係驗證刪除：共用工坊來源圖仍被工坊或任一戰役引用時不得刪除；campaign 覆寫與筆記／角色圖片只能清除確認不再被引用且操作者有權管理的物件。
- 孤立物件清理有可稽核的候選清單、dry-run／人工確認或等效保護；清理程序具範圍限制，不會掃除其他 bucket、使用者或 campaign 的物件。
- 隔離 Supabase 環境完成登入／登出、權限矩陣、公開／私人讀取、跨使用者／跨戰役隔離、替換／刪除及異常復原測試；所有真實環境檢查結果與 mock 測試結果分開記錄。
- `npm run typecheck`、`npm run lint`、`npm run test:e2e`、`npm run build` 及相關圖片處理／resolver 測試均通過；測試失敗及未完成的手動步驟不得標成通過。
- 正式部署前由維護者再次確認 Supabase 專案、migration history、bucket、Storage policies、Secrets 與回復方式；未經明確確認不得部署。部署後以正式環境唯讀／受控驗收確認功能與權限，不在未驗收前宣稱已上線。

## 驗收條件

### 功能與相容性

- 角色可選本地預設 WebP 頭像或上傳圖片產生 256×256 WebP；沒有預設頭像素材時使用通用本地預設圖，圖片載入失敗亦有 fallback。
- 不再接受或呈現 Emoji avatar；既有 Emoji 資料已遷移為可解析的預設圖庫 ID。
- 鍛造工坊物品可上傳 128、512 版本；戰役背包及商店物品可沿用鍛造工坊圖片或由 DM 上傳 campaign 專屬覆寫圖片。
- 冒險筆記可上傳圖片並插入 Markdown；檢視時圖片符合 campaign 隔離及允許的 URL scheme。
- 原始照片不會未處理地上傳；預設靜態圖示、既有 HTTPS 物品圖片 URL、沒有圖片的 fallback 均正常顯示。
- 128 圖示用於高密度列表，512 圖示只在詳情等需要較大尺寸的視圖載入。
- 取消、超限、轉換失敗、任一變體上傳失敗、資料庫參照更新失敗及刪除失敗均有清楚狀態；資料不會指向缺失或半完成的圖片。
- campaign 上傳的覆寫不影響來源工坊圖片或其他戰役；campaign／物品／筆記刪除及圖片替換不會刪除仍被其他資料引用的物件。
- 已知圖片 URL 可由匿名者及非戰役成員讀取；Storage policy 不允許匿名寫入／刪除，也不允許非擁有者／非 DM 列舉物件。私人資料的圖片不得含敏感內容。

### 安全與資料隔離

- 未登入者無法上傳、覆寫或刪除圖片；登入者無法寫入其他 UID 或未授權 campaign 的路徑。
- 玩家不能藉由修改 object path、campaign ID 或直接呼叫 Storage REST API 繞過角色／campaign 權限。
- 檔案檢查包含大小、解碼與像素上限；拒絕偽裝 MIME、SVG、損毀圖片及超限影像。
- 前端建置產物不包含 service-role key；公開讀取 policy 不授予匿名寫入。

### 專案驗證

- 執行相關單元／元件測試、`npm run typecheck`、`npm run lint`、`npm run test:e2e` 及 `npm run build`，並為 Storage／RLS 測試明確區分 mock 合約與真實 Supabase 驗收。
- mock 測試只證明前端流程與呼叫契約；真實 Storage policy、資料庫 RLS、Realtime 及刪除行為需在維護者指定的隔離 Supabase 專案手動驗收。
- 部署文件清楚記錄 buckets、policy、欄位與手動驗收步驟；驗收完成前不得宣稱已上線。

## 部署與安全注意

階段一已完成；階段二已新增 Storage migration 與部署後 SQL 驗收檢查，但尚未在 Supabase 環境部署或執行。三個圖片 bucket 都使用 Supabase 公開 Storage 物件，不提供圖片 bytes 的保密性；不需要把 service-role key 放入 Vite。鍛造工坊來源圖及戰役覆寫圖採不同資產範圍及不可變路徑。部署前仍須由維護者確認目標專案與 migration history，部署後完成真實 Auth／Storage API 驗收，否則不得標記已上線。

### 階段二部署與檢查順序

1. 維護者先確認目標 Supabase 專案、既有 migration history、目標 bucket 的用途、設定及既有物件。migration 會將三個 bucket 設為公開且更新大小與 MIME 限制；若既有內容不適合公開，必須先處理，不能直接套用。
2. 確認先前必要 migration 已完成後，依專案既有部署程序執行 [Storage migration](../supabase/migrations/20261030000009_image_storage_permissions.sql)。若手動執行 SQL，須依維護者流程核對並記錄 migration history；不要只建立 bucket 而省略 policies 和頭像權限 trigger。
3. 確認 migration 成功並提交後，再執行 [Storage 驗收 SQL](../supabase/tests/image_storage_permissions.sql)。該檔案只是檢查，最後會 `ROLLBACK`，不會建立或修改 bucket；不可與尚未提交的 migration 放在同一個交易中執行，否則回滾可能撤銷 migration。
4. 若驗收回報 bucket 不符，先以唯讀 SQL 查詢三個 bucket 的 `public`、`file_size_limit` 與 `allowed_mime_types`；新版驗收 SQL 也會列出缺少或不符的 bucket。確認 migration 的執行結果及目標專案後再處理，不要只修改驗收條件。
5. SQL 結構檢查通過不代表 Storage API、現有 grants／policies 與不同使用者的實際權限已驗收；仍須在隔離專案依上述權限矩陣實測。
