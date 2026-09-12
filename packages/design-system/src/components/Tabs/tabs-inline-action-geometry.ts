import type * as React from 'react'

export interface TabsInlineActionRect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface TabsInlineActionClipRect extends TabsInlineActionRect {
  clipX: boolean
  clipY: boolean
}

export interface TabsInlineActionPosition {
  left: number
  top: number
  height: number
}

export const TABS_INLINE_ACTION_GAP = 8

export function getTabsInlineActionPaddingRight(
  actionWidth: number,
  hasAction: boolean,
): number | undefined {
  return hasAction ? actionWidth + TABS_INLINE_ACTION_GAP : undefined
}

/**
 * Keep the action in its canonical trailing slot. We intentionally do not clamp it:
 * moving an action inward would consume the trigger's canonical 8px content-to-action gap.
 */
export function resolveTabsInlineActionPosition({
  trigger,
  overlay,
  clips,
  actionWidth,
}: {
  trigger: TabsInlineActionRect
  overlay: TabsInlineActionRect
  clips: readonly TabsInlineActionClipRect[]
  actionWidth: number
}): TabsInlineActionPosition | null {
  // **不可以寫 `{ ...overlay }`**:傳進來的是活的 `DOMRect`,它的 left/top/right/bottom 是**原型上的 getter**,
  // 物件展開只複製自有可列舉屬性 → 展出來是 `{}`,於是下面每一項比較都是 `undefined > undefined` = false,
  // 整個函式永遠回 null,分頁的 inlineAction 從 2026-07-18 改成 overlay portal 之後就**從來沒有渲染過**
  // (2026-09-10 在瀏覽器裡把 resolver 的輸入輸出打出來才抓到:輸入 trigger/overlay 都正常、輸出 null)。
  // 單元測試沒抓到是因為 fixture 傳的是普通物件(展開得出來)—— 儀器沒有對照組的典型案例。
  const viewport = { left: overlay.left, top: overlay.top, right: overlay.right, bottom: overlay.bottom }

  for (const clip of clips) {
    if (clip.clipX) {
      viewport.left = Math.max(viewport.left, clip.left)
      viewport.right = Math.min(viewport.right, clip.right)
    }
    if (clip.clipY) {
      viewport.top = Math.max(viewport.top, clip.top)
      viewport.bottom = Math.min(viewport.bottom, clip.bottom)
    }
  }

  const triggerIntersectsViewport =
    viewport.right > viewport.left &&
    viewport.bottom > viewport.top &&
    trigger.right > viewport.left &&
    trigger.left < viewport.right &&
    trigger.bottom > viewport.top &&
    trigger.top < viewport.bottom

  if (!triggerIntersectsViewport) return null

  // The portal span's horizontal hitbox is the canonical one-icon trailing slot.
  // A left-clipped trigger may keep its action when that trailing slot is visible;
  // a right-clipped slot is omitted instead of being moved over trigger content.
  const actionLeft = trigger.right - actionWidth
  const canonicalActionSlotIsVisible =
    actionLeft >= viewport.left &&
    trigger.right <= viewport.right &&
    trigger.top >= viewport.top &&
    trigger.bottom <= viewport.bottom

  if (!canonicalActionSlotIsVisible) return null

  return {
    left: trigger.right - overlay.left,
    top: trigger.top - overlay.top,
    height: trigger.bottom - trigger.top,
  }
}

/** Preserve every consumer style except the canonical action-space reservation. */
export function mergeTabsInlineActionStyle(
  style: React.CSSProperties | undefined,
  actionPaddingRight: number | undefined,
): React.CSSProperties | undefined {
  if (actionPaddingRight === undefined) return style
  return { ...style, paddingRight: actionPaddingRight }
}
