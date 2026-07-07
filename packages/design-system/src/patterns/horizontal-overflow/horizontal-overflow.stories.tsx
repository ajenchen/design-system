// @story-baseline: components/Tabs/tabs.stories.tsx#OverflowScroll + #OverflowMenu — scroll / menu 兩模式的正式 consumer 視覺基準;本頁組裝結構抄 horizontal-overflow.spec.md「典型 scroll / menu 模式組裝」
//
// Internal Pattern 參照 story。本 module 是「樂高」utility primitives(非組裝好的 UI 元件):
// Tabs / ChipGroup / FileViewer filmstrip 等 consumer 自組 outer wrapper,
// overflow affordance(scroll arrows / menu trigger / fade mask)一律從這裡取用。
// 本頁給 DS contributor 看 primitive 的組裝方式與 canonical 規則。
import type { Meta, StoryObj } from '@storybook/react'
import {
  useScrollEdges,
  useScrollByPage,
  buildFadeMask,
  ARROW_BUTTON_WIDTH,
  OverflowScrollArrow,
  OverflowMenuTriggerButton,
} from './horizontal-overflow'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/design-system/components/DropdownMenu/dropdown-menu'

const meta: Meta = {
  title: 'Design System/Internal Patterns/Horizontal Overflow',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
**@internal** — 水平 overflow 的 canonical primitives + helpers(fade mask / scroll arrow / menu trigger / \`useScrollEdges\`),給任何「一排水平 items 可能塞不下容器」的 DS 元件共用。

**Canonical 規則**:所有 overflow affordance 一律 \`<Button variant="text" size="sm" iconOnly>\`——overflow trigger 是「工具層」,不用 item 自身的視覺語言(chip 形狀 / tab 底線),不跟內容爭視覺重量。

end-user 不直接 import——由 Tabs(\`overflow\` prop)/ Chip(\`layout\` prop)/ FileViewer filmstrip 消費;本頁是 DS contributor 的組裝參照。

完整規則:\`packages/design-system/src/patterns/horizontal-overflow/horizontal-overflow.spec.md\`
        `,
      },
    },
  },
}

export default meta
type Story = StoryObj

/** 簡報頁面縮圖(對標 FileViewer filmstrip consumer 場景) */
const SLIDE_TITLES = [
  '封面', '議程', '年度目標回顧', 'Q2 營收摘要', '客戶成長曲線',
  '產品線更新', '競品分析', '人力規劃', '風險與對策', '下一步行動',
]

/** 典型 scroll 模式組裝(抄 spec「典型 scroll 模式組裝」):
 *  useScrollEdges 偵測邊緣 → buildFadeMask 算漸變 → OverflowScrollArrow 疊在容器兩端。 */
function FilmstripScrollDemo() {
  const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
  const scrollByPage = useScrollByPage(scrollRef)
  const maskImage = buildFadeMask({
    canScroll,
    atStart,
    atEnd,
    reserveArrowWidth: ARROW_BUTTON_WIDTH,
  })

  return (
    <div className="relative w-[480px]">
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        <div className="flex w-fit gap-2 py-1">
          {SLIDE_TITLES.map((title, i) => (
            <div
              key={title}
              className="flex h-16 w-24 shrink-0 flex-col justify-between rounded-md border border-border bg-surface p-2"
            >
              <span className="truncate text-caption text-foreground">{title}</span>
              <span className="text-footnote text-fg-muted">第 {i + 1} 頁</span>
            </div>
          ))}
        </div>
      </div>
      {!atStart && canScroll && (
        <OverflowScrollArrow direction="left" onClick={() => scrollByPage('left')} />
      )}
      {!atEnd && canScroll && (
        <OverflowScrollArrow direction="right" onClick={() => scrollByPage('right')} />
      )}
    </div>
  )
}

export const ScrollMode: Story = {
  name: '捲動模式',
  render: () => (
    <div className="flex flex-col gap-3">
      <FilmstripScrollDemo />
      <p className="max-w-[480px] text-caption text-fg-muted">
        簡報縮圖列(對標 FileViewer filmstrip)。fade mask 提示還有內容,arrow 一次捲 80% 容器寬;
        到達邊緣時該側 arrow 與 fade 自動消失。fade 延伸到 arrow 底下(Material 3 scrim 原理
        {/* @benchmark-unverified: 對齊 horizontal-overflow.spec.md 已顯式撤回之同句 marker */}),
        避免透明按鈕 icon 跟 item 文字視覺打架。
      </p>
    </div>
  ),
}

/** 典型 menu 模式組裝(抄 spec「典型 menu 模式組裝」):
 *  trigger 只提供按鈕,DropdownMenu 內容由 consumer 依資料結構自組
 *  (Tabs 用 DropdownMenuItem 單選 / Chip 用 DropdownMenuCheckboxItem 多選)。 */
const PROJECT_TABS = ['概覽', '活動', '檔案', '權限', '整合', '帳單']

export const MenuMode: Story = {
  name: '選單模式',
  render: () => (
    <div className="flex flex-col gap-3">
      <div>
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger asChild>
            <OverflowMenuTriggerButton aria-label={`頁籤選單(共 ${PROJECT_TABS.length} 個)`} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {PROJECT_TABS.map((tab) => (
              <DropdownMenuItem key={tab}>{tab}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="max-w-[480px] text-caption text-fg-muted">
        專案設定頁籤塞不下時的 ⌄ 導覽選單(對標 Tabs overflow=&quot;menu&quot;)。trigger 是
        forwardRef Button,Radix DropdownMenuTrigger asChild 接管 aria-expanded / data-state;
        aria-label 必填且帶語境,hover 會自動冒出同名 tooltip。此處 defaultOpen 讓選單內容
        直接可見(視覺快照覆蓋);正式 consumer 組裝見檔頭 baseline 兩個 story。
      </p>
    </div>
  ),
}
