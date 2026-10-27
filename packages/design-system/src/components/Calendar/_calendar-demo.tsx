// Calendar 三層 story 共用的示範殼(`_` 前綴 = 示範用的私有 helper,不進 index)。
// 月曆的三個點擊目標各給一個真實的結果,取代瀏覽器原生 alert(原生對話框不是 DS 元件):
//   點事件方塊 → 在方塊旁開 Popover,看事件名稱與日期;
//   點日期 / 右上角「新事件」→ Dialog「新增事件」(名稱必填 + 日期),送出成功跳 Toast、事件排進月曆
//  (送出成功的宣告照 form-validation.spec.md「Submit 成功宣告」;對話框表單的接法同 dialog.stories.tsx 建立專案表單)。
// 依據:user 2026-10-21 確認頁 D13「d13照你建議」(建議 = 上面這三個結果)。
// 唯讀的日期格 / 事件方塊(`readOnlyDates` / `readOnlyEvents`)照樣唯讀 —— 殼只替可點的那一半接上結果。
import * as React from 'react'
import { Calendar, type CalendarEvent, type CalendarProps } from './calendar'
import { Popover, PopoverAnchor, PopoverContent, PopoverHeader, PopoverTitle, PopoverBody } from '@/design-system/components/Popover/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/design-system/components/Dialog/dialog'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldError, useFormValidation } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { returnFocusToOpener } from '@/design-system/lib/overlay-focus-return'

type CalendarDemoProps = Omit<CalendarProps, 'onDateClick' | 'onEventClick' | 'onCreateEvent' | 'readOnlyDates' | 'readOnlyEvents'> & {
  readOnlyDates?: boolean
  readOnlyEvents?: boolean
  /** 新增的是什麼(對話框標題「新增{noun}」、欄位「{noun}名稱」、送出後「{noun}已新增」);預設「事件」 */
  noun?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayText = (v: string | Date) => {
  const d = typeof v === 'string' ? new Date(`${v.slice(0, 10)}T00:00:00`) : v
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}
/** 事件日期一行字:單日「7 月 12 日」;跨日「7 月 20 日 – 7 月 22 日」;全天事件加「· 全天」 */
const eventWhen = (event: CalendarEvent) => {
  const s = dayText(event.start)
  const e = dayText(event.end)
  return `${s === e ? s : `${s} – ${e}`}${event.allDay ? ' · 全天' : ''}`
}

/** 月曆 + 三個點擊目標的結果 + 這一則 story 自己的 Toaster(toast.spec.md「app-level-one」允許 Storybook 每個 story root 一個) */
export function CalendarDemo({ events: initialEvents = [], readOnlyDates, readOnlyEvents, noun = '事件', today, ...rest }: CalendarDemoProps) {
  const [events, setEvents] = React.useState<CalendarEvent[]>(initialEvents)
  const [openEvent, setOpenEvent] = React.useState<CalendarEvent | null>(null)
  const anchorRef = React.useRef<HTMLElement | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const form = useFormValidation({
    initialValues: { title: '', date: isoOf(today ?? new Date()) },
    validate: { title: (v) => (String(v).trim() ? undefined : `${noun}名稱必填`) },
    onSubmit: (values) => {
      const date = String(values.date)
      setEvents((prev) => [...prev, { id: `new-${prev.length + 1}`, title: String(values.title).trim(), start: date, end: date, color: 'blue' }])
      toast({ variant: 'success', title: `${noun}已新增` })
      setCreateOpen(false)
    },
  })
  // 每次打開都是空白表單,日期 = 點的那一天(右上角開的 = 今天);同 dialog.stories.tsx 建立專案:打開那一刻 reset
  const openCreate = (on: Date) => {
    form.reset()
    form.setFieldValue('date', isoOf(on))
    setCreateOpen(true)
  }
  const dateProps = readOnlyDates ? { readOnlyDates: true as const } : { onDateClick: openCreate }
  const eventProps = readOnlyEvents ? { readOnlyEvents: true as const } : {
    onEventClick: (event: CalendarEvent) => {
      // 錨點 = 剛被按的那個事件方塊:滑鼠點與格內導覽(F2 進格)的 Enter / Space 都會讓它成為焦點
      anchorRef.current = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-calendar-tile]') : null
      setOpenEvent(event)
    },
  }
  return (
    <>
      <Toaster />
      <Calendar {...rest} today={today} events={events} {...dateProps} {...eventProps} onCreateEvent={() => openCreate(today ?? new Date())} />
      <Popover open={openEvent != null} onOpenChange={(next) => { if (!next) setOpenEvent(null) }}>
        <PopoverAnchor virtualRef={anchorRef as React.RefObject<HTMLElement>} />
        {/* 只有錨點、沒有觸發鈕:收起時焦點還給事件方塊(點外面收起不搶;同 date-picker.tsx DatePickerRange 的接法) */}
        <PopoverContent align="start" onCloseAutoFocus={(e) => returnFocusToOpener(e, anchorRef.current, { noTrigger: true })}>
          <PopoverHeader><PopoverTitle>{openEvent?.title}</PopoverTitle></PopoverHeader>
          <PopoverBody>{openEvent ? eventWhen(openEvent) : null}</PopoverBody>
        </PopoverContent>
      </Popover>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {/* 兩個欄位的短表單,開著的時候內容高度不變 → hug(dialog.spec「高度軸」判準,同建立專案) */}
        <DialogContent height="hug">
          <DialogHeader><DialogTitle>新增{noun}</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-[var(--layout-space-loose)]">
              <Field required invalid={!!form.errors.title}>
                <FieldLabel>{noun}名稱</FieldLabel>
                <Input placeholder="例:設計審查" {...form.getInputProps('title')} />
                <FieldError>{form.errors.title}</FieldError>
              </Field>
              <Field>
                <FieldLabel>日期</FieldLabel>
                <DatePicker {...form.getInputProps('date')} />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button variant="tertiary">取消</Button></DialogClose>
            <Button variant="primary" loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>新增</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
