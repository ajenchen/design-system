#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 每個 provider 的產生檢視,都派工得到**該 provider 適用的**每一個 hook 群組;沒有派工入口的群組等於整群 hook 從未被呼叫
 *   紅: 從任一 provider 檢視刪掉最後一群的派工命令(或把某群的 --group 序號改掉)→ 本閘必須指名該 event/群組序號與該群的 hook 名單並紅
 *   綠: 檢視派工的序號集合 = 該 provider 適用的群組序號集合時必須綠。**包含「該群唯一的 hook 對這個 provider 不適用」時不得報紅** —— 這一格正是本閘第一版對 codex 報假紅的地方;selftest 以合成文件雙向驗,不看真檔
 *
 * ── 為什麼有這支 ──
 *
 * 2026-09-24:`check_substantive_edit_approval_preflight.sh`(P0 批准前置閘)從舊的
 * `Edit|Write|MultiEdit` 群組搬到新的 `Edit|Write|MultiEdit|Bash` 群組,也就是 PreToolUse 第 8 群
 * (序號 7)。registrations.json 改對了,git index 裡的 `.claude/settings.json` 也對了,
 * **但工作樹那份還停在 7 群(序號 0–6)**,而 Claude Code 讀的是工作樹那份。
 *
 * 結果:那道閘在舊群組已經被移走、新群組沒有任何入口 —— **整個 session 零覆蓋,而且零訊號**。
 * 當時有 11 個受治理檔案被編輯,事後被寫成「都通過了 P0 閘」,實際上是「沒有任何東西攔它」。
 * 這正是 M37 第 ④ 與第 ⑦ 種形狀:**「這道閘存在」被當成「這道閘有人呼叫」,
 * 「沒有被擋下」被當成「通過了」**。
 *
 * `gate-reachability-invariant.mjs` 管的是「這支腳本有沒有被執行面呼叫」,
 * `ci-gate-coverage.mjs` 管的是「這個 npm script 有沒有接進 CI」。
 * 兩支都看不到這裡:hook 明明被 registrations.json 呼叫,斷掉的是**產生檢視那一層**。
 *
 * ── 為什麼不做成 runtime 自檢 ──
 *
 * 派工器 `run-provider-hook.mjs` 是被那份過期檢視叫起來的,過期檢視根本不會叫到缺掉的那一群,
 * 所以「缺群組」在 runtime 是**結構上不可能被觀察到**的事件 —— 拿 runtime 當儀器就是全盲。
 * 唯一能看見的位置是離線比對兩份文件,所以做成 required CI 的閘。
 *
 * 用法: node scripts/provider-view-group-reachability-invariant.mjs [--selftest]
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasUsableVersionedTranscript } from './lib/provider-runtime-contract.mjs'
import { resolveProviderHookEligibility } from '../packages/governance/src/provider-review-binding.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const REGISTRY = 'packages/governance/canonical/providers.json'

/**
 * 從一個 provider 檢視文件裡,取出每個 event 實際會派工的群組序號集合。
 *
 * 刻意只認派工命令裡明寫的 `--event <E> --group <N>`,不數陣列長度 —— 數長度就是拿
 * 「有幾個物件」代替「派工到哪幾群」,又是一個代理(順序對不上時會靜默放行)。
 */
export function readDispatchedGroups(view) {
  const out = new Map()
  for (const [event, groups] of Object.entries(view?.hooks || {})) {
    const seen = new Set()
    for (const group of groups || []) {
      for (const entry of group?.hooks || []) {
        const command = String(entry?.command ?? '')
        const m = command.match(/--event\s+(\S+)\s+--group\s+(\d+)/)
        if (!m) continue
        if (m[1] !== event) continue
        seen.add(Number(m[2]))
      }
    }
    out.set(event, seen)
  }
  return out
}

/**
 * 純判定:回傳所有「該 provider 應該派工、但檢視派工不到」與「檢視派工了、却不該派工」的群組。
 * 兩個方向都要,因為序號錯位會同時產生一缺一多,只查一邊會把錯位讀成正常。
 *
 * ⚠️ **「應該派工」不等於「registrations 裡有這一群」。**
 * 這支閘第一版就是拿後者當前者,結果對 codex 報出假紅 —— codex 的
 * `runtime.transcript.stability` 是 `unstable-opaque`,而第 8 群唯一的 hook 宣告
 * `transcript: "stable-required"`,依 `resolveProviderHookEligibility` 它對 codex **本來就不適用**,
 * 所以那一群在 codex 檢視裡不存在是正確的。這正是本閘自己要防的 M37:
 * 用一個「當時剛好成立的觀察量」代替真正要保證的性質。現在改成逐 provider 試算適用性。
 */
export function findGroupReachabilityDrift({ registrations, views, isEligible = () => true }) {
  const problems = []
  const declared = registrations?.hooks || {}
  const eligible = isEligible
  for (const { providerId, view } of views) {
    const dispatched = readDispatchedGroups(view)
    const events = new Set([...Object.keys(declared), ...dispatched.keys()])
    for (const event of [...events].sort()) {
      const groups = declared[event] || []
      const want = new Set(groups
        .map((group, index) => [index, (group.hooks || []).some((descriptor) => eligible(providerId, descriptor))])
        .filter(([, any]) => any)
        .map(([index]) => index))
      const have = dispatched.get(event) || new Set()
      for (const index of [...want].sort((a, b) => a - b)) {
        if (have.has(index)) continue
        const group = groups[index] || {}
        problems.push({
          providerId,
          event,
          groupIndex: index,
          kind: 'unreachable',
          matcher: group.matcher ?? '<無>',
          hooks: (group.hooks || []).map((h) => h.hook || h.kind || '<未命名>'),
        })
      }
      for (const index of [...have].sort((a, b) => a - b)) {
        if (want.has(index)) continue
        problems.push({
          providerId,
          event,
          groupIndex: index,
          kind: 'orphan',
          matcher: '<檢視自帶>',
          hooks: [],
        })
      }
    }
  }
  return problems
}

function loadRealDocuments() {
  const registry = JSON.parse(readFileSync(join(ROOT, REGISTRY), 'utf8'))
  const registrations = JSON.parse(
    readFileSync(join(ROOT, registry.canonical.hookRegistrations), 'utf8'),
  )
  const views = []
  const skipped = []
  for (const provider of registry.providers || []) {
    if (!provider.capabilities?.nativeHooks) continue
    if (provider.hookConfigFormat !== 'json' || !provider.hookConfig) continue
    const path = join(ROOT, provider.hookConfig)
    if (!existsSync(path)) {
      skipped.push(`${provider.id}:${provider.hookConfig}:檔案不存在`)
      continue
    }
    views.push({ providerId: provider.id, path: provider.hookConfig, view: JSON.parse(readFileSync(path, 'utf8')) })
  }
  return { registrations, registry, views, skipped }
}

function selftest() {
  const registrations = {
    hooks: {
      PreToolUse: [
        { matcher: 'Edit', hooks: [{ kind: 'hook', hook: 'a.sh' }] },
        { matcher: 'Bash', hooks: [{ kind: 'hook', hook: 'b.sh' }] },
        { matcher: 'Edit|Bash', hooks: [{ kind: 'hook', hook: 'approval.sh' }] },
      ],
      Stop: [{ matcher: '', hooks: [{ kind: 'hook', hook: 's.sh' }] }],
    },
  }
  const entry = (event, index) => ({
    matcher: 'x',
    hooks: [{ type: 'command', command: `node scripts/run-provider-hook.mjs --provider claude --event ${event} --group ${index}` }],
  })
  const complete = {
    hooks: {
      PreToolUse: [entry('PreToolUse', 0), entry('PreToolUse', 1), entry('PreToolUse', 2)],
      Stop: [entry('Stop', 0)],
    },
  }
  const stale = {
    hooks: {
      PreToolUse: [entry('PreToolUse', 0), entry('PreToolUse', 1)],
      Stop: [entry('Stop', 0)],
    },
  }
  // 錯位:群組數一樣多,但序號跳掉 2 改成 5。只數長度的實作會在這一格靜默放行。
  const misnumbered = {
    hooks: {
      PreToolUse: [entry('PreToolUse', 0), entry('PreToolUse', 1), entry('PreToolUse', 5)],
      Stop: [entry('Stop', 0)],
    },
  }
  // 第 4 格的專用檢視:只派工 0/1,第 2 群缺席
  const cases = [
    ['齊全 → 必須綠', complete, 0, null],
    ['少掉最後一群(2026-09-24 實況)→ 必須指名 group 2 並紅', stale, 1, 'approval.sh'],
    ['群組數相同但序號錯位 → 必須紅(一缺一多)', misnumbered, 2, 'approval.sh'],
  ]
  let failed = 0
  // 適用性那一維:假設 approval.sh 對 'codex' 不適用。同一份 stale 檢視 ——
  // 對 claude 必須紅(它該派工卻沒有),對 codex 必須綠(本來就不該派工)。
  const eligibility = (providerId, descriptor) => !(providerId === 'codex' && descriptor.hook === 'approval.sh')
  const redForClaude = findGroupReachabilityDrift({
    registrations, views: [{ providerId: 'claude', view: stale }], isEligible: eligibility,
  })
  const greenForCodex = findGroupReachabilityDrift({
    registrations, views: [{ providerId: 'codex', view: stale }], isEligible: eligibility,
  })
  if (redForClaude.length === 1 && greenForCodex.length === 0) {
    console.log('  ✓ 該群唯一的 hook 對某 provider 不適用 → 那個 provider 不得報紅,其他的照紅(codex 假紅的對照組)')
  } else {
    failed += 1
    console.error(`  ✗ 適用性維度 — claude 實得 ${redForClaude.length}(預期 1)、codex 實得 ${greenForCodex.length}(預期 0)`)
  }
  for (const [name, view, expected, mustName] of cases) {
    const problems = findGroupReachabilityDrift({ registrations, views: [{ providerId: 'claude', view }] })
    const ok = problems.length === expected
      && (!mustName || problems.some((p) => p.hooks.includes(mustName)))
    if (!ok) {
      failed += 1
      console.error(`  ✗ ${name} — 實得 ${problems.length} 筆: ${JSON.stringify(problems)}`)
    } else {
      console.log(`  ✓ ${name}`)
    }
  }
  if (failed) {
    console.error(`\nselftest 失敗 ${failed} 格`)
    process.exit(1)
  }
  console.log('\nselftest 全過(綠側與紅側都驗到)')
}

if (process.argv.includes('--selftest')) {
  selftest()
} else {
  const { registrations, registry, views, skipped } = loadRealDocuments()
  for (const line of skipped) console.warn(`略過: ${line}`)
  // 逐 provider 試算適用性 —— 與產生器用的是**同一支**函式,不自己重寫規則。
  const isEligible = (providerId, descriptor) => {
    try {
      return resolveProviderHookEligibility({
        registry, providerId, descriptor, hasUsableVersionedTranscript, allowDeferredSelection: true,
      }).eligible === true
    } catch { return true }  // 判不出來就當適用(fail closed 到「要求派工」這一邊)
  }
  const problems = findGroupReachabilityDrift({ registrations, views, isEligible })
  if (!problems.length) {
    const summary = views.map((v) => `${v.providerId}(${v.path})`).join('、')
    console.log(`provider 檢視群組可達性: 全部對齊 — ${summary}`)
    process.exit(0)
  }
  console.error('🚨 provider 產生檢視有群組派工不到 —— 這些 hook 在該 provider 的 session 裡完全不會被呼叫:\n')
  for (const p of problems) {
    if (p.kind === 'unreachable') {
      console.error(`  [${p.providerId}] ${p.event} 第 ${p.groupIndex} 群(matcher: ${p.matcher})沒有派工入口`)
      console.error(`      失去覆蓋的 hook: ${p.hooks.join('、') || '<空群組>'}`)
    } else {
      console.error(`  [${p.providerId}] ${p.event} 第 ${p.groupIndex} 群:檢視派工了,但 registrations.json 沒有這一群`)
    }
  }
  // 診斷:區分「送出去的那份就是壞的」與「只有這台機器的工作樹過期」—— 後者在 CI 不會發生,
  // 但對**正在跑的 session** 同樣致命(Claude Code 開場就把工作樹那份讀進去凍住)。
  for (const { providerId, path } of views) {
    let indexed = null
    try {
      indexed = execFileSync('git', ['show', `:${path}`], { cwd: ROOT, encoding: 'utf8' })
    } catch { indexed = null }
    if (indexed === null) continue
    const onDisk = readFileSync(join(ROOT, path), 'utf8')
    if (indexed !== onDisk) {
      console.error(`  ℹ️  [${providerId}] ${path} 的 git index 版本與工作樹不同`)
      console.error('      → 送出去的那份可能已經是對的,但**這個 session 讀的是工作樹那份**,所以仍然沒有覆蓋。')
    }
  }
  console.error('\n修法: 跑 `npm run governance:generate` 重新產生 provider 檢視並提交。')
  console.error('注意: Claude Code 在 session 開始時就讀進 settings.json,改完必須重開 session 才會生效。')
  process.exit(1)
}
