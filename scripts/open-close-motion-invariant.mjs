#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 全 DS 由 data-state 驅動的開合動畫(浮層進出場:Tooltip / Popover / HoverCard / DropdownMenu 含子選單 / Dialog / Sheet / FileViewer
 *         的遮罩與本體;原地展開收合:TreeView / Accordion / AgentPanel 思考塊)—— (E) 收起動畫跑完的那一刻,收起後的樣子由 CSS 撐住:
 *         就算 JS 的收尾(Radix Presence 收到 animationend → React 重畫 → 卸載 / hidden)晚到,中間每一格畫面都看不到內容「長回來」;
 *         (R) 使用者要求減少動態時,上述每一個都不播任何開合動畫,開與關都照常完成
 *   紅: --selftest 對每個成員各注入兩種舊形狀 —— 把關閉狀態的填充模式強制改回 none(= 終態只靠 JS 補丁,待辦總帳 T6 修前)、
 *       在減少動態底下用更高權重重新宣告動畫(= T7 修前「守衛輸給 data-[state=…] 權重」)—— E1 / E2 / R1 每個成員都必須紅,少一條沒紅 → exit 1;
 *       修前的建置(68d7860d)直接跑本閘:E1 / E2 / R1 全紅(證據見待辦總帳 T6 / T7 列)
 *   綠: 沒弄壞時必須綠;每個成員都要先證明「量到了」—— 一般模式下真的有收起動畫開始、結束,而且之後元素真的被卸載或隱藏
 *       (JS 收尾確實執行過);減少動態模式下 matchMedia 真的回 reduce、開與關真的完成。量不到 = 儀器失效(exit 2),不是通過
 *
 * 不變式(motion.spec.md「開合動畫:何時播、怎麼收尾」):
 *   **收起後的樣子必須是 CSS 狀態,不得依賴 JS 的時序;減少動態的守衛必須真的生效。**
 *
 * owner:`packages/design-system/src/tokens/motion/motion.spec.md`;共用 SSOT `tokens/motion/overlay-motion.ts`(overlayMotion / surfaceMotion)
 * 與 `tokens/motion/disclosure-motion.ts`(disclosureMotion)。決定來源:`governance/planning/2026-09-25-interaction-and-hover-remediation.md` T6 / T7。
 *
 * **為什麼要「讓 JS 收尾晚到」才量得到(E)**:本機 Chromium 裡 Radix Presence 在 animationend 處理器裡臨時寫上 inline
 * `animation-fill-mode: forwards`、再用 setTimeout 撤掉(@radix-ui/react-presence 1.1.5 dist/index.mjs:76-91;原始碼註解自己寫
 * 「creating a flash of visible content」),17 / 17 次都撐住 —— 所以在本機「看起來」從不閃。user 那邊會閃,代表他的環境裡 JS 收尾落後於
 * CSS 動畫時鐘。要驗的性質是「終態由 CSS 保證、與 JS 時序無關」,所以本閘把頁面上所有 animationend / animationcancel 監聽器延後
 * HANDOFF_DELAY_MS 才執行(= 收尾晚到),再看動畫結束到卸載之間有沒有任何一格內容回來。修前:收合內容整段長回來、浮層回到不透明;
 * 修後:0 格。**這不是量幀時間**(headless 的 rAF 固定 16.7ms,M32 (g)):量的是每一格的狀態與「動畫結束當下」的計算樣式。
 *
 * 量什麼(每個成員):
 *   E0 前提:收起動畫(exit / collapsible-up / accordion-up)在目標元素上開始並結束,之後目標被卸載或隱藏(收尾真的跑過)
 *   E1 動畫結束的當下(capture 階段、任何收尾之前)目標已經看不見:可見面積(與視窗交集)× 累積不透明度 = 0
 *   E2 從動畫結束到目標被卸載 / 隱藏,每一個 rAF 取樣都看不見(且至少取到一格,否則儀器失效)
 *   R0 前提:matchMedia('(prefers-reduced-motion: reduce)') 為真;開與關都完成(目標出現、之後被卸載或隱藏)
 *   R1 整個開 → 關的過程,目標元素上沒有任何開合動畫(enter / exit / collapsible-* / accordion-*)開始
 *
 * story 開不起來 / 前提不成立 = 儀器失效(exit 2,點名成員),不是產品裁決,selftest 也不算「對照組抓到了」。
 *
 * Run: `node scripts/open-close-motion-invariant.mjs`(讀 `<cwd>/storybook-static`;`--build=<dir>` 換建置;`--selftest` 跑對照組)
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError, requireFreshStorybookBuild, exitOnBrowserLaunchFailure } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const ONLY = arg('only', '')
// 收尾晚到多久:200ms ≈ 12 格(rAF 16.7ms)。research 的對照組用 50ms 已重現 4 格整段長回來;這裡取寬,讓「至少取到一格」在慢機器上也成立。
const HANDOFF_DELAY_MS = 200
const DS = 'packages/design-system/src'

// stale-build 守衛(lib/launch-browser.mjs 唯一實作):被驗的是共用 SSOT + 每個成員的元件檔
requireFreshStorybookBuild(BUILD, [
  `${DS}/tokens/motion`, `${DS}/styles/base.css`, `${DS}/styles/tokens.css`, `${DS}/lib/utils.ts`,
  `${DS}/components/TreeView/tree-view.tsx`, `${DS}/components/Accordion/accordion.tsx`, `${DS}/components/AgentPanel/agent-panel.tsx`,
  `${DS}/components/Dialog/dialog.tsx`, `${DS}/components/Sheet/sheet.tsx`, `${DS}/components/FileViewer/file-viewer.tsx`,
  `${DS}/components/Popover/popover.tsx`, `${DS}/components/Tooltip/tooltip.tsx`, `${DS}/components/HoverCard/hover-card.tsx`,
  `${DS}/components/DropdownMenu/dropdown-menu.tsx`,
])

// ── 成員:每一個宣告開合動畫的元件(全 DS grep `animate-in|animate-out|animate-collapsible|animate-accordion` 不截斷,
//    依 tokens/motion/motion.spec.md「開合動畫」消費者表)。target = 播動畫的那個元素(遮罩與本體分開算)。
//    open / close 只用真實操作(點擊、Esc、方向鍵、聚焦),不呼叫元件內部 API。
const PORTALED = 'body > [data-state]'                                   // Dialog / Sheet / FileViewer 的遮罩與本體(Radix Portal 直接掛在 body)
const POPPER = '[data-radix-popper-content-wrapper] > [data-state]'       // Tooltip / Popover / HoverCard / DropdownMenu(含子選單)
const MEMBERS = [
  {
    key: 'TreeView', story: 'design-system-components-treeview-展示--file-browser', target: '[data-tree-children]', exits: 1,
    // 「src」預設展開:點它的收合箭頭 → 收;再點展開箭頭 → 開(R 用)
    prepare: null,
    close: (p) => p.locator('[role="row"][aria-expanded="true"]').first().locator('button[aria-expanded="true"]').click(),
    reopen: (p) => p.locator('[role="row"][aria-expanded="false"]').first().locator('button[aria-expanded="false"]').click(),
  },
  {
    key: 'Accordion', story: 'design-system-components-accordion-展示--faq', target: '[role="region"][data-state]', exits: 1,
    prepare: (p) => p.locator('h3 > button[aria-expanded="false"]').first().click(),
    close: (p) => p.locator('h3 > button[aria-expanded="true"]').first().click(),
  },
  {
    key: 'AgentPanel 思考塊', story: 'design-system-components-agentpanel-設計規格--state-behavior',
    target: 'div[data-state] > button[aria-controls][aria-expanded] ~ [data-state]', exits: 1,
    prepare: null, // 「思考中」那一塊預設展開
    close: (p) => p.locator('button[aria-controls][aria-expanded="true"]', { hasText: '思考' }).first().click(),
    reopen: (p) => p.locator('button[aria-controls][aria-expanded="false"]', { hasText: '思考' }).first().click(),
  },
  {
    key: 'Dialog', story: 'design-system-components-dialog-展示--default', target: PORTALED, exits: 2,
    prepare: (p) => p.locator('button[aria-haspopup="dialog"]').first().click(),
    close: (p) => p.keyboard.press('Escape'),
  },
  {
    key: 'Sheet', story: 'design-system-components-sheet-展示--create-project-right', target: PORTALED, exits: 2,
    prepare: (p) => p.locator('button[aria-haspopup="dialog"]').first().click(),
    close: (p) => p.keyboard.press('Escape'),
  },
  {
    key: 'FileViewer', story: 'design-system-components-fileviewer-展示--open-snapshot', target: PORTALED, exits: 2,
    prepare: null, // 開啟狀態 story
    close: (p) => p.keyboard.press('Escape'),
  },
  {
    // exits: 0 —— Popover 收起**沒有**動畫(既有缺陷,2026-10-07 量到):popover.tsx 在 PopoverPrimitive.Portal 與 Content 之間包了
    // PopoverTitleContext.Provider(eff41482,2026-07-07),Radix Portal 外層那個 Presence(@radix-ui/react-popover dist/index.mjs:110)
    // 的 ref 經 Slot 落在 Provider 上、拿不到節點 → 讀不到 animation-name → 關閉當下整個 Portal 卸載,Content 的收起動畫從沒播過。
    // 沒有收起動畫就不會長回來,所以這裡驗的是「關閉後一格內就看不見、也沒有收起動畫」;哪天收起動畫修好了,
    // 本條會紅在「出現了收起動畫」→ 把 exits 改成 1,讓 E1 / E2 接手驗收尾。
    key: 'Popover', story: 'design-system-components-popover-展示--filter-panel', target: POPPER, exits: 0,
    prepare: (p) => p.locator('button[aria-haspopup="dialog"]').first().click(),
    // 點面板外面關(面板裡的欄位會宣告自己的 Esc 層,第一下 Esc 不一定關面板 —— lib/overlay-escape.ts)
    close: (p) => p.mouse.click(4, 4),
  },
  {
    key: 'Tooltip', story: 'design-system-components-tooltip-展示--default', target: POPPER, exits: 1,
    prepare: null, // 基本用法 story 預設開著一個
    close: (p) => p.keyboard.press('Escape'),
  },
  {
    key: 'HoverCard', story: 'design-system-internal-hovercard-展示--link-preview', target: POPPER, exits: 1,
    // 鍵盤聚焦觸發點 → 等開啟延遲後打開(Radix HoverCard 聚焦即排程開啟)
    prepare: async (p) => { await p.locator('a[data-state]').first().focus() },
    close: (p) => p.keyboard.press('Escape'),
  },
  {
    key: 'DropdownMenu(含子選單)', story: 'design-system-components-dropdownmenu-展示--sub-menu', target: POPPER, exits: 2,
    prepare: async (p) => {
      await p.locator('button[aria-haspopup="menu"]').first().click()
      await waitQuiet(p)
      const sub = p.locator('[role="menu"] [role="menuitem"][aria-haspopup="menu"]').first()
      await sub.focus()
      await p.keyboard.press('ArrowRight')
    },
    // 先 ← 關子選單(子選單收起動畫),再 Esc 關主選單(主選單收起動畫)
    close: async (p) => { await p.keyboard.press('ArrowLeft'); await waitQuiet(p); await p.keyboard.press('Escape') },
  },
]

// ── 頁面內的量具(init script:每次導覽重新掛;在任何頁面程式之前執行) ─────────────────────────────
const INSTRUMENT = () => {
  const FAMILY = /^(enter|exit|collapsible-(up|down)|accordion-(up|down))$/
  const EXIT = /^(exit|collapsible-up|accordion-up)$/
  const orig = EventTarget.prototype.addEventListener
  const origRemove = EventTarget.prototype.removeEventListener
  const wrappedOf = new WeakMap()
  // 讓頁面程式的 animationend / animationcancel 監聽器晚 __handoffDelay 毫秒才執行(= JS 收尾晚到)。延遲在派送當下讀,所以同一頁可切換。
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if ((type === 'animationend' || type === 'animationcancel') && listener) {
      let wrapped = wrappedOf.get(listener)
      if (!wrapped) {
        wrapped = function (event) {
          const call = () => (typeof listener === 'function' ? listener.call(this, event) : listener.handleEvent(event))
          const delay = window.__handoffDelay | 0
          if (delay > 0) setTimeout(call, delay); else return call()
        }
        wrappedOf.set(listener, wrapped)
      }
      return orig.call(this, type, wrapped, options)
    }
    return orig.call(this, type, listener, options)
  }
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    return origRemove.call(this, type, (listener && wrappedOf.get(listener)) || listener, options)
  }
  const visibility = (el) => {
    if (!el.isConnected || el.closest('[hidden]')) return { gone: true }
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return { gone: true }
    const r = el.getBoundingClientRect()
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0))
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))
    let opacity = 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity)
    const area = +(w * h).toFixed(1)
    return { gone: false, area, opacity: +opacity.toFixed(3), height: +r.height.toFixed(2), visible: area > 1 && opacity > 0.01 }
  }
  const state = { armed: false, target: '', starts: [], ends: [], tracked: [] }
  window.__motionProbe = state
  const matches = (el) => !!state.target && el instanceof Element && el.matches(state.target)
  orig.call(window, 'animationstart', (e) => {
    if (!state.armed || !FAMILY.test(e.animationName) || !matches(e.target)) return
    state.starts.push({ name: e.animationName, tag: e.target.tagName, state: e.target.getAttribute('data-state'), t: +performance.now().toFixed(1) })
  }, true)
  orig.call(window, 'animationend', (e) => {
    if (!state.armed || !EXIT.test(e.animationName) || !matches(e.target)) return
    // 當下(capture,任何收尾之前)的樣子 —— 這一刻若看得見,下一格畫出來就是「長回來」
    const rec = { name: e.animationName, tag: e.target.tagName, t: +performance.now().toFixed(1), atEnd: visibility(e.target), samples: [], goneAt: null, el: e.target }
    state.ends.push(rec)
    state.tracked.push(rec)
  }, true)
  const tick = () => {
    for (const rec of state.tracked) {
      if (rec.goneAt != null) continue
      const v = visibility(rec.el)
      if (v.gone) rec.goneAt = +performance.now().toFixed(1)
      else rec.samples.push(v)
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__motionProbeArm = (target) => { state.armed = true; state.target = target; state.starts = []; state.ends = []; state.tracked = [] }
  // R 模式從載入那一刻就開始記(「開啟狀態」類 story 的打開動畫發生在載入時,事後才掛就漏掉)
  const armAtLoad = new URLSearchParams(location.search).get('motionProbeArm')
  if (armAtLoad) window.__motionProbeArm(armAtLoad)
  window.__motionProbeReport = () => ({
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
    starts: state.starts,
    ends: state.ends.map(({ el, ...rest }) => ({ ...rest, visibleSamples: rest.samples.filter((s) => s.visible).length, sampleCount: rest.samples.length, maxHeight: Math.max(0, ...rest.samples.map((s) => s.height)), maxOpacity: Math.max(0, ...rest.samples.map((s) => s.opacity)), samples: undefined })),
    // 開著的目標:在文件裡、沒被隱藏、data-state 不是 closed
    targetsPresent: [...document.querySelectorAll(state.target)].filter((el) => {
      if (el.closest('[hidden]')) return false
      const cs = getComputedStyle(el)
      return cs.display !== 'none' && el.getAttribute('data-state') !== 'closed'
    }).length,
    // 還看得到的目標(關閉後必須歸零:卸載、hidden 或 display:none)
    targetsShown: [...document.querySelectorAll(state.target)].filter((el) => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none').length,
  })
}

// 對照組(--selftest):舊形狀注入。E:關閉狀態的填充模式強制 none(Radix 的 inline 補丁一併失效)。
// R:減少動態底下用 !important 重新宣告收起 / 打開動畫(= 一條權重贏過守衛的動畫宣告),只作用在成員的目標元素上。
const BREAK = ({ target }) => {
  const install = () => {
    const host = document.head || document.documentElement
    if (!host || document.getElementById('__selftest_motion')) return
    const style = document.createElement('style')
    style.id = '__selftest_motion'
    style.textContent = `[data-state="closed"]{animation-fill-mode:none !important}
@media (prefers-reduced-motion: reduce){
  :is(${target})[data-state="closed"]{animation-name:exit !important;animation-duration:.2s !important;animation-fill-mode:none !important}
  :is(${target}):not([data-state="closed"]){animation-name:enter !important;animation-duration:.2s !important}
}`
    host.appendChild(style)
  }
  new MutationObserver(install).observe(document, { childList: true, subtree: true })
  install()
}

// 等「版面與動畫都停了」:連續 3 格沒有進行中的有限長度動畫(無限動畫不算)。用影格不用毫秒。
async function waitQuiet(page, capMs = 8_000) {
  const ok = await page.waitForFunction(() => {
    const running = document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming?.().endTime))
    window.__quietFrames = running ? 0 : (window.__quietFrames | 0) + 1
    return window.__quietFrames >= 3
  }, null, { timeout: capMs, polling: 'raf' }).then(() => true, () => false)
  return ok
}

const results = []
const ck = (名, 通過, 細節 = '') => { results.push({ 名, 通過, 細節 }) }
const instrument = []

let server
let browser
try {
  server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
  browser = await launchBrowser()
} catch (error) {
  await exitOnBrowserLaunchFailure(error, { cleanup: () => server?.stop() })
}

// 一個 page 走完全部(本 repo 沙箱的 Chromium 是 --single-process:開不了第二個 browser context,lib/launch-browser.mjs 檔頭)。
// init script 每次導覽重新執行;減少動態用 emulateMedia 在同一個 page 上切換。
let page
async function runMember(m, mode) {
  try {
    await page.emulateMedia({ reducedMotion: mode === 'R' ? 'reduce' : 'no-preference' })
    const arm = mode === 'R' ? `&motionProbeArm=${encodeURIComponent(m.target)}` : ''
    const url = `${server.origin}/iframe.html?id=${encodeURIComponent(m.story)}&viewMode=story${arm}`
    await openStory(page, url, { settleFrames: 5, notFound: server.notFound, label: `${m.key}(${m.story})` })
    await page.mouse.move(0, 0)
    const tag = `[${m.key}]`
    if (mode === 'E') {
      if (m.prepare) await m.prepare(page)
      // 等目標真的開著(HoverCard 聚焦後有 700ms 開啟延遲;等元素本身,不用固定睡眠)
      const present = await page.waitForFunction((t) => [...document.querySelectorAll(t)].some((el) => el.getAttribute('data-state') !== 'closed' && !el.closest('[hidden]')), m.target, { timeout: 8_000, polling: 'raf' }).then(() => true, () => false)
      if (!present) return instrument.push(`${tag} E0 打開之後 8 秒內找不到開著的目標元素 ${m.target}`)
      if (!(await waitQuiet(page))) return instrument.push(`${tag} E0 打開之後 8 秒內動畫沒停`)
      await page.evaluate(({ t, d }) => { window.__handoffDelay = d; window.__motionProbeArm(t) }, { t: m.target, d: HANDOFF_DELAY_MS })
      await m.close(page)
      if (m.exits === 0) {
        const gone = await page.waitForFunction(() => window.__motionProbeReport().targetsShown === 0, null, { timeout: 8_000, polling: 'raf' }).then(() => true, () => false)
        if (!gone) return instrument.push(`${tag} E0 關閉之後 8 秒內目標仍看得到`)
        await waitQuiet(page)
        const rep = await page.evaluate(() => window.__motionProbeReport())
        const exitStarts = rep.starts.filter((x) => /^(exit|collapsible-up|accordion-up)$/.test(x.name))
        ck(`E0${tag} 收起沒有動畫 → 關閉當下卸載,沒有可長回來的那一格(收起動畫修好後把 exits 改成 1)`, exitStarts.length === 0,
          exitStarts.length ? `出現了收起動畫 ${exitStarts.map((x) => x.name).join(', ')} —— 改 exits: 1 讓 E1 / E2 驗收尾` : '0 個收起動畫、已卸載')
        return
      }
      // 等:每一個結束的收起動畫都已被卸載 / 隱藏(收尾跑過),而且數量達到預期
      const done = await page.waitForFunction((n) => {
        const r = window.__motionProbe
        return r.ends.length >= n && r.ends.every((e) => e.goneAt != null)
      }, m.exits, { timeout: 8_000, polling: 'raf' }).then(() => true, () => false)
      const rep = await page.evaluate(() => window.__motionProbeReport())
      if (!done) return instrument.push(`${tag} E0 收起動畫 ${rep.ends.length}/${m.exits} 個結束,或結束後 8 秒內沒有被卸載 / 隱藏(starts=${JSON.stringify(rep.starts)})`)
      const atEndVisible = rep.ends.filter((e) => e.atEnd.visible)
      ck(`E1${tag} 收起動畫結束的當下(任何 JS 收尾之前)目標已看不見(終態由 CSS 撐住)`, atEndVisible.length === 0,
        rep.ends.map((e) => `${e.name}:${e.atEnd.gone ? 'gone' : `面積 ${e.atEnd.area} 不透明 ${e.atEnd.opacity} 高 ${e.atEnd.height}`}`).join(' / '))
      const noSample = rep.ends.filter((e) => e.sampleCount === 0)
      if (noSample.length) return instrument.push(`${tag} E2 收尾晚到 ${HANDOFF_DELAY_MS}ms 期間一格都沒取到樣(看不到 ≠ 沒閃)`)
      const flashed = rep.ends.filter((e) => e.visibleSamples > 0)
      ck(`E2${tag} 收尾晚到 ${HANDOFF_DELAY_MS}ms:動畫結束到卸載之間每一格都看不見`, flashed.length === 0,
        rep.ends.map((e) => `${e.name}:${e.visibleSamples}/${e.sampleCount} 格看得見(最高 ${e.maxHeight}px、不透明 ${e.maxOpacity})`).join(' / '))
      return
    }
    // R:減少動態(量具從載入那一刻就在記)
    await page.evaluate(() => { window.__handoffDelay = 0 })
    if (m.prepare) await m.prepare(page)
    const opened = await page.waitForFunction(() => window.__motionProbeReport().targetsPresent > 0, null, { timeout: 8_000, polling: 'raf' }).then(() => true, () => false)
    if (!opened) return instrument.push(`${tag} R0 打開之後找不到開著的目標元素`)
    await waitQuiet(page)
    await m.close(page)
    // 關閉完成 = 目標全部看不到了(卸載 / hidden / display:none);再等動畫與事件都停(animationstart 在下一格才派送)
    const closed = await page.waitForFunction(() => window.__motionProbeReport().targetsShown === 0, null, { timeout: 8_000, polling: 'raf' }).then(() => true, () => false)
    await waitQuiet(page)
    if (m.reopen) {
      await m.reopen(page)
      await page.waitForFunction(() => window.__motionProbeReport().targetsPresent > 0, null, { timeout: 8_000, polling: 'raf' }).catch(() => null)
      await waitQuiet(page)
    }
    const rep = await page.evaluate(() => window.__motionProbeReport())
    if (!rep.reduce) return instrument.push(`${tag} R0 matchMedia(prefers-reduced-motion: reduce) 不成立 —— 模擬沒生效`)
    if (!closed) return instrument.push(`${tag} R0 關閉之後 8 秒內目標仍開著(開關沒完成)`)
    ck(`R1${tag} 減少動態:開與關都沒有播任何開合動畫`, rep.starts.length === 0,
      rep.starts.length ? rep.starts.map((s) => `${s.name}@${s.state}`).join(', ') : '0 個')
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) instrument.push(`[${m.key}] ${error.message}`)
    else instrument.push(`[${m.key}] ${mode} 操作失敗:${String(error?.message || error).split('\n')[0]}`)
  }
}

try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(INSTRUMENT)
  if (SELFTEST) await page.addInitScript(BREAK, { target: [...new Set(MEMBERS.map((m) => m.target))].join(', ') })
  for (const m of MEMBERS) {
    if (ONLY && !m.key.includes(ONLY)) continue
    await runMember(m, 'E')
    await runMember(m, 'R')
  }
} finally {
  await page?.close().catch(() => null)
  await browser.close().catch(() => null)
  await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 3_000).unref?.())]).catch(() => null)
}

for (const r of results) console.log(`${r.通過 ? '✓' : '✗'} ${r.名}${r.細節 ? ' | ' + r.細節 : ''}`)
if (instrument.length) {
  for (const line of instrument) console.error(`✗ INSTRUMENT-FAIL ${line}`)
  console.error(`✗ 開合動畫${SELFTEST ? '(selftest)' : ''}:儀器失效 —— ${instrument.length} 處沒有量到(exit 2,不是產品裁決,也不算通過)`)
  process.exit(2)
}
const members = MEMBERS.filter((m) => !ONLY || m.key.includes(ONLY))
if (SELFTEST) {
  const missed = []
  for (const m of members) for (const id of (m.exits === 0 ? ['R1'] : ['E1', 'E2', 'R1'])) {
    const r = results.find((x) => x.名.startsWith(`${id}[${m.key}]`))
    if (!r || r.通過) missed.push(`${id}[${m.key}]`)
  }
  if (missed.length === 0) { console.log(`\n✓ selftest:舊形狀讓 ${members.length} 個成員的 E1 / E2 / R1 全紅(沒有收起動畫的成員只驗 R1),量具會紅`); process.exit(0) }
  console.log(`\n✗ selftest:${missed.join(', ')} 沒有紅 —— 那幾條量具沒在量它宣稱的東西,綠燈不能當證據`)
  process.exit(1)
}
const 失敗 = results.filter((r) => !r.通過)
if (失敗.length > 0) { console.log(`\n✗ ${失敗.length} 條不符`); process.exit(1) }
console.log(`\n✓ 開合動畫:${members.length} 個成員收起後的樣子由 CSS 撐住(收尾晚到 ${HANDOFF_DELAY_MS}ms 也 0 格長回來),減少動態下不播任何開合動畫`)
process.exit(0)
