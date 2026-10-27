#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 不在 AppShell 裡、單獨使用的 Sidebar,按開關(SidebarTrigger)真的收起來 —— `collapsible="icon"` 收起後外框寬 = `--sidebar-width-icon`、
 *         細列上第一個選單項點得到(不 inert、不 aria-hidden、命中測試打得到它);`collapsible="offcanvas"` 收起後外框寬 0、裡面的選單項 inert +
 *         aria-hidden(看不到的不留在 Tab 順序);再按一次回到 `--sidebar-width`、選單項可操作。量的是**寬度本身**與**點得到**,不讀 class(M37)。
 *         收成細列後另量「看得到多寬,版面就多寬」(sidebar.spec.md「Collapsible」的「收起後的寬」;elevation.spec.md「浮層間距」),單獨使用的細列
 *         與 AppShell 的細列(主側欄佈局按開關)都量:
 *           R1 細列上每一顆列鈕的版面矩形都在細列看得到的範圍內(看得到的範圍 = 列鈕矩形與每一層 overflow 非 visible 祖先的 padding box 取交集);
 *           R2 / R3 滑鼠停在列鈕上、鍵盤聚焦列鈕時打開的 Tooltip:左緣 − 列鈕看得到的右緣 = `OVERLAY_SIDE_OFFSET`(值從 overlay-geometry.ts 讀,不寫死);
 *           R4 鍵盤聚焦框四邊完整:焦點框(往內畫的 outline)每一邊的中線取樣點,命中測試都打到列鈕本身(被裁掉 / 被蓋住就打不到);
 *           量的列鈕 = 捲動區裡第一顆 + 帳號列(有的話)。
 *         細列內容比視窗高時(1440×230:完整佈局標準與寬鬆密度、混合前綴標準密度)滑過細列:
 *           R5 直捲軸出現、整條在細列看得到的範圍內、命中測試打得到它;R6 捲軸那一欄不與任何圖示 / 頭像那一欄重疊。
 *         另有靜態段:全 DS 的 `.tsx` / `.ts` 沒有任何元素在自己身上同時帶 `group` 與 `group-*` 變體、或 `peer` 與 `peer-*` 變體
 *         (Tailwind 的 `group-*` 編譯成後代選擇器、`peer-*` 編譯成兄弟選擇器,都比不到自己 → 靜默失效;2026-10-14 Sidebar 收合寬就是這樣失效的)。
 *         一個元素的 class 來源 = `className=` 屬性與 `cn(` / `clsx(` / `twMerge(` / `cva(` 的引數(TypeScript 語法樹;疊加變體、具名 group 都算)。
 *   紅: 任一則 story 收起後寬度不符、細列選單項點不到、offcanvas 收起後選單項仍可聚焦、展開後選單項不可操作、R1–R6 任一格不符,或靜態段找到違規 → exit 1。
 *       `--selftest` 兩種對照組:(a) 靜態:把 2026-10-14 那段 Sidebar 寫法(逐字)與同一陷阱的 8 種其他寫法(cva / cn 變數 / peer / 疊加變體 /
 *           具名 group / clsx / 樣板字串;2026-10-20 r1b 複核 D5)餵給掃描器都必須被抓到,6 種乾淨寫法不得誤報;
 *       (b) 頁面:注入 CSS 把收起的外框寬釘回 `--sidebar-width`(= 2026-10-14 的實際症狀)每一則都必須紅;
 *           注入腳本拿掉寬 0 那一份的 inert,offcanvas 那則必須紅;
 *           注入 CSS 把細列的內層釘回 `--sidebar-width`(= 2026-05-21 → 10-27 的實際症狀:Tooltip 離細列 201px、焦點框缺右邊、捲軸畫在被裁掉的右緣)
 *           → 每一則細列 story(含 AppShell)R1 紅、R2 / R3 / R4 / R5 都紅;
 *           把細列列鈕的右內距放回 loose(拿掉 `!pr-0` 的效果)→ 完整佈局 R1、R4 紅(列鈕 48 > 看得到的 47);
 *           Tooltip 外殼右移 4px → R2、R3 紅;細列捲軸 visibility:hidden(= 不出捲軸)→ R5 紅;捲軸加寬到 28px → R6 紅。
 *       story 開不起來 = 儀器失效,點名 story、exit 1。該有 Tooltip 的列鈕一格都沒量到、聚焦後不是 :focus-visible、焦點框往外畫(本量法只量往內畫的框)、
 *       細列內容沒有比視窗高(量不到捲軸)= 儀器失效(量不到不等於沒問題,M37 第八形)。
 *   綠: 六則 story 收起 / 展開兩步都符合、R1–R6 全部相符、靜態段 0 違規時綠。寬度比到 0.75px(瀏覽器以小數 px 排版),Tooltip 間距比到 1px。
 *
 * 出處:2026-10-15 r1b 複驗 F1(P0)—— 單獨使用的 Sidebar `icon` / `offcanvas` 收起後外框仍 240(main 是 48 / 0),offcanvas 還把看得到的選單設 inert +
 * aria-hidden(看得到、點不到、讀不到)。根因:sidebar.tsx 把 `group-data-[collapsible=…]:!w-…` 寫在帶 `group` 的那個元素自己身上。
 * 那天 test:app-shell-layout / test:sidebar-menu-keyboard 全綠 —— 沒有任何閘量「單獨使用時收起後的寬」。規則:sidebar.spec.md「Collapsible」。
 * R1–R6:2026-10-21 user:「我發現 sidebar 變成 icon only的時候，每個sidbar menu item 的tooltip距離 sidebar好遠」。2026-05-21 起細列內層保持展開寬、
 * 只靠外框裁 → 列鈕版面 240、Tooltip 錨在被裁掉的右緣(248)、離細列 201px;本閘先前只量外框寬(48 本來就對),沒有任何一格量「裡面的東西」。
 * 量的是使用者看到的距離(Tooltip ↔ 列鈕看得到的右緣),不是「Tooltip ↔ 列鈕矩形」—— 後者在內層 240 時照樣 = 8(錨點就是那個 240 的矩形),
 * 量它等於拿症狀的原因當答案(M37)。R5 / R6:2026-10-21 user 回 E3:「ds規定本來就應該盡量讓使用者在各種情況下都能看完完整內容吧？如果不出現捲軸要如何看完完整內容？？？」。
 *
 * Run: `node scripts/sidebar-standalone-collapse-invariant.mjs [--static=<dir>] [--selftest]`(預設讀 `storybook-static`)
 */
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  openStory,
  parkPointer,
  StoryRenderInstrumentError,
  INSTRUMENT_FAIL_MARKER,
  launchBrowserOrSkip,
  requireFreshStorybookBuild,
  settleAfterInteraction,
} from './lib/launch-browser.mjs'

const ROOT = process.cwd()
const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(ROOT, staticArg)) : join(ROOT, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const TOL = 0.75
const SETTLE_FRAMES = 10
// 浮層與觸發元件的間距 SSOT(tokens/elevation/overlay-geometry.ts);讀原始碼,不在閘裡另寫一份 8
const OVERLAY_SIDE_OFFSET = Number(/export const OVERLAY_SIDE_OFFSET = (\d+)/.exec(readFileSync(join(ROOT, 'packages/design-system/src/tokens/elevation/overlay-geometry.ts'), 'utf8'))?.[1])
if (!Number.isFinite(OVERLAY_SIDE_OFFSET)) { console.error('✗ 讀不到 OVERLAY_SIDE_OFFSET(overlay-geometry.ts)—— 儀器失效'); process.exit(1) }

// ── 靜態段:元素自己帶 `group`(或 `peer`)又在自己身上用 `group-*`(或 `peer-*`)變體 ──
// 一個元素的 class 來源 = JSX `className="…"` / `className={…}`,以及 `cn(` / `clsx(` / `twMerge(` / `cva(` 的引數
// (cva 的 base 與各 variant 都套在同一個元素上;`const c = cn(…)` 存成變數再給 className 也照樣抓)。
// 用 TypeScript 語法樹找區段(註解天然不算;`className={cn(…)}` 裡的 cn 已被外層區段涵蓋、不重算),區段裡的字串字面量合起來看。
// 2026-10-20 r1b 複核 D5:第一版只看 `className=` 屬性、只認 `group-` 開頭的單一變體 —— cva / cn 變數、`peer` + `peer-*`、
// 疊加變體(`md:group-hover:`)都漏(M7 / M34:閘的廣度要對齊規則的廣度,tailwind-gotchas 寫的是「全 DS」)。
const CLASS_CALLS = new Set(['cn', 'clsx', 'twMerge', 'cva'])
/** class 字串切成變體段 + 本體(冒號在 `[…]` / `(…)` 裡不算分隔) */
function splitVariants(token) {
  const parts = []
  let depth = 0, cur = ''
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth += 1
    else if (ch === ']' || ch === ')') depth -= 1
    if (ch === ':' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  parts.push(cur)
  return parts
}
/** 變體段是不是 group-* / peer-*;回 { kind, name }(name = 具名 group 的名字,沒有 = '') */
function relationalVariant(v) {
  const m = /^(group|peer)-(.+)$/.exec(v)
  if (!m) return null
  // 具名:結尾 `/<name>`,而且那個斜線不在 `[…]` 裡(`group-hover/item`、`group-data-[state=open]/menu`)
  let depth = 0, slash = -1
  for (let i = 0; i < m[2].length; i += 1) {
    const ch = m[2][i]
    if (ch === '[' || ch === '(') depth += 1
    else if (ch === ']' || ch === ')') depth -= 1
    else if (ch === '/' && depth === 0) slash = i
  }
  return { kind: m[1], name: slash >= 0 ? m[2].slice(slash + 1) : '' }
}
/** 一個區段裡的 class 字串(物件的 key 不算,例如 cva 的 variant 名) */
function classStrings(node) {
  const out = []
  const visit = (n) => {
    if (ts.isPropertyAssignment(n)) { visit(n.initializer); return }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text)
    else if (ts.isTemplateExpression(n)) { out.push(n.head.text); for (const sp of n.templateSpans) { visit(sp.expression); out.push(sp.literal.text) } return }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}
export function selfGroupVariantSites(src, fileName = 'snippet.tsx') {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, fileName.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX)
  const regions = []
  const visit = (n) => {
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'className' && n.initializer) { regions.push(n.initializer); return }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && CLASS_CALLS.has(n.expression.text)) { regions.push(n); return }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  const hits = []
  for (const region of regions) {
    const tokens = classStrings(region).flatMap((x) => x.split(/\s+/)).filter(Boolean)
    // 這個元素自己是哪些 group / peer(`group`、`group/menu-item`、`peer`、`peer/name`)
    const markers = new Set(tokens.map((t) => /^(group|peer)(?:\/([\w-]+))?$/.exec(t)).filter(Boolean).map((x) => `${x[1]}/${x[2] ?? ''}`))
    if (!markers.size) continue
    const bad = tokens.filter((t) => splitVariants(t.replace(/^!/, '')).slice(0, -1).some((v) => { const r = relationalVariant(v); return !!r && markers.has(`${r.kind}/${r.name}`) }))
    if (bad.length) hits.push({ line: sf.getLineAndCharacterOfPosition(region.getStart(sf)).line + 1, tokens: [...[...markers].map((k) => k.replace(/\/$/, '')), ...bad] })
  }
  return hits
}
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n === 'storybook-static') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (n.endsWith('.tsx') || (n.endsWith('.ts') && !n.endsWith('.d.ts'))) acc.push(p)
  }
  return acc
}
function staticScan() {
  const files = walk(join(ROOT, 'packages/design-system/src'))
  const bad = []
  for (const f of files) for (const h of selfGroupVariantSites(readFileSync(f, 'utf8'), f)) bad.push(`${relative(ROOT, f)}:${h.line} ${h.tokens.join(' ')}`)
  return { files: files.length, bad }
}

// 2026-10-14 那段寫法(sidebar.tsx Sidebar 外框,逐字取自 be2f1324)—— 對照組 (a)
const PRE_FIX_SNIPPET = `        <div
          ref={ref}
          className={cn(
            "group peer relative shrink-0 text-foreground",
            // 單獨使用:寬度走 token(展開 \`--sidebar-width\`、細列 \`--sidebar-width-icon\`、offcanvas 0);在 AppShell 裡由 style 給
            !inShell && [
              "w-[var(--sidebar-width)]",
              "group-data-[collapsible=offcanvas]:!w-0",
              "group-data-[collapsible=icon]:!w-[var(--sidebar-width-icon)]",
            ],
            panel?.resizing ? "transition-none" : "transition-[width] duration-200 ease-linear motion-reduce:duration-0"
          )}
        >`
// 同一種陷阱的其他寫法(2026-10-20 r1b 複核 D5 抓到第一版全部漏掉)—— 每一種都必須被抓到
const RED_SNIPPETS = [
  ['cva 的 base 自己帶 group + group-*', `const v = cva("group relative group-data-[collapsible=icon]:!w-0", { variants: {} })\nconst X = () => <div className={v()} />`],
  ['cva 的 base 帶 group、variant 裡寫 group-*(同一個元素)', `const v = cva("group relative", { variants: { size: { sm: "group-hover:bg-muted" } } })`],
  ['cn 先存成變數再給 className', `const cls = cn("group peer", "group-data-[state=open]:w-0")\nconst X = () => <div className={cls} />`],
  ['peer + peer-* 寫在自己身上(兄弟選擇器,同樣比不到自己)', `const X = () => <input className="peer peer-checked:bg-primary" />`],
  ['疊加變體(md:group-hover:)', `const X = () => <div className={cn("group", "md:group-hover:opacity-100")} />`],
  ['具名 group 配同名變體', `const X = () => <li className="group/item group-hover/item:bg-muted" />`],
  ['clsx + 單引號', `const X = () => <div className={clsx('peer', 'peer-focus-visible:ring-2')} />`],
  ['樣板字串', 'const X = ({ x }) => <div className={`group ${x} group-data-[open=true]:w-0`} />'],
]
const CLEAN_SNIPPETS = [
  // group 在父層、變體在子層(正確用法)
  `<div className="group peer"><span className="group-data-[collapsible=icon]:hidden" /></div>`,
  // 具名 group(group/menu-item)配不具名的變體:變體找的是祖先那個不具名的 group,不是自己
  `<li className={cn("group/menu-item relative", "group-data-[collapsible=icon]:hidden")} />`,
  // 註解裡提到不算
  `<div className={cn("group", /* group-data-[x]:w-0 */ "w-4")} />`,
  // peer 在前一個兄弟、peer-* 在後一個兄弟(正確用法)
  `<label><input className="peer sr-only" /><span className="peer-checked:bg-primary" /></label>`,
  // 具名 group 配別的名字的變體
  `<li className="group/item group-hover/menu:bg-muted" />`,
  // cva 的 variant 名剛好叫 group(物件的 key 不是 class)
  `const v = cva("relative", { variants: { group: { true: "group-hover:underline" } } })`,
]
// ── 頁面段 ──
// tooltip:這則 story 的細列列鈕有沒有給 `tooltip`(狀態行為的即時示範沒給 → 那則不量 R2 / R3,R1 / R4 照量)
const STORIES = [
  { id: 'design-system-components-sidebar-展示--icon-collapse', mode: 'icon', tooltip: true },
  { id: 'design-system-components-sidebar-展示--group-action', mode: 'icon', tooltip: true },
  { id: 'design-system-components-sidebar-展示--mixed-content', mode: 'icon', tooltip: true },
  { id: 'design-system-components-sidebar-展示--integration-sidebar', mode: 'icon', tooltip: true },
  { id: 'design-system-components-sidebar-展示--offcanvas', mode: 'offcanvas' },
  { id: 'design-system-components-sidebar-設計規格--state-behavior', mode: 'icon', tooltip: false },
]
// AppShell 的細列(同一個判斷式的 AppShell 分支):主側欄佈局在 1440 寬並排展開,按開關收成細列
const SHELL_RAILS = [
  { id: 'design-system-components-appshell-展示--primary-sidebar', tooltip: true },
]
// 細列內容比視窗高:視窗 1440×230(收起後 = 標頭 + 捲動區 + 帳號列,捲動區放不下主選單)。完整佈局量兩種密度(圖示);
// 混合前綴量標準密度(頭像 24 比圖示寬,細列 48 時頭像右緣 36、捲軸左緣 37,是最貼的一格)
const SCROLL_CASES = [
  { id: 'design-system-components-sidebar-展示--icon-collapse', density: 'md', viewport: { width: 1440, height: 230 } },
  { id: 'design-system-components-sidebar-展示--icon-collapse', density: 'lg', viewport: { width: 1440, height: 230 } },
  { id: 'design-system-components-sidebar-展示--integration-sidebar', density: 'md', viewport: { width: 1440, height: 230 } },
]
const DEFAULT_VIEWPORT = { width: 1440, height: 900 }
const short = (id) => id.replace('design-system-components-sidebar-', '').replace('design-system-components-appshell-', 'AppShell ')

/** 頁面端:單獨使用的 Sidebar 外框(帶 data-side / data-state、不在 AppShell 裡)與它的選單項 */
function measure() {
  const r2 = (n) => Math.round(n * 100) / 100
  const frame = [...document.querySelectorAll('[data-side][data-state]')].find((el) => !el.closest('[data-app-shell]') && el.querySelector('[data-sidebar="sidebar"]'))
  if (!frame) return { err: '找不到單獨使用的 Sidebar 外框([data-side][data-state])' }
  // token 的實際寬:在同一個 SidebarProvider 底下放探針(變數可能被 consumer 覆寫,不寫死 240 / 48)
  const host = frame.parentElement
  const probe = (v) => { const p = document.createElement('div'); p.style.cssText = `position:absolute;visibility:hidden;height:1px;width:${v}`; host.appendChild(p); const w = p.getBoundingClientRect().width; p.remove(); return r2(w) }
  const button = frame.querySelector('[data-sidebar="menu-button"]')
  const b = button?.getBoundingClientRect()
  const f = frame.getBoundingClientRect()
  // 細列只露出左側那一段:命中點取「按鈕在外框可見範圍內」的中心
  const x = b ? Math.min(b.left + 12, f.right - 2) : 0
  const y = b ? b.top + b.height / 2 : 0
  const hit = b && f.width > 1 ? document.elementFromPoint(x, y) : null
  return {
    state: frame.getAttribute('data-state'),
    collapsible: frame.getAttribute('data-collapsible'),
    width: r2(f.width),
    tokenExpanded: probe('var(--sidebar-width)'),
    tokenRail: probe('var(--sidebar-width-icon)'),
    button: button ? (button.getAttribute('aria-label') || button.textContent || '').trim().slice(0, 20) : null,
    buttonInert: !!button?.closest('[inert]'),
    buttonHidden: !!button?.closest('[aria-hidden="true"]'),
    buttonHit: !!hit && !!button && (hit === button || button.contains(hit)),
  }
}

/**
 * 頁面端(序列化傳入,不得引用外部變數):細列的量測。kind = standalone(單獨使用)/ shell(AppShell 版面上那一份)。
 * op:buttons(R1 每顆列鈕的版面與看得到的範圍)/ mark(標出要量的列鈕)/ point(列鈕看得到那一段的中心)/ tip(這顆列鈕開著的 Tooltip)/
 *     focus(程式聚焦)/ ring(焦點框四邊取樣)/ scroll(捲動區、直捲軸、圖示)。
 */
function railProbe({ kind, op, role }) {
  const r2 = (n) => Math.round(n * 100) / 100
  const frame = kind === 'shell'
    ? document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay])')
    : [...document.querySelectorAll('[data-side][data-state]')].find((el) => !el.closest('[data-app-shell]') && el.querySelector('[data-sidebar="sidebar"]'))
  if (!frame) return { err: `找不到${kind === 'shell' ? ' AppShell 版面上的' : '單獨使用的'} Sidebar 外框` }
  // 看得到的水平範圍 = 元素矩形與每一層 overflow-x 不是 visible 的祖先的 padding box 取交集(clip / hidden / auto / scroll 都會裁)
  const visibleX = (el) => {
    const b = el.getBoundingClientRect()
    let left = b.left, right = b.right
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (getComputedStyle(a).overflowX === 'visible') continue
      const ab = a.getBoundingClientRect()
      left = Math.max(left, ab.left + a.clientLeft)
      right = Math.min(right, ab.left + a.clientLeft + a.clientWidth)
    }
    return { left: r2(left), right: r2(right) }
  }
  const rendered = (el) => el.getClientRects().length > 0 && !el.closest('[inert],[aria-hidden="true"]')
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20)
  if (op === 'buttons') {
    return {
      collapsible: frame.getAttribute('data-collapsible'),
      buttons: [...frame.querySelectorAll('[data-sidebar="menu-button"]')].filter(rendered).map((el) => {
        const b = el.getBoundingClientRect(), v = visibleX(el)
        return { label: label(el), left: r2(b.left), right: r2(b.right), visLeft: v.left, visRight: v.right }
      }),
    }
  }
  if (op === 'mark') {
    // 要量的列鈕:捲動區裡第一顆可操作的 + 帳號列(footer)那一顆
    document.querySelectorAll('[data-rail-probe]').forEach((el) => el.removeAttribute('data-rail-probe'))
    const pick = (scope) => scope && [...scope.querySelectorAll('[data-sidebar="menu-button"]')].find((el) => rendered(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
    const targets = []
    for (const [name, scope] of [['捲動區第一顆列鈕', frame.querySelector('[data-sidebar="content"]')], ['帳號列', frame.querySelector('[data-sidebar="footer"]')]]) {
      const el = pick(scope)
      if (!el) continue
      el.setAttribute('data-rail-probe', name)
      targets.push({ role: name, label: label(el) })
    }
    return { targets }
  }
  if (op === 'scroll') {
    const vp = frame.querySelector('[data-sidebar="content"] [data-radix-scroll-area-viewport]')
    if (!vp) return { err: '找不到細列的捲動區' }
    const vb = vp.getBoundingClientRect(), v = visibleX(vp)
    const base = { overflow: r2(vp.scrollHeight - vp.clientHeight), point: { x: (v.left + v.right) / 2, y: vb.top + vb.height / 2 } }
    const bar = vp.parentElement.querySelector(':scope > [data-orientation="vertical"]')
    if (!bar) return { ...base, bar: null, icons: [] }
    const bb = bar.getBoundingClientRect(), bv = visibleX(bar)
    const thumb = bar.firstElementChild
    const tb = thumb?.getBoundingClientRect()
    const hit = tb && tb.height > 0 ? document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2) : null
    const icons = [...vp.querySelectorAll('[data-sidebar="menu-button"]')].filter(rendered).flatMap((btn) =>
      [...btn.querySelectorAll('[data-prefix-type], svg, img')].filter((el) => el.getClientRects().length > 0).map((el) => {
        const r = el.getBoundingClientRect()
        return { label: label(btn), left: r2(r.left), right: r2(r.right) }
      }))
    return { ...base, bar: { state: bar.getAttribute('data-state'), left: r2(bb.left), right: r2(bb.right), visLeft: bv.left, visRight: bv.right, thumbHeight: tb ? r2(tb.height) : 0, hit: !!hit && bar.contains(hit) }, icons }
  }
  const t = document.querySelector(`[data-rail-probe="${role}"]`)
  if (!t) return { err: `找不到量測對象「${role}」` }
  if (op === 'point') {
    const b = t.getBoundingClientRect(), v = visibleX(t)
    return { x: (v.left + v.right) / 2, y: b.top + b.height / 2 }
  }
  if (op === 'tip') {
    // Radix Tooltip 開著時,觸發點掛 aria-describedby → role="tooltip" 的節點;泡泡 = 它所在 popper 外殼的第一個子元素
    const id = t.getAttribute('aria-describedby')
    const node = id ? document.getElementById(id) : null
    const bubble = node?.getAttribute('role') === 'tooltip' ? node.closest('[data-radix-popper-content-wrapper]')?.firstElementChild : null
    if (!bubble) return { open: false }
    return { open: true, left: r2(bubble.getBoundingClientRect().left), visRight: visibleX(t).right, right: r2(t.getBoundingClientRect().right) }
  }
  if (op === 'focus') {
    t.focus()
    return { active: document.activeElement === t, focusVisible: t.matches(':focus-visible') }
  }
  if (op === 'ring') {
    if (!t.matches(':focus-visible')) return { instrument: '列鈕不是 :focus-visible(量不到鍵盤焦點框)' }
    const cs = getComputedStyle(t)
    const w = parseFloat(cs.outlineWidth) || 0, off = parseFloat(cs.outlineOffset) || 0
    if (cs.outlineStyle === 'none' || w < 1) return { ok: false, missing: ['四邊'], detail: `沒有焦點框(outline ${cs.outlineStyle} ${cs.outlineWidth})` }
    if (off + w > 0.5) return { instrument: `焦點框往外畫(outline-offset ${off} + width ${w} > 0),本量法只量往內畫的框` }
    const b = t.getBoundingClientRect(), v = visibleX(t)
    const c = -(off + w / 2) // 框的中線在邊框內側幾 px(focus-ring-inset:offset −2、寬 2 → 1)
    const sides = { 上: [], 右: [], 下: [], 左: [] }
    for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const x = b.left + b.width * f, y = b.top + b.height * f
      sides.上.push([x, b.top + c]); sides.下.push([x, b.bottom - c]); sides.左.push([b.left + c, y]); sides.右.push([b.right - c, y])
    }
    const hits = ([x, y]) => { const h = document.elementFromPoint(x, y); return !!h && (h === t || t.contains(h)) }
    const missing = Object.entries(sides).filter(([, pts]) => !pts.every(hits)).map(([k]) => k)
    return { ok: missing.length === 0, missing, detail: `列鈕版面 ${r2(b.left)}–${r2(b.right)}、看得到 ${v.left}–${v.right}` }
  }
  return { err: `未知的 op:${op}` }
}

/** 頁面端:這顆列鈕的 Tooltip 開 / 關(waitForFunction 用;等元素本身,不固定睡) */
function tipState({ role, open }) {
  const t = document.querySelector(`[data-rail-probe="${role}"]`)
  const id = t?.getAttribute('aria-describedby')
  const node = id ? document.getElementById(id) : null
  if (open) return node?.getAttribute('role') === 'tooltip'
  return !node && !document.querySelector('[data-radix-popper-content-wrapper] [role="tooltip"]')
}

/** 頁面端:細列捲動區的直捲軸浮出來了(Radix hover 型:指標進入捲動區才掛上、data-state=visible) */
function railScrollbarShown() {
  const frame = [...document.querySelectorAll('[data-side][data-state]')].find((el) => !el.closest('[data-app-shell]') && el.querySelector('[data-sidebar="sidebar"]'))
  const vp = frame?.querySelector('[data-sidebar="content"] [data-radix-scroll-area-viewport]')
  return vp?.parentElement.querySelector(':scope > [data-orientation="vertical"]')?.getAttribute('data-state') === 'visible'
}

class RailInstrumentError extends Error {}

/**
 * 指標離開列鈕,等 Tooltip 關掉。Radix Tooltip 預設可以把指標移進提示本身(hoverable content):離開觸發點時先畫一塊「通往提示的緩衝區」,
 * **下一個** pointermove 落在緩衝區外才關 —— Playwright 的 mouse.move 只送一個事件,停在遠處也不會關(2026-10-27 修前建置實測,提示一直開著)。
 * 真人的指標會連續送事件,所以停好之後再挪 1px 補一個事件;5 秒還沒關 = 儀器失效(後面的鍵盤量測會量到這一個提示)。
 */
async function leaveAndWaitTipClosed(page, prefix, role) {
  const spot = await parkPointer(page)
  await page.mouse.move(spot.x + 1, spot.y + 1)
  const closed = await page.waitForFunction(tipState, { role, open: false }, { timeout: 5000 }).then(() => true, () => false)
  if (!closed) throw new RailInstrumentError(`${prefix}:${role}的 Tooltip 指標離開 5 秒後仍開著`)
  await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
}

/** R1–R4:細列(已收起)上的列鈕、Tooltip、焦點框。prefix = 格名前綴;tooltip = 這則的列鈕有沒有給 tooltip */
async function railCells(page, kind, prefix, tooltip) {
  const out = []
  const push = (label, ok, detail) => out.push({ ok, label: `${prefix}:${label}`, detail })
  const btns = await page.evaluate(railProbe, { kind, op: 'buttons' })
  if (btns.err) throw new RailInstrumentError(`${prefix}:${btns.err}`)
  if (btns.collapsible !== 'icon') return [{ ok: false, label: `${prefix}:R1–R4`, detail: `外框不是細列(data-collapsible=${btns.collapsible})` }]
  if (!btns.buttons.length) throw new RailInstrumentError(`${prefix}:細列上一顆列鈕都沒有`)
  const wide = btns.buttons.filter((b) => b.right - b.visRight > TOL || b.visLeft - b.left > TOL)
  push('R1 細列上每一顆列鈕的版面都在細列看得到的範圍內(看得到多寬,版面就多寬)', !wide.length,
    wide.length ? wide.map((b) => `「${b.label}」版面 ${b.left}–${b.right}、看得到 ${b.visLeft}–${b.visRight}`).join(';') : `${btns.buttons.length} 顆`)
  const { targets } = await page.evaluate(railProbe, { kind, op: 'mark' })
  if (!targets.length) throw new RailInstrumentError(`${prefix}:細列上找不到可量的列鈕`)
  for (const { role, label } of targets) {
    if (tooltip) {
      // R2:滑鼠停在列鈕看得到的那一段中心
      const pt = await page.evaluate(railProbe, { kind, op: 'point', role })
      await page.mouse.move(pt.x, pt.y)
      const opened = await page.waitForFunction(tipState, { role, open: true }, { timeout: 5000 }).then(() => true, () => false)
      if (opened) await settleAfterInteraction(page, { frames: SETTLE_FRAMES }) // 進場動畫(滑入 + 放大)跑完才量
      const tip = opened ? await page.evaluate(railProbe, { kind, op: 'tip', role }) : { open: false }
      push(`R2 滑鼠停在${role}「${label}」的 Tooltip:左緣 − 列鈕看得到的右緣 = ${OVERLAY_SIDE_OFFSET}`, tip.open && Math.abs(tip.left - tip.visRight - OVERLAY_SIDE_OFFSET) <= 1,
        tip.open ? `tooltip.left=${tip.left} 列鈕看得到的右緣=${tip.visRight} 列鈕版面右緣=${tip.right}` : '滑過 5 秒內沒打開 Tooltip')
      await leaveAndWaitTipClosed(page, prefix, role)
    }
    // R3 / R4:鍵盤聚焦(先按一下 Shift = 最近一次輸入是鍵盤,程式聚焦才會是 :focus-visible;聚焦後驗證,不是就算儀器失效)
    await page.keyboard.press('Shift')
    const f = await page.evaluate(railProbe, { kind, op: 'focus', role })
    if (f.err || !f.active || !f.focusVisible) throw new RailInstrumentError(`${prefix}:${role}聚焦失敗或不是 :focus-visible(${JSON.stringify(f)})`)
    await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
    if (tooltip) {
      const opened = await page.waitForFunction(tipState, { role, open: true }, { timeout: 5000 }).then(() => true, () => false)
      if (opened) await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
      const tip = opened ? await page.evaluate(railProbe, { kind, op: 'tip', role }) : { open: false }
      push(`R3 鍵盤聚焦${role}「${label}」的 Tooltip:左緣 − 列鈕看得到的右緣 = ${OVERLAY_SIDE_OFFSET}`, tip.open && Math.abs(tip.left - tip.visRight - OVERLAY_SIDE_OFFSET) <= 1,
        tip.open ? `tooltip.left=${tip.left} 列鈕看得到的右緣=${tip.visRight} 列鈕版面右緣=${tip.right}` : '聚焦 5 秒內沒打開 Tooltip')
    }
    const ring = await page.evaluate(railProbe, { kind, op: 'ring', role })
    if (ring.instrument || ring.err) throw new RailInstrumentError(`${prefix}:${role}:${ring.instrument ?? ring.err}`)
    push(`R4 鍵盤聚焦${role}「${label}」的焦點框四邊完整`, ring.ok, ring.ok ? ring.detail : `缺 ${ring.missing.join('、')}邊(${ring.detail})`)
    await page.evaluate(() => document.activeElement?.blur?.())
    if (tooltip && !(await page.waitForFunction(tipState, { role, open: false }, { timeout: 5000 }).then(() => true, () => false))) {
      throw new RailInstrumentError(`${prefix}:${role}的 Tooltip 失焦 5 秒後仍開著`)
    }
    await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  }
  return out
}

/** R5 / R6:細列內容比視窗高時滑過細列,直捲軸看得到、不蓋到圖示 */
async function scrollCells(page, prefix) {
  const s0 = await page.evaluate(railProbe, { kind: 'standalone', op: 'scroll' })
  if (s0.err) throw new RailInstrumentError(`${prefix}:${s0.err}`)
  if (!(s0.overflow >= 1)) throw new RailInstrumentError(`${prefix}:細列內容沒有比捲動區高(超出 ${s0.overflow}px),量不到捲軸`)
  await page.mouse.move(s0.point.x, s0.point.y)
  const shown = await page.waitForFunction(railScrollbarShown, null, { timeout: 3000 }).then(() => true, () => false)
  if (shown) await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  const s = await page.evaluate(railProbe, { kind: 'standalone', op: 'scroll' })
  const bar = s.bar
  const inside = !!bar && bar.left >= bar.visLeft - TOL && bar.right <= bar.visRight + TOL
  const out = []
  out.push({ ok: shown && inside && bar.hit && bar.thumbHeight > 0, label: `${prefix}:R5 滑過細列時直捲軸浮出、整條在細列看得到的範圍內、命中測試打得到`,
    detail: bar ? `捲軸 ${bar.left}–${bar.right}(${bar.state})、看得到 ${bar.visRight > bar.visLeft ? `${bar.visLeft}–${bar.visRight}` : '無(整條被裁掉)'}、滑塊高 ${bar.thumbHeight}、命中 ${bar.hit};內容超出 ${s.overflow}px` : `滑過 3 秒內沒有捲軸;內容超出 ${s.overflow}px` })
  const over = bar ? s.icons.filter((i) => bar.left < i.right - TOL && bar.right > i.left + TOL) : []
  out.push({ ok: !!bar && s.icons.length > 0 && !over.length, label: `${prefix}:R6 細列直捲軸那一欄不與任何圖示 / 頭像那一欄重疊`,
    detail: !bar ? '沒有捲軸' : over.length ? over.map((i) => `「${i.label}」${i.left}–${i.right} × 捲軸 ${bar.left}–${bar.right}`).join(';') : `${s.icons.length} 個圖示都在捲軸(${bar.left}–${bar.right})左邊` })
  await parkPointer(page)
  return out
}

function judge(story, step, m) {
  const near = (a, b) => Math.abs(a - b) <= TOL
  if (m.err) return [{ ok: false, label: `${story.id} ${step}`, detail: m.err }]
  const out = []
  const push = (label, ok, detail) => out.push({ ok, label: `${short(story.id)} ${step}:${label}`, detail })
  if (step === '收起') {
    push('data-state = collapsed', m.state === 'collapsed', `state=${m.state}`)
    if (story.mode === 'icon') {
      push(`外框寬 = --sidebar-width-icon(${m.tokenRail})`, near(m.width, m.tokenRail), `width=${m.width}`)
      push('細列上的選單項點得到(不 inert、不 aria-hidden、命中測試打得到)', !m.buttonInert && !m.buttonHidden && m.buttonHit, JSON.stringify({ button: m.button, inert: m.buttonInert, hidden: m.buttonHidden, hit: m.buttonHit }))
    } else {
      push('外框寬 = 0', near(m.width, 0), `width=${m.width}`)
      push('寬 0 時選單項 inert + aria-hidden', m.buttonInert && m.buttonHidden, JSON.stringify({ inert: m.buttonInert, hidden: m.buttonHidden }))
    }
  } else {
    push('data-state = expanded', m.state === 'expanded', `state=${m.state}`)
    push(`外框寬 = --sidebar-width(${m.tokenExpanded})`, near(m.width, m.tokenExpanded), `width=${m.width}`)
    push('選單項可操作', !m.buttonInert && !m.buttonHidden && m.buttonHit, JSON.stringify({ inert: m.buttonInert, hidden: m.buttonHidden, hit: m.buttonHit }))
  }
  return out
}

/** only:對照組只跑會讓指定斷言紅的那幾段(stories = 單獨使用的 story id;shell / scroll = 跑不跑 AppShell 細列 / 捲軸段) */
async function runPages(page, sv, sabotage, only = null) {
  const results = []
  const open = async (id, query = '') => {
    try {
      await openStory(page, `${sv.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${query}`, {
        settleFrames: SETTLE_FRAMES,
        notFound: sv.notFound,
        waitFor: '[data-sidebar="trigger"]',
        beforeSettle: sabotage ? async (p) => {
          if (sabotage.css) await p.addStyleTag({ content: sabotage.css })
          if (sabotage.script) await p.addScriptTag({ content: sabotage.script })
        } : null,
      })
      return true
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      console.error(`\n✗ ${id}:${error.message}`)
      return false
    }
  }
  try {
    await page.setViewportSize(DEFAULT_VIEWPORT)
    for (const story of STORIES) {
      if (only && !(only.stories ?? []).includes(story.id)) continue
      if (!(await open(story.id))) return { instrumentFail: true, results }
      for (const step of ['收起', '展開']) {
        await page.click('[data-sidebar="trigger"]')
        const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
        if (!settled.ok) { results.push({ ok: false, label: `${story.id} ${step}`, detail: '等不到版面靜止(儀器失效)' }); break }
        await page.mouse.move(0, 0)
        results.push(...judge(story, step, await page.evaluate(measure)))
        if (step === '收起' && story.mode === 'icon') results.push(...await railCells(page, 'standalone', `${short(story.id)} 收起`, story.tooltip))
      }
    }
    for (const rail of SHELL_RAILS) {
      if (only && !only.shell) continue
      if (!(await open(rail.id))) return { instrumentFail: true, results }
      await page.click('[data-sidebar="trigger"]')
      const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
      if (!settled.ok) { results.push({ ok: false, label: `${short(rail.id)} 收起`, detail: '等不到版面靜止(儀器失效)' }); continue }
      await parkPointer(page)
      results.push(...await railCells(page, 'shell', `${short(rail.id)} 收起`, rail.tooltip))
    }
    for (const c of SCROLL_CASES) {
      if (only && !only.scroll) continue
      await page.setViewportSize(c.viewport)
      if (!(await open(c.id, `&globals=${encodeURIComponent(`density:${c.density}`)}`))) return { instrumentFail: true, results }
      await page.click('[data-sidebar="trigger"]')
      const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
      const prefix = `${short(c.id)} ${c.viewport.width}×${c.viewport.height} ${c.density === 'lg' ? '寬鬆' : '標準'}密度 收起`
      if (!settled.ok) { results.push({ ok: false, label: prefix, detail: '等不到版面靜止(儀器失效)' }); continue }
      await parkPointer(page)
      results.push(...await scrollCells(page, prefix))
    }
  } catch (error) {
    if (!(error instanceof RailInstrumentError)) throw error
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}(量不到不等於沒問題)`)
    return { instrumentFail: true, results }
  } finally {
    await page.setViewportSize(DEFAULT_VIEWPORT)
  }
  return { instrumentFail: false, results }
}

// ── 對照組 (b):2026-10-14 的症狀、「拿掉 inert」、2026-05-21 → 10-27 的細列症狀與它的各個面 ──
const ICON_IDS = STORIES.filter((s) => s.mode === 'icon').map((s) => s.id)
const ICON_COLLAPSE = 'design-system-components-sidebar-展示--icon-collapse'
const redAt = (res, re) => res.some((r) => !r.ok && re.test(r.label))
const PAGE_SABOTAGE = [
  ['收起的外框寬釘回 --sidebar-width(2026-10-14 實際症狀)', { css: '[data-side][data-collapsible="icon"],[data-side][data-collapsible="offcanvas"]{width:var(--sidebar-width)!important}' },
    { stories: STORIES.map((s) => s.id) },
    (res) => STORIES.every((s) => res.some((r) => !r.ok && r.label.startsWith(short(s.id)) && /收起/.test(r.label)))],
  ['寬 0 那一份拿掉 inert', { script: `const strip = () => document.querySelectorAll('[data-side][data-collapsible="offcanvas"] [inert]').forEach((el) => el.removeAttribute('inert'))
    strip(); new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert'] })` },
    { stories: ['design-system-components-sidebar-展示--offcanvas'] },
    (res) => redAt(res, /展示--offcanvas 收起:寬 0 時選單項 inert/)],
  ['細列的內層釘回 --sidebar-width(2026-05-21 → 10-27 實際症狀:Tooltip 離細列 201px、焦點框缺右邊、捲軸畫在被裁掉的右緣)',
    { css: '[data-side][data-collapsible="icon"] [data-sidebar="sidebar"]{width:var(--sidebar-width)!important;min-width:var(--sidebar-width)!important}' },
    { stories: ICON_IDS, shell: true, scroll: true },
    (res) => [...ICON_IDS.map(short), ...SHELL_RAILS.map((s) => short(s.id))].every((p) => res.some((r) => !r.ok && r.label.startsWith(p) && /:R1 /.test(r.label)))
      && redAt(res, /:R2 /) && redAt(res, /:R3 /) && redAt(res, /:R4 /) && redAt(res, /:R5 /)],
  // `!pr-0` 的效果拿掉:捲動區的內容層(display: table)被列鈕最小寬 48 撐開,列鈕比看得到的 47 寬 1px。
  // 放在最前面的 @layer theme:Tailwind v4 的 `!pr-0` 是 utilities 層的 !important,而 !important 的層序是反的(越前面的層越強)
  ['細列列鈕的右內距放回 loose(拿掉 `!pr-0` 的效果:列鈕 48 > 看得到的 47)',
    { css: '@layer theme { [data-collapsible="icon"] [data-sidebar="menu-button"]{padding-right:var(--layout-space-loose)!important} }' },
    { stories: [ICON_COLLAPSE] },
    (res) => redAt(res, /展示--icon-collapse 收起:R1 /) && redAt(res, /展示--icon-collapse 收起:R4 鍵盤聚焦捲動區第一顆列鈕/)],
  ['Tooltip 外殼右移 4px', { css: '[data-radix-popper-content-wrapper]{margin-left:4px!important}' },
    { stories: [ICON_COLLAPSE] },
    (res) => redAt(res, /展示--icon-collapse 收起:R2 /) && redAt(res, /展示--icon-collapse 收起:R3 /)],
  ['細列捲軸 visibility:hidden(= 細列不出捲軸)', { css: '[data-collapsible="icon"] [data-radix-scroll-area-viewport] ~ [data-orientation="vertical"]{visibility:hidden!important}' },
    { scroll: true },
    (res) => redAt(res, /:R5 /)],
  ['細列捲軸加寬到 28px(蓋到圖示)', { css: '[data-collapsible="icon"] [data-radix-scroll-area-viewport] ~ [data-orientation="vertical"]{width:28px!important}' },
    { scroll: true },
    (res) => redAt(res, /:R6 /)],
]

// ── 跑 ──
const problems = []
if (SELFTEST) {
  const pre = selfGroupVariantSites(PRE_FIX_SNIPPET)
  if (pre.length === 1) console.log(`✓ 對照組 (a):2026-10-14 的 Sidebar 寫法被抓到(${pre[0].tokens.join(' ')})`)
  else problems.push(`對照組 (a):2026-10-14 的 Sidebar 寫法沒被抓到(${pre.length} 處)—— 靜態段無效`)
  for (const [name, red] of RED_SNIPPETS) {
    const v = selfGroupVariantSites(red)
    if (v.length) console.log(`✓ 對照組 (a):${name} → 抓到(${v[0].tokens.join(' ')})`)
    else problems.push(`對照組 (a):${name} 沒被抓到 —— 靜態段的廣度不夠`)
  }
  for (const clean of CLEAN_SNIPPETS) {
    const v = selfGroupVariantSites(clean)
    if (v.length) problems.push(`靜態段誤報乾淨寫法:${clean}`)
  }
  if (!problems.length) console.log(`✓ 乾淨寫法 ${CLEAN_SNIPPETS.length} 種都不誤報`)
} else {
  const st = staticScan()
  console.log(`${st.bad.length ? '✗' : '✓'} 靜態:元素自己帶 group / peer 又用 group-* / peer-* 變體(掃 ${st.files} 檔)${st.bad.length ? '\n    ' + st.bad.join('\n    ') : ''}`)
  if (st.bad.length) problems.push(`靜態段 ${st.bad.length} 處`)
}

requireFreshStorybookBuild(S, [
  'packages/design-system/src/components/Sidebar/sidebar.tsx',
  'packages/design-system/src/components/Sidebar/sidebar.stories.tsx',
  'packages/design-system/src/components/Sidebar/sidebar.anatomy.stories.tsx',
  'packages/design-system/src/components/AppShell/app-shell.tsx',
  'packages/design-system/src/components/AppShell/app-shell.stories.tsx',
  'packages/design-system/src/components/ScrollArea/scroll-area.tsx',
  'packages/design-system/src/components/Tooltip/tooltip.tsx',
])
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const br = await launchBrowserOrSkip({}, { cleanup: () => sv.stop() })
const page = await br.newPage({ viewport: DEFAULT_VIEWPORT })

if (!SELFTEST) {
  const run = await runPages(page, sv, null)
  if (run.instrumentFail) { await br.close(); await sv.stop(); process.exit(1) }
  // 綠的格也印量到的值(R1–R6 的數字是證據,不只是勾)
  for (const r of run.results) console.log(`${r.ok ? '✓' : '✗'} ${r.label}${r.ok && !/:R\d /.test(r.label) ? '' : ` | ${r.detail}`}`)
  const failed = run.results.filter((r) => !r.ok).length
  if (failed) problems.push(`頁面段 ${failed} 格不符`)
} else {
  // 前提:未破壞的頁面本身全綠(否則對照組紅了也不代表什麼)
  const base = await runPages(page, sv, null)
  if (base.instrumentFail) { await br.close(); await sv.stop(); process.exit(1) }
  const baseBad = base.results.filter((r) => !r.ok)
  if (baseBad.length) problems.push(`前提不成立:未破壞的頁面就有 ${baseBad.length} 格不符(${baseBad[0].label})`)
  for (const [name, sabotage, only, isRed] of PAGE_SABOTAGE) {
    const run = await runPages(page, sv, sabotage, only)
    if (run.instrumentFail) { await br.close(); await sv.stop(); process.exit(1) }
    if (isRed(run.results)) console.log(`✓ 對照組 (b)「${name}」→ 指定的斷言紅(${run.results.filter((r) => !r.ok).length} 格)`)
    else problems.push(`對照組 (b)「${name}」沒讓指定的斷言紅 —— 量具無效(紅的格:${run.results.filter((r) => !r.ok).map((r) => r.label).join(' / ') || '無'})`)
  }
}
await br.close(); await sv.stop()
if (problems.length) { console.log(`\n✗ ${SELFTEST ? 'selftest' : '單獨使用的 Sidebar 收合'}:\n  ${problems.join('\n  ')}`); process.exit(1) }
console.log(SELFTEST
  ? `\n✓ selftest:靜態對照組與 ${PAGE_SABOTAGE.length} 種頁面破壞各自讓閘紅 —— 量具會紅`
  : `\n✅ 單獨使用的 Sidebar:${STORIES.length} 則 story 收起 / 展開的寬度與可操作性、細列(含 AppShell ${SHELL_RAILS.length} 則)的列鈕版面 / Tooltip 間距 / 焦點框四邊、細列捲軸(${SCROLL_CASES.length} 種組合)都符合、靜態段 0 違規`)
process.exit(0)
