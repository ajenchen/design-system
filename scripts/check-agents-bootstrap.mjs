#!/usr/bin/env node
/**
 * check-agents-bootstrap.mjs — PNG P1.3 bootstrap 完整性閘(2026-07-16)。
 *
 * 為何存在:PNG 架構下治理核心 = AGENTS.md(provider-neutral;Codex 原生 discovery),
 *   CLAUDE.md = `@AGENTS.md` import 薄殼(Anthropic 官方共用模式)。此結構一旦漂移
 *   (import 被刪 / root→cwd 指令鏈超過 Codex 32KiB cap / Rule Index 死鏈 / 兩檔重複 normative 段)
 *   = 兩 provider 吃到不同治理 → 本 gate fail-closed。
 *
 * 斷言:
 *   A1 AGENTS.md 存在，且 root 與最深 shipped package scope 的累積鏈 ≤ 32KiB
 *   A2 CLAUDE.md 首個非空行 = `@AGENTS.md`(Claude import 完整)
 *   A3 AGENTS.md canonical repo 路徑存在；provider-view 路徑只准出現在明示 adapter/non-authority 的說明
 *   A4 兩檔無重複 normative 標題(# / ## 級;Claude 段的機制說明豁免清單)
 *   A5 npm files 含 AGENTS/CLAUDE；shipped package instructions 精確來自獨立短 source，且不得複製 root
 *
 * 用法:node scripts/check-agents-bootstrap.mjs [--check]
 */
import fs from 'node:fs'
import path from 'node:path'

const rootIndex = process.argv.indexOf('--root')
if (rootIndex !== -1 && !process.argv[rootIndex + 1]) {
  console.error('usage: check-agents-bootstrap.mjs [--check] [--root <repo>]')
  process.exit(2)
}
const ROOT = rootIndex === -1 ? process.cwd() : path.resolve(process.argv[rootIndex + 1])
const errors = []
const A = path.join(ROOT, 'AGENTS.md')
const C = path.join(ROOT, 'CLAUDE.md')
const CODEX_PROJECT_DOC_MAX_BYTES = 32 * 1024
const PACKAGE_AGENTS_SOURCE = path.join(ROOT, 'scripts/package-role-sources/AGENTS.package.md')
const PACKAGE_CLAUDE_SOURCE = path.join(ROOT, 'scripts/package-role-sources/CLAUDE.package.md')
const PACKAGE_AGENTS = path.join(ROOT, 'packages/design-system/AGENTS.md')
const PACKAGE_CLAUDE = path.join(ROOT, 'packages/design-system/CLAUDE.md')
const DISCOVERY_SKIP_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', 'storybook-static',
  '.cache', '.next', '.turbo', '.parcel-cache',
])

function discoveredProjectDocs(directory = ROOT, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      if (entry.name === 'AGENTS.md' || entry.name === 'AGENTS.override.md') errors.push(`A1: instruction file 不得是 symlink:${path.relative(ROOT, path.join(directory, entry.name))}`)
      continue
    }
    if (entry.isDirectory()) {
      if (!DISCOVERY_SKIP_DIRECTORIES.has(entry.name)) discoveredProjectDocs(path.join(directory, entry.name), found)
    } else if (entry.isFile() && (entry.name === 'AGENTS.md' || entry.name === 'AGENTS.override.md')) found.push(path.join(directory, entry.name))
  }
  return found
}

function projectDocChain(targetDirectory) {
  const relative = path.relative(ROOT, targetDirectory)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return []
  const directories = [ROOT]
  if (relative) {
    let cursor = ROOT
    for (const segment of relative.split(path.sep)) {
      cursor = path.join(cursor, segment)
      directories.push(cursor)
    }
  }
  const chain = []
  for (const directory of directories) {
    const candidates = ['AGENTS.override.md', 'AGENTS.md']
    const selected = candidates.map((name) => path.join(directory, name))
      .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile() && fs.statSync(candidate).size > 0)
    if (selected) chain.push(selected)
  }
  return chain
}

// A1
if (!fs.existsSync(A)) errors.push('A1: AGENTS.md 不存在')
else {
  const bytes = fs.statSync(A).size
  if (bytes > CODEX_PROJECT_DOC_MAX_BYTES) errors.push(`A1: AGENTS.md ${bytes} bytes > 32KiB(Codex project_doc_max_bytes 預設 cap)— 拆分或瘦身`)
}
for (const instruction of fs.existsSync(ROOT) ? discoveredProjectDocs() : []) {
  const chain = projectDocChain(path.dirname(instruction))
  const chainBytes = chain.reduce((sum, file) => sum + fs.statSync(file).size, 0) + Math.max(0, chain.length - 1) * 2
  if (chainBytes > CODEX_PROJECT_DOC_MAX_BYTES) {
    errors.push(`A1: root→${path.relative(ROOT, path.dirname(instruction)) || '.'} project-doc chain ${chainBytes} bytes > 32KiB(${chain.map((file) => path.relative(ROOT, file)).join(' + ')})`)
  }
}

// A2
if (!fs.existsSync(C)) errors.push('A2: CLAUDE.md 不存在')
else {
  const first = fs.readFileSync(C, 'utf8').split('\n').find((l) => l.trim() !== '')
  if (first?.trim() !== '@AGENTS.md') errors.push(`A2: CLAUDE.md 首個非空行必須是 "@AGENTS.md"(實際:"${(first || '').slice(0, 40)}")— Claude 治理 import 斷`)
}

// A3:Rule Index + 全文 canonical repo 路徑引用存在性。Generated provider homes may be
// described as delivery/adapters, but must never be the path readers are told to consult as SSOT.
if (fs.existsSync(A)) {
  const src = fs.readFileSync(A, 'utf8')
  const paths = [...src.matchAll(/`((?:scripts|packages|governance|infra)\/[^`*]+?\.(?:md|mjs|sh|json))`/g)].map((m) => m[1]).filter((p) => !p.includes('{'))
  for (const p of new Set(paths)) {
    if (!fs.existsSync(path.join(ROOT, p))) errors.push(`A3: AGENTS.md 引用不存在路徑 ${p}`)
  }
  const adapterDisclosure = /adapter|generated|可重建|非.{0,12}(?:authority|SSOT|owner|信任邊界)|不得手改|專屬加速器|delivery/i
  src.split('\n').forEach((line, index) => {
    const providerPaths = [...line.matchAll(/`((?:\.claude|\.codex|\.agents)(?:\/[^`]+)?)`/g)].map((match) => match[1])
    if (providerPaths.length && !adapterDisclosure.test(line)) {
      errors.push(`A3: AGENTS.md:${index + 1} 把 generated provider view 當讀取指標(${providerPaths.join(', ')})；改指 canonical owner，或同行明示 adapter/non-authority`)
    }
  })
}

// A4:normative 標題重複(# 級,允許 CLAUDE.md 的 provider 機制標題)
if (fs.existsSync(A) && fs.existsSync(C)) {
  const heads = (f) => new Set(fs.readFileSync(f, 'utf8').split('\n').filter((l) => /^#{1,2} /.test(l)).map((l) => l.replace(/^#+ /, '').trim()))
  const ALLOW = new Set(['Claude Code 專屬機制層(provider adapter)'])
  const dup = [...heads(A)].filter((h) => heads(C).has(h) && !ALLOW.has(h))
  if (dup.length) errors.push(`A4: 重複 normative 標題(兩檔同段 = 雙 SSOT):${dup.join(' / ')}`)
}

// A5:npm files + concise package-scope projections. Codex concatenates project docs from
// repository root to cwd under one default 32KiB budget, so a nested package must augment the
// root instead of copying it. Claude receives the same separation through the local @AGENTS import.
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/design-system/package.json'), 'utf8'))
  if (!pkg.files?.includes('AGENTS.md')) errors.push('A5: packages/design-system/package.json files 缺 AGENTS.md')
  if (!pkg.files?.includes('CLAUDE.md')) errors.push('A5: packages/design-system/package.json files 缺 CLAUDE.md')
  for (const [label, source, shipped] of [
    ['AGENTS.md', PACKAGE_AGENTS_SOURCE, PACKAGE_AGENTS],
    ['CLAUDE.md', PACKAGE_CLAUDE_SOURCE, PACKAGE_CLAUDE],
  ]) {
    if (!fs.existsSync(source)) errors.push(`A5: package instruction source ${path.relative(ROOT, source)} 不存在`)
    if (!fs.existsSync(shipped)) errors.push(`A5: shipped package instruction ${path.relative(ROOT, shipped)} 不存在(跑 npm run sync:ds-canonical)`)
    if (fs.existsSync(source) && fs.existsSync(shipped)
      && !fs.readFileSync(shipped).equals(fs.readFileSync(source))) errors.push(`A5: shipped ${label} 與 package-scope source 不同步(跑 npm run sync:ds-canonical)`)
  }
  if (fs.existsSync(A) && fs.existsSync(PACKAGE_AGENTS)
    && fs.readFileSync(A).equals(fs.readFileSync(PACKAGE_AGENTS))) errors.push('A5: nested package AGENTS.md 不得複製 root AGENTS.md(重複 SSOT/context)')
  if (fs.existsSync(C) && fs.existsSync(PACKAGE_CLAUDE)
    && fs.readFileSync(C).equals(fs.readFileSync(PACKAGE_CLAUDE))) errors.push('A5: nested package CLAUDE.md 不得複製 root CLAUDE.md')
  if (fs.existsSync(PACKAGE_CLAUDE)) {
    const first = fs.readFileSync(PACKAGE_CLAUDE, 'utf8').split('\n').find((line) => line.trim() !== '')
    if (first?.trim() !== '@AGENTS.md') errors.push('A5: packages/design-system/CLAUDE.md 首個非空行必須是 "@AGENTS.md"')
  }
} catch (e) { errors.push(`A5: package.json 讀取失敗 ${e.message}`) }

if (errors.length) {
  console.error('❌ agents-bootstrap 閘 FAIL:')
  for (const e of errors) console.error('   - ' + e)
  process.exit(1)
}
console.log('✅ agents-bootstrap 閘 PASS(root→cwd AGENTS chain ≤32KiB / Claude @import / Rule Index 零死鏈 / 無雙 SSOT / scoped npm instructions 同步)')
