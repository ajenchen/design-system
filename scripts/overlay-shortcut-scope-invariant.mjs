#!/usr/bin/env node
/**
 * 浮層快捷鍵的作用域必須限定在自己那一區(2026-09-08)
 *
 * FileViewer 的 window keydown 舊版只排除 input / textarea / contentEditable,其餘一律接手。
 * 在「檢視器是唯一可聚焦的東西」的年代看不出問題 —— 但那是**被 modal 遮住而剛好沒事**,
 * 不是真的有作用域。一旦有東西與它並存(agent 原則 v14 條 A/B),在旁邊那一區的**按鈕**上
 * 按方向鍵就會操作到這個檢視器,而使用者的視線根本不在這裡。
 *
 * 兩條都驗,缺一不可:
 *   (A) 焦點在檢視器**外**的可聚焦元素 → 快捷鍵**不得**生效
 *   (B) 焦點在檢視器**內** → 快捷鍵**仍然**要生效(否則就是把功能弄壞來換綠燈)
 *
 * 開 story(2026-09-25 起):lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)——
 * Storybook 回報渲染完成(含 play)+ render-health + 檢視器標題(被量的指紋本身)出現 + 版面連續 10 影格靜止(開啟動畫走完)。
 * 取代原本「load + 等標題 30 秒(逾時被 `.catch(() => {})` 吞掉)」:舊寫法在 story 開不起來時以「前提:檢視器已開」紅,
 * 讀起來像產品沒開檢視器;`--selftest` 下則印「這支閘是假綠」—— 兩個都指控錯對象(M37)。
 * 現在開不起來 = 儀器失效:點名 story、附同源 404、exit 2 —— 不是產品裁決,也不算對照組結果。
 *
 * Run: `node scripts/overlay-shortcut-scope-invariant.mjs [--selftest]`(讀 `<cwd>/storybook-static`)
 */
import { join } from 'node:path'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const STATIC = join(process.cwd(), 'storybook-static')
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
const report404 = () => { if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) }

const SELFTEST = process.argv.includes('--selftest')
const out = []; let fail = 0
const ck = (t, p, d = '') => { out.push(`${p ? '✓' : '✗'} ${t}${d ? ' | ' + d : ''}`); if (!p) fail++ }
const STORY = 'design-system-components-fileviewer-展示--coexistence-contract'
/** story 開不起來(StoryRenderInstrumentError):儀器失效,結尾 exit 2 */
let instrumentFailure = null

try {
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  // 檢視器目前顯示哪一個檔案 —— 用標題文字當指紋
  const title = () => page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    return dialog?.querySelector('h1,h2,[data-slot="title"],header')?.textContent?.trim().slice(0, 40) ?? null
  })

  // 等到檢視器真的掛出來再量,不用固定睡 1 秒 —— 共享 runner 上 1 秒不夠,story 還沒 mount 就讀到 null,
  // 這支閘會以「前提不成立」翻紅(2026-09-11 c34e035c 的 component + interaction gates 就是這樣紅的)。
  // 等的是被量的指紋本身(與 title() 同一個選擇器);等不到 = 儀器失效(openStory 丟例外),不再吞掉後以「前提」指控產品。
  await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, {
    waitFor: () => !!document.querySelector('[role="dialog"]')?.querySelector('h1,h2,[data-slot="title"],header')?.textContent?.trim(),
    settleFrames: 10,
    notFound: server.notFound,
  })

  if (SELFTEST) {
    // 對照組:把 2026-09-08 的舊 bug 原樣種回去 —— 一個掛在 window 上、不看焦點在哪裡的
    // 方向鍵處理器。它走的是使用者看得見的同一條路(標題會換檔),所以 (A) 若抓不到,
    // 就代表這支閘的綠燈是零證據,而不是「作用域真的守住了」。
    await page.evaluate(() => {
      window.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight') return
        const dialog = document.querySelector('[role="dialog"]')
        const next = dialog && [...dialog.querySelectorAll('button')]
          .find((button) => (button.getAttribute('aria-label') || '').includes('下一個檔案'))
        next?.click()
      }, true)
    })
  }

  const before = await title()
  ck('前提:檢視器已開且讀得到目前檔名', !!before, `目前=${before}`)

  if (before) {
    // ── (A) 焦點在檢視器外 ────────────────────────────────────────────────
    // 造一個檢視器外、非輸入框的可聚焦元素(這正是舊版判準漏掉的形狀)
    // 用 story 裡真的常駐區按鈕,不自己 append 一個 —— 自己 append 的節點不在保留集合裡,
    // 會被 `suppressOthers` inert 掉而聚焦不了,那樣測到的是「探針壞了」不是「作用域對了」。
    // 送出鈕在輸入空白時停用(story 依規格),先打字讓它可聚焦
    await page.focus('#fv-aside-input').catch(() => {}); await page.keyboard.type('x')
    await page.evaluate(() => {
      (document.querySelector('#fv-aside-btn'))?.focus()
    })
    const focusedOutside = await page.evaluate(() => document.activeElement?.id === 'fv-aside-btn')
    ck('前提:焦點真的在檢視器外的按鈕上', focusedOutside)
    if (focusedOutside) {
      await page.keyboard.press('ArrowRight')
      // 觀察窗:給不看焦點的快捷鍵處理器 350ms 把檔案切走(「不得切換」是負向斷言,只能用觀察窗)
      await page.waitForTimeout(350)
      const after = await title()
      ck('A 焦點在檢視器外時,方向鍵**不得**切換檔案', after === before, `前=${before} 後=${after}`)
    }

    // ── (B) 對照組:焦點在檢視器內時仍然要能切 ──────────────────────────
    const focusedInside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      const btn = dialog?.querySelector('button:not([disabled])')
      btn?.focus()
      return !!btn && dialog?.contains(document.activeElement)
    })
    ck('前提:焦點真的進到檢視器內', !!focusedInside)
    if (focusedInside) {
      await page.keyboard.press('ArrowRight')
      // 等方向鍵切檔後檢視器標題重畫(與上面 (A) 同一個觀察窗,兩邊才可比)
      await page.waitForTimeout(350)
      const after = await title()
      ck('B 對照組:焦點在檢視器內時,方向鍵**仍然**要切換檔案(沒把功能弄壞換綠燈)',
         after !== before, `前=${before} 後=${after}`)
    }
  }

  await browser.close()
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) { report404(); throw error }
  instrumentFailure = error
} finally {
  await server.stop()
}
console.log(out.join('\n'))

if (instrumentFailure) {
  // 沒量到 ≠ 沒問題:story 開不起來是儀器失效(exit 2),不是產品裁決,也絕不算通過(selftest 亦同 —— 不得算成「對照組抓到 / 沒抓到」)
  console.error(`✗ ${instrumentFailure.message}`)
  report404()
  console.error('✗ overlay-shortcut-scope:儀器失效 —— 這次什麼都沒量到')
  process.exit(2)
}

if (SELFTEST) {
  // 紅在對的地方才算數:必須是 (A)「焦點在外不得切檔」那一條被打到。
  const caught = out.some((line) => line.startsWith('✗') && line.includes('A 焦點在檢視器外'))
  console.log(caught
    ? '\n✓ selftest:不看焦點的 window 快捷鍵被 (A) 抓到,量具會紅'
    : `\n✗ selftest:種回舊 bug 卻沒被 (A) 抓到 —— 這支閘是假綠(總失敗 ${fail})`)
  if (!caught) report404()
  process.exit(caught ? 0 : 1)
}

console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 全部通過')
if (fail) report404()
process.exit(fail ? 1 : 0)
