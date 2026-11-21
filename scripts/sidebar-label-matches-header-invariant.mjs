#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 範例裡每一個「側欄有選中項 + 頁面標頭」的畫面,側欄選中項的字 = 頁面標頭標題的字(同字;
 *         packages/design-system/src/components/Sidebar/sidebar.spec.md「選中項的字 = 那一頁標頭的字」)。
 *         出處:user 2026-11-11 回第三批成品頁的問句「第二題要確保sidebar menu item 的文案跟標頭是一樣的吧？」(AI 讀法:同一份文字,見規格)。
 *         詳細頁除外【AI 推導 2026-11-15】—— 判法:標頭裡有麵包屑,麵包屑「前面某一層」的字 = 側欄選中項的字,而且麵包屑末位 = 標頭的字
 *         (側欄亮上一層、標頭是那筆資料的名字,由麵包屑帶回去);沒有這樣的麵包屑 = 同一層,照字比。
 *         畫面 = 每一則有側欄的 story 進頁時,加上點過側欄每一個「看得到、點得到」的項目(選單鈕 / 可選的樹列)之後 ——
 *         只有進頁時就有選中項與標頭的那一份 SidebarProvider 才逐一點(沒有選中項的示範框,側欄只是裝飾,不在規則裡)。
 *   紅: 任一畫面兩邊字不同 → 指名 story / 第幾步(進頁 / 點「X」後)/ 第幾個 SidebarProvider / 側欄字 / 標頭字,exit 1。
 *       歷史紅燈(修前 06aaca03 的建置,2026-11-15 A15 對照組實測 11 格紅):AppShell 設計規格「元件總覽」點側欄 Inbox / Team / Insights /
 *       Calendar / Settings 後標頭仍寫死「Dashboard」(5 格)、Sidebar 設計規格「狀態行為」收合示範的展開與細列兩格點了 Inbox / Team / Settings
 *       後標頭仍寫死「Dashboard」(6 格;offcanvas 收掉那一格點不到,不算)。進頁那一格全都同字 —— 只比進頁的閘抓不到這一類。
 *       讀不到選中項的字 / 同一個側欄兩個選中項 / 標頭有好幾個 h1 判不出是哪一個 / 盤點少了必有的檔 / 必比的 story 一格都沒比到 → 儀器失效(不讀成通過)。
 *   綠: 每一個畫面都同字(或照上面的判法是詳細頁)。等 story 渲染完成、畫面連續兩格讀到一樣的結果才判(不睡固定時間);重複跑恆等。
 *   量法: story 清單從建置的 index.json 推:story 檔本身、或它直接 import 的範例端模組(*.stories.tsx / 檔名 `_` 開頭 / stories-helpers / apps/)
 *         含 `SidebarProvider` 的那幾支檔的每一則 story(不手列 —— 新增一則有側欄的範例自動進來)。
 *         每個 SidebarProvider(`[data-sidebar="wrapper"]`)各自一份:選中項 = 版面上那一份側欄裡 `aria-current="page"` 的選單鈕或
 *         `aria-selected="true"` 的樹列,字 = 它的 `[data-sidebar="menu-label"]`(沒有就用 aria-labelledby 指的元素);
 *         標頭 = 同一份裡、不在側欄 / Right panel / AI agent / 對話框裡的 `<header>`,標題 = 裡面唯一的 `h1`;
 *         沒有 h1 時(設計規格頁的示範框)用唯一那個標頭裡不是按鈕 / 連結的字。
 *         點擊用真的指標,點之前先看那一點是不是真的落在項目上(被 AI agent 遮罩蓋住的不點,記在「沒點」)。
 *   `--selftest`:(a) 判定表 —— 同字綠 / 不同字紅並指名 / 詳細頁兩面(麵包屑前一層 = 選中項 → 跳過;前一層不是 / 沒有麵包屑 → 紅)/
 *         麵包屑末位 ≠ 標頭紅 / 讀不到字、兩個選中項、多個 h1、必比的沒比到判儀器失效;(b) 盤點函式 —— 範例端模組含 Provider 收進來、
 *         只 import 元件庫的不收、範本 story 經 ./App 收進來;(c) 夾具頁(真瀏覽器、不用建置)跑同一支讀法 —— 八種畫面各自判對,
 *         含「點了別項,選中項換了、標頭沒換」必紅;(d) 真建置對照(要建置):Sidebar「完整佈局」把標頭改成「Dashboard」→ 紅並指名;
 *         同一頁塞進「Due soon / ENG-1042」麵包屑、標頭改 ENG-1042 → 判詳細頁;麵包屑前一層改成 Inbox → 紅。
 *         `--static=<dir>` 指定建置(例:拿修前建置證明會紅);指定時不跑新鮮度守衛。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, requireStorybookBuild, StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const RULE = 'sidebar.spec.md「選中項的字 = 那一頁標頭的字」'

/** 盤點下限:這幾支一定有「側欄 + 標頭」的範例,推出來的清單少了任一支 = 盤點壞了(儀器失效),不是「沒有範例要比」 */
export const REQUIRED_FILES = [
  'packages/design-system/src/components/Sidebar/sidebar.stories.tsx',
  'packages/design-system/src/components/Sidebar/sidebar.anatomy.stories.tsx',
  'packages/design-system/src/components/AppShell/app-shell.stories.tsx',
  'packages/design-system/src/components/AppShell/app-shell.anatomy.stories.tsx',
  'apps/template/src/App.stories.tsx',
]
/** 這幾則一定要比到至少一個畫面(進頁就有選中項 + 標頭);一格都沒比到 = 量不到,不是通過(M37「沒觀察到 ≠ 沒發生」) */
export const REQUIRED_COMPARED = [
  'design-system-components-sidebar-展示--icon-collapse',
  'design-system-components-sidebar-展示--mixed-content',
  'design-system-components-sidebar-設計規格--state-behavior',
  'design-system-components-appshell-設計規格--overview',
  'design-system-components-appshell-展示--primary-sidebar',
  'apps-template-appshell-dashboard--default',
]
/** 點過側欄之後比到的畫面,全 DS 至少要有這麼多(點擊那一半真的有在跑) */
export const MIN_CLICKED = 20

// ── 盤點 ─────────────────────────────────────────────────────────────────────

/** 範例端模組(會被收進盤點的 import):story 檔、檔名 `_` 開頭的範例 helper、stories-helpers、apps/ 底下 —— 元件庫本身(sidebar.tsx 等)不算 */
export const isStorySide = (rel) => /\.stories\.tsx$/.test(rel) || /(^|\/)_[^/]+\.tsx?$/.test(rel) || rel.includes('/stories-helpers/') || rel.startsWith('apps/')

/** 把 import 的模組字串解析成 repo 相對路徑(找不到檔 = null);`@/design-system/` = packages/design-system/src/ */
export function resolveImport(fromRel, spec, exists) {
  let base
  if (spec.startsWith('@/design-system/')) base = `packages/design-system/src/${spec.slice('@/design-system/'.length)}`
  else if (spec.startsWith('./') || spec.startsWith('../')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec))
  else return null
  for (const cand of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) if (exists(cand)) return cand
  return null
}

/**
 * 純函式:index.json 的 entries + 讀檔函式 → 要開的 story({ id, importPath, sources })。
 * 收進來的條件:story 檔本身、或它直接 import 的範例端模組,原始碼含 `SidebarProvider`。sources = 這則 story 牽涉的檔(新鮮度守衛用)。
 */
export function deriveInventory(entries, { read, exists }) {
  const memo = new Map()
  const fileInfo = (rel) => {
    if (memo.has(rel)) return memo.get(rel)
    const src = read(rel) ?? ''
    const imports = [...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => resolveImport(rel, m[1], exists)).filter((p) => p && isStorySide(p))
    const sides = [rel, ...imports].filter((p, i, a) => a.indexOf(p) === i)
    const withProvider = sides.filter((p) => /\bSidebarProvider\b/.test(p === rel ? src : (read(p) ?? '')))
    const info = { included: withProvider.length > 0, sources: sides }
    memo.set(rel, info)
    return info
  }
  const out = []
  for (const e of Object.values(entries)) {
    if (e.type !== 'story' || typeof e.importPath !== 'string') continue
    const rel = e.importPath.replace(/^\.\//, '')
    const info = fileInfo(rel)
    if (info.included) out.push({ id: e.id, importPath: rel, sources: info.sources })
  }
  return out
}

// ── 頁面端讀法(page.evaluate;不得用外層變數)──────────────────────────────

/** 每個 SidebarProvider 一列:選中項的字、標頭標題、標題從哪讀的、麵包屑。 */
export function readScreens() {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const labelOf = (el) => {
    const l = el.querySelector('[data-sidebar="menu-label"]')
    if (l && norm(l.textContent)) return norm(l.textContent)
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
    const t = norm(ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' '))
    if (t) return t
    return norm(el.getAttribute('aria-label')) || null
  }
  const plainText = (el) => {
    const c = el.cloneNode(true)
    c.querySelectorAll('button, a, input, select, textarea, [role="button"], [aria-hidden="true"], .sr-only, nav').forEach((n) => n.remove())
    return norm(c.textContent)
  }
  const EXCLUDE = '[data-sidebar="sidebar"], [data-app-shell-panel="right"], [data-app-shell-panel="agent"], [role="dialog"], [data-agent-panel-mode]'
  const root = document.querySelector('#storybook-root') ?? document.body
  return [...root.querySelectorAll('[data-sidebar="wrapper"]')].map((scope, index) => {
    // 只看版面上那一份側欄(Menu 浮層那一份傳送到別處,不在 wrapper 裡;保險起見再排一次)
    const bars = [...scope.querySelectorAll('[data-sidebar="sidebar"]')].filter((b) => !b.closest('[data-menu-overlay]') && b.closest('[data-sidebar="wrapper"]') === scope)
    const selectedEls = bars.flatMap((b) => [...b.querySelectorAll('[data-sidebar="menu-button"][aria-current="page"], [role="row"][aria-selected="true"]')])
    const selected = selectedEls.map(labelOf)
    const headers = [...scope.querySelectorAll('header')].filter((h) => !h.closest(EXCLUDE) && h.closest('[data-sidebar="wrapper"]') === scope)
    const h1s = headers.flatMap((h) => [...h.querySelectorAll('h1')])
    let title = null
    let titleFrom = null
    let header = null
    if (h1s.length === 1) { header = h1s[0].closest('header'); title = norm(h1s[0].textContent); titleFrom = 'h1' }
    else if (h1s.length > 1) titleFrom = `ambiguous:${h1s.length} 個 h1`
    else if (headers.length === 1) {
      header = headers[0]
      const current = header.querySelector('nav li[data-bc-role] [aria-current="page"]')
      title = current ? norm(current.textContent) : plainText(header)
      titleFrom = current ? 'breadcrumb' : 'header-text'
    } else if (headers.length > 1) titleFrom = `ambiguous:${headers.length} 個沒有 h1 的標頭`
    const crumbs = header ? [...header.querySelectorAll('nav li[data-bc-role]')].filter((li) => li.getAttribute('data-bc-role') !== 'ellipsis').map((li) => norm(li.textContent)) : []
    return { scope: index, selected, headerCount: headers.length, title, titleFrom, crumbs }
  })
}

/** 第 scope 份 SidebarProvider 裡可以點的側欄項目(版面上那一份、看得到、這一點真的落在項目上)。key 用來在畫面重畫後找回同一個項目。 */
export function listTargets(scopeIndex) {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const root = document.querySelector('#storybook-root') ?? document.body
  const scope = root.querySelectorAll('[data-sidebar="wrapper"]')[scopeIndex]
  if (!scope) return []
  const bars = [...scope.querySelectorAll('[data-sidebar="sidebar"]')].filter((b) => !b.closest('[data-menu-overlay]') && b.closest('[data-sidebar="wrapper"]') === scope)
  const seen = new Map()
  const out = []
  for (const bar of bars) {
    const els = [...bar.querySelectorAll('[data-sidebar="content"] [data-sidebar="menu-button"], [data-sidebar="content"] [role="row"][aria-selected]')]
    for (const el of els) {
      const isRow = el.getAttribute('role') === 'row'
      const labelEl = isRow ? document.getElementById(el.getAttribute('aria-labelledby') || '') : el.querySelector('[data-sidebar="menu-label"]')
      const text = norm((labelEl ?? el).textContent) || norm(el.getAttribute('aria-label'))
      const n = (seen.get(text) ?? 0) + 1
      seen.set(text, n)
      const key = `${isRow ? 'row' : 'button'}:${text}#${n}`
      if (el.matches(':disabled, [aria-disabled="true"]')) { out.push({ key, text, hit: false, why: '停用' }); continue }
      if (el.closest('[inert], [aria-hidden="true"]')) { out.push({ key, text, hit: false, why: '在 inert / aria-hidden 裡(例:模態浮層開著、側欄收掉)' }); continue }
      const target = isRow && labelEl ? labelEl : el
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      const r = target.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) { out.push({ key, text, hit: false, why: '看不到(寬或高 0)' }); continue }
      const x = r.left + Math.min(r.width / 2, 12)
      const y = r.top + r.height / 2
      const at = document.elementFromPoint(x, y)
      const hit = !!at && (el === at || el.contains(at))
      out.push({ key, text, x, y, hit, why: hit ? '' : `那一點是 ${at ? at.tagName.toLowerCase() + (at.getAttribute('data-app-shell-panel') ? `[${at.getAttribute('data-app-shell-panel')}]` : '') : '空'}(被蓋住)` })
    }
  }
  return out
}

// ── 判定(純函式;呼叫端與 selftest 共用)─────────────────────────────────

/** 一個畫面 → 'ok' | 'detail' | 'skip-no-selection' | 'skip-no-header' | 'skip-no-title' | 'mismatch' | 'instrument'(附訊息) */
export function judgeScreen(s) {
  const where = `${s.story} ${s.step}${s.scopeCount > 1 ? `(第 ${s.scope + 1} 個 SidebarProvider)` : ''}`
  if (!s.selected || s.selected.length === 0) return { verdict: 'skip-no-selection' }
  if (s.headerCount === 0) return { verdict: 'skip-no-header' }
  if (s.selected.some((t) => !t)) return { verdict: 'instrument', message: `${INSTRUMENT_FAIL_MARKER}:${where} 讀不到側欄選中項的字(沒有 data-sidebar="menu-label",也沒有 aria-labelledby / aria-label)` }
  if (s.selected.length > 1) return { verdict: 'instrument', message: `${INSTRUMENT_FAIL_MARKER}:${where} 同一個側欄同時有 ${s.selected.length} 個選中項(${s.selected.join(' / ')};sidebar.spec.md「Single selection」)—— 比不出標頭該等於哪一個` }
  if (typeof s.titleFrom === 'string' && s.titleFrom.startsWith('ambiguous')) return { verdict: 'instrument', message: `${INSTRUMENT_FAIL_MARKER}:${where} 判不出頁面標頭(${s.titleFrom.slice('ambiguous:'.length)})` }
  const sel = s.selected[0]
  if (s.titleFrom === 'header-text' && !s.title) return { verdict: 'skip-no-title' }
  if (s.title === sel) return { verdict: 'ok' }
  const crumbs = s.crumbs ?? []
  if (crumbs.length >= 2 && crumbs.slice(0, -1).includes(sel)) {
    if (crumbs[crumbs.length - 1] === s.title) return { verdict: 'detail' }
    return { verdict: 'mismatch', message: `${where} 側欄選中「${sel}」、標頭「${s.title}」,麵包屑「${crumbs.join(' / ')}」的末位不是標頭的字 —— 不算詳細頁(breadcrumb.spec.md「Title-breadcrumb-end 同步 canonical」:末位 = 標頭)` }
  }
  const why = crumbs.length ? `標頭的麵包屑「${crumbs.join(' / ')}」前面沒有「${sel}」這一層,不算詳細頁` : '標頭沒有麵包屑指回側欄那一層,不算詳細頁'
  return { verdict: 'mismatch', message: `${where} 側欄選中「${sel}」,標頭是「${s.title ?? '(空)'}」—— 側欄項目的字要等於那一頁標頭的字(${RULE});${why}` }
}

/** 全部畫面 + 盤點 → 不符合的訊息清單。results[i] = 一個畫面(judgeScreen 的輸入);coverage = { files, compared: Map<storyId, n>, clicked } */
export function judge(results, coverage) {
  const failures = []
  for (const r of results) {
    const { message } = judgeScreen(r)
    if (message) failures.push(message)
  }
  if (coverage) {
    for (const f of REQUIRED_FILES) if (!coverage.files.includes(f)) failures.push(`${INSTRUMENT_FAIL_MARKER}:盤點少了 ${f}(推 story 清單的規則壞了,或建置裡沒有這支檔的 story)`)
    for (const id of REQUIRED_COMPARED) if (!(coverage.compared.get(id) > 0)) failures.push(`${INSTRUMENT_FAIL_MARKER}:${id} 一個「側欄有選中項 + 頁面標頭」的畫面都沒比到 —— 量不到不是通過`)
    if (!(coverage.clicked >= MIN_CLICKED)) failures.push(`${INSTRUMENT_FAIL_MARKER}:點過側欄之後只比到 ${coverage.clicked} 個畫面(下限 ${MIN_CLICKED})—— 點擊那一半沒有在跑`)
  }
  return failures
}

// ── selftest ────────────────────────────────────────────────────────────────

/** 夾具頁:八種畫面,每一份 SidebarProvider 一種;其中兩份點了別項會換選中項(一份標頭跟著換、一份不換)。 */
export const FIXTURE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  [data-sidebar="wrapper"]{display:flex;border:1px solid #ccc;margin:4px;height:120px} [data-sidebar="sidebar"]{width:160px}
  [data-sidebar="menu-button"]{display:block;width:150px;height:24px} header{height:32px;flex:1}
</style></head><body><div id="storybook-root">
  <div data-sidebar="wrapper" data-case="same"><div data-sidebar="sidebar"><div data-sidebar="content">
    <button data-sidebar="menu-button" aria-current="page"><svg width="16" height="16" aria-hidden="true"></svg><span data-sidebar="menu-label">Due soon</span></button>
    <button data-sidebar="menu-button"><span data-sidebar="menu-label">Inbox</span></button></div></div>
    <main><header><button aria-label="切換側欄"></button><h1>Due soon</h1></header></main></div>
  <div data-sidebar="wrapper" data-case="mismatch"><div data-sidebar="sidebar"><div data-sidebar="content">
    <button data-sidebar="menu-button" aria-current="page"><span data-sidebar="menu-label">Due soon</span></button></div></div>
    <main><header><h1>Dashboard</h1></header></main></div>
  <div data-sidebar="wrapper" data-case="detail"><div data-sidebar="sidebar"><div data-sidebar="content">
    <button data-sidebar="menu-button" aria-current="page"><span data-sidebar="menu-label">Active sprint</span></button></div></div>
    <main><header><nav aria-label="麵包屑"><ol><li data-bc-role="root"><a href="#">Active sprint</a></li><li role="presentation" aria-hidden="true">/</li><li data-bc-role="current"><span aria-current="page" role="link">ENG-1042</span></li></ol></nav><h1>ENG-1042</h1></header></main></div>
  <div data-sidebar="wrapper" data-case="detail-wrong-parent"><div data-sidebar="sidebar"><div data-sidebar="content">
    <button data-sidebar="menu-button" aria-current="page"><span data-sidebar="menu-label">Active sprint</span></button></div></div>
    <main><header><nav aria-label="麵包屑"><ol><li data-bc-role="root"><a href="#">Inbox</a></li><li data-bc-role="current"><span aria-current="page" role="link">ENG-1042</span></li></ol></nav><h1>ENG-1042</h1></header></main></div>
  <div data-sidebar="wrapper" data-case="no-breadcrumb"><div data-sidebar="sidebar"><div data-sidebar="content">
    <button data-sidebar="menu-button" aria-current="page"><span data-sidebar="menu-label">Active sprint</span></button></div></div>
    <main><header><h1>ENG-1042</h1></header></main></div>
  <div data-sidebar="wrapper" data-case="tree"><div data-sidebar="sidebar"><div data-sidebar="content"><div role="treegrid">
    <div role="row" aria-selected="true" aria-labelledby="fx-row-1"><div role="gridcell"><span id="fx-row-1">frontend</span></div></div>
    <div role="row" aria-selected="false" aria-labelledby="fx-row-2"><div role="gridcell"><span id="fx-row-2">backend</span></div></div></div></div></div>
    <main><header><h1>frontend</h1></header></main></div>
  <div data-sidebar="wrapper" data-case="no-header"><div data-sidebar="sidebar"><div data-sidebar="content">
    <button data-sidebar="menu-button" aria-current="page"><span data-sidebar="menu-label">Inbox</span></button></div></div></div>
  <div data-sidebar="wrapper" data-case="span-title"><div data-sidebar="sidebar"><div data-sidebar="content">
    <button data-sidebar="menu-button" aria-current="page"><span data-sidebar="menu-label">Due soon</span></button>
    <button data-sidebar="menu-button"><span data-sidebar="menu-label">Team</span></button></div></div>
    <div><header><button aria-label="切換側欄"></button><span>Due soon</span></header></div></div>
</div><script>
  // 點了別項:選中項換過去;data-case="same" 那份標頭跟著換(綠),data-case="span-title" 那份標頭寫死(紅 —— 修前「狀態行為」那三格的樣子)
  for (const scope of document.querySelectorAll('[data-sidebar="wrapper"]')) {
    scope.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sidebar="menu-button"]'); if (!b) return
      scope.querySelectorAll('[data-sidebar="menu-button"]').forEach((x) => x.removeAttribute('aria-current')); b.setAttribute('aria-current', 'page')
      if (scope.dataset.case === 'same') scope.querySelector('header h1').textContent = b.querySelector('[data-sidebar="menu-label"]').textContent
    })
  }
</script></body></html>`

/** 夾具頁每一份的期望(讀法 + 判定兩段一起驗;'click' = 點第二項之後的期望) */
export const FIXTURE_EXPECT = {
  same: { entry: 'ok', click: 'ok' },
  mismatch: { entry: 'mismatch' },
  detail: { entry: 'detail' },
  'detail-wrong-parent': { entry: 'mismatch' },
  'no-breadcrumb': { entry: 'mismatch' },
  tree: { entry: 'ok' },
  'no-header': { entry: 'skip-no-header' },
  'span-title': { entry: 'ok', click: 'mismatch' },
}

function judgeTable(expect) {
  const base = { story: 's', step: '進頁', scope: 0, scopeCount: 1, headerCount: 1, titleFrom: 'h1', crumbs: [] }
  const v = (over) => judgeScreen({ ...base, ...over })
  expect(v({ selected: ['Due soon'], title: 'Due soon' }).verdict === 'ok', '同字應綠')
  const mm = v({ story: 'design-system-components-sidebar-展示--icon-collapse', selected: ['Due soon'], title: 'Dashboard' })
  expect(mm.verdict === 'mismatch' && mm.message.includes('icon-collapse') && mm.message.includes('「Due soon」') && mm.message.includes('「Dashboard」'), `不同字應紅並指名 story 與兩邊的字,實得 ${JSON.stringify(mm)}`)
  // 詳細頁兩面
  expect(v({ selected: ['Active sprint'], title: 'ENG-1042', crumbs: ['Active sprint', 'ENG-1042'] }).verdict === 'detail', '麵包屑前一層 = 選中項、末位 = 標頭 → 詳細頁(跳過)')
  expect(v({ selected: ['Active sprint'], title: 'ENG-1042', crumbs: ['Projects', 'Active sprint', 'ENG-1042'] }).verdict === 'detail', '選中項在麵包屑中段也算上一層')
  const wrongParent = v({ selected: ['Active sprint'], title: 'ENG-1042', crumbs: ['Inbox', 'ENG-1042'] })
  expect(wrongParent.verdict === 'mismatch' && wrongParent.message.includes('前面沒有「Active sprint」'), `麵包屑前一層不是選中項應紅,實得 ${JSON.stringify(wrongParent)}`)
  const noCrumb = v({ selected: ['Active sprint'], title: 'ENG-1042' })
  expect(noCrumb.verdict === 'mismatch' && noCrumb.message.includes('沒有麵包屑'), `沒有麵包屑、字不同應紅(不能自稱詳細頁),實得 ${JSON.stringify(noCrumb)}`)
  const lastWrong = v({ selected: ['Active sprint'], title: 'ENG-1042', crumbs: ['Active sprint', 'ENG-1041'] })
  expect(lastWrong.verdict === 'mismatch' && lastWrong.message.includes('末位'), `麵包屑末位 ≠ 標頭應紅,實得 ${JSON.stringify(lastWrong)}`)
  expect(v({ selected: ['Inbox'], title: 'Inbox', crumbs: ['Inbox'] }).verdict === 'ok', '同字時有沒有麵包屑都綠')
  // 不在規則裡的畫面 / 儀器失效
  expect(v({ selected: [], title: 'x' }).verdict === 'skip-no-selection', '沒有選中項 → 不在規則裡')
  expect(v({ selected: ['Inbox'], headerCount: 0, title: null, titleFrom: null }).verdict === 'skip-no-header', '沒有標頭 → 不在規則裡')
  expect(v({ selected: [null], title: 'x' }).message?.includes(INSTRUMENT_FAIL_MARKER), '讀不到選中項的字 → 儀器失效')
  expect(v({ selected: ['A', 'B'], title: 'A' }).message?.includes(INSTRUMENT_FAIL_MARKER), '兩個選中項 → 儀器失效')
  expect(v({ selected: ['A'], title: null, titleFrom: 'ambiguous:2 個 h1' }).message?.includes(INSTRUMENT_FAIL_MARKER), '多個 h1 → 儀器失效')
  expect(v({ selected: ['A'], title: '', titleFrom: 'h1' }).verdict === 'mismatch', 'h1 是空的(查表查不到)→ 紅,不是略過')
  expect(v({ selected: ['A'], title: '', titleFrom: 'header-text' }).verdict === 'skip-no-title', '沒有 h1 的標頭裡沒有字(只有按鈕)→ 不在規則裡')
  // 覆蓋下限
  const full = { files: [...REQUIRED_FILES], compared: new Map(REQUIRED_COMPARED.map((id) => [id, 1])), clicked: MIN_CLICKED }
  expect(judge([], full).length === 0, `盤點齊、必比的都比到 → 綠,實得 ${JSON.stringify(judge([], full))}`)
  expect(judge([], { ...full, files: full.files.slice(1) }).some((s) => s.includes(INSTRUMENT_FAIL_MARKER) && s.includes('盤點少了')), '盤點少一支 → 儀器失效')
  expect(judge([], { ...full, compared: new Map() }).filter((s) => s.includes('都沒比到')).length === REQUIRED_COMPARED.length, '必比的一格都沒比到 → 每一則儀器失效')
  expect(judge([], { ...full, clicked: 0 }).some((s) => s.includes('點擊那一半')), '點擊後沒比到畫面 → 儀器失效')
}

function inventoryTable(expect) {
  const files = {
    'packages/design-system/src/components/A/a.stories.tsx': "import { SidebarProvider } from './sidebar'\n",
    'packages/design-system/src/components/B/b.stories.tsx': "import { Shell } from './_demo-helpers'\n",
    'packages/design-system/src/components/B/_demo-helpers.tsx': 'export const Shell = () => <SidebarProvider />\n',
    'packages/design-system/src/components/C/c.stories.tsx': "import { ItemLabel } from '@/design-system/patterns/element-anatomy/item-anatomy'\n",
    'packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx': 'SidebarProvider\n',
    'apps/template/src/App.stories.tsx': "import App from './App'\n",
    'apps/template/src/App.tsx': '<SidebarProvider>\n',
  }
  const entries = {
    a: { id: 'a--x', type: 'story', importPath: './packages/design-system/src/components/A/a.stories.tsx' },
    b: { id: 'b--x', type: 'story', importPath: './packages/design-system/src/components/B/b.stories.tsx' },
    c: { id: 'c--x', type: 'story', importPath: './packages/design-system/src/components/C/c.stories.tsx' },
    d: { id: 'a--docs', type: 'docs', importPath: './packages/design-system/src/components/A/a.stories.tsx' },
    t: { id: 't--x', type: 'story', importPath: './apps/template/src/App.stories.tsx' },
  }
  const inv = deriveInventory(entries, { read: (p) => files[p] ?? null, exists: (p) => p in files })
  const ids = inv.map((s) => s.id).sort()
  expect(JSON.stringify(ids) === JSON.stringify(['a--x', 'b--x', 't--x']), `盤點應收 story 自己有 Provider / 經範例 helper / 範本經 ./App 的三則,不收只 import 元件庫的、不收 docs,實得 ${JSON.stringify(ids)}`)
  expect(inv.find((s) => s.id === 'b--x')?.sources.includes('packages/design-system/src/components/B/_demo-helpers.tsx'), '經範例 helper 收進來的,新鮮度來源要含那支 helper')
}

async function fixtureCheck(expect) {
  const browser = await launchBrowserOrSkip()
  if (!browser) return false
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.setContent(FIXTURE_HTML)
    const cases = await page.evaluate(() => [...document.querySelectorAll('[data-sidebar="wrapper"]')].map((s) => s.dataset.case))
    const stable = await readStable(page)
    expect(stable.ok, '夾具頁是靜態的,應讀得到穩定的一格')
    const entry = stable.rows
    for (const [i, row] of entry.entries()) {
      const want = FIXTURE_EXPECT[cases[i]]
      const got = judgeScreen({ story: `fixture-${cases[i]}`, step: '進頁', scopeCount: entry.length, ...row }).verdict
      expect(want && got === want.entry, `夾具「${cases[i]}」進頁應判 ${want?.entry},實得 ${got}(讀到 ${JSON.stringify(row)})`)
    }
    for (const [i, c] of cases.entries()) {
      const want = FIXTURE_EXPECT[c]
      if (!want?.click) continue
      const targets = await page.evaluate(listTargets, i)
      const second = targets[1]
      expect(second?.hit, `夾具「${c}」第二項應點得到,實得 ${JSON.stringify(second)}`)
      if (!second?.hit) continue
      await page.mouse.click(second.x, second.y)
      const row = (await readStable(page)).rows[i]
      const got = judgeScreen({ story: `fixture-${c}`, step: `點「${second.text}」後`, scopeCount: cases.length, ...row })
      expect(got.verdict === want.click, `夾具「${c}」點「${second.text}」後應判 ${want.click},實得 ${got.verdict}(讀到 ${JSON.stringify(row)})`)
      if (want.click === 'mismatch') expect(got.message?.includes(`點「${second.text}」後`) && got.message.includes(`「${second.text}」`), `點了之後的紅燈要指名是哪一步、哪個字,實得 ${got.message}`)
    }
  } finally { await browser.close() }
  return true
}

/** (d) 真建置對照:同一頁弄壞一處的字必紅並指名;塞進麵包屑判詳細頁 / 麵包屑前一層不對必紅 */
async function realBuildCheck(expect) {
  const story = 'design-system-components-sidebar-展示--icon-collapse'
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  if (!browser) return
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const open = () => openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(story)}&viewMode=story&globals=${encodeURIComponent('theme:light')}`, { waitFor: '#storybook-root main header h1', settleFrames: 3, label: story })
    const verdictNow = async () => { const rows = await page.evaluate(readScreens); return rows.map((r) => judgeScreen({ story, step: '對照組', scopeCount: rows.length, ...r })) }
    await open()
    const clean = await verdictNow()
    expect(clean.length === 1 && clean[0].verdict === 'ok', `真建置現況應綠(先證明量得到),實得 ${JSON.stringify(clean)}`)
    await page.evaluate(() => { document.querySelector('#storybook-root main header h1').textContent = 'Dashboard' })
    const broken = await verdictNow()
    expect(broken[0]?.verdict === 'mismatch' && broken[0].message.includes(story) && broken[0].message.includes('「Dashboard」') && broken[0].message.includes('「Due soon」'), `真建置把標頭改成 Dashboard 應紅並指名,實得 ${JSON.stringify(broken)}`)
    const crumb = (parent) => page.evaluate((p) => {
      const h = document.querySelector('#storybook-root main header')
      h.querySelector('nav')?.remove()
      const nav = document.createElement('nav')
      nav.setAttribute('aria-label', '麵包屑')
      nav.innerHTML = `<ol><li data-bc-role="root"><a href="#">${p}</a></li><li data-bc-role="current"><span aria-current="page" role="link">ENG-1042</span></li></ol>`
      h.insertBefore(nav, h.querySelector('h1'))
      h.querySelector('h1').textContent = 'ENG-1042'
    }, parent)
    await crumb('Due soon')
    const detail = await verdictNow()
    expect(detail[0]?.verdict === 'detail', `真建置塞進「Due soon / ENG-1042」麵包屑應判詳細頁,實得 ${JSON.stringify(detail)}`)
    await crumb('Inbox')
    const wrong = await verdictNow()
    expect(wrong[0]?.verdict === 'mismatch', `真建置麵包屑前一層改成 Inbox 應紅,實得 ${JSON.stringify(wrong)}`)
  } finally { await browser.close(); await server.stop() }
}

async function selftest() {
  let ok = true
  const expect = (cond, msg) => { if (!cond) { console.error(`✗ selftest:${msg}`); ok = false } }
  judgeTable(expect)
  inventoryTable(expect)
  if (!ok) { console.error('❌ sidebar-label-matches-header selftest FAIL(判定表 / 盤點)'); return false }
  await fixtureCheck(expect)
  if (!ok) { console.error('❌ sidebar-label-matches-header selftest FAIL(夾具頁)'); return false }
  if (staticArg) requireStorybookBuild(path.join(STATIC, 'index.json'))
  else requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/Sidebar/sidebar.stories.tsx', 'packages/design-system/src/stories-helpers/data/sidebar-nav.ts'])
  await realBuildCheck(expect)
  console.log(ok ? '✅ sidebar-label-matches-header selftest PASS' : '❌ sidebar-label-matches-header selftest FAIL(真建置對照)')
  return ok
}

// ── 主跑 ────────────────────────────────────────────────────────────────────

/** 畫面讀到連續兩格(中間隔一個 requestAnimationFrame)一樣才算數 —— 點擊後 React 重畫、版面量測重排都在這之前結束;
 *  等的是「畫面不再變」本身,不是固定毫秒(M32 第四題);最多 60 格,讀不到穩定的一格 = 儀器失效(呼叫端標記) */
async function readStable(page) {
  const frame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))
  let prev = await page.evaluate(readScreens)
  for (let i = 0; i < 60; i++) {
    await frame()
    const now = await page.evaluate(readScreens)
    if (JSON.stringify(now) === JSON.stringify(prev)) return { ok: true, rows: now }
    prev = now
  }
  return { ok: false, rows: prev }
}

async function measure() {
  requireStorybookBuild(path.join(STATIC, 'index.json'))
  const index = JSON.parse(readFileSync(path.join(STATIC, 'index.json'), 'utf8'))
  const inventory = deriveInventory(index.entries ?? {}, {
    read: (rel) => { try { return readFileSync(path.join(REPO, rel), 'utf8') } catch { return null } },
    exists: (rel) => existsSync(path.join(REPO, rel)),
  })
  const files = [...new Set(inventory.map((s) => s.importPath))]
  if (!staticArg) requireFreshStorybookBuild(STATIC, [...new Set(inventory.flatMap((s) => s.sources)), 'packages/design-system/src/components/Sidebar/sidebar.tsx'])
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  if (!browser) return null
  const results = []
  const compared = new Map()
  const notClicked = []
  let clicked = 0
  const record = (story, step, rows, ok, scopeCount = rows.length) => {
    for (const row of rows) {
      const s = { story, step, scopeCount, ...row }
      if (!ok) s.titleFrom = 'ambiguous:畫面一直在變,讀不到穩定的一格'
      results.push(s)
      const v = judgeScreen(s).verdict
      if (v === 'ok' || v === 'mismatch' || v === 'detail') compared.set(story, (compared.get(story) ?? 0) + 1)
    }
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    for (const { id } of inventory) {
      const url = `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=${encodeURIComponent('theme:light')}`
      await openStory(page, url, { settleFrames: 3, label: id })
      const entry = await readStable(page)
      record(id, '進頁', entry.rows, entry.ok)
      // 進頁就有選中項 + 標頭的那幾份,逐一點側欄上看得到的項目
      for (const row of entry.rows) {
        const v = judgeScreen({ story: id, step: '進頁', scopeCount: entry.rows.length, ...row }).verdict
        if (!['ok', 'mismatch', 'detail'].includes(v)) continue
        const keys = (await page.evaluate(listTargets, row.scope)).map((t) => t.key)
        for (const key of keys) {
          const t = (await page.evaluate(listTargets, row.scope)).find((x) => x.key === key)
          if (!t) { notClicked.push(`${id} 「${key}」點之前不見了`); continue }
          if (!t.hit) { notClicked.push(`${id} 「${t.text}」${t.why}`); continue }
          await page.mouse.click(t.x, t.y)
          const after = await readStable(page)
          const mine = after.rows.filter((r) => r.scope === row.scope)
          record(id, `點「${t.text}」後`, mine, after.ok, after.rows.length)
          clicked += mine.filter((r) => ['ok', 'mismatch', 'detail'].includes(judgeScreen({ story: id, step: '', scopeCount: 1, ...r }).verdict)).length
        }
      }
    }
  } finally { await browser.close(); await server.stop() }
  return { results, coverage: { files, compared, clicked }, inventory, notClicked }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit((await selftest()) ? 0 : 1)
  try {
    const out = await measure()
    if (out === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / BROWSER-REQUIRED 判定
    const { results, coverage, inventory, notClicked } = out
    const byStory = new Map()
    for (const r of results) {
      const v = judgeScreen(r).verdict
      const m = byStory.get(r.story) ?? {}
      m[v] = (m[v] ?? 0) + 1
      byStory.set(r.story, m)
    }
    console.log(`  盤點:${coverage.files.length} 支檔、${inventory.length} 則 story;比到 ${[...coverage.compared.values()].reduce((a, b) => a + b, 0)} 個畫面(點過側欄之後 ${coverage.clicked} 個)`)
    for (const [story, m] of byStory) if (m.ok || m.mismatch || m.detail || m.instrument) console.log(`  ${story.padEnd(72)} ${Object.entries(m).map(([k, n]) => `${k} ${n}`).join('  ')}`)
    if (notClicked.length) console.log(`  沒點的(看不到 / 被蓋住,不算失敗):${notClicked.length} 個,例:${notClicked.slice(0, 3).join(';')}`)
    const failures = judge(results, coverage)
    if (failures.length) { console.error('❌ sidebar-label-matches-header FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log(`✅ sidebar-label-matches-header PASS(側欄選中項的字 = 頁面標頭的字;${RULE})`)
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
