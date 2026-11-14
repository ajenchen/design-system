#!/usr/bin/env node
/**
 * test-hover-revealed-affordances.mjs — hover-reveal 可見性 gating 的機械防線。
 *
 * @gate-contract
 *   保證: 滑過才出現的東西有三條靜態規則 —— (1) 登記在 REGISTRY 的每一處都有「初始隱藏 + 滑過揭示 + 鍵盤揭示」;
 *        (2) 全 DS 非 story 原始碼的鍵盤揭示不用 focus-within;(3) 全 DS 非 story 原始碼(.ts / .tsx / .css)沒有
 *        「不能滑過的裝置」的媒體條件 `(hover: none)`(含 `(any-hover: none)`、Tailwind 的 `[@media(hover:none)]:`、
 *        JS 的 matchMedia 字串,以及同一個條件的否定寫法 `not (hover: hover)` / `not all and (hover)`;大小寫不分、括號裡換行也算)
 *        —— 註解與 .spec.md 裡提到不算,只擋會生效的樣式 / class / 程式。
 *   紅: 任一條不成立 → 指名檔名:行號與命中的字並 exit 1。每次執行先跑對照組:(2) 拿一組已知該抓 / 不該抓的 class 字串餵同一個正規式,
 *        加一筆剝註解的對照;(3) 拿一組假原始碼字串餵真掃描用的同一支判定(該抓的要指名到行號與命中的字:2026-11-12 c78b35e1 加過的
 *        那一行原文、CSS、matchMedia、否定寫法、字串或行尾註解裡的「斜線 + 星號」之後;不該抓的要 0 個:各種註解裡提到、正向的 hover:hover),
 *        另把 c78b35e1 那一行塞進現在的 data-table.tsx 真檔(只在記憶體裡)必須在那一行抓到 4 個;答錯 = INSTRUMENT-FAIL(exit 2),不讀成通過。
 *   綠: 現況三條都成立。純靜態讀檔、沒有時間因素,重複跑逐字相同;掃到 0 個檔、對照組答錯、某個檔的註解 / 樣板字串沒有收尾
 *        (剝註解的結果不可靠)= INSTRUMENT-FAIL(exit 2)。
 *
 * Anchor(2026-08-05):撤回「touch 恆顯」實驗時,連同 `AvatarDismissOverlay` 的整條
 * `opacity-0 group-hover/…` gating class 一起刪除 → 桌機 PeoplePicker stack 的每個 avatar
 * 移除鈕變成無條件恆顯(user 抓「為何還是把所有 avatar 的 x 都秀出來」)。純視覺 regression,
 * tsc / lint / content-quality 全部照綠 —— 只有機械斷言擋得住。
 *
 * 契約:登記在此的 hover-reveal affordance,其 className 必須同時含
 *   (a) `opacity-0` 初始隱藏
 *   (b) 至少一個 `group-hover/<scope>:opacity-100` 揭示條件(滑過由 JS 狀態控制的,登記時給 `hoverReveal` 正規式,例 FileViewer 的 armVisible)
 *   (c) 至少一個 focus 類揭示條件(keyboard 可達 — a11y,不得只靠 hover)
 * 另加全 DS 一條(2026-10-21,r1b DT-06):滑過才出現的東西,鍵盤那一條一律用 `:focus-visible` 系
 *   (`group-has-[:focus-visible]/範圍:` / `has-[:focus-visible]:` / `focus-visible:`),**不用任何形式的 focus-within**
 *   —— 滑鼠點一下也會讓 focus-within 成立,東西會一直亮到焦點離開(SSOT 理由住 item-anatomy.tsx `SUFFIX_HOVER_REVEAL_BY_GROUP` 的 JSDoc)。
 *   掃 packages/design-system/src 非 story 原始碼裡所有「focus-within 系變體 + 揭示用的 utility」:
 *     變體 = `focus-within:` / `group-focus-within(/範圍)?:` / `peer-focus-within(/範圍)?:` / `[&:focus-within]:` 這類任意變體;
 *     utility = `opacity-100` / `visible` / `pointer-events-auto` / 開關型 CSS 變數 `[--x:1]`(Avatar 挖洞那種)。
 *   a6390356(修前)實測 8 行 10 個命中:DataTable 連結格鉛筆、Sidebar showOnHover 動作鈕(2026-10-21 r1b DT-06 第一輪修,2 個);
 *   AgentPanel 訊息工具列、Carousel 箭頭、FileViewer 左右切檔箭頭(第二輪,複驗缺陷 1;FileViewer 每行 opacity 與 pointer-events 各一 → 6 個);
 *   PeoplePicker 頭像 × 與 Avatar 挖洞(例外,見下,2 個)。
 *   **不收的**:用 display 揭示的(hidden → inline-flex,不佔位)—— 2026-10-21 實測把 DataTable 表頭 ⌄ 改成 has-[:focus-visible] 之後,
 *   Tab 從排序區移到 ⌄ 那一下群組裡一時沒有 :focus-visible → ⌄ 變 display:none → 焦點掉到 <body>;display 揭示只能用 focus-within
 *  (代價與待辦見 data-table.tsx 表頭 ⌄ 註解)。Field 家族的 `focus-within:!border-primary`(邊框轉色就是焦點指示器本身,滑鼠點進去也亮是設計)
 *   與 FieldControlGroup 的 `[&>*:focus-within]:z-[4]`(疊層順序)不是揭示,也不收。
 *   例外清單 FOCUS_WITHIN_REVEAL_EXCEPTIONS 只收寫得出理由、而且要 owner 決定的;**每一筆都必須真的命中**(不命中 = 例外過期,紅),
 *   成對的兩筆因此只能一起改。
 *   儀器對照(M32):每次執行先拿一組已知該抓 / 不該抓的 class 字串跑同一個正規式,答錯 = INSTRUMENT-FAIL(exit 2),不讀成通過。
 * 再加全 DS 一條(2026-11-14,A7 ⑥ 防再犯;要不要立這條 = 主線 2026-11-14 定「要做」,規則的寫法是【AI 推導】):
 *   DS 非 story 原始碼不得出現「不能滑過的裝置」的媒體條件。依據:user 2026-09-26 對「手機上滑過才出現的按鈕」已決「先維持」、
 *   不替觸控另外客製(題目、原話與處理住 governance/planning/2026-09-25-interaction-and-hover-remediation.md「09-26 user 逐題回覆」表的 L11 那一列)。
 *   這件事 AI 做過兩次、兩次都收回:2026-08-05 PeoplePicker 頭像 × 的「touch 恆顯」(上面的 Anchor)、2026-11-12 表頭 ⌄
 *   (c78b35e1 加四個 `[@media(hover:none)]:` class,2026-11-14 1859b728 收回)。
 *   擋什麼:`(hover: none)` / `(any-hover: none)`(CSS 的 @media、Tailwind 任意變體 `[@media(hover:none)]:`(空白寫成 `_` 也算)、
 *     JS 的 matchMedia 字串),以及同一個條件的否定寫法 `not (hover: hover)` / `not all and (hover: hover)` / `not-[@media(hover:hover)]:`,
 *     否定的對象寫成布林語境的 `(hover)` 也算(`not all and (hover)`、`[@media_not_all_and_(hover)]:`;`(hover)` = hover 不是 none)
 *     (否定寫法是【AI 延伸】:hover 這個媒體特徵只有 none / hover 兩個值,否定 = 同一個條件)。
 *     媒體特徵的名稱與值不分大小寫(`(HOVER: NONE)` 一樣擋);條件寫成好幾行(括號裡換行)也擋,行號報起點那一行。
 *     (這三種 2026-11-14 審查 A 實測原本放行,補進對照組。)
 *   不擋:註解裡提到(區塊註解、JSX 註解、`//` 行尾註解;data-table.tsx 現在那段說明「收回」的註解就是這一種)、.spec.md、*.stories.tsx、
 *     正向的 `(hover: hover)`(只給有滑過能力的裝置加東西,桌機本來的行為)、`(pointer: coarse)`(hooks/use-is-touch-device.ts 既有的觸控判斷,
 *     Select 觸控走原生選單那一題 user 也已決維持,不屬本條 —— 所以「用那支 hook 的結果替觸控加樣式」這條靜態檢查看不到,照實寫)。
 *   沒有例外清單:要替不能滑過的裝置加東西,先拿 09-26 那一則去問 user,不是在這裡加一筆。
 *   剝註解的做法(`blankComments`,兩條全 DS 掃描共用):逐字元走,先認行尾註解與字串(單引號 / 雙引號 / 反引號),
 *     字串裡、行尾註解裡的「斜線 + 星號」不當區塊註解的起頭 —— 用一條正規式先剝區塊註解的話,那個位置到下一個註解結尾之間的程式會整段被當成註解
 *     (靜默漏掃)。2026-11-14 實量:行尾註解裡的粗體字讓 data-table.tsx 13 行、date-picker.tsx 77 行程式沒被掃到;
 *     FileUpload 的 `p.endsWith('/*')` 是字串版的同一種,只是它後面剛好沒有註解結尾才沒出事。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// 每筆 = 一個 hover-reveal affordance:檔案 + 定位它的函式/註解錨點
const REGISTRY = [
  {
    label: 'PeoplePicker AvatarDismissOverlay(stack 移除鈕)',
    file: 'packages/design-system/src/components/PeoplePicker/person-display.tsx',
    anchor: 'function AvatarDismissOverlay',
    scope: 'avatar',
  },
  {
    label: 'FileItem hover action',
    file: 'packages/design-system/src/components/FileItem/file-item.tsx',
    anchor: 'hoverAction &&',
    scope: 'row',
  },
  {
    label: 'ItemInlineAction menu-item / tree-item / row 三 scope',
    file: 'packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx',
    anchor: 'opacity-0 group-hover/menu-item:opacity-100',
    scope: 'menu-item',
  },
  {
    // 2026-09-26 起側欄不再自抄一份 gating 字串,改消費 ItemSuffix 的 hoverReveal(待辦總帳〇節「按鍵規則合併」C-7 / L9;
    // sidebar.spec.md「Inline actions」出現時機列)。class 契約由上一筆 item-anatomy 驗;這一筆改驗「真的消費那一份、
    // 而且沒有又抄回一份」—— 抄回來就是兩個住所(M17),下次改出現方式會漏。
    // 錨點釘在 inline actions 那個 ItemSuffix 的 hoverReveal 那一行,不用第一個 `<ItemSuffix`:a103c40b 把群組動作「+」放進標題列的
    // 列尾槽之後,檔內第一個 `<ItemSuffix` 變成那一個(不滑過才出現),取錨點後 2500 字看不到 inline actions 的 hoverReveal → 假紅。
    label: 'Sidebar menu-item action(消費 ItemSuffix hoverReveal)',
    file: 'packages/design-system/src/components/Sidebar/sidebar.tsx',
    anchor: 'hoverReveal={actionsReveal === "hover"}',
    scope: 'menu-item',
    consumes: [/hoverReveal=\{[^}]+\}/, /hoverGroup="menu-item"/],
  },
  {
    label: 'Carousel arrow wrapper',
    file: 'packages/design-system/src/components/Carousel/carousel.tsx',
    anchor: 'const arrowWrapperClass',
    scope: 'carousel',
    // 到端點的箭頭:滑鼠按到底照舊收起,鍵盤按到底的留著讓焦點框看得見(keyboard-model-canonical.md「按了之後自己變停用」);
    // 收起條件必須排除 :focus-visible,而且 owner 規格要寫出同一個例外 —— 2026-10-01 程式改了、carousel.spec.md「邊界」
    // 仍寫「到邊界直接消失」,兩份說法不同(r1b OTH-08)。
    mustInclude: [{ re: /\[&:has\(button\[data-disabled-focusable\]:not\(:focus-visible\)\)\]:opacity-0/, why: '到端點的收起條件沒有排除鍵盤焦點 → 鍵盤按到底的箭頭連同焦點框一起消失' }],
    specMentions: { file: 'packages/design-system/src/components/Carousel/carousel.spec.md', heading: '- **邊界**', re: /可聚焦的停用/, why: 'carousel.spec.md「邊界」沒寫鍵盤按到端點的例外(規格說直接消失,程式卻留著)' },
  },
  // 2026-10-21(r1b DT-06 同族,複驗缺陷 1)補登記:這兩處的鍵盤那一條剛從 focus-within 改成 has-[:focus-visible],
  // 登記後「鍵盤路徑還在」有人量(只靠全 DS 那一條,鍵盤揭示整條被刪掉也會綠)
  {
    label: 'AgentPanel 訊息工具列(非最後一則,懸停才出現)',
    file: 'packages/design-system/src/components/AgentPanel/agent-panel.tsx',
    anchor: 'const AgentToolbar = React.forwardRef',
    scope: 'agent-message',
  },
  ...[['左', 'showArrows && activeIndex > 0 &&'], ['右', 'showArrows && activeIndex < files.length - 1 &&']].map(([side, anchor]) => ({
    // 滑過由 JS idle-timer 的 armVisible 控制(file-viewer.spec.md「Prev/Next 檔案切換」),不是 group-hover
    label: `FileViewer ${side}切檔箭頭`,
    file: 'packages/design-system/src/components/FileViewer/file-viewer.tsx',
    anchor,
    scope: 'viewport',
    hoverReveal: /armVisible \? 'opacity-100'/,
  })),
  {
    // 表格連結格的「編輯連結」:2026-10-13 鉛筆改成行內小按鈕(待辦總帳 Q3b);2026-10-21(r1b DT-06)起不再自抄 gating 字串;
    // 2026-10-28 user「Q4用乙'」起鉛筆 = Button text xs,由 LinkInput 在自己外殼裡的 ItemSuffix 畫(viewEditAction),
    // 出現時機由宿主給群組名(revealGroup)。class 契約由上面 item-anatomy 那一筆驗;這兩筆驗「真的消費 ItemSuffix hoverReveal、
    // 宿主真的給了 cell 群組、而且兩個檔都沒有又抄回一份」。
    label: 'LinkInput 檢視態編輯入口(消費 ItemSuffix hoverReveal,群組由宿主給)',
    file: 'packages/design-system/src/components/LinkInput/link-input.tsx',
    anchor: '[LINK_INPUT_EDIT_ENTRY_ATTR]: \'\'',
    scope: 'cell',
    consumes: [/hoverReveal=\{[^}]+\}/, /hoverGroup=\{[^}]+\}/],
  },
  {
    label: 'DataTable url cell 編輯連結(給 LinkInput revealGroup: cell)',
    file: 'packages/design-system/src/components/DataTable/cell-registry.tsx',
    anchor: 'viewEditAction={',
    scope: 'cell',
    consumes: [/revealGroup: 'cell'/],
  },
]

/**
 * 鍵盤揭示用 focus-within 的例外(每一筆都要寫得出為什麼、誰要決定)。目前 0 筆:
 * 原本成對的兩筆(PeoplePicker 頭像疊的移除 × `group-focus-within/avatar:opacity-100`、Avatar 自己的挖洞
 * `group-focus-within/avatar:[--avatar-dismiss-on:1]`,待辦總帳 R1b-DT2)已由 FL-dismiss-focus(b836d4b0)與 OV-dismiss-focus(8ce71fcf)
 * 一起改成 `:focus-visible` 系 —— 依據 user 10-14「我們這套ds本來目前就是以desktop web為主去設計」(逐字;tmp wip 帳本 MASTER-TODO 第 59 行。
 * 2026-11-14 前這裡用引號寫的是另一句、帳本裡查無那一句,已換成逐字),由這句推到「觸控那條理由拿掉」是 AI 的判斷;兩邊同時改,× 與洞的出現條件沒有分家。
 * 例外過期就紅的機制保留:以後要加例外,照上面寫理由、誰要決定、成對的那一筆。
 */
const FOCUS_WITHIN_REVEAL_EXCEPTIONS = new Map([])

/**
 * focus-within 系變體 + 揭示用的 utility(見檔頭)。前面不准接字母 / 連字號(`has-` 之類的別的變體不算);
 * 任意變體 `[&:focus-within]:` / `[&_x:focus-within]:` 一起收。
 */
const REVEAL_UTILITY = String.raw`(?:!?opacity-100|visible|pointer-events-auto|\[--[\w-]+:1\])(?![\w-])`
const FOCUS_WITHIN_REVEAL = new RegExp(
  String.raw`(?:(?<![\w-])(?:(?:group|peer)-)?focus-within(?:\/[\w-]+)?|\[[^\]\s]*:focus-within[^\]\s]*\]):` + REVEAL_UTILITY,
  'g',
)
/** 儀器對照組:a6390356 的原文形狀必須抓到;:focus-visible 系、display 揭示、邊框轉色、疊層順序必須不抓 */
function revealSelfCheck(re = FOCUS_WITHIN_REVEAL) {
  const must = [
    "'focus-within:opacity-100'", // Carousel(修前)
    "'focus-within:opacity-100 focus-within:pointer-events-auto'", // FileViewer(修前,兩個命中)
    "opacity-0 group-hover/agent-message:opacity-100 focus-within:opacity-100", // AgentPanel(修前)
    "group-focus-within/cell:opacity-100", // DataTable 連結格(第一輪修前)
    "group-focus-within/menu-item:visible",
    "group-focus-within/avatar:[--avatar-dismiss-on:1]", // Avatar 挖洞
    "peer-focus-within:opacity-100",
    "[&:focus-within]:opacity-100",
    "focus-within:!opacity-100",
  ]
  const mustNot = [
    "has-[:focus-visible]:opacity-100 has-[:focus-visible]:pointer-events-auto",
    "group-has-[:focus-visible]/cell:opacity-100",
    "focus-visible:opacity-100",
    "hidden group-hover:inline-flex group-focus-within:inline-flex", // DataTable 表頭 ⌄(display 揭示,刻意不收)
    "focus-within:!border-primary focus-within:hover:!border-primary", // Field 邊框轉色
    "[&>*:hover]:z-[3] [&>*:focus-within]:z-[4] [&>*[data-field-open]]:z-[4]", // FieldControlGroup 疊層(field-control-group.tsx 原文)
    "[&>*:focus-within:hover]:z-[4] [&>*[data-field-open]:hover]:z-[4]", // 同上:聚焦 / 開著又被滑過
    "focus-within:opacity-1000",
  ]
  const problems = []
  const count = (s) => [...s.matchAll(new RegExp(re.source, re.flags))].length
  for (const s of must) if (count(s) === 0) problems.push(`該抓沒抓到:${s}`)
  if (count("'focus-within:opacity-100 focus-within:pointer-events-auto'") !== 2) problems.push('FileViewer 修前那一行應命中 2 次')
  for (const s of mustNot) if (count(s) !== 0) problems.push(`不該抓卻抓到:${s}`)
  return problems
}

// ── 「不能滑過的裝置」的媒體條件(規則、依據、擋 / 不擋見檔頭「再加全 DS 一條」)────────────────────────────
/**
 * 把註解換成同樣位置的空白(行數、每一行的欄位都不變),回傳 `{ code, unterminated }`。純函式。
 * 逐字元走:字串(單引號 / 雙引號到同一行結束為止、反引號可跨行)裡的註解起頭不算;`lineComments: false`(.css)不認兩條斜線
 * (CSS 沒有這種註解,`url(http://…)` 會被切掉);兩條斜線前面緊接冒號(`https://`)也不認。
 * `unterminated` = 檔尾還停在區塊註解或反引號字串裡 —— 這個檔剝出來的結果不可靠,呼叫端要當儀器失效。
 * 走錯的方向一律偏向「多掃」:JSX 文字裡落單的引號會讓那一行剩下的註解被當成程式(可能多報,不會漏報)。
 */
function blankComments(source, { lineComments = true } = {}) {
  let code = ''
  let state = 'code' // code | single | double | template | line | block
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i]
    const next = source[i + 1]
    if (state === 'line') {
      if (c === '\n') { state = 'code'; code += c } else code += ' '
    } else if (state === 'block') {
      if (c === '*' && next === '/') { state = 'code'; code += '  '; i += 1 } else code += c === '\n' ? c : ' '
    } else if (state !== 'code') {
      code += c
      if (c === '\\' && next !== undefined) { code += next; i += 1 }
      else if ((state === 'single' && c === "'") || (state === 'double' && c === '"') || (state === 'template' && c === '`')) state = 'code'
      else if (c === '\n' && state !== 'template') state = 'code'
    } else if (c === '/' && next === '*') {
      state = 'block'; code += '  '; i += 1
    } else if (lineComments && c === '/' && next === '/' && source[i - 1] !== ':') {
      state = 'line'; code += '  '; i += 1
    } else {
      if (c === "'") state = 'single'
      else if (c === '"') state = 'double'
      else if (c === '`') state = 'template'
      code += c
    }
  }
  return { code, unterminated: state === 'block' || state === 'template' ? state : null }
}

/**
 * `(hover: none)` / `(any-hover: none)`,以及同一個條件的否定寫法。媒體特徵一定寫在括號裡,所以從左括號認;
 * Tailwind 任意變體把空白寫成 `_`,一起當空白。第二段(否定寫法)是【AI 延伸】,理由見檔頭:否定的對象可以寫成
 * `(hover: hover)`,也可以寫成布林語境的 `(hover)`(= hover 不是 none),兩種都認(2026-11-14 審查 A:`not all and (hover)` 漏掉)。
 * `i` 旗標:媒體特徵的名稱與值不分大小寫,`(HOVER: NONE)` 一樣生效(同一次審查抓到漏掉)。
 */
const NO_HOVER_MEDIA = new RegExp(
  String.raw`\([\s_]*(?:any-)?hover[\s_]*:[\s_]*none[\s_]*\)`
  + String.raw`|(?<![A-Za-z0-9-])not(?:[\s_]+(?:all[\s_]+and[\s_]*)?|-\[@media[\s_]*)\([\s_]*(?:any-)?hover(?:[\s_]*:[\s_]*hover)?[\s_]*\)`,
  'gi',
)

/**
 * 一份原始碼裡某條規則的命中(註解已剝掉)。純函式;全 DS 兩條掃描(focus-within 揭示、不能滑過的裝置)與它們的對照組共用這一支。
 * `acrossLines`:整份比對、行號取命中的起點(條件寫成好幾行 —— 括號裡換行 —— 也認得);顯示的字把換行與前後空白收成一個空白。
 * 預設逐行比對(focus-within 那一條的正規式本來就不跨空白,照舊)。
 * @returns {{ hits: { line: number, text: string }[], unterminated: string|null }}
 */
function codeHits(source, re, { lineComments = true, acrossLines = false } = {}) {
  const { code, unterminated } = blankComments(source, { lineComments })
  const hits = []
  if (acrossLines) {
    for (const m of code.matchAll(new RegExp(re.source, re.flags))) {
      hits.push({ line: code.slice(0, m.index).split('\n').length, text: m[0].includes('\n') ? m[0].replace(/\s*\n\s*/g, ' ') : m[0] })
    }
    return { hits, unterminated }
  }
  code.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(new RegExp(re.source, re.flags))) hits.push({ line: i + 1, text: m[0] })
  })
  return { hits, unterminated }
}
const noHoverMediaHits = (source, options) => codeHits(source, NO_HOVER_MEDIA, { ...options, acrossLines: true })

/** 2026-11-12 c78b35e1 加在 data-table.tsx `[data-col-menu]` 的那一行原文(2026-11-14 1859b728 收回)—— 對照組的主角 */
const C78B35E1_TOUCH_REVEAL_LINE = "          '[@media(hover:none)]:w-auto [@media(hover:none)]:ml-2 [@media(hover:none)]:overflow-visible [@media(hover:none)]:opacity-100',"
const DATA_TABLE_SOURCE = 'packages/design-system/src/components/DataTable/data-table.tsx'
/** data-table.tsx 裡 ⌄ 外層那一行的開頭(真檔對照把上面那一行塞在它後面) */
const COLUMN_MENU_ANCHOR = '<div data-col-menu className={cn('

/** 儀器對照組:假原始碼字串餵同一支 noHoverMediaHits —— 該抓的要指名到行號與命中的字,不該抓的要 0 個;再用真檔驗一次 */
function noHoverSelfCheck(readSource = (rel) => readFileSync(join(ROOT, rel), 'utf8')) {
  const problems = []
  const show = (hits) => (hits.length ? hits.map((h) => `第 ${h.line} 行「${h.text}」`).join('、') : '沒有命中')
  /** [說明, 假原始碼, 期望的命中(行號 + 命中的字,依序), 是不是 .css] */
  const must = [
    ['c78b35e1 加過的那一行(class 字串裡出現 → 擋,一行 4 個)',
      `        <div data-col-menu className={cn(\n          'shrink-0 inline-flex w-0 overflow-hidden opacity-0',\n${C78B35E1_TOUCH_REVEAL_LINE}\n        )}>`,
      [3, 3, 3, 3].map((line) => ({ line, text: '(hover:none)' }))],
    ['同一個檔裡註解提到 + class 真的寫了 → 只抓 class 那一行',
      "// 2026-11-12 加過 [@media(hover:none)]:opacity-100,已收回\nconst reveal = '[@media(hover:none)]:opacity-100'\n",
      [{ line: 2, text: '(hover:none)' }]],
    ['字串裡的 image/* 之後、下一個註解之前的 class(用正規式剝區塊註解會整段漏掉)',
      "const accept = 'image/*'\nconst reveal = '[@media(hover:none)]:w-auto'\n/* 之後的註解 */\n",
      [{ line: 2, text: '(hover:none)' }]],
    ['行尾註解裡有「斜線 + 兩個星號」之後的 class(date-picker.tsx 的「Material/**Ant** idiom」那種;先剝區塊註解的話這一行到下一個註解結尾都漏掉)',
      "  // popover(Material/**Ant** typed-date idiom)\nconst reveal = '[@media(hover:none)]:w-auto'\n/* 之後的註解 */\n",
      [{ line: 2, text: '(hover:none)' }]],
    ['CSS 的 @media (hover: none)', '.x { opacity: 0 }\n@media (hover: none) {\n  .x { opacity: 1 }\n}\n', [{ line: 2, text: '(hover: none)' }], true],
    ['CSS 的 @media (any-hover: none)', '@media (any-hover: none) { .x { opacity: 1 } }\n', [{ line: 1, text: '(any-hover: none)' }], true],
    ['JS 的 matchMedia 字串', "const touch = window.matchMedia('(hover: none)').matches\n", [{ line: 1, text: '(hover: none)' }]],
    ['Tailwind 任意變體、空白寫成底線', "const c = '[@media_(hover:_none)]:flex'\n", [{ line: 1, text: '(hover:_none)' }]],
    ['否定寫法:CSS not (hover: hover)', '@media not (hover: hover) { .x { opacity: 1 } }\n', [{ line: 1, text: 'not (hover: hover)' }], true],
    ['否定寫法:CSS not all and (hover: hover)', '@media not all and (hover: hover) { .x { opacity: 1 } }\n', [{ line: 1, text: 'not all and (hover: hover)' }], true],
    ['否定寫法:Tailwind [@media_not_(hover:hover)]', "const c = '[@media_not_(hover:hover)]:block'\n", [{ line: 1, text: 'not_(hover:hover)' }]],
    ['否定寫法:Tailwind not-[@media(hover:hover)]', "const c = 'not-[@media(hover:hover)]:block'\n", [{ line: 1, text: 'not-[@media(hover:hover)' }]],
    // 2026-11-14 審查 A 的 h01:下面四種原本都放行
    ['否定寫法:CSS not all and (hover)(布林語境的 (hover) = hover 不是 none)', '@media not all and (hover) { .x { opacity: 1 } }\n', [{ line: 1, text: 'not all and (hover)' }], true],
    ['否定寫法:Tailwind [@media_not_all_and_(hover)]', "const c = '[@media_not_all_and_(hover)]:opacity-100'\n", [{ line: 1, text: 'not_all_and_(hover)' }]],
    ['大寫:CSS (HOVER: NONE)(媒體特徵名稱與值不分大小寫)', '@media (HOVER: NONE) { .x { opacity: 1 } }\n', [{ line: 1, text: '(HOVER: NONE)' }], true],
    ['括號裡換行:CSS (hover:⏎ none)(行號取起點那一行)', '.x { opacity: 0 }\n@media (hover:\n  none) { .x { opacity: 1 } }\n', [{ line: 2, text: '(hover: none)' }], true],
    ['.css 裡網址後面的條件(.css 不認兩條斜線註解)', '.x { background: url(http://a.test/b.png) } @media (hover: none) { .x { opacity: 1 } }\n', [{ line: 1, text: '(hover: none)' }], true],
  ]
  /** [說明, 假原始碼, 是不是 .css] —— 一個都不該抓 */
  const mustNot = [
    ['行尾註解裡提到(註解裡提到 → 不擋)', '          // 2026-11-12 AI 曾在這裡加過 [@media(hover:none)]:opacity-100(c78b35e1),2026-11-14 收回\n'],
    ['區塊註解裡提到', '/* 不能滑過的裝置 @media (hover: none) 不另外處理 */\nconst x = 1\n'],
    ['跨行的區塊註解裡提到', '/**\n * 觸控:\n *   `[@media(hover:none)]:w-auto` 已收回\n */\nconst x = 1\n'],
    ['JSX 註解裡提到', '<div>\n  {/* (hover: none) 的裝置不另外處理 */}\n</div>\n'],
    ['CSS 註解裡提到', '/* @media (hover: none) 已收回 */\n.x { opacity: 0 }\n', true],
    ['正向條件 [@media(hover:hover)](data-table.tsx 排序區原文)', "            canSort && '[@media(hover:hover)]:[&:where(:has(~[data-col-menu]:hover))]:text-foreground',\n"],
    ['CSS 的 @media (hover: hover)', '@media (hover: hover) { .x:hover { opacity: 1 } }\n', true],
    ['正向的布林寫法 @media (hover)(沒有 not = 有滑過能力的裝置)', '@media (hover) { .x:hover { opacity: 1 } }\n', true],
    ['字裡帶 not 的字(cannot)後面接 (hover)', "const c = 'cannot (hover)'\n"],
    ['一般的 hover 變體', "const c = 'hover:no-underline group-hover:opacity-100 pointer-events-none hover:bg-neutral-hover'\n"],
    ['pointer: coarse(use-is-touch-device.ts 既有,不屬本條)', "const mq = window.matchMedia('(pointer: coarse)')\n"],
    ['乾淨的原始碼', "export const x = 'shrink-0 inline-flex w-0 overflow-hidden opacity-0'\n"],
  ]
  for (const [why, source, want, css = false] of must) {
    const { hits, unterminated } = noHoverMediaHits(source, { lineComments: !css })
    const same = hits.length === want.length && hits.every((h, i) => h.line === want[i].line && h.text === want[i].text)
    if (!same || unterminated) problems.push(`該抓:${why} —— 應 ${show(want)},實得 ${show(hits)}${unterminated ? `(剝註解沒有收尾:${unterminated})` : ''}`)
  }
  for (const [why, source, css = false] of mustNot) {
    const { hits, unterminated } = noHoverMediaHits(source, { lineComments: !css })
    if (hits.length || unterminated) problems.push(`不該抓:${why} —— 實得 ${show(hits)}${unterminated ? `(剝註解沒有收尾:${unterminated})` : ''}`)
  }
  // 剝註解沒有收尾要回報(否則「整個檔被當成註解」會被讀成 0 個命中)
  if (noHoverMediaHits("const x = 1\n/* 沒有收尾的註解\nconst y = '[@media(hover:none)]:flex'\n").unterminated !== 'block') problems.push('區塊註解沒有收尾應回報 unterminated = block')
  // 真檔對照(純函式測過之後,再用正式流程會吃到的真資料驗一次):把 c78b35e1 那一行塞進現在的 data-table.tsx(只在記憶體裡),必須在那一行抓到 4 個
  const real = readSource(DATA_TABLE_SOURCE)
  const at = real.indexOf(COLUMN_MENU_ANCHOR)
  if (at < 0) problems.push(`真檔對照:${DATA_TABLE_SOURCE} 裡找不到「${COLUMN_MENU_ANCHOR}」—— 表頭 ⌄ 那一行改寫了,把 COLUMN_MENU_ANCHOR 換成新的開頭`)
  else {
    const lineEnd = real.indexOf('\n', at)
    const injectedLine = real.slice(0, lineEnd).split('\n').length + 1
    const { hits } = noHoverMediaHits(`${real.slice(0, lineEnd + 1)}${C78B35E1_TOUCH_REVEAL_LINE}\n${real.slice(lineEnd + 1)}`)
    const before = noHoverMediaHits(real).hits
    const added = hits.filter((h) => h.line === injectedLine)
    if (added.length !== 4 || hits.length !== before.length + 4) problems.push(`真檔對照:把 c78b35e1 那一行塞進 ${DATA_TABLE_SOURCE} 第 ${injectedLine} 行,應在那一行多抓到 4 個,實得那一行 ${added.length} 個、全檔 ${before.length} → ${hits.length}`)
  }
  return problems
}

let failures = 0
for (const entry of REGISTRY) {
  const source = readFileSync(join(ROOT, entry.file), 'utf8')
  const start = source.indexOf(entry.anchor)
  if (start < 0) {
    console.error(`✗ ${entry.label}: anchor ${JSON.stringify(entry.anchor)} not found in ${entry.file}`)
    failures += 1
    continue
  }
  // 取錨點後一段(涵蓋該 affordance 的 className 區塊)
  const block = source.slice(start, start + 2500)
  if (entry.consumes) {
    // 消費者:gating class 住在 ItemSuffix(item-anatomy.tsx),這裡只驗有傳 hoverReveal / hoverGroup,且檔內沒有自己的一份
    const missing = entry.consumes.filter((re) => !re.test(block)).map(String)
    const ownCopy = new RegExp(`opacity-0 group-hover/${entry.scope}:opacity-100`).test(source)
    const problems = []
    if (missing.length) problems.push(`<ItemSuffix> 缺 ${missing.join(' / ')} → 不會隨滑過 / 鍵盤焦點揭示`)
    if (ownCopy) problems.push(`檔內又寫了一份 \`opacity-0 group-hover/${entry.scope}:opacity-100\` → 出現規則兩個住所(M17),改用 ItemSuffix hoverReveal`)
    if (problems.length) {
      console.error(`✗ ${entry.label} (${entry.file}):\n    - ${problems.join('\n    - ')}`)
      failures += 1
    } else {
      console.log(`✓ ${entry.label}`)
    }
    continue
  }
  const hasHidden = /opacity-0\b/.test(block)
  const hasHoverReveal = entry.hoverReveal ? entry.hoverReveal.test(block) : (new RegExp(`group-hover/${entry.scope}:opacity-100`).test(block)
    || /group-hover(?:\/[a-z-]+)?:opacity-100/.test(block))
  // focus 類揭示:`:focus-visible` 系才算數;`group-focus-within` 只留給上面例外清單裡的 PeoplePicker ×(它的「不准用」由下方全 DS 那一條判,
  // 這裡只判「有沒有鍵盤路徑」)。2026-10-21 前這裡還收不帶 group 的 `focus-within:opacity-100`(Carousel 那一筆)= 放行自己檔頭說不准的寫法
  const hasFocusReveal = /group-has-\[:focus-visible\](?:\/[a-z-]+)?:opacity-100|(?:^|[\s'"`])has-\[:focus-visible\]:opacity-100|focus-visible:opacity-100|group-focus-within(?:\/[a-z-]+)?:opacity-100/m.test(block)
  const problems = []
  if (!hasHidden) problems.push('缺 `opacity-0` 初始隱藏 → 會無條件恆顯')
  if (!hasHoverReveal) problems.push('缺 `group-hover/…:opacity-100` 揭示條件')
  if (!hasFocusReveal) {
    problems.push(new RegExp(FOCUS_WITHIN_REVEAL.source).test(block)
      ? '鍵盤揭示寫成 focus-within(滑鼠點一下也成立 → 指標移開後一直亮著)→ 改 has-[:focus-visible] / group-has-[:focus-visible]'
      : '缺 focus 類揭示條件(keyboard 不可達)')
  }
  for (const m of entry.mustInclude ?? []) if (!m.re.test(block)) problems.push(m.why)
  if (entry.specMentions) {
    const spec = readFileSync(join(ROOT, entry.specMentions.file), 'utf8').split('\n').find((l) => l.startsWith(entry.specMentions.heading))
    if (spec === undefined) problems.push(`${entry.specMentions.file} 找不到「${entry.specMentions.heading}」那一列(儀器讀不到規格)`)
    else if (!entry.specMentions.re.test(spec)) problems.push(entry.specMentions.why)
  }
  if (problems.length) {
    console.error(`✗ ${entry.label} (${entry.file}):\n    - ${problems.join('\n    - ')}`)
    failures += 1
  } else {
    console.log(`✓ ${entry.label}`)
  }
}

// ── 全 DS:鍵盤揭示不用 focus-within(r1b DT-06 同族) ──
{
  const SRC = join(ROOT, 'packages/design-system/src')
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(tsx|ts|css)$/.test(name) && !/\.stories\.tsx$/.test(name)) files.push(p)
    }
  }
  walk(SRC)
  if (files.length === 0) {
    console.error('✗ INSTRUMENT-FAIL 全 DS focus-within 揭示掃描:掃到 0 個檔')
    process.exit(2)
  }
  const REVEAL = FOCUS_WITHIN_REVEAL
  // 儀器對照:先證明正規式在該抓的抓得到、不該抓的不抓
  const instrumentProblems = revealSelfCheck()
  // 剝註解的對照(2026-11-14):行尾註解裡的「斜線 + 星號」之後、下一個註解之前的命中要抓得到(第 2 行),註解裡提到的不抓(第 3 行)
  const stripControl = codeHits("  // popover(Material/**Ant** typed-date idiom)\nconst c = 'opacity-0 focus-within:opacity-100'\n/* focus-within:opacity-100 只是提到 */\n", REVEAL)
  if (stripControl.hits.length !== 1 || stripControl.hits[0].line !== 2 || stripControl.hits[0].text !== 'focus-within:opacity-100') {
    instrumentProblems.push(`剝註解之後應只在第 2 行抓到 focus-within:opacity-100,實得 ${JSON.stringify(stripControl.hits)}`)
  }
  if (instrumentProblems.length) {
    console.error(`✗ INSTRUMENT-FAIL 全 DS focus-within 揭示掃描的正規式答錯:\n    - ${instrumentProblems.join('\n    - ')}`)
    process.exit(2)
  }
  // 兩條全 DS 掃描共用的地板:某個檔剝註解沒有收尾(檔尾還停在區塊註解或反引號字串裡)= 那個檔掃到的結果不可靠 → 儀器失效,不讀成「沒有命中」
  const unreliable = files
    .map((f) => ({ rel: f.slice(ROOT.length + 1), unterminated: blankComments(readFileSync(f, 'utf8'), { lineComments: !f.endsWith('.css') }).unterminated }))
    .filter((entry) => entry.unterminated)
  if (unreliable.length) {
    console.error(`✗ INSTRUMENT-FAIL 全 DS 掃描:這些檔剝註解沒有收尾,掃到的結果不可靠(不讀成通過):\n    - ${unreliable.map((entry) => `${entry.rel}(檔尾還停在${entry.unterminated === 'block' ? '區塊註解' : '反引號字串'}裡)`).join('\n    - ')}`)
    process.exit(2)
  }
  const found = []
  const exceptionHits = new Map()
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1)
    // 註解裡提到(說明為什麼不用它)不算。2026-11-14 前的剝法是「一條正規式先剝區塊註解、再逐行去掉兩條斜線之後」:行尾註解裡的
    // 「斜線 + 星號」(date-picker.tsx「Material/**Ant** idiom」、data-table.tsx 出殼那一段的「0/0/**1** 幀殼」)會被當成區塊註解起頭,
    // 到下一個註解結尾之間的程式整段沒掃 —— 當天實量 data-table.tsx 13 行、date-picker.tsx 77 行;兩種剝法在現況的命中相同
    // (沒有因此漏掉的違規),但那是剛好。改用認得字串與行尾註解的 blankComments(上面的對照守這一點)。
    for (const h of codeHits(readFileSync(f, 'utf8'), REVEAL, { lineComments: !f.endsWith('.css') }).hits) {
      if (FOCUS_WITHIN_REVEAL_EXCEPTIONS.get(rel)?.match === h.text) { exceptionHits.set(rel, (exceptionHits.get(rel) ?? 0) + 1); continue }
      found.push(`${rel}:${h.line} ${h.text}`)
    }
  }
  // 例外必須真的命中:不命中 = 已經改掉了,清單要跟著刪;成對的另一筆也必須一起改(否則 × 與挖洞的出現條件分家)
  const stale = [...FOCUS_WITHIN_REVEAL_EXCEPTIONS].filter(([rel]) => !exceptionHits.has(rel))
    .map(([rel, e]) => `${rel}:例外「${e.match}」已不在檔內 → 從 FOCUS_WITHIN_REVEAL_EXCEPTIONS 刪掉;它與 ${e.pair} 成對,那一邊也要一起改成 :focus-visible 系`)
  if (found.length) {
    console.error(`✗ 鍵盤揭示用了 focus-within(滑鼠點一下也成立 → 東西一直亮著),改用 has-[:focus-visible] / group-has-[:focus-visible] / <ItemSuffix hoverReveal>:\n    - ${found.join('\n    - ')}`)
    failures += 1
  }
  if (stale.length) {
    console.error(`✗ 例外清單過期:\n    - ${stale.join('\n    - ')}`)
    failures += 1
  }
  if (!found.length && !stale.length) {
    console.log(`✓ 全 DS ${files.length} 個原始碼檔:鍵盤揭示沒有用 focus-within(例外 ${FOCUS_WITHIN_REVEAL_EXCEPTIONS.size} 筆、各命中 1 次以上,見清單理由)`)
  }

  // ── 全 DS:沒有「不能滑過的裝置」的媒體條件(2026-11-14,A7 ⑥ 防再犯;規則與依據見檔頭「再加全 DS 一條」)──
  // 儀器對照:先證明同一支判定在該抓的抓得到(指名行號與命中的字)、不該抓的不抓,真檔上也抓得到
  let noHoverProblems
  try { noHoverProblems = noHoverSelfCheck() } catch (error) { noHoverProblems = [`對照組跑不起來:${String(error?.message ?? error).split('\n')[0]}`] }
  if (noHoverProblems.length) {
    console.error(`✗ INSTRUMENT-FAIL 全 DS「不能滑過的裝置」媒體條件掃描的對照組答錯:\n    - ${noHoverProblems.join('\n    - ')}`)
    process.exit(2)
  }
  // 同一行同一種寫法出現幾次合成一筆(c78b35e1 那一行是 4 次)
  const noHoverCounts = new Map()
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1)
    for (const h of noHoverMediaHits(readFileSync(f, 'utf8'), { lineComments: !f.endsWith('.css') }).hits) {
      const where = `${rel}:${h.line} ${h.text}`
      noHoverCounts.set(where, (noHoverCounts.get(where) ?? 0) + 1)
    }
  }
  const noHoverFound = [...noHoverCounts].map(([where, times]) => (times > 1 ? `${where} ×${times}` : where))
  if (noHoverFound.length) {
    console.error(`✗ DS 原始碼出現「不能滑過的裝置」的媒體條件 —— user 2026-09-26 對「手機上滑過才出現的按鈕」已決「先維持」、不替觸控另外客製`
      + `(governance/planning/2026-09-25-interaction-and-hover-remediation.md 的 L11 那一列);2026-08-05 PeoplePicker、2026-11-12 表頭 ⌄ 各加過一次、都收回了。`
      + `要替不能滑過的裝置加東西,先拿那一則去問 user,不是在這裡加例外:\n    - ${noHoverFound.join('\n    - ')}`)
    failures += 1
  } else {
    console.log(`✓ 全 DS ${files.length} 個原始碼檔:沒有「不能滑過的裝置」的媒體條件((hover: none) / (any-hover: none) / not (hover: hover) / not all and (hover);大小寫不分、括號裡換行也算;註解裡提到不算)`)
  }
}

if (failures) {
  console.error(`\n❌ hover-reveal gating 契約失敗 ${failures} 項 — 見上方檔案`)
  process.exit(1)
}
console.log(`Hover-revealed affordance gating PASS (${REGISTRY.length} registered)`)
