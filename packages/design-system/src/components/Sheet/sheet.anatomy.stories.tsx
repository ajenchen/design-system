// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
} from './sheet'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

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
        <Desc>Sheet 基於 Radix Dialog 的 side variant——從畫面邊緣滑入的浮層面板。結構跟 Dialog 同（Header + Content + Footer），差異在位置與動畫。消費者 API 僅 side=&quot;right&quot;（detail panel、filter drawer）；top / bottom / left 為 DS 內部基建變體（見下方 Side 方向表）。</Desc>
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
              <SheetBody className="text-body">
                <p className="mb-3 text-fg-secondary">使用者於結帳最後一步點選「完成付款」後,頁面卡在轉圈動畫超過 30 秒,最終回到購物車且訂單未成立。重現率約 1/5,僅出現在 Safari 17。</p>
                <p className="text-caption text-fg-muted">優先級 P1 · 影響 230 筆訂單 · 截止 2026-04-25</p>
              </SheetBody>
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
        <Desc>Sheet / SheetTrigger / SheetClose / SheetPortal 是 Radix Dialog 的薄 re-export;SheetHeader / SheetBody / SheetFooter 不是 re-export——它們各自組合了關閉 X 按鈕、捲動區域與底部分隔，並消費共用的浮層 padding；SheetTitle / SheetDescription 則在 Radix 基底上再加上字級與間距樣式。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop (SheetContent)</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td mono>side</Td><Td mono>'top' | 'right' | 'bottom' | 'left'</Td><Td mono>'right'</Td><Td>滑入方向,決定浮層位置 + 動畫</Td></tr>
              <tr><Td mono>open / onOpenChange</Td><Td mono>boolean / (o) =&gt; void</Td><Td mono>—</Td><Td>controlled 開關(選用)——掛在 root <code>Sheet</code> 非 SheetContent</Td></tr>
              <tr><Td mono>onEscapeKeyDown</Td><Td mono>(e) =&gt; void</Td><Td mono>—</Td><Td>Esc 鍵 callback,preventDefault 阻止關閉</Td></tr>
              <tr><Td mono>onPointerDownOutside</Td><Td mono>(e) =&gt; void</Td><Td mono>—</Td><Td>點擊外部 callback,preventDefault 阻止關閉</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ── Inspector ─────────────────────────────────────────────────────────────

interface InspectorArgs {
  side: 'top' | 'right' | 'bottom' | 'left'
  width: 'default' | 'sm' | 'lg'
  showFooter: boolean
}

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story:
          '右側 Controls 切 SheetContent props 即時 render,取代 Figma inspect。切 `side` 看四個方向的滑入動畫 + 位置;切 `width` 看自訂寬度覆寫。點 trigger 觸發 Sheet,Esc 或點遮罩關閉。',
      },
    },
  },
  args: {
    side: 'right',
    width: 'default',
    showFooter: true,
  },
  argTypes: {
    side: {
      control: 'radio',
      options: ['top', 'right', 'bottom', 'left'],
      description: 'right★default(detail drawer)/ left(mobile nav)/ top(notification)/ bottom(action sheet)',
    },
    width: {
      control: 'radio',
      options: ['default', 'sm', 'lg'],
      description: 'default=w-3/4 + sm:max-w-md / sm=max-w-sm / lg=max-w-lg',
    },
    showFooter: { control: 'boolean', description: '顯示 SheetFooter(含「取消 / 儲存」CTA)' },
  },
  render: (args) => {
    const { side, width, showFooter } = args as InspectorArgs
    const widthClass =
      width === 'sm' ? 'sm:max-w-sm' : width === 'lg' ? 'sm:max-w-lg' : ''
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="tertiary">開啟任務詳情</Button>
        </SheetTrigger>
        <SheetContent side={side} className={widthClass}>
          <SheetHeader>
            <SheetTitle>修復付款流程 bug</SheetTitle>
            <SheetDescription>#PROJ-1234 · 指派給陳大明</SheetDescription>
          </SheetHeader>
          <SheetBody className="text-body">
            <p className="mb-3 text-fg-secondary">使用者於結帳最後一步點選「完成付款」後,頁面卡在轉圈動畫超過 30 秒,最終回到購物車且訂單未成立。重現率約 1/5,僅出現在 Safari 17。</p>
            <p className="text-caption text-fg-muted">優先級 P1 · 影響 230 筆訂單 · 截止 2026-04-25</p>
          </SheetBody>
          {showFooter && (
            <SheetFooter>
              <Button variant="tertiary">標記為已解決</Button>
              <Button variant="primary">儲存變更</Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    )
  },
}

export const SideMatrix: Story = {
  name: 'Side 方向 × 用途',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Side 方向（消費者 API = right；其餘為 DS 內部基建）</H3>
        <Desc>消費者 code 只能用 side=&quot;right&quot;。top / bottom / left 變體保留 DS 內部基建用（例：Sidebar 小視口 left-slide），消費者禁止直接傳、需授權（canonical 見 sheet.tsx L23-27 + showcase AR35）。下表後三列為內部能力 + 世界級對照，供 DS contributor 參考。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Side</Th><Th>滑入方向</Th><Th>典型用途</Th><Th>世界級對照</Th></tr></thead>
            <tbody>
              <tr><Td mono>right ★消費者 default</Td><Td>從右邊</Td><Td>消費者 API：Detail panel（Jira task drawer、Linear issue detail、GitHub PR file diff drawer）、filter panel</Td><Td>Jira / Linear / Notion side panel</Td></tr>
              <tr><Td mono>left（內部）</Td><Td>從左邊</Td><Td>DS 內部基建：Sidebar 小視口 left-slide（非消費者 API）</Td><Td>Material mobile drawer、Slack mobile nav</Td></tr>
              <tr><Td mono>top（內部）</Td><Td>從上方</Td><Td>DS 內部基建保留（非消費者 API，notification center 類）</Td><Td>iOS Control Center top pull-down</Td></tr>
              <tr><Td mono>bottom（內部）</Td><Td>從下方</Td><Td>DS 內部基建保留（非消費者 API；mobile bottom sheet 另用專屬元件）</Td><Td>iOS Bottom Sheet、Material Bottom Sheet</Td></tr>
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
            <SheetBody>
              <p className="text-body text-fg-secondary">本季營收 NT$4,820 萬,較上季成長 12%;毛利率 38.5%。下方附完整損益表與部門別明細,可直接在此面板註記後送交財務複核。</p>
            </SheetBody>
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
        <Desc>Sheet 和 Dialog 共用 `bg-surface-raised` + elevation-200——改其中一個必須連動另一個,不讓 modal 家族視覺漂移。容器邊框各自不同:Sheet 用較淡的 `border-divider`,Dialog 用 `border-border`。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>層</Th><Th>Token</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td>Overlay</Td><Td><TokenCell token="--overlay" display="bg-overlay" /></Td><Td>背景遮罩 semi-transparent</Td></tr>
              <tr><Td>Sheet 背景</Td><Td><TokenCell token="--surface-raised" display="bg-surface-raised" /></Td><Td>比 surface 高一階</Td></tr>
              <tr><Td>容器邊框</Td><Td><TokenCell token="--divider" display="border-divider" /></Td><Td>側緣描邊,較 Dialog 的 border-border 淡一階</Td></tr>
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
              <tr><Td mono>right / left</Td><Td mono>w-3/4（手機佔 75% 寬）</Td><Td>sm:max-w-md（桌機 448px）</Td></tr>
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
        <Desc>Radix 提供 data-state 切換 + DS Tailwind animate 驅動進離場動畫（slide-in-from-側邊 + fade-in overlay，300ms；sheet.tsx L69-78），離場鏡像。Modal 狀態鎖 body scroll。</Desc>
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

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"Sheet 沿用 Radix 對話框的無障礙預設,開啟後會自動標記為對話框、把標題念給螢幕報讀器聽,並把鍵盤焦點鎖在面板內。\n\n鍵盤操作:\n\n- Tab — 焦點只在面板內循環,不會跑到背景頁面\n- Shift + Tab — 反向循環焦點\n- Esc — 關閉面板\n\n焦點:開啟時自動把焦點移進面板,關閉後還回原本的觸發按鈕;鍵盤聚焦的元素會顯示清楚的外框。\n\n驗證標準:Storybook 無障礙檢查面板不應出現嚴重問題,且全程僅用鍵盤即可操作,不需滑鼠。文字對比至少 4.5:1、介面元素對比至少 3:1(WCAG AA)。"}</p>
    </div>
  ),
}
