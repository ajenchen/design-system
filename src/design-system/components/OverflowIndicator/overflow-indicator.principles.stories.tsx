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
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="人員頭像 stack +N"><span className="text-primary hover:underline font-medium cursor-pointer">人員頭像 stack +N</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="形狀對照"><span className="text-primary hover:underline font-medium cursor-pointer">形狀對照</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="Breadcrumb 中段收合"><span className="text-primary hover:underline font-medium cursor-pointer">Breadcrumb 中段收合</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/OverflowIndicator/展示" name="DataTable 人員欄位"><span className="text-primary hover:underline font-medium cursor-pointer">DataTable 人員欄位</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
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
        <p>OverflowIndicator 是 internal `+N` pill primitive,由三類 consumer 在「visible 子集 + 隱藏剩餘」場景消費,**不直接放在 app code**:</p>

        <h4>Pattern 1 — Combobox tag overflow(單行模式)</h4>
        <p>多選 tag 過多無法單行顯示 → <LinkTo kind="Design System/Components/Combobox/展示" name="預設"><span className="text-primary hover:underline font-medium cursor-pointer">Combobox</span></LinkTo> 內部消費 OverflowIndicator;hover `+N` 展開完整清單。對齊 GitHub multi-label / Linear multi-assignee idiom。</p>

        <h4>Pattern 2 — Avatar.Group +N(人員 stack)</h4>
        <p>Avatar 群組顯示前 N 人 + 剩餘 `+M` → Avatar.Group 內部消費 OverflowIndicator(形狀對齊 Avatar 圓形)。對齊 Slack workspace member preview / Linear team members 慣例。</p>

        <h4>Pattern 3 — Tabs / Breadcrumb 水平溢出</h4>
        <p>水平容器(Tabs / Breadcrumb)寬度不夠 → 搭配 <code>horizontal-overflow</code> pattern + OverflowIndicator,中段或末端收合成 `…` 或 `+N`。對齊 Material <code>Tabs scrollable</code> + 自動 overflow menu / GitHub Breadcrumb collapse。</p>

        <p className="text-fg-muted">禁止:在 app code 自刻 `+N` <code>&lt;span&gt;</code>(失去 hover popover + 形狀 token 一致性)— 必消費 OverflowIndicator(對齊 M1 SSOT 消費 canonical)。</p>
      </div>
    </div>
  ),
}
