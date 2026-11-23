// @internal — DS-internal 單元(Field 家族的一鍵清空 ×,各欄位元件自己畫;consumer 用 `clearable` 開,不直用);不隨 index.ts re-export 進 npm public surface。
// ── 消費的 SSOT ──
// - patterns/element-anatomy/item-anatomy.tsx `ItemInlineAction`(inline-action.spec.md「Real case 表」clear X = Inline Action;Field 宿主必傳 size)
// - components/Field/field-wrapper.tsx `pressFieldClear`(擋冒泡 → `keepFieldFocusBeforeUnmount` 交焦點 → 清;按鈕隨清空卸載,焦點不掉到 body)
//
// ── 為什麼存在(2026-11-21,LINK-CLEAR;user 2026-11-19 拍板提案 A)──
// 一鍵清空 × 原本在 5 個地方各寫一份同樣的三步(X 圖示的 ItemInlineAction → 視需要擋冒泡 → 焦點交給 owner → 清):
// Select(`SelectClearButton`,原生 / 自建兩條路)、Combobox「清除全部」、DatePicker「清除日期」、日期區間「清除日期區間」、TimePicker「清除時間」;
// PeoplePicker 轉發 Select / Combobox 的 `clearable`,AgentPanel 決策卡「清除選取」(文字鈕)用同一段「焦點交接 → 清」。
// LinkInput 加 `clearable` 是第 6 個 × —— 收成這一份,畫面與行為不變(DOM 與原本逐字相同:同一顆 ItemInlineAction、同一組 label)。
import { X } from 'lucide-react'
import { ItemInlineAction, type RowSize } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { pressFieldClear, type FieldClearFocusOwner } from './field-wrapper'

/** @internal — `FieldClearButton` 的 props。 */
export interface FieldClearButtonProps {
  /** 欄位尺寸(Field 不在 RowSizeProvider 裡,必傳;inline-action.spec.md) */
  size: RowSize
  /** aria-label 與 tooltip:「清除 + 清掉的是什麼」(清除選取 / 清除全部 / 清除日期 / 清除日期區間 / 清除時間 / 清除網址) */
  label: string
  /** 清掉值(或草稿)。焦點交接已在這之前做完 */
  onClear: () => void
  focusOwner: FieldClearFocusOwner
  /** 點擊不冒泡到宿主:觸發欄位本身按下會開浮層時要擋(自建 Select / Combobox / DatePicker / TimePicker);原生 `<select>`、LinkInput 不需要 */
  stopPropagation?: boolean
}

/**
 * @internal — Field 家族的一鍵清空 ×(`clearable` 有值時,在型別圖示 / 箭頭左邊)。外層要不要包一層(疊放順序、`pointer-events`)由宿主決定。
 * 規則住 `field-controls.spec.md`「下拉箭頭（Select / Combobox）與類型身份 indicator」clearable 列與各元件 spec「Clearable」段。
 */
export function FieldClearButton({ size, label, onClear, focusOwner, stopPropagation = false }: FieldClearButtonProps) {
  return (
    <ItemInlineAction
      size={size}
      action={{ icon: X, label, onClick: (e) => pressFieldClear(e, focusOwner, onClear, { stopPropagation }) }}
    />
  )
}
FieldClearButton.displayName = 'FieldClearButton'
