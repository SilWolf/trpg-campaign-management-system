# 專案名稱：D&D 5R (2024) 博德之門3風格戰役背包系統 (BG3 Style Inventory)

## 1. 專案目標與使用者情境

- **目標受眾**：TRPG 地下城主 (DM) 與 4~6 名跑團玩家。
- **核心玩法規則**：D&D 5R (2024 新版規則 / SRD 5.2)。
- **視覺與互動風格**：致敬《博德之門3》(Baldur's Gate 3) 的暗黑奇幻風網格背包、稀有度發光邊框、懸停動態資訊卡 (Tooltip)、拖曳換位與裝備穿脫。

## 2. 技術架構 (Tech Stack)

- **前端**：Vite + React + Tailwind CSS v4 (`@tailwindcss/vite`) + `lucide-react` 圖示庫。
- **預定後端與即時同步**：Supabase (PostgreSQL + Realtime WebSockets + Storage)，部署於 Vercel Free Tier。

## 3. 已實作的核心功能 (`src/App.jsx`)

1. **BG3 稀有度視覺系統**：支援普通 (Common)、非普通 (Uncommon/綠)、稀有 (Rare/藍)、極珍稀 (Very Rare/紫)、傳奇 (Legendary/金)、神器 (Artifact/橘紅) 的內發光邊框與漸層標題。
2. **D&D 5R 專屬規則**：
   - 支援 2024 版「武器精通」(Weapon Mastery)：Cleave (順劈)、Nick (輕削)、Sap (削弱)、Push (推撞)、Vex (煩擾)、Topple (擊倒) 等規則標籤與說明。
   - 同調欄位限制 (最多 3 格同調) 與力量負重計算 (`STR * 15 lbs`)。
   - 五種貨幣管理 (PP, GP, EP, SP, CP)、50枚硬幣=1磅計重開關、一鍵換整金幣功能。
3. **DM 上帝視角 vs 玩家視角切換**：
   - 未鑑定物品 (`isIdentified: false`) 在玩家視角顯示為「未知的魔法物品」並隱藏真實屬性與詛咒。
   - DM 專屬筆記 (`dmNotes`) 僅在 DM 視角顯示。
   - 內建 DM 自創道具 (Homebrew) 鍛造工坊 Modal，可直接發放道具至背包空格。

## 4. 下一步開發計畫 (Next Steps)

1. **拆分元件 (Refactoring)**：將單一 `src/App.jsx` 拆分為模組化元件 (`components/InventoryGrid.jsx`, `components/ItemTooltip.jsx`, `components/HomebrewModal.jsx`, `components/CurrencyPanel.jsx`)。
2. **串接 Supabase 後端**：建立 `characters`, `items`, `inventory_instances` 資料表，並加入 Realtime 訂閱，讓 DM 發放道具或修改金幣時，玩家端零延遲同步。
3. **多人角色切換與公基金營地箱**：新增切換不同玩家角色的分頁，以及小隊共用的「營地儲物箱 (Traveller's Chest)」。

## 5. AI 協作守則

- 回答與註解請使用**繁體中文**。
- 撰寫 UI 時請維持暗黑奇幻風格（深石板灰 `slate-900`/`950` 搭配古銅金 `amber-500`/`600` 點綴）。
- 涉及 D&D 規則時，一律以 **2024 D&D 5R** 規則為準。
