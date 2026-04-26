// @principles-rationale: UsageGuidance merges WhenToUse + VsCommandRule into single 使用指引 story per refactor task (2026-04-26); only-1-story is fine because SelectMenu is a thin Internal primitive with limited principle surface
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
