// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
  SheetClose,
} from './sheet'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldDescription, FieldError, useFormValidation } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { Textarea } from '@/design-system/components/Textarea/textarea'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { CheckboxGroup } from '@/design-system/components/Checkbox/checkbox-group'

const meta: Meta = {
  title: 'Design System/Components/Sheet/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: { description: { component: '從畫面右側滑入的模態工作面，提供 header、可捲 body 與 footer。當次要流程需要更多空間但仍應保留原頁脈絡時使用；短小選項改用 Popover。' } },
  },
}
export default meta
type Story = StoryObj

/**
 * 側板裡的表單走 `useFormValidation`(2026-10-01;form-validation.spec.md 可執行層):改過的欄位第一下 Esc 回復、第二下才關側板
 * (keyboard-model-canonical.md「焦點所在的控件自己那一層也算一層」);沒有表單引擎的 `<Input>` 沒有「原值」可回復,Esc 直接關 ——
 * DS 自己的表單範例因此一律接 hook,預覽看到的就是裁示的行為。沒有 `<form>`:footer 鈕 `onClick={() => void form.handleSubmit()}`(規則 8b 的寫法)。
 * 送出成功 → Toast 再關閉(form-validation.spec.md「Submit 成功宣告」;user 2026-10-01 逐字「…然後送出成功跳提示」,文案是 AI 依 toast.spec 句型擬的)。
 * 每次打開那一刻 `reset()`(AI 推導):建立表單回到空白、更新表單回到最後存下的值;關閉當下不清,收起動畫期間欄位不會先閃掉。
 */
function CreateProjectSheet() {
  const [open, setOpen] = useState(false)
  const form = useFormValidation({
    initialValues: { name: '', description: '' },
    validate: { name: (v) => (String(v).trim() ? undefined : '專案名稱必填') },
    onSubmit: () => {
      toast({ variant: 'success', title: '專案已建立' })
      setOpen(false)
    },
  })
  const handleOpenChange = (next: boolean) => {
    if (next) form.reset()
    setOpen(next)
  }
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="primary">建立新專案</Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>建立新專案</SheetTitle>
        </SheetHeader>
        {/* Field-to-field gap = `--layout-space-loose`:form 用 `flex-col gap-*` 單值,保守選 loose
            讓「非 fw ↔ 非 fw」Input↔Input 合規(規則 3 per-transition 原意 loose);
            fw-adjacent 的微 tight 視覺損失 < 非 fw-adjacent 的 loose 破壞。
            詳 `layoutSpace.spec.md` 規則 3 caveat。 */}
        <SheetBody className="flex flex-col gap-[var(--layout-space-loose)]">
          <Field required invalid={!!form.errors.name}>
            <FieldLabel>專案名稱</FieldLabel>
            <Input placeholder="例:Q2 產品路線圖" {...form.getInputProps('name')} />
            <FieldError>{form.errors.name}</FieldError>
          </Field>
          <Field>
            <FieldLabel>描述</FieldLabel>
            <Textarea placeholder="簡述此專案的目標與範圍" rows={4} {...form.getInputProps('description')} />
            <FieldDescription>選填,可在建立後補上</FieldDescription>
          </Field>
          {/* 多選場景:初始成員權限(從設計系統中組合出 Jira / Linear 專案建立流程的典型多選欄位)
              label 明確是「多選權限」;若要做「開 / 關通知」這種 binary toggle,用 Switch 不用 CheckboxGroup。 */}
          <Field>
            <FieldLabel>初始成員權限</FieldLabel>
            <FieldDescription>可勾選多項,所有成員預設獲得這些權限</FieldDescription>
            <CheckboxGroup>
              <Checkbox defaultChecked label="檢視專案內容" />
              <Checkbox defaultChecked label="新增與編輯任務" />
              <Checkbox label="管理成員與設定" />
            </CheckboxGroup>
          </Field>
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="tertiary">取消</Button>
          </SheetClose>
          <Button variant="primary" loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>建立專案</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export const CreateProjectRight: Story = {
  name: '建立新專案（右側滑入）',
  // Toast 的 Toaster:每個獨立 story root 掛一個(toast.spec.md「app-level-one 是強制合約」允許 Storybook 各 story root 一個)
  render: () => (
    <>
      <Toaster />
      <CreateProjectSheet />
    </>
  ),
}

/**
 * 更新表單(同上接 hook):沒改不能存(form-validation.spec.md「Submit Button 狀態」更新列),Esc 第一下回復改過的欄位、第二下才關。
 * 送出成功 → Toast 再關閉;存下的值成為新的比對基準,下次打開(`reset()`)就是存下的值。
 */
function EditUserSheet() {
  const [open, setOpen] = useState(false)
  const form = useFormValidation({
    initialValues: { displayName: 'Ada Chen', title: 'Design Engineer', email: 'ada.chen@example.com' },
    intent: 'update',
    validate: {
      displayName: (v) => (String(v).trim() ? undefined : '顯示名稱必填'),
      email: (v) => (/^\S+@\S+\.\S+$/.test(String(v)) ? undefined : 'Email 格式不正確'),
    },
    onSubmit: () => {
      toast({ variant: 'success', title: '成員資料已儲存' })
      setOpen(false)
    },
  })
  const handleOpenChange = (next: boolean) => {
    if (next) form.reset()
    setOpen(next)
  }
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button variant="tertiary">檢視成員詳情</Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Ada Chen</SheetTitle>
        </SheetHeader>
        {/* Field-to-field gap = `--layout-space-loose`:form 用 `flex-col gap-*` 單值,保守選 loose
            讓「非 fw ↔ 非 fw」Input↔Input 合規(規則 3 per-transition 原意 loose);
            fw-adjacent 的微 tight 視覺損失 < 非 fw-adjacent 的 loose 破壞。
            詳 `layoutSpace.spec.md` 規則 3 caveat。 */}
        <SheetBody className="flex flex-col gap-[var(--layout-space-loose)]">
          <Field required invalid={!!form.errors.displayName}>
            <FieldLabel>顯示名稱</FieldLabel>
            <Input {...form.getInputProps('displayName')} />
            <FieldError>{form.errors.displayName}</FieldError>
          </Field>
          <Field>
            <FieldLabel>職稱</FieldLabel>
            <Input {...form.getInputProps('title')} />
          </Field>
          <Field required invalid={!!form.errors.email}>
            <FieldLabel>Email</FieldLabel>
            <Input {...form.getInputProps('email')} />
            <FieldError>{form.errors.email}</FieldError>
          </Field>
          <Field>
            <FieldLabel>進階權限</FieldLabel>
            <FieldDescription>可勾選多項</FieldDescription>
            <CheckboxGroup>
              <Checkbox defaultChecked label="管理其他成員帳號" />
              <Checkbox defaultChecked label="編輯工作區設定" />
              <Checkbox label="刪除專案與資料" />
            </CheckboxGroup>
          </Field>
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="tertiary">取消</Button>
          </SheetClose>
          <Button variant="primary" loading={form.isSubmitting} disabled={form.submitDisabled} onClick={() => void form.handleSubmit()}>儲存變更</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export const EditUserRight: Story = {
  name: '編輯成員詳情（右側滑入）',
  render: () => (
    <>
      <Toaster />
      <EditUserSheet />
    </>
  ),
}

// LeftNavigation 範例移除(AR35):消費者 Sheet API **只能用 side="right"**。
// 左側 / 頂部 / 底部為 DS 內部基建用(如 Sidebar 在 narrow viewport 時切 left 滑入),
// 需 user 明示授權。本 stories 檔不提供未授權用法示範。

/**
 * OpenSnapshot — visual-audit 專用 story(對齊 Dialog OpenSnapshot canonical)。
 * `defaultOpen` 讓 Sheet render 即開著,Playwright 截圖抓得到 chrome(Header / Body / Footer)。
 * 世界級 Polaris / Atlassian chromatic 稽核共通 pattern。
 */
export const OpenSnapshot: Story = {
  name: '開啟狀態',
  tags: ['test-only'],
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button>打開 Sheet</Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>編輯使用者 profile</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-[var(--layout-space-loose)]">
          <Field>
            <FieldLabel>顯示名稱</FieldLabel>
            <Input defaultValue="Alan Chen" />
          </Field>
          <Field>
            <FieldLabel>職稱</FieldLabel>
            <Input defaultValue="Senior Designer" />
          </Field>
          <Field>
            <FieldLabel>自我介紹</FieldLabel>
            <Textarea defaultValue="設計師,專注於 DS + tooling。" rows={3} />
          </Field>
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="tertiary">取消</Button>
          </SheetClose>
          <Button variant="primary">儲存</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}
