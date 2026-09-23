/**
 * @internal — DatePicker.Range 的「區間預覽」判定 —— 純函式,供判定表逐格驗(scripts/test-range-preview.mjs)。
 * 不進 barrel / subpath(consumer 用不到它;只有 DatePicker 內部與測試消費)。
 *
 * SSOT:`date-picker.spec.md`「區間預覽」(規則表 + user 2026-09-23 原話);
 * 畫法 owner:`../DateGrid/date-grid.tsx` `RANGE_PREVIEW_CLASSNAMES`(本檔只算「框哪幾天」,不管怎麼畫)。
 *
 * 要保證的性質(逐字):**停留(滑鼠 / 鍵盤焦點)在某一天時,框出「現在點下去,區間會變成從哪到哪」。**
 *   - 正在選結束日、開始日已選:anchor ≥ 開始日 → [開始日, anchor];anchor 在開始日之前是不可點的日子,不預覽
 *   - 正在選開始日、結束日已選:anchor ≤ 結束日 → [anchor, 結束日];之後的不可點,不預覽
 *   - 對面那一端還空(第一次點之前):沒有另一端可以框 → 不預覽(停留格照舊畫單格圈,由 DateGrid 管)
 *   - anchor 與既有端點同一天:單格(完整一圈,兩端都是它)
 *
 * 全部以「日」比較(去掉時分秒):showTime 的端點帶時間,但預覽只關心日曆格。
 */

export type RangePreviewActiveEnd = 'start' | 'end'

export interface RangePreviewInput {
  /** 正在選哪一端(DatePicker.Range 的 activeEnd) */
  activeEnd: RangePreviewActiveEnd
  /** 已選的開始日(可含時間;DatePicker 的 isoToDate 回 undefined,這裡兩種空值都收) */
  start: Date | null | undefined
  /** 已選的結束日(可含時間) */
  end: Date | null | undefined
  /** 停留日:滑鼠所在或鍵盤焦點所在的日曆格 */
  anchor: Date | null | undefined
}

export interface RangePreview {
  from: Date
  to: Date
}

/** react-day-picker `modifiers` 的形狀:單日 = Date,連續多日 = { from, to }(RDP 以「日」比對) */
export interface RangePreviewModifiers {
  previewSingle?: Date
  previewStart?: Date
  previewMiddle?: { from: Date; to: Date }
  previewEnd?: Date
}

export function startOfDay(date: Date): Date {
  const day = new Date(date.getTime())
  day.setHours(0, 0, 0, 0)
  return day
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + days)
  return next
}

/** 停留日 → 「點下去會變成」的區間;不該預覽時回 null。 */
export function computeRangePreview({ activeEnd, start, end, anchor }: RangePreviewInput): RangePreview | null {
  if (!anchor) return null
  const day = startOfDay(anchor)
  if (activeEnd === 'end') {
    if (!start) return null
    const from = startOfDay(start)
    if (day.getTime() < from.getTime()) return null
    return { from, to: day }
  }
  if (!end) return null
  const to = startOfDay(end)
  if (day.getTime() > to.getTime()) return null
  return { from: day, to }
}

/** 區間 → DateGrid 的四個 preview modifier(單日 / 起點 / 中段 / 終點)。 */
export function rangePreviewModifiers(preview: RangePreview | null): RangePreviewModifiers {
  if (!preview) return {}
  const from = startOfDay(preview.from)
  const to = startOfDay(preview.to)
  if (from.getTime() === to.getTime()) return { previewSingle: from }
  const modifiers: RangePreviewModifiers = { previewStart: from, previewEnd: to }
  const middleFrom = addDays(from, 1)
  const middleTo = addDays(to, -1)
  if (middleTo.getTime() >= middleFrom.getTime()) modifiers.previewMiddle = { from: middleFrom, to: middleTo }
  return modifiers
}
