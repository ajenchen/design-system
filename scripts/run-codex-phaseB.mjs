#!/usr/bin/env node
/**
 * run-codex-phaseB.mjs — deep-audit-cross-codex Phase B 完整 driver(dual-model 對等覆蓋)。
 *
 * 為何存在:Phase B 需 codex 對「Claude Phase A 已跑的全 64 元件」做獨立 claim-vs-code 對抗稽核。
 *   codex 已覆蓋 6(Tooltip/HoverCard/Popover/Accordion/Alert/AppShell);本 driver 掃剩餘 58,
 *   **順序**跑(禁 4× 平行冗餘 — 2026-07-11 教訓),每批 3 元件過 gen-codex-a1b-brief 7-invariant 閘,
 *   codex-run-guarded fail-loud 分類。RAW findings 落 .claude/logs/codex-phaseB/<Component>.json,
 *   之後由 Claude reconcile(adjudicate material vs pedantic,對照 claude-a1b-deep)。
 *
 * 特性:resumable(已有 output 的元件 skip)/ 每批 fail-soft(EMPTY→拆 1 元件重試→仍 EMPTY skip+log)。
 * 用法:node scripts/run-codex-phaseB.mjs   (背景跑;讀 state .claude/logs/codex-phaseB/_state.json)
 */
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, '.claude/logs/codex-phaseB')
mkdirSync(OUT, { recursive: true })
const STATE = join(OUT, '_state.json')
const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); try { writeFileSync(join(OUT, '_driver.log'), line + '\n', { flag: 'a' }) } catch {} }

// codex 已覆蓋(prior batches) — skip
const DONE = new Set(['Tooltip', 'HoverCard', 'Popover', 'Accordion', 'Alert', 'AppShell'])

// 剩餘 58,priority-order:complex overlays/pickers/data/chrome 先(material 產出最高)→ medium → leaf
const ORDER = [
  // complex (highest material yield)
  'Dialog', 'Sheet', 'DropdownMenu', 'Menu', 'Select', 'Combobox', 'PeoplePicker', 'SelectMenu', 'Command',
  'DataTable', 'DatePicker', 'DateGrid', 'Calendar', 'TimePicker', 'Sidebar', 'Field', 'TreeView',
  'Coachmark', 'Carousel', 'FileViewer', 'FileUpload', 'InlineEdit',
  // medium
  'Avatar', 'Badge', 'Breadcrumb', 'BulkActionBar', 'Button', 'Checkbox', 'Chip', 'NumberInput', 'Input',
  'Textarea', 'LinkInput', 'RadioGroup', 'SegmentedControl', 'SelectionControl', 'Slider', 'Switch', 'Steps',
  'Tabs', 'Pagination', 'ProfileCard', 'OverflowIndicator', 'FieldControlGroup', 'FileItem', 'Toast',
  // leaf / visual (lowest yield)
  'AspectRatio', 'Chart', 'CircularProgress', 'DescriptionList', 'Empty', 'Notice', 'ProgressBar', 'Rating',
  'ScrollArea', 'Separator', 'Skeleton', 'Tag',
]

const remaining = ORDER.filter((c) => !DONE.has(c) && !existsSync(join(OUT, `${c}.json`)))
log(`Phase B driver start — ${remaining.length} components remaining (of ${ORDER.length}), MAX reasoning, 40-min/component, sequential best-first`)

// 1 component per run(max reasoning 需完整時間窗;3-comp batch 會被單一 timeout 連坐 + 易 EMPTY)
const batches = []
for (let i = 0; i < remaining.length; i += 1) batches.push(remaining.slice(i, i + 1))

// extract findings JSON blocks from codex last-message text
function parseFindings(txt) {
  const out = {}
  const re = /\{[^{}]*?"component"\s*:\s*"(\w+)"[\s\S]*?"falseClaims"\s*:\s*(\[[\s\S]*?\])\s*\}/g
  let m
  while ((m = re.exec(txt))) {
    try {
      // try to parse the whole object
      const objStr = m[0]
      const o = JSON.parse(objStr)
      if (o.component) out[o.component] = o
    } catch {
      // fallback: store raw
      out[m[1]] = { component: m[1], _rawUnparsed: m[0].slice(0, 4000) }
    }
  }
  return out
}

function runBatch(comps) {
  const briefPath = `/tmp/codex-pb-brief-${comps.join('-')}.md`
  const outPath = `/tmp/codex-pb-out-${comps.join('-')}.txt`
  // gen brief
  try {
    const brief = execSync(`node scripts/gen-codex-a1b-brief.mjs ${comps.join(' ')}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    writeFileSync(briefPath, brief)
  } catch (e) { log(`  ✗ brief-gen fail ${comps.join(',')}: ${e.message}`); return null }
  // run guarded codex (inherit strongest model; no --effort downgrade per freshness canonical)
  // 40-min window: max reasoning 讀 wrapped-lib source 驗每句宣稱,複雜元件 >15min(2026-07-11 timeout 教訓)
  const r = spawnSync('node', ['scripts/codex-run-guarded.mjs', '--brief', briefPath, '--out', outPath, '--log', `${outPath}.log`], { cwd: ROOT, encoding: 'utf8', timeout: 40 * 60 * 1000 })
  const outcome = (r.stdout || '') + (r.stderr || '')
  // 額度耗盡 → 立刻 halt 整個 driver(不再 hammer 燒 user 額度),寫 marker 讓 Claude 通知 user
  // 精準比對 guard 自己的 context-aware 分類標記(非裸 regex,避免 codex 內容含 "insufficient"/"429" 誤判)
  if (/CODEX-OUTCOME:\s*QUOTA/i.test(outcome)) {
    log(`  🛑 QUOTA/rate-limit detected on ${comps.join(',')} — HALTING driver to protect quota`)
    writeFileSync(join(OUT, '_QUOTA_HALT.json'), JSON.stringify({ ts: new Date().toISOString(), haltedAt: comps.join(','), outcome: outcome.slice(0, 500) }, null, 1))
    process.exit(3)
  }
  if (r.status !== 0) { log(`  ⚠ ${comps.join(',')} guard exit=${r.status}: ${outcome.split('\n').find((l) => l.includes('OUTCOME')) || outcome.slice(0, 120)}`); return { failed: true, outcome } }
  const txt = existsSync(outPath) ? readFileSync(outPath, 'utf8') : ''
  const findings = parseFindings(txt)
  return { findings, txt }
}

for (const batch of batches) {
  log(`── batch: ${batch.join(' / ')}`)
  let res = runBatch(batch)
  if (!res || res.failed) {
    // EMPTY/fail → retry each component solo
    log(`  retry solo (batch failed/empty)`)
    for (const c of batch) {
      if (existsSync(join(OUT, `${c}.json`))) continue
      const solo = runBatch([c])
      if (solo && solo.findings && solo.findings[c]) {
        writeFileSync(join(OUT, `${c}.json`), JSON.stringify(solo.findings[c], null, 1))
        log(`    ✓ ${c}: ${(solo.findings[c].falseClaims || []).length} findings (solo)`)
      } else { log(`    ✗ ${c}: EMPTY/unparseable even solo — SKIP (logged)`); writeFileSync(join(OUT, `${c}.SKIP.json`), JSON.stringify({ component: c, skipped: true, reason: 'codex EMPTY/unparseable' }, null, 1)) }
    }
    continue
  }
  for (const c of batch) {
    if (res.findings[c]) {
      writeFileSync(join(OUT, `${c}.json`), JSON.stringify(res.findings[c], null, 1))
      log(`  ✓ ${c}: ${(res.findings[c].falseClaims || []).length} findings`)
    } else {
      // component missing from batch output — retry solo
      const solo = runBatch([c])
      if (solo && solo.findings && solo.findings[c]) { writeFileSync(join(OUT, `${c}.json`), JSON.stringify(solo.findings[c], null, 1)); log(`  ✓ ${c}: ${(solo.findings[c].falseClaims || []).length} findings (solo)`) }
      else { writeFileSync(join(OUT, `${c}.SKIP.json`), JSON.stringify({ component: c, skipped: true }, null, 1)); log(`  ✗ ${c}: missing from batch + solo EMPTY — SKIP`) }
    }
  }
  writeFileSync(STATE, JSON.stringify({ ts: new Date().toISOString(), done: readdirSync(OUT).filter((f) => f.endsWith('.json') && !f.startsWith('_')).length }, null, 1))
}

const finalDone = readdirSync(OUT).filter((f) => f.endsWith('.json') && !f.startsWith('_') && !f.endsWith('.SKIP.json'))
const skipped = readdirSync(OUT).filter((f) => f.endsWith('.SKIP.json'))
log(`✅ Phase B driver DONE — ${finalDone.length} components collected, ${skipped.length} skipped`)
