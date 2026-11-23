/**
 * DataTable「看得見的列帶」—— 給瀏覽器閘在頁面端算取樣點 / 可視範圍(`page.evaluate(dtVisibleBand, i)`)。
 *
 * 為什麼要一個共用函式(2026-11-05,待辦總帳 Q2b):表頭與三個表身面板改住在**同一個捲動盒**裡之後,
 * 表身面板的盒子就是整份內容(數千 px 高、比可視寬還寬),拿它的 getBoundingClientRect 當「看得見的地方」會指到畫面外;
 * 看得見的列帶 = 捲動盒的內容盒,再扣掉盒內黏頂的表頭(縱軸)與兩側黏住的釘選面板(中央區的橫軸)。
 * 修前(兩個捲動盒)的建置也要能量(對照組):那時中央表身面板自己就是 `[data-datatable-hscroll]`、表頭在盒外,
 * 這個函式算出來就是中央面板的內容盒 —— 兩代結構同一個答案。
 *
 * 函式本身**必須自足**(會被序列化進頁面執行,不能閉包任何外部識別字)。
 *
 * @param {number} index 第幾張表(依 `[data-datatable-hscroll]` 在文件中的順序)
 * @returns {{ top:number, bottom:number, left:number, right:number, centerLeft:number, centerRight:number,
 *             cx:number, cy:number, headerBottom:number|null, scrollerTop:number } | null}
 *   top / bottom = 列帶的上下緣(視窗座標);left / right = 捲動盒內容盒左右緣;centerLeft / centerRight = 中央區(扣掉釘選面板)的左右緣;
 *   cx / cy = 中央區看得見那一塊的中心點。
 */
export function dtVisibleBand(index = 0) {
  const sc = document.querySelectorAll('[data-datatable-hscroll]')[index]
  if (!sc) return null
  const table = sc.closest('[role="table"], [role="grid"]') ?? sc.parentElement
  const r = sc.getBoundingClientRect()
  // 版面 px → 畫面 px(祖先有 transform: scale 時兩者差一個倍率)
  const ky = sc.offsetHeight > 0 ? r.height / sc.offsetHeight : 1
  const kx = sc.offsetWidth > 0 ? r.width / sc.offsetWidth : 1
  const head = sc.querySelector('.dtHeaderRowGroup')
  const headerBottom = head ? head.getBoundingClientRect().bottom : null
  const top = Math.max(r.top + sc.clientTop * ky, headerBottom ?? -Infinity)
  const bottom = r.top + (sc.clientTop + sc.clientHeight) * ky
  const left = r.left + sc.clientLeft * kx
  const right = r.left + (sc.clientLeft + sc.clientWidth) * kx
  const pinned = (side) => {
    const p = table?.querySelector(`[data-datatable-panel="${side}"]`)
    return p && sc.contains(p) ? p.getBoundingClientRect() : null
  }
  const L = pinned('left'), R = pinned('right')
  const centerLeft = L ? Math.max(left, L.right) : left
  const centerRight = R ? Math.min(right, R.left) : right
  return {
    top, bottom, left, right, centerLeft, centerRight, headerBottom, scrollerTop: r.top,
    cx: Math.round((centerLeft + centerRight) / 2), cy: Math.round((top + bottom) / 2),
  }
}
