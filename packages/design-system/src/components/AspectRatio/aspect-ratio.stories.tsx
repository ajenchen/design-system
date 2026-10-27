// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
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
        title="Stripe product listing — 防 CLS 坍塌"
        description="產品卡用 4/3 統一 thumbnail 高度。即使圖片還沒載入(或 src 無效),容器仍鎖死比例 → 頁面 layout 不跳動(CLS = 0)。"
      >
        <div className="grid grid-cols-3 gap-[var(--layout-space-loose)]">
          {[
            { seed: 'headphones', title: 'Wireless Headphones', price: 'NT$ 3,990' },
            { seed: 'keyboard', title: 'Mechanical Keyboard', price: 'NT$ 5,490' },
            { seed: 'camera', title: 'Compact Camera', price: 'NT$ 12,800' },
          ].map(p => (
            // 縮圖 ↔ 它的名稱 / 價格 = tight(layoutSpace 規則 3 labeling);名稱 ↔ 價格是同一個文字塊,間距由 ItemContent 擁有
            // (--item-gap-label-desc-scanning;body 14 + caption 12 = scanning)
            <div key={p.seed} className="flex flex-col gap-[var(--layout-space-tight)]">
              <AspectRatio ratio={4 / 3} className="bg-muted rounded-lg overflow-hidden">
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
        description="Src 未 ready 時,AspectRatio 仍維持 bg-muted 的 placeholder 空間,不坍塌成 0 高。"
      >
        <div className="grid grid-cols-3 gap-[var(--layout-space-loose)]">
          {[1, 2, 3].map(i => (
            <AspectRatio key={i} ratio={4 / 3} className="bg-muted rounded-lg" />
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
      <AspectRatio ratio={21 / 9} className="bg-muted rounded-lg overflow-hidden">
        <img
          src="https://picsum.photos/seed/cinematic/1260/540"
          alt="儀表板頂部的季度活動公告橫幅"
          className="w-full h-full object-cover"
        />
      </AspectRatio>
    </ExampleSection>
  ),
}
