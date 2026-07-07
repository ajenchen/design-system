// @story-baseline: patterns/header-canonical/header-canonical.stories.tsx#Overview — SurfaceHeader 段(title text-body-lg font-medium + dismiss size=sm)+ components/Dialog/dialog.stories.tsx footer 檔式(取消 tertiary + primary CTA)
//
// Internal Pattern 參照 story(對標 patterns/header-canonical 的 anatomy 參照定位)。
// SurfaceHeader / SurfaceBody / SurfaceFooter 是 @internal primitive——end-user 用
// DialogHeader / SheetHeader / PopoverHeader 等 wrapper,不直接 import;
// 本頁給 DS contributor 看「overlay 三段式結構 + padding / 分隔線契約」長什麼樣。
import type { Meta, StoryObj } from '@storybook/react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SurfaceHeader, SurfaceBody, SurfaceFooter } from './overlay-surface'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Internal Patterns/Overlay Surface',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
**@internal** — Dialog / Sheet / Popover / Coachmark 共用的浮層結構 primitive(SurfaceHeader / SurfaceBody / SurfaceFooter),統一 padding(\`px-loose py-tight\`)+ 分隔線(\`border-divider\`)語言,消除各 overlay 自寫 chrome 的漂移空間。

end-user 不直接 import——用 DialogHeader / SheetHeader / PopoverHeader 等 consumer wrapper;本頁是 DS contributor 的結構參照。

完整規則:\`packages/design-system/src/patterns/overlay-surface/overlay-surface.spec.md\`(padding-based header canonical / unbounded slot trick / ScrollArea canonical / dismiss size canonical)
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj

/** 模擬 consumer Content 外殼——radius / border / shadow / bg 是浮層外殼職責,
 *  由 Dialog / Popover 的 Content 自己套(spec「不屬本 primitive 的職責」段 token 組)。 */
function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-surface-raised shadow-[var(--elevation-200)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** 1. 三段式結構 — Header(border-b)/ Body / Footer(border-t)各自的 padding 契約。
 *  對標 Dialog「邀請成員」場景;header title = modal-tier typography(text-body-lg font-medium)。 */
export const ThreePartStructure: Story = {
  name: '三段式結構',
  render: () => (
    <div className="flex flex-col gap-3">
      <Shell className="w-[420px]">
        <SurfaceHeader>
          <h2 className="flex-1 truncate text-body-lg font-medium text-foreground">邀請成員加入專案</h2>
          <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
        </SurfaceHeader>
        <SurfaceBody>
          <p className="text-body text-foreground">
            輸入 Email 即可邀請成員加入「Acme 品牌改版」專案。
          </p>
          <p className="mt-2 text-caption text-fg-secondary">
            被邀請者會收到通知信,接受後自動取得專案的檢視與留言權限。
          </p>
        </SurfaceBody>
        <SurfaceFooter>
          <Button variant="tertiary">取消</Button>
          <Button variant="primary">寄出邀請</Button>
        </SurfaceFooter>
      </Shell>
      <p className="max-w-[420px] text-caption text-fg-muted">
        三段共用 px-loose / py-tight;Header 自畫 border-b、Footer 自畫 border-t。Header 是
        padding-based(title 可換行、chrome 隨內容長高),dismiss 按鈕 native size 保 sm、
        layout 佔位由 unbounded slot trick 縮回 title 行高 → header 自然閉合 48px。
      </p>
    </div>
  ),
}

/** 2. 內文捲動 — 定高浮層下 header / footer 固定、body 內捲。
 *  Shell 需 flex flex-col(viewport-aware scroll chain:中間 wrapper 斷鏈 = body 不捲,spec K11 invariant)。 */
export const BodyScroll: Story = {
  name: '內文捲動',
  render: () => (
    <div className="flex flex-col gap-3">
      <Shell className="flex h-[280px] w-[420px] flex-col">
        <SurfaceHeader>
          <h2 className="flex-1 truncate text-body-lg font-medium text-foreground">服務條款更新</h2>
          <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
        </SurfaceHeader>
        <SurfaceBody>
          <div className="flex flex-col gap-3 text-body text-foreground">
            <p>1. 資料保存期限由 30 天調整為 90 天,到期後自動匿名化。</p>
            <p>2. 新增歐盟區域資料中心選項,既有工作區可在設定頁遷移。</p>
            <p>3. API 免費額度調整為每月 10,000 次呼叫,超額部分依用量計費。</p>
            <p>4. 子處理商清單新增兩家 CDN 供應商,完整清單見信任中心。</p>
            <p>5. 帳單爭議申訴窗口由 14 天延長為 30 天。</p>
            <p>6. 本次更新於 2026 年 8 月 1 日生效,繼續使用即視為同意。</p>
          </div>
        </SurfaceBody>
        <SurfaceFooter>
          <Button variant="tertiary">稍後再讀</Button>
          <Button variant="primary">我已閱讀並同意</Button>
        </SurfaceFooter>
      </Shell>
      <p className="max-w-[420px] text-caption text-fg-muted">
        SurfaceBody 恆套 flex-1 min-h-0 overflow-y-auto:定高(或 viewport 太小)時 header / footer
        永遠可見、body 內捲。注意:Dialog / Sheet 正式 consumer 的 body 走 ScrollArea canonical
        (跨 OS 捲軸一致),此處為 primitive 裸展示。
      </p>
    </div>
  ),
}
