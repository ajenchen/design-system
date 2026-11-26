// @story-history: AllSizes retired 2026-05-15(anatomy SizeMatrix own size matrix);
//   AllStates retired 2026-05-17 per audit Dim 46(anatomy StateBehavior own state matrix,
//   manual trait grid 違 story-rules.md 三層定位「展示層 = 典型使用情境,不是 trait grid」)。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
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
import { NumberInput } from '@/design-system/components/NumberInput/number-input'
import { Select } from '@/design-system/components/Select/select'
import { Textarea } from '@/design-system/components/Textarea/textarea'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

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

/** 一步的表單:欄位 + 這一步的那一顆鈕(預設精靈的「下一步 / 送出」、非線性範例的「儲存 / 發布活動」)。間距:欄位之間由 FieldGroup 擁有(loose);
 *  按鈕上方 = loose × 2(layoutSpace.spec.md 規則 3「組 ↔ 組」:表單欄位 → 跟在後面的表單按鈕列;user 2026-11-10 PR #172 留言,
 *  取代 2026-10-20「Q2 我認為可以基於你的建議」定的 loose)。按鈕下方不在這裡給:展開這一步的 li 給到下一步 bottom 48、最後一步交給外層容器(steps.tsx StepItem)。 */
function StepForm({ label, submitLabel, onSubmit, children }: { label: string; submitLabel: string; onSubmit: (e?: React.FormEvent) => void; children: React.ReactNode }) {
  return (
    <form onSubmit={onSubmit} aria-label={label}>
      {children}
      <ButtonGroup className="mt-[calc(var(--layout-space-loose)*2)]">
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
    <StepForm label="基本資料" submitLabel="下一步" onSubmit={form.handleSubmit}>
      <FieldGroup>
        <Field required invalid={!!form.errors.name}><FieldLabel>姓名</FieldLabel><Input autoComplete="name" {...form.getInputProps('name')} /><FieldError>{form.errors.name}</FieldError></Field>
        <Field required invalid={!!form.errors.email}><FieldLabel>電子郵件</FieldLabel><Input inputMode="email" autoComplete="email" {...form.getInputProps('email')} /><FieldError>{form.errors.email}</FieldError></Field>
        <Field required invalid={!!form.errors.phone}><FieldLabel>電話</FieldLabel><Input inputMode="tel" autoComplete="tel" {...form.getInputProps('phone')} /><FieldError>{form.errors.phone}</FieldError></Field>
      </FieldGroup>
    </StepForm>
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
    <StepForm label="帳號設定" submitLabel="下一步" onSubmit={form.handleSubmit}>
      <FieldGroup>
        <Field required invalid={!!form.errors.username}><FieldLabel>使用者名稱</FieldLabel><Input autoComplete="username" {...form.getInputProps('username')} /><FieldError>{form.errors.username}</FieldError></Field>
        <Field required invalid={!!form.errors.password}><FieldLabel>密碼</FieldLabel><Input type="password" autoComplete="new-password" {...form.getInputProps('password')} /><FieldError>{form.errors.password}</FieldError></Field>
      </FieldGroup>
    </StepForm>
  )
}

/** 最後一步:核對剛填的資料(唯讀資訊展示 → DescriptionList,field.spec.md「何時不用」的「唯讀資訊展示」列),送出。 */
function ReviewStep({ draft, onSubmit }: { draft: SignUpDraft; onSubmit: () => void }) {
  return (
    <StepForm label="確認並送出" submitLabel="送出" onSubmit={(e) => { e?.preventDefault(); onSubmit() }}>
      <DescriptionList cols={1}>
        <DescriptionItem label="姓名">{draft.name}</DescriptionItem>
        <DescriptionItem label="電子郵件">{draft.email}</DescriptionItem>
        <DescriptionItem label="電話">{draft.phone}</DescriptionItem>
        <DescriptionItem label="使用者名稱">{draft.username}</DescriptionItem>
      </DescriptionList>
    </StepForm>
  )
}

export const Default: Story = {
  name: '預設',
  render: () => {
    const [value, setValue] = React.useState('info')
    const [completed, setCompleted] = React.useState<string[]>([])
    const [draft, setDraft] = React.useState<SignUpDraft>(EMPTY_SIGN_UP)
    // 按「下一步」換到下一步之後,焦點交給步驟條上新的目前那一步:按下去的那顆鈕跟著原本那一步的內容一起卸載,
    // 焦點不能掉到 <body>(keyboard-model-canonical.md:焦點不可因 DOM 卸載掉到 body;同 TreeView「步驟引導」範例的做法)。
    // 目前那一步的 header 是 tabIndex=-1(steps.spec.md「目前那一步可不可以點」),讀屏念得出現在到第幾步,下一個 Tab 進到這一步的第一欄。
    const stepsRef = React.useRef<HTMLOListElement>(null)
    const focusStepAfterNav = React.useRef(false)
    React.useEffect(() => {
      if (!focusStepAfterNav.current) return
      focusStepAfterNav.current = false
      stepsRef.current?.querySelector<HTMLElement>(':scope > li[aria-current="step"] > [tabindex]')?.focus()
    }, [value])

    const advance = (patch: Partial<SignUpDraft>) => {
      const nextMap: Record<string, string> = { info: 'account', account: 'review' }
      setDraft((d) => ({ ...d, ...patch }))
      setCompleted(prev => Array.from(new Set([...prev, value])))
      const next = nextMap[value]
      if (next) { focusStepAfterNav.current = true; setValue(next) }
    }
    // 送出:三步全部打勾、跳 Toast,畫面停在第三步,焦點留在「送出」(按鈕沒有卸載,焦點本來就在它身上)——
    // 不把整個精靈換成成功卡(user 2026-10-21「D1照你建議」…「不要看到任何成功卡，根本沒有人會那樣做」;keyboard-model-canonical.md「送出成功一律用 Toast」;field.stories.tsx「表單驗證」同款)
    const submit = () => {
      setCompleted(['info', 'account', 'review'])
      toast({ variant: 'success', title: '帳號已建立' })
    }

    return (
      <div className="w-[480px]">
        {/* Toaster:每個獨立 story root 掛一個(toast.spec.md「app-level-one 是強制合約」允許 Storybook 各 story root 一個) */}
        <Toaster />
        <Steps
          ref={stepsRef}
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

// 建立廣告活動:四步有先後順序、有目前那一步,但每一步可以各自儲存、跳著填(steps.spec.md「Linear vs Non-linear」linear=false 那一列;
// user 2026-10-21 D4「非線性步驟就是有存在的必要,mui也有提供」,範例內容 = F10 ① AI 擬、user「照你建議」)。
// 每一步一張表單,按「儲存」驗過才打勾;最後一步是「發布活動」—— 還有沒存的步就標錯、帶到第一個沒存的步,全部存好才發布並跳 Toast。
// 四張表單的值都放在這一層(不跟著內容區卸載):跳到別步再回來,打到一半的字還在。
type AdStepId = 'setup' | 'audience' | 'creative' | 'budget'
const AD_STEPS: { id: AdStepId; label: string; description: string }[] = [
  { id: 'setup', label: '活動設定', description: '名稱與行銷目標' },
  { id: 'audience', label: '目標受眾', description: '地區與年齡層' },
  { id: 'creative', label: '廣告素材', description: '標題與內文' },
  { id: 'budget', label: '預算與出價', description: '每日預算與出價策略' },
]
const AD_GOAL_OPTIONS = [
  { value: 'awareness', label: '品牌知名度' },
  { value: 'traffic', label: '網站流量' },
  { value: 'conversions', label: '轉換次數' },
]
const AD_REGION_OPTIONS = [
  { value: 'tw', label: '全台灣' },
  { value: 'north', label: '北部' },
  { value: 'central', label: '中部' },
  { value: 'south', label: '南部' },
]
const AD_AGE_OPTIONS = [
  { value: '18-24', label: '18–24 歲' },
  { value: '25-34', label: '25–34 歲' },
  { value: '35-44', label: '35–44 歲' },
  { value: '45+', label: '45 歲以上' },
]
const AD_BIDDING_OPTIONS = [
  { value: 'max-clicks', label: '盡量爭取點擊' },
  { value: 'target-cpa', label: '目標單次轉換出價' },
]

function AdCampaignWizard() {
  const [value, setValue] = React.useState<AdStepId>('creative')
  const [completed, setCompleted] = React.useState<AdStepId[]>(['setup'])
  const [errors, setErrors] = React.useState<AdStepId[]>([])
  // 「發布活動」把人帶到第一個沒存的步時,焦點交給那一步的 header(按下去的那顆鈕跟著原本那一步的內容卸載,不能掉到 <body>)
  const stepsRef = React.useRef<HTMLOListElement>(null)
  const focusStepAfterNav = React.useRef(false)
  React.useEffect(() => {
    if (!focusStepAfterNav.current) return
    focusStepAfterNav.current = false
    stepsRef.current?.querySelector<HTMLElement>(':scope > li[aria-current="step"] > [tabindex]')?.focus()
  }, [value])

  const save = (id: AdStepId) => {
    setCompleted((prev) => Array.from(new Set([...prev, id])))
    setErrors((prev) => prev.filter((e) => e !== id))
    toast({ variant: 'success', title: `${AD_STEPS.find((st) => st.id === id)!.label}已儲存` })
  }
  const publish = () => {
    const unsaved = AD_STEPS.map((st) => st.id).filter((id) => id !== 'budget' && !completed.includes(id))
    setCompleted((prev) => Array.from(new Set([...prev, 'budget' as const])))
    if (unsaved.length > 0) {
      setErrors(unsaved)
      focusStepAfterNav.current = true
      setValue(unsaved[0])
      return
    }
    setErrors([])
    toast({ variant: 'success', title: '廣告活動已發布' })
  }

  const setup = useFormValidation({
    initialValues: { campaignName: '2026 春季新品上市', goal: 'traffic' },
    validate: { campaignName: requiredText('活動名稱'), goal: requiredText('行銷目標') },
    onSubmit: () => save('setup'),
  })
  const audience = useFormValidation({
    initialValues: { region: '', ageRange: '' },
    validate: { region: requiredText('地區'), ageRange: requiredText('年齡層') },
    onSubmit: () => save('audience'),
  })
  const creative = useFormValidation({
    initialValues: { headline: '', body: '' },
    validate: {
      headline: (v) => (!String(v ?? '').trim() ? '廣告標題必填' : String(v).length > 30 ? '廣告標題最多 30 個字' : undefined),
      body: requiredText('廣告內文'),
    },
    onSubmit: () => save('creative'),
  })
  const budget = useFormValidation<{ dailyBudget: number | null; bidding: string }>({
    initialValues: { dailyBudget: null, bidding: '' },
    validate: {
      dailyBudget: (v) => (typeof v === 'number' && v >= 100 ? undefined : '每日預算至少 NT$100'),
      bidding: requiredText('出價策略'),
    },
    onSubmit: publish,
  })

  const content: Record<AdStepId, React.ReactNode> = {
    setup: (
      <StepForm label="活動設定" submitLabel="儲存" onSubmit={setup.handleSubmit}>
        <FieldGroup>
          <Field required invalid={!!setup.errors.campaignName}><FieldLabel>活動名稱</FieldLabel><Input {...setup.getInputProps('campaignName')} /><FieldError>{setup.errors.campaignName}</FieldError></Field>
          <Field required invalid={!!setup.errors.goal}><FieldLabel>行銷目標</FieldLabel><Select aria-label="行銷目標" placeholder="選擇目標" options={AD_GOAL_OPTIONS} {...setup.getInputProps('goal')} /><FieldError>{setup.errors.goal}</FieldError></Field>
        </FieldGroup>
      </StepForm>
    ),
    audience: (
      <StepForm label="目標受眾" submitLabel="儲存" onSubmit={audience.handleSubmit}>
        <FieldGroup>
          <Field required invalid={!!audience.errors.region}><FieldLabel>地區</FieldLabel><Select aria-label="地區" placeholder="選擇地區" options={AD_REGION_OPTIONS} {...audience.getInputProps('region')} /><FieldError>{audience.errors.region}</FieldError></Field>
          <Field required invalid={!!audience.errors.ageRange}><FieldLabel>年齡層</FieldLabel><Select aria-label="年齡層" placeholder="選擇年齡層" options={AD_AGE_OPTIONS} {...audience.getInputProps('ageRange')} /><FieldError>{audience.errors.ageRange}</FieldError></Field>
        </FieldGroup>
      </StepForm>
    ),
    creative: (
      <StepForm label="廣告素材" submitLabel="儲存" onSubmit={creative.handleSubmit}>
        <FieldGroup>
          <Field required invalid={!!creative.errors.headline}><FieldLabel>廣告標題</FieldLabel><Input {...creative.getInputProps('headline')} /><FieldError>{creative.errors.headline}</FieldError></Field>
          <Field required invalid={!!creative.errors.body}><FieldLabel>廣告內文</FieldLabel><Textarea {...creative.getInputProps('body')} /><FieldError>{creative.errors.body}</FieldError></Field>
        </FieldGroup>
      </StepForm>
    ),
    budget: (
      <StepForm label="預算與出價" submitLabel="發布活動" onSubmit={budget.handleSubmit}>
        <FieldGroup>
          <Field required invalid={!!budget.errors.dailyBudget}><FieldLabel>每日預算</FieldLabel><NumberInput prefix="NT$" {...budget.getInputProps('dailyBudget')} /><FieldError>{budget.errors.dailyBudget}</FieldError></Field>
          <Field required invalid={!!budget.errors.bidding}><FieldLabel>出價策略</FieldLabel><Select aria-label="出價策略" placeholder="選擇出價策略" options={AD_BIDDING_OPTIONS} {...budget.getInputProps('bidding')} /><FieldError>{budget.errors.bidding}</FieldError></Field>
        </FieldGroup>
      </StepForm>
    ),
  }

  return (
    <div className="w-[480px]">
      {/* Toaster:每個獨立 story root 掛一個(toast.spec.md「app-level-one 是強制合約」允許 Storybook 各 story root 一個) */}
      <Toaster />
      <Steps
        ref={stepsRef}
        aria-label="建立廣告活動進度"
        value={value}
        onValueChange={(v) => setValue(v as AdStepId)}
        completedValues={completed}
        errorValues={errors}
        linear={false}
      >
        {AD_STEPS.map((st) => (
          <StepItem key={st.id} value={st.id}>
            <StepLabel>{st.label}</StepLabel>
            <StepDescription>{st.description}</StepDescription>
            <StepContent>{content[st.id]}</StepContent>
          </StepItem>
        ))}
      </Steps>
    </div>
  )
}

export const NonLinear: Story = {
  name: '非線性',
  render: () => <AdCampaignWizard />,
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
