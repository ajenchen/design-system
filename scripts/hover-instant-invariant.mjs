#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// hover 底色不做過渡 —— 「指標掃過去的時候,底色要立刻到位」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`packages/design-system/src/tokens/motion/motion.spec.md`「hover 回饋不做過渡」
//
// user 2026-09-10 拍板(原話:「第三題改成全部瞬間,確保有SSOT不要有漂移」)。
// 為什麼:過渡時長必須短於「指標停在一個項目上的時間」,否則底色永遠追不上指標 ——
// 表格列高 36–52px,指標以 500–1000px/s 掃過時每 40–90ms 換一列,150ms 的過渡在每一列
// 都完成不了,畫面上同時有兩三列半亮的拖尾(2026-09-10 量到 hover 最終色延遲 p95 109ms,
// 其中 84ms 是過渡本身)。一手來源:MUI DataGrid 的列 hover、AG Grid `.ag-row-hover`、
// VS Code `.monaco-list-row:hover` 三家都沒有任何 background 過渡。
//
// 判準(機械):同一段 class 宣告裡同時出現
//   (a) hover 驅動的底色(`hover:bg-*` / `data-[hovered]:bg-*` / `data-[highlighted]:bg-*` /
//       `group-hover/x:bg-*` / `group-data-[state=open]/x:bg-*`)
//   (b) 會把 background-color 一起過渡的宣告(`transition-colors` / `transition-all` /
//       `transition-[…background-color…]`)
// = 漂移。每行 escape:`@hover-transition-allow: <理由>`(寫在該行上方 3 行內)。
//
// 例外(已登記,理由寫在程式碼裡):Checkbox / Switch —— 那條過渡屬於 checked 狀態切換
// (unchecked ↔ checked 的色彩),不是 hover;它們是控件大小的點目標,不是掃過去的列面。
//
// Run: `node scripts/hover-instant-invariant.mjs`(`--selftest` 跑正反例)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../packages/design-system/src', import.meta.url))
/** 上下各看幾行算「同一段 class 宣告」(cva 陣列 / cn(...) 呼叫的典型長度) */
const WINDOW = 8
const LOOKBACK = 3

const HOVER_BG = /(?:^|[\s'"`:[])(?:hover|data-\[hovered\]|data-\[highlighted\]|group-hover\/[\w-]+|group-data-\[state=open\]\/[\w-]+):bg-/
const COLOUR_TRANSITION = /\btransition-colors\b|\btransition-all\b|\btransition-\[[^\]]*(?:background-color|colors)[^\]]*\]/
const ESCAPE = /@hover-transition-allow:\s*\S/

/** 把註解剝掉再判斷:spec 引用或說明文字提到 `transition-colors` 不算宣告(對齊 focus-suppression-registry 的做法) */
const stripComments = (line) => line.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/, '')

export function scanSource(source, path = '<inline>') {
  const lines = source.split('\n')
  const hits = []
  lines.forEach((raw, i) => {
    const code = stripComments(raw)
    if (!COLOUR_TRANSITION.test(code)) return
    const from = Math.max(0, i - WINDOW), to = Math.min(lines.length, i + WINDOW + 1)
    const near = lines.slice(from, to).map(stripComments).join('\n')
    if (!HOVER_BG.test(near)) return
    const escaped = lines.slice(Math.max(0, i - LOOKBACK), i + 1).some((l) => ESCAPE.test(l))
    if (escaped) return
    hits.push({ path, line: i + 1, text: raw.trim().slice(0, 90) })
  })
  return hits
}

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.tsx') && !name.endsWith('.stories.tsx')) out.push(p)
  }
  return out
}

if (process.argv.includes('--selftest')) {
  // 對照組:儀器要先證明它該紅的時候會紅(M32)
  const positive = `const rowVariants = cva([\n  'flex items-center',\n  'transition-colors duration-150',\n  'hover:bg-neutral-hover',\n])`
  const positiveAttr = `<div className={cn('transition-all', 'data-[hovered]:bg-neutral-hover')} />`
  const escaped = `const v = cva([\n  // @hover-transition-allow: 過渡屬於 checked 狀態切換,不是 hover\n  'transition-colors duration-150',\n  'data-[state=checked]:hover:bg-primary-hover',\n])`
  const negativeNoHoverBg = `const link = cn('hover:text-primary-hover', 'transition-colors duration-150')`
  const negativeNoTransition = `const row = cn('hover:bg-neutral-hover', 'rounded-md')`
  const negativeFar = `const a = cn('transition-colors')\n${'\n'.repeat(20)}\nconst b = cn('hover:bg-neutral-hover')`
  const cases = [
    ['hover 底色 + transition-colors', positive, 1],
    ['data-[hovered] 底色 + transition-all', positiveAttr, 1],
    ['寫了 escape 註解', escaped, 0],
    ['只有文字色 hover(無底色)', negativeNoHoverBg, 0],
    ['有 hover 底色但沒有過渡', negativeNoTransition, 0],
    ['過渡與 hover 底色相距 20 行以上', negativeFar, 0],
  ]
  let bad = 0
  for (const [name, src, expected] of cases) {
    const n = scanSource(src).length
    const ok = n === expected
    console.log(`${ok ? '✓' : '✗'} ${name} — 期望 ${expected} 命中,實得 ${n}`)
    if (!ok) bad++
  }
  console.log(bad ? `\n✗ selftest ${bad} 項不符` : '\n✓ selftest:正例會紅、反例不會紅、escape 有效')
  process.exit(bad ? 1 : 0)
}

const hits = walk(ROOT).flatMap((p) => scanSource(readFileSync(p, 'utf8'), p.slice(ROOT.length + 1)))
if (hits.length) {
  console.error('✗ hover 底色仍有過渡(user 2026-09-10 拍板一律瞬間;SSOT = tokens/motion/motion.spec.md):')
  for (const h of hits) console.error(`  ${h.path}:${h.line}  ${h.text}`)
  console.error('\n  修法:把 transition-colors / transition-all 從那段 class 拿掉;')
  console.error('  真的屬於「狀態切換」而不是 hover 的,在該行上方寫 `// @hover-transition-allow: <理由>`。')
  process.exit(1)
}
console.log('✓ 全 DS 的 hover 底色都是瞬間切換(無殘留過渡)')
