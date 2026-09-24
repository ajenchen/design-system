#!/usr/bin/env node
/**
 * 浮層錨點失去版面時不得畫在視窗左上角(2026-09-16,user：「關閉那顆按鈕的 tooltip 會跑去視窗左上角閃動一下」)。
 *
 * SSOT：`tokens/elevation/overlay-geometry.ts` 的 `OVERLAY_HIDE_WHEN_DETACHED`
 *(Tooltip / Popover / HoverCard / DropdownMenu 四個 portal 浮層的 default)。
 * 根因(修前)：錨點被 `display:none` 祖先藏起來後量出來是 0×0,Radix 仍拿它算位置 → `(0, OVERLAY_SIDE_OFFSET)`;
 *   浮層若正在播關閉動畫,使用者就看到它在左上角閃一下;若沒被關過(宿主程式關面板),它會停在那裡不走。
 *
 * 量法(M32,量畫面不量屬性)：逐幀讀 popper 外殼的 rect 與 computed visibility/opacity,
 *   只要有**看得見**的浮層落在視窗左上角(x < 40 且 y < 40)就判紅;附記 transform 與該幀時間。
 * 情境(AgentPanel 是真實案發現場:關閉面板 = 把面板藏起來,tooltip portal 在外面)：
 *   A 指標停在關閉鈕上 → 點擊關閉(user 的原始操作)
 *   B 指標停在關閉鈕上 → 由程式關閉面板(路由 / 快捷鍵;修前會留下不會消失的殭屍 tooltip)
 * 對照組(--selftest)：注入一個 `[data-radix-popper-content-wrapper]` 假浮層在 (0,8) 並可見,偵測器必須判紅。
 * 用法：node scripts/overlay-detached-anchor-invariant.mjs [--static=<dir>] [--selftest]
 */
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { gotoStory, launchBrowser } from './lib/launch-browser.mjs'
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const root = path.resolve(REPO, arg('static', 'storybook-static'))
if (!fs.existsSync(path.join(root, 'index.json'))) { console.error(`找不到 ${root}/index.json —— 先 build storybook`); process.exit(2) }
if (fs.statSync(path.join(REPO, 'packages/design-system/src/components/Tooltip/tooltip.tsx')).mtimeMs > fs.statSync(path.join(root, 'index.html')).mtimeMs) {
  console.error(`✗ STALE-BUILD：tooltip.tsx 比 ${root} 新 —— 先重建該 storybook build`); process.exit(2)
}
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
// 失敗(非零結束或拋錯)一律附上同源 404 帳本:「儀器沒拿到檔」不得被讀成「浮層畫錯位置」
process.on('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const STORY = 'design-system-components-agentpanel-展示--task-assistant'
const CLOSE = 'button[aria-label="關閉面板"]'

/** 逐幀找「看得見又落在左上角」的浮層。回傳全部幀與違規幀。 */
const SAMPLER = (ms) => new Promise((done) => {
  const frames = []; const t0 = performance.now()
  const tick = () => {
    const wrappers = [...document.querySelectorAll('[data-radix-popper-content-wrapper]')]
    const seen = wrappers.map((w) => {
      const cs = getComputedStyle(w)
      const inner = w.querySelector('[role="tooltip"],[data-radix-popper-content-wrapper] > *') || w
      const ics = getComputedStyle(inner)
      const r = (inner === w ? w : inner).getBoundingClientRect()
      const visible = cs.visibility !== 'hidden' && ics.visibility !== 'hidden' && parseFloat(ics.opacity || '1') > 0.01 && r.width > 0 && r.height > 0
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible, transform: w.style.transform || getComputedStyle(w).transform, wrapperVisibility: cs.visibility }
    })
    frames.push({ t: Math.round(performance.now() - t0), seen })
    if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    else done(frames)
  }
  requestAnimationFrame(tick)
})
const topLeftHits = (frames) => frames.flatMap((f) => f.seen.filter((s) => s.visible && s.x < 40 && s.y < 40).map((s) => ({ t: f.t, ...s })))

const browser = await launchBrowser(); const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
let failed = 0
const rec = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }
// 等關閉鈕本身出現再量(理由同 agent-fab:固定睡眠會讓 hoverClose() 丟「找不到關閉鈕」)。
const fresh = async () => { await gotoStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitFor: CLOSE, settle: 900 }) }
const hoverClose = async () => {
  const b = await page.locator(CLOSE).first().boundingBox()
  if (!b) throw new Error('找不到關閉鈕')
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.waitForTimeout(900) // 等 tooltip 開啟延遲
  return b
}

if (SELFTEST) {
  await fresh()
  const frames = await page.evaluate(async (ms) => {
    const wrap = document.createElement('div')
    wrap.setAttribute('data-radix-popper-content-wrapper', '')
    wrap.style.cssText = 'position:fixed;left:0;top:0;transform:translate(0px, 8px);z-index:9999'
    const tip = document.createElement('div')
    tip.setAttribute('role', 'tooltip'); tip.textContent = '關閉面板'
    tip.style.cssText = 'padding:8px 12px;background:#333;color:#fff'
    wrap.appendChild(tip); document.body.appendChild(wrap)
    await new Promise((r) => setTimeout(r, 120))
    return 'injected'
  }, 300)
  const sampled = await page.evaluate(SAMPLER, 400)
  const hits = topLeftHits(sampled)
  rec(hits.length > 0, `對照組：注入一個可見的 (0,8) 假浮層 → 偵測器必須判紅 | 命中 ${hits.length} 幀,首見 ${JSON.stringify(hits[0] ?? null)}`)
  await browser.close(); await server.stop()
  const ok = failed === 0
  console.log(ok ? '✓ selftest：偵測器會紅,量具有效' : '✗ selftest：注入了左上角浮層卻沒判紅 —— 量具無效')
  process.exit(ok ? 0 : 1)
}

// 前提：tooltip 真的會開(否則整支閘空轉)
await fresh()
await hoverClose()
const opened = await page.evaluate(() => {
  const w = document.querySelector('[data-radix-popper-content-wrapper]')
  if (!w) return null
  const r = w.getBoundingClientRect()
  return { x: Math.round(r.x), y: Math.round(r.y), transform: w.style.transform }
})
rec(!!opened && opened.x > 40, `前提：指標停在關閉鈕上時 tooltip 開在鈕旁(非左上角)| ${JSON.stringify(opened)}`)

// A：指標停在鈕上 → 點擊關閉(user 的原始操作)
{
  const sampling = page.evaluate(SAMPLER, 1200)
  await page.mouse.down(); await page.mouse.up()
  const frames = await sampling
  const hits = topLeftHits(frames)
  rec(hits.length === 0, `A 點關閉鈕後 1.2 秒內,沒有任何一幀出現看得見的左上角浮層 | 取樣 ${frames.length} 幀${hits.length ? `,違規首見 t=${hits[0].t}ms ${hits[0].transform}` : ''}`)
}

// B：指標停在鈕上 → 由程式關閉面板(修前會留下不會消失的殭屍 tooltip)
{
  await fresh()
  await hoverClose()
  const sampling = page.evaluate(SAMPLER, 1500)
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="關閉面板"]')
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, detail: 0 }))
  })
  const frames = await sampling
  const hits = topLeftHits(frames)
  const last = frames.at(-1)?.seen ?? []
  rec(hits.length === 0, `B 程式關閉面板(指標仍停在鈕上)→ 沒有左上角浮層 | 取樣 ${frames.length} 幀${hits.length ? `,違規首見 t=${hits[0].t}ms ${hits[0].transform}` : ''}`)
  rec(!last.some((s) => s.visible && s.x < 40 && s.y < 40), `B 1.5 秒後也沒有殭屍浮層停在左上角 | 末幀 ${JSON.stringify(last)}`)
}

await browser.close(); await server.stop()
console.log(failed ? `✗ overlay-detached-anchor ${failed} 條失敗(SSOT：tokens/elevation/overlay-geometry.ts OVERLAY_HIDE_WHEN_DETACHED)` : '✅ overlay-detached-anchor PASS(錨點被藏起來時浮層不畫在左上角)')
process.exit(failed ? 1 : 0)
