#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { resolveProvisionedPlaywrightRuntime } from '../infra/governance/lib/playwright-runtime.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CANONICAL_UTILS = join(ROOT, 'packages/storybook-config/addons/ds-devmode/utils')
const LEGACY_LOCAL_ADDON = join(ROOT, '.storybook/addons/ds-devmode')
const STORYBOOK_MAIN = join(ROOT, '.storybook/main.ts')
const SHARED_ADDONS_PRESET = join(ROOT, 'packages/storybook-config/addons-preset.ts')
const OVERLAY_SOURCE = join(CANONICAL_UTILS, 'overlay.ts')
const DIAGNOSTIC_SOURCE = join(CANONICAL_UTILS, 'geometry-diagnostic.ts')
const DPRS = [1, 1.25, 2]
const TOLERANCE_PX = 1

if (existsSync(LEGACY_LOCAL_ADDON)) {
  throw new Error('[geometry-invariant] legacy repo-local ds-devmode addon must be absent')
}
const storybookMain = readFileSync(STORYBOOK_MAIN, 'utf8')
const sharedAddonSpreads = storybookMain.match(/\.\.\.sharedAddons\b/g) ?? []
if (sharedAddonSpreads.length !== 1) {
  throw new Error(`[geometry-invariant] DS Storybook must consume the shared addon preset exactly once; found ${sharedAddonSpreads.length}`)
}
if (storybookMain.includes('./addons/ds-devmode/preset')) {
  throw new Error('[geometry-invariant] DS Storybook must not register a repo-local ds-devmode preset')
}
const directCanonicalRegistrations = storybookMain.match(
  /['"]@qijenchen\/storybook-config\/addons\/ds-devmode\/preset['"]/g,
) ?? []
if (directCanonicalRegistrations.length !== 0) {
  throw new Error(`[geometry-invariant] DS Storybook must not duplicate the canonical ds-devmode registration outside sharedAddons; found ${directCanonicalRegistrations.length}`)
}
const sharedAddonsPreset = readFileSync(SHARED_ADDONS_PRESET, 'utf8')
const canonicalPresetRegistrations = sharedAddonsPreset.match(
  /['"]@qijenchen\/storybook-config\/addons\/ds-devmode\/preset['"]/g,
) ?? []
if (canonicalPresetRegistrations.length !== 1) {
  throw new Error(`[geometry-invariant] shared preset must register canonical ds-devmode exactly once; found ${canonicalPresetRegistrations.length}`)
}

const runtime = resolveProvisionedPlaywrightRuntime({ repoRoot: ROOT, environment: process.env })
if (!runtime) throw new Error('[geometry-invariant] exact Playwright Chromium runtime missing; run `npm run setup:playwright`')
process.env.PLAYWRIGHT_BROWSERS_PATH = runtime.environmentValue
const { chromium } = await import('playwright')

const bundle = await build({
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  write: false,
  stdin: {
    contents: `
      import { drawOverlay } from ${JSON.stringify(OVERLAY_SOURCE)}
      import { installGeometryDiagnosticGlobal } from ${JSON.stringify(DIAGNOSTIC_SOURCE)}
      window.__dsGeometryHarness = { drawOverlay, installGeometryDiagnosticGlobal }
    `,
    resolveDir: ROOT,
    sourcefile: 'devmode-geometry-authority-entry.ts',
    loader: 'ts',
  },
})
if (bundle.outputFiles.length !== 1) throw new Error('[geometry-invariant] authority bundle output is not closed')
const authorityBundle = bundle.outputFiles[0].text

let totalFail = 0
const results = []
const browser = await chromium.launch({ headless: true })
try {
  for (const dpr of DPRS) {
    const context = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: 1280, height: 720 } })
    try {
      const page = await context.newPage()
      await page.setContent(`<!doctype html>
        <html><head><style>
          html, body { margin: 0; transform: none; zoom: normal; }
          body { min-height: 720px; }
          #fixture { position: relative; width: 640px; height: 360px; padding: 24px; border: 1px solid #ccd2d8; }
          #target { position: absolute; left: 137px; top: 83px; width: 173px; height: 47px; padding: 8px 16px; border: 1px solid #65727f; }
        </style></head><body><main id="fixture"><button id="target">Geometry target</button></main></body></html>`)
      await page.addScriptTag({ content: authorityBundle })
      const diagnostic = await page.evaluate(() => {
        const harness = window.__dsGeometryHarness
        const target = document.querySelector('#target')
        if (!harness || !target) return { error: 'authority harness or target missing' }
        harness.installGeometryDiagnosticGlobal()
        harness.drawOverlay({ element: target, mode: 'live', label: 'Geometry target' })
        return window.__ds_devmode_diagnostic?.('#target') ?? { error: 'geometry diagnostic not installed' }
      })
      results.push({ dpr, diagnostic })

      let fail = 0
      if (diagnostic && !diagnostic.error) {
        if (diagnostic.devicePixelRatio !== dpr) {
          console.warn(`[DPR ${dpr}] observed devicePixelRatio=${diagnostic.devicePixelRatio}`)
          fail++
        }
        for (const [label, transform] of [
          ['html', diagnostic.documentElement?.transform],
          ['body', diagnostic.body?.transform],
        ]) {
          if (transform && transform !== 'none') {
            console.warn(`[DPR ${dpr}] ${label}.transform="${transform}" (expected "none")`)
            fail++
          }
        }
        const delta = diagnostic.deltaTopLeft
        if (!delta || diagnostic.overlayRoot == null || diagnostic.target == null) {
          console.error(`[DPR ${dpr}] overlay geometry was not exercised`)
          fail++
        } else if (Object.values(delta).some((value) => value > TOLERANCE_PX)) {
          console.warn(`[DPR ${dpr}] overlay alignment FAIL: top=${delta.top}px left=${delta.left}px width=${delta.width}px height=${delta.height}px`)
          fail++
        } else {
          console.log(`[DPR ${dpr}] overlay alignment OK: delta(top=${delta.top}, left=${delta.left}, w=${delta.width}, h=${delta.height}) ≤ ${TOLERANCE_PX}px`)
        }
      } else {
        console.error(`[DPR ${dpr}] diagnostic error:${diagnostic?.error ?? String(diagnostic)}`)
        fail++
      }
      totalFail += fail
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}

console.log('\n=== Geometry Diagnostic Matrix ===')
for (const { dpr, diagnostic } of results) {
  if (diagnostic?.error) console.log(`DPR ${dpr}: ERROR ${diagnostic.error}`)
  else console.log(`DPR ${dpr}: innerW=${diagnostic.innerWidth} clientW=${diagnostic.clientWidth} scrollbarGutter=${diagnostic.scrollbarGutterWidth}`)
}
if (totalFail > 0) throw new Error(`[geometry-invariant] ${totalFail} anomalies across ${DPRS.length} DPRs`)
console.log('\n[geometry-invariant] PASS: canonical overlay geometry is aligned across the DPR matrix')
