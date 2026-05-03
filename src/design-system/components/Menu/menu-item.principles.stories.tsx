// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'

const meta: Meta = {
  title: 'Design System/Internal/MenuItem/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── WhenToUse — 何時使用 Menu ──────────────────────


// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsItemAnatomyRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Menu 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Internal/Menu/展示" name="Start Icon"><span className="text-primary hover:underline font-medium cursor-pointer">Start Icon</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Menu/展示" name="Start Icon + Description"><span className="text-primary hover:underline font-medium cursor-pointer">Start Icon + Description</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Menu/展示" name="Avatar"><span className="text-primary hover:underline font-medium cursor-pointer">Avatar</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Menu/展示" name="Avatar + description"><span className="text-primary hover:underline font-medium cursor-pointer">Avatar + description</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Menu/展示" name="多選"><span className="text-primary hover:underline font-medium cursor-pointer">多選</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs 近親 — VsItemAnatomyRule — 原 VsItemAnatomyRule */}
      <div className="prose prose-sm max-w-prose">
      <p>MenuItem 是 Family 1(menu)的具體實作;item-anatomy 是 Family 1+2 的 cross-element SSOT。</p>
      <ul>
        <li><strong>MenuItem(本元件)</strong>—runtime 元件,實裝 Family 1 row</li>
        <li><strong>item-anatomy.spec.md</strong>—canonical doc,跨 MenuItem / Row / FileItem 共通的 anatomy 規則</li>
      </ul>
      <p className="text-fg-muted">judgment 改:動 item-anatomy.spec(SSOT);實作改:動 menu-item.tsx。</p>
    </div>
    </div>
  ),
}

// ── CompositionRules — MenuItem 三個 consumer pattern(對齊 Polaris「Related」+ Radix「Use within」)──────

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    <div className="flex flex-col gap-12">
      <div className="prose prose-sm max-w-prose">
        <p>MenuItem 是 Family 1 layout primitive,由三類 consumer 包覆使用,**不直接放在 app code**:</p>

        <h4>Pattern 1 — DropdownMenu + MenuItem(action menu)</h4>
        <p>使用者點擊觸發某個 action(複製 / 刪除 / 重新命名)→ <LinkTo kind="Design System/Components/DropdownMenu/展示" name="預設"><span className="text-primary hover:underline font-medium cursor-pointer">DropdownMenu</span></LinkTo>(Radix 控制 open / close + keyboard nav,MenuItem 提供 row layout)。</p>

        <h4>Pattern 2 — SelectMenu(Popover + Command + MenuItem)— form value 選擇</h4>
        <p>使用者選一個 / 多個值寫回 form → <LinkTo kind="Design System/Components/Select/展示" name="預設"><span className="text-primary hover:underline font-medium cursor-pointer">Select</span></LinkTo> / <LinkTo kind="Design System/Components/Combobox/展示" name="預設"><span className="text-primary hover:underline font-medium cursor-pointer">Combobox</span></LinkTo>(內部已組合 SelectMenu + cmdk + MenuItem)。</p>

        <h4>Pattern 3 — ContextMenu + MenuItem(右鍵選單,未來)</h4>
        <p>右鍵觸發 contextual action → 預留消費者(Radix ContextMenu + MenuItem 同 layout primitive)。</p>

        <p className="text-fg-muted">禁止:在 app code 自刻 menu row(<code>&lt;div className="flex px-2 py-1.5"&gt;</code>)— 必消費 MenuItem(對齊 SSOT 消費 canonical M1 + item-anatomy Family 1 SSOT)。Slot 對齊規則:prefix 24px / content reading-mode 垂直堆疊 / suffix optional — 詳 <code>item-anatomy.spec.md</code>。</p>
      </div>
    </div>
  ),
}
