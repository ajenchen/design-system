import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * 擴充 tailwind-merge,讓它認識設計系統的自訂 typography 與 text-color utilities。
 *
 * 預設 tailwind-merge 看到 `text-{xxx}` 自訂 class 會用 heuristic 猜它是 font-size
 * 還是 color——猜錯就會把不該放在同一組的 class 誤判為衝突,然後 strip 掉其中一個。
 *
 * 實際發生過的 bug:`text-body`(font-size 14px)和 `text-fg-secondary`(color)
 * 被同時放進 font-size group,tailwind-merge 把 `text-body` 吃掉,導致元件
 * inherit 父層 16px,description 永遠跟 label 同字級。
 *
 * 修法:**font-size group 和 text-color group 都明確列舉**,不留猜測空間。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-h1', 'text-h2', 'text-h3', 'text-h4', 'text-h5', 'text-h6',
        'text-body-lg', 'text-body', 'text-caption', 'text-footnote',
      ],
      // 自訂 text-color utilities(對應 semantic.css 的 `@theme inline --color-*` bridge)。
      //
      // 任何新增的 text-{semantic-name} color utility 都必須在這裡登記,否則
      // tailwind-merge 會誤判成 font-size 與 typography 衝突(歷史 bug:
      // text-body + text-fg-secondary 被 strip)。
      //
      // 完整家族對齊 semantic.css: 5 狀態色(primary/error/success/warning/info)
      // × 3 互動階(base/hover/active)+ text(on-subtle-bg)+ subtle(含 primary)
      // + notification(紅 badge)+ neutral foreground 四階。
      'text-color': [
        // Neutral foreground 家族
        'text-foreground',
        'text-fg-secondary',
        'text-fg-muted',
        'text-fg-disabled',
        'text-inverse-fg',
        'text-on-emphasis',  // 白字於飽和色底(Avatar color variants / Steps filled indicator)

        // Status 基色(base)
        'text-primary',
        'text-error',
        'text-success',
        'text-warning',
        'text-info',
        'text-notification',

        // Status 互動階(hover / active)
        'text-primary-hover',
        'text-primary-active',
        'text-error-hover',
        'text-error-active',
        'text-success-hover',
        'text-success-active',
        'text-warning-hover',
        'text-warning-active',
        'text-info-hover',
        'text-info-active',

        // on-subtle-bg 版本(深色文字配淺色底)
        'text-primary-text',
        'text-error-text',
        'text-success-text',
        'text-warning-text',
        'text-info-text',

        // Subtle 文字(少用,保持完整家族一致)
        'text-primary-subtle',
        'text-error-subtle',
        'text-success-subtle',
        'text-warning-subtle',
        'text-info-subtle',
      ],
      // Custom opacity utility(對應 tokens/opacity/opacity.css `@utility opacity-disabled`)。
      // 不註冊 group → tailwind-merge 用 default opacity-N heuristic,可能誤判 class 衝突。
      'opacity': ['opacity-disabled'],
    },
  },
})

/**
 * cn() — Tailwind class 合併工具
 *
 * 用法：
 *   cn("px-4 py-2", isActive && "bg-primary", className)
 *
 * 原理：clsx 處理條件式 class，twMerge 解決 Tailwind class 衝突
 * 例如 cn("px-4", "px-2") → "px-2"（後者優先）
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
