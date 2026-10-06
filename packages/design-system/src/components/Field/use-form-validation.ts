/**
 * useFormValidation — form-validation.spec.md 方法論的可執行層(SSOT executable arm)
 *
 * ── 定位 ──
 * 把 `form-validation.spec.md` 的 9 條驗證方法論編成**不可配置的預設**——consumer 拿到就是
 * canonical 行為,沒有 API 可以違反(M17「SSOT 必可傳播」:方法論從 prose 變 executable)。
 *
 * ── 實作基礎 ──
 * 基於 react-hook-form(direct dependency,完全 wrapped 不外露——對齊 DS「基於 X」引擎慣例:
 * DataTable 基於 TanStack / DatePicker 基於 react-day-picker / Toast 基於 sonner)。
 * Consumer 不 install、不 import、看不到 RHF API。RHF 提供 values state / dirty 深比對 /
 * errors store;驗證「時機」由本 hook own(RHF 的 mode/reValidateMode 不外露)。
 *
 * ── 與 Field 家族的關係(engine-agnostic 分層,field.spec.md「定位」段)──
 * Field 保持純 layout + context(MUI FormControl 派,可用於 cell / view / 無引擎場景);
 * 本 hook 住 form 層,錯誤經 consumer 一行 `<Field invalid={!!form.errors.x}>` 接入——
 * Field 層零耦合。這是「A 派的自由 + B 派的 DX」混合位置。
 *
 * ── 方法論對應(form-validation.spec.md 規則 1-9)──
 * 1 Focus 中不顯示錯誤     → 驗證只在 blur / submit 跑(無 onChange 驗證路徑)
 * 2 Blur 時驗證            → getInputProps().onBlur 跑 validate[name];指標按著時的離開延到這一下按壓完成
 *                            (click 已送出)才驗 —— 見 settlePress(2026-10-01,待辦總帳 N67)
 * 3 Enter 等同 blur        → form 內 Enter 觸發 submit(全驗,超集);單行控件原生行為
 * 4 Escape 取消回復原值    → getInputProps().onKeyDown Escape → 寫回 dirty 比對基準 + 清 error。欄位改過時 getInputProps 另掛
 *                            `data-escape-layer`:放在 Dialog / Sheet / Popover 裡,第一下 Esc 回復、浮層不關,第二下才關
 *                            (lib/overlay-escape.ts,2026-10-01,待辦總帳 N68);控件自己的彈出層剛被同一下 Esc 關掉時不回復(一下只少一層)
 * 5 開始編輯立即清除 error → onChange 先清 errors[name](不論新值合法與否)
 * 6 Blur 重新驗證          → 同 2(離開時重判)
 * 7 Submit 驗證全部        → handleSubmit 對所有 validate keys 全跑(不依賴 blur 狀態)
 * 8 Anchor 到第一個錯誤    → focus + scrollIntoView({block:'center'});每次 submit 重算;只找這個 hook 實例自己的欄位
 * 9 Async / 跨欄位 defer 到 submit → onSubmit 回傳 field-keyed errors → 同 8 anchor
 * + Submit button:Create 永遠 enabled / Update disabled-until-dirty → `submitDisabled`
 * + 更新表單送出成功後,剛送出的值成為新的比對基準(2026-10-01,待辦總帳 N69 / 規格「Submit Button 狀態」):
 *   isDirty 回 false、送出鈕再度停用、Escape 回到已存的值 —— 不是存檔前的舊值;await 期間使用者又打的字逐格重算
 * + Double-submit 防護(2026-07-05 D4):await onSubmit 期間重入直接忽略;`isSubmitting`
 *   暴露餵 Button loading / disabled;onSubmit reject 先復位再原樣上拋(不吞錯)
 *
 * ── v1 邊界(spec「可執行層」段 documented)──
 * - getInputProps 支援 value/onChange 型控件(Input / Textarea / NumberInput / Select /
 *   Combobox / DatePicker / TimePicker / Rating;onChange 收 event 或裸值皆可)。Checkbox / Switch
 *   (onCheckedChange)consumer 自接 setFieldValue。回傳的是一整組:覆寫其中的 handler(例 onKeyDown)要轉呼叫原本那一支 ——
 *   欄位改過時同一組帶著 Esc 層宣告,浮層把第一下 Esc 留給這一格回復;蓋掉不轉呼叫 = 回復沒人做,浮層守門會在派送完發現沒人認領而照常關
 *   (lib/overlay-escape.ts「宣告 ≠ 處理」;不會困住,但規則 4 沒了)。規格 form-validation.spec.md v1 邊界 (a)。LinkInput **不在清單**:它的連結狀態不渲 input,
 *   getInputProps 帶的 name / 標記 / handler 到不了(待辦總帳 N85)。
 * - focus-first-error 以 DOM `name` 屬性定位(帶 name 的可聚焦元素生效:native input、Rating 根節點、
 *   桌機 Select 的 mirror;控件沒有這種元素則略過,errors 視覺仍由 Field 紅框 + FieldError 呈現)。
 *   歸屬 = getInputProps 掛在控件上的 `data-form-validation`(值 = 本 hook 實例 id):只認自己標記的元素,
 *   不靠 `<form>`、也不靠 submit event —— footer 按鈕 `onClick={() => form.handleSubmit()}`、沒有 `<form>` 的
 *   對話框同樣對。沒走 getInputProps 的控件(Checkbox / Switch 用 setFieldValue 自接、自己寫 name)沒有標記:
 *   只在 submit event 所在的 `<form>` 裡找;沒有 `<form>` 可界定時找整頁「沒被其他實例標記」的第一個同名元素。
 */
import * as React from 'react'
import { useForm } from 'react-hook-form'
import type { FieldValues, Path, PathValue, DefaultValues } from 'react-hook-form'
import { isImeComposing } from '@/design-system/lib/ime-composition'
import { ESCAPE_LAYER_ATTR, escapeLayerProps, isEscapeForControl, type EscapeLayerScope } from '@/design-system/lib/overlay-escape'

export interface UseFormValidationOptions<T extends FieldValues> {
  /** 表單初始值(Update 場景 = 現有資料;dirty 比對基準) */
  initialValues: T
  /**
   * 表單意圖,驅動 submit button 狀態(form-validation.spec.md「Submit Button 狀態」):
   * - 'create'(default):submitDisabled 永遠 false(不讓使用者猜「為什麼按不了」)
   * - 'update':submitDisabled = !isDirty(沒改就不用存;變更還原回 pristine 即再 disabled)
   */
  intent?: 'create' | 'update'
  /**
   * 格式驗證(blur 層,規則 2):single-field 純 syntax(email 格式 / 必填 / URL)。
   * 回傳 error 訊息字串 = 不合法;undefined = 合法。
   * 業務 / async / 跨欄位驗證**不要**放這裡——放 onSubmit 回傳(規則 9)。
   */
  validate?: Partial<Record<keyof T, (value: T[keyof T], values: T) => string | undefined>>
  /**
   * Submit handler(格式驗證全過後呼叫)。業務驗證(名稱重複 API / 跨欄位)在此判斷,
   * 回傳 field-keyed error object(如 `{ name: '名稱已存在' }`)→ hook 自動 setError +
   * anchor 到第一個錯誤(規則 9);回傳 undefined = 成功。
   */
  onSubmit: (values: T) => void | Partial<Record<keyof T, string>> | Promise<void | Partial<Record<keyof T, string>>>
}

export interface FormFieldInputProps<V = unknown> {
  name: string
  value: V
  onChange: (eventOrValue: unknown) => void
  /** 控件把 FocusEvent 傳進來時,用它的 currentTarget 判斷「延後的驗證跑之前焦點回到這一格了嗎」(規則 2 的延後);不傳也可以 */
  onBlur: (event?: unknown) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  /** 規則 8 的歸屬標記(值 = 本 hook 實例 id):送出失敗時只把焦點移到自己標記的欄位,不會跑到同頁另一張表單的同名欄位 */
  'data-form-validation': string
  /** 規則 4 的 Esc 層宣告:這一欄改過(值 ≠ 比對基準)時才有 —— 浮層守門看到就把這一下 Esc 留給欄位回復,不關浮層(lib/overlay-escape.ts) */
  [ESCAPE_LAYER_ATTR]?: EscapeLayerScope
}

export interface UseFormValidationReturn<T extends FieldValues> {
  /** 當前表單值(即時) */
  values: T
  /** field-keyed 錯誤訊息(餵 `<Field invalid>` + `<FieldError>`) */
  errors: Partial<Record<keyof T, string>>
  /** 任一欄位偏離 initialValues(深比對,還原回原值 = false) */
  isDirty: boolean
  /** Submit button disabled 狀態(intent 驅動,見 options.intent;submit 進行中一併 disabled) */
  submitDisabled: boolean
  /** Submit 進行中(await onSubmit 期間 true)— 餵 Button loading;double-submit 防護的 state 面 */
  isSubmitting: boolean
  /** Spread 到 value/onChange 型控件:`<Input {...form.getInputProps('name')} />` */
  getInputProps: <K extends keyof T & string>(name: K) => FormFieldInputProps<T[K]>
  /** 接 `<form onSubmit={form.handleSubmit}>`(規則 7/8/9) */
  handleSubmit: (e?: React.FormEvent) => Promise<void>
  /** 整表重置回比對基準(清 errors + dirty)。基準 = 掛載時的 initialValues;更新表單送出成功後 = 剛送出的值 */
  reset: () => void
  /** Escape hatch:非 value/onChange 控件(Checkbox/Switch)手動寫值 */
  setFieldValue: (name: keyof T & string, value: unknown) => void
}

/** onChange 收 event 或裸值皆可(對齊 Mantine getInputProps idiom):
 *  native input event → e.target.value;自訂控件裸值(string / number / Date / array)→ 原樣。 */
function extractValue(eventOrValue: unknown): unknown {
  if (
    eventOrValue &&
    typeof eventOrValue === 'object' &&
    'target' in eventOrValue &&
    eventOrValue.target &&
    typeof eventOrValue.target === 'object' &&
    'value' in (eventOrValue.target as object)
  ) {
    return (eventOrValue.target as HTMLInputElement).value
  }
  return eventOrValue
}

/** 「這一欄改過了嗎」的比對(規則 4 的 Esc 層與送出後重算 dirty 共用):原始值 / 陣列(Combobox)/ Date 逐項比,其餘走 RHF 同款的 JSON 深比對。 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]))
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
  }
  return false
}

/** 規則 8 的歸屬標記。getInputProps 把它掛到控件上,控件的 `{...props}` 把 data-* 轉到帶 name 的元素本身
 *  (Input / Textarea / NumberInput 的 `<input>`、Rating 根節點、行動版 Select 的 `<select>`)或它的外層(桌機 Select
 *  的 trigger,name 在裡面的 mirror 上)—— 所以用 closest 找最近的標記。 */
const OWNER_ATTR = 'data-form-validation'
const ownerOf = (el: Element) => el.closest(`[${OWNER_ATTR}]`)?.getAttribute(OWNER_ATTR) ?? null

// ─── 規則 2 的延後:指標按著時離開的欄位,等這一下按壓完成才驗(2026-10-01,待辦總帳 N67)────────────────
// 滑鼠按下欄位下方的按鈕時,欄位在 mousedown 的預設動作裡就 blur;若當場驗證,錯誤訊息在按下與放開之間長出來、
// 把按鈕往下推(CreateProjectForm 送出鈕 25px、置中對話框的 footer 271.6 → 321.6),放開時指標已不在按鈕上 →
// 這一下 click 落空,送出 / 取消都沒發生。根層修法:按著指標時的 blur 先記下,按壓結束(pointerup / mouseup)
// 後再等一個 macrotask 才驗 —— pointerup → mouseup → click 在同一個 task 內派送完,版面變化必然落在 click 之後
// (Chromium 實測事件序,滑鼠與觸控點一下都是,紀錄在待辦總帳 N67)。鍵盤離開(Tab)沒有按著的指標,照舊立刻驗。
// 觸控點一下時焦點在補發的 mousedown 才移動(在 touch 的 pointerup 之後),所以 mousedown / mouseup 也算按壓。
// 按壓結束 = pointerup / mouseup,或這一下已不會有 click:瀏覽器取消它(pointercancel)、原生拖曳結束(dragend)、
// 右鍵選單、視窗失焦。按住連結 / 圖片拖一段是原生拖曳:Chromium 送 dragstart → pointercancel → dragend,**不送 mouseup**
// —— 只放掉 pointer 的話 mousedown 留下的「按著」永遠等不到結束,這一格不驗、之後鍵盤離開也全被延後,直到下一次滑鼠點擊
// (2026-10-01 驗證抓到後修,待辦總帳 N67;閘 R2d-drag)。按壓是整頁的事,全頁一份,有 hook 實例掛著時才掛監聽。
/** 按著的 pointer:pointerId → pointerType */
const pressedPointers = new Map<number, string>()
let mousePressed = false
const afterPress = new Set<() => void>()
let pressTrackingUsers = 0

const isPointerPressed = () => pressedPointers.size > 0 || mousePressed

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

/** 掛上整頁的按壓追蹤(引用計數,捕獲階段 —— 比任何元件的 handler 早看到);回傳的函式卸下 */
function retainPressTracking(): () => void {
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

/** 撤掉一個實例所有還沒跑的延後驗證(送出會全驗 / 重設清空 / 卸載 —— 事後補跑都是錯的) */
function dropPendingBlur(pending: Map<string, () => void>) {
  for (const run of pending.values()) afterPress.delete(run)
  pending.clear()
}

/** FocusEvent 的 currentTarget(控件把 onBlur 掛在哪個元素);不是 event 就 null */
function eventElement(event: unknown): Element | null {
  const el = event && typeof event === 'object' && 'currentTarget' in event ? event.currentTarget : null
  return el && typeof (el as Element).contains === 'function' ? (el as Element) : null
}

/** 規則 8:focus + scroll 到第一個錯誤欄位。以 DOM name 屬性定位(帶 name 的可聚焦元素);
 *  找不到(控件沒有帶 name 的可聚焦元素)→ 靜默略過,error 視覺仍由 Field 紅框呈現。
 *  同名元素有好幾個時(同頁多張表單),先認本實例標記的(owner);沒有(控件沒走 getInputProps)才找沒被任何實例
 *  標記、且在被送出的 `<form>` 裡(scope;沒有 form 可界定就整頁)的。2026-10-01 修:整頁 getElementsByName 會把焦點
 *  送到 DOM 較前面那張表單的同名欄位;只以 `<form>` 界定又救不了沒有 `<form>`、footer 按鈕不帶 event 的對話框。 */
function focusFirstError(errorNames: string[], owner: string, scope: HTMLFormElement | null) {
  // 2026-07-07 修(deep-audit A.1b 殘項):「第一個錯誤」以 DOM 順序為準(= 使用者看到的視覺第一),
  // 非 validate key 宣告順序 — spec 規則 8 自然語意;對齊瀏覽器原生 reportValidity(DOM 序 focus
  // 首個 invalid)+ react-hook-form shouldFocusError。
  const inScope = (el: HTMLElement) => !scope || scope.contains(el) || (el as HTMLInputElement).form === scope
  const pick = (named: HTMLElement[]) =>
    named.find((el) => ownerOf(el) === owner) ?? named.find((el) => ownerOf(el) === null && inScope(el))
  const els = errorNames
    .map((name) => pick(Array.from(document.getElementsByName(name))))
    .filter((el): el is HTMLElement => Boolean(el))
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  const el = els[0]
  if (el) {
    el.focus()
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

// code-quality-allow: long-function — 單一 validation 生命週期 state machine(blur 驗證/edit 清 error/Escape 回復/submit 聚焦首錯)拆散會把耦合狀態跨函式傳遞,降低可讀性;對齊 react-hook-form useForm 本體同級長度
export function useFormValidation<T extends FieldValues>(
  options: UseFormValidationOptions<T>,
): UseFormValidationReturn<T> {
  const { initialValues, intent = 'create', validate, onSubmit } = options

  // RHF 引擎(wrapped):驗證時機由本 hook own,故 RHF 自身 mode 鎖 onSubmit 且不掛 resolver
  // (所有 setError/clearErrors 走手動,RHF 只當 state + dirty + errors store)。
  const form = useForm<T>({
    defaultValues: initialValues as DefaultValues<T>,
    mode: 'onSubmit',
    shouldFocusError: false, // 規則 8 自己 focus(RHF 依賴 register ref,本 hook 不走 register)
  })
  // 規則 8 的歸屬:這個 hook 實例的 id,經 getInputProps 掛到控件上(OWNER_ATTR)
  const owner = React.useId()

  // 訂閱全表(表單尺度 re-render 可接受;formState.isDirty 深比對 vs defaultValues)
  const values = form.watch()
  const { errors: rhfErrors, isDirty } = form.formState

  // 每次 render 從 errors store 的**內容**重建,不以物件身分 memo:RHF 的 setError / clearErrors 原地改同一個
  // errors 物件(react-hook-form 7.80 `index.esm.mjs` clearErrors 用 `unset(_formState.errors, …)`、setError 用
  // `set(_formState.errors, …)`),身分不變 → 以身分為相依的快取只會在初始物件被換掉那一次更新,之後錯誤永遠
  // 清不掉(2026-10-01 修,規則 5 / 6 / 7;閘 scripts/form-validation-contract-invariant.mjs)。
  const errors: Partial<Record<keyof T, string>> = {}
  for (const key of Object.keys(rhfErrors)) {
    const msg = (rhfErrors as Record<string, { message?: string } | undefined>)[key]?.message
    if (msg) errors[key as keyof T] = msg
  }

  /** 規則 2/6:blur 驗證單一欄位 */
  const validateField = React.useCallback(
    (name: keyof T & string) => {
      const fn = validate?.[name]
      if (!fn) return
      const current = form.getValues()
      const message = fn(current[name], current)
      if (message) form.setError(name as Path<T>, { type: 'format', message })
      else form.clearErrors(name as Path<T>)
    },
    [form, validate],
  )

  // 規則 2 的延後(見上方 settlePress):這個實例「按著指標時離開、還沒驗」的欄位 → 待跑的那一筆
  const pendingBlur = React.useRef(new Map<string, () => void>())
  const mounted = React.useRef(false)
  React.useEffect(() => {
    mounted.current = true
    const pending = pendingBlur.current
    const release = retainPressTracking()
    return () => {
      mounted.current = false
      dropPendingBlur(pending)
      release()
    }
  }, [])

  const deferBlurValidation = React.useCallback(
    (name: keyof T & string, event: unknown) => {
      const pending = pendingBlur.current
      // 離開的是哪個元素:控件傳了 FocusEvent 就用它;沒傳就用規則 8 的歸屬標記找這個實例的同名元素
      const field = eventElement(event)
        ?? Array.from(document.getElementsByName(name)).find((el) => ownerOf(el) === owner)
        ?? null
      const run = () => {
        if (pending.get(name) !== run) return // 已被送出 / 重設 / 卸載 / 同一格下一次離開取代
        pending.delete(name)
        if (!mounted.current) return
        // 焦點回到這一格(例:按的是把焦點放回欄位的「清除」鈕)→ 規則 1 focus 中不驗,留給下一次離開
        const refocused = field !== null && field.contains(document.activeElement)
        if (!refocused) validateField(name)
      }
      const previous = pending.get(name)
      if (previous) afterPress.delete(previous)
      pending.set(name, run)
      afterPress.add(run)
    },
    [owner, validateField],
  )

  const getInputProps = React.useCallback(
    <K extends keyof T & string>(name: K): FormFieldInputProps<T[K]> => {
      // 泛型 K 窄化到 Path<T> 需經 unknown(RHF Path 是 template-literal type,K 不直接 overlap)
      const path = name as unknown as Path<T>
      const value = form.watch(path) as T[K]
      const original = (form.formState.defaultValues as Partial<T> | undefined)?.[name]
      return {
        name,
        value,
        onChange: (eventOrValue: unknown) => {
          // 規則 5:開始編輯立即清除 error(不論新值合法與否,給修正空間)
          if (form.getFieldState(path).error) form.clearErrors(path)
          form.setValue(path, extractValue(eventOrValue) as PathValue<T, Path<T>>, {
            shouldDirty: true,
          })
        },
        // 規則 2:blur 驗證(focus 中永不驗 = 規則 1 自然成立);指標按著時的離開延到按壓完成才驗(見 settlePress)
        onBlur: (event?: unknown) => {
          if (isPointerPressed()) deferBlurValidation(name, event)
          else validateField(name)
        },
        // 規則 4:Escape 回復原值,不觸發驗證。原值 = dirty 比對基準(RHF defaultValues = 掛載時的 initialValues;更新表單送出成功後
        // = 剛送出的值),寫回後 dirty 自然回 false(Update 送出鈕再度停用)。不用 resetField:它只對 register 過的欄位生效
        // (`index.esm.mjs` resetField 開頭 `if (get(_fields, name))`),本 hook 不走 register → 靜默無作用。
        onKeyDown: (e: React.KeyboardEvent) => {
          // 輸入法組字中的 Esc 是取消組字,不回復欄位(判準 lib/ime-composition.ts,全 DS 一支;2026-09-30 補)
          if (e.key !== 'Escape' || isImeComposing(e)) return
          // 這一下已被 Radix 用來關控件自己的彈出層(可搜尋的 Select / 可打字的 DatePicker 清單開著)→ 不回復:一下只少一層
          // (lib/overlay-escape.ts;浮層守門留給欄位的那一下讀起來是「歸控件」,照常回復)
          if (!isEscapeForControl(e)) return
          form.setValue(path, original as PathValue<T, Path<T>>, { shouldDirty: true })
          form.clearErrors(path)
        },
        // 規則 8:標記「這欄屬於這個表單實例」
        [OWNER_ATTR]: owner,
        // 規則 4 的 Esc 層:改過才算一層(乾淨的欄位按 Esc 就直接關浮層)。控件的 `{...props}` 把它跟 data-form-validation 一起轉到元素上
        ...escapeLayerProps(!sameValue(value, original)),
      }
    },
    [form, validateField, deferBlurValidation, owner],
  )

  // 更新表單送出成功 → 剛送出的值成為新的比對基準(form-validation.spec.md「Submit Button 狀態」:存檔後「沒改就不用存」,送出鈕再度停用;
  // Escape 回到已存的值)。用 reset(snapshot, { keepValues }):RHF 7.80 帶 values 的 reset 會更新 defaultValues
  // (https://github.com/react-hook-form/documentation/blob/3ac1fe0254947748d993cd4b1915fc5dea87ba8b/src/content/docs/useform/reset.mdx#L38),
  // keepValues 保留 await 期間使用者又打的字 —— 但 keepValues 會把 isDirty 歸零,所以那些欄位要逐格 setValue(shouldDirty) 重算。
  // 快照是送出那一刻取的值(不是 reset 當下的 getValues:await 期間打的字不是「已存的」,M37)。
  // 新建表單不重設:建立後 consumer 常要 reset() 回空白繼續建下一筆,重設會讓 reset() 回到剛建立的值。
  // 對照:Mantine `form.resetDirty(values)`(https://github.com/mantinedev/mantine/blob/f38933cb4f1c534600f4ff59ee3ddbb4685a4bc4/apps/mantine.dev/src/pages/form/status.mdx#L106-L119)、
  // RHF 官方範例 `if (formState.isSubmitSuccessful) reset(…)`(同上 reset.mdx#L246-L258)。
  const rebaseline = React.useCallback((snapshot: T) => {
    const live = form.getValues()
    form.reset(snapshot, { keepValues: true, keepErrors: true, keepIsSubmitted: true, keepSubmitCount: true })
    for (const key of Object.keys(live)) {
      if (!sameValue(live[key], snapshot[key])) form.setValue(key as Path<T>, live[key] as PathValue<T, Path<T>>, { shouldDirty: true })
    }
  }, [form])

  // 2026-07-05 D4 double-submit 防護:連點 submit / 連按 Enter 在 await onSubmit(規則 9
  // async 業務驗證)期間會並發呼叫 onSubmit(重複建立資源的經典事故)。ref 同步擋重入
  // (state 有 render 延遲,擋不住同 tick 連點);state 暴露 isSubmitting 餵 Button
  // loading / disabled。對齊 RHF formState.isSubmitting / Polaris / Mantine form submitting。
  const isSubmittingRef = React.useRef(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  /** 規則 7/8/9:submit 全驗 + anchor 第一個錯誤 + 業務錯誤同軌 */
  const handleSubmit = React.useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      if (isSubmittingRef.current) return // double-submit guard(見上方 comment)
      // 規則 7 全驗會接手按著指標時延後的單欄驗證:不再事後補跑(送出成功後 consumer 若 reset,補跑會在清空的表單上報錯)
      dropPendingBlur(pendingBlur.current)
      // 規則 8 的第二道範圍 = 被送出的 form(submit event 的 target;await 之前取,業務錯誤路徑同樣用它),
      // 只給沒有歸屬標記的元素用(見 focusFirstError)。不用 instanceof Element:跨 realm(iframe)時恆 false
      const target = e?.target as Element | null | undefined
      const scope = typeof target?.closest === 'function' ? target.closest('form') : null
      const current = form.getValues()
      // 規則 7:對所有 validate keys 全跑(不依賴個別 blur 狀態);每次 submit 重算(規則 8)
      const formatErrors: string[] = []
      if (validate) {
        for (const name of Object.keys(validate)) {
          const fn = validate[name as keyof T]
          if (!fn) continue
          const message = fn(current[name as keyof T], current)
          if (message) {
            form.setError(name as Path<T>, { type: 'format', message })
            formatErrors.push(name)
          } else {
            form.clearErrors(name as Path<T>)
          }
        }
      }
      if (formatErrors.length > 0) {
        focusFirstError(formatErrors, owner, scope)
        return
      }
      // 規則 9:業務 / async / 跨欄位驗證 defer 到 submit(onSubmit 回傳 field-keyed errors)
      // try/finally(2026-07-05 D4):onSubmit reject 先復位 isSubmitting 再讓 rejection 原樣
      // 上拋(不吞錯,對齊 RHF handleSubmit re-throw canonical)— 表單回到可重送狀態而非卡死。
      isSubmittingRef.current = true
      setIsSubmitting(true)
      try {
        const businessErrors = await onSubmit(current)
        if (businessErrors && typeof businessErrors === 'object') {
          const names = Object.keys(businessErrors).filter(
            (k) => businessErrors[k as keyof T] != null,
          )
          for (const name of names) {
            form.setError(name as Path<T>, {
              type: 'business',
              message: businessErrors[name as keyof T] as string,
            })
          }
          if (names.length > 0) { focusFirstError(names, owner, scope); return }
        }
        // 成功(沒有業務錯誤、沒有拋錯):更新表單把剛送出的值定為新基準(見 rebaseline)
        if (intent === 'update') rebaseline(current)
      } finally {
        isSubmittingRef.current = false
        setIsSubmitting(false)
      }
    },
    [form, validate, onSubmit, owner, intent, rebaseline],
  )

  return {
    values,
    errors,
    isDirty,
    // Submit Button 狀態 canonical:Create 永遠 enabled / Update disabled-until-dirty;
    // submit 進行中一律 disabled(double-submit 防護的 UI 面,2026-07-05 D4)
    submitDisabled: (intent === 'update' ? !isDirty : false) || isSubmitting,
    isSubmitting,
    getInputProps,
    handleSubmit,
    // 重設(取消鈕常走這條)一併撤掉延後的單欄驗證,否則它會在清空的表單上補報錯
    reset: () => {
      dropPendingBlur(pendingBlur.current)
      form.reset()
    },
    setFieldValue: (name, value) =>
      form.setValue(name as Path<T>, value as PathValue<T, Path<T>>, { shouldDirty: true }),
  }
}
