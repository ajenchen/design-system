#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: chrome 標頭底下那塊內容的左 / 右 / 底三邊照 layoutSpace.spec.md(頂邊 = 規則 2,由 header-first-gap-invariant.mjs 管;兩支合起來 = 四邊):
 *         左右(規則 1、6):容器內緣 → 內容外框 = loose(規則 1「任何內容左右 padding 最終 = loose」)。誰給這段內距從 DOM 判 pattern ——
 *           AB = 容器或包層給(有框元件自帶 / 純結構的父層管);C = 每一列自帶(列是一串同樣內距的兄弟),此時列本身必須貼齊容器(0),
 *           hover 底色才會貼邊(規則 1 C、「常見誤解」第 2 條)。
 *         底(規則 4):最後一個內容 → 容器底(有捲動 = 捲動終點)依最後一個東西的角色 —— bounded region = loose、unbounded region = 0、
 *           element:容器擋住頁面或高度撐滿 = bottom(48);容器不擋頁面、高度貼著內容 = 與頂部同值(同一處量到的頂,上下對稱;
 *           頂距本身對不對是規則 2 的事,由原閘判)。容器被 max-height 卡住而在捲動 = 規則 4 沒寫的第三種 → 紅「待規格」,不默默套用任一列。
 *         盤點 = 原閘的 CASES(同一份,import;不在盤點裡的理由同原閘 NOT_COVERED),本檔只補每處的 SIDES 登記
 *         (最後一個東西的角色、容器種類、左右 pattern)。
 *   為何新增姊妹閘、不擴原閘(二擇一):原閘的名字與契約(規則 2 頂部)已被 ci.yml 註解、layoutSpace.spec.md、Sidebar / AppShell story 註解指名;
 *         左右與底的判準跟頂不同(規則 1 / 6 看誰給內距、規則 4 看最後一個東西 + 容器會不會擋頁 / 撐滿),拆開後紅燈直接指名是哪一條規則。
 *         盤點(CASES)、導航(openCase)、頁面端量具(pageKit)、角色判法(classifyFirst)全部從原閘 import —— 判法只有一個住所(M17),
 *         新增一處只改原閘 CASES + 本檔 SIDES(selftest 驗兩邊一一對應)。
 *   紅: 任一處任一邊與期望值差 > 0.5px → 指名 case / 密度 / 邊 / 數字 / 規則並 exit 1;
 *       DOM 判出的最後一個東西角色、容器種類、左右 pattern ≠ 登記 → 紅(範例換了內容或結構,照規則重推並更新 SIDES)。
 *   綠: 每一處左 / 右 / 底都等於規則值,md / lg 兩種密度。等元素本身出現、動畫跑完才量(openCase,不睡固定時間);重複跑恆等。
 *   量法(M32:量像素,不看 class):
 *     左右 = 結構內距:從內容外框一路往上到容器內緣,加總每層 padding + border + margin(auto margin 不算 —— 置中的版心寬不是規則 1 的內距);
 *            取看得見的東西裡最小的那個(= 內容欄的邊)。不量「字墨跑到哪」:一行短字、只有左邊有按鈕的列,右邊的空白不是內距。
 *            無框清單往裡找列裡的內容(清單本身看不見);只有字的包層量內容框(它自己的內距也是間距);分隔線不算內容;
 *            按鈕 / 連結裡的圖示或字量按鈕外框(元件邊緣是對齊線,透明按鈕的內距是元件自己的;頂邊沿用原閘的「看得見的圖示 / 字」)。
 *     底 = 收尾內距:最後一個東西(內容底最低的,按鈕同上量外框)往上加總每層 padding-bottom + border-bottom + margin-bottom(照 CSS 外距合併),
 *            同層後面看不見的佔位元素也算;撐滿高度的包層多出來的空白不算(那是容器比內容高,不是收尾內距)。
 *     容器種類:fill = 標頭所在的 role=dialog 是 modal(aria-modal 或 body 被鎖 pointer-events)、容器內緣底比收尾終點低(有多出來的空白)、
 *            或內容在捲而高度不是被 max-height 卡住的;capped = 在捲且捲動容器到外殼之間有一層高度 = 它的 max-height;其餘 = hug。
 *     期望值的 loose / tight / bottom 從容器(標頭之後那塊)computed `--layout-space-*` 讀(浮層鎖 md 照它讀到的算);頁面根 loose md = lg → 儀器失效。
 *   --selftest:(a)判定表 —— 左 / 右 / 底各有該紅、該綠、儀器失效;(b)SIDES 與 CASES 一一對應。
 *   --static=<dir> 指定建置(對照組用);指定時不跑新鮮度守衛。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { CASES, NOT_COVERED, classifyFirst, expectedGap, installPageKit, openCase } from './header-first-gap-invariant.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const TOL = 0.5
const DENSITIES = ['md', 'lg']
const ROLES = ['bounded', 'unbounded', 'element']

/**
 * 每一處的左右 / 底登記(2026-11-11 盤點時照規則推的;DOM 判出的 ≠ 登記 → 紅)。
 * last = 最後一個東西的角色;box = fill(擋住頁面或高度撐滿)/ hug(不擋頁面、貼著內容);pattern = AB(容器 / 包層給左右內距)/ C(每一列自帶)。
 */
export const SIDES = {
  'sidebar-mixed-folder': { last: 'bounded', box: 'fill', pattern: 'AB' },
  'sidebar-mixed-file': { last: 'bounded', box: 'fill', pattern: 'AB' },
  'sidebar-mixed-ios': { last: 'bounded', box: 'fill', pattern: 'AB' },
  'sidebar-dashboard-table': { last: 'bounded', box: 'fill', pattern: 'AB' },
  'sidebar-project-table': { last: 'bounded', box: 'fill', pattern: 'AB' },
  'appshell-insights': { last: 'bounded', box: 'fill', pattern: 'AB' },
  'appshell-aside-order': { last: 'element', box: 'fill', pattern: 'AB' },
  'appshell-readout': { last: 'element', box: 'fill', pattern: 'AB' },
  'appshell-rule-aside': { last: 'element', box: 'fill', pattern: 'AB' },
  'appshell-inbox-toolbar': { last: 'bounded', box: 'fill', pattern: 'AB' },
  'appshell-inbox-tabs-toolbar': { last: 'bounded', box: 'fill', pattern: 'AB' },
  'appshell-issue-detail': { last: 'element', box: 'fill', pattern: 'AB' },
  'template-dashboard': { last: 'bounded', box: 'fill', pattern: 'AB' },
  'agentpanel-task-list': { last: 'bounded', box: 'fill', pattern: 'AB' },
  'header-single-row': { last: 'element', box: 'hug', pattern: 'AB' },
  'header-with-tabs': { last: 'element', box: 'hug', pattern: 'AB' },
  'fileviewer-info-panel': { last: 'element', box: 'fill', pattern: 'AB' },
  'dialog-body': { last: 'element', box: 'fill', pattern: 'AB' },
  'sheet-body': { last: 'element', box: 'fill', pattern: 'AB' },
  'surface-body': { last: 'element', box: 'hug', pattern: 'AB' },
  'header-anatomy-surface': { last: 'element', box: 'hug', pattern: 'AB' },
  'popover-inspector': { last: 'element', box: 'hug', pattern: 'AB' },
  'datatable-filter-panel': { last: 'element', box: 'hug', pattern: 'AB' },
  'fileitem-upload-manager': { last: 'element', box: 'hug', pattern: 'C' },
  'popover-list-region': { last: 'unbounded', box: 'hug', pattern: 'C' },
}

/**
 * 純函式:規則 4 的期望值。top = 同一處量到的「標頭底 → 第一個內容頂」(規則 4 第 4 列「與頂部同值(值由元件自己的內距給)」= 上下對稱;
 * 頂距本身對不對是規則 2 的事,由原閘判)。box = 'capped'(被高度上限卡住而在捲動)規則 4 沒寫 → want = NaN,由 judge 指名「待規格」。
 */
export function bottomWant({ last, box, top }, t) {
  if (last === 'bounded') return { want: t.loose, rule: '規則 4:bounded region → 容器底 = loose' }
  if (last === 'unbounded') return { want: 0, rule: '規則 4:unbounded region → 容器底 = 0(清單自帶 py)' }
  if (box === 'fill') return { want: t.bottom, rule: '規則 4:element → 容器底,容器擋住頁面或撐滿 = bottom' }
  if (box === 'hug') return { want: top, rule: `規則 4:element → 容器底,容器不擋頁面、貼著內容 = 與頂部同值(頂 ${top})` }
  return { want: NaN, rule: '規則 4 沒寫:容器被高度上限卡住而在捲動(不是擋頁面、也不是撐滿或貼內容)' }
}

/**
 * 純函式:[{ id, density, declared, last, first, box, pattern, left, right, bottom, rowLeft, rowRight, loose, tight, bottom token, rootLoose, err }]
 * → 不符合的訊息清單(呼叫端與 selftest 共用)。
 */
export function judge(rows) {
  const failures = []
  for (const r of rows) {
    const where = `${r.id} @${r.density}`
    if (r.err) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} ${r.err}`); continue }
    if (!(r.loose > 0) || !(r.tight > 0) || !(r.bottomToken > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-loose / tight / bottom`); continue }
    if (![r.left, r.right, r.bottom, r.top].every(Number.isFinite) || !ROLES.includes(r.last) || !r.box || !r.pattern) {
      failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒量到左 / 右 / 底 / 頂或角色(左 ${r.left} / 右 ${r.right} / 底 ${r.bottom} / 頂 ${r.top} / 最後 ${r.last})`)
      continue
    }
    if (r.box === 'capped') failures.push(`${where} 容器被高度上限卡住而在捲動(最後一個東西 = ${r.lastDesc ?? '?'},底 ${r.bottom}px)—— 規則 4 第 1 / 4 列沒寫這種容器該用 bottom 還是與頂部同值;待規格定案,不准默默套用其中一列`)
    const d = r.declared ?? {}
    if (r.last !== d.last) failures.push(`${where} 最後一個東西的角色 = ${r.last}(${r.lastDesc ?? '?'}),登記的是 ${d.last} —— 內容換了,照規則 4 重推底距並更新 SIDES`)
    if (r.box !== d.box) failures.push(`${where} 容器種類 = ${r.box}(多出來的空白 ${r.free ?? '?'}px、modal ${r.modal ?? '?'}、捲動 ${r.scrolls ?? '?'}),登記的是 ${d.box} —— 照規則 4 第 1 / 4 列重推`)
    if (r.pattern !== d.pattern) failures.push(`${where} 左右內距的 pattern = ${r.pattern}(給內距的是 ${r.owner ?? '?'}),登記的是 ${d.pattern} —— 照規則 1 重推`)
    const t = { loose: r.loose, tight: r.tight, bottom: r.bottomToken }
    if (Math.abs(r.left - t.loose) > TOL) failures.push(`${where} 左 = ${r.left}px,應 ${t.loose}(規則 1 / 6:內容左右 = loose;最左的內容 = ${r.leftDesc ?? '?'})`)
    if (Math.abs(r.right - t.loose) > TOL) failures.push(`${where} 右 = ${r.right}px,應 ${t.loose}(規則 1 / 6:內容左右 = loose;最右的內容 = ${r.rightDesc ?? '?'})`)
    if (r.pattern === 'C' && (Math.abs(r.rowLeft ?? NaN) > TOL || Math.abs(r.rowRight ?? NaN) > TOL)) failures.push(`${where} 每列自帶內距(pattern C),列本身離容器 左 ${r.rowLeft} / 右 ${r.rowRight}px,應 0(規則 1 C:列貼齊容器,hover 底色才貼邊)`)
    const { want, rule } = bottomWant(r, t)
    if (Number.isFinite(want) && Math.abs(r.bottom - want) > TOL) failures.push(`${where} 底 = ${r.bottom}px,應 ${want}(${rule};最後一個東西 = ${r.lastDesc ?? '?'})`)
  }
  // 密度有沒有套上看頁面根(同原閘):浮層刻意鎖 md 時兩密度同值是正確的
  for (const id of new Set(rows.map((r) => r.id))) {
    const looses = rows.filter((r) => r.id === id && (r.rootLoose ?? r.loose) > 0).map((r) => r.rootLoose ?? r.loose)
    if (looses.length === DENSITIES.length && new Set(looses).size === 1) failures.push(`${INSTRUMENT_FAIL_MARKER}:${id} 兩種密度在頁面根讀到同一個 loose(${looses[0]})—— 密度沒套上`)
  }
  return failures
}

function selftest() {
  let ok = true
  const expect = (cond, msg) => { if (!cond) { console.error(`✗ selftest:${msg}`); ok = false } }
  const T = { md: { loose: 16, tight: 12, bottomToken: 48, rootLoose: 16 }, lg: { loose: 24, tight: 16, bottomToken: 48, rootLoose: 24 } }
  const firstOf = (id) => CASES.find((c) => c.id === id)?.role ?? 'element'
  // 一格量測:預設 = 照登記、照該格自己讀到的 token 算出的期望值;over 蓋掉要測的欄位
  // 頂距預設 = 規則 2 對盤點登記的第一個東西的值(原閘綠的狀態)
  const row = (id, density, over = {}) => {
    const s = SIDES[id] ?? { last: 'element', box: 'hug', pattern: 'AB' }
    const r = { id, density, declared: s, last: s.last, box: s.box, pattern: s.pattern, ...T[density], rowLeft: 0, rowRight: 0, lastDesc: 'x', ...over }
    const t = { loose: r.loose, tight: r.tight, bottom: r.bottomToken }
    const top = 'top' in over ? over.top : expectedGap(firstOf(id), t)
    return { left: r.loose, right: r.loose, ...r, top, bottom: 'bottom' in over ? over.bottom : bottomWant({ ...r, top }, t).want }
  }
  // (b) 登記 parity
  const caseIds = CASES.map((c) => c.id)
  expect(caseIds.every((id) => SIDES[id]), `CASES 裡沒有 SIDES 登記的:${caseIds.filter((id) => !SIDES[id]).join(', ')}`)
  expect(Object.keys(SIDES).every((id) => caseIds.includes(id)), `SIDES 裡多出 CASES 沒有的:${Object.keys(SIDES).filter((id) => !caseIds.includes(id)).join(', ')}`)
  expect(Object.values(SIDES).every((s) => ROLES.includes(s.last) && /^(fill|hug)$/.test(s.box) && /^(AB|C)$/.test(s.pattern)), 'SIDES 欄位值只能是 last ∈ 角色、box ∈ fill / hug、pattern ∈ AB / C')
  // (a) 判定表 —— 修後形狀(每處照登記、期望值)必綠
  const good = caseIds.flatMap((id) => DENSITIES.map((d) => row(id, d)))
  expect(judge(good).length === 0, `照規則的形狀應綠,實得 ${JSON.stringify(judge(good))}`)
  // 左:表格包層改 tight(md 12 / lg 16)必紅;右:內容貼右邊(0)必紅;左右沒量到 = 儀器失效
  const leftTight = judge(['md', 'lg'].map((d) => row('sidebar-mixed-ios', d, { left: T[d].tight })))
  expect(leftTight.length === 2 && leftTight.every((s) => s.includes('左 =') && s.includes('規則 1 / 6')), `左改 tight 應兩密度都紅,實得 ${JSON.stringify(leftTight)}`)
  const rightFlush = judge([row('appshell-readout', 'md', { right: 0 })])
  expect(rightFlush.some((s) => s.includes('右 = 0px')), `右貼邊應紅,實得 ${JSON.stringify(rightFlush)}`)
  expect(judge([row('x', 'md', { left: NaN })]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '左沒量到應判儀器失效')
  expect(judge([row('x', 'md', { right: undefined })]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '右沒量到應判儀器失效')
  // pattern C:列本身沒貼齊容器(清單容器又加了內距 → hover 底色縮一圈)必紅;登記 C 卻判出 AB(內距寫在清單容器上)必紅
  expect(judge([row('popover-list-region', 'md', { rowLeft: 8, rowRight: 8 })]).some((s) => s.includes('規則 1 C')), '列沒貼齊容器應紅')
  expect(judge([row('fileitem-upload-manager', 'md', { pattern: 'AB' })]).some((s) => s.includes('pattern = AB')), 'pattern 與登記不符應紅')
  // 底:四種角色 / 容器各一格該紅
  expect(judge([row('sidebar-mixed-ios', 'md', { bottom: 12 })]).some((s) => s.includes('bounded region → 容器底 = loose')), '表格 → 底用 tight 應紅(規則 4 第 2 列)')
  expect(judge([row('fileviewer-info-panel', 'lg', { bottom: 24 })]).some((s) => s.includes('撐滿 = bottom')), '撐滿的面板最後是欄位 → 底只有 loose 應紅(規則 4 第 1 列)')
  expect(judge([row('dialog-body', 'md', { bottom: 12 })]).some((s) => s.includes('撐滿 = bottom')), 'modal 最後是文字 → 底只有 tight 應紅(規則 4 第 1 列)')
  expect(judge([row('surface-body', 'md', { bottom: 48 })]).some((s) => s.includes('與頂部同值')), '貼內容的浮層收尾給 48 應紅(規則 4 第 4 列)')
  expect(judge([row('popover-list-region', 'md', { bottom: 8 })]).some((s) => s.includes('unbounded region → 容器底 = 0')), '清單收尾多了內距應紅(規則 4 第 3 列)')
  expect(judge([row('x', 'md', { bottom: NaN })]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '底沒量到應判儀器失效')
  // 登記不符:最後一個東西換了角色 / 容器種類換了 → 紅(即使距離照新角色算是對的)
  expect(judge([row('sidebar-mixed-ios', 'md', { last: 'element', bottom: 48 })]).some((s) => s.includes('登記的是 bounded')), '最後一個東西角色與登記不符應紅')
  expect(judge([row('surface-body', 'md', { box: 'fill', bottom: 48 })]).some((s) => s.includes('容器種類 = fill')), '容器種類與登記不符應紅')
  // 儀器失效:err / token 讀不到 / 密度沒套上
  expect(judge([{ id: 'x', density: 'md', err: '找不到標頭' }]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '找不到標頭應判儀器失效')
  expect(judge([row('x', 'md', { bottomToken: NaN })]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '讀不到 --layout-space-bottom 應判儀器失效')
  expect(judge([row('appshell-readout', 'md'), row('appshell-readout', 'lg', { ...T.md, left: 16, right: 16 })]).some((s) => s.includes('密度沒套上')), '兩密度頁面根同 loose 應判儀器失效')
  // 浮層鎖 md:頁面根不同、浮層裡同值 → 期望照浮層讀到的值,綠
  const locked = [row('popover-inspector', 'md'), row('popover-inspector', 'lg', { ...T.md, rootLoose: 24 })]
  expect(judge(locked).length === 0, `浮層鎖 md 應綠,實得 ${JSON.stringify(judge(locked))}`)
  // 與頂部同值 = 同一處量到的頂(上下對稱),不是另算:頂 0(無分隔標頭、body 無上內距)→ 收尾 0 綠;頂 0 收尾 12 紅
  expect(judge([row('surface-body', 'md', { top: 0, bottom: 0 })]).length === 0, '貼內容的容器頂 0 收尾 0 應綠(上下對稱)')
  expect(judge([row('surface-body', 'md', { top: 0, bottom: 12 })]).some((s) => s.includes('與頂部同值(頂 0)')), '貼內容的容器頂 0 收尾 12 應紅')
  expect(judge([row('x', 'md', { top: NaN })]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '頂沒量到應判儀器失效(與頂部同值無從比)')
  // 被高度上限卡住而在捲動:規則 4 沒寫 → 紅(待規格),不准默默套用第 1 或第 4 列
  const capped = judge([row('surface-body', 'md', { box: 'capped', bottom: 12 })])
  expect(capped.some((s) => s.includes('待規格定案')) && !capped.some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), `被上限卡住的捲動容器應紅(待規格),實得 ${JSON.stringify(capped)}`)
  console.log(ok ? '✅ header-content-sides selftest PASS' : '❌ header-content-sides selftest FAIL')
  return ok
}

/** 頁面函式(依賴 window.__layoutKit = 原閘 pageKit):量標頭之後那塊的左 / 右 / 底結構內距、最後 / 第一個東西的特徵、容器種類、pattern。 */
export const probeSides = ({ header, headerText = null, nth = 0 }) => {
  const K = window.__layoutKit
  const h = K.findHeader(header, headerText, nth)
  if (!h) return { err: `找不到標頭 ${header}${headerText ? `(含「${headerText}」)` : ''}` }
  const body = K.findBody(h)
  if (!body) return { err: '標頭之後沒有內容' }
  const things = K.collectThings(body)
  if (!things.length) return { err: '標頭之後找不到看得見的內容' }
  const round = (x) => Math.round(x * 10) / 10
  const num = (el, p) => parseFloat(getComputedStyle(el)[p]) || 0
  const cap = (s) => s[0].toUpperCase() + s.slice(1)
  const autoMargin = (el, side) => { try { return String(el.computedStyleMap().get(`margin-${side}`)) === 'auto' } catch { return false } }
  const mar = (el, side) => (autoMargin(el, side) ? 0 : num(el, `margin${cap(side)}`))
  const edge = (el, side) => num(el, `padding${cap(side)}`) + num(el, `border${cap(side)}Width`)
  const desc = (el) => {
    const f = K.feat(el)
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join(' ')
    return `<${f.tag}${f.role ? ` role=${f.role}` : ''}${cls ? ` class="${cls}…"` : ''}>「${(el.textContent ?? '').trim().slice(0, 12)}」`
  }
  // el(含)往上到 body(不含)的每一層(display: contents 沒有盒子,跳過)
  const chain = (el) => { const out = []; for (let n = el; n && n !== body; n = n.parentElement) if (getComputedStyle(n).display !== 'contents') out.push(n); return out }
  // 一個盒子(外框)到容器內緣的結構內距;owner = 貢獻最多的那一層
  const insetOfBox = (el, side, extra = 0) => {
    let sum = extra, owner = extra > 0 ? el : null, share = extra
    const add = (n, v) => { sum += v; if (v > share + 0.5) { share = v; owner = n } }
    for (const n of chain(el)) add(n, mar(n, side) + (n === el ? 0 : edge(n, side)))
    if (el !== body) add(body, num(body, `padding${cap(side)}`))
    return { v: sum, owner }
  }
  // 水平的東西:
  //   · 無框清單 / 無框群組裡有清單項目 → 往裡找(清單外框看不見);
  //   · 清單項目本身(選項 / 選單項 / 樹節點 / li)= pattern C 的「列」:反白底色鋪滿整列是設計(規則 1 C),量的是列裡的內容,列本身另記;
  //   · 按鈕 / 連結裡的圖示或字 → 量按鈕外框(對齊線是元件邊緣,透明按鈕的內距是元件自己的);分隔線不算內容。
  const ITEM = '[role=option], [role^=menuitem], [role=treeitem], [role=listitem], li'
  const hThings = []
  const seen = new Set()
  const push = (el, f, boxed) => { if (!seen.has(el)) { seen.add(el); hThings.push({ el, f, boxed }) } }
  const expand = (t) => {
    const listy = K.LIST_ROLE.test(t.f.role ?? '') || /^(ul|ol|nav)$/.test(t.f.tag) || (!t.f.text && !!t.el.querySelector(ITEM))
    const item = t.el.matches(ITEM) && t.el.children.length > 0
    if ((listy && !t.f.framed) || item) { const inner = K.collectThings(t.el, { skipSelf: true }); if (inner.length) { inner.forEach(expand); return } }
    if (t.f.tag === 'hr' || t.f.role === 'separator') return
    const ctl = t.el.parentElement?.closest('button, a[href], [role=button]')
    if (ctl && body.contains(ctl) && ctl !== body) { push(ctl, K.feat(ctl), true); return }
    push(t.el, t.f, K.boxedOf(t.f))
  }
  things.forEach(expand)
  if (!hThings.length) return { err: '標頭之後找不到水平方向看得見的內容' }
  // 內容欄的邊:候選 = 幾何上最靠那一邊的東西(行首 / 行尾;列中間的東西、接合欄位的 -1px 不算),值 = 候選的結構內距(取最小)
  const frameX = (t, s) => { const r = t.el.getBoundingClientRect(); return s === 'left' ? r.left + (t.boxed ? 0 : edge(t.el, 'left')) : r.right - (t.boxed ? 0 : edge(t.el, 'right')) }
  const side = (s) => {
    const xs = hThings.map((t) => frameX(t, s))
    const extreme = s === 'left' ? Math.min(...xs) : Math.max(...xs)
    let best = null
    hThings.forEach((t, i) => {
      if (Math.abs(xs[i] - extreme) > 0.5) return
      const r = insetOfBox(t.el, s, t.boxed ? 0 : edge(t.el, s))
      if (!best || r.v < best.v - 0.5) best = { ...r, t }
    })
    return best
  }
  const L = side('left'), R = side('right')
  // pattern C = 左內距由「列」給:列 = 最左內容所在的清單項目;沒有清單語意時,給內距最多的那層是一串同樣內距的兄弟之一(例:FileItem 列)。其餘 = AB。
  const sameRow = (o) => !!o && o !== body && !!o.parentElement
    && [...o.parentElement.children].some((s) => s !== o && s.tagName === o.tagName && num(s, 'paddingLeft') > 0.5 && Math.abs(num(s, 'paddingLeft') - num(o, 'paddingLeft')) < 0.5)
  // 可互動的列(有反白 / hover 底色):選項 / 選單項 / 樹節點;純文字清單的 li 不算(它的內距可以由清單容器給,pattern B)
  const itemRow = L.t.el.closest('[role=option], [role^=menuitem], [role=treeitem]')
  const row = itemRow && body.contains(itemRow) && itemRow !== body ? itemRow : sameRow(L.owner) ? L.owner : null
  const owner = row ?? L.owner
  const pattern = row ? 'C' : 'AB'
  const rowLeft = row ? insetOfBox(row, 'left').v : 0
  const rowRight = row ? insetOfBox(row, 'right').v : 0
  // 底:最後一個東西 = 內容底最低的(有框量外框,只有字量內容框;按鈕 / 連結裡的圖示或字 → 量按鈕外框,同左右)
  const asBox = (t) => {
    const ctl = t.el.parentElement?.closest('button, a[href], [role=button]')
    return ctl && body.contains(ctl) && ctl !== body ? { el: ctl, f: K.feat(ctl), boxed: true } : { ...t, boxed: K.boxedOf(t.f) }
  }
  const bThings = things.map(asBox)
  const bottomOf = (t) => { const r = t.el.getBoundingClientRect(); return t.boxed ? r.bottom : r.bottom - edge(t.el, 'bottom') }
  let last = bThings[0]
  for (const t of bThings) if (bottomOf(t) > bottomOf(last) + 0.5) last = t
  // 頂(規則 4 第 4 列「與頂部同值」用):同原閘,標頭底 → 頂邊最高的東西
  const first = things.reduce((a, t) => (t.top < a.top - 0.5 ? t : a))
  const top = first.top - h.getBoundingClientRect().bottom
  const flexy = (n) => !!n && /flex|grid/.test(getComputedStyle(n).display)
  const scrolling = (n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1
  let e, pend = 0, scrolls = false, scroller = null
  if (last.el === body) e = body.getBoundingClientRect().bottom - num(body, 'borderBottomWidth')
  else {
    e = last.el.getBoundingClientRect().bottom
    pend = mar(last.el, 'bottom')
    for (let cur = last.el, A = cur.parentElement; A; cur = A, A = A.parentElement) {
      // 同層後面還在流裡的兄弟(看不見的佔位、外距);撐開的 flex 佔位只算到它的頂
      for (let s = cur.nextElementSibling; s; s = s.nextElementSibling) {
        const cs = getComputedStyle(s)
        if (cs.display === 'none' || cs.display === 'contents' || cs.position === 'absolute' || cs.position === 'fixed') continue
        const r = s.getBoundingClientRect()
        const grow = flexy(A) && parseFloat(cs.flexGrow) > 0
        const end = grow ? r.top : r.bottom
        const m = grow ? 0 : mar(s, 'bottom')
        if (end + m > e + pend + 0.5) { e = end; pend = m }
      }
      if (!scroller && scrolling(A)) { scrolls = true; scroller = A }
      if (A === body) { e += pend + num(A, 'paddingBottom'); break }
      const cs = getComputedStyle(A)
      if (cs.display === 'contents') continue
      const collapse = cs.display === 'block' && cs.overflowX === 'visible' && cs.overflowY === 'visible' && cs.float === 'none'
        && !/(absolute|fixed)/.test(cs.position) && edge(A, 'bottom') === 0 && !flexy(A.parentElement)
      if (collapse) pend = Math.max(pend, mar(A, 'bottom'))
      else { e += pend + edge(A, 'bottom'); pend = mar(A, 'bottom') }
    }
  }
  const dlg = body.closest('[role=dialog], [role=alertdialog]')
  const modal = !!dlg && (dlg.getAttribute('aria-modal') === 'true' || getComputedStyle(document.body).pointerEvents === 'none')
  const free = body.getBoundingClientRect().bottom - num(body, 'borderBottomWidth') - e
  // 捲動中的容器:高度被 max-height 卡住(捲動容器到標頭所在外殼之間任一層的高度 = 自己的 max-height)→ capped;否則高度由版面給 → 撐滿
  let capped = false
  if (scrolls) for (let n = scroller; n && n !== h.parentElement?.parentElement; n = n.parentElement) {
    const mh = getComputedStyle(n).maxHeight
    if (mh !== 'none' && Math.abs(n.getBoundingClientRect().height - parseFloat(mh)) < 1) { capped = true; break }
  }
  const box = modal || free > 0.5 ? 'fill' : scrolls ? (capped ? 'capped' : 'fill') : 'hug'
  const v = (name) => parseFloat(getComputedStyle(body).getPropertyValue(name))
  return {
    left: round(L.v), right: round(R.v), bottom: round(e - bottomOf(last)), top: round(top),
    leftDesc: desc(L.t.el), rightDesc: desc(R.t.el), lastDesc: desc(last.el), owner: owner ? desc(owner) : null,
    lastF: last.f, firstF: first.f, pattern, rowLeft: round(rowLeft), rowRight: round(rowRight),
    box, modal, scrolls, free: round(free),
    loose: v('--layout-space-loose'), tight: v('--layout-space-tight'), bottomToken: v('--layout-space-bottom'),
    rootLoose: parseFloat(getComputedStyle(document.querySelector('#storybook-root') ?? document.documentElement).getPropertyValue('--layout-space-loose')),
  }
}

async function measureCase(page, origin, c, density) {
  const opened = await openCase(page, origin, c, density)
  if (opened) return opened
  await installPageKit(page)
  const r = await page.evaluate(probeSides, { header: c.header, headerText: c.headerText ?? null, nth: c.nth ?? 0 })
  if (r.err) return r
  const { lastF, firstF, ...rest } = r
  return { ...rest, last: classifyFirst(lastF), first: classifyFirst(firstF) }
}

async function measure() {
  if (!staticArg) requireFreshStorybookBuild(STATIC, [...new Set(CASES.map((c) => c.src.replace(/:\d+$/, '')))].concat(['packages/design-system/src/tokens/layoutSpace/layoutSpace.css', 'packages/design-system/src/components/DataTable/data-table.tsx', 'packages/design-system/src/patterns/header-canonical/chrome-header.tsx']))
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const rows = []
    for (const c of CASES) for (const density of DENSITIES) rows.push({ id: c.id, density, declared: SIDES[c.id], ...(await measureCase(page, server.origin, c, density)) })
    return rows
  } finally { await browser.close(); await server.stop() }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  try {
    const rows = await measure()
    if (rows === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / INSTRUMENT-FAIL 判定
    for (const r of rows) console.log(`  ${r.id.padEnd(28)} ${r.density}  左 ${String(r.left ?? '-').padEnd(4)} 右 ${String(r.right ?? '-').padEnd(4)} 底 ${String(r.bottom ?? '-').padEnd(4)} 最後 ${(r.last ?? '-').padEnd(9)} ${(r.box ?? '-').padEnd(4)} ${(r.pattern ?? '-').padEnd(2)} (loose ${r.loose ?? '-'} / tight ${r.tight ?? '-'} / bottom ${r.bottomToken ?? '-'})  ${r.lastDesc ?? r.err ?? ''}`)
    const failures = judge(rows)
    if (failures.length) { console.error('❌ header-content-sides FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log(`✅ header-content-sides PASS(${CASES.length} 處 × md / lg:左右 = loose(規則 1 / 6)、底依最後一個東西與容器(規則 4);頂見 header-first-gap;不在盤點的 ${NOT_COVERED.length} 類理由見原閘 NOT_COVERED)`)
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
