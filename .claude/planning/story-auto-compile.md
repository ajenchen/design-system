# Story Auto-Compile 系統(C)— 完整規劃

**Status**:Phase 1-4 完成 2026-04-25(57/59 aligned 0 drift);**2026-05-01 verified 60/60 aligned 0 skipped**(全元件 phase 1+2 structure done);Phase 5 由實際使用驅動,尚無 consumer 需求不動。
- Phase 1(tsx `componentMeta`):56 元件 migrate 完成 + 2 已完成合規 + Button 手動 world-class refs
- Phase 2(spec YAML frontmatter):variants / sizes auto-fill + Badge/Tag world-class refs 填 + `componentMeta.tokens` 自動 grep 填(2026-04-25)
- Phase 3(compile script):`scripts/compile-stories.mjs --all --check` 0 drift
- Phase 4(drift detection hook):`check_story_compile_drift.sh` PreToolUse 自動 verify
- Phase 5(自動產生 canonical story rows):deferred,待有 consumer 需求
**Goal**:stories 的 canonical 部分(variant 矩陣 / token 對照 / do-don't 列表)由 **spec.md + tsx 自動編譯產生**,人只寫「real-product scenarios」(Jira/Stripe 劇情)。保證 stories 永遠跟 spec + tsx 同步,零漂移。

**User 原始願景**:「可以被程式化 → tsx / 不可程式化 → spec.md / stories 由兩者自動舉一反三」— 本系統實踐第 3 條。

## 問題定義

**現況**:3 種 stories 檔(`.stories.tsx` / `.anatomy.stories.tsx` / `.principles.stories.tsx`)**人手寫**,從 cva / spec 抄過來。每次 cva 改 / spec 改,stories 可能漂移(cva defaultVariants 三方漂移的歷史 bug 就是此類)。

**要解決**:stories 裡的 canonical 段(variant 清單 / token 使用 / 尺寸對照)應該**從 spec+tsx 自動衍生**,不是手抄。

## 架構設計

```
┌─────────────────────────────────────────────────────┐
│ tsx(可程式化 canonical)                              │
│ ├─ cva() variants / defaults                         │
│ ├─ Size / Type enum                                 │
│ └─ 可 export 的 metadata schema                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ spec.md(不可程式化 judgment)                        │
│ ├─ YAML frontmatter(結構化 canonical)                │
│ │  ├─ family / variants / states / sizes            │
│ │  ├─ 禁止事項(do/don't 配對)                       │
│ │  └─ 近親對照(SSOT anchors)                        │
│ └─ Markdown body(judgment prose / rationale)       │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ scripts/compile-stories.mjs(編譯器)                  │
│ 1. 讀 spec frontmatter                              │
│ 2. 讀 tsx 的 `componentMeta` export                  │
│ 3. 合 / 驗證一致性                                   │
│ 4. 產生 canonical story rows                        │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ stories output                                       │
│ ├─ {name}.anatomy.stories.tsx                       │
│ │  ├─ AUTO: variant matrix(spec+tsx 合併產)         │
│ │  ├─ AUTO: token 對照表                            │
│ │  ├─ AUTO: size × state 矩陣                       │
│ │  └─ MANUAL: Inspector(人寫場景)                   │
│ ├─ {name}.principles.stories.tsx                    │
│ │  ├─ AUTO: do/don't from 禁止事項                   │
│ │  └─ MANUAL: real-product scenario                 │
│ └─ {name}.stories.tsx                               │
│     └─ MANUAL: 展示場景(Jira / Stripe / Notion)     │
└─────────────────────────────────────────────────────┘
```

## 4-Phase 執行計劃

### Phase 1 — tsx `componentMeta` export 規範

每個元件 tsx 新增 export:

```tsx
export const buttonMeta = {
  component: 'Button',
  family: 3,  // Pill Layout
  variants: {
    default: { purpose: '主要 action' },
    text: { purpose: '弱化 action / embedded' },
    destructive: { purpose: '破壞性 action' },
    // ... 從 cva 讀
  },
  sizes: {
    xs: { field-height: 24, icon: 16, typography: 'body' },
    sm: { field-height: 28, icon: 16, typography: 'body' },
    md: { field-height: 32, icon: 16, typography: 'body' },
    lg: { field-height: 40, icon: 20, typography: 'body-lg' },
  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['--primary', '--primary-hover', '--primary-active'],
    fg: ['--primary-foreground'],
    ring: ['--ring'],
  },
} as const
```

**規範**:
- cva 的 variants / defaults 要跟 `buttonMeta.variants` keys 對齊(compile 會 diff)
- Size 對應的 `field-height` / `icon` / `typography` 是 canonical 必填
- tokens 清單必列所有消費的 semantic token(`--*` 前綴,不含 primitive)

**Phase 1 deliverable**:
- 10 個元件(Button / Input / Checkbox / Radio / Switch / Select / MenuItem / Tag / Badge / Avatar)加 `componentMeta` export
- `scripts/validate-component-meta.mjs`:驗證 meta vs cva 一致(CI 用)
- Hook `check_component_meta.sh`:Write tsx 時偵測 cva 改動但 meta 沒跟 → warn

### Phase 2 — spec.md YAML frontmatter schema

```yaml
---
component: Button
family: 3
variants:
  default: { when: "主要 action", world-class: ["Polaris primary", "Material filled"] }
  text: { when: "弱化 action / embedded", world-class: ["Ant text", "Material text"] }
sizes:
  when-sm: "form field-height 28px"
  when-md: "default general UI"
  when-lg: "touch / prominent CTA"
禁止事項:
  - rule: "Button 不該加 embedded=true"
    reason: "Embedded 情境走 L2 host slot"
    反例: "Input.endAction = <Button embedded>"
  - rule: "iconOnly 必傳 aria-label"
    reason: "a11y 硬性要求"
    反例: "<Button iconOnly startIcon={X} />"
related:
  近親: [SegmentedControl, IconButton]
  SSOT-anchor: "button.spec.md → Pill Layout"
---

# Button 設計原則

...(human-readable judgment prose / rationale)
```

**Phase 2 deliverable**:
- `.claude/schemas/component-spec.schema.json`(JSON schema for spec frontmatter)
- 10 個 spec.md 加 frontmatter
- `scripts/validate-spec-frontmatter.mjs`:schema 驗證
- Hook:spec.md edit 時 frontmatter schema 驗證

### Phase 3 — Compile script

`scripts/compile-stories.mjs` 讀 meta + frontmatter,產 `.anatomy.stories.tsx` 的 canonical section:

```js
import { buttonMeta } from '@/design-system/components/Button/button'
import { readFrontmatter } from './lib/frontmatter.mjs'

const spec = readFrontmatter('src/design-system/components/Button/button.spec.md')
const tsx = buttonMeta

// 1. 驗證 cva variants vs spec.variants keys 對齊
assertKeysMatch(tsx.variants, spec.variants, 'variants')
assertKeysMatch(tsx.sizes, spec.sizes, 'sizes')

// 2. 產 Anatomy Overview story(auto)
const anatomyOverview = generateAnatomyStory({
  variants: merge(tsx.variants, spec.variants),  // keys + when + world-class
  sizes: tsx.sizes,
  states: tsx.states,
  tokens: tsx.tokens,
})

// 3. 產 Do/Don't story(auto,from 禁止事項)
const donts = generateDoDontStory(spec.禁止事項)

// 4. Output:
//    {name}.anatomy.stories.tsx 頭部加 AUTO section
//    人寫的 Inspector / real-product 保持不變(標記 MANUAL)
writeStory('button.anatomy.stories.tsx', {
  auto: [anatomyOverview, donts],
  manual: preserveExistingManualStories(),
})
```

**Phase 3 deliverable**:
- `scripts/compile-stories.mjs` 主編譯器
- `scripts/lib/{frontmatter,story-gen,merge,validate}.mjs` helpers
- `package.json` 加 `"compile-stories": "node scripts/compile-stories.mjs"`
- Pre-commit hook:`compile-stories` + `git diff` — 若有 drift → fail commit

### Phase 4 — Integration + Migration

- Hook `pre-commit`:改過 cva 或 spec frontmatter → auto run compile,commit 時檔案一起 in
- `/design-system-audit` 加 Dim:「Story canonical-drift(compile vs committed)」
- `/component-quality-gate` Phase 4 加 compile pass 驗證
- 10 元件先做 pilot,確認 pattern 穩定後擴到全部 44 元件

## 為什麼這比 RRE 強

- **RRE split** 只是文件切分,還是人手維護 3 層會漂移
- **Auto-compile** 把 canonical 執行化 — stories 的 variant 清單 = tsx.cva + spec.variants 的機械合併結果,**機械性不可能漂移**
- 人只寫「無法自動化的 real-product scenarios」(Jira 請假 flow / Stripe checkout / Notion 專案板)— 這才是 stakeholder / designer 真正想看的
- 對齊 user 原始願景

## Trade-off / 風險

- **Phase 1-2 前置工**:10 元件加 meta + frontmatter,工期估 4-6 小時(10 元件 × 25 分鐘)
- **Phase 3 編譯器開發**:半天-1 天(含 testing)
- **Phase 4 migration**:44 元件 migration,每週做 5 個 = 9 週漸進
- **風險**:frontmatter schema 太嚴 → 作者反抗(mitigation:用 JSON schema 寬鬆預設,逐步加嚴)
- **風險**:compile 失敗 block commit → 緊急 override(hook 支援 `FORCE_SKIP_COMPILE=1` env escape hatch)

## 誠實對照「為什麼我們沒有更早建」

你原始願景 2+ 週前就提過,為什麼沒建?
- 當時 spec/tsx/stories 之間漂移不算嚴重(元件少 + 人 attention 高)
- 加 skill / hook 時沒 cross-check 這個 vision(**M7 violation** — 同前面討論)
- 沒有 filesystem-level enforcement,只靠人記得

現在有 44 元件、3 個 audit iteration、multiple drift bugs,建 auto-compile 的 ROI 終於壓倒前置工成本。

## 執行 trigger

User 說「開工 story auto-compile」/「做 C」→ AI 讀本檔 → 從 Phase 1 開始。
