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
 * 開 story(2026-09-25 起)走 lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作):Storybook 回報渲染完成(含 play)
 * + render-health + 版面連續靜止 N 個影格才量。原本是 `goto(...).catch(() => {})` + 等根節點有子元素(.catch 吞掉)+ 固定睡 120ms,
 * 量不到就回空陣列 → `continue` —— 開不起來的 story 被算進「掃了 N 支」、而且沒有任何配對,於是**靜默地綠**(M37:沒量到 ≠ 沒有配對)。
 * 實測:把 Switch 設計規格的 chunk 刪掉,舊版照樣印「掃了 164 支 story … ✓」exit 0。
 * 現在:開不起來 / 量測腳本丟例外 / 配對的 hover 做不下去 → 記為**儀器失效**,掃完後點名每一支 story 並附同源 404 帳本,exit 1
 * (不是產品裁決;不用 exit 2 —— lib/gate-selftest-meta.mjs 在 2026-09-25 修正前把 2 讀成「缺前置 → 略過」)。
 *
 *   node scripts/hover-color-pair-invariant.mjs [--build=<dir>] [--selftest] [--limit=<n>]
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
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
             childBorder: child ? norm(getComputedStyle(child).borderTopColor) : null,
             // pointer-events 會繼承:none = 使用者的指標也碰不到它,:hover 永遠不會成立(例:state-behavior 的靜態示意框)
             pointerEvents: rs.pointerEvents }
  })
})()`

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const violations = []
// 沒量到的 story(儀器失效):開不起來、量測腳本丟例外、配對的 hover 做不下去 —— 掃完一起點名,不當成「沒有配對」
const broken = []
const firstLine = (error) => String(error?.message ?? error).split('\n')[0]
let scanned = 0, pairs = 0, unhoverable = 0
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  for (const id of targets) {
    try {
      // 渲染完成(含 play)+ render-health + 版面靜止才量;取代 `load` + 等根節點有子元素 + 固定睡 120ms(兩處 .catch 吞掉)
      await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
        settleFrames: 10, notFound: server.notFound, navigationTimeoutMs: 60_000,
      })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      broken.push({ story: id, detail: error.detail })
      continue
    }
    try {
      // 注入必須打到**真的有邊框的那個後代**。舊版寫 `> *`(直接子代)只打到一個 border-width: 0px 的
      // 外層 wrapper,會被下方 `>= 0.5px` 過濾掉 —— 2026-09-11 Switch 改成透明外圈、DS 內真配對歸零後
      // 才暴露出來(在那之前是真配對在扛,注入的瑕疵被掩蓋)。用後代選擇器 + 同時蓋掉 background-clip,
      // 原樣重放「子邊框刻意等於父底色」這個反模式。
      if (SELFTEST) await page.addStyleTag({ content: '[role="switch"] *{border-color:oklch(0 0 0 / 0.15) !important;background-clip:border-box !important}' })
      // 注入後**必須等過渡走完**才量:`transition-colors` 的 transition-property 含 border-color,
      // 注入完立刻讀 computed 會拿到動畫中間值(實測 oklab(0 0 0 / 0.026),既不是注入值也不是原值),
      // 於是對照組永遠造不出「靜止同色」的配對、看起來像儀器失效。這是 M32 記過的同一個陷阱。
      // (這 500ms 等的是注入之後的顏色過渡,元素早已渲染完成,不是「已渲染」的代理。)
      if (SELFTEST) await page.waitForTimeout(500)
      scanned++
      const rest = await page.evaluate(PROBE)
      if (!rest.length) continue // story 已渲染完成、真的沒有 switch / checkbox / radio → 不是這條不變式的對象
      // 逐一 hover 每個 root,量同一個 (parentBg, childBorder) 對
      const roots = await page.locator(ROOT_SELECTOR).all()
      for (let i = 0; i < roots.length; i++) {
        const before = rest[i]
        if (!before || !before.parentBg || !before.childBorder) continue // 無底色或無邊框子元素 → 不是這條不變式的對象
        if (before.parentBg !== before.childBorder) continue // 本來就不同色 → 不是這條不變式的對象
        // 確定性的略過(有記數、會印出):pointer-events:none 的元素沒有 hover 狀態可言,使用者也 hover 不到 ——
        // 不是「沒量到」。原本它被算成一組配對,hover 逾時被 .catch 吞掉後量到的是靜止態,於是被讀成「hover 後仍同色」。
        if (before.pointerEvents === 'none') { unhoverable++; continue }
        pairs++
        // hover 做不下去 = 沒看到 hover 狀態,不能讀成「hover 後仍同色」(原本 .catch(() => {}) 之後照量,等於量靜止態)
        const hovered = await roots[i].hover({ timeout: 3000 }).then(() => null, (error) => error)
        if (hovered) { broken.push({ story: id, detail: `第 ${i} 個 ${ROOT_SELECTOR} 的配對 hover 做不下去:${firstLine(hovered)}` }); continue }
        await page.waitForTimeout(500) // 同上:等 transition-colors 走完再量 hover 後的值(互動之後的過渡,不是「已渲染」的代理)
        const after = (await page.evaluate(PROBE))[i]
        if (!after) { broken.push({ story: id, detail: `hover 後找不到第 ${i} 個 ${ROOT_SELECTOR}` }); continue }
        if (after.parentBg !== after.childBorder) {
          violations.push({ story: id, index: i, state: after.state, rest: before.parentBg, hoverBg: after.parentBg, hoverBorder: after.childBorder })
        }
      }
    } catch (error) {
      // 量測腳本本身丟例外(頁面崩潰、context 被導覽掉)= 這支沒量到,不是「沒有配對」
      broken.push({ story: id, detail: `量測中斷:${firstLine(error)}` })
    }
  }
} finally {
  await browser.close()
  await server.stop()
}

console.log(`掃了 ${scanned} 支 story,找到 ${pairs} 組「靜止時同色」的 (父底色, 子邊框) 配對`)
if (unhoverable) console.log(`  (另有 ${unhoverable} 組靜止同色但 pointer-events:none —— 使用者也 hover 不到,沒有 hover 狀態可量,不列入配對)`)
if (broken.length) {
  for (const v of violations) console.log(`  ✗ ${v.story} #${v.index}(${v.state}):hover 後 底色 ${v.hoverBg} ≠ 邊框 ${v.hoverBorder}(靜止時同為 ${v.rest})`)
  const brokenStories = new Set(broken.map((b) => b.story)).size
  console.log(`\n✗ INSTRUMENT-FAIL:${brokenStories} 支 story 沒量到(${broken.length} 筆;目標 ${targets.length} 支)—— 這是儀器失效(沒量到),不是產品裁決:元件不一定有問題,但這次不能算通過`)
  for (const b of broken) console.log(`  ✗ ${b.story}:${b.detail}`)
  const missing = [...new Set(server.notFound)]
  if (missing.length) console.log(`  同源 404:${missing.join(', ')}`)
  process.exit(1)
}
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
