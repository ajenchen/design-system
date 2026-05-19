// @anatomy-exempt: pattern-level demo,展示 SSOT 契約而非業務情境表格。
import type { Meta, StoryObj } from '@storybook/react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogTrigger,
} from '@/design-system/components/Dialog/dialog'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/design-system/components/Tabs/tabs'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Patterns/Header Canonical',
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj

/**
 * Demo: Dialog 標頭內含分頁(用 `tabsSlot` prop)
 *
 * 對應 `header-canonical.spec.md` W1-W4 真實能用結構:
 *   W1 ✓ header 自己 border 撤掉,row 2 wrapper 接管 paint(視覺一條線)
 *   W2 ✓ TabsList 不設左右 padding,row 2 wrapper 提供 `px-[var(--layout-space-loose)]` 給 TabsList 繼承
 *   W4 ✓ row 1(title + close X)上 + row 2(tabs)下 flush stack,gap = 0
 *
 * Anatomy(consumer 寫法):
 *   <Tabs>                                       ← Radix root,wrap 整個 DialogContent
 *     <DialogHeader tabsSlot={<TabsList>...}>    ← tabsSlot 提供 = 自動 column mode
 *       <DialogTitle>...</DialogTitle>           ← row 1 content
 *     </DialogHeader>
 *     <DialogBody>                                ← row 3:scrollable body,自帶 px-loose
 *       <TabsContent>...</TabsContent>           ← active tab panel content
 *     </DialogBody>
 *   </Tabs>
 *
 * 注意:TabsContent 必放 DialogBody 內(scroll + chrome padding 由 DialogBody 自管),
 *      不要自己加 padding override(會跟 DialogBody canonical 衝突)。
 *
 * ChromeHeader 範例(Sidebar / FileViewer / Drawer 用)等做 layout template 時一起秀。
 */
export const DialogHeaderWithTabs: Story = {
  name: '對話框標頭內含分頁',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">打開含分頁的對話框</Button>
      </DialogTrigger>
      <DialogContent>
        <Tabs defaultValue="general">
          <DialogHeader
            tabsSlot={
              <TabsList>
                <TabsTrigger value="general">一般</TabsTrigger>
                <TabsTrigger value="members">成員</TabsTrigger>
                <TabsTrigger value="integrations">整合</TabsTrigger>
              </TabsList>
            }
          >
            <DialogTitle>專案設定</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <TabsContent value="general">
              一般設定內容。Body 由 DialogBody 自管 padding(`px-loose pt-tight pb-bottom`)
              + ScrollArea。TabsContent 直接放內容不需 wrapper。
            </TabsContent>
            <TabsContent value="members">
              成員管理內容。新增成員、調整權限。
            </TabsContent>
            <TabsContent value="integrations">
              第三方整合內容。串接 Slack / GitHub / Linear。
            </TabsContent>
          </DialogBody>
        </Tabs>
      </DialogContent>
    </Dialog>
  ),
}

/**
 * Demo: 對照組 — 不含分頁的標頭(預設 border-b 由 header 自畫)
 */
export const DialogHeaderDefault: Story = {
  name: '對話框標頭(單線,無分頁)',
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">打開單純對話框</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>專案設定</DialogTitle>
        </DialogHeader>
        <DialogBody>
          一般設定內容。Header 跟 Body 之間有一條 `border-b border-divider`,由 DialogHeader 自畫。
        </DialogBody>
      </DialogContent>
    </Dialog>
  ),
}
