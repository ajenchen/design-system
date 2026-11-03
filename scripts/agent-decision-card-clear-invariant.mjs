#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: AgentDecisionCard 選填(`optional`)單選題有選取時,footer 左側出現「清除選取」;沒有選取、必答題、複選題都沒有。
 *         按了 → 這一題回到沒有選取(含「其他」打到一半的字)、鈕消失、焦點交給第一個圓(不掉到 body);再選又出現。
 *         出現 / 消失前後:右側兩鈕(跳過|上一題、下一題|送出)與 footer、決策卡上緣的位置不變;
 *         左緣 = 題目標題左緣(overlay-surface.spec.md「要對齊誰」:只有 SurfaceHeader 時對齊標題)、垂直中線 = 右側兩鈕;
 *         長相 = 同一列的「跳過」(同為 tertiary sm:高、字級、字重、顏色、底色、左右內距、圓角)。
 *         選填題沒選按「下一題 / 送出」照常前進、沒有錯誤訊息。
 *         量的是 getBoundingClientRect、getComputedStyle、document.activeElement、aria-checked、input.value,不讀 class(M37)。
 *   紅: --selftest 逐一補回六種病(每種開一次新頁):① 鈕不出現 ② 鈕出現時右側鈕被推動 ③ 按了焦點掉到 body
 *       ④ 必答題也出現 ⑤ 清除後「其他」的字還在 ⑥ 鈕的長相跟「跳過」不同 —— 各自必須被指名紅
 *   綠: 現行 agent-panel.tsx(clearSelection / showClear)全綠;修前(本項基底 d27563f1:沒有 optional、沒有清除鈕)
 *       的建置配上本項新增的 story:鈕不出現 → O2 起一串紅、選填沒選按「下一題」跳錯誤 → O11 紅(本機實測,見 commit 說明)
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
 * 選填 story(DecisionCardOptional)三題:第 1 題單選不預選、第 2 題單選預選建議解、第 3 題複選;必答對照用 DecisionCardOpen 第 1 題。
 * 每一下點擊都是真滑鼠(page.mouse,含 mousedown);鍵盤用 page.keyboard。點完等兩層 setTimeout(0) 再讀。
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
const SELFTEST = process.argv.includes('--selftest')
const CARD = '[class~="group/agent-option"]'
// 按鈕文字 = agent-panel.tsx DEFAULT_DECISION_LABELS 的 DS 預設(clearSelection / skip / previous / next / submit)
const CLEAR = '清除選取'
const NAV = ['跳過', '上一題']
const PRIMARY = ['下一題', '送出']

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
/** 對照組(只在 --selftest):每種病一段頁面層注入,不改元件原始碼 —— 量具抓不到它們,就抓不到它們回來。 */
const FAULTS = {
  hidden: {
    expect: ['O2'],
    what: '① 有選取時鈕不出現',
    script: `new MutationObserver(() => { for (const b of ${FIND_CLEAR}()) b.style.display = 'none' }).observe(document.documentElement, { subtree: true, childList: true })`,
  },
  jump: {
    expect: ['O5'],
    what: '② 鈕出現時右側兩鈕被推動',
    script: `new MutationObserver(() => { for (const f of document.querySelectorAll('[data-slot="surface-footer"]')) { const has = [...f.querySelectorAll('button')].some((b) => b.textContent.trim() === '${CLEAR}'); const want = has ? '20px' : ''; if (f.style.paddingTop !== want) f.style.paddingTop = want } }).observe(document.documentElement, { subtree: true, childList: true, attributes: true })`,
  },
  focus: {
    expect: ['O6', 'O8'],
    what: '③ 按了焦點掉到 body',
    script: `document.addEventListener('click', (e) => { const b = e.target instanceof Element && e.target.closest('button'); if (b && b.textContent.trim() === '${CLEAR}') setTimeout(() => document.activeElement && document.activeElement.blur(), 0) }, true)`,
  },
  required: {
    expect: ['O16'],
    what: '④ 必答題也出現',
    script: `new MutationObserver(() => { const f = document.querySelector('[data-slot="surface-footer"]'); if (f && !${FIND_CLEAR}().length) { const b = document.createElement('button'); b.textContent = '${CLEAR}'; f.prepend(b) } }).observe(document.documentElement, { subtree: true, childList: true })`,
  },
  otherText: {
    expect: ['O10'],
    what: '⑤ 清除後「其他」打到一半的字還在',
    script: `document.addEventListener('click', (e) => { const b = e.target instanceof Element && e.target.closest('button'); if (!b || b.textContent.trim() !== '${CLEAR}') return; const i = document.querySelector('input[aria-label="其他(自由輸入)"]'); const v = i && i.value; if (v) setTimeout(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v) }, 0) }, true)`,
  },
  variant: {
    expect: ['O4'],
    what: '⑥ 鈕的長相跟「跳過」不同(換成實心底)',
    script: `new MutationObserver(() => { for (const b of ${FIND_CLEAR}()) if (b.style.backgroundColor !== 'rgb(0, 0, 255)') b.style.backgroundColor = 'rgb(0, 0, 255)' }).observe(document.documentElement, { subtree: true, childList: true, attributes: true })`,
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
  const root = cards[0] && (() => { let el = cards[0].parentElement; while (el && !(el.getAttribute('role') === 'group' && el.querySelector('button[aria-label="跳過"]'))) el = el.parentElement; return el })()
  if (!root) return null
  const footer = root.querySelector('[data-slot="surface-footer"]')
  const header = root.querySelector('[data-slot="surface-header"]')
  const title = root.getAttribute('aria-labelledby') && document.getElementById(root.getAttribute('aria-labelledby'))
  const stepEl = header && [...header.querySelectorAll('span')].find((s) => /^\s*\d+ \/ \d+\s*$/.test(s.textContent))
  const look = (b) => { const cs = getComputedStyle(b); return { height: b.getBoundingClientRect().height, fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, backgroundColor: cs.backgroundColor, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, borderRadius: cs.borderTopLeftRadius } }
  const buttons = footer ? [...footer.querySelectorAll('button')].filter((b) => b.checkVisibility()).map((b) => ({ text: b.textContent.trim(), rect: rect(b), look: look(b) })) : []
  // 「清除選取」不論在哪都算(必答題不該有;有就是錯):整張卡裡找,不只 footer
  const clears = [...root.querySelectorAll('button')].filter((b) => b.textContent.trim() === CLEAR && b.checkVisibility())
  const controls = [...root.querySelectorAll('[role="radio"], [role="checkbox"]')]
  const input = root.querySelector('input[aria-label="其他(自由輸入)"]')
  const err = root.querySelector('[data-field-slot="error"]')
  const a = document.activeElement
  return {
    step: stepEl ? stepEl.textContent.trim() : '(單題)',
    rootTop: rect(root).y,
    title: rect(title),
    footer: rect(footer),
    buttons,
    clearCount: clears.length,
    clear: clears[0] ? { rect: rect(clears[0]), look: look(clears[0]), inFooter: !!footer?.contains(clears[0]), firstInFooter: footer ? [...footer.querySelectorAll('button')][0] === clears[0] : false } : null,
    controls: controls.map((c) => ({ id: c.id, role: c.getAttribute('role'), checked: c.getAttribute('aria-checked') })),
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
const pickRadio = async (s, i) => { const c = s.cards[i]; await page.mouse.click(c.x + 40, c.y + 14); await flushOn(page); await settleTransitions(page) }

async function runOptional(fault) {
  const results = []
  const record = (id, label, pass, detail = '') => results.push({ id, label, pass, detail })
  const pre = (id, label, why) => record(id, label, false, `前置不成立:${why}`)
  await open(OPTIONAL_STORY, fault)
  let s = await readCard(page)
  if (!s || s.step !== '1 / 3' || s.cards.length !== 3) throw new Error(`第 1 題應為 3 張單選卡(1 / 3),讀到 ${s?.step}、${s?.cards.length} 張`)
  if (!noneChecked(s)) throw new Error('第 1 題(不預選)一開始就有選取 —— story 不是本閘要量的形狀')
  record('O1', '第 1 題(選填、不預選)沒有選取時沒有「清除選取」', s.clearCount === 0, `讀到 ${s.clearCount} 顆`)
  const base = { nav: btn(s, NAV)?.rect, primary: btn(s, PRIMARY)?.rect, footer: s.footer, top: s.rootTop }
  if (!base.nav || !base.primary) throw new Error(`footer 讀不到右側兩鈕:${JSON.stringify(s.buttons.map((b) => b.text))}`)

  // ── 選填沒選按「下一題」→ 前進、沒有錯誤;再按「上一題」回來(答案保留 = 仍沒選)──
  await clickCenter(base.primary)
  await settleAfterInteraction(page, { frames: 5 })
  s = await readCard(page)
  record('O11', '選填題沒選按「下一題」→ 前進到 2 / 3、沒有錯誤訊息', s.step === '2 / 3' && !s.error, `${s.step}、錯誤 ${s.error ?? '無'}`)
  if (s.step === '2 / 3') {
    await clickCenter(btn(s, ['上一題']).rect)
    await settleAfterInteraction(page, { frames: 5 })
    s = await readCard(page)
    if (s.step !== '1 / 3' || !noneChecked(s)) throw new Error(`按「上一題」沒回到沒選的第 1 題(${s.step}、${JSON.stringify(s.controls.map((c) => c.checked))})`)
  }

  // ── 滑鼠選第一個選項 → 鈕出現 ──
  await pickRadio(s, 0)
  s = await readCard(page)
  if (s.controls[0].checked !== 'true') throw new Error('點第一張卡沒有選中第一個選項(選項卡點擊壞了,不是本閘量的事)')
  record('O2', '選了之後「清除選取」出現、看得見、在 footer 裡、是 footer 的第一顆', !!s.clear && s.clear.inFooter && s.clear.firstInFooter,
    JSON.stringify(s.clear && { inFooter: s.clear.inFooter, first: s.clear.firstInFooter }) ?? '沒有')
  if (s.clear) {
    const nav = btn(s, NAV)
    record('O3', '左緣 = 題目標題左緣、垂直中線 = 右側兩鈕中線',
      near(s.clear.rect.x, s.title.x) && near(s.clear.rect.y + s.clear.rect.h / 2, nav.rect.y + nav.rect.h / 2),
      `左緣 ${s.clear.rect.x.toFixed(2)} vs 標題 ${s.title.x.toFixed(2)};中線 ${(s.clear.rect.y + s.clear.rect.h / 2).toFixed(2)} vs ${(nav.rect.y + nav.rect.h / 2).toFixed(2)}`)
    const keys = Object.keys(nav.look)
    const diff = keys.filter((k) => String(s.clear.look[k]) !== String(nav.look[k]))
    record('O4', '長相 = 同一列的「跳過」(tertiary sm:高 / 字級 / 字重 / 顏色 / 底色 / 左右內距 / 圓角)', diff.length === 0,
      diff.map((k) => `${k} ${s.clear.look[k]} vs ${nav.look[k]}`).join(';'))
  } else {
    pre('O3', '左緣 / 中線', '鈕沒出現'); pre('O4', '長相 = 跳過', '鈕沒出現')
  }
  record('O5', '鈕出現前後:右側兩鈕、footer、決策卡上緣的位置不變',
    sameRect(btn(s, NAV)?.rect, base.nav) && sameRect(btn(s, PRIMARY)?.rect, base.primary) && sameRect(s.footer, base.footer) && near(s.rootTop, base.top),
    `跳過 ${JSON.stringify(btn(s, NAV)?.rect)} vs ${JSON.stringify(base.nav)};footer ${JSON.stringify(s.footer)} vs ${JSON.stringify(base.footer)};上緣 ${s.rootTop} vs ${base.top}`)
  if (fault === 'hidden' || fault === 'variant' || fault === 'jump') return results

  // ── 滑鼠按「清除選取」──
  if (s.clear) {
    await clickCenter(s.clear.rect)
    s = await readCard(page)
    record('O6', '滑鼠按了:都沒選、鈕消失、焦點在第一個圓(不在 body)、右側兩鈕不動',
      noneChecked(s) && s.clearCount === 0 && s.active?.id === s.controls[0].id && sameRect(btn(s, NAV)?.rect, base.nav) && sameRect(btn(s, PRIMARY)?.rect, base.primary),
      JSON.stringify({ checked: s.controls.map((c) => c.checked), clear: s.clearCount, active: s.active, first: s.controls[0].id }))
  } else pre('O6', '滑鼠按了清掉', '鈕沒出現')

  // ── 鍵盤:選第一個圓(Space)→ Tab 到「清除選取」→ Enter / Space ──
  for (const key of ['Enter', 'Space']) {
    const id = key === 'Enter' ? 'O7' : 'O8'
    await page.evaluate((cid) => document.getElementById(cid)?.focus(), s.controls[0].id)
    await press('Space')
    s = await readCard(page)
    if (s.controls[0].checked !== 'true') { pre(id, `鍵盤 ${key}`, `焦點在第一個圓按 Space 沒選中(${JSON.stringify(s.controls.map((c) => c.checked))})`); continue }
    let reached = false
    for (let i = 0; i < 6 && !reached; i++) { await press('Tab'); s = await readCard(page); reached = s.active?.text === CLEAR }
    if (!reached) { record(id, `鍵盤:Tab 走得到「清除選取」,按 ${key} 清掉、焦點回第一個圓`, false, `Tab 6 次沒停在「清除選取」(最後焦點 ${JSON.stringify(s.active)})`); continue }
    await press(key)
    s = await readCard(page)
    record(id, `鍵盤:Tab 走得到「清除選取」,按 ${key} → 都沒選、鈕消失、焦點在第一個圓(不在 body)`,
      noneChecked(s) && s.clearCount === 0 && s.active?.id === s.controls[0].id && !s.active?.isBody,
      JSON.stringify({ checked: s.controls.map((c) => c.checked), clear: s.clearCount, active: s.active }))
  }
  if (fault === 'focus') return results

  // ── 「其他」:點卡 → 聚焦輸入格(選中「其他」)→ 打字 → 清除:字一起清 ──
  const otherCard = s.cards[2]
  await page.mouse.click(otherCard.x + otherCard.w - 4, otherCard.y + 4)
  await flushOn(page)
  await page.keyboard.type('董事會')
  await flushOn(page)
  s = await readCard(page)
  record('O9', '選「其他」打了字 → 「清除選取」出現', s.controls[2].checked === 'true' && !!s.clear, JSON.stringify({ other: s.controls[2].checked, clear: !!s.clear, value: s.input?.value }))
  if (s.clear) {
    await clickCenter(s.clear.rect)
    s = await readCard(page)
    record('O10', '按了 → 「其他」沒選、輸入格的字清空、鈕消失、焦點在第一個圓',
      noneChecked(s) && s.input?.value === '' && s.clearCount === 0 && s.active?.id === s.controls[0].id,
      JSON.stringify({ checked: s.controls.map((c) => c.checked), value: s.input?.value, clear: s.clearCount, active: s.active }))
  } else pre('O10', '清除「其他」', '鈕沒出現')
  if (fault === 'otherText') return results

  // ── 往第 2 題 ──
  await clickCenter(btn(s, PRIMARY).rect)
  await settleAfterInteraction(page, { frames: 5 })
  s = await readCard(page)
  if (s.step !== '2 / 3') {
    for (const [id, label] of [['O12', '預選的選填題一開始就有鈕'], ['O13', '清掉預選再前進'], ['O14', '複選沒有鈕'], ['O15', '複選不勾照常送出']]) pre(id, label, '到不了第 2 題')
    return results
  }

  // ── 第 2 題(選填、預選建議解):一開始就有選取 → 鈕一開始就在;清掉後前進 ──
  record('O12', '第 2 題(選填、預選建議解)一開始就有選取,「清除選取」一開始就在(右側是「上一題 / 下一題」)',
    s.controls[0].checked === 'true' && !!s.clear && !!btn(s, ['上一題']), JSON.stringify({ checked: s.controls.map((c) => c.checked), clear: !!s.clear, buttons: s.buttons.map((b) => b.text) }))
  if (s.clear) {
    const before2 = { nav: btn(s, NAV)?.rect, primary: btn(s, PRIMARY)?.rect }
    await clickCenter(s.clear.rect)
    s = await readCard(page)
    const cleared = noneChecked(s) && s.clearCount === 0 && sameRect(btn(s, NAV)?.rect, before2.nav) && sameRect(btn(s, PRIMARY)?.rect, before2.primary)
    await clickCenter(btn(s, PRIMARY).rect)
    await settleAfterInteraction(page, { frames: 5 })
    s = await readCard(page)
    record('O13', '清掉預選 → 都沒選、鈕消失、右側兩鈕不動;按「下一題」前進到 3 / 3、沒有錯誤', cleared && s.step === '3 / 3' && !s.error, `清掉 ${cleared};${s.step}、錯誤 ${s.error ?? '無'}`)
  } else pre('O13', '清掉預選再前進', '鈕不在')
  if (s.step !== '3 / 3') { pre('O14', '複選沒有鈕', '到不了第 3 題'); pre('O15', '複選不勾照常送出', '到不了第 3 題'); return results }

  // ── 第 3 題(選填、複選):勾了也沒有鈕;不勾按「送出」沒有錯誤 ──
  await page.waitForSelector('[role="checkbox"]', { timeout: 10_000 })
  s = await readCard(page)
  await page.mouse.click(s.cards[0].x + 40, s.cards[0].y + 14)
  await flushOn(page)
  s = await readCard(page)
  record('O14', '第 3 題(複選)勾了一項 → 沒有「清除選取」(方框本來就能取消)', s.controls[0].checked === 'true' && s.clearCount === 0, JSON.stringify({ checked: s.controls[0].checked, clear: s.clearCount }))
  await page.mouse.click(s.cards[0].x + 40, s.cards[0].y + 14)
  await flushOn(page)
  s = await readCard(page)
  await clickCenter(btn(s, PRIMARY).rect)
  await settleAfterInteraction(page, { frames: 5 })
  s = await readCard(page)
  record('O15', '選填複選一項都不勾按「送出」→ 沒有錯誤訊息', !!s && !s.error && noneChecked(s), `錯誤 ${s?.error ?? '無'}`)
  return results
}

async function runRequired(fault) {
  const results = []
  await open(REQUIRED_STORY, fault)
  let s = await readCard(page)
  if (!s || s.step !== '1 / 3') throw new Error(`必答對照 story 第 1 題讀不到(${s?.step})`)
  const preselected = s.controls[0].checked === 'true'
  await pickRadio(s, 1)
  s = await readCard(page)
  results.push({ id: 'O16', label: '必答題(預選)有選取、換選第二個之後,都沒有「清除選取」', pass: preselected && s.controls[1].checked === 'true' && s.clearCount === 0,
    detail: JSON.stringify({ preselected, second: s.controls[1].checked, clear: s.clearCount }) })
  return results
}

const runs = SELFTEST ? Object.keys(FAULTS) : [null]
const report = []
for (const fault of runs) {
  try {
    const results = []
    if (fault !== 'required') results.push(...await runOptional(fault))
    if (!fault || fault === 'required') results.push(...await runRequired(fault))
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
  console.log(ok ? '\n✓ selftest:六種病都被指名,量具會紅' : '\n✗ selftest:沒抓全(這支閘是假綠)')
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
