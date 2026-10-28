# 網站語意色彩與主題切換規劃

## 目標與範圍

將介面中直接指定色相的 Tailwind class（例如 `bg-stone-950`、`text-amber-200`）逐步改為代表用途的語意 class（例如 `bg-background`、`text-foreground`、`bg-primary`、`text-primary-foreground`），並將語意色彩集中定義為 CSS variables。未來切換主題時，只需套用另一組變數，不必在頁面逐處替換顏色。

本計畫處理的是色彩設計 token 與 UI class 遷移，不包含本階段實作主題選單、主題持久化或整站重設計。頁面布局、資料流程、權限與 Supabase Schema 均不在範圍內。

## 現況盤點

- 專案使用 Tailwind CSS v4，樣式入口為 [`src/index.css`](../src/index.css)，目前已有 `--color-ui-surface`、`--color-ui-border`、`--color-ui-focus`、`--color-ui-danger` 等少量 token。
- 專案已有自建的 [`src/components/ui/`](../src/components/ui) 元件，以及 `Button`、`Badge` 等共用樣式；目前 variant 仍直接使用 amber、stone、purple、emerald、cyan、red 等色階。
- 以 Tailwind 色彩 class 的靜態搜尋盤點，約有 1,244 處命中、分布於 47 個來源檔案。此數字是遷移規模估算，不是精確的唯一 class 數量；應在正式遷移前以 AST 或 lint 工具建立更精確、可重複的基準。
- 高度客製的背包、物品提示、商店與 Blacksmith 介面比例高，不宜用全域搜尋取代判斷；相同色階在不同頁面可能代表不同意義。

## 建議決策

### 不必為主題化另外引入 shadcn/ui

建議採用 shadcn/ui 常見的語意 token 命名方式與 CSS variables 作法，但不因主題切換需求而安裝整套 shadcn/ui 或另一套 UI framework。

原因：

- shadcn/ui 的價值主要在可複製的元件與互動模式；CSS variables 主題化本身不需要它。
- 專案已有自建共用元件，且既有 UI 元件規劃已採用逐步封裝的方向。此處直接將既有元件改為使用語意 token，較不會造成元件重複或 UI 風格不一致。
- 如果日後需要 Dialog、Dropdown、Tabs 等複雜互動元件，可依 [`docs/ui-component-refactor-plan.md`](./ui-component-refactor-plan.md) 的既有建議，針對實際需求選用 primitives；這與引入主題系統是兩個獨立決策。

### 以語意用途命名，而非把色票換一個名字

建議先定義一組中性基礎 token：

| Token | 用途例子 |
| --- | --- |
| `background` / `foreground` | 頁面底色與主要文字 |
| `card` / `card-foreground` | 卡片、面板及其文字 |
| `popover` / `popover-foreground` | 選單、浮層、提示框 |
| `primary` / `primary-foreground` | 主要操作與其文字 |
| `secondary` / `secondary-foreground` | 次要操作與其文字 |
| `muted` / `muted-foreground` | 次要表面、輔助文字、停用資訊 |
| `accent` / `accent-foreground` | 一般互動強調狀態 |
| `destructive` / `destructive-foreground` | 刪除、危險操作與錯誤操作 |
| `border`、`input`、`ring` | 邊框、表單欄位、鍵盤焦點環 |

例如 `bg-primary text-primary-foreground` 描述的是主要操作的背景與對比文字，不代表固定的琥珀色。所有主題都應提供完整 token，並維持文字與背景的足夠對比。

在 Tailwind CSS v4 中，建議由 CSS variables 提供主題值，再透過 `@theme inline` 將其暴露為 Tailwind utilities。概念示例：

```css
:root {
  --background: /* 預設主題頁面底色 */;
  --foreground: /* 預設主題主要文字 */;
  --primary: /* 預設主題主要操作底色 */;
  --primary-foreground: /* 預設主題主要操作文字 */;
}

[data-theme='alternate'] {
  --background: /* 替代主題頁面底色 */;
  --foreground: /* 替代主題主要文字 */;
  --primary: /* 替代主題主要操作底色 */;
  --primary-foreground: /* 替代主題主要操作文字 */;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
}
```

實際 token 命名、預設主題與數值應在設計 token 階段定稿；以上僅示意映射關係，不是完整色票。

### 將產品語意色與一般主題表面分開

琥珀金、秘法紫、翠綠、青色與危險紅色不只是裝飾，也承載產品領域資訊。建議將它們整理為第二層「狀態／產品語意 token」，例如 `magic`、`private`、`camp`、`success`、`warning`、`destructive`，並為所需的背景、文字、邊框分別提供 token。切換主題時可以調整各組色值，但不可讓語意混淆。

以下差異必須保留：

- `primary` 表示一般主操作；不應直接等同所有琥珀色使用場景。
- `magic`、`private`、`camp` 分別代表魔法、私人暗袋與營地儲物箱識別，不應因為色彩重配而失去區辨。
- `destructive` 只用於危險操作或錯誤狀態；其語意及可辨識度應跨主題保持一致。
- 中性色的 `muted` 不應取代所有次要資訊；需要保留的權限、狀態或產品辨識仍應使用具名語意 token。

## 分階段執行

### Phase 0：建立可驗收的色彩盤點

1. 以程式化方式統計 JSX/TSX 中實際使用的顏色 class，區分背景、文字、邊框、ring、漸層、透明度、hover/focus/disabled 等狀態。
2. 另行盤點 CSS、SVG、inline style、Markdown 內容與動態 class 組合中的硬編碼顏色；靜態 Tailwind 搜尋無法涵蓋所有來源。
3. 建立「目前用色 → 介面用途 → 目標 token」對照表。遇到同一色彩對應多個用途時，逐個確認語意，不可自動一對一替換。
4. 記錄目前路由、互動狀態與窄螢幕的視覺基準；沿用既有 Playwright E2E 基礎設施，必要時補充代表性頁面的主題視覺檢查。

**完成條件：** 有可檢查的 class/token 使用清單、重要狀態清單及代表性頁面清單，且能辨識需保留的領域色彩。

### Phase 1：建立 CSS variables 與 Tailwind token 映射

1. 在 `src/index.css` 整理既有 `--color-ui-*` token，決定哪些延伸為通用語意 token，哪些保留為元件基礎 token。
2. 定義預設主題所需的完整中性色與互動狀態色，包含背景/文字配對、邊框、表單欄位、焦點環、選取、停用及危險狀態。
3. 使用 Tailwind v4 `@theme inline` 將 CSS variables 映射至可用 utility；先以少量共用元件驗證 `bg-*`、`text-*`、`border-*`、`ring-*` 與透明度 modifier 的實際輸出。
4. 維持目前預設暗黑奇幻視覺，不在 token 基礎建置階段更動現行設計。

**完成條件：** token 的值集中於 CSS variables，Tailwind utility 可正常生成，預設主題外觀與互動狀態沒有非預期改變。

### Phase 2：共用元件先行遷移

1. 先遷移 `src/components/ui/` 的 Button、Badge、Input、Select、Textarea、ConfirmDialog、Toast 等共用元件。
2. 將色彩 variant 對應到穩定的語意 API；共用元件保留明確的 danger、magic、private、camp 等領域 variant，不讓呼叫端直接指定色票。
3. 為主要元件驗證正常、hover、focus-visible、disabled、loading、錯誤與窄螢幕狀態。
4. 保留 `className` 的合理擴充能力，但避免它再次成為任意硬編碼色彩的逃生口。

**完成條件：** 共用元件以語意 token 為主，既有 API 與互動行為不退化，代表性狀態可辨識且文字對比足夠。

### Phase 3：分批遷移產品頁面

建議依使用範圍和視覺風險分批，而非一次全站替換：

1. 登入、邀請、個人資料與戰役大廳。
2. 戰役設定、角色設定及一般對話框。
3. 背包、雙錢包、角色狀態列與營地箱。
4. 商店、交易紀錄、Blacksmith 及其他長尾頁面。

每批先依照用途映射 token，再替換 class；完成後比較主要頁面與互動狀態，並執行相關 E2E、lint、typecheck 與 build。業務邏輯或資料存取不得隨色彩遷移改動。

**完成條件：** 該批頁面不再依賴直接色票 class 作為一般表面樣式；產品領域色仍由具名語意 token 控制；所有指定流程通過回歸檢查。

### Phase 4：新增替代主題與主題切換能力

1. 在全部必要 token 齊備後，為替代主題提供另一套完整 CSS variable 值，並以根元素的 `data-theme` 屬性切換。
2. 主題偏好建議先作為使用者層級偏好，不與 campaign 狀態混用。若第一版不需要跨裝置同步，可先存於 localStorage；只有在明確需要登入後跨裝置同步時，再評估 profile 欄位與資料遷移。
3. 初始化時優先讀取已儲存偏好，避免頁面載入後短暫閃現另一個主題。未設定偏好時，可依產品決策使用固定預設值或跟隨 `prefers-color-scheme`。
4. 主題控制項應可鍵盤操作、具清楚可存取名稱，且不依賴顏色本身表達目前選取狀態。
5. 確認訪客／離線模式仍可使用主題偏好；主題功能不得要求 Supabase 可用。

**完成條件：** 切換主題時只需改變主題屬性及變數，不需逐頁切換 class；偏好載入穩定；核心頁面、互動狀態與文字對比在各主題皆通過驗收。

### Phase 5：防回歸與文件收尾

1. 加入 lint 或 CI 檢查，逐步禁止新增一般用途的硬編碼色階 class；保留少數明確核准的特例及產品語意 token。
2. 將例外列入 allowlist 或提供可說明用途的具名 utility/token，不要用全面禁用規則迫使開發者繞過 lint。
3. 更新 UI 元件、設計 token 與新增主題的文件，說明新增 token、檢查對比及處理例外的方法。
4. 驗證代表性頁面在主題切換前後沒有水平溢位、不可辨識狀態或文字可讀性回歸。

**完成條件：** 新增介面樣式有清楚的語意 token 使用規範；lint 不阻礙必要的產品特例；文件與實際 token 保持一致。

## 驗收與注意事項

- **不可只做字串取代：** `text-stone-200` 可能是正文、輔助文字、停用狀態或產品標記；每項應先判定用途。
- **完整涵蓋 Tailwind variants：** 遷移需包含 `hover:`、`focus:`、`focus-visible:`、`disabled:`、`group-hover:`、透明度 modifier、漸層與響應式 class，避免只替換基本狀態。
- **檢查動態 class：** Tailwind 需要能靜態辨識使用到的 utility。若 class 由字串拼接或資料決定，應使用完整且明確的映射表，避免執行時才組合出未生成的 class。
- **檢查非 Tailwind 色彩來源：** inline styles、SVG、圖示、第三方元件、Markdown 與瀏覽器原生表單外觀，可能不會自動跟隨 CSS variables。
- **對比與非色彩提示：** 檢查一般文字、輔助文字、按鈕、焦點環、錯誤與停用狀態；權限或危險狀態不能只靠色相區分，還應保留文字、圖示或其他提示。
- **主題變數需完整：** 避免替代主題漏掉某個 token 後靜默回退到不相容的顏色；各主題應具備同一份必要 token 清單。
- **管理 `dark:` 與硬編碼值：** 遷移至單一語意 token 後，檢視既有 `dark:` 樣式是否仍有必要，避免同一元素同時由 CSS variable 與獨立色階控制。
- **先保留預設外觀：** 語意化是結構改造，不應順便更動色票、間距或元件互動；視覺改版應另立明確需求。
- **測試重點：** 以共用元件狀態、登入／大廳、戰役設定、背包和商店等代表性頁面作視覺回歸；自動化測試優先斷言語意與互動，避免綁定 Tailwind class。

## 建議的最小第一步

先執行 Phase 0，然後只遷移 `src/index.css` 的 token 與少量共用元件作為試點；確認 Tailwind v4 的 CSS variable 映射、透明度與各狀態表現符合預期，再決定後續頁面批次。不要先安裝 UI 套件，也不要一開始就全站搜尋取代。
