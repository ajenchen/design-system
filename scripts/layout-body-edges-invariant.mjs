#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 建置好的 Storybook 裡全部 story 逐則開、不抽樣,下面這些入口看得到的每一個會給上下內距的容器:開頁就看得到的;
 *         story 根節點裡每個 aria-haspopup="dialog" 觸發點點開之後的;每個一般按鈕(button / role=button,同一則裡字一樣的只點第一個,
 *         hover 才顯示的也點)與每個 aria-haspopup="menu" 選單的每個項目點了之後新出現的(新的 role=dialog 或新容器)。
 *         **量不到(照實寫,不是「全部」)**:滑過才開的浮層、右鍵選單、子選單、收起來的分頁 / 摺疊區裡(DOM 不在)的入口、浮層裡再點開的第二層、
 *         連結(a[href])與非按鈕元素(整列可點的 tr / div)打開的浮層、aria-haspopup="menu" 觸發點本身左鍵打開的東西(只開它的選單,左鍵不開就試右鍵);
 *         同一則裡打開的東西容器長得一樣(宣告 + 最後一個子元素相同)只量第一個(月曆每一天開同一個對話框)(2026-11-17 A102 審查 MF1:只點 aria-haspopup="dialog" 時,
 *         Empty「建立任務」、TreeView「重新命名」、DataTable 列動作的對話框都量不到、也不報)。這些容器
 *         「最後一個東西 → 容器底」照 packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md 規則 4 ——
 *         bounded region(有完整外框:表格 / 卡片 / 面板)→ loose;unbounded region(無框、清單自帶上下內距)→ 0;
 *         element:容器擋住頁面或高度撐滿 → bottom(48);不擋頁面、高度貼內容(含被上限卡住在捲 / 高度寫死)→ 與頂部同值。
 *         md / lg 兩種密度各量一次。
 *   為什麼不用清單(2026-11-17,A102):header-content-sides-invariant.mjs 只量登記的 28 處;A18(35508c15)新增的
 *         「大檔位:對話框裡放表格」不在清單,底 48(應 16 / 24)在同一份建置上舊閘是綠的。清單的維護成本(行號)有人付,
 *         「涵蓋新範例」沒有任何東西逼人付。這支改成從 DOM 找容器:
 *           (a) 所有 [data-layout-body](容器自判的正門:tokens/layoutSpace/layoutSpace.css);
 *           (b) DS 的 body 標記(SurfaceBody / DialogBody / SheetBody 外殼 / role=log)裡沒有 (a) 的;
 *           (c) chrome 標頭(<header> / SurfaceHeader)的下一塊(header-first-gap 的 pageKit.findBody)—— consumer 自己寫內距的容器;
 *               下一塊本身是字(p / span / 標題 …)、裡面還有別的標頭(版面外層)、或它之後同層還有 (a)(b) 的容器(那一塊是搜尋列之類的 chrome)不算。
 *         容器裡又有容器 = 版面外層,不判(判裡面那個)。
 *   觸發點按它「自己的表面」(lib/launch-browser.mjs ownSurfacePosition),不按正中央 —— 正中央可能是欄位裡的 Tag 移除鈕(A103)。
 *   判法(全部從既有的閘 import,判法只有一個住所 —— M17):頁面量具 = header-first-gap-invariant.mjs 的 pageKit(只多一條:絕對定位的
 *         role=progressbar 算內容,pageKit 其餘絕對定位照舊當裝飾略過 —— FileItem 精簡列的進度條疊在列的下內距裡,A104);
 *         最後一個東西的角色 = classifyFirst(有框 → bounded、無框清單自帶 py → unbounded、其餘 element);容器種類 = header-content-sides 的 classifyBox
 *         (modal / 撐滿 / 貼內容 / 被上限卡住 / 高度寫死);期望值 = 同檔 bottomWant。本檔多三件事:
 *         ① 元件根部的邊緣標記 data-layout-region="bounded|unbounded" 優先於 DOM 判法(Sidebar 的 py 在群組那一層,DOM 分不出;舊閘 NOT_COVERED),
 *            但**閘不信任標記本身(M37)**:每一個看得見的標記另驗 —— bounded 必須真的有框;unbounded 必須無框、第一 / 最後一列離它的上 / 下緣 > 0。
 *         ② 容器宣告的種類(data-layout-body="fill" | "hug")必須等於 DOM 量到的:宣告 fill 卻量成貼內容、宣告 hug 卻量成撐滿 → 紅
 *            (CSS 依宣告給 element 的值,宣告錯了值就錯)。容器在捲動區(ScrollArea viewport)裡時,種類量捲動區那一層(看得見的那一塊)。
 *         ③ 設定列 / 選項列(<label> 裡有勾選 / 開關 / 單選)量列的外框:列的上下內距是元件自己的(switch.tsx fieldRowPaddingY),
 *            跟按鈕量外框同一個道理(header-content-sides 的 asBox)。修前全站掃描把它量成空白(Dialog「通知設定」底 53.5 / 應 48)。
 *   例外:scripts/layout-body-edges-exceptions.json(只准變少;整筆比,見 judgeLedgerGrowth)。structural = 不套規則 4 的結構分區 / 置中狀態;exceptions = 有規格依據、改用別的值;
 *         pending = 量到的現況違規、照規則修畫面會變、等 user 看過(寫 measured / want / visualChange);triggers = 點了不開 role=dialog 的觸發點。
 *         每一筆對不到任何容器(完整跑)= 過期 → 紅。**只准變少**:對照 main 的分岔點(git merge-base)與 HEAD,**每一個**有這個檔的基準都要過 ——
 *         新出現的 key、或同一個 key 整筆有任何改寫(放寬 stories / container / trigger、換種類…;只把 stories 縮成子集不算)一律紅,
 *         除非那一筆帶**新的** userQuote(user 逐字)+ quoteDate —— AI 不能自己加或放寬例外。基準都沒有這個檔 = 第一次登記,不限。
 *   紅: (exit 1)任一容器 × 密度底距與期望值差 > 0.5px;標記與 DOM 對不上;宣告的容器種類與量到的不符;例外過期;新例外沒有 user 原話。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL;不是產品裁決,也不算通過): 建置沒有 story、任一則開不起來、觸發點點了沒有出現 role=dialog 又沒登記、
 *         一般按鈕 / 選單項目重開之後點不到或點了頁面不見了、選單觸發點點了沒出現 role=menu(都沒登記時)、一則的按鈕 + 選單觸發點超過 CLICK_CAP、
 *         量不到底 / 頂 / token / 容器種類、第一個內容沒捲在最上面、兩種密度在頁面根讀到同一個 loose、完整跑時一個容器都沒量到、
 *         靠觸發點才量到的容器 0 個(那一步沒在起作用)、算不出 main 的分岔點。
 *         **開不起來重開一次**(measureWithRetry,2026-11-17):一則 × 一密度遇到瀏覽器掛掉 / 開不起來 / 錯誤頁(含 play 斷言失敗)/ 動畫沒跑完,
 *         關掉瀏覽器重開、同一則只重試一次,第二次仍失敗才判上面那條;重試一律印出來。數量上限(重開也一樣)與量具自己的程式錯不重試。判定標準不動。
 *   綠: 全部 story 量完,上面每一條都沒有。只等被量的東西本身與動畫跑完,不睡固定時間;重複跑恆等。
 *   --selftest: (a) 判定表(不開瀏覽器):bounded / unbounded / element × fill / hug / capped / pinned 每格該綠、該紅各一;標記與 DOM 對不上兩種;
 *         宣告種類不符兩種;例外 / structural / pending(未修、已修好要刪)/ 觸發點登記 / 過期 / 新例外沒有 userQuote / 有 userQuote / 分岔點沒有檔;
 *         整筆比:同一個 key 放寬 stories + container、trigger 改 "*"、換種類、沿用舊原話放寬 → 紅;一字不改 / stories 縮成子集 / 刪掉 / 帶新原話 → 不紅;
 *         分岔點沒有、只有 HEAD 有的新 key → 紅;
 *         儀器失效五種;開不起來重開一次(第一次錯誤頁、第二次開得起來 → 綠;兩次都錯誤頁 → INSTRUMENT-FAIL;瀏覽器掛掉一次 → 綠;數量上限 / 程式錯不重試)。(b) 真建置(Dialog「大檔位:對話框裡放表格」,點開才看得到):現況綠(底 = loose);
 *         δ 不點觸發點 → 那個容器不在結果裡(證明點開這一步必要);γ 拿掉表格外框的 data-layout-region → 紅、底 48、訊息點名「缺標記」;
 *         β 注入一行 CSS 讓容器不再自判(底一律 bottom)→ 同一格紅;另 SurfaceBody 三段範例(hug)紅「與頂部同值」;
 *         ε 一般按鈕 / 選單項目打開的對話框(Empty「建立任務」、DataTable 列動作「編輯」與「更多操作 → 刪除」)量得到;
 *         同一則不點(triggers:false)就量不到;
 *         ζ 觸發點按「自己的表面」(DataTable 篩選面板大密度「類別 篩選值」正中央是 Tag 移除鈕)全打得開,對照組按正中央 → 打不開(A103);
 *         η 絕對定位的進度條算最後一個內容(FileItem 上傳管理面板精簡列:底 = 頂),對照組藏起進度條 → 量到說明字、紅(A104);
 *         標記造假兩種(Sidebar 群組改標 bounded、表格外框改標 unbounded)→ 標記檢查紅。
 *   分片(--shard=i/n,i 從 0 起;CI 兩格 0/2、1/2):story id 依字碼穩定排序後取模。每片照常判(量測、標記、0 個容器 / 0 則 story = 儀器失效);
 *         例外帳「只准變少」與 --selftest 只在第 0 片做(--selftest 帶非 0 片直接略過、印出來);過期:整筆對到的 story 都在這一片的由這一片判,
 *         跨片的由第 0 片到別片的 story 逐則補量(md、lg,對到就停)判,stories 是 * 的跨片登記分片時不判過期(不分片的完整跑才判,印出來)。
 *   用法: node scripts/layout-body-edges-invariant.mjs [--static=<storybook-static>] [--concurrency=4] [--limit=N] [--only=<id,id>] [--shard=i/n] [--dump=<json>] [--selftest]
 *         --static 指定建置時不跑新鮮度守衛;--limit / --only 不判過期、總量下限與只准變少(不讀 git —— meta-test 在拋棄式快照裡用 --limit=60)。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readServedStorybookIndex, startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { isDirectRun } from './lib/direct-run.mjs'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowser, launchBrowserOrSkip, openStory, ownSurfacePosition, requireFreshStorybookBuild, requireStorybookBuild, StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'
import { classifyFirst, installPageKit } from './header-first-gap-invariant.mjs'
import { bottomWant, classifyBox, FOLLOW_STEP } from './header-content-sides-invariant.mjs'

const GATE_NAME = 'layout-body-edges'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARGS = process.argv.slice(2)
const argValue = (name) => ARGS.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? null
const SELFTEST = ARGS.includes('--selftest')
const STATIC_ARG = argValue('--static')
const STATIC = path.resolve(STATIC_ARG ?? path.join(REPO, 'storybook-static'))
const LIMIT = Number(argValue('--limit') ?? 0) || 0
const ONLY = argValue('--only')?.split(',').filter(Boolean) ?? null
const CONCURRENCY = Math.max(1, Number(argValue('--concurrency') ?? 4) || 4)
const DUMP = argValue('--dump')
const SHARD_ARG = argValue('--shard')
const MAIN_REF = process.env.LAYOUT_BODY_EDGES_MAIN_REF ?? 'origin/main'
export const EXCEPTIONS_PATH = 'scripts/layout-body-edges-exceptions.json'
const TOL = 0.5
const DENSITIES = ['md', 'lg']
const ROLES = ['bounded', 'unbounded', 'element']
const VIEWPORT = { width: 1280, height: 900 }
/** 一則 story 最多點幾個觸發點(2026-11-17 全站實量:最多的一則用到 11 個)。超過 → 儀器失效(不默默只量前面幾個)。 */
const TRIGGER_CAP = 16
/** 一則 story 最多點幾個一般按鈕 + 選單觸發點(字不重複)。超過 → 儀器失效。 */
const CLICK_CAP = 160
const TRIGGERS = '#storybook-root [aria-haspopup="dialog"]:not([aria-expanded="true"]):not([disabled]):not([aria-disabled="true"])'
/** 新鮮度守衛:全部 story 與它們用的元件 + 範本 + 決定密度怎麼套的預覽層。 */
const FRESH_SOURCES = ['packages/design-system/src', 'apps/template/src', 'packages/storybook-config/preview.tsx']
/** --selftest (b) 用的真範例(A18 那則;點觸發點才看得到) */
export const CONTROL_STORY = 'design-system-components-dialog-展示--large-with-table'
const CONTROL_TRIGGER = '預覽匯入的任務'
const HUG_STORY = 'design-system-internal-patterns-overlay-surface--three-part-structure'
const SIDEBAR_STORY = 'design-system-components-sidebar-展示--mixed-content'
/** --selftest ε:一般按鈕 / 選單項目才打得開的對話框(審查 MF1 點名的入口) */
const CLICK_STORIES = [
  ['design-system-components-empty-展示--no-tasks', ['建立任務']],
  ['design-system-components-datatable-展示--row-actions', ['編輯', '更多操作 → 刪除']],
]
/** --selftest ζ:觸發點正中央是欄位裡另一個有自己行為的東西(大密度第一個「類別 篩選值」正中央是 Tag 的移除鈕;A103) */
const OWN_SURFACE_STORY = 'design-system-components-datatable-展示--filter-panel-states'
const OWN_SURFACE_TRIGGER = '類別'
/** --selftest η:最後一個內容是絕對定位的進度條(FileItem 精簡列;A104) */
const PROGRESS_STORY = 'design-system-components-fileitem-展示--upload-manager-compact-surface'

// ═══════════════════════════════════════════════════════════════════════════
// 頁面端(被 toString 送進頁面,不得引用外層變數;量具一律用 window.__layoutKit = header-first-gap 的 pageKit)
// ═══════════════════════════════════════════════════════════════════════════

/** 找容器並打標記(data-lbe-c / data-lbe-h)。已經打過標記的不再回傳(點開觸發點之後只回新出現的)。 */
export const discoverContainers = () => {
  const K = window.__layoutKit
  window.__lbeK = window.__lbeK ?? 0
  const HEAD = 'header, [data-slot="surface-header"]'
  const DS_BODY = '[data-slot="surface-body"], [data-dialog-body], [data-sheet-body], [role="log"]'
  const TEXT_LEAF = /^(p|span|h[1-6]|label|li|a|button|small|strong|em|code|dt|dd)$/
  const all = () => [...document.querySelectorAll('[data-lbe-c]')]
  const touches = (el) => all().some((c) => c === el || c.contains(el) || el.contains(c))
  const out = []
  const take = (el, src, h = null) => {
    const k = window.__lbeK++
    el.setAttribute('data-lbe-c', String(k))
    if (h && !h.hasAttribute('data-lbe-h')) h.setAttribute('data-lbe-h', String(k))
    out.push({ k, src })
  }
  // 容器正上方的 chrome 標頭(容器或它往上兩層的前一個看得見的兄弟):有的話頂從標頭底量(同 header-first-gap / header-content-sides 的量法);
  // 沒有就從容器內緣量。中間隔著別的東西(例:搜尋列)就不算它的標頭
  const headerOf = (el) => {
    for (let n = el, up = 0; n && up < 3; n = n.parentElement, up++) {
      let s = n.previousElementSibling
      while (s && !K.vis(s)) s = s.previousElementSibling
      if (s) return s.matches(HEAD) ? s : null
    }
    return null
  }
  for (const el of document.querySelectorAll('[data-layout-body]')) if (K.vis(el) && !el.hasAttribute('data-lbe-c')) take(el, 'declared', headerOf(el))
  for (const el of document.querySelectorAll(DS_BODY)) if (K.vis(el) && !touches(el)) take(el, 'ds-body', headerOf(el))
  for (const h of document.querySelectorAll(HEAD)) {
    if (!K.vis(h) || h.hasAttribute('data-lbe-h')) continue
    const cand = K.findBody(h)
    if (!cand || touches(cand)) continue
    if (cand.hasAttribute('data-layout-region') || cand.hasAttribute('data-data-table-outer')) continue
    if (TEXT_LEAF.test(cand.tagName.toLowerCase()) || !cand.firstElementChild) continue
    // 之後同層還有容器 → 這一塊是那個容器之前的 chrome 列(例:欄位顯示面板的搜尋列),不是 body
    let later = false
    for (let s = cand.nextElementSibling; s; s = s.nextElementSibling) if (touches(s)) { later = true; break }
    if (later) continue
    // 裡面還有看得見的標頭 = 版面外層(例:overlay-surface 範例把整張卡放在說明標頭底下)
    if ([...cand.querySelectorAll(HEAD)].some((x) => K.vis(x))) continue
    take(cand, 'header-block', h)
  }
  return out
}

/** 每一個看得見的邊緣標記:DOM 特徵、裡面第一 / 最後一列離它上 / 下緣多遠(Node 端判標記實不實)。 */
export const auditRegions = () => {
  const K = window.__layoutKit
  const ITEMS = '[role=option], [role^=menuitem], [role=treeitem], [role=listitem], li, a[href], button, [data-sidebar="menu-button"]'
  const out = []
  // 清單在捲(CommandList / SelectMenu 有上限)時,第一列量「捲到頂」、最後一列量「捲到底」—— 看的是清單自己的上下留白,不是此刻看得到的範圍
  const scrollers = (el) => [el, ...el.querySelectorAll('*')].filter((n) => n.scrollHeight - n.clientHeight > 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY))
  for (const el of document.querySelectorAll('[data-layout-region]')) {
    if (!K.vis(el)) continue
    const items = [...el.querySelectorAll(ITEMS)].filter((x) => K.vis(x) || x.getBoundingClientRect().height > 1)
    const sc = scrollers(el)
    const saved = sc.map((n) => n.scrollTop)
    sc.forEach((n) => n.scrollTo({ top: 0, behavior: 'instant' }))
    const r = el.getBoundingClientRect()
    const tops = items.map((x) => x.getBoundingClientRect().top)
    sc.forEach((n) => n.scrollTo({ top: n.scrollHeight, behavior: 'instant' }))
    const bots = items.map((x) => x.getBoundingClientRect().bottom)
    sc.forEach((n, i) => n.scrollTo({ top: saved[i], behavior: 'instant' }))
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join(' ')
    out.push({
      mark: el.getAttribute('data-layout-region'), f: K.feat(el),
      desc: `<${el.tagName.toLowerCase()}${el.getAttribute('data-sidebar') ? ` data-sidebar=${el.getAttribute('data-sidebar')}` : ''}${el.hasAttribute('data-data-table-outer') ? ' data-data-table-outer' : ''}${cls ? ` class="${cls}…"` : ''}>`,
      items: items.length,
      firstOffset: items.length ? Math.round((Math.min(...tops) - r.top) * 10) / 10 : null,
      lastOffset: items.length ? Math.round((r.bottom - Math.max(...bots)) * 10) / 10 : null,
    })
  }
  return out
}

/** 量一個容器(header-content-sides probeSides 的底距量法;容器由標記指定;沒有標頭時頂 = 容器內緣 → 第一個內容)。 */
export const probeContainer = ({ k, followStep, exSel }) => {
  const K = window.__layoutKit
  const body = document.querySelector(`[data-lbe-c="${k}"]`)
  const h = document.querySelector(`[data-lbe-h="${k}"]`)
  if (!body) return { err: '容器不見了(量之前被重畫掉)' }
  const round = (x) => Math.round(x * 10) / 10
  const num = (el, p) => parseFloat(getComputedStyle(el)[p]) || 0
  const cap = (s) => s[0].toUpperCase() + s.slice(1)
  const autoMargin = (el, side) => { try { return String(el.computedStyleMap().get(`margin-${side}`)) === 'auto' } catch { return false } }
  const mar = (el, side) => (autoMargin(el, side) ? 0 : num(el, `margin${cap(side)}`))
  const edge = (el, side) => num(el, `padding${cap(side)}`) + num(el, `border${cap(side)}Width`)
  const desc = (el) => {
    const f = K.feat(el)
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join(' ')
    const attrs = ['data-layout-body', 'data-layout-region', 'data-slot', 'data-dialog-body', 'data-sheet-body', 'data-sidebar', 'data-data-table-outer'].filter((a) => el.hasAttribute(a)).map((a) => ` ${a}${el.getAttribute(a) ? `=${el.getAttribute(a)}` : ''}`).join('')
    return `<${f.tag}${f.role ? ` role=${f.role}` : ''}${attrs}${cls ? ` class="${cls}…"` : ''}>「${(el.textContent ?? '').trim().slice(0, 14)}」`
  }
  const hits = (exSel ?? []).filter((e) => { try { return body.matches(e.sel) } catch { return false } }).map((e) => e.key)
  const base = { containerDesc: desc(body), declared: body.getAttribute('data-layout-body'), hits, headerText: h ? (h.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) : null }
  // 版面外層:容器裡還有別的容器 → 不判(判裡面那個)
  if (body.querySelector('[data-lbe-c]')) return { ...base, wrapper: true }
  K.scrollBody(body, 'top')
  // 容器在 ScrollArea 的捲動區裡時(Radix:viewport > display:table 的包層 > 容器),容器種類量捲動區那一層 —— 那才是看得見的那一塊
  // 容器自己不捲、往上兩層內有捲動容器(Radix viewport 或 overflow auto / scroll 的 main 之類)時,種類量那一層 —— 容器本身是內容高的包層
  const scrollable = (n) => n.hasAttribute('data-radix-scroll-area-viewport') || /(auto|scroll)/.test(getComputedStyle(n).overflowY)
  let boxEl = body
  if (!scrollable(body)) for (let n = body.parentElement, up = 0; n && up < 2; n = n.parentElement, up++) if (scrollable(n)) { boxEl = n; break }
  const things = K.collectThings(body)
  if (!things.length) return { ...base, empty: true }
  // 量外框的東西(底):按鈕 / 連結裡的圖示或字 → 按鈕外框(同 header-content-sides 的 asBox);設定列 / 選項列(<label> 裡有勾選 / 開關 / 單選)→ 列外框
  // (列的上下內距是元件自己的)。頂(「與頂部同值」的期望值)照兩支舊閘:pageKit 的「看得見的東西」頂邊,只多設定列這一條(上下用同一個外框才對稱)
  const rowOf = (t) => {
    const row = t.el.closest('label')
    return row && body.contains(row) && row !== body && row.querySelector('input:not([type=hidden]), [role=switch], [role=checkbox], [role=radio]') ? { el: row, f: K.feat(row), boxed: true } : null
  }
  const asBox = (t) => {
    const row = rowOf(t)
    if (row) return row
    const ctl = t.el.parentElement?.closest('button, a[href], [role=button]')
    return ctl && body.contains(ctl) && ctl !== body ? { el: ctl, f: K.feat(ctl), boxed: true } : { ...t, boxed: K.boxedOf(t.f) }
  }
  const bThings = things.map(asBox)
  const bottomOf = (t) => { const r = t.el.getBoundingClientRect(); return t.boxed ? r.bottom : r.bottom - edge(t.el, 'bottom') }
  const topOf = (t) => (t.row ? t.el.getBoundingClientRect().top : t.top)
  let last = bThings[0]
  for (const t of bThings) if (bottomOf(t) > bottomOf(last) + 0.5) last = t
  const tThings = things.map((t) => { const row = rowOf(t); return row ? { ...row, row: true } : t })
  let first = tThings[0]
  for (const t of tThings) if (topOf(t) < topOf(first) - 0.5) first = t
  // 邊緣標記:最後一個東西本身或它往上到容器之間(不含容器)的第一個 data-layout-region → 角色照標記、量那一層的外框
  let region = null
  for (let n = last.el; n && n !== body; n = n.parentElement) if (n.hasAttribute('data-layout-region')) { region = n; break }
  let lastF = last.f
  if (region) last = { el: region, f: K.feat(region), boxed: true }
  const top = h ? topOf(first) - h.getBoundingClientRect().bottom : topOf(first) - (body.getBoundingClientRect().top + num(body, 'borderTopWidth'))
  const flexy = (n) => !!n && /flex|grid/.test(getComputedStyle(n).display)
  const scrolling = (n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1
  let e, pend = 0, scrolls = false, scroller = null
  if (last.el === body) e = body.getBoundingClientRect().bottom - num(body, 'borderBottomWidth')
  else {
    e = last.el.getBoundingClientRect().bottom
    pend = mar(last.el, 'bottom')
    for (let cur = last.el, A = cur.parentElement; A; cur = A, A = A.parentElement) {
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
    // 絕對定位的進度條是內容(2026-11-17 A104):pageKit 的 collectThings 把絕對定位一律當裝飾 / 捲軸 / 浮出的提示略過,但 FileItem 精簡列的
    // 進度條就是絕對定位(疊在列的下內距裡,file-item.tsx compactBarInset)—— 它在流裡時 pageKit 自己就把它判成內容(header-first-gap 的
    // classifyFirst 表「進度條(有底色的細條)→ element」)。略過它,上傳管理面板最後一列量到的是錯誤說明字 → 面板底 20 / 24,
    // 實際最後一個看得見的是進度條 → 面板底 12 / 16(file-item.spec.md「upload-manager 浮層面板 composition」bar → 邊緣)。
    // 只補 role=progressbar(有語意的內容,輔助技術會唸),其餘絕對定位照舊略過。e 是容器的內容終點(從流裡最後一個走上來算的,
    // 與誰是最後一個無關),所以底 = e − 進度條底;進度條要比流裡最後一個低、又不超出 e 才換。
    if (!region) {
      for (const pb of body.querySelectorAll('[role=progressbar]')) {
        if (!K.vis(pb)) continue
        let abs = false
        for (let n = pb; n && n !== body; n = n.parentElement) if (/(absolute|fixed)/.test(getComputedStyle(n).position)) { abs = true; break }
        const b = pb.getBoundingClientRect().bottom
        if (abs && b > bottomOf(last) + 0.5 && b <= e + 0.5) { last = { el: pb, f: K.feat(pb), boxed: true }; lastF = last.f }
      }
    }
  }
  if (!scroller && boxEl !== body && scrolling(boxEl)) { scrolls = true; scroller = boxEl }
  const dlg = body.closest('[role=dialog], [role=alertdialog]')
  // 擋住頁面:Radix modal(aria-modal / body 不收指標),或並存對話框(persistentElements:Radix 走 modal=false,改由同一層的 CoexistenceMask
  // 蓋住頁面、其餘 inert —— lib/overlay-coexistence.ts;只點一般按鈕才打得開的 AgentPanel「新增任務」就是這種,只看 aria-modal 會把它量成貼內容)
  const masked = !!dlg?.parentElement && [...dlg.parentElement.children].some((c) => c !== dlg && c.hasAttribute('data-coexistence-mask'))
  const modal = !!dlg && (dlg.getAttribute('aria-modal') === 'true' || getComputedStyle(document.body).pointerEvents === 'none' || masked)
  const free = boxEl === body
    ? body.getBoundingClientRect().bottom - num(body, 'borderBottomWidth') - e
    : boxEl.getBoundingClientRect().bottom - e
  const stopAt = h ? h.parentElement?.parentElement : boxEl.parentElement?.parentElement
  let capped = false
  if (scrolls) for (let n = scroller; n && n !== stopAt; n = n.parentElement) {
    const mh = getComputedStyle(n).maxHeight
    if (mh !== 'none' && Math.abs(n.getBoundingClientRect().height - parseFloat(mh)) < 1) { capped = true; break }
  }
  let pinned = null
  const viewportH = (v) => Math.abs(v - window.innerHeight) < 1
  for (let n = boxEl, up = 0; n; n = n.parentElement, up++) {
    let hv = null
    try { hv = n.computedStyleMap().get('height') } catch { hv = null }
    const r = n.getBoundingClientRect()
    if (hv && hv.unit === 'px' && !viewportH(hv.value)) { pinned = `${desc(n)} height ${round(hv.value)}px`; break }
    const mh = parseFloat(getComputedStyle(n).minHeight)
    if (mh > 0.5 && !viewportH(mh) && Math.abs(r.height - mh) < 1 && free > 0.5) { pinned = `${desc(n)} min-height ${round(mh)}px`; break }
    if (h ? n.contains(h) : up >= 1) break
  }
  // 容器跟不跟著內容長(classifyBox 的直接量;同 header-content-sides probeSides):最後一個在流裡的子元素下外距暫時 +followStep,看看得見的那一塊長多少
  const tailOf = (el) => {
    for (let c = el.lastElementChild; c; c = c.previousElementSibling) {
      const cs = getComputedStyle(c)
      if (cs.display === 'none' || /(absolute|fixed)/.test(cs.position)) continue
      if (cs.display === 'contents') { const inner = tailOf(c); if (inner) return inner; continue }
      return c
    }
    return null
  }
  let grow = NaN
  const tail = tailOf(body)
  if (!tail && followStep > 0) {
    // 容器裡只有字、沒有子元素可以加外距:改把容器自己的下內距暫時 +followStep(高度被版面寫死的不會長,貼內容的會長足)
    const savedStyle = body.getAttribute('style'), p0 = num(body, 'paddingBottom')
    body.style.setProperty('transition', 'none', 'important')
    const hAt = (d) => { body.style.setProperty('padding-bottom', `${p0 + d}px`, 'important'); return boxEl.getBoundingClientRect().height }
    const h0 = hAt(0)
    grow = hAt(followStep) - h0
    hAt(0)
    if (savedStyle === null) body.removeAttribute('style'); else body.setAttribute('style', savedStyle)
  }
  if (tail && followStep > 0) {
    const savedStyle = tail.getAttribute('style'), b0 = mar(tail, 'bottom')
    tail.style.setProperty('transition', 'none', 'important')
    const hAt = (d) => { tail.style.setProperty('margin-bottom', `${b0 + d}px`, 'important'); return boxEl.getBoundingClientRect().height }
    const h0 = hAt(0)
    grow = hAt(followStep) - h0
    hAt(0)
    if (savedStyle === null) tail.removeAttribute('style'); else tail.setAttribute('style', savedStyle)
  }
  const v = (name) => parseFloat(getComputedStyle(body).getPropertyValue(name))
  return {
    ...base,
    scrolled: round(K.scrollOffset(first.el, body).top),
    top: round(top), bottom: round(e - bottomOf(last)), free: round(free), grow: round(grow),
    lastDesc: desc(last.el), lastF, regionMark: region ? region.getAttribute('data-layout-region') : null, regionF: region ? K.feat(region) : null,
    modal, scrolls, capped, pinned, boxDesc: boxEl === body ? null : desc(boxEl),
    loose: v('--layout-space-loose'), tight: v('--layout-space-tight'), bottomToken: v('--layout-space-bottom'),
    rootLoose: parseFloat(getComputedStyle(document.querySelector('#storybook-root') ?? document.documentElement).getPropertyValue('--layout-space-loose')),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 純函式(判定;呼叫端與 --selftest 共用)
// ═══════════════════════════════════════════════════════════════════════════

/** story id 比對:結尾 * = 開頭相同的都算。 */
export const storyMatches = (patterns, id) => (patterns ?? []).some((p) => (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : p === id))

/** 讀例外檔 → 驗格式;回 { data } 或 { error }。 */
export function parseExceptions(text) {
  let data
  try { data = JSON.parse(text) } catch (e) { return { error: `例外檔不是合法 JSON:${String(e.message).slice(0, 120)}` } }
  const problems = []
  const keys = new Set()
  for (const kind of ['structural', 'exceptions', 'pending', 'triggers']) {
    if (!Array.isArray(data[kind])) { problems.push(`缺 ${kind} 陣列`); continue }
    for (const x of data[kind]) {
      if (!x || typeof x.key !== 'string' || !x.key) { problems.push(`${kind} 有一筆沒有 key`); continue }
      if (keys.has(x.key)) problems.push(`key 重複:${x.key}`)
      keys.add(x.key)
      if (!Array.isArray(x.stories) || !x.stories.length) problems.push(`${x.key}:stories 必須是非空陣列`)
      if (typeof x.reason !== 'string' || x.reason.length < 10) problems.push(`${x.key}:reason 要寫理由`)
      if (kind === 'triggers') { if (typeof x.trigger !== 'string' || !x.trigger) problems.push(`${x.key}:trigger 要寫觸發點的字(那幾則的每個觸發點都算 = "*")`) } else if (typeof x.container !== 'string' || !x.container) problems.push(`${x.key}:container 要寫容器的選擇器`)
      if (kind === 'exceptions' && !(['bottom', 'loose', 'tight'].includes(x.want) || Number.isFinite(x.want))) problems.push(`${x.key}:want 只能是 bottom / loose / tight / 數字`)
      if (kind === 'pending' && !(x.measured && DENSITIES.every((d) => Number.isFinite(x.measured[d])) && x.want && DENSITIES.every((d) => Number.isFinite(x.want[d])) && typeof x.visualChange === 'string')) problems.push(`${x.key}:pending 要寫 measured / want(md、lg 數字)與 visualChange`)
      if (x.userQuote !== undefined && !(typeof x.userQuote === 'string' && x.userQuote.length > 4 && /^\d{4}-\d{2}-\d{2}$/.test(x.quoteDate ?? ''))) problems.push(`${x.key}:userQuote 要逐字、quoteDate 要 YYYY-MM-DD`)
    }
  }
  return problems.length ? { error: problems.join(';') } : { data }
}

/** 頁面要測的選擇器(每一筆容器類登記一個) */
export const exceptionSelectors = (ex) => ['structural', 'exceptions', 'pending'].flatMap((kind) => ex[kind].map((x) => ({ key: x.key, sel: x.container })))

/** 一格量測 → 期望值與判定。回 { failures: [], instrument: [], matched: [key], skipped: bool, pending: bool } */
export function judgeRow(r, ex) {
  const out = { failures: [], instrument: [], matched: [], skipped: false }
  const where = `${r.id} @${r.density}${r.via && r.via !== 'initial' ? `〔點「${r.trigger ?? r.via}」開〕` : ''} ${r.containerDesc ?? ''}`
  if (r.err) { out.instrument.push(`${INSTRUMENT_FAIL_MARKER}:${where} ${r.err}`); return out }
  if (r.wrapper) { out.skipped = true; return out }
  const entry = (kind) => ex[kind].find((x) => (r.hits ?? []).includes(x.key) && storyMatches(x.stories, r.id))
  const structural = entry('structural')
  if (structural) { out.matched.push(structural.key); out.skipped = true; return out }
  if (r.empty) { out.skipped = true; out.empty = true; return out }
  if (!(r.loose > 0) || !(r.tight > 0) || !(r.bottomToken > 0)) { out.instrument.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-loose / tight / bottom`); return out }
  if (!Number.isFinite(r.scrolled)) { out.instrument.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒讀到第一個內容所在捲動區的捲動位置`); return out }
  if (r.scrolled > TOL) { out.instrument.push(`${INSTRUMENT_FAIL_MARKER}:${where} 第一個內容所在的捲動區沒有捲在最上面(捲動位置 ${r.scrolled}px)—— 頂量不準,「與頂部同值」無從比;這是量測沒對好,不是產品的問題`); return out }
  const box = classifyBox(r)
  const role = r.regionMark ?? classifyFirst(r.lastF ?? {})
  if (!ROLES.includes(role) || !box || ![r.bottom, r.top].every(Number.isFinite)) {
    out.instrument.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒量到底 / 頂、角色或容器種類(底 ${r.bottom} / 頂 ${r.top} / 最後 ${role} / 容器 ${box}:內容加高 ${FOLLOW_STEP}px 看得見的那一塊長 ${r.grow})`)
    return out
  }
  // ② 容器宣告的種類 = DOM 量到的(CSS 照宣告給 element 的值)
  if (r.declared !== null && r.declared !== undefined) {
    if (!['fill', 'hug'].includes(r.declared)) out.failures.push(`${where} data-layout-body="${r.declared}":只能是 fill(擋住頁面或撐滿,規則 4 第 1 列)或 hug(不擋頁面、貼內容,第 4 列)`)
    else if (r.declared === 'fill' && box !== 'fill') out.failures.push(`${where} 宣告 data-layout-body="fill"(擋住頁面或撐滿),量到的容器種類是 ${box}(內容加高 ${FOLLOW_STEP}px 看得見的那一塊長 ${r.grow}、多出來的空白 ${r.free}、modal ${r.modal})—— 最後是一般元素時 CSS 會給 48,照規則 4 應與頂部同值;改宣告 hug`)
    else if (r.declared === 'hug' && box === 'fill') out.failures.push(`${where} 宣告 data-layout-body="hug"(不擋頁面、貼內容),量到的是撐滿 / 擋住頁面(內容加高 ${FOLLOW_STEP}px 看得見的那一塊長 ${r.grow}、多出來的空白 ${r.free}、modal ${r.modal})—— 最後是一般元素時 CSS 會給與頂部同值,照規則 4 第 1 列應 48;改宣告 fill`)
  }
  const t = { loose: r.loose, tight: r.tight, bottom: r.bottomToken }
  let { want, rule } = bottomWant({ last: role, box, top: r.top }, t)
  const exc = entry('exceptions')
  if (exc) { out.matched.push(exc.key); want = typeof exc.want === 'number' ? exc.want : t[exc.want]; rule = `例外 ${exc.key}:${exc.reason}` }
  const pend = entry('pending')
  if (pend) {
    out.matched.push(pend.key)
    const was = pend.measured[r.density], should = pend.want[r.density]
    if (Math.abs(r.bottom - was) <= TOL) { out.pending = true; return out }
    if (Math.abs(r.bottom - should) <= TOL) out.failures.push(`${where} 底 = ${r.bottom}px = 規則值 —— pending ${pend.key} 已經修好,從 ${EXCEPTIONS_PATH} 刪掉這一筆`)
    else out.failures.push(`${where} 底 = ${r.bottom}px,pending ${pend.key} 登記的是 ${was}、規則值 ${should} —— 兩個都不是,照規則 4 重推`)
    return out
  }
  if (!Number.isFinite(want)) { out.instrument.push(`${INSTRUMENT_FAIL_MARKER}:${where} 底的期望值算不出來(${rule})`); return out }
  if (Math.abs(r.bottom - want) > TOL) {
    const domRole = classifyFirst(r.lastF ?? {})
    const missing = r.declared && !r.regionMark && domRole !== 'element' ? `;最後一個東西從 DOM 看是 ${domRole}、卻沒有 data-layout-region 邊緣標記 —— 缺標記,容器自判不到(在元件根部加 data-layout-region="${domRole}")` : ''
    out.failures.push(`${where} 底 = ${r.bottom}px,應 ${want}(${rule};最後一個東西 = ${r.lastDesc ?? '?'}${r.regionMark ? `,邊緣標記 ${r.regionMark}` : ''}${r.pinned ? `;${r.pinned}` : ''}${missing})`)
  }
  return out
}

/** ① 邊緣標記實不實(閘不信任標記本身)。rows = auditRegions 的結果(帶 id / density) */
export function judgeRegions(rows) {
  const failures = []
  for (const r of rows) {
    const where = `${r.id} @${r.density} ${r.desc}`
    const dom = classifyFirst(r.f ?? {})
    if (!['bounded', 'unbounded'].includes(r.mark)) { failures.push(`${where} data-layout-region="${r.mark}":只能是 bounded / unbounded(element 不標)`); continue }
    if (r.mark === 'bounded' && dom !== 'bounded') failures.push(`${where} 標 bounded,但量不到完整外框(邊框 ${r.f?.border ?? '?'} 邊、自己的底色 ${r.f?.ownBg}、陰影 ${r.f?.shadow})—— 標記不實,容器會照有框的表格給 loose`)
    if (r.mark === 'unbounded') {
      if (r.f?.framed) failures.push(`${where} 標 unbounded,但它有框(邊框 / 底色 / 陰影)—— 有框照 bounded(規則 4 第 2 列 loose),不是 0`)
      if (!(r.items > 0)) failures.push(`${where} 標 unbounded,但裡面找不到清單項目 —— 無從證明「清單自帶上下內距」`)
      else if (!(r.firstOffset > TOL) || !(r.lastOffset > TOL)) failures.push(`${where} 標 unbounded,但第一列離上緣 ${r.firstOffset}px、最後一列離下緣 ${r.lastOffset}px —— 清單沒有自帶上下內距,容器給 0 會讓列貼邊(規格「常見誤解」第 3 條)`)
    }
  }
  return failures
}

/** 觸發點點了沒開 role=dialog:登記過 → 沒事;沒登記 → 儀器失效(不默默略過)。回 { instrument, matched } */
export function judgeTriggerMiss(r, ex) {
  const hit = ex.triggers.find((x) => storyMatches(x.stories, r.id) && (x.trigger === '*' || (r.trigger ?? '').includes(x.trigger)))
  if (hit) return { instrument: [], matched: [hit.key] }
  if (r.err) return { instrument: [`${INSTRUMENT_FAIL_MARKER}:${r.id} @${r.density} 點「${r.trigger ?? '?'}」量不到它可能打開的東西:${r.err} —— 不默默略過;確定它不開浮層就登記在 ${EXCEPTIONS_PATH} triggers(寫理由)`], matched: [] }
  return { instrument: [`${INSTRUMENT_FAIL_MARKER}:${r.id} @${r.density} 點了觸發點「${r.trigger ?? '?'}」沒有出現 role=dialog —— 量不到它打開的東西;打開的不是對話框就登記在 ${EXCEPTIONS_PATH} triggers(寫理由)`], matched: [] }
}

/** 過期:完整跑時每一筆登記都要對到東西。 */
export function judgeStale(ex, matched) {
  const failures = []
  for (const kind of ['structural', 'exceptions', 'pending', 'triggers']) for (const x of ex[kind]) if (!matched.has(x.key)) failures.push(`${EXCEPTIONS_PATH} ${kind} ${x.key} 對不到任何${kind === 'triggers' ? '觸發點' : '容器'} —— 過期(修好了或範例換了),刪掉這一筆`)
  return failures
}

/** 穩定序列化(key 排序),整筆比對用 */
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v))

/**
 * 只准變少:bases = [{ label, data | null }](與 main 的分岔點 + HEAD)。**每一個**有檔的基準都要過(2026-11-17 A102 審查 MF4:
 * 只比 key 時,改一筆舊登記的 stories / container / trigger 就等於新增例外;只要任一基準有這個 key 就放行時,先 commit 再跑就繞過 —— M37「key 還在」≠「例外沒有變多」)。
 *   - 基準沒有這個 key → 新增:要 userQuote + quoteDate。
 *   - 基準有、整筆(穩定序列化,含種類)相同 → 沒事。
 *   - 只有 stories 變成原本的子集、其他欄位都相同 → 變少,沒事。
 *   - 其他任何改動(放寬 stories、改 container / trigger / want / 種類…)→ 等於新增:要帶**新的** userQuote + quoteDate(與基準那一筆不同的一句),沿用舊原話不算。
 * 刪除不用。
 */
export function judgeLedgerGrowth(ex, bases) {
  const withFile = bases.filter((b) => b.data)
  if (!withFile.length) return []
  const KINDS = ['structural', 'exceptions', 'pending', 'triggers']
  const failures = []
  const quoted = (x) => typeof x.userQuote === 'string' && x.userQuote.length > 4 && /^\d{4}-\d{2}-\d{2}$/.test(x.quoteDate ?? '')
  for (const kind of KINDS) for (const x of ex[kind]) {
    const added = [], changed = []
    for (const b of withFile) {
      const oldKind = KINDS.find((k) => (b.data[k] ?? []).some((o) => o.key === x.key))
      if (!oldKind) { if (!quoted(x)) added.push(b.label); continue }
      const o = b.data[oldKind].find((y) => y.key === x.key)
      if (oldKind === kind && stable(o) === stable(x)) continue
      const { stories: os, ...oRest } = o, { stories: xs, ...xRest } = x
      if (oldKind === kind && stable(oRest) === stable(xRest) && Array.isArray(os) && Array.isArray(xs) && xs.every((s) => os.includes(s))) continue
      if (quoted(x) && (x.userQuote !== o.userQuote || x.quoteDate !== o.quoteDate)) continue
      const fields = [...new Set([...Object.keys(o), ...Object.keys(x)])].filter((f) => stable(o[f]) !== stable(x[f]))
      changed.push(`${b.label}(${oldKind !== kind ? `種類 ${oldKind} → ${kind}` : `改了 ${fields.join(' / ')}`})`)
    }
    if (added.length) failures.push(`${EXCEPTIONS_PATH} 新增 ${kind} ${x.key}(${added.join(' / ')} 沒有這一筆)—— 例外只准變少;新的例外要帶 userQuote(user 逐字)+ quoteDate,AI 不能自己加`)
    if (changed.length) failures.push(`${EXCEPTIONS_PATH} 改寫 ${kind} ${x.key}:與 ${changed.join(';')} 那一筆不同 —— 例外只准變少;放寬或改寫既有登記等於新增例外,要帶新的 userQuote(user 逐字)+ quoteDate(沿用舊原話不算),只有刪掉、或只把 stories 縮成原本的子集不用`)
  }
  return failures
}

/** 兩種密度在頁面根讀到同一個 loose = 密度沒套上 */
export function judgeDensity(rows) {
  const out = []
  for (const id of new Set(rows.map((r) => r.id))) {
    const looses = DENSITIES.map((d) => rows.find((r) => r.id === id && r.density === d && r.rootLoose > 0)?.rootLoose)
    if (looses.every((x) => x > 0) && looses[0] === looses[1]) out.push(`${INSTRUMENT_FAIL_MARKER}:${id} 兩種密度在頁面根讀到同一個 loose(${looses[0]})—— 密度沒套上`)
  }
  return out
}

/** --shard=i/n(i 從 0 起)→ { i, n } 或 { error }。沒給 = 不分片。 */
export function parseShard(spec) {
  if (spec === null || spec === undefined) return { i: 0, n: 1 }
  const m = /^(\d+)\/(\d+)$/.exec(String(spec))
  if (!m || Number(m[2]) < 1 || Number(m[1]) >= Number(m[2])) return { error: `--shard=${spec} 不合法(要 i/n,0 ≤ i < n,例 0/2)` }
  return { i: Number(m[1]), n: Number(m[2]) }
}

/** 分片:story id 依字碼穩定排序後取模(同一族的 story 排在一起,取模把它們輪流分到各片,重的那族 —— 月曆 —— 不會全擠在同一片)。 */
export const shardIds = (ids, { i, n }) => [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).filter((_, k) => k % n === i)

/**
 * 分片時這一片判得了哪幾筆登記的「過期」:那一筆的 stories 對到的 story(全建置)全部在這一片 → 這一片判;
 * 跨片的那幾筆(例:stories 是 * 的 FileViewer 結構列)任何一片都看不到全貌,不判(印出來;不分片的完整跑才判)。對不到任何 story 的歸第 1 片判。
 */
export function staleOwner(ex, allIds, mine, shard) {
  const own = new Set(), spanning = []
  for (const kind of ['structural', 'exceptions', 'pending', 'triggers']) for (const x of ex[kind]) {
    const hit = allIds.filter((id) => storyMatches(x.stories, id))
    if (!hit.length ? shard.i === 0 : hit.every((id) => mine.has(id))) own.add(x.key)
    else if (hit.some((id) => mine.has(id)) || shard.n === 1) spanning.push(x.key)
  }
  return { own, spanning }
}

/** 全部判定(呼叫端與 selftest 共用)。staleKeys:分片時這一片判得了過期的登記(null = 全部) */
export function judgeAll({ rows, regions, triggerMisses, ex, bases, full, staleKeys = null, extraMatched = [] }) {
  const failures = [], instrument = [], matched = new Set()
  let measured = 0, pending = 0, empty = 0, viaTrigger = 0
  for (const r of rows) {
    const j = judgeRow(r, ex)
    failures.push(...j.failures); instrument.push(...j.instrument)
    j.matched.forEach((k) => matched.add(k))
    if (j.pending) pending++
    if (j.empty) empty++
    if (!r.err && !r.wrapper && !j.skipped) { measured++; if (r.via !== 'initial') viaTrigger++ }
  }
  for (const r of triggerMisses) { const j = judgeTriggerMiss(r, ex); instrument.push(...j.instrument); j.matched.forEach((k) => matched.add(k)) }
  failures.push(...judgeRegions(regions))
  instrument.push(...judgeDensity(rows.filter((r) => !r.err)))
  failures.push(...judgeLedgerGrowth(ex, bases))
  extraMatched.forEach((k) => matched.add(k))
  if (full) {
    const scoped = staleKeys ? Object.fromEntries(['structural', 'exceptions', 'pending', 'triggers'].map((k) => [k, ex[k].filter((x) => staleKeys.has(x.key))])) : ex
    failures.push(...judgeStale(scoped, matched))
    if (measured === 0) instrument.push(`${INSTRUMENT_FAIL_MARKER}:這一趟(完整跑或其中一片)一個容器都沒量到 —— 儀器失效,不當綠燈`)
    if (viaTrigger === 0) instrument.push(`${INSTRUMENT_FAIL_MARKER}:這一趟(完整跑或其中一片)沒有任何一個容器是點開觸發點才量到的 —— 點開那一步沒在起作用(A18 那則就是點開才看得到)`)
  }
  return { failures: [...new Set(failures)], instrument: [...new Set(instrument)], counts: { measured, pending, empty, viaTrigger, regions: regions.length } }
}

// ═══════════════════════════════════════════════════════════════════════════
// Node 端:讀例外檔與基準、開瀏覽器量
// ═══════════════════════════════════════════════════════════════════════════

const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/** 只准變少的基準:與 main 的分岔點 + HEAD(同一個 commit 只算一次)。回 { bases } 或 { error } */
export function readBases(mainRef = MAIN_REF) {
  let mb
  try { mb = git(['merge-base', 'HEAD', mainRef]).trim() } catch (e) {
    return { error: `算不出 HEAD 與 ${mainRef} 的分岔點(簽出要 fetch-depth: 0):${String(e.stderr ?? e.message).split('\n')[0].slice(0, 120)}` }
  }
  const out = [], seen = new Set()
  for (const [ref, label] of [[mb, `與 ${mainRef} 的分岔點`], ['HEAD', 'HEAD']]) {
    let sha
    try { sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim() } catch { return { error: `讀不到 ${label}(${ref})` } }
    if (seen.has(sha)) continue
    seen.add(sha)
    let data = null
    try { data = JSON.parse(git(['show', `${sha}:${EXCEPTIONS_PATH}`])) } catch (e) {
      if (!/does not exist|exists on disk, but not in/.test(String(e.stderr ?? e.message))) return { error: `讀不到 ${label} 的例外檔:${String(e.stderr ?? e.message).split('\n')[0].slice(0, 120)}` }
    }
    out.push({ label: `${label} ${sha.slice(0, 8)}`, data })
  }
  return { bases: out }
}

const noRunningAnimation = () => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming?.().iterations === Infinity)

async function openAt(page, origin, notFound, id, density) {
  const url = `${origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=${encodeURIComponent(`theme:light;density:${density}`)}`
  await openStory(page, url, { label: `${id} @${density}`, notFound, settleFrames: 3, timeoutMs: 30_000 })
  await page.mouse.move(0, 0)
  try { await page.waitForFunction(noRunningAnimation, null, { timeout: 10_000 }) } catch { throw new StoryRenderInstrumentError({ storyId: `${id} @${density}`, url, kind: 'animation', reason: '10 秒內動畫沒跑完' }) }
  await installPageKit(page)
}

async function measureRound(page, extra, exSel) {
  const found = await page.evaluate(discoverContainers)
  const rows = []
  for (const c of found) {
    let r
    try { r = await page.evaluate(probeContainer, { k: c.k, followStep: FOLLOW_STEP, exSel }) } catch (e) { r = { err: String(e.message).split('\n')[0].slice(0, 200) } }
    rows.push({ ...extra, src: c.src, ...r })
  }
  const regions = (await page.evaluate(auditRegions)).map((x) => ({ ...extra, ...x }))
  return { rows, regions }
}

/**
 * 一則 story × 一種密度:開頁量一次,再對每個觸發點「重開 → 先把現有容器打標記 → 點 → 等新的 role=dialog → 只量新出現的」。
 * triggers: false 只給 --selftest δ(證明點開這一步必要)。beforeMeasure(page) 只給 --selftest 注入破法。
 * 觸發點按「它自己的表面」(lib/launch-browser.mjs ownSurfacePosition,2026-11-17 A103):正中央可能落在欄位裡另一個有自己行為的東西上 ——
 * DataTable「進階篩選 — 各種狀態」大密度第一個「類別 篩選值」欄位窄到 186px,正中央 x 499 正好是 Tag「移除 Electronics」(489..505),
 * 按下去是把那個標籤拿掉、不是打開選單,於是被記成「點了不開」(一般密度欄位 206px、正中央 501 剛好在 × 右邊,沒事)。
 * 產品與範例都對(按 × 本來就是移除);錯的是量具按的位置 —— 同 overlay-footer-gutter / select-all-footer 閘 2026-10-01 改用這支的理由。
 * 找不到自己的表面(被浮層蓋住:例外檔 triggers 的 *-covered)照舊按(按不到 → 記成點了不開,由例外檔登記)。
 * clickAt: 'center' 與 explore: false 只給 --selftest ζ(對照組:按正中央就打不開;不跑一般按鈕那一輪)。
 */
export async function measureStory(page, origin, notFound, id, density, { exSel, triggers = true, beforeMeasure = null, clickAt = 'own', explore = true } = {}) {
  const rows = [], regions = [], triggerMisses = []
  await openAt(page, origin, notFound, id, density)
  if (beforeMeasure) await beforeMeasure(page)
  const first = await measureRound(page, { id, density, via: 'initial' }, exSel)
  rows.push(...first.rows); regions.push(...first.regions)
  if (!triggers) return { rows, regions, triggerMisses }
  const labels = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 }).map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)), TRIGGERS)
  if (labels.length > TRIGGER_CAP) throw new StoryRenderInstrumentError({ storyId: `${id} @${density}`, url: page.url(), kind: 'trigger-cap', reason: `觸發點 ${labels.length} 個,超過上限 ${TRIGGER_CAP}(調高 TRIGGER_CAP,不默默只量前面幾個)` })
  for (let i = 0; i < labels.length; i++) {
    await openAt(page, origin, notFound, id, density)
    await page.evaluate(discoverContainers) // 先把現有容器打標記 → 點開之後只回新出現的
    const label = await page.evaluate(({ sel, i }) => {
      const els = [...document.querySelectorAll(sel)].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 })
      const el = els[i]; if (!el) return null
      el.setAttribute('data-lbe-trigger', '')
      return (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    }, { sel: TRIGGERS, i })
    if (label === null) { triggerMisses.push({ id, density, trigger: labels[i], err: '重開之後找不到同一個觸發點' }); continue }
    const dialogs = () => [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].filter((d) => !d.hasAttribute('data-lbe-seen') && d.getBoundingClientRect().height > 2).length
    await page.evaluate(() => { for (const d of document.querySelectorAll('[role=dialog], [role=alertdialog]')) d.setAttribute('data-lbe-seen', '') })
    const trig = page.locator('[data-lbe-trigger]').first()
    const at = clickAt === 'own' ? await ownSurfacePosition(await trig.elementHandle()) : { ok: false }
    const position = at.ok ? at.position : undefined
    try { await trig.click({ timeout: 3000, position }) } catch {
      try { await trig.click({ timeout: 3000, force: true, position }) } catch { await page.evaluate(() => document.querySelector('[data-lbe-trigger]')?.focus()); await page.keyboard.press('Enter') }
    }
    try { await page.waitForFunction(dialogs, null, { timeout: 5000 }) } catch { triggerMisses.push({ id, density, trigger: label }); continue }
    await page.mouse.move(0, 0)
    try { await page.waitForFunction(noRunningAnimation, null, { timeout: 10_000 }) } catch { throw new StoryRenderInstrumentError({ storyId: `${id} @${density}`, url: page.url(), kind: 'animation', reason: `點「${label}」之後 10 秒內動畫沒跑完` }) }
    await installPageKit(page)
    if (beforeMeasure) await beforeMeasure(page)
    const got = await measureRound(page, { id, density, via: `trigger#${i}`, trigger: label }, exSel)
    rows.push(...got.rows); regions.push(...got.regions)
  }
  // 一般按鈕 / 選單項目打開的浮層(2026-11-17 A102 審查 MF1:Empty「建立任務」、TreeView「重新命名」、DataTable 列動作 —— 只點 aria-haspopup="dialog" 時量不到、也不報)
  if (!explore) return { rows, regions, triggerMisses }
  const opened = await exploreClicks(page, origin, notFound, id, density, { exSel, beforeMeasure, pristine: labels.length === 0 })
  rows.push(...opened.rows); regions.push(...opened.regions); triggerMisses.push(...opened.triggerMisses)
  return { rows, regions, triggerMisses }
}

/**
 * 頁面端:列出 story 根節點裡的一般按鈕(button / role=button,沒有 aria-haspopup —— dialog 觸發點上面那一輪點過、menu 觸發點走選單那一輪)
 * 與選單觸發點(aria-haspopup="menu")。同一則裡字一樣的只留第一個(表格每一列的「編輯」是同一個動作)。hover 才顯示(opacity-0)的也算,
 * display:none / 停用的不算。打上 data-lbe-btn / data-lbe-menu = 序號,回 { buttons: [label], menus: [label] }。
 */
export const listClickables = () => {
  const root = document.querySelector('#storybook-root')
  for (const el of document.querySelectorAll('[data-lbe-btn], [data-lbe-menu]')) { el.removeAttribute('data-lbe-btn'); el.removeAttribute('data-lbe-menu') }
  const lab = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const ok = (el) => el.getClientRects().length > 0 && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[inert]')
  const pick = (sel, attr) => {
    const seen = new Set(), out = []
    for (const el of root ? root.querySelectorAll(sel) : []) {
      if (!ok(el)) continue
      const l = `${el.getAttribute('role') ?? el.tagName}|${lab(el)}`
      if (seen.has(l)) continue
      seen.add(l)
      el.setAttribute(attr, String(out.length))
      out.push(lab(el))
    }
    return out
  }
  return {
    buttons: pick('button:not([aria-haspopup]), [role=button]:not([aria-haspopup]), button[aria-haspopup="false"]', 'data-lbe-btn'),
    menus: pick('[aria-haspopup="menu"]', 'data-lbe-menu'),
  }
}

/** 頁面端:點一下(DOM click,不受遮擋 / opacity 影響)、等兩個影格,回「有沒有打開新東西」:新的 role=dialog / alertdialog,或新的容器。 */
export const clickAndSee = async ({ sel, menuItem }) => {
  const frames = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
  if (!window.__lbeGuard) {
    window.__lbeGuard = true
    window.addEventListener('submit', (e) => e.preventDefault(), true) // 表單送出不換頁(React 的 onSubmit 照跑)
    window.open = () => null
  }
  const NEW = '[role=dialog]:not([data-lbe-seen]), [role=alertdialog]:not([data-lbe-seen]), [data-layout-body]:not([data-lbe-c]), [data-slot="surface-body"]:not([data-lbe-c]), [data-dialog-body]:not([data-lbe-c]), [data-sheet-body]:not([data-lbe-c])'
  const seenNow = () => [...document.querySelectorAll(NEW)].filter((d) => d.getBoundingClientRect().height > 2)
  let el = document.querySelector(sel)
  if (menuItem !== undefined && menuItem !== null) {
    // 選單:先開選單(Radix 在 pointerdown 開),再點第 menuItem 個項目(子選單觸發點、停用的不算)
    if (!el || !el.isConnected) return { detached: true }
    // 選單還開著(上一個項目點了不關,例:勾選項)就不再按 —— Radix 的觸發點按一下是切換,會把它關掉
    const openMenu = () => [...document.querySelectorAll('[role=menu]')].find((m) => m.getBoundingClientRect().height > 2)
    if (!openMenu()) { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' })); await frames() }
    // 左鍵不開、右鍵才開的選單(AgentPanel 入口鈕:左鍵開面板,右鍵 / Shift+F10 開選單)
    if (!openMenu()) { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })); await frames() }
    const menu = openMenu()
    if (!menu) return { noMenu: true }
    const items = [...menu.querySelectorAll('[role=menuitem], [role=menuitemcheckbox], [role=menuitemradio]')]
      .filter((x) => !x.hasAttribute('aria-haspopup') && !x.hasAttribute('data-disabled') && x.getAttribute('aria-disabled') !== 'true')
    const labs = []
    const uniq = items.filter((x) => { const l = (x.textContent ?? '').trim(); if (labs.includes(l)) return false; labs.push(l); return true })
    if (menuItem === -1) return { items: labs.map((l) => l.replace(/\s+/g, ' ').slice(0, 40)) }
    el = uniq[menuItem]
    if (!el) return { detached: true }
  }
  if (!el || !el.isConnected) return { detached: true }
  const before = new Set(seenNow())
  el.click()
  await frames()
  const fresh = seenNow().filter((d) => !before.has(d))
  return { opened: fresh.length > 0 }
}

/**
 * 頁面端:在目前這一頁接著點還沒點過的開頁按鈕(字),每點一個等兩個影格看有沒有打開新東西;打開了就停。回 { done, opened, sig | exhausted | timeUp }。
 * 同一則裡打開的東西「長得一樣」(sigs 裡已有:每個容器的宣告 / 最後一個子元素的標籤、class 前四個、邊緣標記 —— 規則 4 看的就是這兩樣;
 * 浮層裡沒有可辨認的容器時改比浮層名稱去掉數字)= 量過了
 * (月曆每一天打開的都是同一個「新事件」對話框):按 Escape 關掉、等它真的不見了才在同一頁接著點;關不掉 → 回 { opened, dup } 讓呼叫端重開。
 */
export const clickRun = async ({ initial, tried, budgetMs, sigs = [] }) => {
  const frames = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
  if (!window.__lbeGuard) {
    window.__lbeGuard = true
    window.addEventListener('submit', (e) => e.preventDefault(), true) // 表單送出不換頁(React 的 onSubmit 照跑)
    window.open = () => null
  }
  const NEW = '[role=dialog]:not([data-lbe-seen]), [role=alertdialog]:not([data-lbe-seen]), [data-layout-body]:not([data-lbe-c]), [data-slot="surface-body"]:not([data-lbe-c]), [data-dialog-body]:not([data-lbe-c]), [data-sheet-body]:not([data-lbe-c])'
  const seenNow = () => [...document.querySelectorAll(NEW)].filter((d) => d.getBoundingClientRect().height > 2)
  const SEL = 'button:not([aria-haspopup]), [role=button]:not([aria-haspopup]), button[aria-haspopup="false"]'
  const lab = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const ok = (el) => el.getClientRects().length > 0 && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[inert]')
  const t = new Set(tried), done = [], t0 = performance.now()
  while (performance.now() - t0 < budgetMs) {
    const root = document.querySelector('#storybook-root')
    let target = null, label = null
    for (const el of root ? root.querySelectorAll(SEL) : []) {
      if (!ok(el)) continue
      const l = lab(el)
      if (initial.includes(l) && !t.has(l)) { target = el; label = l; break }
    }
    if (!target) return { done, exhausted: true }
    t.add(label); done.push(label)
    try { sessionStorage.setItem('lbe-tried', JSON.stringify([...t])) } catch { /* 沒有 sessionStorage 就不記 */ }
    const before = new Set(seenNow())
    target.click()
    await frames()
    const fresh = seenNow().filter((d) => !before.has(d))
    if (!fresh.length) continue
    const CONT = '[data-layout-body], [data-slot="surface-body"], [data-dialog-body], [data-sheet-body]'
    const sig = fresh.map((d) => {
      const name = (d.getAttribute('aria-label') || document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent || '').replace(/\d+/g, '#').trim().slice(0, 40)
      const cs = d.matches(CONT) ? [d] : [...d.querySelectorAll(CONT)]
      return `${d.getAttribute('role') ?? d.tagName}:${cs.length ? '' : name}:${cs.map((x) => { const l = x.lastElementChild; return `${x.getAttribute('data-layout-body') ?? x.getAttribute('data-slot') ?? ''}>${l ? `${l.tagName}.${(l.getAttribute('class') ?? '').split(/\s+/).slice(0, 4).join('.')}${l.getAttribute('data-layout-region') ?? ''}` : '-'}` }).join(',')}`
    }).join('|')
    if (!sigs.includes(sig)) return { done, opened: label, sig }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
    let gone = false
    for (let i = 0; i < 60 && !gone; i++) { await frames(); gone = fresh.every((d) => !d.isConnected || d.getBoundingClientRect().height <= 2) }
    if (!gone) return { done, opened: label, sig, dup: true }
  }
  return { done, timeUp: true }
}

/**
 * 一般按鈕與選單項目逐一點(每點開一個就量、重開頁面再點下一個;沒打開東西就在同一頁接著點,下一個被重畫掉了才重開)。
 * 點了沒打開東西 = 這個按鈕本來就不開浮層,不報;打開了 → 量新出現的容器(與 aria-haspopup 那一輪同一套量法)。
 * 上限 CLICK_CAP:超過 → 儀器失效(不默默只點前面幾個)。
 */
async function exploreClicks(page, origin, notFound, id, density, { exSel, beforeMeasure, pristine = false }) {
  const rows = [], regions = [], triggerMisses = []
  // pristine:上面沒點過任何觸發點,頁面還是剛開的樣子(量測只打標記、暫改的樣式都還原)→ 第一次不必重開
  const fresh = async (reuse = false) => {
    if (!reuse) await openAt(page, origin, notFound, id, density)
    await page.evaluate(discoverContainers)
    await page.evaluate(() => { for (const d of document.querySelectorAll('[role=dialog], [role=alertdialog]')) d.setAttribute('data-lbe-seen', '') })
    return page.evaluate(listClickables)
  }
  const measureOpened = async (via, trigger) => {
    await page.mouse.move(0, 0)
    try { await page.waitForFunction(noRunningAnimation, null, { timeout: 10_000 }) } catch { throw new StoryRenderInstrumentError({ storyId: `${id} @${density}`, url: page.url(), kind: 'animation', reason: `點「${trigger}」之後 10 秒內動畫沒跑完` }) }
    await installPageKit(page)
    if (beforeMeasure) await beforeMeasure(page)
    const got = await measureRound(page, { id, density, via, trigger }, exSel)
    rows.push(...got.rows); regions.push(...got.regions)
  }
  const see = async (arg) => {
    let timer
    const timeout = new Promise((res) => { timer = setTimeout(() => res({ lost: '點了之後 10 秒沒有回應' }), 10_000) })
    try { return await Promise.race([page.evaluate(clickAndSee, arg), timeout]) } catch (e) { return { lost: String(e.message).split('\n')[0].slice(0, 160) } } finally { clearTimeout(timer) }
  }
  let list = await fresh(pristine)
  if (list.buttons.length + list.menus.length > CLICK_CAP) throw new StoryRenderInstrumentError({ storyId: `${id} @${density}`, url: page.url(), kind: 'click-cap', reason: `一般按鈕 + 選單觸發點 ${list.buttons.length + list.menus.length} 個(字不重複),超過上限 ${CLICK_CAP}(調高 CLICK_CAP,不默默只點前面幾個)` })
  // 要點的 = 開頁時的按鈕(字不重複)。在頁面裡一口氣接著點(clickRun):點了沒打開東西就在**目前這一頁**找下一個還沒點過的字,
  // 不重開 —— 點了會換掉後面按鈕的頁面(月曆換月、分頁),逐個重開、逐個來回會慢到不能跑;打開了東西就回來量、重開再接著點;
  // 目前這一頁找不到還沒點的字才重開一次,重開之後仍一個都找不到 → 儀器失效。點了頁面不見了(換頁 / 卡住)→ 儀器失效,點名是哪一個。
  const initial = list.buttons.slice()
  const tried = new Set(), sigs = []
  await page.evaluate(() => { try { sessionStorage.removeItem('lbe-tried') } catch { /* 沒有 sessionStorage 就不記 */ } })
  const run = async () => {
    let timer
    const timeout = new Promise((res) => { timer = setTimeout(() => res({ lost: '點了之後 15 秒沒有回應' }), 15_000) })
    try { return await Promise.race([page.evaluate(clickRun, { initial, tried: [...tried], budgetMs: 5000, sigs }), timeout]) } catch (e) { return { lost: String(e.message).split('\n')[0].slice(0, 160) } } finally { clearTimeout(timer) }
  }
  let reopened = true
  for (let guard = 0; guard < initial.length * 2 + 20; guard++) {
    const res = await run()
    if (res.lost) {
      list = await fresh(); reopened = true
      const st = await page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('lbe-tried') ?? '[]') } catch { return [] } })
      const newly = st.filter((l) => initial.includes(l) && !tried.has(l))
      newly.forEach((l) => tried.add(l))
      triggerMisses.push({ id, density, trigger: newly.at(-1) ?? '?', kind: 'click', err: `點了之後頁面不見了(${res.lost})` })
      continue
    }
    res.done.forEach((l) => tried.add(l))
    if (res.opened) {
      if (!res.dup) { await measureOpened(`click#${initial.indexOf(res.opened)}`, res.opened); sigs.push(res.sig) }
      list = await fresh(); reopened = true; continue
    }
    if (res.timeUp) { reopened = false; continue }
    const left = initial.filter((l) => !tried.has(l))
    if (!left.length) break
    if (reopened && !res.done.length) {
      for (const l of left) { tried.add(l); triggerMisses.push({ id, density, trigger: l, kind: 'click', err: '重開之後找不到同一個按鈕' }) }
      break
    }
    list = await fresh(); reopened = true
  }
  for (let t = 0; t < list.menus.length; t++) {
    list = await fresh()
    const tLabel = list.menus[t] ?? '?'
    const probe = await see({ sel: `[data-lbe-menu="${t}"]`, menuItem: -1 })
    if (!probe.items) { triggerMisses.push({ id, density, trigger: tLabel, kind: 'menu', err: probe.lost ? `點了之後頁面不見了(${probe.lost})` : '點了沒有出現 role=menu' }); continue }
    // 上一個項目沒打開東西就在同一頁再開選單點下一個;打開了(量完)或選單 / 項目不見了才重開
    let stale = true
    for (let j = 0; j < probe.items.length; j++) {
      if (stale) list = await fresh()
      let res = await see({ sel: `[data-lbe-menu="${t}"]`, menuItem: j })
      if (!stale && (res.detached || res.noMenu)) { list = await fresh(); res = await see({ sel: `[data-lbe-menu="${t}"]`, menuItem: j }) }
      const label = `${tLabel} → ${probe.items[j]}`
      if (res.detached || res.lost || res.noMenu) { triggerMisses.push({ id, density, trigger: label, kind: 'menu', err: res.lost ? `點了之後頁面不見了(${res.lost})` : '重開之後找不到同一個選單項目' }); stale = true; continue }
      if (res.opened) { await measureOpened(`menu#${t}.${j}`, label); stale = true } else stale = false
    }
  }
  return { rows, regions, triggerMisses }
}

const instrumentLine = (label, error) => {
  const message = String(error?.message ?? error).split('\n')[0]
  return message.includes(INSTRUMENT_FAIL_MARKER) ? message : `${INSTRUMENT_FAIL_MARKER}:story「${label}」沒有量到 —— ${message.slice(0, 240)}`
}

/** 重開也一樣的儀器失效(數量上限:同一份建置每次數到的一樣)—— 不重試 */
const NO_RETRY_KINDS = new Set(['trigger-cap', 'click-cap'])
/** 這次失敗值不值得關掉重開再量一次:瀏覽器掛掉,或 story 開不起來 / 錯誤頁(含 play 斷言失敗)/ 等不到渲染 / 動畫沒跑完這類儀器失效 */
export function isRetryableFailure(error) {
  if (/closed|crash|disconnected|Target/i.test(String(error?.message))) return true
  return error instanceof StoryRenderInstrumentError && !NO_RETRY_KINDS.has(error.kind)
}

/**
 * 一則 story × 一種密度:量一次;失敗 → 關掉重開(relaunch:換一個乾淨的瀏覽器),儀器失效類只重試**一次**,第二次仍失敗才記 INSTRUMENT-FAIL。
 * 2026-11-17(24408a62 第 0 片):decision-card-errors @lg 一次 play 斷言失敗(進場動畫第 0 格就斷言)整片 exit 2,前兩輪同一片都綠。
 * **判定標準不動**:重試只決定「這一則量不量得到」;量到之後的 rows / triggerMisses 照常交給 judgeAll,失敗那一次的量測一筆都不留(measureStory 只在成功時回傳)。
 * 重試一律印出來(不默默吞掉);呼叫端與 --selftest 共用這一支。crashed():分頁 / 瀏覽器已經斷線(訊息沒寫出來的掛掉)。回 { got, retried } 或 { instrument }。
 */
export async function measureWithRetry(label, attempt, relaunch, { log = () => {}, crashed = () => false } = {}) {
  let first = null
  for (let n = 0; n < 2; n++) {
    try {
      const got = await attempt()
      if (first) log(`  · 重試後量到:${label}(第一次:${instrumentLine(label, first).slice(0, 200)})`)
      return { got, retried: Boolean(first) }
    } catch (error) {
      const retryable = crashed() || isRetryableFailure(error)
      await relaunch() // 失敗的那一頁可能還卡著(點了之後沒回應、錯誤頁),換一個乾淨的瀏覽器(重試與下一則都用它)
      if (n === 0 && retryable) { first = error; continue }
      return { instrument: instrumentLine(label, error), retried: Boolean(first) }
    }
  }
  return { instrument: instrumentLine(label, first), retried: true } // 走不到(第二次一定 return);留著讓「沒有結果」不可能被當成綠
}

async function runScan(firstBrowser, server, exSel, shard = { i: 0, n: 1 }, ex = null) {
  const index = readServedStorybookIndex(server)
  const allIds = Object.values(index.entries ?? {}).filter((e) => e.type === 'story').map((e) => e.id)
  let ids = allIds
  if (ONLY) ids = ids.filter((id) => ONLY.includes(id))
  if (shard.n > 1) ids = shardIds(ids, shard)
  if (LIMIT) ids = ids.slice(0, LIMIT)
  if (!ids.length) return { fatal: `${INSTRUMENT_FAIL_MARKER}:${shard.n > 1 ? `第 ${shard.i}/${shard.n} 片分到 0 則 story(建置 ${allIds.length} 則)` : '建置的 index.json 裡沒有任何 story'} —— 儀器失效,不當綠燈` }
  if (shard.n > 1) console.log(`  · 分片 ${shard.i}/${shard.n}:${ids.length} / ${allIds.length} 則(id 排序後取模)`)
  const browsers = [firstBrowser]
  for (let k = 1; k < CONCURRENCY; k++) {
    try { browsers.push(await launchBrowser()) } catch (error) { console.log(`  · 第 ${k + 1} 個瀏覽器起不來(${String(error?.message || error).split('\n')[0]}),以 ${browsers.length} 個 worker 繼續`); break }
  }
  // 沙箱下 Chromium 是 --single-process:每個瀏覽器只開一個分頁、整趟共用(第二個分頁會撞 SIGTRAP —— 2026-11-17 全站實量)
  const workers = []
  for (const b of browsers) { try { workers.push({ b, page: await b.newPage({ viewport: VIEWPORT }) }) } catch (error) { console.log(`  · 有一個瀏覽器開不了分頁(${String(error?.message || error).split('\n')[0]}),少一個 worker`) } }
  const t0 = Date.now()
  const rows = [], regions = [], triggerMisses = [], instrument = []
  const withContainers = new Set()
  const relaunch = async (w) => { try { await w.b.close() } catch { /* 已經掛了 */ } w.b = await launchBrowser(); w.page = await w.b.newPage({ viewport: VIEWPORT }) }
  const pass = async (density, list) => {
    const queue = list.slice()
    let done = 0
    await Promise.all(workers.map(async (w) => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const s0 = Date.now()
        // 瀏覽器掛掉 / 開不起來 / 錯誤頁(play 斷言失敗)→ 關掉重開、同一則只重試一次;第二次仍失敗才算儀器失效(measureWithRetry)
        const res = await measureWithRetry(`${id} @${density}`, () => measureStory(w.page, server.origin, server.notFound, id, density, { exSel }), () => relaunch(w), {
          log: (s) => console.log(s), crashed: () => w.page.isClosed() || !w.b.isConnected(),
        })
        if (res.instrument) instrument.push(res.instrument)
        else {
          const got = res.got
          rows.push(...got.rows); regions.push(...got.regions); triggerMisses.push(...got.triggerMisses)
          if (got.rows.some((r) => !r.err)) withContainers.add(id)
        }
        if (Date.now() - s0 > 30_000) console.log(`  · 慢:${id} @${density} ${Math.round((Date.now() - s0) / 1000)} 秒`)
        if (++done % 100 === 0) console.log(`  … ${density} ${done}/${list.length}(${Math.round((Date.now() - t0) / 1000)} 秒)`)
      }
    }))
  }
  // 第 0 片替跨片的登記判過期:這一片沒對到的那幾筆(stories 不是 *),到別片的 story 裡逐則補量(md、lg),對到就停 —— 只拿來算「對不對得到」,
  // 不當這一片的量測判(那幾則由它們自己那一片判)。stories 是 * 的那幾筆補量等於重跑別片,不做(印出來,完整跑才判)
  const staleExtra = new Set(), staleChecked = new Set()
  const keysOf = (rs, ms) => [...rs.flatMap((r) => judgeRow(r, ex).matched), ...ms.flatMap((r) => judgeTriggerMiss(r, ex).matched)]
  try {
    await pass('md', ids)
    await pass('lg', ids.filter((id) => withContainers.has(id)))
    if (ex && shard.n > 1 && shard.i === 0 && !ONLY && !LIMIT) {
      const mine = new Set(ids), w = workers[0]
      const shardOf = new Map(shardIds(allIds, { i: 0, n: 1 }).map((id, k) => [id, k % shard.n]))
      const seen = new Set(keysOf(rows, triggerMisses))
      for (const kind of ['structural', 'exceptions', 'pending', 'triggers']) for (const x of ex[kind]) {
        const hit = allIds.filter((id) => storyMatches(x.stories, id))
        const others = hit.filter((id) => !mine.has(id))
        // 整筆都在同一片的由那一片自己判(staleOwner);只補「跨片」的
        if (!others.length || x.stories.includes('*') || new Set(hit.map((id) => shardOf.get(id))).size < 2) continue
        staleChecked.add(x.key)
        if (seen.has(x.key)) continue
        // 兩種密度都要補(有的登記只在大密度發生,例:2026-11-17 A103 修掉前的 datatable-filter-panel-states-lg-combobox)
        search: for (const id of [...others].sort()) for (const density of DENSITIES) {
          try {
            const got = await measureStory(w.page, server.origin, server.notFound, id, density, { exSel })
            const k = keysOf(got.rows, got.triggerMisses)
            k.forEach((key) => { seen.add(key); staleExtra.add(key) })
            if (k.includes(x.key)) break search
          } catch { await relaunch(w) }
        }
      }
      console.log(`  · 跨片登記補量:判 ${staleChecked.size} 筆的過期(補量後對到 ${[...staleChecked].filter((k) => seen.has(k)).length} 筆)`)
    }
  } finally { await Promise.all(workers.slice(1).map((w) => w.b.close().catch(() => {}))) }
  console.log(`掃了 ${ids.length} 則(${workers.length} 個瀏覽器,${Math.round((Date.now() - t0) / 1000)} 秒):有容器 ${withContainers.size} 則;量測 ${rows.length} 筆`)
  return { rows, regions, triggerMisses, instrument, total: ids.length, ids, allIds, staleExtra, staleChecked }
}

function loadExceptions() {
  const file = path.join(REPO, EXCEPTIONS_PATH)
  if (!existsSync(file)) return { error: `找不到 ${EXCEPTIONS_PATH}` }
  return parseExceptions(readFileSync(file, 'utf8'))
}

function printResult(result) {
  for (const f of result.failures) console.log(`✗ ${f}`)
  for (const f of result.instrument) console.log(`✗ ${f.includes(INSTRUMENT_FAIL_MARKER) ? '' : `${INSTRUMENT_FAIL_MARKER}:`}${f}`)
  const c = result.counts
  console.log(`容器 × 密度 量了 ${c.measured} 格(點開觸發點才看到的 ${c.viaTrigger};pending 照登記 ${c.pending};空容器 ${c.empty} 格不判);邊緣標記 ${c.regions} 處`)
}

// ═══════════════════════════════════════════════════════════════════════════
// --selftest
// ═══════════════════════════════════════════════════════════════════════════

const T = { md: { loose: 16, tight: 12, bottomToken: 48, rootLoose: 16 }, lg: { loose: 24, tight: 16, bottomToken: 48, rootLoose: 24 } }
const EMPTY_EX = { structural: [], exceptions: [], pending: [], triggers: [] }
const BOX = {
  fill: { modal: true, grow: 0, free: 0, scrolls: false, capped: false, pinned: null },
  hug: { modal: false, grow: FOLLOW_STEP, free: 0, scrolls: false, capped: false, pinned: null },
  capped: { modal: false, grow: 0, free: 0, scrolls: true, capped: true, pinned: null },
  pinned: { modal: false, grow: 0, free: 30, scrolls: false, capped: false, pinned: '<div> height 280px' },
}
const F = { bounded: { dataTable: true, border: 4, framed: true }, unbounded: { role: 'listbox', tag: 'div', selfPad: true }, element: { tag: 'p', text: true } }
const row = (over = {}) => ({ id: 's', density: 'md', via: 'initial', containerDesc: '<div>', declared: null, hits: [], scrolled: 0, top: 12, bottom: 48, lastDesc: 'x', lastF: F.element, regionMark: null, ...BOX.fill, ...T.md, ...over })

function selftestTable() {
  const problems = []
  const expect = (cond, msg) => { if (!cond) problems.push(msg) }
  const red = (r, ex = EMPTY_EX) => judgeRow(r, ex).failures
  const inst = (r, ex = EMPTY_EX) => judgeRow(r, ex).instrument
  // 角色 × 容器種類:每格該綠、該紅(規則 4 四列 + 沒寫到的三種容器)
  for (const d of DENSITIES) {
    const t = T[d]
    const cells = [
      ['bounded', 'fill', t.loose, t.bottomToken], ['bounded', 'hug', t.loose, t.tight],
      ['unbounded', 'fill', 0, 8], ['unbounded', 'hug', 0, t.tight],
      ['element', 'fill', t.bottomToken, t.loose], ['element', 'hug', t.tight, t.bottomToken],
      ['element', 'capped', t.tight, t.bottomToken], ['element', 'pinned', t.tight, t.bottomToken],
    ]
    for (const [role, box, good, bad] of cells) {
      const base = { density: d, ...T[d], ...BOX[box], lastF: F[role], top: t.tight }
      expect(red(row({ ...base, bottom: good })).length === 0, `${role} × ${box} @${d} 底 ${good} 應綠,實得 ${JSON.stringify(red(row({ ...base, bottom: good })))}`)
      expect(red(row({ ...base, bottom: bad })).some((s) => s.includes(`應 ${good}`)), `${role} × ${box} @${d} 底 ${bad} 應紅「應 ${good}」`)
    }
  }
  // A18 形狀:對話框(modal)最後是有框表格、底 48 → 紅、指名規則 4 第 2 列;容器宣告 fill、沒有標記 → 訊息點名「缺標記」
  const a18 = red(row({ declared: 'fill', lastF: F.bounded, bottom: 48 }))
  expect(a18.some((s) => s.includes('應 16') && s.includes('bounded region → 容器底 = loose') && s.includes('缺標記')), `A18 形狀應紅並點名缺標記,實得 ${JSON.stringify(a18)}`)
  // 標記優先於 DOM:Sidebar 群組(DOM 判 element)標 unbounded、底 0 → 綠;同一格底 8 → 紅
  expect(red(row({ regionMark: 'unbounded', lastF: F.element, bottom: 0 })).length === 0, '標 unbounded、底 0 應綠(標記優先於 DOM)')
  expect(red(row({ regionMark: 'unbounded', lastF: F.element, bottom: 8 })).some((s) => s.includes('應 0')), '標 unbounded、底 8 應紅')
  // ② 宣告種類不符
  expect(red(row({ declared: 'fill', ...BOX.hug, bottom: 12, top: 12 })).some((s) => s.includes('宣告 data-layout-body="fill"') && s.includes('改宣告 hug')), '宣告 fill 卻量成貼內容應紅')
  expect(red(row({ declared: 'hug', ...BOX.fill, bottom: 48 })).some((s) => s.includes('宣告 data-layout-body="hug"') && s.includes('改宣告 fill')), '宣告 hug 卻量成撐滿應紅')
  expect(red(row({ declared: 'hug', ...BOX.capped, bottom: 12, top: 12 })).length === 0, '宣告 hug、量成被上限卡住(與頂部同值那一邊)應綠')
  expect(red(row({ declared: 'tall', bottom: 48 })).some((s) => s.includes('只能是 fill')), '宣告值不是 fill / hug 應紅')
  // ① 標記實不實
  const reg = (over) => ({ id: 's', density: 'md', desc: '<div>', items: 3, firstOffset: 8, lastOffset: 8, ...over })
  expect(judgeRegions([reg({ mark: 'bounded', f: F.bounded }), reg({ mark: 'unbounded', f: { tag: 'div' } })]).length === 0, '標記實(有框標 bounded、無框自帶 py 標 unbounded)應綠')
  expect(judgeRegions([reg({ mark: 'bounded', f: { tag: 'div' } })]).some((s) => s.includes('量不到完整外框')), '無框卻標 bounded 應紅')
  expect(judgeRegions([reg({ mark: 'unbounded', f: { ...F.bounded } })]).some((s) => s.includes('它有框')), '有框卻標 unbounded 應紅')
  expect(judgeRegions([reg({ mark: 'unbounded', f: { tag: 'div' }, firstOffset: 0 })]).some((s) => s.includes('沒有自帶上下內距')), '標 unbounded 但列貼邊應紅')
  expect(judgeRegions([reg({ mark: 'unbounded', f: { tag: 'div' }, items: 0, firstOffset: null, lastOffset: null })]).some((s) => s.includes('找不到清單項目')), '標 unbounded 但沒有列應紅')
  expect(judgeRegions([reg({ mark: 'element', f: { tag: 'div' } })]).some((s) => s.includes('只能是 bounded / unbounded')), '標記值不合法應紅')
  // 例外 / structural / pending / 觸發點
  const ex = {
    structural: [{ key: 'st', stories: ['s*'], container: '.x', reason: '結構分區,不是 body 內容' }],
    exceptions: [{ key: 'log48', stories: ['s'], container: '[role=log]', want: 'bottom', reason: '對話區底恆 48(規格例外)' }],
    pending: [{ key: 'pd', stories: ['s'], container: '.p', measured: { md: 20, lg: 24 }, want: { md: 12, lg: 16 }, visualChange: '底 20 → 12', reason: '照規則修畫面會變,等 user 看過' }],
    triggers: [{ key: 'tg', stories: ['s'], trigger: '篩選', reason: '打開的是選單,不是對話框' }],
  }
  expect(judgeRow(row({ hits: ['st'], bottom: 0 }), ex).skipped, 'structural 對到的容器應不判')
  expect(judgeRow(row({ hits: ['log48'], ...BOX.hug, bottom: 48, top: 16 }), ex).failures.length === 0, '例外(對話區底恆 48)對到、底 48 應綠')
  expect(judgeRow(row({ hits: ['log48'], ...BOX.hug, bottom: 16, top: 16 }), ex).failures.some((s) => s.includes('例外 log48')), '例外對到、底不是例外值應紅並指名例外')
  expect(judgeRow(row({ hits: ['pd'], ...BOX.hug, bottom: 20, top: 12 }), ex).pending === true, 'pending 照登記值應綠(計數)')
  expect(judgeRow(row({ hits: ['pd'], ...BOX.hug, bottom: 12, top: 12 }), ex).failures.some((s) => s.includes('已經修好')), 'pending 修好了應紅「刪掉這一筆」')
  expect(judgeRow(row({ id: 'other', hits: ['log48'], ...BOX.hug, bottom: 48, top: 16 }), ex).failures.length > 0, '例外的 stories 沒對到的 story 不得套用')
  expect(judgeTriggerMiss({ id: 's', density: 'md', trigger: '篩選 3' }, ex).instrument.length === 0, '登記過的觸發點沒開 dialog 應不算儀器失效')
  expect(judgeTriggerMiss({ id: 's', density: 'md', trigger: '排序' }, ex).instrument.some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '沒登記的觸發點沒開 dialog 應判儀器失效')
  expect(judgeStale(ex, new Set(['st', 'log48', 'pd'])).some((s) => s.includes('tg') && s.includes('過期')), '對不到的登記應紅「過期」')
  expect(judgeStale(ex, new Set(['st', 'log48', 'pd', 'tg'])).length === 0, '每一筆都對到應綠')
  // 只准變少
  expect(judgeLedgerGrowth(ex, [{ label: 'base', data: null }]).length === 0, '分岔點沒有例外檔(第一次登記)應不限')
  const baseEx = { ...EMPTY_EX, structural: ex.structural }
  expect(judgeLedgerGrowth(ex, [{ label: 'base', data: baseEx }]).filter((s) => s.includes('只准變少')).length === 3, '分岔點之後新增 3 筆、都沒有 userQuote 應紅 3 筆')
  const quoted = { ...ex, exceptions: [{ ...ex.exceptions[0], userQuote: '對話區底部維持 48 就好', quoteDate: '2026-11-17' }] }
  expect(judgeLedgerGrowth(quoted, [{ label: 'base', data: baseEx }]).every((s) => !s.includes('log48')), '新例外帶 userQuote 應不紅')
  // 整筆比(審查 MF4 / K9):同一個 key 放寬 stories 或 container、trigger 改 "*"、換種類 → 紅;一字不改 / stories 縮成子集 / 刪掉 → 不紅
  const L = (cur) => judgeLedgerGrowth(cur, [{ label: 'base', data: ex }])
  const widened = { ...ex, structural: [{ ...ex.structural[0], stories: [...ex.structural[0].stories, 'design-system-components-dialog-展示--large-with-table'], container: '[data-layout-body]' }] }
  expect(L(widened).some((s) => s.includes('改寫 structural st') && s.includes('stories') && s.includes('container')), `K9:同一個 key 放寬 stories + container 應紅「改寫」,實得 ${JSON.stringify(L(widened))}`)
  expect(L({ ...ex, triggers: [{ ...ex.triggers[0], trigger: '*' }] }).some((s) => s.includes('改寫 triggers tg')), '觸發點登記改成 "*" 應紅「改寫」')
  expect(L({ ...ex, structural: [], exceptions: [...ex.exceptions, { ...ex.structural[0], want: 'loose' }] }).some((s) => s.includes('改寫 exceptions st') && s.includes('種類')), '同一個 key 從 structural 換到 exceptions 應紅「改寫」')
  expect(L(ex).length === 0, '一字不改應不紅')
  const twoStories = { ...ex, structural: [{ ...ex.structural[0], stories: ['s*', 't'] }] }
  expect(judgeLedgerGrowth({ ...twoStories, structural: [{ ...twoStories.structural[0], stories: ['t'] }] }, [{ label: 'base', data: twoStories }]).length === 0, 'stories 縮成原本的子集(其他不變)應不紅')
  expect(L({ ...ex, triggers: [] }).length === 0, '刪掉一筆應不紅')
  const oldQuoted = { ...ex, structural: [{ ...ex.structural[0], userQuote: '置中那一格不用管', quoteDate: '2026-11-17' }] }
  const wideOldQuote = { ...oldQuoted, structural: [{ ...oldQuoted.structural[0], container: '[data-layout-body]' }] }
  expect(judgeLedgerGrowth(wideOldQuote, [{ label: 'base', data: oldQuoted }]).some((s) => s.includes('改寫')), '放寬時沿用舊的 userQuote 應紅(要新的原話)')
  expect(judgeLedgerGrowth({ ...wideOldQuote, structural: [{ ...wideOldQuote.structural[0], userQuote: '容器那一格也放寬', quoteDate: '2026-11-18' }] }, [{ label: 'base', data: oldQuoted }]).length === 0, '放寬時帶新的 userQuote 應不紅')
  // 分片:兩片不重疊、合起來 = 全部、與輸入順序無關;不合法的 --shard 判出來;跨片的登記不歸任何一片「自己判」
  const ids = ['c', 'a', 'e', 'b', 'd']
  const s0 = shardIds(ids, { i: 0, n: 2 }), s1 = shardIds(ids, { i: 1, n: 2 })
  expect(s0.length + s1.length === ids.length && new Set([...s0, ...s1]).size === ids.length && s0.every((x) => !s1.includes(x)), `兩片應不重疊且合起來 = 全部,實得 ${JSON.stringify([s0, s1])}`)
  expect(JSON.stringify(shardIds([...ids].reverse(), { i: 0, n: 2 })) === JSON.stringify(s0), '分片應與輸入順序無關(穩定排序)')
  expect(['2/2', '1/0', 'x', '0-2'].every((x) => parseShard(x).error) && parseShard('1/2').n === 2 && parseShard(null).n === 1, '不合法的 --shard 應判出來、合法的讀得進來')
  const shEx = { ...EMPTY_EX, structural: [{ key: 'one', stories: ['a'] }, { key: 'span', stories: ['a', 'b'] }, { key: 'none', stories: ['zz'] }] }
  const own0 = staleOwner(shEx, ids, new Set(s0), { i: 0, n: 2 }), own1 = staleOwner(shEx, ids, new Set(s1), { i: 1, n: 2 })
  expect(own0.own.has('one') && !own1.own.has('one') && !own0.own.has('span') && !own1.own.has('span') && own0.own.has('none') && !own1.own.has('none'), `過期歸屬:整筆在這一片 → 這一片判;跨片 → 都不自己判;對不到 story → 第 0 片判;實得 ${JSON.stringify([[...own0.own], [...own1.own]])}`)
  // 每一個有檔的基準都要過:分岔點沒有、HEAD 有(先 commit 再跑)→ 仍紅
  expect(judgeLedgerGrowth(ex, [{ label: '分岔點', data: baseEx }, { label: 'HEAD', data: ex }]).filter((s) => s.includes('只准變少')).length === 3, '分岔點沒有、只有 HEAD 有的新 key 應照樣紅(不能先 commit 繞過)')
  expect(parseExceptions(JSON.stringify({ ...quoted, exceptions: [{ ...quoted.exceptions[0], quoteDate: '昨天' }] })).error?.includes('quoteDate'), 'userQuote 的日期格式不對應判例外檔不合法')
  expect(parseExceptions(JSON.stringify(ex)).data, `合法的例外檔應讀得進來,實得 ${parseExceptions(JSON.stringify(ex)).error}`)
  // 儀器失效
  expect(inst(row({ err: '容器不見了' })).length === 1, 'err 應判儀器失效')
  expect(inst(row({ bottom: NaN })).length === 1, '底沒量到應判儀器失效')
  expect(inst(row({ bottomToken: NaN })).length === 1, 'token 讀不到應判儀器失效')
  expect(inst(row({ scrolled: 30 })).some((s) => s.includes('沒有捲在最上面')) && red(row({ scrolled: 30 })).length === 0, '沒捲在最上面應只判儀器失效、不指控產品')
  expect(inst(row({ ...BOX.hug, grow: NaN, modal: false })).length === 1, '容器種類量不到(跟隨量不到)應判儀器失效')
  expect(judgeDensity([row({ rootLoose: 16 }), row({ density: 'lg', rootLoose: 16 })]).length === 1, '兩密度頁面根同 loose 應判儀器失效')
  const allEmpty = judgeAll({ rows: [], regions: [], triggerMisses: [], ex: EMPTY_EX, bases: [], full: true })
  expect(allEmpty.instrument.some((s) => s.includes('一個容器都沒量到')) && allEmpty.instrument.some((s) => s.includes('點開那一步')), '完整跑 0 個容器 / 0 個點開才量到的容器應判儀器失效')
  return problems
}

/**
 * --selftest (a) 續:開不起來重開一次(measureWithRetry —— runScan 每一則都經它)。不開瀏覽器:attempt 依序丟出 / 回傳寫好的結果,
 * 再把結果照 runScan 的接法交給 judgeAll,看整趟的裁決。錯誤頁那一格用 24408a62 第 0 片的原句。
 */
async function selftestRetry() {
  const problems = []
  const expect = (cond, msg) => { if (!cond) problems.push(msg) }
  const label = 'design-system-components-agentpanel-展示--decision-card-errors @lg'
  const errorPage = () => new StoryRenderInstrumentError({ storyId: label, kind: 'storybook-error', reason: 'Storybook 顯示錯誤頁(story 不存在、模組載入失敗或渲染拋錯)', storybookError: 'expect(element).toBeVisible() | Received element is not visible:' })
  const good = { rows: [row({ id: label.split(' ')[0], density: 'lg', ...T.lg, ...BOX.hug, top: 16, bottom: 16, lastF: F.element })], regions: [], triggerMisses: [] }
  const run = async (script) => {
    let calls = 0, relaunches = 0
    const res = await measureWithRetry(label, async () => { const step = script[calls++]; if (step instanceof Error) throw step; return step }, async () => { relaunches++ })
    // 照 runScan 的接法:失敗 → instrument;成功 → rows 交給 judgeAll
    const verdict = judgeAll({ rows: res.got?.rows ?? [], regions: [], triggerMisses: [], ex: EMPTY_EX, bases: [], full: false })
    verdict.instrument.unshift(...(res.instrument ? [res.instrument] : []))
    return { res, calls, relaunches, verdict }
  }
  const once = await run([errorPage(), good])
  expect(once.calls === 2 && once.relaunches === 1 && !once.res.instrument && once.res.retried && once.verdict.instrument.length === 0 && once.verdict.failures.length === 0 && once.verdict.counts.measured === 1,
    `第一次錯誤頁、第二次開得起來應綠(重開 1 次、量到 1 格);實得 呼叫 ${once.calls} 次、重開 ${once.relaunches} 次、${JSON.stringify(once.verdict.instrument)} / ${JSON.stringify(once.verdict.failures)}`)
  const twice = await run([errorPage(), errorPage(), good])
  expect(twice.calls === 2 && twice.verdict.instrument.length === 1 && twice.verdict.instrument[0].includes(INSTRUMENT_FAIL_MARKER) && twice.verdict.instrument[0].includes(label) && twice.verdict.instrument[0].includes('toBeVisible'),
    `兩次都錯誤頁應判 INSTRUMENT-FAIL、點名 story 與錯誤原文、只試 2 次;實得 呼叫 ${twice.calls} 次、${JSON.stringify(twice.verdict.instrument)}`)
  const crash = await run([new Error('page.goto: Target page, context or browser has been closed'), good])
  expect(crash.calls === 2 && crash.verdict.instrument.length === 0, `瀏覽器掛掉一次、重開後量到應綠(原本就有的那一種重試);實得 呼叫 ${crash.calls} 次、${JSON.stringify(crash.verdict.instrument)}`)
  const cap = await run([new StoryRenderInstrumentError({ storyId: label, kind: 'click-cap', reason: '一般按鈕 + 選單觸發點 200 個' }), good])
  expect(cap.calls === 1 && cap.verdict.instrument.some((s) => s.includes('200 個')), `數量上限(重開也一樣)應不重試、直接儀器失效;實得 呼叫 ${cap.calls} 次、${JSON.stringify(cap.verdict.instrument)}`)
  const bug = await run([new TypeError('x is not a function'), good])
  expect(bug.calls === 1 && bug.verdict.instrument.length === 1, `量具自己的程式錯(不是開頁失敗)應不重試、直接儀器失效;實得 呼叫 ${bug.calls} 次`)
  return problems
}

/** --selftest (b):真建置。回 problems(空 = 通過)。 */
async function selftestBrowser(browser, server, ex) {
  const problems = []
  const out = (s) => console.log(s)
  const exSel = exceptionSelectors(ex)
  const page = await browser.newPage({ viewport: VIEWPORT })
  const isControl = (r) => r.via !== 'initial' && (r.trigger ?? '').includes(CONTROL_TRIGGER) && r.declared === 'fill' && /data-data-table-outer/.test(r.lastDesc ?? '')
  const findControl = (got) => got.rows.filter(isControl)
  try {
    for (const density of DENSITIES) {
      const want = T[density].loose
      // 現況:點開才看得到、角色 bounded(邊緣標記)、底 = loose、綠
      const now = await measureStory(page, server.origin, server.notFound, CONTROL_STORY, density, { exSel })
      const c = findControl(now)
      const verdict = c.flatMap((r) => [...judgeRow(r, ex).failures, ...judgeRow(r, ex).instrument])
      if (c.length !== 1 || c[0].regionMark !== 'bounded' || Math.abs(c[0].bottom - want) > TOL || verdict.length) problems.push(`現況 @${density}:應量到 1 個點開才看得到的容器、標記 bounded、底 ${want}、綠;實得 ${c.length} 個 ${JSON.stringify(c.map((r) => ({ bottom: r.bottom, mark: r.regionMark })))} ${JSON.stringify(verdict)}`)
      else out(`  ✓ 現況 @${density}:「${CONTROL_TRIGGER}」點開 → DialogBody(fill)最後是表格(邊緣標記 bounded),底 ${c[0].bottom} = loose ${want}`)
      // δ:不點觸發點 → 那個容器不在結果裡(點開這一步是必要的)
      const noTrig = await measureStory(page, server.origin, server.notFound, CONTROL_STORY, density, { exSel, triggers: false })
      if (noTrig.rows.some((r) => /data-data-table-outer/.test(r.lastDesc ?? ''))) problems.push(`δ @${density}:不點觸發點也量到了表格容器 —— 前提變了(範例不再需要點開),點開這一步的必要性要重證`)
      else out(`  ✓ δ @${density}:不點觸發點 → 量到 ${noTrig.rows.length} 個容器,沒有那個對話框(A18 那則只有點開才量得到 —— 清單制的閘就是在這裡看不見)`)
      // γ:拿掉表格外框的邊緣標記 → 容器自判不到 → 底 48、紅、點名缺標記
      const gamma = await measureStory(page, server.origin, server.notFound, CONTROL_STORY, density, {
        exSel, beforeMeasure: (p) => p.evaluate(() => { for (const el of document.querySelectorAll('[data-data-table-outer]')) el.removeAttribute('data-layout-region') }),
      })
      const g = gamma.rows.filter((r) => r.via !== 'initial' && r.declared === 'fill' && /data-data-table-outer/.test(r.lastDesc ?? ''))
      const gRed = g.flatMap((r) => judgeRow(r, ex).failures)
      if (!(g.length === 1 && g[0].bottom === T[density].bottomToken && gRed.some((s) => s.includes('缺標記') && s.includes(`應 ${want}`)))) problems.push(`γ @${density}:拿掉表格的 data-layout-region 應紅(底 48、應 ${want}、點名缺標記);實得 ${JSON.stringify(g.map((r) => r.bottom))} ${JSON.stringify(gRed)}`)
      else out(`  ✓ γ @${density}:拿掉表格外框的 data-layout-region → 底 ${g[0].bottom}、紅「應 ${want}…缺標記」`)
      // β:容器不再自判(底一律 bottom)→ 同一格紅
      const beta = await measureStory(page, server.origin, server.notFound, CONTROL_STORY, density, {
        exSel, beforeMeasure: (p) => p.addStyleTag({ content: '[data-layout-body]{--layout-body-end:var(--layout-space-bottom)!important}' }),
      })
      const b = findControl(beta)
      const bRed = b.flatMap((r) => judgeRow(r, ex).failures)
      if (!(b.length === 1 && b[0].bottom === T[density].bottomToken && bRed.some((s) => s.includes(`應 ${want}`)))) problems.push(`β @${density}:容器不再自判應紅(底 48、應 ${want});實得 ${JSON.stringify(b.map((r) => r.bottom))} ${JSON.stringify(bRed)}`)
      else out(`  ✓ β @${density}:注入「容器不再自判」→ 對話框底 ${b[0].bottom}、紅「應 ${want}」`)
      const betaHug = await measureStory(page, server.origin, server.notFound, HUG_STORY, density, {
        exSel, triggers: false, beforeMeasure: (p) => p.addStyleTag({ content: '[data-layout-body]{--layout-body-end:var(--layout-space-bottom)!important}' }),
      })
      const hRed = betaHug.rows.filter((r) => r.declared === 'hug').flatMap((r) => judgeRow(r, ex).failures)
      if (!hRed.some((s) => s.includes('與頂部同值'))) problems.push(`β @${density}:SurfaceBody 三段(hug)容器不再自判應紅「與頂部同值」;實得 ${JSON.stringify(hRed)}`)
      else out(`  ✓ β @${density}:SurfaceBody 三段(hug)同一個破法 → 紅「與頂部同值」`)
    }
    // ε:一般按鈕 / 選單項目打開的對話框(審查 MF1)—— 點了量得到;不點(triggers:false)量不到
    for (const [story, want] of CLICK_STORIES) {
      const got = await measureStory(page, server.origin, server.notFound, story, 'md', { exSel })
      const seen = want.filter((w) => got.rows.some((r) => r.via !== 'initial' && !/^trigger#/.test(r.via) && r.trigger === w && r.declared === 'fill'))
      const none = await measureStory(page, server.origin, server.notFound, story, 'md', { exSel, triggers: false })
      const leaked = none.rows.filter((r) => r.declared === 'fill')
      if (seen.length !== want.length || leaked.length) problems.push(`ε ${story}:應點開量到 ${JSON.stringify(want)}、不點量不到;實得點開 ${JSON.stringify(seen)}、不點 ${leaked.length} 個`)
      else out(`  ✓ ε ${story}:點「${want.join('」「')}」打開的對話框量到;不點 → 量不到(只點 aria-haspopup="dialog" 的版本就是這樣漏掉)`)
    }
    // ζ(A103):觸發點正中央是欄位裡的 Tag 移除鈕 —— 按自己的表面打得開;對照組按正中央 → 點了不開(修前的量法)
    {
      const own = await measureStory(page, server.origin, server.notFound, OWN_SURFACE_STORY, 'lg', { exSel, explore: false })
      const center = await measureStory(page, server.origin, server.notFound, OWN_SURFACE_STORY, 'lg', { exSel, explore: false, clickAt: 'center' })
      // 同一則、同一密度,只差按的位置:正中央至少一個打不開(對照組會紅)、自己的表面全打得開(Combobox 的選單沒有 body 容器,量到 0 列是正常的,看的是有沒有打開)
      const miss = (got) => got.triggerMisses.filter((m) => (m.trigger ?? '').includes(OWN_SURFACE_TRIGGER))
      if (miss(own).length || !miss(center).length) problems.push(`ζ @lg:按自己的表面應每個「${OWN_SURFACE_TRIGGER}」都打得開、按正中央至少一個打不開;實得 自己的表面 ${miss(own).length} 個打不開、正中央 ${miss(center).length} 個打不開`)
      else out(`  ✓ ζ @lg:「${OWN_SURFACE_TRIGGER}」按自己的表面全打得開;按正中央 ${miss(center).length} 個打不開(正中央是 Tag 的移除鈕)`)
    }
    // η(A104):絕對定位的進度條算最後一個內容 —— 上傳管理面板(精簡列)底 = 與頂部同值;對照組把進度條藏起來 → 量到說明字、紅
    for (const density of DENSITIES) {
      const pick = (got) => got.rows.filter((r) => /data-slot=surface-body/.test(r.containerDesc ?? ''))
      const now = pick(await measureStory(page, server.origin, server.notFound, PROGRESS_STORY, density, { exSel, triggers: false }))
      const nowRed = now.flatMap((r) => [...judgeRow(r, ex).failures, ...judgeRow(r, ex).instrument])
      const hidden = pick(await measureStory(page, server.origin, server.notFound, PROGRESS_STORY, density, {
        exSel, triggers: false, beforeMeasure: (p) => p.addStyleTag({ content: '[data-slot="surface-body"] [role=progressbar]{display:none!important}' }),
      }))
      const hRed = hidden.flatMap((r) => judgeRow(r, ex).failures)
      const want = T[density].tight
      if (!(now.length === 1 && /progressbar/.test(now[0].lastDesc ?? '') && Math.abs(now[0].bottom - want) <= TOL && !nowRed.length && hidden.length === 1 && hidden[0].bottom > want + TOL && hRed.some((s) => s.includes('與頂部同值')))) {
        problems.push(`η @${density}:上傳管理面板(精簡列)應量到進度條、底 ${want}、綠;藏起進度條應紅「與頂部同值」;實得 ${JSON.stringify(now.map((r) => ({ bottom: r.bottom, last: r.lastDesc })))} ${JSON.stringify(nowRed)} / 藏起 ${JSON.stringify(hidden.map((r) => r.bottom))} ${JSON.stringify(hRed)}`)
      } else out(`  ✓ η @${density}:上傳管理面板(精簡列)最後是絕對定位的進度條 → 底 ${now[0].bottom} = 頂;藏起進度條 → 量到說明字、底 ${hidden[0].bottom}、紅「與頂部同值」`)
    }
    // 標記造假:Sidebar 群組改標 bounded、表格外框改標 unbounded → 標記檢查紅
    const fake = await measureStory(page, server.origin, server.notFound, SIDEBAR_STORY, 'md', {
      exSel, triggers: false, beforeMeasure: (p) => p.evaluate(() => {
        document.querySelector('[data-sidebar="group"][data-layout-region]')?.setAttribute('data-layout-region', 'bounded')
        document.querySelector('[data-data-table-outer][data-layout-region]')?.setAttribute('data-layout-region', 'unbounded')
      }),
    })
    const fRed = judgeRegions(fake.regions)
    if (!(fRed.some((s) => s.includes('標 bounded') && s.includes('量不到完整外框')) && fRed.some((s) => s.includes('標 unbounded') && s.includes('它有框')))) problems.push(`標記造假應各紅一種;實得 ${JSON.stringify(fRed)}`)
    else out('  ✓ 標記造假:Sidebar 群組改標 bounded → 紅「量不到完整外框」;表格外框改標 unbounded → 紅「它有框」')
    const real = await measureStory(page, server.origin, server.notFound, SIDEBAR_STORY, 'md', { exSel, triggers: false })
    const rRed = judgeRegions(real.regions)
    if (rRed.length || !real.regions.some((r) => r.mark === 'unbounded') || !real.regions.some((r) => r.mark === 'bounded')) problems.push(`Sidebar 混合內容的標記現況應綠且兩種都有;實得 ${JSON.stringify(rRed)} / ${real.regions.length} 處`)
    else out(`  ✓ Sidebar 混合內容標記現況:${real.regions.length} 處(bounded / unbounded 都有)全部實`)
  } finally { await page.close().catch(() => {}) }
  return problems
}

// ═══════════════════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════════════════

if (isDirectRun(import.meta.url)) {
  const loaded = loadExceptions()
  if (loaded.error) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${loaded.error}`); process.exit(2) }
  const ex = loaded.data
  const SHARD = parseShard(SHARD_ARG)
  if (SHARD.error) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${SHARD.error}`); process.exit(2) }
  // --selftest 只在第 1 片做(兩片都做 = 同一組對照組跑兩次;CI 兩格都帶 --shard)
  if (SELFTEST && SHARD.i !== 0) { console.log(`· ${GATE_NAME} selftest:分片 ${SHARD.i}/${SHARD.n} 不跑(只在第 0 片做)`); process.exit(0) }
  if (SELFTEST) {
    const tableProblems = [...selftestTable(), ...await selftestRetry()]
    if (tableProblems.length) { console.log(`✗ ${GATE_NAME} selftest (a) 判定表:\n  ${tableProblems.join('\n  ')}`); process.exit(1) }
    console.log(`✓ ${GATE_NAME} selftest (a) 判定表通過(角色 × 容器種類兩面、標記實不實、宣告種類、例外 / pending / 觸發點 / 過期 / 只准變少、儀器失效、開不起來重開一次)`)
  } else if (STATIC_ARG) requireStorybookBuild(path.join(STATIC, 'index.json'))
  else requireFreshStorybookBuild(STATIC, FRESH_SOURCES)
  if (SELFTEST) requireStorybookBuild(path.join(STATIC, 'index.json'))
  const t0 = Date.now()
  let server = null, browser = null, exitCode = 1
  try {
    server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
    browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
    if (SELFTEST) {
      const problems = await selftestBrowser(browser, server, ex)
      if (problems.length) { console.log(`✗ ${GATE_NAME} selftest (b) 真建置:\n  ${problems.join('\n  ')}\n  —— 量具沒有在該紅的地方紅(或紅到不該紅的地方),綠燈不能當證據`); exitCode = 1 }
      else { console.log(`✓ ${GATE_NAME} selftest 通過(${Math.round((Date.now() - t0) / 1000)} 秒)`); exitCode = 0 }
    } else {
      // 只准變少要讀 git(與 main 的分岔點);--limit / --only 的部分跑(meta-test 在拋棄式快照裡用 --limit)不判過期、不判例外增長,也就不讀 git
      // 分片(--shard):每片照常判(量測、標記、0 個容器 = 儀器失效);例外帳「只准變少」只在第 0 片判(同一份帳兩片都判 = 重複);
      // 過期只判這一片看得到全貌的登記(staleOwner)
      const full = !LIMIT && !ONLY
      const ledger = full && SHARD.i === 0
      const based = ledger ? readBases() : { bases: [] }
      if (!full) console.log('  · 部分跑(--limit / --only):不判例外過期與只准變少')
      else if (!ledger) console.log(`  · 分片 ${SHARD.i}/${SHARD.n}:例外帳「只准變少」只在第 0 片判`)
      if (based.error) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${based.error}`); exitCode = 2 }
      else {
        const scan = await runScan(browser, server, exceptionSelectors(ex), SHARD, ex)
        if (scan.fatal) { console.log(`✗ ${scan.fatal}`); exitCode = 2 }
        else {
          let staleKeys = null
          if (full && SHARD.n > 1) {
            const owner = staleOwner(ex, scan.allIds, new Set(scan.ids), SHARD)
            staleKeys = new Set([...owner.own, ...scan.staleChecked])
            const skipped = owner.spanning.filter((k) => !staleKeys.has(k))
            const star = (k) => ['structural', 'exceptions', 'pending', 'triggers'].some((kind) => ex[kind].some((x) => x.key === k && x.stories.includes('*')))
            if (skipped.length) console.log(`  · 跨片的登記 ${skipped.length} 筆這一片不判過期(不分片的完整跑一定判):${skipped.map((k) => `${k}${star(k) ? '(stories 是 *,分片時都不判)' : '(第 0 片補量判)'}`).join(' / ')}`)
          }
          const result = judgeAll({ rows: scan.rows, regions: scan.regions, triggerMisses: scan.triggerMisses, ex, bases: based.bases, full, staleKeys, extraMatched: [...(scan.staleExtra ?? [])] })
          result.instrument.unshift(...scan.instrument)
          if (DUMP) writeFileSync(path.resolve(DUMP), `${JSON.stringify({ gate: GATE_NAME, rows: scan.rows.map(({ lastF, regionF, ...r }) => ({ ...r, role: r.regionMark ?? (lastF ? classifyFirst(lastF) : null), box: r.err || r.wrapper || r.empty ? null : classifyBox(r) })), regions: scan.regions, triggerMisses: scan.triggerMisses }, null, 1)}\n`)
          printResult(result)
          const seconds = Math.round((Date.now() - t0) / 1000)
          if (result.instrument.length) { console.log(`✗ ${GATE_NAME}:儀器失效 —— 這次沒有量完(exit 2;不是產品裁決,也不算通過;${seconds} 秒)`); exitCode = 2 }
          else if (result.failures.length) { console.log(`\n✗ ${GATE_NAME}:${scan.total} 則 story 裡有容器的底距不照規則 4(逐筆見上;${seconds} 秒)`); exitCode = 1 }
          else { console.log(`\n✅ ${GATE_NAME}:${scan.total} 則 story${!full ? '(部分)' : SHARD.n > 1 ? `(第 ${SHARD.i}/${SHARD.n} 片)` : ''},每個容器的「最後一個東西 → 容器底」照規則 4、邊緣標記與 DOM 一致、例外沒有過期也沒有新增(${seconds} 秒)`); exitCode = 0 }
        }
      }
    }
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError) && !String(error?.message ?? '').includes(INSTRUMENT_FAIL_MARKER)) throw error
    console.error(`✗ ${instrumentLine(GATE_NAME, error)}`)
    exitCode = 2
  } finally {
    await browser?.close().catch(() => {})
    await server?.stop().catch(() => {})
  }
  process.exit(exitCode)
}
