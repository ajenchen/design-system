import type { Meta, StoryObj } from '@storybook/react'
import { Users, Settings, Bell, FileText } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs'
import { Badge } from '@/design-system/components/Badge/badge'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Tabs/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>Tabs 由 TabsList(容器)+ TabsTrigger(標籤)+ TabsContent(內容)組成。內部結構基於 Radix Tabs,橋接 DS token。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-2xl">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">總覽</TabsTrigger>
              <TabsTrigger value="members">成員</TabsTrigger>
              <TabsTrigger value="settings">設定</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <p className="text-body text-fg-secondary">專案的總覽資訊</p>
            </TabsContent>
            <TabsContent value="members">
              <p className="text-body text-fg-secondary">專案成員列表</p>
            </TabsContent>
            <TabsContent value="settings">
              <p className="text-body text-fg-secondary">專案設定</p>
            </TabsContent>
          </Tabs>
        </div>
        <p className="text-footnote text-fg-muted mt-3">Selected underline 用 ::after 絕對定位在 bottom: -1px(2px primary-hover),蓋住 TabsList 的 1px gray border(單一視覺線條)</p>
      </div>

      <div>
        <H3>Trigger 內部結構</H3>
        <Desc>[startIcon?] [label] [suffix: badge? + endIcon?]——slot 間 gap-2,suffix 內 gap-1。</Desc>
        <div className="border border-border rounded-lg p-4 max-w-2xl">
          <Tabs defaultValue="files">
            <TabsList>
              <TabsTrigger value="files" startIcon={FileText}>文件</TabsTrigger>
              <TabsTrigger value="members" startIcon={Users} badge={<Badge count={3} variant="low" />}>
                成員
              </TabsTrigger>
              <TabsTrigger value="notifications" startIcon={Bell} badge={<Badge count={12} variant="high" />}>
                通知
              </TabsTrigger>
              <TabsTrigger value="settings" startIcon={Settings}>設定</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['Tabs', '', '', ''],
                ['  size', "'sm' | 'md' | 'lg'", "'sm'", 'tab 高度 tier(對齊 --tab-height-*);size 選擇指引詳「設計原則 → 尺寸選擇」'],
                ['  overflow', "'none' | 'scroll' | 'menu'", "'none'", '水平溢出處理(捲動 / 下拉選單)'],
                ['  defaultValue / value', 'string', '—', '當前 tab 值(受控 / 非受控)'],
                ['TabsTrigger', '', '', ''],
                ['  value', 'string', '必填', '唯一識別碼,對應 TabsContent value'],
                ['  startIcon', 'LucideIcon', '—', '前綴 icon(描述 tab 類型)'],
                ['  badge', 'ReactNode', '—', '後綴計數指示(通常放 Badge)'],
                ['  endIcon', 'LucideIcon', '—', '後綴純視覺 indicator(方向 / 狀態,連同 tab 一起點)'],
                ['  inlineAction', 'ReactNode', '—', '後綴獨立點擊區(自己的 handler,不切 tab)'],
                ['  disabled', 'boolean', 'false', '停用該 tab'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ── Inspector ─────────────────────────────────────────────────────────────

interface InspectorArgs {
  size: 'sm' | 'md' | 'lg'
  overflow: 'none' | 'scroll' | 'menu'
  value: 'overview' | 'members' | 'settings'
  withIcons: boolean
  withBadges: boolean
}

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story:
          '右側 Controls 切 Tabs / TabsList props 即時 render,取代 Figma inspect。切 `size` 看 tab 高度 tier(--tab-height-*);切 `overflow` 模擬溢出處理行為(scroll 需寬度不足才觸發,示例用 `max-w` 限縮容器);切 `value` 觀察 selected underline 位置。',
      },
    },
  },
  args: {
    size: 'sm',
    overflow: 'none',
    value: 'overview',
    withIcons: true,
    withBadges: true,
  },
  argTypes: {
    size: {
      control: 'radio',
      options: ['sm', 'md', 'lg'],
      description: 'sm★default=overlay / chrome / dense / md=future tier 無 use case / lg=獨立 tabs 取代 chrome header',
    },
    overflow: {
      control: 'radio',
      options: ['none', 'scroll', 'menu'],
      description: 'none★default / scroll=水平捲動 + fade mask / menu=⌄ navigator dropdown(列全部 tab,全 trigger 仍可見)',
    },
    value: {
      control: 'radio',
      options: ['overview', 'members', 'settings'],
      description: '當前 selected tab',
    },
    withIcons: { control: 'boolean', description: 'startIcon(對應專案 / 成員 / 設定 icon)' },
    withBadges: { control: 'boolean', description: '成員 tab 顯示 3、通知顯示 12(Badge suffix)' },
  },
  render: (args) => {
    const { size, overflow, value, withIcons, withBadges } = args as InspectorArgs
    const containerClass = overflow === 'scroll' || overflow === 'menu' ? 'max-w-sm' : 'max-w-2xl'
    return (
      <div className={`border border-border rounded-lg p-4 ${containerClass}`}>
        <Tabs value={value} onValueChange={() => {}}>
          <TabsList size={size} overflow={overflow}>
            <TabsTrigger value="overview" startIcon={withIcons ? FileText : undefined}>
              總覽
            </TabsTrigger>
            <TabsTrigger
              value="members"
              startIcon={withIcons ? Users : undefined}
              badge={withBadges ? <Badge count={3} variant="low" /> : undefined}
            >
              成員
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              startIcon={withIcons ? Settings : undefined}
              badge={withBadges ? <Badge count={12} variant="high" /> : undefined}
            >
              設定
            </TabsTrigger>
            {(overflow === 'scroll' || overflow === 'menu') && (
              <>
                <TabsTrigger value="billing" startIcon={withIcons ? Bell : undefined}>計費</TabsTrigger>
                <TabsTrigger value="integrations">整合</TabsTrigger>
                <TabsTrigger value="security">安全性</TabsTrigger>
                <TabsTrigger value="api">API keys</TabsTrigger>
              </>
            )}
          </TabsList>
          <TabsContent value="overview" className=" text-body text-fg-secondary">
            專案的總覽資訊(KPI / 最近活動 / 團隊成員簡介)
          </TabsContent>
          <TabsContent value="members" className=" text-body text-fg-secondary">
            專案成員列表(3 人待邀請)
          </TabsContent>
          <TabsContent value="settings" className=" text-body text-fg-secondary">
            專案設定(12 個通知待閱讀)
          </TabsContent>
        </Tabs>
      </div>
    )
  },
}

export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>三種 Size — 對應 `--tab-height-*` token</H3>
        <Desc>Tabs 有自己的高度 tier(不直接複用 field-height)——tab 需要較高視覺重量,`--tab-height-*` 比 `--field-height-*` 略高。何時選哪個 size 的完整判斷與世界級引用,詳「設計原則 → 尺寸選擇」。</Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Size</Th><Th>Token</Th><Th>字體</Th><Th>使用場景</Th></tr></thead>
            <tbody>
              <tr><Td mono>sm ★default</Td><Td mono>--tab-height-sm</Td><Td>text-body</Td><Td>overlay / chrome header / dense</Td></tr>
              <tr><Td mono>md</Td><Td mono>--tab-height-md</Td><Td>text-body</Td><Td>future tier — 目前無 recommended use case</Td></tr>
              <tr><Td mono>lg</Td><Td mono>--tab-height-lg</Td><Td>text-body-lg</Td><Td>獨立 tabs 取代 chrome header(像素 = --chrome-header-height)</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-6">
          {(['sm', 'md', 'lg'] as const).map(size => (
            <div key={size}>
              <div className="text-caption text-fg-muted mb-2 font-mono">size="{size}"</div>
              <div className="border border-border rounded-lg p-4">
                <Tabs defaultValue="a">
                  <TabsList size={size}>
                    <TabsTrigger value="a">總覽</TabsTrigger>
                    <TabsTrigger value="b">成員</TabsTrigger>
                    <TabsTrigger value="c">設定</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>TabsTrigger 四態色彩</H3>
        <Desc>
          Tabs 未選狀態用 fg-secondary(不搶視覺),hover 時文字色轉 foreground(text-foreground，
          neutral 最深)。Selected 用 foreground + bottom 2px primary-hover 下線
          ——下線是「當前位置」的明確指示器,不靠底色區分。
        </Desc>
        <div className="overflow-x-auto mb-4">
          <table className="text-caption border-collapse">
            <thead>
              <tr>
                <Th>狀態</Th>
                <Th>Text</Th>
                <Th>Background</Th>
                <Th>Underline(::after)</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td mono>default(未選)</Td>
                <Td><TokenCell token="--fg-secondary" display="fg-secondary" /></Td>
                <Td>—(transparent)</Td>
                <Td>—</Td>
              </tr>
              <tr>
                <Td mono>hover(未選)</Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td>—(transparent)</Td>
                <Td>—</Td>
              </tr>
              <tr>
                <Td mono>selected</Td>
                <Td><TokenCell token="--foreground" display="foreground" /></Td>
                <Td>—(transparent)</Td>
                <Td><TokenCell token="--primary-hover" display="2px primary-hover" /></Td>
              </tr>
              <tr>
                <Td mono>disabled</Td>
                <Td><TokenCell token="--fg-disabled" display="fg-disabled" /></Td>
                <Td>—</Td>
                <Td>—</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          TabsList 底部有 1px gray border(`border-b border-divider`)。Selected underline 用
          `::after bottom: -1px height: 2px` 蓋住 gray border,形成單一視覺線條
          ——看起來像 2px primary line 停在 selected 下方,其餘 tabs 下方是 1px 淡線。
        </p>
      </div>

      <div>
        <H3>Badge suffix 色彩(固定 variant 色,不隨 selected 變)</H3>
        <Desc>
          Badge 作為 suffix 時,顏色固定由其 variant token 決定(low / high),selected 與否
          都維持 Badge 原色——trigger 的 data-[state=active] 文字色只作用在 trigger 本身,不傳遞到 Badge。
        </Desc>
        <div className="border border-border rounded-lg p-4">
          <Tabs defaultValue="members">
            <TabsList>
              <TabsTrigger value="files" startIcon={FileText}>文件</TabsTrigger>
              <TabsTrigger value="members" startIcon={Users} badge={<Badge count={3} variant="low" />}>
                成員
              </TabsTrigger>
              <TabsTrigger value="notifications" startIcon={Bell} badge={<Badge count={12} variant="high" />}>
                通知
              </TabsTrigger>
              <TabsTrigger value="settings" startIcon={Settings}>設定</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>互動狀態對照</H3>
        <Desc>「總覽」為 selected（當前 value，有 primary-hover 底部下線）;「成員」「通知」為 unselected(移 hover 上去文字色轉 foreground);「設定」為 disabled(停用)。</Desc>
        <div className="border border-border rounded-lg p-4">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">總覽</TabsTrigger>
              <TabsTrigger value="members">成員</TabsTrigger>
              <TabsTrigger value="notifications">通知</TabsTrigger>
              <TabsTrigger value="settings" disabled>設定</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          Selected underline:`::after bottom: -1px height: 2px bg: primary-hover`——蓋住 TabsList 的 1px gray border
        </p>
      </div>
    </div>
  ),
}

export const OverflowMatrix: Story = {
  name: '超出處理（捲動 / 選單）',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>overflow="scroll" — 水平捲動 + fade mask</H3>
        <Desc>Tabs 超出容器寬度時,左右兩端出現 scroll arrow + 漸變遮罩(fade mask)提示可捲動。使用 `useScrollEdges` + `OverflowScrollArrow` 共用 hook。</Desc>
        {/* 2026-05-18 fix(user 抓 overflow demo 沒秀真實溢出):max-w-md (448px) 太寬
            8 個短 Chinese tab 加總 < 448 不觸發 overflow。改 280px 強制觸發 + 視覺可見。*/}
        <div className="border border-border rounded-lg p-4 max-w-[280px]">
          <Tabs defaultValue="a">
            <TabsList overflow="scroll">
              <TabsTrigger value="a">總覽</TabsTrigger>
              <TabsTrigger value="b">成員</TabsTrigger>
              <TabsTrigger value="c">專案設定</TabsTrigger>
              <TabsTrigger value="d">通知</TabsTrigger>
              <TabsTrigger value="e">整合</TabsTrigger>
              <TabsTrigger value="f">API</TabsTrigger>
              <TabsTrigger value="g">計費</TabsTrigger>
              <TabsTrigger value="h">安全性</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div>
        <H3>overflow="menu" — 全部 tab 一直可見 + ⌄ navigator dropdown(列全部 tab 快速跳轉)</H3>
        <Desc>Tabs 超出容器時,右側出現 ⌄ navigator(OverflowMenuTriggerButton),點開 DropdownMenu 列出全部 tab 供快速跳轉;底層仍是真實捲動容器(全 trigger 可見可捲),點選後該 tab scrollIntoView 至視圖中央。適合 tab 數量較多、需快速跳轉到任一 tab 的場景。</Desc>
        {/* 2026-05-18 fix(user 抓 overflow demo 沒秀真實溢出):max-w-md (448px) 太寬
            8 個短 Chinese tab 加總 < 448 不觸發 overflow。改 280px 強制觸發 + 視覺可見。*/}
        <div className="border border-border rounded-lg p-4 max-w-[280px]">
          <Tabs defaultValue="a">
            <TabsList overflow="menu">
              <TabsTrigger value="a">總覽</TabsTrigger>
              <TabsTrigger value="b">成員</TabsTrigger>
              <TabsTrigger value="c">專案設定</TabsTrigger>
              <TabsTrigger value="d">通知</TabsTrigger>
              <TabsTrigger value="e">整合</TabsTrigger>
              <TabsTrigger value="f">API</TabsTrigger>
              <TabsTrigger value="g">計費</TabsTrigger>
              <TabsTrigger value="h">安全性</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div>
        <H3>Overflow 機制來源</H3>
        <Desc>共用 `patterns/horizontal-overflow/horizontal-overflow.spec.md` 的 hooks 和 primitives:useScrollEdges(偵測左右邊界)、OverflowScrollArrow(捲動箭頭)、OverflowMenuTriggerButton(menu 觸發)。Chip 也消費同一套——Tabs 和 Chip 的溢出行為視覺 / 機制保持一致。</Desc>
      </div>
    </div>
  ),
}

export const SpacingTokens: Story = {
  name: '間距設計變數',
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <H3>Triggers 之間 gap</H3>
        <Desc>gap = `--layout-space-loose`(16px md / 24px lg density)——density-aware,跟著系統密度切換。</Desc>
      </div>

      <div>
        <H3>Trigger 內部 slot gap</H3>
        <Desc>[startIcon] → [label] → [suffix]:slot 之間 `gap-2`(8px)。suffix 內 badge 和 endIcon 之間 `gap-1`(4px)。</Desc>
      </div>

      <div>
        <H3>Trigger 無水平 padding</H3>
        <Desc>Trigger **不加任何水平 padding**——寬度 = 內容寬度(hug content)。selected underline(`::after left-0 right-0`)因此剛好 fit label;若加橫向 padding,underline 會多出鬆散空白。trigger 之間的分隔靠 TabsList 的 `gap-[--layout-space-loose]`,不是 padding。</Desc>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `tabs.spec.md` 「A11y 預設」段。摘要:\n\n  ARIA / Pattern  :繼承 Radix  tabs  primitive a11y 預設(role / aria-  / 鍵盤導覽)。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/tabs#accessibility)。\n\n  Keyboard 行為  :\n\n- Tab — 進入 TabList(整組 tabs 是單一 tab stop)\n- ←/→ — 在 tab 之間移動(roving tabindex,焦點不被困在 tab 列內)\n- Home/End — 第一 / 最後 tab\n- Enter / Space — activate\n\n  Focus  :Tabs 是內嵌導覽,不會把焦點困住(無 focus trap);用 roving tabindex 管理 tab 之間的移動。選中的 tab 與內容面板各自有 focus-visible 焦點框(ring-2 ring-ring,per design-system focus-visible 設計準則)。\n\n  驗證  :Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。"}</p>
    </div>
  ),
}
