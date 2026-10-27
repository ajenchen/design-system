// @anatomy-rationale:
//   Inspector / ColorMatrix / SizeMatrix / StateBehavior N/A — Command 是
//   headless Internal primitive(cmdk passthrough),不被 App 直接消費,而是透過
//   SelectMenu 等外層元件呈現。色彩 / 尺寸 / 狀態都由消費方(SelectMenu / Combobox /
//   PeoplePicker)決定並在各自的 anatomy 詳述。本檔保留 Overview(教結構與
//   消費路徑)+ Accessibility(6-canonical 中適用的 2 個;2026-05-17 per Dim 13 加)。
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
import { StoryLink } from '@/design-system/stories-helpers/examples/tutorial-page'

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
        <Desc>Command 是基於 cmdk 的搜尋 + 鍵盤導覽清單;項目消費 CommandItem(內包 MenuItem)、空狀態與載入中消費 MenuItem 訊息列(CommandEmpty / CommandLoading)、搜尋列與 SelectMenu 共用。結構:CommandInput(搜尋框)+ CommandList(捲動區)+ CommandGroup(分組)+ CommandItem(項目)+ CommandEmpty(空狀態)。本 DS 在 cmdk 原結構上套用設計 token(顏色 / 字級 / 間距),並用 ScrollArea 包住清單做跨系統一致的捲軸;選項與訊息列都經 MenuItem 取得同一種列幾何,Command 自己不寫第二份樣式。</Desc>
        <div className="rounded-lg border border-border max-w-md overflow-hidden">
          <Command label="搜尋指令">
            <CommandInput placeholder="輸入指令或搜尋..." />
            <CommandEmpty>找不到結果</CommandEmpty>
            <CommandList>
              <CommandGroup heading="常用">
                <CommandItem startIcon={FileText}>建立新文件</CommandItem>
                <CommandItem startIcon={Settings} shortcut="⌘K">前往設定</CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="帳號">
                <CommandItem startIcon={User}>個人資料</CommandItem>
                <CommandItem startIcon={LogOut}>登出</CommandItem>
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
          <br />• 全域指令面板(⌘K)— 跨頁搜尋入口,用 <code className="font-mono text-footnote">CommandDialog</code>(Command 外面套 Dialog 殼;見 <StoryLink kind="Design System/Internal/Command/展示" name="全域指令面板">展示「全域指令面板」</StoryLink>)
        </Desc>
      </div>
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙與鍵盤',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-[var(--layout-space-tight)]">無障礙設計</h3>
      {/* 原本一整段 whitespace-pre-line 字串(開頭「詳 command.spec.md」是內部代號、清單是假的)→ 改成真的段落與清單;段落之間 tight(同一段文字流) */}
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <p>cmdk 自動處理:</p>
        <ul className="list-disc pl-5">
          <li>清單語意:<code>role="listbox"</code></li>
          <li>反白那一列:搜尋框與清單的 <code>aria-activedescendant</code> 都是反白那一列的 id(cmdk 自己的值剛打開時是空的,由 Command 補上);觸發欄位內的搜尋框經 <code>onActiveOptionChange</code> 拿到同一個 id</li>
          <li>滑鼠:握著焦點的是控制這份清單的搜尋框時,滑鼠按在清單上不搬走它的焦點 —— 點選項與按 Enter 結果相同</li>
          <li>搜尋框:<code>role="combobox"</code> + <code>aria-expanded</code> / <code>aria-controls</code> 指向清單</li>
          <li>鍵盤:↑ / ↓ 移動反白、Enter 選取(另支援 Ctrl+n / p / j / k、Home / End)。Esc 只在指令面板(<code>CommandDialog</code>)裡關閉面板;嵌在頁面裡的 Command 按 Esc 沒有反應</li>
          <li>空狀態:<code>&lt;CommandEmpty&gt;</code> 自動帶 <code>role="presentation"</code>,不打斷讀屏器朗讀清單</li>
        </ul>
        <p>嵌在頁面裡的 <code>&lt;Command&gt;</code> 要傳 <code>label</code>(搜尋框的讀屏名稱;指令面板預設「搜尋指令」),其餘保留 cmdk 原結構,用 <code>&lt;CommandInput&gt;</code> / <code>&lt;CommandList&gt;</code> / <code>&lt;CommandItem&gt;</code> 即可。</p>
      </div>
    </div>
  ),
}
