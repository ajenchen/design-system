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
import { Avatar } from '@/design-system/components/Avatar/avatar'

const meta: Meta = {
  title: 'Design System/Components/Carousel/展示',
  parameters: { layout: 'padded' },
}
export default meta

// ── Real-content data ────────────────────────────────────────────────────────

const heroBanners = [
  {
    city: '京都',
    tagline: '秋日楓紅限定行程',
    gradient: 'linear-gradient(135deg, #c4452a 0%, #f28b3a 60%, #ffd37a 100%)',
  },
  {
    city: '雷克雅維克',
    tagline: '極光季早鳥 8 折',
    gradient: 'linear-gradient(135deg, #1b3b6f 0%, #3d7ea6 60%, #a8e0ff 100%)',
  },
  {
    city: '里斯本',
    tagline: '歐洲西岸 7 日自由行',
    gradient: 'linear-gradient(135deg, #e87d5a 0%, #f4c27a 50%, #f7e2b0 100%)',
  },
  {
    city: '峇里島',
    tagline: '熱帶度假村 · 含機加酒',
    gradient: 'linear-gradient(135deg, #1d6a5a 0%, #4db893 60%, #c7ebd9 100%)',
  },
]

const productImages = [
  { label: '正面', gradient: 'linear-gradient(135deg, #f4f4f5 0%, #e4e4e7 100%)' },
  { label: '側面', gradient: 'linear-gradient(135deg, #e4e4e7 0%, #d4d4d8 100%)' },
  { label: '背面', gradient: 'linear-gradient(135deg, #d4d4d8 0%, #a1a1aa 100%)' },
  { label: '情境', gradient: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' },
]

const testimonials = [
  {
    name: '林婕欣',
    title: 'Product Manager · Gogolook',
    quote: '從接手 PRD 到工程交付,workflow 重新設計後節省了一半的會議時間。團隊終於能把精力放在真正困難的決策上。',
  },
  {
    name: 'David Chen',
    title: 'Engineering Lead · Appier',
    quote: '導入後三個月內部署頻率翻倍。最驚喜的是 on-call 負擔下降,工程師可以專心寫 code 而不是修 bug。',
  },
  {
    name: 'Sarah Wu',
    title: 'Design Director · KKday',
    quote: 'Design token 系統終於統一了——設計稿和 production 不再需要 QA 來回對 8 輪 pixel。',
  },
]

// ── Stories ─────────────────────────────────────────────────────────────────

export const HomepageHeroBanner = {
  name: '首頁 Hero Banner',
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
                className="relative h-[360px] rounded-lg overflow-hidden flex items-end p-8"
                style={{ background: b.gradient }}
              >
                <div className="text-white">
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
  name: '商品圖片輪播(Stripe product page 風格)',
  render: () => (
    <div className="max-w-[480px]">
      <p className="text-caption text-fg-muted mb-3">
        單一商品 4 張角度照 · dots 顯示共有幾張 · 適合電商 / B2B SaaS marketing site
      </p>
      <Carousel>
        <CarouselContent>
          {productImages.map((img) => (
            <CarouselItem key={img.label}>
              <div
                className="relative aspect-square rounded-lg overflow-hidden flex items-center justify-center"
                style={{ background: img.gradient }}
              >
                <div className="text-foreground/40 text-body-lg font-medium">{img.label}</div>
              </div>
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

export const TestimonialCarousel = {
  name: 'Customer Testimonial(Linear / Stripe 首頁風格)',
  render: () => (
    <div className="max-w-[640px]">
      <p className="text-caption text-fg-muted mb-3">
        3 張客戶評語卡片輪播 · 非圖片場景,dots consumer 可 override 為深色
      </p>
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          {testimonials.map((t) => (
            <CarouselItem key={t.name}>
              <div className="bg-surface-raised border border-border rounded-lg p-8 min-h-[220px] flex flex-col justify-between">
                <p className="text-body-lg text-foreground leading-relaxed">
                  「{t.quote}」
                </p>
                <div className="flex items-center gap-3 mt-6">
                  <Avatar name={t.name} size={40} />
                  <div>
                    <div className="text-body font-medium">{t.name}</div>
                    <div className="text-caption text-fg-muted">{t.title}</div>
                  </div>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
}

export const VerticalOrientation = {
  name: 'Vertical orientation(少見場景)',
  render: () => (
    <div className="max-w-[480px]">
      <p className="text-caption text-fg-muted mb-3">
        垂直輪播 · 用於 story feed / 影片 feed 等少數場景 · 箭頭自動旋轉 90°
      </p>
      <div style={{ height: 320 }}>
        <Carousel orientation="vertical" className="h-full">
          <CarouselContent className="h-[320px]">
            {heroBanners.slice(0, 3).map((b) => (
              <CarouselItem key={b.city}>
                <div
                  className="h-[320px] rounded-lg overflow-hidden flex items-end p-6"
                  style={{ background: b.gradient }}
                >
                  <div className="text-white">
                    <div className="text-h3 font-bold">{b.city}</div>
                    <div className="text-body opacity-95">{b.tagline}</div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    </div>
  ),
}
