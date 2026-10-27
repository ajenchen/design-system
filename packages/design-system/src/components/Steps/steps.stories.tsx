// @story-history: AllSizes retired 2026-05-15(anatomy SizeMatrix own size matrix);
//   AllStates retired 2026-05-17 per audit Dim 46(anatomy StateBehavior own state matrix,
//   manual trait grid 違 story-rules.md 三層定位「展示層 = 典型使用情境,不是 trait grid」)。
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
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { Field, FieldError, FieldGroup, FieldLabel, useFormValidation } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'

const meta: Meta<typeof Steps> = {
  title: 'Design System/Components/Steps/展示',
  tags: ['autodocs'],
  component: Steps,
  parameters: {
    layout: 'padded',
    docs: { description: { component: '呈現有固定順序的多步驟流程、目前位置與完成狀態，可搭配逐步內容。使用者必須依序完成設定、申請或結帳時使用；平行內容切換改用 Tabs。' } },
  },
}
export default meta

type Story = StoryObj<typeof Steps>

// ── 典型 wizard ──────────────────────────────────────────────────────────

// 註冊精靈:每一步是一張真的表單(結構同 field.stories.tsx「表單驗證」的 CreateProjectForm:FieldGroup + useFormValidation);
// 按「下一步」先驗證這一頁 —— 過了把這一步記成已完成、前往下一步,沒過停在這一頁、焦點到第一個錯的欄位(form-validation.spec.md 規則 8)。
// 2026-10-21 前這三步只有一句「請輸入你的姓名、電子郵件與電話」、沒有任何欄位(r1b OTH-04)。
// 按鈕只放「下一步」,最後一步是「送出」;回頭 = 點正上方已完成的步驟(user 2026-10-20「照你建議」= A1 甲;steps.spec.md「目前那一步底下的按鈕」)。
interface SignUpDraft { name: string; email: string; phone: string; username: string; password: string }
const EMPTY_SIGN_UP: SignUpDraft = { name: '', email: '', phone: '', username: '', password: '' }
const requiredText = (label: string) => (v: unknown) => (String(v ?? '').trim() ? undefined : `${label}必填`)

/** 一步的表單:欄位 + 往前那一顆鈕。間距:欄位之間由 FieldGroup 擁有(loose);最後的欄位 → 按鈕照 layoutSpace.spec.md 規則 4 第 1 列(bottom)。 */
function SignUpStepForm({ label, submitLabel, onSubmit, children }: { label: string; submitLabel: string; onSubmit: (e?: React.FormEvent) => void; children: React.ReactNode }) {
  return (
    <form onSubmit={onSubmit} aria-label={label}>
      {children}
      <ButtonGroup className="mt-[var(--layout-space-bottom)]">
        <Button type="submit" variant="primary">{submitLabel}</Button>
      </ButtonGroup>
    </form>
  )
}

function ContactStep({ draft, onPass }: { draft: SignUpDraft; onPass: (patch: Partial<SignUpDraft>) => void }) {
  const form = useFormValidation({
    initialValues: { name: draft.name, email: draft.email, phone: draft.phone },
    validate: {
      name: requiredText('姓名'),
      email: (v) => (/^\S+@\S+\.\S+$/.test(String(v)) ? undefined : '電子郵件格式不正確'),
      phone: (v) => (/^0\d{8,9}$/.test(String(v).replace(/[\s-]/g, '')) ? undefined : '電話是 0 開頭的 9 到 10 位數字'),
    },
    onSubmit: onPass,
  })
  return (
    <SignUpStepForm label="基本資料" submitLabel="下一步" onSubmit={form.handleSubmit}>
      <FieldGroup>
        <Field required invalid={!!form.errors.name}><FieldLabel>姓名</FieldLabel><Input autoComplete="name" {...form.getInputProps('name')} /><FieldError>{form.errors.name}</FieldError></Field>
        <Field required invalid={!!form.errors.email}><FieldLabel>電子郵件</FieldLabel><Input inputMode="email" autoComplete="email" {...form.getInputProps('email')} /><FieldError>{form.errors.email}</FieldError></Field>
        <Field required invalid={!!form.errors.phone}><FieldLabel>電話</FieldLabel><Input inputMode="tel" autoComplete="tel" {...form.getInputProps('phone')} /><FieldError>{form.errors.phone}</FieldError></Field>
      </FieldGroup>
    </SignUpStepForm>
  )
}

function AccountStep({ draft, onPass }: { draft: SignUpDraft; onPass: (patch: Partial<SignUpDraft>) => void }) {
  const form = useFormValidation({
    initialValues: { username: draft.username, password: draft.password },
    validate: {
      username: (v) => (String(v ?? '').trim().length >= 3 ? undefined : '使用者名稱至少 3 個字元'),
      password: (v) => (String(v ?? '').length >= 8 ? undefined : '密碼至少 8 個字元'),
    },
    onSubmit: onPass,
  })
  return (
    <SignUpStepForm label="帳號設定" submitLabel="下一步" onSubmit={form.handleSubmit}>
      <FieldGroup>
        <Field required invalid={!!form.errors.username}><FieldLabel>使用者名稱</FieldLabel><Input autoComplete="username" {...form.getInputProps('username')} /><FieldError>{form.errors.username}</FieldError></Field>
        <Field required invalid={!!form.errors.password}><FieldLabel>密碼</FieldLabel><Input type="password" autoComplete="new-password" {...form.getInputProps('password')} /><FieldError>{form.errors.password}</FieldError></Field>
      </FieldGroup>
    </SignUpStepForm>
  )
}

/** 最後一步:核對剛填的資料(唯讀資訊展示 → DescriptionList,field.spec.md「Field vs DescriptionList」),送出。 */
function ReviewStep({ draft, onSubmit }: { draft: SignUpDraft; onSubmit: () => void }) {
  return (
    <SignUpStepForm label="確認並送出" submitLabel="送出" onSubmit={(e) => { e?.preventDefault(); onSubmit() }}>
      <DescriptionList cols={1}>
        <DescriptionItem label="姓名">{draft.name}</DescriptionItem>
        <DescriptionItem label="電子郵件">{draft.email}</DescriptionItem>
        <DescriptionItem label="電話">{draft.phone}</DescriptionItem>
        <DescriptionItem label="使用者名稱">{draft.username}</DescriptionItem>
      </DescriptionList>
    </SignUpStepForm>
  )
}

export const Default: Story = {
  name: '預設',
  render: () => {
    const [value, setValue] = React.useState('info')
    const [completed, setCompleted] = React.useState<string[]>([])
    const [submitted, setSubmitted] = React.useState(false)
    const [draft, setDraft] = React.useState<SignUpDraft>(EMPTY_SIGN_UP)

    const advance = (patch: Partial<SignUpDraft>) => {
      const nextMap: Record<string, string> = { info: 'account', account: 'review' }
      setDraft((d) => ({ ...d, ...patch }))
      setCompleted(prev => Array.from(new Set([...prev, value])))
      const next = nextMap[value]
      if (next) setValue(next)
    }
    const submit = () => {
      setCompleted(prev => Array.from(new Set([...prev, 'review'])))
      setSubmitted(true)
    }
    const reset = () => {
      setValue('info')
      setCompleted([])
      setSubmitted(false)
      setDraft(EMPTY_SIGN_UP)
    }

    // ── Pattern A:submit 在最後一步,送出後整個 wizard 替換成 success banner ──
    // Pattern A:最後一步 submit 按下後 stepper 不再顯示,整個 wizard 替換成
    // success card;「再填一份申請」是成功頁的真實產品 action(Google Forms
    // 「Submit another response」同款,https://support.google.com/docs/answer/2839588),
    // 非 demo 治具。
    // 間距(layoutSpace.spec.md):有框卡片內距 = loose(規則 1);標題列 → 說明 = tight(規則 3 labeling);
    // 最後的內容 → 動作鈕 = bottom(規則 4,:127)
    if (submitted) {
      return (
        <div className="w-[480px] flex flex-col p-[var(--layout-space-loose)] bg-muted rounded-md border border-border">
          {/* @layout-space-magic-ok: 結果圖示 ↔ 標題(同一列的行內 micro)(layoutSpace.spec.md:166 micro) */}
          <div className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-info flex items-center justify-center shrink-0">
              <Check className="text-white" size={20} strokeWidth={2.5} aria-hidden />
            </span>
            <span className="text-body-lg font-medium text-foreground">
              已成功送出申請
            </span>
          </div>
          <p className="mt-[var(--layout-space-tight)] text-body text-fg-secondary">
            我們會盡快處理,結果將寄送至您的電子信箱。
          </p>
          <ButtonGroup className="mt-[var(--layout-space-bottom)]">
            <Button variant="tertiary" onClick={reset}>
              再填一份申請
            </Button>
          </ButtonGroup>
        </div>
      )
    }

    return (
      <div className="w-[480px]">
        <Steps
          aria-label="註冊流程進度"
          value={value}
          onValueChange={setValue}
          completedValues={completed}
        >
          <StepItem value="info">
            <StepLabel>基本資料</StepLabel>
            <StepDescription>填寫姓名與聯絡方式</StepDescription>
            <StepContent>
              <ContactStep draft={draft} onPass={advance} />
            </StepContent>
          </StepItem>

          <StepItem value="account">
            <StepLabel>帳號設定</StepLabel>
            <StepDescription>選擇使用者名稱與密碼</StepDescription>
            <StepContent>
              <AccountStep draft={draft} onPass={advance} />
            </StepContent>
          </StepItem>

          <StepItem value="review">
            <StepLabel>確認並送出</StepLabel>
            <StepDescription>送出前最後檢查</StepDescription>
            <StepContent>
              <ReviewStep draft={draft} onSubmit={submit} />
            </StepContent>
          </StepItem>
        </Steps>
      </div>
    )
  },
}

// @story-history: AllSizes + AllStates retired per F migration 2026-05-17 —
//   AllSizes retired 2026-05-15(anatomy SizeMatrix own);AllStates retired 2026-05-17
//   per Dim 46 audit(anatomy StateBehavior 已 own state matrix,manual trait grid 違反
//   story-rules.md 三層定位「展示層應為典型使用情境,不是 trait grid」)。
//   FocusRingCombinations retired 2026-07-17 per Dim 24 audit — ring⊥state 正交規則已由
//   principles「規則:環是聚焦標記,不是選取」live own(completed+ring / error+ring 兩例);
//   互動式聚焦移動於「預設」「非線性」既有 clickable steps 已可見,展示層不重複原則 grid。

// ── Non-linear ──────────────────────────────────────────────────────────

export const NonLinear: Story = {
  name: '非線性',
  render: () => {
    const [value, setValue] = React.useState('overview')
    return (
      <div className="w-[360px]">
        <Steps
          aria-label="工作區設定進度"
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
          aria-label="結帳進度"
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

// @story-history: MultipleExpansion(多重展開模式,安裝指南三步可同時展開)retired 2026-09-30 —
//   整個「可同時打開多步」模式(`expansion="multiple"` / `defaultExpanded` / controlled `expanded`)隨之退役:
//   Steps 的內容區只跟著目前那一步(steps.spec.md「內容跟著目前那一步」);安裝指南這種「讀者自己開合、沒有目前位置」
//   的編號說明改用 Accordion(steps.spec.md「何時不用」第二張表)。
//   user 2026-09-30 原話:「若你覺得Gov.uk學開車七步那種範例不用納入我們的範例就照你建議做」(AI 建議、user 採納,條件見原話)。
//   本則的 play 原本順帶驗證 StepContent 內 consumer 自己的捲動區可聚焦;退役後 DS 內沒有任何 story 示範這條
//   (steps.spec.md「A11y 預設」如實寫明),規則文字保留為指引。

// @story-history: MixedDescription(欄節奏驗證 grid)retired 2026-06-11 per audit
//   EXAMPLE_REDUNDANT — indicator 對齊 label 第一行的 column rhythm 已由 anatomy「欄位節奏」+
//   principles「規則:指示欄節奏一致」雙層 own;展示層不重複 trait 驗證 grid。
