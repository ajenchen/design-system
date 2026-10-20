// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Internal/Command/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// 規則的內容是一段文字 / 清單(不是範例區),不給 caption
const TutorialRule = createTutorialRule()

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsSelectMenuRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage className="max-w-prose">
      <UsageSection kind="when">
        <p>需要「搜尋過濾 + 鍵盤導覽」的選項清單:全域指令面板(⌘K)、行內搜尋清單;也是 Select / Combobox / PeoplePicker 搜尋模式的底層。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Internal/Command/展示" name="全域指令面板">全域指令面板(⌘K)— Linear / VS Code 式跨頁搜尋與快速動作</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/Command/展示" name="行內搜尋清單">行內搜尋清單 — Gmail 式 sidebar 信件資料夾過濾</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/Command/展示" name="純動作指令">純動作指令 — 選中立即執行的快速動作清單</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Internal/Command/展示" name="無結果狀態">搜尋無結果時的空狀態文案(CommandEmpty)</StoryLink>
          </li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialList>
          <li>不需要搜尋的短選項(少於 6 項)、選了就執行動作 → DropdownMenu</li>
          <li>表單裡的單選下拉 → Select(需要搜尋時它自己會切到搜尋模式)</li>
          <li>表單裡的多選下拉 → Combobox</li>
          <li>選人員 → PeoplePicker(專用的人員選擇器,內部已用 Command)</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Command</strong> —— 鍵盤優先的指令面板:以搜尋為主,選了執行一個動作(不是表單欄位)</li>
          <li><strong>SelectMenu</strong> —— 表單欄位的選擇器:選到的值寫回表單</li>
          <li><strong>DropdownMenu</strong> —— 不需要搜尋的操作選單:選完觸發動作、選單關閉,通常不到 10 項</li>
        </TutorialList>
        <p>判斷:結果是「執行某個動作」→ Command;結果是「設定欄位的值」→ SelectMenu。</p>
      </UsageSection>
    </TutorialPage>
  ),
}

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    // 段落 / 規則之間與規則標題 → 內容的間距由共用教學頁元件擁有(stories-helpers/examples/tutorial-page.tsx;原本靠沒有安裝的 prose 外掛排版,h4 沒有任何樣式)
    <TutorialPage className="max-w-prose">
      <p>Command 是 internal primitive,由消費者組合使用,不直接放在 app code。以下兩種 world-class 慣例(對齊 Linear / Raycast / VS Code Cmd-K idiom):</p>

      <TutorialRule title="Pattern 1 — SelectMenu 內嵌 Command(searchable form input)">
        <p>需要「搜尋 + 選值寫回 form」→ 用 <code>SelectMenu</code>(內部已組合 <code>Popover + Command</code>),<strong>不要</strong>自己組合:</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/Combobox/展示" name="四模式">Combobox</StoryLink>——可搜尋多選(如商品類別多選標籤)</li>
          <li><StoryLink kind="Design System/Components/Select/展示" name="搜尋">Select(searchable)</StoryLink>——可搜尋單選(如從長國家清單打字篩選)</li>
          <li><StoryLink kind="Design System/Components/PeoplePicker/展示" name="單人">PeoplePicker</StoryLink>——人員搜尋(如指派任務負責人)</li>
        </TutorialList>
      </TutorialRule>

      <TutorialRule title="Pattern 2 — CommandDialog 組成 Command Palette(Cmd+K)">
        <p>需要「全域 keyboard 觸發 + 跨頁搜尋 / 動作」→ 用本 DS export 的 <code>CommandDialog</code>(cmdk + Radix Dialog 包裝,內部已包 Command),不自行組合浮層(對齊 Linear ⌘K / Raycast / VS Code Quick Pick):</p>
        <pre className="text-caption"><code>{`<CommandDialog open={cmdkOpen} onOpenChange={setCmdkOpen}>
  <CommandInput placeholder="輸入指令..." />
  <CommandList>
    <CommandGroup heading="動作">
      <CommandItem>新建文件</CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>`}</code></pre>
      </TutorialRule>
      <p className="text-fg-muted">禁止:在產品端自己刻搜尋框 + 過濾清單 — 一律重用 Command,不要重造一份。</p>
    </TutorialPage>
  ),
}
