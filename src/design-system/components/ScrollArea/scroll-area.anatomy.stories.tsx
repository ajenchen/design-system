// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-rationale:
//   StateBehavior represented as OrientationBehavior — ScrollArea 是 OS chrome
//     類功能性 primitive,thumb 唯一狀態(default / hover)已於 ColorMatrix 展示。
//     真正的行為差異是 orientation(vertical / horizontal / both)與 type(hover /
//     scroll / always / auto)顯示時機,由 OrientationBehavior(5.)涵蓋。
import type { Meta, StoryObj } from '@storybook/react'
import { ScrollArea, ScrollBar } from './scroll-area'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/ScrollArea/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// Sample filler content for previews
const FillerList = ({ count = 20 }: { count?: number }) => (
  <div className="p-2">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="px-3 py-2 text-caption border-b border-divider last:border-b-0">
        Row {i + 1} — Linear issue / Notion page / Stripe product record
      </div>
    ))}
  </div>
)

const WideTable = () => (
  <table className="text-caption">
    <thead>
      <tr className="bg-muted">
        {['SKU', 'Product', 'Category', 'Stock', 'Price', 'Margin', 'Channel', 'Status'].map((h) => (
          <th key={h} className="px-4 py-2 text-left font-medium text-fg-secondary whitespace-nowrap border-b border-border">{h}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i}>
          <td className="px-4 py-2 font-mono text-fg-muted whitespace-nowrap border-b border-divider">PRO-{String(i + 1).padStart(3, '0')}</td>
          <td className="px-4 py-2 whitespace-nowrap border-b border-divider">Stripe Atlas 新創設立方案</td>
          <td className="px-4 py-2 whitespace-nowrap border-b border-divider">Incorporation</td>
          <td className="px-4 py-2 text-right font-mono whitespace-nowrap border-b border-divider">128</td>
          <td className="px-4 py-2 text-right font-mono whitespace-nowrap border-b border-divider">$500.00</td>
          <td className="px-4 py-2 text-right font-mono whitespace-nowrap border-b border-divider">42%</td>
          <td className="px-4 py-2 whitespace-nowrap border-b border-divider">Direct</td>
          <td className="px-4 py-2 whitespace-nowrap border-b border-divider">Active</td>
        </tr>
      ))}
    </tbody>
  </table>
)

/* ═══════════════════════════════════════════════════════════════════════════
   1. 元件總覽
   ═══════════════════════════════════════════════════════════════════════════ */

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>結構(Anatomy)</H3>
        <Desc>
          ScrollArea 包 Radix 四層 primitive:Root(relative 容器)→ Viewport(實際可捲動區,內含 children)
          → Scrollbar(overlay 捲軸,10px 固定寬)→ Thumb(可抓握的圓角把手)。Root 額外包 Corner 處理雙向 scrollbar 交會。
        </Desc>
        <div className="border-2 border-dashed border-primary/30 rounded-lg p-4 max-w-xl">
          <div className="text-[11px] font-mono text-fg-muted mb-2">Root (relative + overflow-hidden)</div>
          <div className="border border-dashed border-info/50 rounded-md p-3 bg-info/5">
            <div className="text-[11px] font-mono text-info mb-2">Viewport (h-full w-full · rounded-[inherit])</div>
            <div className="border border-dashed border-success/50 rounded-md p-2 bg-success/5 text-[11px] font-mono text-success-hover">
              children (consumer 內容)
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 rounded-full bg-border" />
            <span className="text-[10px] font-mono text-fg-muted">Scrollbar + Thumb(overlay,不佔寬)</span>
          </div>
        </div>
      </div>

      <div>
        <H3>預覽 — 三種 orientation</H3>
        <div className="grid grid-cols-3 gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">vertical(預設)</span>
            <ScrollArea className="h-[180px] border border-border rounded-md">
              <FillerList count={12} />
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">horizontal</span>
            <ScrollArea className="border border-border rounded-md">
              <WideTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">vertical + horizontal</span>
            <ScrollArea className="h-[180px] border border-border rounded-md">
              <WideTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      </div>

      <div>
        <H3>Props 速查 — ScrollArea (Radix Root)</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['className',  'string',                            '—',       '傳入容器 className(常見:設定 height / border / rounded)'],
                ['children',   'ReactNode',                         '—',       '要被捲動的內容'],
                ['type',       "'auto'|'always'|'scroll'|'hover'",  "'hover'", 'Radix:scrollbar 顯示時機(hover = 游標進入才顯示)'],
                ['dir',        "'ltr'|'rtl'",                       "'ltr'",   '文字方向(影響 horizontal scrollbar 起點)'],
                ['scrollHideDelay', 'number',                       '600',     'type=scroll / hover 時 scrollbar 隱藏前的延遲(ms)'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Props 速查 — ScrollBar</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['orientation', "'vertical' | 'horizontal'", "'vertical'", '捲軸方向'],
                ['className',   'string',                    '—',          '覆寫樣式(通常不需)'],
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

/* ═══════════════════════════════════════════════════════════════════════════
   2. 元件檢閱器 — Preview + Blueprint + Token Panel
   ═══════════════════════════════════════════════════════════════════════════ */

export const Inspector: Story = {
  name: '元件檢閱器',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>元件檢閱器</H3>
        <Desc>即時預覽 ScrollArea 的 scrollbar 寬度、thumb token、hover 反饋。開發只需確認 token,theme / density 切換由系統處理。</Desc>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left: preview */}
        <div className="flex flex-col gap-5 min-w-[340px]">
          <div className="px-6 py-6 rounded-lg bg-canvas border border-divider">
            <ScrollArea className="h-[200px] border border-border rounded-md bg-surface">
              <FillerList count={16} />
            </ScrollArea>
          </div>

          {/* Blueprint */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4 text-[10px]">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-md" style={{ background: 'rgba(166,208,245,0.6)', border: '1px dashed rgba(80,145,210,0.9)' }} />
                <span className="font-medium" style={{ color: '#2d6a9f' }}>Scrollbar(10px 固定)</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-md" style={{ background: 'rgba(194,225,154,0.6)', border: '1px dashed rgba(139,179,91,0.9)' }} />
                <span className="font-medium" style={{ color: '#5a7a2e' }}>Thumb inset(p-[1px])</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-md shrink-0"
                style={{
                  width: 52, height: 52,
                  background: 'rgba(166,208,245,0.6)',
                  border: '1.5px dashed rgba(80,145,210,0.9)',
                }}
              >
                <span className="text-[11px] font-mono font-bold" style={{ color: '#2d6a9f' }}>10px</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[12px] text-fg-secondary">w-2.5 / h-2.5</span>
                <span className="font-mono text-[10px] text-fg-muted">固定 10px,跨 size 不變</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: inspect panel */}
        <div className="w-[320px] shrink-0 border border-divider rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-divider bg-neutral-hover">
            <span className="text-[12px] font-semibold text-foreground">Inspect</span>
          </div>

          {/* LAYOUT */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Layout</span></div>
            <InspectRow label="Scrollbar 寬"><span className="font-mono">w-2.5 / h-2.5 (10px)</span></InspectRow>
            <InspectRow label="Track inset"><span className="font-mono">p-[1px]</span></InspectRow>
            <InspectRow label="邊界"><span className="font-mono">border-l / border-t transparent</span></InspectRow>
            <InspectRow label="Viewport"><span className="font-mono">h-full w-full rounded-[inherit]</span></InspectRow>
          </div>

          {/* COLOR */}
          <div className="px-4 py-1">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Color</span></div>
            <InspectRow label="Track"><TokenCell token="transparent" display="transparent" /></InspectRow>
            <InspectRow label="Thumb"><TokenCell token="--border" /></InspectRow>
            <InspectRow label="Thumb hover"><TokenCell token="--border-hover" /></InspectRow>
          </div>

          {/* STYLE */}
          <div className="px-4 py-1 pb-3">
            <div className="py-2 border-b border-divider"><span className="text-[10px] font-semibold text-fg-muted uppercase tracking-wider">Style</span></div>
            <InspectRow label="Thumb radius"><span className="font-mono">rounded-full</span></InspectRow>
            <InspectRow label="過渡"><span className="font-mono">transition-colors</span></InspectRow>
            <InspectRow label="顯示時機"><span className="font-mono">type=&quot;hover&quot; (default)</span></InspectRow>
          </div>
        </div>
      </div>
    </div>
  ),
}

const InspectRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2 border-b border-divider last:border-b-0">
    <span className="text-[11px] text-fg-muted font-medium w-[88px] shrink-0 pt-0.5">{label}</span>
    <div className="flex-1 text-[12px] font-mono text-fg-secondary">{children}</div>
  </div>
)

/* ═══════════════════════════════════════════════════════════════════════════
   3. 色彩對照表
   ═══════════════════════════════════════════════════════════════════════════ */

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>Thumb × 狀態</H3>
        <Desc>Track 固定透明(overlay 不搶視覺);Thumb 靜態低存在感,hover 加深反饋可抓握。Dark mode 由 semantic token 自動切換。</Desc>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead><tr><Th>元素</Th><Th>Default</Th><Th>Hover</Th></tr></thead>
          <tbody>
            <tr>
              <Td mono>Track</Td>
              <Td><TokenCell token="transparent" display="transparent" /></Td>
              <Td><TokenCell token="transparent" display="transparent" /></Td>
            </tr>
            <tr>
              <Td mono>Thumb</Td>
              <Td><TokenCell token="--border" /></Td>
              <Td><TokenCell token="--border-hover" /></Td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <H3>實際渲染 — hover 感受差異</H3>
        <Desc>將游標移入下方容器,scrollbar 會淡入(type=&quot;hover&quot;);hover 到 thumb 上,色彩由 --border(neutral-5)加深至 --border-hover(neutral-6)。世界級 SaaS 的 scrollbar thumb 都是這種 subtle 視覺,不搶主視覺。</Desc>
        <ScrollArea className="h-[200px] w-[320px] border border-border rounded-md bg-surface">
          <FillerList count={18} />
        </ScrollArea>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. 尺寸對照表(Scrollbar 寬度跨 size 不變)
   ═══════════════════════════════════════════════════════════════════════════ */

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>Scrollbar 寬度 — 跨 size / density / content 固定 10px</H3>
        <Desc>
          ScrollArea 的 scrollbar 是「功能性 primitive」,不是「內容呈現」,因此寬度不隨 content size(sm/md/lg)、不隨 density(md/lg)變化。
          Polaris / Material / Radix / shadcn 同樣做法:scrollbar 是 OS chrome 類別,與內容字級脫鉤。
        </Desc>
      </div>

      <div className="overflow-x-auto">
        <table className="text-caption border-collapse">
          <thead><tr><Th>屬性</Th><Th>值</Th><Th>備註</Th></tr></thead>
          <tbody>
            <tr><Td>Vertical scrollbar 寬</Td><Td mono>w-2.5 (10px)</Td><Td>Radix 內部套 h-full</Td></tr>
            <tr><Td>Horizontal scrollbar 高</Td><Td mono>h-2.5 (10px)</Td><Td>Radix 內部套 w-full</Td></tr>
            <tr><Td>Thumb inset</Td><Td mono>p-[1px]</Td><Td>thumb 與 track 邊緣保持 1px 透氣</Td></tr>
            <tr><Td>Thumb radius</Td><Td mono>rounded-full</Td><Td>對齊 macOS / modern DS 慣例</Td></tr>
            <tr><Td>Density 反應</Td><Td mono>無</Td><Td>不隨 --field-height-* / --layout-space-* 放大</Td></tr>
          </tbody>
        </table>
      </div>

      <div>
        <H3>三種 orientation 渲染對照</H3>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">vertical — 10px wide</span>
            <ScrollArea className="h-[160px] border border-border rounded-md bg-surface">
              <FillerList count={12} />
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">horizontal — 10px high</span>
            <ScrollArea className="border border-border rounded-md bg-surface">
              <WideTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-footnote text-fg-muted">both — corner 交會</span>
            <ScrollArea className="h-[160px] border border-border rounded-md bg-surface">
              <WideTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. Orientation 行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const OrientationBehavior: Story = {
  name: 'Orientation 行為',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>三種模式 — 何時用哪個</H3>
        <Desc>垂直用於清單 / body 捲動;水平用於寬表格 / 溢出 pill 列;雙向用於大型資料網格。</Desc>
      </div>

      <div className="overflow-x-auto">
        <table className="text-caption border-collapse">
          <thead><tr><Th>Orientation</Th><Th>場景</Th><Th>使用範例</Th></tr></thead>
          <tbody>
            <tr>
              <Td mono>vertical(預設)</Td>
              <Td>長清單、Sheet / Dialog body、Sidebar nav</Td>
              <Td mono>&lt;ScrollArea className=&quot;h-[320px]&quot;&gt;...&lt;/ScrollArea&gt;</Td>
            </tr>
            <tr>
              <Td mono>horizontal</Td>
              <Td>寬 DataTable、Tag 溢出列、水平時間軸</Td>
              <Td mono>
                &lt;ScrollArea&gt;...&lt;ScrollBar orientation=&quot;horizontal&quot;/&gt;&lt;/ScrollArea&gt;
              </Td>
            </tr>
            <tr>
              <Td mono>vertical + horizontal</Td>
              <Td>大型 DataTable(雙向都溢出)</Td>
              <Td mono>
                同時渲染 vertical(自動)+ horizontal ScrollBar
              </Td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <H3>雙向 — 實際渲染</H3>
        <ScrollArea className="h-[220px] w-[460px] border border-border rounded-md bg-surface">
          <WideTable />
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      <div>
        <H3>Scrollbar 顯示時機(Radix <code className="font-mono text-footnote bg-muted px-1 rounded">type</code> prop)</H3>
        <Desc>預設 type=&quot;hover&quot;——游標進入容器時 scrollbar 淡入;離開後延遲隱藏(scrollHideDelay=600ms)。其他選項 always / scroll / auto 依場景調整。</Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>type</Th><Th>行為</Th><Th>何時用</Th></tr></thead>
            <tbody>
              <tr><Td mono>hover(預設)</Td><Td>游標進入容器才顯示</Td><Td>一般內容區,低視覺干擾</Td></tr>
              <tr><Td mono>scroll</Td><Td>捲動時才顯示</Td><Td>macOS 原生風格</Td></tr>
              <tr><Td mono>always</Td><Td>永遠顯示</Td><Td>明確要提示使用者可以捲動(如短內容但仍有少量 overflow)</Td></tr>
              <tr><Td mono>auto</Td><Td>overflow 時顯示,非 overflow 時隱藏</Td><Td>對齊 native scrollbar 習慣</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}
