// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// v3 canonical(2026-05-01):≥ 2 stories(UsageGuidance + CompositionRules)取代原
// escape rationale,對齊 Polaris/Material/Ant 共識 internal primitive 仍應教 consumer pattern。
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'

const meta: Meta = {
  title: 'Design System/Internal/SelectMenu/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-heading-3 font-bold text-foreground mb-4 pb-2 border-b border-border">{title}</h2>
    {children}
  </section>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose mb-8">
          <p>適合 SelectMenu 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li><LinkTo kind="Design System/Internal/SelectMenu/展示" name="單選"><span className="text-primary hover:underline font-medium cursor-pointer">單選</span></LinkTo></li>
            <li><LinkTo kind="Design System/Internal/SelectMenu/展示" name="搜尋"><span className="text-primary hover:underline font-medium cursor-pointer">搜尋</span></LinkTo></li>
            <li><LinkTo kind="Design System/Internal/SelectMenu/展示" name="多選"><span className="text-primary hover:underline font-medium cursor-pointer">多選</span></LinkTo></li>
            <li><LinkTo kind="Design System/Internal/SelectMenu/展示" name="多選 + 搜尋"><span className="text-primary hover:underline font-medium cursor-pointer">多選 + 搜尋</span></LinkTo></li>
            <li><LinkTo kind="Design System/Internal/SelectMenu/展示" name="可清除"><span className="text-primary hover:underline font-medium cursor-pointer">可清除</span></LinkTo></li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親 段)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代方案">
        <div className="prose prose-sm max-w-prose">
          <p>SelectMenu 是 Internal primitive,被 Select / Combobox / PeoplePicker 消費。直接使用前先確認:</p>
          <ul>
            <li>結果寫回 form value(讀取已選)→ 透過 Select / Combobox 等 user-facing 元件消費,不直接用 SelectMenu</li>
            <li>結果觸發某個 action(non-form)→ 用 Command 而不是 SelectMenu</li>
          </ul>
        </div>
      </Section>

      <Section title="vs 近親元件">
        <div className="prose prose-sm max-w-prose">
          <p>SelectMenu vs Command — 兩者都 keyboard-navigable + 搜尋,但 mental model 不同:</p>
          <ul>
            <li><strong>SelectMenu(本元件)</strong>—form-input dropdown;結果寫回 form value(read selected)</li>
            <li><strong>Command</strong>—命令面板;結果是執行某 action(non-form)</li>
          </ul>
          <p className="text-fg-muted">判斷:結果回 form value → SelectMenu;結果觸發 action → Command。</p>
        </div>
      </Section>
    </div>
  ),
}

// ── CompositionRules — SelectMenu 三個 consumer pattern(對齊 Material Select / Polaris Combobox idiom)──────

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    <div>
      <Section title="Pattern 1 — Select(static 單選 dropdown)">
        <div className="prose prose-sm max-w-prose">
          <p>已知選項清單 + 單選回 form → <LinkTo kind="Design System/Components/Select/展示" name="預設"><span className="text-primary hover:underline font-medium cursor-pointer">Select</span></LinkTo>(內部 SelectMenu + cmdk + MenuItem)。對齊 Material <code>Select</code> / Ant <code>Select</code> idiom。</p>
          <ul>
            <li>典型場景:Country picker / Status selector / Priority dropdown</li>
            <li>判斷:選項 ≤ 20 + 不需搜尋 → Select(可選 searchable mode 啟用搜尋)</li>
          </ul>
        </div>
      </Section>

      <Section title="Pattern 2 — Combobox(多選 + 搜尋 + 可建立新值)">
        <div className="prose prose-sm max-w-prose">
          <p>多選 + 大量選項需搜尋 + 可創新 tag → <LinkTo kind="Design System/Components/Combobox/展示" name="預設"><span className="text-primary hover:underline font-medium cursor-pointer">Combobox</span></LinkTo>。對齊 GitHub Label picker / Linear Multi-assignee / Notion Multi-select idiom。</p>
          <ul>
            <li>典型場景:Tag picker / Multi-assignee / Filter chips multi-value</li>
            <li>單行模式自動接 OverflowIndicator(`+N`)避免 tag wrap</li>
          </ul>
        </div>
      </Section>

      <Section title="Pattern 3 — PeoplePicker(人員選擇 + Avatar 渲染)">
        <div className="prose prose-sm max-w-prose">
          <p>選人員(單 / 多)+ 渲染 avatar + 名稱 + role → <LinkTo kind="Design System/Components/PeoplePicker/展示" name="預設"><span className="text-primary hover:underline font-medium cursor-pointer">PeoplePicker</span></LinkTo>。對齊 Slack mention / Linear assignee / Asana people-search idiom。</p>
          <ul>
            <li>典型場景:Task assignee / Document collaborator / Workspace member invite</li>
          </ul>
        </div>
      </Section>

      <Section title="禁止 — App code 直接消費 SelectMenu">
        <div className="prose prose-sm max-w-prose">
          <p>不可直接 <code>import &#123; SelectMenu &#125; from '@/design-system/...'</code> 在 app — 必透過 Select / Combobox / PeoplePicker 三個 user-facing wrapper 之一。如有特殊 dropdown 需求(這 3 個都不對),回 DS 開新 wrapper 而不是繞過抽象層。</p>
        </div>
      </Section>
    </div>
  ),
}
