#!/usr/bin/env node
/**
 * check-agents-bootstrap.mjs — PNG P1.3 bootstrap 完整性閘(2026-07-16)。
 *
 * 為何存在:PNG 架構下治理核心 = AGENTS.md(provider-neutral;Codex 原生 discovery),
 *   CLAUDE.md = `@AGENTS.md` import 薄殼(Anthropic 官方共用模式)。此結構一旦漂移
 *   (import 被刪 / AGENTS 超過 Codex 32KiB cap / Rule Index 死鏈 / 兩檔重複 normative 段)
 *   = 兩 provider 吃到不同治理 → 本 gate fail-closed。
 *
 * 斷言:
 *   A1 AGENTS.md 存在且 ≤ 32KiB(Codex project_doc_max_bytes 預設 cap)
 *   A2 CLAUDE.md 首個非空行 = `@AGENTS.md`(Claude import 完整)
 *   A3 AGENTS.md Rule Index 內引用的所有 repo 路徑存在(死鏈 = fail)
 *   A4 兩檔無重複 normative 標題(# / ## 級;Claude 段的機制說明豁免清單)
 *   A5 npm files 含 AGENTS.md + shipped mirror 與 root 同步(packages/design-system/AGENTS.md)
 *
 * 用法:node scripts/check-agents-bootstrap.mjs [--check]
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const errors = []
const A = path.join(ROOT, 'AGENTS.md')
const C = path.join(ROOT, 'CLAUDE.md')

// A1
if (!fs.existsSync(A)) errors.push('A1: AGENTS.md 不存在')
else {
  const bytes = fs.statSync(A).size
  if (bytes > 32 * 1024) errors.push(`A1: AGENTS.md ${bytes} bytes > 32KiB(Codex project_doc_max_bytes 預設 cap)— 拆分或瘦身`)
}

// A2
if (!fs.existsSync(C)) errors.push('A2: CLAUDE.md 不存在')
else {
  const first = fs.readFileSync(C, 'utf8').split('\n').find((l) => l.trim() !== '')
  if (first?.trim() !== '@AGENTS.md') errors.push(`A2: CLAUDE.md 首個非空行必須是 "@AGENTS.md"(實際:"${(first || '').slice(0, 40)}")— Claude 治理 import 斷`)
}

// A3:Rule Index + 全文 repo 路徑引用存在性(反引號內 .claude/... 與 scripts/... 路徑)
if (fs.existsSync(A)) {
  const src = fs.readFileSync(A, 'utf8')
  const paths = [...src.matchAll(/`((?:\.claude|scripts|packages)\/[^`*]+?\.(?:md|mjs|sh|json))`/g)].map((m) => m[1]).filter((p) => !p.includes('{'))
  for (const p of new Set(paths)) {
    if (!fs.existsSync(path.join(ROOT, p))) errors.push(`A3: AGENTS.md 引用不存在路徑 ${p}`)
  }
}

// A4:normative 標題重複(# 級,允許 CLAUDE.md 的 provider 機制標題)
if (fs.existsSync(A) && fs.existsSync(C)) {
  const heads = (f) => new Set(fs.readFileSync(f, 'utf8').split('\n').filter((l) => /^#{1,2} /.test(l)).map((l) => l.replace(/^#+ /, '').trim()))
  const ALLOW = new Set(['Claude Code 專屬機制層(provider adapter)'])
  const dup = [...heads(A)].filter((h) => heads(C).has(h) && !ALLOW.has(h))
  if (dup.length) errors.push(`A4: 重複 normative 標題(兩檔同段 = 雙 SSOT):${dup.join(' / ')}`)
}

// A5:npm files + shipped mirror
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/design-system/package.json'), 'utf8'))
  if (!pkg.files?.includes('AGENTS.md')) errors.push('A5: packages/design-system/package.json files 缺 AGENTS.md')
  const shipped = path.join(ROOT, 'packages/design-system/AGENTS.md')
  if (!fs.existsSync(shipped)) errors.push('A5: shipped mirror packages/design-system/AGENTS.md 不存在(跑 npm run sync:ds-canonical)')
  else if (fs.existsSync(A) && fs.readFileSync(shipped, 'utf8') !== fs.readFileSync(A, 'utf8')) errors.push('A5: shipped AGENTS.md 與 root 不同步(跑 npm run sync:ds-canonical)')
} catch (e) { errors.push(`A5: package.json 讀取失敗 ${e.message}`) }

if (errors.length) {
  console.error('❌ agents-bootstrap 閘 FAIL:')
  for (const e of errors) console.error('   - ' + e)
  process.exit(1)
}
console.log('✅ agents-bootstrap 閘 PASS(AGENTS.md ≤32KiB / CLAUDE.md @import / Rule Index 零死鏈 / 無雙 SSOT / npm mirror 同步)')
