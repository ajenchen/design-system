# 每次任務前的 5 條 mindset（世界級設計系統的工作底色）

這 5 條是本專案所有規則背後的**態度**。接到任務先複習一遍，再看具體規則。

1. **對標世界級 + 不取巧省工**——每個設計決策都要能回答「Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 怎麼做？我們為什麼一樣 / 為什麼不同？」。沒對齊又說不出不同的理由 = 設計 bug。**視覺上也必須跟世界級一樣整齊**：用我們的 token / 元件換掉第三方樣式時，不能讓視覺比原版鬆散、錯位、比例失調——「符合我們的設計語言」和「視覺整齊度不輸原版」是**同時成立**的要求，不是二選一。**遇到取捨禁止以「選較簡單」「省 N 個 edits」為由選 shortcut**——一律選最世界級做法。說到「快速修」「省工程」是 yellow flag,停下重想。權宜若真必要,明說是權宜 + 存 tech debt + 將來回來重做。
2. **不憑直覺發明**——新增任何值 / 名 / pattern / 視覺結構前先 `grep` 既有,**也包含 layout primitive**(見 `# 建立 UI 前必讀` 的「既有 layout primitives 清單」)。若新元件的視覺結構命中既有 primitive(item-anatomy / overlay-surface / Empty 等),必消費不重寫。專案已有的 gap、padding、font-size、命名慣例優先沿用；不是「看起來順」就能造新值。
3. **改一處必看三處**——code / spec / story 三方聯動是常態，不是例外。改 cva `defaultVariants`、改 variant、改 token 前先 grep 該元件所有檔案，一次改完。
4. **範例必須是真實業務場景**——Jira / Stripe / Notion / Figma 等可辨識的情境；禁止 `Option A/B/C`、「按鈕一」、極端不現實、ASCII art。Storybook 的受眾是任何打開它的人，不是作者。
5. **猶豫就問，不往前推**——遇到無前例的設計決策：(a) 先 grep 既有 pattern，(b) 讀近親元件 spec，(c) 仍不確定就停下問使用者。**禁止憑直覺造新 pattern**——這是本專案最常被糾正的錯誤。

每條規則展開請讀後面對應章節（`# Spec 規則`、`# UI 開發規則`、`# Story`、`# 命名與語言一致性` 等）。


# 任務導航表（做 X → 讀 Y）

接到任務後先對照這張表，找出必讀章節再動手。**章節名即 `#` heading**，可用 grep 直接跳。

| 任務類型 | 必讀章節（按順序） |
|---------|-----------------|
| **新增元件** | `# 建立 UI 前必讀` → `# shadcn 元件規範` → `# Spec 規則` → skill `/component-quality-gate` |
| **修改元件 variant / size / state** | 該元件 `spec.md` → skill `/story-writing`(Phase 4 連動) → `# 失敗記憶索引` |
| **改 cva `defaultVariants`** | skill `/story-writing` Phase 4 高風險漂移點 + `# 失敗記憶索引` → 三方漂移 |
| **新增 / 修改 token** | `tokens/README.md` charter → `# Token 命名原則` → 對應 `tokens/xxx.spec.md` |
| **新增 / 修改 pattern** | `patterns/README.md` charter → `# 建立 UI 前必讀` → 對應 `patterns/{name}/spec.md` |
| **寫任何 story** | skill `/story-writing`(含 anatomy 標準 + 範例選擇 + 自我檢查) |
| **跨元件比較 / 加 SSOT pointer** | `# Spec 規則` → SSOT 規則與 anchors 清單 |
| **命名新檔案 / 變數 / prop** | `# 命名與語言一致性` + `# 元件 Props 命名原則` |
| **新元件的內部 layout 選型** | `# 系統內部 Layout — 4-Family Model` 判斷流程 → `patterns/element-anatomy/item-anatomy.spec.md`(完整 taxonomy) |
| **新 skill / hook / command** | 對應 `.claude/{home}/README.md` charter → `design-system-audit/references/rule-placement.md` |
| **無明確前例的設計決策** | `# 遇不確定時的協議`(先 grep → 讀近親 spec → 仍不確定就問) |
| **Tailwind / CSS 出怪事** | `# Tailwind 使用規則` + `# 失敗記憶索引` → 技術陷阱 |
| **spec 跟 code 結論衝突** | `# Spec 規則`(主動提出討論,不默默改) |
| **在 classification-sensitive dir 建新檔** | **先 Read 該 dir 的 `README.md` charter**(硬規則,見 `# 規則分層`) |

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


# 規則分層（8 個 home，寫任何新規則前先決定位置）

設計系統的知識分 8 個 home。**寫任何新規則、新文件、新協議前,先跑下方「放哪裡 decision flowchart」——不要全部塞進 CLAUDE.md**。

## 8 個 home(一行索引)

| Level | Home | 收什麼 |
|-------|------|--------|
| 1 | `CLAUDE.md` | 每 session signal 的 DS 規則 / 技術陷阱 / 架構判斷框架 |
| 2 | 元件 `{name}.spec.md` | 單元件的「何時用 / 為什麼」設計規則 |
| 3 | Pattern `spec.md`(`src/design-system/patterns/`) | **runtime** 跨元件佈局 / 互動 primitive(非文件指南) |
| 4 | Code(`.tsx` / `.css`) | cva / 型別等機械強制的實作細節 |
| 5 | Skill(`.claude/skills/*/SKILL.md`) | **只在 invoke 情境**的多步驟 workflow + checkpoint |
| 6 | Memory(`~/.claude/.../memory/`) | 跨 session 狀態(audit progress / tech debt / user pref) |
| 7 | Hook(`.claude/hooks/*.sh`) | 可機械化的 pre/post tool 自動檢查 |
| 8 | Slash Command(`.claude/commands/*.md`) | 一次性單步 action(目前無 commands) |

當前 6 skills:`/design-system-audit` / `/product-ui-audit` / `/prototype` / `/delivery-handoff` / `/component-quality-gate` / `/story-writing`。當前 5 hooks:`pre_edit_spec_check` / `check_sync_update` / `check_token_hygiene` / `block_prototype_imports` / `enforce_home_charter`。

各 home 完整 scope / 「收什麼、不收什麼」細節 / 未採納能力(sub-agent / MCP / output-style)評估 → `.claude/skills/design-system-audit/references/rule-placement.md`。

## 硬規則:classification-sensitive dir 的 charter gate

**Write 新檔到以下 dir 前,必先 Read 該 dir 的 `README.md` charter:**
- `src/design-system/patterns/` / `components/` / `tokens/`
- `.claude/skills/` / `hooks/` / `commands/` / `agents/`

每個 charter 明列「這裡只收 X / 不收 Y / 新增 criteria」。`enforce_home_charter.sh` hook 在 Write 新 subdir / flat file 時自動注入 charter 到 context,AI 必須依 charter 的三題 verification(收?不收?過 criteria?)判斷後才 proceed。**misclassification 在 tool 時被攔截,不靠 AI 記憶**。

## 放哪裡 decision flowchart

**從 Q1 開始回答,第一個 YES 就是家**:

```
Q1. 是設計規則嗎?(如何寫 spec / code / token / story / pattern)
    → YES: 進 Level 1-4(按影響範圍 + 判斷法)
    → NO: 繼續 Q2

Q2. 只在「特定 invoke 情境」才需要嗎?(audit / code review / setup 等)
    → YES 且是**多步驟 workflow + user 決策點**: Skill(SKILL.md + references/)
    → YES 且是**一次性單步 action**(scaffold / 單一 check): Slash Command(.claude/commands/*.md)
    → NO: 繼續 Q3

Q3. 是「隨時間變化的狀態」嗎?(已完成 / 待辦 / 決策紀錄 / user 偏好)
    → YES: Memory
    → NO: 繼續 Q4

Q4. 能用 script「機械化自動執行」嗎?(pre/post tool)
    → YES: Hook
    → NO: 繼續 Q5

Q5. 是 CLAUDE.md / SKILL.md 已有項目的「深層細節」嗎?
    → YES: Skill `references/*.md` 或 spec.md(視上層所在)
    → NO: **不合任何 home——重新思考 scope 或 ask user**
```

## CLAUDE.md vs Skill 的 signal-to-noise 原則

- **CLAUDE.md 每次對話都載入**——每加一條規則都增加 AI 掃描成本。**只放每次都需要 signal 的 DS 規則**。
- **Skill 只在 invoke 時載入**——audit / workflow / interaction protocols 放這裡不污染每次對話。
- **不對家**:把 audit protocol 放 CLAUDE.md → 每次對話都讀 audit-only 內容 = 噪音;把 DS 規則放 Skill → audit 以外的 session 讀不到 = 遺失 signal。

## 搬動規則的雙向處理

規則從任一 home 搬到另一 home,**原位置必須留一行指標**(「詳見 X」);反之亦然。規則有家、也有路標。

歷史放置案例(含錯放修正)/ 本 session 12 條搬家紀錄 → `design-system-audit/references/rule-placement.md`。


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
| **shadcn compat alias 回流** | `npx shadcn add X` 產生帶 `bg-popover / text-muted-foreground / bg-accent / shadow-md/lg` 等 shadcn 預設 class 的 code,這些是 shadcn 安全網不是我們的 token。Popover / Command / Sheet 本 session 發現多處未遷移 | `# Tailwind 使用規則` → shadcn compat aliases 不給我們元件用;hook `check_token_hygiene.sh` 自動抓 |
| **硬寫 Tailwind shadow** | `shadow-sm / md / lg / xl / 2xl` 繞過 `--elevation-*` token 系統,dark mode 不聯動。Popover/Sheet/Command 曾犯 | `# Tailwind 使用規則`(禁止清單);hook `check_token_hygiene.sh` 自動抓 |

## 三方漂移（code / spec / story 不一致）

| Bug | 怎麼錯 | 完整說明 |
|-----|-------|---------|
| cva `defaultVariants.size` 不同步 spec/docblock/anatomy | SegmentedControl `md` vs spec/docblock 寫 `sm ★default` | skill `/story-writing` → Phase 4「高風險漂移點」+ anatomy-standard.md |

## Pattern 執行偏移

| Bug | 怎麼錯 | 完整說明 |
|-----|-------|---------|
| Row primitive 硬寫 `py-2` 在不同 context 產生 gap | TreeView 原本 `py-2`，進 SidebarGroup（也 `py-2`）→ label 和 first item 多 8px gap | `patterns/element-anatomy/item-anatomy.spec.md`「垂直 padding 歸屬」 |
| asChild pattern 下 consumer 自查 avatar size 全寫 24px | 三欄 sm/md/lg 並排，sm 欄本應 20px 卻顯示 24px | `patterns/element-anatomy/item-anatomy.spec.md`「Avatar 尺寸選擇」 |
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
| Pattern 資料夾 | kebab-case | `item-anatomy/`、`action-bar/`、`horizontal-overflow/` |
| Pattern spec 檔 | kebab-case(與資料夾同名) | `item-anatomy.spec.md`、`action-bar.spec.md` |
| Pattern 內多檔 flat 並列 | folder 為 topic 領域,含 overview + 具體 topic 各自檔案 | `element-anatomy/`(folder)內 flat 放 `element-anatomy.spec.md`(taxonomy overview)+ `item-anatomy.spec.md / .tsx / .stories.tsx`(F1/F2 具體) |
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
| React 元件 / TypeScript type | PascalCase | `MenuItem`、`ItemIcon`、`ItemAvatar`(slot components) / `ItemIconProps` |
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

## 命名必過三重 test（世界級命名 governance）

**任何新命名**（variant / mode / prop value / token / 元件名 / section 名）**必須同時通過以下 3 個 test**：

1. **既有設計語言 test**：與本專案現行命名模式對齊嗎？
   - 跟 Button variant / Tag 分類 / Badge variant 等 existing prop-value 的命名風格一致？
   - 跟 CLAUDE.md 既有詞彙（`compact / rich / sm / md / lg / action / indicator / scanning / reading` 等）沿用而非發明？

2. **世界級 idiom test**：至少 2 個 world-class DS 用此詞嗎？
   - 對照 Polaris / Material / Atlassian / Ant Design / Carbon / Apple HIG / Discord / Slack / Notion
   - 「大家都用這個詞,consumer 一看就懂」才算世界級
   - 孤立發明的詞（即使意思對）不算世界級

3. **跨元件認知衝突 test**（最容易被忽略）：同一 string 在其他元件是否已有不同語義？
   - 例：`text` 是 Button `variant="text"`（文字樣式按鈕）—— 若 FileItem 用 `mode="text"`（文字為主呈現）就是語義衝突,consumer 會混淆
   - 例：`compact` 在 Tag size 和 FileItem mode 都是「緊湊」意思 —— OK,一致
   - grep 既有 prop value,確認同字不撞語義

**三個 test 全過才採納**。有一個不過:改詞或標示明確區隔(加 prefix / 改語境)。

**本 session 曾發生的 bug**: FileItem mode 最初差點用 `text / picture`（Ant Design idiom,世界級 ✓,既有語言 ✓),但撞 Button `variant="text"` 語義衝突 → 改為 `compact / rich`(三 test 都過)。

## 禁止事項

- ❌ 憑直覺命名（「聽起來順」「讀起來順」）——必先 `ls` / `grep` 既有 pattern
- ❌ 為突顯新功能用非常規命名——新元件名必須對齊既有元件家族
- ❌ 一個檔案裡註解中英夾雜
- ❌ 複合詞用底線 / PascalCase 命檔(`ItemAnatomy.spec.md` 錯,`item-anatomy.spec.md` 對)
- ❌ 自創 spec 章節標題格式（既有 spec 用「何時用」就不要另寫「When to use」/「何時該使用」）
- ❌ 對新元件用新的 suffix（既有都是 `.tsx` / `.spec.md` / `.stories.tsx` / `.anatomy.stories.tsx` / `.principles.stories.tsx`，不自創如 `.design.md` / `.tokens.tsx`）


# 技術架構概覽

```
src/
├── globals.css             ← Tailwind v4 入口 + CSS token bridge
├── lib/utils.ts            ← cn()(clsx + tailwind-merge)
├── hooks/                  ← app-level React hooks
├── design-system/
│   ├── README.md           ← DS 入口 + 各子 dir charter 索引
│   ├── hooks/              ← DS 共用 React hooks(use-overflow-items / use-is-mobile)
│   ├── tokens/             ← charter: tokens/README.md
│   ├── components/         ← charter: components/README.md(PascalCase folder 一元件一家)
│   └── patterns/           ← charter: patterns/README.md(runtime UI primitive)
└── explorations/           ← 未定案 prototype 比稿
```

**目錄以實際檔案系統為準**。查看元件 / pattern / token 清單前先 `ls` 對應 dir。各子 dir 的 charter(收什麼 / 不收什麼)寫在該 dir 的 `README.md`——建立新檔前必讀(見 `# 規則分層` 硬規則)。

Internal primitive vs public-facing 元件的分類 test 見 `components/README.md` 及 Storybook title 命名(`# Story` 章節)。


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
    * Row primitives 共用 → `patterns/element-anatomy/item-anatomy.spec.md`
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


# Consistency Audit 原則（canonical + rationale-for-deviation）

**任何宣稱「跨元件要一致的事」必須三件套齊全:**

1. **Canonical 要明確指向**——CLAUDE.md 某段、某 spec.md、某 skill reference。不可只存在於口頭或直覺。
2. **偏離 canonical 的元件要在自己 spec.md 記 rationale**——不是每個元件都必須一致，但「不一致」必須可追溯為什麼。沒寫 rationale = drift，不是故意設計。
3. **Audit 檢查公式**：`actual == canonical OR (actual != canonical AND spec.md 有 rationale)`。任一 audit 只要它在查「X 是否跨元件一致」，都必須按這個公式走。

**為什麼**：設計系統的品質不是「所有元件都長一樣」，而是「任何差異都有原因可追」。沒有 canonical 就沒有一致性可言；沒有 rationale 機制，一致性會變成僵化。

**已套用 canonical 的面向**：
- Anatomy story `export const` 名稱 → `/story-writing` anatomy-standard.md
- Spec.md 七維度 → `# Spec 規則`
- cva defaultVariants 三方標記 → anatomy-standard.md 高風險漂移段
- Token 命名 namespace + role → `# Token 命名原則`

**新增 consistency 類訴求前的判斷**：
- 能在 CLAUDE.md / spec.md / skill 某處清楚指一段當 canonical?→ 可以寫成規則
- 偏離的元件能在自己 spec.md 說清楚為什麼?→ 可以寫成規則
- 兩者任一做不到 → 這不是 canonical，是風格偏好，不要寫進 governance


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
| Row primitive 共用規則 | `patterns/element-anatomy/item-anatomy.spec.md` | MenuItem / SidebarMenuButton / TreeItem / DropdownMenuItem / SelectMenu |
| 工具列 / 操作列 | `patterns/action-bar/action-bar.spec.md` | 任何有按鈕列的頁面 |
| 水平溢出處理 | `patterns/horizontal-overflow/horizontal-overflow.spec.md` | Tabs / Chip / 未來 Steps |
| 浮層外殼 Header/Body/Footer | `patterns/overlay-surface/overlay-surface.spec.md` | Dialog / Popover(padding SSOT) |
| Field 佈局容器 | `components/Field/field.spec.md` | 所有表單元件 |
| Field Controls 共用規則 | `components/Field/field-controls.spec.md` | Input / NumberInput / DatePicker / Select / Combobox / LinkInput / Textarea |
| 表單驗證標準 | `components/Field/form-validation.spec.md` | 所有表單元件 |
| 選擇 / 狀態視覺 | `patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」節 | 任何有選中態的元件 |
| 分隔線 vs CSS border | `components/Separator/separator.spec.md` | 任何有分隔線的元件 |

## 既有 layout primitives 清單（建立新元件前 mechanical 掃這張表）

**規則**:建立**任何**新元件之前,先掃以下表。若新元件的視覺結構命中任一 row 的 pattern → **必消費該 primitive**,不自己重寫一套。漏掉 = 雙邊漂移 bug(改一邊另一邊失效)。

| 視覺 pattern | 既有 primitive | 典型觸發情境 |
|------|---------|---------|
| 單列 row:prefix(icon/avatar) + content + suffix(action) | `patterns/element-anatomy/item-anatomy.*` — `<MenuItem>` canonical + slot components | 任何「列表項目」元件(Menu/Tree/Sidebar/TableRow/StepItem/FileItem...) |
| 浮層容器的 Header + Body + Footer(border-b/t + padding token) | `patterns/overlay-surface/` — `SurfaceHeader/Body/Footer` | Dialog / Popover / Drawer / Sheet / 任何 elevation-200 浮層的結構化 sub-components |
| **垂直居中 icon + title + description(+ action)** | `components/Empty/` — `<Empty>` 元件 | **「告訴使用者狀態」的 surface**:空資料 / 拖放邀請(FileUpload)/ 錯誤 / 首次引導 / 無權限 / 載入佔位(非 Skeleton)|
| 橫向操作按鈕列（gap-2 分組）| `patterns/action-bar/` | Toolbar、page header actions、form footer buttons |
| 水平溢出處理(捲動/收合,**隱藏捲軸+ fade-mask** UX)| `patterns/horizontal-overflow/` | Tabs / ChipGroup / 未來 Steps 的溢出(刻意隱藏 scrollbar) |
| **跨 OS 一致 overlay 捲軸(顯示捲軸但不吃寬度)** | `components/ScrollArea/` | DataTable 水平捲動 / Sheet / Dialog body / Sidebar 長 nav 等需要使用者知道有捲軸又要跨 OS 視覺一致 |
| **固定長寬比容器(防 CLS 坍塌,多張圖統一 ratio)** | `components/AspectRatio/` | Coachmark media / Carousel item image / Card thumbnail / Chart container(override default 16:9) |
| Field wrapper（border + padding + startIcon + endAction 結構) | `components/Field/field-wrapper.tsx` + `field-controls.spec.md` | 所有單行可編輯欄位元件 |

**自我檢查腳本**:
- 新元件有 icon+text 垂直堆疊? → 用 `<Empty>`,不自己畫 icon + title + desc
- 新元件有橫向 row 結構(prefix/content/suffix)? → 用 `element-anatomy/item-anatomy` 的 `<MenuItem>` + slot components(`<ItemIcon>` / `<ItemAvatar>` / `<ItemLabel>` / `<ItemSuffix>` / `<ItemInlineAction>`)
- 新元件是浮層 + 有 header/body/footer? → 用 `overlay-surface`
- 新元件內容**可能溢出容器且需要使用者捲動**? → 用 `ScrollArea`(跨 OS 一致 overlay 捲軸);若是刻意隱藏捲軸 + fade-mask → 用 `horizontal-overflow` pattern
- 新元件有**圖像 / media 容器需要鎖定長寬比**(防 CLS、統一多張圖比例)? → 用 `AspectRatio` primitive,不硬寫 `aspect-video` / `aspect-square` class
- 以上都沒命中 → 才可自建,但 **建完要立刻回來加行**(防下一個人又重造輪子)

**overflow 使用三規則(避免跨 OS 跑版)**:
1. Design-system 元件 `.tsx` 內**禁止** raw `overflow-auto / overflow-scroll / overflow-{x,y}-{auto,scroll}`(hook `check_token_hygiene.sh` check #4 守衛)
2. 需捲軸且跨 OS 一致 → 用 `ScrollArea`
3. 刻意隱藏捲軸 + fade-mask → 用 `horizontal-overflow` pattern
4. 例外:`overlay-surface` spec 明文允許 Dialog body `flex-1 overflow-y-auto`(viewport-fill 特殊 context);若未來此場景需跨 OS 一致,遷移 ScrollArea 再更新 spec

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

## 同 flex 列的互動 slot 幾何鐵律（避免 gap token 被破壞）

**規則**:任何新 slot(status indicator / inline action / hover-swap button)放進既有 flex row 之前,**必須**執行以下 3 步 mechanical check,不可憑直覺:

1. **grep 該行既有 interactive slot 的 box 尺寸**:
   - 先讀 row host 元件的 spec(例:FileItem spec line 100「用 Button 非 Inline Action」+ line 107「compact=xs 24 / rich=sm 28」)
   - grep 該 row 的 stories 看 consumer 實際傳什麼 Button/action
2. **新 slot 的 box 尺寸 = 既有 slot 尺寸**(嚴格相等,不是「差不多」):
   - 不同:`gap-*` token 會被 overflow / overshoot 吃掉,實際視覺 gap 不等於宣告值
   - 例外:需明文在 spec 註解(「xs 小刻意縮小因為 ...」)
3. **Hover state 也要驗**:
   - hover-bg / ring / focus outline 若超出 box,會吃進 gap token 空間
   - 例:`ItemInlineActionButton` 的 16 px box + 24 px hover-bg overflow → hover 時視覺變寬,`gap-2`(8 px) 實際剩 ~4 px

**失敗案例(作為記憶 anchor)**:
- 2026-04-19 FileItem status-slot hover-swap:原本用 `ItemInlineActionButton` 16 px(不符 spec line 100「用 Button」),hover-bg 24 px overflow 吃掉 4 px `gap-2`,造成 status ↔ delete 實際 gap 變 ~4 px 違反 8 px 規格。修法:改用 Button 同 consumer size(compact xs 24 / rich sm 28),slot 容器等同 Button 尺寸。

**世界級 DS 的幾何鐵律**:同 flex 列的互動元素統一 box 尺寸,gap token 才能如實呈現——這是跨元件治理層的不變量,不是元件內部細節。

## 新增數值前必須先查既有 pattern（舉一反三原則）

**寫任何 gap、padding、font-size、line-height、icon size、border-radius 等數值之前,必須先 grep 系統內同類型的值,確認是否有既有 pattern 可以直接套用。不要憑直覺發明新值。**

檢查清單：
- `gap` → 查 `fieldWrapperStyles`（gap-2）、MenuItem cva、SelectionItem cva
- `padding` → 查 `--layout-space-loose/tight`、fieldWrapperStyles `px-3`
- `font-size` → 查 `typography.css` utilities + `item-anatomy.spec.md` reading/scanning 模式規則
- `line-height` → 查 `typography.css`（scanning = leading-compact 1.3,reading = default 1.5）
- `icon size` → 查 `ICON_SIZE` 常數（sm/md=16, lg=20）
- `inline action` → 查 `item-anatomy.spec.md`「Inline Action 設計規格」節(icon size、hover bg size=icon+2、gap-2 between actions、fg-muted → hover foreground)

**舉一反三**：如果 Select 的 inline action gap 是 gap-2,那所有元件的 inline action gap 都是 gap-2——不需要每個元件都被糾正一次。同理,如果 MenuItem 的 description 是 reading mode min 14px,那所有 reading mode consumer 的 description 都是 min 14px。

**如果確實需要新值**,先提出理由讓使用者確認,不要自己決定後寫進去。

## 互動元素：Inline Action vs Button

加互動 icon 前，判斷用 Inline Action 還是 Button iconOnly。完整判斷樹（3 步驟 + 場景對照表）詳見 `patterns/element-anatomy/item-anatomy.spec.md`「Inline Action 設計規格」節。

## 分隔線：Separator vs CSS border

判斷核心：**誰決定「這裡要分隔」？** 完整規則詳見 `components/Separator/separator.spec.md`。

## 陰影一律用 `--elevation-*` token

**禁止** `shadow-sm/md/lg/xl/2xl`、硬寫 `box-shadow`。**允許** `shadow-none`。詳見 `tokens/elevation/elevation.spec.md`。

## Row primitives 共用 item-anatomy 公式

寫任何新 row 元件前,讀 `patterns/element-anatomy/item-anatomy.spec.md`(Family 1+2 深度 SSOT)。Audit grep guard 和 SidebarMenuButton 獨立實作風險也在該 spec 的「自我檢查」節。

## 清 unused imports 後必須跑 runtime 驗證

`tsc --noEmit` 不充分（曾漏抓 JSX 內 identifier 和未宣告 export）。任何 import/export 異動後：

1. `npx tsc --noEmit`（必要但不充分）
2. grep `export { }` 確認每個 identifier 都有定義
3. `npm run storybook` 實際載入動到的 story
4. 互動操作確認動態 path

## 選擇 / 狀態視覺必須對齊既有 canonical

選擇與狀態的視覺表達必須使用元件既有的 state prop,且指示器視覺必須對應 selection model。詳見 `src/design-system/patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」節。


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

新增 shadcn 元件:`npx shadcn add {name}`(Button / Input / Card 等),**裝完立刻 grep 移除 shadcn compat alias**(見 `# Tailwind 使用規則`)。

**元件基本結構**:forwardRef + cva + VariantProps + cn() + `{ Component, componentVariants }` export。直接讀既有元件(`Button/button.tsx` / `Input/input.tsx`)當範本,不重寫結構說明。

Import 路徑:`@/design-system/components/{Name}/{name}`(無 barrel file,直接指到檔案)。

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

## 4 個可繼承的 Layout Family(概要)

| Family | 用途 | Sizes baseline | SSOT |
|--------|------|----------------|------|
| **1. Menu item layout** | Menu 容器內掃視單列(scanning mode) | sm / md / lg | `patterns/element-anatomy/item-anatomy.spec.md` |
| **2. List item layout** | 頁面上閱讀式單列(reading mode) | sm / md / lg | `patterns/element-anatomy/item-anatomy.spec.md` |
| **3. Pill layout** | 單行互動 pill | sm / md / lg(+可選 xs) | `components/Button/button.spec.md`「Pill Layout」 |
| **4. Field control layout** | 可編輯資料輸入 | sm / md / lg | `components/Field/field-controls.spec.md` |

## 新元件判斷流程(概要)

1. 垂直列表裡? → Family 1(menu 容器)/ Family 2(頁面)
2. 單行可點擊 / 可讀的 pill? → Family 3
3. 單行可編輯資料? → Family 4(視覺對齊 Family 1)
4. 都不是? → **停下討論**——新 family 還是 self-contained

## Family 詳細規格 → item-anatomy.spec.md

完整 taxonomy(cross-pattern / cross-component governance)→ **`patterns/element-anatomy/element-anatomy.spec.md`**。Family 1+2 row anatomy 深度 SSOT(runtime primitive)→ **`patterns/element-anatomy/item-anatomy.spec.md`**。Family 3 → `components/Button/button.spec.md`「Pill Layout」。Family 4 → `components/Field/field-controls.spec.md`。

**命名鐵律**:「layout」一詞保留給 **page-level layout**(未來頁面版面設計原則的家);element-level 的結構分類永遠用「anatomy」。世界級 DS 一致如此:Material / Polaris / Atlassian / Carbon 全部 Foundations > Layout 是 page-level,element 結構屬 component anatomy。


# 元件完成 checklist

元件即將合入 DS 時 invoke `/component-quality-gate` skill:45 項 Spec / Code / Stories / Ship checklist,走完才算 ready。`block_prototype_imports.py` hook 另會自動擋正式 code import `explorations/`。


# Exploration & Prototype

- **正式 vs 比稿**:`src/design-system/` 已定案可重用 / `src/explorations/` 未定案 prototype;正式 code 禁 import explorations(hook `block_prototype_imports.py` 強制)
- **Exploration 檔案**:每題一個 `src/explorations/{topic}/` folder,含 `*.v1.stories.tsx` / `*.v2.stories.tsx` + `notes.md`(記差異 / 假設 / 比較重點)
- **定案流程**:整理完升級為 `patterns/`(若屬 runtime primitive)或 `components/`(若是新元件);不再需要可刪整個 folder
- **/prototype skill**:user 明言「做 prototype / MVP / 原型」時走,含 5 phases + Phase 3.5 強制 audit gate(invoke `/product-ui-audit`)


# Story

**完整 workflow**(範例選擇 / anatomy 5-story / 連動更新 / 自我檢查)→ **`/story-writing` skill**。本節只留每 session signal:三層定位 + title 命名 + 最高準則 + 禁止清單。


## Storybook title 命名

```
Design System/Tokens/{TokenName}
Design System/Patterns/{PatternName}
Design System/Components/{ComponentName}/{展示 | 設計規格 | 設計原則}
Design System/Internal/{ComponentName}/{展示 | 設計規格}
```

- 第一層英文(Components / Internal / Patterns / Tokens)、元件名 PascalCase、子頁中文
- 子頁前不加元件名(❌ `MenuItem 展示` → ✅ `展示`)

## Internal vs Components 判斷 test(三題)

1. 元件本身有預設視覺嗎?(bg / border / shadow / padding / rounded)
2. 直接 `<X>` 放頁面會有視覺嗎?
3. 所有消費者都包成自己的 wrapper 嗎?

三題都傾向 Internal → `Internal/`;任一題明確傾向 Components → `Components/`。**判斷看行為不看名字**:HoverCard 名字像 public 但是純行為 primitive → Internal/。

現有分類:Components/(Button / Input / Select / Dialog / Popover / Sheet)/ Internal/(Menu / SelectMenu / Notice / SelectionControl / OverflowIndicator / HoverCard / Command)。

## 三層定位

| 層 | 檔案 | 職責 |
|---|---|---|
| **展示** | `{name}.stories.tsx` | 設計規格的便利瀏覽版——視覺目錄(車子展示間) |
| **設計規格** | `{name}.anatomy.stories.tsx` | 完整技術規格——token / 尺寸藍圖 / Inspect 面板,取代 Figma(車子規格表) |
| **設計原則** | `{name}.principles.stories.tsx` | 使用判斷指南——do / don't / 情境選擇(駕駛手冊) |

三層從「看」到「查」到「判斷」,閱讀深度遞進,**職責互不重複**。

## 範例最高準則 + 禁止清單(每 session signal)

**用耳熟能詳的真實業務場景,禁止極端 / 虛構 / 佔位**。Storybook 是公開文件,範例核心功能是**教學**——讓讀者推得出自己產品怎麼用。

| ❌ 禁止 | 範例 |
|---------|------|
| 佔位符 | `Option A / B / C` / `Lorem ipsum` / `foo / bar` |
| 抽象代號 | 「按鈕一」/ `Variant X` / `Rule A` |
| 極端不現實 | 「刪除所有資料無法復原」/ 50 個 filter / 5 層 dialog |
| 視覺符號 | `│─ 業務 ─│` / `A → B → C` / ASCII art |
| spec 內部代號 | 「符合 Rule 3.2」/「遵循 Convention A」 |

**兩個驗收 test**:
- **「人」test** — 遮標題 5 秒看懂情境?
- **「舉一反三」test** — 讀者推得出自己產品怎麼用?

詳細合法場景來源(Jira / Stripe / Notion / Figma...)/ 正確範例對照 / anatomy 5-story 標準 / Rule note 品質 / 視覺文案品質 / 7 題自我檢查 / 連動更新 + cva defaultVariants 高風險漂移 → **`/story-writing` skill**。
