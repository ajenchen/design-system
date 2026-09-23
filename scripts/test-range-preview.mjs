#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DatePicker.Range 的「區間預覽」判定(computeRangePreview / rangePreviewModifiers)對每一種狀態都回
 *        date-picker.spec.md「區間預覽」規則表寫的那個區間:選結束日 → [開始日, 停留日]、選開始日 → [停留日, 結束日]、
 *        對面端點空 / 順序不合 / 沒停留 → 不預覽、同一天 → 單格;比較只看日不看時分秒。
 *   紅: 判定表任一格與純函式輸出不符即 exit 1(判定表列出期望值,不是抄輸出);另以「把停留日換成前一天」的對照組
 *        證明同一列會從有框變沒框(規則真的在改變輸出,不是裝飾)。
 *   綠: 20 格全部相符時綠;純函式無時鐘、無隨機,重複跑結果恆等。
 *
 * Run: `node scripts/test-range-preview.mjs`
 */
import { computeRangePreview, rangePreviewModifiers } from '../packages/design-system/src/components/DatePicker/range-preview.ts'

const d = (m, day, h = 0) => new Date(2026, m - 1, day, h, 0, 0, 0)
const iso = (x) => (x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` : null)
const show = (p) => (p ? `${iso(p.from)}→${iso(p.to)}` : 'null')

const S = d(5, 4, 13) // 開始日帶時間 13:00,驗「只看日」
const E = d(5, 12, 9)

// [名稱, 輸入, 期望]
const TABLE = [
  ['選結束日 / 停留在結束日之後 → 延長', { activeEnd: 'end', start: S, end: E, anchor: d(5, 20) }, '2026-05-04→2026-05-20'],
  ['選結束日 / 停留在中段 → 縮小', { activeEnd: 'end', start: S, end: E, anchor: d(5, 7) }, '2026-05-04→2026-05-07'],
  ['選結束日 / 停留在既有結束日 → 維持', { activeEnd: 'end', start: S, end: E, anchor: d(5, 12) }, '2026-05-04→2026-05-12'],
  ['選結束日 / 停留在開始日當天 → 單格', { activeEnd: 'end', start: S, end: E, anchor: d(5, 4, 0) }, '2026-05-04→2026-05-04'],
  ['選結束日 / 停留在開始日之前(不可點)→ 不預覽', { activeEnd: 'end', start: S, end: E, anchor: d(5, 3) }, 'null'],
  ['只選了開始日 / 停留在後面 → [開始日, 停留日]', { activeEnd: 'end', start: S, end: null, anchor: d(5, 9) }, '2026-05-04→2026-05-09'],
  ['只選了開始日 / 停留在前面 → 不預覽', { activeEnd: 'end', start: S, end: null, anchor: d(5, 1) }, 'null'],
  ['選結束日 / 開始日還空 → 不預覽', { activeEnd: 'end', start: null, end: null, anchor: d(5, 20) }, 'null'],
  ['選開始日 / 停留在結束日之前 → [停留日, 結束日]', { activeEnd: 'start', start: S, end: E, anchor: d(4, 28) }, '2026-04-28→2026-05-12'],
  ['選開始日 / 停留在中段 → 縮小', { activeEnd: 'start', start: S, end: E, anchor: d(5, 9) }, '2026-05-09→2026-05-12'],
  ['選開始日 / 停留在結束日當天 → 單格', { activeEnd: 'start', start: S, end: E, anchor: d(5, 12, 23) }, '2026-05-12→2026-05-12'],
  ['選開始日 / 停留在結束日之後(不可點)→ 不預覽', { activeEnd: 'start', start: S, end: E, anchor: d(5, 13) }, 'null'],
  ['選開始日 / 結束日還空 → 不預覽', { activeEnd: 'start', start: S, end: null, anchor: d(4, 28) }, 'null'],
  ['沒有停留 → 不預覽', { activeEnd: 'end', start: S, end: E, anchor: null }, 'null'],
  ['跨月延長', { activeEnd: 'end', start: S, end: E, anchor: d(6, 3) }, '2026-05-04→2026-06-03'],
]

let fail = 0
for (const [name, input, expected] of TABLE) {
  const got = show(computeRangePreview(input))
  if (got !== expected) { console.log(`✗ ${name}:期望 ${expected} 實得 ${got}`); fail++ }
  else console.log(`✓ ${name}`)
}

// modifiers 形狀
const MODS = [
  ['單日 → 只有 previewSingle', computeRangePreview({ activeEnd: 'end', start: S, end: E, anchor: d(5, 4) }), { previewSingle: '2026-05-04' }],
  ['兩天 → 起點 + 終點,沒有中段', computeRangePreview({ activeEnd: 'end', start: S, end: E, anchor: d(5, 5) }), { previewStart: '2026-05-04', previewEnd: '2026-05-05' }],
  ['三天 → 中段一天', computeRangePreview({ activeEnd: 'end', start: S, end: E, anchor: d(5, 6) }), { previewStart: '2026-05-04', previewMiddle: '2026-05-05→2026-05-05', previewEnd: '2026-05-06' }],
  ['延長到 5/20 → 中段 5/5–5/19', computeRangePreview({ activeEnd: 'end', start: S, end: E, anchor: d(5, 20) }), { previewStart: '2026-05-04', previewMiddle: '2026-05-05→2026-05-19', previewEnd: '2026-05-20' }],
  ['不預覽 → 空物件', null, {}],
]
for (const [name, preview, expected] of MODS) {
  const m = rangePreviewModifiers(preview)
  const got = {}
  if (m.previewSingle) got.previewSingle = iso(m.previewSingle)
  if (m.previewStart) got.previewStart = iso(m.previewStart)
  if (m.previewMiddle) got.previewMiddle = `${iso(m.previewMiddle.from)}→${iso(m.previewMiddle.to)}`
  if (m.previewEnd) got.previewEnd = iso(m.previewEnd)
  const a = JSON.stringify(got); const b = JSON.stringify(expected)
  if (a !== b) { console.log(`✗ ${name}:期望 ${b} 實得 ${a}`); fail++ }
  else console.log(`✓ ${name}`)
}

// 對照組:同一列把停留日往前一天(越過開始日)→ 必從有框變沒框
const framed = computeRangePreview({ activeEnd: 'end', start: S, end: E, anchor: d(5, 4) })
const unframed = computeRangePreview({ activeEnd: 'end', start: S, end: E, anchor: d(5, 3) })
if (!framed || unframed) { console.log('✗ 對照組:停留日越過開始日應該從有框變沒框'); fail++ }
else console.log('✓ 對照組:停留日越過開始日 → 有框變沒框(規則真的在改變輸出)')

console.log(fail ? `✗ ${fail} 項不符` : '✅ 區間預覽判定表 PASS')
process.exit(fail ? 1 : 0)
