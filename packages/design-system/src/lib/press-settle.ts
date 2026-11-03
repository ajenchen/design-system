/**
 * @internal — 「指標按著的這一下按完(click 已送出)之後才做」的唯一實作(2026-10-01 起住 `components/Field/use-form-validation.ts`,
 * 2026-11-04 搬來這裡讓決策卡共用同一份,不另寫第二份;待辦總帳 N67)。
 *
 * 宿主:
 *   - `useFormValidation` 規則 2 的延後(`components/Field/use-form-validation.ts` `deferBlurValidation`):指標按著時離開的欄位,
 *     等這一下按完才驗(`components/Field/form-validation.spec.md` 規則 2)
 *   - AgentPanel 決策卡(`components/AgentPanel/agent-panel.tsx` `clearError`):按著指標的那一下改了答案(按下「其他」輸入格 = 聚焦即選中),
 *     錯誤等這一下按完才清(`components/AgentPanel/agent-decision-card.spec.md`「步進」)
 *
 * 根因:滑鼠按下欄位下方的按鈕時,欄位在 mousedown 的預設動作裡就 blur;若當場驗證,錯誤訊息在按下與放開之間長出來、
 * 把按鈕往下推(CreateProjectForm 送出鈕 25px、置中對話框的 footer 271.6 → 321.6),放開時指標已不在按鈕上 →
 * 這一下 click 落空,送出 / 取消都沒發生。決策卡是反方向的同一件事:它貼著面板底往上長,錯誤一消失,上面每張卡下移一行。
 * 根層修法:按著指標時要改版面的事先記下,按壓結束(pointerup / mouseup)後再等一個 macrotask 才做 —— pointerup → mouseup → click
 * 在同一個 task 內派送完,版面變化必然落在 click 之後(Chromium 實測事件序,滑鼠與觸控點一下都是,紀錄在待辦總帳 N67)。
 * 鍵盤沒有按著的指標,呼叫端照舊立刻做(先問 `isPointerPressed`)。
 * 觸控點一下時焦點在補發的 mousedown 才移動(在 touch 的 pointerup 之後),所以 mousedown / mouseup 也算按壓。
 * 按壓結束 = pointerup / mouseup,或這一下已不會有 click:瀏覽器取消它(pointercancel)、原生拖曳結束(dragend)、
 * 右鍵選單、視窗失焦。按住連結 / 圖片拖一段是原生拖曳:Chromium 送 dragstart → pointercancel → dragend,**不送 mouseup**
 * —— 只放掉 pointer 的話 mousedown 留下的「按著」永遠等不到結束,延後的事不做、之後鍵盤的也全被延後,直到下一次滑鼠點擊
 * (2026-10-01 驗證抓到後修,待辦總帳 N67;閘 `scripts/form-validation-contract-invariant.mjs` R2d-drag)。
 * 按壓是整頁的事,全頁一份,有宿主掛著時才掛監聽(引用計數)。
 */

/** 按著的 pointer:pointerId → pointerType */
const pressedPointers = new Map<number, string>()
let mousePressed = false
const afterPress = new Set<() => void>()
let pressTrackingUsers = 0

/** 這一刻有沒有按著的指標(滑鼠 / 觸控 / 筆;含觸控補發的 mousedown) */
export const isPointerPressed = () => pressedPointers.size > 0 || mousePressed

function settlePress() {
  if (isPointerPressed() || afterPress.size === 0) return
  const due = Array.from(afterPress)
  afterPress.clear()
  setTimeout(() => { for (const run of due) run() }, 0)
}
const onPointerDown = (e: Event) => { const p = e as PointerEvent; pressedPointers.set(p.pointerId, p.pointerType) }
const onPointerEnd = (e: Event) => { pressedPointers.delete((e as PointerEvent).pointerId); settlePress() }
/** 取消 = 這一下不會有 click,也不會有 mouseup。滑鼠與筆共用一個游標、一組 mousedown / mouseup:Chromium 開始原生拖曳時
 *  取消的是 mouse#1,按下的是筆也一樣(CDP 模擬實測:按下 pen#2、取消 mouse#1)—— 所以非觸控的取消結束**所有**滑鼠類按壓。
 *  觸控各自獨立,它的 mousedown 只在點一下成功(pointerup 之後)才補發,取消了就沒有,只放掉它自己 */
const onPointerCancel = (e: Event) => {
  const p = e as PointerEvent
  if (p.pointerType === 'touch') pressedPointers.delete(p.pointerId)
  else {
    for (const [id, type] of pressedPointers) if (type !== 'touch') pressedPointers.delete(id)
    mousePressed = false
  }
  settlePress()
}
const onMouseDown = () => { mousePressed = true }
const onMouseUp = () => { mousePressed = false; settlePress() }
const onPressAbandoned = () => { pressedPointers.clear(); mousePressed = false; settlePress() }
const PRESS_LISTENERS: ReadonlyArray<readonly [string, (e: Event) => void]> = [
  ['pointerdown', onPointerDown],
  ['pointerup', onPointerEnd],
  ['pointercancel', onPointerCancel],
  ['mousedown', onMouseDown],
  ['mouseup', onMouseUp],
  // 原生拖曳結束本身。Chromium 實測每次拖曳都先送 pointercancel(上面已結束按壓),這是第二道;拖曳來源在拖曳中被移出
  // 頁面時 dragend 到不了 window(實測),所以第一道不能是它
  ['dragend', onPressAbandoned],
  ['contextmenu', onPressAbandoned],
]

/** 掛上整頁的按壓追蹤(引用計數,捕獲階段 —— 比任何元件的 handler 早看到);回傳的函式卸下。宿主在 effect 裡掛、cleanup 卸 */
export function retainPressTracking(): () => void {
  if (pressTrackingUsers++ === 0) {
    for (const [type, fn] of PRESS_LISTENERS) window.addEventListener(type, fn, true)
    window.addEventListener('blur', onPressAbandoned)
  }
  return () => {
    if (--pressTrackingUsers > 0) return
    for (const [type, fn] of PRESS_LISTENERS) window.removeEventListener(type, fn, true)
    window.removeEventListener('blur', onPressAbandoned)
    pressedPointers.clear()
    mousePressed = false
  }
}

/** 排一件事到這一下按壓結束之後(再等一個 macrotask)才做;呼叫端先確認 `isPointerPressed()`,沒按著就自己當場做 */
export function runAfterPress(run: () => void): void {
  afterPress.add(run)
}

/** 撤掉還沒跑的那一件(被新的取代 / 送出全驗 / 重設 / 卸載 —— 事後補跑都是錯的) */
export function cancelAfterPress(run: () => void): void {
  afterPress.delete(run)
}
