// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'

const meta: Meta = {
  title: 'Design System/Internal/OverflowIndicator/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── WhenToUse — 何時使用 OverflowIndicator ──────────────────────


// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsScrollAreaRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 OverflowIndicator 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="Combobox 標籤溢出"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">Combobox 標籤溢出</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="人員頭像 疊合 +N"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">PR reviewer 頭像疊合 +N(只顯前 3 位)</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="DataTable 人員欄位"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">DataTable 人員欄位</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親段落)。</p>
    </div>

      {/* vs 近親 — VsScrollAreaRule — 原 VsScrollAreaRule */}
      <div className="prose prose-sm max-w-prose">
      <p>處理超出空間的 2 種策略:</p>
      <ul>
        <li><strong>OverflowIndicator(本元件)</strong>—項目數量已知且不多時,顯示前幾個、其餘折成 <code>+N</code>,hover 展開看完整清單</li>
        <li><strong>ScrollArea</strong>—項目數量未知或極多時,讓使用者捲動瀏覽全部</li>
      </ul>
      <p className="text-fg-muted">判斷:項目少量、已知、適合一次預覽 → OverflowIndicator;數量大、未知或需連續瀏覽 → ScrollArea。</p>
    </div>
    </div>
  ),
}

// ── CompositionRules — OverflowIndicator 三個 consumer pattern ──────

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    <div className="flex flex-col gap-12">
      <div className="prose prose-sm max-w-prose">
        <p>OverflowIndicator 是顯示「還有 N 個沒列出來」的 `+N` 小標籤,由下列幾種元件在內部使用(顯示前幾項 + 把剩下的折成 `+N`),不直接放在頁面程式碼裡:</p>

        <h4>Pattern 1 — Combobox 標籤溢出(單行模式)</h4>
        <p>多選標籤太多、單行放不下 → <LinkTo kind="Design System/Components/Combobox/展示" name="四模式"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">Combobox</span></LinkTo> 內部使用 OverflowIndicator;hover `+N` 展開完整清單。對齊 GitHub 多標籤 / Linear 多指派人的做法。</p>

        <h4>Pattern 2 — 人員頭像疊合 +N</h4>
        <p>一群人只顯示前幾位、其餘折成 `+M`。目前由列表元件自行把頭像疊合再放上 OverflowIndicator(形狀用圓形對齊頭像);未來規劃中的 Avatar 群組元件會把這段組合收進去。對齊 Slack 工作區成員預覽 / Linear 團隊成員的做法。</p>

        <h4>Pattern 3 — PeoplePicker 人員選擇欄位 +N</h4>
        <p>人員選擇欄位選了多位、單行放不下 → PeoplePicker(<code>PersonDisplay</code>)內部使用 OverflowIndicator(圓形對齊頭像),hover `+N` 展開完整名單。對齊 Linear 多指派人 / Jira watchers 的做法。</p>

        <p className="text-fg-muted">水平容器(Tabs / 單行 chip 列)寬度不夠時<strong className="font-medium">不用本元件</strong>——DS canonical 是 <code>horizontal-overflow</code> 的 <code>OverflowMenuTriggerButton</code> + DropdownMenu(click 開選單,見 horizontal-overflow.spec.md);Breadcrumb 中段收合走 BreadcrumbEllipsis + DropdownMenu(見 breadcrumb.spec.md)。兩者皆 click 開選單,與本元件 hover 展開語義不同。</p>

        <p className="text-fg-muted">禁止:在頁面程式碼裡自己手刻 `+N` <code>&lt;span&gt;</code>(會失去 hover 展開浮層與一致的形狀樣式)— 一律使用 OverflowIndicator。</p>
      </div>
    </div>
  ),
}
