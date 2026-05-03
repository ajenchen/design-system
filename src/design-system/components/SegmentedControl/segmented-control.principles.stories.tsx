// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import {
  AlignLeft, AlignCenter, AlignRight,
  List, LayoutGrid, Calendar,
} from 'lucide-react'
import { SegmentedControl, SegmentedControlItem } from './segmented-control'
import { Tabs, TabsList, TabsTrigger } from '@/design-system/components/Tabs/tabs'
import { Button } from '@/design-system/components/Button/button'
import { Badge } from '@/design-system/components/Badge/badge'

const meta: Meta = {
  title: 'Design System/Components/SegmentedControl/設計原則',
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
    <div className="flex flex-col gap-4">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── UsageGuidance — 何時用 / 何時不用 / vs 近親元件 ─────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [align, setAlign] = useState('left')
    const [period, setPeriod] = useState('week')
    return (
      <div className="flex flex-col gap-12">
        {/* vs 近親元件 — 原 WhatItIs(定位與分界) */}
        <div>
        <Rule
          title="vs 近親元件 — SegmentedControl 是 compact control(可驅動下方內容變化)"
          note="常見誤解：以為 SegmentedControl 只能當 value input（選了就結束）。實際上它可以驅動下方局部內容變化——chart 維度切換、list 排序切換、form 條件欄位切換都是正當用法。關鍵是規模：它切的是局部變體（一個 chart / 一段 form section），不是整個 container"
        >
          <div>
            <Label>✅ 純 value input（值直接送出，不影響下方）</Label>
            <SegmentedControl value={align} onValueChange={setAlign} iconOnly>
              <SegmentedControlItem value="left" startIcon={AlignLeft} aria-label="靠左對齊" />
              <SegmentedControlItem value="center" startIcon={AlignCenter} aria-label="置中對齊" />
              <SegmentedControlItem value="right" startIcon={AlignRight} aria-label="靠右對齊" />
            </SegmentedControl>
          </div>
          <div>
            <Label>✅ 驅動下方 chart 維度變化（局部變體，不是結構）</Label>
            <SegmentedControl value={period} onValueChange={setPeriod}>
              <SegmentedControlItem value="day">日</SegmentedControlItem>
              <SegmentedControlItem value="week">週</SegmentedControlItem>
              <SegmentedControlItem value="month">月</SegmentedControlItem>
            </SegmentedControl>
            <Label>↑ 切換會重載下方 chart 資料，但 chart 還是同一個 chart，不是換一整個 view</Label>
          </div>
        </Rule>

        <Rule
          title="何時不用 / 替代元件 — 切的是整塊 container 結構 → 用 Tabs"
          note="若每個「選項」背後是一整塊獨立子頁（有自己的 toolbar / filters / table / actions），那是 Tabs 的規模不是 SegmentedControl。判斷 fallback：把它跟 Input / Button 並排違不違和？違和 → Tabs"
        >
          <div>
            <Label>❌ 錯用：這三者各自是完整子頁，不該用 SegmentedControl</Label>
            <SegmentedControl defaultValue="orders">
              <SegmentedControlItem value="orders">訂單</SegmentedControlItem>
              <SegmentedControlItem value="customers">顧客</SegmentedControlItem>
              <SegmentedControlItem value="products">產品</SegmentedControlItem>
            </SegmentedControl>
            <Label warn>↑ 改用 Tabs</Label>
            <Tabs defaultValue="orders" className="mt-2">
              <TabsList>
                <TabsTrigger value="orders">訂單</TabsTrigger>
                <TabsTrigger value="customers">顧客</TabsTrigger>
                <TabsTrigger value="products">產品</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </Rule>

        <Rule
          title="何時不用 / 替代元件 — 單一功能 on/off → 用 Button pressed"
          note="1 個 item 的 SegmentedControl 沒有選擇語意。二元狀態用 Button pressed"
        >
          <Button variant="text" pressed>已釘選</Button>
        </Rule>
        </div>

        {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
        <div>
        <Rule
          title="何時不用 / 替代元件 — 5 個以上選項"
          note="選項多 → Select / RadioGroup。SegmentedControl 視覺會過窄，label 被截斷。Stripe filter 若超過 5 選項會用 Select"
        >
          <Label warn>5+ 選項 → Select / RadioGroup,SegmentedControl 空間受限</Label>
        </Rule>

        <Rule
          title="何時不用 / 替代元件 — 多選(checkboxes 語義)"
          note="SegmentedControl 是「選恰好一個」。多選改用 Checkbox 群組。Notion 的權限欄(read / edit / owner)是 radio,不用 SegmentedControl"
        >
          <Label warn>多選 → CheckboxGroup,SegmentedControl 是互斥</Label>
        </Rule>

        <Rule
          title="何時不用 / 替代元件 — 整塊 view 切換"
          note="大規模 view 切換(各有 header / toolbar)改用 Tabs。小內容切換(chart type、list layout)才用 SegmentedControl。Figma 的頁面切換用 Tabs"
        >
          <Label warn>整塊 view → Tabs,SegmentedControl 只切局部內容</Label>
        </Rule>

        <Rule
          title="何時不用 / 替代元件 — 選項需要複雜描述"
          note="複雜選項(多行文字、icon + 說明)改用 RadioGroup。SegmentedControl 是 compact control,content 受限"
        >
          <Label warn>複雜選項 → RadioGroup,SegmentedControl 文字簡短</Label>
        </Rule>
        </div>
      </div>
    )
  },
}

// ── 規模限制 ─────────────────────────────────────────────────────────────────

export const SizeLimits: Story = {
  name: '選項數量規則',
  render: () => (
    <div>
      <Rule
        title="✅ 2–5 個 item"
        note="最少 2 個（1 個沒有選擇語意），最多 5 個（超過會過窄、label 被截斷）"
      >
        <SegmentedControl defaultValue="a">
          <SegmentedControlItem value="a">日</SegmentedControlItem>
          <SegmentedControlItem value="b">週</SegmentedControlItem>
          <SegmentedControlItem value="c">月</SegmentedControlItem>
          <SegmentedControlItem value="d">年</SegmentedControlItem>
        </SegmentedControl>
      </Rule>

      <Rule
        title="❌ 只有 1 個 item"
        note="沒有選擇語意。單一功能啟用/關閉應該用 Button pressed"
      >
        <SegmentedControl defaultValue="a">
          <SegmentedControlItem value="a">唯一選項</SegmentedControlItem>
        </SegmentedControl>
        <Label warn>↑ 改用 &lt;Button pressed&gt;</Label>
      </Rule>

      <Rule
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
        <Label warn>↑ 改用 &lt;Select&gt;</Label>
      </Rule>
    </div>
  ),
}

// ── iconOnly ─────────────────────────────────────────────────────────────────

export const IconOnlyRule: Story = {
  name: 'iconOnly 是 group-level 決策',
  render: () => (
    <div>
      <Rule
        title="✅ 全組統一 icon-only 或全組帶 label"
        note="SegmentedControl 的 iconOnly 是整組決策，不是個別 item。全 icon 或全 label，不可混搭——混搭會破壞 segmented 對稱感，使用者也無法預測哪個 item 有 tooltip"
      >
        <div>
          <Label>✅ 全 icon-only（自動 Tooltip）</Label>
          <SegmentedControl defaultValue="list" iconOnly>
            <SegmentedControlItem value="list" startIcon={List} aria-label="清單" />
            <SegmentedControlItem value="board" startIcon={LayoutGrid} aria-label="看板" />
            <SegmentedControlItem value="calendar" startIcon={Calendar} aria-label="行事曆" />
          </SegmentedControl>
        </div>
        <div>
          <Label>✅ 全帶 label（可選配 startIcon）</Label>
          <SegmentedControl defaultValue="list">
            <SegmentedControlItem value="list" startIcon={List}>清單</SegmentedControlItem>
            <SegmentedControlItem value="board" startIcon={LayoutGrid}>看板</SegmentedControlItem>
            <SegmentedControlItem value="calendar" startIcon={Calendar}>行事曆</SegmentedControlItem>
          </SegmentedControl>
        </div>
      </Rule>

      <Rule
        title="badge suffix 的使用場景"
        note="通常用於 filter 切換——「全部 12 / 進行中 3 / 已完成 9」。使用者看計數做決策"
      >
        <SegmentedControl defaultValue="all">
          <SegmentedControlItem value="all" badge={<Badge count={12} />}>全部</SegmentedControlItem>
          <SegmentedControlItem value="active" badge={<Badge count={3} />}>進行中</SegmentedControlItem>
          <SegmentedControlItem value="done" badge={<Badge count={9} />}>已完成</SegmentedControlItem>
        </SegmentedControl>
      </Rule>
    </div>
  ),
}

// ── fullWidth ────────────────────────────────────────────────────────────────

export const FullWidthRule: Story = {
  name: 'fullWidth 的適用情境',
  render: () => (
    <div>
      <Rule
        title="fullWidth 的判準：跟著容器尺度走，不是跟著 label 長度"
        note="對齊 Apple HIG / Material 3 / Carbon 等世界級定義——segmented 永遠各 item 等寬或全由內容決定，不存在『撐滿但寬度不一』的混血模式。所以 fullWidth 的選擇只看容器大小，不看 label 長度"
      >
        <div>
          <Label>✅ 小容器（Dialog / Sheet / 窄 sidebar / Field row）→ fullWidth</Label>
          <div className="w-[360px] p-4 border border-border rounded-md">
            <div className="text-caption text-fg-muted mb-2">Dialog 內（360px 容器）</div>
            <SegmentedControl defaultValue="day" fullWidth>
              <SegmentedControlItem value="day">日</SegmentedControlItem>
              <SegmentedControlItem value="week">週</SegmentedControlItem>
              <SegmentedControlItem value="month">月</SegmentedControlItem>
            </SegmentedControl>
          </div>
        </div>

        <div>
          <Label>✅ 寬容器 / toolbar 並排其他 control → hug（預設）</Label>
          <div className="flex items-center gap-3 p-2 border border-border rounded-md">
            <span className="text-caption text-fg-muted">Toolbar：</span>
            <SegmentedControl defaultValue="day" size="sm">
              <SegmentedControlItem value="day">日</SegmentedControlItem>
              <SegmentedControlItem value="week">週</SegmentedControlItem>
              <SegmentedControlItem value="month">月</SegmentedControlItem>
            </SegmentedControl>
            <div className="h-5 w-px bg-divider" />
            <span className="text-body text-fg-muted">其他工具列元素…</span>
          </div>
          <Label>↑ 這裡若 fullWidth 會搶走同行其他元素的空間</Label>
        </div>
      </Rule>

      <Rule
        title="常見誤解：「label 長度差異不能用 fullWidth」是錯的"
        note="SegmentedControl 的 items 永遠等寬（fullWidth 時）或全由內容決定（hug 時），不存在「短 label 周圍空白失衡」的情況——fullWidth 永遠平均分配空間。唯一要擔心的是 label 被截斷，那是 content overflow 問題（該減少選項或改 Select），跟 fullWidth 無關"
      >
        <div>
          <Label>✅ 就算 label 長度差異大，fullWidth 仍然等寬，視覺不會失衡</Label>
          <div className="w-[480px]">
            <SegmentedControl defaultValue="all" fullWidth>
              <SegmentedControlItem value="all">全部</SegmentedControlItem>
              <SegmentedControlItem value="active">進行中的項目</SegmentedControlItem>
              <SegmentedControlItem value="done">已完成</SegmentedControlItem>
            </SegmentedControl>
          </div>
        </div>
      </Rule>
    </div>
  ),
}

