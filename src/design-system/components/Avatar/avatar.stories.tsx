import type { Meta } from '@storybook/react'
import { User, Building2, Folder, Briefcase, Shield, Zap, Heart } from 'lucide-react'
import { Avatar } from './avatar'
import { SelectMenuItem } from '@/design-system/components/SelectMenu/select-menu-item'

const meta: Meta = {
  title: 'Design System/Components/Avatar/展示',
  parameters: { layout: 'padded' },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   1. 三種模式
   ═══════════════════════════════════════════════════════════════════════════ */

export const Modes = {
  name: '三種模式',
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-h6 font-semibold text-foreground">三種內容模式</h3>
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

/* ═══════════════════════════════════════════════════════════════════════════
   2. 形狀
   ═══════════════════════════════════════════════════════════════════════════ */

export const Shapes = {
  name: '形狀',
  render: () => {
    const sizes = [24, 32, 40]
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-h6 font-semibold text-foreground">形狀</h3>
          <p className="text-caption text-fg-muted max-w-[720px]">
            circle 用於人物，square 用於實體（專案、組織、App）。判斷標準：「代表一個人，還是一個東西？」
          </p>
        </div>
        <div className="flex gap-10">
          <div className="flex flex-col gap-3">
            <span className="text-caption font-medium text-fg-secondary">circle（預設）— 人物</span>
            <div className="flex items-end gap-4">
              {sizes.map((s) => (
                <div key={s} className="flex flex-col items-center gap-2">
                  <Avatar size={s} alt="Alice" color="blue" />
                  <span className="text-[10px] text-fg-muted font-mono">{s}px</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-caption font-medium text-fg-secondary">square — 實體</span>
            <div className="flex items-end gap-4">
              {sizes.map((s) => (
                <div key={s} className="flex flex-col items-center gap-2">
                  <Avatar size={s} icon={Building2} shape="square" color="purple" />
                  <span className="text-[10px] text-fg-muted font-mono">{s}px</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  },
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 色彩
   ═══════════════════════════════════════════════════════════════════════════ */

const ALL_COLORS = ['neutral', 'blue', 'red', 'green', 'yellow', 'purple', 'magenta', 'turquoise', 'indigo'] as const

export const Colors = {
  name: '色彩',
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-h6 font-semibold text-foreground">色彩</h3>
        <p className="text-caption text-fg-muted max-w-[720px]">
          兩種變體：subtle（淡底深字）和 solid（深底白字）。Image 模式不顯示背景色。
        </p>
      </div>
      {([false, true] as const).map((isSolid) => (
        <div key={String(isSolid)} className="flex flex-col gap-4">
          <span className="text-caption font-semibold text-fg-secondary">{isSolid ? 'solid' : 'subtle（預設）'}</span>
          <div className="flex flex-col gap-3">
            <div className="flex gap-4">
              {ALL_COLORS.map((c) => (
                <div key={c} className="flex flex-col items-center gap-2">
                  <Avatar size={32} icon={User} color={c} solid={isSolid} />
                  <span className="text-[10px] text-fg-muted font-mono">{c}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4">
              {ALL_COLORS.map((c, i) => (
                <div key={c} className="flex flex-col items-center gap-2">
                  <Avatar size={32} alt={String.fromCharCode(65 + i)} color={c} solid={isSolid} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. 尺寸
   ═══════════════════════════════════════════════════════════════════════════ */

const SIZES = [20, 24, 32, 40] as const

export const Sizes = {
  name: '尺寸',
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-h6 font-semibold text-foreground">尺寸</h3>
        <p className="text-caption text-fg-muted max-w-[720px]">
          size 接受任意 px 值。Icon 自動 = round_even(size × 0.6)，Text 字體 = round(size × 0.5)。
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 border-b border-divider text-fg-muted font-medium text-caption">Size</th>
              {SIZES.map((s) => (
                <th key={s} className="text-center p-2 border-b border-divider text-fg-muted font-medium text-caption">{s}px</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border-b border-divider text-caption">Image</td>
              {SIZES.map((s) => (
                <td key={s} className="p-2 border-b border-divider text-center">
                  <div className="inline-block"><Avatar size={s} src={`https://i.pravatar.cc/${s * 2}?u=img`} alt="User" /></div>
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-2 border-b border-divider text-caption">Icon</td>
              {SIZES.map((s) => (
                <td key={s} className="p-2 border-b border-divider text-center">
                  <div className="inline-block"><Avatar size={s} icon={Folder} color="blue" /></div>
                </td>
              ))}
            </tr>
            <tr>
              <td className="p-2 border-b border-divider text-caption">Text</td>
              {SIZES.map((s) => (
                <td key={s} className="p-2 border-b border-divider text-center">
                  <div className="inline-block"><Avatar size={s} alt="Alice" color="purple" /></div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. Fallback 行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const Fallback = {
  name: 'Fallback',
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
   6. In Context — SelectMenuItem
   ═══════════════════════════════════════════════════════════════════════════ */

export const InContext = {
  name: 'In Context',
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-h6 font-semibold text-foreground">In Context — SelectMenuItem</h3>
        <p className="text-caption text-fg-muted max-w-[720px]">
          Avatar 作為 SelectMenuItem 的 avatar slot，尺寸由 item-layout 系統決定。
        </p>
      </div>
      <div className="flex gap-8">
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-fg-secondary">無 description（inline）</span>
          <div className="w-[280px] border border-divider rounded-lg py-1 bg-surface">
            <SelectMenuItem avatar={{ src: "https://i.pravatar.cc/48?u=a1", alt: "Alice" }}>
              Alice Chen
            </SelectMenuItem>
            <SelectMenuItem avatar={{ alt: "Bob", color: "blue" }}>
              Bob Wang
            </SelectMenuItem>
            <SelectMenuItem avatar={{ alt: "Carol", color: "purple" }}>
              Carol Lee
            </SelectMenuItem>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-fg-secondary">有 description（block）</span>
          <div className="w-[320px] border border-divider rounded-lg py-1 bg-surface">
            <SelectMenuItem
              avatar={{ src: "https://i.pravatar.cc/64?u=a2", alt: "Alice" }}
              description="前端工程師"
            >
              Alice Chen
            </SelectMenuItem>
            <SelectMenuItem
              avatar={{ alt: "Carol", color: "magenta" }}
              description="產品設計師"
            >
              Carol Lee
            </SelectMenuItem>
            <SelectMenuItem
              avatar={{ alt: "Dave", color: "turquoise" }}
              description="跨部門協作專案"
            >
              Dave Lin
            </SelectMenuItem>
          </div>
        </div>
      </div>
    </div>
  ),
}
