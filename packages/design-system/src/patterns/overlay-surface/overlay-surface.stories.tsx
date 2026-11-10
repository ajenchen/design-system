// @story-baseline: patterns/header-canonical/header-canonical.stories.tsx#Overview — SurfaceHeader 段(title text-body-lg font-medium + dismiss size=sm)+ components/Dialog/dialog.stories.tsx footer 檔式(取消 tertiary + primary CTA)
//
// Internal Pattern 參照 story(對標 patterns/header-canonical 的 anatomy 參照定位)。
// SurfaceHeader / SurfaceBody / SurfaceFooter 是 @internal primitive——end-user 用
// DialogHeader / SheetHeader / PopoverHeader 等 wrapper,不直接 import;
// 本頁給 DS contributor 看「overlay 三段式結構 + padding / 分隔線契約」長什麼樣。
import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from '@storybook/test'
import * as React from 'react'
import type { ReactNode } from 'react'
import { X, ChevronUp, ChevronDown, Link2, MoreVertical, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SurfaceHeader, SurfaceBody, SurfaceFooter, SurfaceEyebrow, COMPACT_HEADER_SLOT } from './overlay-surface'
import { Button } from '@/design-system/components/Button/button'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'
import { Dialog, DialogHeader, DialogTitle } from '@/design-system/components/Dialog/dialog'
import { Sheet, SheetHeader, SheetTitle } from '@/design-system/components/Sheet/sheet'
import { Popover, PopoverHeader, PopoverTitle } from '@/design-system/components/Popover/popover'

const meta: Meta = {
  title: 'Design System/Internal Patterns/Overlay Surface',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
**@internal** — Dialog / Sheet / Popover / Coachmark 共用的浮層結構 primitive(SurfaceHeader / SurfaceBody / SurfaceFooter),統一 padding(\`px-loose py-tight\`)+ 分隔線(\`border-divider\`)語言,消除各 overlay 自寫 chrome 的漂移空間。

end-user 不直接 import——用 DialogHeader / SheetHeader / PopoverHeader 等 consumer wrapper;本頁是 DS contributor 的結構參照。

完整規則見 Overlay Surface 規格(標題列的內距、關閉鈕的佔位、內文捲動、關閉鈕尺寸)。
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj

// 原生 inert(不可互動的示意):React 18 要傳空字串、19 起是 boolean —— 同 menu-item.tsx / sidebar.tsx 的 INERT_SPREAD 寫法
const INERT_SPREAD = (Number.parseInt(React.version, 10) >= 19 ? { inert: true } : { inert: '' }) as object

/** 模擬 consumer Content 外殼——radius / border / shadow / bg 是浮層外殼職責,
 *  由 Dialog / Popover 的 Content 自己套(spec「不屬本 primitive 的職責」段 token 組)。 */
function Shell({ children, className, inert }: { children: ReactNode; className?: string; inert?: boolean }) {
  return (
    <div
      {...(inert ? INERT_SPREAD : {})}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-surface-raised shadow-[var(--elevation-200)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

// 三段式結構:Header(border-b)/ Body / Footer(border-t)各自的 padding 契約。
// 對標 Dialog「邀請成員」場景;header title = modal-tier typography(text-body-lg font-medium)。
// 這一則只示範版面:整個外殼 inert(不可互動的示意,按鈕不會假裝能按);可操作的版本見 Dialog 展示。
export const ThreePartStructure: Story = {
  name: '三段式結構',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)]">
      <Shell className="w-[420px]" inert>
        <SurfaceHeader>
          {/* 標題單行截斷 → 截斷時掛全文 tooltip(同 DialogTitle:TruncatedText display="block") */}
          <h2 className="flex-1 min-w-0 text-body-lg font-medium text-foreground"><TruncatedText display="block">邀請成員加入專案</TruncatedText></h2>
          <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
        </SurfaceHeader>
        <SurfaceBody>
          <p className="text-body text-foreground">
            輸入 Email 即可邀請成員加入「Acme 品牌改版」專案。
          </p>
          {/* @layout-space-magic-ok: SurfaceBody 內第二段落的段距 8px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d)) */}
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
        padding-based(可附小標 / 說明、chrome 隨內容長高;標題本身單行截斷),dismiss 按鈕 native size 保 sm、
        layout 佔位由 unbounded slot trick 縮回 title 行高 → header 自然閉合 48px。
      </p>
    </div>
  ),
}

// 內文捲動:定高浮層下 header / footer 固定、body 內捲。
// Shell 需 flex flex-col(viewport-aware scroll chain:中間 wrapper 斷鏈 = body 不捲)。
// 只示範版面:標題列與頁尾 inert(不可互動的示意);內文區照實可捲、可用 Tab 聚焦(可捲區域要鍵盤到得了)。
// 鍵盤焦點的驗證搬到下面 test-only 的「內文捲動(鍵盤)」,展示這則不再留著程式造出的焦點。
function BodyScrollDemo() {
  return (
    <div className="flex flex-col gap-[var(--layout-space-tight)]">
      <Shell className="flex h-[280px] w-[420px] flex-col">
        <SurfaceHeader {...INERT_SPREAD}>
          <h2 className="flex-1 min-w-0 text-body-lg font-medium text-foreground"><TruncatedText display="block">服務條款更新</TruncatedText></h2>
          <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
        </SurfaceHeader>
        <SurfaceBody
          tabIndex={0}
          role="region"
          aria-label="服務條款更新內容"
        >
          {/* @layout-space-magic-ok: 條款逐條之間 12px 是範例原值(與已發布版同值,F-S8),規格沒寫(放行章 (d)) */}
          <div className="flex flex-col gap-3 text-body text-foreground">
            <p>1. 資料保存期限由 30 天調整為 90 天,到期後自動匿名化。</p>
            <p>2. 新增歐盟區域資料中心選項,既有工作區可在設定頁遷移。</p>
            <p>3. API 免費額度調整為每月 10,000 次呼叫,超額部分依用量計費。</p>
            <p>4. 子處理商清單新增兩家 CDN 供應商,完整清單見信任中心。</p>
            <p>5. 帳單爭議申訴窗口由 14 天延長為 30 天。</p>
            <p>6. 本次更新於 2026 年 8 月 1 日生效,繼續使用即視為同意。</p>
          </div>
        </SurfaceBody>
        <SurfaceFooter {...INERT_SPREAD}>
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
  )
}

export const BodyScroll: Story = {
  name: '內文捲動',
  render: () => <BodyScrollDemo />,
}

// test-only:內文區可捲、可用鍵盤聚焦(原本寫在展示那則的 play 裡,並用 demoFocus keep 留住焦點)
export const BodyScrollKeyboard: Story = {
  name: '內文捲動(鍵盤)',
  tags: ['test-only'],
  // @example-basis: overlay-surface.spec.md:57「機械驗證該具名節點確實 overflow 且可聚焦」
  parameters: { demoFocus: 'keep' },
  render: () => <BodyScrollDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const scrollRegion = canvas.getByRole('region', {
      name: '服務條款更新內容',
    })

    await expect(scrollRegion.scrollHeight).toBeGreaterThan(scrollRegion.clientHeight)
    await expect(scrollRegion).toHaveAttribute('tabindex', '0')
    scrollRegion.focus()
    await expect(scrollRegion).toHaveFocus()
  },
}

// test-only:標題區幾何夾具(閘 scripts/overlay-header-title-area-invariant.mjs 量)。
// 規則住 overlay-surface.spec.md「SurfaceHeader」標題區:× 固定頂部、佔位 = 標題一行高,小標 / 說明出現與否都不移動;小標 12 / 500 / fg-secondary、距標題 2px、一行;
// 說明與小標不並用(所以沒有「小標 + 說明」這格)。Modal 層級(標題 16,Dialog / Sheet)與非 modal 層級(標題 14、COMPACT_HEADER_SLOT,Popover / 決策卡)各一組。
// 寫法照 DialogHeader / PopoverHeader:左欄 flex-1 min-w-0、× 帶 data-dismiss(靠上那條規則認它);說明照 DialogDescription 的字樣與間距。
function TitleAreaCase({ tier, name, eyebrow, title, description }: { tier: 'modal' | 'popover'; name: string; eyebrow?: string; title: string; description?: string }) {
  const modal = tier === 'modal'
  return (
    <Shell className="w-[420px]" inert>
      <div data-tier={tier} data-case={name}>
        <SurfaceHeader className={modal ? undefined : COMPACT_HEADER_SLOT}>
          <div className="flex-1 min-w-0">
            {eyebrow && <SurfaceEyebrow>{eyebrow}</SurfaceEyebrow>}
            <h2 data-header-part="title" className={cn('font-medium text-foreground', modal ? 'text-body-lg' : 'text-body')}>
              <TruncatedText display="block">{title}</TruncatedText>
            </h2>
            {description && (
              <p data-header-part="description" className="mt-[var(--item-gap-label-desc-reading-lg)] text-body text-fg-secondary">{description}</p>
            )}
          </div>
          <Button data-dismiss iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
        </SurfaceHeader>
      </div>
    </Shell>
  )
}

export const HeaderTitleArea: Story = {
  name: '標題區組合(測試)',
  tags: ['test-only'],
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)]">
      <TitleAreaCase tier="modal" name="modal-title" title="修復付款流程 bug" />
      <TitleAreaCase tier="modal" name="modal-description" title="修復付款流程 bug" description="#PROJ-1234 · 指派給陳大明" />
      <TitleAreaCase tier="modal" name="modal-eyebrow" eyebrow="Acme 品牌改版 · 官網、App 與門市視覺識別全面更新(設計、行銷、工程三組共同專案)" title="邀請成員加入專案" />
      <TitleAreaCase tier="popover" name="popover-title" title="看板篩選" />
      <TitleAreaCase tier="popover" name="popover-eyebrow" eyebrow="專案 Apollo" title="看板篩選" />
    </div>
  ),
}

// ── 標題列右側按鈕位(測試;閘 scripts/overlay-header-actions-invariant.mjs)──
// 規則住 overlay-surface.spec.md「SurfaceHeader」右側按鈕位:consumer 只傳按鈕(`actions`)與 ×(`dismiss`),
// 兩者都有時分隔線由 SurfaceHeader 自動放(action-bar.spec.md「五、分隔線規則」第 3 條、「分隔線幾何」兩側各 12)。
// data-expect 寫明這一格該有什麼,閘照它判(少了 / 多了都紅)。Dialog / Sheet / Popover 各自的 Header 也各放一格,
// 證明三個 wrapper 都把 actions 交給同一個位子(不是各自排)。
const prev = <Button variant="text" iconOnly size="sm" startIcon={ChevronUp} aria-label="上一筆任務" />
const next = <Button variant="text" iconOnly size="sm" startIcon={ChevronDown} aria-label="下一筆任務" />
const xBtn = <Button data-dismiss iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
function ActionsCase({ name, expect, compact, children }: { name: string; expect: string; compact?: boolean; children: ReactNode }) {
  return (
    <Shell className={compact ? 'w-[320px]' : 'w-[480px]'} inert>
      <div data-case={name} data-expect={expect}>{children}</div>
    </Shell>
  )
}
// 標題寫在標題槽裡(同上方 TitleAreaCase):chrome / 浮層標題槽裡的 <h2> 是範例的產品標題,
// 包成回傳 <h2> 的小元件會被 tutorial-page-invariant R2 當成手寫段落標題(Patterns 文件頁)。
const caseTitleClass = (compact?: boolean) => cn('font-medium text-foreground', compact ? 'text-body' : 'text-body-lg')

export const HeaderActions: Story = {
  name: '標題列右側按鈕位(測試)',
  tags: ['test-only'],
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)]">
      <ActionsCase name="surface-actions-dismiss" expect="actions,dismiss">
        <SurfaceHeader actions={<>{prev}{next}</>} dismiss={xBtn}><h2 data-header-part="title" className={caseTitleClass()}><TruncatedText display="block">WM-142 結帳流程改版</TruncatedText></h2></SurfaceHeader>
      </ActionsCase>
      <ActionsCase name="surface-bounded-dismiss" expect="actions,dismiss,bounded">
        <SurfaceHeader actions={<Button variant="tertiary" size="sm" startIcon={Link2}>複製連結</Button>} dismiss={xBtn}><h2 data-header-part="title" className={caseTitleClass()}><TruncatedText display="block">WM-142 結帳流程改版</TruncatedText></h2></SurfaceHeader>
      </ActionsCase>
      <ActionsCase name="surface-actions-only" expect="actions">
        <SurfaceHeader actions={<Button variant="text" iconOnly size="sm" startIcon={ChevronDown} aria-label="收合" />}><h2 data-header-part="title" className={caseTitleClass()}><TruncatedText display="block">上傳 3 個檔案</TruncatedText></h2></SurfaceHeader>
      </ActionsCase>
      <ActionsCase name="surface-dismiss-only" expect="dismiss">
        <SurfaceHeader dismiss={xBtn}><h2 data-header-part="title" className={caseTitleClass()}><TruncatedText display="block">邀請成員加入專案</TruncatedText></h2></SurfaceHeader>
      </ActionsCase>
      <ActionsCase name="surface-compact-actions-dismiss" expect="actions,dismiss" compact>
        <SurfaceHeader className={COMPACT_HEADER_SLOT} actions={<Button variant="text" iconOnly size="sm" startIcon={RotateCcw} aria-label="重置" />} dismiss={xBtn}><h2 data-header-part="title" className={caseTitleClass(true)}><TruncatedText display="block">看板篩選</TruncatedText></h2></SurfaceHeader>
      </ActionsCase>
      <ActionsCase name="dialog-header" expect="actions,dismiss">
        <Dialog><DialogHeader actions={<>{prev}{next}</>}><DialogTitle>WM-142 結帳流程改版</DialogTitle></DialogHeader></Dialog>
      </ActionsCase>
      <ActionsCase name="sheet-header" expect="actions,dismiss">
        <Sheet><SheetHeader actions={<Button variant="text" iconOnly size="sm" startIcon={MoreVertical} aria-label="更多操作" />}><SheetTitle>修復付款流程 bug</SheetTitle></SheetHeader></Sheet>
      </ActionsCase>
      <ActionsCase name="popover-header" expect="actions,dismiss" compact>
        <Popover><PopoverHeader actions={<Button variant="text" iconOnly size="sm" startIcon={RotateCcw} aria-label="重置" />}><PopoverTitle>看板篩選</PopoverTitle></PopoverHeader></Popover>
      </ActionsCase>
    </div>
  ),
}

// ── 標題截斷 tooltip(測試;閘 scripts/overlay-header-title-area-invariant.mjs 第 (3) 層)──
// 規則住 overlay-surface.spec.md「SurfaceHeader」標題:單行截斷 + 截斷才顯的 tooltip(tooltip.spec.md「截斷文字 → 用 tooltip 顯示完整內容」)。
// Dialog / Sheet / Popover 的真標題元件各一格(不 inert:閘要真的滑過)+ 一格沒截斷的對照(不該出 tooltip)。
const LONG_TITLE = 'WM-142 結帳流程改版:信用卡分期、行動支付與發票載具整合(第二階段)'
function TooltipCase({ name, expect, children }: { name: string; expect: 'tooltip' | 'none'; children: ReactNode }) {
  return (
    <Shell className="w-[280px]">
      <div data-tooltip-case={name} data-expect={expect}>{children}</div>
    </Shell>
  )
}
export const HeaderTitleTooltip: Story = {
  name: '標題截斷 tooltip(測試)',
  tags: ['test-only'],
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-tight)]">
      <TooltipCase name="dialog" expect="tooltip"><Dialog><DialogHeader><DialogTitle>{LONG_TITLE}</DialogTitle></DialogHeader></Dialog></TooltipCase>
      <TooltipCase name="sheet" expect="tooltip"><Sheet><SheetHeader><SheetTitle>{LONG_TITLE}</SheetTitle></SheetHeader></Sheet></TooltipCase>
      <TooltipCase name="popover" expect="tooltip"><Popover><PopoverHeader><PopoverTitle>{LONG_TITLE}</PopoverTitle></PopoverHeader></Popover></TooltipCase>
      <TooltipCase name="sheet-short" expect="none"><Sheet><SheetHeader><SheetTitle>邀請成員</SheetTitle></SheetHeader></Sheet></TooltipCase>
    </div>
  ),
}
