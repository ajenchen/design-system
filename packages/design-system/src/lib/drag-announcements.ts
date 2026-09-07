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

/** 拖曳結果。`null` = 沒有真的重排(被守衛擋下 / 使用者放在原位)。 */
export interface DragOutcome {
  /** 播報時用來指稱被移動的東西,例如「列」「欄位」「項目」 */
  kind: string
  /** 被移動者的可讀名稱 */
  label: string
}

export interface DragAnnouncementArgs {
  /** 讀取「這一趟到底有沒有 commit」。由呼叫端在自己的 onDragEnd 內設定。 */
  getOutcome: () => DragOutcome | null
  /** 被拖曳者的種類,用於 onDragStart / onDragCancel 的措辭,例如「列」 */
  kind: string
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
  return {
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      `已提起${kind}『${String(active.id)}』,用方向鍵移動,放開或按 Enter 放下,Esc 取消`,
    onDragOver: ({ over }: { over: { id: string | number } | null }) =>
      over ? `移到『${String(over.id)}』上方` : '目前不在可放置的位置',
    onDragEnd: () => {
      const outcome = getOutcome()
      // **關鍵**:沒 commit 就誠實說沒變,不能沿用 dnd-kit 的「已放到 X」。
      if (!outcome) return '未變更順序'
      return `已移動${outcome.kind}『${outcome.label}』`
    },
    onDragCancel: ({ active }: { active: { id: string | number } }) =>
      `已取消移動${kind}『${String(active.id)}』,回到原位`,
  }
}
