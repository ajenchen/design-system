import { useCallback, useRef, useState } from 'react'

/**
 * Controlled / Uncontrolled dual-mode state hook。
 *
 * 對齊 Radix `useControllableState` 慣例:
 * - 提供 `value` → controlled,setter 純 callback,內部不存 state
 * - 不提供 `value`(or undefined)→ uncontrolled,內部 state + callback 同步
 *
 * 使用情境:Field / Switch / Checkbox / DataTable selection / DropdownMenu open 等
 * 雙模式 prop。
 */
export function useControllable<T>({
  value,
  defaultValue,
  onChange,
}: {
  value?: T
  defaultValue: T
  onChange?: (next: T) => void
}): [T, (next: T | ((prev: T) => T)) => void] {
  const isControlled = value !== undefined
  const [internal, setInternal] = useState<T>(defaultValue)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const current = isControlled ? (value as T) : internal
  // 2026-07-07 C14:setter identity 穩定化——原 deps 含 `current`,值一變 setter 就換 identity
  // (consumer 放 useEffect deps / useCallback 鏈會白重跑)。對齊 Radix useControllableState:
  // current 走 ref、setter 只依 isControlled,行為 Δ=0(functional updater 讀最近 render 值,同 Radix)。
  const currentRef = useRef(current)
  currentRef.current = current

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const computed =
        typeof next === 'function' ? (next as (prev: T) => T)(currentRef.current) : next
      if (!isControlled) setInternal(computed)
      onChangeRef.current?.(computed)
    },
    [isControlled]
  )

  return [current, setValue]
}
