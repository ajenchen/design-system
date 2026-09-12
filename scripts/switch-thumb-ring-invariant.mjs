#!/usr/bin/env node
/**
 * Switch thumb ring 不變式 —— 「thumb 外圈必須渲染成 track 本身的顏色」。
 *
 * 為什麼要有這支閘(兩次真實事故,同一個位置、不同破法):
 *   1. 2026-07-06 給 track 加 hover 升階時漏了 thumb 邊框 → hover 時白圓浮出一圈灰邊。
 *   2. dark mode 邊框色是白 25%,`background-clip` 預設 border-box 會把 thumb 自己的白底鋪到
 *      邊框下 → 白疊白、整圈消失。像素實測白圓 light 15.5px vs dark 19.5px(spec.md:90 要求 16)。
 *
 * 兩次都**通不過 computed style 檢查**(border-width 恆為 2px、border-color 恆有值),
 * 只有量真實像素才抓得到 —— 所以這支閘一律讀截圖像素,不讀 CSSOM(M32)。
 *
 * 不變式一(顏色):在 thumb 垂直中心那一列,thumb 左緣往內 1px(落在那圈 2px 內)的顏色,
 * 必須等於同一列上 track 裸露處的顏色。這條在 checked / unchecked / disabled /
 * hover / light / dark 全部成立,因為它描述的是「那圈本來就該是 track」。
 *
 * 不變式二(尺寸,2026-09-12 補):`switch.spec.md:99-100` 的尺寸表逐字要求
 * **白色圓 sm/md = 16px、lg = 20px**(thumb 外框 20 / 24,減去兩側各 2px 外圈)。
 * 獨立覆核 2026-09-12 指出:`grep scripts/*.mjs` 找不到任何腳本在斷言這個直徑 ——
 * 事故二(dark mode 白疊白讓白圓從 15.5 變 19.5px)當時就是靠人眼加臨時探針抓到的,
 * 日後尺寸再經由別的機制走鐘不會有任何閘紅。這裡量**渲染出來的連續純白寬度**,
 * 只在 unchecked + enabled 上量(checked 的勾選圖示會把白色段切斷;disabled 套 opacity 後不是純白)。
 */
import { PNG } from 'pngjs'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const selftest = args.includes('--selftest')
const root = args.find((a) => a.startsWith('--root='))?.slice(7) ?? 'storybook-static'
const TOLERANCE = 8 // 每通道 /255;截圖有子像素抗鋸齒,取樣點又貼著圓角,留一點餘裕
// `switch.spec.md:99-100` 的尺寸表:thumb 外框 → 白色圓。±1px 容差給子像素抗鋸齒。
const WHITE_DISC_BY_THUMB = { 20: 16, 24: 20 }
const DISC_TOLERANCE = 1

const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 4 })

if (selftest) {
  // 對照組 = 把事故二原樣重放:白底鋪到邊框下,那圈變成白的。閘若還綠就是它什麼都沒驗。
  await page.addStyleTag({ content: '[role="switch"] > *{background-clip:border-box !important;border-color:rgb(255,255,255) !important}' }).catch(() => {})
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style')
      s.textContent = '[role="switch"] > *{background-clip:border-box !important;border-color:rgb(255,255,255) !important}'
      document.head.appendChild(s)
    })
  })
}

// 掃全 DS 的「設計規格」三支固定 story(跟 hover-color-pair 同一套列舉),
// 不預先過濾元件名 —— Switch 出現在 form / field / settings 等組合 story 裡也要蓋到。
const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'))
const allIds = Object.entries(index.entries)
  .filter(([id, e]) => e.type === 'story' && /--(state-behavior|overview|size-matrix)$/.test(id))
  .map(([id]) => id)
// 對照組只跑「注入破壞後一定會紅」的目標(有 Switch 的那幾支),否則會為了驗 3 秒的事情跑 5 分鐘。
// 正常掃仍然是全 DS —— Switch 會出現在 form / settings / dialog 等組合 story 裡,不能只掃 switch 目錄。
const ids = selftest ? allIds.filter((id) => /switch|field|form|setting/i.test(id)) : allIds
const violations = []
const discViolations = []
let sampled = 0
let discSampled = 0

const px = (png, x, y) => { const i = ((y * png.width) + x) << 2; return [png.data[i], png.data[i + 1], png.data[i + 2]] }
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= TOLERANCE)

for (const id of ids) {
  // `load` 比 `networkidle` 早很多(164 支從 2分23秒降到 48 秒,取樣數不變 44),但它不保證 story 已渲染。
  // 所以改成等「story 根節點真的有子節點」——快,而且不會在較慢的機器上量到空頁面而假裝沒有 Switch。
  await page.goto(`${server.origin}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'load' }).catch(() => {})
  await page.waitForFunction(() => (document.querySelector('#storybook-root')?.children.length ?? 0) > 0, { timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(80)
  // 這支 story 沒有 Switch 就直接跳過:切 theme + 等過渡每支要 ~0.5s,164 支裡只有少數有 Switch,
  // 不跳過的話光等待就多花 ~1.5 分鐘,CI 的 15 分鐘 job 會被撐爆(2026-09-12 實際被 cancel 過一次)。
  if (await page.locator('[role="switch"]').count() === 0) continue
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(250)
    for (const el of await page.locator('[role="switch"]').all()) {
      const geo = await el.evaluate((n) => {
        const t = n.querySelector('[data-state]') ?? n.firstElementChild
        if (!t) return null
        const tr = n.getBoundingClientRect(); const th = t.getBoundingClientRect()
        if (tr.width < 8 || th.width < 8) return null
        return { track: { x: tr.x, y: tr.y, w: tr.width, h: tr.height }, thumb: { x: th.x, y: th.y, w: th.width, h: th.height },
                 state: n.getAttribute('data-state'), disabled: n.disabled || n.getAttribute('data-disabled') != null }
      })
      if (!geo) continue
      for (const hovered of [false, true]) {
        if (hovered) await page.mouse.move(geo.track.x + geo.track.w / 2, geo.track.y + geo.track.h / 2)
        else await page.mouse.move(2, 2)
        await page.waitForTimeout(hovered ? 420 : 200) // 等 transition-colors 走完,別量到過渡中間值
        const clip = { x: geo.track.x, y: geo.track.y + geo.track.h / 2 - 0.5, width: geo.track.w, height: 1 }
        if (clip.x < 0 || clip.y < 0) continue
        const png = PNG.sync.read(await page.screenshot({ clip }))
        const scale = png.width / geo.track.w
        const rel = (cssX) => Math.round((cssX - geo.track.x) * scale)
        // 那圈:thumb 左緣往內 1px。裸 track:thumb 對側、離 track 邊 3px 處。
        const ringX = rel(geo.thumb.x + 1)
        const thumbOnLeft = geo.thumb.x - geo.track.x < geo.track.w / 2
        const trackX = thumbOnLeft ? rel(geo.track.x + geo.track.w - 3) : rel(geo.track.x + 3)
        if (ringX < 0 || ringX >= png.width || trackX < 0 || trackX >= png.width) continue
        const ring = px(png, ringX, 0); const track = px(png, trackX, 0)
        sampled += 1
        if (!near(ring, track)) violations.push({ id, theme, state: geo.state, disabled: geo.disabled, hovered, ring: ring.join(','), track: track.join(',') })
        // 尺寸:量這一列上最長的連續「幾乎純白」段 = 視覺上的白色圓直徑。
        // 只在 unchecked + enabled 量(checked 有勾選圖示切斷白段;disabled 套 opacity 後不是純白)。
        const expectDisc = WHITE_DISC_BY_THUMB[Math.round(geo.thumb.w)]
        if (expectDisc != null && geo.state === 'unchecked' && !geo.disabled) {
          let best = 0, run = 0
          for (let x = 0; x < png.width; x += 1) {
            const q = px(png, x, 0)
            if (q[0] >= 250 && q[1] >= 250 && q[2] >= 250) { run += 1; if (run > best) best = run } else run = 0
          }
          const discPx = best / scale
          discSampled += 1
          if (Math.abs(discPx - expectDisc) > DISC_TOLERANCE) {
            discViolations.push({ id, theme, hovered, thumb: Math.round(geo.thumb.w), 實際: +discPx.toFixed(1), 期望: expectDisc })
          }
        }
      }
    }
  }
}
await page.mouse.move(2, 2)
await browser.close(); await server.stop()

console.log(`掃過 ${ids.length} 個 story,取樣 ${sampled} 個 (switch × theme × hover) 組合;其中 ${discSampled} 個量了白色圓直徑`)
if (sampled === 0) { console.error('✗ 取樣數 0 —— 這支閘什麼都沒驗到,視同紅燈(不是綠燈)'); process.exit(1) }
if (selftest) {
  // 對照組把外圈塗白 → 顏色不變式必紅,而且白色圓會從 16 脹到 20(外圈也變白)→ 尺寸不變式也必紅。
  if (violations.length === 0) { console.error('✗ 對照組:把那圈改成白色後顏色不變式仍然綠 —— 閘失效'); process.exit(1) }
  if (discSampled > 0 && discViolations.length === 0) { console.error('✗ 對照組:外圈塗白後白色圓應該脹大,尺寸不變式卻沒紅 —— 那半邊失效'); process.exit(1) }
  console.log(`✓ 對照組:如預期紅(顏色 ${violations.length} 組 / 尺寸 ${discViolations.length} 組)`); process.exit(0)
}
if (discViolations.length > 0) {
  console.error(`✗ ${discViolations.length} 個組合的白色圓直徑不符 switch.spec.md 尺寸表:`)
  for (const v of discViolations.slice(0, 12)) console.error(`  ${v.id} [${v.theme}] hover=${v.hovered} thumb ${v.thumb}px → 白圓 ${v.實際}px(期望 ${v.期望}px)`)
}
if (violations.length > 0) {
  console.error(`✗ ${violations.length} 個組合的 thumb 外圈顏色 ≠ track:`)
  for (const v of violations.slice(0, 20)) console.error(`  ${v.id} [${v.theme}] state=${v.state} disabled=${v.disabled} hover=${v.hovered}  圈=${v.ring}  track=${v.track}`)
  process.exit(1)
}
if (violations.length > 0 || discViolations.length > 0) process.exit(1)
console.log('✓ 所有 Switch 的 thumb 外圈都等於 track(含 hover / disabled / dark),且白色圓直徑符合 spec 尺寸表')
