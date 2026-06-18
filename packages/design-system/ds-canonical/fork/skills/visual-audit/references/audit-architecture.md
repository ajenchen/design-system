# Visual audit — Layer A + Layer B 架構 + Interactive state coverage canonical

(Extracted from SKILL.md 2026-05-04 — file budget consolidation,SKILL.md 留 1-line summary + pointer 本檔。)

## 兩層稽核架構(2026-04-21 升級)

本專案視覺稽核已分 **Layer A mechanical + Layer B AI judgement**,互補覆蓋:

| Layer | 做什麼 | 由誰做 | 自動化 |
|-------|-------|--------|--------|
| **A. Mechanical** | (1) 截圖每個 scenario(retina PNG → `snapshots/`)<br>(2) WCAG 對比度掃描(所有可見文字 / icon vs 底色,flag AA 不過的組合)<br>(3) DOM 幾何 assertion(等高 / 對稱 padding / 正確 gap — 讀 `scripts/visual-assertions.json` 定義) | `scripts/visual-audit.mjs`(Playwright-driven) | **npm run visual-audit** 一鍵跑,產出 `snapshots/report.json` + PNG。CI 可接(exit 1 on violation) |
| **B. AI judgement** | (1) 設計合理性(badge 位置語意對、carousel 箭頭不壓文字、zoom step 手感)<br>(2) 跨元件視覺一致(同 flex 列幾何鐵律、Family 視覺對齊)<br>(3) 世界級對照(「這跟 Figma/Notion/iOS 相比還差在哪」) | **本 skill**(`/visual-audit`),讀 `snapshots/*.png` + `report.json` 做 pattern recognition | invoke 時 AI 跑 |

### Layer A 先跑,Layer B 後補(workflow)

```
1. npm run visual-audit                  # Layer A 產 snapshots + report
2. /visual-audit                         # 本 skill 讀 snapshots/ 做 Layer B 判斷
   (skill 自動讀 snapshots/report.json 作為 Layer A baseline,
    重點關注 A 沒 flag 但視覺仍不對的 case)
```

### 為什麼分兩層

- Mechanical 能抓的事(對比度、等高、padding 數字)讓 script 做,AI 不浪費 token
- 設計合理性 / 世界級對照需要 pattern matching,只有 AI / human 能做——這部分走 skill
- 兩層互相 cross-check:Layer A 漏掉但 Layer B 看出 → 回填新 assertion 到 `visual-assertions.json`,轉為 mechanical

### Layer A 命令速查

```bash
# 全跑(建議 release / 大改)
npm run visual-audit

# scoped 跑(快速驗證 — 1 個 component)
node scripts/visual-audit.mjs --scope=component:Button

# 只跑 changed(git diff)— 對齊 CLAUDE.md「日常 dev」高效模式
node scripts/visual-audit.mjs --scope=changed

# 不啟 storybook(如果 storybook 已起)
node scripts/visual-audit.mjs --no-auto-start
```

Output:
- `snapshots/{scenarioId}.png` — retina PNG
- `snapshots/report.json` — `{ contrast: [], geometryViolations: [], a11yViolations: [], baselineDiff: {} }`

## Layer A interactive state coverage canonical

**核心事實**:當前 `visual-audit.mjs` 只抓「頁面 render 完 + blur activeElement + 800ms wait」後的**靜態 snapshot**——**hover / focus-visible / active / pressed / tooltip-visible / menu-open / dropdown-open 等 post-interaction state 預設不被抓到**。

### 當前覆蓋 vs Gap

| 狀態 | 當前 Layer A 覆蓋? | 抓法 |
|------|------------------|------|
| **Default render state** | ✓ 抓 | scenario 載入後直接 screenshot |
| **Overlay open**(Dialog / Popover / DropdownMenu chrome) | ✓ 抓 | 用 `defaultOpen` pattern(Radix Portal 自動生效) |
| **Hover state**(cursor-over 視覺) | ✗ 不抓 | 需 `play()` + `userEvent.hover()` |
| **Focus-visible**(ring / outline) | ✗ 不抓 | 需 `play()` + `element.focus()` |
| **Active / pressed**(按下瞬間) | ✗ 不抓 | 需 `play()` + `userEvent.pointer()` |
| **Tooltip visible**(iconOnly Button hover tooltip) | ✗ 不抓 | 需 `play()` + focus 觸發器 + 等 delay |
| **Menu item hover highlight** | ✗ 不抓 | 需 `play()` + hover first item after `defaultOpen` |
| **Combobox / Select 展開後 listbox** | 部分 | 靠 `defaultOpen` 可抓 listbox,但 hover highlight 需 play |

### 解法:Storybook `play()` + `@storybook/test`

Storybook v8 的 `play()` 在 story 渲染後執行,可觸發互動狀態。`@storybook/test` 提供 `userEvent` / `within` / `expect` 等 API:

```tsx
import type { StoryObj } from '@storybook/react'
import { userEvent, within } from '@storybook/test'

export const HoverState: StoryObj = {
  render: () => <Button>Hover me</Button>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const btn = canvas.getByRole('button')
    await userEvent.hover(btn)
    // visual-audit.mjs 在 play 完後 screenshot,可抓 hover bg
  },
}
```

### 命名 convention(scenario IDs Layer A 認得)

`{Component}/{base}--hover-state` / `--focus-visible` / `--active-state` / `--with-tooltip` / `--menu-item-hover`(等)

`scripts/visual-audit.mjs` 預設 wait 800ms after render — play 觸發互動後 800ms 內不應該變化(再長要拉 explicit wait)。

### Coverage 提升 roadmap(prioritized)

| Wave | Story 加 play | 抓的狀態 |
|------|--------------|----------|
| 1 | Button / IconButton / Tooltip | hover / focus-visible / active / tooltip-visible |
| 2 | DropdownMenu / Combobox / Select | menu-open + first-item hover |
| 3 | Tabs / SegmentedControl / Switch | hover transition / focus-visible |
| 4 | Form controls(Input / Checkbox / Radio) | invalid state(via aria-invalid)/ disabled hover |

每 wave 完工後跑 `npm run visual-audit`,看 `report.json` 新增的 violation,回填 `visual-assertions.json`。
