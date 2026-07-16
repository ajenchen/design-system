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
 * errors store / resetField;驗證「時機」由本 hook own(RHF 的 mode/reValidateMode 不外露)。
 *
 * ── 與 Field 家族的關係(engine-agnostic 分層,field.spec.md「定位」段)──
 * Field 保持純 layout + context(MUI FormControl 派,可用於 cell / view / 無引擎場景);
 * 本 hook 住 form 層,錯誤經 consumer 一行 `<Field invalid={!!form.errors.x}>` 接入——
 * Field 層零耦合。這是「A 派的自由 + B 派的 DX」混合位置。
 *
 * ── 方法論對應(form-validation.spec.md 規則 1-9)──
 * 1 Focus 中不顯示錯誤     → 驗證只在 blur / submit 跑(無 onChange 驗證路徑)
 * 2 Blur 時驗證            → getInputProps().onBlur 跑 validate[name]
 * 3 Enter 等同 blur        → form 內 Enter 觸發 submit(全驗,超集);單行控件原生行為
 * 4 Escape 取消回復原值    → getInputProps().onKeyDown Escape → resetField + 清 error
 * 5 開始編輯立即清除 error → onChange 先清 errors[name](不論新值合法與否)
 * 6 Blur 重新驗證          → 同 2(離開時重判)
 * 7 Submit 驗證全部        → handleSubmit 對所有 validate keys 全跑(不依賴 blur 狀態)
 * 8 Anchor 到第一個錯誤    → focus + scrollIntoView({block:'center'});每次 submit 重算
 * 9 Async / 跨欄位 defer 到 submit → onSubmit 回傳 field-keyed errors → 同 8 anchor
 * + Submit button:Create 永遠 enabled / Update disabled-until-dirty → `submitDisabled`
 * + Double-submit 防護(2026-07-05 D4):await onSubmit 期間重入直接忽略;`isSubmitting`
 *   暴露餵 Button loading / disabled;onSubmit reject 先復位再原樣上拋(不吞錯)
 *
 * ── v1 邊界(spec「可執行層」段 documented)──
 * - getInputProps 支援 value/onChange 型控件(Input / Textarea / NumberInput / Select /
 *   Combobox / DatePicker / TimePicker;onChange 收 event 或裸值皆可)。Checkbox / Switch
 *   (onCheckedChange)consumer 自接 setFieldValue。
 * - focus-first-error 以 DOM `name` 屬性定位(native input 生效;非 native 控件 fallback
 *   scroll 略過,errors 視覺仍由 Field 紅框 + FieldError 呈現)。
 */
import * as React from 'react'
import { useForm } from 'react-hook-form'
import type { FieldValues, Path, PathValue, DefaultValues } from 'react-hook-form'

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
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
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
  /** 整表重置回 initialValues(清 errors + dirty) */
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

/** 規則 8:focus + scroll 到第一個錯誤欄位。以 DOM name 屬性定位(native input);
 *  找不到(非 native 控件)→ 靜默略過,error 視覺仍由 Field 紅框呈現。 */
function focusFirstError(errorNames: string[]) {
  // 2026-07-07 修(deep-audit A.1b 殘項):「第一個錯誤」以 DOM 順序為準(= 使用者看到的視覺第一),
  // 非 validate key 宣告順序 — spec 規則 8 自然語意;對齊瀏覽器原生 reportValidity(DOM 序 focus
  // 首個 invalid)+ react-hook-form shouldFocusError。
  const els = errorNames
    .map((name) => document.getElementsByName(name)[0] as HTMLElement | undefined)
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

  // 訂閱全表(表單尺度 re-render 可接受;formState.isDirty 深比對 vs defaultValues)
  const values = form.watch()
  const { errors: rhfErrors, isDirty } = form.formState

  const errors = React.useMemo(() => {
    const out: Partial<Record<keyof T, string>> = {}
    for (const key of Object.keys(rhfErrors)) {
      const msg = (rhfErrors as Record<string, { message?: string } | undefined>)[key]?.message
      if (msg) out[key as keyof T] = msg
    }
    return out
  }, [rhfErrors])

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

  const getInputProps = React.useCallback(
    <K extends keyof T & string>(name: K): FormFieldInputProps<T[K]> => {
      // 泛型 K 窄化到 Path<T> 需經 unknown(RHF Path 是 template-literal type,K 不直接 overlap)
      const path = name as unknown as Path<T>
      return {
        name,
        value: form.watch(path) as T[K],
        onChange: (eventOrValue: unknown) => {
          // 規則 5:開始編輯立即清除 error(不論新值合法與否,給修正空間)
          if (form.getFieldState(path).error) form.clearErrors(path)
          form.setValue(path, extractValue(eventOrValue) as PathValue<T, Path<T>>, {
            shouldDirty: true,
          })
        },
        // 規則 2:blur 驗證(focus 中永不驗 = 規則 1 自然成立)
        onBlur: () => validateField(name),
        // 規則 4:Escape 回復原值,不觸發驗證
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Escape') {
            form.resetField(path)
            form.clearErrors(path)
          }
        },
      }
    },
    [form, validateField],
  )

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
        focusFirstError(formatErrors)
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
          if (names.length > 0) focusFirstError(names)
        }
      } finally {
        isSubmittingRef.current = false
        setIsSubmitting(false)
      }
    },
    [form, validate, onSubmit],
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
    reset: () => form.reset(),
    setFieldValue: (name, value) =>
      form.setValue(name as Path<T>, value as PathValue<T, Path<T>>, { shouldDirty: true }),
  }
}
