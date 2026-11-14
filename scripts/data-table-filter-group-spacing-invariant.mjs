#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable 篩選面板的「標題列 → 第一個東西」與巢狀群組的間距照 data-table.spec.md「L4 › 四、UI canonical」的「巢狀群組的間距」:
 *           T  巢狀面板(`mode="nested"`)標題列底 → 第一個灰底群組頂 = 面板 body 讀到的 --layout-space-loose
 *              (群組框有底色、外框完整 = bounded region → loose,layoutSpace.spec.md 規則 2 表第 1 列;依據 = user 2026-11-14 在 A5 成品頁的留言 ① 的原則
 *              (大意:第一個元素有完整的形狀邊界,上與左右才會對稱;逐字見本段檔頭最後的「出處」),套到這一處是【AI 推導 2026-11-14】)。
 *              【更正 2026-11-14】2026-11-13(A5)寫成「群組不是 bounded region → tight」,那一句拿掉,本段期望值由 tight 改 loose。
 *           F  平鋪面板(`mode="flat"`,根層第一個是條件列)標題列底 → 第一列條件頂 = 那個面板 body 讀到的 --layout-space-tight(條件列 = element)。
 *              型別上巢狀模式的根層只放群組(filter-tree.ts 的 FilterTreeNested.children: FilterGroup[]),「根層第一個是條件列」就是平鋪模式 ——
 *              同一則 story 的第一個面板「已填條件」。
 *           E  巢狀面板按「清除全部」把群組清光、只剩「加入篩選器」那一排 → 標題列底 → 那一排頂 = tight(第一個東西是按鈕列 = element;
 *              證明上內距照「第一個東西是什麼」給,不是照 mode 給)。頁面上就地按那個面板自己的「清除全部」造出這個狀態(story 沒有現成的這一格)。
 *           B  巢狀面板最後一排(「加入篩選器」那一排按鈕)→ 面板底 = 與頂部同值(layoutSpace.spec.md 規則 4 表第 4 列:element → 容器底,
 *              容器不擋頁面、高度貼著內容 = 與頂部同值,上下對稱):群組在前 = loose(跟 T 一起 = 上下都 loose)、群組清光後 = tight(跟 E 一起)。
 *              2026-11-14 驗證抓到:A70 第一版只把上內距改成 loose、底留 tight(一般 上 16 下 12 / 大 上 24 下 16),上下不對稱,當時沒有任何閘量這個底。
 *              收尾內距的量法、容器種類(classifyBox)、規則 4 的期望值(bottomWant)都借 header-content-sides-invariant.mjs(probeSides)——
 *              同一種量法只有一個住所;登記:最後一個東西 = element、容器 = hug(DOM 判出的不一樣 → 紅,照規則 4 重推)。
 *           P  群組框四邊內距 = 8(框內第一條條件 / 最後一排「加入巢狀篩選」到框的四邊);
 *           R  框內列距 = 8(條件 ↔ 條件、最後一條 → 「加入巢狀篩選」那一排);
 *           L  框外左邊 Where / And / Or 標籤的頂 = 框內第一條條件的頂(標籤包層的上內距 8 = 框的上內距);
 *           G  群組 ↔ 群組 = 面板 body 讀到的 --layout-space-tight;
 *           D  框內的 8(P、R)一般 / 大兩種密度同值(元件內部固定值,不跟密度);頁面根的 loose 兩種密度必須不同(密度有套上,否則儀器失效)。
 *           不保證(沒有量):「這段距離只由容器那一層給」(layoutSpace.spec.md 規則 4「同一段距離只由一層給:容器給內距,元件不再加外距去推容器」)。
 *           T / F / E 量的是看得見的距離(標題列底 → 第一個東西頂);body 上內距 12 + 群組框外距 4 這種兩層湊出 16 的寫法,本閘會綠。
 *           現況是 SurfaceBody 的上內距一層給(data-table-filter-panel.tsx 那一行,讀程式確認);要機械守住得另加一段量 body 的 computed
 *           上內距與第一個子元素的外距(2026-11-14 驗證抓到這一句原本寫成「保證」,改成照實寫;補量法另列待辦)。
 *   紅: 任一段與期望值差 > 0.5px → 指名密度 / 哪一個群組 / 哪一段 / 數字並 exit 1。
 *       `--selftest`:(a) 判定表(純函式 judge)—— 每一段各有該紅、該綠、儀器失效;(b) 真建置上先量一趟現況(必綠),再逐一在頁面上拆掉一段
 *       (群組框內距改 12 / 框內列距改 12 / 第一個群組往下推 4px / 巢狀面板上內距改回 tight(A5 的樣子)/ 平鋪面板上內距改成 loose /
 *       群組清光後上內距仍是 loose(只看 mode)/ 巢狀面板下內距留在 tight(A70 第一版的樣子)/ 群組清光後下內距仍是 loose /
 *       標籤上內距歸零 / 第二個群組往下推 4px / 框內距改成跟密度走),
 *       每一種必須紅在它負責的那一段 —— 少一種沒紅 = 量具沒在量它宣稱的東西 → exit 1。
 *   綠: 現況每一段都等於期望值,md / lg 兩種密度。純幾何(getBoundingClientRect / computed token),等群組框本身出現、動畫跑完才量;重複跑恆等。
 *   量法(M32:量像素,不看 class): 靜態站開 DataTable 展示「篩選面板的各種狀態」(globals density),等 `[data-panel-filter-group]`(GroupBlock 的灰底框,
 *         data-table-filter-group.tsx)本身出現、`document.getAnimations()` 沒有跑動中的動畫。巢狀面板 = 第一個「body 裡有 ≥ 2 個群組框」的 SurfaceBody
 *         (`[data-slot="surface-body"]`)與同一個外殼裡的 SurfaceHeader;平鋪面板 = 頁面上第一個 body 裡沒有群組框的 SurfaceBody;
 *         群組框的子元素 = 條件列 … +「加入巢狀篩選」那一排(最後一個)。「第一個東西」= body 裡第一個看得見、在流裡的子元素(絕對定位的播報區不算)。
 *         至少要量到 2 個群組、其中一個有 ≥ 2 條條件(才量得到 G 與「條件 ↔ 條件」);範例若改到量不到 = 儀器失效,不讀成通過。
 *         E:量完上面各段後,按巢狀面板「加篩選」那一排的第二顆鈕(清除全部),等那個 body 裡的群組框本身消失、動畫跑完、指標移開才量。
 *         B:清光前、清光後各量一次,用姊妹閘的 probeSides(標頭 = 巢狀面板自己的 SurfaceHeader,以它在頁面上看得見的標頭裡排第幾個指定,
 *         並確認 probeSides 從那個標頭找到的那一塊就是巢狀面板的 body);收尾內距 = 最後一個東西往上加總每層下內距 / 框線 / 外距,不受捲動位置影響。
 *         找不到群組框(例:定位屬性加上之前的建置)/ 找不到平鋪面板 / 清除全部按不到或按了群組沒消失 / B 找不到標頭或找到別的面板 = 儀器失效。
 *   `--static=<dir>` 指定建置(對照組用);指定時不跑新鮮度守衛。
 *
 * 出處:tmp wip MASTER-TODO A5「五處元件間距」之 ⑤(篩選條件群組頂部;2026-11-13 補規格句與這支閘,當時判「現況已符合、畫面不動」)與
 * A70(2026-11-14:user 在 A5 成品頁的留言 ① 「我覺得原本才是比較美觀的，且當初也是有特意把第一則訊息頂改成 16,主因為第一個元素是有完整的形狀邊界的，
 * 改成16之後其上左右才會在視覺上對稱，就像表格為第一個元素時上方也是 loose ，因為通常其左右也是 loose,其他密度也是依此類推吧？關於煮內容區的第一個元素與上方的距離，
 * 你看我說的是否有理」—— 那則留言貼在 AgentPanel 那張圖;同一個原則套到這裡的灰底群組框是【AI 推導 2026-11-14】,畫面由 tight 改 loose)。
 * 平鋪那一格的 tight 另由 header-first-gap-invariant.mjs 的 datatable-filter-panel 守(「進階篩選 — 空狀態」那則);本閘守巢狀那則、同一則裡的平鋪面板、
 * 群組清光的狀態與群組框內的固定值。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
// B(收尾內距)借姊妹閘的量具與規則 4 的期望值 —— 同一種量法只有一個住所(本檔不另寫一份「最後一個東西 → 容器底」)
import { classifyFirst, installPageKit } from './header-first-gap-invariant.mjs'
import { FOLLOW_STEP, bottomWant, classifyBox, probeSides } from './header-content-sides-invariant.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const STORY = 'design-system-components-datatable-展示--filter-panel-states'
const GROUP = '[data-panel-filter-group]'
const NESTED_BODY = `[data-slot="surface-body"]:has(${GROUP})`
const SURFACE_HEADER = '[data-slot="surface-header"]'
/** B 的登記(清光前後都一樣):最後一個東西 =「加入篩選器」那一排按鈕 = element;面板不擋頁面、高度貼著內容 = hug(規則 4 表第 4 列)。 */
const END_DECLARED = { last: 'element', box: 'hug' }
const DENSITIES = ['md', 'lg']
const TOL = 0.5
/** 群組框內的固定值(data-table.spec.md「巢狀群組的間距」:四邊內距 8、框內列距 8;元件內部固定,不跟密度)。 */
const GROUP_INNER = 8
const SOURCES = [
  'packages/design-system/src/components/DataTable/data-table-filter-group.tsx',
  'packages/design-system/src/components/DataTable/data-table-filter-panel.tsx',
  'packages/design-system/src/components/DataTable/data-table.stories.tsx',
  'packages/design-system/src/patterns/overlay-surface/overlay-surface.tsx',
  'packages/design-system/src/tokens/layoutSpace/layoutSpace.css',
]

const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= TOL

/**
 * 純函式(B):一次收尾量測 → 訊息清單。end = { err? } 或 probeSides 量到的 { bottom, top, scrolled, last, box, lastDesc, loose, tight, bottomToken, grow, free }
 * (last / box 已由 classifyFirst / classifyBox 判好);期望值一律由姊妹閘的 bottomWant 算(規則 4 表,單一住所)。what = 訊息裡的稱呼。
 */
export function judgeEnd(where, what, end) {
  if (!end) return [`${INSTRUMENT_FAIL_MARKER}:${where} ${what}沒有量收尾(B 不准默默跳過)`]
  if (end.err) return [`${INSTRUMENT_FAIL_MARKER}:${where} ${what}量收尾:${end.err}`]
  if (!(end.loose > 0) || !(end.tight > 0) || !(end.bottomToken > 0)) return [`${INSTRUMENT_FAIL_MARKER}:${where} ${what}量收尾時讀不到 --layout-space-loose / tight / bottom`]
  // 「與頂部同值」拿頂當期望值:頂只在捲在最上面時才量得到(姊妹閘同一個前提)
  if (!Number.isFinite(end.scrolled) || end.scrolled > TOL) return [`${INSTRUMENT_FAIL_MARKER}:${where} ${what}量收尾時沒有捲在最上面(捲動位置 ${end.scrolled}),頂 ${end.top}px 不能拿來當期望值`]
  if (![end.bottom, end.top].every(Number.isFinite) || !end.last || !end.box) return [`${INSTRUMENT_FAIL_MARKER}:${where} ${what}沒量到收尾 / 頂 / 最後一個東西的角色 / 容器種類(底 ${end.bottom} / 頂 ${end.top} / 最後 ${end.last} / 容器 ${end.box}:內容加高 ${FOLLOW_STEP}px 容器長 ${end.grow})`]
  const out = []
  if (end.last !== END_DECLARED.last) out.push(`[B] ${where} ${what}最後一個東西的角色 = ${end.last}(${end.lastDesc ?? '?'}),登記的是 ${END_DECLARED.last} —— 內容換了,照規則 4 重推底距`)
  if (end.box !== END_DECLARED.box) out.push(`[B] ${where} ${what}容器種類 = ${end.box}(內容加高 ${FOLLOW_STEP}px 容器長 ${end.grow ?? '?'}、多出來的空白 ${end.free ?? '?'}px),登記的是 ${END_DECLARED.box} —— 照規則 4 第 1 / 4 列重推`)
  const { want, rule } = bottomWant({ last: end.last, box: end.box, top: end.top }, { loose: end.loose, tight: end.tight, bottom: end.bottomToken })
  if (!Number.isFinite(want)) return [...out, `${INSTRUMENT_FAIL_MARKER}:${where} ${what}底的期望值算不出來(${rule})`]
  if (Math.abs(end.bottom - want) > TOL) out.push(`[B] ${where} ${what}最後一排 → 面板底 = ${end.bottom}px,應 ${want}(${rule};最後一個東西 = ${end.lastDesc ?? '?'})`)
  return out
}

/**
 * 純函式:[{ density, err?, tight, loose, rootLoose, headerToGroup, groupGaps: number[], groups: [{ pad: { top, right, bottom, left }, rowGaps: number[], labelDelta, conditions }],
 *          flatTight, flatHeaderToRow, clearedHeaderToRow, clearedFirst, nestedEnd, clearedEnd }](nestedEnd / clearedEnd 見 judgeEnd)
 * → 不符合的訊息清單(呼叫端與 selftest 共用)。訊息開頭的 [T] / [F] / [E] / [B] / [P] / [R] / [L] / [G] / [D] = 檔頭契約的那一段。
 */
export function judge(rows) {
  const failures = []
  const inner = {}
  for (const r of rows) {
    const where = `@${r.density}`
    if (r.err) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} ${r.err}`); continue }
    if (!(r.tight > 0) || !(r.loose > 0) || !(r.rootLoose > 0) || !(r.flatTight > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-tight / loose(巢狀 / 平鋪面板 body)/ 頁面根的 --layout-space-loose`); continue }
    if (!Array.isArray(r.groups) || r.groups.length < 2 || !r.groups.some((g) => g.conditions >= 2)) {
      failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 巢狀面板要量到 ≥ 2 個群組、其中一個有 ≥ 2 條條件(量到 ${r.groups?.length ?? 0} 個群組、條件數 ${JSON.stringify((r.groups ?? []).map((g) => g.conditions))})—— 範例換了,量不到「群組 ↔ 群組」或「條件 ↔ 條件」`)
      continue
    }
    const measured = [r.headerToGroup, r.flatHeaderToRow, r.clearedHeaderToRow, ...r.groupGaps, ...r.groups.flatMap((g) => [g.pad.top, g.pad.right, g.pad.bottom, g.pad.left, g.labelDelta, ...g.rowGaps])]
    if (!measured.every(Number.isFinite) || r.groupGaps.length !== r.groups.length - 1 || r.groups.some((g) => g.rowGaps.length < 1)) {
      failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 有一段沒量到(巢狀標題列 → 群組 ${r.headerToGroup}、平鋪標題列 → 條件列 ${r.flatHeaderToRow}、清光後標題列 → 按鈕列 ${r.clearedHeaderToRow}、群組間 ${JSON.stringify(r.groupGaps)}、群組 ${JSON.stringify(r.groups)})`)
      continue
    }
    if (!near(r.headerToGroup, r.loose)) failures.push(`[T] ${where} 巢狀面板標題列底 → 第一個群組頂 = ${r.headerToGroup}px,應 ${r.loose}(群組框有底色、外框完整 = bounded region → loose;layoutSpace 規則 2 表、data-table.spec.md「巢狀群組的間距」)`)
    if (!near(r.flatHeaderToRow, r.flatTight)) failures.push(`[F] ${where} 平鋪面板標題列底 → 第一列條件頂 = ${r.flatHeaderToRow}px,應 ${r.flatTight}(根層第一個是條件列 = element → tight;上內距照第一個東西給,不是一律 loose)`)
    if (!near(r.clearedHeaderToRow, r.tight)) failures.push(`[E] ${where} 巢狀面板群組清光後,標題列底 → ${r.clearedFirst ?? '第一個東西'}頂 = ${r.clearedHeaderToRow}px,應 ${r.tight}(只剩「加入篩選器」那一排按鈕 = element → tight;上內距照第一個東西給,不是照 mode 給)`)
    // B:收尾 = 與頂部同值(規則 4 表第 4 列)—— 群組在前(上 loose)與清光後(上 tight)各一次
    failures.push(...judgeEnd(where, '巢狀面板(群組在前)', r.nestedEnd), ...judgeEnd(where, '巢狀面板群組清光後', r.clearedEnd))
    r.groups.forEach((g, i) => {
      const who = `${where} 第 ${i + 1} 個群組`
      const pads = [['上', g.pad.top], ['右', g.pad.right], ['下', g.pad.bottom], ['左', g.pad.left]]
      const badPad = pads.filter(([, v]) => !near(v, GROUP_INNER))
      if (badPad.length) failures.push(`[P] ${who} 框的內距 ${pads.map(([s, v]) => `${s} ${v}`).join(' / ')}px,應四邊 ${GROUP_INNER}(元件內部固定值;不對的:${badPad.map(([s]) => s).join('、')})`)
      const badGap = g.rowGaps.filter((v) => !near(v, GROUP_INNER))
      if (badGap.length) failures.push(`[R] ${who} 框內列距 ${g.rowGaps.join(' / ')}px,應每一段 ${GROUP_INNER}(條件 ↔ 條件、最後一條 → 「加入巢狀篩選」)`)
      if (!near(g.labelDelta, 0)) failures.push(`[L] ${who} 框外標籤的頂比框內第一條條件的頂${g.labelDelta > 0 ? '低' : '高'} ${Math.abs(g.labelDelta)}px,應齊平(標籤包層的上內距 = 框的上內距 ${GROUP_INNER})`)
      ;(inner[i] ??= []).push({ density: r.density, values: [g.pad.top, g.pad.right, g.pad.bottom, g.pad.left, ...g.rowGaps] })
    })
    r.groupGaps.forEach((v, i) => { if (!near(v, r.tight)) failures.push(`[G] ${where} 第 ${i + 1} 個群組 → 第 ${i + 2} 個群組 = ${v}px,應 ${r.tight}(面板 body 的塊距 tight;有底色的獨立框之間必留間距)`) })
  }
  // [D] 框內的固定值不跟密度:同一個群組兩種密度量到的內距 / 列距逐項相同
  for (const [i, perDensity] of Object.entries(inner)) {
    if (perDensity.length < 2) continue
    const [a, b] = perDensity
    if (a.values.length !== b.values.length || a.values.some((v, k) => !near(v, b.values[k]))) failures.push(`[D] 第 ${Number(i) + 1} 個群組框內的內距 / 列距兩種密度不同(${a.density}:${a.values.join(' / ')};${b.density}:${b.values.join(' / ')})—— 這幾個值是元件內部固定值,不跟密度`)
  }
  // 密度有沒有套上看頁面根:兩種密度讀到同一個 loose = 兩趟量的是同一個畫面 = 儀器失效
  const looses = rows.filter((r) => !r.err && r.rootLoose > 0).map((r) => r.rootLoose)
  if (looses.length === DENSITIES.length && new Set(looses).size === 1) failures.push(`${INSTRUMENT_FAIL_MARKER}:兩種密度在頁面根讀到同一個 loose(${looses[0]})—— 密度沒套上`)
  return failures
}

/** 頁面函式:量巢狀面板的每一段 + 同一頁的平鋪面板(不得引用外層變數)。 */
export const probeGroups = ({ groupSelector }) => {
  const r1 = (x) => Math.round(x * 10) / 10
  const rect = (el) => el.getBoundingClientRect()
  const vis = (el) => { const r = rect(el); return r.width > 0 && r.height > 0 }
  const all = [...document.querySelectorAll(groupSelector)].filter(vis)
  if (!all.length) return { err: `找不到看得見的群組框 ${groupSelector}` }
  // 面板 = 第一個「body 裡有 ≥ 2 個群組框」的 SurfaceBody;同一個外殼裡的 SurfaceHeader(往上找到第一個含標題列的祖先)
  const bodies = [...new Set(all.map((g) => g.closest('[data-slot="surface-body"]')))].filter(Boolean)
  const body = bodies.find((b) => all.filter((g) => b.contains(g)).length >= 2) ?? bodies[0]
  if (!body) return { err: '群組框不在任何 SurfaceBody 裡' }
  const headerOf = (b) => { let shell = b.parentElement; while (shell && !shell.querySelector('[data-slot="surface-header"]')) shell = shell.parentElement; return shell?.querySelector('[data-slot="surface-header"]') ?? null }
  const header = headerOf(body)
  if (!header) return { err: '找不到這個面板的標題列(SurfaceHeader)' }
  const groups = all.filter((g) => body.contains(g))
  const num = (el, p) => parseFloat(getComputedStyle(el)[p]) || 0
  const token = (el, name) => parseFloat(getComputedStyle(el).getPropertyValue(name))
  const flow = (el) => [...el.children].filter((c) => { const cs = getComputedStyle(c); return cs.display !== 'none' && !/(absolute|fixed)/.test(cs.position) && vis(c) })
  // 平鋪面板(根層第一個是條件列):頁面上第一個 body 裡沒有群組框的 SurfaceBody(「已填條件」)
  const flatBody = [...document.querySelectorAll('[data-slot="surface-body"]')].find((b) => vis(b) && !b.querySelector(groupSelector))
  const flatHeader = flatBody ? headerOf(flatBody) : null
  const flatFirst = flatBody ? flow(flatBody)[0] : null
  const out = {
    tight: token(body, '--layout-space-tight'), loose: token(body, '--layout-space-loose'),
    rootLoose: token(document.querySelector('#storybook-root') ?? document.documentElement, '--layout-space-loose'),
    headerToGroup: r1(rect(groups[0]).top - rect(header).bottom),
    flatTight: flatBody ? token(flatBody, '--layout-space-tight') : NaN,
    flatHeaderToRow: flatHeader && flatFirst ? r1(rect(flatFirst).top - rect(flatHeader).bottom) : NaN,
    groupGaps: groups.slice(1).map((g, i) => r1(rect(g).top - rect(groups[i]).bottom)),
    groups: groups.map((g) => {
      const kids = flow(g)
      const gr = rect(g)
      const inner = { top: gr.top + num(g, 'borderTopWidth'), right: gr.right - num(g, 'borderRightWidth'), bottom: gr.bottom - num(g, 'borderBottomWidth'), left: gr.left + num(g, 'borderLeftWidth') }
      const first = kids[0], last = kids[kids.length - 1]
      const label = g.previousElementSibling?.firstElementChild ?? null
      return {
        conditions: Math.max(0, kids.length - 1),
        pad: first ? { top: r1(rect(first).top - inner.top), right: r1(inner.right - Math.max(...kids.map((k) => rect(k).right))), bottom: r1(inner.bottom - rect(last).bottom), left: r1(Math.min(...kids.map((k) => rect(k).left)) - inner.left) } : { top: NaN, right: NaN, bottom: NaN, left: NaN },
        rowGaps: kids.slice(1).map((k, i) => r1(rect(k).top - rect(kids[i]).bottom)),
        labelDelta: label && first ? r1(rect(label).top - rect(first).top) : NaN,
      }
    }),
  }
  if (!flatBody) out.flatErr = '找不到平鋪面板(body 裡沒有群組框的 SurfaceBody)'
  return out
}

/** 頁面函式(E):群組清光之後,那個 body 的標題列底 → 第一個看得見、在流裡的子元素頂。b = 巢狀面板的 SurfaceBody(按清除全部之前抓的同一個元素)。 */
export const probeCleared = (b) => {
  const r1 = (x) => Math.round(x * 10) / 10
  const rect = (el) => el.getBoundingClientRect()
  let shell = b.parentElement
  while (shell && !shell.querySelector('[data-slot="surface-header"]')) shell = shell.parentElement
  const header = shell?.querySelector('[data-slot="surface-header"]')
  if (!header) return { err: '群組清光後找不到這個面板的標題列' }
  const first = [...b.children].find((c) => { const cs = getComputedStyle(c); const r = rect(c); return cs.display !== 'none' && !/(absolute|fixed)/.test(cs.position) && r.width > 0 && r.height > 0 })
  if (!first) return { err: '群組清光後 body 裡沒有看得見的東西' }
  return { clearedHeaderToRow: r1(rect(first).top - rect(header).bottom), clearedFirst: `<${first.tagName.toLowerCase()}${first.hasAttribute('data-panel-add-row') ? ' data-panel-add-row' : ''}>`, tight: parseFloat(getComputedStyle(b).getPropertyValue('--layout-space-tight')) }
}

const noRunningAnimation = () => document.getAnimations().every((a) => a.playState !== 'running')

/**
 * 頁面上拆掉一段(--selftest (b))。each = [說明, 該紅的那一段, 頁面函式, 何時套]。
 * 'open' = 量巢狀 / 平鋪之前,頁面函式收到群組框選擇器(page.evaluate(fn, 選擇器));
 * 'cleared' = 群組清光之後、量 E 之前,頁面函式收到巢狀面板的 body 元素本身(elementHandle.evaluate(fn) —— 清光之後選擇器已經找不到它)。
 */
const MUTATIONS = [
  ['群組框內距改 12', 'P', (sel) => { for (const g of document.querySelectorAll(sel)) g.style.setProperty('padding', '12px', 'important') }, 'open'],
  ['框內列距改 12', 'R', (sel) => { for (const g of document.querySelectorAll(sel)) g.style.setProperty('row-gap', '12px', 'important') }, 'open'],
  ['第一個群組往下推 4px', 'T', (sel) => { const g = document.querySelector(sel); if (g) g.parentElement.style.setProperty('margin-top', '4px', 'important') }, 'open'],
  ['巢狀面板 body 上內距改回 tight(A5 的樣子)', 'T', (sel) => { const b = document.querySelector(sel)?.closest('[data-slot="surface-body"]'); if (b) b.style.setProperty('padding-top', 'var(--layout-space-tight)', 'important') }, 'open'],
  ['平鋪面板 body 上內距改成 loose(一律給 loose)', 'F', (sel) => { const b = [...document.querySelectorAll('[data-slot="surface-body"]')].find((x) => !x.querySelector(sel)); if (b) b.style.setProperty('padding-top', 'var(--layout-space-loose)', 'important') }, 'open'],
  ['群組清光後上內距仍是 loose(只看 mode、不看第一個東西)', 'E', (b) => { b.style.setProperty('padding-top', 'var(--layout-space-loose)', 'important') }, 'cleared'],
  ['巢狀面板 body 下內距留在 tight(上 loose 下 tight —— A70 第一版的樣子)', 'B', (sel) => { const b = document.querySelector(sel)?.closest('[data-slot="surface-body"]'); if (b) b.style.setProperty('padding-bottom', 'var(--layout-space-tight)', 'important') }, 'open'],
  ['群組清光後下內距仍是 loose(只看 mode)', 'B', (b) => { b.style.setProperty('padding-bottom', 'var(--layout-space-loose)', 'important') }, 'cleared'],
  ['標籤包層的上內距歸零', 'L', (sel) => { for (const g of document.querySelectorAll(sel)) g.previousElementSibling?.style.setProperty('padding-top', '0px', 'important') }, 'open'],
  ['第二個群組往下推 4px', 'G', (sel) => { const g = document.querySelectorAll(sel)[1]; if (g) g.parentElement.style.setProperty('margin-top', '4px', 'important') }, 'open'],
  ['框內距改成跟密度走(--layout-space-tight)', 'D', (sel) => { for (const g of document.querySelectorAll(sel)) g.style.setProperty('padding', 'var(--layout-space-tight)', 'important') }, 'open'],
]

/**
 * B:量巢狀面板的收尾(姊妹閘 probeSides)。body = 巢狀面板的 SurfaceBody(elementHandle);標頭以「它在頁面上看得見的 SurfaceHeader 裡排第幾個」交給 probeSides,
 * 並確認 probeSides 從那個標頭找到的那一塊就是這個 body —— 找到別的面板 = 儀器失效(不拿別的面板的底判這一個)。
 */
async function measureEnd(page, body) {
  await installPageKit(page)
  const at = await body.evaluate((b, sel) => {
    const K = window.__layoutKit
    let shell = b.parentElement
    while (shell && !shell.querySelector(sel)) shell = shell.parentElement
    const h = shell?.querySelector(sel) ?? null
    const nth = h ? [...document.querySelectorAll(sel)].filter((el) => K.vis(el)).indexOf(h) : -1
    return { nth, same: nth >= 0 && K.findBody(K.findHeader(sel, null, nth)) === b }
  }, SURFACE_HEADER)
  if (at.nth < 0) return { err: '找不到巢狀面板的標題列(SurfaceHeader)' }
  if (!at.same) return { err: `從第 ${at.nth} 個 SurfaceHeader 往下找到的那一塊不是巢狀面板的 body` }
  const r = await page.evaluate(probeSides, { header: SURFACE_HEADER, nth: at.nth, followStep: FOLLOW_STEP })
  if (r.err) return r
  const { lastF, firstF, ...rest } = r
  return { ...rest, last: classifyFirst(lastF), box: classifyBox(rest) }
}

/** 一種密度量一趟:巢狀 + 平鋪 → 量 B(群組在前)→ 按巢狀面板的「清除全部」→ 量 E 與 B(清光後)。mutation = MUTATIONS 的一列(只給 --selftest (b))。 */
async function measureDensity(page, server, density, mutation) {
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story&globals=${encodeURIComponent(`theme:light;density:${density}`)}`
  await openStory(page, url, { waitFor: GROUP, label: STORY, notFound: server.notFound })
  await page.mouse.move(0, 0)
  try { await page.waitForFunction(noRunningAnimation, null, { timeout: 10_000 }) } catch { return { err: '10 秒內動畫沒跑完' } }
  // 按清除全部之前先抓住巢狀面板的 body(清光之後它就不再「含群組框」,選擇器找不到它)
  const nested = await page.locator(NESTED_BODY).first().elementHandle()
  if (!nested) return { err: `找不到巢狀面板的 body(${NESTED_BODY})` }
  if (mutation?.[3] === 'open') await page.evaluate(mutation[2], GROUP)
  const row = await page.evaluate(probeGroups, { groupSelector: GROUP })
  if (row.err) return row
  if (row.flatErr) return { err: row.flatErr }
  // B(群組在前):清光之前量收尾
  row.nestedEnd = await measureEnd(page, nested)
  // E:按巢狀面板「加篩選」那一排的第二顆鈕(清除全部),等那個 body 裡的群組框本身消失
  const clear = await nested.$('[data-panel-add-row] > button:nth-of-type(2)')
  if (!clear) return { ...row, err: '巢狀面板「加篩選」那一排沒有第二顆鈕(清除全部)—— 造不出「群組清光」的狀態' }
  await clear.click()
  // 等的是那個 body 裡的群組框本身消失(不睡固定時間)
  try { await page.waitForFunction(([b, sel]) => !b.querySelector(sel), [nested, GROUP], { timeout: 10_000 }) } catch { return { ...row, err: '按了清除全部,10 秒內巢狀面板的群組框沒有消失' } }
  await page.mouse.move(0, 0)
  try { await page.waitForFunction(noRunningAnimation, null, { timeout: 10_000 }) } catch { return { ...row, err: '群組清光後 10 秒內動畫沒跑完' } }
  if (mutation?.[3] === 'cleared') await nested.evaluate(mutation[2])
  const cleared = await nested.evaluate(probeCleared)
  if (cleared.err) return { ...row, err: cleared.err }
  // B(群組清光後):同一個 body、同一支量具
  const clearedEnd = await measureEnd(page, nested)
  return { ...row, clearedHeaderToRow: cleared.clearedHeaderToRow, clearedFirst: cleared.clearedFirst, clearedEnd }
}

/** 起一個靜態站 + 一個瀏覽器分頁給 fn 用(現況與 --selftest 的每一種拆法共用同一個;每一趟都重新開 story,前一趟套上的拆法不會留下來)。 */
async function withPage(fn) {
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    return await fn(page, server)
  } finally { await browser.close(); await server.stop() }
}

/** 兩種密度各量一趟(mutation 只給 --selftest (b))。 */
async function measure(page, server, mutation = null) {
  const rows = []
  for (const density of DENSITIES) rows.push({ density, ...(await measureDensity(page, server, density, mutation)) })
  return rows
}

const endText = (e) => (!e ? '沒量' : e.err ? e.err : `頂 ${e.top} 底 ${e.bottom}(最後 ${e.last}、${e.box})`)
const describe = (r) => (r.err ? `  @${r.density}  ${r.err}` : `  @${r.density}  巢狀:標題列 → 群組 ${r.headerToGroup}(loose ${r.loose})、收尾 ${endText(r.nestedEnd)}  平鋪:標題列 → 條件列 ${r.flatHeaderToRow}(tight ${r.flatTight})  清光後:標題列 → ${r.clearedFirst} ${r.clearedHeaderToRow}(tight ${r.tight})、收尾 ${endText(r.clearedEnd)}  群組間 ${r.groupGaps.join(' / ')}  ${r.groups.map((g, i) => `〔群組 ${i + 1}:${g.conditions} 條條件、內距 上 ${g.pad.top} 右 ${g.pad.right} 下 ${g.pad.bottom} 左 ${g.pad.left}、列距 ${g.rowGaps.join(' / ')}、標籤頂差 ${g.labelDelta}〕`).join(' ')}`)

function selftestTable() {
  let ok = true
  const expect = (cond, msg) => { if (!cond) { console.error(`✗ selftest:${msg}`); ok = false } }
  const T = { md: { tight: 12, loose: 16, rootLoose: 16, flatTight: 12 }, lg: { tight: 16, loose: 24, rootLoose: 24, flatTight: 16 } }
  const group = (over = {}) => ({ conditions: 2, pad: { top: 8, right: 8, bottom: 8, left: 8 }, rowGaps: [8, 8], labelDelta: 0, ...over })
  // B 的一次收尾量測(probeSides 的形狀;修後:頂 = 底)
  const end = (density, v, over = {}) => ({ top: v, bottom: v, scrolled: 0, last: 'element', box: 'hug', lastDesc: '<button>「加入篩選器」', loose: T[density].loose, tight: T[density].tight, bottomToken: 48, grow: 20, free: 0, ...over })
  const row = (density, over = {}) => ({ density, ...T[density], headerToGroup: T[density].loose, flatHeaderToRow: T[density].tight, clearedHeaderToRow: T[density].tight, clearedFirst: '<div data-panel-add-row>', groupGaps: [T[density].tight], groups: [group(), group({ conditions: 1, rowGaps: [8] })], nestedEnd: end(density, T[density].loose), clearedEnd: end(density, T[density].tight), ...over })
  const both = (over) => DENSITIES.map((d) => row(d, typeof over === 'function' ? over(d) : over))
  const tagged = (failures, tag) => failures.filter((s) => s.startsWith(`[${tag}]`))
  expect(judge(both({})).length === 0, `現況的形狀應綠,實得 ${JSON.stringify(judge(both({})))}`)
  // T:巢狀標題列 → 群組用了 tight(A5 建置 da15b933 實測 12 / 16:把群組框當 element)→ 兩密度都紅
  const t = judge(both((d) => ({ headerToGroup: T[d].tight })))
  expect(tagged(t, 'T').length === 2 && t.length === 2 && t.some((s) => s.includes('= 12px,應 16')) && t.some((s) => s.includes('= 16px,應 24')), `巢狀標題列 → 群組用 tight 應兩密度只紅 [T],實得 ${JSON.stringify(t)}`)
  // F:平鋪標題列 → 第一列條件用了 loose(上內距一律 loose)→ 兩密度都紅
  const f = judge(both((d) => ({ flatHeaderToRow: T[d].loose })))
  expect(tagged(f, 'F').length === 2 && f.length === 2, `平鋪標題列 → 條件列用 loose 應兩密度只紅 [F],實得 ${JSON.stringify(f)}`)
  // E:群組清光、只剩按鈕列,上內距仍是 loose(只看 mode)→ 兩密度都紅
  const e = judge(both((d) => ({ clearedHeaderToRow: T[d].loose })))
  expect(tagged(e, 'E').length === 2 && e.length === 2 && e.every((s) => s.includes('data-panel-add-row')), `群組清光後仍用 loose 應兩密度只紅 [E],實得 ${JSON.stringify(e)}`)
  // B:A70 第一版(2026-11-14 驗證 measure-after.log 實測:巢狀面板 上 16 下 12 / 上 24 下 16)—— 上下不對稱 → 兩密度只紅 [B],訊息指名「與頂部同值」
  const b = judge(both((d) => ({ nestedEnd: end(d, T[d].loose, { bottom: T[d].tight }) })))
  expect(tagged(b, 'B').length === 2 && b.length === 2 && b.some((s) => s.includes('= 12px,應 16')) && b.some((s) => s.includes('= 16px,應 24')) && b.every((s) => s.includes('與頂部同值')), `巢狀面板上 loose 下 tight 應兩密度只紅 [B],實得 ${JSON.stringify(b)}`)
  // B:群組清光後底仍是 loose(只看 mode)→ [B];清光後上下都是 tight → 綠(上面「現況的形狀」已含)
  const bc = judge(both((d) => ({ clearedEnd: end(d, T[d].tight, { bottom: T[d].loose }) })))
  expect(tagged(bc, 'B').length === 2 && bc.length === 2 && bc.every((s) => s.includes('群組清光後')), `清光後底是 loose 應兩密度只紅 [B],實得 ${JSON.stringify(bc)}`)
  // B 的期望值跟著頂走(規則 4 第 4 列「與頂部同值」):A5 的樣子(上下都 tight)B 不紅,紅的是 [T] —— 各段只管自己那一段
  const a5 = judge(both((d) => ({ headerToGroup: T[d].tight, nestedEnd: end(d, T[d].tight) })))
  expect(tagged(a5, 'T').length === 2 && tagged(a5, 'B').length === 0, `A5 的樣子(上下都 tight)應只紅 [T],實得 ${JSON.stringify(a5)}`)
  // B 的登記:容器判成撐滿(例:面板被放進定高的容器)→ 紅並照規則 4 算 48;最後一個東西判成 bounded → 紅(內容換了)
  const bFill = judge(both((d) => ({ nestedEnd: end(d, T[d].loose, { box: 'fill', grow: 0, free: 30 }) })))
  expect(tagged(bFill, 'B').length === 4 && bFill.some((s) => s.includes('容器種類 = fill')) && bFill.some((s) => s.includes('應 48')), `容器判成撐滿應紅(登記不符 + 底應 48),實得 ${JSON.stringify(bFill)}`)
  const bLast = judge([row('md', { nestedEnd: end('md', 16, { last: 'bounded' }) }), row('lg')])
  expect(tagged(bLast, 'B').length === 1 && bLast[0].includes('最後一個東西的角色 = bounded'), `最後一個東西換成有框的塊應紅,實得 ${JSON.stringify(bLast)}`)
  // P:框內距改 12 → [P];只有一邊不對也紅並指名那一邊
  const p = judge(both({ groups: [group({ pad: { top: 12, right: 12, bottom: 12, left: 12 } }), group({ conditions: 1, rowGaps: [8] })] }))
  expect(tagged(p, 'P').length === 2 && p.length === 2, `框內距 12 應兩密度只紅 [P],實得 ${JSON.stringify(p)}`)
  const pOne = judge(both({ groups: [group({ pad: { top: 8, right: 8, bottom: 4, left: 8 } }), group({ conditions: 1, rowGaps: [8] })] }))
  expect(tagged(pOne, 'P').length === 2 && pOne.every((s) => s.includes('不對的:下')), `只有下內距不對應紅並指名「下」,實得 ${JSON.stringify(pOne)}`)
  // R:列距改 12 → [R]
  const r = judge(both({ groups: [group({ rowGaps: [12, 12] }), group({ conditions: 1, rowGaps: [8] })] }))
  expect(tagged(r, 'R').length === 2 && r.length === 2, `框內列距 12 應兩密度只紅 [R],實得 ${JSON.stringify(r)}`)
  // L:標籤比第一條條件高 8(標籤包層沒有上內距)→ [L]
  const l = judge(both({ groups: [group({ labelDelta: -8 }), group({ conditions: 1, rowGaps: [8] })] }))
  expect(tagged(l, 'L').length === 2 && l.length === 2 && l.every((s) => s.includes('高 8px')), `標籤沒對齊應兩密度只紅 [L],實得 ${JSON.stringify(l)}`)
  // G:群組 ↔ 群組用了 loose → [G]
  const g = judge(both((d) => ({ groupGaps: [T[d].loose] })))
  expect(tagged(g, 'G').length === 2 && g.length === 2, `群組間用 loose 應兩密度只紅 [G],實得 ${JSON.stringify(g)}`)
  // D:框內距跟著密度走(md 12 / lg 16)→ [P] 兩密度 + [D] 一筆;只在 lg 變(md 8 / lg 12)→ [P] @lg + [D]
  const scaled = (d) => ({ groups: [group({ pad: { top: T[d].tight, right: T[d].tight, bottom: T[d].tight, left: T[d].tight } }), group({ conditions: 1, rowGaps: [8] })] })
  const dAll = judge(both(scaled))
  expect(tagged(dAll, 'D').length === 1 && tagged(dAll, 'P').length === 2, `框內距跟密度走應紅 [D] 一筆 + [P] 兩密度,實得 ${JSON.stringify(dAll)}`)
  const dLg = judge([row('md'), row('lg', { groups: [group({ rowGaps: [12, 12] }), group({ conditions: 1, rowGaps: [8] })] })])
  expect(tagged(dLg, 'D').length === 1 && tagged(dLg, 'R').length === 1, `只有大密度的列距變了應紅 [D] + [R]@lg,實得 ${JSON.stringify(dLg)}`)
  // 儀器失效:沒量到 / token 讀不到 / 密度沒套上 / 群組不夠 / 某一段 NaN
  const inst = (rows) => judge(rows).some((s) => s.includes(INSTRUMENT_FAIL_MARKER))
  expect(inst([{ density: 'md', err: '找不到看得見的群組框' }, row('lg')]), '找不到群組框應判儀器失效')
  expect(inst([row('md', { tight: NaN }), row('lg')]), '讀不到 tight 應判儀器失效')
  expect(inst([row('md', { loose: NaN }), row('lg')]), '讀不到 loose 應判儀器失效')
  expect(inst([row('md', { flatTight: NaN }), row('lg')]), '讀不到平鋪面板的 tight 應判儀器失效')
  expect(inst([row('md'), row('lg', { rootLoose: 16 })]), '兩密度頁面根同 loose 應判儀器失效')
  expect(inst(both({ groups: [group()], groupGaps: [] })), '只量到一個群組應判儀器失效(量不到群組 ↔ 群組)')
  expect(inst(both({ groups: [group({ conditions: 1, rowGaps: [8] }), group({ conditions: 1, rowGaps: [8] })] })), '沒有任何群組有 ≥ 2 條條件應判儀器失效(量不到條件 ↔ 條件)')
  expect(inst(both({ groups: [group({ labelDelta: NaN }), group({ conditions: 1, rowGaps: [8] })] })), '標籤沒量到應判儀器失效')
  expect(inst(both({ headerToGroup: NaN })), '巢狀標題列 → 群組沒量到應判儀器失效')
  expect(inst(both({ flatHeaderToRow: NaN })), '平鋪標題列 → 條件列沒量到應判儀器失效')
  expect(inst(both({ clearedHeaderToRow: undefined })), '群組清光後沒量到應判儀器失效(不准默默跳過 E)')
  // B 的儀器失效:沒量 / 量具回錯 / 底或頂 NaN / 容器種類判不出(內容加高後量不到容器長多少)/ 沒捲在最上面 / token 讀不到 —— 都不准讀成通過,也不准指控產品
  const bInst = (over) => { const f = judge([row('md', over), row('lg')]); return f.length > 0 && f.every((s) => s.includes(INSTRUMENT_FAIL_MARKER)) }
  expect(bInst({ nestedEnd: undefined }), '巢狀面板沒量收尾應判儀器失效(不准默默跳過 B)')
  expect(bInst({ clearedEnd: undefined }), '清光後沒量收尾應判儀器失效')
  expect(bInst({ nestedEnd: { err: '從第 3 個 SurfaceHeader 往下找到的那一塊不是巢狀面板的 body' } }), '收尾量到別的面板應判儀器失效')
  expect(bInst({ nestedEnd: end('md', 16, { bottom: NaN }) }), '收尾 NaN 應判儀器失效')
  expect(bInst({ nestedEnd: end('md', 16, { box: null, grow: NaN }) }), '容器種類判不出應判儀器失效')
  expect(bInst({ nestedEnd: end('md', 16, { scrolled: 30 }) }), '量收尾時沒捲在最上面應判儀器失效(頂不能當期望值)')
  expect(bInst({ nestedEnd: end('md', 16, { bottomToken: NaN }) }), '收尾讀不到 --layout-space-bottom 應判儀器失效')
  return ok
}

async function selftest() {
  let ok = selftestTable()
  if (!staticArg) requireFreshStorybookBuild(STATIC, SOURCES)
  // (b) 真建置:現況必綠(紅燈來自拆法,不是頁面本來就壞),再逐一拆
  await withPage(async (page, server) => {
    const baseFailures = judge(await measure(page, server))
    if (baseFailures.length) { console.error(`✗ selftest:現況就紅 —— 基準不乾淨,對照組沒有意義\n  ${baseFailures.join('\n  ')}`); ok = false }
    for (const mutation of MUTATIONS) {
      const [what, tag] = mutation
      const failures = judge(await measure(page, server, mutation))
      const instrument = failures.filter((s) => s.includes(INSTRUMENT_FAIL_MARKER))
      const hit = failures.filter((s) => s.startsWith(`[${tag}]`))
      const caught = hit.length > 0 && instrument.length === 0
      console.log(`  ${caught ? '✓' : '✗'} 頁面對照:${what} → ${caught ? `紅在 [${tag}](${hit[0].slice(0, 80)}…)` : instrument.length ? `儀器失效(${instrument[0].slice(0, 120)})` : `沒紅在 [${tag}](實際紅:${failures.map((s) => s.slice(0, 3)).join(' ') || '無'})`}`)
      if (!caught) ok = false
    }
  })
  console.log(ok ? `✅ data-table-filter-group-spacing selftest PASS(判定表 + 現況綠 + 頁面上 ${MUTATIONS.length} 種拆法各自紅)` : '❌ data-table-filter-group-spacing selftest FAIL')
  return ok
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    if (process.argv.includes('--selftest')) process.exit((await selftest()) ? 0 : 1)
    if (!staticArg) requireFreshStorybookBuild(STATIC, SOURCES)
    const rows = await withPage((page, server) => measure(page, server))
    for (const r of rows) console.log(describe(r))
    const failures = judge(rows)
    if (failures.length) { console.error('❌ data-table-filter-group-spacing FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log(`✅ data-table-filter-group-spacing PASS(篩選面板 × md / lg:巢狀標題列 → 群組 = loose、平鋪標題列 → 條件列 = tight、群組清光後標題列 → 按鈕列 = tight、巢狀面板收尾 = 與頂部同值(群組在前 / 清光後)、群組框內距 / 列距 = ${GROUP_INNER}(不跟密度)、標籤頂對齊第一條條件、群組 ↔ 群組 = tight)`)
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
