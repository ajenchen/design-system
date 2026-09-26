#!/usr/bin/env node
/**
 * 不變式:**每個當 hover card 觸發點的 Avatar,最外層的框必須等於看得見的那個圓**。
 *
 * 尺寸寫在內層(`[data-avatar-size]`),最外層只有 `inline-flex shrink-0` —— 而 `shrink-0` 只擋主軸收縮,
 * 擋不住交叉軸拉伸。所以把 Avatar 放進直向 flex 或 grid 格子,最外層就會被拉寬成一個看不見的假框,
 * 同時壞掉三件事(全部以最外層為基準):
 *   1. 狀態圓點與 `badgeCount`(相對最外層絕對定位)會飛到假框的角落
 *   2. `:focus-visible` 焦點框畫在最外層的 border box 上,配 `rounded-full` 會變成一條膠囊
 *   3. Radix 以最外層量位置,浮層因此橫向偏移(實測 448px 容器下偏 204px)
 * 契約 owner:`packages/design-system/src/components/Avatar/avatar.spec.md`「外框 = 可見圓」。
 *
 * 量的是像素(`getBoundingClientRect`),不是屬性存在與否(M32)。全 story 掃描,不抽樣。
 * 對照組 `--selftest`:注入一個 Avatar 形狀的複製品到 448px 直向 flex 裡,這支必須紅 —— 沒有對照組的綠燈是零證據。
 *
 * **沒量到 = 儀器失效(exit 1),不是通過**(2026-09-25,M37):每則 story 經 lib/launch-browser.mjs 的 openStory
 * (全部瀏覽器閘共用的唯一實作)開啟 —— 等 Storybook 回報這則渲染完成(含 play)、通過 render-health、版面連續靜止
 * SETTLE_FRAMES 個影格,才量 Avatar 外框。取代原本的 domcontentloaded + 等根節點有子元素(等不到還 `.catch` 吞掉)
 * + 固定睡 160ms。原本任何一則載入失敗只印一行、記進「載入失敗 N 支」,**然後照樣 exit 0**;Storybook 錯誤頁也被當成
 * 「渲染好了」去量(量到 0 個觸發點 = 通過)。現在逐則點名、附同源 404 帳本,兩種跑法(一般 / --selftest)都 exit 1。
 * 不用 exit 2:lib/gate-selftest-meta.mjs 與 test-avatar-anchor-box-invariant.mjs 在 2026-09-25 修正前把 exit 2 讀成「缺前置 → 略過」。
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError, requireStorybookBuild } from './lib/launch-browser.mjs'
import { readServedStorybookIndex, startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const LIMIT = Number(arg('limit', '0'))
const BOX_TOLERANCE_PX = 0.5
// 開 story 後要求版面連續靜止幾個影格才量外框(量的是幾何:要等排版、量寬後重畫與進場動畫跑完)
const SETTLE_FRAMES = 10
// 儀器失效累積到這麼多支就停掃:那時建置整體壞了(例如預覽腳本缺檔),每支都要等到逾時,掃完 1000 多支沒有意義
const MAX_INSTRUMENT_FAILURES = 25

requireStorybookBuild(join(BUILD, 'index.json'))

// story 清單讀**正在服務的那一份**建置(快照),不讀活目錄 —— 清單與頁面必須出自同一份建置
//(2026-09-25,待辦總帳 C5;lib/a11y-static-server.mjs 的 readServedStorybookIndex)
const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const index = readServedStorybookIndex(server)
let stories = Object.values(index.entries || index.stories)
  .filter((e) => e.type !== 'docs')
  .map((e) => ({ id: e.id, title: e.title, name: e.name }))
if (LIMIT) stories = stories.slice(0, LIMIT)

const PROBE = () => {
  const out = []
  for (const inner of document.querySelectorAll('[data-avatar-size]')) {
    const root = inner.parentElement
    if (!root) continue
    // 觸發點的判定:Radix 會在最外層掛 data-state,Avatar 自己掛 role=img,可聚焦則 tabIndex=0
    const isTrigger = root.hasAttribute('data-state') && root.getAttribute('role') === 'img' && root.tabIndex === 0
    if (!isTrigger) continue
    const rr = root.getBoundingClientRect()
    const ir = inner.getBoundingClientRect()
    const parent = root.parentElement
    const pcs = parent ? getComputedStyle(parent) : null
    const r1 = (n) => Math.round(n * 10) / 10
    out.push({
      rootW: r1(rr.width), rootH: r1(rr.height),
      innerW: r1(ir.width), innerH: r1(ir.height),
      dx: r1(rr.width - ir.width), dy: r1(rr.height - ir.height),
      parent: pcs ? `${pcs.display}/${pcs.flexDirection} w=${r1(parent.getBoundingClientRect().width)}` : '(none)',
    })
  }
  return out
}

const browser = await launchBrowser()
const stretched = []
let scanned = 0
let triggers = 0
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
      if (SELFTEST && scanned === 1) {
        // 對照組:Avatar 形狀的複製品放進 448px 直向 flex —— 最外層會被拉寬,這支必須抓到
        await page.evaluate(() => {
          const col = document.createElement('div')
          col.style.cssText = 'display:flex;flex-direction:column;width:448px;'
          const root = document.createElement('div')
          root.className = 'inline-flex shrink-0 rounded-full'
          root.setAttribute('role', 'img')
          root.setAttribute('tabindex', '0')
          root.setAttribute('data-state', 'closed')
          const inner = document.createElement('div')
          inner.setAttribute('data-avatar-size', '40')
          inner.style.cssText = 'width:40px;height:40px;'
          root.appendChild(inner)
          col.appendChild(root)
          document.body.appendChild(col)
        })
      }
      for (const a of await page.evaluate(PROBE)) {
        triggers += 1
        if (a.dx > BOX_TOLERANCE_PX || a.dy > BOX_TOLERANCE_PX) stretched.push({ ...a, story: s.id, name: s.name })
      }
    } catch (error) {
      // 量測途中丟例外 = 這則沒量完 → 儀器失效(原本只記一行「載入失敗」、照樣 exit 0)
      instrumentFailures.push({ story: s.id, detail: `量測途中丟例外:${String(error?.message || error).split('\n')[0]}` })
      console.error(`  ! ${s.id}: 量測途中丟例外:${String(error?.message || error).split('\n')[0]}`)
    }
    if (scanned % 200 === 0) console.error(`… ${scanned}/${stories.length} 支掃完,累計觸發點 ${triggers}`)
  }
} finally {
  await browser.close()
  await server.stop() // `close` 不存在於這個 helper,寫成 close?.() 會靜靜地不關(2026-09-18)
}

console.log(`\n掃描 ${scanned} 支 story(不抽樣),儀器失效(沒量到)${instrumentFailures.length} 支`)
console.log(`hover card 觸發點的 Avatar:${triggers} 個`)
console.log(`外框被拉大(最外層 ≠ 可見圓):${stretched.length} 個`)
for (const s of stretched) {
  console.log(`  ✗ ${s.story} :: ${s.name} — 外框 ${s.rootW}x${s.rootH} vs 可見 ${s.innerW}x${s.innerH}(dx=${s.dx} dy=${s.dy});父層 ${s.parent}`)
}
if (stretched.length) {
  console.log('\n修法見 avatar.spec.md「外框 = 可見圓」:固定尺寸模式的最外層要鎖寬,不能只靠 shrink-0。')
}
// 儀器失效優先於任何裁決(兩種跑法都一樣):沒量到的 story 不得被讀成「外框都對」,也不得被讀成「對照組抓到了」
if (instrumentFailures.length) {
  console.error(`\n✗ 儀器失效:${instrumentFailures.length} 支 story 沒量到 —— 這不是產品裁決(元件不一定有問題),但這一趟不能算通過:`)
  for (const f of instrumentFailures) console.error(`  - ${f.story}:${f.detail}`)
  if (instrumentFailures.length >= MAX_INSTRUMENT_FAILURES) console.error(`  已達 ${MAX_INSTRUMENT_FAILURES} 支,停止掃描(還有 ${stories.length - scanned} 支沒掃)—— 建置很可能整體壞了`)
  const missing = [...new Set(server.notFound)]
  if (missing.length) console.error(`  同源 404 帳本:${missing.join(', ')}`)
  process.exit(1)
}
// `--selftest` 的退出碼**是反過來的**(對齊本 repo 其他閘的 selftest 慣例,例如 overlay-detached-anchor):
// 它問的是「偵測器會不會紅」,所以抓到注入的對照組 = 0(量具有效),沒抓到 = 1(量具失效)。
// 2026-09-16 錨:一開始沿用正常判定的退出碼,`gate && gate --selftest` 於是在對照組被抓到時整條判失敗。
if (SELFTEST) {
  console.log(stretched.length
    ? '✓ selftest:注入被拉寬的外框後偵測器判紅,量具有效'
    : '✗ selftest:注入被拉寬的外框卻沒被抓到 —— 偵測失效')
  process.exit(stretched.length ? 0 : 1)
}
// 空綠地板(2026-09-18 加):一個觸發點都沒量到 = 這支什麼都沒驗,那個綠燈是零證據(M32)。
// **只擋「完整掃描」那一種跑法**:
//   - `--selftest` 不擋(它跑 `--limit=1`,本來就只要注入的那一支);
//   - `--limit=N` 不擋 —— meta-test `scripts/test-avatar-anchor-box-invariant.mjs` 的 baseline 刻意只跑 60 支
//     來驗「偵測力」,前 60 支裡本來就沒有 hover card 觸發點。第一版沒排除它,當場把那支 meta-test 弄紅了。
// 實測基準:全庫不抽樣掃 1035 支 story 會量到 **418 個** hover card 觸發點,離 0 很遠;
// 真的掉到 0 就是探針或 build 壞了,不是「DS 裡沒有這種 Avatar 了」。
// 這條分支確實會紅:加上 `!LIMIT` 之前跑 `--limit=40`(那個範圍內剛好 0 個觸發點)實測 exit 1。
if (!LIMIT && triggers === 0) {
  console.log('\n✗ 一個 hover card 觸發點的 Avatar 都沒量到 —— 探針或 build 壞了,這支等於沒跑,不能當綠燈')
  process.exit(1)
}
process.exit(stretched.length ? 1 : 0)
