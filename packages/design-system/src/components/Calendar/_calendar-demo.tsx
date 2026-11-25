// Calendar 三層 story 共用的示範殼(`_` 前綴 = 示範用的私有 helper,不進 index)。
// 月曆的三個點擊目標各給一個真實的結果,取代瀏覽器原生 alert(原生對話框不是 DS 元件):
//   點事件方塊 → 在方塊旁開 Popover,看事件名稱與日期;
//   點日期 / 右上角「新事件」→ Dialog「新增事件」(名稱必填 + 日期),送出成功跳 Toast、事件排進月曆
//  (送出成功的宣告照 form-validation.spec.md「Submit 成功宣告」;對話框表單的接法同 dialog.stories.tsx 建立專案表單)。
// 依據:user 2026-10-21 確認頁 D13「d13照你建議」(建議 = 上面這三個結果)。
// 唯讀的日期格 / 事件方塊(`readOnlyDates` / `readOnlyEvents`)照樣唯讀 —— 殼只替可點的那一半接上結果。
import * as React from 'react'
import { addDays } from 'date-fns'
import { Calendar, type CalendarEvent, type CalendarProps } from './calendar'
import { normalizeEvents, parseEventDate } from './calendar-layout'
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
const dayText = (d: Date) => `${d.getMonth() + 1} 月 ${d.getDate()} 日`
/**
 * 事件日期一行字:單日「7 月 12 日」;跨日「7 月 20 日 – 7 月 22 日」;全天事件加「· 全天」。
 * 畫在哪幾天照元件同一份資料語意(calendar-layout.ts normalizeEvents:end 不含、只有日期 → 全天、未滿 24 小時只算開始那天),
 * 不在示範殼另算一份 —— 2026-11-25 前這裡直接讀 end,改成「end 不含」後全天事件會多寫一天。
 */
const eventWhen = (event: CalendarEvent) => {
  const [entry] = normalizeEvents([event])
  if (!entry) return ''
  const s = dayText(entry.firstDay)
  const e = dayText(entry.lastDay)
  return `${s === e ? s : `${s} – ${e}`}${entry.allDay ? ' · 全天' : ''}`
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
      // 新增的是那一天的全天事件:end 不含 → 寫隔天(calendar.spec.md「資料語意」;寫同一天會被當成零長度、開發期警告)
      const end = isoOf(addDays(parseEventDate(date), 1))
      setEvents((prev) => [...prev, { id: `new-${prev.length + 1}`, title: String(values.title).trim(), start: date, end, color: 'blue' }])
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
    onEventClick: (event: CalendarEvent, { anchor }: { anchor: HTMLElement }) => {
      // 錨點 = Calendar 交出來的 anchor(被點的那一列 / 那一段;滑鼠點與格內導覽的 Enter / Space 都一樣,calendar.spec.md「API」)。
      // 2026-11-25 前從 document.activeElement 反推 —— 焦點所在的元素只是剛好常常是被點的那一段,不是同一件事(M37)。
      // 先改 virtualRef.current 再 setState:浮層開著時點另一個事件,浮層跟到新的那一段(scripts/overlay-cover-anchor-invariant.mjs M 列)。
      anchorRef.current = anchor
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
