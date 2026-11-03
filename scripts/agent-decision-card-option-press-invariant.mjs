#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: AgentDecisionCard 的灰底選項卡,卡內**每一點**用滑鼠點一下 = 那張卡的控件**恰好切換一次**(複選:勾 ↔ 不勾;單選:被選中),
 *         其他卡不動;「其他」卡的輸入格外框裡點 = 選中「其他」(不會被切掉);卡與卡之間的 8px 點了不選任何一張;
 *         方向鍵選到「其他」、焦點在「其他」上按 Space(單選的圓 / 複選的方框)都不把焦點搶進輸入格,
 *         滑鼠點「其他」卡(輸入格以外)讓它被選中時焦點進輸入格。
 *         量的是控件 aria-checked 在這一下點擊裡**變了幾次**(MutationObserver 逐筆記)與 document.activeElement,不讀 class(M37)。
 *   紅: --selftest 在頁面裡補回三種舊病:點標籤時多一個主人再轉一次給控件(2026-11-03 前「點標籤那一整行切兩次抵銷」)、
 *       點「其他」輸入格外框時多切一次(同日前「外框按下聚焦已選中、放開卡又切掉」)、鍵盤(方向鍵 / Space)選中「其他」的圓後
 *       把焦點拉進輸入格 → 四條檢查(標籤列 / 外框 / 方向鍵 K1 / 單選 Space K3)都必須各自指名紅
 *   綠: 現行 agent-panel.tsx(pressOptionCard:控件與 `<label for>` 自己轉、「其他」外框歸輸入格、其餘由卡轉一次給控件)必須全綠;
 *       修前(108a736f)的建置跑這支:複選三張具名卡的標籤列與「其他」外框全紅、方向鍵 K1 與單選 Space K3 紅(本機實測,見 commit 說明)
 *
 * ── 為什麼有這支 ──
 *
 * user 2026-10-29:「為何多選的那道題目的選項那麼難按？看起來並不是整個灰色的選項區塊都能 toggle checkbox,照理說應該要整塊都能 toggle 才對吧？」
 * 根因:卡的 onClick 把「抵達卡的每一下點擊」都當成「user 指了這張卡」,自己呼叫 toggle;但同一下點擊早已有別的主人 ——
 *   · 標籤 `<label for>`:瀏覽器再轉一次點擊給控件(HTML label 啟動行為)→ 卡切一次 + 控件切一次 = 抵銷(單選同值,看不出)
 *   · 「其他」輸入格的外框:按下時外框把焦點交給輸入格(field-wrapper.tsx focusFieldInputFromChrome)→ onFocus 選中;放開時卡又切一次
 *   · 方向鍵 / 單選圓上按 Space:Radix 以程式 click()、瀏覽器以鍵盤合成的 click 選中單選圓,冒泡到卡 → 卡以為是滑鼠點,
 *     把焦點拉進輸入格(違反 spec「鍵盤方向鍵選中不搶焦點」與 APG radio「Space: checks the focused radio button」—— 焦點不動)
 * 規則:`hit-area-canonical.md` 一-1(滑過有變化的地方點下去必須觸發)、一-4(卡 = 控件的標籤盒子,「點下去等於點控件」);
 * 「其他」卡的聚焦與方向鍵:`agent-decision-card.spec.md`「8. AgentDecisionCard」選項卡條。
 *
 * ── 量法 ──
 *
 * 決策卡三題步進(DecisionCardOpen):第 1 題單選(3 張卡)、第 3 題複選(4 張卡,含「其他」)。
 * 每張卡:格點(複選 8px、單選 12px)+ 每個區域的代表點(控件中心、標籤字中心、說明字中心、卡四角內 2px、「其他」外框四邊的內距中心、
 * 輸入格中心、外框圓角外)。「外框圓角外」不用固定位移:Chromium 圓角的命中判定逐角不同(實測圓角 4px 時左上角往內 0.25–2px
 * 都命中外框本身、右下角往內 1px 仍落在外框外),所以每個角沿對角線往內每 0.25px 找第一個「在外框的矩形裡、elementFromPoint
 * 卻不在外框裡」的點;按下時再斷言它的命中區域是卡(region = card),點位跑回外框裡就紅,不會悄悄變成「輸入格」那一類。
 * 圓角 > 0 卻四個角都找不到 → 儀器失效(exit 2);圓角 = 0 → 沒有這一區,印一行說明。
 * 每一點:先在頁面裡掛 MutationObserver 記全部控件的 aria-checked、記 elementFromPoint 落在哪個區域 → 真滑鼠點一下
 * (page.mouse.click,含 mousedown —— 外框聚焦是按下時發生的)→ 等點擊排的 setTimeout(0) 跑完(FIFO:我們的 setTimeout 排在它後面)
 * → 讀這一下裡每個控件 aria-checked 變了幾次。兩次切換若被 React 合批會是「0 次」,沒合批會是「2 次」,兩種都抓得到。
 * 單選每一點之前目標卡必須是「未選中」,否則這一下看不出效果(交錯點不同卡;必要時先點別張卡的圓)。
 * 格點依序點,點與點之間**不**清焦點 —— 刻意的:「焦點已在輸入格裡、再點外框 / 輸入格」這種狀態也一併量到。代價是修前建置上
 * 「輸入格」那一組的紅有一部分是外框那個病的連帶(外框那一下把「其他」切掉、焦點留在輸入格,下一點點輸入格就不再觸發聚焦即選中),
 * 不代表輸入格本身壞了;要逐區歸因時改用每點先清焦點的量法。
 *
 * 載入:共用 openStory(lib/launch-browser.mjs);換題後 settleAfterInteraction + 等第 3 題的勾選框本身出現。
 * 開不起來 → 儀器失效(exit 2,INSTRUMENT-FAIL),不是產品裁決,也絕不當成通過。
 *
 * Run: `node scripts/agent-decision-card-option-press-invariant.mjs [--selftest] [--static-dir <Storybook 建置>]`
 *      (併在 `npm run test:agent-panel-invariants`;`--static-dir` 預設 ./storybook-static)
 */

import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip, requireFreshStorybookBuild, settleAfterInteraction } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const staticDirArg = process.argv.find((a) => a.startsWith('--static-dir='))?.slice('--static-dir='.length)
  ?? (process.argv.includes('--static-dir') ? process.argv[process.argv.indexOf('--static-dir') + 1] : null)
const STATIC = resolve(staticDirArg ?? join(ROOT, 'storybook-static'))
const STORY_ID = 'design-system-components-agentpanel-展示--decision-card-open'
const SELFTEST = process.argv.includes('--selftest')
/** 格點間距(px)。複選是病發處,密一點;單選切兩次同值,這裡量的是「每一點都命中這張卡」。 */
const STEP = { checkbox: 8, radio: 12 }
const CARD = '[class~="group/agent-option"]'
const CONTROL = '[role="checkbox"], [role="radio"]'
const OTHER_INPUT = 'input[aria-label="其他(自由輸入)"]'

// 建置存在、且不比被驗的原始碼舊:lib/launch-browser.mjs requireFreshStorybookBuild(全部瀏覽器閘同一份;2026-09-27,待辦總帳 C5)。
// 列的是這支量到的行為的原始碼:選項卡的點擊歸屬(agent-panel.tsx pressOptionCard)、「容器裡自有行為的東西」判準(pointer-press.ts)、
// 「其他」外框按下聚焦輸入格(field-wrapper.tsx focusFieldInputFromChrome)、標籤 `<label for>`(selection-item.tsx)。
requireFreshStorybookBuild(STATIC, [
  'packages/design-system/src/components/AgentPanel/agent-panel.tsx',
  'packages/design-system/src/lib/pointer-press.ts',
  'packages/design-system/src/components/Field/field-wrapper.tsx',
  'packages/design-system/src/components/SelectionControl/selection-item.tsx',
])

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const BASE = server.origin
const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })

const failures = []
const passes = []
const groups = new Map()
/** 同一組(卡 × 區域 × 結果)只記一行,附點數與前幾個座標,輸出才讀得完。 */
const tally = (key, pass, detail) => {
  const g = groups.get(key) ?? { pass, n: 0, where: [], detail }
  g.n += 1
  if (g.where.length < 6) g.where.push(detail)
  groups.set(key, g)
}
const record = (id, label, pass, detail = '') =>
  pass ? passes.push(`✓ ${id} | ${label}`) : failures.push(`✗ ${id} | ${label} | ${detail}`)

/**
 * 對照組:把三種舊病補回頁面(只在 --selftest)。都用頁面層的監聽器加「多一個主人」,不改元件原始碼 ——
 * 量具若抓不到這三種,就抓不到它們回來。
 */
const injectFaults = (page) => page.addScriptTag({ content: `
  (() => {
    const CARD = ${JSON.stringify(CARD)}
    const CONTROL = ${JSON.stringify(CONTROL)}
    // ① 標籤:指標點在標籤上,除了瀏覽器的轉發,再多一個主人轉一次給控件(舊版卡的 onClick 自己 toggle)
    document.addEventListener('click', (e) => {
      if (!e.isTrusted || e.detail === 0 || !(e.target instanceof Element)) return
      const label = e.target.closest('label')
      const card = label && label.closest(CARD)
      if (card) queueMicrotask(() => card.querySelector(CONTROL).click())
    }, true)
    // ② 「其他」外框:按在外框(不是輸入格本身)放開時多切一次(舊版:外框按下聚焦已選中、卡放開又切掉)
    document.addEventListener('click', (e) => {
      if (!e.isTrusted || !(e.target instanceof Element)) return
      const input = document.querySelector(${JSON.stringify(OTHER_INPUT)})
      const chrome = input && input.closest('[data-field-mode]')
      if (!chrome || e.target === input || !chrome.contains(e.target)) return
      const card = chrome.closest(CARD)
      if (card) queueMicrotask(() => card.querySelector(CONTROL).click())
    }, true)
    // ③ 鍵盤:方向鍵(Radix 程式 click())或 Space(鍵盤合成 click)選中「其他」的圓之後把焦點拉進輸入格(舊版:冒泡到卡,卡當成滑鼠點)
    document.addEventListener('click', (e) => {
      if (e.detail !== 0 || !(e.target instanceof Element) || e.target.getAttribute('role') !== 'radio') return
      const card = e.target.closest(CARD)
      const input = card && card.querySelector(${JSON.stringify(OTHER_INPUT)})
      if (input) setTimeout(() => input.focus(), 0)
    }, true)
  })()
` })

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const url = `${BASE}/iframe.html?id=${encodeURIComponent(STORY_ID)}&viewMode=story`
try {
  await openStory(page, url, { waitFor: CARD, settleFrames: 10, notFound: server.notFound, beforeSettle: SELFTEST ? injectFaults : null })
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  console.error(`✗ ${error.message}`)
  console.error('✗ 決策卡選項卡逐點命中:儀器失效 —— 這次什麼都沒量到(exit 2,不是產品裁決,也不算通過)')
  await browser.close()
  await server.stop()
  process.exit(2)
}

/** 點擊排的 setTimeout(0)(「其他」聚焦)跑完、React 已重畫 —— 用排序保證,不是猜時間:我們的 setTimeout 排在它後面。 */
const flush = () => page.evaluate(() => new Promise((r) => setTimeout(() => setTimeout(r, 0), 0)))

/** 卡片幾何 + 每個區域的代表點(頁面座標)。 */
const readCards = () => page.evaluate(({ CARD, CONTROL, OTHER_INPUT }) => {
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  const textCenter = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const r = range.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }
  const cornerReport = []
  const cards = [...document.querySelectorAll(CARD)].map((card, index) => {
    const box = rectOf(card)
    const control = card.querySelector(CONTROL)
    const label = card.querySelector('label')
    const desc = card.querySelector('p')
    const input = card.querySelector(OTHER_INPUT)
    const chrome = input?.closest('[data-field-mode]')
    const c = rectOf(control)
    const points = [
      { name: '控件中心', x: c.x + c.w / 2, y: c.y + c.h / 2 },
      { name: '標籤字中心', ...textCenter(label) },
      { name: '左上角內 2px', x: box.x + 2, y: box.y + 2 },
      { name: '右上角內 2px', x: box.x + box.w - 2, y: box.y + 2 },
      { name: '左下角內 2px', x: box.x + 2, y: box.y + box.h - 2 },
      { name: '右下角內 2px', x: box.x + box.w - 2, y: box.y + box.h - 2 },
    ]
    const lb = label.getBoundingClientRect()
    points.push({ name: '標籤列右端', x: lb.right - 3, y: lb.y + lb.height / 2 })
    if (desc) points.push({ name: '說明字中心', ...textCenter(desc) })
    if (chrome) {
      const f = chrome.getBoundingClientRect()
      const i = input.getBoundingClientRect()
      points.push(
        { name: '外框上內距', x: i.x + i.width / 2, y: (f.top + i.top) / 2 },
        { name: '外框下內距', x: i.x + i.width / 2, y: (i.bottom + f.bottom) / 2 },
        { name: '外框左內距', x: (f.left + i.left) / 2, y: i.y + i.height / 2 },
        { name: '外框右內距', x: (i.right + f.right) / 2, y: i.y + i.height / 2 },
        { name: '輸入格中心', x: i.x + i.width / 2, y: i.y + i.height / 2 },
        { name: '輸入格左縮排', x: (box.x + f.left) / 2 + 4, y: i.y + i.height / 2 },
      )
      // 外框圓角外的那一點點:在外框的矩形裡、但在圓角外 → 不是輸入格,是卡(點了要切換)。
      // 2026-11-03 第一版用一層矩形 div 包外框當「輸入格的地盤」,這些點就成了點了沒反應的死點(5px 格點掃到 1 點,8px 格點掃不到)。
      // 固定位移不可靠(檔頭「量法」):逐角沿對角線往內找第一個真的不在外框裡的點,並標 expect = card 讓按下時再驗一次。
      const radius = Math.max(...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']
        .map((k) => parseFloat(getComputedStyle(chrome)[k]) || 0))
      const corners = [['左上', f.left, f.top, 1, 1], ['右上', f.right, f.top, -1, 1], ['左下', f.left, f.bottom, 1, -1], ['右下', f.right, f.bottom, -1, -1]]
      let found = 0
      for (const [corner, cx, cy, dx, dy] of corners) {
        for (let d = 0; d <= 2; d += 0.25) {
          const x = cx + dx * d
          const y = cy + dy * d
          if (x < f.left || x >= f.right || y < f.top || y >= f.bottom) continue
          const el = document.elementFromPoint(x, y)
          if (!el || chrome.contains(el) || !card.contains(el)) continue
          points.push({ name: `外框${corner}圓角外`, x, y, expect: 'card', offset: d })
          found += 1
          break
        }
      }
      cornerReport.push({ card: index, radius, found })
    }
    return { index, box, label: label.textContent, controlId: control.id, role: control.getAttribute('role'), points }
  })
  return { cards, cornerReport }
}, { CARD, CONTROL, OTHER_INPUT }).then(({ cards, cornerReport }) => {
  for (const c of cornerReport) {
    if (c.radius > 0 && c.found === 0) throw new Error(`卡${c.card}「其他」外框圓角 ${c.radius}px,四個角卻都找不到「在外框矩形裡、不在外框裡」的點 —— 圓角外這一區量不到`)
    record(`C${c.card}`, `卡${c.card}「其他」外框圓角外代表點${c.radius > 0 ? `:圓角 ${c.radius}px,找到 ${c.found} / 4 個角` : ':圓角 0,沒有圓角外這一區'}`, true)
  }
  return cards
})

/** 一點:掛記錄器 + 判命中區域 → 真滑鼠點 → 讀這一下每個控件 aria-checked 變了幾次、最後是什麼。 */
async function pressAt(x, y) {
  const hit = await page.evaluate(({ x, y, CARD, CONTROL, OTHER_INPUT }) => {
    window.__optionPress?.disconnect()
    const changes = {}
    const obs = new MutationObserver((records) => {
      for (const r of records) changes[r.target.id] = (changes[r.target.id] ?? 0) + 1
    })
    for (const el of document.querySelectorAll(CONTROL)) obs.observe(el, { attributes: true, attributeFilter: ['aria-checked'] })
    window.__optionPress = obs
    window.__optionPressChanges = changes
    const el = document.elementFromPoint(x, y)
    const card = el?.closest(CARD)
    const cards = [...document.querySelectorAll(CARD)]
    let region = 'card'
    const chrome = card?.querySelector(OTHER_INPUT)?.closest('[data-field-mode]')
    if (!el) region = 'none'
    else if (el.closest(CONTROL)) region = 'control'
    else if (chrome && chrome.contains(el)) region = el.matches('input') ? 'input' : 'field-chrome'
    else if (el.closest('label')) region = 'label'
    else if (el.closest('p')) region = 'desc'
    return { card: card ? cards.indexOf(card) : -1, region }
  }, { x, y, CARD, CONTROL, OTHER_INPUT })
  await page.mouse.click(x, y)
  await flush()
  const after = await page.evaluate(({ CONTROL }) => {
    window.__optionPress.takeRecords().forEach((r) => { window.__optionPressChanges[r.target.id] = (window.__optionPressChanges[r.target.id] ?? 0) + 1 })
    window.__optionPress.disconnect()
    const a = document.activeElement
    return {
      changes: window.__optionPressChanges,
      checked: Object.fromEntries([...document.querySelectorAll(CONTROL)].map((el) => [el.id, el.getAttribute('aria-checked') === 'true'])),
      active: a ? (a.matches('input') ? 'input' : a.getAttribute('role') ?? a.tagName) : null,
    }
  }, { CONTROL })
  return { ...hit, ...after }
}

const states = () => page.evaluate(({ CONTROL }) =>
  Object.fromEntries([...document.querySelectorAll(CONTROL)].map((el) => [el.id, el.getAttribute('aria-checked') === 'true'])), { CONTROL })

/** 格點 + 代表點;代表點在前(--selftest 只跑代表點也足以指名三組)。 */
function samplePoints(card, step) {
  const pts = card.points.map((p) => ({ ...p, kind: p.name }))
  if (SELFTEST) return pts
  for (let y = card.box.y + 1; y < card.box.y + card.box.h - 0.5; y += step) {
    for (let x = card.box.x + 1; x < card.box.x + card.box.w - 0.5; x += step) pts.push({ name: `格點(${Math.round(x - card.box.x)},${Math.round(y - card.box.y)})`, kind: 'grid', x, y })
  }
  return pts
}

const rel = (card, p) => `(${Math.round(p.x - card.box.x)},${Math.round(p.y - card.box.y)})`

async function sweepCheckbox(cards) {
  for (const card of cards) {
    for (const p of samplePoints(card, STEP.checkbox)) {
      const before = await states()
      const r = await pressAt(p.x, p.y)
      const id = card.controlId
      const where = `${p.kind === 'grid' ? '' : p.name}${rel(card, p)}`
      if (r.card !== card.index) { tally(`複選卡${card.index}「${card.label}」| 命中不是這張卡`, false, `${where} 命中 ${r.card}`); continue }
      const others = Object.entries(r.changes).filter(([k, n]) => k !== id && n > 0)
      const region = r.region
      if (p.expect && region !== p.expect) { tally(`複選卡${card.index}「${card.label}」| 代表點「${p.name}」命中 ${region}(該 ${p.expect})—— 點位跑出它代表的區域,量具失準`, false, where); continue }
      let pass
      let because
      if (region === 'input' || region === 'field-chrome') {
        // 外框整塊都是輸入處:點了 = 選中「其他」(之前沒選 → 切一次;已選 → 不動)
        const expect = before[id] ? 0 : 1
        pass = r.checked[id] === true && (r.changes[id] ?? 0) === expect && others.length === 0
        because = `點後 ${r.checked[id] ? '已選' : '未選'}、本卡變 ${r.changes[id] ?? 0} 次(該 ${expect})、他卡變 ${others.length}`
      } else {
        pass = (r.changes[id] ?? 0) === 1 && r.checked[id] === !before[id] && others.length === 0
        because = `本卡變 ${r.changes[id] ?? 0} 次(該 1)、他卡變 ${others.length}`
      }
      const ok = region === 'input' || region === 'field-chrome' ? '選中「其他」(輸入格自己負責)' : '恰好切換一次'
      tally(`複選卡${card.index}「${card.label}」| ${region} | ${pass ? ok : because}`, pass, where)
    }
  }
}

async function sweepRadio(cards) {
  // 交錯:第 k 個點輪流落在不同卡上,每一下的目標卡事先都是「未選中」
  const lists = cards.map((c) => samplePoints(c, STEP.radio))
  const longest = Math.max(...lists.map((l) => l.length))
  for (let k = 0; k < longest; k++) {
    for (const card of cards) {
      const p = lists[card.index][k]
      if (!p) continue
      const id = card.controlId
      if ((await states())[id]) {
        const other = cards.find((c) => c.index !== card.index)
        await page.locator(`[id="${other.controlId}"]`).click()
        await flush()
      }
      const r = await pressAt(p.x, p.y)
      const where = `${p.kind === 'grid' ? '' : p.name}${rel(card, p)}`
      if (r.card !== card.index) { tally(`單選卡${card.index}「${card.label}」| 命中不是這張卡`, false, `${where} 命中 ${r.card}`); continue }
      if (p.expect && r.region !== p.expect) { tally(`單選卡${card.index}「${card.label}」| 代表點「${p.name}」命中 ${r.region}(該 ${p.expect})—— 點位跑出它代表的區域,量具失準`, false, where); continue }
      const changedOthers = Object.entries(r.changes).filter(([k2, n]) => k2 !== id && n > 1)
      const pass = r.checked[id] === true && (r.changes[id] ?? 0) === 1 && Object.values(r.checked).filter(Boolean).length === 1 && changedOthers.length === 0
      tally(`單選卡${card.index}「${card.label}」| ${r.region} | ${pass ? '選中這張' : `點後 ${r.checked[id] ? '已選' : '未選'}、本卡變 ${r.changes[id] ?? 0} 次`}`, pass, where)
    }
  }
}

/** 卡與卡之間的 8px:點了不選任何一張(spec:「卡與卡之間的 8 不屬任何卡」)。 */
async function sweepGaps(cards, label) {
  for (let i = 0; i + 1 < cards.length; i++) {
    const a = cards[i].box
    const b = cards[i + 1].box
    const y = (a.y + a.h + b.y) / 2
    for (const fx of [0.1, 0.5, 0.9]) {
      const r = await pressAt(a.x + a.w * fx, y)
      const changed = Object.values(r.changes).some((n) => n > 0)
      tally(`${label}卡${i}與卡${i + 1}之間 | ${changed ? '點了卻改了選擇' : '不選任何一張'}`, !changed, `x=${Math.round(a.w * fx)}`)
    }
  }
}

/** 從現在起記每個控件 aria-checked 變了幾次;readObserved(id) 收回並回傳該控件的次數。 */
const observeChecked = () => page.evaluate(({ CONTROL }) => {
  window.__optionPress?.disconnect()
  window.__optionPressChanges = {}
  window.__optionPress = new MutationObserver((rs) => rs.forEach((r) => { window.__optionPressChanges[r.target.id] = (window.__optionPressChanges[r.target.id] ?? 0) + 1 }))
  for (const el of document.querySelectorAll(CONTROL)) window.__optionPress.observe(el, { attributes: true, attributeFilter: ['aria-checked'] })
}, { CONTROL })
const readObserved = (id) => page.evaluate((id) => {
  window.__optionPress.takeRecords().forEach((r) => { window.__optionPressChanges[r.target.id] = (window.__optionPressChanges[r.target.id] ?? 0) + 1 })
  window.__optionPress.disconnect()
  return window.__optionPressChanges[id] ?? 0
}, id)
const activeId = () => page.evaluate(() => document.activeElement?.id ?? null)
const activeRole = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.matches('input') ? 'input' : a.getAttribute('role') ?? a.tagName) : null })
const focusControl = (id) => page.evaluate((id) => document.getElementById(id).focus(), id)

let measuredSomething = false
try {
  // ── 第 1 題:單選 ──
  let cards = await readCards()
  if (cards.length !== 3 || cards.some((c) => c.role !== 'radio')) throw new Error(`第 1 題應為 3 張單選卡,讀到 ${cards.length} 張(${cards.map((c) => c.role).join(',')})`)
  await sweepRadio(cards)
  await sweepGaps(cards, '單選')
  // 滑鼠點「其他」卡(輸入格以外)→ 焦點進輸入格
  {
    const other = cards[2]
    await page.locator(`[id="${cards[0].controlId}"]`).click()
    await flush()
    const lb = other.points.find((p) => p.name === '右上角內 2px')
    await pressAt(lb.x, lb.y)
    record('P1', '單選:滑鼠點「其他」卡的內距 → 焦點進輸入格', (await activeRole()) === 'input', `焦點在 ${await activeRole()}`)
  }
  // 方向鍵選到「其他」→ 焦點留在圓上(APG radio roving)。按住方向鍵到選中,Radix 才把它當方向鍵(放開太快不選)。
  {
    await page.locator(`[id="${cards[1].controlId}"]`).click()
    await flush()
    await focusControl(cards[1].controlId)
    await page.keyboard.down('ArrowDown')
    await page.waitForFunction((id) => document.getElementById(id)?.getAttribute('aria-checked') === 'true', cards[2].controlId, { timeout: 10_000 })
    await flush()
    const role = await activeRole()
    await page.keyboard.up('ArrowDown')
    record('K1', '單選:方向鍵選到「其他」,焦點留在圓上、不被拉進輸入格', role === 'radio', `焦點在 ${role}`)
  }
  // 焦點在「其他」的圓上(未選)按 Space → 選中、焦點留在圓上(APG radio:Space「checks the focused radio button」,焦點不動;
  // spec 只有滑鼠 / 觸控點「其他」卡才自動聚焦輸入格)。2026-11-03 前:Space 合成的 click 冒泡到卡 → 焦點被搬進輸入格。
  {
    await page.locator(`[id="${cards[0].controlId}"]`).click()
    await flush()
    await focusControl(cards[2].controlId)
    await observeChecked()
    await page.keyboard.press('Space')
    await flush()
    const n = await readObserved(cards[2].controlId)
    const checked = (await states())[cards[2].controlId]
    const role = await activeRole()
    const onOther = (await activeId()) === cards[2].controlId
    record('K3', '單選:焦點在「其他」的圓上按 Space → 選中、焦點留在圓上、不被拉進輸入格',
      checked === true && n === 1 && role === 'radio' && onOther, `選中=${checked}、變 ${n} 次、焦點在 ${role}${onOther ? '' : '(不是「其他」的圓)'}`)
  }
  // 回到第一項(其他 + 空字 = 下一題停用),換到第 3 題
  await page.locator(`[id="${cards[0].controlId}"]`).click()
  await flush()
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '下一題' }).click()
    await settleAfterInteraction(page, { frames: 5 })
  }
  await page.waitForSelector('[role="checkbox"]', { timeout: 10_000 })
  await settleAfterInteraction(page, { frames: 5 })

  // ── 第 3 題:複選 ──
  cards = await readCards()
  if (cards.length !== 4 || cards.some((c) => c.role !== 'checkbox')) throw new Error(`第 3 題應為 4 張複選卡,讀到 ${cards.length} 張(${cards.map((c) => c.role).join(',')})`)
  await sweepCheckbox(cards)
  await sweepGaps(cards, '複選')
  const other = cards[3]
  const setOther = async (want) => {
    if ((await states())[other.controlId] !== want) {
      await focusControl(other.controlId)
      await page.keyboard.press('Space')
      await flush()
    }
    await page.evaluate(() => document.activeElement?.blur())
  }
  // Space 勾「其他」→ 恰好切一次、焦點留在勾選框
  {
    await setOther(false)
    await focusControl(other.controlId)
    await observeChecked()
    await page.keyboard.press('Space')
    await flush()
    const n = await readObserved(other.controlId)
    const role = await activeRole()
    record('K2', '複選:Space 勾「其他」恰好切一次、焦點留在勾選框', n === 1 && role === 'checkbox', `變 ${n} 次、焦點在 ${role}`)
  }
  // 滑鼠點「其他」卡的標籤 / 內距(未勾 → 勾)→ 焦點進輸入格;已勾時點內距 → 取消且焦點不進輸入格
  for (const name of ['標籤字中心', '右上角內 2px']) {
    await setOther(false)
    const p = other.points.find((q) => q.name === name)
    const r = await pressAt(p.x, p.y)
    record('P2', `複選:滑鼠點「其他」卡的${name}(未勾)→ 勾上且焦點進輸入格`, r.checked[other.controlId] === true && r.active === 'input', `勾=${r.checked[other.controlId]}、焦點在 ${r.active}`)
  }
  {
    await setOther(true)
    const p = other.points.find((q) => q.name === '右上角內 2px')
    const r = await pressAt(p.x, p.y)
    record('P3', '複選:滑鼠點已勾的「其他」卡內距 → 取消、焦點不進輸入格', r.checked[other.controlId] === false && r.active !== 'input', `勾=${r.checked[other.controlId]}、焦點在 ${r.active}`)
  }
  measuredSomething = true
} catch (error) {
  console.error(`✗ INSTRUMENT-FAIL 決策卡選項卡逐點命中:量測途中失敗 —— ${error?.message ?? error}`)
  await browser.close()
  await server.stop()
  process.exit(2)
}

await browser.close()
await server.stop()

for (const [key, g] of groups) {
  const line = `${key} | ${g.n} 點${g.pass ? '' : `,例:${g.where.join(' ')}`}`
  if (g.pass) passes.push(`✓ ${line}`)
  else failures.push(`✗ ${line}`)
}
const points = [...groups.values()].reduce((s, g) => s + g.n, 0)

if (SELFTEST) {
  // 紅在對的地方才算數:三種補回的舊病各自被指名(第三種「鍵盤選中後搶焦點」要被方向鍵 K1 與單選 Space K3 兩條都抓到)
  const caughtLabel = failures.some((l) => l.includes('複選卡') && l.includes('| label |'))
  const caughtChrome = failures.some((l) => l.includes('「其他」') && l.includes('| field-chrome |'))
  const caughtArrow = failures.some((l) => l.includes('K1'))
  const caughtSpace = failures.some((l) => l.includes('K3'))
  console.log(passes.join('\n'))
  if (failures.length) console.error('\n' + failures.join('\n'))
  const ok = measuredSomething && caughtLabel && caughtChrome && caughtArrow && caughtSpace
  console.log(ok
    ? '\n✓ selftest:補回的三種舊病(標籤多一個主人 / 「其他」外框多切一次 / 鍵盤選中後搶焦點 —— 方向鍵 K1 與 Space K3)都被指名,量具會紅'
    : `\n✗ selftest:沒抓全 —— 標籤 ${caughtLabel ? '✓' : '✗'}、外框 ${caughtChrome ? '✓' : '✗'}、方向鍵 K1 ${caughtArrow ? '✓' : '✗'}、Space K3 ${caughtSpace ? '✓' : '✗'}(這支閘是假綠)`)
  process.exit(ok ? 0 : 1)
}

console.log(passes.join('\n'))
if (failures.length) {
  console.error('\n' + failures.join('\n'))
  console.error(`\n✗ 決策卡選項卡逐點命中:${failures.length} 組失敗(共點 ${points} 點)`)
  process.exit(1)
}
console.log(`\n✓ 決策卡選項卡逐點命中全過(${passes.length} 組,共點 ${points} 點)`)
