// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Chip, ChipGroup } from './chip'
import { SegmentedControl, SegmentedControlItem } from '@/design-system/components/SegmentedControl/segmented-control'
import { Badge } from '@/design-system/components/Badge/badge'
import { Tag } from '@/design-system/components/Tag/tag'

const meta: Meta = {
  title: 'Design System/Components/Chip/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

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
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Chip 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Chip/展示" name="Single Selection"><span className="text-primary hover:underline font-medium cursor-pointer">Single Selection</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Chip/展示" name="Layout Wrap"><span className="text-primary hover:underline font-medium cursor-pointer">Layout Wrap</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Chip/展示" name="Layout Scroll"><span className="text-primary hover:underline font-medium cursor-pointer">Layout Scroll</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Chip/展示" name="Layout Menu"><span className="text-primary hover:underline font-medium cursor-pointer">Layout Menu</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs 近親元件 — 原 VsSegmentedRule */}
      <div>
        <Rule
          title="vs 近親元件 — Chip 是多選濾鏡(可選任意數量)"
          note="Material Design Filter Chip 的實作:一排獨立 pill,可勾選任意組合。典型場景:技術文章列表的語言標籤濾鏡、商品列表的類別篩選、搜尋結果的多維度過濾"
        >
          <div>
            <Label>✅ 部落格文章的語言濾鏡（可多選）</Label>
            <ChipGroup type="multiple" value={langs} onValueChange={(v) => setLangs(v as string[])}>
              <Chip value="js">JavaScript</Chip>
              <Chip value="ts">TypeScript</Chip>
              <Chip value="py">Python</Chip>
              <Chip value="go">Go</Chip>
              <Chip value="rs">Rust</Chip>
            </ChipGroup>
            <Label>↑ 目前選了 {langs.length} 種語言</Label>
          </div>
        </Rule>

        <Rule
          title="vs 近親元件 — 互斥單選(同時只能選一個)用 SegmentedControl"
          note="2–5 個互斥選項、視覺要表達「連體」關係,用 SegmentedControl。Chip 各自獨立的視覺反而模糊了「只能選一個」的語意"
        >
          <div>
            <Label>❌ 錯用：時間週期是互斥單選,卻用 Chip</Label>
            <ChipGroup type="single" defaultValue="week">
              <Chip value="day">日</Chip>
              <Chip value="week">週</Chip>
              <Chip value="month">月</Chip>
            </ChipGroup>
            <Label warn>↑ 改用 SegmentedControl（視覺連體 = 互斥語意更清楚）</Label>
            <SegmentedControl value={period} onValueChange={setPeriod} className="mt-2">
              <SegmentedControlItem value="day">日</SegmentedControlItem>
              <SegmentedControlItem value="week">週</SegmentedControlItem>
              <SegmentedControlItem value="month">月</SegmentedControlItem>
            </SegmentedControl>
          </div>
        </Rule>

        <Rule
          title="vs 近親元件 — 純顯示、不可互動用 Tag"
          note="Chip 是 control(選擇 / 未選),Tag 是 label(資訊標記)。商品卡上「新品 / 熱銷」是 Tag 不是 Chip"
        >
          <div className="flex items-center gap-2">
            <Tag variant="red">熱銷</Tag>
            <Tag variant="blue">新品</Tag>
          </div>
          <Label>↑ 純顯示用 Tag,不要誤用 Chip</Label>
        </Rule>
      </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div>
      <Rule
        title="何時不用 / 替代元件 — 加 dismiss X(再點一次 deselect 就是 dismiss)"
        note="Filter chip 的「移除這個 filter」由 toggle(再點一次)承擔。加 X 等於同一動作有兩個 affordance,違反 Hicks's Law。Material 3 / Atlassian / Polaris filter chips 都不提供 X"
      >
        <Label warn>（範例省略）Chip 型別不提供 onDismiss,設計上就擋住這個錯用</Label>
      </Rule>

      <Rule
        title="何時不用 / 替代元件 — Chip 單獨使用,沒有 ChipGroup 包覆"
        note="Chip 的選擇狀態由 Radix ToggleGroup 管理,沒 ChipGroup 會失去 keyboard navigation / a11y / state sync"
      >
        <Label warn>（範例省略）Chip 必須在 ChipGroup 內,對齊 RadioGroup / SegmentedControl 的結構</Label>
      </Rule>
    </div>
    </div>
    )
  },
}

// ── Layout ────────────────────────────────────────────────────────────────

export const LayoutRule: Story = {
  name: 'Overflow：wrap vs scroll vs menu',
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
      <div>
        <Rule
          title="wrap（預設）— filter panel / tag cloud"
          note="塞不下換行,預設選擇。垂直空間充足,filter panel / 設定頁 tag 選取等場景"
        >
          <div className="max-w-md border border-border rounded-md p-3">
            <ChipGroup type="multiple" value={tagsW} onValueChange={(v) => setTagsW(v as string[])}>
              {options.map(o => <Chip key={o} value={o}>{labels[o]}</Chip>)}
            </ChipGroup>
          </div>
          <Label>↑ 設定頁的技術選取 — 換行展示所有選項</Label>
        </Rule>

        <Rule
          title="scroll — 單行 toolbar / header 必須固定高度"
          note="垂直空間受限(toolbar / card header),橫向捲動 + fade mask 指示溢出。搭配左右 scroll arrow 給鍵盤和滑鼠使用者"
        >
          <div className="max-w-md border border-border rounded-md p-3">
            <ChipGroup type="multiple" layout="scroll" value={tagsS} onValueChange={(v) => setTagsS(v as string[])}>
              {options.map(o => <Chip key={o} value={o}>{labels[o]}</Chip>)}
            </ChipGroup>
          </div>
          <Label>↑ 新聞網站的分類 toolbar — 固定高度,滑動看更多</Label>
        </Rule>

        <Rule
          title="menu — 單行但要完整選項可見"
          note="單行 + 溢出的 chip 收進 ⋯ dropdown。對齊 Chrome tab dropdown / VS Code editor tabs 的「show all」pattern。menu 模式必須 controlled(value + onValueChange)"
        >
          <div className="max-w-md border border-border rounded-md p-3">
            <ChipGroup type="multiple" layout="menu" value={tagsM} onValueChange={(v) => setTagsM(v as string[])}>
              {options.map(o => <Chip key={o} value={o}>{labels[o]}</Chip>)}
            </ChipGroup>
          </div>
          <Label>↑ ListView 工具列 — 單行 + ⋯ 展開全部選項</Label>
        </Rule>
      </div>
    )
  },
}

// ── 選中視覺 ─────────────────────────────────────────────────────────────

export const SelectedStyleRule: Story = {
  name: '選中狀態：text + border 同染，不用 bg 強調',
  render: () => (
    <div>
      <Rule
        title="選中 = primary-hover text + border，底色不變"
        note="對齊 SegmentedControl / Tabs / Input 的 canonical 選中規則(primary-hover 同時染文字和線條)。用 bg 強調會讓 chip 看起來變成「按鈕」,混淆多選濾鏡的語意"
      >
        <ChipGroup type="multiple" defaultValue={['react', 'ts']}>
          <Chip value="react">React</Chip>
          <Chip value="vue">Vue</Chip>
          <Chip value="ts">TypeScript</Chip>
          <Chip value="js">JavaScript</Chip>
        </ChipGroup>
        <Label>↑ 選中(React / TypeScript)= primary-hover 文字 + 邊框,底色仍 bg-surface</Label>
      </Rule>

      <Rule
        title="badge suffix — 計數指示"
        note="filter chip 常配計數:「React(24) / Vue(8)」,使用者看計數做決策。Badge 放在 chip 末端"
      >
        <ChipGroup type="multiple" defaultValue={['react']}>
          <Chip value="react" badge={<Badge count={24} />}>React</Chip>
          <Chip value="vue" badge={<Badge count={8} />}>Vue</Chip>
          <Chip value="svelte" badge={<Badge count={3} />}>Svelte</Chip>
        </ChipGroup>
        <Label>↑ 文章列表的語言濾鏡,顯示每種語言有幾篇</Label>
      </Rule>
    </div>
  ),
}

// ── 禁止 ────────────────────────────────────────────────────────────────

