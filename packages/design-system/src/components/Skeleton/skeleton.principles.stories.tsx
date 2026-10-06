// @principles-rationale: UsageGuidance merges WhenToUse + WhenNotToUse + Vs*Rule into single 使用指引 story per refactor task (2026-04-26)
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Skeleton } from './skeleton'
import { CircularProgress } from '@/design-system/components/CircularProgress/circular-progress'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { CaptionedExamples, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/Skeleton/設計原則',
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
  <div className="mb-[var(--layout-space-loose)]">
    <h3 className="text-h6 font-semibold text-foreground mb-[var(--layout-space-tight)]">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-[var(--layout-space-tight)] max-w-[720px]">{note}</p>}
    <CaptionedExamples caption={Label} layout="wrap">{children}</CaptionedExamples>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-[var(--layout-space-loose)]">
    {/* @layout-space-magic-ok: 標題字與底線的距離(同一個標題元素的 micro)(layoutSpace.spec.md:166 micro) */}
    <h2 className="text-h3 font-bold text-foreground mb-[var(--layout-space-tight)] pb-2 border-b border-border">{title}</h2>
    {children}
  </section>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="max-w-prose mb-[var(--layout-space-loose)]">
          <p>適合 Skeleton 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          {/* @layout-space-magic-ok: 連結清單:同質清單項列距(layoutSpace.spec.md:165 同質清單列) */}
          <ul className="space-y-1">
            <li><LinkTo kind="Design System/Components/Skeleton/展示" name="個人資料卡載入"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">個人資料卡載入</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Skeleton/展示" name="任務列表載入"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">任務列表載入</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Skeleton/展示" name="表格列載入"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">表格列載入</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Skeleton/展示" name="文件載入"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">文件載入</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Skeleton/展示" name="卡片網格載入"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">卡片網格載入</span></LinkTo></li>
          </ul>
          <p className="text-fg-muted mt-[var(--layout-space-tight)]">判斷不確定時:先確認資料回來後的佈局是否已知;若不符合載入佔位的情境,改用近親元件(見下方「vs 近親元件」段)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代方案">
        <Rule
          title="❌ 不用 Skeleton 做裝飾"
          note="Skeleton 是 loading 語意,不是視覺裝飾元件。把它當灰色色塊用會混淆使用者對「載入中」的認知"
        >
          {/* @layout-space-magic-ok: 灰色圓點 ↔ 旁邊的說明文字(同一列 micro)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-3 border border-border rounded-lg p-[var(--layout-space-loose)] w-72">
            <Skeleton className="h-8 w-8 rounded-full" />
            <span className="text-body">分隔用的灰色圓點</span>
          </div>
          <Label warn>Skeleton 不是 decoration — 裝飾用 bg-muted div,不要用 Skeleton</Label>
        </Rule>

        <Rule
          title="❌ 不要 nested skeleton"
          note="Skeleton 裡包 Skeleton 視覺上會疊加 animation,造成閃爍感。如果需要複合結構,用多個並列 Skeleton 各自模擬一塊"
        >
          <div className="border border-border rounded-lg p-[var(--layout-space-loose)] w-72">
            {/* @story-counter-example: ❌ 反例:巢狀 Skeleton 本身 —— 外層 Skeleton 當容器加內距 p 12px,本則教的正是不要 nested skeleton */}
            <Skeleton className="h-20 w-full p-3">
              <Skeleton className="h-4 w-1/2" />
            </Skeleton>
          </div>
          <Label warn>外層 Skeleton 包內層 Skeleton → 動畫疊加閃爍</Label>
        </Rule>

        <Rule
          title="❌ 不要 mix 資料跟 skeleton 在同一 row"
          note="同一個 row 裡一半顯示真實資料、一半顯示 skeleton,視覺上會像「半載入」狀態,使用者不知道這筆資料到底算不算讀完。Row 是原子單位,要嘛全 skeleton 要嘛全真實"
        >
          {/* @layout-space-magic-ok: 真 Avatar ↔ 文字區 = 列的 prefix ↔ content,載入後是頁面列表列 gap 12px(item-anatomy.spec.md:1031)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-3 border border-border rounded-lg p-[var(--layout-space-loose)] w-72">
            <Avatar alt="陳小明" size={40} color="blue" />
            <div className="flex flex-col gap-[var(--item-gap-label-desc-reading)] flex-1">
              <span className="text-body">陳小明</span>
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Label warn>Avatar + name 已載,email 還在 skeleton → 使用者困惑「這筆好了沒」</Label>
        </Rule>

        <Rule
          title="❌ 不用 Skeleton 取代 Empty 或 Error"
          note="確定沒有資料 → Empty;載入失敗 → Alert + 重試按鈕。Skeleton 的語意是「還沒來」,不是「沒有」也不是「壞了」"
        >
          <Label warn>Skeleton 無錯誤語意 → 使用者會一直等,不會重試</Label>
        </Rule>
      </Section>

      <Section title="vs 近親元件">
        <Rule
          title="Skeleton — 佈局已知,等資料填入即成最終樣貌"
          note="初次載入 list / table / card grid 時使用。Skeleton 的形狀貼近真實內容,資料回來後版面不跳動,使用者預期不被打破"
        >
          <div className="flex flex-col w-72 border border-border rounded-lg p-[var(--layout-space-loose)]">
            {/* @layout-space-magic-ok: 頭像骨架 ↔ 文字區 = 列的 prefix ↔ content,載入後是頁面列表列 gap 12px(item-anatomy.spec.md:1031)(layoutSpace.spec.md:166 micro) */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              {/* @layout-space-magic-ok: 骨架文字行之間(同一文字區)(layoutSpace.spec.md:166 micro) */}
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          </div>
          <Label>Linear 專案成員列表:佈局固定,只等資料填入</Label>
        </Rule>

        <Rule
          title="CircularProgress — 不可預期時長 / 不知佈局的操作"
          note="Button loading、form submitting、小區塊 inline 等待——當「會出現什麼」不確定,或根本不是內容佔位而是行為回饋時,用 CircularProgress(indeterminate)"
        >
          {/* @layout-space-magic-ok: 進度圖示 ↔ 狀態文字(同一列 micro)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-2 border border-border rounded-md px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] w-72">
            <CircularProgress />
            <span className="text-body text-fg-muted">正在送出訂單...</span>
          </div>
          <Label>Stripe 結帳送出中:沒有「佈局」可佔位,只是行為回饋</Label>
        </Rule>

        <Rule
          title="判準——先問「佈局已知嗎?」"
          note="能描述「資料回來後會是什麼樣」→ Skeleton;只知道「有事情在進行」→ CircularProgress"
        >
          <Label>佈局已知 → Skeleton(內容佔位)</Label>
          <Label>佈局未知 → CircularProgress(行為回饋)</Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const ShapeMatchRule: Story = {
  name: '形狀貼合真實內容',
  render: () => (
    <div>
      <Rule
        title="✅ 形狀模擬最終內容"
        note="avatar 圓形對應圓形頭像、text 行寬度對應真實文字長度、title 高度對應標題字級。資料回來後使用者不會感到「跳版」"
      >
        {/* 2026-06-11:改為「載入中 vs 載入完成」對照(原單卡 demo 與使用指引「vs 近親元件」段重複)。 */}
        <ExampleGroup>
          {/* @layout-space-magic-ok: 頭像骨架 ↔ 文字區 = 列的 prefix ↔ content,載入後是頁面列表列 gap 12px(item-anatomy.spec.md:1031)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-3 border border-border rounded-lg p-[var(--layout-space-loose)] w-72">
            <Skeleton className="h-10 w-10 rounded-full" />
            {/* @layout-space-magic-ok: 骨架文字行之間(同一文字區)(layoutSpace.spec.md:166 micro) */}
            <div className="flex flex-col gap-2 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Label>載入中 — 圓形對應頭像、兩行對應名字 + 最新訊息</Label>
        </ExampleGroup>
        <ExampleGroup>
          {/* @layout-space-magic-ok: 真 Avatar ↔ 文字區 = 列的 prefix ↔ content,載入後是頁面列表列 gap 12px(item-anatomy.spec.md:1031)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-3 border border-border rounded-lg p-[var(--layout-space-loose)] w-72">
            <Avatar alt="林雅婷" size={40} color="blue" className="shrink-0" />
            <div className="flex flex-col gap-[var(--item-gap-label-desc-reading)] flex-1 min-w-0">
              <span className="text-body font-medium">林雅婷</span>
              <span className="text-caption text-fg-secondary truncate">已傳送設計稿連結,請查收</span>
            </div>
          </div>
          <Label>載入完成 — 形狀一一對應,版面不跳動(Slack DM 列表)</Label>
        </ExampleGroup>
      </Rule>

      <Rule
        title="❌ 過度代表——塞太多 skeleton 讓畫面看起來「很重」"
        note="skeleton 密度超過真實內容會讓使用者以為「資料很多」,實際回來卻很少,體感是畫面縮水"
      >
        {/* @layout-space-magic-ok: 七行骨架行之間(同一文字區的行距)(layoutSpace.spec.md:166 micro) */}
        <div className="flex flex-col gap-2 border border-border rounded-lg p-[var(--layout-space-loose)] w-72">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
        <Label warn>七行等寬色塊 → 真實內容只有兩行,資料回來版面縮水</Label>
      </Rule>

      <Rule
        title="❌ 不代表——形狀完全不對應真實內容"
        note="拿方形佔位代表圓形 avatar、拿短色塊代表段落,資料回來後版面大幅跳動"
      >
        {/* @layout-space-magic-ok: 方形色塊 ↔ 短色塊(反例的兩個佔位,同一列 micro)(layoutSpace.spec.md:166 micro) */}
        <div className="flex items-center gap-3 border border-border rounded-lg p-[var(--layout-space-loose)] w-72">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-4 w-8" />
        </div>
        <Label warn>方形色塊無法代表圓形頭像,短色塊無法代表姓名欄位</Label>
      </Rule>
    </div>
  ),
}

export const DurationRule: Story = {
  name: '顯示時間短暫',
  render: () => (
    <div>
      <Rule
        title="✅ 短暫顯示(1–3s)——初次載入完成即替換為真實內容"
        note="Skeleton 的語意是「資料很快會來」。短時間出現後被真實內容取代,是它設計上最順暢的樣子"
      >
        {/* @layout-space-magic-ok: 標題骨架 ↔ 副標骨架(同一文字區的行距)(layoutSpace.spec.md:166 micro) */}
        <div className="flex flex-col gap-2 border border-border rounded-lg p-[var(--layout-space-loose)] w-72">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <Label>Notion 頁面載入:&lt; 2s 完成,Skeleton 合理</Label>
      </Rule>

      <Rule
        title="❌ 長時間(&gt; 10s)一直 Skeleton——使用者懷疑卡住"
        note="長時間靜態 skeleton 會讓使用者以為網路斷線或系統卡住。此時改用 CircularProgress + 進度文案(「處理中,大約 10 秒」),或 ProgressBar"
      >
        {/* @layout-space-magic-ok: 進度圖示 ↔ 狀態文字(同一列 micro)(layoutSpace.spec.md:166 micro) */}
        <div className="flex items-center gap-2 border border-border rounded-md px-[var(--layout-space-loose)] py-[var(--layout-space-tight)] w-72">
          <CircularProgress />
          <span className="text-body text-fg-muted">分析中,這可能需要一分鐘...</span>
        </div>
        <Label>&gt; 10s 的長工作 → 改用 CircularProgress + 進度文字,告知使用者仍在處理</Label>
      </Rule>
    </div>
  ),
}
