// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'

const meta: Meta = {
  title: 'Design System/Internal/SelectionControl/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── WhenToUse — 何時使用 SelectionItem ──────────────────────


// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsCheckboxRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      {/* 何時用 — 原 WhenToUse */}
      <div className="max-w-prose">
      <p>適合 SelectionItem 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      {/* @layout-space-magic-ok: 連結清單:同質清單項列距(layoutSpace.spec.md:165 同質清單列) */}
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Internal/SelectionControl/展示" name="通知偏好"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">通知偏好</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/SelectionControl/展示" name="方案選擇"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">方案選擇</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/SelectionControl/展示" name="前綴圖示"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">前綴圖示</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/SelectionControl/展示" name="前綴頭像"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">前綴頭像</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-[var(--layout-space-tight)]">判斷不確定時,參考下方「SelectionItem 與 Checkbox + Field 的差異」說明;若場景不符,改用對應的近親元件。</p>
    </div>

      {/* vs 近親 — VsCheckboxRule — 原 VsCheckboxRule */}
      <div className="max-w-prose">
      <p>兩者表達 selectable state,但結構與場景不同:</p>
      <ul>
        <li><strong>SelectionItem rich row(本 primitive,經 Checkbox / RadioGroup 消費)</strong>—大塊 row(含 icon / avatar / multi-line description),適合 settings / list-as-page;Notion/Slack idiom</li>
        <li><strong>Checkbox + Field</strong>—緊湊 form 欄位;適合 form group 多選</li>
      </ul>
      <p className="text-fg-muted">判斷:row 是 page content(讀取/設定)→ Checkbox / RadioGroup 的 rich-row 形態(內部消費 SelectionItem,不裸用 &lt;SelectionItem&gt;);row 是 form input(submit value)→ Checkbox + Field。</p>
    </div>
    </div>
  ),
}

// ── CompositionRules — SelectionItem 兩個 consumer pattern(對齊 Polaris ChoiceList / Material ListItem 慣例)──────

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    // 段落 ↔ 段落 = loose、段落標題 → 內容 = tight(與設計原則頁 Section / Rule 同一套;原本靠沒有安裝的 prose 外掛排版,h4 沒有任何樣式)
    <div className="flex max-w-prose flex-col gap-[var(--layout-space-loose)]">
      <p>SelectionItem 是 Family 2 reading-mode row layout primitive,由 Checkbox / RadioGroup 兩個 consumer 在「list-as-page settings」場景消費,不直接放在 app code:</p>
      <section className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h5 font-semibold text-foreground">Pattern 1 — Checkbox + SelectionItem(多選 settings list)</h3>
        <p>多選 + 每個 row 大塊 description / icon → <LinkTo kind="Design System/Components/Checkbox/展示" name="四模式"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">Checkbox</span></LinkTo> 內部消費 SelectionItem(control 放 Checkbox indicator / prefix 可選放 icon 或 avatar / content 放 label + description)。對齊 Notion 通知設定 / Slack notification preferences idiom。</p>
      </section>
      <section className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h5 font-semibold text-foreground">Pattern 2 — RadioGroup + SelectionItem(單選 plan picker)</h3>
        <p>單選 + 每個 row 大塊描述(plan tier / tier features)→ <LinkTo kind="Design System/Components/RadioGroup/展示" name="四模式"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">RadioGroup</span></LinkTo> 內部消費 SelectionItem(control 放 Radio indicator / prefix 可選放 icon 或 avatar / content 多行)。對齊 Stripe plan picker / Linear pricing tier idiom。</p>
      </section>
      <section className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h5 font-semibold text-foreground">Field 包覆規則</h3>
        <p>Checkbox / RadioGroup 在 form context 內 → 外層用 <LinkTo kind="Design System/Components/Field/展示" name="垂直"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">Field</span></LinkTo> 統一 label + helper + error(對齊 Field 4-Family Layout 慣例)。Field 處理 wrapper level 的 ARIA + error,SelectionItem 處理 row level 的 layout。</p>
      </section>
      <p className="text-fg-muted">禁止:在 app code 自刻 selection row(<code>&lt;label className="flex items-start gap-3 p-3"&gt;</code>)— 必消費 Checkbox / RadioGroup(對齊 M1 主檔消費準則 + Family 2 baseline)。</p>
    </div>
  ),
}
