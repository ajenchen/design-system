/**
 * @internal — 字數計數:畫在 Field 說明那一行的右端(field-controls.spec.md「字數計數」是唯一住所;本檔只放實作)。
 *
 * 由來:2026-11-26 第五輪決策卡 C7,user 點選「A:放在說明那一行的右端(「12 / 100」);沒有說明時那一行只有計數」(選項是 AI 擬的)。
 * 開關 = Input / Textarea 的 `showCount`;上限 = 原生 `maxLength`(瀏覽器照原生規則擋住超過上限的輸入)。
 *
 * 誰畫:
 *   · 包在 Field 裡 → 控件經 `registerControlCount`(field-context.ts)把字數交給 Field,Field 把說明那一行換成 `FieldDescriptionRow`
 *     (說明在左、計數在右端;沒有說明時那一行只有計數)。同 LinkInput 把錯誤說明交給 Field 的錯誤區畫(`registerControlError`)的做法。
 *   · 單獨用 → 控件自己在框下畫同一個 `FieldDescriptionRow`(只有計數),外面包 `flex-col gap-1` = Field 欄內的排法(同 link-input.tsx 單獨用的錯誤說明)。
 *
 * 讀屏:
 *   · 輸入元素的 `aria-describedby` 接到計數那一格(id = Field 的 `countId`,單獨用時自己產生);那一格裡看得見的「12 / 100」對讀屏隱藏,
 *     念的是旁邊的整句(`countSpeech`)。
 *   · 字數變了、停下來 `COUNT_ANNOUNCE_PAUSE_MS` 之後,而且焦點還在這個輸入元素上,才以禮貌模式念一次目前的整句 ——
 *     形狀照 DS 既有的播報區(`../SelectMenu/select-menu-removal-status.tsx` RemovalStatus、`../Command/command.tsx` CommandEmptyStatus:
 *     sr-only + `role="status"` + `aria-live="polite"`,一直掛著、只換裡面的字;同一句再念一次時內層換 key)。
 *     字數一變,上一句立刻收掉(過期的句子不留著給虛擬游標讀到,同 RemovalStatus「只在它還是現況時掛著」)。
 *   · 播報區放在計數那一格**外面**(兄弟節點):放在裡面的話,`aria-describedby` 算描述時會把播報的字一起念進去(念兩次)。
 */
import * as React from 'react'
import { cn } from '@/lib/utils'
import { FIELD_TEXT_CLASS, useFieldContext } from './field-context'

/** 控件交給 Field 畫的字數(`FieldContextValue.registerControlCount`;`null` = 收回) */
export interface FieldCountValue {
  /** 目前字數 = 值的 `.length`(UTF-16 碼元,與原生 `maxLength` 擋字的數法同一種:一個表情符號可能算 2) */
  count: number
  /** 上限 = 控件的原生 `maxLength`(大於 0 才算);沒有上限 → 只顯示字數 */
  max?: number
  /** 計數屬於哪一個輸入元素的 id:播報只在它有焦點時念 */
  controlId?: string
  /** 控件停用 → 計數跟說明文字一樣改停用色(M24:停用優先) */
  disabled?: boolean
}

/**
 * 字數停下來多久才念(毫秒)。值取 Carbon TextArea 字元模式的延遲(`counterMode === 'word' ? 2000 : 1000`,
 * https://raw.githubusercontent.com/carbon-design-system/carbon/main/packages/react/src/components/TextArea/TextArea.tsx );
 * 每打一個字就念會跟讀屏自己的按鍵回音搶話。只在焦點還在這個輸入元素上時念:Polaris TextField 的計數 `aria-live={focus ? 'polite' : 'off'}`
 *(https://raw.githubusercontent.com/Shopify/polaris/main/polaris-react/src/components/TextField/TextField.tsx )。
 * 禮貌等級照 DS 既有的播報區一律 polite(Carbon 用 assertive,DS 不跟:`../../lib/drag-announcements.ts`「播報的禮貌等級 = polite」同一條理由)。
 */
export const COUNT_ANNOUNCE_PAUSE_MS = 1000

/** 看得見的計數:有上限「12 / 100」,沒有上限「12」 */
export function countDisplay({ count, max }: Pick<FieldCountValue, 'count' | 'max'>): string {
  return max != null ? `${count} / ${max}` : String(count)
}

/** 讀屏念的整句(描述與播報同一句) */
export function countSpeech({ count, max }: Pick<FieldCountValue, 'count' | 'max'>): string {
  return max != null ? `已輸入 ${count} 字,上限 ${max} 字` : `已輸入 ${count} 字` // i18n-allow: DS 預設讀屏文案(同 RemovalStatus「已移除」句型的語氣)
}

function sameCount(a: FieldCountValue | null, b: FieldCountValue | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.count === b.count && a.max === b.max && a.controlId === b.controlId && a.disabled === b.disabled
}

/** Field 收控件字數的 state(field.tsx 用):相同就不換物件,不多重繪一次 */
export function useFieldCountRegistry() {
  const [count, setCount] = React.useState<FieldCountValue | null>(null)
  const register = React.useCallback((next: FieldCountValue | null) => {
    setCount((current) => (sameCount(current, next) ? current : next))
  }, [])
  return [count, register] as const
}

/**
 * 控件(Input / Textarea)用:開了 `showCount` 時算字數,包在 Field 裡就交給 Field 畫。
 * @returns countId = 輸入元素的 `aria-describedby` 要接的 id(沒開計數 = undefined);
 *          standalone = 不在 Field 裡時控件自己要畫的計數(在 Field 裡 / 沒開 = null)
 */
export function useControlCharCount({ enabled, value, maxLength, controlId, disabled }: {
  enabled: boolean
  value: unknown
  maxLength: number | undefined
  controlId: string | undefined
  disabled: boolean
}): { countId: string | undefined; standalone: FieldCountValue | null } {
  const fieldCtx = useFieldContext()
  const register = fieldCtx?.registerControlCount
  const standaloneId = `${React.useId()}-count`
  const count = enabled ? String(value ?? '').length : null
  const max = typeof maxLength === 'number' && maxLength > 0 ? maxLength : undefined
  const countValue = React.useMemo<FieldCountValue | null>(
    () => (count == null ? null : { count, max, controlId, disabled }),
    [count, max, controlId, disabled],
  )
  // layout effect:計數跟著這一格畫面一起出現 / 更新,不先畫一格沒有計數的說明行
  React.useLayoutEffect(() => {
    if (!register || !countValue) return undefined
    register(countValue)
    return () => register(null)
  }, [register, countValue])
  if (!countValue) return { countId: undefined, standalone: null }
  return register && fieldCtx
    ? { countId: fieldCtx.countId, standalone: null }
    : { countId: standaloneId, standalone: countValue }
}

/** 計數那一格 + 一直掛著的禮貌播報區(兄弟節點,見檔頭「讀屏」) */
function FieldCount({ id, value }: { id: string; value: FieldCountValue }) {
  const { count, max, controlId } = value
  const [said, setSaid] = React.useState({ text: '', n: 0 })
  const previousCount = React.useRef(count)
  React.useEffect(() => {
    if (previousCount.current === count) return undefined
    previousCount.current = count
    // 上一句已經過期 → 立刻收掉(拿掉文字不會被念出來)
    setSaid((p) => (p.text ? { ...p, text: '' } : p))
    const timer = window.setTimeout(() => {
      const control = controlId ? document.getElementById(controlId) : null
      if (!control || document.activeElement !== control) return
      setSaid((p) => ({ text: countSpeech({ count, max }), n: p.n + 1 }))
    }, COUNT_ANNOUNCE_PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [count, max, controlId])
  return (
    <>
      <span
        id={id}
        data-field-slot="count"
        // 字級 / 顏色 = FieldDescription(同一行的另一半;field.spec.md「樣式規範」);數字等寬(同 TimePicker / Pagination 的數字),打字時寬度不跳
        className={cn(FIELD_TEXT_CLASS, 'ml-auto shrink-0 whitespace-nowrap tabular-nums', value.disabled ? 'text-fg-disabled' : 'text-fg-secondary')}
        // 同 FieldDescription:停用色的字必須明告 inactive(axe color-contrast 不把它當一般文字)
        aria-disabled={value.disabled || undefined}
      >
        <span aria-hidden="true">{countDisplay(value)}</span>
        <span className="sr-only">{countSpeech(value)}</span>
      </span>
      <span role="status" aria-live="polite" className="sr-only" data-field-count-status="">
        <span key={said.n}>{said.text}</span>
      </span>
    </>
  )
}

/**
 * 說明那一行:說明在左(可多行換行)、計數在右端;沒有說明時那一行只有計數(field-controls.spec.md「字數計數」)。
 * 只在開了計數時才換成這一行 —— 沒開計數的 Field,說明照舊是欄裡的直接子元素,DOM 與畫面都不變。
 */
export function FieldDescriptionRow({ description, count, countId }: {
  description?: React.ReactNode[]
  count: FieldCountValue
  countId: string
}) {
  return (
    // 說明 ↔ 計數 = Field 欄與欄的水平間距 gap-x-3(field.spec.md「樣式規範」表;同 horizontal 的 label ↔ control)
    <div className="flex items-start gap-x-3 min-w-0" data-field-slot="description-row">
      {description && description.length > 0 && (
        // 多個 FieldDescription 時照舊上下疊(gap-1 = Field 欄內 gap)
        <div className="flex flex-col gap-1 min-w-0 flex-1">{description}</div>
      )}
      <FieldCount id={countId} value={count} />
    </div>
  )
}
