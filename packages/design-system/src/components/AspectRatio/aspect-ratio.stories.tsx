// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AspectRatio } from './aspect-ratio'
import { ItemContent } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { ExampleSection, ExampleStack } from '@/design-system/stories-helpers/examples/tutorial-page'

/**
 * AspectRatio 展示——固定長寬比容器,常用於圖片 / 截圖 / illustration 鎖比例。
 * 展示範例對標世界級產品的真實情境(Stripe product 卡、儀表板頂部的公告橫幅),
 * consumer 包 <img className="w-full h-full object-cover" /> 是標準用法。
 * 全比例對照矩陣由設計規格層 StandardRatios owns。設計規則詳見 `aspect-ratio.spec.md`。
 */

const meta: Meta = {
  title: 'Design System/Components/AspectRatio/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '在內容載入前後維持固定長寬比，避免圖片、影片或縮圖造成版面位移。媒體需要依容器縮放但比例不可變形時使用。' } },
  },
}
export default meta
type Story = StoryObj

// ── Stories ───────────────────────────────────────────────────────────────────
// HeroBanner16x9 / SquareAvatar1x1 / CommonRatios retired 2026-07-14 per audit Dim 24(story 重複性):
// 比例是數值 prop 非 affordance,逐值 story 無獨立教學原則;全比例對照矩陣已由
// anatomy StandardRatios(aspect-ratio.anatomy.stories.tsx,5 ratio 含 21/9 / 3/4)owns。
// 展示層保留真實業務場景:ProductPhoto4x3(教 CLS 防坍塌)+ Ultrawide21x9(儀表板頂部的寬幅公告橫幅)。

export const ProductPhoto4x3: Story = {
  name: '4/3 產品照片 + 防版面跳動對照',
  render: () => (
    // 兩則有標題的範例上下疊:範例之間 loose × 2(ExampleStack);各則標題 ↔ 說明 2px、標題區 → 內容 loose(ExampleSection)
    <ExampleStack className="max-w-[900px]">
      <ExampleSection
        title="商品列表卡片:圖片載入前後版面不跳動"
        description="三張商品卡的圖片一律 4:3,高度一致;圖片還沒載入或網址失效時,容器照樣按比例佔好位置,名稱與價格不會被往下推。"
      >
        <div className="grid grid-cols-3 gap-[var(--layout-space-loose)]">
          {/* 每張先看過照片再配商品(2026-11-18 前 seed/headphones 是海浪、seed/keyboard 是森林、seed/camera 是登山客 —— 稽核 A113);
              seed 是轉址到那一張的字(找法與不寫 /id/<n>/ 的理由見 ../Carousel/_carousel-demo.ts 檔頭)。
              Picsum 沒有單獨拍耳機的照片 → 第一張改成照片裡真的有的黑膠唱盤 */}
          {[
            { seed: 'demo-558', title: '黑膠唱盤', price: 'NT$ 9,990' }, // Picsum 39:唱盤與唱臂
            { seed: 'demo-110', title: '全尺寸鍵盤', price: 'NT$ 1,890' }, // 366:鍵盤、滑鼠與馬克杯
            { seed: 'demo-2840', title: '輕便相機', price: 'NT$ 12,800' }, // 250:旁軸相機特寫
          ].map(p => (
            // 縮圖 ↔ 它的名稱 / 價格 = tight(layoutSpace 規則 3 labeling);名稱 ↔ 價格是同一個文字塊,間距由 ItemContent 擁有
            // (--item-gap-label-desc-scanning;body 14 + caption 12 = scanning)
            <div key={p.seed} className="flex flex-col gap-[var(--layout-space-tight)]">
              <AspectRatio ratio={4 / 3} className="bg-muted rounded-md overflow-hidden">
                <img
                  src={`https://picsum.photos/seed/${p.seed}/600/450`}
                  alt={p.title}
                  className="w-full h-full object-cover"
                />
              </AspectRatio>
              <ItemContent label={p.title} description={p.price} mode="scanning" descriptionTone="muted" labelClassName="text-body font-medium" />
            </div>
          ))}
        </div>
      </ExampleSection>

      <ExampleSection
        title="對照:未載入狀態"
        description="圖片還沒載入時,容器照樣保留同比例的灰色佔位,不會塌成 0 高。"
      >
        <div className="grid grid-cols-3 gap-[var(--layout-space-loose)]">
          {[1, 2, 3].map(i => (
            <AspectRatio key={i} ratio={4 / 3} className="bg-muted rounded-md" />
          ))}
        </div>
      </ExampleSection>
    </ExampleStack>
  ),
}

export const Ultrawide21x9: Story = {
  name: '21:9 儀表板公告橫幅',
  render: () => (
    <ExampleSection
      className="max-w-[900px]"
      title="儀表板頂部的季度活動公告"
      description="寬幅公告橫幅放在儀表板最上方:21/9 讓圖片佔滿整條寬度,高度卻只有寬度的四成多,不會把下方的數據擠出首屏。"
    >
      <AspectRatio ratio={21 / 9} className="bg-muted rounded-md overflow-hidden">
        {/* 季度活動 = 一場活動現場:seed/demo-197 = Picsum 452(舞台 + 舉手的觀眾);
            2026-11-18 前 seed/cinematic 是海邊戴帽子的背影(338),跟「活動公告」對不上(稽核 A113) */}
        <img
          src="https://picsum.photos/seed/demo-197/1260/540"
          alt="儀表板頂部的季度活動公告橫幅"
          className="w-full h-full object-cover"
        />
      </AspectRatio>
    </ExampleSection>
  ),
}
