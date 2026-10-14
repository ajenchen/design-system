#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 可搜尋的選單開著時,**滑鼠點選項與按 Enter 結果相同**:DOM 焦點不離開搜尋框(欄位內 / 浮層內兩種位置都一樣),點完接著打的字進得去;
 *         焦點所在的搜尋框帶 aria-activedescendant,指向清單裡看得見、正被反白的那一列,而且那一列是搜尋框的後代、或搜尋框的
 *         aria-controls 指到包住它的 listbox(ARIA 1.2 MUST);欄位內搜尋 × 多選每挑一次清空關鍵字、浮層內搜尋保留;
 *         單選照舊收起、焦點回觸發點,**指標挑選收起時觸發點不帶 :focus-visible**(打過字也一樣);Combobox `searchIn='trigger'` 在 value=[]
 *         時仍有看得見、點得到、打得進字的搜尋框;搜尋框握著焦點時按欄位上的 Tag ×(多選)、「+N」浮出清單裡的 × 與卡片本身、欄位內搜尋時按浮層的全選鈕,
 *         焦點與關鍵字都不動、選單不關、接著打的字進得去;選單關著時按「+N」浮出清單裡的 ×,移除後焦點不掉到 body;欄位內多選 Tag 排滿後打的字看得全
 *         (搜尋框寬 = 打的字,單行時 Tag 讓位收進 +N);欄位內搜尋打了比整列還長的字,搜尋框停在整列寬、在框裡捲動(插入點看得見);
 *         打了關鍵字後用滑鼠按一鍵清空,值與關鍵字一起清、焦點留在搜尋框;
 *         欄位的一鍵清空用鍵盤按下後焦點留在欄位裡(不掉到 body);輸入法組字中的 Enter 不選任何一項、組字中的 Esc 不關選單(同一條派發路徑的一般 Esc 照樣關)
 *         (user 2026-09-30 同意,原話「其他部分我覺得”可以”」—— 同意範圍是「滑鼠點選項」、欄位內多選清空關鍵字、aria-activedescendant 三項;
 *         其餘是同一條不變式在其他位置的延伸或既有規則,出處分列在各 spec:`SelectMenu/select-menu.spec.md`「A11y 預設」Focus 段與
 *         「搜尋關鍵字何時保留、何時清空」、`Combobox/combobox.spec.md`「Tag 操作」與「邊界案例」Empty、`Command/command.spec.md`「A11y 預設」)。
 *   紅: 任一個被找到的可搜尋選單,按下選項的當下或點完之後焦點落在搜尋框以外([pick-focus])、點完打的字沒進搜尋框([typing-after-pick])、
 *       搜尋框的 aria-activedescendant 是空的 / 指向不存在或不是反白那一列 / 那一列既不是它的後代也不在它 aria-controls 的 listbox 裡([aad])、
 *       欄位內多選點完關鍵字沒清空或浮層內被清掉([keyword])、value=[] 時欄位裡沒有可聚焦的搜尋框([empty-input])、點開 / 打字後焦點不在搜尋框
 *       ([open-focus] / [typing])、單選點完沒收起或焦點沒回觸發點([single-close])、指標挑選收起後觸發點帶 :focus-visible([pick-ring])、
 *       按 Tag × / +N 浮出清單裡的 × / +N 卡片本身 / 全選時焦點離開搜尋框或關鍵字被動到或選單關了或接著打的字沒進去([chrome-press])、
 *       選單關著按 +N 浮出清單裡的 × 後焦點掉到 body([overflow-focus])、Tag 排滿後打的字被裁、或打了比整列還長的字搜尋框超出欄位 / 不捲動([typed-visible])、
 *       打了字後滑鼠按一鍵清空、關鍵字沒清或焦點離開搜尋框([clear-keyword])、鍵盤按一鍵清空後焦點掉出欄位([clear-focus])、
 *       組字中的 Enter 選了東西或關了選單、組字中的 Esc(isComposing 或 keyCode 229)關了選單或動了關鍵字、同一條派發路徑的一般 Esc 沒關掉選單([ime])
 *       → 每一條都點名「哪一型・哪一則 story・第幾個觸發點」並 exit 1。
 *   綠: 從 Storybook index 找到的每一個可搜尋選單(欄位內單選 / 欄位內多選 / 浮層內單選 / 浮層內多選四型都至少量到一個,欄位內多選另量空值那條;
 *       Command 的直接使用者 AgentPanel 歷史浮層、CommandDialog 各至少量到一個)全部符合時綠。找不到候選 story、四型缺任一型、直接使用者缺任一個、
 *       空值那條沒量到、Tag × / +N 浮出清單裡的 ×(開著 / 關著)/ +N 卡片本身 / 全選 / Tag 排滿後打字 / 打比整列長的字 / 一鍵清空(鍵盤 / 滑鼠)一次都沒量到、
 *       比整列長的字其實沒有比整列寬、
 *       整輪沒有任何一次多選挑選真的改變勾選(點擊沒生效)、story 開不起來、
 *       版面等不到靜止 = 儀器失效(INSTRUMENT-FAIL),不是綠。
 *   量法: 候選 story 從**正在服務的那一份**建置的 index.json 讀(不是手寫清單):凡是 importPath 位於「可搜尋選單家族」元件目錄的 story 都開。
 *         家族從原始碼推導,兩條:(1) 從 SelectMenu(可搜尋選單的唯一 owner)出發,沿 `import … from '@/design-system/components/…'` 往上找,
 *         只收**自己宣告 `searchable?:` / `searchIn?:` prop** 的元件檔(今天 = SelectMenu / Combobox / Select / PeoplePicker;新的包裝元件會自動納入,
 *         只轉用 Select 卻不開放搜尋的 Pagination / DataTable 不納入);(2) Command 的直接使用者 —— 自己 import Command 而且渲染 `<CommandInput`
 *         的元件(今天 = AgentPanel 歷史浮層),加上 Command 自己(CommandDialog);它們與選單共用同一條指標規則與收起還焦點。
 *         每則 story 逐一真的用滑鼠點開每個觸發點,**看 DOM 決定它是不是可搜尋選單**:浮層(popper 或對話框)裡有 cmdk 清單、而且觸發欄位裡(欄位內)
 *         或浮層裡(`[cmdk-input]`,浮層內)有搜尋框才算;多選 = 選項列帶勾選框。
 *         量的全是真事件的結果:`document.activeElement` 的身分與 `:focus-visible`(按下的當下、放開之後各讀一次)、真的用鍵盤打字後讀搜尋框的 value、
 *         aria-activedescendant 解析到的元素是否在這個浮層裡、`role=option`、有 getBoundingClientRect 面積、就是 `data-selected="true"` 那一列、
 *         是不是搜尋框的後代或在它 aria-controls 的 listbox 裡;點的位置先用 elementFromPoint 證明落在目標上。每次互動後等版面連續靜止
 *         (settleAfterInteraction)、焦點主張再等焦點連續穩定(waitForFocusStable);遠端搜尋等 `aria-busy` 解除(等元素本身,上限只是天花板)
 *         —— 沒有固定睡眠當「已就緒」的代理。組字中的 Enter / Esc 用 `new KeyboardEvent('keydown', { isComposing: true })`(與 keyCode 229 那一型)派在搜尋框上;
 *         Esc 另派一次不帶組字旗標的同一顆(對照:同一條派發路徑的一般 Esc 必須關得掉,組字 Esc「沒關」才算數),之後重新點開、打回原本的關鍵字。
 *   對照組(--selftest,兩面): (1) 判定表 —— 每一條規則餵合成量測必紅、正確形狀必綠、缺型 / 沒量到必判儀器失效;
 *         (2) 真對照組 —— 先用同一份掃描(家族順序、owner 先,四型代表齊了就停)找出每一型的代表,**不動頁面**量一次必須全綠,
 *         再把修法在頁面上逐一拆掉各量一次:
 *           a. 選項 mousedown 的 preventDefault 失效(= cmdk 原生行為:焦點被搬到 `[cmdk-list]`)→ 四型都必須紅在 [pick-focus];
 *           b. 輸入框上的 aria-activedescendant 寫不上去(= 修法前欄位內輸入框恆為 null)→ 四型都必須紅在 [aad];
 *           c. 欄位裡沒有 Tag 時把搜尋框藏起來(= 修法前只掛在 Tag 清單尾巴)→ 欄位內多選必須紅在 [empty-input];
 *           d. 還焦點時的 `focusVisible: false` 被吃掉(= 不支援的引擎 / 修法前)→ 兩種單選必須紅在 [pick-ring];
 *           e. 欄位內搜尋框的 aria-controls 被拿掉(= 第一版只寫 aria-activedescendant)→ 欄位內兩型必須紅在 [aad];
 *           f. 觸發欄位上的 mousedown preventDefault 失效(= 修法前 Tag × 在 mousedown 就拿走焦點)→ 兩種多選必須紅在 [chrome-press];
 *           g. 一鍵清空前的焦點交接被吃掉(= 修法前焦點隨按鈕卸載掉到 body)→ 欄位內單選必須紅在 [clear-focus];
 *           h. 鍵盤事件看不出組字(isComposing / keyCode 被洗掉 = 修法前代發給清單的那一顆)→ 四型都必須紅在 [ime];
 *           i. 「+N」浮出清單上的 mousedown preventDefault 失效(= 2026-09-30 第二輪:卡片在另一個 portal)→ 兩種多選必須紅在 [chrome-press];
 *           j. 移除浮出清單裡那一項後的焦點交接被吃掉(= PeoplePicker 修前跳過接力)→ 浮層內多選必須紅在 [overflow-focus];
 *           k. 欄位內搜尋框的量尺不算數(= 修前固定 60px、Tag 可見數不扣它的位)→ 欄位內多選必須紅在 [typed-visible];
 *           l. 組字中的 Esc 被當成一般 Esc(= 2026-10-01 前:浮層 / 對話框的 onEscapeKeyDown 沒有組字判斷,Radix 只看 event.key)→ 四型都必須紅在 [ime];
 *           m. 欄位內搜尋框那一格的寬沒有上限(= 2026-09-30 第三輪:一格 grid 的隱含 auto 欄跟著量尺長,max-w-full 管不到欄寬)→ 欄位內多選必須紅在 [typed-visible]。
 *         一鍵清空連關鍵字一起清、按 +N 卡片本身不關選單,沒有頁面上的對照組(前者是 React state、後者是 SelectMenu 觸發欄位開關裡的 React ref 旗標,
 *         頁面上都拆不掉):判定表必紅 + 對修前建置實跑必紅(2026-09-30 / 2026-10-01 紀錄)。
 *         每一組都印出紅在哪一型、哪一則 story;任一組沒紅 = 這支閘的綠燈是零證據。
 *
 * 用法:node scripts/searchable-menu-focus-invariant.mjs [--static=<storybook-static dir>] [--lanes=4] [--selftest]
 */
import { readFileSync, globSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INSTRUMENT_FAIL_MARKER,
  launchBrowserOrSkip,
  openStory,
  ownSurfacePosition,
  requireFreshStorybookBuild,
  settleAfterInteraction,
  StoryRenderInstrumentError,
  waitForFocusStable,
} from './lib/launch-browser.mjs'
import { readServedStorybookIndex, startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { isImeComposing } from '../packages/design-system/src/lib/ime-composition.ts'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const STATIC = path.resolve(arg('static', path.join(REPO, 'storybook-static')))
const SELFTEST = process.argv.includes('--selftest')
// 幾條車道平行掃(每條一個瀏覽器):本 repo 沙箱必須帶 --single-process,同一個 context 開多個 page 不穩,
// 做法與 select-all-footer-invariant.mjs 同一條(每條車道各開一個瀏覽器、各自認領下一則 story)。
const LANES = Math.max(1, Number(arg('lanes', '4')) || 1)
const SETTLE_FRAMES = 10 // 與其他瀏覽器閘同值(named-constant-drift 閘:同名常數不得有第二個值)
const MAX_INSTRUMENT_FAILURES = 25 // 同上
/** 遠端搜尋 / 選項載入中:等 aria-busy 解除的天花板(story 的假延遲最長 1500ms;成功由訊號本身決定,不是這個數)。 */
const BUSY_CAP_MS = 6000
/** 「+N」浮出清單(HoverCard,開啟延遲 MOTION_DELAY_PLAIN_MS = 500ms)出現的天花板;成功由卡片裡的 × 真的出現決定,不是這個數。 */
const OVERFLOW_CARD_CAP_MS = 5000

const COMPONENTS_DIR = 'packages/design-system/src/components'
/** 可搜尋選單的唯一 owner(焦點 / 關鍵字 / aria-activedescendant 規則的 spec 住所)。家族從它往上推導。 */
const MENU_OWNER_MODULE = 'SelectMenu/select-menu'
/** Command 的直接使用者:自己 import Command、渲染 `<CommandInput` 的元件(與選單共用同一條指標規則與收起還焦點)。 */
const COMMAND_MODULE = 'Command/command'
/** 規則的實作(不在家族目錄裡、但決定這支閘量到什麼):指標住 Command 根,判準、還焦點、代發鍵、組字、欄位焦點交接各一支共用檔,
 *  「+N」浮出清單住 OverflowIndicator(卡片上的 mousedown 通道)與 HoverCard(卡片這一層本身;按卡片不關選單住 SelectMenu 觸發欄位的開關,已在家族裡),
 *  「這一下 Esc 由誰處理」(含組字中的 Esc 不關浮層)住 Popover / Dialog 的內容元件(lib/overlay-escape.ts withOverlayEscape;2026-10-01 取代 ime-composition.ts 的 withImeSafeEscape)。 */
const RULE_SOURCES = [
  `${COMPONENTS_DIR}/Command`,
  `${COMPONENTS_DIR}/OverflowIndicator`,
  `${COMPONENTS_DIR}/HoverCard`,
  `${COMPONENTS_DIR}/Popover`,
  `${COMPONENTS_DIR}/Dialog`,
  'packages/design-system/src/lib/pointer-press.ts',
  'packages/design-system/src/lib/overlay-focus-return.ts',
  'packages/design-system/src/lib/ime-composition.ts',
  'packages/design-system/src/lib/overlay-escape.ts',
  'packages/design-system/src/hooks/use-input-modality.ts',
  `${COMPONENTS_DIR}/Field/field-wrapper.tsx`,
]

export const REQUIRED_KINDS = Object.freeze(['inline-single', 'inline-multi', 'popover-single', 'popover-multi'])
/** 組字 Esc 的兩種形狀(頁面端 op imeEscape 的 shape;plain = 同一條派發路徑、不帶組字旗標的對照)。 */
export const IME_SHAPE_LABEL = Object.freeze({ composing: 'isComposing', keyCode229: 'keyCode 229 —— Safari 選字的最後一顆', plain: '一般 Esc(對照)' })
/** 「比整列還長的字」:比任何一個 1280px 視窗裡的欄位都寬(實際寬度仍逐次量、沒比整列寬 = 儀器失效,不靠這個長度當代理)。 */
export const LONG_KEYWORD = 'quarterly-report-2026-draft-for-finance-review-and-legal-signoff-v3-final-approved-by-procurement-and-security-teams'
export const KIND_LABEL = Object.freeze({
  'inline-single': '欄位內搜尋・單選',
  'inline-multi': '欄位內搜尋・多選',
  'popover-single': '浮層內搜尋・單選',
  'popover-multi': '浮層內搜尋・多選',
  // 清單裡還沒有任何選項列(載入中 / 遠端還沒打字),判不出單選或多選;只會出現在「量不到挑選」清單裡
  'inline-unknown': '欄位內搜尋・單多選未定',
  'popover-unknown': '浮層內搜尋・單多選未定',
})

// ═══════════════════════════════════════════════════════════════════════════
// 候選 story:家族從原始碼推導,story 從建置的 index.json 讀
// ═══════════════════════════════════════════════════════════════════════════
/**
 * 「可搜尋選單家族」= 從 SelectMenu 出發,沿元件原始碼的 import 往上一層一層走,只收**自己宣告 searchable?: / searchIn?: prop** 的元件檔。
 * 回傳元件目錄名,依離 owner 的層數排(同層照字母;例 ['SelectMenu', 'Combobox', 'Select', 'PeoplePicker'])。純讀檔,不開瀏覽器。
 */
export function deriveSearchableMenuFamily(root = REPO) {
  const files = globSync(`${COMPONENTS_DIR}/*/*.{ts,tsx}`, { cwd: root })
    .filter((f) => !/\.stories\.tsx$|\.test\.tsx?$/.test(f))
    .sort()
  const moduleOf = (f) => f.slice(COMPONENTS_DIR.length + 1).replace(/\.tsx?$/, '')
  const sources = files.map((f) => ({ module: moduleOf(f), text: readFileSync(path.join(root, f), 'utf8') }))
  const importsOf = (text) => [...text.matchAll(/from\s+['"]@\/design-system\/components\/([A-Za-z0-9]+\/[\w.-]+)['"]/g)].map((m) => m[1])
  const declaresSearchProp = (text) => /\bsearch(?:able|In)\?\s*:/.test(text)
  const reached = [MENU_OWNER_MODULE]
  for (let level = [MENU_OWNER_MODULE]; level.length;) {
    level = sources
      .filter(({ module, text }) => !reached.includes(module) && declaresSearchProp(text) && importsOf(text).some((m) => level.includes(m)))
      .map(({ module }) => module)
    reached.push(...level)
  }
  return [...new Set(reached.map((m) => m.split('/')[0]))]
}

/**
 * Command 的直接使用者:元件檔自己 import `Command/command`、而且渲染 `<CommandInput`(有搜尋框),加上 Command 自己(CommandDialog)。
 * 回傳元件目錄名(照字母;SelectMenu 也符合,由呼叫端與上一條去重)。純讀檔。
 */
export function deriveCommandSearchConsumers(root = REPO) {
  const files = globSync(`${COMPONENTS_DIR}/*/*.{ts,tsx}`, { cwd: root })
    .filter((f) => !/\.stories\.tsx$|\.test\.tsx?$/.test(f))
    .sort()
  const dirs = files
    .filter((f) => {
      const text = readFileSync(path.join(root, f), 'utf8')
      return text.includes(`from '@/design-system/components/${COMMAND_MODULE}'`) && /<CommandInput\b/.test(text)
    })
    .map((f) => f.slice(COMPONENTS_DIR.length + 1).split('/')[0])
  return [...new Set([...dirs, COMMAND_MODULE.split('/')[0]])].sort()
}

/** 整個家族(選單家族先、Command 直接使用者接在後面)與「一定要量到」的直接使用者(不在選單家族裡的那幾個)。 */
export function deriveGateFamily(root = REPO) {
  const menu = deriveSearchableMenuFamily(root)
  const direct = deriveCommandSearchConsumers(root).filter((d) => !menu.includes(d))
  return { family: [...menu, ...direct], requireDirs: direct }
}

/** index.json 裡 importPath 位於家族目錄的 story(type = story),依家族順序(離 owner 近的先)、同目錄照 index 順序。 */
export function candidateStories(index, family) {
  const dirOf = (importPath) => family.findIndex((d) => importPath.startsWith(`./${COMPONENTS_DIR}/${d}/`))
  return Object.values(index?.entries ?? {})
    .filter((e) => e?.type === 'story' && typeof e.importPath === 'string' && dirOf(e.importPath) >= 0)
    .map((e, order) => ({ id: e.id, name: e.name, title: e.title, rank: dirOf(e.importPath), order }))
    .sort((a, b) => (a.rank - b.rank) || (a.order - b.order))
    .map(({ id, name, title, rank }) => ({ id, name, title, dir: family[rank] }))
}

// ═══════════════════════════════════════════════════════════════════════════
// 判定(純函式;正式跑、--selftest 判定表與真對照組共用)
// ═══════════════════════════════════════════════════════════════════════════
/** 點名一個量測對象:「哪一型・哪一則 story・第幾個觸發點」(失敗訊息與 --selftest 比對共用)。 */
export const whereKey = (inst) => `${KIND_LABEL[inst.kind] ?? '型別未知'} ${inst.story}${inst.trigger >= 0 ? ` 第 ${inst.trigger + 1} 個觸發點` : ''}`
export const where = (inst) => `${whereKey(inst)}「${inst.label}」`

/** aria-activedescendant 的判定:清單有可選項 → 必須非空、指向這個浮層裡看得見的 option、就是反白那一列;清單 0 筆 → 不得懸空。 */
export function aadProblem(aad) {
  if (!aad) return '量不到(找不到搜尋框)'
  if (aad.selectable === 0) return aad.id && !aad.exists ? `清單 0 筆,aria-activedescendant 卻指向不存在的「${aad.id}」` : null
  if (!aad.id) return `清單有 ${aad.selectable} 個可選項${aad.highlightedId ? `、反白在「${aad.highlightedId}」` : '、卻沒有任何反白'},搜尋框沒有 aria-activedescendant`
  if (!aad.exists) return `指向的「${aad.id}」在文件裡不存在`
  if (!aad.isOption) return `指向的「${aad.id}」不是 role=option`
  if (!aad.inPopup) return `指向的「${aad.id}」不在這個選單的浮層裡`
  if (!aad.rendered) return `指向的「${aad.id}」沒有渲染面積(看不見)`
  if (!aad.highlighted) return `指向「${aad.id}」,但反白的是「${aad.highlightedId}」`
  // ARIA 1.2 aria-activedescendant 的 MUST:指到的元素是焦點元素的後代,或焦點元素(combobox / textbox / searchbox)的 aria-controls
  // 指到包住它的元素(https://www.w3.org/TR/wai-aria-1.2/#aria-activedescendant)
  if (!aad.owned && !aad.controlled) return `指向「${aad.id}」,但搜尋框既不包含它,aria-controls(${aad.controls || '無'})也沒有指到包住它的 listbox`
  return null
}

/**
 * 欄位內搜尋框打了比整列還長的字之後的判定(量測 = 頁面端 op inlineVisible)。回 null = 通過;{ instrument } = 沒量到;{ failure } = 產品紅。
 * 要保證的性質(逐字,combobox.spec.md「欄位內搜尋框的寬度」):「最寬到整列,字比整列還長時停在整列寬、在框裡捲動」。
 * 所以量兩件事:框的右緣沒有超出欄位那一列(overflowRight ≤ 0.5)、框真的捲過去讓插入點看得見(scrollLeft > 0)。
 * 前提要先成立:打的字真的比整列寬(scrollWidth > rowWidth)—— 沒比整列寬就什麼都沒驗(儀器失效,不是綠)。
 */
export function longTypedProblem(v) {
  if (!v) return { instrument: '沒有「打比整列還長的字」那一步的量測' }
  if (v.scrollWidth <= v.rowWidth) return { instrument: `打的長字只有 ${v.scrollWidth}px,沒有比整列(${v.rowWidth}px)寬 —— 量不到「字比整列長」` }
  if (v.overflowRight > 0.5 || !(v.scrollLeft > 0)) {
    return { failure: `打了比整列還長的字(${v.length} 字、${v.scrollWidth}px,整列 ${v.rowWidth}px)後,搜尋框 ${v.width}px、右緣超出欄位 ${v.overflowRight}px、捲動 ${v.scrollLeft}px —— 應停在整列寬、在框裡捲動(插入點看得見)` }
  }
  return null
}

/**
 * @param {{ candidates: number, instances: object[], requireKinds?: string[], requireEmpty?: boolean, requireLivePick?: boolean }} report
 *   requireLivePick:整輪至少要有一次多選挑選真的改變了勾選 —— 個別 story 固定 value(設計規格的對照表傳 `onChange={() => {}}`)
 *   不動是合法的,不對單支開罰;但一次都沒變就代表「點擊根本沒生效」,焦點量得再漂亮也是零證據(同 select-all-footer 的 liveFlips)。
 * @returns {{ instrument: string[], failures: string[] }} instrument 非空 = 沒量到(不是產品裁決);failures 非空 = 產品紅(每行以 [規則] 開頭)
 */
export function judge(report) {
  const instrument = []
  const failures = []
  const {
    candidates = 0, instances = [], requireKinds = REQUIRED_KINDS, requireEmpty = true, requireLivePick = true,
    requireDirs = [], storyDir = {}, requireChrome = true, requireClear = true,
  } = report ?? {}
  if (!candidates) instrument.push('Storybook index 裡找不到任何候選 story(家族推導或 index.json 出錯)—— 一則都沒開,不能當綠燈')
  for (const inst of instances) {
    if (inst.status === 'instrument') { instrument.push(`${where(inst)}:${inst.reason}`); continue }
    if (inst.status !== 'exercised') continue
    const w = where(inst)
    const s = inst.steps ?? {}
    const multi = inst.kind.endsWith('-multi')
    const inline = inst.kind.startsWith('inline-')
    const aad = (when, value) => { const p = aadProblem(value); if (p) failures.push(`[aad] ${w}:${when}${p}`) }
    // 開啟:焦點在搜尋框(之後每一步的前提)
    if (!s.open) { instrument.push(`${w}:沒有「開啟」那一步的量測`); continue }
    if (!s.open.focusOnSearch) { failures.push(`[open-focus] ${w}:滑鼠點開後焦點不在搜尋框,落在 ${s.open.active}`); continue }
    aad('開啟時', s.open.aad)
    // 挑選前打字
    if (!s.typed) { instrument.push(`${w}:沒有「打字」那一步的量測`); continue }
    if (s.typed.value !== s.typed.query || !s.typed.focusOnSearch) {
      failures.push(`[typing] ${w}:打「${s.typed.query}」後搜尋框的值是「${s.typed.value}」、焦點在 ${s.typed.active}`)
      continue
    }
    aad(`打「${s.typed.query}」後`, s.typed.aad)
    // 組字中的 Enter:不選任何一項、不關選單、關鍵字不動
    if (s.ime) {
      const i = s.ime
      if (!i.after.open || i.after.checked !== i.before.checked || i.after.keyword !== i.before.keyword || i.after.tags !== i.before.tags) {
        failures.push(`[ime] ${w}:輸入法組字中按 Enter(isComposing)後 —— 選單${i.after.open ? '開著' : '關了'}、勾選數 ${i.before.checked} → ${i.after.checked}、Tag ${i.before.tags} → ${i.after.tags}、關鍵字「${i.before.keyword}」→「${i.after.keyword}」`)
        if (!i.after.open) continue // 選單被組字 Enter 關了,後面的挑選量不了(已紅在 [ime])
      }
    } else { instrument.push(`${w}:沒有「組字中按 Enter」那一步的量測`); continue }
    // 組字中的 Esc:不關選單、關鍵字不動;同一條派發路徑的一般 Esc 必須關得掉 —— 否則「組字 Esc 沒關」不能當證據
    // (派發根本到不了浮層),或是 Esc 被一律擋掉(組字判斷擋到了一般按鍵)。兩種都紅,訊息分開寫。
    if (!s.imeEsc) { instrument.push(`${w}:沒有「組字中按 Esc」那一步的量測`); continue }
    {
      const closedBy = s.imeEsc.shapes.filter((e) => !e.after.open || e.after.keyword !== e.before.keyword)
      for (const e of closedBy) {
        failures.push(`[ime] ${w}:輸入法組字中按 Esc(${IME_SHAPE_LABEL[e.shape]})後 —— 選單${e.after.open ? '開著' : '關了'}、關鍵字「${e.before.keyword}」→「${e.after.keyword}」(組字中的 Esc 是在取消選字)`)
      }
      // 被組字 Esc 關掉之後,量測端會重新點開、打回關鍵字接著量(見 exerciseTrigger 2c),所以這裡不中斷 —— 後面的規則照樣判
      if (!s.imeEsc.plain) { instrument.push(`${w}:沒有「一般 Esc 對照」那一步的量測`); continue }
      if (s.imeEsc.plain.open) {
        failures.push(`[ime] ${w}:同一條派發路徑、不帶組字旗標的一般 Esc 沒關掉選單 —— 組字 Esc「沒關」不能當證據(派發到不了浮層,或 Esc 被一律擋掉)`)
      }
    }
    // 滑鼠挑選
    if (!s.picks?.length) { instrument.push(`${w}:沒有任何一次滑鼠挑選的量測`); continue }
    for (const p of s.picks) {
      const on = `${p.how === 'checkbox' ? '勾選框' : '選項文字'}「${p.option}」`
      if (!p.press.open) failures.push(`[pick-focus] ${w}:按下${on}的當下選單已經關了`)
      else if (!p.press.focusOnSearch) failures.push(`[pick-focus] ${w}:按下${on}的當下,焦點從搜尋框被搬到 ${p.press.active}`)
      if (multi) {
        if (!p.after.open) { failures.push(`[pick-focus] ${w}:多選點完${on}選單就關了`); continue }
        if (!p.after.focusOnSearch) failures.push(`[pick-focus] ${w}:點完${on}焦點落在 ${p.after.active},不在搜尋框`)
        const expected = inline ? '' : s.typed.query
        if (p.after.keyword !== expected) {
          failures.push(`[keyword] ${w}:點完${on}關鍵字是「${p.after.keyword}」—— ${inline ? '欄位內搜尋每挑一次要清空' : `浮層內搜尋要保留「${expected}」`}`)
        }
        aad(`點完${on}後`, p.after.aad)
      } else if (p.after.open) {
        failures.push(`[single-close] ${w}:單選點完${on}選單沒有收起`)
      } else if (!p.after.focusInTrigger) {
        failures.push(`[single-close] ${w}:單選點完${on}焦點落在 ${p.after.active},沒有回到觸發欄位`)
      } else if (p.after.ring) {
        failures.push(`[pick-ring] ${w}:打過字後滑鼠點${on}收起,回到觸發點的焦點帶 :focus-visible(${p.after.active},outline ${p.after.outline})—— 指標挑選不該畫鍵盤框`)
      }
    }
    if (multi && s.picks.every((p) => p.after.open)) {
      const t = s.afterType
      if (!t) instrument.push(`${w}:沒有「點選之後再打字」那一步的量測`)
      else {
        if (t.value !== t.expected || !t.focusOnSearch) {
          failures.push(`[typing-after-pick] ${w}:點選之後再打「${t.char}」,搜尋框的值是「${t.value}」(應為「${t.expected}」),焦點在 ${t.active}`)
        } else aad(`點選之後再打「${t.char}」後`, t.aad)
      }
    }
    // 按欄位上的 Tag × / 浮層的全選(搜尋框握著焦點、選單開著)
    for (const c of inst.chrome ?? []) {
      const what = c.what === 'tag-remove' ? `Tag 的 ×「${c.label}」` : c.what === 'overflow-remove' ? `「+N」浮出清單裡的 ×「${c.label}」`
        : c.what === 'overflow-card-body' ? `「+N」浮出清單的卡片本身(${c.label},不是 ×)` : `全選鈕「${c.label}」`
      if (!c.press.focusOnSearch) failures.push(`[chrome-press] ${w}:按下${what}的當下,焦點從搜尋框被搬到 ${c.press.active}`)
      else if (!c.after.open) failures.push(`[chrome-press] ${w}:按${what}後選單關了`)
      else if (!c.after.focusOnSearch) failures.push(`[chrome-press] ${w}:按${what}後焦點落在 ${c.after.active},不在搜尋框`)
      else if (c.after.keyword !== c.before.keyword) failures.push(`[chrome-press] ${w}:按${what}後關鍵字「${c.before.keyword}」→「${c.after.keyword}」(Tag × / 卡片 / 全選不是在清單裡挑選,不動關鍵字)`)
      else if (c.typed && (c.typed.value !== c.typed.expected || !c.typed.focusOnSearch)) {
        failures.push(`[chrome-press] ${w}:按${what}後接著打「${c.typed.char}」,搜尋框的值是「${c.typed.value}」(應為「${c.typed.expected}」),焦點在 ${c.typed.active}`)
      }
    }
    // 選單關著、按「+N」浮出清單裡的 ×:移除後焦點不得掉到 body(焦點在被移除的那顆 × 上時要交接)
    if (inst.overflowClosed?.status === 'measured' && inst.overflowClosed.after.active === 'BODY') {
      failures.push(`[overflow-focus] ${w}:選單關著時按「+N」浮出清單裡的 ×「${inst.overflowClosed.label}」,移除後焦點掉到 body(按下時在 ${inst.overflowClosed.press.active})`)
    }
    // 欄位內搜尋:Tag 排滿、打了字之後,搜尋框整格看得見、打的字放得下(單行時 Tag 要讓位收進 +N)
    if (inst.typedVisible) {
      const v = inst.typedVisible
      if (!v.fits) failures.push(`[typed-visible] ${w}:Tag 排滿後打「${v.value}」,搜尋框 ${v.width}px(要 ${v.scrollWidth}px)、右緣超出 Tag 區 ${v.overflowRight}px —— 打的字看不全`)
    }
    // 欄位內搜尋:打了比整列還長的字 → 搜尋框停在整列寬、在框裡捲動(combobox.spec.md「欄位內搜尋框的寬度」;2026-09-30 第三輪:框跟著字長出欄位)
    if (inline) {
      const v = inst.longTyped
      const p = longTypedProblem(v)
      if (p?.instrument) instrument.push(`${w}:${p.instrument}`)
      else if (p) failures.push(`[typed-visible] ${w}:${p.failure}`)
    }
    // 一鍵清空(滑鼠,選單開著、已打了關鍵字):值與關鍵字一起清、焦點留在搜尋框、選單不關
    if (inst.mouseClear?.status === 'measured') {
      const m = inst.mouseClear
      if (m.after.keyword !== '') failures.push(`[clear-keyword] ${w}:打了「${m.before.keyword}」後按「${m.label}」,關鍵字還是「${m.after.keyword}」(一鍵清空連關鍵字一起清)`)
      else if (!m.after.open || !m.after.focusOnSearch) failures.push(`[clear-keyword] ${w}:按「${m.label}」後選單${m.after.open ? '開著' : '關了'}、焦點在 ${m.after.active}(應留在搜尋框)`)
    }
    // 鍵盤按一鍵清空:焦點留在欄位裡
    if (inst.clear && inst.clear.status === 'measured' && !inst.clear.after.focusInTrigger) {
      failures.push(`[clear-focus] ${w}:鍵盤在「${inst.clear.label}」上按 Enter 清空後,焦點落在 ${inst.clear.after.active},不在欄位裡`)
    }
    // 欄位內多選:value=[] 那條
    if (inst.kind === 'inline-multi') {
      const e = inst.empty
      if (!e) instrument.push(`${w}:空值那條沒有量(欄位內多選每一個都要量)`)
      else if (e.status === 'instrument') instrument.push(`${w}:空值那條沒量到 —— ${e.reason}`)
      else if (e.status === 'not-exercisable') { /* story 的 value 固定(onChange 不接),造不出 value=[];不紅、不算量到(由下方「至少量到一次」把關) */ }
      else if (!e.input?.exists || !e.input?.rendered) {
        failures.push(`[empty-input] ${w}:value=[] 時欄位裡沒有看得見的搜尋框(存在=${!!e.input?.exists},尺寸 ${e.input?.width ?? 0}×${e.input?.height ?? 0})`)
      } else {
        if (!e.click.open) failures.push(`[empty-input] ${w}:value=[] 時點搜尋框沒有開啟清單`)
        if (!e.click.focusOnSearch) failures.push(`[empty-input] ${w}:value=[] 時點搜尋框,焦點落在 ${e.click.active}`)
        if (e.typed.value !== e.typed.query) failures.push(`[empty-input] ${w}:value=[] 時打「${e.typed.query}」,搜尋框的值是「${e.typed.value}」`)
        else aad(`value=[] 時打「${e.typed.query}」後`, e.typed.aad)
        if (e.enter.tags < 1) failures.push(`[empty-input] ${w}:value=[] 時打字後按 Enter 沒有選到反白那一項`)
        if (e.enter.keyword !== '') failures.push(`[keyword] ${w}:value=[] 時按 Enter 選完,關鍵字是「${e.enter.keyword}」(欄位內搜尋每挑一次要清空)`)
        if (!e.enter.focusOnSearch) failures.push(`[empty-input] ${w}:value=[] 時按 Enter 選完,焦點落在 ${e.enter.active}`)
      }
    }
  }
  const exercised = instances.filter((i) => i.status === 'exercised')
  for (const kind of requireKinds) {
    if (!exercised.some((i) => i.kind === kind)) instrument.push(`沒有量到任何「${KIND_LABEL[kind]}」選單 —— 這一型的綠燈是零證據(型別判斷或 story 出了問題)`)
  }
  if (requireEmpty && requireKinds.includes('inline-multi') && !exercised.some((i) => i.kind === 'inline-multi' && i.empty?.status === 'measured')) {
    instrument.push('欄位內多選 value=[] 那條一次都沒量到 —— 空值的綠燈是零證據')
  }
  for (const dir of requireDirs) {
    if (!exercised.some((i) => storyDir[i.story] === dir)) instrument.push(`Command 的直接使用者「${dir}」一個可搜尋浮層都沒量到 —— 它共用同一條指標規則與收起還焦點,綠燈是零證據`)
  }
  if (requireChrome) {
    const measured = (kind, what) => exercised.some((i) => i.kind === kind && (i.chrome ?? []).some((c) => c.what === what))
    for (const [kind, what, label] of [['inline-multi', 'tag-remove', 'Tag 的 ×'], ['popover-multi', 'tag-remove', 'Tag 的 ×'], ['inline-multi', 'select-all', '全選鈕'],
      ['inline-multi', 'overflow-remove', '「+N」浮出清單裡的 ×'], ['popover-multi', 'overflow-remove', '「+N」浮出清單裡的 ×'],
      ['inline-multi', 'overflow-card-body', '「+N」浮出清單的卡片本身'], ['popover-multi', 'overflow-card-body', '「+N」浮出清單的卡片本身']]) {
      if (requireKinds.includes(kind) && !measured(kind, what)) instrument.push(`「${KIND_LABEL[kind]}」按${label}一次都沒量到 —— 這一條的綠燈是零證據`)
    }
    const once = (pred, label) => { if (!exercised.some(pred)) instrument.push(`${label}一次都沒量到 —— 這一條的綠燈是零證據`) }
    if (requireKinds.includes('popover-multi')) once((i) => i.overflowClosed?.status === 'measured', '選單關著時按「+N」浮出清單裡的 ×')
    if (requireKinds.includes('inline-multi')) once((i) => !!i.typedVisible, '欄位內多選 Tag 排滿後打字')
    if (requireKinds.some((k) => k.endsWith('-multi'))) once((i) => i.mouseClear?.status === 'measured', '多選打了關鍵字後用滑鼠按一鍵清空')
  }
  if (requireClear && !exercised.some((i) => i.clear?.status === 'measured')) {
    instrument.push('鍵盤按一鍵清空一次都沒量到(候選 story 裡找不到清空鈕,或清空鈕按了值沒變)—— 這一條的綠燈是零證據')
  }
  if (requireLivePick && requireKinds.some((k) => k.endsWith('-multi'))
    && !exercised.some((i) => i.kind.endsWith('-multi') && (i.steps?.picks ?? []).some((p) => p.checkedBefore !== p.checkedAfter))) {
    instrument.push('整輪沒有任何一次多選挑選真的改變勾選 —— 點擊可能根本沒生效,焦點與關鍵字的量測不能當證據')
  }
  return { instrument, failures }
}

// ── 判定表(--selftest 第一部分)─────────────────────────────────────────────
function goodAad(id = 'opt-2') { return { id, exists: true, isOption: true, inPopup: true, rendered: true, highlighted: true, highlightedId: id, selectable: 3, owned: false, controlled: true, controls: 'list-1' } }
function goodInstance(kind) {
  const multi = kind.endsWith('-multi')
  const inline = kind.startsWith('inline-')
  const pick = (how) => ({
    how, option: 'Food', value: 'food', checkedBefore: multi ? 'false' : null, checkedAfter: multi ? 'true' : null,
    press: { open: true, focusOnSearch: true, active: 'input' },
    after: multi ? { open: true, focusOnSearch: true, focusInTrigger: inline, active: 'input', keyword: inline ? '' : 'f', aad: goodAad() }
      : { open: false, focusOnSearch: false, focusInTrigger: true, active: 'div[combobox]', keyword: null, aad: null, ring: false, outline: 'none 0px' },
  })
  const inst = {
    story: 'demo--story', trigger: 0, label: 'demo', kind, status: 'exercised',
    steps: {
      open: { focusOnSearch: true, active: 'input', aad: goodAad('opt-1') },
      typed: { query: 'f', value: 'f', focusOnSearch: true, active: 'input', aad: goodAad() },
      picks: multi ? [pick('label'), pick('checkbox')] : [pick('label')],
      afterType: multi ? { char: 'f', expected: inline ? 'f' : 'ff', value: inline ? 'f' : 'ff', focusOnSearch: true, active: 'input', aad: goodAad() } : null,
      ime: { before: { open: true, checked: 1, tags: 1, keyword: 'f' }, after: { open: true, checked: 1, tags: 1, keyword: 'f' } },
      imeEsc: {
        shapes: ['composing', 'keyCode229'].map((shape) => ({ shape, before: { open: true, keyword: 'f' }, after: { open: true, keyword: 'f' } })),
        plain: { open: false },
      },
    },
  }
  if (inline) inst.longTyped = { length: LONG_KEYWORD.length, width: 280, scrollWidth: 760, clientWidth: 280, scrollLeft: 480, rowWidth: 300, overflowRight: 0 }
  const press = { focusOnSearch: true, active: 'input' }
  const after = { open: true, focusOnSearch: true, active: 'input', keyword: 'f' }
  if (multi) inst.chrome = [{ what: 'tag-remove', label: '移除 Food', press, before: { keyword: 'f' }, after }]
  if (kind === 'inline-multi') inst.chrome.push({ what: 'select-all', label: '全選', press, before: { keyword: '' }, after: { ...after, keyword: '' } })
  if (multi) {
    inst.chrome.push({ what: 'overflow-card-body', label: '卡片空白處', press, before: { keyword: 'f' }, after, typed: { char: 'o', expected: 'fo', value: 'fo', focusOnSearch: true, active: 'input' } })
    inst.chrome.push({ what: 'overflow-remove', label: '移除 Books', press, before: { keyword: 'f' }, after, typed: { char: 'o', expected: 'fo', value: 'fo', focusOnSearch: true, active: 'input' } })
    inst.mouseClear = { status: 'measured', label: '清除全部', before: { keyword: 'f' }, after: { open: true, focusOnSearch: true, active: 'input', keyword: '' } }
  }
  if (kind === 'popover-multi') inst.overflowClosed = { status: 'measured', label: '移除 Books', press: { active: 'button「移除 Books」' }, after: { active: 'div[role=combobox]', focusInTrigger: true } }
  if (kind === 'inline-multi') inst.typedVisible = { value: 'fo', fits: true, width: 120, scrollWidth: 20, overflowRight: 0 }
  if (kind === 'inline-single') inst.clear = { status: 'measured', label: '清除選取', after: { focusInTrigger: true, active: 'div[combobox]' } }
  if (kind === 'inline-multi') {
    inst.empty = {
      status: 'measured', input: { exists: true, rendered: true, width: 200, height: 24 },
      click: { open: true, focusOnSearch: true, active: 'input' },
      typed: { query: 'f', value: 'f', aad: goodAad() },
      enter: { tags: 1, keyword: '', focusOnSearch: true, active: 'input' },
    }
  }
  return inst
}

export function judgeTableSelftest() {
  let ok = true
  const all = () => REQUIRED_KINDS.map(goodInstance)
  const expect = (why, instances, pred, extra = {}) => {
    const v = judge({ candidates: 10, instances, ...extra })
    const pass = pred(v)
    if (!pass) ok = false
    console.log(`${pass ? '✓' : '✗'} 判定表:${why}${pass ? '' : ` —— 實得 ${JSON.stringify(v)}`}`)
  }
  const only = (tag) => (v) => v.instrument.length === 0 && v.failures.length >= 1 && v.failures.every((f) => f.startsWith(`[${tag}]`))
  const mutate = (kind, fn) => all().map((i) => (i.kind === kind ? (fn(i), i) : i))
  expect('四型都正確必綠', all(), (v) => v.failures.length === 0 && v.instrument.length === 0)
  for (const kind of REQUIRED_KINDS) {
    expect(`${KIND_LABEL[kind]}:按下選項當下焦點被搬走必紅在 [pick-focus] 並點名該型`, mutate(kind, (i) => { i.steps.picks[0].press = { open: true, focusOnSearch: false, active: 'div[cmdk-list]' } }),
      (v) => only('pick-focus')(v) && v.failures[0].includes(KIND_LABEL[kind]))
    expect(`${KIND_LABEL[kind]}:aria-activedescendant 是空的必紅在 [aad]`, mutate(kind, (i) => { i.steps.typed.aad = { ...goodAad(), id: '', exists: false, isOption: false, inPopup: false, rendered: false, highlighted: false } }),
      (v) => only('aad')(v) && v.failures[0].includes(KIND_LABEL[kind]))
  }
  expect('aria-activedescendant 指向的不是反白那一列必紅', mutate('popover-multi', (i) => { i.steps.open.aad = { ...goodAad('opt-9'), highlighted: false, highlightedId: 'opt-1' } }), only('aad'))
  expect('aria-activedescendant 指向不存在的節點必紅', mutate('inline-single', (i) => { i.steps.open.aad = { ...goodAad('ghost'), exists: false } }), only('aad'))
  expect('清單 0 筆時 aria-activedescendant 空著必綠', mutate('popover-multi', (i) => { i.steps.afterType.aad = { id: '', exists: false, isOption: false, inPopup: false, rendered: false, highlighted: false, highlightedId: null, selectable: 0 } }),
    (v) => v.failures.length === 0 && v.instrument.length === 0)
  expect('多選點完焦點落到清單必紅在 [pick-focus]', mutate('popover-multi', (i) => { i.steps.picks[1].after.focusOnSearch = false }), only('pick-focus'))
  expect('多選點完選單關掉必紅在 [pick-focus]', mutate('inline-multi', (i) => { i.steps.picks[0].after.open = false; i.steps.picks[1].after.open = false }), only('pick-focus'))
  expect('欄位內多選點完關鍵字沒清空必紅在 [keyword]', mutate('inline-multi', (i) => { i.steps.picks[0].after.keyword = 'f' }), only('keyword'))
  expect('浮層內多選點完關鍵字被清掉必紅在 [keyword]', mutate('popover-multi', (i) => { i.steps.picks[1].after.keyword = '' }), only('keyword'))
  expect('點完再打字沒進搜尋框必紅在 [typing-after-pick]', mutate('popover-multi', (i) => { i.steps.afterType.value = 'f' }), only('typing-after-pick'))
  expect('個別 story 固定 value(點了勾選不變)不紅', mutate('inline-multi', (i) => { i.steps.picks[0].checkedAfter = 'false' }), (v) => v.failures.length === 0 && v.instrument.length === 0)
  expect('整輪沒有任何一次挑選改變勾選 = 儀器失效', all().map((i) => { for (const p of i.steps.picks) p.checkedAfter = p.checkedBefore; return i }),
    (v) => v.instrument.length === 1 && /真的改變勾選/.test(v.instrument[0]) && v.failures.length === 0)
  expect('value 固定造不出空值不紅、但一次都沒量到 = 儀器失效', mutate('inline-multi', (i) => { i.empty = { status: 'not-exercisable', reason: '按 × 後 Tag 數沒變' } }),
    (v) => v.instrument.length === 1 && /value=\[\] 那條一次都沒量到/.test(v.instrument[0]) && v.failures.length === 0)
  expect('單選點完沒收起必紅在 [single-close]', mutate('inline-single', (i) => { i.steps.picks[0].after.open = true }), only('single-close'))
  expect('單選點完焦點沒回觸發欄位必紅在 [single-close]', mutate('popover-single', (i) => { i.steps.picks[0].after.focusInTrigger = false }), only('single-close'))
  expect('開啟後焦點不在搜尋框必紅在 [open-focus]', mutate('inline-single', (i) => { i.steps.open.focusOnSearch = false }), only('open-focus'))
  expect('打字沒進搜尋框必紅在 [typing]', mutate('popover-single', (i) => { i.steps.typed.value = '' }), only('typing'))
  expect('value=[] 時沒有搜尋框(修法前的形狀)必紅在 [empty-input]', mutate('inline-multi', (i) => { i.empty.input = { exists: false, rendered: false, width: 0, height: 0 } }), only('empty-input'))
  expect('value=[] 時搜尋框藏起來(0×0)必紅在 [empty-input]', mutate('inline-multi', (i) => { i.empty.input = { exists: true, rendered: false, width: 0, height: 0 } }), only('empty-input'))
  expect('value=[] 時 Enter 後關鍵字沒清空必紅在 [keyword]', mutate('inline-multi', (i) => { i.empty.enter.keyword = 'f' }), only('keyword'))
  expect('打字後滑鼠挑選收起、觸發點帶 :focus-visible 必紅在 [pick-ring]', mutate('popover-single', (i) => { i.steps.picks[0].after.ring = true; i.steps.picks[0].after.outline = 'solid 2px' }), only('pick-ring'))
  expect('aria-activedescendant 指到的列不是後代、aria-controls 也沒指到 listbox 必紅在 [aad]', mutate('inline-single', (i) => { i.steps.typed.aad = { ...goodAad(), controlled: false, controls: '' } }), only('aad'))
  expect('aria-activedescendant 指到後代(不需要 aria-controls)必綠', mutate('inline-single', (i) => { i.steps.typed.aad = { ...goodAad(), owned: true, controlled: false, controls: '' } }), (v) => v.failures.length === 0 && v.instrument.length === 0)
  expect('按 Tag × 的當下焦點被搬走必紅在 [chrome-press]', mutate('inline-multi', (i) => { i.chrome[0].press = { focusOnSearch: false, active: 'button「移除 Food」' } }), only('chrome-press'))
  expect('按全選後焦點不在搜尋框必紅在 [chrome-press]', mutate('inline-multi', (i) => { i.chrome[1].after = { ...i.chrome[1].after, focusOnSearch: false, active: 'button「取消全選」' } }), only('chrome-press'))
  expect('按 Tag × 後關鍵字被清掉必紅在 [chrome-press]', mutate('popover-multi', (i) => { i.chrome[0].after = { ...i.chrome[0].after, keyword: '' } }), only('chrome-press'))
  const overflowOf = (i) => i.chrome.find((c) => c.what === 'overflow-remove')
  for (const kind of ['inline-multi', 'popover-multi']) {
    expect(`${KIND_LABEL[kind]}:按下「+N」浮出清單裡的 × 當下焦點被搬走必紅在 [chrome-press](2026-09-30 前的形狀)`,
      mutate(kind, (i) => { overflowOf(i).press = { focusOnSearch: false, active: 'button[data-collection-remove]「移除 Books」' } }), (v) => only('chrome-press')(v) && v.failures[0].includes('浮出清單'))
  }
  expect('按「+N」浮出清單裡的 × 後接著打字沒進搜尋框必紅在 [chrome-press]', mutate('popover-multi', (i) => { overflowOf(i).typed = { ...overflowOf(i).typed, value: 'f', focusOnSearch: false, active: 'div[role=combobox]' } }), only('chrome-press'))
  expect('選單關著按「+N」浮出清單裡的 × 後焦點掉到 body 必紅在 [overflow-focus]', mutate('popover-multi', (i) => { i.overflowClosed.after = { active: 'BODY', focusInTrigger: false } }), only('overflow-focus'))
  expect('Tag 排滿後打的字看不全(搜尋框被裁)必紅在 [typed-visible]', mutate('inline-multi', (i) => { i.typedVisible = { value: 'furniture', fits: false, width: 28, scrollWidth: 70, overflowRight: 32 } }), only('typed-visible'))
  expect('一鍵清空後關鍵字還在必紅在 [clear-keyword](2026-09-30 前的形狀)', mutate('inline-multi', (i) => { i.mouseClear.after = { ...i.mouseClear.after, keyword: 'f' } }), only('clear-keyword'))
  expect('一鍵清空後焦點離開搜尋框必紅在 [clear-keyword]', mutate('popover-multi', (i) => { i.mouseClear.after = { ...i.mouseClear.after, focusOnSearch: false, active: 'button「清除全部」' } }), only('clear-keyword'))
  expect('「+N」浮出清單裡的 × 一次都沒量到 = 儀器失效', all().map((i) => { if (i.chrome) i.chrome = i.chrome.filter((c) => c.what !== 'overflow-remove'); return i }),
    (v) => v.instrument.length === 2 && v.instrument.every((m) => /浮出清單/.test(m)) && v.failures.length === 0)
  expect('選單關著按 +N × 一次都沒量到 = 儀器失效', all().map((i) => { delete i.overflowClosed; return i }), (v) => v.instrument.length === 1 && /選單關著/.test(v.instrument[0]) && v.failures.length === 0)
  expect('Tag 排滿後打字一次都沒量到 = 儀器失效', all().map((i) => { delete i.typedVisible; return i }), (v) => v.instrument.length === 1 && /排滿後打字/.test(v.instrument[0]) && v.failures.length === 0)
  expect('滑鼠一鍵清空一次都沒量到 = 儀器失效', all().map((i) => { delete i.mouseClear; return i }), (v) => v.instrument.length === 1 && /滑鼠按一鍵清空/.test(v.instrument[0]) && v.failures.length === 0)
  expect('鍵盤清空後焦點掉到 body 必紅在 [clear-focus]', mutate('inline-single', (i) => { i.clear.after = { focusInTrigger: false, active: 'BODY' } }), only('clear-focus'))
  expect('組字中的 Enter 選了東西必紅在 [ime]', mutate('inline-multi', (i) => { i.steps.ime.after = { ...i.steps.ime.after, checked: 2, tags: 2 } }), only('ime'))
  expect('組字中的 Enter 關了單選必紅在 [ime]', mutate('inline-single', (i) => { i.steps.ime.after = { ...i.steps.ime.after, open: false } }), only('ime'))
  const imeEscOf = (i, shape) => i.steps.imeEsc.shapes.find((e) => e.shape === shape)
  for (const kind of REQUIRED_KINDS) {
    expect(`${KIND_LABEL[kind]}:組字中的 Esc(isComposing)關了選單必紅在 [ime](2026-10-01 前的形狀)`,
      mutate(kind, (i) => { imeEscOf(i, 'composing').after = { open: false, keyword: '' } }), (v) => only('ime')(v) && v.failures[0].includes(KIND_LABEL[kind]) && v.failures[0].includes('Esc'))
  }
  expect('組字中的 Esc(keyCode 229)關了選單必紅在 [ime]', mutate('inline-multi', (i) => { imeEscOf(i, 'keyCode229').after = { open: false, keyword: '' } }), (v) => only('ime')(v) && v.failures[0].includes('keyCode 229'))
  expect('組字中的 Esc 動了關鍵字必紅在 [ime]', mutate('popover-multi', (i) => { imeEscOf(i, 'composing').after = { open: true, keyword: '' } }), only('ime'))
  expect('同一條派發路徑的一般 Esc 沒關掉選單必紅在 [ime](量具到不了浮層 / Esc 被一律擋掉)', mutate('popover-single', (i) => { i.steps.imeEsc.plain = { open: true } }), (v) => only('ime')(v) && v.failures[0].includes('一般 Esc'))
  expect('沒有組字 Esc 的量測 = 儀器失效', mutate('inline-single', (i) => { delete i.steps.imeEsc }), (v) => v.instrument.length === 1 && /組字中按 Esc/.test(v.instrument[0]) && v.failures.length === 0)
  expect('打比整列還長的字後搜尋框長出欄位(2026-09-30 第三輪的形狀)必紅在 [typed-visible]',
    mutate('inline-multi', (i) => { i.longTyped = { length: 67, width: 451.4, scrollWidth: 451, clientWidth: 451, scrollLeft: 0, rowWidth: 316, overflowRight: 135.4 } }), only('typed-visible'))
  expect('打比整列還長的字後搜尋框沒有捲動(插入點看不見)必紅在 [typed-visible]', mutate('inline-single', (i) => { i.longTyped = { ...i.longTyped, scrollLeft: 0 } }), only('typed-visible'))
  expect('打的長字沒有比整列寬 = 儀器失效', mutate('inline-multi', (i) => { i.longTyped = { ...i.longTyped, scrollWidth: 200, rowWidth: 300 } }), (v) => v.instrument.length === 1 && /沒有比整列/.test(v.instrument[0]) && v.failures.length === 0)
  expect('欄位內搜尋沒有量長字 = 儀器失效', mutate('inline-single', (i) => { delete i.longTyped }), (v) => v.instrument.length === 1 && /比整列還長/.test(v.instrument[0]) && v.failures.length === 0)
  const cardBodyOf = (i) => i.chrome.find((c) => c.what === 'overflow-card-body')
  expect('欄位內多選:按「+N」卡片本身後選單關了、關鍵字被清(2026-10-01 前的形狀)必紅在 [chrome-press]',
    mutate('inline-multi', (i) => { cardBodyOf(i).after = { open: false, focusOnSearch: true, active: 'input', keyword: '' } }), (v) => only('chrome-press')(v) && v.failures[0].includes('卡片本身'))
  expect('浮層內多選:按「+N」卡片本身後選單關了、焦點回觸發區(2026-10-01 前的形狀)必紅在 [chrome-press]',
    mutate('popover-multi', (i) => { cardBodyOf(i).after = { open: false, focusOnSearch: false, active: 'div[role=combobox]', keyword: null } }), (v) => only('chrome-press')(v) && v.failures[0].includes('卡片本身'))
  expect('「+N」卡片本身一次都沒量到 = 儀器失效', all().map((i) => { if (i.chrome) i.chrome = i.chrome.filter((c) => c.what !== 'overflow-card-body'); return i }),
    (v) => v.instrument.length === 2 && v.instrument.every((m) => /卡片本身/.test(m)) && v.failures.length === 0)
  expect('Tag × 一次都沒量到 = 儀器失效', all().map((i) => { if (i.chrome) i.chrome = i.chrome.filter((c) => c.what !== 'tag-remove'); return i }),
    (v) => v.instrument.length === 2 && v.instrument.every((m) => /Tag 的 ×/.test(m)) && v.failures.length === 0)
  expect('一鍵清空一次都沒量到 = 儀器失效', all().map((i) => { delete i.clear; return i }), (v) => v.instrument.length === 1 && /一鍵清空/.test(v.instrument[0]) && v.failures.length === 0)
  expect('直接使用者一個都沒量到 = 儀器失效', all(), (v) => v.instrument.length === 1 && /AgentPanel/.test(v.instrument[0]) && v.failures.length === 0,
    { requireDirs: ['AgentPanel'], storyDir: { 'demo--story': 'Combobox' } })
  expect('直接使用者量到了必綠', all(), (v) => v.instrument.length === 0 && v.failures.length === 0, { requireDirs: ['Combobox'], storyDir: { 'demo--story': 'Combobox' } })
  expect('找不到候選 story = 儀器失效', all(), (v) => v.instrument.length === 1 && v.failures.length === 0, { candidates: 0 })
  for (const kind of REQUIRED_KINDS) {
    expect(`缺「${KIND_LABEL[kind]}」= 儀器失效,不是綠`, all().filter((i) => i.kind !== kind), (v) => v.instrument.some((m) => m.includes(KIND_LABEL[kind])) && v.failures.length === 0)
  }
  expect('空值那條沒量到 = 儀器失效', mutate('inline-multi', (i) => { i.empty = { status: 'instrument', reason: 'Tag 移不掉' } }), (v) => v.instrument.length === 2 && v.failures.length === 0)
  expect('單一實例沒量到 = 儀器失效', [...all(), { story: 'x', trigger: 1, label: 'y', kind: 'popover-multi', status: 'instrument', reason: '點的位置沒落在選項上' }], (v) => v.instrument.length === 1 && v.failures.length === 0)
  expect('不是可搜尋選單 / 選不到東西的不算數(不紅也不算量到)', [...all(), { story: 'x', trigger: 0, label: 'y', kind: 'popover-single', status: 'not-exercisable', reason: '清單沒有可挑選的選項' }], (v) => v.failures.length === 0 && v.instrument.length === 0)
  const derived = deriveSearchableMenuFamily()
  const familyOk = derived[0] === 'SelectMenu' && ['Select', 'Combobox', 'PeoplePicker'].every((d) => derived.includes(d)) && !derived.includes('Pagination') && !derived.includes('DataTable')
  if (!familyOk) ok = false
  console.log(`${familyOk ? '✓' : '✗'} 家族推導:${derived.join(' / ')}(owner SelectMenu 排第一、必含 Select / Combobox / PeoplePicker;只轉用 Select、不開放搜尋的 Pagination / DataTable 不得納入)`)
  const { requireDirs } = deriveGateFamily()
  const directOk = ['AgentPanel', 'Command'].every((d) => requireDirs.includes(d)) && !requireDirs.includes('SelectMenu') && !requireDirs.includes('DataTable')
  if (!directOk) ok = false
  console.log(`${directOk ? '✓' : '✗'} Command 直接使用者推導:${requireDirs.join(' / ')}(必含 AgentPanel、Command;SelectMenu 已在選單家族、DataTable 沒有搜尋框,不得列入)`)
  // 組字判準(lib/ime-composition.ts)判定表:兩種組字訊號都要認,一般按鍵不認;React 合成事件(nativeEvent)與原生事件同一條
  const imeRows = [
    [{ isComposing: true, keyCode: 13 }, true, 'isComposing'],
    [{ isComposing: false, keyCode: 229 }, true, 'Safari 注音選字的最後一顆(isComposing 已 false、keyCode 229)'],
    [{ isComposing: false, keyCode: 13 }, false, '一般 Enter'],
    [{ nativeEvent: { isComposing: true, keyCode: 0 } }, true, 'React 合成事件'],
    [{ nativeEvent: { isComposing: false, keyCode: 13 } }, false, 'React 合成事件的一般 Enter'],
  ]
  for (const [event, want, why] of imeRows) {
    const got = isImeComposing(event)
    if (got !== want) ok = false
    console.log(`${got === want ? '✓' : '✗'} 組字判準:${why} → ${got}`)
  }
  return ok
}

// ═══════════════════════════════════════════════════════════════════════════
// 頁面端(以 page.evaluate 序列化傳入,不得引用外部變數)
// ═══════════════════════════════════════════════════════════════════════════
/** 所有頁面端量測的唯一入口:op 決定做什麼。觸發點以 data-gate-trigger 編號(每次先重新編號,DOM 重掛也對得上)。 */
function pageProbe(arg) {
  const { op, k } = arg
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
  const describe = (el) => {
    if (!el || el === document.body || el === document.documentElement) return 'BODY'
    const attrs = ['cmdk-input', 'cmdk-list', 'cmdk-root', 'cmdk-item', 'data-collection-remove'].filter((a) => el.hasAttribute(a))
    const role = el.getAttribute('role')
    const name = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20)
    return `${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}${attrs.map((a) => `[${a}]`).join('')}「${name}」`
  }
  const labelOf = (el) => {
    const lines = (el?.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean)
    return lines.find((l) => [...l].length >= 2) || lines[0] || ''
  }
  const enumerate = () => {
    const all = [...document.querySelectorAll('[role="combobox"], button[aria-haspopup]')]
      .filter((el) => !el.closest('[data-radix-popper-content-wrapper]') && !el.hasAttribute('cmdk-input'))
    const top = all.filter((el) => !all.some((o) => o !== el && o.contains(el)))
    document.querySelectorAll('[data-gate-trigger]').forEach((el) => el.removeAttribute('data-gate-trigger'))
    top.forEach((el, i) => el.setAttribute('data-gate-trigger', String(i)))
    return top
  }
  const trigger = op === 'enumerate' ? null : document.querySelector(`[data-gate-trigger="${k}"]`)
  // 浮層 = popper(Popover:選單、AgentPanel 歷史)或對話框(CommandDialog)裡有 cmdk 根的那一個
  const OVERLAY = '[data-radix-popper-content-wrapper], [role="dialog"]'
  const popup = () => {
    if (!trigger) return null
    for (const id of (trigger.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean)) {
      const el = document.getElementById(id)
      const w = el?.closest('[data-radix-popper-content-wrapper]') ?? (el?.matches('[role="dialog"]') ? el : null)
      if (w?.querySelector('[cmdk-root]')) return w
    }
    const open = [...document.querySelectorAll(OVERLAY)].filter((w) => w.querySelector('[cmdk-root]') && visible(w) && !w.parentElement?.closest(OVERLAY))
    return open.length === 1 ? open[0] : null
  }
  const inlineInput = () => (trigger ? [...trigger.querySelectorAll('input')].find((i) => i.getAttribute('aria-hidden') !== 'true' && i.type !== 'hidden' && visible(i)) : null) || null
  const options = (w) => (w ? [...w.querySelectorAll('[cmdk-item][role="option"]')].filter((o) => visible(o) && o.getAttribute('aria-disabled') !== 'true') : [])
  // 挑選目標只用一般選項:「不限」列(結構記號 data-unrestricted)與建立列(select-menu.tsx 以 `__create__` 前綴當 cmdk 身分)各有自己的關鍵字規則
  const isNormal = (o) => !o.hasAttribute('data-unrestricted') && !(o.getAttribute('data-value') || '').startsWith('__create__')
  const optionByValue = (w, value) => [...(w?.querySelectorAll('[cmdk-item]') ?? [])].find((o) => o.getAttribute('data-value') === value) || null

  if (op === 'enumerate') return enumerate().map((el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32))
  if (!trigger) return { gone: true }

  if (op === 'triggerUsable') {
    // 點的位置由 lib/launch-browser.mjs ownSurfacePosition 找(全部瀏覽器閘同一份「觸發欄位自己的表面」判準);這裡只判能不能點
    if (!visible(trigger)) return { ok: false, why: '看不見' }
    if (trigger.matches(':disabled, [aria-disabled="true"], [data-disabled], [aria-readonly="true"], [readonly]') || trigger.closest('[inert]')) return { ok: false, why: '停用 / 唯讀' }
    return { ok: true }
  }

  if (op === 'idle') { const w = popup(); return !w || !w.querySelector('[aria-busy="true"]') }

  if (op === 'state') {
    const w = popup()
    const inline = inlineInput()
    const pop = w?.querySelector('[cmdk-input]') || null
    const search = inline || (visible(pop) ? pop : null)
    const ae = document.activeElement
    const all = options(w)
    let aad = null
    if (search) {
      const id = search.getAttribute('aria-activedescendant') || ''
      const el = id ? document.getElementById(id) : null
      const r = el?.getBoundingClientRect()
      const controls = search.getAttribute('aria-controls') || ''
      aad = {
        id, exists: !!el, isOption: el?.getAttribute('role') === 'option', inPopup: !!(w && el && w.contains(el)),
        rendered: !!r && r.width > 0 && r.height > 0, highlighted: el?.getAttribute('data-selected') === 'true',
        highlightedId: w?.querySelector('[cmdk-item][data-selected="true"]')?.id || null, selectable: all.length,
        owned: !!el && search !== el && search.contains(el), controls,
        controlled: !!el && controls.split(/\s+/).filter(Boolean).some((c) => { const t = document.getElementById(c); return !!t && t.getAttribute('role') === 'listbox' && t.contains(el) }),
      }
    }
    return {
      open: !!w && visible(w),
      position: inline ? 'inline' : search ? 'popover' : null,
      // 多選 = 選項列帶勾選框;一列選項都還沒有(載入中 / 遠端還沒打字)時判不出來 → null,不猜
      multi: w?.querySelector('[cmdk-item]') ? !!w.querySelector('[cmdk-item] [role="checkbox"]') : null,
      busy: !!w?.querySelector('[aria-busy="true"]'),
      normalOptions: all.filter(isNormal).length,
      focusOnSearch: !!search && ae === search,
      focusInTrigger: trigger.contains(ae),
      active: describe(ae),
      ring: !!ae && ae !== document.body && ae.matches(':focus-visible'),
      outline: ae && ae !== document.body ? `${getComputedStyle(ae).outlineStyle} ${getComputedStyle(ae).outlineWidth}` : 'none',
      keyword: search ? search.value : null,
      tags: trigger.querySelectorAll('[data-collection-remove]').length,
      checked: w ? w.querySelectorAll('[cmdk-item] [role="checkbox"][aria-checked="true"]').length : 0,
      aad,
    }
  }

  if (op === 'imeEnter') {
    // 組字中的 Enter:派在此刻握著焦點的搜尋框上(React 從 document 委派收事件,isComposing 由瀏覽器原樣帶進 nativeEvent)
    const target = document.activeElement
    if (!target || target === document.body) return { ok: false }
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing: true }))
    return { ok: true }
  }

  if (op === 'imeEscape') {
    // 組字中的 Esc(shape = composing:isComposing;keyCode229:Safari 選字的最後一顆 —— isComposing 已 false、只剩 keyCode 229;
    // plain:同一條派發路徑、不帶組字旗標的對照)。派在此刻握著焦點的元素上:Radix 的 Esc 監聽掛在 document 捕獲階段,看得到它。
    const { shape } = arg
    const target = document.activeElement
    if (!target || target === document.body) return { ok: false }
    const ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true, isComposing: shape === 'composing' })
    if (shape === 'keyCode229') Object.defineProperty(ev, 'keyCode', { get: () => 229 })
    target.dispatchEvent(ev)
    return { ok: true }
  }

  if (op === 'overflowCardBody') {
    // 「+N」浮出清單(沒有 cmdk 的那張 popper 卡)本身:卡片左側內距那一條(不是 ×、不是 Tag、不是頭像)—— 點下去不該有任何動作
    for (const w of document.querySelectorAll('[data-radix-popper-content-wrapper]')) {
      if (w.querySelector('[cmdk-root]') || !visible(w) || !w.querySelector('[data-collection-remove]')) continue
      const r = w.getBoundingClientRect()
      for (const [x, y] of [[r.left + 4, r.top + r.height / 2], [r.left + r.width / 2, r.top + 3], [r.left + r.width / 2, r.bottom - 3]]) {
        const hit = document.elementFromPoint(x, y)
        if (hit && w.contains(hit) && !hit.closest('button, a[href], [role="button"], input, [data-tag-root], [data-avatar-size], [data-collection-remove]')) {
          return { x, y, label: `卡片空白處(${describe(hit)})` }
        }
      }
    }
    return null
  }

  if (op === 'chromePoint') {
    // 欄位上的 Tag ×(what = tag-remove)、浮層 footer 的全選鈕(what = select-all)或欄位上的一鍵清空鈕(what = clear);
    // 只用現在就點得到的(elementFromPoint 落在它上面)
    const { what } = arg
    const candidates = what === 'tag-remove'
      ? [...trigger.querySelectorAll('[data-collection-remove]')]
      : what === 'clear'
        ? [...trigger.querySelectorAll('button[aria-label="清除選取"], button[aria-label="清除全部"]')]
        : [...(popup()?.querySelectorAll('[cmdk-root] [data-slot="surface-footer"] button') ?? [])]
    for (const b of candidates.filter(visible)) {
      const r = b.getBoundingClientRect()
      const x = r.left + r.width / 2, y = r.top + r.height / 2
      const hit = document.elementFromPoint(x, y)
      if (hit && b.contains(hit)) return { ok: true, x, y, label: b.getAttribute('aria-label') || b.textContent.trim() }
    }
    return { ok: false }
  }

  if (op === 'overflowPoint') {
    // 觸發欄位上的「+N」(OverflowIndicator 的觸發點);看不見 → 沒有溢出
    const o = [...trigger.querySelectorAll('[data-overflow-indicator]')].find(visible)
    if (!o) return { ok: false }
    const r = o.getBoundingClientRect()
    return { ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2, text: o.textContent.trim() }
  }

  if (op === 'overflowCardX') {
    // 「+N」浮出清單(HoverCard:popper 裡沒有 cmdk 的那一張)裡第一顆點得到的 ×;還沒出現 → null(給 waitForFunction 等元素本身)
    for (const w of document.querySelectorAll('[data-radix-popper-content-wrapper]')) {
      if (w.querySelector('[cmdk-root]') || !visible(w)) continue
      for (const b of [...w.querySelectorAll('[data-collection-remove]')].filter(visible)) {
        const r = b.getBoundingClientRect()
        const x = r.left + r.width / 2, y = r.top + r.height / 2
        const hit = document.elementFromPoint(x, y)
        if (hit && b.contains(hit)) return { x, y, label: b.getAttribute('aria-label') || '' }
      }
    }
    return null
  }

  if (op === 'searchPoint') {
    // 搜尋框(欄位內輸入框或浮層內 [cmdk-input])的點:把焦點放回搜尋框用
    const w = popup()
    const el = inlineInput() || w?.querySelector('[cmdk-input]')
    if (!el || !visible(el)) return { ok: false }
    const r = el.getBoundingClientRect()
    const x = r.left + Math.min(12, r.width / 2), y = r.top + r.height / 2
    const hit = document.elementFromPoint(x, y)
    return { ok: !!hit && (hit === el || el.contains(hit)), x, y }
  }

  if (op === 'inlineVisible') {
    // 欄位內搜尋框:整格落在 Tag 區裡、打的字放得下(scrollWidth ≤ clientWidth);單行時 Tag 要讓位收進 +N
    const input = inlineInput()
    if (!input) return null
    const area = input.closest('[role="combobox"] > div') || trigger
    const ir = input.getBoundingClientRect()
    const ar = area.getBoundingClientRect()
    const overflowRight = Math.max(0, Math.round((ir.right - ar.right) * 10) / 10)
    const fits = input.scrollWidth <= input.clientWidth + 1 && overflowRight <= 0.5 && ir.width > 0
    return {
      value: input.value, length: input.value.length, fits, width: Math.round(ir.width * 10) / 10, overflowRight,
      scrollWidth: input.scrollWidth, clientWidth: input.clientWidth, scrollLeft: Math.round(input.scrollLeft * 10) / 10, rowWidth: Math.round(ar.width * 10) / 10,
    }
  }

  if (op === 'focusClear') {
    // 一鍵清空鈕(Select「清除選取」/ Combobox「清除全部」):用程式聚焦,等同 Tab 走到它
    const b = trigger.querySelector('button[aria-label="清除選取"], button[aria-label="清除全部"]')
    if (!b || !visible(b)) return { ok: false }
    b.focus()
    return { ok: document.activeElement === b, label: b.getAttribute('aria-label') }
  }
  if (op === 'clearGone') return !trigger.querySelector('button[aria-label="清除選取"], button[aria-label="清除全部"]')

  if (op === 'queryChars') {
    // 關鍵字取自清單裡第 2 個(沒有就第 1 個)一般選項的標籤文字 —— 本機過濾(label 子字串 / cmdk 模糊比對)與
    // story 的假後端(label + keywords 子字串)都一定留下它;字母或數字才用,最多三個候選(第一個不行才換下一個)。
    // 同一個標籤裡,優先用「也出現在最多其他選項標籤裡」的字:過濾後還剩 ≥ 2 列,多選才量得到第二次挑選(勾選框)
    const normal = options(popup()).filter(isNormal)
    const target = normal[1] || normal[0]
    const label = labelOf(target)
    const labels = normal.map((o) => labelOf(o).toLowerCase())
    const seen = new Set()
    const chars = [...label].filter((c) => /[\p{L}\p{N}]/u.test(c)).filter((c) => { const key = c.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true })
    const hits = (c) => labels.filter((l) => l.includes(c.toLowerCase())).length
    return { label, chars: chars.map((c, i) => ({ c, i, n: hits(c) })).sort((a, b) => (b.n - a.n) || (a.i - b.i)).slice(0, 3).map(({ c }) => c) }
  }

  if (op === 'nextChar') {
    // 浮層內多選點完後接著打的字:取某個還看得見的選項標籤裡,緊接在關鍵字後面的那個字(關鍵字 + 它仍是子字串)
    const { keyword } = arg
    for (const o of options(popup()).filter(isNormal)) {
      const label = labelOf(o)
      const at = label.toLowerCase().indexOf(String(keyword).toLowerCase())
      const next = at >= 0 ? label[at + keyword.length] : undefined
      if (next && /[\p{L}\p{N}]/u.test(next)) return next
    }
    return null
  }

  if (op === 'optionPoint') {
    // 滑鼠要按的點:label = 選項文字(列寬 45–75% 之間,避開前面的勾選框 / 頭像);checkbox = 勾選框正中。
    // 只用「現在就點得到」的列:elementFromPoint 必須落在那一列裡(不捲動、不猜)。
    const { how, avoid = [] } = arg
    const normal = options(popup()).filter(isNormal).filter((o) => !avoid.includes(o.getAttribute('data-value')))
    const ordered = [normal[1], normal[0], ...normal.slice(2)].filter(Boolean)
    for (const o of ordered) {
      const box = how === 'checkbox' ? o.querySelector('[role="checkbox"]') : o
      if (!box || !visible(box)) continue
      const r = box.getBoundingClientRect()
      const xs = how === 'checkbox' ? [r.left + r.width / 2] : [0.6, 0.45, 0.75].map((f) => r.left + r.width * f)
      for (const x of xs) {
        const y = r.top + r.height / 2
        const hit = document.elementFromPoint(x, y)
        if (!hit || !o.contains(hit)) continue
        if (how === 'label' && hit.closest('[role="checkbox"], button, a[href], [role="button"]')) continue
        const cb = o.querySelector('[role="checkbox"]')
        return { ok: true, x, y, value: o.getAttribute('data-value'), option: labelOf(o), checkedBefore: cb ? cb.getAttribute('aria-checked') : null, hit: describe(hit) }
      }
    }
    return { ok: false }
  }

  if (op === 'checked') {
    const o = optionByValue(popup(), arg.value)
    return o?.querySelector('[role="checkbox"]')?.getAttribute('aria-checked') ?? null
  }

  if (op === 'removePoint') {
    const buttons = [...trigger.querySelectorAll('[data-collection-remove]')]
    for (const b of buttons.filter(visible)) {
      const r = b.getBoundingClientRect()
      const x = r.left + r.width / 2, y = r.top + r.height / 2
      const hit = document.elementFromPoint(x, y)
      if (hit && b.contains(hit)) return { ok: true, x, y, remaining: buttons.length }
    }
    return { ok: false, remaining: buttons.length }
  }

  if (op === 'emptyInput') {
    const input = [...trigger.querySelectorAll('input')].find((i) => i.getAttribute('aria-hidden') !== 'true' && i.type !== 'hidden') || null
    if (!input) return { exists: false, rendered: false, width: 0, height: 0 }
    const r = input.getBoundingClientRect()
    const rendered = visible(input) && r.width > 0 && r.height > 0 && !input.disabled
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    const hit = rendered ? document.elementFromPoint(x, y) : null
    return { exists: true, rendered, width: Math.round(r.width), height: Math.round(r.height), x, y, hitOk: !!hit && (hit === input || input.contains(hit)), hit: describe(hit), placeholder: input.placeholder }
  }
  throw new Error(`pageProbe:未知的 op ${op}`)
}

// ── 真對照組:把修法在頁面上拆掉(--selftest)──────────────────────────────────
/** a. 選項 mousedown 的 preventDefault 失效 = cmdk 原生行為(cmdk 的選項沒擋 mousedown,焦點被交給最近的可聚焦祖先 [cmdk-list])。 */
function controlRestoreFocusTheft() {
  const original = Event.prototype.preventDefault
  Event.prototype.preventDefault = function preventDefault() {
    if (this.type === 'mousedown' && this.target instanceof Element && this.target.closest('[cmdk-root]')) return undefined
    return original.call(this)
  }
}
/** b. 輸入框上的 aria-activedescendant 寫不上去 = 修法前欄位內輸入框恆為 null(浮層內搜尋框開啟時同樣是 null)。 */
function controlStripActiveDescendant() {
  const original = Element.prototype.setAttribute
  Element.prototype.setAttribute = function setAttribute(name, value) {
    if (String(name).toLowerCase() === 'aria-activedescendant' && this instanceof HTMLInputElement) return undefined
    return original.call(this, name, value)
  }
}
/** c. 欄位裡沒有 Tag 時把搜尋框藏起來 = 修法前輸入框只掛在 Tag 清單尾巴(value=[] 時不存在)。只套在被量的那個觸發欄位上。 */
function controlHideEmptyInlineInput(k) {
  const style = document.createElement('style')
  style.textContent = `[data-gate-trigger="${k}"]:not(:has([data-collection-remove])) input:not([aria-hidden="true"]) { display: none !important; }`
  document.head.appendChild(style)
  return true
}

/** d. 還焦點時的 focusVisible: false 被吃掉(= 不支援這個選項的引擎 / 修法前)。 */
function controlDropFocusVisibleOption() {
  const original = HTMLElement.prototype.focus
  HTMLElement.prototype.focus = function focus(options) {
    if (options && typeof options === 'object' && 'focusVisible' in options) {
      const { focusVisible: _dropped, ...rest } = options
      return original.call(this, rest)
    }
    return original.call(this, options)
  }
}
/** e. 欄位內搜尋框的 aria-controls 被拿掉(= 第一版只寫 aria-activedescendant);浮層內 [cmdk-input] 不動。 */
function controlStripInlineControls() {
  const strip = (el) => { if (el instanceof HTMLInputElement && !el.hasAttribute('cmdk-input') && el.hasAttribute('aria-controls')) el.removeAttribute('aria-controls') }
  new MutationObserver((records) => records.forEach((r) => strip(r.target)))
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['aria-controls'] })
}
/** f. 觸發欄位上的 mousedown preventDefault 失效(= 修法前:Tag × 在 mousedown 就拿走焦點)。 */
function controlRestoreChromeFocusTheft() {
  const original = Event.prototype.preventDefault
  Event.prototype.preventDefault = function preventDefault() {
    if (this.type === 'mousedown' && this.target instanceof Element && this.target.closest('[data-gate-trigger]')) return undefined
    return original.call(this)
  }
}
/** g. 一鍵清空前的焦點交接被吃掉(= 修法前:焦點隨按鈕卸載掉到 body)。 */
function controlDropClearHandoff() {
  const original = HTMLElement.prototype.focus
  HTMLElement.prototype.focus = function focus(options) {
    const active = document.activeElement
    if (active instanceof Element && active.matches('button[aria-label="清除選取"], button[aria-label="清除全部"]') && active !== this) return undefined
    return original.call(this, options)
  }
}
/** h. 鍵盤事件看不出組字(= 修法前代發給清單的那一顆:全新事件,isComposing / keyCode 都被洗掉)。 */
function controlBlindComposition() {
  Object.defineProperty(KeyboardEvent.prototype, 'isComposing', { configurable: true, get() { return false } })
  Object.defineProperty(KeyboardEvent.prototype, 'keyCode', { configurable: true, get() { return 0 } })
}

/** i. 「+N」浮出清單上的 mousedown preventDefault 失效(= 2026-09-30 第二輪的形狀:卡片在另一個 portal,觸發欄位的判準看不到它)。 */
function controlRestoreOverflowFocusTheft() {
  const original = Event.prototype.preventDefault
  Event.prototype.preventDefault = function preventDefault() {
    if (this.type === 'mousedown' && this.target instanceof Element) {
      const card = this.target.closest('[data-radix-popper-content-wrapper]')
      if (card && !card.querySelector('[cmdk-root]')) return undefined
    }
    return original.call(this)
  }
}
/**
 * j. 移除「+N」浮出清單裡那一項後的焦點交接被吃掉(= PeoplePicker 修前:隱藏項自己呼叫 onChange,跳過接力 → 焦點隨那顆 × 掉到 body)。
 * 按下卡片裡的 × 之後 1 秒內,把焦點交給卡片以外的程式呼叫一律吃掉(接力有兩下:當下一次、React commit 後的 rAF 再一次,兩下都要吃掉;
 * 2026-09-30 第一版只擋「焦點還在 × 上」的那一下,rAF 那一下照樣把焦點救回來,對照組紅不起來)。
 */
function controlDropOverflowHandoff() {
  let pressedAt = -Infinity
  document.addEventListener('mousedown', (event) => {
    const t = event.target
    if (t instanceof Element && t.closest('[data-collection-remove]') && t.closest('[data-radix-popper-content-wrapper]')) pressedAt = performance.now()
  }, true)
  const original = HTMLElement.prototype.focus
  HTMLElement.prototype.focus = function focus(options) {
    if (performance.now() - pressedAt < 1000 && !this.closest('[data-radix-popper-content-wrapper]')) return undefined
    return original.call(this, options)
  }
}
/** k. 欄位內搜尋框的量尺不算數(= 修前:搜尋框寬是固定 60px 下限、Tag 的可見數不扣它的位 → Tag 排滿後打的字被裁掉)。 */
function controlDropTypedReserve() {
  const hide = () => {
    const style = document.createElement('style')
    style.textContent = '[data-inline-search-mirror] { display: none !important; }'
    document.head.appendChild(style)
  }
  if (document.head) hide()
  else document.addEventListener('DOMContentLoaded', hide, { once: true })
}

/**
 * l. 組字中的 Esc 被當成一般 Esc(= 2026-10-01 前:Popover / Dialog / Sheet 的 onEscapeKeyDown 沒有組字判斷,Radix 只看 `event.key`)。
 * 組字形狀的 Esc keydown 上 preventDefault 一律失效 —— 浮層那道「組字就 preventDefault、Radix 看到 defaultPrevented 就不關」等於不存在。
 */
function controlImeEscapeDismisses() {
  const original = Event.prototype.preventDefault
  Event.prototype.preventDefault = function preventDefault() {
    if (this.type === 'keydown' && this.key === 'Escape' && (this.isComposing || this.keyCode === 229)) return undefined
    return original.call(this)
  }
}
/** m. 欄位內搜尋框那一格的寬沒有上限(= 2026-09-30 第三輪:一格 grid 的隱含 auto 欄跟著量尺長,max-w-full 只管得到外框、管不到欄寬)。 */
function controlUnboundedInlineTrack() {
  const add = () => {
    const style = document.createElement('style')
    style.textContent = ':has(> [data-inline-search-mirror]) { grid-template-columns: auto !important; }'
    document.head.appendChild(style)
  }
  if (document.head) add()
  else document.addEventListener('DOMContentLoaded', add, { once: true })
}

const CONTROLS = [
  { id: 'focus-theft', title: '選項 mousedown 的 preventDefault 失效(cmdk 原生:焦點被搬到 [cmdk-list])', initScript: controlRestoreFocusTheft, tag: 'pick-focus', kinds: REQUIRED_KINDS },
  { id: 'strip-aad', title: '輸入框上的 aria-activedescendant 寫不上去(修法前欄位內輸入框恆為 null)', initScript: controlStripActiveDescendant, tag: 'aad', kinds: REQUIRED_KINDS },
  { id: 'hide-empty-input', title: '欄位裡沒有 Tag 時把搜尋框藏起來(修法前只掛在 Tag 清單尾巴)', beforeEmptyCheck: controlHideEmptyInlineInput, tag: 'empty-input', kinds: ['inline-multi'] },
  { id: 'drop-focus-visible', title: '還焦點時的 focusVisible: false 被吃掉(不支援的引擎 / 修法前)', initScript: controlDropFocusVisibleOption, tag: 'pick-ring', kinds: ['inline-single', 'popover-single'] },
  { id: 'strip-inline-controls', title: '欄位內搜尋框的 aria-controls 被拿掉(第一版只寫 aria-activedescendant)', initScript: controlStripInlineControls, tag: 'aad', kinds: ['inline-single', 'inline-multi'] },
  { id: 'chrome-focus-theft', title: '觸發欄位上的 mousedown preventDefault 失效(修法前 Tag × 在 mousedown 就拿走焦點)', initScript: controlRestoreChromeFocusTheft, tag: 'chrome-press', kinds: ['inline-multi', 'popover-multi'],
    needs: (inst) => (inst?.chrome ?? []).some((c) => c.what === 'tag-remove') },
  { id: 'drop-clear-handoff', title: '一鍵清空前的焦點交接被吃掉(修法前焦點掉到 body)', initScript: controlDropClearHandoff, tag: 'clear-focus', kinds: ['inline-single'],
    needs: (inst) => inst?.clear?.status === 'measured' },
  { id: 'blind-composition', title: '鍵盤事件看不出組字(修法前代發給清單的那一顆)', initScript: controlBlindComposition, tag: 'ime', kinds: REQUIRED_KINDS },
  { id: 'overflow-focus-theft', title: '「+N」浮出清單上的 mousedown preventDefault 失效(卡片在另一個 portal,觸發欄位的判準看不到)', initScript: controlRestoreOverflowFocusTheft, tag: 'chrome-press', kinds: ['inline-multi', 'popover-multi'],
    needs: (inst) => (inst?.chrome ?? []).some((c) => c.what === 'overflow-remove') },
  { id: 'drop-overflow-handoff', title: '移除「+N」浮出清單裡那一項後的焦點交接被吃掉(PeoplePicker 修前:隱藏項自己呼叫 onChange)', initScript: controlDropOverflowHandoff, tag: 'overflow-focus', kinds: ['popover-multi'],
    needs: (inst) => inst?.overflowClosed?.status === 'measured' },
  { id: 'drop-typed-reserve', title: '欄位內搜尋框的量尺不算數(修前:固定 60px 下限、Tag 的可見數不扣它的位)', initScript: controlDropTypedReserve, tag: 'typed-visible', kinds: ['inline-multi'],
    needs: (inst) => !!inst?.typedVisible },
  { id: 'ime-escape-dismiss', title: '組字中的 Esc 被當成一般 Esc(2026-10-01 前:浮層 / 對話框的 onEscapeKeyDown 沒有組字判斷)', initScript: controlImeEscapeDismisses, tag: 'ime', kinds: REQUIRED_KINDS },
  { id: 'unbounded-inline-track', title: '欄位內搜尋框那一格的寬沒有上限(2026-09-30 第三輪:隱含 auto 欄跟著量尺長)', initScript: controlUnboundedInlineTrack, tag: 'typed-visible', kinds: ['inline-multi'],
    needs: (inst) => !!inst?.longTyped },
]

// ═══════════════════════════════════════════════════════════════════════════
// 瀏覽器量測
// ═══════════════════════════════════════════════════════════════════════════
class ProbeError extends Error {}

const probe = (page, args) => page.evaluate(pageProbe, args)
/**
 * 觸發欄位上要按的點:先判能不能點(看得見、沒停用),再由 lib/launch-browser.mjs `ownSurfacePosition` 找「觸發欄位自己的表面」
 * (不在 Tag、頭像、+N、Tag ×、一鍵清空或任何 Radix 觸發點上;從箭頭那一側找起)。2026-10-01 前這裡自己寫一份「從右往左、避開按鈕」,
 * 沒有避開頭像與 +N —— 與兩支全掃閘的「點正中央」是同一種代理(M17 收成一份)。
 */
async function triggerPoint(page, k) {
  const usable = await probe(page, { op: 'triggerUsable', k })
  if (!usable.ok) return usable
  const handle = await page.$(`[data-gate-trigger="${k}"]`)
  if (!handle) return { ok: false, why: '觸發點不見了' }
  try {
    const at = await ownSurfacePosition(handle, { prefer: 'end' })
    return at.ok ? { ok: true, x: at.x, y: at.y } : { ok: false, why: at.why }
  } finally {
    await handle.dispose().catch(() => null)
  }
}
async function settle(page, what) {
  const r = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  if (!r.ok) throw new ProbeError(`${what}之後 ${r.framesWaited} 格內版面沒有連續靜止 ${SETTLE_FRAMES} 格(變動 ${r.lateChanges} 次)`)
}
async function focusStable(page, what) {
  const r = await waitForFocusStable(page, { frames: SETTLE_FRAMES })
  if (!r.ok) throw new ProbeError(`${what}之後焦點一直在跳(換了 ${r.changes} 次,最後在 ${r.active})`)
}
/** 等清單的 aria-busy 解除(遠端搜尋 / 選項載入中)—— 等元素本身的狀態,BUSY_CAP_MS 只是天花板;回傳是否解除。 */
async function waitIdle(page, k, what) {
  const idle = await page.waitForFunction(pageProbe, { op: 'idle', k }, { timeout: BUSY_CAP_MS, polling: 'raf' }).then(() => true, () => false)
  if (idle) await settle(page, `${what}(載入完成)`)
  return idle
}
async function readState(page, k, what) {
  const s = await probe(page, { op: 'state', k })
  if (s.gone) throw new ProbeError(`${what}時觸發欄位不見了(被重掛?)`)
  return s
}
const pickFields = (s) => ({ open: s.open, focusOnSearch: s.focusOnSearch, focusInTrigger: s.focusInTrigger, active: s.active, keyword: s.keyword, aad: s.aad, ring: s.ring, outline: s.outline })

/** 關掉這個觸發點的選單(Esc 兩次為限);回傳是否已關。 */
async function closeMenu(page, k) {
  for (let i = 0; i < 2; i++) {
    const s = await probe(page, { op: 'state', k })
    if (s.gone || !s.open) return true
    await page.keyboard.press('Escape')
    await settle(page, '按 Esc 關選單')
  }
  const s = await probe(page, { op: 'state', k })
  return s.gone || !s.open
}
/** 開新觸發點之前,頁面上不得還開著任何 cmdk 選單(story 可能以 defaultOpen / play 開著收尾)。 */
async function closeAnyMenu(page) {
  for (let i = 0; i < 3; i++) {
    const open = await page.evaluate(() => [...document.querySelectorAll('[data-radix-popper-content-wrapper], [role="dialog"]')].some((w) => w.querySelector('[cmdk-root]')))
    if (!open) return true
    await page.keyboard.press('Escape')
    await settle(page, '開始量之前按 Esc 收起選單')
  }
  return false
}
/** 清掉搜尋框裡的字(換下一個候選關鍵字前)。 */
async function clearSearch(page, k) {
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await settle(page, '清掉關鍵字')
  await waitIdle(page, k, '清掉關鍵字')
}

/**
 * 打候選關鍵字直到清單留下至少一個一般選項;回傳量測(或 null = 三個候選都沒留下選項)。
 * 焦點不在搜尋框時照打一次就回傳(由判定點名 [typing]),不再試。
 */
async function typeQuery(page, k, chars) {
  for (const [n, c] of chars.entries()) {
    if (n > 0) await clearSearch(page, k)
    await page.keyboard.type(c)
    // 非 ASCII 的字 Playwright 以 insertText 送出、沒有 keydown;真人用輸入法打同一個字會有 keydown(keyCode 229)。補一下真的按鍵
    // (刪掉再打一次,關鍵字不變),「打過字」在瀏覽器眼中才是鍵盤互動 —— 收起還焦點的 :focus-visible 啟發式看的正是這個
    //(2026-09-30 實測:只 insertText 時,修法前的 Select / AgentPanel 收起也不帶框,[pick-ring] 的對照組紅不起來)
    if (!/^[\x20-\x7e]$/.test(c)) {
      await page.keyboard.press('Backspace')
      await page.keyboard.type(c)
    }
    await settle(page, `打「${c}」`)
    await waitIdle(page, k, `打「${c}」`)
    const s = await readState(page, k, `打「${c}」後`)
    const typed = { query: c, value: s.keyword, focusOnSearch: s.focusOnSearch, active: s.active, aad: s.aad }
    if (!s.focusOnSearch || s.keyword !== c || s.normalOptions > 0) return typed
  }
  return null
}

/** 用滑鼠挑一個選項:按下的當下讀一次、放開之後等靜止與焦點穩定再讀一次。 */
async function mousePick(page, k, how, avoid, multi) {
  const target = await probe(page, { op: 'optionPoint', k, how, avoid })
  if (!target.ok) return null
  await page.mouse.move(target.x, target.y)
  await settle(page, `滑鼠移到「${target.option}」`)
  await page.mouse.down()
  // 焦點搬家是 mousedown 的預設動作,同步發生 —— 按下之後立刻讀就是「按下的當下」
  const press = await readState(page, k, `按下「${target.option}」`)
  await page.mouse.up()
  await settle(page, `點「${target.option}」`)
  await focusStable(page, `點「${target.option}」`)
  const after = await readState(page, k, `點完「${target.option}」`)
  const checkedAfter = multi ? await probe(page, { op: 'checked', k, value: target.value }) : null
  return {
    how, option: target.option, value: target.value, hit: target.hit,
    checkedBefore: target.checkedBefore, checkedAfter,
    press: { open: press.open, focusOnSearch: press.focusOnSearch, active: press.active },
    after: pickFields(after),
  }
}

/** 搜尋框握著焦點、選單開著時,用滑鼠按欄位上的 Tag ×(tag-remove)或浮層的全選鈕(select-all);沒有可按的 → null。 */
async function chromePress(page, k, what) {
  const target = await probe(page, { op: 'chromePoint', k, what })
  if (!target.ok) return null
  const before = await readState(page, k, `按${what}之前`)
  await page.mouse.move(target.x, target.y)
  await settle(page, `滑鼠移到「${target.label}」`)
  await page.mouse.down()
  const press = await readState(page, k, `按下「${target.label}」`)
  await page.mouse.up()
  await settle(page, `點「${target.label}」`)
  await waitIdle(page, k, `點「${target.label}」`)
  await focusStable(page, `點「${target.label}」`)
  const after = await readState(page, k, `點完「${target.label}」`)
  return {
    what, label: target.label,
    press: { focusOnSearch: press.focusOnSearch, active: press.active },
    before: { keyword: before.keyword },
    after: { open: after.open, focusOnSearch: after.focusOnSearch, active: after.active, keyword: after.keyword },
  }
}

/** 「+N」浮出清單:游標移到 +N 上,等卡片裡的 × 真的出現(等元素本身,OVERFLOW_CARD_CAP_MS 只是天花板);沒有 +N → null。 */
async function openOverflowCard(page, k) {
  const plus = await probe(page, { op: 'overflowPoint', k })
  if (!plus.ok) return null
  await page.mouse.move(plus.x, plus.y)
  const ready = await page.waitForFunction(pageProbe, { op: 'overflowCardX', k }, { timeout: OVERFLOW_CARD_CAP_MS, polling: 'raf' }).then(() => true, () => false)
  if (!ready) throw new ProbeError(`游標停在「${plus.text}」上 ${OVERFLOW_CARD_CAP_MS / 1000} 秒,浮出清單裡的 × 沒有出現`)
  await settle(page, '浮出清單出現')
  const x = await probe(page, { op: 'overflowCardX', k })
  if (!x) throw new ProbeError('浮出清單出現後又不見了(版面靜止前卡片關掉)')
  return x
}

/**
 * 多選、選單開著、搜尋框握著焦點:把欄位填到出現 +N(需要時按全選),打一個字(欄位內搜尋另量搜尋框看不看得全),
 * 再用滑鼠按浮出清單裡的 ×,按下的當下與放開之後各讀一次,接著再打一個字。欄位夠寬、填滿也沒有 +N → null(不算量到)。
 */
async function measureOverflowOpen(page, k, inst, char) {
  let st = await readState(page, k, '準備量 +N')
  if (st.keyword) await clearSearch(page, k)
  if (!(await probe(page, { op: 'overflowPoint', k })).ok) {
    const all = await probe(page, { op: 'chromePoint', k, what: 'select-all' })
    if (!all.ok || /取消/.test(all.label)) return null
    await page.mouse.click(all.x, all.y)
    await settle(page, '按全選填滿欄位')
    await waitIdle(page, k, '按全選填滿欄位')
    const sp = await probe(page, { op: 'searchPoint', k })
    if (!sp.ok) throw new ProbeError('按全選之後找不到點得到的搜尋框')
    await page.mouse.click(sp.x, sp.y)
    await settle(page, '點回搜尋框')
    await focusStable(page, '點回搜尋框')
  }
  if (!(await probe(page, { op: 'overflowPoint', k })).ok) return null
  st = await readState(page, k, '量 +N 之前')
  if (!st.open || !st.focusOnSearch) throw new ProbeError(`量 +N 之前選單${st.open ? '開著' : '沒開'}、焦點在 ${st.active}(應在搜尋框)`)
  // 打一個有長度的字(選項標籤的前 6 個字母 / 數字,清單仍留下它):Tag 排滿後剩下的空間通常只夠一兩個字,
  // 只打一個字量不出「搜尋框有沒有替打的字讓位」(2026-09-30 對照組 k 用一個字時紅不起來 —— 剩下的 27px 剛好放得下一個字)
  const { label } = await probe(page, { op: 'queryChars', k })
  const word = [...(label || '')].filter((c) => /[\p{L}\p{N}]/u.test(c)).slice(0, 6).join('') || char
  await page.keyboard.type(word)
  await settle(page, `打「${word}」`)
  await waitIdle(page, k, `打「${word}」`)
  if (inst.kind === 'inline-multi') inst.typedVisible = await probe(page, { op: 'inlineVisible', k })
  // 按卡片本身(不是 ×):浮出清單是隱藏的那幾個 Tag,與欄位上的 Tag 是同一個控件的零件 —— 按下去焦點與關鍵字不動、選單不關,接著打的字進得去
  if (await openOverflowCard(page, k)) {
    const body = await probe(page, { op: 'overflowCardBody', k })
    if (!body) throw new ProbeError('浮出清單出現了,卻找不到卡片本身(不是 × / Tag / 頭像)可以按的點')
    const cardBefore = await readState(page, k, '按浮出清單卡片本身之前')
    await page.mouse.move(body.x, body.y)
    await settle(page, '滑鼠移到浮出清單卡片本身')
    await page.mouse.down()
    const cardPress = await readState(page, k, '按下浮出清單卡片本身')
    await page.mouse.up()
    await settle(page, '點浮出清單卡片本身')
    await waitIdle(page, k, '點浮出清單卡片本身')
    await focusStable(page, '點浮出清單卡片本身')
    const cardAfter = await readState(page, k, '點完浮出清單卡片本身')
    let cardTyped = null
    if (cardAfter.open && cardAfter.focusOnSearch) {
      await page.keyboard.type(char)
      await settle(page, `點完卡片本身再打「${char}」`)
      await waitIdle(page, k, `點完卡片本身再打「${char}」`)
      const t = await readState(page, k, `點完卡片本身再打「${char}」後`)
      cardTyped = { char, expected: `${cardAfter.keyword ?? ''}${char}`, value: t.keyword, focusOnSearch: t.focusOnSearch, active: t.active }
      // 打回原本的字:後面按 × 那一段照舊從同一個關鍵字開始
      await page.keyboard.press('Backspace')
      await settle(page, '刪掉剛打的字')
      await waitIdle(page, k, '刪掉剛打的字')
    }
    inst.chrome.push({
      what: 'overflow-card-body', label: body.label,
      press: { focusOnSearch: cardPress.focusOnSearch, active: cardPress.active },
      before: { keyword: cardBefore.keyword },
      after: { open: cardAfter.open, focusOnSearch: cardAfter.focusOnSearch, active: cardAfter.active, keyword: cardAfter.keyword },
      typed: cardTyped,
    })
    if (!cardAfter.open || !cardAfter.focusOnSearch) {
      // 已紅在 [chrome-press](2026-10-01 前的形狀:click 經 React 樹冒泡到觸發欄位的開關,選單被關掉)。把狀態救回來,後面的 × 照樣量 ——
      // 不然「× 一次都沒量到」會把這一筆產品紅蓋成儀器失效
      await page.mouse.move(2, 2)
      await settle(page, '游標離開浮出清單')
      if (cardAfter.open) {
        const sp = await probe(page, { op: 'searchPoint', k })
        if (!sp.ok) throw new ProbeError('按卡片本身後焦點離開搜尋框,又找不到點得到的搜尋框')
        await page.mouse.click(sp.x, sp.y)
        await settle(page, '點回搜尋框')
        await focusStable(page, '點回搜尋框')
        if ((await readState(page, k, '點回搜尋框後')).keyword) await clearSearch(page, k)
      } else {
        const point = await triggerPoint(page, k)
        if (!point.ok) throw new ProbeError(`按卡片本身後選單關了,觸發欄位又點不到(${point.why})`)
        await page.mouse.click(point.x, point.y)
        await settle(page, '按卡片本身後重新點開')
        await waitIdle(page, k, '按卡片本身後重新點開')
        await focusStable(page, '按卡片本身後重新點開')
        if ((await readState(page, k, '按卡片本身後重新點開')).keyword) await clearSearch(page, k)
      }
      await page.keyboard.type(word)
      await settle(page, `打回「${word}」`)
      await waitIdle(page, k, `打回「${word}」`)
      const again = await readState(page, k, `打回「${word}」後`)
      if (!again.open || !again.focusOnSearch || again.keyword !== word) throw new ProbeError(`按卡片本身後救回狀態沒成功(選單${again.open ? '開著' : '關了'}、焦點在 ${again.active}、關鍵字「${again.keyword}」)`)
    }
  }
  const x = await openOverflowCard(page, k)
  if (!x) return null
  const before = await readState(page, k, '按浮出清單裡的 × 之前')
  await page.mouse.move(x.x, x.y)
  await settle(page, `滑鼠移到「${x.label}」`)
  await page.mouse.down()
  const press = await readState(page, k, `按下「${x.label}」`)
  await page.mouse.up()
  await settle(page, `點「${x.label}」`)
  await waitIdle(page, k, `點「${x.label}」`)
  await focusStable(page, `點「${x.label}」`)
  const after = await readState(page, k, `點完「${x.label}」`)
  let typed = null
  if (after.open && after.focusOnSearch) {
    await page.keyboard.type(char)
    await settle(page, `點完「${x.label}」再打「${char}」`)
    await waitIdle(page, k, `點完「${x.label}」再打「${char}」`)
    const t = await readState(page, k, `點完「${x.label}」再打「${char}」後`)
    typed = { char, expected: `${after.keyword ?? ''}${char}`, value: t.keyword, focusOnSearch: t.focusOnSearch, active: t.active }
  }
  await page.mouse.move(2, 2)
  await settle(page, '游標離開浮出清單')
  return {
    what: 'overflow-remove', label: x.label,
    press: { focusOnSearch: press.focusOnSearch, active: press.active },
    before: { keyword: before.keyword },
    after: { open: after.open, focusOnSearch: after.focusOnSearch, active: after.active, keyword: after.keyword },
    typed,
  }
}

/** 選單關著:用滑鼠按「+N」浮出清單裡的 ×,移除後焦點落在哪(不得是 body)。沒有 +N → null。 */
async function measureOverflowClosed(page, k) {
  const x = await openOverflowCard(page, k)
  if (!x) return null
  await page.mouse.move(x.x, x.y)
  await settle(page, `滑鼠移到「${x.label}」`)
  await page.mouse.down()
  const press = await readState(page, k, `選單關著按下「${x.label}」`)
  await page.mouse.up()
  await settle(page, `選單關著點「${x.label}」`)
  await focusStable(page, `選單關著點「${x.label}」`)
  const after = await readState(page, k, `選單關著點完「${x.label}」`)
  await page.mouse.move(2, 2)
  await settle(page, '游標離開浮出清單')
  if (after.open) await closeMenu(page, k)
  return { status: 'measured', label: x.label, press: { active: press.active }, after: { active: after.active, focusInTrigger: after.focusInTrigger } }
}

/** 選單關著、欄位有值而且有一鍵清空鈕:點開、打一個字、用滑鼠按一鍵清空,量關鍵字 / 焦點 / 選單。沒有清空鈕 → null。 */
async function measureMouseClear(page, k, char) {
  if (!(await probe(page, { op: 'chromePoint', k, what: 'clear' })).ok) return null
  const point = await triggerPoint(page, k)
  if (!point.ok) return null
  await page.mouse.click(point.x, point.y)
  await settle(page, '重新點開')
  await waitIdle(page, k, '重新點開')
  await focusStable(page, '重新點開')
  const opened = await readState(page, k, '重新點開後')
  if (!opened.open || !opened.focusOnSearch) { await closeMenu(page, k); return { status: 'instrument', reason: `重新點開後選單${opened.open ? '開著' : '沒開'}、焦點在 ${opened.active}` } }
  await page.keyboard.type(char)
  await settle(page, `打「${char}」`)
  await waitIdle(page, k, `打「${char}」`)
  const before = await readState(page, k, `打「${char}」後`)
  const c = await probe(page, { op: 'chromePoint', k, what: 'clear' })
  if (!c.ok) { await closeMenu(page, k); return { status: 'instrument', reason: '打字後一鍵清空鈕點不到(被蓋住或不見了)' } }
  await page.mouse.move(c.x, c.y)
  await settle(page, `滑鼠移到「${c.label}」`)
  await page.mouse.click(c.x, c.y)
  await settle(page, `點「${c.label}」`)
  await waitIdle(page, k, `點「${c.label}」`)
  await focusStable(page, `點「${c.label}」`)
  const after = await readState(page, k, `點完「${c.label}」`)
  await closeMenu(page, k)
  return { status: 'measured', label: c.label, before: { keyword: before.keyword }, after: { open: after.open, focusOnSearch: after.focusOnSearch, active: after.active, keyword: after.keyword } }
}

/** 選單關著、欄位有值時:用鍵盤在一鍵清空鈕上按 Enter,量焦點落點。沒有清空鈕 → null;按了值沒變(固定值 story)→ not-exercisable。 */
async function measureClear(page, k) {
  const f = await probe(page, { op: 'focusClear', k })
  if (!f.ok) return null
  await focusStable(page, `聚焦「${f.label}」`)
  await page.keyboard.press('Enter')
  await settle(page, `在「${f.label}」上按 Enter`)
  await focusStable(page, `在「${f.label}」上按 Enter`)
  const gone = await probe(page, { op: 'clearGone', k })
  const after = await readState(page, k, `在「${f.label}」上按 Enter 後`)
  if (!gone) return { status: 'not-exercisable', label: f.label, reason: '按了清空,值沒變(story 的 value 固定)' }
  if (after.open) await closeMenu(page, k)
  return { status: 'measured', label: f.label, after: { focusInTrigger: after.focusInTrigger, active: after.active } }
}

/** 欄位內多選:把 Tag 全部按 × 移掉(value=[]),量搜尋框還在、點得到、打得進字、Enter 選得到且清空關鍵字。 */
async function measureEmpty(page, k, hooks) {
  for (let i = 0; i < 40; i++) {
    const p = await probe(page, { op: 'removePoint', k })
    if (!p.ok) {
      if (p.remaining > 0) return { status: 'instrument', reason: `還有 ${p.remaining} 個 Tag 的 × 點不到(看不見或被蓋住),造不出 value=[]` }
      break
    }
    await page.mouse.click(p.x, p.y)
    await settle(page, '按 Tag 的 ×')
    const left = await probe(page, { op: 'removePoint', k })
    // 按了 × Tag 數沒變 = story 的 value 固定(onChange 不接)—— 造不出 value=[],不是產品壞(由判定的「至少量到一次」把關)
    if (left.remaining >= p.remaining) { await closeMenu(page, k); return { status: 'not-exercisable', reason: `按 × 後 Tag 數沒變(${p.remaining} → ${left.remaining}),story 的 value 是固定的` } }
  }
  if (!(await closeMenu(page, k))) return { status: 'instrument', reason: '移完 Tag 後選單關不起來' }
  if (hooks?.beforeEmptyCheck) await page.evaluate(hooks.beforeEmptyCheck, k)
  await settle(page, '準備量空值')
  const input = await probe(page, { op: 'emptyInput', k })
  const out = { status: 'measured', input: { exists: input.exists, rendered: input.rendered, width: input.width, height: input.height, placeholder: input.placeholder } }
  if (!input.rendered) return out
  if (!input.hitOk) return { status: 'instrument', reason: `搜尋框看得見,但它正中央被 ${input.hit} 蓋住,點不到` }
  await page.mouse.click(input.x, input.y)
  await settle(page, '點空值欄位的搜尋框')
  await waitIdle(page, k, '點空值欄位的搜尋框')
  await focusStable(page, '點空值欄位的搜尋框')
  const clicked = await readState(page, k, '點空值欄位的搜尋框後')
  out.click = { open: clicked.open, focusOnSearch: clicked.focusOnSearch, active: clicked.active }
  const q = await probe(page, { op: 'queryChars', k })
  if (!q.chars.length) return { status: 'instrument', reason: '空值時清單裡沒有可以取關鍵字的一般選項' }
  const typed = await typeQuery(page, k, q.chars)
  if (!typed) return { status: 'instrument', reason: `空值時打「${q.chars.join(' / ')}」都沒有留下可挑選的選項` }
  out.typed = { query: typed.query, value: typed.value, aad: typed.aad }
  await page.keyboard.press('Enter')
  await settle(page, '空值時按 Enter')
  await focusStable(page, '空值時按 Enter')
  const entered = await readState(page, k, '空值時按 Enter 後')
  out.enter = { tags: entered.tags, keyword: entered.keyword, focusOnSearch: entered.focusOnSearch, active: entered.active }
  await closeMenu(page, k)
  return out
}

/** 一般 Esc 對照收起之後:重新點開、打回原本的關鍵字(後面的挑選接著用)。回傳 null = 成功;字串 = 儀器失效原因。 */
async function reopenWithQuery(page, k, query) {
  const point = await triggerPoint(page, k)
  if (!point.ok) return `一般 Esc 收起後觸發欄位點不到(${point.why})`
  await page.mouse.click(point.x, point.y)
  await settle(page, '一般 Esc 收起後重新點開')
  await waitIdle(page, k, '一般 Esc 收起後重新點開')
  await focusStable(page, '一般 Esc 收起後重新點開')
  const s = await readState(page, k, '一般 Esc 收起後重新點開')
  if (!s.open || !s.focusOnSearch) return `一般 Esc 收起後重新點開,選單${s.open ? '開著' : '沒開'}、焦點在 ${s.active}`
  if (s.keyword) await clearSearch(page, k)
  const typed = await typeQuery(page, k, [query])
  if (!typed || typed.value !== query || !typed.focusOnSearch) return `重新點開後打回「${query}」沒成功(值「${typed?.value ?? ''}」、焦點在 ${typed?.active ?? '?'})`
  return null
}

/**
 * 欄位內搜尋框打一串比整列還長的字(LONG_KEYWORD 接在原本的關鍵字後面),量框的右緣與捲動;量完全選刪掉、打回原本的關鍵字。
 * 回傳量測(判定見 longTypedProblem)或字串(儀器失效原因)。
 */
async function measureLongKeyword(page, k, query) {
  await page.keyboard.type(LONG_KEYWORD)
  await settle(page, '打比整列還長的字')
  await waitIdle(page, k, '打比整列還長的字')
  const v = await probe(page, { op: 'inlineVisible', k })
  if (!v) return '打比整列還長的字之後找不到欄位內搜尋框'
  await clearSearch(page, k)
  const typed = await typeQuery(page, k, [query])
  if (!typed || typed.value !== query || !typed.focusOnSearch) return `量完長字後打回「${query}」沒成功(值「${typed?.value ?? ''}」、焦點在 ${typed?.active ?? '?'})`
  return { length: v.length, width: v.width, scrollWidth: v.scrollWidth, clientWidth: v.clientWidth, scrollLeft: v.scrollLeft, rowWidth: v.rowWidth, overflowRight: v.overflowRight }
}

/**
 * 量一個觸發點。mode:'full' = 開啟後整段挑選流程;'discover' = 只判型(--selftest 找代表用)。
 * 回傳 { type: 'skip' | 'non-menu' | 'not-searchable' } 或一個實例(status:exercised / not-exercisable / discovered / instrument)。
 */
async function exerciseTrigger(page, story, k, label, { mode, hooks }) {
  if (!(await closeAnyMenu(page))) throw new ProbeError('開始量之前頁面上的選單關不起來')
  const labels = await probe(page, { op: 'enumerate' })
  if (k >= labels.length) return { type: 'skip', why: '觸發點數量變了' }
  const point = await triggerPoint(page, k)
  if (!point.ok) return { type: 'skip', why: point.why }
  await page.mouse.click(point.x, point.y)
  await settle(page, '點開觸發欄位')
  const first = await probe(page, { op: 'state', k })
  if (first.gone) {
    // 按下去觸發點自己不見了:開的若不是 cmdk 選單(例:AgentPanel 入口鈕打開整個面板、鈕隨之卸載)就不是這支閘的對象;
    // 有 cmdk 浮層開著卻找不到觸發點 = 觸發點被重掛,量不到(儀器失效,不猜)
    const anyMenu = await page.evaluate(() => [...document.querySelectorAll('[data-radix-popper-content-wrapper], [role="dialog"]')].some((w) => w.querySelector('[cmdk-root]')))
    if (anyMenu) throw new ProbeError('點開後觸發欄位不見了、cmdk 浮層卻開著(觸發點被重掛?)')
    await page.keyboard.press('Escape')
    await settle(page, '收起非選單的開啟結果')
    return { type: 'non-menu' }
  }
  let s = first
  if (!s.open) {
    // 開的不是 cmdk 選單(或什麼都沒開):收掉可能開著的其他浮層,免得蓋住下一個觸發點
    await page.keyboard.press('Escape')
    await settle(page, '收起非選單浮層')
    return { type: 'non-menu' }
  }
  if (s.busy) { await waitIdle(page, k, '點開'); s = await readState(page, k, '點開並等載入後') }
  if (!s.position) { await closeMenu(page, k); return { type: 'not-searchable' } }
  const inst = { story: story.id, trigger: k, label: label || labels[k] || '', kind: `${s.position}-${s.multi === null ? 'unknown' : s.multi ? 'multi' : 'single'}`, status: 'exercised', steps: {} }
  const notExercisable = async (reason) => { await closeMenu(page, k); return { ...inst, status: 'not-exercisable', reason } }
  if (s.busy) return notExercisable(`選項一直在載入(${BUSY_CAP_MS / 1000} 秒內 aria-busy 沒有解除)`)
  if (s.normalOptions === 0) return notExercisable('清單裡沒有可挑選的一般選項')
  if (mode === 'discover') { await closeMenu(page, k); return { ...inst, status: 'discovered', normalOptions: s.normalOptions } }

  // 1. 開啟:焦點在搜尋框、aria-activedescendant 指向反白列
  await focusStable(page, '點開')
  s = await readState(page, k, '點開後')
  inst.steps.open = { focusOnSearch: s.focusOnSearch, active: s.active, aad: s.aad }
  if (!s.focusOnSearch) { await closeMenu(page, k); return inst }
  // 2. 打字
  const q = await probe(page, { op: 'queryChars', k })
  if (!q.chars.length) return { ...inst, status: 'instrument', reason: `第 2 個一般選項「${q.label}」取不到可當關鍵字的字` }
  const typed = await typeQuery(page, k, q.chars)
  if (!typed) { await closeMenu(page, k); return { ...inst, status: 'instrument', reason: `打「${q.chars.join(' / ')}」都沒有留下可挑選的選項,量不到挑選` } }
  inst.steps.typed = typed
  if (!typed.focusOnSearch || typed.value !== typed.query) { await closeMenu(page, k); return inst }
  // 2b. 組字中按 Enter:不選、不關、關鍵字不動(反白此刻在第一個符合項上)
  {
    const b = await readState(page, k, '組字 Enter 之前')
    const sent = await probe(page, { op: 'imeEnter', k })
    if (!sent.ok) return { ...inst, status: 'instrument', reason: '組字 Enter 派不出去(焦點不在任何元素上)' }
    await settle(page, '組字中按 Enter')
    const a = await readState(page, k, '組字中按 Enter 後')
    inst.steps.ime = { before: { open: b.open, checked: b.checked, tags: b.tags, keyword: b.keyword }, after: { open: a.open, checked: a.checked, tags: a.tags, keyword: a.keyword } }
    if (!a.open) { await closeMenu(page, k); return inst }
  }
  // 2c. 組字中按 Esc(isComposing / keyCode 229 兩型):不關、關鍵字不動。再派一次不帶組字旗標的同一顆(對照:同一條派發路徑的一般 Esc 必須關得掉,
  //     「組字 Esc 沒關」才算數),之後重新點開、打回原本的關鍵字,後面的挑選照舊量。
  //     任何一顆把選單關了(產品紅,由判定點名)也照樣重新點開接著量 —— 一條紅不得把後面的量測一起吞掉、變成「沒量到」
  {
    const shapes = []
    for (const shape of ['composing', 'keyCode229']) {
      const b = await readState(page, k, `組字 Esc(${shape})之前`)
      const sent = await probe(page, { op: 'imeEscape', k, shape })
      if (!sent.ok) return { ...inst, status: 'instrument', reason: '組字 Esc 派不出去(焦點不在任何元素上)' }
      await settle(page, `組字中按 Esc(${shape})`)
      const a = await readState(page, k, `組字中按 Esc(${shape})後`)
      shapes.push({ shape, before: { open: b.open, keyword: b.keyword }, after: { open: a.open, keyword: a.keyword } })
      if (!a.open || a.keyword !== b.keyword) {
        if (a.open) await closeMenu(page, k)
        const back = await reopenWithQuery(page, k, typed.query)
        if (back) return { ...inst, status: 'instrument', steps: { ...inst.steps, imeEsc: { shapes } }, reason: `組字 Esc(${shape})關了選單之後${back}` }
      }
    }
    inst.steps.imeEsc = { shapes }
    const sent = await probe(page, { op: 'imeEscape', k, shape: 'plain' })
    if (!sent.ok) return { ...inst, status: 'instrument', reason: '一般 Esc(對照)派不出去(焦點不在任何元素上)' }
    await settle(page, '一般 Esc(對照)')
    const p = await readState(page, k, '一般 Esc(對照)後')
    inst.steps.imeEsc.plain = { open: p.open }
    if (p.open && !(await closeMenu(page, k))) return { ...inst, status: 'instrument', reason: '一般 Esc(對照)沒關掉選單,真的 Esc 也關不掉 —— 量不下去' }
    const back = await reopenWithQuery(page, k, typed.query)
    if (back) return { ...inst, status: 'instrument', reason: back }
  }
  // 2d. 欄位內搜尋:打一串比整列還長的字 —— 搜尋框停在整列寬、在框裡捲動(插入點看得見);量完打回原本的關鍵字
  if (inst.kind.startsWith('inline-')) {
    const long = await measureLongKeyword(page, k, typed.query)
    if (typeof long === 'string') return { ...inst, status: 'instrument', reason: long }
    inst.longTyped = long
  }
  // 3. 滑鼠挑選:單選一次(點選項文字);多選兩次(選項文字、另一列的勾選框)
  const multi = inst.kind.endsWith('-multi')
  inst.steps.picks = []
  for (const how of multi ? ['label', 'checkbox'] : ['label']) {
    const pick = await mousePick(page, k, how, inst.steps.picks.map((p) => p.value), multi)
    if (!pick) {
      if (how === 'label') { await closeMenu(page, k); return { ...inst, status: 'instrument', reason: '清單裡找不到點得到的選項(elementFromPoint 沒落在任何一列上)' } }
      break // 第二次(勾選框)找不到另一列可點 —— 只剩一列時合理,第一次已量到
    }
    inst.steps.picks.push(pick)
    if (!pick.after.open) break
  }
  // 4. 多選:點完接著打字
  const last = inst.steps.picks.at(-1)
  if (multi && inst.steps.picks.every((p) => p.after.open)) {
    const before = last.after.keyword ?? ''
    const ch = (before && await probe(page, { op: 'nextChar', k, keyword: before })) || typed.query
    await page.keyboard.type(ch)
    await settle(page, `點完再打「${ch}」`)
    await waitIdle(page, k, `點完再打「${ch}」`)
    await focusStable(page, `點完再打「${ch}」`)
    const t = await readState(page, k, `點完再打「${ch}」後`)
    inst.steps.afterType = { char: ch, expected: `${before}${ch}`, value: t.keyword, focusOnSearch: t.focusOnSearch, active: t.active, aad: t.aad }
    // 4b. 多選、搜尋框握著焦點:按欄位上的 Tag ×;欄位內搜尋再清掉關鍵字按浮層的全選鈕(全選只在關鍵字空時出現)
    inst.chrome = []
    if (t.focusOnSearch && t.open) {
      const tag = await chromePress(page, k, 'tag-remove')
      if (tag) inst.chrome.push(tag)
      if (inst.kind === 'inline-multi' && (!tag || (tag.after.open && tag.after.focusOnSearch))) {
        await clearSearch(page, k)
        const all = await chromePress(page, k, 'select-all')
        if (all) inst.chrome.push(all)
      }
      // 4c. 「+N」浮出清單裡的 ×(搜尋框握著焦點、選單開著):填到出現 +N、打一個字、按卡片裡的 ×(欄位內搜尋另量打的字看不看得全)
      const st = await readState(page, k, '量 +N 之前')
      if (st.open && st.focusOnSearch) {
        const overflow = await measureOverflowOpen(page, k, inst, typed.query)
        if (overflow) inst.chrome.push(overflow)
      }
    }
  }
  if (!(await closeMenu(page, k))) return { ...inst, status: 'instrument', reason: '量完之後選單關不起來' }
  if (multi) {
    // 4d. 選單關著按「+N」浮出清單裡的 ×:焦點不掉到 body
    const closed = await measureOverflowClosed(page, k)
    if (closed) inst.overflowClosed = closed
    // 4e. 打了關鍵字後用滑鼠按一鍵清空:值與關鍵字一起清、焦點留在搜尋框(會把值清空,所以排在鍵盤清空之前、多選才量)
    const mouseClear = await measureMouseClear(page, k, typed.query)
    if (mouseClear?.status === 'instrument') return { ...inst, status: 'instrument', reason: `滑鼠一鍵清空沒量到:${mouseClear.reason}` }
    if (mouseClear) inst.mouseClear = mouseClear
  }
  // 4f. 選單關著、欄位有值:鍵盤按一鍵清空(有清空鈕的欄位才量;多選已被上一步清空的不再量)
  const clear = await measureClear(page, k)
  if (clear) inst.clear = clear
  // 5. 欄位內多選:value=[] 那條
  if (inst.kind === 'inline-multi') inst.empty = await measureEmpty(page, k, hooks)
  return inst
}

/** 開一則 story、逐一量它的觸發點(only = 只量這一個編號)。skips(選填)= 每一個被略過的觸發點記一筆(哪一則 story、第幾個、標籤、原因),報告逐筆印出。 */
async function measureStory(page, origin, notFound, story, { mode, hooks, only = null, tally, skips = null }) {
  await openStory(page, `${origin}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, { settleFrames: SETTLE_FRAMES, notFound })
  const labels = await probe(page, { op: 'enumerate' })
  const out = []
  for (let k = 0; k < labels.length; k++) {
    if (only !== null && k !== only) continue
    try {
      const r = await exerciseTrigger(page, story, k, labels[k], { mode, hooks })
      if (r.type) {
        tally[r.type === 'skip' ? `skip:${r.why}` : r.type] = (tally[r.type === 'skip' ? `skip:${r.why}` : r.type] ?? 0) + 1
        if (r.type === 'skip') skips?.push({ story: story.id, trigger: k, label: labels[k] ?? '', why: r.why })
      } else out.push(r)
    } catch (error) {
      if (!(error instanceof ProbeError)) throw error
      out.push({ story: story.id, trigger: k, label: labels[k], kind: 'unknown', status: 'instrument', reason: error.message })
    }
  }
  return out
}

async function withServer(run) {
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  try {
    return await run(server)
  } finally {
    // 多個瀏覽器時 keep-alive socket 可能收不乾(select-all-footer-invariant.mjs 2026-09-18 錨)—— 給上限,結論不受影響
    await Promise.race([server.stop(), new Promise((resolve) => setTimeout(resolve, 3000).unref?.())]).catch(() => null)
    if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', '))
  }
}

/** 車道平行掃候選 story(每條車道一個瀏覽器,各自認領下一則);until(已量到的實例)為真就不再認領新的 story。 */
async function sweep(server, stories, { mode, until = null }) {
  const instances = []
  const tally = {}
  const skips = []
  let cursor = 0
  let instrumentCount = 0
  const lane = async () => {
    const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
    if (!browser) return
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      for (;;) {
        if (instrumentCount >= MAX_INSTRUMENT_FAILURES || until?.(instances)) break
        const story = stories[cursor++]
        if (!story) break
        try {
          const found = await measureStory(page, server.origin, server.notFound, story, { mode, tally, skips })
          instrumentCount += found.filter((i) => i.status === 'instrument').length
          instances.push(...found)
        } catch (error) {
          if (!(error instanceof StoryRenderInstrumentError)) throw error
          instrumentCount += 1
          instances.push({ story: story.id, trigger: -1, label: '(story 本身)', kind: 'unknown', status: 'instrument', reason: `story 開不起來(${error.kind}):${error.message.split('\n')[0]}` })
        }
      }
    } finally {
      await browser.close().catch(() => null)
    }
  }
  await Promise.all(Array.from({ length: Math.min(LANES, Math.max(1, stories.length)) }, lane))
  const order = new Map(stories.map((s, i) => [s.id, i]))
  instances.sort((a, b) => (order.get(a.story) - order.get(b.story)) || (a.trigger - b.trigger))
  skips.sort((a, b) => (order.get(a.story) - order.get(b.story)) || (a.trigger - b.trigger))
  return { instances, tally, skips, stoppedEarly: instrumentCount >= MAX_INSTRUMENT_FAILURES }
}

/** 只量代表(每型一個):一個瀏覽器、依序開;control 的 initScript 在導覽前掛上。 */
async function measureReps(server, reps, control) {
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  if (!browser) return null
  const instances = []
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    if (control?.initScript) await page.addInitScript(control.initScript)
    for (const rep of reps) {
      try {
        const found = await measureStory(page, server.origin, server.notFound, { id: rep.story }, { mode: 'full', hooks: control, only: rep.trigger, tally: {} })
        if (!found.length) instances.push({ ...rep, status: 'instrument', reason: '代表的觸發點這一次沒量到(被略過或不是選單)' })
        instances.push(...found)
      } catch (error) {
        if (!(error instanceof StoryRenderInstrumentError)) throw error
        instances.push({ ...rep, status: 'instrument', reason: `story 開不起來(${error.kind})` })
      }
    }
  } finally {
    await browser.close().catch(() => null)
  }
  return instances
}

function printReport(instances, tally, candidates, family, storyDir = {}, requireDirs = [], skips = []) {
  const exercised = instances.filter((i) => i.status === 'exercised')
  const chrome = (what) => exercised.flatMap((i) => (i.chrome ?? []).filter((c) => c.what === what)).length
  console.log(`  家族(從原始碼推導):${family.join(' / ')};候選 story ${candidates} 則`)
  console.log(`  量到的可搜尋選單 ${exercised.length} 個:${REQUIRED_KINDS.map((k) => `${KIND_LABEL[k]} ${exercised.filter((i) => i.kind === k).length}`).join(',')};` +
    `欄位內多選 value=[] 量到 ${exercised.filter((i) => i.empty?.status === 'measured').length} 次`)
  console.log(`  Command 直接使用者:${requireDirs.map((d) => `${d} ${exercised.filter((i) => storyDir[i.story] === d).length}`).join(',') || '(無)'};` +
    `按 Tag × ${chrome('tag-remove')} 次、全選 ${chrome('select-all')} 次、「+N」浮出清單裡的 ×(選單開著 ${chrome('overflow-remove')} 次 / 關著 ${exercised.filter((i) => i.overflowClosed?.status === 'measured').length} 次)、卡片本身 ${chrome('overflow-card-body')} 次;` +
    `Tag 排滿後打字 ${exercised.filter((i) => i.typedVisible).length} 次、打比整列長的字 ${exercised.filter((i) => i.longTyped).length} 次;一鍵清空(鍵盤 ${exercised.filter((i) => i.clear?.status === 'measured').length} 次 / 打了字後滑鼠 ${exercised.filter((i) => i.mouseClear?.status === 'measured').length} 次);` +
    `組字 Enter ${exercised.filter((i) => i.steps?.ime).length} 次、組字 Esc ${exercised.filter((i) => i.steps?.imeEsc?.plain).length} 次(各兩型 + 一般 Esc 對照);` +
    `單選指標收起 ${exercised.filter((i) => !i.kind.endsWith('-multi')).flatMap((i) => i.steps?.picks ?? []).length} 次`)
  const skipped = Object.entries(tally).map(([why, n]) => `${why.replace(/^skip:/, '略過/')} ${n}`).join(',')
  if (skipped) console.log(`  其餘觸發點:${skipped}(non-menu = 開的不是 cmdk 選單;not-searchable = 選單沒有搜尋框)`)
  for (const sk of skips) console.log(`  · 略過:${sk.story} 第 ${sk.trigger + 1} 個觸發點「${sk.label}」—— ${sk.why}`)
  for (const i of instances.filter((x) => x.status === 'not-exercisable')) console.log(`  · 量不到挑選(不計入):${where(i)} —— ${i.reason}`)
}

async function main() {
  const { family, requireDirs } = deriveGateFamily()
  requireFreshStorybookBuild(STATIC, [...family.map((d) => `${COMPONENTS_DIR}/${d}`), ...RULE_SOURCES])
  return withServer(async (server) => {
    const stories = candidateStories(readServedStorybookIndex(server), family)
    if (SELFTEST) return selftest(server, stories, family, requireDirs)
    const { instances, tally, skips, stoppedEarly } = await sweep(server, stories, { mode: 'full' })
    const storyDir = Object.fromEntries(stories.map((st) => [st.id, st.dir]))
    printReport(instances, tally, stories.length, family, storyDir, requireDirs, skips)
    const v = judge({ candidates: stories.length, instances, requireDirs, storyDir })
    if (stoppedEarly) v.instrument.push(`儀器失效已達 ${MAX_INSTRUMENT_FAILURES} 筆,停止掃描 —— 建置很可能整體壞了`)
    if (v.instrument.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:沒量到(儀器失效,不是產品裁決)——\n  ${v.instrument.join('\n  ')}`); if (v.failures.length) console.error(`  (同時有 ${v.failures.length} 條產品紅:\n  ${v.failures.join('\n  ')})`); return 1 }
    if (v.failures.length) { console.error(`❌ searchable-menu-focus FAIL(${v.failures.length} 條):\n  ${v.failures.join('\n  ')}`); return 1 }
    console.log(`✅ searchable-menu-focus PASS(四型可搜尋選單 + Command 直接使用者 ${requireDirs.join(' / ')}:滑鼠挑選焦點不離開搜尋框、點完打字進得去、aria-activedescendant 指向反白列且關聯得上、欄位內多選清空 / 浮層內保留關鍵字、單選收起回觸發點且指標挑選不畫鍵盤框、Tag × / +N 浮出清單裡的 × 與卡片本身 / 全選不搬焦點、關著按 +N × 焦點不掉 body、Tag 排滿後打的字看得全、比整列長的字停在整列寬並捲動、一鍵清空連關鍵字一起清、鍵盤清空焦點留在欄位、組字中的 Enter 不選、組字中的 Esc 不關、欄位內多選 value=[] 仍有搜尋框)`)
    return 0
  })
}

async function selftest(server, stories, family, requireDirs) {
  if (!judgeTableSelftest()) { console.error('❌ searchable-menu-focus selftest FAIL:判定表對照組沒過'); return 1 }
  // 找代表:同一份掃描(只判型),依家族順序(owner 先)掃到四型都有「≥ 2 個一般選項」的代表、而且每個 Command 直接使用者都有一個為止
  // —— 對照組只要證明會紅,不必每次全掃
  const dirOf = Object.fromEntries(stories.map((st) => [st.id, st.dir]))
  const usable = (i) => i.status === 'discovered' && i.normalOptions >= 2
  const repOf = (list, kind) => list.find((i) => usable(i) && i.kind === kind)
  const dirRepOf = (list, dir) => list.find((i) => usable(i) && dirOf[i.story] === dir)
  const { instances: found, tally } = await sweep(server, stories, {
    mode: 'discover',
    until: (list) => REQUIRED_KINDS.every((kind) => repOf(list, kind)) && requireDirs.every((dir) => dirRepOf(list, dir)),
  })
  const discoveredInstrument = found.filter((i) => i.status === 'instrument')
  if (discoveredInstrument.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:找代表時沒量到 ——\n  ${discoveredInstrument.map((i) => `${where(i)}:${i.reason}`).join('\n  ')}`); return 1 }
  const discovered = found.filter((i) => i.status === 'discovered')
  const kindReps = REQUIRED_KINDS.map((kind) => repOf(discovered, kind) ?? discovered.find((i) => i.kind === kind)).filter(Boolean)
  const missing = REQUIRED_KINDS.filter((kind) => !kindReps.some((r) => r.kind === kind))
  if (missing.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:候選 ${stories.length} 則裡找不到「${missing.map((k) => KIND_LABEL[k]).join('、')}」(其餘觸發點:${JSON.stringify(tally)})`); return 1 }
  const dirReps = requireDirs.map((dir) => dirRepOf(discovered, dir) ?? discovered.find((i) => dirOf[i.story] === dir))
  const missingDirs = requireDirs.filter((_, n) => !dirReps[n])
  if (missingDirs.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:Command 直接使用者「${missingDirs.join('、')}」找不到任何可搜尋浮層(其餘觸發點:${JSON.stringify(tally)})`); return 1 }
  const reps = [...kindReps, ...dirReps.filter((r) => !kindReps.includes(r))]
  console.log(`· 代表(候選 ${stories.length} 則依家族順序掃到四型與直接使用者齊全為止,${discovered.length} 個可搜尋選單):\n  ${reps.map((r) => `${where(r)}(${dirOf[r.story]})`).join('\n  ')}`)
  // 代表只有幾個:「至少一次挑選改變勾選」、直接使用者、Tag × / 全選 / 清空各自「至少量到一次」只在全掃的正式跑要求(那裡一定有可互動的 story);
  // 每一次只要求「這一次量的那幾個代表」的型都量到
  const repJudge = (instances, targets = reps) => {
    const kinds = [...new Set(targets.map((r) => r.kind))]
    return judge({ candidates: stories.length, instances, requireKinds: kinds, requireEmpty: kinds.includes('inline-multi'), requireLivePick: false, requireChrome: false, requireClear: false })
  }
  // 兩面之一:不動頁面必須全綠(對照組會紅是拆掉修法的功勞,不是這幾則本來就壞)
  const clean = await measureReps(server, reps, null)
  if (clean === null) return 0 // launchBrowserOrSkip 已印 SKIPPED-ENV / BROWSER-REQUIRED
  const vc = repJudge(clean)
  if (vc.instrument.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:代表不動頁面時沒量到 ——\n  ${vc.instrument.join('\n  ')}`); return 1 }
  if (vc.failures.length) { console.error(`❌ selftest FAIL:代表在沒動頁面時就紅了(先修產品,對照組才有意義)——\n  ${vc.failures.join('\n  ')}`); return 1 }
  console.log('✓ 不動頁面:代表全綠')
  // 對照組要拆的那一步,代表身上得量得到(例:清空只量得到可清空的欄位)。不夠的型,沿家族順序再找一個量得到的(同樣先驗不動頁面全綠)
  const cleanOf = new Map(clean.filter((i) => i.status === 'exercised').map((i) => [whereKey(i), i]))
  // 候補池:先用找代表那一趟已經判過型的(直接使用者排在家族最後,那一趟通常已掃過幾乎全部);不夠才整份再掃一次
  let pool = discovered.filter(usable)
  let fullSweep = false
  async function repFor(kind, needs) {
    const base = kindReps.find((r) => r.kind === kind)
    if (!needs || needs(cleanOf.get(whereKey(base)))) return base
    for (;;) {
      const found = await firstSatisfying(kind, needs)
      if (found !== undefined || fullSweep) return found
      fullSweep = true
      pool = (await sweep(server, stories, { mode: 'discover' })).instances.filter(usable)
    }
  }
  async function firstSatisfying(kind, needs) {
    for (const cand of pool.filter((i) => i.kind === kind)) {
      const key = whereKey(cand)
      if (!cleanOf.has(key)) {
        const got = await measureReps(server, [cand], null)
        if (got === null) return null
        const one = got.find((i) => i.status === 'exercised')
        if (!one) continue
        const v = repJudge(got, [cand])
        if (v.failures.length || v.instrument.length) { console.error(`❌ selftest FAIL:候補代表 ${where(cand)} 沒動頁面就紅了 ——\n  ${[...v.failures, ...v.instrument].join('\n  ')}`); return undefined }
        cleanOf.set(key, one)
      }
      if (needs(cleanOf.get(key))) return cand
    }
    return undefined
  }
  // 兩面之二:逐一拆掉修法,每一組都必須在指定的型(與落在該型的直接使用者)紅在指定的規則。
  // 先決定每一組量誰(候補代表要先驗不動頁面全綠,依序做),再讓各組平行量(每組自己一個瀏覽器,最多 LANES 組同時;結論依組序印)
  let ok = true
  const plans = []
  for (const control of CONTROLS) {
    const targets = []
    for (const kind of control.kinds) {
      const rep = await repFor(kind, control.needs)
      if (rep === null) return 0
      if (!rep) { ok = false; console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:對照組「${control.title}」在候選裡找不到量得到這一步的「${KIND_LABEL[kind]}」`); continue }
      targets.push(rep)
      if (!control.needs) targets.push(...dirReps.filter((r) => r.kind === kind && r !== rep))
    }
    if (targets.length) plans.push({ control, targets })
  }
  const measured = new Array(plans.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(LANES, plans.length) }, async () => {
    for (let n = next++; n < plans.length; n = next++) measured[n] = await measureReps(server, plans[n].targets, plans[n].control)
  }))
  if (measured.some((got) => got === null)) return 0
  for (const [n, { control, targets }] of plans.entries()) {
    const v = repJudge(measured[n], targets)
    if (v.instrument.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:對照組「${control.title}」沒量到(不得讀成「抓到了」)——\n  ${v.instrument.join('\n  ')}`); ok = false; continue }
    for (const rep of targets) {
      const hits = v.failures.filter((f) => f.startsWith(`[${control.tag}]`) && f.includes(whereKey(rep)))
      if (hits.length) console.log(`✓ 對照組「${control.title}」抓到 ${where(rep)}(${dirOf[rep.story]}):\n    ${hits.join('\n    ')}`)
      else { ok = false; console.error(`✗ 對照組「${control.title}」沒讓 ${where(rep)} 紅在 [${control.tag}] —— 這一型的綠燈是零證據(實得 ${JSON.stringify(v.failures)})`) }
    }
  }
  if (!ok) { console.error('❌ searchable-menu-focus selftest FAIL'); return 1 }
  console.log(`✅ searchable-menu-focus selftest PASS(判定表 + 四型代表與直接使用者 ${requireDirs.join(' / ')}:不動頁面全綠;${CONTROLS.length} 組拆掉修法各自紅在 ${[...new Set(CONTROLS.map((c) => `[${c.tag}]`))].join(' / ')})`)
  return 0
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    process.exit(await main())
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError || error instanceof ProbeError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}(儀器失效,不是產品裁決)`); process.exit(1) }
    throw error
  }
}
