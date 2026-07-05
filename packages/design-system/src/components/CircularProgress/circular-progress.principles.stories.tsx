// @principles-rationale: Merged WhenNotToUse + CircularVsSkeletonRule into a single
// `UsageGuidance` story (3 sections — 何時用 / 何時不用 / vs 近親) per 2026-04-26 user
// mandate. IndeterminateVsDeterminateRule / UsageScenarioRule / SizeMatchContextRule
// kept as separate principles.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Search, Check } from 'lucide-react'
import { CircularProgress } from './circular-progress'
import { Button } from '@/design-system/components/Button/button'
import { Skeleton } from '@/design-system/components/Skeleton/skeleton'
import { Empty } from '@/design-system/components/Empty/empty'
import { Input } from '@/design-system/components/Input/input'

const meta: Meta = {
  title: 'Design System/Components/CircularProgress/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-body-lg font-semibold text-foreground mb-3 pb-1 border-b border-divider">{title}</h2>
    <div>{children}</div>
  </section>
)

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-wrap gap-6 items-start">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── Stories ───────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <p className="text-caption text-fg-muted max-w-[720px] leading-relaxed mb-6">
          CircularProgress 用於「使用者觸發 async 動作後的即時回饋」與「全頁 / 浮層的 loading 訊號」。
          詳細情境 → UsageScenarioRule(Button loading / Inline 表單驗證 / Empty 全頁 overlay)。
        </p>
      </Section>

      <Section title="何時不用 + 替代">
        <Rule
          title="❌ 不用 CircularProgress 當常駐視覺裝飾"
          note="語意鎖「正在載入、正在處理」。永遠旋轉的裝飾會讓 a11y 使用者(螢幕閱讀器)持續收到 loading 通知,也讓視覺使用者無法判斷何時結束"
        >
          <div className="flex items-center gap-2 border border-border rounded-lg p-3 w-72">
            <CircularProgress />
            <span className="text-body">歡迎使用本系統</span>
          </div>
          <Label warn>Welcome banner 裡無限轉的 CircularProgress → 使用者以為系統卡住</Label>
        </Rule>

        <Rule
          title="❌ 不要多個 CircularProgress 同時旋轉"
          note="同一畫面多個 indeterminate 會讓使用者不知道注意力該放哪。通常是結構問題:應該用父層單一 overlay,或改用 Skeleton 描述整個佈局"
        >
          <div className="flex flex-col gap-2 w-72">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 border border-border rounded-md px-3 py-2">
                {/* size=16 = field-inline canonical;此例為反例(不該多個一起轉)。 */}
                <CircularProgress size={16} />
                <span className="text-body text-fg-muted">載入項目 {i + 1}</span>
              </div>
            ))}
          </div>
          <Label warn>四個同時轉 → 改用 Skeleton 做整個列表佔位</Label>
        </Rule>

        <Rule
          title="❌ 不要在本元件外包 overlay 容器做全頁遮罩"
          note="CircularProgress 是純 primitive,不管 overlay / centering / 背景。全頁 loading 一律走 <Empty icon={<CircularProgress/>}/> compose,不要手刻 absolute inset-0 + flex center"
        >
          <Label warn>不要加 color / variant / speed / thickness prop — 本元件單一職責</Label>
        </Rule>

        <Rule
          title="❌ 不要 inline copy Loader2"
          note={'設計系統裡任何 loading 視覺都從 CircularProgress import。自己寫 `<Loader2 className="animate-spin" />` 會造成 icon / animation / a11y 漂移'}
        >
          <Label warn>所有 loading 都走 CircularProgress,不要 inline Loader2</Label>
        </Rule>

        <Rule
          title="❌ 達 100% 不 swap,留在 value=100"
          note="CircularProgress 語義是「進行中」,停在 100% 跟「完成」語義衝突,使用者看到「滿的 circle」會困惑「還在跑嗎?」。世界級慣例(Gmail / Dropbox / Google Drive):上傳完成即消失,swap 為 ✓ icon / 實際內容 / Empty。本 DS **不提供** success / error variant——consumer 端替換整個元件,不在 CircularProgress 內做狀態 morph"
        >
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <CircularProgress value={100} size={24} />
              <Label warn>❌ 穩態停留 100% → 使用者困惑</Label>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="inline-flex items-center gap-2 text-success">
                <Check size={16} aria-hidden />
                <span className="text-body">已完成</span>
              </div>
              <Label>✅ Swap 為 Check icon + label / 直接呈現該呈現的內容</Label>
            </div>
          </div>
        </Rule>
      </Section>

      <Section title="vs 近親 — CircularProgress vs Skeleton">
        <Rule
          title="CircularProgress — 行為回饋(不可預期時長、不知佈局)"
          note="Button 送出中、API 等待、upload 進行中——沒有「資料形狀」可以佔位,只是告訴使用者「正在處理,請稍候」"
        >
          <Button variant="primary" loading>處理付款中</Button>
          <Label>Stripe 結帳:只需要「在做事」的訊號,不需要佔位</Label>
        </Rule>

        <Rule
          title="Skeleton — 內容佔位(佈局已知、等資料填入)"
          note="List / table / card grid 初次載入——佈局結構確定,只差資料。用 Skeleton 讓版面先定型,避免資料回來時跳動"
        >
          <div className="flex items-center gap-3 w-72 border border-border rounded-lg p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex flex-col gap-2 flex-1">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Label>Linear 成員列表:佈局已定,等資料填入</Label>
        </Rule>

        <Rule
          title="判準"
          note="要描述「佈局」還是「行為」?描述佈局 → Skeleton;描述行為 → CircularProgress"
        >
          <Label>能畫出最終樣貌 → Skeleton</Label>
          <Label>只知道「在進行」 → CircularProgress(indeterminate)</Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const IndeterminateVsDeterminateRule: Story = {
  name: '不確定 vs 確定進度',
  render: () => (
    <div>
      <Rule
        title="不知道時長 → 不傳 value(indeterminate);能量化進度 → 傳 value(determinate)"
        note="CircularProgress 兩態合一(Material / Chakra 流派)。判斷法:consumer 能告訴使用者「完成了 X%」嗎?能 → determinate、不能 → indeterminate。選錯會讓使用者一直盯著 0% 以為壞掉,或看著旋轉以為是裝飾。"
      >
        <div className="flex flex-col items-center gap-2">
          <CircularProgress aria-label="等待第三方驗證" />
          <Label>✅ 第三方金流驗證:不知道要多久 → 不傳 value</Label>
        </div>
        <div className="flex flex-col items-center gap-2">
          <CircularProgress value={65} affix="value" />
          <Label>✅ 檔案上傳:bytes 已知 → 傳 value={'{N}'}</Label>
        </div>
      </Rule>

      <Rule
        title="Determinate 若無法量化會變假進度"
        note="value 永遠停在 0% 或隨機亂跳會讓使用者懷疑 app 壞掉。若操作本質不可量化,維持 indeterminate 到底,不要硬傳 value 假裝。"
      >
        <div className="flex flex-col items-center gap-2">
          <CircularProgress value={0} />
          <Label warn>❌ 生成報表中卻永遠卡 0% → 改用 indeterminate(不傳 value)</Label>
        </div>
      </Rule>
    </div>
  ),
}

export const UsageScenarioRule: Story = {
  name: '使用情境',
  render: () => (
    <div>
      <Rule
        title="✅ Button loading — 使用者觸發動作後的即時回饋"
        note="表單送出、API 呼叫、執行動作中,Button 的 loading prop 內部自動渲染 CircularProgress。是最常見的消費場景"
      >
        <Button variant="primary" loading>送出訂單</Button>
        <Button variant="secondary" loading>儲存變更</Button>
        <Label>按鈕按下後的即時回饋,告訴使用者「已收到,在處理」</Label>
      </Rule>

      <Rule
        title="✅ Inline 表單驗證 / async search"
        note="輸入後等待伺服器驗證或搜尋結果時,Input 的 loading prop 內部自動在 endAction 塞 16px CircularProgress。視覺干擾最小,使用者可繼續輸入"
      >
        <Input
          startIcon={Search}
          loading
          defaultValue="cq@"
          placeholder="驗證 email 唯一性..."
          className="w-72"
        />
        <Label>驗證 email 唯一性(GitHub 註冊場景)</Label>
      </Rule>

      <Rule
        title="✅ 延遲加載浮層 / 全頁 overlay — 用 Empty compose"
        note="切換 workspace / 載入 dashboard 等需要阻擋互動的場景,走 Empty compose:<Empty icon={<CircularProgress size={48} />} title=... description=... />。不要自己手刻 absolute overlay"
      >
        {/* 2026-07-04 audit:改消費 <Empty> compose(原手刻垂直堆疊與本則自教規則+spec Do 矛盾) */}
        <div className="border border-border rounded-lg w-96 h-40 flex items-center justify-center bg-muted/40">
          <Empty
            icon={<CircularProgress size={48} aria-label="載入 dashboard" />}
            title="載入 dashboard 中"
            description="Notion workspace 切換、Stripe dashboard 初載"
          />
        </div>
      </Rule>
    </div>
  ),
}

export const SizeMatchContextRule: Story = {
  name: '尺寸對應使用情境',
  render: () => (
    <div>
      <Rule
        title="16px — Button 內、Field endAction、Tag 內(inline 小空間)"
        note="inline 元素內部,尺寸對齊旁邊的 text / icon。不能更大,會撐破容器。多數情境由 Button / Input 內部程式化決定(consumer 不需手傳)"
      >
        <Button variant="tertiary" loading>送出</Button>
        <Input
          loading
          defaultValue="驗證中..."
          placeholder="驗證 email..."
          className="w-60"
        />
      </Rule>

      <Rule
        title="24px(預設)— row primitive 的 loading footer、card 內 inline loading"
        note="中等尺寸,放在 row / card 內容區,視覺重量足夠吸引注意但不喧賓奪主"
      >
        <div className="flex items-center justify-center gap-2 border border-border rounded-lg p-4 w-72">
          <CircularProgress size={24} />
          <span className="text-body text-fg-muted">載入更多留言...</span>
        </div>
        <Label>Slack channel 載入更多訊息的 footer</Label>
      </Rule>
    </div>
  ),
}
