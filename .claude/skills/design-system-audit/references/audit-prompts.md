# Audit Subagent Prompts(全 dim per `SKILL.md SSOT`)

> **Count canonical**:本檔 dim 數對齊 `.claude/skills/design-system-audit/SKILL.md` `## The N audit dimensions` 表。歷史標題曾寫「22 audits」,已 deprecated — 真實 dim 數以 SKILL.md 為準。Prompt section 對 PURE-JUDGMENT dims 必備;deterministic-script dims(eg. 84-88)無需 prompt(腳本即檢查)。**誠實註**:prompt 數**非**機械 count-verified(`sync-governance-counters.mjs` 不 parse 本檔)— 靠 audit dim 15 + Phase A 人工對齊(2026-05-30 修正前 frontmatter 誤稱有自動 cross-verify)。

Each prompt is self-contained — designed to paste into an `Agent` call with `run_in_background: true` and `subagent_type: ds-dim-auditor`(registered agent since 2026-04-24;scoped Read/Grep/Glob only;fallback to `general-purpose` if agent not available)。

All prompts start with:
```
Working directory: /Users/chenqiren/Library/CloudStorage/GoogleDrive-qijenchen@gmail.com/我的雲端硬碟/my-project
```

## ⚠️ 必先讀的 canonical(所有 sub-agent 跑前強制)

**sub-agent 最常見失誤:不讀 scope defaults + rationale 就判 violation,造成 ~60% false positive**。每個 prompt 執行前**強制**先讀:

1. `CLAUDE.md` 的 `# Meta-Pattern 預警`(**M1-M9** meta-principles,含 M8 Benchmark-First / M9 Predicate Self-Test 2026-04-22)
2. `CLAUDE.md` 的 `# SSOT 消費 canonical`(做 X 前必查 Y 對照表)
3. `CLAUDE.md` 的 `# 稽核 canonical`「Audit-vs-execute 分權」(flag 是提議,不是 auto-fix)
4. `.claude/rules/spec-rules.md` 的「Scope 預設」節(Field 家族 / pure wrapper / semantic token 自動 scope 豁免)
5. 每個 Consistency 類 dim:flag violation 前**必先 grep 元件 spec.md 整個檔案**找 rationale;有任何一段明文(`##`/`###`/「為什麼」/「rationale」/「對照」)觸及 deviation 原因 → 不是 violation 是 `deviation ✓`
6. **Consistency 類 dim(含 D6b/D6c/D6e)必走 Phase 0 全掃再判**(CLAUDE.md `# 稽核 6 維` 規則 + `principle-audit-protocol.md` D6 scan)— 單元件看無法檢出系統性 drift / 跨 item 矛盾 / predicate membership drift

### 常見 false positive(記憶)

- **「缺 dark mode 覆蓋」** → 若 spec 寫「semantic token 自動處理(見 color.spec.md)」或元件用 `--primary` / `--fg` 等 semantic token = **自動豁免**
- **「缺 empty state」** → 若 spec 寫「empty 由 consumer 用 `<Empty>`」= **豁免**
- **「SSOT reciprocal 缺」** → SSOT pointer 可是 inline prose 不一定是 `##` heading(例:RadioGroup line 24 prose pointer 就足夠)。flag 前 grep 對方 spec 完整,**找不到 target 的 anchor 才是 violation**
- **「7-dim 7 維度不足」** → scope defaults 豁免「Internal 類 / wrapper 類 / 互動極少類」;flag 前驗證 scope default 是否適用
- **「anatomy 缺 Inspector / SizeMatrix」** → applicable-where-meaningful policy(見 `.claude/skills/story-writing/references/anatomy-standard.md`);AspectRatio 沒 Inspector / Badge 沒 SizeMatrix 都可能是 N/A + 有 rationale。**先 grep spec 是否有「無 X story,因為...」段**
- **「ARIA / tabIndex 不對」** → Radix primitives 內建 roving-tabindex / focus management。flag 前驗證該元件是否 wrap Radix;wrap 就豁免
- **「decorative indicator 被誤列入 action predicate」(D6e,2026-04-22)** → `pointer-events-none` + `aria-hidden` 的 icon 不該出現在 action example 表。Calendar / status dot / CircularProgress 等被誤收 = P0 flag。對照 CLAUDE.md M9 predicate 自測
- **「Row action 尺寸 > 24」(D6e cap 違反,2026-04-22)** → row primitive 內 inline action 絕對值 cap = 24,row tier 放大不該讓 action 同步放大。違反 = P0 flag。對照 `patterns/element-anatomy/item-anatomy.spec.md`「Inline Action 設計規格」Row ≤ 24 cap

## Dimension Type Taxonomy (CLAUDE.md`# 稽核 canonical`「Consistency 類稽核」)

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

For each component in packages/design-system/src/components/ with a `defaultVariants` block:
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
**Canonical source**: `.claude/rules/spec-rules.md` SSOT anchors list; every pointer must resolve to an actual `##`/`###` heading OR actual filesystem path
**Rationale home**: N/A — dead link is never acceptable

```
Your job: verify all SSOT pointers in .spec.md / .tsx files resolve (1) to real headings AND (2) to real filesystem paths.

## Part A — Heading anchor checks
Grep patterns to collect:
- `\.spec\.md「[^」]+」`
- `\.spec\.md\s*的「[^」]+」`

For each `xxx.spec.md「HEADING」`:
1. Open xxx.spec.md
2. Verify a `##` or `###` heading matching HEADING exactly exists
3. Report mismatches with `file:line — pointer — actual closest heading`

## Part B — File path existence checks(2026-04-22 補盲點)

先前盲點:只檢 heading anchor「」,未檢 bare file-path reference。例如 item-anatomy.spec.md 曾寫
`→ packages/design-system/src/ELEMENT-ANATOMY.md`(此 file 從未存在),agent 視為 legitimate 因為
無「」anchor 落在檢測外。

Grep patterns:
- `src/[a-zA-Z0-9/_.-]+\.(md|tsx|ts)` 作為 pointer 出現在 .md / .tsx 文件內(非 import)
- 尤其 ALL-CAPS filename convention(`ELEMENT-ANATOMY.md` / `CLAUDE.md` / `README.md` 等)
- 注意排除 code comments 講路徑但實為 illustration 的(e.g. `// 見 src/...`)

For each file-path reference:
1. `test -f <path>` 檢查 file 實際存在
2. 若 pointer 指向不存在的 file → P0 dead pointer
3. 若 pointer 指向 file 但 file 已 rename / moved → suggest correct path

## Part C — Spec self-placement consistency(2026-04-22 新增)

檢查 spec 是否自稱在某個位置但實際 location 不符(doc drift):

- Grep spec.md 開頭段落中「放/住/位於」等 location claim
- 例:「本檔放頂層 `packages/design-system/src/`」但檔案實際在 `patterns/element-anatomy/`
- Cross-check with `packages/design-system/src/README.md` 的 home governance 決策
- 若 claim 不符實際 → Flag「self-placement drift」

End: `N pointers checked, M heading-dead, K path-dead, L self-placement drift.` Under 400 words. Don't fix.
```

## 3. SSOT reciprocal

**Type**: Absolute
**Canonical source**: `.claude/rules/spec-rules.md` → "reciprocal 必須存在,不可單向"
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

Focus on current SSOT anchors (`.claude/rules/spec-rules.md` lists them):
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
**Canonical source**: `.claude/rules/ui-development.md`「Tailwind 5 條核心」 → "Tailwind v4 任意值" + "tailwind-merge 自訂 utility 註冊" bug patterns
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
**Canonical source**: `.claude/rules/ui-development.md`「Tailwind 5 條核心」 → 禁止清單 (hex / rgb / shadow-md/sm / raw px 等)
**Rationale home**: N/A — tokens bypass breaks dark mode / density / brand-swap

```
Your job: grep packages/design-system/src/components/*.tsx for hardcoded color values, pixel values, or magic numbers that should use tokens.

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
**Canonical source**: `.claude/rules/spec-rules.md` → Spec 文字品質 (不描述視覺形狀 / 實作細節 / 術語一致)
**Rationale home**: N/A — visual metaphors / raw px / Tailwind class dumps in spec are always defects

```
Your job: audit all .spec.md under packages/design-system/src/ against Rule A in `.claude/rules/spec-rules.md`.

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
**Canonical source**: `.claude/rules/spec-rules.md` → 邊界案例覆蓋 + Scope 預設 (Field family delegates to field-controls, Separator/Skeleton/CircularProgress/ProgressBar claim 無互動狀態, etc.)
**Rationale home**: element .spec.md —「本元件無 X 狀態」/「由 {family} spec 繼承」 one-liner acceptable

```
Your job: audit all .spec.md against Rule B in `.claude/rules/spec-rules.md` → 邊界案例覆蓋 (apply Scope 預設).

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
**Canonical source**: `.claude/rules/spec-rules.md` → 對標世界級 DS 七維度 (何時用 / 不用 / 近親分界 / 誤解 / 相關 / 空值 / 驗證時機 / Loading / a11y)
**Rationale home**: element .spec.md — 某維度 N/A 時須一行說明 (「本元件為純版面 primitive,無驗證時機」)

```
Your job: for each .spec.md, verify coverage of the 7 world-class DS dimensions (`.claude/rules/spec-rules.md` → 對標世界級 DS).

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
**Canonical source**: `.claude/rules/ui-development.md`「shadcn 元件規範」 — forwardRef / displayName / ...props / cva / Radix data-attrs / asChild
**Rationale home**: element .spec.md — internal helper / non-Slot primitives may skip asChild with documented reason

```
Your job: check every component .tsx in packages/design-system/src/components/ for shadcn structural completeness.

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
**Canonical source**: WCAG + `.claude/rules/ui-development.md` (keyboard handlers / aria-label on icon-only / form labels)
**Rationale home**: element .spec.md — decorative/internal primitives may document aria-hidden or omitted role with reason

```
Your job: audit packages/design-system/src/components/ for a11y basics.

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
**Canonical source**: `.claude/rules/story-rules.md` 三層定位 (Components: 展示 + anatomy + principles;Internal: 展示 + anatomy)
**Rationale home**: Storybook title classification (`Internal/` → principles optional by design). Components missing a layer without Internal classification = violation

```
Your job: verify every public Components/ folder has all 3 stories:
- {name}.stories.tsx (showcase)
- {name}.anatomy.stories.tsx (spec)
- {name}.principles.stories.tsx (usage principles)

For Internal/ folder, only .stories.tsx + .anatomy.stories.tsx required (principles optional).

Scan packages/design-system/src/components/ — for each component folder:
1. List files
2. Classify: public (Components/) or internal based on Storybook title in .stories.tsx
3. Report missing layer per classification

Report: `ComponentName (classification) — missing: [stories type]`

End: `N component folders checked, M missing layers.` Under 400 words. Don't fix.
```

## 12. Story 人話範例

**Type**: Absolute
**Canonical source**: `.claude/rules/story-rules.md` → 範例最高準則 + 禁止清單 (「人」test + 舉一反三 test)
**Rationale home**: N/A — Lorem ipsum / Option A/B / Variant X / ASCII art have no legitimate use

```
Your job: audit all .stories.tsx + .principles.stories.tsx for placeholder / abstract text per `.claude/rules/story-rules.md` → 範例選擇原則 → 明確禁止.

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
**Canonical source**: `/story-writing` anatomy-standard.md → 6 件套 (`Overview / Inspector / ColorMatrix / SizeMatrix / StateBehavior / Accessibility`) + 強制中文 `name:` 覆寫(含編號前綴)
**Rationale home**: element .spec.md — replacing/omitting a 6-canonical section requires a rationale paragraph explaining why (e.g., "Badge 無互動狀態,不需 StateBehavior"). Renaming identifier is never allowed. **`*.anatomy.stories.tsx` 檔頭 `// @anatomy-rationale:` 註解列出 N/A sections + 一行原因 → legitimately N/A,不報為 violation**(對齊 hook `check_story_anatomy.sh` 同源處理)。

```
Your job: audit .anatomy.stories.tsx against `/story-writing` anatomy-standard.md on THREE layers, enforcing CLAUDE.md `# 稽核 canonical`「Consistency 類稽核」.

**Layer 1 — Canonical `export const` names** (一字不差, in order):
1. `Overview` / 2. `Inspector` / 3. `ColorMatrix` / 4. `SizeMatrix` / 5. `StateBehavior` / 6. `Accessibility`(互動元件強制,純視覺 indicator N/A)
Additional `export const` 7+ allowed (component-specific, no rationale required).
Replacing 6-canonical with different identifier → VIOLATION regardless of rationale.
Missing 6-canonical → requires rationale paragraph in .spec.md OR `// @anatomy-rationale:` 檔頭註解列出 N/A sections + 一行原因(legitimate 偏離)。

**Layer 2 — Mandatory `name:` 中文覆寫(素顏型,**一律不加序號**)**:
1. `Overview`     → `name: '元件總覽'`
2. `Inspector`    → `name: '元件檢閱器'`
3. `ColorMatrix`  → `name: '色彩對照表'`
4. `SizeMatrix`   → `name: '尺寸對照表'`
5. `StateBehavior`→ `name: '狀態行為'`
6. `Accessibility`→ `name: '無障礙與鍵盤'`
7+ (extras)      → `name: '{中文描述}'`(中文命名,**禁止編號前綴**)

依賴 `export const` identifier 讓 Storybook sidebar 顯示英文 = VIOLATION(sidebar 中英混雜)。
帶編號前綴 `name: '1. 元件總覽'` = VIOLATION(2026-05-01 canonical flip:sidebar 順序由 `export const` 順序決定,序號重複 = 視覺噪音)。
帶括號英文 context `name: 'Orientation(horizontal / vertical)'` = VIOLATION(canonical 命名不應混英文 context)。

**Layer 3 — Content hygiene** (only if Layer 1+2 pass):
- Density dual values (`md density / lg density` columns) — CLAUDE.md forbids
- `rest` instead of `default` — dev language violation
- Token name shown without live swatch (`var()` inline style)
- Raw pixels when token exists

**For each `packages/design-system/src/components/*/*.anatomy.stories.tsx`**:
1. Grep `^export const ([A-Za-z]+)` — Layer 1 identifier list
2. For each export, grep its `name:` field value — Layer 2 中文覆寫
3. Check 6-canonical presence + rationale in .spec.md OR `// @anatomy-rationale:` 檔頭註解 for any missing(若 .anatomy.stories.tsx 檔頭有 `// @anatomy-rationale:` 註解,列出 N/A sections 和理由 — 視為 legitimate 偏離,不報為 violation。Hook `check_story_invariants.sh`(R1 anatomy,原 check_story_anatomy.sh folded 已合入)同源處理。)

Report format:
- `ComponentName L1: missing [Inspector, ColorMatrix] — no rationale in spec.md`
- `ComponentName L1: renamed VisualTokens (not ColorMatrix) — rename forbidden`
- `ComponentName L2: Overview 無 name 覆寫 (sidebar 顯示英文)` ← 39 件常見
- `ComponentName L2: ColorMatrix name='3. 色彩對照' 漏「表」字`
- `ComponentName L2: 素顏型無編號 '元件總覽'`
- `ComponentName L2: extra story 6 name='6. Orientation(horizontal)' 含英文 context`
- `ComponentName L3: density dual values in SizeMatrix column`
- `ComponentName: 6-canonical + name 覆寫完整 + extras [StandardRatios='7. 標準比例'] — OK`
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

## 15. Cross-doc 一致性(CLAUDE.md + spec.md + tsx docblock 全域 drift)

**Type**: Absolute
**Canonical source**: 各 SSOT home(per `# 治理 canonical` 8-home)
**Rationale home**: N/A — duplicated / contradictory / drift 永遠是 bug

**2026-04-30 擴 scope**:從原「CLAUDE.md 自身」擴到 cross-doc(CLAUDE.md + spec.md +
tsx docblock + inline comments)— 補本 thread 暴露的 3 個漏洞:
1. spec.md 兩家描寫同 canonical 不同值(popover 重複 overlay)
2. tsx docblock claims X 但 spec.md 說 Y(overlay-surface docblock stale 提 xs canonical
   實際 sm+v5 trick)
3. 元件升級後 docblock 沒同步(stale upgrade marker)

```
Your job: audit cross-doc consistency for CLAUDE.md + all spec.md + tsx docblocks.

Checks(原 CLAUDE.md 7 條 + 新 cross-doc 3 條):

# CLAUDE.md 自身
1. No duplicated rules (same rule stated in 2 sections)
2. No contradictions (section X says "always do A" + Y says "never do A")
3. Internal section references resolve (`# Story`, `# Spec 規則`等真實存在)
4. Rule coverage: every item in 「失敗記憶索引」 has an anchor section
5. Pointer format: `# Section` or `# A → ## B` not mixed
6. Task navigation table entries all resolve to real sections
7. Mindset rules referenced in other sections exist

# Cross-doc(2026-04-30 擴 scope)
8. **Cross-spec full duplication**:同 canonical 在 ≥ 2 spec.md 完整描寫(非 pointer)
   = 違 Rule-of-3。grep 同 keyword 的 H2/H3 段落,若內容超過 5 行雷同 → flag。
   Example: "Chrome dismiss size canonical" 完整段在 popover.spec.md + overlay-surface.spec.md
   都有 → 一個必降為 SSOT pointer。
9. **Docblock-spec drift**:tsx 檔頭 / inline 註解 claim 某 canonical(「v5 unbounded trick
   2026-04-22」「xs canonical」「sm+trick」等),grep 對應 spec.md 是否一致。
   Example: overlay-surface.tsx docblock 寫「unbounded 從 xs canonical」但 inline-action.spec.md
   寫「sm + v5 trick canonical」→ docblock 為 stale,P0 修。
10. **Stale upgrade markers**:docblock / spec 含日期(`2026-XX-XX`)+ canonical change keyword
    (`canonical`/`upgrade`/`v\d`),檢查實際 tsx code 是否真用該 canonical。
    Example: spec 說「2026-04 升 v5 trick」但 tsx 仍 hardcode xs → drift。

Report: `file:line — issue — affected files — suggestion`

End: `Total issues found: M. Categories: [breakdown 1-10]`. Under 600 words. Don't fix.
```

---

## Running all dimensions in parallel(count per SKILL.md SSOT)

Dispatch per `node scripts/dispatch-audit-dims.mjs --summary`(動態 batch plan,non-hardcoded)— 一 message 內每 batch 一個 `Agent` tool call,`run_in_background: true`。Heavy dims 各獨立 sub-agent。Expected wall time: 3-5 分鐘並行。

After all return:
- Consolidate findings per file with line numbers
- Build priority matrix (P0 / P1 / P2)
- Present Checkpoint 1 triage to user
- DO NOT auto-fix P2 without approval

---

# Group F — Architecture compliance (session-learned)

## 16. Layout Family 宣告

**Type**: Consistency
**Canonical source**: CLAUDE.md `# 4-Family Layout Model`
**Rationale home**: element .spec.md — 聲明「本元件不屬於 4-Family Model」+ reason (self-contained / composite) is an acceptable rationale

```
Your job: verify every component spec.md under packages/design-system/src/components/ has a「Layout Family」declaration in its first section (after 定位/實作基礎, before 何時用).

The 4-Family Model (CLAUDE.md `# 4-Family Layout Model`):
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
**Canonical source**: `.claude/rules/ui-development.md`「Tailwind 5 條核心」 → 「shadcn compat aliases — 不給我們元件用」
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
- `shadow-md / shadow-sm / shadow-lg / shadow-xl / shadow-2xl` → `shadow-[var(--elevation-N)]` (N ∈ {100,200},+`-hover` 變體;無 300)

OK (these are OUR approved tokens, not shadcn aliases):
- `bg-muted` (semantic.css keeps --muted as real token)
- `bg-secondary` (promoted to real token)
- `ring-ring` (our focus color)

Grep `packages/design-system/src/components/**/*.tsx` (exclude .stories/.anatomy/.principles which may legit show token references in demos).

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
- `packages/design-system/src/patterns/*/`
- `packages/design-system/src/components/*/`(PascalCase folders)
- `packages/design-system/src/tokens/*/`
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
**Canonical source**: `.claude/rules/spec-rules.md` →「spec 只記錄設計原則,可程式化規則寫 .tsx」
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

## L1. Stories / consumer code 手刻繞 DS canonical(視覺對齊盲點的可機械化前哨)(legacy cross-ref — 不在 SKILL.md dim table;原佔 dim 21 slot,renumber 避免與現行 dim 21「連續 item list wrapper gap」撞號)

**Type**: Absolute
**Canonical source**: `.claude/rules/ui-development.md`「Story / consumer code 禁止手刻既有 DS 元件已支援的 pattern」+ 元件 spec.md(提供的 API)
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

---

# Group H — Principle self-audit (D6 子維,session-learned 2026-04-22)

## L2. D6e Predicate coherence(對齊 CLAUDE.md Meta-Pattern M9)(legacy cross-ref — 不在 SKILL.md dim table;原佔 dim 22 slot,renumber 避免與現行 dim 22「視覺容器 inner breathing」撞號)

**Type**: Consistency
**Canonical source**: `.claude/skills/design-system-audit/references/principle-audit-protocol.md` → D6e Predicate coherence scan;CLAUDE.md `# Meta-Pattern 預警` M9(Predicate Self-Test)
**Rationale home**: spec.md — 若某 example 故意違反 predicate(教學反例),必在旁邊明示「反例」/「故意違反 X cap」;cap 值本身更動需在 spec 留 rationale + benchmark

```
Your job: audit spec.md 內「含 decision tree + example 表 + cap / predicate 定義」的 spec(典型:item-anatomy「Inline Action 設計規格」/ button「Dismiss canonical」/ action-bar predicate 等),走 D6e 4 題 coherence check 防 predicate drift。

**Phase 0(必跑)**:grep 專案所有 `patterns/**/*.spec.md` + `components/**/*.spec.md` 找 predicate / decision tree / example 表位置,列清單。

**Per predicate spec 4 題 scan**:

Q1. **Membership drift** — example 表每一筆 literally 符合 predicate?
   - `pointer-events-none` / `aria-hidden` icon 不該列入 action predicate(decorative indicator)
   - Trash / Delete / Clear / Remove 不該列入 Dismiss predicate(Dismiss 嚴格 = X close only)
   - 邊界 case(status dot / loading indicator / badge overlay)歸屬是否明示

Q2. **Cap / size 違反** — example 的幾何值符合 predicate 定義的 cap?
   - Row action 絕對值 cap = 24 — example 是否 row tier 放大就讓 action 同步放大(違反 cap)
   - Dismiss 尺寸統一 — example 是否有 tier 自己另訂尺寸

Q3. **World-class 對照覆蓋** — 每個 predicate 決策都有至少 3 家 world-class DS 對照?
   - Polaris / Material / Atlassian / Apple HIG / Ant / Carbon / Figma / Linear 至少 3 家
   - 對照缺 = predicate 根據薄 → P1 flag(請補 benchmark 或 downgrade 為 heuristic 不上升 canonical)

Q4. **Empty category** — predicate 有 category 但 example 表沒 real case?
   - 空 category = 概念未收斂 / predicate 未完成 → P1 flag

**報告格式**:
- `spec.md:L42 [Q1 membership drift] — DatePicker Calendar icon 列入 Inline Action 但 pointer-events-none / aria-hidden → 改歸 decorative indicator`
- `spec.md:L88 [Q2 cap 違反] — FileItem rich row 56 → Button size md (32) 違反 row ≤ 24 cap`
- `spec.md:L120 [Q3 benchmark 缺] — overlay close X 無 world-class 對照 → 補 Material / Polaris / Apple HIG`
- `spec.md:L200 [Q4 empty] — Cat 3 standalone action 無 real example → 待補或刪 category`

End: `N predicate specs scanned, V1/V2/V3/V4 violations by Q. Top offenders: [list]`. Under 600 words. Don't fix.
```

## L3. Benchmark-First discipline(對齊 CLAUDE.md Meta-Pattern M8)(legacy cross-ref — 不在 SKILL.md dim table;原佔 dim 23 slot,renumber 避免與現行 dim 23「Controlled / Uncontrolled dual-mode」撞號)

**Type**: Consistency
**Canonical source**: CLAUDE.md `# Meta-Pattern 預警` M8(訂 canonical 前必 benchmark 至少 3 家 world-class);principle-audit-protocol.md D6e Q3
**Rationale home**: spec.md / memory — 若 canonical 刻意偏離 benchmark 或 benchmark 不適用,需明文 rationale

```
Your job: audit「spec 訂 canonical 決策」是否前置 benchmark(M8)。防「憑直覺訂 → 疊代 4 次 → user 拉回」bug class(2026-04-22 Icon Action Primitive 案例)。

For each canonical declaration in spec.md(任何「Row action cap = X」「Dismiss 嚴格 = X only」「predicate A vs B 分類」等 canonical 聲明):
1. 該段落 / 近區有無至少 3 家 world-class DS 對照(Polaris / Material / Atlassian / Apple HIG / Ant / Carbon / Figma / Linear / Notion)
2. 有對照 → `benchmark ✓`
3. 無對照但在 memory / CLAUDE.md `# Meta-Pattern` 有 rationale → `rationale ✓`
4. 兩者皆無 → P1 flag「canonical 無 benchmark 根據,疑似憑直覺訂」

Report: `spec.md:L{line} — canonical「{宣告}」無 benchmark 對照 → 補 world-class 至少 3 家 or 降級為 heuristic`

End: `N canonical declarations scanned, M without benchmark, top 3: [list]`. Under 400 words. Don't fix.
```

---

## 21. 連續 item list wrapper gap(consumer 層)

**Type**: Consistency
**Canonical source**: `patterns/element-anatomy/item-anatomy.spec.md`「連續 item 貼邊合法性」公式 3 條 + 元件 spec「List wrapper canonical」(e.g. `components/FileItem/file-item.spec.md`)
**Rationale home**: consumer code 的 inline comment / 元件 spec「List wrapper canonical」

Scan consumer 層(`.tsx` / `.stories.tsx` / `src/explorations/`)對 item 元件的 list wrapper gap 是否正確:

1. 公式 1(同類 standalone card/pill list):每個 card/pill 永久視覺層(bg + radius + inset)相鄰必 gap。violation:`<div className="flex flex-col">`(無 gap)下多個 FileItem rich / Card / Chip standalone
2. 公式 2(同類 flush / transparent list):0 gap 合法,分隔靠 border-b / progress bar / connector。無需 gap → flag 是 FP
3. 公式 3(混合視覺語言 list):必取最保守 gap。violation:compact FileItem Type A + Type B 混用但無 gap

Hook `check_item_list_gap.sh` 已 P2 block 外框 / P1 warn 缺 gap,本 dim 為 audit 層 redundant check 捕遺漏。

對每個 list wrapper violation:
- file:line
- 元件類型 + 判斷屬哪條公式 violation
- 建議 gap 值(該元件 spec「List wrapper canonical」指定值)

Report format:
```
[P0 consumer list wrapper 違反 gap canonical] {file}:{line}
  wrapper: {className}
  children: {item type}
  公式: {1/2/3} → 必 gap {value}
  SSOT: {元件 spec「List wrapper canonical」}
```

End: `N wrappers scanned, M violations, top 3: [list]`. Under 300 words. Don't fix.

---

## 22. 視覺容器 inner breathing(consumer 層)

**Type**: Absolute
**Canonical source**: `patterns/element-anatomy/element-anatomy.spec.md`「視覺容器 breathing invariant」
**Rationale home**: N/A(absolute rule · breathing 必存在)

Scan consumer 自建的視覺邊界容器(非 chrome primitive 消費)是否有 inner padding:

`.tsx` 內 grep pattern `<(div|section|aside|header|footer|main|nav)` 帶以下任一:
- `bg-(surface|neutral|primary|error|warning|success|info|inverse|overlay)-*` 或 `bg-\[var(--...)\]`
- `border` 類(非 `border-0` / `border-transparent`)
- `shadow-\[var(--elevation-...\]` / `shadow-\[...\]`(非 `shadow-none`)

若同 className 無 `p-N` / `px-N` / `py-N` / `p-\[var(...)\]` / `pt-N` / `pb-N` → violation。

Hook `check_container_breathing.sh`(retired;audit-only via 本 dim 22)— 本 dim 為 audit 層捕 hook 遺漏 / 多行 className split 的 case。

**排除**(hook 同邏輯):
- Chrome primitive(SurfaceHeader / SurfaceBody / SurfaceFooter / Field wrapper / Button / Input)= 自帶 canonical padding
- `@breathing-exempt:` / `@breathing-exempt-next` 標記
- Specific justification in spec (e.g. SheetBody variant="list" 刻意 `py-2 no px`)

對每個 violation 報:
- file:line
- container 類型(div/section/etc)
- 視覺邊界類(bg / border / shadow)
- 建議 padding token(chrome → `--layout-space-loose/tight`;其他 → `px-3` 等)

Report format:
```
[P0 視覺容器缺 inner breathing] {file}:{line}
  container: {tag className}
  視覺邊界: {bg / border / shadow}
  SSOT: `patterns/element-anatomy/element-anatomy.spec.md`「視覺容器 breathing invariant」
```

End: `N containers scanned, M violations, top 3: [list]`. Under 300 words. Don't fix.
```

---

# Group I — Form & State integrity(2026-04-24 新增,補 24-checklist #3+#12 gap)

## 23. Controlled / Uncontrolled dual-mode coherence

**Type**: Absolute
**Canonical source**: React docs + `components/Field/field-controls.spec.md` + 每元件自己 spec 的「controlled / uncontrolled」節(若適用)
**Rationale home**: 該元件 spec.md(若刻意只支援單一模式須註明)

掃所有 form-like + overlay-like 元件的 dual-mode prop 配對,確認不會混用造成 undefined behaviour。

**Scan 對象**(`packages/design-system/src/components/**/*.tsx`):
1. Form controls:`Input / Textarea / Select / Combobox / Checkbox / Radio / Switch / DatePicker / Slider / RadioGroup / CheckboxGroup`
2. Overlay:`Dialog / Sheet / Popover / DropdownMenu / Tooltip / HoverCard / FileViewer`
3. Tab-like:`Tabs / Accordion / Collapsible`

**Pair 對照表**(每 pair 必同時支援 controlled + uncontrolled,且互斥):

| 元件類 | controlled prop | uncontrolled prop | onChange prop |
|---|---|---|---|
| text input | `value` | `defaultValue` | `onChange` / `onValueChange` |
| select / combobox | `value` | `defaultValue` | `onValueChange` |
| checkbox / switch | `checked` | `defaultChecked` | `onCheckedChange` |
| radio group | `value` | `defaultValue` | `onValueChange` |
| overlay open | `open` | `defaultOpen` | `onOpenChange` |
| tabs / accordion | `value` | `defaultValue` | `onValueChange` |

**Violation 定義**:
- **V1 — missing uncontrolled fallback**:只吃 `value` 不吃 `defaultValue`(forces consumer 必 controlled)
- **V2 — missing controlled**:只吃 `defaultValue` 不吃 `value`(forces uncontrolled)
- **V3 — no callback**:有 `value` 但無 `onChange` / `onValueChange`(controlled 模式下狀態無法同步)
- **V4 — internal state shadows prop**:元件內 `useState(value ?? defaultValue)` 然後忽略後續 `value` 更新(silent bug)

**排除 / 例外**(需 spec 明文 rationale):
- 刻意只支援單一模式:spec.md 該元件節有「Controlled-only rationale」 或「Uncontrolled-only rationale」段
- Readonly display component(非互動,僅讀 value prop):spec 第一段聲明「display only」

**Radix primitive 元件(DropdownMenu / Popover / Dialog 等)**:Radix 內建支援 dual-mode,我們 wrap 時必 forward `open / defaultOpen / onOpenChange` 3 個 prop — 漏任何一個 = V1/V2/V3。

**檢查法**(per file):
1. Grep tsx interface / type for `value / defaultValue / open / defaultOpen / checked / defaultChecked`
2. Cross-check 對應 pair 是否都在
3. 檢查 internal `useState` 有無正確 mirror controlled prop(`useControllableState` pattern or manual sync)
4. 若缺 pair → check spec.md 有無 rationale → 無 = violation

Report format:
```
[P0 Controlled/Uncontrolled V{n}] {component}({file:line})
  missing: {prop pair}
  spec rationale: {有 / 無}
  fix: 加 {prop} + pair + `onXChange` 並 forward 到 Radix primitive / internal state
```

End: `N components scanned, M violations, by type: V1=X V2=Y V3=Z V4=W`. Under 400 words. Don't fix.

## 29. Trait-based展示 stories compliance(2026-04-26 — M19 ensure-canonical pipeline)

**Type**: Absolute
**Canonical source**: `.claude/skills/story-writing/references/category-templates.md` v2(trait-based typology)
**Rationale home**: 元件 spec.md frontmatter + 邊界案例 scope-N/A 段

Working directory: /Users/chenqiren/Library/CloudStorage/GoogleDrive-qijenchen@gmail.com/我的雲端硬碟/my-project

對 `packages/design-system/src/components/*/` 每元件:

1. 讀 `{name}.spec.md` frontmatter `traits:` array(若無則記為「P2 migration pending」)
2. 讀 `{name}.stories.tsx`(展示 only,排除 anatomy/principles)的 `export const X` 列表
3. 對照 v2 trait→required stories 表(讀 category-templates.md):
   - `hasVariants` → AllVariants 或 ≥ 2 per-variant exports
   - `hasSizes` → AllSizes(merged grid)
   - `hasInteractiveStates` → Disabled / States
   - `isOverlay` → OpenSnapshot 或 defaultOpen scenario + ≥ 3 業務 scenarios
   - `isInputLike` → WithError / ErrorState
   - `isSelectionMulti` → States + VerticalGroup + Disabled
   - `isSelectionSingle` → States only
   - `isMatrixHeavy` → ≥ 4 matrix stories
   - `isStructural` → 結構變體 stories(無固定數,過 earn-existence)
   - `isInternal` → 1 Default + ≤ 1 composition scenario
4. 缺哪個 → 過 spec.md「邊界案例 scope」找 N/A rationale。**有 rationale = `deviation ✓`,無 rationale = P0**
5. universal `Default` 缺 → P1 warn
6. 多餘 stories → 過 earn-existence 2-test → 失敗 retire 候選 P1

Report format:
```
[P0] {component}({file}):trait `{trait}` declared but missing `{required-story}`,no scope-N/A rationale in spec
[P2] {component}:no `traits:` frontmatter — pending migration via /story-auto-compile-migrate
deviation ✓: {component} `{trait}` 在 spec.md L{n} 標 N/A,因 {rationale}
```

End: `N components scanned, M with traits, K P0 violations, J P2 pending migration, I retire candidates`. Under 400 words. Don't fix.

## 30. Principles canonical compliance(2026-04-26 — Polaris/Material/Ant aligned;**v3 update 2026-05-01**)

**Type**: Absolute
**Canonical source**: `.claude/skills/story-writing/references/category-templates.md`「Principles canonical」節 v3(2026-04-26 整合)
**Rationale home**: 元件 spec.md(若需 scope-N/A 例外)
**Hook**: `check_canonical_propagation.sh`(E.1 principles canonical,原 check_principles_canonical.sh folded 已合入;v3-aware)

Working directory: /Users/chenqiren/Library/CloudStorage/GoogleDrive-qijenchen@gmail.com/我的雲端硬碟/my-project

**v3 schema(2026-04-26)**:`UsageGuidance` 為預設 canonical(整合 WhenTo + WhenNotTo + Vs 為單一 story,對齊 Polaris/Material/Ant 共識)。`WhenToUse` / `WhenNotToUse` / `Vs*Rule` 仍接受(split style),但新元件預設用 `UsageGuidance`。

對 `packages/design-system/src/components/*/` 每元件:

1. 讀 `*.principles.stories.tsx` 列 `export const X` 名稱
2. **核心規則**:每元件 principle stories `export const` 數 ≥ 2(對齊 audit-content-quality.mjs 寬鬆 ≥ 2)
3. 計算 universal core 命中數(v3 schema):
   - **`UsageGuidance`** 命中 → 視為「has core」(整合 schema,等同 ≥ 2 core)
   - 或 split style:`WhenToUse`(legacy `UsageScenarioRule` / `WhatItIs` 算)+ `WhenNotToUse`(legacy `Forbidden*` / `Donts` / `Pitfalls` / `Prohibitions` / `NonGoals` / `VisualDonts` 算)+ `Vs*Rule` + `ContentGuidelines` ≥ 2 → 「has core」
4. 違反:
   - **P0**:exports < 2(不夠教學量)
   - **P0**:無任一 universal core(`UsageGuidance` / split / legacy 都無)
   - **P1**:用 deprecated naming(`Forbidden*` / `Donts` etc.)→ rename target(整合到 `UsageGuidance` 或改 `WhenNotToUse`)
5. 多餘 stories → 過 earn-existence 2-test(對齊 Dim 24/25)→ retire 候選

Report format:
```
[P0] {component}({file}):exports < 2(only N)— 補 component-specific *Rule 或 ContentGuidelines
[P0] {component}:無 universal core(無 UsageGuidance 也無 split style)
[P1] {component}:deprecated naming `{OldName}` → 整合到 `UsageGuidance` 或 rename `WhenNotToUse`
deviation ✓: {component} 在 spec.md 邊界案例 scope 標 N/A,因 {rationale}
```

End: `N components scanned, K P0 (exports<2 OR no core), J P1 (deprecated naming), I retire candidates`. Under 400 words. Don't fix.

---

# Compact prompts(Dim 24-28 + 31-51,2026-05-17 補完)

## 24. Story 範例重複性(Manual stories cross-3-file 不該 scenario 重疊)

**Type**: Consistency / **Canonical**: SKILL.md Group I + Dim 24 rationale / **Home**: spec.md「邊界案例」rationale

For each DS component, grep 3 stories files。列每 manual story 的 scenario(variant × size × state × 業務情境)。**Rule**:同 scenario 同元件不該在 ≥ 2 file 重複 = noise。Earn-existence test 第 1 條「教別 story 沒教的事」應命中。Report retire candidate per duplicate cluster。Under 300 words. 不修。

## 25. Story 必要性 grounding(manual story 補足模糊原則的具象化)

**Type**: AI-judgement / **Canonical**: SKILL.md Dim 25 / **Home**: spec.md 對應抽象原則段

每 manual story 過 2 test:(a) tied 到 spec 某條抽象原則 + 讓「人」透過範例看懂?(b) 移除後 spec 理解 degrade?兩題皆 NO → retire candidate。**核心 philosophy**:「manual 範例補充模糊原則讓其具象化」非「秀肌肉湊數」。Report per-story:`✅ earn / ❌ retire(reason)/ ⚠️ borderline`。

## 26. Controlled / Uncontrolled dual-mode coherence

**Type**: Absolute / **Canonical**: SKILL.md Group J Dim 26 / **Home**: spec.md「Dual-mode rationale」段

對 form-like + overlay-like 元件 grep dual-mode prop pair:`value/defaultValue + onChange` / `open/defaultOpen + onOpenChange`。**4 違反 case**:V1 missing uncontrolled / V2 missing controlled / V3 no callback / V4 internal state shadows prop。Radix wrapper 必 forward 3 個 prop。**例外**:刻意 single mode 必 spec.md rationale。Report per-component pair status。

## 27. Clean code 量化(auto-chain `/code-quality-audit`)

**Type**: Absolute / **Canonical**: scripts/code-quality-audit.mjs / **Home**: 無

Chain `node scripts/code-quality-audit.mjs --scope=all`(`--deep`)or `--scope=changed`(default)。檢 `any` 使用 / dead export / tsx > 500 行(cap 800)/ function > 80 行 / circular dep / magic number。Report top offenders per rule。

## 28. Manual story 拆分原則 alignment(對齊 Polaris/Carbon/Storybook)

**Type**: Absolute / **Canonical**: `.claude/rules/story-rules.md`「拆分原則」 / **Home**: 檔首 `// @story-split-rationale: <reason>`

Per-component grep `*.stories.tsx`(非 anatomy/principles)反 pattern:
- `WithStartIcon` + `WithEndIcon` 拆兩 story → 該 `WithIcon` 對照 grid
- `Default` + `AllVariants` 同檔 → 冗餘
- ≥ 2 個 variant 拆細 → 該合 `AllVariants`

對齊 Hook `check_story_invariants.sh` R2(write-time)+ 本 dim batch verify 既有元件。

## 31. Overlay body 無 stripped-padding boolean variant

**Type**: Absolute / **Canonical**: `overlay-surface.spec.md`「List-as-region in overlay body」+ memory `feedback_layout_v6_canonical.md` / **Home**: 檔頭 `// overlay-body-stripped-variant-allow:`(必含 ≥ 3 家世界級對照 + multi-row hold)

Per-overlay grep `components/(Dialog|Sheet|Popover)/*.tsx`(非 stories)反 pattern:`(flush|naked|bare|stripped|unpadded|noPadding|paddingless)\?:\s*boolean` 在 body component。對齊 Material/Atlassian/Mantine/shadcn 主流。違反 = list-as-region 該 consumer override(`!px-0 !pt-0`)+ 自管 list outer wrapper。Hook `check_overlay_handcraft.sh` Check 6 同源。

## 32. Filter operator registry SSOT consumption

**Type**: Absolute / **Canonical**: `DataTable/filter-operators.ts` SSOT / **Home**: 檔頭 `// filter-op-inline-allow:`

Per-consumer grep:反 pattern(a)hardcode op 字串 array 不 import `OPERATOR_REGISTRY`;(b)inline switch on op derive ValueShape(該走 `getValueShape`)。對齊 ClickUp/Airtable/Notion filter API + M17 SSOT。

## 33. Component classification + abstraction discipline(5 子維)

**Type**: Consistency / **Canonical**: M21 + M22 + M23 / **Home**: spec.md「abstraction rationale」/「benchmark cite」

Per-component verify:
- (a) Internal vs Components 一致性(對齊 Dim 44)
- (b) Premature abstraction:`<Existing>+suffix` 需 3-test 過(prop variant 不行嗎 / ≥ 3 家 world-class 分離 / value 結構真不同),否則退 prop(M21)
- (c) Sub-component 5-file 結構過度
- (d) Benchmark claim 缺 source(M22 inline cite)
- (e) DS internal canonical 優先(M23):visual decision 未先 grep DS token / variant / pattern 命中 → flag

Sub-agent 對每 benchmark cite 反查 DS 內既有 codified canonical;有 → cite 應為輔證非主導。違反 = M23 自開新 tier。

## 34. Disabled state 顯著性 precedence(M24)

**Type**: Absolute / **Canonical**: M24 + `field-controls.spec.md` disabled state machine / **Home**: spec.md「state precedence」

Per-element grep disabled mode → 內 placeholder / value / icon 全切 `text-fg-disabled`(neutral-6)非 `text-fg-muted`(neutral-7)。state > emphasis。Hook `check_field_family_invariants.sh`(A.4 disabled placeholder color,原 check_disabled_placeholder_color.sh folded 已合入)同源,本 dim DS-wide batch。

## 35. Layered chain invariant — overlay scroll(M25)

**Type**: Absolute / **Canonical**: M25 + `overlay-surface.spec.md` / **Home**: spec.md SSOT

Overlay primitive → SurfaceBody 中間 wrapper 必 `flex flex-col h-full`,斷一層 = body 不 scroll。Hook `check_pattern_invariants.sh`(C.1 overlay scroll chain,原 check_overlay_panel_scroll_chain.sh folded 已合入)同源,本 dim DS-wide batch verify integrity。

## 36. Naked variant cell-as-input row-mode propagation(M19)

**Type**: Absolute / **Canonical**: `nakedCellRowModeAlign` SSOT / **Home**: spec.md

`variant="naked"` consumer 內 wrapper 必 import + apply `nakedCellRowModeAlign` SSOT。Hook `check_field_family_invariants.sh`(A.1 naked row-mode propagation,原 check_naked_row_mode_propagation.sh folded 已合入)同源。

## 37. Field state machine「focus dominates everything」(M19 v13.3)

**Type**: Absolute / **Canonical**: `field-wrapper.tsx` 三 compoundVariant SSOT / **Home**: spec.md state machine 段

禁 per-control `(open|isOpen) && 'border-primary'`(Field default 處理)+ naked variant 禁平行 outline ring。對齊 Material 3 / Polaris / Ant 共識。Hook `check_field_family_invariants.sh`(A.3 Field state ring SSOT,原 check_field_state_token_consume.sh folded 已合入)同源,本 dim batch verify Field family + outliers。

## 38. Inline-action gap canonical

**Type**: Absolute / **Canonical**: `inline-action.spec.md:80` / **Home**: spec.md

`<ItemInlineAction>` sibling gap = `gap-2`(8px)。Hook `check_pattern_invariants.sh`(C.2 inline-action canonical gap,原 check_inline_action_canonical_gap.sh folded 已合入)同源,本 dim batch verify consumer。

## 39. Row-layout slot primitive consumption(M1+M17)

**Type**: Absolute / **Canonical**: `ItemPrefix` / `ItemSuffix` primitive / **Home**: `item-anatomy.spec.md`

禁自刻 `<span h-[1lh] shrink-0 flex items-center>` slot wrapper(item-anatomy / field-wrapper 外),必消費 `<ItemPrefix>` / `<ItemSuffix>`。Hook `check_pattern_invariants.sh`(C.4 row slot handcraft,原 check_row_slot_handcraft.sh folded 已合入)同源。

## 40. Title 命名 quality(story-rules.md L18-22)

**Type**: Absolute / **Canonical**: `.claude/rules/story-rules.md`「Title 命名」 / **Home**: 無 escape

Per-story regex check:`Design System/{Tokens|Patterns|Components|Internal}/{PascalCase Name}/{中文 subpage}` 結構;第一層英 / 子頁中文 / 子頁前**不**加元件名(❌ `MenuItem 展示` → ✓ `展示`)。Tokens/Patterns single-file 3-part exempt(per story-rules canonical)。

## 41. Story name jargon(spec 內部代號)

**Type**: Absolute / **Canonical**: story-rules.md「禁 spec 內部代號」 / **Home**: 無 escape

Grep story `name:` field 含 `L1-L7 | canonical | spec X | phase Y | stream [A-Z]` 等。Hook `check_story_invariants.sh` R5(post-write)同源。本 dim DS-wide batch verify。

## 42. 範例佔位符 / 抽象代號

**Type**: Absolute / **Canonical**: story-rules.md「禁佔位符」 / **Home**: 無 escape(用真實業務情境替代)

Grep `.stories.tsx` body 含 `Option A/B/C` / `按鈕一` / `Foo/Bar/Baz` / `Lorem ipsum` / `Hello World` / `Test 1/2` 等。對齊 Polaris/Carbon 共識用 Jira/Stripe/Notion 真情境。

## 43. Rule note 品質(原則 > 結論 / 無中英夾雜)

**Type**: AI-judgement(NO-SAMPLE per audit-full-sweep canonical:DS-wide ALL principles stories,不 sample)/ **Canonical**: `references/example-selection.md` / **Home**: spec.md rationale

Per-element 讀 `.principles.stories.tsx` Rule notes,判 (a) 是否「告訴讀者原則為何」而非「只說結論」;(b) 是否無中英夾雜(技術術語例外)。

## 44. Internal vs Components 分類三 test

**Type**: Consistency / **Canonical**: story-rules.md L25 / **Home**: spec.md「compound-component API」段(豁免 source)

Per-element folder verify 三 test:(a) 有預設視覺?(b) 直接 `<X>` 有視覺?(c) 所有 consumer 包 wrapper?三題傾向 Internal → 該住 `packages/design-system/src/components/Internal/`。**例外:compound-component public API**(`Dialog.Root/Trigger/Content` / `Field + FieldLabel + FieldError` 等)豁免。Sub-agent 必先檢 component 是否 export ≥ 2 sub-component + spec.md 有「composition pattern / compound API」 cite → 豁免。

## 45. Mechanical output structural validation

**Type**: Absolute / **Canonical**: `scripts/compile-stories.mjs` + `references/anatomy-standard.md` / **Home**: 無

對每元件跑 `compile-stories.mjs <Name>` 取 generated rows;grep 確認:
- `AllSizes` 含所有 cva sizes
- `AllVariants` / `ColorMatrix` 含所有 cva variants
- `Accessibility` story 含 ARIA hint / keyboard map
- `See also` cross-link 反指 spec.md 既有 link section

## 46. Manual vs Mechanical boundary

**Type**: Absolute / **Canonical**: `category-templates.md` v2 trait-based / **Home**: 檔頭 `// @story-trait-rationale: <reason>`(= `check_story_invariants.sh` R3 機械 escape;舊名 `@manual-trait-allow` 無實作已廢)

Per-元件 grep `.stories.tsx`(非 anatomy/principles),若含 trait-derived `AllSizes` / `AllVariants` / `WithIcon` hand-written export 而非 import auto-compile = anti-pattern(該 migrate 進 auto-compile)。

## 47. Tailwind utility registry compliance(2026-05-17 新增,codex Q2 verdict)

**Type**: Absolute / **Canonical**: `packages/design-system/src/tokens/utility-registry.json` SSOT / **Home**: spec.md「禁止事項」(對應 registry block 列)

Per-file grep `packages/design-system/src/**/*.{tsx,css}` + consumer code,對 `utility-registry.json` 每個 block list 跑反 pattern:
- typography:`text-(xs|sm|base|lg|xl|...)` / `font-(thin|light|semibold|black)` / `leading-N` / `tracking-*`
- radius:`rounded-(xl|2xl|3xl)` / `rounded`(無 size)/ `rounded-[Npx]`
- opacity:`opacity-(5|10|...|95)`(numeric tier;只 0/100/disabled allowed)
- elevation:`shadow-(sm|md|lg|xl|2xl|inner)`
- shadcn alias:`bg-popover` / `text-muted-foreground` 等
- primitive class:`bg-neutral-1` / `text-blue-6` 等

對齊 Atlassian `@atlaskit/tokens` + Carbon `@carbon/themes` + Ant ConfigProvider + Polaris `polaris-tokens` registry + lint enforcement。Hook `check_opacity_token_usage.sh`(reads tokens/utility-registry.json;原 doc 稱 check_tailwind_token_registry.sh 之 rename 未實作,SSOT 仍為此 hook)同源,本 dim DS-wide batch。

## 48. Unused / orphan token detector(2026-05-17 新增,codex Q5 verdict)

**Type**: Absolute / **Canonical**: `tokens/**/*.spec.md`「消費者」段 cross-verify / **Home**: spec.md「消費者」段

對每個 token 定義(`--<token-name>` in `tokens/*.css`)grep `packages/design-system/src/**/*.{tsx,css}` consumer。0 consumer = retire 候選。同時驗 spec.md「消費者」段宣稱真有用。對齊 Polaris quarterly token audit + Material `theme-cleanup`。

## 49. a11y axe-core 自動跑 + WCAG contrast ratio(2026-05-17 新增,codex Q5 verdict)

**Type**: Absolute / **Canonical**: WCAG AA(4.5:1 text / 3:1 UI)/ **Home**: spec.md「a11y 預設」段(escape rationale)

Per `*.stories.tsx` 跑 axe-core via Storybook a11y addon;contrast ≥ 4.5:1(text)/ 3:1(large text / UI element)。對齊 Carbon AVT 每 PR + Storybook a11y addon + Atlassian linter integration。需 install `@storybook/addon-a11y` + CI integration。

## 50. Bundle size budget per component(2026-05-17 新增,codex Q5 verdict)

**Type**: Absolute / **Canonical**: `package.json` `size-limit` 段 + per-component manifest / **Home**: spec.md「bundle impact」段

Per component gzip size 上限(eg. Button ≤ 5KB / DataTable ≤ 50KB);CI fail if regress > 10%。對齊 Material UI `size-limit` + Material Web 公開 tracking + Ant tree-shake article + Polaris bundle audit。需 `size-limit` pkg integration。

## 51. Theme / density visual matrix(2026-05-17 新增,codex Q5 verdict)

**Type**: Absolute(deep mode only)/ **Canonical**: visual-audit Layer B + baseline snapshot / **Home**: spec.md「邊界案例」段

Deep mode 每 core story 跑 light/dark/high-contrast/density-md/density-lg/RTL 6-cell matrix screenshot diff;baseline drift > 5% pixel-diff → flag。對齊 Polaris visual regression + Carbon dark token matrix + Material 3 dynamic color + Apple HIG Dynamic Type。Chain `/visual-audit --scope=all --matrix=theme-density-rtl`。

## 52. Header canonical cross-family invariants(2026-05-17 新增,W1-W6 per M31 codex 共識)

**Type**: Absolute / **Canonical**: `patterns/chrome-header/*.spec.md` + `patterns/overlay-surface/*.spec.md` + tokens `--tab-height-lg` / `--chrome-header-height` / `--layout-space-loose` / **Home**: spec.md「header tabs invariant」段

對齊 GitHub Primer header + Ant Design Layout.Header + Material v1 AppBar 共識。Per chrome / overlay header tsx 跑 6 invariants:

- **W1**:含 `<Tabs>` child 必有 `withTabs` prop(border 自動 suppress;手寫 `border-b-0` = 違反)
- **W2**:tabs padding 必 = header padding(`px-[var(--layout-space-loose)]`),不可獨立 padding 值
- **W3**:`--tab-height-lg` 必 == `--chrome-header-height`(md/lg 對等,token 公式 cross-check)
- **W4**:header + tabs flush stack 必無 negative margin(`-mt-px` / `-mb-px` = 違反)
- **W5**:tabs default size 必 = `sm`(已 land);出現 `size="md"` chrome header 場景 = drift
- **W6**:tabs cva `defaultVariants.size` 必 = `sm`(已從 md 改 sm,grep `defaultVariants: { size: 'md' }` in tabs.tsx = bug)

```
Your job: audit Header W1-W6 canonical invariants DS-wide.

Coverage requirement(NO-SAMPLE STRICT):全 `packages/design-system/src/components/*/<X>.tsx` + `packages/design-system/src/patterns/chrome-header/**` + overlay surface header usage。

For each header tsx:
1. **W1** — grep `<Tabs` / `<TabsList` inside header — 若有 → require `withTabs` prop on header element。手寫 `border-b-0` / `border-b-transparent` 同步 flag
2. **W2** — Tabs padding 必 reference `var(--layout-space-loose)`,不可硬寫 `px-N` 或別的 token
3. **W3** — open tokens/uiSize / tokens/layoutSpace spec.md verify `--tab-height-lg === --chrome-header-height`(計算公式對等;不等 = token drift)
4. **W4** — grep `-mt-px` / `-mb-px` / `-mt-N` 在 header + tabs flush stack region = violation
5. **W5** — grep `<Tabs ... size="md"` in chrome header usage = violation(default sm)
6. **W6** — grep `defaultVariants:\s*\{\s*size:\s*['"]md['"]` in `tabs.tsx` cva = violation

Cross-reference companion hooks:
- `check_tab_lg_chrome_header_equal.sh`(W3 mechanical)
- `check_header_with_tabs_border.sh`(W1 mechanical)
- `check_chrome_header_handcraft.sh`(Layer 3 ChromeHeader consumption)

Report ONLY violations。Format:
- `<Component>: W<N> violation — file:line — actual vs canonical`

End: `N header surfaces checked, M violations.` Under 400 words. Don't fix.
```

## 53. Code-to-spec reverse drift check(2026-05-17 新增,FileViewer h-14 case 啟發)

**Type**: Absolute / **Canonical**: per-component `spec.md`「禁止事項」段 + `<X>.tsx` 真實 className 對比 / **Home**: 該 component spec.md(rationale 段)

對每 component grep `packages/design-system/src/components/<X>/<X>.tsx` 的硬寫 utility(`h-14` / `w-80` / `px-loose` 類 — code 已 migrate to token / DS canonical),反向掃對應 `<X>.spec.md` 是否仍寫「固定 h-NN」「寫死 N px」「H 不消費 token」等 known-drift keyword。**互補既有 forward Dim 15/20(spec → code drift)— 本 dim 抓 spec → code 反向 drift**(code 已對齊 spec 還寫 drift caveat = 漏改)。

```
Your job: detect spec → code reverse drift(spec writes「known drift / hardcoded / 未消費 token」keyword 但 code has migrated to token / DS canonical).

Coverage requirement(NO-SAMPLE STRICT):全 `packages/design-system/src/components/*/`(60+ 元件)。

For each component:
1. Grep `<X>.spec.md` 找 keyword:`known drift` / `hardcoded` / `寫死` / `不消費 token` / `h-NN 硬寫` / `w-NN 硬寫` / `未對齊 token` / `TODO migrate` / `interim hardcode`
2. 若命中 → 開 `<X>.tsx` grep 對應 className(`h-14` / `w-80` / `px-N` 等具體值)
3. **若 code 已 token-ified(`h-[var(--chrome-header-height)]` / `w-[var(--field-width-md)]` / `px-loose` 等)** → spec.md 仍寫 drift caveat = **reverse drift**(漏改)。Flag
4. Cross-reference write-time hook `check_spec_class_drift.sh`(本 dim batch verify hook 未覆蓋的既存 drift)

錨例(2026-05-17 Phase 1 漏抓):
- `file-viewer.spec.md` L103 寫「Known drift:h-14 硬寫不消費 token」
- 但 `file-viewer.tsx:333` 已 `h-[var(--chrome-header-height)]` migrate 完成
- → spec.md 那段該刪 / 該改寫 rationale,3+ 次 `--deep` 都沒抓到

Report ONLY violations。Format:
- `<Component>: spec.md L<N> 寫「<drift keyword>」 vs <X>.tsx L<M> 已 token-ified `<actual className>`(spec 漏改)`

End: `N components checked, M reverse drift gaps.` Under 400 words. Don't fix.
```

## 55. Token cross-namespace mapping integrity(PURE-JUDGMENT,2026-05-31 reclassify — 原誤標 HOOK 無 hook)

**Type**: Absolute / **Canonical**: `packages/design-system/src/tokens/color/semantic.css` 12-hue interaction mapping / **Home**: color.spec.md

```
Your job(NO-SAMPLE):讀 semantic.css 的 12-hue interaction token mapping(約 L246-273),逐 hue 驗 semantic
→primitive step 正確一致(eg. primary→-6 / info→-5 / error→-7 / success→-1 / warning→-7 + hover/active step)。
Enumerate 全 12 hue。Report 任何 mapping 不一致 / 缺 hue / step 錯 with semantic.css:line。End:`12 hue checked, M mapping gaps`。Don't fix.
```

## 62. Fork Netlify onboarding canonical(PURE-JUDGMENT,2026-05-31 補 — infra-audit self-finding 漏)

**Type**: Absolute / **Canonical**: `template/ds-product-template/{netlify.toml,.storybook/manager-head.html,CLAUDE.md}` + `scripts/setup-netlify-access.mjs` + `build-published-template-mirror.mjs` / **Home**: scenario-definition.md

```
Your job(NO-SAMPLE):驗 fork user 從 published template 起手到首次部署的 onboarding 全鏈完整且正確。
Enumerate + Read(全部,非 sample):template/ds-product-template/ 全 27 file 中的 netlify.toml / manager-head.html /
CLAUDE.md Access-control 段 / package.json deploy scripts / setup-netlify-access.mjs。對每環節驗:
1. netlify.toml build/publish/headers 正確(consumer 直接能 deploy)
2. Basic Password / Access-control 機制有 documented plain-Chinese 引導
3. mirror build 真把這些 inject 到 published(跑 build-published-template-mirror.mjs --out 驗 0 leak + 檔齊)
4. CLAUDE.md 對 fork user 的 setup 步驟無斷點 / 斷點有具體中文引導
Report file:line gaps。End:`N onboarding 環節 checked, M gaps`。Don't fix.
```

## 66. Cross-repo dispatch + visual parity(PURE-JUDGMENT,2026-05-31 補)

**Type**: Absolute / **Canonical**: `release.yml` dispatch steps + `template/sync-design-system.yml` + `composition-fidelity.yml` + `dogfood-prepublish-verify.mjs` + `scripts/visual-assertions.json` / **Home**: scenario-definition.md mirror chain

```
Your job(NO-SAMPLE):驗 DS push main → npm publish → fork repo 取得更新 → visual parity 整鏈無斷。
Enumerate + Read:release.yml(publish + dispatch)/ mirror workflow / sync-design-system.yml(fork 端接收)/
composition-fidelity visual-diff scenarios(全 N scenario)/ dogfood-prepublish。對每環節驗 trigger event type 正確、
無 PAT scope 漏、visual parity scenario 覆蓋 stakeholder flow。Report file:line。End:`N 環節, M gaps`。Don't fix.
```

## 68. Stories-vs-spec drift(PURE-JUDGMENT,2026-05-31 補)

**Type**: Absolute / **Canonical**: `story-baseline-registry.json`(R8 主防線)+ 各 component spec.md 禁止事項;`@canonical-pattern` / `@anti-pattern` marker = 建議性輔助(2026-06-12 降格)/ **Home**: 該 component spec.md

```
Your job(NO-SAMPLE 全 component):驗 stories 教的 pattern 與 spec.md「禁止事項」+ story-baseline-registry.json
antiPatterns 一致(marker 為建議性輔助,存在時順驗其與 spec 一致;缺 marker 非 finding),
且 anatomy/principles 教的 pattern 未與 spec「禁止事項」矛盾。Enumerate 全 83 component。Report file:line drift。
End:`N components, M drift`。Don't fix.
```

## 72. DS API surface tightening(PURE-JUDGMENT,2026-05-31 補)

**Type**: Watch / **Canonical**: per-component API surface + `tightening-roadmap.md`(若存在;不存在則以 props-naming.md + 各 spec API 段為準)/ **Home**: 該 component spec.md API 段

```
Your job(NO-SAMPLE 全 component):per-component review 公開 API surface 是否過寬 / 漏緊(eg. CircularProgress
size?:number 該否限 token tier、prop 命名違 props-naming canonical、escape-hatch prop 該收)。Enumerate 全 component
export interface。Report over-broad / mis-named API with file:line + 建議 tighten 方向(propose only,不自動改 = SSOT-UI/UX)。
End:`N components, M API-surface concerns`。Don't fix。

【internal-vs-public(2026-06-05 dim-72 SSOT,已落地,勿再 flag 為 over-broad）】internal 元件/pattern
(frontmatter `- isInternal` / `internal: true`,storybook `Design System/Internal[/| ]`)**刻意排除 root barrel
front-door**,僅留 subpath(per ui-development.md「Root barrel front-door 排除」+ user Q2 原則「internal 包裝後才可用」)。
判定 PASS 條件:該 internal 不在 `packages/design-system/src/index.ts`(機械 `gen-design-system-barrel.mjs --check`
已於 release:preflight gate)。**只在**「internal 卻仍出現在 root barrel」或「marking 不一致(frontmatter internal 但
storybook 非 Internal,反之亦然)」時才 flag。已 subpath-only = 合規,non-finding。
```
