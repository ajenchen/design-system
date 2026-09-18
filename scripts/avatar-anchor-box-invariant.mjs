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
const BOX_TOLERANCE_PX = 0.5

if (!existsSync(join(BUILD, 'index.json'))) {
  console.error(`✗ 找不到 ${join(BUILD, 'index.json')} —— 先跑 npm run build-storybook`)
  process.exit(2)
}

const index = JSON.parse(readFileSync(join(BUILD, 'index.json'), 'utf8'))
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

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const stretched = []
let scanned = 0
let triggers = 0
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
      await page.waitForTimeout(160)
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
      loadErrors += 1
      console.error(`  ! ${s.id}: ${String(error.message).split('\n')[0]}`)
    }
    if (scanned % 200 === 0) console.error(`… ${scanned}/${stories.length} 支掃完,累計觸發點 ${triggers}`)
  }
} finally {
  await browser.close()
  await server.stop() // `close` 不存在於這個 helper,寫成 close?.() 會靜靜地不關(2026-09-18)
}

console.log(`\n掃描 ${scanned} 支 story(不抽樣),載入失敗 ${loadErrors} 支`)
console.log(`hover card 觸發點的 Avatar:${triggers} 個`)
console.log(`外框被拉大(最外層 ≠ 可見圓):${stretched.length} 個`)
for (const s of stretched) {
  console.log(`  ✗ ${s.story} :: ${s.name} — 外框 ${s.rootW}x${s.rootH} vs 可見 ${s.innerW}x${s.innerH}(dx=${s.dx} dy=${s.dy});父層 ${s.parent}`)
}
if (stretched.length) {
  console.log('\n修法見 avatar.spec.md「外框 = 可見圓」:固定尺寸模式的最外層要鎖寬,不能只靠 shrink-0。')
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
