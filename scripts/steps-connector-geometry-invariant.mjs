#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: (一)垂直:Steps 垂直排列、**沒有說明文字**時,三個尺寸的連接線都符合 `steps.spec.md`「Connector 幾何」——
 *         線高 ≥ 24px(地板,MUI StepConnector vertical minHeight 24),圓到線的縫兩端各 8px(對稱),而且線長不是「列高的餘數」。
 *         (二)水平(2026-11-26 E12,`steps.spec.md`「水平版步驟名放不下」;user 原話「照你建議」= 丙):量既有的展示「水平」story,
 *         不新增 story,三個場景 ——
 *           窄(視窗 480,E12 重現寬度):每條連接線右端不進下一步的圓、線寬 ≥ 24;步驟名單行;被截斷的步驟名滑過出現全名 tooltip、
 *             沒被截斷的不出現(tooltip.spec.md:30「只有當文字實際被截斷時才顯示」);
 *           寬(視窗 960):畫面與修前一致 —— 用修前的排版模型逐項比:沒有步驟名被截斷、前面每一步等寬、最後一步 = 自己的自然寬
 *             (圓欄 + 縫 + 字寬)、連接線伸到該步右緣、滑過不出 tooltip;
 *           最後一步長名字(視窗 592,把最後一步名字換成 LONG_LAST_NAME):前面每一步的步驟名可見寬 ≥ 1 個字寬(不被全擠成「…」)、
 *             最後一步不比前面每一步寬(放不下時一起分寬)。
 *   紅: 垂直:任一尺寸的線高 < 24、或任一端的縫 ≠ 8(±0.6px,subpixel)→ 指名尺寸與數字並 exit 1。
 *       歷史紅燈(2026-09-29 修法前實測,`storybook-static` 尺寸對照表):sm 18.2 / md **2.2** / lg **0** —— 線長 = li 高 − 2r − 16,
 *       無說明時 md 幾乎看不見、lg 根本沒有線(user 09-26:「所以這是沒按照設計規格?」→ 裁「兩者都是」)。
 *       水平:上列任一項不符 → 指名場景、第幾步、哪一項與數字並 exit 1。歷史紅燈(2026-11-26 修前實測,480 寬):第 2 步連接線 216–240、
 *       下一步從 208 開始 —— 線整段落在下一步裡、「4」被劃過(steps.tsx 步驟名外層 `shrink-0`)。
 *   綠: 垂直:修法後三尺寸線高 = 24(sm/md/lg 的 li 最小高 48/64/72),縫 8/8;水平:三個場景全部符合。重複跑恆等(無動畫;tooltip 等它畫出來,不用固定睡眠)。
 *   量法: 靜態站開 story,讀 `[data-steps-indicator]` / `[data-steps-connector]` / `[data-steps-label]` 的 getBoundingClientRect 與
 *         scrollWidth / clientWidth(M32:量像素幾何,不看 class);tooltip 由 Playwright 真的滑過步驟名、等 `[role="tooltip"]` 畫出來。
 *   對照組(`--selftest`):(a) 判定表 —— 修前實測數字(垂直 18.2 / 2.2 / 0、水平 480 的 216–240 對 208)與每一項的壞形狀必紅、好形狀必綠;
 *         (b) 有建置時,在真的建置上注入五種破壞,各自讓指定那一項紅:拿掉截斷(步驟名照修前不准縮)→ 窄的連接線進圓;
 *         步驟名改回折行 → 窄的單行紅;tooltip 藏掉 → 窄的 tooltip 紅;最後一步照修前不准縮 → 長名字的「前面被擠成…」紅;
 *         最後一步撐滿 → 寬的「最後一步自然寬」紅。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const STORY = 'design-system-components-steps-設計規格--size-matrix'
// 與 steps.tsx 的 CONNECTOR_MIN_PX / CONNECTOR_GAP_PX 同值(規格數字住 steps.spec.md「Connector 幾何」)
export const MIN_LINE_PX = 24
export const GAP_PX = 8
const TOL = 0.6

// ── 水平場景(steps.spec.md「水平版步驟名放不下」)────────────────────────────
export const H_STORY = 'design-system-components-steps-展示--horizontal'
export const NARROW_VW = 480 // E12 重現的寬度
export const WIDE_VW = 960
export const LONG_LAST_VW = 592 // 展示 story 是 padded 版面:容器 = 592 − 左右各 16 = 560(實際值從 DOM 讀,不靠這個算)
// 結帳流程最後一步寫成長名字(展示 story 原本是「完成」);修前最後一步不准縮,前面每一步只剩約 8px 給字
export const LONG_LAST_NAME = '確認訂單並開立電子發票'
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
      if (!(l.height >= MIN_LINE_PX - TOL)) failures.push(`${size} 第 ${i + 1} 條線高 ${l.height}px < ${MIN_LINE_PX}(無說明文字時線幾乎消失)`)
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
    if (!(it.conn.width >= MIN_LINE_PX - TOL)) f('connector-floor', `第 ${i + 1} 步連接線寬 ${it.conn.width} < ${MIN_LINE_PX}`)
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
// 一步 = 圓 24 + 縫 12 + 字 + 縫 12 + 線;數字照 md 尺寸(字 14px、行高 18.2)
function step(left, width, { label = 42, shown = null, conn = true, connRight = null, lines = 1, clientW = null } = {}) {
  const right = left + width
  const labelLeft = left + 36
  const cw = clientW ?? Math.min(label, Math.max(0, width - 36 - (conn ? 36 : 0)))
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
  // 修後 480 實際形狀:前四步 84 寬、字剩 12px 被截斷;最後一步「完成」64 自然寬
  ['修後 480:前四步截斷 + tooltip、最後一步自然寬', sceneOf('narrow', row([{ w: 84 }, { w: 84, label: 56 }, { w: 84, label: 56 }, { w: 84, label: 28 }, { w: 64, label: 28 }])), []],
  // 修前 480 真實紅燈(2026-11-26 e-measure):li 84、連接線 216–240、下一步從 208 開始(步驟名不准縮,線被推出去)
  ['修前 480:第 2 步連接線 216–240 進到下一步(208)', sceneOf('narrow', [
    { liLeft: 16, liRight: 100, liW: 84, indLeft: 16, conn: { left: 106, right: 130, width: 24 }, label: { left: 52, height: 18.2, clientW: 42, scrollW: 42, lineHeight: 18.2, fontSize: 14, full: '購物車' } },
    { liLeft: 112, liRight: 196, liW: 84, indLeft: 112, conn: { left: 216, right: 240, width: 24 }, label: { left: 148, height: 18.2, clientW: 56, scrollW: 56, lineHeight: 18.2, fontSize: 14, full: '寄送地址' } },
    { liLeft: 208, liRight: 292, liW: 84, indLeft: 208, conn: { left: 312, right: 336, width: 24 }, label: { left: 244, height: 18.2, clientW: 56, scrollW: 56, lineHeight: 18.2, fontSize: 14, full: '運送方式' } },
    { liLeft: 304, liRight: 388, liW: 84, indLeft: 304, conn: { left: 380, right: 404, width: 24 }, label: { left: 340, height: 18.2, clientW: 28, scrollW: 28, lineHeight: 18.2, fontSize: 14, full: '付款' } },
    { liLeft: 400, liRight: 464, liW: 64, indLeft: 400, conn: null, label: { left: 436, height: 18.2, clientW: 28, scrollW: 28, lineHeight: 18.2, fontSize: 14, full: '完成' } },
  ], [{ i: 0, truncated: false, shown: false }]), ['connector-into-next', 'premise']],
  ['步驟名折成兩行', sceneOf('narrow', row([{ w: 84, lines: 3, clientW: 12 }, { w: 84, label: 56 }, { w: 64, label: 28 }])), ['single-line']],
  ['被截斷卻滑過沒有 tooltip', sceneOf('narrow', row([{ w: 84, shown: false }, { w: 84, label: 56 }, { w: 64, label: 28 }])), ['tooltip']],
  ['沒被截斷卻出 tooltip', sceneOf('narrow', row([{ w: 84 }, { w: 84, label: 56 }, { w: 64, label: 28, shown: true }])), ['tooltip']],
  ['連接線被擠到 20(< 24)', sceneOf('narrow', row([{ w: 84 }, { w: 80 }, { w: 64, label: 28 }]).map((it, i) => (i === 0 ? { ...it, conn: { ...it.conn, left: it.conn.right - 20, width: 20 } } : it))), ['connector-floor']],
  // 寬 960(容器 768):前四步各 164、最後一步「完成」64 = 36 + 28
  ['寬:修前同形(前四步等寬、最後一步自然寬、線伸到右緣)', sceneOf('wide', row([{ w: 164 }, { w: 164, label: 56 }, { w: 164, label: 56 }, { w: 164, label: 28 }, { w: 64, label: 28 }])), []],
  ['寬:最後一步撐滿成跟前面一樣寬', sceneOf('wide', row([{ w: 144 }, { w: 144, label: 56 }, { w: 144, label: 56 }, { w: 144, label: 28 }, { w: 144, label: 28 }])), ['wide-last-natural']],
  ['寬:前面不等寬', sceneOf('wide', row([{ w: 150 }, { w: 178, label: 56 }, { w: 164, label: 56 }, { w: 164, label: 28 }, { w: 64, label: 28 }])), ['wide-equal']],
  ['寬:有步驟名被截斷', sceneOf('wide', row([{ w: 164, label: 200 }, { w: 164, label: 56 }, { w: 64, label: 28 }])), ['wide-truncated']],
  ['寬:連接線沒伸到右緣', sceneOf('wide', row([{ w: 164, connRight: 150 }, { w: 164, label: 56 }, { w: 64, label: 28 }])), ['wide-connector-fill']],
  // 長名字(容器 560、五步):修後每步 102.4;修前最後一步不准縮 190 → 前面每步 80.5、字只剩 8.5
  ['長名字:修後一起分寬', sceneOf('long-last', row([{ w: 102.4 }, { w: 102.4, label: 56 }, { w: 102.4, label: 56 }, { w: 102.4, label: 28 }, { w: 102.4, label: 154 }])), []],
  // 修前最後一步是自然寬、不截斷 → 同時報「前提不成立」(主跑時是儀器失效);對照組只認 long-last-squeezed
  ['長名字:修前最後一步不准縮,前面被擠成「…」', sceneOf('long-last', row([{ w: 80.5 }, { w: 80.5, label: 56 }, { w: 80.5, label: 56 }, { w: 80.5, label: 28 }, { w: 190, label: 154 }])), ['long-last-squeezed', 'premise']],
  ['長名字:最後一步被截斷卻比前面寬', sceneOf('long-last', row([{ w: 102.4 }, { w: 102.4, label: 56 }, { w: 102.4, label: 56 }, { w: 102.4, label: 28 }, { w: 140, label: 154 }])), ['long-last-wider']],
]

function selftestTable() {
  let ok = true
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
  console.log(ok ? `✅ steps-connector-geometry selftest 判定表 PASS(垂直 4 格 + 水平 ${HORIZONTAL_TABLE.length} 格)` : '❌ steps-connector-geometry selftest 判定表 FAIL')
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

/** 開展示「水平」story 量一個場景;sabotageCss = 對照組注入的破壞。回 { scene } 或 { instrument }。 */
async function measureHorizontalScene(page, origin, name, sabotageCss = null) {
  const vw = name === 'narrow' ? NARROW_VW : name === 'wide' ? WIDE_VW : LONG_LAST_VW
  await page.setViewportSize({ width: vw, height: 600 })
  try {
    await openStory(page, `${origin}/iframe.html?id=${encodeURIComponent(H_STORY)}&viewMode=story`, {
      waitFor: 'ol[data-orientation="horizontal"] [data-steps-connector="horizontal"]',
      settleFrames: 3,
      beforeSettle: sabotageCss ? async (p) => { await p.addStyleTag({ content: sabotageCss }) } : null,
    })
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) return { instrument: `${name}:${error.message}` }
    throw error
  }
  if (name === 'long-last') {
    // 不新增 story(E12 指示:既有水平範例優先):把展示 story 最後一步的名字換成長名字,其餘不動
    const replaced = await page.evaluate((longName) => {
      const labels = document.querySelectorAll('ol[data-orientation="horizontal"] > li[data-state] [data-steps-label]')
      const lastLabel = labels[labels.length - 1]
      const textHost = lastLabel?.firstElementChild ?? lastLabel
      if (!textHost || textHost.childNodes.length !== 1 || textHost.firstChild.nodeType !== Node.TEXT_NODE) return false
      textHost.firstChild.nodeValue = longName
      return true
    }, LONG_LAST_NAME)
    if (!replaced) return { instrument: `${name}:找不到最後一步步驟名的文字節點,換不了長名字` }
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  }
  const items = await page.evaluate(readHorizontalInPage)
  if (!items || items.some((it) => !it.label)) return { instrument: `${name}:找不到水平步驟條或 [data-steps-label]` }
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
  return { scene: { name, items, tooltips } }
}

const HORIZONTAL_SCENES = ['narrow', 'wide', 'long-last']

// 真建置上的五種破壞(selftest (b)):各自必須讓指定那一項紅
const LIVE_SABOTAGE = [
  ['拿掉截斷(步驟名照修前不准縮、不截斷)', 'narrow',
    'div:has(> [data-steps-label]){flex-shrink:0!important}[data-steps-label] > *{overflow:visible!important;text-overflow:clip!important}', 'connector-into-next'],
  ['步驟名改回折行', 'narrow', '[data-steps-label] > *{white-space:normal!important}', 'single-line'],
  ['tooltip 藏掉', 'narrow', '[data-radix-popper-content-wrapper]{display:none!important}', 'tooltip'],
  ['最後一步照修前不准縮', 'long-last', 'ol[data-orientation="horizontal"] > li:last-child{flex:none!important;max-width:none!important}', 'long-last-squeezed'],
  ['最後一步撐滿(拿掉自然寬上限)', 'wide', 'ol[data-orientation="horizontal"] > li:last-child{max-width:none!important}', 'wide-last-natural'],
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
        for (const [name, sceneName, css, kind] of LIVE_SABOTAGE) {
          const r = await measureHorizontalScene(page, origin, sceneName, css)
          if (r.instrument) { problems.push(`${INSTRUMENT_FAIL_MARKER}(對照組「${name}」):${r.instrument}`); continue }
          const fails = judgeHorizontal(r.scene)
          const hit = fails.filter((x) => x.kind === kind)
          if (hit.length) console.log(`✓ 對照組「${name}」→ ${kind} 紅 ${hit.length} 處(例:${hit[0].msg})`)
          else problems.push(`對照組「${name}」沒有讓 ${kind} 紅 —— 量具無效;實得 ${fails.map((x) => x.kind).join(', ') || '全綠'}`)
        }
        return problems
      })
      if (live === null) process.exit(tableOk ? 0 : 1) // 起不了瀏覽器:launchBrowserOrSkip 已印判定
      if (live.length) console.error('❌ steps-connector-geometry selftest(真建置破壞)FAIL:\n  ' + live.join('\n  '))
      else console.log(`✅ steps-connector-geometry selftest 真建置破壞 ${LIVE_SABOTAGE.length} 種全部讓指定那一項紅`)
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
        + (sc.tooltips.length ? `  tooltip ${sc.tooltips.map((t) => `${t.i + 1}:${t.truncated ? '截' : '未'}→${t.shown ? '有' : '無'}`).join(' ')}` : ''))
    }
    const failures = judge(sizes)
    if (sizes.length < 3) failures.push(`${INSTRUMENT_FAIL_MARKER}:只量到 ${sizes.length} 組尺寸(應 3)`)
    for (const msg of instrument) failures.push(`${INSTRUMENT_FAIL_MARKER}:${msg}`)
    for (const sc of scenes) {
      for (const x of judgeHorizontal(sc)) failures.push(x.kind === 'premise' ? `${INSTRUMENT_FAIL_MARKER}:${x.msg}` : x.msg)
    }
    if (failures.length) { console.error('❌ steps-connector-geometry FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log('✅ steps-connector-geometry PASS(垂直:三尺寸無說明的連接線 ≥ 24px、兩端縫 8px;水平:480 截斷不壓圓 + 截斷才顯 tooltip、960 與修前同形、最後一步長名字不把前面擠成「…」)')
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
