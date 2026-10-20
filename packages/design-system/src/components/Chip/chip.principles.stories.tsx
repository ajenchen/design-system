// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Chip, ChipGroup } from './chip'
import { SegmentedControl, SegmentedControlItem } from '@/design-system/components/SegmentedControl/segmented-control'
import { Badge } from '@/design-system/components/Badge/badge'
import { Tag } from '@/design-system/components/Tag/tag'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/Chip/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true })

// ── 定位與分界 ───────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 Chip ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse / VsSegmentedRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [langs, setLangs] = React.useState<string[]>(['js', 'ts'])
    const [period, setPeriod] = React.useState('week')
    return (
    <TutorialPage>
      <UsageSection kind="when">
        <p>篩選面板或工具列上的多選濾鏡(語言、狀態、類別),或替內容挑選標籤。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/Chip/展示" name="預設">技術文章列表的語言標籤濾鏡(多選)</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Chip/展示" name="帶 Badge">任務列表的狀態篩選 — Badge 顯示各狀態筆數</StoryLink></li>
          <li><StoryLink kind="Design System/Components/Chip/展示" name="單選">程式語言擇一的單選濾鏡(type="single")</StoryLink></li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 加移除鈕 X(再點一次取消選取,就是移除)"
          note="Filter chip 的「移除這個 filter」由 toggle(再點一次)承擔。加 X 等於同一動作有兩個 affordance,違反 Hicks's Law。Material 3 / Atlassian / Polaris filter chips 都不提供 X"
        >
          <ExampleCaption warn>（範例省略）Chip 型別不提供 onRemove,設計上就擋住這個錯用</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 單獨使用,沒有 ChipGroup 包覆"
          note="Chip 的選擇狀態由 Radix ToggleGroup 管理,沒 ChipGroup 會失去 keyboard navigation / a11y / state sync"
        >
          <ExampleCaption warn>（範例省略）Chip 必須在 ChipGroup 內,對齊 RadioGroup / SegmentedControl 的結構</ExampleCaption>
        </TutorialRule>
        <TutorialList>
          <li>單一按鈕的開 / 關 → 可切換的按鈕(Button 的 pressed):一個開關不需要群組語意</li>
          <li>計數 / 狀態指示(不可互動)→ Badge</li>
          <li>使用者已輸入的項目(收件人、已加的篩選條件)→ 輸入框裡的項目(LinkInput / PeoplePicker),不是獨立的選擇器</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="Chip — 多選濾鏡(可選任意數量)"
          note="Material Design Filter Chip 的實作:一排獨立 pill,可勾選任意組合。典型場景:技術文章列表的語言標籤濾鏡、商品列表的類別篩選、搜尋結果的多維度過濾"
        >
          <ExampleGroup>
            <ExampleCaption>✅ 部落格文章的語言濾鏡（可多選）</ExampleCaption>
            <ChipGroup type="multiple" value={langs} onValueChange={(v) => setLangs(v as string[])}>
              <Chip value="js">JavaScript</Chip>
              <Chip value="ts">TypeScript</Chip>
              <Chip value="py">Python</Chip>
              <Chip value="go">Go</Chip>
              <Chip value="rs">Rust</Chip>
            </ChipGroup>
            <ExampleCaption>↑ 目前選了 {langs.length} 種語言</ExampleCaption>
          </ExampleGroup>
        </TutorialRule>

        <TutorialRule
          title="互斥單選(同時只能選一個)→ SegmentedControl"
          note="2–5 個互斥選項、視覺要表達「連體」關係,用 SegmentedControl。Chip 各自獨立的視覺反而模糊了「只能選一個」的語意"
        >
          <ExampleGroup>
            <ExampleCaption>❌ 錯用：時間週期是互斥單選,卻用 Chip</ExampleCaption>
            <ChipGroup type="single" defaultValue="week">
              <Chip value="day">日</Chip>
              <Chip value="week">週</Chip>
              <Chip value="month">月</Chip>
            </ChipGroup>
            <ExampleCaption warn>↑ 改用 SegmentedControl（視覺連體 = 互斥語意更清楚）</ExampleCaption>
            <SegmentedControl value={period} onValueChange={setPeriod}>
              <SegmentedControlItem value="day">日</SegmentedControlItem>
              <SegmentedControlItem value="week">週</SegmentedControlItem>
              <SegmentedControlItem value="month">月</SegmentedControlItem>
            </SegmentedControl>
          </ExampleGroup>
        </TutorialRule>

        <TutorialRule
          title="純顯示、不可互動 → Tag"
          note="Chip 是 control(選擇 / 未選),Tag 是 label(資訊標記)。商品卡上「新品 / 熱銷」是 Tag 不是 Chip"
        >
          {/* @layout-space-magic-ok: Tag 與 Tag 之間 gap 4px(tag.spec.md:230)(layoutSpace.spec.md:113 同範疇 spec-own) */}
          <div className="flex items-center gap-1">
            <Tag color="red">熱銷</Tag>
            <Tag color="blue">新品</Tag>
          </div>
          <ExampleCaption>↑ 純顯示用 Tag,不要誤用 Chip</ExampleCaption>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
    )
  },
}


// ── Layout ────────────────────────────────────────────────────────────────

export const LayoutRule: Story = {
  name: '超出處理:換行 vs 捲動 vs 選單',
  render: () => {
    const [tagsW, setTagsW] = React.useState<string[]>(['react'])
    const [tagsS, setTagsS] = React.useState<string[]>(['react'])
    const [tagsM, setTagsM] = React.useState<string[]>(['react'])
    const options = ['react', 'vue', 'svelte', 'angular', 'solid', 'qwik', 'ember', 'backbone', 'knockout']
    const labels: Record<string, string> = {
      react: 'React', vue: 'Vue', svelte: 'Svelte', angular: 'Angular',
      solid: 'Solid', qwik: 'Qwik', ember: 'Ember', backbone: 'Backbone', knockout: 'Knockout',
    }
    return (
      <TutorialPage>
        <TutorialRule
          title="wrap（預設）— filter panel / tag cloud"
          note="塞不下換行,預設選擇。垂直空間充足,filter panel / 設定頁 tag 選取等場景"
        >
          <div className="max-w-md border border-border rounded-md p-[var(--layout-space-loose)]">
            <ChipGroup type="multiple" value={tagsW} onValueChange={(v) => setTagsW(v as string[])}>
              {options.map(o => <Chip key={o} value={o}>{labels[o]}</Chip>)}
            </ChipGroup>
          </div>
          <ExampleCaption>↑ 設定頁的技術選取 — 換行展示所有選項</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="scroll — 單行 toolbar / header 必須固定高度"
          note="垂直空間受限(toolbar / card header),橫向捲動 + fade mask 指示溢出。搭配左右 scroll arrow 給鍵盤和滑鼠使用者"
        >
          <div className="max-w-md border border-border rounded-md p-[var(--layout-space-loose)]">
            <ChipGroup type="multiple" layout="scroll" value={tagsS} onValueChange={(v) => setTagsS(v as string[])}>
              {options.map(o => <Chip key={o} value={o}>{labels[o]}</Chip>)}
            </ChipGroup>
          </div>
          <ExampleCaption>↑ 新聞網站的分類 toolbar — 固定高度,滑動看更多</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="menu — 單行但要完整選項可見"
          note="單行水平捲動,chip 全可見不隱藏;dropdown(ChevronDown)永遠列出全部 chip。對齊 Chrome tab dropdown / VS Code editor tabs 的「show all」pattern。menu 模式必須 controlled(value + onValueChange)"
        >
          <div className="max-w-md border border-border rounded-md p-[var(--layout-space-loose)]">
            <ChipGroup type="multiple" layout="menu" value={tagsM} onValueChange={(v) => setTagsM(v as string[])}>
              {options.map(o => <Chip key={o} value={o}>{labels[o]}</Chip>)}
            </ChipGroup>
          </div>
          <ExampleCaption>↑ ListView 工具列 — 單行 + ⋯ 展開全部選項</ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}

// ── 選中視覺 ─────────────────────────────────────────────────────────────

export const SelectedStyleRule: Story = {
  name: '選中狀態：文字 + 邊框 同染，不用背景強調',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="選中 = primary text + border，底色不變"
        note="對齊 SegmentedControl / Tabs 的選中 canonical:primary 底色同時染文字和線條(瞬時 hover 用弱色、持續選中用強色)。用 bg 強調會讓 chip 看起來變成「按鈕」,混淆多選濾鏡的語意"
      >
        <ChipGroup type="multiple" defaultValue={['react', 'ts']}>
          <Chip value="react">React</Chip>
          <Chip value="vue">Vue</Chip>
          <Chip value="ts">TypeScript</Chip>
          <Chip value="js">JavaScript</Chip>
        </ChipGroup>
        <ExampleCaption>↑ 選中(React / TypeScript)= primary 文字 + 邊框,底色仍 bg-surface</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="badge suffix — 計數指示"
        note="filter chip 常配計數:「React(24) / Vue(8)」,使用者看計數做決策。Badge 放在 chip 末端"
      >
        <ChipGroup type="multiple" defaultValue={['react']}>
          <Chip value="react" badge={<Badge count={24} />}>React</Chip>
          <Chip value="vue" badge={<Badge count={8} />}>Vue</Chip>
          <Chip value="svelte" badge={<Badge count={3} />}>Svelte</Chip>
        </ChipGroup>
        <ExampleCaption>↑ 文章列表的語言濾鏡,顯示每種語言有幾篇</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 禁止 ────────────────────────────────────────────────────────────────

