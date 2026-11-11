#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 浮層的密度只有規格允許的那幾種寫法(tokens/density/density.spec.md 情境 1「浮層跟觸發點」表):
 *     L1 任何浮層內容根元素(*Content / *SubContent)不准寫 data-density(總開關鎖法,規格 Anti-patterns 禁止);
 *     L2 版面間距只有 Popover 的內容根元素可以鎖,而且只能鎖 md;
 *     L3 header primitive 不准鎖密度(FileViewer 圖二 —— header 鎖、body 沒鎖 → 左緣不對齊)。**事實(2026-11-12 更正)**:
 *        `lockDensity` 參數**還在** patterns/header-canonical/chrome-header.tsx(公開型別與實作都在,稽核 R7-08「移除」尚未做);
 *        本閘只擋「有人傳它」(DS 0 處、WM 0 處),原本寫的「已移除」不是事實。移除參數時把這一句一起改掉;
 *     L4 機器可讀的浮層表(本檔 OVERLAY_POLICY):密度來源「觸發點」的浮層原始碼必須用 lib/overlay-density.tsx 的
 *        useTriggerRegionDensity,「整頁」的浮層不准用;density.spec.md 情境 1 表每一列的「密度來源」必須與這份表一致。
 *   紅: 指名檔案:行與哪一條,exit 1。
 *   綠: 掃 packages/design-system/src/**(元件、pattern、story)與 apps/**\/src/** 的 .tsx,0 違規;表與規格一致。
 *   註: 純靜態(TypeScript 語法樹),不量時間。
 *
 * 2026-11-11 稽核 R7-07:前身 `overlay-density-lock-placement.mjs` 沒有任何執行面呼叫它(孤兒閘),檔名也對不上可達性棘輪的
 * 閘名正規式,連孤兒盤點都看不到它;而且只掃 components/、排除 story,只抓 `lockDensity=`。改名 + 擴大範圍 + 加 L1/L2/L4 + 接進 CI。
 *
 * 跑法: node scripts/overlay-density-lock-invariant.mjs [--selftest]
 */
import ts from 'typescript'
import { readFileSync, globSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SPEC = 'packages/design-system/src/tokens/density/density.spec.md'

/** 浮層表(唯一一份機器可讀的;density.spec.md 情境 1 表由本閘比對,不一致就紅)。follows:'trigger' 觸發點那一區 / 'page' 整頁。 */
export const OVERLAY_POLICY = [
  { name: 'Popover', file: 'packages/design-system/src/components/Popover/popover.tsx', follows: 'trigger', lockLayoutSpace: 'md' },
  { name: 'DropdownMenu', file: 'packages/design-system/src/components/DropdownMenu/dropdown-menu.tsx', follows: 'trigger' },
  { name: 'HoverCard', file: 'packages/design-system/src/components/HoverCard/hover-card.tsx', follows: 'trigger' },
  { name: 'Tooltip', file: 'packages/design-system/src/components/Tooltip/tooltip.tsx', follows: 'trigger' },
  { name: 'Dialog', file: 'packages/design-system/src/components/Dialog/dialog.tsx', follows: 'page' },
  { name: 'Sheet', file: 'packages/design-system/src/components/Sheet/sheet.tsx', follows: 'page' },
  { name: 'FileViewer', file: 'packages/design-system/src/components/FileViewer/file-viewer.tsx', follows: 'page' },
]
const POPOVER_FILE = OVERLAY_POLICY.find((o) => o.lockLayoutSpace).file

const CONTENT_TAG = /(?:^|\.)(?:\w*Content|\w*SubContent)$/
const attrValue = (a) => {
  const init = a.initializer
  if (!init) return true
  if (ts.isStringLiteral(init)) return init.text
  if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) return init.expression.text
  return null // 動態值
}

/** 單一檔案的 L1–L3。rel:用來判斷是不是 Popover 本人。回傳 [{ line, rule, msg }]。 */
export function checkSource(src, rel = 'snippet.tsx') {
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out = []
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf)
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
      for (const a of node.attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue
        const name = a.name.getText(sf)
        if (name === 'lockDensity') out.push({ line, rule: 'L3', msg: `<${tag} lockDensity> —— 密度不鎖在 header primitive(參數尚未移除但禁用,見檔頭 L3;要鎖放 surface 根)` })
        if (!CONTENT_TAG.test(tag)) continue
        if (name === 'data-density') out.push({ line, rule: 'L1', msg: `<${tag} data-density> —— 浮層不准用總開關鎖密度(連控制項一起鎖 → 選項對不上觸發點)` })
        if (name === 'data-layout-space') {
          const v = attrValue(a)
          if (rel !== POPOVER_FILE) out.push({ line, rule: 'L2', msg: `<${tag} data-layout-space> —— 只有 Popover 可以鎖版面間距` })
          else if (v !== 'md') out.push({ line, rule: 'L2', msg: `Popover 版面間距只能鎖 md(寫的是 ${JSON.stringify(v)})` })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** L4:浮層表 vs 原始碼 vs 規格表。files:路徑 → 內容(對照組可替換)。 */
export function checkPolicy(read) {
  const out = []
  for (const o of OVERLAY_POLICY) {
    const src = read(o.file)
    const uses = /\buseTriggerRegionDensity\s*\(/.test(src)
    if (o.follows === 'trigger' && !uses) out.push(`${o.file}:${o.name} 的密度來源是「觸發點」,原始碼沒有呼叫 useTriggerRegionDensity()`)
    if (o.follows === 'page' && uses) out.push(`${o.file}:${o.name} 蓋住整頁、密度跟整頁,原始碼卻呼叫了 useTriggerRegionDensity()`)
  }
  const spec = read(SPEC)
  const sec = spec.split('#### 浮層跟觸發點')[1]?.split('\n### ')[0] ?? ''
  if (!sec) out.push(`${SPEC}:找不到「#### 浮層跟觸發點」那一節(規格表被移走 → 先改本閘)`)
  for (const o of OVERLAY_POLICY) {
    const row = sec.split('\n').find((l) => new RegExp(`^\\|\\s*${o.name}\\b`).test(l))
    if (!row) { out.push(`${SPEC}:情境 1 表沒有 ${o.name} 那一列`); continue }
    const source = row.split('|')[2] ?? ''
    const want = o.follows === 'trigger' ? '觸發點' : '整頁'
    if (!source.includes(want)) out.push(`${SPEC}:情境 1 表 ${o.name} 那一列的密度來源寫「${source.trim()}」,浮層表是「${want}」`)
    const lock = row.split('|')[3] ?? ''
    if (o.lockLayoutSpace && !lock.includes(`data-layout-space="${o.lockLayoutSpace}"`)) out.push(`${SPEC}:情境 1 表 ${o.name} 那一列的鎖應為 data-layout-space="${o.lockLayoutSpace}"`)
    if (!o.lockLayoutSpace && !lock.includes('不鎖')) out.push(`${SPEC}:情境 1 表 ${o.name} 那一列應為「不鎖」`)
  }
  return out
}

const readRepo = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')

function selftest() {
  const popoverSrc = readRepo(POPOVER_FILE)
  const cases = [
    ['浮層內容寫 data-density', () => checkSource('<PopoverContent data-density="md" />'), 'L1'],
    ['Radix 原生內容寫 data-density', () => checkSource('<DropdownMenuPrimitive.Content data-density="lg">x</DropdownMenuPrimitive.Content>'), 'L1'],
    ['Dialog 鎖版面間距', () => checkSource('<DialogPrimitive.Content data-layout-space="lg" />', 'packages/design-system/src/components/Dialog/dialog.tsx'), 'L2'],
    // 只換屬性那一行(註解裡也有同一串字;換到註解 = 對照組沒改到東西)
    ['Popover 鎖成 lg', () => {
      const bad = popoverSrc.replace(/^(\s*)data-layout-space="md"\s*$/m, '$1data-layout-space="lg"')
      if (bad === popoverSrc) throw new Error('對照組注入沒有改到 popover.tsx 的屬性行 —— INSTRUMENT-FAIL')
      return checkSource(bad, POPOVER_FILE)
    }, 'L2'],
    ['header 上 lockDensity', () => checkSource('<ChromeHeader lockDensity="lg" />'), 'L3'],
    ['小浮層沒接 useTriggerRegionDensity', () => checkPolicy((f) => (f.endsWith('hover-card.tsx') ? readRepo(f).replace(/useTriggerRegionDensity\s*\(/g, 'noop(') : readRepo(f))).map(() => ({ rule: 'L4' })), 'L4'],
    ['Dialog 接了 useTriggerRegionDensity', () => checkPolicy((f) => (f.endsWith('dialog.tsx') ? `${readRepo(f)}\nuseTriggerRegionDensity()` : readRepo(f))).map(() => ({ rule: 'L4' })), 'L4'],
    ['規格表把 HoverCard 寫成跟整頁', () => checkPolicy((f) => (f === SPEC ? readRepo(f).replace(/^\| HoverCard \| 觸發點那一區 \|/m, '| HoverCard | 整頁 |') : readRepo(f))).map(() => ({ rule: 'L4' })), 'L4'],
  ]
  const greens = [
    ['註解裡提到 lockDensity="lg"', () => checkSource('// 原 lockDensity="lg" 只鎖 header\nconst a = 1')],
    ['一般 div 上的區塊密度', () => checkSource('<div data-density="lg"><Select /></div>')],
    ['Popover 本人鎖 md', () => checkSource(popoverSrc, POPOVER_FILE)],
    ['現況的浮層表與規格', () => checkPolicy(readRepo)],
  ]
  let ok = true
  for (const [n, run, rule] of cases) {
    const got = run()
    const pass = got.some((v) => v.rule === rule)
    console.log(`  ${pass ? '✓' : '✗'} 該紅(${rule}):${n} —— 實得 ${got.length} 筆`)
    if (!pass) ok = false
  }
  for (const [n, run] of greens) {
    const got = run()
    console.log(`  ${got.length === 0 ? '✓' : '✗'} 該綠:${n} —— 實得 ${got.length} 筆${got.length ? `:${JSON.stringify(got[0])}` : ''}`)
    if (got.length) ok = false
  }
  return ok
}

if (process.argv.includes('--selftest')) {
  console.log('overlay-density-lock-invariant selftest:')
  process.exit(selftest() ? 0 : 1)
}

const files = [
  ...globSync('packages/design-system/src/**/*.tsx', { cwd: ROOT }),
  ...globSync('apps/*/src/**/*.tsx', { cwd: ROOT }),
]
const v = []
for (const rel of files) for (const f of checkSource(readRepo(rel), rel)) v.push(`  - ${rel}:${f.line} [${f.rule}] ${f.msg}`)
for (const m of checkPolicy(readRepo)) v.push(`  - [L4] ${m}`)
if (v.length) { console.error('❌ 浮層密度寫法不符 density.spec.md 情境 1:'); console.error(v.join('\n')); process.exit(1) }
console.log(`✓ overlay-density-lock-invariant:${files.length} 檔(元件 / pattern / story / apps)L1–L3 0 違規;浮層表 ${OVERLAY_POLICY.length} 列與原始碼、規格一致`)
