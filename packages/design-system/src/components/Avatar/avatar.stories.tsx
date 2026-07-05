import type { Meta } from '@storybook/react'
import { Building2 } from 'lucide-react'
import { Avatar } from './avatar'
import { MenuItem } from '@/design-system/components/Menu/menu-item'

const meta: Meta = {
  title: 'Design System/Components/Avatar/展示',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   1. 四模式
   ═══════════════════════════════════════════════════════════════════════════ */

export const Modes = {
  name: '四模式',
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-h6 font-semibold text-foreground">四種內容模式</h3>
        <p className="text-caption text-fg-muted max-w-[720px]">
          按優先順序：有 src 顯示圖片 → 有 icon 顯示 Icon → 有 alt 顯示首字。都沒有時預設顯示 User icon。
        </p>
      </div>
      <div className="flex items-center gap-6">
        {[
          { label: 'Image', el: <Avatar size={40} src="https://i.pravatar.cc/80?u=a" alt="Alice" /> },
          { label: 'Icon', el: <Avatar size={40} icon={Building2} color="blue" /> },
          { label: 'Text fallback', el: <Avatar size={40} alt="Bob" color="purple" /> },
          { label: '預設（無任何 prop）', el: <Avatar size={40} /> },
        ].map(({ label, el }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            {el}
            <span className="text-caption text-fg-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  ),
}

/* @story-trait-rationale: Shapes / Colors / AllSizes retired 2026-05-17 per audit Dim 24 —
 *   anatomy.stories.tsx SizeMatrix(含 circle/square shape axis)+ ColorMatrix(12 hue + neutral × subtle/solid)
 *   已 cover trait grids。展示層保留 typical real-product 情境(Modes / Fallback / Status / Count badge 等),
 *   避免跟 anatomy trait grid 重複。 */

/* ═══════════════════════════════════════════════════════════════════════════
   5. Fallback 行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const Fallback = {
  name: '備援顯示',
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-h6 font-semibold text-foreground">Fallback 行為</h3>
        <p className="text-caption text-fg-muted max-w-[720px]">
          圖片載入失敗時，自動降級：有 alt 顯示首字，無 alt 顯示預設 User icon。
        </p>
      </div>
      <div className="flex items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <Avatar size={40} src="https://i.pravatar.cc/80?u=ok" alt="Alice" />
          <span className="text-caption text-fg-muted">圖片正常載入</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Avatar size={40} src="https://broken-url.invalid/img.jpg" alt="Bob" color="green" />
          <span className="text-caption text-fg-muted">圖片失敗 + 有 alt → 首字</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Avatar size={40} src="https://broken-url.invalid/img.jpg" color="yellow" />
          <span className="text-caption text-fg-muted">圖片失敗 + 無 alt → User icon</span>
        </div>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. In Context — MenuItem
   ═══════════════════════════════════════════════════════════════════════════ */

export const InContext = {
  name: '情境用例',
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-h6 font-semibold text-foreground">In Context — MenuItem</h3>
        <p className="text-caption text-fg-muted max-w-[720px]">
          Avatar 作為 MenuItem 的 avatar slot，尺寸由 item-layout 系統決定。
        </p>
      </div>
      <div className="flex gap-8">
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-fg-secondary">無 description（inline）</span>
          <div className="w-[280px] border border-divider rounded-lg py-1 bg-surface">
            <MenuItem avatar={{ src: "https://i.pravatar.cc/48?u=a1", alt: "Alice" }}>
              Alice Chen
            </MenuItem>
            <MenuItem avatar={{ alt: "Bob", color: "blue" }}>
              Bob Wang
            </MenuItem>
            <MenuItem avatar={{ alt: "Carol", color: "purple" }}>
              Carol Lee
            </MenuItem>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-fg-secondary">有 description（block）</span>
          <div className="w-[320px] border border-divider rounded-lg py-1 bg-surface">
            <MenuItem
              avatar={{ src: "https://i.pravatar.cc/64?u=a2", alt: "Alice" }}
              description="前端工程師"
            >
              Alice Chen
            </MenuItem>
            <MenuItem
              avatar={{ alt: "Carol", color: "magenta" }}
              description="產品設計師"
            >
              Carol Lee
            </MenuItem>
            <MenuItem
              avatar={{ alt: "Dave", color: "turquoise" }}
              description="跨部門協作專案"
            >
              Dave Lin
            </MenuItem>
          </div>
        </div>
      </div>
    </div>
  ),
}
