// Calendar 三層 story 共用的示範殼(`_` 前綴 = 示範用的私有 helper,不進 index)。
// 月曆的三個點擊目標各給一個真實的結果,取代瀏覽器原生 alert(原生對話框不是 DS 元件):
//   點事件方塊 → 內建詳情浮層(`eventDetail`):各欄就地改、改了寫回事件、標題列「⋯」收「刪除」(action-bar.spec.md:123 破壞性動作收進溢出選單);
//   點日期 / 右上角「新事件」→ Dialog「新增事件」(名稱必填 + 日期),送出成功跳 Toast、事件排進月曆
//  (送出成功的宣告照 form-validation.spec.md「Submit 成功宣告」;對話框表單的接法同 dialog.stories.tsx 建立專案表單)。
// 依據:user 2026-10-21 確認頁 D13「d13照你建議」(點事件看名稱與日期、點日期 / 新事件開表單);點事件的內容由 calendar.spec.md【C7、Q5(定)】擴成詳情。
// `productDetail` = 產品自己開詳情(`onEventClick` + 自己的 Popover;展示頁「產品自己的詳情」那一則用)。
// 唯讀的日期格 / 事件方塊(`readOnlyDates` / `readOnlyEvents`)照樣唯讀 —— 殼只替可點的那一半接上結果。
import * as React from 'react'
import { addDays } from 'date-fns'
import { MoreVertical, Trash2 } from 'lucide-react'
import { Calendar, type CalendarCategory, type CalendarEvent, type CalendarProps } from './calendar'
import { normalizeEvents, parseEventDate } from './calendar-layout'
import { Popover, PopoverAnchor, PopoverContent, PopoverHeader, PopoverTitle, PopoverBody } from '@/design-system/components/Popover/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/design-system/components/Dialog/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/design-system/components/DropdownMenu/dropdown-menu'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel, FieldError, useFormValidation } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { Toaster, toast } from '@/design-system/components/Toast/toast'
import { returnFocusToOpener } from '@/design-system/lib/overlay-focus-return'

type CalendarDemoProps = Omit<CalendarProps, 'onDateClick' | 'onEventClick' | 'eventDetail' | 'onCreateEvent' | 'readOnlyDates' | 'readOnlyEvents'> & {
  readOnlyDates?: boolean
  readOnlyEvents?: boolean
  /** 新增的是什麼(對話框標題「新增{noun}」、欄位「{noun}名稱」、送出後「{noun}已新增」);預設「事件」 */
  noun?: string
  /** 詳情的類別清單(`eventDetail.categories`;沒傳 = 詳情沒有「類別」欄) */
  categories?: readonly CalendarCategory[]
  /** 這一筆能不能改(`eventDetail.isEditable`;預設全部可改) */
  isEditable?: (event: CalendarEvent) => boolean
  /** 詳情的額外欄位(`eventDetail.renderExtra`) */
  renderExtra?: (event: CalendarEvent) => React.ReactNode
  /** 標題列「⋯」前面再放的操作(例:「開完整編輯」;`eventDetail.actions` 的一部分);第二個參數把修改寫回這一筆(產品自己的操作,例「延後一週」) */
  extraActions?: (event: CalendarEvent, update: (patch: Partial<CalendarEvent>) => void) => React.ReactNode
  /** 詳情交回修改時另外通知(寫回事件之後;test-only 夾具記錄呼叫次數與內容用) */
  onEventChange?: (event: CalendarEvent, patch: Partial<CalendarEvent>) => void
  /** 產品自己開詳情(onEventClick + 自己的 Popover),不用內建詳情 */
  productDetail?: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayText = (d: Date) => `${d.getMonth() + 1} 月 ${d.getDate()} 日`
/**
 * 產品自己的詳情裡那一行日期:單日「7 月 12 日」;跨日「7 月 20 日 – 7 月 22 日」;全天事件加「· 全天」。
 * 畫在哪幾天照元件同一份資料語意(calendar-layout.ts normalizeEvents:end 不含、只有日期 → 全天、未滿 24 小時只算開始那天)。
 */
const eventWhen = (event: CalendarEvent) => {
  const [entry] = normalizeEvents([event])
  if (!entry) return ''
  const s = dayText(entry.firstDay)
  const e = dayText(entry.lastDay)
  return `${s === e ? s : `${s} – ${e}`}${entry.allDay ? ' · 全天' : ''}`
}

/** 月曆 + 三個點擊目標的結果 + 這一則 story 自己的 Toaster(toast.spec.md「app-level-one」允許 Storybook 每個 story root 一個) */
export function CalendarDemo({
  events: initialEvents = [], readOnlyDates, readOnlyEvents, noun = '事件', today, categories, isEditable, renderExtra, extraActions, onEventChange, productDetail = false, ...rest
}: CalendarDemoProps) {
  const [events, setEvents] = React.useState<CalendarEvent[]>(initialEvents)
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
  const updateEvent = (target: CalendarEvent, patch: Partial<CalendarEvent>) =>
    setEvents((prev) => prev.map((e) => (e.id === target.id ? { ...e, ...patch } : e)))
  const removeEvent = (target: CalendarEvent) => {
    setEvents((prev) => prev.filter((e) => e.id !== target.id))
    toast({ variant: 'success', title: `${noun}已刪除`, action: { label: '復原', onClick: () => setEvents((prev) => [...prev, target]) } })
  }
  // 產品自己的詳情(productDetail):錨點 = Calendar 交出來的 anchor;先改 virtualRef.current 再 setState(開著時點另一個事件,浮層跟到新的那一段)
  const [openEvent, setOpenEvent] = React.useState<CalendarEvent | null>(null)
  const anchorRef = React.useRef<HTMLElement | null>(null)
  const dateProps = readOnlyDates ? { readOnlyDates: true as const } : { onDateClick: openCreate }
  const eventProps = readOnlyEvents
    ? { readOnlyEvents: true as const }
    : productDetail
      ? { onEventClick: (event: CalendarEvent, { anchor }: { anchor: HTMLElement }) => { anchorRef.current = anchor; setOpenEvent(event) } }
      : {
          eventDetail: {
            // 改了哪一欄就寫回哪一欄(事件資料由產品持有;calendar.spec.md「禁止事項」第 2 條)
            onEventChange: (event: CalendarEvent, patch: Partial<CalendarEvent>) => {
              updateEvent(event, patch)
              onEventChange?.(event, patch)
            },
            isEditable,
            renderExtra,
            categories,
            // 標題列操作位:「⋯」收「刪除」(破壞性動作預設收進溢出選單,action-bar.spec.md:123;溢出圖示 MoreVertical,ui-development.md Icon canonical)
            // 只能看的那一筆(isEditable 回 false)不給「刪除」:能不能刪跟能不能改是同一個權限判斷,由產品決定(calendar.spec.md「API(第一段)」eventDetail 那條「誰決定」)【AI 推導】
            actions: (event: CalendarEvent) => (
              <>
              {extraActions?.(event, (patch) => updateEvent(event, patch))}
              {isEditable?.(event) !== false && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="text" iconOnly size="sm" startIcon={MoreVertical} aria-label="更多操作" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem startIcon={Trash2} className="text-error" onSelect={() => removeEvent(event)}>刪除</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              )}
              </>
            ),
          },
        }
  return (
    <>
      <Toaster />
      <Calendar {...rest} today={today} events={events} {...dateProps} {...eventProps} onCreateEvent={() => openCreate(today ?? new Date())} />
      {productDetail && (
        <Popover open={openEvent != null} onOpenChange={(next) => { if (!next) setOpenEvent(null) }}>
          <PopoverAnchor virtualRef={anchorRef as React.RefObject<HTMLElement>} />
          {/* 只有錨點、沒有觸發鈕:收起時焦點還給事件方塊(點外面收起不搶;同 date-picker.tsx DatePickerRange 的接法)。
              開的方向與內建詳情同一種擺法(calendar.spec.md「事件詳情浮層」位置 → popover.spec.md「禁止事項」用法 (2) 子選單擺法):
              右側、上緣對齊,右邊放不下由 Popover 碰撞翻左;隔多少用 Popover 預設(產品自己的浮層也可以另選,這裡照 DS 的擺法) */}
          <PopoverContent side="right" align="start" onCloseAutoFocus={(e) => returnFocusToOpener(e, anchorRef.current, { noTrigger: true })}>
            <PopoverHeader><PopoverTitle>{openEvent?.title}</PopoverTitle></PopoverHeader>
            <PopoverBody>{openEvent ? eventWhen(openEvent) : null}</PopoverBody>
          </PopoverContent>
        </Popover>
      )}
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
