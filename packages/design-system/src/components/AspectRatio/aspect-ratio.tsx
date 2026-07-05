// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import * as AspectRatioPrimitive from '@radix-ui/react-aspect-ratio'

/**
 * AspectRatio — 固定長寬比容器(Radix AspectRatio primitive 薄包裝)
 *
 * 世界級對照:shadcn `AspectRatio` / Ant 無獨立元件(CSS 方案)/ Material 無
 *
 * ── 為什麼需要 ──
 * CSS `aspect-ratio` 屬性雖然現代瀏覽器都支援,但 Radix primitive 提供 SSR-safe
 * padding-bottom 方案 + consistent API,避免邊緣 bug(image 未載入時容器坍塌 /
 * content-fit 差異)。保 safe + 一致視覺。
 *
 * ── 標準 ratio(DS 慣例) ──
 * 16/9  — 寬螢幕影片、onboarding feature tour 截圖(Coachmark media 預設)
 * 4/3   — 老電視 / 照片基本 ratio、產品 thumbnail
 * 1/1   — Avatar / 方形貼文預覽 / icon preview
 * 3/4   — 直式照片(人物 portrait)
 * 21/9  — Ultra-wide banner(hero section)
 *
 * Consumer 傳 `ratio={n/m}` 數字計算(如 16/9 = 1.7777)。
 *
 * ── 常見消費者 ──
 * Coachmark media(coachmark.tsx)/ FileViewer 圖片預覽(file-viewer.tsx)/ Carousel item image、Card thumbnail(未來)
 *(Chart 現用 raw aspect-video 非消費者 — 2026-07-04 grep 驗證)
 */

export type AspectRatioProps = React.ComponentPropsWithoutRef<typeof AspectRatioPrimitive.Root>

// shadcn canonical:顯式 forwardRef + displayName(雖 Radix primitive 已 forwardRef,
// 此 wrapper 確保本 DS 每個 named export 在 Inspector 顯示正確 displayName,
// 且 props passthrough + ref 行為在 code 層面明確可見)
const AspectRatio = React.forwardRef<
  React.ElementRef<typeof AspectRatioPrimitive.Root>,
  AspectRatioProps
>((props, ref) => <AspectRatioPrimitive.Root ref={ref} {...props} />)
AspectRatio.displayName = 'AspectRatio'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const aspectRatioMeta = {
  component: 'AspectRatio',
  family: null, // self-contained primitive(對齊 spec frontmatter self-contained + L22;非 Family 1-4)
  variants: {

  },
  sizes: {

  },
  // 2026-06-05 fix(deep-audit):純 structural container,無互動狀態(spec「為何無 ColorMatrix / SizeMatrix / StateBehavior」段;段名指法免行號漂移)。
  // 原 ['default','hover','active','focus-visible','disabled'] 是 Phase 1 mechanical placeholder,與 spec 矛盾。
  states: ['default'],
  tokens: {
    bg: [],
    fg: [],
    ring: [],
  },
} as const

export { AspectRatio }
