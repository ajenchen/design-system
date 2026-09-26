import * as React from 'react'
import { Pencil } from 'lucide-react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { FieldMode, FieldVariant, FieldVariantInternal } from '@/design-system/components/Field/field-types'
import { fieldWrapperStyles, bareInputStyles, fieldDisplayTextClass, FIELD_CHROME_OWN_TARGET, FIELD_TEXT_ENTRY_CURSOR, focusFieldInputFromChrome } from '@/design-system/components/Field/field-wrapper'
import { useFieldContext, useResolvedFieldSize, useResolvedFieldDisabled, useResolvedFieldMode, useResolvedFieldVariant, useResolvedFieldInvalid, useFieldEmptyDisplay, fieldEmptyColorClass } from '@/design-system/components/Field/field-context'
import { ItemInlineAction } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { TruncatedText } from '@/design-system/patterns/element-anatomy/truncated-text'

// ── URL Validation ──────────────────────────────────────────────────────────

function isValidUrl(value: string): boolean {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function formatHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ── View rendering(inline,2026-05-05 Phase B3 retire LinkInputDisplay)──
// 取代 LinkInputDisplay sub-component:純展示 a tag,無 input chrome、無 hover affordance。
// edit mode 內 link state(showLink branch)也共用此 helper,確保「編輯態的 link 顯示」與
// view mode 的視覺完全一致(SSOT)。
// 連結 hover 字色瞬間切換,不寫 transition-colors(tokens/motion/motion.spec.md「hover 回饋不做過渡」;2026-09-26 由底色延伸到字色,待辦總帳 L9 / N4(3))。
function renderLinkAnchor(value: string, label?: string) {
  const displayText = label || formatHostname(value)
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate min-w-0 text-primary hover:text-primary-hover hover:underline"
    >
      {/* 截斷必附 tooltip(tooltip.spec.md:32)— anchor 自身即 hover 目標、無疊層,TruncatedText
          放 anchor 內(trigger = 其 span child)即可;view/readonly/edit-showLink 共用本 helper 一處修。
          display="block":anchor 是 block container(對照 breadcrumb.tsx anchor 內同型消費)。 */}
      <TruncatedText display="block">{displayText}</TruncatedText>
    </a>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export interface LinkInputProps
  // `defaultValue` 一併 Omit(2026-07-05 deep-audit A.1b):spec.md「controlled-only,不支援
  // defaultValue」宣稱的型別面機械封鎖 — 原本仍在型別 surface 且經 {...props} spread 到已
  // controlled 的 input(React dev warning)。
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'defaultValue' | 'onChange'>,
    Omit<VariantProps<typeof fieldWrapperStyles>, 'mode' | 'variant' | 'width'> {
  mode?: FieldMode
  /**
   * Visual chrome(2026-05-05 Phase B3)。對齊 FieldContext.variant 透傳。
   * - `'default'`(預設)— Field wrapper 完整 chrome(form / Field 內嵌)。
   * (2026-07-09 `bare` variant 退役;naked = cell-as-input substrate,@internal)
   *
   * mode='view' 時 chrome 無視覺意義(view 完全無 wrapper);chrome 僅作用於 edit / readonly / disabled。
   */
  variant?: FieldVariant
  error?: boolean
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /** 自訂顯示文字（非編輯時） */
  label?: string
  /**
   * View 態是否包 Field naked wrapper(D-path opt-in,2026-05-08)
   * — DataTable cell view↔edit 像素級對齊用。預設 false(裸 anchor,backward compat)。
   * 設 true 時 view 走 fieldWrapperStyles(naked variant)包覆 anchor,
   * 與 cell edit (`<Input naked>`) 同 DOM 結構,消除 Layer-B padding mismatch。
   * **本元件 edit 無 endIcon(UrlCell 用 plain Input edit)→ view 也無 ItemSuffix**(僅 wrapper)。
   */
  showDisplayEndIcon?: boolean
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const LinkInput = React.forwardRef<HTMLInputElement, LinkInputProps>(
  (
    {
      mode: modeProp,
      variant: variantProp,
      error: errorProp = false,
      size: sizeProp,
      value,
      onChange,
      placeholder = 'https://',
      className,
      disabled: disabledProp,
      label,
      showDisplayEndIcon = false,
      readOnly,
      id: idProp,
      'aria-describedby': ariaDescribedByProp,
      'aria-errormessage': ariaErrorMessageProp,
      ...props
    },
    ref
  ) => {
    const fieldCtx = useFieldContext()
    const size = useResolvedFieldSize(sizeProp)
    const disabled = useResolvedFieldDisabled(disabledProp)
    // 2026-06-08 SSOT:mode 經 useResolvedFieldMode 統一解析(prop > 有效 disabled > fieldCtx.mode > readOnly > 'edit')。
    // spec field-controls.spec.md L125「readOnly 原生屬性自動覆蓋 mode」契約落地。
    const resolvedMode: FieldMode = useResolvedFieldMode({ mode: modeProp, disabled, readOnly })
    const emptyDisplay = useFieldEmptyDisplay()
    const isEditable = resolvedMode === 'edit'
    // chrome resolution:per-prop > context > 'default'
    const resolvedVariant: FieldVariantInternal = useResolvedFieldVariant(variantProp)

    // 2026-07-05 D4:invalid 經 useResolvedFieldInvalid 統一接 fieldCtx.invalid(field-controls.spec.md
    // resolver 契約「error/invalid = prop OR fieldCtx.invalid」)— 原本紅框只吃 errorProp||localError、
    // aria-invalid 卻 inline 加 fieldCtx?.invalid → <Field invalid> 下 AT 聽到 invalid 視覺卻正常框
    // (聚焦還變藍)。紅框與 aria 自此同源。宣告於 view early return 之前(Rules-of-Hooks)。
    const fieldInvalid = useResolvedFieldInvalid(errorProp)

    // ── Local state / refs ──────────────────────────────────────────────────
    // 2026-07-04 Rules-of-Hooks 修:hooks 必在 view early return 之前宣告,
    // 否則 mode 於 render 間切換 view↔edit 會改變 hook 呼叫數 → React #310 crash
    // (同 beta.76 Combobox 同款修法;僅搬位置,hook 邏輯不變)。
    const [editing, setEditing] = React.useState(false)
    const [localValue, setLocalValue] = React.useState(value ?? '')
    const [localError, setLocalError] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement | null>(null)

    // Sync external value → local
    React.useEffect(() => {
      if (!editing) setLocalValue(value ?? '')
    }, [value, editing])

    // Merge refs
    const setRef = React.useCallback((el: HTMLInputElement | null) => {
      inputRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
    }, [ref])

    // 2026-05-16 audit codex Round 6:capture rAF + cancel on unmount(defensive hygiene)
    const focusRafIdRef = React.useRef<number>(0)
    React.useEffect(() => () => { if (focusRafIdRef.current) cancelAnimationFrame(focusRafIdRef.current) }, [])

    // ── mode='view' ─────────────────────────────────────────────────────
    // 純展示:無 input chrome / 無 hover affordance / 無 Pencil edit 入口。
    // 取代既有 LinkInputDisplay sub-component(2026-05-05 Phase B3 retire)。
    // Default(showDisplayEndIcon=false):無 wrapper 裸 anchor — backward compat;為 contract (d)
    // Model A(view×default = edit 幾何減 chrome、留 px)之明文例外,見 link-input.spec.md
    // 「View 模式幾何(Model A 明文例外)」。
    // Opt-in(showDisplayEndIcon=true,2026-05-08 D-path):Field naked wrapper 包覆 anchor,
    // 與 cell edit (`<Input naked>`) 同 DOM 結構消除像素偏移(無 ItemSuffix,因 edit 也無 endIcon)。
    if (resolvedMode === 'view') {
      if (!showDisplayEndIcon) {
        // 2026-05-14 I2 fix(spec contract (e) view typography canonical):非 D-path bare
        // anchor / span 必套 `fieldDisplayTextClass(size)`(sm/md→text-body,lg→text-body-lg)
        // — 對齊跨 Field family view 視覺尺寸統一。原無 font-size class → 用 browser default
        // 字體 → 跟其他 Field view 不一致(user 抓 I2)。truncate 同需,長 URL ellipsis(I1)。
        if (!value) return <span className={cn(fieldDisplayTextClass(size), fieldEmptyColorClass(resolvedMode), 'block truncate')}>{emptyDisplay}</span>
        return <span className={cn(fieldDisplayTextClass(size), 'block truncate')}>{renderLinkAnchor(value, label)}</span>
      }
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: 'view', variant: resolvedVariant, size }), className)}
          data-field-mode="view"
        >
          <span className="flex-1 min-w-0 truncate">
            {value
              ? renderLinkAnchor(value, label)
              : <span className={fieldEmptyColorClass(resolvedMode)}>{emptyDisplay}</span>
            }
          </span>
        </div>
      )
    }

    const hasValidValue = !!value && isValidUrl(value)
    const showLink = isEditable && hasValidValue && !editing && !localError
    const error = fieldInvalid || localError

    const handleEdit = () => {
      setEditing(true)
      if (focusRafIdRef.current) cancelAnimationFrame(focusRafIdRef.current)
      focusRafIdRef.current = requestAnimationFrame(() => {
        focusRafIdRef.current = 0
        inputRef.current?.focus()
      })
    }

    // 連結狀態:外框裡「不是連結、不是鉛筆」的地方點下去 = 按鉛筆(user 2026-09-26「確保沒有分歧才照你建議做」,
    // 研究後照做;規則與出處 link-input.spec.md「Link 狀態」)。
    // 外框滑過會變色(Field 家族 hover:border-border-hover),變色的地方點下去就要有反應 ——
    // hit-area-canonical.md 要防的「看到亮起來卻點不到」。連結與鉛筆照它們自己的行為走:
    // 判斷用 Field 家族共用的「外框裡自有行為的東西」清單(field-wrapper.tsx FIELD_CHROME_OWN_TARGET),不另寫一份。
    // 用 click 不用 mousedown:與鉛筆同一個觸發時機;按下後拖出外框才放開,click 落在外框之外的共同祖先,不會觸發這裡。
    // 拖曳選字不是點一下:按在空白處、拖過網址文字、在外框裡放開,瀏覽器仍會在外框上發 click;
    // 此時直接看「外框裡有沒有被選起來的文字」,有就不進編輯(量的就是要保護的那件事,不拿移動距離當代理)。
    const handleLinkChromeClick = (event: React.MouseEvent<HTMLDivElement>) => {
      const chrome = event.currentTarget
      const target = event.target
      if (!(target instanceof Element)) return
      const own = target.closest(FIELD_CHROME_OWN_TARGET)
      if (own && own !== chrome && chrome.contains(own)) return
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed && selection.anchorNode && chrome.contains(selection.anchorNode)) return
      handleEdit()
    }

    const handleBlur = () => {
      setEditing(false)
      const trimmed = localValue.trim()
      if (!trimmed) {
        // Empty is OK — clear value
        setLocalError(false)
        onChange?.('')
        return
      }
      if (isValidUrl(trimmed)) {
        setLocalError(false)
        onChange?.(trimmed)
      } else {
        setLocalError(true)
      }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalValue(e.target.value)
      // Clear error on edit (blur validation)
      if (localError) setLocalError(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') inputRef.current?.blur()
      if (e.key === 'Escape') {
        setLocalValue(value ?? '')
        setLocalError(false)
        setEditing(false)
      }
    }

    // readonly — 顯示藍色連結（可點擊）
    // disabled — 顯示純文字 fg-disabled（不可點擊）
    if (!isEditable) {
      const displayText = value ? (label || formatHostname(value)) : null
      return (
        <div
          className={cn(fieldWrapperStyles({ mode: resolvedMode, variant: resolvedVariant, size }), className)}
          data-field-mode={resolvedMode}
        >
          <span className="flex-1 min-w-0 truncate">
            {resolvedMode === 'disabled'
              ? (displayText
                  ? <span className="text-fg-disabled">{displayText}</span>
                  : <span className={fieldEmptyColorClass(resolvedMode)}>{emptyDisplay}</span>)
              : (value
                  ? renderLinkAnchor(value, label)
                  : <span className={fieldEmptyColorClass(resolvedMode)}>{emptyDisplay}</span>)
            }
          </span>
        </div>
      )
    }

    // edit — link 顯示分支（有合法 URL 且未在編輯中）
    if (showLink) {
      return (
        <div
          // 2026-07-05 D4:link 顯示分支同樣接 error(errorProp / fieldCtx.invalid)紅框,
          // 否則 <Field invalid> 下 link state 完全無 error 呈現
          // 外框用文字游標:點空白處進入的是打字(field-controls.spec.md「游標指引」input → cursor-text;同 Input 外框)。
          // 連結(瀏覽器預設手形)與鉛筆(cursor-pointer)各自覆寫。
          className={cn(fieldWrapperStyles({ mode: 'edit', variant: resolvedVariant, size, error }), FIELD_TEXT_ENTRY_CURSOR, className)}
          data-field-mode="edit"
          data-error={error ? '' : undefined}
          onClick={handleLinkChromeClick}
        >
          {/* flex:連結是 flex item,寬度 = 文字本身、太長時縮到欄寬截斷(min-w-0 + truncate)。
              不撐滿整行 —— 文字右邊看起來空白的那一段屬於外框,點下去進入編輯,不是開網頁。
              只改這個分支:view / readonly 的外框沒有第二個動作,連結維持原樣。 */}
          <span className="flex-1 min-w-0 flex">
            {value && renderLinkAnchor(value, label)}
          </span>
          <ItemInlineAction
            size={size ?? 'md'}
            action={{ icon: Pencil, label: '編輯連結', onClick: handleEdit }} // i18n-allow: DS default inline-action label
          />
        </div>
      )
    }

    // edit — text input mode（正在編輯、無值、或格式錯誤）
    return (
      <div
        className={cn(
          fieldWrapperStyles({ mode: 'edit', variant: resolvedVariant, size, error }),
          // 打字狀態的整個外框都是輸入處:文字游標 + 點內距 / 邊框就聚焦 input(同 Input / NumberInput;待辦總帳 N53③,
          // input.spec.md 已寫三者同一條;共用實作 field-wrapper.tsx focusFieldInputFromChrome)
          FIELD_TEXT_ENTRY_CURSOR,
          className,
        )}
        onMouseDown={focusFieldInputFromChrome}
        data-field-mode="edit"
        data-error={error ? '' : undefined}
      >
        <input
          ref={setRef}
          type="url"
          id={idProp ?? fieldCtx?.id}
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-invalid={error || undefined}
          aria-required={fieldCtx?.required || undefined}
          aria-describedby={ariaDescribedByProp ?? fieldCtx?.descriptionId}
          aria-errormessage={ariaErrorMessageProp ?? (error ? fieldCtx?.errorId : undefined)}
          className={bareInputStyles}
          {...props}
        />
      </div>
    )
  }
)
LinkInput.displayName = 'LinkInput'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const linkInputMeta = {
  component: 'LinkInput',
  family: 4,
  variants: {

  },
  sizes: {

  },
  // states 對齊真實 state 集:text-input 家族無 'active'(按下)專屬視覺態(同 textareaMeta 修法);
  //   readonly / error 為 fieldWrapperStyles mode + errorProp/localError 實有狀態(2026-07-04 audit 對齊)。
  states: ['default', 'hover', 'focus-visible', 'readonly', 'disabled', 'error'],
  tokens: {
    // bg 經 fieldWrapperStyles 實渲:edit bg-surface / readonly bg-readonly / disabled bg-disabled(field-wrapper.tsx)。
    bg: ['bg-surface', 'bg-readonly', 'bg-disabled'],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-primary'],
    ring: [],
  },
} as const

export { LinkInput }
