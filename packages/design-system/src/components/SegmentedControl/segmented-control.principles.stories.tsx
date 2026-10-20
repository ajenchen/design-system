// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import {
  AlignLeft, AlignCenter, AlignRight,
  List, LayoutGrid, Calendar,
} from 'lucide-react'
import { SegmentedControl, SegmentedControlItem } from './segmented-control'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/components/Tabs/tabs'
import { Button } from '@/design-system/components/Button/button'
import { Badge } from '@/design-system/components/Badge/badge'
import { ButtonDivider, ButtonGroup } from '@/design-system/components/Button/button-group'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/SegmentedControl/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true })
// 範例只有一顆按鈕:範例維持自然寬度(naturalWidth),不逐顆寫 self-start(T15)
const TriggerRule = createTutorialRule({ examples: true, naturalWidth: true })

// ── UsageGuidance — 何時用 / 何時不用 / vs 近親元件 ─────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [align, setAlign] = useState('left')
    const [period, setPeriod] = useState('week')
    return (
      <TutorialPage>
        <UsageSection kind="when">
          <p>從 2–5 個選項裡挑恰好一個,外觀是一排連在一起的分段按鈕:對齊方式、檢視模式、篩選的分段切換、圖表的時間維度;選了之後下方欄位跟著變的表單段落也可以。</p>
          <TutorialRule
            title="SegmentedControl 是小型切換控件(可以帶動下方內容變化)"
            note="常見誤解：以為 SegmentedControl 只能當 value input（選了就結束）。實際上它可以驅動下方局部內容變化——chart 維度切換、list 排序切換、form 條件欄位切換都是正當用法。關鍵是規模：它切的是局部變體（一個 chart / 一段 form section），不是整個 container"
          >
            <ExampleGroup>
              <ExampleCaption>✅ 純 value input（值直接送出，不影響下方）</ExampleCaption>
              <SegmentedControl value={align} onValueChange={setAlign} iconOnly>
                <SegmentedControlItem value="left" startIcon={AlignLeft} aria-label="靠左對齊" />
                <SegmentedControlItem value="center" startIcon={AlignCenter} aria-label="置中對齊" />
                <SegmentedControlItem value="right" startIcon={AlignRight} aria-label="靠右對齊" />
              </SegmentedControl>
            </ExampleGroup>
            <ExampleGroup>
              <ExampleCaption>✅ 驅動下方 chart 維度變化（局部變體，不是結構）</ExampleCaption>
              <SegmentedControl value={period} onValueChange={setPeriod}>
                <SegmentedControlItem value="day">日</SegmentedControlItem>
                <SegmentedControlItem value="week">週</SegmentedControlItem>
                <SegmentedControlItem value="month">月</SegmentedControlItem>
              </SegmentedControl>
              <ExampleCaption>↑ 切換會重載下方 chart 資料，但 chart 還是同一個 chart，不是換一整個 view</ExampleCaption>
            </ExampleGroup>
          </TutorialRule>
        </UsageSection>

        <UsageSection kind="whenNot">
          <TriggerRule
            title="❌ 只有一個開 / 關:用可切換的按鈕"
            note="1 個 item 的 SegmentedControl 沒有選擇語意。二元狀態用 Button pressed"
          >
            <Button variant="text" pressed>已釘選</Button>
          </TriggerRule>

          <TutorialRule
            title="❌ 5 個以上選項:用 Select / RadioGroup"
            note="選項多 → Select / RadioGroup。SegmentedControl 視覺會過窄，label 被截斷。Stripe filter 若超過 5 選項會用 Select"
          >
            <ExampleCaption warn>5+ 選項 → Select / RadioGroup,SegmentedControl 空間受限</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="❌ 多選:用 Checkbox 群組"
            note="SegmentedControl 是「選恰好一個」。多選改用 Checkbox 群組。Notion 的權限欄(read / edit / owner)是 radio,不用 SegmentedControl"
          >
            <ExampleCaption warn>多選 → CheckboxGroup,SegmentedControl 是互斥</ExampleCaption>
          </TutorialRule>

          <TutorialRule
            title="❌ 選項需要說明文字:用 RadioGroup"
            note="複雜選項(多行文字、icon + 說明)改用 RadioGroup。SegmentedControl 是 compact control,content 受限"
          >
            <ExampleCaption warn>複雜選項 → RadioGroup,SegmentedControl 文字簡短</ExampleCaption>
          </TutorialRule>
        </UsageSection>

        <UsageSection kind="siblings">
          <TutorialRule
            title="❌ 切換的是整塊內容結構:用 Tabs"
            note="若每個「選項」背後是一整塊獨立子頁（有自己的 toolbar / filters / table / actions），那是 Tabs 的規模不是 SegmentedControl。判斷 fallback：把它跟 Input / Button 並排違不違和？違和 → Tabs"
          >
            <ExampleGroup>
              <ExampleCaption>❌ 錯用：這三者各自是完整子頁，不該用 SegmentedControl</ExampleCaption>
              <SegmentedControl defaultValue="orders">
                <SegmentedControlItem value="orders">訂單</SegmentedControlItem>
                <SegmentedControlItem value="customers">顧客</SegmentedControlItem>
                <SegmentedControlItem value="products">產品</SegmentedControlItem>
              </SegmentedControl>
              <ExampleCaption warn>↑ 改用 Tabs</ExampleCaption>
              <Tabs defaultValue="orders">
                <TabsList>
                  <TabsTrigger value="orders">訂單</TabsTrigger>
                  <TabsTrigger value="customers">顧客</TabsTrigger>
                  <TabsTrigger value="products">產品</TabsTrigger>
                </TabsList>
                <TabsContent value="orders" className="text-body text-fg-muted">訂單列表、篩選與批次出貨（各自的 toolbar / table）</TabsContent>
                <TabsContent value="customers" className="text-body text-fg-muted">顧客名單、分群與生命週期價值</TabsContent>
                <TabsContent value="products" className="text-body text-fg-muted">商品目錄、庫存與上下架狀態</TabsContent>
              </Tabs>
            </ExampleGroup>
          </TutorialRule>

          <TutorialRule
            title="❌ 整塊視圖切換:用 Tabs"
            note="大規模 view 切換(各有 header / toolbar)改用 Tabs。小內容切換(chart type、list layout)才用 SegmentedControl。Figma 的頁面切換用 Tabs"
          >
            <ExampleCaption warn>整塊 view → Tabs,SegmentedControl 只切局部內容</ExampleCaption>
          </TutorialRule>
          <TutorialList>
            <li><strong>Pagination</strong> —— 頁碼是位置導覽(頁數會變、可摺疊、數字本身沒有意義);SegmentedControl 是固定幾個有意義的選項</li>
          </TutorialList>
        </UsageSection>
      </TutorialPage>
    )
  },
}


// ── 規模限制 ─────────────────────────────────────────────────────────────────

export const SizeLimits: Story = {
  name: '選項數量規則',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="✅ 2–5 個 item"
        note="最少 2 個（1 個沒有選擇語意），最多 5 個（超過會過窄、label 被截斷）"
      >
        <SegmentedControl defaultValue="a">
          <SegmentedControlItem value="a">日</SegmentedControlItem>
          <SegmentedControlItem value="b">週</SegmentedControlItem>
          <SegmentedControlItem value="c">月</SegmentedControlItem>
          <SegmentedControlItem value="d">年</SegmentedControlItem>
        </SegmentedControl>
      </TutorialRule>

      <TutorialRule
        title="❌ 只有 1 個 item"
        note="沒有選擇語意。單一功能啟用/關閉應該用 Button pressed"
      >
        <SegmentedControl defaultValue="a">
          <SegmentedControlItem value="a">唯一選項</SegmentedControlItem>
        </SegmentedControl>
        <ExampleCaption warn>↑ 改用 &lt;Button pressed&gt;</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 超過 5 個 item"
        note="視覺過窄、label 被截斷。應改用 Select（下拉）或 RadioGroup（垂直排列）"
      >
        <SegmentedControl defaultValue="a">
          <SegmentedControlItem value="a">一月</SegmentedControlItem>
          <SegmentedControlItem value="b">二月</SegmentedControlItem>
          <SegmentedControlItem value="c">三月</SegmentedControlItem>
          <SegmentedControlItem value="d">四月</SegmentedControlItem>
          <SegmentedControlItem value="e">五月</SegmentedControlItem>
          <SegmentedControlItem value="f">六月</SegmentedControlItem>
        </SegmentedControl>
        <ExampleCaption warn>↑ 改用 &lt;Select&gt;</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── iconOnly ─────────────────────────────────────────────────────────────────

export const IconOnlyRule: Story = {
  name: 'iconOnly 是群組層級決策',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="✅ 全組統一 icon-only 或全組帶 label"
        note="SegmentedControl 的 iconOnly 是整組決策，不是個別 item。全 icon 或全 label，不可混搭——混搭會破壞 segmented 對稱感，使用者也無法預測哪個 item 有 tooltip"
      >
        <ExampleGroup>
          <ExampleCaption>✅ 全 icon-only（自動 Tooltip）</ExampleCaption>
          <SegmentedControl defaultValue="list" iconOnly>
            <SegmentedControlItem value="list" startIcon={List} aria-label="清單" />
            <SegmentedControlItem value="board" startIcon={LayoutGrid} aria-label="看板" />
            <SegmentedControlItem value="calendar" startIcon={Calendar} aria-label="行事曆" />
          </SegmentedControl>
        </ExampleGroup>
        <ExampleGroup>
          <ExampleCaption>✅ 全帶 label（可選配 startIcon）</ExampleCaption>
          <SegmentedControl defaultValue="list">
            <SegmentedControlItem value="list" startIcon={List}>清單</SegmentedControlItem>
            <SegmentedControlItem value="board" startIcon={LayoutGrid}>看板</SegmentedControlItem>
            <SegmentedControlItem value="calendar" startIcon={Calendar}>行事曆</SegmentedControlItem>
          </SegmentedControl>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="badge suffix 的使用場景"
        note="通常用於 filter 切換——「全部 12 / 進行中 3 / 已完成 9」。使用者看計數做決策"
      >
        <SegmentedControl defaultValue="all">
          <SegmentedControlItem value="all" badge={<Badge count={12} />}>全部</SegmentedControlItem>
          <SegmentedControlItem value="active" badge={<Badge count={3} />}>進行中</SegmentedControlItem>
          <SegmentedControlItem value="done" badge={<Badge count={9} />}>已完成</SegmentedControlItem>
        </SegmentedControl>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── fullWidth ────────────────────────────────────────────────────────────────

export const FullWidthRule: Story = {
  name: 'fullWidth 的適用情境',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="fullWidth 的判準：跟著容器尺度走，不是跟著 label 長度"
        note="對齊 Apple HIG / Material 3 / Carbon 等世界級定義——segmented 永遠各 item 等寬或全由內容決定，不存在『撐滿但寬度不一』的混血模式。所以 fullWidth 的選擇只看容器大小，不看 label 長度"
      >
        <ExampleGroup>
          <ExampleCaption>✅ 小容器（Dialog / Sheet / 窄 sidebar / Field row）→ fullWidth</ExampleCaption>
          <div className="w-[360px] p-[var(--layout-space-loose)] border border-border rounded-md">
            <div className="text-caption text-fg-muted mb-[var(--layout-space-tight)]">Dialog 內（360px 容器）</div>
            <SegmentedControl defaultValue="day" fullWidth>
              <SegmentedControlItem value="day">日</SegmentedControlItem>
              <SegmentedControlItem value="week">週</SegmentedControlItem>
              <SegmentedControlItem value="month">月</SegmentedControlItem>
            </SegmentedControl>
          </div>
        </ExampleGroup>

        <ExampleGroup>
          <ExampleCaption>✅ 寬容器 / toolbar 並排其他 control → hug（預設）</ExampleCaption>
          {/* 工具列外框(chrome 內距)+ 控件 / 分隔線之間交給 ButtonGroup(action region 8px 槽距的主人,action-bar.spec.md:288-292),
              不手刻槽距(同 tabs.principles「SegmentedControl 在 toolbar 裡跟 Button / Input 並排」) */}
          <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] border border-border rounded-md">
            <ButtonGroup>
              <span className="text-caption text-fg-muted">Toolbar：</span>
              <SegmentedControl defaultValue="day" size="sm">
                <SegmentedControlItem value="day">日</SegmentedControlItem>
                <SegmentedControlItem value="week">週</SegmentedControlItem>
                <SegmentedControlItem value="month">月</SegmentedControlItem>
              </SegmentedControl>
              <ButtonDivider />
              <span className="text-body text-fg-muted">其他工具列元素…</span>
            </ButtonGroup>
          </div>
          <ExampleCaption>↑ 這裡若 fullWidth 會搶走同行其他元素的空間</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="常見誤解：「label 長度差異不能用 fullWidth」是錯的"
        note="SegmentedControl 的 items 永遠等寬（fullWidth 時）或全由內容決定（hug 時），不存在「短 label 周圍空白失衡」的情況——fullWidth 永遠平均分配空間。唯一要擔心的是 label 被截斷，那是 content overflow 問題（該減少選項或改 Select），跟 fullWidth 無關"
      >
        <ExampleGroup>
          <ExampleCaption>✅ 就算 label 長度差異大，fullWidth 仍然等寬，視覺不會失衡</ExampleCaption>
          <div className="w-[480px]">
            <SegmentedControl defaultValue="all" fullWidth>
              <SegmentedControlItem value="all">全部</SegmentedControlItem>
              <SegmentedControlItem value="active">進行中的項目</SegmentedControlItem>
              <SegmentedControlItem value="done">已完成</SegmentedControlItem>
            </SegmentedControl>
          </div>
        </ExampleGroup>
      </TutorialRule>
    </TutorialPage>
  ),
}

