// @internal — Calendar 內部的事件詳情浮層(calendar.spec.md「事件詳情浮層」);不從 index 匯出
// (scripts/gen-component-indexes.mjs findFeatureSiblings:檔頭 10 行含 @internal 的 `calendar-*.tsx` 不 re-export)。只給 calendar.tsx 用。
import * as React from 'react'
import type { CategoricalColor } from '@/design-system/tokens/categorical-color'
import { Popover, PopoverAnchor, PopoverBody, PopoverContent, PopoverHeader } from '@/design-system/components/Popover/popover'
import { EDITABLE_TITLE_HEADER_SLOT } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { InlineEdit } from '@/design-system/components/InlineEdit/inline-edit'
import { Field, FieldGroup, FieldLabel } from '@/design-system/components/Field/field'
import { Switch } from '@/design-system/components/Switch/switch'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import type { FieldSize } from '@/design-system/components/Field/field-context'
import { rangeToTimePatch } from './calendar-layout'
import { CALENDAR_EVENT_DETAIL_WIDTH_PX } from './calendar-geometry'

/**
 * ── 消費的 SSOT ──
 * - components: [Popover(PopoverAnchor virtualRef / PopoverContent side="right" + align="start"(子選單擺法,popover.spec.md「禁止事項」用法 (2);
 *   sideOffset / collisionPadding / 碰撞翻面 = Popover 預設,tokens/elevation/overlay-geometry.ts)+ aria-label / PopoverHeader closeAriaLabel + actions / PopoverBody),
 *   InlineEdit(標題 as="h2" size="sm" + 各欄 renderRead / renderEdit / multiline / editable 閘), Field + FieldLabel + FieldGroup(垂直排、閱讀情境),
 *   Switch(全天:可改時直接切換;只能看時 InlineEdit editable={false} 委派 Switch mode="view"), DatePicker.Range(檢視 formatRange、編輯 showTime), Select(類別:display="tag")]
 * - patterns: [overlay-surface `EDITABLE_TITLE_HEADER_SLOT`(標題是 InlineEdit sm 時的標題列 slot 與 × 讓位;overlay-chrome-sizing.spec.md「可編輯標題的標題列」)]
 * - tokens: 無直接讀取 —— 標題列高、欄位間距、body 上下左右內距、垂直排就地編輯外伸,全由上面的元件與 layoutSpace.css(PopoverBody = hug)給,本檔不寫任何間距
 * - 資料: ./calendar-layout.ts(detailRangeOf / rangeToTimePatch / toggleAllDayPatch:時間欄的值、全天 end 不含 ↔ Range 結束日含、全天切換)
 * - spec refs: calendar.spec.md「事件詳情浮層」(定位 / 外殼 / 標題列 / 內文欄位 / 位置 / 層次 / Esc / 點外面)、../Field/field.spec.md「閱讀情境」、
 *   ../InlineEdit/inline-edit.spec.md:52 / :126(同一場景不混放純顯示與就地編輯;不能改的值用 editable={false})、
 *   ../../tokens/layoutSpace/layoutSpace.spec.md 規則 2(標頭 → 第一個元素 tight)/ 規則 4(hug 容器底 = 頂)、
 *   ../../../ds-canonical/references/keyboard-model-canonical.md「Esc 一次只關最內層」、lib/overlay-focus-return.ts returnFocusToOpener
 */

// ── 公開型別(calendar.tsx 轉出;root barrel 只經 calendar.tsx)────────────────────────────────

/** 類別(calendar.spec.md「事件詳情浮層」內文欄位「類別」【COLORFIELD(定)】):產品給的清單,事件以 `categoryId` 指向其中一個 */
export interface CalendarCategory {
  /** 穩定的 id(與名稱分開;事件的 `categoryId` 存它) */
  id: string
  /** 顯示名稱(詳情的類別 Tag 上的字) */
  name: string
  /** 類別色(12 色相或 neutral);選了這個類別,事件的 `color` 一起換成它 */
  color: CategoricalColor
}

/**
 * 詳情交回的修改(`onEventChange(event, patch)` 的第二個參數):只帶這一次改到的欄位。
 * 時間一律是本地牆上時間字串("YYYY-MM-DD" / "YYYY-MM-DDTHH:mm";全天的 end 照舊「不含」);選了類別時 `categoryId` 與 `color` 一起給。
 */
export interface CalendarEventPatch {
  title?: string
  start?: string
  end?: string
  allDay?: boolean
  location?: string
  description?: string
  categoryId?: string
  color?: CategoricalColor
}

/** 事件方塊的第一種選項(calendar.spec.md「日期格與事件方塊:可點或唯讀」):內建詳情浮層 */
export interface CalendarEventDetail<E = unknown> {
  /** 詳情裡改了某一欄 → 交回這一筆與改到的欄位。必填(M23(f):沒有內建 fallback;事件資料是 consumer 的,calendar.spec.md「禁止事項」第 2 條) */
  onEventChange: (event: E, patch: CalendarEventPatch) => void
  /** 這一筆能不能改(預設全部可改);false = 詳情照開、每一欄只能看,空的欄位不列 */
  isEditable?: (event: E) => boolean
  /** 標題列右側操作位(〔操作〕〔分隔線〕〔×〕);刪除這類破壞性動作收進「⋯」選單(action-bar.spec.md:123) */
  actions?: (event: E) => React.ReactNode
  /** 標準欄位下方的額外欄位(放在同一個 FieldGroup 裡,例:與會者、會議連結);用 Field + 就地編輯組成 */
  renderExtra?: (event: E) => React.ReactNode
  /** 類別清單;沒傳 = 不顯示「類別」欄【COLORFIELD(定)】 */
  categories?: readonly CalendarCategory[]
}

/** 詳情的字串(Calendar `labels` 的詳情那幾個鍵,calendar.tsx `CalendarLabels` 繼承這一份;預設繁中,calendar.tsx DEFAULT_LABELS) */
export interface CalendarEventDetailLabels {
  /** 事件詳情浮層右上角 × 的讀屏名稱(calendar.spec.md「A11y 預設」字串可覆寫「清單 / 詳情的關閉」;經 PopoverHeader `closeAriaLabel`) */
  detailClose: string
  /** 詳情標題(就地編輯)的欄位名稱:讀屏念「編輯 {此字}」、編輯中輸入框的名稱(看得見的是標題本身) */
  detailTitle: string
  /** 詳情各欄的標籤(看得見的字,也是該欄的名稱;calendar.spec.md「事件詳情浮層」內文欄位) */
  detailTime: string
  detailAllDay: string
  detailLocation: string
  /** 地點空著時的佔位字(可編輯時) */
  detailLocationPlaceholder: string
  detailDescription: string
  /** 說明空著時的佔位字(可編輯時) */
  detailDescriptionPlaceholder: string
  /** 類別欄的標籤(`eventDetail.categories` 有傳才出現) */
  detailCategory: string
  /** 類別空著時的佔位字(可編輯時) */
  detailCategoryPlaceholder: string
}

// ── 錨點(calendar.spec.md「事件詳情浮層」位置)──────────────────────────────────────────────────

/** 交給 PopoverAnchor virtualRef 的錨點:Radix 只在物件換了才重算位置(popover.tsx PopoverAnchor 上方「換錨點 = 換一個包裝物件」),所以換錨點一律建新的 */
export interface CalendarDetailAnchor {
  getBoundingClientRect: () => DOMRect
  /** Popover 定位找捲動祖先用(虛擬錨點沒有自己的 DOM);lib/overlay-nesting.ts 以它認「這一層從哪一層開出來」(清單那一列 → 點詳情不關清單) */
  readonly contextElement: Element
}

/**
 * 錨點 = 被點的那個元素。`horizontalFrom` 有給(從清單打開)= 左右取清單浮層的外框、上下取那一列 ——
 * 詳情水平貼著清單外緣、垂直對齊那一列的上緣。元素不在了(事件被移走、清單列卸載)→ 回上一次量到的矩形,不回 0×0
 *(0×0 會被 hideWhenDetached 藏起來,浮層連同正在改的欄位一起消失)。
 */
export function createDetailAnchor(element: HTMLElement, horizontalFrom: HTMLElement | null): CalendarDetailAnchor {
  let last = element.getBoundingClientRect()
  return {
    contextElement: element,
    getBoundingClientRect() {
      if (!element.isConnected) return last
      const row = element.getBoundingClientRect()
      const frame = horizontalFrom?.isConnected ? horizontalFrom.getBoundingClientRect() : null
      last = frame ? new DOMRect(frame.left, row.top, frame.width, row.height) : row
      return last
    },
  }
}

// ── 詳情浮層 ─────────────────────────────────────────────────────────────────────────────

/** 一筆事件在詳情裡要用的欄位(Calendar 從當下的 events 依 id 取最新那一筆、正規化後交進來;本檔不存事件) */
export interface CalendarEventDetailEntry<E> {
  event: E & { title: string; location?: string; description?: string; categoryId?: string }
  allDay: boolean
  /** 時間欄的值(calendar-layout.ts detailRangeOf;Calendar 依 start / end 字面 memo,同一筆沒改就是同一個陣列) */
  range: [string, string]
}

interface CalendarEventDetailPopoverProps<E> {
  /** 開著時的那一筆;null = 關著 */
  entry: CalendarEventDetailEntry<E> | null
  anchor: CalendarDetailAnchor | null
  detail: CalendarEventDetail<E>
  labels: CalendarEventDetailLabels
  locale: string
  /**
   * 時間欄的寫法(DatePicker.Range `formatOptions`;平常經 `formatRange` 同一天自動合併,編輯中兩端也用它)—— Calendar 交進來的那一份:
   * 日期段 = DatePicker 的預設日期寫法(兩位數月日)、時間段 = 月格的 `eventTimeFormat`(同一個畫面同一種寫法);全天時只有日期段
   */
  readFormat: { timed: Intl.DateTimeFormatOptions; allDay: Intl.DateTimeFormatOptions }
  onClose: () => void
  onCloseAutoFocus: (event: Event) => void
  /** 這一欄改了:交回當下最新的那一筆 + 改到的欄位 */
  onChange: (patch: CalendarEventPatch) => void
  /** 切換全天(Calendar 從最新的那一筆算 patch 並記住原時間;calendar-layout.ts toggleAllDayPatch) */
  onToggleAllDay: (nextAllDay: boolean) => void
}

export function CalendarEventDetailPopover<E>({
  entry, anchor, detail, labels, locale, readFormat, onClose, onCloseAutoFocus, onChange, onToggleAllDay,
}: CalendarEventDetailPopoverProps<E>) {
  // 錨點每次換成新物件(Radix 才重算位置);ref 的 current 讀當下那一個
  const anchorRef = React.useRef<CalendarDetailAnchor | null>(anchor)
  if (anchor) anchorRef.current = anchor
  const open = entry !== null && anchor !== null
  // 關閉時內容照最後那一筆畫到收起動畫結束(Radix Presence 等動畫才卸載;卸載前仍在編輯的欄位照 InlineEdit 卸載提交)
  const lastEntryRef = React.useRef(entry)
  if (entry) lastEntryRef.current = entry
  const shown = entry ?? lastEntryRef.current
  return (
    <Popover open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <PopoverAnchor virtualRef={anchorRef as React.RefObject<CalendarDetailAnchor>} />
      {shown && (
        <PopoverContent
          data-calendar-event-detail={String((shown.event as { id?: unknown }).id ?? '')}
          // DS 子選單擺法(calendar.spec.md「事件詳情浮層」位置【DT-DIRECTION(定)】→ popover.spec.md「禁止事項」用法 (2)):
          // 開在被點那一項的右側、上緣對齊;格陣與清單同一條,不依它在星期的哪一半換邊。sideOffset / collisionPadding 用 Popover 預設
          //(tokens/elevation/overlay-geometry.ts OVERLAY_SIDE_OFFSET / OVERLAY_COLLISION_PADDING,= DropdownMenuSubContent 的 sideOffset);
          // 右邊放不下由 Popover 的碰撞翻面(avoidCollisions 預設開,與 SelectMenu / DropdownMenu 同一套)翻到左側 —— 本檔不寫自己的方向邏輯
          side="right"
          align="start"
          // 寬:Popover 預設 288 放不下時間欄編輯中的 DatePicker.Range showTime(實量見 calendar-geometry.ts CALENDAR_EVENT_DETAIL_WIDTH_PX)
          width={CALENDAR_EVENT_DETAIL_WIDTH_PX}
          // 浮層的名字 = 事件標題本身(標題是 InlineEdit、沒有 PopoverTitle 可自動接線;consumer aria-label 優先,popover.tsx PopoverContent)——
          // 不念隱形編輯鈕的「編輯 …」,編輯中也不會變空
          aria-label={shown.event.title}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {/* 標題列:標準 PopoverHeader(內建 ×)+ 可編輯標題的 slot(× 佔位 = 一列 sm 欄位高,標題列 52 / 56、兩態同高;標題欄尾端讓出欄位內距,
              點 × 一定是關閉)。標題列右側 = eventDetail.actions(沒有「儲存」鈕、沒有 footer —— 每一欄自己提交) */}
          <PopoverHeader className={EDITABLE_TITLE_HEADER_SLOT} closeAriaLabel={labels.detailClose} actions={detail.actions?.(shown.event)}>
            <DetailTitle entry={shown} editable={isEditableOf(detail, shown)} label={labels.detailTitle} onChange={onChange} />
          </PopoverHeader>
          {/* 內文:PopoverBody 預設(左右 loose、上 tight、hug → 底 = 頂;layoutSpace.spec.md 規則 2 / 規則 4),不加任何內距 class */}
          <PopoverBody>
            <DetailFields entry={shown} detail={detail} labels={labels} locale={locale} readFormat={readFormat} onChange={onChange} onToggleAllDay={onToggleAllDay} />
          </PopoverBody>
        </PopoverContent>
      )}
    </Popover>
  )
}

const isEditableOf = <E,>(detail: CalendarEventDetail<E>, entry: CalendarEventDetailEntry<E>) => detail.isEditable?.(entry.event) ?? true

/** 標題:InlineEdit(預設 Input)放在標題位置、不包成 Field;清空後提交 = 還原原值(不交回空標題) */
function DetailTitle<E>({ entry, editable, label, onChange }: { entry: CalendarEventDetailEntry<E>; editable: boolean; label: string; onChange: (patch: CalendarEventPatch) => void }) {
  return (
    <InlineEdit
      as="h2"
      size="sm"
      readClassName="font-medium"
      label={label}
      value={entry.event.title}
      editable={editable}
      onCommit={(next) => { if (next.trim() !== '') onChange({ title: next }) }}
    />
  )
}

/**
 * 內文欄位(calendar.spec.md「事件詳情浮層」內文欄位):**垂直排**(標籤在上;Field 預設方向)【FIELD-ORIENT(定)】,包在一個 FieldGroup 裡 ——
 * 組裡有就地編輯 = 閱讀情境(../Field/field.spec.md「閱讀情境」:標籤次要色、垂直外伸、同組同高,自動生效,本檔不另寫)。
 * 每一欄都是 Field;可改的值走 InlineEdit、不能改的值 InlineEdit editable={false}(不混放純顯示,inline-edit.spec.md:52 / :126);
 * 「全天」是自己一個 Field、Switch 直接切換【Q5(定)】。只能看時空欄位不列【AI 推導】。
 */
function DetailFields<E>({ entry, detail, labels, locale, readFormat, onChange, onToggleAllDay }: Omit<CalendarEventDetailPopoverProps<E>, 'anchor' | 'onClose' | 'onCloseAutoFocus'> & { entry: CalendarEventDetailEntry<E> }) {
  const editable = isEditableOf(detail, entry)
  const { event, allDay, range } = entry
  const showTime = !allDay
  const categories = detail.categories
  const category = categories?.find((c) => c.id === event.categoryId)
  const categoryOptions = React.useMemo(
    () => (categories ?? []).map((c) => ({ value: c.id, label: c.name, tagVariant: c.color })),
    [categories],
  )
  return (
    <FieldGroup>
      <Field data-calendar-detail-field="time">
        <FieldLabel>{labels.detailTime}</FieldLabel>
        <InlineEdit<[string, string]>
          value={range}
          label={labels.detailTime}
          editable={editable}
          // 全天:Range 的結束日「含」→ 事件 end「不含」,加一個日曆日(calendar-layout.ts rangeToTimePatch;本檔不另算)
          onCommit={(next) => onChange(rangeToTimePatch(next, allDay))}
          // 平常:一段文字,同一天自動合併(DatePicker.Range `formatRange`【TIMEFIELD(定)】);寫法 = Calendar 交進來的 readFormat
          renderRead={(value) => (
            <DatePicker.Range mode="view" value={value} showTime={showTime} formatRange locale={locale} formatOptions={showTime ? readFormat.timed : readFormat.allDay} />
          )}
          // 編輯:一個 DatePicker.Range,有時段時加 showTime(date-picker.spec.md:69)。兩端都選好才提交(Range 自己的 onChange 在完成時才呼叫)
          // 兩端的字與平常同一份寫法(readFormat;日期兩位數月日、時間同月格)—— 看和改不會是兩種寫法(DATE-TIME(定)2026-11-26)
          renderEdit={(p) => (
            <DatePicker.Range
              size={p.size}
              value={p.value}
              showTime={showTime}
              locale={locale}
              formatOptions={showTime ? readFormat.timed : readFormat.allDay}
              aria-label={labels.detailTime}
              onChange={(next) => {
                if (!next[0] || !next[1]) return
                p.onChange([next[0], next[1]])
                p.commit()
              }}
            />
          )}
        />
      </Field>
      <Field data-calendar-detail-field="allDay">
        <FieldLabel>{labels.detailAllDay}</FieldLabel>
        {/* 可改:直接切換(就地編輯沒有給布林值的編輯態;同 DataTable 布林欄 data-table.spec.md「Inline Edit — per-column opt-in」boolean 列)。
            只能看:同組其他欄一樣是 InlineEdit editable={false}(同一場景不混放純顯示與就地編輯,inline-edit.spec.md:52 / :126),
            值的格式化委派 Switch mode="view"(勾 / 叉,switch.spec.md:156;inline-edit.spec.md「值-格式化」委派路徑) */}
        {editable ? (
          <Switch checked={allDay} onCheckedChange={onToggleAllDay} />
        ) : (
          <InlineEdit<boolean> value={allDay} label={labels.detailAllDay} editable={false} onCommit={onToggleAllDay} renderRead={(value) => <Switch mode="view" checked={value} />} />
        )}
      </Field>
      {(editable || !!event.location) && (
        <Field data-calendar-detail-field="location">
          <FieldLabel>{labels.detailLocation}</FieldLabel>
          <InlineEdit value={event.location ?? ''} label={labels.detailLocation} placeholder={labels.detailLocationPlaceholder} editable={editable} onCommit={(next) => onChange({ location: next })} />
        </Field>
      )}
      {(editable || !!event.description) && (
        <Field data-calendar-detail-field="description">
          <FieldLabel>{labels.detailDescription}</FieldLabel>
          <InlineEdit multiline value={event.description ?? ''} label={labels.detailDescription} placeholder={labels.detailDescriptionPlaceholder} editable={editable} onCommit={(next) => onChange({ description: next })} />
        </Field>
      )}
      {categories && (editable || !!category) && (
        <Field data-calendar-detail-field="category">
          <FieldLabel>{labels.detailCategory}</FieldLabel>
          <InlineEdit<string>
            value={category?.id ?? ''}
            label={labels.detailCategory}
            placeholder={labels.detailCategoryPlaceholder}
            editable={editable}
            // 選了類別 → categoryId 與 color 一起交回(月格畫的是 event.color,兩者同一下換;AI 推導)
            onCommit={(id) => {
              const next = categories.find((c) => c.id === id)
              if (next) onChange({ categoryId: next.id, color: next.color })
            }}
            // 有值:類別 Tag(Select 的檢視,inline-edit.tsx「格式化 read 鐵律」);沒值:InlineEdit 自己的佔位字
            renderRead={category ? (value) => <SelectView value={value} options={categoryOptions} /> : undefined}
            renderEdit={(p) => (
              <SelectEdit size={p.size} value={p.value} options={categoryOptions} label={labels.detailCategory}
                onChange={(next) => { p.onChange(next); p.commit() }} />
            )}
          />
        </Field>
      )}
      {detail.renderExtra?.(event)}
    </FieldGroup>
  )
}

function SelectView({ value, options }: { value: string; options: SelectOption[] }) {
  return <Select mode="view" display="tag" value={value} options={options} />
}

function SelectEdit({ size, value, options, label, onChange }: { size: FieldSize; value: string; options: SelectOption[]; label: string; onChange: (next: string) => void }) {
  return <Select autoFocus defaultOpen display="tag" size={size} value={value} options={options} aria-label={label} onChange={(next) => onChange(next as string)} />
}
