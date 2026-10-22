#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Toast 一律以整個視窗為準(套件預設角落),不為側欄、面板、入口鈕或輸入框避讓 —— toast.spec.md「落點」。
 *        (1) 靜態:DS 原始碼(packages/design-system/src)沒有任何地方算或傳 Toast 的落點 ——
 *            只有 Toast/toast.tsx import sonner;它的 <SonnerToaster> 只收 position / toastOptions / {...props} / containerAriaLabel(地標名稱,字串,放不進落點),
 *            外加一個只含層級 utility 的 className 字串(`!z-[60]`,層級表 tokens/elevation/elevation.spec.md「疊放順序」—— 放不進任何落點)、
 *            ToasterProps 只有 position 與 containerAriaLabel;toast.tsx 不量任何元素的位置;沒有任何非 story 檔碰 sonner 清單的 DOM
 *           (data-sonner-toaster)或寫它的落點自訂屬性(--offset-* / --mobile-offset-*);所有 <Toaster> 用法最多只帶 position / containerAriaLabel。
 *           (containerAriaLabel = 通知清單地標的名稱,DS 預設「通知」—— 2026-10-20 加,獨立驗證 OV-V05;它是無障礙名稱,不是落點參數,
 *            所以明列在「不是落點」的白名單裡,其餘一律照舊紅)
 *        (2) 真建置:七個情境(沒有代理 / 代理並排 / 代理浮層 / 入口鈕在家 / 入口鈕貼邊 / 頁面捲動 / docs 頁)裡,
 *            Toast 右緣離包含塊右緣、底緣離包含塊下緣都 = sonner 預設邊距(從 sonner 建置讀出,不寫死),
 *            Toast 清單四邊的落點自訂屬性全是 sonner 預設、沒有行內 left;story 頁的包含塊 = 視窗。
 *   紅: 任一條不符 → exit 1。`--selftest` 兩種對照組,每一種都必須紅在它該紅的地方,少一個 = 量具沒在量它宣稱的東西 → exit 1:
 *       (1) 靜態:把 a6976432 的舞台落點寫回(toast.tsx 展開算出來的 offset、量元素位置、別的模組改寫清單落點、另一個模組 import sonner、
 *           <Toaster> 帶 offset),每一種都必須紅在指定的那一條;
 *       (2) 真建置:在頁面裡注入 a6976432 的舞台落點(並排面板切走右緣 → Toast 對齊面板左緣 − 24、在家的入口鈕 → Toast 疊在它上方、
 *           每一格重量 = 捲動也跟著走、只算與包含塊相交的佔用):代理並排 / 入口鈕在家 / 頁面捲動 / docs 頁都必須紅;
 *           沒有代理 / 代理浮層 / 貼邊那時本來就不動,必須維持綠(證明注入的是 a6976432 的行為,不是隨便推一下)。
 *       story / docs 頁開不起來、版面 10 秒內不靜止、Toast 沒出現、sonner 預設邊距讀不到 = 儀器失效(INSTRUMENT-FAIL,不是產品裁決,也不算通過)。
 *   綠: 沒改壞時全部綠;每個情境都等 Toast 元素本身出現、再等版面連續 10 個影格靜止(sonner 進場過渡也在 getAnimations 裡)才量,
 *       不用固定睡眠當「已出現」的代理;量的是幾何等式(±0.5px),重複跑不抽籤。
 *
 * 由來:user 2026-10-13 決定甲(「確保符合世界級的設計和我們一致的設計語言就甲」;全文與理由只住 toast.spec.md「落點」)。
 * 取代 a6976432 的 toast-stage-placement 閘(那支保證的是相反的事:Toast 跟著代理面板與入口鈕挪位)。
 * 包含塊用閘自己插進去的量尺量:跟 sonner 清單 <ol> 同一個父層、`position: fixed; inset: 0`(與清單同一個包含塊)——
 * 一般頁面 = 視窗;Storybook docs 頁每則 story 的外框有 transform,包含塊是那個外框(Storybook 造成,不是 DS 行為)。
 *
 * 輸出的範圍代號:C = 靜態(C1–C7);真建置 N 沒有代理(Toast「點擊觸發通知」)/ D 代理並排(網址註冊表示意,1440×900,新增任務 → 建立)/
 * O 接 D 把視窗縮成 900(畫布放不下舞台最小 600 + 面板最小 360 → 代理浮層)/ F 面板關著、入口鈕在家 / S 入口鈕鍵盤 → 貼邊 / K 入口鈕在家、整頁可捲、捲 60 /
 * P AgentPanel「展示」docs 頁(包含塊是 story 外框)。每個情境另印「報告(不判定)」:Toast 與面板 / 輸入盒 / 入口鈕相交多少 —— 甲 = 疊在上面是刻意的。
 * 對照實測(2026-10-13):本閘對 6b5d8b61 的建置(a6976432 的舞台版)跑,D 離右 441 / F 離下 89 / K 離下 149 / P 離右 402 全紅、N / O / S 綠、
 * 靜態 C1 / C2 紅;--selftest 注入的舞台落點量到的是同一組數字。
 * 用法:node scripts/toast-viewport-placement-invariant.mjs [--static=<dir>] [--selftest]
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireFreshStorybookBuild, settleAfterInteraction, StoryRenderInstrumentError, waitForDocsRender,
} from './lib/launch-browser.mjs'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DS_SRC = 'packages/design-system/src'
const TOAST_TSX = `${DS_SRC}/components/Toast/toast.tsx`
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
let failed = 0
const instrumentFails = []
/** 每個 scope 紅了幾條(selftest 用) */
const redBy = {}
let current = ''
const rec = (ok, msg, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${current} ${msg}${detail ? ` | ${detail}` : ''}`)
  if (!ok) { failed++; redBy[current] = (redBy[current] ?? 0) + 1 }
}

// sonner 的 ESM 建置(套件 exports 不開放 ./package.json → 從主入口所在的 dist/ 找 index.mjs;DS 實際 import 的就是這一份)
const SONNER_SRC = fs.readFileSync(path.join(path.dirname(createRequire(path.join(REPO, 'packages/design-system/package.json')).resolve('sonner')), 'index.mjs'), 'utf8')
const BASE = Number(SONNER_SRC.match(/const VIEWPORT_OFFSET = '(\d+)px'/)?.[1])
const MOBILE_BASE = Number(SONNER_SRC.match(/const MOBILE_VIEWPORT_OFFSET = '(\d+)px'/)?.[1])
if (!Number.isFinite(BASE) || !Number.isFinite(MOBILE_BASE)) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:讀不到 sonner 的預設邊距(VIEWPORT_OFFSET=${BASE} / MOBILE_VIEWPORT_OFFSET=${MOBILE_BASE})—— 升級 sonner 改了寫法?這次不能宣稱任何落點`)
  process.exit(1)
}

// ── C(靜態):DS 原始碼沒有任何地方算或傳 Toast 的落點 ─────────────────────────────
/** DS 原始碼(相對 repo 的路徑 → 內容);.ts / .tsx / .css / .mdx,含 stories */
function readDsSources() {
  const out = new Map()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) { if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(rel) } else if (/\.(tsx?|css|mdx)$/.test(entry.name)) out.set(rel, fs.readFileSync(path.join(REPO, rel), 'utf8'))
    }
  }
  walk(DS_SRC)
  return out
}
const isStory = (rel) => /\.stories\.tsx?$|\.mdx$/.test(rel)
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
/**
 * `<Name …/>` 自閉合元素的屬性原文。屬性區只認「不含 < >」的字元與最多兩層的 `{…}`(`toastOptions={{ … }}`、`{...x(a, b)}`):
 * 字串裡提到 `<Toaster position>` 這種文字不會被當成元素、也不會一路吃到下一個 `/>`(2026-10-13 對 a6976432 那版跑時抓到的誤判)。
 */
const JSX_ATTRS = String.raw`((?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*?)`
const jsxElements = (src, name) => [...stripComments(src).matchAll(new RegExp(String.raw`<${name}\b` + JSX_ATTRS + String.raw`\/>`, 'g'))].map((m) => m[1])
const attrNames = (attrs) => [...attrs.matchAll(/(?:^|\s)([A-Za-z][\w-]*)\s*=/g)].map((m) => m[1])
const spreads = (attrs) => [...attrs.matchAll(/\{\s*\.\.\.\s*([^}]+?)\s*\}/g)].map((m) => m[1])
/**
 * `className` 只准是**純字串**、而且每個 class 都是層級 utility(`z-60` / `z-[60]`,可帶 `!`)—— 層級(疊放順序)不是落點;
 * 任何別的 class(`!right-[424px]`、`!bottom-24`、`translate-*`…)或運算式(`className={cls}`)都可能帶進落點 → 不准。
 * 回 null = 這個元素沒有 className;回 { ok, raw }。
 */
const Z_ONLY_CLASS = /^!?z-(?:\d+|\[\d+\])$/
/** Toaster 上「不是落點」的參數白名單:地標名稱(字串,toast.spec.md「A11y 預設」通知清單的名稱)。其餘任何屬性都當成可能夾帶落點 */
const NON_PLACEMENT_PROPS = new Set(['containerAriaLabel'])
const classNameAttr = (attrs) => {
  const m = attrs.match(/(?:^|\s)className\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{[\s\S]*?\}))/)
  if (!m) return null
  const literal = m[1] ?? m[2]
  return { ok: literal != null && literal.trim() !== '' && literal.trim().split(/\s+/).every((c) => Z_ONLY_CLASS.test(c)), raw: m[0].trim() }
}
/** 會讀到元素位置 / 尺寸的 API —— toast.tsx 一個都不該用(Toast 不量任何東西) */
const GEOMETRY_READS = /\b(getBoundingClientRect|getClientRects|ResizeObserver|IntersectionObserver|offsetParent|offset(?:Width|Height|Left|Top)|client(?:Width|Height|Left|Top)|inner(?:Width|Height)|elementFromPoint|scroll(?:X|Y|Top|Left))\b|addEventListener\(\s*['"](?:scroll|resize)['"]/

/** 跑一次靜態判定;回紅掉的檢查名(selftest 用) */
function runStatic(files, { quiet = false } = {}) {
  const red = []
  const check = (name, ok, detail) => { if (!ok) red.push(name); if (!quiet) rec(ok, name, ok ? '' : detail) }
  const importsSonner = [...files].filter(([, src]) => /from\s+['"]sonner['"]|import\(\s*['"]sonner['"]\s*\)|require\(\s*['"]sonner['"]\s*\)/.test(stripComments(src))).map(([rel]) => rel)
  check('C1 只有 Toast/toast.tsx import sonner(落點只可能從這一支進去)', importsSonner.length === 1 && importsSonner[0] === TOAST_TSX, `import sonner 的檔:${importsSonner.join('、') || '(沒有)'}`)
  const toast = files.get(TOAST_TSX) ?? ''
  const sonnerEls = jsxElements(toast, 'SonnerToaster')
  const attrs = sonnerEls.flatMap(attrNames)
  const spreadArgs = sonnerEls.flatMap(spreads)
  const classes = sonnerEls.map(classNameAttr).filter(Boolean)
  check('C2 <SonnerToaster> 只收 position / toastOptions / {...props} 與只含層級 utility 的 className(不傳 offset / mobileOffset / style、不展開算出來的落點)',
    sonnerEls.length === 1 && attrs.every((a) => a === 'position' || a === 'toastOptions' || a === 'className' || NON_PLACEMENT_PROPS.has(a)) && classes.every((c) => c.ok) && spreadArgs.every((s) => s === 'props'),
    `${sonnerEls.length} 個元素;屬性 ${attrs.join(', ') || '-'};className ${classes.map((c) => `${c.raw}${c.ok ? '' : '(不是只有層級 utility)'}`).join(', ') || '-'};展開 ${spreadArgs.map((s) => `{...${s}}`).join(', ') || '-'}`)
  const propsBody = stripComments(toast).match(/export interface ToasterProps\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const propKeys = [...propsBody.matchAll(/^\s*([A-Za-z]\w*)\??\s*:/gm)].map((m) => m[1])
  check('C3 ToasterProps 只有 position 與不是落點的地標名稱({...props} 帶不進落點參數)', propKeys.includes('position') && propKeys.every((k) => k === 'position' || NON_PLACEMENT_PROPS.has(k)), `鍵:${propKeys.join(', ') || '(讀不到)'}`)
  const geometry = stripComments(toast).match(GEOMETRY_READS)?.[0]
  check('C4 toast.tsx 不量任何元素的位置 / 尺寸 / 捲動', !geometry, `用到 ${geometry}`)
  const offsetWriters = [...files].filter(([, src]) => /--(?:mobile-)?offset-(?:top|right|bottom|left)\b/.test(stripComments(src))).map(([rel]) => rel)
  check('C5 沒有任何檔寫 sonner 清單的落點自訂屬性(--offset-* / --mobile-offset-*)', offsetWriters.length === 0, offsetWriters.join('、'))
  const toasterTouchers = [...files].filter(([rel, src]) => !isStory(rel) && /data-sonner-toaster/.test(stripComments(src))).map(([rel]) => rel)
  check('C6 沒有任何非 story 檔碰 sonner 清單的 DOM([data-sonner-toaster])', toasterTouchers.length === 0, toasterTouchers.join('、'))
  const badUsages = [...files].flatMap(([rel, src]) => jsxElements(src, 'Toaster').filter((a) => attrNames(a).some((n) => n !== 'position' && !NON_PLACEMENT_PROPS.has(n)) || spreads(a).length > 0).map((a) => `${rel}:<Toaster${a.replace(/\s+/g, ' ')}/>`))
  check('C7 所有 <Toaster> 用法最多只帶 position 與地標名稱(app 層設定一次角落,不帶落點)', badUsages.length === 0, badUsages.join('、'))
  return red
}

const SOURCES = readDsSources()
if (!SOURCES.has(TOAST_TSX)) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:讀不到 ${TOAST_TSX}`)
  process.exit(1)
}
current = 'C'
if (!SELFTEST) {
  runStatic(SOURCES)
} else {
  // a6976432 的舞台落點,逐條寫回;每一種都必須紅在指定的那一條(不是「有紅就好」)
  const with_ = (rel, src) => new Map([...SOURCES, [rel, src]])
  const toast = SOURCES.get(TOAST_TSX)
  const sonnerOpen = toast.indexOf('<SonnerToaster')
  if (sonnerOpen < 0) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:toast.tsx 找不到 <SonnerToaster,對照組注入不了`); process.exit(1) }
  const injectAttr = (attr) => toast.replace(/(<SonnerToaster\b[\s\S]*?)(\/>)/, `$1  ${attr}\n        $2`)
  const MUTANTS = [
    ['a6976432:展開 stageOffsets(position, geometry)', with_(TOAST_TSX, injectAttr('{...stageOffsets(position, geometry)}')), 'C2'],
    ['直接傳 offset', with_(TOAST_TSX, injectAttr('offset={{ right: 424 }}')), 'C2'],
    ['a6976432:置中寫行內 left', with_(TOAST_TSX, injectAttr("style={{ left: 'calc(50% - 200px)' }}")), 'C2'],
    ['className 夾帶落點 utility', with_(TOAST_TSX, toast.replace(/className="!z-\[60\]"/, 'className="!z-[60] !right-[424px]"')), 'C2'],
    ['className 改成運算式', with_(TOAST_TSX, toast.replace(/className="!z-\[60\]"/, 'className={stageClass(position)}')), 'C2'],
    ['ToasterProps 開放 offset', with_(TOAST_TSX, toast.replace(/(export interface ToasterProps\s*\{)/, '$1\n  offset?: number')), 'C3'],
    ['a6976432:量尺量自己的定位框', with_(TOAST_TSX, toast.replace(/(const Toaster = )/, 'const measureOrigin = (el: Element) => el.getBoundingClientRect()\n$1')), 'C4'],
    ['a6976432:捲動後重量', with_(TOAST_TSX, toast.replace(/(const Toaster = )/, "const listen = () => window.addEventListener('scroll', () => {})\n$1")), 'C4'],
    ['別的模組寫清單落點自訂屬性', with_(`${DS_SRC}/lib/stage-geometry.ts`, "export const apply = (ol: HTMLElement, px: number) => ol.style.setProperty('--offset-right', `${px}px`)\n"), 'C5'],
    ['別的模組改清單位置', with_(`${DS_SRC}/lib/stage-geometry.ts`, "export const list = () => document.querySelector('[data-sonner-toaster]')\n"), 'C6'],
    ['別的模組直接 import sonner', with_(`${DS_SRC}/lib/stage-geometry.ts`, "import { Toaster } from 'sonner'\nexport { Toaster }\n"), 'C1'],
    ['<Toaster> 用法帶 offset', with_(`${DS_SRC}/components/AgentPanel/agent-panel.stories.tsx`, `${SOURCES.get(`${DS_SRC}/components/AgentPanel/agent-panel.stories.tsx`) ?? ''}\nconst X = () => <Toaster offset={{ right: 424 }} />\n`), 'C7'],
  ]
  // 現況本身必須乾淨,否則對照組紅了也不能證明是注入造成的
  const baseline = runStatic(SOURCES, { quiet: true })
  rec(baseline.length === 0, '對照組前提:現況靜態判定全綠', baseline.join('、'))
  for (const [label, files, mustRed] of MUTANTS) {
    const red = runStatic(files, { quiet: true })
    rec(red.some((n) => n.startsWith(`${mustRed} `)), `對照組「${label}」→ ${mustRed} 必紅`, red.length ? `紅:${red.map((n) => n.split(' ')[0]).join('、')}` : '沒紅')
  }
}
const staticRed = redBy.C ?? 0

// ── 真建置 ───────────────────────────────────────────────────────────────────
const root = path.resolve(REPO, arg('static', 'storybook-static'))
requireFreshStorybookBuild(root, [
  TOAST_TSX,
  `${DS_SRC}/components/AgentPanel/agent-panel.tsx`,
  `${DS_SRC}/components/AgentPanel/agent-panel-fab.tsx`,
  `${DS_SRC}/components/AgentPanel/agent-panel.stories.tsx`,
  `${DS_SRC}/components/Toast/toast.stories.tsx`,
])
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const index = JSON.parse(fs.readFileSync(path.join(server.snapshot?.dir ?? root, 'index.json'), 'utf8'))
const findEntry = (type, re) => Object.values(index.entries).find((e) => e.type === type && re.test(e.id))?.id
const DEMO = findEntry('story', /agentpanel.*--url-registry-demo$/)
const TOAST = findEntry('story', /components-toast-.*--interactive$/)
const DOCS = findEntry('docs', /agentpanel-展示--docs$/)
if (!DEMO || !TOAST || !DOCS) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:找不到 story / docs(網址註冊表 ${DEMO ?? '缺'} / Toast 點擊觸發通知 ${TOAST ?? '缺'} / AgentPanel 展示 docs ${DOCS ?? '缺'})`)
  await server.stop()
  process.exit(1)
}

const PANEL = '[role="complementary"][aria-label="智慧代理"]'
const FAB = 'button[aria-label*="開啟智慧代理"]'
const TOAST_EL = '[data-sonner-toast][data-mounted="true"] [data-toast-visual-content]'
const PROBE_ATTR = 'data-gate-toast-frame'

/**
 * selftest 注入:a6976432 的舞台落點(lib/stage-geometry.ts + Toast/stage-offsets.ts 的行為,在頁面裡重現)。
 * 登記 = 並排的面板(edge:右緣切到面板左緣)、在家的入口鈕(corner:頂 − 自己的 loose);只算與該清單包含塊相交的佔用;
 * 換算 = 靠右 → --offset-right = 24 + 右緣佔用;靠下靠右且佔用 > 24 → --offset-bottom = 下緣佔用;手機同理(> 16)。
 * 每一格重量(a6976432 = ResizeObserver + 捲動重量),沒有佔用時拿掉 —— 沒有代理 / 代理浮層 / 貼邊與 sonner 預設相同,跟 a6976432 一樣。
 */
const STAGE_PLACEMENT = ({ PANEL, FAB, PROBE_ATTR, BASE, MOBILE_BASE }) => {
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
  const frameOf = (ol) => {
    let probe = ol.parentElement?.querySelector(`:scope > [${PROBE_ATTR}]`)
    if (!probe) {
      probe = document.createElement('div')
      probe.setAttribute(PROBE_ATTR, '')
      probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none'
      ol.parentElement?.insertBefore(probe, ol)
    }
    return rectOf(probe)
  }
  const sheet = document.head.appendChild(document.createElement('style'))
  let seq = 0
  const tick = () => {
    const rules = []
    for (const ol of document.querySelectorAll('[data-sonner-toaster]')) {
      const frame = frameOf(ol)
      const hits = (b) => b.right > b.left && b.bottom > b.top && !(b.right <= frame.left || b.left >= frame.right || b.bottom <= frame.top || b.top >= frame.bottom)
      let right = null
      let bottom = null
      for (const p of document.querySelectorAll(PANEL)) {
        if (p.getAttribute('data-agent-panel-mode') !== 'side-by-side' || getComputedStyle(p).display === 'none') continue
        const b = rectOf(p)
        if (hits(b)) right = Math.max(right ?? 0, Math.max(0, frame.right - b.left))
      }
      for (const f of document.querySelectorAll(FAB)) {
        const shell = f.closest('[data-placement]')
        if (shell?.getAttribute('data-placement') !== 'home') continue
        const b = rectOf(f)
        const gap = parseFloat(getComputedStyle(shell).getPropertyValue('--layout-space-loose')) || 16
        if (hits(b)) bottom = Math.max(bottom ?? -Infinity, frame.bottom - (b.top - gap))
      }
      const x = ol.getAttribute('data-x-position')
      const y = ol.getAttribute('data-y-position')
      if (!ol.hasAttribute('data-gate-stage-id')) ol.setAttribute('data-gate-stage-id', String(++seq))
      const decl = []
      if (right !== null && x === 'right') decl.push(`--offset-right:${BASE + right}px!important`)
      if (bottom !== null && y === 'bottom' && x === 'right' && bottom > BASE) decl.push(`--offset-bottom:${bottom}px!important`)
      if (bottom !== null && y === 'bottom' && bottom > MOBILE_BASE) decl.push(`--mobile-offset-bottom:${bottom}px!important`)
      if (right && x === 'center') decl.push(`left:calc(50% - ${right / 2}px)!important`)
      if (decl.length) rules.push(`[data-sonner-toaster][data-gate-stage-id="${ol.getAttribute('data-gate-stage-id')}"]{${decl.join(';')}}`)
    }
    // 樣式表而不是改行內樣式:沒有佔用時只要拿掉規則,sonner 自己寫在行內的預設值原封不動(a6976432 沒有佔用時也什麼都不傳)
    const css = rules.join('\n')
    if (sheet.textContent !== css) sheet.textContent = css
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const browser = await launchBrowser()
const VIEWPORT = { width: 1440, height: 900 }
const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'no-preference' })
const page = await context.newPage()

/** 一個情境 = 重開 story(等指定元素本身 + 版面靜止)+ 操作 + 斷言;開不起來 = 儀器失效,不是產品裁決。selftest 時開好就注入舞台落點。 */
async function scenario(name, storyId, waitFor, body, { viewport = VIEWPORT } = {}) {
  current = name
  await page.setViewportSize(viewport)
  try {
    await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`, { waitFor, settleFrames: 10, notFound: server.notFound })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    console.log(`✗ 情境 ${name}:${error.message}`)
    instrumentFails.push({ scenario: name, detail: error.detail })
    return
  }
  if (SELFTEST) await page.evaluate(STAGE_PLACEMENT, { PANEL, FAB, PROBE_ATTR, BASE, MOBILE_BASE })
  try {
    await body()
  } catch (error) {
    console.log(`✗ 情境 ${name} 沒量到:${error.message.split('\n')[0]}`)
    instrumentFails.push({ scenario: name, detail: error.message.split('\n')[0] })
  }
}

/** 等 Toast 元素本身、再等版面靜止(sonner 進場 400ms transform 過渡也在 getAnimations 裡);滑鼠停在 Toast 上讓 sonner 暫停倒數 */
async function waitToast(text) {
  await page.waitForFunction(({ sel, text }) => [...document.querySelectorAll(sel)].some((el) => (el.textContent ?? '').includes(text)), { sel: TOAST_EL, text }, { timeout: 10_000, polling: 'raf' })
  const box = await page.locator(TOAST_EL).last().boundingBox()
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await settle()
}
async function settle() {
  const s = await settleAfterInteraction(page, { frames: 10 })
  if (!s.ok) throw new Error(`版面 10 秒內沒有靜止(${JSON.stringify(s)})`)
}

/**
 * 一次量齊:最新那則 Toast、它所在清單的包含塊(閘插的量尺)、清單的落點自訂屬性與行內 left、視窗,
 * 外加只供報告的佔用者(面板 / 輸入盒 / 入口鈕)—— 它們不參與判定:甲 = 疊在上面是刻意的。
 */
const measure = (anchor = null) => page.evaluate(({ PANEL, FAB, TOAST_EL, PROBE_ATTR, anchor }) => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null }
  // anchor(docs 頁):只看含這個元素的那一則 story 的 Toast —— 頁上每則 story 各有一份 <Toaster>
  let within = anchor ? document.querySelector(anchor) : document
  while (anchor && within && !within.querySelector(TOAST_EL)) within = within.parentElement
  const toastEl = within ? [...within.querySelectorAll(TOAST_EL)].at(-1) : null
  const ol = toastEl?.closest('[data-sonner-toaster]')
  let probe = ol?.parentElement?.querySelector(`:scope > [${PROBE_ATTR}]`)
  if (ol && !probe) {
    probe = document.createElement('div')
    probe.setAttribute(PROBE_ATTR, '')
    probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none'
    ol.parentElement.insertBefore(probe, ol)
  }
  // 範圍 = 同時含這份清單與一個代理面板 / 入口鈕的最近祖先(docs 頁上有十幾則 story,只看這一則的)
  let scope = ol?.parentElement ?? null
  while (scope && !(scope.querySelector(PANEL) || scope.querySelector(FAB))) scope = scope.parentElement
  const panel = scope?.querySelector(PANEL) ?? null
  const ta = panel?.querySelector('textarea[aria-label="訊息"]')
  let prompt = ta ?? null
  while (prompt && !prompt.querySelector('[aria-label="新增附件"]')) prompt = prompt.parentElement
  const fab = scope?.querySelector(FAB) ?? null
  const shell = fab?.closest('[data-placement]')
  const cs = ol ? getComputedStyle(ol) : null
  const props = (prefix) => (cs ? ['top', 'right', 'bottom', 'left'].map((k) => cs.getPropertyValue(`--${prefix}-${k}`).trim()) : null)
  return {
    vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight,
    toast: box(toastEl), frame: probe ? (({ left, top, right, bottom }) => ({ left, top, right, bottom }))(probe.getBoundingClientRect()) : null,
    offsets: props('offset'), mobileOffsets: props('mobile-offset'), xy: ol ? `${ol.getAttribute('data-y-position')}-${ol.getAttribute('data-x-position')}` : null,
    inlineLeft: ol?.style.left ?? null,
    panel: panel && getComputedStyle(panel).display !== 'none' ? box(panel) : null,
    panelMode: panel?.getAttribute('data-agent-panel-mode') ?? null,
    prompt: box(prompt), fab: box(fab), fabPlacement: shell?.getAttribute('data-placement') ?? null,
  }
}, { PANEL, FAB, TOAST_EL, PROBE_ATTR, anchor })
const area = (a, b) => (a && b ? Math.round(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))) : 0)
const near = (a, b) => Math.abs(a - b) <= 0.5
const fmt = (b) => (b ? `[${Math.round(b.left)},${Math.round(b.top)} – ${Math.round(b.right)},${Math.round(b.bottom)}]` : 'null')

/** 核心斷言:Toast 離包含塊右 / 下 = sonner 預設;清單的落點自訂屬性全是預設、沒有行內 left */
function assertDefault(m, label, { frameIsViewport = true } = {}) {
  if (!m.toast || !m.frame) throw new Error(`沒量到 Toast 或包含塊(toast=${fmt(m.toast)} frame=${fmt(m.frame)})`)
  const right = m.frame.right - m.toast.right
  const bottom = m.frame.bottom - m.toast.bottom
  if (frameIsViewport) rec(near(m.frame.left, 0) && near(m.frame.top, 0) && near(m.frame.right, m.vw) && near(m.frame.bottom, m.vh), `${label}:包含塊 = 視窗`, `${fmt(m.frame)} 視窗 ${m.vw}×${m.vh}`)
  rec(m.xy === 'bottom-right', `${label}:前提 —— 清單是 DS 預設角落 bottom-right`, m.xy)
  rec(near(right, BASE) && near(bottom, BASE), `${label}:Toast 離包含塊右 / 下各 ${BASE}(sonner 預設)`, `右 ${right.toFixed(1)} 下 ${bottom.toFixed(1)} Toast ${fmt(m.toast)} 包含塊 ${fmt(m.frame)}`)
  rec(JSON.stringify(m.offsets) === JSON.stringify(Array(4).fill(`${BASE}px`)) && JSON.stringify(m.mobileOffsets) === JSON.stringify(Array(4).fill(`${MOBILE_BASE}px`)) && !m.inlineLeft,
    `${label}:清單的 --offset-* 全是 ${BASE}px、--mobile-offset-* 全是 ${MOBILE_BASE}px、沒有行內 left(什麼都沒傳)`, `${JSON.stringify(m.offsets)} ${JSON.stringify(m.mobileOffsets)} left=${JSON.stringify(m.inlineLeft)}`)
}
/** 只供報告:甲 = 疊在上面是刻意的,不判定 */
const report = (m) => console.log(`  · ${current} 報告(不判定):Toast ${fmt(m.toast)};與面板相交 ${area(m.toast, m.panel)}px²、與輸入盒 ${area(m.toast, m.prompt)}px²、與入口鈕 ${area(m.toast, m.fab)}px²`)

/** 新增任務 → 打標題 → 儲存 → 等「任務已建立」 */
async function createTask(title) {
  await page.click('#demo-new-task')
  await page.waitForSelector('#demo-task-title')
  await page.click('#demo-task-title')
  await page.keyboard.type(title)
  await page.click('#demo-task-save')
  await waitToast('任務已建立')
}
/** 面板關著、等入口鈕回到家且版面靜止 */
async function closePanel() {
  await page.click('button[aria-label="關閉面板"]')
  await page.waitForSelector(FAB)
  await settle()
}

// ── N 沒有代理 ─────────────────────────────────────────────────────────
await scenario('N', TOAST, 'button', async () => {
  await page.getByRole('button', { name: '儲存專案' }).click()
  await waitToast('專案已儲存')
  assertDefault(await measure(), '沒有代理')
})

// ── D / O 代理並排 → 浮層 ───────────────────────────────────────────────
await scenario('D', DEMO, PANEL, async () => {
  await createTask('補 QA 環境資訊')
  const m = await measure()
  rec(m.panelMode === 'side-by-side' && !!m.panel, '前提:代理並排開著', `mode=${m.panelMode}`)
  assertDefault(m, '代理並排')
  report(m)

  current = 'O'
  await page.setViewportSize({ width: 900, height: 900 })
  await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-agent-panel-mode') === 'overlay', PANEL, { timeout: 10_000, polling: 'raf' })
  await settle()
  const o = await measure()
  rec(o.panelMode === 'overlay' && !!o.panel, '前提:畫布放不下舞台最小 600 + 面板最小 360,代理浮層', `mode=${o.panelMode}`)
  assertDefault(o, '代理浮層')
  report(o)
})

// ── F 入口鈕在家 ───────────────────────────────────────────────────────
await scenario('F', DEMO, PANEL, async () => {
  await closePanel()
  await createTask('補 QA 環境資訊')
  const m = await measure()
  rec(m.fabPlacement === 'home' && !!m.fab, '前提:面板關著、入口鈕在家', `placement=${m.fabPlacement}`)
  assertDefault(m, '入口鈕在家')
  report(m)
})

// ── S 入口鈕貼邊 ───────────────────────────────────────────────────────
await scenario('S', DEMO, PANEL, async () => {
  await page.click('button[aria-label="關閉面板"]')
  await page.waitForSelector(FAB)
  await page.locator(FAB).first().focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction((sel) => document.querySelector(sel)?.closest('[data-placement]')?.getAttribute('data-placement') === 'dock', FAB, { timeout: 10_000, polling: 'raf' })
  await settle()
  await createTask('補 QA 環境資訊')
  const m = await measure()
  rec(m.fabPlacement === 'dock', '前提:入口鈕貼邊', `placement=${m.fabPlacement}`)
  assertDefault(m, '入口鈕貼邊')
  report(m)
})

// ── K 頁面捲動(入口鈕在家、跟著內容捲)──────────────────────────────────
await scenario('K', DEMO, PANEL, async () => {
  await closePanel()
  // 讓整頁可捲:story 根之後補一段空白(舞台跟著頁面捲的 app;入口鈕住在捲動的內容裡,Toast 清單的包含塊仍是視窗)
  await page.evaluate(() => { const pad = document.createElement('div'); pad.setAttribute('data-gate-scroll-pad', ''); pad.style.height = '600px'; document.body.append(pad) })
  await settle()
  await createTask('補 QA 環境資訊')
  const before = await measure()
  // 捲 60:入口鈕上移 60,正好爬進 Toast 的位置 —— 會跟著重量的落點在這裡一定會動
  await page.evaluate(() => window.scrollBy(0, 60))
  await settle()
  const m = await measure()
  rec(before.fab && m.fab && near(before.fab.top - m.fab.top, 60), '前提:捲 60 後入口鈕在畫面上上移 60', `${before.fab?.top} → ${m.fab?.top}`)
  rec(m.fabPlacement === 'home', '前提:入口鈕在家', `placement=${m.fabPlacement}`)
  assertDefault(m, '頁面捲動後')
  report(m)
})

// ── P docs 頁:包含塊是 story 外框(Storybook 的 transform),Toast 落在外框角落 ─────────
{
  current = 'P'
  await page.setViewportSize(VIEWPORT)
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(DOCS)}&viewMode=docs`
  let opened = false
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForDocsRender(page, { docsId: DOCS, timeoutMs: 60_000, settleFrames: 10, url, notFound: server.notFound, label: 'AgentPanel 展示 docs 頁' })
    await page.waitForSelector('#demo-new-task', { state: 'attached', timeout: 30_000 })
    opened = true
  } catch (error) {
    console.log(`✗ 情境 P:${error.message.split('\n')[0]}`)
    instrumentFails.push({ scenario: 'P', detail: error.detail ?? error.message.split('\n')[0] })
  }
  if (opened) {
    if (SELFTEST) await page.evaluate(STAGE_PLACEMENT, { PANEL, FAB, PROBE_ATTR, BASE, MOBILE_BASE })
    try {
      // 網址註冊表示意是 docs 頁上唯一的行內 #demo-new-task;用 DOM 的 click / 原生 value setter:docs 頁上同時有十幾則 story,
      // Playwright 的可操作性判定會被別則的浮層擋住,而這裡要驗的是落點,不是點擊路徑(點擊路徑由 D 情境與 agent-url-registry-demo 閘負責)。
      const button = page.locator('#demo-new-task').first()
      await button.evaluate((b) => b.scrollIntoView({ block: 'center' }))
      await settle()
      await button.evaluate((b) => b.click())
      await page.waitForSelector('#demo-task-title')
      await page.locator('#demo-task-title').first().evaluate((input) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '補 QA 環境資訊')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await page.locator('#demo-task-save').first().evaluate((b) => b.click())
      await page.waitForFunction(({ sel, text }) => [...document.querySelectorAll(sel)].some((el) => (el.textContent ?? '').includes(text)), { sel: TOAST_EL, text: '任務已建立' }, { timeout: 10_000, polling: 'raf' })
      const toastEl = page.locator(TOAST_EL).last()
      await toastEl.evaluate((t) => t.scrollIntoView({ block: 'nearest' }))
      const tb = await toastEl.boundingBox()
      if (tb) await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
      await settle()
      const m = await measure('#demo-new-task')
      rec(m.panelMode === 'side-by-side' && !!m.panel, '前提:這則示意的代理並排開著', `mode=${m.panelMode}`)
      rec(!!m.frame && !(near(m.frame.left, 0) && near(m.frame.right, m.vw)), '前提:這份清單的包含塊是 story 外框,不是視窗(docs 頁才量得到的那一格)', `包含塊 ${fmt(m.frame)} 視窗寬 ${m.vw}`)
      assertDefault(m, 'docs 頁', { frameIsViewport: false })
      report(m)
    } catch (error) {
      console.log(`✗ 情境 P 沒量到:${error.message.split('\n')[0]}`)
      instrumentFails.push({ scenario: 'P', detail: error.message.split('\n')[0] })
    }
  }
}

await browser.close()
await server.stop()
if (instrumentFails.length) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 個情境沒量到 —— 不是產品裁決,但這次不能宣稱 Toast 以視窗為準${SELFTEST ? ',也不能宣稱對照組紅得對' : ''}:`)
  for (const f of instrumentFails) console.log(`  · 情境 ${f.scenario}:${f.detail}`)
}
if (SELFTEST) {
  // 注入 a6976432 的舞台落點:有佔用的情境必紅、沒有佔用的情境必綠(注入的確是那個行為,不是隨便推一下)
  const MUST_RED = ['D', 'F', 'K', 'P']
  const MUST_GREEN = ['N', 'O', 'S']
  const caught = MUST_RED.filter((s) => (redBy[s] ?? 0) > 0)
  const stray = MUST_GREEN.filter((s) => (redBy[s] ?? 0) > 0)
  const ok = staticRed === 0 && caught.length === MUST_RED.length && stray.length === 0 && instrumentFails.length === 0
  console.log(ok
    ? `✓ selftest:靜態對照組各紅在指定的那一條;注入 a6976432 的舞台落點後 ${MUST_RED.join(' / ')} 都紅、${MUST_GREEN.join(' / ')} 維持綠 —— 量具有效`
    : `✗ selftest:對照組沒被抓到(靜態 ${staticRed ? `${staticRed} 條沒紅在該紅的地方` : '有效'};紅的情境 ${caught.join(' / ') || '無'},該紅 ${MUST_RED.join(' / ')};不該紅卻紅 ${stray.join(' / ') || '無'})`)
  process.exit(ok ? 0 : 1)
}
const red = failed > 0 || instrumentFails.length > 0
console.log(red ? `✗ toast-viewport-placement ${failed} 條失敗、${instrumentFails.length} 個情境沒量到` : '✅ toast-viewport-placement PASS(Toast 一律以整個視窗為準:沒有代理 / 並排 / 蓋板 / 入口鈕在家 / 貼邊 / 捲動 / docs 頁都離包含塊右、下各 sonner 預設邊距;DS 原始碼沒有任何地方算或傳 Toast 落點)')
process.exit(red ? 1 : 0)
