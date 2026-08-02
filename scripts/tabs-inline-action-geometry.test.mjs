#!/usr/bin/env node

// Focused product-geometry unit test; Storybook interaction coverage owns browser integration.

import assert from 'node:assert/strict'
import test from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(
  ROOT,
  'packages/design-system/src/components/Tabs/tabs-inline-action-geometry.ts',
)
const bundle = await build({
  entryPoints: [source],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
})
assert.equal(bundle.outputFiles.length, 1)
const geometry = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
)

const rect = (left, right, top = 0, bottom = 32) => ({ left, right, top, bottom })
const clipX = (left, right, top = 0, bottom = 32) => ({
  ...rect(left, right, top, bottom),
  clipX: true,
  clipY: true,
})

test('none: visible trigger keeps its canonical trailing action position', () => {
  assert.deepEqual(
    geometry.resolveTabsInlineActionPosition({
      trigger: rect(40, 100),
      overlay: rect(0, 300),
      clips: [],
      actionWidth: 16,
    }),
    { left: 100, top: 0, height: 32 },
  )
})

test('scroll: fully offscreen trigger does not render an action', () => {
  assert.equal(
    geometry.resolveTabsInlineActionPosition({
      trigger: rect(130, 190),
      overlay: rect(0, 300),
      clips: [clipX(0, 120)],
      actionWidth: 16,
    }),
    null,
  )
})

test('menu: fully offscreen trigger does not render into the navigator area', () => {
  assert.equal(
    geometry.resolveTabsInlineActionPosition({
      trigger: rect(-80, -20),
      overlay: rect(0, 160),
      clips: [clipX(0, 120)],
      actionWidth: 16,
    }),
    null,
  )
})

test('left partial: render when the canonical trailing action slot is fully visible', () => {
  assert.deepEqual(
    geometry.resolveTabsInlineActionPosition({
      trigger: rect(-20, 40),
      overlay: rect(0, 300),
      clips: [clipX(0, 100)],
      actionWidth: 16,
    }),
    { left: 40, top: 0, height: 32 },
  )
})

test('right partial: omit instead of clamping an incomplete trailing action slot', () => {
  assert.equal(
    geometry.resolveTabsInlineActionPosition({
      trigger: rect(80, 140),
      overlay: rect(0, 300),
      clips: [clipX(0, 100)],
      actionWidth: 16,
    }),
    null,
  )
})

test('consumer style is preserved while canonical paddingRight wins last', () => {
  const consumerStyle = { opacity: 0.75, color: 'rebeccapurple', paddingRight: 0 }
  const canonicalPaddingRight = geometry.getTabsInlineActionPaddingRight(16, true)
  assert.equal(canonicalPaddingRight, 24, '16px action + canonical 8px gap')
  assert.deepEqual(
    geometry.mergeTabsInlineActionStyle(consumerStyle, canonicalPaddingRight),
    { opacity: 0.75, color: 'rebeccapurple', paddingRight: 24 },
  )
  assert.equal(geometry.getTabsInlineActionPaddingRight(16, false), undefined)
  assert.strictEqual(
    geometry.mergeTabsInlineActionStyle(consumerStyle, undefined),
    consumerStyle,
  )
})
