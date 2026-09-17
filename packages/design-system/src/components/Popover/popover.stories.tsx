import type { Meta, StoryObj } from '@storybook/react'
import { Filter } from 'lucide-react'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverTitle,
} from './popover'
import * as React from 'react'
import { Button } from '@/design-system/components/Button/button'
import { Command, CommandList, CommandGroup, CommandItem } from '@/design-system/components/Command/command'

const meta: Meta = {
  title: 'Design System/Components/Popover/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: { description: { component: '由 trigger 錨定的輕量浮層，可承載簡短資訊、篩選或小型表單。內容需要保留來源位置且不值得打斷整頁時使用；複雜流程改用 Dialog 或 Sheet。' } },
  },
}
export default meta
type Story = StoryObj

const STATUS_OPTIONS = ['待處理', '進行中', '已完成', '已封存'] as const

/**
 * 狀態篩選面板 —— 兩支 story(互動版 / 截圖版)共用同一份內容,避免只改一邊造成漂移。
 *
 * body 主體就是一份可選清單 → 走 `overlay-surface.spec.md`「List-as-region in overlay body」:
 * body 撤掉 chrome padding、`CommandGroup` 自帶 `py-2` 給上下呼吸、item 自帶 `px-loose`。
 * 容器用 `Command`(cmdk)而不是裸 `MenuItem`:`menu-item.spec.md:246` 要求選單項目待在提供鍵盤
 * 導覽與 listbox 結構的容器內,`Command` 自帶方向鍵與 `role="listbox"`(`SelectMenu` 內部走同一條路)。
 * **列的水平內距是唯一要客製的東西**,而且**設在清單容器上、不是設在每一列**:
 * 列的內距讀 `--item-px`(owner = `item-anatomy.spec.md`「Token: `--item-px`」,預設 `var(--field-px)` 12px);
 * 這裡在 `Command` 根設一次 `var(--layout-space-loose)`(16px),整份清單(含空狀態 / 載入中訊息列)一起換。
 *
 * 目的是讓**列的最前緣**(這裡是勾選框)對齊 header 標題與 footer 按鈕左緣
 * (`overlay-surface.spec.md:100` 第 2 條 + `:202` footer 同一條對齊線)。**對齊的是前緣不是文字** ——
 * `item-anatomy.spec.md:423` content 槽的 x 是剩餘空間、`:665`/`:671` 跨群組不強求文字對齊、
 * `:677` 把「為了讓文字齊左而改前綴尺寸」列為錯誤示範。
 *
 * **禁止寫在單列的 `className`**:`CommandItem` 是兩層,外層 cmdk Item 負責「反白底色鋪滿整列」恆為
 * `p-0`(`command.tsx:326`),內層 `MenuItem` 才帶內距(`:352-366`)。寫在 className 會落在外層與內層相加 ——
 * 2026-09-17 實測 16+12=28px,標題在 17px、勾選框跑到 29px。機械閘 `scripts/overlay-list-as-region-invariant.mjs`。
 */
function StatusFilterPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  // 暫存選擇:勾選只改這裡,按「套用」才 commit(對照 DropdownMenu 的 click 即觸發)。
  const [staged, setStaged] = React.useState<string[]>(['待處理', '進行中'])
  const toggle = (value: string) =>
    setStaged((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <Button variant="tertiary" startIcon={Filter}>依狀態篩選</Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>依狀態篩選</PopoverTitle>
        </PopoverHeader>
        <PopoverBody className="!px-0 !pt-0 !pb-0">
          <Command label="狀態選項" style={{ '--item-px': 'var(--layout-space-loose)' } as React.CSSProperties}>
            <CommandList>
              <CommandGroup>
                {STATUS_OPTIONS.map((status) => (
                  <CommandItem
                    key={status}
                    value={status}
                    checkbox
                    checked={staged.includes(status)}
                    onSelect={() => toggle(status)}
                  >
                    {status}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverBody>
        <PopoverFooter>
          <Button variant="tertiary" size="sm" className="flex-1" onClick={() => setStaged([])}>清除</Button>
          <Button variant="primary" size="sm" className="flex-1">套用</Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  )
}

export const FilterPanel: Story = {
  name: '篩選面板',
  render: () => <StatusFilterPanel />,
}

/**
 * OpenSnapshot — visual-audit 專用 story(非 consumer-facing 教學範例)。
 *
 * 用 `defaultOpen` 讓 Popover 在 render 當下就開著,Playwright 截圖才抓得到
 * Popover chrome(Header + X / Body / Footer)。不用 play() + userEvent,是
 * 因為 Radix `defaultOpen` 對 Portal 自動生效 — 世界級 DS 的 chromatic 稽核
 * 也走同 pattern。
 *
 * 情境沿用 FilterPanel(Jira / Linear 狀態篩選),是 Popover「多選 + footer
 * save CTA」canonical 的完整示範,涵蓋 Header X、checkbox list、footer 雙
 * action 整組 chrome。
 */
export const OpenSnapshot: Story = {
  name: '開啟狀態',
  tags: ['test-only'],
  render: () => <StatusFilterPanel defaultOpen />,
}

// SettingsPanel story 於 2026-04-20 移除:
//   原本是「顯示設定 mini panel (Notion 頁面設定)」— 用 Popover + 多個 horizontal
//   Field + Switch 展示 settings list。
//
//   B13 決策(user 回饋):Notion 頁面設定的實際做法是 `<DropdownMenu>` +
//   `<DropdownMenuCheckboxItem>` — menu 內 binary toggle 已由 CheckboxItem 覆蓋
//   (見 `../DropdownMenu/dropdown-menu.stories.tsx` 的 `CheckboxItems` story)。
//   Popover 的 canonical 是「自由組合 UI 面板」(filter / form / 圖表),純 toggle
//   列表用 DropdownMenu 語意更準確 + 鍵盤上下導覽更自然。
//
//   同一情境兩處 demo = 噪音 + 教壞 consumer,不保留重複範例。Popover 只保留
//   FilterPanel(多選 checkbox + footer save CTA — Popover canonical)即可。

// BareBody 範例於 2026-04-20 移除:
//   原 demo 是「選擇優先度」(5 個選項選一個)、在浮層內手刻原生按鈕當作
//   item 列表 — 這是 `<Select>` / `<DropdownMenu>` 的標準情境,不該走 Popover。
//
//   B1 決策(user):menu / select / combobox 早已定義過那種「格式化的選單範例」,
//   Popover 不再 demo。Popover 的本質是「輕量盡量不干擾使用者心流的 modal」—
//   結構化 form / filter / settings 等情境才是 canonical。
