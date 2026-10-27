#!/usr/bin/env node
/**
 * test-hover-revealed-affordances.mjs — hover-reveal 可見性 gating 的機械防線。
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
 *   與 FieldControlGroup 的 `[&>*:focus-within]:z-[3]`(疊層順序)不是揭示,也不收。
 *   例外清單 FOCUS_WITHIN_REVEAL_EXCEPTIONS 只收寫得出理由、而且要 owner 決定的;**每一筆都必須真的命中**(不命中 = 例外過期,紅),
 *   成對的兩筆因此只能一起改。
 *   儀器對照(M32):每次執行先拿一組已知該抓 / 不該抓的 class 字串跑同一個正規式,答錯 = INSTRUMENT-FAIL(exit 2),不讀成通過。
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
    label: 'Sidebar menu-item action(消費 ItemSuffix hoverReveal)',
    file: 'packages/design-system/src/components/Sidebar/sidebar.tsx',
    anchor: '<ItemSuffix',
    scope: 'menu-item',
    consumes: [/hoverReveal=\{[^}]+\}/, /hoverGroup="menu-item"/],
  },
  {
    label: 'Carousel arrow wrapper',
    file: 'packages/design-system/src/components/Carousel/carousel.tsx',
    anchor: 'const arrowWrapperClass',
    scope: 'carousel',
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
    // 2026-10-13 鉛筆改成行內小按鈕 ItemInlineAction(待辦總帳 Q3b),揭示 class 掛在包住它的那層 span(帶編輯入口標記);
    // 2026-10-21(r1b DT-06)起不再自抄一份 gating 字串,改消費 item-anatomy 的 `itemSuffixHoverRevealClass('cell')`
    //(class 契約由上面 item-anatomy 那一筆驗;這一筆驗「真的消費那一份、而且沒有又抄回一份」)
    label: 'DataTable url cell 編輯連結(消費 itemSuffixHoverRevealClass)',
    file: 'packages/design-system/src/components/DataTable/cell-registry.tsx',
    anchor: "[CELL_EDIT_ENTRY_ATTR]: ''",
    scope: 'cell',
    consumes: [/itemSuffixHoverRevealClass\('cell'\)/],
  },
]

/**
 * 鍵盤揭示用 focus-within 的例外(每一筆都要寫得出為什麼、誰要決定):
 * - PeoplePicker 頭像疊的移除 ×:檔內註解寫的是「觸控 focus-within 也顯」—— 點一下頭像就把 × 叫出來,是觸控路徑的刻意設計;
 *   但 people-picker.spec.md「觸控裝置」又說 stack 的移除鈕是 hover-reveal、觸控改由 pill 降階承擔。兩句要由 PeoplePicker 的 owner 收斂
 *  (而且「DS 只做桌機」這個前提還有兩題等 user 決定:「lg 密度給什麼情境用」「Tooltip 規格裡的觸控理由怎麼改」),本閘不替它決定。
 *   轉交登記在待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` 的 R1b-DT2 列。
 * - Avatar 自己的挖洞(`AVATAR_OWN_CUTOUT_CLASS`):移除 × 底下的洞,打開條件必須與 × 本身顯示的條件相同(avatar.tsx 同段 JSDoc),
 *   所以與上一筆**成對**:× 改了洞不改 = 滑鼠點過頭像後洞開著、× 卻不見(或反過來)。同一列 R1b-DT2。
 */
const FOCUS_WITHIN_REVEAL_EXCEPTIONS = new Map([
  ['packages/design-system/src/components/PeoplePicker/person-display.tsx', { match: 'group-focus-within/avatar:opacity-100', pair: 'packages/design-system/src/components/Avatar/avatar.tsx' }],
  ['packages/design-system/src/components/Avatar/avatar.tsx', { match: 'group-focus-within/avatar:[--avatar-dismiss-on:1]', pair: 'packages/design-system/src/components/PeoplePicker/person-display.tsx' }],
])

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
    "[&>*:hover]:z-[3] [&>*:focus-within]:z-[3]", // FieldControlGroup 疊層
    "focus-within:opacity-1000",
  ]
  const problems = []
  const count = (s) => [...s.matchAll(new RegExp(re.source, re.flags))].length
  for (const s of must) if (count(s) === 0) problems.push(`該抓沒抓到:${s}`)
  if (count("'focus-within:opacity-100 focus-within:pointer-events-auto'") !== 2) problems.push('FileViewer 修前那一行應命中 2 次')
  for (const s of mustNot) if (count(s) !== 0) problems.push(`不該抓卻抓到:${s}`)
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
  if (instrumentProblems.length) {
    console.error(`✗ INSTRUMENT-FAIL 全 DS focus-within 揭示掃描的正規式答錯:\n    - ${instrumentProblems.join('\n    - ')}`)
    process.exit(2)
  }
  const found = []
  const exceptionHits = new Map()
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1)
    // 註解裡提到(說明為什麼不用它)不算 —— 先把區塊註解(含跨行的 JSX 註解)換成同樣行數的空白,再逐行去掉 // 行尾註解
    const source = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    source.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '')
      for (const m of code.matchAll(REVEAL)) {
        if (FOCUS_WITHIN_REVEAL_EXCEPTIONS.get(rel)?.match === m[0]) { exceptionHits.set(rel, (exceptionHits.get(rel) ?? 0) + 1); continue }
        found.push(`${rel}:${i + 1} ${m[0]}`)
      }
    })
  }
  // 例外必須真的命中:不命中 = 已經改掉了,清單要跟著刪;成對的另一筆也必須一起改(否則 × 與挖洞的出現條件分家)
  const stale = [...FOCUS_WITHIN_REVEAL_EXCEPTIONS].filter(([rel]) => !exceptionHits.has(rel))
    .map(([rel, e]) => `${rel}:例外「${e.match}」已不在檔內 → 從 FOCUS_WITHIN_REVEAL_EXCEPTIONS 刪掉;它與 ${e.pair} 成對,那一邊也要一起改成 :focus-visible 系`)
  if (found.length) {
    console.error(`✗ 鍵盤揭示用了 focus-within(滑鼠點一下也成立 → 東西一直亮著),改用 has-[:focus-visible] / group-has-[:focus-visible] / itemSuffixHoverRevealClass:\n    - ${found.join('\n    - ')}`)
    failures += 1
  }
  if (stale.length) {
    console.error(`✗ 例外清單過期:\n    - ${stale.join('\n    - ')}`)
    failures += 1
  }
  if (!found.length && !stale.length) {
    console.log(`✓ 全 DS ${files.length} 個原始碼檔:鍵盤揭示沒有用 focus-within(例外 ${FOCUS_WITHIN_REVEAL_EXCEPTIONS.size} 筆、各命中 1 次以上,見清單理由)`)
  }
}

if (failures) {
  console.error(`\n❌ hover-reveal gating 契約失敗 ${failures} 項 — 見上方檔案`)
  process.exit(1)
}
console.log(`Hover-revealed affordance gating PASS (${REGISTRY.length} registered)`)
