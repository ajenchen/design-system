// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import type { Meta, StoryObj } from '@storybook/react'
import LinkTo from '@storybook/addon-links/react'

const meta: Meta = {
  title: 'Design System/Internal/Menu/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── WhenToUse — 何時使用 Menu ──────────────────────


// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsItemAnatomyRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Menu 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Internal/Menu/展示" name="基本"><span className="text-primary hover:underline font-medium cursor-pointer">信箱資料夾切換選單(收件匣 / 草稿 / 已傳送)— 純文字選項</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Menu/展示" name="前置圖示 + 說明文字"><span className="text-primary hover:underline font-medium cursor-pointer">通知偏好設定選單 — 前置圖示 + 說明文字</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Menu/展示" name="頭像"><span className="text-primary hover:underline font-medium cursor-pointer">指派負責人選單 — 人員頭像列</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Menu/展示" name="頭像 + 說明文字"><span className="text-primary hover:underline font-medium cursor-pointer">跨部門選人 — 頭像 + 部門說明文字</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Internal/Menu/展示" name="多選"><span className="text-primary hover:underline font-medium cursor-pointer">通知管道多選(電子郵件 / 推播 / Slack)</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:先確認情境是否屬於上面這些「在選單裡挑一個或多個選項」的場景;若不是(例如是可編輯的表單欄位、或需要大塊內容的列表行),改用對應的近親元件,下方「vs 近親元件」段有說明。</p>
    </div>

      {/* vs 近親元件 */}
      <div className="prose prose-sm max-w-prose">
      <p className="font-medium">vs 近親元件</p>
      <p>MenuItem 是「選單選項列」這個樣式的實際元件;它的排版規則(左側圖示/頭像、文字、右側標記怎麼對齊)與選單選項、列表項、檔案項等共用同一套設計準則。</p>
      <ul>
        <li><strong>MenuItem(本元件)</strong>—實際畫出選單一列的元件</li>
        <li><strong>選項列共用設計準則</strong>—文件層級的規範,定義所有同類列(選單選項 / 列表項 / 檔案項)共通的排版規則</li>
      </ul>
      <p className="text-fg-muted">要改的是排版規則(各類列共通)→ 改設計準則文件;要改的是這個元件本身的行為 → 改 MenuItem 元件。</p>
    </div>
    </div>
  ),
}

// ── CompositionRules — MenuItem 三個 consumer pattern(對齊 Polaris「Related」+ Radix「Use within」)──────

export const CompositionRules: Story = {
  name: '組合規則',
  render: () => (
    <div className="flex flex-col gap-12">
      <div className="prose prose-sm max-w-prose">
        <p>MenuItem 是選單選項列的共用排版元件,由以下三類選單元件包起來使用,不會直接寫在產品頁面裡:</p>

        <h4>Pattern 1 — DropdownMenu + MenuItem(action menu)</h4>
        <p>使用者點擊觸發某個 action(複製 / 刪除 / 重新命名)→ <LinkTo kind="Design System/Components/DropdownMenu/展示" name="基本"><span className="text-primary hover:underline font-medium cursor-pointer">DropdownMenu</span></LinkTo>(Radix 控制 open / close + keyboard nav,MenuItem 提供 row layout)。</p>

        <h4>Pattern 2 — SelectMenu(Popover + Command + MenuItem)— form value 選擇</h4>
        <p>使用者選一個 / 多個值寫回 form → <LinkTo kind="Design System/Components/Select/展示" name="四模式"><span className="text-primary hover:underline font-medium cursor-pointer">Select</span></LinkTo> / <LinkTo kind="Design System/Components/Combobox/展示" name="四模式"><span className="text-primary hover:underline font-medium cursor-pointer">Combobox</span></LinkTo>(內部已組合 SelectMenu + cmdk + MenuItem)。</p>

        <h4>Pattern 3 — ContextMenu + MenuItem(右鍵選單,未來)</h4>
        <p>右鍵觸發 contextual action → 預留消費者(Radix ContextMenu + MenuItem 同 layout primitive)。</p>

        <p className="text-fg-muted">禁止:在產品頁面裡自己用 <code>&lt;div&gt;</code> 拼一列選單(像 <code>&lt;div className="flex px-2 py-1.5"&gt;</code>)— 一律使用 MenuItem,才能確保所有選單列的對齊與間距一致。各區塊的對齊規則(左側圖示/頭像在 24px 內對齊、文字往下堆疊、右側標記可有可無)由選項列共用設計準則統一規範。</p>
      </div>
    </div>
  ),
}
