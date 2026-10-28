# 共用 UI 元件

從 `@/components/ui` 匯入共用元件。元件提供一致的語意色彩、焦點狀態與原生 HTML 屬性；`className` 適合調整尺寸、間距或版面，不應用硬編碼色階覆寫元件的語意色彩。

新增元件或頁面樣式時，請使用 `src/index.css` 定義的語意角色（例如 `bg-primary`、`text-muted-foreground`、`border-border`）或基礎 token（例如 `bg-background`、`ring-ring`），不要新增 `bg-stone-900`、`text-amber-200` 等固定色階。`npm run lint` 會執行 `scripts/audit-theme-colors.mjs --check`，並阻擋 JSX/TSX 中新增的色票及字面色碼 arbitrary utility。若有無法以 token 表達的視覺需求，先記錄例外理由及範圍，再調整檢查政策；不要以新增產品專屬色彩 token 代替用途分類。

`text-highlight` 用於小標題與段落內的強調文字；`text-money` 用於 GP 金額。兩者會依 `default`、`dnd` 與 `printing` 主題切換色彩。

`RARITY_CONFIG` 的物品稀有度顏色與商店稀有度邊線是既有內容分類例外，保留其獨立顏色辨識，並由規劃文件記錄；一般 UI 狀態仍須使用語意 token。盤點器只掃描 JSX/TSX 原始碼，無法解析執行期組合 class，也不涵蓋 inline style、CSS、SVG 或第三方元件，這些來源仍需在變更審查時人工檢查。

```tsx
import { Badge, Button, Checkbox, Input, Select, Textarea } from '@/components/ui';
import { useConfirm, useToast } from '@/contexts/FeedbackContext';
```

全域操作回饋由 `FeedbackProvider` 提供，已安裝於應用程式 Router 上層。非同步操作結果可透過 `useToast()` 顯示通知；單一二元決策使用 `useConfirm()`，其 Promise 在確認時回傳 `true`，取消或按 Escape 時回傳 `false`。欄位驗證與需要持續查看的錯誤仍應留在操作區域。

```tsx
const toast = useToast();
const confirm = useConfirm();

toast.success('角色資料已儲存。');
if (await confirm({ title: '刪除角色', message: '角色與相關資料將被移除。', variant: 'danger' })) {
	// 執行已確認的操作
}
```

## Button

`variant` 可選 `primary`（主要操作，預設）、`secondary`（次要操作）、`destructive`（危險操作）、`danger`（相容舊呼叫的危險操作別名）或 `ghost`（低強度操作）。`size` 可選 `sm`、`md`（預設）或 `lg`。原生按鈕屬性均可使用；按鈕預設 `type="button"`，提交表單時請明確指定 `type="submit"`。

```tsx
<Button type="submit" variant="primary" size="md" loading={saving}>
	儲存變更
</Button>
<Button type="button" variant="destructive" onClick={handleDelete}>
	刪除
</Button>
```

`loading` 會顯示處理中狀態並停用按鈕。`asChild` 可將按鈕樣式套用到單一連結等子元素，並保留子元素原有的 class：

```tsx
<Button asChild variant="secondary">
	<Link to="/">返回大廳</Link>
</Button>
```

## Input 與 Textarea

兩者支援原生欄位屬性，以及 `label`、`description`、`error`、`containerClassName`。`label` 會自動關聯欄位；`description` 與 `error` 會加入欄位的 `aria-describedby`，錯誤訊息也會以 alert 呈現。需要自訂欄位外觀時使用 `className`；Input 另提供 `labelClassName`。

```tsx
<Input
	label="角色名稱"
	value={name}
	onChange={(event) => setName(event.target.value)}
	error={name.trim() ? undefined : '請輸入角色名稱。'}
	required
/>

<Textarea label="物品描述" description="支援 Markdown。" />
```

## Select 與 Checkbox

`Select` 支援原生 `<select>` 屬性與 `label`，並提供 `labelClassName`、`containerClassName` 和 `className` 樣式擴充。

```tsx
<Select label="角色權限" value={access} onChange={handleAccessChange}>
	<option value="0">無權限</option>
	<option value="1">僅閱讀</option>
	<option value="2">閱讀與修改</option>
</Select>
```

`Checkbox` 的 `label` 為必要屬性，並接受原生 checkbox 屬性（不需、也不可傳入 `type`）；`labelClassName` 與 `className` 分別設定外層標籤和核取方塊。

```tsx
<Checkbox
	label="允許修改角色資料"
	checked={canEdit}
	onChange={(event) => setCanEdit(event.target.checked)}
/>
```

## Badge

`Badge` 是非互動狀態標記，支援 `default`（主要強調，預設）、`secondary`、`success`、`destructive`、`warning`、`info` 與 `disabled`，並保留原生 `span` 屬性。領域分類（例如私人、魔法物品或營地箱）應以標籤文字、圖示等線索表達，不使用專屬顏色 variant。

```tsx
<Badge variant="success">已完成</Badge>
<Badge variant="info">需要鑑定</Badge>
```

互動元件應保留可見鍵盤焦點，表單控制項需有可存取標籤；E2E 測試優先使用角色、標籤與可見名稱定位互動，不以 Tailwind class 或 DOM 階層定位。
