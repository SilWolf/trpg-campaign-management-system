# DM 語境主題規劃

## 目標

新增 `dm` 語境，專門辨識只有戰役 DM 可操作或查看的介面，不改變現有權限判定與功能行為：

- `default` 主題使用冰藍色。
- `dnd` 主題使用藍色。
- `printing` 主題使用紫色。
- `Button` 新增 `primary-dm`、`secondary-dm`、`ghost-dm` 三種 variant。
- DM 限定按鈕改用對應的 DM variant；DM 限定視窗、面板與區塊以 `dm` token 表示邊框語境。

本規劃只處理視覺語意，不取代 `isDm`、權限 Hook、資料存取或 RLS 等安全控制。DM 專屬內容仍須由既有存取邏輯保護，顏色不能作為權限提示以外的安全措施。

## 現況與設計決策

- 三種主題的 CSS variables 與 Tailwind v4 `@theme inline` 對應集中於 [`src/index.css`](../src/index.css)。
- 共用按鈕的 variant 型別與 class 集中於 [`src/components/ui/Button.tsx`](../src/components/ui/Button.tsx)，元件使用方式記載於 [`src/components/ui/README.md`](../src/components/ui/README.md)。
- 既有主題規劃曾決定不新增 DM 領域色彩；本需求明確新增 DM 語境，視為該決策的限定例外。不可因此增加私人背包、營地箱或魔法等其他領域色彩 token。
- 延用既有語意 token 機制：每個主題提供 `--dm` 與 `--dm-foreground`，並映射成 `dm` 與 `dm-foreground` Tailwind 色彩 utility。如此可共用於按鈕、邊框、文字及低透明度背景，不在 JSX 中硬編碼色票。

### 色彩候選值

以下為實作時的起始候選值，需在三種主題下實際檢查文字對比與 disabled 狀態後定案：

| 主題 | `--dm` 候選色 | `--dm-foreground` 候選色 | 視覺語意 |
| --- | --- | --- | --- |
| `default` | `#38bdf8` | `#082f49` | 冰藍 |
| `dnd` | `#2563eb` | `#ffffff` | 藍色 |
| `printing` | `#7e22ce` | `#ffffff` | 紫色 |

`--dm` 用於實心 DM 按鈕及 `border-dm`、`text-dm`、`bg-dm/10` 等低透明度提示；實心背景上的文字使用 `dm-foreground`。色彩須在背景、hover、focus、disabled 與列印樣式下維持可辨識，不以稀有度色票替代 DM 語意。

## DM 介面盤點範圍

實作時需逐一檢查下列路由與元件中由 DM 身分、DM 視角或 DM 專屬內容條件控制的互動和區塊。這份清單是起始盤點，不取代對 `src/` 全域 JSX 的最後搜尋；不得只依檔名或色彩判斷是否 DM 限定。

| 區域 | 起始盤點位置 | 預期處理 |
| --- | --- | --- |
| 背包標頭與角色狀態 | [`AppHeader.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/AppHeader.tsx)、[`CharacterStatusBar.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/CharacterStatusBar.tsx) | DM 視角切換、自創道具、DM 專屬貨幣編輯等控制項使用 DM variants；僅 DM 可見的容器邊框使用 `border-dm`。 |
| 道具管理與分發 | [`ItemTooltip.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/ItemTooltip.tsx)、[`ItemDefinitionDialog.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/ItemDefinitionDialog.tsx)、[`ItemDistributionDialog.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/ItemDistributionDialog.tsx)、[`BlacksmithSearchDialog.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/BlacksmithSearchDialog.tsx)、[`CurrencyEditPanel.tsx`](../src/routes/_protected/campaigns/$campaignId/-parts/CurrencyEditPanel.tsx) | DM 專屬控制列、隱藏筆記、分發／搜尋／存款視窗及其操作按鈕採用 DM 語境。 |
| DM 冒險筆記 | [`$journeyId.tsx`](../src/routes/_protected/campaigns/$campaignId/journeys/$journeyId.tsx)、[`JourneyForm.tsx`](../src/routes/_protected/campaigns/$campaignId/journeys/-parts/JourneyForm.tsx) | DM 專屬筆記區塊、編輯區與只供 DM 使用的按鈕採用 DM 語境；玩家可見的冒險內容維持原樣。 |
| 戰役與角色設定 | [`settings/index.tsx`](../src/routes/_protected/campaigns/$campaignId/settings/index.tsx)、[`GeneralSettingsPanel.tsx`](../src/routes/_protected/campaigns/$campaignId/settings/-parts/GeneralSettingsPanel.tsx)、[`CampaignShopSettingsPanel.tsx`](../src/routes/_protected/campaigns/$campaignId/settings/-parts/CampaignShopSettingsPanel.tsx)、[`CharacterSettingsPanel.tsx`](../src/routes/_protected/campaigns/$campaignId/settings/-parts/CharacterSettingsPanel.tsx)、[`AllCharactersSettingsdPanel.tsx`](../src/routes/_protected/campaigns/$campaignId/settings/-parts/AllCharactersSettingsdPanel.tsx) | DM 專屬儲存、配額、權限管理與設定操作使用 DM variants；只讀提示或所有成員皆可操作的控制項不誤標為 DM。 |
| 商店管理 | [`shops/index.tsx`](../src/routes/_protected/campaigns/$campaignId/shops/index.tsx)、[`shops/$shopId/settings.tsx`](../src/routes/_protected/campaigns/$campaignId/shops/$shopId/settings.tsx)、[`CampaignShopDialog.tsx`](../src/routes/_protected/campaigns/$campaignId/shops/-parts/CampaignShopDialog.tsx) 及相關管理面板 | DM 限定的建立、設定、刷新或管理操作與其視窗採用 DM 語境；玩家購買與一般瀏覽功能維持原 variant。 |
| 其他 DM 標記或管理入口 | [`src/routes/_protected/`](../src/routes/_protected) 內其他以 `isDm`、角色或視角條件顯示的 JSX | 全域搜尋並人工分類，納入上述三類或記錄不需變更的理由；避免遺漏 campaign 大廳或非背包功能的 DM 操作。 |

判斷原則：

1. 只有因 DM 身分或明確 DM 視角才會呈現／可用的按鈕，才更換為 `*-dm` variant。
2. 表單中玩家可操作、DM 與玩家共用，或僅因一般 CRUD 而存在的按鈕，保留原 variant。
3. 只有包住 DM 專屬內容或操作的視窗、面板、區塊邊框改用 `border-dm`（可附透明度）；普通分隔線、卡片框線及通用 Dialog 外框不應整批改色。
4. 若 DM 專屬區塊使用 `bg-primary`、`border-primary` 或舊色票呈現 DM 身分，改用 `bg-dm`／`border-dm` 等 token，並按需調整文字前景；一般主要操作與主題裝飾仍使用原 token。
5. 不改動任何權限條件、資料可見性、操作流程、測試識別子或非 DM 的視覺樣式。

## 執行階段

### Phase 1：建立主題 token

- [x] 在 `src/index.css` 為 `default`、`dnd`、`printing` 定義 `--dm`、`--dm-foreground`。
- [x] 在 `@theme inline` 映射 `--color-dm` 與 `--color-dm-foreground`，供 Tailwind utilities 及透明度 modifier 使用。
- [x] 核對 CSS cascade、主題切換及 `@media print` 規則；列印時保留一般黑白省墨樣式，但 `border-dm` 與 `text-dm` 明確沿用 DM token。

**完成紀錄（2026-10-30）：** 三主題採用候選色值 `#38bdf8`／`#082f49`、`#2563eb`／`#ffffff`、`#7e22ce`／`#ffffff`（DM 色／前景色）；三組文字對比皆高於 WCAG AA 一般文字門檻。主題切換以根元素 `data-theme` cascade 套用，不需修改 JSX。列印全域黑白規則維持不變，僅 DM 文字與邊框保留語境色。

**Phase 1 驗證：** `npm run typecheck`、`npm run lint`、`npm run build`、`npm run test:e2e -- tests/e2e/theme-system.spec.ts`（5 項通過）及 `git diff --check` 均通過；E2E 覆蓋三主題的 token／utility 對應、文字對比與列印中的 DM 邊框／文字。

### Phase 2：新增 Button variants 與使用文件

- [x] 擴充 `ButtonVariant` 及 `variantClasses`，新增 `primary-dm`、`secondary-dm`、`ghost-dm`。
- [x] 延用共用焦點環、disabled、loading、`asChild` 行為；三個 variant 僅負責色彩與強調層級。
- [x] 在 `src/components/ui/README.md` 說明三種 DM variant 的適用情境，禁止以 variant 顏色取代實際權限檢查。

**完成紀錄（2026-10-30）：** Button 新增三種 DM variants，分別以主題 `dm` token 表示主要實心、次要柔和及低強度透明按鈕；沿用原有共用焦點環、disabled、loading 與 `asChild` 實作，沒有變更權限或既有按鈕使用處。元件文件說明 DM 限定使用條件、操作強度及 variant 不具授權效果；破壞性操作仍使用 `destructive`。

**Phase 2 驗證：** `npm run typecheck`、`npm run lint`、`npm run build` 及 `git diff --check` 均通過。

### Phase 3：盤點並遷移 DM 專屬 UI

- [x] 全域搜尋 campaign UI 中的 `isDm`／DM 視角條件、DM 專屬文案及角色判斷，逐處確認按鈕和區塊是否真為 DM 限定。
- [x] 將 DM 限定按鈕依操作強度映射到 `primary-dm`、`secondary-dm` 或 `ghost-dm`；破壞性操作保留危險語意。
- [x] 將 DM 專屬視窗、面板與區塊邊框改用 `border-dm`，並清除同一元素上互相衝突的舊 DM 色彩 class。
- [x] 在原有主題色彩規劃文件記錄此項限定例外，保留稀有度色彩政策及一般 UI 色彩規則。

**完成紀錄（2026-10-30）：** 已遷移背包 DM 視角／自創道具／貨幣編輯、物品提示中的 DM 隱藏筆記與控制列、物品建立與派發（含鍛造工坊搜尋）、DM 冒險筆記、戰役基本設定儲存／角色配額／Email 邀請、DM 角色擁有權移轉、商店建立與設定／刷新管理，以及待審購買的核准與拒絕按鈕。商店玩家購買與數量控制、邀請碼複製、公開角色權限管理、一般冒險筆記編輯及角色權限可允許的個人資料／刪除操作均維持原樣；大廳「DM 專屬管理世界」是未按 DM 身分分流的靜態標籤，也未改動。所有變更只調整語意樣式，未改變 `isDm`、權限條件、資料存取、互動流程或測試識別子；刪除與拒絕等危險操作保留危險樣式。

**Phase 3 驗證：** `npm run typecheck`、`npm run lint`、`npm run lint:theme-colors`、`npm run build`、受影響的 campaign UI E2E 測試及 `git diff --check` 均通過。實際執行結果待驗證後填入。

### Phase 4：驗證

- 擴充 `tests/e2e/theme-system.spec.ts`，切換三種主題並確認 `dm` 語境的實際顏色；同時覆蓋 Button variant 的背景、文字及基本互動狀態。
- 以既有 campaign UI E2E 驗證 DM 才能看到的操作仍有相同條件，玩家端仍看不到 DM 專屬視窗與區塊。
- 執行 `npm run typecheck`、`npm run lint` 及受影響的 E2E 測試；如共用元件或多個 DM 區域有變更，再執行完整 `npm run test:e2e`。
- 使用 `npm run lint:theme-colors` 確認遷移沒有引入新的硬編碼色票；手動確認三主題的文字對比、focus ring、disabled 與列印呈現。

## 驗收條件

- 三種主題的 DM 色彩分別呈現冰藍、藍、紫，且主題切換不需修改 JSX。
- `Button` 的三種 DM variant 在型別、class 與元件文件中一致，並維持共用元件既有焦點及 disabled 行為。
- 所有且僅有 DM 限定的按鈕、視窗與區塊具有 DM 語境；一般玩家操作、一般容器及危險操作語意不被誤改。
- 所有 DM 的顯示與可操作條件保持原樣，不以顏色或 UI 隱藏取代授權。
- TypeScript、lint、主題色彩檢查及受影響的 E2E 驗證通過。
