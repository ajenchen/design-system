// @story-history: hasInteractiveStates trait — TreeView interactive states(hover / focus / selected / disabled)由 TreeItem 內部處理(spec.md state machine + anatomy StateBehavior story 已 cover),showcase 層 manual Disabled/States story retired per F migration(2026-05-15)— anatomy.stories.tsx auto-compile owns StateBehavior 6-canonical。AllSizes 同理 retired(SizeMatrix anatomy auto-compile owns)。
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, waitFor, within } from '@storybook/test'
import {
  Folder, FileText, FileCode, Image, Settings,
  MoreVertical, Plus, Trash2,
  type LucideIcon,
} from 'lucide-react'
import { TreeView, TreeItem } from './tree-view'
import type { StepResult } from './tree-step-navigation'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { CheckboxGroup } from '@/design-system/components/Checkbox/checkbox-group'
import { Field, FieldError, FieldGroup, FieldLabel, useFormValidation } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { Select } from '@/design-system/components/Select/select'
import { RadioGroup, RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'
import { DescriptionList, DescriptionItem } from '@/design-system/components/DescriptionList/description-list'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

const meta: Meta = {
  title: 'Design System/Components/TreeView/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '呈現可展開的階層資料，支援選取、鍵盤導覽與拖放重排。資料具有父子關係且使用者需要逐層瀏覽資料夾、文件或分類時使用。' } },
  },
}
export default meta

type Story = StoryObj

// ── File Browser ────────────────────────────────────────────────────────

export const FileBrowser: Story = {
  name: '檔案瀏覽',
  render: () => (
    // @layout-space-magic-ok: 有框容器裡的樹列集合:外框只給上下 8px,左右 0 讓滑過 / 選中底色貼齊框邊(tree-view.spec.md:384 / :391 垂直 padding 歸屬)(layoutSpace.spec.md:113 同範疇 spec-own)
    <div className="w-[300px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
      <TreeView aria-label="檔案瀏覽" defaultExpandedIds={['src', 'components']}>
        <TreeItem id="src" icon={Folder} label="src">
          <TreeItem id="components" icon={Folder} label="components">
            <TreeItem id="button" icon={FileCode} label="Button.tsx" />
            <TreeItem id="input" icon={FileCode} label="Input.tsx" />
            <TreeItem id="dialog" icon={FileCode} label="Dialog.tsx" />
          </TreeItem>
          <TreeItem id="utils" icon={Folder} label="utils">
            <TreeItem id="cn" icon={FileCode} label="cn.ts" />
          </TreeItem>
          <TreeItem id="app" icon={FileCode} label="App.tsx" />
          <TreeItem id="main" icon={FileCode} label="main.tsx" />
        </TreeItem>
        <TreeItem id="public" icon={Folder} label="public">
          <TreeItem id="favicon" icon={Image} label="favicon.svg" />
        </TreeItem>
        <TreeItem id="pkg" icon={FileText} label="package.json" />
        <TreeItem id="readme" icon={FileText} label="README.md" />
      </TreeView>
    </div>
  ),
}

// beta.97 直接修改的 TreeItem expand/collapse chevron hover 證據。
// Chevron 是 tabIndex=-1 的視覺件(不在 Tab 路上,也不在方向鍵路上;鍵盤展開收合走 → / ←),因此以 node data id 精準取真實 button。
export const ActionHoverState: Story = {
  name: '展開動作懸停狀態',
  tags: ['test-only'],
  render: () => (
    <div className="w-[300px] overflow-hidden rounded-lg border border-divider bg-surface py-2">
      <TreeView aria-label="專案檔案">
        <TreeItem id="product-roadmap" icon={Folder} label="產品路線圖">
          <TreeItem id="q3-plan" icon={FileText} label="Q3-plan.pdf" />
        </TreeItem>
      </TreeView>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // 展開箭頭 2026-09-29 起保留名字(aria-label 展開 / 收合)、不再 aria-hidden(tree-view.spec.md「展開 / 收合 chevron」;待辦總帳 N46)
    const action = canvasElement.querySelector<HTMLElement>(
      '[data-tree-row="product-roadmap"] button[aria-label="展開"]',
    )
    if (!action) throw new Error('TreeView 展開動作不存在')
    action.setAttribute('data-visual-hover-target', '')
  },
}

// ── 步驟導覽樹:商家收款帳戶啟用(tree-view.spec.md「步驟導覽樹」「步驟結果」)──────────────
// 真實情境:商家在金流後台開通收款帳戶。左邊是步驟樹(三個大步驟都**沒有自己的頁面**,只把子步驟分組 → selectable={false}),
// 右邊是目前那一步的整頁內容(user 2026-10-01:「…點擊左側菜單選項右側body就會有對應內容」)。按「下一步」先驗證這一頁:
// 過了 → 這一步列尾畫成功、前往下一步;沒過 → 列尾畫失敗、停在這一頁。「上一步」不驗證。
// 有自己頁面的大步驟很少見,依 user 2026-10-07「2. …此情境若確認真的少之又少就不要展示範例…」**不做範例**(規格只寫規則)。
type OnboardingStepId = 'company' | 'owner' | 'bank' | 'payout' | 'review' | 'agree'
const ONBOARDING_GROUPS: { id: string; label: string; steps: { id: OnboardingStepId; label: string }[] }[] = [
  { id: 'merchant', label: '1. 商家資料', steps: [{ id: 'company', label: '公司基本資料' }, { id: 'owner', label: '負責人身分驗證' }] },
  { id: 'settlement', label: '2. 收款設定', steps: [{ id: 'bank', label: '收款銀行帳戶' }, { id: 'payout', label: '撥款週期' }] },
  { id: 'confirm', label: '3. 確認送出', steps: [{ id: 'review', label: '核對資料' }, { id: 'agree', label: '同意條款並送出' }] },
]
const ONBOARDING_ORDER = ONBOARDING_GROUPS.flatMap((g) => g.steps)
const BANK_OPTIONS = [
  { value: '004', label: '004 臺灣銀行' },
  { value: '012', label: '012 台北富邦銀行' },
  { value: '013', label: '013 國泰世華銀行' },
  { value: '822', label: '822 中國信託商業銀行' },
]
const PAYOUT_LABEL: Record<string, string> = { daily: '每個營業日撥款', weekly: '每週一撥款', monthly: '每月 1 日撥款' }
interface MerchantDraft {
  companyName: string; taxId: string; address: string
  ownerName: string; ownerIdNo: string
  bankCode: string; accountNo: string; accountName: string
  payoutCycle: string; agreed: boolean
}
const INITIAL_DRAFT: MerchantDraft = {
  companyName: '晨光咖啡有限公司', taxId: '24536806', address: '台北市大安區復興南路一段 390 號',
  ownerName: '林雅婷', ownerIdNo: 'A223456789',
  bankCode: '', accountNo: '', accountName: '',
  payoutCycle: 'weekly', agreed: false,
}
const required = (label: string) => (v: unknown) => (String(v ?? '').trim() ? undefined : `${label}必填`)

/** 一頁的版面:標題、說明、欄位、下一步 / 上一步。
 *  - 按鈕順序與對齊照 patterns/action-bar/action-bar.spec.md:109 / :121:這一列沒有標題 → 靠左;靠左時 primary 在最左,
 *    依 primary > tertiary 往右排 —— 所以「下一步」(primary)在左、「上一步」(tertiary)在右,與 Steps 展示的步驟頁同一個排法。
 *    (2026-10-20 XF-01:原本引 coachmark.spec.md「Footer 按鈕順序」把上一步放左 —— 那條是 Coachmark 浮層 footer 的規則,
 *    footer 靠右、左邊有步數當標題,primary 在最右才對;搬到沒有標題、靠左的表單頁底就正好反了。)
 *    按鈕之間的間距交給 ButtonGroup(元件自己擁有,不在範例寫死)
 *  - 間距照 layoutSpace.spec.md:標題 → 欄位 = 規則 3「form section heading → fields」tight;最後的內容 → 按鈕 = 規則 4「Commitment 前留白」bottom
 *  - 標題字級同 DialogTitle(dialog.tsx `text-body-lg font-medium`);標題與說明之間同 field.stories.tsx「表單驗證」的 h3 + 說明 */
function OnboardingPage({ title, description, children, onSubmit, onBack, submitLabel = '下一步', submitting }: {
  title: string; description: string; children: React.ReactNode; onSubmit: (e?: React.FormEvent) => void
  onBack?: () => void; submitLabel?: string; submitting?: boolean
}) {
  return (
    <form onSubmit={onSubmit} aria-label={title} className="flex flex-col">
      <div className="flex flex-col gap-[var(--layout-space-tight)]">
        <h3 className="text-body-lg font-medium text-foreground">{title}</h3>
        <p className="text-body text-fg-secondary">{description}</p>
      </div>
      <div className="mt-[var(--layout-space-tight)]">{children}</div>
      <ButtonGroup className="mt-[var(--layout-space-bottom)]">
        <Button type="submit" variant="primary" loading={submitting}>{submitLabel}</Button>
        {onBack && <Button type="button" variant="tertiary" onClick={onBack}>上一步</Button>}
      </ButtonGroup>
    </form>
  )
}

interface OnboardingStepProps {
  draft: MerchantDraft
  /** 這一頁驗證通過:存值、列尾畫成功、前往下一步 */
  onPass: (patch: Partial<MerchantDraft>) => void
  /** 這一頁驗證沒過:列尾畫失敗、停在這一頁 */
  onFail: () => void
  onBack?: () => void
}
/** 送出一頁:useFormValidation 驗過才會呼叫 onSubmit;沒呼叫 = 沒過 */
function useOnboardingForm<T extends Record<string, unknown>>(initialValues: T, validate: Partial<Record<keyof T, (v: T[keyof T]) => string | undefined>>, onPass: (v: T) => void, onFail: () => void) {
  const passed = React.useRef(false)
  const form = useFormValidation<T>({ initialValues, validate, onSubmit: (v) => { passed.current = true; onPass(v) } })
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    passed.current = false
    await form.handleSubmit()
    if (!passed.current) onFail()
  }
  return { form, submit }
}

function CompanyStep({ draft, onPass, onFail }: OnboardingStepProps) {
  const { form, submit } = useOnboardingForm(
    { companyName: draft.companyName, taxId: draft.taxId, address: draft.address },
    { companyName: required('公司名稱'), taxId: (v) => (/^\d{8}$/.test(String(v)) ? undefined : '統一編號是 8 位數字'), address: required('營業地址') },
    onPass, onFail,
  )
  return (
    <OnboardingPage title="公司基本資料" description="與經濟部商工登記資料相同,撥款與發票都會用到。" onSubmit={submit} submitting={form.isSubmitting}>
      <FieldGroup>
        <Field required invalid={!!form.errors.companyName}><FieldLabel>公司名稱</FieldLabel><Input {...form.getInputProps('companyName')} /><FieldError>{form.errors.companyName}</FieldError></Field>
        <Field required invalid={!!form.errors.taxId}><FieldLabel>統一編號</FieldLabel><Input inputMode="numeric" {...form.getInputProps('taxId')} /><FieldError>{form.errors.taxId}</FieldError></Field>
        <Field required invalid={!!form.errors.address}><FieldLabel>營業地址</FieldLabel><Input {...form.getInputProps('address')} /><FieldError>{form.errors.address}</FieldError></Field>
      </FieldGroup>
    </OnboardingPage>
  )
}

function OwnerStep({ draft, onPass, onFail, onBack }: OnboardingStepProps) {
  const { form, submit } = useOnboardingForm(
    { ownerName: draft.ownerName, ownerIdNo: draft.ownerIdNo },
    { ownerName: required('負責人姓名'), ownerIdNo: (v) => (/^[A-Z][12]\d{8}$/.test(String(v)) ? undefined : '身分證字號格式是 1 個大寫英文字母加 9 個數字') },
    onPass, onFail,
  )
  return (
    <OnboardingPage title="負責人身分驗證" description="依洗錢防制法需核對公司負責人身分,資料只用於這次審核。" onSubmit={submit} onBack={onBack} submitting={form.isSubmitting}>
      <FieldGroup>
        <Field required invalid={!!form.errors.ownerName}><FieldLabel>負責人姓名</FieldLabel><Input {...form.getInputProps('ownerName')} /><FieldError>{form.errors.ownerName}</FieldError></Field>
        <Field required invalid={!!form.errors.ownerIdNo}><FieldLabel>身分證字號</FieldLabel><Input {...form.getInputProps('ownerIdNo')} /><FieldError>{form.errors.ownerIdNo}</FieldError></Field>
      </FieldGroup>
    </OnboardingPage>
  )
}

function BankStep({ draft, onPass, onFail, onBack }: OnboardingStepProps) {
  const { form, submit } = useOnboardingForm(
    { bankCode: draft.bankCode, accountNo: draft.accountNo, accountName: draft.accountName },
    { bankCode: required('收款銀行'), accountNo: (v) => (/^\d{10,14}$/.test(String(v)) ? undefined : '帳號是 10 到 14 位數字'), accountName: required('戶名') },
    onPass, onFail,
  )
  return (
    <OnboardingPage title="收款銀行帳戶" description="戶名必須與公司名稱相同,撥款才不會被退回。" onSubmit={submit} onBack={onBack} submitting={form.isSubmitting}>
      <FieldGroup>
        <Field required invalid={!!form.errors.bankCode}><FieldLabel>收款銀行</FieldLabel><Select aria-label="收款銀行" placeholder="選擇銀行" options={BANK_OPTIONS} {...form.getInputProps('bankCode')} /><FieldError>{form.errors.bankCode}</FieldError></Field>
        <Field required invalid={!!form.errors.accountNo}><FieldLabel>帳號</FieldLabel><Input inputMode="numeric" {...form.getInputProps('accountNo')} /><FieldError>{form.errors.accountNo}</FieldError></Field>
        <Field required invalid={!!form.errors.accountName}><FieldLabel>戶名</FieldLabel><Input {...form.getInputProps('accountName')} /><FieldError>{form.errors.accountName}</FieldError></Field>
      </FieldGroup>
    </OnboardingPage>
  )
}

function PayoutStep({ draft, onPass, onFail, onBack }: OnboardingStepProps) {
  const { form, submit } = useOnboardingForm({ payoutCycle: draft.payoutCycle }, {}, onPass, onFail)
  return (
    <OnboardingPage title="撥款週期" description="款項扣除手續費後,依你選的週期撥入收款帳戶。之後可在設定裡更改。" onSubmit={submit} onBack={onBack} submitting={form.isSubmitting}>
      <Field>
        <FieldLabel>撥款週期</FieldLabel>
        <RadioGroup value={form.values.payoutCycle} onValueChange={(v) => form.setFieldValue('payoutCycle', v)}>
          {Object.entries(PAYOUT_LABEL).map(([value, label]) => <RadioGroupItem key={value} value={value} label={label} />)}
        </RadioGroup>
      </Field>
    </OnboardingPage>
  )
}

function ReviewStep({ draft, onPass, onFail, onBack }: OnboardingStepProps) {
  const { form, submit } = useOnboardingForm({}, {}, onPass, onFail)
  const bank = BANK_OPTIONS.find((b) => b.value === draft.bankCode)?.label ?? '(尚未填寫)'
  return (
    <OnboardingPage title="核對資料" description="送出後由審核團隊在 2 個工作天內完成,期間無法修改。" onSubmit={submit} onBack={onBack} submitting={form.isSubmitting}>
      <DescriptionList cols={1}>
        <DescriptionItem label="公司名稱">{draft.companyName}</DescriptionItem>
        <DescriptionItem label="統一編號">{draft.taxId}</DescriptionItem>
        <DescriptionItem label="負責人">{draft.ownerName}</DescriptionItem>
        <DescriptionItem label="收款帳戶">{draft.accountNo ? `${bank} ${draft.accountNo}` : bank}</DescriptionItem>
        <DescriptionItem label="撥款週期">{PAYOUT_LABEL[draft.payoutCycle]}</DescriptionItem>
      </DescriptionList>
    </OnboardingPage>
  )
}

function AgreeStep({ draft, onPass, onFail, onBack }: OnboardingStepProps) {
  const { form, submit } = useOnboardingForm(
    { agreed: draft.agreed },
    { agreed: (v) => (v === true ? undefined : '請先閱讀並同意收款服務條款') },
    (v) => { onPass(v); toast({ variant: 'success', title: '已送出審核,結果會寄到負責人信箱' }) }, onFail,
  )
  return (
    <OnboardingPage title="同意條款並送出" description="《收款服務條款》說明手續費、撥款時程與爭議款處理方式。" onSubmit={submit} onBack={onBack} submitLabel="送出審核" submitting={form.isSubmitting}>
      {/* 單一同意勾選框放在 Field 裡要包 CheckboxGroup,選項文字才不會被 FieldLabel 接管(checkbox.spec.md「insideGroup && insideField → 保留 label」);
          值走 setFieldValue(checkbox.spec.md「表單驗證接線」v1 邊界) */}
      <Field required invalid={!!form.errors.agreed}>
        <FieldLabel>收款服務條款</FieldLabel>
        <CheckboxGroup>
          <Checkbox name="agreed" label="我已閱讀並同意《收款服務條款》" checked={form.values.agreed} onCheckedChange={(c) => form.setFieldValue('agreed', c === true)} />
        </CheckboxGroup>
        <FieldError>{form.errors.agreed}</FieldError>
      </Field>
    </OnboardingPage>
  )
}

const ONBOARDING_PAGES: Record<OnboardingStepId, (p: OnboardingStepProps) => React.ReactElement> = {
  company: CompanyStep, owner: OwnerStep, bank: BankStep, payout: PayoutStep, review: ReviewStep, agree: AgreeStep,
}

function MerchantOnboarding() {
  const [current, setCurrent] = React.useState<OnboardingStepId>('bank')
  // 「負責人身分驗證」上一次送出沒過(列尾紅叉);「1. 商家資料」收著 → 替它代顯「其中有錯誤」
  const [results, setResults] = React.useState<Partial<Record<OnboardingStepId, StepResult>>>({ company: 'completed', owner: 'error' })
  const [expanded, setExpanded] = React.useState(() => new Set(['settlement']))
  const [draft, setDraft] = React.useState(INITIAL_DRAFT)
  const index = ONBOARDING_ORDER.findIndex((s) => s.id === current)
  const Page = ONBOARDING_PAGES[current]
  const selectedIds = React.useMemo(() => new Set([current]), [current])
  return (
    <>
      <Toaster />
      <div className="flex w-[760px] min-h-[460px] overflow-hidden rounded-lg border border-divider bg-surface">
        {/* @layout-space-magic-ok: 有框容器裡的樹列集合:外框只給上下 8px,左右 0 讓滑過 / 選中底色貼齊框邊(tree-view.spec.md:384 / :391 垂直 padding 歸屬)(layoutSpace.spec.md:113 同範疇 spec-own) */}
        <nav aria-label="開通進度" className="w-[240px] shrink-0 border-r border-divider py-2">
          <TreeView
            aria-label="收款帳戶開通步驟"
            expandOnSelect
            selectedIds={selectedIds}
            onSelectedChange={(ids) => { const id = [...ids][0] as OnboardingStepId | undefined; if (id) setCurrent(id) }}
            expandedIds={expanded}
            onExpandedChange={setExpanded}
          >
            {ONBOARDING_GROUPS.map((group) => (
              <TreeItem key={group.id} id={group.id} label={group.label} selectable={false}>
                {group.steps.map((step) => <TreeItem key={step.id} id={step.id} label={step.label} status={results[step.id]} />)}
              </TreeItem>
            ))}
          </TreeView>
        </nav>
        <section aria-label="目前步驟" className="flex-1 min-w-0 p-[var(--layout-space-loose)]">
          <Page
            key={current}
            draft={draft}
            onPass={(patch) => {
              setDraft((d) => ({ ...d, ...patch }))
              setResults((r) => ({ ...r, [current]: 'completed' }))
              const next = ONBOARDING_ORDER[index + 1]
              if (next) setCurrent(next.id)
            }}
            onFail={() => setResults((r) => ({ ...r, [current]: 'error' }))}
            onBack={index > 0 ? () => setCurrent(ONBOARDING_ORDER[index - 1].id) : undefined}
          />
        </section>
      </div>
    </>
  )
}

export const Stepper: Story = {
  name: '步驟引導',
  parameters: {
    docs: {
      description: {
        story:
          '商家開通收款帳戶:左邊步驟樹、右邊是目前那一步的整頁內容。三個大步驟都沒有自己的頁面(`selectable={false}`),只把子步驟分組 —— ' +
          '點大步驟的文字會到它底下的第一個子步驟並展開;目前那一步已在裡面、而且看得到時,點它就是開 / 合(同一列的連點只算一下)。' +
          '灰底是「你在哪」;大步驟收起時,灰底與列尾結果一起移到它身上(例如「1. 商家資料」收著,替裡面的「負責人身分驗證」代顯紅叉)。' +
          '按「下一步」先驗證這一頁:過了列尾畫綠勾並前往下一步,沒過畫紅叉並停在這一頁。鍵盤:Enter / 空白鍵 = 到那一步,原地開合用 → / ←。',
      },
    },
  },
  render: () => <MerchantOnboarding />,
}

// ── 步驟導覽樹契約夾具(test-only;scripts/tree-view-step-navigation-invariant.mjs 量的就是這三棵樹)──────────
// 不給讀者看(test-only 不進側欄與文件頁):有自己頁面的大步驟依 user 2026-10-07 不做範例,它的規則只由這個夾具與閘守住。
// 三棵樹:沒有自己頁面的大步驟(含巢狀)/ 有自己頁面的大步驟 / 沒開 expandOnSelect 的一般樹(對照:行為不得改變)。
// 每棵樹的選取與展開由這裡持有(受控),外層 data-selected / data-expanded 給閘讀;window.__treeStepFixture[name] 讓閘把狀態重設成指定的起點。
interface StepFixtureState { selected: string | null; expanded: string[] }
function StepFixtureTree({ name, label, initial, expandOnSelect = true, children }: {
  name: string; label: string; initial: StepFixtureState; expandOnSelect?: boolean; children: React.ReactNode
}) {
  const [selected, setSelected] = React.useState(initial.selected)
  const [expanded, setExpanded] = React.useState(() => new Set(initial.expanded))
  React.useEffect(() => {
    // 閘用的掛鉤:scripts/tree-view-step-navigation-invariant.mjs 經 window.__treeStepFixture 把狀態重設成起點(f0dbaf5a 加,2026-10-14 複查)
    const w = window as unknown as { __treeStepFixture?: Record<string, (s: StepFixtureState) => void> }
    w.__treeStepFixture = { ...w.__treeStepFixture, [name]: (s) => { setSelected(s.selected); setExpanded(new Set(s.expanded)) } }
  }, [name])
  const selectedIds = React.useMemo(() => new Set(selected ? [selected] : []), [selected])
  return (
    // @layout-space-magic-ok: 有框容器裡的樹列集合:外框只給上下 8px,左右 0 讓滑過 / 選中底色貼齊框邊(tree-view.spec.md:384 / :391 垂直 padding 歸屬)(layoutSpace.spec.md:113 同範疇 spec-own)
    <div
      data-step-fixture={name}
      data-selected={selected ?? ''}
      data-expanded={[...expanded].sort().join(',')}
      className="w-[300px] rounded-lg border border-divider bg-surface py-2"
    >
      <TreeView
        aria-label={label}
        expandOnSelect={expandOnSelect}
        selectedIds={selectedIds}
        onSelectedChange={(ids) => setSelected([...ids][0] ?? null)}
        expandedIds={expanded}
        onExpandedChange={setExpanded}
      >
        {children}
      </TreeView>
    </div>
  )
}

const fixtureMore = { icon: MoreVertical, label: '更多動作', onClick: () => {} }

export const StepNavigationContract: Story = {
  name: '步驟導覽契約夾具',
  tags: ['test-only'],
  render: () => (
    <div className="flex flex-wrap items-start gap-[var(--layout-space-loose)]">
      <StepFixtureTree name="pageless" label="門市開通步驟" initial={{ selected: 'p2a', expanded: ['p2'] }}>
        <TreeItem id="p1" label="1. 商家資料" selectable={false}>
          <TreeItem id="p1a" label="公司基本資料" status="completed" inlineActions={[fixtureMore]} />
          <TreeItem id="p1b" label="負責人身分驗證" status="completed" />
        </TreeItem>
        <TreeItem id="p2" label="2. 收款設定" selectable={false}>
          <TreeItem id="p2a" label="收款銀行帳戶" status="error" />
          <TreeItem id="p2b" label="撥款週期" />
        </TreeItem>
        <TreeItem id="p3" label="3. 門市設定" selectable={false}>
          <TreeItem id="p3n" label="收銀機" selectable={false}>
            <TreeItem id="p3n1" label="連線設定" status="completed" />
            <TreeItem id="p3n2" label="發票機" />
          </TreeItem>
          <TreeItem id="p3c" label="營業時間" status="completed" />
        </TreeItem>
      </StepFixtureTree>
      <StepFixtureTree name="page" label="建置執行紀錄" initial={{ selected: 'h3', expanded: [] }}>
        <TreeItem id="h1" label="建置" status="error">
          <TreeItem id="h1a" label="安裝相依套件" status="completed" />
          <TreeItem id="h1b" label="執行單元測試" status="error" />
        </TreeItem>
        <TreeItem id="h2" label="部署" status="completed">
          <TreeItem id="h2a" label="上傳映像檔" status="completed" />
        </TreeItem>
        <TreeItem id="h3" label="通知" />
      </StepFixtureTree>
      <StepFixtureTree name="plain" label="專案檔案" initial={{ selected: 'f2', expanded: [] }} expandOnSelect={false}>
        <TreeItem id="f1" icon={Folder} label="設計稿">
          <TreeItem id="f1a" icon={FileText} label="首頁.fig" />
        </TreeItem>
        <TreeItem id="f2" icon={FileText} label="需求.md" />
      </StepFixtureTree>
    </div>
  ),
}

// ── Multi-select with Checkbox ───────────────────────────────────────────

const PERMISSION_GROUPS: Record<string, readonly string[]> = {
  read: ['read-docs', 'read-media'],
  write: ['write-docs', 'write-media'],
}

const CheckboxTree = () => {
  const [selectedIds, setSelectedIds] = React.useState(
    () => new Set(['read', 'read-docs', 'read-media', 'write-docs'])
  )

  const handleSelectedChange = React.useCallback((proposedIds: Set<string>) => {
    setSelectedIds((previousIds) => {
      const nextIds = new Set(proposedIds)
      const changedId = [...new Set([...previousIds, ...proposedIds])]
        .find((id) => previousIds.has(id) !== proposedIds.has(id))

      // 點 parent 時整組 cascade；點 child 時再由 children 真實狀態推導 parent。
      const changedChildren = changedId ? PERMISSION_GROUPS[changedId] : undefined
      if (changedId && changedChildren) {
        for (const childId of changedChildren) {
          if (proposedIds.has(changedId)) nextIds.add(childId)
          else nextIds.delete(childId)
        }
      }

      for (const [parentId, childIds] of Object.entries(PERMISSION_GROUPS)) {
        if (childIds.every((childId) => nextIds.has(childId))) nextIds.add(parentId)
        else nextIds.delete(parentId)
      }
      return nextIds
    })
  }, [])

  // parent 的 indeterminate 邏輯
  const readAll = PERMISSION_GROUPS.read.every((id) => selectedIds.has(id))
  const readSome = PERMISSION_GROUPS.read.some((id) => selectedIds.has(id))
  const writeAll = PERMISSION_GROUPS.write.every((id) => selectedIds.has(id))
  const writeSome = PERMISSION_GROUPS.write.some((id) => selectedIds.has(id))

  return (
    <div>
      <button type="button" className="sr-only">樹狀清單之前</button>
      {/* @layout-space-magic-ok: 有框容器裡的樹列集合:外框只給上下 8px,左右 0 讓滑過 / 選中底色貼齊框邊(tree-view.spec.md:384 / :391 垂直 padding 歸屬)(layoutSpace.spec.md:113 同範疇 spec-own) */}
      <div className="w-[300px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
        <TreeView
          selectionMode="multiple"
          aria-label="權限選擇"
          selectedIds={selectedIds}
          onSelectedChange={handleSelectedChange}
          defaultExpandedIds={['read', 'write']}
        >
          <TreeItem
            id="read"
            icon={Folder}
            label="讀取權限"
            checkbox={
              <Checkbox
                size="md"
                checked={readAll ? true : readSome ? 'indeterminate' : false}
                aria-label="讀取權限"
              />
            }
          >
            <TreeItem id="read-docs" icon={FileText} label="文件" />
            <TreeItem id="read-media" icon={Image} label="媒體檔案" />
          </TreeItem>
          <TreeItem
            id="write"
            icon={Folder}
            label="寫入權限"
            checkbox={
              <Checkbox
                size="md"
                checked={writeAll ? true : writeSome ? 'indeterminate' : false}
                aria-label="寫入權限"
              />
            }
          >
            <TreeItem id="write-docs" icon={FileText} label="文件" />
            <TreeItem id="write-media" icon={Image} label="媒體檔案" />
          </TreeItem>
        </TreeView>
      </div>
      <button type="button" className="sr-only">樹狀清單之後</button>
    </div>
  )
}

export const WithCheckbox: Story = {
  name: '多選',
  // 示範焦點是本則的主題(story-rules「示範 = 滑鼠使用者」):不放掉 play 造出的鍵盤焦點
  parameters: { demoFocus: 'keep' },
  render: () => <CheckboxTree />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getByRole('button', { name: '樹狀清單之前' })
    // 2026-09-25 總帳 B9:tree → treegrid,焦點由容器上的虛擬焦點改為列上的 roving tabindex(真焦點)
    const tree = canvas.getByRole('treegrid', { name: '權限選擇' })
    const after = canvas.getByRole('button', { name: '樹狀清單之後' })
    const visualCheckboxes = canvasElement.querySelectorAll('[role="checkbox"]')

    await expect(visualCheckboxes).toHaveLength(6)
    for (const checkbox of visualCheckboxes) {
      await expect(checkbox).toHaveAttribute('aria-hidden', 'true')
      await expect(checkbox).toHaveAttribute('tabindex', '-1')
    }
    // 容器本身不可聚焦 —— 唯一的 Tab 停靠點在列上
    await expect(tree).not.toHaveAttribute('tabindex')

    const readRow = canvasElement.querySelector<HTMLElement>('[data-tree-row="read"]')
    const readDocsRow = canvasElement.querySelector<HTMLElement>('[data-tree-row="read-docs"]')
    if (!readRow || !readDocsRow) throw new Error('TreeView 多選測試節點不存在')

    await userEvent.click(readRow)
    await expect(readRow).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    await expect(readDocsRow).toHaveFocus()

    // 離開再回來:落在上次停的那一列;再按一下 Tab 就離開整棵樹
    before.focus()
    await userEvent.tab()
    await expect(readDocsRow).toHaveFocus()
    await userEvent.tab()
    await expect(after).toHaveFocus()
  },
}

// ── Row actions + keyboard route(2026-09-25 總帳 B9)──────────────────
// 列上的「更多動作」「新增頁面」:平常隱藏、滑過或鍵盤焦點在這一列時出現;
// 鍵盤走法 = ↑↓ 換列、→ 進這一列的按鈕、← 回列、Tab 一下離開整棵樹(SSOT:tree-view.spec.md「鍵盤導覽」)。

const RowActionsTree = () => {
  const [lastAction, setLastAction] = React.useState<string | null>(null)
  // 資料夾:⋯ + ＋;檔案:⋯(tree-view.spec.md「Uniform 規則」:⋯ 全部都有、＋ 同類型統一)
  const more = (name: string) => ({ icon: MoreVertical, label: '更多動作', onClick: () => setLastAction(`更多動作 —「${name}」`) })
  const add = (name: string) => ({ icon: Plus, label: '新增頁面', onClick: () => setLastAction(`新增頁面 —「${name}」`) })
  return (
    // 樹 ↔ 它下方的動作讀數 = tight(控件 → 它的讀數,layoutSpace.spec.md 規則 3);前後兩顆 sr-only 鈕絕對定位、不佔版位
    <ExampleGroup>
      <button type="button" className="sr-only">樹狀清單之前</button>
      {/* @layout-space-magic-ok: 有框容器裡的樹列集合:外框只給上下 8px,左右 0 讓滑過 / 選中底色貼齊框邊(tree-view.spec.md:384 / :391 垂直 padding 歸屬)(layoutSpace.spec.md:113 同範疇 spec-own) */}
      <div className="w-[320px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
        <TreeView aria-label="產品文件" defaultExpandedIds={['requirements']} defaultSelectedIds={['checkout-prd']}>
          <TreeItem id="requirements" icon={Folder} label="產品需求" inlineActions={[more('產品需求'), add('產品需求')]}>
            <TreeItem id="roadmap" icon={FileText} label="2026 Q4 路線圖" inlineActions={[more('2026 Q4 路線圖')]} />
            <TreeItem id="checkout-prd" icon={FileText} label="付款流程改版 PRD" inlineActions={[more('付款流程改版 PRD')]} />
          </TreeItem>
          <TreeItem id="design" icon={Folder} label="設計交付" inlineActions={[more('設計交付'), add('設計交付')]}>
            <TreeItem id="component-spec" icon={FileText} label="元件規格" inlineActions={[more('元件規格')]} />
          </TreeItem>
          <TreeItem id="meeting-notes" icon={FileText} label="週會紀錄" inlineActions={[more('週會紀錄')]} />
        </TreeView>
      </div>
      <p className="text-caption text-fg-muted" aria-live="polite">
        {lastAction ? `最近一次動作:${lastAction}` : '尚未執行任何動作'}
      </p>
      <button type="button" className="sr-only">樹狀清單之後</button>
    </ExampleGroup>
  )
}

export const RowActions: Story = {
  name: '列上的動作',
  parameters: {
    // play 用鍵盤走完整條路線(story-rules「示範 = 滑鼠使用者」:示範焦點的 story 必須標 keep)
    demoFocus: 'keep',
    docs: {
      description: {
        story:
          '每一列的「更多動作」「新增頁面」平常隱藏,滑過列、或鍵盤焦點在這一列(列本身或列上的按鈕)時出現。' +
          '鍵盤:Tab 進到樹(落在選中的那一列)→ ↑↓ 換列 → → 進這一列的按鈕,→ / ← 在按鈕之間走,第一顆再按 ← 回到列;' +
          '收著的資料夾按 → 先展開,已展開的資料夾再按 → 才進按鈕。不論停在列上或按鈕上,Tab 一下就離開整棵樹 —— 別列的按鈕不在 Tab 路上。',
      },
    },
  },
  render: () => <RowActionsTree />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getByRole('button', { name: '樹狀清單之前' })
    const after = canvas.getByRole('button', { name: '樹狀清單之後' })
    const tree = canvas.getByRole('treegrid', { name: '產品文件' })
    const row = (id: string) => {
      const el = canvasElement.querySelector<HTMLElement>(`[data-tree-row="${id}"]`)
      if (!el) throw new Error(`找不到列 ${id}`)
      return el
    }
    const actionsOf = (id: string) => Array.from(row(id).querySelectorAll<HTMLElement>('[data-tree-actions] button'))

    // 1. Tab 路上只有一站:唯一 tabIndex ≥ 0 的是選中的那一列;列上按鈕全是 -1 而且都有名稱(總帳 B9)
    const stops = Array.from(tree.querySelectorAll<HTMLElement>('[tabindex]')).filter((el) => el.tabIndex >= 0)
    await expect(stops).toEqual([row('checkout-prd')])
    for (const button of tree.querySelectorAll<HTMLElement>('[data-tree-actions] button')) {
      await expect(button).toHaveAttribute('tabindex', '-1')
      await expect(button.getAttribute('aria-label')?.trim()).toBeTruthy()
    }

    // 2. Tab 進來落在選中的列;再按一下 Tab 就離開整棵樹;Shift+Tab 回到同一列
    before.focus()
    await userEvent.tab()
    await expect(row('checkout-prd')).toHaveFocus()
    await userEvent.tab()
    await expect(after).toHaveFocus()
    await userEvent.tab({ shift: true })
    await expect(row('checkout-prd')).toHaveFocus()

    // 3. 葉節點:→ 進這一列唯一的按鈕,再 → 不動;Enter 執行按鈕自己的動作、焦點留在按鈕;Tab 一下離開
    const [prdMore] = actionsOf('checkout-prd')
    await userEvent.keyboard('{ArrowRight}')
    await expect(prdMore).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(prdMore).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByText('最近一次動作:更多動作 —「付款流程改版 PRD」')).toBeInTheDocument()
    await expect(prdMore).toHaveFocus()
    await userEvent.tab()
    await expect(after).toHaveFocus()

    // 4. 回來後 ↑↑ 到展開的資料夾:→ 第一顆、→ 第二顆、→ 不動、← 第一顆、← 回列
    await userEvent.tab({ shift: true })
    await expect(row('checkout-prd')).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    await expect(row('requirements')).toHaveFocus()
    const [folderMore, folderAdd] = actionsOf('requirements')
    await userEvent.keyboard('{ArrowRight}')
    await expect(folderMore).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(folderAdd).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(folderAdd).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(folderMore).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    await expect(row('requirements')).toHaveFocus()

    // 5. 列上 ← / → 維持樹的語意(收合、再展開,焦點不離開這一列);按鈕上 ↓ 換到下一列
    await userEvent.keyboard('{ArrowLeft}')
    await expect(row('requirements')).toHaveAttribute('aria-expanded', 'false')
    await userEvent.keyboard('{ArrowRight}')
    await expect(row('requirements')).toHaveAttribute('aria-expanded', 'true')
    await expect(row('requirements')).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    await expect(row('roadmap')).toHaveFocus()

    // 收尾:焦點放回樹外(sr-only 哨兵),畫面回到滑鼠使用者看到的樣子
    after.focus()
  },
}

// ── 刪除節點後焦點接力(2026-09-29 待辦總帳 N46「刪除 / 消失後焦點去下一項」)──────────
// 真實情境:知識庫的頁面樹,列上的「刪除」把節點從資料裡拿掉。焦點在被刪的那一列(或它的按鈕)上時,
// 接力到畫面順序的**下一個可見列**(可能是下一個頂層節點);沒有下一列 → **上一個可見列**(可能就是父節點);禁止掉到 body。
// 落點順序同 FileUpload 的移除鈕(下一個 → 上一個 → 擁有者)。
type WikiNode = { id: string; label: string; children?: WikiNode[] }
const dropNode = (nodes: WikiNode[], id: string): WikiNode[] =>
  nodes.filter((n) => n.id !== id).map((n) => (n.children ? { ...n, children: dropNode(n.children, id) } : n))
const DeleteHandoffTree = () => {
  const [nodes, setNodes] = React.useState<WikiNode[]>([
    { id: 'handbook', label: '員工手冊', children: [
      { id: 'onboarding', label: '到職第一週' },
      { id: 'expense', label: '報帳流程' },
      { id: 'leave', label: '請假規定' },
    ] },
    { id: 'archive', label: '封存' },
  ])
  const remove = (id: string) => ({ icon: Trash2, label: '刪除', onClick: () => setNodes((prev) => dropNode(prev, id)) })
  const renderNodes = (list: WikiNode[]) => list.map((n) => (
    <TreeItem key={n.id} id={n.id} icon={n.children ? Folder : FileText} label={n.label} inlineActions={[remove(n.id)]}>
      {n.children ? renderNodes(n.children) : undefined}
    </TreeItem>
  ))
  return (
    // 前後兩顆 sr-only 鈕絕對定位、不佔版位 → 版面上只有樹框一個子節點,不設 gap(原本的 8px 不作用)
    <div className="flex flex-col">
      <button type="button" className="sr-only">樹狀清單之前</button>
      {/* @layout-space-magic-ok: 有框容器裡的樹列集合:外框只給上下 8px,左右 0 讓滑過 / 選中底色貼齊框邊(tree-view.spec.md:384 / :391 垂直 padding 歸屬)(layoutSpace.spec.md:113 同範疇 spec-own) */}
      <div className="w-[320px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
        <TreeView aria-label="知識庫" defaultExpandedIds={['handbook']}>{renderNodes(nodes)}</TreeView>
      </div>
      <button type="button" className="sr-only">樹狀清單之後</button>
    </div>
  )
}

export const DeleteHandoff: Story = {
  name: '刪除後焦點接力',
  parameters: {
    demoFocus: 'keep',
    docs: {
      description: {
        story:
          '列上的「刪除」把節點從資料裡拿掉時,鍵盤焦點不會掉到頁面外:接力到畫面順序的下一個可見列(可能是下一個頂層節點);' +
          '已是最後一列 → 上一個可見列(可能就是父節點)。這則的 play 用鍵盤實際刪四次驗證(同層下一列 / 下一個頂層節點 / 上一列 / 父節點)。',
      },
    },
  },
  render: () => <DeleteHandoffTree />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvas.getByRole('button', { name: '樹狀清單之前' })
    const row = (id: string) => {
      const el = canvasElement.querySelector<HTMLElement>(`[data-tree-row="${id}"]`)
      if (!el) throw new Error(`找不到列 ${id}`)
      return el
    }
    // Tab 進樹落在第一列(員工手冊),↓↓ 到「報帳流程」,→ 進它的「刪除」,Enter 刪掉 → 焦點接力到下一列「請假規定」
    before.focus()
    await userEvent.tab()
    await expect(row('handbook')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await expect(row('expense')).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(row('expense').querySelector('[data-tree-actions] button')).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(canvasElement.querySelector('[data-tree-row="expense"]')).toBeNull())
    await waitFor(() => expect(row('leave')).toHaveFocus())
    // 刪掉「請假規定」(員工手冊的最後一個子節點):畫面順序的下一個可見列是下一個頂層節點「封存」
    await userEvent.keyboard('{ArrowRight}{Enter}')
    await waitFor(() => expect(canvasElement.querySelector('[data-tree-row="leave"]')).toBeNull())
    await waitFor(() => expect(row('archive')).toHaveFocus())
    // 刪掉「封存」(整棵樹最後一列):沒有下一列 → 上一個可見列「到職第一週」
    await userEvent.keyboard('{ArrowRight}{Enter}')
    await waitFor(() => expect(canvasElement.querySelector('[data-tree-row="archive"]')).toBeNull())
    await waitFor(() => expect(row('onboarding')).toHaveFocus())
    // 再刪「到職第一週」(唯一剩下的子節點):上一列就是父節點「員工手冊」;整棵樹的 Tab 停靠點跟著落在它
    await userEvent.keyboard('{ArrowRight}{Enter}')
    await waitFor(() => expect(canvasElement.querySelector('[data-tree-row="onboarding"]')).toBeNull())
    await waitFor(() => expect(row('handbook')).toHaveFocus())
    await expect(row('handbook')).toHaveAttribute('tabindex', '0')
    // 收尾:焦點放回樹外
    canvas.getByRole('button', { name: '樹狀清單之後' }).focus()
  },
}

// ── Long label (wrap test) ──────────────────────────────────────────────

export const LongLabel: Story = {
  name: '長標籤',
  render: () => (
    <div className="flex gap-[var(--layout-space-loose)] items-start">
      <ExampleGroup>
        <span className="text-caption font-medium text-fg-muted">預設 truncate</span>
        {/* @layout-space-magic-ok: 有框容器裡的樹列集合:外框只給上下 8px,左右 0 讓滑過 / 選中底色貼齊框邊(tree-view.spec.md:384 / :391 垂直 padding 歸屬)(layoutSpace.spec.md:113 同範疇 spec-own) */}
        <div className="w-[220px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
          <TreeView aria-label="產品設計檔案樹（截斷）" defaultExpandedIds={['proj']}>
            <TreeItem id="proj" icon={Folder} label="2026 產品品牌識別設計提案">
              <TreeItem id="f1" icon={FileText} label="首頁主視覺設計稿-桌面版-v3.fig" />
              <TreeItem id="f2" icon={FileText} label="logo.svg" />
            </TreeItem>
          </TreeView>
        </div>
      </ExampleGroup>
      <ExampleGroup>
        <span className="text-caption font-medium text-fg-muted">label 換行（移除 truncate）</span>
        {/* @layout-space-magic-ok: 有框容器裡的樹列集合:外框只給上下 8px,左右 0 讓滑過 / 選中底色貼齊框邊(tree-view.spec.md:384 / :391 垂直 padding 歸屬)(layoutSpace.spec.md:113 同範疇 spec-own) */}
        <div className="w-[220px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
          <TreeView aria-label="產品設計檔案樹（換行）" defaultExpandedIds={['proj2']}>
            <TreeItem id="proj2" icon={Folder} label={<span className="break-words whitespace-normal">2026 產品品牌識別設計提案完整版</span>}>
              <TreeItem id="f3" icon={FileText} label={<span className="break-words whitespace-normal">首頁主視覺設計稿-桌面版與行動版對照-v3-最終定稿.fig</span>} />
              <TreeItem id="f4" icon={FileText} label="logo.svg" />
            </TreeItem>
          </TreeView>
        </div>
      </ExampleGroup>
    </div>
  ),
}

// ── Drag and Drop (functional — items actually move) ────────────────────

interface DemoNode { id: string; label: string; icon: LucideIcon; children?: DemoNode[] }

function removeNode(nodes: DemoNode[], id: string): [DemoNode[], DemoNode | null] {
  let removed: DemoNode | null = null
  const result = nodes.filter(n => {
    if (n.id === id) { removed = n; return false }
    return true
  }).map(n => {
    if (!n.children) return n
    const [newChildren, found] = removeNode(n.children, id)
    if (found) removed = found
    return { ...n, children: newChildren }
  })
  return [result, removed]
}

function insertNode(nodes: DemoNode[], targetId: string, node: DemoNode, position: 'before' | 'after' | 'inside'): DemoNode[] {
  if (position === 'inside') {
    return nodes.map(n => {
      if (n.id === targetId) return { ...n, children: [...(n.children ?? []), node] }
      if (!n.children) return n
      return { ...n, children: insertNode(n.children, targetId, node, position) }
    })
  }
  const result: DemoNode[] = []
  for (const n of nodes) {
    if (n.id === targetId && position === 'before') result.push(node)
    result.push(n.children ? { ...n, children: insertNode(n.children, targetId, node, position) } : n)
    if (n.id === targetId && position === 'after') result.push(node)
  }
  return result
}

function renderNodes(nodes: DemoNode[]) {
  return nodes.map(n => (
    <TreeItem key={n.id} id={n.id} icon={n.icon} label={n.label}>
      {n.children && n.children.length > 0 && renderNodes(n.children)}
    </TreeItem>
  ))
}

const INITIAL_TREE: DemoNode[] = [
  { id: 'pages', label: 'Pages', icon: Folder, children: [
    { id: 'home', label: 'Home', icon: FileText },
    { id: 'about', label: 'About', icon: FileText },
    { id: 'contact', label: 'Contact', icon: FileText },
  ]},
  { id: 'docs', label: 'Docs', icon: Folder, children: [
    { id: 'intro', label: 'Introduction', icon: FileCode },
    { id: 'guide', label: 'Getting Started', icon: FileCode },
  ]},
  { id: 'settings', label: 'Settings', icon: Settings },
]

export const DragAndDrop: Story = {
  name: '拖曳重排',
  render: () => {
    const [tree, setTree] = React.useState(INITIAL_TREE)
    const [log, setLog] = React.useState<string[]>([])

    return (
      // 示範欄 ↔ 紀錄欄並列 = loose;說明 → 樹 → 重設鈕 = tight(說明在替樹命名、重設鈕直接作用在這棵樹,layoutSpace.spec.md 規則 3)
      <div className="flex gap-[var(--layout-space-loose)] items-start">
        <ExampleGroup>
          <p className="text-caption text-fg-muted max-w-xs">
            Figma 風格:整列拖曳,items 真的會移動。拖到其他 node 上方(before) / 下方(after) / 中間(inside 成為子項)。
            鍵盤同樣可重排:Tab 聚焦樹、↑↓ 移到目標後,Cmd/Ctrl+Shift+↑↓ 同層移動、→ 移入資料夾、← 移出到上層(每按一下立即生效,結果會播報給螢幕閱讀器)。
          </p>
          {/* @layout-space-magic-ok: 有框容器裡的樹列集合:外框只給上下 8px,左右 0 讓滑過 / 選中底色貼齊框邊(tree-view.spec.md:384 / :391 垂直 padding 歸屬)(layoutSpace.spec.md:113 同範疇 spec-own) */}
          <div className="w-[280px] border border-divider rounded-lg bg-surface overflow-hidden py-2">
            <TreeView
              aria-label="拖曳排序"
              draggable
              defaultExpandedIds={['pages', 'docs']}
              onDragEnd={(e) => {
                setTree(prev => {
                  const [without, node] = removeNode(prev, e.sourceId)
                  if (!node) return prev
                  return insertNode(without, e.targetId, node, e.position)
                })
                setLog(prev => [`${e.sourceId} → ${e.targetId} (${e.position})`, ...prev].slice(0, 10))
              }}
            >
              {renderNodes(tree)}
            </TreeView>
          </div>
          {/* 2026-09-25:原本是手刻的原生按鈕元素(展示層禁原生控件,story-rules「禁止」);單獨的輔助動作一律 tertiary(button.spec.md Variant 表) */}
          <Button variant="tertiary" size="sm" className="self-start" onClick={() => setTree(INITIAL_TREE)}>
            重設
          </Button>
        </ExampleGroup>
        <div className="w-[240px]">
          <p className="text-caption font-medium text-fg-muted mb-[var(--layout-space-tight)]">移動紀錄</p>
          {/* @layout-space-magic-ok: 移動紀錄是一串同質的紀錄列,列距 4px(layoutSpace.spec.md:165 同質清單列) */}
          <div className="flex flex-col gap-1 text-[11px] font-mono text-fg-secondary">
            {log.length === 0 && <span className="text-fg-muted">拖曳 node 後這裡會顯示</span>}
            {log.map((l, i) => <span key={i}>{l}</span>)}
          </div>
        </div>
      </div>
    )
  },
}

// @story-history: AllSizes retired per F migration(2026-05-15)— anatomy.stories.tsx SizeMatrix auto-compile owns size showcase。
// @story-history: IndentAlignment retired per Dim 24 dedup(2026-07-17)— indentStep=chevronSize+gap-2 幾何三重重複(showcase / anatomy IndentMatrix / principles IndentRule)。geometry 歸 anatomy.stories.tsx IndentMatrix、縮排原則 + icon 混用反例(唯一在此的內容)已遷入 principles.stories.tsx IndentRule;showcase 層不重複教 geometry(同 AllSizes / States 退役先例)。
