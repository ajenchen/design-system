// ═══════════════════════════════════════════════════════════════════════════
// DataTable 表頭 ⌄ 欄位選單「現在收著沒」的唯一量法(2026-11-14,A7 ⑥)
// ═══════════════════════════════════════════════════════════════════════════
//
// 被量的東西:data-table.tsx 表頭每一欄的 `[data-col-menu]` 外層 —— 收起時是「寬 0 + 透明 + 裁掉」,不是 display:none
// (同檔「右區:⌄ menu」那段註解:節點一直在版面裡、一直可聚焦;展開的三條路 = 滑過整格 / 格裡有鍵盤焦點 / 選單開著)。
//
// 為什麼收成一份:同一個「⌄ 收著沒」原本只有 modifier-click-focus-invariant.mjs 自己量一行(只看寬 0);
// data-table-multi-sort-invariant.mjs 的 D 兩格也要量同一件事。兩份各寫各的,下次收起的寫法一改(例:改回 display)就只會修到一份(M17)。
//
// 消費者:scripts/data-table-multi-sort-invariant.mjs(D:桌機靜止時 ⌄ 收起,含已排序的欄)、
//         scripts/modifier-click-focus-invariant.mjs(P:Shift+點過排序區、指標移開後 ⌄ 收起)。
// 判定的對照(寬 0 但不透明 / 透明但有寬 / 找不到 → 都不算收起)在 data-table-multi-sort-invariant.mjs 的 D 段每次都跑。

/**
 * 頁面端(以 page.evaluate 序列化傳入,**不得引用外部變數**):每個看得到的表頭一筆。
 * `found: false` = 這一欄沒有 `[data-col-menu]` 或裡面沒有按鈕 —— 呼叫端必須當**儀器失效**,不得當成「收起」也不得當成「沒收起」。
 * @returns {{ index: number, column: string|null, found: boolean, sort?: string|null, label?: string|null, width?: number, opacity?: string, hasFocus?: boolean }[]}
 */
export function columnMenuStatesInPage() {
  const heads = [...document.querySelectorAll('[role="columnheader"][data-column-id]')].filter((h) => !h.closest('[aria-hidden="true"]'))
  return heads.map((h, index) => {
    const column = h.getAttribute('data-column-id')
    const wrap = h.querySelector('[data-col-menu]')
    const button = wrap?.querySelector('button') ?? null
    if (!wrap || !button) return { index, column, found: false }
    return {
      index, column, found: true,
      sort: h.getAttribute('aria-sort'),
      label: button.getAttribute('aria-label'),
      width: wrap.getBoundingClientRect().width,
      opacity: getComputedStyle(wrap).opacity,
      // 焦點在不在這一欄的表頭裡(modifier-click-focus 用它找「剛才點的那一欄」,不靠欄 id 比對)
      hasFocus: h.contains(document.activeElement),
    }
  })
}

/**
 * 收起 = 寬 0 **而且**透明(data-table.tsx `[data-col-menu]` 的基底 class `w-0 overflow-hidden opacity-0`)。純函式。
 * 兩個條件都要:只看寬 0,「寬 0 但 overflow 露出來、不透明」會被當成收起;只看透明,「佔著位置的透明按鈕」會被當成收起。
 */
export const isColumnMenuCollapsed = (m) => Boolean(m) && m.found === true && m.width === 0 && m.opacity === '0'

/** 訊息用:一欄的 ⌄ 現在長什麼樣(找不到時照實說)。同一頁可能有兩張表、欄 id 相同,所以帶上「頁面上第幾個表頭」。純函式。 */
export const describeColumnMenu = (m) => {
  const who = `${m?.column ?? '(未知欄)'}(第 ${(m?.index ?? -1) + 1} 個表頭)`
  return m?.found ? `${who} 寬 ${m.width} 透明度 ${m.opacity}` : `${who} 找不到 ⌄`
}
