#!/usr/bin/env node
/**
 * 不變式:**Combobox 只有一條路徑 —— 觸控裝置看到的跟桌機完全一樣。**
 *
 * owner:`packages/design-system/src/components/Combobox/combobox.spec.md`「單一路徑(不分裝置)」。
 *
 * 2026-09-18 user 拍板逐字:「我完全不想要為了手機客製化元件,我希望就是 SSOT,直接用桌機版的,
 * 什麼都完全不動,就只是讓手機跟桌機同步而已」。
 *
 * **為什麼需要一支在觸控模擬下跑的閘**:在此之前 Combobox 依 `(pointer: coarse)` 分流到一個
 * 隱藏原生 `<select>` 的實作,而**全 repo 沒有任何閘會開觸控模式**(唯一會帶 `--touch` 的腳本
 * 只截圖、不做斷言,且其 workflow 自述非 required check)。結果是:20 個 prop 在觸控上被靜默
 * 丟棄、「不限」的互斥規則完全沒有、DataTable 儲存格的 `defaultOpen`/`onOpenChange` 失效,
 * 全部沒有任何訊號。靜態字串比對做不到這件事 —— 必須真的用 coarse pointer 開一次瀏覽器。
 *
 * 量什麼(全部在 `hasTouch + isMobile` 的 context,`(pointer: coarse)` 為真):
 *   1. 媒體查詢真的是 coarse(否則整支等於在量桌機,是空綠)
 *   2. 欄位裡**沒有**原生 `<select>`(舊路徑的身分證)
 *   3. 點下去會開自訂浮層(cmdk root 存在)
 *   4. 桌機才有的東西在觸控上都在:搜尋框 / 全選 footer /「不限」列 / 分組分隔線
 *   5. 浮層不溢出視窗(390×844)
 *
 * 對照組 `--selftest`:把 cmdk 浮層整個移除並塞一顆原生 `<select>` 進欄位(等同舊的原生路徑),
 * 上面 2/3/4 必須紅。抓到 = exit 0,沒抓到 = exit 1。
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')

const STORY_UNRESTRICTED = 'design-system-components-combobox-展示--unrestricted-option'
const STORY_SEARCH = 'design-system-components-combobox-展示--unrestricted-search'
const STORY_MODES = 'design-system-components-combobox-展示--modes'

if (!existsSync(join(BUILD, 'index.json'))) {
  console.error(`✗ 找不到 ${join(BUILD, 'index.json')} —— 先跑 npm run build-storybook`)
  process.exit(2)
}

// 對照組:還原成舊的原生路徑長相 —— 拔掉浮層、在欄位裡塞一顆原生 <select>
const BREAK_BACK_TO_NATIVE = () => {
  for (const w of document.querySelectorAll('[data-radix-popper-content-wrapper]')) w.remove()
  const field = document.querySelector('[data-field-mode="edit"]:not([data-field-orientation])')
  if (!field) return false
  if (!field.querySelector('select')) {
    const sel = document.createElement('select')
    sel.innerHTML = '<option value="" disabled>選擇...</option>'
    field.appendChild(sel)
  }
  return true
}

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
// 觸控 context:Chromium 在 hasTouch + isMobile 下 `(pointer: coarse)` 為真
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
const page = await context.newPage()
page.on('pageerror', () => {})

const results = []
const ck = (名, 通過, 細節 = '') => { results.push({ 名, 通過, 細節 }) }
const goto = async (id) => {
  await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForFunction(() => document.querySelector('#storybook-root')?.children.length > 0, null, { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(500)
}
const 欄位狀態 = () => page.evaluate(() => {
  const fields = [...document.querySelectorAll('[data-field-mode="edit"]:not([data-field-orientation])')]
  return {
    coarse: window.matchMedia('(pointer: coarse)').matches,
    欄位數: fields.length,
    有原生select: fields.some((f) => !!f.querySelector('select')),
  }
})
const 浮層狀態 = () => page.evaluate(() => {
  const w = document.querySelector('[data-radix-popper-content-wrapper]')
  if (!w) return { 有浮層: false }
  const root = w.querySelector('[cmdk-root]')
  const r = (root || w).getBoundingClientRect()
  const groups = [...w.querySelectorAll('[cmdk-group]')].filter((g) => g.getClientRects().length)
  return {
    有浮層: true,
    有cmdk: !!root,
    列: [...w.querySelectorAll('[role="option"]')].map((x) => (x.textContent || '').trim().slice(0, 12)),
    有不限列: !!w.querySelector('[role="option"][data-unrestricted]'),
    有全選footer: !!w.querySelector('[data-slot="surface-footer"] button'),
    有搜尋框: !!w.querySelector('input'),
    群組數: groups.length,
    下一組上邊線: groups[1] ? getComputedStyle(groups[1]).borderTopWidth : null,
    溢出左: r.left < -0.5, 溢出右: r.right > window.innerWidth + 0.5, 溢出下: r.bottom > window.innerHeight + 0.5,
    寬: Math.round(r.width), 視窗寬: window.innerWidth,
  }
})

try {
  // 1. 觸控模擬真的生效(防空綠)
  await goto(STORY_MODES)
  const m = await 欄位狀態()
  ck('觸控模擬真的生效(pointer: coarse)', m.coarse === true, `coarse=${m.coarse}`)
  ck('欄位裡沒有原生 <select>(舊路徑的身分證)', m.欄位數 > 0 && !m.有原生select, `欄位 ${m.欄位數} 個 / 有原生select=${m.有原生select}`)

  // 2/3/4. 桌機的東西在觸控上都要在
  await goto(STORY_UNRESTRICTED)
  await page.locator('[data-field-mode="edit"]').first().click({ timeout: 5_000 }).catch(() => null)
  await page.waitForTimeout(600)
  if (SELFTEST) { await page.evaluate(BREAK_BACK_TO_NATIVE); await page.waitForTimeout(60) }
  const u = await 浮層狀態()
  // 這一條要在**破壞之後**再量一次,否則它在 selftest 裡永遠綠 = 沒有對照組
  //(2026-09-18:第一版只在破壞前量,那條斷言等於沒被驗過)
  const f2 = await 欄位狀態()
  ck('開著時欄位裡仍然沒有原生 <select>', !f2.有原生select, `有原生select=${f2.有原生select}`)
  ck('點下去開的是自訂浮層(cmdk)', u.有浮層 && u.有cmdk === true, JSON.stringify(u.列 || []))
  ck('「不限」那一列在觸控上也在', u.有不限列 === true)
  ck('全選 footer 在觸控上也在', u.有全選footer === true)
  ck('分組分隔線在觸控上也在', u.下一組上邊線 === '1px', String(u.下一組上邊線))
  ck('浮層不溢出視窗', u.有浮層 && !u.溢出左 && !u.溢出右 && !u.溢出下, `寬 ${u.寬} / 視窗 ${u.視窗寬}`)
  await page.keyboard.press('Escape').catch(() => null)
  await page.waitForTimeout(250)

  // 搜尋(桌機才有的能力)在觸控上也要在
  await goto(STORY_SEARCH)
  await page.locator('[data-field-mode="edit"]').first().click({ timeout: 5_000 }).catch(() => null)
  await page.waitForTimeout(600)
  if (SELFTEST) { await page.evaluate(BREAK_BACK_TO_NATIVE); await page.waitForTimeout(60) }
  const s = await 浮層狀態()
  ck('搜尋框在觸控上也在', s.有搜尋框 === true)
} finally {
  await page.close().catch(() => null)
  await context.close().catch(() => null)
  await browser.close().catch(() => null)
  await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 3_000).unref?.())]).catch(() => null)
}

for (const r of results) console.log(`${r.通過 ? '✓' : '✗'} ${r.名}${r.細節 ? ' | ' + r.細節 : ''}`)
const 失敗 = results.filter((r) => !r.通過)

if (SELFTEST) {
  // 對照組只該讓「浮層/內容」那幾條紅;`pointer: coarse` 那條是防空綠的地板,必須仍然綠
  const 地板 = results.find((r) => r.名.startsWith('觸控模擬真的生效'))
  if (!地板?.通過) { console.log('\n✗ selftest:觸控模擬本身失效 —— 這支等於沒跑'); process.exit(1) }
  if (失敗.length >= 3) { console.log(`\n✓ selftest:對照組(還原成原生路徑)讓 ${失敗.length} 條紅了,量具會紅`); process.exit(0) }
  console.log(`\n✗ selftest:對照組只讓 ${失敗.length} 條紅(期望 ≥ 3)—— 假綠,不能當證據`)
  process.exit(1)
}
if (失敗.length > 0) { console.log(`\n✗ ${失敗.length} 條不符`); process.exit(1) }
console.log('\n✓ Combobox 單一路徑:觸控裝置看到的跟桌機完全一樣(浮層 / 搜尋 / 全選 / 不限 / 分組皆在,且不溢出)')
process.exit(0)
