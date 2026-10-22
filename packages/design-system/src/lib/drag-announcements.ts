// ═══════════════════════════════════════════════════════════════════════════
// Drag announcements — 拖曳的螢幕閱讀器播報 SSOT
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼有這個檔**(2026-09-07):
// 全 DS 有 4 個 `DndContext`(TreeView、DataTable 列/欄、排序面板、欄位顯示面板),
// 先前**沒有任何一個**傳過 `accessibility` prop(grep 排除 stories = 0 命中),
// 於是四處全部吃 dnd-kit 的英文預設播報(`core.esm.js:44-72`),而且是從它自己的
// 生命週期發的 —— **不知道我們的守衛已經 return、根本沒重排**,會播假的成功訊息。
//
// 這一份是四處共用的繁中播報 SSOT。措辭沿用 DS 既有的 reorder 播報 canonical
// (`TreeView` 的 `DEFAULT_REORDER_ANNOUNCEMENTS`,tree-view.tsx:130 起)的句型,
// 不另創語氣。
//
// **誠實回報結果是本模組的核心契約**:`onDragEnd` 必須由呼叫端提供「有沒有真的
// commit」的判定,沒 commit 就播「未變更」。dnd-kit 的 dispatch 順序是
// `handler?.(event)` 先跑、`dispatchMonitorEvent`(播報)後跑(`core.esm.js:3166-3170`
// 實查),所以呼叫端在自己的 `onDragEnd` 內設 ref,這裡讀它即可 —— 不重算一次
// 判定,避免兩份邏輯漂移。
//
// **契約邊界(必須知道)**:這裡的「已移動」意思是**元件已經送出重排、而且自己的守衛
// 全部通過**。它**看不到**消費者的 handler 有沒有真的把新順序寫回 state ——
// 播報是同步回傳的字串,那時 React 還沒 re-render,量不到結果。
// 所以受控的 `columnOrder` / 資料順序**必須列全**;漏列的那一欄會讓消費者的
// handler 靜默 `return prev`,而螢幕閱讀器仍聽到「已移動」。
// 2026-09-07 錨:ColumnReorder story 的 columnOrder 漏了 `seller`(畫面 7 欄、state 6 個),
// 拖到該欄時就是這個情況;已修 story,並由 `scripts/drag-runtime-contract.mjs` 守著。
//
// **播報的禮貌等級 = polite,不是 assertive**(2026-09-27,待辦總帳 OE10):
// dnd-kit 6.3.1 自己的 live region 寫死 `aria-live="assertive"`
// (`@dnd-kit/accessibility` LiveRegion 的 `ariaLiveType = "assertive"`,`DndContext` 沒有任何 prop 能改),
// 拖曳中每移到一個落點就打斷螢幕閱讀器正在唸的句子。WAI-ARIA 1.2 對 `assertive` 的定義:
// "Indicates that updates to the region have the highest priority and should be presented to the user immediately."
// 並明文 "don't use the assertive value unless the interruption is imperative"
// (<https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live>,
// 轉述 <https://www.w3.org/TR/wai-aria-1.2/#aria-live>)。拖曳的落點回饋不是「必須打斷」的事 ——
// DS 內自己的先例也是這麼判的:TreeView 鍵盤重排的區域是 polite(tree-view.tsx)、Toast 只有 error / warning
// 才 assertive(toast.tsx)、Alert 同(alert.tsx)。所以 `useDragAccessibility` 把文字寫進**本檔自己的 polite 區域**,
// 交給 dnd-kit 的那份永遠是空字串(它的 assertive 區域因此一個字都不會唸)。
// 世界級並非一致(react-beautiful-dnd 的 announcer 是 assertive),這裡依 DS 內既有 canonical(M23)取 polite。
//
// **操作說明也一併改成繁中**:dnd-kit 預設的 `screenReaderInstructions.draggable`
// ("To pick up a draggable item, press the space bar…")會被掛到每一顆把手的 `aria-describedby`,
// 四個 DndContext 先前全部唸英文。

import * as React from 'react'
import { claimEscape, escapeLayerProps, type EscapeLayerProps } from '@/design-system/lib/overlay-escape'

/** 拖曳結果。`null` = 沒有真的重排(被守衛擋下 / 使用者放在原位)。 */
export interface DragOutcome {
  /** 播報時用來指稱被移動的東西,例如「列」「欄位」「項目」 */
  kind: string
  /** 被移動者的可讀名稱 */
  label: string
}

/** dnd-kit 傳給播報的 active 形狀(只取我們用得到的部分)。 */
interface ActiveLike {
  id: string | number
  data?: { current?: { type?: string } }
}

export interface DragAnnouncementArgs {
  /** 讀取「這一趟到底有沒有 commit」。由呼叫端在自己的 onDragEnd 內設定。 */
  getOutcome: () => DragOutcome | null
  /**
   * 被拖曳者的種類,用於 onDragStart / onDragCancel 的措辭,例如「列」。
   *
   * 同一個 `DndContext` 可能拖不只一種東西(DataTable 的列與欄共用一個),
   * 所以也接受一個函式,由 `active.data.current.type` 決定當下該說什麼。
   * 2026-09-07 錨:寫死字串時 DataTable 起始說「已提起**項目**」、結束說「已移動**欄位**」,
   * 同一趟拖曳用了兩個名字。
   */
  kind: string | ((active: ActiveLike) => string)
}

/**
 * 建立一組繁中的 dnd-kit 播報。
 *
 * 用法:
 * ```tsx
 * const outcomeRef = React.useRef<DragOutcome | null>(null)
 * const announcements = React.useMemo(
 *   () => createDragAnnouncements({ getOutcome: () => outcomeRef.current, kind: '列' }),
 *   [],
 * )
 * // handleDragEnd 開頭 `outcomeRef.current = null`,真的 commit 時才設值
 * <DndContext onDragEnd={handleDragEnd} accessibility={{ announcements }}>
 * ```
 */
export function createDragAnnouncements({ getOutcome, kind }: DragAnnouncementArgs) {
  const kindOf = (active: ActiveLike) => (typeof kind === 'function' ? kind(active) : kind)
  return {
    onDragStart: ({ active }: { active: ActiveLike }) =>
      `已提起${kindOf(active)}『${String(active.id)}』,用方向鍵移動,放開或按 Enter 放下,Esc 取消`,
    onDragOver: ({ over }: { over: { id: string | number } | null }) =>
      over ? `移到『${String(over.id)}』上方` : '目前不在可放置的位置',
    onDragEnd: () => {
      const outcome = getOutcome()
      // **關鍵**:沒 commit 就誠實說沒變,不能沿用 dnd-kit 的「已放到 X」。
      if (!outcome) return '未變更順序'
      return `已移動${outcome.kind}『${outcome.label}』`
    },
    onDragCancel: ({ active }: { active: ActiveLike }) =>
      `已取消移動${kindOf(active)}『${String(active.id)}』,回到原位`,
  }
}

/**
 * dnd-kit 掛在每顆把手 `aria-describedby` 上的操作說明(繁中;取代 dnd-kit 的英文預設)。
 * 句型沿用 TreeView 既有的鍵盤重排說明(tree-view.tsx `DEFAULT_REORDER_ANNOUNCEMENTS.instructions`)。
 */
export const DRAG_SCREEN_READER_INSTRUCTIONS = {
  draggable: '按空白鍵提起,用方向鍵移動,再按空白鍵放下;按 Esc 取消。', // i18n-allow: DS 預設文案
}

type DragAnnouncements = ReturnType<typeof createDragAnnouncements>

/**
 * 四個 `DndContext` 共用的無障礙接線:**繁中播報 + polite 區域 + 繁中操作說明**。
 *
 * 用法:
 * ```tsx
 * const drag = useDragAccessibility({ getOutcome: () => outcomeRef.current, kind: '列' })
 * <DndContext sensors={…} onDragEnd={…} accessibility={drag.accessibility}>
 *   {children}
 *   {drag.liveRegion}
 * </DndContext>
 * ```
 * `accessibility.announcements` 的四個函式把句子寫進 `liveRegion`(role=status、aria-live=polite)後
 * **回傳空字串**:dnd-kit 只在回傳值非 null 時寫進它自己的 assertive 區域,空字串寫進去也沒有東西可唸。
 * `liveRegion` 必須渲染在 DOM 裡(放在 DndContext 內外都可以);沒渲染 = 螢幕閱讀器整趟拖曳無聲,
 * 靜態閘 `scripts/drag-announcement-invariant.mjs` 會抓。
 *
 * **拖曳中的 `Esc` 只取消拖曳**(2026-10-01;規則 `ds-canonical/references/keyboard-model-canonical.md`「焦點所在的控件自己那一層也算一層」
 * 表的「拖曳中」列,`drag-canonical.md` invariant 8):dnd-kit 的 KeyboardSensor 把 `Esc` 當取消鍵(`@dnd-kit/core` 6.3.1 `defaultKeyboardCodes.cancel`)、
 * PointerSensor 在 document 上聽 `Esc` 取消指標拖曳 —— 它們**都不看 `defaultPrevented`**,所以拖曳一定會被取消;問題是同一下還會被外層的
 * Popover / Dialog 關掉(排序面板 / 欄位面板裡鍵盤搬條件時按 `Esc`,2026-10-01 實測一下少兩層),DataTable 自己的 `Esc`(清格游標)也會跟著動。
 * 把 `escapeLayer` spread 到裝著可拖項目的容器(排序面板的清單、欄位面板的清單、DataTable 表格根、TreeView 根):
 *   - 拖曳中(onDragStart → onDragEnd / onDragCancel 之間)它掛上 `data-escape-layer`,浮層守門(`lib/overlay-escape.ts`)看到就把這一下留住、不關;
 *   - 同時在捕獲階段把這一下標成**獨占**(`claimEscape`):容器自己的 `Esc` handler 與其他控件的 `isEscapeForControl` 都讀到 false,只有 dnd-kit 取消拖曳。
 */
export function useDragAccessibility(args: DragAnnouncementArgs): {
  accessibility: { announcements: DragAnnouncements; screenReaderInstructions: typeof DRAG_SCREEN_READER_INSTRUCTIONS }
  liveRegion: React.ReactElement
  /** 拖曳中才有東西:spread 到裝著可拖項目的容器(見上方「拖曳中的 `Esc` 只取消拖曳」)。 */
  escapeLayer: EscapeLayerProps & { onKeyDownCapture?: (event: React.KeyboardEvent) => void }
  /** 此刻是否有一趟拖曳在進行(onDragStart 之後、onDragEnd / onDragCancel 之前)。 */
  dragging: boolean
} {
  const [text, setText] = React.useState('')
  const [dragging, setDragging] = React.useState(false)
  // 呼叫端幾乎都傳 inline 箭頭函式;拿它們當 memo 依賴會每次 render 重建 announcements、DndContext 也跟著拿到新物件。
  // 所以 announcements 只建一份,讀取時再經 ref 取最新的 getOutcome / kind。
  const argsRef = React.useRef(args)
  argsRef.current = args
  const accessibility = React.useMemo(() => {
    const inner = createDragAnnouncements({
      getOutcome: () => argsRef.current.getOutcome(),
      kind: (active) => { const k = argsRef.current.kind; return typeof k === 'function' ? k(active) : k },
    })
    // 同一句連續兩次(例:拖曳中一直停在同一個落點)不重寫 —— 文字沒變,polite 區域本來就不會再唸;
    // 換成別句再回來則會唸(狀態真的變了)。
    const speak = (s: string) => { setText(s); return '' }
    // 播報的四個鈎子就是 dnd-kit 每趟拖曳的生命週期(鍵盤與指標都走):順手記下「拖曳中」,不另掛一份 onDragStart / onDragEnd
    const announcements: DragAnnouncements = {
      onDragStart: (e) => { setDragging(true); return speak(inner.onDragStart(e)) },
      onDragOver: (e) => speak(inner.onDragOver(e)),
      onDragEnd: () => { setDragging(false); return speak(inner.onDragEnd()) },
      onDragCancel: (e) => { setDragging(false); return speak(inner.onDragCancel(e)) },
    }
    return { announcements, screenReaderInstructions: DRAG_SCREEN_READER_INSTRUCTIONS }
  }, [])
  const liveRegion = React.createElement(
    'div',
    { role: 'status', 'aria-live': 'polite', 'aria-atomic': true, className: 'sr-only', 'data-drag-live-region': '' },
    text,
  )
  const escapeLayer = React.useMemo(
    () => (dragging
      ? { ...escapeLayerProps(true), onKeyDownCapture: (event: React.KeyboardEvent) => { if (event.key === 'Escape') claimEscape(event) } }
      : {}),
    [dragging],
  )
  return { accessibility, liveRegion, escapeLayer, dragging }
}
