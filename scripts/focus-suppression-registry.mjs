#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 焦點抑制必須表態 —— 每一處 `outline-none` 都要說清楚「誰來畫」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`ds-canonical/references/focus-canonical.md`「問題一之二:什麼情況明確不用畫框」
//
// **為什麼需要這支閘**(user 2026-09-07 問:「確認所有 ds 內容都有按此原則沒有偏移?」):
// 這條規則在 2026-09-07 之前只有一句抽象的例外 ——「指示器畫在別的元素上,必須指得出承擔者」——
// 沒有列舉、沒有判斷程序。結果是每次遇到都重新推導一次,而且**推導完不會留下痕跡**:
// 下一個人看到 `outline-none` 只能重新猜它是刻意的還是忘了。
// 實際後果是 2026-09-07 一天內抓到三處「其實是漏掉」:
//   steps.tsx(三條 focus-visible outline 從寫下起沒畫過)、
//   chart.tsx(圖表可 Tab 但焦點被抑制)、
//   slider.tsx(把手根本不可 Tab —— WCAG 2.1.1 Level A)。
//
// 現在規則有 A–E 五類 + 七步判斷程序,這支閘要求**結論留在現場**:
// 每一處抑制都要有 `@focus-suppress <類別> — <說明>;承擔者:<誰>` 的註解。
// 寫不出承擔者,就代表它其實不屬於那一類 —— 那正是要被抓出來的情況。
//
// 類別(完整定義見 SSOT):
//   A 虛擬游標 / B Field 家族輸入控件 / C 隱形整列觸發器 / D 選單未選中項 /
//   E 浮層程式落點 / N 不適用(不可操作,問題一已答完)
//
// Run: `node scripts/focus-suppression-registry.mjs`(`--selftest` 跑正反例)

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../packages/design-system/src', import.meta.url))
const VALID = new Set(['A', 'B', 'C', 'D', 'E', 'N'])
/** 往上找幾行標記(有些抑制點的註解會分行寫) */
const LOOKBACK = 8

/** 只算「真的會抑制焦點框」的寫法,不算註解裡提到這幾個字 */
const SUPPRESS = /\boutline-none\b|\boutline-0\b|\boutline-hidden\b/

/**
 * 把註解從原始碼剝掉,再判斷有沒有抑制。
 *
 * 三種都要剝,少一種就會誤判(2026-09-07 實際踩到後兩種):
 *   `// …`            行尾註解
 *   `/* … *\/`        區塊註解(含寫在同一行尾巴的)
 *   `{/* … *\/}`      JSX 註解
 * 例如 `field.tsx` 有一句「本區塊無 outline-none」、`inline-edit.tsx` 有一句
 * 「只需 outline-none 消瀏覽器預設外框」—— 兩句都是在**說明**,不是在抑制。
 */
function stripComments(text) {
  return text
    // 跨行註解要**保留換行數**,否則剝完之後行號會錯位,
    // 報出來的位置就會指到別的地方(2026-09-07 第一版就是這樣,錯報 27 處)。
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (m) => ' '.repeat(m.length))
}

export function scan(files) {
  const problems = []
  for (const { path, src } of files) {
    const stripped = stripComments(src).split('\n')
    const lines = src.split('\n')
    lines.forEach((line, i) => {
      const code = stripped[i] ?? ''
      if (!SUPPRESS.test(code)) return
      // 標記本身寫在註解裡,所以回看要用**原文**不是剝過的
      const window = lines.slice(Math.max(0, i - LOOKBACK), i).join('\n')
      const m = window.match(/@focus-suppress\s+([A-EN])\b/)
      const trimmed = line.trim()
      if (!m) { problems.push({ path, line: i + 1, why: '沒有 @focus-suppress 標記', text: trimmed.slice(0, 80) }); return }
      if (!VALID.has(m[1])) { problems.push({ path, line: i + 1, why: `類別 ${m[1]} 不在 A–E / N`, text: trimmed.slice(0, 80) }); return }
      if (m[1] !== 'N' && !/承擔者[::]/.test(window)) {
        problems.push({ path, line: i + 1, why: `類別 ${m[1]} 必須寫出承擔者是誰(寫不出來就代表它不屬於那一類)`, text: trimmed.slice(0, 80) })
      }
    })
  }
  return problems
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
    { n: '有標記有承擔者', src: "// @focus-suppress B — Field;承擔者:wrapper 邊框\ncn('outline-none')", bad: false },
    { n: '沒有標記', src: "cn('outline-none')", bad: true },
    { n: '有標記但沒寫承擔者', src: "// @focus-suppress B — Field\ncn('outline-none')", bad: true },
    { n: 'N 類不需要承擔者', src: "// @focus-suppress N — 不可操作\ncn('outline-none')", bad: false },
    { n: '無效類別', src: "// @focus-suppress Z — 亂寫;承擔者:誰\ncn('outline-none')", bad: true },
    { n: '行尾註解裡提到不算', src: "// 原本這裡有 outline-none,已刪", bad: false },
    { n: '區塊註解裡提到不算', src: "/* 本區塊無 outline-none */", bad: false },
    { n: 'JSX 註解裡提到不算', src: "{/* 只需 outline-none 消預設外框 */}", bad: false },
    { n: '同行尾巴的區塊註解不算', src: 'className="x"  /* 本區塊無 outline-none */', bad: false },
    { n: '跨行註解不得讓行號錯位', src: "/* 第一行\n第二行\n第三行 */\n// @focus-suppress B — x;承擔者:y\ncn('outline-none')", bad: false },
    { n: '沒有抑制的一般程式碼', src: "cn('rounded-md bg-surface')", bad: false },
    { n: '標記離太遠(超過回看範圍)', src: "// @focus-suppress B — x;承擔者:y\n1\n2\n3\n4\n5\n6\n7\n8\n9\ncn('outline-none')", bad: true },
  ]
  let ok = true
  for (const c of cases) {
    const got = scan([{ path: 't.tsx', src: c.src }]).length > 0
    if (got !== c.bad) { console.error(`✗ selftest「${c.n}」預期 ${c.bad} 實得 ${got}`); ok = false }
  }
  console.log(ok ? `✓ selftest ${cases.length}/${cases.length} 通過` : '✗ selftest 失敗')
  process.exit(ok ? 0 : 1)
}

const problems = scan(load(ROOT))
if (problems.length) {
  console.error('✗ 下列焦點抑制沒有表態(SSOT:focus-canonical「問題一之二」):')
  console.error('  每一處都要在前 8 行內寫 `@focus-suppress <A-E|N> — <說明>;承擔者:<誰>`。')
  console.error('  先跑那份文件的七步判斷程序;走到第 7 步就代表**要畫**,不是加標記。')
  problems.forEach((p) => console.error(`    ${p.path}:${p.line}  ${p.why}\n         ${p.text}`))
  process.exit(1)
}
console.log('✓ 每一處焦點抑制都表明了類別與承擔者')
