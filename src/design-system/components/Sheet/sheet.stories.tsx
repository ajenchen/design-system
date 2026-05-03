// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
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
import { Field, FieldLabel, FieldDescription } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { Textarea } from '@/design-system/components/Textarea/textarea'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { CheckboxGroup } from '@/design-system/components/Checkbox/checkbox-group'

const meta: Meta = {
  title: 'Design System/Components/Sheet/展示',
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj

export const CreateProjectRight: Story = {
  name: '右側建立 project',
  render: () => (
    <Sheet>
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
          <Field>
            <FieldLabel>專案名稱</FieldLabel>
            <Input placeholder="例:Q2 產品路線圖" />
          </Field>
          <Field>
            <FieldLabel>描述</FieldLabel>
            <Textarea placeholder="簡述此專案的目標與範圍" rows={4} />
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
          <Button variant="primary">建立專案</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}

export const EditUserRight: Story = {
  name: '右側編輯 user detail',
  render: () => (
    <Sheet>
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
          <Field>
            <FieldLabel>顯示名稱</FieldLabel>
            <Input defaultValue="Ada Chen" />
          </Field>
          <Field>
            <FieldLabel>職稱</FieldLabel>
            <Input defaultValue="Design Engineer" />
          </Field>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input defaultValue="ada.chen@example.com" />
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
          <Button variant="primary">儲存變更</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
  tags: ['!autodocs'],
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
