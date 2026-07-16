// ── 消費的 SSOT ──
// - components/Field/field-controls.spec.md(「軸二 就地編輯 host」段:InlineEdit = view↔edit 二態疊在 Field 之上;edit-in-place + editable 閘)
// - components/Field/field-edit-keys.ts(makeEditSettleKeyHandler = Enter/Esc + 中文 IME guard 結算 SSOT,與 DataTable cell 同源)
// - components/Field/field-wrapper.tsx(fieldViewGeometry = view 幾何 class SSOT〔純值/標題路徑〕;fieldDisplayTextClass = view 字級)
// - components/Input/input.tsx / Textarea/textarea.tsx(預設 renderEdit;不重刻 input chrome)
// - components/Field/field-context.ts(useFieldContext / useResolvedFieldSize;接 size/orientation/labelId cascade)
// - tokens/uiSize/uiSize.css(--field-px 水平內距 SSOT / --field-height-{sm,md,lg} view 態高度)
// - tokens/color/color.spec.md(bg-neutral-hover = hover 回饋)
// - 世界級對照(泛型 readView/editView 就地編輯 + read 態底色 tint + 隱形 Pressable):
//   Atlassian inline-edit(readView/editView 兩 render prop + read wrapper 靠負邊距對齊 edit)
//     https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx
//   就地編輯無 disabled 態(鎖定 = 純 view 無入口、不灰化):MUI X isCellEditable / cellMode
//     https://mui.com/x/react-data-grid/editing/ + AG Grid editable https://www.ag-grid.com/react-data-grid/cell-editing/
//
// ── Model A(2026-07-16 round16,user GO)──────────────────────────────────────
// InlineEdit **不自帶 geometry cva**(消 M17 重複):
//   - 值-格式化(Select→Tag / Date / avatar)→ renderRead 委派 `<Control mode="view">`,幾何 + 內部間距
//     皆由控件 view×default 提供(read=edit 同一顆 → 天生一致、多 tag/avatar 間距零偏移)。
//   - 純值 / 標題 `<Tag as="h1">` → 套 `fieldViewGeometry(size, multiline)` helper(= view×default 幾何 SSOT)。
//   InlineEdit 本體只給:`-mx`(orientation-aware,拉到欄左緣,= 上方 read-view 負邊距對照)+ hover bg + focus 藍框 + 隱形 Pressable。
//   read↔edit 零跳 = view 與 edit 同一顆控件、只差 chrome。
// **格式化 read 鐵律**:renderRead 要顯示 Tag/日期/label,**渲染對應控件的 `mode="view"`**
//   (如 `<Select mode="view" display="tag">`),不可自刻 —— 格式化 SSOT 住在該控件的 view mode。
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/design-system/components/Input/input'
import { Textarea } from '@/design-system/components/Textarea/textarea'
import type { FieldSize } from '@/design-system/components/Field/field-context'
import { useFieldContext, useResolvedFieldSize } from '@/design-system/components/Field/field-context'
import { fieldDisplayTextClass, fieldViewGeometry } from '@/design-system/components/Field/field-wrapper'
import { makeEditSettleKeyHandler } from '@/design-system/components/Field/field-edit-keys'

// ── Types ───────────────────────────────────────────────────────────────────

/** renderEdit 回呼收到的受控介面 —— consumer 換任意 Field 控件(Textarea / Select / DatePicker …)接線用 */
export interface InlineEditRenderProps<T = string> {
  /** 目前編輯中的草稿值(內部管理,非已 commit 的 value) */
  value: T
  /** 草稿變更 */
  onChange: (next: T) => void
  /** 提交草稿 → onCommit(next) + 回 view 態 */
  commit: () => void
  /** 放棄草稿 → 回 view 態不 commit */
  cancel: () => void
  /** 進 edit 態時自動 focus 控件 */
  autoFocus: boolean
  /** 尺寸(cascade 給控件,與 view 態高度對齊) */
  size: FieldSize
  /** 控件無障礙標籤(= label prop) */
  'aria-label'?: string
}

type ReadTag = 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

export interface InlineEditProps<T = string> {
  /** 已提交的欄位值(view 態顯示;edit 進入時作草稿初值)。泛型:string / number / string[] / PersonValue 等 */
  value: T
  /** 提交回呼 —— blur / Enter 且草稿有變更時觸發 */
  onCommit: (next: T) => void
  /**
   * 自訂 edit 態控件(換 Textarea / Select / DatePicker 等 Field 控件,必用 `mode="edit"`)。
   * 不傳則預設:multiline → `<Textarea mode="edit">`,否則 `<Input mode="edit">`(僅 T=string 時預設有效;非 string 值必傳此 prop)。
   */
  renderEdit?: (props: InlineEditRenderProps<T>) => React.ReactNode
  /**
   * 自訂 view 態格式化顯示。不傳則顯示 `String(value)`(空值顯 placeholder)。
   * **SSOT 鐵律**:要顯示 Tag / 日期格式 / option label 等,**渲染對應控件的 `mode="view"`**
   * (如 `renderRead={(v) => <Select mode="view" display="tag" value={v} options={opts} />}`),
   * 不可自刻 —— 格式化 + 內部間距 SSOT 住在該控件的 view mode(見檔頭 Model A)。
   */
  renderRead?: (value: T) => React.ReactNode
  /** 多行欄位(Jira description 類):view 態換行 + 預設 edit 態用 `<Textarea>`,Enter=換行、Cmd/Ctrl+Enter 或 blur 提交 */
  multiline?: boolean
  /**
   * 是否可編輯(預設 true)。false → view 態無 hover 入口、無藍框、不可點進 edit(對齊世界級就地編輯
   * **無 disabled 態**,鎖定 = 純 view 無入口、**不灰化**;cite 見檔頭 MUI X / AG Grid URL)。
   * 永久唯讀資料 → 用 `<Control mode="view">` 或此 prop false;不用 disabled。
   */
  editable?: boolean
  /** 欄位人類可讀名稱 —— 組 view 按鈕 aria-label(「編輯 {label}」)+ 控件 aria-label */
  label?: string
  /** 空值時 view 態顯示的提示文字(fg-muted) */
  placeholder?: string
  /** 尺寸 —— view 態最小高度 + 預設 Input 尺寸(不傳則接 fieldCtx.size,standalone fallback sm) */
  size?: FieldSize
  /** view 態語意標籤(標題場景傳 'h1'/'h2' 維持文件大綱;預設 'span') */
  as?: ReadTag
  /** view 態文字樣式(如標題 `text-h4 font-bold`) */
  readClassName?: string
  /** 外層容器 className */
  className?: string
}

/**
 * InlineEdit — 就地編輯 primitive(view ↔ edit 二態,泛型 <T>)
 *
 * 互動模型 world-class 對照見檔頭「消費的 SSOT」+ inline-edit.spec.md benchmark 表:
 * - **view 態** = 純文字 / 格式化 renderRead、寬度 fill 容器、透明邊框(預留)→ 視覺 = 純內容
 * - **hover(view,editable)** = 灰色底色 `bg-neutral-hover` + `rounded-md`(**非邊框**)+ cursor
 * - **鍵盤 focus(view,editable)** = 外框染 `border-primary` 藍框(Field focus 語言,非 Button ring)
 * - **click / Enter/Space** = 切 edit 態 = 真正的 Field 控件(mode="edit":border + focus + input);多行走 Textarea
 * - **退出**:blur(滑鼠)→ commit + 純 view 不搶焦;Enter(鍵盤)→ commit + 焦點回 view 按鈕 + 藍框;Esc → cancel 還原
 * - **鍵盤結算**:消費 `makeEditSettleKeyHandler`(含中文 IME guard,與 DataTable cell 同源)
 * - **editable=false**:view 無 hover / 無 Pressable / 不可進 edit、**不灰化**(detail-pane 鎖定語意)
 *
 * view 態用隱形 Pressable(絕對定位 `<button>` 疊於內容上)—— 讓 `as="h1"` 等標題標籤保留文件大綱
 * a11y,同時提供鍵盤 focus + Enter 進 edit(HTML 內容模型不允許 heading 巢狀於 button,故分離)。
 */
function InlineEditImpl<T = string>(
  {
    value,
    onCommit,
    renderEdit,
    renderRead,
    multiline = false,
    editable = true,
    label,
    placeholder,
    size: sizeProp,
    as = 'span',
    readClassName,
    className,
  }: InlineEditProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  // size:接 fieldCtx.size cascade,standalone fallback sm(InlineEdit 靜態 fieldPreferredSize='sm'
  //   讓外層 `<Field>` 自動收 sm — 見檔尾 static)。
  const size = useResolvedFieldSize(sizeProp, 'sm')
  // orientation:vertical(值貼 label 左緣 → 用 -mx)/ horizontal(值落內容欄左緣+field-px = 對齊 sibling 控件 → 不用 -mx)。
  const fieldCtx = useFieldContext()
  const orientation = fieldCtx?.orientation ?? 'vertical'

  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<T>(value)
  // draft 最新值 ref —— commit 從事件 handler 呼叫時避免 stale closure
  const draftRef = React.useRef(draft)
  // 單次結算 guard —— Enter/Esc 已結算後,unmount 觸發的 onBlur 不再重複 commit
  const finalizedRef = React.useRef(false)
  // 鍵盤結算後把 focus 送回 view 按鈕(a11y:焦點不遺失);滑鼠 blur 不送回(不搶焦)
  const returnFocusRef = React.useRef(false)
  const readButtonRef = React.useRef<HTMLButtonElement>(null)

  const setDraftValue = React.useCallback((next: T) => {
    draftRef.current = next
    setDraft(next)
  }, [])

  const enterEdit = React.useCallback(() => {
    finalizedRef.current = false
    setDraftValue(value)
    setEditing(true)
  }, [value, setDraftValue])

  // commit(returnFocus):鍵盤結算傳 true(焦點回 view 按鈕);滑鼠 blur 傳 false(不搶焦、純 view)
  const commit = React.useCallback(
    (returnFocus: boolean) => {
      if (finalizedRef.current) return
      finalizedRef.current = true
      returnFocusRef.current = returnFocus
      setEditing(false)
      if (draftRef.current !== value) onCommit(draftRef.current)
    },
    [value, onCommit],
  )

  const cancel = React.useCallback(() => {
    if (finalizedRef.current) return
    finalizedRef.current = true
    returnFocusRef.current = true // Esc = 鍵盤路徑,焦點回 view 按鈕
    setEditing(false)
  }, [])

  // 鍵盤結算後把 focus 送回 view 按鈕(commit(true)/cancel);滑鼠 blur(commit(false))不送回,
  //   對齊 spec「鍵盤結算焦點回 view 按鈕、滑鼠 blur 純 view 不搶焦」。focus-visible 保證只有鍵盤顯藍框。
  React.useEffect(() => {
    if (!editing && returnFocusRef.current) {
      returnFocusRef.current = false
      readButtonRef.current?.focus()
    }
  }, [editing])

  const isEmpty =
    value == null || (value as unknown) === '' || (Array.isArray(value) && value.length === 0)
  const Tag = as as React.ElementType

  // 對齊盒(orientation-aware,Model A round16):
  //   vertical  → `-mx-field-px` + `w-calc` 把整塊拉到欄左緣(值貼 label,= 檔頭 read-view 負邊距對照;委派控件 view 的 px 被 -mx 抵消 → 落欄左緣)
  //   horizontal→ 不用 -mx(值落內容欄左緣+field-px = 對齊 sibling 控件,hover 不吃 gap);純 `w-full`
  const alignBleed =
    orientation === 'vertical'
      ? '-mx-[var(--field-px)] w-[calc(100%_+_2_*_var(--field-px))]'
      : 'w-full'

  if (editing) {
    const editProps: InlineEditRenderProps<T> = {
      value: draft,
      onChange: setDraftValue,
      commit: () => commit(true),
      cancel,
      autoFocus: true,
      size,
      'aria-label': label,
    }
    // 預設 edit 控件:multiline → Textarea(Enter=換行、Cmd/Ctrl+Enter/blur 提交);否則 Input。
    // 兩者皆 mode="edit"(edit 態 = 真正的 edit-mode Field 控件),Enter/Esc 結算走 makeEditSettleKeyHandler(含 IME guard)。
    // string-only 預設路徑;非 string 值必傳 renderEdit。
    const defaultEditNode = multiline ? (
      <Textarea
        autoFocus
        mode="edit"
        value={draft as unknown as string}
        size={size}
        aria-label={label}
        onChange={(e) => setDraftValue(e.target.value as unknown as T)}
        onBlur={() => commit(false)}
        // 多行:plain Enter=換行、Esc=cancel、Cmd/Ctrl+Enter=commit —— 全走 makeEditSettleKeyHandler SSOT。
        onKeyDown={makeEditSettleKeyHandler({ onCommit: () => commit(true), onCancel: cancel, commitOnEnter: false })}
      />
    ) : (
      <Input
        autoFocus
        mode="edit"
        value={draft as unknown as string}
        size={size}
        aria-label={label}
        onChange={(e) => setDraftValue(e.target.value as unknown as T)}
        onBlur={() => commit(false)}
        onKeyDown={makeEditSettleKeyHandler({ onCommit: () => commit(true), onCancel: cancel })}
      />
    )
    const editNode = renderEdit ? renderEdit(editProps) : defaultEditNode
    return (
      <div ref={ref} data-editing className={cn(alignBleed, className)}>
        {editNode}
      </div>
    )
  }

  // view 態:外框只承載對齊盒 + (editable 時) hover bg + 鍵盤 focus 藍框;幾何由內容(委派控件 view / fieldViewGeometry)提供。
  const viewNode = renderRead ? (
    // 格式化 view(consumer 傳 <Control mode="view"> 等)。控件 view×default 自帶 px/py/min-h + 內部間距。
    <div className="flex w-full min-w-0">{renderRead(value)}</div>
  ) : (
    <Tag
      data-empty={isEmpty}
      className={cn(
        // 純值/標題共用 view 幾何 SSOT(px-field-px + min-h-field + 單行 items-center / 多行 items-start py-2)
        fieldViewGeometry(size, multiline),
        // view 態 typography 預設消費 Field view SSOT(sm/md→text-body,lg→text-body-lg)——
        // plain 用法 view 字級 = edit <Input>(text-body)= <Input mode="view"> 字級,三者一致零跳字。
        fieldDisplayTextClass(size),
        // 多行:保留換行(pre-wrap)+ 長字斷行 —— view 忠實呈現 Textarea 內容(Jira description 類)。
        multiline && 'whitespace-pre-wrap break-words',
        readClassName,
        isEmpty && 'text-fg-muted',
      )}
    >
      {isEmpty ? placeholder : String(value)}
    </Tag>
  )

  return (
    <div
      ref={ref}
      data-editing={false}
      data-editable={editable || undefined}
      className={cn(
        'relative flex rounded-md border border-transparent transition-colors duration-150',
        alignBleed,
        // editable 才有 hover 底色 + 鍵盤 focus 藍框(Field focus 語言,非 Button ring);
        //   editable=false = 純 view 鎖定,無入口、無藍框、不灰化。
        editable && 'hover:bg-neutral-hover [&:has(button:focus-visible)]:border-primary',
        className,
      )}
    >
      {viewNode}
      {/* 隱形 Pressable(僅 editable):提供 click + 鍵盤 Tab focus + Enter/Space 進 edit;透明疊於內容上。
          hover 底色 + focus 藍框由外層 div 承載(Field focus 語言),故本 button 只需 outline-none 消瀏覽器預設外框。 */}
      {editable && (
        <button
          ref={readButtonRef}
          type="button"
          aria-label={label ? `編輯 ${label}` : '編輯'}
          onClick={enterEdit}
          className="absolute inset-0 cursor-text rounded-md focus-visible:outline-none"
        />
      )}
    </div>
  )
}

// 泛型 forwardRef:forwardRef 不原生支援泛型,以 cast 還原公開型別(標準 workaround)。
const InlineEdit = React.forwardRef(InlineEditImpl) as (<T = string>(
  props: InlineEditProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactElement) & { displayName?: string; fieldPreferredSize?: FieldSize }
InlineEdit.displayName = 'InlineEdit'
// 靜態偏好尺寸:外層 `<Field>` render 時讀 `child.type.fieldPreferredSize` → Field.size 未顯式指定時收 sm
//   (對齊 detectControlLayout 讀 fieldLayout 的機制;InlineEdit view 態無邊框,md 過大會讓版面鬆散)。
InlineEdit.fieldPreferredSize = 'sm'

export { InlineEdit }
