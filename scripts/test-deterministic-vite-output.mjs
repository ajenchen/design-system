#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  deterministicViteOutputPlugin,
  normalizeViteEmptyCssPlaceholders,
} from '../packages/design-system/vite-deterministic-output.mjs'

test('empty CSS placeholders are independent of checkout-path length', () => {
  const short = 'export const value = 1\n/* empty css     */\n'
  const long = 'export const value = 1\n/* empty css                                        */\n'
  const expected = 'export const value = 1\n/* empty css */\n'
  assert.equal(normalizeViteEmptyCssPlaceholders(short), expected)
  assert.equal(normalizeViteEmptyCssPlaceholders(long), expected)
  assert.equal(normalizeViteEmptyCssPlaceholders('const text = "/* empty css   */"\n'), 'const text = "/* empty css   */"\n')
})

test('the post-order bundle hook changes only chunk code and preserves line topology', () => {
  const map = { mappings: 'AAAA;AACA' }
  const chunk = { type: 'chunk', code: '/* empty css                    */\nexport {}\n', map }
  const asset = { type: 'asset', source: '/* empty css                    */\n' }
  const plugin = deterministicViteOutputPlugin()
  assert.equal(plugin.generateBundle.order, 'post')
  plugin.generateBundle.handler({}, { chunk, asset })
  assert.equal(chunk.code, '/* empty css */\nexport {}\n')
  assert.equal(chunk.map, map)
  assert.equal(asset.source, '/* empty css                    */\n')
})

test('the built DateGrid chunk contains only the canonical placeholder', () => {
  const output = readFileSync('packages/design-system/dist/components/DateGrid/date-grid.js', 'utf8')
  assert.match(output, /^\/\* empty css \*\/$/m)
  assert.doesNotMatch(output, /^\/\* empty css[\t ]{2,}\*\/$/m)
})
