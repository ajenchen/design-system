import { useState, useEffect } from 'react'

/**
 * useIsMobile — 偵測觸控裝置（mobile / tablet）
 *
 * 使用 `pointer: coarse` media query，正確區分觸控 vs 精確指標裝置。
 * 用途：Select 等元件在 mobile 退回原生 picker。
 */
export function useIsTouchDevice() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}
