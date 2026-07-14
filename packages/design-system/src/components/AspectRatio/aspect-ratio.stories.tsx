// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import { AspectRatio } from './aspect-ratio'

/**
 * AspectRatio 展示——固定長寬比容器,常用於圖片 / 截圖 / illustration 鎖比例。
 * 展示範例對標世界級產品的真實情境(Stripe product 卡、YouTube cinematic banner),
 * consumer 包 <img className="w-full h-full object-cover" /> 是標準用法。
 * 全比例對照矩陣由設計規格層 StandardRatios owns。設計規則詳見 `aspect-ratio.spec.md`。
 */

const meta: Meta = {
  title: 'Design System/Components/AspectRatio/展示',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Stories ───────────────────────────────────────────────────────────────────
// HeroBanner16x9 / SquareAvatar1x1 / CommonRatios retired 2026-07-14 per audit Dim 24(story 重複性):
// 比例是數值 prop 非 affordance,逐值 story 無獨立教學原則;全比例對照矩陣已由
// anatomy StandardRatios(aspect-ratio.anatomy.stories.tsx,5 ratio 含 21/9 / 3/4)owns。
// 展示層保留真實業務場景:ProductPhoto4x3(教 CLS 防坍塌)+ Ultrawide21x9(cinematic 寬幅情境)。

export const ProductPhoto4x3: Story = {
  name: '4/3 產品照片 + 防版面跳動對照',
  render: () => (
    <div className="flex flex-col gap-8 max-w-[900px]">
      <div>
        <h3 className="text-body font-bold text-foreground mb-1">Stripe product listing — 防 CLS 坍塌</h3>
        <p className="text-caption text-fg-muted mb-5 max-w-[600px] leading-relaxed">
          產品卡用 4/3 統一 thumbnail 高度。即使圖片還沒載入(或 src 無效),容器仍鎖死比例 → 頁面 layout 不跳動(CLS = 0)。
        </p>
        <div className="grid grid-cols-3 gap-4">
          {[
            { seed: 'headphones', title: 'Wireless Headphones', price: 'NT$ 3,990' },
            { seed: 'keyboard', title: 'Mechanical Keyboard', price: 'NT$ 5,490' },
            { seed: 'camera', title: 'Compact Camera', price: 'NT$ 12,800' },
          ].map(p => (
            <div key={p.seed} className="flex flex-col gap-2">
              <AspectRatio ratio={4 / 3} className="bg-muted rounded-lg overflow-hidden">
                <img
                  src={`https://picsum.photos/seed/${p.seed}/600/450`}
                  alt={p.title}
                  className="w-full h-full object-cover"
                />
              </AspectRatio>
              <div className="text-body font-medium">{p.title}</div>
              <div className="text-caption text-fg-muted">{p.price}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-body font-bold text-foreground mb-1">對照:未載入狀態</h3>
        <p className="text-caption text-fg-muted mb-5 max-w-[600px] leading-relaxed">
          Src 未 ready 時,AspectRatio 仍維持 bg-muted 的 placeholder 空間,不坍塌成 0 高。
        </p>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <AspectRatio key={i} ratio={4 / 3} className="bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  ),
}

export const Ultrawide21x9: Story = {
  name: '21:9 影院橫幅',
  render: () => (
    <div className="max-w-[900px]">
      <h3 className="text-body font-bold text-foreground mb-1">YouTube cinematic / movie poster</h3>
      <p className="text-caption text-fg-muted mb-5 max-w-[600px] leading-relaxed">
        Ultra-wide hero banner、movie poster、影片縮圖 cinematic 版本——21/9 強化「電影感」寬幅視覺。
      </p>
      <AspectRatio ratio={21 / 9} className="bg-muted rounded-lg overflow-hidden">
        <img
          src="https://picsum.photos/seed/cinematic/1260/540"
          alt="Cinematic landscape banner"
          className="w-full h-full object-cover"
        />
      </AspectRatio>
    </div>
  ),
}

