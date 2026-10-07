// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'

const meta: Meta = {
  title: 'Design System/Internal/Command/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── WhenToUse — 何時使用 Command ──────────────────────


// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsSelectMenuRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-[var(--layout-space-loose)]">
      {/* 何時用 — 原 WhenToUse */}
      <div className="max-w-prose">
      <p>適合 Command 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      {/* @layout-space-magic-ok: 連結清單:同質清單項列距(layoutSpace.spec.md:165 同質清單列) */}
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Internal/Command/展示" name="全域指令面板"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">全域指令面板(⌘K)— Linear / VS Code 式跨頁搜尋與快速動作</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Command/展示" name="行內搜尋清單"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">行內搜尋清單 — Gmail 式 sidebar 信件資料夾過濾</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Command/展示" name="純動作指令"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">純動作指令 — 選中立即執行的快速動作清單</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Command/展示" name="無結果狀態"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">搜尋無結果時的空狀態文案(CommandEmpty)</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-[var(--layout-space-tight)]">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方「vs 近親」段)。</p>
    </div>

      {/* vs 近親 — VsSelectMenuRule — 原 VsSelectMenuRule */}
      <div className="max-w-prose">
      <p>兩者皆 keyboard navigation 但 mental model 不同:</p>
      <ul>
        <li><strong>Command</strong> — keyboard-first 命令面板;搜尋為主、可執行 action(non-form)</li>
        <li><strong>SelectMenu</strong> — form-input 的選擇器;value 寫回 form,讀取 selected value</li>
      </ul>
      <p className="text-fg-muted">判斷:結果是「執行某 action」→ Command;結果是「設定欄位 value」→ SelectMenu。</p>
    </div>
    </div>
  ),
}

// ── CompositionRules — Command 的兩個 consumer pattern(對齊 Polaris「Related」+ Material「Use within」)──────

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    // 段落 ↔ 段落 = loose、段落標題 → 內容 = tight(與設計原則頁 Section / Rule 同一套;原本靠沒有安裝的 prose 外掛排版,h4 沒有任何樣式)
    <div className="flex max-w-prose flex-col gap-[var(--layout-space-loose)]">
      <p>Command 是 internal primitive,由消費者組合使用,不直接放在 app code。以下兩種 world-class 慣例(對齊 Linear / Raycast / VS Code Cmd-K idiom):</p>

      <section className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h5 font-semibold text-foreground">Pattern 1 — SelectMenu 內嵌 Command(searchable form input)</h3>
        <p>需要「搜尋 + 選值寫回 form」→ 用 <code>SelectMenu</code>(內部已組合 <code>Popover + Command</code>),<strong>不要</strong>自己組合:</p>
        <ul className="flex flex-col gap-1">
          <li><LinkTo kind="Design System/Components/Combobox/展示" name="四模式"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">Combobox</span></LinkTo>——可搜尋多選(如商品類別多選標籤)</li>
          <li><LinkTo kind="Design System/Components/Select/展示" name="搜尋"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">Select(searchable)</span></LinkTo>——可搜尋單選(如從長國家清單打字篩選)</li>
          <li><LinkTo kind="Design System/Components/PeoplePicker/展示" name="單人"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">PeoplePicker</span></LinkTo>——人員搜尋(如指派任務負責人)</li>
        </ul>
      </section>

      <section className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-h5 font-semibold text-foreground">Pattern 2 — CommandDialog 組成 Command Palette(Cmd+K)</h3>
        <p>需要「全域 keyboard 觸發 + 跨頁搜尋 / 動作」→ 用本 DS export 的 <code>CommandDialog</code>(cmdk + Radix Dialog 包裝,內部已包 Command),不自行組合浮層(對齊 Linear ⌘K / Raycast / VS Code Quick Pick):</p>
        <pre className="text-caption"><code>{`<CommandDialog open={cmdkOpen} onOpenChange={setCmdkOpen}>
  <CommandInput placeholder="輸入指令..." />
  <CommandList>
    <CommandGroup heading="動作">
      <CommandItem>新建文件</CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>`}</code></pre>
      </section>
      <p className="text-fg-muted">禁止:在產品端自己刻搜尋框 + 過濾清單 — 一律重用 Command,不要重造一份。</p>
    </div>
  ),
}
