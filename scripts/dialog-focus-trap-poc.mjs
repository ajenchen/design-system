#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// G1 POC:Modal Dialog 開著時,舞台上的浮層到底能不能用
// ═══════════════════════════════════════════════════════════════════════════
//
// **原本要驗的是什麼**:`@radix-ui/react-focus-scope` 讀出來 ——
//   `:71-73`  `focusScopesStack.add(focusScope)` 寫在 `if (container)` 裡,**不看 `trapped`**
//   `:184-190` `add` 會對前一個 scope 呼叫 `pause()`
//   `:105`    Tab 守衛開頭就是 `if (focusScope.paused) return`
// 推論:掛載任何 FocusScope(含 `modal={false}` 的)都會讓 Modal Dialog 的 Tab 守衛失效。
// 這是 agent 面板要與有 URL 的 Modal 並存(spec A 條)時的硬約束,
// 總帳明訂「POC 過之前不得宣稱硬約束成立」。
//
// **實測結果:那個失效今天觸發不到 —— 因為那個浮層一開始就打不開。**
// Modal Dialog 開著時,舞台整片被 `aria-hidden`、`body` 是 `pointer-events:none`、
// 焦點一放到外面就被 FocusScope 拉回 Dialog 內。所以「並存」這件事本身還不存在,
// 談不上它會不會破壞焦點鎖。硬約束**仍未驗證**,而且要等隔離範圍縮到舞台
//(`aria-hidden` 的 `suppressOthers(targets, stageEl)`,見總帳 L1)之後才驗得到。
//
// **順帶量到 G4 的證據**:舞台元素是 `aria-hidden="true"` 但 **`inert=false`**,
// 也就是它們**仍在 Tab 順序裡** —— 那正是 axe `aria-hidden-focus` 的形狀。
// 今天沒有變成「焦點跑出去」只是因為 FocusScope 的 Tab 守衛還在攔。
//
// ── 這支 POC 前後改了五次才拿到可信的量測,踩到的坑全部記在這裡 ──
//   1. 判定「焦點在不在 Dialog 內」寫成 `closest('[role="dialog"]')` → **Radix 的
//      PopoverContent 自己就帶 `role="dialog"`**,判定是模糊的。改用 `[aria-modal="true"]`。
//   2. 對照組用「把 Dialog 關掉」:找關閉鈕的文字選擇器命中不到 → 靜靜地什麼都沒關;
//      改按 Esc → 被最上層的浮層接走。兩次都在「Dialog 還開著」的狀態下量。改用**獨立 story**。
//   3. 非 modal Popover 的內容不進自然 Tab 順序 → 對照組建立不起來。改用 DropdownMenu。
//   4. Radix 選單是 `pointerdown` 開的,`.click()` 不會觸發。改用聚焦 + Enter。
//   5. 浮層已經開著時再點一次會**關掉**它。開啟動作要冪等。
// 教訓一句話:**「沒有觀察到 X」在對照組成立之前不代表任何事。**
//
// 這是 POC(量測紀錄),不是 CI 閘;但同樣不准把「沒量到」讀成結論:
// 開 story(2026-09-25 起)一律走 lib/launch-browser.mjs 的 openStory(全部瀏覽器腳本共用的唯一實作)——
// Storybook 回報渲染完成(含 play)+ render-health + 觸發鈕本身出現 + 版面連續 10 影格靜止(Dialog 開場動畫走完、
// aria-hidden 已套上)才開始量。取代原本的「networkidle + 固定睡 800ms」(「已渲染」的代理,M37)。
// 舊寫法在 story 檔 404 時照樣量一張空白頁,還印出「✓ Modal Dialog 開著時,舞台浮層打不開」—— 空白頁上本來就打不開。
// 現在 story 開不起來 = 儀器失效:點名 story、附同源 404、exit 2,不印任何結論。
//
// Run: `node scripts/dialog-focus-trap-poc.mjs`

import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { launchBrowserOrSkip, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const S = join(process.cwd(), 'storybook-static')
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
const B = server.origin
// 失敗時一併印同源 404 帳本:不讓「儀器沒拿到檔」被讀成「元件沒渲染」
const report404 = () => { if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) }

// 啟動參數與「起不來 → SKIPPED-ENV」行為沿用共用實作(M17)
const br = await launchBrowserOrSkip()

const pg = await br.newPage({ viewport: { width: 1280, height: 900 } })
const probe = async (id) => {
  await openStory(pg, `${B}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
    waitFor: '#poc-popover-trigger', settleFrames: 10, notFound: server.notFound,
  })
  const before = await pg.evaluate(async () => {
    const t = document.getElementById('poc-popover-trigger')
    const bodyPE = getComputedStyle(document.body).pointerEvents
    t?.focus()
    // 等 FocusScope 的 focusin / focusout 守衛把焦點拉回 Dialog(觸發鈕早已在畫面上,等的是焦點事件的處理)
    await new Promise((r) => setTimeout(r, 150))
    const hidden = t?.closest('[aria-hidden="true"],[inert]')
    return {
      bodyPointerEvents: bodyPE,
      觸發鈕拿得到焦點: document.activeElement === t,
      焦點實際落在: document.activeElement?.id || document.activeElement?.getAttribute('role') || document.activeElement?.tagName,
      觸發鈕被藏: hidden ? { tag: hidden.tagName, ariaHidden: hidden.getAttribute('aria-hidden'), inert: hidden.hasAttribute('inert') } : null,
    }
  })
  await pg.keyboard.press('Enter')
  // 等選單的開啟過渡(Radix Presence 掛載 + 進場動畫);選單一直沒出現就是「開不起來」—— 那正是要記錄的結果
  await pg.waitForTimeout(500)
  const opened = await pg.evaluate(() => !!document.querySelector('[role="menu"]'))
  return { ...before, 選單開得起來: opened }
}

let withDialog, control
try {
  withDialog = await probe('design-system-components-dialog-展示--focus-trap-with-concurrent-overlay')
  control = await probe('design-system-components-dialog-展示--focus-trap-control-no-dialog')
} catch (e) {
  if (e instanceof StoryRenderInstrumentError) {
    // 沒量到 ≠ 浮層打不開:儀器失效(exit 2),不是產品裁決,不印任何結論
    console.error(`✗ ${e.message}`)
    report404()
    console.error('✗ dialog-focus-trap-poc:儀器失效 —— 這次什麼都沒量到,不產生任何結論')
    await br.close(); await server.stop(); process.exit(2)
  }
  report404(); await br.close(); await server.stop(); throw e
}

console.log('【Modal Dialog 開著】', JSON.stringify(withDialog, null, 1))
console.log('【對照組:沒有 Dialog】', JSON.stringify(control, null, 1))

const out = []; let fail = 0
const ck = (t, p, d = '') => { out.push(`${p ? '✓' : '✗'} ${t}${d ? ' | ' + d : ''}`); if (!p) fail++ }

// 對照組先成立,下面的比較才有意義
ck('對照組:沒有 Dialog 時浮層開得起來', control.選單開得起來 && control.觸發鈕拿得到焦點, JSON.stringify(control))
// 主結論
ck('Modal Dialog 開著時,舞台浮層**打不開**(所以「並存破壞焦點鎖」今天觸發不到)',
   !withDialog.選單開得起來 && !withDialog.觸發鈕拿得到焦點,
   `body pointer-events=${withDialog.bodyPointerEvents}、焦點被拉回 ${withDialog.焦點實際落在}`)
// G4 的形狀
ck('G4:舞台元素是 aria-hidden 但**沒有 inert**(仍在 Tab 順序裡 = axe aria-hidden-focus 的形狀)',
   withDialog.觸發鈕被藏?.ariaHidden === 'true' && withDialog.觸發鈕被藏?.inert === false,
   JSON.stringify(withDialog.觸發鈕被藏))

console.log('\n' + out.join('\n'))
console.log(fail ? `\n✗ ${fail} 項與預期不符 —— 代表行為變了,結論要重寫` : '\n✓ 三項皆如實測所述')
console.log('\n【結論】G1 的硬約束**仍未驗證**,而且要等隔離範圍縮到舞台之後才驗得到。')
await br.close(); await server.stop()
if (fail) report404()
process.exit(fail ? 1 : 0)
