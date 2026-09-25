#!/usr/bin/env node
/**
 * Tag 在 Field control 裡的垂直內距不變條件(2026-09-15,user 抓「Combobox sm 的 tag 沒垂直置中」)。
 *
 * 量的是像素,不是 class:
 *   I1 單行:每個 field wrapper 裡第一個 Tag 的上隙 − 下隙 ≤ 0.5px(對稱置中)。
 *   I2 wrap:第一行 Tag 的上隙 = 同尺寸單行的上隙(±0.5px)—— 切到 wrap 第一行不位移。
 *   I3 Tag 內文字在 Tag 裡上下對稱(≤ 0.5px)。
 *   I4 四邊等距:左隙 = 上隙(tag.spec.md:231;SSOT field-wrapper.tsx fieldTagInsetX/Y)。
 *   I5 wrap 總高 = 2px 邊框 + 2×內距 + 列數×Tag 高 + (列數−1)×4(1 列 = 尺寸 token)。
 *   I6 右側 chevron 右隙 = --field-px 12px(field-controls.spec.md:279 re-assert)。
 *   I7 Tag 盒高 = TAG_HEIGHT_PX = --tag-height-*(兩住所不可漂移)。
 * 對照組(--selftest):把 tag 量測 wrapper 從 flex 改回區塊盒、wrap 內距改回 py-1,I1 / I2 / I4 / I5 必須紅。
 *
 * 根因紀錄:Combobox 每個 tag 外的量測 wrapper 原是區塊盒,高度由欄位字型行高(21px)決定,sm 的 Tag(20px)
 * 沿基線沉底 → 上 3.9 / 下 2.1;wrap 的 `py-1` 寫死 4px 與單行置中(3/3/5)差 1px。owner:combobox.tsx OverflowTagList。
 *
 * 開 story(2026-09-25 起):lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)—— Storybook 回報渲染完成
 * (含 play)+ render-health + 被量的 [data-tag-root] 本身 + 版面連續 10 影格靜止,才開始量像素。取代原本的
 * 「load + 等 Tag + 固定睡 600ms」(固定睡眠是「版面已穩定」的代理)。story 開不起來 = 儀器失效:點名 story、附同源 404、
 * exit 1(不用 2:lib/gate-selftest-meta.mjs 把 exit 2 讀成「環境起不來 → 略過」,沒量到會被 meta-test 當成綠),不是產品裁決,也不會在 --selftest 下被算成「對照組讓它紅了」。
 *
 * 用法:node scripts/tag-field-vertical-inset.mjs [--static=<dir>] [--selftest]
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const root = path.resolve(REPO, arg('static', 'storybook-static'))
const STORIES = [
  'design-system-components-combobox-設計規格--size-matrix',
  'design-system-components-combobox-設計規格--state-behavior',
  'design-system-components-select-設計規格--size-matrix',
]
const SABOTAGE = '[data-tag-root]{vertical-align:baseline}div.shrink-0.max-w-full{display:block!important}[data-field-mode]{padding-top:4px!important;padding-bottom:4px!important}'
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
// 失敗(非零結束或拋錯)一律附上同源 404 帳本:「儀器沒拿到檔」不得被讀成「Tag 沒置中」
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const PROBE = () => {
  const out = []; const seen = new Set()
  for (const t of document.querySelectorAll('[data-tag-root]')) {
    let w = t.parentElement, wrapper = null
    while (w && w !== document.body) { if (w.hasAttribute('data-field-mode') || /h-field-/.test(String(w.className))) { wrapper = w; break } w = w.parentElement }
    if (!wrapper || seen.has(wrapper)) continue; seen.add(wrapper)
    const wr = wrapper.getBoundingClientRect(), cs = getComputedStyle(wrapper)
    const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0
    const first = wrapper.querySelector('[data-tag-root]'); const tr = first.getBoundingClientRect()
    const txt = first.querySelector('[data-tag-text]'); const xr = txt ? txt.getBoundingClientRect() : null
    const rows = new Set([...wrapper.querySelectorAll('[data-tag-root]')].map((x) => Math.round(x.getBoundingClientRect().top))).size
    const wrap = cs.alignItems === 'flex-start'
    const h = Math.round(wrap ? parseFloat(cs.minHeight) || 0 : wr.height)
    const size = wrap ? (/h-field-sm/.test(wrapper.className) ? 'sm' : /h-field-lg/.test(wrapper.className) ? 'lg' : 'md') : h === 28 ? 'sm' : h === 32 ? 'md' : h === 36 ? 'lg' : `h${h}`
    const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0
    // 右側 chevron:wrapper 最後一個直接子元素裡的 svg(ItemSuffix);沒有就 null(readonly 無 chevron 的路徑)
    // 最後一個 svg 才是 chevron —— clearable 有值時 clear X 在左、ChevronDown 在右(spec :278),取第一個會量到 X。
    const lastChild = wrapper.lastElementChild; const svgs = lastChild && lastChild !== first ? [...lastChild.querySelectorAll('svg')] : []; const chev = svgs.length ? svgs[svgs.length - 1] : null
    const chevRight = chev ? +(wr.right - br - chev.getBoundingClientRect().right).toFixed(2) : null
    out.push({ chevRight, tagH: +tr.height.toFixed(2), size, wrap, rows, wrapperH: +wr.height.toFixed(2), mode: wrapper.getAttribute('data-field-mode') || '?', gapTop: +(tr.top - wr.top - bt).toFixed(2), gapBottom: +(wr.bottom - bb - tr.bottom).toFixed(2),
      gapLeft: +(tr.left - wr.left - bl).toFixed(2),
      textTop: xr ? +(xr.top - tr.top).toFixed(2) : null, textBottom: xr ? +(tr.bottom - xr.bottom).toFixed(2) : null })
  }
  return out
}
const browser = await launchBrowser(); const ctx = await browser.newContext({ viewport: { width: 1400, height: 1600 }, deviceScaleFactor: 1 }); const page = await ctx.newPage()
const all = []
const instrumentFails = []
for (const id of STORIES) {
  try {
    // 渲染完成(含 play)+ render-health + 被量的 Tag 本身 + 版面連續 10 影格靜止(量的是置中 / wrap 高度這類幾何,要穩態)
    await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
      waitFor: '[data-tag-root]', settleFrames: 10, navigationTimeoutMs: 90000, notFound: server.notFound,
    })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    console.log(`✗ ${error.message}`)
    instrumentFails.push(id)
    continue
  }
  if (SELFTEST) await page.addStyleTag({ content: SABOTAGE })
  for (const r of await page.evaluate(PROBE)) all.push({ story: id.split('--')[1], ...r })
}
await browser.close(); await server.stop()
if (instrumentFails.length) {
  // 沒量到 ≠ 通過,也 ≠ 對照組紅了:取樣不完整,本次不下任何產品判定(同源 404 帳本由上方 exit 監聽印出)
  console.log(`✗ 儀器失效:${instrumentFails.length} 則 story 沒量到(${instrumentFails.join(', ')})—— 這不是產品裁決,本次不判定 I1–I7`)
  process.exit(1)
}
let failed = 0
const rec = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }
const single = all.filter((r) => !r.wrap)
rec(single.length >= 6, `取樣:單行 ${single.length} 個、wrap ${all.filter((r) => r.wrap).length} 個(需 ≥ 6 個單行)`)
for (const r of single) rec(Math.abs(r.gapTop - r.gapBottom) <= 0.5, `I1 ${r.story} ${r.size} ${r.mode}:單行 Tag 上隙 ${r.gapTop} / 下隙 ${r.gapBottom}(|差| ≤ 0.5)`)
for (const r of all.filter((x) => x.wrap)) {
  const ref = single.find((s) => s.size === r.size && s.story.startsWith('size'))
  rec(!!ref && Math.abs(r.gapTop - ref.gapTop) <= 0.5, `I2 ${r.story} ${r.size} ${r.mode}:wrap 第一行上隙 ${r.gapTop} vs 單行 ${ref ? ref.gapTop : '?'}(±0.5)`)
}
for (const r of single.filter((x) => x.textTop != null)) rec(Math.abs(r.textTop - r.textBottom) <= 0.5, `I3 ${r.story} ${r.size}:Tag 內文字上 ${r.textTop} / 下 ${r.textBottom}`)
// I7 Tag 盒高 = TAG_HEIGHT_PX / --tag-height-*(20/24/24):CSS token 與 JS 常數兩住所不可漂移。
for (const r of all) rec(Math.abs(r.tagH - (r.size === 'sm' ? 20 : 24)) <= 0.5, `I7 ${r.story} ${r.size}:Tag 高 ${r.tagH}(需 ${r.size === 'sm' ? 20 : 24})`)
// I5 wrap 的總高是公式不是巧合:2px 邊框 + 2×內距 + 列數×Tag 高 + (列數−1)×4px 列距。
// 1 列時就是尺寸 token(28/32/36)—— 舊 py-1 會讓 sm/md 多 2px、lg 少 2px。
for (const r of all.filter((x) => x.wrap)) {
  const tagH = r.size === 'sm' ? 20 : 24, inset = r.size === 'lg' ? 5 : 3
  const expect = 2 + 2 * inset + r.rows * tagH + (r.rows - 1) * 4
  rec(Math.abs(r.wrapperH - expect) <= 0.5, `I5 ${r.story} ${r.size} ${r.mode}(wrap ${r.rows} 列):總高 ${r.wrapperH} = 2 + 2×${inset} + ${r.rows}×${tagH} + ${r.rows - 1}×4 = ${expect}(±0.5)`)
}
// I6 右側 chevron 右緣 = --field-px 12px(field-controls.spec.md:279「tag 容器必 re-assert paddingRight」)。
for (const r of all.filter((x) => x.chevRight != null)) rec(Math.abs(r.chevRight - 12) <= 0.5, `I6 ${r.story} ${r.size} ${r.mode}:chevron 右隙 ${r.chevRight}(需 12 ±0.5)`)
// I4 四邊等距(tag.spec.md:231):左隙 = 上隙(±0.5)。PeoplePicker stack 模式刻意用 --field-px 12px 蓋掉左隙,不在本閘取樣(它沒有 [data-tag-root])。
for (const r of all) rec(Math.abs(r.gapLeft - r.gapTop) <= 0.5, `I4 ${r.story} ${r.size} ${r.mode}${r.wrap ? '(wrap)' : ''}:Tag 左隙 ${r.gapLeft} vs 上隙 ${r.gapTop}(四邊等距 ±0.5)`)
if (SELFTEST) { const ok = failed > 0; console.log(ok ? `✓ selftest:對照組(區塊盒 + py-1)讓 ${failed} 條紅,量具會紅` : '✗ selftest:對照組沒讓任何一條紅 —— 量具無效'); process.exit(ok ? 0 : 1) }
console.log(failed ? `✗ tag-field-vertical-inset ${failed} 條失敗` : `✅ tag-field-vertical-inset PASS(${all.length} 個實例)`)
process.exit(failed ? 1 : 0)
