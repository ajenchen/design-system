#!/usr/bin/env node
/**
 * audit-coverage-matrix.mjs — Per-dim deterministic script coverage matrix
 *
 * 2026-05-23 永久 anti-sample mechanism per user verbatim「幹你娘就叫你他媽所有稽核都要完整執行
 * 不要再抽樣,到底要講幾次?...把全部要稽核的東西都給我避免抽樣」
 *
 * 每 audit dim 分 4 tier:
 *   - DETERMINISTIC:有 deterministic script,sub-agent 必 chain,output 含「N files scanned, 0 violations」cite
 *   - HOOK-ENFORCED:有 write-time PostToolUse hook 偵測該違規。**2026-05-31 誠實化(infra-audit)**:hook 分
 *     BLOCK(exit 2 真擋)vs WARN(exit 0 印 stderr 不擋)兩種;WARN-only hook **不 prevent 違規 landing**,
 *     audit-time 必 DS-wide grep 確認 residue(不可純信賴 hook state)。各 dim mechanism 須註明 block 或 warn。
 *     [TODO queued #9:逐個 audit 全 HOOK-ENFORCED dim 的 hook 是 block 或 warn,mechanism 標註齊]
 *   - PURE-JUDGMENT:genuinely 需 LLM reasoning(content quality 主觀),dispatch contract 強制「DS-wide all files 不 sample」
 *   - CI-ENFORCED:只能由受保護遠端狀態與綁定精確 commit/release 的可信 CI readback 證明；
 *     本機檔案存在、模型判斷或手寫 receipt 都不能替代。
 *
 * Output:
 *   - `generated/governance/audit-coverage-matrix.json` — deterministic per-dim tier + script path
 *   - stderr — gap list(dim 無 deterministic script 且非 PURE-JUDGMENT → fill candidate)
 *
 * Usage:
 *   node scripts/audit-coverage-matrix.mjs           # report
 *   node scripts/audit-coverage-matrix.mjs --check   # CI(exit 1 if dim has no anti-sample mechanism)
 */

import fs from 'node:fs'
import path from 'node:path'
import { validateAuditCoverageEntry } from './lib/audit-coverage-classification.mjs'
import { loadDeterministicDeepAuditPlan } from './lib/deep-audit-deterministic-plan.mjs'

const ROOT = process.cwd()
const CLI_ARGS = process.argv.slice(2)
const CHECK = CLI_ARGS.includes('--check')
if (CLI_ARGS.some((argument) => argument !== '--check') || CLI_ARGS.filter((argument) => argument === '--check').length > 1) {
  console.error('用法: node scripts/audit-coverage-matrix.mjs [--check]')
  process.exit(2)
}
const deterministicMechanism = (dim) => `scripts/deep-audit-deterministic-plan.json dimension ${dim}(argv/capability/coverage SSOT)`

// Per-dim coverage classification(SSOT — sync 進 design-system-audit/SKILL.md per-dim row)
const COVERAGE = {
  // Group A — Correctness
  1: { tier: 'HOOK-ENFORCED', mechanism: 'post_edit_dispatcher.sh → lib/_story_compile_drift.sh(cva 三方漂移 — story-auto-compile-migrate + scripts/compile-stories.mjs --check chain)' },
  2: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(2) },
  3: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(3) },
  4: { tier: 'HOOK-ENFORCED', mechanism: 'check_opacity_token_usage.sh(write-time P0 BLOCKER exit 2,2026-07-07 治理進化方向 2 升級;per-line escape @token-registry-ok)+ utility-registry.json SSOT + audit-time DS-wide grep 確認 residue' },
  5: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(5) },
  // Group B — Spec hygiene
  6: { tier: 'PURE-JUDGMENT', mechanism: 'Spec 文字品質 AI judgment;dispatch 必 DS-wide 全 spec.md(82 files),禁 sample;含 file:line per finding' },
  7: { tier: 'PURE-JUDGMENT', mechanism: 'Spec 邊界案例 AI judgment;dispatch 必 DS-wide 全 spec.md 每 spec 過 7-dim 覆蓋' },
  8: { tier: 'PURE-JUDGMENT', mechanism: '7-維對標 AI judgment;dispatch 必 DS-wide 全 spec.md;每 spec 7-dim per row' },
  // Group C — Code conformance
  9: { tier: 'PURE-JUDGMENT', mechanism: 'shadcn passthrough 完整度 — dispatch agent DS-wide 全掃 components/*.tsx 驗 forwardRef/displayName/asChild/...props/data-state 齊;無 write-time hook(2026-05-31 infra-audit 修:原誤標 HOOK-ENFORCED 且 cite 無關的 check_codex_collab_5step.sh(codex hook+soft-warn),實際是 audit-time grep)' },
  10: { tier: 'PURE-JUDGMENT', mechanism: 'a11y aria-label DS-wide AI judgment + scripts/audit-a11y.mjs(axe-core deterministic);dispatch 必 全 components grep aria-label coverage' },
  // Group D — Story layer
  11: { tier: 'HOOK-ENFORCED', mechanism: 'check_story_invariants.sh R1 anatomy(原 check_story_anatomy.sh)+ 3-layer file existence DS-wide grep' },
  12: { tier: 'PURE-JUDGMENT', mechanism: 'Story 人話 AI judgment;dispatch 必 DS-wide 全 stories 過 placeholder/jargon test' },
  13: { tier: 'HOOK-ENFORCED', mechanism: 'check_story_invariants.sh R1 anatomy 5-section structural enforce(原 check_story_anatomy.sh)' },
  // Group E — System
  14: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(14) + ';mechanical repository-wide naming/topology/transient/symlink/exact-duplicate closure，另保留 home/file purpose AI judgment layer' },
  15: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(15) },
  // Group F — Architecture
  16: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(16) },
  17: { tier: 'PURE-JUDGMENT', mechanism: 'Prop value cross-component semantic conflict — dispatch 必 grep prop literal DS-wide' },
  18: { tier: 'HOOK-ENFORCED', mechanism: 'post_edit_dispatcher.sh → lib/_token_hygiene.sh(shadcn compat alias ban write-time;dispatcher 已 registered settings.json)+ DS-wide grep audit-time;2026-05-31 字串精確化(原寫 check_token_hygiene.sh standalone 不存在,實際 active 路徑是 dispatcher source lib)' },
  // Group G — Home governance
  19: { tier: 'PURE-JUDGMENT', mechanism: 'Home-name-vs-scope AI judgment;dispatch 必 DS-wide enumerate folder vs actual scope' },
  20: { tier: 'PURE-JUDGMENT', mechanism: 'Spec 硬寫機械化值 — dispatch 必 grep DS-wide spec.md 找 px / hex / Tailwind class lists' },
  // Group H — Consumer
  21: { tier: 'HOOK-ENFORCED', mechanism: 'check_item_list_gap.sh write-time WARN(exit 0 additionalContext,非 block)+ audit-time grep backstop' },
  22: { tier: 'PURE-JUDGMENT', mechanism: '視覺容器 inner breathing — dispatch agent DS-wide 全掃有邊界容器是否缺 inner padding;原 check_container_breathing.sh 已 retired 無 active 替代(2026-05-31 infra-audit 修假分類,原誤標 HOOK-ENFORCED)' },
  // Group I — Story auto-compile
  23: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(23) },
  24: { tier: 'PURE-JUDGMENT', mechanism: 'Story 範例重複性 AI judgment;dispatch 必 per-component DS-wide 列 stories scenario matrix' },
  25: { tier: 'PURE-JUDGMENT', mechanism: 'Story 必要性 grounding DS-wide AI judgment;dispatch 必 per-component 全掃 過 2-test(spec-tied / removal-degrade)' },
  // Group J — Form / state
  26: { tier: 'PURE-JUDGMENT', mechanism: 'Controlled/Uncontrolled dual-mode AI judgment;dispatch 必 DS-wide form-like + overlay-like enumerate dual-mode pair check' },
  // Group K — Code quality
  27: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(27) },
  // Group L — Story splitting
  28: { tier: 'PURE-JUDGMENT', mechanism: 'Manual story split principle DS-wide AI judgment;dispatch 必 per-component grep stories.tsx WithStartIcon/WithEndIcon split anti-pattern' },
  29: { tier: 'HOOK-ENFORCED', mechanism: 'check_story_invariants.sh R3 category trait-based DS-wide enforce(原 check_story_category.sh)' },
  30: { tier: 'HOOK-ENFORCED', mechanism: 'check_canonical_propagation.sh E.1 principles canonical DS-wide enforce(原 check_principles_canonical.sh)' },
  // Group M — Overlay body
  31: { tier: 'HOOK-ENFORCED', mechanism: 'post_edit_dispatcher.sh → lib/_overlay_handcraft.sh WARN(exit 0,2026-05-31 修 dangling ref:原寫 check_overlay_handcraft.sh standalone 不存在,已 fold 成 lib helper)+ grep ban stripped-padding boolean variant audit-time' },
  32: { tier: 'PURE-JUDGMENT', mechanism: 'Filter operator registry SSOT consumption — dispatch 必 grep consumer hardcode op string DS-wide' },
  33: { tier: 'PURE-JUDGMENT', mechanism: 'Component classification + abstraction discipline DS-wide AI judgment;5 sub-dims per-component 全掃' },
  // Group N — State + chain
  34: { tier: 'HOOK-ENFORCED', mechanism: 'check_field_family_invariants.sh A.4 disabled placeholder color(原 check_disabled_placeholder_color.sh,P1 stderr)' },
  35: { tier: 'HOOK-ENFORCED', mechanism: 'check_pattern_invariants.sh C.1 overlay panel scroll chain(原 check_overlay_panel_scroll_chain.sh,P1 WARN)' },
  36: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(36) },
  37: { tier: 'HOOK-ENFORCED', mechanism: 'check_field_family_invariants.sh(focus-dominates border-primary state machine;2026-05-30 從誤分 PURE-JUDGMENT 修正)' },
  38: { tier: 'PURE-JUDGMENT', mechanism: 'Inline-action gap canonical — dispatch 必 grep ItemInlineAction sibling gap DS-wide' },
  39: { tier: 'HOOK-ENFORCED', mechanism: 'check_pattern_invariants.sh C.4(row-slot handcraft,2026-05-30 fixed order-independent regex + 從誤分 PURE-JUDGMENT 修正)' },
  // Group O — Storybook content quality
  40: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(40) },
  41: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(41) },
  42: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(42) },
  43: { tier: 'PURE-JUDGMENT', mechanism: 'Reader-facing guidance AI judgment;dispatch 必 DS-wide NO-SAMPLE 全讀所有 Autodocs component descriptions + principles.stories Rule notes，判用途/何時用/近親分界與 rationale 品質；audit-content-quality 只兜 existence/stub' },
  44: { tier: 'PURE-JUDGMENT', mechanism: 'Internal vs Components 三 test DS-wide — dispatch 必 enumerate ALL Internal folder + components,3-test per row' },
  45: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(45) },
  46: { tier: 'PURE-JUDGMENT', mechanism: 'Manual vs Mechanical boundary — dispatch 必 grep DS-wide stories trait-derived hand-written exports' },
  // Group P — World-class tier
  47: { tier: 'HOOK-ENFORCED', mechanism: 'post_edit_dispatcher.sh → lib/_token_hygiene.sh(utility-registry.json SSOT compliance write-time)+ DS-wide grep audit-time;2026-05-31 字串精確化(原寫 check_token_hygiene.sh standalone 不存在)' },
  48: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(48) },
  49: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(49) },
  50: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(50) },
  51: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(51) },
  52: { tier: 'HOOK-ENFORCED', mechanism: 'chrome_header_dispatcher.sh → lib/_tab_lg_chrome_header_equal.sh + lib/_header_with_tabs_border.sh + lib/_chrome_header_handcraft.sh BLOCKER(exit 2 傳播,2026-05-31 folded-hook-audit)' },
  53: { tier: 'HOOK-ENFORCED', mechanism: 'check_spec_class_drift.sh write-time WARN(exit 0,非 block)+ audit-time grep backstop' },
  54: { tier: 'HOOK-ENFORCED', mechanism: 'check_story_invariants.sh R8 story_archetype_registry + packages/design-system/ds-canonical/references/story-baseline-registry.json' },
  55: { tier: 'PURE-JUDGMENT', mechanism: 'Token cross-namespace mapping integrity — dispatch agent DS-wide 全掃 semantic.css 12-hue mapping(L246-273)逐 hue 驗 →primitive step 正確;無 deterministic hook(2026-05-31 infra-audit 修假分類,原誤標 HOOK-ENFORCED 卻無 cite hook)' },
  56: { tier: 'HOOK-ENFORCED', mechanism: 'chrome_header_dispatcher.sh → lib/_app_shell_primary_header_consistency.sh BLOCKER(exit 2 傳播,2026-05-31 修 stdin parsing + dispatcher propagate;escape @app-shell-primary-header-allow)' },
  // Group Q* — Consumer enforcement / fork-context / packaging(57-88,2026-05-30 補滿 per codex Phase B P1:原 56/88 假完整 fix)
  57: { tier: 'HOOK-ENFORCED', mechanism: 'check_ds_anchor_preflight.sh write-time WARN(exit 0,inject context 讓 AI 自決,L130-132;M29 anchor)+ stop_self_audit Stop hook backstop。2026-05-31 誠實標 WARN(原寫「soft BLOCKER」是矛盾詞)' },
  58: { tier: 'HOOK-ENFORCED', mechanism: 'check_plugin_fork_health.sh SessionStart：r1 驗證 committed provider-neutral dispatcher + exact installed fork manifest；legacy plugin 僅相容性回饋、不能滿足治理健康契約' },
  59: { tier: 'HOOK-ENFORCED', mechanism: 'check_substantive_edit_approval_preflight.sh scope apps/** + node_modules/@qijenchen' },
  60: { tier: 'HOOK-ENFORCED', mechanism: 'check_propose_without_benchmark.sh UserPromptSubmit(M26)' },
  61: { tier: 'HOOK-ENFORCED', mechanism: 'check_item_list_gap.sh + check_datatable_invariants.sh r2(原 check_data_table_size_num_to_meta_width.sh;M16 + M23c)WARN(exit 0,非 block)+ audit-time grep backstop' },
  62: { tier: 'PURE-JUDGMENT', mechanism: 'Fork Netlify onboarding canonical — dispatch 必 DS-wide enumerate netlify.toml / manager-head / setup-netlify / CLAUDE.md Access-control 段' },
  63: { tier: 'HOOK-ENFORCED', mechanism: 'inject_deploy_url_after_push.sh PostToolUse + scripts/deploy-url.mjs' },
  64: { tier: 'CI-ENFORCED', mechanism: 'standard five-step live observation:PR tree=squash-merge tree=tag tree + immutable release/BOM/npm provenance;no candidate freeze,external activation,offline attestor,or import ceremony' },
  65: { tier: 'HOOK-ENFORCED', mechanism: 'check_chrome_header_avatar_canonical.sh PreToolUse multiline regex BLOCKER(exit 2,2026-05-31 folded-hook-audit 升級;verified clean on canonical + env escape CLAUDE_BYPASS_CHROME_HEADER_AVATAR)' },
  66: { tier: 'CI-ENFORCED', mechanism: 'repository_dispatch mirror + exact template/work-management lockfiles and Verify consumer required checks;dim64/66 share one atomic live-observation digest' },
  67: { tier: 'HOOK-ENFORCED', mechanism: 'check_sidebar_menu_button_implicit_wrap.sh PreToolUse multiline regex BLOCKER(exit 2,2026-05-31 folded-hook-audit 升級;verified clean on canonical + env escape CLAUDE_BYPASS_SIDEBAR_MENU_BUTTON_WRAP)' },
  68: { tier: 'PURE-JUDGMENT', mechanism: 'Stories-vs-spec drift systematic — dispatch 必 DS-wide 全 stories/anatomy/principles grep anti-spec pattern(@canonical-pattern / @anti-pattern marker)' },
  69: { tier: 'HOOK-ENFORCED', mechanism: 'check_consumer_app_invariants.sh r1_no_ds_catalog PostToolUse BLOCKER(原 check_consumer_no_ds_catalog.sh,2026-06-11 prune merge)' },
  70: { tier: 'HOOK-ENFORCED', mechanism: 'check_consumer_app_invariants.sh r2_story_baseline PostToolUse BLOCKER + ds-story-manifest.json(原 check_consumer_story_baseline.sh)' },
  71: { tier: 'HOOK-ENFORCED', mechanism: 'check_consumer_app_invariants.sh r3_ds_primitive_misuse BLOCKER(原 check_consumer_ds_primitive_misuse.sh)' },
  72: { tier: 'PURE-JUDGMENT', mechanism: 'DS API surface tightening per-component review(tightening-roadmap.md)— dispatch 必 DS-wide enumerate ALL component API surface' },
  73: { tier: 'HOOK-ENFORCED', mechanism: 'check_full_story_visual_interaction_sweep.sh(length === manifest.totalStories,sample = reject)' },
  74: { tier: 'HOOK-ENFORCED', mechanism: 'check_overlay_open_focus_escape_probe.sh BLOCKER' },
  75: { tier: 'HOOK-ENFORCED', mechanism: 'check_plugin_fork_health.sh r2_plugin_freshness SessionStart fork-user(原 check_plugin_freshness.sh)' },
  76: { tier: 'HOOK-ENFORCED', mechanism: 'check_escape_marker_abuse.sh(≥3 distinct OR ≥5 total BLOCK [consumer] + per-line justification gate 空理由 BLOCK [consumer+DS] + 廣義 *-allow regex,2026-05-31)' },
  77: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(77) },
  78: { tier: 'HOOK-ENFORCED', mechanism: 'check_codex_brief_invariants.sh 4th invariant(禁列檔)' },
  79: { tier: 'HOOK-ENFORCED', mechanism: 'check_tailwind_wildcard_in_docs.sh P0 BLOCKER' },
  80: { tier: 'HOOK-ENFORCED', mechanism: 'check_storybook_addon_packaging.sh r1_addon_subdir_ship P0 BLOCKER(原 check_addon_subdir_ship.sh,2026-06-11 prune merge)' },
  81: { tier: 'HOOK-ENFORCED', mechanism: 'check_storybook_addon_packaging.sh r2_preset_cjs P0 BLOCKER(原 check_storybook_addon_preset_cjs.sh)' },
  82: { tier: 'HOOK-ENFORCED', mechanism: 'check_consumer_app_invariants.sh r4_app_story_title P0 BLOCKER(原 check_consumer_app_story_title.sh)' },
  83: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(83) },
  84: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(84) },
  85: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(85) },
  86: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(86) },
  87: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(87) },
  88: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(88) },
  89: { tier: 'HOOK-ENFORCED', mechanism: 'check_tabs_content_chrome_body_double_gap.sh(write-time P0:Check 1 tabs double-gap + Check 2 overlay-body fixed macro gap)+ audit-time DS-wide sweep per SKILL dim row' },
  90: { tier: 'PURE-JUDGMENT', mechanism: 'LLM layout-space macro 合規 DS-wide 全掃(NO-SAMPLE;regex 分不出 macro/micro);判準 = layoutSpace.spec.md「該用 token vs 刻意固定」邊界段;每 finding 對抗二次驗證(2026-07-01 錨:35 raw → 8 confirmed)' },
  91: { tier: 'DETERMINISTIC', mechanism: deterministicMechanism(91) },
}

// expected dim count = canonical audit skill; missing/duplicate/interior-gap rows fail closed。
// 2026-05-30 codex Phase B P1 fix:禁寫死 56(原假完整,只覆蓋 56/88)。讀真值 88;
// 新增 dim 若未補 COVERAGE entry → gap → --check fail-closed(exit 1),強制分類。
// SSOT 優先序:audit-dims-dispatch.json `.total`(dispatch-audit-dims.mjs 從 SKILL.md parse 的權威 dim 數)
// → fallback COVERAGE map size。讀 dispatch total 才能 catch「SKILL 加新 dim 但 COVERAGE 沒補」→ gap → fail-closed。
let expected
try {
  const canonicalAuditSkill = fs.readFileSync(path.join(ROOT, 'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md'), 'utf8')
  const dimensions = [...canonicalAuditSkill.matchAll(/^\|\s*(\d+)\s*\|\s*\*\*/gm)].map((match) => Number(match[1]))
  if (dimensions.length === 0) throw new Error('no canonical dimension rows were parsed')
  expected = dimensions.at(-1)
  const exactDimensions = Array.from({ length: expected }, (_, index) => index + 1)
  if (JSON.stringify(dimensions) !== JSON.stringify(exactDimensions)) {
    throw new Error(`canonical dimension IDs must be exactly 1..${expected} once each in order`)
  }
  const coverageDimensions = Object.keys(COVERAGE).map(Number)
  if (JSON.stringify(coverageDimensions) !== JSON.stringify(exactDimensions)) {
    throw new Error(`coverage classification IDs must exactly match canonical dimensions 1..${expected}`)
  }
  for (const dim of exactDimensions) validateAuditCoverageEntry(COVERAGE[dim], { dim })
} catch (error) {
  console.error(`❌ canonical audit dimension inventory invalid:${error.message}`)
  process.exit(1)
}

try {
  const planPath = path.join(ROOT, 'scripts/deep-audit-deterministic-plan.json')
  const planInfo = fs.lstatSync(planPath)
  if (!planInfo.isFile() || planInfo.isSymbolicLink() || planInfo.nlink !== 1) {
    throw new Error('deterministic plan must be one single-link regular non-symlink file')
  }
  const planState = loadDeterministicDeepAuditPlan({ repoRoot: ROOT, planPath })
  const classifiedDimensions = Object.entries(COVERAGE)
    .filter(([, entry]) => entry.tier === 'DETERMINISTIC')
    .map(([dim]) => Number(dim))
    .sort((left, right) => left - right)
  const plannedDimensions = [...planState.dimensionByNumber.keys()].sort((left, right) => left - right)
  if (JSON.stringify(classifiedDimensions) !== JSON.stringify(plannedDimensions)) {
    throw new Error(`deterministic matrix/plan dimensions differ:matrix=${classifiedDimensions.join(',')} plan=${plannedDimensions.join(',')}`)
  }
} catch (error) {
  console.error(`❌ deterministic audit plan invalid:${error.message}`)
  process.exit(1)
}
const counts = { DETERMINISTIC: 0, 'HOOK-ENFORCED': 0, 'PURE-JUDGMENT': 0, UNKNOWN: 0, 'CI-ENFORCED': 0 }
const gaps = []

for (let i = 1; i <= expected; i++) {
  const entry = COVERAGE[i]
  if (!entry) { counts.UNKNOWN++; gaps.push({ dim: i, reason: 'no classification entry' }); continue }
  counts[entry.tier] = (counts[entry.tier] || 0) + 1
  // Optional gap flag: PURE-JUDGMENT 必 含 'DS-wide' + 'sample' anti-keyword in mechanism
  if (entry.tier === 'PURE-JUDGMENT' && !/DS-wide/i.test(entry.mechanism)) {
    gaps.push({ dim: i, reason: 'PURE-JUDGMENT mechanism missing explicit DS-wide directive' })
  }
}

// M4 vaporware lint(2026-05-30 per laziness-hunt P1):cited script/hook 必存在 disk。堵「(planned) 未實作 hook」
// + folded-drift(SKILL/matrix 引用 standalone hook 已 fold 進 lib 卻沒更新)。標 DETERMINISTIC/HOOK 卻指向不
// 存在的東西 = 紙上保證(綠燈 ≠ 真有兜底)。
// retired hook 不 fire = 不該支撐 HOOK-ENFORCED claim。Active owner 必須是 canonical hook/lib 的
// 真實檔案；其他 active source 裡只出現 basename/comment 不算。`原 <name>` 只作明確 historical label。
const canonicalHooks = path.join(ROOT, 'packages/design-system/ds-canonical/hooks')
let registeredHooks
try {
  const registrationsPath = path.join(canonicalHooks, 'registrations.json')
  const info = fs.lstatSync(registrationsPath)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('registrations must be a single-link regular file')
  const registrations = JSON.parse(fs.readFileSync(registrationsPath, 'utf8'))
  if (!registrations?.hooks || typeof registrations.hooks !== 'object' || Array.isArray(registrations.hooks)) throw new Error('registrations hooks map is missing')
  registeredHooks = new Set()
  for (const groups of Object.values(registrations.hooks)) {
    if (!Array.isArray(groups)) throw new Error('registration event groups must be arrays')
    for (const group of groups) {
      if (!Array.isArray(group?.hooks)) throw new Error('registration group hooks must be arrays')
      for (const descriptor of group.hooks) {
        if (descriptor?.kind !== 'hook' || typeof descriptor.hook !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(descriptor.hook)) {
          throw new Error('registration descriptor is not one closed hook filename')
        }
        registeredHooks.add(descriptor.hook)
      }
    }
  }
  if (registeredHooks.size === 0) throw new Error('registration hook set is empty')
} catch (error) {
  console.error(`❌ canonical hook registrations invalid:${error.message}`)
  process.exit(1)
}

const safeHookFile = (relativePath) => {
  const absolute = path.join(canonicalHooks, relativePath)
  try {
    const info = fs.lstatSync(absolute)
    return info.isFile() && !info.isSymbolicLink() && info.nlink === 1
  } catch { return false }
}
const registeredRootHookExists = (name) => registeredHooks.has(name) && safeHookFile(name)
const dispatcherBindsHelper = (dispatcher, helper) => {
  if (!registeredRootHookExists(dispatcher) || !safeHookFile(`lib/${helper}`)) return false
  const executableLines = fs.readFileSync(path.join(canonicalHooks, dispatcher), 'utf8')
    .split('\n')
    .filter(line => !/^\s*#/.test(line))
  const helperReference = executableLines.some(line => line.includes(`/${helper}`) && (
    /\brun_helper\b/.test(line)
      || /\bbash\b/.test(line)
      || /\bsource\b/.test(line)
      || /^\s*["']?\$LIB_DIR\//.test(line)
  ))
  const genericInvocation = executableLines.some(line => /\bbash\s+["']?\$helper["']?/.test(line))
  return helperReference && (genericInvocation || executableLines.some(line => line.includes(`/${helper}`) && /\b(?:run_helper|bash|source)\b/.test(line)))
}
const vaporware = []
for (const [dim, entry] of Object.entries(COVERAGE)) {
  if (/\(planned\)|（planned）/i.test(entry.mechanism)) { vaporware.push({ dim, reason: `「(planned)」未實作: ${entry.mechanism.slice(0, 48)}` }); continue }
  for (const m of entry.mechanism.matchAll(/scripts\/([\w-]+\.mjs)/g)) {
    if (!fs.existsSync(path.join(ROOT, 'scripts', m[1]))) vaporware.push({ dim, reason: `cited script 不存在: scripts/${m[1]}` })
  }
  // hook 存在性 / 紙上-hook check 只對宣稱 hook 兜底的 tier(HOOK-ENFORCED);PURE-JUDGMENT 的 mechanism
  // 可在說明文字提「原 check_X retired」= 非 enforcement claim,不該被當 vaporware(2026-05-31 修 dim22 reclassify 後誤抓)。
  if (entry.tier === 'HOOK-ENFORCED') {
    const citedHooks = [...entry.mechanism.matchAll(/\b([A-Za-z0-9_][A-Za-z0-9_-]*\.sh)\b/g)]
    const activeCitedHooks = citedHooks.filter((match) => {
      const prefix = entry.mechanism.slice(Math.max(0, match.index - 12), match.index)
      return !/(?:原(?:寫|從|名)?|retired)\s*$/i.test(prefix)
    })
    const rootHooks = []
    const helpers = []
    for (const match of activeCitedHooks) {
      const prefix = entry.mechanism.slice(Math.max(0, match.index - 5), match.index)
      if (match[1].startsWith('_') || /lib\/$/.test(prefix)) helpers.push(match[1])
      else rootHooks.push(match[1])
    }
    for (const hook of [...new Set(rootHooks)]) {
      if (!registeredRootHookExists(hook)) vaporware.push({ dim, reason: `cited active hook is not a registered single-link canonical owner: ${hook}` })
    }
    const dispatchers = [...new Set(rootHooks.filter(hook => /dispatcher\.sh$/.test(hook)))]
    for (const helper of [...new Set(helpers)]) {
      if (!dispatchers.some(dispatcher => dispatcherBindsHelper(dispatcher, helper))) {
        vaporware.push({ dim, reason: `cited lib helper is not sourced/executed by a cited registered dispatcher: ${helper}` })
      }
    }
    if (activeCitedHooks.length === 0) {
      vaporware.push({ dim, reason: `HOOK-ENFORCED 卻未 cite 任何 hook 檔名(紙上 hook): ${entry.mechanism.slice(0, 50)}` })
    }
  }
}

const report = {
  schemaVersion: 1,
  expected_dims: expected,
  classified: expected - counts.UNKNOWN,
  tier_counts: counts,
  gaps,
  coverage_by_dim: COVERAGE,
}

// PNG P3.1(2026-07-16):穩定 rule-ID + Critical 初始指派(id 永不重用;critical 初始 = 有機械強制者
//   〔DETERMINISTIC/HOOK-ENFORCED〕,PURE-JUDGMENT 初始 non-critical — 後續逐 dim 細化只升不降)。
for (const [n, d] of Object.entries(COVERAGE)) {
  d.id = 'DS-DIM-' + String(n).padStart(3, '0')
  if (d.critical === undefined) d.critical = d.tier !== 'PURE-JUDGMENT'
}

const OUTPUT_DIR = path.join(ROOT, 'generated/governance')
const coverageOut = path.join(OUTPUT_DIR, 'audit-coverage-matrix.json')
const expectedOutput = `${JSON.stringify(report, null, 2)}\n`
let outputDrift = null
if (CHECK) {
  if (!fs.existsSync(coverageOut)) outputDrift = 'missing deterministic coverage artifact'
  else if (fs.readFileSync(coverageOut, 'utf8') !== expectedOutput) outputDrift = 'deterministic coverage artifact differs from canonical inputs'
} else {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(coverageOut, expectedOutput)
}

console.log('═════════════════════════════════════════════════════')
console.log(`▶ Audit Coverage Matrix(${expected} dims anti-sample tiers)`)
console.log(`   DETERMINISTIC(deterministic script chain): ${counts.DETERMINISTIC}`)
console.log(`   HOOK-ENFORCED(write-time PostToolUse): ${counts['HOOK-ENFORCED']}`)
console.log(`   PURE-JUDGMENT(AI but DS-wide全 file enumerated): ${counts['PURE-JUDGMENT']}`)
console.log(`   CI-ENFORCED(protected external readback): ${counts['CI-ENFORCED']}`)
console.log(`   UNKNOWN: ${counts.UNKNOWN}`)
console.log('═════════════════════════════════════════════════════')

if (gaps.length) {
  console.error('\n⚠️  Coverage gaps:')
  for (const g of gaps) console.error(`   Dim ${g.dim}: ${g.reason}`)
}
if (vaporware.length) {
  console.error('\n🚨 VAPORWARE(cited script/hook 不存在 — 紙上保證,綠燈≠真兜底):')
  for (const v of vaporware) console.error(`   Dim ${v.dim}: ${v.reason}`)
}
if (outputDrift) console.error(`\n🚨 COVERAGE ARTIFACT DRIFT: ${outputDrift}`)
if (CHECK && (gaps.length || vaporware.length || outputDrift)) process.exit(1)
console.log(`\n✅ All ${expected} dims classified + cited mechanisms resolve on disk`)
process.exit(0)
