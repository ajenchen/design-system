import { useState, useEffect } from 'react'

/**
 * useIsMobile — 偵測觸控裝置（mobile / tablet）
 *
 * 使用 `pointer: coarse` media query，正確區分觸控 vs 精確指標裝置。
 * 用途：Select 等元件在 mobile 退回原生 picker。
 */
export function useIsTouchDevice() {
  // 2026-07-06 D3 perf 修:初值固定 false 讓觸控裝置首次 commit 先掛 desktop 分支
  // (CustomSelect/CustomCombobox trigger subtree),effect flip true 後整棵 unmount 換 Native
  // → 每 instance 白付一次 double-mount。改 lazy initializer 同步讀 matchMedia,
  // 首次 render 即正確分支;effect 保留 change listener(行為不變)。
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    // 同步一次防 initializer 與 effect 之間 mq 變化(同值時 React Object.is bail-out,無多餘 render)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}
