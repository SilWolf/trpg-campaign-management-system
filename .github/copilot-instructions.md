你好！我們正在開發一套專為 D&D 5R (2024 規則) 設計的《博德之門3》風格戰役背包管理網站，這是接續上一個對話的開發。請先記住目前的專案架構與最新進度：

### 1. 技術架構與部署

- **前端**：Vite + React + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite`) + `lucide-react` + `react-markdown`[cite: 1, 2]。
- **後端**：Supabase (PostgreSQL + Realtime WebSockets 即時同步)，已部署於 Vercel。
- **資料庫與前端轉換**：透過 `src/lib/supabase.ts` 處理 `snake_case` 與 `camelCase` 轉換，並由 `src/hooks/useCampaignSync.ts` 負責 Optimistic UI 樂觀更新與 Realtime 廣播訂閱。

### 2. 檔案目錄結構

- `src/types.ts`：定義 `Rarity`, `ItemCategory`, `WeaponMasteryKey`, `WeaponMasteryInfo` (`{ name, desc }`), `CurrencyType`, `ViewMode`, `InventoryDisplayMode` (`'grid' | 'list'`), `ItemSection` (`'Equipment' | 'Consumable' | 'Important' | 'Misc'`), `InventoryItem`, `Character`, `HomebrewForm`, `RarityStyle` (`headerGradient`)，以及 `resolveItemFlags()` 與 `getItemSection()`。
- `src/data.ts`：存放預設角色 `INITIAL_CHARACTERS`、預設物品 `INITIAL_ITEMS`、`RARITY_CONFIG`、`WEAPON_MASTERIES`[cite: 1, 2]。
- `src/components/InventoryGrid.tsx`：已棄用 6x6 固定格位與拖曳換位；改為依 `isImportant`、`isEquippable`、`isConsumable` 自動歸類為「裝備、消耗品、重要物品、雜物」四大區塊，並支援「緊湊格字 (`grid`)」與「詳細列表 (`list`)」雙展示模式。
- `src/components/ItemTooltip.tsx`：右側物品詳細資訊卡，支援 5R 武器精通、充能、同調、Markdown 渲染、玩家個人備註 (`playerNotes`)、移入私人暗袋 (`isPrivate`)、隊友移交，以及 DM 編輯/鑑定/銷毀功能。
- `src/components/HomebrewModal.tsx`：支援 DM「鍛造新道具」與「編輯現有物品 (`isEditing`)」，可勾選三大分類屬性、未鑑定與私人暗袋。
- `src/components/CurrencyPanel.tsx`：五種貨幣 (`pp, gp, ep, sp, cp`) 增減與一鍵換整金幣 (`consolidateCoinsToGold`)[cite: 1, 2, 3]。
- `src/components/ItemIcon.tsx`：圖示渲染元件[cite: 1]。

### 3. 協作守則

- 請一律使用**繁體中文**回覆與撰寫註解。
- 當我需要修改特定元件時，我會貼上該檔案或 `types.ts`，請嚴格對齊現有 TypeScript 型別。

收到後請簡短回覆確認，我會告訴你下一個要開發的功能！
