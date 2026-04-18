# 每次任務前的 5 條 mindset（世界級設計系統的工作底色）

這 5 條是本專案所有規則背後的**態度**。接到任務先複習一遍，再看具體規則。

1. **對標世界級**——每個設計決策都要能回答「Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 怎麼做？我們為什麼一樣 / 為什麼不同？」。沒對齊又說不出不同的理由 = 設計 bug。
2. **不憑直覺發明**——新增任何值 / 名 / pattern 前先 `grep` 既有。專案已有的 gap、padding、font-size、命名慣例優先沿用；不是「看起來順」就能造新值。
3. **改一處必看三處**——code / spec / story 三方聯動是常態，不是例外。改 cva `defaultVariants`、改 variant、改 token 前先 grep 該元件所有檔案，一次改完。
4. **範例必須是真實業務場景**——Jira / Stripe / Notion / Figma 等可辨識的情境；禁止 `Option A/B/C`、「按鈕一」、極端不現實、ASCII art。Storybook 的受眾是任何打開它的人，不是作者。
5. **猶豫就問，不往前推**——遇到無前例的設計決策：(a) 先 grep 既有 pattern，(b) 讀近親元件 spec，(c) 仍不確定就停下問使用者。**禁止憑直覺造新 pattern**——這是本專案最常被糾正的錯誤。

每條規則展開請讀後面對應章節（`# Spec 規則`、`# UI 開發規則`、`# Story`、`# 命名與語言一致性` 等）。


# 任務導航表（做 X → 讀 Y）

接到任務後先對照這張表，找出必讀章節再動手。**章節名即 `#` heading**，可用 grep 直接跳。

| 任務類型 | 必讀章節（按順序） |
|---------|-----------------|
| **新增元件** | `# 建立 UI 前必讀` → `# shadcn 元件規範` → `# Spec 規則` → `# Story` → `# 元件完成清單` |
| **修改元件 variant / size / state** | 該元件 `spec.md` → `# Story` → 連動更新規則 → `# 失敗記憶索引` |
| **改 cva `defaultVariants`** | `# Story` → 高風險漂移點 + `# 失敗記憶索引` → 三方漂移 |
| **新增 / 修改 token** | `# Token 系統運作方式` → `# Token 命名原則` → 對應 `tokens/xxx.spec.md` |
| **新增 / 修改 pattern** | `# 建立 UI 前必讀` → Pattern 規則 → `patterns/` 對應 `spec.md` |
| **寫 principles story** | `# Story` → 範例選擇原則 → `# Story` → 自我檢查清單（逐條打勾） |
| **寫 anatomy story** | `# Story` → 設計規格 Story 標準 + 連動更新規則 |
| **跨元件比較 / 加 SSOT pointer** | `# Spec 規則` → SSOT 規則與 anchors 清單 |
| **命名新檔案 / 變數 / prop** | `# 命名與語言一致性` + `# 元件 Props 命名原則` |
| **新元件的內部 layout 選型** | `# 系統內部 Layout — 4-Family Model` → 新元件判斷流程 |
| **無明確前例的設計決策** | `# 遇不確定時的協議`（先 grep → 讀近親 spec → 仍不確定就問） |
| **Tailwind / CSS 出怪事** | `# Tailwind 使用規則` + `# 失敗記憶索引` → 技術陷阱 |
| **spec 跟 code 結論衝突** | `# Spec 規則`（主動提出討論，不默默改） |

**找不到對應的任務類型** → 進 `# 遇不確定時的協議`，不要自己決定讀什麼。

---

# 專案規則

本專案使用：

- Vite + React + TypeScript
- Tailwind CSS v4（@tailwindcss/vite）
- shadcn/ui 元件庫
- Storybook
- 自訂 Design Token 系統

專案必須可以正常啟動。

必要檔案：

- index.html（位於專案根目錄）
- src/main.tsx
- src/globals.css
- vite.config.ts
- package.json
- tsconfig.json

若缺少上述檔案，請先建立再進行其他修改。


# 規則分層（寫新規則前先決定位置）

設計系統的規則分四層，**寫任何新規則前先決定它屬於哪一層**，不要全部塞進 CLAUDE.md。

**Level 1 — `CLAUDE.md`（專案層，跨元件）**
- 技術棧、檔案結構
- 跨元件架構原則的**判斷框架**（如何決定 Props 命名、如何決定用 Inline Action vs Button）
- AI 會反覆踩的**技術陷阱**（Tailwind v4 `var()` 語法、tailwind-merge 註冊、陰影用 elevation、Provider 放置）
- 品質閘門、Story 結構規範
- 指向詳細 spec 的**指標**（一行連結，不展開細節）
- 「如何寫 spec / story / code」的 meta 規則

**CLAUDE.md 的判斷法**：問「這是 AI 每次執行都需要的提醒，還是查閱特定 spec 就能找到的設計規則？」前者留，後者搬到 spec 並留指標。

不適合：具體設計規則（超過 5 行的對照表、場景列舉、公式推導）——那是 spec 的工作。CLAUDE.md 只放判斷框架 + 指向 spec 的指標。

**Level 2 — 元件 `spec.md`（單一元件）**
- 元件定位一句話
- variant / size / state 的「何時用 / 不用」與理由
- 元件特有的設計決策
- do / don't 原則（由 stories 視覺化）
- 對 cross-cutting 規則的**例外**
- 指向 CLAUDE.md 或 pattern spec 的反向引用

不適合：適用多個元件的規則（應升級到 pattern spec 或 CLAUDE.md）。

**Level 3 — Pattern `spec.md`（跨元件共享的佈局 / 互動公式，如 `item-layout.spec.md`）**
- 多個元件必須遵守的基礎設計規則
- pattern 的 rationale（為什麼是這個公式 / 結構）
- 公式與 token 結構
- **列出哪些元件是該 pattern 的消費者**
- 元件在 pattern 內的互動規則

**Level 4 — Code（`.tsx`）**
- 被強制執行的 variant type（cva）
- TypeScript 型別約束、required props
- 不需人類判斷的實作細節
- 說明微妙實作決策的行內註解（**不是**設計理由——設計理由去 spec）

### 判斷法（寫規則前問自己）

1. **影響幾個元件？** 1 個 → 元件 spec；2+ 但屬同一 pattern → pattern spec；全系統 → CLAUDE.md
2. **能直接變成 code 嗎？** 能 → 寫進 tsx，spec 指向 tsx；不能 → spec
3. **是「為什麼 / 何時」還是「是什麼 / 多少」？** 前者 → spec；後者 → code

### 搬動規則的雙向處理

把規則從 CLAUDE.md 搬到 spec 時，**CLAUDE.md 必須留下一行指標**（「詳見 `xxx.spec.md`」）；反之亦然。**規則有家、也有路標**，不可只搬走不留索引。


# 遇不確定時的協議（Ambiguity Protocol）

**專案最常發生的錯誤是「AI 憑直覺造新 pattern」。** 遇到無明確前例的設計決策或實作選擇時，**強制按以下順序**處理，禁止跳步、禁止憑感覺往前：

## Step 1 — `grep` 既有 pattern

先假設「這個決策專案一定做過」，花 30 秒搜尋：
- 命名類（gap / padding / 檔名 / prop） → `grep` 同類元件的既有值
- 設計決策類（變體 / 狀態 / 互動） → `grep` 最近親元件的 spec.md
- Token 類 → 查對應 token spec.md
- Pattern 類 → `ls src/design-system/patterns/`

**找到就沿用**，不是「看起來順」才改。找到但明顯不合理 → 進 Step 3，不自己改。

## Step 2 — 讀近親元件的 spec.md

若 Step 1 沒找到完全對應，找「最近親元件」（同 family、同 pattern、同職責）的 spec.md 完整讀一次，檢查：
- 它的設計決策是否可類推到當前問題？
- SSOT anchor 是否有談到這類情境？
- 它的「禁止事項」是否隱含了某個規則？

**可類推就直接套用**並在 spec 寫「對齊 X 的 Y 規則」建立反向引用。

## Step 3 — 仍不確定就停下來問使用者

Step 1 + 2 後仍無清楚方向時，**禁止自己決定**。停下來回報使用者：
- 「找到的既有 pattern：A / B」
- 「我傾向 A 因為 X，但 B 也合理」
- 「你的偏好？」

**禁止的行為**：
- ❌ 跳過 grep 直接憑記憶造新值
- ❌ 為了「做完」在兩個選項之間隨便挑一個
- ❌ 發明新的 suffix / prefix / 命名慣例
- ❌ 在 spec / code 裡留下「TODO 待確認」而照樣往前

## 何時可以不走協議

以下情境可跳過（不算「無前例」）：
- Bug 修復（code 和設計都已定，只是執行錯）
- 純機械勞動（import 路徑修正、typo、格式一致化）
- 使用者已明確指示要做 X


# 失敗記憶索引（prevention anchors）

**接任務前先掃這個索引**：如果當前任務碰觸這些類別，先讀對應 anchor 的完整 context 再動手。每條 bug 只留 pointer，內容在引用位置不重複。

## 技術陷阱（沉默出錯類，AI 最容易誤觸）

| Bug | 怎麼錯 | 完整說明 |
|-----|-------|---------|
| Tailwind v4 任意值 `[--foo]` | 不被自動包 `var()`，Sidebar 從 shadcn 複製此語法 8 處全失效 | `# Tailwind 使用規則` → Tailwind v4 任意值：CSS variable 必須用 `var()` 包覆 |
| `tailwind-merge` 自訂 utility 未註冊 | 把不同 group class 誤判衝突 strip 掉（`text-body` + `text-fg-secondary`） | `# Tailwind 使用規則` → tailwind-merge 自訂 utility 註冊（技術陷阱） |
| 元件自包 Provider | shadcn 原版 `SidebarProvider` 內建 `TooltipProvider delayDuration={0}`，劫持全站 hover 節奏 | `# shadcn 元件規範` → 元件不得自包 Provider |
| 清 unused imports 後沒跑 runtime | tsc 不充分，JSX 內 identifier 和未宣告 export 會漏抓 | `# UI 開發規則` → 清 unused imports 後必須跑 runtime 驗證 |

## 三方漂移（code / spec / story 不一致）

| Bug | 怎麼錯 | 完整說明 |
|-----|-------|---------|
| cva `defaultVariants.size` 不同步 spec/docblock/anatomy | SegmentedControl `md` vs spec/docblock 寫 `sm ★default` | `# Story` → 高風險漂移點 |

## Pattern 執行偏移

| Bug | 怎麼錯 | 完整說明 |
|-----|-------|---------|
| Row primitive 硬寫 `py-2` 在不同 context 產生 gap | TreeView 原本 `py-2`，進 SidebarGroup（也 `py-2`）→ label 和 first item 多 8px gap | `patterns/item-layout/item-layout.spec.md`「垂直 padding 歸屬」 |
| asChild pattern 下 consumer 自查 avatar size 全寫 24px | 三欄 sm/md/lg 並排，sm 欄本應 20px 卻顯示 24px | `patterns/item-layout/item-layout.spec.md`「Avatar 尺寸選擇」 |
| 誤把純行為 primitive 放 `Components/` | HoverCard 無預設視覺、所有消費者包成 wrapper，應在 `Internal/` | `# Story` → Internal vs Components 判斷 test |
| 元件誤列 field-height family | Chip 固定 `h-field-sm`（Material 3 慣例），不適用「default md」規則 | `tokens/uiSize/uiSize.spec.md` Field-height family |

## 規則

- **任何新 bug 確認後**：補到本索引（一行 + pointer）+ 在根原位置（spec / CLAUDE.md 對應章節）記錄完整 context
- **接新任務前**：先掃本索引，條目若符合當前情境 → 讀 anchor 完整 context 再動手
- **索引條目過期**（code 已改、風險消失）→ 移除並在 commit 訊息記錄


# 命名與語言一致性（Meta 規則）

**本節是 meta 規則**——影響所有後續命名決定（檔案、資料夾、變數、spec 章節、story、API prop）。建立任何命名前先讀這節。

## 命名前必查既有 pattern

建立任何名稱前，**必須先 `ls` / `grep` 既有 pattern**，嚴格對齊不憑直覺。**本專案的命名慣例依類別而分，不是「全部 kebab-case」**——codify 世界級 DS 的分類慣例：

### 檔案 / 資料夾

| 類別 | 慣例 | 範例 |
|------|------|------|
| 元件資料夾 | PascalCase | `Button/`、`DatePicker/`、`NumberInput/` |
| 元件檔案 | kebab-case | `button.tsx`、`date-picker.tsx`、`number-input.tsx` |
| Pattern 資料夾 | kebab-case | `item-layout/`、`action-bar/`、`horizontal-overflow/` |
| Pattern 檔案 | kebab-case（與資料夾同名） | `item-layout.tsx`、`action-bar.tsx` |
| Hooks 資料夾 | lowercase | `hooks/` |
| Hooks 檔案 | kebab-case（對齊 shadcn） | `use-is-mobile.ts`、`use-overflow-items.ts` |
| Token 資料夾 | 單字 lowercase / 多字 camelCase | `color/`、`radius/`；`uiSize/`、`layoutSpace/` |
| Token 檔案 | 與資料夾同名 | `color.css`、`uiSize.css`、`layoutSpace.spec.md` |

**分類原因**：
- 元件 PascalCase folder + kebab-case file 是 shadcn / Chakra / Ant Design 共通做法——folder 對應 React 元件名（PascalCase），file 符合跨平台 filesystem 友善
- Hooks 對齊 shadcn 的 kebab-case 慣例
- Token 資料夾沿用 CSS `--token-name` 的多字構詞風格（單字不需要 case，多字用 camelCase 反映 `--uiSize` 概念整體）

### 程式 identifier

| 類別 | 慣例 | 範例 |
|------|------|------|
| React 元件 / TypeScript type | PascalCase | `ItemLayout`、`ItemLayoutProps` |
| 函式 / hook / 本地變數 | camelCase | `useOverflow`、`itemCount` |
| CSS custom property | kebab-case | `--field-height-md`、`--ui-size-24` |
| Tailwind class | 既有 utility 優先；自訂 kebab-case | `text-body-lg` |

### 文件內容

| 類別 | 慣例 | 範例 |
|------|------|------|
| Spec 章節標題 | 繁體中文（約定俗成英文術語例外）| 「何時用」、「禁止事項」；例外：Props / API / Token / CSS |
| Spec H1 標題 | `# {元件名} 設計原則` | `# Button 設計原則` |
| Story 標題 path | `Design System/Components/{ComponentName}/{中文子頁}` | `Design System/Components/Button/設計原則` |
| Story 變數名 | `{Concept}Rule`（principles）/ 簡短名詞（showcase） | `VariantRule`、`Modes` |

### 建立新類別時

先在 CLAUDE.md 現有清單（「技術架構概覽」、`# Story` 的「三層定位」、本節各表）找**相似類別**的命名模式，**沿用**，不自創新 suffix / prefix。例：新 pattern → kebab-case；新元件 → PascalCase folder + kebab-case file。

## 語言一致性（critical）

- **本專案 spec.md 原則繁體中文**（技術術語保留英文,見命名表例外）
- **Code identifier 一律英文**（約定俗成）
- **單一檔案內註解統一語言**——中文檔註中、英文檔註英，不中英夾雜
- **同一段落不跨語言**——spec 裡「Rule A」「判斷法 A」擇一，不兩種並存

## 禁止事項

- ❌ 憑直覺命名（「聽起來順」「讀起來順」）——必先 `ls` / `grep` 既有 pattern
- ❌ 為突顯新功能用非常規命名——新元件名必須對齊既有元件家族
- ❌ 一個檔案裡註解中英夾雜
- ❌ 複合詞用底線 / PascalCase 命檔（`ItemLayout.spec.md` 錯，`item-layout.spec.md` 對）
- ❌ 自創 spec 章節標題格式（既有 spec 用「何時用」就不要另寫「When to use」/「何時該使用」）
- ❌ 對新元件用新的 suffix（既有都是 `.tsx` / `.spec.md` / `.stories.tsx` / `.anatomy.stories.tsx` / `.principles.stories.tsx`，不自創如 `.design.md` / `.tokens.tsx`）


# 技術架構概覽

```
src/
├── globals.css                        ← Tailwind v4 入口 + CSS token bridge
├── lib/
│   └── utils.ts                       ← cn() 工具（clsx + tailwind-merge）
├── hooks/
│   └── use-mobile.tsx                 ← 觸控裝置偵測（pointer: coarse）
├── design-system/
│   ├── hooks/
│   │   ├── use-overflow-items.ts      ← 水平溢出追蹤（useScrollEdges + useOverflowIndices），Tabs / ChipGroup 共用
│   │   └── use-is-mobile.ts           ← mobile 偵測 re-export
│   ├── tokens/
│   │   ├── color/                     ← primitives.css + semantic.css + color.spec.md + color.stories.tsx
│   │   ├── typography/                ← typography.css + typography.spec.md + typography.stories.tsx
│   │   ├── uiSize/                    ← uiSize.css + uiSize.spec.md
│   │   ├── layoutSpace/               ← layoutSpace.css + layoutSpace.spec.md
│   │   ├── density/                   ← density.spec.md + density.stories.tsx
│   │   ├── elevation/                 ← elevation.spec.md + elevation.stories.tsx
│   │   ├── radius/                    ← radius.spec.md + radius.stories.tsx
│   │   └── opacity/                   ← opacity.css + opacity.spec.md
│   ├── components/                    ← 以實際目錄內容為準（目前 46 個元件資料夾）
│   │   │
│   │   │  ⚙ internal primitive（不直接使用，由其他元件消費）
│   │   ├── Menu/                      ← menu item 共用佈局層（→ SelectMenu / DropdownMenu）
│   │   ├── Notice/                    ← 通知共用佈局層（→ Toast / Alert）
│   │   ├── SelectMenu/                ← 下拉選單浮層（→ Select / Combobox）
│   │   ├── SelectionControl/          ← Checkbox/Radio 共用的 SelectionItem 佈局
│   │   ├── HoverCard/                 ← hover 觸發可互動浮層（行為 primitive）
│   │   ├── OverflowIndicator/         ← 溢出指示器
│   │   │
│   │   │  shadcn passthrough（薄包裝，遵循 shadcn 原始結構）
│   │   ├── Command/                   ← cmdk 搜尋 + 鍵盤導覽
│   │   ├── Popover/                   ← 浮動容器
│   │   ├── ScrollArea/                ← 自訂捲軸
│   │   ├── Separator/                 ← 分隔線
│   │   ├── Sheet/                     ← 側邊抽屜
│   │   ├── Skeleton/                  ← 載入佔位
│   │   │
│   │   │  Field 系統
│   │   ├── Field/                     ← 表單欄位容器（Label + Control + Description + Message）
│   │   │   ├── field.tsx / field-context.ts
│   │   │   ├── field-types.ts         ← FieldMode、InlineActionConfig 共用型別
│   │   │   ├── field-wrapper.tsx      ← Field Controls 共用 wrapper 樣式
│   │   │   ├── field.spec.md          ← Field 佈局容器設計原則
│   │   │   ├── field-controls.spec.md ← Field Controls 共用設計原則（三 mode / Display / endAction）
│   │   │   └── form-validation.spec.md ← 表單驗證標準
│   │   │
│   │   │  其餘為 public-facing 元件，各有獨立資料夾
│   │   └── ...                        ← Alert, Avatar, Badge, Breadcrumb, Button, Checkbox,
│   │                                     Chip, Combobox, DataTable, DatePicker, DescriptionList,
│   │                                     Dialog, DropdownMenu, Empty, FileItem, Input, LinkInput,
│   │                                     NameCard, NumberInput, PeoplePicker, RadioGroup,
│   │                                     SegmentedControl, Select, Sidebar, Slider, Spinner,
│   │                                     Steps, Switch, Tabs, Tag, Textarea, Toast, Tooltip, TreeView
│   │
│   └── patterns/                      ← 跨元件共用的佈局 / 互動公式
│       ├── item-layout/               ← row primitive 共用規則（prefix + content 佈局）
│       ├── action-bar/                ← 工具列 / 操作列排列規則
│       └── horizontal-overflow/       ← 水平溢出處理（scroll arrows / menu trigger）
└── explorations/                      ← 未定案的 prototype 比稿
```

**元件目錄以實際檔案系統為準**，不依賴上方列表。建立或修改 UI 前，先 `ls src/design-system/components/` 確認可用元件。


# Token 系統運作方式

**所有 token 均為純 CSS（不需 JavaScript）：**
- `color/primitives.css`：原始色票
- `color/semantic.css`：語義色彩，用 CSS selector 處理 dark mode
- `typography/typography.css`：字體尺寸 utilities
- `uiSize/uiSize.css`：元件尺寸，用 `[data-ui-size="lg"]` 處理模式切換
- `layoutSpace/layoutSpace.css`：版面間距，用 `[data-layout-space="lg"]` 處理模式切換
- `opacity/opacity.css`：opacity 值
- radius 透過 `globals.css` 的 `@theme inline` 定義

**初始狀態在 `index.html` 設定，無需 JavaScript：**

```html
<html data-theme="light" data-density="md">
```

**動態切換**（例如使用者切換 dark mode）直接操作 attribute：

```ts
document.documentElement.setAttribute('data-theme', 'dark')
document.documentElement.setAttribute('data-density', 'lg')  // 同時切換 uiSize + layoutSpace
// 若需單獨控制，可直接用 data-ui-size / data-layout-space（逃生艙）
```

**JS 端使用色彩**（inline style、canvas 等場景）直接用 CSS 變數字串：

```ts
element.style.color = 'var(--color-neutral-4)'
element.style.backgroundColor = 'var(--primary)'
```


# Spec 規則

- **回答任何設計問題前，必須先讀取所有相關的 spec.md**，以實際內容為基礎，不憑記憶回答
- **每次回答必須有邏輯、有架構、符合世界級設計水準**——不提出未經深思的建議，不為了回答而回答
- **對標世界級 DS（mindset 層）**：編輯任何 spec 或建立新元件時，必須對照 **Polaris / Material / Ant Design / Atlassian / Carbon / Apple HIG**，檢查本專案是否缺少下列判斷維度——**「何時用 / 何時不用」、「與近親元件的分界」、「常見誤解」、「相關元件 links」、「空值呈現」、「驗證時機」、「Loading / 無障礙預設」**。有缺口主動提出討論，**不要假設「沒寫 = 不需要」**。SegmentedControl spec 是本專案的 template（完整實踐此 pattern）
- **Spec 結構對齊 SSOT（Single Source of Truth）**：跨元件比較由**一個 spec own 完整內容，其他 spec 用一行 pointer 指回**。規則如下：

  **何時需要 SSOT（深度比較）**：
  - 多維度分析（如「與 X 的分界」分多個角度討論）
  - 情境對照表超過 3 rows
  - 涉及另一個元件的內部機制或權衡
  
  **何時不需要 SSOT（本地引用即可）**：
  - 「何時不用」表格中一行帶過（「改用 X」+「原因」一句話）——兩側並存不會漂移
  - 「相關」links section 列出相關元件
  - 只描述自己元件的 props / variants / 內部 state
  
  **Ownership 判斷順序**：
  1. 通用預設元件 own（Select owns vs RadioGroup、Input owns vs NumberInput——因為通用者是 fallback）
  2. 若一側 spec 明顯更深、另一側是薄 wrapper → 深側 own（Tabs owns vs SegmentedControl）
  3. 若兩側對等、都需要此判斷 → 按字母序決定 anchor，避免循環爭議
  
  **執行規則**：
  - Own 方寫深度 section；被指方寫一行 pointer（**reciprocal 必須存在，不可單向**）
  - Pointer 必須明確指出 anchor spec 和該 spec 的 section 名稱
  - 本專案目前的 SSOT anchors：
    * Tabs vs SegmentedControl → `tabs.spec.md`「Tabs 與 SegmentedControl 的分界」
    * Select vs RadioGroup → `select.spec.md`「與 RadioGroup 的分界」
    * Checkbox vs Switch → `checkbox.spec.md`「與 Switch 的分界」
    * HoverCard vs Tooltip → `hover-card.spec.md`「與 Tooltip 的分界」
    * Row primitives 共用 → `patterns/item-layout/item-layout.spec.md`
    * Field Controls 共用 → `components/Field/field-controls.spec.md`
  
  **禁止事項**：
  - ❌ 兩個 spec 都寫完整對照（保證漂移）
  - ❌ 建立孤立 `xxx-selection.spec.md` 或 `xxx-comparison.spec.md` 承載比較——世界級 DS 都把比較放在元件 spec 內
  - ❌ 單向指向（A 指向 B，B 沒指回 A）
  - ❌ Pointer 只說「見 X spec」不說 section 名稱——讀者必須掃整份 spec 才找得到
- **編輯 spec.md 時，必須交叉比對所有相關的 spec.md 與 Storybook 範例**，確認無矛盾、無術語不一致、無重複定義
- **若結論與既有 spec.md 有邏輯衝突或概念混淆，必須主動提出討論**，不默默修改、不迴避矛盾
- **所有元件必須遵循 shadcn 框架**，確保保留 shadcn 的結構優勢（forwardRef、Slot、data-* attributes、cva 等），不從零重寫
- **每個元件 spec 的「定位」段落必須明確宣告實作基礎**——`基於 Radix X`、`基於 cmdk` / `sonner` / `@tanstack/react-table` / native HTML element、或 `自建 + 理由`。自建必須說明為什麼不用現有 primitive（通常是「選 native 保留 mobile / a11y」這類設計選擇）。本規則是為了讓任何人讀 spec 第一段就知道這個元件的 shadcn / Radix / 自建 屬性,不需要去看 code
- **spec.md 與 .tsx 的職責分離**：spec 只記錄設計原則（「為什麼」和「何時用」），讓 AI 能舉一反三推導邊緣情況；可程式化的規則（具體 token class name、pixel 值、條件邏輯）寫進元件 .tsx，不寫在 spec 裡。判斷標準：「這條規則能直接變成 code 嗎？」能 → .tsx；不能、需要人類判斷 → spec
- **可推導的值用 `calc()` 或公式表達，不硬寫結果**——讓依賴關係留在 code 裡，上游值變動時下游自動跟著算。例：divider 內縮 = `(行高 - 文字行高) / 2`，改行高時 divider 自動調整，不需要有人記得去改
- **Spec 文字品質**：不描述視覺形狀或實作細節（「窄長形」「會變寬」「zero layout shift」這類視覺字眼屬於 story 視覺化的工作，不進 spec）；同一概念不混用兩個名稱（術語一致）；「禁止事項（❌）」章節必須列出所有常見誤用
- **Spec 邊界案例覆蓋**：適用的狀態必須有明確說明——disabled / loading / empty、dark mode / density 行為、icon-only 使用規則。不適用則明文標注「本元件無 X 狀態」，不沉默省略。
  
  **Scope 預設（減少重複）**：
  - **Field 家族元件**（Input / NumberInput / DatePicker / Select / Combobox / LinkInput / Textarea / Switch / Slider / SegmentedControl / Checkbox / RadioGroup）→ 可直接寫「Mode / disabled / readonly 詳見 `field-controls.spec.md`」，不必逐條重寫
  - **Dark mode 行為**：若元件單純透過 semantic token 切換（無自訂 palette），可直接寫「Dark mode 由 semantic token 自動處理（見 `color.spec.md`）」
  - **Density 行為**：若元件使用 `--field-height-*` 或 `--layout-space-*` token，可直接寫「Density 由 token 自動切換」
  - **純 wrapper 元件**（無自己的互動狀態，如 Separator / Skeleton / Spinner）→ 「本元件無互動狀態」一行帶過
  
  元件特有（non-inherit）的狀態表現必須展開寫；繼承自 family / token 的行為點 pointer 即可


# 建立 UI 前必讀

## Token spec（全系統基礎）

| 主題 | 位置 |
|------|------|
| 色彩架構 + neutral-active/selected 兩個 family | `tokens/color/color.spec.md` |
| 字體 | `tokens/typography/typography.spec.md` |
| 密度系統 | `tokens/density/density.spec.md` |
| 元件尺寸 + Inline Action 尺寸推導 | `tokens/uiSize/uiSize.spec.md` |
| 版面間距 | `tokens/layoutSpace/layoutSpace.spec.md` |
| 陰影 | `tokens/elevation/elevation.spec.md` |
| 圓角 | `tokens/radius/radius.spec.md` |

## 跨元件 pattern spec（建立或修改相關元件前必查）

| 主題 | 位置 | 影響範圍 |
|------|------|---------|
| Row primitive 共用規則 | `patterns/item-layout/item-layout.spec.md` | MenuItem / SidebarMenuButton / TreeItem / DropdownMenuItem / SelectMenu |
| 工具列 / 操作列 | `patterns/action-bar/action-bar.spec.md` | 任何有按鈕列的頁面 |
| 水平溢出處理 | `patterns/horizontal-overflow/horizontal-overflow.spec.md` | Tabs / Chip / 未來 Steps |
| Field 佈局容器 | `components/Field/field.spec.md` | 所有表單元件 |
| Field Controls 共用規則 | `components/Field/field-controls.spec.md` | Input / NumberInput / DatePicker / Select / Combobox / LinkInput / Textarea |
| 表單驗證標準 | `components/Field/form-validation.spec.md` | 所有表單元件 |
| 選擇 / 狀態視覺 | `patterns/item-layout/item-layout.spec.md`「選擇 / 狀態視覺規則」節 | 任何有選中態的元件 |
| 分隔線 vs CSS border | `components/Separator/separator.spec.md` | 任何有分隔線的元件 |

## Pattern 規則（建立 UI 前檢查）

`src/design-system/patterns/` 用於已定案的 UI 流程與元件組合。

- 建立新 UI 前**必須**先檢查是否已有對應 pattern
- 不得跳過 patterns 直接重新設計
- 若 exploration 已定案，應整理後升級為 pattern
- `patterns/` 目前保持平坦結構（一個 pattern 一個資料夾）。同一領域累積三個以上 pattern 時，再建領域子資料夾

每個 pattern 可包含：`*.spec.md`、`*.stories.tsx`、`*.example.tsx`

## 檢查可用元件

- `ls src/design-system/components/`（以實際目錄為準，不依賴 CLAUDE.md 列表）
- `ls src/design-system/patterns/`（已定案的跨元件 UI 流程）


# UI 開發規則

- 必須優先重用 `src/design-system/components/` 內已存在的元件
- 必須使用 design tokens（透過 Tailwind utilities 或 CSS 變數）
- 不要硬寫顏色、font-size、spacing、radius
- 建立新 UI 前，必須先檢查是否已有對應 pattern
- 若缺少元件，請明確指出，不要假裝元件已存在
- 使用 `cn()` 合併 Tailwind class（來自 `@/lib/utils`）

## 新增數值前必須先查既有 pattern（舉一反三原則）

**寫任何 gap、padding、font-size、line-height、icon size、border-radius 等數值之前,必須先 grep 系統內同類型的值,確認是否有既有 pattern 可以直接套用。不要憑直覺發明新值。**

檢查清單：
- `gap` → 查 `fieldWrapperStyles`（gap-2）、MenuItem cva、SelectionItem cva
- `padding` → 查 `--layout-space-loose/tight`、fieldWrapperStyles `px-3`
- `font-size` → 查 `typography.css` utilities + `item-layout.spec.md` reading/scanning 模式規則
- `line-height` → 查 `typography.css`（scanning = leading-compact 1.3,reading = default 1.5）
- `icon size` → 查 `ICON_SIZE` 常數（sm/md=16, lg=20）
- `inline action` → 查 `item-layout.spec.md`「Inline Action 設計規格」節（icon size、hover bg size=icon+2、gap-2 between actions、fg-muted → hover foreground）

**舉一反三**：如果 Select 的 inline action gap 是 gap-2,那所有元件的 inline action gap 都是 gap-2——不需要每個元件都被糾正一次。同理,如果 MenuItem 的 description 是 reading mode min 14px,那所有 reading mode consumer 的 description 都是 min 14px。

**如果確實需要新值**,先提出理由讓使用者確認,不要自己決定後寫進去。

## 互動元素：Inline Action vs Button

加互動 icon 前，判斷用 Inline Action 還是 Button iconOnly。完整判斷樹（3 步驟 + 場景對照表）詳見 `patterns/item-layout/item-layout.spec.md`「Inline Action 設計規格」節。

## 分隔線：Separator vs CSS border

判斷核心：**誰決定「這裡要分隔」？** 完整規則詳見 `components/Separator/separator.spec.md`。

## 陰影一律用 `--elevation-*` token

**禁止** `shadow-sm/md/lg/xl/2xl`、硬寫 `box-shadow`。**允許** `shadow-none`。詳見 `tokens/elevation/elevation.spec.md`。

## Row primitives 共用 item-layout 公式

寫任何新 row 元件前，讀 `patterns/item-layout/item-layout.spec.md`。Audit grep guard 和 SidebarMenuButton 獨立實作風險也在該 spec 的「自我檢查」節。

## 清 unused imports 後必須跑 runtime 驗證

`tsc --noEmit` 不充分（曾漏抓 JSX 內 identifier 和未宣告 export）。任何 import/export 異動後：

1. `npx tsc --noEmit`（必要但不充分）
2. grep `export { }` 確認每個 identifier 都有定義
3. `npm run storybook` 實際載入動到的 story
4. 互動操作確認動態 path

## 選擇 / 狀態視覺必須對齊既有 canonical

選擇與狀態的視覺表達必須使用元件既有的 state prop,且指示器視覺必須對應 selection model。詳見 `src/design-system/patterns/item-layout/item-layout.spec.md`「選擇 / 狀態視覺規則」節。


# Tailwind 使用規則

**間距與尺寸**：Tailwind 預設間距（`p-4`、`gap-2`、`mt-6` 等）可正常使用。
需對應 token 時使用任意值：

```tsx
<div className="p-[var(--layout-space-loose)]" />
<div className="h-[var(--ui-height-36)]" />
```

## Tailwind v4 任意值：CSS variable 必須用 `var()` 包覆

**必須寫 `w-[var(--foo)]`，不能寫 `w-[--foo]`**。Tailwind v4 對任意值裡的 CSS variable 處理改了——舊的 `[--foo]` shorthand **不會自動包 `var()`**，會被當成 custom property declaration，整個 class **靜默失效**（不報錯，但完全沒效果）。

**曾經發生的 bug**：Sidebar 從 shadcn 複製的 `w-[--sidebar-width]` 在 8 個位置寬度全失效，sidebar 寬度變成 content fallback 導致主內容被蓋住。

```tsx
// ❌ 錯(v4 失效)
<div className="w-[--sidebar-width] min-w-[--sidebar-width-min]" />

// ✅ 對
<div className="w-[var(--sidebar-width)] min-w-[var(--sidebar-width-min)]" />
```

**自我檢查**：若 CSS var 相關寬高看起來怪怪的，先 `grep '\[--[a-z]'` 在 src 裡找有沒有漏網的 shorthand 語法。

**圓角**：

| Utility class   | 值                         |
|----------------|---------------------------|
| `rounded-md`   | 4px（--radius-md）    |
| `rounded-lg`   | 8px（--radius-lg）    |
| `rounded-full` | 9999px（--radius-full）|

## tailwind-merge 自訂 utility 註冊（技術陷阱）

新增任何 `text-*`、`bg-*`、`border-*`、`ring-*` 自訂 utility 後，**必須到 `lib/utils.ts` 顯式註冊到正確的 group**（font-size / text-color 等）。否則 tailwind-merge 會用 heuristic 猜分組，把不衝突的 class 誤判為衝突並 strip 掉。

**曾發生的 bug**：`text-body`（font-size）和 `text-fg-secondary`（color）被誤判同組，description 失去 font-size。

**診斷法**：`cn()` 後某個 class 消失 → 99% 是 tailwind-merge 誤判 → 去 `lib/utils.ts` 註冊。
**逃生艙**：inline style + CSS variable（`style={{ fontSize: 'var(--font-body-size)' }}`）。

## 何時可以 / 不可以用 Tailwind utility

**核可清單**（我們的元件 code 可以直接用）：

| 類別 | 允許 utility | 備註 |
|------|-------------|------|
| **Layout / Flex / Grid** | `flex`, `grid`, `items-*`, `justify-*`, `gap-*`, `p-*`, `m-*`, `w-*`, `h-*`, `min-*`, `max-*` 等 Tailwind 預設 | spacing scale `p-4` / `gap-2` 等都 OK |
| **Display / Position** | `block`, `hidden`, `absolute`, `relative`, `z-*` | |
| **我們 DS 自訂 token utility** | `bg-surface-raised`, `text-foreground`, `text-fg-secondary`, `text-fg-muted`, `border-border`, `border-divider`, `text-body`, `text-caption`, `h-field-*`, `rounded-md` 等 | 所有 semantic token 對應的 utility |
| **CSS variable 任意值** | `shadow-[var(--elevation-200)]`, `h-[var(--field-height-md)]` 等 | **必須 `var()` 包覆**,不能 `[--foo]` shorthand |

**禁止清單**：

| 類別 | 為什麼禁止 | 改用 |
|------|----------|------|
| `shadow-sm/md/lg/xl/2xl` | 繞過 elevation token 系統,沒跟 dark mode 調整聯動 | `shadow-[var(--elevation-100/200/300)]` |
| 硬寫色值 `#xxx`, `rgb(...)`, `bg-red-500` | 繞過 semantic token,dark mode / brand swap 會斷 | 對應 semantic token |
| Tailwind 預設 typography `text-xs/sm/base/lg` | 我們有自己的 `text-caption/body/body-lg/h1/h2` 系統 | 用我們的 typography token |
| 硬寫 px 值 `w-[48px]` 當有 token | 失去 token 關聯,改值時零散處要一起改 | 對應 token 或 calc() |

## shadcn compat aliases — 不給我們元件用

`semantic.css` 的「shadcn Compat Aliases」段（`--popover`, `--popover-foreground`, `--muted-foreground`, `--accent`, `--accent-foreground` 等）**只是 `npx shadcn add X` 複製貼上時的安全網**,讓 shadcn 原生 className 不會因找不到 CSS variable 而 fallback。

**我們自己 design-system 的元件 code 禁止直接使用這些 alias**:

| 禁止（shadcn alias） | 必用（我們的 token） |
|--------------------|--------------------|
| `bg-popover` | `bg-surface-raised` |
| `text-popover-foreground` | `text-foreground` |
| `text-muted-foreground` | `text-fg-muted` |
| `bg-accent` | `bg-neutral-hover` |
| `text-accent-foreground` | `text-foreground` |
| `bg-muted` | 這個是我們核可的 token（neutral-2 subtle bg）,**不是** shadcn alias,OK 用 |

**原則**：shadcn 原生 utility 只在 shadcn 自動生成的檔案**暫時**存在（作遷移緩衝）; 任何人類編輯或新增的元件 code 都必須用我們的 direct token。**用 shadcn alias = 設計 bug**,優先改為 direct token。

**為什麼**: shadcn alias 是「臨時橋」讓 shadcn add 不炸; 我們有自己 design opinion 後直接用 own token,保持 DS 單一真實來源。允許 shadcn alias 進我們的 code = 慢慢讓 shadcn 命名污染回流,DS 自主性退化。

**曾經發生的 bug**: Popover.tsx / Command.tsx 保留 shadcn template 的 `bg-popover`, `text-popover-foreground`, `text-muted-foreground`, `bg-accent`, `text-accent-foreground` 多處,2026-04-18 session 時 audit 發現統一遷移為 direct token（`bg-surface-raised` / `text-foreground` / `text-fg-muted` / `bg-neutral-hover`）。


# Token 命名原則

所有 design token（color、typography、spacing、radius、opacity 等）必須遵循一致命名邏輯——看到 token 名就能判斷它的層級、角色和關聯，不需要查文件。

## 1. Primitive vs Semantic 區分

| 層級 | 命名特徵 | 範例 |
|------|---------|------|
| **Primitive**（原始值，無語意） | `--color-*` 前綴 + 編號 / 類別 + 具體值 | `--color-blue-6`、`--color-neutral-9`、`--font-h1-size`、`--field-height-md` |
| **Semantic**（賦予 purpose） | 無 `--color-` 前綴，直接表 purpose | `--primary`、`--foreground`、`--neutral-hover`、`--inverse-fg` |

**判斷法**：看到 `--color-*` 或具體編號 → primitive；看到無前綴的 purpose 名 → semantic。

## 2. Namespace + Role 結構

Token 命名 = `--{namespace}-{role}-{variant?}`

- **Namespace**：上下文（`primary`、`error`、`neutral`、`inverse`、`fg`、`bg`、`field`）
- **Role**：角色（`fg`、`bg`、`hover`、`active`、`subtle`、`text`、`height`、`size`）
- **Variant**：變體（`secondary`、`muted`、`disabled`、`xs`/`sm`/`md`/`lg`）

範例：
- `--neutral-hover` = neutral 上下文的 hover 狀態
- `--inverse-fg` = inverse 上下文的 foreground 文字
- `--primary-subtle` = primary 上下文的 subtle 變體
- `--field-height-md` = field 上下文的 height、md 變體

## 3. 對齊既有 family

新增 token 必須鏡射既有 family 的命名模式，不孤立發明。如果新 token 找不到對應 family，先質疑是否真的需要。既有 family 詳見 `tokens/color/color.spec.md`。

## 4. 不混語義名和色名

分類元件（Tag、Avatar）和語義元件（Button、Checkbox）的 token 不能混用：

- **分類**用 primitive 色名：`var(--color-deep-orange-1)`（Tag 的 red variant）
- **語義**用 purpose 名：`var(--error-subtle)`（Button 的 destructive variant）

雖然兩者底層可能指向相同 primitive，但消費端必須明確選擇是「色」還是「義」。改 `--error` 從 deep-orange 改成別的色，不應該影響 Tag 的 red variant——這是 Tag 直接用 primitive 而非 semantic 的根本原因。

## 5. 禁止事項

- ❌ **籠統命名**：`--inverse-hover`（不知道是 text/bg/border）→ 用 `--inverse-neutral-hover` 明確指出鏡射對象
- ❌ **孤立命名**：`--strong-text` 沒對齊任何既有 family → 先找對齊對象
- ❌ **自創縮寫**：`--fg`、`--bg` 作為 base token（已用 `--foreground`、`--background`）
- ❌ **Primitive 帶語意**：`--color-primary-6`（primitive 不該有 purpose）
- ❌ **Semantic 帶色相**：`--primary-blue`（semantic 不該暗示色相）
- ❌ **Categorical 中間層**：`--blue` / `--blue-hover` 等（已廢除——Tag 直接用 primitive，Button 用 semantic）

## 6. 新增語意色相必須依照 SOP

新增 semantic 色相必須完整執行 4 步（primitive base → semantic 五件套 → dark mode 反轉 → Tailwind bridge）。詳見 `tokens/color/color.spec.md`「新增語意色相的標準流程」。

## 7. 色彩架構流派

本系統採 **Atlassian-style Semantic State Token** 流派。靜態色用 primitive，互動狀態用 semantic state token。新增色彩 token 前必讀 `tokens/color/color.spec.md`「架構流派定位」段落。


# 元件 Props 命名原則

**按「是什麼」命名，不按「在哪裡」命名。** 參考 Material（Chip: avatar / icon / deleteIcon）、Ant Design（Tag: icon / closeIcon）等世界級設計系統。

- slot 只接受 icon → 命名帶 `icon`（如 `startIcon`、`endIcon`），型別用 `LucideIcon`，元件內部控制尺寸
- slot 接受任意視覺元素 → 命名描述內容類型（如 `avatar`），型別用 `ReactNode`
- slot 是行為 → 用 callback（如 `onDismiss`），元件內部渲染互動元素並控制尺寸與樣式
- ❌ 不用 `prefix` / `suffix` / `left` / `right` 等純位置名——這些不傳達內容本質，也無法約束型別


# shadcn 元件規範

元件位置：`src/design-system/components/{ComponentName}/`

每個元件一個資料夾：
- `{name}.tsx` — 元件本體
- `{name}.spec.md` — 使用原則與設計規範
- `{name}.stories.tsx` — 展示（設計規格的便利瀏覽版）
- `{name}.anatomy.stories.tsx` — 設計規格（完整技術規格）
- `{name}.principles.stories.tsx` — 設計原則（do/don't 使用判斷）

新增 shadcn 元件：

```bash
npx shadcn add card
npx shadcn add input
```

元件結構範例：

```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const componentVariants = cva('base-classes', {
  variants: {
    variant: { /* ... */ },
    size: { /* ... */ },
  },
  defaultVariants: { /* ... */ },
})

interface ComponentProps extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof componentVariants> {}

const Component = React.forwardRef<HTMLDivElement, ComponentProps>(
  ({ className, variant, size, ...props }, ref) => (
    <div className={cn(componentVariants({ variant, size, className }))} ref={ref} {...props} />
  )
)
Component.displayName = 'Component'

export { Component, componentVariants }
```

Import 路徑：

```tsx
import { Button } from '@/design-system/components/Button/button'
import { cn } from '@/lib/utils'
// 不再有 tokens.ts — 顏色與字體直接用 CSS 變數或 Tailwind class
```

## cva 的適用範圍（何時用、何時不用）

`cva()` 是系統管理 **className 變體**的標準工具,但**不是所有變體都該用 cva**。合法的**非 cva** 實作模式：

| 變體類型 | 實作方式 | 範例 |
|---------|---------|------|
| className 變體（bg / text / border / size / state） | **`cva()`** | Button / SegmentedControl / Chip / Tag / Field Controls 等絕大多數 |
| **Style prop 驅動的 variant**（需要 `style={{ backgroundColor: 'var(--...)' }}`）| **Object map / lookup table**（world-class:Material / Ant / Polaris 同樣做法） | **Avatar** 的 color variants 驅動 inline style;cva 無法產 style object |
| **結構性變體**（不同 mode 是不同 layout,不只 class swap） | **Conditional rendering / sub-components** | **FileItem** 的 `compact / rich` mode 有不同 flex 結構 |

**判斷法**：
- 變體差異只有 className（同一棵 JSX 樹）→ cva
- 變體差異要 inline style 物件 → object map + `style={{ ... }}`
- 變體差異是不同 JSX 樹（不同 children layout / 不同 wrapper）→ conditional rendering

**禁止**：
- ❌ 為了「一律用 cva」硬把 style prop 變體塞進 cva(無法優雅產出 style object)
- ❌ 為了「一律用 cva」把不同結構的 mode 強制壓到同一棵 JSX 配 className 切換(code 會長滿 `{mode === 'rich' && ...}` hacks)

**當前系統 documented 例外**：
- `Avatar`: color variants 用 object map(原因:inline style prop)
- `FileItem`: mode variants 用 if-branches(原因:結構性差異,不是 class swap)

## 元件不得自包 Provider

**Tooltip / Theme / Toast / Portal 等 Provider 一律由應用層**（`main.tsx`、Storybook `preview.tsx`）**統一設定**。元件本體**禁止自包 `TooltipProvider` / `ThemeProvider` / `ToastProvider` 等 Provider**。

**曾經發生的 bug**：shadcn 原版 `SidebarProvider` 內部預設包 `TooltipProvider delayDuration={0}`,會強制覆寫 app-level 的 delay 設定，讓整個 sidebar 的 tooltip 立即彈出、破壞全站 hover 節奏。從 shadcn 複製元件時**務必檢查並移除**這類內建 Provider。

### 為什麼

Provider 是**應用層配置**（delay、theme、portal target、toast position），元件包 Provider 等於劫持這些配置。元件只消費 context，不建立 context——除非 context 是該元件「擁有」的狀態（如 `SidebarProvider` 的 `open`、`DropdownMenu` 的 `size`）。

### 判斷法

- Context 是**行為狀態**（open / close / size / current item） → **可包**（這是元件的狀態管理）
  - 例如 `SidebarProvider.open` / `DropdownMenuContext.size`——這些是元件自己擁有的狀態,**不是**禁止包的 app-level 配置 Provider。
- Context 是**全域外觀配置**（delay / theme / portal / variant defaults） → **禁止包**（屬於應用層）


# 系統內部 Layout — 4-Family Model

**每個元件 spec 第一段必須聲明 Layout Family**（1/2/3/4 或「非上述 family，自己的結構」）。這確保相同用途用相同 layout，遇到相同情境 AI 能舉一反三。

## 4 個可繼承的 Layout Family

| Family | 用途 | 結構 | Sizes baseline | SSOT |
|--------|------|------|----------------|------|
| **1. Menu item layout** | Menu 容器內的掃視單列（scanning mode）| `[small icon/avatar 16-20px] [content: label 單行 + desc 選用] [small suffix]`, tight density, leading-compact | **sm / md / lg** | `patterns/item-layout/item-layout.spec.md`「Menu item」章節 |
| **2. List item layout** | 頁面上的閱讀式單列（reading mode）| `[larger icon/avatar 20-24px] [content: label + multi-line desc OK] [suffix action/button/counter]`, looser density, reading typography | **sm / md / lg** | `patterns/item-layout/item-layout.spec.md`「List item」章節 |
| **3. Pill layout** | 單行互動 pill（action trigger / data indicator）| `[startIcon?] [<span px-1>label</span>] [suffix badge/endIcon/dismiss]`, single-line, whitespace-nowrap | **sm / md / lg + 可選 xs**（xs = 24px 固定，icon-only toolbar utility 專用） | `components/Button/button.spec.md`「Pill Layout」章節 |
| **4. Field control layout** | 單行可編輯資料輸入 | `fieldWrapperStyles + [startIcon?] [<editable content>] [endAction?]`, **視覺對齊 Family 1** 讓 SelectMenu trigger + options 對齊 | **sm / md / lg** | `components/Field/field-controls.spec.md` |

## 尺寸 baseline 規則

**每個 Family 都有明文 baseline sizes**。消費者元件**必須**實作 baseline，除非有合理理由偏離。偏離必須在元件 spec 明文記錄。

**合法偏離模式**：

| 偏離類型 | 範例 | 合理理由 |
|---------|------|---------|
| **單一固定 size** | Chip (`h-field-sm`) / Notice/Alert/Toast（通知語意） | 世界級共識（Material 3 filter chips / Material Banner）:此類元件不需要密度選擇 |
| **Alias** | Tag lg=md=24px | 子元件補齊原則（discrete tier）:消費端傳 size 時不 break,但視覺上等同 |
| **Mode 取代 Size** | FileItem (`detail` / `compact`) | **結構變體**非密度變體——不同 mode 是不同 layout 不是不同高度,用 size 會誤導 |
| **額外 xs**（Family 3 only） | Button / SegmentedControl xs | icon-only toolbar utility（24px 固定 不配對 Field） |

**違反但無理由 = 設計 bug**,必須改 code 或補 spec 理由。

## Consumers 快速查

| Family | Canonical | Consumers |
|--------|-----------|-----------|
| 1 Menu item | `MenuItem` | `TreeItem`, `SidebarMenuButton`, `DropdownMenuItem`（重用 MenuItem） |
| 2 List item | (無單一 canonical) | `StepItem`（例外：indicator 對齊）, `FileItem`（icon 作邊界）, `Notice` → `Alert/Toast`（視覺一致非語意）, `SelectionItem` variant（prefix 為 selection control）→ `RadioGroup` / `Checkbox` group |
| 3 Pill | `Button` | `SegmentedControlItem`, `Chip`, `Tag`（data indicator variant—見下） |
| 4 Field control | `Input`（field-controls SSOT） | `NumberInput`, `DatePicker`, `Select`, `Combobox`, `LinkInput`, `PeoplePicker` |

## Family 3 兩個 sub-profile（重要）

同結構、不同 role、不同 padding / typography：

| Sub-profile | 成員 | Padding | Typography | Cursor | 為什麼 |
|-------------|------|---------|-----------|--------|------|
| **Action trigger** | Button, SegmentedControl, Chip | 較鬆（xs=`px-2`, sm+=`px-3`） | 對應 size 的 font-medium | pointer | 需要命中區 + 視覺重量搶點擊焦點 |
| **Data indicator** | Tag | 較緊（`px-1` 所有 size） | font-normal | text | Passive 讀取，不搶焦點 |

## Size Pairing 規則（跨 Family）

| Pairing | 意義 |
|---------|------|
| Tag md ↔ Field md, Tag sm ↔ Field sm | Tag 的 size 對應同名 Field size，視覺對齊 form 內字級 |
| Button sm/md/lg ↔ Field sm/md/lg | Button 配對 Field 時 size 同名 |
| Button xs = 獨立 utility | 不配對 Field，用於 toolbar compact button |
| Family 4（Input/Select 等）視覺對齊 Family 1 | 讓 trigger + dropdown options 視覺連續 |

## 新元件判斷流程

1. **垂直列表裡？** → Family 1（menu 容器內）或 Family 2（頁面）
2. **單行可點擊/可讀的 pill？** → Family 3（action trigger or data indicator）
3. **單行可編輯資料？** → Family 4（必須視覺對齊 Family 1）
4. **都不是？** → **停下來討論**——是新 family 還是 self-contained

## 不進 Family Model 的元件

不能舉一反三的不分類：
- **Self-contained primitive**：Switch / Checkbox / Radio / Avatar / Badge / Spinner / Skeleton / Separator —— 各自獨立視覺，無 slot 結構
- **Composite / multi-section**：Dialog / Sheet / NameCard / DataTable / Tabs / Sidebar / Popover / Tooltip / HoverCard / DropdownMenu / SelectMenu / Command / OverflowIndicator / Breadcrumb / Empty / DescriptionList —— 多區塊組合，各自 own 自己的 layout

這些元件的 spec 直接描述自己的結構，不套 family。

## 允許的跨 Family 視覺對齊（不是混 layout）

Family 4 的 Input / Select 視覺對齊 Family 1 的 menu-item（高度、字體、icon size）——但兩個 family **各自 own SSOT**。這是「視覺對齊」非「結構繼承」。

## Field Composition（不在 family 但相關）

`components/Field/field.spec.md` 描述 **form field composition pattern**——Field 容器如何包 Family 4 control + label + help。這是不同 scope 的 pattern（composition 非 element layout），不列入 4-Family。


# 元件完成清單

每個元件在進入 design-system 前必須逐項對照。這是品質閘門，不可跳過。

**本節是純 checklist**——規則定義在各自的 canonical home，此處只做 checkbox + pointer。勾每項前先讀該 pointer 指向的章節。

## Spec（`{name}.spec.md`）
> 規則定義：`# Spec 規則`

- [ ] 元件定位一句話（是什麼 / 不是什麼）
- [ ] 定位段落宣告實作基礎（基於 Radix X / cmdk / sonner / native / 自建 + 理由）
- [ ] 每個 prop / variant / size / state 都有「何時用 / 何時不用」+ 理由
- [ ] 互斥規則列出（哪些 props 不能並用）
- [ ] 每個規則有「為什麼」（寫 rationale，不只結論）
- [ ] 術語一致（同一概念不用兩種名稱）
- [ ] 無視覺描述污染（「窄長形」「會變寬」等屬 story 不屬 spec）
- [ ] 禁止事項（❌）列出常見誤用
- [ ] 邊界案例覆蓋（disabled / loading / empty / dark mode / density / icon-only 適用時）
- [ ] 「相關」section 指向近親元件 + SSOT pointer（reciprocal 成立）
- [ ] 對標世界級 DS 的 7 個維度（何時用 / 分界 / 常見誤解 / 相關 / 空值 / 驗證時機 / a11y）

## Code（`{name}.tsx`）
> 規則定義：`# UI 開發規則`、`# shadcn 元件規範`、`# Tailwind 使用規則`、`# Token 命名原則`、`# 元件 Props 命名原則`

- [ ] 以 shadcn 為基底，forwardRef / displayName / asChild / ...props spread 齊全
- [ ] variants 用 cva()，不條件拼字串
- [ ] 同時 export 元件本體 + cva（供外部組合）
- [ ] 保留 Radix `data-state` / `data-disabled` / `data-orientation` 等 attribute
- [ ] 樣式優先用 `data-*` selector，而非自訂 class 模擬狀態
- [ ] 無硬寫顏色 / 字體 / padding / radius / 高度——全用 design token
- [ ] `cn()` 合併 class；Tailwind v4 CSS var 必用 `var(...)` 包覆
- [ ] 未包 Provider（Tooltip / Theme / Toast 等由應用層設定）
- [ ] Props 命名按「是什麼」而非「在哪裡」（icon / avatar / onDismiss，不 prefix / suffix）
- [ ] 互動元素有 ARIA 屬性；icon-only 有 `aria-label`
- [ ] 若屬 field-height family，`defaultVariants.size = 'md'`
- [ ] 若修改 cva `defaultVariants`，已同步 spec / docblock / anatomy（詳見 `# Story` → 連動更新規則）

## Stories（展示 / 設計規格 / 設計原則）
> 規則定義：`# Story`（檔案放哪 / 命名 / 三層定位 / 範例選擇原則 / anatomy 標準 / 連動更新）

- [ ] 範例選擇原則的自我檢查清單全部打勾（詳見 `# Story` → 範例選擇原則 → 自我檢查清單）
- [ ] 設計規格 5 個 story 齊全（總覽 / 檢閱器 / 色彩對照 / 尺寸對照 / 狀態行為）
- [ ] TOKEN_MAP / SIZE_SPECS 資料與 cva() 定義完全一致
- [ ] Rule note 傳達原則（「為什麼」），不只結論（「是什麼」）
- [ ] Storybook title 對齊命名規則；元件放對 `Components/` vs `Internal/`
- [ ] 每個重要規則有正確範例；常見誤用有錯誤範例（對比呈現）

## 上線前

- [ ] `npm run storybook` 本地確認所有 stories 正常渲染
- [ ] `npx tsc --noEmit` 無錯誤
- [ ] Import 路徑正確（`@/design-system/...`）
- [ ] 若為 internal primitive 或 shadcn passthrough，CLAUDE.md 目錄結構分類標註正確


# 正式系統與探索區的區別

| 區域 | 用途 |
|------|------|
| `src/design-system/` | 正式、已定案、可重用的元件與模式 |
| `src/explorations/` | 比稿、版本比較、尚未定案的 prototype |

正式產品程式碼不得 import `src/explorations/`。


# Exploration 規則

所有未定案的 prototype 放在 `src/explorations/{topic}/`，每個題目一個資料夾：

```
src/explorations/create-project-form/
  ├── CreateProjectForm.v1.stories.tsx
  ├── CreateProjectForm.v2.stories.tsx
  └── notes.md
```

- 同一題目所有版本放在同一資料夾
- `notes.md` 記錄差異、假設、比較重點
- explorations 可隨時刪除，不視為正式產品程式碼


# Story

Story 是設計系統的展示 + 教學 + 規格文件。本節涵蓋：
- 檔案放哪（正式 / exploration）
- Storybook title 命名
- 三層定位（每層做什麼）
- 範例選擇原則（例子怎麼寫——建立與審查共用）
- 設計規格 Story 標準（anatomy 專用）
- 連動更新規則（改 code / spec 必須同步 story）

## 檔案放哪

| 類型 | 位置 |
|------|------|
| 正式 story | `src/design-system/components/**` 或 `src/design-system/patterns/**` |
| Exploration story | `src/explorations/{topic}/` |

不要把 exploration stories 放進 design-system，反之亦然。

## Storybook title 命名規則

```
Design System/Tokens/{TokenName}                          ← Color, Typography, Density...
Design System/Patterns/{PatternName}                      ← Item Layout, Action Bar...
Design System/Components/{ComponentName}/展示              ← public-facing 元件
Design System/Components/{ComponentName}/設計規格
Design System/Components/{ComponentName}/設計原則
Design System/Internal/{ComponentName}/展示                ← internal primitive（Menu, SelectMenu, Notice...）
Design System/Internal/{ComponentName}/設計規格
```

- 第一層分類用英文（Components / Internal / Patterns / Tokens）
- 元件名用 PascalCase 英文（與資料夾名一致）
- 子頁面用中文（展示 / 設計規格 / 設計原則）
- 不在子頁面前加元件名（❌ `MenuItem 展示` → ✅ `展示`）

### Internal vs Components 判斷 test

決定元件用 `Internal/` 還是 `Components/` 時,問三題:

1. **元件本身有預設視覺嗎?**（bg / border / shadow / padding / rounded）
   - 有 → Components/ 候選
   - 沒有(consumer 必須自己加)→ **Internal/**

2. **直接 `<X>` 放頁面會有視覺嗎?**
   - 有 → Components/ 候選
   - 不會(必須包 visual wrapper 才看得見）→ **Internal/**

3. **所有消費者都包成自己的元件嗎?**
   - 否(有場景直接用)→ Components/ 候選
   - 是(都包成 NameCard / OverflowIndicator / DropdownMenu 這類 wrapper)→ **Internal/**

三題都傾向 Internal → 放 `Internal/`；任一題明確傾向 Components → `Components/`。

**現有案例**:
- **Components/**:Button, Input, Select, Dialog, Popover, Sheet(有預設視覺、可直接用)
- **Internal/**:Menu, SelectMenu, Notice, SelectionControl, OverflowIndicator, HoverCard, Command(行為 primitive,無預設視覺,必被包裝)

**常見誤判點**:`HoverCard` 名字像 public 元件,但它是純行為 primitive(沒視覺),應該 Internal/。判斷看**行為不看名字**。

## 三層定位

每個元件有三種 story，各有明確職責，互不重複：

| 層 | 檔案 | 職責 | 類比 |
|---|---|---|---|
| **展示** | `{name}.stories.tsx` | 設計規格的便利瀏覽版——視覺目錄，快速掃視所有 variant / size / state 的渲染結果 | 車子展示間 |
| **設計規格** | `{name}.anatomy.stories.tsx` | 完整技術規格——token 查閱、尺寸藍圖、對照表。取代 Figma inspect + 規格標註 | 車子規格表 |
| **設計原則** | `{name}.principles.stories.tsx` | 使用判斷指南——do / don't、情境選擇、排列規則 | 駕駛手冊 |

**關係**：展示是設計規格的便利展示版（看結果），設計規格是精確查閱（查 token），設計原則是情境判斷（做決策）。三層從「看」到「查」到「判斷」，閱讀深度遞進。

## 範例選擇原則（建立與審查共用）

**每次新增、修改、或審查 story 範例時的第一準則——適用 `.stories.tsx` / `.principles.stories.tsx` / `.anatomy.stories.tsx` 的所有範例情境。**

### 最高準則：用耳熟能詳的真實業務場景，禁止極端 / 虛構 / 佔位案例

Storybook 是**公開文件**，受眾是任何打開的設計師 / 開發者 / PM。範例的核心功能是**教學**，不是展示元件能跑——不是跑得起來就算，而是要讓讀者從範例**推得出自己產品該怎麼用**。

#### 合法場景來源（按優先序）

1. **對標世界級 SaaS 的真實功能**：Jira task status、Linear priority、Slack DM notification、Notion settings toggle、Figma toolbar、GitHub PR review、Stripe 付款、Airtable filter、Google Docs 權限設定
2. **台灣 / 全球常見業務流程**：電商結帳（信用卡 / 轉帳 / 貨到付款）、訂閱方案（月付 / 年付 / 企業）、文件協作（編輯 / 評論 / 唯讀）、表單提交（送出 / 儲存草稿 / 放棄變更）
3. **該元件原生生態的慣用場景**：Segmented 的「全部 / 進行中 / 已完成」、Tabs 的「總覽 / 活動 / 成員 / 設定」、RadioGroup 的付款方式、Checkbox 的同意條款

#### ❌ 明確禁止

| 禁止類型 | 範例 | 為什麼 |
|---------|------|-------|
| **佔位符** | `Option A / B / C`、`Lorem ipsum`、`foo / bar`、`Test value` | 無情境，讀者學不到任何東西 |
| **抽象代號** | `按鈕一 / 按鈕二`、`Variant X`、`Rule A / B` | 不是產品語言，破壞「受眾是設計師」的前提 |
| **極端不現實案例** | 單一 button「刪除全部使用者資料包含備份無法復原」、filter 有 50 個項目、dialog 嵌套 5 層 | 非日常使用情境，失去教學價值（不是「邊界測試」就該留——邊界測試屬於 `.anatomy.stories.tsx` 的 edge case section，principles 不放） |
| **視覺符號表達式** | `│─ 業務 ─│`、`A → B → C`、ASCII art | 不是產品 UI，污染 Storybook 視覺 |
| **spec 內部代號** | 「符合 Rule 3.2」「遵循 Convention A」 | 讀者沒讀 spec 也要看得懂 |

### 兩個驗收 test（寫完 / 審時自問）

#### Test 1 — 「人」test
新加入的設計師打開 Storybook，**遮住所有 title / label / note**，只看元件裡的文字和情境，能不能 5 秒內說出「喔這是在做 X 流程」？
- 能 → 場景有教學力
- 不能 → 改成具體業務場景，不是補說明文字

#### Test 2 — 「舉一反三」test
讀者看完這 3-5 個範例，**推得出自己專案類似情境該怎麼用嗎**？
- 能 → 範例涵蓋了決策維度（如 RadioGroup 的付款方式 + 訂閱方案 + 權限角色 = 教會讀者「決策節點類」的三個面向）
- 不能 → 範例之間同質、缺維度——增加互補場景而非重複

**黃金比例**：5 個具代表性的真實場景 > 20 個重複 placeholder。

### 正確範例（✅）對照

- **Button**：「送出表單 / 儲存草稿 / 放棄變更」（表單流程三按鈕）、「刪除專案」（destructive confirm）
- **Badge**：「3 個新通知」、「未讀訊息 12」、「必填」、「Beta」
- **SegmentedControl**：「總覽 / 活動 / 成員 / 設定」（workspace tab）、「日 / 週 / 月」（時間範圍）
- **RadioGroup**：「信用卡 / 銀行轉帳 / 超商付款」（付款方式）、「月付 / 年付（省 20%）/ 企業」（訂閱）
- **Switch**：「Bluetooth 開 / 關」、「Email 通知」、「Dark mode」
- **Checkbox**：「我同意服務條款」、「寄送促銷 email」（訂閱偏好）

### 適用範圍

| Story 類型 | 適用性 | 備註 |
|-----------|-------|------|
| `.principles.stories.tsx` | **最嚴格** | 教學性高，範例品質 = 設計系統品質 |
| `.stories.tsx`（展示） | 嚴格 | 範例代表元件「日常應該長這樣」，不是 test case |
| `.anatomy.stories.tsx` | 彈性 | token 藍圖 / inspect 面板可用合成內容，但**元件渲染範例仍須真實場景** |
| `explorations/` | 寬鬆 | 比稿可用抽象內容，但定案後轉入正式系統前須替換 |

### Rule note 品質

**Rule note 必須傳達原則而非結論**，讓讀者能舉一反三——寫「為什麼」而不只是「是什麼」。例如：
- ❌「禁止 primary」 → ✅「工具層必須是視覺重量最低的一層，否則搶走業務焦點」
- ❌「全程 icon-only」 → ✅「這些 icon 在此脈絡下約定俗成，使用者不需 label 就能辨識」

### 視覺與文案品質

- **Toolbar 範例**統一使用 `ToolbarFrame`（滿版 + 短標題），不用裸 `ButtonGroup` 漂在半空
- `ToolbarFrame` 標題模擬真實產品（2–4 字如「文件」「專案」），說明放在下方 `Label`，不塞進標題導致文字與按鈕碰撞
- 同一個 story 內的範例容器必須一致，不混用不同寬度
- ❌/✅ 判斷放在 `Label`，不放在 ToolbarFrame 標題內
- **排版層級清晰**：主標用 `h3`（深色、正常大小），副標用 `text-caption`（灰色、限寬 720px），Label 用 `text-footnote`（最小字、範例解說）。三層視覺上必須有明顯區隔
- **icon-only 按鈕有 `aria-label`**；互動範例可用鍵盤操作

### 自我檢查清單

寫完 / 審時逐條打勾：

- [ ] 所有範例文字是真實產品可能出現的句子（不是 Option A/B/C、不是「按鈕一」）
- [ ] 每個範例可追溯到世界級 SaaS 或常見業務場景（能說出「這參考 Jira / Stripe / Notion 哪個功能」）
- [ ] 沒有極端不現實案例（50 個 filter、5 層 dialog、單 button 寫滿 3 行）
- [ ] 「人」test 通過（遮標題光看元件懂情境）
- [ ] 「舉一反三」test 通過（讀者能推出自己產品該怎麼用）
- [ ] Label / note 沒有 spec 代號（Rule A、Variant X）或抽象符號表達式
- [ ] Rule note 傳達原則（「為什麼」），不只是結論（「是什麼」）

## 設計規格 Story 標準（`{name}.anatomy.stories.tsx`）

以 `Button/button.anatomy.stories.tsx` 為範本。每個元件的設計規格必須包含以下 story：

### 1. 元件總覽
- Anatomy 圖——標示所有 slot（標準版面 + iconOnly 等變體版面）
- Variant 一覽——每個 variant 一行：渲染元件 + 一句話角色描述
- Props 速查表——prop / type / default / 說明

### 2. 元件檢閱器（取代 Figma inspect）
- 控制項：variant / danger / state / size / iconOnly（依元件調整）
- 左側：即時預覽 + 尺寸藍圖
- 右側：Inspect 面板，分區顯示 Color / Layout / Typography / Style
- **State 使用開發術語**：default / hover / active / disabled（不用 rest）

### 3. 色彩對照表
- Variant × State 矩陣
- 每格：渲染元件 + bg / text / border token 標註（含即時色塊）
- 標準 variant 與 danger variant 分開

### 4. 尺寸對照表
- Size token 對照表（每個 size 的所有 token 一覽）
- 含 iconOnly 等變體模式的覆寫說明
- 視覺預覽矩陣（Variant × Size，含變體模式）

### 5. 狀態行為
- 每個互動狀態的前後對照（如 loading spinner 替換規則）
- 所有 variant 的 disabled 渲染（含變體模式）
- 元件特有狀態（如 checked toggle）

### 設計規格品質規則

- **Token-first**：所有數值以 token name 為主（如 `h-field-sm`），resolved px 值為輔助灰字。開發者只需確認 token 正確——theme / density 的值解析由系統處理
- **不含 density 雙值**：不顯示 `28px (md) / 32px (lg)`，只顯示 token name + 當前 resolved 值
- **Dev 語言**：使用開發術語（default 不是 rest，用 Tailwind utility name 如 `px-3` `gap-1`）
- **藍圖完整性**：render 函式中**每一層**的 padding / margin / gap 都必須在藍圖中呈現——包括子元素的間距（如 label span 的 `px-1`），不可遺漏
- **範例驗證**：每個範例必須用 spec.md 的所有規則逐條驗證（如 badge 不應出現在 loading / disabled 狀態）
- **色塊即時渲染**：使用 `var()` 內聯樣式，確保切換 dark mode / density 時自動更新
- **資料正確性**：TOKEN_MAP / SIZE_SPECS 等資料必須與元件 `.tsx` 的 `cva()` 定義交叉比對，確認完全一致
- **值溯源完整性**：設計規格中出現的每個行為描述，必須追到 code 中的具體值。不可只描述行為模式而省略數值——包括 Provider 層級設定（如 `delayDuration`）、全域設定檔（`main.tsx`、`preview.tsx`）、CSS 變數定義檔。規則：**如果 code 裡有具體數字，設計規格就必須標出來**

## 連動更新規則

三份文件互為依賴，任一變動必須同步更新其他兩份：

| 異動來源 | 必須連動更新 |
|---------|-------------|
| **`.tsx` 元件程式碼**（variant / size / token / 內部結構） | → 設計規格（TOKEN_MAP、SIZE_SPECS、藍圖、Inspect 面板）<br>→ 展示（如有對應的 story） |
| **`.spec.md` 設計原則**（新增 / 修改 / 刪除規則） | → 設計原則 stories（do/don't 範例必須反映最新 spec）<br>→ 設計規格（範例驗證：確認規格中的範例不違反新規則） |
| **設計規格 story**（結構調整、新增對照維度） | → 展示（確保展示仍是規格的便利瀏覽版，不脫節） |

**執行方式**：修改元件 `.tsx` 或 `.spec.md` 後，必須主動檢查並更新對應的 story 檔案。不可只改程式碼而留下過時的規格文件。

### 高風險漂移點：`cva()` defaultVariants

**`defaultVariants` 是三方（code / spec / story）最容易漂移的位置，改之前必須意識到四方聯動：**

| 改什麼 | 必須同步 |
|--------|---------|
| `cva()` 裡的 `defaultVariants.size`（或 variant / state） | 1. 元件 `.spec.md` 的 prop 表 / 預設標記<br>2. 元件 `.tsx` 頂端 docblock 的 `★ 預設` 標記<br>3. `{name}.anatomy.stories.tsx` 的 SIZE_SPECS 表 / default marker<br>4. 若屬 field-height family → `tokens/uiSize/uiSize.spec.md` 的 family 清單 |

**曾發生的 bug**：SegmentedControl 的 cva `defaultVariants.size` 是 `md`，spec.md + docblock + anatomy 都寫 `sm ★default`——三方不一致持續存在到 audit 才發現（2026-04-18 修正）。

**預防法**：改 `defaultVariants` 前，grep 該元件所有檔案（`grep "★\|預設\|default" src/design-system/components/{Name}/`），一次改完所有出現位置，不單改 code 就收工。


# Prototype 建立流程

1. 描述畫面結構
2. 列出使用到的 design-system 元件
3. 說明假設
4. 在對應 topic 資料夾下建立 story 檔案

本專案的 prototype 展示以 Storybook 為主。


# 清理規則

若某個 exploration 題目不再需要，刪除整個資料夾。
不再使用但需保留的內容移至 `src/explorations/_archive/`。
