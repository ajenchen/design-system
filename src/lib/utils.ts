import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * 擴充 tailwind-merge，讓它認識設計系統的自訂 typography utilities。
 *
 * 預設 tailwind-merge 看到 text-body / text-caption 等自訂 class，
 * 無法判斷它們是 font-size 還是 color，會把它們和 text-white / text-red-500 等
 * 放進同一個衝突組，導致其中一個被誤刪。
 *
 * 將這些 class 宣告為 font-size group，tailwind-merge 就不會讓它們和 color 衝突。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-h1', 'text-h2', 'text-h3', 'text-h4', 'text-h5', 'text-h6',
        'text-body-lg', 'text-body', 'text-caption', 'text-footnote',
      ],
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
