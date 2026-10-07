/**
 * 「這一下 `Esc` 由誰處理」的唯一判定(2026-10-01)。
 *
 * 規則(`ds-canonical/references/keyboard-model-canonical.md`「`Esc` 一次只關最內層」+「焦點所在的控件自己那一層也算一層」):
 * 一次 `Esc` 只少一層,而「最內層」**包含焦點所在控件自己的暫時狀態** —— 改過還沒存的欄位值、就地編輯中的草稿、
 * 表格的格游標 / 列選取、月曆的格內模式、拖曳中的項目。控件還有東西可撤銷時,這一下 `Esc` 由控件撤銷,浮層不關;
 * 控件乾淨後,下一下才輪到浮層。反過來,控件自己的彈出層(清單 / 日曆)開著時,彈出層才是最內層:這一下只關彈出層,控件不得同時回復。
 *
 * 為什麼判定必須放在**浮層那一側**:Radix 在 document **捕獲**階段收 `Esc`
 * (https://github.com/radix-ui/primitives/blob/d8b1ffadc6fe0bd2486816751953dfadf14b3357/packages/react/use-escape-keydown/src/use-escape-keydown.tsx#L19
 *  `{ capture: true }`;本 repo 安裝的 1.1.1 dist/index.mjs 同),永遠早於任何 React handler;DismissableLayer 呼叫 `onEscapeKeyDown`
 * 之後、沒被 `preventDefault` 就關(https://github.com/radix-ui/primitives/blob/d8b1ffadc6fe0bd2486816751953dfadf14b3357/packages/react/dismissable-layer/src/dismissable-layer.tsx#L102-L109)。
 * 所以控件要留住這一下,只有一條路:浮層的 `onEscapeKeyDown` 看見「焦點所在控件宣告了自己還有一層」就 `preventDefault`。
 * 為什麼另外記「已交給控件」:Radix 自己關閉時也只留下 `defaultPrevented`,控件分不出「被我留住」還是「被 Radix 用掉」—— 用掉的那一下控件不得動作
 * (修前:可搜尋的 Select / 可打字的 DatePicker 浮層開著按 `Esc`,Radix 關了浮層、同一下冒泡到欄位又回復了值 = 一下少兩層)。
 *
 * 世界級同一條規則、不同機制:React Aria 的 SearchField 只在有內容時吞掉 `Esc`、否則放行給外層 Dialog
 * (https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/searchfield/useSearchField.ts#L80-L89);
 * ComboBox 有可回復內容時 `state.revert()` 並停止傳播(https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/combobox/useComboBox.ts#L236-L243);
 * MUI Autocomplete 浮層開著時只關浮層並 `stopPropagation` 不讓 Modal 收到,關著時才清值
 * (https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L1072-L1089);
 * Primer 把多個 `Esc` 處理者串成一條由內而外的鏈,任一個 `preventDefault` 就停
 * (https://github.com/primer/react/blob/f2c075a5d4d0b51a279c39effa18226ad909929d/packages/react/src/hooks/useOnEscapePress.ts#L7-L15)。
 * W3C:dialog 的 `Esc` 關 dialog(https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/dialog-modal/dialog-modal-pattern.html#L73);
 * grid 的 `Esc` 先還原編輯、再回到格導覽(https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/grid/grid-pattern.html#L341-L344);
 * combobox 的 `Esc` 先關 popup、popup 關著時才清值(https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/combobox-pattern.html#L133-L136)。
 *
 * **宣告 ≠ 處理,所以守門自己驗收**(2026-10-07):標記是「我會用掉這一下」的**預告**,守門必須在 Radix 決定之前就照它留住這一下;
 * 但預告與實際處理是兩件事(M37)—— 控件的 handler 若沒有走到處理那一步(例:consumer `{...form.getInputProps('x')}` 之後自己蓋掉
 * `onKeyDown` 沒有轉呼叫、DataTable 游標所在的欄被隱藏而 handler 提早 return),被留住的這一下就沒人用,浮層又不關 = 鍵盤陷阱(WCAG 2.1.2)。
 * 所以控件「拿走」這一下是一個**動作**:`isEscapeForControl` 回 true 的那一刻就記下「已被認領」(呼叫它 = 要處理;只想看這一下還在不在、
 * 自己不處理的,用 `isEscapeTakenElsewhere`)。這一下派送完(下一個 task)還沒人認領 → 守門把同一個 `Esc` 重新派一次給焦點所在處,
 * 這一次不留、照常交給 Radix 關這一層。使用者看到的是「沒有東西可撤銷時,這一下照常關」——跟沒有宣告時一樣。
 *
 * 三種使用者(使用者清單住 `README.md` 本模組那一列):
 *   - **浮層守門** `withOverlayEscape`:Popover / Dialog / Sheet 的內容元件、FileViewer(直接用 Radix Dialog)。2026-10-01 取代 `ime-composition.ts` 的
 *     `withImeSafeEscape`(組字中的 `Esc` 不關那一層 —— 這條併進來,不另留一支)。
 *   - **控件宣告** `escapeLayerProps` + `isEscapeForControl`:`useFormValidation`(欄位改過)、`Field/field-edit-keys.ts`(就地編輯中)、LinkInput、
 *     DatePicker 可打字欄位(草稿 ≠ 顯示值)、DataTable 表格根(格游標 / 列選取,`self`)、Calendar 格內事件方塊、拖曳中(`lib/drag-announcements.ts`)。
 *     只需 `isEscapeForControl`、不掛標記(彈出層本身就是 Radix 的一層):Select / Combobox / DatePicker / TimePicker 的觸發欄位。
 *   - **分區判定** `useEscapeRegion`:AgentPanel(焦點在面板內、面板內沒有浮層 → `Esc` 什麼都不關,不跨區碰舞台的 modal;
 *     `agent-panel.spec.md`「Esc 與關閉語意」)。2026-10-01 從 agent-panel.tsx 的 window 捕獲監聽搬來 —— 全 DS 只准有一個「這一下 Esc 該不該關浮層」的判定點。
 */
import * as React from 'react'
import { isImeComposing } from '@/design-system/lib/ime-composition'

/** 控件在 render 時宣告「這一下 `Esc` 我會用掉」的屬性名(只有真的有東西可撤銷時才掛)。 */
export const ESCAPE_LAYER_ATTR = 'data-escape-layer'

/**
 * 標記的作用範圍:
 *   - `subtree`(預設):焦點在標記元素**或它裡面**都算(欄位、就地編輯容器、拖曳中的清單)
 *   - `self`:只有焦點**就在標記元素本身**才算(DataTable 表格根:格游標存在時焦點在根上;焦點進到格裡的控件時那個控件自己決定)
 */
export type EscapeLayerScope = 'subtree' | 'self'

export type EscapeLayerProps = { [ESCAPE_LAYER_ATTR]?: EscapeLayerScope }

/** 要 spread 到控件根 / 輸入框上的宣告;`owns` 為 false 時不掛(標記的有無就是「還有沒有一層」)。 */
export function escapeLayerProps(owns: boolean, scope: EscapeLayerScope = 'subtree'): EscapeLayerProps {
  return owns ? { [ESCAPE_LAYER_ATTR]: scope } : {}
}

type KeyEventLike = KeyboardEvent | { nativeEvent: KeyboardEvent }
const nativeOf = (event: KeyEventLike): KeyboardEvent => ('nativeEvent' in event ? event.nativeEvent : event)

/** 守門為焦點所在控件留住的那幾下(Radix 看到 defaultPrevented 就不關;控件看到這個記號才知道是留給它的)。 */
const handledByControl = new WeakSet<Event>()
/** 被某個控件**獨占**的那幾下(拖曳取消):其他控件與浮層都不動。 */
const claimedExclusively = new WeakSet<Event>()
/** 被留住的那幾下裡,真的有控件認領的(`isEscapeForControl` 回 true / `claimEscape`)—— 沒有就由守門重新派一次(見檔頭「宣告 ≠ 處理」)。 */
const claimedByControl = new WeakSet<Event>()
/** 守門重新派的那一下:不再留,直接照 consumer / Radix 原樣(否則同一個宣告會把它再留一次)。 */
const unclaimedRedispatch = new WeakSet<Event>()

/** 控件自己已經用掉這一下(非經守門;例:AgentPanel 分區判定留住的那一下)。 */
export function markEscapeHandled(event: KeyEventLike): void {
  const native = nativeOf(event)
  native.preventDefault()
  handledByControl.add(native)
}

/**
 * 這一下 `Esc` 由本控件**獨占**:擋 Radix、也讓其他控件的 `isEscapeForControl` 回 false。
 * 給「同一個按鍵還有另一個使用者」的情境 —— 拖曳中 dnd-kit 自己會取消拖曳(它不看 defaultPrevented),表格 / 浮層那一下都不得再動。
 */
export function claimEscape(event: KeyEventLike): void {
  const native = nativeOf(event)
  native.preventDefault()
  claimedExclusively.add(native)
  claimedByControl.add(native)
}

/**
 * 控件**要處理**這一下 `Esc` 時先問這一句(放在「會動作」的那條路上,不要在只是路過時問)。
 * 回 true = 這一下歸控件(沒人動過,或守門留給它的),同時記下「已被認領」—— 守門留住的這一下有人接了,不會再重新派;
 * 回 false = 已被別人用掉(Radix 關了一層浮層 / 另一個控件獨占)→ 控件不動作。
 */
export function isEscapeForControl(event: KeyEventLike): boolean {
  const native = nativeOf(event)
  if (claimedExclusively.has(native)) return false
  if (handledByControl.has(native)) { claimedByControl.add(native); return true }
  return !native.defaultPrevented
}

/**
 * 只看、不認領:這一下是不是已經被別人用掉了(Radix 關了一層浮層 / 另一個控件獨占)。給「自己這一層沒東西可撤銷、
 * 要把這一下交給 consumer」的控件(DatePicker 可打字欄位草稿乾淨時):問了 `isEscapeForControl` 就算認領,consumer 若沒處理,守門的重新派就被擋掉了。
 */
export function isEscapeTakenElsewhere(event: KeyEventLike): boolean {
  const native = nativeOf(event)
  return claimedExclusively.has(native) || (native.defaultPrevented && !handledByControl.has(native))
}

/** 焦點所在元素宣告的那一層(就近;`self` 只認元素本身)。 */
function escapeLayerOf(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null
  const layer = target.closest<HTMLElement>(`[${ESCAPE_LAYER_ATTR}]`)
  if (!layer) return null
  if (layer.dataset.escapeLayer === 'self' && layer !== target) return null
  return layer
}

/**
 * 留住的這一下派送完還沒人認領 → 把同一個 `Esc` 重新派給焦點所在處,這一次守門不留(見檔頭「宣告 ≠ 處理」)。
 * 等到下一個 task 再看:Radix 的捕獲監聽、控件的 React handler、冒泡到 window 的監聽都跑完了;控件就算 `stopPropagation` 也看得到結果。
 * 重新派的事件從原本的目標出發(它若已不在畫面上,改從此刻的焦點):Radix 只交給最上層的那一層,所以關的仍是同一層。
 * 這一層在這段時間裡已經關了(consumer 自己的 handler 沒問 `isEscapeForControl` 就把浮層關掉)→ 這一下已經有了結果,不再派 —— 否則會關到外面那一層。
 */
function redispatchIfUnclaimed(native: KeyboardEvent, content: Element): void {
  const origin = native.target
  setTimeout(() => {
    if (claimedByControl.has(native)) return
    if (!content.isConnected || content.getAttribute('data-state') === 'closed') return
    const doc = origin instanceof Node ? origin.ownerDocument ?? document : document
    const target = origin instanceof Node && origin.isConnected ? origin : (doc.activeElement ?? doc.body)
    if (!target) return
    const again = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true, composed: true })
    unclaimedRedispatch.add(again)
    target.dispatchEvent(again)
  }, 0)
}

/**
 * 掛在 Radix 浮層的 `onEscapeKeyDown`(PopoverContent / DialogContent / SheetContent / FileViewer 的 Dialog Content)。
 * 順序:
 *   1. 輸入法組字中 → `preventDefault`、不轉呼叫(那一下是在取消選字,不是要關這一層);
 *   2. 焦點所在控件宣告了自己還有一層、而且那個控件**在這一層裡面**(`getContent()`)→ `preventDefault` + 記「已交給控件」、不轉呼叫 consumer(這一下不是關閉);
 *      派送完沒有控件認領 → 重新派一次、照常關(`redispatchIfUnclaimed`);
 *      控件在這一層外面(可打字的 DatePicker 欄位 + 它自己的日曆浮層:焦點在欄位、浮層是最內層)→ 不留,照舊關浮層;
 *   3. 其餘(含重新派的那一下)照舊轉呼叫 consumer 的 `onEscapeKeyDown`。
 * `getContent` 回 null(內容還沒掛上)→ 當成沒有控件在裡面。
 */
export function withOverlayEscape<E extends KeyboardEvent>(
  handler: ((event: E) => void) | undefined,
  getContent: () => Element | null | undefined,
): (event: E) => void {
  return (event) => {
    if (unclaimedRedispatch.has(event)) {
      handler?.(event)
      return
    }
    if (isImeComposing(event)) {
      event.preventDefault()
      return
    }
    const layer = escapeLayerOf(event.target)
    const content = getContent()
    if (layer && content && content.contains(layer)) {
      markEscapeHandled(event)
      redispatchIfUnclaimed(event, content)
      return
    }
    handler?.(event)
  }
}

/**
 * 分區判定:焦點在 `rootRef` 這一區裡、區裡沒有任何浮層時,`Esc` 什麼都不關 —— 不讓 Radix 把焦點所在區以外的浮層(舞台上的 modal)關掉。
 * 掛在 **window** 的捕獲階段:捕獲順序是 window → document → …,所以它**結構上**一定跑在 Radix 的 document 捕獲監聽之前(不是靠掛載順序)。
 * 區裡若正開著 Tooltip(不搶焦點的浮層),這一下該關它,不攔;會搶焦點的浮層(Popover / Dialog)開著時焦點不在區裡,條件不成立、照 Radix 原樣。
 * 留住的那一下記成「已交給控件」(不是直接 `preventDefault`):區裡若有自帶 `Esc` 層的控件(改過的欄位),它的 `isEscapeForControl` 才讀得到這一下是給它的。
 */
export function useEscapeRegion(rootRef: React.RefObject<HTMLElement | null>): void {
  React.useEffect(() => {
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const region = rootRef.current
      const active = document.activeElement
      if (!region || !active || !region.contains(active)) return
      if (document.querySelector('[role="tooltip"]')) return
      markEscapeHandled(event)
    }
    window.addEventListener('keydown', onKeyDownCapture, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDownCapture, { capture: true })
  }, [rootRef])
}
