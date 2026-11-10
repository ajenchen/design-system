#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 浮層標題列(SurfaceHeader 家族:Dialog / Sheet / Popover / DataTable 狀態面板 …)的右側按鈕位照
 *         `patterns/overlay-surface/overlay-surface.spec.md`「SurfaceHeader」右側按鈕位:consumer 只傳按鈕(`actions`)與 ×(`dismiss`),
 *         由 SurfaceHeader 排 ——〔操作 …〕〔分隔線〕〔×〕,× 永遠最右、右緣貼齊標題列內距;操作之間 8;
 *         操作與 × 都有時**自動**放一條分隔線,兩側各 12(`action-bar.spec.md`「五、分隔線規則」第 3 條 + 「分隔線幾何」);
 *         只有操作或只有 × 時不放;無外框的操作與 × 同一條中線;放有外框按鈕時按鈕中線 = 標題中線。
 *         兩層:(1) 靜態 —— 原始碼裡任何 SurfaceHeader / DialogHeader / SheetHeader / PopoverHeader 的 children 不得自刻分隔線
 *         (`<ButtonDivider`)或在 `hideClose` 後自己塞 ×;(2) 幾何 —— 量 getBoundingClientRect 的數字(M32),不讀 class,標準 / 寬鬆都量。
 *   紅: 任一處不符 → 指名「哪一格、哪一項、差多少」並 exit 1。例:2026-11-10 修前(main 8eb473c7)DataTable 欄位顯示面板
 *       「恢復預設 ←8→ │ ←8→ ×」(應 12 / 12);排序 / 篩選面板與 DialogHeader 的分隔線寫在 children 裡(靜態)。
 *       該量到的東西少於下限 = 儀器失效(INSTRUMENT-FAIL),exit 1,不讀成通過。
 *       `--selftest` 對照組:(a) 判定函式吃實測數字(修前 8 → 紅、12 → 綠;多一條 / 少一條 / × 不在最右 → 紅);
 *       (b) 靜態掃描吃假原始碼(children 裡的分隔線 → 紅、只出現在註解裡 → 綠、hideClose 後自塞 × → 紅);
 *       (c) 頁面上拿掉分隔線兩側 4px → 每條分隔線兩側必紅(= 8)、其他不受牽連;(d) 藏掉分隔線 → 每個「操作 + ×」格的條數必紅;
 *       (e) 標題列改 align-items:flex-start → 有外框按鈕那格的標題中線必紅。
 *   綠: 全部在容許值內、每一格都量到、靜態掃描掃到下限以上的標題列。
 *
 * 出處:user 2026-10-30T05:31:55Z(逐字):「到底 header 的 ssot 右側有沒有置放按鈕的位置？ / 像 AI agent header 那樣，且其中按鈕和排列會遵循 action bar? /
 *       所以所有繼承此 ssot 的 header 都應該會有相同能力？ / 這些排列應該都有定義過？ / 我只是想要確認消費者是否能輕易在右側按照規則放按鈕」(問句;
 *       規則本身早已存在,本閘只驗機制,不新增規則)。
 * Run: `node scripts/overlay-header-actions-invariant.mjs [--static=dir] [--selftest] [--json=out]`
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  INSTRUMENT_FAIL_MARKER,
  openStory,
  StoryRenderInstrumentError,
  launchBrowserOrSkip,
  requireFreshStorybookBuild,
} from './lib/launch-browser.mjs'

const ROOT = process.cwd()
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const staticArg = arg('static')
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(ROOT, staticArg)) : join(ROOT, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const DENSITIES = ['md', 'lg']
const JSON_OUT = arg('json')
const SRC = join(ROOT, 'packages/design-system/src')
const STATIC_MIN_BLOCKS = 20 // 2026-11-10 全樹 SurfaceHeader 家族標題列 76 個(含 story;註解不算);少於下限 = 掃描壞了

// ── (1) 靜態:children 不得自刻分隔線 / hideClose 後自塞 × ─────────────────────────
const HEADER_TAGS = ['SurfaceHeader', 'DialogHeader', 'SheetHeader', 'PopoverHeader']
const blank = (m) => m.replace(/[^\n]/g, '') // 註解換成同樣多的換行:行號照原檔
const stripComments = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, blank).replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^\s*\/\/.*$/gm, '').replace(/`[^`\n]*`/g, '``')

// 開頭標籤結尾:第一個不在 {…} / 字串裡的 `>`(屬性值可任意巢狀,如 actions={<Button onClick={() => f({ a: 1 })} />})
function openTagEnd(code, start) {
  let depth = 0
  let quote = null
  for (let i = start + 1; i < code.length; i++) {
    const ch = code[i]
    if (quote) { if (ch === quote && code[i - 1] !== '\\') quote = null; continue }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '>' && depth === 0) { const text = code.slice(start, i + 1); return [text, code[i - 1] === '/' ? '/' : ''] }
  }
  return null
}

export function scanSource(text, file = '<memory>') {
  const code = stripComments(text)
  const found = []
  let blocks = 0
  for (const tag of HEADER_TAGS) {
    const open = new RegExp(`<${tag}\\b`, 'g')
    let m
    while ((m = open.exec(code))) {
      const start = m.index
      const head = openTagEnd(code, start)
      if (!head) { found.push({ file, line: code.slice(0, start).split('\n').length, tag, kind: 'unparsed', why: `<${tag}> 的開頭標籤讀不完(掃描器壞了,不是通過)` }); continue }
      blocks++
      if (head[1] === '/') continue
      let depth = 1
      const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g')
      re.lastIndex = start + head[0].length
      let end = -1
      let t
      while ((t = re.exec(code))) {
        depth += t[0].startsWith('</') ? -1 : 1
        if (depth === 0) { end = t.index; break }
      }
      const body = end < 0 ? '' : code.slice(start + head[0].length, end)
      const line = code.slice(0, start).split('\n').length
      if (/<ButtonDivider\b/.test(body)) found.push({ file, line, tag, kind: 'hand-divider', why: `<${tag}> 的 children 裡自刻分隔線(應交給 SurfaceHeader 的 actions / dismiss 位)` })
      if (tag === 'PopoverHeader' && /\bhideClose\b/.test(head[0]) && /PopoverClose|\bdismiss\b/.test(body)) {
        found.push({ file, line, tag, kind: 'hand-close', why: '<PopoverHeader hideClose> 後在 children 自己塞 ×(應用 PopoverHeader 內建的 × + actions)' })
      }
    }
  }
  return { found, blocks }
}

function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (p.endsWith('.tsx')) acc.push(p)
  }
  return acc
}

function scanTree() {
  let blocks = 0
  const found = []
  for (const f of walk(SRC)) {
    if (f.endsWith('/patterns/overlay-surface/overlay-surface.tsx')) continue // 機制本身(分隔線就住這裡)
    const r = scanSource(readFileSync(f, 'utf8'), relative(ROOT, f))
    blocks += r.blocks
    found.push(...r.found)
  }
  return { blocks, found }
}

const STATIC_TABLE = [
  ['children 裡自刻分隔線(修前 data-table-sort-manager.tsx 的寫法)', '<SurfaceHeader className={X}>\n  <PopoverTitle>排序</PopoverTitle>\n  {r && <ButtonDivider />}\n  <PopoverClose asChild><Button dismiss /></PopoverClose>\n</SurfaceHeader>', 1],
  ['分隔線只出現在註解裡', '<SurfaceHeader>\n  {/* 含 ButtonDivider 對齊 */}\n  // <ButtonDivider />\n  <PopoverTitle>排序</PopoverTitle>\n</SurfaceHeader>', 0],
  ['hideClose 後自塞 ×(修前 data-table-column-visibility-panel.tsx 的寫法)', '<PopoverHeader hideClose>\n  <div><PopoverTitle>欄位顯示</PopoverTitle><PopoverClose asChild><Button dismiss /></PopoverClose></div>\n</PopoverHeader>', 1],
  ['走 actions / dismiss 位', '<SurfaceHeader actions={<Button />} dismiss={<PopoverClose asChild><Button dismiss /></PopoverClose>}>\n  <PopoverTitle>排序</PopoverTitle>\n</SurfaceHeader>', 0],
  ['屬性值三層巢狀照樣讀完', '<SurfaceHeader actions={<Button onClick={() => f({ a: 1 })} />}>\n  <ButtonDivider />\n</SurfaceHeader>', 1],
  ['巢狀同名標籤不提早結束', '<DialogHeader actions={a}>\n  <DialogHeader><DialogTitle /></DialogHeader>\n  <ButtonDivider />\n</DialogHeader>', 1],
]

// ── (2) 幾何 ──────────────────────────────────────────────────────────────
const TOL = 0.5
const TOL_TITLE = 1
const TARGETS = [
  { id: 'design-system-internal-patterns-overlay-surface--header-actions', cases: 8 },
  { id: 'design-system-components-datatable-展示--header-actions-fixture', cases: 2 }, // 排序 / 篩選面板;欄位顯示面板 = PopoverHeader actions,由上一則 popover-header 那格量
]
const KIND_NAME = {
  'has-dismiss': '× 有 / 無',
  'has-actions': '操作有 / 無',
  'divider-count': '分隔線條數',
  'right-edge': '最右鈕右緣 → 標題列內距右緣(應 0)',
  'x-last': '× 在最右',
  'gap-actions': '操作之間(應 8)',
  'gap-action-divider': '最後一個操作 → 分隔線(應 12)',
  'gap-divider-x': '分隔線 → ×(應 12)',
  'v-center': '無外框操作中線 − × 中線',
  'title-center': '有外框按鈕中線 − 標題中線',
}

export function judgeProbe(p) {
  const near = (v, want, tol) => ({ ok: Math.abs(v - want) <= tol, why: `${v.toFixed(2)}px(應 ${want} ± ${tol})` })
  switch (p.kind) {
    case 'has-dismiss':
    case 'has-actions':
    case 'divider-count':
      return { ok: p.expect === p.got, why: `應 ${p.expect},實得 ${p.got}` }
    case 'x-last':
      return { ok: p.ok === true, why: p.ok ? '× 最右' : '× 右邊還有其他按鈕' }
    case 'right-edge': return near(p.value, 0, TOL)
    case 'gap-actions': return near(p.value, 8, TOL)
    case 'gap-action-divider':
    case 'gap-divider-x': return near(p.value, 12, TOL)
    case 'v-center': return near(p.value, 0, TOL)
    case 'title-center': return near(p.value, 0, TOL_TITLE)
    default: return { ok: false, why: `未知量測 ${p.kind}` }
  }
}

function measurePage() {
  const out = []
  const errors = []
  const r = (n) => Math.round(n * 100) / 100
  const mid = (el) => { const b = el.getBoundingClientRect(); return b.top + b.height / 2 }
  const cases = [...document.querySelectorAll('[data-case][data-expect]')]
  for (const c of cases) {
    const name = c.getAttribute('data-case')
    const expect = new Set(c.getAttribute('data-expect').split(','))
    const h = c.querySelector('[data-slot="surface-header"]')
    if (!h) { errors.push(`${name}:找不到 SurfaceHeader`); continue }
    const btns = [...h.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0)
    const x = btns.find((b) => b.hasAttribute('data-dismiss'))
    const acts = btns.filter((b) => b !== x)
    const divs = [...h.querySelectorAll('[data-action-divider]')].filter((d) => d.getBoundingClientRect().width > 0)
    const hr = h.getBoundingClientRect()
    const hcs = getComputedStyle(h)
    const contentRight = hr.right - parseFloat(hcs.borderRightWidth) - parseFloat(hcs.paddingRight)
    out.push({ kind: 'has-dismiss', case: name, expect: expect.has('dismiss'), got: Boolean(x) })
    out.push({ kind: 'has-actions', case: name, expect: expect.has('actions'), got: acts.length > 0 })
    out.push({ kind: 'divider-count', case: name, expect: expect.has('actions') && expect.has('dismiss') ? 1 : 0, got: divs.length })
    const last = x ?? acts.at(-1)
    if (last) {
      out.push({ kind: 'right-edge', case: name, value: r(contentRight - last.getBoundingClientRect().right) })
      if (x) out.push({ kind: 'x-last', case: name, ok: btns.at(-1) === x })
    }
    for (let i = 1; i < acts.length; i++) {
      out.push({ kind: 'gap-actions', case: name, value: r(acts[i].getBoundingClientRect().left - acts[i - 1].getBoundingClientRect().right) })
    }
    if (x && acts.length && divs.length === 1) {
      const d = divs[0].getBoundingClientRect()
      out.push({ kind: 'gap-action-divider', case: name, value: r(d.left - acts.at(-1).getBoundingClientRect().right) })
      out.push({ kind: 'gap-divider-x', case: name, value: r(x.getBoundingClientRect().left - d.right) })
    }
    if (x) for (const a of acts) if (a.hasAttribute('data-unbounded')) out.push({ kind: 'v-center', case: name, value: r(mid(a) - mid(x)) })
    if (expect.has('bounded')) {
      const b = acts.find((a) => !a.hasAttribute('data-unbounded'))
      const title = h.querySelector('[data-header-part="title"]')
      if (!b || !title) errors.push(`${name}:找不到有外框按鈕或標題`)
      else out.push({ kind: 'title-center', case: name, value: r(mid(b) - mid(title)) })
    }
  }
  return { out, errors, cases: cases.length }
}

async function runPages(page, sv, sabotage) {
  const rows = []
  const instrument = []
  for (const density of DENSITIES) for (const t of TARGETS) {
    const url = `${sv.origin}/iframe.html?id=${encodeURIComponent(t.id)}&viewMode=story&globals=${encodeURIComponent(`density:${density}`)}`
    let res
    try {
      res = await openStory(page, url, {
        settleFrames: 10,
        notFound: sv.notFound,
        waitFor: () => document.querySelectorAll('[data-case] [data-slot="surface-header"]').length > 0,
        beforeSettle: sabotage?.css ? async (p) => { await p.addStyleTag({ content: sabotage.css }) } : null,
        probe: measurePage,
      })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      instrument.push(`${t.id}(${density}):${error.message}`)
      continue
    }
    const m = res.probe
    for (const e of m.errors) instrument.push(`${t.id}(${density}):${e}`)
    if (m.cases < t.cases) instrument.push(`${t.id}(${density}):只量到 ${m.cases} 格(下限 ${t.cases})`)
    for (const p of m.out) {
      const j = judgeProbe(p)
      rows.push({ ...p, story: t.id, density, ok: j.ok, why: j.why, label: `${p.case} / ${density} / ${KIND_NAME[p.kind]}` })
    }
  }
  return { rows, instrument }
}

const JUDGE_TABLE = [
  ['欄位顯示面板 恢復預設 → 分隔線(修前 main 8eb473c7 實測 8)', { kind: 'gap-action-divider', value: 8 }, false],
  ['欄位顯示面板 分隔線 → ×(修前實測 8)', { kind: 'gap-divider-x', value: 8 }, false],
  ['分隔線兩側 12(規格)', { kind: 'gap-divider-x', value: 12 }, true],
  ['操作 + × 卻沒有分隔線', { kind: 'divider-count', expect: 1, got: 0 }, false],
  ['兩條分隔線(自刻 + 自動疊加)', { kind: 'divider-count', expect: 1, got: 2 }, false],
  ['只有 × 卻有分隔線', { kind: 'divider-count', expect: 0, got: 1 }, false],
  ['× 不在最右', { kind: 'x-last', ok: false }, false],
  ['標題列整列靠上、有外框按鈕(n7 實測差 2)', { kind: 'title-center', value: 2 }, false],
]

const PAGE_SABOTAGE = [
  ['拿掉分隔線兩側 4px', { css: '[data-action-divider]{margin-left:0!important;margin-right:0!important}' },
    (res) => {
      const g = res.rows.filter((r) => r.kind === 'gap-action-divider' || r.kind === 'gap-divider-x')
      return g.length > 0 && g.every((r) => !r.ok && Math.abs(r.value - 8) <= 0.25)
        && res.rows.filter((r) => !g.includes(r) && r.kind !== 'right-edge' && r.kind !== 'gap-actions').every((r) => r.ok)
    }],
  ['藏掉分隔線', { css: '[data-action-divider]{display:none!important}' },
    (res) => {
      const d = res.rows.filter((r) => r.kind === 'divider-count')
      return d.some((r) => r.expect === 1) && d.every((r) => (r.expect === 1 ? !r.ok : r.ok))
    }],
  ['標題列改 align-items:flex-start', { css: '[data-slot="surface-header"]{align-items:flex-start!important}' },
    (res) => {
      const t = res.rows.filter((r) => r.kind === 'title-center')
      return t.length > 0 && t.every((r) => !r.ok) && res.rows.filter((r) => r.kind === 'v-center').every((r) => r.ok)
    }],
]

const problems = []

// 靜態(不需要 build;先跑)
const tree = scanTree()
if (SELFTEST) {
  for (const [name, src, want] of STATIC_TABLE) {
    const n = scanSource(src).found.length
    if (n === want) console.log(`✓ 對照組 (b):${name} → ${want ? '紅' : '綠'}`)
    else problems.push(`對照組 (b):${name} 應找到 ${want} 處,實得 ${n}`)
  }
  for (const [name, p, expectOk] of JUDGE_TABLE) {
    const j = judgeProbe(p)
    if (j.ok === expectOk) console.log(`✓ 對照組 (a):${name} → ${expectOk ? '綠' : '紅'}(${j.why})`)
    else problems.push(`對照組 (a):${name} 應${expectOk ? '綠' : '紅'},實得 ${j.ok ? '綠' : '紅'}(${j.why})`)
  }
} else {
  for (const f of tree.found) problems.push(`${f.file}:${f.line}:${f.why}`)
  console.log(`${tree.found.length ? '✗' : '✓'} 靜態:掃 ${tree.blocks} 個標題列,自刻 ${tree.found.length} 處`)
}
if (tree.blocks < STATIC_MIN_BLOCKS) {
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:靜態只掃到 ${tree.blocks} 個標題列(下限 ${STATIC_MIN_BLOCKS})`)
  process.exit(1)
}
if (problems.length) {
  console.log(`\n✗ ${SELFTEST ? 'selftest' : '浮層標題列右側按鈕位'}(靜態):\n  ${problems.join('\n  ')}`)
  if (SELFTEST) process.exit(1) // 一般模式繼續量幾何,最後一起 exit 1(修前紅要兩層都看得到)
}

requireFreshStorybookBuild(S, [
  'packages/design-system/src/patterns/overlay-surface/overlay-surface.tsx',
  'packages/design-system/src/patterns/overlay-surface/overlay-surface.stories.tsx',
  'packages/design-system/src/components/Dialog/dialog.tsx',
  'packages/design-system/src/components/Sheet/sheet.tsx',
  'packages/design-system/src/components/Popover/popover.tsx',
  'packages/design-system/src/components/Button/button-group.tsx',
  'packages/design-system/src/components/DataTable/data-table-column-visibility-panel.tsx',
  'packages/design-system/src/components/DataTable/data-table-sort-manager.tsx',
  'packages/design-system/src/components/DataTable/data-table-filter-panel.tsx',
  'packages/design-system/src/components/DataTable/data-table.stories.tsx',
])
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const br = await launchBrowserOrSkip({}, { cleanup: () => sv.stop() })
const page = await br.newPage({ viewport: { width: 1280, height: 900 } })
const finish = async (code) => { await br.close(); await sv.stop(); process.exit(code) }

const base = await runPages(page, sv, null)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(base.rows, null, 1))
if (!SELFTEST) {
  for (const r of base.rows) console.log(`${r.ok ? '✓' : '✗'} ${r.label}:${r.why}`)
  const bad = base.rows.filter((r) => !r.ok)
  if (bad.length) problems.push(`${bad.length} 處右側按鈕位不符:\n    ${bad.map((r) => `${r.label}:${r.why}`).join('\n    ')}`)
}
if (base.instrument.length) {
  console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}(沒量到 ≠ 沒有錯):\n  ${base.instrument.join('\n  ')}`)
  if (problems.length) console.log(`\n✗ 浮層標題列右側按鈕位:\n  ${problems.join('\n  ')}`)
  await finish(1)
}
if (SELFTEST) {
  const baseBad = base.rows.filter((r) => !r.ok)
  if (baseBad.length) problems.push(`前提不成立:未破壞的頁面就有 ${baseBad.length} 處不符(${baseBad[0].label}:${baseBad[0].why})`)
  for (const [name, sabotage, isRed] of PAGE_SABOTAGE) {
    const run = await runPages(page, sv, sabotage)
    if (run.instrument.length) { console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}(對照組「${name}」):\n  ${run.instrument.join('\n  ')}`); await finish(1) }
    const red = run.rows.filter((r) => !r.ok)
    if (isRed(run)) console.log(`✓ 對照組「${name}」→ ${red.length} / ${run.rows.length} 處紅${red[0] ? `(例:${red[0].label}:${red[0].why})` : ''}`)
    else problems.push(`對照組「${name}」沒有讓指定的量測紅(紅 ${red.length} / ${run.rows.length})—— 量具無效;`
      + `${run.rows.filter((r) => !r.ok).slice(0, 8).map((r) => `${r.label}:${r.why}`).join(' / ')}`)
  }
}
if (problems.length) {
  console.log(`\n✗ ${SELFTEST ? 'selftest' : '浮層標題列右側按鈕位'}:\n  ${problems.join('\n  ')}`)
  await finish(1)
}
console.log(SELFTEST
  ? '\n✓ selftest:判定表、靜態假原始碼、拿掉分隔線兩側 4px、藏掉分隔線、整列靠上 各自讓閘紅 —— 量具會紅'
  : `\n✅ 浮層標題列右側按鈕位:靜態 ${tree.blocks} 個標題列 0 自刻;${TARGETS.length} 則 story × ${DENSITIES.length} 種密度共 ${base.rows.length} 項全部在容許值內`)
await finish(0)
