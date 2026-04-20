import type { Meta, StoryObj } from '@storybook/react'
import { Switch } from './switch'
import { H3, Desc, Td, Th, Swatch, TokenCell } from '@/design-system/components/_anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Switch/設計規格',
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
        <Desc>Track(pill 形容器)+ Thumb(白色圓 + 2px border + check icon when ON)。基於 Radix Switch,shadcn 包裝 + 橋接 DS token。</Desc>
        <div className="flex items-center gap-6 border border-border rounded-lg p-6">
          <Switch />
          <Switch defaultChecked />
          <span className="text-caption text-fg-muted font-mono">OFF → ON 切換 track bg-border → bg-primary,thumb 白色 + 2px border 視覺延續</span>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['size', "'sm' | 'md' | 'lg'", "'md'", '對齊 field size tier(sm 跟 md 視覺相同)'],
                ['checked / defaultChecked', 'boolean', '—', 'ON/OFF 狀態(受控 / 非受控)'],
                ['onCheckedChange', '(checked: boolean) => void', '—', '切換 callback'],
                ['label', 'ReactNode', '—', 'inline label(Field context 內會被忽略)'],
                ['description', 'ReactNode', '—', 'inline description(與 label 搭配)'],
                ['disabled', 'boolean', 'false', '停用(opacity-disabled 保留顏色,見 spec)'],
                ['readOnly', 'boolean', 'false', '鎖定互動但視覺正常(pointer-events-none + aria-readonly)'],
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

export const SizeMatrix: Story = {
  name: 'Size 對照',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>三種 Size — 對齊 field / button tier</H3>
        <Desc>sm 和 md 視覺完全相同(命名 mapping,讓 consumer 直接傳同一個 size)。lg 是 24×48(track 寬 = 2 × 高,pill 比例固定)。</Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Size</Th><Th>Track</Th><Th>Thumb 直徑</Th><Th>白色圓</Th><Th>Check icon</Th><Th>配對 field</Th></tr></thead>
            <tbody>
              <tr><Td mono>sm / md ★default</Td><Td mono>20 × 40</Td><Td mono>20</Td><Td mono>16</Td><Td mono>12</Td><Td>field-sm / md</Td></tr>
              <tr><Td mono>lg</Td><Td mono>24 × 48</Td><Td mono>24</Td><Td mono>20</Td><Td mono>16</Td><Td>field-lg</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-8 border border-border rounded-lg p-4">
          <div className="flex flex-col items-center gap-2">
            <Switch size="sm" defaultChecked />
            <span className="text-caption text-fg-muted font-mono">sm</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Switch size="md" defaultChecked />
            <span className="text-caption text-fg-muted font-mono">md</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Switch size="lg" defaultChecked />
            <span className="text-caption text-fg-muted font-mono">lg</span>
          </div>
        </div>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為(ON / OFF / disabled / readonly)',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>視覺狀態對照</H3>
        <Desc>disabled 用 opacity-disabled 保留顏色(Switch 特例,見下「Disabled 策略」)。readonly 視覺正常但互動鎖定。</Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>State</Th><Th>Track</Th><Th>Thumb</Th><Th>Check icon</Th></tr></thead>
            <tbody>
              <tr><Td>OFF</Td><Td><TokenCell token="--border" display="bg-border(neutral-5)" /></Td><Td mono>白色無 border</Td><Td>—</Td></tr>
              <tr><Td>ON</Td><Td><TokenCell token="--primary" display="bg-primary" /></Td><Td><span className="inline-flex items-center gap-1.5"><Swatch value="--primary" size="sm" /><span className="font-mono">白色 + 2px primary border</span></span></Td><Td><TokenCell token="--primary" display="primary check" /></Td></tr>
              <tr><Td>Disabled OFF</Td><Td>opacity-disabled 套於整體</Td><Td>同 OFF(顏色保留)</Td><Td>—</Td></tr>
              <tr><Td>Disabled ON</Td><Td>opacity-disabled 套於整體</Td><Td>同 ON(顏色保留)</Td><Td>同 ON</Td></tr>
              <tr><Td>Readonly</Td><Td>正常顏色</Td><Td>正常視覺</Td><Td>視 on/off</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-2xl">
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">OFF</div>
            <Switch />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">ON</div>
            <Switch defaultChecked />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Disabled OFF</div>
            <Switch disabled />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Disabled ON</div>
            <Switch disabled defaultChecked />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Readonly ON</div>
            <Switch readOnly defaultChecked />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Readonly OFF</div>
            <Switch readOnly />
          </div>
        </div>
      </div>

      <div>
        <H3>Disabled 策略:opacity 而非灰階 swap</H3>
        <Desc>Switch 的 on/off 視覺差異**唯一載體是顏色**(track bg-primary vs bg-border)——track 和 thumb 在 on/off 之間形狀完全相同。若用灰階 swap(把 primary 換成 border),disabled 的 ON 和 OFF 會看起來一模一樣,使用者無法分辨當前狀態。必須保留顏色。</Desc>
        <p className="text-footnote text-fg-muted">對照 Checkbox / Slider 用灰階 swap(形狀/位置承載 state,不依賴顏色)——詳見 switch.spec.md「Disabled 用 opacity」。</p>
      </div>
    </div>
  ),
}

export const LabelIntegration: Story = {
  name: 'label / description 整合',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Inline label / description</H3>
        <Desc>Switch 可透過 `label` / `description` props 內部直接渲染緊鄰文字,不需 consumer 組合。</Desc>
        <div className="flex flex-col gap-4 max-w-md border border-dashed border-divider rounded-md p-4">
          <Switch label="啟用 Bluetooth" defaultChecked />
          <Switch
            label="啟用通知"
            description="收到新訊息時提醒"
            defaultChecked
          />
          <Switch
            label="Dark mode"
            description="跟隨系統主題"
          />
        </div>
      </div>

      <div>
        <H3>在 Field context 內</H3>
        <Desc>Switch 在 `&lt;Field&gt;` context 內時 label / description prop 會被自動忽略(由 FieldLabel / FieldDescription 接管),避免雙層 label。</Desc>
      </div>
    </div>
  ),
}
