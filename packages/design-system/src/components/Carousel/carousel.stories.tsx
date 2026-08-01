// @story-trait-rationale: Carousel 是 composite UX showcase(Hero banner + Product gallery 兩個 hero scenario)
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

const productImages = [
  { label: '正面', image: 'https://picsum.photos/seed/headphones-front/480/480' },
  { label: '側面', image: 'https://picsum.photos/seed/headphones-side/480/480' },
  { label: '背面', image: 'https://picsum.photos/seed/headphones-back/480/480' },
  { label: '情境', image: 'https://picsum.photos/seed/headphones-lifestyle/480/480' },
]


// ── Stories ─────────────────────────────────────────────────────────────────

export const HomepageHeroBanner = {
  name: '首頁主視覺橫幅',
  render: () => (
    <div className="max-w-[960px]">
      <p className="text-caption text-fg-muted mb-3">
        Airbnb / Booking 首頁風格 · 4 張城市主題大圖 · hover 顯示箭頭 · 底部白點指示
      </p>
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          {heroBanners.map((b) => (
            <CarouselItem key={b.city}>
              <div
                className="relative h-[360px] rounded-lg overflow-hidden flex items-end p-8 bg-cover bg-center"
                style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.6) 100%), url(${b.image})` }}
              >
                <div className="text-white relative z-10">
                  <div className="text-caption font-medium opacity-90 mb-1">推薦目的地</div>
                  <div className="text-h2 font-bold mb-1">{b.city}</div>
                  <div className="text-body-lg opacity-95">{b.tagline}</div>
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
  render: () => (
    <div className="max-w-[480px]">
      <p className="text-caption text-fg-muted mb-3">
        單一商品 4 張角度照 · dots 顯示共有幾張 · 適合電商 / B2B SaaS marketing site
      </p>
      <Carousel>
        <CarouselContent>
          {productImages.map((img) => (
            <CarouselItem key={img.label}>
              <AspectRatio
                ratio={1}
                className="relative rounded-lg overflow-hidden bg-cover bg-center"
                style={{ backgroundImage: `url(${img.image})` }}
              >
                <div className="absolute bottom-2 right-2 text-caption text-white px-2 py-0.5 rounded bg-black/40">{img.label}</div>
              </AspectRatio>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
        <CarouselDots />
      </Carousel>
      <div className="mt-4 flex items-baseline justify-between">
        <div>
          <div className="text-body font-medium">無線降噪耳機 Pro</div>
          <div className="text-caption text-fg-muted">NT$ 8,990</div>
        </div>
        <Button variant="primary" size="sm">加入購物車</Button>
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
