// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from './dialog'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'
import { Field, FieldLabel, FieldGroup } from '@/design-system/components/Field/field'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Dialog/設計規格',
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
        <Desc>Dialog 由 Overlay + Content 組成。Content 分三個區塊:Header(邊框底)+ Body(可捲動 flex-1)+ Footer(邊框頂)。基於 Radix Dialog(shadcn 包裝),橋接 DS token。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary">開啟 Dialog 範例</Button>
            </DialogTrigger>
            <DialogContent autoHeight maxWidth={480}>
              <DialogHeader>
                <DialogTitle>建立新專案</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <FieldGroup>
                  <Field required>
                    <FieldLabel>專案名稱</FieldLabel>
                    <Input placeholder="例:Q1 行銷活動" />
                  </Field>
                  <Field>
                    <FieldLabel>描述</FieldLabel>
                    <Input placeholder="簡短描述..." />
                  </Field>
                </FieldGroup>
              </DialogBody>
              <DialogFooter>
                <Button variant="tertiary">取消</Button>
                <Button variant="primary">建立</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div>
        <H3>結構說明</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>區塊</Th><Th>CSS</Th><Th>用途</Th></tr></thead>
            <tbody>
              <tr><Td mono>DialogHeader</Td><Td mono>border-b, px-loose py-tight</Td><Td>Title + Close button(fixed top-right)</Td></tr>
              <tr><Td mono>DialogBody</Td><Td mono>flex-1, overflow-y-auto, px-loose pt-tight pb-bottom</Td><Td>主要內容(可捲動,底部留較大空間)</Td></tr>
              <tr><Td mono>DialogFooter</Td><Td mono>border-t, px-loose py-tight</Td><Td>Action buttons(justify-end, gap-2)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['autoHeight', 'boolean', 'false', 'true=隨內容 / false=填滿 viewport(body 捲動)'],
                ['maxWidth', 'number', '512', 'Content 最大寬度(px),受 viewport inset 限制'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: { description: { story: '右側 Controls 切 DialogContent props 即時 render,取代 Figma inspect。調整 `maxWidth` / `autoHeight` 看寬度 tier 與高度模式差異。Dialog 預設 open=true,直接展示內容不需 trigger。' } },
  },
  args: {
    maxWidth: 512,
    autoHeight: true,
  },
  argTypes: {
    maxWidth: {
      control: 'select',
      options: [400, 480, 512, 560, 720],
      description: '400=confirmation / 480=simple form / 512★default / 560=detailed / 720=rich',
    },
    autoHeight: {
      control: 'boolean',
      description: 'true=隨內容 / false=填滿 viewport(body 捲動,防內容跳動)',
    },
  },
  render: (args) => (
    <Dialog defaultOpen>
      <DialogContent {...args}>
        <DialogHeader>
          <DialogTitle>建立新專案</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <FieldGroup>
            <Field required>
              <FieldLabel>專案名稱</FieldLabel>
              <Input placeholder="例:Q1 行銷活動" />
            </Field>
            <Field>
              <FieldLabel>專案描述</FieldLabel>
              <Input placeholder="一句話介紹專案目標..." />
            </Field>
            <Field>
              <FieldLabel>團隊</FieldLabel>
              <Input placeholder="Engineering" />
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogFooter>
          <Button variant="tertiary">取消</Button>
          <Button variant="primary">建立</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const HeightBehavior: Story = {
  name: '高度行為(預設填滿 vs autoHeight)',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>預設(填滿 viewport)</H3>
        <Desc>`height = 100vh - inset*2`,Body 捲動。防止動態內容(載入資料、展開 section)造成 dialog 跳動。適合內容量不確定的場景。</Desc>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary">填滿 viewport(20 個欄位)</Button>
          </DialogTrigger>
          <DialogContent maxWidth={560}>
            <DialogHeader>
              <DialogTitle>系統設定</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <FieldGroup>
                {Array.from({ length: 20 }).map((_, i) => (
                  <Field key={i}>
                    <FieldLabel>設定項目 {i + 1}</FieldLabel>
                    <Input placeholder={`設定值 ${i + 1}`} />
                  </Field>
                ))}
              </FieldGroup>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">儲存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        <H3>autoHeight</H3>
        <Desc>高度隨內容,超過 viewport 時套 max-height 安全帽。適合內容量已知且穩定的場景(確認框、短表單)。</Desc>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary">autoHeight(短確認)</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth={440}>
            <DialogHeader>
              <DialogTitle>確認儲存?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">變更將儲存到雲端,其他協作者將看到更新。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">儲存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  ),
}

export const DestructiveMatrix: Story = {
  name: '破壞性動作 Dialog',
  render: () => (
    <div className="flex flex-col gap-8 max-w-md">
      <div>
        <H3>破壞性動作的 footer 配對</H3>
        <Desc>破壞性動作用 primary + danger(立即不可逆)。必須搭配 Cancel button 讓使用者反悔。Title 用問句讓使用者意識到「這是個決策」。</Desc>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary" startIcon={Trash2}>刪除專案(含確認)</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth={440}>
            <DialogHeader>
              <DialogTitle>確定要永久刪除此專案?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">此動作無法復原,所有相關資料將一併刪除。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary" danger startIcon={Trash2}>永久刪除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  ),
}

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>四種常見 maxWidth tier</H3>
        <Desc>
          Dialog 沒有 `size` prop(跟 Button / Input 的 sm/md/lg 不同)——由 `maxWidth`(px number)
          直接控制。選擇 tier 依內容量:confirmation → 400;form → 480;complex form → 560;rich form /
          dashboard → 720。Viewport 小於 maxWidth 時自動收到 inset 內(48px 四邊留白)。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>maxWidth</Th>
                <Th>使用場景</Th>
                <Th>content 範例</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td mono>400</Td><Td>Confirmation / alert</Td><Td>「確定要刪除?」/「儲存變更?」</Td></tr>
              <tr><Td mono>480</Td><Td>Simple form</Td><Td>建立專案、改密碼、邀請成員(1-3 fields)</Td></tr>
              <tr><Td mono>512 ★ default</Td><Td>Medium form</Td><Td>通用表單 4-6 fields</Td></tr>
              <tr><Td mono>560</Td><Td>Detailed form</Td><Td>建立完整 issue、商品資訊</Td></tr>
              <tr><Td mono>720</Td><Td>Rich form / dashboard preview</Td><Td>多欄位表單、嵌入 data preview</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          {[400, 480, 560, 720].map(w => (
            <Dialog key={w}>
              <DialogTrigger asChild>
                <Button variant="tertiary" size="sm">maxWidth={w}</Button>
              </DialogTrigger>
              <DialogContent autoHeight maxWidth={w}>
                <DialogHeader>
                  <DialogTitle>示範 Dialog({w}px)</DialogTitle>
                </DialogHeader>
                <DialogBody>
                  <p className="text-body">這是 maxWidth = {w}px 的 Dialog。實際渲染寬度 = min(viewport - 96px, {w}px)。</p>
                </DialogBody>
                <DialogFooter>
                  <Button variant="tertiary">取消</Button>
                  <Button variant="primary">確定</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ))}
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          Dialog 在 viewport 小於 `maxWidth + 96px` 時自動縮到 inset 內——48px 四邊 viewport padding
          是硬上限(token: `--layout-space-bottom`)。
        </p>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>開關方式對照</H3>
        <Desc>
          Dialog 基於 Radix Dialog,提供五種觸發方式。destructive 場景應該 disable
          overlay-click 和 ESC(強迫使用者按 Cancel / 確認按鈕),避免誤觸。
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>關閉方式</Th>
                <Th>預設</Th>
                <Th>禁用 prop</Th>
                <Th>建議場景</Th>
              </tr>
            </thead>
            <tbody>
              <tr><Td>Click trigger(外部)</Td><Td>✓</Td><Td>—</Td><Td>Radix 管理 open state</Td></tr>
              <tr><Td>Click X close button(DialogHeader 右上)</Td><Td>✓</Td><Td>—</Td><Td>永遠可用</Td></tr>
              <tr><Td>ESC key</Td><Td>✓</Td><Td mono>onEscapeKeyDown={'{(e) => e.preventDefault()}'}</Td><Td>destructive 動作應禁用</Td></tr>
              <tr><Td>Click overlay(外圍)</Td><Td>✓</Td><Td mono>onPointerDownOutside={'{(e) => e.preventDefault()}'}</Td><Td>destructive / form 未儲存應禁用</Td></tr>
              <tr><Td>Programmatic close</Td><Td>✓</Td><Td>—</Td><Td mono>setOpen(false)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>預設行為(open / close / ESC / overlay-click 都可關)</H3>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary">預設 Dialog(試 ESC / 點 overlay)</Button>
          </DialogTrigger>
          <DialogContent autoHeight maxWidth={440}>
            <DialogHeader>
              <DialogTitle>一般表單 Dialog</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">可以按 ESC、點 overlay、或點右上 X 關閉。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary">儲存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        <H3>禁用 ESC + overlay-click(destructive 場景)</H3>
        <Desc>
          destructive 動作(刪除、破壞性資料變更)應該強迫使用者明確按「取消」或「永久刪除」,
          不能藉由 ESC / overlay 誤觸。禁用這兩個 affordance。
        </Desc>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="tertiary" startIcon={Trash2}>Force-decide Dialog(禁 ESC / overlay)</Button>
          </DialogTrigger>
          <DialogContent
            autoHeight
            maxWidth={440}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>確定要永久刪除 42 筆訂單?</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="text-body">此動作無法復原,所有關聯交易紀錄將一併刪除。ESC 與點擊外部均已禁用,必須明確選擇。</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="tertiary">取消</Button>
              <Button variant="primary" danger startIcon={Trash2}>永久刪除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        <H3>Focus management(Radix 預設)</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>階段</Th><Th>行為</Th></tr></thead>
            <tbody>
              <tr><Td>Open</Td><Td>focus 自動落到 Dialog 內第一個 focusable element(通常 Cancel button)</Td></tr>
              <tr><Td>Tab cycle</Td><Td>focus trap——Tab 在 Dialog 內循環,不跳到背景頁</Td></tr>
              <tr><Td>Close</Td><Td>focus 自動回到觸發 Dialog 的原 trigger element</Td></tr>
            </tbody>
          </table>
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
        <H3>Density</H3>
        <Desc>Dialog 繼承 page `data-density`(v5 校準,跟 Sheet 對齊)— 不自設密度 attribute。先前曾設 `data-layout-space="lg"` 給 body 寬鬆呼吸,但跟 `--chrome-header-height` canonical(md=48)衝突,2026-04-22 撤回。世界級:Polaris Modal px 16(md loose)/ Material M3 24(lg loose)— 我方跟 page density 自動對齊。</Desc>
      </div>

      <div>
        <H3>Layout token</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Area</Th><Th>Token</Th><Th>數值</Th></tr></thead>
            <tbody>
              <tr><Td>水平 padding(Header / Body / Footer 統一)</Td><Td mono>--layout-space-loose</Td><Td>24/32 px</Td></tr>
              <tr><Td>Header / Footer 垂直 padding</Td><Td mono>--layout-space-tight</Td><Td>12/16 px</Td></tr>
              <tr><Td>Body 垂直 padding(top)</Td><Td mono>--layout-space-tight</Td><Td>12/16 px</Td></tr>
              <tr><Td>Body 垂直 padding(bottom)</Td><Td mono>--layout-space-bottom</Td><Td>48 px(固定)</Td></tr>
              <tr><Td>Viewport inset(四邊)</Td><Td mono>--layout-space-bottom</Td><Td>48 px(四邊統一)</Td></tr>
              <tr><Td>Footer 按鈕間距</Td><Td mono>gap-2</Td><Td>8 px</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>視覺 token</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>屬性</Th><Th>Token</Th></tr></thead>
            <tbody>
              <tr><Td>Overlay</Td><Td mono>bg-overlay</Td></tr>
              <tr><Td>Shadow</Td><Td mono>--elevation-200(浮層級)</Td></tr>
              <tr><Td>圓角</Td><Td mono>rounded-lg(8px)</Td></tr>
              <tr><Td>背景</Td><Td mono>bg-surface-raised</Td></tr>
              <tr><Td>外邊框</Td><Td mono>border-border</Td></tr>
              <tr><Td>Header/Footer 分隔線</Td><Td mono>border-divider</Td></tr>
              <tr><Td>Title</Td><Td mono>text-body-lg font-medium truncate</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>動畫</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>階段</Th><Th>動畫</Th></tr></thead>
            <tbody>
              <tr><Td>進場</Td><Td mono>fade-in + zoom-in-95 + slide-in-from-center</Td></tr>
              <tr><Td>離場</Td><Td mono>fade-out + zoom-out-95 + slide-out-to-center</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}
