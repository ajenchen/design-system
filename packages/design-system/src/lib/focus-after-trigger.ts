/**
 * @internal — 「彈出框開著按 Tab:收起,焦點從觸發點往下 / 往上走一站」的**唯一**落點計算(2026-09-26 由兩份合一)。
 *
 * ── 規則住所 ─────────────────────────────────────────────────────────────────
 * `ds-canonical/references/keyboard-model-canonical.md`「彈出框開著時的 Tab 與 Esc」:
 *   「下一站一律從觸發點算」—— 彈出內容掛在 <body> 最末端(Portal),從選單項 / 選項往下走會掉到頁尾;
 *   「觸發點在對話框 / 面板裡時,照那個框的規則在框內繞圈;頁面上已經沒有下一站時,焦點留在觸發點」。
 * 消費者:`components/DropdownMenu/dropdown-menu-keyboard.ts`(選單,待辦總帳 B11)、
 *        `components/SelectMenu/select-menu-keyboard.ts`(單選下拉 Tab 選定後離開、多選面板內繞圈,B11)。
 *
 * ── 決定來源 ─────────────────────────────────────────────────────────────────
 * B11(`governance/planning/2026-09-25-interaction-and-hover-remediation.md`),user 逐字(附條件同意):
 * 「你確定這個符合我們一致的設計語言且不違背世界級的設計就這樣做」;合併為一份 = 同檔〇節「09-26 同意清單回覆」
 * 「按鍵規則合併」,user 逐字:「確保符合我們一致的設計語言且不違背世界級的設計且都有確保整個ds 是SSOT,避免漂移就照你建議做」。
 * 批次細節 X20(同意清單):「選單在對話框裡 Tab 繞圈;無下一站時留觸發鈕」。
 *
 * 2026-09-26 之前兩份平行實作各差一點:選單版認正 tabindex 排序、單選鈕群組、觸發點本身不在 Tab 路上的情形,
 * 到頁面邊緣時焦點留在觸發鈕;下拉版三者都不認,到頁面邊緣時交還瀏覽器 —— 那一下會落在 Radix 插在 <body> 首尾、
 * 關閉動畫期間仍掛著的隱形焦點護欄上(@radix-ui/react-popover 的 PopoverContentImpl 也呼叫 useFocusGuards),
 * 焦點消失一站。合一後兩者都照正本那一句:頁面上已經沒有下一站時,焦點留在觸發點。
 */

/** 瀏覽器可能放進 Tab 順序的元素(候選;再經 `isTabbableElement` 過濾) */
const TABBABLE_CANDIDATES = [
  'a[href]', 'area[href]', 'button', 'input', 'select', 'textarea', 'iframe', 'summary',
  'audio[controls]', 'video[controls]', '[contenteditable]:not([contenteditable="false"])', '[tabindex]',
].join(',')

/** 呼叫端要排除的元素(例:正在關的那個彈出框本身 —— 關閉動畫期間還在 DOM 裡) */
export type TabStopExclude = (el: HTMLElement) => boolean

/**
 * 這個元素此刻在不在頁面的 Tab 路上(照瀏覽器規則;判準對齊 Radix FocusScope `getTabbableCandidates` + `isHidden`)。
 * Radix 焦點護欄(body 首尾 tabindex=0 的隱形 span)不是頁面上的一站。
 */
export function isTabbableElement(el: HTMLElement): boolean {
  if (el.tabIndex < 0) return false
  if (el.matches(':disabled')) return false
  if (el instanceof HTMLInputElement && el.type === 'hidden') return false
  if (el.closest('[inert],[data-radix-focus-guard]')) return false
  if (el.getClientRects().length === 0) return false
  if (getComputedStyle(el).visibility === 'hidden') return false
  // 同名單選鈕:有勾選的那顆才在 Tab 路上(全未勾時整組都算,往下落第一顆、往上落最後一顆 —— 瀏覽器行為)
  if (el instanceof HTMLInputElement && el.type === 'radio' && el.name && !el.checked) {
    const group = Array.from(el.ownerDocument.getElementsByName(el.name))
    if (group.some((n) => n instanceof HTMLInputElement && n.type === 'radio' && n.form === el.form && n.checked)) return false
  }
  return true
}

/** 範圍內的 Tab 順序:正 tabindex 先(由小到大),其餘照文件順序 */
export function tabbableOrder(scope: HTMLElement, exclude?: TabStopExclude): HTMLElement[] {
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>(TABBABLE_CANDIDATES)).filter(
    (el) => isTabbableElement(el) && !exclude?.(el),
  )
  const positive = candidates.filter((el) => el.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex)
  return [...positive, ...candidates.filter((el) => el.tabIndex === 0)]
}

/** 觸發點外層的對話框 / 面板(`role="dialog"` / `"alertdialog"`):Tab 本來就在那個框裡繞圈(W3C dialog pattern) */
function dialogScopeOf(trigger: HTMLElement): HTMLElement | null {
  return trigger.parentElement?.closest<HTMLElement>('[role="dialog"],[role="alertdialog"]') ?? null
}

/**
 * 從觸發點往下(或往上)的那一站 —— 等於「彈出框關著時,在觸發點上按同一個鍵會到的那一格」。
 * 觸發點在對話框 / 面板裡 → 只在那個框裡找,到頭繞回(W3C:"Like non-modal dialogs, modal dialogs contain their tab sequence."
 * https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/dialog-modal/dialog-modal-pattern.html#L28-L31
 * ;Radix Dialog / Popover 的 FocusScope loop);頁面層沒有下一站 → null。
 */
export function tabStopFromTrigger(trigger: HTMLElement, backward: boolean, exclude?: TabStopExclude): HTMLElement | null {
  const scope = dialogScopeOf(trigger)
  const order = tabbableOrder(scope ?? trigger.ownerDocument.body, exclude)
  const at = order.indexOf(trigger)
  let target: HTMLElement | undefined
  if (at !== -1) {
    target = order[backward ? at - 1 : at + 1]
  } else {
    // 觸發點本身不在 Tab 路上(例:tabindex=-1 的列上小按鈕)→ 跟瀏覽器一樣,以它在文件裡的位置為起點
    const flow = order.filter((el) => el.tabIndex === 0)
    target = backward
      ? [...flow].reverse().find((el) => trigger.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)
      : flow.find((el) => trigger.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
  }
  if (target) return target
  if (scope && order.length > 0) return backward ? order[order.length - 1] : order[0]
  return null
}

/**
 * 呼叫端**先把彈出框同步關掉**(flushSync:modal 的 FocusScope 焦點鎖要先解除,可打字的輸入框要先換回顯示值),
 * 再呼叫這一支:焦點落到觸發點的下一站 / 上一站;頁面上已經沒有下一站 → 留在觸發點(X20)。
 * 呼叫端負責 preventDefault(瀏覽器預設的 Tab 會從彈出框的位置 —— 頁尾 —— 往下走)。
 * 回傳最後拿到焦點的元素。
 */
export function focusFromTrigger(trigger: HTMLElement, backward: boolean, exclude?: TabStopExclude): HTMLElement {
  const next = tabStopFromTrigger(trigger, backward, exclude) ?? trigger
  next.focus()
  // 焦點被同一個 task 裡的關閉流程拉走時(modal 選單的焦點鎖卸載),下一個 macrotask 再給一次
  if (next.ownerDocument.activeElement !== next) window.setTimeout(() => next.focus(), 0)
  return next
}
