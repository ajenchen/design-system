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
import { Button } from '@/design-system/components/Button/button'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { CheckboxGroup } from '@/design-system/components/Checkbox/checkbox-group'

const meta: Meta = {
  title: 'Design System/Components/Popover/展示',
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj

export const FilterPanel: Story = {
  name: '篩選面板',
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="tertiary" startIcon={Filter}>依狀態篩選</Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>依狀態篩選</PopoverTitle>
        </PopoverHeader>
        <PopoverBody>
          {/* 此 Popover 是「多選 + footer save CTA」模式 — 勾多項按「套用」才 commit。
              區別於 DropdownMenu「click 即觸發」。CheckboxGroup canonical 自帶 zero-gap
              + Context 隔離,取代既有手刻 grid div(2026-04-29 migration)。 */}
          {/* CheckboxGroup zero-gap canonical(checkbox.spec.md L225)— 取代既有手刻 grid div */}
          <CheckboxGroup>
            <Checkbox defaultChecked label="待處理" />
            <Checkbox defaultChecked label="進行中" />
            <Checkbox label="已完成" />
            <Checkbox label="已封存" />
          </CheckboxGroup>
        </PopoverBody>
        <PopoverFooter>
          <Button variant="tertiary" size="sm" className="flex-1">清除</Button>
          <Button variant="primary" size="sm" className="flex-1">套用</Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  ),
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
  tags: ['!autodocs'],
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="tertiary" startIcon={Filter}>依狀態篩選</Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>依狀態篩選</PopoverTitle>
        </PopoverHeader>
        <PopoverBody>
          {/* CheckboxGroup zero-gap canonical(checkbox.spec.md L225)— 取代既有手刻 grid div */}
          <CheckboxGroup>
            <Checkbox defaultChecked label="待處理" />
            <Checkbox defaultChecked label="進行中" />
            <Checkbox label="已完成" />
            <Checkbox label="已封存" />
          </CheckboxGroup>
        </PopoverBody>
        <PopoverFooter>
          <Button variant="tertiary" size="sm" className="flex-1">清除</Button>
          <Button variant="primary" size="sm" className="flex-1">套用</Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  ),
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
//   原 demo 是「選擇優先度」(5 個選項選一個)、手刻 `<Popover>` 內放 raw `<button>`
//   item 列表 — 這是 `<Select>` / `<DropdownMenu>` 的標準情境,不該走 Popover。
//
//   B1 決策(user):menu / select / combobox 早已定義過那種「格式化的選單範例」,
//   Popover 不再 demo。Popover 的本質是「輕量盡量不干擾使用者心流的 modal」—
//   結構化 form / filter / settings 等情境才是 canonical。
