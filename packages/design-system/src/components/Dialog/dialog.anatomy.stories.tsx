// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-exempt: spec-reference tables(Props 速查 / Layout token / 視覺 token / 開關方式對照 / Focus management)為靜態文件對照表,非互動資料網格 — DataTable 為 row-data 互動元件,過度包裝靜態 spec 對照。對齊 Sheet / Popover anatomy 同 pattern。
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
              <tr><Td mono>DialogHeader</Td><Td mono>border-b, px-loose py-tight</Td><Td>Title + Close button(靠右,flex 第一 child flex-1 grow 自然右推,非 position:fixed)</Td></tr>
              <tr><Td mono>DialogBody</Td><Td mono>ScrollArea(flex-1 min-h-0)+ inner div(px-loose pt-tight pb-bottom)</Td><Td>主要內容(ScrollArea 捲動,底部留較大空間)</Td></tr>
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
                ['maxWidth', 'string | number', "'512px'", 'Content 最大寬度(傳 number 視為 px,亦可傳 CSS 值如 32rem),受 viewport inset 限制'],
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
  name: '高度行為（預設填滿 vs autoHeight）',
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
              <DialogTitle>通知偏好設定</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <FieldGroup>
                {[
                  { label: '桌面通知音效', placeholder: 'Hero / 預設 / 安靜 / 關閉' },
                  { label: '頻道訊息通知', placeholder: '所有訊息 / 僅關鍵字 / 關閉' },
                  { label: '直接訊息通知', placeholder: '所有 DM / 僅未讀 / 關閉' },
                  { label: '@提及推播', placeholder: '即時 / 5 分鐘批次 / 摘要' },
                  { label: '@頻道全員推播', placeholder: '允許 / 僅追蹤頻道 / 關閉' },
                  { label: '執行緒回覆通知', placeholder: '我參與的 / 全部 / 關閉' },
                  { label: '關鍵字監控', placeholder: '輸入關鍵字,逗號分隔' },
                  { label: '行動裝置推播', placeholder: '所有 / 僅 DM / 關閉' },
                  { label: '推播延遲(秒)', placeholder: '0 / 30 / 60 / 120' },
                  { label: '推播閒置觸發', placeholder: '5 分鐘 / 15 分鐘 / 永不' },
                  { label: '訊息預覽顯示', placeholder: '顯示內容 / 僅標題 / 隱藏' },
                  { label: '勿擾時段開始', placeholder: '22:00' },
                  { label: '勿擾時段結束', placeholder: '08:00' },
                  { label: '週末勿擾', placeholder: '六日全天 / 自訂 / 關閉' },
                  { label: '假日勿擾', placeholder: '依國定假日 / 自訂' },
                  { label: 'Email 摘要頻率', placeholder: '即時 / 每小時 / 每日 / 每週' },
                  { label: 'Email 摘要時段', placeholder: '09:00 / 12:00 / 18:00' },
                  { label: '未讀提醒週期', placeholder: '15 分鐘 / 30 分鐘 / 1 小時' },
                  { label: '靜音指定頻道', placeholder: '#design / #engineering' },
                  { label: '通知摘要訂閱', placeholder: '工作日摘要 / 週報' },
                ].map((field, i) => (
                  <Field key={i}>
                    <FieldLabel>{field.label}</FieldLabel>
                    <Input placeholder={field.placeholder} />
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
        <H3>Focus management</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>階段</Th><Th>行為</Th></tr></thead>
            <tbody>
              <tr><Td>Open</Td><Td>DialogContent 攔截 Radix 預設(`onOpenAutoFocus`):focus 落在 body 第一個有意義互動元素(input / textarea / select / button,排除右上關閉 X);無則退到 footer 第一顆按鈕,再退到 container。避免 Radix 預設 focus close X 觸發 tooltip</Td></tr>
              <tr><Td>Tab cycle</Td><Td>focus trap(Radix)——Tab 在 Dialog 內循環,不跳到背景頁</Td></tr>
              <tr><Td>Close</Td><Td>focus 自動回到觸發 Dialog 的原 trigger element(Radix)</Td></tr>
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
        <Desc>Dialog 鎖 `data-layout-space="lg"`(只鎖版面間距 tier)+ ui-size 繼承 page `data-density`(控件不被撐大)。modal 值得寬鬆呼吸 padding:body px-loose 24 / header py-tight 16 → header 56(宣告 lg tier)。reinstate c3d3b736 decouple(只鎖 layout-space,非當年連 ui-size 一起鎖撐高 header 的 density)。世界級:Material M3 / Atlassian modal padding 24。</Desc>
      </div>

      <div>
        <H3>Layout token</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Area</Th><Th>Token</Th><Th>數值</Th></tr></thead>
            <tbody>
              <tr><Td>水平 padding(Header / Body / Footer 統一)</Td><Td mono>--layout-space-loose</Td><Td>16/24 px</Td></tr>
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

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `dialog.spec.md` 「A11y 預設」段。摘要:\n\nRadix Dialog 自動處理：\n\n-   Modal 語意  ： role=\"dialog\" （Radix 刻意不設  aria-modal ，改用 aria-hidden  hideOthers()  把背景兄弟節點設  aria-hidden  +  FocusScope  trap 達成隔離）\n-   標題綁定  ： <DialogTitle>  自動成為  aria-labelledby  指向對象，screen reader 開啟時讀出標題\n-   Focus trap  ：焦點鎖在 Dialog 內，Tab 循環不逃出\n-   Esc 關閉  ：按 Esc 自動關閉\n-   Focus return  ：關閉時焦點返回 trigger 元素\n-   Overlay click  ：點擊 overlay 關閉（可透過  onPointerDownOutside  阻止）\n\nConsumer 必須保留  <DialogTitle> ——即使視覺不顯示，也要用  VisuallyHidden  包裹提供給 screen reader。"}</p>
    </div>
  ),
}
