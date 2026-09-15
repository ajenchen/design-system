#!/usr/bin/env node
// AgentFab 拖曳磁吸純函式單測 —— 守「拖過視窗右緣、y 在帶內,仍算貼邊」
// (agent-panel.spec.md「區域 → 落點表」;user 2026-09-04 回報「拖到最右邊放開卻飛回家」)。
//
// 為什麼需要:這條規則住在 `useSnapDrag` onMove 的 `dragPoint`(指標 x 夾在舞台內再判區)。只有 pointer capture
// 讓 `clientX` 超出視窗時才會走到,沒有任何 story 或瀏覽器閘會產生這種座標;修好當天(f0464cff)唯一的證據是一次
// 手動合成指標的紀錄,把「夾」那一行拿掉,所有既有閘照樣綠(2026-09-05 稽核抓到)。
//
// 載入方式:esbuild 把 agent-panel-fab.tsx 連同相對 import 打成單檔(`.css` 用 empty loader)後在 Node 直接 import,
// 測到的是 source 本身,不會因為忘了 build:lib 而測到舊的。只碰 `AGENT_FAB_DRAG_INTERNALS`(@internal 純函式),
// 不渲染任何 React。
//
// Run: `node --test scripts/test-agent-fab-drag-zones.mjs`(CI 的 browser step 直接呼叫)

import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx')

const { outputFiles } = await build({
  entryPoints: [SRC],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  absWorkingDir: ROOT,
  logLevel: 'silent',
  loader: { '.css': 'empty' },
})
const outfile = join(mkdtempSync(join(tmpdir(), 'fab-drag-')), 'agent-panel-fab.mjs')
writeFileSync(outfile, outputFiles[0].text)
const { AGENT_FAB_DRAG_INTERNALS: I } = await import(outfile)
assert.ok(I && typeof I.dragPoint === 'function' && typeof I.findZone === 'function', '取不到 AGENT_FAB_DRAG_INTERNALS(export 名稱改了?)')

// 與 f0464cff 的手動紀錄同一個舞台:視窗寬 1207,拖到 clientX=1267(超出 60px)。
const stage = { w: 1207, h: 720, inset: 16 }
const band = I.SNAP_ZONES[0]
const bandRect = band.rect(stage)
const yInBand = I.dockMinY(stage) + 10
/** 與 onMove 同一條鏈:指標(舞台座標)→ dragPoint 夾 x → findZone 判區。 */
const zoneAt = (dx, dy, active = null) => I.findZone(I.dragPoint(stage, dx, dy), stage, active)

test('右緣帶的右界就是舞台右緣(沒有夾,拖過頭就落在帶外)', () => {
  assert.equal(bandRect.x + bandRect.w, stage.w)
  assert.equal(bandRect.w, I.BAND_PX)
})

test('拖過舞台右緣 60px、y 在帶內 → 仍判在右緣帶,落點 = 貼邊且 y 在合法範圍', () => {
  const zone = zoneAt(stage.w + 60, yInBand)
  assert.equal(zone, band, '超出右緣應讀作「就在右緣」,不是「不在帶內 → 放開飛回家」')
  const placement = zone.placement(I.dragPoint(stage, stage.w + 60, yInBand), { x: 14, y: 14 }, stage)
  assert.equal(placement.kind, 'dock')
  assert.ok(placement.y >= I.dockMinY(stage) && placement.y <= I.dockMaxY(stage), `y=${placement.y} 超出合法範圍`)
})

test('dragPoint 夾的是 x 的上界:超出右緣讀作右緣、舞台內原樣、左邊夾到 0', () => {
  assert.equal(I.dragPoint(stage, stage.w + 60, yInBand).x, stage.w)
  assert.equal(I.dragPoint(stage, stage.w, yInBand).x, stage.w)
  assert.equal(I.dragPoint(stage, 5, yInBand).x, 5)
  assert.equal(I.dragPoint(stage, -30, yInBand).x, 0)
})

test('y 不夾:帶的上方 / 下方是合法的「不在帶內」,拖過右緣也一樣', () => {
  assert.equal(I.dragPoint(stage, 0, -50).y, -50)
  assert.equal(zoneAt(stage.w + 60, I.dockMinY(stage) - 1), null)
  assert.equal(zoneAt(stage.w + 60, bandRect.y + bandRect.h + 1), null)
})

test('往左拖離帶:已在帶內多 16px 遲滯才算離開;未曾在帶內則以帶的左界為準', () => {
  const edge = stage.w - I.BAND_PX
  assert.equal(zoneAt(edge - I.HYSTERESIS + 1, yInBand, band), band, '遲滯內仍在帶')
  assert.equal(zoneAt(edge - I.HYSTERESIS - 1, yInBand, band), null, '超過遲滯才離開')
  assert.equal(zoneAt(edge, yInBand, null), band)
  assert.equal(zoneAt(edge - 1, yInBand, null), null, '沒有 active zone 就沒有遲滯')
})

test('onMove 真的走 dragPoint(防止測試只測自己:規則若被改回 inline clamp,本測必紅)', () => {
  const src = readFileSync(SRC, 'utf8')
  assert.match(src, /const p = dragPoint\(stage, ev\.clientX - originX, ev\.clientY - originY\)/)
  assert.doesNotMatch(src, /x:\s*clamp\(ev\.clientX - originX/)
})
