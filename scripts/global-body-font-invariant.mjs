#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 整頁預設字級只有一個住處,而且就是 `text-body`(`packages/design-system/src/tokens/typography/typography.spec.md`「整頁預設字級」);
 *         浮層經 Portal 掛到 body 底下,沒自己設字級的內文吃到它,外殼不另設(`patterns/overlay-surface/overlay-surface.spec.md`「SurfaceBody」)。
 *         兩層:
 *         (1) 靜態 —— S1 `styles/base.css` 的 `body` 規則恰好一條宣告 font-size,值逐字 = `var(--font-body-size)`;
 *             S2 那條規則的 line-height 逐字 = `typography.css` 的 `@utility text-body` 的 line-height,且 text-body 的字級也是 `var(--font-body-size)`
 *             (兩邊是同一份 token);S3 repo 內其他 CSS 不得在 `html` / `:root` / `:host` / `body` 上宣告 font-size 或 font 簡寫(第二個住處)。
 *         (2) 瀏覽器(storybook-static,本機靜態站)—— B0 body 的 computed font-size = `--font-body-size` = 14px、行高 21px;
 *             B1 浮層裡「繼承整頁預設」的可見文字(把 body 暫時改 20px 時跟著變的那些)在原樣下都是 14px / 21px,整趟至少量到 1 段;
 *             B2 每個浮層外殼(Tooltip 除外)與 SurfaceBody / DialogBody / SheetBody 內層在 body 改 20px 時跟著變 20px(= 沒有自己設字級);
 *             使用端自己在 Body 上加 `text-*` 的那一層不量(允許的寫法)。
 *   紅: 任一條不符 → 指名哪一條、哪一則 story、量到多少,exit 1。2026-11-24 修前(72c99de0)base.css 的 body 沒有 font-size → S1 紅;
 *       瀏覽器量到 body 16px、Tooltip 範例對話框內文 `<p>` 16px / 24px → B0、B1 紅。
 *       該開的浮層沒開出來、該量的東西一個都沒量到 = 儀器失效(INSTRUMENT-FAIL),exit 1,不讀成通過。
 *       `--selftest` 對照組(每一個都必須被抓到,抓到 = exit 0):靜態吃改壞的 CSS 文字 —— 拿掉 font-size / 改成 `--font-body-lg-size` /
 *       行高改 1.3 / 另一份 CSS 在 html 設字級,各自只紅 S1 / S1 / S2 / S3;瀏覽器在頁面注入 `body{font-size:medium}`(= 原樣重放修前:瀏覽器預設 16px)
 *       → B0、B1 必紅;注入「浮層外殼自己設 `var(--font-body-size)`」→ B2 必紅、B1 照綠(數字仍是 14,只有 A/B 分得出它不是繼承來的)。
 *   綠: 三條靜態全過、每一則都開得出浮層、B0 / B1 / B2 全過且 B1 至少量到 1 段繼承來的內文。
 *
 * 出處:user 2026-11-24 選「照全域做 (Recommended)」並說「確定是世界級的設計就照你建議」(決策與逐字在 typography.spec.md「整頁預設字級」依據)。
 * Run: `node scripts/global-body-font-invariant.mjs [--static=storybook-static] [--selftest]`
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  INSTRUMENT_FAIL_MARKER,
  launchBrowserOrSkip,
  openStory,
  requireFreshStorybookBuild,
  settleAfterInteraction,
  StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'

const ROOT = process.cwd()
const SELFTEST = process.argv.includes('--selftest')
const STATIC = resolve(ROOT, process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length) ?? 'storybook-static')

const BASE_CSS = 'packages/design-system/src/styles/base.css'
const TYPOGRAPHY_CSS = 'packages/design-system/src/tokens/typography/typography.css'
/** typography.spec.md Token 表 `text-body` 那一列(14px / 1.5)。token 改值時規格、這裡、帳本一起改。 */
const EXPECT_FONT_PX = 14
const EXPECT_LINE_PX = 21
/** B1 / B2 量「繼承」用的 A/B 字級:任何一個不會跟 DS 字級撞的值 */
const PROBE_PX = 20
const NO_INHERITED = 'B1 一段繼承整頁預設的浮層內文都沒量到 —— 等於沒驗(範例都改成自帶字級了?換一則有沒帶 class 內文的浮層範例)'

// ── 靜態 ────────────────────────────────────────────────────────────────

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** 最內層的 `selector { declarations }`(巢在 @layer / @media 裡的也取得到;@utility 之類的 at-rule 本身也算一條,selector 欄是 `@utility text-body`)。 */
function cssRules(css) {
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(stripComments(css)))) {
    const declarations = {}
    for (const part of m[2].split(';')) {
      const i = part.indexOf(':')
      if (i < 0) continue
      const prop = part.slice(0, i).trim().toLowerCase()
      if (prop) declarations[prop] = part.slice(i + 1).trim()
    }
    out.push({ selector: m[1].trim().replace(/\s+/g, ' '), declarations })
  }
  return out
}

const ROOT_SELECTORS = new Set(['html', ':root', ':host', 'body'])
const setsFontSize = (decl) => 'font-size' in decl || 'font' in decl

/**
 * 純判定(對照組直接餵假 CSS)。
 * @param {{ base: string, typography: string, others: Array<{ path: string, css: string }> }} input
 * @returns {string[]} 問題清單(空 = 綠);每條以 S1 / S2 / S3 開頭
 */
function staticProblems({ base, typography, others }) {
  const problems = []
  const bodyRules = cssRules(base).filter((r) => r.selector === 'body')
  const sized = bodyRules.filter((r) => setsFontSize(r.declarations))
  if (sized.length !== 1) {
    problems.push(`S1 ${BASE_CSS} 的 body 規則宣告字級的應恰好 1 條,實得 ${sized.length} 條(整頁預設字級的唯一住處)`)
  } else {
    const d = sized[0].declarations
    if ('font' in d) problems.push(`S1 ${BASE_CSS} 的 body 用了 font 簡寫(${d.font});字級要寫成 font-size: var(--font-body-size)`)
    if (d['font-size'] !== 'var(--font-body-size)') problems.push(`S1 ${BASE_CSS} 的 body font-size 應為 var(--font-body-size),實得 ${d['font-size'] ?? '(沒寫)'}`)
  }
  const textBody = cssRules(typography).find((r) => r.selector === '@utility text-body')
  if (!textBody) {
    problems.push(`S2 ${TYPOGRAPHY_CSS} 找不到 @utility text-body —— 比對對象不存在,閘自己要跟著改`)
  } else {
    if (textBody.declarations['font-size'] !== 'var(--font-body-size)') problems.push(`S2 text-body 的字級不是 var(--font-body-size)(實得 ${textBody.declarations['font-size']}),整頁預設與 text-body 已不是同一份 token`)
    const want = textBody.declarations['line-height']
    const got = sized[0]?.declarations['line-height'] ?? bodyRules.map((r) => r.declarations['line-height']).find(Boolean)
    if (got !== want) problems.push(`S2 ${BASE_CSS} 的 body line-height 應與 @utility text-body 相同(${want}),實得 ${got ?? '(沒寫)'}`)
  }
  for (const { path, css } of others) {
    for (const r of cssRules(css)) {
      const roots = r.selector.split(',').map((s) => s.trim()).filter((s) => ROOT_SELECTORS.has(s))
      if (roots.length && setsFontSize(r.declarations)) {
        problems.push(`S3 ${path} 在 ${roots.join(', ')} 上宣告了字級(${r.declarations['font-size'] ?? r.declarations.font})—— 整頁預設字級只住 ${BASE_CSS} 的 body`)
      }
    }
  }
  return problems
}

function readStaticInput() {
  const listed = execFileSync('git', ['ls-files', '-z', '--', '*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean)
  const others = listed
    .filter((p) => p !== BASE_CSS && !/(^|\/)(node_modules|dist|storybook-static)\//.test(p))
    .map((path) => ({ path, css: readFileSync(join(ROOT, path), 'utf8') }))
  return { base: readFileSync(join(ROOT, BASE_CSS), 'utf8'), typography: readFileSync(join(ROOT, TYPOGRAPHY_CSS), 'utf8'), others }
}

// ── 瀏覽器 ──────────────────────────────────────────────────────────────

/**
 * 量測的 story(浮層類型各至少一則;`open` = 要點開的觸發鈕文字,null = story 預設開著)。
 * 兩則點開的是真實範例:對話框內文是沒帶 class 的文字(`<p>` / 直接放在 DialogBody 的字),修前量到 16px。
 */
const CASES = Object.freeze([
  { story: 'design-system-components-popover-展示--open-snapshot', open: null },
  { story: 'design-system-components-dialog-展示--open-snapshot', open: null },
  { story: 'design-system-components-sheet-展示--open-snapshot', open: null },
  { story: 'design-system-components-tooltip-設計原則--usage-guidance', open: '刪除帳號' },
  { story: 'design-system-components-appshell-設計規格--state-behavior', open: '結束 Sprint 42' },
])

/** 頁面內量測:浮層外殼、Body 容器、可見文字;`probePx` 給了就先把 body 改成那個字級再量。 */
const PROBE = ({ probePx }) => {
  if (probePx) document.body.style.fontSize = `${probePx}px`
  const m = (el) => { const c = getComputedStyle(el); return { fs: c.fontSize, lh: c.lineHeight } }
  const outside = (el) => !el.closest('#storybook-root') && !el.closest('#storybook-docs')
  // 只給讀屏的標籤(sr-only:1×1、clip)看不見,不算內文(例:cmdk 清單的「狀態選項」)
  const clipped = (el) => {
    for (let a = el, i = 0; a && i < 6; a = a.parentElement, i += 1) {
      const c = getComputedStyle(a)
      if ((c.clip && c.clip !== 'auto') || /inset\(50%/.test(c.clipPath || '')) return true
      const r = a.getBoundingClientRect()
      if (r.width <= 1 && r.height <= 1 && c.overflow !== 'visible') return true
    }
    return false
  }
  // Tooltip 不算(泡泡本身就是那段文字,自帶 text-body;overlay-surface.spec.md「SurfaceBody」)
  const shells = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper] > *')]
    .filter((el) => outside(el) && el.getBoundingClientRect().width > 40 && !el.matches('[role="tooltip"]') && !el.querySelector('[role="tooltip"]'))
  const containers = []
  for (const shell of shells) {
    containers.push({ part: `外殼 ${shell.getAttribute('role') ?? shell.tagName.toLowerCase()}`, ...m(shell) })
    for (const body of shell.querySelectorAll('[data-slot="surface-body"], [data-dialog-body] [data-layout-body], [data-sheet-body] [data-layout-body]')) {
      // 使用端在 Body 上自己加字級 class(`<SheetBody className="text-body">`)是允許的寫法,不算外殼另設
      if (/(^|\s)text-(body|body-lg|caption|footnote|h[1-6])(\s|$)/.test(body.className)) continue
      containers.push({ part: body.matches('[data-slot="surface-body"]') ? 'SurfaceBody' : 'Body 內層', ...m(body) })
    }
  }
  const texts = []
  for (const shell of shells) {
    const walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim()
      const el = n.parentElement
      if (!t || !el || (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const r = range.getBoundingClientRect()
      if (r.width < 2 || r.height < 2 || clipped(el)) continue
      texts.push({ text: t.slice(0, 40), ...m(el) })
    }
  }
  const body = m(document.body)
  const token = getComputedStyle(document.documentElement).getPropertyValue('--font-body-size').trim()
  if (probePx) document.body.style.fontSize = ''
  return { shells: shells.length, containers, texts, body, token }
}

/** 純判定:原樣與 A/B 兩次量測 → 問題清單(對照組與正式判定共用)。 */
function browserProblems(story, asBuilt, probed) {
  const problems = []
  const px = (v) => Number.parseFloat(v)
  if (asBuilt.token !== `${EXPECT_FONT_PX}px`) problems.push(`B0 ${story}:--font-body-size = ${asBuilt.token || '(讀不到)'},應為 ${EXPECT_FONT_PX}px`)
  if (px(asBuilt.body.fs) !== EXPECT_FONT_PX || px(asBuilt.body.lh) !== EXPECT_LINE_PX) {
    problems.push(`B0 ${story}:body 量到 ${asBuilt.body.fs} / ${asBuilt.body.lh},應為 ${EXPECT_FONT_PX}px / ${EXPECT_LINE_PX}px`)
  }
  let inherited = 0
  asBuilt.texts.forEach((t, i) => {
    const p = probed.texts[i]
    if (!p || p.text !== t.text || px(p.fs) !== PROBE_PX) return // 自己設了字級的文字(A/B 不跟著變)不歸本閘管
    inherited += 1
    if (px(t.fs) !== EXPECT_FONT_PX || px(t.lh) !== EXPECT_LINE_PX) problems.push(`B1 ${story}:浮層內文「${t.text}」量到 ${t.fs} / ${t.lh},應為 ${EXPECT_FONT_PX}px / ${EXPECT_LINE_PX}px(繼承整頁預設)`)
  })
  asBuilt.containers.forEach((c, i) => {
    const p = probed.containers[i]
    if (p && px(p.fs) !== PROBE_PX) problems.push(`B2 ${story}:${c.part} 自己設了字級(body 改 ${PROBE_PX}px 時它仍是 ${p.fs})—— 外殼不另設,整頁預設只有一個住處`)
  })
  return { problems, inherited }
}

async function measureCase(page, server, { story, open }, inject) {
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(story)}&viewMode=story`
  await openStory(page, url, { settleFrames: 5, notFound: server.notFound, timeoutMs: 30_000, navigationTimeoutMs: 30_000 })
  if (inject) await page.addStyleTag({ content: inject })
  if (open) {
    const trigger = page.locator('#storybook-root [aria-haspopup="dialog"]', { hasText: open }).first()
    if ((await trigger.count()) === 0) throw new Error(`找不到觸發鈕「${open}」(範例改了 → 更新本閘 CASES)`)
    await trigger.click({ timeout: 10_000 })
  }
  await page.waitForSelector('[role="dialog"], [data-radix-popper-content-wrapper] > *', { state: 'visible', timeout: 10_000 })
  const settled = await settleAfterInteraction(page, { frames: 8 })
  if (settled && settled.ok === false) throw new Error('浮層開出來後版面沒有靜止')
  const asBuilt = await page.evaluate(PROBE, { probePx: 0 })
  const probed = await page.evaluate(PROBE, { probePx: PROBE_PX })
  if (asBuilt.shells === 0) throw new Error('頁面上沒有浮層外殼')
  return browserProblems(story, asBuilt, probed)
}

async function runBrowser(cases, inject) {
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  const problems = []
  const instrument = []
  let inherited = 0
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    for (const c of cases) {
      try {
        const r = await measureCase(page, server, c, inject)
        problems.push(...r.problems)
        inherited += r.inherited
      } catch (error) {
        const why = error instanceof StoryRenderInstrumentError ? `${error.kind}:${String(error.message).split('\n')[0]}` : String(error?.message || error).split('\n')[0]
        instrument.push(`${c.story}:${why}`)
      }
    }
  } finally {
    await browser.close()
    await server.stop()
  }
  return { problems, instrument, inherited }
}

// ── 主流程 ──────────────────────────────────────────────────────────────

const input = readStaticInput()

if (SELFTEST) {
  const failures = []
  const expect = (name, problems, want, notWant = []) => {
    const codes = new Set(problems.map((p) => p.slice(0, 2)))
    const ok = want.every((c) => codes.has(c)) && notWant.every((c) => !codes.has(c))
    console.log(`${ok ? '✓' : '✗'} 對照組「${name}」:預期 ${want.join(' + ')} 紅${notWant.length ? `、${notWant.join(' / ')} 不紅` : ''},實得 ${[...codes].join(' + ') || '全綠'}`)
    if (!ok) failures.push(name)
  }
  const real = staticProblems(input)
  if (real.length) { console.error(`✗ 對照組的前提不成立:現況靜態判定就是紅的\n  ${real.join('\n  ')}`); process.exit(1) }
  const bodyLine = 'font-size: var(--font-body-size);'
  if (!input.base.includes(bodyLine)) { console.error(`✗ 對照組找不到要改壞的那一行「${bodyLine}」—— 閘自己要跟著改`); process.exit(1) }
  expect('拿掉 body 字級(修前)', staticProblems({ ...input, base: input.base.replace(bodyLine, '') }), ['S1'], ['S2', 'S3'])
  expect('body 字級改成 body-lg', staticProblems({ ...input, base: input.base.replace(bodyLine, 'font-size: var(--font-body-lg-size);') }), ['S1'], ['S2', 'S3'])
  expect('body 行高改 1.3', staticProblems({ ...input, base: input.base.replace('line-height: 1.5;', 'line-height: 1.3;') }), ['S2'], ['S1', 'S3'])
  expect('另一份 CSS 在 html 設字級', staticProblems({ ...input, others: [...input.others, { path: 'selftest/other.css', css: 'html, body { font-size: 15px; }' }] }), ['S3'], ['S1', 'S2'])
  expect('只出現在註解裡的 html 字級', staticProblems({ ...input, others: [...input.others, { path: 'selftest/comment.css', css: '/* html { font-size: 15px } */' }] }), [], ['S1', 'S2', 'S3'])

  requireFreshStorybookBuild(STATIC, [BASE_CSS, TYPOGRAPHY_CSS])
  const pick = (story) => CASES.filter((c) => c.story === story)
  const replay = await runBrowser([...pick('design-system-components-tooltip-設計原則--usage-guidance'), ...pick('design-system-components-popover-展示--open-snapshot')], 'body { font-size: medium; }')
  const shellSelf = await runBrowser(pick('design-system-components-popover-展示--open-snapshot').concat(pick('design-system-components-tooltip-設計原則--usage-guidance')),
    '[role="dialog"], [data-radix-popper-content-wrapper] > * { font-size: var(--font-body-size); }')
  for (const [name, run] of [['重放修前', replay], ['外殼自己設字級', shellSelf]]) {
    if (run.instrument.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}(對照組「${name}」):\n  ${run.instrument.join('\n  ')}`); process.exit(1) }
  }
  // 重放修前那一組必須真的量到繼承來的內文,B1 的紅才有意義(外殼自己設那組本來就量不到 —— 外殼擋住了繼承)
  if (replay.inherited === 0) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}(對照組「重放修前」):${NO_INHERITED}`); process.exit(1) }
  expect('注入 body{font-size:medium}(重放修前:瀏覽器預設 16px)', replay.problems, ['B0', 'B1'])
  expect('浮層外殼自己設 var(--font-body-size)', shellSelf.problems, ['B2'], ['B0', 'B1'])
  if (failures.length) { console.error(`\n✗ selftest:${failures.length} 個對照組沒有照預期紅 / 綠 —— 量具抓不到該抓的(假綠)`); process.exit(1) }
  console.log('\n✓ selftest:每個對照組都照預期紅 / 綠')
  process.exit(0)
}

const problems = staticProblems(input)
requireFreshStorybookBuild(STATIC, [BASE_CSS, TYPOGRAPHY_CSS])
const run = await runBrowser(CASES, null)
if (!run.instrument.length && run.inherited === 0) run.instrument.push(NO_INHERITED)
if (run.instrument.length) {
  console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}(沒量到 ≠ 沒有錯):\n  ${run.instrument.join('\n  ')}`)
  process.exit(1)
}
problems.push(...run.problems)
if (problems.length) {
  console.log(`\n✗ 整頁預設字級:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`✓ 整頁預設字級:靜態 S1–S3 通過(另掃 ${input.others.length} 份 CSS);瀏覽器 ${CASES.length} 則浮層 B0–B2 通過,繼承整頁預設的浮層內文 ${run.inherited} 段都是 ${EXPECT_FONT_PX}px / ${EXPECT_LINE_PX}px`)
