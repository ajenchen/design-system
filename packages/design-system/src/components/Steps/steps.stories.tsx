// @story-trait-rationale: AllSizes retired 2026-05-15(anatomy SizeMatrix own size matrix);
//   AllStates retired 2026-05-17 per audit Dim 46(anatomy StateBehavior own state matrix,
//   manual trait grid 違 story-rules.md 三層定位「展示層 = 典型使用情境,不是 trait grid」)。
//   Disabled state 由 FocusRingCombinations 內部展示(disabled + ring combo 正交)。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Check } from 'lucide-react'
import {
  Steps,
  StepItem,
  StepLabel,
  StepDescription,
  StepContent,
} from './steps'
import { Button } from '@/design-system/components/Button/button'

const meta: Meta<typeof Steps> = {
  title: 'Design System/Components/Steps/展示',
  component: Steps,
  parameters: { layout: 'padded' },
}
export default meta

type Story = StoryObj<typeof Steps>

// ── 典型 wizard ──────────────────────────────────────────────────────────

export const Default: Story = {
  name: '預設',
  render: () => {
    const [value, setValue] = React.useState('info')
    const [completed, setCompleted] = React.useState<string[]>([])
    const [submitted, setSubmitted] = React.useState(false)

    const advance = () => {
      const nextMap: Record<string, string> = { info: 'account', account: 'review' }
      setCompleted(prev => Array.from(new Set([...prev, value])))
      const next = nextMap[value]
      if (next) setValue(next)
    }
    const back = () => {
      const prevMap: Record<string, string> = { account: 'info', review: 'account' }
      const prev = prevMap[value]
      if (prev) setValue(prev)
    }
    const submit = () => {
      setCompleted(prev => Array.from(new Set([...prev, 'review'])))
      setSubmitted(true)
    }
    const reset = () => {
      setValue('info')
      setCompleted([])
      setSubmitted(false)
    }

    // ── Pattern A:submit 在最後一步,送出後整個 wizard 替換成 success banner ──
    // 世界級 wizard UX(Ant / Linear / Stripe 常見):最後一步的 submit 按下後,
    // stepper 不再顯示,改成一個 success card(+ 重置 button for demo 用)。
    if (submitted) {
      return (
        <div className="w-[480px] flex flex-col gap-4 p-6 bg-muted rounded-md border border-border">
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Check className="text-white" size={20} strokeWidth={2.5} aria-hidden />
            </span>
            <span className="text-body-lg font-medium text-foreground">
              已成功送出申請
            </span>
          </div>
          <p className="text-body text-fg-secondary">
            我們會盡快處理,結果將寄送至您的電子信箱。
          </p>
          <div>
            <Button variant="secondary" onClick={reset}>
              重新開始 demo
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="w-[480px]">
        <Steps
          value={value}
          onValueChange={setValue}
          completedValues={completed}
        >
          <StepItem value="info">
            <StepLabel>基本資料</StepLabel>
            <StepDescription>填寫姓名與聯絡方式</StepDescription>
            <StepContent>
              <div className="flex flex-col gap-3">
                <p className="text-body text-fg-secondary">
                  請輸入你的姓名、電子郵件與電話。
                </p>
                <div className="flex gap-2">
                  <Button onClick={advance}>下一步</Button>
                </div>
              </div>
            </StepContent>
          </StepItem>

          <StepItem value="account">
            <StepLabel>帳號設定</StepLabel>
            <StepDescription>選擇使用者名稱與密碼</StepDescription>
            <StepContent>
              <div className="flex flex-col gap-3">
                <p className="text-body text-fg-secondary">
                  設定登入帳號。使用者名稱至少 3 個字元。
                </p>
                <div className="flex gap-2">
                  <Button onClick={advance}>下一步</Button>
                  <Button variant="secondary" onClick={back}>
                    上一步
                  </Button>
                </div>
              </div>
            </StepContent>
          </StepItem>

          <StepItem value="review">
            <StepLabel>確認並送出</StepLabel>
            <StepDescription>送出前最後檢查</StepDescription>
            <StepContent>
              <div className="flex flex-col gap-3">
                <p className="text-body text-fg-secondary">
                  請確認所有欄位正確,按下送出後系統會建立您的帳號。
                </p>
                <div className="flex gap-2">
                  <Button onClick={submit}>送出</Button>
                  <Button variant="secondary" onClick={back}>
                    上一步
                  </Button>
                </div>
              </div>
            </StepContent>
          </StepItem>
        </Steps>
      </div>
    )
  },
}

// @story-trait-rationale: AllSizes + AllStates retired per F migration 2026-05-17 —
//   AllSizes retired 2026-05-15(anatomy SizeMatrix own);AllStates retired 2026-05-17
//   per Dim 46 audit(anatomy StateBehavior 已 own state matrix,manual trait grid 違反
//   story-rules.md 三層定位「展示層應為典型使用情境,不是 trait grid」)。

// ── Focus marker 的正交示範 ─────────────────────────────────────────────
// Ring 跟 content state 正交:任何 state + focused 都能組合

export const FocusRingCombinations: Story = {
  name: 'Ring 正交示範',
  render: () => {
    const [value, setValue] = React.useState('step-2')
    return (
      <div className="flex flex-col gap-4 w-[420px]">
        <p className="text-caption text-fg-secondary">
          點任何 step 看看 ring 如何獨立於底色——ring 表達「使用者在這步」,底色
          表達「這步的狀態」。兩者正交。
        </p>
        <div className="flex gap-2">
          {['step-1', 'step-2', 'step-3', 'step-4'].map(v => (
            <Button
              key={v}
              size="sm"
              variant={value === v ? 'primary' : 'secondary'}
              onClick={() => setValue(v)}
            >
              value={v}
            </Button>
          ))}
        </div>
        <Steps
          value={value}
          onValueChange={setValue}
          completedValues={['step-1', 'step-3']}
          errorValues={['step-4']}
          linear={false}
        >
          <StepItem value="step-1">
            <StepLabel>Completed</StepLabel>
            <StepDescription>藍底 ✓ + ring(若 focused)</StepDescription>
          </StepItem>
          <StepItem value="step-2">
            <StepLabel>Current</StepLabel>
            <StepDescription>藍底數字 + ring(若 focused)</StepDescription>
          </StepItem>
          <StepItem value="step-3">
            <StepLabel>Completed</StepLabel>
            <StepDescription>藍底 ✓ + ring(若 focused)</StepDescription>
          </StepItem>
          <StepItem value="step-4">
            <StepLabel>Error</StepLabel>
            <StepDescription>紅底 ✕ + 紅 ring(若 focused)</StepDescription>
          </StepItem>
        </Steps>
      </div>
    )
  },
}

// ── Non-linear ──────────────────────────────────────────────────────────

export const NonLinear: Story = {
  name: '非線性',
  render: () => {
    const [value, setValue] = React.useState('overview')
    return (
      <div className="w-[360px]">
        <Steps
          value={value}
          onValueChange={setValue}
          completedValues={['overview']}
          linear={false}
        >
          <StepItem value="overview">
            <StepLabel>總覽</StepLabel>
            <StepDescription>可隨時回看</StepDescription>
          </StepItem>
          <StepItem value="members">
            <StepLabel>成員管理</StepLabel>
            <StepDescription>新增 / 移除團隊成員</StepDescription>
          </StepItem>
          <StepItem value="billing">
            <StepLabel>計費設定</StepLabel>
            <StepDescription>付款方式</StepDescription>
          </StepItem>
          <StepItem value="integrations">
            <StepLabel>整合</StepLabel>
            <StepDescription>連接第三方服務</StepDescription>
          </StepItem>
        </Steps>
      </div>
    )
  },
}

// ── Horizontal ──────────────────────────────────────────────────────────

export const Horizontal: Story = {
  name: '水平',
  render: () => {
    const [value, setValue] = React.useState('shipping')
    return (
      <div className="w-full max-w-3xl">
        <Steps
          value={value}
          onValueChange={setValue}
          completedValues={['cart', 'address']}
          orientation="horizontal"
        >
          <StepItem value="cart">
            <StepLabel>購物車</StepLabel>
            <StepDescription>已確認</StepDescription>
          </StepItem>
          <StepItem value="address">
            <StepLabel>寄送地址</StepLabel>
            <StepDescription>已填寫</StepDescription>
          </StepItem>
          <StepItem value="shipping">
            <StepLabel>運送方式</StepLabel>
            <StepDescription>選擇配送</StepDescription>
          </StepItem>
          <StepItem value="payment">
            <StepLabel>付款</StepLabel>
            <StepDescription>信用卡 / Apple Pay</StepDescription>
          </StepItem>
          <StepItem value="done">
            <StepLabel>完成</StepLabel>
          </StepItem>
        </Steps>
      </div>
    )
  },
}

// ── Multiple expansion ─────────────────────────────────────────────────

export const MultipleExpansion: Story = {
  name: 'Multiple 展開模式',
  render: () => (
    <div className="w-[480px]">
      <p className="text-caption text-fg-secondary mb-4">
        點 step header 切換展開。預設 `all` = 全部展開起手。
      </p>
      <Steps
        defaultValue="b"
        completedValues={['a']}
        expansion="multiple"
        defaultExpanded="all"
        linear={false}
      >
        <StepItem value="a">
          <StepLabel>安裝套件</StepLabel>
          <StepDescription>執行 npm install</StepDescription>
          <StepContent>
            <div className="max-w-full overflow-x-auto rounded-md bg-muted">
              <pre className="text-caption p-3 whitespace-pre w-max">
              npm install @qijenchen/design-system
            </pre>
            </div>
          </StepContent>
        </StepItem>
        <StepItem value="b">
          <StepLabel>匯入元件</StepLabel>
          <StepDescription>從 design-system 引入</StepDescription>
          <StepContent>
            <div className="max-w-full overflow-x-auto rounded-md bg-muted">
              <pre className="text-caption p-3 whitespace-pre w-max">
              {"import { Steps } from '@/design-system/components/Steps/steps'"}
            </pre>
            </div>
          </StepContent>
        </StepItem>
        <StepItem value="c">
          <StepLabel>設定 provider</StepLabel>
          <StepDescription>包在 App 最外層</StepDescription>
          <StepContent>
            <div className="max-w-full overflow-x-auto rounded-md bg-muted">
              <pre className="text-caption p-3 whitespace-pre w-max">
              {"<TooltipProvider>{children}</TooltipProvider>"}
            </pre>
            </div>
          </StepContent>
        </StepItem>
      </Steps>
    </div>
  ),
}

// ── Without description ─────────────────────────────────────────────────
// 驗證 column rhythm:混用有/無 description 的 step,indicator y 位置不變

export const MixedDescription: Story = {
  name: '欄 節奏 驗證',
  render: () => (
    <div className="flex gap-12">
      {(['md', 'lg'] as const).map(size => (
        <div key={size} className="w-[280px]">
          <div className="text-caption text-fg-muted mb-4">size = {size}</div>
          <Steps
            defaultValue="step-3"
            completedValues={['step-1', 'step-2']}
            size={size}
          >
            <StepItem value="step-1">
              <StepLabel>建立帳號</StepLabel>
            </StepItem>
            <StepItem value="step-2">
              <StepLabel>驗證 Email</StepLabel>
              <StepDescription>發送確認信至你的信箱</StepDescription>
            </StepItem>
            <StepItem value="step-3">
              <StepLabel>設定團隊</StepLabel>
              <StepDescription>
                命名你的工作區、選擇方案、匯入現有專案;這個步驟結束後可隨時在設定頁
                調整
              </StepDescription>
            </StepItem>
            <StepItem value="step-4">
              <StepLabel>邀請成員</StepLabel>
            </StepItem>
          </Steps>
        </div>
      ))}
    </div>
  ),
}
