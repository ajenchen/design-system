#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: (一)垂直:Steps 垂直排列、**沒有說明文字**時,三個尺寸的連接線都符合 `steps.spec.md`「Connector 幾何」——
 *         線高 ≥ 24px(地板,MUI StepConnector vertical minHeight 24),圓到線的縫兩端各 8px(對稱),而且線長不是「列高的餘數」。
 *         (二)水平(2026-11-26 E12,`steps.spec.md`「水平版步驟名放不下」;user 原話「照你建議」= 丙):量既有的展示「水平」story,
 *         不新增 story,三個場景 ——
 *           窄(視窗 480,E12 重現寬度):每條連接線右端不進下一步的圓;水平線寬 ≥ 12,且步驟名被截斷的那一步線寬 = 12
 *             (截斷 = 線已被擠到地板,這時量到的就是地板本身;steps.spec.md「Connector 幾何」水平最短 = 一個水平步間距 gap-3,
 *             user 2026-11-26/27 E12w「照 12 做」);步驟名單行;被截斷的步驟名滑過出現全名 tooltip、
 *             沒被截斷的不出現(tooltip.spec.md:30「只有當文字實際被截斷時才顯示」);
 *           寬(視窗 960):畫面與修前一致 —— 用修前的排版模型逐項比:沒有步驟名被截斷、前面每一步等寬、最後一步 = 自己的自然寬
 *             (圓欄 + 縫 + 字寬)、連接線伸到該步右緣、滑過不出 tooltip;
 *           最後一步長名字(把最後一步名字換成 LONG_LAST_NAME;寬度由實測內容推導,見 deriveLongLastWidth):前面每一步的步驟名
 *             可見寬 ≥ 1 個字寬(不被全擠成「…」)、最後一步不比前面每一步寬(放不下時一起分寬)。
 *   紅: 垂直:任一尺寸的線高 < 24、或任一端的縫 ≠ 8(±0.6px,subpixel)→ 指名尺寸與數字並 exit 1。
 *       歷史紅燈(2026-09-29 修法前實測,`storybook-static` 尺寸對照表):sm 18.2 / md **2.2** / lg **0** —— 線長 = li 高 − 2r − 16,
 *       無說明時 md 幾乎看不見、lg 根本沒有線(user 09-26:「所以這是沒按照設計規格?」→ 裁「兩者都是」)。
 *       水平:上列任一項不符 → 指名場景、第幾步、哪一項與數字並 exit 1。歷史紅燈(2026-11-26 修前實測,480 寬):第 2 步連接線 216–240、
 *       下一步從 208 開始 —— 線整段落在下一步裡、「4」被劃過(steps.tsx 步驟名外層 `shrink-0`)。
 *   綠: 垂直:修法後三尺寸線高 = 24(sm/md/lg 的 li 最小高 48/64/72),縫 8/8;水平:三個場景全部符合。重複跑恆等(無動畫;tooltip 等它畫出來,不用固定睡眠)。
 *   量法: 靜態站開 story,讀 `[data-steps-indicator]` / `[data-steps-connector]` / `[data-steps-label]` 的 getBoundingClientRect 與
 *         scrollWidth / clientWidth(M32:量像素幾何,不看 class);tooltip 由 Playwright 真的滑過步驟名、等 `[role="tooltip"]` 畫出來。
 *   對照組(`--selftest`):(a) 判定表 —— 修前實測數字(垂直 18.2 / 2.2 / 0、水平 480 的 216–240 對 208)與每一項的壞形狀必紅、好形狀必綠;
 *         (b) 有建置時,在真的建置上注入八種破壞,各自讓指定那一項紅:拿掉截斷(步驟名照修前不准縮)→ 窄的連接線進圓;
 *         步驟名改回折行 → 窄的單行紅;tooltip 藏掉 → 窄的 tooltip 紅;最後一步照修前不准縮 → 長名字的「前面被擠成…」紅
 *         (本機字寬一次、字寬模擬到 8px 一次 —— 字距 = 8 − 這台機器實測的字寬,實測已 ≤ 8 就不套、照跑);
 *         最後一步撐滿 → 寬的「最後一步自然寬」紅;水平地板改回 24 / 改成 8 → 窄的水平地板各自紅(E12w);
 *         (c) 綠面:字寬模擬到 8px 時,修後的長名字場景必須全綠(只有破壞會紅,不是窄字型本身就紅)。
 *   長名字場景的寬度(2026-11-27,PR #174 CI 紅的根因):原本寫死視窗 592。CI 的 Linux 沒有 CJK 字型,中文每字約 8px(本機 14px),
 *         「最後一步照修前不准縮」時最後一步的自然寬只有 36 + 88 = 124,前面每步還剩 37px 給字 —— 沒被擠,對照組只拿到 premise、量具無效
 *         (M32 第四問「換一台機器 / 環境還會成立嗎」)。改成先在參考寬開一次、量出圓欄 + 縫、字級、最後一步的自然寬,
 *         再由 deriveLongLastWidth 算出「修後前面每步至少一個字」與「修前前面每步不到一個字」同時成立的容器寬區間,取區間正中;
 *         區間不存在 = 儀器失效(不讀成通過)。判準本身不變(仍是 ≥ 1 個字寬,字寬 = 字級)。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const STORY = 'design-system-components-steps-設計規格--size-matrix'
// 與 steps.tsx 的 CONNECTOR_MIN_VERTICAL_PX / CONNECTOR_MIN_HORIZONTAL_PX / CONNECTOR_GAP_PX 同值
//(規格數字住 steps.spec.md「Connector 幾何」:線最短 = 一個步間距,垂直 pb-6 = 24、水平 gap-3 = 12)
export const V_MIN_LINE_PX = 24
export const H_MIN_LINE_PX = 12
export const GAP_PX = 8
const TOL = 0.6

// ── 水平場景(steps.spec.md「水平版步驟名放不下」)────────────────────────────
export const H_STORY = 'design-system-components-steps-展示--horizontal'
export const NARROW_VW = 480 // E12 重現的寬度
export const WIDE_VW = 960
// 長名字場景先在這個寬度開一次量內容(展示 story 是 padded 版面、外框 max-w-3xl 768;640 寬時容器 608 不會頂到上限),
// 再依 deriveLongLastWidth 換到推導出的寬度重開一次
export const LONG_LAST_REF_VW = 640
// 結帳流程最後一步寫成長名字(展示 story 原本是「完成」);修前最後一步不准縮,前面每一步被擠到不到一個字
export const LONG_LAST_NAME = '確認訂單並開立電子發票'

/**
 * 純函式:長名字場景的容器寬,由實測內容推導(與字型無關)。
 * n 步、步與步之間 gap;chromeFront = 前面一步除了字以外的寬(圓欄 + 縫 + 字到線的縫 + 線的地板);
 * fontSize = 「一個字」的門檻(judgeHorizontal 的 long-last-squeezed 用同一個值);lastNatural = 最後一步自然寬(圓欄 + 縫 + 長名字字寬)。
 *   修後(大家一起分寬):每步 = (C − (n−1)gap) / n;前面每步字框 ≥ fontSize ⟺ C ≥ lower = n(chromeFront + fontSize) + (n−1)gap
 *   修前(最後一步不准縮):前面每步 = (C − (n−1)gap − lastNatural) / (n−1);字框 < fontSize ⟺ C < upper = (n−1)(chromeFront + fontSize + gap) + lastNatural
 *   修後最後一步要被截斷(場景前提):每步 < lastNatural ⟺ C < truncBound = n·lastNatural + (n−1)gap
 * 取 [lower, min(upper, truncBound)) 的正中;區間寬不到 4px → infeasible(呼叫端報儀器失效)。
 */
export function deriveLongLastWidth({ n, gap, chromeFront, fontSize, lastNatural }) {
  const vals = { n, gap, chromeFront, fontSize, lastNatural }
  for (const [k, v] of Object.entries(vals)) if (!Number.isFinite(v)) return { infeasible: `${k} 不是數字(${v})` }
  const lower = n * (chromeFront + fontSize) + (n - 1) * gap
  const upper = (n - 1) * (chromeFront + fontSize + gap) + lastNatural
  const truncBound = n * lastNatural + (n - 1) * gap
  const hi = Math.min(upper, truncBound)
  if (hi - lower < 4) return { infeasible: `容器寬區間 [${lower}, ${hi}) 不足 4px(最後一步自然寬 ${lastNatural} 不夠長,修前擠不到前面)`, lower, upper, truncBound }
  return { container: Math.floor((lower + hi) / 2), lower, upper, truncBound }
}
const SOURCES = [
  'packages/design-system/src/components/Steps/steps.tsx',
  'packages/design-system/src/components/Steps/steps.stories.tsx',
  'packages/design-system/src/components/Steps/steps.anatomy.stories.tsx',
  'packages/design-system/src/patterns/element-anatomy/truncated-text.tsx',
]

/** 純函式:每個尺寸 { size, lines:[{height, gapTop, gapBottom}] } → 不符合的訊息清單(呼叫端與 selftest 共用)。 */
export function judge(sizes) {
  const failures = []
  for (const { size, lines } of sizes) {
    if (!lines.length) { failures.push(`${size}:沒量到任何連接線`); continue }
    lines.forEach((l, i) => {
      if (!(l.height >= V_MIN_LINE_PX - TOL)) failures.push(`${size} 第 ${i + 1} 條線高 ${l.height}px < ${V_MIN_LINE_PX}(無說明文字時線幾乎消失)`)
      if (Math.abs(l.gapTop - GAP_PX) > TOL) failures.push(`${size} 第 ${i + 1} 條上端縫 ${l.gapTop}px ≠ ${GAP_PX}`)
      if (Math.abs(l.gapBottom - GAP_PX) > TOL) failures.push(`${size} 第 ${i + 1} 條下端縫 ${l.gapBottom}px ≠ ${GAP_PX}`)
    })
  }
  return failures
}

const isTruncated = (label) => label.scrollW > label.clientW

/**
 * 純函式:水平場景 → 不符合的 { kind, msg } 清單。
 * scene = { name: 'narrow' | 'wide' | 'long-last', items: [{ liLeft, liRight, liW, indLeft, conn: {left,right,width}|null,
 *   label: { left, height, clientW, scrollW, lineHeight, fontSize, full } }], tooltips: [{ i, truncated, shown }] }
 * kind:connector-into-next / connector-floor / single-line / tooltip / wide-truncated / wide-equal / wide-last-natural /
 *      wide-connector-fill / long-last-squeezed / long-last-wider / premise
 */
export function judgeHorizontal(scene) {
  const out = []
  const f = (kind, msg) => out.push({ kind, msg: `${scene.name}:${msg}` })
  const { items, tooltips = [] } = scene
  if (items.length < 2) { f('premise', `只量到 ${items.length} 步`); return out }
  const last = items.length - 1
  items.forEach((it, i) => {
    if (i === last) return
    if (!it.conn) { f('premise', `第 ${i + 1} 步沒有連接線`); return }
    const next = items[i + 1]
    if (it.conn.right > next.indLeft + TOL) f('connector-into-next', `第 ${i + 1} 步連接線右端 ${it.conn.right} 進到下一步的圓(圓左緣 ${next.indLeft})`)
    // 水平地板 = 12(一個水平步間距):線不得短於它;步驟名被截斷 = 線已被擠到地板,這時線寬就是地板本身,不得大於它
    //(地板改成 8 → 前一條紅;改回 24 → 後一條紅 —— 只驗「≥ 12」抓不到地板被調高)
    if (!(it.conn.width >= H_MIN_LINE_PX - TOL)) f('connector-floor', `第 ${i + 1} 步連接線寬 ${it.conn.width} < 水平最短 ${H_MIN_LINE_PX}`)
    else if (isTruncated(it.label) && it.conn.width > H_MIN_LINE_PX + TOL) f('connector-floor', `第 ${i + 1} 步步驟名已被截斷,連接線卻是 ${it.conn.width}(> 水平最短 ${H_MIN_LINE_PX})—— 地板不是一個水平步間距`)
  })
  for (const [i, it] of items.entries()) {
    if (it.label.height > it.label.lineHeight * 1.5) f('single-line', `第 ${i + 1} 步步驟名高 ${it.label.height}(行高 ${it.label.lineHeight})—— 不是單行`)
  }
  for (const t of tooltips) {
    if (t.truncated !== t.shown) f('tooltip', `第 ${t.i + 1} 步步驟名${t.truncated ? '被' : '沒被'}截斷,滑過${t.shown ? '出現' : '沒出現'}全名 tooltip(應${t.truncated ? '出現' : '不出現'})`)
  }
  if (scene.name === 'narrow' && !items.some((it) => isTruncated(it.label))) f('premise', '窄場景沒有任何步驟名被截斷 —— 夾具沒量到截斷')
  if (scene.name === 'narrow' && !tooltips.length) f('premise', '窄場景沒有滑過任何步驟名')
  if (scene.name === 'wide') {
    items.forEach((it, i) => { if (isTruncated(it.label)) f('wide-truncated', `第 ${i + 1} 步步驟名在寬版被截斷(${it.label.clientW} < ${it.label.scrollW})`) })
    const widths = items.slice(0, last).map((it) => it.liW)
    if (Math.max(...widths) - Math.min(...widths) > 1) f('wide-equal', `前面每一步不等寬(${widths.join(' / ')})`)
    const L = items[last]
    const natural = Math.round((L.label.left - L.liLeft + L.label.scrollW) * 10) / 10
    if (Math.abs(L.liW - natural) > 1) f('wide-last-natural', `最後一步寬 ${L.liW} ≠ 自然寬 ${natural}(圓欄 + 縫 + 字寬)`)
    items.slice(0, last).forEach((it, i) => { if (it.conn && Math.abs(it.conn.right - it.liRight) > TOL) f('wide-connector-fill', `第 ${i + 1} 步連接線右端 ${it.conn.right} 沒伸到該步右緣 ${it.liRight}`) })
    if (!tooltips.length) f('premise', '寬場景沒有滑過任何步驟名')
  }
  if (scene.name === 'long-last') {
    const L = items[last]
    if (!isTruncated(L.label)) f('premise', '最後一步長名字沒有被截斷 —— 夾具前提不成立')
    items.slice(0, last).forEach((it, i) => {
      if (it.label.clientW < it.label.fontSize) f('long-last-squeezed', `第 ${i + 1} 步步驟名只剩 ${it.label.clientW}px(< 1 個字 ${it.label.fontSize}px)—— 被擠成「…」`)
    })
    const maxOther = Math.max(...items.slice(0, last).map((it) => it.liW))
    if (isTruncated(L.label) && L.liW > maxOther + 1) f('long-last-wider', `最後一步被截斷卻比前面每一步寬(${L.liW} > ${maxOther})`)
  }
  return out
}

// ── 判定表夾具(selftest)──────────────────────────────────────────────────
// 一步 = 圓 24 + 縫 12 + 字 + 縫 12 + 線(放不下時線 = 水平地板 12);數字照 md 尺寸(字 14px、行高 18.2)
function step(left, width, { label = 42, shown = null, conn = true, connRight = null, lines = 1, clientW = null } = {}) {
  const right = left + width
  const labelLeft = left + 36
  const cw = clientW ?? Math.min(label, Math.max(0, width - 36 - (conn ? 12 + H_MIN_LINE_PX : 0)))
  return {
    liLeft: left, liRight: right, liW: width, indLeft: left,
    conn: conn ? { left: labelLeft + cw + 12, right: connRight ?? right, width: (connRight ?? right) - (labelLeft + cw + 12) } : null,
    label: { left: labelLeft, height: 18.2 * lines, clientW: cw, scrollW: label, lineHeight: 18.2, fontSize: 14, full: 'x' }, shown,
  }
}
const row = (specs) => {
  let x = 16
  return specs.map((s, i) => { const it = step(x, s.w, { ...s, conn: i < specs.length - 1 }); x += s.w + 12; return it })
}
const tips = (items) => items.map((it, i) => ({ i, truncated: isTruncated(it.label), shown: it.shown ?? isTruncated(it.label) }))
const sceneOf = (name, items, tooltips = tips(items)) => ({ name, items, tooltips })

export const HORIZONTAL_TABLE = [
  // 修後 480 實際形狀(水平地板 12):前四步 84 寬、字框 24px 被截斷、線 12;最後一步「完成」64 自然寬
  ['修後 480:前四步截斷 + tooltip、最後一步自然寬', sceneOf('narrow', row([{ w: 84 }, { w: 84, label: 56 }, { w: 84, label: 56 }, { w: 84, label: 28 }, { w: 64, label: 28 }])), []],
  // 修前 480 真實紅燈(2026-11-26 e-measure):li 84、連接線 216–240、下一步從 208 開始(步驟名不准縮,線被推出去)
  ['修前 480:第 2 步連接線 216–240 進到下一步(208)', sceneOf('narrow', [
    { liLeft: 16, liRight: 100, liW: 84, indLeft: 16, conn: { left: 106, right: 130, width: 24 }, label: { left: 52, height: 18.2, clientW: 42, scrollW: 42, lineHeight: 18.2, fontSize: 14, full: '購物車' } },
    { liLeft: 112, liRight: 196, liW: 84, indLeft: 112, conn: { left: 216, right: 240, width: 24 }, label: { left: 148, height: 18.2, clientW: 56, scrollW: 56, lineHeight: 18.2, fontSize: 14, full: '寄送地址' } },
    { liLeft: 208, liRight: 292, liW: 84, indLeft: 208, conn: { left: 312, right: 336, width: 24 }, label: { left: 244, height: 18.2, clientW: 56, scrollW: 56, lineHeight: 18.2, fontSize: 14, full: '運送方式' } },
    { liLeft: 304, liRight: 388, liW: 84, indLeft: 304, conn: { left: 380, right: 404, width: 24 }, label: { left: 340, height: 18.2, clientW: 28, scrollW: 28, lineHeight: 18.2, fontSize: 14, full: '付款' } },
    { liLeft: 400, liRight: 464, liW: 64, indLeft: 400, conn: null, label: { left: 436, height: 18.2, clientW: 28, scrollW: 28, lineHeight: 18.2, fontSize: 14, full: '完成' } },
  ], [{ i: 0, truncated: false, shown: false }]), ['connector-into-next', 'premise']],
  ['步驟名折成兩行', sceneOf('narrow', row([{ w: 84, lines: 3 }, { w: 84, label: 56 }, { w: 64, label: 28 }])), ['single-line']],
  ['被截斷卻滑過沒有 tooltip', sceneOf('narrow', row([{ w: 84, shown: false }, { w: 84, label: 56 }, { w: 64, label: 28 }])), ['tooltip']],
  ['沒被截斷卻出 tooltip', sceneOf('narrow', row([{ w: 84 }, { w: 84, label: 56 }, { w: 64, label: 28, shown: true }])), ['tooltip']],
  // 水平地板(E12w 定 12):字框 = 84 − 36 − 12 − 線;地板改成 8 → 線 8(< 12)、改回 24 → 被截斷的步線 24(> 12),各自紅
  ['水平地板改成 8(截斷時線 8)', sceneOf('narrow', row([{ w: 84, clientW: 28 }, { w: 84, label: 56, clientW: 28 }, { w: 64, label: 28 }])), ['connector-floor']],
  ['水平地板改回 24(截斷時線 24)', sceneOf('narrow', row([{ w: 84, clientW: 12 }, { w: 84, label: 56, clientW: 12 }, { w: 64, label: 28 }])), ['connector-floor']],
  ['沒被截斷的步線比地板長(寬度有餘)', sceneOf('narrow', row([{ w: 84, label: 20 }, { w: 84, label: 56 }, { w: 64, label: 28 }])), []],
  // 寬 960(容器 768):前四步各 164、最後一步「完成」64 = 36 + 28
  ['寬:修前同形(前四步等寬、最後一步自然寬、線伸到右緣)', sceneOf('wide', row([{ w: 164 }, { w: 164, label: 56 }, { w: 164, label: 56 }, { w: 164, label: 28 }, { w: 64, label: 28 }])), []],
  ['寬:最後一步撐滿成跟前面一樣寬', sceneOf('wide', row([{ w: 144 }, { w: 144, label: 56 }, { w: 144, label: 56 }, { w: 144, label: 28 }, { w: 144, label: 28 }])), ['wide-last-natural']],
  ['寬:前面不等寬', sceneOf('wide', row([{ w: 150 }, { w: 178, label: 56 }, { w: 164, label: 56 }, { w: 164, label: 28 }, { w: 64, label: 28 }])), ['wide-equal']],
  ['寬:有步驟名被截斷', sceneOf('wide', row([{ w: 164, label: 200 }, { w: 164, label: 56 }, { w: 64, label: 28 }])), ['wide-truncated']],
  ['寬:連接線沒伸到右緣', sceneOf('wide', row([{ w: 164, connRight: 150 }, { w: 164, label: 56 }, { w: 64, label: 28 }])), ['wide-connector-fill']],
  // 長名字(容器 512、五步):修後每步 92.8;修前最後一步不准縮 190 → 前面每步 68.5、字只剩 8.5。
  // E12w 前容器是 560(80.5 / 8.5):水平地板 24 → 12 後同一個容器修前字框變 20.5(> 1 個字 14),這一格就不紅了;
  // 容器縮 48(= 4 條線 × (24 − 12)),回到與修前同一個幾何(字框 8.5)。判準本身不變。
  ['長名字:修後一起分寬', sceneOf('long-last', row([{ w: 92.8 }, { w: 92.8, label: 56 }, { w: 92.8, label: 56 }, { w: 92.8, label: 28 }, { w: 92.8, label: 154 }])), []],
  // 修前最後一步是自然寬、不截斷 → 同時報「前提不成立」(主跑時是儀器失效);對照組只認 long-last-squeezed
  ['長名字:修前最後一步不准縮,前面被擠成「…」', sceneOf('long-last', row([{ w: 68.5 }, { w: 68.5, label: 56 }, { w: 68.5, label: 56 }, { w: 68.5, label: 28 }, { w: 190, label: 154 }])), ['long-last-squeezed', 'premise']],
  ['長名字:最後一步被截斷卻比前面寬', sceneOf('long-last', row([{ w: 81 }, { w: 81, label: 56 }, { w: 81, label: 56 }, { w: 81, label: 28 }, { w: 140, label: 154 }])), ['long-last-wider']],
]

// 長名字場景寬度推導的兩面:兩組實測字寬 —— 本機(中文每字 14px)與 CI Linux(每字約 8px;PR #174 CI log 實測
// 購物車 24 / 寄送地址 32 / 運送方式 32 / 付款 16 / 長名字 88)。在推導出的容器寬上用判定表夾具模擬:修後必綠、修前必紅 long-last-squeezed。
export const DERIVE_TABLE = [
  ['本機字寬(14px)', { fronts: [42, 56, 56, 28], last: 154 }],
  ['CI Linux 字寬(約 8px)', { fronts: [24, 32, 32, 16], last: 88 }],
]
/** 以判定表夾具的幾何(圓欄 36、字到線 12、水平線地板 H_MIN_LINE_PX、步間 12、字級 14)模擬容器寬 C 的修後 / 修前形狀 */
function simulateLongLast({ fronts, last }, container = null) {
  const n = fronts.length + 1
  const lastNatural = 36 + last
  const d = deriveLongLastWidth({ n, gap: 12, chromeFront: 36 + 12 + H_MIN_LINE_PX, fontSize: 14, lastNatural })
  const C = container ?? d.container
  if (!Number.isFinite(C)) return { d }
  const each = (C - (n - 1) * 12) / n
  const wf = (C - (n - 1) * 12 - lastNatural) / (n - 1)
  return {
    d, C,
    after: sceneOf('long-last', row([...fronts.map((label) => ({ w: each, label })), { w: each, label: last }])),
    before: sceneOf('long-last', row([...fronts.map((label) => ({ w: wf, label })), { w: lastNatural, label: last }])),
  }
}
const kindsOf = (scene) => [...new Set(judgeHorizontal(scene).map((x) => x.kind))].sort()

function selftestDerive() {
  let ok = true
  for (const [name, content] of DERIVE_TABLE) {
    const s = simulateLongLast(content)
    if (s.d.infeasible) { console.error(`✗ selftest 推導「${name}」:應可推導,實得 ${s.d.infeasible}`); ok = false; continue }
    const a = kindsOf(s.after), b = kindsOf(s.before)
    if (a.length) { console.error(`✗ selftest 推導「${name}」容器 ${s.C}:修後應全綠,實得 [${a}]`); ok = false }
    if (JSON.stringify(b) !== JSON.stringify(['long-last-squeezed', 'premise'])) { console.error(`✗ selftest 推導「${name}」容器 ${s.C}:修前應紅 long-last-squeezed(+ premise),實得 [${b}]`); ok = false }
  }
  // 舊做法的紅燈重現:CI 字寬在舊的固定容器 560(視窗 592)上,修前形狀前面每步還有 37px 給字 → 只有 premise、沒有 squeezed(PR #174 CI 紅)
  const old = simulateLongLast(DERIVE_TABLE[1][1], 560)
  if (JSON.stringify(kindsOf(old.before)) !== JSON.stringify(['premise'])) { console.error(`✗ selftest:CI 字寬 + 固定容器 560 應重現「只有 premise」,實得 [${kindsOf(old.before)}]`); ok = false }
  // 最後一步不夠長(展示 story 原本的「完成」)→ 推不出寬度 = 儀器失效,不是通過
  if (!deriveLongLastWidth({ n: 5, gap: 12, chromeFront: 36 + 12 + H_MIN_LINE_PX, fontSize: 14, lastNatural: 36 + 28 }).infeasible) { console.error('✗ selftest:最後一步「完成」推不出區間,應 infeasible'); ok = false }
  if (!deriveLongLastWidth({ n: 5, gap: 12, chromeFront: NaN, fontSize: 14, lastNatural: 190 }).infeasible) { console.error('✗ selftest:量不到值應 infeasible'); ok = false }
  // 字寬模擬(narrowGlyphCss):本機 14px → 字距 −6;CI 本來就 8px(或更窄)→ 不套。
  // 對照:寫死 −6 套在 CI 的 8px 上 = 每字 2px,長名字 11 字 → 最後一步自然寬 36 + 22 = 58 → 推不出(CI 3eca5afd 的兩格儀器失效)
  if (!/letter-spacing:-6\.00px/.test(narrowGlyphCss(14))) { console.error('✗ selftest:實測 14px 應注入字距 −6.00px,實得', narrowGlyphCss(14)); ok = false }
  if (narrowGlyphCss(8) !== '' || narrowGlyphCss(7.5) !== '') { console.error('✗ selftest:實測 ≤ 8px 應不套字距'); ok = false }
  if (!deriveLongLastWidth({ n: 5, gap: 12, chromeFront: 36 + 12 + H_MIN_LINE_PX, fontSize: 14, lastNatural: 36 + 11 * (8 - 6) }).infeasible) { console.error('✗ selftest:寫死 −6 套在 8px 上應重現推不出'); ok = false }
  return ok
}

function selftestTable() {
  let ok = selftestDerive()
  const good = ['sm', 'md', 'lg'].map((size) => ({ size, lines: [{ height: 24, gapTop: 8, gapBottom: 8 }, { height: 24, gapTop: 8, gapBottom: 8 }] }))
  if (judge(good).length !== 0) { console.error('✗ selftest:正確形狀應綠', judge(good)); ok = false }
  // 修法前的真實紅燈(2026-09-29 storybook-static 實測):線高是列高的餘數
  const before = [
    { size: 'sm', lines: [{ height: 18.2, gapTop: 8, gapBottom: 8 }] },
    { size: 'md', lines: [{ height: 2.2, gapTop: 8, gapBottom: 8 }] },
    { size: 'lg', lines: [{ height: 0, gapTop: 8, gapBottom: 8 }] },
  ]
  const f1 = judge(before)
  if (!(f1.length === 3 && f1.some((s) => s.startsWith('sm')) && f1.some((s) => s.startsWith('md')) && f1.some((s) => s.startsWith('lg')))) { console.error('✗ selftest:修法前的 18.2 / 2.2 / 0 應三尺寸都紅,實得', f1); ok = false }
  const gapDrift = [{ size: 'md', lines: [{ height: 24, gapTop: 12, gapBottom: 8 }] }]
  if (!judge(gapDrift).some((s) => /上端縫 12/.test(s))) { console.error('✗ selftest:縫 12 應紅'); ok = false }
  if (judge([{ size: 'md', lines: [] }]).length !== 1) { console.error('✗ selftest:沒量到應紅'); ok = false }
  for (const [name, scene, expectKinds] of HORIZONTAL_TABLE) {
    const got = [...new Set(judgeHorizontal(scene).map((x) => x.kind))].sort()
    const want = [...expectKinds].sort()
    if (JSON.stringify(got) !== JSON.stringify(want)) { console.error(`✗ selftest 水平「${name}」:應 [${want}],實得 [${got}]`, judgeHorizontal(scene).map((x) => x.msg)); ok = false }
  }
  console.log(ok ? `✅ steps-connector-geometry selftest 判定表 PASS(垂直 4 格 + 水平 ${HORIZONTAL_TABLE.length} 格 + 長名字寬度推導 ${DERIVE_TABLE.length} 組字寬 × 修前 / 修後 + 固定 560 重現 + 推不出 2 格)` : '❌ steps-connector-geometry selftest 判定表 FAIL')
  return ok
}

// ── 量測(瀏覽器)──────────────────────────────────────────────────────────
async function measureVertical(page, origin) {
  await page.setViewportSize({ width: 1200, height: 900 })
  await openStory(page, `${origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitFor: '[data-steps-connector="vertical"]' })
  return await page.evaluate(() => {
    const lists = [...document.querySelectorAll('ol, ul')].filter((l) => l.querySelector('li[data-state]'))
    return lists.map((list) => {
      const items = [...list.querySelectorAll(':scope > li[data-state]')]
      const size = list.closest('[class*="border-dashed"]')?.querySelector('.font-mono')?.textContent?.match(/size="(\w+)"/)?.[1] ?? '?'
      const lines = []
      items.forEach((li, i) => {
        const line = li.querySelector('[data-steps-connector="vertical"]')
        if (!line) return
        const ind = li.querySelector('[data-steps-indicator]')
        const next = items[i + 1]?.querySelector('[data-steps-indicator]')
        const r = line.getBoundingClientRect(), a = ind?.getBoundingClientRect(), b = next?.getBoundingClientRect()
        const round = (v) => Math.round(v * 10) / 10
        lines.push({ height: round(r.height), gapTop: a ? round(r.top - a.bottom) : NaN, gapBottom: b ? round(b.top - r.bottom) : NaN })
      })
      return { size, lines }
    })
  })
}

function readHorizontalInPage() {
  const ol = document.querySelector('ol[data-orientation="horizontal"]')
  if (!ol) return null
  const r1 = (v) => Math.round(v * 10) / 10
  return [...ol.querySelectorAll(':scope > li[data-state]')].map((li) => {
    const r = li.getBoundingClientRect()
    const ind = li.querySelector('[data-steps-indicator]')?.getBoundingClientRect()
    const conn = li.querySelector('[data-steps-connector="horizontal"]')?.getBoundingClientRect()
    const label = li.querySelector('[data-steps-label]')
    const text = label?.firstElementChild ?? label
    const lr = text?.getBoundingClientRect()
    const cs = text ? getComputedStyle(text) : null
    return {
      liLeft: r1(r.left), liRight: r1(r.right), liW: r1(r.width), indLeft: ind ? r1(ind.left) : NaN,
      conn: conn ? { left: r1(conn.left), right: r1(conn.right), width: r1(conn.width) } : null,
      label: text ? {
        left: r1(lr.left), height: r1(lr.height), clientW: text.clientWidth, scrollW: text.scrollWidth,
        lineHeight: parseFloat(cs.lineHeight), fontSize: parseFloat(cs.fontSize), full: label.textContent,
      } : null,
    }
  })
}

/** 以視窗寬 vw 開展示「水平」story(可注入破壞、可把最後一步換成長名字),回 { items, olWidth } 或 { instrument }。 */
async function openHorizontal(page, origin, vw, sabotageCss, longLast) {
  await page.setViewportSize({ width: vw, height: 600 })
  await openStory(page, `${origin}/iframe.html?id=${encodeURIComponent(H_STORY)}&viewMode=story`, {
    waitFor: 'ol[data-orientation="horizontal"] [data-steps-connector="horizontal"]',
    settleFrames: 3,
    beforeSettle: sabotageCss ? async (p) => { await p.addStyleTag({ content: sabotageCss }) } : null,
  })
  if (longLast) {
    // 不新增 story(E12 指示:既有水平範例優先):把展示 story 最後一步的名字換成長名字,其餘不動
    const replaced = await page.evaluate((longName) => {
      const labels = document.querySelectorAll('ol[data-orientation="horizontal"] > li[data-state] [data-steps-label]')
      const lastLabel = labels[labels.length - 1]
      const textHost = lastLabel?.firstElementChild ?? lastLabel
      if (!textHost || textHost.childNodes.length !== 1 || textHost.firstChild.nodeType !== Node.TEXT_NODE) return false
      textHost.firstChild.nodeValue = longName
      return true
    }, LONG_LAST_NAME)
    if (!replaced) return { instrument: '找不到最後一步步驟名的文字節點,換不了長名字' }
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  }
  const items = await page.evaluate(readHorizontalInPage)
  if (!items || items.length < 2 || items.some((it) => !it.label)) return { instrument: '找不到水平步驟條或 [data-steps-label]' }
  const olWidth = await page.evaluate(() => document.querySelector('ol[data-orientation="horizontal"]')?.getBoundingClientRect().width ?? NaN)
  return { items, olWidth }
}

/** 開展示「水平」story 量一個場景;sabotageCss = 對照組注入的破壞。回 { scene } 或 { instrument }。 */
async function measureHorizontalScene(page, origin, name, sabotageCss = null) {
  let opened
  let derived = null
  try {
    if (name === 'long-last') {
      // 先在參考寬量內容,再換到推導出的寬度重開(檔頭「長名字場景的寬度」;字型不同的機器各自推出自己的寬度)
      const ref = await openHorizontal(page, origin, LONG_LAST_REF_VW, sabotageCss, true)
      if (ref.instrument) return { instrument: `${name}:${ref.instrument}` }
      const it = ref.items
      const f = it[0]
      const L = it[it.length - 1]
      const d = deriveLongLastWidth({
        n: it.length,
        gap: it[1].liLeft - f.liRight,
        // 圓欄 + 縫(字的左緣 − 步的左緣)+ 字到線的縫(線的左緣 − 字的右緣)+ 水平線的地板
        chromeFront: (f.label.left - f.liLeft) + (f.conn ? f.conn.left - (f.label.left + f.label.clientW) : NaN) + H_MIN_LINE_PX,
        fontSize: f.label.fontSize,
        lastNatural: (L.label.left - L.liLeft) + L.label.scrollW,
      })
      if (d.infeasible) return { instrument: `${name}:推不出長名字場景的寬度 —— ${d.infeasible}` }
      const vw = Math.round(LONG_LAST_REF_VW - ref.olWidth + d.container)
      opened = await openHorizontal(page, origin, vw, sabotageCss, true)
      if (!opened.instrument && Math.abs(opened.olWidth - d.container) > 1) return { instrument: `${name}:視窗 ${vw} 的步驟條寬 ${opened.olWidth} ≠ 推導的容器寬 ${d.container}` }
      derived = { container: d.container, lower: d.lower, upper: Math.min(d.upper, d.truncBound), vw }
    } else {
      opened = await openHorizontal(page, origin, name === 'narrow' ? NARROW_VW : WIDE_VW, sabotageCss, false)
    }
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) return { instrument: `${name}:${error.message}` }
    throw error
  }
  if (opened.instrument) return { instrument: `${name}:${opened.instrument}` }
  const { items } = opened
  const tooltips = []
  // 窄:每一步都滑過(被截斷的要出、沒被截斷的不出);寬:滑過第一步(不該出);長名字只量幾何
  const toHover = name === 'narrow' ? items.map((_, i) => i) : name === 'wide' ? [0] : []
  for (const i of toHover) {
    const it = items[i]
    const truncated = isTruncated(it.label)
    const target = page.locator('ol[data-orientation="horizontal"] > li[data-state]').nth(i).locator('[data-steps-label] > *').first()
    try { await target.hover({ timeout: 5000, force: true }) } catch (e) { return { instrument: `${name}:滑不到第 ${i + 1} 步步驟名(${e.message.split('\n')[0]})` } }
    const shown = await page.waitForFunction((full) => [...document.querySelectorAll('[role="tooltip"]')]
      .some((x) => x.textContent === full && x.parentElement.getBoundingClientRect().width > 1), it.label.full, { timeout: truncated ? 2500 : 1500 }).then(() => true, () => false)
    tooltips.push({ i, truncated, shown })
    // 收掉 tooltip 再滑下一步(Radix 離開觸發點後要再一次指標移動才判定出了 grace 區,分步移兩次)
    await page.mouse.move(1, 590, { steps: 4 })
    await page.mouse.move(3, 588)
    await page.waitForFunction(() => !document.querySelector('[data-radix-popper-content-wrapper]'), null, { timeout: 4000 }).catch(() => {})
  }
  return { scene: { name, items, tooltips, ...(derived ? { derived } : {}) } }
}

const HORIZONTAL_SCENES = ['narrow', 'wide', 'long-last']

// 模擬 CI Linux 沒有 CJK 字型時的字寬:目標每字 8px(PR #174 log:購物車 24 / 長名字 88)。
// 字距 = 目標 − 這台機器實測的字寬(selftest 開跑先量 measureGlyphPx);實測已 ≤ 目標 → 不套(模擬即現況)。
// 不寫死 −6:2026-11-27 寫死時在 CI(本來就 8px)變成每字約 2px,最後一步自然寬只剩 58,推不出寬度 → 兩格儀器失效(CI 3eca5afd)。
export const TARGET_GLYPH_PX = 8
/** 純函式:實測字寬 → 模擬目標字寬要注入的 CSS;實測 ≤ 目標回 ''(不套) */
export function narrowGlyphCss(measuredPx) {
  if (!(measuredPx > TARGET_GLYPH_PX)) return ''
  return `ol[data-orientation="horizontal"] [data-steps-label] > *{letter-spacing:${(TARGET_GLYPH_PX - measuredPx).toFixed(2)}px!important}`
}
/** 量這台機器上步驟名中文字的平均字寬(寬版、沒被截斷的第一步「購物車」,Range 取次像素寬 ÷ 字數)。回 { px } 或 { instrument } */
async function measureGlyphPx(page, origin) {
  const opened = await openHorizontal(page, origin, WIDE_VW, null, false)
  if (opened.instrument) return { instrument: opened.instrument }
  const px = await page.evaluate(() => {
    const host = document.querySelector('ol[data-orientation="horizontal"] > li[data-state] [data-steps-label]')
    const text = host?.firstElementChild ?? host
    const node = text?.firstChild
    if (!node || node.nodeType !== Node.TEXT_NODE || !/^[一-鿿]+$/.test(node.nodeValue)) return NaN
    const range = document.createRange()
    range.selectNodeContents(node)
    return range.getBoundingClientRect().width / node.nodeValue.length
  })
  return Number.isFinite(px) && px > 0 ? { px: Math.round(px * 100) / 100 } : { instrument: `量不到步驟名的中文字寬(${px})` }
}
const NO_SHRINK_LAST_CSS = 'ol[data-orientation="horizontal"] > li:last-child{flex:none!important;max-width:none!important}'

// 真建置上的八種破壞(selftest (b)):各自必須讓指定那一項紅
const LIVE_SABOTAGE = [
  ['拿掉截斷(步驟名照修前不准縮、不截斷)', 'narrow',
    'div:has(> [data-steps-label]){flex-shrink:0!important}[data-steps-label] > *{overflow:visible!important;text-overflow:clip!important}', 'connector-into-next'],
  ['步驟名改回折行', 'narrow', '[data-steps-label] > *{white-space:normal!important}', 'single-line'],
  ['tooltip 藏掉', 'narrow', '[data-radix-popper-content-wrapper]{display:none!important}', 'tooltip'],
  ['最後一步照修前不准縮', 'long-last', NO_SHRINK_LAST_CSS, 'long-last-squeezed'],
  // css 是函式的格:以實測字寬組 CSS(見 narrowGlyphCss)
  ['最後一步照修前不准縮(字寬約 8px,模擬 CI Linux)', 'long-last', (glyphPx) => narrowGlyphCss(glyphPx) + NO_SHRINK_LAST_CSS, 'long-last-squeezed'],
  ['最後一步撐滿(拿掉自然寬上限)', 'wide', 'ol[data-orientation="horizontal"] > li:last-child{max-width:none!important}', 'wide-last-natural'],
  // 水平地板 12 的兩面(E12w):連接線外層的 inline minWidth 被 !important 蓋掉
  ['水平地板改回 24', 'narrow', 'div:has(> [data-steps-connector="horizontal"]){min-width:24px!important}', 'connector-floor'],
  ['水平地板改成 8', 'narrow', 'div:has(> [data-steps-connector="horizontal"]){min-width:8px!important}', 'connector-floor'],
]
// 綠面(selftest (c)):只換字寬、不破壞,修後形狀必須全綠 —— 證明上一組的紅來自破壞,不是窄字型本身
const LIVE_GREEN = [
  ['字寬約 8px(模擬 CI Linux)的修後長名字場景', 'long-last', (glyphPx) => narrowGlyphCss(glyphPx)],
]

async function withBrowser(fn) {
  requireFreshStorybookBuild(STATIC, SOURCES)
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    return await fn(page, server.origin)
  } finally { await browser.close(); await server.stop() }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    if (process.argv.includes('--selftest')) {
      const tableOk = selftestTable()
      // (b) 真建置上的破壞:沒有建置 → requireFreshStorybookBuild 印 MISSING-BUILD / STALE-BUILD(meta-test 認得的略過標記)
      const live = await withBrowser(async (page, origin) => {
        const problems = []
        const glyph = await measureGlyphPx(page, origin)
        if (glyph.instrument) return [`${INSTRUMENT_FAIL_MARKER}(量字寬):${glyph.instrument}`]
        const glyphNote = narrowGlyphCss(glyph.px)
          ? `實測字寬 ${glyph.px}px → 字距 ${(TARGET_GLYPH_PX - glyph.px).toFixed(2)}px 模擬到 ${TARGET_GLYPH_PX}px`
          : `本機字寬 ${glyph.px}px 已 ≤ ${TARGET_GLYPH_PX},模擬即現況(不套字距)`
        console.log(`  字寬模擬:${glyphNote}`)
        const cssOf = (css) => { const s = typeof css === 'function' ? css(glyph.px) : css; return s || null }
        for (const [name, sceneName, css, kind] of LIVE_SABOTAGE) {
          const r = await measureHorizontalScene(page, origin, sceneName, cssOf(css))
          if (r.instrument) { problems.push(`${INSTRUMENT_FAIL_MARKER}(對照組「${name}」):${r.instrument}`); continue }
          const fails = judgeHorizontal(r.scene)
          const hit = fails.filter((x) => x.kind === kind)
          if (hit.length) console.log(`✓ 對照組「${name}」→ ${kind} 紅 ${hit.length} 處(例:${hit[0].msg})`)
          else problems.push(`對照組「${name}」沒有讓 ${kind} 紅 —— 量具無效;實得 ${fails.map((x) => x.kind).join(', ') || '全綠'}`)
        }
        for (const [name, sceneName, css] of LIVE_GREEN) {
          const r = await measureHorizontalScene(page, origin, sceneName, cssOf(css))
          if (r.instrument) { problems.push(`${INSTRUMENT_FAIL_MARKER}(綠面「${name}」):${r.instrument}`); continue }
          const fails = judgeHorizontal(r.scene)
          const at = r.scene.derived ? `容器 ${r.scene.derived.container}(區間 [${r.scene.derived.lower}, ${r.scene.derived.upper}))` : ''
          if (fails.length) problems.push(`綠面「${name}」應全綠 ${at},實得 ${fails.map((x) => x.msg).join(' | ')}`)
          else console.log(`✓ 綠面「${name}」全綠 ${at}`)
        }
        return problems
      })
      if (live === null) process.exit(tableOk ? 0 : 1) // 起不了瀏覽器:launchBrowserOrSkip 已印判定
      if (live.length) console.error('❌ steps-connector-geometry selftest(真建置破壞)FAIL:\n  ' + live.join('\n  '))
      else console.log(`✅ steps-connector-geometry selftest 真建置破壞 ${LIVE_SABOTAGE.length} 種全部讓指定那一項紅、綠面 ${LIVE_GREEN.length} 種全綠`)
      process.exit(tableOk && !live.length ? 0 : 1)
    }
    const result = await withBrowser(async (page, origin) => {
      const sizes = await measureVertical(page, origin)
      const scenes = []
      const instrument = []
      for (const name of HORIZONTAL_SCENES) {
        const r = await measureHorizontalScene(page, origin, name)
        if (r.instrument) instrument.push(r.instrument)
        else scenes.push(r.scene)
      }
      return { sizes, scenes, instrument }
    })
    if (result === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / INSTRUMENT-FAIL 判定
    const { sizes, scenes, instrument } = result
    for (const s of sizes) console.log(`  ${s.size.padEnd(3)} ${s.lines.map((l) => `高 ${l.height} 縫 ${l.gapTop}/${l.gapBottom}`).join(' | ')}`)
    for (const sc of scenes) {
      console.log(`  水平 ${sc.name.padEnd(9)} ${sc.items.map((it) => `[li ${it.liW}${it.conn ? ` 線 ${it.conn.width}` : ''} 字 ${it.label.clientW}/${it.label.scrollW}]`).join(' ')}`
        + (sc.tooltips.length ? `  tooltip ${sc.tooltips.map((t) => `${t.i + 1}:${t.truncated ? '截' : '未'}→${t.shown ? '有' : '無'}`).join(' ')}` : '')
        + (sc.derived ? `  容器 ${sc.derived.container}(視窗 ${sc.derived.vw};由實測推導,區間 [${sc.derived.lower}, ${sc.derived.upper}))` : ''))
    }
    const failures = judge(sizes)
    if (sizes.length < 3) failures.push(`${INSTRUMENT_FAIL_MARKER}:只量到 ${sizes.length} 組尺寸(應 3)`)
    for (const msg of instrument) failures.push(`${INSTRUMENT_FAIL_MARKER}:${msg}`)
    for (const sc of scenes) {
      for (const x of judgeHorizontal(sc)) failures.push(x.kind === 'premise' ? `${INSTRUMENT_FAIL_MARKER}:${x.msg}` : x.msg)
    }
    if (failures.length) { console.error('❌ steps-connector-geometry FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log('✅ steps-connector-geometry PASS(垂直:三尺寸無說明的連接線 ≥ 24px、兩端縫 8px;水平:480 截斷不壓圓 + 線 ≥ 12 且截斷時 = 12 + 截斷才顯 tooltip、960 與修前同形、最後一步長名字不把前面擠成「…」)')
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
