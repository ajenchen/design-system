#!/usr/bin/env node
// field-size-regression-diff.mjs — Q2 架構改動前後視覺回歸(2026-06-08)
//
// Q2(size 經 surface context 自動流給 Field controls)預期對所有現有 composition Δ=0
// (prop 永遠最高優先;surface-size 只在「cell 漏傳 size」時才觸發,現況無此情形)。
// 本 script 截 baseline(改動前 storybook-static)vs after(改動後重建)同一批 story,pixelmatch
// 比對 → 任何非-AA-noise 差異 = 改壞了,印出 diff PNG 供人 review + exit 1。
//
// 用法:node scripts/field-size-regression-diff.mjs --baseline=storybook-static-baseline --after=storybook-static
// 覆蓋:9 Field 控件(input/numberinput/textarea/select/combobox/datepicker/timepicker/peoplepicker/linkinput)
//       的 overview/size-matrix/state-behavior/mode-matrix + DataTable overview/inspector/column-types。

import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import {
  ensureRuntimeEvidenceDirectory,
  ensureRuntimeEvidenceRoot,
  prepareRuntimeEvidenceFile,
} from './lib/governance-runtime-evidence.mjs'

const arg = (k, d) => { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? m.split('=')[1] : d }
const BASELINE = arg('baseline', 'storybook-static-baseline')
const AFTER = arg('after', 'storybook-static')
const OUT_ARG = arg('out', null)
const ROOT = process.cwd()
const OUT = OUT_ARG
  ? ensureRuntimeEvidenceRoot({ repoRoot: ROOT, explicitRoot: OUT_ARG })
  : ensureRuntimeEvidenceDirectory({ repoRoot: ROOT, relativePath: 'visual/q2-field-size' })
const PCT_BUDGET = parseFloat(arg('budget', '0.02'))  // % 像素差預算(吸收 rebuild AA noise);真 font 改動遠超此

for (const d of [BASELINE, AFTER]) if (!existsSync(join(d, 'index.json'))) { console.error(`✗ ${d}/index.json 不存在(先 build-storybook)`); process.exit(2) }
const evidenceFile = (relativePath) => prepareRuntimeEvidenceFile({ repoRoot: ROOT, explicitRoot: OUT, relativePath })

const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf' }
function serve(dir, port) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
    const fp = join(dir, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
  })
  return new Promise(r => srv.listen(port, () => r(srv)))
}

// ── story id 動態抓(不寫死 CJK tier 名)──
const idx = JSON.parse(readFileSync(join(AFTER, 'index.json'), 'utf8'))
const entries = Object.values(idx.entries || idx.stories || {})
const CONTROLS = ['input','numberinput','textarea','select','combobox','datepicker','timepicker','peoplepicker','linkinput','segmentedcontrol','rating','button','checkbox','switch','radiogroup','slider','avatar']
const TYPES = ['overview','size-matrix','state-behavior','mode-matrix','inspector','column-types']
const STORY_IDS = entries
  .filter(e => e.type === 'story' && (
    ((CONTROLS.some(c => e.id.startsWith(`design-system-components-${c}-`)) || e.id.startsWith('design-system-components-datatable-')) &&
      TYPES.some(t => e.id.endsWith('--' + t)))
    // Field 元件 stories(<Field size> cascade 構圖最可能受 B 組 fix 影響 → 全納入回歸)
    || e.id.startsWith('design-system-components-field-')
  ))
  .map(e => e.id).sort()
// baseline 也要有同 id(rename 防漏)
const baseIdx = JSON.parse(readFileSync(join(BASELINE, 'index.json'), 'utf8'))
const baseIds = new Set(Object.values(baseIdx.entries || baseIdx.stories || {}).map(e => e.id))
const onlyAfter = STORY_IDS.filter(id => !baseIds.has(id))
if (onlyAfter.length) console.warn(`⚠️  ${onlyAfter.length} story 只在 after 有(新增,跳過 diff):`, onlyAfter.join(', '))
const DIFF_IDS = STORY_IDS.filter(id => baseIds.has(id))

const srvB = await serve(BASELINE, 8821)
const srvA = await serve(AFTER, 8822)
const browser = await chromium.launch({ headless: true })

async function shot(port, id) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const interactive = /inspector|state-behavior/.test(id)
  await page.goto(`http://localhost:${port}/iframe.html?id=${id}&viewMode=story&globals=theme:light;density:md`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(interactive ? 1200 : 500)
  if (!interactive) { try { await page.evaluate(() => (document.activeElement)?.blur?.()) } catch {} }
  const buf = await page.screenshot({ fullPage: true })
  await page.close()
  return PNG.sync.read(buf)
}

const fails = []
const results = []
for (const id of DIFF_IDS) {
  let b, a
  try { b = await shot(8821, id); a = await shot(8822, id) } catch (e) { fails.push(`${id}: shot 失敗 ${e.message.split('\n')[0]}`); continue }
  if (b.width !== a.width || b.height !== a.height) {
    fails.push(`${id}: 尺寸不同 baseline ${b.width}x${b.height} vs after ${a.width}x${a.height}`)
    results.push({ id, verdict: 'DIM-MISMATCH', baseline: `${b.width}x${b.height}`, after: `${a.width}x${a.height}` })
    continue
  }
  const diff = new PNG({ width: b.width, height: b.height })
  const diffPx = pixelmatch(b.data, a.data, diff.data, b.width, b.height, { threshold: 0.1, includeAA: false })
  const total = b.width * b.height
  const pct = (diffPx / total) * 100
  const ok = pct <= PCT_BUDGET
  results.push({ id, diffPx, pct: +pct.toFixed(4), verdict: ok ? 'OK' : 'CHANGED' })
  if (!ok) {
    fails.push(`${id}: diff ${diffPx}px (${pct.toFixed(4)}%) > 預算 ${PCT_BUDGET}%`)
    writeFileSync(evidenceFile(id.replace(/[^a-z0-9-]/gi, '_') + '.diff.png'), PNG.sync.write(diff))
    writeFileSync(evidenceFile(id.replace(/[^a-z0-9-]/gi, '_') + '.after.png'), PNG.sync.write(a))
  }
}

await browser.close(); srvB.close(); srvA.close()
writeFileSync(evidenceFile('report.json'), JSON.stringify({ baseline: BASELINE, after: AFTER, budget: PCT_BUDGET, results }, null, 2) + '\n')

console.log(`\n=== Q2 field-size 視覺回歸(${DIFF_IDS.length} stories,預算 ${PCT_BUDGET}%)===`)
for (const r of results) console.log(`  ${r.verdict === 'OK' ? '✓' : '✗'} ${r.id}  ${r.verdict}${r.diffPx != null ? ` (${r.diffPx}px / ${r.pct}%)` : ''}`)
if (fails.length) { console.error(`\n✗ ${fails.length} story 有非預期視覺差異(diff PNG 在 ${OUT}):\n  ${fails.join('\n  ')}`); process.exit(1) }
console.log(`\n✓ 全 ${DIFF_IDS.length} stories Δ≈0(≤ ${PCT_BUDGET}% AA noise budget)— Q2 架構改動視覺零回歸。`)
process.exit(0)
