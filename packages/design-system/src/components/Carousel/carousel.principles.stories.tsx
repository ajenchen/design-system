// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @principles-rationale: UsageGuidance merges WhenToUse + WhenNotToUse + Vs*Rule into single 使用指引 story per refactor task (2026-04-26)
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  CarouselDots,
} from './carousel'
import { Chip, ChipGroup } from '@/design-system/components/Chip/chip'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/design-system/components/Tabs/tabs'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/Carousel/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, layout: 'wrap' })

// 樣本圖用跟展示頁「首頁主視覺橫幅」同一組城市照片(之前是手寫 hex 漸層色塊 —— 展示頁 2026-05-16 已定案
// 「gradient 抽象 block 教不到真實裁切」改用真實照片,原則頁沒跟上)。文字下方疊同一層由透明到半透明黑的漸層,讓白字壓在照片上讀得到。
const cityPhotos = [
  { label: '京都', image: 'https://picsum.photos/seed/kyoto/960/360' },
  { label: '雷克雅維克', image: 'https://picsum.photos/seed/reykjavik/960/360' },
  { label: '里斯本', image: 'https://picsum.photos/seed/lisbon/960/360' },
  { label: '峇里島', image: 'https://picsum.photos/seed/bali/960/360' },
]
const photoBackground = (image: string) => `linear-gradient(180deg, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.6) 100%), url(${image})`

const PhotoSlide = ({ label, image, height = 160 }: { label: string; image: string; height?: number }) => (
  <div
    // @layout-space-magic-ok: 照片樣本卡文字離邊 20px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值)
    className="rounded-lg overflow-hidden flex items-end p-5 text-on-emphasis bg-cover bg-center"
    style={{ backgroundImage: photoBackground(image), height }}
  >
    <div className="text-body-lg font-bold">{label}</div>
  </div>
)

/** 指示點樣本 = 真的 Carousel + CarouselDots(點距 / 寬度 / 顏色都是元件本身,不手抄 carousel.tsx 的點幾何)。
 *  反例只在「現張那一點」上覆寫成「同寬、只換色」—— 元件本身畫不出反例,覆寫是反例本身。 */
const DotsSample = ({ label, dotsClassName }: { label: string; dotsClassName?: string }) => (
  <Carousel aria-label={label} className="w-48">
    <CarouselContent>
      {cityPhotos.slice(0, 3).map((c) => (
        <CarouselItem key={c.label}>
          <div className="h-16 rounded-md bg-cover bg-center" style={{ backgroundImage: `url(${c.image})` }} />
        </CarouselItem>
      ))}
    </CarouselContent>
    <CarouselDots className={dotsClassName} />
  </Carousel>
)

// 8 張商品總覽(Grid 那一則):同展示頁「商品圖片輪播」那組耳機照片 + 同系列商品
const PRODUCT_PHOTOS = ['headphones-front', 'headphones-side', 'headphones-back', 'headphones-lifestyle', 'earbuds-case', 'speaker-mini', 'charging-dock', 'travel-pouch']

const CATEGORY_OPTIONS = ['全部', '3C 家電', '居家生活', '服飾配件', '美妝保養', '食品飲料', '運動戶外', '圖書文具', '母嬰玩具']
/** 商品分類篩選列:DS ChipGroup 橫向捲動(可以真的勾選) */
function CategoryChipScroll() {
  const [selected, setSelected] = React.useState<string[]>(['全部'])
  return (
    <ChipGroup type="multiple" layout="scroll" aria-label="商品分類" value={selected} onValueChange={(v) => setSelected(v as string[])}>
      {CATEGORY_OPTIONS.map((label) => <Chip key={label} value={label}>{label}</Chip>)}
    </ChipGroup>
  )
}

// ── Stories ──────────────────────────────────────────────────────────────────

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <div className="max-w-prose">
          <p>適合 Carousel 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <TutorialList>
            <li><StoryLink kind="Design System/Components/Carousel/展示" name="首頁主視覺橫幅">首頁 Hero Banner</StoryLink></li>
            <li><StoryLink kind="Design System/Components/Carousel/展示" name="商品圖片輪播">商品圖片輪播</StoryLink></li>
          </TutorialList>
        </div>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 不用 Carousel 做命名視圖切換"
          note="『訂單 / 顧客 / 產品』每塊結構完全不同,該用 Tabs——Carousel 把它們壓成順序性的同類視覺,使用者會困惑為什麼要按順序看。"
        >
          <ExampleCaption warn>
            電商後台「訂單 / 顧客 / 產品」→ 應使用 Tabs;carousel 的順序性暗示錯誤
          </ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 不用 Carousel 做資料表格"
          note="表格需要 columns / sorting / filtering / row selection——這些全是 DataTable 的 affordance,carousel 提供不了。把 rows 包進 CarouselItem 是結構性誤用。"
        >
          <ExampleCaption warn>
            訂單列表應該用 DataTable,不能用 carousel 讓使用者「一次看一筆」
          </ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ 不預設啟用 auto-play"
          note="違反 WCAG 2.2.2 Pause, Stop, Hide——超過 5 秒自動變動的內容必須可暫停。使用者常需要時間閱讀 testimonial 文字、看清產品細節,自動跳過打斷閱讀。Polaris / Material 皆建議不使用 auto-playing carousel。"
        >
          <ExampleCaption warn>
            若專案必須 auto-play,consumer 自行引入 embla-autoplay 並同時提供暫停按鈕,DS 不預設處理
          </ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ Active dot 不要只靠顏色區分"
          note="色弱使用者無法靠色相辨識。本 DS 的 active dot 加寬至 24px(4 倍 inactive 寬度),是 Ant Design / Swiper 的世界級慣例——寬度變化更容易被感知。"
        >
          <div className="flex items-center gap-[var(--layout-space-loose)]">
            {/* @layout-space-magic-ok: 同一列裡「✅/❌ 符號 + 樣本 + 一兩個字」之間 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值) */}
            <div className="flex items-center gap-2">
              <span className="text-caption text-fg-muted">✅</span>
              <DotsSample label="指示點示範:現張加寬" />
              <span className="text-footnote text-fg-muted">寬度變化</span>
            </div>
            {/* @layout-space-magic-ok: 行內 ✅/❌ 標記 ↔ 指示點樣本 ↔ 標籤 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值) */}
            <div className="flex items-center gap-2">
              <span className="text-caption text-error">❌</span>
              {/* 反例:現張那一點改回 6px 寬、只換成資訊藍 —— 只靠顏色區分 */}
              <DotsSample label="指示點反例:只靠顏色" dotsClassName="[&>[aria-current=true]]:w-1.5 [&>[aria-current=true]]:bg-info" />
              <ExampleCaption warn>只靠顏色</ExampleCaption>
            </div>
          </div>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="✅ Carousel — 同類視覺的多張輪播"
          note="每張 slide 是同類內容(同為旅遊推薦目的地圖),無需命名。使用者按順序推進或點 dot 跳張,視覺階層是 content 不是 navigation。"
        >
          <ExampleGroup className="w-[480px]">
            <Carousel opts={{ loop: true }}>
              <CarouselContent>
                {cityPhotos.map((c) => (
                  <CarouselItem key={c.label}>
                    <PhotoSlide label={c.label} image={c.image} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
              <CarouselDots />
            </Carousel>
            <ExampleCaption>4 張同類大圖 · 無個別命名 · 底部 dots 指示進度</ExampleCaption>
          </ExampleGroup>
        </TutorialRule>

        <TutorialRule
          title="✅ Tabs — 互斥切換命名視圖"
          note="每個 tab 有獨立名稱(總覽 / 成員 / 設定),內容結構不同,使用者依名稱直接跳。Tabs 是 section header 等級的 navigation anchor。"
        >
          <ExampleGroup className="w-[480px]">
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">總覽</TabsTrigger>
                <TabsTrigger value="members">成員</TabsTrigger>
                <TabsTrigger value="settings">設定</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <p className="text-body">專案狀態、最近活動、關鍵指標</p>
              </TabsContent>
              <TabsContent value="members">
                <p className="text-body">團隊成員列表、角色權限</p>
              </TabsContent>
              <TabsContent value="settings">
                <p className="text-body">通知、整合、危險區</p>
              </TabsContent>
            </Tabs>
            <ExampleCaption>3 個獨立命名視圖 · 每個 tab 結構與內容不同</ExampleCaption>
          </ExampleGroup>
        </TutorialRule>

        <TutorialRule
          title="✅ ScrollArea / 列表捲動 — 自由瀏覽多項"
          note="使用者想同時看到多個項目、在任意位置停下、掃視後挑選——那是列表的 affordance。用水平 ScrollArea / flex + overflow-x-auto 更符合使用者直覺。"
        >
          {/* 一列放不下的篩選標籤用 DS ChipGroup 的橫向捲動(layout="scroll",共用 horizontal-overflow pattern;之前是原生 overflow-x-auto 裡塞手刻的 emoji 卡片) */}
          <div className="w-[480px]">
            <CategoryChipScroll />
          </div>
          <ExampleCaption>電商後台的商品分類篩選:一列放不下就橫向捲動,不用 carousel 逼使用者一次看一張</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="判斷法"
          note="每個項目都有獨立標題且內容結構不同 → Tabs;每個項目是同類視覺的多張 → Carousel;一眼要看到所有項目 → 都不是,用 Grid。"
        >
          <ExampleCaption>
            商品 4 張角度照 = Carousel(同類視覺)· 電商後台「訂單 / 顧客 / 產品」= Tabs(命名視圖)· 20 張商品列表 = Grid(總覽)
          </ExampleCaption>
        </TutorialRule>
      </UsageSection>
    </TutorialPage>
  ),
}

export const ArrowHoverOnly: Story = {
  name: '箭頭僅滑鼠移過時顯示',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="✅ 預設 hover-only,不干擾主視覺"
        note="Carousel 內容(大圖 / 產品照)是主視覺,常駐箭頭會搶走讀者的視線焦點。Airbnb / Instagram / Netflix 皆採 hover-only——讓圖片自己說話。"
      >
        <ExampleGroup className="w-[480px]">
          <Carousel opts={{ loop: true }}>
            <CarouselContent>
              {cityPhotos.map((c) => (
                <CarouselItem key={c.label}>
                  <PhotoSlide label={c.label} image={c.image} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
            <CarouselDots />
          </Carousel>
          <ExampleCaption>hover 圖片區域才顯示箭頭 · 不 hover 時視覺乾淨</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="✅ 鍵盤 focus 時強制顯示(a11y 例外)"
        note="鍵盤使用者不 hover。若 focus-visible 時仍 opacity-0,將無法得知元素位置——違反焦點可見原則。arrow wrapper 用 has-[:focus-visible]:opacity-100——後代 arrow 以鍵盤取得焦點即強制顯示(機制掛在 wrapper,判準是後代的 :focus-visible)。不用 focus-within:滑鼠點過箭頭也會成立,指標移開後箭頭一直蓋在圖上。"
      >
        <ExampleGroup className="w-[480px]">
          <Carousel>
            <CarouselContent>
              {cityPhotos.slice(0, 3).map((c) => (
                <CarouselItem key={c.label}>
                  <PhotoSlide label={c.label} image={c.image} height={140} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
          <ExampleCaption>用 Tab 鍵 focus 到 arrow 時,即使未 hover 也會顯示(試試:按 Tab)</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="❌ 不要讓 arrow 永遠可見"
        note="常駐 arrow 會把讀者的視覺重量往兩側分流,main content(圖片本身)的衝擊力被削弱。除非 carousel 內容是輔助性的(e.g., carousel 內都是抽象縮圖需要箭頭引導),否則應保留 hover-only。"
      >
        <ExampleGroup className="w-[480px]">
          {/* 反例直接用真的 CarouselPrevious / CarouselNext,跟正例只差「常駐顯示」:定位層的 hover-only 透明度用 wrapperClassName 蓋成常駐
              (之前是手擺的方形 tertiary 鈕,跟真的圓形箭頭差了兩件事,而且點了沒反應) */}
          <Carousel opts={{ loop: true }}>
            <CarouselContent>
              {cityPhotos.map((c) => (
                <CarouselItem key={c.label}>
                  <PhotoSlide label={c.label} image={c.image} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious wrapperClassName="opacity-100" aria-label="上一張(永遠可見的範例)" />
            <CarouselNext wrapperClassName="opacity-100" aria-label="下一張(永遠可見的範例)" />
          </Carousel>
          <ExampleCaption warn>↑ 箭頭永遠可見 · 分散主視覺焦點 · 違反 hover-only 慣例</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const ItemCountLimit: Story = {
  name: '項目數量上限 ~7',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="✅ 3–5 張是 carousel 的甜蜜點"
        note="世界級 SaaS 的 hero carousel 幾乎都 ≤ 5 張(Airbnb 4–5 / Netflix 3 / Stripe 3)。使用者能記住位置,能快速推進,dots 仍能清楚辨識。"
      >
        <ExampleGroup className="w-[480px]">
          <Carousel opts={{ loop: true }}>
            <CarouselContent>
              {cityPhotos.map((c) => (
                <CarouselItem key={c.label}>
                  <PhotoSlide label={c.label} image={c.image} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
            <CarouselDots />
          </Carousel>
          <ExampleCaption>4 張推薦目的地 · 使用者記得住 · dots 清晰</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="❌ 不要把 carousel 當 gallery 用"
        note="超過 7 張,使用者『找不到特定項』——不記得想看的那張在第幾張,要按多次才到。dots 也變得過密難以點擊。應改用 Grid(一眼看全)或 thumbnail + preview pattern。"
      >
        <ExampleGroup className="w-[600px]">
          {/* @layout-space-magic-ok: 相簿縮圖格之間 8px —— 規格沒寫這個值、不由 AI 補進規格(F-S7),沿用已發布值(main 同值) */}
          <div className="grid grid-cols-4 gap-2">
            {PRODUCT_PHOTOS.map((seed) => (
              <div key={seed} className="aspect-square rounded-md bg-cover bg-center" style={{ backgroundImage: `url(https://picsum.photos/seed/${seed}/240/240)` }} />
            ))}
          </div>
          <ExampleCaption>8 張商品總覽用 Grid · 一眼看全 · 可直接點任一項</ExampleCaption>
        </ExampleGroup>
      </TutorialRule>
    </TutorialPage>
  ),
}
