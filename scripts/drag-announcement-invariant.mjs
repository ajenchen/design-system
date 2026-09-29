#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Drag announcement invariant — 防「DndContext 沒接播報」回流
// ═══════════════════════════════════════════════════════════════════════════
//
// 2026-09-07:全 DS 4 個 DndContext 先前沒有任何一個傳 `accessibility`,於是吃
// dnd-kit 的英文預設播報,而且它從自己的生命週期發 —— 我們的守衛 return 掉、
// 根本沒重排時,螢幕閱讀器仍會聽到「已放到 X」(對輔助科技宣稱假結果)。
// 修完之後這支閘防止未來新增 DndContext 時漏接。
//
// 形狀照 `scripts/agent-panel-fixed-anatomy-invariant.mjs`:純靜態掃描 + selftest。

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 路徑含中文 → 必須用 fileURLToPath 解碼,不能用 .pathname(會留下 %E6 這種百分號編碼)
const ROOT = fileURLToPath(new URL('../packages/design-system/src', import.meta.url))

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.tsx') && !name.includes('.stories.')) out.push(p)
  }
  return out
}

/**
 * 回傳 [{file, line, missing}] —— 有 `<DndContext` 卻少了必要 prop 的位置。
 *
 * 兩個必要 prop,少任何一個都是**靜默**壞掉:
 *   `accessibility={{ announcements`  少了 → 吃 dnd-kit 英文預設,且它從自己的生命週期發,
 *                                      守衛 return 掉時仍會播假的成功訊息
 *   `sensors`                          少了 → 吃預設 PointerSensor(**零距離即啟動**),
 *                                      使用者只想點一下,零位移就觸發拖曳 + 兩則 assertive 播報
 *                                      (2026-09-07 C4:欄位顯示面板與排序面板都中)
 */
// 2026-09-27(待辦總帳 OE10):播報改走 `useDragAccessibility` 的 **polite** 區域 —— dnd-kit 自己的 live region
// 寫死 assertive(`@dnd-kit/accessibility` LiveRegion),每到一個落點就打斷螢幕閱讀器。所以判準從
// 「有沒有 accessibility={{ announcements }}」換成三件事:(1) 檔案有呼叫 `useDragAccessibility(`;
// (2) `<DndContext … accessibility={<x>.accessibility}` 把 hook 的物件整份交給 dnd-kit(不准再直傳 announcements ——
// 那條路的文字會落在 assertive 區域);(3) 檔案有渲染 `{<x>.liveRegion}`(沒渲染 = 整趟拖曳無聲,靜默)。
export function findUnannouncedDndContexts(files) {
  const bad = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    if (!src.includes('<DndContext')) continue
    const usesHook = /\buseDragAccessibility\(/.test(src)
    const rendersLiveRegion = /\{\s*[A-Za-z_$][\w$]*\.liveRegion\s*\}/.test(src)
    const lines = src.split('\n')
    lines.forEach((l, i) => {
      if (!l.includes('<DndContext')) return
      // 看這個 JSX 開標籤到 `>` 為止的區塊內有沒有 accessibility
      let block = ''
      for (let j = i; j < Math.min(i + 30, lines.length); j++) {
        block += lines[j] + '\n'
        if (/^\s*>\s*$/.test(lines[j]) || /accessibility=\{[^}]*\}\s*>/.test(lines[j]) || lines[j].includes('announcements }}>')) break
      }
      const missing = []
      if (/accessibility=\{\{\s*announcements/.test(block)) missing.push('accessibility={{ announcements }} 直傳給 dnd-kit(文字會落在它寫死的 assertive 區域)')
      else if (!/accessibility=\{[A-Za-z_$][\w$]*\.accessibility\}/.test(block)) missing.push('accessibility={<hook>.accessibility}')
      if (!usesHook) missing.push('useDragAccessibility(…)(lib/drag-announcements.ts)')
      if (!rendersLiveRegion) missing.push('{<hook>.liveRegion} 沒渲染(polite 區域不在 DOM = 整趟拖曳無聲)')
      if (!/\bsensors=\{/.test(block)) missing.push('sensors(啟動門檻)')
      if (missing.length) bad.push({ file: f.replace(ROOT, 'src'), line: i + 1, missing: missing.join(' + ') })
    })
  }
  return bad
}

if (process.argv.includes('--selftest')) {
  const good = 'const drag = useDragAccessibility({ getOutcome, kind: "列" })\n'
  const cases = [
    { src: '<DndContext\n  onDragEnd={x}\n>', shouldFail: true },
    { src: good + '<DndContext\n  onDragEnd={x}\n  accessibility={drag.accessibility}\n>\n{drag.liveRegion}', shouldFail: true },  // 缺 sensors
    { src: good + '<DndContext\n  sensors={s}\n  onDragEnd={x}\n>\n{drag.liveRegion}', shouldFail: true },  // 缺播報
    { src: '<DndContext sensors={s} onDragEnd={x} accessibility={{ announcements }}>', shouldFail: true },  // 舊寫法:直傳 → assertive
    { src: good + '<DndContext sensors={s} onDragEnd={x} accessibility={drag.accessibility}>', shouldFail: true },  // 沒渲染 liveRegion
    { src: '<DndContext sensors={s} onDragEnd={x} accessibility={drag.accessibility}>\n{drag.liveRegion}', shouldFail: true },  // 沒呼叫 hook
    { src: good + '<DndContext sensors={s} onDragEnd={x} accessibility={drag.accessibility}>\n  {drag.liveRegion}\n</DndContext>', shouldFail: false },
    { src: good + '<DndContext\n  sensors={s}\n  onDragEnd={x}\n  accessibility={drag.accessibility}\n>\n  {node}\n  {drag.liveRegion}', shouldFail: false },
    { src: 'no dnd here', shouldFail: false },
  ]
  let ok = true
  cases.forEach((c, i) => {
    const tmp = join(process.env.TMPDIR || '/tmp', `dai-selftest-${i}.tsx`)
    writeFileSync(tmp, c.src)
    const got = findUnannouncedDndContexts([tmp]).length > 0
    if (got !== c.shouldFail) { console.error(`selftest ${i} FAIL: 預期 ${c.shouldFail} 實得 ${got}`); ok = false }
  })
  console.log(ok ? `✓ selftest ${cases.length}/${cases.length} 通過` : '✗ selftest 失敗')
  process.exit(ok ? 0 : 1)
}

const bad = findUnannouncedDndContexts(walk(ROOT))
if (bad.length) {
  console.error('✗ 下列 DndContext 少了必要接線(每一項都是靜默壞掉):')
  console.error('  · const drag = useDragAccessibility({ getOutcome, kind })(`lib/drag-announcements.ts`)→ accessibility={drag.accessibility} + 渲染 {drag.liveRegion}')
  console.error('  · sensors → PointerSensor 帶 `lib/drag-visual.ts` 的 DRAG_ACTIVATION_DISTANCE_PX')
  bad.forEach(b => console.error(`    ${b.file}:${b.line}  缺:${b.missing}`))
  process.exit(1)
}
console.log('✓ 全部 DndContext 都已接繁中播報(誠實回報結果)且設了拖曳啟動門檻')
