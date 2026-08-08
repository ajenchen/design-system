#!/usr/bin/env node
/**
 * Provider-neutral peer evidence pack builder.
 *
 * Problem it solves: a review peer that must hunt through the repository burns its
 * budget on exploration and answers from fragments. A peer handed only prose cannot
 * verify anything. Both produce assembled-from-parts opinions rather than judgement.
 *
 * This assembles one self-contained pack: the subject document plus the verbatim
 * source lines behind every `path:line` citation it makes, each with a content
 * digest. Any peer, on any model, with or without repository access, receives the
 * identical evidence and can therefore be held to the same standard.
 *
 * Unresolvable citations are reported rather than silently dropped — a citation that
 * points at nothing is itself the finding (M22 / M36 class).
 *
 * Deterministic: same inputs produce byte-identical output, so packs are diffable
 * and a peer's response can be bound to an exact pack digest.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync, lstatSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const CITE = /(?<![\w./-])((?:[\w.-]+\/)*[\w.-]+\.(?:tsx|ts|mjs|cjs|js|css|sh|json|md|yml|yaml))[:：](\d+)(?:\s*[-–,]\s*(\d+))?/g

// Citations are written relative to whichever root the author had in mind; resolve
// against each in order and take the first hit. Longest-prefix roots come first so a
// bare `dialog.spec.md:91` still lands in the design-system tree.
const SEARCH_ROOTS = Object.freeze([
  'packages/design-system/src/components',
  'packages/design-system/src/patterns',
  'packages/design-system/src/tokens',
  'packages/design-system/src/hooks',
  'packages/design-system/src',
  'packages/design-system',
  '.',
])

const CONTEXT_LINES = 2

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function digest(text) {
  return createHash('sha256').update(text).digest('hex')
}

function contained(root, path) {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/**
 * Authors cite by the name they use in conversation (`dialog.spec.md:91`), not by
 * full path, so a direct join usually misses. Build a basename index over the tracked
 * source tree once and fall back to it. Ambiguous basenames resolve to nothing rather
 * than to a guess — an unresolved citation is reported, a wrong one would mislead.
 */
function buildBasenameIndex(repoRoot) {
  const index = new Map()
  const roots = ['packages/design-system/src', 'packages/design-system/ds-canonical', 'scripts', 'infra']
  const walk = (dir, depth) => {
    if (depth > 8) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const path = join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) { walk(path, depth + 1); continue }
      if (!entry.isFile()) continue
      const existing = index.get(entry.name)
      if (existing === undefined) index.set(entry.name, path)
      else if (existing !== path) index.set(entry.name, null) // ambiguous → refuse to guess
    }
  }
  for (const root of roots) {
    const start = resolve(repoRoot, root)
    if (existsSync(start)) walk(start, 0)
  }
  return index
}

function lineCount(path) {
  try { return readFileSync(path, 'utf8').split('\n').length } catch { return 0 }
}

/**
 * Several basenames exist at more than one depth (`AGENTS.md`, `README.md`). Path
 * precedence alone picks wrong, so gather every candidate and let the cited line
 * number disambiguate: the file the author meant is one that actually has that line.
 */
function resolveCite(repoRoot, citedPath, citedLine, basenameIndex) {
  const candidates = []
  for (const root of SEARCH_ROOTS) {
    const candidate = resolve(repoRoot, root, citedPath)
    if (!contained(repoRoot, candidate) || !existsSync(candidate)) continue
    const info = lstatSync(candidate)
    if (!info.isFile() || info.isSymbolicLink()) continue
    if (!candidates.includes(candidate)) candidates.push(candidate)
  }
  const indexed = basenameIndex.get(citedPath.split('/').pop())
  if (indexed && contained(repoRoot, indexed) && !candidates.includes(indexed)) candidates.push(indexed)

  if (!candidates.length) return null
  return candidates.find((path) => lineCount(path) >= citedLine) ?? candidates[0]
}

function main() {
  const repoRoot = resolve(argValue('--repo', process.cwd()))
  const specPath = resolve(argValue('--spec'))
  const outPath = resolve(argValue('--out'))

  if (!existsSync(specPath)) throw new Error(`subject document not found: ${specPath}`)
  const spec = readFileSync(specPath, 'utf8')

  // Collect citations, deduped by file then merged into line ranges.
  const basenameIndex = buildBasenameIndex(repoRoot)
  const byFile = new Map()
  const unresolved = new Set()
  for (const match of spec.matchAll(CITE)) {
    const [, citedPath, startRaw, endRaw] = match
    const start = Number.parseInt(startRaw, 10)
    const end = endRaw ? Number.parseInt(endRaw, 10) : start
    if (!Number.isInteger(start) || start < 1) continue
    const absolute = resolveCite(repoRoot, citedPath, start, basenameIndex)
    if (!absolute) { unresolved.add(`${citedPath}:${startRaw}`); continue }
    const key = relative(repoRoot, absolute).split(sep).join('/')
    if (!byFile.has(key)) byFile.set(key, { absolute, ranges: [] })
    byFile.get(key).ranges.push([start, Math.max(start, end)])
  }

  const files = [...byFile.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const sections = []
  let excerptCount = 0
  let outOfRange = 0

  for (const [key, { absolute, ranges }] of files) {
    const source = readFileSync(absolute, 'utf8')
    const lines = source.split('\n')
    // Merge overlapping/adjacent ranges after padding with context.
    const padded = ranges
      .map(([s, e]) => [Math.max(1, s - CONTEXT_LINES), Math.min(lines.length, e + CONTEXT_LINES)])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const merged = []
    for (const range of padded) {
      const last = merged[merged.length - 1]
      if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1])
      else merged.push([...range])
    }
    const blocks = merged.map(([s, e]) => {
      if (s > lines.length) { outOfRange += 1; return `  (行 ${s} 超出檔案長度 ${lines.length} — 引用失效)` }
      excerptCount += 1
      return lines.slice(s - 1, e).map((line, index) => `${String(s + index).padStart(5)}\t${line}`).join('\n')
    })
    sections.push([
      `### \`${key}\``,
      `<sub>sha256 \`${digest(source).slice(0, 16)}\` · ${lines.length} 行</sub>`,
      '',
      '```',
      blocks.join('\n  ⋯\n'),
      '```',
      '',
    ].join('\n'))
  }

  const header = [
    '# Peer evidence pack(機械生成,勿手改)',
    '',
    `本檔由 \`scripts/build-peer-evidence-pack.mjs\` 從 **${relative(repoRoot, specPath).split(sep).join('/') || specPath}** 的每一條 \`path:line\` 引用機械抽出。`,
    '目的:讓審查對象**不需要存取 repo 也不需要探索**就能逐條查核——同一份證據給任何模型、任何環境,判準才可比。',
    '',
    `- 主體文件摘要:sha256 \`${digest(spec).slice(0, 16)}\``,
    `- 引用檔案:${files.length} 個 / 節錄區塊:${excerptCount} 段`,
    `- **無法解析的引用:${unresolved.size} 筆**${unresolved.size ? '(見下,這本身就是 finding)' : ''}`,
    `- 超出檔案長度的引用:${outOfRange} 筆`,
    '',
  ]

  if (unresolved.size) {
    header.push(
      '## ⚠️ 無法解析的引用',
      '',
      '下列引用在本 repo 找不到對應檔案。**外部來源(他家套件 / GitHub)出現在這裡屬正常**;',
      '若是本 repo 內部檔案卻列在這裡,即為失效引用(M22 / M36)。',
      '',
      ...[...unresolved].sort().map((item) => `- \`${item}\``),
      '',
    )
  }

  header.push('---', '', '## 被引用的原始碼(逐字,含行號)', '')

  const body = `${header.join('\n')}${sections.join('\n')}`
  writeFileSync(outPath, body)

  process.stdout.write(
    `[peer-evidence-pack] ${files.length} 檔 / ${excerptCount} 段 / 無法解析 ${unresolved.size} / 超界 ${outOfRange}\n`
    + `[peer-evidence-pack] pack sha256 ${digest(body).slice(0, 16)} → ${outPath}\n`,
  )
  // 外部引用解析不到不算失敗;指到不存在的行才是硬缺陷。
  return outOfRange === 0 ? 0 : 1
}

try {
  process.exit(main())
} catch (error) {
  process.stderr.write(`[peer-evidence-pack] ${error.message}\n`)
  process.exit(2)
}
