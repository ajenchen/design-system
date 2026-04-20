import type { Meta, StoryObj } from '@storybook/react'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from './sheet'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Sheet/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>Sheet 基於 Radix Dialog 的 side variant——從畫面邊緣（top / bottom / left / right）滑入的浮層面板。結構跟 Dialog 同（Header + Content + Footer），差異在位置與動畫。常用於 detail panel、filter drawer、mobile navigation。</Desc>
        <div className="flex items-center gap-3 flex-wrap">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="tertiary">開啟任務詳情</Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>修復付款流程 bug</SheetTitle>
                <SheetDescription>#PROJ-1234 · 指派給陳大明</SheetDescription>
              </SheetHeader>
              <div className="flex-1 p-4 text-body">
                <p className="mb-3 text-fg-secondary">使用者於結帳最後一步點選「完成付款」後,頁面無回應...</p>
                <p className="text-caption text-fg-muted">（完整 task detail 內容）</p>
              </div>
              <SheetFooter>
                <Button variant="tertiary">標記為已解決</Button>
                <Button variant="primary">儲存變更</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <Desc>Sheet / SheetTrigger / SheetContent / SheetHeader / SheetTitle / SheetDescription / SheetFooter / SheetClose 全部是 Radix Dialog 薄 re-export。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop (SheetContent)</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td mono>side</Td><Td mono>'top' | 'right' | 'bottom' | 'left'</Td><Td mono>'right'</Td><Td>滑入方向,決定浮層位置 + 動畫</Td></tr>
              <tr><Td mono>open / onOpenChange</Td><Td mono>boolean / (o) =&gt; void</Td><Td mono>—</Td><Td>controlled 開關(選用)</Td></tr>
              <tr><Td mono>onEscapeKeyDown</Td><Td mono>(e) =&gt; void</Td><Td mono>—</Td><Td>Esc 鍵 callback,preventDefault 阻止關閉</Td></tr>
              <tr><Td mono>onPointerDownOutside</Td><Td mono>(e) =&gt; void</Td><Td mono>—</Td><Td>點擊外部 callback,preventDefault 阻止關閉</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const SideMatrix: Story = {
  name: 'Side 方向 × 用途',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>四個方向的設計意圖</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Side</Th><Th>滑入方向</Th><Th>典型用途</Th><Th>世界級對照</Th></tr></thead>
            <tbody>
              <tr><Td mono>right ★default</Td><Td>從右邊</Td><Td>Detail panel（Jira task drawer、Linear issue detail、GitHub PR file diff drawer）、filter panel</Td><Td>Jira / Linear / Notion side panel</Td></tr>
              <tr><Td mono>left</Td><Td>從左邊</Td><Td>Mobile navigation drawer（漢堡選單展開）</Td><Td>Material mobile drawer、Slack mobile nav</Td></tr>
              <tr><Td mono>top</Td><Td>從上方</Td><Td>Notification center、system announcement（較少見）</Td><Td>iOS Control Center top pull-down</Td></tr>
              <tr><Td mono>bottom</Td><Td>從下方</Td><Td>Mobile bottom sheet（action sheet / picker / share menu）</Td><Td>iOS Bottom Sheet、Material Bottom Sheet</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>實際範例（右側 detail drawer）</H3>
        <Desc>最常見用法：列表項點擊後從右側滑入 detail panel，使用者可在 panel 內編輯同時看到背景列表。</Desc>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="tertiary">開啟 detail panel</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Q1 財報</SheetTitle>
              <SheetDescription>最後編輯：2026-04-18 17:32</SheetDescription>
            </SheetHeader>
            <div className="flex-1 p-4">
              <p className="text-body">（文件內容）</p>
            </div>
            <SheetFooter>
              <Button variant="primary">儲存</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Sheet 視覺 token（與 Dialog 共用基底）</H3>
        <Desc>Sheet 和 Dialog 共用 `bg-surface-raised` + `border-border` + elevation-200——改其中一個必須連動另一個,不讓 modal 家族視覺漂移。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>層</Th><Th>Token</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td>Overlay</Td><Td><TokenCell token="--overlay" display="bg-overlay" /></Td><Td>背景遮罩 semi-transparent</Td></tr>
              <tr><Td>Sheet 背景</Td><Td><TokenCell token="--surface-raised" display="bg-surface-raised" /></Td><Td>比 surface 高一階</Td></tr>
              <tr><Td>邊框</Td><Td><TokenCell token="--border" display="border-border" /></Td><Td>與 Dialog 統一</Td></tr>
              <tr><Td>分隔線（header / footer）</Td><Td><TokenCell token="--divider" display="border-divider" /></Td><Td>區隔 section</Td></tr>
              <tr><Td>主要文字</Td><Td><TokenCell token="--foreground" display="text-foreground" /></Td><Td>Title</Td></tr>
              <tr><Td>次要文字</Td><Td><TokenCell token="--fg-secondary" display="text-fg-secondary" /></Td><Td>Description</Td></tr>
              <tr><Td>Shadow</Td><Td mono>--elevation-200</Td><Td>浮層 elevation</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>預設尺寸</H3>
        <Desc>Sheet 大小依 `side` 變化：左/右 sheet 有預設寬度（響應式限制 max-w），上/下 sheet 有預設高度。consumer 可透過 className 自訂。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Side</Th><Th>預設尺寸</Th><Th>響應式</Th></tr></thead>
            <tbody>
              <tr><Td mono>right / left</Td><Td mono>w-3/4（手機佔 75% 寬）</Td><Td>sm:max-w-sm（桌機 384px）</Td></tr>
              <tr><Td mono>top / bottom</Td><Td>auto（依內容）</Td><Td>—</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>覆寫寬度 / 高度</H3>
        <Desc>{'consumer 透過 className 覆寫。例:`<SheetContent className="w-full sm:max-w-lg">` 桌機用更寬。'}</Desc>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>開啟 / 關閉</H3>
        <Desc>Radix 原生動畫：進場 slide-in-from-側邊 + fade-in overlay；離場鏡像。Modal 狀態鎖 body scroll。</Desc>
        <ul className="text-caption text-fg-muted list-disc pl-5 space-y-1">
          <li>點擊 trigger → 開啟（slide-in from `side`）</li>
          <li>點擊 overlay → 關閉（default；可用 onPointerDownOutside preventDefault 阻止）</li>
          <li>按 Esc → 關閉（default；可用 onEscapeKeyDown preventDefault 阻止）</li>
          <li>點擊 X close button → 關閉</li>
          <li>Focus trap 限制 Tab 循環在 Sheet 內</li>
        </ul>
      </div>

      <div>
        <H3>Disabled / loading / empty / error 的職責邊界</H3>
        <Desc>Sheet 是容器,無整體狀態——內容層負責。trigger 的 disabled 由 trigger 自己管;內容的 loading / empty / error 由 consumer 在 `SheetContent` 內渲染對應 primitive（Skeleton / Empty / Alert）。</Desc>
      </div>
    </div>
  ),
}
