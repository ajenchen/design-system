// @anatomy-exempt: Header Anatomy pattern story — 涵蓋 2 家族:B chrome(ChromeHeader,single-row / withTabs)+ A overlay(SurfaceHeader)。
// （leadingRail slot 因專搭 sidebar,canonical demo 在 AppShell primary-header,不在此孤立展示。）
// 內部 title 用 flex 排列是 header content 結構,非 list row,不走 item-anatomy MenuItem。
//
// 公開 Pattern anatomy 參照(對標 patterns/element-anatomy/item-anatomy.stories.tsx)。
// 目的:做 header 相關元件時,人 / AI 看這支 story + header-canonical.spec.md 就知道 header 該怎麼結構,
// 並直接消費 <ChromeHeader> primitive(或在 AppShell header slot 傳它)滿足需求。
import type { Meta } from '@storybook/react'
import type { ReactNode } from 'react'
import {
  FileText,
  ZoomIn,
  Download,
  X,
} from 'lucide-react'
import { ChromeHeader } from '@/design-system/patterns/header-canonical/chrome-header'
import { SurfaceHeader } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { Button } from '@/design-system/components/Button/button'
import { Separator } from '@/design-system/components/Separator/separator'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/design-system/components/Tabs/tabs'

const meta: Meta = {
  title: 'Design System/Patterns/Header Anatomy',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   Header Anatomy — 跨元件 chrome header 的結構契約(header-canonical.spec.md SSOT)

   ChromeHeader 封裝的共同契約(所有型共享):
   • 高度 = var(--chrome-header-height)(md 48 / lg 56),items-center 垂直置中
   • 左右 padding = var(--layout-space-loose)(md 16 / lg 24),所有 slot 統一靠齊
   • border-b border-divider(有 tabs 時自動移除,改由 TabsList 畫線)
   • dismiss(close X)永遠 <Button iconOnly dismiss size="sm">,不論 density

   consumer:Sidebar header / FileViewer Toolbar+InfoPanel / AppShell header slot / 未來 Drawer
   ═══════════════════════════════════════════════════════════════════════════ */

/** 容器:把 header 放進一個有邊界的面板裡看(模擬實際 chrome 嵌在 surface 上)*/
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-divider bg-surface">
      {children}
    </div>
  )
}

/** 1. Single-row — 最常見:標題 + 動作列(對標 FileViewer Toolbar / Sidebar header)*/
export const SingleRow = () => (
  <Panel>
    <ChromeHeader>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <FileText size={16} className="shrink-0 text-foreground" aria-hidden />
        <span className="truncate text-body-lg text-foreground" title="2026 Q1 財務報告.pdf">
          2026 Q1 財務報告.pdf
        </span>
      </div>
      {/* 右側按鈕 = children + flex(title flex-1 推開);排列遵循 action-bar:
          動作群(放大/下載)── Separator ── dismiss(關閉)分群,buttons 全 size="sm"(chrome header canonical)*/}
      <Button iconOnly variant="text" size="sm" startIcon={ZoomIn} aria-label="放大" />
      <Button iconOnly variant="text" size="sm" startIcon={Download} aria-label="下載" />
      <Separator orientation="vertical" className="h-6 mx-1" />
      <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
    </ChromeHeader>
    <div className="flex flex-col gap-2 p-6 text-body text-fg-secondary">
      <p className="text-caption text-fg-muted">陳雅婷 更新於 2026/04/18 · 12 頁 · 2.4 MB</p>
      <p>本季合併營收 NT$4.82 億,較上季成長 8.2%;毛利率維持 41%。附錄含各區域損益與現金流量表。</p>
    </div>
  </Panel>
)
SingleRow.storyName = '單列(標題 + 動作列)'

/** 2. withTabs — header 含分頁列(對標 FileViewer InfoPanel / 設定頁 header)。
 *  傳 tabsSlot 自動進 column 結構:row1 = 標題列、row2 = TabsList 全寬畫線。 */
export const WithTabs = () => (
  <Panel>
    <Tabs defaultValue="overview">
      <ChromeHeader
        tabsSlot={
          <TabsList>
            <TabsTrigger value="overview">概覽</TabsTrigger>
            <TabsTrigger value="activity">活動</TabsTrigger>
            <TabsTrigger value="files">檔案</TabsTrigger>
          </TabsList>
        }
      >
        <h2 className="flex-1 truncate text-body-lg font-medium text-foreground">
          Acme 品牌改版專案
        </h2>
        <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
      </ChromeHeader>
      <TabsContent value="overview">
        <div className="flex flex-col gap-1 p-6 text-body text-fg-secondary">
          <p>負責人:林思妤 · 期程:2026/03–2026/06 · 狀態:設計中</p>
          <p>將既有品牌識別全面翻新——logo、配色與元件庫,預計 Q2 上線。</p>
        </div>
      </TabsContent>
      <TabsContent value="activity">
        <div className="flex flex-col gap-1 p-6 text-body text-fg-secondary">
          <p>陳柏宇 上傳了「新版 logo 提案 v3」· 2 小時前</p>
          <p>林思妤 將狀態改為「設計中」· 昨天</p>
          <p>Aisha Khan 留言:配色再往暖色調微調 · 3 天前</p>
        </div>
      </TabsContent>
      <TabsContent value="files">
        <div className="flex flex-col gap-1 p-6 text-body text-fg-secondary">
          <p>品牌識別規範_v3.pdf · 8.1 MB</p>
          <p>logo 原始檔.ai · 24 MB</p>
          <p>配色對照表.xlsx · 320 KB</p>
        </div>
      </TabsContent>
    </Tabs>
  </Panel>
)
WithTabs.storyName = '含分頁列'

/** Overview — header anatomy 兩型疊起來一次看完,每型上方標清「何時用 + 對標既有元件」。
 *  注:ChromeHeader 另有 `leadingRail` slot,但它專為「跟 sidebar 收合 icon 對齊」而生(寬 = sidebar 收合寬),
 *  只在有 sidebar 時有意義 → canonical demo 放 AppShell primary-header(leadingRail = <SidebarTrigger />),
 *  不在此 generic header anatomy 孤立展示(2026-06-08 per user:孤立 demo 會誤導成通用 slot,且 icon 易被亂換)。*/
export const Overview = () => (
  <div className="flex flex-col gap-8">
    <section className="flex flex-col gap-2">
      <div className="text-body font-medium text-foreground">Single-row(標題 + 動作列)</div>
      <div className="text-body-sm text-fg-secondary">
        最常見的 chrome header。對標 FileViewer Toolbar / Sidebar header。border-b 自畫、px-loose、dismiss size=sm。
      </div>
      <SingleRow />
    </section>
    <section className="flex flex-col gap-2">
      <div className="text-body font-medium text-foreground">withTabs(標題列 + 分頁列)</div>
      <div className="text-body-sm text-fg-secondary">
        header 內含分頁。對標 FileViewer InfoPanel。傳 tabsSlot,border 改由 TabsList 全寬畫一條線。
      </div>
      <WithTabs />
    </section>
    <section className="flex flex-col gap-2">
      <div className="text-body font-medium text-foreground">A 家族 overlay(SurfaceHeader)— 浮層標題列</div>
      <div className="text-body-sm text-fg-secondary">
        Dialog / Sheet / Popover / Coachmark 的頂部標題列。高度 padding-based(由內容撐、對齊 chrome-header-height),跟
        chrome 家族共用同一組契約:border-b、px-loose、dismiss size=sm、tabs 連動。consumer 多用 DialogHeader /
        SheetHeader / PopoverHeader wrapper,此處用底層 SurfaceHeader 展示 anatomy。
      </div>
      <div className="overflow-hidden rounded-md border border-divider bg-surface-raised shadow-[var(--elevation-200)]">
        <SurfaceHeader>
          <h2 className="flex-1 truncate text-body-lg font-medium text-foreground">編輯專案設定</h2>
          <Button iconOnly dismiss size="sm" startIcon={X} aria-label="關閉" />
        </SurfaceHeader>
        <div className="flex flex-col gap-3 p-6 text-body text-fg-secondary">
          <div className="flex flex-col gap-0.5">
            <span className="text-caption text-fg-muted">專案名稱</span>
            <span className="text-foreground">Acme 品牌改版專案</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-caption text-fg-muted">可見範圍</span>
            <span className="text-foreground">團隊成員(12 人)</span>
          </div>
        </div>
      </div>
    </section>
    <section className="flex flex-col gap-2">
      <div className="text-body font-medium text-foreground">leadingRail — 見 AppShell（非此處）</div>
      <div className="text-body-sm text-fg-secondary">
        ChromeHeader 另有 leadingRail slot(寬 = sidebar 收合寬,專為跟 sidebar 收合 icon 對齊)。因它只在「有
        sidebar」時有意義,canonical demo 放在 AppShell primary-header（leadingRail = SidebarTrigger）,不在此孤立展示。
      </div>
    </section>
  </div>
)
Overview.storyName = '總覽'
