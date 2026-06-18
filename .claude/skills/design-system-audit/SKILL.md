---
name: design-system-audit
description: Systematic audit of this design system for world-class quality. Runs the full audit dimension list(per `## The N audit dimensions` section) covering spec hygiene / code correctness / a11y / naming / tokens / patterns / CLAUDE.md consistency / Layout Family compliance / prop value collisions / shadcn alias leakage / home-name-vs-scope fit / spec hardcoded-values, and surfaces actionable fix lists. Has explicit checkpoints where the skill MUST stop and ask user. Invoke via /design-system-audit when asked to audit, re-audit, check quality, or verify design system health.
---

# Design System Audit (Groups A–Q + Future-proof preflight; dim count canonical per `check_dim_count_drift.sh` / `dispatch-audit-dims.mjs` SSOT — 禁 hardcode)

> **Budget note**:本檔 = 88-dim **registry SSOT**(foundational;dispatch-audit-dims.mjs / deep-audit / check_dim_count_drift 全 parse 此檔),per CLAUDE.md `# 治理 canonical`「foundational SSOT 例外 ≤ 800-1200」,**不受 250 SKILL cap**(dim table 本質就是 registry,拆出會 break dispatch parser SSOT)。

Purpose: catch every bug class this project has shipped historically PLUS structural gaps relative to Polaris / Material / Atlassian / Ant / Carbon / Apple HIG. Each audit has a clear rubric tied to CLAUDE.md rules. The skill reports findings and **explicitly stops at checkpoints** for user decisions before large-scope fixes.

## Skill 生態位 + 6 維對齊

本 skill audit **DS 本身**(`packages/design-system/src/` 內部 spec / cva / SSOT / layout primitives)。Consumer 層 UI(`src/app/` / `src/explorations/`)走 `/product-ui-audit`。兩 scope 正交。

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

## The audit dimensions(Group A–P,full list per below;count canonical 不 hardcode per `check_dim_count_drift.sh`)

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
| 11 | **Story 層 coverage — category-aware**(2026-06-05 RFC P2:改讀 `packages/design-system/src/story-governance/category-matrix.json` 的 `requiredStories`,不再寫死「Components 三層 / patterns 必有 render demo」)| 每 unit 先 `resolveCategory()`,再按 category 要求對應的 story 層:**Component → 三層**(展示/設計規格/設計原則);**Pattern(guidance)→ guidance / composed-example**(blueprint;**不**強迫單一 primitive 的 render demo —— pattern 是「如何組合多元件」的指南、不是元件,修正前一版把 pattern 當可 render 件的錯);**Internal → reference**(≥1 Default/reference story,放寬,不要求三層);**Token → swatch**;**Template → app-scenario**。SSOT = category-matrix.json(改規矩改該檔)。搭配 classification-invariant(放對地方)+ category-templates.md v2(Component 的 trait-based shape)。錨例:2026-06-05 user 抓 dim-11 強迫 pattern 有 render demo = 把指南當元件,與世界級(Polaris/Atlassian/Carbon「pattern=組合指南」)相反|
| 12 | **Story 人話範例** | Placeholder / abstract codes / extreme scenarios / variant names as labels |
| 13 | **Anatomy Figma-inspect 完整度** | 5 mandatory sections present / token-first / dev language / no density dual / live swatches |

### Group E — System-level consistency (P1 priority)

| # | Audit | What it catches |
|---|-------|-----------------|
| 14 | **命名一致性** | PascalCase folder / kebab-case file / hook naming / spec chapter 中文 / identifier 英文 / single-file 語言統一 |
| 15 | **Cross-doc 一致性** | CLAUDE.md 自身 + cross-spec full dup(Rule-of-3)+ tsx docblock-spec drift + stale upgrade markers + **(2026-06-04 加)docblock-vs-同檔-code + spec 段內描述性一致(Mode 表 / typography / padding / gap cross-section)**。詳 `audit-prompts.md` Dim 15。**Enforcement 升級**:本 dim 易被「散文 skim」淺跑漏(2026-06-04 anchor:tsx docblock `閱讀模式`/`hover-bg` 自 2026-04-23 stale 多次沒抓)→ 改由 `/deep-audit-cross-codex` A.1b **強制 adversarial per-component**(Validator F 覆蓋率閘),不再可 skim |

### Group F — Architecture compliance (P1 priority, session-learned)

| # | Audit | What it catches |
|---|-------|-----------------|
| 16 | **Layout Family 宣告** | 每個 component spec 第一段必須宣告「Layout Family: 1/2/3/4」或明示「非 family（self-contained / composite）」; 缺漏代表元件遊離於系統 |
| 17 | **Prop value 跨元件認知衝突** | 同字 literal 在不同元件作 prop value 但語義衝突(`text` 是 Button `variant="text"` 文字樣式,若 FileItem `mode="text"` 變成「文字為主呈現」= 雙語義,consumer 混淆)——命名三 test 第 3 條強制檢查 |
| 18 | **shadcn compat alias 回流檢查** | grep `bg-popover / text-popover-foreground / text-muted-foreground / bg-accent / text-accent-foreground / bg-destructive / bg-background` 等在我們的元件 code——這些是 shadcn copy-paste 安全網,我們元件應用 direct token。每次 audit 重新 grep 防 `npx shadcn add X` 新生成的 code 留下 alias。完整 deny-list SSOT:`tokens/utility-registry.json`(新增 alias 改 registry;此 grep pattern + product-ui Dim 1 對齊同 SSOT)|

### Group G — Home governance + spec hygiene (P1 priority)

| # | Audit | What it catches |
|---|-------|-----------------|
| 19 | **Home-name-vs-scope 一致性** | classification folder 名稱若與實際 scope 偏離(item-layout 裝 4-family taxonomy → rename item-anatomy 的學到的教訓);charter README 說的「這裡收 X」與實際內容是否一致 |
| 20 | **Spec 硬寫機械化值檢查** | spec.md 不該有 `5.5px` / 完整 Tailwind class lists / cva object literals — 這些屬 tsx;spec 只記錄「為什麼」的判斷性描述 |

### Group H — Consumer-layer consistency (P0 / P1,2026-04-22 新增)

| # | Audit | What it catches |
|---|-------|-----------------|
| 21 | **連續 item list wrapper gap**(consumer 層 Consistency)| consumer stories / app code 的 `.map()` list wrapper gap 是否對齊 item 元件的「List wrapper canonical」:standalone card/pill → 必 gap;flush/transparent → 0 gap OK;mixed 視覺語言 → 必取保守 gap。hook `check_item_list_gap.sh` 是預警層,本 dim 補 audit 層 |
| 22 | **視覺容器 inner breathing**(consumer 層 Absolute)| consumer 自建的視覺邊界容器(permanent bg / border / shadow 三擇一)是否有 inner padding。hook `check_container_breathing.sh`(retired;audit-only via dim 22)— 本 dim batch sweep 即檢查,補 multi-line className / 非 div 容器的 case |

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
| 27 | **Clean code 量化**(auto-chain `/code-quality-audit`)| `any` 使用(無 `// any-allow` escape) / dead export / tsx file-size budget 500(cap 800) / long function > 80 行 / circular dep / magic number(與 token 防線 `lib/_token_hygiene.sh` + `check_opacity_token_usage.sh` 正交)。進階模式 `--deep` 必 chain `node scripts/code-quality-audit.mjs --scope=all`;其他模式 scope=changed |

### Group L — Story splitting principle(2026-04-26 新增)

| # | Audit | What it catches |
|---|-------|-----------------|
| 28 | **Manual story 拆分原則 alignment**(對齊 Polaris / Carbon / Storybook 官方)| Per-component grep `*.stories.tsx`(non-anatomy/principles)反 pattern:(1) `WithStartIcon`+`WithEndIcon` 拆兩 story(同 slot rule 違規,該 `WithIcon` 對照 grid)(2) `Default`+`AllVariants` 同檔(冗餘)(3) ≥2 個 variant 拆細(`Primary`+`Secondary`+`Tertiary` 各自 — 該合 `AllVariants`)。`// @story-split-rationale: <reason>` 檔首 allowlist 例外。Hook check_story_slot_split(planned) write-time block 同源,本 dim 對既有元件 batch verify。對應 `.claude/rules/story-rules.md`「拆分原則」+ `/story-writing` skill Phase 0 |
| 29 | **Trait-based展示 stories compliance**(對齊 M19 ensure-canonical pipeline + Polaris/Material/Carbon/Ant/Storybook)| Per-component verify(a)spec.md frontmatter 有 `traits:` 宣告(b)展示 stories.tsx 包含每 trait 的 required core stories(c)scope-N/A 的 trait 在 spec.md 邊界案例段有 rationale。違反列 P0 修。對應 `category-templates.md` v2 + hook `check_story_invariants.sh R3`(原 lib/`check_story_category.sh` folded 進 R3)。Hook 是 write-time block,本 dim 對既有 47 元件 batch verify + 找未宣告 traits 的元件(P2 migration pending) |
| 30 | **Principles canonical compliance**(對齊 Polaris / Material / Ant 共識,2026-06-11 wording 對齊 category-templates v3 整合式)| Per-component verify principles.stories.tsx:(a)≥ 2 story exports 且含 decision core — v3 預設 `UsageGuidance` 整合式單 story(何時用 + 何時不用 + sibling 比較)+ ≥ 1 互補 story(`Vs{Sibling}Rule` / `ContentGuidelines` / component-specific `{Topic}Rule` / 描述性名稱皆 valid);legacy aliases(`WhenToUse` / `WhenNotToUse` / `Vs*Rule`)接受不強制 rename(b)無 deprecated 命名(`Forbidden*` / `Donts` / `Pitfalls` / `Prohibitions` / `NonGoals` / `VisualDonts` 全 deprecated → `WhenNotToUse`)。SSOT = `category-templates.md`「Universal core(v3 整合)」+「Canonical naming」節;機械 = hook `check_canonical_propagation.sh` E.1(原 `check_principles_canonical.sh` folded)write-time block + `scripts/audit-content-quality.mjs` Check 5e。本 dim 對既有元件 batch verify |

### Group M — Overlay body API discipline(2026-05-01 新增)

| # | Audit | What it catches |
|---|-------|-----------------|
| 31 | **Overlay body 無 stripped-padding boolean variant**(對齊 Material/Atlassian/Mantine/shadcn 主流;Polaris flush API 例外但 scope 極窄)| Per-overlay grep `components/(Dialog\|Sheet\|Popover)/*.tsx`(非 stories)反 pattern:`(flush\|naked\|bare\|stripped\|unpadded\|noPadding\|paddingless)\?:\s*boolean` 在 body component。違反 = list-as-region 場景該由 consumer 用 className override(`!px-0 !pt-0 !pb-0`)+ 自管 list outer wrapper 處理,不該加 body variant。Rationale:variant 不解決底層脆弱(加 1 row search/banner 就破功)+ 把 1 surface decision 拆兩 API。對應 hook `check_overlay_handcraft.sh` Check 6 + `overlay-surface.spec.md`「List-as-region in overlay body」+ memory `feedback_layout_v6_canonical.md`。Hook 是 write-time block,本 dim 對既有 overlay 元件 + 未來新增 overlay primitive(Drawer / FileViewer body 等)batch verify。`// overlay-body-stripped-variant-allow:` 檔頭 allowlist 例外(必含 ≥3 家世界級對照 + multi-row hold 保證)|
| 32 | **Filter operator registry SSOT consumption**(對齊 ClickUp/Airtable/Notion API + M17)| Per-consumer grep:反 pattern(a)hardcode op 字串 array 不 import `OPERATOR_REGISTRY`;(b)inline switch on op derive ValueShape(該走 `getValueShape`)。SSOT:`DataTable/filter-operators.ts`。`// filter-op-inline-allow:` 檔頭 escape |
| 33 | **Component classification + abstraction discipline**(對齊 M21 + M22 + M23)| Per-component verify 5 子維:(a) **Internal vs Components 一致性**;(b) **Premature abstraction** rationale + cite;(c) **Sub-component 5-file 結構過度**;(d) **Benchmark claim 缺 source**(M22);(e) **DS internal canonical 優先**(M23)— spec / tsx 含 world-class DS keyword 但 visual decision(color / size / spacing / typography / state)未先 grep DS 既有 token / variant / pattern 命中 → flag。Sub-agent 對每 benchmark cite 反查:該屬性在 `tokens/` / 近親 spec 已有 codified canonical 嗎?有 → 該 cite 應為**輔證**(內部 canonical 主)而非**主導**(外部覆蓋內部)。違反 = M23 自開新 tier(2026-05-03 chevron 事件:Ant 5 家 muted 覆蓋 DS icon-only Button neutral-9 預設)|

### Group N — State precedence + chain invariants(2026-05-04 新增,M24/M25 codify)

| # | Audit | What it catches |
|---|-------|-----------------|
| 34 | **Disabled state 顯著性 precedence**(M24)| Field family disabled mode → 內 placeholder/value/icon 全切 `text-fg-disabled`(非 muted)。Hook `check_field_family_invariants.sh` A.4(disabled placeholder color,原 check_disabled_placeholder_color folded;P1 stderr)同源,本 dim DS-wide batch verify |
| 35 | **Layered chain invariant — overlay scroll**(M25)| Overlay primitive → SurfaceBody 中間 wrapper 必 `flex flex-col h-full`,斷一層 = body 不 scroll。Hook `check_pattern_invariants.sh` C.1(overlay scroll chain,原 check_overlay_panel_scroll_chain folded;P1 WARN)同源,本 dim DS-wide batch verify |
| 36 | **Naked variant cell-as-input row-mode propagation**(M19)| `variant="naked"` consumer 內 wrapper 必 import + apply `nakedCellRowModeAlign` SSOT。Hook check_naked_row_mode_propagation(planned) |
| 37 | **Field state machine 「focus dominates everything」**(M19 v13.3)| 禁 per-control `(open\|isOpen) && 'border-primary'`(Field default 處理)+ naked variant 禁平行 outline ring。SSOT `field-wrapper.tsx` 三 compoundVariant。對齊 Material 3 / Polaris / Ant 共識。Hook check_field_state_token_consume(planned) |
| 38 | **Inline-action gap canonical**(2026-05-05)| `<ItemInlineAction>` sibling gap = `gap-2` (8px) per `inline-action.spec.md:80`。Hook check_inline_action_canonical_gap(planned) |
| 39 | **Row-layout slot primitive consumption**(M1+M17)| 禁自刻 `<span h-[1lh] shrink-0 flex items-center>` slot wrapper(item-anatomy / field-wrapper 外),必消費 `<ItemPrefix>` / `<ItemSuffix>`。Hook check_row_slot_handcraft(planned) |

### Group O — Storybook content quality(2026-05-15 user-mandated,gap 補)

User 2026-05-15 verbatim 抓「DS 深度稽核漏 storybook content quality」+「title 是否夠有 title 的感覺」+「應該要全盤檢查並避免下次深層稽核又漏東漏西」。對應 `.claude/planning/storybook-governance-gap-2026-05-15.md` 完整 enumeration。

| # | Audit | What it catches |
|---|-------|-----------------|
| 40 | **Title 命名 quality**(story-rules.md L18-22)| **MUST chain `node scripts/audit-story-quality.mjs --check`**(2026-05-23 anti-sample mechanism);per-story regex `Design System/{Tokens\|Patterns\|Components\|Internal}/{PascalCase Name}/{中文 subpage}` 結構。**禁** sub-agent self-judgment 替代 script |
| 41 | **Story name jargon**(story-rules.md「禁 spec 內部代號」)| **MUST chain `node scripts/audit-story-quality.mjs --check`**(2026-05-23 anti-sample);grep `L1-L9 \| canonical \| spec X \| Stream Y \| W1-W6 \| Phase N \| Dim N \| M-rule` jargon。Hook `check_story_invariants.sh R5` write-time。**禁** sub-agent 抽樣 |
| 42 | **範例佔位符 / 抽象代號**(story-rules.md「禁佔位符」)| **MUST chain `node scripts/audit-story-quality.mjs --check`**(2026-05-23 anti-sample);Lorem ipsum / Option A/B/C / Foo/Bar/Baz / 按鈕一 / Hello World / Test 1。對齊 Polaris / Carbon「Jira / Stripe / Notion 真情境」。**禁** sub-agent 抽樣 |
| 43 | **Rule note 品質**(原則>結論 / 無中英夾雜)| AI judgement sample-based:讀 `.principles.stories.tsx` Rule notes,判 (a) 是否「告訴讀者原則為何」而非「只說結論」;(b) 是否無中英夾雜(技術術語例外)。對齊 `references/example-selection.md`「Rule note 品質」 |
| 44 | **Public vs Internal classification**(2026-05-23 user 拍板;**2026-06-06 refine intent-based**,SSOT in `.claude/rules/ui-development.md`「Public component vs Internal primitive canonical」段)| **判準 = intent-based**(非機械空-render):問「DS 是否想讓 consumer 直接 import 用它(看 benchmark / 何時用 / export 給 consumer)?」YES(**即使需 compose/wire**)= public;只被 DS 內部元件用、consumer 用 wrapper 不碰它 = internal。**禁用舊「空 `<X/>` render 測試」**(誤判 composition primitive,如 FieldControlGroup 空=透明 div、ResizeHandle 需接線 → 實為 public,benchmark Bootstrap input-group / VS Code resize)。「現在 DS 自家沒用到」≠ internal。Public 住 `components/<Name>/` OR `patterns/<name>/`(無 `internal: true` frontmatter),storybook `Design System/Components OR Patterns/<Name>`。Internal 住 `components/Internal/<Name>/` OR `patterns/<name>/`(`internal: true` frontmatter),storybook `Design System/Internal/...`,export 加 `@internal` jsDoc。**Exception:compound-component public API**(`Dialog.Root/Trigger/Content` / `Field + FieldLabel + FieldError + FieldDescription` 等 documented composition pattern)豁免 — 對齊 Radix Dialog / MUI FormControl + Mantine Input.Wrapper compound idiom。對標世界級:Polaris Building blocks vs layout primitives / Material `@mui/material` vs `@mui/utils` / Atlassian `@atlaskit` vs internal `<unstyled>` / Carbon turnkey vs utilities / Apple HIG presented controls vs implementation primitives |
| 45 | **Mechanical output structural validation**(2026-05-15 user-mandated)| 對每元件跑 `compile-stories.mjs <Name>` 取 generated rows;grep 確認(a) `AllSizes` 含所有 cva sizes (b) `AllVariants` / `ColorMatrix` 含所有 cva variants (c) `Accessibility` story 含 ARIA hint / keyboard map (d) `See also` cross-link 反指 spec.md 既有 link section。不只 drift,**output structure 對 spec/cva 完整覆蓋**。對應 SSOT:`scripts/compile-stories.mjs` 邏輯 + `references/anatomy-standard.md`。Future:加 `compile-stories.mjs --validate` mode 把 grep 移進腳本 |
| 46 | **Manual vs Mechanical boundary**(2026-05-15 user-mandated)| Per-元件 grep `.stories.tsx`(非 anatomy/principles),若含 trait-derived `AllSizes` / `AllVariants` / `WithIcon` hand-written export 而非 import auto-compile 結果 = anti-pattern(該 migrate 進 auto-compile)。對應 SSOT:`category-templates.md` v2 trait-based。例外 allowlist:檔頭 `// @story-trait-rationale: <reason>`(= `check_story_invariants.sh` R3 機械 escape;舊名 `@manual-trait-allow` 無實作、全 repo 0 usage,已廢)|

### Group P — World-class tier(2026-05-17 加,codex 共識)

| # | Audit | What it catches |
|---|-------|-----------------|
| 47 | **Tailwind utility registry compliance**(對齊 Atlassian `@atlaskit/tokens` / Carbon / Ant / Polaris token-first)| `check_opacity_token_usage.sh`(讀 `packages/design-system/src/tokens/utility-registry.json` SSOT;原計畫 rename → `check_tailwind_token_registry.sh` 未實作,功能已在 check_opacity_token_usage.sh)。檢 `leading-N` / `tracking-*` / `gap-px|0.5|1.5` / `w-fraction` / `text-(xs|sm|base|lg|xl|...)` / `font-(thin|light|semibold|black)` / `rounded-(xl|2xl|3xl)` 等繞 SSOT utility |
| 48 | **Unused / orphan token detector**(2026-05-21 升級:跑 `scripts/audit-orphan-tokens.mjs --check` SSOT,不用 raw grep `var()` — 漏 Tailwind `@theme inline` bridge + `@utility` body + class-name match + JS literal mirror,N 條合法消費路徑 false-positive)。Script 內建 structural-keep 分類器(palette tier 1-10 / mask alpha / chart reserved / state variants / neutral / SOP 5-piece / JS literal mirror)per `tokens/orphan-tokens.spec.md` SSOT。真 retire 候選 = comprehensive scan 後仍 0 consumer + 不落任何 structural-keep 類別。0 真孤兒 = PASS;有真孤兒 → user 拍板 retire OR 補 structural-keep 新類別 |
| 49 | **a11y axe-core 自動跑 + contrast ratio**(Storybook a11y addon + Carbon AVT + Atlassian linters)| Per `*.stories.tsx` 跑 axe-core via Storybook a11y addon;WCAG AA contrast ≥ 4.5:1(text)/ 3:1(large text / UI)。Carbon 每 PR 跑 AVT,Atlassian 季度 audit + linter integration。本 dim 缺 = a11y 漏在 spec.md 寫了但無自動驗 |
| 50 | **Bundle size budget per component**(Material UI size-limit / Material Web public tracking / Ant tree-shake)| Per component gzip size 上限(eg. Button ≤ 5KB / DataTable ≤ 50KB);CI fail if regress > 10%。對齊 size-limit pkg + Carbon export audit。需建 `package.json` `size-limit` 段 + per-component manifest |
| 51 | **Theme / density visual matrix**(Material 3 dynamic color / Apple HIG Dynamic Type)| Deep mode 每 core story 跑 light/dark/high-contrast/density-md/density-lg/RTL 6-cell matrix screenshot diff;baseline drift > Δ% → flag。對齊 Polaris visual regression / Carbon dark token matrix |
| 52 | **Header canonical cross-family invariants**(W1-W6,2026-05-17 ship per M31 codex 共識,對齊 GitHub Primer + Ant + Material v1)| Per chrome / overlay header tsx 跑:(W1) 含 Tabs child 必有 `withTabs` prop(border auto-suppress) (W2) tabs padding = header padding(`--layout-space-loose`) (W3) `--tab-height-lg` == `--chrome-header-height`(md/lg 對等) (W4) header + tabs flush stack 無 negative margin (W5) tabs default = sm 已 land + md 標 future tier (W6) cva default 已從 md 改 sm。Hook 3:`check_tab_lg_chrome_header_equal.sh`(W3) / `check_header_with_tabs_border.sh`(W1) / `check_chrome_header_handcraft.sh`(Layer 3 ChromeHeader consumption) |
| 53 | **Code-to-spec reverse drift check**(2026-05-17 user 抓 Phase 1 漏抓 FileViewer h-14 spec drift,新加 dim)| 對每 component grep `packages/design-system/src/components/<X>/<X>.tsx` 的 className 硬寫 utility(`h-14` / `w-80` / `px-loose` 類)→ 反向掃對應 `<X>.spec.md` 是否仍寫「固定 h-NN」「寫死」keyword 但 code 已 migrate to token = drift。互補既有 forward Dim 15/20(spec → code)。Hook `check_spec_class_drift.sh` write-time soft P1 warn,本 dim batch verify 既有 60+ 元件 spec.md。錨例:2026-05-17 Phase 1 我 file-viewer.spec.md L103 寫「Known drift:h-14 硬寫不消費 token」但 file-viewer.tsx:333 已 `h-[var(--chrome-header-height)]`,3+ 次 `/design-system-audit --deep` 都沒抓到反向 drift |
| 54 | **M35 Nearest same-purpose canonical compliance**(2026-05-20 codify per codex Layer B D4)| 對每 `*.stories.tsx` wrap 既有 primitive(Sidebar / DataTable / ChromeHeader / Dialog / Sheet / Popover)的 file 跑:(a) 檔頭含 `@story-baseline:` cite marker?(b) `.claude/references/story-baseline-registry.json` 內 primitive 的 `requiredHelpers` 全 import?(c) `antiPatterns` regex 任一 match → fail?(d) `variantRules` button variant + size + iconOnly + pressed 全 satisfy?Hook `check_story_invariants.sh R8` write-time soft warn,本 dim batch verify。錨例:2026-05-20 AppShell stories 連 5 round drift 後 codex Layer B 抓 root cause = SSOT 消費被當引用儀式 |
| 55 | **Token cross-namespace mapping integrity**(2026-05-20 codify per user 抓 red→deep-orange bug 100+ audit 沒發現)| `tokens/color/semantic.css` 每 hue interaction token(`--blue-hover` / `--red-hover` / ...)必指向**同名**primitive(`--red-hover: var(--color-red-N)`),**禁**跨 hue 混(`--red-hover: var(--color-deep-orange-N)` 違反)。Primitive 12 hue 全該有對應 interaction(blue/red/deep-orange/orange/amber/yellow/lime/green/turquoise/indigo/purple/magenta)。Status semantic(`--error-hover` 等)直指 primitive,**不**透過 hue layer。錨例:2026-05-20 semantic.css:246 `--red-hover: var(--color-deep-orange-5)` cross-namespace bug,100+ audit 沒發現 = audit 沒檢 token mapping integrity |
| 56 | **AppShell primary-header consistency**(2026-05-21 codify;2026-06-18 beta.74 擴 V3 + responsive 豁免)| 對每 consumer `.tsx`(stories / app code)grep `layout="primary-header"`(三種 JSX 引號形式 `layout="x"` / `{"x"}` / `{'x'}` 皆偵測,grep -E 字面引號),verify 3 條:(V1) 同 file 含 `globalHeader=` prop(否則邏輯矛盾)/(V2) 不含裸 `<SidebarHeader>`(WorkspaceBrand 該在 globalHeader,不重複;**例外**:同 file 用 `useSidebar`/`isMobile` = mobile-only Sheet 補品牌的 responsive fork → 豁免)/(V3) 不含 `<SidebarFooter>`(帳號入口家在 globalHeader 右、收成 Sheet 鏡像到 Sheet header 右,**不該**用 sidebar footer〔那是 primary-sidebar 慣例〕;**無** isMobile 豁免)。trigger 用 tag-boundary `([^A-Za-z]|$)` 避 prefix-extended 名誤觸。World-class cite:GitHub repo sidebar 無 header + Gmail / Figma brand 在 global top bar + Material modal nav drawer「account switcher 放 drawer header」。Hook `check_app_shell_primary_header_consistency.sh`(V1-V3)write-time exit 2 BLOCKER(via chrome_header_dispatcher,可 escape `// @app-shell-primary-header-allow:`)。對應 `app-shell.spec.md`「WorkspaceBrand 放置 SSOT」+「帳號入口(Account entry)放置 SSOT」段(均含 Responsive 精修子句)|
| 57 | **M29 DS Anchor Preflight enforcement coverage**(2026-05-26 codify per user verbatim「該程式化的都沒程式化」)| 對每 `*.tsx`(production code,非 stories / test)grep wrap DS primitive(`<Sidebar>` / `<AppShell>` / `<DataTable>` 等)→ verify 過去 30 turns transcript 含 `Grep`/`Read` tool call hit `packages/design-system/src/**/*.spec.md` 或 `*.stories.tsx`,OR 檔頭含 `@story-baseline:` marker 或 inline 3-column owner table。Hook `check_ds_anchor_preflight.sh` write-time soft BLOCKER。對應 meta-patterns.md M29 + self-verify.md Pre-edit phase。錨例:2026-05-26 App.tsx 漏 SidebarTrigger / collapsible / startIcon mock-drift = M29 hook 不存在使 infra 沒攔 |
| 58 | **Fork-user plugin install enforcement**(2026-05-26 codify per user「我們做那麼多 plugin 不就是要避免這件事?」)| SessionStart hook `check_plugin_fork_health.sh(r1,2026-06-11 merge)` 偵測:(a) cwd 不是 DS repo(無 `packages/design-system/src`)/(b) `package.json` 含 `@qijenchen/design-system` dep /(c) `~/.claude/plugins/design-system/` OR `.claude/plugins/design-system/` 不存在 → 三題 YES 印強制提示。互補 product-workspace `scripts/check-plugin-installed.mjs` npm postinstall layer。**+ 2026-05-30 fork-committed bootstrap 層(補 chicken-egg:plugin 硬 hook 隨 plugin 才裝,沒裝前無 mechanical 防線)**:fork 自帶 `template/ds-product-template/.claude/hooks/check_plugin_bootstrap.sh`(SessionStart 每 session 提醒,fail-open)+ `block_production_edit_without_plugin.sh`(PreToolUse 硬攔 `apps/**` production .tsx/.ts/.css edit,沒裝 plugin → exit 2 BLOCK,escape `CLAUDE_BYPASS_PLUGIN_BOOTSTRAP=1`)+ `.claude/settings.json` hooks 註冊;**不依賴 plugin**(committed in fork),mirror allowlist `.claude` ship 給 published fork。對應 product-workspace/CLAUDE.md「第 −1 步」段 |
| 59 | **Approval preflight scope coverage**(2026-05-26 extend per user「未來其他人 fork 用其他元件也偏移」)| `check_substantive_edit_approval_preflight.sh` scope 從 `packages/design-system/src/**` 擴大到 `apps/**.{tsx,ts,css}` + `node_modules/@qijenchen/design-system/**`。Audit verify hook regex 涵蓋三 scope + allowlist `*.stories.tsx`/`*.test.*`/`scripts/*`。對應 memory/feedback_ship_then_revert_anti_pattern.md SSOT |
| 60 | **M26 propose-without-benchmark enforcement**(2026-05-26 backfill)| UserPromptSubmit hook `check_propose_without_benchmark.sh` 偵測 user prompt 含 propose / 建議 / 方案 / 看法 / visual / behavior keyword + 過去 20 turns transcript 中 `WebFetch`/`WebSearch` tool_use count < 2 → soft inject 提醒「propose 前必跑 ≥3 source benchmark」。對應 meta-patterns.md M26 + propose-options/SKILL.md。錨例:2026-05-05 user 反覆糾「為什麼每次都沒 webfetch 只憑印象」 |
| 61 | **M16 item-list gap + M23(c) DataTable framework prop conflict enforcement**(2026-05-26 backfill)| PreToolUse hooks 兩 invariant:(a) `check_item_list_gap.sh` — 2+ `<FileItem>` / `<MenuItem variant="rich">` 在同 NEW content 且無 `gap-N` / `space-y-N` parent → warn(M16);(b) `check_datatable_invariants.sh(r2 folded,2026-06-11)` — `ColumnDef` 上下文出現 `size: <number>` 但無 `meta: { width: ... }` → warn TanStack `size:px` vs DS `size:density` 框架 prop 衝突(M23(c))。對應 meta-patterns.md M16 + M23(c) + item-anatomy.spec.md + data-table.spec.md |
| 62 | **Fork-user Netlify onboarding canonical**(2026-05-26 codify;2026-06-05 二修 → 免費密碼 = Edge Function Basic Auth,SSOT `memory/feedback_netlify_basic_password_canonical_2026_05_29.md` Rule 1)| Audit product-workspace + fork repos:(a) `netlify.toml` 含 access control:X-Robots-Tag noindex header **+ `[[edge_functions]]` path="/*" function="basic-auth" wire** + comment 指向 edge function 免費機制(**不**寫「Basic Password 免費 / `_headers` 免費」= drift); (b) `netlify/edge-functions/basic-auth.ts` 存在且讀 `STORYBOOK_BASIC_AUTH` env var 做 HTTP Basic Auth(讀 Authorization → 比對 → 缺/錯回 401 + WWW-Authenticate);`.storybook/manager-head.html` **不** 含 Netlify Identity widget script(我們用 edge-function Basic Auth,client-side Identity widget 不需要;若仍含 widget = 殘留 drift); (c) `scripts/setup-netlify-access.mjs` 含「沒 Netlify 帳號」前置 explainer + gh auth pre-check + 最後印 dashboard URL 教 user 在 Environment variables 設 `STORYBOOK_BASIC_AUTH` = `user:password`(**不**教「點 Basic Password radio」= 舊 flow drift); (d) `package.json` 有 `setup:netlify` npm script; (e) **CLAUDE.md `Access control` 段含「Claude 引導使用者 Netlify onboarding」≥6 條話術**(解釋 Netlify / GitHub 1-click OAuth / **免費 = edge-function Basic Auth 設 env var 30 秒** / SEO header 已 ship / deploy 驗證 / GitHub CLI 未 login / Codespaces cloud-dev path)+ 真實斷點清單(plugin install + OAuth + env var 設 + password 分享 4 斷點)+ **禁寫「`_headers`/Dashboard Basic Password 免費」「Identity 已 deprecated」(皆 2026-06-05 官方 docs 證實為錯)段**。錨例:2026-05-26 user「Claude 會知道引導 user 完成環境建置嗎?」+ 2026-06-05 user「仔細查查研究」抓出免費密碼 = Edge Function(Dashboard + `_headers` 都 Pro $20/mo;Identity 2026-02 撤回 deprecate 但是 full-login 不適合 simple gate)|
| 63 | **Deploy URL auto-reply infra**(2026-05-26 codify per user verbatim「完成部署之後都應該自動回吐部署的連結,每次必定自動回,不論是現在這個 session 還是其他的」)| Audit product-workspace + fork repos:(a) `scripts/deploy-url.mjs` 存在 + executable + 輸出 production 或 preview URL JSON;(b) `package.json` 有 `deploy-url` script wired;(c) DS-side hook `.claude/hooks/inject_deploy_url_after_push.sh` 偵測 `git push origin <branch>` PostToolUse Bash → auto inject deploy URL into AI context;(d) hook scope skip `push --delete`(branch cleanup 非 deploy);(e) hook silent skip if no `.netlify/state.json` 或 `scripts/deploy-url.mjs`(DS repo 自身 + 非 Netlify-wired repos 不誤觸發)。Cross-session benefit:hook ship via plugin → 任何 fork user `/plugin install` 後自動受惠 |
| 64 | **Post-main-push SSOT propagation canonical**(2026-05-26 user correction「不是只要一 knowledge audit deep 之後就要,是等我 push main 後才要」)| Audit:(a) CLAUDE.md `# Git solo-work canonical` 有 Step 5.5 SSOT propagation 段;(b) Hook `check_post_main_ssot_propagate.sh` 存在 + 註冊在 PostToolUse Bash matcher;(c) hook 偵測 `git push origin main` + diff HEAD~..HEAD 含 SSOT-affecting paths(`packages/design-system/src` + `packages/storybook-config/{addons,addons-preset.ts,preview.tsx}`(無 src/)+ `.claude/{rules,hooks,skills,commands,references}` + `.claude-plugin/*.json` + `hooks/hooks.json` + `CLAUDE.md`)→ inject 提議 bump beta.N+1;(d) cross-repo SSOT sync 統一由 CLAUDE.md Step 5.5 + `check_post_main_ssot_propagate.sh` canonical trigger(push-main-based;**不需 skill-specific Phase Z**,/knowledge-prune + /deep-audit-cross-codex 不複製,DRY);(e) 整鏈 cover 任何 SSOT-affecting 來源(/knowledge-prune / /deep-audit-cross-codex / 一般 dev / 新元件 / bug fix)。對應「一次更新所有 DS repo 增刪改,不需手動 1 個 1 個」directive |
| 65 | **Chrome header avatar canonical**(2026-05-27 codex Step 4 cite battle + user 抓 UserFooter vertical stack drift)| 對每 production tsx + DS sidebar.stories.tsx / anatomy / principles 跑:`<SidebarHeader>` block 內偵測 `<ItemAvatar>` → 違反 chrome-header canonical(per `header-canonical.spec.md:57-72` / `sidebar.spec.md:241-247` / `item-anatomy.spec.md:513-537`「chrome header 不是 row context」)。正確 pattern = raw `<Avatar size={24}>`。Hook `check_chrome_header_avatar_canonical.sh` PreToolUse Edit/Write 用 python multiline regex 對 `<SidebarHeader>...<ItemAvatar>...</SidebarHeader>` block 偵測;SidebarFooter / SidebarMenuButton row context 不攔(footer IS row context per spec)。錨例 2026-05-27 product-workspace App.tsx + DS 3 sidebar stories 連動 fix |
| 66 | **Immediate cross-repo dispatch + visual parity gate**(2026-05-27 codex collab Q3 共識)| Audit:(a) DS `.github/workflows/release.yml` 含「Dispatch product-workspace sync」step 用 `repository_dispatch` event_type=ds-published 立即 trigger;(b) product-workspace `.github/workflows/sync-design-system.yml` 接 `repository_dispatch` event 自動 bump deps + PR(取代 Renovate weekly);(c) consumer fixture gate:packed DS install to product-workspace,build storybook,DS canonical story vs product story masked screenshot diff;(d) visual-assertions.json coverage manifest 每 component .spec.md ↔ ≥1 visual scenario(2026-06-11 全 component 達標 — AppShell/BulkActionBar/FieldControlGroup 補 anatomy Overview snapshot 起步,後續 audit 輪擴 state 矩陣);(e) `npm pack` ships(scripts/visual-audit.mjs deferred per files allowlist 範疇,plugin SKILL.md 取代)|
| 67 | **SidebarMenuButton implicit-wrap canonical**(2026-05-27 codify per user 抓 UserFooter 垂直 stack root cause)| 對每 production tsx grep:`<SidebarMenuButton>` 無 asChild 但 children 含 `<ItemAvatar>` 或 `<Avatar>` → 違反(SidebarMenuButton 沒 asChild 時把 children 全塞進 ItemLabel 單 span → Avatar+text 同 span 垂直 stack)。Hook `check_sidebar_menu_button_implicit_wrap.sh` PreToolUse Edit/Write 用 python multiline regex 攔。正確 pattern:asChild + `<div role="group">` + `<span data-sidebar="menu-label" className="min-w-0 flex-1 truncate">` per `sidebar.stories.tsx#UserFooter`。錨例 2026-05-27 product-workspace App.tsx UserFooter Avatar 跟 label 垂直堆疊 |
| 68 | **Stories-vs-spec canonical drift**(2026-05-27 codify per user「DS 自己 stories 教錯 = consumer 抄 stories 抄錯」root cause)| 對每 component `*.stories.tsx` + `*.anatomy.stories.tsx` + `*.principles.stories.tsx` grep:含 `<SidebarHeader>` 內 `<ItemAvatar>` / 同類 spec 明文禁止的 pattern → 違反(DS 教 consumer 錯 pattern,類似 2026-05-27 sidebar 3 stories 在 WorkspaceBrand 用 ItemAvatar 違反 chrome header canonical)。**主防線 = R8 registry**(`.claude/references/story-baseline-registry.json` requiredHelpers / antiPatterns + `check_story_invariants.sh` R8/R9 機械攔)+ `check_chrome_header_avatar_canonical.sh` / `check_sidebar_menu_button_implicit_wrap.sh` 具體錨例 hook;`// @canonical-pattern:` / `// @anti-pattern:` 文字 marker **降格為建議性輔助**(2026-06-12 R2 拍板 — 全庫僅 sidebar.stories 2 處採用且無機械強制 = 紙防線,不再「必加」;存在時 audit 順驗其與 spec 一致)。配 Dim 53(spec-vs-code)+ 本 dim(spec-vs-stories)雙向 drift verify;系統性 stories drift audit run via design-system-audit Dim 68 batch sweep |
| 69 | **Consumer no-DS-catalog enforcement**(2026-05-27 M31 codex synthesis per user「眼不見為淨」+「做產品真的能使用跟 ds repo 一模一樣的元件做產品嗎?」)| 對 consumer `apps/**/*.stories.tsx` grep:basename 為 `EveryDsComponent` / `AllDsComponents` / catalog naming + `Object.keys(DS).map` iterate-render + mass hand-mock(≥5 distinct `<DS.X>` 單 file)→ 違反(DS catalog 是 DS Storybook 唯一 SSOT,consumer 重寫必 drift,2026-05-27 錨例 7 bug)。Hook `check_consumer_app_invariants.sh(r1,2026-06-11 merge)` PostToolUse Write/Edit BLOCKER,escape `// @consumer-catalog-allow:`。允許 portal proxy(iframe to DS Storybook)|
| 70 | **Consumer @story-baseline enforcement**(2026-05-27 M31 codex synthesis)| 對 consumer `apps/**/*.stories.tsx` grep:用高風險 DS primitive(DataTable / Dialog / Sheet / Popover / DropdownMenu / Tooltip / HoverCard / LinkInput / RadioGroup / CircularProgress / AppShell / Sidebar)但無 `// @story-baseline: <DS-story-path>#<exportName>` marker → 違反(consumer 必 reference DS canonical story 才 enable visual diff CI)。Hook `check_consumer_app_invariants.sh(r2,2026-06-11 merge)` PostToolUse BLOCKER,escape `// @story-baseline-allow:`。SSOT mapping → `ds-story-manifest.json`(DS package ship)|
| 71 | **Consumer DS primitive misuse anti-pattern**(2026-05-27 per user「做產品真的要能使用跟 ds repo 一模一樣的元件」)| 對 consumer `apps/**/*.{tsx,ts}` production + stories grep:`<CircularProgress size={N}>` literal number 覆蓋 default 24 / `<RadioGroupItem>` 無 `<SelectionItem control={...}>` wrap / `<DataTable columns={[single-col]}>` minimal / `<LinkInput placeholder=...>` 無 `value` prop / `<Empty title=...>` 無 icon AND 無 description / Overlay story 無 `defaultOpen` 視覺 snapshot 看不到 content / **硬寫色值-字級-shadow 繞 token(`bg-[#hex]` / `text-[14px]` / `shadow-md`,2026-06-02 Pattern 8,CF conformance-model 主防線)** / **AppShell slot 餵 raw element(`sidebar={<div>}` 等,2026-06-12 Pattern 9,app-shell.spec:296-299)** / **手刻 RAW primitive 取代 DS 元件(raw `<table>`+`<thead>`/`<th>`→`<DataTable>` / `<img rounded-full>`→`<Avatar>` / native `<select>`→`<Select>` / `<hr>`→`<Separator>`,2026-06-16 Pattern 10,user 抓 fork prototype 手刻 table 不用 DataTable;反 pattern 由 `build-ui-canonicals.md` ❌→✅ 對照表 SSOT 驅動;落實「優先消費既有元件」大原則機械閘 — 補 Pattern 1-9 只抓「DS 元件用錯」、漏「根本沒用 DS 元件亂刻 raw HTML」之洞;`@ds-misuse-allow:` 有理由可豁免)**。**判斷層補掃(2026-06-12 fork 四不像 + 先驗滲漏 anchor;hook 零誤判原則不上 regex)**:(a) page-level entry 手拼 raw 殼而無 `<DS.AppShell>`(對照 app-shell.spec「何時用/不用」表;愈不用 DS 愈不觸 hook = 反直覺洞)(b) 手刻 right panel(`w-[Npx] border-l` div,該走 `aside={<AppShellAside>}`)(c) ChromeHeader/頁頂 tabs 沒走 `withTabs` lockstep(header-canonical.spec「withTabs 連動」段)(d) BulkActionBar 內 primary 鈕 / 浮層 shadow(bulk-action-bar.spec 禁止事項 — regex 無法 bound 到 actions slot,判斷層接)(e) FileViewer toolbar 加鈕不走 `onCapabilitiesChange`(file-viewer.spec:183-194;R9 skip-list 豁免該家族故無寫入網)(f) chrome 面(ChromeHeader/SidebarFooter)title 下第二行(registry 簽名涵蓋 stories;fork production code 由本 dim 接)。Hook `check_consumer_app_invariants.sh(r3,2026-06-11 merge)` BLOCKER。Per-violation cite spec.md file:line。Escape `// @ds-misuse-allow:` |
| 72 | **DS API surface tightening**(2026-05-27 — 治標 vs 治本)| Hook 71 偵測 anti-pattern 是 lint 層攔截;治本要 DS API design 強到 misuse 即 fail tsc。Audit:逐 component review API surface — `size?: number` 該改 `'sm'\|'md'\|'lg'` enum / `columns: Column[]` 該加 min length runtime check / `title` + `description` 該有 type-level XOR / Overlay primitive `defaultOpen` 該 require explicit。配套 codify in `tightening-roadmap.md`(若存在;不存在則以 `props-naming.md` + 各 spec API 段為準,對齊 audit-prompts.md dim 72),分 quarter ship。對應 Dim 71 是攔當前 misuse,本 dim 是消除未來 misuse 可能 |
| 73 | **Full-story visual+interaction sweep enforce**(2026-05-27 codex M31 P0 finding)| Audit report JSON `storyResults.length === manifest.totalStories`(916)。Sample < 916 = reject(per user「不准抽樣」)。Hook `check_full_story_visual_interaction_sweep.sh` PostToolUse audit-report.json BLOCKER。Escape `"_sampling_allowed": "<rationale>"`(極罕見)|
| 74 | **Overlay open/focus/Escape probe**(2026-05-27 codex M31 P0 finding + user 7-bug 錨點「overlay 沒彈出」)| Consumer story 用 Tooltip / Popover / Dialog / Sheet / DropdownMenu / HoverCard Trigger 必含 `defaultOpen` OR `open={true}` OR `play()` interaction click。Trigger-only catalog = reject(visual snapshot 看不到 content)。Hook `check_overlay_open_focus_escape_probe.sh` BLOCKER。HoverCard exception via `@story-trait-allow: missing-opensnapshot` per codex |
| 75 | **Plugin freshness session-start prompt**(2026-05-27 chain-C ship + user「主動引導」directive)| Fork user session_start hook `check_plugin_fork_health.sh(r2,2026-06-11 merge)` reads local installed plugin.json version → fetch GitHub raw marketplace.json → diff version → if stale prompt run `npm run sync-all`. Sync-all 1-command(2026-06-17 起 npm-only,不再跑 `claude plugin`):npm update 治理本體 + idempotent 刷新接線骨架 + skills;生效分軌(機械即時 / settings 自動 hot-reload / 指引 `/clear` 或下個 session)|
| 76 | **Escape marker abuse cap**(2026-05-27 per user「不亂加 escape markers」)| Consumer file 10 escape markers 累計 ≥3 distinct types OR ≥5 total → BLOCK。修法 3 選 1:重構走 DS canonical / 拆 file / env override `CLAUDE_BYPASS_ESCAPE_MARKER_AUDIT`。Hook `check_escape_marker_abuse.sh` enforces escape philosophy「rare per-line documented exception,非 daily tool」|
| 77 | **Composition-fidelity:conformance-primary,pixel-identity opt-in**(2026-05-27 ship / **2026-06-02 model 修正**)| Consumer 對 DS 用法正確性**主要由靜態 conformance 驗**(dim 71 含 Pattern 8 + `check_layout_space_magic_numbers` + R7/R8),對齊世界級 static lint(Polaris stylelint-polaris / Atlassian eslint-plugin-design-system / Carbon stylelint-plugin-carbon-tokens;WebFetch verified)。`scripts/composition-fidelity-visual-diff.mjs` 的 pixel/DOM identity diff 改**明確 opt-in**:只比標 `@composition-fidelity-mode` 的 mapping(忠實複製 replica / same-story 跨版本回歸,對齊 Chromatic/Storybook same-story baseline);單獨 `@story-baseline` = conformance 不做 identity diff;0 opt-in → exit 0。**禁** 拿產品範本(內容刻意不同)pixel 比 DS showcase(world-class 公認反 pattern)。SSOT `composition-fidelity.md`。CI `.github/workflows/composition-fidelity.yml` |
| 78 | **Codex brief 禁列檔 invariant**(2026-05-27 codify per codex v1+v2 token-burn 2× anchor)| `check_codex_brief_invariants.sh` 4th invariant check:codex CLI brief 必含「禁列檔 / 禁 rg --files / 只讀 N file / 直接出 verdict」keyword,否則 codex 自動跑 `rg --files` 列 1300+ files 燒光 reasoning,無法產出 Step 5 Verdict(M31 Step 4.5 last-verdict gate fail)。Hook PreToolUse Bash codex exec/review 偵測 → BLOCKER。Escape `// @codex-brief-invariant-skip:` |
| 79 | **Tailwind v4 wildcard pattern in docs**(2026-05-28 codify per beta.27 6+ CI iteration anchor)| `check_tailwind_wildcard_in_docs.sh` P0 BLOCKER:.md/.spec.md/.sh 文件範例 `var(--X-*)` / `var(--X-A/B/C)` 寫法被 Tailwind v4 vite plugin scanner 當 literal class string 抓 → 產 invalid CSS(CSS 變數名禁 `*` `/`)→ Storybook build 死。改用 math notation `var(--X-N) N∈{a,b,c}`。Escape `// @tailwind-wildcard-allow:`。Anchor:beta.27 release CI iterations 1-6 死於此 |
| 80 | **Addon subdir ship completeness**(2026-05-28 codify per beta.27 7th iteration anchor)| `check_storybook_addon_packaging.sh(r1,2026-06-11 merge)` P0 BLOCKER:addon 主檔(`.storybook/addons/*/` + `packages/storybook-config/addons/*/`)import `./utils/*` 等 relative subdir 但對應 dir 沒一起 ship → Rollup `Could not resolve` → CSF parse error cascade → build 死。修方向:(1) Copy 缺漏 dir(2) 跑 local build verify(3) commit。Escape `// @addon-subdir-skip:`。Anchor:beta.27 ds-devmode 搬 npm 包漏帶 utils/ 6 files |
| 81 | **Storybook addon preset 必 `.cjs` extension**(2026-05-28 codify per beta.27-.31 5 連敗 anchor)| `check_storybook_addon_packaging.sh(r2,2026-06-11 merge)` P0 BLOCKER:`addons/*/preset.ts` 在 `"type":"module"` package 內含 `createRequire` / `require.resolve` / `fileURLToPath(import.meta.url)` → Node ESM scope vs esbuild-register CJS-transpile 衝突 → `require not defined` runtime fail。改 hand-written `preset.cjs`(`.cjs` override package type → 強制 CJS) + `path.join(__dirname, ...)` 返 absolute fs path。SSOT: `memory/feedback_storybook_addon_preset_must_be_cjs.md`。Escape `// @preset-cjs-skip:`。Anchor:2026-05-28 beta.27/.28/.29/.30/.31 5 連敗,beta.32 用 .cjs 才修 |
| 82 | **Consumer app story title `Apps/<app-name>/...` namespace**(2026-05-28 codify per template create-app duplicate-id anchor)| `check_consumer_app_invariants.sh(r4,2026-06-11 merge)` P0 BLOCKER:consumer apps `apps/<name>/**/*.stories.{tsx,ts,mdx}` 的 `title:` field 必開頭 `Apps/<app-kebab-name>/...`(per `.claude/rules/story-rules.md` 「Title 命名 2-namespace canonical」)。錯 prefix → Storybook glob 撈到 2 個同 id story → build duplicate warning + 只顯第一個 → 新 app 在 sidebar 不可見。Hook 從 file path 自動推 expected prefix。DS-internal stories(`packages/design-system/**`)走 `Design System/...` 另條 canonical,out of scope。Escape `// @app-story-title-skip:`。Anchor:2026-05-28 npm run create-app verify-flow-test e2e 抓 4 collisions,`scripts/create-app.mjs:patchStoryTitles()` 修生成 + hook 防手動 edit |
| 83 | **Fork-context runtime + naming SSOT**(2026-05-29 codify per user「fork 後 fork user 在自己獨立環境下仍能如預期運行」;net-new vs dim 62/63/64)| Net-new aspects 不在 dim 62/63/64:**(a)** Hook fire integrity in fork cwd — verify `check_plugin_fork_health.sh(r1,2026-06-11 merge)`(SessionStart)+ `inject_deploy_url_after_push.sh`(PostToolUse Bash)+ approval-preflight scope `apps/**/*.tsx` 在 fork cwd 正確 fire,plugin install 後 `${CLAUDE_PLUGIN_ROOT}` 變數正確 resolve;**(b)** CLAUDE.md cross-load chain — fork `CLAUDE.md` Step 0 指向 `node_modules/@qijenchen/design-system/CLAUDE.md` + `ds-canonical/rules/meta-patterns.md` 真可讀(npm package `files` allowlist 含 ds-canonical);**(c)** Naming SSOT 3 層 — DS-internal source dir(`template/ds-product-template/`)≠ published GitHub Template Repository(`ajenchen/ds-product-template`)≠ fork user new repo 名(self-chosen)清楚 documented in `template/README.md`「命名 SSOT」段;**(d)** **跨 repo 交付 canary(2026-05-29 加,補 source→live 盲點)** — `node scripts/verify-published-deploy.mjs`:L1 mirror workflow 最近 run 必 success(否則 published scaffold stale)+ L2 published `.storybook/main.ts` === 本地 template(mirror 真送達)+ L3 `--live`(給 `NETLIFY_PREVIEW_PASSWORD`)playwright 帶密碼 render 部署故事斷言非空白。**Why net-new**:dim 66 只驗 local fixture build,dim 83(a)-(c)只驗 source — 都沒驗「mirror 有沒有真把 source 送達 live netlify 部署」。Anchor:2026-05-29 mirror 從 5/26 默默失敗(PAT 無 workflow scope)→ published stale → netlify 空白,稽核數週沒抓到因無此 canary。Skill chain:`/deep-audit-cross-codex` Phase 0 cwd detection 切 ds-repo / fork-user-repo 2-mode 跑此 dim(2026-05-29 簡化 from 3-mode per 「避免原則無限膨脹」)。Anchor:2026-05-29 dir name vs published repo name SSOT confusion + ds-canonical mirror drift + mirror-deliver-to-live gap |

### Group Q — Fork-shipped packaging integrity(2026-05-30 加 per user「打包給 template/fork 的所有東西都應被稽核正確無誤且如預期可用」)

**ds-repo-mode-only** — deep-audit Phase 0 在 fork-user-repo 模式自動 skip(fork 無 packaging pipeline);各 dim = 既有 deterministic script 薄 pointer(零新邏輯)。Source→live 交付 canary 見 dim 83(d),本 group 不重複。

| # | Audit | What it catches |
|---|-------|-----------------|
| 84 | **Mirror-build integrity + 2-scenario E2E**(ds-repo-mode-only)| `node scripts/test-2-scenario-architecture.mjs`:20 test case + Mirror M0-M7 — published-template mirror allowlist 正確(scaffold + apps/template + scripts subset 全送達、**排除** `.claude/skills`(governance 走 plugin install))+ package.json transform(`workspaces` + DS dep `*`→`^X.Y.Z`)+ Scenario A/B 結構一致。錨例:2026-05-29 mirror 從 5/26 默默失敗數週稽核沒抓到 |
| 85 | **ds-canonical npm mirror 新鮮度**(ds-repo-mode-only)| `node scripts/sync-ds-canonical.mjs --check`:npm package `ds-canonical/`(skills / rules / hooks read-only cross-load mirror)== live `.claude/` SSOT 無 stale drift(fork `CLAUDE.md` Step 0 cross-load 讀的是此 mirror)。3-allowlist 軸 1:npm files allowlist == `.claude` SSOT。錨例:本 session 13 處死引用同時有 ds-canonical stale 副本 |
| 86 | **Plugin manifest + symlink-vs-source 一致**(ds-repo-mode-only)| `node scripts/plugin-structure-validate.mjs`:`.claude-plugin/{plugin,marketplace}.json` valid + 5-manifest version 對齊 + plugin symlink set(skills / hooks / rules)== source(fork `/plugin install` 後拿到完整 governance 不缺漏)。3-allowlist 軸 2:plugin symlink == source;軸 3(mirror 涵蓋 apps/template + 排除 .claude/skills)走 dim 84 |
| 87 | **Scaffold 可建性 dogfood prepublish gate**(ds-repo-mode-only)| `node scripts/dogfood-prepublish-verify.mjs`:published scaffold 真能 `npm install` + `build-storybook`(consumer 視角,非僅 byte-mirror 比對),prepublish 攔「ship 出去裝不起來」|
| 88 | **Infra-self ref integrity**(ds-repo-mode-only;2026-05-30 加,根因防線)| `node scripts/check-dangling-infra-ref.mjs --check`(governance docs 引用的 hook/script 必存在磁碟 OR 同行 annotate retired/未實作;認 `check_X.sh`→`_X.sh` lib-consolidation form)+ `node scripts/check-skill-deadref.mjs --check`(禁 `CLAUDE.md line N` brittle ref + 已移除 section deny-list)。錨例 2026-05-30:抓 40 處死 hook ref + env-smoke set-e bug,前無機械防線。M7/M34 broad-vs-narrow gap closed。**2026-05-31 infra-audit 修**:SCAN_DIRS 補 `.claude/memory`(原漏=memory infra ref 零防線)。**已知 P3 限制**:annotation-bypass — 同行含 retired/folded/未實作 字樣即 Bucket A,未驗該 hook 真曾存在(fabricated「(retired)」ref 可繞);需 git-history verify 才全閉,暫接受(adversarial-only 風險,queued #9)|

**Heavy dim(`--deep` mode 各必獨立 sub-agent 跑,不可 batch)**:12 / 24 / 25 / 40 / 41 / 42 / 43 / 45 / 49 / 50 / 51 / 52 / 53。Sub-agent prompt 嚴禁含「SKIP」keyword(per Phase 1 NO-SKIP invariant)。

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
4. Build fail → 不跑全 dim;報 user 決定先修 OR 繼續(broken code audit 多 dim 跑不動)
5. TaskList entries 建好

### Phase 0.5 — Preflight 全面盤查(2026-05-15 user-mandated P0,NO-SAMPLE 前置)

User verbatim:「你完整稽核之前應該會先全面盤查全部檔案和所有設計原則對吧?我記得之前我有命令你要在 infra 定義這件事」+「確保現在和未來都會自動涵蓋,當有新的準則就務必更新設計系統進階稽核的內容」。

**強制 chain**:`/design-system-audit --deep` 跑時 Phase 1 前自動跑 `node scripts/audit-preflight.mjs`(對應 SSOT `.claude/memory/feedback_audit_preflight_全盤查.md`)

**輸出 3 件**:
1. **檔案 enumeration**:全 `packages/design-system/src/**/*.{tsx,ts,css,md}` 計數 + per type bucket(component tsx / showcase stories / anatomy stories / principles stories / spec.md / tokens)
2. **設計原則 enumeration**:M-rule(meta-patterns.md)+ spec trait(frontmatter)+ hook invariant + rules
3. **Coverage matrix**:每原則 → audit dim 對應(N 對應 / NO COVER gap)— 存 `.claude/logs/audit-preflight-{date}.json`

**Gap 處理**:有 gap → Phase 1 dispatch 前 user 拍板:補新 dim / 撤原則 / 接受 gap 紀錄 deferred。

**Phase 1 sub-agent 必引 preflight log**:Coverage matrix 對應 dim → sub-agent 跑該 dim 時掃 file enumeration list(DS-wide ALL,不 sample,per NO-SAMPLE invariant)。

### Phase 1 — Parallel audit execution

Launch all audits as background subagents (single message, multiple `Agent` tool calls with `run_in_background: true`). Use prompts in [references/audit-prompts.md](references/audit-prompts.md).

**Every audit prompt declares three metadata lines at top**:
- **Type**: `Absolute` or `Consistency` (per CLAUDE.md`# 稽核 canonical`「Consistency 類稽核」)
- **Canonical source**: where correct behavior is defined
- **Rationale home**: where deviation justification should live (`N/A` for Absolute)

Sub-agents applying a **Consistency** dim **must** search the Rationale home for each apparent deviation before reporting as VIOLATION. A documented rationale paragraph = `deviation ✓` (not a violation). Absolute dims apply strict `actual == canonical` check.

Each audit reports:
- Violations only (skip confirmations); for Consistency dims, also list `deviation ✓` items with rationale location as evidence the framework caught-and-cleared them
- file:line for every finding
- Suggested fix direction
- Count + top offenders

#### ⚠️ `--deep` mode NO-SKIP + NO-SAMPLE invariant(2026-05-15 user-mandated P0)

User verbatim 2026-05-15:
> 「請確保之前所有列過的關於 design system 深度稽核要做的事情在稽核時都肯定會做到」
> 「都已經叫深度稽核到底怎麼還能疏漏?」
> 「**稽核並非既往不咎,稽核要全盤稽核,不能只抽樣,要全盤**」

**`/design-system-audit --deep` 跑時兩條 mechanical**:

### NO-SKIP(原 2026-05-15)
- Sub-agent prompt 禁含「SKIP / too heavy / DEFERRED per instruction / 跳過 dim」keyword
- 每 dim 必跑,heavy dim(12/24/25/40-44)獨立 sub-agent,不擠 batch
- Context 不夠 → 拆 2-stage(per-component scan → cross-component synthesis)

### NO-SAMPLE(2026-05-15 補強 + 2026-05-17 P0 升級嚴格 no escape clause)
- Sub-agent prompt **禁含「sample top N / subset / pick top X / top hot / sampled components / sample evidence allowed / heavy agent needed / full sweep deferred」**等任何縮 scope keyword
- 每 dim 必 **DS-wide ALL components**(60+ 元件全掃),不 sample subset
- Context 不夠 → 拆 N stages(每 stage 10-15 元件 batch),**不 sample**
- 對應 SSOT:`memory/feedback_audit_full_sweep_not_sample.md`
- **2026-05-17 強化(user verbatim 抓教訓)**:「每次抓出的問題你他媽要給我基於我們所有的檔案包括設計原則去再三確認到底是不是問題」+「沒有取樣這種東西」+「重新深度完整稽核」。Dispatch prompt 任何「sample evidence allowed」/「heavy agent needed for full sweep」/「sample-N」escape clause **禁止寫入** — 違 = BLOCKER 不發 dispatch

**Sub-agent dispatch prompt template MUST 含(2026-05-17 升級)**:
```
**Coverage requirement (NO-SAMPLE STRICT, NO ESCAPE)**:
DS-wide ALL components(grep / glob 全 packages/design-system/src/components/*/),不挑樣本。
若 context 不夠 → 拆 stage 分批(每 stage 10-15 元件),**所有 stages 必跑完才能寫 verdict**。
**禁止**寫「sample / top N / heavy agent needed / full sweep deferred」等 escape clause。
若 dim 真不可能全掃,反 dispatch 給 user 拍板,不是寫 sample escape clause。

**Triple-verify finding rule (2026-05-17 user-mandated)**:
每抓 1 個 violation,sub-agent 必 verify 3 layer 才能列進 report:
(a) grep cite 真實 file:line(不只列名,要 quote 引文)
(b) Cross-check 對應 spec.md「禁止事項」/「何時用」/「何時不用」段 — 該違反真的違 spec 嗎?
(c) Cross-check 既有 DS canonical/.claude/rules + structural-token-retention.md + tokens/{name}.spec.md — 屬 forward-looking / palette completeness / dark mode pair 嗎?
任一 layer 顯示「不是 violation」→ retract from report,不送 user 拍板。
違 triple-verify = 浪費 user 時間 false-positive,違 verbatim 2026-05-17 directive。
```

**Mechanical strength**:
- `stop_self_audit.sh` 偵測「`--deep` + sub-agent prompt 含 SKIP / sample / heavy agent / top N keyword」→ BLOCKER inject
- `check_audit_sample_escape.sh`(2026-05-17 新加)PreToolUse Agent 攔截 dispatch prompt 含 sample escape clause
- 本 SKILL.md Phase 1 dispatching MUST cite「NO-SKIP + NO-SAMPLE invariant verified, triple-verify 內建,全 dim 已 dispatch」in commit message

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

### Phase 4.5 — Governance sprawl check(2026-05-17 升:default 也 chain light)

**Default mode**:chain `/knowledge-prune` Phase 0(baseline)+ Phase 1 D1(duplicate)+ D4(contradiction)輕量 **report-only**(不修),~5 min。Codex Q5 verdict:contradiction 比 dup 更會破 SSOT,該優先,故 default 不只 D1。

**Deep mode**(`--deep`):chain full Phase 0-5;P0/P1 auto-fix,P2 STOP 等 user。Trigger 條件(2026-05-17 加 4 條,共 9 條):CLAUDE.md > 800 / MEMORY > 20 / 動 Meta-Pattern / hook-fires 6 月 0 fire / corrections > 10 / **audit-prompts.md coverage < 100%** / **`@benchmark-unverified-blanket` count > 0** / **new audit dim added 本次** / **hooks count >= soft threshold(26)**。

**機械化 trigger 點**(2026-05-17 加):post-audit final report validator hook(`check_audit_post_report_validator.sh`)— audit Phase 4 結束 emit 「prune-chain-trigger」signal → 下一 turn `inject_pending_self_audit.sh` 注入 `/knowledge-prune scope=full` directive。**不**靠記憶。

**Findings → prune feed**(M14 mandate):Phase 1 finding 含「新 rule 提議」keyword → auto-queue `/knowledge-prune` Phase 1 D3 candidate(判 abstract 或 duplicate)。

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

- [references/audit-prompts.md](references/audit-prompts.md) — Subagent prompts for audit dimensions(部分覆蓋,Dim 24-28/31-46 待補 Fix 2 後續)
- [references/historical-bugs.md](references/historical-bugs.md) — Bug classes indexed by audit
- [references/checkpoints.md](references/checkpoints.md) — Detailed examples of each MUST-ASK scenario
