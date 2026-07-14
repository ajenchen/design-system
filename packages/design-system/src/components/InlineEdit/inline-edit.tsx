// ── 消費的 SSOT ──
// - components/Field/field-controls.spec.md(「Field 框架地圖」段:InlineEdit = read↔edit 疊在 Field 之上;edit-in-place)
// - components/Field/field-edit-keys.ts(makeEditSettleKeyHandler = Enter/Esc + 中文 IME guard 結算 SSOT,與 DataTable cell 同源)
// - components/Input/input.tsx / Textarea/textarea.tsx(預設 renderEdit;不重刻 input chrome)
// - components/Field/field-context.ts(FieldSize 型別)
// - tokens/uiSize/uiSize.css(--field-px 水平內距 SSOT / --field-height-{sm,md,lg} read 態高度)
// - tokens/color/color.spec.md(bg-neutral-hover = hover 回饋)
// - components/Field/field-wrapper.tsx(read focus = border-primary,消費 Field edit focus 藍框語言;非 Button ring)
// - 世界級對照(泛型 readView/editView 就地編輯 + read 態底色 tint + 隱形 Pressable):
//   Atlassian inline-edit(readView/editView 兩 render prop + 泛型 <FieldValue>)
//     https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/types.tsx
//   read-view hover = 背景 tint 非邊框 + 隱形 Pressable 供鍵盤 focus+Enter:
//     https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx
//
// ── 型別化 read / 多行(2026-07-09 L2,edit-in-place SSOT 研究落地)──
// InlineEdit 現為泛型 <T>(非只 string)。**格式化 read view 的 SSOT 鐵律**:renderRead 要顯示
// Tag / 日期 / label 等格式化值時,**渲染對應 Field 控件的 `mode="display"`**(如 `<Select mode="display"
// display="tag">`),**不可自刻 Tag / 格式化**——「select 值 → Tag」的 SSOT 住在 Select 的 display mode
// (= DataTable cell 消費的同一份)。這保證 read 與 edit 用同一個控件、格式零分歧。多行(multiline)
// 供 Jira description 類欄位。
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/design-system/components/Input/input'
import { Textarea } from '@/design-system/components/Textarea/textarea'
import type { FieldSize } from '@/design-system/components/Field/field-context'
import { cva } from 'class-variance-authority'
import { fieldDisplayTextClass } from '@/design-system/components/Field/field-wrapper'
import { makeEditSettleKeyHandler } from '@/design-system/components/Field/field-edit-keys'

// ── Types ───────────────────────────────────────────────────────────────────

/** renderEdit 回呼收到的受控介面 —— consumer 換任意 Field 控件(Textarea / Select / DatePicker …)接線用 */
export interface InlineEditRenderProps<T = string> {
  /** 目前編輯中的草稿值(內部管理,非已 commit 的 value) */
  value: T
  /** 草稿變更 */
  onChange: (next: T) => void
  /** 提交草稿 → onCommit(next) + 回 read 態 */
  commit: () => void
  /** 放棄草稿 → 回 read 態不 commit */
  cancel: () => void
  /** 進 edit 態時自動 focus 控件 */
  autoFocus: boolean
  /** 尺寸(cascade 給控件,與 read 態高度對齊) */
  size: FieldSize
  /** 控件無障礙標籤(= label prop) */
  'aria-label'?: string
}

type ReadTag = 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

export interface InlineEditProps<T = string> {
  /** 已提交的欄位值(read 態顯示;edit 進入時作草稿初值)。泛型:string / number / string[] / PersonValue 等 */
  value: T
  /** 提交回呼 —— blur / Enter 且草稿有變更時觸發 */
  onCommit: (next: T) => void
  /**
   * 自訂 edit 態控件(換 Textarea / Select / DatePicker 等 Field 控件)。
   * 不傳則預設:multiline → `<Textarea>`,否則 `<Input>`(僅 T=string 時預設有效;非 string 值必傳此 prop)。
   */
  renderEdit?: (props: InlineEditRenderProps<T>) => React.ReactNode
  /**
   * 自訂 read 態格式化顯示。不傳則顯示 `String(value)`(空值顯 placeholder)。
   * **SSOT 鐵律**:要顯示 Tag / 日期格式 / option label 等,**渲染對應控件的 `mode="display"`**
   * (如 `renderRead={(v) => <Select mode="display" display="tag" value={v} options={opts} />}`),
   * 不可自刻 —— 格式化 SSOT 住在該控件的 display mode(見檔頭)。
   */
  renderRead?: (value: T) => React.ReactNode
  /** 多行欄位(Jira description 類):read 態換行 + 預設 edit 態用 `<Textarea>`,Enter=換行、Cmd/Ctrl+Enter 或 blur 提交 */
  multiline?: boolean
  /** 欄位人類可讀名稱 —— 組 read 按鈕 aria-label(「編輯 {label}」)+ 控件 aria-label */
  label?: string
  /** 空值時 read 態顯示的提示文字(fg-muted) */
  placeholder?: string
  /** 尺寸 —— read 態最小高度 + 預設 Input 尺寸(與 Field 家族一致) */
  size?: FieldSize
  /** read 態語意標籤(標題場景傳 'h1'/'h2' 維持文件大綱;預設 'span') */
  as?: ReadTag
  /** read 態文字樣式(如標題 `text-h4 font-bold`) */
  readClassName?: string
  /** 外層容器 className */
  className?: string
}

// ── Read-view geometry cva ────────────────────────────────────────────────────
// base = 排版結構;size variant = min-height(與 edit 態 Field 高度一致,降低態切換位移)。
// multiline variant:單行 → `items-center`(文字垂直置中於 field-height);多行 → `items-start py-1.5`
//   (頂對齊 + 上下內距,對齊 Textarea `py-2` 多行閱讀語意,內容換行往下長)。
// read 態幾何典範對照(M22 cite,2026-07-09 逐行核對原始碼,見檔頭 read-view URL):
//   hover = 底色 tint 非邊框;focus = 實線 solid border;wrapper 恆帶透明 border 預留邊框盒。
const inlineEditReadStyles = cva(
  // relative(疊隱形 Pressable)/ border-transparent(預留 1px 邊框盒 → 態切換零位移;focus 才染色)/
  // px-[--field-px](文字↔底色水平內距 = Field 內距 SSOT,read=edit x 位置零跳)/ hover 底色 tint /
  // [&:has(button:focus-visible)]:border-primary(鍵盤 focus = Field edit 藍框語言,非 Button ring)。
  'relative flex rounded-md border border-transparent px-[var(--field-px)] transition-colors duration-150 hover:bg-neutral-hover [&:has(button:focus-visible)]:border-primary',
  {
    variants: {
      size: {
        sm: 'min-h-[var(--field-height-sm)]',
        md: 'min-h-[var(--field-height-md)]',
        lg: 'min-h-[var(--field-height-lg)]',
      },
      multiline: {
        false: 'items-center',
        true: 'items-start py-1.5',
      },
    },
    // 預設 sm + 單行(2026-07-09 user 拍板):read 態無邊框、視覺 = 純文字,尺寸過大會讓版面鬆散。
    defaultVariants: { size: 'sm', multiline: false },
  },
)

/**
 * InlineEdit — 就地編輯 primitive(read ↔ edit 二態,泛型 <T>)
 *
 * 互動模型 world-class 對照見檔頭「消費的 SSOT」+ inline-edit.spec.md benchmark 表:
 * - **read 態** = 純文字 / 格式化 renderRead、寬度 fill 容器、透明邊框(預留)→ 視覺 = 純內容
 * - **hover(read)** = 灰色底色 `bg-neutral-hover` + `rounded-md`(**非邊框**)+ cursor
 * - **鍵盤 focus(read)** = 外框染 `border-primary` 藍框(Field focus 語言,非 Button ring)
 * - **click / Enter/Space** = 切 edit 態 = 真正的 Field 控件(border + focus + input);多行走 Textarea
 * - **退出**:blur / Enter → commit;Esc → cancel 還原不 commit;focus 返回 read 按鈕
 * - **鍵盤結算**:消費 `makeEditSettleKeyHandler`(含中文 IME guard,與 DataTable cell 同源)
 *
 * read 態用隱形 Pressable(絕對定位 `<button>` 疊於內容上)—— 讓 `as="h1"` 等標題標籤保留文件大綱
 * a11y,同時提供鍵盤 focus + Enter 進 edit(HTML 內容模型不允許 heading 巢狀於 button,故分離)。
 */
function InlineEditImpl<T = string>(
  {
    value,
    onCommit,
    renderEdit,
    renderRead,
    multiline = false,
    label,
    placeholder,
    size = 'sm',
    as = 'span',
    readClassName,
    className,
  }: InlineEditProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<T>(value)
  // draft 最新值 ref —— commit 從事件 handler 呼叫時避免 stale closure
  const draftRef = React.useRef(draft)
  // 單次結算 guard —— Enter/Esc 已結算後,unmount 觸發的 onBlur 不再重複 commit
  const finalizedRef = React.useRef(false)
  // 鍵盤結算後把 focus 送回 read 按鈕(a11y:焦點不遺失)
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

  const commit = React.useCallback(() => {
    if (finalizedRef.current) return
    finalizedRef.current = true
    returnFocusRef.current = true
    setEditing(false)
    if (draftRef.current !== value) onCommit(draftRef.current)
  }, [value, onCommit])

  const cancel = React.useCallback(() => {
    if (finalizedRef.current) return
    finalizedRef.current = true
    returnFocusRef.current = true
    setEditing(false)
  }, [])

  // 結算後把 focus 送回 read 按鈕(所有結算路徑含 blur / Enter / Esc 皆 return —— commit/cancel
  // 一律 set returnFocusRef=true;對齊 spec「任一路徑結算後 focus 送回 read 按鈕」L39/L141「焦點不遺失」)
  React.useEffect(() => {
    if (!editing && returnFocusRef.current) {
      returnFocusRef.current = false
      readButtonRef.current?.focus()
    }
  }, [editing])

  const isEmpty =
    value == null || (value as unknown) === '' || (Array.isArray(value) && value.length === 0)
  const Tag = as as React.ElementType
  // 外框(read/edit 兩態共用同一幾何 → 保證「底色範圍 = 輸入框範圍」逐 pixel 一致):
  //   -mx-[--field-px] 左右各外擴 field-px;w-[calc(100% + 2*--field-px)] 對稱補回 → 兩側等寬填滿。
  const rootClass = cn('-mx-[var(--field-px)] w-[calc(100%_+_2_*_var(--field-px))]', className)

  if (editing) {
    const editProps: InlineEditRenderProps<T> = {
      value: draft,
      onChange: setDraftValue,
      commit,
      cancel,
      autoFocus: true,
      size,
      'aria-label': label,
    }
    // 預設 edit 控件:multiline → Textarea(Enter=換行、Cmd/Ctrl+Enter/blur 提交);否則 Input。
    // 兩者 Enter/Esc 結算都走 makeEditSettleKeyHandler(含 IME guard)。string-only 預設路徑;
    // 非 string 值必傳 renderEdit。
    const defaultEditNode = multiline ? (
      <Textarea
        autoFocus
        value={draft as unknown as string}
        size={size}
        aria-label={label}
        onChange={(e) => setDraftValue(e.target.value as unknown as T)}
        onBlur={commit}
        // 多行:plain Enter=換行、Esc=cancel、Cmd/Ctrl+Enter=commit —— 全走
        // makeEditSettleKeyHandler SSOT(含 IME guard + Cmd/Ctrl+Enter),不再手刻 capture。
        onKeyDown={makeEditSettleKeyHandler({ onCommit: commit, onCancel: cancel, commitOnEnter: false })}
      />
    ) : (
      <Input
        autoFocus
        value={draft as unknown as string}
        size={size}
        aria-label={label}
        onChange={(e) => setDraftValue(e.target.value as unknown as T)}
        onBlur={commit}
        onKeyDown={makeEditSettleKeyHandler({ onCommit: commit, onCancel: cancel })}
      />
    )
    const editNode = renderEdit ? renderEdit(editProps) : defaultEditNode
    return (
      <div ref={ref} data-editing={editing} className={rootClass}>
        {editNode}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      data-editing={editing}
      // 外框(rootClass 幾何)+ read chrome(inlineEditReadStyles:border 預留 / px / min-h / hover 底色 / focus 藍框)
      className={cn(rootClass, inlineEditReadStyles({ size, multiline }))}
    >
      {renderRead ? (
        // 格式化 read view(consumer 傳 <Select mode="display"> 等)。invisible Pressable 疊其上供點擊進 edit。
        <div className="w-full min-w-0">{renderRead(value)}</div>
      ) : (
        <Tag
          data-empty={isEmpty}
          className={cn(
            'w-full min-w-0',
            // read 態 typography 預設消費 Field display SSOT(sm/md→text-body,lg→text-body-lg)——
            // plain 用法 read 字級 = edit <Input>(text-body)= <Input mode="display"> 字級,三者一致零跳字。
            fieldDisplayTextClass(size),
            // 多行:保留換行(pre-wrap)+ 長字斷行 —— read 忠實呈現 Textarea 內容(Jira description 類),
            // 對齊 Textarea mode="display" 的 `whitespace-pre-wrap break-words`。
            multiline && 'whitespace-pre-wrap break-words',
            readClassName,
            isEmpty && 'text-fg-muted',
          )}
        >
          {isEmpty ? placeholder : String(value)}
        </Tag>
      )}
      {/* 隱形 Pressable:提供 click + 鍵盤 Tab focus + Enter/Space 進 edit;透明疊於內容上。
          hover 底色 + focus 藍框(border-primary)由外層 div 承載(Field focus 語言,非 ring),
          故本 button 只需 outline-none 消除瀏覽器預設外框。 */}
      <button
        ref={readButtonRef}
        type="button"
        aria-label={label ? `編輯 ${label}` : '編輯'}
        onClick={enterEdit}
        className="absolute inset-0 cursor-text rounded-md focus-visible:outline-none"
      />
    </div>
  )
}

// 泛型 forwardRef:forwardRef 不原生支援泛型,以 cast 還原公開型別(標準 workaround)。
const InlineEdit = React.forwardRef(InlineEditImpl) as (<T = string>(
  props: InlineEditProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactElement) & { displayName?: string }
InlineEdit.displayName = 'InlineEdit'

export { InlineEdit }
