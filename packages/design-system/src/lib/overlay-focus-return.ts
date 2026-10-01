/**
 * 「浮層關閉後,焦點還給開啟它的東西」的唯一實作(2026-09-30 由五份收成一支)。
 *
 * 規則(`ds-canonical/references/keyboard-model-canonical.md`「彈出框開著時的 Tab 與 Esc」、`components/Dialog/dialog.spec.md`
 * 「Focus return:關閉時焦點返回 trigger 元素」):浮層關閉 → 焦點回到開啟它的那個元素,不掉到 `<body>`。
 * Radix 只會還給**它自己的觸發點**(Dialog / Popover / DropdownMenu 的 `*Trigger`);沒有觸發點時它把「還焦點」的預設動作擋掉、
 * 自己又沒有東西可還 → 焦點掉到 body(`@radix-ui/react-dialog` `onCloseAutoFocus` 先 `preventDefault()` 再 `triggerRef.current?.focus()`)。
 * 用快捷鍵、普通按鈕的 onClick、錨點(PopoverAnchor)或受控 `open` 開的浮層都是這種 —— 各自記下開啟當下的焦點,關閉時交給這裡。
 *
 * 一支判斷,三種浮層(呼叫端只宣告自己是哪一種):
 * - **Radix 有觸發點**(預設;SelectMenu、AgentPanel 歷史浮層):Radix 自己會還,這裡只接手「指標造成的收起」,
 *   還的時候明說 `focusVisible: false`(下方「為什麼」);鍵盤收起、按在外面收起都照 Radix 原樣。
 * - **沒有觸發點 + modal**(`noTrigger` + `modal`;CommandDialog、Sidebar 窄版抽屜、AppShell 窄版側欄、FileViewer):一律還,
 *   按遮罩收起也還(Radix modal 對自己的觸發點也是這樣)。
 * - **沒有觸發點 + 非 modal**(`noTrigger`;DatePicker 區間、AgentPanel 入口鈕右鍵選單):一律還,**除了**指標按在浮層與開啟者以外的地方
 *   收起 —— 那是使用者把注意力移到別處,不搶(Radix 非 modal Popover `hasInteractedOutside` 同一條)。
 * 三種都一樣的兩條:(a) 關閉的那一刻焦點已經被別的東西接走(不在 body、也不在正在關的浮層裡:列上的改名鈕開了對話框、Tab 走到下一格)→ 不搶;
 * (b) 開啟者已不在畫面上 → 交給呼叫端的退路(AppShell:主內容區),沒有退路就照 Radix 原樣。
 *
 * 為什麼指標收起要明說 `focusVisible: false`:可搜尋的浮層開著時焦點在搜尋框(文字輸入永遠符合 `:focus-visible`),CSS Selectors 4 的啟發式是
 * 「If the previously-focused element indicated focus, and a script causes focus to move elsewhere, indicate focus on the newly focused element」
 * (https://github.com/w3c/csswg-drafts/blob/main/selectors-4/Overview.bs 的 :focus-visible 啟發式清單)—— 滑鼠挑選收起後開啟者會冒出鍵盤框
 * (2026-09-30 實測 Chromium 147:SelectMenu 的 Button 觸發、AgentPanel 歷史標題)。HTML `focus()` 的 FocusOptions
 * (https://html.spec.whatwg.org/multipage/interaction.html#dom-focus);Chrome / Edge 145、Firefox 104、Safari 18.4 起支援
 * (MDN browser-compat-data `focus.options_focusVisible_parameter`,https://github.com/mdn/browser-compat-data/blob/main/api/HTMLElement.json),
 * 更舊的引擎忽略這個鍵 → 開啟者畫上鍵盤框(與鍵盤收起同長相,操作不受影響)。
 * 「指標造成的」= 最近一次使用者輸入是 pointerdown(`hooks/use-input-modality.ts` `getLastUserInput`,document capture 階段記)。
 * 指標收起不捲動頁面(`preventScroll`,指標就在那裡);鍵盤收起讓瀏覽器照常把開啟者捲進視窗(焦點不可被遮住)。
 *
 * 2026-09-30 之前的五份:Command `returnFocusAfterCommandClose`(SelectMenu / AgentPanel 歷史 / CommandDialog)、Sidebar 窄版抽屜、
 * AppShell 窄版側欄、DatePicker 區間、AgentPanel 入口鈕右鍵選單各寫一份「記開啟者 + 關閉時還」,判準各不相同
 * (有的不管焦點已被接走、有的不分指標鍵盤、有的按遮罩收起不還);FileViewer 一份都沒有(受控開啟、沒有觸發點 → 關閉後焦點掉到 body,實測)。
 */
import { getLastUserInput } from '@/design-system/hooks/use-input-modality'

/** 開啟的那一刻記下「此刻握著焦點的元素」(= 之後要還的對象);焦點在 body / 沒有 → null。 */
export function captureFocusOrigin(doc: Document = document): HTMLElement | null {
  const active = doc.activeElement
  return active instanceof HTMLElement && active !== doc.body ? active : null
}

export interface ReturnFocusOptions {
  /** Radix 沒有觸發點可還(快捷鍵 / 普通按鈕 / 錨點 / 受控開啟):鍵盤收起也由這裡還。預設 false = Radix 有觸發點,只接手指標造成的收起。 */
  noTrigger?: boolean
  /** modal 浮層(Dialog / Sheet):指標按在外面(遮罩)收起也還。非 modal 時那一種不搶。只在 `noTrigger` 時有意義。 */
  modal?: boolean
  /** 開啟者已不在畫面上時的退路(AppShell:主內容區);沒有 → 照 Radix 原樣。 */
  fallback?: () => HTMLElement | null | undefined
}

/**
 * 掛在浮層的 `onCloseAutoFocus`(PopoverContent / DialogContent / SheetContent / DropdownMenuContent)。
 * `event.currentTarget` = 正在關的浮層;前面的 handler 已經 `preventDefault()`(例:Tab 收起、焦點已走到下一格)→ 不動。
 */
export function returnFocusToOpener(event: Event, opener: HTMLElement | null | undefined, { noTrigger = false, modal = false, fallback }: ReturnFocusOptions = {}): void {
  if (event.defaultPrevented) return
  const connected = (el: HTMLElement | null | undefined) => (el?.isConnected && el !== el.ownerDocument.body ? el : null)
  const target = connected(opener) ?? connected(fallback?.())
  if (!target) return
  const doc = target.ownerDocument
  const surface = event.currentTarget instanceof Node ? event.currentTarget : null
  const active = doc.activeElement
  // (a) 焦點已被別的東西接走 → 不搶(沒有觸發點時還要擋掉 Radix / FocusScope 的預設,它會把焦點拉去別處)
  if (active && active !== doc.body && !surface?.contains(active)) {
    if (noTrigger) event.preventDefault()
    return
  }
  const last = getLastUserInput()
  const byPointer = last.kind === 'pointer'
  const pointerInside = byPointer && last.target instanceof Node && (!!surface?.contains(last.target) || target.contains(last.target))
  if (!noTrigger && !pointerInside) return // Radix 有觸發點:鍵盤收起 / 按在外面收起照 Radix 原樣
  event.preventDefault()
  if (byPointer && !pointerInside && !modal) return // 非 modal、按在外面收起:不搶
  // focusVisible 還不在本 repo 的 TypeScript DOM 型別裡(HTML 標準已有,見檔頭出處)
  target.focus({ preventScroll: byPointer, ...(byPointer ? { focusVisible: false } : null) } as FocusOptions)
}
