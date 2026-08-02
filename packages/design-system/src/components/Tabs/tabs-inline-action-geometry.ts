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
  const viewport = { ...overlay }

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
