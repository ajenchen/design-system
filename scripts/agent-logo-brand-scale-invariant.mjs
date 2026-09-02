#!/usr/bin/env node
// agent-logo-brand-scale-invariant — 守「標誌色永遠等於自家色階」(2026-09-02 user:「所有顏色都要根據我們的設計語言調整」)
//
//   1) 解析 primitives.css light 段的 `--color-<hue>-6` 基準 + `oklch(from var(...) calc(...) calc(...) h)` 公式,重算 1–10 階
//   2) 解析 agent-logo.tsx 每個 `oklch(L C H)` 常數與同行尾 `// = --color-<hue>-<n>` 綁定
//   3) L/C 容差 0.01、H 容差 0.5°;缺綁定 / 對不上 → exit 1(alpha 屬資產層次,不比)
// Run: node scripts/agent-logo-brand-scale-invariant.mjs(含 selftest)

import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const CSS = 'packages/design-system/src/tokens/color/primitives.css'
const TSX = 'packages/design-system/src/components/AgentPanel/agent-logo.tsx'
const TOL = 0.01
const TOL_H = 0.5

/** light 段:所有以 `:root` 開頭且選擇器不含 dark 的頂層區塊串接(品牌色不隨主題,只對 light 基準)。 */
export function lightBlock(css) {
  const blocks = []
  let cursor = 0
  while (cursor < css.length) {
    const open = css.indexOf('{', cursor)
    if (open < 0) break
    const selector = css.slice(css.lastIndexOf('}', open) + 1, open).replace(/\/\*[\s\S]*?\*\//gu, '').trim()
    let depth = 0
    let close = -1
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1
      if (css[i] === '}') {
        depth -= 1
        if (depth === 0) {
          close = i
          break
        }
      }
    }
    if (close < 0) throw new Error('primitives.css 區塊未閉合')
    if (selector.startsWith(':root') && !/dark/u.test(selector)) blocks.push(css.slice(open + 1, close))
    cursor = close + 1
  }
  if (!blocks.length) throw new Error('primitives.css 找不到 :root light 段')
  return blocks.join('\n')
}

/** 把 `calc(l + (1 - l) * 0.90)` / `calc(c * 0.14)` / `l` / `c` 這類公式代入數值。 */
function evalChannel(expr, l, c) {
  const src = expr.trim().replace(/^calc\((.*)\)$/u, '$1')
  if (!/^[\d.\s+\-*/()lc]+$/u.test(src)) throw new Error(`不支援的色階公式:${expr}`)
  // eslint-disable-next-line no-new-func
  return Function('l', 'c', `return (${src})`)(l, c)
}

/** 由 light 段重算所有 `--color-<hue>-<n>` → { 'blue-4': {l,c,h} }。 */
export function computeLadder(css) {
  const block = lightBlock(css)
  const bases = new Map()
  for (const m of block.matchAll(/--color-([a-z-]+?)-6:\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/gu)) {
    bases.set(m[1], { l: +m[2], c: +m[3], h: +m[4] })
  }
  const ladder = new Map()
  for (const [hue, base] of bases) ladder.set(`${hue}-6`, base)
  for (const m of block.matchAll(/--color-([a-z-]+?)-(\d+):\s*oklch\(from var\(--color-([a-z-]+?)-6\)\s+(.+?)\s+h\)\s*;/gu)) {
    const base = bases.get(m[3])
    if (!base) continue
    const [lExpr, cExpr] = splitTopLevel(m[4])
    if (!lExpr || !cExpr) continue
    ladder.set(`${m[1]}-${m[2]}`, { l: evalChannel(lExpr, base.l, base.c), c: evalChannel(cExpr, base.l, base.c), h: base.h })
  }
  return ladder
}

/** 以括號深度切出頂層空白分隔的兩個 channel 表達式(calc 內含巢狀括號)。 */
function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (/\s/u.test(ch) && depth === 0) {
      if (current) parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current) parts.push(current)
  return parts
}

/** 掃 tsx:每行的 oklch 常數必附 `// = --color-<hue>-<n>`;回傳 [{line, l, c, h, token}] 與缺綁定行。 */
export function scanBrandConstants(tsx) {
  const found = []
  const unbound = []
  tsx.split('\n').forEach((line, index) => {
    const color = line.match(/'oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)'/u)
    if (!color) return
    const binding = line.match(/\/\/\s*=\s*--color-([a-z-]+-\d+)\b/u)
    if (!binding) {
      unbound.push(index + 1)
      return
    }
    found.push({ line: index + 1, l: +color[1], c: +color[2], h: +color[3], token: binding[1] })
  })
  return { found, unbound }
}

export function check(css, tsx) {
  const ladder = computeLadder(css)
  const { found, unbound } = scanBrandConstants(tsx)
  const issues = unbound.map((line) => `L${line}:oklch 常數缺 \`// = --color-<hue>-<n>\` 綁定`)
  for (const item of found) {
    const target = ladder.get(item.token)
    if (!target) {
      issues.push(`L${item.line}:--color-${item.token} 不在 primitives.css light 色階`)
      continue
    }
    const bad = []
    if (Math.abs(item.l - target.l) > TOL) bad.push(`L ${item.l} ≠ ${target.l.toFixed(2)}`)
    if (Math.abs(item.c - target.c) > TOL) bad.push(`C ${item.c} ≠ ${target.c.toFixed(2)}`)
    if (Math.abs(item.h - target.h) > TOL_H) bad.push(`H ${item.h} ≠ ${target.h}`)
    if (bad.length) issues.push(`L${item.line}:--color-${item.token} ${bad.join(' / ')}`)
  }
  return { issues, count: found.length }
}

function selftest() {
  const css = ':root {\n  --color-blue-6: oklch(0.54 0.22 258);\n  --color-blue-4: oklch(from var(--color-blue-6) calc(l + (1 - l) * 0.40) calc(c * 0.75) h);\n}\n[data-theme="dark"] {\n  --color-blue-6: oklch(0.63 0.22 258);\n}\n'
  const cases = [
    { n: '綁定且吻合 = PASS', tsx: "  [0, 'oklch(0.72 0.17 258)'], // = --color-blue-4\n", e: 0 },
    { n: '值偏離 = 該抓', tsx: "  [0, 'oklch(0.76 0.13 252)'], // = --color-blue-4\n", e: 1 },
    { n: '缺綁定 = 該抓', tsx: "  [0, 'oklch(0.72 0.17 258)'],\n", e: 1 },
    { n: '綁到不存在的階 = 該抓', tsx: "  [0, 'oklch(0.72 0.17 258)'], // = --color-blue-99\n", e: 1 },
    { n: 'dark 段不得當基準(仍以 light 0.54 算)', tsx: "  [0, 'oklch(0.72 0.17 258)'], // = --color-blue-4\n", e: 0 },
  ]
  let bad = 0
  for (const t of cases) {
    const got = check(css, t.tsx).issues.length
    if (got !== t.e) {
      bad += 1
      console.error(`❌ selftest「${t.n}」期望 ${t.e} 得 ${got}`)
    }
  }
  return bad === 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (!selftest()) process.exit(2)
  const result = check(readFileSync(path.join(ROOT, CSS), 'utf8'), readFileSync(path.join(ROOT, TSX), 'utf8'))
  if (result.issues.length) {
    console.error(`❌ agent-logo-brand-scale-invariant:${TSX}`)
    for (const issue of result.issues) console.error(`   - ${issue}`)
    process.exit(1)
  }
  console.log(`✅ agent-logo-brand-scale-invariant PASS(selftest 5/5;${result.count} 個常數全部等於自家 light 色階)`)
}
