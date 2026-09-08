import * as React from 'react'
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'

/**
 * 模擬瀏覽器 —— 給「整頁情境」類 story 用的畫布(2026-09-08,user:「圈出一個畫布,把整個內容塞在裡面,
 * 裡面完全是擬真的樣子;畫布外的上方再呈現模擬網址列甚至上下頁按鈕,讓讀者明確知道哪邊是模擬、哪邊是說明」)。
 *
 * - 上方工具列(上一頁 / 下一頁 / 重新整理 / 網址列)= **說明用**,用 DS Button / Input 畫,不是產品 UI。
 *   它與畫布是**兄弟節點**、不在畫布 / 宿主容器裡(2026-09-09):代理蓋板態抑制的是宿主,瀏覽器 chrome 不是宿主,
 *   story 把 `toolbarRef` 傳進 AgentPanel / Dialog 的 `persistentElements`,蓋板與並存 modal 開著時都仍可點。
 * - 下方畫布 = **擬真的產品畫面**,裡面只准放 DS 元件與真實業務內容。
 * - **有 URL 的 modal 傳送到「舞台」**(story 自己建的左欄,帶 transform):modal 與遮罩只佔宿主面積,代理面板在舞台外、
 *   完全不被蓋(v14 條 B「並列可操作」+ agent-panel.spec「並排時 舞台 = 容器 − 面板」);
 *   **沒有 URL 的確認框傳送到畫布**(`canvasRef`),蓋住整個 app 含代理(v14 條 A)。
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
  /** 畫布節點 —— 沒有 URL 的確認框傳送到這裡(蓋住整個 app,含代理) */
  canvasRef?: React.Ref<HTMLDivElement>
  /** 工具列節點 —— 放進 `persistentElements`,瀏覽器 chrome 在 modal 開著時也不該被抑制 */
  toolbarRef?: React.Ref<HTMLDivElement>
  /** 重新整理(v14 條 F:宿主不變、代理回到初始關閉的新對話) */
  onReload?: () => void
  /** 網址列的 id(閘用來讀模擬網址) */
  locationId?: string
  /** 畫布下方的說明(在畫布外) */
  caption?: React.ReactNode
  children: React.ReactNode
}

export function SimulatedBrowser({ url, onBack, onForward, onReload, canBack = false, canForward = false, height = 640, canvasRef, toolbarRef, locationId = 'demo-location', caption, children }: SimulatedBrowserProps) {
  // 工具列與畫布是兄弟:外框的圓角與邊線拆成上半(工具列)/ 下半(畫布)各自畫,
  // 視覺仍是一個瀏覽器窗,但 DOM 上工具列不在畫布(= 代理量測與抑制的宿主容器)裡。
  return (
    <div className="flex flex-col">
      <div
        ref={toolbarRef}
        className="flex items-center gap-2 rounded-t-lg border border-border bg-surface px-3 py-2"
        style={{ boxShadow: 'var(--elevation-100)' }}
        role="group"
        aria-label="模擬瀏覽器工具列(說明用)"
      >
        <Button iconOnly size="sm" variant="tertiary" startIcon={ChevronLeft} aria-label="上一頁" onClick={onBack} disabled={!canBack} />
        <Button iconOnly size="sm" variant="tertiary" startIcon={ChevronRight} aria-label="下一頁" onClick={onForward} disabled={!canForward} />
        <Button iconOnly size="sm" variant="tertiary" startIcon={RotateCw} aria-label="重新整理" onClick={onReload} disabled={!onReload} />
        <Input readOnly value={url} aria-label="模擬網址列" id={locationId} className="flex-1" />
      </div>
      <div
        ref={canvasRef}
        className="relative flex overflow-hidden rounded-b-lg border border-t-0 border-border bg-canvas"
        style={{ height, transform: 'translateZ(0)', boxShadow: 'var(--elevation-100)' }}
      >
        {children}
      </div>
      {caption && <p className="mt-2 text-caption text-fg-muted">{caption}</p>}
    </div>
  )
}
