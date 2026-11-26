// ── 按「編輯」整組變表單(field.stories.tsx「按編輯整組變表單」的畫面;讀者看的範例)──────────────────────────────
// Field 層純顯示 `<Field mode="view">` 的唯一用途(user 2026-11-25 FIELD-VIEW 點選「甲：欄位純顯示 (Recommended)」;
// field.spec.md「閱讀情境」的「不變與邊界」):平常是一組純顯示的欄位,按「編輯」同一組 Field 原地變成表單(mode="edit"),
// 底部「取消 / 儲存」。不在原地變表單的唯讀資訊區塊不用這個,用 DescriptionList(field.spec.md「何時不用」)。
// 看得到的兩件事都是規格既有的,本檔不另立規則:
//   平常(純顯示)標籤是次要色、編輯中回到一般表單的標籤色(field.spec.md「閱讀情境」效果 ①);
//   值的第一個字齊標籤欄右邊那條線,進編輯後字落在框內(field-controls.spec.md「軸一 view mode」;切換時左右會移 13,user 已知)。
// 版面:標籤在左的設定區塊 → FieldGroup labelWidth 統一標籤寬(field.spec.md「硬規則」);標題 → 欄位 = loose、
// 欄位 → 按鈕列 = loose × 2(layoutSpace.spec.md 規則 3,同 field.stories.tsx 表單驗證那兩張表);
// 單獨的「編輯」= tertiary、取消 tertiary + 儲存 primary(button.spec.md「Variant 控制視覺強調等級」)。
// 【AI 推導】編輯中不畫「編輯」鈕(已在編輯);儲存 / 取消後焦點回「編輯」鈕(按鈕消失時焦點不丟到 body,鍵盤使用者接著操作)。
import * as React from 'react'
import { Pencil } from 'lucide-react'
import { Field, FieldLabel, FieldGroup } from './field'
import { Input } from '@/design-system/components/Input/input'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { Switch } from '@/design-system/components/Switch/switch'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { Toaster, toast } from '@/design-system/components/Toast/toast'

export const VIEW_THEN_EDIT_DOC =
  '專案設定頁的「專案資料」區塊:平常是一組純顯示的欄位(`<Field mode="view">`),按右上「編輯」整組原地變成表單,改完按「儲存」或「取消」回到純顯示。' +
  'Field 層純顯示只用在這種「整組按編輯才變表單」的區塊;不會在原地變成表單的唯讀資訊(訂單明細、檔案資訊)用 DescriptionList,一次只改一欄、點了就改的詳情用 InlineEdit。' +
  '平常的標籤是次要色(閱讀情境),進入編輯後回到一般表單的標籤色。'

const STATUS: SelectOption[] = [
  { value: 'active', label: '進行中' },
  { value: 'paused', label: '暫停' },
  { value: 'done', label: '已完成' },
]

interface ProjectInfo { name: string; status: string; due: string | null; public: boolean }
const INITIAL: ProjectInfo = { name: '結帳流程改版', status: 'active', due: '2026-12-18', public: true }

export function ViewThenEditDemo() {
  const [saved, setSaved] = React.useState<ProjectInfo>(INITIAL)
  const [draft, setDraft] = React.useState<ProjectInfo>(INITIAL)
  const [editing, setEditing] = React.useState(false)
  const editButtonRef = React.useRef<HTMLButtonElement>(null)
  // 「編輯」鈕在編輯中不畫;回到純顯示那一刻它重新掛上,這時才把焦點還給它
  const returnFocus = React.useRef(false)
  React.useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false
      editButtonRef.current?.focus()
    }
  }, [editing])
  const finish = () => { returnFocus.current = true; setEditing(false) }
  const mode = editing ? 'edit' : 'view'
  const set = <K extends keyof ProjectInfo>(key: K, value: ProjectInfo[K]) => setDraft((prev) => ({ ...prev, [key]: value }))
  return (
    <>
      <Toaster />
      <section aria-labelledby="project-info-title" className="w-[30rem] border border-border rounded-md p-[var(--layout-space-loose)]">
        {/* 標題列最小高 = 「編輯」鈕(sm)的高:編輯中鈕不畫,標題列不變矮、下面整組不上移【AI 推導】 */}
        <div className="flex items-center justify-between gap-[var(--layout-space-tight)] min-h-field-sm mb-[var(--layout-space-loose)]">
          <h3 id="project-info-title" className="text-h6 text-foreground">專案資料</h3>
          {!editing && (
            <Button ref={editButtonRef} variant="tertiary" size="sm" startIcon={Pencil} onClick={() => { setDraft(saved); setEditing(true) }}>
              編輯
            </Button>
          )}
        </div>
        <FieldGroup labelWidth={96}>
          <Field orientation="horizontal" mode={mode}>
            <FieldLabel>專案名稱</FieldLabel>
            <Input value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field orientation="horizontal" mode={mode}>
            <FieldLabel>狀態</FieldLabel>
            <Select options={STATUS} value={draft.status} onChange={(v) => set('status', v)} />
          </Field>
          <Field orientation="horizontal" mode={mode}>
            <FieldLabel>截止日</FieldLabel>
            <DatePicker value={draft.due} onChange={(v) => set('due', v || null)} />
          </Field>
          <Field orientation="horizontal" mode={mode}>
            <FieldLabel>公開給全公司</FieldLabel>
            <Switch checked={draft.public} onCheckedChange={(v) => set('public', v)} />
          </Field>
        </FieldGroup>
        {editing && (
          <ButtonGroup className="mt-[calc(var(--layout-space-loose)*2)] justify-end">
            <Button variant="tertiary" onClick={() => { setDraft(saved); finish() }}>取消</Button>
            <Button variant="primary" onClick={() => { setSaved(draft); toast({ variant: 'success', title: '專案資料已儲存' }); finish() }}>儲存</Button>
          </ButtonGroup>
        )}
      </section>
    </>
  )
}
