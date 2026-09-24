#!/usr/bin/env node
// meta-test for lib/storybook-static-snapshot.mjs —— 兩面對照:該拒絕時拒絕(以「儀器失效」的名義),
// 該放行時放行,而且放行後的快照真的與原目錄脫鉤(原目錄被清空/重建,快照不動)。
// 背景:data-table-invariants.mjs 2026-09-24 本機誤紅一次,因為另一個 agent 同時 build-storybook 清空了
// 輸出目錄,而閘每次導覽都讀活目錄(M37:把「路徑」當成「建置身分」)。
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { snapshotStorybookStatic, StorybookBuildNotStableError } from './lib/storybook-static-snapshot.mjs'

const work = mkdtempSync(join(tmpdir(), 'snapshot-meta-'))
const src = join(work, 'storybook-static')
const fixture = (marker = '{"builtAt":"2026-09-24T00:00:00.000Z"}') => {
  rmSync(src, { recursive: true, force: true })
  mkdirSync(join(src, 'assets'), { recursive: true })
  writeFileSync(join(src, 'iframe.html'), '<div id="storybook-root"></div>')
  writeFileSync(join(src, 'assets', 'data-table.js'), 'export {}')
  if (marker !== null) writeFileSync(join(src, 'build-info.json'), marker)
}
let passed = 0
const check = (label, fn) => { fn(); passed++; console.log(`✓ ${label}`) }

try {
  check('沒有 build-info.json(建置進行中 / 沒建完)→ 以儀器失效拒絕', () => {
    fixture(null)
    assert.throws(() => snapshotStorybookStatic(src), (e) => e instanceof StorybookBuildNotStableError && /INSTRUMENT/.test(e.message))
  })
  check('穩定建置 → 放行,快照內容與原目錄逐檔相同', () => {
    fixture()
    const snap = snapshotStorybookStatic(src)
    for (const f of ['iframe.html', 'assets/data-table.js', 'build-info.json']) {
      assert.equal(readFileSync(join(snap.dir, f), 'utf8'), readFileSync(join(src, f), 'utf8'))
    }
    assert.equal(snap.buildInfo.builtAt, '2026-09-24T00:00:00.000Z')
    snap.dispose()
    assert.equal(existsSync(snap.dir), false, 'dispose 後快照目錄必須被移除')
  })
  check('快照建好後原目錄被清空(模擬 build-storybook 第一步)→ 快照不受影響', () => {
    fixture()
    const snap = snapshotStorybookStatic(src)
    rmSync(src, { recursive: true, force: true })
    assert.equal(existsSync(join(snap.dir, 'iframe.html')), true)
    assert.equal(existsSync(join(snap.dir, 'assets', 'data-table.js')), true)
    snap.dispose()
  })
  check('複製途中重建開始(標記被刪)→ 以儀器失效拒絕,且不留下快照目錄', () => {
    fixture()
    let leaked = null
    assert.throws(() => snapshotStorybookStatic(src, { copy: (from, to) => { leaked = to; cpSync(from, to, { recursive: true }); rmSync(join(from, 'build-info.json')) } }),
      (e) => e instanceof StorybookBuildNotStableError && /INSTRUMENT/.test(e.message))
    assert.equal(existsSync(leaked), false)
  })
  check('複製途中重建完成(標記被改寫)→ 以儀器失效拒絕', () => {
    fixture()
    assert.throws(() => snapshotStorybookStatic(src, { copy: (from, to) => { cpSync(from, to, { recursive: true }); writeFileSync(join(from, 'build-info.json'), '{"builtAt":"later"}') } }),
      (e) => e instanceof StorybookBuildNotStableError)
  })
  check('複製本身失敗 → 以儀器失效拒絕(不是被測元件的失敗)', () => {
    fixture()
    assert.throws(() => snapshotStorybookStatic(src, { copy: () => { throw new Error('ENOENT') } }), (e) => e instanceof StorybookBuildNotStableError)
  })
  console.log(`✓ storybook-static-snapshot meta-test: ${passed}/6`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
