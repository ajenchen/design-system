import type { Meta, StoryObj } from '@storybook/react'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverBody, PopoverFooter, PopoverTitle } from './popover'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Popover/設計規格',
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
        <Desc>Popover 是 Radix passthrough——點擊觸發的浮層容器,提供定位 / 動畫 / 焦點管理 / click-outside 關閉。內容完全由 consumer 決定(可放任何 React 元素)。本 DS 橋接 elevation / radius / border token,不改 Radix API。</Desc>
        <div className="flex items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="tertiary">篩選設定</Button>
            </PopoverTrigger>
            <PopoverContent>
              <PopoverHeader><PopoverTitle>依類型篩選</PopoverTitle></PopoverHeader>
              <PopoverBody>
                <div className="flex flex-col gap-1.5 text-caption text-fg-secondary">
                  <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> 待處理</label>
                  <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> 進行中</label>
                  <label className="flex items-center gap-2"><input type="checkbox" /> 已完成</label>
                </div>
              </PopoverBody>
              <PopoverFooter>
                <Button variant="tertiary" size="sm" className="flex-1">清除</Button>
                <Button variant="primary" size="sm" className="flex-1">套用</Button>
              </PopoverFooter>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <Desc>Popover / PopoverTrigger / PopoverContent 全部是 Radix Popover 的薄 re-export。完整 API 見 <a href="https://www.radix-ui.com/primitives/docs/components/popover" className="underline" target="_blank" rel="noreferrer">Radix Popover 官方文件</a>。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop(PopoverContent)</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td mono>align</Td><Td mono>'start' | 'center' | 'end'</Td><Td mono>'center'</Td><Td>相對 trigger 的對齊</Td></tr>
              <tr><Td mono>side</Td><Td mono>'top' | 'right' | 'bottom' | 'left'</Td><Td mono>'bottom'</Td><Td>浮層出現在 trigger 的哪一側</Td></tr>
              <tr><Td mono>sideOffset</Td><Td mono>number</Td><Td mono>4</Td><Td>與 trigger 的距離(px)</Td></tr>
              <tr><Td mono>open / onOpenChange</Td><Td mono>{'boolean / (o) => void'}</Td><Td mono>—</Td><Td>controlled 開關(選用)</Td></tr>
              <tr><Td mono>modal</Td><Td mono>boolean</Td><Td mono>false</Td><Td>`true` 時鎖 body scroll + focus trap</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const PlacementMatrix: Story = {
  name: '定位(side × align)',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Side × Align 組合</H3>
        <Desc>Radix 自動偵測 viewport 邊緣,撞牆時會自動翻向反向。若要強制固定方向,用 controlled `open` + 手動控制。</Desc>
        <div className="grid grid-cols-2 gap-4 max-w-2xl">
          {(['top', 'right', 'bottom', 'left'] as const).flatMap(side =>
            (['start', 'center', 'end'] as const).map(align => (
              <div key={`${side}-${align}`} className="flex items-center gap-3 border border-dashed border-divider rounded-md p-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="tertiary" size="sm" className="font-mono">{side}/{align}</Button>
                  </PopoverTrigger>
                  <PopoverContent side={side} align={align}>
                    <PopoverBody><div className="text-caption">side=<span className="font-mono">{side}</span>, align=<span className="font-mono">{align}</span></div></PopoverBody>
                  </PopoverContent>
                  {/* each placement variant already wrapped in PopoverBody for consistent padding */}
                </Popover>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>浮層視覺 token(與 DropdownMenuContent / HoverCardContent 共用)</H3>
        <Desc>所有 elevation-200 浮層共用同一套 token——改其中一個應該連動其他,不讓三個浮層視覺漂移。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>層</Th><Th>Token</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td>背景</Td><Td><TokenCell token="--surface-raised" display="bg-surface-raised" /></Td><Td>浮層背景(比 surface 高一階)</Td></tr>
              <tr><Td>邊框</Td><Td><TokenCell token="--border" display="border-border" /></Td><Td>標準邊框</Td></tr>
              <tr><Td>文字</Td><Td><TokenCell token="--foreground" display="text-foreground" /></Td><Td>主要文字色</Td></tr>
              <tr><Td>次要文字</Td><Td><TokenCell token="--fg-secondary" display="text-fg-secondary" /></Td><Td>說明 / 次要資訊</Td></tr>
              <tr><Td>圓角</Td><Td mono>rounded-lg(8px)</Td><Td>對齊 Dialog radius(浮層視覺語言一致)</Td></tr>
              <tr><Td>陰影</Td><Td mono>--elevation-200</Td><Td>浮層級 elevation(見 `elevation.spec.md`)</Td></tr>
              <tr><Td>Density</Td><Td mono>data-density="md"</Td><Td>Popover 永遠鎖 md,不隨頁面 density 放大(lightweight)</Td></tr>
              <tr><Td>Header/Body/Footer padding</Td><Td mono>px-[loose] py-[tight]</Td><Td>結構化 sub-components 採 Dialog 同一套 padding token</Td></tr>
              <tr><Td>Portal z-index</Td><Td mono>z-50</Td><Td>Radix Portal 統一層級,避開一般頁面內容</Td></tr>
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
        <H3>預設 w-72(18rem)</H3>
        <Desc>Popover content 預設寬度 `w-72`——對應多數「簡短設定面板」情境。內容複雜時 consumer 傳 `className="w-96"` 或更寬覆寫。</Desc>
        <div className="flex flex-col gap-3 max-w-md">
          <div className="flex items-center gap-3 border border-dashed border-divider rounded-md p-3">
            <span className="text-caption font-mono w-20">w-72(預設)</span>
            <Popover><PopoverTrigger asChild><Button variant="tertiary" size="sm">開啟</Button></PopoverTrigger>
              <PopoverContent><PopoverBody><div className="text-caption">預設寬度 w-72</div></PopoverBody></PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-3 border border-dashed border-divider rounded-md p-3">
            <span className="text-caption font-mono w-20">w-96</span>
            <Popover><PopoverTrigger asChild><Button variant="tertiary" size="sm">開啟</Button></PopoverTrigger>
              <PopoverContent className="w-96"><PopoverBody><div className="text-caption">自訂 w-96</div></PopoverBody></PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div>
        <H3>sideOffset(與 trigger 的距離)</H3>
        <Desc>預設 4px。`sideOffset={8}` 用於有明顯邊界感的情境(如 toolbar popover);過大會讓浮層「斷開」視覺連接。</Desc>
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
        <Desc>Radix 原生動畫:進場 `fade-in + zoom-in-95 + slide-from-side`,離場鏡像。所有方向都使用 side-aware slide 動畫,浮層看起來從 trigger 「長出來」。</Desc>
        <ul className="text-caption text-fg-muted list-disc pl-5 space-y-1">
          <li>點擊 trigger → 開啟</li>
          <li>點 Popover 外部 → 關閉(click outside)</li>
          <li>按 Esc → 關閉</li>
          <li>焦點離開 trigger-content 樹 → 關閉(可 `onOpenAutoFocus` preventDefault 覆寫)</li>
        </ul>
      </div>

      <div>
        <H3>Modal vs Non-modal</H3>
        <Desc>預設 non-modal:不鎖 body scroll,使用者可和 popover 外部互動(例:篩選 popover 開著,使用者仍可 scroll 列表看結果)。`modal={true}` 改為 modal 行為——適合「確認後才能繼續」的場景(但通常這種情境應改用 Dialog)。</Desc>
      </div>

      <div>
        <H3>Disabled / loading / empty / error 的職責邊界</H3>
        <Desc>{'Popover 是容器,本身無這些狀態——內容層負責。trigger 的 disabled 由 trigger 元件自己管(`<Button disabled>`);內容的 loading / empty / error 由 consumer 在 `PopoverContent` 內部渲染對應 primitive(Skeleton / Empty / Alert)。'}</Desc>
      </div>
    </div>
  ),
}
