// @anatomy-rationale:
//   Inspector / ColorMatrix / SizeMatrix / StateBehavior N/A — Command 是
//   headless Internal primitive(cmdk passthrough),不被 App 直接消費,而是透過
//   SelectMenu 等外層元件呈現。色彩 / 尺寸 / 狀態都由消費方(SelectMenu / Combobox /
//   PeoplePicker)決定並在各自的 anatomy 詳述。本檔僅保留 Overview 教結構與
//   消費路徑。
import type { Meta, StoryObj } from '@storybook/react'
import { Settings, User, LogOut, FileText } from 'lucide-react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from './command'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Internal/Command/設計規格',
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
        <Desc>Command 是 shadcn passthrough(基於 cmdk library)——搜尋 + 鍵盤導覽的指令清單。結構:CommandInput(搜尋框)+ CommandList(捲動區)+ CommandGroup(分組)+ CommandItem(項目)+ CommandEmpty(空狀態)。本 DS 在 cmdk 原結構上套用設計 token(顏色 / 字級 / 間距),並用 ScrollArea 包住清單做跨系統一致的捲軸;選項與空狀態的樣式直接寫在 Command 內,不透過其他元件。</Desc>
        <div className="rounded-lg border border-border max-w-md overflow-hidden">
          <Command>
            <CommandInput placeholder="輸入指令或搜尋..." />
            <CommandList>
              <CommandEmpty>找不到結果</CommandEmpty>
              <CommandGroup heading="常用">
                <CommandItem>
                  <FileText className="mr-2 h-4 w-4" />
                  建立新文件
                </CommandItem>
                <CommandItem>
                  <Settings className="mr-2 h-4 w-4" />
                  前往設定
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="帳號">
                <CommandItem>
                  <User className="mr-2 h-4 w-4" />
                  個人資料
                </CommandItem>
                <CommandItem>
                  <LogOut className="mr-2 h-4 w-4" />
                  登出
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </div>

      <div>
        <H3>結構元件</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>元件</Th><Th>作用</Th></tr></thead>
            <tbody>
              <tr><Td mono>Command</Td><Td>根容器,包住整個搜尋清單</Td></tr>
              <tr><Td mono>CommandInput</Td><Td>搜尋框(自動過濾 items)</Td></tr>
              <tr><Td mono>CommandList</Td><Td>捲動區,包含 items</Td></tr>
              <tr><Td mono>CommandEmpty</Td><Td>搜尋無結果時顯示的空狀態文案</Td></tr>
              <tr><Td mono>CommandGroup</Td><Td>分組容器(可選 heading)</Td></tr>
              <tr><Td mono>CommandItem</Td><Td>單一選項,含圖示 + 文字 + 右側 shortcut</Td></tr>
              <tr><Td mono>CommandSeparator</Td><Td>分組間分隔線</Td></tr>
              <tr><Td mono>CommandShortcut</Td><Td>右側 shortcut 提示(⌘K 等)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>消費場景</H3>
        <Desc>Command 本身不單獨使用,透過 SelectMenu 外層元件消費:
          <br />• <code className="font-mono text-footnote">SelectMenu</code> — Select / Combobox / PeoplePicker 的 searchable 浮層
          <br />• <code className="font-mono text-footnote">Command Palette</code>(Cmd+K)— 全局跨頁搜尋入口(消費本檔 export 的 CommandDialog 包裝,cmdk + Radix Dialog;見展示層「CommandPalette」)
        </Desc>
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
      <p className="whitespace-pre-line">{"詳 `command.spec.md` 「A11y 預設」段。摘要:\n\ncmdk 自動處理：\n\n-   List 語意  ： role=\"listbox\"  +  aria-activedescendant  指向目前 highlight 項\n-   搜尋框  ： role=\"combobox\"  +  aria-expanded  /  aria-controls  指向 list\n-   鍵盤導覽  ：cmdk 提供 ↑ / ↓ 移動 highlight、Enter 選取（另支援 vim-style Ctrl+n/p/j/k、Home/End）。cmdk 本身無 Esc handler — Esc 關閉僅在 CommandDialog（Cmd+K）模式由 Radix Dialog 的 DismissableLayer 提供；inline <Command> 模式按 Esc 無反應\n-   空狀態  ： <CommandEmpty>  自動帶  role=\"presentation\" ,不干擾 screen reader 的 list 朗讀\n\nConsumer 無需額外處理 a11y,保留 cmdk 原結構 + 使用  <CommandInput>  /  <CommandList>  /  <CommandItem>  即可。"}</p>
    </div>
  ),
}
