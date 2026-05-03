---
name: design-system-audit
description: Systematic audit of this design system for world-class quality. Runs 27 audits covering spec hygiene / code correctness / a11y / naming / tokens / patterns / CLAUDE.md consistency / Layout Family compliance / prop value collisions / shadcn alias leakage / home-name-vs-scope fit / spec hardcoded-values, and surfaces actionable fix lists. Has explicit checkpoints where the skill MUST stop and ask user. Invoke via /design-system-audit when asked to audit, re-audit, check quality, or verify design system health.
---

# Design System Audit (31 audits, Groups A–M, world-class)

Purpose: catch every bug class this project has shipped historically PLUS structural gaps relative to Polaris / Material / Atlassian / Ant / Carbon / Apple HIG. Each audit has a clear rubric tied to CLAUDE.md rules. The skill reports findings and **explicitly stops at checkpoints** for user decisions before large-scope fixes.

## Skill 生態位

本 skill audit **DS 本身**(`src/design-system/` 內部的 spec / cva / SSOT / layout primitives 等)。若要 audit **consumer 層 UI code**(`src/app/` / `src/explorations/` 用 DS 的地方是否正確),走 `/product-ui-audit`。兩 skill scope 正交,不重疊。

```
/design-system-audit    audit DS 本身(本 skill)— Phase 1-4 統籌,Phase 3 chain 各維 skill
/product-ui-audit       audit consumer UI 對 DS 的消費
/prototype              建 exploration(Phase 3.5 強制進階 6 維)
/delivery-handoff       產品 final 後的交付文件包
```

## 對齊 CLAUDE.md `# 稽核 canonical` — 本 skill 是 6 維的 D1 + D2 home

CLAUDE.md 定義 6 維:D1 設計語言 / D2 程式語言 / D3 效能 / D4 UX / D5 視覺 / D6 原則自檢。本 skill 的 27 audits 覆蓋 **D1 + D2**(spec hygiene / code correctness / SSOT / cva / naming / tokens / patterns)。**D3-D5 由對應 skill 處理**:

| 維度 | 對應 skill |
|------|-----------|
| D1 設計語言 | 本 skill Audits 1-27(Groups A–K)|
| D2 程式語言 | 本 skill(cva / types / imports 部分)+ tsc / lint |
| D3 元件效能 | `/performance-audit`(render / memo / bundle) |
| D4 UX 行為 | `/ux-audit`(keyboard / focus / ARIA / animation) |
| D5 視覺品質 | `/visual-audit`(Layer A mechanical + Layer B AI) |
| D6 原則自檢 | 本 skill Phase 4 報告含「提議討論」區(對齊 `# 稽核 canonical`「Audit-vs-execute 分權」) |

**進階模式 scope=all**(全 DS 健檢 / release cut):本 skill Phase 3 chain `/performance-audit --scope=all` + `/ux-audit --scope=all` + `/visual-audit` 完整 6 維 sweep。

## When to run

- User asks to audit / re-audit / 檢查 / verify design system
- Before major release or version bump
- After large refactor that touched specs, cva defaults, or tokens
- Periodic health check (monthly-ish)
- User mentions "world-class" or quality concerns

## Preconditions

- Working directory is project root (verify `src/design-system/` exists)
- `CLAUDE.md` read fully at start (rules evolve; don't audit from memory)
- Current branch clean OR user acknowledges changes will be reviewed before commit

---

## The 27 audits

Grouped by theme. Each runs as an independent subagent; many can parallelize.

### Group A — Correctness (bug-class guards, P0 priority)

| # | Audit | What it catches |
|---|-------|-----------------|
| 1 | **cva defaultVariants 三方漂移** | `cva()` vs spec prop table vs tsx docblock vs anatomy prop table disagreement on default value |
| 2 | **SSOT dead link** | `xxx.spec.md「HEADING」` pointers that don't resolve to a real heading |
| 3 | **SSOT reciprocal** | A → B pointer exists but B → A reverse pointer missing (CLAUDE.md: reciprocal 必須存在) |
| 4 | **Tailwind v4 / tailwind-merge grep** | `className="[--foo]"` (needs `var()`) / unused Swatch helper / registered group mismatch |
| 5 | **Token 消費紀律** | Hardcoded hex / rgb / px color values in `.tsx` when a semantic token exists |

### Group B — Spec hygiene (world-class DS rubric, P1 priority)

| # | Audit | What it catches |
|---|-------|-----------------|
| 6 | **Spec Rule A 文字品質** | Visual descriptions / pixel leaks / physical metaphors in `.spec.md` (belong in stories) |
| 7 | **Spec Rule B 邊界案例** | Missing disabled/loading/empty/dark mode/density/icon-only coverage (apply scope defaults) |
| 8 | **7-維度 對標覆蓋** | Each spec covers the 7 world-class dimensions: 何時用 / 何時不用 / 近親元件分界 / 常見誤解 / 相關 links / 空值 / 驗證時機 / Loading / a11y 預設 |

### Group C — Code conformance (P1 priority)

| # | Audit | What it catches |
|---|-------|-----------------|
| 9 | **shadcn passthrough 完整度** | Missing `React.forwardRef` / `displayName` / `asChild` / `...props` spread / Radix `data-state` retention |
| 10 | **a11y 基本覆蓋** | icon-only without `aria-label`, interactive elements without ARIA role, missing keyboard handlers |

### Group D — Story layer (designer-facing, P1 priority)

| # | Audit | What it catches |
|---|-------|-----------------|
| 11 | **Story 三層齊全** | Every `Components/` (public) component has all 3: `.stories.tsx` / `.anatomy.stories.tsx` / `.principles.stories.tsx` |
| 12 | **Story 人話範例** | Placeholder / abstract codes / extreme scenarios / variant names as labels |
| 13 | **Anatomy Figma-inspect 完整度** | 5 mandatory sections present / token-first / dev language / no density dual / live swatches |

### Group E — System-level consistency (P1 priority)

| # | Audit | What it catches |
|---|-------|-----------------|
| 14 | **命名一致性** | PascalCase folder / kebab-case file / hook naming / spec chapter 中文 / identifier 英文 / single-file 語言統一 |
| 15 | **Cross-doc 一致性** | CLAUDE.md 自身 + cross-spec full dup(Rule-of-3)+ tsx docblock-spec drift + stale upgrade markers。詳 `audit-prompts.md` Dim 15 |

### Group F — Architecture compliance (P1 priority, session-learned)

| # | Audit | What it catches |
|---|-------|-----------------|
| 16 | **Layout Family 宣告** | 每個 component spec 第一段必須宣告「Layout Family: 1/2/3/4」或明示「非 family（self-contained / composite）」; 缺漏代表元件遊離於系統 |
| 17 | **Prop value 跨元件認知衝突** | 同字 literal 在不同元件作 prop value 但語義衝突(`text` 是 Button `variant="text"` 文字樣式,若 FileItem `mode="text"` 變成「文字為主呈現」= 雙語義,consumer 混淆)——命名三 test 第 3 條強制檢查 |
| 18 | **shadcn compat alias 回流檢查** | grep `bg-popover / text-popover-foreground / text-muted-foreground / bg-accent / text-accent-foreground / bg-destructive / bg-background` 等在我們的元件 code——這些是 shadcn copy-paste 安全網,我們元件應用 direct token。每次 audit 重新 grep 防 `npx shadcn add X` 新生成的 code 留下 alias |

### Group G — Home governance + spec hygiene (P1 priority)

| # | Audit | What it catches |
|---|-------|-----------------|
| 19 | **Home-name-vs-scope 一致性** | classification folder 名稱若與實際 scope 偏離(item-layout 裝 4-family taxonomy → rename item-anatomy 的學到的教訓);charter README 說的「這裡收 X」與實際內容是否一致 |
| 20 | **Spec 硬寫機械化值檢查** | spec.md 不該有 `5.5px` / 完整 Tailwind class lists / cva object literals — 這些屬 tsx;spec 只記錄「為什麼」的判斷性描述 |

### Group H — Consumer-layer consistency (P0 / P1,2026-04-22 新增)

| # | Audit | What it catches |
|---|-------|-----------------|
| 21 | **連續 item list wrapper gap**(consumer 層 Consistency)| consumer stories / app code 的 `.map()` list wrapper gap 是否對齊 item 元件的「List wrapper canonical」:standalone card/pill → 必 gap;flush/transparent → 0 gap OK;mixed 視覺語言 → 必取保守 gap。hook `check_item_list_gap.sh` 是預警層,本 dim 補 audit 層 |
| 22 | **視覺容器 inner breathing**(consumer 層 Absolute)| consumer 自建的視覺邊界容器(permanent bg / border / shadow 三擇一)是否有 inner padding。hook `check_container_breathing.sh` 是預警層,本 dim 補 multi-line className / 非 div 容器的 case |

### Group I — Story auto-compile drift(2026-04-24 新增 C Phase 4)

| # | Audit | What it catches |
|---|-------|-----------------|
| 23 | **Story canonical-drift + Migration coverage**(spec/tsx vs stories) | 跑 `node scripts/compile-stories.mjs --all --check` — 兩類 finding:(a) 已 migration 元件 key 不齊 = **P0 drift**(立即修);(b) 未 migration 元件(無 `componentMeta` export / 無 spec frontmatter)= **P2 migration pending**(必 Checkpoint 1 提報 user,Phase 3 chain `/story-auto-compile-migrate` 批次處理,不 silent skip)。進階模式 `--deep` 必跑本 Dim 直到全 DS 元件都 migrated + 0 drift |
| 24 | **Story 範例重複性**(manual stories 不該彼此 scenario 重疊) | 對每元件,跨 3 個 stories 檔(展示 / anatomy / principles)列所有 manual story 的 scenario。若兩 story 呈現同 variant × size × state × 業務情境 → 重複 = noise。以「**可舉一反三**」為 unique-teaching test:每個 manual story 必**教讀者一條別 story 沒教的原則**。重複 → retire 候選。AI judgement dim,sub-agent 讀 spec + stories 判斷 |
| 25 | **Story 必要性 grounding**(manual story 補足模糊原則的具象化)| 每個 manual story 過 2 test:(a) 是否 tied 到 spec 某條抽象原則,讓「人」透過範例看懂原則?(b) 移除後 spec 理解是否 degrade?兩題皆 NO → story 不 earn its existence,retire 候選。核心 philosophy:「**manual 範例補充模糊原則讓其具象化,給人看得懂為主**」— 不是秀肌肉不是湊數。AI judgement dim |

### Group J — Form & state integrity(2026-04-24 新增,補 24-checklist #3+#12 gap)

| # | Audit | What it catches |
|---|-------|-----------------|
| 26 | **Controlled / Uncontrolled dual-mode coherence**(Absolute)| form-like(Input / Select / Combobox / Checkbox / Switch / DatePicker / RadioGroup / Tabs / Accordion)+ overlay-like(Dialog / Sheet / Popover / DropdownMenu / HoverCard / FileViewer)的 dual-mode prop pair 完整性。V1 missing uncontrolled fallback / V2 missing controlled / V3 no callback / V4 internal state shadows prop。Radix wrapper 必 forward `open / defaultOpen / onOpenChange` 3 個。刻意單一模式須 spec.md rationale |

### Group K — Code quality hygiene(2026-04-24 新增,補 clean code 缺口)

| # | Audit | What it catches |
|---|-------|-----------------|
| 27 | **Clean code 量化**(auto-chain `/code-quality-audit`)| `any` 使用(無 `// any-allow` escape) / dead export / tsx file-size budget 500(cap 800) / long function > 80 行 / circular dep / magic number(與 `check_token_hygiene.sh` 正交)。進階模式 `--deep` 必 chain `node scripts/code-quality-audit.mjs --scope=all`;其他模式 scope=changed |

### Group L — Story splitting principle(2026-04-26 新增)

| # | Audit | What it catches |
|---|-------|-----------------|
| 28 | **Manual story 拆分原則 alignment**(對齊 Polaris / Carbon / Storybook 官方)| Per-component grep `*.stories.tsx`(non-anatomy/principles)反 pattern:(1) `WithStartIcon`+`WithEndIcon` 拆兩 story(同 slot rule 違規,該 `WithIcon` 對照 grid)(2) `Default`+`AllVariants` 同檔(冗餘)(3) ≥2 個 variant 拆細(`Primary`+`Secondary`+`Tertiary` 各自 — 該合 `AllVariants`)。`// @story-split-rationale: <reason>` 檔首 allowlist 例外。Hook `check_story_slot_split.sh` write-time block 同源,本 dim 對既有元件 batch verify。對應 `.claude/rules/story-rules.md`「拆分原則」+ `/story-writing` skill Phase 0 |
| 29 | **Trait-based展示 stories compliance**(對齊 M19 ensure-canonical pipeline + Polaris/Material/Carbon/Ant/Storybook)| Per-component verify(a)spec.md frontmatter 有 `traits:` 宣告(b)展示 stories.tsx 包含每 trait 的 required core stories(c)scope-N/A 的 trait 在 spec.md 邊界案例段有 rationale。違反列 P0 修。對應 `category-templates.md` v2 + hook `check_story_category.sh`。Hook 是 write-time block,本 dim 對既有 47 元件 batch verify + 找未宣告 traits 的元件(P2 migration pending) |
| 30 | **Principles canonical compliance**(對齊 Polaris / Carbon / Ant 共識)| Per-component verify principles.stories.tsx:(a)universal core ≥ 2 of {WhenToUse / WhenNotToUse / Vs*Rule / ContentGuidelines}(b)無 deprecated 命名(`Forbidden*` / `Donts` / `Pitfalls` / `Prohibitions` / `NonGoals` / `VisualDonts` 全 deprecated → `WhenNotToUse`)。對應 `category-templates.md`「Principles canonical」節 + hook `check_principles_canonical.sh`。Hook 是 write-time block,本 dim 對既有 47 元件 batch verify(預期 13 元件 deprecated naming + 52 元件缺 WhenToUse)|

### Group M — Overlay body API discipline(2026-05-01 新增)

| # | Audit | What it catches |
|---|-------|-----------------|
| 31 | **Overlay body 無 stripped-padding boolean variant**(對齊 Material/Atlassian/Mantine/shadcn 主流;Polaris flush API 例外但 scope 極窄)| Per-overlay grep `components/(Dialog\|Sheet\|Popover)/*.tsx`(非 stories)反 pattern:`(flush\|naked\|bare\|stripped\|unpadded\|noPadding\|paddingless)\?:\s*boolean` 在 body component。違反 = list-as-region 場景該由 consumer 用 className override(`!px-0 !pt-0 !pb-0`)+ 自管 list outer wrapper 處理,不該加 body variant。Rationale:variant 不解決底層脆弱(加 1 row search/banner 就破功)+ 把 1 surface decision 拆兩 API。對應 hook `check_overlay_handcraft.sh` Check 6 + `overlay-surface.spec.md`「List-as-region in overlay body」+ memory `feedback_layout_v6_canonical.md`。Hook 是 write-time block,本 dim 對既有 overlay 元件 + 未來新增 overlay primitive(Drawer / FileViewer body 等)batch verify。`// overlay-body-stripped-variant-allow:` 檔頭 allowlist 例外(必含 ≥3 家世界級對照 + multi-row hold 保證)|
| 32 | **Filter operator registry SSOT consumption**(對齊 ClickUp/Airtable/Notion API + M17)| Per-consumer grep:反 pattern(a)hardcode op 字串 array 不 import `OPERATOR_REGISTRY`;(b)inline switch on op derive ValueShape(該走 `getValueShape`)。SSOT:`DataTable/filter-operators.ts`。`// filter-op-inline-allow:` 檔頭 escape |
| 33 | **Component classification + abstraction discipline**(對齊 M21 + M22)| Per-component verify 4 子維:(a) **Internal vs Components 一致性**:3 stories 檔(展示 / 設計規格 / 設計原則)title namespace 全 `Components/` XOR 全 `Internal/`(SelectionControl 2026-05-02 bug);(b) **Premature abstraction**:元件名後綴匹配既有元件(`<X>Time / <X>Range / <X>Color / ...`)→ 強制 spec.md 寫「為何不用 prop on `<X>`」rationale section + ≥3 家 world-class cite(DateTimePicker 2026-05-02 bug);(c) **Sub-component 5-file 結構過度**:某 component 在另一 component 子資料夾 + 自帶 5-file → flag,除非是 cross-component primitive(被 ≥3 個 parent components import,e.g., `MenuItem` 被 DropdownMenu / SelectMenu / DataTable 共用 → legitimate 5-file)。Sub-only(只 parent 用)→ 該對齊 SortManager sub-file pattern,合進 parent spec / stories — DataTableFilterPanel 2026-05-02 bug;(d) **Benchmark claim 缺 source**:spec / tsx 含 world-class DS keyword 但無 inline URL / `#L42` / `snapshots/` reference → flag(M22)。Hooks `check_internal_namespace_consistency.sh` + `check_premature_abstraction.sh` + `check_benchmark_citation.sh` 是 write-time block,本 dim 對既有 47 元件 batch verify。|

---

## Workflow

### Phase 0 — Setup + Build Baseline

1. Read `CLAUDE.md` completely
2. Run `git status --short` — baseline
3. **Build baseline — if any fail, STOP and report (see Checkpoint 5)**:
   - `npx tsc -b 2>&1 | grep -c "error TS"` — must be `0`
   - `npx vite build 2>&1 | tail -3` — must show `✓ built in`
   - `lsof -i :6006 -t` OR `npm run build-storybook 2>&1 | tail -3` — storybook must build clean
   - `grep -rE '\.stories\.tsx$' src/design-system/components` + syntax-check each via quick `npx tsc --noEmit <file>` sample — catches stories that index but type-fail
4. **Mechanical content-quality baseline**(2026-04-26 整合,16 cat 涵蓋本 conv 發現的所有 storybook drift):
   - `node scripts/audit-content-quality.mjs --check` — must show `✅ No content drift detected`(16 categories:anatomy numbering / non-anatomy numbering / LinkTo missing / stub pattern / missing zh-CN name / placeholder content / empty render / English placeholder / anatomy canonical names / numbering gap / showcase missing / per-size split / principles ≥ 2 / ASCII art / abstract names / thin description)
   - `node scripts/extract-canonical-rules.mjs` — must show `✅ All extracted rule keywords covered`(rules-vs-audit coverage gap detection)
   - **violation 在 Phase 0 出現**:Phase 1 開跑前先列入 P0 待修(mechanical 不 judgment)
5. **If any baseline fails**: do NOT run the 20 dimensions yet. Audit quality assumes the code compiles. Report build status and ask user whether to fix build first OR proceed anyway (audit on broken code has limited value — many dimensions can't run meaningfully)
6. Create TaskList entries for each audit you plan to run

### Phase 1 — Parallel audit execution

Launch all 27 audits as background subagents (single message, multiple `Agent` tool calls with `run_in_background: true`). Use prompts in [references/audit-prompts.md](references/audit-prompts.md).

**Every audit prompt declares three metadata lines at top**:
- **Type**: `Absolute` or `Consistency` (per CLAUDE.md「Consistency Audit 原則」)
- **Canonical source**: where correct behavior is defined
- **Rationale home**: where deviation justification should live (`N/A` for Absolute)

Sub-agents applying a **Consistency** dim **must** search the Rationale home for each apparent deviation before reporting as VIOLATION. A documented rationale paragraph = `deviation ✓` (not a violation). Absolute dims apply strict `actual == canonical` check.

Each audit reports:
- Violations only (skip confirmations); for Consistency dims, also list `deviation ✓` items with rationale location as evidence the framework caught-and-cleared them
- file:line for every finding
- Suggested fix direction
- Count + top offenders

### Phase 2 — Triage + CHECKPOINT 1 (MUST ASK)

Consolidate into priority matrix:

| Priority | Category | Examples |
|---|---|---|
| **P0 (auto-fix OK)** | Three-way drift / dead links / Tailwind v4 grep violations / hardcoded colors | 明確 bug，surgical 修復，無 scope 爭議 |
| **P1 (batch-fix + review)** | Rule A / 人話 / shadcn passthrough holes / a11y missing aria-label / anatomy missing section | 每組一個 commit，改完立刻 review |
| **P2 (MUST ASK)** | Rule B scope / new rule proposals / Internal vs Components reclassification / cross-cutting refactors (helper extraction 41 files) | 需 user 決策 scope |

### ⚠️ Checkpoint 1 — ALWAYS ASK before P2

Present to user:
```
Found: N P0, M P1, K P2.
P0 + P1 I'll auto-fix (grouped commits).
P2 decisions needed:
- [list each P2 finding + proposed options]
Proceed with P0+P1? Then discuss P2?
```

**Do NOT skip this step.** Previous audit runs failed when I mechanically applied fixes to 46 specs without scope discussion.

### Phase 3 — Apply fixes (grouped commits)

For each fix group:
1. Apply fixes surgically (Edit, not Write)
2. Run `npx tsc --noEmit` — must pass
3. Commit with descriptive message listing what changed

Typical commit groups:
- `fix: cva three-way drift — X components`
- `docs: Spec Rule A cleanup — remove visual pollution from N specs`
- `feat: a11y — add aria-label to icon-only buttons (X components)`
- `docs: Anatomy — live color swatches + complete missing sections`
- `docs: CLAUDE.md — resolve internal contradiction in X`

### ⚠️ Checkpoint 2 — ALWAYS ASK when audit reveals a gap in CLAUDE.md

If any audit surfaces a pattern NOT covered by an existing CLAUDE.md rule (e.g., "a11y audit found 7 components missing focus-visible — no explicit rule about focus ring"), STOP:

```
Audit found a pattern not codified in CLAUDE.md:
[describe pattern]
Proposed new rule for CLAUDE.md: [draft]
Approve adding to CLAUDE.md? Or different phrasing?
```

### ⚠️ Checkpoint 3 — ALWAYS ASK when classification is ambiguous

Audits may find:
- Component that's borderline `Internal/` vs `Components/`
- Pattern that could be SSOT-owned by either of two spec files
- Token that could be primitive vs semantic

STOP and present options with rationale — don't decide unilaterally.

### ⚠️ Checkpoint 4 — Cross-cutting refactor（影響 > 10 檔）

When a fix touches 10+ files (e.g., helper extraction across 41 anatomy files, token rename across 71 utility usages), STOP and present execution-strategy options (one commit / N commits / defer). Full template in [references/checkpoints.md](references/checkpoints.md).

### ⚠️ Checkpoint 5 — 環境 / 建置問題

If audit encounters env / build issue (node_modules broken, storybook module-not-found), DO NOT attempt to fix env within audit scope. Report separately. Full template in [references/checkpoints.md](references/checkpoints.md).

### ⚠️ Checkpoint 6 — 發現 spec 與 code 衝突

When audit finds spec.md describes behavior different from tsx actual, STOP — don't silently pick one. Present options + git log context. Full template in [references/checkpoints.md](references/checkpoints.md).

### ⚠️ Checkpoint 7 — HANDLE「先不管」correctly（user directive semantic）

**本 checkpoint 是 Skill 自身 SSOT**（CLAUDE.md 規則分層決定:對話 protocol 屬 skill 層,非設計規則層）:

| User phrasing | Meaning | Action |
|---------------|---------|--------|
| 「先不管」/「這個先跳過」 | **Completely ignore** — not a tech debt | Do NOT add to memory, failure index, or next-audit surface. Act as if topic never existed. |
| 「之後再處理」/「先記下來」 | Park as tech debt | Add to `memory/project_audit_progress.md` 「仍待未來處理」 |
| 「全部做完」/「馬不停蹄」| Execute now | Proceed |

**Never conflate the two**: adding a 「先不管」 item to tech debt violates user's explicit directive (it re-surfaces on next audit, creating noise).

### ⚠️ Naming proposal — RUN 3-test BEFORE Checkpoint 2 approval

Any new naming proposal MUST pass CLAUDE.md `## 命名必過三重 test` before Checkpoint 2. Tests defined in CLAUDE.md (SSOT) — **do not re-spec here**. Historical example:`text/picture` failed test 3(collides with Button `variant="text"`)→ changed to `compact/rich`。

### Phase 3.5 — 進階 6 維稽核 D3-D6(對齊 CLAUDE.md `# 稽核 canonical`)

Phase 1-3 覆蓋 D1+D2;D3-D6 chain 專門 skill。**模式**:高效(default)scope=changed 只跑 D5;進階 scope=all 跑全 D3-D6(trigger:`--deep` / 動 tokens|patterns/ / user 要求「完整 audit」)。

| Sub | 維度 | Skill | 規則 |
|-----|------|-------|------|
| 3.5a | D5 視覺 | `npm run visual-audit` Layer A → `/visual-audit` Layer B | violation 開新 commit 修回圈 |
| 3.5b | D3 效能 | `/performance-audit` | 修實作 auto / 改 canonical STOP |
| 3.5c | D4 UX | `/ux-audit` | P0 a11y 必修 / P1 triage |
| 3.5d | D6 原則自檢 | `references/principle-audit-protocol.md` 4 子維(合理 / 一致 / 無矛盾 / 完整)| 動 canonical substantive STOP / 對齊 / 補 pointer AUTO;scan 前必讀「常見 FP 記憶」節 |

**跳過**:spec.md 純文字改 / 高效模式只跑 3.5a。

### Phase 4.5 — Governance sprawl check(進階強制 chain `/knowledge-prune`)

**Trigger**:CLAUDE.md > 800 / MEMORY > 20 / 動 Meta-Pattern / hook-fires 6 月 0 fire / corrections > 10 — 任一 chain `/knowledge-prune` scope=full;P2 STOP 等 user;prune 完回 Phase 4。**不 trigger**:高效模式 / 無 Meta + sizes OK + logs 無 dead。Phase 3-4 後跑因 governance 已最新狀態。

### Phase 4 — Final report + memory update + Self-improvement capture(強制)

After all commits:
- Update `memory/project_audit_progress.md`:
  - Date + audit coverage (which of the 20 + 6 dims)
  - Findings + resolved counts
  - Known remaining gaps (deferred P2)
- Short final report:
  - Commits created
  - Deferred items with reasons
  - Next re-audit trigger

**Self-improvement capture(強制,CLAUDE.md `# 資訊治理 canonical` → Audit skill Phase F 節)**:

```markdown
## Self-improvement capture
- 新發現 FP pattern: {描述 + 已回填到 principle-audit-protocol.md 或 audit-prompts.md} OR "無新 FP"
- 新確立 meta-pattern: {描述 + 已提議加到 CLAUDE.md Meta-Pattern 預警 / patterns spec} OR "無新 pattern"
- 修完的矛盾 / user 糾正: {list + 回填位置(memory / CLAUDE.md / spec)} OR "無糾正"
```

**規則**:
- 無 learning 的 audit 要寫 "無新 pattern"(不省略)
- 發現 FP → **session 結束前必回填** principle-audit-protocol.md 的「常見 FP 記憶」節
- 發現 meta-pattern → **STOP 提議**(動 canonical substantive)
- User 糾正 → 寫入對應 home(memory feedback / CLAUDE.md / skill reference)

---

## Non-goals

- Don't rewrite specs / stories from scratch (surgical only)
- Don't fix pre-existing env issues (node_modules / storybook module-not-found)
- Don't add new components / features (separate work)
- **Don't skip checkpoints** — user decides P2 and new-rule scope
- Don't collapse audit output into summaries before presenting — user needs file:line details

## Common failure modes (watch for these)

- **Agent hallucinates a fix** → always cross-check file:line before editing
- **Rule B gaps are mostly scope-N/A** → apply CLAUDE.md scope defaults; don't stub 46 specs
- **cva audit false positive** → only report if spec/anatomy make a claim that contradicts code
- **Story audit flags aria-label / cva values** → exclude these from violation criteria
- **a11y audit over-flags** → Radix primitives handle most ARIA; check if Radix base already provides before flagging wrapper
- **Skipping Checkpoint 1** → history shows this leads to mechanical changes with unclear scope; always present triage to user first

## References

- [references/audit-prompts.md](references/audit-prompts.md) — Exact subagent prompts for all 27 audits
- [references/historical-bugs.md](references/historical-bugs.md) — Bug classes indexed by audit
- [references/checkpoints.md](references/checkpoints.md) — Detailed examples of each MUST-ASK scenario
