// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Internal/Menu/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// 規則的內容是一段文字 / 清單(不是範例區),不給 caption
const TutorialRule = createTutorialRule()

// ── WhenToUse — 何時使用 Menu ──────────────────────


// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsItemAnatomyRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage className="max-w-prose">
      <UsageSection kind="when">
        <p>選單裡的一列選項(在選單裡挑一個或多個)。MenuItem 是內部排版元件,一般透過 DropdownMenu(動作選單)或 SelectMenu(選值下拉)使用,不直接寫進產品頁面。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Internal/Menu/展示" name="基本">信箱資料夾切換選單(收件匣 / 草稿 / 已傳送)— 純文字選項</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/Menu/展示" name="前置圖示 + 說明文字">通知偏好設定選單 — 前置圖示 + 說明文字</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/Menu/展示" name="頭像">指派負責人選單 — 人員頭像列</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/Menu/展示" name="頭像 + 說明文字">跨部門選人 — 頭像 + 部門說明文字</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/Menu/展示" name="多選">通知管道多選(電子郵件 / 推播 / Slack)</StoryLink>
          </li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li>直接把 <code>&lt;MenuItem&gt;</code> 寫進產品頁面 → 用 DropdownMenu / SelectMenu 包起來:裸用會失去外層選單的無障礙、鍵盤與焦點管理</li>
          <li>表單裡的勾選 / 單選選項 → Checkbox / RadioGroup(標籤排版是 SelectionItem)</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>MenuItem</strong> —— 浮層選單裡的一列,掃視後挑一個;標籤與說明各最多一行</li>
          <li><strong>SelectionItem</strong> —— 表單裡 Checkbox / Radio 的標籤排版;要完整閱讀,不截斷</li>
          <li><strong>列表項(例如 FileItem)</strong> —— 內容列表的一列,用來閱讀,截斷規則依元件而定</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    // 段落 / 規則之間與規則標題 → 內容的間距由共用教學頁元件擁有(stories-helpers/examples/tutorial-page.tsx;原本靠沒有安裝的 prose 外掛排版,h4 沒有任何樣式)
    <TutorialPage className="max-w-prose">
      <p>MenuItem 是選單選項列的共用排版元件,由以下兩類選單元件包起來使用,不會直接寫在產品頁面裡:</p>
      <TutorialRule title="Pattern 1 — DropdownMenu + MenuItem(action menu)">
        <p>使用者點擊觸發某個 action(複製 / 刪除 / 重新命名)→ <StoryLink kind="Design System/Components/DropdownMenu/展示" name="基本">DropdownMenu</StoryLink>(Radix 控制 open / close + keyboard nav,MenuItem 提供 row layout)。</p>
      </TutorialRule>
      <TutorialRule title="Pattern 2 — SelectMenu(Popover + Command + MenuItem)— form value 選擇">
        <p>使用者選一個 / 多個值寫回 form → <StoryLink kind="Design System/Components/Select/展示" name="四模式">Select</StoryLink> / <StoryLink kind="Design System/Components/Combobox/展示" name="四模式">Combobox</StoryLink>(內部已組合 SelectMenu + cmdk + MenuItem)。</p>
      </TutorialRule>
      <p className="text-fg-muted">禁止:在產品頁面裡自己用 <code>&lt;div&gt;</code> 拼一列選單(像 <code>&lt;div className="flex px-2 py-1.5"&gt;</code>)— 一律透過上方的 MenuItem 系選單元件(DropdownMenu / SelectMenu 等,內部消費 MenuItem),才能確保所有選單列的對齊與間距一致。MenuItem 本身是 internal 排版元件,在產品頁面直接裸用會失去外層選單的無障礙 / 鍵盤 / 焦點管理。各區塊的對齊規則(左側圖示/頭像在 24px 內對齊、文字往下堆疊、右側標記可有可無)由選項列共用設計準則統一規範。</p>
    </TutorialPage>
  ),
}
