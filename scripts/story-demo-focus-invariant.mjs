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
import { readFileSync } from 'node:fs'
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

const served = await serveStaticDir(resolve(ROOT, 'storybook-static'), { port: 6191 })
const browser = await launchBrowserOrSkip()
// 直接開 iframe.html 時預覽層把自己當儀器關掉(見 preview.tsx demoFocusEnabled);本閘要看的正是 user 在管理介面看到的畫面 → 帶 on
const storyUrl = (id) => `${served.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&demoFocus=on`

async function openStory(page, id) {
  await gotoStory(page, storyUrl(id), { waitFor: '#storybook-root > *', settle: 900 })
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
    exitCode = seesRing && verdict === 'violation' && tabVerdict === 'violation' && missing === 'instrument-missing' ? 0 : 1
    await page.close()
  } else {
    const index = JSON.parse(readFileSync(resolve(ROOT, 'storybook-static/index.json'), 'utf8'))
    let ids = Object.values(index.entries).filter((e) => e.type === 'story').map((e) => e.id)
    if (LIMIT) ids = ids.slice(0, LIMIT)
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
