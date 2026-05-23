---
name: design-system-audit
description: Systematic audit of this design system for world-class quality. Runs the full audit dimension list(per `## The N audit dimensions` section) covering spec hygiene / code correctness / a11y / naming / tokens / patterns / CLAUDE.md consistency / Layout Family compliance / prop value collisions / shadcn alias leakage / home-name-vs-scope fit / spec hardcoded-values, and surfaces actionable fix lists. Has explicit checkpoints where the skill MUST stop and ask user. Invoke via /design-system-audit when asked to audit, re-audit, check quality, or verify design system health.
---

# Design System Audit (56 dimensions, Groups A–P + Future-proof preflight)

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
| 11 | **Story 三層齊全 + pattern demo coverage**(2026-05-18 升)| (a) Every `Components/` (public) component has all 3 stories layers;(b) Every `patterns/<name>/` 必 ≥ 1 visual demo stories.tsx per `patterns/README.md` charter L5「每 pattern 提供 `.stories.tsx` 展示」(2026-05-23 codex Phase B 抓 Claude 前一輪錯誤 retract,charter cite + package.json `./patterns/*` exports + index.ts barrel exports 證明 patterns 是 public-API,撤回 internal exempt)|
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
| 28 | **Manual story 拆分原則 alignment**(對齊 Polaris / Carbon / Storybook 官方)| Per-component grep `*.stories.tsx`(non-anatomy/principles)反 pattern:(1) `WithStartIcon`+`WithEndIcon` 拆兩 story(同 slot rule 違規,該 `WithIcon` 對照 grid)(2) `Default`+`AllVariants` 同檔(冗餘)(3) ≥2 個 variant 拆細(`Primary`+`Secondary`+`Tertiary` 各自 — 該合 `AllVariants`)。`// @story-split-rationale: <reason>` 檔首 allowlist 例外。Hook check_story_slot_split(planned) write-time block 同源,本 dim 對既有元件 batch verify。對應 `.claude/rules/story-rules.md`「拆分原則」+ `/story-writing` skill Phase 0 |
| 29 | **Trait-based展示 stories compliance**(對齊 M19 ensure-canonical pipeline + Polaris/Material/Carbon/Ant/Storybook)| Per-component verify(a)spec.md frontmatter 有 `traits:` 宣告(b)展示 stories.tsx 包含每 trait 的 required core stories(c)scope-N/A 的 trait 在 spec.md 邊界案例段有 rationale。違反列 P0 修。對應 `category-templates.md` v2 + hook `check_story_category.sh`。Hook 是 write-time block,本 dim 對既有 47 元件 batch verify + 找未宣告 traits 的元件(P2 migration pending) |
| 30 | **Principles canonical compliance**(對齊 Polaris / Carbon / Ant 共識)| Per-component verify principles.stories.tsx:(a)universal core ≥ 2 of {WhenToUse / WhenNotToUse / Vs*Rule / ContentGuidelines}(b)無 deprecated 命名(`Forbidden*` / `Donts` / `Pitfalls` / `Prohibitions` / `NonGoals` / `VisualDonts` 全 deprecated → `WhenNotToUse`)。對應 `category-templates.md`「Principles canonical」節 + hook `check_principles_canonical.sh`。Hook 是 write-time block,本 dim 對既有 47 元件 batch verify(預期 13 元件 deprecated naming + 52 元件缺 WhenToUse)|

### Group M — Overlay body API discipline(2026-05-01 新增)

| # | Audit | What it catches |
|---|-------|-----------------|
| 31 | **Overlay body 無 stripped-padding boolean variant**(對齊 Material/Atlassian/Mantine/shadcn 主流;Polaris flush API 例外但 scope 極窄)| Per-overlay grep `components/(Dialog\|Sheet\|Popover)/*.tsx`(非 stories)反 pattern:`(flush\|naked\|bare\|stripped\|unpadded\|noPadding\|paddingless)\?:\s*boolean` 在 body component。違反 = list-as-region 場景該由 consumer 用 className override(`!px-0 !pt-0 !pb-0`)+ 自管 list outer wrapper 處理,不該加 body variant。Rationale:variant 不解決底層脆弱(加 1 row search/banner 就破功)+ 把 1 surface decision 拆兩 API。對應 hook `check_overlay_handcraft.sh` Check 6 + `overlay-surface.spec.md`「List-as-region in overlay body」+ memory `feedback_layout_v6_canonical.md`。Hook 是 write-time block,本 dim 對既有 overlay 元件 + 未來新增 overlay primitive(Drawer / FileViewer body 等)batch verify。`// overlay-body-stripped-variant-allow:` 檔頭 allowlist 例外(必含 ≥3 家世界級對照 + multi-row hold 保證)|
| 32 | **Filter operator registry SSOT consumption**(對齊 ClickUp/Airtable/Notion API + M17)| Per-consumer grep:反 pattern(a)hardcode op 字串 array 不 import `OPERATOR_REGISTRY`;(b)inline switch on op derive ValueShape(該走 `getValueShape`)。SSOT:`DataTable/filter-operators.ts`。`// filter-op-inline-allow:` 檔頭 escape |
| 33 | **Component classification + abstraction discipline**(對齊 M21 + M22 + M23)| Per-component verify 5 子維:(a) **Internal vs Components 一致性**;(b) **Premature abstraction** rationale + cite;(c) **Sub-component 5-file 結構過度**;(d) **Benchmark claim 缺 source**(M22);(e) **DS internal canonical 優先**(M23)— spec / tsx 含 world-class DS keyword 但 visual decision(color / size / spacing / typography / state)未先 grep DS 既有 token / variant / pattern 命中 → flag。Sub-agent 對每 benchmark cite 反查:該屬性在 `tokens/` / 近親 spec 已有 codified canonical 嗎?有 → 該 cite 應為**輔證**(內部 canonical 主)而非**主導**(外部覆蓋內部)。違反 = M23 自開新 tier(2026-05-03 chevron 事件:Ant 5 家 muted 覆蓋 DS icon-only Button neutral-9 預設)|

### Group N — State precedence + chain invariants(2026-05-04 新增,M24/M25 codify)

| # | Audit | What it catches |
|---|-------|-----------------|
| 34 | **Disabled state 顯著性 precedence**(M24)| Field family disabled mode → 內 placeholder/value/icon 全切 `text-fg-disabled`(非 muted)。Hook `check_disabled_placeholder_color.sh` |
| 35 | **Layered chain invariant — overlay scroll**(M25)| Overlay primitive → SurfaceBody 中間 wrapper 必 `flex flex-col h-full`,斷一層 = body 不 scroll。Hook `check_overlay_panel_scroll_chain.sh` |
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
| 44 | **Public vs Internal classification**(2026-05-23 user 永久拍板,SSOT in `.claude/rules/ui-development.md`「Public component vs Internal primitive canonical」段)| **Mechanical test**:每 export 過題「end-user app `<X />`(空 children / 無 props / 無 wrapper context)render → 有 functioning visible UI 嗎?」YES = public,NO = internal。Public 住 `components/<Name>/` OR `patterns/<name>/`(無 `internal: true` frontmatter),storybook `Design System/Components OR Patterns/<Name>`。Internal 住 `components/Internal/<Name>/` OR `patterns/<name>/`(`internal: true` frontmatter),storybook `Design System/Internal/...`,export 加 `@internal` jsDoc。**Exception:compound-component public API**(`Dialog.Root/Trigger/Content` / `Field + FieldLabel + FieldError + FieldDescription` 等 documented composition pattern)豁免 — 對齊 Radix Dialog / MUI FormControl + Mantine Input.Wrapper compound idiom。對標世界級:Polaris Building blocks vs layout primitives / Material `@mui/material` vs `@mui/utils` / Atlassian `@atlaskit` vs internal `<unstyled>` / Carbon turnkey vs utilities / Apple HIG presented controls vs implementation primitives |
| 45 | **Mechanical output structural validation**(2026-05-15 user-mandated)| 對每元件跑 `compile-stories.mjs <Name>` 取 generated rows;grep 確認(a) `AllSizes` 含所有 cva sizes (b) `AllVariants` / `ColorMatrix` 含所有 cva variants (c) `Accessibility` story 含 ARIA hint / keyboard map (d) `See also` cross-link 反指 spec.md 既有 link section。不只 drift,**output structure 對 spec/cva 完整覆蓋**。對應 SSOT:`scripts/compile-stories.mjs` 邏輯 + `references/anatomy-standard.md`。Future:加 `compile-stories.mjs --validate` mode 把 grep 移進腳本 |
| 46 | **Manual vs Mechanical boundary**(2026-05-15 user-mandated)| Per-元件 grep `.stories.tsx`(非 anatomy/principles),若含 trait-derived `AllSizes` / `AllVariants` / `WithIcon` hand-written export 而非 import auto-compile 結果 = anti-pattern(該 migrate 進 auto-compile)。對應 SSOT:`category-templates.md` v2 trait-based。例外 allowlist:`// @manual-trait-allow: <reason>` 檔頭 |

### Group P — World-class tier(2026-05-17 加,codex 共識)

| # | Audit | What it catches |
|---|-------|-----------------|
| 47 | **Tailwind utility registry compliance**(對齊 Atlassian `@atlaskit/tokens` / Carbon / Ant / Polaris token-first)| `check_opacity_token_usage.sh` 升 `check_tailwind_token_registry.sh`,讀 `packages/design-system/src/tokens/utility-registry.json` SSOT。檢 `leading-N` / `tracking-*` / `gap-px|0.5|1.5` / `w-fraction` / `text-(xs|sm|base|lg|xl|...)` / `font-(thin|light|semibold|black)` / `rounded-(xl|2xl|3xl)` 等繞 SSOT utility |
| 48 | **Unused / orphan token detector**(2026-05-21 升級:跑 `scripts/audit-orphan-tokens.mjs --check` SSOT,不用 raw grep `var()` — 漏 Tailwind `@theme inline` bridge + `@utility` body + class-name match + JS literal mirror,N 條合法消費路徑 false-positive)。Script 內建 structural-keep 分類器(palette tier 1-10 / mask alpha / chart reserved / state variants / neutral / SOP 5-piece / JS literal mirror)per `tokens/orphan-tokens.spec.md` SSOT。真 retire 候選 = comprehensive scan 後仍 0 consumer + 不落任何 structural-keep 類別。0 真孤兒 = PASS;有真孤兒 → user 拍板 retire OR 補 structural-keep 新類別 |
| 49 | **a11y axe-core 自動跑 + contrast ratio**(Storybook a11y addon + Carbon AVT + Atlassian linters)| Per `*.stories.tsx` 跑 axe-core via Storybook a11y addon;WCAG AA contrast ≥ 4.5:1(text)/ 3:1(large text / UI)。Carbon 每 PR 跑 AVT,Atlassian 季度 audit + linter integration。本 dim 缺 = a11y 漏在 spec.md 寫了但無自動驗 |
| 50 | **Bundle size budget per component**(Material UI size-limit / Material Web public tracking / Ant tree-shake)| Per component gzip size 上限(eg. Button ≤ 5KB / DataTable ≤ 50KB);CI fail if regress > 10%。對齊 size-limit pkg + Carbon export audit。需建 `package.json` `size-limit` 段 + per-component manifest |
| 51 | **Theme / density visual matrix**(Material 3 dynamic color / Apple HIG Dynamic Type)| Deep mode 每 core story 跑 light/dark/high-contrast/density-md/density-lg/RTL 6-cell matrix screenshot diff;baseline drift > Δ% → flag。對齊 Polaris visual regression / Carbon dark token matrix |
| 52 | **Header canonical cross-family invariants**(W1-W6,2026-05-17 ship per M31 codex 共識,對齊 GitHub Primer + Ant + Material v1)| Per chrome / overlay header tsx 跑:(W1) 含 Tabs child 必有 `withTabs` prop(border auto-suppress) (W2) tabs padding = header padding(`--layout-space-loose`) (W3) `--tab-height-lg` == `--chrome-header-height`(md/lg 對等) (W4) header + tabs flush stack 無 negative margin (W5) tabs default = sm 已 land + md 標 future tier (W6) cva default 已從 md 改 sm。Hook 3:`check_tab_lg_chrome_header_equal.sh`(W3) / `check_header_with_tabs_border.sh`(W1) / `check_chrome_header_handcraft.sh`(Layer 3 ChromeHeader consumption) |
| 53 | **Code-to-spec reverse drift check**(2026-05-17 user 抓 Phase 1 漏抓 FileViewer h-14 spec drift,新加 dim)| 對每 component grep `packages/design-system/src/components/<X>/<X>.tsx` 的 className 硬寫 utility(`h-14` / `w-80` / `px-loose` 類)→ 反向掃對應 `<X>.spec.md` 是否仍寫「固定 h-NN」「寫死」keyword 但 code 已 migrate to token = drift。互補既有 forward Dim 15/20(spec → code)。Hook `check_spec_class_drift.sh` write-time soft P1 warn,本 dim batch verify 既有 60+ 元件 spec.md。錨例:2026-05-17 Phase 1 我 file-viewer.spec.md L103 寫「Known drift:h-14 硬寫不消費 token」但 file-viewer.tsx:333 已 `h-[var(--chrome-header-height)]`,3+ 次 `/design-system-audit --deep` 都沒抓到反向 drift |
| 54 | **M35 Nearest same-purpose canonical compliance**(2026-05-20 codify per codex Layer B D4)| 對每 `*.stories.tsx` wrap 既有 primitive(Sidebar / DataTable / ChromeHeader / Dialog / Sheet / Popover)的 file 跑:(a) 檔頭含 `@story-baseline:` cite marker?(b) `.claude/references/story-baseline-registry.json` 內 primitive 的 `requiredHelpers` 全 import?(c) `antiPatterns` regex 任一 match → fail?(d) `variantRules` button variant + size + iconOnly + pressed 全 satisfy?Hook `check_story_invariants.sh R8` write-time soft warn,本 dim batch verify。錨例:2026-05-20 AppShell stories 連 5 round drift 後 codex Layer B 抓 root cause = SSOT 消費被當引用儀式 |
| 55 | **Token cross-namespace mapping integrity**(2026-05-20 codify per user 抓 red→deep-orange bug 100+ audit 沒發現)| `tokens/color/semantic.css` 每 hue interaction token(`--blue-hover` / `--red-hover` / ...)必指向**同名**primitive(`--red-hover: var(--color-red-N)`),**禁**跨 hue 混(`--red-hover: var(--color-deep-orange-N)` 違反)。Primitive 12 hue 全該有對應 interaction(blue/red/deep-orange/orange/amber/yellow/lime/green/turquoise/indigo/purple/magenta)。Status semantic(`--error-hover` 等)直指 primitive,**不**透過 hue layer。錨例:2026-05-20 semantic.css:246 `--red-hover: var(--color-deep-orange-5)` cross-namespace bug,100+ audit 沒發現 = audit 沒檢 token mapping integrity |
| 56 | **AppShell primary-header consistency**(2026-05-21 codify per user 抓「primary-header = primary-sidebar + 一條 global header」+「globalHeader 存在時 sidebar 內 header 該拿掉」)| 對每 consumer `.tsx`(stories / app code)grep `layout="primary-header"`,verify:(a) 同 file 含 `globalHeader=` prop(否則邏輯矛盾)/(b) 同 file 不含 `<SidebarHeader>`(WorkspaceBrand 該在 globalHeader,不重複)。World-class cite:GitHub repo sidebar 無 header(org/repo 在 global breadcrumb)+ Gmail / Figma file editor sidebar 無 header(brand 在 global top bar)。Hook `check_app_shell_primary_header_consistency.sh` write-time block(P1 warn,可 escape `// @app-shell-primary-header-allow:`)。對應 `app-shell.spec.md`「WorkspaceBrand 放置 SSOT」段 |

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
- **Type**: `Absolute` or `Consistency` (per CLAUDE.md「Consistency Audit 原則」)
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
