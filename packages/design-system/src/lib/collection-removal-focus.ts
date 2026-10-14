/**
 * 「集合裡的一項被移除後,焦點交給誰」的唯一實作(2026-10-01 由三份收成一支)。
 *
 * 規則(`components/Combobox/combobox.spec.md`「Tag 操作 › 個別移除」,FileUpload / PeoplePicker / AgentPanel 輸入盒附件列同一條):
 * 焦點會跟著被移除的東西一起消失(焦點在那顆 × 上,或在集合容器裡別的東西上)→ 下一顆 × → 前一顆 × → owner
 * (Combobox:欄位內搜尋框或觸發區;FileUpload:上傳鈕 / 拖放區;AgentPanel 輸入盒:textarea);
 * 焦點不在這些地方(浮層內搜尋框握著焦點、Safari 點按鈕不給焦點、焦點已被別處接走)→ **不搶**。
 * 焦點不可因 DOM unmount 掉到 `body`(各 spec 同一句)。
 *
 * 「下一顆」以**被移除的那一顆**為基準(`removed`;FileUpload 把點到的 × 傳進來),沒傳才用此刻握著焦點的那一顆:
 * 焦點在列上(路線乙:列是停靠點、× 不在 Tab 路上)用鍵盤 / 滑鼠移除時,基準是被移除的那一列的 ×,不是焦點所在。
 * 有些渲染在集合剩 1 項時換結構(PeoplePicker 頭像堆疊 → 頭像 + 名字)會重掛剛聚焦的那顆按鈕,所以 React commit 之後再套一次同一條順序。
 *
 * 2026-10-01 之前的三份:`combobox.tsx` `focusAfterTagRemoval`(最完整:只在焦點會消失時才動 + rAF 重套)、
 * `file-upload.tsx` `focusAfterFileRemoval`(不看焦點在哪一律搬)、AgentPanel 輸入盒附件 ×(一份都沒有,焦點掉到 body —— 待辦總帳 OE30)。
 * 第三份出現 → Rule-of-3,抽到這裡。TreeView 的列接力(`tree-view.tsx`)順序相同但集合不同(列,不是 ×),留作同族註記、不合併。
 *
 * 世界級同一條:React Aria TagGroup 移除後焦點給下一個 / 上一個 Tag、都沒有則回欄位
 * (https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/tag/useTagGroup.ts#L143-L150);
 * rc-select 清空後聚焦容器(https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/BaseSelect/index.tsx#L711-L721)。
 */

/** 集合裡每顆移除鈕都掛這個標記(Tag 的 ×、PeoplePicker 頭像的 ×、FileUpload 的 ×)。 */
export const COLLECTION_REMOVE_SELECTOR = '[data-collection-remove]'

const visibleRemoveButtons = (container: Element) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>(COLLECTION_REMOVE_SELECTOR)).filter((button) => button.getClientRects().length > 0)

export interface CollectionRemovalFocusOptions {
  /** 被移除的那一顆 ×(基準);沒傳用此刻握著焦點的那一顆。 */
  removed?: HTMLElement | null
  /** 下一顆 / 前一顆都沒有時的落點(欄位內搜尋框、觸發區、textarea、上傳鈕);沒傳就找容器所屬的 `role="combobox"`。 */
  owner?: HTMLElement | null
}

/**
 * 在呼叫 `onRemove` / 更新 state **之前**呼叫(那時被移除的 × 還在 DOM,位置算得出來)。
 * 回傳是否動了焦點。
 */
export function focusAfterCollectionRemoval(container: HTMLElement | null, { removed, owner }: CollectionRemovalFocusOptions = {}): boolean {
  if (!container) return false
  const active = document.activeElement
  const removedButton = removed?.closest<HTMLButtonElement>(COLLECTION_REMOVE_SELECTOR) ?? null
  // 焦點會跟著消失才動:在某顆 ×(含 portal 裡的 +N 卡那幾顆)、在容器裡別的東西上、或就在被移除的那一顆上
  const focusWillBeLost = !!active && active !== document.body && (
    container.contains(active) || !!active.closest(COLLECTION_REMOVE_SELECTOR) || (removedButton?.contains(active) ?? false)
  )
  if (!focusWillBeLost) return false
  const buttons = visibleRemoveButtons(container)
  const basis = removedButton && buttons.includes(removedButton) ? removedButton : (active as HTMLButtonElement)
  const index = buttons.indexOf(basis)
  const next = index >= 0 ? buttons[index + 1] ?? buttons[index - 1] : undefined
  const fallback = owner ?? container.closest<HTMLElement>('[role="combobox"]') ?? null
  const target = next ?? fallback
  if (!target) return false
  target.focus()

  // 剩 1 項換結構會重掛剛聚焦的按鈕:commit 之後再套一次同一條順序(焦點已被別處接走就不搶)
  const preferredIndex = index >= 0 ? (buttons[index + 1] ? index : buttons[index - 1] ? index - 1 : -1) : -1
  window.requestAnimationFrame(() => {
    const now = document.activeElement
    // 焦點還在某個活著的元素上(剛聚焦的那顆、或已被別處接走)→ 不搶;只有掉到 body / 落在已卸載的節點上才補
    if (now && now !== document.body && now.isConnected) return
    const updated = visibleRemoveButtons(container)
    const updatedTarget = preferredIndex >= 0 ? updated[preferredIndex] : undefined
    ;(updatedTarget ?? fallback)?.focus()
  })
  return true
}
