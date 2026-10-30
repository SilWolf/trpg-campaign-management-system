# 主題系統視覺延伸修正規劃

## 目標與範圍

延續 [`theme-system-plan.md`](./theme-system-plan.md) 已完成的語意色彩與三主題切換，修正三類仍依賴固定視覺值的情況：

1. 將物品稀有度的文字、底色、邊框、漸層與光暈改由 CSS variables 提供，允許同一稀有度在不同主題採用合適配色與前景色。
2. 修正 `dnd` 淺色主題中仍使用白色標題文字、因而與淺色表面對比不足的問題。
3. 讓 `printing` 主題與實際列印輸出使用白底、移除漸層及卡片陰影，同時保留可辨識的語意色彩，並在確有需要時新增主題效果變數。

本計畫僅涵蓋主題呈現與相關回歸驗收，不改動物品稀有度資料、排序、交易、權限、Supabase Schema 或主題偏好儲存方式。既有稀有度標籤、圖示及其他非色彩辨識線索應予保留。

## 現況與問題

- [`src/data.ts`](../src/data.ts) 的 `RARITY_CONFIG` 定義 `Common`、`Uncommon`、`Rare`、`VeryRare`、`Legendary`、`Artifact` 六種稀有度；目前包含固定色碼、Tailwind 色階 class、漸層 class 及 glow shadow。
- 稀有度設定被背包、商店及 Blacksmith 等介面共用，也有商店列表直接套用稀有度邊線的樣式。只修改單一頁面無法確保所有呈現一致。
- [`src/types.ts`](../src/types.ts) 定義 `RarityStyle`；若設定欄位改為語意 key 或 CSS custom property，需同步調整型別與所有使用端，不可保留型別安全的假象。
- [`src/index.css`](../src/index.css) 已定義 `default`、`dnd`、`printing` 三套色彩變數。`dnd` 使用羊皮紙淺底與深色 `--foreground`，但頁面仍可能有固定白色的標題文字。
- `printing` 主題色彩變數與 `@media print` 規則目前分開：列印媒體移除背景圖、陰影與文字陰影；切換至 `data-theme="printing"` 的螢幕預覽則須一併移除一般主題的漸層及 shadow utilities。
- 漸層與陰影不全是單一樣式用途。遷移前需區分卡片表面、主要操作、稀有度裝飾等用途，避免以全域規則造成無關元件退化。

## 已確認決策

以下答案由使用者於 2026-10-28 確認，作為本規劃的範圍基準：

| 項目 | 確認結果 |
| --- | --- |
| `printing` 涵蓋範圍 | 同時處理切換至 `printing` 時的螢幕畫面，以及瀏覽器實際列印輸出（`@media print`）。 |
| 稀有度主題化範圍 | 六種稀有度的完整呈現均納入：文字、底色、邊框、漸層與光暈；每種主題都要定義可讀的前景色。 |

## 設計與實作規則

### 稀有度使用主題變數

1. 對六種稀有度建立明確且穩定的 token 集合，至少涵蓋前景文字、底色及邊框；漸層與光暈也必須能由主題控制或在該主題明確關閉。
2. 以 `default`、`dnd`、`printing` 三組值提供完整定義。`dnd` 不得預設沿用深色背景主題的白色／淺色普通稀有度文字；應為每種實際表面配置足夠對比的文字色。`printing` 使用白底與高對比色彩，並避免以顏色作為唯一分類線索。
3. `RARITY_CONFIG` 保留稀有度識別名稱與顯示標籤，但不得再攜帶固定色碼或依賴特定主題的色階 utility。設定可透過稀有度 key 對應到 CSS variables，或採用經專案樣式模式驗證後的等效方式。
4. 稀有度 badge、詳情卡、標題／邊框，以及商店列表的稀有度邊線都必須使用同一份主題 token 定義。動態 Tailwind class 不得以執行期片段拼接；必要時使用固定 class 與 CSS custom properties。
5. 不把稀有度語意映射成 `success`、`warning` 或 `destructive` 等狀態 token；例如 `Artifact` 的顏色只代表物品分類，不代表錯誤或危險操作。

### `dnd` 標題使用合適的語意前景色

1. 盤點 `dnd` 淺色表面上的標題、卡片標題及稀有度標題，找出固定白色或淺色文字 class。
2. 一般標題使用其所在表面的語意前景（例如 `text-foreground` 或 `text-card-foreground`）；真正的強調文字則使用對應主題前景 token，不得只因其為標題而一律套用白色。
3. 在 `default` 暗色主題保留既有清晰層級；修正不得將預設主題標題改成低對比深色。
4. 不額外建立標題專用 token，除非盤點證明現有 `foreground`／`card-foreground` 無法表達多個確實不同的標題用途。

### `printing` 移除裝飾效果

1. 螢幕上的 `printing` 主題應以白底、清晰邊界及無裝飾性漸層與卡片陰影為原則，並保留語意色彩。
2. 實際列印輸出繼續由 `@media print` 控制；檢查列印樣式與 `data-theme="printing"` 並用時不會互相覆蓋出低對比文字、背景墨水浪費或不必要的陰影。
3. 先盤點產品頁面、共用元件、登入／大廳及稀有度卡片所用的 gradient 與 shadow，依用途遷移。不可移除焦點提示、邊界或其他功能性視覺資訊。
4. 若既有語意 token 無法表示裝飾效果，新增少量效果變數，例如按用途命名的表面漸層 token 與卡片陰影 token；`printing` 可將漸層設為 `none`、陰影設為 `none`。不要增加可任意組合的通用設計系統，亦不要只用一條全域 selector 隱藏所有背景圖／陰影。
5. `printing` 下仍須保留按鈕、卡片分隔、連結及狀態的可辨識性；以清楚的邊框、文字、圖示及版面層級輔助色彩，不使用漸層或陰影。

## 分階段執行

### Phase 1：建立稀有度樣式盤點與 token

1. 列出 `RARITY_CONFIG` 的消費端，涵蓋背包物品卡與提示、Blacksmith 詳情與 badge、商店詳情及列表邊線。
2. 根據三主題制定六種稀有度的前景、底色、邊框、漸層與光暈值；明確記錄 `printing` 不使用裝飾漸層／光暈的規則。
3. 在 [`src/index.css`](../src/index.css) 定義每個主題的 rarity CSS variables，並更新 Tailwind 映射或共用樣式，避免將 CSS variable 名稱與任意值 class 難以追蹤地散落於頁面。
4. 調整 [`src/data.ts`](../src/data.ts) 的設定及 [`src/types.ts`](../src/types.ts) 的 `RarityStyle` 型別，保持所有使用端具型別檢查。

**完成條件：** 六種稀有度在所有既有消費端皆從主題變數取得色彩；切換主題不需改物品資料或逐頁切換色票；無固定稀有度色碼、主題專屬色階 class 或執行期拼接的 Tailwind class 殘留在該設定路徑。

#### Phase 1 執行結果（2026-10-28）

- 已完成六種稀有度、三個主題的前景色、底色、邊框、卡片／標題漸層與光暈 token；`printing` 保留稀有度色彩，並將裝飾漸層與光暈設為 `none`。
- `RARITY_CONFIG` 保留標籤與稀有度識別，呈現 class 改為固定 token class／CSS variable utility；`RarityStyle` 型別限制可用 token class 與變數，沒有更動物品資料或排序邏輯。
- 已移除消費端另外疊加的 Tailwind 稀有度漸層 class，確保實際背景效果只由主題 token 決定；商店已鑑定物品圖示也改用對應稀有度前景色。
- 執行期間未發現需要追加使用者決策的規格問題；依「三主題均完整主題化」及「`printing` 同時涵蓋預覽與列印」的既有確認範圍執行。
- 驗證結果：`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 均通過；主題、背包、Blacksmith 與商店相關 E2E 測試共 28 項通過。

| 樣式消費端 | 稀有度呈現／盤點結果 |
| --- | --- |
| 背包格狀與列表 | [`InventoryGrid.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/InventoryGrid.tsx)：卡片背景、邊框、光暈、物品圖示與名稱。 |
| 背包物品提示 | [`ItemTooltip.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/ItemTooltip.tsx)：標題漸層、卡片／圖示邊框與光暈、名稱及物品屬性文字。 |
| Blacksmith 官方目錄 | [`$catelogId.tsx`](../src/routes/_protected/blacksmith/officials/$catelogId.tsx)：格狀／列表物品卡、稀有度 badge、詳情卡與標題區。 |
| 戰役商店 | [`index.tsx`](../src/routes/_protected/campaigns/$campaignId/shops/$shopId/index.tsx)：左側稀有度色條、圖示底色／邊框／光暈、名稱與 badge。 |
| 僅顯示稀有度標籤的設定／篩選 | 商店設定與補貨面板、Blacksmith 工作坊及目錄篩選只取 `RARITY_CONFIG` 標籤，沒有獨立稀有度配色需遷移。 |

| 主題 | 色彩／效果規則 |
| --- | --- |
| `default` | 深色表面搭配各稀有度明亮前景與彩色邊框；保留彩色漸層與稀有度光暈。 |
| `dnd` | 淺色稀有度表面搭配深色前景，六種稀有度均使用可讀的深色文字；採用低強度彩色邊框、漸層與光暈。 |
| `printing` | 白色表面搭配高對比文字，以色彩與邊框區分稀有度；不使用裝飾漸層或光暈。 |

### Phase 2：修正 `dnd` 標題對比

1. 搜尋並檢查所有主題化頁面中標題的固定白色／淺色 class，優先檢查白底卡片、彈窗、登入、大廳、物品詳情與商店區塊。
2. 依標題所在表面改用 `foreground`、`card-foreground`、`popover-foreground` 或稀有度前景 token。
3. 對明確需要的強調效果，保留其用途但改用主題可覆寫的 token；不可用降低 opacity 的白字作為深淺主題共用解法。

**完成條件：** `dnd` 主題所有抽查標題均可在其實際底色上清楚閱讀；`default` 與 `printing` 的標題層級沒有回歸。

#### Phase 2 執行結果（2026-10-28）

- 已盤點登入／邀請、大廳、個人資料、戰役導航與設定、Blacksmith、背包對話框，以及商店列表、詳情、管理與交易等頁面的標題樣式。
- 淺色頁面、卡片、彈窗與稀有度詳情標題已依實際表面改用 `foreground`、`card-foreground` 或既有稀有度前景 token；位於主要操作色表面的標題保留 `primary-foreground`，並收斂 Blacksmith 官方規則書卡片漸層，避免淺色端點造成白字對比不足。
- 一併修正與標題同區域、同樣使用淺色前景的眉標文字；沒有新增標題專用 token，也未改動資料或互動流程。
- 主題 E2E 已在登入、戰役設定及 Blacksmith 頁面逐一切換三套主題，驗證標題沿用頁面前景色，並沿用主要內容至少 `4.5:1` 的對比檢查及手機水平溢位檢查。
- 本階段未遇到需要使用者決策或澄清的規格問題，沒有待記錄的問答。
- 驗證結果：`npm run typecheck`、`npm run lint`、`npm run build`、`npx playwright test tests/e2e/theme-system.spec.ts`（3 項通過）及 `git diff --check` 均通過。lint 曾因與 Playwright 同時建立 `test-results` 目錄而首次失敗，測試完成後重跑成功。

### Phase 3：整理 `printing` 的漸層與陰影

1. 盤點主題切換時仍可見的漸層與 shadow，按「表面／卡片」、「主要操作」、「稀有度裝飾」分類並標記應移除或保留的效果。
2. 對重複用途抽取最少量 CSS effect variables 或共用樣式；為 `printing` 提供無漸層、無裝飾陰影的值，並保留 `default`／`dnd` 原有視覺。
3. 更新實際列印規則與螢幕上的 `printing` 主題，避免只處理其中一種情境；驗證列印分頁、表面邊界、連結與互動控制隱藏行為仍符合既有規則。
4. 保留功能性 focus ring 與明確邊框；如實際列印不需要 focus ring，僅在列印媒體中處理，不影響螢幕鍵盤操作。

**完成條件：** `printing` 螢幕預覽與列印輸出均不呈現非必要漸層或卡片陰影；內容層級仍清晰，其他主題未失去原有裝飾層級。

#### Phase 3 執行結果（2026-10-28）

- 已盤點頁面背景光暈、卡片／對話框陰影、主要操作漸層及稀有度漸層／光暈。稀有度效果沿用 Phase 1 的 `printing` token（`none`）；一般裝飾效果以主題限定的 CSS variables 與 Tailwind 效果 class selector 統一處理，漸層改為其首個色階的純色底，避免主要操作在列印主題下變成透明。
- `printing` 螢幕主題會移除上述背景漸層、卡片陰影及圖示 drop-shadow；切換時同步關閉陰影 transition，避免短暫殘留。功能性 `ring` 焦點提示、表面底色與邊框不受影響；樣式規則僅套用於 `printing`，`default`／`dnd` 保留原效果。
- `@media print` 保留主題色彩、移除背景圖／陰影、隱藏互動控制及設定分頁規則。主題 E2E 新增螢幕效果檢查，並以 print media emulation 驗證背景圖／陰影移除、`break-inside`、連結底線與互動控制隱藏。
- 本階段沿用規劃書既有範圍決策，未遇到需要追加使用者決策的問題，沒有新增問答。Playwright 驗證的是瀏覽器 print media 樣式；原生列印對話框／實際 PDF 的人工預覽仍列入 Phase 4 視覺驗收，不在此處宣稱已人工驗收。
- 驗證結果：`npm run test:e2e -- tests/e2e/theme-system.spec.ts`（3 項通過）、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 均通過。

### Phase 4：回歸驗收與文件

1. 更新主題系統文件，記錄稀有度 token、主題前景色規則、effect variables 及列印行為。
2. 以相同資料檢視 `default`、`dnd`、`printing` 的代表頁面：背包、Blacksmith 物品詳情、商店列表／詳情及一般卡片／對話框；檢查桌面與窄螢幕，以及需要的 hover、focus 狀態。
3. 驗證六種稀有度的文字／底色對比。一般文字目標至少為 WCAG AA 4.5:1；大型文字依 WCAG AA 至少為 3:1。列印版面不得只靠色相區分不同稀有度。
4. 沿用既有 E2E 主題測試並補足稀有度主題切換、`dnd` 標題對比及 printing 螢幕／列印媒體的必要斷言；不新增像素級 screenshot golden，除非後續另有決策。
5. 執行相關 E2E、typecheck、lint、build 及 `git diff --check`；以瀏覽器實際列印預覽確認輸出。

**完成條件：** 三主題的稀有度、標題及列印外觀均通過視覺與功能驗收；主題切換和列印不改變既有物品操作、排序、交易及資料行為。

#### Phase 4 執行結果（2026-10-28）

- 已補充主題系統文件，記錄六種稀有度的前景、底色、邊框、漸層與光暈 token，以及 `printing` 主題效果變數和 `@media print` 行為。
- 主題 E2E 新增六種稀有度在三主題的瀏覽器 computed-style 對比檢查，文字對比同時計算純色底與漸層色階；18 組配對均達 WCAG AA 一般文字 4.5:1。`printing` 六種底色皆有色彩差異，稀有度光暈為 `none`。
- 主題 E2E 共 4 項通過，包含鍵盤切換、`dnd` 標題／窄螢幕檢查、列印媒體的主題色彩、分頁、連結底線與互動控制隱藏。背包、Blacksmith 及商店相關 E2E 合計 29 項通過，涵蓋既有瀏覽、詳情及操作流程。
- 主題回歸頁面涵蓋登入、戰役設定、Blacksmith 首頁／物品詳情、背包及商店列表／詳情；於桌面 1280px 與窄螢幕 375px 逐一切換三主題，檢查主要文字對比與水平溢位。擴增測試時曾因 URL 條件將商店路徑誤判為設定頁而失敗，已改為精確路徑判斷，重跑 4 項主題 E2E 通過。
- `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 均通過。E2E 執行期間有非致命 Supabase Realtime mock transport error 記錄，未造成測試失敗。
- 初次將 E2E 與 lint/build 併行時，E2E 有 3 項頁面載入斷言失敗，ESLint 也因 Playwright 同時清理 `test-results` 暫存目錄而回報 `ENOENT`；改為分開執行後，29 項 E2E 與 lint 均通過。
- **列印驗收答覆（2026-10-28）：** 使用者接受以 Chromium print-media 自動化驗收取代人工開啟原生列印對話框／目視 PDF，故以自動化斷言結案；文件仍註明本次未人工目視實際 PDF。除了此項驗收方式確認外，沒有遇到需新增產品決策的問題。

## 驗收清單

- [x] 六種稀有度在三主題都使用主題 CSS variables，且文字、底色、邊框搭配清楚。
- [x] 稀有度漸層與光暈可依主題調整；`printing` 中已關閉裝飾性效果。
- [x] `dnd` 淺色表面上的一般標題不再使用低對比白色／淺色文字。
- [x] `printing` 螢幕預覽無不必要漸層與卡片陰影。
- [x] Chromium print-media 輸出無不必要漸層與陰影，內容邊界及分頁仍清楚（依使用者確認接受自動化驗收）。
- [x] 一般文字對比、鍵盤主題切換、列印連結及稀有度色彩區別均可辨識。
- [x] 背包、Blacksmith 與商店等共享稀有度樣式路徑均已在三主題、桌面與窄螢幕檢查。
- [x] 相關 E2E、typecheck、lint、build、diff check 與 Chromium 列印媒體樣式驗證均通過；依使用者確認，以自動化驗收取代人工列印預覽。
