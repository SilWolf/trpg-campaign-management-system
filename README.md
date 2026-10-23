# D&D 5R (2024) 戰役背包管理系統 (BG3 Style Inventory)

專為 D&D 5R (2024 新規則) 跑團設計的《博德之門3》風格暗黑奇幻風角色背包與戰利品管理工具。

## 核心功能

- **BG3 視覺風格**：支援稀有度發光邊框（普通、非普通、稀有、極珍稀、傳奇、神器）與動態懸停資訊卡。
- **D&D 5R 規則支援**：內建 2024 版武器精通（Weapon Mastery）規則說明、同調欄位（上限 3 格）與負重計算（STR × 15 lbs）。
- **硬幣與公基金系統**：支援 PP / GP / EP / SP / CP 五種貨幣、50 枚硬幣計重規則開關與一鍵換整金幣。
- **DM 上帝視角與未鑑定機制**：支援隱藏未鑑定魔法物品真實屬性與 DM 專屬詛咒筆記，並內建自創道具（Homebrew）鍛造工坊。

## 本地開發啟動

```bash
npm install
npm run dev
```

## TypeScript 檢查與建置

```bash
npm run typecheck
npm run build
npm run lint
npm run test:e2e
```

應用程式入口與 React 元件使用 TypeScript (`.ts` / `.tsx`)，嚴格型別檢查已納入正式建置流程。
以上指令是日常驗證項目；E2E 測試使用隔離的 Supabase 替身，無須連接正式服務。

## Playwright E2E 基準測試

```bash
npx playwright install chromium
npm run test:e2e
```

E2E 使用本機隔離的 Supabase 網路替身與虛構測試資料，不連接實際專案或寄送 Email。路由盤點、測試涵蓋與資料策略記錄於 [docs/ui-component-preparation.md](./docs/ui-component-preparation.md)。

## 共用 UI 元件

`src/components/ui/` 提供按鈕、輸入欄位、選單、核取方塊、文字區域與狀態標籤。元件匯入方式、variant、尺寸、無障礙行為與使用範例見 [src/components/ui/README.md](./src/components/ui/README.md)。

## 程式碼結構

- `src/App.tsx`：應用程式狀態與功能協調。
- `src/components/`：背包格網、物品資訊卡、自創道具鍛造、貨幣管理與物品圖示元件。
- `src/data.ts`：預設角色/物品資料、稀有度樣式與武器精通字典。
- `src/types.ts`：共用 TypeScript 型別。
