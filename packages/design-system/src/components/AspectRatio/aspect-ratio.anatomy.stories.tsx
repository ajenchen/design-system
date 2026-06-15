// @anatomy-rationale:
//   ColorMatrix N/A — AspectRatio 是 pure layout primitive,bg / radius 由
//     consumer 透過 className 決定,本身無色彩 token。
//   SizeMatrix N/A — 寬度由父層決定、高度由 ratio 算出;非離散 size tier。
//     5 個 DS 標準 ratio 由 StandardRatios 涵蓋。
//   StateBehavior N/A — 容器 primitive 無 hover / focus / active 狀態。
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { AspectRatio } from './aspect-ratio'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

/**
 * AspectRatio 設計規格——固定長寬比容器 primitive。
 *
 * 本元件極薄(Radix AspectRatio passthrough),無 variant / size / color token。
 * 結構僅:container 鎖 ratio + children 填滿。因此 anatomy 保留 Overview + Inspector
 * + 元件特有 StandardRatios(DS 慣用 5 ratio)+ Accessibility(2026-05-17 Dim 13)
 * ——無 ColorMatrix / SizeMatrix / StateBehavior,rationale 詳見
 * `aspect-ratio.spec.md`「為何無 ColorMatrix / SizeMatrix / StateBehavior」段。
 */

const meta: Meta = {
  title: 'Design System/Components/AspectRatio/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Overview ──────────────────────────────────────────────────────────────────

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>AspectRatio 是 container 型 primitive:外層(container)鎖定 `ratio` 數值,內層 children 填滿。典型 consumer 傳 img + `className="w-full h-full object-cover"` 讓圖填滿不變形。</Desc>
        <div className="flex gap-6 items-start">
          <div className="w-[320px]">
            <AspectRatio ratio={16 / 9} className="bg-muted rounded-md overflow-hidden ring-1 ring-dashed ring-border">
              <div className="w-full h-full flex items-center justify-center text-caption text-fg-muted">
                children(fills)
              </div>
            </AspectRatio>
            <div className="text-footnote text-fg-muted mt-1 font-mono">
              container: ratio={'{16/9}'}, width=100%, height=auto
            </div>
          </div>
          <div className="text-caption text-fg-muted max-w-[320px] leading-relaxed">
            <div className="mb-2"><span className="font-mono text-foreground">container</span> — 父層決定寬度(此處 320px),AspectRatio 依 ratio 自動算高(180px = 320 × 9/16)</div>
            <div><span className="font-mono text-foreground">children</span> — 放在內層容器(絕對定位 inset:0 的視覺盒)的正常流中,需自行加 w-full h-full(+ object-cover)才會填滿;通常是 img / video / illustration</div>
          </div>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td mono>ratio</Td><Td mono>number</Td><Td mono>1</Td><Td>寬 / 高比值(如 16/9 = 1.777)。DS 標準 ratio 見下方對照</Td></tr>
              <tr><Td mono>asChild</Td><Td mono>boolean</Td><Td mono>false</Td><Td>Radix Slot pattern——把 ratio 行為合併到 children 元素(不常用)</Td></tr>
              <tr><Td mono>className</Td><Td mono>string</Td><Td mono>—</Td><Td>套在內層容器(絕對定位的視覺可見層,放 bg-muted / rounded-lg / overflow-hidden)</Td></tr>
              <tr><Td mono>children</Td><Td mono>ReactNode</Td><Td mono>—</Td><Td>填滿容器的內容(通常是 img + object-cover)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ── Inspector ─────────────────────────────────────────────────────────────────

const RATIO_PRESETS = [
  { label: '16/9', value: 16 / 9 },
  { label: '4/3', value: 4 / 3 },
  { label: '1/1', value: 1 },
  { label: '3/4', value: 3 / 4 },
  { label: '21/9', value: 21 / 9 },
]

const InspectorDemo = () => {
  const [preset, setPreset] = React.useState('16/9')
  const current = RATIO_PRESETS.find(r => r.label === preset) ?? RATIO_PRESETS[0]
  return (
    <div>
      <div className="flex gap-2 mb-6">
        {RATIO_PRESETS.map(r => (
          <button
            key={r.label}
            type="button"
            onClick={() => setPreset(r.label)}
            className={`px-3 py-1.5 rounded-md text-caption font-mono border ${
              preset === r.label
                ? 'bg-foreground text-inverse-fg border-foreground'
                : 'bg-canvas text-foreground border-border hover:bg-neutral-hover'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-8 items-start">
        <div>
          <div className="text-footnote text-fg-muted mb-2 font-mono">即時預覽(容器 width=420px)</div>
          <div className="w-[420px]">
            <AspectRatio ratio={current.value} className="bg-muted rounded-md overflow-hidden">
              <img
                src={`https://picsum.photos/seed/inspector-${current.label}/800/600`}
                alt=""
                className="w-full h-full object-cover"
              />
            </AspectRatio>
            <div className="text-footnote text-fg-muted mt-2 font-mono">
              ratio={'{'}{current.label}{'}'} → width 420px, height {Math.round(420 / current.value)}px
            </div>
          </div>
        </div>

        <div className="border border-border rounded-lg p-4 flex flex-col gap-3 bg-muted">
          <div className="text-footnote text-fg-secondary font-bold">Inspect</div>
          <div className="flex flex-col gap-2 text-caption">
            <div><span className="text-fg-muted">ratio</span> <span className="font-mono ml-2">{current.label} ({current.value.toFixed(4)})</span></div>
            <div><span className="text-fg-muted">width</span> <span className="font-mono ml-2">100% (parent 控制)</span></div>
            <div><span className="text-fg-muted">height</span> <span className="font-mono ml-2">auto (padding-bottom 算出)</span></div>
            <div><span className="text-fg-muted">padding-bottom</span> <span className="font-mono ml-2">{(100 / current.value).toFixed(2)}%</span></div>
            <div><span className="text-fg-muted">bg</span> <span className="font-mono ml-2">bg-muted(consumer 套)</span></div>
            <div><span className="text-fg-muted">radius</span> <span className="font-mono ml-2">rounded-md(consumer 套)</span></div>
          </div>
          <div className="text-footnote text-fg-muted leading-relaxed mt-2">
            AspectRatio 本身無 token——bg / radius / overflow 全由 consumer 透過 className 決定。Radix 內部以 padding-bottom 技巧鎖比例(SSR-safe)。
          </div>
        </div>
      </div>
    </div>
  )
}

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => (
    <div>
      <H3>互動 ratio 切換</H3>
      <Desc>點選常用 ratio,觀察容器高度變化與 Inspect 面板的 padding-bottom 計算。AspectRatio 是純佈局容器,無 color / size token,只有 ratio 一個決定性 prop。</Desc>
      <InspectorDemo />
    </div>
  ),
}

// NOTE: 本元件無 ColorMatrix / SizeMatrix / StateBehavior——
// rationale 詳見 aspect-ratio.spec.md「為何無 ColorMatrix / SizeMatrix / StateBehavior」段。
// 僅保留 StandardRatios 作為元件特有的 DS ratio 視覺對照。

// ── 標準 ratio 對照 ──────────────────────────────────────────────────────────

const STD_RATIOS = [
  { label: '16/9', value: 16 / 9, use: '寬螢幕 hero / 影片 embed / feature 截圖', seed: 'std-16-9' },
  { label: '4/3', value: 4 / 3, use: '產品照 / screenshot / 老電視比例', seed: 'std-4-3' },
  { label: '1/1', value: 1, use: 'Avatar / 方圖貼文 / icon preview', seed: 'std-1-1' },
  { label: '3/4', value: 3 / 4, use: '直式 portrait / 手機截圖', seed: 'std-3-4' },
  { label: '21/9', value: 21 / 9, use: 'Ultra-wide hero / movie poster', seed: 'std-21-9' },
]

export const StandardRatios: Story = {
  name: '標準 比例 視覺對照',
  render: () => (
    <div>
      <H3>DS 標準 ratio</H3>
      <Desc>五個 DS 慣用 ratio 並列呈現(同一 consumer 容器寬度)。新需求優先選這五個,偏離 DS 標準需提出理由。</Desc>

      <div className="flex flex-col gap-6">
        {STD_RATIOS.map(r => (
          <div key={r.label} className="grid grid-cols-[140px_1fr_1fr] gap-4 items-center">
            <div>
              <div className="text-body font-mono font-bold">{r.label}</div>
              <div className="text-footnote text-fg-muted font-mono">{r.value.toFixed(4)}</div>
            </div>
            <div className="w-full max-w-[360px]">
              <AspectRatio ratio={r.value} className="bg-muted rounded-md overflow-hidden">
                <img
                  src={`https://picsum.photos/seed/${r.seed}/720/540`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </AspectRatio>
            </div>
            <div className="text-caption text-fg-muted leading-relaxed">{r.use}</div>
          </div>
        ))}
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
      <p className="whitespace-pre-line">{"本元件為純視覺呈現,無 keyboard / ARIA role / focus state 需求。Consumer 包 AspectRatio 進互動容器(Button / Card / Link)時 a11y 由容器決定。"}</p>
    </div>
  ),
}
