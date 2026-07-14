#!/usr/bin/env node
// consolidate-audit-material.mjs — 把全 deep-audit 各軌 confirmed material 併成一份 master list(2026-07-13)。
// 用途:collection+adjudication 完成後,統一 triage(autonomous fix vs SSOT-UI/UX decision)的資料源。
// 輸出 .claude/logs/master-material.json:[{src, unit, fileLine, 問題, severity:'material', fixHint}]
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LG = join(ROOT, '.claude/logs')
const glob = (dir, re) => (existsSync(join(LG, dir)) ? readdirSync(join(LG, dir)).filter((f) => re.test(f)).map((f) => join(LG, dir, f)) : [])
const rd = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }
const out = []

// 1. Claude A.1b deep(falseClaims severity=material)
for (const f of glob('claude-a1b-deep', /\.json$/)) { const d = rd(f); if (!d) continue; for (const x of d.falseClaims || []) if (x.severity === 'material') out.push({ src: 'claude-a1b', unit: d.component, fileLine: x.fileLine, 問題: x.真實code行為 || x.宣稱, severity: 'material', fixHint: x.fixHint || '' }) }
// 2. Claude A.1b pass2(materialFound)
for (const f of glob('claude-a1b-deep-pass2', /\.json$/)) { const d = rd(f); if (!d) continue; for (const x of d.materialFound || []) out.push({ src: 'claude-a1b-p2', unit: d.component, fileLine: x.fileLine, 問題: x.真實code行為, severity: 'material', fixHint: x.fixHint || '' }) }
// 3. codex A.1b reconcile(material_confirmed net-new + shared)
for (const f of glob('.', /codex-reconcile-batch\d+\.json$/)) { const d = rd(f); if (!d) continue; for (const [comp, v] of Object.entries(d)) { if (!v || typeof v !== 'object' || !v.material_confirmed) continue; for (const x of v.material_confirmed) out.push({ src: 'codex-a1b', unit: comp, fileLine: x.fileLine, 問題: x.真實code行為 || x.宣稱, severity: 'material', fixHint: x.fixHint || '', claudeAlsoCaught: !!x.claudeAlsoCaught }) } }
// 4. language quality(issues severity=material)
{ const d = rd(join(LG, 'storybook-language-findings.json')); if (d) for (const c of d.perComponent || []) for (const i of c.issues || []) if (i.severity === 'material') out.push({ src: 'language', unit: c.component, fileLine: i.fileLine, 問題: i.問題, severity: 'material', fixHint: i.建議 || '' }) }
// 5. Claude judgment dims(findings severity=material)
for (const f of glob('dim-audit', /^dim-\d+\.json$/)) { const d = rd(f); if (!d) continue; for (const x of d.findings || []) if (x.severity === 'material') out.push({ src: `claude-dim${d.dim}`, unit: `dim${d.dim}`, fileLine: x.fileLine, 問題: x.問題, severity: 'material', fixHint: x.建議 || '' }) }
// 6. codex judgment reconcile(裁定 material_confirmed — 讀 per-dim reconcile detail)
for (const f of glob('codex-judgment-reconcile', /^dim-\d+\.json$/)) { const d = rd(f); if (!d) continue; const arr = d.verdicts || d.findings || d.material_confirmed || []; for (const x of Array.isArray(arr) ? arr : []) { const v = x.verdict || x.severity; if (v === 'material_confirmed' || v === 'material') out.push({ src: `codex-dim${d.dim || '?'}`, unit: `dim${d.dim || '?'}`, fileLine: x.fileLine, 問題: x.問題 || x.真實code行為 || x.desc, severity: 'material', fixHint: x.fixHint || x.建議 || '' }) } }
// 7. hook residue(findings)
for (const f of glob('hook-residue', /^dim-\d+\.json$/)) { const d = rd(f); if (!d) continue; for (const x of d.findings || []) out.push({ src: `hook-dim${d.dim}`, unit: `dim${d.dim}`, fileLine: x.fileLine, 問題: x.問題, severity: x.severity || 'material', fixHint: x.建議 || '' }) }

writeFileSync(join(LG, 'master-material.json'), JSON.stringify(out, null, 1) + '\n')
const bySrc = {}
for (const m of out) { const k = m.src.replace(/dim\d+/, 'dim'); bySrc[k] = (bySrc[k] || 0) + 1 }
console.log(`master-material.json: ${out.length} entries`)
console.log('by source:', JSON.stringify(bySrc))
