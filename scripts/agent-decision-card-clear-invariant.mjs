#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: AgentDecisionCard 選填(`optional`)單選題有選取時,footer 左側出現「清除選取」;沒有選取、必答題、複選題都沒有。
 *         按了 → 這一題回到沒有選取(含「其他」打到一半的字)、鈕消失、焦點交給第一個圓(不掉到 body);再選又出現。
 *         出現 / 消失前後:右側的鈕(上一題、下一題|送出)與 footer、決策卡上緣的位置不變;
 *         左緣 = 題目標題左緣(overlay-surface.spec.md「要對齊誰」:只有 SurfaceHeader 時對齊標題)、垂直中線 = 右側主鈕;
 *         長相 = 同一列的「上一題」(同為 tertiary sm:高、字級、字重、顏色、底色、左右內距、圓角;第 2 題量,第 1 題右側只剩主鈕)。
 *         footer 組成與跳過(user 2026-11-11「跳過:甲」,agent-decision-card.spec.md「關閉」條):footer 沒有「跳過」——
 *         第 1 題右側只有「下一題」(O22 選填 / O26 必答)、只有一題的卡只有「送出」(O26)、第 2 題起「上一題 / 下一題」(O23);
 *         跳過只在標題列 ×:名字 = 「跳過全部，用建議繼續」(O24)、滑上去的 tooltip 同字(O25)、按了卡收起並記下決策回執(O28);
 *         第 2 題用鍵盤按「上一題」回第 1 題(那顆鈕跟著卸載)→ 焦點在第 1 題已選的圓,不掉到 body(O27);goBack 的另外兩條路
 *         (2026-11-11 r3 審查補):第 1 題沒選 → 焦點在第一個圓(O27b)、選了「其他」打字 → 焦點在「其他」的圓、字還在(O27c)。
 *         複選題那條路(第 1 題是複選)沒有任何 story 的第 1 題是複選,量不到;不為此新增 story(會動視覺基準),列待補。
 *         卡收起之後焦點去哪:實量掉到 body,落點規格沒寫 → 只印 ℹ 回報,不判紅(見 O28 那段)。
 *         --selftest ⑬–⑰ 各補回一種(footer 又出現跳過 / × 改回「跳過」/ tooltip 換字 / 回第 1 題焦點掉到 body / 按 × 沒反應);
 *         2026-11-11 前的建置(第 1 題 footer 有「跳過」、× 名字「跳過」)→ O22 / O24 / O25 / O26 / O27 紅。
 *         選填題沒選按「下一題 / 送出」照常前進、沒有錯誤訊息 —— 只用鍵盤也一樣:清掉之後只用 Tab 走到「下一題」按 Enter(O10)、
 *         複選題不勾只用 Tab 走到「送出」(O14),途中經過「其他」輸入格不改選取;必答題 Tab 經過也不把建議解換掉(O18)。
 *         讀屏:必答單選題的 radiogroup aria-required="true",選填單選題不是(field.spec.md「SR 識別路徑」)。
 *         選填題題目後有「(選填)」,卡片 / radiogroup / 複選群組的名字也以它結尾;必答題沒有(O19–O21;user 2026-11-10 選「標示:甲」,
 *         agent-decision-card.spec.md Header 條)。--selftest ⑪ 拿掉選填題的字 → O19 紅、⑫ 必答題也加 → O20 紅;214fc699 的建置 → O19 / O21 紅。
 *         量的是 getBoundingClientRect、getComputedStyle、document.activeElement、aria-checked、aria-required、input.value,不讀 class(M37)。
 *   紅: --selftest 逐一補回十七種病(每種開一次新頁;⑪⑫ 見上方「(選填)」那段,⑬–⑰ 見「footer 組成與跳過」那段):① 鈕不出現 ② 鈕出現時右側鈕被推動 ③ 按了焦點掉到 body
 *       ④ 必答題也出現 ⑤ 清除後「其他」的字還在 ⑥ 鈕的長相跟「上一題」不同 ⑦ 鍵盤走到「清除選取」的路上選取被換掉
 *       ⑧ 必答題的 radiogroup 沒有 aria-required ⑨ 選填題的 radiogroup 也標 aria-required ⑩ Tab 聚焦「其他」輸入格就選中「其他」
 *       —— 各自必須被指名紅
 *   綠: 現行 agent-panel.tsx(clearSelection / showClear)全綠;修前(本項基底 d27563f1:沒有 optional、沒有清除鈕)
 *       的建置配上本項新增的 story:鈕不在 → O1 起一串紅、選填沒選按「下一題」跳錯誤 → 紅(本機實測,見 commit 說明)
 *
 * ── 為什麼有這支 ──
 *
 * user 2026-10-30(第十二輪,逐字):「此外還要再多加一題 當決策卡的題目是多選一的 radio 選填 且使用者選擇了選項 此時，應該要提供清除的功能
 * 我認為應該在 footer 那列的左側在使用者選了選項之後出現 'Clear selection'的按鈕 反正就是按照 overlay footer 的 ssot 排列的方式？
 * 然後 clear selection 點擊後該按鈕就會消失 直到再次滿足顯示條件」
 * 規則:`patterns/overlay-surface/overlay-surface.spec.md`「選取類浮層的 footer 內容順序」(左 = 操作選取、右 = 提交)、
 * `components/Select/select.spec.md`「Clearable」(有值才出現、必須有選擇不開、清除後焦點交回欄位);
 * 決策卡的寫法住 `components/AgentPanel/agent-decision-card.spec.md`「步進」。
 *
 * ── 量法 ──
 *
 * 選填 story(DecisionCardOptional)三題:第 1 題單選預選建議解(一打開鈕就在)、第 2 題單選不預選、第 3 題複選;必答對照用 DecisionCardOpen 第 1 / 2 題(含 × 與上一題),只有一題的卡用 DecisionCardSingle。
 * 每一下點擊都是真滑鼠(page.mouse,含 mousedown);鍵盤用 page.keyboard。點完等兩層 setTimeout(0) 再讀。
 * 鍵盤走到「清除選取」= 從第一個圓往前 Tab(O6 / O7),途中會經過「其他」輸入格 —— 按之前先斷言選取仍是第一個圓
 * (Tab 經過輸入格不改選取;2026-11-04 前「聚焦即選中」會在這一步把選取換成「其他」)。
 * 開不起來 / 量途中找不到元素 → 儀器失效(exit 2),不是產品裁決,也絕不當成通過。
 *
 * Run: `node scripts/agent-decision-card-clear-invariant.mjs [--selftest] [--static-dir <Storybook 建置>]`
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
const OPTIONAL_STORY = 'design-system-components-agentpanel-展示--decision-card-optional'
const REQUIRED_STORY = 'design-system-components-agentpanel-展示--decision-card-open'
const SINGLE_STORY = 'design-system-components-agentpanel-展示--decision-card-single'
const SELFTEST = process.argv.includes('--selftest')
const CARD = '[class~="group/agent-option"]'
// 按鈕文字 = agent-panel.tsx DEFAULT_DECISION_LABELS 的 DS 預設(clearSelection / skip / previous / next / submit);DS 預設換字時兩邊一起改
const CLEAR = '清除選取'
const NAV = ['上一題']
const PRIMARY = ['下一題', '送出']
// 標題列 × 的名字(= labels.skip;user 2026-11-11「跳過:甲」);footer 不得再出現的舊鈕字樣
const DISMISS = '跳過全部，用建議繼續'
const OLD_SKIP = '跳過'
// 選填題題目後的標記 = DEFAULT_DECISION_LABELS.optionalSuffix 的 DS 預設(user 換字時兩邊一起改)
const OPTIONAL_SUFFIX = '(選填)'

requireFreshStorybookBuild(STATIC, [
  'packages/design-system/src/components/AgentPanel/agent-panel.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel.stories.tsx',
  'packages/design-system/src/patterns/overlay-surface/overlay-surface.tsx',
  'packages/design-system/src/components/Field/field-wrapper.tsx',
])

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
const storyUrl = (id) => `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`

/** 頁面層找按鈕的共用片段(對照組注入用;量具本身在 readCard 裡另寫,不共用,免得兩邊一起錯)。 */
const FIND_CLEAR = `(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '${CLEAR}'))`
/** 注入的病要從安裝那一刻就成立:鈕可能在注入前就已經渲染(第 1 題預選,一打開鈕就在)—— 只靠 MutationObserver 等「之後的變動」會漏掉
 *  已經在畫面上的那顆,對照組就假綠(第一版 ① 就是這樣沒抓到)。所以每段都先跑一次、再觀察之後的變動。 */
const SICK = (fn, opts = '{ subtree: true, childList: true, attributes: true }') => `(() => { const f = ${fn}; f(); new MutationObserver(f).observe(document.documentElement, ${opts}) })()`
/** 對照組(只在 --selftest):每種病一段頁面層注入,不改元件原始碼 —— 量具抓不到它們,就抓不到它們回來。 */
const FAULTS = {
  hidden: {
    expect: ['O1'],
    what: '① 有選取時鈕不出現',
    script: SICK(`() => { for (const b of ${FIND_CLEAR}()) if (b.style.display !== 'none') b.style.display = 'none' }`),
  },
  jump: {
    expect: ['O5'],
    what: '② 鈕出現時右側的鈕被推動',
    script: SICK(`() => { for (const f of document.querySelectorAll('[data-slot="surface-footer"]')) { const has = [...f.querySelectorAll('button')].some((b) => b.textContent.trim() === '${CLEAR}'); const want = has ? '20px' : ''; if (f.style.paddingTop !== want) f.style.paddingTop = want } }`),
  },
  focus: {
    expect: ['O4', 'O7'],
    what: '③ 按了焦點掉到 body',
    script: `document.addEventListener('click', (e) => { const b = e.target instanceof Element && e.target.closest('button'); if (b && b.textContent.trim() === '${CLEAR}') setTimeout(() => document.activeElement && document.activeElement.blur(), 0) }, true)`,
  },
  required: {
    expect: ['O15'],
    what: '④ 必答題也出現',
    script: SICK(`() => { const f = document.querySelector('[data-slot="surface-footer"]'); if (f && !${FIND_CLEAR}().length) { const b = document.createElement('button'); b.textContent = '${CLEAR}'; f.prepend(b) } }`, '{ subtree: true, childList: true }'),
  },
  otherText: {
    expect: ['O9'],
    what: '⑤ 清除後「其他」打到一半的字還在',
    script: `document.addEventListener('click', (e) => { const b = e.target instanceof Element && e.target.closest('button'); if (!b || b.textContent.trim() !== '${CLEAR}') return; const i = document.querySelector('input[aria-label="其他(自由輸入)"]'); const v = i && i.value; if (v) setTimeout(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v) }, 0) }, true)`,
  },
  variant: {
    expect: ['O3'],
    what: '⑥ 鈕的長相跟「上一題」不同(換成實心底)',
    script: SICK(`() => { for (const b of ${FIND_CLEAR}()) if (b.style.backgroundColor !== 'rgb(0, 0, 255)') b.style.backgroundColor = 'rgb(0, 0, 255)' }`),
  },
  routeSelect: {
    expect: ['O6', 'O7'],
    what: '⑦ 鍵盤走到「清除選取」的路上選取被換掉(焦點一到鈕上就改選「其他」)',
    script: `document.addEventListener('focusin', (e) => { const b = e.target instanceof Element && e.target.closest('button'); if (!b || b.textContent.trim() !== '${CLEAR}') return; const o = [...document.querySelectorAll('[role="radio"]')].pop(); if (o && o.getAttribute('aria-checked') !== 'true') o.click() }, true)`,
  },
  ariaMissing: {
    scope: 'required',
    expect: ['O16'],
    what: '⑧ 必答題的 radiogroup 沒有 aria-required',
    script: SICK(`() => { for (const g of document.querySelectorAll('[role="radiogroup"]')) if (g.getAttribute('aria-required') !== 'false') g.setAttribute('aria-required', 'false') }`),
  },
  focusSelectsOther: {
    scope: 'both',
    expect: ['O6', 'O10', 'O14', 'O18'],
    what: '⑩ Tab 聚焦「其他」輸入格就選中「其他」(2026-11-04 前的「聚焦即選中」)',
    script: `document.addEventListener('focusin', (e) => { if (!(e.target instanceof HTMLInputElement) || e.target.getAttribute('aria-label') !== '其他(自由輸入)') return; const card = e.target.closest('[class~="group/agent-option"]'); const c = card && card.querySelector('[role="radio"], [role="checkbox"]'); if (c && c.getAttribute('aria-checked') !== 'true') c.click() }, true)`,
  },
  ariaEverywhere: {
    expect: ['O17'],
    what: '⑨ 選填題的 radiogroup 也標 aria-required',
    script: SICK(`() => { for (const g of document.querySelectorAll('[role="radiogroup"]')) if (g.getAttribute('aria-required') !== 'true') g.setAttribute('aria-required', 'true') }`),
  },
  suffixMissing: {
    expect: ['O19'],
    what: '⑪ 選填題題目後沒有「(選填)」(= 2026-11-10 前)',
    script: SICK(`() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data === '${OPTIONAL_SUFFIX}') n.data = '' }`, '{ subtree: true, childList: true, characterData: true }'),
  },
  suffixOnRequired: {
    scope: 'required',
    expect: ['O20'],
    what: '⑫ 必答題題目後也加了「(選填)」',
    script: SICK(`() => { for (const t of document.querySelectorAll('[data-slot="surface-header"] span[id]')) if (!t.textContent.endsWith('${OPTIONAL_SUFFIX}')) t.append('${OPTIONAL_SUFFIX}') }`, '{ subtree: true, childList: true, characterData: true }'),
  },
  // ⑬–⑰:footer 組成與跳過(user 2026-11-11「跳過:甲」)
  skipBack: {
    scope: 'both',
    expect: ['O22', 'O26'],
    what: '⑬ 第 1 題 footer 又出現「跳過」(= 2026-11-11 前)',
    script: SICK(`() => { for (const f of document.querySelectorAll('[data-slot="surface-footer"]')) { const t = [...f.querySelectorAll('button')].map((b) => b.textContent.trim()); const right = f.lastElementChild; if (!right || t.includes('${OLD_SKIP}') || t.includes('上一題')) continue; const b = document.createElement('button'); b.type = 'button'; b.textContent = '${OLD_SKIP}'; right.prepend(b) } }`, '{ subtree: true, childList: true }'),
  },
  dismissName: {
    scope: 'required',
    expect: ['O24'],
    what: '⑭ 標題列 × 的名字改回「跳過」',
    script: SICK(`() => { for (const b of document.querySelectorAll('[data-slot="surface-header"] button')) if (b.getAttribute('aria-label') !== '${OLD_SKIP}') b.setAttribute('aria-label', '${OLD_SKIP}') }`),
  },
  tooltipText: {
    scope: 'required',
    expect: ['O25'],
    what: '⑮ 滑到 × 的 tooltip 字跟名字不同',
    script: SICK(`() => { for (const t of document.querySelectorAll('[role="tooltip"]')) if (t.textContent !== '${OLD_SKIP}') t.textContent = '${OLD_SKIP}' }`, '{ subtree: true, childList: true, characterData: true }'),
  },
  backFocusLost: {
    scope: 'both',
    expect: ['O27', 'O27b', 'O27c'],
    what: '⑯ 第 2 題按「上一題」回第 1 題,焦點掉到 body',
    script: `document.addEventListener('click', (e) => { const b = e.target instanceof Element && e.target.closest('button'); if (b && b.textContent.trim() === '上一題') setTimeout(() => document.activeElement && document.activeElement.blur(), 0) }, true)`,
  },
  dismissDead: {
    scope: 'required',
    expect: ['O28'],
    what: '⑰ 按標題列 × 沒反應(跳過的唯一入口失效)',
    script: `document.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('[data-slot="surface-header"] button')) e.stopPropagation() }, true)`,
  },
}

const flushOn = (page) => page.evaluate(() => new Promise((r) => setTimeout(() => setTimeout(r, 0), 0)))
/** 等有限次的動畫 / 過渡跑完再量(按鈕有 transition-colors;卡片進場有淡入下滑)—— 量到過渡中間值是已知陷阱。上限 3 秒。 */
const settleTransitions = (page) => page.evaluate(async () => {
  const finite = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity)
  await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 3000))])
})

// 全程一個分頁(--single-process 下關掉最後一個分頁會連瀏覽器一起關)
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

async function open(id, fault = null) {
  const f = fault ? FAULTS[fault] : null
  const beforeSettle = f ? async (p) => { if (f.script) await p.addScriptTag({ content: f.script }) } : null
  await openStory(page, storyUrl(id), { waitFor: CARD, settleFrames: 10, notFound: server.notFound, beforeSettle })
  await settleTransitions(page)
}

/** 決策卡目前的狀態:步數、標題、footer 與其中每顆鈕(位置 / 長相)、選項控件、「其他」輸入格、錯誤訊息、焦點。 */
const readCard = (page) => page.evaluate(({ CARD, CLEAR }) => {
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } }
  const cards = [...document.querySelectorAll(CARD)]
  // 卡片根 = 往上第一個含 footer 的 role="group"(複選題的 CheckboxGroup 也是 role="group",但不含 footer);
  // 2026-11-11 前用「含 aria-label="跳過" 的鈕」認,× 改名後改認結構 —— 根不綁文案,× 的名字另由 O24 量
  const root = cards[0] && (() => { let el = cards[0].parentElement; while (el && !(el.getAttribute('role') === 'group' && el.querySelector('[data-slot="surface-footer"]'))) el = el.parentElement; return el })()
  if (!root) return null
  const footer = root.querySelector('[data-slot="surface-footer"]')
  const header = root.querySelector('[data-slot="surface-header"]')
  const dismissBtn = header && header.querySelector('button')
  const title = root.getAttribute('aria-labelledby') && document.getElementById(root.getAttribute('aria-labelledby'))
  const stepEl = header && [...header.querySelectorAll('span')].find((s) => /^\s*\d+ \/ \d+\s*$/.test(s.textContent))
  const look = (b) => { const cs = getComputedStyle(b); return { height: b.getBoundingClientRect().height, fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, backgroundColor: cs.backgroundColor, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, borderRadius: cs.borderTopLeftRadius } }
  const buttons = footer ? [...footer.querySelectorAll('button')].filter((b) => b.checkVisibility()).map((b) => ({ text: b.textContent.trim(), rect: rect(b), look: look(b) })) : []
  // 「清除選取」不論在哪都算(必答題不該有;有就是錯):整張卡裡找,不只 footer
  const clears = [...root.querySelectorAll('button')].filter((b) => b.textContent.trim() === CLEAR && b.checkVisibility())
  const controls = [...root.querySelectorAll('[role="radio"], [role="checkbox"]')]
  const radiogroup = root.querySelector('[role="radiogroup"]')
  // 選項群組(單選 radiogroup / 複選 group)的名字 = aria-labelledby 指到的元素文字(讀屏念的就是這個)
  const optionGroup = root.querySelector('[role="radiogroup"], [role="group"][aria-labelledby]')
  const nameOf = (el) => (el?.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()
  const input = root.querySelector('input[aria-label="其他(自由輸入)"]')
  const err = root.querySelector('[data-field-slot="error"]')
  const a = document.activeElement
  return {
    step: stepEl ? stepEl.textContent.trim() : '(單題)',
    rootTop: rect(root).y,
    title: rect(title),
    titleText: title ? title.textContent : null,
    cardName: nameOf(root),
    groupName: optionGroup ? nameOf(optionGroup) : null,
    footer: rect(footer),
    buttons,
    dismiss: dismissBtn ? { name: dismissBtn.getAttribute('aria-label'), text: dismissBtn.textContent.trim(), rect: rect(dismissBtn) } : null,
    clearCount: clears.length,
    clear: clears[0] ? { rect: rect(clears[0]), look: look(clears[0]), inFooter: !!footer?.contains(clears[0]), firstInFooter: footer ? [...footer.querySelectorAll('button')][0] === clears[0] : false } : null,
    controls: controls.map((c) => ({ id: c.id, role: c.getAttribute('role'), checked: c.getAttribute('aria-checked') })),
    groupRequired: radiogroup ? radiogroup.getAttribute('aria-required') : '(沒有 radiogroup)',
    cards: cards.map(rect),
    input: input ? { value: input.value } : null,
    error: err ? err.textContent : null,
    active: a ? { id: a.id, tag: a.tagName, role: a.getAttribute('role'), text: a.textContent?.trim().slice(0, 20), isBody: a === document.body } : null,
  }
}, { CARD, CLEAR })

const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol
const sameRect = (a, b) => !!a && !!b && near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h)
const btn = (s, names) => s.buttons.find((b) => names.includes(b.text))
const clickCenter = async (r) => { await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await flushOn(page); await settleTransitions(page) }
const noneChecked = (s) => s.controls.every((c) => c.checked !== 'true')
const press = async (key) => { await page.keyboard.press(key); await flushOn(page); await settleTransitions(page) }
/** 只用 Tab 往前走,直到 until(狀態) 成立(最多 8 步);每一步都記下選取,回傳途中有沒有任何一步選取跟出發時不同。 */
const tabUntil = async (until) => {
  let s = await readCard(page)
  const start = JSON.stringify(s.controls.map((c) => c.checked))
  const trail = []
  for (let i = 0; i < 8; i++) {
    await press('Tab')
    s = await readCard(page)
    trail.push({ active: s.active?.text || s.active?.tag, checked: s.controls.map((c) => c.checked) })
    if (until(s)) return { reached: true, s, changed: trail.some((t) => JSON.stringify(t.checked) !== start), trail }
  }
  return { reached: false, s, changed: trail.some((t) => JSON.stringify(t.checked) !== start), trail }
}
const pickRadio = async (s, i) => { const c = s.cards[i]; await page.mouse.click(c.x + 40, c.y + 14); await flushOn(page); await settleTransitions(page) }

async function runOptional(fault) {
  const results = []
  const record = (id, label, pass, detail = '') => results.push({ id, label, pass, detail })
  const pre = (id, label, why) => record(id, label, false, `前置不成立:${why}`)
  await open(OPTIONAL_STORY, fault)
  let s = await readCard(page)
  if (!s || s.step !== '1 / 3' || s.cards.length !== 3) throw new Error(`第 1 題應為 3 張單選卡(1 / 3),讀到 ${s?.step}、${s?.cards.length} 張`)
  if (s.controls[0].checked !== 'true') throw new Error('第 1 題(預選建議解)一開始沒有選取 —— story 不是本閘要量的形狀')
  record('O17', '選填單選題的 radiogroup 不標 aria-required(選填 = 可以不答)', s.groupRequired !== 'true', `aria-required = ${s.groupRequired}`)
  if (fault === 'ariaEverywhere') return results
  // 選填題題目後加「(選填)」(user 2026-11-10 選「標示:甲」;agent-decision-card.spec.md Header 條):畫面上的題目、卡片與 radiogroup 的名字都以它結尾
  record('O19', `第 1 題(選填單選)題目以「${OPTIONAL_SUFFIX}」結尾,卡片與 radiogroup 的名字也是(讀屏跟題目一起念)`,
    [s.titleText, s.cardName, s.groupName].every((t) => typeof t === 'string' && t.endsWith(OPTIONAL_SUFFIX)), JSON.stringify({ title: s.titleText, card: s.cardName, group: s.groupName }))
  if (fault === 'suffixMissing') return results

  // ── 第 1 題(選填、預選建議解):一打開就有選取 → 鈕一打開就在 ──
  record('O1', '第 1 題(選填、預選建議解)一打開就有選取,「清除選取」一打開就在 footer、是 footer 的第一顆',
    !!s.clear && s.clear.inFooter && s.clear.firstInFooter, JSON.stringify(s.clear && { inFooter: s.clear.inFooter, first: s.clear.firstInFooter }) ?? '沒有')
  const pri0 = btn(s, PRIMARY)
  if (!pri0) throw new Error(`footer 讀不到右側主鈕:${JSON.stringify(s.buttons.map((b) => b.text))}`)
  // 第 1 題 footer 的組成:左「清除選取」(預選建議解 → 一打開就在)、右只有「下一題」—— 沒有「跳過」(user 2026-11-11「跳過:甲」)
  const right1 = s.buttons.filter((b) => b.text !== CLEAR).map((b) => b.text)
  record('O22', '第 1 題(選填)footer 右側只有「下一題」,沒有「跳過」(跳過只在標題列 ×)',
    right1.length === 1 && right1[0] === '下一題', `footer 鈕:${JSON.stringify(s.buttons.map((b) => b.text))}`)
  if (fault === 'skipBack') return results
  const base = { primary: pri0.rect, footer: s.footer, top: s.rootTop }
  const steady = (x) => sameRect(btn(x, PRIMARY)?.rect, base.primary) && sameRect(x.footer, base.footer) && near(x.rootTop, base.top)
  const where = (x) => `主鈕 ${JSON.stringify(btn(x, PRIMARY)?.rect)} vs ${JSON.stringify(base.primary)};footer ${JSON.stringify(x.footer)} vs ${JSON.stringify(base.footer)};上緣 ${x.rootTop} vs ${base.top}`
  if (s.clear) {
    record('O2', '左緣 = 題目標題左緣、垂直中線 = 右側主鈕中線',
      near(s.clear.rect.x, s.title.x) && near(s.clear.rect.y + s.clear.rect.h / 2, pri0.rect.y + pri0.rect.h / 2),
      `左緣 ${s.clear.rect.x.toFixed(2)} vs 標題 ${s.title.x.toFixed(2)};中線 ${(s.clear.rect.y + s.clear.rect.h / 2).toFixed(2)} vs ${(pri0.rect.y + pri0.rect.h / 2).toFixed(2)}`)
  } else {
    pre('O2', '左緣 / 中線', '鈕不在')
  }
  // O3(長相 = 同一列的「上一題」)改在第 2 題量:第 1 題右側只剩主鈕,同一列沒有 tertiary 可比
  if (fault === 'hidden') return results

  // ── 滑鼠按「清除選取」→ 都沒選、鈕消失、焦點第一個圓;再選第二個 → 鈕又出現;兩次轉換右側兩鈕 / footer / 卡上緣都不動 ──
  let reappeared = null
  if (s.clear) {
    await clickCenter(s.clear.rect)
    s = await readCard(page)
    record('O4', '滑鼠按了:都沒選、鈕消失、焦點在第一個圓(不在 body)',
      noneChecked(s) && s.clearCount === 0 && s.active?.id === s.controls[0].id,
      JSON.stringify({ checked: s.controls.map((c) => c.checked), clear: s.clearCount, active: s.active, first: s.controls[0].id }))
    const gone = s
    await pickRadio(s, 1)
    s = await readCard(page)
    reappeared = s
    record('O5', '鈕消失、再選第二個鈕又出現:兩次轉換右側主鈕、footer、決策卡上緣的位置都不變',
      steady(gone) && s.controls[1].checked === 'true' && !!s.clear && steady(s), `消失後 ${where(gone)};再出現 ${!!s.clear} ${where(s)}`)
  } else { pre('O4', '滑鼠按了清掉', '鈕不在'); pre('O5', '消失 / 再出現不跳', '鈕不在') }
  if (fault === 'jump') return results

  // ── 鍵盤:選第一個圓(Space)→ 往前 Tab 到「清除選取」(途中經過「其他」輸入格)→ 按之前選取仍是第一個圓 → Enter / Space ──
  for (const key of ['Enter', 'Space']) {
    const id = key === 'Enter' ? 'O6' : 'O7'
    const label = `鍵盤:往前 Tab 走得到「清除選取」、途中經過「其他」輸入格選取不變,按 ${key} → 都沒選、鈕消失、焦點在第一個圓(不在 body)`
    await page.evaluate((cid) => document.getElementById(cid)?.focus(), s.controls[0].id)
    await press('Space')
    s = await readCard(page)
    if (s.controls[0].checked !== 'true') { pre(id, label, `焦點在第一個圓按 Space 沒選中(${JSON.stringify(s.controls.map((c) => c.checked))})`); continue }
    const walked = await tabUntil((x) => x.active?.text === CLEAR)
    s = walked.s
    if (!walked.reached) { record(id, label, false, `Tab 8 次沒停在「清除選取」(最後焦點 ${JSON.stringify(s.active)})`); continue }
    const kept = s.controls[0].checked === 'true' && s.controls.slice(1).every((c) => c.checked !== 'true')
    if (!kept) { record(id, label, false, `走到「清除選取」時選取已經被換掉:${JSON.stringify(s.controls.map((c) => c.checked))}(應為第一個圓)`); continue }
    await press(key)
    s = await readCard(page)
    record(id, label,
      noneChecked(s) && s.clearCount === 0 && s.active?.id === s.controls[0].id && !s.active?.isBody,
      JSON.stringify({ checked: s.controls.map((c) => c.checked), clear: s.clearCount, active: s.active }))
  }
  if (fault === 'focus' || fault === 'routeSelect') return results

  // ── 「其他」:點卡 → 聚焦輸入格(選中「其他」)→ 打字 → 清除:字一起清 ──
  const otherCard = s.cards[2]
  await page.mouse.click(otherCard.x + otherCard.w - 4, otherCard.y + 4)
  await flushOn(page)
  await page.keyboard.type('團隊合照')
  await flushOn(page)
  s = await readCard(page)
  record('O8', '選「其他」打了字 → 「清除選取」在', s.controls[2].checked === 'true' && !!s.clear, JSON.stringify({ other: s.controls[2].checked, clear: !!s.clear, value: s.input?.value }))
  if (s.clear) {
    await clickCenter(s.clear.rect)
    s = await readCard(page)
    record('O9', '按了 → 「其他」沒選、輸入格的字清空、鈕消失、焦點在第一個圓',
      noneChecked(s) && s.input?.value === '' && s.clearCount === 0 && s.active?.id === s.controls[0].id,
      JSON.stringify({ checked: s.controls.map((c) => c.checked), value: s.input?.value, clear: s.clearCount, active: s.active }))
  } else pre('O9', '清除「其他」', '鈕不在')
  if (fault === 'otherText') return results

  // ── 選填沒選按「下一題」→ 前進、沒有錯誤 ──
  if (!noneChecked(s)) {
    // 修前(沒有清除鈕):自己回不到沒選 —— 本條改在第 2 題(不預選)量,這裡先記前置不成立
    pre('O10', '選填題沒選按「下一題」→ 前進、沒有錯誤', '第 1 題回不到沒選(沒有清除鈕)')
  } else {
    // 只用鍵盤:焦點在第一個圓(清除後交過來的)→ 只用 Tab 走到「下一題」→ Enter;途中經過「其他」輸入格不能把選取改成「其他」
    const walked = await tabUntil((x) => x.active?.text === '下一題')
    if (walked.reached) { await press('Enter'); await settleAfterInteraction(page, { frames: 5 }) }
    s = await readCard(page)
    record('O10', '第 1 題清掉後(沒選)只用 Tab 走到「下一題」按 Enter → 前進到 2 / 3、沒有錯誤訊息、途中選取不變',
      walked.reached && !walked.changed && s.step === '2 / 3' && !s.error,
      `走到 ${walked.reached}、途中選取變了 ${walked.changed}(${JSON.stringify(walked.trail.map((t) => `${t.active}:${t.checked.join('')}`))});${s.step}、錯誤 ${s.error ?? '無'}`)
  }
  if (s.step === '1 / 3') {
    // O10 沒過(例:Tab 經過輸入格選中了「其他」、按 Enter 跳錯誤)→ 先清掉再用滑鼠前進,後面幾條照樣量得到
    if (s.clear) { await clickCenter(s.clear.rect); s = await readCard(page) }
    await clickCenter(btn(s, PRIMARY).rect)
    await settleAfterInteraction(page, { frames: 5 })
    s = await readCard(page)
  }
  if (s.step !== '2 / 3') {
    for (const [id, label] of [['O23', '第 2 題 footer 組成'], ['O11', '不預選的選填題'], ['O3', '長相 = 上一題'], ['O12', '不預選沒選前進'], ['O13', '複選沒有鈕'], ['O14', '複選不勾照常送出']]) pre(id, label, '到不了第 2 題')
    return results
  }

  // ── 第 2 題(選填、不預選):沒選時沒有鈕、選了才出現(右側是「上一題 / 下一題」);沒選按「下一題」照常前進 ──
  const nav2 = btn(s, NAV)?.rect, pri2 = btn(s, PRIMARY)?.rect
  const emptyAtStart = noneChecked(s) && s.clearCount === 0 && !!btn(s, ['上一題'])
  const right2 = s.buttons.filter((b) => b.text !== CLEAR).map((b) => b.text)
  record('O23', '第 2 題 footer 右側 =「上一題 / 下一題」(第 2 題起才有上一題;主鈕與第 1 題同一個位置)',
    right2.length === 2 && right2[0] === '上一題' && right2[1] === '下一題' && sameRect(pri2, base.primary),
    `footer 鈕:${JSON.stringify(s.buttons.map((b) => b.text))};主鈕 ${JSON.stringify(pri2)} vs 第 1 題 ${JSON.stringify(base.primary)}`)
  await pickRadio(s, 0)
  s = await readCard(page)
  record('O11', '第 2 題(選填、不預選)沒選時沒有「清除選取」,選了才出現,右側「上一題 / 下一題」不動',
    emptyAtStart && s.controls[0].checked === 'true' && !!s.clear && sameRect(btn(s, NAV)?.rect, nav2) && sameRect(btn(s, PRIMARY)?.rect, pri2),
    JSON.stringify({ emptyAtStart, checked: s.controls.map((c) => c.checked), clear: !!s.clear, buttons: s.buttons.map((b) => b.text) }))
  const prev2 = btn(s, NAV)
  if (s.clear && prev2) {
    const diff = Object.keys(prev2.look).filter((k) => String(s.clear.look[k]) !== String(prev2.look[k]))
    record('O3', '長相 = 同一列的「上一題」(tertiary sm:高 / 字級 / 字重 / 顏色 / 底色 / 左右內距 / 圓角)', diff.length === 0,
      diff.map((k) => `${k} ${s.clear.look[k]} vs ${prev2.look[k]}`).join(';'))
  } else pre('O3', '長相 = 上一題', s.clear ? '同一列沒有「上一題」' : '鈕不在')
  if (fault === 'variant') return results
  if (s.clear) { await clickCenter(s.clear.rect); s = await readCard(page) }
  if (noneChecked(s)) {
    await clickCenter(btn(s, PRIMARY).rect)
    await settleAfterInteraction(page, { frames: 5 })
    s = await readCard(page)
    record('O12', '第 2 題沒選按「下一題」→ 前進到 3 / 3、沒有錯誤訊息', s.step === '3 / 3' && !s.error, `${s.step}、錯誤 ${s.error ?? '無'}`)
  } else {
    // 修前:清不掉 —— 回上一層也量不到「沒選」;改從新開的頁面量第 2 題沒選就按
    record('O12', '第 2 題沒選按「下一題」→ 前進、沒有錯誤', false, '前置不成立:清不掉選取')
    await clickCenter(btn(s, PRIMARY).rect)
    await settleAfterInteraction(page, { frames: 5 })
    s = await readCard(page)
  }
  if (s.step !== '3 / 3') { pre('O13', '複選沒有鈕', '到不了第 3 題'); pre('O14', '複選不勾照常送出', '到不了第 3 題'); return results }

  // ── 第 3 題(選填、複選):勾了也沒有鈕;不勾按「送出」沒有錯誤 ──
  await page.waitForSelector('[role="checkbox"]', { timeout: 10_000 })
  s = await readCard(page)
  // 複選群組沒有 aria-required 可報,選填只靠題目後的字 —— 群組名字也要以「(選填)」結尾
  record('O21', `第 3 題(選填複選)題目以「${OPTIONAL_SUFFIX}」結尾,複選群組的名字也是`,
    [s.titleText, s.groupName].every((t) => typeof t === 'string' && t.endsWith(OPTIONAL_SUFFIX)), JSON.stringify({ title: s.titleText, group: s.groupName }))
  await page.mouse.click(s.cards[0].x + 40, s.cards[0].y + 14)
  await flushOn(page)
  s = await readCard(page)
  record('O13', '第 3 題(複選)勾了一項 → 沒有「清除選取」(方框本來就能取消)', s.controls[0].checked === 'true' && s.clearCount === 0, JSON.stringify({ checked: s.controls[0].checked, clear: s.clearCount }))
  await page.mouse.click(s.cards[0].x + 40, s.cards[0].y + 14)
  await flushOn(page)
  s = await readCard(page)
  // 只用鍵盤:焦點在第一個方框 → 只用 Tab 走到「送出」→ Enter;途中經過「其他」輸入格不能把「其他」勾起來
  await page.evaluate((cid) => document.getElementById(cid)?.focus(), s.controls[0].id)
  const walked = await tabUntil((x) => x.active?.text === '送出')
  if (walked.reached) { await press('Enter'); await settleAfterInteraction(page, { frames: 5 }) }
  s = await readCard(page)
  // 範例的送出 = 真的送出(共用 DecisionCardScene:卡收起、對話多一則決策回執),所以「照常送出」量的是卡收起 + 回執出現;
  // 沒過驗證時卡留著、錯誤訊息掛在卡裡 → s 不是 null,本條紅。
  const receipt = await page.evaluate(() => document.body.textContent.includes('已按你的選擇繼續'))
  record('O14', '選填複選一項都不勾,只用 Tab 走到「送出」按 Enter → 照常送出(卡收起、對話多一則決策回執)、途中「其他」沒被勾起來',
    walked.reached && !walked.changed && s === null && receipt,
    `走到 ${walked.reached}、途中選取變了 ${walked.changed}(${JSON.stringify(walked.trail.map((t) => `${t.active}:${t.checked.join('')}`))});${s ? `卡還在、錯誤 ${s.error ?? '無'}` : `回執 ${receipt ? '有' : '沒有'}`}`)

  // ── O27b(2026-11-11 r3 審查補):goBack 的「沒選 = 第一個圓」那條路 —— 第 1 題清成沒選 → 前進 → 第 2 題用鍵盤按「上一題」回來 ──
  // O27 只走「已選了一個單選」;這裡另開一頁,第 1 題清掉選取再前進,回來時焦點應在第 1 題第一個圓(仍沒選),不在 body
  await open(OPTIONAL_STORY, fault)
  s = await readCard(page)
  if (s?.clear) { await clickCenter(s.clear.rect); s = await readCard(page) }
  const firstId = s?.controls[0]?.id
  const emptyQ1 = !!s && s.step === '1 / 3' && noneChecked(s)
  if (emptyQ1 && btn(s, PRIMARY)) { await clickCenter(btn(s, PRIMARY).rect); await settleAfterInteraction(page, { frames: 5 }); s = await readCard(page) }
  if (!emptyQ1 || s?.step !== '2 / 3' || !btn(s, NAV)) {
    pre('O27b', '第 1 題沒選、按「上一題」回來 → 焦點在第一個圓', `第 1 題清不成沒選或到不了第 2 題(沒選 ${emptyQ1};${s?.step})`)
  } else {
    await page.evaluate(() => [...document.querySelectorAll('[data-slot="surface-footer"] button')].find((b) => b.textContent.trim() === '上一題')?.focus())
    await press('Enter')
    s = await readCard(page)
    record('O27b', '第 1 題沒選、從第 2 題用鍵盤按「上一題」回第 1 題 → 焦點在第 1 題第一個圓(仍沒選),不在 body',
      s?.step === '1 / 3' && s.active?.id === firstId && noneChecked(s) && !s.active?.isBody,
      JSON.stringify({ step: s?.step, active: s?.active, firstId, checked: s?.controls.map((c) => c.checked) }))
  }
  return results
}

async function runRequired(fault) {
  const results = []
  await open(REQUIRED_STORY, fault)
  let s = await readCard(page)
  if (!s || s.step !== '1 / 3') throw new Error(`必答對照 story 第 1 題讀不到(${s?.step})`)
  results.push({ id: 'O16', label: '必答單選題的 radiogroup 帶 aria-required="true"(field.spec.md「SR 識別路徑」)', pass: s.groupRequired === 'true',
    detail: `aria-required = ${s.groupRequired}` })
  if (fault === 'ariaMissing') return results
  // 必答題不變:題目、卡片、radiogroup 的名字都沒有「(選填)」(對照:證明 O19 / O21 不是每題都加)
  results.push({ id: 'O20', label: `必答題(第 1 題)題目與名字都沒有「${OPTIONAL_SUFFIX}」`,
    pass: [s.titleText, s.cardName, s.groupName].every((t) => typeof t === 'string' && t.length > 0 && !t.includes(OPTIONAL_SUFFIX)),
    detail: JSON.stringify({ title: s.titleText, card: s.cardName, group: s.groupName }) })
  if (fault === 'suffixOnRequired') return results
  // footer 組成與跳過(user 2026-11-11「跳過:甲」):第 1 題右側只有「下一題」;標題列 × 的名字 =「跳過全部，用建議繼續」
  const right1 = s.buttons.filter((b) => b.text !== CLEAR).map((b) => b.text)
  results.push({ id: 'O24', label: `標題列 × 的名字(aria-label)=「${DISMISS}」`, pass: s.dismiss?.name === DISMISS,
    detail: JSON.stringify(s.dismiss) })
  if (fault === 'dismissName') return results
  // 必答題(預選建議解):焦點在第一個圓 → 只用 Tab 走到「下一題」,途中經過「其他」輸入格不能把建議解換成「其他」
  await page.evaluate((cid) => document.getElementById(cid)?.focus(), s.controls[0].id)
  const walked = await tabUntil((x) => x.active?.text === '下一題')
  results.push({ id: 'O18', label: '必答題只用 Tab 走到「下一題」:途中經過「其他」輸入格,預選的建議解不被換成「其他」', pass: walked.reached && !walked.changed,
    detail: `走到 ${walked.reached}、途中選取變了 ${walked.changed}(${JSON.stringify(walked.trail.map((t) => `${t.active}:${t.checked.join('')}`))})` })
  await open(REQUIRED_STORY, fault)
  s = await readCard(page)
  const preselected = s.controls[0].checked === 'true'
  await pickRadio(s, 1)
  s = await readCard(page)
  results.push({ id: 'O15', label: '必答題(預選)有選取、換選第二個之後,都沒有「清除選取」', pass: preselected && s.controls[1].checked === 'true' && s.clearCount === 0,
    detail: JSON.stringify({ preselected, second: s.controls[1].checked, clear: s.clearCount }) })

  // ── 第 2 題用鍵盤按「上一題」回第 1 題:那顆鈕跟著卸載(第 1 題沒有上一題)→ 焦點交給第 1 題已選的圓(這裡是剛換選的第二個),不掉到 body ──
  const picked = s.controls[1].id
  await clickCenter(btn(s, PRIMARY).rect)
  await settleAfterInteraction(page, { frames: 5 })
  s = await readCard(page)
  if (s?.step !== '2 / 3' || !btn(s, NAV)) {
    results.push({ id: 'O27', label: '第 2 題按「上一題」回第 1 題,焦點在第 1 題已選的圓', pass: false, detail: `前置不成立:到不了第 2 題或沒有上一題(${s?.step};${JSON.stringify(s?.buttons.map((b) => b.text))})` })
  } else {
    await page.evaluate(() => [...document.querySelectorAll('[data-slot="surface-footer"] button')].find((b) => b.textContent.trim() === '上一題')?.focus())
    await press('Enter')
    s = await readCard(page)
    results.push({ id: 'O27', label: '第 2 題用鍵盤按「上一題」回第 1 題(那顆鈕跟著卸載)→ 焦點在第 1 題已選的圓,不在 body',
      pass: s?.step === '1 / 3' && s.active?.id === picked && s.controls[1].checked === 'true' && !s.active?.isBody,
      detail: JSON.stringify({ step: s?.step, active: s?.active, picked, checked: s?.controls.map((c) => c.checked) }) })
  }
  // ── O27c(2026-11-11 r3 審查補):goBack 的「選了『其他』」那條路 —— 第 1 題選「其他」打字 → 前進 → 按「上一題」回來 → 焦點在「其他」那個圓 ──
  if (s?.step === '1 / 3') {
    const other = s.controls[s.controls.length - 1]
    await page.evaluate((id) => document.getElementById(id)?.click(), other.id)
    await flushOn(page)
    await page.fill('input[aria-label="其他(自由輸入)"]', '改成下週一早上 9 點發')
    s = await readCard(page)
    const otherPicked = s.controls[s.controls.length - 1].checked === 'true'
    if (otherPicked && btn(s, PRIMARY)) { await clickCenter(btn(s, PRIMARY).rect); await settleAfterInteraction(page, { frames: 5 }); s = await readCard(page) }
    if (!otherPicked || s?.step !== '2 / 3' || !btn(s, NAV)) {
      results.push({ id: 'O27c', label: '第 1 題選「其他」、按「上一題」回來 → 焦點在「其他」的圓', pass: false, detail: `前置不成立:選不到「其他」或到不了第 2 題(選到 ${otherPicked};${s?.step};錯誤 ${s?.error ?? '無'})` })
    } else {
      await page.evaluate(() => [...document.querySelectorAll('[data-slot="surface-footer"] button')].find((b) => b.textContent.trim() === '上一題')?.focus())
      await press('Enter')
      s = await readCard(page)
      results.push({ id: 'O27c', label: '第 1 題選「其他」(打了字)、從第 2 題用鍵盤按「上一題」回第 1 題 → 焦點在「其他」那個圓(仍選著、字還在),不在 body',
        pass: s?.step === '1 / 3' && s.active?.id === other.id && s.controls[s.controls.length - 1].checked === 'true' && s.input?.value === '改成下週一早上 9 點發' && !s.active?.isBody,
        detail: JSON.stringify({ step: s?.step, active: s?.active, other: other.id, input: s?.input }) })
    }
  } else results.push({ id: 'O27c', label: '第 1 題選「其他」、按「上一題」回來 → 焦點在「其他」的圓', pass: false, detail: `前置不成立:O27 之後不在第 1 題(${s?.step})` })
  if (fault === 'backFocusLost') return results

  // ── 按標題列 ×(跳過的唯一入口)→ 卡收起、對話多一則決策回執(DecisionCardScene 的 onSkip 與 onSubmit 同一個收尾) ──
  if (!s?.dismiss) {
    results.push({ id: 'O28', label: '按標題列 × → 卡收起、記下決策回執', pass: false, detail: '前置不成立:讀不到標題列 ×' })
  } else {
    const receiptBefore = await page.evaluate(() => document.body.textContent.includes('已按你的選擇繼續'))
    await clickCenter(s.dismiss.rect)
    await settleAfterInteraction(page, { frames: 5 })
    const after = await readCard(page)
    const receipt = await page.evaluate(() => document.body.textContent.includes('已按你的選擇繼續'))
    const focusAfter = await page.evaluate(() => { const a = document.activeElement; return { isBody: !a || a === document.body, tag: a?.tagName ?? null, name: a?.getAttribute('aria-label') ?? a?.textContent?.trim().slice(0, 20) ?? null } })
    results.push({ id: 'O28', label: '按標題列 ×(跳過全部)→ 卡收起、對話多一則決策回執', pass: !receiptBefore && after === null && receipt,
      detail: `按之前已有回執 ${receiptBefore};按之後卡${after ? '還在' : '收起'}、回執 ${receipt ? '有' : '沒有'};焦點 ${JSON.stringify(focusAfter)}` })
    // 卡收起後焦點去哪:2026-11-11 r3 實量 = 掉到 body(focusAfter.isBody = true;× 與送出兩條收尾都是卡整個卸載)。
    // keyboard-model-canonical「焦點不可因 DOM unmount 掉到 body」成立,但落點(例:下方的輸入框)規格沒寫 —— 產品 / UX 取捨,回報 user,
    // 定案前不加會紅的斷言(加了 CI 恆紅);落點定了之後在這裡補 O28f(該紅的對照:卸載後 blur)。
    if (focusAfter.isBody) console.log(`ℹ O28 收尾焦點落在 body(待規格定落點,回報 user):${JSON.stringify(focusAfter)}`)
  }
  if (fault === 'dismissDead') return results

  // ── 只有一題的卡:footer 只有「送出」;兩支 story 的第 1 題合起來就是 O26 ──
  await open(SINGLE_STORY, fault)
  s = await readCard(page)
  if (!s || s.step !== '(單題)') throw new Error(`單題卡讀不到(${s?.step})`)
  const rightSingle = s.buttons.filter((b) => b.text !== CLEAR).map((b) => b.text)
  results.push({ id: 'O26', label: 'footer 沒有「跳過」:必答題第 1 題右側只有「下一題」、只有一題的卡只有「送出」',
    pass: right1.length === 1 && right1[0] === '下一題' && rightSingle.length === 1 && rightSingle[0] === '送出',
    detail: JSON.stringify({ 必答第1題: right1, 單題: rightSingle }) })
  if (fault === 'skipBack') return results

  // ── 滑到 × → tooltip 字 = 名字(icon-only Button 由 aria-label 自動帶出;button.tsx「沒有文字的按鈕 + aria-label → 自動包 Tooltip」) ──
  const d = s.dismiss
  let tip = null
  if (d) {
    await page.mouse.move(d.rect.x + 1, d.rect.y + 1)
    await page.mouse.move(d.rect.x + d.rect.w / 2, d.rect.y + d.rect.h / 2)
    // Radix 把 tooltip 文字另放一份在視覺隱藏的 role="tooltip"(讀屏念的就是它)—— 等它掛上(attached;1px 視覺隱藏不算 visible)
    tip = await page.waitForSelector('[role="tooltip"]', { state: 'attached', timeout: 5_000 }).then((el) => el.evaluate((n) => n.textContent)).catch(() => null)
  }
  results.push({ id: 'O25', label: `滑到標題列 × 出現的 tooltip =「${DISMISS}」`, pass: tip === DISMISS, detail: tip === null ? 'tooltip 沒出現(5 秒)' : `tooltip「${tip}」` })
  await page.mouse.move(0, 0)
  return results
}

const runs = SELFTEST ? Object.keys(FAULTS) : [null]
const report = []
for (const fault of runs) {
  try {
    const results = []
    const scope = fault === 'required' ? 'required' : (FAULTS[fault]?.scope ?? (fault ? 'optional' : 'both'))
    if (scope !== 'required') results.push(...await runOptional(fault))
    if (scope !== 'optional') results.push(...await runRequired(fault))
    report.push({ fault, results })
  } catch (error) {
    const msg = error instanceof StoryRenderInstrumentError ? error.message : (error?.message ?? String(error))
    if (!SELFTEST) {
      console.error(`✗ INSTRUMENT-FAIL 決策卡清除選取:量測途中失敗 —— ${msg}`)
      await browser.close(); await server.stop(); process.exit(2)
    }
    report.push({ fault, results: [], error: msg })
  }
}
await browser.close()
await server.stop()

if (SELFTEST) {
  let ok = true
  for (const r of report) {
    const f = FAULTS[r.fault]
    const red = r.results.filter((x) => !x.pass).map((x) => x.id)
    const caught = f.expect.every((id) => red.includes(id))
    ok = ok && caught
    console.log(`${caught ? '✓' : '✗'} selftest ${f.what}:${caught ? `被 ${f.expect.join(' / ')} 指名紅` : `沒抓到(該紅 ${f.expect.join(' / ')},實際紅 ${red.join(' / ') || '無'}${r.error ? `;途中 ${r.error}` : ''})`}`)
  }
  console.log(ok ? `\n✓ selftest:${report.length} 種病都被指名,量具會紅` : '\n✗ selftest:沒抓全(這支閘是假綠)')
  process.exit(ok ? 0 : 1)
}

const { results } = report[0]
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.id} | ${r.label}${r.pass ? '' : ` | ${r.detail}`}`)
const failed = results.filter((r) => !r.pass)
if (failed.length) {
  console.error(`\n✗ 決策卡清除選取:${failed.length} / ${results.length} 條失敗`)
  process.exit(1)
}
console.log(`\n✓ 決策卡清除選取全過(${results.length} 條)`)
