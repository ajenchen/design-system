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
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="Combobox 標籤溢出"><span className="text-primary hover:underline font-medium cursor-pointer">Combobox 標籤溢出</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="人員頭像 疊合 +N"><span className="text-primary hover:underline font-medium cursor-pointer">PR reviewer 頭像疊合 +N(只顯前 3 位)</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="Breadcrumb 中段收合"><span className="text-primary hover:underline font-medium cursor-pointer">Breadcrumb 中段收合</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="DataTable 人員欄位"><span className="text-primary hover:underline font-medium cursor-pointer">DataTable 人員欄位</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見下方 vs 近親段落)。</p>
    </div>

      {/* vs 近親 — VsScrollAreaRule — 原 VsScrollAreaRule */}
      <div className="prose prose-sm max-w-prose">
      <p>處理超出空間的 2 種策略:</p>
      <ul>
        <li><strong>OverflowIndicator(本元件)</strong>—展示已知數量的 collapse;「我有 N 個 item,看不下去」+1 visual,點開展開或 expand</li>
        <li><strong>ScrollArea</strong>—未知數量或極多 item 時 scroll;讓使用者捲動瀏覽全部</li>
      </ul>
      <p className="text-fg-muted">判斷:item 數可數且少(≤ 100)→ OverflowIndicator;太多或不知數 → ScrollArea。</p>
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
        <p>多選標籤太多、單行放不下 → <LinkTo kind="Design System/Components/Combobox/展示" name="四模式"><span className="text-primary hover:underline font-medium cursor-pointer">Combobox</span></LinkTo> 內部使用 OverflowIndicator;hover `+N` 展開完整清單。對齊 GitHub 多標籤 / Linear 多指派人的做法。</p>

        <h4>Pattern 2 — 人員頭像疊合 +N</h4>
        <p>一群人只顯示前幾位、其餘折成 `+M`。目前由列表元件自行把頭像疊合再放上 OverflowIndicator(形狀用圓形對齊頭像);未來規劃中的 Avatar 群組元件會把這段組合收進去。對齊 Slack 工作區成員預覽 / Linear 團隊成員的做法。</p>

        <h4>Pattern 3 — Tabs / Breadcrumb 水平溢出</h4>
        <p>水平容器(Tabs / Breadcrumb)寬度不夠 → 搭配水平溢出處理 + OverflowIndicator,把中段或末端收合成 `…` 或 `+N`。對齊 Material 可捲動 Tabs + 自動溢出選單 / GitHub Breadcrumb 收合的做法。</p>

        <p className="text-fg-muted">禁止:在頁面程式碼裡自己手刻 `+N` <code>&lt;span&gt;</code>(會失去 hover 展開浮層與一致的形狀樣式)— 一律使用 OverflowIndicator。</p>
      </div>
    </div>
  ),
}
