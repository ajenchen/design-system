// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: UsageGuidance merges WhenToUse + WhenNotToUse + Vs*Rule into single 使用指引 story per refactor task (2026-04-26)
import { ChevronLeft, ChevronRight } from 'lucide-react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  CarouselDots,
} from './carousel'
import { Button } from '@/design-system/components/Button/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/components/Tabs/tabs'

const meta: Meta = {
  title: 'Design System/Components/Carousel/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers(對齊 button.principles.stories.tsx)─────────────────────────────

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

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-heading-3 font-bold text-foreground mb-4 pb-2 border-b border-border">{title}</h2>
    {children}
  </section>
)

const Gradient = ({ label, gradient, height = 160 }: { label: string; gradient: string; height?: number }) => (
  <div
    className="rounded-lg overflow-hidden flex items-end p-5 text-white"
    style={{ background: gradient, height }}
  >
    <div className="text-body-lg font-bold">{label}</div>
  </div>
)

const cityGradients = [
  { label: '京都',       g: 'linear-gradient(135deg, #c4452a 0%, #f28b3a 60%, #ffd37a 100%)' },
  { label: '雷克雅維克', g: 'linear-gradient(135deg, #1b3b6f 0%, #3d7ea6 60%, #a8e0ff 100%)' },
  { label: '里斯本',     g: 'linear-gradient(135deg, #e87d5a 0%, #f4c27a 50%, #f7e2b0 100%)' },
  { label: '峇里島',     g: 'linear-gradient(135deg, #1d6a5a 0%, #4db893 60%, #c7ebd9 100%)' },
]

// ── Stories ──────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose mb-8">
          <p>適合 Carousel 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li><LinkTo kind="Design System/Components/Carousel/展示" name="首頁 Hero Banner"><span className="text-primary hover:underline font-medium cursor-pointer">首頁 Hero Banner</span></LinkTo></li>
            <li><LinkTo kind="Design System/Components/Carousel/展示" name="商品圖片輪播"><span className="text-primary hover:underline font-medium cursor-pointer">商品圖片輪播</span></LinkTo></li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親 段)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代方案">
        <Rule
          title="❌ 不用 Carousel 做命名視圖切換"
          note="『訂單 / 顧客 / 產品』每塊結構完全不同,該用 Tabs——Carousel 把它們壓成順序性的同類視覺,使用者會困惑為什麼要按順序看。"
        >
          <Label warn>
            電商後台「訂單 / 顧客 / 產品」→ 應使用 Tabs;carousel 的順序性暗示錯誤
          </Label>
        </Rule>

        <Rule
          title="❌ 不用 Carousel 做資料表格"
          note="表格需要 columns / sorting / filtering / row selection——這些全是 DataTable 的 affordance,carousel 提供不了。把 rows 包進 CarouselItem 是結構性誤用。"
        >
          <Label warn>
            訂單列表應該用 DataTable,不能用 carousel 讓使用者「一次看一筆」
          </Label>
        </Rule>

        <Rule
          title="❌ 不預設啟用 auto-play"
          note="違反 WCAG 2.2.2 Pause, Stop, Hide——超過 5 秒自動變動的內容必須可暫停。使用者常需要時間閱讀 testimonial 文字、看清產品細節,自動跳過打斷閱讀。Polaris / Material 皆建議不使用 auto-playing carousel。"
        >
          <Label warn>
            若專案必須 auto-play,consumer 自行引入 embla-autoplay 並**同時提供暫停按鈕**,spec 不預設處理
          </Label>
        </Rule>

        <Rule
          title="❌ Active dot 不要只靠顏色區分"
          note="色弱使用者無法靠色相辨識。本 DS 的 active dot 加寬至 24px(4 倍 inactive 寬度),是 Ant Design / Swiper 的世界級慣例——寬度變化更容易被感知。"
        >
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-caption text-fg-muted">✅</span>
              <div className="bg-foreground px-4 py-3 rounded-md flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                <span className="w-6 h-1.5 rounded-full bg-white" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
              </div>
              <span className="text-footnote text-fg-muted">寬度變化</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-caption text-error">❌</span>
              <div className="bg-foreground px-4 py-3 rounded-md flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                <span className="w-1.5 h-1.5 rounded-full bg-info" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
              </div>
              <Label warn>只靠顏色</Label>
            </div>
          </div>
        </Rule>
      </Section>

      <Section title="vs 近親元件">
        <Rule
          title="✅ Carousel — 同類視覺的多張輪播"
          note="每張 slide 是同類內容(同為旅遊推薦目的地圖),無需命名。使用者按順序推進或點 dot 跳張,視覺階層是 content 不是 navigation。"
        >
          <div className="w-[480px]">
            <Carousel opts={{ loop: true }}>
              <CarouselContent>
                {cityGradients.map((c) => (
                  <CarouselItem key={c.label}>
                    <Gradient label={c.label} gradient={c.g} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
              <CarouselDots />
            </Carousel>
            <Label>4 張同類大圖 · 無個別命名 · 底部 dots 指示進度</Label>
          </div>
        </Rule>

        <Rule
          title="✅ Tabs — 互斥切換命名視圖"
          note="每個 tab 有獨立名稱(總覽 / 成員 / 設定),內容結構不同,使用者依名稱直接跳。Tabs 是 section header 等級的 navigation anchor。"
        >
          <div className="w-[480px]">
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">總覽</TabsTrigger>
                <TabsTrigger value="members">成員</TabsTrigger>
                <TabsTrigger value="settings">設定</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="pt-4">
                <p className="text-body">專案狀態、最近活動、關鍵指標</p>
              </TabsContent>
              <TabsContent value="members" className="pt-4">
                <p className="text-body">團隊成員列表、角色權限</p>
              </TabsContent>
              <TabsContent value="settings" className="pt-4">
                <p className="text-body">通知、整合、危險區</p>
              </TabsContent>
            </Tabs>
            <Label>3 個獨立命名視圖 · 每個 tab 結構與內容不同</Label>
          </div>
        </Rule>

        <Rule
          title="✅ ScrollArea / 列表捲動 — 自由瀏覽多項"
          note="使用者想同時看到多個項目、在任意位置停下、掃視後挑選——那是列表的 affordance。用水平 ScrollArea / flex + overflow-x-auto 更符合使用者直覺。"
        >
          <div className="w-[480px] flex gap-3 overflow-x-auto pb-2">
            {['🍜 拉麵', '🍕 披薩', '🍔 漢堡', '🥗 沙拉', '🌮 墨西哥捲', '🍣 壽司', '🍛 咖哩'].map((t) => (
              <div key={t} className="shrink-0 w-28 h-20 rounded-lg border border-border bg-surface-raised flex items-center justify-center text-body">
                {t}
              </div>
            ))}
          </div>
          <Label>聊天室的「常用食物標籤」應用自由捲動,不用 carousel 逼使用者一次看一張</Label>
        </Rule>

        <Rule
          title="判斷法"
          note="每個項目都有獨立標題且內容結構不同 → Tabs;每個項目是同類視覺的多張 → Carousel;一眼要看到所有項目 → 都不是,用 Grid。"
        >
          <Label>
            商品 4 張角度照 = Carousel(同類視覺)· 電商後台「訂單 / 顧客 / 產品」= Tabs(命名視圖)· 20 張商品列表 = Grid(總覽)
          </Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const ArrowHoverOnly: Story = {
  name: 'Arrow hover-only 顯示',
  render: () => (
    <div>
      <Rule
        title="✅ 預設 hover-only,不干擾主視覺"
        note="Carousel 內容(大圖 / 產品照)是主視覺,常駐箭頭會搶走讀者的視線焦點。Airbnb / Instagram / Netflix 皆採 hover-only——讓圖片自己說話。"
      >
        <div className="w-[480px]">
          <Carousel opts={{ loop: true }}>
            <CarouselContent>
              {cityGradients.map((c) => (
                <CarouselItem key={c.label}>
                  <Gradient label={c.label} gradient={c.g} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
            <CarouselDots />
          </Carousel>
          <Label>hover 圖片區域才顯示箭頭 · 不 hover 時視覺乾淨</Label>
        </div>
      </Rule>

      <Rule
        title="✅ 鍵盤 focus 時強制顯示(a11y 例外)"
        note="鍵盤使用者不 hover。若 focus-visible 時仍 opacity-0,將無法得知元素位置——違反焦點可見原則。arrow 在 :focus-visible 強制 opacity-100。"
      >
        <div className="w-[480px]">
          <Carousel>
            <CarouselContent>
              {cityGradients.slice(0, 3).map((c) => (
                <CarouselItem key={c.label}>
                  <Gradient label={c.label} gradient={c.g} height={140} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
          <Label>用 Tab 鍵 focus 到 arrow 時,即使未 hover 也會顯示(試試:按 Tab)</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 不要讓 arrow 永遠可見"
        note="常駐 arrow 會把讀者的視覺重量往兩側分流,main content(圖片本身)的衝擊力被削弱。除非 carousel 內容是輔助性的(e.g., carousel 內都是抽象縮圖需要箭頭引導),否則應保留 hover-only。"
      >
        <div className="w-[480px]">
          <div className="relative h-[160px] rounded-lg overflow-hidden" style={{ background: cityGradients[0].g }}>
            <div className="absolute inset-0 flex items-end p-5 text-white">
              <div className="text-body-lg font-bold">京都</div>
            </div>
            {/* 示範「永遠可見」anti-pattern 時,仍使用 DS Button 維持視覺規格一致;
                關鍵差異在 wrapper 沒有 opacity-0 + group-hover 的 fade 邏輯 */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <Button variant="tertiary" size="md" iconOnly startIcon={ChevronLeft} aria-label="上一張(永遠可見的範例)" />
            </div>
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Button variant="tertiary" size="md" iconOnly startIcon={ChevronRight} aria-label="下一張(永遠可見的範例)" />
            </div>
          </div>
          <Label warn>↑ 箭頭永遠可見 · 分散主視覺焦點 · 違反 hover-only 慣例</Label>
        </div>
      </Rule>
    </div>
  ),
}

export const ItemCountLimit: Story = {
  name: '項目數量上限 ~7',
  render: () => (
    <div>
      <Rule
        title="✅ 3–5 張是 carousel 的甜蜜點"
        note="世界級 SaaS 的 hero carousel 幾乎都 ≤ 5 張(Airbnb 4–5 / Netflix 3 / Stripe 3)。使用者能記住位置,能快速推進,dots 仍能清楚辨識。"
      >
        <div className="w-[480px]">
          <Carousel opts={{ loop: true }}>
            <CarouselContent>
              {cityGradients.map((c) => (
                <CarouselItem key={c.label}>
                  <Gradient label={c.label} gradient={c.g} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
            <CarouselDots />
          </Carousel>
          <Label>4 張推薦目的地 · 使用者記得住 · dots 清晰</Label>
        </div>
      </Rule>

      <Rule
        title="❌ 不要把 carousel 當 gallery 用"
        note="超過 7 張,使用者『找不到特定項』——不記得想看的那張在第幾張,要按多次才到。dots 也變得過密難以點擊。應改用 Grid(一眼看全)或 thumbnail + preview pattern。"
      >
        <div className="w-[600px]">
          <div className="grid grid-cols-4 gap-2">
            {[
              'linear-gradient(135deg,#c4452a,#f28b3a)',
              'linear-gradient(135deg,#1b3b6f,#3d7ea6)',
              'linear-gradient(135deg,#e87d5a,#f4c27a)',
              'linear-gradient(135deg,#1d6a5a,#4db893)',
              'linear-gradient(135deg,#a8367a,#e45b9a)',
              'linear-gradient(135deg,#5a3e8f,#8a6cc2)',
              'linear-gradient(135deg,#2a7a5a,#5ab892)',
              'linear-gradient(135deg,#c27a1a,#e5b35a)',
            ].map((g, i) => (
              <div key={i} className="aspect-square rounded-md" style={{ background: g }} />
            ))}
          </div>
          <Label>8 張商品總覽用 Grid · 一眼看全 · 可直接點任一項</Label>
        </div>
      </Rule>
    </div>
  ),
}
