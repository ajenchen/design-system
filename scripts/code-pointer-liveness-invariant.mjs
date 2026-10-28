#!/usr/bin/env node
/**
 * DS 文件裡「`某檔.ts(x)` `某符號`」這種指標,那個符號必須真的定義在那個檔裡。
 *
 * 為什麼要這支(2026-10-21,r1b fields F4):「+N」量測的 `useOverflowCount` 2026-10-13 從 `combobox.tsx` 搬到
 * `OverflowIndicator/overflow-tag-list.tsx`,規格、程式註解、設計規格頁的指標沒跟著改 —— `combobox.spec.md` 仍寫「`combobox.tsx` `useOverflowCount`」,
 * 讀的人點過去找不到。同一次全 DS 掃描另抓到 `tree-view.spec.md` 仍說消費「`select-menu.tsx` `SelectMenuLiveStatus`」(那個元件早已收進
 * Command 根的 `CommandEmptyStatus`)。這跟 `hook-citation-liveness-invariant.mjs` 是同一種病(文件寫的東西不在了),差別只在查的是程式符號。
 *
 * 判準:packages/design-system/src 底下的 .md / .ts / .tsx,同一行裡「反引號包住的檔名(.ts / .tsx / .mjs)」緊接「反引號包住的識別字」=
 * 一個指標;檔名解析成 DS 裡的那一支檔(相對路徑、或全 DS 唯一的檔名),那支檔裡必須有這個識別字的**定義**(function / const / class /
 * interface / type / enum / export { … } / 物件或介面的欄位 / 解構參數)—— 只在註解裡提到不算。
 * 放行:(a) 指標所在的那一句明講是歷史(曾是 / 之前 / 原本 / 搬出 / 搬到 / 改名 / 已移除 / 退役 / 修前 / 當時 / 舊);(b) 指的不是 DS 的檔
 * (同一句是 GitHub 等外部原始碼的連結、或檔名在 DS 裡找不到 / 有多支同名又分不出是哪一支 —— 這幾種量不了,不判)。
 *
 * @gate-contract
 *   保證: DS 文件裡「`檔名` `符號`」指標的符號真的定義在那支檔裡(不是已搬走 / 已改名的舊位置)
 *   紅: 任一指標的符號不在那支檔裡、而且那一行沒講明是歷史 → 指名檔案:行號與指標,exit 1;a6390356 的原始碼紅 2 個(combobox.spec.md:147、tree-view.spec.md:462)
 *   綠: 全部指標都解得到定義;--selftest 的對照組(以 cases 為準:搬走了紅 / 同一句標了歷史放行 / 真的在放行 / 只在註解提到仍紅 /
 *       別句的「修前」不放行這一句 / 外部原始碼不判)每次都跑,
 *       並要求這一趟至少解出 50 個指標(量具真的在讀,不是空掃)
 *
 * 用法:node scripts/code-pointer-liveness-invariant.mjs [--selftest]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'packages/design-system/src')
const POINTER = /`((?:\.{1,2}\/)?[\w./-]*?([\w-]+\.(?:tsx?|mjs)))`\s*(?:的\s*)?`([A-Za-z_$][\w$]*)`/g
const HISTORY = /曾是|之前|原本|原 `|原名|搬出|搬到|搬進|改名|已移除|移除了|退役|修前|當時|舊的|舊名|2026-\d\d-\d\d 前/
const EXTERNAL = /https?:\/\/|github\.com|node_modules|@radix-ui|dist\/index/
const MIN_RESOLVED = 50

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) { if (e !== 'node_modules') walk(p, out) } else if (/\.(md|tsx?)$/.test(e)) out.push(p)
  }
  return out
}

/** 那支檔裡有沒有這個識別字的定義(只在註解裡提到不算) */
export function definesSymbol(source, symbol) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const s = symbol.replace(/\$/g, '\\$')
  return new RegExp(`(?:function\\s*\\*?\\s+${s}\\b|(?:const|let|var|class|interface|type|enum)\\s+${s}\\b|export\\s*\\{[^}]*\\b${s}\\b|^\\s*(?:readonly\\s+)?['"]?${s}['"]?\\??\\s*[:=(]|[{,]\\s*${s}\\s*[,}=:])`, 'm').test(code)
}

/** 指標所在的那一句(以 。;;( ) 等分句;規格常把整段寫成一行,整行看「歷史」字樣會讓同一行別處的「修前」放行無關的指標) */
function sentenceAround(line, start, end) {
  const STOP = /[。;;\n]/
  let a = start
  while (a > 0 && !STOP.test(line[a - 1])) a -= 1
  let b = end
  while (b < line.length && !STOP.test(line[b])) b += 1
  return line.slice(a, b)
}

/** 核心判定:一份文件的文字 → 違規清單。resolveFile(ref, base) 回那支檔的內容,解不了回 null(不判)。 */
export function findDeadPointers(text, resolveFile) {
  const bad = []
  let resolved = 0
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(POINTER)) {
      const [, ref, base, symbol] = m
      const sentence = sentenceAround(line, m.index, m.index + m[0].length)
      if (EXTERNAL.test(sentence)) continue
      const source = resolveFile(ref, base)
      if (source == null) continue
      resolved += 1
      if (definesSymbol(source, symbol)) continue
      if (HISTORY.test(sentence)) continue
      bad.push({ line: i + 1, pointer: `\`${ref}\` \`${symbol}\``, text: line.trim().slice(0, 160) })
    }
  })
  return { bad, resolved }
}

function selftest() {
  const files = {
    'overflow-tag-list.tsx': 'function useOverflowCount() {}\nexport { OverflowTagList }',
    'combobox.tsx': '// 單行 +N 由 useOverflowCount 量(見 overflow-tag-list.tsx)\nconst CustomCombobox = () => null',
  }
  const resolveFile = (_ref, base) => files[base] ?? null
  const cases = [
    { why: '符號已搬走(2026-10-13 搬到 overflow-tag-list.tsx),文件仍指舊檔 → 必須紅', text: 'Combobox 的 DOM 量測(`combobox.tsx` `useOverflowCount`)', expectBad: true },
    { why: '同一個舊位置,但那一行講明是歷史 → 放行', text: '2026-10-13 前住 `combobox.tsx` `useOverflowCount`,之後搬到 overflow-tag-list.tsx', expectBad: false },
    { why: '符號真的定義在那支檔 → 放行', text: '實作 `overflow-tag-list.tsx` `useOverflowCount`', expectBad: false },
    { why: '檔裡只有註解提到這個字(不是定義)→ 仍然紅', text: '見 `combobox.tsx` `useOverflowCount`', expectBad: true },
    { why: '同一行別的句子講到「修前」,不放行這一句的舊指標 → 仍然紅', text: '修前欄位會跳。量測住 `combobox.tsx` `useOverflowCount`', expectBad: true },
    { why: '外部原始碼的連結(GitHub)不是 DS 的檔 → 不判', text: 'Radix `dialog.tsx` `DialogOverlayImpl`(https://github.com/radix-ui/primitives/blob/main/packages/react/dialog/src/dialog.tsx)', expectBad: false },
  ]
  let ok = true
  for (const c of cases) {
    const got = findDeadPointers(c.text, resolveFile).bad.length > 0
    const pass = got === c.expectBad
    if (!pass) ok = false
    console.log(`${pass ? '✓' : '✗'} 對照組:${c.why}(預期${c.expectBad ? '紅' : '綠'},實得${got ? '紅' : '綠'})`)
  }
  return ok
}

function main() {
  const files = walk(SRC)
  const byBase = new Map()
  for (const f of files) { const b = basename(f); if (!byBase.has(b)) byBase.set(b, []); byBase.get(b).push(f) }
  const cache = new Map()
  const read = (p) => { if (!cache.has(p)) cache.set(p, readFileSync(p, 'utf8')); return cache.get(p) }
  const violations = []
  let resolved = 0
  for (const file of files) {
    const resolveFile = (ref, base) => {
      if (ref.includes('/')) {
        const rel = resolve(dirname(file), ref)
        if (existsSync(rel) && rel.startsWith(SRC)) return read(rel)
        const fromSrc = resolve(SRC, ref.replace(/^(?:\.\.?\/)+/, ''))
        if (existsSync(fromSrc)) return read(fromSrc)
      }
      const same = byBase.get(base) ?? []
      if (same.length === 1) return read(same[0])
      const near = same.filter((p) => dirname(p) === dirname(file))
      return near.length === 1 ? read(near[0]) : null
    }
    const r = findDeadPointers(read(file), resolveFile)
    resolved += r.resolved
    for (const b of r.bad) violations.push(`${relative(ROOT, file)}:${b.line} ${b.pointer} —— 那支檔裡沒有這個定義 | ${b.text}`)
  }
  if (resolved < MIN_RESOLVED) {
    console.error(`✗ code-pointer-liveness:只解出 ${resolved} 個指標(下限 ${MIN_RESOLVED})—— 量具沒在讀(儀器失效,不是通過)`)
    return 1
  }
  if (violations.length) {
    console.error(`✗ code-pointer-liveness:${violations.length} 個指標的符號不在那支檔裡(已搬走 / 已改名;改指新位置,或在那一句講明是歷史)`)
    for (const v of violations) console.error(`  ${v}`)
    return 1
  }
  console.log(`✓ code-pointer-liveness:${resolved} 個「\`檔名\` \`符號\`」指標全部解得到定義`)
  return 0
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exit(process.argv.includes('--selftest') ? (selftest() ? 0 : 1) : main())
