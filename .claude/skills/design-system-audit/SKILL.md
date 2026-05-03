---
name: design-system-audit
description: Systematic audit of this design system for world-class quality. Runs 27 audits covering spec hygiene / code correctness / a11y / naming / tokens / patterns / CLAUDE.md consistency / Layout Family compliance / prop value collisions / shadcn alias leakage / home-name-vs-scope fit / spec hardcoded-values, and surfaces actionable fix lists. Has explicit checkpoints where the skill MUST stop and ask user. Invoke via /design-system-audit when asked to audit, re-audit, check quality, or verify design system health.
---

# Design System Audit (31 audits, Groups A–M, world-class)

Purpose: catch every bug class this project has shipped historically PLUS structural gaps relative to Polaris / Material / Atlassian / Ant / Carbon / Apple HIG. Each audit has a clear rubric tied to CLAUDE.md rules. The skill reports findings and **explicitly stops at checkpoints** for user decisions before large-scope fixes.

## Skill 生態位 + 6 維對齊

本 skill audit **DS 本身**(`src/design-system/` 內部 spec / cva / SSOT / layout primitives)。Consumer 層 UI(`src/app/` / `src/explorations/`)走 `/product-ui-audit`。兩 scope 正交。

對齊 CLAUDE.md `# 稽核 canonical` 6 維,本 skill 是 **D1 設計語言 + D2 程式語言** home;D3-D6 chain:

| 維 | Skill |
|---|---|
| D1 / D2 | 本 skill Audits 1-33 |
| D3 效能 | `/performance-audit` |
| D4 UX | `/ux-audit` |
| D5 視覺 | `/visual-audit`(Layer A mechanical + B AI) |
| D6 原則自檢 | Phase 4 報告「提議討論」區 |

**進階 `--deep`**:Phase 3.5 chain D3-D5 完整 6 維 sweep。

## When to run / preconditions

- User 說 audit / 檢查 / verify / world-class / release / token 大改
- Working dir = project root,branch clean(或 user 同意 review)
- `CLAUDE.md` 必先 fully read(規則隨時間變,不憑記憶)

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
| 33 | **Component classification + abstraction discipline**(對齊 M21 + M22 + M23)| Per-component verify 5 子維:(a) **Internal vs Components 一致性**;(b) **Premature abstraction** rationale + cite;(c) **Sub-component 5-file 結構過度**;(d) **Benchmark claim 缺 source**(M22);(e) **DS internal canonical 優先**(M23)— spec / tsx 含 world-class DS keyword 但 visual decision(color / size / spacing / typography / state)未先 grep DS 既有 token / variant / pattern 命中 → flag。Sub-agent 對每 benchmark cite 反查:該屬性在 `tokens/` / 近親 spec 已有 codified canonical 嗎?有 → 該 cite 應為**輔證**(內部 canonical 主)而非**主導**(外部覆蓋內部)。違反 = M23 自開新 tier(2026-05-03 chevron 事件:Ant 5 家 muted 覆蓋 DS icon-only Button neutral-9 預設)|

---

## Workflow

### Phase 0 — Setup + Build Baseline

1. Read `CLAUDE.md` fully + `git status --short`
2. **Build baseline(任一 fail STOP → Checkpoint 5)**:
   - `npx tsc -b` — 0 errors
   - `npx vite build` — `✓ built in`
   - `npm run build-storybook` — clean
3. **Mechanical content-quality baseline**:
   - `node scripts/audit-content-quality.mjs --check` — `✅ No content drift`(16 cat)
   - `node scripts/extract-canonical-rules.mjs` — `✅ All extracted rule keywords covered`
   - violation → 列 P0
4. Build fail → 不跑 33 dims;報 user 決定先修 OR 繼續(broken code audit 多 dim 跑不動)
5. TaskList entries 建好

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

### ⚠️ Checkpoints — STOP-and-ASK 場景(detail in [references/checkpoints.md](references/checkpoints.md))

| # | When | Action |
|---|------|--------|
| 1 | Triage 完(P0+P1 auto / P2 decision)| present + 等 user approve P2 scope |
| 2 | Audit surfaces pattern 未在 CLAUDE.md | propose 新 rule draft + 等 approve |
| 3 | Classification ambiguous(Internal/Components / SSOT home / primitive vs semantic)| present options + rationale |
| 4 | Cross-cutting refactor > 10 檔 | execution strategy options(1 commit / N / defer) |
| 5 | 環境 / 建置 issue | 報 user,不在 audit scope 修 env |
| 6 | spec 與 code 衝突 | 不 silent pick,present options + git log context |
| 7 | 「先不管」vs「之後再處理」semantic | **「先不管」= 完全忽略**(不入 tech debt);**「之後再處理」= park to memory**;絕不混淆 |

**Naming proposal**:Checkpoint 2 前必過 CLAUDE.md `## 命名必過三重 test`(SSOT in CLAUDE.md,不 re-spec)。

### Phase 3 — Apply fixes (grouped commits)

每 fix group:Edit(非 Write)→ `npx tsc --noEmit` pass → commit 描述性 message。Typical groups:cva drift / Spec Rule A / a11y / Anatomy / CLAUDE.md contradiction。

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

### Phase 4 — Final report + memory + Self-improvement(強制)

Update `memory/project_audit_progress.md`(date / coverage / findings / deferred P2)+ short report(commits / deferred / next trigger)。

**Self-improvement capture(強制)**:每 audit 寫 3 行(無發現也寫「無」,不省略):
- 新 FP pattern + 回填位置(`principle-audit-protocol.md`「常見 FP 記憶」)OR「無」
- 新 meta-pattern + STOP 提議(動 canonical substantive)OR「無」
- 修完矛盾 / user 糾正 + 回填 home(memory / CLAUDE.md / spec)OR「無」

---

## Non-goals + common failure modes

**Non-goals**:不 rewrite spec/story / 不修 env / 不加 feature / 不 skip checkpoint / 不 collapse output(user 要 file:line)。

**Common FP**:Agent hallucinate fix → cross-check file:line;Rule B 多 scope-N/A → 套 CLAUDE.md 預設不 stub;cva FP → 只在 spec/anatomy 與 code 矛盾才報;Story aria-label/cva → 排除;a11y over-flag → Radix 已處理,wrapper 不重複;Skip Checkpoint 1 → mechanical change scope 不清。

## References

- [references/audit-prompts.md](references/audit-prompts.md) — Exact subagent prompts for all 27 audits
- [references/historical-bugs.md](references/historical-bugs.md) — Bug classes indexed by audit
- [references/checkpoints.md](references/checkpoints.md) — Detailed examples of each MUST-ASK scenario
