#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: LinkInput 各模式與表格連結格的連結只有網址文字那麼寬;表格連結格點網址文字開連結、點其他地方照其他可編輯格的點格規則;試算表 Enter / F2 進到格裡的控件、F2 / Esc 回格導覽;一般模式編輯結束焦點回打開編輯的那個東西;每種格的編輯器名字 = 欄標題(而且欄標題不是型別註記);鉛筆是 16px 無框行內按鈕;不合法網址存進去顯示成一般文字;
 *        2026-10-21 起(r1b DT-01 / DT-02 / DT-03 / NEW-1 / DT-07):連結(表格兩種模式、LinkInput 唯讀 / 檢視)與可拖的欄頭,鍵盤焦點框四邊真的畫出來(截圖比對,L8);
 *        試算表格裡的控件被鍵盤聚焦時只有一個指示(控件的框,格游標框收起)、在格裡按 Tab 格游標跟著焦點走(L9);就地編輯範例的連結欄各列顯示不同的網址(L1)
 *   紅: --selftest 注入連結改回 block、攔下格的點擊、攔下根節點 Enter / F2、把焦點丟回 body、一般模式可編輯格拿掉 Tab 停靠 + 攔下格上的 Enter / F2(L4 鍵盤)、拿掉名字、鉛筆改 24px 有框、塞 javascript: 連結、
 *       連結外面包回會裁切的 wrapper + 欄頭框改回往外(L8)、格游標框強制畫出 + 擋下格內控件的 focusin(L9),各組必紅;7777b61c 的建置跑必紅(L1–L7);
 *       a6390356 的建置跑 L8 / L9 / L5 型別註記 / L1 網址各列不同必紅
 *   綠: 修好的建置全綠;挑不到點擊區、走不到目標格、沒選到字、聚焦了卻沒有 :focus-visible 等量不到的情況以儀器失效紅,不當成通過
 * ─────
 * 網址欄的點擊範圍 / 表格連結格互動 / 格內鍵盤 / 編輯結束焦點 / 編輯器名字(2026-10-13,待辦總帳 Q3a–Q3f)。
 *
 * user 2026-10-13 原話「照你建議做到完美並自行驗證到完美」,回覆 AI 同日的建議乙
 * (原文:「**乙:** 跟其他可編輯格一樣進入編輯,只有點網址文字才開連結;這和你 9/26 給 LinkInput 定的規則是同一句話。」)。
 * 規則住:`LinkInput/link-input.spec.md`「Link 狀態」(連結的可點範圍 = 網址文字本身,所有模式)、
 * `DataTable/data-table.spec.md`「Navigate-valued cell 通用類別」與鍵盤段、`ds-canonical/references/keyboard-model-canonical.md`。
 *
 *   L1 連結的可點範圍 ≤ 畫出來的網址文字寬 + 1px —— LinkInput 每個模式(編輯模式的連結狀態 / view / readonly)與
 *      三則表格(就地編輯、專案排程「規格」欄、試算表)的每一個連結格(Q3a;修前 block 盒子撐滿外層)
 *   L2 表格連結格 4 個點擊區 × 兩種模式的結果(Q3f):
 *        一般模式  網址文字 → 開連結、不進編輯;文字右邊空白 / 內距 / 鉛筆 → 進編輯、不開連結
 *        試算表    網址文字 → 開連結 + 格游標移過來、不進編輯;空白 / 內距 → 第一下只選格、第二下進編輯;鉛筆 → 一下進編輯
 *      另:滑過空白處出淺框(07-08 A 案的可編輯提示);按在空白處拖過網址文字再放開(選字)不進編輯、不開連結
 *   L3 試算表格游標停在連結格 / 開關格:Enter、F2 焦點進到格裡的控件(連結 / 勾選框),Tab 到鉛筆,F2 / Esc 回格導覽、
 *      之後方向鍵從原格走(Q3c)
 *   L4 一般模式編輯結束後焦點回到打開編輯的那個東西:文字格 Enter / Esc → 那一格;選單格選值 → 那一格;連結格 Enter → 鉛筆;
 *      失焦結算(點頁面空白處)不把焦點搶回來(Q3d I)。
 *      2026-10-21 加(r1b NEW-2 複驗缺陷 4,data-table.spec.md「Keyboard 行為」一般模式 Enter / F2 那一條):一般模式可編輯的格本身是
 *      Tab 停靠點(`data-table.tsx` 的 `cellIsTabStop`;唯讀格不是 —— 對照列),焦點在格上 Enter / F2 進編輯,Esc 後焦點回到那一格
 *   L5 每一種格的編輯器都有名字 = 欄標題(Q3d J)
 *   L6 表格的鉛筆 = 行內小按鈕(16×16、無框),與 LinkInput 欄位那顆同一種(Q3b)
 *   L7 存進不合法的網址(`javascript:` / 少了 https://)後,格裡顯示一般文字、沒有任何 `href` 是 `javascript:`(Q3e)
 *   L8 焦點框四邊真的畫出來(2026-10-21,r1b DT-01 / DT-02):同一個元素截兩張圖 —— 有框、把框強制關掉 —— 逐邊比對框那一圈的像素,
 *      四邊各至少一半有變才算畫出來(M32:不信 computed style,修前 computed outline 一切正常、畫出來只剩右邊一條 2px)。
 *      量:一般模式 Tab 到連結、試算表 Enter 進連結、LinkInput 唯讀 / 檢視的連結、可拖欄頭(每一欄,含最後一欄);對照列:同一格的鉛筆
 *   L9 試算表格內控件只有一個指示、格游標跟著焦點走(2026-10-21,r1b DT-03 / NEW-1):開關格 / 連結格 Enter 之後格游標框收起、控件框四邊在;
 *      連結 → Tab 鉛筆 → Tab 下一個控件(下一列的勾選框)→ 格游標 = 焦點所在的那一格、框仍收起;Esc → 回格導覽,格游標框在那一格回來;
 *      對照列:滑鼠點勾選框(控件不畫框)→ 格游標框照留(仍只有一個)
 * 對照組:`--build=<7777b61c 的建置>` 跑,L1(唯讀 / 檢視 / 表格)、L2 改變的那幾區、滑過淺框、L3、L4、L5、L6、L7 必紅。
 * `--selftest`:不改產品,在頁面注入破法(連結改回 block / 攔下格的點擊 / 攔下 Enter·F2 / 把焦點丟回 body / 拿掉名字 /
 *   鉛筆改回 24px 有框 / 塞一個 javascript: 連結),各組斷言必須紅(儀器先證明它會紅,M32)。
 * 開 story 一律經 lib/launch-browser.mjs 的 openStory(開不起來 = 儀器失效,exit 2)。
 *   node scripts/data-table-link-cell-invariant.mjs [--build=<storybook 建置目錄>] [--selftest]
 */
import { dirname, isAbsolute, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { launchBrowserOrSkip, openStory, StoryRenderInstrumentError, requireStorybookBuild, requireFreshStorybookBuild, settleAfterInteraction, waitForFocusStable, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const { PNG } = createRequire(join(REPO, 'package.json'))('pngjs')
const SELFTEST = process.argv.includes('--selftest')
const buildArg = process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length)
const STATIC = buildArg ? (isAbsolute(buildArg) ? buildArg : join(process.cwd(), buildArg)) : join(REPO, 'storybook-static')
requireStorybookBuild(join(STATIC, 'index.json'))
if (!buildArg) requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/DataTable', 'packages/design-system/src/components/LinkInput'])

const DT = (id) => `iframe.html?id=${encodeURIComponent(`design-system-components-datatable-展示--${id}`)}&viewMode=story`
const LI = (id) => `iframe.html?id=${encodeURIComponent(`design-system-components-linkinput-展示--${id}`)}&viewMode=story`
const TABLES = {
  normal: { url: DT('inline-edit'), col: 'url', label: '一般模式(就地編輯)' },
  roadmap: { url: DT('roadmap-all-in-one'), col: 'spec', label: '一般模式(專案排程「規格」)' },
  sheet: { url: DT('inline-edit-with-spreadsheet-overlay'), col: 'url', label: '試算表模式' },
}

let failCount = 0
let instrumentFail = false
/**
 * `control: true` = 對照列:這一列量的是**沒有改變**的行為(點網址文字開連結、按鉛筆進編輯…),--selftest 的破法不碰它,
 * 兩種模式下都必須綠 —— 證明破法只打到要打的那一處,不是把整張表弄壞(弄壞全部也會「如預期紅」,那是假對照)。
 */
const check = (group, name, pass, detail = '', { control = false } = {}) => {
  const expectRed = SELFTEST && !control
  const ok = expectRed ? !pass : pass
  console.log(`${ok ? '✓' : '✗'} ${expectRed ? '[對照組應紅] ' : SELFTEST ? '[對照列應綠] ' : ''}${group} ${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) failCount++
}
const instrument = (name, detail) => {
  instrumentFail = true
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${name} | ${detail}`)
}

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html', snapshot: true })
const browser = await launchBrowserOrSkip({ ignoreDefaultArgs: ['--hide-scrollbars'] }, { cleanup: () => server.stop() })
const context = await browser.newContext({ viewport: { width: 2300, height: 900 }, deviceScaleFactor: 1 })
// 連結是 target=_blank:開出來的分頁不准真的連外(沙箱 / CI 沒網路也不能卡住)—— 非本機一律擋下,分頁照樣會開(那才是要量的)
await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort())
const page = await context.newPage()

/** --selftest 下這一頁要注入哪一種破法(每一段量測前設定;各段只打自己那一組) */
let currentBreak = null
const open = async (url, waitFor) => {
  try {
    await openStory(page, `${server.origin}/${url}`, { waitFor, settleFrames: 10, notFound: server.notFound })
    if (SELFTEST && currentBreak) await injectBreaks(currentBreak)
    return true
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    instrument(`開 story ${url}`, error.message)
    return false
  }
}
const settle = async () => (await settleAfterInteraction(page, { frames: 8, capMs: 6000 })).ok
const focusSettle = async () => (await waitForFocusStable(page, { frames: 6, capMs: 4000 })).ok

// ── --selftest 的破法(每一種只打一組斷言;其餘照常量 —— 對照列必須仍綠)───────────────────────────
const LINK_COLS = '[data-column-id="url"], [data-column-id="spec"]'
async function injectBreaks(kind) {
  // 連結撐滿外層(= 修前的 block):L1 的可點範圍、L2 的「文字右邊空白」
  if (kind === 'L1' || kind === 'L2') await page.addStyleTag({ content: 'a[href]{display:block!important;width:100%!important}' })
  // 滑過不出框:L2 的淺框兩列
  if (kind === 'L2') await page.addStyleTag({ content: '*{outline-style:none!important}' })
  if (kind === 'L6') await page.addStyleTag({ content: '[data-dt-cell-edit-entry] button, [data-cell-id] button[aria-label="編輯連結"]{width:24px!important;height:24px!important;border:1px solid red!important}' })
  // L8:連結外面包回會裁切的 wrapper(= a6390356 的 `truncate` 外殼)、可拖欄頭的框改回往外(= 修前)
  if (kind === 'L8') await page.addStyleTag({ content: 'span:has(> a[href]){overflow:hidden!important} [role="columnheader"][aria-roledescription]:focus-visible{outline-offset:var(--stack-gap,2px)!important}' })
  // L9:格游標框強制畫出(= 修前兩個指示)
  if (kind === 'L9') await page.addStyleTag({ content: '[data-selected-cell-id]{visibility:visible!important}' })
  await page.evaluate(([kind, linkCols]) => {
    if (kind === 'L2') {
      // 連結格上「不是連結、不是按鈕」的點擊攔下(= 修前的「url 排除點格」):內距那一區不進編輯、試算表第一下也不選格
      document.addEventListener('click', (e) => {
        const t = e.target
        if (t instanceof Element && t.closest(linkCols) && !t.closest('a[href], button')) e.stopPropagation()
      }, true)
    }
    if (kind === 'L2drag') {
      // 選字的保護拿掉:點擊送到格之前先把選取清掉 → 元件看不到「正在選字」,會進編輯
      document.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest(linkCols)) window.getSelection()?.removeAllRanges() }, true)
    }
    if (kind === 'L3') {
      // 攔下表格根節點上的 Enter / F2(格游標那一層)
      document.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === 'F2') && e.target instanceof Element && e.target.matches('[data-data-table-outer]')) e.stopPropagation()
      }, true)
    }
    if (kind === 'L4k') {
      // 一般模式可編輯的格拿掉 Tab 停靠、格上的 Enter / F2 攔下(= 2026-07-14 dim-10 修之前:鍵盤進不了一般模式的編輯)
      const unstop = () => { for (const c of document.querySelectorAll('[data-cell-id][tabindex="0"]')) c.setAttribute('tabindex', '-1') }
      unstop()
      new MutationObserver(unstop).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['tabindex'] })
      document.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === 'F2') && e.target instanceof Element && e.target.matches('[data-cell-id]')) e.stopPropagation()
      }, true)
    }
    if (kind === 'L5') {
      // 拿掉格內編輯器的名字
      const strip = () => {
        for (const el of document.querySelectorAll('[data-cell-id] [aria-label], [data-active-editor-host] [aria-label]')) {
          if (!el.closest('[data-dt-cell-edit-entry]') && el.getAttribute('aria-label') !== '') el.setAttribute('aria-label', '')
        }
      }
      new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label'] })
    }
    if (kind === 'L9') {
      // 擋下格內控件「鍵盤來的」focusin(= 修前格游標不跟著焦點走):document 的捕獲階段先停掉,React 根節點收不到。
      // 只擋 :focus-visible 的那幾下 —— 滑鼠點勾選框那一下照常送到,對照列(滑鼠點)不受這個破法影響
      document.addEventListener('focusin', (e) => {
        const t = e.target
        if (t instanceof Element && !t.matches('[data-data-table-outer]') && t.closest('[data-cell-id]') && t.matches(':focus-visible')) e.stopPropagation()
      }, true)
    }
    if (kind === 'L7') {
      // 每一格連結格塞一個 javascript: 連結
      for (const c of document.querySelectorAll('[data-column-id="url"]')) {
        const a = document.createElement('a'); a.setAttribute('href', 'javascript:void 0'); a.textContent = '·'; c.appendChild(a)
      }
    }
  }, [kind, LINK_COLS])
}

// ── 頁面端量測 ─────────────────────────────────────────────────────────────────────────────
/** 第 r 列、欄 colId 的格 id */
const cellIdAt = (r, colId) => page.evaluate(([r, colId]) => {
  // 有釘選欄時同一列在左 / 中 / 右三個面板各一份 DOM 列 —— 直接找「那一列裡那一欄的格」,不先挑某一份列
  const cell = document.querySelector(`[role="row"][data-row-index="${r}"] [data-column-id="${CSS.escape(colId)}"][data-cell-id]`)
  return cell?.getAttribute('data-cell-id') ?? null
}, [r, colId])

/** 連結格的幾何:格、連結盒、畫出來的文字、鉛筆 */
const linkCellGeo = (cellId) => page.evaluate((cellId) => {
  const cell = document.querySelector(`[data-cell-id="${CSS.escape(cellId)}"]`)
  if (!cell) return null
  cell.scrollIntoView({ block: 'nearest', inline: 'center' })
  const rect = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom } }
  const a = cell.querySelector('a[href]')
  // 「畫出來的網址文字」= 文字節點的字形範圍(連結裡的 TruncatedText 是 display:block 的 span —— 選整個連結內容會量到盒子寬,不是字寬)
  let text = null
  if (a) {
    const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT)
    let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue
      const range = document.createRange(); range.selectNodeContents(n)
      const b = range.getBoundingClientRect()
      l = Math.min(l, b.left); t = Math.min(t, b.top); rr = Math.max(rr, b.right); bb = Math.max(bb, b.bottom)
    }
    if (Number.isFinite(l)) text = { x: l, y: t, w: rr - l, h: bb - t, r: rr, b: bb }
  }
  const pencil = cell.querySelector('[data-dt-cell-edit-entry] button') ?? cell.querySelector('button[aria-label="編輯連結"]')
  return { cell: rect(cell), anchor: a ? rect(a) : null, text, pencil: pencil ? rect(pencil) : null, href: a?.getAttribute('href') ?? null }
}, cellId)

const editorCount = () => page.evaluate(() => {
  const root = document.querySelector('[data-data-table-outer]')
  return (root?.querySelectorAll('[data-field-mode="edit"]').length ?? 0) + document.querySelectorAll('[data-active-editor-host] input, [data-active-editor-host] [data-field-mode="edit"]').length
})
const cursorOf = () => page.evaluate(() => document.querySelector('[data-selected-cell-id]')?.getAttribute('data-selected-cell-id') ?? null)
/** 點一下,回報「開了幾個分頁」(target=_blank)與之後的狀態 */
async function clickAt(x, y) {
  const pagesBefore = context.pages().length
  const popup = context.waitForEvent('page', { timeout: 1200 }).catch(() => null)
  await page.mouse.click(x, y)
  const opened = await popup
  if (opened) await opened.close().catch(() => {})
  await settle()
  return { link: opened ? 1 : 0, pagesBefore }
}

// ── L1:連結的可點範圍 = 文字寬 ───────────────────────────────────────────────────────────────
function anchorReport() {
  const out = []
  for (const a of document.querySelectorAll('a[href]')) {
    const b = a.getBoundingClientRect()
    if (b.width === 0 || b.height === 0) continue
    // 文字節點的字形範圍(見 linkCellGeo 的說明:TruncatedText 是 block span,選整個連結內容量到的是盒子寬)
    const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT)
    let l = Infinity, r = -Infinity
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue
      const range = document.createRange(); range.selectNodeContents(n)
      const g = range.getBoundingClientRect(); l = Math.min(l, g.left); r = Math.max(r, g.right)
    }
    const t = { width: Number.isFinite(l) ? r - l : 0 }
    const where = a.closest('[data-cell-id]')?.getAttribute('data-cell-id') ?? a.closest('[data-field-mode]')?.getAttribute('data-field-mode') ?? 'bare-view'
    out.push({ where, href: a.getAttribute('href') ?? '', text: (a.textContent || '').trim().slice(0, 30), anchorW: +b.width.toFixed(2), textW: +t.width.toFixed(2) })
  }
  return out
}
for (const [label, url, waitFor] of [
  ['LinkInput 基本用法(編輯模式的連結狀態)', LI('default'), 'a[href]'],
  ['LinkInput 四模式(edit / view / readonly)', LI('modes'), 'a[href]'],
  ['LinkInput 檢視樣式', LI('view'), 'a[href]'],
  ['表格:' + TABLES.normal.label, TABLES.normal.url, '[data-column-id="url"] a[href]'],
  ['表格:' + TABLES.roadmap.label, TABLES.roadmap.url, '[data-column-id="spec"] a[href]'],
  ['表格:' + TABLES.sheet.label, TABLES.sheet.url, '[data-column-id="url"] a[href]'],
]) {
  currentBreak = 'L1'
  if (!(await open(url, waitFor))) continue
  const rows = (await page.evaluate(anchorReport)).filter((r) => /^https?:/i.test(r.href))
  if (rows.length === 0) { instrument(`L1 ${label}`, '找不到任何連結'); continue }
  const bad = rows.filter((r) => r.anchorW > r.textW + 1)
  check('L1', `${label}:${rows.length} 個連結,可點範圍 ≤ 畫出來的文字寬 + 1px`, bad.length === 0, bad.length ? JSON.stringify(bad.slice(0, 4)) : '')
  // 就地編輯範例:連結欄各列顯示的網址不同(2026-10-21 r1b DT-07:修前四列都顯示 shop.example.com —— 這一欄等於什麼都沒說)
  if (url === TABLES.normal.url) {
    const texts = rows.filter((r) => /:url$/.test(r.where)).map((r) => r.text)
    check('L1', `${label}:連結欄各列顯示的網址不同(真實資料,不是同一個主機名)`, texts.length >= 2 && new Set(texts).size === texts.length, JSON.stringify(texts), { control: true })
  }
}

// ── L2:四個點擊區 × 兩種模式 ─────────────────────────────────────────────────────────────────
/** 在 cellId 裡挑四個點;挑不到 = 儀器失效 */
function regionPoints(g) {
  if (!g?.text || !g.pencil) return null
  const midY = g.cell.y + g.cell.h / 2
  const blankLeft = g.text.r + 2, blankRight = g.pencil.x - 2
  if (blankRight - blankLeft < 6) return null
  if (g.text.x - g.cell.x < 8) return null
  return {
    text: { x: g.text.x + Math.min(g.text.w / 2, 18), y: g.text.y + g.text.h / 2 },
    blank: { x: (blankLeft + blankRight) / 2, y: midY },
    padding: { x: g.cell.x + 4, y: midY },
    pencil: { x: g.pencil.x + g.pencil.w / 2, y: g.pencil.y + g.pencil.h / 2 },
  }
}
async function prepTable(key) {
  const t = TABLES[key]
  if (!(await open(t.url, `[data-column-id="${t.col}"] a[href]`))) return null
  // 文字最短、空白最寬的那一列(看得到「文字右邊空白」)
  for (let r = 0; r < 6; r++) {
    const id = await cellIdAt(r, t.col)
    if (!id) continue
    const g = await linkCellGeo(id)
    const pts = regionPoints(g)
    if (pts) return { id, row: r, g, pts }
  }
  instrument(`L2 ${t.label}`, '前 6 列找不到「網址文字右邊有空白、左邊有內距、有鉛筆」的連結格')
  return null
}
const outlineAround = (cellId) => page.evaluate((cellId) => {
  const cell = document.querySelector(`[data-cell-id="${CSS.escape(cellId)}"]`)
  const cb = cell.getBoundingClientRect()
  const drawn = (el) => { const cs = getComputedStyle(el); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1 && cs.outlineColor !== 'rgba(0, 0, 0, 0)' && cs.outlineColor !== 'transparent' }
  if (drawn(cell)) return 'cell'
  for (const el of document.querySelectorAll('[aria-hidden] div')) {
    const b = el.getBoundingClientRect()
    if (Math.abs(b.x - cb.x) < 1.5 && Math.abs(b.y - cb.y) < 1.5 && Math.abs(b.width - cb.width) < 1.5 && Math.abs(b.height - cb.height) < 1.5 && drawn(el)) return 'overlay'
  }
  return null
}, cellId)

currentBreak = 'L2'
for (const key of ['normal', 'roadmap']) {
  const label = TABLES[key].label
  for (const region of ['text', 'blank', 'padding', 'pencil']) {
    const p = await prepTable(key)
    if (!p) break
    const pt = p.pts[region]
    if (region === 'pencil') { await page.mouse.move(p.pts.blank.x, p.pts.blank.y); await settle() }
    const r = await clickAt(pt.x, pt.y)
    const editors = await editorCount()
    const want = region === 'text' ? { link: 1, editor: 0 } : { link: 0, editor: 1 }
    check('L2', `${label} 點「${{ text: '網址文字', blank: '文字右邊空白', padding: '內距', pencil: '鉛筆' }[region]}」→ ${want.link ? '開連結、不進編輯' : '進編輯、不開連結'}`,
      r.link === want.link && (editors > 0 ? 1 : 0) === want.editor, `開分頁 ${r.link}、編輯器 ${editors}`,
      { control: region === 'text' || region === 'pencil' })
  }
  // 滑過空白處 → 可編輯格的淺框
  const p = await prepTable(key)
  if (p) {
    await page.mouse.move(p.pts.blank.x, p.pts.blank.y)
    await settle()
    const ring = await outlineAround(p.id)
    check('L2', `${label} 滑過連結格空白處 → 出淺框(跟其他可編輯格一樣)`, ring !== null, `框 = ${ring ?? '無'}`)
  }
  // 選字不算點一下(--selftest 換一種破法:拿掉選字保護;連結撐滿的那個破法會讓「在空白處按下」變成拖連結,量不到選字)
  if (key === 'normal') {
    currentBreak = 'L2drag'
    const q = await prepTable(key)
    currentBreak = 'L2'
    if (q) {
      // 放開那一刻(click 之前)選到幾個字 —— 儀器;click 之後的選取可能已被破法清掉,不能拿來當「有沒有在選字」
      await page.evaluate(() => { window.__selAtUp = -1; document.addEventListener('mouseup', () => { window.__selAtUp = String(window.getSelection() ?? '').length }, { capture: true, once: true }) })
      await page.mouse.move(q.pts.blank.x, q.pts.blank.y)
      await page.mouse.down()
      await page.mouse.move(q.g.text.x + 2, q.pts.text.y, { steps: 8 })
      const popup = context.waitForEvent('page', { timeout: 1000 }).catch(() => null)
      await page.mouse.up()
      const opened = await popup
      if (opened) await opened.close().catch(() => {})
      await settle()
      const selected = await page.evaluate(() => window.__selAtUp)
      const editors = await editorCount()
      // -1 = 頁面根本沒收到放開(例:7777b61c 上在連結盒裡按下 = 原生拖連結);0 = 沒選到字 —— 都是量不到,不是通過
      if (!(selected > 0)) instrument(`L2 ${label} 選字`, `拖過網址文字之後沒有選到任何字(放開時選取 ${selected};量不到「選字不算點一下」)`)
      else check('L2', `${label} 按在空白處拖過網址文字再放開(選字)→ 不進編輯、不開連結`, editors === 0 && !opened, `選到 ${selected} 字、編輯器 ${editors}、開分頁 ${opened ? 1 : 0}`)
    }
  }
}

// 試算表模式
{
  const label = TABLES.sheet.label
  for (const region of ['text', 'blank', 'padding', 'pencil']) {
    const p = await prepTable('sheet')
    if (!p) break
    // 起點:格游標先放在同列 Product 格,目標格「本來不是選取格」
    const startId = await cellIdAt(p.row, 'name')
    const sg = await page.evaluate((id) => { const b = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }, startId)
    await page.mouse.click(sg.x, sg.y); await settle()
    if ((await cursorOf()) !== startId) { instrument(`L2 ${label}`, `起點格游標沒到 ${startId}`); continue }
    const pt = p.pts[region]
    const first = await clickAt(pt.x, pt.y)
    const e1 = await editorCount()
    const c1 = await cursorOf()
    const rname = { text: '網址文字', blank: '文字右邊空白', padding: '內距', pencil: '鉛筆' }[region]
    if (region === 'text') {
      check('L2', `${label} 點「${rname}」→ 開連結、格游標移過來、不進編輯`, first.link === 1 && e1 === 0 && c1 === p.id, `開分頁 ${first.link}、編輯器 ${e1}、游標 ${c1}`, { control: true })
    } else if (region === 'pencil') {
      check('L2', `${label} 點「${rname}」→ 一下進編輯、不開連結`, first.link === 0 && e1 > 0, `開分頁 ${first.link}、編輯器 ${e1}`, { control: true })
    } else {
      check('L2', `${label} 第一下點「${rname}」→ 只選格(不開連結、不進編輯)`, first.link === 0 && e1 === 0 && c1 === p.id, `開分頁 ${first.link}、編輯器 ${e1}、游標 ${c1}`)
      const second = await clickAt(pt.x, pt.y)
      const e2 = await editorCount()
      check('L2', `${label} 第二下點「${rname}」→ 進編輯(跟其他可編輯格一樣)、不開連結`, second.link === 0 && e2 > 0, `開分頁 ${second.link}、編輯器 ${e2}`)
    }
  }
  // 已選的連結格,點網址文字:開連結、不進編輯
  const p = await prepTable('sheet')
  if (p) {
    await clickAt(p.pts.blank.x, p.pts.blank.y)
    const r = await clickAt(p.pts.text.x, p.pts.text.y)
    const e = await editorCount()
    check('L2', `${label} 格已選取時點「網址文字」→ 開連結、不進編輯`, r.link === 1 && e === 0, `開分頁 ${r.link}、編輯器 ${e}`, { control: true })
    // 選取中的格畫的是格游標框;換一列沒選取的連結格量滑過
    const other = await cellIdAt(p.row + 1, 'url')
    const og = other ? await linkCellGeo(other) : null
    if (og) {
      await page.mouse.move(og.cell.x + og.cell.w - 6, og.cell.y + og.cell.h / 2)
      await settle()
      const ring2 = await outlineAround(other)
      check('L2', `${label} 滑過(沒選取的)連結格 → 出淺框(試算表浮層的滑過框)`, ring2 !== null, `框 = ${ring2 ?? '無'}`)
    } else instrument(`L2 ${label} 滑過`, `找不到第 ${p.row + 1} 列的連結格`)
  }
}

// ── L3:試算表格內鍵盤 ────────────────────────────────────────────────────────────────────────
{
  const label = '試算表模式'
  currentBreak = 'L3'
  if (await open(TABLES.sheet.url, '[data-column-id="url"] a[href]')) {
    const desc = () => page.evaluate(() => {
      const a = document.activeElement
      const cell = a?.closest?.('[data-cell-id]')
      return { tag: a?.tagName?.toLowerCase() ?? null, role: a?.getAttribute?.('role') ?? null, aria: a?.getAttribute?.('aria-label') ?? null, href: a?.getAttribute?.('href') ?? null,
        cell: cell?.getAttribute('data-cell-id') ?? null, root: a?.matches?.('[data-data-table-outer]') ?? false, checked: document.activeElement?.getAttribute?.('aria-checked') ?? null }
    })
    const startId = await cellIdAt(0, 'name')
    const urlId = await cellIdAt(0, 'url')
    const boolId = await cellIdAt(1, 'inStock')
    const urlBelow = await cellIdAt(1, 'url')
    const sg = await page.evaluate((id) => { const b = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`).getBoundingClientRect(); return { x: b.x + 10, y: b.y + b.height / 2 } }, startId)
    await page.mouse.click(sg.x, sg.y); await settle()
    for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await settle() }
    const atUrl = await cursorOf()
    if (atUrl !== urlId) instrument(`L3 ${label}`, `方向鍵走不到連結格(停在 ${atUrl},應 ${urlId})`)
    else {
      await page.keyboard.press('Enter'); await focusSettle()
      const d1 = await desc()
      check('L3', `${label} 格游標在連結格按 Enter → 焦點進到格裡的連結(不進編輯)`, d1.tag === 'a' && d1.cell === urlId && (await editorCount()) === 0, JSON.stringify(d1))
      await page.keyboard.press('Tab'); await focusSettle()
      const d2 = await desc()
      check('L3', `${label} 再按 Tab → 同一格的鉛筆`, d2.tag === 'button' && d2.cell === urlId && d2.aria === '編輯連結', JSON.stringify(d2))
      await page.keyboard.press('F2'); await focusSettle(); await settle()
      const d3 = await desc()
      check('L3', `${label} 再按 F2 → 回到格導覽(焦點在表格根節點、格游標停在連結格)`, d3.root && (await cursorOf()) === urlId, `${JSON.stringify(d3)} 游標 ${await cursorOf()}`)
      await page.keyboard.press('F2'); await focusSettle()
      const d4 = await desc()
      check('L3', `${label} 格游標在連結格按 F2 → 焦點進到格裡的連結`, d4.tag === 'a' && d4.cell === urlId, JSON.stringify(d4))
      await page.keyboard.press('Escape'); await focusSettle(); await settle()
      const d5 = await desc()
      check('L3', `${label} 在連結上按 Esc → 回到格導覽(格游標不清掉)`, d5.root && (await cursorOf()) === urlId, `${JSON.stringify(d5)} 游標 ${await cursorOf()}`)
      await page.keyboard.press('ArrowDown'); await settle()
      check('L3', `${label} 回到格導覽後 ↓ 從原格往下走`, (await cursorOf()) === urlBelow, `游標 ${await cursorOf()}(應 ${urlBelow})`)
      // 開關格那一段自己重新起手(點第 1 列 Product → → → 到 In),不吃上一段留下的狀態
      const sg2 = await page.evaluate((id) => { const b = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`).getBoundingClientRect(); return { x: b.x + 10, y: b.y + b.height / 2 } }, await cellIdAt(1, 'name'))
      await page.mouse.click(sg2.x, sg2.y); await settle()
      for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await settle() }
      if ((await cursorOf()) !== boolId) instrument(`L3 ${label}`, `方向鍵走不到開關格(停在 ${await cursorOf()},應 ${boolId})`)
      else {
        await page.keyboard.press('Enter'); await focusSettle()
        const b1 = await desc()
        check('L3', `${label} 格游標在開關格按 Enter → 焦點進到勾選框`, b1.role === 'checkbox' && b1.cell === boolId, JSON.stringify(b1))
        const before = b1.checked
        await page.keyboard.press(' '); await settle()
        const b2 = await desc()
        check('L3', `${label} 焦點在勾選框上按 Space → 勾選框自己切換(值改了、焦點還在)`, b2.role === 'checkbox' && b2.checked !== before, `${before} → ${b2.checked}`)
        await page.keyboard.press('Escape'); await focusSettle(); await settle()
        const b3 = await desc()
        check('L3', `${label} 在勾選框上按 Esc → 回到格導覽、格游標停在開關格`, b3.root && (await cursorOf()) === boolId, `${JSON.stringify(b3)} 游標 ${await cursorOf()}`)
      }
    }
  }
}

// ── L4:一般模式編輯結束後的焦點 ─────────────────────────────────────────────────────────────
{
  const label = '一般模式'
  const focusInfo = () => page.evaluate(() => {
    const a = document.activeElement
    return { body: !a || a === document.body, cell: a?.getAttribute?.('data-cell-id') ?? null, inCell: a?.closest?.('[data-cell-id]')?.getAttribute('data-cell-id') ?? null, aria: a?.getAttribute?.('aria-label') ?? null, tag: a?.tagName?.toLowerCase() ?? null }
  })
  const clickCell = async (id, dx = 0.5) => {
    const b = await page.evaluate((id) => { const el = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`); el.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }, id)
    await page.mouse.click(b.x + b.w * dx, b.y + b.h / 2); await settle()
  }
  // --selftest 的破法:結算之後把焦點丟回 body(= 修前);只打 L4 前四列,失焦那一列是對照列
  const finish = async () => { await focusSettle(); await settle(); if (SELFTEST) await page.evaluate(() => document.activeElement?.blur?.()) }
  currentBreak = null
  for (const [what, key, colId, how] of [
    ['文字格 Enter 存檔', 'Enter', 'name', 'type'],
    ['文字格 Esc 取消', 'Escape', 'qty', 'type'],
    ['選單格選值', 'Enter', 'category', 'menu'],
  ]) {
    if (!(await open(TABLES.normal.url, '[data-column-id="url"] a[href]'))) break
    const id = await cellIdAt(0, colId)
    await clickCell(id)
    if ((await editorCount()) === 0) { instrument(`L4 ${label} ${what}`, `點 ${id} 沒有進編輯`); continue }
    if (how === 'type') { await page.keyboard.type('9'); await page.keyboard.press(key) } else { await page.keyboard.press('ArrowDown'); await page.keyboard.press(key) }
    await finish()
    const f = await focusInfo()
    check('L4', `${label} ${what} → 焦點回到那一格(不掉到 body)`, f.cell === id, JSON.stringify(f))
  }
  // 連結格:點空白處進編輯 → Enter → 鉛筆
  if (await open(TABLES.normal.url, '[data-column-id="url"] a[href]')) {
    const id = await cellIdAt(0, 'url')
    const g = await linkCellGeo(id)
    const pts = regionPoints(g)
    if (!pts) instrument(`L4 ${label} 連結格`, '挑不到連結格的點擊區')
    else {
      await clickAt(pts.pencil.x, pts.pencil.y)
      if ((await editorCount()) === 0) instrument(`L4 ${label} 連結格`, '按鉛筆沒有進編輯')
      else {
        await page.keyboard.press('Enter'); await finish()
        const f = await focusInfo()
        check('L4', `${label} 連結格 Enter 存檔 → 焦點回到那一格的鉛筆(同 LinkInput)`, f.inCell === id && f.tag === 'button' && f.aria === '編輯連結', JSON.stringify(f))
      }
    }
  }
  // 失焦結算:點頁面空白處 → 不搶回焦點
  if (await open(TABLES.normal.url, '[data-column-id="url"] a[href]')) {
    const id = await cellIdAt(0, 'name')
    await clickCell(id)
    await page.keyboard.type('x')
    const bg = await page.evaluate(() => { const r = document.querySelector('[data-data-table-outer]').getBoundingClientRect(); return { x: Math.min(window.innerWidth - 4, r.right + 20), y: Math.min(window.innerHeight - 4, r.bottom + 20) } })
    await page.mouse.click(bg.x, bg.y)
    await focusSettle(); await settle()
    const f = await focusInfo()
    const committed = await page.evaluate((id) => (document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`)?.textContent ?? '').includes('x'), id)
    if (!committed) instrument(`L4 ${label} 失焦結算`, '點空白處後沒有結算(量不到「不搶焦點」)')
    else check('L4', `${label} 點頁面空白處失焦結算 → 焦點不被搶回那一格`, f.cell !== id && f.inCell !== id, JSON.stringify(f), { control: true })
  }
}

// ── L4 鍵盤:一般模式可編輯格是 Tab 停靠點、Enter / F2 進編輯(2026-10-21,r1b NEW-2 複驗缺陷 4)───────────────
// 規格:data-table.spec.md「Keyboard 行為」Enter / F2(一般模式)那一條;實作 data-table.tsx 的 `cellIsTabStop` 與它的 onKeyDown。
// 這條行為 2026-07-14 起就有(修前建置也綠),所以「會紅」由 --selftest 證明:拿掉停靠 + 攔下格上的 Enter / F2 → 前三列必紅,唯讀格那一列是對照列
{
  const label = '一般模式'
  currentBreak = 'L4k'
  if (await open(TABLES.normal.url, '[data-column-id="url"] a[href]')) {
    const nameId = await cellIdAt(0, 'name')
    const qtyId = await cellIdAt(0, 'qty')
    const skuId = await cellIdAt(0, 'sku')
    const active = () => page.evaluate(() => {
      const a = document.activeElement
      return { body: !a || a === document.body, cell: a?.getAttribute?.('data-cell-id') ?? null, inCell: a?.closest?.('[data-cell-id]')?.getAttribute('data-cell-id') ?? null, inHost: !!a?.closest?.('[data-active-editor-host]'), tag: a?.tagName?.toLowerCase() ?? null }
    })
    /** 鍵盤模式下把焦點放到某一格(程式化 focus 前先按一下 Shift,:focus-visible 才成立;tabindex -1 的格也聚焦得到,所以破法不會讓這一步失效) */
    const focusCell = async (id) => {
      await page.keyboard.press('Shift')
      const ok = await page.evaluate((id) => { const el = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`); if (!el || !el.hasAttribute('tabindex')) return false; el.scrollIntoView({ block: 'nearest', inline: 'center' }); el.focus(); return document.activeElement === el }, id)
      await focusSettle(); await settle()
      return ok
    }
    if (!nameId || !qtyId || !skuId) instrument(`L4 ${label} 鍵盤`, `找不到 Product / Qty / SKU 格(${nameId} / ${qtyId} / ${skuId})`)
    else if (!(await focusCell(nameId))) instrument(`L4 ${label} 鍵盤`, `${nameId} 聚焦不到(沒有 tabindex)`)
    else {
      await page.keyboard.press('Tab'); await focusSettle(); await settle()
      const t = await active()
      check('L4', `${label} 可編輯格是 Tab 停靠點:Product → Tab → Qty 那一格本身`, t.cell === qtyId, JSON.stringify(t))
      const skuStop = await page.evaluate((id) => document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`)?.getAttribute('tabindex'), skuId)
      check('L4', `${label} 唯讀格(SKU)不是停靠點`, skuStop == null, `tabindex=${skuStop}`, { control: true })
      for (const key of ['Enter', 'F2']) {
        if (!(await focusCell(qtyId))) { instrument(`L4 ${label} 鍵盤 ${key}`, `${qtyId} 聚焦不到`); continue }
        await page.keyboard.press(key); await settle()
        const opened = await editorCount()
        const e = await active()
        check('L4', `${label} 焦點在可編輯格上按 ${key} → 進編輯(焦點在那一格的編輯器裡)`, opened === 1 && !e.body && e.cell !== qtyId && (e.inCell === qtyId || e.inHost), `編輯器 ${opened} 個 / ${JSON.stringify(e)}`)
        if (opened > 0) {
          await page.keyboard.press('Escape'); await focusSettle(); await settle()
          const f = await active()
          check('L4', `${label} ${key} 進的編輯按 Esc 取消 → 焦點回到那一格`, f.cell === qtyId, JSON.stringify(f))
        }
      }
    }
  }
}

// ── L5:每一種格的編輯器都有名字 = 欄標題 ─────────────────────────────────────────────────────
{
  const nameOf = (id) => page.evaluate((id) => {
    const cell = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`)
    const host = document.querySelector('[data-active-editor-host]')
    const scope = cell?.querySelector('[data-field-mode="edit"], input, textarea, [role="checkbox"]') ? cell : host
    const ctl = scope?.querySelector('input:not([type="hidden"]), textarea, [role="combobox"], [role="spinbutton"], [role="checkbox"], [aria-haspopup]')
    if (!ctl) return { found: false }
    const by = ctl.getAttribute('aria-labelledby')
    const name = ctl.getAttribute('aria-label') || (by ? by.split(/\s+/).map((x) => document.getElementById(x)?.textContent?.trim() ?? '').join(' ').trim() : '')
    return { found: true, name, tag: ctl.tagName.toLowerCase(), role: ctl.getAttribute('role') }
  }, id)
  // 欄標題 = 業務名稱(2026-10-21 r1b DT-07:修前寫成「Product (string)」,讀屏把型別一起念出來;型別說明移到 story 的 docs 描述)
  const COLS = [
    ['name', 'Product'], ['qty', 'Qty'], ['category', 'Category'], ['stock', 'Stock'],
    ['tags', 'Tags'], ['owner', 'Owner'], ['reviewers', 'Reviewers'], ['inStock', 'Available'],
    ['url', 'Supplier'], ['price', 'Price'], ['releaseDate', 'Release'], ['reminderTime', 'Reminder'],
  ]
  currentBreak = 'L5'
  if (await open(TABLES.normal.url, '[data-column-id="url"] a[href]')) {
    const results = []
    for (const [colId, header] of COLS) {
      const id = await cellIdAt(0, colId)
      if (!id) { results.push({ colId, problem: '找不到格' }); continue }
      if (colId !== 'inStock') {
        const g = await page.evaluate((id) => { const el = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`); el.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }, id)
        // 連結格經鉛筆進編輯(名字跟點擊區無關;點擊區由 L2 量);其他格點中間
        if (colId === 'url') {
          await page.mouse.move(g.x + g.w / 2, g.y + g.h / 2); await settle()
          const pb = await page.evaluate((id) => { const b = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`).querySelector('[data-dt-cell-edit-entry] button, button[aria-label="編輯連結"]')?.getBoundingClientRect(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null }, id)
          if (pb) await page.mouse.click(pb.x, pb.y)
        } else await page.mouse.click(g.x + g.w / 2, g.y + g.h / 2)
        await settle()
        if ((await editorCount()) === 0) { results.push({ colId, problem: '點格沒有進編輯' }); continue }
      }
      const n = await nameOf(id)
      results.push({ colId, header, ...n })
      if (colId !== 'inStock') {
        await page.keyboard.press('Escape'); await settle()
        if ((await editorCount()) > 0) { await page.keyboard.press('Escape'); await settle() }
      }
    }
    const instrumentRows = results.filter((r) => r.problem || !r.found)
    if (instrumentRows.length) instrument('L5 編輯器名字', JSON.stringify(instrumentRows))
    const bad = results.filter((r) => r.found && r.name !== r.header)
    check('L5', `就地編輯 ${results.length} 種格的編輯器名字 = 欄標題`, bad.length === 0, bad.length ? JSON.stringify(bad.map((r) => ({ col: r.colId, name: r.name, want: r.header }))) : '')
    const typed = results.filter((r) => r.found && /\((?:string|number|boolean|currency|select|multiSelect|person|multiPerson|date|time|url)\)/.test(r.name))
    check('L5', '編輯器名字(= 欄標題)不帶型別註記', typed.length === 0, typed.length ? JSON.stringify(typed.map((r) => r.name)) : '', { control: true })
  }
}

// ── L6:鉛筆 = 行內小按鈕 ─────────────────────────────────────────────────────────────────────
{
  currentBreak = 'L6'
  if (await open(TABLES.normal.url, '[data-column-id="url"] a[href]')) {
    const id = await cellIdAt(0, 'url')
    const g = await linkCellGeo(id)
    await page.mouse.move(g.cell.x + g.cell.w / 2, g.cell.y + g.cell.h / 2); await settle()
    const look = await page.evaluate((id) => {
      const cell = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`)
      const btn = cell.querySelector('[data-dt-cell-edit-entry] button') ?? cell.querySelector('button[aria-label="編輯連結"]')
      if (!btn) return null
      const cs = getComputedStyle(btn); const b = btn.getBoundingClientRect()
      const op = parseFloat(getComputedStyle(btn.parentElement).opacity) * parseFloat(cs.opacity)
      return { w: b.width, h: b.height, border: parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth), bg: cs.backgroundColor, opacity: op }
    }, id)
    if (!look) instrument('L6', '找不到表格連結格的鉛筆')
    else check('L6', '表格連結格的鉛筆 = 行內小按鈕(md 16×16、無框、透明底,滑過格時看得到)', look.w === 16 && look.h === 16 && look.border === 0 && /rgba\(0, 0, 0, 0\)|transparent/.test(look.bg) && look.opacity > 0.99, JSON.stringify(look))
  }
}

// ── L7:不合法的網址存進去 → 一般文字、沒有 javascript: 的 href ─────────────────────────────────
{
  currentBreak = 'L7'
  for (const [row, value] of [[1, 'javascript:alert(1)'], [2, 'www.example.com/pricing']]) {
    if (!(await open(TABLES.normal.url, '[data-column-id="url"] a[href]'))) break
    const id = await cellIdAt(row, 'url')
    const g = await linkCellGeo(id)
    const pts = regionPoints(g)
    if (!pts) { instrument(`L7 ${value}`, '挑不到鉛筆'); continue }
    await clickAt(pts.pencil.x, pts.pencil.y)
    if ((await editorCount()) === 0) { instrument(`L7 ${value}`, '按鉛筆沒有進編輯'); continue }
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type(value)
    await page.keyboard.press('Enter'); await settle()
    const r = await page.evaluate(([id, value]) => {
      const cell = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`)
      return { shown: (cell?.textContent ?? '').includes(value), anchors: [...(cell?.querySelectorAll('a[href]') ?? [])].filter((a) => a.textContent !== '·').length,
        jsHrefs: [...document.querySelectorAll('a[href]')].filter((a) => /^\s*javascript:/i.test(a.getAttribute('href') ?? '')).length }
    }, [id, value])
    if (!r.shown && r.anchors === 0) instrument(`L7 ${value}`, `存檔後格裡既沒有連結、也沒有顯示這串字(${JSON.stringify(r)})`)
    else check('L7', `存進「${value}」→ 格裡是一般文字(顯示這串字、沒有連結),整頁沒有 javascript: 的 href`, r.shown && r.anchors === 0 && r.jsHrefs === 0, JSON.stringify(r))
  }
}

// ── L8:焦點框四邊真的畫出來(截圖比對)───────────────────────────────────────────────────────────
/** 同一個元素截兩張圖(有框 / 把框強制關掉),逐邊量框那一圈有多少像素變了;四邊各 ≥ 50% 才算畫出來 */
async function paintedRing(handle) {
  const g = await handle.evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect()
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: parseFloat(cs.outlineWidth) || 0, off: parseFloat(cs.outlineOffset) || 0, style: cs.outlineStyle, fv: el.matches(':focus-visible'), tag: el.tagName.toLowerCase() }
  })
  if (!g.fv) return { instrument: `${g.tag} 沒有 :focus-visible(量不到鍵盤焦點框)` }
  if (g.style === 'none' || g.w === 0) return { sides: 0, painted: {}, outline: 'none' }
  await settle()
  const out = g.off + g.w
  const ring = { l: g.l - out, t: g.t - out, r: g.r + out, b: g.b + out }
  const vp = page.viewportSize()
  const clip = { x: Math.max(0, Math.floor(ring.l - 4)), y: Math.max(0, Math.floor(ring.t - 4)) }
  clip.width = Math.min(vp.width, Math.ceil(ring.r + 4)) - clip.x; clip.height = Math.min(vp.height, Math.ceil(ring.b + 4)) - clip.y
  const a = PNG.sync.read(await page.screenshot({ clip }))
  await handle.evaluate((el) => { el.dataset.l8Prev = el.style.getPropertyValue('outline'); el.style.setProperty('outline', 'none', 'important') })
  const b = PNG.sync.read(await page.screenshot({ clip }))
  await handle.evaluate((el) => { el.style.removeProperty('outline'); if (el.dataset.l8Prev) el.style.setProperty('outline', el.dataset.l8Prev); delete el.dataset.l8Prev })
  const W = a.width, H = a.height, w = Math.max(1, Math.round(g.w))
  const L = Math.round(ring.l - clip.x), R = Math.round(ring.r - clip.x), T = Math.round(ring.t - clip.y), B = Math.round(ring.b - clip.y)
  const changed = (x, y) => { const i = (y * W + x) * 4; return Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 60 }
  const strip = (x0, x1, y0, y1) => { let n = 0, c = 0; for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) { n++; if (changed(x, y)) c++ } return n ? c / n : 0 }
  const painted = { top: strip(L + w, R - w, T, T + w), bottom: strip(L + w, R - w, B - w, B), left: strip(L, L + w, T + w, B - w), right: strip(R - w, R, T + w, B - w) }
  const sides = Object.values(painted).filter((v) => v >= 0.5).length
  return { sides, painted: Object.fromEntries(Object.entries(painted).map(([k, v]) => [k, +v.toFixed(2)])), outline: `${g.style} ${g.w}px offset ${g.off}px` }
}
const activeHandle = () => page.evaluateHandle(() => document.activeElement)
/** 先送一個鍵盤事件再程式聚焦:瀏覽器把它當成鍵盤來的焦點(:focus-visible),跟使用者 Tab 過去一樣畫框 */
const keyboardFocus = async (selector) => {
  await page.keyboard.press('Shift')
  return page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; el.focus(); return document.activeElement === el }, selector)
}
async function ringCheck(group, label, { control = false } = {}) {
  const r = await paintedRing(await activeHandle())
  if (r.instrument) { instrument(`${group} ${label}`, r.instrument); return null }
  check(group, `${label}:焦點框四邊都畫出來`, r.sides === 4, `${r.sides}/4 ${JSON.stringify(r.painted)} ${r.outline}`, { control })
  return r
}
{
  currentBreak = 'L8'
  const focusDesc = () => page.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName?.toLowerCase(), cell: a?.closest?.('[data-cell-id]')?.getAttribute('data-cell-id') ?? null, aria: a?.getAttribute?.('aria-label') ?? null } })
  // (a) 一般模式:從同一列的勾選框 Tab 到連結
  if (await open(TABLES.normal.url, '[data-column-id="url"] a[href]')) {
    const boolId = await cellIdAt(1, 'inStock'); const urlId = await cellIdAt(1, 'url')
    await page.mouse.move(2, 2)
    if (!(await keyboardFocus(`[data-cell-id="${boolId}"] [role="checkbox"]`))) instrument('L8 一般模式', `聚焦不到 ${boolId} 的勾選框`)
    else {
      await page.keyboard.press('Tab'); await focusSettle()
      const d = await focusDesc()
      if (d.tag !== 'a' || d.cell !== urlId) instrument('L8 一般模式', `Tab 沒走到 ${urlId} 的連結(落在 ${JSON.stringify(d)})`)
      else {
        await ringCheck('L8', '一般模式 Tab 到表格連結格的連結')
        await page.keyboard.press('Tab'); await focusSettle()
        const p = await focusDesc()
        if (p.aria !== '編輯連結' || p.cell !== urlId) instrument('L8 一般模式', `再 Tab 沒走到同一格的鉛筆(落在 ${JSON.stringify(p)})`)
        else await ringCheck('L8', '一般模式同一格的鉛筆(對照列)', { control: true })
      }
    }
  }
  // (b) 試算表:點連結格空白處選格 → Enter 進到連結
  if (await open(TABLES.sheet.url, '[data-column-id="url"] a[href]')) {
    const p = await prepTable('sheet')
    if (p) {
      await clickAt(p.pts.blank.x, p.pts.blank.y); await page.mouse.move(2, 2)
      await page.keyboard.press('Enter'); await focusSettle()
      const d = await focusDesc()
      if (d.tag !== 'a' || d.cell !== p.id) instrument('L8 試算表', `Enter 之後焦點不在 ${p.id} 的連結(${JSON.stringify(d)})`)
      else await ringCheck('L8', '試算表 Enter 進到連結格的連結')
    }
  }
  // (c) LinkInput 唯讀 / 檢視的連結(展示「四模式」)
  if (await open(LI('modes'), 'a[href]')) {
    // 只量 story 畫出來的連結(Storybook 自己藏在頁面裡的說明連結寬 0,不算)
    const targets = await page.evaluate(() => [...document.querySelectorAll('#storybook-root a[href]')].filter((a) => a.getBoundingClientRect().width > 0).map((a, i) => {
      a.dataset.l8Target = String(i)
      const host = a.closest('[data-field-mode]')?.getAttribute('data-field-mode') ?? 'bare-view'
      return { i, host }
    }).filter((t) => t.host !== 'edit'))
    if (targets.length === 0) instrument('L8 LinkInput', '四模式裡找不到唯讀 / 檢視的連結')
    for (const t of targets) {
      await page.mouse.move(2, 2)
      if (!(await keyboardFocus(`a[data-l8-target="${t.i}"]`))) { instrument('L8 LinkInput', `聚焦不到第 ${t.i} 個連結`); continue }
      await focusSettle()
      await ringCheck('L8', `LinkInput「四模式」第 ${t.i + 1} 個連結(${t.host})`)
    }
  }
  // (d) 可拖的欄頭(展示「欄位拖曳重排」):每一欄都 Tab 過去
  if (await open(DT('column-reorder'), '[role="columnheader"]')) {
    await page.mouse.move(2, 2)
    await page.evaluate(() => document.body.focus())
    const seen = []
    for (let i = 0; i < 60 && seen.length < 12; i++) {
      await page.keyboard.press('Tab'); await focusSettle()
      const info = await page.evaluate(() => { const a = document.activeElement; return { role: a?.getAttribute?.('role'), rd: a?.getAttribute?.('aria-roledescription'), col: a?.getAttribute?.('data-column-id'), inTable: !!a?.closest?.('[data-data-table-outer]') } })
      if (!info.inTable && seen.length) break
      if (info.role === 'columnheader' && info.col && !seen.includes(info.col)) {
        seen.push(info.col)
        await ringCheck('L8', `可拖欄頭「${info.col}」`)
      }
    }
    if (seen.length < 2) instrument('L8 欄頭', `Tab 只走到 ${seen.length} 個可拖的欄頭`)
  }
}

// ── L9:試算表格內控件只有一個指示、格游標跟著焦點走 ────────────────────────────────────────────────
{
  currentBreak = 'L9'
  const frame = () => page.evaluate(() => {
    const f = document.querySelector('[data-selected-cell-id]')
    if (!f) return { id: null, visible: false }
    const cs = getComputedStyle(f); const r = f.getBoundingClientRect()
    return { id: f.getAttribute('data-selected-cell-id'), visible: cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && cs.outlineStyle !== 'none' }
  })
  const focusCell = () => page.evaluate(() => { const a = document.activeElement; return { cell: a?.closest?.('[data-cell-id]')?.getAttribute('data-cell-id') ?? null, root: a?.matches?.('[data-data-table-outer]') ?? false, role: a?.getAttribute?.('role'), tag: a?.tagName?.toLowerCase() } })
  const cellPoint = (id, side) => page.evaluate(([id, side]) => { const el = document.querySelector(`[data-cell-id="${CSS.escape(id)}"]`); el.scrollIntoView({ block: 'nearest', inline: 'center' }); const b = el.getBoundingClientRect(); return { x: side === 'right' ? b.right - 6 : b.left + b.width / 2, y: b.top + b.height / 2 } }, [id, side])
  if (await open(TABLES.sheet.url, '[data-column-id="url"] a[href]')) {
    // (a) 開關格:點格的右側空白選格 → Enter → 焦點在勾選框
    const boolId = await cellIdAt(1, 'inStock')
    const bp = await cellPoint(boolId, 'right')
    await page.mouse.click(bp.x, bp.y); await settle(); await page.mouse.move(2, 2)
    await page.keyboard.press('Enter'); await focusSettle(); await settle()
    const fa = await focusCell(); const fra = await frame()
    if (fa.role !== 'checkbox' || fa.cell !== boolId) instrument('L9 開關格', `Enter 之後焦點不在 ${boolId} 的勾選框(${JSON.stringify(fa)})`)
    else {
      const ring = await paintedRing(await activeHandle())
      if (ring.instrument) instrument('L9 開關格', ring.instrument)
      else check('L9', '開關格 Enter → 只有勾選框的框(格游標框收起)', !fra.visible && ring.sides === 4, `格游標框 ${JSON.stringify(fra)};勾選框 ${ring.sides}/4`)
    }
  }
  if (await open(TABLES.sheet.url, '[data-column-id="url"] a[href]')) {
    // (b)(c) 連結格:Enter → 連結;Tab → 鉛筆;Tab → 下一個控件(下一列);Esc → 回格導覽
    const p = await prepTable('sheet')
    if (p) {
      await clickAt(p.pts.blank.x, p.pts.blank.y); await page.mouse.move(2, 2)
      await page.keyboard.press('Enter'); await focusSettle(); await settle()
      const f1 = await focusCell(); const fr1 = await frame()
      if (f1.tag !== 'a' || f1.cell !== p.id) instrument('L9 連結格', `Enter 之後焦點不在 ${p.id} 的連結(${JSON.stringify(f1)})`)
      else {
        check('L9', '連結格 Enter → 只有連結的框(格游標框收起)', !fr1.visible, `格游標框 ${JSON.stringify(fr1)}`)
        await page.keyboard.press('Tab'); await focusSettle(); await settle()
        const f2 = await focusCell(); const fr2 = await frame()
        check('L9', '再 Tab 到同一格的鉛筆 → 格游標仍是這一格、框仍收起', f2.cell === p.id && fr2.id === p.id && !fr2.visible, `焦點 ${JSON.stringify(f2)} 格游標 ${JSON.stringify(fr2)}`)
        await page.keyboard.press('Tab'); await focusSettle(); await settle()
        const f3 = await focusCell(); const fr3 = await frame()
        if (!f3.cell || f3.cell === p.id) instrument('L9 連結格', `再 Tab 沒有走到別一格的控件(${JSON.stringify(f3)})`)
        else {
          check('L9', 'Tab 走到別一格的控件 → 格游標跟過去(= 焦點所在的格)、框仍收起', fr3.id === f3.cell && !fr3.visible, `焦點在 ${f3.cell};格游標 ${JSON.stringify(fr3)}`)
          await page.keyboard.press('Escape'); await focusSettle(); await settle()
          const f4 = await focusCell(); const fr4 = await frame()
          // 對照列:Esc 用的是焦點所在那一格(修前就是這樣,破法不碰它)
          check('L9', '在那個控件上按 Esc → 回格導覽,格游標框在焦點剛剛所在的那一格回來', f4.root && fr4.id === f3.cell && fr4.visible, `焦點 ${JSON.stringify(f4)} 格游標 ${JSON.stringify(fr4)}`, { control: true })
        }
      }
    }
  }
  if (await open(TABLES.sheet.url, '[data-column-id="url"] a[href]')) {
    // (d) 對照列:滑鼠點勾選框 —— 控件不畫框(:focus-visible 不成立),格游標框照留,仍只有一個
    const boolId = await cellIdAt(0, 'inStock')
    const cp = await page.evaluate((id) => { const c = document.querySelector(`[data-cell-id="${CSS.escape(id)}"] [role="checkbox"]`); c.scrollIntoView({ block: 'nearest', inline: 'center' }); const b = c.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }, boolId)
    await page.mouse.click(cp.x, cp.y); await settle(); await focusSettle()
    const fd = await focusCell(); const frd = await frame()
    const fv = await page.evaluate(() => document.activeElement?.matches?.(':focus-visible') ?? false)
    check('L9', '滑鼠點勾選框 → 控件不畫框、格游標框照留(仍只有一個指示)', fd.cell === boolId && !fv && frd.visible && frd.id === boolId, `焦點 ${JSON.stringify(fd)} focus-visible=${fv} 格游標 ${JSON.stringify(frd)}`, { control: true })
  }
}

await browser.close()
if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', '))
await server.stop()
if (instrumentFail) {
  console.error(`\n✗ data-table-link-cell:${INSTRUMENT_FAIL_MARKER} —— 有量測沒有真的量到${SELFTEST ? '(對照組沒有真的跑,不得讀成「如預期紅」)' : ''}`)
  process.exit(2)
}
console.log(failCount ? `\n✗ ${failCount} 項未通過` : `\n✓ ${SELFTEST ? '對照組:各組破法注入後 L1–L9 如預期變紅(儀器有效)' : '網址欄點擊範圍、表格連結格四區 × 兩模式、格內鍵盤、編輯結束焦點、編輯器名字、鉛筆、不合法網址顯示、焦點框四邊、格內只有一個指示,全通過'}`)
process.exit(failCount ? 1 : 0)
