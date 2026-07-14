// @anatomy-exempt: anatomy specs / token 對照表格用 raw <table>,非業務資料表。業務資料表才用 <DataTable>。
// @anatomy-rationale:
//   ColorMatrix represented as StateBehavior「視覺狀態對照」段 — Switch 不分
//     variant 色彩(全 DS 統一 track bg-border / bg-primary,thumb 白色),色彩
//     僅由 state 驅動(OFF / ON / Disabled OFF / Disabled ON / Readonly)。
//     色彩 token 矩陣已由 StateBehavior(5.)「Track / Thumb / Check icon」三欄
//     對照涵蓋,獨立 ColorMatrix 會與 StateBehavior 重複。
import type { Meta, StoryObj } from '@storybook/react'
import { Switch, type SwitchProps } from './switch'
import { H3, Desc, Td, Th, Swatch, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Switch/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj
type InspectorStory = StoryObj<SwitchProps>

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
                ['mode', "'edit' | 'display' | 'readonly' | 'disabled'", "'edit'", 'Field mode(默認 inherit Field context 或 edit);display 渲純展示 勾/叉 icon,語意由 context 提供'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", '對齊 field size tier(sm 跟 md 視覺相同)'],
                ['checked / defaultChecked', 'boolean', '—', 'ON/OFF 狀態(受控 / 非受控)'],
                ['onCheckedChange', '(checked: boolean) => void', '—', '切換 callback'],
                ['label', 'ReactNode', '—', 'inline label(Field context 內會被忽略)'],
                ['description', 'ReactNode', '—', 'inline description(與 label 搭配)'],
                ['disabled', 'boolean', 'false', '停用(opacity-disabled 保留顏色,見 spec)'],
                ['readOnly', 'boolean', 'false', 'standalone:鎖定互動視覺正常;Field 內:灰框 + 勾/叉 icon(2026-06-12 拍板)'],
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

export const Inspector: InspectorStory = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story: '在右側 Controls 面板切換 size / checked / disabled / readOnly / label 組合,即時查看 Switch 狀態。世界級 DS 的 Inspector = Figma inspect 替代。',
      },
    },
  },
  args: {
    size: 'md',
    defaultChecked: true,
    disabled: false,
    readOnly: false,
    label: '啟用通知',
    description: '收到新訊息時立即提醒',
  },
  argTypes: {
    mode: {
      control: 'radio',
      options: ['edit', 'display', 'readonly', 'disabled'],
      description: 'Field mode;display 渲純展示 勾/叉 icon(語意由 context 提供)',
    },
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: '尺寸(sm = md 視覺同,lg track 24×48)',
    },
    defaultChecked: { control: 'boolean', description: '預設 ON / OFF' },
    disabled: { control: 'boolean', description: '停用(opacity-disabled 保留顏色)' },
    readOnly: { control: 'boolean', description: '唯讀(standalone 視覺正常鎖互動;Field 內灰框 + 勾/叉 icon)' },
    label: { control: 'text', description: 'inline label(留空 → 只渲染 switch 本體)' },
    description: { control: 'text', description: 'inline description(需搭配 label)' },
  },
  render: (args) => <Switch {...args} />,
}

export const SizeMatrix: Story = {
  name: '尺寸對照表',
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
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>視覺狀態對照</H3>
        <Desc>disabled 用 opacity-disabled 保留顏色(Switch 特例,見下「Disabled 策略」)。readonly:standalone 視覺正常鎖互動;Field 內灰框 + 勾/叉 icon。</Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>State</Th><Th>Track</Th><Th>Thumb</Th><Th>Check icon</Th></tr></thead>
            <tbody>
              <tr><Td>OFF</Td><Td><TokenCell token="--border" display="bg-border(neutral-5)" /></Td><Td><span className="inline-flex items-center gap-1.5"><Swatch value="--border" size="sm" /><span className="font-mono">白色 + 2px border-border</span></span></Td><Td>—</Td></tr>
              <tr><Td>ON</Td><Td><TokenCell token="--primary" display="bg-primary" /></Td><Td><span className="inline-flex items-center gap-1.5"><Swatch value="--primary" size="sm" /><span className="font-mono">白色 + 2px primary border</span></span></Td><Td><TokenCell token="--primary" display="primary check" /></Td></tr>
              <tr><Td>Disabled OFF</Td><Td>opacity-disabled 套於整體</Td><Td>同 OFF(顏色保留)</Td><Td>—</Td></tr>
              <tr><Td>Disabled ON</Td><Td>opacity-disabled 套於整體</Td><Td>同 ON(顏色保留)</Td><Td>同 ON</Td></tr>
              <tr><Td>Readonly(standalone)</Td><Td>正常顏色</Td><Td>正常視覺</Td><Td>視 on/off</Td></tr>
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
        <Desc>Switch 的 on/off 視覺差異**最強載體是顏色**(track bg-primary vs bg-border)——thumb 位移與 check icon 只是弱輔助線索。若用灰階 swap(把 primary 換成 border),disabled 的 ON 和 OFF 只剩灰階低對比下的位置與小 icon 差異,難以一眼分辨當前狀態。必須保留顏色。</Desc>
        <p className="text-footnote text-fg-muted">對照 Checkbox / Slider 用灰階弱化(它們的形狀或位置本身就承載開 / 關狀態,不靠顏色),所以灰掉也看得出狀態;Switch 的主載體是顏色,只能降透明度保留顏色。</p>
      </div>
    </div>
  ),
}

export const LabelIntegration: Story = {
  name: '標籤 / 說明 整合',
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

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"無障礙設計摘要:\n\n  ARIA  :Switch 本體是一顆原生切換按鈕(role=\"switch\" + aria-checked),角色與狀態都由瀏覽器和 Radix 自動提供。可參考 [Radix 無障礙說明](https://www.radix-ui.com/primitives/docs/components/switch#accessibility)。\n\n  鍵盤操作  :\n\n- Tab — 把焦點移到開關上\n- Space / Enter — 切換開 / 關\n\n  焦點外觀  :開關本身就能被 Tab 聚焦(它是一顆按鈕);聚焦時會顯示一圈藍色 focus ring(由設計系統的 focus-visible 樣式提供,2px ring 用 --ring 色)。它是單一控件,沒有「焦點鎖定 / 還原」這種彈窗才有的行為。\n\n  驗證  :Storybook a11y 面板應為 0 critical violation;只用鍵盤即可完整操作(不需滑鼠)。文字對比 WCAG AA ≥ 4.5:1、UI 元素 ≥ 3:1。"}</p>
    </div>
  ),
}
