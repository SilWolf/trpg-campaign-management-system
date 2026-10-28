# 網站語意色彩與主題切換規劃

## 目標與範圍

將介面中直接指定色相的 Tailwind class（例如 `bg-stone-950`、`text-amber-200`）逐步改為代表用途的語意 class（例如 `bg-background`、`text-foreground`、`bg-primary`、`text-primary-foreground`），並將語意色彩集中定義為 CSS variables。未來切換主題時，只需套用另一組變數，不必在頁面逐處替換顏色。

本計畫處理的是色彩設計 token 與 UI class 遷移，不包含本階段實作主題選單、主題持久化或整站重設計。頁面布局、資料流程、權限與 Supabase Schema 均不在範圍內。

## 現況盤點

- 專案使用 Tailwind CSS v4，樣式入口為 [`src/index.css`](../src/index.css)，目前已有 `--color-ui-surface`、`--color-ui-border`、`--color-ui-focus`、`--color-ui-danger` 等少量 token。
- 專案已有自建的 [`src/components/ui/`](../src/components/ui) 元件，以及 `Button`、`Badge` 等共用樣式；目前 variant 仍直接使用 amber、stone、purple、emerald、cyan、red 等色階。
- 2026-10-28 的可重跑盤點記錄於下方 Phase 0；目前 `.tsx` 色彩 utility 的詞面計數為 2,243 次，分布於 43 個來源檔案。此數字統計原始碼 token，不等於執行時 DOM 數量或唯一 class 數。
- 高度客製的背包、物品提示、商店與 Blacksmith 介面比例高，不宜用全域搜尋取代判斷；相同色階在不同頁面可能代表不同意義。

## 建議決策

### 不必為主題化另外引入 shadcn/ui

建議採用 shadcn/ui 常見的語意 token 命名方式與 CSS variables 作法，但不因主題切換需求而安裝整套 shadcn/ui 或另一套 UI framework。

原因：

- shadcn/ui 的價值主要在可複製的元件與互動模式；CSS variables 主題化本身不需要它。
- 專案已有自建共用元件，且既有 UI 元件規劃已採用逐步封裝的方向。此處直接將既有元件改為使用語意 token，較不會造成元件重複或 UI 風格不一致。
- 如果日後需要 Dialog、Dropdown、Tabs 等複雜互動元件，可依 [`docs/ui-component-refactor-plan.md`](./ui-component-refactor-plan.md) 的既有建議，針對實際需求選用 primitives；這與引入主題系統是兩個獨立決策。

### 統一語意色彩角色

全站採用以下語意角色，使用 shadcn/ui 常見的 `background`、`card`、`popover`、`primary`、`secondary`、`muted`、`accent` 等命名方式，並補充產品需要的狀態色。避免頁面各自發明用途相近的色彩名稱：

| 語境 | 用途 | 適合的例子 |
| --- | --- | --- |
| `primary` | 最主要、建議優先執行的操作 | 儲存、建立、主要確認 |
| `secondary` | 次要但仍明確的操作樣式 | 一般次要按鈕 |
| `card` | 卡片、面板等內容容器及其前景文字 | 設定面板、戰役卡片 |
| `popover` | 浮在內容上方的選單、提示框及其前景文字 | Dropdown、Popover、浮層 |
| `muted` | 低強調表面及其低強調文字 | 輔助區塊、次要說明、未選取項目 |
| `accent` | 互動中的強調或選取表面及其前景文字 | Hover、目前選取的選單項目 |
| `success` | 成功結果或正向完成狀態 | 儲存成功、已完成 |
| `destructive` | 具破壞性或不可逆的操作，以及危險錯誤 | 刪除、移除角色、失敗狀態 |
| `warning` | 需要注意或可能造成影響，但未必是錯誤 | 權限提醒、尚未保存、即將過期 |
| `info` | 中性資訊、說明或提示 | 說明文字、一般提示、資訊型標籤 |
| `disabled` | 不可互動或目前不可用的控制項狀態 | 停用按鈕、不可編輯欄位 |

`card`、`popover`、`muted`、`accent` 描述容器或互動表面，不是操作優先級；`primary`、`secondary` 用於操作樣式；`success`、`destructive`、`warning`、`info` 表達狀態或訊息。這些角色可由不同元件組合使用，但不應因為名稱相似而混為一談。

各語意角色依用途提供對應的背景、前景文字及必要邊框 token。例如主要按鈕使用 `bg-primary text-primary-foreground`，卡片使用 `bg-card text-card-foreground`，選單浮層使用 `bg-popover text-popover-foreground`，選取項目可使用 `bg-accent text-accent-foreground`，低強調文字使用 `text-muted-foreground`。每個主題都需維持前景與背景的足夠對比。

此外保留不代表操作樣式或訊息狀態的基礎 token：`background`、`foreground`、`border`、`input`、`ring`、`overlay`。它們分別用於頁面底色、預設文字、邊框、表單欄位、鍵盤焦點環與固定使用黑色的遮罩層。

`disabled` 是控制項狀態，不是可任意套用在一般訊息上的狀態色。優先以 HTML `disabled`／`aria-disabled` 和 `disabled:` 樣式表達不可操作；disabled token 用於該狀態的背景、文字與邊框，且必須確保停用狀態仍可辨識。

每個主題都應提供完整且一致的 token，確保切換主題不會改變上述語意，並維持文字與背景的足夠對比。

在 Tailwind CSS v4 中，建議由 CSS variables 提供主題值，再透過 `@theme inline` 將其暴露為 Tailwind utilities。概念示例：

```css
:root,
:root[data-theme='default'] {
  --background: /* 預設博德之門 3 黑金風格的頁面底色 */;
  --foreground: /* 預設博德之門 3 黑金風格的主要文字 */;
  --card: /* 預設主題卡片或面板底色 */;
  --card-foreground: /* 預設主題卡片或面板文字 */;
  --popover: /* 預設主題浮層底色 */;
  --popover-foreground: /* 預設主題浮層文字 */;
  --primary: /* 預設主題主要操作底色 */;
  --primary-foreground: /* 預設主題主要操作文字 */;
  --secondary: /* 預設主題次要操作底色 */;
  --secondary-foreground: /* 預設主題次要操作文字 */;
  --muted: /* 預設主題低強調表面底色 */;
  --muted-foreground: /* 預設主題低強調文字 */;
  --accent: /* 預設主題互動強調或選取底色 */;
  --accent-foreground: /* 預設主題互動強調或選取文字 */;
  --success: /* 預設主題成功狀態色 */;
  --success-foreground: /* 預設主題成功狀態文字 */;
  --destructive: /* 預設主題危險狀態色 */;
  --destructive-foreground: /* 預設主題危險狀態文字 */;
  --warning: /* 預設主題警告狀態色 */;
  --warning-foreground: /* 預設主題警告狀態文字 */;
  --info: /* 預設主題資訊狀態色 */;
  --info-foreground: /* 預設主題資訊狀態文字 */;
  --disabled: /* 預設主題停用控制項底色 */;
  --disabled-foreground: /* 預設主題停用控制項文字 */;
  --border: /* 預設主題邊框色 */;
  --input: /* 預設主題輸入欄位色 */;
  --ring: /* 預設主題鍵盤焦點環色 */;
}

[data-theme='dnd'] {
  --background: /* 龍與地下城奶白底色 */;
  --foreground: /* 龍與地下城深棕紅主要文字 */;
  --card: /* 龍與地下城奶白或淺暖色卡片底色 */;
  --card-foreground: /* 龍與地下城卡片文字 */;
  --popover: /* 龍與地下城浮層底色 */;
  --popover-foreground: /* 龍與地下城浮層文字 */;
  --primary: /* 龍與地下城棕紅主要操作底色 */;
  --primary-foreground: /* 龍與地下城主要操作文字 */;
  --secondary: /* 龍與地下城次要操作底色 */;
  --secondary-foreground: /* 龍與地下城次要操作文字 */;
  --muted: /* 龍與地下城低強調暖色表面 */;
  --muted-foreground: /* 龍與地下城低強調文字 */;
  --accent: /* 龍與地下城互動強調或選取底色 */;
  --accent-foreground: /* 龍與地下城互動強調或選取文字 */;
  --success: /* 龍與地下城成功狀態色 */;
  --success-foreground: /* 龍與地下城成功狀態文字 */;
  --destructive: /* 龍與地下城危險狀態色 */;
  --destructive-foreground: /* 龍與地下城危險狀態文字 */;
  --warning: /* 龍與地下城警告狀態色 */;
  --warning-foreground: /* 龍與地下城警告狀態文字 */;
  --info: /* 龍與地下城資訊狀態色 */;
  --info-foreground: /* 龍與地下城資訊狀態文字 */;
  --disabled: /* 龍與地下城停用控制項底色 */;
  --disabled-foreground: /* 龍與地下城停用控制項文字 */;
  --border: /* 龍與地下城邊框色 */;
  --input: /* 龍與地下城輸入欄位色 */;
  --ring: /* 龍與地下城鍵盤焦點環色 */;
}

[data-theme='printing'] {
  --background: /* 適合列印的白色頁面底色 */;
  --foreground: /* 適合列印的深灰或黑色主要文字 */;
  --card: /* 灰階卡片或面板底色 */;
  --card-foreground: /* 灰階卡片或面板文字 */;
  --popover: /* 灰階浮層底色 */;
  --popover-foreground: /* 灰階浮層文字 */;
  --primary: /* 灰階主要操作底色 */;
  --primary-foreground: /* 灰階主要操作文字 */;
  --secondary: /* 灰階次要操作底色 */;
  --secondary-foreground: /* 灰階次要操作文字 */;
  --muted: /* 淺灰低強調表面底色 */;
  --muted-foreground: /* 適合列印的中深灰低強調文字 */;
  --accent: /* 灰階互動強調或選取底色 */;
  --accent-foreground: /* 灰階互動強調或選取文字 */;
  --success: /* 灰階成功狀態色，需以文字或圖示補充辨識 */;
  --success-foreground: /* 灰階成功狀態文字 */;
  --destructive: /* 灰階危險狀態色，需以文字或圖示補充辨識 */;
  --destructive-foreground: /* 灰階危險狀態文字 */;
  --warning: /* 灰階警告狀態色，需以文字或圖示補充辨識 */;
  --warning-foreground: /* 灰階警告狀態文字 */;
  --info: /* 灰階資訊狀態色 */;
  --info-foreground: /* 灰階資訊狀態文字 */;
  --disabled: /* 灰階停用控制項底色 */;
  --disabled-foreground: /* 灰階停用控制項文字 */;
  --border: /* 列印友善的灰階邊框色 */;
  --input: /* 灰階輸入欄位色 */;
  --ring: /* 灰階鍵盤焦點環色 */;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
  --color-disabled: var(--disabled);
  --color-disabled-foreground: var(--disabled-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}
```

主題識別值固定為 `default`、`dnd`、`printing`。`default` 是預設的《博德之門 3》黑金風格；`dnd` 是龍與地下城奶白配棕紅風格；`printing` 以灰階為主並以白底、深色文字及清晰邊界支援直接列印。以上 CSS 僅示意映射關係與視覺方向，具體色票、對比值及列印樣式仍須在設計 token 階段定稿。

### 保留領域資訊，不另造一套顏色語境

琥珀金、秘法紫、翠綠、青色等現有色系應依實際用途映射至上述語意角色，而非成為一套額外的 `magic`、`private`、`camp` 顏色 token。遷移盤點時，主要操作使用 `primary`、次要操作使用 `secondary`、低強調內容使用 `muted`、互動選取使用 `accent`、正向結果使用 `success`、危險動作使用 `destructive`、提醒使用 `warning`、中性說明使用 `info`；卡片與浮層則分別使用 `card`、`popover`。

背包區域、魔法物品、私人暗袋、營地箱等產品領域標籤若本身不屬於上述語意角色，不可只靠獨立色相維持辨識；應優先保留名稱、圖示、邊框或其他非色彩線索。只有在產品明確要求它們作為獨立且可切換的語意分類時，才另行提出擴充 token 集合的決策。

## 分階段執行

### Phase 0：建立可驗收的色彩盤點

1. 以程式化方式統計 JSX/TSX 中實際使用的顏色 class，區分背景、文字、邊框、ring、漸層、透明度、hover/focus/disabled 等狀態。
2. 另行盤點 CSS、SVG、inline style、Markdown 內容與動態 class 組合中的硬編碼顏色；靜態 Tailwind 搜尋無法涵蓋所有來源。
3. 建立「目前用色 → 介面用途 → 目標 token」對照表。遇到同一色彩對應多個用途時，逐個確認語意，不可自動一對一替換。
4. 記錄目前路由、互動狀態與窄螢幕的視覺基準；沿用既有 Playwright E2E 基礎設施，必要時補充代表性頁面的主題視覺檢查。

**完成條件：** 有可重跑的 class/token 使用清單、非 JSX 色源清單、重要狀態與代表性頁面清單；每個色彩家族都有候選語意角色或明確標記的逐處判斷規則。視覺驗收採人工比對修改前後的代表頁面、互動狀態與窄螢幕畫面；功能測試不取代人工視覺驗收。

#### Phase 0 盤點結果（2026-10-28）

**可重跑指令：** `node scripts/audit-theme-colors.mjs`（[`scripts/audit-theme-colors.mjs`](../scripts/audit-theme-colors.mjs)）。此輕量掃描器以原始碼 token 盤點 `src/**/*.tsx` 中完整寫出的 Tailwind 色彩 utility；不安裝依賴、不改動檔案。它用於建立可比較的基準，不是 AST 分析，也不會推算 runtime 組合或 DOM 中的實際出現次數。任意值 utility、其他副檔名及 Markdown 另列於非 JSX 盤點，不混入下表。

| 盤點項目 | 基準結果 |
| --- | ---: |
| `.tsx` 原始碼檔案 | 51 |
| 含色彩 utility 的檔案 | 43 |
| 色彩 utility 詞面出現次數 | 2,243 |
| 不含狀態變體的不同 utility 形式 | 311 |
| 含狀態變體的不同 token 形式 | 371 |

Utility 家族以 Tailwind 前綴分組；漸層的 `from`、`via`、`to` 分列：

| Utility 家族 | 次數 | Utility 家族 | 次數 |
| --- | ---: | --- | ---: |
| `text-*` | 1,047 | `border-*` | 556 |
| `bg-*` | 539 | `from-*` | 27 |
| `to-*` | 23 | `accent-*` | 22 |
| `via-*` | 11 | `ring-*` | 8 |
| `outline-*` | 4 | `divide-*` | 4 |
| `shadow-*` | 2 | | |

色票家族出現次數（不是語意分類）：

| 色票 | 次數 | 色票 | 次數 | 色票 | 次數 |
| --- | ---: | --- | ---: | --- | ---: |
| stone | 1,211 | amber | 491 | purple | 183 |
| red | 162 | emerald | 86 | cyan | 68 |
| black | 14 | transparent | 6 | slate | 6 |
| orange | 6 | sky | 5 | white | 2 |
| current | 1 | yellow | 1 | indigo | 1 |

已辨識色彩狀態變體：未加互動狀態前綴 2,044 次、`hover:` 168 次、`focus:` 13 次、`focus-visible:` 13 次、`group-hover:` 5 次。這份色彩 utility 掃描沒有找到 `disabled:` 色彩 utility；停用狀態仍常由 `opacity-*`、游標及 HTML disabled 屬性表達，遷移與驗收時仍須檢查，不能以本項零命中推論沒有停用狀態。

**其他色彩來源與掃描邊界**

| 來源 | 盤點結果 | 處理方式 |
| --- | --- | --- |
| [`src/index.css`](../src/index.css) | 5 個 hex CSS 值：surface、raised surface、border、focus、danger。 | Phase 1 統一檢視既有 token 與新語意 token 的責任，不重複定義同義變數。 |
| [`src/data.ts`](../src/data.ts) 的 `RARITY_CONFIG` | 六種稀有度各含直接色碼，另有漸層、utility 字串及 glow；這些值透過資料設定動態套用。 | 逐項確認稀有度是內容分類而非成功／危險狀態；不可將 `Artifact` 的紅色直接轉成 `destructive`。 |
| 商店詳情 [`index.tsx`](../src/routes/_protected/campaigns/$campaignId/shops/$shopId/index.tsx) 的稀有度樣式 | 樣式由稀有度設定組合，包含 inline `borderLeftColor`。 | 動態來源需逐個檢查，不由 `.tsx` 色票計數器推定已盤點完畢。 |
| Inline style | 搜尋到一個動態色彩屬性 `borderLeftColor`；另一個 inline style 僅控制負重條寬度。 | 確認動態色彩是否需要變成 token，不把非色彩樣式納入色彩數。 |
| SVG | [`react.svg`](../src/assets/react.svg) 有 1 個 hex 色值；[`vite.svg`](../src/assets/vite.svg) 有 19 個。 | 兩者是靜態品牌／範例素材，先確認是否出現在產品頁面，再決定保留例外或改色。 |
| 任意值及陰影 | 原始碼另有 `bg-[#0c0a09]` 等 hex arbitrary utility，以及含 `rgba(...)` 的 shadow arbitrary utility；未包含在上方色票計數。 | 與一般色票 class 分開盤點；背景常數應與頁面背景角色對照，陰影透明度不能誤當文字狀態色。 |
| Markdown | 色彩 utility 命中位於規劃文件與 repo 指引中的程式範例，不是 app runtime Markdown。`src/` 未發現 Markdown 內容來源。 | 文件範例不計入 JSX/TSX 基準；若未來支援使用者 Markdown，需另訂內容色彩政策。 |
| 動態 class | `.tsx` 內的完整字串會被詞面掃描；`RARITY_CONFIG` 位於 `.ts`，而 Toast／Button 等樣式映射會透過變數選用 class。 | 檢查定義端與使用端；不可在執行時拼出 Tailwind class 的片段。 |

**目前用色 → 介面用途 → 候選 token**

| 現有色票／用法 | 盤點到的用途 | 候選語意角色或基礎 token | 必須人工區分的情況 |
| --- | --- | --- | --- |
| `stone`、`slate`、`black`、`white`、`transparent`、`current` | 頁面／卡片底色、正文與輔助文字、邊框、遮罩及浮層 | `background`、`foreground`、`card`、`popover`、`muted`、`border`、`input`、`ring` | 同一個 `stone-*` 色階可同時是正文、停用文字、分隔線或表面；overlay 與透明度也需保留層級。 |
| `amber`、`orange`、`yellow` | 主要操作、焦點、金幣／稀有度等強調 | 操作為 `primary`；選取為 `accent`；焦點為 `ring`；真正警告為 `warning` | 金幣、稀有度與品牌強調不是警告；需保留名稱／圖示等非顏色線索。 |
| `emerald` | 成功狀態、私人背包／錢包相關區塊 | 成功訊息為 `success`；一般容器採 `card`／`muted` | 私人區域是產品領域而非成功狀態；不要把所有綠色 class 改成 `success`。 |
| `red` | 錯誤／危險操作、神器稀有度 | 真正錯誤或破壞性操作為 `destructive` | 稀有度紅色是內容分類，需與危險狀態分開。 |
| `purple`、`cyan`、`blue` | 魔法／DM 標記、營地箱標記、稀有度等領域辨識 | 依實際互動角色選 `accent`、`info` 或一般表面 token；不新增 `magic`／`camp` 顏色 token | 領域語意不等同訊息狀態；保留標籤、圖示、邊框等線索，逐處確認。 |
| `sky`、`indigo` | 少量標籤／強調 | 依用途選 `info`、`accent` 或一般前景 token | 命中少不代表能自動對應。 |

此表是遷移前的候選映射規則，不是逐元素核准清單。某一色票出現在多個用途時，須在 Phase 2/3 對照元件或頁面確認後才改 class；其他未列出的色票或 arbitrary 值也須先確認用途，不可直接批次替換。

**視覺基準與代表性路由**

現行主題基準為預設 BG3 暗色外觀：頁面背景 `#0c0a09`、主要文字 `text-stone-200`、容器與邊框以 stone 色階為主；公開／主要操作常見 amber，魔法／DM 標記常見 purple，私人／成功狀態常見 emerald，營地箱常見 cyan，危險操作常見 red。以上是現況參照，不代表全站每個色值均已核准映射。

| 代表路由 | 應記錄的頁面／互動狀態 | 既有 E2E 依據 |
| --- | --- | --- |
| `/login`、`/invite/:campaignId` | 登入／註冊、驗證錯誤、密碼顯示、有效及無效邀請。 | [`phase-1-baseline.spec.ts`](../tests/e2e/phase-1-baseline.spec.ts) |
| `/` | 戰役大廳、建立成功與建立失敗回饋。 | [`phase-1-baseline.spec.ts`](../tests/e2e/phase-1-baseline.spec.ts) |
| `/campaigns/:campaignId/settings` | DM／一般成員權限差異、不同設定分頁、Toast 成功／錯誤、刪除確認與取消。 | [`phase-2-settings.spec.ts`](../tests/e2e/phase-2-settings.spec.ts)、[`global-feedback.spec.ts`](../tests/e2e/global-feedback.spec.ts) |
| `/campaigns/:campaignId` | 公開／私人背包、空白戰役與營地箱、格狀／列表、搜尋／排序、錢包面板、讀取／修改權限。 | [`phase-3-inventory.spec.ts`](../tests/e2e/phase-3-inventory.spec.ts) |
| `/campaigns/:campaignId/shops/...` | 商品列表與詳細、購物車、直接購買／送審、店主設定及危險操作。 | [`campaign-shop-management.spec.ts`](../tests/e2e/campaign-shop-management.spec.ts)、[`campaign-shop-purchase.spec.ts`](../tests/e2e/campaign-shop-purchase.spec.ts) |
| `/blacksmith`、`/blacksmith/officials/:catalogId`、`/blacksmith/workshop` | 搜尋／篩選／分頁、列表／詳細、建立／編輯／匯入視窗。 | [`blacksmith.spec.ts`](../tests/e2e/blacksmith.spec.ts) |

現有 E2E 已有 375×812 的登入／邀請或背包窄螢幕檢查，以及 Toast 手機寬度檢查；背包測試驗證水平溢位。Playwright 設定目前只在失敗時保存 screenshot，沒有 `toHaveScreenshot` 視覺 golden 或固定的代表頁面截圖。本計畫採人工視覺比對，不新增像素級 screenshot golden：每次改色前後以相同路由、測試資料、viewport 與互動狀態檢視代表畫面，並同時檢查一般與窄螢幕、正常／hover／focus／disabled／錯誤等適用狀態；必要時可用瀏覽器截圖作為人工比較材料，但不要求建立或維護 golden 檔案。

**盤點狀態：** class/token 與非 JSX 色源清單、候選映射、E2E 代表頁面及人工視覺比對方式已記錄；後續色彩改動仍須依上述條件完成人工比對，並以功能測試驗證互動行為。

### Phase 1：建立 CSS variables 與 Tailwind token 映射

1. 在 [`src/index.css`](../src/index.css) 整理既有 `--color-ui-*` token，將表面、邊框、焦點與危險狀態改為既有語意 token 的相容映射。
2. 定義預設主題所需的完整基礎 token、容器/互動表面角色與狀態色，包含必要的背景/文字配對、邊框、表單欄位及焦點環。
3. 使用 Tailwind v4 `@theme inline` 將 CSS variables 映射至可用 utility；以 [`Button.tsx`](../src/components/ui/Button.tsx) 與 [`Input.tsx`](../src/components/ui/Input.tsx) 驗證 `bg-*`、`text-*`、`border-*`、`ring-*` 及透明度 modifier 的實際輸出。
4. 維持目前預設暗黑奇幻視覺；本階段只建立預設 token，不啟用主題選單、持久化或 `dnd`／`printing` 主題。

**完成條件：** token 的值集中於 CSS variables，Tailwind utility 可正常生成，預設主題外觀與互動狀態沒有非預期改變。

#### Phase 1 執行結果（2026-10-28）

**狀態：已完成。**

- 在 `:root` 建立完整預設語意 token：`background`、`foreground`、`card`、`popover`、`primary`、`secondary`、`muted`、`accent`、`success`、`destructive`、`warning`、`info`、`disabled` 及其前景配對，另含 `border`、`input`、`ring`。
- 色票以目前 BG3 暗色外觀為基準：頁面背景維持 `#0c0a09`；`card`／`input` 維持 `#1c1917`；浮層／低強調表面維持 `#292524`；邊框維持 `#44403c`；焦點環維持 `#fbbf24`。主要操作沿用 amber-700／amber-50，危險按鈕沿用 red-900／red-100，避免改變已驗證的元件配色。
- `@theme inline` 將語意變數映射為 Tailwind `--color-*` token，並保留 `ui-surface`、`ui-surface-raised`、`ui-border`、`ui-focus`、`ui-danger` 相容名稱；控制項圓角與 dropdown z-index 也保留 Tailwind token。
- Button 與 Input 作為本階段試點，以語意 utility 取代對應的固定色 utility；透明度 modifier（例如 `bg-destructive/80`、`ring-ring/40`）及 `ring-offset-background` 均已確認由 production build 生成。
- 未新增顏色家族或調整元件版面與互動；舊的 hover、錯誤及其他尚未遷移樣式維持原狀，完整共用元件遷移仍留在 Phase 2。

**確認事項與決策紀錄：** 執行前未發現需要額外產品決策的歧義，因此未向使用者提出問題。依本計畫既定方向，保留 BG3 預設暗色外觀；`dnd`、`printing` 色票與主題切換行為不屬於本階段。

**驗證結果：**

| 驗證 | 結果 |
| --- | --- |
| `npm run build` | 通過；TypeScript 與 Vite production build 成功，並確認語意 token、相容 utility、透明度及焦點 utility 有輸出。 |
| `npm run lint` | 通過，0 errors；有 1 個既有的未使用 ESLint disable warning，位於商店路由，與本次修改無關。 |
| `npm run test:e2e -- tests/e2e/phase-1-baseline.spec.ts` | 12 項通過，包含登入、大廳、建立戰役及窄螢幕檢查。執行輸出有 Realtime transport error 記錄，但未造成測試失敗。 |
| `git diff --check` | 通過。 |

### Phase 2：共用元件先行遷移

1. 先遷移 `src/components/ui/` 的 Button、Badge、Input、Select、Textarea、ConfirmDialog、Toast 等共用元件。
2. 將元件色彩 variant 統一對應至 `primary`、`secondary`、`success`、`destructive`、`warning`、`info`、`disabled`；容器與互動狀態使用 `card`、`popover`、`muted`、`accent`。產品領域標籤不另設顏色 variant，改以文字、圖示等線索區分。
3. 為主要元件驗證正常、hover、focus-visible、disabled、loading、錯誤與窄螢幕狀態。
4. 保留 `className` 的合理擴充能力，但避免它再次成為任意硬編碼色彩的逃生口。

**完成條件：** 共用元件以語意 token 為主，既有 API 與互動行為不退化，代表性狀態可辨識且文字對比足夠。

#### Phase 2 執行紀錄（2026-10-28）

已完成共用元件的語意色彩遷移，沒有變更資料流程、權限或 Supabase 行為。

- Button、Badge、Input、Select、Textarea、Checkbox、ConfirmDialog、ToastViewport、Breadcrumbs 與系統導覽列改用 `primary`、`secondary`、`card`、`popover`、`muted`、`accent`、狀態色及相關前景 token；元件內未再直接使用色階 utility。
- Button 新增語意名稱 `destructive`，保留既有 `danger` 作為相容別名。Badge 改用一般、次要、成功、危險、警告、資訊與停用狀態；`magic`、`private`、`camp` 舊領域 variant 在專案內沒有使用端，因此移除，改由標籤文字等非色彩線索表達分類。
- 保留元件 `className` 擴充介面，並更新 [`src/components/ui/README.md`](../src/components/ui/README.md)：建議只用於尺寸、間距與版面，不以硬編碼色階覆寫語意色彩。
- 未發現需要產品決策的歧義，因此沒有向使用者提出問題。

**驗證結果：**

| 驗證 | 結果 |
| --- | --- |
| `npm run typecheck` | 通過。 |
| `npm run lint` | 通過。第一次與 Playwright 同時執行時遇到測試清理目錄的競爭錯誤；測試完成後重跑通過。 |
| `npm run build` | 通過；TypeScript 與 Vite production build 成功。 |
| `npm run test:e2e -- tests/e2e/phase-2-settings.spec.ts tests/e2e/global-feedback.spec.ts` | 13 項通過，涵蓋設定表單驗證、鍵盤操作、Toast、危險確認與窄螢幕。 |
| `git diff --check` | 通過。 |
| 色彩檢查 | 共用 UI 元件與系統導覽列已無直接色階 utility；預設主題主要按鈕前景／背景對比為 4.84:1。另以桌面登入表單畫面作目視檢查，未新增 screenshot golden。 |

### Phase 3：分批遷移產品頁面

建議依使用範圍和視覺風險分批，而非一次全站替換：

1. 登入、邀請、個人資料與戰役大廳。
2. 戰役設定、角色設定及一般對話框。
3. 背包、雙錢包、角色狀態列與營地箱。
4. 商店、交易紀錄、Blacksmith 及其他長尾頁面。

每批先依照用途映射 token，再替換 class；完成後比較主要頁面與互動狀態，並執行相關 E2E、lint、typecheck 與 build。業務邏輯或資料存取不得隨色彩遷移改動。

**完成條件：** 該批頁面不再依賴直接色票 class 作為一般樣式；色彩使用核准的語意角色或基礎 token；所有指定流程通過回歸檢查。

#### Phase 3 執行紀錄（2026-10-28）

已完成四批產品頁面的語意色彩遷移，沒有更動資料流程、權限或 Supabase 行為：

- 登入、邀請、個人資料與戰役大廳。
- 戰役與角色設定、一般對話框。
- 背包、公開／私人雙錢包、角色狀態列與營地箱。
- 商店、刷新設定、交易紀錄、Blacksmith 官方目錄與工作台。
- 頁面一般背景、文字、邊框、表單、選取及錯誤／警告狀態改用已核准的語意 token；登入／邀請／大廳及戰役根容器的背景光暈改為引用 token 的 `color-mix`，不再保留原始色碼或 rgba 陰影。
- E2E 測試移除依賴 Tailwind 色階 class 的斷言，改驗證危險確認、內容可見性及既有互動結果。

**產品領域色彩決策（使用者確認）：** 移除私人背包／錢包、營地箱、DM／魔法標籤及貨幣面額的專屬色彩，以文字、圖示、中性 token 和選取狀態區分；保留稀有度顏色作為內容分類例外，包含 `RARITY_CONFIG` 動態樣式及商店列表的稀有度邊線。

**驗證結果：**

| 驗證 | 結果 |
| --- | --- |
| `npm run typecheck` | 通過。 |
| `npm run lint` | 通過；與 Playwright 並行時曾遇到 `test-results` 目錄競爭錯誤，測試結束後獨立重跑通過。 |
| `npm run build` | 通過；TypeScript 與 Vite production build 成功。 |
| `npm run test:e2e` | 73 項通過；涵蓋登入／大廳、設定、背包、商店交易與管理、Blacksmith 及窄螢幕流程。測試輸出仍有非致命 Realtime transport error 記錄，未造成斷言失敗。 |
| `git diff --check` | 通過。 |
| 色彩檢查 | 產品路由未再命中一般用途的直接 Tailwind 色階 class、硬編碼色碼或 rgba 陰影；保留稀有度動態樣式例外。 |
| 瀏覽器視覺檢查 | 桌面登入頁版面及主要按鈕前景／背景正常，主頁背景與按鈕顏色由語意 token 輸出。 |

### Phase 4：新增三套主題與主題切換能力

1. 在全部必要 token 齊備後，提供 `default`、`dnd`、`printing` 三套完整 CSS variable 值，並以根元素的 `data-theme` 屬性切換；未設定屬性時使用 `default`。
2. 主題偏好建議先作為使用者層級偏好，不與 campaign 狀態混用。若第一版不需要跨裝置同步，可先存於 localStorage；只有在明確需要登入後跨裝置同步時，再評估 profile 欄位與資料遷移。
3. 初始化時優先讀取已儲存偏好，避免頁面載入後短暫閃現另一個主題；未設定偏好時固定使用 `default`，避免作業系統外觀偏好意外覆蓋產品指定的預設黑金風格。
4. 主題控制項應可鍵盤操作、具清楚可存取名稱，且不依賴顏色本身表達目前選取狀態。
5. 確認訪客／離線模式仍可使用主題偏好；主題功能不得要求 Supabase 可用。
6. 為 `printing` 驗證實際瀏覽器列印預覽，並視需要建立 `@media print` 規則處理導覽／操作控制項隱藏、頁面分頁、背景墨水用量與避免內容被截斷；灰階 CSS variables 本身不等於完整列印支援。

**完成條件：** 能在 `default`、`dnd`、`printing` 三種風格切換，且只需改變主題屬性及變數、不需逐頁切換 class；偏好載入穩定；核心頁面、互動狀態、文字對比及列印結果皆通過驗收。

#### Phase 4 執行紀錄（2026-10-28）

已完成三套主題與切換能力，未變更戰役資料、Supabase Schema 或登入需求：

- [`src/index.css`](../src/index.css) 為 `default`、`dnd`、`printing` 提供完整語意 token；`default` 延續黑金色，`dnd` 使用羊皮紙底色與棕紅強調，`printing` 使用灰階配白底與深色文字。原生表單控制項的 `color-scheme` 也會隨主題切換。
- 根元素以 `data-theme` 套用樣式，未設定時回退至 `default`。[`index.html`](../index.html) 在 app module 載入前同步讀取偏好，避免首屏閃現其他主題；無效值會清除並記錄警告，若瀏覽器封鎖儲存，仍可使用當前工作階段的主題並記錄警告。
- [`src/contexts/ThemeContext.tsx`](../src/contexts/ThemeContext.tsx) 與 [`src/lib/themes.ts`](../src/lib/themes.ts) 管理主題狀態與識別值。偏好以 `trpg-theme` 存於 `localStorage`，屬於此瀏覽器／裝置的使用者偏好；本版不寫入 campaign 或 Supabase profile，也不提供跨裝置同步。
- [`src/components/ThemeSwitcher.tsx`](../src/components/ThemeSwitcher.tsx) 使用具可存取名稱的原生選單，支援鍵盤切換，並以目前選取的主題名稱而非色彩單獨表示狀態。切換器可在登入、邀請及已登入／訪客使用的系統導覽中操作，不依賴 Supabase；登入表單的既有鍵盤焦點順序維持不變。
- `@media print` 將列印輸出轉為黑白、移除背景與陰影，隱藏導覽及操作控制項，並避免卡片內容跨頁切斷；設定主題為 `printing` 時，可同時在螢幕預覽灰階版面。

**決策與使用者確認：** 本輪沒有需要向使用者追問的歧義，因此沒有額外的使用者答覆。因需求未提出跨裝置同步，依本計畫建議採用 `localStorage`；若未來需要登入後跨裝置同步，再另行評估 profile 欄位及資料遷移。

**驗證結果：**

| 驗證 | 結果 |
| --- | --- |
| `npm run typecheck` | 通過。 |
| `npm run lint` | 通過。 |
| `npm run build` | 通過；TypeScript 與 Vite production build 成功。 |
| `npm run test:e2e -- tests/e2e/theme-system.spec.ts` | 2 項通過；驗證鍵盤切換、重載後偏好、主題背景與 Chromium 列印媒體樣式。 |
| `npm run test:e2e -- tests/e2e/phase-1-baseline.spec.ts tests/e2e/theme-system.spec.ts` | 14 項通過；額外確認登入表單鍵盤焦點順序與既有流程未退化。 |
| `npm run test:e2e` | 75 項通過，涵蓋既有流程與新增主題測試；測試輸出仍有非致命 Realtime transport error 記錄，未造成斷言失敗。 |
| 語意文字／表面對比 | 逐一計算主要語意前景／背景配對；三主題最低值分別為 `default` 4.84:1、`dnd` 6.44:1、`printing` 10.37:1。 |
| `git diff --check` | 通過。 |

### Phase 5：防回歸與文件收尾

1. 加入 lint 或 CI 檢查，逐步禁止新增一般用途的硬編碼色階 class，並檢查元件與頁面是否只使用核准的語意角色及基礎 token。
2. 只為無法使用 token 的品牌素材或第三方元件保留明確例外；列出原因與範圍，不以新增產品專屬色彩語境作為一般解法。稀有度色彩依先前確認，作為內容分類的既有窄範圍例外。
3. 更新 UI 元件、設計 token 與新增主題的文件，說明新增 token、檢查對比及處理例外的方法。
4. 驗證代表性頁面在主題切換前後沒有水平溢位、不可辨識狀態或文字可讀性回歸。

**完成條件：** 新增介面樣式遵守核准的語意角色與基礎 token 規範；必要例外有文件說明；lint 與實際 token 保持一致。

#### Phase 5 執行紀錄（2026-10-28）

- [`scripts/audit-theme-colors.mjs`](../scripts/audit-theme-colors.mjs) 新增 `--check` 政策檢查；掃描 `src/**/*.jsx` 與 `src/**/*.tsx` 的一般 Tailwind 色票 utility 及含字面色碼的 arbitrary utility，透明、currentColor 與 inherit 不視為硬編碼色階。盤點器不解析動態 class 或 inline style，也不掃描 CSS、SVG；這些仍需人工檢視。
- [`package.json`](../package.json) 將該檢查接入 `npm run lint`，並提供 `npm run lint:theme-colors` 單獨執行。現有頁面與元件的殘留色階已改用語意 token；稀有度設定仍是已確認的內容分類例外，不加入一般 UI 色彩政策。
- [`src/components/ui/README.md`](../src/components/ui/README.md) 補充核准 token 用法、lint 執行方式、色彩對比與例外處理說明。
- 為保留跨主題一致的黑色對話框遮罩，新增不隨主題變化的基礎 `overlay` token；該 token 只代表通用遮罩層，不擴充產品領域色彩角色。
- [`tests/e2e/theme-system.spec.ts`](../tests/e2e/theme-system.spec.ts) 新增三套主題在登入及戰役設定頁的 375px 回歸檢查，量測主要文字與實際背景的 WCAG AA 一般文字對比（至少 4.5:1），並檢查水平溢位；另有既有切換、儲存、列印與主題功能測試。
- **使用者確認與決策：** 本階段沒有需要另行確認的歧義；沿用已確認的稀有度顏色例外。無需新增產品專屬色彩 token，也不改變主題色票及互動行為。

**驗證結果：**

| 驗證 | 結果 |
| --- | --- |
| `npm run lint` | 通過；ESLint 與主題色彩政策檢查均通過。 |
| 色彩政策正反向檢查 | 通過；目前 53 個 JSX/TSX 檔案中無硬編碼色彩 utility。另以暫存 JSX 樣本確認一般色票、hex 及 RGB arbitrary utility 皆會使檢查失敗；樣本已移除。 |
| `npm run typecheck` | 通過。 |
| `npm run build` | 通過；Vite production build 成功。 |
| `npm run test:e2e` | 76 項通過；包含三套主題於登入與戰役設定頁的 375px 溢位與一般文字 4.5:1 對比檢查。輸出仍有非致命 Realtime transport error 記錄，未造成測試失敗。 |
| `git diff --check` | 通過。 |

## 驗收與注意事項

- **不可只做字串取代：** `text-stone-200` 可能是正文、輔助文字、停用狀態或產品標記；每項應先判定用途。
- **完整涵蓋 Tailwind variants：** 遷移需包含 `hover:`、`focus:`、`focus-visible:`、`disabled:`、`group-hover:`、透明度 modifier、漸層與響應式 class，避免只替換基本狀態。
- **檢查動態 class：** Tailwind 需要能靜態辨識使用到的 utility。若 class 由字串拼接或資料決定，應使用完整且明確的映射表，避免執行時才組合出未生成的 class。
- **檢查非 Tailwind 色彩來源：** inline styles、SVG、圖示、第三方元件、Markdown 與瀏覽器原生表單外觀，可能不會自動跟隨 CSS variables。
- **對比與非色彩提示：** 檢查一般文字、輔助文字、按鈕、焦點環、錯誤與停用狀態；權限或危險狀態不能只靠色相區分，還應保留文字、圖示或其他提示。
- **主題變數需完整：** `default`、`dnd`、`printing` 避免漏掉某個 token 後靜默回退到不相容的顏色；各主題應具備同一份必要 token 清單。列印主題還應檢查列印樣式是否保留可辨識的文字、邊框與資訊層級，並在瀏覽器列印預覽中實際驗證版面。
- **管理 `dark:` 與硬編碼值：** 遷移至單一語意 token 後，檢視既有 `dark:` 樣式是否仍有必要，避免同一元素同時由 CSS variable 與獨立色階控制。
- **先保留預設外觀：** 語意化是結構改造，不應順便更動色票、間距或元件互動；視覺改版應另立明確需求。
- **測試重點：** 以共用元件狀態、登入／大廳、戰役設定、背包和商店等代表性頁面作視覺回歸；自動化測試優先斷言語意與互動，避免綁定 Tailwind class。

## 建議的最小第一步

先執行 Phase 0，然後只遷移 `src/index.css` 的 token 與少量共用元件作為試點；確認 Tailwind v4 的 CSS variable 映射、透明度與各狀態表現符合預期，再決定後續頁面批次。不要先安裝 UI 套件，也不要一開始就全站搜尋取代。
