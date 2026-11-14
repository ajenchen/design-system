#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: AgentDecisionCard 的「下一題 / 送出」恆可按(沒選、「其他」文字空白時都不停用);按下時這一題沒過 →
 *         不前進,錯誤訊息出現在最後一張選項卡之後、左緣對齊選項卡;與最後一張卡的距離 = 卡間距(卡 i+1 上緣 − 卡 i 下緣)
 *         —— 定案(user 2026-10-29 問句「…跟最後一個選項距離=選項跟選項之間的距離？你覺得如何？」照提案落地;8 是 AI 依既有規則定:
 *         Polaris ChoiceList / Carbon 都不讓錯誤比選項之間更近,Field 內部 gap-1 4 排除;出處見 agent-decision-card.spec.md「步進」),
 *         改距離時 E4 / E10 / N6 與 agent-panel.tsx 一起改;
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
 *         標題列 → 選項、選項 → 按鈕的間距(G 系列,2026-11-13;agent-decision-card.spec.md「8. AgentDecisionCard(決策卡)」第二條(繼承 Popover surface
 *         那一條)+ layoutSpace.spec.md 規則 2「適用範圍與量法三點」(2),皆【AI 推導 2026-11-13】—— user 沒有逐字講過這一段):標題列下、footer 上沒有分隔線(G1);
 *         「標頭內容的底」→ 第一張選項卡頂 = 該處讀到的 --layout-space-tight(G2)—— 直接量畫面上那一段:找標題列裡每個看得見的內容(題目、小標、× 的圖示),取底最低的那個。下一行的定義句與兩份規格是同一句(layoutSpace.spec.md 規則 2「適用範圍與量法三點」(2)、agent-decision-card.spec.md「8. AgentDecisionCard(決策卡)」第二條;改這一句時三處一起改,目前沒有機械檢查守這件事):
 *         「標頭內容的底」= 標頭裡最低的那個內容的外框底(正常情況下 = 標頭外框底扣掉它自己的下內距);「內容」只算畫面上看得見的東西【AI 推導 2026-11-13】—— 有自己的字的元素、圖示 / 圖片、有看得見的框線 / 跟外層不同的底色 / 陰影的塊;外框看不見的包層(含框線與底色都透明的圖示按鈕)不算它自己的外框,往裡找看得見的東西;只有字、沒有框的元素取內容框的底(它自己的下內距是空白,不是內容);絕對定位的裝飾不算;量的時候指標移開(滑過時按鈕有底色,外框就看得見了);逐項判法住 `scripts/header-first-gap-invariant.mjs` 的頁面量具(決策卡那支閘用的是同一份);例:沒有小標的 AgentDecisionCard,× 鈕的外框是透明的、比題目那一行低 3.5 / 5.5px(一般 / 大密度),看不到、不算 —— 最低的內容是題目那一行,量到 12 / 16;把 × 的外框算進去會量成 8.5 / 10.5(這幾個數字是量到的現況)。
 *         2026-11-13 前這一格量的是「標題列外框底 − 它自己的下內距 → 第一張卡」= 標題列的下內距本身(代理,M37):題目下方多出內距以外的空白時
 *         (審查實測:題目那一塊下方多 8px、或標題列被撐高而題目貼頂,題目字底到第一張卡的距離從 14 變成 25.5 / 34),那個算式仍是 12、G2 / G3 都綠;
 *         這一段只由標題列的下內距給,body 上下不另給 —— 標題列外框底 → 第一張卡 = 0、最後一張卡(有錯誤時是錯誤訊息)底 → footer 外框頂 = 0(G3);
 *         最後一張卡(或錯誤訊息)底 → footer 按鈕頂 = tight(G4)。有小標「n / N」(DecisionCardOpen)與沒有小標(DecisionCardSingle)× 一般 / 大密度各量一次。
 *         選項區是捲動區:第一張卡往上到卡片根有任何一層被捲動過、或把內容卡掉(選項比裝得下的高)→ 這幾段量不了 = 儀器失效,不拿去判產品。
 *   紅: --selftest 逐一補回十一種病(每種開新頁):① 主鈕被停用 ② 錯誤訊息比卡間距近 4px ③ 按下後焦點沒去第一個錯
 *       ④ 按著「其他」輸入格的那一下錯誤就消失(按下與放開之間版面移動)⑤ 錯誤訊息字級跟 Field 不同 —— 各自必須被指名紅;
 *       ①②③⑤ 在不預選那一路也必須各自被指名(N2 / N6 / N5 / N7;④ 只有「其他」輸入格那一路有);
 *       間距六種(四格 = 有 / 沒有小標 × 兩密度,每一格都要紅):⑥ body 頂部又給一次內距(兩層各給一次 = 題目到選項 md 24 / lg 32)→ G2 / G3
 *       ⑦ 標題列下內距歸零 → G2 ⑧ 標題列補回分隔線 → G1 ⑨ footer 上內距歸零 → G4
 *       ⑩ 題目下方多 8px(內距以外的空白;審查示範用的同一段注入)→ G2 ⑪ 標題列被撐高、題目貼頂 → G2(⑩ ⑪ 在 2026-11-13 前的算式下 G2 / G3 全綠);
 *       另兩種不是病、是量不了:⑫ 選項區被卡矮並捲到底 ⑬ 選項區被卡矮、停在頂端 → 必須判成儀器失效(點名「選項區…」),而且沒有任何一條 G 被記成產品紅。
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
// 頁面端「看得見的東西 / 底邊」的判法只有一個住所(M17):規則 2 那支閘的 pageKit(同 header-content-sides-invariant.mjs 的用法);那支檔被 import 時不會自己跑
import { installPageKit } from './header-first-gap-invariant.mjs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const staticDirArg = process.argv.find((a) => a.startsWith('--static-dir='))?.slice('--static-dir='.length)
  ?? (process.argv.includes('--static-dir') ? process.argv[process.argv.indexOf('--static-dir') + 1] : null)
const STATIC = resolve(staticDirArg ?? join(ROOT, 'storybook-static'))
const CARD_STORY = 'design-system-components-agentpanel-展示--decision-card-open'
const NODEFAULT_STORY = 'design-system-components-agentpanel-展示--decision-card-no-default'
const SINGLE_STORY = 'design-system-components-agentpanel-展示--decision-card-single'
const DENSITIES = ['md', 'lg']
const FIELD_STORY = 'design-system-components-field-展示--vertical'
const SELFTEST = process.argv.includes('--selftest')
const CARD = '[class~="group/agent-option"]'
const CONTROL = '[role="checkbox"], [role="radio"]'
const OTHER_INPUT = 'input[aria-label="其他(自由輸入)"]'
// 錯誤文案(agent-panel.tsx DEFAULT_DECISION_LABELS 的 errorOther / errorMulti / errorSingle;AI 依 DS 既有句型定,agent-decision-card.spec.md「步進」);DS 預設換字時兩邊一起改
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
const storyUrl = (id, density = null) => `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${density ? `&globals=${encodeURIComponent(`theme:light;density:${density}`)}` : ''}`

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
  // ── 間距(G 系列):只跑 runSpacing。選擇器認結構(data-slot / role),不認 class、不認 × 的名字 ──
  bodyPad: {
    expect: ['G2', 'G3'],
    what: '⑥ body 頂部又給一次內距(標題列下內距 + body 上內距,兩層各給一次)',
    css: `[data-slot="surface-header"] ~ * div:has(> [role="radiogroup"]) { padding-top: var(--layout-space-tight) !important }`,
  },
  headerPad: {
    expect: ['G2'],
    what: '⑦ 標題列下內距歸零(題目貼著第一張選項卡)',
    css: `[role="group"] > [data-slot="surface-header"] { padding-bottom: 0 !important }`,
  },
  divider: {
    expect: ['G1'],
    what: '⑧ 標題列補回分隔線',
    css: `[role="group"] > [data-slot="surface-header"] { border-bottom: 1px solid currentColor !important }`,
  },
  footerPad: {
    expect: ['G4'],
    what: '⑨ footer 上內距歸零(按鈕貼著最後一張選項卡)',
    css: `[role="group"] > [data-slot="surface-footer"] { padding-top: 0 !important }`,
  },
  // ⑩ ⑪:題目與第一張卡之間多出「內距以外」的空白。標題列自己的下內距沒變,所以 2026-11-13 前的算式(外框底 − 下內距 → 第一張卡)仍是 tight、G3 仍是 0 ——
  // 只有直接量「標頭裡最低的那個內容的外框底 → 第一張卡」才看得到。⑩ 的注入 = 審查示範用的同一段(標題列每個直接子元素下方多 8px 外距);
  // ⑪ = 審查示範那一段把 min-height 從 65 加大到 160(65 撐不高「有小標 × 大密度」那一格的 70.6,四格要全紅;標題列本來就靠上排)
  titleGap: {
    expect: ['G2'],
    what: '⑩ 題目下方多 8px(標題列的下內距沒變,多的是外距)',
    css: `[role="group"] > [data-slot="surface-header"] > * { margin-bottom: 8px !important }`,
  },
  headerTall: {
    expect: ['G2'],
    what: '⑪ 標題列被撐高、題目貼頂(標題列的下內距沒變,多的是撐出來的空白)',
    css: `[role="group"] > [data-slot="surface-header"] { min-height: 160px !important; align-items: flex-start !important }`,
  },
  // ⑫ ⑬ 不是產品的病,是「量不了」:選項區(ScrollArea)被卡矮 —— ⑫ 再捲到底(第一張卡被捲到標題列後面,頂的兩段量不了)、
  // ⑬ 停在頂端(最後一張卡被卡在下面,底的兩段量不了)。兩種都必須判成儀器失效(runSpacing 丟出點名 instrument 那幾個字的錯誤),
  // 不可變成 G2 / G3 / G4 的產品紅 —— 沒量到不是通過,也不是產品壞掉。
  optionsScrolled: {
    instrument: '選項區沒有捲在最上面',
    what: '⑫ 選項區被卡矮並捲到底(量不了,不是產品的病)',
    css: `[role="group"] > [data-slot="surface-header"] + * { max-height: 60px !important }`,
    afterOpen: () => { for (const vp of document.querySelectorAll('[role="group"] > [data-slot="surface-header"] + * [data-radix-scroll-area-viewport]')) vp.scrollTo({ top: vp.scrollHeight, behavior: 'instant' }) },
  },
  optionsClipped: {
    instrument: '選項區的內容比它裝得下的高',
    what: '⑬ 選項區被卡矮、停在頂端(最後一張卡被卡在下面;量不了,不是產品的病)',
    css: `[role="group"] > [data-slot="surface-header"] + * { max-height: 60px !important }`,
  },
}
const SPACING_FAULTS = new Set(['bodyPad', 'headerPad', 'divider', 'footerPad', 'titleGap', 'headerTall', 'optionsScrolled', 'optionsClipped'])

const flushOn = (page) => page.evaluate(() => new Promise((r) => setTimeout(() => setTimeout(r, 0), 0)))
/** 等有限次的動畫 / 過渡跑完再量(框色有 transition-colors;卡片進場有淡入下滑)—— 量到過渡中間值是已知陷阱(AGENTS 失敗記憶索引)。
 *  無限循環的動畫(代理標誌呼吸)不等;上限 3 秒,超過照量(值若還在變,比對會紅,不會假綠)。 */
const settleTransitions = (page) => page.evaluate(async () => {
  const finite = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity)
  await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 3000))])
})

// 全程一個分頁(--single-process 下關掉最後一個分頁會連瀏覽器一起關):每一輪都是在同一分頁重新導覽,上一輪注入的病隨舊文件一起消失。
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

/** 在同一分頁開一則 story;fault = FAULTS 的一個鍵(頁面層注入在靜止判定之前);density = 整頁密度(沒給 = story 預設)。 */
async function open(id, waitFor, fault = null, density = null) {
  const f = fault ? FAULTS[fault] : null
  const beforeSettle = f ? async (p) => {
    if (f.css) await p.addStyleTag({ content: f.css })
    if (f.script) await p.addScriptTag({ content: f.script })
  } : null
  await openStory(page, storyUrl(id, density), { waitFor, settleFrames: 10, notFound: server.notFound, beforeSettle })
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
  // 卡片根 = 往上第一個含 footer 的 role="group"(複選題的 CheckboxGroup 也是 role="group",但不含 footer);
  // 2026-11-11 前用「含 aria-label="跳過" 的鈕」認,× 改名「跳過全部，用建議繼續」後改認結構,不綁文案
  const root = cards[0] && (() => { let el = cards[0].parentElement; while (el && !(el.getAttribute('role') === 'group' && el.querySelector('[data-slot="surface-footer"]'))) el = el.parentElement; return el })()
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
      record('E4', '錯誤訊息在最後一張卡之後、左緣對齊選項卡;距離 = 卡間距 8(user 10-29 提案照落地、8 依既有規則定)',
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
      record('E10', '複選:錯誤訊息距最後一張卡 = 卡間距(同 E4)', near(gapError, s.cards[1].y - s.cards[0].bottom), `錯誤距 ${gapError.toFixed(2)}`)
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
    record('N6', '錯誤訊息在最後一張卡之後、左緣對齊選項卡;距離 = 卡間距 8(同 E4)',
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

/**
 * 標題列 → 選項、選項 → 按鈕的間距(G 系列):決策卡一打開的那一題,有小標(DecisionCardOpen 第 1 題)與沒有小標(DecisionCardSingle)× 一般 / 大密度。
 * 量法:layoutSpace.spec.md 規則 2「適用範圍與量法三點」(2)—— 標頭的分隔線被元件規格拿掉時,從「標頭內容的底」量到第一個內容頂;
 * 「標頭內容的底」= 標頭裡最低的那個內容的外框底(正常情況下 = 標頭外框底扣掉它自己的下內距)。這裡直接量那個內容,不拿「外框底 − 下內距」代替
 * (那個算式另存 paddingFormula 只供列印對照)。「內容」= 規則 2 那支閘 pageKit 的「看得見的東西」(collectThings / bottomOf,判法只有那一個住所):
 * 有自己的字的元素(題目、小標)、圖示、有框的東西;沒框的按鈕往裡找圖示 —— × 的透明外框靠負邊距縮成一行高的佔位,外框本身比題目那一行還低,
 * 但畫面上看不到它,不是內容(滑過時 × 有底色、外框就看得見了,所以量之前先把指標移開)。標題列自己不算(skipSelf)。
 * 只有字、沒有框的元素(題目、小標)底邊取它的內容框:沒有內距時就是外框底(現況);它自己若帶下內距,那段是空白不是內容(pageKit.bottomOf,同規則 2 那支的量法)。
 * 這一段只由標頭的下內距給、body 頂部歸零(G3)。期望值的 tight 從卡片上讀(決策卡不在浮層裡,間距跟整頁密度)。
 * 找元素只認結構:footer(data-slot)往上第一個 role="group" = 卡片根;卡片根底下第一個 radiogroup / group 的第一 / 最後一個子元素 = 第一 / 最後一張選項卡。
 * 捲動:選項區是 ScrollArea。第一張卡往上到卡片根之間有任何一層被捲動過(頂的兩段量不了)、或有一層把內容卡掉(選項比裝得下的高,最後一張卡被捲在下面,
 * 底的兩段量不了)→ 回 err(runSpacing 丟出 = 儀器失效),不拿這種狀態下的數字判產品。決策卡的產題守則本來就要求每一步不需捲動即可讀完。
 * 依賴 window.__layoutKit(呼叫前先 installPageKit)。
 */
const readSpacing = () => page.evaluate(() => {
  const K = window.__layoutKit
  if (!K) return { err: '頁面上沒有量具(window.__layoutKit 沒裝上)' }
  const footer = [...document.querySelectorAll('[data-slot="surface-footer"]')].find((f) => f.closest('[role="group"]')?.querySelector('[role="radiogroup"], [role="group"]'))
  const root = footer?.closest('[role="group"]')
  const header = root?.querySelector('[data-slot="surface-header"]')
  const group = root?.querySelector('[role="radiogroup"], [role="group"]')
  const first = group?.firstElementChild, lastCard = group?.lastElementChild
  if (!root || !header || !footer || !first || !lastCard) return { err: `找不到決策卡的${!root ? '卡片根' : !header ? '標題列' : !group ? '選項群組' : '選項卡'}` }
  let scrolled = 0, clipped = 0
  for (let n = first.parentElement; n && n !== root; n = n.parentElement) {
    scrolled = Math.max(scrolled, Math.abs(n.scrollTop))
    if (/auto|scroll|hidden|clip/.test(getComputedStyle(n).overflowY)) clipped = Math.max(clipped, n.scrollHeight - n.clientHeight)
  }
  if (scrolled > 0.5) return { err: `選項區沒有捲在最上面(捲動位置 ${Math.round(scrolled * 10) / 10}px)—— 第一張選項卡被捲到標題列後面,「標頭內容的底 → 第一張卡」量不了;這是量測沒對好,不是產品的問題` }
  if (clipped > 1) return { err: `選項區的內容比它裝得下的高 ${clipped}px(選項區在捲動)—— 最後一張選項卡被捲在下面,「最後一張卡 → 按鈕」量不了;這是量測沒對好,不是產品的問題` }
  const contents = K.collectThings(header, { skipSelf: true })
  if (!contents.length) return { err: '標題列裡找不到看得見的內容(題目 / 小標 / 圖示)' }
  const lowest = contents.reduce((a, t) => (K.bottomOf(t.el, t.f) > K.bottomOf(a.el, a.f) + 0.5 ? t : a))
  const contentBottom = K.bottomOf(lowest.el, lowest.f)
  const num = (el, p) => parseFloat(getComputedStyle(el)[p]) || 0
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.checkVisibility() }
  const err = root.querySelector('[data-field-slot="error"]')
  const lastEl = err && visible(err) ? err : lastCard
  const buttons = [...footer.querySelectorAll('button')].filter(visible)
  if (!buttons.length) return { err: 'footer 裡找不到看得見的按鈕' }
  const hb = header.getBoundingClientRect(), fb = footer.getBoundingClientRect()
  const firstTop = first.getBoundingClientRect().top, lastBottom = lastEl.getBoundingClientRect().bottom
  const token = (el, name) => parseFloat(getComputedStyle(el).getPropertyValue(name))
  const r1 = (x) => Math.round(x * 10) / 10
  return {
    step: [...header.querySelectorAll('span')].some((s) => /^\s*\d+ \/ \d+\s*$/.test(s.textContent)),
    headerHeight: r1(hb.height), cards: group.children.length, hasError: lastEl === err,
    headerBorderBottom: num(header, 'borderBottomWidth'), footerBorderTop: num(footer, 'borderTopWidth'),
    contentBottomToFirst: r1(firstTop - contentBottom),
    lowest: `<${lowest.f.tag}>「${(lowest.el.textContent ?? '').trim().slice(0, 12)}」`, contents: contents.length,
    paddingFormula: r1(firstTop - (hb.bottom - num(header, 'paddingBottom') - num(header, 'borderBottomWidth'))),
    headerBottomToFirst: r1(firstTop - hb.bottom),
    lastToFooterTop: r1(fb.top - lastBottom),
    lastToButtonTop: r1(Math.min(...buttons.map((b) => b.getBoundingClientRect().top)) - lastBottom),
    tight: token(root, '--layout-space-tight'),
    rootLoose: token(document.querySelector('#storybook-root') ?? document.documentElement, '--layout-space-loose'),
  }
})

async function runSpacing(fault) {
  const results = []
  const record = (id, label, pass, detail = '') => results.push({ id, label, pass, detail })
  const rootLoose = {}
  const f = fault ? FAULTS[fault] : null
  for (const [story, wantStep, what] of [[CARD_STORY, true, '有小標'], [SINGLE_STORY, false, '沒有小標']]) {
    for (const density of DENSITIES) {
      await open(story, CARD, fault, density)
      // 指標移開再量:前面幾輪的點擊把指標留在卡片上;滑過 × 時它的外框有底色(看得見),會被當成標題列裡最低的內容
      await page.mouse.move(0, 0)
      await settleTransitions(page)
      if (f?.afterOpen) await page.evaluate(f.afterOpen)
      await installPageKit(page)
      const s = await readSpacing()
      const where = `${what} @${density}`
      if (s.err) throw new Error(`${where}:${s.err}`)
      if (s.step !== wantStep) throw new Error(`${where}:這則範例應${wantStep ? '有' : '沒有'}小標「n / N」,實際${s.step ? '有' : '沒有'}—— 範例換了,量的不是原本要量的那一格`)
      if (!(s.tight > 0) || !(s.rootLoose > 0) || ![s.contentBottomToFirst, s.headerBottomToFirst, s.lastToFooterTop, s.lastToButtonTop].every(Number.isFinite)) throw new Error(`${where}:沒量到間距或 token(${JSON.stringify(s)})`)
      ;(rootLoose[story] ??= []).push(s.rootLoose)
      const near = (a, b) => Math.abs(a - b) <= 0.5
      record('G1', `${where}:標題列下、footer 上沒有分隔線(下 / 上邊框 0;agent-decision-card.spec.md)`, s.headerBorderBottom === 0 && s.footerBorderTop === 0,
        `標題列下邊框 ${s.headerBorderBottom}px、footer 上邊框 ${s.footerBorderTop}px`)
      record('G2', `${where}:標頭內容的底(標題列裡最低的那個內容 ${s.lowest} 的外框底)→ 第一張選項卡頂 = tight ${s.tight}(layoutSpace 規則 2:標頭 → element;標題列高 ${s.headerHeight})`, near(s.contentBottomToFirst, s.tight),
        `量到 ${s.contentBottomToFirst}px,應 ${s.tight}(標題列裡看得見的內容 ${s.contents} 個;「標題列外框底 − 下內距 → 第一張卡」那個舊算式 = ${s.paddingFormula}px)`)
      record('G3', `${where}:這一段只由標題列的下內距給 —— 標題列外框底 → 第一張卡 0、最後${s.hasError ? '錯誤訊息' : '一張卡'}底 → footer 外框頂 0(body 上下不另給內距)`, near(s.headerBottomToFirst, 0) && near(s.lastToFooterTop, 0),
        `標題列外框底 → 第一張卡 ${s.headerBottomToFirst}px、最後內容底 → footer 外框頂 ${s.lastToFooterTop}px`)
      record('G4', `${where}:最後${s.hasError ? '錯誤訊息' : '一張卡'}底 → footer 按鈕頂 = tight ${s.tight}(body 底與頂同值 0 + footer 自己的上內距)`, near(s.lastToButtonTop, s.tight),
        `量到 ${s.lastToButtonTop}px,應 ${s.tight}`)
    }
  }
  // 密度有沒有套上:頁面根兩種密度讀到同一個 loose = 兩格量的是同一個畫面 = 儀器失效(不讀成通過)
  for (const [story, looses] of Object.entries(rootLoose)) if (new Set(looses).size !== DENSITIES.length) throw new Error(`${story}:兩種密度在頁面根讀到同一個 loose(${looses.join(' / ')})—— 密度沒套上`)
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
    // 間距的情境(⑥–⑬)只跑間距那一路;驗證的五種病(①–⑤)不跑間距(那一路不受它們影響)
    if (fault && SPACING_FAULTS.has(fault)) {
      const spacing = await runSpacing(fault)
      report.push({ fault, results: spacing.results, reached: spacing.reached })
      continue
    }
    const card = await runCard(ref, fault)
    // ④(press)只有「其他」輸入格那一路有,不預選那一路不跑
    const noDefault = fault === 'press' ? { results: [] } : await runNoDefault(ref, fault)
    const spacing = fault ? { results: [] } : await runSpacing(null)
    report.push({ fault, results: [...card.results, ...noDefault.results, ...spacing.results], reached: card.reached })
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
    if (f.instrument) {
      // 量不了的情境(⑫ ⑬):整輪必須以儀器失效中止、錯誤點名 f.instrument,而且沒有任何一條被記下來(更不能是產品紅)。
      // 這裡印的是人話,不印儀器失效的機讀標記 —— lib/gate-selftest-meta.mjs 看到標記就把這次自測判成儀器失效
      const caught = !r.reached && r.results.length === 0 && (r.error ?? '').includes(f.instrument)
      ok = ok && caught
      console.log(`${caught ? '✓' : '✗'} selftest ${f.what}:${caught ? `判成儀器失效、沒有記成產品紅(「${r.error.split('——')[0].trim()}」)` : `沒有判成儀器失效(${r.error ? `途中 ${r.error}` : `照常量出 ${r.results.length} 條,紅 ${red.join(' / ') || '無'}`})`}`)
      continue
    }
    // 間距的病(⑥–⑪)每一格都要被指名:有 / 沒有小標 × 兩種密度 = 4 格,少一格沒紅 = 那一格的量具沒在量(不准只靠其中一格紅就算抓到)
    const everyCell = !SPACING_FAULTS.has(r.fault) || f.expect.every((id) => { const rows = r.results.filter((x) => x.id === id); return rows.length === 2 * DENSITIES.length && rows.every((x) => !x.pass) })
    const caught = f.expect.every((id) => red.includes(id)) && everyCell
    ok = ok && caught
    console.log(`${caught ? '✓' : '✗'} selftest ${f.what}:${caught ? `被 ${f.expect.join(' / ')} 指名紅` : `沒抓到(該紅 ${f.expect.join(' / ')},實際紅 ${red.join(' / ') || '無'}${r.error ? `;途中 ${r.error}` : ''})`}`)
    // 間距的病把每一格量到的數字印出來(四格各一行):「四格都紅」看得到是紅在什麼數字上,不只是一個勾
    if (SPACING_FAULTS.has(r.fault)) for (const x of r.results.filter((y) => f.expect.includes(y.id))) console.log(`    ${x.pass ? '綠 ✗' : '紅'} ${x.id} ${x.label.split(':')[0]}:${x.detail}`)
  }
  const unmeasurable = report.filter((r) => FAULTS[r.fault].instrument).length
  console.log(ok ? `\n✓ selftest:${report.length - unmeasurable} 種病都被指名,量具會紅;${unmeasurable} 種量不了的情境判成儀器失效、沒有指控產品` : '\n✗ selftest:沒抓全(這支閘是假綠)')
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
