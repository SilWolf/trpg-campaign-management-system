你好！我們正在持續開發專為 D&D 5R (2024 規則) 設計的《博德之門3》風格多戰役背包與跑團管理平台。

### 🛠️ 目前專案技術堆疊

- **Frontend**: Vite, React 19, TypeScript (Strict Mode), Tailwind CSS v4 (`@import 'tailwindcss';`), TanStack Router (File-based Routing), Lucide React, Vaul (Mobile Drawer), React Markdown
- **Backend**: Supabase (Auth, PostgreSQL, Realtime WebSockets, Edge Functions, RLS 安全政策)
- **Database**: 具備 `campaign_id` 隔離與外鍵串聯（`ON DELETE CASCADE`）的關聯式架構

---

### ✅ 已完成的核心功能

1. **多戰役大廳與加入機制 (`/`)**：
   - 建立新戰役時自動生成 6 碼大寫邀請碼 (`invite_code`) 並初始化範例資料。
   - 支援輸入邀請碼直接加入戰役。
2. **Email 官方邀請與用戶個人資料 (`profiles`)**：
   - 透過 Supabase Edge Function (`invite-player`) 發送官方 Email 邀請信。
   - 公開 `profiles` 表格透過 Trigger 自動與 `auth.users` 同步 `full_name` 與 `email`，並支援於 `/settings/profile` 修改。
3. **細粒度角色控制權限系統 (`character_permissions` ACL)**：
   - 角色控制權由 `character_permissions` 表格與 `useCharacterPermissions` Hook 驅動（並透過 Supabase Realtime 即時同步）。
   - **4 項數值分級權限 (`0`=無權限, `1`=僅閱讀, `2`=閱讀+修改)**：
     - `public_bag_access`（公開背包）
     - `private_bag_access`（私人暗袋）
     - `public_wallet_access`（公開錢包 `currencies`）
     - `private_wallet_access`（私人錢包 `private_currencies`）
   - **3 項布林權限**：
     - `can_edit_profile`（修改名稱、頭銜、STR、頭像）
     - `can_delete_character`（移除角色並將遺物與雙錢包併入營地儲物箱 `camp-chest`）
     - `can_manage_permissions`（修改該角色的權限控制表）
   - **預設與安全規則**：
     - DM 永遠擁有全部權限；角色創建者透過 DB Trigger 預設獲得全部權限；其他玩家預設對公開背包與公開錢包擁有閱讀權 (`1`)；營地儲物箱 (`camp-chest`) 全員預設擁有公開背包與公開錢包修改權 (`2`)。
     - **防自鎖保護**：透過 `SECURITY DEFINER` 函式與前端 UI 限制，非 DM 玩家不可修改自己的權限列。
     - **單向轉移規則**：只要對來源角色的背包或錢包具備修改權 (`2`)，即可將物品或貨幣轉移給任何其他角色或營地儲物箱，無須目標角色權限。
4. **戰役與角色設定中心 (`/campaigns/$campaignId/settings`)**：
   - 開放戰役所有成員進入，採用「戰役常規設定與成員配額」+「各角色獨立設定分頁」的多分頁架構。
   - 支援 DM 在 `campaign_members` 中針對每名玩家個別設定「可創建角色數量上限 (`max_characters`，預設 1，0 為禁止創建)」。
5. **背包與雙錢包介面 (`/campaigns/$campaignId/`)**：
   - 支援四大自動分類（裝備、消耗品、重要物品、雜物）、三種檢視模式（6格、緊湊格字、列表）、附魔詞條 (Affixes) 系統、未鑑定遮罩與 Markdown 描述。
   - 負重計算嚴格過濾無閱讀權限的背包與錢包，防止洩漏暗袋重量。

---

### 📐 開發規範與核心注意事項（請嚴格遵守）

#### 1. 資料庫 Schema 與 Supabase SQL 規範

- **關鍵欄位型別差異（極重要）**：
  - `campaigns.id`、`campaigns.dm_id`、`characters.id`、`characters.user_id`、`inventory_items.id` 皆為 **`TEXT`** 型別（以相容預設戰役 `'default'`、營地儲物箱 `'camp-chest'` 與訪客 `'guest'`）。
  - `profiles.id`、`campaign_members.user_id`、`character_permissions.user_id` 與 `auth.uid()` 皆為 **`UUID`** 型別。
  - **撰寫 SQL / RLS / Trigger 時**：比較 `dm_id` 或 `characters.user_id` 與 `auth.uid()` 時，務必明確轉型為 `auth.uid()::text`；將 `characters.user_id` 轉為 `UUID` 時，必須使用 `EXCEPTION WHEN OTHERS` 捕捉非 UUID 字串（如 `'guest'`、`'dm'`），避免轉型報錯。
- **防止 RLS 無限遞迴 (Infinite Recursion)**：
  - 撰寫 RLS 政策時，**嚴禁**在某張表的 Policy 內直接 `SELECT` 同一張表。若需檢查自身表格的權限狀態，必須封裝在 `LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE` 輔助函式中呼叫。

#### 2. 資料同步與轉換器規範 (`src/lib/supabase.ts` & `src/hooks/useCampaignSync.ts`)

- **命名轉換隔離**：資料庫欄位一律使用 `snake_case`，前端 TypeScript 型別（`src/types.ts`）一律使用 `camelCase`。所有新增欄位都必須在 `src/lib/supabase.ts` 的 `toDb*` 與 `fromDb*` 轉換器中雙向對應，並提供向下相容的 Fallback 預設值。
- **Optimistic UI + Realtime 雙向同步**：前端狀態修改透過封裝後的 `setCharacters`、`setItems`、`setPermissions` 先行更新本地 State（計算 Diff 後非同步 `upsert`/`delete` 至 Supabase），並仰賴 `postgres_changes` WebSocket 頻道接收他人變更。
- **單機與訪客模式退避 (Graceful Fallback)**：當 `!supabase`（未設定環境變數）、`isGuest` 或 `campaignId === 'default'` 時，所有功能需優雅退回本地端狀態操作，不可直接崩潰。

#### 3. 前端架構、TypeScript 與 UI 風格規範

- **嚴格型別與 Lint 規範**：
  - 專案啟用 `verbatimModuleSyntax: true`、`noUnusedLocals: true`、`noUnusedParameters: true`。匯入型別時**必須**使用 `import type { ... }` 或 `type` 關鍵字。
  - 路徑別名一律使用 `@/*` 指向 `src/*`。
  - TanStack Router 的路由檔案頂部需保留 `/* eslint-disable react-refresh/only-export-components */` 註解，且**請勿手動修改**自動生成的 `src/routeTree.gen.ts`。
- **《博德之門3》暗黑奇幻視覺風格**：
  - 背景主色系採用深石色（`bg-[#0c0a09]`、`bg-stone-950`、`bg-stone-900`），一般邊框使用 `border-stone-800` / `border-stone-700`。
  - 重點強調色：常規與公開項目使用琥珀金（`amber-400` ~ `amber-950`）、DM 專屬與魔法詞條使用秘法紫（`purple-300` ~ `purple-950`）、私人暗袋與安全狀態使用翠綠（`emerald-300` ~ `emerald-950`）、營地儲物箱使用青色（`cyan-300` ~ `cyan-950`）、危險操作使用深紅（`red-300` ~ `red-950`）。
  - 標題字體使用 `font-serif font-bold`，數值、重量與金幣一律使用 `font-mono`。
- **程式碼輸出原則**：
  - 語言一律使用**繁體中文**（包含 UI 文案、Toast 提示與程式碼註解）。
  - 當修改涉及多個区块時，優先提供完整可覆蓋的元件或函式程式碼，確保不會遺漏 import 或型別定義。
