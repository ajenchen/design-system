#!/usr/bin/env node
// audit-orphan-tokens.mjs — D4 SSOT orphan token detector(2026-05-21 codify per user verbatim
// 「決策四你他媽仔細給我確認到底該retire的是否真的該retire還是應該結構性保留，請全盤檢查，然後
// 確認之後請下次不要再煩我，尤其是Palette tier」+「都給我做到好」)。
//
// Purpose: 取代 grep-only detection 的 false-positive 噪音(grep `var()` 漏 Tailwind @theme bridge
// + @utility + class-name 消費 + JS literal mirror)。Comprehensive consumer detection covering:
//
//   1. `var(--X)` direct consumption(.tsx / .ts / .css)
//   2. `@theme inline { ... }` Tailwind bridge(token 進 bridge = 自動 Tailwind class 生成,等同消費)
//   3. `@utility xxx { ... }` definition(token 進 utility body = 該 class 消費)
//   4. Tailwind class-name match(e.g. `--spacing-field-md` ↔ `h-field-md` / `bg-field-md` 等)
//   5. JS literal mirror(token name 在 .tsx 內以 string literal 出現,e.g. getComputedStyle 讀)
//
// Structural-keep categories(per user directive 永久保留,不視為 retire 候選):
//   2026-11-15 起類別清單只住分類表 token-registry.json 的 `retention`(本檔讀它,不再內建);
//   每一類的理由住 tokens/orphan-tokens.spec.md(色階完整 / 專用色 / 遮罩透明度 / 圖表預留 / 狀態變體 /
//   中性色 / 語意五件套 / 產品層預留 / Tailwind 轉接名 / 字級完整 / 陰影深色配對)。
//
// Output: 純結構性 token + 真 retire 候選(comprehensive scan 後若仍 0 consumer)。
//
// Gate 邏輯(2026-05-30 — 修「131 orphan 全落 structural-keep → cat.real=0 → --check 永遠過」):
//   過去 --check 只看 cat.real,但所有 orphan 都被 structural-keep regex 吸收 → cat.real 恆為 0
//   → gate 沒意義(新 token 撞 structural-keep regex 也 silently pass,不逼人 justify)。
//   現在 snapshot 現有 structural-keep token 清單到 baseline file,--check 額外 fail 於:
//     (a) 新 orphan 落 structural-keep 卻不在 baseline → 逼人 justify 後跑 --update;
//     (b) structural-keep 總數暴增(> baseline + DRIFT_ALLOWANCE)→ 防 regex 過寬 silent absorb;
//     (c) cat.real > 0(原邏輯保留)。
//   Flags: --check(CI gate)/ --update(justify 後刷新 baseline)/ --verbose / 預設純報告。
//   Baseline SSOT: scripts/audit-orphan-tokens.baseline.json。
//
// Cite: `tokens/orphan-tokens.spec.md` SSOT canonical for token retire classification rules。

import fs from 'fs'
import path from 'path'
import { glob } from 'glob'

const ROOT = path.resolve(process.cwd())
const tokenFiles = (await glob('packages/design-system/src/tokens/**/*.css', { cwd: ROOT })).sort()

// 1. Declare scan
const declared = new Map()
for (const f of tokenFiles) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(--[a-zA-Z0-9-]+):/)
    if (m && !declared.has(m[1])) declared.set(m[1], `${path.basename(f)}:${i + 1}`)
  })
}

// 2. Consumer scan(comprehensive)
const consumed = new Set()

// 2.1 var() consumption across src + packages(2026-05-22 Phase 1 team-distribution-roadmap migration)
const allFiles = [
  ...(await glob('src/**/*.{tsx,ts,css}', { cwd: ROOT })),
  ...(await glob('packages/**/*.{tsx,ts,css}', { cwd: ROOT })),
]
for (const f of allFiles) {
  const abs = path.join(ROOT, f)
  if (tokenFiles.map(t => path.join(ROOT, t)).includes(abs)) continue
  const c = fs.readFileSync(abs, 'utf8')
  for (const m of c.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) consumed.add(m[1])
}

// 2.2 + 2.3 @theme inline bridge + @utility blocks
const allTokenCss = tokenFiles.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
for (const block of allTokenCss.matchAll(/@theme\s+inline\s*\{[^}]*\}/gs)) {
  for (const m of block[0].matchAll(/var\((--[a-zA-Z0-9-]+)/g)) consumed.add(m[1])
  for (const m of block[0].matchAll(/(--[a-zA-Z0-9-]+):/g)) consumed.add(m[1])
}
for (const block of allTokenCss.matchAll(/@utility[^{]+\{[^}]+\}/gs)) {
  for (const m of block[0].matchAll(/var\((--[a-zA-Z0-9-]+)/g)) consumed.add(m[1])
}

// 2.4 Tailwind class-name match(2026-05-22 同上 + packages)
const tsxFiles = [
  ...(await glob('src/**/*.{tsx,ts}', { cwd: ROOT })),
  ...(await glob('packages/**/*.{tsx,ts}', { cwd: ROOT })),
]
let allClassText = ''
for (const f of tsxFiles) allClassText += fs.readFileSync(path.join(ROOT, f), 'utf8')
const bridges = {
  '--spacing-': ['h-', 'w-', 'p-', 'm-', 'gap-', 'inset-', 'top-', 'left-', 'right-', 'bottom-', 'size-', 'min-h-', 'min-w-', 'max-h-', 'max-w-', 'px-', 'py-', 'mx-', 'my-', 'pt-', 'pb-', 'pl-', 'pr-', 'mt-', 'mb-', 'ml-', 'mr-'],
  '--color-': ['bg-', 'text-', 'border-', 'fill-', 'stroke-', 'from-', 'via-', 'to-', 'ring-', 'shadow-', 'outline-', 'placeholder:text-', 'accent-', 'decoration-', 'caret-', 'divide-'],
  '--radius-': ['rounded-'],
  '--font-': ['text-', 'font-'],
  '--tracking-': ['tracking-'],
  '--leading-': ['leading-'],
  '--opacity-': ['opacity-'],
}
for (const decl of declared.keys()) {
  for (const [prefix, classPrefixes] of Object.entries(bridges)) {
    if (decl.startsWith(prefix)) {
      const suffix = decl.substring(prefix.length)
      for (const cp of classPrefixes) {
        const re = new RegExp('\\b' + cp.replace(/[-]/g, '\\-') + suffix.replace(/[-]/g, '\\-') + '\\b')
        if (re.test(allClassText)) { consumed.add(decl); break }
      }
      if (consumed.has(decl)) break
    }
  }
}

// 2.5 JS literal mirror — token name in tsx string
for (const decl of declared.keys()) {
  const re = new RegExp('["\'`]' + decl + '["\'`]')
  if (re.test(allClassText)) consumed.add(decl)
}

// 3. Classify orphans
const orphans = [...declared.keys()].filter(d => !consumed.has(d)).sort()

// Structural-keep classifier —— 2026-11-15 起讀分類表,不內建第二份
// 保留類別的唯一機器清單 = packages/design-system/src/tokens/token-registry.json 的 `retention.categories`
// (key + 按名字歸類的 pattern;pattern 為 null 的類別由分類表那一列的 `retain` 指名,例:--brand = reservation);
// 每一類的理由只住 tokens/orphan-tokens.spec.md(標題裡的反引號字 = key,閘 token-creation-invariant C1 比對兩邊)。
// 歸類順序 = categories 陣列順序(第一個吻合的類別勝)。
// 2026-11-15 拿掉 jsLiteralMirror 一類(原 `--motion-delay-*` CSS 鏡像):那三顆退場、值只住 tokens/motion/motion.ts,
// orphan-tokens.spec.md §8 同日撤掉(與 token-system.spec.md 第 0 題「禁止『之後可能有人用』就先開」矛盾;稽核 P09)。
// 收編原 ds-canonical/references/structural-token-retention.md 的同日,保留分類從本檔的 7 條 regex 搬進分類表(M17:同一份規則只住一處)。
const REGISTRY_PATH = path.join(ROOT, 'packages/design-system/src/tokens/token-registry.json')
let registry
try {
  registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
} catch (e) {
  console.error(`❌ INSTRUMENT-FAIL 讀不到分類表 ${path.relative(ROOT, REGISTRY_PATH)}:${String(e.message).split('\n')[0]}`)
  process.exit(1)
}
const CATEGORIES = Array.isArray(registry?.retention?.categories) ? registry.retention.categories : null
if (!CATEGORIES || !CATEGORIES.length || CATEGORIES.some((c) => typeof c?.key !== 'string' || !(c.pattern === null || typeof c.pattern === 'string'))) {
  console.error('❌ INSTRUMENT-FAIL 分類表沒有合法的 retention.categories(每一類要有 key,pattern 是字串或 null)—— 保留分類讀不到就不能判誰是真孤兒')
  process.exit(1)
}
const rules = CATEGORIES.map((c) => ({ key: c.key, re: c.pattern ? new RegExp(c.pattern) : null }))
const isPrefixRow = (r) => r.match.endsWith('-') || r.match.endsWith('_')
/** 分類表最長吻合那一列的 retain(token-creation-invariant 的 lookup 同一個判準) */
function retainOf(name) {
  let best = null
  for (const r of registry.rows ?? []) {
    if (typeof r?.match !== 'string') continue
    if (!(isPrefixRow(r) ? name.startsWith(r.match) : name === r.match)) continue
    if (!best || r.match.length > best.match.length) best = r
  }
  return best?.retain ?? null
}
const cat = Object.fromEntries([...rules.map((r) => [r.key, []]), ['real', []]])
for (const o of orphans) {
  const hit = rules.find((r) => (r.re ? r.re.test(o) : false) || retainOf(o) === r.key)
  cat[hit ? hit.key : 'real'].push(o)
}

// 3.5 Structural-keep baseline(讓 gate 有意義 — 詳 file header「Gate 邏輯」段)
//
// Problem(2026-05-30 user verbatim): 131 orphan 全落 structural-keep → cat.real=0 → --check 永遠過,
// gate 沒意義。任何「新」token 只要命中某個 structural-keep regex(eg. 新增 `--color-blue-11`
// 撞 PALETTE_FULL,或新 `--primary-text` 撞 SOP_SEMANTIC)就 silently pass,不逼任何人 justify。
//
// Fix: snapshot 現有 structural-keep token 清單到 baseline file。--check 時:
//   (a) 任何「新」structural-keep token(不在 baseline)→ fail,逼人跑 --update 顯式 justify;
//   (b) structural-keep 總數暴增(> baseline + DRIFT_ALLOWANCE)→ fail(防 regex 過寬 silent absorb);
//   (c) cat.real > 0 → fail(原有邏輯保留)。
// baseline 縮減(retire 既有 structural token)不 fail — 只在 --update 時更新清單。
const BASELINE_PATH = path.join(ROOT, 'scripts/audit-orphan-tokens.baseline.json')
const DRIFT_ALLOWANCE = 5 // structural-keep 總數可比 baseline 多幾個前才 warn/fail

// 攤平所有 structural-keep category 成單一 sorted token 清單(real 不算 structural-keep)
const structuralKeepTokens = Object.entries(cat)
  .filter(([k]) => k !== 'real')
  .flatMap(([, v]) => v)
  .sort()

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeBaseline() {
  const payload = {
    _comment:
      'Structural-keep orphan token baseline — SSOT for audit-orphan-tokens.mjs gate. ' +
      '新 token 落 structural-keep 卻不在 tokens[] → --check fail,逼人 justify 後跑 --update 刷新。' +
      'Cite: tokens/orphan-tokens.spec.md。',
    generatedAt: new Date().toISOString(),
    count: structuralKeepTokens.length,
    tokens: structuralKeepTokens,
  }
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
}

// 4. Report
const argv = process.argv.slice(2)
const verbose = argv.includes('--verbose')
const checkOnly = argv.includes('--check')
const updateBaseline = argv.includes('--update')

console.log('━━━ Orphan Token Audit ━━━')
console.log(`Declared:               ${declared.size}`)
console.log(`Consumed(comprehensive):${consumed.size}`)
console.log(`Orphans(grep-detect):   ${orphans.length}`)
console.log('')
console.log('━━━ Structural-keep classification(永久保留;類別讀自分類表 retention,理由住 orphan-tokens.spec.md)━━━')
for (const r of rules) console.log(`  ${r.key.padEnd(22)}${cat[r.key].length}`)
const structuralTotal = rules.reduce((n, r) => n + cat[r.key].length, 0)
console.log(`  小計:                 ${structuralTotal}`)
console.log('')
console.log(`━━━ 真 retire 候選:${cat.real.length}個 ━━━`)
if (cat.real.length === 0) {
  console.log('  ✅ 0 真孤兒 — 全部 orphan 落 structural-keep 範疇')
} else {
  for (const o of cat.real) console.log(`  ❌ ${o} @ ${declared.get(o)}`)
}

// 3.5b Structural-keep baseline drift report
const baseline = readBaseline()
const baselineSet = baseline ? new Set(baseline.tokens) : null
const newStructural = baselineSet ? structuralKeepTokens.filter(t => !baselineSet.has(t)) : []
const removedStructural = baselineSet ? baseline.tokens.filter(t => !structuralKeepTokens.includes(t)) : []
const baselineCount = baseline ? baseline.count : null

console.log('')
console.log('━━━ Structural-keep baseline gate ━━━')
if (!baseline) {
  console.log(`  ⚠ 無 baseline file(${path.relative(ROOT, BASELINE_PATH)})— 跑 \`--update\` 建立`)
} else {
  console.log(`  Baseline:               ${baselineCount} tokens`)
  console.log(`  目前 structural-keep:   ${structuralKeepTokens.length} tokens`)
  console.log(`  新增(不在 baseline):    ${newStructural.length}`)
  if (newStructural.length) for (const o of newStructural) console.log(`    ＋ ${o} @ ${declared.get(o)}`)
  console.log(`  移除(已 retire):        ${removedStructural.length}`)
  if (removedStructural.length && verbose) for (const o of removedStructural) console.log(`    － ${o}`)
}

if (verbose) {
  for (const [k, v] of Object.entries(cat)) {
    if (v.length === 0) continue
    console.log(`\n── ${k}(${v.length})──`)
    for (const o of v) console.log(`   ${o}`)
  }
}

if (updateBaseline) {
  writeBaseline()
  console.log(`\n✅ baseline updated → ${path.relative(ROOT, BASELINE_PATH)}(${structuralKeepTokens.length} tokens)`)
  process.exit(0)
}

if (checkOnly) {
  const failures = []

  // (c) 原有邏輯:真 retire 候選 → fail
  if (cat.real.length > 0) {
    failures.push(`${cat.real.length} real orphan token(s) — retire or codify structural-keep category`)
  }

  if (!baseline) {
    // 無 baseline = gate 未 bootstrap;不靜默過,逼人先建立 baseline 才有意義
    failures.push(
      `no structural-keep baseline — run \`node scripts/audit-orphan-tokens.mjs --update\` to snapshot ${structuralKeepTokens.length} current structural-keep tokens`
    )
  } else {
    // (a) 新 token 落 structural-keep 卻不在 baseline → fail,逼人 justify
    if (newStructural.length > 0) {
      failures.push(
        `${newStructural.length} NEW orphan token(s) landed in a structural-keep bucket but are not in baseline — justify then run \`--update\`:\n` +
          newStructural.map(o => `      ＋ ${o} @ ${declared.get(o)}`).join('\n')
      )
    }
    // (b) structural-keep 總數暴增 → fail(防 regex 過寬 silent absorb 大量新 token)
    if (structuralKeepTokens.length > baselineCount + DRIFT_ALLOWANCE) {
      failures.push(
        `structural-keep count ${structuralKeepTokens.length} exceeds baseline ${baselineCount} + allowance ${DRIFT_ALLOWANCE} — possible over-broad structural-keep classifier`
      )
    }
  }

  if (failures.length > 0) {
    console.error('')
    for (const f of failures) console.error(`❌ ${f}`)
    process.exit(1)
  }
  console.log('\n✅ check passed')
  process.exit(0)
}
