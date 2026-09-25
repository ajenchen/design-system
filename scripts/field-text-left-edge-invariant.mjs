#!/usr/bin/env node
/**
 * 不變式:**Field control 的水平內距是標準 `--field-px`,除非欄位裡真的有 Tag**。
 *
 * 依據(逐字):
 *   `components/Field/field-controls.spec.md:298`
 *     「tagPadding 只在有 Tag 時才套用。Placeholder/空值狀態使用 fieldWrapper 的標準
 *       `--field-px`(`px-[var(--field-px)]`)padding,確保文字與邊框有足夠間距。」
 *   同檔 `:21` —— field 的水平內距走 `--field-px`,與選單列的 `--item-px: var(--field-px)` 連續一致
 *     (Consumers:Input / NumberInput / DatePicker / Select / Combobox / LinkInput / PeoplePicker)。
 *   同檔 `:279` —— tag 模式特例:左側內距改用四邊等距公式,理由是**讓 Tag 四邊等距**
 *     (`components/Tag/tag.spec.md`「圓角與間距」,2026-09-15 df463144)。
 *
 * 量法:因為沒辦法直接量「內距」是不是被別的規則覆寫掉,改量**結果** —— 欄位裡第一段文字的左緣
 * 應該落在 `邊框 + --field-px`。只在「這段文字前面沒有別的東西」時才成立,所以下面三種一律跳過。
 *
 * **為什麼需要一支閘**(2026-09-18 user 抓到):只選「不限」時欄位不渲 Tag、渲純文字,
 * 按 :298 就該用標準 `--field-px`,但當時「要不要縮內距」與「要不要渲 Tag」是**兩個各自寫的
 * 判斷式**(readonly 路徑看 `hasTags`、可編輯路徑看 `value.length > 0`),新增「值非空但不渲 Tag」
 * 這第三種狀態時只改到渲染那一側 → 字從 13px 掉到 4px。眼睛看得出來,但沒有任何閘在守。
 *
 * **只量「欄位自己那段字」**,三種東西不算,各有自己的幾何、不歸這條規則管:
 *   (a) **Tag 裡的字** —— Tag 的幾何歸「四邊等距」那條公式管(`tag-field-vertical-inset.mjs` I4)。
 *       注意:四邊等距管的是 **Tag 這個盒子**,不是它裡面的字;lg 的 Tag 內文字因此落在 15px 而不是
 *       13px,那是公式的正常結果,**不是 bug**(2026-09-18 我一度誤判成「兩條規範打架」,查證後撤回)。
 *   (b) **頭像裡的縮寫字母**(`[data-avatar-size]`)—— 有自己的圓。
 *   (c) **前面還站著別的東西的字**(國碼 addon、起始圖示…)。判準是通則不是白名單:欄位裡只要有
 *       任何看得見、且不是這段文字祖先的元素左緣比它更左,就跳過。
 *
 * **不管表格 cell 裡的 naked 欄位**:`field-controls.spec.md:66`「`view×naked` = bare(host TD 給
 * padding)」—— 那種欄位 `!px-0 !py-0`、邊框透明,內距由 cell 自己給(實測 AgentPanel FAB 的表格:
 * 欄位內距 0、cell 內距 12)。判準是「它住在 `[role=cell]` / `<td>` 裡」這個語意邊界。
 * ⚠️ **不可以用「邊框透明」當判準**:readonly / disabled / view 三個模式的邊框本來就是透明的,
 * 但它們照樣吃 `--field-px`(2026-09-18 第一版這樣寫,250 支 story 只量到 2 個欄位 = 幾乎空綠)。
 *
 * 量的是像素(`--field-px` 丟量尺進去解析成真實 px —— `getPropertyValue` 回的是 token 原文
 * `0.75rem`,直接 parseFloat 會拿到 0.75,第一版就是這樣誤判了 21 個)。全 story 掃,不抽樣。
 * 對照組 `--selftest`:把每個受管欄位的左內距推 6px,這支必須紅。
 *
 * **沒量到 = 儀器失效(exit 1),不是通過**(2026-09-25,M37):每則 story 經 lib/launch-browser.mjs 的 openStory
 * (全部瀏覽器閘共用的唯一實作)開啟 —— 等 Storybook 回報這則渲染完成(含 play)、通過 render-health、字型載完、
 * 版面連續靜止 SETTLE_FRAMES 個影格,才量第一段文字左緣。取代原本的 domcontentloaded + 等根節點有子元素(等不到還 `.catch` 吞掉)+ 固定睡 110ms。
 * 原本任何一則載入失敗只記進「載入失敗 N 支」、照樣 exit 0;Storybook 錯誤頁也被當成「渲染好了」去量(量到 0 個欄位
 * = 沒有偏離)。現在逐則點名、附同源 404 帳本,兩種跑法都 exit 1(不用 exit 2:gate-selftest-meta 在 2026-09-25 修正前把 2 讀成「略過」)。
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { launchBrowser, openStory, StoryRenderInstrumentError, requireStorybookBuild } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const ONLY = arg('only', '')
const LIMIT = Number(arg('limit', '0'))
const LANES = Number(arg('lanes', '4'))
const TOLERANCE_PX = 1
const MIN_FIELDS = 40 // 反空綠地板:整輪至少要量到這麼多個受管欄位,否則等於沒跑
// 開 story 後要求版面連續靜止幾個影格才量(量的是幾何:要等排版、量寬後重畫與進場動畫跑完)
const SETTLE_FRAMES = 10
// 儀器失效累積到這麼多支就停掃:那時建置整體壞了(例如預覽腳本缺檔),每支都要等到逾時,掃完 1000 多支沒有意義
const MAX_INSTRUMENT_FAILURES = 25

requireStorybookBuild(join(BUILD, 'index.json'))
const index = JSON.parse(readFileSync(join(BUILD, 'index.json'), 'utf8'))
let stories = Object.values(index.entries || index.stories).filter((e) => e.type !== 'docs').map((e) => ({ id: e.id, name: e.name }))
if (ONLY) stories = stories.filter((s) => s.id.includes(ONLY))
if (LIMIT) stories = stories.slice(0, LIMIT)
if (stories.length === 0) { console.error('✗ 一支 story 都沒對到'); process.exit(2) }

const PROBE = () => {
  const out = []
  // `data-field-mode` **同時掛在外層 Field 容器與控件本身**;外層那顆帶 `data-field-orientation`,
  // 裡面第一個文字是 <label>(2026-09-18 第一版量到它,得出「量到 0px 應為 12px」的假陽性)。
  for (const el of document.querySelectorAll('[data-field-mode]:not([data-field-orientation])')) {
    if (el.getClientRects().length === 0) continue
    // 表格 cell 裡的 naked 欄位不在這條線上(見檔頭)
    if (el.closest('td,[role="cell"],[role="gridcell"]')) continue
    const cs = getComputedStyle(el)
    const bl = parseFloat(cs.borderLeftWidth || '0')
    // 第一個看得見的文字節點
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n, first = null
    while ((n = walker.nextNode())) {
      if (!(n.nodeValue || '').trim()) continue
      const pe = n.parentElement
      if (!pe || pe.getClientRects().length === 0) continue
      const pcs = getComputedStyle(pe)
      if (pcs.visibility === 'hidden' || pcs.opacity === '0') continue
      first = n; break
    }
    if (!first) continue
    // Tag 裡的字歸「四邊等距」公式管(那條管的是 Tag 盒子,不是盒裡的字);頭像縮寫有自己的圓
    if (first.parentElement.closest('[data-tag-root],[data-tag-text],[data-avatar-size]')) continue
    const range = document.createRange(); range.selectNodeContents(first)
    const tb = range.getBoundingClientRect()
    if (tb.width === 0 && tb.height === 0) continue
    // 前面還站著東西(國碼 addon / 起始圖示 / 頭像…)→ 這條線管的不是這段字
    let leading = false
    for (const kid of el.querySelectorAll('*')) {
      if (kid.contains(first)) continue                   // 這段字的祖先不算
      if (kid.getClientRects().length === 0) continue
      const kcs = getComputedStyle(kid)
      if (kcs.visibility === 'hidden' || kcs.opacity === '0') continue
      const kb = kid.getBoundingClientRect()
      if (kb.width === 0 || kb.height === 0) continue
      if (kb.left < tb.left - 0.5) { leading = true; break }
    }
    if (leading) continue
    // `--field-px` 要真的解析成像素,不能 parseFloat token 原文
    const ruler = document.createElement('div')
    ruler.style.cssText = 'position:absolute;visibility:hidden;height:0;width:var(--field-px)'
    el.appendChild(ruler)
    const fieldPx = parseFloat(getComputedStyle(ruler).width)
    ruler.remove()
    const fb = el.getBoundingClientRect()
    out.push({
      模式: el.getAttribute('data-field-mode') || '?',
      文字: (first.nodeValue || '').trim().slice(0, 14),
      量到: +(tb.left - fb.left).toFixed(2),
      應為: +(bl + fieldPx).toFixed(2),
      標籤: el.getAttribute('aria-label') || '',
    })
  }
  return out
}

// 對照組:把每個受管欄位的左內距推 6px
const SHIFT = () => {
  let n = 0
  for (const el of document.querySelectorAll('[data-field-mode]:not([data-field-orientation])')) {
    if (el.closest('td,[role="cell"],[role="gridcell"]')) continue
    const cs = getComputedStyle(el)
    el.style.paddingLeft = `${parseFloat(cs.paddingLeft || '0') + 6}px`
    n += 1
  }
  return n
}

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const bad = []
let scanned = 0, fieldsChecked = 0
/** 儀器失效:沒量到的 story(不是產品裁決)。 */
const instrumentFailures = []
let cursor = 0
const browsers = []
try {
  const lane = async () => {
    const browser = await launchBrowser(); browsers.push(browser)
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    for (;;) {
      if (SELFTEST && bad.length > 0) break
      if (instrumentFailures.length >= MAX_INSTRUMENT_FAILURES) break
      const idx = cursor++
      if (idx >= stories.length) break
      const s = stories[idx]; scanned += 1
      try {
        try {
          await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`, {
            settleFrames: SETTLE_FRAMES, notFound: server.notFound, navigationTimeoutMs: 30_000, timeoutMs: 30_000,
          })
        } catch (error) {
          if (!(error instanceof StoryRenderInstrumentError)) throw error
          instrumentFailures.push({ story: s.id, detail: error.detail })
          console.error(`  ! 儀器失效 ${s.id}(${error.kind})—— 詳情見結尾清單`)
          continue
        }
        // 對照組:注入內距後等 30ms 讓樣式生效(量測本身的 getBoundingClientRect 也會強制同步排版,這步只是保險)
        if (SELFTEST) { await page.evaluate(SHIFT); await page.waitForTimeout(30) }
        for (const r of await page.evaluate(PROBE)) {
          fieldsChecked += 1
          if (Math.abs(r.量到 - r.應為) > TOLERANCE_PX) bad.push({ story: s.id, name: s.name, ...r })
        }
      } catch (error) {
        // 量測途中丟例外 = 這則沒量完 → 儀器失效(原本只記一行「載入失敗」、照樣 exit 0)
        instrumentFailures.push({ story: s.id, detail: `量測途中丟例外:${String(error?.message || error).split('\n')[0]}` })
        console.error(`  ! ${s.id}: 量測途中丟例外:${String(error?.message || error).split('\n')[0]}`)
      }
      if (scanned % 250 === 0) console.error(`… ${scanned}/${stories.length} 支掃完`)
      if (SELFTEST && bad.length > 0) { console.error(`… 對照組在第 ${scanned} 支就抓到了,提早收工`); break }
    }
    await page.close(); await browser.close()
  }
  await Promise.all(Array.from({ length: Math.max(1, LANES) }, () => lane()))
} finally {
  for (const b of browsers) await b.close().catch(() => null)
  await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 3_000).unref?.())]).catch(() => null)
}

console.log(`\n掃描 ${scanned} 支 story(不抽樣),儀器失效(沒量到)${instrumentFailures.length} 支`)
console.log(`量到受管欄位(非表格 cell、字不在 Tag 裡):${fieldsChecked} 個`)
console.log(`偏離那條線:${bad.length} 個`)
const shown = new Set()
for (const b of bad) {
  const k = `${b.story}|${b.模式}|${b.量到}`
  if (shown.has(k)) continue
  shown.add(k)
  console.log(`  ✗ ${b.story}(${b.模式}${b.標籤 ? ' / ' + b.標籤 : ''})「${b.文字}」量到 ${b.量到}px,應為 ${b.應為}px`)
}

// 儀器失效優先於任何裁決(兩種跑法都一樣):沒量到的 story 不得被讀成「內距都對」,也不得被讀成「對照組抓到了」
if (instrumentFailures.length) {
  console.error(`\n✗ 儀器失效:${instrumentFailures.length} 支 story 沒量到 —— 這不是產品裁決(元件不一定有問題),但這一趟不能算通過:`)
  for (const f of instrumentFailures) console.error(`  - ${f.story}:${f.detail}`)
  if (instrumentFailures.length >= MAX_INSTRUMENT_FAILURES) console.error(`  已達 ${MAX_INSTRUMENT_FAILURES} 支,停止掃描(還有 ${stories.length - scanned} 支沒掃)—— 建置很可能整體壞了`)
  const missing = [...new Set(server.notFound)]
  if (missing.length) console.error(`  同源 404 帳本:${missing.join(', ')}`)
  process.exit(1)
}
if (SELFTEST) {
  if (bad.length > 0) { console.log('\n✓ selftest:對照組(把左內距推 6px)讓這支紅了,量具會紅'); process.exit(0) }
  console.log('\n✗ selftest:對照組沒被抓到 —— 這支是假綠,不能當證據')
  process.exit(1)
}
if (!ONLY && !LIMIT && fieldsChecked < MIN_FIELDS) {
  console.log(`\n✗ 整輪只量到 ${fieldsChecked} 個受管欄位(下限 ${MIN_FIELDS})—— 這支等於沒跑,不能當綠燈`)
  process.exit(1)
}
if (bad.length > 0) process.exit(1)
console.log('\n✓ 每個欄位的水平內距都是標準 --field-px(量的是沒有 Tag / 頭像 / 前置元素時的第一段文字)')
process.exit(0)
