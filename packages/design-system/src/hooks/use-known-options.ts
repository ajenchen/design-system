import * as React from 'react'

/**
 * 記住這個元件生命週期裡**看過**的每一個選項(options / suggestions 各版本的聯集),讓「值還在、選項已被換掉」時
 * 仍然顯示得出 label —— 遠端搜尋關閉選單會清掉搜尋結果,從建議群組選到的值也不在 options 裡;沒有這份記憶,
 * 觸發點 / 唯讀 / 檢視 / 停用態會把已選的名稱退化成 id(2026-09-09 Codex R13 反例:選「設計系統元件」關閉後顯示 `ds`)。
 * 世界級對照:react-select 的 value 是 `{ value, label }` 物件、MUI Autocomplete 的 value 是選項物件、Ant `labelInValue`
 * —— 都是「label 跟著值走」;本 DS 的 value 是字串 id,所以由元件記住 label。
 *
 * **只在 commit 之後記**(useEffect),不在 render 期間寫 ref:concurrent / Suspense 下被放棄的 render 不會 commit,
 * render 期間寫進去的名稱就成了污染(Codex R14 實測:transition 被暫停又取消,畫面卻顯示未提交的新名稱)。
 * 讀取端(元件 render)只拿它當「目前清單裡找不到」時的後備,目前清單永遠先查。
 * 只記不刪:上限是曾顯示過的選項數。key 由呼叫端給(Select / Combobox 用 `value`,PeoplePicker 用 `name`)。
 */
export function useKnownOptions<T>(lists: ReadonlyArray<ReadonlyArray<T> | undefined>, key: (o: T) => string): (k: string | null | undefined) => T | undefined {
  const ref = React.useRef<Map<string, T>>(new Map())
  // deps 就是清單本身:同一個元件的清單數固定,順序固定,所以 deps 長度穩定
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { for (const list of lists) if (list) for (const o of list) ref.current.set(key(o), o) }, lists as unknown[])
  return React.useCallback((k: string | null | undefined) => (k == null ? undefined : ref.current.get(k)), [])
}
