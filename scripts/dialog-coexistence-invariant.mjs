#!/usr/bin/env node
/**
 * Dialog 契約閘(2026-09-08 並存 + 2026-09-09 進場第一幀 / docs 隔離)
 *
 * ── A/B/G 並存契約(2026-09-08)──
 * agent 原則 v14 條 A/B 要求「有 URL 的內容與 agent 並列可操作」。Radix 只給兩個極端:
 * modal 分支寫死 `hideOthers(content)`(只保留 content,無白名單),
 * `modal={false}` 則三件全關。DS 加的是中間那個狀態:`persistentElements`。
 *
 * **兩條路都驗,缺一不可**:
 *   (A) 預設路徑(沒傳 persistentElements)—— 行為必須跟過去完全一樣:背景被抑制。
 *   (B) 並存路徑 —— 指定的區域仍可聚焦、可打字;其餘仍被抑制。
 * 只驗 (B) 的話,「把預設路徑一起弄壞」不會被發現 —— 那正是 user 說的「不要改壞既有東西」。
 *
 * 判準用「真的能不能聚焦」而不是「有沒有 aria-hidden 屬性」:
 * `suppressOthers` 在支援 inert 的瀏覽器用原生 inert、不支援才用 aria-hidden,
 * 驗屬性會綁死實作;驗行為才是驗契約(M32)。
 *
 * ── M 進場第一幀(2026-09-09,user 抓到「dialog 從左上角飛到中間」)──
 * 根因:shadcn v3 的 `slide-in-from-left-1/2 slide-in-from-top-[48%]` 是在 keyframe 的 transform 裡重寫置中位移;
 * Tailwind v4 的 `-translate-x-1/2` 改走獨立的 `translate` 屬性,不再被 keyframe 蓋掉,兩者相加 = 第一幀中心在
 * 視窗中心左 w/2、上 0.48h。canonical(dialog.spec.md「動畫」)= 從中心淡入 + 輕微縮放,不位移。
 *   (S) 靜態:DS-wide 任何檔案不得同時出現「置中 translate」與「置中 slide class」。
 *   (M) 瀏覽器:把進場動畫凍在 t=0(animation-play-state:paused + WAAPI seek),`[role=dialog]` 中心相對視窗中心 ≤ 1px;
 *       t=0 必須真的在動畫裡(scale < 1 或 opacity < 1),否則等於沒量到第一幀。
 *   對照組:把那兩組 slide class 的宣告逐字加回去(= tw-animate-css 產生的 CSS),必須量到偏移 —— 儀器會紅才算儀器。
 *
 * ── D docs 隔離(2026-09-09,user:「你有發現嗎」docs 頁 N 個 dialog 疊在一起)──
 *   (D-static) 全部 *.stories.tsx:模態浮層(Dialog/Sheet/FileViewer/CommandDialog/AlertDialog)預設開著的 story,
 *       非 test-only 就必須帶 `openOverlayDocsStory(` 或 `inline: false`(story-rules.md「預設開啟的模態浮層 story」)。
 *   (D-browser) Dialog docs 頁頂層文件 `[role=dialog]` 可見數 = 0,且至少有一個 story iframe(隔離真的生效);
 *       canvas 的 OpenSnapshot 仍開著(隔離沒把快照弄關)。修前實測:4 個可見 dialog、7 個 fixed 開啟節點、0 iframe。
 *
 * 用法:node scripts/dialog-coexistence-invariant.mjs [--static <storybook-static dir>] [--selftest]
 *   --selftest 只跑對照組(靜態 fixture 必紅 + 瀏覽器注入 slide 必紅),不跑正式斷言。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs'
import { join, extname, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const argValue = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined }
const STATIC = argValue('--static') ?? join(process.cwd(), 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')

const out = []; let fail = 0
const ck = (t, p, d = '') => { out.push(`${p ? '✓' : '✗'} ${t}${d ? ' | ' + d : ''}`); if (!p) fail++ }

// ═══════════════════════════════════════════════════════════════════════════
// 靜態段(不需瀏覽器)
// ═══════════════════════════════════════════════════════════════════════════
function walk(dir, pred, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n === 'storybook-static') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, pred, acc)
    else if (pred(n)) acc.push(p)
  }
  return acc
}

// (S) 置中 translate 與置中 slide class 同檔同用 → 紅。
// 置中 slide = slide-(in-from|out-to)-(left|right|top|bottom) 後接 1/2 或任意 [N%](shadcn v3 的 1/2 + [48%] 組合)。
// 一般方向性 8px(slide-in-from-top-2)是輕量浮層 canonical,不在此列。
const CENTER_TRANSLATE = /(?:^|[\s"'`])-translate-[xy]-1\/2\b|translate-[xy]-\[-50%\]/
const CENTER_SLIDE = /slide-(?:in-from|out-to)-(?:left|right|top|bottom)-(?:1\/2|\[\d+(?:\.\d+)?%\])/
// 只看 code,不看註解:記錄這個陷阱的註解(dialog.tsx 檔內就有一段)不該把閘弄紅。
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}
export function centerSlideConflict(src) {
  const code = stripComments(src)
  return CENTER_TRANSLATE.test(code) && CENTER_SLIDE.test(code)
}
function staticMotionScan() {
  const roots = ['packages/design-system/src', 'apps', 'src'].map((r) => join(REPO, r)).filter(existsSync)
  const files = roots.flatMap((r) => walk(r, (n) => /\.(tsx?|css)$/.test(n)))
  const bad = files.filter((f) => centerSlideConflict(readFileSync(f, 'utf8'))).map((f) => relative(REPO, f))
  ck(`S 靜態:置中 translate 與置中 slide class 不得同檔同用(掃 ${files.length} 檔)`, bad.length === 0, bad.join(', '))
}

// (D-static) 模態浮層預設開啟的 story 必帶 docs 隔離參數。
// AgentPanelHeader 的 `defaultHistoryOpen`(歷史浮層快照)也算:非模態、但 portal 到 body,2026-09-10 實測 docs 殭屍會把它帶到別的 story 左上角
const MODAL_TAG = /<(Dialog|Sheet|FileViewer|CommandDialog|AlertDialog|AgentPanelHeader)\b/
const MODAL_OPEN_PROP = /<(?:Dialog|Sheet|FileViewer|CommandDialog|AlertDialog)\b[^>]*?\b(?:defaultOpen(?![=\w])|defaultOpen=\{true\}|open=\{true\})|<AgentPanelHeader\b[^>]*?\b(?:defaultHistoryOpen(?![=\w])|defaultHistoryOpen=\{true\})/s
export function storyBlocks(src) {
  // 以 `export const X` 切塊;每塊到下一個 export const 或檔尾
  const idx = [...src.matchAll(/^export const (\w+)/gm)].map((m) => ({ name: m[1], at: m.index }))
  return idx.map((e, i) => ({ name: e.name, body: src.slice(e.at, idx[i + 1]?.at ?? src.length) }))
}
export function docsIsolationViolations(src) {
  const bad = []
  for (const b of storyBlocks(src)) {
    if (!MODAL_TAG.test(b.body)) continue
    // useState(true) 只認「餵給 open 的那個 state」:`const [open, setOpen] = useState(true)` + `<Modal open={open}`;
    // 同一 story 裡別的 useState(true)(如 showFilmstrip)不算(FileViewer anatomy Inspector 曾誤報)。
    const openStateTrue = /\[\s*open\s*,[^\]]*\]\s*=\s*(?:React\.)?useState(?:<[^>]*>)?\(\s*true\s*\)/.test(b.body)
    const opensByDefault = MODAL_OPEN_PROP.test(b.body)
      || (openStateTrue && /<(?:Dialog|Sheet|FileViewer|CommandDialog|AlertDialog)\b[^>]*?\bopen=\{open\}/s.test(b.body))
    if (!opensByDefault) continue
    const testOnly = /tags:\s*\[[^\]]*'test-only'/.test(b.body)
    const isolated = /openOverlay(?:DocsStory|Parameters)\(/.test(b.body) || /inline:\s*false/.test(b.body)
    if (!testOnly && !isolated) bad.push(b.name)
  }
  return bad
}
function staticDocsScan() {
  const files = walk(join(REPO, 'packages/design-system/src'), (n) => n.endsWith('.stories.tsx'))
  const bad = []
  for (const f of files) {
    const v = docsIsolationViolations(readFileSync(f, 'utf8'))
    if (v.length) bad.push(`${relative(REPO, f)}: ${v.join(', ')}`)
  }
  ck(`D 靜態:模態浮層預設開啟的 story 必帶 openOverlayDocsStory(掃 ${files.length} stories 檔)`, bad.length === 0, bad.join(' ; '))
}

function staticSelftest() {
  // 對照組 1:shadcn v3 原始組合必紅;輕量浮層的 8px 方向 slide 不得誤報
  const v3 = 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
  const light = 'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2'
  const centeredOnly = 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 data-[state=open]:zoom-in-95'
  ck('selftest S:v3 置中 + slide-1/2 組合必被抓到', centerSlideConflict(v3))
  ck('selftest S:輕量浮層 slide-*-2 不得誤報', !centerSlideConflict(light))
  ck('selftest S:只有置中沒有 slide 不得誤報', !centerSlideConflict(centeredOnly))
  ck('selftest S:註解裡提到那組 class 不得誤報(只看 code)', !centerSlideConflict(`${centeredOnly}\n// 舊的 slide-in-from-left-1/2 slide-in-from-top-[48%] 已拿掉\n/* slide-out-to-left-1/2 */`))
  // 對照組 2:預設開啟的 Dialog story 缺參數必紅;帶參數 / test-only / 關著的不得誤報
  const mk = (extra, tag = 'Dialog defaultOpen') => `export const X = {\n  name: 'x',\n${extra}\n  render: () => (<${tag}><DialogContent /></Dialog>),\n}\n`
  ck('selftest D:defaultOpen Dialog 缺 docs 隔離參數必紅', docsIsolationViolations(mk('')).length === 1)
  ck('selftest D:帶 openOverlayDocsStory 不得誤報', docsIsolationViolations(mk("  parameters: { docs: { story: openOverlayDocsStory('560px') } },")).length === 0)
  ck('selftest D:帶 openOverlayParameters 不得誤報', docsIsolationViolations(mk("  parameters: openOverlayParameters('560px'),")).length === 0)
  ck('selftest D:test-only probe 不得誤報', docsIsolationViolations(mk("  tags: ['test-only'],")).length === 0)
  ck('selftest D:關著的 Dialog 不得誤報', docsIsolationViolations(mk('', 'Dialog')).length === 0)
  ck('selftest D:useState(true) 餵 open 也算預設開啟', docsIsolationViolations(`export const Y = {\n  render: () => { const [open, setOpen] = useState(true); return <Dialog open={open} onOpenChange={setOpen}><DialogContent /></Dialog> },\n}\n`).length === 1)
  ck('selftest D:別的 useState(true) + open 初始 false 不得誤報', docsIsolationViolations(`export const Z = {\n  render: () => { const [showFilmstrip, setShow] = React.useState(true); const [open, setOpen] = React.useState(false); return <FileViewer open={open} onOpenChange={setOpen} /> },\n}\n`).length === 0)
}

if (SELFTEST) staticSelftest()
else { staticMotionScan(); staticDocsScan() }

// ═══════════════════════════════════════════════════════════════════════════
// 瀏覽器段
// ═══════════════════════════════════════════════════════════════════════════
if (!existsSync(join(STATIC, 'iframe.html'))) {
  console.log(out.join('\n'))
  console.error(`\n✗ 找不到 storybook build:${STATIC}(先 npm run build-storybook,或 --static <dir>)`)
  process.exit(1)
}
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const sv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
  const f = join(STATIC, p)
  if (!existsSync(f) || statSync(f).isDirectory()) { s.writeHead(404); s.end(); return }
  s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f))
})
await new Promise((r) => sv.listen(0, r))
const story = (id, mode = 'story') => `http://localhost:${sv.address().port}/iframe.html?id=` + encodeURIComponent(id) + `&viewMode=${mode}`

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

// 真的去點、真的去打字 —— 「可聚焦」不等於「可操作」
const probe = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return { missing: true }
  el.focus()
  const focused = document.activeElement === el
  let typed = null
  if (el.tagName === 'INPUT') {
    el.value = ''
    el.dispatchEvent(new Event('focus'))
    // 真的送鍵盤事件會被 inert 擋掉;這裡量的是「焦點進不進得去」+ 元素自身狀態
    typed = !el.matches(':disabled')
  }
  return { focused, typed, inert: !!el.closest('[inert]'), ariaHidden: !!el.closest('[aria-hidden="true"]') }
}, sel)

if (!SELFTEST) {
  // ── (B) 並存路徑 ────────────────────────────────────────────────────────
  await page.goto(story('design-system-components-dialog-展示--coexistence-contract'), { waitUntil: 'load' })
  // 等 story 真的渲染(共享 runner 上固定 900ms 不夠:a646b6c2 讀回「找不到 #coexist-aside-input」;本機與前幾次 CI 都過)
  await page.waitForSelector('#coexist-aside-input', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(600)
  const asideInput = await probe('#coexist-aside-input')
  const bgBtn = await probe('#coexist-background-btn')

  if (asideInput.missing) ck('B 並存路徑:story 有渲染', false, '找不到 #coexist-aside-input')
  else {
    ck('B 常駐區域的輸入框仍可聚焦', asideInput.focused && !asideInput.inert,
       `focused=${asideInput.focused} inert=${asideInput.inert}`)
    // 真的打字:「可聚焦」不等於「可操作」(R3 指出只 .focus() 不夠)
    await page.focus('#coexist-aside-input'); await page.keyboard.type('hello')
    const typed = await page.evaluate(() => document.querySelector('#coexist-aside-input')?.value)
    ck('B 常駐區域的輸入框真的能打字', typed === 'hello', `value=${JSON.stringify(typed)}`)
    // 送出 / 儲存 在輸入空白時停用(story 依規格),所以先打字再驗按鈕可聚焦
    const asideBtn = await probe('#coexist-aside-btn')
    ck('B 常駐區域的按鈕仍可聚焦(v14 條 B「並列可操作」)', asideBtn.focused && !asideBtn.inert && !asideBtn.ariaHidden,
       `focused=${asideBtn.focused} inert=${asideBtn.inert} ariaHidden=${asideBtn.ariaHidden}`)
    await page.focus('#coexist-inside-input'); await page.keyboard.type('x')
    const insideBtn = await probe('#coexist-inside-btn')
    ck('B 對話框自己的按鈕仍可聚焦', insideBtn.focused && !insideBtn.inert,
       `focused=${insideBtn.focused} inert=${insideBtn.inert}`)
    ck('B **其餘背景仍被抑制**(並存不等於全開)', bgBtn.inert || bgBtn.ariaHidden || !bgBtn.focused,
       `focused=${bgBtn.focused} inert=${bgBtn.inert} ariaHidden=${bgBtn.ariaHidden}`)
  }

  // ── (A) 預設路徑:沒傳 persistentElements 的 Dialog 必須照舊隔離 ──────────
  await page.goto(story('design-system-components-dialog-展示--default'), { waitUntil: 'load' }).catch(() => {})
  await page.waitForTimeout(600)
  const defaultPath = await page.evaluate(async () => {
    // 只挑 story 根節點內的觸發鈕:iframe 裡還有 storybook 自己的「Set string」按鈕,
    // 抓第一個 button 會抓到它然後什麼都沒發生(2026-09-08 當場踩到)
    const root = document.querySelector('#storybook-root') || document.body
    const trigger = [...root.querySelectorAll('button')].find((b) => !b.closest('[role="dialog"]'))
    if (!trigger) return { skip: '找不到觸發鈕' }
    trigger.click()
    await new Promise((r) => setTimeout(r, 700))
    const dialog = document.querySelector('[role="dialog"]')
    if (!dialog) return { skip: '對話框沒開' }
    const outside = [...root.querySelectorAll('button')].filter((b) => !dialog.contains(b))
    const stillUsable = outside.filter((b) => !b.closest('[inert]') && !b.closest('[aria-hidden="true"]'))
    return { total: outside.length, stillUsable: stillUsable.length }
  })
  if (defaultPath.skip) ck('A 預設路徑:背景照舊被隔離', false, defaultPath.skip)
  else ck('A 預設路徑:背景照舊被隔離(沒傳 persistentElements 就是原本的 modal)',
          defaultPath.stillUsable === 0, `框外仍可用 ${defaultPath.stillUsable}/${defaultPath.total}`)

  const GEO = `(() => {
    const mask = document.querySelector('[data-coexistence-mask]')
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((d) => !d.querySelector('[data-coexistence-mask]')) || document.querySelector('[role="dialog"]')
    const panel = document.querySelector('[role="complementary"]') || document.querySelector('aside#coexist-aside, aside#fv-aside')
    if (!mask || !dialog || !panel) return { missing: { mask: !mask, dialog: !dialog, panel: !panel } }
    const stage = mask.parentElement
    const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }
    const D = R(dialog), M = R(mask), P = R(panel), S = R(stage)
    const intersects = !(D.r <= P.l + 0.5 || D.l >= P.r - 0.5 || D.b <= P.t + 0.5 || D.t >= P.b - 0.5)
    const eq = (a, b) => Math.abs(a - b) <= 1
    const cx = (P.l + P.r) / 2, cy = (P.t + P.b) / 2
    const hit = document.elementFromPoint(cx, cy)
    const centered = Math.abs((D.l + D.r) / 2 - (S.l + S.r) / 2) <= 1
    return { intersects, maskEqStage: eq(M.l, S.l) && eq(M.r, S.r) && eq(M.t, S.t) && eq(M.b, S.b), panelHit: !!hit && panel.contains(hit), centered, D, M, P, S }
  })()`

  // 幾何(2026-09-08 user:「modal 整個蓋住了 agent 是要怎樣用」):對話框不與常駐區相交、遮罩 = 舞台、常駐區中心可點
  {
    await page.goto(story('design-system-components-dialog-展示--coexistence-contract'), { waitUntil: 'load' }).catch(() => {})
    await page.waitForSelector('[data-coexistence-mask]', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(500)
    const g = await page.evaluate(GEO)
    ck('G 對話框不與常駐側欄相交(v14 條 B 並列可操作)', !g.missing && !g.intersects, JSON.stringify(g.missing ?? { D: g.D, P: g.P }))
    ck('G 遮罩 = 舞台矩形(只佔宿主面積)', !g.missing && g.maskEqStage, JSON.stringify(g.missing ?? { M: g.M, S: g.S }))
    ck('G 側欄中心點點得到自己(沒被遮罩蓋)', !g.missing && g.panelHit)
  }

  // ── (D-browser) docs 隔離:Dialog docs 頁頂層文件不得有可見 dialog;canvas 快照仍開著 ──
  {
    await page.goto(story('design-system-components-dialog-展示--docs', 'docs'), { waitUntil: 'load' }).catch(() => {})
    await page.waitForTimeout(4000)
    const d = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' }
      const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(vis)
      const fixedOpen = [...document.querySelectorAll('[data-state="open"]')].filter((el) => getComputedStyle(el).position === 'fixed' && vis(el))
      const iframes = [...document.querySelectorAll('iframe')].filter((f) => (f.getAttribute('src') || '').includes('viewMode=story'))
      return { dialogs: dialogs.length, fixedOpen: fixedOpen.length, iframes: iframes.length, widths: iframes.map((f) => Math.round(f.getBoundingClientRect().width)), rendered: !!document.querySelector('.sbdocs, #storybook-docs, [data-docs], h1') }
    })
    ck('D docs 頁頂層文件沒有可見的 dialog(修前 4 個)', d.rendered && d.dialogs === 0, `dialogs=${d.dialogs} fixedOpen=${d.fixedOpen} rendered=${d.rendered}`)
    ck('D docs 頁真的用 iframe 隔離了預設開啟的 story(不是沒渲染)', d.iframes >= 1, `iframes=${d.iframes}`)
    // meta layout:'centered' 會把隔離的 iframe 縮成內建 300px(對話框被擠到 204px);openOverlayParameters 用 padded 撐滿
    ck('D 隔離的 iframe 有撐滿 docs 畫布(每個 ≥ 600px,centered 縮成 300px 就是回歸)', d.widths.length > 0 && d.widths.every((w) => w >= 600), `widths=${d.widths.join(',')}`)
    await page.goto(story('design-system-components-dialog-展示--open-snapshot'), { waitUntil: 'load' }).catch(() => {})
    await page.waitForTimeout(600)
    const open = await page.evaluate(() => !!document.querySelector('[role="dialog"][data-state="open"]'))
    ck('D canvas 的 OpenSnapshot 仍然開著(隔離只動 docs)', open)
  }
}

// ── (M) 進場第一幀:載入即凍住進場動畫,WAAPI seek 到 t=0 量中心偏移 ──
// addInitScript 只對之後的導覽生效,所以放在其他斷言之後;只在 story 模式凍(docs 頁要量真實可見數)。
await page.addInitScript(() => {
  if (!location.search.includes('viewMode=story')) return
  const st = document.createElement('style'); st.textContent = '[role="dialog"]{animation-play-state:paused !important}'
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st))
})
// 對照組注入:逐字 = tw-animate-css 對 slide-in-from-left-1/2 / slide-in-from-top-[48%] 產生的宣告
const SLIDE_CSS = '.slide-in-from-left-1\\/2{--tw-enter-translate-x:calc(1/2 * -100%)}.slide-in-from-top-\\[48\\%\\]{--tw-enter-translate-y:calc(48% * -1)}'
const FIRST_FRAME = `(async () => {
  const dlg = document.querySelector('[role="dialog"][data-state="open"]')
  if (!dlg) return { missing: true }
  const anims = dlg.getAnimations()
  const measure = () => {
    const r = dlg.getBoundingClientRect()
    const cs = getComputedStyle(dlg)
    return { dx: +((r.left + r.width / 2) - innerWidth / 2).toFixed(2), dy: +((r.top + r.height / 2) - innerHeight / 2).toFixed(2), opacity: +cs.opacity, transform: cs.transform }
  }
  const at = async (t) => { for (const a of anims) { a.currentTime = t }; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return measure() }
  const dur = anims[0] ? anims[0].effect.getTiming().duration : 0
  return { anims: anims.length, dur, first: await at(0), last: await at(dur) }
})()`
async function firstFrame(inject) {
  await page.goto(story('design-system-components-dialog-展示--open-snapshot'), { waitUntil: 'load' })
  await page.waitForSelector('[role="dialog"][data-state="open"]', { timeout: 15000 })
  await page.waitForTimeout(300)
  if (inject) {
    await page.addStyleTag({ content: SLIDE_CSS })
    await page.evaluate(() => document.querySelector('[role="dialog"][data-state="open"]').classList.add('slide-in-from-left-1/2', 'slide-in-from-top-[48%]'))
  }
  return page.evaluate(FIRST_FRAME)
}
const centered = (m) => Math.abs(m.dx) <= 1 && Math.abs(m.dy) <= 1
if (!SELFTEST) {
  const m = await firstFrame(false)
  ck('M 進場動畫有抓到(paused 的 CSS animation 出現在 getAnimations)', !m.missing && m.anims >= 1 && m.dur > 0, `anims=${m.anims} dur=${m.dur}`)
  ck('M t=0 真的是動畫第一幀(scale<1 或 opacity<1),不是量到定格', !m.missing && (m.first.opacity < 1 || /matrix/.test(m.first.transform)), JSON.stringify(m.first))
  ck('M t=0 對話框中心 = 視窗中心(≤1px;修前 -240 / -90.72)', !m.missing && centered(m.first), `dx=${m.first?.dx} dy=${m.first?.dy}`)
  ck('M t=end 對話框中心 = 視窗中心', !m.missing && centered(m.last), `dx=${m.last?.dx} dy=${m.last?.dy}`)
}
// 對照組:加回 slide class 必須量到偏移(儀器會紅才算儀器;正式跑與 --selftest 都跑)
{
  const c = await firstFrame(true)
  ck('對照組 M:把 slide-in-from-left-1/2 + slide-in-from-top-[48%] 加回去,t=0 必須偏離中心', !c.missing && !centered(c.first), `dx=${c.first?.dx} dy=${c.first?.dy}`)
  ck('對照組 M:偏移方向 = 左上(dx<0 且 dy<0,即「從左上角飛入」)', !c.missing && c.first.dx < -1 && c.first.dy < -1)
}

await browser.close(); sv.close()
console.log(out.join('\n'))
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ ${SELFTEST ? '對照組全紅(儀器有效)' : '並存 / 進場第一幀 / docs 隔離 全通過'}`)
process.exit(fail ? 1 : 0)
