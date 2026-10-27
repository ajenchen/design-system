// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { Separator } from './separator'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Separator/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true })

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 Separator ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>由你(使用元件的人)自己決定「這裡要分隔」的地方:側欄群組之間、描述清單的區塊之間、一段內容裡要明確切開的兩部分。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Components/Separator/展示" name="水平">水平分隔</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Separator/展示" name="垂直">垂直分隔</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/DropdownMenu/展示" name="基本">在 DropdownMenu 內(DropdownMenuSeparator,見 DropdownMenu 展示「基本」)</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Separator/展示" name="在 DescriptionList 區塊之間">在 DescriptionList 區塊之間</StoryLink>
          </li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        {/* 稽核 L124:原本三則 ❌ 都沒有範例、說明只是重複 note,而且內容跟設計規格的 token 對照表重複 —— 併成一則,token 分工改連過去 */}
        <TutorialRule
          title="❌ 不用 Separator 元件畫元件本身的邊框"
          note={<>Dialog / Sidebar header-footer 的邊界、Input / Card / DataTable 的輪廓邊框,都是元件自己的 CSS 邊框,不用 Separator 元件 —— Separator 有 role 語意,只用在 consumer 手動放置的分隔。分隔線用 --divider、控件邊框用 --border,兩個 token 的分工見{' '}
            <StoryLink kind="Design System/Components/Separator/設計規格" name="設計變數規則（--divider vs --border）">設計規格 → 設計變數規則</StoryLink></>}
        />
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>群組自動分隔(MenuGroup / SidebarGroup)</strong> —— 相鄰群組之間元件自己畫線,只要分好組,不用手放 Separator</li>
          <li><strong>ButtonDivider</strong> —— 按鈕群組裡的分隔線(長度跟著同列最高的控件),不用 Separator 畫</li>
          <li><strong>DropdownMenuSeparator</strong> —— 選單項目之間的分隔線,用選單自己的分隔元件</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const DecorativeSemanticRule: Story = {
  name: '裝飾性 vs 語意分隔（讀屏的差別）',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="預設 decorative=true — 純視覺分隔,screen reader 跳過"
        note="大多數場景(settings panel 內的區塊分組、同一列 meta 資訊分組、menu 項目分組)屬視覺性分隔。讓 screen reader 跳過,避免語意噪音。toolbar / action region 的按鈕群分隔不走 Separator,用 ButtonGroup + ButtonDivider"
      >
        {/* 稽核 L124:原本拿 DropdownMenuSeparator 當範例,但那是選單自己的分隔元件(展示頁「垂直」旁的註解寫明不是 consumer 手放的場景);
            改用 consumer 自己放的 Separator —— 展示頁「垂直」那條文件 meta 列 */}
        {/* 同一行 meta 文字 ↔ 分隔線 8px = 行內 item 的 micro 幾何(值同展示頁「垂直」;範例區是直排 flex,inline-flex 會被排成一整列) */}
        <div className="inline-flex h-4 items-center gap-2 text-caption text-fg-secondary">
          <span>陳雅婷 更新於 2026/04/18</span>
          <Separator orientation="vertical" />
          <span>12 頁</span>
          <Separator orientation="vertical" />
          <span>2.4 MB</span>
        </div>
        <ExampleCaption>↑ 同一列 meta 資訊之間的直線只是視覺分組,讀屏跳過(decorative 預設 true)</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="明確結構性分組(語意分隔)→ decorative={false}"
        note={'當 Separator 真的代表內容層級的結構邊界(例如 profile page 的「個人」vs「團隊」兩個 section),設 decorative={false},讓 screen reader 讀出 role="separator"'}
      >
        <div className="border border-border rounded-lg p-[var(--layout-space-loose)] max-w-md flex flex-col gap-[var(--layout-space-loose)]">
          <div className="flex flex-col gap-[var(--item-gap-label-desc-scanning)]">
            <h4 className="text-h6 font-medium text-foreground">個人資訊</h4>
            <p className="text-caption text-fg-muted">姓名、email、時區</p>
          </div>
          <Separator decorative={false} />
          <div className="flex flex-col gap-[var(--item-gap-label-desc-scanning)]">
            <h4 className="text-h6 font-medium text-foreground">團隊資訊</h4>
            <p className="text-caption text-fg-muted">所屬團隊、職稱</p>
          </div>
        </div>
        <ExampleCaption>↑ 兩個 section 是頁面結構的主層級 → 需要 a11y 語意</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

