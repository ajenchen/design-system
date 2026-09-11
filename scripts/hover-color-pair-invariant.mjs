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

// 每個 root 回**恰好一筆**,而且 root 選擇器必須跟下方 locator 完全一致 ——
// 否則 `rest[i]` 與 `roots[i]` 指的不是同一個東西。2026-09-11 修:舊版把「所有有邊框的子元素」
// 攤平成一維再用 root 的索引去取,一個 root 貢獻 0 或多筆時整個對不齊,綠燈與紅燈都不可信。
const ROOT_SELECTOR = '[role="switch"],[role="checkbox"],[role="radio"]'
const PROBE = `(() => {
  const norm = (c) => (c || '').replace(/\\s+/g, '')
  return [...document.querySelectorAll('${ROOT_SELECTOR}')].map((root) => {
    const rs = getComputedStyle(root)
    const bg = norm(rs.backgroundColor)
    const child = [...root.querySelectorAll('*')].find((c) => parseFloat(getComputedStyle(c).borderTopWidth) >= 0.5)
    return { state: root.getAttribute('data-state') || root.getAttribute('role'),
             parentBg: bg && bg !== 'rgba(0,0,0,0)' ? bg : null,
             childBorder: child ? norm(getComputedStyle(child).borderTopColor) : null }
  })
})()`

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const violations = []
let scanned = 0, pairs = 0
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  for (const id of targets) {
    // 同 switch-thumb-ring:`load` + 等 story 根節點有內容,比 networkidle 快數倍且不犧牲判定。
    await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'load', timeout: 60_000 }).catch(() => {})
    await page.waitForFunction(() => (document.querySelector('#storybook-root')?.children.length ?? 0) > 0, { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(120)
    // 注入必須打到**真的有邊框的那個後代**。舊版寫 `> *`(直接子代)只打到一個 border-width: 0px 的
    // 外層 wrapper,會被下方 `>= 0.5px` 過濾掉 —— 2026-09-11 Switch 改成透明外圈、DS 內真配對歸零後
    // 才暴露出來(在那之前是真配對在扛,注入的瑕疵被掩蓋)。用後代選擇器 + 同時蓋掉 background-clip,
    // 原樣重放「子邊框刻意等於父底色」這個反模式。
    if (SELFTEST) await page.addStyleTag({ content: '[role="switch"] *{border-color:oklch(0 0 0 / 0.15) !important;background-clip:border-box !important}' }).catch(() => {})
    // 注入後**必須等過渡走完**才量:`transition-colors` 的 transition-property 含 border-color,
    // 注入完立刻讀 computed 會拿到動畫中間值(實測 oklab(0 0 0 / 0.026),既不是注入值也不是原值),
    // 於是對照組永遠造不出「靜止同色」的配對、看起來像儀器失效。這是 M32 記過的同一個陷阱。
    if (SELFTEST) await page.waitForTimeout(500)
    scanned++
    const rest = await page.evaluate(PROBE).catch(() => [])
    if (!rest.length) continue
    // 逐一 hover 每個 root,量同一個 (parentBg, childBorder) 對
    const roots = await page.locator(ROOT_SELECTOR).all().catch(() => [])
    for (let i = 0; i < roots.length; i++) {
      const before = rest[i]
      if (!before || !before.parentBg || !before.childBorder) continue // 無底色或無邊框子元素 → 不是這條不變式的對象
      if (before.parentBg !== before.childBorder) continue // 本來就不同色 → 不是這條不變式的對象
      pairs++
      await roots[i].hover({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(500) // 同上:等 transition-colors 走完再量 hover 後的值
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
// 0 組的意義取決於模式:
//   對照組 = 注入後必定造得出配對,回 0 就是儀器壞了 → 紅。
//   正常掃 = 0 組代表「DS 內已經沒有『子邊框刻意等於父底色』這個反模式」,那是**期望狀態**。
//     2026-09-11 Switch 改成 `bg-clip-padding` + 透明外圈後,DS 內最後一處也消失了。
//     儀器有效性不靠這裡的計數保證,而是靠 CI 在這支之前先跑一次 --selftest(注入後必須紅)。
if (pairs === 0) {
  if (SELFTEST) { console.log('✗ 注入之後仍然一組配對都沒有 —— 儀器壞了'); process.exit(1) }
  console.log('✓ DS 內已無「子邊框刻意等於父底色」的脆弱結構(儀器有效性由前一步 --selftest 保證)')
  process.exit(0)
}
for (const v of violations) console.log(`  ✗ ${v.story} #${v.index}(${v.state}):hover 後 底色 ${v.hoverBg} ≠ 邊框 ${v.hoverBorder}(靜止時同為 ${v.rest})`)
const ok = violations.length === 0
if (SELFTEST) {
  console.log(ok ? '\n✗ 對照組:注入「邊框凍住」之後仍然沒抓到違規 —— 儀器該紅卻沒紅' : `\n✓ 對照組:如預期抓到 ${violations.length} 組(儀器有效)`)
  process.exit(ok ? 1 : 0)
}
console.log(ok ? '\n✓ 靜止時同色的顏色配對,hover 後全部仍然同色' : `\n✗ ${violations.length} 組在 hover 後失去同色`)
process.exit(ok ? 0 : 1)
