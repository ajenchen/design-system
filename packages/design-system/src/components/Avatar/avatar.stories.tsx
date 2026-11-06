import type { Meta } from '@storybook/react'
import { Building2 } from 'lucide-react'
import { Avatar } from './avatar'
import { MenuItem, MenuGroup } from '@/design-system/components/Menu/menu-item'
import { ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { ExampleSection } from '@/design-system/stories-helpers/examples/tutorial-page'
import { SAMPLE_PEOPLE, samplePersonCard } from '@/design-system/stories-helpers/scene/person-card'

// 人員頭像一律帶名片(avatar.spec.md「Avatar HoverCard 原則」;登記簿 B21「我說所有」),名片讀共用名錄、走全 DS 同一支建構器。
// 名片裡的頭像用觸發點同一張圖(或同樣沒有圖),滑過前後看到的是同一個人(2026-10-28 前本頁人員頭像都沒接名片,稽核 L001 / M004)。
// 沒有任何身分資料的頭像(無 alt、無 src)本身就是在示範「沒有資料時長怎樣」,沒有人可以接名片,維持原樣。
const { alice, bob, bobWang, carol, dave } = SAMPLE_PEOPLE

// Fallback story 必須可離線重現：成功路徑用內嵌 SVG，失敗路徑用同源 404。
// 外部 avatar host 或 DNS 失敗網址會讓 a11y/visual runner 的 networkidle 不穩定。
const fallbackDemoImage = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#dbeafe"/><circle cx="40" cy="31" r="15" fill="#2563eb"/><path d="M14 76c3-18 13-27 26-27s23 9 26 27" fill="#2563eb"/></svg>',
)}`
const missingAvatarImage = '/__avatar-fallback-missing__.jpg'

const meta: Meta = {
  title: 'Design System/Components/Avatar/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '以圖片、姓名縮寫或圖示辨識人員、團隊與實體，並提供可靠 fallback。清單、帳號入口或協作內容需要穩定 identity mark 時使用。' } },
  },
}
export default meta

/* ═══════════════════════════════════════════════════════════════════════════
   1. 四模式
   ═══════════════════════════════════════════════════════════════════════════ */

export const Modes = {
  name: '四模式',
  render: () => (
    // 標題 ↔ 說明 2px、標題區 → 範例 loose(ExampleSection;2026-10-28 A4,之前兩層 tight 疊 12 / 16)
    <ExampleSection title="四種內容模式" description="按優先順序：有 src 顯示圖片 → 有 icon 顯示 Icon → 有 alt 顯示首字。都沒有時預設顯示 User icon。">
      <div className="flex items-center gap-[var(--layout-space-loose)]">
        {/* 刻意示範內容模式優先序:Text fallback / 預設 User icon 兩項**必須**無 src(fallback 行為
            示範 story,2026-07-08 demo 人像真實化 sweep 豁免保留) */}
        {[
          { label: 'Image', el: <Avatar size={40} src="https://i.pravatar.cc/80?u=a" alt={alice.name} hoverCard={samplePersonCard({ ...alice, avatarSrc: 'https://i.pravatar.cc/80?u=a' })} /> },
          { label: 'Icon', el: <Avatar size={40} icon={Building2} color="blue" /> },
          { label: 'Text fallback', el: <Avatar size={40} alt={bob.name} color="purple" hoverCard={samplePersonCard({ ...bob, avatarSrc: undefined })} /> },
          { label: '預設（無任何 prop）', el: <Avatar size={40} /> },
        ].map(({ label, el }) => (
          <ExampleGroup key={label} align="center">
            {el}
            <span className="text-caption text-fg-muted">{label}</span>
          </ExampleGroup>
        ))}
      </div>
    </ExampleSection>
  ),
}

/* @story-history: Shapes / Colors / AllSizes retired 2026-05-17 per audit Dim 24 —
 *   anatomy.stories.tsx SizeMatrix(含 circle/square shape axis)+ ColorMatrix(12 hue + neutral × subtle/solid)
 *   已 cover trait grids。展示層保留 typical real-product 情境(Modes / Fallback / Status / Count badge 等),
 *   避免跟 anatomy trait grid 重複。 */

/* ═══════════════════════════════════════════════════════════════════════════
   5. Fallback 行為
   ═══════════════════════════════════════════════════════════════════════════ */

export const Fallback = {
  name: '備援顯示',
  render: () => (
    <ExampleSection title="Fallback 行為" description="圖片載入失敗時，自動降級：有 alt 顯示首字，無 alt 顯示預設 User icon。">
      <div className="flex items-center gap-[var(--layout-space-loose)]">
        <ExampleGroup align="center">
          <Avatar size={40} src={fallbackDemoImage} alt={alice.name} hoverCard={samplePersonCard({ ...alice, avatarSrc: fallbackDemoImage })} />
          <span className="text-caption text-fg-muted">圖片正常載入</span>
        </ExampleGroup>
        <ExampleGroup align="center">
          <Avatar size={40} src={missingAvatarImage} alt={bob.name} color="green" hoverCard={samplePersonCard({ ...bob, avatarSrc: missingAvatarImage })} />
          <span className="text-caption text-fg-muted">圖片失敗 + 有 alt → 首字</span>
        </ExampleGroup>
        <ExampleGroup align="center">
          <Avatar size={40} src={missingAvatarImage} color="yellow" />
          <span className="text-caption text-fg-muted">圖片失敗 + 無 alt → User icon</span>
        </ExampleGroup>
      </div>
    </ExampleSection>
  ),
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. In Context — MenuItem
   ═══════════════════════════════════════════════════════════════════════════ */

export const InContext = {
  name: '情境用例',
  render: () => (
    <ExampleSection title="In Context — MenuItem" description="Avatar 作為 MenuItem 的 avatar slot，尺寸由 item-layout 系統決定。">
      <div className="flex gap-[var(--layout-space-loose)]">
        <div className="flex flex-col gap-[var(--layout-space-tight)]">
          <span className="text-caption font-medium text-fg-secondary">無 description（inline）</span>
          <div className="w-[280px] border border-divider rounded-lg bg-surface">
            <MenuGroup aria-label="無說明文字的成員選單">
              <MenuItem role="presentation" avatar={{ src: "https://i.pravatar.cc/48?u=alice-chen", alt: alice.name, hoverCard: samplePersonCard({ ...alice, avatarSrc: "https://i.pravatar.cc/80?u=alice-chen" }) }}>
                Alice Chen
              </MenuItem>
              <MenuItem role="presentation" avatar={{ src: "https://i.pravatar.cc/48?u=bob-wang", alt: bobWang.name, color: "blue", hoverCard: samplePersonCard(bobWang) }}>
                Bob Wang
              </MenuItem>
              <MenuItem role="presentation" avatar={{ src: "https://i.pravatar.cc/48?u=carol-lee", alt: carol.name, color: "purple", hoverCard: samplePersonCard(carol) }}>
                Carol Lee
              </MenuItem>
            </MenuGroup>
          </div>
        </div>
        <div className="flex flex-col gap-[var(--layout-space-tight)]">
          <span className="text-caption font-medium text-fg-secondary">有 description（block）</span>
          <div className="w-[320px] border border-divider rounded-lg bg-surface">
            <MenuGroup aria-label="含職稱說明的成員選單">
              <MenuItem role="presentation"
                avatar={{ src: "https://i.pravatar.cc/64?u=alice-chen", alt: alice.name, hoverCard: samplePersonCard({ ...alice, avatarSrc: "https://i.pravatar.cc/80?u=alice-chen" }) }}
                description="前端工程師"
              >
                Alice Chen
              </MenuItem>
              <MenuItem role="presentation"
                avatar={{ src: "https://i.pravatar.cc/64?u=carol-lee", alt: carol.name, color: "magenta", hoverCard: samplePersonCard(carol) }}
                description="產品設計師"
              >
                Carol Lee
              </MenuItem>
              <MenuItem role="presentation"
                avatar={{ src: "https://i.pravatar.cc/64?u=dave-lin", alt: dave.name, color: "turquoise", hoverCard: samplePersonCard(dave) }}
                description="產品經理"
              >
                Dave Lin
              </MenuItem>
            </MenuGroup>
          </div>
        </div>
      </div>
    </ExampleSection>
  ),
}
