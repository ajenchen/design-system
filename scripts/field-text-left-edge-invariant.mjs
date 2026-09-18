#!/usr/bin/env node
/**
 * 不變式:**欄位裡的文字,左緣恆等於「邊框 + `--field-px`」**。
 *
 * owner:`packages/design-system/src/components/Field/field-controls.spec.md`(Field 家族水平內距)
 * + `Field/field-wrapper.tsx` 的 `--field-px`。這是整個 Field 家族共同的那條直線:
 * Select 的已填值、Input 的字、佔位字、唯讀的值、SelectMenu 的「不限」——全部站在同一條線上。
 *
 * **為什麼需要一支閘**(2026-09-18 user 抓到):Combobox 多選為了讓 Tag 四邊等距,把欄位左內距
 * 縮成 `fieldTagInsetX`(`(欄高 − 2px − Tag高) / 2`)。那個縮小**唯一的理由**是「Tag 自己的內距
 * 會把字推回這條線」。所以一旦欄位裡放的不是 Tag 而是純文字,就必須把內距還原成 `--field-px`,
 * 否則字會少一截。當時 Combobox 的「要不要縮內距」與「要不要渲 Tag」是**兩個各自寫的判斷式**
 *(readonly 路徑看 `hasTags`、可編輯路徑看 `value.length > 0`),新增「值非空但不渲 Tag」這第三種
 * 狀態時只改到渲染那一側,只選「不限」的欄位字就從 13px 掉到 4px。眼睛看得出來,但沒有任何閘在守。
 *
 * **只管「欄位自己那行字」**:三種東西不算,因為它們各有自己的幾何,不在這條線上 ——
 *   (a) Tag 裡的字(見下)、(b) 頭像裡的縮寫字母(`[data-avatar-size]`)、
 *   (c) 前面還有別的東西的字(國碼 addon、起始圖示…)。(c) 的判準是通則不是白名單:
 *       欄位裡只要有任何**看得見、且不是這段文字祖先**的元素左緣比它更左,就代表這段字前面
 *       還站著東西,這條線管的不是它。
 *
 * **不管 Tag**:Tag 在欄位裡的幾何由 `tag.spec.md`「圓角與間距」段管(四邊等距,lg 刻意是 5),
 * 已有 `scripts/tag-field-vertical-inset.mjs` I4 在守。兩條規範在 lg 目前互相衝突(四邊等距 →
 * Tag 內文字落在 15px,而這條線是 13px),那是**產品決策**不是 bug,所以這支閘明確只量
 * **不在 Tag 裡的文字**,不去碰那個未決的衝突。
 *
 * **不管表格 cell 裡的 naked 欄位**:那種欄位刻意把內距歸零、外框拿掉,靠 cell 自己的內距對齊,
 * 不在這條線上。判準是「它住在 `[role=cell]` / `<td>` 裡」這個語意邊界。
 * ⚠️ **不可以用「邊框透明」當判準**:readonly / disabled / view 三個模式的邊框本來就是透明的,
 * 但它們照樣吃 `--field-px`(2026-09-18 第一版這樣寫,250 支 story 只量到 2 個欄位 = 幾乎空綠)。
 *
 * 量的是像素(`--field-px` 丟量尺進去解析成真實 px —— `getPropertyValue` 回的是 token 原文
 * `0.75rem`,直接 parseFloat 會拿到 0.75,第一版就是這樣誤判了 21 個)。全 story 掃,不抽樣。
 * 對照組 `--selftest`:把每個受管欄位的左內距推 6px,這支必須紅。
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { launchBrowser } from './lib/launch-browser.mjs'
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

if (!existsSync(join(BUILD, 'index.json'))) {
  console.error(`✗ 找不到 ${join(BUILD, 'index.json')} —— 先跑 npm run build-storybook`)
  process.exit(2)
}
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
    // Tag 裡的字歸 tag.spec.md「圓角與間距」管(四邊等距);頭像裡的縮寫字母有自己的圓
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
let scanned = 0, fieldsChecked = 0, loadErrors = 0
let cursor = 0
const browsers = []
try {
  const lane = async () => {
    const browser = await launchBrowser(); browsers.push(browser)
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.on('pageerror', () => {})
    for (;;) {
      if (SELFTEST && bad.length > 0) break
      const idx = cursor++
      if (idx >= stories.length) break
      const s = stories[idx]; scanned += 1
      try {
        await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.waitForFunction(() => document.querySelector('#storybook-root')?.children.length > 0 || document.querySelector('.sb-show-errordisplay'), null, { timeout: 15_000 }).catch(() => {})
        await page.waitForTimeout(110)
        if (SELFTEST) { await page.evaluate(SHIFT); await page.waitForTimeout(30) }
        for (const r of await page.evaluate(PROBE)) {
          fieldsChecked += 1
          if (Math.abs(r.量到 - r.應為) > TOLERANCE_PX) bad.push({ story: s.id, name: s.name, ...r })
        }
      } catch (error) {
        loadErrors += 1
        console.error(`  ! ${s.id}: ${String(error.message).split('\n')[0]}`)
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

console.log(`\n掃描 ${scanned} 支 story(不抽樣),載入失敗 ${loadErrors} 支`)
console.log(`量到受管欄位(非表格 cell、字不在 Tag 裡):${fieldsChecked} 個`)
console.log(`偏離那條線:${bad.length} 個`)
const shown = new Set()
for (const b of bad) {
  const k = `${b.story}|${b.模式}|${b.量到}`
  if (shown.has(k)) continue
  shown.add(k)
  console.log(`  ✗ ${b.story}(${b.模式}${b.標籤 ? ' / ' + b.標籤 : ''})「${b.文字}」量到 ${b.量到}px,應為 ${b.應為}px`)
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
console.log('\n✓ 欄位裡不在 Tag 裡的文字,左緣都站在「邊框 + --field-px」那條線上')
process.exit(0)
