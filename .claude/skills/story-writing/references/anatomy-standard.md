# anatomy Story 標準(`{name}.anatomy.stories.tsx`)

以 `Button/button.anatomy.stories.tsx` 為範本。每個元件的設計規格必須包含以下 5 個 story。

## 為什麼有「設計規格」(anatomy.stories.tsx 的目的)

設計規格取代 Figma inspect,是**元件的技術規格表**。滿足兩個 audience:

1. **設計師 / PM 讀 spec**:詳盡解剖學(anatomy 圖標示每個 slot)、每個數值的 token 來源、每個 variant × state 的色彩組合、每個 size 的尺寸藍圖 — **檢閱方便性必須超越 Figma**,不需切工具,一頁看完
2. **工程師讀 code**:依規格資訊能直接開發出一模一樣的 tsx,不靠設計師協助 — token name / Tailwind class / padding / gap / typography 全部在規格上,Inspect 面板即時 resolve 出 px 值

因此 6-canonical / 6 件套 story(含 Accessibility 第 6 章,2026-04-24+)不是裝飾,是**兩個 audience 各自需要的資訊分層**:
- `Overview` = anatomy 圖 + variant 一覽 + props 速查(「這元件長什麼樣」)
- `Inspector` = 即時預覽 + inspect 面板(「各 prop 切換時 token 怎麼變」,超越 Figma 的互動檢閱)
- `ColorMatrix` = variant × state 色彩矩陣(「每格色彩 token 是哪個」)
- `SizeMatrix` = size × variant 尺寸藍圖(「每格尺寸 token 是哪個」)
- `StateBehavior` = 互動狀態前後對照(「hover / active / disabled 怎麼變」)

任一分層缺口 = 規格不完整 = Figma inspect 的替代目標沒達到。這就是為什麼 6-canonical(含 Accessibility)不是 N 個 random story,而是「足以 100% 還原元件 + 對齊世界級 a11y 章程」的最小必要切片。

## Canonical `export const` 名稱 + 中文顯示名(6 件套)

每個 `.anatomy.stories.tsx` 的 `export const` 識別名稱必須用英文、中文 story 顯示名必須**強制 `name:` 覆寫**,且兩者**一字不差對齊**以下 canonical:

| 順序 | `export const` | 中文 story `name`(強制覆寫,**不加序號**) |
|------|--------------|---------------------|
| 1 | `Overview` | `'元件總覽'` |
| 2 | `Inspector` | `'元件檢閱器'` |
| 3 | `ColorMatrix` | `'色彩對照表'` |
| 4 | `SizeMatrix` | `'尺寸對照表'` |
| 5 | `StateBehavior` | `'狀態行為'` |
| 6 | `Accessibility` | `'無障礙與鍵盤'`(互動元件強制,純視覺 indicator N/A)|
| 7+ | 元件特有 | 中文命名,見下方擴充規則 |

```ts
export const Overview = {
  name: '元件總覽',  // ← 強制覆寫,不可省
  render: () => (...),
} satisfies Story
```

### 為什麼強制 `name:` 覆寫(不加序號)

- **強制中文覆寫**:不覆寫時 Storybook sidebar 顯示英文 identifier(`Overview`),中英混雜破壞中文 spec 一致性
- **不加序號**(2026-04-26 起 user 反饋):序號無價值且容易跳號(N/A skip 後 1 2 3 5 視覺破碎)。Sidebar 排序由 `export` 順序決定(Storybook 預設 `storySort: 'function'` 已對應 export 順序;若依字母排,本系統元件數有限,人工順序可接受)
- **世界級對照**:Polaris(Anatomy / Variants / States)/ Material(Anatomy / Guidelines)/ Atlassian(Examples / Code) 的 Storybook 皆為每個 story 明確標題,**無一使用序號前綴**

### Canonical 是**預設 6 section 都要建**(含 Accessibility),N/A 是嚴格例外

**6-canonical section = 每個 Components/(public)元件預設都該有**(Accessibility 第 6 章 2026-04-24+ 加入,對齊 Material / Polaris / Atlassian)。N/A 不是「省工豁免」,是嚴格例外 — 必須是「建了毫無意義 / 反而有害」才算 N/A。下方判斷標準**從嚴**。

**判斷預設 applicable**(採 Polaris / Material / Atlassian 世界級 baseline):
- **Inspector**:**幾乎所有 public 元件都 applicable**。只要元件有 ≥ 2 props,就該有 Inspector 讓 designer 切 props 看 render + token 對照。拒絕 Inspector 的唯一理由 = 元件 props < 2(極罕見,例 Separator / Skeleton 無互動 prop)
- **ColorMatrix**:applicable 如元件有 variant / hue / severity / theme。N/A 僅當元件色彩完全繼承 context(例 HoverCard 繼承 page theme 無自己 palette)
- **SizeMatrix**:applicable 如元件有 size prop(sm/md/lg)。固定尺寸才 N/A(Notice / Chip / Avatar 的特定固定場合)
- **StateBehavior**:applicable 如元件有任何互動 state(hover / selected / disabled / loading / error / focus)。純靜態 indicator(Badge / Tag)才 N/A
- **Accessibility**(2026-04-24 加,對齊 Material / Polaris / Atlassian 專章):applicable 如元件有任何鍵盤互動 / ARIA / focus 管理。內含:ARIA props 對照表 / Keyboard map(Tab/Enter/Esc/arrow)/ Focus order 圖 / WCAG AA 對比 snapshot。純視覺 indicator(Badge / Tag / Separator)才 N/A。**Migration strategy**:existing 元件**不 retroactively backfill**;新元件 / 重大修改時建;`/design-system-audit` 稽核發現缺 → flag + 補

**嚴格警告**:曾經被誤用「applicable-where-meaningful」放行大量元件跳 Inspector,造成 anatomy 紙本文件不如世界級。**2026-04-21 audit 重修:policy 改回「6-canonical 預設全建(含 Accessibility),N/A 要硬 rationale」**。N/A 不是省工通行證。

### 允許的偏離(CLAUDE.md `# 稽核 canonical`「Consistency 類稽核」公式;design-system-audit Dim 13 enforce)

#### `@anatomy-rationale:` 檔頭註解(scope-N/A 的 canonical escape)

當某 section(Inspector / ColorMatrix / SizeMatrix / StateBehavior / Accessibility)是**設計上 N/A**(非「未做完」),於 `*.anatomy.stories.tsx` 檔頭以**多行註解**列出 N/A 段 + 一行原因:

```ts
// @anatomy-rationale:
// SizeMatrix N/A — Skeleton 為純結構 placeholder,寬高由 consumer 控制,無 size tier
// StateBehavior N/A — Skeleton 無互動 state(僅 loading 一態,Overview 已示範)
import type { Meta, StoryObj } from '@storybook/react'
// ...
```

**何時用**:section 是**設計範圍外**的 N/A — 例:Skeleton 無互動 state / Separator 為結構元件 / 無參數的 layout primitive。
**何時不用**:section 只是還沒填完 — 補完內容,不要拿 escape 規避。
**世界級對照**:對齊 ESLint `eslint-disable-next-line {rule}` 的 per-line allowlist idiom — 每個豁免必有具名 rule + 一行 rationale,不允許整檔默默繞過。

`check_story_invariants.sh` R1 anatomy 識別 `@anatomy-rationale:` block:列出的 section 視為 legitimately N/A;未列出的 missing section 仍 violation。

#### 其他允許的偏離

1. **追加第 6+ 個元件特有 story**:OK,不需 rationale。命名遵循以下格式:
   - `export const` 用 PascalCase 英文(如 `StandardRatios` / `LayoutMatrix` / `ColorBindingRule`)
   - 中文 `name:` 必須用編號前綴 + 中文描述:`'6. 標準比例'` / `'6. 佈局矩陣'` / `'6. 色彩綁定規則'`
   - ❌ 不准用素顏型 `'色彩綁定規則'`(破壞編號連續性)
   - ❌ 不准帶括號 context `'6. Orientation(horizontal / vertical)'` — 括號寫在 story 標題本體,不影響 sidebar 文字
2. **缺 6-canonical 某一項(N/A)**:**必須在元件 spec.md 寫一段 rationale**,格式:「本元件無 `{SectionName}` story,因為 {原因}」。典型原因:
   - Badge / Tag:純視覺 indicator,無互動狀態 → 不需 StateBehavior
   - Chart:色彩來自 ChartConfig 不來自元件 variant → 不需 ColorMatrix
   - Separator / Skeleton / CircularProgress / Avatar:無 size tier(自由 number)→ 不需 SizeMatrix(或 SizeMatrix 改為「範圍展示」)
   - Notice / Alert:固定單一 size(Material Banner / Polaris Banner 共識) → 不需 SizeMatrix
3. **保留 canonical 編號**:若有 Overview(1) + ColorMatrix(3) + StateBehavior(5),**編號保持 3 和 5**,不重編為 2 和 3 — 這讓讀者在 sidebar 一眼看出「這個元件跳過了 2 和 4」而非誤以為 canonical 就只有 3 個 section(6-canonical 模型同理)
4. **同概念改名**:不允許(如 `VisualTokens` 取代 `ColorMatrix` / `StyleMatrix` 取代 `ColorMatrix`)一律改回 canonical

**`/design-system-audit` Dimension 13 強制 grep 比對**:
- `export const` 名稱 ≠ canonical → violation
- 無 `name:` 覆寫(依賴 identifier) → violation
- `name:` 值 ≠ canonical 中文(含編號前綴) → violation
- 缺 6-canonical 某項且 spec.md 無 rationale → violation

## 元件總覽(Overview)

- Anatomy 圖——標示所有 slot(標準版面 + iconOnly 等變體版面)
- Variant 一覽——每個 variant 一行:渲染元件 + 一句話角色描述
- Props 速查表——prop / type / default / 說明

## 元件檢閱器(Inspector,取代 Figma inspect)

- 控制項:variant / danger / state / size / iconOnly(依元件調整)
- 左側:即時預覽 + 尺寸藍圖
- 右側:Inspect 面板,分區顯示 Color / Layout / Typography / Style
- **State 使用開發術語**:default / hover / active / disabled(不用 rest)

## 色彩對照表(ColorMatrix)

- Variant × State 矩陣
- 每格:渲染元件 + bg / text / border token 標註(含即時色塊)
- 標準 variant 與 danger variant 分開

## 尺寸對照表(SizeMatrix)

- Size token 對照表(每個 size 的所有 token 一覽)
- 含 iconOnly 等變體模式的覆寫說明
- 視覺預覽矩陣(Variant × Size,含變體模式)

## 狀態行為(StateBehavior)

- 每個互動狀態的前後對照(如 loading spinner 替換規則)
- 所有 variant 的 disabled 渲染(含變體模式)
- 元件特有狀態(如 checked toggle)

## 無障礙與鍵盤(Accessibility,2026-04-24 新增,對齊 Material / Polaris / Atlassian 專章)

**對齊世界級**:Material 3 / Polaris / Atlassian DSP 三家元件文件皆有 A11y + Keyboard 專章。散在 StateBehavior(focus/disabled)+ principles(do/don't)不夠突出,designer / audit 找 a11y 資訊需要翻多檔。

**包含**(applicable 時必有):
- **ARIA props 對照表**:每 prop 對應的 aria-* mapping(e.g. `disabled` → `aria-disabled` / `required` → `aria-required`)
- **Keyboard map**:Tab / Shift+Tab / Enter / Space / Esc / Arrow keys(↑↓←→) 各做什麼
- **Focus order 圖**:複合元件(DatePicker / Combobox / DropdownMenu)的 focus 進入 → 內部 navigation → 退出流程
- **WCAG AA 對比 snapshot**:主要 state(default / hover / focus / disabled)對比度通過 visual-audit Layer A

**N/A 條件**:純視覺 indicator(Badge / Tag / Separator / Skeleton / Avatar 非 interactive 時)— rationale 寫 spec「本元件無互動」。

**Migration**:
- 新元件 / 元件重大修改時**強制**建
- **既有元件不 retroactively backfill**(尊重 user 2026-04-24 指示)
- `/design-system-audit` Dim 10(a11y 覆蓋)擴充:發現 interactive 元件缺 Accessibility story → flag
- 新元件 checklist 加 `Accessibility story 建立`

## 三層 stories 互聯 cross-link(2026-04-24 新增)

每個 story 頂部 meta 或底部 Rule note 必含統一 **「See also」** 區塊,讓讀者從任一層入口跳到其他角度:

```markdown
See also:
- 展示({name}.stories.tsx) — 真實業務場景
- 設計規格({name}.anatomy.stories.tsx) — 6-matrix inspect
- 設計原則({name}.principles.stories.tsx) — do/don't + 情境選擇
```

**為什麼需要**:展示 / 設計規格 / 設計原則 3 層職責不重複但視角不同(「看 → 查 → 判斷」)。沒有 cross-link 讀者容易 stuck 在一層,漏看其他角度的 canonical。

**實作**:`compile-stories.mjs` 自動在每個 story 的 docs meta 注入此 section;consumer 不手寫。

## Story earn-existence philosophy(2026-04-24 新增 — audit Dim 24/25 對應)

每個 manual story(非 auto-compiled 的部分)必 earn its existence。理由:多餘 story = noise,增加維護成本 + drift 風險 + 讀者(人 + AI)認知負擔。

**核心 philosophy**:
1. **以「可舉一反三」為主** — 一個 story 教一條原則,讀者能類推到其他情境
2. **Manual 補充模糊原則,讓抽象具象化** — spec 有模糊 rule 時,manual story 用具體 Jira/Stripe/Notion 劇情把原則釘下來。給「人」看得懂為主
3. **禁止湊數 / 重複 / 秀肌肉**

**每 manual story 必過 2 earn test**:
- (a) **unique teaching** — 這個 story 教一條其他 story 沒教的原則?
- (b) **grounding necessity** — 移除後,spec 某條抽象原則會 degrade 為難懂?

兩題皆 NO → retire 候選(audit Dim 24/25 會抓)。兩題任一 YES → 合法保留。

**範例(illustrative)**:
- ✅ OK:`DialogWithForm` — 教 Dialog 內 form field-wrapper canonical(grounds 抽象「form gap」rule)
- ❌ redundant:`DialogWithFormAndCancelButton` — 跟 `DialogWithForm` 只差 cancel button,不新教任何原則
- ❌ showing-off:`DialogHugeSize1000px` — 極端 size 不教原則,只秀技術

## 設計規格品質規則

- **Token-first**:所有數值以 token name 為主(如 `h-field-sm`),resolved px 值為輔助灰字。開發者只需確認 token 正確——theme / density 的值解析由系統處理
- **不含 density 雙值**:不顯示 `28px (md) / 32px (lg)`,只顯示 token name + 當前 resolved 值
- **Dev 語言**:使用開發術語(default 不是 rest,用 Tailwind utility name 如 `px-3` `gap-1`)
- **藍圖完整性**:render 函式中**每一層**的 padding / margin / gap 都必須在藍圖中呈現——包括子元素的間距(如 label span 的 `px-1`),不可遺漏
- **範例驗證**:每個範例必須用 spec.md 的所有規則逐條驗證(如 badge 不應出現在 loading / disabled 狀態)
- **色塊即時渲染**:使用 `var()` 內聯樣式,確保切換 dark mode / density 時自動更新
- **資料正確性**:TOKEN_MAP / SIZE_SPECS 等資料必須與元件 `.tsx` 的 `cva()` 定義交叉比對,確認完全一致
- **值溯源完整性**:設計規格中出現的每個行為描述,必須追到 code 中的具體值。不可只描述行為模式而省略數值——包括 Provider 層級設定(如 `delayDuration`)、全域設定檔(`main.tsx`、`preview.tsx`)、CSS 變數定義檔。規則:**如果 code 裡有具體數字,設計規格就必須標出來**

## 連動更新規則

三份文件互為依賴,任一變動必須同步更新其他兩份:

| 異動來源 | 必須連動更新 |
|---------|-------------|
| **`.tsx` 元件程式碼**(variant / size / token / 內部結構) | → 設計規格(TOKEN_MAP、SIZE_SPECS、藍圖、Inspect 面板)<br>→ 展示(如有對應的 story) |
| **`.spec.md` 設計原則**(新增 / 修改 / 刪除規則) | → 設計原則 stories(do/don't 範例必須反映最新 spec)<br>→ 設計規格(範例驗證:確認規格中的範例不違反新規則) |
| **設計規格 story**(結構調整、新增對照維度) | → 展示(確保展示仍是規格的便利瀏覽版,不脫節) |

## 高風險漂移點:`cva()` defaultVariants

**`defaultVariants` 是三方(code / spec / story)最容易漂移的位置,改之前必須意識到四方聯動:**

| 改什麼 | 必須同步 |
|--------|---------|
| `cva()` 裡的 `defaultVariants.size`(或 variant / state) | 1. 元件 `.spec.md` 的 prop 表 / 預設標記<br>2. 元件 `.tsx` 頂端 docblock 的 `★ 預設` 標記<br>3. `{name}.anatomy.stories.tsx` 的 SIZE_SPECS 表 / default marker<br>4. 若屬 field-height family → `tokens/uiSize/uiSize.spec.md` 的 family 清單 |

**曾發生的 bug**:SegmentedControl 的 cva `defaultVariants.size` 是 `md`,spec.md + docblock + anatomy 都寫 `sm ★default`——三方不一致持續存在到 audit 才發現(2026-04-18 修正)。

**預防法**:改 `defaultVariants` 前,grep 該元件所有檔案(`grep "★\|預設\|default" packages/design-system/src/components/{Name}/`),一次改完所有出現位置,不單改 code 就收工。
