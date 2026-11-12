#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable 表頭的多重排序(data-table.spec.md「Multi-sort header」列;user 2026-10-30 規格 + 2026-11-11 R16 定案)在真的瀏覽器裡成立 ——
 *        P 狀態轉移:真點擊 / Shift+點擊 / Enter / Shift+Enter / Space / Shift+Space 的每一步,表頭讀出來的排序(aria-sort + 畫出來的順位數字)
 *          = 判定表寫的那個(兩態:點已排序的欄只在升冪 ↔ 降冪之間切、點不回沒排序;已排序的欄一般點擊 = Shift+點擊 = 只翻這一欄,
 *          多重排序第 1 / 中間 / 最後一欄各點一次,其他欄與順位不動;沒排序的欄一般點擊取代全部、Shift 加到最後;數字欄第一下升冪);
 *        N 數字:只有一欄排序不顯示數字、≥2 欄每個被排序的欄都有、第 10 個以後「9+」、箭頭與數字同進同出;
 *        G 長相(md 專案排程 + 設計規格「元件檢閱器」sm / lg 兩種尺寸):數字在箭頭右側、間距 2px、字級 / 行高 / 字重 = 表頭字、顏色 = 箭頭
 *          (靜止與滑過都相等)、垂直置中、指示佔原本單一箭頭的位置(label 之後 8px;只有一欄排序時指示 = 一個箭頭寬)、指示高 = 表頭字行高、表頭高度不變;
 *        M ⌄ 選單:多重排序時也有「取消排序」、按了**只拿掉這一欄**、後面順位往前補(第 1 欄與中間欄各按一次);已排序的欄只列相反方向一項、
 *          按了只翻這一欄;沒排序的欄兩項都列、按了取代全部;只有一欄排序時按「取消排序」= 沒有排序(lib/sort-cycle.ts `nextSorting`,
 *          「升冪 / 降冪排序」出不出 `columnMenuShowsSortDirection`,user 2026-11-10 PR #172 留言);
 *        K 鍵盤:在排序區按 Tab 下一站就是這一欄的 ⌄(在 Tab 順序裡、聚焦時展開),Enter 打開選單、方向鍵選「取消排序」、Enter 執行 →
 *          只拿掉這一欄,選單關掉後焦點回到 ⌄;
 *        A 讀屏:順位走 aria-describedby(「排序順位 N」,9+ 時照實說)、數字 aria-hidden、播報區在表格根節點外、播報句子
 *          (「這一欄發生了什麼」+「結果」,表頭與選單每一種動作各驗);
 *          多重排序狀態(3 欄、11 欄 9+、lg 尺寸)跑 axe(wcag2a / wcag2aa,同 a11y 閘 `scripts/audit-a11y.mjs`),違規不比同一則 story 沒排序時多
 *          —— 全 DS 像素 / a11y 閘只拍 story 初始狀態,而沒有任何 story 一開始就多重排序,這個狀態只有本閘看得到;
 *        S 與排序面板雙向同步:表頭改 → 面板列序與方向相同;面板改方向 / 刪除 → 表頭跟著變;只從面板加排序時列把手不可拖;
 *        U 不受控的表格(內部 state)同一套行為。
 *   紅: --selftest 在頁面注入各組破法(丟掉 Shift 的點擊與按鍵 / 數字藏起來 / 間距改 4px / 數字換字級與顏色 / 數字搬到箭頭左邊 /
 *        指示往右推 / 數字撐高表頭 / 拿掉 aria-describedby 與 aria-hidden / 播報區清空 / 藏起「取消排序」/ 只在多重排序時藏起「取消排序」/
 *        選單補回「這一欄目前已經是的那個方向」/ ⌄ 拿出 Tab 順序(tabindex=-1)/
 *        「9+」改寫成數字 / 數字變成沒有名字的圖(axe role-img-alt);sm、lg 各再跑一種長相破法),各組必紅,對照列必綠;
 *        **規則本身的對照組 = 修前的建置**(`--build=<那份建置>`):R16 之前(5db512f2,三態 + 一般點擊清掉其他欄 + 選單「取消排序」清掉全部)
 *        的建置跑本閘,P / M / K / A / U 的規則列必紅(2026-11-11 實測數字寫在 commit,不抄進這裡);判定另由判定表
 *        `scripts/test-data-table-sort-cycle.mjs --selftest` 以同一份修前行為當對照組。
 *        更早:108a736f 的建置(2026-11-04)紅在多重排序藏箭頭、數字 / 人員欄第一下降冪、沒有播報區、只從面板加排序時列把手可拖;
 *        8eb473c7(2026-11-10)紅在多重排序時 ⌄ 沒有取消排序;2e1f2e27 紅在選單兩個方向永遠都列。
 *        其餘本機實測數字(判定列數、--selftest 應紅 / 對照列數、秒數)寫在交付時的 log,不抄進這裡(抄了就會過期 —— 11-03 這裡曾寫 148,實為 147)。
 *   綠: 修好的建置全綠;找不到表頭 / 排序區 / 面板 / 選單項等量不到的情況以 INSTRUMENT-FAIL 紅,不當成通過。
 *        **怎麼確認不是抽籤**:每一列判的是離散狀態(aria-sort、畫出來的順位數字、選單項有幾個、有沒有某個元素)或靜態版面量測
 *        (getBoundingClientRect 的位置 / 寬高,不是時間),一律在開 story 等到元素本身出現、每一步之後 settleAfterInteraction 等版面靜止
 *        才讀 —— 沒有任何幀時間 / 延遲 / 尾端統計。版面量測的容差 0.5–0.75px,破法造成的差最小 2px(間距 4px vs 2px),兩者不重疊。
 *        2026-11-11 同一份建置連跑兩次,輸出(含每一個量到的數字)逐字相同。
 *        (本段原本就在;2026-11-11 前 gate-control-group 只讀 @gate-contract 起 2000 字,f40a2db1 補長「保證」「紅」後這一行落到第 2077 字被判成「缺綠」——
 *        那是量具截斷,已改讀到註解結束。)
 * ─────
 * 點擊 / 選單規則(user 2026-11-11 R16 定案;原話逐字住 data-table.spec.md「Multi-sort header」列):「循環:兩態」;已排序的欄一般點擊 = Shift+點擊;
 *   ⌄ 選單「取消排序」只拿掉這一欄、已排序的欄只列相反方向、沒排序的欄選方向取代全部。
 * 長相規格(user 2026-10-30 15:26 / 17:08 / 17:09(台灣時間)對話;規範與原話住 data-table.spec.md「Multi-sort header」列):
 *   「有被排序的 column 才會秀出‘箭頭+數字’,數字最多 9+,」「數字字體與column標頭字體一樣但顏色與箭頭一樣,」
 *   「數字在箭頭右邊且距離箭頭 2px?我不確定距離2px好還是距離4px,目前比較偏向2px,」
 *   (17:09:「不用給我看2px和4px的差異,我自己早就看過了,我認為視覺上2px比較好看,主要是不確定合理性」—— 2px = user 視覺偏好 + AI 合理性查證,查證在該列)「然後箭頭與數字同進同出,」
 *   「佔位和排版的方式與以前只有一個箭頭時類似,」「若只有單一 sort沒有多重sort則不顯示數字,」;4 點追問「1. 就用ds的字眼就好」「4. 不要限制欄數,超過一律9+」
 *   (同次的「2. a」「3. 對」講的是三態循環與一般點擊清掉其他欄,已由 2026-11-11 R16 定案取代)。
 * 判定的純函式另有判定表 `scripts/test-data-table-sort-cycle.mjs`(本閘驗的是「頁面真的照它排」,M37:呼叫端與判定兩邊都要測)。
 * 開 story 一律經 lib/launch-browser.mjs 的 openStory(開不起來 = 儀器失效,exit 2);每一步之後 settleAfterInteraction(不用固定睡眠)。
 *   node scripts/data-table-multi-sort-invariant.mjs [--build=<storybook 建置目錄>] [--selftest]
 */
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowserOrSkip, openStory, StoryRenderInstrumentError, requireStorybookBuild, requireFreshStorybookBuild, settleAfterInteraction, waitForFocusStable, parkPointer, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { AxeBuilder } from '@axe-core/playwright'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const buildArg = process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length)
const STATIC = buildArg ? (isAbsolute(buildArg) ? buildArg : join(process.cwd(), buildArg)) : join(REPO, 'storybook-static')
requireStorybookBuild(join(STATIC, 'index.json'))
if (!buildArg) requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/DataTable'])

const ROADMAP = `iframe.html?id=${encodeURIComponent('design-system-components-datatable-展示--roadmap-all-in-one')}&viewMode=story`
const FEATURES = `iframe.html?id=${encodeURIComponent('design-system-components-datatable-設計規格--features')}&viewMode=story`
// 設計規格「元件檢閱器」:size 是 story 的 args(sm / md / lg),用網址的 args 切 —— 全 DS 只有這則可排序的表能切尺寸
const INSPECTOR = (size) => `iframe.html?id=${encodeURIComponent('design-system-components-datatable-設計規格--inspector')}&viewMode=story&args=size:${size}`
const HEADERS_READY = () => document.querySelectorAll('[role="columnheader"][data-column-id] [role="button"]').length >= 3

let failCount = 0
let instrumentFail = false
/** `control: true` = 對照列:破法不碰的行為,--selftest 下也必須綠(證明破法只打到要打的那一處) */
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
const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
// 寬視窗:專案排程那張表 13 個可排序欄全部看得到(第 10 個以後「9+」要點到第 11 欄)
const context = await browser.newContext({ viewport: { width: 2600, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()

const settle = async () => (await settleAfterInteraction(page, { frames: 6, capMs: 6000 })).ok

/** 開 story;--selftest 下接著注入這一段的破法 */
async function open(url, breaks = []) {
  try {
    await openStory(page, `${server.origin}/${url}`, { waitFor: HEADERS_READY, settleFrames: 8, notFound: server.notFound })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    instrument(`開 story ${url}`, error.message)
    return false
  }
  if (SELFTEST) for (const b of breaks) await injectBreak(b)
  await parkPointer(page)
  return true
}

// ── --selftest 的破法(每種只打一組;其餘照常量)────────────────────────────────────────────
const SORT_BUTTON = '[role="columnheader"] [role="button"]'
async function injectBreak(kind) {
  const css = {
    'number-hidden': '[data-sort-priority]{display:none!important}',
    'gap-4': '[data-sort-indicator]{gap:4px!important}',
    'number-style': '[data-sort-priority]{font-size:11px!important;color:rgb(220,0,0)!important}',
    'number-left': '[data-sort-indicator]{flex-direction:row-reverse!important}',
    'slot-shift': '[data-sort-indicator]{margin-left:6px!important}',
    'height-grow': '[data-sort-priority]{line-height:44px!important}',
    'number-offset': '[data-sort-priority]{position:relative!important;top:3px!important}',
    'menu-cancel-hidden': '[role="menuitem"]:has(svg.lucide-x){display:none!important}',
    'menu-current-dir-shown': '',
    'num-role-img': '',
  }[kind]
  if (css) { await page.addStyleTag({ content: css }); return }
  await page.evaluate(([kind, sel]) => {
    if (kind === 'shift-dropped') {
      // Shift 的點擊與按鍵在 document 捕獲階段就停掉(React 根節點收不到)= 沒有多重排序
      for (const type of ['click', 'keydown']) {
        document.addEventListener(type, (e) => { if (e.shiftKey && e.target instanceof Element && e.target.closest(sel)) { e.stopImmediatePropagation(); e.preventDefault() } }, true)
      }
    }
    if (kind === 'aria-stripped') {
      const strip = () => {
        for (const b of document.querySelectorAll(sel)) if (b.hasAttribute('aria-describedby')) b.removeAttribute('aria-describedby')
        for (const n of document.querySelectorAll('[data-sort-priority][aria-hidden]')) n.removeAttribute('aria-hidden')
      }
      strip()
      new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-describedby', 'aria-hidden'] })
    }
    if (kind === 'live-silent') {
      const clear = () => { for (const r of document.querySelectorAll('[data-sort-live-region]')) if (r.textContent) r.textContent = '' }
      new MutationObserver(clear).observe(document.body, { subtree: true, childList: true, characterData: true })
    }
    if (kind === 'number-in-single') {
      // 只有一欄排序時也塞一個數字(= 沒照「單一排序不顯示數字」)
      const add = () => {
        const sorted = [...document.querySelectorAll('[role="columnheader"][aria-sort="ascending"], [role="columnheader"][aria-sort="descending"]')]
        if (sorted.length !== 1) return
        const svg = sorted[0].querySelector('[role="button"] svg'); const host = svg?.parentElement
        if (host && !host.querySelector('[data-sort-priority]')) { const n = document.createElement('span'); n.setAttribute('data-sort-priority', ''); n.textContent = '1'; host.appendChild(n) }
      }
      new MutationObserver(add).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-sort'] })
    }
    if (kind === 'menu-cancel-multi-hidden') {
      // 多重排序時 ⌄ 選單把「取消排序」藏起來(= 修前 K7 的行為;只有一欄排序時照常)
      const hide = () => {
        const sortedCount = document.querySelectorAll('[role="columnheader"][aria-sort="ascending"], [role="columnheader"][aria-sort="descending"]').length
        if (sortedCount < 2) return
        for (const m of document.querySelectorAll('[role="menu"] [role="menuitem"]')) if ((m.textContent || '').trim() === '取消排序' && m.style.display !== 'none') m.style.display = 'none'
      }
      new MutationObserver(hide).observe(document.body, { subtree: true, childList: true })
    }
    if (kind === 'menu-current-dir-shown') {
      // ⌄ 選單把「這一欄目前已經是的那個方向」也列出來(= 2e1f2e27 以前:升冪 / 降冪兩項永遠都在):選單裡只有其中一項時,複製它補上另一項
      const pairs = [['升冪排序', '降冪排序'], ['降冪排序', '升冪排序']]
      const add = () => {
        for (const menu of document.querySelectorAll('[role="menu"]')) {
          const items = [...menu.querySelectorAll('[role="menuitem"]')]
          const find = (t) => items.find((m) => (m.textContent || '').trim() === t)
          for (const [have, missing] of pairs) {
            const src = find(have)
            if (!src || find(missing)) continue
            const clone = src.cloneNode(true)
            const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT)
            for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.includes(have)) n.nodeValue = n.nodeValue.replace(have, missing)
            src.after(clone)
          }
        }
      }
      new MutationObserver(add).observe(document.body, { subtree: true, childList: true })
    }
    if (kind === 'menu-trigger-untabbable') {
      // ⌄ 拿出 Tab 順序(= 收起時改用 display:none / tabindex=-1 的寫法):Tab 從排序區會跳到下一欄,鍵盤摸不到「取消排序」
      const drop = () => { for (const b of document.querySelectorAll('[data-col-menu] button')) if (b.getAttribute('tabindex') !== '-1') b.setAttribute('tabindex', '-1') }
      drop()
      new MutationObserver(drop).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['tabindex'] })
    }
    if (kind === 'num-role-img') {
      // 數字從讀屏裡露出來、而且變成沒有名字的圖(axe role-img-alt;只有多重排序時有數字,沒排序的基準不受影響)
      const mark = () => { for (const n of document.querySelectorAll('[data-sort-priority]')) if (n.getAttribute('role') !== 'img') { n.removeAttribute('aria-hidden'); n.setAttribute('role', 'img') } }
      new MutationObserver(mark).observe(document.body, { subtree: true, childList: true, characterData: true })
    }
    if (kind === 'nine-plus-numeric') {
      // 「9+」改寫成實際順位(= 沒有上限)
      const fix = () => {
        for (const n of document.querySelectorAll('[data-sort-priority]')) {
          if (n.textContent !== '9+') continue
          const b = n.closest('[role="button"]'); const d = b && document.getElementById(b.getAttribute('aria-describedby') || '')
          const m = d && /(\d+)/.exec(d.textContent || ''); if (m) n.textContent = m[1]
        }
      }
      new MutationObserver(fix).observe(document.body, { subtree: true, childList: true, characterData: true })
    }
  }, [kind, SORT_BUTTON])
}

// ── 頁面端讀值 ────────────────────────────────────────────────────────────────────────────
/**
 * 表頭讀出來的排序:每個 aria-sort 為升 / 降冪的欄 → `${id}${↑|↓}${畫出來的數字}`,依順位排(描述「排序順位 N」優先,沒有描述依 DOM 順序)。
 * 另回報:同進同出(箭頭 ⇔ 有方向、數字 ⇔ 箭頭且 ≥2 欄)違反的欄。
 */
const readHeaders = () => page.evaluate(() => {
  const rows = []
  const outOfSync = []
  const hs = [...document.querySelectorAll('[role="columnheader"][data-column-id]')].filter((h) => !h.closest('[aria-hidden="true"]'))
  for (const [domIndex, h] of hs.entries()) {
    const id = h.getAttribute('data-column-id')
    const s = h.getAttribute('aria-sort')
    const btn = h.querySelector('[role="button"]')
    if (!btn) continue
    const arrow = !!btn.querySelector('svg')
    const numEl = btn.querySelector('[data-sort-priority]')
    const num = numEl && numEl.getBoundingClientRect().width > 0 ? numEl.textContent : ''
    const descId = btn.getAttribute('aria-describedby')
    const desc = descId ? (document.getElementById(descId)?.textContent ?? '') : ''
    const sorted = s === 'ascending' || s === 'descending'
    if (arrow !== sorted) outOfSync.push(`${id}:箭頭=${arrow} aria-sort=${s}`)
    if (sorted) rows.push({ id, dir: s === 'ascending' ? '↑' : '↓', num, desc, domIndex })
  }
  const prio = (r) => { const m = /排序順位 (\d+)/.exec(r.desc); return m ? Number(m[1]) : 1000 + r.domIndex }
  rows.sort((a, b) => prio(a) - prio(b))
  for (const r of rows) if ((rows.length >= 2) !== (r.num !== '')) outOfSync.push(`${r.id}:數字「${r.num}」但排序欄數 ${rows.length}`)
  return { state: rows.map((r) => `${r.id}${r.dir}${r.num}`).join(' '), rows, outOfSync }
})

const sortButton = (col) => page.locator(`[role="columnheader"][data-column-id="${col}"] [role="button"]`).first()
async function act(kind, col) {
  const btn = sortButton(col)
  if ((await btn.count()) === 0) { instrument(`排序區 ${col}`, '找不到'); return false }
  await btn.scrollIntoViewIfNeeded()
  if (kind === 'click') await btn.click()
  else if (kind === 'shift') await btn.click({ modifiers: ['Shift'] })
  else {
    await btn.focus()
    await waitForFocusStable(page, { frames: 4, capMs: 3000 })
    await page.keyboard.press(kind)
  }
  await parkPointer(page)
  return settle()
}

// ═══ P 狀態轉移(受控表格:專案排程範例,與排序面板共用 state)═══════════════════════════════════
const P_STEPS = [
  // [動作, 欄, 期望, 說明, 破法(丟掉 Shift)下仍得到同一個結果 = 對照列]
  // 破法丟掉 Shift(Shift 的點擊與按鍵整個收不到):第一個 Shift 步驟之前的列不受影響;之後狀態偏掉(如預期紅),
  // 第 13、14、18 步例外 —— 一般點擊 / Enter 沒排序的欄 = 取代全部,破法下前一步的狀態不同也得到同一個結果,當對照列
  ['click', 'title', 'title↑', '一般點擊 / 沒有排序 → 升冪', true],
  ['click', 'title', 'title↓', '一般點擊 / 升冪 → 降冪', true],
  ['click', 'title', 'title↑', '一般點擊 / 降冪 → 升冪(兩態:點不回沒排序;R16 前這一步變成沒排序)', true],
  ['click', 'progress', 'progress↑', '一般點擊 / 沒排序的數字欄 → 取代全部、第一下升冪', true],
  ['click', 'owner', 'owner↑', '一般點擊 / 換欄 → 只剩新的那欄;人員欄第一下升冪', true],
  ['shift', 'status', 'owner↑1 status↑2', 'Shift+點擊 / 加第二欄 → 接在最後、升冪、兩欄都出數字'],
  ['shift', 'priority', 'owner↑1 status↑2 priority↑3', 'Shift+點擊 / 加第三欄'],
  ['shift', 'status', 'owner↑1 status↓2 priority↑3', 'Shift+點擊 / 中間欄 升冪 → 降冪、順位不動'],
  ['shift', 'status', 'owner↑1 status↑2 priority↑3', 'Shift+點擊 / 中間欄 降冪 → 升冪,不會被點掉(R16 前這一步拿掉狀態)'],
  ['click', 'priority', 'owner↑1 status↑2 priority↓3', '一般點擊 / 多重排序最後一欄 → 只翻這一欄,其他欄與順位不動(R16 前清掉其他欄)'],
  ['click', 'owner', 'owner↓1 status↑2 priority↓3', '一般點擊 / 多重排序第 1 欄 → 只翻這一欄'],
  ['click', 'status', 'owner↓1 status↓2 priority↓3', '一般點擊 / 多重排序中間欄 → 只翻這一欄'],
  ['click', 'title', 'title↑', '一般點擊 / 沒排序的欄 → 取代全部(其他欄清掉)', true],
  ['Enter', 'title', 'title↓', 'Enter = 點擊(已排序 → 只翻方向)', true],
  ['Shift+Enter', 'status', 'title↓1 status↑2', 'Shift+Enter = Shift+點擊(沒排序 → 加到最後)'],
  ['Shift+Space', 'status', 'title↓1 status↓2', 'Shift+Space = Shift+點擊(已排序 → 只翻方向)'],
  ['Space', 'status', 'title↓1 status↑2', 'Space = 點擊(已排序 → 只翻這一欄,其他欄留著)'],
  ['Enter', 'priority', 'priority↑', 'Enter = 點擊(沒排序 → 取代全部)', true],
  ['Shift+Space', 'title', 'priority↑1 title↑2', 'Shift+Space / 沒排序 → 加到最後'],
]
const P_ANNOUNCE = {
  // 第幾步之後播報區該是哪一句(lib/sort-cycle.ts sortChangeAnnouncement)+ 破法(丟掉 Shift)下是否仍是同一句(= 對照列)
  1: ['已依 標題 升冪排序', true],
  5: ['已依 負責人 升冪排序,其他欄的排序已清除', true],
  6: ['已依 狀態 升冪排序,共 2 欄排序:1 負責人 升冪,2 狀態 升冪', false],
  10: ['已依 優先級 降冪排序,共 3 欄排序:1 負責人 升冪,2 狀態 升冪,3 優先級 降冪', false],
  13: ['已依 標題 升冪排序,其他欄的排序已清除', true],
}
if (await open(ROADMAP, ['shift-dropped'])) {
  for (const [i, [kind, col, want, note, ctl = false]] of P_STEPS.entries()) {
    if (!(await act(kind, col))) break
    const r = await readHeaders()
    check('P', `第 ${i + 1} 步 ${kind} ${col}:${note} → 「${want || '(無)'}」`, r.state === want, `實得「${r.state || '(無)'}」`, { control: ctl })
    check('N', `第 ${i + 1} 步 箭頭與數字同進同出(箭頭 ⇔ 有方向;數字 ⇔ ≥2 欄排序)`, r.outOfSync.length === 0, r.outOfSync.join(';'), { control: true })
    if (P_ANNOUNCE[i + 1]) {
      const [want, control] = P_ANNOUNCE[i + 1]
      const text = await page.evaluate(() => document.querySelector('[data-sort-live-region]')?.textContent ?? null)
      if (text === null && !buildArg) { instrument('A 播報區', '找不到 [data-sort-live-region]'); continue }
      check('A', `第 ${i + 1} 步之後 播報「${want}」`, text === want, `實得「${text}」`, { control })
    }
  }
}

// ═══ N 數字:9+ 與不限欄數 ═════════════════════════════════════════════════════════════════
const ELEVEN = ['id', 'title', 'status', 'priority', 'owner', 'reviewers', 'tags', 'startDate', 'dueDate', 'progress', 'spec']
if (await open(ROADMAP, ['nine-plus-numeric'])) {
  await act('click', ELEVEN[0])
  for (const col of ELEVEN.slice(1)) await act('shift', col)
  const r = await readHeaders()
  const labels = Object.fromEntries(r.rows.map((x) => [x.id, x.num]))
  const descs = Object.fromEntries(r.rows.map((x) => [x.id, x.desc]))
  check('N', `Shift+點擊加到 11 欄:不限欄數,11 欄都在排序裡`, r.rows.length === 11, `實得 ${r.rows.length} 欄「${r.state}」`, { control: true })
  check('N', '第 1–9 個顯示 1–9', ELEVEN.slice(0, 9).every((c, i) => labels[c] === String(i + 1)), JSON.stringify(labels), { control: true })
  check('N', '第 10、11 個一律顯示「9+」', labels[ELEVEN[9]] === '9+' && labels[ELEVEN[10]] === '9+', `第 10 個「${labels[ELEVEN[9]]}」第 11 個「${labels[ELEVEN[10]]}」`)
  check('A', '讀屏照實說第 10、11(「9+」只是畫面上的寫法)', descs[ELEVEN[9]] === '排序順位 10' && descs[ELEVEN[10]] === '排序順位 11', `「${descs[ELEVEN[9]]}」「${descs[ELEVEN[10]]}」`, { control: true })
}

// ═══ G 長相 ═════════════════════════════════════════════════════════════════════════════
/** 量一欄的指示:label 文字、指示外框、箭頭、數字的盒子與字樣 */
const geo = (col, hover = false) => page.evaluate(([col]) => {
  const h = document.querySelector(`[role="columnheader"][data-column-id="${col}"]`)
  const btn = h?.querySelector('[role="button"]')
  if (!btn) return null
  const rect = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, cy: b.top + b.height / 2 } }
  // label = 排序區裡第一個帶字的子元素(TruncatedText);量「畫出來的字」的右緣(文字節點範圍),不量盒子
  const label = btn.firstElementChild
  let textRight = null
  if (label) {
    const w = document.createTreeWalker(label, NodeFilter.SHOW_TEXT); let rr = -Infinity
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const range = document.createRange(); range.selectNodeContents(n); rr = Math.max(rr, range.getBoundingClientRect().right) }
    if (Number.isFinite(rr)) textRight = rr
  }
  const svg = btn.querySelector('svg')
  const indicator = svg?.parentElement !== btn ? svg?.parentElement : svg
  const num = btn.querySelector('[data-sort-priority]')
  const cs = (e) => (e ? getComputedStyle(e) : null)
  const n = cs(num); const s = cs(svg); const lb = cs(label)
  return {
    label: rect(label), textRight, indicator: rect(indicator), arrow: rect(svg), num: num && num.getBoundingClientRect().width > 0 ? rect(num) : null,
    numFont: n && { size: n.fontSize, line: n.lineHeight, weight: n.fontWeight, family: n.fontFamily, color: n.color },
    labelFont: lb && { size: lb.fontSize, line: lb.lineHeight, weight: lb.fontWeight, family: lb.fontFamily, color: lb.color },
    arrowColor: s?.color ?? null,
    header: rect(h),
  }
}, [col, hover])
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol
/** label ↔ 排序指示的間距(px)= data-table.tsx 排序區的 `gap-2`;SSOT = data-table.spec.md「Multi-sort header」列 */
const LABEL_INDICATOR_GAP = 8

/** 每一列 `hitBy` = 會讓它紅的破法;--selftest 下不在 hitBy 的破法 → 對照列(必須綠) */
const gcheck = (breaks, hitBy, name, pass, detail) => check('G', name, pass, detail, { control: !hitBy.some((b) => breaks.includes(b)) })
/**
 * 量哪一張表:`single` 先一般點擊(只有一欄排序)、再 Shift+點擊 `second`(多重排序);`other` 量表頭高度。
 * `expect` = 這個尺寸應有的箭頭寬與表頭字級(uiSize Icon Tier:sm / md 16、lg 20;fieldDisplayTextClass:sm / md text-body、lg text-body-lg)——
 * 量到的不符 = 網址的 args 沒生效、量的不是要量的尺寸 → INSTRUMENT-FAIL,不讀成通過。
 */
const G_ROADMAP = { url: ROADMAP, single: 'status', second: 'priority', other: 'title', names: ['狀態(1)', '優先級(2)'] }
const G_INSPECTOR = (size) => ({ url: INSPECTOR(size), single: 'category', second: 'stock', other: 'name', names: [`${size} Category(1)`, `${size} Stock(2)`], expect: { arrowW: size === 'lg' ? 20 : 16, fontPx: size === 'lg' ? null : '14px', notFontPx: size === 'lg' ? '14px' : null, headerBelow: size === 'sm' ? 38 : null } })
async function geometryChecks(tag, breaks, target = G_ROADMAP) {
  if (!(await open(target.url, breaks))) return
  const { single: c1, second: c2, other } = target
  const headerH0 = (await geo(other))?.header?.h
  // 只有一欄排序
  await act('click', c1)
  const single = await geo(c1)
  if (!single?.arrow || !single?.indicator) { instrument(`G ${tag}`, `只有一欄排序時量不到箭頭 ${JSON.stringify(single)}`); return }
  if (target.expect) {
    const e = target.expect
    const off = [
      !near(single.arrow.w, e.arrowW, 0.5) && `箭頭寬 ${single.arrow.w}(應 ${e.arrowW})`,
      e.fontPx && single.labelFont?.size !== e.fontPx && `表頭字 ${single.labelFont?.size}(應 ${e.fontPx})`,
      e.notFontPx && single.labelFont?.size === e.notFontPx && `表頭字 ${single.labelFont?.size}(lg 不應是 ${e.notFontPx})`,
      e.headerBelow && !(headerH0 < e.headerBelow) && `表頭高 ${headerH0}(sm 應低於 md 的 ${e.headerBelow})`,
    ].filter(Boolean)
    if (off.length) { instrument(`G ${tag} 尺寸`, `量到的不是要量的尺寸:${off.join(';')}`); return }
  }
  gcheck(breaks, ['number-in-single'], `${tag} 只有一欄排序:指示 = 一個箭頭(寬 ${single.arrow.w}px),沒有數字`, near(single.indicator.w, single.arrow.w, 0.5) && single.num === null, `指示寬 ${single.indicator.w} 數字 ${JSON.stringify(single.num)}`)
  gcheck(breaks, ['slot-shift'], `${tag} 只有一欄排序:箭頭在 label 盒之後 8px`, near(single.indicator.l - (single.label?.r ?? NaN), LABEL_INDICATOR_GAP, 0.5), `${(single.indicator.l - (single.label?.r ?? NaN)).toFixed(2)}px`)
  const rs = await readHeaders()
  gcheck(breaks, ['number-in-single'], `${tag} 只有一欄排序:同進同出(沒有數字)`, rs.outOfSync.length === 0, rs.outOfSync.join(';'))
  if (breaks.includes('number-in-single')) return
  // 多重排序
  await act('shift', c2)
  const a = await geo(c1); const b = await geo(c2)
  for (const [name, g] of [[target.names[0], a], [target.names[1], b]]) {
    if (!g?.num || !g?.arrow) { instrument(`G ${tag} ${name}`, `多重排序時量不到箭頭與數字 ${JSON.stringify(g)}`); continue }
    const gap = g.num.l - g.arrow.r
    gcheck(breaks, ['number-left'], `${tag} ${name} 數字在箭頭右側`, g.num.l >= g.arrow.r - 0.01, `箭頭右緣 ${g.arrow.r.toFixed(2)} 數字左緣 ${g.num.l.toFixed(2)}`)
    gcheck(breaks, ['gap-4', 'number-left'], `${tag} ${name} 箭頭 ↔ 數字 2px`, near(gap, 2, 0.5), `實得 ${gap.toFixed(2)}px`)
    const sameType = g.numFont.size === g.labelFont.size && g.numFont.line === g.labelFont.line && g.numFont.weight === g.labelFont.weight && g.numFont.family === g.labelFont.family
    gcheck(breaks, ['number-style', 'height-grow'], `${tag} ${name} 數字字級 / 行高 / 字重 / 字族 = 表頭字`, sameType, `數字 ${JSON.stringify(g.numFont)} 表頭字 ${JSON.stringify(g.labelFont)}`)
    gcheck(breaks, ['number-style'], `${tag} ${name} 數字顏色 = 箭頭顏色(靜止)`, g.numFont.color === g.arrowColor, `數字 ${g.numFont.color} 箭頭 ${g.arrowColor}`)
    gcheck(breaks, ['number-offset'], `${tag} ${name} 數字與箭頭垂直置中對齊(±0.75px)`, near(g.num.cy, g.arrow.cy, 0.75), `數字中線 ${g.num.cy.toFixed(2)} 箭頭中線 ${g.arrow.cy.toFixed(2)}`)
    gcheck(breaks, ['slot-shift'], `${tag} ${name} 指示佔原本箭頭的位置:label 盒之後 8px`, near(g.indicator.l - (g.label?.r ?? NaN), LABEL_INDICATOR_GAP, 0.5), `label 盒右緣 → 指示左緣 ${(g.indicator.l - (g.label?.r ?? NaN)).toFixed(2)}px`)
    gcheck(breaks, ['gap-4'], `${tag} ${name} 指示寬 = 箭頭 + 2 + 數字`, near(g.indicator.w, g.arrow.w + 2 + g.num.w, 0.6), `指示 ${g.indicator.w.toFixed(2)} 箭頭 ${g.arrow.w} 數字 ${g.num.w.toFixed(2)}`)
    gcheck(breaks, ['height-grow', 'number-style'], `${tag} ${name} 指示高 = 表頭字的行高(數字沒有把指示撐得比 label 高)`, near(g.indicator.h, g.label?.h, 0.5), `指示 ${g.indicator.h.toFixed(2)} label ${g.label?.h}`)
  }
  const headerH2 = (await geo(other))?.header?.h
  // 表頭列高由列高 token 定死,數字撐高也不會讓它變(破法「數字撐高」實測仍 38)—— 這列只當對照列,撐高由上面「指示高」那列抓
  gcheck(breaks, [], `${tag} 表頭高度不因數字改變(無排序 ${headerH0} / 多重排序 ${headerH2})`, near(headerH0, headerH2, 0.5), '')
  // 滑過:數字與箭頭一起變色(都繼承排序區的 hover 字色)
  const box = await sortButton(c2).boundingBox()
  await page.mouse.move(box.x + 4, box.y + box.height / 2); await settle()
  const hv = await geo(c2)
  gcheck(breaks, ['number-style'], `${tag} 滑過排序區:數字顏色 = 箭頭顏色,且與靜止時不同(真的跟著變)`, !!hv?.numFont && hv.numFont.color === hv.arrowColor && hv.arrowColor !== b?.arrowColor, `滑過 數字 ${hv?.numFont?.color} 箭頭 ${hv?.arrowColor};靜止箭頭 ${b?.arrowColor}`)
  await parkPointer(page); await settle()
}
if (SELFTEST) {
  for (const [tag, br] of [['[破法:間距 4px]', 'gap-4'], ['[破法:數字字級與顏色]', 'number-style'], ['[破法:數字在左]', 'number-left'], ['[破法:指示右移]', 'slot-shift'],
    ['[破法:數字撐高]', 'height-grow'], ['[破法:數字偏下]', 'number-offset'], ['[破法:只有一欄也出數字]', 'number-in-single']]) await geometryChecks(tag, [br])
  // sm / lg 也要會紅(不只 md):各跑一種長相破法
  await geometryChecks('[lg 破法:間距 4px]', ['gap-4'], G_INSPECTOR('lg'))
  await geometryChecks('[sm 破法:數字字級與顏色]', ['number-style'], G_INSPECTOR('sm'))
} else {
  await geometryChecks('', [])
  await geometryChecks('[sm]', [], G_INSPECTOR('sm'))
  await geometryChecks('[lg]', [], G_INSPECTOR('lg'))
}

// ═══ M ⌄ 欄位選單 + A 讀屏 ═══════════════════════════════════════════════════════════════
async function openColumnMenu(col, name) {
  const header = page.locator(`[role="columnheader"][data-column-id="${col}"]`).first()
  await header.hover(); await settle()
  const trigger = page.getByRole('button', { name: `${name} 欄位選單` })
  if ((await trigger.count()) === 0) { instrument(`M ${name} 欄位選單`, '找不到 ⌄'); return false }
  await trigger.first().click(); await settle()
  return true
}
/** 選單裡「升冪排序」「降冪排序」各有幾項(lib/sort-cycle.ts `columnMenuShowsSortDirection`:只列這一欄目前不是的那個方向) */
const menuDirections = async () => ({
  asc: await page.getByRole('menuitem', { name: '升冪排序' }).count(),
  desc: await page.getByRole('menuitem', { name: '降冪排序' }).count(),
})
const liveText = () => page.evaluate(() => document.querySelector('[data-sort-live-region]')?.textContent ?? null)
/** 按選單項(看得到才按,看不到就關選單);回傳有沒有按到 */
async function pickMenuItem(name) {
  const item = page.getByRole('menuitem', { name, exact: true })
  const visible = (await item.count()) >= 1 && (await item.first().isVisible())
  if (visible) await item.first().click()
  else await page.keyboard.press('Escape')
  await parkPointer(page); await settle()
  return visible
}
/** 標題 / 狀態 / 優先級三欄都升冪(一般點擊標題,再 Shift+點擊另外兩欄) */
const setupThree = async () => { await act('click', 'title'); await act('shift', 'status'); await act('shift', 'priority') }
for (const breaks of SELFTEST ? [['menu-cancel-hidden'], ['menu-cancel-multi-hidden'], ['menu-current-dir-shown'], ['aria-stripped', 'live-silent']] : [[]]) {
  if (!(await open(ROADMAP, breaks))) continue
  const hideBreak = breaks.includes('menu-cancel-hidden'); const multiHideBreak = breaks.includes('menu-cancel-multi-hidden'); const ariaBreak = breaks.includes('aria-stripped')
  const dirBreak = breaks.includes('menu-current-dir-shown'); const liveBreak = breaks.includes('live-silent')
  const cancelGone = hideBreak || multiHideBreak // 多重排序時看不到「取消排序」的兩種破法
  await setupThree()
  // A:順位描述、數字 aria-hidden、名字不含數字、播報區在根節點外
  const a11y = await page.evaluate(() => {
    const out = {}
    for (const col of ['title', 'status', 'priority']) {
      const b = document.querySelector(`[role="columnheader"][data-column-id="${col}"] [role="button"]`)
      const d = b?.getAttribute('aria-describedby'); const n = b?.querySelector('[data-sort-priority]')
      out[col] = { desc: d ? document.getElementById(d)?.textContent ?? null : null, numHidden: n?.getAttribute('aria-hidden') === 'true' }
    }
    const live = document.querySelector('[data-sort-live-region]')
    out.live = live ? { inTable: !!live.closest('[role="table"], [role="grid"]'), role: live.getAttribute('role'), politeness: live.getAttribute('aria-live'), text: live.textContent } : null
    return out
  })
  check('A', '多重排序:三欄的排序區描述 = 「排序順位 1 / 2 / 3」', a11y.title.desc === '排序順位 1' && a11y.status.desc === '排序順位 2' && a11y.priority.desc === '排序順位 3', JSON.stringify(a11y), { control: !ariaBreak })
  check('A', '畫面上的數字 aria-hidden(名字不會變成「標題1」)', a11y.title.numHidden && a11y.status.numHidden && a11y.priority.numHidden, JSON.stringify(a11y), { control: !ariaBreak })
  const nameOk = (await page.getByRole('button', { name: '狀態', exact: true }).count()) >= 1
  check('A', '排序區的名字仍是欄標題「狀態」(數字與描述不進名字)', nameOk, '', { control: !ariaBreak })
  check('A', '播報區在表格根節點外、role=status、polite', !!a11y.live && !a11y.live.inTable && a11y.live.role === 'status' && a11y.live.politeness === 'polite', JSON.stringify(a11y.live), { control: true })
  check('A', 'Shift 加第三欄後播報「已依 優先級 升冪排序,共 3 欄排序:…」(這一欄 + 整串結果)', a11y.live?.text === '已依 優先級 升冪排序,共 3 欄排序:1 標題 升冪,2 狀態 升冪,3 優先級 升冪', `實得「${a11y.live?.text}」`, { control: !liveBreak })
  // ── 情境 1(接上面的三欄):中間欄「狀態」的選單 —— 已排序的欄只列相反方向、按了只翻這一欄;再按「取消排序」只拿掉這一欄 ──
  if (await openColumnMenu('status', '狀態')) {
    const d = await menuDirections()
    // 「狀態」此刻升冪 → 不列「升冪排序」(選了沒變化)、列「降冪排序」(user 2026-11-10 PR #172 留言;2e1f2e27 建置兩項都列 → 紅)
    check('M', '多重排序、中間欄「狀態」升冪 → 選單只列相反方向:沒有「升冪排序」、有「降冪排序」', d.asc === 0 && d.desc === 1, `升冪 ${d.asc} 項 / 降冪 ${d.desc} 項`, { control: !dirBreak })
    const cancel = page.getByRole('menuitem', { name: '取消排序', exact: true })
    const has = (await cancel.count()) >= 1 && (await cancel.first().isVisible())
    check('M', '多重排序時 ⌄ 選單有「取消排序」', has, '', { control: !cancelGone })
    const clicked = await pickMenuItem('降冪排序')
    const r = await readHeaders()
    check('M', '中間欄按「降冪排序」→ 只翻這一欄,其他欄與順位不動(R16 前:只剩這一欄)', clicked && r.state === 'title↑1 status↓2 priority↑3', `實得「${r.state || '(無)'}」`, { control: true })
    const t = await liveText()
    check('A', '選單翻方向後播報「已依 狀態 降冪排序,共 3 欄排序:…」', t === '已依 狀態 降冪排序,共 3 欄排序:1 標題 升冪,2 狀態 降冪,3 優先級 升冪', `實得「${t}」`, { control: !liveBreak })
  }
  if (await openColumnMenu('status', '狀態')) {
    const d = await menuDirections()
    check('M', '多重排序、中間欄「狀態」降冪(其他欄仍升冪)→ 只列「升冪排序」', d.asc === 1 && d.desc === 0, `升冪 ${d.asc} 項 / 降冪 ${d.desc} 項`, { control: !dirBreak })
    const clicked = await pickMenuItem('取消排序')
    const r = await readHeaders()
    check('M', '中間欄按「取消排序」→ 只拿掉這一欄、優先級往前補成 2(R16 前:清掉全部)', clicked && r.state === 'title↑1 priority↑2', clicked ? `實得「${r.state || '(無)'}」` : '選單裡看不到「取消排序」', { control: !cancelGone })
    if (clicked) {
      const t = await liveText()
      check('A', '取消後播報「已取消 狀態 的排序,共 2 欄排序:…」', t === '已取消 狀態 的排序,共 2 欄排序:1 標題 升冪,2 優先級 升冪', `實得「${t}」`, { control: !liveBreak })
    }
  }
  // ── 情境 2:三欄,第 1 欄「標題」按「取消排序」→ 後面兩欄往前補 ──
  if (await open(ROADMAP, breaks)) {
    await setupThree()
    if (await openColumnMenu('title', '標題')) {
      const clicked = await pickMenuItem('取消排序')
      const r = await readHeaders()
      check('M', '第 1 欄按「取消排序」→ 只拿掉這一欄、狀態 / 優先級往前補成 1 / 2', clicked && r.state === 'status↑1 priority↑2', clicked ? `實得「${r.state || '(無)'}」` : '選單裡看不到「取消排序」', { control: !cancelGone })
    }
  }
  // ── 情境 3:三欄,沒排序的「負責人」選方向 → 取代全部;只剩一欄時取消 → 沒有排序;沒排序的「標題」兩項都列 ──
  if (await open(ROADMAP, breaks)) {
    await setupThree()
    if (await openColumnMenu('owner', '負責人')) {
      const d = await menuDirections()
      const cancelCount = await page.getByRole('menuitem', { name: '取消排序', exact: true }).count()
      check('M', '沒排序的欄「負責人」→ 升冪 / 降冪兩項都列、沒有「取消排序」', d.asc === 1 && d.desc === 1 && cancelCount === 0, `升冪 ${d.asc} / 降冪 ${d.desc} / 取消 ${cancelCount}`, { control: true })
      const clicked = await pickMenuItem('降冪排序')
      const r = await readHeaders()
      check('M', '沒排序的欄按「降冪排序」→ 取代全部,只剩這一欄', clicked && r.state === 'owner↓', `實得「${r.state || '(無)'}」`, { control: true })
      const desc = await page.evaluate(() => document.querySelector('[role="columnheader"][data-column-id="owner"] [role="button"]')?.hasAttribute('aria-describedby'))
      check('A', '回到只有一欄排序 → 沒有順位描述', desc === false, `aria-describedby 存在=${desc}`, { control: true })
      const t = await liveText()
      check('A', '取代全部後播報「已依 負責人 降冪排序,其他欄的排序已清除」', t === '已依 負責人 降冪排序,其他欄的排序已清除', `實得「${t}」`, { control: !liveBreak })
    }
    if (await openColumnMenu('owner', '負責人')) {
      const d = await menuDirections()
      check('M', '只有一欄排序、「負責人」降冪 → 只列「升冪排序」', d.asc === 1 && d.desc === 0, `升冪 ${d.asc} 項 / 降冪 ${d.desc} 項`, { control: !dirBreak })
      const clicked = await pickMenuItem('取消排序')
      const r = await readHeaders()
      check('M', '只有一欄排序時按「取消排序」→ 沒有排序', clicked && r.state === '', clicked ? `實得「${r.state || '(無)'}」` : '選單裡看不到「取消排序」', { control: !hideBreak })
      if (clicked) {
        const t = await liveText()
        check('A', '取消唯一一欄後播報「已取消 負責人 的排序,目前沒有排序」', t === '已取消 負責人 的排序,目前沒有排序', `實得「${t}」`, { control: !liveBreak })
      }
    }
    // 沒排序的欄 → 兩項都列(破法只補缺的那一項,這裡兩項本來就在 → 對照列)
    if (await openColumnMenu('title', '標題')) {
      const d = await menuDirections()
      check('M', '「標題」沒排序 → ⌄ 選單「升冪排序」「降冪排序」兩項都在', d.asc === 1 && d.desc === 1, `升冪 ${d.asc} 項 / 降冪 ${d.desc} 項`, { control: true })
      await page.keyboard.press('Escape'); await parkPointer(page); await settle()
    }
  }
}

// ═══ K 鍵盤:⌄ 在 Tab 順序裡;鍵盤也拿得到「取消排序」(兩態之後,點擊循環裡沒有取消,鍵盤使用者只能走這裡)═══════════
for (const breaks of SELFTEST ? [['menu-trigger-untabbable']] : [[]]) {
  const tabBreak = breaks.includes('menu-trigger-untabbable')
  if (!(await open(ROADMAP, breaks))) continue
  await setupThree()
  await sortButton('status').focus(); await waitForFocusStable(page, { frames: 4, capMs: 3000 })
  await page.keyboard.press('Tab'); await waitForFocusStable(page, { frames: 4, capMs: 3000 }); await settle()
  const f = await page.evaluate(() => {
    const a = document.activeElement; const r = a?.getBoundingClientRect()
    return { label: a?.getAttribute('aria-label') ?? null, w: r ? r.width : 0, inStatus: !!a?.closest('[role="columnheader"][data-column-id="status"]') }
  })
  check('K', '「狀態」排序區按 Tab → 下一站是「狀態 欄位選單」(⌄ 在 Tab 順序裡、聚焦時展開)', f.label === '狀態 欄位選單' && f.inStatus && f.w > 0, JSON.stringify(f), { control: !tabBreak })
  if (f.label !== '狀態 欄位選單') continue
  await page.keyboard.press('Enter'); await settle()
  const menuOpen = await page.getByRole('menu').count()
  let found = false
  for (let i = 0; i < 8 && menuOpen; i++) {
    const cur = await page.evaluate(() => (document.activeElement?.getAttribute('role') === 'menuitem' ? (document.activeElement.textContent || '').trim() : null))
    if (cur === '取消排序') { found = true; break }
    await page.keyboard.press('ArrowDown'); await settle()
  }
  check('K', 'Enter 打開選單、方向鍵走得到「取消排序」', menuOpen >= 1 && found, `選單 ${menuOpen} 個 / 找到=${found}`, { control: !tabBreak })
  if (!found) { await page.keyboard.press('Escape'); await settle(); continue }
  await page.keyboard.press('Enter'); await settle()
  const r = await readHeaders()
  check('K', '鍵盤按「取消排序」→ 只拿掉「狀態」:標題 1 / 優先級 2', r.state === 'title↑1 priority↑2', `實得「${r.state || '(無)'}」`, { control: !tabBreak })
  const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)
  check('K', '選單關掉後焦點回到「狀態 欄位選單」', back === '狀態 欄位選單', `焦點在「${back}」`, { control: !tabBreak })
}

// ═══ A axe:多重排序狀態(3 欄、11 欄 9+、lg 尺寸)═══════════════════════════════════════════
// 全 DS a11y 閘只掃 story 的初始狀態,沒有 story 一開始就多重排序 → 這個狀態只在這裡掃。規則同 a11y 閘(scripts/audit-a11y.mjs:wcag2a + wcag2aa);
// 比的是「同一則 story、沒排序時」的違規數,任何規則的節點數變多 = 多重排序帶進來的新違規。
const axeCounts = async () => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  return Object.fromEntries(r.violations.map((v) => [v.id, v.nodes.length]))
}
const moreThan = (now, base) => Object.entries(now).filter(([id, n]) => n > (base[id] ?? 0)).map(([id, n]) => `${id} ${base[id] ?? 0} → ${n}`)
const ELEVEN_FROM_THREE = ELEVEN.filter((c) => !['title', 'status', 'priority'].includes(c))
for (const breaks of SELFTEST ? [['num-role-img']] : [[]]) {
  const imgBreak = breaks.includes('num-role-img')
  if (await open(ROADMAP, breaks)) {
    const base = await axeCounts()
    console.log(`  axe 基準(專案排程、沒排序):${JSON.stringify(base)}`)
    await act('click', 'title'); await act('shift', 'status'); await act('shift', 'priority')
    const three = await axeCounts(); const d3 = moreThan(three, base)
    check('A', 'axe 多重排序 3 欄:違規不比沒排序時多', d3.length === 0, d3.join(';') || JSON.stringify(three), { control: !imgBreak })
    for (const col of ELEVEN_FROM_THREE) await act('shift', col)
    const r11 = await readHeaders()
    if (r11.rows.length !== 11 || !r11.rows.some((r) => r.num === '9+')) instrument('A axe 11 欄', `沒有排到 11 欄 / 沒有 9+:「${r11.state}」`)
    else {
      const eleven = await axeCounts(); const d11 = moreThan(eleven, base)
      check('A', 'axe 多重排序 11 欄(含 9+):違規不比沒排序時多', d11.length === 0, d11.join(';') || JSON.stringify(eleven), { control: !imgBreak })
    }
  }
  if (await open(INSPECTOR('lg'), breaks)) {
    const base = await axeCounts()
    console.log(`  axe 基準(元件檢閱器 lg、沒排序):${JSON.stringify(base)}`)
    await act('click', 'category'); await act('shift', 'stock'); await act('shift', 'price')
    const lg = await readHeaders()
    if (lg.rows.length !== 3) instrument('A axe lg', `沒有排到 3 欄:「${lg.state}」`)
    else {
      const now = await axeCounts(); const d = moreThan(now, base)
      check('A', 'axe lg 多重排序 3 欄:違規不比沒排序時多', d.length === 0, d.join(';') || JSON.stringify(now), { control: !imgBreak })
    }
  }
}

// ═══ S 與排序面板雙向同步 ═════════════════════════════════════════════════════════════════
async function readPanel() {
  return page.evaluate(() => {
    const fields = [...document.querySelectorAll('[aria-label="排序欄位"]')].map((e) => (e.textContent || '').trim())
    const dirs = [...document.querySelectorAll('[aria-label="排序方向"]')].map((e) => (e.textContent || '').trim())
    return fields.map((f, i) => `${f}${dirs[i] === '降冪' ? '↓' : dirs[i] === '升冪' ? '↑' : `?${dirs[i]}`}`).join(' ')
  })
}
async function openPanel() {
  await page.getByRole('button', { name: '排序', exact: true }).click(); await settle()
  if ((await page.getByRole('button', { name: '加排序' }).count()) === 0) { instrument('S 排序面板', '點了工具列「排序」沒有出現面板'); return false }
  return true
}
const closePanel = async () => { await page.keyboard.press('Escape'); await parkPointer(page); await settle() }
if (await open(ROADMAP, ['number-hidden'])) {
  await act('click', 'title'); await act('shift', 'status'); await act('shift', 'status')
  const before = await readHeaders()
  check('S', '表頭 Shift+點擊兩欄 → 表頭「title↑1 status↓2」', before.state === 'title↑1 status↓2', `實得「${before.state}」`)
  if (await openPanel()) {
    const p = await readPanel()
    check('S', '表頭改 → 面板列序與方向相同「標題↑ 狀態↓」', p === '標題↑ 狀態↓', `面板「${p}」`, { control: true })
    // 面板改第 1 列方向 → 降冪
    const dir1 = page.locator('[aria-label="排序方向"]').first()
    await dir1.click(); await settle()
    const opt = page.getByRole('option', { name: '降冪' })
    if ((await opt.count()) === 0) { instrument('S 面板方向選單', '找不到「降冪」選項') } else {
      await opt.first().click(); await settle()
    }
    await closePanel()
    const after = await readHeaders()
    check('S', '面板把第 1 列改成降冪 → 表頭「title↓1 status↓2」(順位不動)', after.state === 'title↓1 status↓2', `實得「${after.state}」`)
    if (await openPanel()) {
      await page.getByRole('button', { name: '刪除' }).first().click(); await settle()
      await closePanel()
      const del = await readHeaders()
      check('S', '面板刪掉第 1 列 → 表頭只剩「status↓」、沒有數字', del.state === 'status↓', `實得「${del.state}」`, { control: true })
    }
  }
}
// 只從面板加排序:列把手不可拖(修前讀內部 state,把手照樣能拖)
if (await open(ROADMAP, [])) {
  if (await openPanel()) {
    await page.getByRole('button', { name: '加排序' }).click(); await settle()
    await closePanel()
    const row = page.locator('[role="row"][data-sortable-row-id]').nth(3)
    const rb = await row.boundingBox()
    if (!rb) instrument('S 列把手', '找不到列')
    else {
      await page.mouse.move(rb.x + 300, rb.y + rb.height / 2); await settle()
      const labels = await page.evaluate(() => [...document.querySelectorAll('[aria-label="拖曳重排此列"], [aria-label="排序中無法拖曳"]')].map((e) => e.getAttribute('aria-label')))
      if (labels.length === 0) instrument('S 列把手', '滑過列沒有出現把手')
      else check('S', '只從排序面板加排序 → 列把手是「排序中無法拖曳」', labels.every((l) => l === '排序中無法拖曳'), JSON.stringify(labels), { control: true })
      await parkPointer(page)
    }
  }
}

// ═══ U 不受控的表格(設計規格「功能特性」:Product / Category / Price,state 在 DataTable 內部)═════════
if (await open(FEATURES, ['shift-dropped'])) {
  await act('click', 'price')
  const r1 = await readHeaders()
  check('U', '不受控 / 數字欄(Price)第一下升冪(修前降冪)', r1.state === 'price↑', `實得「${r1.state}」`, { control: true })
  await act('shift', 'name')
  const r2 = await readHeaders()
  check('U', '不受控 / Shift+點擊 Product → 「price↑1 name↑2」', r2.state === 'price↑1 name↑2', `實得「${r2.state}」`)
  await act('click', 'name')
  const r3 = await readHeaders()
  check('U', '不受控 / 一般點擊已排序的 Product(升冪)→ 只翻這一欄、Price 留著(R16 前清掉其他欄)', r3.state === 'price↑1 name↓2', `實得「${r3.state}」`)
  await act('click', 'name')
  const r4 = await readHeaders()
  check('U', '不受控 / 再點 Product(降冪)→ 升冪,不會變成沒排序(兩態)', r4.state === 'price↑1 name↑2', `實得「${r4.state}」`)
}

await browser.close()
if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', '))
await server.stop()
if (instrumentFail) {
  console.error(`\n✗ data-table-multi-sort:${INSTRUMENT_FAIL_MARKER} —— 有量測沒有真的量到${SELFTEST ? '(對照組沒有真的跑,不得讀成「如預期紅」)' : ''}`)
  process.exit(2)
}
console.log(failCount ? `\n✗ ${failCount} 項未通過` : `\n✓ ${SELFTEST ? '對照組:各組破法注入後 P / N / G / M / A / S / U 如預期變紅、對照列仍綠(儀器有效)' : '多重排序:狀態轉移、數字與 9+、長相、⌄ 選單、讀屏、與排序面板雙向同步、不受控表格,全通過'}`)
process.exit(failCount ? 1 : 0)
