#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: AgentDecisionCard 的「下一題 / 送出」恆可按(沒選、「其他」文字空白時都不停用);按下時這一題沒過 →
 *         不前進,錯誤訊息出現在最後一張選項卡之後、左緣對齊選項卡;與最後一張卡的距離守的是**現行值** = 卡間距(卡 i+1 上緣 − 卡 i 下緣)
 *         —— 這個距離【待確認】(user 2026-10-29 問句中的提案,另一案 = Field 內部 gap-1 4;agent-decision-card.spec.md「步進」),
 *         user 選定後 E4 / E10 與 agent-panel.tsx 一起改;
 *         字級 / 行高 / 字重 / 顏色等於 Field 裡的 FieldError(量 Field「垂直」story 裡出錯那一欄的 FieldError),role="alert";
 *         焦點移到第一個出錯的控件(「其他」空白 → 輸入格;複選沒勾 → 第一個方框);「其他」那一種輸入格的框色 = Field 裡出錯的
 *         Input 框色、aria-invalid + aria-errormessage 指向錯誤訊息;複選沒勾 → 群組 aria-invalid、每個方框 aria-invalid +
 *         aria-errormessage;改答案 / 打字即清掉;按著滑鼠的那一下改了答案(按下「其他」輸入格 = 按下即選中),按下到放開之間
 *         版面不動、放開後「其他」恰好是勾上的、焦點在輸入格、錯誤才清;填好之後按下去照常前進;footer 按鈕位置在錯誤出現前後不變。
 *         不預選的單選(`noDefault`,N 系列):一打開沒有任何選取、沒有「(建議)」;沒選就按「送出」→ 不送出、錯誤「請選擇一個選項」
 *         (距離 / 字樣同上)、radiogroup 本身 aria-invalid + aria-errormessage(WAI-ARIA 1.2 兩者適用於 radiogroup、不適用於 radio)、
 *         焦點在第一個圓;選了即清,再按「送出」照常送出(卡片收起)。
 *         量的是 disabled / aria-disabled 屬性、getBoundingClientRect、getComputedStyle、document.activeElement、aria-checked,
 *         不讀 class(M37)。
 *   紅: --selftest 逐一補回五種病(每種開一次新頁):① 主鈕被停用 ② 錯誤訊息比卡間距近 4px ③ 按下後焦點沒去第一個錯
 *       ④ 按著「其他」輸入格的那一下錯誤就消失(按下與放開之間版面移動)⑤ 錯誤訊息字級跟 Field 不同 —— 各自必須被指名紅;
 *       ①②③⑤ 在不預選那一路也必須各自被指名(N2 / N6 / N5 / N7;④ 只有「其他」輸入格那一路有)
 *   綠: 現行 agent-panel.tsx(advance / clearError / FieldError 放在選項卡同一個 gap 8 堆疊;按壓延後走 lib/press-settle.ts)全綠;
 *       修前(56dda7ce,disabled={!canAdvance})的建置:主鈕停用 → B1 / B2 紅,按了沒有錯誤訊息 → E 系列紅(本機實測,見 commit 說明)
 *
 * ── 為什麼有這支 ──
 *
 * user 2026-10-29(問句):「此外決策卡是否next/submit按鈕都不應該disable?然後點擊這些按鈕若有出錯
 * 應該用跟 field 的 error msg 一樣的字放在最後一個選項的後面跟最後一個選項距離=選項跟選項之間的距離？你覺得如何？」
 * 規則:`Field/form-validation.spec.md`「Submit Button 狀態」新建那列(不看填了沒、填對沒)+ 規則 5 / 7 / 8;
 * `Steps/steps.spec.md`「目前那一步底下的按鈕」(按「下一步」先驗這一頁);決策卡的寫法住 `agent-decision-card.spec.md`「步進」。
 *
 * ── 量法 ──
 *
 * 參照:先開 Field「垂直」story,量出錯欄位的 FieldError(字級 / 行高 / 字重 / 字族 / 顏色)與出錯 Input 外框的框色。
 * 決策卡三題步進(DecisionCardOpen):第 1 題單選(「其他」空白那一種)、第 3 題複選(沒勾那一種 + 按著指標的那一下)。
 * 決策卡不預選單選(DecisionCardNoDefault,必答的署名題 noDefault):沒選那一種(取代 n5 只有本機探針的 probe-nodefault-single)。
 * 每一下點擊都是真滑鼠(page.mouse,含 mousedown);點完等兩層 setTimeout(0)(點擊排的計時器跑完、React 重畫)再讀。
 * 開不起來 / 量途中找不到元素 → 儀器失效(exit 2),不是產品裁決,也絕不當成通過。
 *
 * Run: `node scripts/agent-decision-card-validation-invariant.mjs [--selftest] [--static-dir <Storybook 建置>]`
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
const CARD_STORY = 'design-system-components-agentpanel-展示--decision-card-open'
const NODEFAULT_STORY = 'design-system-components-agentpanel-展示--decision-card-no-default'
const FIELD_STORY = 'design-system-components-field-展示--vertical'
const SELFTEST = process.argv.includes('--selftest')
const CARD = '[class~="group/agent-option"]'
const CONTROL = '[role="checkbox"], [role="radio"]'
const OTHER_INPUT = 'input[aria-label="其他(自由輸入)"]'
// 錯誤文案【待確認】(agent-panel.tsx DEFAULT_DECISION_LABELS 的 errorOther / errorMulti / errorSingle,AI 擬的建議、交 user 定);user 換字時兩邊一起改
const TEXT = { other: '請輸入其他選項', multi: '請至少選擇一個選項', single: '請選擇一個選項' }
const RECOMMENDED_SUFFIX = '(建議)' // agent-panel.tsx RECOMMENDED_SUFFIX

// 建置不比被驗的原始碼舊(lib/launch-browser.mjs requireFreshStorybookBuild):決策卡本體、兩則 story、FieldError、Input 的錯誤框、按壓延後。
requireFreshStorybookBuild(STATIC, [
  'packages/design-system/src/components/AgentPanel/agent-panel.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel.stories.tsx',
  'packages/design-system/src/components/Field/field.tsx',
  'packages/design-system/src/components/Input/input.tsx',
  'packages/design-system/src/components/Field/field-wrapper.tsx',
  'packages/design-system/src/lib/press-settle.ts',
])

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
const storyUrl = (id) => `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`

/** 對照組(只在 --selftest):每種病一段頁面層注入,不改元件原始碼 —— 量具抓不到它們,就抓不到它們回來。 */
const FAULTS = {
  disabled: {
    expect: ['B1', 'N2'],
    what: '① 主鈕被停用(修前 disabled={!canAdvance})',
    // 注入當下先停用一次:頁面在注入後若沒有再變動(不預選單選那則一打開就靜止),只掛 MutationObserver 永遠不會觸發 → 對照組假綠
    script: `(() => { const off = () => { for (const b of document.querySelectorAll('button')) { const t = b.textContent.trim(); if ((t === '下一題' || t === '送出') && !b.disabled) b.disabled = true } }; off(); new MutationObserver(off).observe(document.documentElement, { subtree: true, childList: true, attributes: true }) })()`,
  },
  gap: {
    expect: ['E4', 'N6'],
    what: '② 錯誤訊息比卡間距近 4px',
    css: `[data-field-slot="error"] { margin-top: -4px !important }`,
  },
  focus: {
    expect: ['E5', 'N5'],
    what: '③ 按下後焦點沒去第一個錯',
    script: `document.addEventListener('click', (e) => { const b = e.target instanceof Element && e.target.closest('button'); const t = b && b.textContent.trim(); if (t === '下一題' || t === '送出') setTimeout(() => document.activeElement && document.activeElement.blur(), 0) }, true)`,
  },
  press: {
    expect: ['M1'],
    what: '④ 按著「其他」輸入格的那一下錯誤就消失',
    css: `div:has(> [role="group"] input:focus) > [data-field-slot="error"] { display: none !important }`,
  },
  type: {
    expect: ['E3', 'N7'],
    what: '⑤ 錯誤訊息字級跟 Field 不同',
    css: `[data-field-slot="error"] { font-size: 12px !important }`,
  },
}

const flushOn = (page) => page.evaluate(() => new Promise((r) => setTimeout(() => setTimeout(r, 0), 0)))
/** 等有限次的動畫 / 過渡跑完再量(框色有 transition-colors;卡片進場有淡入下滑)—— 量到過渡中間值是已知陷阱(AGENTS 失敗記憶索引)。
 *  無限循環的動畫(代理標誌呼吸)不等;上限 3 秒,超過照量(值若還在變,比對會紅,不會假綠)。 */
const settleTransitions = (page) => page.evaluate(async () => {
  const finite = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity)
  await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 3000))])
})

// 全程一個分頁(--single-process 下關掉最後一個分頁會連瀏覽器一起關):每一輪都是在同一分頁重新導覽,上一輪注入的病隨舊文件一起消失。
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

/** 在同一分頁開一則 story;fault = FAULTS 的一個鍵(頁面層注入在靜止判定之前)。 */
async function open(id, waitFor, fault = null) {
  const f = fault ? FAULTS[fault] : null
  const beforeSettle = f ? async (p) => {
    if (f.css) await p.addStyleTag({ content: f.css })
    if (f.script) await p.addScriptTag({ content: f.script })
  } : null
  await openStory(page, storyUrl(id), { waitFor, settleFrames: 10, notFound: server.notFound, beforeSettle })
  await settleTransitions(page)
  return page
}

/** Field 參照:出錯欄位的 FieldError 字樣與出錯 Input 的框色。
 *  認的是結構(出錯的 Field 裡有 Input 與 FieldError),不認範例文案:原本比對字「密碼長度不足」,fields 家族 a1594483 把
 *  Field「垂直」story 的錯誤字改成「請輸入密碼」後,這裡在整合樹上變成 INSTRUMENT-FAIL —— 量的是 FieldError 的字樣與框色,
 *  不是那句話(M37:別拿當下剛好成立的文案當身分)。 */
async function readFieldReference() {
  await open(FIELD_STORY, '[data-field-slot="error"]')
  const ref = await page.evaluate(() => {
    const err = document.querySelector('[data-field-invalid] [data-field-slot="error"]')
    const field = err?.closest('[data-field-invalid]')
    const input = field?.querySelector('input')
    const chrome = input?.closest('[data-field-mode]')
    if (!err || !input) return { found: false, text: err?.textContent ?? null, invalidBorder: null }
    const cs = getComputedStyle(err)
    const ch = chrome && chrome !== field ? getComputedStyle(chrome) : null
    return {
      found: true,
      font: { fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight, fontFamily: cs.fontFamily, color: cs.color },
      invalidBorder: ch && parseFloat(ch.borderTopWidth) > 0 ? ch.borderTopColor : null,
      text: err.textContent,
    }
  })
  if (!ref.found || !ref.text?.trim() || !ref.invalidBorder) throw new Error(`Field 參照讀不到(出錯的 Field ${ref.found ? '有' : '沒有'} Input 與 FieldError、錯誤字「${ref.text}」、框色 ${ref.invalidBorder})`)
  return ref
}

/** 決策卡目前的狀態:步數、主鈕、錯誤訊息(位置 / 字樣 / aria)、選項卡幾何、焦點、控件狀態。 */
const readCard = (page) => page.evaluate(({ CARD, CONTROL, OTHER_INPUT }) => {
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom } }
  const cards = [...document.querySelectorAll(CARD)]
  const root = cards[0] && (() => { let el = cards[0].parentElement; while (el && !(el.getAttribute('role') === 'group' && el.querySelector('button[aria-label="跳過"]'))) el = el.parentElement; return el })()
  if (!root) return null
  const stepEl = [...root.querySelectorAll('span')].find((s) => /^\s*\d+ \/ \d+\s*$/.test(s.textContent))
  const primary = [...root.querySelectorAll('button')].find((b) => ['下一題', '送出'].includes(b.textContent.trim()))
  const err = root.querySelector('[data-field-slot="error"]')
  const cs = err ? getComputedStyle(err) : null
  const input = root.querySelector(OTHER_INPUT)
  const chrome = input?.closest('[data-field-mode]')
  const controls = [...root.querySelectorAll(CONTROL)]
  const group = controls[0]?.closest('[role="group"], [role="radiogroup"]')
  const a = document.activeElement
  return {
    step: stepEl ? stepEl.textContent.trim() : '(單題)',
    question: root.querySelector('[id]')?.textContent ?? '',
    primary: primary ? { text: primary.textContent.trim(), disabled: primary.disabled, ariaDisabled: primary.getAttribute('aria-disabled'), dataDisabled: primary.hasAttribute('data-disabled'), rect: rect(primary) } : null,
    cards: cards.map(rect),
    error: err ? {
      id: err.id, text: err.textContent, role: err.getAttribute('role'), rect: rect(err),
      font: { fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight, fontFamily: cs.fontFamily, color: cs.color },
      visible: err.checkVisibility(),
    } : null,
    input: input ? { invalid: input.getAttribute('aria-invalid'), errormessage: input.getAttribute('aria-errormessage'), border: chrome ? getComputedStyle(chrome).borderTopColor : null, rect: rect(input), value: input.value } : null,
    controls: controls.map((c) => ({ id: c.id, role: c.getAttribute('role'), checked: c.getAttribute('aria-checked'), invalid: c.getAttribute('aria-invalid'), errormessage: c.getAttribute('aria-errormessage') })),
    group: group ? { role: group.getAttribute('role'), invalid: group.getAttribute('aria-invalid'), errormessage: group.getAttribute('aria-errormessage') } : null,
    active: a ? { id: a.id, tag: a.tagName, role: a.getAttribute('role'), isOtherInput: a.matches(OTHER_INPUT) } : null,
  }
}, { CARD, CONTROL, OTHER_INPUT })

const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol
const clickCenter = async (page, r) => { await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2); await flushOn(page) }

/**
 * 跑一輪(fault = null 是正式量;否則只跑抓那種病需要的段落)。回傳 { results: [{id, label, pass, detail}], reached }
 */
async function runCard(ref, fault) {
  const results = []
  const record = (id, label, pass, detail = '') => results.push({ id, label, pass, detail })
  await open(CARD_STORY, CARD, fault)
  {
    // ── 第 1 題(單選):選「其他」、文字留空,按「下一題」──
    let s = await readCard(page)
    if (!s || s.cards.length !== 3) throw new Error(`第 1 題應為 3 張單選卡,讀到 ${s?.cards.length}`)
    const lastCard = s.cards[2]
    await page.mouse.click(lastCard.x + lastCard.w - 4, lastCard.y + 4) // 「其他」卡右上內距 → 選中「其他」、焦點進輸入格
    await flushOn(page)
    s = await readCard(page)
    record('B1', '第 1 題「其他」選中而文字空白:「下一題」可按(沒有 disabled / aria-disabled / data-disabled)',
      s.primary && !s.primary.disabled && s.primary.ariaDisabled !== 'true' && !s.primary.dataDisabled,
      JSON.stringify(s.primary && { disabled: s.primary.disabled, ariaDisabled: s.primary.ariaDisabled, dataDisabled: s.primary.dataDisabled }))
    const before = s
    await clickCenter(page, s.primary.rect)
    await settleAfterInteraction(page, { frames: 5 })
    await settleTransitions(page)
    s = await readCard(page)
    record('E1', '按了「下一題」沒過 → 不前進(仍是 1 / 3)', s.step === before.step, `${before.step} → ${s.step}`)
    record('E2', `錯誤訊息出現、字是「${TEXT.other}」、role="alert"、看得見`, s.error?.text === TEXT.other && s.error.role === 'alert' && s.error.visible,
      JSON.stringify(s.error && { text: s.error.text, role: s.error.role, visible: s.error.visible }))
    if (s.error) {
      const sameFont = Object.keys(ref.font).every((k) => s.error.font[k] === ref.font[k])
      record('E3', '錯誤訊息字級 / 行高 / 字重 / 字族 / 顏色 = Field 的 FieldError', sameFont, `決策卡 ${JSON.stringify(s.error.font)} vs Field ${JSON.stringify(ref.font)}`)
      const gapCards = s.cards[1].y - s.cards[0].bottom
      const gapError = s.error.rect.y - s.cards[s.cards.length - 1].bottom
      record('E4', '錯誤訊息在最後一張卡之後、左緣對齊選項卡;距離 = 現行值卡間距 8(【待確認】user 提案,另一案 Field gap-1 4)',
        near(gapError, gapCards) && near(gapCards, 8) && near(s.error.rect.x, s.cards[0].x),
        `卡間距 ${gapCards.toFixed(2)}、錯誤距最後一張卡 ${gapError.toFixed(2)}、左緣 ${s.error.rect.x.toFixed(2)} vs 卡 ${s.cards[0].x.toFixed(2)}`)
    } else {
      record('E3', '錯誤訊息字樣 = Field 的 FieldError', false, '沒有錯誤訊息')
      record('E4', '錯誤訊息距離 = 卡間距', false, '沒有錯誤訊息')
    }
    record('E5', '焦點在「其他」輸入格(第一個出錯的控件)', s.active?.isOtherInput === true, JSON.stringify(s.active))
    record('E6', '輸入格 aria-invalid=true、aria-errormessage 指向錯誤訊息、框色 = Field 出錯 Input 的框色',
      s.input?.invalid === 'true' && !!s.error && s.input.errormessage === s.error.id && s.input.border === ref.invalidBorder,
      `${JSON.stringify(s.input && { invalid: s.input.invalid, errormessage: s.input.errormessage, border: s.input.border })} vs 錯誤 id ${s.error?.id}、Field 框色 ${ref.invalidBorder}`)
    record('E7', '錯誤出現前後 footer 主鈕位置不變(卡貼底往上長)', !!s.primary && near(s.primary.rect.y, before.primary.rect.y) && near(s.primary.rect.x, before.primary.rect.x),
      `y ${before.primary.rect.y.toFixed(2)} → ${s.primary?.rect.y.toFixed(2)}`)
    if (fault === 'disabled' || fault === 'gap' || fault === 'focus' || fault === 'type') return { results, reached: true }

    // 打字即清掉;填好後前進
    await page.keyboard.type('週五前')
    await flushOn(page)
    s = await readCard(page)
    record('C1', '在「其他」打字 → 錯誤清掉、輸入格不再 aria-invalid', !s.error && s.input?.invalid !== 'true', JSON.stringify({ error: s.error?.text, invalid: s.input?.invalid }))
    await clickCenter(page, s.primary.rect)
    await settleAfterInteraction(page, { frames: 5 })
    s = await readCard(page)
    record('A1', '填好之後按「下一題」→ 前進到 2 / 3', s.step === '2 / 3', s.step)
    await clickCenter(page, s.primary.rect)
    await settleAfterInteraction(page, { frames: 5 })
    await page.waitForSelector('[role="checkbox"]', { timeout: 10_000 })
    await settleAfterInteraction(page, { frames: 5 })

    // ── 第 3 題(複選,一項都沒勾):鍵盤在「送出」上按 Enter ──
    s = await readCard(page)
    if (s.step !== '3 / 3' || s.cards.length !== 4) throw new Error(`應到第 3 題的 4 張複選卡,讀到 ${s.step}、${s.cards.length} 張`)
    record('B2', '第 3 題一項都沒勾:「送出」可按', s.primary && s.primary.text === '送出' && !s.primary.disabled && s.primary.ariaDisabled !== 'true' && !s.primary.dataDisabled,
      JSON.stringify(s.primary && { text: s.primary.text, disabled: s.primary.disabled, ariaDisabled: s.primary.ariaDisabled }))
    const pressEnterOnSubmit = async () => {
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '送出').focus())
      await page.keyboard.press('Enter')
      await flushOn(page)
      await settleAfterInteraction(page, { frames: 5 })
      await settleTransitions(page)
      return readCard(page)
    }
    s = await pressEnterOnSubmit()
    const firstBox = s.controls[0]
    record('E8', `複選沒勾:錯誤「${TEXT.multi}」、焦點在第一個方框`, s.error?.text === TEXT.multi && s.active?.id === firstBox?.id,
      `錯誤 ${s.error?.text}、焦點 ${JSON.stringify(s.active)}、第一個方框 ${firstBox?.id}`)
    record('E9', '複選沒勾:群組 aria-invalid、每個方框 aria-invalid + aria-errormessage 指向錯誤訊息',
      !!s.error && s.group?.invalid === 'true' && s.controls.every((c) => c.invalid === 'true' && c.errormessage === s.error.id),
      JSON.stringify({ group: s.group, controls: s.controls.map((c) => [c.invalid, c.errormessage]), errorId: s.error?.id }))
    if (s.error) {
      const gapError = s.error.rect.y - s.cards[s.cards.length - 1].bottom
      record('E10', '複選:錯誤訊息距最後一張卡 = 現行值卡間距(【待確認】,同 E4)', near(gapError, s.cards[1].y - s.cards[0].bottom), `錯誤距 ${gapError.toFixed(2)}`)
    }
    // 點一張具名卡的標籤 → 恰好勾上、錯誤在這一下點完之後清掉;再點一次取消,回到一項都沒勾
    const slack = s.cards[0]
    await page.mouse.click(slack.x + 40, slack.y + 14)
    await flushOn(page)
    s = await readCard(page)
    record('C2', '複選:點第一張卡 → 勾上、錯誤清掉', s.controls[0].checked === 'true' && !s.error, JSON.stringify({ checked: s.controls[0].checked, error: s.error?.text }))
    await page.mouse.click(s.cards[0].x + 40, s.cards[0].y + 14)
    await flushOn(page)
    s = await pressEnterOnSubmit()
    // 這是產品行為(沒勾就送出要有錯誤),不是儀器前置:沒有就記紅,後面靠它當前置的 M1 / E11 一併記「前置不成立」
    record('E12', `取消勾選回到一項都沒勾,再按「送出」→ 又出現「${TEXT.multi}」`, s.error?.text === TEXT.multi, `讀到 ${s.error?.text ?? '沒有錯誤訊息'}`)
    if (s.error?.text !== TEXT.multi) {
      record('M1', '按住「其他」輸入格:按下到放開之間版面不動', false, '前置不成立:沒有錯誤訊息可量')
      record('E11', `複選「其他」勾著但空白 → 錯誤「${TEXT.other}」`, false, '前置不成立')
      return { results, reached: true }
    }

    // 按著指標的那一下:滑鼠按在「其他」輸入格上(按下即選中 → 錯誤該清),按下與放開之間版面不能動
    const inputBefore = s.input.rect
    await page.mouse.move(inputBefore.x + inputBefore.w / 2, inputBefore.y + inputBefore.h / 2)
    await page.mouse.down()
    await flushOn(page)
    const during = await readCard(page)
    await page.mouse.up()
    await flushOn(page)
    await settleAfterInteraction(page, { frames: 5 })
    s = await readCard(page)
    const other = s.controls[s.controls.length - 1]
    const still = near(during.input.rect.y, inputBefore.y) && !!during.error
    record('M1', '按住「其他」輸入格:按下到放開之間版面不動(錯誤還在、輸入格沒移動),放開後「其他」勾上、焦點在輸入格、錯誤清掉',
      still && other.checked === 'true' && s.active?.isOtherInput === true && !s.error,
      `按著時輸入格 y ${inputBefore.y.toFixed(2)} → ${during.input.rect.y.toFixed(2)}、錯誤${during.error ? '還在' : '已消失'};放開後「其他」${other.checked}、焦點 ${JSON.stringify(s.active)}、錯誤 ${s.error?.text ?? '無'}`)
    if (fault === 'press') return { results, reached: true }

    // 「其他」勾著但空白 → 送出 → 「其他」那一種錯誤;打字後送出 → 沒有錯誤
    await clickCenter(page, s.primary.rect)
    await settleAfterInteraction(page, { frames: 5 })
    s = await readCard(page)
    record('E11', `複選「其他」勾著但空白 → 錯誤「${TEXT.other}」、焦點在輸入格`, s.error?.text === TEXT.other && s.active?.isOtherInput === true, `錯誤 ${s.error?.text}、焦點 ${JSON.stringify(s.active)}`)
    await page.keyboard.type('LINE 群組')
    await flushOn(page)
    await clickCenter(page, (await readCard(page)).primary.rect)
    await settleAfterInteraction(page, { frames: 5 })
    s = await readCard(page)
    // 讀不到卡 = 已送出、卡片收起(story 的場景送出後就把卡收掉,答案記成決策回執)—— 這正是「沒有錯誤、照常送出」;
    // 整合樹上收起得比量測快,原本直接讀 s.error 變成 INSTRUMENT-FAIL(null),不是產品病
    record('A2', '「其他」填好後按「送出」→ 沒有錯誤訊息(照常送出,卡片收起或仍在但無錯誤)', !s || !s.error, s ? (s.error?.text ?? '') : '卡片已收起')
    return { results, reached: true }
  }
}

/**
 * 不預選的單選(N 系列):DecisionCardNoDefault 只有一題必答的署名題(noDefault),兩個選項 +「其他」= 3 張卡、3 個圓。
 * 在 --selftest 裡同一組頁面層注入也要在這一路被指名(①②③⑤;④ 只在「其他」輸入格那一路)。
 */
async function runNoDefault(ref, fault) {
  const results = []
  const record = (id, label, pass, detail = '') => results.push({ id, label, pass, detail })
  await open(NODEFAULT_STORY, CARD, fault)
  let s = await readCard(page)
  if (!s || s.cards.length !== 3) throw new Error(`不預選單選應為 3 張單選卡,讀到 ${s?.cards.length}`)
  const cardText = await page.evaluate((CARD) => [...document.querySelectorAll(CARD)].map((c) => c.textContent).join('|'), CARD)
  record('N1', `一打開沒有任何選取(每個圓 aria-checked=false)、沒有「${RECOMMENDED_SUFFIX}」`,
    s.controls.length === 3 && s.controls.every((c) => c.role === 'radio' && c.checked === 'false') && !cardText.includes(RECOMMENDED_SUFFIX),
    JSON.stringify({ controls: s.controls.map((c) => [c.role, c.checked]), recommended: cardText.includes(RECOMMENDED_SUFFIX) }))
  record('N2', '沒選:「送出」可按(沒有 disabled / aria-disabled / data-disabled)',
    !!s.primary && s.primary.text === '送出' && !s.primary.disabled && s.primary.ariaDisabled !== 'true' && !s.primary.dataDisabled,
    JSON.stringify(s.primary && { text: s.primary.text, disabled: s.primary.disabled, ariaDisabled: s.primary.ariaDisabled, dataDisabled: s.primary.dataDisabled }))
  const before = s
  await clickCenter(page, s.primary.rect)
  await settleAfterInteraction(page, { frames: 5 })
  await settleTransitions(page)
  s = await readCard(page)
  if (!s) {
    // 卡片收起 = 沒選也送出去了(產品病,不是儀器失效):後面每條都記「前置不成立」
    record('N3', `沒選就按「送出」→ 不送出、錯誤「${TEXT.single}」`, false, '卡片收起了:沒選也送出')
    for (const id of ['N4', 'N5', 'N6', 'N7', 'N8', 'N9']) record(id, '不預選單選', false, '前置不成立:卡片已收起')
    return { results, reached: true }
  }
  record('N3', `沒選就按「送出」→ 不送出、錯誤「${TEXT.single}」、role="alert"、看得見`,
    s.error?.text === TEXT.single && s.error.role === 'alert' && s.error.visible,
    JSON.stringify(s.error && { text: s.error.text, role: s.error.role, visible: s.error.visible }))
  record('N4', 'radiogroup 本身 aria-invalid=true、aria-errormessage 指向錯誤訊息',
    !!s.error && s.group?.role === 'radiogroup' && s.group.invalid === 'true' && s.group.errormessage === s.error.id,
    JSON.stringify({ group: s.group, errorId: s.error?.id }))
  record('N5', '焦點在第一個圓(第一個出錯的控件)', !!s.active && s.active.id === s.controls[0]?.id, `焦點 ${JSON.stringify(s.active)}、第一個圓 ${s.controls[0]?.id}`)
  if (s.error) {
    const gapCards = s.cards[1].y - s.cards[0].bottom
    const gapError = s.error.rect.y - s.cards[s.cards.length - 1].bottom
    record('N6', '錯誤訊息在最後一張卡之後、左緣對齊選項卡;距離 = 卡間距 8(【待確認】,同 E4)',
      near(gapError, gapCards) && near(gapCards, 8) && near(s.error.rect.x, s.cards[0].x),
      `卡間距 ${gapCards.toFixed(2)}、錯誤距最後一張卡 ${gapError.toFixed(2)}、左緣 ${s.error.rect.x.toFixed(2)} vs 卡 ${s.cards[0].x.toFixed(2)}`)
    const sameFont = Object.keys(ref.font).every((k) => s.error.font[k] === ref.font[k])
    record('N7', '錯誤訊息字級 / 行高 / 字重 / 字族 / 顏色 = Field 的 FieldError', sameFont, `決策卡 ${JSON.stringify(s.error.font)} vs Field ${JSON.stringify(ref.font)}`)
  } else {
    record('N6', '錯誤訊息距離 = 卡間距', false, '沒有錯誤訊息')
    record('N7', '錯誤訊息字樣 = Field 的 FieldError', false, '沒有錯誤訊息')
  }
  record('N8a', '錯誤出現前後 footer「送出」位置不變', !!s.primary && near(s.primary.rect.y, before.primary.rect.y) && near(s.primary.rect.x, before.primary.rect.x),
    `y ${before.primary.rect.y.toFixed(2)} → ${s.primary?.rect.y.toFixed(2)}`)
  if (fault) return { results, reached: true }

  // 選第一項 → 錯誤清掉;再按「送出」→ 照常送出(卡片收起)
  const first = s.cards[0]
  await page.mouse.click(first.x + 40, first.y + 14)
  await flushOn(page)
  s = await readCard(page)
  record('N8', '點第一張卡 → 恰好選中第一個圓、錯誤清掉、radiogroup 不再 aria-invalid',
    !!s && s.controls[0].checked === 'true' && !s.error && s.group?.invalid !== 'true',
    JSON.stringify(s && { checked: s.controls.map((c) => c.checked), error: s.error?.text, group: s.group }))
  await clickCenter(page, s.primary.rect)
  const closed = await page.waitForFunction((sel) => !document.querySelector(sel), CARD, { timeout: 5_000 }).then(() => true, () => false)
  record('N9', '選了之後按「送出」→ 照常送出(決策卡收起)', closed, closed ? '' : '5 秒內卡片沒有收起')
  return { results, reached: true }
}

let ref
try {
  ref = await readFieldReference()
} catch (error) {
  const msg = error instanceof StoryRenderInstrumentError ? error.message : (error?.message ?? String(error))
  console.error(`✗ INSTRUMENT-FAIL 決策卡驗證:Field 參照量不到 —— ${msg}`)
  await browser.close(); await server.stop(); process.exit(2)
}

const runs = SELFTEST ? Object.keys(FAULTS) : [null]
const report = []
for (const fault of runs) {
  try {
    const card = await runCard(ref, fault)
    // ④(press)只有「其他」輸入格那一路有,不預選那一路不跑
    const noDefault = fault === 'press' ? { results: [] } : await runNoDefault(ref, fault)
    report.push({ fault, results: [...card.results, ...noDefault.results], reached: card.reached })
  } catch (error) {
    const msg = error instanceof StoryRenderInstrumentError ? error.message : (error?.message ?? String(error))
    if (!SELFTEST) {
      console.error(`✗ INSTRUMENT-FAIL 決策卡驗證:量測途中失敗 —— ${msg}`)
      await browser.close(); await server.stop(); process.exit(2)
    }
    report.push({ fault, results: [], reached: false, error: msg })
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
  console.log(ok ? '\n✓ selftest:五種病都被指名,量具會紅' : '\n✗ selftest:沒抓全(這支閘是假綠)')
  process.exit(ok ? 0 : 1)
}

const { results } = report[0]
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.id} | ${r.label}${r.pass ? '' : ` | ${r.detail}`}`)
const failed = results.filter((r) => !r.pass)
if (failed.length) {
  console.error(`\n✗ 決策卡驗證:${failed.length} / ${results.length} 條失敗`)
  process.exit(1)
}
console.log(`\n✓ 決策卡驗證全過(${results.length} 條)`)
