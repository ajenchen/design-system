#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 建置好的 Storybook 裡,每一則 story 的每一個有圓角的元素,圓角都照 radius.spec.md「四檔」表的用途選 ——
 *         規則只讀那張表的「值 / 機器判定」兩欄(scripts/lib/token-allow-sets.mjs parseRadiusScale),判定只住
 *         scripts/lib/radius-usage.mjs judgeRadius。量的是計算後的像素(getComputedStyle + getBoundingClientRect),
 *         不是 class 名字 —— 照 Tailwind 習慣寫 rounded-sm 想拿 4px、實際拿到 2px,這裡量得到。
 *         user 2026-11-15:「本來在該使用什麼圓角的時候不就要動腦想看到底怎樣用才符合ds規範嗎？」
 *   紅: R0 量到的值不在表上(6px、50%、橢圓雙值);R1 2px 那一檔用在短邊 > 10px 的元素;R2 浮層外殼(帶 --elevation-200 陰影)
 *       不是 8px、含 role=tooltip 的外殼不是 4px;R3 8px 用在不是浮層外殼、也不是四角跟外殼重合的裁切層的元素。
 *       例外只認 scripts/radius-usage-exceptions.json 逐筆登記(exceptions = 有理由的例外;pending = 畫面會變、等 user 看過的現況違規,
 *       只准變少);登記了卻沒對到任何元素(過期)也紅(--limit 跑法不判過期)。→ 指名 story / 元素 / 規則,exit 1。
 *   綠: 全部 story 量完,沒有未登記的違規、沒有過期登記。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): 讀不懂規格表 / 例外檔、建置不存在或比原始碼舊、任一則 story 開不起來、
 *       量不到浮層陰影的參考值、一則都沒量到 —— 不讀成通過。
 *   `--selftest`: ① judgeRadius 判定表(每條規則該紅 / 該綠各至少一格,含 Tooltip 例外、裁切層、rounded-[inherit]、外殼不圓);
 *       ② 真建置三種破法各自指名紅、注入前同一則不紅:Button 展示頁把按鈕改 8px → R3;Popover 開著的那一則把外殼改 4px → R2;
 *       塞一個 40×40 的 2px 方塊 → R1。
 *
 * 用法:node scripts/radius-usage-invariant.mjs [--build=storybook-static] [--concurrency=4] [--limit=N] [--dump=<json>] [--selftest]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, requireFreshStorybookBuild, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { readServedStorybookIndex, startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { AllowSetError, parseRadiusScale } from './lib/token-allow-sets.mjs'
import { RULE_TEXT, entryMatch, judgeRadius } from './lib/radius-usage.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SPEC = 'packages/design-system/src/tokens/radius/radius.spec.md'
const EXCEPTIONS = 'scripts/radius-usage-exceptions.json'
const SELFTEST = process.argv.includes('--selftest')
const LIMIT = Number(arg('limit', '0'))
const CONCURRENCY = Math.max(1, Number(arg('concurrency', '4')) || 4)
const DUMP = arg('dump', null)
const VIEWPORT = { width: 1280, height: 900 }
// 圓角不隨密度 / 主題變(radius.css 沒有任何 data-density / data-theme 選擇器)→ 只量一般密度、亮色
const GLOBALS = 'theme:light;density:md'
// 判定讀的是計算後的 border-radius 值(動畫不改它);進場縮放只會讓 R1 量到較小的短邊 → 少報,不會誤紅。
// 所以只等 3 個靜止影格(a11y 掃描要等 10,因為它量顏色對比會被淡入動畫影響);1084 則 story 的總時間在 CI 有上限
const RADIUS_USAGE_SETTLE_FRAMES = 3
const MAX_INSTRUMENT_FAILURES = 25

class InstrumentError extends Error {}
const fail = (msg) => { console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${msg}`); process.exit(2) }

// ── 頁面裡的量具 ─────────────────────────────────────────────────────────────────────────────
// 回 { refs, rows }:refs = 量到的浮層陰影參考值(兩種主題 × 200 / 200-hover);rows = 每一個看得見、有圓角或是浮層外殼的元素。
// 跳過 Storybook 自己的外框(祖先有 sb-* class 或 #storybook-docs);偽元素不量(見 notDone:radius-usage 只量元素本身)。
export const PROBE = () => {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none'
  for (const theme of ['light', 'dark']) {
    const t = document.createElement('div')
    t.setAttribute('data-theme', theme)
    for (const n of ['200', '200-hover']) { const p = document.createElement('div'); p.style.boxShadow = `var(--elevation-${n})`; t.appendChild(p) }
    host.appendChild(t)
  }
  document.body.appendChild(host)
  const refs = [...host.querySelectorAll('div > div > div')].map((p) => getComputedStyle(p).boxShadow).filter((v) => v && v !== 'none')
  host.remove()
  const chrome = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      if (p.id === 'storybook-docs') return true
      for (const c of p.classList) if (c.startsWith('sb-')) return true
    }
    return false
  }
  const surfaces = new Map()
  const rows = []
  const all = [...document.body.querySelectorAll('*')]
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  for (const el of all) {
    if (chrome(el)) continue
    const cs = getComputedStyle(el)
    if (cs.boxShadow && cs.boxShadow !== 'none' && refs.some((r) => cs.boxShadow.includes(r))) {
      const r = rectOf(el)
      if (r.w > 0 && r.h > 0 && el.checkVisibility({ visibilityProperty: true })) surfaces.set(el, { r, corners: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius] })
    }
  }
  const near = (a, b) => Math.abs(a - b) <= 1
  for (const el of all) {
    if (chrome(el)) continue
    const cs = getComputedStyle(el)
    const corners = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]
    const isSurface = surfaces.has(el)
    if (!isSurface && corners.every((c) => c === '0px')) continue
    const r = rectOf(el)
    if (!(r.w > 0 && r.h > 0) || !el.checkVisibility({ visibilityProperty: true })) continue
    let host = null
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (surfaces.has(p)) { host = p; break }
    let clip = false
    if (!isSurface && host) {
      const s = surfaces.get(host)
      const at = [[r.x, r.y, s.r.x, s.r.y], [r.x + r.w, r.y, s.r.x + s.r.w, s.r.y], [r.x + r.w, r.y + r.h, s.r.x + s.r.w, s.r.y + s.r.h], [r.x, r.y + r.h, s.r.x, s.r.y + s.r.h]]
      clip = corners.every((c, i) => c === '0px' || (c === s.corners[i] && near(at[i][0], at[i][2]) && near(at[i][1], at[i][3])))
    }
    const cls = typeof el.className === 'string' ? el.className : (el.getAttribute('class') ?? '')
    rows.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      cls: cls.replace(/\s+/g, ' ').trim(),
      corners,
      w: Math.round(r.w * 10) / 10,
      h: Math.round(r.h * 10) / 10,
      surface: isSurface,
      tooltip: isSurface && (el.getAttribute('role') === 'tooltip' || !!el.querySelector('[role="tooltip"]')),
      clip,
      inherit: /(^|\s)rounded-\[inherit\](\s|$)/.test(cls),
    })
  }
  return { refs, rows }
}

// ── 讀規則 / 例外 ────────────────────────────────────────────────────────────────────────────
export function readScale() {
  try { return parseRadiusScale(readFileSync(join(ROOT, SPEC), 'utf8')) } catch (e) { throw new InstrumentError(e instanceof AllowSetError ? e.message : `讀不到 ${SPEC}:${e.message}`) }
}
export function readExceptions(text = readFileSync(join(ROOT, EXCEPTIONS), 'utf8')) {
  let j
  try { j = JSON.parse(text) } catch (e) { throw new InstrumentError(`${EXCEPTIONS} 不是 JSON:${e.message}`) }
  const out = []
  for (const kind of ['exceptions', 'pending']) {
    if (!Array.isArray(j?.[kind])) throw new InstrumentError(`${EXCEPTIONS} 缺 ${kind} 陣列`)
    j[kind].forEach((e, i) => {
      const where = `${EXCEPTIONS} ${kind}[${i}]`
      if (!Array.isArray(e?.stories) || !e.stories.length || e.stories.some((s) => typeof s !== 'string' || !s)) throw new InstrumentError(`${where} 缺 stories(story id 陣列,結尾 * = 開頭相同)`)
      if (!['R0', 'R1', 'R2', 'R3'].includes(e.rule)) throw new InstrumentError(`${where} rule 要寫 R0–R3`)
      if (!Array.isArray(e.classIncludes) || !e.classIncludes.length) throw new InstrumentError(`${where} classIncludes 要寫至少一個 class(指名是哪一個元素)`)
      if (typeof e.reason !== 'string' || !e.reason.trim()) throw new InstrumentError(`${where} 缺理由`)
      if (kind === 'pending' && (typeof e.visualChange !== 'string' || !e.visualChange.trim())) throw new InstrumentError(`${where} 缺 visualChange(照規格修了畫面會怎麼變)`)
      out.push({ ...e, kind, index: i, used: new Set() })
    })
  }
  return out
}

// ── 掃描 ─────────────────────────────────────────────────────────────────────────────────────
export async function scan(server, ids) {
  const results = {}
  const failures = []
  let next = 0
  // 沙箱下 Chromium 是 --single-process(lib/launch-browser.mjs SANDBOX_ARGS):關掉最後一個分頁會連瀏覽器一起收掉,
  // 所以出錯時整個瀏覽器重開,不只換分頁
  const worker = async () => {
    let browser = await launchBrowser()
    let page = await browser.newPage({ viewport: VIEWPORT })
    try {
      while (next < ids.length && failures.length < MAX_INSTRUMENT_FAILURES) {
        const id = ids[next++]
        try {
          const url = `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=${encodeURIComponent(GLOBALS)}`
          await openStory(page, url, { label: id, settleFrames: RADIUS_USAGE_SETTLE_FRAMES, notFound: server.notFound })
          results[id] = await page.evaluate(PROBE)
          if (!results[id].refs.length) failures.push(`${id}:量不到 --elevation-200 的參考陰影(token 不見了?)`)
        } catch (e) {
          failures.push(`${id}:${String(e?.message ?? e).split('\n')[0].slice(0, 240)}`)
          try { await browser.close() } catch {}
          browser = await launchBrowser()
          page = await browser.newPage({ viewport: VIEWPORT })
        }
      }
    } finally { try { await browser.close() } catch {} }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker))
  return { results, failures }
}

export function evaluate(results, scale, entries) {
  const violations = []
  let elements = 0
  for (const [story, { rows }] of Object.entries(results)) {
    for (const el of rows) {
      elements++
      const v = judgeRadius(el, scale)
      if (!v) continue
      // 多筆都對得上(一筆的 class 是另一筆的子集)→ 取指名最細的那一筆(classIncludes 最多),通用的那筆才不會把細的吃掉、讓細的看起來過期
      let best = null
      for (const e of entries) {
        const s = entryMatch(e, story, { ...el, violation: v })
        if (s && (!best || e.classIncludes.length > best.e.classIncludes.length)) best = { e, s }
      }
      if (best) { best.e.used.add(best.s); continue }
      violations.push({ story, ...el, violation: v })
    }
  }
  return { violations, elements }
}

function describe(el) {
  return `<${el.tag}${el.role ? ` role=${el.role}` : ''}> ${el.w}×${el.h} 「${el.cls.slice(0, 120)}」`
}

function printViolations(violations) {
  const groups = new Map()
  for (const v of violations) {
    const key = `${v.violation.rule}|${v.tag}|${v.cls}`
    const g = groups.get(key) ?? { v, stories: new Set(), n: 0 }
    g.stories.add(v.story); g.n++
    groups.set(key, g)
  }
  for (const { v, stories, n } of groups.values()) {
    console.log(`   - ${v.violation.rule} ${RULE_TEXT[v.violation.rule]}:量到 ${v.violation.got},應為 ${v.violation.expected}`)
    console.log(`       ${describe(v)} × ${n}(${stories.size} 則:${[...stories].slice(0, 4).join('、')}${stories.size > 4 ? ' …' : ''})`)
  }
  return groups.size
}

// ── 對照組 ───────────────────────────────────────────────────────────────────────────────────
function decisionTable(scale) {
  const base = { corners: ['4px', '4px', '4px', '4px'], w: 80, h: 32, surface: false, tooltip: false, clip: false, inherit: false }
  const c = (v) => [v, v, v, v]
  const T = [
    ['一般按鈕 4px', base, null],
    ['按鈕 8px(不是浮層)', { ...base, corners: c('8px') }, 'R3'],
    ['浮層外殼 8px', { ...base, corners: c('8px'), w: 300, h: 200, surface: true }, null],
    ['浮層外殼 4px', { ...base, corners: c('4px'), w: 300, h: 200, surface: true }, 'R2'],
    ['Tooltip 外殼 4px', { ...base, corners: c('4px'), surface: true, tooltip: true }, null],
    ['Tooltip 外殼 8px', { ...base, corners: c('8px'), surface: true, tooltip: true }, 'R2'],
    ['外殼的裁切層 8px(四角重合)', { ...base, corners: c('8px'), clip: true }, null],
    ['外殼的標題列只圓上兩角(重合)', { ...base, corners: ['8px', '8px', '0px', '0px'], clip: true }, null],
    ['外殼裡的卡片 8px(沒重合)', { ...base, corners: c('8px') }, 'R3'],
    ['8×8 色塊 2px', { ...base, corners: c('2px'), w: 8, h: 8 }, null],
    ['10×10 色塊 2px(門檻上)', { ...base, corners: c('2px'), w: 10, h: 10 }, null],
    ['4×30 細線 2px(看短邊)', { ...base, corners: c('2px'), w: 4, h: 30 }, null],
    ['40×40 方塊 2px', { ...base, corners: c('2px'), w: 40, h: 40 }, 'R1'],
    ['17px 高的反白 2px', { ...base, corners: c('2px'), w: 30, h: 17 }, 'R1'],
    ['膠囊 9999px', { ...base, corners: c('9999px') }, null],
    ['浮起來的圓形按鈕 9999px(帶浮層陰影,「不限」)', { ...base, corners: c('9999px'), w: 40, h: 40, surface: true }, null],
    ['6px(不在刻度)', { ...base, corners: c('6px') }, 'R0'],
    ['50%(不在刻度)', { ...base, corners: c('50%'), w: 16, h: 16 }, 'R0'],
    ['橢圓雙值', { ...base, corners: c('4px 6px') }, 'R0'],
    ['rounded-[inherit] 不判', { ...base, corners: c('8px'), inherit: true }, null],
    ['外殼不圓(貼邊抽屜)不判', { ...base, corners: c('0px'), w: 400, h: 900, surface: true }, null],
    ['沒有圓角的一般元素', { ...base, corners: c('0px') }, null],
  ]
  const bad = []
  for (const [what, el, want] of T) {
    const got = judgeRadius(el, scale)?.rule ?? null
    if (got !== want) bad.push(`判定表「${what}」應為 ${want ?? '綠'},實得 ${got ?? '綠'}`)
  }
  return { bad, n: T.length }
}

async function realBuildControls(server, scale, entries) {
  const bad = []
  const cases = [
    { what: 'Button 展示頁把按鈕改 8px', id: 'design-system-components-button-展示--default', css: 'button { border-radius: 8px !important; }', rule: 'R3', tag: 'button' },
    { what: 'Popover 開著的那一則把外殼改 4px', id: 'design-system-components-popover-展示--open-snapshot', css: '[data-radix-popper-content-wrapper] > * { border-radius: 4px !important; }', rule: 'R2' },
    { what: '塞一個 40×40 的 2px 方塊', id: 'design-system-components-button-展示--default', inject: true, rule: 'R1', tag: 'div' },
  ]
  // 每一格自己開一個瀏覽器(single-process 下關分頁會收掉整個瀏覽器;見 scan)
  for (const c of cases) {
    const browser = await launchBrowser()
    try {
      const page = await browser.newPage({ viewport: VIEWPORT })
      {
        const url = `${server.origin}/iframe.html?id=${encodeURIComponent(c.id)}&viewMode=story&globals=${encodeURIComponent(GLOBALS)}`
        await openStory(page, url, { label: c.id, settleFrames: RADIUS_USAGE_SETTLE_FRAMES, notFound: server.notFound })
        const before = evaluate({ [c.id]: await page.evaluate(PROBE) }, scale, entries.map((e) => ({ ...e, used: new Set() }))).violations.filter((v) => v.violation.rule === c.rule)
        if (before.length) { bad.push(`[${c.what}] 注入前就有 ${c.rule}(${before.length} 個)—— 對照組不乾淨`); continue }
        if (c.css) await page.addStyleTag({ content: c.css })
        if (c.inject) await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'width:40px;height:40px;border-radius:2px;background:#888'; document.querySelector('#storybook-root').appendChild(d) })
        const after = evaluate({ [c.id]: await page.evaluate(PROBE) }, scale, entries.map((e) => ({ ...e, used: new Set() }))).violations.filter((v) => v.violation.rule === c.rule && (!c.tag || v.tag === c.tag))
        if (!after.length) bad.push(`[${c.what}] 應該 ${c.rule} 紅,實得 0 個`)
        else console.log(`  ✓ ${c.what} → ${c.rule} 紅 ${after.length} 個(注入前 0 個;例:${describe(after[0])})`)
      }
    } finally { try { await browser.close() } catch {} }
  }
  return bad
}

// ── 主程式 ───────────────────────────────────────────────────────────────────────────────────
async function main() {
  let scale, entries
  try { scale = readScale(); entries = readExceptions() } catch (e) { fail(e.message) }
  requireFreshStorybookBuild(BUILD, ['packages/design-system/src'])
  if (!existsSync(join(BUILD, 'index.json'))) fail(`找不到 ${BUILD}/index.json`)
  const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
  try {
    if (SELFTEST) {
      const { bad, n } = decisionTable(scale)
      if (!bad.length) console.log(`  ✓ 判定表 ${n} 格全部符合`)
      bad.push(...(await realBuildControls(server, scale, entries)))
      if (bad.length) { console.log('✗ radius-usage selftest'); for (const b of bad) console.log(`   - ${b}`); process.exitCode = 1; return }
      console.log('✓ radius-usage selftest:判定表全符合;真建置三種破法(按鈕 8px / 浮層 4px / 大方塊 2px)各自指名紅,注入前同一則不紅')
      return
    }
    const index = readServedStorybookIndex(server)
    let ids = Object.values(index.entries || index.stories).filter((e) => e.type !== 'docs').map((e) => e.id)
    if (LIMIT) ids = ids.slice(0, LIMIT)
    const t0 = Date.now()
    const { results, failures } = await scan(server, ids)
    if (DUMP) writeFileSync(resolve(DUMP), JSON.stringify(results))
    if (failures.length) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${failures.length} 則沒量到(不是產品裁決,也不算通過):`); for (const f of failures.slice(0, 20)) console.log(`   - ${f}`); process.exitCode = 2; return }
    if (!Object.keys(results).length) fail('一則都沒量到')
    const { violations, elements } = evaluate(results, scale, entries)
    console.log(`量了 ${Object.keys(results).length} 則 story、${elements} 個有圓角或是浮層外殼的元素(${Math.round((Date.now() - t0) / 1000)} 秒);規則讀自 ${SPEC}「四檔」`)
    let red = 0
    if (violations.length) {
      console.log(`✗ 未登記的違規 ${violations.length} 個:`)
      red += printViolations(violations)
    }
    const pending = entries.filter((e) => e.kind === 'pending')
    if (pending.length) console.log(`(待 user 看過的現況違規 ${pending.length} 組、${pending.reduce((n, e) => n + e.stories.length, 0)} 則 story,畫面會變所以沒改;清單 ${EXCEPTIONS} pending)`)
    if (!LIMIT) {
      for (const e of entries) {
        const stale = e.stories.filter((s) => !e.used.has(s))
        if (!stale.length) continue
        console.log(`✗ 過期登記 ${EXCEPTIONS} ${e.kind}[${e.index}](${e.rule} <${e.tag ?? '*'}> ${e.classIncludes.join(' ').slice(0, 80)})這幾則沒有對到任何元素:${stale.join('、')} —— 修好了就從 stories 拿掉`)
        red++
      }
    }
    if (red) { process.exitCode = 1; return }
    console.log('✓ 圓角照用途:沒有未登記的違規、沒有過期登記')
  } catch (e) {
    if (e instanceof InstrumentError) fail(e.message)
    throw e
  } finally { await server.stop() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
