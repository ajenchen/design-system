// @principles-rationale: Merged WhenToUse + VsHoverCardRule + NotForEssentialInfoRule
// into a single `UsageGuidance` story (3 sections) per 2026-04-26 user mandate to
// consolidate decision-related stories. NeedsTooltipRule kept as separate principle.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Settings, Save, Info, AlertCircle } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Tooltip/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="text-body-lg font-semibold text-foreground mb-3 pb-1 border-b border-divider">{title}</h2>
    <div>{children}</div>
  </section>
)

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-md">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── UsageGuidance — 使用指引(何時用 / 何時不用 + 替代 / vs 近親) ──

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div>
      <Section title="何時用">
        <div className="prose prose-sm max-w-prose">
          <p>適合 Tooltip 的真實業務場景(點擊跳轉「展示」頁範例):</p>
          <ul className="space-y-1">
            <li>
              <LinkTo kind="Design System/Components/Tooltip/展示" name="非 Button 元素"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">非 Button 元素</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/Tooltip/展示" name="基本用法"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">基本用法</span></LinkTo>
            </li>
            <li>
              <LinkTo kind="Design System/Components/Tooltip/展示" name="長文字"><span className="text-primary hover:text-primary-hover font-medium cursor-pointer">長文字</span></LinkTo>
            </li>
          </ul>
          <p className="text-fg-muted mt-3">判斷不確定時:回到「畫面上的資訊是否已足夠」這個核心問題;若提示需要被點擊或停留互動,改用近親元件(見下方「vs 近親」)。</p>
        </div>
      </Section>

      <Section title="何時不用 + 替代">
        <Rule
          title="❌ 不把關鍵資訊只放在 tooltip"
          note="Tooltip 需要 hover 才能看到——觸控裝置(手機 / 平板)根本無法觸發。關鍵資訊(錯誤、必填標示、操作後果)如果只靠 tooltip,觸控使用者會完全看不到"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="primary" danger>刪除帳號</Button>
            </TooltipTrigger>
            <TooltipContent>此動作會永久刪除所有資料且無法復原</TooltipContent>
          </Tooltip>
          <Label warn>↑「永久刪除無法復原」是必要警告 → 必須顯示在畫面上(例如 Dialog 確認時),不能只靠 tooltip hover 才看到</Label>
        </Rule>

        <Rule
          title="❌ 欄位驗證錯誤不放 tooltip"
          note="錯誤訊息必須 persistent 顯示——使用者不應該 hover 才知道哪裡填錯。用 Field 的 inline error message(Field 下方)"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-full px-3 py-1.5 border border-error rounded-md">invalid@email</div>
            </TooltipTrigger>
            <TooltipContent>Email 格式不正確</TooltipContent>
          </Tooltip>
          <Label warn>↑ 錯誤訊息用 tooltip → 使用者需要 hover 才看到;應該直接顯示在 Field 下方</Label>
        </Rule>

        <Rule
          title="✅ 補充資訊可以用 tooltip(錯過也不影響主流程)"
          note="「這個設定是什麼意思」「shortcut key 是什麼」等對主流程非必要的補充可以用 tooltip——看到更好,沒看到也無傷大雅"
        >
          <div className="flex items-center gap-2">
            <span>密度設定</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="text" size="sm" iconOnly startIcon={Info} aria-label="密度說明" />
              </TooltipTrigger>
              <TooltipContent>影響 Button / Input / row 的垂直空間</TooltipContent>
            </Tooltip>
          </div>
          <Label>↑ info icon 的補充說明,錯過不影響使用</Label>
        </Rule>
      </Section>

      <Section title="vs 近親 — Tooltip vs HoverCard">
        <Rule
          title="Tooltip — 純文字、語意為描述、不放互動元素"
          note="適合一句話的提示。語意是純描述（role=tooltip / aria-describedby），不該放可點擊元素。離開 trigger 往浮層移動時，靠 Radix 的 grace 區維持開啟（讓滑鼠可移入），非計時延遲。"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="tertiary" size="sm" iconOnly startIcon={Info} aria-label="說明" />
            </TooltipTrigger>
            <TooltipContent>這個設定會影響所有專案的預設值</TooltipContent>
          </Tooltip>
          <Label>↑ 純文字說明；滑鼠離開觸發器即關閉（移入浮層內容則保持開啟）</Label>
        </Rule>

        <Rule
          title="❌ 需要放互動元素(按鈕 / 連結):用 HoverCard"
          note="Tooltip 語意是純描述（role=tooltip）,不該包含可點擊元素——即使 Radix 浮層技術上可 hover,語意上互動內容（人物名片、連結預覽、操作按鈕）屬 HoverCard。需要互動內容必須改用 HoverCard。"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="tertiary" size="sm">Ada Chen</Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-1">
                <span>Ada Chen</span>
                <button className="text-primary">→ 查看 profile</button>
              </div>
            </TooltipContent>
          </Tooltip>
          <Label warn>↑ tooltip 裡放「查看 profile」按鈕 → 語意是純描述（role=tooltip）不該含可點擊元素 → 改用 HoverCard</Label>
        </Rule>

        <Rule
          title="判斷法:「使用者會想移到浮層上做事嗎?」"
          note="需要 → HoverCard(停留行為可互動);不需要,純看一句話 → Tooltip"
        >
          <Label>完整對照見 HoverCard 的「與 Tooltip 的分界」說明</Label>
        </Rule>
      </Section>
    </div>
  ),
}

export const NeedsTooltipRule: Story = {
  name: '何時需要工具提示',
  render: () => (
    <div>
      <Rule
        title="判斷核心:畫面上的資訊是否已足夠?"
        note="Tooltip 是「補救機制」——當使用者看畫面還不夠理解時才補上。不夠 → 加 tooltip;已足夠 → 不加 tooltip(重複資訊是雜訊)"
      >
        <Label>公式:畫面已清楚 → 不用 / 畫面不清楚 → 補 tooltip</Label>
      </Rule>

      <Rule
        title="✅ Icon-only button 必有 tooltip(icon 沒 label)"
        note="純 icon 按鈕的視覺完全不傳達「做什麼」,hover 需要 tooltip 補 label。Button 的 iconOnly 模式內建自動 tooltip(aria-label 驅動),不需要手動包 Tooltip"
      >
        <div className="flex items-center gap-2">
          <Button variant="tertiary" size="sm" iconOnly startIcon={Settings} aria-label="設定" />
          <Button variant="tertiary" size="sm" iconOnly startIcon={Save} aria-label="儲存" />
          <Button variant="tertiary" size="sm" iconOnly startIcon={AlertCircle} aria-label="警告" />
        </div>
        <Label>↑ hover 每顆會跳出 aria-label 對應的 tooltip(自動,不需手動包)</Label>
      </Rule>

      <Rule
        title="❌ 已有完整 label 的按鈕加 tooltip 重複文字"
        note="Button 上已有「儲存」文字 label,再加一個 tooltip 寫「儲存」是重複無價值。Tooltip 重複時完全沒有資訊增量"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="primary">儲存</Button>
          </TooltipTrigger>
          <TooltipContent>儲存</TooltipContent>
        </Tooltip>
        <Label warn>↑ label 已寫「儲存」,tooltip 又寫「儲存」→ 重複,去掉 tooltip</Label>
      </Rule>

      <Rule
        title="✅ 截斷文字用 tooltip 顯示完整內容(僅當實際被截斷時)"
        note="Tooltip 是資訊補救 — 文字被 truncate 時才顯示完整內容。沒被截斷就不該顯示 tooltip(避免過度互動)"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-32 truncate px-3 py-1 border border-border rounded-md cursor-default">
              非常長的專案名稱會被截斷
            </div>
          </TooltipTrigger>
          <TooltipContent>非常長的專案名稱會被截斷顯示完整版</TooltipContent>
        </Tooltip>
        <Label>↑ 模式示意（此靜態範例恆顯示；實務上應偵測文字真被截斷 `scrollWidth &gt; clientWidth` 時才掛 tooltip）</Label>
      </Rule>
    </div>
  ),
}
