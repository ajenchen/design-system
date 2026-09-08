import * as React from 'react'
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'

/**
 * 模擬瀏覽器 —— 給「整頁情境」類 story 用的畫布(2026-09-08,user:「圈出一個畫布,把整個內容塞在裡面,
 * 裡面完全是擬真的樣子;畫布外的上方再呈現模擬網址列甚至上下頁按鈕,讓讀者明確知道哪邊是模擬、哪邊是說明」)。
 *
 * - 上方工具列(上一頁 / 下一頁 / 重新整理 / 網址列)= **說明用**,用 DS Button / Input 畫,不是產品 UI。
 * - 下方畫布 = **擬真的產品畫面**,裡面只准放 DS 元件與真實業務內容。
 * - 畫布帶 `transform`,所以 Dialog / FileViewer 用 `portalContainer={canvas}` 傳送進來時,`fixed` 定位以畫布為準,
 *   modal 與遮罩不會跑出畫布、也不會蓋到上方的工具列。
 * - 說明文字放 `caption`(畫布下方),不放進畫布或代理面板裡。
 */
export interface SimulatedBrowserProps {
  url: string
  onBack?: () => void
  onForward?: () => void
  canBack?: boolean
  canForward?: boolean
  /** 畫布高度(px),預設 640 */
  height?: number
  /** 畫布節點 —— 接到 Dialog / FileViewer 的 `portalContainer` */
  canvasRef?: React.Ref<HTMLDivElement>
  /** 網址列的 id(閘用來讀模擬網址) */
  locationId?: string
  /** 畫布下方的說明(在畫布外) */
  caption?: React.ReactNode
  children: React.ReactNode
}

export function SimulatedBrowser({ url, onBack, onForward, canBack = false, canForward = false, height = 640, canvasRef, locationId = 'demo-location', caption, children }: SimulatedBrowserProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-border bg-surface" style={{ boxShadow: 'var(--elevation-100)' }}>
        <div className="flex items-center gap-2 border-b border-divider px-3 py-2" role="group" aria-label="模擬瀏覽器工具列(說明用)">
          <Button iconOnly size="sm" variant="tertiary" startIcon={ChevronLeft} aria-label="上一頁" onClick={onBack} disabled={!canBack} />
          <Button iconOnly size="sm" variant="tertiary" startIcon={ChevronRight} aria-label="下一頁" onClick={onForward} disabled={!canForward} />
          <Button iconOnly size="sm" variant="tertiary" startIcon={RotateCw} aria-label="重新整理" disabled />
          <Input readOnly value={url} aria-label="模擬網址列" id={locationId} className="flex-1" />
        </div>
        <div ref={canvasRef} className="relative flex overflow-hidden bg-canvas" style={{ height, transform: 'translateZ(0)' }}>
          {children}
        </div>
      </div>
      {caption && <p className="text-caption text-fg-muted">{caption}</p>}
    </div>
  )
}
