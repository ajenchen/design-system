// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Sparkles, Bot, Users, FolderPlus, Keyboard, MousePointer2, Command } from 'lucide-react'
import { Coachmark } from './coachmark'
import { MediaGradient } from './coachmark-story-helpers'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta = {
  title: 'Design System/Components/Coachmark/展示',
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj

// ── Single Coachmark: Intercom-style feature discovery ──────────────────────

export const FeatureDiscovery: Story = {
  name: '單步驟新功能介紹',
  render: () => {
    const [open, setOpen] = React.useState(true)
    return (
      <div className="flex flex-col items-center gap-3">
        <Coachmark
          open={open}
          onOpenChange={setOpen}
          image={<MediaGradient from="var(--color-indigo-6)" to="var(--color-purple-6)" icon={Bot} label="AI 助理" />}
          title="試試新的 AI 助理"
          description="在任何文件中按下 AI 按鈕,讓 Claude 幫你摘要、翻譯或改寫內容。"
          onNext={() => setOpen(false)}
          isLastStep  /* single-step → CTA = 「知道了」 */
          side="bottom"
          align="center"
        >
          <Button variant="primary" startIcon={Bot}>AI 助理</Button>
        </Coachmark>
        <p className="text-footnote text-fg-muted">↑ 單步驟只有 1 個 CTA「知道了」,無 Skip(單步驟沒有跳過意義)</p>
      </div>
    )
  },
}

// ── Multi-step Tour: Linear/Notion/Figma onboarding ─────────────────────────

const tourSteps = [
  {
    anchor: '建立 Workspace',
    icon: FolderPlus,
    // 2026-07-14 audit Dim 55:原 `--color-cyan-6` 不存在(primitive 12 hue 無 cyan)→ 漸層
    // 靜默斷掉。改用既有 turquoise(oklch hue 196,最接近 cyan 的 primitive)。
    media: { from: 'var(--color-blue-6)', to: 'var(--color-turquoise-6)', label: 'Workspace' },
    title: '建立你的第一個 Workspace',
    description: 'Workspace 是團隊協作的主要空間,所有專案、文件、成員都在這裡集中管理。',
  },
  {
    anchor: '邀請成員',
    icon: Users,
    media: { from: 'var(--color-yellow-6)', to: 'var(--color-deep-orange-6)', label: '團隊' },
    title: '邀請成員加入',
    description: '輸入 email 寄送邀請,新成員會自動加入這個 Workspace 並看到你目前的專案。',
  },
  {
    anchor: '建立第一個專案',
    icon: Sparkles,
    media: { from: 'var(--color-green-6)', to: 'var(--color-green-7)', label: '專案' },
    title: '建立你的第一個專案',
    description: '專案用來組織相關的任務、文件和討論。你隨時可以建立更多專案或邀請成員加入。',
  },
]

export const MultiStepTour: Story = {
  name: '多步 新手導覽',
  render: () => {
    const [step, setStep] = React.useState(0)
    const [open, setOpen] = React.useState(true)
    const isLast = step === tourSteps.length - 1

    // canonical fix(AR5):只 render 目前 active step 的 Coachmark(其他 step 用 plain Button)。
    // **原本 bug 根因**:所有 3 個 Coachmark 同時 mount,切 step 時 step-0 Coachmark 需淡出(prop
    // `open=false`)→ Radix 內部動畫未結束前無法相信新 Coachmark 的 open=true;step-1 Coachmark
    // Radix 狀態 race → 直接不開,user 看到「next 之後 popover 消失」。
    // 修法:**只 active step render Coachmark wrapper**,Radix 每 step 視為 fresh mount,無 race。
    // 對齊 Ant Tour / Shepherd.js / Joyride 世界級多步驟 tour pattern。
    return (
      <div className="flex flex-col gap-6 min-w-[360px]">
        <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-surface">
          {tourSteps.map((s, i) => {
            const isCurrent = step === i
            const trigger = (
              <Button variant={isCurrent ? 'primary' : 'tertiary'} size="sm" startIcon={s.icon}>
                {s.anchor}
              </Button>
            )
            if (!isCurrent) {
              return <React.Fragment key={s.anchor}>{trigger}</React.Fragment>
            }
            return (
              <Coachmark
                key={s.anchor}
                open={open}
                onOpenChange={setOpen}
                kind="new-features"
                image={<MediaGradient from={s.media.from} to={s.media.to} icon={s.icon} label={s.media.label} />}
                title={s.title}
                description={s.description}
                step={{ current: i + 1, total: tourSteps.length }}
                onPrev={i > 0 ? () => setStep(i - 1) : undefined}
                onSkip={() => setOpen(false)}
                onNext={() => (i === tourSteps.length - 1 ? setOpen(false) : setStep(i + 1))}
                isLastStep={i === tourSteps.length - 1}
                side="bottom"
                align="start"
              >
                {trigger}
              </Coachmark>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Button variant="tertiary" size="sm" onClick={() => { setStep(0); setOpen(true) }}>重設 Tour</Button>
          <span className="text-footnote text-fg-muted self-center">
            目前第 {step + 1} / {tourSteps.length} 步{isLast ? '(最後步 — Next 變 Done)' : ''}
          </span>
        </div>
        <p className="text-footnote text-fg-muted">
          ↑ 多步驟:`kind="new-features"` header 提示脈絡;第 1 步有 Skip,按 Next 進 2+ 步後 Skip 自動隱藏(設計準則)
        </p>
      </div>
    )
  },
}

// ── Multi-step Tips: 鍵盤快捷鍵教學(Linear / Figma 風格)───────────────────

const tipSteps = [
  {
    anchor: '鍵盤導覽',
    icon: Keyboard,
    media: { from: 'var(--color-purple-6)', to: 'var(--color-indigo-6)', label: 'Cmd + K' },
    title: '用 Cmd + K 叫出全站搜尋',
    description: '快速搜尋任何檔案、指令、設定;支援模糊比對與歷史紀錄。多數操作都可以從這裡直接觸發。',
  },
  {
    anchor: '快速切換',
    icon: Command,
    media: { from: 'var(--color-blue-6)', to: 'var(--color-purple-6)', label: 'Cmd + P' },
    title: 'Cmd + P 在最近文件間切換',
    description: '相當於 VS Code / Figma 的 Go to File;按住 Cmd 不放可多次跳轉,放開即停在當前。',
  },
  {
    anchor: '右鍵動作',
    icon: MousePointer2,
    media: { from: 'var(--color-green-6)', to: 'var(--color-blue-6)', label: 'Right-click' },
    title: '右鍵選單集中所有情境動作',
    description: '在任一檔案或列表項上按右鍵,會列出所有可用動作:複製、分享、重新命名、刪除等。',
  },
]

export const TipsMultiStep: Story = {
  name: '多步提示',
  render: () => {
    const [step, setStep] = React.useState(0)
    const [open, setOpen] = React.useState(true)

    // 同 MultiStepTour:只 active step render Coachmark(避免多 Coachmark 共存時 Radix race bug)
    return (
      <div className="flex flex-col gap-6 min-w-[360px]">
        <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-surface">
          {tipSteps.map((s, i) => {
            const isCurrent = step === i
            const trigger = (
              <Button variant={isCurrent ? 'primary' : 'tertiary'} size="sm" startIcon={s.icon}>
                {s.anchor}
              </Button>
            )
            if (!isCurrent) {
              return <React.Fragment key={s.anchor}>{trigger}</React.Fragment>
            }
            return (
              <Coachmark
                key={s.anchor}
                open={open}
                onOpenChange={setOpen}
                kind="tips"
                image={<MediaGradient from={s.media.from} to={s.media.to} icon={s.icon} label={s.media.label} />}
                title={s.title}
                description={s.description}
                step={{ current: i + 1, total: tipSteps.length }}
                onPrev={i > 0 ? () => setStep(i - 1) : undefined}
                onSkip={() => setOpen(false)}
                onNext={() => (i === tipSteps.length - 1 ? setOpen(false) : setStep(i + 1))}
                isLastStep={i === tipSteps.length - 1}
                side="bottom"
                align="start"
              >
                {trigger}
              </Coachmark>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Button variant="tertiary" size="sm" onClick={() => { setStep(0); setOpen(true) }}>重設 Tips</Button>
        </div>
        <p className="text-footnote text-fg-muted">
          ↑ `kind="tips"` header 文字 = 「使用技巧」(vs `new-features` = 「新功能介紹」),兩者的標題都由元件內建對照表自動帶出,consumer 不需自己寫
        </p>
      </div>
    )
  },
}

// 備註(2026-04-21 決策):移除 `TextOnly` 與 `WithIllustration` 兩則範例。
// - TextOnly:user 明示「先不要提供純文字提示風格範例」(缺 media 的 Coachmark 跟 Popover
//   差異太小,讓消費者誤用)
// - WithIllustration:原本 illustration 用硬寫 hex(違 DS token 原則)且視覺差異不明顯,
//   無法傳達「動畫 / illustration 比 flat screenshot 更強」的主訴,刪除避免誤導
