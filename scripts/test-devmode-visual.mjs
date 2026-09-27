#!/usr/bin/env node
/**
 * Visual verification for DS Devmode addon(`npm run devmode:test`)— covers:
 *   1. Position layer renders for `position: absolute` element
 *   2. Canvas redline at small distance(< 8px)— no number label, line only
 *   3. Compact red label visual width verification
 *   4. Sibling distance(pin one element, hover another)
 *
 * Each case:
 *   1. Open the story itself(Storybook iframe)and prove it rendered + the target exists(shared openStory)
 *   2. Open the manager(toolbar + panel live there)and prove it rendered(openStory, document mode)
 *   3. Activate addon via toolbar button → wait until the addon reports active
 *   4. Pin the target via dispatchEvent → wait for the redline overlay + the panel payload
 *   5. Screenshot full panel + canvas into ./tmp/(relative to cwd)
 *
 * 需要一個跑著的 Storybook:預設 dev server `http://localhost:6006`(`npm run storybook`);
 * `SB_URL=<origin>`(或 `SB_PORT=<port>`)可指到任何一份 Storybook,例如靜態建置。
 *
 * **2026-09-25 根因修正(M37:沒量到被讀成沒發生)**:
 *   · 舊版在**同一個 `--single-process` 瀏覽器**上每個案例 `newContext()` + `close()` —— 共用啟動參數
 *     (lib/launch-browser.mjs 檔頭)明說這樣「第一個過、第二個當場崩」:實測第 2 個案例就
 *     `browserContext.newPage: Target page, context or browser has been closed`,5 組截圖只產出 1 組。
 *     現在每個案例重開一次瀏覽器。
 *   · 舊版 `networkidle` + 固定睡 1500ms 當「已渲染」,找不到目標元素印「SKIP」後繼續,結尾不論如何 exit 0。
 *     實測 6 個案例裡 4 個指向**早已不存在的 story**(button 展示 all-variants、tag 展示 with-icon),
 *     這 4 個一直是「SKIP」—— 這支工具長期只驗了 1/6,而輸出看起來是綠的。
 *     現在:story 開不起來 / 目標元素不在 / 伺服器連不上 = 儀器失效(INSTRUMENT-FAIL),addon 沒有反應 = 產品失敗,
 *     兩者都 exit 1 並點名案例;只有全部案例都產出截圖才 exit 0。
 *     失效的 4 個案例改指向同一批元素現在所在的 story(Button 設計原則「變體 選擇」有同一組
 *     新增 / 取消 / 前往設定;Tag 設計原則「圖示」有同一種 border-transparent 的 Tag)。
 *   · 固定睡眠一律換成等「那件事本身」:工具列按鈕變成 Disable、iframe 裡出現紅線 overlay、
 *     面板出現 Layer properties / Sibling distance。
 *   · 滑鼠點完面板分頁後停在分頁上,視窗拉高後那個位置落進預覽 iframe,真實 hover 會把釘選模式的 sibling
 *     換掉(far-sibling 截到的是別的元素)—— 現在先把滑鼠停到 manager 左上角,sibling hover 放在最後一次版面變動之後。
 */
import fs from 'fs'
import {
  INSTRUMENT_FAIL_MARKER,
  StoryRenderInstrumentError,
  launchBrowserOrSkip,
  openStory,
} from './lib/launch-browser.mjs'

const BASE = (process.env.SB_URL || `http://localhost:${process.env.SB_PORT || '6006'}`).replace(/\/+$/, '')
const OUT_DIR = 'tmp'
// 每一步「等某個東西出現」的上限 —— 只是等不到的上限,不是「已經好了」的代理;成功一律由那個東西真的出現決定
const STEP_TIMEOUT_MS = 20_000
const VIEWPORT = { width: 1600, height: 1000 }

const tests = [
  {
    name: 'avatar-status-dot',
    storyId: 'design-system-components-avatar-設計原則--with-badge-overlay-rule',
    targetSelector: '[aria-hidden="true"][class*="absolute"][class*="rounded-full"]',
    desc: 'Avatar status dot — position:absolute, tiny ~8x8',
  },
  {
    name: 'button-link-span',
    storyId: 'design-system-components-button-設計原則--variant-rule',
    targetSelector: 'button:has-text("前往設定") span.px-1',
    desc: 'Button link span — distance interior idiom(parent padding 12 扣後 = 0)',
  },
  {
    name: 'button-itself',
    storyId: 'design-system-components-button-設計原則--variant-rule',
    targetSelector: 'button:has-text("新增")',
    desc: 'Button itself — distance to story container content area',
  },
  {
    name: 'tag-with-border',
    storyId: 'design-system-components-tag-設計原則--icon-rule',
    targetSelector: 'div.inline-flex.rounded-md.border',
    desc: 'Tag — has border-transparent 1px, expects Border 1/1/1/1',
  },
  {
    name: 'far-sibling',
    storyId: 'design-system-components-button-設計原則--variant-rule',
    targetSelector: 'button:has-text("新增")',
    desc: 'Pin 新增 + hover 前往設定(far sibling,超過 MAX_LINE 200px)— check sibling MAX_LINE 一致性',
    siblingHover: 'button:has-text("前往設定")',
  },
  {
    name: 'sibling-distance',
    storyId: 'design-system-components-button-設計原則--variant-rule',
    targetSelector: 'button:has-text("新增")',
    desc: 'pin 新增 button + hover 取消 button → 元件↔元件 distance(只截 canvas)',
    siblingHover: 'button:has-text("取消")',
    canvasOnly: true,
  },
]

const firstLine = (value) => String(value?.message ?? value).split('\n')[0]

/** 儀器失效:沒量到(story / manager / 目標元素 / 伺服器),不是 addon 的問題。 */
class InstrumentStepError extends Error {}
/** 產品失敗:story 與目標都在,是 addon 自己沒有反應。 */
class AddonStepError extends Error {}

async function instrumentStep(label, promise) {
  try { return await promise } catch (error) { throw new InstrumentStepError(`${label}:${firstLine(error)}`) }
}
async function addonStep(label, promise) {
  try { return await promise } catch (error) { throw new AddonStepError(`${label}:${firstLine(error)}`) }
}

// ── 前置:伺服器與 story 索引。連不上 / 案例指向不存在的 story → 儀器失效(舊版會一路 SKIP 到 exit 0)──
let indexEntries
try {
  const response = await fetch(`${BASE}/index.json`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  indexEntries = (await response.json()).entries || {}
} catch (error) {
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:連不上 Storybook(${BASE}/index.json:${firstLine(error)}${error?.cause ? ` / ${firstLine(error.cause.code ?? error.cause)}` : ''})`)
  console.error('   先 `npm run storybook`(預設 http://localhost:6006),或以 SB_URL=<origin> 指到一份跑著的 Storybook。')
  console.error('   這是儀器失效(沒量到),不是產品裁決 —— 一張截圖都沒有產出。')
  process.exit(1)
}

fs.mkdirSync(OUT_DIR, { recursive: true })

async function runCase(t) {
  if (!indexEntries[t.storyId]) {
    throw new InstrumentStepError(`story「${t.storyId}」不在 ${BASE}/index.json 裡(改名或被刪了?)—— 案例指向的東西不存在`)
  }
  const shots = []
  // `--single-process` 開不了第二個 browser context:每個案例重開一次瀏覽器(lib/launch-browser.mjs 檔頭)
  const browser = await launchBrowserOrSkip({}, { hint: 'devmode:test 需要 Chromium 才能截 DS Devmode 的圖。' })
  try {
    const page = await browser.newPage({ viewport: VIEWPORT })

    // 1. story 本身真的渲染完成、目標元素在(共用 openStory;錯誤頁 / 空畫面 / 缺檔 / 例外都會在這裡丟)
    try {
      await openStory(page, `${BASE}/iframe.html?id=${encodeURIComponent(t.storyId)}&viewMode=story`, {
        label: t.storyId,
        waitFor: t.targetSelector,
        timeoutMs: STEP_TIMEOUT_MS,
        healthTimeoutMs: STEP_TIMEOUT_MS,
      })
    } catch (error) {
      throw new InstrumentStepError(error instanceof StoryRenderInstrumentError ? `story「${t.storyId}」:${error.detail}` : firstLine(error))
    }

    // 2. manager(工具列與面板住在這裡):document 模式證明 manager 本身渲染出來、沒有缺檔 / 例外
    try {
      await openStory(page, `${BASE}/?path=/story/${encodeURIComponent(t.storyId)}`, {
        storybook: false,
        label: `manager(${t.storyId})`,
        waitFor: 'button[title*="DS Devmode"]',
        timeoutMs: STEP_TIMEOUT_MS,
        // manager bundle 比單則 story 重得多:共用預設 5s 在機器忙的時候不夠(2026-09-25 實測:與全 story 掃描並跑時
        // manager #root 5s 內仍空 → 誤判儀器失效)。上限拉到與其他步驟相同,成功仍由 #root 真的有內容決定。
        healthTimeoutMs: STEP_TIMEOUT_MS,
      })
    } catch (error) {
      if (error instanceof StoryRenderInstrumentError && error.kind === 'wait-for-timeout') {
        throw new AddonStepError(`manager 渲染完成,但工具列沒有 DS Devmode 按鈕(addon 沒有註冊?)`)
      }
      throw new InstrumentStepError(error instanceof StoryRenderInstrumentError ? `manager:${error.detail}` : firstLine(error))
    }
    const iframe = page.frameLocator('#storybook-preview-iframe')
    const target = iframe.locator(t.targetSelector).first()
    await instrumentStep(`manager 的預覽 iframe 裡等不到目標 ${t.targetSelector}`, target.waitFor({ state: 'attached', timeout: STEP_TIMEOUT_MS }))

    // 3. 啟用 addon:等 addon 自己回報「已啟用」(preview 收到 TOGGLE 後回播,按鈕標題變 Disable)
    await page.locator('button[title*="DS Devmode"]').first().click()
    await addonStep('按下工具列後 DS Devmode 沒有啟用(按鈕沒有變成 Disable)',
      page.locator('button[title^="Disable DS Devmode"]').first().waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS }))

    const measure = await target.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const parent = el.parentElement
      const pr = parent?.getBoundingClientRect()
      return {
        rect: { w: r.width, h: r.height, x: r.left, y: r.top },
        position: cs.position,
        parentRect: pr ? { w: pr.width, h: pr.height } : null,
        distanceLeft: pr ? r.left - pr.left : null,
        distanceRight: pr ? pr.right - r.right : null,
        distanceTop: pr ? r.top - pr.top : null,
        distanceBottom: pr ? pr.bottom - r.bottom : null,
      }
    })
    console.log(`  Element:`, JSON.stringify(measure))

    // 4. 釘選:等 iframe 裡真的畫出紅線 overlay
    await target.evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    await addonStep('釘選後預覽裡沒有畫出紅線 overlay(#__ds_devmode_overlay__)',
      iframe.locator('#__ds_devmode_overlay__ > *').first().waitFor({ state: 'attached', timeout: STEP_TIMEOUT_MS }))

    // 面板:點 DS Devmode 分頁,等面板收到釘選資料
    const tab = page.locator('button[role="tab"]:has-text("DS Devmode")').first()
    await addonStep('面板列沒有 DS Devmode 分頁', tab.waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS }))
    await tab.click()
    await addonStep('DS Devmode 面板沒有收到釘選資料(沒有 Layer properties)',
      page.getByText('Layer properties', { exact: true }).first().waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS }))
    // 滑鼠停到 manager 左上角(任何視窗高度都在預覽 iframe 之外)。不停開的話它留在分頁上,
    // 下面把視窗拉高後分頁的位置會落進預覽 iframe → 真實的 mouseover 把釘選模式的 sibling 換成滑鼠底下那個元素
    //(2026-09-25 實測:far-sibling 截圖裡量的是「pressed prop」說明文字,不是「前往設定」)。
    await page.mouse.move(1, 1)

    // sibling 測距:hover 另一個元素,等面板出現 Sibling distance。放在最後一個版面變動(拉高視窗)之後、截圖之前
    const hoverSibling = async () => {
      if (!t.siblingHover) return
      const sibling = iframe.locator(t.siblingHover).first()
      await instrumentStep(`預覽 iframe 裡等不到 sibling ${t.siblingHover}`, sibling.waitFor({ state: 'attached', timeout: STEP_TIMEOUT_MS }))
      await sibling.evaluate((el) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true })))
      const distance = page.getByText('Sibling distance', { exact: true }).first()
      await addonStep('hover sibling 後面板沒有出現 Sibling distance', distance.waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS }))
      console.log(`  Sibling: ${(await distance.locator('..').textContent())?.replace(/\s+/g, ' ').trim()}`)
    }

    const canvasShot = async (name, height) => {
      const iframeRect = await page.locator('#storybook-preview-iframe').boundingBox()
      if (!iframeRect) throw new InstrumentStepError('量不到預覽 iframe 的位置,canvas 截圖沒有產出')
      const path = `${OUT_DIR}/visual-${name}-canvas.png`
      await page.screenshot({
        path,
        clip: { x: iframeRect.x, y: iframeRect.y, width: Math.min(iframeRect.width, 800), height: Math.min(iframeRect.height, height) },
      })
      shots.push(path)
      console.log(`  Canvas: ${path}`)
    }

    if (t.canvasOnly) {
      await hoverSibling()
      await canvasShot(t.name, 200)
      return shots
    }

    const panelScrollResult = await page.evaluate(() => {
      // The DS Devmode panel root is inside [role="tabpanel"] — find scrollable parent
      const heads = Array.from(document.querySelectorAll('div')).filter(d =>
        d.textContent?.startsWith('DS Devmode') && d.children.length >= 2,
      )
      if (heads.length === 0) return { ok: false, reason: 'no DS Devmode heading' }
      let cur = heads[heads.length - 1]
      while (cur && cur.scrollHeight <= cur.clientHeight + 5) cur = cur.parentElement
      if (!cur) return { ok: false, reason: 'no scrollable parent' }
      const rect = cur.getBoundingClientRect()
      return { ok: true, rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }, scrollHeight: cur.scrollHeight }
    })
    console.log(`  Panel scroll info: ${JSON.stringify(panelScrollResult)}`)

    // 視窗拉高截完整面板:等兩個影格讓版面跟上新視窗(影格不是毫秒,慢的機器只會等久一點)
    await page.setViewportSize({ width: VIEWPORT.width, height: 1500 })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await hoverSibling()

    const fullPath = `${OUT_DIR}/visual-${t.name}-full.png`
    await page.screenshot({ path: fullPath, fullPage: false })
    shots.push(fullPath)

    await canvasShot(t.name, 400)

    const anatomyRect = await page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll('div')).filter(d => d.textContent?.startsWith('Layer properties'))
      if (heads.length === 0) return null
      const head = heads[heads.length - 1]
      const next = head.nextElementSibling
      if (!next) return null
      const r = next.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return null
      return { x: Math.max(0, r.left - 10), y: Math.max(0, head.getBoundingClientRect().top - 5), w: Math.min(r.width + 20, 1400), h: Math.min(r.height + 50, 350) }
    })
    // 面板已證明收到資料(Layer properties 可見),量不到它的區塊 = 面板沒有畫出 anatomy → addon 的問題,不是略過
    if (!anatomyRect) throw new AddonStepError('面板有 Layer properties 標題,但 anatomy 區塊量不到(寬或高為 0)—— 面板截圖沒有產出')
    const anatomyPath = `${OUT_DIR}/visual-${t.name}-panel.png`
    await page.screenshot({ path: anatomyPath, clip: { x: anatomyRect.x, y: anatomyRect.y, width: anatomyRect.w, height: anatomyRect.h } })
    shots.push(anatomyPath)
    console.log(`  Panel: ${anatomyPath}`)
    return shots
  } finally {
    await browser.close()
  }
}

const results = []
for (const t of tests) {
  console.log(`\n=== ${t.name}: ${t.desc} ===`)
  try {
    const shots = await runCase(t)
    results.push({ t, ok: true, shots })
  } catch (error) {
    const kind = error instanceof AddonStepError ? 'addon' : 'instrument'
    console.error(`  ✗ ${kind === 'instrument' ? `${INSTRUMENT_FAIL_MARKER} ` : ''}${firstLine(error)}`)
    results.push({ t, ok: false, kind, reason: firstLine(error) })
  }
}

const instrument = results.filter((r) => !r.ok && r.kind === 'instrument')
const addon = results.filter((r) => !r.ok && r.kind === 'addon')
const passed = results.filter((r) => r.ok)
console.log(`\n=== ${passed.length}/${tests.length} 個案例產出截圖(${passed.reduce((n, r) => n + r.shots.length, 0)} 張,${OUT_DIR}/)===`)
if (addon.length > 0) {
  console.error(`✗ ${addon.length} 個案例是 DS Devmode addon 自己沒有反應(產品失敗):`)
  for (const r of addon) console.error(`   - ${r.t.name}(${r.t.storyId}):${r.reason}`)
}
if (instrument.length > 0) {
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrument.length} 個案例沒有量到(儀器失效,不是 addon 的問題;沒量到不等於通過):`)
  for (const r of instrument) console.error(`   - ${r.t.name}(${r.t.storyId}):${r.reason}`)
}
process.exit(passed.length === tests.length ? 0 : 1)
