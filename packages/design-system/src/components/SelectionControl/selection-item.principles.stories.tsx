// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Internal/SelectionControl/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// 規則的內容是一段文字 / 清單(不是範例區),不給 caption
const TutorialRule = createTutorialRule()

// ── WhenToUse — 何時使用 SelectionItem ──────────────────────


// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsCheckboxRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage className="max-w-prose">
      <UsageSection kind="when">
        <p>Checkbox 與 RadioGroup 共用的選項列排版(控件 + 可選的圖示 / 頭像 + 標籤與說明)。它是內部元件:一律透過 <code>&lt;Checkbox label&gt;</code> / <code>&lt;RadioGroupItem label&gt;</code> 使用。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Internal/SelectionControl/展示" name="通知偏好">通知偏好</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/SelectionControl/展示" name="方案選擇">方案選擇</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/SelectionControl/展示" name="前綴圖示">前綴圖示</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/SelectionControl/展示" name="前綴頭像">前綴頭像</StoryLink>
          </li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li>直接把 <code>&lt;SelectionItem&gt;</code> 寫進產品頁面 → 用 Checkbox / RadioGroup:裸用會失去勾選狀態的無障礙語意、鍵盤與表單整合</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Checkbox / RadioGroup 的大列形態(內部就是 SelectionItem)</strong> —— 大塊的列(含圖示 / 頭像 / 多行說明),適合設定頁、把清單當頁面內容的情境(Notion / Slack 的做法)</li>
          <li><strong>Checkbox + Field</strong> —— 緊湊的表單欄位,適合表單裡的多選</li>
        </TutorialList>
        <p>判斷:這一列是頁面內容(閱讀 / 設定)→ 大列形態;這一列是表單輸入(要送出的值)→ Checkbox + Field。</p>
      </UsageSection>
    </TutorialPage>
  ),
}

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    // 段落 / 規則之間與規則標題 → 內容的間距由共用教學頁元件擁有(stories-helpers/examples/tutorial-page.tsx;原本靠沒有安裝的 prose 外掛排版,h4 沒有任何樣式)
    <TutorialPage className="max-w-prose">
      <p>SelectionItem 是 Family 2 reading-mode row layout primitive,由 Checkbox / RadioGroup 兩個 consumer 在「list-as-page settings」場景消費,不直接放在 app code:</p>
      <TutorialRule title="Pattern 1 — Checkbox + SelectionItem(多選 settings list)">
        <p>多選 + 每個 row 大塊 description / icon → <StoryLink kind="Design System/Components/Checkbox/展示" name="四模式">Checkbox</StoryLink> 內部消費 SelectionItem(control 放 Checkbox indicator / prefix 可選放 icon 或 avatar / content 放 label + description)。對齊 Notion 通知設定 / Slack notification preferences idiom。</p>
      </TutorialRule>
      <TutorialRule title="Pattern 2 — RadioGroup + SelectionItem(單選 plan picker)">
        <p>單選 + 每個 row 大塊描述(plan tier / tier features)→ <StoryLink kind="Design System/Components/RadioGroup/展示" name="四模式">RadioGroup</StoryLink> 內部消費 SelectionItem(control 放 Radio indicator / prefix 可選放 icon 或 avatar / content 多行)。對齊 Stripe plan picker / Linear pricing tier idiom。</p>
      </TutorialRule>
      <TutorialRule title="Field 包覆規則">
        <p>Checkbox / RadioGroup 在 form context 內 → 外層用 <StoryLink kind="Design System/Components/Field/展示" name="垂直">Field</StoryLink> 統一 label + helper + error(對齊 Field 4-Family Layout 慣例)。Field 處理 wrapper level 的 ARIA + error,SelectionItem 處理 row level 的 layout。</p>
      </TutorialRule>
      <p className="text-fg-muted">禁止:在 app code 自刻 selection row(<code>&lt;label className="flex items-start gap-3 p-3"&gt;</code>)— 必消費 Checkbox / RadioGroup(對齊 M1 主檔消費準則 + Family 2 baseline)。</p>
    </TutorialPage>
  ),
}
