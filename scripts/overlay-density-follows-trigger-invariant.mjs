#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 從「密度和整頁不同的區塊」打開的小浮層,用觸發點那一區的密度 —— 區塊裡的 sm 下拉,打開的選項列高 =
 *        那一區的 --field-height-sm(= 觸發點自己的高);Popover 的版面間距仍鎖 md(--layout-space-loose = 16)。
 *        (user 2026-11-11 決策頁「浮層密度」答「跟按鈕」;規則住 tokens/density/density.spec.md「浮層跟觸發點」)
 *   紅: 任一格選項列高 ≠ 那一區的 --field-height-sm,或 ≠ 觸發點高,或 Popover 內容的 --layout-space-loose ≠ 16 → 指名格子與量值,exit 1。
 *   綠: 整頁一般 / 大密度 × 一般 / 大密度區塊的下拉(uiSize「產品對齊用的共用尺寸」story)4 格全部相等。
 *   註: 等「選項本身」出現再量(waitForSelector),不用固定睡眠;量的是性質本身(列高 vs 那一區的 token 計算值),
 *       不是「浮層上有沒有某個屬性」(M37)。
 *
 * 為什麼(稽核 R7-02):浮層經 Portal 掛到 body,CSS 繼承鏈從 html 起算 → 一般密度頁面裡的大密度區塊,
 *   sm 下拉按鈕 32 高、選項列 28(反方向 28 / 32)。
 *
 * 跑法:
 *   node scripts/overlay-density-follows-trigger-invariant.mjs [--static=<dir>]           現況(要綠)
 *   node scripts/overlay-density-follows-trigger-invariant.mjs --selftest                 對照組:把浮層上讀到的控制項檔位拿掉 → 區塊與整頁不同的 2 格必紅;現況必綠
 */
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip, requireFreshStorybookBuild, settleAfterInteraction } from './lib/launch-browser.mjs'

const ROOT = process.cwd()
const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(ROOT, staticArg)) : join(ROOT, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const STORY = 'design-system-tokens-uisize--product-alignment'
const REGIONS = [['md', '角色條件(一般密度)'], ['lg', '角色條件(大密度)']]
const PAGES = ['md', 'lg']
const TOL = 0.5

// 對照組:浮層開出來後把讀到的控制項檔位拿掉(= 回到「跟整頁」的舊行為)
const SABOTAGE = `(() => {
  const strip = () => document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-ui-size]').forEach((el) => el.removeAttribute('data-ui-size'))
  strip(); new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ui-size'] })
})()`

async function runCells(page, sv, sabotage) {
  const cells = []
  for (const pageTier of PAGES) {
    for (const [regionTier, label] of REGIONS) {
      try {
        await openStory(page, `${sv.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story&globals=density:${pageTier}`, {
          settleFrames: 6, notFound: sv.notFound, waitFor: `[aria-label="${label}"]`,
          beforeSettle: sabotage ? async (p) => { await p.addScriptTag({ content: SABOTAGE }) } : null,
        })
      } catch (error) {
        if (!(error instanceof StoryRenderInstrumentError)) throw error
        return { instrumentFail: `${STORY}:${error.message}` }
      }
      const trigger = page.locator(`[aria-label="${label}"]`).first()
      await trigger.click()
      await page.waitForSelector('[role=listbox] [role=option]', { state: 'visible', timeout: 15000 })
      const settled = await settleAfterInteraction(page, { frames: 6, capMs: 6000 })
      if (!settled.ok) return { instrumentFail: `${pageTier}/${regionTier}:打開後等不到版面靜止` }
      const m = await page.evaluate((lab) => {
        const t = document.querySelector(`[aria-label="${lab}"]`)
        const opt = document.querySelector('[role=listbox] [role=option]')
        const content = opt?.closest('[data-radix-popper-content-wrapper] > *')
        const px = (el, name) => { const p = document.createElement('i'); p.style.cssText = `position:absolute;visibility:hidden;width:var(${name})`; el.appendChild(p); const w = p.getBoundingClientRect().width; p.remove(); return w }
        return {
          triggerH: t.getBoundingClientRect().height,
          regionSm: px(t.parentElement, '--field-height-sm'),
          optionH: opt.getBoundingClientRect().height,
          contentLoose: content ? px(content, '--layout-space-loose') : NaN,
        }
      }, label)
      const ok = Math.abs(m.optionH - m.regionSm) < TOL && Math.abs(m.optionH - m.triggerH) < TOL && Math.abs(m.contentLoose - 16) < TOL
      cells.push({ ok, label: `整頁 ${pageTier} / ${regionTier === 'md' ? '一般' : '大'}密度區塊`, differs: pageTier !== regionTier, detail: `觸發點 ${m.triggerH} / 那一區 --field-height-sm ${m.regionSm} / 選項列 ${m.optionH} / 浮層 --layout-space-loose ${m.contentLoose}` })
      await page.keyboard.press('Escape')
      await page.waitForSelector('[role=listbox]', { state: 'detached', timeout: 15000 })
    }
  }
  return { cells }
}

requireFreshStorybookBuild(S, [
  'packages/design-system/src/lib/overlay-density.tsx',
  'packages/design-system/src/components/Popover/popover.tsx',
  'packages/design-system/src/components/SelectMenu/select-menu.tsx',
  'packages/design-system/src/tokens/uiSize/uiSize.stories.tsx',
  'packages/design-system/src/tokens/uiSize/uiSize.css',
])
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
const br = await launchBrowserOrSkip({}, { cleanup: () => sv.stop() })
const page = await br.newPage({ viewport: { width: 1280, height: 900 } })
const problems = []
const base = await runCells(page, sv, null)
if (base.instrumentFail) { console.error(`✗ 儀器失效:${base.instrumentFail}`); await br.close(); await sv.stop(); process.exit(1) }
for (const c of base.cells) console.log(`${c.ok ? '✓' : '✗'} ${c.label} | ${c.detail}`)
if (base.cells.some((c) => !c.ok)) problems.push(`${base.cells.filter((c) => !c.ok).length} 格浮層密度沒跟觸發點那一區`)
if (SELFTEST) {
  if (problems.length) problems.unshift('前提不成立:未破壞的頁面就紅(對照組紅了也不代表什麼)')
  const run = await runCells(page, sv, SABOTAGE)
  if (run.instrumentFail) { console.error(`✗ 儀器失效:${run.instrumentFail}`); await br.close(); await sv.stop(); process.exit(1) }
  const redDiffers = run.cells.filter((c) => c.differs && !c.ok).length
  const redSame = run.cells.filter((c) => !c.differs && !c.ok).length
  if (redDiffers === 2 && redSame === 0) console.log('✓ 對照組:拿掉浮層讀到的控制項檔位 → 區塊與整頁不同的 2 格紅、相同的 2 格綠(量具會紅、紅在對的地方)')
  else problems.push(`對照組沒照預期:區塊與整頁不同的格紅了 ${redDiffers}/2、相同的格紅了 ${redSame}/0 —— 量具無效`)
}
await br.close(); await sv.stop()
if (problems.length) { console.log(`\n✗ 浮層密度跟觸發點:\n  ${problems.join('\n  ')}`); process.exit(1) }
console.log(SELFTEST ? '\n✓ selftest 通過' : `\n✅ 浮層密度跟觸發點:${base.cells.length} 格選項列高 = 那一區的值 = 觸發點高,Popover 版面間距鎖 md`)
process.exit(0)
