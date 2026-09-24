#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 每一支 story 載入(含 play)之後,若沒有宣告 `parameters.demoFocus = 'keep'`,畫面上不會留著一個被瀏覽器判成
 *        鍵盤焦點(`:focus-visible`)而且真的畫出 outline 的元素 —— 示範 = 滑鼠使用者(user 2026-09-23:「我不要用滑鼠看
 *        範例結果直接就看到鍵盤焦點,我當下明明就沒有用鍵盤操作」)。放掉焦點的事由 storybook-config preview.tsx
 *        `settleDemoFocus` 做,本閘只驗它有做到;它會把當次模式寫在 `<html data-demo-focus>`(mouse | keep),
 *        沒有這個屬性 = 預覽層沒跑到,以儀器失效紅,不當綠燈。SSOT ds-canonical/rules/story-rules.md「示範 = 滑鼠使用者」。
 *   紅: 任一支非 keep 的 story 留著畫得出線的 :focus-visible → exit 1,逐支列出 story id / 焦點元素 / outline;
 *        任一支載入後沒有 data-demo-focus → exit 1(儀器失效);--selftest:對一支 keep 的 story 用**真鍵盤** Tab 造出焦點框,
 *        判定函式必須回報「有框」,再把同一份量測改成 mode=mouse 必須判成違規 —— 儀器看得到框、也會因它而紅。
 *   綠: 全部 story 逐支載入,零違規、零缺屬性;同一份 storybook-static 重複跑結果恆等(無取樣、無時鐘)。
 *
 * Run: `node scripts/story-demo-focus-invariant.mjs [--limit=N] [--concurrency=4] [--selftest]`(需先 build-storybook)
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launchBrowserOrSkip, gotoStory } from './lib/launch-browser.mjs'
import { serveStaticDir, attachStaticRoute } from './lib/sandboxed-verify-browser.mjs'

const ARGS = process.argv.slice(2)
const SELFTEST = ARGS.includes('--selftest')
const arg = (name, fallback) => { const hit = ARGS.find((a) => a.startsWith(`${name}=`)); return hit ? hit.slice(name.length + 1) : fallback }
const LIMIT = Number(arg('--limit', '0')) || 0
const CONCURRENCY = Math.max(1, Number(arg('--concurrency', '4')) || 4)
const ROOT = process.cwd()

/** 純判定(供 selftest 兩面對照):量到的焦點狀態 + 預覽層宣告的模式 → 這支 story 算不算違規 */
export function classifyDemoFocus({ mode, focusVisible, painted }) {
  // 'instrument' = 預覽層把這次載入當成儀器關掉了(沒帶 demoFocus=on)—— 對本閘而言等同沒跑到,一樣以儀器失效紅
  if (mode !== 'mouse' && mode !== 'keep') return 'instrument-missing'
  if (mode === 'keep') return 'keep'
  return focusVisible && painted ? 'violation' : 'ok'
}

const measure = (page) => page.evaluate(() => {
  const a = document.activeElement
  const mode = document.documentElement.dataset.demoFocus ?? null
  if (!a || a === document.body) return { mode, focusVisible: false, painted: false, tag: 'BODY', text: '' }
  const s = getComputedStyle(a)
  return {
    mode,
    focusVisible: a.matches(':focus-visible'),
    painted: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0,
    tag: a.tagName,
    text: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 40),
    outline: `${s.outlineWidth} ${s.outlineStyle}`,
  }
})

// 缺前置守衛:訊息形狀對齊 scripts/lib/gate-selftest-meta.mjs 認得的「storybook-static missing」,夜間 gate-meta lane 的拋棄式快照
// 沒有建置產物,會以「略過」而不是「baseline 應該綠卻紅」收(2026-09-24 審查抓到:沒守衛 → serveStaticDir 丟別的訊息 → 每晚紅沒人看)
if (!existsSync(resolve(ROOT, 'storybook-static/index.json'))) {
  console.error('✗ storybook-static missing. Run `npm run build-storybook` first.')
  process.exit(1)
}
const served = await serveStaticDir(resolve(ROOT, 'storybook-static'), { port: 6191 })
const browser = await launchBrowserOrSkip()
// 直接開 iframe.html 時預覽層把自己當儀器關掉(見 preview.tsx demoFocusEnabled);本閘要看的正是 user 在管理介面看到的畫面 → 帶 on
const storyUrl = (id) => `${served.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&demoFocus=on`

// 等的是「示範收尾跑完」這件事本身(preview.tsx afterEach 蓋的 `data-demo-focus-settled=<story id>`),不是固定睡眠:
// 2026-09-24 main 09d2eaa2 在慢的 runner 上,Toast 朗讀區域 story 的 play 還沒跑完(合成點擊留下鍵盤框)閘就在 900ms 量了 → 假紅,
// 而同一份建置在 PR 上剛綠過(M32 第四題「機器慢的時候還會綠嗎」)。play 丟錯的 story 沒有這個章 → 以載入錯誤紅(不放行)。
// 章之後再留 300ms 給 Radix 還焦點 / Dialog 聚焦捲動區那類收尾後的程式聚焦(監聽器會放掉它們,量的是放掉之後)。
const SETTLED_TIMEOUT_MS = 60_000
async function openStory(page, id) {
  await gotoStory(page, storyUrl(id), { waitFor: '#storybook-root > *', settle: 0 })
  await page.waitForFunction((storyId) => document.documentElement.dataset.demoFocusSettled === storyId, id, { timeout: SETTLED_TIMEOUT_MS })
  await page.waitForTimeout(300)
  return measure(page)
}

let exitCode = 0
try {
  if (SELFTEST) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await attachStaticRoute(page, served)
    // 對照組 1:keep 的 story 自己就帶著焦點框(play 裡 .focus());儀器必須量到「有框」
    const kept = await openStory(page, 'design-system-components-button-展示--hover-focus-state')
    const seesRing = kept.mode === 'keep' && kept.focusVisible && kept.painted
    console.log(`${seesRing ? '✓' : '✗'} 對照組 keep:儀器量到焦點框(${JSON.stringify(kept)})`)
    // 對照組 2:同一份量測若模式是 mouse,判定必須是違規(閘會因此紅)
    const verdict = classifyDemoFocus({ ...kept, mode: 'mouse' })
    console.log(`${verdict === 'violation' ? '✓' : '✗'} 對照組 mouse:同一個框判成違規(得 ${verdict})`)
    // 對照組 3:真鍵盤 Tab 在一支滑鼠模式的 story 上造出框 → 量得到、判違規
    await gotoStory(page, storyUrl('design-system-components-button-展示--default'), { waitFor: '#storybook-root > *', settle: 600 })
    await page.keyboard.press('Tab'); await page.waitForTimeout(250)
    const tabbed = await measure(page)
    const tabVerdict = classifyDemoFocus(tabbed)
    console.log(`${tabbed.focusVisible && tabbed.painted && tabVerdict === 'violation' ? '✓' : '✗'} 對照組 Tab:真鍵盤造出的框被判違規(${JSON.stringify(tabbed)} → ${tabVerdict})`)
    // 對照組 4:沒有 data-demo-focus = 儀器失效
    const missing = classifyDemoFocus({ mode: null, focusVisible: false, painted: false })
    console.log(`${missing === 'instrument-missing' ? '✓' : '✗'} 對照組 缺屬性:判成儀器失效(得 ${missing})`)
    // 對照組 5(與機器速度無關的證明,2026-09-24):把 CPU 節流 30 倍再開 Toast 朗讀區域 story —— 它的 play 會點好幾顆按鈕。
    // (a) 舊代理「根節點出現 + 900ms」量到的時候,收尾章還沒蓋(play 還在跑);(b) 等章再量 → 乾淨。兩面都成立才算儀器有效。
    const toastId = 'design-system-components-toast-展示--live-region-contract'
    let throttled = false
    try { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 30 }); throttled = true } catch { /* 無 CDP 就跳過這組,但要講出來 */ }
    let earlyOk = false; let lateOk = false
    if (throttled) {
      await gotoStory(page, storyUrl(toastId), { waitFor: '#storybook-root > *', settle: 900 })
      const early = await page.evaluate(() => document.documentElement.dataset.demoFocusSettled ?? null)
      earlyOk = early === null
      console.log(`${earlyOk ? '✓' : '✗'} 對照組 節流:根節點出現 + 900ms 時收尾章還沒蓋(章=${early})—— 固定睡眠量不到 play 跑完`)
      const late = await openStory(page, toastId)
      lateOk = classifyDemoFocus(late) === 'ok'
      console.log(`${lateOk ? '✓' : '✗'} 對照組 節流:等到收尾章再量 → 乾淨(${JSON.stringify(late)})`)
    } else {
      console.log('✗ 對照組 節流:這個瀏覽器沒有 CDP 節流,無法證明「等章」與機器速度無關')
    }
    exitCode = seesRing && verdict === 'violation' && tabVerdict === 'violation' && missing === 'instrument-missing' && earlyOk && lateOk ? 0 : 1
    await page.close()
  } else {
    const index = JSON.parse(readFileSync(resolve(ROOT, 'storybook-static/index.json'), 'utf8'))
    let ids = Object.values(index.entries).filter((e) => e.type === 'story').map((e) => e.id)
    if (LIMIT) ids = ids.slice(0, LIMIT)
    // 0 支 story = index 壞了,不是「沒有違規」(M37:沒觀察到 ≠ 沒發生)
    if (ids.length === 0) { console.log('✗ storybook-static/index.json 裡沒有任何 story —— 儀器失效,不當綠燈'); process.exitCode = 1; await browser.close(); await served.close(); process.exit(1) }
    const violations = []; const missing = []; const errors = []; let kept = 0; let done = 0
    const queue = ids.slice()
    // 沙箱下 Chromium 以 --single-process 啟動(launch-browser.mjs SANDBOX_ARGS):每個 newPage 各開一個 context 會撞
    // 「Target page, context or browser has been closed」(2026-09-23 實測),同一個 context 裡開多個分頁才行。
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      const page = await context.newPage()
      await attachStaticRoute(page, served)
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          const m = await openStory(page, id)
          const verdict = classifyDemoFocus(m)
          if (verdict === 'violation') violations.push({ id, ...m })
          else if (verdict === 'instrument-missing') missing.push(id)
          else if (verdict === 'keep') kept += 1
        } catch (error) { errors.push({ id, error: String(error).slice(0, 160) }) }
        done += 1
        if (done % 100 === 0) console.log(`  … ${done}/${ids.length}`)
      }
      await page.close()
    }))
    console.log(`掃了 ${ids.length} 支:keep ${kept} / 違規 ${violations.length} / 缺 data-demo-focus ${missing.length} / 載入錯誤 ${errors.length}`)
    for (const v of violations) console.log(`✗ ${v.id}:留著鍵盤焦點框 <${v.tag}>「${v.text}」outline ${v.outline}`)
    for (const id of missing) console.log(`✗ ${id}:載入後沒有 <html data-demo-focus>(預覽層 settleDemoFocus 沒跑到 —— 儀器失效)`)
    for (const e of errors) console.log(`✗ ${e.id}:載入失敗 ${e.error}`)
    exitCode = violations.length || missing.length || errors.length ? 1 : 0
    if (exitCode === 0) console.log('✅ 示範 = 滑鼠使用者:沒有任何 story 在沒用鍵盤時留著鍵盤焦點框')
  }
} finally {
  await browser.close(); await served.close()
}
process.exit(exitCode)
