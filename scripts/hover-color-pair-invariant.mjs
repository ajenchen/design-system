#!/usr/bin/env node
/**
 * 「靜止時同色的一對顏色,hover 之後必須還是同色」全 DS 掃描(2026-09-11)
 *
 * user 截圖回報:Switch hover 時白色圓浮出一圈灰邊。根因(switch.tsx:313 修前)——
 * `switch.spec.md:100` 逐字要求 OFF thumb 邊框「neutral-5,**與 OFF track 同色**」,
 * 而 2026-07-06 給 track 加了 hover 升階(`switch.tsx:71-72`)卻**沒給 thumb 邊框對應的 hover**
 * → 實測 hover 下 track `oklch(0 0 0 / 0.25)`、thumb 邊框仍 `oklch(0 0 0 / 0.15)`,
 * 那圈本來刻意「看不見」的邊就浮出來了。
 *
 * **這是一整類 bug,不是單一元件的筆誤**:只要「子元素的邊框色刻意等於父元素的底色」,
 * 而父元素的底色有 hover 變化、邊框沒有,那圈邊就會在 hover 時現形。所以寫成全 DS 掃描。
 *
 * 判準(只抓「本來同色、hover 後不同色」,不碰本來就不同色的設計):
 *   對每個候選 root(帶 `role=switch|checkbox|radio` 或 `data-state` 的互動元素):
 *     rest:  parentBg == childBorder ?
 *     hover: parentBg == childBorder ?
 *   rest 相等 **且** hover 不等 → 違規(那圈邊在 hover 時現形)
 *
 * 對照組(`--selftest`):注入 CSS 讓某個 thumb 的邊框在 hover 時固定住 → 必須抓到。
 *
 *   node scripts/hover-color-pair-invariant.mjs [--build=<dir>] [--selftest] [--limit=<n>]
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = arg('build', join(REPO, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const LIMIT = Number(arg('limit', '0'))

const index = JSON.parse(readFileSync(join(BUILD, 'index.json'), 'utf8'))
// 掃「設計規格」層的 state-behavior / overview / size-matrix —— 互動狀態都在這幾支,
// 而且是每個元件都有的固定三支(story-rules 的三層定位),不會因為某個元件少寫展示 story 就漏掉。
const STORIES = Object.entries(index.entries)
  .filter(([id, e]) => e.type === 'story' && /--(state-behavior|overview|size-matrix)$/.test(id))
  .map(([id]) => id)
// 對照組只跑**真的有配對**的 story(switch / checkbox / radio)——
// 2026-09-11 踩過:第一版對照組跑在沒有任何配對的 60 支上,回報「沒抓到違規」,
// 那不是儀器失效而是**什麼都沒驗**。對照組必須跑在「注入破壞後一定會紅」的目標上。
const targets = SELFTEST
  ? STORIES.filter((id) => /(switch|checkbox|radio)/i.test(id))
  : LIMIT ? STORIES.slice(0, LIMIT) : STORIES

const PROBE = `(() => {
  const norm = (c) => (c || '').replace(/\\s+/g, '')
  const out = []
  const roots = [...document.querySelectorAll('[role="switch"],[role="checkbox"],[role="radio"],[data-state]')]
  for (const root of roots) {
    const rs = getComputedStyle(root)
    const bg = norm(rs.backgroundColor)
    if (!bg || bg === 'rgba(0,0,0,0)') continue
    for (const child of root.querySelectorAll('*')) {
      const cs = getComputedStyle(child)
      if (parseFloat(cs.borderTopWidth) < 0.5) continue
      out.push({ tag: child.tagName.toLowerCase(), state: root.getAttribute('data-state') || root.getAttribute('role'),
                 parentBg: bg, childBorder: norm(cs.borderTopColor) })
    }
  }
  return out
})()`

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const violations = []
let scanned = 0, pairs = 0
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  for (const id of targets) {
    await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(250)
    if (SELFTEST) await page.addStyleTag({ content: '[role="switch"] > *{border-color:oklch(0 0 0 / 0.15) !important}' }).catch(() => {})
    scanned++
    const rest = await page.evaluate(PROBE).catch(() => [])
    if (!rest.length) continue
    // 逐一 hover 每個 root,量同一個 (parentBg, childBorder) 對
    const roots = await page.locator('[role="switch"],[role="checkbox"],[role="radio"]').all().catch(() => [])
    for (let i = 0; i < roots.length; i++) {
      const before = rest[i]
      if (!before || before.parentBg !== before.childBorder) continue // 本來就不同色 → 不是這條不變式的對象
      pairs++
      await roots[i].hover({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(220)
      const after = (await page.evaluate(PROBE).catch(() => []))[i]
      if (after && after.parentBg !== after.childBorder) {
        violations.push({ story: id, index: i, state: after.state, rest: before.parentBg, hoverBg: after.parentBg, hoverBorder: after.childBorder })
      }
    }
  }
} finally {
  await browser.close()
  await server.stop()
}

console.log(`掃了 ${scanned} 支 story,找到 ${pairs} 組「靜止時同色」的 (父底色, 子邊框) 配對`)
if (pairs === 0) { console.log(`✗ 一組配對都沒找到 —— 這次什麼都沒驗到(選的 story 裡沒有這種結構?)`); process.exit(1) }
for (const v of violations) console.log(`  ✗ ${v.story} #${v.index}(${v.state}):hover 後 底色 ${v.hoverBg} ≠ 邊框 ${v.hoverBorder}(靜止時同為 ${v.rest})`)
const ok = violations.length === 0
if (SELFTEST) {
  console.log(ok ? '\n✗ 對照組:注入「邊框凍住」之後仍然沒抓到違規 —— 儀器該紅卻沒紅' : `\n✓ 對照組:如預期抓到 ${violations.length} 組(儀器有效)`)
  process.exit(ok ? 1 : 0)
}
console.log(ok ? '\n✓ 靜止時同色的顏色配對,hover 後全部仍然同色' : `\n✗ ${violations.length} 組在 hover 後失去同色`)
process.exit(ok ? 0 : 1)
