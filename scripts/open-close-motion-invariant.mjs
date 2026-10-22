#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 全 DS 由 data-state 驅動的開合動畫(浮層進出場:Tooltip / Popover / HoverCard / DropdownMenu 含子選單 / Dialog / Sheet / FileViewer
 *         的遮罩與本體;原地展開收合:TreeView / Accordion / AgentPanel 思考塊)—— (E) 收起動畫跑完的那一刻,收起後的樣子由 CSS 撐住:
 *         就算 JS 的收尾(Radix Presence 收到 animationend → React 重畫 → 卸載 / hidden)晚到,中間每一格畫面都看不到內容「長回來」;
 *         (R) 使用者要求減少動態時,上述每一個都不播任何開合動畫,開與關都照常完成;箭頭換角度時也不轉;
 *         (E0)關閉時收起動畫真的有播(播完才卸載),不是關閉當下整個消失(待辦總帳 T11:Popover 修前收起從沒播過);
 *         (N)每一種打開方式都播進場動畫,而且第一格與停下來的樣子不同 —— Tooltip 的兩種打開狀態(delayed-open / instant-open)
 *            各量一次(待辦總帳 T10:修前兩種都沒播);
 *         (C)跟著開合旋轉的箭頭,旋轉過渡的時長與曲線 = 它打開的那個東西這一次開 / 關動畫的時長與曲線(motion.spec.md
 *            「展開箭頭跟它打開的東西同步」,AI 建議「乙」、user 2026-10-07 採納,原話見 motion.spec.md)—— 直接量兩個元素的計算樣式,不看 class 名
 *   紅: --selftest 對每個成員注入舊形狀 —— 把關閉狀態的填充模式強制改回 none(= 終態只靠 JS 補丁,待辦總帳 T6 修前)、
 *       在減少動態底下用更高權重重新宣告動畫(= T7 修前「守衛輸給 data-[state=…] 權重」)、把進場 keyframe 換成空的(= 進場有跑但看不出來,
 *       T10 修前幾何判準對不上的樣子)、箭頭過渡改成 0.5s、減少動態下讓箭頭轉 —— E1 / E2 / R1 / N1 / C1 / C2 / R2 各自必須紅,少一條沒紅 → exit 1;
 *       修前的建置(68d7860d)直接跑本閘:E1 / E2 / R1 全紅(證據見待辦總帳 T6 / T7 列);1ef86547 的建置:E0[Popover]、N1[Tooltip ×2]、
 *       C1 / C2(箭頭時長或曲線與內容不同)紅
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
 *   R2 (有箭頭的成員)開與關之間箭頭的角度確實換了(前提),而且箭頭上沒有任何旋轉過渡開始(transitionrun)
 *   E0 關閉後目標被卸載 / 隱藏之前,每個目標都播了收起動畫(收起動畫數 ≥ 成員宣告的 exits);沒播就卸載 = 紅(產品裁決)
 *   N0 前提:目標打開了,而且(有指定時)打開狀態就是要量的那一種(例 Tooltip `delayed-open`)
 *   N1 打開時目標上播了進場動畫(enter / collapsible-down / accordion-down),每一個的第一格(把動畫撥到 0)與停下來之後的樣子
 *      (不透明度 / transform / 高度)不同 —— 只看「有沒有跑」會被「跑了但起點變數沒設」騙過
 *   C1 / C2 (有箭頭的成員)收起 / 打開動畫開始的那一刻,箭頭旋轉過渡的時長與曲線 = 目標動畫的時長與曲線
 *
 * story 開不起來 / 前提不成立 = 儀器失效(exit 2,點名成員),不是產品裁決,selftest 也不算「對照組抓到了」。
 *
 * 箭頭怎麼認:成員的開 / 關動作在點下去之前,把**那一顆**觸發點裡的箭頭標上 `data-motion-probe-chevron`(tagChevron),量具只量它。
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
  `${DS}/components/DropdownMenu/dropdown-menu.tsx`, `${DS}/components/Select/select.tsx`,
])

// ── 成員:每一個宣告開合動畫的元件(全 DS grep `animate-in|animate-out|animate-collapsible|animate-accordion` 不截斷,
//    依 tokens/motion/motion.spec.md「開合動畫」消費者表)。target = 播動畫的那個元素(遮罩與本體分開算)。
//    open / close 只用真實操作(點擊、Esc、方向鍵、聚焦),不呼叫元件內部 API。
const PORTALED = 'body > [data-state]'                                   // Dialog / Sheet / FileViewer 的遮罩與本體(Radix Portal 直接掛在 body)
const POPPER = '[data-radix-popper-content-wrapper] > [data-state]'       // Tooltip / Popover / HoverCard / DropdownMenu(含子選單)
// 把這一次要點的觸發點裡的箭頭標起來(量具只量被標的那一顆;先清掉上一顆)
async function tagChevron(page, trigger) {
  await page.evaluate(() => document.querySelectorAll('[data-motion-probe-chevron]').forEach((el) => el.removeAttribute('data-motion-probe-chevron')))
  // 順便記下點之前的角度(R2 比對「換了角度」用)
  await trigger.locator('svg').last().evaluate((el) => { el.setAttribute('data-motion-probe-chevron', ''); el.setAttribute('data-motion-probe-angle', getComputedStyle(el).rotate) })
  return trigger
}
const MEMBERS = [
  {
    key: 'TreeView', story: 'design-system-components-treeview-展示--file-browser', target: '[data-tree-children]', exits: 1,
    // 「src」預設展開:點它的收合箭頭 → 收;再點展開箭頭 → 開(R 用)
    prepare: null, chevron: true,
    close: async (p) => (await tagChevron(p, p.locator('[role="row"][aria-expanded="true"]').first().locator('button[aria-expanded="true"]'))).click(),
    reopen: async (p) => (await tagChevron(p, p.locator('[role="row"][aria-expanded="false"]').first().locator('button[aria-expanded="false"]'))).click(),
  },
  {
    key: 'Accordion', story: 'design-system-components-accordion-展示--faq', target: '[role="region"][data-state]', exits: 1,
    chevron: true,
    prepare: async (p) => (await tagChevron(p, p.locator('h3 > button[aria-expanded="false"]').first())).click(),
    close: async (p) => (await tagChevron(p, p.locator('h3 > button[aria-expanded="true"]').first())).click(),
  },
  {
    key: 'AgentPanel 思考塊', story: 'design-system-components-agentpanel-設計規格--state-behavior',
    target: 'div[data-state] > button[aria-controls][aria-expanded] ~ [data-state]', exits: 1,
    prepare: null, chevron: true, // 「思考中」那一塊預設展開
    close: async (p) => (await tagChevron(p, p.locator('button[aria-controls][aria-expanded="true"]', { hasText: '思考' }).first())).click(),
    reopen: async (p) => (await tagChevron(p, p.locator('button[aria-controls][aria-expanded="false"]', { hasText: '思考' }).first())).click(),
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
    // N:沒有觸發點可點(開啟狀態 story);打開動畫與 Dialog 同一份 surfaceMotion,N1 由 Dialog / Sheet 代表
    enter: [],
  },
  {
    // 2026-10-13 前 exits: 0 —— popover.tsx 在 PopoverPrimitive.Portal 與 Content 之間包了 PopoverTitleContext.Provider(eff41482),
    // Radix Portal 外層那個 Presence(@radix-ui/react-popover dist/index.mjs:110)的 ref 經 Slot 落在 Provider 上、拿不到節點 →
    // 關閉當下整個 Portal 卸載,收起動畫從沒播過(待辦總帳 T11)。Provider 搬到 Portal 外面之後收起照常播,E0 / E1 / E2 接手。
    key: 'Popover', story: 'design-system-components-popover-展示--filter-panel', target: POPPER, exits: 1,
    prepare: (p) => p.locator('button[aria-haspopup="dialog"]').first().click(),
    // 點面板外面關(面板裡的欄位會宣告自己的 Esc 層,第一下 Esc 不一定關面板 —— lib/overlay-escape.ts)
    close: (p) => p.mouse.click(4, 4),
  },
  {
    key: 'Tooltip', story: 'design-system-components-tooltip-展示--default', target: POPPER, exits: 1,
    prepare: null, // 基本用法 story 預設開著一個
    close: (p) => p.keyboard.press('Escape'),
    // N:Radix Tooltip 的兩種打開狀態各量一次(@radix-ui/react-tooltip dist/index.mjs:103-104)
    enter: [
      // 停留等待後打開 → delayed-open(非 Button 那則沒有預設打開,滑鼠移上去等 --motion-delay-plain)
      { label: 'delayed-open', state: 'delayed-open', story: 'design-system-components-tooltip-展示--non-button-trigger',
        open: (p) => p.locator('#storybook-root span.underline').first().hover() },
      // 焦點打開 → instant-open(先 Esc 收掉預設開著的那一個,再把焦點放到觸發點上)
      { label: 'instant-open', state: 'instant-open',
        before: async (p) => { await p.keyboard.press('Escape') },
        open: (p) => p.locator('#storybook-root button').first().focus() },
    ],
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
  {
    // Popover 的消費者 + 打開浮層的觸發點箭頭(overlayIndicatorMotion):Select 的選單是 SelectMenu 的 PopoverContent
    key: 'Select', story: 'design-system-components-select-展示--modes', target: POPPER, exits: 1, chevron: true,
    prepare: async (p) => (await tagChevron(p, p.locator('#storybook-root [role="combobox"]').first())).click(),
    close: async (p) => { await tagChevron(p, p.locator('#storybook-root [role="combobox"]').first()); await p.keyboard.press('Escape') },
  },
]

// ── 頁面內的量具(init script:每次導覽重新掛;在任何頁面程式之前執行) ─────────────────────────────
const INSTRUMENT = () => {
  const FAMILY = /^(enter|exit|collapsible-(up|down)|accordion-(up|down))$/
  const EXIT = /^(exit|collapsible-up|accordion-up)$/
  const ENTER = /^(enter|collapsible-down|accordion-down)$/
  // 計算樣式的清單值(animation-* / transition-*)依索引對齊(清單短的循環取)
  const pick = (list, i) => { const xs = String(list).split(/,(?![^(]*\))/).map((x) => x.trim()); return xs[i % xs.length] }
  const animTiming = (el, name) => {
    const cs = getComputedStyle(el)
    const i = Math.max(0, String(cs.animationName).split(',').map((x) => x.trim()).indexOf(name))
    return { duration: pick(cs.animationDuration, i), easing: pick(cs.animationTimingFunction, i) }
  }
  const chevronEl = () => document.querySelector('[data-motion-probe-chevron]')
  const chevronTiming = () => {
    const el = chevronEl()
    if (!el) return null
    const cs = getComputedStyle(el)
    const props = String(cs.transitionProperty).split(',').map((x) => x.trim())
    let i = props.findIndex((x) => x === 'rotate')
    if (i < 0) i = props.findIndex((x) => x === 'transform' || x === 'all')
    if (i < 0) return { duration: '0s', easing: 'none', property: cs.transitionProperty, rotate: cs.rotate }
    return { duration: pick(cs.transitionDuration, i), easing: pick(cs.transitionTimingFunction, i), property: props[i], rotate: cs.rotate }
  }
  // transform 的單位矩陣與 none 畫面相同,視為同一個(否則「動畫跑了但起點變數沒設」會被當成看得見的變化)
  const IDENTITY = /^matrix\(1, 0, 0, 1, 0, 0\)$|^matrix3d\(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1\)$/
  const look = (el) => { const cs = getComputedStyle(el); return { opacity: cs.opacity, transform: IDENTITY.test(cs.transform) ? 'none' : cs.transform, height: +el.getBoundingClientRect().height.toFixed(1) } }
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
  const state = { armed: false, target: '', starts: [], ends: [], tracked: [], enters: [], chevronRuns: [] }
  window.__motionProbe = state
  const matches = (el) => !!state.target && el instanceof Element && el.matches(state.target)
  orig.call(window, 'animationstart', (e) => {
    if (!state.armed || !FAMILY.test(e.animationName) || !matches(e.target)) return
    const rec = { name: e.animationName, tag: e.target.tagName, state: e.target.getAttribute('data-state'), t: +performance.now().toFixed(1),
      timing: animTiming(e.target, e.animationName), chevron: chevronTiming() }
    state.starts.push(rec)
    if (ENTER.test(e.animationName)) {
      // 第一格:把這個動畫撥到 0 讀樣子,再撥回原處(同步完成,中間不會畫出任何一格)
      const anim = e.target.getAnimations().find((a) => a.animationName === e.animationName)
      let from = null
      if (anim) { const t = anim.currentTime; anim.currentTime = 0; from = look(e.target); anim.currentTime = t }
      state.enters.push({ ...rec, from, el: e.target })
    }
  }, true)
  // 箭頭的旋轉過渡有沒有開始(減少動態下必須 0 個)
  orig.call(window, 'transitionrun', (e) => {
    if (!state.armed || !(e.target instanceof Element) || !e.target.hasAttribute('data-motion-probe-chevron')) return
    if (!/^(rotate|transform)$/.test(e.propertyName)) return
    state.chevronRuns.push({ property: e.propertyName, t: +performance.now().toFixed(1) })
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
  window.__motionProbeArm = (target) => { state.armed = true; state.target = target; state.starts = []; state.ends = []; state.tracked = []; state.enters = []; state.chevronRuns = [] }
  // R 模式從載入那一刻就開始記(「開啟狀態」類 story 的打開動畫發生在載入時,事後才掛就漏掉)
  const armAtLoad = new URLSearchParams(location.search).get('motionProbeArm')
  if (armAtLoad) window.__motionProbeArm(armAtLoad)
  window.__motionProbeReport = () => ({
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
    starts: state.starts,
    ends: state.ends.map(({ el, ...rest }) => ({ ...rest, visibleSamples: rest.samples.filter((s) => s.visible).length, sampleCount: rest.samples.length, maxHeight: Math.max(0, ...rest.samples.map((s) => s.height)), maxOpacity: Math.max(0, ...rest.samples.map((s) => s.opacity)), samples: undefined })),
    // 進場:第一格 vs 現在(呼叫時已停下來)的樣子
    enters: state.enters.map(({ el, ...rest }) => ({ ...rest, rest: el.isConnected ? look(el) : null })),
    chevronRuns: state.chevronRuns,
    chevronNow: chevronTiming(),
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
// R:減少動態底下用 !important 重新宣告收起 / 打開動畫(= 一條權重贏過守衛的動畫宣告),只作用在成員的目標元素上;箭頭在減少動態下照轉(R2)。
// N:進場 keyframe 換成空的(動畫照跑、看不出變化 = T10 修前「判準對不上、起點變數沒設」的樣子)。
// C:箭頭的過渡時長改 0.5s(與內容不同步)。
const BREAK = ({ target }) => {
  const install = () => {
    const host = document.head || document.documentElement
    const existing = document.getElementById('__selftest_motion')
    // 同名 @keyframes 是「文件順序最後一個」生效:注入的那份必須一直排在頁面樣式表之後(head 出現後搬過去、之後被擠到前面就再搬到最後)
    if (existing) { if (document.head && document.head.lastElementChild !== existing) document.head.appendChild(existing); return }
    if (!host) return
    const style = document.createElement('style')
    style.id = '__selftest_motion'
    style.textContent = `[data-state="closed"]{animation-fill-mode:none !important}
@keyframes enter{from{}to{}}
@keyframes collapsible-down{from{}to{}}
@keyframes accordion-down{from{}to{}}
@media (prefers-reduced-motion: no-preference){
  [data-motion-probe-chevron]{transition-duration:.5s !important}
}
@media (prefers-reduced-motion: reduce){
  :is(${target})[data-state="closed"]{animation-name:exit !important;animation-duration:.2s !important;animation-fill-mode:none !important}
  :is(${target}):not([data-state="closed"]){animation-name:enter !important;animation-duration:.2s !important}
  [data-motion-probe-chevron]{transition:rotate .2s linear !important}
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

// 時長 / 曲線比對:計算樣式的字串正規化(關鍵字換成 cubic-bezier,秒換毫秒)
const EASE_KEYWORD = { ease: 'cubic-bezier(0.25,0.1,0.25,1)', 'ease-in': 'cubic-bezier(0.42,0,1,1)', 'ease-out': 'cubic-bezier(0,0,0.58,1)', 'ease-in-out': 'cubic-bezier(0.42,0,0.58,1)', linear: 'cubic-bezier(0,0,1,1)' }
const normEase = (x) => { const v = String(x ?? '').replace(/\s+/g, ''); return EASE_KEYWORD[v] ?? v }
const toMs = (x) => { const v = String(x ?? '').trim(); return v.endsWith('ms') ? parseFloat(v) : v.endsWith('s') ? parseFloat(v) * 1000 : NaN }
const sameTiming = (a, b) => !!a && !!b && toMs(a.duration) === toMs(b.duration) && toMs(a.duration) > 0 && normEase(a.easing) === normEase(b.easing)
const fmtTiming = (x) => (x ? `${x.duration} ${x.easing}` : '缺')

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
      // 等:每一個結束的收起動畫都已被卸載 / 隱藏(收尾跑過),而且數量達到預期 —— 或者目標已經全部看不到、收起動畫卻不夠數
      // (關閉當下就卸載 = 收起沒播,產品裁決,不是儀器失效;T11 Popover 修前就是這樣)
      const outcome = await page.waitForFunction((n) => {
        const r = window.__motionProbe
        if (r.ends.length >= n && r.ends.every((e) => e.goneAt != null)) return 'ended'
        const exitStarts = r.starts.filter((x) => /^(exit|collapsible-up|accordion-up)$/.test(x.name)).length
        if (window.__motionProbeReport().targetsShown === 0 && exitStarts < n && r.ends.every((e) => e.goneAt != null)) return 'unmounted'
        return false
      }, m.exits, { timeout: 8_000, polling: 'raf' }).then((h) => h.jsonValue(), () => null)
      if (outcome === 'unmounted') await waitQuiet(page)
      const rep = await page.evaluate(() => window.__motionProbeReport())
      const exitStarts = rep.starts.filter((x) => /^(exit|collapsible-up|accordion-up)$/.test(x.name))
      if (outcome === 'unmounted') {
        ck(`E0${tag} 關閉時收起動畫有播(播完才卸載,不是關閉當下整個消失)`, false, `收起動畫 ${exitStarts.length}/${m.exits} 個就已卸載 / 隱藏`)
        return
      }
      if (outcome !== 'ended') return instrument.push(`${tag} E0 收起動畫 ${rep.ends.length}/${m.exits} 個結束,或結束後 8 秒內沒有被卸載 / 隱藏(starts=${JSON.stringify(rep.starts)})`)
      ck(`E0${tag} 關閉時收起動畫有播(播完才卸載,不是關閉當下整個消失)`, true, `${exitStarts.map((x) => x.name).join(', ')}`)
      if (m.chevron) {
        const x = exitStarts[0]
        if (!x?.chevron) return instrument.push(`${tag} C1 收起動畫開始時找不到被標記的箭頭(tagChevron 沒標到)`)
        ck(`C1${tag} 收起:箭頭旋轉過渡的時長與曲線 = 收起動畫的時長與曲線`, sameTiming(x.chevron, x.timing),
          `箭頭 ${fmtTiming(x.chevron)}(${x.chevron.property})/ ${x.name} ${fmtTiming(x.timing)}`)
      }
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
    if (m.chevron) {
      // 關的那一下標記的箭頭:點之前(開著)與之後(關了)的角度必須不同,否則根本沒量到「換角度」
      const [angleOpen, angleClosed] = await page.evaluate(() => { const el = document.querySelector('[data-motion-probe-chevron]'); return el ? [el.getAttribute('data-motion-probe-angle'), getComputedStyle(el).rotate] : [null, null] })
      if (angleOpen == null || angleClosed == null) return instrument.push(`${tag} R2 找不到被標記的箭頭`)
      if (angleOpen === angleClosed) return instrument.push(`${tag} R2 關閉前後箭頭角度都是 ${angleOpen} —— 這一次沒有換角度,量不到`)
      ck(`R2${tag} 減少動態:箭頭換角度(${angleOpen} → ${angleClosed})時不轉`, rep.chevronRuns.length === 0,
        rep.chevronRuns.length ? rep.chevronRuns.map((r) => r.property).join(', ') + ' 過渡開始' : '0 個旋轉過渡')
    }
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) instrument.push(`[${m.key}] ${error.message}`)
    else instrument.push(`[${m.key}] ${mode} 操作失敗:${String(error?.message || error).split('\n')[0]}`)
  }
}

// N:打開(進場)。每一種打開方式一筆;沒寫 enter 的成員,有 prepare 就用 prepare 打開,否則先關再 reopen。
const enterCases = (m) => m.enter ?? (m.prepare ? [{ label: '打開', open: m.prepare }] : m.reopen ? [{ label: '重新展開', before: m.close, open: m.reopen }] : [])
async function runEnter(m, e) {
  const tag = `[${m.key}${e.label === '打開' || e.label === '重新展開' ? '' : `・${e.label}`}]`
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const url = `${server.origin}/iframe.html?id=${encodeURIComponent(e.story ?? m.story)}&viewMode=story`
    await openStory(page, url, { settleFrames: 5, notFound: server.notFound, label: `${m.key}(${e.story ?? m.story})` })
    await page.mouse.move(0, 0)
    await page.evaluate(() => { window.__handoffDelay = 0 })
    await waitQuiet(page)
    if (e.before) {
      await e.before(page)
      // 先前開著的要真的收完(卸載 / 隱藏)才開始量,免得把上一個的動畫算進來
      const gone = await page.waitForFunction((t) => ![...document.querySelectorAll(t)].some((el) => el.getAttribute('data-state') !== 'closed' && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none'), m.target, { timeout: 8_000, polling: 'raf' }).then(() => true, () => false)
      if (!gone) return instrument.push(`${tag} N0 前置的關閉 8 秒內沒有完成`)
      await waitQuiet(page)
      // Radix Tooltip:剛關掉 300ms 內再打開會是 instant-open;delayed-open 的那一筆不經過 before,不受影響
    }
    await page.evaluate((t) => window.__motionProbeArm(t), m.target)
    await e.open(page)
    const present = await page.waitForFunction((t) => [...document.querySelectorAll(t)].some((el) => el.getAttribute('data-state') !== 'closed' && !el.closest('[hidden]')), m.target, { timeout: 8_000, polling: 'raf' }).then(() => true, () => false)
    if (!present) return instrument.push(`${tag} N0 打開之後 8 秒內找不到開著的目標元素 ${m.target}`)
    if (!(await waitQuiet(page))) return instrument.push(`${tag} N0 打開之後 8 秒內動畫沒停`)
    const rep = await page.evaluate(() => window.__motionProbeReport())
    if (e.state) {
      const states = await page.evaluate((t) => [...document.querySelectorAll(t)].map((el) => el.getAttribute('data-state')).filter((x) => x !== 'closed'), m.target)
      if (!states.includes(e.state)) return instrument.push(`${tag} N0 要量的打開狀態是 ${e.state},實際 ${states.join(', ') || '無'} —— 量錯對象`)
    }
    const want = m.opens ?? m.exits
    const differs = (x) => !!x.from && !!x.rest && (x.from.opacity !== x.rest.opacity || x.from.transform !== x.rest.transform || Math.abs(x.from.height - x.rest.height) > 0.5)
    const visible = rep.enters.filter(differs)
    ck(`N1${tag} 打開時播了進場動畫,第一格與停下來的樣子不同(${want} 個)`, rep.enters.length >= want && visible.length === rep.enters.length,
      rep.enters.length === 0 ? '0 個進場動畫(打開當下就是最終樣子)'
        : rep.enters.map((x) => `${x.name}@${x.state}:第一格 不透明 ${x.from?.opacity} ${x.from?.transform} 高 ${x.from?.height} → 停下 不透明 ${x.rest?.opacity} ${x.rest?.transform} 高 ${x.rest?.height}`).join(' / '))
    if (m.chevron && rep.enters.length) {
      const x = rep.enters[0]
      if (!x.chevron) return instrument.push(`${tag} C2 進場動畫開始時找不到被標記的箭頭(tagChevron 沒標到)`)
      ck(`C2${tag} 打開:箭頭旋轉過渡的時長與曲線 = 進場動畫的時長與曲線`, sameTiming(x.chevron, x.timing),
        `箭頭 ${fmtTiming(x.chevron)}(${x.chevron.property})/ ${x.name} ${fmtTiming(x.timing)}`)
    }
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) instrument.push(`${tag} ${error.message}`)
    else instrument.push(`${tag} N 操作失敗:${String(error?.message || error).split('\n')[0]}`)
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
    for (const e of enterCases(m)) await runEnter(m, e)
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
  for (const m of members) {
    const ids = ['E1', 'E2', 'R1', ...(m.chevron ? ['C1', 'R2'] : [])]
    for (const id of ids) {
      const r = results.find((x) => x.名.startsWith(`${id}[${m.key}]`))
      if (!r || r.通過) missed.push(`${id}[${m.key}]`)
    }
    // 每一種打開方式的 N1(與有箭頭的 C2)都要紅
    for (const id of ['N1', ...(m.chevron ? ['C2'] : [])]) {
      const want = enterCases(m).length
      const red = results.filter((x) => x.名.startsWith(`${id}[${m.key}`) && !x.通過).length
      if (red < want) missed.push(`${id}[${m.key}](${red}/${want} 紅)`)
    }
  }
  if (missed.length === 0) { console.log(`\n✓ selftest:舊形狀讓 ${members.length} 個成員的 E1 / E2 / R1 / N1(每種打開方式)全紅,有箭頭的成員 C1 / C2 / R2 也紅,量具會紅`); process.exit(0) }
  console.log(`\n✗ selftest:${missed.join(', ')} 沒有紅 —— 那幾條量具沒在量它宣稱的東西,綠燈不能當證據`)
  process.exit(1)
}
const 失敗 = results.filter((r) => !r.通過)
if (失敗.length > 0) { console.log(`\n✗ ${失敗.length} 條不符`); process.exit(1) }
console.log(`\n✓ 開合動畫:${members.length} 個成員打開都播看得見的進場、關閉都播收起動畫,收起後的樣子由 CSS 撐住(收尾晚到 ${HANDOFF_DELAY_MS}ms 也 0 格長回來),減少動態下不播任何開合動畫、箭頭不轉,箭頭與它打開的東西同一個時長與曲線`)
process.exit(0)
