#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 焦點框「只有兩種幾何」不變條件(靜態掃描)
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`packages/design-system/ds-canonical/references/focus-canonical.md`「問題二」
//
// 2026-09-07 之前全 DS 同時存在**五種**焦點框幾何(全域 outline / ring-offset-1 /
// ring-offset-2 / ring-2 無 offset / ring-inset),那是 user 要求「焦點框粗細顏色圓角
// 至少要一致」做不到的根因 —— 不是哪個元件寫錯,是兩套機制並存且互不相同。
//
// 收斂後只剩兩種,而且**兩種都不需要元件自己寫值**:
//   外描邊 = 全域 `styles/base.css` 的 `:focus-visible`(元件什麼都不用寫)
//   內描邊 = `focus-ring-inset` utility(同一份幾何 SSOT)
//
// 四條:
//   (R1) 禁 `ring-offset-*` —— 它的間隙寫死白色(`--tw-ring-offset-color` 預設 #fff,
//        `inherits:false` 導致寫進 :root 完全不生效且靜默無錯),深色主題會露一圈白。
//   (R2) 禁 `focus-visible:ring-*` 當焦點框 —— 那是第二套機制。
//   (R3) 禁 `outline-none` 與 `focus-ring-inset` 出現在同一個 class 字串裡 ——
//        兩者特異性同階,誰贏取決於 Tailwind 內部排序 = 靜默失效的溫床。
//   (R4) 禁重寫全域外描邊 —— 同一份值抄第二遍(H1c 那類贅碼),改全域時會漏掉。
//   (R5) 禁手寫內描邊三件組 —— 改用 `focus-ring-inset`,否則寬度/顏色要改就得改二十處(M17)。
//
// Run: `node scripts/focus-geometry-invariant.mjs`(`--selftest` 跑正反例)

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../packages/design-system/src', import.meta.url))

const RULES = [
  { id: 'R1', re: /ring-offset-\d/, why: '間隙寫死白色,深色主題露白;改用全域外描邊或 focus-ring-inset' },
  { id: 'R2', re: /focus-visible:ring-(?:2|\[)/, why: '第二套焦點機制;外描邊什麼都不用寫,內描邊用 focus-ring-inset' },
  { id: 'R4', re: /focus-visible:outline-2(?!.*offset-\[-)/, why: '把全域外描邊抄了一遍;刪掉即可,行為不變' },
  { id: 'R5', re: /outline-offset-\[-2px\]/, why: '手寫內描邊三件組;改用 focus-ring-inset(同一份幾何 SSOT,改寬度顏色只需一處)' },
]

export function scan(files) {
  const hits = []
  for (const { path, src } of files) {
    src.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '')          // 去行尾註解
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return        // 整行註解不算
      for (const r of RULES) if (r.re.test(code)) hits.push({ path, line: i + 1, id: r.id, why: r.why, text: code.trim().slice(0, 90) })
      // R3:同一個 class 字串內同時出現兩者
      for (const m of code.matchAll(/['"`]([^'"`]*)['"`]/g)) {
        const s = m[1]
        if (/\boutline-none\b/.test(s) && /\bfocus-ring-inset\b/.test(s)) {
          hits.push({ path, line: i + 1, id: 'R3', why: 'outline-none 與 focus-ring-inset 同階打架,勝負看排序', text: s.slice(0, 90) })
        }
      }
    })
  }
  return hits
}

function load(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) load(p, out)
    else if (n.endsWith('.tsx') && !n.includes('.stories.')) out.push({ path: p.replace(ROOT, 'src'), src: readFileSync(p, 'utf8') })
  }
  return out
}

if (process.argv.includes('--selftest')) {
  const cases = [
    { n: 'ring-offset', src: "cn('focus-visible:ring-2 focus-visible:ring-offset-1')", bad: true },
    { n: 'focus ring', src: "cn('focus-visible:ring-2 focus-visible:ring-ring')", bad: true },
    { n: '抄全域外描邊', src: "cn('focus-visible:outline-2 focus-visible:outline-ring')", bad: true },
    { n: '手寫內描邊三件組', src: "cn('focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring')", bad: true },
    { n: 'outline-none 打架', src: "cn('outline-none focus-ring-inset')", bad: true },
    { n: '正確內描邊', src: "cn('focus-visible:focus-ring-inset rounded-md')", bad: false },
    { n: '正確外描邊(什麼都不寫)', src: "cn('rounded-md bg-surface')", bad: false },
    { n: '註解裡提到不算', src: "// 舊寫法是 focus-visible:ring-2 focus-visible:ring-offset-1", bad: false },
    { n: '虛擬游標', src: "showRing && 'focus-ring-inset'", bad: false },
  ]
  let ok = true
  for (const c of cases) {
    const got = scan([{ path: 't.tsx', src: c.src }]).length > 0
    if (got !== c.bad) { console.error(`✗ selftest「${c.n}」預期 ${c.bad} 實得 ${got}`); ok = false }
  }
  console.log(ok ? `✓ selftest ${cases.length}/${cases.length} 通過` : '✗ selftest 失敗')
  process.exit(ok ? 0 : 1)
}

const hits = scan(load(ROOT))
if (hits.length) {
  console.error('✗ 焦點框幾何回流(全 DS 只准兩種:全域外描邊 / focus-ring-inset):')
  console.error('  SSOT:packages/design-system/ds-canonical/references/focus-canonical.md「問題二」')
  for (const h of hits) console.error(`    [${h.id}] ${h.path}:${h.line}\n         ${h.text}\n         → ${h.why}`)
  process.exit(1)
}
console.log('✓ 焦點框只有兩種幾何,無回流')
