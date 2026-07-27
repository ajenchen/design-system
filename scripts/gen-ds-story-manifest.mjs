#!/usr/bin/env node
/**
 * gen-ds-story-manifest.mjs — SSOT generator(per 2026-05-27 M31 codex synthesis)
 *
 * Reads `storybook-static/index.json`(produced by `npm run build-storybook`)
 * → emits `packages/design-system/ds-story-manifest.json`(shipped via npm).
 *
 * Purpose: Consumer apps(product-workspace etc.)consume this manifest to:
 *   (a) `check-consumer-story-baseline.sh` — verify @story-baseline: marker references valid DS story id
 *   (b) `composition-fidelity-visual-diff.mjs` — drive cross-side pixel diff
 *   (c) PW AllDsComponents portal(ImportSmoke)— link to DS canonical Storybook
 *
 * Run automatically in `build-storybook` postbuild + CI release.yml audit gate.
 *
 * Per codex M31 synthesis 2026-05-27:「DS package ships canonical component story ids,
 * story tier, open-snapshot id, exceptions, baseline refs」.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const INDEX_FILE = join(REPO_ROOT, 'storybook-static/index.json')
const OUTPUT_FILE = join(REPO_ROOT, 'packages/design-system/ds-story-manifest.json')

const CHECK_MODE = process.argv.includes('--check')

if (!existsSync(INDEX_FILE)) {
  console.error('❌ storybook-static/index.json not found. Run `npm run build-storybook` first.')
  process.exit(2)
}

const idx = JSON.parse(readFileSync(INDEX_FILE, 'utf8'))
const components = {}
const exceptions = {
  HoverCard: 'pure-behavior-primitive — no static visual snapshot (per codex M31 2026-05-27)',
}

for (const [k, v] of Object.entries(idx.entries)) {
  if (v.type !== 'story') continue
  const m = k.match(/^design-system-(?:components|internal)-([^-]+(-[^-]+)?)-(展示|設計規格|設計原則)--([\w-]+)/)
  if (!m) continue
  const [, comp, , tier, variant] = m
  if (!components[comp]) {
    components[comp] = {
      tiers: { '展示': [], '設計規格': [], '設計原則': [] },
      openSnapshotIds: [],
      exception: exceptions[comp.charAt(0).toUpperCase() + comp.slice(1)] || null,
    }
  }
  components[comp].tiers[tier].push(k)
  if (/open|default-open|opensnapshot|popped/i.test(variant)) {
    components[comp].openSnapshotIds.push(k)
  }
}

const manifest = {
  _meta: {
    purpose: 'DS canonical story id SSOT for consumer visual diff and baseline validation',
    canonicalSource: 'M31 codex synthesis 2026-05-27 dual-track',
    consumedBy: [
      'packages/design-system/ds-canonical/hooks/check_consumer_app_invariants.sh#r2_story_baseline',
      'scripts/composition-fidelity-visual-diff.mjs',
      'product-workspace apps/template/src/AllDsComponents.stories.tsx (ImportSmoke portal → DS Storybook link)',
    ],
    generatedAt: new Date().toISOString(),
  },
  components,
  totalComponents: Object.keys(components).length,
  totalStories: Object.values(components).reduce(
    (s, c) => s + Object.values(c.tiers).flat().length,
    0,
  ),
}

if (CHECK_MODE) {
  if (!existsSync(OUTPUT_FILE)) {
    console.error('❌ DRIFT:', OUTPUT_FILE, 'not present. Run `node scripts/gen-ds-story-manifest.mjs`.')
    process.exit(1)
  }
  const existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'))
  const ignoreKeys = ['generatedAt']
  const stringify = (m) => JSON.stringify({ ...m, _meta: { ...m._meta, generatedAt: undefined } }, null, 2)
  if (stringify(existing) !== stringify(manifest)) {
    console.error('❌ DRIFT: ds-story-manifest.json out of sync with storybook-static/index.json')
    console.error('   Run: node scripts/gen-ds-story-manifest.mjs')
    process.exit(1)
  }
  console.log('✓ ds-story-manifest.json in sync')
  process.exit(0)
}

// 2026-06-06 fix:idempotent write —— 內容(排除 generatedAt)無變則沿用既有時戳,
// 避免每次 build 都換 generatedAt 讓 git tree 永遠顯示此檔 dirty(cosmetic churn)。
const normalize = (m) => JSON.stringify({ ...m, _meta: { ...m._meta, generatedAt: undefined } }, null, 2)
if (existsSync(OUTPUT_FILE)) {
  const existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'))
  if (normalize(existing) === normalize(manifest) && existing._meta?.generatedAt) {
    manifest._meta.generatedAt = existing._meta.generatedAt // 內容無變 → 沿用舊時戳,輸出 byte-identical
  }
}
writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2))
console.log(`✓ ${manifest.totalComponents} components / ${manifest.totalStories} stories → ${OUTPUT_FILE}`)
