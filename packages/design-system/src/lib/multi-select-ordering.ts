/**
 * multi-select-ordering — SSOT primitive for "Select All" / bulk-select value ordering
 *
 * **Canonical**:Path A(preserve existing user click order + append unselected options
 * in source/canonical order,with dedup)。
 *
 * **Source basis(Layer A + Codex M31 Round 4 共識,2026-05-16 user verbatim approve「就照
 * 你們的共識做到完美確保有 SSOT」)**:
 *
 * Ant Design 跨元件「Select All」 bulk-select canonical 證據:
 * - **Transfer**(`components/transfer/index.tsx`): `Array.from(new Set([...prevKeys, ...keys]))`
 *   — preserve previous selection order + append new bulk keys with dedup
 * - **Table rowSelection selectAll**(`components/table/hooks/useSelection.tsx`): existing keySet
 *   + flattened source-order append via `Array.from(keySet)`
 * - **Checkbox.Group**(`components/checkbox/Group.tsx`): 強制 sort source order(更嚴格 B 變體,
 *   但只用於 onChange callback,非 bulk-select 動作)
 *
 * **PeoplePicker / SelectMenu「全部」 footer 場景對應**:
 * - 動作語意 = Transfer / Table rowSelection 的「Select All」(bulk 選 remaining items)
 * - 跟 Checkbox.Group 不同(後者沒 Select All button,只是 onChange 回 sort)
 * - **採 path A**(preserve+append)為 ordering canonical
 *
 * **為何 SSOT(user 要求以後同類設計都走同一套邏輯、不偏移;原話已不可考,此為轉述)**:
 * 1. 集中 ordering logic 一處,future 改 ordering policy 只改本檔
 * 2. Future consumers(e.g. DataTable filter checkAll / 任何新 multi-select 元件 with Select All
 *    footer)必 import 本 primitive,hook `check_select_all_canonical.sh` 機械強制
 * 3. 對齊 mindset #2「優先消費既有」+ M17「SSOT 必可傳播」+ M23「DS internal canonical 優先」
 *
 * **世界級對照**:Ant Transfer + Table rowSelection canonical(2026-05-16 Round 4 grep verify)。
 * 非「跟世界級對齊」一句空話 — 直接 codify Ant 兩個 bulk-select 元件的 implementation 行為。
 */

/**
 * Apply "Select All" canonical:preserve existing selection order + append unselected options
 * in source order(with dedup)。
 *
 * @param existing — 既有 selection array(user click 累積順序)
 * @param all — 所有可選 options 值 array(source / canonical order — 通常 = `options.filter(!disabled).map(v)`)
 * @returns 新 selection array,既有部分維持原順序在前,新加入部分按 source order append 在後
 *
 * @example
 * ```ts
 * applySelectAll(['c', 'a'], ['a', 'b', 'c', 'd'])  // => ['c', 'a', 'b', 'd']
 * applySelectAll([], ['a', 'b', 'c'])               // => ['a', 'b', 'c']
 * applySelectAll(['a', 'b', 'c'], ['a', 'b', 'c'])  // => ['a', 'b', 'c']
 * ```
 */
export function applySelectAll<T>(existing: readonly T[], all: readonly T[]): T[] {
  const existingSet = new Set(existing)
  const unselected = all.filter((v) => !existingSet.has(v))
  return [...existing, ...unselected]
}

/**
 * Companion:clear all selection。
 * Trivial wrapper for symmetry(consumer 用 `applySelectAll` ↔ `clearSelection` pair 達成
 * 「全選 → 取消全選」 toggle canonical)。
 */
export function clearSelection<T>(): T[] {
  return []
}
