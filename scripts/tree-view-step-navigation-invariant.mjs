#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 真的 DS TreeView 步驟導覽樹(storybook-static 的 test-only「步驟導覽契約夾具」與展示層「步驟引導」),用真滑鼠、真觸控、真鍵盤量:
 *        點沒有自己頁面的大步驟的文字 → 到第一個子步驟並只展開、焦點跟過去(A2),在捲動框裡也捲到看得到;什麼都不會變 → 開合(D);
 *        同一列的雙擊 / 三擊 / 觸控快點 / 兩下都回報第 1 下的連點只開合一次或不開合、焦點與單擊相同(連點保護),隔得比時間窗久的兩下照實是兩個動作;
 *        收起的沒頁面大步驟替目前那一步代顯灰底與 aria-current="step"、有頁面的不代顯;列尾結果的圖示、顏色與讀屏說明照「步驟結果」表;
 *        鍵盤 Enter / 空白鍵只「到那一步」;沒開 expandOnSelect 的一般樹不受影響;停用的列步驟結果一律停用色(S4,2026-10-21);
 *        展示層「步驟引導」:有紅叉的那一頁看得到錯誤(含範例一開始就有的那一格)、回到送出失敗的頁錯誤還在、頁面上的「下一步 / 上一步」
 *        換頁後焦點在樹上目前那一步、不掉到 <body>(V2–V4,2026-10-21,r1b TV-01 / TV-02)。規格:tree-view.spec.md「步驟導覽樹」「步驟結果」。
 *   紅: 任一條不符 → exit 1;`--selftest` 在真建置上注入 10 種改壞版(擋連點失效、舊的一律開合、代顯消失、舊的 Tab 停靠點、結果圖示與說明消失、
 *       鍵盤也開合、焦點不跟過去、連點後焦點留在點的那一列、展開動畫結束後不再捲、停用列的結果改回語意色),每一種都必須讓它指定的條目紅,少一條 = 量具沒在量它宣稱的東西 → exit 1;
 *       V2–V4 的對照組 = a6390356 的建置(`--build=`;修前預設紅叉那一頁 0 個錯誤、回訪錯誤消失、按鈕換頁後焦點在 <body>,三條必紅);
 *       story 開不起來、建置比原始碼舊、量具的點擊次數 / 觸控類型與預期不同 = 儀器失效(exit 2,不是產品裁決,也不算通過)。
 *   綠: 沒弄壞時全部綠;每一個手勢前用夾具把狀態重設成指定起點並等列真的出現在點擊點上(waitForFunction,不靠固定睡眠);
 *       手勢之後等樹裡的動畫跑完、狀態連兩個影格不變才讀;只有「兩下之間隔多久」本身是被驗的性質時才用固定等待(性質本身有時間窗)。
 *
 * 量什麼(夾具三棵樹:「門市開通步驟」= 沒有自己頁面的大步驟含巢狀;「建置執行紀錄」= 有自己頁面的大步驟;「專案檔案」= 沒開 expandOnSelect):
 *   A1 從別處點收著的沒頁面大步驟 → 第一個子步驟、展開、焦點在那一列、沒有鍵盤框
 *   A2 從別處點已展開的沒頁面大步驟 → 第一個子步驟,大步驟從頭到尾沒有收起
 *   A3 目前那一步在裡面但收著 → 只展開,選取不變
 *   D1 目前那一步在裡面而且看得到 → 收起;隔 700ms 再點 → 展開
 *   D2 有頁面大步驟自己是目前那一步 → 開合;從它的子步驟點它 → 選它、不收起(總帳 T5)
 *   G1 從別處雙擊 / 三擊沒頁面大步驟 → 停在第一個子步驟、展開著(開合翻轉恰好 1 次 = 展開)、焦點在第一個子步驟(與單擊相同)
 *   G2 原地雙擊 → 只收起一次(翻轉 1 次)、焦點在大步驟
 *   G3 兩下都回報第 1 下、隔 250ms(iPhone / iPad 單點一下就是第 1 下;快點兩下要頁面有聽雙擊才可能回報第 2 下)→ 同 G1
 *   G4 觸控(Chromium 觸控模擬)從別處快點兩下 → 同 G1(含焦點);原地快點四下 → 翻轉 1 次
 *   G5 隔 700ms 的兩下(系統不算雙擊)→ 照實是兩個動作:到那裡、再收起(規格「照實記下的殘留」)
 *   G6 有頁面大步驟從別處雙擊 → 選它、展開著
 *   R1 沒頁面大步驟收起、目前那一步在裡面 → 它是唯一有 aria-current="step" 的列、底色 = 選中色、沒有 aria-selected
 *   R2 巢狀:兩層都收著 → 代顯在外層;外層展開、內層收著 → 在內層
 *   R3 有頁面大步驟收起、目前那一步在裡面 → 沒有任何列有 aria-current、沒有任何列是選中色
 *   S1 列尾結果:沒頁面大步驟收起 → 全部成功 = 綠勾「全部已完成」、任一失敗 = 紅叉「其中有錯誤」、有沒結果的 = 不畫;展開 → 不畫;
 *      子步驟 = 自己的「已完成」/「錯誤」;顏色 = text-success / text-error;說明從無障礙樹讀(CDP Accessibility)
 *   S2 有頁面大步驟:展開、收起都只畫自己的(錯誤 / 已完成)
 *   S3 列尾結果與滑過才出現的按鈕並排(滑過時兩者都看得到、不重疊、結果在按鈕左邊)
 *   K1 Enter / 空白鍵從別處到沒頁面大步驟 → 第一個子步驟、展開、焦點跟過去
 *   K2 Enter 在「目前那一步在裡面但收著」→ 不動;在 D 的那一格 → 不開合;→ / ← 照舊開合
 *   P1 目前那一步藏在收起的沒頁面大步驟裡 → Tab 進樹落在代顯的那一列(「落在選中項」的那一項)
 *   L1 捲動框(樹框 110px、內容可捲):點 / Enter 收著的沒頁面大步驟 → 被帶到的子步驟(在這一下才展開的巢狀子樹裡)等展開動畫結束後完整在框內;
 *      從別處雙擊同一列也一樣(焦點在那個子步驟)
 *   L2 捲動框:最後一個大步驟按 → 展開、馬上 ↓ → 焦點那一列等展開動畫結束後完整在框內(焦點捲動是所有樹共用的機制)
 *   F1 一般樹:點資料夾文字只選取不展開、沒有 aria-current、沒有結果槽
 *   S4 停用的列(夾具「已送出的開通申請」):列尾的勾 / 叉一律 text-fg-disabled,靠形狀分辨(spec「步驟結果 → 停用的列」,M24)
 *   V1 展示層「步驟引導」:「1. 商家資料」收著時代顯紅叉「其中有錯誤」;點它 → 到「公司基本資料」、右邊換成那一頁(讀「看得到的那一頁」的標題)
 *   V2 範例一開始就有紅叉的「負責人身分驗證」:點開那一頁,頁上看得到錯誤(至少一欄 aria-invalid + 錯誤訊息)
 *   V3 在「收款銀行帳戶」按下一步沒過 → 換到「撥款週期」再回來 → 錯誤與 aria-invalid 還在
 *   V4 鍵盤在頁面上按「下一步」(過)與「上一步」→ 焦點落在樹上 aria-current="step" 那一列,不是 <body>
 *
 * Run: `node scripts/tree-view-step-navigation-invariant.mjs`(讀 `<cwd>/storybook-static`;`--selftest` 跑改壞版)
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError, requireFreshStorybookBuild } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const FIXTURE = 'design-system-components-treeview-展示--step-navigation-contract'
const SHOWCASE = 'design-system-components-treeview-展示--stepper'
/** 連點保護的時間窗(tree-step-navigation.ts STEP_REPEAT_CLICK_WINDOW_MS)。每個手勢之前與上一下點擊隔開超過它,手勢彼此不會被當成同一串 */
const WINDOW_MS = 500

requireFreshStorybookBuild(BUILD, [
  'packages/design-system/src/components/TreeView/tree-view.tsx',
  'packages/design-system/src/components/TreeView/tree-step-navigation.ts',
  'packages/design-system/src/components/TreeView/tree-view.stories.tsx',
  'packages/design-system/src/components/FileItem/file-item-status.ts',
])

class InstrumentFailure extends Error {}

// ── 改壞版(selftest):在真建置上注入,每一種對應規格的一條 ──
// 共同:記下每一下 click 的 detail / pointerType(量具自檢用),記下每一列 aria-expanded 翻了幾次
// (讀的是 UIEvent 原生的 detail getter:改壞版「擋連點失效」把 MouseEvent 的 detail 改成恆為 1,量具自檢不能被它騙)
const RECORDER = () => {
  const nativeDetail = Object.getOwnPropertyDescriptor(UIEvent.prototype, 'detail').get
  window.__clicks = []
  // 只記真的輸入(isTrusted):改壞版自己用程式按的箭頭不算量具送出的點擊
  window.addEventListener('click', (e) => { if (e.isTrusted) window.__clicks.push({ detail: nativeDetail.call(e), type: e.pointerType ?? '' }) }, true)
}
const MUTANTS = {
  // 連點保護失效:瀏覽器回報的次數一律 1,而且每一下 click 都讓 performance.now 往前跳 10 秒(時間窗永遠不成立)
  'no-guard': {
    sections: ['G', 'T'],
    mustFail: ['G1', 'G2', 'G3', 'G4', 'G6'],
    script: () => {
      Object.defineProperty(MouseEvent.prototype, 'detail', { get() { return 1 }, configurable: true })
      const realNow = performance.now.bind(performance)
      let offset = 0
      window.addEventListener('click', () => { offset += 10_000 }, true)
      performance.now = () => realNow() + offset
    },
  },
  // 2026-10-07 前的程式:expandOnSelect 點了就開合 —— 點展開著的大步驟(不是目前那一步)時,處理完再按一下它的箭頭
  'old-toggle': {
    sections: ['A', 'D', 'G'],
    mustFail: ['A2', 'D2', 'G1'],
    script: () => {
      window.addEventListener('click', (e) => {
        const t = e.target
        if (!(t instanceof Element) || t.closest('[data-tree-actions]') || t.closest('button')) return
        const row = t.closest('[data-tree-row]')
        if (!row || row.getAttribute('aria-expanded') !== 'true' || row.getAttribute('aria-current') === 'step') return
        setTimeout(() => row.querySelector(':scope > [role="gridcell"] button[aria-expanded]')?.click(), 0)
      }, true)
    },
  },
  // 代顯消失:收起的列拿掉 aria-current、底色釘成透明
  'no-proxy': {
    sections: ['R'],
    mustFail: ['R1', 'R2'],
    script: () => {
      const apply = () => {
        const host = document.head || document.documentElement
        if (host && !document.getElementById('__selftest_no_proxy')) {
          const s = document.createElement('style'); s.id = '__selftest_no_proxy'
          s.textContent = '[data-tree-row][aria-expanded="false"]{background-color:transparent !important}'
          host.appendChild(s)
        }
        for (const r of document.querySelectorAll('[data-tree-row][aria-expanded="false"][aria-current]')) r.removeAttribute('aria-current')
      }
      new MutationObserver(apply).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current', 'aria-expanded'] })
    },
  },
  // 舊的 Tab 停靠點:只認 aria-selected —— 代顯的那一列拿到停靠點時,把它還給第一列(= 2026-10-07 前 pickRovingTabStop 的 isCurrent)
  'old-tab-stop': {
    sections: ['P'],
    mustFail: ['P1'],
    script: () => {
      const apply = () => {
        for (const row of document.querySelectorAll('[data-tree-row][aria-current="step"]:not([aria-selected="true"])')) {
          if (row.getAttribute('tabindex') !== '0') continue
          row.setAttribute('tabindex', '-1')
          row.closest('[role="treegrid"]')?.querySelector('[data-tree-row]')?.setAttribute('tabindex', '0')
        }
      }
      new MutationObserver(apply).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['tabindex', 'aria-current'] })
    },
  },
  // 結果圖示與讀屏說明消失
  'no-status': {
    sections: ['S'],
    mustFail: ['S1', 'S2'],
    script: () => {
      const apply = () => {
        const host = document.head || document.documentElement
        if (host && !document.getElementById('__selftest_no_status')) {
          const s = document.createElement('style'); s.id = '__selftest_no_status'
          s.textContent = '[data-tree-status] svg{display:none !important}'
          host.appendChild(s)
        }
        for (const r of document.querySelectorAll('[data-tree-row][aria-describedby]')) r.removeAttribute('aria-describedby')
      }
      new MutationObserver(apply).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-describedby'] })
    },
  },
  // 停用列的結果改回語意色(= 沒照 M24):鎖住的步驟列尾又是綠勾 / 紅叉
  'disabled-status-color': {
    sections: ['S'],
    mustFail: ['S4'],
    script: () => {
      const apply = () => {
        const host = document.head || document.documentElement
        if (host && !document.getElementById('__selftest_disabled_status')) {
          const s = document.createElement('style'); s.id = '__selftest_disabled_status'
          s.textContent = '[data-tree-row][aria-disabled="true"] [data-tree-status] svg{color:var(--success)!important}'
          host.appendChild(s)
        }
      }
      new MutationObserver(apply).observe(document, { subtree: true, childList: true })
    },
  },
  // 鍵盤也開合:列上按 Enter / 空白鍵後再按一下它的箭頭
  'keyboard-toggle': {
    sections: ['K'],
    mustFail: ['K2'],
    script: () => {
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        const row = e.target instanceof Element ? e.target.closest('[data-tree-row]') : null
        if (!row || row !== e.target || !row.hasAttribute('aria-expanded')) return
        setTimeout(() => row.querySelector(':scope > [role="gridcell"] button[aria-expanded]')?.click(), 0)
      }, true)
    },
  },
  // 2026-10-07 複審前:被擋下的連點把焦點留在點的那一列(第二下的按下搶走焦點、沒還給第一下帶到的子步驟)
  'guard-focus-on-row': {
    sections: ['G', 'T'],
    mustFail: ['G1', 'G3', 'G4'],
    script: () => {
      let last = null
      window.addEventListener('click', (e) => {
        if (!e.isTrusted) return
        const t = e.target instanceof Element ? e.target : null
        const row = t && !t.closest('[data-tree-actions]') && !t.closest('button') ? t.closest('[data-tree-row]') : null
        const now = performance.now()
        const repeat = !!row && !!last && last.row === row && (e.detail >= 2 || now - last.at < 500)
        last = row ? { row, at: now } : null
        if (repeat) setTimeout(() => row.focus({ preventScroll: true }), 0)
      }, true)
    },
  },
  // 2026-10-07 複審前:焦點落到正在展開的子樹裡的列時只在 commit 當下捲一次(那時子樹高度還在 0 附近)——
  // 把「展開動畫結束之後」對同一列的那一次 scrollIntoView 丟掉(動畫期間的那次照常),就是複審前的行為
  'no-reveal-scroll': {
    sections: ['L'],
    mustFail: ['L1', 'L2'],
    script: () => {
      const opening = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (p.hasAttribute('data-tree-children') && p.getAnimations().some((a) => a.playState === 'running')) return true
        }
        return false
      }
      const during = new WeakSet()
      const native = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function (...args) {
        if (this.hasAttribute?.('data-tree-row')) {
          if (opening(this)) during.add(this)
          else if (during.has(this)) { during.delete(this); return }
        }
        return native.apply(this, args)
      }
    },
  },
  // 焦點不跟過去:點 / 按完之後把焦點放回原本那一列
  'no-focus-move': {
    sections: ['A', 'K'],
    mustFail: ['A1', 'K1'],
    script: () => {
      const back = (e) => {
        const row = e.target instanceof Element ? e.target.closest('[data-tree-row]') : null
        if (row) setTimeout(() => row.focus({ preventScroll: true }), 80)
      }
      window.addEventListener('click', back, true)
      document.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') back(e) }, true)
    },
  },
}

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const results = []
const ck = (名, 通過, 細節 = '') => { results.push({ 名, 通過, 細節 }) }

function makeSession(page, tag) {
  let lastGestureEnd = 0
  const fx = (name) => `[data-step-fixture="${name}"]`
  const state = (name) => page.evaluate((sel) => {
    const f = document.querySelector(sel)
    return { selected: f?.dataset.selected ?? null, expanded: f?.dataset.expanded ?? null }
  }, fx(name))
  /** 樹裡的動畫跑完、選取 / 展開連兩個影格不變 */
  const settled = async (name) => {
    const ok = await page.waitForFunction((sel) => {
      const f = document.querySelector(sel)
      if (!f) return false
      if (f.getAnimations({ subtree: true }).some((a) => a.playState === 'running')) return false
      const key = `${f.dataset.selected}|${f.dataset.expanded}|${document.activeElement?.dataset?.treeRow ?? ''}`
      const prev = f.__settleKey
      f.__settleKey = key
      return prev === key
    }, fx(name), { timeout: 5_000, polling: 'raf' }).then(() => true, () => false)
    if (!ok) throw new InstrumentFailure(`${tag} 樹「${name}」5 秒內沒有靜止(動畫沒停或狀態一直在變)`)
  }
  /** 把夾具重設成指定起點,並等它真的變成那樣 */
  const reset = async (name, s) => {
    await page.evaluate(({ name, s }) => window.__treeStepFixture[name](s), { name, s })
    const want = { selected: s.selected ?? '', expanded: [...s.expanded].sort().join(',') }
    const ok = await page.waitForFunction(({ sel, want }) => {
      const f = document.querySelector(sel)
      return f && f.dataset.selected === want.selected && f.dataset.expanded === want.expanded
    }, { sel: fx(name), want }, { timeout: 5_000, polling: 'raf' }).then(() => true, () => false)
    if (!ok) throw new InstrumentFailure(`${tag} 樹「${name}」重設成 ${JSON.stringify(s)} 沒有生效`)
    await settled(name)
    await page.mouse.move(0, 0)
  }
  /** 列的文字上的一點(不是箭頭、不是按鈕),等到那一點真的屬於這一列 */
  const textPoint = async (name, id) => {
    const handle = await page.waitForFunction(({ sel, id }) => {
      const row = document.querySelector(`${sel} [data-tree-row="${id}"]`)
      const label = row && document.getElementById(row.getAttribute('aria-labelledby'))
      if (!label) return null
      const b = label.getBoundingClientRect()
      const x = b.left + Math.min(16, b.width / 2)
      const y = b.top + b.height / 2
      return document.elementFromPoint(x, y)?.closest('[data-tree-row]') === row ? { x, y } : null
    }, { sel: fx(name), id }, { timeout: 5_000, polling: 'raf' }).then((h) => h.jsonValue(), () => null)
    if (!handle) throw new InstrumentFailure(`${tag} 樹「${name}」的「${id}」那一列 5 秒內點不到(不在畫面上或被蓋住)`)
    return handle
  }
  /** 手勢之前與上一下點擊隔開超過連點時間窗(被驗的性質本身有時間窗,所以這裡是固定等待) */
  const spaced = async () => {
    const wait = lastGestureEnd + WINDOW_MS + 150 - Date.now()
    if (wait > 0) await page.waitForTimeout(wait)
  }
  /** 開始數某一列 aria-expanded 翻了幾次 */
  const watchFlips = (name, id) => page.evaluate(({ sel, id }) => {
    window.__flips = 0
    window.__flipObserver?.disconnect()
    const row = document.querySelector(`${sel} [data-tree-row="${id}"]`)
    window.__flipObserver = new MutationObserver((ms) => { for (const m of ms) if (m.oldValue !== row.getAttribute('aria-expanded')) window.__flips++ })
    window.__flipObserver.observe(row, { attributes: true, attributeFilter: ['aria-expanded'], attributeOldValue: true })
    window.__clicks = []
  }, { sel: fx(name), id })
  const flips = () => page.evaluate(() => window.__flips)
  const clicks = () => page.evaluate(() => window.__clicks.map((c) => `${c.detail}${c.type === 'touch' ? 't' : ''}`).join(','))
  const gesture = async (name, id, run) => {
    await spaced()
    await watchFlips(name, id)
    await run()
    lastGestureEnd = Date.now()
    await settled(name)
  }
  const focusRow = () => page.evaluate(() => document.activeElement?.closest?.('[data-tree-row]')?.dataset.treeRow ?? null)
  const focusVisible = () => page.evaluate(() => document.activeElement?.matches?.(':focus-visible') ?? null)
  return { fx, state, reset, textPoint, gesture, flips, clicks, focusRow, focusVisible, settled, spaced, markLast: () => { lastGestureEnd = Date.now() } }
}

// ── 各段 ──
const SECTIONS = {
  async A(page, s, tag) {
    await s.reset('pageless', { selected: 'p2a', expanded: ['p2'] })
    await s.gesture('pageless', 'p1', async () => { const p = await s.textPoint('pageless', 'p1'); await page.mouse.click(p.x, p.y) })
    let st = await s.state('pageless')
    const f = await s.focusRow()
    const fv = await s.focusVisible()
    ck(`A1${tag} 從別處點收著的沒頁面大步驟 → 第一個子步驟、展開、焦點跟過去、滑鼠點不畫鍵盤框`,
      st.selected === 'p1a' && st.expanded === 'p1,p2' && f === 'p1a' && fv === false, `${JSON.stringify(st)} 焦點 ${f} focus-visible=${fv}`)
    await s.reset('pageless', { selected: 'p2a', expanded: ['p1', 'p2'] })
    await s.gesture('pageless', 'p1', async () => { const p = await s.textPoint('pageless', 'p1'); await page.mouse.click(p.x, p.y) })
    st = await s.state('pageless')
    const flipsA2 = await s.flips()
    ck(`A2${tag} 從別處點已展開的沒頁面大步驟 → 第一個子步驟、從頭到尾沒有收起`, st.selected === 'p1a' && st.expanded === 'p1,p2' && flipsA2 === 0,
      `${JSON.stringify(st)} 翻轉 ${flipsA2} 次`)
    await s.reset('pageless', { selected: 'p1b', expanded: [] })
    await s.gesture('pageless', 'p1', async () => { const p = await s.textPoint('pageless', 'p1'); await page.mouse.click(p.x, p.y) })
    st = await s.state('pageless')
    ck(`A3${tag} 目前那一步在裡面但收著 → 只展開、選取不變`, st.selected === 'p1b' && st.expanded === 'p1', JSON.stringify(st))
  },
  async D(page, s, tag) {
    await s.reset('pageless', { selected: 'p1a', expanded: ['p1'] })
    await s.gesture('pageless', 'p1', async () => { const p = await s.textPoint('pageless', 'p1'); await page.mouse.click(p.x, p.y) })
    const first = await s.state('pageless')
    await s.gesture('pageless', 'p1', async () => { const p = await s.textPoint('pageless', 'p1'); await page.mouse.click(p.x, p.y) })
    const second = await s.state('pageless')
    ck(`D1${tag} 沒頁面大步驟、目前那一步看得到 → 收起;隔開再點 → 展開`, first.expanded === '' && first.selected === 'p1a' && second.expanded === 'p1',
      `${JSON.stringify(first)} → ${JSON.stringify(second)}`)
    await s.reset('page', { selected: 'h1', expanded: ['h1'] })
    await s.gesture('page', 'h1', async () => { const p = await s.textPoint('page', 'h1'); await page.mouse.click(p.x, p.y) })
    const self = await s.state('page')
    await s.reset('page', { selected: 'h1a', expanded: ['h1'] })
    await s.gesture('page', 'h1', async () => { const p = await s.textPoint('page', 'h1'); await page.mouse.click(p.x, p.y) })
    const fromChild = await s.state('page')
    const fromChildFlips = await s.flips()
    ck(`D2${tag} 有頁面大步驟自己是目前那一步 → 收起;從它的子步驟點它 → 選它、不收起(T5)`,
      self.expanded === '' && self.selected === 'h1' && fromChild.selected === 'h1' && fromChild.expanded === 'h1' && fromChildFlips === 0,
      `自己:${JSON.stringify(self)};從子步驟:${JSON.stringify(fromChild)} 翻轉 ${fromChildFlips}`)
  },
  async G(page, s, tag) {
    // 雙擊、三擊(Playwright 送出的點擊次數 1,2 / 1,2,3 —— 量具自檢)
    for (const [n, label] of [[2, '雙擊'], [3, '三擊']]) {
      await s.reset('pageless', { selected: 'p2a', expanded: ['p2'] })
      await s.gesture('pageless', 'p1', async () => { const p = await s.textPoint('pageless', 'p1'); await page.mouse.click(p.x, p.y, { clickCount: n }) })
      const st = await s.state('pageless')
      const fl = await s.flips()
      const cl = await s.clicks()
      const f = await s.focusRow()
      if (cl !== (n === 2 ? '1,2' : '1,2,3')) throw new InstrumentFailure(`${tag} ${label}送出的點擊次數是 ${cl},不是預期的連點序列`)
      ck(`G1${tag} 從別處${label}沒頁面大步驟 → 停在第一個子步驟、展開著(翻轉恰 1 次)、焦點在第一個子步驟(與單擊相同)`,
        st.selected === 'p1a' && st.expanded === 'p1,p2' && fl === 1 && f === 'p1a',
        `${JSON.stringify(st)} 翻轉 ${fl} 次 / 點擊次數 ${cl} / 焦點 ${f}`)
    }
    await s.reset('pageless', { selected: 'p1a', expanded: ['p1'] })
    await s.gesture('pageless', 'p1', async () => { const p = await s.textPoint('pageless', 'p1'); await page.mouse.dblclick(p.x, p.y) })
    let st = await s.state('pageless')
    let fl = await s.flips()
    let f = await s.focusRow()
    ck(`G2${tag} 原地雙擊 → 只收起一次、不閃、焦點在大步驟`, st.expanded === '' && fl === 1 && f === 'p1', `${JSON.stringify(st)} 翻轉 ${fl} 焦點 ${f}`)
    // 兩下都回報第 1 下(WebKit 手指單點的樣子;快點兩下要頁面有聽雙擊才可能回報第 2 下,所以不能靠次數),隔 250ms
    await s.reset('pageless', { selected: 'p2a', expanded: ['p2'] })
    await s.gesture('pageless', 'p1', async () => {
      const p = await s.textPoint('pageless', 'p1')
      await page.mouse.click(p.x, p.y)
      await page.waitForTimeout(250)
      await page.mouse.click(p.x, p.y)
    })
    st = await s.state('pageless'); fl = await s.flips(); f = await s.focusRow()
    const cl = await s.clicks()
    if (cl !== '1,1') throw new InstrumentFailure(`${tag} 「兩下都回報第 1 下」的兩下送出的次數是 ${cl}`)
    ck(`G3${tag} 兩下都回報第 1 下、隔 250ms → 停在第一個子步驟、展開著、焦點在第一個子步驟`, st.selected === 'p1a' && st.expanded === 'p1,p2' && fl === 1 && f === 'p1a',
      `${JSON.stringify(st)} 翻轉 ${fl} / 點擊次數 ${cl} / 焦點 ${f}`)
    // 隔 700ms(系統不算雙擊)→ 兩個動作(照實記下的殘留)
    await s.reset('pageless', { selected: 'p2a', expanded: ['p2'] })
    await s.gesture('pageless', 'p1', async () => {
      const p = await s.textPoint('pageless', 'p1')
      await page.mouse.click(p.x, p.y)
      await page.waitForTimeout(700)
      await page.mouse.click(p.x, p.y)
    })
    st = await s.state('pageless'); fl = await s.flips()
    ck(`G5${tag} 隔 700ms 的兩下 → 照實是兩個動作(到第一個子步驟,再收起)`, st.selected === 'p1a' && st.expanded === 'p2' && fl === 2,
      `${JSON.stringify(st)} 翻轉 ${fl}`)
    // 有頁面大步驟從別處雙擊
    await s.reset('page', { selected: 'h3', expanded: [] })
    await s.gesture('page', 'h1', async () => { const p = await s.textPoint('page', 'h1'); await page.mouse.dblclick(p.x, p.y) })
    st = await s.state('page'); fl = await s.flips(); f = await s.focusRow()
    ck(`G6${tag} 有頁面大步驟從別處雙擊 → 選它、展開著、焦點在它`, st.selected === 'h1' && st.expanded === 'h1' && fl === 1 && f === 'h1', `${JSON.stringify(st)} 翻轉 ${fl} 焦點 ${f}`)
  },
  // 觸控(另一個有觸控的頁面)
  async T(page, s, tag) {
    await s.reset('pageless', { selected: 'p2a', expanded: ['p2'] })
    await s.gesture('pageless', 'p1', async () => {
      const p = await s.textPoint('pageless', 'p1')
      await page.touchscreen.tap(p.x, p.y)
      await page.waitForTimeout(150)
      await page.touchscreen.tap(p.x, p.y)
    })
    let st = await s.state('pageless'); let fl = await s.flips()
    let cl = await s.clicks()
    if (!/^1t,2t$/.test(cl)) throw new InstrumentFailure(`${tag} 觸控快點兩下送出的是 ${cl},不是 Chromium 觸控的 1、2(pointerType=touch)`)
    const two = { st, fl, cl, f: await s.focusRow() }
    await s.reset('pageless', { selected: 'p1a', expanded: ['p1'] })
    await s.gesture('pageless', 'p1', async () => {
      const p = await s.textPoint('pageless', 'p1')
      for (let i = 0; i < 4; i++) { if (i) await page.waitForTimeout(150); await page.touchscreen.tap(p.x, p.y) }
    })
    st = await s.state('pageless'); fl = await s.flips(); cl = await s.clicks()
    if (cl.split(',').length !== 4 || !cl.split(',').every((c) => c.endsWith('t'))) throw new InstrumentFailure(`${tag} 觸控快點四下送出的是 ${cl}`)
    ck(`G4${tag} 觸控:從別處快點兩下 → 停在第一個子步驟、展開著、焦點在那一步;原地快點四下 → 只收起一次`,
      two.st.selected === 'p1a' && two.st.expanded === 'p1,p2' && two.fl === 1 && two.f === 'p1a' && st.expanded === '' && fl === 1,
      `兩下:${JSON.stringify(two.st)} 翻轉 ${two.fl}(${two.cl})焦點 ${two.f};四下:${JSON.stringify(st)} 翻轉 ${fl}(${cl})`)
  },
  async R(page, s, tag) {
    const rowsInfo = (name) => page.evaluate((sel) => {
      const probe = document.createElement('div'); probe.className = 'bg-neutral-selected'; document.body.appendChild(probe)
      const selectedBg = getComputedStyle(probe).backgroundColor; probe.remove()
      return [...document.querySelectorAll(`${sel} [data-tree-row]`)].map((r) => ({
        id: r.dataset.treeRow, current: r.getAttribute('aria-current'), selected: r.getAttribute('aria-selected'),
        grey: getComputedStyle(r).backgroundColor === selectedBg,
      }))
    }, s.fx(name))
    const marked = (rows) => rows.filter((r) => r.current === 'step').map((r) => r.id).join(',')
    const greyed = (rows) => rows.filter((r) => r.grey).map((r) => r.id).join(',')
    await s.reset('pageless', { selected: 'p1a', expanded: ['p1'] })
    await s.gesture('pageless', 'p1', async () => { const p = await s.textPoint('pageless', 'p1'); await page.mouse.click(p.x, p.y) })
    let rows = await rowsInfo('pageless')
    const p1 = rows.find((r) => r.id === 'p1')
    ck(`R1${tag} 收起含目前那一步的沒頁面大步驟 → 它是唯一的 aria-current="step"、唯一的選中色、沒有 aria-selected`,
      marked(rows) === 'p1' && greyed(rows) === 'p1' && p1?.selected == null, `aria-current:${marked(rows)} 選中色:${greyed(rows)} aria-selected:${p1?.selected}`)
    await s.reset('pageless', { selected: 'p3n1', expanded: [] })
    const outer = await rowsInfo('pageless')
    await s.reset('pageless', { selected: 'p3n1', expanded: ['p3'] })
    const inner = await rowsInfo('pageless')
    ck(`R2${tag} 巢狀:兩層都收著 → 代顯在外層;外層展開、內層收著 → 在內層`,
      marked(outer) === 'p3' && greyed(outer) === 'p3' && marked(inner) === 'p3n' && greyed(inner) === 'p3n',
      `兩層收著:${marked(outer)}/${greyed(outer)};內層收著:${marked(inner)}/${greyed(inner)}`)
    await s.reset('page', { selected: 'h1b', expanded: ['h1'] })
    const before = await rowsInfo('page')
    await s.gesture('page', 'h1', async () => {
      await page.evaluate((sel) => document.querySelector(`${sel} [data-tree-row="h1"] > [role="gridcell"] button[aria-expanded]`).click(), s.fx('page'))
    })
    rows = await rowsInfo('page')
    ck(`R3${tag} 有頁面大步驟收起、目前那一步在裡面 → 沒有任何列代顯`, marked(before) === 'h1b' && marked(rows) === '' && greyed(rows) === '',
      `收起前 ${marked(before)};收起後 aria-current:${marked(rows) || '無'} 選中色:${greyed(rows) || '無'}`)
  },
  async S(page, s, tag) {
    const cdp = await page.context().newCDPSession(page)
    // 無障礙樹:每一列(role=row)的名稱與說明
    const ax = async () => {
      const { nodes } = await cdp.send('Accessibility.getFullAXTree')
      const out = {}
      for (const n of nodes) {
        if (n.role?.value !== 'row') continue
        out[n.name?.value ?? ''] = n.description?.value ?? ''
      }
      return out
    }
    const statusOf = (name) => page.evaluate((sel) => {
      const color = (cls) => { const p = document.createElement('span'); p.className = cls; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c }
      const ok = color('text-success'); const err = color('text-error'); const dis = color('text-fg-disabled')
      const out = {}
      for (const r of document.querySelectorAll(`${sel} [data-tree-row]`)) {
        const svg = r.querySelector('[data-tree-status] svg')
        const visible = svg && getComputedStyle(svg).display !== 'none' && svg.getBoundingClientRect().width > 0
        const c = visible ? getComputedStyle(svg).color : ''
        const cls = visible ? svg.getAttribute('class') ?? '' : ''
        const icon = !visible ? '' : /circle-check/.test(cls) ? 'check' : /circle-x|x-circle/.test(cls) ? 'x' : `?${cls}`
        out[r.dataset.treeRow] = visible ? `${icon}:${c === ok ? 'success' : c === err ? 'error' : c === dis ? 'disabled' : c}` : ''
      }
      return out
    }, s.fx(name))
    await s.reset('pageless', { selected: 'p2a', expanded: [] })
    const collapsedVis = await statusOf('pageless'); const collapsedAx = await ax()
    await s.reset('pageless', { selected: 'p2a', expanded: ['p1', 'p2'] })
    const openVis = await statusOf('pageless'); const openAx = await ax()
    const want1 = collapsedVis.p1 === 'check:success' && collapsedVis.p2 === 'x:error' && collapsedVis.p3 === '' &&
      collapsedAx['1. 商家資料'] === '全部已完成' && collapsedAx['2. 收款設定'] === '其中有錯誤' && collapsedAx['3. 門市設定'] === ''
    const want2 = openVis.p1 === '' && openVis.p2 === '' && openVis.p1a === 'check:success' && openVis.p2a === 'x:error' && openVis.p2b === '' &&
      openAx['1. 商家資料'] === '' && openAx['公司基本資料'] === '已完成' && openAx['收款銀行帳戶'] === '錯誤' && openAx['撥款週期'] === ''
    ck(`S1${tag} 沒頁面大步驟:收起代顯(全部成功綠勾「全部已完成」/ 任一失敗紅叉「其中有錯誤」/ 有沒結果的不畫)、展開不畫;子步驟畫自己的(無障礙樹的說明)`,
      want1 && want2, `收起:${JSON.stringify(collapsedVis)} ${JSON.stringify(collapsedAx)};展開:${JSON.stringify(openVis)} ${JSON.stringify(openAx)}`)
    await s.reset('page', { selected: 'h3', expanded: [] })
    const pc = await statusOf('page'); const pcAx = await ax()
    await s.reset('page', { selected: 'h3', expanded: ['h1'] })
    const po = await statusOf('page'); const poAx = await ax()
    ck(`S2${tag} 有頁面大步驟:展開、收起都只畫自己的(建置 = 錯誤、部署 = 已完成)`,
      pc.h1 === 'x:error' && pc.h2 === 'check:success' && po.h1 === 'x:error' && pcAx['建置'] === '錯誤' && poAx['建置'] === '錯誤' && pcAx['部署'] === '已完成' &&
        po.h1b === 'x:error' && poAx['執行單元測試'] === '錯誤',
      `收起:${JSON.stringify(pc)} ${JSON.stringify(pcAx)};展開 建置:${JSON.stringify(po)} ${JSON.stringify(poAx)}`)
    // 並排:滑過有按鈕的那一列
    await s.reset('pageless', { selected: 'p2a', expanded: ['p1'] })
    const pt = await s.textPoint('pageless', 'p1a')
    await page.mouse.move(pt.x, pt.y)
    const side = await page.waitForFunction((sel) => {
      const row = document.querySelector(`${sel} [data-tree-row="p1a"]`)
      const actions = row?.querySelector(':scope > [data-tree-actions]')
      const svg = row?.querySelector('[data-tree-status] svg')
      if (!actions || !svg || Number(getComputedStyle(actions).opacity) !== 1 || actions.getAnimations().length) return null
      const a = actions.getBoundingClientRect(); const b = svg.getBoundingClientRect()
      return { statusRight: b.right, actionsLeft: a.left, statusW: b.width, overlap: !(b.right <= a.left || a.right <= b.left) }
    }, s.fx('pageless'), { timeout: 3_000, polling: 'raf' }).then((h) => h.jsonValue(), () => null)
    await page.mouse.move(0, 0)
    ck(`S3${tag} 列尾結果與滑過才出現的按鈕並排(都看得到、不重疊、結果在按鈕左邊)`, !!side && !side.overlap && side.statusRight <= side.actionsLeft && side.statusW > 0,
      JSON.stringify(side))
    // 停用 × 結果(2026-10-21,r1b TV-04):送出後鎖住的步驟,勾 / 叉都是停用色(M24 disabled > 其他),形狀照舊分得出來
    // 夾具裡沒有這棵樹 = 沒有任何 story 畫出「停用 × 結果」這一格(修前就是這樣)—— 那是要紅的產品缺口,不是儀器失效
    const hasLocked = await page.evaluate((sel) => !!document.querySelector(sel), s.fx('locked'))
    if (!hasLocked) ck(`S4${tag} 停用的列:成功 / 失敗都是停用色、靠形狀分辨(勾 / 叉)`, false, '夾具沒有「已送出的開通申請」那棵樹:停用 × 步驟結果沒有任何 story 畫出來')
    else {
      await s.reset('locked', { selected: null, expanded: ['lk'] })
      const lk = await statusOf('locked')
      ck(`S4${tag} 停用的列:成功 / 失敗都是停用色、靠形狀分辨(勾 / 叉)`, lk.lk1 === 'check:disabled' && lk.lk2 === 'x:disabled', JSON.stringify(lk))
    }
    await cdp.detach().catch(() => null)
  },
  async K(page, s, tag) {
    const focus = (name, id) => page.evaluate(({ sel, id }) => document.querySelector(`${sel} [data-tree-row="${id}"]`).focus(), { sel: s.fx(name), id })
    const results1 = []
    for (const key of ['Enter', ' ']) {
      await s.reset('pageless', { selected: 'p2a', expanded: ['p2'] })
      await focus('pageless', 'p1')
      await page.keyboard.press(key)
      s.markLast()
      await s.settled('pageless')
      results1.push({ key, st: await s.state('pageless'), f: await s.focusRow() })
    }
    ck(`K1${tag} Enter / 空白鍵從別處到沒頁面大步驟 → 第一個子步驟、展開、焦點跟過去`,
      results1.every((r) => r.st.selected === 'p1a' && r.st.expanded === 'p1,p2' && r.f === 'p1a'), JSON.stringify(results1))
    await s.reset('pageless', { selected: 'p1b', expanded: [] })
    await focus('pageless', 'p1')
    await page.keyboard.press('Enter'); s.markLast(); await s.settled('pageless')
    const collapsedInside = await s.state('pageless')
    await s.reset('pageless', { selected: 'p1a', expanded: ['p1'] })
    await focus('pageless', 'p1')
    await page.keyboard.press('Enter'); s.markLast(); await s.settled('pageless')
    const dCell = await s.state('pageless')
    await page.keyboard.press('ArrowLeft'); await s.settled('pageless')
    const left = await s.state('pageless')
    await page.keyboard.press('ArrowRight'); await s.settled('pageless')
    const right = await s.state('pageless')
    ck(`K2${tag} Enter:在裡面但收著 → 不動;D 的那一格 → 不開合;← / → 照舊開合`,
      collapsedInside.expanded === '' && collapsedInside.selected === 'p1b' && dCell.expanded === 'p1' && left.expanded === '' && right.expanded === 'p1',
      `收著:${JSON.stringify(collapsedInside)};D 格:${JSON.stringify(dCell)};←:${left.expanded} →:${right.expanded}`)
  },
  // Tab 停靠點(要在這一頁還沒有任何列拿過焦點時量:記住的列優先於「選中的列」)
  async P(page, s, tag) {
    await s.reset('pageless', { selected: 'p2a', expanded: [] })
    await page.evaluate((sel) => {
      const tree = document.querySelector(`${sel} [role="treegrid"]`)
      if (document.getElementById('__tv_step_before')) return
      const b = document.createElement('button'); b.id = '__tv_step_before'; b.type = 'button'; b.textContent = 'before'
      tree.insertAdjacentElement('beforebegin', b)
    }, s.fx('pageless'))
    await page.focus('#__tv_step_before')
    await page.keyboard.press('Tab')
    const landed = await s.focusRow()
    ck(`P1${tag} 目前那一步藏在收起的沒頁面大步驟裡 → Tab 進樹落在代顯的那一列(aria-current="step")`, landed === 'p2', `落在 ${landed}`)
    await page.evaluate(() => document.getElementById('__tv_step_before')?.remove())
  },
  // 捲動框:樹框只有 110px、內容可捲(側欄裡的長步驟樹)。被帶到的子步驟在這一下才展開的巢狀子樹裡(p3 → p3n → p3n1)
  async L(page, s, tag) {
    const box = s.fx('pageless')
    await page.evaluate((sel) => { const f = document.querySelector(sel); f.style.height = '110px'; f.style.overflowY = 'auto' }, box)
    // 捲動位置也要靜止(列的 scrollIntoView 是瞬間捲,但要等展開動畫之後的那一次)
    const view = async (id) => {
      const handle = await page.waitForFunction(({ sel, id }) => {
        const f = document.querySelector(sel)
        const row = f.querySelector(`[data-tree-row="${id}"]`)
        if (!row || f.getAnimations({ subtree: true }).some((a) => a.playState === 'running')) return null
        const c = f.getBoundingClientRect(); const r = row.getBoundingClientRect()
        const top = c.top + f.clientTop; const bottom = top + f.clientHeight
        const key = `${f.scrollTop}|${Math.round(r.top)}`
        const prev = f.__scrollKey; f.__scrollKey = key
        if (prev !== key) return null
        return { scrollTop: f.scrollTop, scrollable: f.scrollHeight > f.clientHeight, rowTop: Math.round(r.top - top), rowBottom: Math.round(r.bottom - top), boxH: f.clientHeight,
          fullyVisible: r.top >= top - 0.5 && r.bottom <= bottom + 0.5 }
      }, { sel: box, id }, { timeout: 5_000, polling: 'raf' }).then((h) => h.jsonValue(), () => null)
      if (!handle) throw new InstrumentFailure(`${tag} 捲動框裡的「${id}」5 秒內沒有靜止`)
      return handle
    }
    const runs = []
    for (const via of ['click', 'Enter', 'dblclick']) {
      await s.reset('pageless', { selected: 'p2a', expanded: [] })
      await page.evaluate((sel) => { document.querySelector(sel).scrollTop = 0 }, box)
      if (via === 'Enter') {
        await page.evaluate((sel) => document.querySelector(`${sel} [data-tree-row="p3"]`).focus(), box)
        await page.keyboard.press('Enter'); s.markLast()
      } else {
        await s.gesture('pageless', 'p3', async () => { const p = await s.textPoint('pageless', 'p3'); await page.mouse.click(p.x, p.y, { clickCount: via === 'dblclick' ? 2 : 1 }) })
      }
      await s.settled('pageless')
      runs.push({ via, st: await s.state('pageless'), f: await s.focusRow(), v: await view('p3n1') })
    }
    // 鍵盤:最後一個大步驟按 → 展開、馬上 ↓ 進第一個子項(展開動畫還在跑)—— 捲動的機制是所有樹共用的(TreeItem 的焦點捲動)
    await s.reset('pageless', { selected: 'p2a', expanded: [] })
    await page.evaluate((sel) => { const f = document.querySelector(sel); f.scrollTop = 0; f.querySelector('[data-tree-row="p3"]').focus() }, box)
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); s.markLast()
    await s.settled('pageless')
    const kbd = { f: await s.focusRow(), v: await view('p3n') }
    await page.evaluate((sel) => { const f = document.querySelector(sel); f.style.height = ''; f.style.overflowY = ''; f.scrollTop = 0 }, box)
    ck(`L1${tag} 捲動框裡點 / Enter / 雙擊收著的沒頁面大步驟 → 被帶到的子步驟(剛展開的巢狀子樹裡)等動畫結束後完整在框內、焦點在它`,
      runs.every((r) => r.st.selected === 'p3n1' && r.f === 'p3n1' && r.v.scrollable && r.v.scrollTop > 0 && r.v.fullyVisible),
      JSON.stringify(runs))
    ck(`L2${tag} 捲動框裡在最後一個大步驟按 → 馬上 ↓(展開動畫還在跑)→ 焦點那一列等動畫結束後完整在框內`,
      kbd.f === 'p3n' && kbd.v.scrollable && kbd.v.scrollTop > 0 && kbd.v.fullyVisible, JSON.stringify(kbd))
  },
  async F(page, s, tag) {
    await s.reset('plain', { selected: 'f2', expanded: [] })
    await s.gesture('plain', 'f1', async () => { const p = await s.textPoint('plain', 'f1'); await page.mouse.click(p.x, p.y) })
    const st = await s.state('plain')
    const dom = await page.evaluate((sel) => ({
      current: document.querySelectorAll(`${sel} [aria-current]`).length,
      slots: document.querySelectorAll(`${sel} [data-tree-status]`).length,
      described: document.querySelectorAll(`${sel} [data-tree-row][aria-describedby]`).length,
    }), s.fx('plain'))
    ck(`F1${tag} 一般樹(沒開 expandOnSelect):點資料夾文字只選取不展開、沒有 aria-current、沒有結果槽`,
      st.selected === 'f1' && st.expanded === '' && dom.current === 0 && dom.slots === 0 && dom.described === 0, `${JSON.stringify(st)} ${JSON.stringify(dom)}`)
  },
}

// 本 repo 的 Chromium 是 --single-process(lib/launch-browser.mjs SANDBOX_ARGS):一個瀏覽器只開得了一個 context,
// 關掉它也會連瀏覽器一起收掉(2026-10-07 實測:第二個 newContext / 關掉後的 newPage 都是「Target page, context or browser has been closed」)。
// 所以滑鼠與鍵盤用一個瀏覽器的一個 context;觸控另起一個瀏覽器(context 開 hasTouch —— 開了觸控的 context 裡 Tailwind v4 的 hover:
// 變體不成立(它包在 @media (hover: hover) 裡),「滑過才出現的按鈕」量不到,所以不能共用)。每一輪開新的 page 掛自己的 init script,
// 量完導到 about:blank,不關。
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
let touchContext = null

async function freshPage(initScript, touch = false) {
  if (touch && !touchContext) touchContext = await (await launchBrowser()).newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true })
  const page = await (touch ? touchContext : context).newPage()
  await page.addInitScript(RECORDER)
  if (initScript) await page.addInitScript(initScript)
  return page
}

async function runFixture(theme, sections, initScript = null) {
  const tag = `[${theme}]`
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(FIXTURE)}&viewMode=story&globals=theme:${theme}`
  for (const touch of [false, true]) {
    const mine = sections.filter((x) => (x === 'T') === touch)
    if (mine.length === 0) continue
    const page = await freshPage(initScript, touch)
    await openStory(page, url, { waitFor: '[data-step-fixture="plain"] [data-tree-row="f2"]', settleFrames: 5, notFound: server.notFound })
    const s = makeSession(page, tag)
    for (const name of mine) await SECTIONS[name](page, s, tag)
    await page.goto('about:blank').catch(() => null)
  }
}

async function runShowcase(theme) {
  const tag = `[${theme}]`
  const page = await freshPage(null)
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(SHOWCASE)}&viewMode=story&globals=theme:${theme}`
  await openStory(page, url, { waitFor: '[role="treegrid"][aria-label="收款帳戶開通步驟"] [data-tree-row="merchant"]', settleFrames: 5, notFound: server.notFound })
  const before = await page.evaluate(() => {
    const row = document.querySelector('[data-tree-row="merchant"]')
    return { result: row.querySelector('[data-tree-status]')?.dataset.treeStatus, desc: document.getElementById(row.getAttribute('aria-describedby') ?? '')?.textContent ?? '' }
  })
  const pt = await page.evaluate(() => {
    const row = document.querySelector('[data-tree-row="merchant"]')
    const b = document.getElementById(row.getAttribute('aria-labelledby')).getBoundingClientRect()
    return { x: b.left + 16, y: b.top + b.height / 2 }
  })
  await page.mouse.click(pt.x, pt.y)
  const after = await page.waitForFunction(() => {
    // 看得到的那一頁的標題(2026-10-21 起每一頁都一直掛著、只露出目前那一頁 —— 只取第一個 h3 會永遠讀到第一頁,M37)
    const heading = [...document.querySelectorAll('section[aria-label="目前步驟"] h3')].find((h) => h.getClientRects().length > 0)?.textContent
    const sel = document.querySelector('[role="treegrid"][aria-label="收款帳戶開通步驟"] [aria-selected="true"]')?.dataset.treeRow
    return heading === '公司基本資料' && sel === 'company' ? { heading, sel } : null
  }, null, { timeout: 5_000, polling: 'raf' }).then((h) => h.jsonValue(), () => null)
  ck(`V1${tag} 展示層「步驟引導」:「1. 商家資料」收著代顯紅叉「其中有錯誤」;點它 → 到「公司基本資料」、右邊換成那一頁`,
    before.result === 'error' && before.desc === '其中有錯誤' && !!after, `前:${JSON.stringify(before)} 後:${JSON.stringify(after)}`)

  // ── V2–V4(2026-10-21,r1b TV-01 / TV-02)──
  /** 看得到的那一頁:標題、aria-invalid 幾欄、錯誤訊息 */
  const pageNow = () => page.evaluate(() => {
    const section = document.querySelector('section[aria-label="目前步驟"]')
    const visible = (el) => el.getClientRects().length > 0
    const form = [...section.querySelectorAll('form')].find(visible)
    return {
      heading: form?.querySelector('h3')?.textContent ?? null,
      invalid: form ? [...form.querySelectorAll('[aria-invalid="true"]')].filter(visible).length : 0,
      errors: form ? [...form.querySelectorAll('[role="alert"], [id$="-error"], [data-field-error]')].filter(visible).map((e) => e.textContent.trim()).filter(Boolean) : [],
    }
  })
  const rowPoint = (id) => page.evaluate((id) => {
    const row = document.querySelector(`[role="treegrid"][aria-label="收款帳戶開通步驟"] [data-tree-row="${id}"]`)
    if (!row) return null
    const b = document.getElementById(row.getAttribute('aria-labelledby')).getBoundingClientRect()
    return { x: b.left + 16, y: b.top + b.height / 2 }
  }, id)
  const waitHeading = (want) => page.waitForFunction((want) => {
    const h = [...document.querySelectorAll('section[aria-label="目前步驟"] form')].find((f) => f.getClientRects().length > 0)?.querySelector('h3')?.textContent
    return h === want
  }, want, { timeout: 5_000, polling: 'raf' }).then(() => true, () => false)
  const clickRow = async (id, wantHeading) => {
    // 等樹裡的展開 / 收合動畫跑完再取點(動畫中列還在移動,點下去可能落在別列)
    await page.waitForFunction(() => !document.querySelector('[role="treegrid"][aria-label="收款帳戶開通步驟"]')?.getAnimations({ subtree: true }).some((a) => a.playState === 'running'), null, { timeout: 5_000, polling: 'raf' }).catch(() => null)
    const p = await rowPoint(id)
    if (!p) throw new InstrumentFailure(`${tag} 步驟引導找不到樹上的「${id}」那一列`)
    await page.mouse.click(p.x, p.y)
    if (!(await waitHeading(wantHeading))) throw new InstrumentFailure(`${tag} 步驟引導點「${id}」之後右邊沒有換成「${wantHeading}」`)
    await page.mouse.move(0, 0)
  }
  // V2:「1. 商家資料」已展開、目前在「公司基本資料」(上一段 V1 點的)→ 點「負責人身分驗證」
  await clickRow('owner', '負責人身分驗證')
  const v2 = await pageNow()
  ck(`V2${tag} 範例一開始就有紅叉的「負責人身分驗證」:點開那一頁,頁上看得到錯誤(aria-invalid + 錯誤訊息)`, v2.invalid >= 1 && v2.errors.length >= 1, JSON.stringify(v2))

  // V3:在「收款銀行帳戶」按下一步(空白)→ 沒過;去「撥款週期」再回來 → 錯誤還在
  await page.goto('about:blank').catch(() => null)
  await openStory(page, url, { waitFor: '[role="treegrid"][aria-label="收款帳戶開通步驟"] [data-tree-row="merchant"]', settleFrames: 5, notFound: server.notFound })
  const nextPoint = () => page.evaluate(() => {
    const form = [...document.querySelectorAll('section[aria-label="目前步驟"] form')].find((f) => f.getClientRects().length > 0)
    const btn = form && [...form.querySelectorAll('button')].find((b) => b.textContent.trim() === '下一步')
    if (!btn) return null
    const b = btn.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  const np = await nextPoint()
  if (!np) throw new InstrumentFailure(`${tag} 步驟引導「收款銀行帳戶」那一頁找不到「下一步」`)
  await page.mouse.click(np.x, np.y)
  const failed = await page.waitForFunction(() => document.querySelector('[data-tree-row="bank"] [data-tree-status]')?.dataset.treeStatus === 'error', null, { timeout: 5_000, polling: 'raf' }).then(() => true, () => false)
  const v3a = await pageNow()
  if (!failed || v3a.invalid === 0) throw new InstrumentFailure(`${tag} 步驟引導在「收款銀行帳戶」按下一步沒有失敗(量不到回訪)${JSON.stringify(v3a)}`)
  await clickRow('payout', '撥款週期')
  await clickRow('bank', '收款銀行帳戶')
  const v3 = await pageNow()
  ck(`V3${tag} 送出沒過的「收款銀行帳戶」:換到別頁再回來,錯誤與 aria-invalid 還在(${v3a.invalid} 欄)`, v3.invalid === v3a.invalid && v3.errors.length >= 1, `送出後 ${JSON.stringify(v3a)};回來 ${JSON.stringify(v3)}`)

  // V4:鍵盤在頁面上按「下一步」(撥款週期沒有必填 → 過)與「上一步」→ 焦點在樹上目前那一步
  await clickRow('payout', '撥款週期')
  const focusButton = async (label) => {
    await page.keyboard.press('Shift')
    return page.evaluate((label) => {
      const form = [...document.querySelectorAll('section[aria-label="目前步驟"] form')].find((f) => f.getClientRects().length > 0)
      const btn = form && [...form.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
      btn?.focus()
      return !!btn && document.activeElement === btn
    }, label)
  }
  const focusNow = () => page.evaluate(() => {
    const a = document.activeElement
    return { body: !a || a === document.body, row: a?.getAttribute?.('data-tree-row') ?? null, current: a?.getAttribute?.('aria-current') ?? null }
  })
  if (!(await focusButton('下一步'))) throw new InstrumentFailure(`${tag} 步驟引導聚焦不到「撥款週期」的「下一步」`)
  await page.keyboard.press('Enter')
  const movedNext = await waitHeading('核對資料')
  await page.waitForFunction(() => document.activeElement !== document.body || document.readyState === 'complete', null, { timeout: 2_000 }).catch(() => null)
  const f1 = await focusNow()
  if (!movedNext) throw new InstrumentFailure(`${tag} 步驟引導鍵盤按「下一步」之後沒有換到「核對資料」`)
  if (!(await focusButton('上一步'))) throw new InstrumentFailure(`${tag} 步驟引導聚焦不到「核對資料」的「上一步」`)
  await page.keyboard.press('Enter')
  const movedBack = await waitHeading('撥款週期')
  const f2 = await focusNow()
  if (!movedBack) throw new InstrumentFailure(`${tag} 步驟引導鍵盤按「上一步」之後沒有回到「撥款週期」`)
  ck(`V4${tag} 鍵盤按頁面上的「下一步」/「上一步」換頁 → 焦點在樹上目前那一步(aria-current="step"),不是 <body>`,
    !f1.body && f1.current === 'step' && !f2.body && f2.current === 'step' && f2.row === 'payout', `下一步後 ${JSON.stringify(f1)};上一步後 ${JSON.stringify(f2)}`)
  await page.goto('about:blank').catch(() => null)
}

let instrumentFailure = null
const missed = []
try {
  if (SELFTEST) {
    for (const [name, m] of Object.entries(MUTANTS)) {
      const before = results.length
      await runFixture('light', m.sections, m.script)
      const mine = results.slice(before)
      const notRed = m.mustFail.filter((id) => !mine.some((r) => r.名.startsWith(`${id}[`) && !r.通過))
      if (notRed.length) missed.push(`改壞版「${name}」沒讓 ${notRed.join(', ')} 紅`)
      else console.log(`✓ 改壞版「${name}」→ ${m.mustFail.join(', ')} 紅`)
    }
  } else {
    await runFixture('light', ['P', 'A', 'D', 'G', 'T', 'R', 'S', 'K', 'L', 'F'])
    await runFixture('dark', ['R', 'S'])
    await runShowcase('light')
  }
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError) && !(error instanceof InstrumentFailure)) throw error
  instrumentFailure = error
} finally {
  await touchContext?.browser()?.close().catch(() => null)
  await browser.close().catch(() => null)
  await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 3_000).unref?.())]).catch(() => null)
}

if (!SELFTEST) for (const r of results) console.log(`${r.通過 ? '✓' : '✗'} ${r.名}${r.細節 ? ' | ' + r.細節 : ''}`)
if (instrumentFailure) {
  console.error(`\n✗ ${instrumentFailure instanceof InstrumentFailure ? 'INSTRUMENT-FAIL ' : ''}${instrumentFailure.message}`)
  console.error(`✗ TreeView 步驟導覽${SELFTEST ? '(selftest)' : ''}:儀器失效 —— 這次沒有量完(exit 2,不是產品裁決,也不算通過)`)
  process.exit(2)
}
if (SELFTEST) {
  if (missed.length) { console.log(`\n✗ selftest:\n  ${missed.join('\n  ')}\n  —— 那幾條量具沒在量它宣稱的東西,綠燈不能當證據`); process.exit(1) }
  console.log(`\n✓ selftest:${Object.keys(MUTANTS).length} 個改壞版各自讓指定的條目紅了,量具會紅`)
  process.exit(0)
}
const 失敗 = results.filter((r) => !r.通過)
if (失敗.length > 0) { console.log(`\n✗ ${失敗.length} 條不符`); process.exit(1) }
console.log('\n✓ TreeView 步驟導覽:A2(含捲動框)/ D / 連點保護(滑鼠、觸控、兩下都回報第 1 下;焦點與單擊相同)/ 灰底代顯 / 列尾結果與讀屏說明 / 鍵盤 / 一般樹不受影響,全部符合規格')
process.exit(0)
