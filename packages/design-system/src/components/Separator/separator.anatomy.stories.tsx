// @anatomy-rationale:
//   Inspector / ColorMatrix / SizeMatrix / StateBehavior N/A — Separator 是
//   最薄的語意 primitive(Radix Separator passthrough),只有 orientation 與
//   decorative 兩個 prop;1px 固定厚度、永遠走 --divider token、非互動。本檔
//   僅保留 Overview + TokenMatrix 兩個 story 教 SSOT 分工(--divider vs
//   --border),完整設計規則見 separator.spec.md。
import type { Meta, StoryObj } from '@storybook/react'
import { Separator } from './separator'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

/**
 * Separator 是最薄的語意 primitive——Radix Separator 的 shadcn passthrough。
 * 只有 `orientation` 與 `decorative` 兩個 prop,**沒有 size / color / variant**。
 * 色彩固定用 `--divider` token(content 分隔 canonical)。因此本 spec 只有
 * Overview + Token Matrix 兩個 story——沒有 SizeMatrix(單一 1px)、沒有獨立
 * ColorMatrix(永遠 divider)、沒有 StateMatrix(非互動)。完整設計規則見
 * `separator.spec.md`。
 */

const meta: Meta = {
  title: 'Design System/Components/Separator/設計規格',
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
        <Desc>Separator 是語意分隔元件——consumer 手動放置的分隔線。基於 Radix Separator(shadcn passthrough),提供正確的 ARIA 語意:預設 `decorative=true` 時 render `role="none"`(SR 跳過),`decorative={false}` 時 render `role="separator"` + orientation 語意。元件固定結構(header/footer 邊框)和裝飾性邊框**不使用 Separator**。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-md">
          <div className="flex flex-col gap-2 py-2">
            <div className="text-body">個人資訊</div>
            <Separator />
            <div className="text-body">團隊與權限</div>
          </div>
        </div>
      </div>

      <div>
        <H3>Orientation</H3>
        <div className="flex gap-8 border border-border rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-body">Horizontal(預設)</div>
            <Separator />
            <div className="text-body">分隔水平群組</div>
          </div>
          <div className="flex items-center gap-4 h-20">
            <div className="text-body">左側</div>
            <Separator orientation="vertical" />
            <div className="text-body">右側(vertical)</div>
          </div>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['orientation', "'horizontal' | 'vertical'", "'horizontal'", '分隔線方向'],
                ['decorative', 'boolean', 'true', 'true=裝飾性(role="none",SR 跳過)/ false=語意分隔(role="separator")'],
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

export const TokenMatrix: Story = {
  name: '設計變數 規則（--divider vs --border）',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>兩個不同 token 的語意分工</H3>
        <Desc>`--divider`(neutral-4,較淡)用於內容分隔;`--border`(neutral-5,較深)用於控件 / 容器邊框。視覺接近但語意不同,**分隔線一律用 `--divider`**。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>用途</Th><Th>Token</Th><Th>值</Th><Th>範例</Th></tr></thead>
            <tbody>
              <tr><Td>分隔線(content separation)</Td><Td mono>--divider</Td><Td mono>neutral-4</Td><Td>SidebarSeparator、DropdownMenuSeparator、ButtonDivider、群組分隔</Td></tr>
              <tr><Td>控件邊框(container/control edge)</Td><Td mono>--border</Td><Td mono>neutral-5</Td><Td>Input / Checkbox 外框、Card / Dialog 容器邊線、DataTable 格線</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>決策法:「誰決定這裡要分隔?」</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>決策者</Th><Th>使用</Th><Th>理由</Th></tr></thead>
            <tbody>
              <tr><Td>Consumer 手動放置</Td><Td mono>&lt;Separator /&gt;</Td><Td>需要語意標記(role="separator")讓輔助技術辨識</Td></tr>
              <tr><Td>元件自動分隔相鄰群組</Td><Td mono>CSS [&+&]</Td><Td>MenuGroup / SidebarGroup——無處插入 DOM node</Td></tr>
              <tr><Td>元件固定結構</Td><Td mono>CSS border-t/b</Td><Td>Dialog Header/Footer、Sidebar Header/Footer——結構的一部分</Td></tr>
              <tr><Td>控件外框 / 容器輪廓</Td><Td mono>CSS border</Td><Td>Input 外框、Card 容器——不分隔內容,是元件邊緣</Td></tr>
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
      <p className="whitespace-pre-line">{"Separator 非互動元件——不取得 focus、無鍵盤行為。ARIA role 視 decorative 而定(對齊 Radix Separator primitive):\n\n- 預設 decorative=true:render role=\"none\",screen reader 跳過(避免「separator」雜訊干擾 list 朗讀)\n- 語意分隔場景 decorative={false}:render role=\"separator\"(aria-orientation 僅 orientation=\"vertical\" 時輸出;horizontal 為預設方向,Radix 省略冗餘屬性),screen reader 讀出群組邊界\n\n判斷:同 list 內 item 之間的視覺隔線 = decorative(預設);跨 region 的結構分隔(sidebar group / menu group)= semantic。詳 separator.spec.md「A11y 預設」段。"}</p>
    </div>
  ),
}
