---
name: performance-audit
description: Performance audit for design-system components and product UI. Checks render count, unnecessary re-renders, memoization gaps, bundle size impact, useEffect chains, context thrashing. Invoke when user says「這元件效能如何」「為什麼很卡」「bundle 變大」「re-render 太多」, auto-invoked by `/component-quality-gate` Phase 4.5 (advanced mode) and `/design-system-audit` Dimension D3.
---

# Performance Audit — 元件效能稽核

## 存在意義

現有 `/design-system-audit`(全 dim per design-system-audit SSOT,code/spec 層)+ `/visual-audit`(pixel 層)**都不看效能**。render 次數過多、context 亂鋪、useEffect 鏈條過長這類 bug:
- tsc 過、eslint 過、視覺正常
- production 卡
- 日常 dev 看不出來,到 stakeholder demo 才爆

本 skill 作為稽核 6 維度的 **D3 元件效能** canonical home。

## 觸發時機(對齊 CLAUDE.md 稽核 canonical)

| 情境 | 模式 | 本 skill 跑什麼 |
|------|------|----------------|
| 新元件 merge 前 | 進階強制 | 全面(render count / memo / bundle) |
| 元件新功能 | 進階強制 | 全面 scoped to 新 prop / variant |
| 產品 demo 前 | 進階強制 | scoped to URL(常用頁 route) |
| 日常 dev | 高效 | tsc pass + bundle diff 門檻即可 |
| Release cut | 進階 + 全 DS scope | 全 DS render / memo / bundle 全跑 |

## Preconditions

- 元件 folder 存在於 `node_modules/@qijenchen/design-system/src/components/{Name}/`
- `node_modules` 已安裝
- Storybook 可啟動(用於 render-count 測量)

## Workflow

### Phase 0 — Scope 判定(一致性類必先全掃)

- 若 scope = 單元件 → 走 Phase 1-3 對該元件
- 若 scope = 全 DS / URL → **先全掃列出所有 hot path**(render 過多元件 / bundle 大元件 / context 亂鋪元件),Phase 1-3 按 impact 排序逐一 audit

### Phase 1 — Render & re-render

查 4 項:
1. **Unnecessary re-render**:consumer 改 prop / state 時,本元件是否 re-render?`React.memo` 是否需要?
2. **Inline 物件 / 函式 prop**:`style={{ ... }}` / `onClick={() => ...}` 每 render 造新 ref → child memo 失效
3. **Context 粒度**:`<ThemeProvider value={theme}>` 若含頻繁變動 field(e.g. `openMenuId`)→ 整個 subtree 重渲。Context 必切分粒度或用 selector
4. **Key 穩定性**:list items 用 `key={index}` 導致無意義 remount

**工具**:
- React DevTools Profiler record → 看 flame graph
- `why-did-you-render` dev dep 觸發警告(未來可加)
- 直接 grep pattern(inline style / arrow onClick)

### Phase 2 — Memoization / dependency

查 3 項:
1. **useMemo / useCallback dep array**:遺漏 dep(stale closure)/ 多 dep(無效 memo)
2. **useEffect dep array**:同上;特別注意 object / array dep(每 render 新 ref → 無限迴圈或無效 cleanup)
3. **Computed value in render**:重計算 heavy op(sort / filter / 轉換) → 必 `useMemo`

### Phase 3 — Bundle size

查 3 項:
1. **Direct heavy import**:`import * as Icons from 'lucide-react'`(全庫入 bundle) vs `import { Check } from 'lucide-react'`
2. **Lazy-loadable portion**:Dialog / Sheet / Coachmark 等 rare-use overlay,可 `React.lazy` 減首屏
3. **Duplicate dep**:`framer-motion` vs `motion/react` / 不同版本 react-day-picker 等

**工具**:
- `npx vite build --report`(vite bundle visualizer)
- bundle-size CI check(未來可加)

### Phase F — Report(必 STOP,對齊分權 canonical)

產出:

```markdown
# Performance Audit — {Scope} — {YYYY-MM-DD}

## Summary
- Render issues: N
- Memoization gaps: M
- Bundle impact: K KB

## Findings(按 impact 排序)
### P0: {title}
- 位置: {file:line}
- 現況: {render count / bundle contribution}
- 建議: {具體修法}
- 是 canonical 修實作(auto),還是原則待討論(STOP)?

## 提議討論(待 user sign-off)
- {若發現 canonical 本身有問題,列於此,不自改}
```

**STOP 點**:report 寫完**不自動修**。分權對齊 CLAUDE.md `# 稽核 canonical`(內含「Audit-vs-execute 分權」inline rule)。

## Non-goals

- 不改 code / spec(純 read-only report)
- 不做 micro-benchmark(10ms 以下差異不 report,噪音太多)
- 不處理 network / backend(純前端 render / bundle)

## 相關

- `node_modules/@qijenchen/design-system/ds-canonical/skills/design-system-audit/SKILL.md` — 全 dim 統籌(per design-system-audit SSOT);本 skill 是 D3 補位
- `node_modules/@qijenchen/design-system/ds-canonical/skills/visual-audit/SKILL.md` — pixel 層(D5)
- `node_modules/@qijenchen/design-system/ds-canonical/skills/ux-audit/SKILL.md` — UX 行為層(D4)
- `node_modules/@qijenchen/design-system/ds-canonical/skills/component-quality-gate/SKILL.md` — Phase 4.5 進階模式 chain 本 skill
