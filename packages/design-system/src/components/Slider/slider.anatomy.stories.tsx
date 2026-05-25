// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { Slider } from './slider'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Slider/設計規格',
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
        <Desc>Slider = Track(軌道)+ Range(填滿段)+ Thumb(白色圓 + 2px border)。基於 Radix Slider primitive,橋接 DS token。</Desc>
        <div className="max-w-md border border-border rounded-lg p-6">
          <Slider defaultValue={[60]} aria-label="Volume" />
        </div>
      </div>

      <div>
        <H3>Range mode(雙 thumb)</H3>
        <Desc>Radix Slider 原生支援多 thumb——只要 `value` / `defaultValue` 傳 array 長度 &gt; 1,自動渲染對應 thumb,range 落在最小和最大 thumb 之間。</Desc>
        <div className="max-w-md border border-border rounded-lg p-6">
          <Slider defaultValue={[20, 80]} aria-label="Price range" />
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['value / defaultValue', 'number[]', '—', '[single] 或 [min, max] range mode'],
                ['onValueChange', '(value: number[]) => void', '—', '拖曳中每次值變動'],
                ['onValueCommit', '(value: number[]) => void', '—', '放開滑鼠才觸發(防抖用)'],
                ['min / max', 'number', '0 / 100', '值範圍'],
                ['step', 'number', '1', '步進'],
                ['size', "'sm' | 'md' | 'lg'", "'md'", '**只影響容器外高**,不影響 track/thumb 尺寸'],
                ['disabled', 'boolean', 'false', '灰階降級(range/thumb border→border,thumb bg 保留白)'],
                ['minStepsBetweenThumbs', 'number', '—', 'range mode 兩 thumb 最小距離'],
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
    docs: { description: { story: '右側 Controls 切 props 即時 render,取代 Figma inspect。調整 `min` / `max` / `step` / `defaultValue` 看值域行為,切 `size` 看容器高度 tier(track / thumb 視覺固定)。' } },
  },
  args: {
    defaultValue: [60],
    min: 0,
    max: 100,
    step: 1,
    size: 'md',
    disabled: false,
  },
  argTypes: {
    defaultValue: {
      control: 'object',
      description: '[single] 或 [min, max] range mode(例:[20, 80])',
    },
    min: { control: { type: 'number' } },
    max: { control: { type: 'number' } },
    step: { control: { type: 'number', min: 1 } },
    size: { control: 'radio', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
  },
  render: (args) => (
    <div className="max-w-md border border-border rounded-lg p-6">
      <Slider {...args} />
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>一種視覺,多種容器尺寸</H3>
        <Desc>Slider 的視覺(track 厚度、thumb 直徑、focus ring)是**固定單一值**——不隨 `size` 變動。業界(Material / Ant / Radix Themes / shadcn)共識:thumb 必須足夠大以便手指/鼠標捕捉,track 太細會看不清 range。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>元素</Th><Th>值</Th><Th>Token</Th></tr></thead>
            <tbody>
              <tr><Td>Track 厚度</Td><Td mono>4px(h-1)</Td><Td>—</Td></tr>
              <tr><Td>Track 底色 default</Td><Td><TokenCell token="--secondary" display="bg-secondary" /></Td><Td><TokenCell token="--secondary" display="--secondary(neutral-3)" /></Td></tr>
              <tr><Td>Track 底色 disabled</Td><Td><TokenCell token="--muted" display="bg-muted" /></Td><Td><TokenCell token="--muted" display="--muted(neutral-2)" /></Td></tr>
              <tr><Td>Range 填滿色 default</Td><Td><TokenCell token="--primary" display="bg-primary" /></Td><Td><TokenCell token="--primary" /></Td></tr>
              <tr><Td>Range 填滿色 disabled</Td><Td><TokenCell token="--border" display="bg-border" /></Td><Td><TokenCell token="--border" display="--border(neutral-5)" /></Td></tr>
              <tr><Td>Thumb 直徑</Td><Td mono>16px(h-4 w-4)</Td><Td>—</Td></tr>
              <tr><Td>Thumb 底色</Td><Td><TokenCell token="--surface" display="bg-surface(白,default+disabled 不變)" /></Td><Td><TokenCell token="--surface" /></Td></tr>
              <tr><Td>Thumb 邊框 default</Td><Td><TokenCell token="--primary" display="border-2 border-primary" /></Td><Td><TokenCell token="--primary" display="--primary(與 Range default 同色)" /></Td></tr>
              <tr><Td>Thumb 邊框 disabled</Td><Td><TokenCell token="--border" display="border-border" /></Td><Td><TokenCell token="--border" display="--border(與 Range disabled 同色)" /></Td></tr>
              <tr><Td>Thumb hover</Td><Td mono>border primary-hover + --elevation-100</Td><Td>—</Td></tr>
              <tr><Td>Thumb active</Td><Td mono>--elevation-200</Td><Td>—</Td></tr>
              <tr><Td>Focus ring</Td><Td mono>ring-2 ring-ring ring-offset-2</Td><Td><TokenCell token="--ring" /></Td></tr>
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
    <div className="flex flex-col gap-6">
      <div>
        <H3>Size 只決定 root 容器的 `h-field-*` class</H3>
        <Desc>Track / thumb / ring 尺寸不變——內部元素用 flex `items-center` 在容器垂直置中。這樣同一組 Field 並排(Input + Slider + NumberInput)高度完美對齊,但 Slider 本身視覺體驗一致。</Desc>
        <div className="flex flex-col gap-3 max-w-md">
          {(['sm', 'md', 'lg'] as const).map(size => (
            <div key={size} className="flex items-center gap-3 border border-dashed border-divider rounded-md p-3">
              <span className="text-caption text-fg-muted font-mono w-8">{size}</span>
              <Slider size={size} defaultValue={[50]} className="flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-6 max-w-md">
      <div>
        <H3>互動狀態</H3>
        <Desc>Hover 和 Active 用**陰影**(elevation)不用色變——Slider 是「當前位置指示器」,底色不該動(動了會暗示是另一個狀態)。對齊 Material 3 / iOS / Linear 共識。</Desc>
        <div className="flex flex-col gap-3">
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Default</div>
            <Slider defaultValue={[50]} />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Disabled</div>
            <Slider defaultValue={[50]} disabled />
          </div>
          <div className="border border-dashed border-divider rounded-md p-3">
            <div className="text-caption text-fg-muted mb-2">Range + Disabled</div>
            <Slider defaultValue={[20, 80]} disabled />
          </div>
        </div>
      </div>

      <div>
        <H3>Disabled 策略:灰階 swap(對照 Switch)</H3>
        <Desc>Slider 用灰階 swap(range/thumb border: primary→border),不用 opacity。因為 Slider 的 state 載體是**位置/長度**(thumb 在哪 / range 多長),不是顏色——灰色 thumb 在灰色 track 上,位置資訊跟 primary 版本完全一樣。對照 Switch 的唯一載體是顏色,必須 opacity 保留顏色。</Desc>
      </div>
    </div>
  ),
}

export const ColorBindingRule: Story = {
  name: '範圍 ↔ Thumb 邊框 綁定規則',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Range 色和 Thumb border 色永遠同 token</H3>
        <Desc>Thumb 坐落在 range 的端點上,border 是 range 的視覺延續。兩者同色時看起來像「range 包住 thumb」——thumb 白底是「被 range 圍住的空心洞」,而不是「thumb 浮在 range 上面的異物」。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>State</Th><Th>Range bg</Th><Th>Thumb border</Th><Th>共享 token</Th></tr></thead>
            <tbody>
              <tr><Td>Default</Td><Td><TokenCell token="--primary" display="bg-primary" /></Td><Td><TokenCell token="--primary" display="border-primary" /></Td><Td><TokenCell token="--primary" /></Td></tr>
              <tr><Td>Disabled</Td><Td><TokenCell token="--border" display="bg-border" /></Td><Td><TokenCell token="--border" display="border-border" /></Td><Td><TokenCell token="--border" /></Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          **強制規則**:未來若要改 Range 的 disabled 色(例如加新 variant),必須同步改 Thumb border——不讓兩者漂移。
        </p>
      </div>

      <div>
        <H3>為什麼 thumb 是白底 + 邊框,不是實心 primary</H3>
        <Desc>實心 primary thumb 在 range mode(兩個 thumb)+ primary range 一起時,會跟 range 融為一體,看不出 thumb 邊界。白底 + 邊框讓 thumb 的位置清楚浮出——Material 3 / iOS / Linear 的共同解法。</Desc>
      </div>
    </div>
  ),
}

export const KeyboardMatrix: Story = {
  name: '鍵盤操作（Radix 原生）',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>鍵盤對照</H3>
        <Desc>全部由 Radix Slider primitive 原生處理,無需自行實作。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>按鍵</Th><Th>行為</Th></tr></thead>
            <tbody>
              <tr><Td mono>← / →</Td><Td>- / + step</Td></tr>
              <tr><Td mono>↓ / ↑</Td><Td>+ / - step(vertical-inverted 時相反)</Td></tr>
              <tr><Td mono>PageDown / PageUp</Td><Td>± step × 10</Td></tr>
              <tr><Td mono>Home / End</Td><Td>跳到 min / max</Td></tr>
              <tr><Td mono>Tab</Td><Td>range mode 在多 thumb 間切換焦點</Td></tr>
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
      <p className="whitespace-pre-line">{"詳 `slider.spec.md` 「A11y 預設」段。摘要:\n\n  ARIA / Pattern  :繼承 Radix  slider  primitive a11y 預設(role / aria-  / 鍵盤導覽)。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/slider#accessibility)。\n\n  Keyboard 行為  :\n\n- Tab — focus thumb\n- ←/→ — 微調\n- Home/End — min/max\n- PageUp/Down — 大步階\n\n  Focus  :Radix primitive 自管 focus trap / restoration / visible ring( outline: 2px solid var(--ring)  per design-system focus-visible 設計準則)。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA c"}</p>
    </div>
  ),
}
