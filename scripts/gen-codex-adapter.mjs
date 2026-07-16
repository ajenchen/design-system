#!/usr/bin/env node
// gen-codex-adapter.mjs — PNG P2.2/P2.3:Codex 原生 surface adapter 生成器(SSOT 零複製)
//
// 依 P2.1 研究報告(.claude/planning/2026-07-16-png-p2-codex-research.md,官方文件 + live 實測):
//   - Codex 支援 repo-level `.codex/hooks.json`(10 events,schema 與 Claude Code 同構,
//     PreToolUse exit 2 可 block — probe C 實測)+ `.agents/skills/<name>/SKILL.md`
//     (repo-level discovery — probe B 實測,與 Claude SKILL.md 同構)。
//   - Trust 閘:未 trust 的 repo hooks 在非互動 exec = **靜默跳過**(fail-open)→ hooks
//     只是加速器,最終 authority = release:preflight + CI(ADR-3)。
//
// 生成物(對齊 build-fork-governance.mjs 的 generated-banner + drift-gate 模式):
//   1. `.codex/hooks.json` — 投影 provider-neutral eligible hooks,command **直指同一份
//      `.claude/hooks/*.sh`(SSOT 零複製)**;event/matcher 從 `.claude/settings.json` 機械
//      derive(不手寫第二份 mapping)。
//   2. `.agents/skills/independent-review/SKILL.md` — codex-side second-opinion driver
//      (P2.3;判準指路 audit-prompts.md 同 rubric,禁自建規範;fail-closed)。
//
// Eligibility 判準(P2.2,逐支人工讀 source 驗證 + 本檔機械 guard 鎖住):
//   只依賴 stdin tool_input(file_path / content / new_string / command)+
//   CLAUDE_PROJECT_DIR fallback pwd;**不硬依賴 Claude transcript**(transcript 只准
//   optional-escape 用途,缺失時行為必須 fail-closed 更嚴,不得 fail-open)。
//
// 用法:
//   node scripts/gen-codex-adapter.mjs           # 生成 .codex/ + .agents/
//   node scripts/gen-codex-adapter.mjs --check   # 重生比對 drift(mirror --check 家族同款)
//
// 被 build-fork-governance.mjs import(PROJECTED / buildHooksJson / buildIndependentReviewSkill)
// 生成 fork 視角投影(P2.4)— 名單單一 SSOT,fork 端不另判。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOOKS_DIR = join(ROOT, '.claude/hooks')

// ── P2.2 eligibility 名單(2026-07-16 逐支讀 source 驗證;verifyEligibility() 機械鎖)──
export const PROJECTED = [
  {
    hook: 'check_tailwind_wildcard_in_docs.sh',
    transcript: 'none',
    eligibility: 'stdin-only(tool_name / file_path / new_string|content);無 transcript / 無環境依賴',
  },
  {
    hook: 'check_benchmark_citation.sh',
    transcript: 'none',
    eligibility: 'stdin-only + 讀寫入目標檔檔頭 allowlist;無 transcript / 無環境依賴',
  },
  {
    hook: 'check_main_branch_workbench.sh',
    transcript: 'optional-escape',
    eligibility:
      'stdin file_path + git branch(CLAUDE_PROJECT_DIR fallback pwd);transcript 僅 escape-phrase 偵測用,缺失 = fail-closed 更嚴(escape 走 CLAUDE_BYPASS_MAIN_WORKBENCH=1)',
  },
]
// 不合格者報告(P2.2 要求「不合格者不投影,記報告」;本輪 3 候選全過 → 空。
// 之後淘汰者記 { hook, reason } 於此,留審計軌跡。)
export const NOT_PROJECTED = []

const sha16 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)

// ── event/matcher 從 DS settings.json 機械 derive(SSOT;不手寫第二份 mapping)──
function registrationsOf(hookName) {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude/settings.json'), 'utf8'))
  const regs = []
  for (const ev of Object.keys(settings.hooks || {})) {
    for (const g of settings.hooks[ev]) {
      for (const h of g.hooks || []) {
        if ((h.command || '').includes(hookName)) regs.push({ event: ev, matcher: g.matcher || '' })
      }
    }
  }
  return regs
}

// ── eligibility 機械 guard(drift 鎖:hook source 之後若長出硬 transcript 依賴 → FAIL)──
export function verifyEligibility() {
  const errors = []
  for (const p of PROJECTED) {
    const file = join(HOOKS_DIR, p.hook)
    if (!existsSync(file)) { errors.push(`${p.hook}: 檔案不存在於 .claude/hooks/`); continue }
    try { execSync(`bash -n '${file}'`, { stdio: 'pipe' }) } catch { errors.push(`${p.hook}: bash -n syntax error`) }
    const src = readFileSync(file, 'utf8')
    if (src.includes('CLAUDE_TRANSCRIPT_PATH') && p.transcript !== 'optional-escape') {
      errors.push(`${p.hook}: source 用到 CLAUDE_TRANSCRIPT_PATH 但名單未標 transcript:'optional-escape' — 重驗 eligibility(硬依賴 = 除名)`)
    }
    if (!src.includes('CLAUDE_TRANSCRIPT_PATH') && p.transcript === 'optional-escape') {
      errors.push(`${p.hook}: 名單標 optional-escape 但 source 已無 transcript 引用 — 名單降級為 'none'(對齊事實)`)
    }
    if (registrationsOf(p.hook).length === 0) {
      errors.push(`${p.hook}: 未註冊於 .claude/settings.json — event mapping 無 SSOT 可 derive`)
    }
  }
  return errors
}

// ── .codex/hooks.json builder(DS repo 與 fork 共用;差異只在 commandFor path)──
// ⚠️ codex hooks 檔 schema 是 strict(live 實測 2026-07-16:top-level 只准 `description` +
// `hooks`,unknown field `_generated` → 「failed to parse hooks config」整檔靜默不載)→
// generated banner(by/warning/source/digest/trust)全部收進 schema-native `description` 字串。
export function buildHooksJson({ entries = PROJECTED, commandFor, sourceNote }) {
  const hooks = {}
  const digests = []
  for (const p of entries) {
    digests.push(`${p.hook}=${sha16(readFileSync(join(HOOKS_DIR, p.hook)))}`)
    for (const reg of registrationsOf(p.hook)) {
      hooks[reg.event] = hooks[reg.event] || []
      let group = hooks[reg.event].find((g) => g.matcher === reg.matcher)
      if (!group) { group = { matcher: reg.matcher, hooks: [] }; hooks[reg.event].push(group) }
      group.hooks.push({ type: 'command', command: commandFor(p.hook) })
    }
  }
  const description =
    '_generated: scripts/gen-codex-adapter.mjs — 禁手改(release:preflight `gen-codex-adapter --check` 驗 drift;重生 `node scripts/gen-codex-adapter.mjs`)。' +
    `source: ${sourceNote}。` +
    `sourceDigest: ${digests.join(', ')}。` +
    'trust: Codex per-hook hash trust — TUI /hooks 一次 trust 或 exec 加 --dangerously-bypass-hook-trust;未 trust = 非互動下靜默跳過(fail-open)→ hooks 僅加速器,最終 authority = release:preflight + CI(AGENTS.md 檔頭宣告)。' +
    'eligibility 判準與逐支理由 SSOT = gen-codex-adapter.mjs PROJECTED。'
  return { description, hooks }
}

// ── .agents/skills/independent-review/SKILL.md builder(P2.3;fork 用 transform 改 path)──
export function buildIndependentReviewSkill({ transform = (s) => s } = {}) {
  const body = `---
name: independent-review
description: Independent second-opinion review of changes authored by another AI provider(如 Claude)。Use when asked to review, audit, or give a second opinion on a diff, branch, or component change in this repo.
---

<!-- _generated: scripts/gen-codex-adapter.mjs(PNG P2.3)。禁手改 — release:preflight \`gen-codex-adapter --check\` 驗 drift;改內容改生成器後重生 \`node scripts/gen-codex-adapter.mjs\`。 -->

# Independent second-opinion review(codex-side driver)

**任務**:review「另一個 provider(通常 Claude)所著的變更」— 你是 reviewer,不是 author。Canonical 概念 = \`AGENTS.md\`「Independent second opinion」段(author provider ≠ reviewer provider;同一份判準 SSOT;fail-closed)。

## 判準(禁自建規範)

- **唯一 rubric SSOT** = \`.claude/skills/design-system-audit/references/audit-prompts.md\`(per-dim 判準;Claude 深稽核用同一份)。**禁**以你自己的 best-practice 直覺取代:rubric 沒寫的不構成 finding,rubric 有寫的不可跳過。
- rule-ID 對照:\`.claude/logs/audit-coverage-matrix.json\`(DS-DIM-001..091)。

## 流程

1. 讀 \`AGENTS.md\` + 上述 rubric(applicable dims 全讀,**禁抽樣**)。
2. 取得受審變更:brief 指定的 diff / branch / 檔案清單;無指定 → \`git diff main...HEAD\` + 變更檔全文。
3. 逐 applicable dim 套 rubric 驗證(claim-vs-code:讀真實 source,不信註解 / 文件宣稱)。
4. 只輸出 findings + 證據;可附修法建議,**不得**直接改檔(review-only)。

## 輸出格式(每 finding)

- \`rule-ID\`(DS-DIM-NNN 或 rubric 段落)/ \`severity\`(Critical / Major / Minor)/ \`evidence\`(file:line + 引文)/ \`resolution\`(建議修法一行)。
- 無 finding 的 applicable dim 也要列:\`DS-DIM-NNN: PASS(驗證方式一行)\`。
- 結尾記錄 reviewer 的 provider / model / version(如 codex CLI 版本 + model 名)。

## Fail-closed(禁靜默降級)

- rubric 檔讀不到 / diff 取不到 / 無法完成全部 applicable dims → 回 \`REVIEW-BLOCKED: <原因>\`,**禁**輸出部分結果並宣稱 compliant。
- **禁**同一 agent 假扮另一 provider 的審查(self-review ≠ independent second opinion)。
`
  return transform(body)
}

// ── CLI(import 時不執行 — build-fork-governance 消費 export)──
const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href
if (isMain) {
  const CHECK = process.argv.includes('--check')

  const eligErrors = verifyEligibility()
  if (eligErrors.length) {
    console.error('❌ CODEX-ADAPTER ELIGIBILITY FAIL(名單與 hook source 不一致):')
    for (const e of eligErrors) console.error('   - ' + e)
    process.exit(1)
  }

  // DS repo 視角:command 直指 .claude/hooks SSOT(probe C 實測此 $(git rev-parse) 形式可 fire + block)
  const hooksJson =
    JSON.stringify(
      buildHooksJson({
        commandFor: (h) => `bash "$(git rev-parse --show-toplevel)/.claude/hooks/${h}"`,
        sourceNote: '.claude/hooks/(SSOT 零複製 — command 直指同一份 .sh;event/matcher derive 自 .claude/settings.json)',
      }),
      null,
      2,
    ) + '\n'
  const skillMd = buildIndependentReviewSkill()

  const targets = [
    { path: join(ROOT, '.codex/hooks.json'), content: hooksJson },
    { path: join(ROOT, '.agents/skills/independent-review/SKILL.md'), content: skillMd },
  ]

  if (CHECK) {
    const drift = targets.filter((t) => !existsSync(t.path) || readFileSync(t.path, 'utf8') !== t.content)
    if (drift.length) {
      console.error('❌ CODEX-ADAPTER DRIFT: 生成物與 SSOT 重生結果不一致 — 跑 `node scripts/gen-codex-adapter.mjs` 並 commit:')
      for (const t of drift) console.error('   - ' + t.path.replace(ROOT + '/', ''))
      process.exit(1)
    }
    console.log(`✅ codex-adapter --check PASS:${targets.length} 生成物與 SSOT 無 drift(hooks 投影 ${PROJECTED.length} 支 / 淘汰 ${NOT_PROJECTED.length} 支)`)
  } else {
    for (const t of targets) {
      mkdirSync(dirname(t.path), { recursive: true })
      writeFileSync(t.path, t.content)
    }
    console.log('✅ codex adapter 生成:')
    console.log(`   .codex/hooks.json — ${PROJECTED.length} 支 provider-neutral hook(SSOT 零複製,直指 .claude/hooks/)`)
    for (const p of PROJECTED) console.log(`     - ${p.hook}(${registrationsOf(p.hook).map((r) => r.event).join('/')};${p.transcript === 'none' ? 'stdin-only' : 'transcript=optional-escape'})`)
    if (NOT_PROJECTED.length) for (const n of NOT_PROJECTED) console.log(`     ✗ 不投影 ${n.hook}:${n.reason}`)
    console.log('   .agents/skills/independent-review/SKILL.md — codex-side second-opinion driver(rubric = audit-prompts.md)')
    console.log('   ⚠️ trust 閘:repo hooks 未 trust 時非互動 exec 靜默跳過 — 生效需 user TUI /hooks 一次 trust 或 --dangerously-bypass-hook-trust')
  }
}
