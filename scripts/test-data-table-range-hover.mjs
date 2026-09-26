#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable I31(區間格 × 列滑過兩主題釘住)的判定分得出三種情形 —— 產品沒釘住(fail)、儀器看不到滑過(instrument)、真的釘住(pass)
 *   紅: 區間格滑過前後差 > 1 → fail;同一列非區間格沒變色 / 列沒帶 data-hovered / 取樣點不屬於那一格 / 主題沒切到 / 區間沒建立 → instrument
 *   綠: 區間格沒變、非區間格有變且等於沒有區間的列 → pass
 *
 * 判定表的像素**全部來自 2026-09-25 的實測**(同一份 storybook-static,就地編輯 + 試算表浮層):
 *   A 現況(釘住規則尚未進建置):淺 pass、深 fail(#1C304A → #243851,與 R11 一致)
 *   B 注入 data-table.css 的釘住規則:兩主題 pass
 *   C 把列滑過整個拿掉:兩主題 instrument(區間格「沒變」不能算通過)
 * 另加幾格邊界(容差、對照列不同色、欄位缺漏),以及「呼叫端真的消費這支判定」的檢查(M32 參數邊界盲點)。
 *
 *   node scripts/test-data-table-range-hover.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rangeHoverPinVerdict, rangeHoverVerdictCases, PIN_TOLERANCE } from './lib/data-table-range-hover.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CASES = rangeHoverVerdictCases()

let bad = 0
for (const [name, input, expected] of CASES) {
  const { verdict, problems } = rangeHoverPinVerdict(input)
  const ok = verdict === expected
  if (!ok) bad++
  console.log(`${ok ? '✓' : '✗'} ${name}:期望 ${expected},得 ${verdict}${problems.length ? `(${problems[0]})` : ''}`)
}
if (PIN_TOLERANCE !== 1) { bad++; console.log(`✗ 容差應為 1(只吸收編碼誤差),實得 ${PIN_TOLERANCE}`) }

// 呼叫端必須真的消費這支判定(否則判定表測的是一份沒人用的實作)
const gate = readFileSync(join(ROOT, 'scripts/data-table-invariants.mjs'), 'utf8')
for (const needle of ['measureRangeHoverPin(page', 'rangeHoverPinVerdict(m)', "record('I31'"]) {
  const found = gate.includes(needle)
  if (!found) bad++
  console.log(`${found ? '✓' : '✗'} data-table-invariants.mjs 消費共用實作:${needle}`)
}

console.log(bad ? `\n✗ ${bad} 格不符` : `\n✓ ${CASES.length} 格判定 + 呼叫端檢查全數成立`)
process.exit(bad ? 1 : 0)
