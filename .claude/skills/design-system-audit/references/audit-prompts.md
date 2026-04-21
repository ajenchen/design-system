# Audit Subagent Prompts (20 audits)

Each prompt is self-contained — designed to paste into an `Agent` call with `run_in_background: true` and `subagent_type: general-purpose`.

All prompts start with:
```
Working directory: /Users/chenqiren/Library/CloudStorage/GoogleDrive-qijenchen@gmail.com/我的雲端硬碟/my-project
```

## ⚠️ 必先讀的 canonical(所有 sub-agent 跑前強制)

**sub-agent 最常見失誤:不讀 scope defaults + rationale 就判 violation,造成 ~60% false positive**。每個 prompt 執行前**強制**先讀:

1. `CLAUDE.md` 的 `# Meta-Pattern 預警`(M1-M6 meta-principles)
2. `CLAUDE.md` 的 `# SSOT 消費 canonical`(做 X 前必查 Y 對照表)
3. `CLAUDE.md` 的 `# 稽核 vs 執行 分權 canonical`(flag 是提議,不是 auto-fix)
4. `CLAUDE.md` 的 `# Spec 規則` 的「Scope 預設」節(Field 家族 / pure wrapper / semantic token 自動 scope 豁免)
5. 每個 Consistency 類 dim:flag violation 前**必先 grep 元件 spec.md 整個檔案**找 rationale;有任何一段明文(`##`/`###`/「為什麼」/「rationale」/「對照」)觸及 deviation 原因 → 不是 violation 是 `deviation ✓`

### 常見 false positive(記憶)

- **「缺 dark mode 覆蓋」** → 若 spec 寫「semantic token 自動處理(見 color.spec.md)」或元件用 `--primary` / `--fg` 等 semantic token = **自動豁免**
- **「缺 empty state」** → 若 spec 寫「empty 由 consumer 用 `<Empty>`」= **豁免**
- **「SSOT reciprocal 缺」** → SSOT pointer 可是 inline prose 不一定是 `##` heading(例:RadioGroup line 24 prose pointer 就足夠)。flag 前 grep 對方 spec 完整,**找不到 target 的 anchor 才是 violation**
- **「7-dim 7 維度不足」** → scope defaults 豁免「Internal 類 / wrapper 類 / 互動極少類」;flag 前驗證 scope default 是否適用
- **「anatomy 缺 Inspector / SizeMatrix」** → applicable-where-meaningful policy(見 `.claude/skills/story-writing/references/anatomy-standard.md`);AspectRatio 沒 Inspector / Badge 沒 SizeMatrix 都可能是 N/A + 有 rationale。**先 grep spec 是否有「無 X story,因為...」段**
- **「ARIA / tabIndex 不對」** → Radix primitives 內建 roving-tabindex / focus management。flag 前驗證該元件是否 wrap Radix;wrap 就豁免

## Dimension Type Taxonomy (CLAUDE.md「Consistency Audit 原則」)

Every dimension below is tagged **Absolute** or **Consistency** so sub-agents apply the right formula:

| Type | Meaning | Audit formula |
|------|---------|---------------|
| **Absolute** | Violation = bug regardless of context. No rationale exempts. Fix required. | `actual == canonical` else VIOLATION |
| **Consistency** | Canonical behavior defined; deviation allowed IF documented rationale in designated home. | `actual == canonical OR (actual != canonical AND rationale present)` else VIOLATION |

**Sub-agent protocol(強化,2026-04-21)**: Consistency 類 finding 必走 3 步 before 回報 VIOLATION:
1. Grep 元件 spec.md 全文(不只 anchor 區)— 找 deviation 對應的 rationale prose
2. 檢查 scope defaults 是否適用(Field 家族 / semantic token / wrapper 類 / Radix 包)
3. 兩者皆不豁免 → VIOLATION;任一豁免 → `deviation ✓`(仍列出但不 block)

Every dimension header below has three lines:
- **Type**: Absolute / Consistency
- **Canonical source**: the document segment that defines correct behavior
- **Rationale home**: where to look for deviation justification (`N/A` for Absolute)

---

# Group A — Correctness (P0 priority)

## 1. cva defaultVariants 三方漂移

**Type**: Absolute
**Canonical source**: component .tsx `cva(...)` is the source of truth; spec.md prop table + anatomy SIZE_SPECS must mirror exactly
**Rationale home**: N/A — three-way drift is always a bug (SegmentedControl precedent)

```
Your job: audit cva `defaultVariants` three-way consistency (code vs spec.md vs anatomy story) across ALL variant keys.

For each component in src/design-system/components/ with a `defaultVariants` block:
1. Grep its `cva(...)` — identify every `defaultVariants` key + value
2. Check `.spec.md` prop table / docblock — `★` / `預設` / `default` markers
3. Check `.tsx` top-of-file docblock (JSDoc)
4. Check `.anatomy.stories.tsx` SIZE_SPECS / prop table / default markers

Report ONLY mismatches. Format:
- `ComponentName: cva says X='A', spec.md:N says ★B, anatomy:M says C`

End: `N components checked, M mismatches.` Under 400 words. Don't fix.
```

## 2. SSOT dead link

**Type**: Absolute
**Canonical source**: CLAUDE.md `# Spec 規則` SSOT anchors list; every pointer must resolve to an actual `##`/`###` heading
**Rationale home**: N/A — dead link is never acceptable

```
Your job: verify all SSOT pointers in .spec.md / .tsx files resolve to real headings.

Grep patterns to collect:
- `\.spec\.md「[^」]+」`
- `\.spec\.md\s*的「[^」]+」`

For each `xxx.spec.md「HEADING」`:
1. Open xxx.spec.md
2. Verify a `##` or `###` heading matching HEADING exactly exists
3. Report mismatches with `file:line — pointer — actual closest heading`

End: `N pointers checked, M dead, K soft-matches.` Under 300 words. Don't fix.
```

## 3. SSOT reciprocal

**Type**: Absolute
**Canonical source**: CLAUDE.md `# Spec 規則` → "reciprocal 必須存在,不可單向"
**Rationale home**: N/A — single-direction SSOT is a bug

```
Your job: verify every cross-spec SSOT pointer has a reciprocal pointer back.

CLAUDE.md rule: "Own 方寫深度 section；被指方寫一行 pointer (reciprocal 必須存在，不可單向)".

For each pointer A → B「section」 found:
1. Open B.spec.md
2. Search for a pointer back to A.spec.md (anywhere, any format)
3. If missing, flag as non-reciprocal

Common patterns of reverse pointer:
- `../A/A.spec.md` in 「相關」section
- Inline `詳見 ../A/A.spec.md` reference

Report: `A.spec.md → B.spec.md:N — B 未指回 A`

Focus on current SSOT anchors (CLAUDE.md `# Spec 規則` lists them):
- tabs ↔ segmented-control
- select ↔ radio-group
- checkbox ↔ switch
- hover-card ↔ tooltip
- item-layout ↔ row primitive consumers (MenuItem / TreeItem / SidebarMenuButton / Steps)
- field-controls ↔ Field family consumers

End: `N pointers checked, M non-reciprocal.` Under 400 words. Don't fix.
```

## 4. Tailwind v4 / tailwind-merge grep

**Type**: Absolute
**Canonical source**: CLAUDE.md `# Tailwind 使用規則` → "Tailwind v4 任意值" + "tailwind-merge 自訂 utility 註冊" bug patterns
**Rationale home**: N/A — these are technical bugs (Sidebar `[--foo]` / `text-body` misclassification)

```
Your job: grep for known Tailwind-related bug patterns.

Check 1 — Tailwind v4 任意值缺 `var()` 包覆:
- Grep `className=.*\[--[a-z]` (e.g., `w-[--sidebar-width]`)
- Must be `var(--sidebar-width)` form
- False positive exclusions: `[&[data-...]]` / `[&:hover]` etc (arbitrary variants, not arbitrary values)

Check 2 — tailwind-merge 自訂 utility 未註冊:
- Find custom font-size / text-color utilities used in `className={cn(...)}`
- Cross-reference with `src/lib/utils.ts` tailwind-merge config
- Flag any custom `text-*` / `bg-*` / `border-*` utility not explicitly registered

Check 3 — Unused Swatch / TokenCell helper after past edits:
- If a file has `const Swatch = ...` but no `<Swatch` usage, flag

Report: `file:line — violation type — suggested fix`

End: `N .tsx files checked, M violations.` Under 400 words. Don't fix.
```

## 5. Token 消費紀律

**Type**: Absolute
**Canonical source**: CLAUDE.md `# UI 開發規則` + `# Tailwind 使用規則` → 禁止清單 (hex / rgb / shadow-md/sm / raw px 等)
**Rationale home**: N/A — tokens bypass breaks dark mode / density / brand-swap

```
Your job: grep src/design-system/components/*.tsx for hardcoded color values, pixel values, or magic numbers that should use tokens.

Flag:
- Hex colors: `#[0-9a-fA-F]{3,8}` (except within SVG / storybook-only files)
- rgb/rgba literals: `rgb\(|rgba\(`
- Pixel values in className like `w-[48px]`, `h-[32px]` when a token exists (e.g., `--field-height-md` is 32px)
- Inline style with raw color: `style={{ color: '#...', backgroundColor: 'rgba(...)' }}`

Don't flag:
- Opacity values (0.45, 0.6 etc)
- Generic `w-full` / `h-auto` / Tailwind-native sizes
- Story/anatomy files (those are visualization)
- SVG stroke/fill (these may need raw values for currentColor tricks)

Report: `file:line — hardcoded value — likely token replacement`

End: `N component .tsx files checked, M violations.` Under 500 words. Don't fix.
```

---

# Group B — Spec hygiene (P1 priority)

## 6. Spec Rule A 文字品質

**Type**: Absolute
**Canonical source**: CLAUDE.md `# Spec 規則` → Spec 文字品質 (不描述視覺形狀 / 實作細節 / 術語一致)
**Rationale home**: N/A — visual metaphors / raw px / Tailwind class dumps in spec are always defects

```
Your job: audit all .spec.md under src/design-system/ against Rule A in CLAUDE.md `# Spec 規則`.

Rule A — no visual-form / implementation pollution. Flag:
- Visual: 「窄長形」/ 「圓圓的」/ 「凸起」/ 「扁平」/ 「跳動」/ 「崩潰」/ 「看不出 X 邊界」/「看起來像 Y」
- Implementation leak: raw pixel values in running text (`5.5px`, `21px`), Tailwind class lists (`bg-muted rounded-md px-3`), CSS literal (`display: flex; gap: 8px;`), pseudo-element selectors (`::after`, `bottom: -1px`)
- Physical metaphors: 「空心洞」「浮在上面的異物」(ok in stories, NOT spec)

Don't flag:
- Token names (`--field-height-md`, `var(--primary)`)
- cva variant string literals
- SSOT pointers referencing class names

Report: `file:line — 違規句 — 替換方向`
End: `N specs checked, V violations, top offenders: [list]` Under 500 words. Don't fix.
```

## 7. Spec Rule B 邊界案例

**Type**: Consistency
**Canonical source**: CLAUDE.md `# Spec 規則` → 邊界案例覆蓋 + Scope 預設 (Field family delegates to field-controls, Separator/Skeleton/CircularProgress/ProgressBar claim 無互動狀態, etc.)
**Rationale home**: element .spec.md —「本元件無 X 狀態」/「由 {family} spec 繼承」 one-liner acceptable

```
Your job: audit all .spec.md against Rule B in CLAUDE.md `# Spec 規則` → 邊界案例覆蓋 (apply Scope 預設).

For each spec check:
- disabled / loading / empty
- dark mode (flag only if custom palette beyond semantic tokens)
- density (flag only if not using field-height/layout-space tokens)
- icon-only (flag only if component supports icon-only)

Scope defaults (do NOT flag if):
- Field-family component delegating to field-controls.spec.md
- Pure wrappers (Separator/Skeleton/CircularProgress/ProgressBar) claiming "無互動狀態"
- Dark mode handled by semantic token

Report GENUINE gaps only: `ComponentName — missing: X / Y` + why not N/A

End: `N specs checked, M genuine gaps, L scope-N/A accepted.` Under 500 words. Don't fix.
```

## 8. 7-維度 對標覆蓋

**Type**: Consistency
**Canonical source**: CLAUDE.md `# Spec 規則` → 對標世界級 DS 七維度 (何時用 / 不用 / 近親分界 / 誤解 / 相關 / 空值 / 驗證時機 / Loading / a11y)
**Rationale home**: element .spec.md — 某維度 N/A 時須一行說明 (「本元件為純版面 primitive,無驗證時機」)

```
Your job: for each .spec.md, verify coverage of the 7 world-class DS dimensions (CLAUDE.md `# Spec 規則` → 對標世界級 DS).

The 7 dimensions:
1. 何時用 / 何時不用 (when to use / not use)
2. 與近親元件的分界 (vs neighboring components — SSOT)
3. 常見誤解 / 禁止事項 (common misuses)
4. 相關元件 links (related)
5. 空值呈現 (empty state)
6. 驗證時機 (validation timing — for form-related)
7. Loading / 無障礙預設 (loading / a11y defaults)

For each spec, list which dimensions are missing that should be present (apply judgment — pure layout primitives may skip 6/7, behavior primitives may skip 5).

Report: `ComponentName — covered: [list] | missing: [list]`

Include: analysis of 3 specs as exemplars (Button / SegmentedControl / Badge should hit all 7 if applicable).

End: `N specs checked, average dimensions covered: X/7. Specs needing most attention: [top 5]`. Under 600 words. Don't fix.
```

---

# Group C — Code conformance (P1 priority)

## 9. shadcn passthrough 完整度

**Type**: Consistency
**Canonical source**: CLAUDE.md `# shadcn 元件規範` — forwardRef / displayName / ...props / cva / Radix data-attrs / asChild
**Rationale home**: element .spec.md — internal helper / non-Slot primitives may skip asChild with documented reason

```
Your job: check every component .tsx in src/design-system/components/ for shadcn structural completeness.

Each component's main exported component must have:
1. `React.forwardRef<...>` (ref forwarded to DOM)
2. `displayName` set
3. `...props` spread to DOM
4. cva() managing variants (if has variants)
5. Radix data-state / data-disabled / data-orientation preserved (if wraps Radix)
6. `asChild` support OR documented reason not to (if wraps Radix Slot-compatible primitive)

Flag components missing any of these. Report per component:
- `ComponentName — missing: forwardRef / displayName / ...props / asChild / radix data-attribute`

Exclude:
- Internal-only helpers (SelectionItem, anatomy-utils)
- Simple function components that aren't the main export

Report: `N components checked, M with holes.` Under 500 words. Don't fix.
```

## 10. a11y 基本覆蓋

**Type**: Consistency (mostly Absolute)
**Canonical source**: WCAG + CLAUDE.md `# UI 開發規則` (keyboard handlers / aria-label on icon-only / form labels)
**Rationale home**: element .spec.md — decorative/internal primitives may document aria-hidden or omitted role with reason

```
Your job: audit src/design-system/components/ for a11y basics.

Check each .tsx and its .stories/.anatomy/.principles:
1. icon-only interactive elements (Button iconOnly / IconButton) — must have `aria-label`
2. Interactive elements (onClick / onKeyDown) — must have keyboard handler or role
3. Form controls — must be properly labeled (Field / FieldLabel or aria-labelledby)
4. Role semantics — does button use <button>? Does listbox use role="listbox"?

DON'T flag:
- Radix primitives (they manage ARIA internally — Checkbox / Radio / Dialog etc.)
- Skeleton / CircularProgress (aria-hidden is common pattern)
- Decorative icons without interactive parent

Report: `file:line — missing: aria-label / role / keyboard`

End: `N files checked, M a11y gaps, top offenders: [list]`. Under 500 words. Don't fix.
```

---

# Group D — Story layer (P1 priority)

## 11. Story 三層齊全

**Type**: Consistency
**Canonical source**: CLAUDE.md `# Story` 三層定位 (Components: 展示 + anatomy + principles;Internal: 展示 + anatomy)
**Rationale home**: Storybook title classification (`Internal/` → principles optional by design). Components missing a layer without Internal classification = violation

```
Your job: verify every public Components/ folder has all 3 stories:
- {name}.stories.tsx (showcase)
- {name}.anatomy.stories.tsx (spec)
- {name}.principles.stories.tsx (usage principles)

For Internal/ folder, only .stories.tsx + .anatomy.stories.tsx required (principles optional).

Scan src/design-system/components/ — for each component folder:
1. List files
2. Classify: public (Components/) or internal based on Storybook title in .stories.tsx
3. Report missing layer per classification

Report: `ComponentName (classification) — missing: [stories type]`

End: `N component folders checked, M missing layers.` Under 400 words. Don't fix.
```

## 12. Story 人話範例

**Type**: Absolute
**Canonical source**: CLAUDE.md `# Story` → 範例最高準則 + 禁止清單 (「人」test + 舉一反三 test)
**Rationale home**: N/A — Lorem ipsum / Option A/B / Variant X / ASCII art have no legitimate use

```
Your job: audit all .stories.tsx + .principles.stories.tsx for placeholder / abstract text per CLAUDE.md `# Story` → 範例選擇原則 → 明確禁止.

Flag:
- Placeholder: `Option A/B/C`, `Lorem ipsum`, `foo/bar`, `Item 1/2/3`
- Abstract 代號: `按鈕一 / 按鈕二`, `Variant X`, `Rule A/B`
- Extreme unrealistic: single Button with destructive 3-line text, 50-item filter, 5-level dialog
- Visual symbols: `│─ 業務 ─│`, ASCII art
- spec 代號: `符合 Rule 3.2`
- Variant names as visible labels (e.g., literal `<Button>Primary</Button>`)

DON'T flag:
- aria-label / placeholder= / cva value literals
- Badge/status where the label IS real content

Report: `file:line — violating text — real scenario suggestion`
End: `N files checked, V violations.` Under 600 words. Don't fix.
```

## 13. Anatomy Figma-inspect 完整度 + Canonical `export const` 命名 + 中文 `name:` 覆寫

**Type**: Consistency
**Canonical source**: `/story-writing` anatomy-standard.md → canonical 5 件套 (`Overview / Inspector / ColorMatrix / SizeMatrix / StateBehavior`) + 強制中文 `name:` 覆寫(含編號前綴)
**Rationale home**: element .spec.md — replacing/omitting a canonical 5 section requires a rationale paragraph explaining why (e.g., "Badge 無互動狀態,不需 StateBehavior"). Renaming identifier is never allowed.

```
Your job: audit .anatomy.stories.tsx against `/story-writing` anatomy-standard.md on THREE layers, enforcing CLAUDE.md 「Consistency Audit 原則」.

**Layer 1 — Canonical `export const` names** (一字不差, in order):
1. `Overview` / 2. `Inspector` / 3. `ColorMatrix` / 4. `SizeMatrix` / 5. `StateBehavior`
Additional `export const` 6+ allowed (component-specific, no rationale required).
Replacing canonical 5 with different identifier → VIOLATION regardless of rationale.
Missing canonical 5 → requires rationale paragraph in .spec.md.

**Layer 2 — Mandatory `name:` 中文覆寫(含編號前綴,一字不差)**:
1. `Overview`     → `name: '1. 元件總覽'`
2. `Inspector`    → `name: '2. 元件檢閱器'`
3. `ColorMatrix`  → `name: '3. 色彩對照表'`
4. `SizeMatrix`   → `name: '4. 尺寸對照表'`
5. `StateBehavior`→ `name: '5. 狀態行為'`
6+ (extras)      → `name: '6. {中文描述}'` / `'7. {中文描述}'` (編號連續,中文命名)

依賴 `export const` identifier 讓 Storybook sidebar 顯示英文 = VIOLATION(sidebar 中英混雜)。
素顏型 `name: '元件總覽'`(無編號) = VIOLATION(Storybook sidebar 字母序亂)。
帶括號 context `name: '6. Orientation(horizontal / vertical)'` = VIOLATION(canonical 命名不應混英文 context)。
編號不連續(跳 5 直接到 7) = VIOLATION。

**Layer 3 — Content hygiene** (only if Layer 1+2 pass):
- Density dual values (`md density / lg density` columns) — CLAUDE.md forbids
- `rest` instead of `default` — dev language violation
- Token name shown without live swatch (`var()` inline style)
- Raw pixels when token exists

**For each `src/design-system/components/*/*.anatomy.stories.tsx`**:
1. Grep `^export const ([A-Za-z]+)` — Layer 1 identifier list
2. For each export, grep its `name:` field value — Layer 2 中文覆寫
3. Check canonical 5 presence + rationale in .spec.md for any missing

Report format:
- `ComponentName L1: missing [Inspector, ColorMatrix] — no rationale in spec.md`
- `ComponentName L1: renamed VisualTokens (not ColorMatrix) — rename forbidden`
- `ComponentName L2: Overview 無 name 覆寫 (sidebar 顯示英文)` ← 39 件常見
- `ComponentName L2: ColorMatrix name='3. 色彩對照' 漏「表」字`
- `ComponentName L2: 素顏型無編號 '元件總覽'`
- `ComponentName L2: extra story 6 name='6. Orientation(horizontal)' 含英文 context`
- `ComponentName L3: density dual values in SizeMatrix column`
- `ComponentName: canonical 5 + name 覆寫完整 + extras [StandardRatios='6. 標準比例'] — OK`
- `ComponentName: missing StateBehavior — rationale found at badge.spec.md:L45 ✓`

End: `N checked, L1 V1 violations, L2 V2 violations, L3 V3 content issues. Top 5 worst: [list]`. Under 900 words. Don't fix.
```

---

# Group E — System-level (P1 priority)

## 14. 命名一致性

**Type**: Absolute
**Canonical source**: CLAUDE.md `# 命名與語言一致性` 各表格 (PascalCase/kebab-case/camelCase 規則 + suffix 鐵律)
**Rationale home**: N/A — naming rules are meta-rules with no legit exemption

```
Your job: audit the codebase against CLAUDE.md `# 命名與語言一致性` (Meta 規則).

Checks:
1. Component folder = PascalCase (e.g., `DatePicker/`)
2. Component file = kebab-case (e.g., `date-picker.tsx`)
3. Pattern folder + file = kebab-case (e.g., `item-layout/item-anatomy.spec.md`)
4. Hook file = kebab-case (e.g., `use-is-mobile.ts`)
5. Token folder: single word lowercase / multi camelCase (`color/` / `uiSize/`)
6. Spec H1 = `# {元件名} 設計原則` pattern
7. Storybook title = `Design System/{Components|Internal|Patterns|Tokens}/{Name}/{子頁中文}`
8. Suffix 統一: `.spec.md` / `.stories.tsx` / `.anatomy.stories.tsx` / `.principles.stories.tsx` — no custom suffixes
9. Single-file comment language consistency (中 file → 中 comments, 英 file → 英 comments)

Report: `path — violation — suggested correction`

End: `N files checked, M violations across C categories.` Under 600 words. Don't fix.
```

## 15. CLAUDE.md 自身一致性

**Type**: Absolute
**Canonical source**: CLAUDE.md 自身 (內部 consistency)
**Rationale home**: N/A — duplicated / contradictory / dead-link sections are always bugs

```
Your job: audit CLAUDE.md for internal consistency.

Checks:
1. No duplicated rules (e.g., same rule stated in 2 sections)
2. No contradictions (e.g., section X says "always do A" + section Y says "never do A")
3. Internal section references resolve: `# Story`, `# Spec 規則` etc. actually exist
4. Rule coverage: every item in 「失敗記憶索引」 has an anchor section
5. Pointer format: `# Section` or `# A → ## B` not mixed
6. Task navigation table entries all resolve to real sections
7. Mindset rules referenced in other sections exist

Report: `line N — issue — suggestion`

End: `Total issues found: M. Categories: [breakdown]`. Under 500 words. Don't fix.
```

---

## Running all 20 in parallel

Single message with 20 `Agent` tool calls, each with `run_in_background: true`. Expected wall time: 3-5 minutes for all to complete (they process in parallel server-side).

After all return:
- Consolidate findings per file with line numbers
- Build priority matrix (P0 / P1 / P2)
- Present Checkpoint 1 triage to user
- DO NOT auto-fix P2 without approval

---

# Group F — Architecture compliance (session-learned)

## 16. Layout Family 宣告

**Type**: Consistency
**Canonical source**: CLAUDE.md `# 系統內部 Layout — 4-Family Model`
**Rationale home**: element .spec.md — 聲明「本元件不屬於 4-Family Model」+ reason (self-contained / composite) is an acceptable rationale

```
Your job: verify every component spec.md under src/design-system/components/ has a「Layout Family」declaration in its first section (after 定位/實作基礎, before 何時用).

The 4-Family Model (CLAUDE.md `# 系統內部 Layout — 4-Family Model`):
- Family 1: Menu item layout
- Family 2: List item layout
- Family 3: Pill layout
- Family 4: Field control layout

Acceptable declarations:
- "Layout Family: CLAUDE.md 4-Family Model **Family N（...）**消費者"
- 「本元件不屬於 4-Family Model」+ reason (self-contained primitive / composite)

Report components missing the declaration:
- `ComponentName: no Layout Family declaration` (should be added)

Don't flag:
- Pattern specs (item-layout is the SSOT itself, not a consumer)
- Internal primitives with documented reason for no Family

End: `N component specs checked, M missing Family declaration, top 5: [list]`. Under 300 words. Don't fix.
```

## 17. Prop value 跨元件認知衝突

**Type**: Absolute
**Canonical source**: CLAUDE.md `## 命名必過三重 test` → test #3 (跨元件認知衝突)
**Rationale home**: N/A — same string with materially different semantic = cognitive dissonance bug (text/rich/picture precedent)

```
Your job: find cross-component prop value collisions that create cognitive dissonance (CLAUDE.md `## 命名必過三重 test` test #3).

Grep approach:
1. Extract all cva variant values + type prop values from every component .tsx
2. Group by literal string (e.g., all components using value `'text'`)
3. For each duplicate, compare semantic meaning

Flag collisions where same string has materially different semantics:
- Example: `Button variant="text"` (text-style button, no chrome) vs hypothetical `FileItem mode="text"` (text-based presentation) — same `'text'`, different concept
- Non-collisions: `size="sm" / "md" / "lg"` across elements is NOT collision (same semantic scale)
- Non-collisions: same `'error'` for Alert variant and Badge variant IS OK (same semantic)

Report: `ComponentA.prop="value" = 語義A | ComponentB.prop="value" = 語義B — 建議改其中一個`

End: `N cva/prop definitions scanned, M genuine collisions found. Historical: text/rich/picture naming iteration (fixed)`. Under 500 words. Don't fix.
```

## 18. shadcn compat alias 回流檢查

**Type**: Absolute
**Canonical source**: CLAUDE.md `# Tailwind 使用規則` → 「shadcn compat aliases — 不給我們元件用」
**Rationale home**: N/A — aliases are migration safety net only; human-edited / new code must use direct tokens

```
Your job: grep component .tsx files for shadcn compat aliases that should have been migrated to our direct tokens. This is a **recurring check** — future `npx shadcn add X` may introduce these and we must catch them early.

Per CLAUDE.md「shadcn compat aliases — 不給我們元件用」:

Forbidden in our code (these SHOULD be migrated to direct tokens):
- `bg-popover` → `bg-surface-raised`
- `text-popover-foreground` → `text-foreground`
- `text-muted-foreground` → `text-fg-muted`
- `bg-accent` → `bg-neutral-hover`
- `text-accent-foreground` → `text-foreground`
- `bg-destructive` → `bg-error`
- `bg-background` → `bg-canvas`
- `bg-card` / `text-card-foreground` → `bg-surface` / `text-foreground`
- `text-primary-foreground` → `text-white`
- `border-input` → `border-border`
- `shadow-md / shadow-sm / shadow-lg / shadow-xl / shadow-2xl` → `shadow-[var(--elevation-*)]`

OK (these are OUR approved tokens, not shadcn aliases):
- `bg-muted` (semantic.css keeps --muted as real token)
- `bg-secondary` (promoted to real token)
- `ring-ring` (our focus color)

Grep `src/design-system/components/**/*.tsx` (exclude .stories/.anatomy/.principles which may legit show token references in demos).

Report: `file:line — shadcn alias found — migrate to: [direct token]`

End: `N tsx files checked, M alias leakage, typically 0 in clean state`. Under 400 words. Don't fix.
```

# Group G — Home governance (session-learned 2026-04-20)

## 19. Home-name-vs-scope 一致性

**Type**: Consistency
**Canonical source**: each folder's charter README (`patterns/*/README.md`, `components/README.md`, `tokens/README.md`, `.claude/skills/*/SKILL.md` description)
**Rationale home**: charter README —「這裡收 X / 不收 Y」明文即可,不符合就 rename folder 或修 charter

```
Your job: verify each classification home folder's NAME still accurately reflects the scope of content it contains. Session 2026-04-20 learned this the hard way — `item-layout/` absorbed 4-family taxonomy (including Family 3 Pill + Family 4 Field pointers), becoming misleadingly named. Renamed to `item-anatomy/` to match scope.

Targets (folders governed by charter READMEs):
- `src/design-system/patterns/*/`
- `src/design-system/components/*/`(PascalCase folders)
- `src/design-system/tokens/*/`
- `.claude/skills/*/`

For each folder `F`:
1. Read `F/*.spec.md` or `F/SKILL.md` or the primary doc first paragraph (「定位」or frontmatter description)
2. Extract the declared scope in one sentence
3. Compare declared scope with folder name:
   - Is folder name a substring of or semantically aligned with the scope?
   - Does folder name UNDER-represent the scope (e.g., `item-layout/` containing 4-family taxonomy)?
   - Does folder name OVER-represent the scope (e.g., `item-anatomy/` containing only Menu item stuff)?

Flag mismatches: `folder/ declared scope = X, name implies Y, suggest rename to Z`.

Also flag "layout" word collisions:
- `patterns/*layout*/` at element-level scope MUST use「anatomy」not「layout」(CLAUDE.md 命名鐵律;「layout」保留 page-level)
- Exception: primitive file name matching folder name (e.g., `item-anatomy/item-anatomy.tsx` exporting slot components `<ItemIcon>` / `<ItemAvatar>` / etc. following Material/Polaris/Radix compound-component idiom) — allowed and encouraged

Report: `F: scope "..." vs name "..." — rename candidate: Z`

End: `N folders audited, M rename candidates, top 3: [list]`. Under 400 words. Don't rename.
```

## 20. Spec 硬寫機械化值檢查

**Type**: Consistency
**Canonical source**: CLAUDE.md `# Spec 規則` →「spec 只記錄設計原則,可程式化規則寫 .tsx」
**Rationale home**: element/pattern .spec.md — token spec 本身 / pattern rationale 節 / historical bug anchor 可合法保留具體數值,需有一行說明為何在此

```
Your job: grep spec.md files for mechanical values that should live in .tsx, not spec. Per CLAUDE.md 「spec 只記錄設計原則,可程式化規則寫 .tsx」.

Forbidden in spec.md(should migrate to tsx/cva):
- Hardcoded px values: `\d+px` outside of「藍圖」/「尺寸對照表」/ pattern explanation contexts
- Literal Tailwind utility classes: `className="..."` / `w-\d` / `h-\d` / `p-\d` / `gap-\d` blocks outside code fences showing WHY the value exists
- CVA variant object literals(those belong in tsx)

OK in spec(these are 判斷性 explanations):
- Token names: `--field-height-md`, `h-field-sm` (referring to the token, not instructing concrete code)
- Approximate size ranges in design reasoning: "roughly 16-20px"
- Code examples within ``` fences showing intended usage

Report per hit: `spec.md:line — hardcoded [value] — should live in [component-name].tsx`.

Don't flag:
- `tokens/*.spec.md` (token specs legitimately declare values)
- `patterns/element-anatomy/item-anatomy.spec.md`「Inline Action 設計規格」(documents why 16/20/24 size tiers — pattern rationale, belongs here)
- Historical bug anchors(「曾發生 padding 8px 錯位」is narrative, not instruction)

End: `N specs checked, M hardcoded violations, top 5: [list]`. Under 400 words. Don't fix.
```

---

## 21. Stories / consumer code 手刻繞 DS canonical(視覺對齊盲點的可機械化前哨)

**Type**: Absolute
**Canonical source**: CLAUDE.md `# UI 開發規則`「Story / consumer code 禁止手刻既有 DS 元件已支援的 pattern」+ 元件 spec.md(提供的 API)
**Rationale home**: N/A — hand-craft 繞 DS canonical 是 absolute bug,不容 rationale 例外

**背景**:pixel-level 視覺對齊無法 grep(需 visual regression 工具,長期基建 tech debt)。但「stories 自刻 `absolute + translate-y-1/2` 繞過 DS 元件的 loading / overlay / search 等 pattern」是**強信號**——這類 hand-craft 在不同 size / density 下視覺對齊跑掉,是視覺 bug 的上游。本 dim 抓 hand-craft 反 canonical 路徑,預防視覺 bug 進 production。

```
Your job: grep stories (.stories.tsx / .anatomy.stories.tsx / .principles.stories.tsx) and non-DS consumer code for hand-crafted patterns that bypass existing DS component APIs. Per CLAUDE.md 「Story / consumer code 禁止手刻既有 DS 元件已支援的 pattern」.

Hand-craft 反 canonical 的強信號 pattern(每個違反 → VIOLATION):

**A. 自刻 Input loading(繞過 `<Input loading/>` prop)**:
- grep: `<div className="[^"]*relative[^"]*">[\s\S]*?<input[\s\S]*?absolute[\s\S]*?translate-y-1/2[\s\S]*?</div>` (multiline)
- 或: 同檔案近距離出現 `<input` + `absolute.*(translate-y-1/2|top-1/2)` + (`CircularProgress` / `Loader2`)
- 正確做法: `<Input startIcon={Search} loading />`

**B. 自刻 Field endAction loading(繞過元件 `loading` prop)**:
- grep: NumberInput / Combobox / Select / DatePicker 鄰近 `CircularProgress` / `Loader2` 非 consumer 導出
- 正確做法: 元件 `loading` prop(若元件沒支援 → 回元件 spec 討論擴 API,不自刻)

**C. 自刻全頁 loading overlay(繞過 `<Empty icon={<CircularProgress/>}/>` compose)**:
- grep: `absolute\s+inset-0[\s\S]*?flex[\s\S]*?items-center[\s\S]*?justify-center[\s\S]*?(CircularProgress|Loader2)`
- 正確做法: `<Empty icon={<CircularProgress size={48}/>} title="..." description="..."/>`

**D. 自刻 search field(繞過 `<Input startIcon={Search}/>`)**:
- grep: `<input[\s\S]*?type=["']?(text\|search)` + `Search.*size=\{16\}` + 在同一個 JSX tree 非 DS 元件消費 context
- 正確做法: `<Input startIcon={Search} placeholder="..."/>`

**E. 自刻 table loading row/cell(繞過 DataTable loading 能力)**:
- grep: `<table` 手刻 + CircularProgress / Loader2 在內
- 正確做法: `<DataTable loading/>` 或 DataTable empty state slot `<Empty icon={<CircularProgress/>}/>`

**Exemption(唯一合法自刻場景)**:
- `.principles.stories.tsx` 的 ❌ Don't 範例(示範錯誤 pattern 給 reader 看的反例)— 必須明確標 ❌ 或 `Don't` label
- 探索性 `/explorations/` prototype 暫時 code(但要標註「pattern 缺口,pending DS 擴 API」)

For each violation:
1. File:line + hand-craft 片段
2. 違反哪個 signal(A/B/C/D/E)
3. 建議 canonical 路徑(要用哪個元件的什麼 prop)

Report format:
- `path/to/story.stories.tsx:L42 [signal A] — 手刻 Input + absolute CircularProgress,改用 <Input loading/>`
- `path/to/explorations/x.tsx:L88 [signal C] — 手刻全頁 overlay,改用 <Empty icon={<CircularProgress/>}/>`

End: `N files checked, V violations by signal: A=?, B=?, C=?, D=?, E=?. Top 5 worst: [list]`. Under 700 words. Don't fix.
```

---

**後續待辦(已記 memory tech debt)**:pixel-level 視覺 regression 基建(Chromatic / Playwright screenshots)— 本 dim 只是**上游攔截**,不涵蓋「已用對 API 但視覺仍跑掉」的 pixel bug。真正視覺對齊 audit 需要視覺工具,不是 grep 能 cover 的維度。
