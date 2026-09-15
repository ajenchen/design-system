#!/usr/bin/env node
/**
 * 已定案條款不得被重新寫成「待拍板」(2026-09-08 建)
 *
 * 由來:agent 原則 v14(2026-09-06 定稿,「還需要你拍板的取捨:無」)明訂
 * 「有 URL 的內容與 agent 並存」是已定案條款,文件末尾還逐字寫著
 * 「這三個(落地差距)都**不是產品選擇**」。我在 2026-09-08 仍把它寫成
 * 「產品題,由 user 拍板」交回去問 user。
 * user 原話:「你他媽你怎麼到現在還會要我拍版這個東西???這個他媽不就一開始就定義好的?」
 *
 * 更難看的是:我 2026-09-07 在同一份總帳裡親手寫過
 * 「這是從 A 條推導出來的、**本來就不該當成新決策問**」。
 *
 * `governance/memory/project_agent_ui_draft_model.md` 早有明文:「禁把 §〇 條款降級成『未決』」——
 * 但那是一句給人看的規則,沒有任何機械防線。這支就是那道防線。
 *
 * ── 判準(刻意用關鍵詞集合,不用語意相似)───────────────────────────────
 * 跨模型審查時 codex 自己就說了:「regex 無法完整判定任意自然語言是否與某條款同義」。
 * 所以不做同義判斷,改用**可審核的關鍵詞契約**:
 *   一段文字同時 (a) 帶「待拍板」類標記 (b) 命中某條款的**全部** allOf
 *   (c) 命中該條款的**至少一個** anyOf → BLOCK。
 * 誤判成本由 allOf/anyOf 的收窄程度控制,而且每條都寫得出 why 與 source。
 *
 * ── 逃生口 ─────────────────────────────────────────────────────────────
 * user 本人要重開某條款是完全正當的。寫一行
 *   <!-- reopened: <ref> — <user 原話逐字> -->
 * 在該段之前即可放行 —— 逐字原話是必要的(M36(a):禁把自己的推論寫成 user 的決定)。
 * 已撤回/歷史段落(含「撤回」「已撤回」「歷史」「superseded」)同樣不算。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const REGISTRY = join(ROOT, 'packages/governance/canonical/decided-clauses.json')
const SCAN_DIRS = ['governance/planning', 'governance/memory']

// 「有人在要求拍板」的標記。刻意收窄成明確的請求語,不抓一般敘述。
const PENDING = /待\s*(?:user|使用者|用戶)?\s*拍板|由\s*user\s*拍板|需要你拍(?:一個)?板|待決策|未決事項|待拍板|請你拍板|awaiting[- ]approval|needs[- ]decision/iu
// 這些字出現在同一段 = 這段在講歷史或已撤回,不是現行請求
// 這些字代表「這段在講歷史 / 已撤回 / 事後檢討」,不是現行的拍板請求。
// **要看最近的標題,不能只看前後幾行** —— 記錄失誤的段落一定會引用當初寫錯的原文,
// 那些引文與標題之間常常隔了十幾行(2026-09-08 第一版就是這樣把自己的檢討段落判成違規)。
const HISTORICAL = /撤回|已撤回|歷史|過時|superseded|retracted|曾經的待決題|禁把|不得再|根因|失誤|檢討|裁示|已答|已拍板|逐字保留/u
// 重開標記必須帶「」逐字引文(M36(a)):沒有引文的 reopened 不算,任意一句話也不算
const REOPEN = /<!--\s*reopened:\s*([a-z0-9.-]+)\s*—\s*[^>]*「[^」]+」[^>]*-->/iu

const WINDOW = 6 // 前後各看幾行

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.md')) out.push(p)
  }
  return out
}

export function scan({ clauses, files }) {
  const problems = []
  for (const { path, text } of files) {
    const lines = text.split('\n')
    // **看整條標題鏈,不只最近那一個**:`## AD15 …根因…` 底下的 `### 事實鏈` 不含歷史字眼,
    // 只記最近一個標題的話,檢討段落裡的引文會被判成現行請求(2026-09-08 當場踩到)。
    const stack = []
    for (let i = 0; i < lines.length; i++) {
      const h = lines[i].match(/^(#{1,6})\s+(.+)$/)
      if (h) {
        while (stack.length && stack.at(-1).depth >= h[1].length) stack.pop()
        stack.push({ depth: h[1].length, text: h[2] })
        continue
      }
      if (!PENDING.test(lines[i])) continue
      // 整條標題鏈上任一層是歷史/檢討 → 豁免,否則再看前後 6 行
      // 豁免**只看標題鏈**:R3 實測「旁邊加一句無關的『已拍板』」就能讓前後 6 行的豁免放行,
      // 那是可以被繞過的字面漏洞。標題鏈是作者刻意的結構,不是順手的字。
      if (stack.some((x) => HISTORICAL.test(x.text))) continue
      const from = Math.max(0, i - WINDOW)
      const window = lines.slice(from, i + WINDOW + 1).join('\n')
      const reopen = window.match(REOPEN)
      for (const c of clauses) {
        if (!c.allOf.every((k) => window.toLowerCase().includes(k.toLowerCase()))) continue
        if (!c.anyOf.some((k) => window.toLowerCase().includes(k.toLowerCase()))) continue
        if (reopen && reopen[1] === c.ref) continue
        problems.push({
          path, line: i + 1, ref: c.ref, source: c.source,
          text: lines[i].trim().slice(0, 90),
          statement: c.statement,
        })
      }
    }
  }
  return problems
}

function selftest(clauses) {
  const A = clauses.find((c) => c.ref === 'agent-v14.A-coexistence')
  // fixture 就用我 2026-09-08 真正寫出來的那句
  const real = '**G1 需要你拍一個板**(產品語意,不是技術問題):Modal 對話框開著時,**agent 面板該不該仍然可用?**'
  const cases = [
    ['我真正寫出來的那句 → 必須擋', [{ path: 'x.md', text: real }], true],
    ['同一句但放在「已撤回」標題底下 → 放行', [{ path: 'x.md', text: '## 已撤回\n' + real }], false],
    ['同一句只在前一行寫「已撤回」(不是標題)→ 仍要擋', [{ path: 'x.md', text: '本段已撤回\n' + real }], true],
    ['同一句但有 user 逐字重開 → 放行',
      [{ path: 'x.md', text: `<!-- reopened: ${A.ref} — user 2026-09-09:「這條我要重新想」 -->\n` + real }], false],
    ['重開標記沒有「」逐字引文 → 仍要擋',
      [{ path: 'x.md', text: `<!-- reopened: ${A.ref} — 我覺得可以重開 -->\n` + real }], true],
    ['旁邊塞一句無關的「已拍板」不能當豁免 → 仍要擋',
      [{ path: 'x.md', text: '另一件事已拍板。\n' + real }], true],
    ['重開標記指到別的條款 → 仍要擋',
      [{ path: 'x.md', text: '<!-- reopened: agent-v14.F-init-closed — user:「重想」 -->\n' + real }], true],
    ['只提 modal 沒提 agent → 不擋(不是這條)', [{ path: 'x.md', text: '這個 modal 的寬度待拍板' }], false],
    ['提了 agent 與 modal 但沒有拍板語 → 不擋', [{ path: 'x.md', text: 'modal 與 agent 可以同時使用' }], false],
    ['窄螢幕兩邊都能用被重問 → 擋',
      [{ path: 'x.md', text: '窄螢幕 agent 要不要兩邊都能用?待拍板' }], true],
  ]
  let fail = 0
  for (const [name, files, shouldBlock] of cases) {
    const got = scan({ clauses, files }).length > 0
    if (got === shouldBlock) console.log(`  ✓ ${name}`)
    else { console.log(`  ✗ ${name} —— 預期${shouldBlock ? '擋' : '放行'} 實得${got ? '擋' : '放行'}`); fail++ }
  }
  console.log(fail ? `\n✗ selftest ${fail} 項未通過` : `\n✓ selftest ${cases.length}/${cases.length} 通過`)
  return fail
}

const { clauses } = JSON.parse(readFileSync(REGISTRY, 'utf8'))
if (process.argv.includes('--selftest')) process.exit(selftest(clauses) ? 1 : 0)

// 已被取代(registry reason 含 Superseded)的文件是歷史,不是現行請求,整份跳過 ——
// 例:2026-08-11 舊規格通篇是當年的「待拍板」語,它已被 v14 取代並在 registry 標明。
let superseded = new Set()
try {
  const reg = JSON.parse(readFileSync(join(ROOT, 'governance/planning/registry.json'), 'utf8'))
  superseded = new Set((reg.documents ?? []).filter((d) => /superseded/i.test(d.reason ?? '')).map((d) => d.path))
} catch { /* 沒有 registry 就不跳過任何檔 */ }
const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
  .map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, 'utf8') }))
  .filter((f) => !superseded.has(f.path))
const problems = scan({ clauses, files })

console.log(`掃了 ${files.length} 份文件,對照 ${clauses.length} 條已定案條款`)
if (problems.length) {
  console.error(`\n✗ ${problems.length} 處把已定案條款重新寫成待拍板:`)
  for (const p of problems) {
    console.error(`  ${p.path}:${p.line}`)
    console.error(`    寫的是:${p.text}`)
    console.error(`    但 ${p.ref} 已定案(${p.source}):${p.statement}`)
  }
  console.error('\n  要嘛照條款實作,要嘛附 user 逐字重開標記:<!-- reopened: <ref> — <user 原話> -->')
  process.exit(1)
}
console.log('✓ 沒有已定案條款被重新列為待拍板')
