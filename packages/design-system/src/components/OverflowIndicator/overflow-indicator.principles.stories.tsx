// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Internal/OverflowIndicator/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// 規則的內容是一段文字(不是範例區),不給 caption
const TutorialRule = createTutorialRule()

// ── WhenToUse — 何時使用 OverflowIndicator ──────────────────────


// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsScrollAreaRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage className="max-w-prose">
      <UsageSection kind="when">
        <p>一列放不下全部項目時,顯示前幾個、其餘折成 <code>+N</code>,滑過展開完整清單。它是內部元件,一般由 Combobox、PeoplePicker 這類元件內建使用。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Internal/OverflowIndicator/展示" name="Combobox 標籤溢出">Combobox 標籤溢出</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/OverflowIndicator/展示" name="人員頭像 疊合 +N">PR reviewer 頭像疊合 +N(只顯前 3 位)</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/OverflowIndicator/展示" name="DataTable 人員欄位">DataTable 人員欄位</StoryLink>
          </li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li>分頁籤 / 一整列 chip 放不下 → 用「更多」選單按鈕(點開選單),不是 +N 滑過展開</li>
          <li>項目數量未知或非常多、需要連續瀏覽 → ScrollArea</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>OverflowIndicator</strong> —— 項目數量已知且不多:顯示前幾個,其餘折成 <code>+N</code>,滑過看完整清單</li>
          <li><strong>ScrollArea</strong> —— 數量未知或極多:讓使用者捲動瀏覽全部</li>
        </TutorialList>
        <p>判斷:少量、已知、適合一次預覽 → OverflowIndicator;數量大、未知或需要連續瀏覽 → ScrollArea。</p>
      </UsageSection>
    </TutorialPage>
  ),
}

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    // 規則之間 / 規則標題 → 內容的間距由共用教學頁元件擁有(stories-helpers/examples/tutorial-page.tsx;原本的 <h4> 沒有任何樣式 —— 靠沒有安裝的 prose 外掛)
    <TutorialPage className="max-w-prose">
      <p>OverflowIndicator 是顯示「還有 N 個沒列出來」的 <code>+N</code> 小標籤,由下列幾種元件在內部使用(顯示前幾項 + 把剩下的折成 <code>+N</code>),不直接放在頁面程式碼裡:</p>

      <TutorialRule title="Pattern 1 — Combobox 標籤溢出(單行模式)">
        <p>多選標籤太多、單行放不下 → <StoryLink kind="Design System/Components/Combobox/展示" name="四模式">Combobox</StoryLink> 內部使用 OverflowIndicator;hover <code>+N</code> 展開完整清單。對齊 GitHub 多標籤 / Linear 多指派人的做法。</p>
      </TutorialRule>

      <TutorialRule title="Pattern 2 — 人員頭像疊合 +N">
        <p>一群人只顯示前幾位、其餘折成 <code>+M</code>。目前由列表元件自行把頭像疊合再放上 OverflowIndicator(形狀用圓形對齊頭像);未來規劃中的 Avatar 群組元件會把這段組合收進去。對齊 Slack 工作區成員預覽 / Linear 團隊成員的做法。</p>
      </TutorialRule>

      <TutorialRule title="Pattern 3 — PeoplePicker 人員選擇欄位 +N">
        <p>人員選擇欄位選了多位、單行放不下 → PeoplePicker(<code>PersonDisplay</code>)內部使用 OverflowIndicator(圓形對齊頭像),hover <code>+N</code> 展開完整名單。對齊 Linear 多指派人 / Jira watchers 的做法。</p>
      </TutorialRule>

      <div>
        <p className="text-fg-muted">水平容器(Tabs / 單行 chip 列)寬度不夠時<strong className="font-medium">不用本元件</strong>——DS canonical 是 <code>horizontal-overflow</code> 的 <code>OverflowMenuTriggerButton</code> + DropdownMenu(click 開選單);Breadcrumb 中段收合走 BreadcrumbEllipsis + DropdownMenu。兩者皆 click 開選單,與本元件 hover 展開語義不同。</p>
        <p className="text-fg-muted">禁止:在頁面程式碼裡自己手刻 <code>+N</code> <code>&lt;span&gt;</code>(會失去 hover 展開浮層與一致的形狀樣式)— 一律使用 OverflowIndicator。</p>
      </div>
    </TutorialPage>
  ),
}
