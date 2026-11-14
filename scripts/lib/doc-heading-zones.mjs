// ═══════════════════════════════════════════════════════════════════════════
// 說明頁標題區的頁面量具 ——「怎麼列出標題區、怎麼量標題區底 → 內容頂、怎麼請產品重判一次」的**唯一**實作(2026-11-14,A7 ⑤)
// ═══════════════════════════════════════════════════════════════════════════
//
// 使用者:scripts/doc-heading-inventory-invariant.mjs(全站盤點)、scripts/section-gap-invariant.mjs(「標題區 → 內容」各列)。
// 兩支以前各寫一份(section-gap 的標題列量法原本寫在它自己的 measureCase 裡),同一種量法只留這一份(M17)。
//
// 被量的東西(規範 packages/design-system/src/tokens/layoutSpace/layoutSpace.spec.md 規則 3「標題區 → 內容」):
//   標題區 = 說明頁(設計原則頁、展示頁、設計規格頁)內容區裡的小標題 + 它的說明。三種共用元件畫它:
//   · ExampleSection(`[data-example-section]`;TutorialRule 是它加 `data-tutorial-rule`)—— stories-helpers/examples/tutorial-page.tsx
//   · 設計規格頁的 H3(`[data-spec-heading]`)/ Desc(`[data-spec-desc]`)—— stories-helpers/anatomy/anatomy-utils.tsx
//   產品在標題區最後一個元素上標 `data-heading-content="one|many"`(tutorial-page.tsx `useHeadingContent`,每次 render 後的 layout effect 重判),
//   間距 class 依它切換:one(底下只有一塊)= tight、many(兩塊以上)= loose;段落模式(底下是一段文字 / 清單)不標、一律 tight。
//   「幾塊怎麼數」只寫在產品(tutorial-page.tsx `headingContentOf`,【AI 推導】的數法)—— **本檔不抄數法**,只讀產品標的結果、量像素。
//
// 一個標題區 = 下面其中一種(依文件順序):
//   · 每個 `[data-example-section]`:kind = 'rule'(帶 data-tutorial-rule)或 'es'
//   · 每個 `[data-spec-desc]`:前一個兄弟是 H3 → kind 'h3+desc'(title 取 H3 的字),否則 'desc'
//   · 每個後面**不是** Desc 的 `[data-spec-heading]`:kind 'h3'(後面緊接 Desc 的 H3 由那個 Desc 代表 —— 標題區的尾巴是說明)
// 量法(跟產品的 inFlowChildren 同一個「畫面上佔位置」定義:跳過 style / script / template、display:none、絕對 / 固定定位;display:contents 換成它的子節點):
//   · ExampleSection:第 1 個佔位置的子節點 = 標題區(標題 + 說明),第 2 個 = 內容頂
//   · H3 / Desc:自己之後第一個佔位置的兄弟 = 內容頂;那個兄弟是另一個小標 = 沒有內容
//   gap = 內容頂 − 標題區底(getBoundingClientRect,四捨五入到 0.1px);loose / tight 讀標題區元素自己的計算值。
//
// 重判(rejudgeHeadingZones):把三種選擇器命中的元素**全部**標成 `pending` → 送 Storybook 的 `forceReRender`(不重新掛載、不重跑 play;
// @storybook/core preview-api onForceReRender → rerender())→ 產品自己的 layout effect 把每個標記寫回(one / many,或在段落 / 沒有內容時拿掉)。
// 等的是被量的東西本身(頁面上沒有任何 pending)再等版面靜止,不睡固定毫秒。為什麼要重判:Storybook 把密度寫到 <html> 是在標題判定**之後**
// (packages/storybook-config/preview.tsx 的 useEffect 晚於 tutorial-page.tsx 的 layout effect),用 density:lg 開頁時首次判定用的仍是一般密度的版面
// —— 只比首次標記看不到「兩種密度判得不一樣」(design-doc-headings.md 二之 3 的對照組 α 實測)。
// 等不到 = 儀器失效(StoryRenderInstrumentError,訊息帶 INSTRUMENT-FAIL;不是產品裁決):找不到 channel、重畫後還有 pending(點名哪幾個)、
// 版面等不到靜止、重畫後出現 Storybook 錯誤頁。`forceReRender` 是 Storybook 內部事件名(8.6.19 實測);升版改名 → pending 留著 → 儀器失效(紅,不會假綠)。

import { settleAfterInteraction, StoryRenderInstrumentError } from './launch-browser.mjs'

/** 三種共用元件的標記選擇器(打亂與列舉共用這一份)。 */
export const HEADING_ZONE_SELECTOR = '[data-spec-heading],[data-spec-desc],[data-example-section]'

/** 標題區底 → 內容頂 與規則值的容許差(subpixel;與 scripts/section-gap-invariant.mjs 的 TOL 同一個理由)。 */
export const DOC_HEADING_GAP_TOL_PX = 0.6

/** 重畫之後等「沒有 pending」的上限 —— 只是「等不到」的天花板,成功由訊號本身決定(放寬不會造成假綠)。 */
export const DOC_HEADING_RERENDER_CAP_MS = 10_000

/** 量測前要連續靜止的影格數(openStory 的 settleFrames 與重判後的 settleAfterInteraction 共用)。 */
export const DOC_HEADING_SETTLE_FRAMES = 5

/**
 * 頁面函式:依文件順序列出每個標題區。**以 page.evaluate / openStory 的 probe 序列化傳入,不得引用外層變數。**
 * @param {{ selector: string, setMark?: { index: number, value: string } | null }} options
 *   setMark:列舉到第 index 個標題區時,先把它的 data-heading-content 改成 value(對照組「在頁面上把標記翻面」用;呼叫端之後要等靜止再列一次)
 * @returns {Array<{ kind: 'h3'|'h3+desc'|'desc'|'es'|'rule', title: string, mark: string|null, mode: 'block'|'paragraph',
 *   loose: number, tight: number, gap: number|null, hasContent: boolean, visible: boolean }>}
 */
export const listHeadingZonesInPage = (options) => {
  const { selector, setMark = null } = options ?? {}
  const SKIP_TAGS = ['STYLE', 'SCRIPT', 'TEMPLATE']
  const inFlowChildren = (el) => {
    const out = []
    for (const child of Array.from(el.children)) {
      if (SKIP_TAGS.includes(child.tagName)) continue
      const cs = getComputedStyle(child)
      if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue
      if (cs.display === 'contents') out.push(...inFlowChildren(child))
      else out.push(child)
    }
    return out
  }
  const round = (v) => Math.round(v * 10) / 10
  const text = (el) => String(el?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const zones = []
  for (const el of document.querySelectorAll(selector)) {
    let kind; let title; let mode; let label = null; let next = null
    if (el.hasAttribute('data-example-section')) {
      kind = el.hasAttribute('data-tutorial-rule') ? 'rule' : 'es'
      const kids = inFlowChildren(el)
      label = kids[0] ?? null
      next = kids[1] ?? null
      title = text(el.firstElementChild?.firstElementChild)
      // 區塊模式的 class 才有「只有一塊 → tight」那個變體;段落模式沒有(tutorial-page.tsx SECTION_BLOCK_GAP)
      mode = String(el.getAttribute('class') ?? '').includes('data-[heading-content=one]') ? 'block' : 'paragraph'
    } else {
      const isDesc = el.hasAttribute('data-spec-desc')
      // 後面緊接 Desc 的 H3 不是標題區的尾巴(由那個 Desc 代表;產品對這種 H3 也不標)
      if (!isDesc && el.nextElementSibling?.hasAttribute('data-spec-desc')) continue
      const prev = isDesc ? el.previousElementSibling : null
      const prevIsHeading = Boolean(prev?.hasAttribute('data-spec-heading'))
      kind = isDesc ? (prevIsHeading ? 'h3+desc' : 'desc') : 'h3'
      title = text(prevIsHeading ? prev : el)
      const owner = isDesc ? prev : el
      mode = owner?.getAttribute('data-spec-heading') === 'paragraph' ? 'paragraph' : 'block'
      label = el
      const siblings = el.parentElement ? inFlowChildren(el.parentElement) : []
      const at = siblings.indexOf(el)
      const after = at >= 0 ? siblings[at + 1] ?? null : null
      next = after && !after.hasAttribute('data-spec-heading') ? after : null
    }
    if (setMark && setMark.index === zones.length) el.setAttribute('data-heading-content', setMark.value)
    const cs = getComputedStyle(el)
    const loose = parseFloat(cs.getPropertyValue('--layout-space-loose'))
    const tight = parseFloat(cs.getPropertyValue('--layout-space-tight'))
    const visible = Boolean(label) && el.getBoundingClientRect().height > 0 && label.getBoundingClientRect().height > 0
    const gap = visible && next ? round(next.getBoundingClientRect().top - label.getBoundingClientRect().bottom) : null
    zones.push({ kind, title, mark: el.getAttribute('data-heading-content'), mode, loose, tight, gap, hasContent: Boolean(next), visible })
  }
  return zones
}

const instrument = (page, label, reason) => new StoryRenderInstrumentError({ storyId: label, url: page.url(), kind: 'heading-rerender', reason })

/**
 * 請產品重判一次:全部標記打亂成 pending → 送 forceReRender → 等頁面上沒有 pending → 等版面靜止 → 列出標題區。
 * 等不到任一步 = 丟 StoryRenderInstrumentError(儀器失效,不是產品裁決)。
 * @param {object} page Playwright 的 Page(story 已用 openStory 開好)
 * @param {{ label: string, capMs?: number, settleFrames?: number }} options
 */
export async function rejudgeHeadingZones(page, { label, capMs = DOC_HEADING_RERENDER_CAP_MS, settleFrames = DOC_HEADING_SETTLE_FRAMES } = {}) {
  const fired = await page.evaluate((selector) => {
    let scrambled = 0
    for (const el of document.querySelectorAll(selector)) { el.setAttribute('data-heading-content', 'pending'); scrambled++ }
    const channel = window.__STORYBOOK_ADDONS_CHANNEL__ ?? window.__STORYBOOK_PREVIEW__?.channel ?? null
    if (!channel || typeof channel.emit !== 'function') return { scrambled, channel: false }
    channel.emit('forceReRender')
    return { scrambled, channel: true }
  }, HEADING_ZONE_SELECTOR)
  if (!fired.channel) throw instrument(page, label, '頁面上找不到 Storybook 的 channel(__STORYBOOK_ADDONS_CHANNEL__ / __STORYBOOK_PREVIEW__.channel)—— 請不了產品重判,標記已打亂、量不到')
  if (fired.scrambled === 0) throw instrument(page, label, '頁面上沒有任何標題區可以打亂(呼叫端應該只在有標題區時重判)')
  const cleared = await page.waitForFunction(() => !document.querySelector('[data-heading-content="pending"]'), null, { timeout: capMs, polling: 'raf' })
    .then(() => true, () => false)
  if (!cleared) {
    const stuck = await page.evaluate(() => [...document.querySelectorAll('[data-heading-content="pending"]')]
      .map((el) => String((el.hasAttribute('data-example-section') ? el.firstElementChild?.firstElementChild : el)?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)))
      .catch(() => [])
    throw instrument(page, label, `送出重畫後 ${capMs / 1000} 秒內仍有 ${stuck.length} 個標題區停在 pending(產品沒有重判它們):${stuck.slice(0, 5).map((t) => `「${t}」`).join('、')}`)
  }
  const settle = await settleAfterInteraction(page, { frames: settleFrames })
  if (!settle.ok) throw instrument(page, label, `重判之後版面等不到連續 ${settleFrames} 格靜止(等了 ${settle.framesWaited} 格,期間 ${settle.lateChanges} 次變動)`)
  const errorPage = await page.evaluate(() => (document.body?.classList.contains('sb-show-errordisplay') ? (document.getElementById('error-message')?.textContent ?? '').trim().slice(0, 200) || '(無訊息)' : null))
  if (errorPage !== null) throw instrument(page, label, `重畫之後 Storybook 顯示錯誤頁:${errorPage}`)
  return page.evaluate(listHeadingZonesInPage, { selector: HEADING_ZONE_SELECTOR })
}

/**
 * 頁面上改了東西之後(對照組:注入樣式 / 把某個標記翻面)等版面靜止再列一次標題區;不請產品重判。
 * setMark 同 listHeadingZonesInPage(先翻面再等靜止、再量)。等不到靜止 = 儀器失效。
 * @param {object} page
 * @param {{ label: string, setMark?: { index: number, value: string } | null, settleFrames?: number }} options
 */
export async function listHeadingZonesAfterSettle(page, { label, setMark = null, settleFrames = DOC_HEADING_SETTLE_FRAMES } = {}) {
  if (setMark) await page.evaluate(listHeadingZonesInPage, { selector: HEADING_ZONE_SELECTOR, setMark })
  const settle = await settleAfterInteraction(page, { frames: settleFrames })
  if (!settle.ok) throw instrument(page, label, `改完之後版面等不到連續 ${settleFrames} 格靜止(等了 ${settle.framesWaited} 格)`)
  return page.evaluate(listHeadingZonesInPage, { selector: HEADING_ZONE_SELECTOR })
}

/**
 * 純函式:這個標題區「標題區底 → 內容頂」應該是多少(layoutSpace.spec.md 規則 3「標題區 → 內容」)。
 *   看不到 / 後面沒有內容 → null(不量);段落 → tight;one → tight;many → loose;
 *   區塊模式、後面有內容卻沒有判定 → { unjudged: true }(產品該標沒標;由呼叫端指名)。
 */
export function expectedHeadingGap(zone) {
  if (!zone.visible || !zone.hasContent) return null
  if (zone.mode === 'paragraph') return { token: 'tight', px: zone.tight }
  if (zone.mark === 'one') return { token: 'tight', px: zone.tight }
  if (zone.mark === 'many') return { token: 'loose', px: zone.loose }
  return { token: null, px: NaN, unjudged: true }
}

/** 同一頁不同次列舉之間對齊用的身分(共用元件 + 標題字)。 */
export const headingZoneKey = (zone) => `${zone.kind}|${zone.title}`

/** 訊息裡點名一個標題區。 */
export const describeHeadingZone = (zone) => `${zone.kind}「${String(zone.title).slice(0, 40)}${String(zone.title).length > 40 ? '…' : ''}」`

/**
 * section-gap 的列用:at = 標題區的種類(**逐字比對** kind:'h3' / 'h3+desc' / 'desc' / 'es' / 'rule'),text = 標題字開頭。
 * 種類不對也算找不到 —— 一列要量的是哪一種共用元件,寫在列上就是契約(量到別種 = 量的不是那一段)。
 * @returns {{ zone: object, index: number } | null}
 */
export function findHeadingZone(zones, { at, text }) {
  const index = zones.findIndex((z) => z.kind === at && String(z.title).startsWith(text))
  return index < 0 ? null : { zone: zones[index], index }
}
