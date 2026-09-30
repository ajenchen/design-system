#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Steps 垂直排列、**沒有說明文字**時,三個尺寸的連接線都符合 `steps.spec.md`「Connector 幾何」——
 *         線高 ≥ 24px(地板,MUI StepConnector vertical minHeight 24),圓到線的縫兩端各 8px(對稱),而且線長不是「列高的餘數」。
 *   紅: 任一尺寸的線高 < 24、或任一端的縫 ≠ 8(±0.6px,subpixel)→ 指名尺寸與數字並 exit 1。
 *       歷史紅燈(2026-09-29 修法前實測,`storybook-static` 尺寸對照表):sm 18.2 / md **2.2** / lg **0** —— 線長 = li 高 − 2r − 16,
 *       無說明時 md 幾乎看不見、lg 根本沒有線(user 09-26:「所以這是沒按照設計規格?」→ 裁「兩者都是」)。
 *   綠: 修法後三尺寸線高 = 24(sm/md/lg 的 li 最小高 48/64/72),縫 8/8;重複跑恆等(純幾何,無動畫、無時序)。
 *   量法: 靜態站開「尺寸對照表」story(三個尺寸各一組垂直、無說明的 Steps),讀 `[data-steps-indicator]` 與
 *         `[data-steps-connector="vertical"]` 的 getBoundingClientRect(M32:量像素幾何,不看 class);
 *         `--selftest` 把修法前的實測(18.2 / 2.2 / 0)餵進判定函式必紅、把修法後的形狀餵進去必綠。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const STORY = 'design-system-components-steps-設計規格--size-matrix'
export const MIN_LINE_PX = 24
export const GAP_PX = 8
const TOL = 0.6

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

function selftest() {
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
  console.log(ok ? '✅ steps-connector-geometry selftest PASS' : '❌ steps-connector-geometry selftest FAIL')
  return ok
}

async function measure() {
  requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/Steps/steps.tsx'])
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitFor: '[data-steps-connector="vertical"]' })
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
  } finally { await browser.close(); await server.stop() }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  try {
    const sizes = await measure()
    if (sizes === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / INSTRUMENT-FAIL 判定
    for (const s of sizes) console.log(`  ${s.size.padEnd(3)} ${s.lines.map((l) => `高 ${l.height} 縫 ${l.gapTop}/${l.gapBottom}`).join(' | ')}`)
    const failures = judge(sizes)
    if (sizes.length < 3) failures.push(`${INSTRUMENT_FAIL_MARKER}:只量到 ${sizes.length} 組尺寸(應 3)`)
    if (failures.length) { console.error('❌ steps-connector-geometry FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log('✅ steps-connector-geometry PASS(三尺寸無說明的垂直連接線 ≥ 24px、兩端縫 8px)')
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
