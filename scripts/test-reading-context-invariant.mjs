#!/usr/bin/env node
// meta-test for reading-context-invariant —— 兩件事:
//  (1) 同組同高的解析規則(field-context.ts resolveGroupPreferredSize:範圍裡各列的控件偏好,不同時取最小)判定表 ——
//      瀏覽器段量不到「兩種偏好並存」(今天只有 InlineEdit 宣告 sm),所以這一條在這裡用純函式鎖;讀 build:lib 產出的 dist
//      (與 storybook 同一份程式碼),dist 比原始碼舊 / 不存在時印共用標記(缺前置),必需瀏覽器的 lane 裡判紅。
//      同檔的 fieldFramelessValueProps(在 Field 裡才掛「沒有框的值」記號)一併判。
//  (2) 閘本身:現況必綠 + --selftest 對照組必紅(靜態 7 種 + 瀏覽器 16 種破法,各破法預期紅的格住閘檔 MUTANTS / STATIC_MUTANTS)。
// 缺建置 / 起不了瀏覽器的略過判準與其他閘同一份(runGateSelftestMeta),不另抄。
import { existsSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'
import { MISSING_BUILD_MARKER, STALE_BUILD_MARKER, isBrowserRequired } from './lib/launch-browser.mjs'

const DIST = 'packages/design-system/dist/components/Field/field-context.js'
const SRC = 'packages/design-system/src/components/Field/field-context.ts'

let ok = true
if (!existsSync(DIST) || statSync(DIST).mtimeMs < statSync(SRC).mtimeMs) {
  const marker = existsSync(DIST) ? STALE_BUILD_MARKER : MISSING_BUILD_MARKER
  console.log(`${marker} ${DIST} ${existsSync(DIST) ? '比原始碼舊' : '不存在'}(先跑 npm run build:lib)—— 同組同高判定表這次沒驗`)
  if (isBrowserRequired()) { console.error('✗ 這個 lane 宣告必需建置,缺了就是 job 壞了,不准略過'); ok = false }
} else {
  const { resolveGroupPreferredSize, fieldFramelessValueProps } = await import(pathToFileURL(resolve(DIST)).href)
  const table = [
    ['沒有人登記 → null(各列照舊:自己的控件偏好 → md)', [], null],
    ['只有 InlineEdit 的 sm', ['sm'], 'sm'],
    ['md 先登記、sm 後登記 → sm', ['md', 'sm'], 'sm'],
    ['sm 先登記、md 後登記 → sm(結果不看掛載先後)', ['sm', 'md'], 'sm'],
    ['lg 與 md → md(取最小)', ['lg', 'md'], 'md'],
    ['同一種偏好重複 → 它本身', ['lg', 'lg'], 'lg'],
  ]
  for (const [label, input, expected] of table) {
    const got = resolveGroupPreferredSize(input)
    const pass = got === expected
    if (!pass) ok = false
    console.log(`${pass ? '✓' : '✗'} 同組同高:${label}(實得 ${got})`)
  }
  const inField = JSON.stringify(fieldFramelessValueProps(true)), outside = fieldFramelessValueProps(false)
  const markerOk = inField === '{"data-field-frameless-value":""}' && outside === undefined
  if (!markerOk) ok = false
  console.log(`${markerOk ? '✓' : '✗'} 沒有框的值記號:在 Field 裡 ${inField}、Field 外 ${String(outside)}`)
}
if (!ok) { console.error('✗ 純函式判定表沒過 —— 先修,再看閘本身'); process.exit(1) }

runGateSelftestMeta('scripts/reading-context-invariant.mjs')
