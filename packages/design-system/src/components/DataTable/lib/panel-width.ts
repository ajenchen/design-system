// @internal — 表格三個工具面板(排序 `../data-table-sort-manager.tsx` / 篩選 `../data-table-filter-panel.tsx` /
// 欄位顯示 `../data-table-column-visibility-panel.tsx`)共用的寬度參數(2026-11-15,A19)。
//
// 依據(逐字):user 2026-11-11「此外，所有data table的工具面板應該都要具備可以被消費者調整寬度的能力對吧？處理方式照你建議，
// 但好奇我們ds width通常是用在哪？這邊不得用的原因為何」;名字照 user 同日「尺寸:甲」= `width` + `minWidth` / `maxWidth`(數字 = px)。
// 「照你建議」採用的 AI 建議(research-r5 選項 B):有型別的寬度參數 + 視窗夾限 + 下限;篩選面板巢狀模式由元件自動加群組外框的差額
// (AI 傾向的子選項「甲」);寬度改走參數、className 不是正式管道。
// 規格:`../data-table.spec.md`「工具面板的寬度」;命名:`ds-canonical/references/props-naming.md`「尺寸參數」。
import * as React from 'react'
import { OVERLAY_VIEWPORT_MAX_WIDTH } from '@/design-system/tokens/elevation/overlay-geometry'

/** 三個工具面板共用的寬度參數(數字一律 px) */
export interface DataTablePanelWidthProps {
  /**
   * 面板寬(px)。不傳 = 元件預設(排序 30rem / 篩選 640px、巢狀 760px / 欄位顯示撐滿外層 `PopoverContent`)。
   * 篩選面板的巢狀模式自動加群組外框的差額(120px,同預設 640 → 760)。視窗比它窄時夾在視窗內(左右各留 1rem)。
   * 欄位顯示面板傳了 `width`,外層 `PopoverContent` 要改 `width="hug"`(同排序 / 篩選面板),否則被外層的寬裁掉。
   */
  width?: number
  /**
   * 下限(px)。只能把 DS 的下限往上拉:比 DS 下限小時以 DS 下限為準(DS 下限 = 列裡的固定零件 + 會長的那一格最窄可用寬,
   * 低於它列會壞)。視窗比下限窄時,視窗夾限優先(不超出視窗)。
   */
  minWidth?: number
  /** 上限(px)。不會把面板壓到 DS 下限以下(下限優先);不傳 = 只有視窗夾限。 */
  maxWidth?: number
}

/** 面板自己的下限:`rem` 跟著使用者字級(列裡的下拉寬是 rem),`px` 是固定零件(垃圾桶、內距) */
export interface PanelWidthFloor {
  rem: number
  px?: number
}

const floorCss = (f: PanelWidthFloor) => (f.px ? `calc(${f.rem}rem + ${f.px}px)` : `${f.rem}rem`)

/**
 * 算出面板根元素的 inline style(下限、上限恆寫;寬只有產品傳了才寫 —— 預設寬留在元件自己的 class,畫面不變)。
 * CSS 的 `min-width` 勝過 `max-width` 與 `width`,所以「下限優先於上限」不必另寫判斷;下限再用 `min(…, 視窗夾限)` 包住,
 * 視窗窄於下限時視窗夾限才是最後一句話。`extraWidth` = 篩選面板巢狀模式加在 `width` 上的群組外框差額(只加在寬上,上下限是整個面板的邊界)。
 */
export function panelWidthStyle(
  { width, minWidth, maxWidth }: DataTablePanelWidthProps,
  floor: PanelWidthFloor,
  extraWidth?: string,
): React.CSSProperties {
  const vp = OVERLAY_VIEWPORT_MAX_WIDTH
  const base = floorCss(floor)
  const style: React.CSSProperties = {
    minWidth: `min(${minWidth != null ? `max(${base}, ${minWidth}px)` : base}, ${vp})`,
    maxWidth: maxWidth != null ? `min(${maxWidth}px, ${vp})` : vp,
  }
  if (width != null) style.width = extraWidth ? `calc(${width}px + ${extraWidth})` : `${width}px`
  return style
}

/**
 * 開發模式提醒:產品給的 `width` 比 DS 下限還窄(畫面照下限畫,不會壞,但寫的值沒有作用)。
 * 用根元素字級把 rem 換成 px(使用者字級不是 16px 時下限跟著變)。research-r5 選項 B 第 4 點「低於下限時在開發模式提出警告」。
 */
export function useWarnBelowPanelFloor(name: string, width: number | undefined, floor: PanelWidthFloor) {
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production' || width == null || typeof document === 'undefined') return
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const floorPx = floor.rem * rootPx + (floor.px ?? 0)
    if (width < floorPx) {
      console.warn(`[${name}] width={${width}} 比面板下限 ${Math.round(floorPx)}px 窄,照下限畫(下限保護列不被擠壞;data-table.spec.md「工具面板的寬度」)。`)
    }
  }, [name, width, floor.rem, floor.px])
}
