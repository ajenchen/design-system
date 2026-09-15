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
/**
 * 真實呼叫端傳的是 `getBoundingClientRect()` 回來的 **DOMRect**,它的 left/top/right/bottom 都在**原型**上,
 * 物件展開(`{ ...rect }`)複製不到 —— 2026-09-10 的實際 bug 就是這樣讓整個函式永遠回 null,
 * 而這份 fixture 全是普通物件,所以測試一直是綠的。這個工廠把同樣的值放到原型上,形狀與 DOMRect 一致。
 */
const protoRect = (left, right, top = 0, bottom = 32) =>
  Object.create({ left, right, top, bottom, x: left, y: top, width: right - left, height: bottom - top })
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

test('DOMRect 形狀(屬性在原型上):不得因為物件展開而整個失效', () => {
  // 迴歸鎖(2026-09-10):`{ ...overlay }` 會展出 `{}`,所有比較變成 undefined > undefined = false → 永遠 null。
  assert.deepEqual(
    geometry.resolveTabsInlineActionPosition({
      trigger: protoRect(40, 100),
      overlay: protoRect(0, 300),
      clips: [],
      actionWidth: 16,
    }),
    { left: 100, top: 0, height: 32 },
    'overlay 是 DOMRect 時仍要算得出位置',
  )
  // 實際 story 的數字(帶後綴:trigger 131.203125,16,183.203125,48 / overlay 16,16,716,49)
  const t = Object.create({ left: 131.203125, top: 16, right: 183.203125, bottom: 48 })
  const o = Object.create({ left: 16, top: 16, right: 716, bottom: 49 })
  assert.deepEqual(
    geometry.resolveTabsInlineActionPosition({ trigger: t, overlay: o, clips: [], actionWidth: 16 }),
    { left: 167.203125, top: 0, height: 32 },
  )
  // 對照:裁切矩形也走同一條路,clipX 生效時仍要能判掉
  assert.equal(
    geometry.resolveTabsInlineActionPosition({
      trigger: protoRect(80, 140),
      overlay: protoRect(0, 300),
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
