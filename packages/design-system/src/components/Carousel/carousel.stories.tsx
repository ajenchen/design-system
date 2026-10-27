// @story-history: Carousel 是 composite UX showcase(Hero banner + Product gallery 兩個 hero scenario)
// 而非 prop-variant control;互動 state 由 embla 內建處理(arrow visibility hover-revealed / dots active state)
// 在 hero story 內已 demonstrate。Trait gap pre-existing(非本 audit fix scope),allowlist for image-content fix。
import type { Meta } from '@storybook/react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  CarouselDots,
} from './carousel'
import { Button } from '@/design-system/components/Button/button'
import { AspectRatio } from '@/design-system/components/AspectRatio/aspect-ratio'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

const meta: Meta = {
  title: 'Design System/Components/Carousel/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '讓一組同類內容在有限區域中水平逐頁瀏覽，提供箭頭與頁面指示。適合圖片集、產品卡或宣傳內容；必須同時比較的資訊不可藏進 Carousel。' } },
  },
}
export default meta

// ── Real-content data ────────────────────────────────────────────────────────

// 2026-05-16 audit codex Round 6:用真實 photo URL 取代 gradient color block — story 要教 carousel
// 真實裁切 / 內容裁切 / 視覺層次,gradient 抽象 block 教不到(對齊 Polaris / Carbon stories 用 stock photo)。
// Picsum.photos 提供 stable seeded photos(免登入 / 免 API key / 跨環境一致)。
const heroBanners = [
  { city: '京都', tagline: '秋日楓紅限定行程', image: 'https://picsum.photos/seed/kyoto/960/360' },
  { city: '雷克雅維克', tagline: '極光季早鳥 8 折', image: 'https://picsum.photos/seed/reykjavik/960/360' },
  { city: '里斯本', tagline: '歐洲西岸 7 日自由行', image: 'https://picsum.photos/seed/lisbon/960/360' },
  { city: '峇里島', tagline: '熱帶度假村 · 含機加酒', image: 'https://picsum.photos/seed/bali/960/360' },
]

// label = 這張是哪個角度;給讀屏的圖片名稱用(畫面上不再疊手刻的角度標籤膠囊,張數由底下的指示點表達)
const productImages = [
  { label: '正面', image: 'https://picsum.photos/seed/headphones-front/480/480' },
  { label: '側面', image: 'https://picsum.photos/seed/headphones-side/480/480' },
  { label: '背面', image: 'https://picsum.photos/seed/headphones-back/480/480' },
  { label: '情境', image: 'https://picsum.photos/seed/headphones-lifestyle/480/480' },
]


// ── Stories ─────────────────────────────────────────────────────────────────

// 兩則的情境說明放 docs(之前印在畫布上方);圖上的字用 on-emphasis(壓在照片 + 深色漸層上的白字),不用 text-white / opacity-*
export const HomepageHeroBanner = {
  name: '首頁主視覺橫幅',
  parameters: {
    docs: { description: { story: 'Airbnb / Booking 這類首頁的主視覺:4 張城市主題大圖,滑鼠移上去才出現左右箭頭,底部的指示點表示目前是第幾張。' } },
  },
  render: () => (
    <div className="max-w-[960px]">
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          {heroBanners.map((b) => (
            <CarouselItem key={b.city}>
              <div
                // @layout-space-magic-ok: 360px 高主視覺圖上文字離圖邊 32px 是構圖留白(視覺平衡),不是容器 macro 間距(layoutSpace.spec.md:167 視覺平衡)
                className="relative h-[360px] rounded-lg overflow-hidden flex items-end p-8 bg-cover bg-center"
                style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.6) 100%), url(${b.image})` }}
              >
                {/* @layout-space-magic-ok: 大字級主視覺的構圖節奏:小字 eyebrow ↔ text-h2 城市名 ↔ 標語各 4px,是圖上大字排版的視覺平衡,不是卡片「標題 ↔ 說明」(那一種用 --item-gap-label-desc-*)(layoutSpace.spec.md:167 視覺平衡) */}
                <div className="text-on-emphasis relative z-10 flex flex-col gap-1">
                  <div className="text-caption font-medium">推薦目的地</div>
                  <div className="text-h2 font-bold">{b.city}</div>
                  <div className="text-body-lg">{b.tagline}</div>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
        <CarouselDots />
      </Carousel>
    </div>
  ),
}

export const ProductImageGallery = {
  name: '商品圖片輪播',
  parameters: {
    docs: { description: { story: '單一商品的 4 張角度照,底下的指示點表示共有幾張。適合電商或行銷網站的商品頁;按「加入購物車」會跳一則通知。' } },
  },
  render: () => (
    <div className="max-w-[480px]">
      <Toaster />
      <Carousel>
        <CarouselContent>
          {productImages.map((img) => (
            <CarouselItem key={img.label}>
              <AspectRatio
                ratio={1}
                role="img"
                aria-label={`無線降噪耳機 Pro ${img.label}`}
                className="relative rounded-lg overflow-hidden bg-cover bg-center"
                style={{ backgroundImage: `url(${img.image})` }}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
        <CarouselDots />
      </Carousel>
      <div className="mt-[var(--layout-space-tight)] flex items-baseline justify-between">
        <div>
          <div className="text-body font-medium">無線降噪耳機 Pro</div>
          <div className="text-caption text-fg-muted">NT$ 8,990</div>
        </div>
        {/* 頁面上的主要動作用預設 md(之前 sm 且按了沒反應);按下跳通知 */}
        <Button variant="primary" onClick={() => toast({ variant: 'success', title: '已加入購物車', description: '無線降噪耳機 Pro × 1' })}>加入購物車</Button>
      </div>
    </div>
  ),
}

// TestimonialCarousel / VerticalOrientation 範例於 2026-04-20 移除:
//   - TestimonialCarousel:箭頭直接覆蓋文字 card(text 佔滿卡片高度),
//     違反「箭頭 overlay 只覆蓋圖 / 背景,不壓文字」原則(見 principles story)。
//     純文字 carousel 若真要保留,應改為 arrows OUTSIDE the card(旁邊,非 overlay)
//     — 但該 layout 較少見,DS 不主動 demo
//   - VerticalOrientation:垂直輪播使用情境少見(story feed / 影片 feed 外難找),
//     且 embla 垂直模式在 a11y / touch gesture 上都次等,不值得做為 DS canonical
//     範例示範
//
// 如果 consumer 有這兩類需求,自己評估合適性 — DS 不 demo 等於不背書
