#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: scripts/calendar-geometry-invariant.mjs 在該紅的時候會紅、該綠的時候會綠,而且走的是它真正讀檔的那條路(不是只測純函式):
 *         把 Calendar 資料夾、Tag 的 tag.tsx、utility-registry.json 複製到暫存目錄,以 `--root` 指給閘,
 *         (a) 原樣 → exit 0;(b) 逐一在**實檔**注入 `p-1.5`、`gap-0.5`、`min-h-28`、`border-l-[3px]`、列高常數改成 20、Tag md 盒高改成 28 而 Calendar 沒跟、
 *         格最小高沒算格線(回到 2026-11-25 首版的 60)、格線常數改成 2 → 各自 exit 1 且指名該 class / 常數;
 *         (c) 只在註解裡寫 `p-1.5` → 仍 exit 0(註解不算);(d) 範例檔(*.stories.tsx)與 `_` 開頭的示範殼寫 `h-80` → 仍 exit 0(不在母體);
 *         (e) 把 Calendar 資料夾清空 → exit 2(掃描母體 0 個檔 = 儀器失效,不讀成通過);(f) 閘自己的 --selftest exit 0。
 *   紅: 任一步的退出碼或指名不符預期 → 印出是哪一步並 exit 1。
 *   綠: 全部照預期時 exit 0;只寫暫存目錄、不碰 repo 檔,不讀時間,重複跑結果相同。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 閘的路徑寫成字面值、spawn 時 cwd 指 REPO:harness 來源審查(infra/governance/lib/harness-source-inventory.mjs 的
// nodePreScriptArgvState)只放行靜態字串的 node 腳本參數,path.join(...) 算出來的路徑一律判「無法審查」,test:waived-self-review 會紅。
const GATE = 'scripts/calendar-geometry-invariant.mjs'
const CAL = 'packages/design-system/src/components/Calendar'
const COPY = [CAL, 'packages/design-system/src/components/Tag/tag.tsx', 'packages/design-system/src/tokens/utility-registry.json']

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar-geometry-'))
if (!tmp || !fs.existsSync(tmp)) { console.error('✗ 暫存目錄建立失敗'); process.exit(1) }
const reset = () => {
  fs.rmSync(path.join(tmp, 'packages'), { recursive: true, force: true })
  for (const rel of COPY) fs.cpSync(path.join(REPO, rel), path.join(tmp, rel), { recursive: true })
}
const run = (...extra) => {
  const r = spawnSync(process.execPath, [GATE, '--root', tmp, ...extra], { cwd: REPO, encoding: 'utf8' })
  return { status: r.status, text: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
const edit = (rel, from, to) => {
  const file = path.join(tmp, rel)
  const before = fs.readFileSync(file, 'utf8')
  const after = before.replace(from, to)
  if (after === before) throw new Error(`錨點不在 ${rel}:${String(from).slice(0, 60)}(原始碼改了要同步改本測試)`)
  fs.writeFileSync(file, after)
}

let failed = 0
const expect = (label, r, status, mustMention = null) => {
  const ok = r.status === status && (!mustMention || r.text.includes(mustMention))
  console.log(`${ok ? '✓' : '✗'} ${label}(exit ${r.status},預期 ${status}${mustMention ? `、指名 ${mustMention}` : ''})`)
  if (!ok) { failed++; console.log(r.text.split('\n').slice(0, 6).map((l) => `    ${l}`).join('\n')) }
}

try {
  reset(); expect('(a) 現況', run(), 0)

  const main = `${CAL}/calendar.tsx`
  const geometry = `${CAL}/calendar-geometry.ts`
  const mutants = [
    ['(b1) 格子內距寫回 p-1.5', main, "'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)]", "'flex flex-col gap-[var(--calendar-gap)] p-1.5", 'p-1.5'],
    ['(b2) 列距寫回 gap-0.5', main, 'flex flex-col gap-[var(--calendar-gap)] shrink-0', 'flex flex-col gap-0.5 shrink-0', 'gap-0.5'],
    ['(b3) 格子加回 min-h-28', main, "'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)]", "'flex flex-col gap-[var(--calendar-gap)] p-[var(--calendar-gap)] min-h-28", 'min-h-28'],
    ['(b4) 事件列寫死 border-l-[3px]', main, "const tileBase = 'flex items-center h-tag-md", "const tileBase = 'border-l-[3px] flex items-center h-tag-md", 'border-l-[3px]'],
    ['(b5) 列高常數改成 20', geometry, 'CALENDAR_ROW_HEIGHT_PX = 24', 'CALENDAR_ROW_HEIGHT_PX = 20', 'CALENDAR_ROW_HEIGHT_PX'],
    ['(b6) Tag md 盒高改成 28、Calendar 沒跟', 'packages/design-system/src/components/Tag/tag.tsx', 'export const TAG_HEIGHT_PX = { sm: 20, md: 24, lg: 24 }', 'export const TAG_HEIGHT_PX = { sm: 20, md: 28, lg: 28 }', 'TAG_HEIGHT_PX.md = 28'],
    ['(b7) 格最小高沒算格線(回到首版 60)', geometry, ' + CALENDAR_GAP_PX + CALENDAR_GRID_LINE_PX', ' + CALENDAR_GAP_PX', '實得 60'],
    ['(b8) 格線常數改成 2', geometry, 'CALENDAR_GRID_LINE_PX = 1', 'CALENDAR_GRID_LINE_PX = 2', 'CALENDAR_GRID_LINE_PX 應為 1'],
  ]
  for (const [label, rel, from, to, mention] of mutants) {
    reset(); edit(rel, from, to); expect(label, run(), 1, mention)
  }

  reset(); edit(main, 'const resolvedToday = todayProp ?? new Date()', "// 舊寫法 className='p-1.5 gap-0.5'(只在註解)\n  const resolvedToday = todayProp ?? new Date()")
  expect('(c) 只在註解裡寫 p-1.5 / gap-0.5', run(), 0)

  reset()
  fs.writeFileSync(path.join(tmp, CAL, 'calendar.extra.stories.tsx'), "export const x = <div className=\"h-80 p-1.5\" />\n")
  fs.writeFileSync(path.join(tmp, CAL, '_extra-demo.tsx'), "export const y = <div className=\"h-80 gap-0.5\" />\n")
  expect('(d) 範例檔與 _ 示範殼寫 h-80 / p-1.5 不在母體', run(), 0)

  reset()
  for (const f of fs.readdirSync(path.join(tmp, CAL))) if (f.endsWith('.tsx')) fs.rmSync(path.join(tmp, CAL, f))
  expect('(e) 掃描母體 0 個檔 → 儀器失效', run(), 2, 'INSTRUMENT-FAIL')

  const self = spawnSync(process.execPath, [GATE, '--selftest'], { cwd: REPO, encoding: 'utf8' })
  expect('(f) 閘自己的 --selftest(repo 現況)', { status: self.status, text: `${self.stdout}${self.stderr}` }, 0)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(failed ? `❌ test-calendar-geometry-invariant:${failed} 步不符預期` : '✅ test-calendar-geometry-invariant PASS')
process.exit(failed ? 1 : 0)
