/**
 * 欄寬分配演算法(純函式,零 React 依賴)。
 *
 * **為什麼獨立成一個模組**:它是唯一決定「每欄多寬」的地方 —— DataTable 的 header 與 body 都只
 * 「讀」它的輸出(對應 AG Grid v33 的 `AgColumn.actualWidth`)。抽出來的直接好處是它可以被
 * **純函式單測**(`scripts/test-distribute-column-widths.mjs`):撞上限後凍結、重分配那條分支
 * 在 story 裡不會被走到,只靠瀏覽器層的 I11 斷言等於沒有證據(2026-09-03 跨模型對照時發現)。
 */

/**
 * 欄寬分配:**算一次**,兩邊寫同一個整數。
 *
 * 這是 AG Grid v33(= 我們對照的那一代)的模型:欄寬由 JS 算進 `AgColumn.actualWidth`,
 * header cell 與 body cell 各自把**同一個整數**寫成 `style.width`,所以兩個容器寬度不同時,
 * 差額只會變成右端的空白,**不可能**被分攤到每一欄。我們原本把分配交給 CSS flex,由瀏覽器在
 * header 與 body 兩個容器裡各跑一次 —— 只要兩邊可用寬度差一點(捲軸、border、取整),
 * `flex-grow: 1` 就會把差額平均攤到每一欄並逐欄累積(2026-09-03 實測 7 欄:0 / 2.1 / 4.3 /
 * 6.4 / 8.6 / 10.7 / 12.9,增量恰為 15/7)。
 *
 * 取整用**前綴和游標**(`round(累積理想 − 累積已配)`,同 AG Grid `columnFlexService`):
 * 第 i 欄的取整誤差被第 i+1 欄吸收,總誤差固定 ±0.5px 不累積;最後把餘數補給最後一欄,
 * 保證總和 = 可用寬度。
 *
 * @param bases 每欄的基準寬(`col.getSize()`)
 * @param maxes 每欄的上限(無上限傳 undefined)
 * @param available 可用寬度;**一律取 body 的內容寬**(較窄的那個),header 多出來的部分變成尾端空白
 */
export function distributeColumnWidths(
  bases: number[],
  maxes: (number | undefined)[],
  available: number,
): number[] {
  const n = bases.length
  if (n === 0) return []
  const total = bases.reduce((a, b) => a + b, 0)
  // 放不下 → 各自 base,水平溢出(與原本 `minWidth: baseSize` 不可 shrink 的行為一致)
  if (!Number.isFinite(available) || available <= total) return bases.map((b) => Math.round(b))

  // 撞到 maxWidth 的欄先凍結,剩餘空間重新分給沒凍結的(同 flexbox 的 resolve-flexible-lengths)
  const frozen = new Array<boolean>(n).fill(false)
  const out = new Array<number>(n).fill(0)
  for (let guard = 0; guard <= n; guard++) {
    const freeCols: number[] = []
    let frozenWidth = 0
    for (let i = 0; i < n; i++) (frozen[i] ? (frozenWidth += out[i]) : freeCols.push(i))
    if (freeCols.length === 0) break
    const freeBase = freeCols.reduce((a, i) => a + bases[i], 0)
    const space = available - frozenWidth
    const grow = Math.max(0, space - freeBase) / freeCols.length
    let violated = false
    for (const i of freeCols) {
      const want = bases[i] + grow
      const cap = maxes[i]
      if (cap != null && Number.isFinite(cap) && want > cap) {
        out[i] = cap
        frozen[i] = true
        violated = true
      }
    }
    if (!violated) {
      // 前綴和取整:誤差不累積
      let idealRight = frozenWidth
      let actualLeft = frozenWidth
      for (const i of freeCols) {
        idealRight += bases[i] + grow
        const w = Math.round(idealRight - actualLeft)
        out[i] = w
        actualLeft += w
      }
      // 餘數給最後一欄,總和 = available
      const last = freeCols[freeCols.length - 1]
      out[last] += available - actualLeft
      break
    }
  }
  return out
}
