// 「浮層密度跟觸發點」閘(scripts/overlay-density-follows-trigger-invariant.mjs)的測試夾具 —— 閘自己掛載的頁面,不是 story。
// 由 scripts/lib/storybook-css-fixture.mjs 用 esbuild 打包、配同一份 storybook 建置的 CSS 在本機靜態頁開。
//
// 為什麼不是 story:
//   規則「小浮層跟觸發它的那一區」(tokens/density/density.spec.md「浮層跟觸發點」)要在「密度和整頁不同的區塊」裡才量得到。
//   全部 story 裡真的有密度區塊的只有 tokens/uiSize 與 tokens/density 兩個檔,裡面沒有下拉選單 / 子選單 / HoverCard / Tooltip /
//   日期區間 / 日期單日;把這些浮層一次排進兩種密度的區塊只為了量,不是業務情境的示範,加成 story 會多出預覽站看得到的畫面。
//   Popover 版的 Select 有現成的 story(uiSize「產品對齊用的共用尺寸」),那 4 格仍然在 story 上量,不放進這裡。
//
// 長相:一頁兩個並排的區塊 —— `data-odt-region="md"`(一般密度)與 `"lg"`(大密度),各自寫 `data-density`。
// 整頁密度由閘在開頁時寫到 `<html data-density>`(夾具頁預設 md,scripts/lib/storybook-css-fixture.mjs 的頁面樣板)。
// 每個區塊裡各放(情境:工作項目頁的工具列):
//   data-odt-kind="dropdown"      「更多動作」按鈕 → 下拉選單(內容 data-odt-content="dropdown"),裡面「移動到」開子選單(data-odt-content="submenu")
//   data-odt-kind="hovercard"     負責人頭像 → 人員卡(ProfileCard 根元素 data-odt-content="hovercard";動作鈕用元件的預設動作)
//   data-odt-kind="tooltip"       「匯出報表」按鈕 → Tooltip(內容 data-odt-content="tooltip")
//   data-odt-kind="date-range"    衝刺期間(DatePicker.Range:只有定位錨點、沒有觸發點那一種)
//   data-odt-kind="date-single"   到期日(DatePicker 單日:Popover 裡包 Tooltip 再包觸發點那一種)
// `data-odt-*` 只用來**找元素**;判定一律看量到的像素 / token 計算值(閘的檔頭)。
// 按鈕與下拉選單的 size 明寫 md:閘的期望值綁 --field-height-md,不靠元件的預設值。
// 夾具自己的版面用行內樣式:這個檔不在 Tailwind 的 @source 範圍裡,寫 class 不會產生樣式;DS 元件的樣式來自元件本身。
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { Button } from '@/design-system/components/Button/button'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/design-system/components/DropdownMenu/dropdown-menu'
import { ProfileCard, ProfileCardDefaultActions } from '@/design-system/components/ProfileCard/profile-card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'

const ignore = () => {}
type Tier = 'md' | 'lg'

const regionStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 24, width: 360, padding: 24, border: '1px solid var(--border)',
}

function Region({ tier }: { tier: Tier }) {
  const [sprint, setSprint] = React.useState<[string | null, string | null]>(['2026-11-10', '2026-11-21'])
  const [due, setDue] = React.useState('2026-11-21')
  return (
    <section data-odt-region={tier} data-density={tier} style={regionStyle}>
      <p style={{ margin: 0, fontSize: 12 }}>{tier === 'md' ? '一般密度區塊' : '大密度區塊'}</p>
      <div data-odt-kind="dropdown">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary" size="md">更多動作</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent size="md" data-odt-content="dropdown">
            <DropdownMenuItem onSelect={ignore}>複製連結</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>移動到</DropdownMenuSubTrigger>
              <DropdownMenuSubContent data-odt-content="submenu">
                <DropdownMenuItem onSelect={ignore}>行動 App 改版</DropdownMenuItem>
                <DropdownMenuItem onSelect={ignore}>官網重構</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={ignore}>刪除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div data-odt-kind="hovercard">
        <Avatar
          alt="陳怡君"
          hoverCard={
            <ProfileCard
              data-odt-content="hovercard"
              name="陳怡君"
              subtitle="產品設計師"
              actions={<ProfileCardDefaultActions onChat={ignore} onCall={ignore} />}
              defaultFieldValues={{ id: 'yichun.chen', employeeNumber: 'E-10482' }}
              onViewMore={ignore}
            />
          }
        />
      </div>
      <div data-odt-kind="tooltip">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="tertiary" size="md">匯出報表</Button>
          </TooltipTrigger>
          <TooltipContent data-odt-content="tooltip">把目前篩選結果匯出成 CSV</TooltipContent>
        </Tooltip>
      </div>
      <div data-odt-kind="date-range" style={{ width: 280 }}>
        <DatePicker.Range value={sprint} onChange={setSprint} placeholder={['衝刺開始', '衝刺結束']} />
      </div>
      <div data-odt-kind="date-single" style={{ width: 240 }}>
        <DatePicker value={due} onChange={setDue} aria-label="到期日" />
      </div>
    </section>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('overlay-density-regions fixture:找不到 #fixture-root')
// 與 Storybook 預覽同一層包裝(packages/storybook-config/preview.tsx sharedDecorators:TooltipProvider + 畫布底色 / 字色);
// Storybook 預設不開 StrictMode,這裡也不開(同 field-open-border / dialog-coexistence 夾具)
createRoot(root).render(
  <TooltipProvider delayDuration={500} skipDelayDuration={300}>
    <div style={{ backgroundColor: 'var(--canvas)', color: 'var(--foreground)', display: 'flex', gap: 160, padding: '48px 64px', minHeight: '100svh', alignItems: 'flex-start' }}>
      <Region tier="md" />
      <Region tier="lg" />
    </div>
  </TooltipProvider>,
)
