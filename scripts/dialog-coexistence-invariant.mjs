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
 *
 * ── 開 story(2026-09-25 起)──
 * 每一次開 story 都走 lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作):Storybook 回報渲染完成(含 play)
 * + render-health + 被量的元素出現 + 版面連續靜止 N 個影格(對話框進場、inert / aria-hidden 的套用都涵蓋在內)。
 * 原本是 `load` + 固定睡 600 / 500 / 300ms(docs 頁 4000ms),而且好幾處 `goto(...).catch(() => {})`、
 * `waitForSelector(...).catch(() => {})` 把「story 沒開起來」吞掉,再讓下游讀成產品裁決 —— 實測(2026-09-25,本機負載 ~30)
 * 舊版 A 段三跑兩紅「找不到觸發鈕」;重現舊的時間點(load + 600ms)讀到 Storybook currentRender.phase = preparing、
 * #storybook-root 裡 0 個按鈕:story 還沒畫出來,不是 Default story 沒有觸發鈕(M37)。新版同機三跑三綠。
 * docs 頁沒有 story 那套 render phase:改等 docs 容器出現、且每則 inline story 的容器都已渲染進內容,再等版面靜止。
 * story 開不起來 → **儀器失效**:點名 story、附 Storybook 錯誤原文與同源 404 帳本,exit 1 —— 不是產品裁決,也不當成通過
 * (不用 exit 2:lib/gate-selftest-meta.mjs 在 2026-09-25 修正前把 2 讀成「缺前置 → 略過」)。
 */
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError, requireStorybookBuild } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

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
  // 靜態段已經有紅 → 照樣紅:缺建置只准說明「瀏覽器段沒跑到」,不得把靜態段的失敗一起讀成略過
  if (fail) { console.error(`\n✗ 靜態段 ${fail} 項未通過(瀏覽器段因缺 storybook build 沒跑)`); process.exit(1) }
}
requireStorybookBuild(join(STATIC, 'iframe.html'), '先 npm run build-storybook,或 --static <dir>')
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const sv = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const story = (id, mode = 'story') => `${sv.origin}/iframe.html?id=` + encodeURIComponent(id) + `&viewMode=${mode}`

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

// 版面連續靜止幾個影格才量(與其他瀏覽器閘同值)
const SETTLE_FRAMES = 10
/** 開 story 並等到真的畫完(openStory);證明不了 → 儀器失效:點名 story、印 404 帳本,exit 1。 */
async function open(url, options = {}) {
  try {
    return await openStory(page, url, { settleFrames: SETTLE_FRAMES, notFound: sv.notFound, ...options })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    if (out.length) console.log(out.join('\n'))
    console.error(`\n✗ ${error.message}`)
    await browser.close(); await sv.stop(); process.exit(1)
  }
}

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
  // 等 story 真的渲染(共享 runner 上固定 900ms 不夠:a646b6c2 讀回「找不到 #coexist-aside-input」;本機與前幾次 CI 都過)——
  // 等被量的元素本身;對話框開啟後 suppressOthers 套上 inert 的那次重畫由靜止判定涵蓋(原本另睡 600ms)
  await open(story('design-system-components-dialog-展示--coexistence-poc'), { waitFor: '#coexist-aside-input' })
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
  // 渲染完成才點觸發鈕(openStory 的 beforeSettle);點完等對話框本身出現(原本在頁面裡固定睡 700ms),
  // 開啟動畫與 inert / aria-hidden 的套用交給靜止判定,再在同一個 task 裡量(probe)。
  // 對話框等不到 → probe 回報「對話框沒開」(產品裁決,紅),不是略過。
  let clickedTrigger = false
  const { probe: opened } = await open(story('design-system-components-dialog-展示--default'), {
    beforeSettle: async (p) => {
      clickedTrigger = await p.evaluate(() => {
        // 只挑 story 根節點內的觸發鈕:iframe 裡還有 storybook 自己的「Set string」按鈕,
        // 抓第一個 button 會抓到它然後什麼都沒發生(2026-09-08 當場踩到)
        const root = document.querySelector('#storybook-root') || document.body
        const trigger = [...root.querySelectorAll('button')].find((b) => !b.closest('[role="dialog"]'))
        trigger?.click()
        return Boolean(trigger)
      })
      if (clickedTrigger) await p.waitForSelector('[role="dialog"]', { timeout: 15000 }).catch(() => {})
    },
    probe: () => {
      const root = document.querySelector('#storybook-root') || document.body
      const dialog = document.querySelector('[role="dialog"]')
      if (!dialog) return { skip: '對話框沒開' }
      const outside = [...root.querySelectorAll('button')].filter((b) => !dialog.contains(b))
      const stillUsable = outside.filter((b) => !b.closest('[inert]') && !b.closest('[aria-hidden="true"]'))
      return { total: outside.length, stillUsable: stillUsable.length }
    },
  })
  const defaultPath = clickedTrigger ? opened : { skip: '找不到觸發鈕(story 已渲染完成)' }
  if (defaultPath.skip) ck('A 預設路徑:背景照舊被隔離', false, defaultPath.skip)
  else ck('A 預設路徑:背景照舊被隔離(沒傳 persistentElements 就是原本的 modal)',
          defaultPath.stillUsable === 0, `框外仍可用 ${defaultPath.stillUsable}/${defaultPath.total}`)

  const GEO = () => {
    const mask = document.querySelector('[data-coexistence-mask]:not([data-agent-panel-scrim])')
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((d) => !d.querySelector('[data-coexistence-mask]:not([data-agent-panel-scrim])')) || document.querySelector('[role="dialog"]')
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
  }

  // 幾何(2026-09-08 user:「modal 整個蓋住了 agent 是要怎樣用」):對話框不與常駐區相交、遮罩 = 舞台、常駐區中心可點
  // 不以遮罩當 waitFor:遮罩是被驗的產品行為,沒出現要照實紅成「G … missing」,不能被讀成「沒量到」。
  // 渲染完成 + 靜止之後在同一個 task 裡量(原本 goto / 等遮罩兩處 .catch(() => {}) 吞掉,再固定睡 500ms)。
  {
    const { probe: g } = await open(story('design-system-components-dialog-展示--coexistence-poc'), { probe: GEO })
    ck('G 對話框不與常駐側欄相交(v14 條 B 並列可操作)', !g.missing && !g.intersects, JSON.stringify(g.missing ?? { D: g.D, P: g.P }))
    ck('G 遮罩 = 舞台矩形(只佔宿主面積)', !g.missing && g.maskEqStage, JSON.stringify(g.missing ?? { M: g.M, S: g.S }))
    ck('G 側欄中心點點得到自己(沒被遮罩蓋)', !g.missing && g.panelHit)
  }

  // ── (D-browser) docs 隔離:Dialog docs 頁頂層文件不得有可見 dialog;canvas 快照仍開著 ──
  {
    // docs 頁沒有 story 的 render phase(currentRender 是 CsfDocsRender,沒有 phase)→ 不走第 3 步;render-health 以 document 模式
    // 只驗關鍵資源 404 / 頁面例外(#storybook-root 在 docs 頁本來就是空的)。「docs 真的畫完」= docs 容器出現,
    // 而且每一則 inline story 的容器都已渲染進內容(實測載入後約 1.5s 還是空殼、約 2.3s 才全部填上);之後的 portal 掛載
    // (殭屍 dialog 就是這樣冒出來的)由靜止判定涵蓋。取代原本 goto(.catch 吞掉)+ 固定睡 4000ms。
    const { probe: d } = await open(story('design-system-components-dialog-展示--docs', 'docs'), {
      storybook: false,
      waitFor: () => {
        if (!document.querySelector('#storybook-docs .sbdocs-content')) return false
        const blocks = document.querySelectorAll('[id^="story--"]')
        const inner = [...document.querySelectorAll('[id^="story--"][id$="-inner"]')]
        return blocks.length > 0 && inner.every((el) => el.childElementCount > 0)
      },
      settleFrames: 20,
      probe: () => {
        const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' }
        const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(vis)
        const fixedOpen = [...document.querySelectorAll('[data-state="open"]')].filter((el) => getComputedStyle(el).position === 'fixed' && vis(el))
        const iframes = [...document.querySelectorAll('iframe')].filter((f) => (f.getAttribute('src') || '').includes('viewMode=story'))
        return { dialogs: dialogs.length, fixedOpen: fixedOpen.length, iframes: iframes.length, widths: iframes.map((f) => Math.round(f.getBoundingClientRect().width)), rendered: !!document.querySelector('#storybook-docs .sbdocs-content') }
      },
    })
    ck('D docs 頁頂層文件沒有可見的 dialog(修前 4 個)', d.rendered && d.dialogs === 0, `dialogs=${d.dialogs} fixedOpen=${d.fixedOpen} rendered=${d.rendered}`)
    ck('D docs 頁真的用 iframe 隔離了預設開啟的 story(不是沒渲染)', d.iframes >= 1, `iframes=${d.iframes}`)
    // meta layout:'centered' 會把隔離的 iframe 縮成內建 300px(對話框被擠到 204px);openOverlayParameters 用 padded 撐滿
    ck('D 隔離的 iframe 有撐滿 docs 畫布(每個 ≥ 600px,centered 縮成 300px 就是回歸)', d.widths.length > 0 && d.widths.every((w) => w >= 600), `widths=${d.widths.join(',')}`)
    // 不以對話框當 waitFor:「OpenSnapshot 開著」正是這條要驗的產品行為;渲染完成 + 靜止後量(原本 .catch 吞掉 + 固定睡 600ms)
    const { probe: snapshotOpen } = await open(story('design-system-components-dialog-展示--open-snapshot'), {
      probe: () => !!document.querySelector('[role="dialog"][data-state="open"]'),
    })
    ck('D canvas 的 OpenSnapshot 仍然開著(隔離只動 docs)', snapshotOpen)
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
  // 等被量的對話框本身 + 版面靜止(原本等到之後固定睡 300ms)。對話框的進場動畫被上面的 init script 暫停在 t=0,
  // 暫停中的動畫(playState = paused)不算「還在動」,所以靜止判定不會等它;遮罩等其他有限動畫則會等到跑完。
  await open(story('design-system-components-dialog-展示--open-snapshot'), { waitFor: '[role="dialog"][data-state="open"]' })
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

await browser.close(); await sv.stop()
console.log(out.join('\n'))
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ ${SELFTEST ? '對照組全紅(儀器有效)' : '並存 / 進場第一幀 / docs 隔離 全通過'}`)
process.exit(fail ? 1 : 0)
