#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 不在 AppShell 裡、單獨使用的 Sidebar,按開關(SidebarTrigger)真的收起來 —— `collapsible="icon"` 收起後外框寬 = `--sidebar-width-icon`、
 *         細列上第一個選單項點得到(不 inert、不 aria-hidden、命中測試打得到它);`collapsible="offcanvas"` 收起後外框寬 0、裡面的選單項 inert +
 *         aria-hidden(看不到的不留在 Tab 順序);再按一次回到 `--sidebar-width`、選單項可操作。量的是**寬度本身**與**點得到**,不讀 class(M37)。
 *         另有靜態段:全 DS 的 `.tsx` / `.ts` 沒有任何元素在自己身上同時帶 `group` 與 `group-*` 變體、或 `peer` 與 `peer-*` 變體
 *         (Tailwind 的 `group-*` 編譯成後代選擇器、`peer-*` 編譯成兄弟選擇器,都比不到自己 → 靜默失效;2026-10-14 Sidebar 收合寬就是這樣失效的)。
 *         一個元素的 class 來源 = `className=` 屬性與 `cn(` / `clsx(` / `twMerge(` / `cva(` 的引數(TypeScript 語法樹;疊加變體、具名 group 都算)。
 *   紅: 任一則 story 收起後寬度不符、細列選單項點不到、offcanvas 收起後選單項仍可聚焦、展開後選單項不可操作,或靜態段找到違規 → exit 1。
 *       `--selftest` 兩種對照組:(a) 靜態:把 2026-10-14 那段 Sidebar 寫法(逐字)與同一陷阱的 8 種其他寫法(cva / cn 變數 / peer / 疊加變體 /
 *           具名 group / clsx / 樣板字串;2026-10-20 r1b 複核 D5)餵給掃描器都必須被抓到,6 種乾淨寫法不得誤報;
 *       (b) 頁面:注入 CSS 把收起的外框寬釘回 `--sidebar-width`(= 2026-10-14 的實際症狀)每一則都必須紅;
 *           注入腳本拿掉寬 0 那一份的 inert,offcanvas 那則必須紅。story 開不起來 = 儀器失效,點名 story、exit 1。
 *   綠: 六則 story 收起 / 展開兩步都符合、靜態段 0 違規時綠。寬度比到 0.75px(瀏覽器以小數 px 排版)。
 *
 * 出處:2026-10-15 r1b 複驗 F1(P0)—— 單獨使用的 Sidebar `icon` / `offcanvas` 收起後外框仍 240(main 是 48 / 0),offcanvas 還把看得到的選單設 inert +
 * aria-hidden(看得到、點不到、讀不到)。根因:sidebar.tsx 把 `group-data-[collapsible=…]:!w-…` 寫在帶 `group` 的那個元素自己身上。
 * 那天 test:app-shell-layout / test:sidebar-menu-keyboard 全綠 —— 沒有任何閘量「單獨使用時收起後的寬」。規則:sidebar.spec.md「Collapsible」。
 *
 * Run: `node scripts/sidebar-standalone-collapse-invariant.mjs [--static=<dir>] [--selftest]`(預設讀 `storybook-static`)
 */
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  openStory,
  StoryRenderInstrumentError,
  launchBrowserOrSkip,
  requireFreshStorybookBuild,
  settleAfterInteraction,
} from './lib/launch-browser.mjs'

const ROOT = process.cwd()
const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(ROOT, staticArg)) : join(ROOT, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const TOL = 0.75
const SETTLE_FRAMES = 10

// ── 靜態段:元素自己帶 `group`(或 `peer`)又在自己身上用 `group-*`(或 `peer-*`)變體 ──
// 一個元素的 class 來源 = JSX `className="…"` / `className={…}`,以及 `cn(` / `clsx(` / `twMerge(` / `cva(` 的引數
// (cva 的 base 與各 variant 都套在同一個元素上;`const c = cn(…)` 存成變數再給 className 也照樣抓)。
// 用 TypeScript 語法樹找區段(註解天然不算;`className={cn(…)}` 裡的 cn 已被外層區段涵蓋、不重算),區段裡的字串字面量合起來看。
// 2026-10-20 r1b 複核 D5:第一版只看 `className=` 屬性、只認 `group-` 開頭的單一變體 —— cva / cn 變數、`peer` + `peer-*`、
// 疊加變體(`md:group-hover:`)都漏(M7 / M34:閘的廣度要對齊規則的廣度,tailwind-gotchas 寫的是「全 DS」)。
const CLASS_CALLS = new Set(['cn', 'clsx', 'twMerge', 'cva'])
/** class 字串切成變體段 + 本體(冒號在 `[…]` / `(…)` 裡不算分隔) */
function splitVariants(token) {
  const parts = []
  let depth = 0, cur = ''
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth += 1
    else if (ch === ']' || ch === ')') depth -= 1
    if (ch === ':' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  parts.push(cur)
  return parts
}
/** 變體段是不是 group-* / peer-*;回 { kind, name }(name = 具名 group 的名字,沒有 = '') */
function relationalVariant(v) {
  const m = /^(group|peer)-(.+)$/.exec(v)
  if (!m) return null
  // 具名:結尾 `/<name>`,而且那個斜線不在 `[…]` 裡(`group-hover/item`、`group-data-[state=open]/menu`)
  let depth = 0, slash = -1
  for (let i = 0; i < m[2].length; i += 1) {
    const ch = m[2][i]
    if (ch === '[' || ch === '(') depth += 1
    else if (ch === ']' || ch === ')') depth -= 1
    else if (ch === '/' && depth === 0) slash = i
  }
  return { kind: m[1], name: slash >= 0 ? m[2].slice(slash + 1) : '' }
}
/** 一個區段裡的 class 字串(物件的 key 不算,例如 cva 的 variant 名) */
function classStrings(node) {
  const out = []
  const visit = (n) => {
    if (ts.isPropertyAssignment(n)) { visit(n.initializer); return }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text)
    else if (ts.isTemplateExpression(n)) { out.push(n.head.text); for (const sp of n.templateSpans) { visit(sp.expression); out.push(sp.literal.text) } return }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}
export function selfGroupVariantSites(src, fileName = 'snippet.tsx') {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, fileName.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX)
  const regions = []
  const visit = (n) => {
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'className' && n.initializer) { regions.push(n.initializer); return }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && CLASS_CALLS.has(n.expression.text)) { regions.push(n); return }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  const hits = []
  for (const region of regions) {
    const tokens = classStrings(region).flatMap((x) => x.split(/\s+/)).filter(Boolean)
    // 這個元素自己是哪些 group / peer(`group`、`group/menu-item`、`peer`、`peer/name`)
    const markers = new Set(tokens.map((t) => /^(group|peer)(?:\/([\w-]+))?$/.exec(t)).filter(Boolean).map((x) => `${x[1]}/${x[2] ?? ''}`))
    if (!markers.size) continue
    const bad = tokens.filter((t) => splitVariants(t.replace(/^!/, '')).slice(0, -1).some((v) => { const r = relationalVariant(v); return !!r && markers.has(`${r.kind}/${r.name}`) }))
    if (bad.length) hits.push({ line: sf.getLineAndCharacterOfPosition(region.getStart(sf)).line + 1, tokens: [...[...markers].map((k) => k.replace(/\/$/, '')), ...bad] })
  }
  return hits
}
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n === 'storybook-static') continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (n.endsWith('.tsx') || (n.endsWith('.ts') && !n.endsWith('.d.ts'))) acc.push(p)
  }
  return acc
}
function staticScan() {
  const files = walk(join(ROOT, 'packages/design-system/src'))
  const bad = []
  for (const f of files) for (const h of selfGroupVariantSites(readFileSync(f, 'utf8'), f)) bad.push(`${relative(ROOT, f)}:${h.line} ${h.tokens.join(' ')}`)
  return { files: files.length, bad }
}

// 2026-10-14 那段寫法(sidebar.tsx Sidebar 外框,逐字取自 be2f1324)—— 對照組 (a)
const PRE_FIX_SNIPPET = `        <div
          ref={ref}
          className={cn(
            "group peer relative shrink-0 text-foreground",
            // 單獨使用:寬度走 token(展開 \`--sidebar-width\`、細列 \`--sidebar-width-icon\`、offcanvas 0);在 AppShell 裡由 style 給
            !inShell && [
              "w-[var(--sidebar-width)]",
              "group-data-[collapsible=offcanvas]:!w-0",
              "group-data-[collapsible=icon]:!w-[var(--sidebar-width-icon)]",
            ],
            panel?.resizing ? "transition-none" : "transition-[width] duration-200 ease-linear motion-reduce:duration-0"
          )}
        >`
// 同一種陷阱的其他寫法(2026-10-20 r1b 複核 D5 抓到第一版全部漏掉)—— 每一種都必須被抓到
const RED_SNIPPETS = [
  ['cva 的 base 自己帶 group + group-*', `const v = cva("group relative group-data-[collapsible=icon]:!w-0", { variants: {} })\nconst X = () => <div className={v()} />`],
  ['cva 的 base 帶 group、variant 裡寫 group-*(同一個元素)', `const v = cva("group relative", { variants: { size: { sm: "group-hover:bg-muted" } } })`],
  ['cn 先存成變數再給 className', `const cls = cn("group peer", "group-data-[state=open]:w-0")\nconst X = () => <div className={cls} />`],
  ['peer + peer-* 寫在自己身上(兄弟選擇器,同樣比不到自己)', `const X = () => <input className="peer peer-checked:bg-primary" />`],
  ['疊加變體(md:group-hover:)', `const X = () => <div className={cn("group", "md:group-hover:opacity-100")} />`],
  ['具名 group 配同名變體', `const X = () => <li className="group/item group-hover/item:bg-muted" />`],
  ['clsx + 單引號', `const X = () => <div className={clsx('peer', 'peer-focus-visible:ring-2')} />`],
  ['樣板字串', 'const X = ({ x }) => <div className={`group ${x} group-data-[open=true]:w-0`} />'],
]
const CLEAN_SNIPPETS = [
  // group 在父層、變體在子層(正確用法)
  `<div className="group peer"><span className="group-data-[collapsible=icon]:hidden" /></div>`,
  // 具名 group(group/menu-item)配不具名的變體:變體找的是祖先那個不具名的 group,不是自己
  `<li className={cn("group/menu-item relative", "group-data-[collapsible=icon]:hidden")} />`,
  // 註解裡提到不算
  `<div className={cn("group", /* group-data-[x]:w-0 */ "w-4")} />`,
  // peer 在前一個兄弟、peer-* 在後一個兄弟(正確用法)
  `<label><input className="peer sr-only" /><span className="peer-checked:bg-primary" /></label>`,
  // 具名 group 配別的名字的變體
  `<li className="group/item group-hover/menu:bg-muted" />`,
  // cva 的 variant 名剛好叫 group(物件的 key 不是 class)
  `const v = cva("relative", { variants: { group: { true: "group-hover:underline" } } })`,
]

// ── 頁面段 ──
const STORIES = [
  { id: 'design-system-components-sidebar-展示--icon-collapse', mode: 'icon' },
  { id: 'design-system-components-sidebar-展示--group-action', mode: 'icon' },
  { id: 'design-system-components-sidebar-展示--mixed-content', mode: 'icon' },
  { id: 'design-system-components-sidebar-展示--integration-sidebar', mode: 'icon' },
  { id: 'design-system-components-sidebar-展示--offcanvas', mode: 'offcanvas' },
  { id: 'design-system-components-sidebar-設計規格--state-behavior', mode: 'icon' },
]

/** 頁面端:單獨使用的 Sidebar 外框(帶 data-side / data-state、不在 AppShell 裡)與它的選單項 */
function measure() {
  const r2 = (n) => Math.round(n * 100) / 100
  const frame = [...document.querySelectorAll('[data-side][data-state]')].find((el) => !el.closest('[data-app-shell]') && el.querySelector('[data-sidebar="sidebar"]'))
  if (!frame) return { err: '找不到單獨使用的 Sidebar 外框([data-side][data-state])' }
  // token 的實際寬:在同一個 SidebarProvider 底下放探針(變數可能被 consumer 覆寫,不寫死 240 / 48)
  const host = frame.parentElement
  const probe = (v) => { const p = document.createElement('div'); p.style.cssText = `position:absolute;visibility:hidden;height:1px;width:${v}`; host.appendChild(p); const w = p.getBoundingClientRect().width; p.remove(); return r2(w) }
  const button = frame.querySelector('[data-sidebar="menu-button"]')
  const b = button?.getBoundingClientRect()
  const f = frame.getBoundingClientRect()
  // 細列只露出左側那一段:命中點取「按鈕在外框可見範圍內」的中心
  const x = b ? Math.min(b.left + 12, f.right - 2) : 0
  const y = b ? b.top + b.height / 2 : 0
  const hit = b && f.width > 1 ? document.elementFromPoint(x, y) : null
  return {
    state: frame.getAttribute('data-state'),
    collapsible: frame.getAttribute('data-collapsible'),
    width: r2(f.width),
    tokenExpanded: probe('var(--sidebar-width)'),
    tokenRail: probe('var(--sidebar-width-icon)'),
    button: button ? (button.getAttribute('aria-label') || button.textContent || '').trim().slice(0, 20) : null,
    buttonInert: !!button?.closest('[inert]'),
    buttonHidden: !!button?.closest('[aria-hidden="true"]'),
    buttonHit: !!hit && !!button && (hit === button || button.contains(hit)),
  }
}

function judge(story, step, m) {
  const near = (a, b) => Math.abs(a - b) <= TOL
  if (m.err) return [{ ok: false, label: `${story.id} ${step}`, detail: m.err }]
  const out = []
  const push = (label, ok, detail) => out.push({ ok, label: `${story.id.replace('design-system-components-sidebar-', '')} ${step}:${label}`, detail })
  if (step === '收起') {
    push('data-state = collapsed', m.state === 'collapsed', `state=${m.state}`)
    if (story.mode === 'icon') {
      push(`外框寬 = --sidebar-width-icon(${m.tokenRail})`, near(m.width, m.tokenRail), `width=${m.width}`)
      push('細列上的選單項點得到(不 inert、不 aria-hidden、命中測試打得到)', !m.buttonInert && !m.buttonHidden && m.buttonHit, JSON.stringify({ button: m.button, inert: m.buttonInert, hidden: m.buttonHidden, hit: m.buttonHit }))
    } else {
      push('外框寬 = 0', near(m.width, 0), `width=${m.width}`)
      push('寬 0 時選單項 inert + aria-hidden', m.buttonInert && m.buttonHidden, JSON.stringify({ inert: m.buttonInert, hidden: m.buttonHidden }))
    }
  } else {
    push('data-state = expanded', m.state === 'expanded', `state=${m.state}`)
    push(`外框寬 = --sidebar-width(${m.tokenExpanded})`, near(m.width, m.tokenExpanded), `width=${m.width}`)
    push('選單項可操作', !m.buttonInert && !m.buttonHidden && m.buttonHit, JSON.stringify({ inert: m.buttonInert, hidden: m.buttonHidden, hit: m.buttonHit }))
  }
  return out
}

async function runPages(page, sv, sabotage) {
  const results = []
  for (const story of STORIES) {
    try {
      await openStory(page, `${sv.origin}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, {
        settleFrames: SETTLE_FRAMES,
        notFound: sv.notFound,
        waitFor: '[data-sidebar="trigger"]',
        beforeSettle: sabotage ? async (p) => {
          if (sabotage.css) await p.addStyleTag({ content: sabotage.css })
          if (sabotage.script) await p.addScriptTag({ content: sabotage.script })
        } : null,
      })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      console.error(`\n✗ ${story.id}:${error.message}`)
      return { instrumentFail: true, results }
    }
    for (const step of ['收起', '展開']) {
      await page.click('[data-sidebar="trigger"]')
      const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
      if (!settled.ok) { results.push({ ok: false, label: `${story.id} ${step}`, detail: '等不到版面靜止(儀器失效)' }); break }
      await page.mouse.move(0, 0)
      results.push(...judge(story, step, await page.evaluate(measure)))
    }
  }
  return { instrumentFail: false, results }
}

// ── 對照組 (b):2026-10-14 的症狀與「拿掉 inert」 ──
const PAGE_SABOTAGE = [
  ['收起的外框寬釘回 --sidebar-width(2026-10-14 實際症狀)', { css: '[data-side][data-collapsible="icon"],[data-side][data-collapsible="offcanvas"]{width:var(--sidebar-width)!important}' },
    (res) => STORIES.every((s) => res.some((r) => !r.ok && r.label.startsWith(s.id.replace('design-system-components-sidebar-', '')) && /收起/.test(r.label)))],
  ['寬 0 那一份拿掉 inert', { script: `const strip = () => document.querySelectorAll('[data-side][data-collapsible="offcanvas"] [inert]').forEach((el) => el.removeAttribute('inert'))
    strip(); new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert'] })` },
    (res) => res.some((r) => !r.ok && /展示--offcanvas 收起:寬 0 時選單項 inert/.test(r.label))],
]

// ── 跑 ──
const problems = []
if (SELFTEST) {
  const pre = selfGroupVariantSites(PRE_FIX_SNIPPET)
  if (pre.length === 1) console.log(`✓ 對照組 (a):2026-10-14 的 Sidebar 寫法被抓到(${pre[0].tokens.join(' ')})`)
  else problems.push(`對照組 (a):2026-10-14 的 Sidebar 寫法沒被抓到(${pre.length} 處)—— 靜態段無效`)
  for (const [name, red] of RED_SNIPPETS) {
    const v = selfGroupVariantSites(red)
    if (v.length) console.log(`✓ 對照組 (a):${name} → 抓到(${v[0].tokens.join(' ')})`)
    else problems.push(`對照組 (a):${name} 沒被抓到 —— 靜態段的廣度不夠`)
  }
  for (const clean of CLEAN_SNIPPETS) {
    const v = selfGroupVariantSites(clean)
    if (v.length) problems.push(`靜態段誤報乾淨寫法:${clean}`)
  }
  if (!problems.length) console.log(`✓ 乾淨寫法 ${CLEAN_SNIPPETS.length} 種都不誤報`)
} else {
  const st = staticScan()
  console.log(`${st.bad.length ? '✗' : '✓'} 靜態:元素自己帶 group / peer 又用 group-* / peer-* 變體(掃 ${st.files} 檔)${st.bad.length ? '\n    ' + st.bad.join('\n    ') : ''}`)
  if (st.bad.length) problems.push(`靜態段 ${st.bad.length} 處`)
}

requireFreshStorybookBuild(S, [
  'packages/design-system/src/components/Sidebar/sidebar.tsx',
  'packages/design-system/src/components/Sidebar/sidebar.stories.tsx',
  'packages/design-system/src/components/Sidebar/sidebar.anatomy.stories.tsx',
])
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const br = await launchBrowserOrSkip({}, { cleanup: () => sv.stop() })
const page = await br.newPage({ viewport: { width: 1440, height: 900 } })

if (!SELFTEST) {
  const run = await runPages(page, sv, null)
  if (run.instrumentFail) { await br.close(); await sv.stop(); process.exit(1) }
  for (const r of run.results) console.log(`${r.ok ? '✓' : '✗'} ${r.label}${r.ok ? '' : ` | ${r.detail}`}`)
  const failed = run.results.filter((r) => !r.ok).length
  if (failed) problems.push(`頁面段 ${failed} 格不符`)
} else {
  // 前提:未破壞的頁面本身全綠(否則對照組紅了也不代表什麼)
  const base = await runPages(page, sv, null)
  if (base.instrumentFail) { await br.close(); await sv.stop(); process.exit(1) }
  const baseBad = base.results.filter((r) => !r.ok)
  if (baseBad.length) problems.push(`前提不成立:未破壞的頁面就有 ${baseBad.length} 格不符(${baseBad[0].label})`)
  for (const [name, sabotage, isRed] of PAGE_SABOTAGE) {
    const run = await runPages(page, sv, sabotage)
    if (run.instrumentFail) { await br.close(); await sv.stop(); process.exit(1) }
    if (isRed(run.results)) console.log(`✓ 對照組 (b)「${name}」→ 指定的斷言紅`)
    else problems.push(`對照組 (b)「${name}」沒讓指定的斷言紅 —— 量具無效`)
  }
}
await br.close(); await sv.stop()
if (problems.length) { console.log(`\n✗ ${SELFTEST ? 'selftest' : '單獨使用的 Sidebar 收合'}:\n  ${problems.join('\n  ')}`); process.exit(1) }
console.log(SELFTEST ? '\n✓ selftest:靜態對照組與兩種頁面破壞各自讓閘紅 —— 量具會紅' : `\n✅ 單獨使用的 Sidebar:${STORIES.length} 則 story 收起 / 展開的寬度與可操作性都符合、靜態段 0 違規`)
process.exit(0)
