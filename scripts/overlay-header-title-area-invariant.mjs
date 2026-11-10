#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 浮層標題區(SurfaceHeader)照 `patterns/overlay-surface/overlay-surface.spec.md`「SurfaceHeader」的結構:
 *         (1) **×** 固定在 header 頂部、佔位 = 標題一行高 —— × 中線離 header 內容區上緣 = 標題行高 / 2;
 *             沒有小標時 × 中線 = 標題中線;小標、說明出現與否 × 都不移動(同一種浮層有無小標,× 離頂相同)。
 *         (2) **小標**(SurfaceEyebrow):12px / 500 / 與 `text-fg-secondary` 同色、一行、下緣到標題上緣 2px。
 *         量的是 getBoundingClientRect 與 computed style 的數字(M32),不讀 class;標準 / 寬鬆兩種密度都量。
 *   紅: 任一處差超過容許值 → 指名「哪一則、哪一種情境、哪一項、差多少」並 exit 1。
 *       例:2026-11-10 修前(main 8eb473c7)決策卡「1 / 3」到題目 0px(應 2)。
 *       該量到的東西少於下限 = 儀器失效(INSTRUMENT-FAIL),exit 1,不讀成通過。
 *       `--selftest` 四種對照組:(a) 判定函式吃實測數字(修前 0 / 修後 2 / OV-ga02 修前 × 在兩行正中 +11.5)必紅 / 必綠;
 *       (b) 頁面上把標題區打回置中(header 與 × 都 align center)→ 有小標或說明的情境 × 必紅、只有標題的照舊綠;
 *       (c) 小標下距歸零 → 每個小標必紅、× 不受牽連;(d) 每顆 × 往下推 3px → 每一處 × 必紅且位移 = 3(±0.25)。
 *   綠: 全部在容許值內、每一則都量到下限以上。
 *
 * 出處(逐字與時間住 overlay-surface.spec.md「SurfaceHeader」標題區):user 2026-10-29T08:36:00Z 反問(× 不該因可選的一行而移動,只取方向)、
 *       2026-10-29T09:03:42Z 提案(小標 12px / 500 / fg-secondary、距標題 2px、一行;問句,AI 採用)、2026-11-06「照你建議」(說明位置乙)。
 * Run: `node scripts/overlay-header-title-area-invariant.mjs [--static=dir] [--selftest] [--json=out]`
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  INSTRUMENT_FAIL_MARKER,
  openStory,
  StoryRenderInstrumentError,
  launchBrowserOrSkip,
  requireFreshStorybookBuild,
} from './lib/launch-browser.mjs'

const ROOT = process.cwd()
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const staticArg = arg('static')
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(ROOT, staticArg)) : join(ROOT, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const DENSITIES = ['md', 'lg']
const JSON_OUT = arg('json')
const TOL_X = 1 // px:× 中線
const TOL_GAP = 0.5 // px:小標下緣 → 標題上緣

// min = 每種密度至少量到幾個(少了 = 儀器失效)
const TARGETS = [
  // 決策卡三題步進:第一題有小標「1 / 3」
  { id: 'design-system-components-agentpanel-展示--decision-card-open', min: { 'x-slot': 1, 'eyebrow-gap': 1, 'eyebrow-type': 1 } },
  // 決策卡單題:沒有小標
  { id: 'design-system-components-agentpanel-展示--decision-card-single', min: { 'x-slot': 1, 'x-title': 1 } },
  // test-only 夾具:Modal 層級(標題 16)只有標題 / + 說明 / + 小標;非 modal 層級(標題 14)只有標題 / + 小標
  { id: 'design-system-internal-patterns-overlay-surface--header-title-area', min: { 'x-slot': 5, 'x-title': 3, 'eyebrow-gap': 2, 'eyebrow-type': 2, 'x-same': 2 } },
]
const KIND_NAME = {
  'x-slot': '× 離 header 頂(應 = 標題行高 / 2)',
  'x-title': '× 中線 − 標題中線(沒有小標時)',
  'x-same': '× 離頂:有小標 − 只有標題(同一層級)',
  'eyebrow-gap': '小標下緣 → 標題上緣(應 2)',
  'eyebrow-type': '小標字樣(12 / 500 / fg-secondary / 一行)',
}

// ── 判定(純函式;selftest (a) 直接吃實測數字)──
function judgeProbe(p) {
  if (p.kind === 'eyebrow-gap') {
    const ok = Math.abs(p.value - 2) <= TOL_GAP
    return { ok, why: `${p.value.toFixed(2)}px(應 2 ± ${TOL_GAP})` }
  }
  if (p.kind === 'eyebrow-type') {
    const bad = []
    if (p.fontSize !== 12) bad.push(`字級 ${p.fontSize}`)
    if (p.fontWeight !== 500) bad.push(`字重 ${p.fontWeight}`)
    if (!p.colorMatch) bad.push(`顏色 ${p.color} ≠ fg-secondary ${p.expectColor}`)
    if (p.lines > 1.05) bad.push(`行數 ${p.lines.toFixed(2)}`)
    return { ok: bad.length === 0, why: bad.length ? bad.join(' / ') : '12 / 500 / fg-secondary / 一行' }
  }
  const ok = Math.abs(p.value) <= TOL_X
  return { ok, why: `${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}px(容許 ±${TOL_X})` }
}

// ── 頁面量測(瀏覽器內執行)──
function measurePage({ sabotage }) {
  const out = []
  const errors = []
  const probe = document.createElement('span')
  probe.className = 'text-fg-secondary'
  probe.textContent = 'x'
  document.body.appendChild(probe)
  const expectColor = getComputedStyle(probe).color
  probe.remove()
  const density = document.documentElement.getAttribute('data-density') ?? document.body.getAttribute('data-density')
  const headers = [...document.querySelectorAll('[data-slot="surface-header"]')]
  const perTier = {}
  for (const h of headers) {
    const caseName = h.closest('[data-case]')?.getAttribute('data-case') ?? 'decision-card'
    const tier = h.closest('[data-tier]')?.getAttribute('data-tier') ?? 'decision-card'
    const x = [...h.querySelectorAll('button')].at(-1) // × 永遠最右
    const title = h.querySelector('[data-header-part="title"]') ?? h.querySelector('span[id]')
    if (!x || !title) { errors.push(`${caseName}:找不到 × 或標題`); continue }
    if (sabotage === 'shift') x.style.translate = '0 3px'
    const eyebrow = h.querySelector('[data-slot="surface-eyebrow"]')
      ?? [...h.querySelectorAll('span')].find((s) => !s.querySelector('span') && /^\d+ \/ \d+$/.test(s.textContent.trim()))
    const hr = h.getBoundingClientRect()
    const hcs = getComputedStyle(h)
    const contentTop = hr.top + parseFloat(hcs.borderTopWidth) + parseFloat(hcs.paddingTop)
    const tr = title.getBoundingClientRect()
    const tLH = parseFloat(getComputedStyle(title).lineHeight)
    const xr = x.getBoundingClientRect()
    const xC = xr.top + xr.height / 2
    const round = (n) => Math.round(n * 100) / 100
    const xFromTop = round(xC - contentTop)
    out.push({ kind: 'x-slot', case: caseName, value: round(xFromTop - tLH / 2), raw: xFromTop })
    ;(perTier[tier] ??= {})[eyebrow ? 'eyebrow' : 'plain'] = xFromTop
    if (!eyebrow) out.push({ kind: 'x-title', case: caseName, value: round(xC - (tr.top + tLH / 2)) })
    if (eyebrow) {
      const er = eyebrow.getBoundingClientRect()
      const ecs = getComputedStyle(eyebrow)
      out.push({ kind: 'eyebrow-gap', case: caseName, value: round(tr.top - er.bottom) })
      out.push({
        kind: 'eyebrow-type', case: caseName,
        fontSize: parseFloat(ecs.fontSize), fontWeight: Number(ecs.fontWeight),
        color: ecs.color, expectColor, colorMatch: ecs.color === expectColor,
        lines: er.height / parseFloat(ecs.lineHeight),
      })
    }
  }
  for (const [tier, v] of Object.entries(perTier)) {
    if (v.eyebrow != null && v.plain != null) out.push({ kind: 'x-same', case: `${tier}:有小標 vs 只有標題`, value: Math.round((v.eyebrow - v.plain) * 100) / 100 })
  }
  return { out, errors, density }
}

async function runPages(page, sv, sabotage) {
  const rows = []
  const instrument = []
  for (const density of DENSITIES) for (const t of TARGETS) {
    const kinds = Object.keys(t.min)
    const url = `${sv.origin}/iframe.html?id=${encodeURIComponent(t.id)}&viewMode=story&globals=${encodeURIComponent(`density:${density}`)}`
    let res
    try {
      res = await openStory(page, url, {
        settleFrames: 10,
        notFound: sv.notFound,
        // 等「要量的那個東西本身」出現(M32 第四題),不靠固定睡眠
        waitFor: () => [...document.querySelectorAll('[data-slot="surface-header"]')].some((h) => h.querySelector('button')),
        beforeSettle: sabotage?.css ? async (p) => { await p.addStyleTag({ content: sabotage.css }) } : null,
        probe: measurePage,
        probeArg: { sabotage: sabotage?.page ?? null },
      })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      instrument.push(`${t.id}(${density}):${error.message}`)
      continue
    }
    const m = res.probe
    for (const e of m.errors) instrument.push(`${t.id}(${density}):${e}`)
    for (const kind of kinds) {
      const n = m.out.filter((p) => p.kind === kind).length
      if (n < t.min[kind]) instrument.push(`${t.id}(${density}):${KIND_NAME[kind]} 只量到 ${n} 個(下限 ${t.min[kind]})`)
    }
    for (const p of m.out) {
      const j = judgeProbe(p)
      rows.push({ ...p, story: t.id, density, ok: j.ok, why: j.why, label: `${t.id.split('--')[1]} / ${p.case} / ${density} / ${KIND_NAME[p.kind]}` })
    }
  }
  return { rows, instrument }
}

// ── selftest (a):判定函式吃實測數字 ──
const JUDGE_TABLE = [
  ['決策卡小標距題目(修前 main 8eb473c7 實測 0)', { kind: 'eyebrow-gap', value: 0 }, false],
  ['小標距標題 2(規格)', { kind: 'eyebrow-gap', value: 2 }, true],
  ['小標距標題 4(Carbon 值,非本 DS)', { kind: 'eyebrow-gap', value: 4 }, false],
  ['小標字重 400(Carbon 值,非本 DS)', { kind: 'eyebrow-type', fontSize: 12, fontWeight: 400, colorMatch: true, lines: 1 }, false],
  ['小標換成兩行', { kind: 'eyebrow-type', fontSize: 12, fontWeight: 500, colorMatch: true, lines: 2 }, false],
  ['小標字樣正確', { kind: 'eyebrow-type', fontSize: 12, fontWeight: 500, colorMatch: true, lines: 1 }, true],
  ['Dialog 有說明時 × 在兩行正中(OV-ga02 修前 +11.5)', { kind: 'x-title', value: 11.5 }, false],
  ['決策卡有小標時 × 改對齊小標行(n7 D2-B,上移 2.7)', { kind: 'x-same', value: -2.71 }, false],
  ['× 固定頂部(現況 0)', { kind: 'x-slot', value: 0 }, true],
]

// ── selftest (b)(c)(d):頁面破壞 ──
const PAGE_SABOTAGE = [
  ['標題區打回置中(header 與 × 都 align center)', {
    css: '[data-slot="surface-header"]{align-items:center!important}[data-slot="surface-header"]>*{align-self:center!important}',
  }, (res, base) => {
    // 有小標 / 說明的情境(左欄比 × 槽高)× 必紅;只有標題的照舊綠
    const tall = (r) => /eyebrow|description|decision-card-open/.test(`${r.case}|${r.story}`)
    const xs = res.rows.filter((r) => r.kind === 'x-slot')
    return xs.some((r) => tall(r)) && xs.every((r) => (tall(r) ? !r.ok : r.ok))
  }],
  ['小標下距歸零', { css: '[data-slot="surface-eyebrow"]{margin-bottom:0!important}' },
    (res) => res.rows.filter((r) => r.kind === 'eyebrow-gap').length > 0
      && res.rows.every((r) => (r.kind === 'eyebrow-gap' ? !r.ok && Math.abs(r.value) <= 0.25 : r.ok))],
  ['每顆 × 往下推 3px', { page: 'shift' }, (res, base) => {
    const xs = res.rows.filter((r) => r.kind === 'x-slot' || r.kind === 'x-title')
    const bx = base.rows.filter((r) => r.kind === 'x-slot' || r.kind === 'x-title')
    return xs.length > 0 && xs.length === bx.length && xs.every((r, i) => !r.ok && Math.abs(r.value - bx[i].value - 3) <= 0.25)
  }],
]

const problems = []
if (SELFTEST) {
  for (const [name, p, expectOk] of JUDGE_TABLE) {
    const j = judgeProbe(p)
    if (j.ok === expectOk) console.log(`✓ 對照組 (a):${name} → ${expectOk ? '綠' : '紅'}(${j.why})`)
    else problems.push(`對照組 (a):${name} 應${expectOk ? '綠' : '紅'},實得 ${j.ok ? '綠' : '紅'}(${j.why})`)
  }
}

requireFreshStorybookBuild(S, [
  'packages/design-system/src/patterns/overlay-surface/overlay-surface.tsx',
  'packages/design-system/src/patterns/overlay-surface/overlay-surface.stories.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel.stories.tsx',
  'packages/design-system/src/tokens/layoutSpace/layoutSpace.css',
])
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const br = await launchBrowserOrSkip({}, { cleanup: () => sv.stop() })
const page = await br.newPage({ viewport: { width: 1280, height: 900 } })
const finish = async (code) => { await br.close(); await sv.stop(); process.exit(code) }

const base = await runPages(page, sv, null)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(base.rows, null, 1))
if (!SELFTEST) {
  for (const r of base.rows) console.log(`${r.ok ? '✓' : '✗'} ${r.label}:${r.why}`)
  const bad = base.rows.filter((r) => !r.ok)
  if (bad.length) problems.push(`${bad.length} 處標題區幾何不符:\n    ${bad.map((r) => `${r.label}:${r.why}`).join('\n    ')}`)
}
if (base.instrument.length) {
  console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}(沒量到 ≠ 沒有錯):\n  ${base.instrument.join('\n  ')}`)
  if (problems.length) console.log(`\n✗ 浮層標題區:\n  ${problems.join('\n  ')}`)
  await finish(1)
}
if (SELFTEST) {
  const baseBad = base.rows.filter((r) => !r.ok)
  if (baseBad.length) problems.push(`前提不成立:未破壞的頁面就有 ${baseBad.length} 處不符(${baseBad[0].label}:${baseBad[0].why})`)
  for (const [name, sabotage, isRed] of PAGE_SABOTAGE) {
    const run = await runPages(page, sv, sabotage)
    if (run.instrument.length) { console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}(對照組「${name}」):\n  ${run.instrument.join('\n  ')}`); await finish(1) }
    const red = run.rows.filter((r) => !r.ok)
    if (isRed(run, base)) console.log(`✓ 對照組「${name}」→ ${red.length} / ${run.rows.length} 處紅${red[0] ? `(例:${red[0].label}:${red[0].why})` : ''}`)
    else problems.push(`對照組「${name}」沒有讓指定的量測紅(紅 ${red.length} / ${run.rows.length})—— 量具無效;`
      + `${run.rows.slice(0, 12).map((r) => `${r.ok ? '綠' : '紅'} ${r.label}:${r.why}`).join(' / ')}`)
  }
}
if (problems.length) {
  console.log(`\n✗ ${SELFTEST ? 'selftest' : '浮層標題區'}:\n  ${problems.join('\n  ')}`)
  await finish(1)
}
console.log(SELFTEST
  ? '\n✓ selftest:判定表、打回置中、小標下距歸零、× 下移 3px 四種對照組各自讓閘紅 —— 量具會紅'
  : `\n✅ 浮層標題區:${TARGETS.length} 則 story × ${DENSITIES.length} 種密度,共 ${base.rows.length} 項全部在容許值內`)
await finish(0)
