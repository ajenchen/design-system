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
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const LIMIT = Number(arg('limit', '0'))
const EDGE_TOLERANCE_PX = 1

if (!existsSync(join(BUILD, 'index.json'))) {
  console.error(`✗ 找不到 ${join(BUILD, 'index.json')} —— 先跑 npm run build-storybook`)
  process.exit(2)
}

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
let loadErrors = 0
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', () => {})
  for (const s of stories) {
    scanned += 1
    try {
      await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForFunction(
        () => document.querySelector('#storybook-root')?.children.length > 0 || document.querySelector('.sb-show-errordisplay'),
        null,
        { timeout: 15_000 },
      ).catch(() => {})
      await page.waitForTimeout(140)
      // 一支 story 只呼叫瀏覽器一次(2026-09-17:原本 PROBE 之後又跑一次 evaluate 數面板,1034 支就多 1034 次往返)
      const found = await page.evaluate(PROBE, { sabotage: SELFTEST, tolerance: EDGE_TOLERANCE_PX })
      if (found?.sawOptions) panelsChecked += 1
      for (const f of found?.findings ?? []) bad.push({ ...f, story: s.id, name: s.name })
    } catch (error) {
      loadErrors += 1
      console.error(`  ! ${s.id}: ${String(error.message).split('\n')[0]}`)
    }
    if (scanned % 250 === 0) console.error(`… ${scanned}/${stories.length} 支掃完`)
    // 對照組只要證明「弄壞了它會紅」,抓到第一筆就可以停 —— 沒必要再把剩下的 story 掃完
    // (2026-09-17:原本 selftest 也走完整 1034 支,等於 CI 每次為同一個證明多付一輪掃描)。
    if (SELFTEST && bad.length > 0) { console.error(`… 對照組在第 ${scanned} 支就抓到了,提早收工`); break }
  }
} finally {
  await browser.close()
  await server.close?.()
}

console.log(`\n掃描 ${scanned} 支 story(不抽樣),載入失敗 ${loadErrors} 支`)
console.log(`含浮層選項清單的 story:${panelsChecked} 支`)
console.log(`列前緣沒對齊標題:${bad.length} 筆`)
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
