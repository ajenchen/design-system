#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DialogContent 的寬度照 `components/Dialog/dialog.spec.md`「寬度檔位」走(2026-11-15 A18;user 2026-11-11「對話框寬:訂檔位」,
 *         定義 = AI 建議、user 2026-11-15「其他的部分照你建議我沒有意見」採納):
 *         四檔 sm 400 / md 480(預設)/ lg 640 / xl 960 都是**最大寬**,實際寬 = min(檔位或數字, 所在區塊寬 − 2 × 48),沒有下限;
 *         數字寬不設上限(不被 xl 夾住)(舊名 maxWidth 2026-11-15 移除,0.x 不留舊名;它的三格一起拿掉);
 *         所在區塊平常是視窗,傳 portalContainer 時是那個舞台 —— 寬與高都以它算(「Viewport Inset」)。
 *         量的是夾具裡真的渲染出來的外框(offsetWidth / offsetHeight 與 getBoundingClientRect 對舞台的四邊距離),不是讀 class 或常數(M32)。
 *         W1 視窗 1440×900:四檔 = 400 / 480 / 640 / 960;不傳 = 480;width={720} = 720、width={1200} = 1200;
 *            height="fill" 高 = 900 − 96。
 *         W2 視窗 700×900:lg、xl、width={1200} 都是 604,md 照 480;視窗 375×800:sm、xl 都是 279(沒有下限)。
 *         W3 視窗 1440×900、600×700 的 portalContainer 舞台:lg、xl 都是 504,md 照 480;四邊離舞台至少 48;height="fill" 高 = 700 − 96 = 604。
 *   紅: 任一格量到的寬 / 高 / 四邊距離不符(寬高容差 1px,四邊下限容差 0.5px)。
 *       `--selftest` 在同一份夾具的打包檔上做三種破法,各自必須讓指定的格紅、而且破法真的套上了(改寫數 = 1):
 *       (a) tiers  檔位表 lg 640 → 600                         → W1-lg 紅
 *       (b) vw     所在區塊寬改回 100vw(2026-11-15 前的寫法)    → W3-lg / W3-xl / W3-fill 紅(舞台裡撐到 600、四邊 0)
 *       (c) svh    所在區塊高改回 100svh(2026-11-15 前的寫法)   → W3-fill 紅(高 804 > 舞台 700)
 *       任一種沒改寫到 / 改寫了卻沒紅 = 儀器失效,exit 1。
 *       夾具打包失敗、找不到建置 CSS、頁面沒渲染出對話框 = INSTRUMENT-FAIL(exit 1),不是通過也不是產品裁決;沒有 storybook 建置 = MISSING-BUILD(exit 2)。
 *   綠: 全部格相符。夾具每次從這次 checkout 的原始碼重新打包(lib/storybook-css-fixture.mjs),樣式取指定建置的 preview CSS;
 *       開頁以「對話框本身出現 + 版面連續靜止」為準(openStory),關掉動畫(prefers-reduced-motion)量穩態,不靠固定睡眠。
 *   註: 夾具 = scripts/test-fixtures/dialog-width/fixture.tsx(參數走網址;為什麼不是 story 寫在夾具檔頭)。
 *       期望值寫在本檔、不讀 dialog.tsx 的常數 —— 對照的是規格表,讀元件常數就成了自己驗自己。
 *
 *   node scripts/dialog-width-invariant.mjs [--build=<storybook 建置目錄>] [--selftest]
 */
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { FixtureInstrumentError, startStorybookCssFixture } from './lib/storybook-css-fixture.mjs'
import { printSelftestLine } from './lib/gate-selftest-meta.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const buildArg = process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length)
const STATIC = buildArg ? (isAbsolute(buildArg) ? buildArg : join(process.cwd(), buildArg)) : join(REPO, 'storybook-static')
const FIXTURE_SOURCE = 'scripts/test-fixtures/dialog-width/fixture.tsx'
const INSET = 48
/** 規格表(dialog.spec.md「寬度檔位」)的期望值 —— 刻意不 import 元件常數 */
const TIER = { sm: 400, md: 480, lg: 640, xl: 960 }
const DESKTOP = [1440, 900]

/** 每一格:視窗、夾具網址參數、期望。insets = 要求四邊離所在區塊(舞台或視窗)至少 48 */
const CASES = [
  ...Object.entries(TIER).map(([t, px]) => ({ id: `W1-${t}`, vp: DESKTOP, q: { w: t }, what: `1440 寬 width="${t}" = ${px}`, expect: { width: px, insets: true } })),
  { id: 'W1-default', vp: DESKTOP, q: {}, what: '不傳 width = md 480', expect: { width: TIER.md, insets: true } },
  { id: 'W1-number', vp: DESKTOP, q: { w: '720' }, what: 'width={720} = 720', expect: { width: 720, insets: true } },
  { id: 'W1-number-over-xl', vp: DESKTOP, q: { w: '1200' }, what: 'width={1200} = 1200(自訂寬不被 xl 夾住)', expect: { width: 1200, insets: true } },
  { id: 'W1-fill', vp: DESKTOP, q: { w: 'md', h: 'fill' }, what: 'height="fill" 高 = 視窗 900 − 96', expect: { width: TIER.md, height: DESKTOP[1] - 2 * INSET, insets: true } },
  { id: 'W2-lg', vp: [700, 900], q: { w: 'lg' }, what: '700 寬 lg = 700 − 96 = 604', expect: { width: 604, insets: true } },
  { id: 'W2-xl', vp: [700, 900], q: { w: 'xl' }, what: '700 寬 xl = 604', expect: { width: 604, insets: true } },
  { id: 'W2-md', vp: [700, 900], q: { w: 'md' }, what: '700 寬 md 照 480', expect: { width: TIER.md, insets: true } },
  { id: 'W2-number', vp: [700, 900], q: { w: '1200' }, what: '700 寬 width={1200} 也被留白夾到 604', expect: { width: 604, insets: true } },
  { id: 'W2-narrow-sm', vp: [375, 800], q: { w: 'sm' }, what: '375 寬 sm = 279(沒有下限)', expect: { width: 279, insets: true } },
  { id: 'W2-narrow-xl', vp: [375, 800], q: { w: 'xl' }, what: '375 寬 xl = 279', expect: { width: 279, insets: true } },
  { id: 'W3-lg', vp: DESKTOP, q: { w: 'lg', stage: '600x700' }, what: '600×700 舞台 lg = 600 − 96 = 504', expect: { width: 504, insets: true, stage: true } },
  { id: 'W3-xl', vp: DESKTOP, q: { w: 'xl', stage: '600x700' }, what: '600×700 舞台 xl = 504', expect: { width: 504, insets: true, stage: true } },
  { id: 'W3-md', vp: DESKTOP, q: { w: 'md', stage: '600x700' }, what: '600×700 舞台 md 照 480', expect: { width: TIER.md, insets: true, stage: true } },
  { id: 'W3-fill', vp: DESKTOP, q: { w: 'xl', h: 'fill', stage: '600x700' }, what: '600×700 舞台 height="fill" 高 = 700 − 96 = 604', expect: { width: 504, height: 604, insets: true, stage: true } },
]

/** 對照組:同一份夾具打包檔上的三種破法(regex 打在常數上:寬 = dialog.tsx,高 = tokens/elevation/overlay-geometry.ts 的 MODAL_BLOCK_HEIGHT(2026-11-24 從 dialog.tsx 的 DIALOG_BLOCK_HEIGHT 搬過去);改寫數必須正好 1) */
const MUTATIONS = [
  { name: 'tiers', what: '檔位表 lg 640 → 600', re: /(DIALOG_WIDTH_TIERS\d*\s*=\s*\{[^}]*\blg:\s*)640\b/g, to: '$1600', mustFail: ['W1-lg'] },
  { name: 'vw', what: '所在區塊寬改回 100vw', re: /(DIALOG_BLOCK_WIDTH\d*\s*=\s*)"100%"/g, to: '$1"100vw"', mustFail: ['W3-lg', 'W3-xl', 'W3-fill'] },
  { name: 'svh', what: '所在區塊高改回 100svh', re: /(MODAL_BLOCK_HEIGHT\d*\s*=\s*)"min\(100svh, 100%\)"/g, to: '$1"100svh"', mustFail: ['W3-fill'] },
]

requireStorybookBuild(join(STATIC, 'index.json'))

let fx
try {
  fx = await startStorybookCssFixture(STATIC, { source: FIXTURE_SOURCE, label: '寬度檔位夾具', title: 'Dialog 寬度檔位夾具' })
} catch (error) {
  if (!(error instanceof FixtureInstrumentError)) throw error
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${error.message}(${FIXTURE_SOURCE})`)
  process.exit(1)
}
const browser = await launchBrowserOrSkip({}, { cleanup: () => fx.stop() })

const urlOf = (q) => `${fx.url}?${new URLSearchParams(q).toString()}`
const near = (a, b, tol) => Math.abs(a - b) <= tol

// 整支閘只開一個分頁:沙箱參數 --single-process 下關掉最後一個分頁會連瀏覽器一起收掉(2026-11-15 實測,第二輪 newPage 丟「browser has been closed」)。
// 各輪之間換路由攔截,不換分頁。
const page = await browser.newPage({ viewport: { width: DESKTOP[0], height: DESKTOP[1] }, reducedMotion: 'reduce' })

/** 跑一輪全部格;mutation 有給時改寫夾具打包檔。回傳每格判定與改寫數。儀器失效直接丟 StoryRenderInstrumentError。 */
async function runAll(mutation = null) {
  await page.unrouteAll({ behavior: 'wait' })
  let rewrites = 0
  if (mutation) {
    await page.route((u) => u.pathname.endsWith('/fixture.js'), async (route) => {
      const res = await route.fetch()
      const body = await res.text()
      const matches = body.match(mutation.re) ?? []
      rewrites = matches.length
      return route.fulfill({ response: res, body: body.replace(mutation.re, mutation.to), headers: { ...res.headers(), 'content-type': 'application/javascript' } })
    })
  }
  const rows = []
  {
    for (const c of CASES) {
      await page.setViewportSize({ width: c.vp[0], height: c.vp[1] })
      await openStory(page, urlOf(c.q), { waitFor: '#dw-dialog', settleFrames: 5, notFound: fx.notFound, label: `夾具 ${c.id}` })
      const m = await page.evaluate(() => {
        const d = document.getElementById('dw-dialog')
        if (!d) return null
        const stage = document.getElementById('dw-stage')
        const r = d.getBoundingClientRect()
        const b = stage ? stage.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
        return {
          width: d.offsetWidth, height: d.offsetHeight, inStage: !!stage && stage.contains(d),
          inset: { left: r.left - b.left, right: b.right - r.right, top: r.top - b.top, bottom: b.bottom - r.bottom },
        }
      })
      if (!m) throw new StoryRenderInstrumentError({ storyId: `夾具 ${c.id}`, url: urlOf(c.q), kind: 'missing-dialog', reason: '等到 #dw-dialog 之後量測當下它不在了', failedRequests: [] })
      const problems = []
      if (!near(m.width, c.expect.width, 1)) problems.push(`寬 ${m.width} ≠ ${c.expect.width}`)
      if (c.expect.height != null && !near(m.height, c.expect.height, 1)) problems.push(`高 ${m.height} ≠ ${c.expect.height}`)
      if (c.expect.stage && !m.inStage) problems.push('對話框沒有傳送進舞台(portalContainer 沒生效)')
      if (c.expect.insets) {
        const short = Object.entries(m.inset).filter(([, v]) => v < INSET - 0.5).map(([k, v]) => `${k} ${v.toFixed(1)}`)
        if (short.length) problems.push(`離${c.expect.stage ? '舞台' : '視窗'}邊少於 ${INSET}:${short.join('、')}`)
      }
      rows.push({ id: c.id, what: c.what, ok: problems.length === 0, detail: problems.join(';') || `寬 ${m.width}${c.expect.height != null ? `、高 ${m.height}` : ''}、四邊最小 ${Math.min(...Object.values(m.inset)).toFixed(1)}` })
    }
  }
  return { rows, rewrites }
}

let exitCode = 0
try {
  if (!SELFTEST) {
    const { rows } = await runAll()
    for (const r of rows) console.log(`${r.ok ? '✓' : '✗'} ${r.id} ${r.what} | ${r.detail}`)
    const bad = rows.filter((r) => !r.ok)
    console.log(bad.length ? `\n✗ dialog-width-invariant:${bad.length} / ${rows.length} 格不符(規格:packages/design-system/src/components/Dialog/dialog.spec.md「寬度檔位」)` : `\n✓ dialog-width-invariant:${rows.length} 格全部相符`)
    exitCode = bad.length ? 1 : 0
  } else {
    const verdicts = []
    for (const mutation of MUTATIONS) {
      const { rows, rewrites } = await runAll(mutation)
      const red = rows.filter((r) => !r.ok).map((r) => r.id)
      const missed = mutation.mustFail.filter((id) => !red.includes(id))
      const applied = rewrites === 1
      verdicts.push({ mutation, red, missed, applied, rewrites })
      console.log(`${applied && !missed.length ? '✓' : '✗'} 破法 ${mutation.name}(${mutation.what}):改寫 ${rewrites} 處;紅 ${red.length} 格 [${red.join(', ')}]${missed.length ? `;該紅沒紅:${missed.join(', ')}` : ''}`)
    }
    const broken = verdicts.filter((v) => !v.applied || v.missed.length)
    if (broken.length) {
      console.error(`\n✗ dialog-width-invariant --selftest:${broken.length} 種破法沒有套上或沒讓該紅的格紅 —— 這支閘量的不是它宣稱的東西`)
      exitCode = 1
    } else {
      printSelftestLine(`\n✓ dialog-width-invariant --selftest:${MUTATIONS.length} 種破法(檔位表 / 寬改回 100vw / 高改回 100svh)各自讓指定的格紅`)
    }
  }
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  console.error(`✗ ${error.message}`)
  exitCode = 1
} finally {
  await browser.close()
  await fx.stop()
}
process.exit(exitCode)
