#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable 巢狀篩選面板(`mode="nested"`)的群組間距照 data-table.spec.md「L4 › 四、UI canonical」的「巢狀群組的間距」
 *         (2026-11-13 補寫的規格句;數值都是既有程式的值、畫面沒有改;歸到哪一條規則是【AI 推導 2026-11-13】,user 沒有逐字講過這一段):
 *           T  面板標題列底 → 第一個灰底群組頂 = 面板 body 讀到的 --layout-space-tight(layoutSpace.spec.md 規則 2:群組在面板這一層是並列的 element);
 *           P  群組框四邊內距 = 8(框內第一條條件 / 最後一排「加入巢狀篩選」到框的四邊);
 *           R  框內列距 = 8(條件 ↔ 條件、最後一條 → 「加入巢狀篩選」那一排);
 *           L  框外左邊 Where / And / Or 標籤的頂 = 框內第一條條件的頂(標籤包層的上內距 8 = 框的上內距);
 *           G  群組 ↔ 群組 = 面板 body 讀到的 --layout-space-tight;
 *           D  框內的 8(P、R)一般 / 大兩種密度同值(元件內部固定值,不跟密度);頁面根的 loose 兩種密度必須不同(密度有套上,否則儀器失效)。
 *   紅: 任一段與期望值差 > 0.5px → 指名密度 / 哪一個群組 / 哪一段 / 數字並 exit 1。
 *       `--selftest`:(a) 判定表(純函式 judge)—— 每一段各有該紅、該綠、儀器失效;(b) 真建置上先量一趟現況(必綠),再逐一在頁面上拆掉一段
 *       (群組框內距改 12 / 框內列距改 12 / 第一個群組往下推 4px / 標籤上內距歸零 / 第二個群組往下推 4px / 框內距改成跟密度走),
 *       每一種必須紅在它負責的那一段 —— 少一種沒紅 = 量具沒在量它宣稱的東西 → exit 1。
 *   綠: 現況每一段都等於期望值,md / lg 兩種密度。純幾何(getBoundingClientRect / computed token),等群組框本身出現、動畫跑完才量;重複跑恆等。
 *   量法(M32:量像素,不看 class): 靜態站開 DataTable 展示「篩選面板的各種狀態」(globals density),等 `[data-panel-filter-group]`(GroupBlock 的灰底框,
 *         data-table-filter-group.tsx)本身出現、`document.getAnimations()` 沒有跑動中的動畫。面板 = 第一個「body 裡有 ≥ 2 個群組框」的 SurfaceBody
 *         (`[data-slot="surface-body"]`)與同一個外殼裡的 SurfaceHeader;群組框的子元素 = 條件列 … +「加入巢狀篩選」那一排(最後一個)。
 *         至少要量到 2 個群組、其中一個有 ≥ 2 條條件(才量得到 G 與「條件 ↔ 條件」);範例若改到量不到 = 儀器失效,不讀成通過。
 *         找不到群組框(例:定位屬性加上之前的建置)= 儀器失效。
 *   `--static=<dir>` 指定建置(對照組用);指定時不跑新鮮度守衛。
 *
 * 出處:tmp wip MASTER-TODO A5「五處元件間距」之 ⑤(篩選條件群組頂部)。這一處 user 沒有逐字講過;「依原則推導」是 AI 在成品頁列的做法,
 * 複核結論 = 現況已符合、畫面不動、只補規格句與這支閘。「標題列 → 群組 = tight」與平鋪模式是同一行程式(SurfaceBody 的上內距),
 * 平鋪那一格由 header-first-gap-invariant.mjs 的 datatable-filter-panel 守;本閘守巢狀那一則與群組框內的固定值。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const STORY = 'design-system-components-datatable-展示--filter-panel-states'
const GROUP = '[data-panel-filter-group]'
const DENSITIES = ['md', 'lg']
const TOL = 0.5
/** 群組框內的固定值(data-table.spec.md「巢狀群組的間距」:四邊內距 8、框內列距 8;元件內部固定,不跟密度)。 */
const GROUP_INNER = 8
const SOURCES = [
  'packages/design-system/src/components/DataTable/data-table-filter-group.tsx',
  'packages/design-system/src/components/DataTable/data-table-filter-panel.tsx',
  'packages/design-system/src/components/DataTable/data-table.stories.tsx',
  'packages/design-system/src/patterns/overlay-surface/overlay-surface.tsx',
  'packages/design-system/src/tokens/layoutSpace/layoutSpace.css',
]

const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= TOL

/**
 * 純函式:[{ density, err?, tight, rootLoose, headerToGroup, groupGaps: number[], groups: [{ pad: { top, right, bottom, left }, rowGaps: number[], labelDelta, conditions }] }]
 * → 不符合的訊息清單(呼叫端與 selftest 共用)。訊息開頭的 [T] / [P] / [R] / [L] / [G] / [D] = 檔頭契約的那一段。
 */
export function judge(rows) {
  const failures = []
  const inner = {}
  for (const r of rows) {
    const where = `@${r.density}`
    if (r.err) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} ${r.err}`); continue }
    if (!(r.tight > 0) || !(r.rootLoose > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-tight / 頁面根的 --layout-space-loose`); continue }
    if (!Array.isArray(r.groups) || r.groups.length < 2 || !r.groups.some((g) => g.conditions >= 2)) {
      failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 巢狀面板要量到 ≥ 2 個群組、其中一個有 ≥ 2 條條件(量到 ${r.groups?.length ?? 0} 個群組、條件數 ${JSON.stringify((r.groups ?? []).map((g) => g.conditions))})—— 範例換了,量不到「群組 ↔ 群組」或「條件 ↔ 條件」`)
      continue
    }
    const measured = [r.headerToGroup, ...r.groupGaps, ...r.groups.flatMap((g) => [g.pad.top, g.pad.right, g.pad.bottom, g.pad.left, g.labelDelta, ...g.rowGaps])]
    if (!measured.every(Number.isFinite) || r.groupGaps.length !== r.groups.length - 1 || r.groups.some((g) => g.rowGaps.length < 1)) {
      failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 有一段沒量到(標題列 → 群組 ${r.headerToGroup}、群組間 ${JSON.stringify(r.groupGaps)}、群組 ${JSON.stringify(r.groups)})`)
      continue
    }
    if (!near(r.headerToGroup, r.tight)) failures.push(`[T] ${where} 面板標題列底 → 第一個群組頂 = ${r.headerToGroup}px,應 ${r.tight}(layoutSpace 規則 2:群組在面板這一層是 element → tight;data-table.spec.md「巢狀群組的間距」)`)
    r.groups.forEach((g, i) => {
      const who = `${where} 第 ${i + 1} 個群組`
      const pads = [['上', g.pad.top], ['右', g.pad.right], ['下', g.pad.bottom], ['左', g.pad.left]]
      const badPad = pads.filter(([, v]) => !near(v, GROUP_INNER))
      if (badPad.length) failures.push(`[P] ${who} 框的內距 ${pads.map(([s, v]) => `${s} ${v}`).join(' / ')}px,應四邊 ${GROUP_INNER}(元件內部固定值;不對的:${badPad.map(([s]) => s).join('、')})`)
      const badGap = g.rowGaps.filter((v) => !near(v, GROUP_INNER))
      if (badGap.length) failures.push(`[R] ${who} 框內列距 ${g.rowGaps.join(' / ')}px,應每一段 ${GROUP_INNER}(條件 ↔ 條件、最後一條 → 「加入巢狀篩選」)`)
      if (!near(g.labelDelta, 0)) failures.push(`[L] ${who} 框外標籤的頂比框內第一條條件的頂${g.labelDelta > 0 ? '低' : '高'} ${Math.abs(g.labelDelta)}px,應齊平(標籤包層的上內距 = 框的上內距 ${GROUP_INNER})`)
      ;(inner[i] ??= []).push({ density: r.density, values: [g.pad.top, g.pad.right, g.pad.bottom, g.pad.left, ...g.rowGaps] })
    })
    r.groupGaps.forEach((v, i) => { if (!near(v, r.tight)) failures.push(`[G] ${where} 第 ${i + 1} 個群組 → 第 ${i + 2} 個群組 = ${v}px,應 ${r.tight}(面板 body 的塊距 tight;有底色的獨立框之間必留間距)`) })
  }
  // [D] 框內的固定值不跟密度:同一個群組兩種密度量到的內距 / 列距逐項相同
  for (const [i, perDensity] of Object.entries(inner)) {
    if (perDensity.length < 2) continue
    const [a, b] = perDensity
    if (a.values.length !== b.values.length || a.values.some((v, k) => !near(v, b.values[k]))) failures.push(`[D] 第 ${Number(i) + 1} 個群組框內的內距 / 列距兩種密度不同(${a.density}:${a.values.join(' / ')};${b.density}:${b.values.join(' / ')})—— 這幾個值是元件內部固定值,不跟密度`)
  }
  // 密度有沒有套上看頁面根:兩種密度讀到同一個 loose = 兩趟量的是同一個畫面 = 儀器失效
  const looses = rows.filter((r) => !r.err && r.rootLoose > 0).map((r) => r.rootLoose)
  if (looses.length === DENSITIES.length && new Set(looses).size === 1) failures.push(`${INSTRUMENT_FAIL_MARKER}:兩種密度在頁面根讀到同一個 loose(${looses[0]})—— 密度沒套上`)
  return failures
}

/** 頁面函式:量巢狀面板的每一段(不得引用外層變數)。 */
export const probeGroups = ({ groupSelector }) => {
  const r1 = (x) => Math.round(x * 10) / 10
  const rect = (el) => el.getBoundingClientRect()
  const vis = (el) => { const r = rect(el); return r.width > 0 && r.height > 0 }
  const all = [...document.querySelectorAll(groupSelector)].filter(vis)
  if (!all.length) return { err: `找不到看得見的群組框 ${groupSelector}` }
  // 面板 = 第一個「body 裡有 ≥ 2 個群組框」的 SurfaceBody;同一個外殼裡的 SurfaceHeader(往上找到第一個含標題列的祖先)
  const bodies = [...new Set(all.map((g) => g.closest('[data-slot="surface-body"]')))].filter(Boolean)
  const body = bodies.find((b) => all.filter((g) => b.contains(g)).length >= 2) ?? bodies[0]
  if (!body) return { err: '群組框不在任何 SurfaceBody 裡' }
  let shell = body.parentElement
  while (shell && !shell.querySelector('[data-slot="surface-header"]')) shell = shell.parentElement
  const header = shell?.querySelector('[data-slot="surface-header"]')
  if (!header) return { err: '找不到這個面板的標題列(SurfaceHeader)' }
  const groups = all.filter((g) => body.contains(g))
  const num = (el, p) => parseFloat(getComputedStyle(el)[p]) || 0
  const token = (el, name) => parseFloat(getComputedStyle(el).getPropertyValue(name))
  const flow = (el) => [...el.children].filter((c) => { const cs = getComputedStyle(c); return cs.display !== 'none' && !/(absolute|fixed)/.test(cs.position) && vis(c) })
  const out = {
    tight: token(body, '--layout-space-tight'), loose: token(body, '--layout-space-loose'),
    rootLoose: token(document.querySelector('#storybook-root') ?? document.documentElement, '--layout-space-loose'),
    headerToGroup: r1(rect(groups[0]).top - rect(header).bottom),
    groupGaps: groups.slice(1).map((g, i) => r1(rect(g).top - rect(groups[i]).bottom)),
    groups: groups.map((g) => {
      const kids = flow(g)
      const gr = rect(g)
      const inner = { top: gr.top + num(g, 'borderTopWidth'), right: gr.right - num(g, 'borderRightWidth'), bottom: gr.bottom - num(g, 'borderBottomWidth'), left: gr.left + num(g, 'borderLeftWidth') }
      const first = kids[0], last = kids[kids.length - 1]
      const label = g.previousElementSibling?.firstElementChild ?? null
      return {
        conditions: Math.max(0, kids.length - 1),
        pad: first ? { top: r1(rect(first).top - inner.top), right: r1(inner.right - Math.max(...kids.map((k) => rect(k).right))), bottom: r1(inner.bottom - rect(last).bottom), left: r1(Math.min(...kids.map((k) => rect(k).left)) - inner.left) } : { top: NaN, right: NaN, bottom: NaN, left: NaN },
        rowGaps: kids.slice(1).map((k, i) => r1(rect(k).top - rect(kids[i]).bottom)),
        labelDelta: label && first ? r1(rect(label).top - rect(first).top) : NaN,
      }
    }),
  }
  return out
}

const noRunningAnimation = () => document.getAnimations().every((a) => a.playState !== 'running')

/** 頁面上拆掉一段(--selftest (b)):量測前一刻套上。each = [說明, 該紅的那一段, 頁面函式]。 */
const MUTATIONS = [
  ['群組框內距改 12', 'P', (sel) => { for (const g of document.querySelectorAll(sel)) g.style.setProperty('padding', '12px', 'important') }],
  ['框內列距改 12', 'R', (sel) => { for (const g of document.querySelectorAll(sel)) g.style.setProperty('row-gap', '12px', 'important') }],
  ['第一個群組往下推 4px', 'T', (sel) => { const g = document.querySelector(sel); if (g) g.parentElement.style.setProperty('margin-top', '4px', 'important') }],
  ['標籤包層的上內距歸零', 'L', (sel) => { for (const g of document.querySelectorAll(sel)) g.previousElementSibling?.style.setProperty('padding-top', '0px', 'important') }],
  ['第二個群組往下推 4px', 'G', (sel) => { const g = document.querySelectorAll(sel)[1]; if (g) g.parentElement.style.setProperty('margin-top', '4px', 'important') }],
  ['框內距改成跟密度走(--layout-space-tight)', 'D', (sel) => { for (const g of document.querySelectorAll(sel)) g.style.setProperty('padding', 'var(--layout-space-tight)', 'important') }],
]

async function measure({ mutate = null } = {}) {
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const rows = []
    for (const density of DENSITIES) {
      const url = `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story&globals=${encodeURIComponent(`theme:light;density:${density}`)}`
      await openStory(page, url, { waitFor: GROUP, label: STORY, notFound: server.notFound })
      await page.mouse.move(0, 0)
      let row
      try { await page.waitForFunction(noRunningAnimation, null, { timeout: 10_000 }) } catch { row = { err: '10 秒內動畫沒跑完' } }
      if (!row) {
        if (mutate) await page.evaluate(mutate, GROUP)
        row = await page.evaluate(probeGroups, { groupSelector: GROUP })
      }
      rows.push({ density, ...row })
    }
    return rows
  } finally { await browser.close(); await server.stop() }
}

const describe = (r) => (r.err ? `  @${r.density}  ${r.err}` : `  @${r.density}  標題列 → 群組 ${r.headerToGroup}(tight ${r.tight})  群組間 ${r.groupGaps.join(' / ')}  ${r.groups.map((g, i) => `〔群組 ${i + 1}:${g.conditions} 條條件、內距 上 ${g.pad.top} 右 ${g.pad.right} 下 ${g.pad.bottom} 左 ${g.pad.left}、列距 ${g.rowGaps.join(' / ')}、標籤頂差 ${g.labelDelta}〕`).join(' ')}`)

function selftestTable() {
  let ok = true
  const expect = (cond, msg) => { if (!cond) { console.error(`✗ selftest:${msg}`); ok = false } }
  const T = { md: { tight: 12, rootLoose: 16 }, lg: { tight: 16, rootLoose: 24 } }
  const group = (over = {}) => ({ conditions: 2, pad: { top: 8, right: 8, bottom: 8, left: 8 }, rowGaps: [8, 8], labelDelta: 0, ...over })
  const row = (density, over = {}) => ({ density, ...T[density], headerToGroup: T[density].tight, groupGaps: [T[density].tight], groups: [group(), group({ conditions: 1, rowGaps: [8] })], ...over })
  const both = (over) => DENSITIES.map((d) => row(d, typeof over === 'function' ? over(d) : over))
  const tagged = (failures, tag) => failures.filter((s) => s.startsWith(`[${tag}]`))
  expect(judge(both({})).length === 0, `現況的形狀應綠,實得 ${JSON.stringify(judge(both({})))}`)
  // T:標題列 → 群組用了 loose(把群組當 bounded region)→ 兩密度都紅
  const t = judge(both((d) => ({ headerToGroup: d === 'md' ? 16 : 24 })))
  expect(tagged(t, 'T').length === 2 && t.length === 2, `標題列 → 群組用 loose 應兩密度只紅 [T],實得 ${JSON.stringify(t)}`)
  // P:框內距改 12 → [P];只有一邊不對也紅並指名那一邊
  const p = judge(both({ groups: [group({ pad: { top: 12, right: 12, bottom: 12, left: 12 } }), group({ conditions: 1, rowGaps: [8] })] }))
  expect(tagged(p, 'P').length === 2 && p.length === 2, `框內距 12 應兩密度只紅 [P],實得 ${JSON.stringify(p)}`)
  const pOne = judge(both({ groups: [group({ pad: { top: 8, right: 8, bottom: 4, left: 8 } }), group({ conditions: 1, rowGaps: [8] })] }))
  expect(tagged(pOne, 'P').length === 2 && pOne.every((s) => s.includes('不對的:下')), `只有下內距不對應紅並指名「下」,實得 ${JSON.stringify(pOne)}`)
  // R:列距改 12 → [R]
  const r = judge(both({ groups: [group({ rowGaps: [12, 12] }), group({ conditions: 1, rowGaps: [8] })] }))
  expect(tagged(r, 'R').length === 2 && r.length === 2, `框內列距 12 應兩密度只紅 [R],實得 ${JSON.stringify(r)}`)
  // L:標籤比第一條條件高 8(標籤包層沒有上內距)→ [L]
  const l = judge(both({ groups: [group({ labelDelta: -8 }), group({ conditions: 1, rowGaps: [8] })] }))
  expect(tagged(l, 'L').length === 2 && l.length === 2 && l.every((s) => s.includes('高 8px')), `標籤沒對齊應兩密度只紅 [L],實得 ${JSON.stringify(l)}`)
  // G:群組 ↔ 群組用了 loose → [G]
  const g = judge(both((d) => ({ groupGaps: [d === 'md' ? 16 : 24] })))
  expect(tagged(g, 'G').length === 2 && g.length === 2, `群組間用 loose 應兩密度只紅 [G],實得 ${JSON.stringify(g)}`)
  // D:框內距跟著密度走(md 12 / lg 16)→ [P] 兩密度 + [D] 一筆;只在 lg 變(md 8 / lg 12)→ [P] @lg + [D]
  const scaled = (d) => ({ groups: [group({ pad: { top: T[d].tight, right: T[d].tight, bottom: T[d].tight, left: T[d].tight } }), group({ conditions: 1, rowGaps: [8] })] })
  const dAll = judge(both(scaled))
  expect(tagged(dAll, 'D').length === 1 && tagged(dAll, 'P').length === 2, `框內距跟密度走應紅 [D] 一筆 + [P] 兩密度,實得 ${JSON.stringify(dAll)}`)
  const dLg = judge([row('md'), row('lg', { groups: [group({ rowGaps: [12, 12] }), group({ conditions: 1, rowGaps: [8] })] })])
  expect(tagged(dLg, 'D').length === 1 && tagged(dLg, 'R').length === 1, `只有大密度的列距變了應紅 [D] + [R]@lg,實得 ${JSON.stringify(dLg)}`)
  // 儀器失效:沒量到 / token 讀不到 / 密度沒套上 / 群組不夠 / 某一段 NaN
  const inst = (rows) => judge(rows).some((s) => s.includes(INSTRUMENT_FAIL_MARKER))
  expect(inst([{ density: 'md', err: '找不到看得見的群組框' }, row('lg')]), '找不到群組框應判儀器失效')
  expect(inst([row('md', { tight: NaN }), row('lg')]), '讀不到 tight 應判儀器失效')
  expect(inst([row('md'), row('lg', { rootLoose: 16 })]), '兩密度頁面根同 loose 應判儀器失效')
  expect(inst(both({ groups: [group()], groupGaps: [] })), '只量到一個群組應判儀器失效(量不到群組 ↔ 群組)')
  expect(inst(both({ groups: [group({ conditions: 1, rowGaps: [8] }), group({ conditions: 1, rowGaps: [8] })] })), '沒有任何群組有 ≥ 2 條條件應判儀器失效(量不到條件 ↔ 條件)')
  expect(inst(both({ groups: [group({ labelDelta: NaN }), group({ conditions: 1, rowGaps: [8] })] })), '標籤沒量到應判儀器失效')
  expect(inst(both({ headerToGroup: NaN })), '標題列 → 群組沒量到應判儀器失效')
  return ok
}

async function selftest() {
  let ok = selftestTable()
  if (!staticArg) requireFreshStorybookBuild(STATIC, SOURCES)
  // (b) 真建置:現況必綠(紅燈來自拆法,不是頁面本來就壞),再逐一拆
  const baseline = await measure()
  const baseFailures = judge(baseline)
  if (baseFailures.length) { console.error(`✗ selftest:現況就紅 —— 基準不乾淨,對照組沒有意義\n  ${baseFailures.join('\n  ')}`); ok = false }
  for (const [what, tag, fn] of MUTATIONS) {
    const failures = judge(await measure({ mutate: fn }))
    const instrument = failures.filter((s) => s.includes(INSTRUMENT_FAIL_MARKER))
    const hit = failures.filter((s) => s.startsWith(`[${tag}]`))
    const caught = hit.length > 0 && instrument.length === 0
    console.log(`  ${caught ? '✓' : '✗'} 頁面對照:${what} → ${caught ? `紅在 [${tag}](${hit[0].slice(0, 80)}…)` : instrument.length ? `儀器失效(${instrument[0].slice(0, 120)})` : `沒紅在 [${tag}](實際紅:${failures.map((s) => s.slice(0, 3)).join(' ') || '無'})`}`)
    if (!caught) ok = false
  }
  console.log(ok ? `✅ data-table-filter-group-spacing selftest PASS(判定表 + 現況綠 + 頁面上 ${MUTATIONS.length} 種拆法各自紅)` : '❌ data-table-filter-group-spacing selftest FAIL')
  return ok
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    if (process.argv.includes('--selftest')) process.exit((await selftest()) ? 0 : 1)
    if (!staticArg) requireFreshStorybookBuild(STATIC, SOURCES)
    const rows = await measure()
    for (const r of rows) console.log(describe(r))
    const failures = judge(rows)
    if (failures.length) { console.error('❌ data-table-filter-group-spacing FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log(`✅ data-table-filter-group-spacing PASS(巢狀篩選面板 × md / lg:標題列 → 群組 = tight、群組框內距 / 列距 = ${GROUP_INNER}(不跟密度)、標籤頂對齊第一條條件、群組 ↔ 群組 = tight)`)
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
