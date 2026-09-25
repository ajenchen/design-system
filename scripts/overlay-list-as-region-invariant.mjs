#!/usr/bin/env node
/**
 * 不變式:**浮層裡的選項清單,每一列的最前緣必須對齊該面板 header 標題的左緣**。
 *
 * owner:`packages/design-system/src/patterns/overlay-surface/overlay-surface.spec.md`
 * 「List-as-region in overlay body」第 2 條 invariant。列的水平內距是那裡唯一要客製的東西:
 * 選單脈絡預設 `px-3`(12px,= `--field-px`),浮層裡換成 `px-loose`(16px),讓列的前緣、
 * header 標題、footer 按鈕左緣落在同一條線上。
 *
 * **對齊的是列的前緣,不是文字**:列有前綴(勾選框 / icon / 頭像)時文字本來就會被推開
 * (`item-anatomy.spec.md:423` content 槽佔剩餘空間;`:677` 為了讓文字齊左而改前綴尺寸是錯誤示範)。
 *
 * 2026-09-17 錨:`CommandItem` 是兩層 —— 外層 cmdk Item 恆為 `p-0`(反白底色要鋪滿整列),
 * 內層 `MenuItem` 才帶 `px-3`。把 `px-loose` 寫進 `className` 會落在外層變成 16+12=28px,
 * 標題在 17px、勾選框在 29px,整份清單比標題多縮排 12px 卻沒有任何閘會紅
 * (當時 `grep -rl "List-as-region" scripts/` 回 0)。這支就是補那個洞。
 *
 * 量的是像素(`getBoundingClientRect`),不是 class 字串(M32)。全 story 掃,不抽樣。
 * 對照組 `--selftest`:把第一個面板的列多推 12px,這支必須紅;抓到 = exit 0,沒抓到 = exit 1。
 *
 * **沒量到 = 儀器失效(exit 1),不是通過**(2026-09-25,M37):每則 story 經 lib/launch-browser.mjs 的 openStory
 * (全部瀏覽器閘共用的唯一實作)開啟 —— 等 Storybook 回報這則渲染完成(**含 play**:不少面板是 play 點開的)、通過
 * render-health、版面連續靜止 SETTLE_FRAMES 個影格(浮層的進場動畫也要跑完,量的是左緣),才量列前緣。取代原本的
 * domcontentloaded + 等根節點有子元素(等不到還 `.catch` 吞掉)+ 固定睡 140ms —— 那種寫法在 play 還沒把面板點開、
 * 或縮放進場動畫還在跑時就量,「沒看到面板」被讀成「沒有要量的東西」。原本任何一則載入失敗只記進「載入失敗 N 支」、
 * 照樣 exit 0;現在逐則點名、附同源 404 帳本,兩種跑法都 exit 1(不用 exit 2:gate-selftest-meta 在 2026-09-25 修正前把 2 讀成「略過」)。
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { launchBrowser, openStory, StoryRenderInstrumentError, requireStorybookBuild } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const LIMIT = Number(arg('limit', '0'))
const EDGE_TOLERANCE_PX = 1
// 開 story 後要求版面連續靜止幾個影格才量(量的是幾何:要等排版與浮層進場動畫跑完)
const SETTLE_FRAMES = 10
// 儀器失效累積到這麼多支就停掃:那時建置整體壞了(例如預覽腳本缺檔),每支都要等到逾時,掃完 1000 多支沒有意義
const MAX_INSTRUMENT_FAILURES = 25

requireStorybookBuild(join(BUILD, 'index.json'))

const index = JSON.parse(readFileSync(join(BUILD, 'index.json'), 'utf8'))
let stories = Object.values(index.entries || index.stories)
  .filter((e) => e.type !== 'docs')
  .map((e) => ({ id: e.id, name: e.name }))
if (LIMIT) stories = stories.slice(0, LIMIT)

const PROBE = ({ sabotage, tolerance }) => {
  const r1 = (n) => Math.round(n * 10) / 10
  const out = []
  // 面板 = 有 header 標題的浮層(Popover content / Dialog / Sheet)
  const panels = [...document.querySelectorAll('[data-radix-popper-content-wrapper] > *, [role="dialog"]')]
  for (const panel of panels) {
    const pr = panel.getBoundingClientRect()
    if (pr.width < 120 || pr.height < 60) continue
    // 2026-09-17:原本這裡寫 `[data-slot="popover-title"], [data-slot="dialog-title"], [data-slot="sheet-title"]`,
    // 全 DS grep 起來一個都不存在(當時只有 tabs-list),等於三個死選擇器靠最後的 `h2` 兜著。
    // 同日給 SurfaceHeader/Body/Footer 補上真的 data-slot 之後改成量得到的那個。
    const title = panel.querySelector('[data-slot="surface-header"] h2, h2')
    if (!title) continue
    const options = [...panel.querySelectorAll('[role="option"]')]
      .filter((o) => { const r = o.getBoundingClientRect(); return r.width > 40 && r.height > 8 })
    if (!options.length) continue
    // List-as-region 的判定:列貼滿面板兩側(面板沒有留左右內距給它)。留了就不是這個排版,跳過。
    const first = options[0]
    const fr = first.getBoundingClientRect()
    if (Math.abs(fr.left - pr.left) > 2) continue
    if (sabotage) for (const o of options) o.style.paddingLeft = `${parseFloat(getComputedStyle(o).paddingLeft) + 12}px`
    const tl = title.getBoundingClientRect().left
    for (const o of options) {
      const cs = getComputedStyle(o)
      const box = o.getBoundingClientRect()
      // 列的最前緣 = padding-box 左緣(= border-box 左 + border + padding)
      const leading = box.left + parseFloat(cs.borderLeftWidth || '0') + parseFloat(cs.paddingLeft || '0')
      // 內層若自帶內距也要算進去(CommandItem 是兩層)
      const inner = o.firstElementChild
      const innerPad = inner ? parseFloat(getComputedStyle(inner).paddingLeft || '0') : 0
      const delta = r1(leading + innerPad - tl)
      if (Math.abs(delta) > tolerance) {
        out.push({ delta, 列前緣: r1(leading + innerPad), 標題左緣: r1(tl), 文字: (o.textContent || '').trim().slice(0, 10) })
      }
    }
  }
  return { findings: out, sawOptions: document.querySelectorAll('[role="option"]').length > 0 }
}

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const bad = []
let scanned = 0
let panelsChecked = 0
/** 儀器失效:沒量到的 story(不是產品裁決)。 */
const instrumentFailures = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  for (const s of stories) {
    if (instrumentFailures.length >= MAX_INSTRUMENT_FAILURES) break
    scanned += 1
    try {
      try {
        await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`, {
          settleFrames: SETTLE_FRAMES, notFound: server.notFound, navigationTimeoutMs: 30_000, timeoutMs: 30_000,
        })
      } catch (error) {
        if (!(error instanceof StoryRenderInstrumentError)) throw error
        instrumentFailures.push({ story: s.id, detail: error.detail })
        console.error(`  ! 儀器失效 ${s.id}(${error.kind})—— 詳情見結尾清單`)
        continue
      }
      // 一支 story 只呼叫瀏覽器一次(2026-09-17:原本 PROBE 之後又跑一次 evaluate 數面板,1034 支就多 1034 次往返)
      const found = await page.evaluate(PROBE, { sabotage: SELFTEST, tolerance: EDGE_TOLERANCE_PX })
      if (found?.sawOptions) panelsChecked += 1
      for (const f of found?.findings ?? []) bad.push({ ...f, story: s.id, name: s.name })
    } catch (error) {
      // 量測途中丟例外 = 這則沒量完 → 儀器失效(原本只記一行「載入失敗」、照樣 exit 0)
      instrumentFailures.push({ story: s.id, detail: `量測途中丟例外:${String(error?.message || error).split('\n')[0]}` })
      console.error(`  ! ${s.id}: 量測途中丟例外:${String(error?.message || error).split('\n')[0]}`)
    }
    if (scanned % 250 === 0) console.error(`… ${scanned}/${stories.length} 支掃完`)
    // 對照組只要證明「弄壞了它會紅」,抓到第一筆就可以停 —— 沒必要再把剩下的 story 掃完
    // (2026-09-17:原本 selftest 也走完整 1034 支,等於 CI 每次為同一個證明多付一輪掃描)。
    if (SELFTEST && bad.length > 0) { console.error(`… 對照組在第 ${scanned} 支就抓到了,提早收工`); break }
  }
} finally {
  await browser.close()
  await server.stop() // `close` 不存在於這個 helper,寫成 close?.() 會靜靜地不關(2026-09-18)
}

console.log(`\n掃描 ${scanned} 支 story(不抽樣),儀器失效(沒量到)${instrumentFailures.length} 支`)
console.log(`含浮層選項清單的 story:${panelsChecked} 支`)
console.log(`列前緣沒對齊標題:${bad.length} 筆`)
// 儀器失效優先於任何裁決(兩種跑法都一樣):沒量到的 story 不得被讀成「列都對齊」,也不得被讀成「對照組抓到了」
if (instrumentFailures.length) {
  console.error(`\n✗ 儀器失效:${instrumentFailures.length} 支 story 沒量到 —— 這不是產品裁決(元件不一定有問題),但這一趟不能算通過:`)
  for (const f of instrumentFailures) console.error(`  - ${f.story}:${f.detail}`)
  if (instrumentFailures.length >= MAX_INSTRUMENT_FAILURES) console.error(`  已達 ${MAX_INSTRUMENT_FAILURES} 支,停止掃描(還有 ${stories.length - scanned} 支沒掃)—— 建置很可能整體壞了`)
  const missing = [...new Set(server.notFound)]
  if (missing.length) console.error(`  同源 404 帳本:${missing.join(', ')}`)
  process.exit(1)
}
if (!SELFTEST && panelsChecked === 0) {
  console.log('\n✗ 一個帶選項清單的浮層都沒量到 —— 這支等於沒跑,不能當綠燈')
  process.exit(1)
}
for (const b of bad) {
  console.log(`  ✗ ${b.story} :: ${b.name} — 列前緣 ${b.列前緣} vs 標題 ${b.標題左緣}(差 ${b.delta}px);「${b.文字}」`)
}
if (bad.length && !SELFTEST) {
  console.log('\n修法見 overlay-surface.spec.md「List-as-region in overlay body」第 2 條:')
  console.log('在**清單容器**設一次 `--item-px: var(--layout-space-loose)`(整棵子樹的 row 一起換)。')
  console.log('禁止寫在單列的 className:CommandItem 是兩層,className 落在外層 wrapper,')
  console.log('會跟內層 MenuItem 的內距相加(2026-09-17:16+12=28px)。')
  console.log('token owner:patterns/element-anatomy/item-anatomy.spec.md「Token: --item-px」(預設 var(--field-px) 12px)。')
}
if (SELFTEST) {
  console.log(bad.length
    ? '✓ selftest:把列多推 12px 後偵測器判紅,量具有效'
    : '✗ selftest:列被推歪了卻沒被抓到 —— 偵測失效')
  process.exit(bad.length ? 0 : 1)
}
process.exit(bad.length ? 1 : 0)
