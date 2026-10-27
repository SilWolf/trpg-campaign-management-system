# 全域 Toast 與 Confirm Dialog 規劃書

## 目標

建立一套全域、可存取且符合目前暗黑奇幻介面的操作回饋元件，供所有路由與共用元件一致使用：

1. **Toast**：短暫回報操作成功、警告、一般資訊或非欄位型錯誤。
2. **Confirm Dialog**：以應用程式內的非同步確認介面取代 `window.confirm`，呈現清楚的動作語意與危險程度。
3. **逐步取代分散的操作通知**：將大部分非同步操作完成或失敗後的頁面內通知改用全域 Toast；保留需要留在操作位置的表單驗證、登入狀態及長期重要訊息。

目前進度：Phase 1「建立共用基礎」已完成；Phase 2 與 Phase 3 尚未開始。本次未遷移現有頁面通知或 `window.confirm`，亦未執行 Supabase Schema、Edge Function 或部署變更。

## 現況盤點

- 專案尚未安裝 Toast 或 Dialog 套件；目前已有 React 19、Tailwind CSS v4、Lucide React 與原生 HTML `<dialog>` 可供實作。
- 背包頁自行以 `toastMessage`、`showToast` 和 `setTimeout` 實作三秒提示，並將 `showToast` 傳給 `useInventoryActions`。提示只會在背包頁出現。
- 大廳、個人資料、鍛造工坊、商店交易、戰役設定及商店刷新等介面，另有各自的 `notice`／`errorMessage` 狀態；部分成功訊息自行計時清除，部分則留在原頁面。
- 登入／註冊、邀請註冊、資料載入、權限或欄位檢查會使用頁面內錯誤／提示狀態。這些訊息與操作結果不同，不應不加區分地轉成自動消失的 Toast。
- `window.confirm` 出現在角色刪除、戰役刪除、角色所有權轉移等具破壞性或重要後果的操作。
- 商店結帳、商店刷新預覽與刪除刷新規則等使用原生 `<dialog>` 或客製化流程。它們包含表單、預覽或多步驟互動，不應為追求統一而一律改成 Confirm Dialog。
- 全域入口為 `src/main.tsx`，根路由為 `src/routes/__root.tsx`。目前 E2E 以 Playwright 執行，沒有另設單元測試 runner。

## 設計決策

### 不新增第三方套件

第一版以 React Context、Tailwind、Lucide 及 HTML `<dialog>` 實作，不安裝新套件。現有依賴已能滿足需求，並可避免新增套件對焦點管理、CSS、建置與版本維護的負擔。若實作期間發現原生 Dialog 在目標瀏覽器或可存取性測試中無法滿足需求，再提出套件選型，不預先引入依賴。

### 共用 Feedback Provider

新增共用 Feedback 模組，集中管理 Toast 清單、計時器、Confirm 請求佇列與顯示中的確認對話框，並提供兩個有明確型別的 Hook：

- `useToast()`：取得成功、錯誤、警告、資訊及手動關閉 Toast 的 API。
- `useConfirm()`：呼叫後回傳 `Promise<boolean>`，由使用者確認時回傳 `true`，取消、按 Escape、關閉或 Provider 卸載時回傳 `false`。

Hook 在 Provider 外使用時應明確拋出錯誤，不提供成功形狀的預設值。Confirm 一次只顯示一個請求；多個同時送出的請求依序處理，以免對話框互相覆蓋或錯誤解析 Promise。Provider 卸載時須清除所有計時器，並完成／取消尚未處理的確認請求，避免懸置的非同步流程。

在 `src/main.tsx` 將 Provider 掛於 Router 上層，讓根路由、受保護路由及登入／邀請流程都能使用；Provider 本身不依賴 Auth 或 Supabase Context。共用的 Toast 容器與 Confirm Dialog 由 Provider 一次渲染。

## 元件與 API 規格

### Toast

建議使用具名方法或受限的種類欄位，不以任意樣式字串控制外觀：

```ts
type ToastKind = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  description?: string;
  duration?: number;
}

interface ToastApi {
  success(message: string, options?: ToastOptions): void;
  error(message: string, options?: ToastOptions): void;
  warning(message: string, options?: ToastOptions): void;
  info(message: string, options?: ToastOptions): void;
  dismiss(id: string): void;
}
```

呈現與行為：

- 成功、一般資訊及警告使用有限時間後自動關閉；錯誤可使用較長預設時間，並允許使用者手動關閉。
- 同一時間限制可見數量並採新訊息優先，避免批次操作或重複觸發時遮滿畫面；新增訊息不可靜默丟棄，超出顯示數量時以佇列補位。
- 使用單一固定容器，桌面與手機皆不遮住主要操作；配置足夠的 `z-index`，但不得阻擋 Toast 以外的互動。
- 採用既有 stone 背景與邊框，成功使用 emerald、錯誤使用 red、警告使用 amber、資訊使用 stone／cyan；圖示以 Lucide 表達，訊息文字不依賴 emoji 才能辨識種類。
- Toast 容器使用適當的 `aria-live`（成功／資訊採 polite，錯誤視情況採 assertive）、`role="status"`／`role="alert"` 及可存取的關閉名稱；不因圖示重複朗讀內容。
- 支援 `prefers-reduced-motion`，不使用現有背包提示的彈跳動畫作為全域預設。
- 一般表單欄位錯誤仍在欄位旁顯示，不以 Toast 取代；資料載入失敗若需要持續查看或重試，保留頁面錯誤區塊。

### Confirm Dialog

建議 API：

```ts
type ConfirmVariant = 'default' | 'danger';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
```

呈現與行為：

- 使用 `<dialog>` 與 `showModal()`，沿用專案既有的原生 Modal 作法，提供模態焦點限制、背景遮罩及 Escape 取消行為。
- 預設按鈕焦點放在「取消」，降低破壞性操作誤觸；確認後才執行呼叫端的非同步操作。
- `danger` 使用 red 色系及明確動詞（例如「永久刪除戰役」），正文描述不可逆後果；一般確認使用 amber／stone。
- 確認按鈕被點選後立即進入忙碌狀態並停用重複提交；此忙碌狀態由 Dialog 或呼叫端控制，確保 Promise 只結算一次。
- 對話框標題、訊息和按鈕名稱具備可存取語意；點擊遮罩視為取消，不得視為確認。
- 確認只負責收集使用者意願；資料操作、權限檢查、錯誤處理仍留在呼叫端。成功／失敗結果另由 Toast 或必要的頁面錯誤區呈現。

## 遷移範圍與分類

### 優先改用全域 Toast

遷移使用者主動操作後的非同步結果提示，並同步移除對應的區域狀態與重複的計時器：

| 領域 | 規劃遷移的回饋 |
| --- | --- |
| 背包與角色操作 | 既有 `showToast`（裝備、物品與貨幣操作、複製詞條、角色編輯等）改由 `useToast()` 提供；移除背包頁自有 Toast state、計時器與手動傳遞的 `showToast` 依賴。 |
| 戰役大廳 | 建立／加入戰役與登出等操作結果改用 Toast；輸入邀請碼或建立表單的驗證錯誤仍留在表單內。 |
| 個人資料 | 儲存成功使用全域成功 Toast；更新失敗以全域錯誤 Toast 回饋，必要時仍保留頁面錯誤區避免使用者失去脈絡。 |
| 鍛造工坊與黑鐵匠匯入 | 保存、更新、刪除、匯入的操作結果使用 Toast；載入中、目標選擇、輸入格式及匯入前置條件錯誤維持在原操作區。 |
| 商店購買與交易 | 購買、結帳、訂單處理成功及失敗使用 Toast；「交易已成立但重新載入失敗」必須保留交易已成功的明確資訊，不可顯示成交易失敗。錢包不足等結帳前驗證錯誤留在結帳區。 |
| 商店刷新與設定 | 刷新結果、政策保存／刪除等操作結果使用 Toast；刷新預覽、套用前錯誤及會影響下一步決策的重要內容維持對話框／頁面內顯示。 |
| 戰役與角色設定 | 邀請、儲存、權限、角色及設定等已完成操作的成功／失敗結果使用 Toast；重要失敗或需立即修正的表單驗證仍保留原位。 |

遷移原則為「一次操作只呈現一個主要結果」，避免同一事件同時出現在全域 Toast 與原頁面的 `notice`／`errorMessage`。若原提示包含下一步必要資訊或需要使用者持續閱讀，應留在原位，不為了減少區域狀態而改成短暫提示。

### 優先改用全域 Confirm Dialog

以 `await confirm({...})` 取代所有 `window.confirm`，至少包含：

1. 刪除角色並將遺物及錢包移入營地箱。
2. 永久刪除戰役及其相關資料。
3. 轉移角色擁有權並移除原擁有者的權限設定。

另外盤點具不可逆或高影響後果的刪除／重設操作，確認是否應採用同一 Confirm API。既有商店刷新規則確認、空結果刷新二次確認等具有專屬狀態或預覽的流程，可以保留為局部 Dialog；如能完整映射為單一二元決策，再評估改用共用 Confirm，避免削弱目前的預覽或二次確認行為。建立戰役、加入戰役、結帳等有欄位、選項或多步驟內容的 Dialog 不屬於 Confirm Dialog 遷移範圍。

## 實作階段

### Phase 1：建立共用基礎

- [x] 新增 Provider、Toast 容器／項目、Confirm Dialog 與 Context Hook：`src/contexts/FeedbackContext.tsx`、`src/components/ui/ToastViewport.tsx`、`src/components/ui/ConfirmDialog.tsx`。
- [x] 在 `src/main.tsx` 將 Provider 安裝於 Auth 與 Router 上層，所有路由均可呼叫共用 Hook；Provider 不依賴 Auth 或 Supabase Context。
- [x] 實作 Toast 三則可見上限、新訊息排隊、各種類型逾時與手動關閉、計時器卸載清理。
- [x] 實作 Confirm 請求序列化、Escape／遮罩取消、取消優先焦點、重複點擊防護及 Provider 卸載時將所有待處理 Promise 結算為 `false`。
- [x] 加入 Toast live region、明確關閉按鈕標籤、Confirm 標題／訊息語意、取消按鈕預設焦點、原生 Escape／鍵盤操作與 reduced-motion 樣式；原有表單錯誤未遷移。
- [x] 在 `src/components/ui/README.md` 記錄共用 Hook 的使用方式與回饋分類原則。
- 驗證結果：`npm run typecheck` 通過；`npm run lint` 通過（0 errors，另有既存的 `$shopId.tsx` 未使用 ESLint disable 警告）；`npm run build` 通過；`npm run test:e2e` 通過（63 項）。全域回饋專屬的可重複 E2E 情境仍列於 Phase 3。

### Phase 2：遷移現有 Toast 與 Confirm

- 先遷移背包頁和 `useInventoryActions`，驗證 Hook 型別、元件呈現與營地箱操作通知。
- 再依「戰役大廳／個人資料 → 鍛造工坊／黑鐵匠匯入 → 商店／戰役設定」遷移操作結果。
- 移除被完整取代的區域 `notice`／`message` state 與逾時清除邏輯；仍有載入或驗證用途的 state 不一併刪除。
- 將三個角色／戰役重要操作的 `window.confirm` 改成 Promise API，保證取消路徑不執行原操作。
- 搜尋全專案殘留的 `showToast`、成功結果區域通知及 `window.confirm`，逐筆確認其用途及是否應遷移；不做無條件字串取代。

### Phase 3：回歸與收尾

- 補上可重複操作的 Playwright E2E 情境，並更新受影響測試的可存取角色／可見文案定位。
- 以型別檢查、Lint、建置及相關 E2E 驗證改動。
- 更新相關元件文件或測試說明；維持 Supabase 同步、RLS、Realtime 及交易語意不變。

## 驗收標準

### Toast

- 從任一頁面呼叫 Hook 都能在同一全域容器顯示正確種類與內容。
- 顯示時限到期、手動關閉、新訊息佇列及多訊息上限行為一致，元件卸載後沒有殘留計時器。
- 操作成功只顯示一次成功提示；錯誤使用錯誤語意；載入狀態和欄位驗證沒有被誤轉為自動消失提示。
- 鍵盤及螢幕閱讀器可辨識提示內容和關閉按鈕，窄螢幕沒有水平溢位或遮住主要操作。

### Confirm

- 確認時 Promise 僅回傳一次 `true` 並執行操作；取消、Escape、遮罩關閉均回傳 `false` 且不執行操作。
- 預設焦點在取消按鈕，危險操作的標題、後果與確認按鈕可明確區分。
- 連續請求依序顯示；重複點擊不會重複執行；卸載時所有等待中的呼叫都能結束。
- 角色刪除、戰役刪除及角色擁有權轉移的取消路徑與原本一致，確認後仍走既有資料更新路徑。

### 回歸驗證

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`，以及新增／更新的全域回饋與確認流程 E2E 情境。

## 主要風險與對策

| 風險 | 對策 |
| --- | --- |
| 把必要錯誤短暫顯示後自動隱藏，造成使用者無法修正 | 表單驗證、載入／持續性失敗及需參照的預覽維持原位；Toast 只處理操作結果。 |
| 多次呼叫或快速連點造成提示重疊、確認 Promise 遺失 | Toast 限量並排隊；Confirm 序列化、單次結算並在 Provider 卸載時取消。 |
| 錯誤提示被誤認為操作未成功 | 對部分成功情境分開描述，例如交易已成立但重新載入失敗；不覆蓋或淡化業務結果。 |
| 全域元件與頁面通知重複 | 每個遷移點只保留一種主要呈現，並移除已無其他用途的區域狀態。 |
| 共用 Confirm 破壞既有多步驟 Dialog | 僅遷移二元確認；保留表單、預覽、結帳及刷新專屬流程。 |
| 背景工作與通知出現時機不一致 | 由呼叫端在實際操作成功或失敗的邊界發送 Toast，不在資料同步 Hook 中推測使用者意圖或顯示通知。 |
