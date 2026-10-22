# 專案指引

## 專案概況

本專案是以 D&D 5R（2024）規則為核心、採《博德之門 3》風格的戰役背包管理網站。前端使用 Vite、React、TypeScript、Tailwind CSS v4 與 TanStack Router；Supabase 提供驗證、PostgreSQL 資料儲存及 Realtime 同步。未設定 Supabase 環境變數時，應用程式可使用訪客／單機模式。

## 架構與慣例

- 請以繁體中文回覆，新增或修改的程式碼註解也使用繁體中文。
- `src/types.ts` 是共用領域型別與物品分類／堆疊判斷函式的來源；新增或調整物品欄位時，檢查所有相關轉換和 UI 使用處，並維持型別一致。
- `src/data.ts` 保存預設角色、物品與規則顯示資料。
- `src/routes/` 採 TanStack Router 檔案式路由；戰役背包頁位於 `src/routes/_protected/campaigns/$campaignId/index.tsx`，頁面組合主要元件並管理戰役畫面狀態。
- `src/components/` 放置畫面元件；`src/hooks/useInventoryActions.ts` 集中處理背包操作，`src/hooks/useCampaignSync.ts` 管理初始資料載入、樂觀更新與 Supabase Realtime 訂閱。
- `src/lib/supabase.ts` 負責 Supabase client 與資料庫 `snake_case` 欄位和前端 `camelCase` 型別之間的轉換。新增資料欄位時，同步檢查資料庫型別與雙向轉換。
- 背包展示模式目前為 `grid6`、`grid`、`list`；物品區塊由 `getItemSection()` 與 `resolveItemFlags()` 判定。沿用現有輔助函式，不要另寫互相矛盾的分類規則。
- 遵循周邊程式碼既有的 TypeScript、React、Tailwind 與 ESLint 風格；不要為了方便弱化型別。
- Supabase 設定透過 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY` 提供，不要將憑證寫入程式碼。

## 驗證

- `npm run typecheck`：TypeScript 型別檢查。
- `npm run lint`：ESLint 檢查。
- `npm run build`：型別檢查與正式建置。

修改後執行與變更範圍相符的最小驗證命令；若未執行或驗證失敗，請在回覆中明確說明。
