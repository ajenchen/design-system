// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { cn } from '@/lib/utils'

// ── CheckboxGroupContext ────────────────────────────────────────────────────
// 讓內部 `<Checkbox>` 知道「我在 CheckboxGroup 裡」→ 即使 Field context 也存在,
// checkbox 仍然保留自己的 label(每個 checkbox 是 group 的一個選項,FieldLabel 只是群組名稱)。
//
// 反之:Checkbox **單獨**塞進 Field(無 CheckboxGroup 包)時,Checkbox 才忽略自己的 label
// 讓 FieldLabel 接管 —— 那是「binary toggle in Field」的場景。
//
// 這是 AR50 的根因:沒這個 context 前,CheckboxGroup 內部的 Checkbox 會誤以為「被 Field 包了」
// 就把 label 全丟掉,導致 Sheet 範例的 Checkboxes 全部沒 label。
export const CheckboxGroupContext = React.createContext<{ inGroup: true } | null>(null)

/**
 * CheckboxGroup — 多選 Checkbox 的 layout primitive
 *
 * ── Canonical 鐵律(2026-04-21 user 明示 + codified)──
 *
 * **垂直 CheckboxGroup 的 item 之間沒有外部 gap**。間距完全靠每個 Checkbox 內部的
 * `SelectionItem py = (field-height - 1lh) / 2` 公式生成 —— 單行高度對齊 field-height,
 * 多 row stacked 時 row-to-row 自然有 py × 2 的呼吸空間。
 *
 * **禁止**外層加 `gap-y-*` / `space-y-*` / margin —— 會 double padding,違反 canonical。
 *
 * ── 對齊 RadioGroup canonical ──
 * 本 DS `RadioGroup` wrapper 用 `grid`(無 gap;radio-group.tsx 自加——Radix primitive
 * 本身 unstyled,無預設 layout);本元件垂直也用 `grid`(無 gap),
 * horizontal 用 `flex flex-wrap gap-4`(短 label 並排才需水平 gap)。
 *
 * ── 為什麼 vertical 不給 gap 也能好看 ──
 * SelectionItem py 的公式讓每個 Checkbox row 的「單行高度 = field-height」。row 堆疊時
 * 相鄰 row 的 py 相加 = 2×py ≈ 10-12px 真實 row-to-row 視覺呼吸空間。Atlassian / Ant /
 * Chakra / GitHub CheckboxGroup 皆同流派 —— row 高度定義 gap,不加外部 gap。
 *
 * ── 本 session 曾經的錯誤 + 釐清 ──
 * 早先曾以為「gap 要加」是因為「row 黏在一起」——但實際根因是 `Checkbox` 在 Field
 * context 內誤吞自己的 label(見 checkbox.tsx 的 CheckboxGroupContext 修正)。
 * label 回來後 row 自然撐開,不需要 gap。修正後的 canonical 鐵律:**zero gap,
 * 間距由 SelectionItem py 獨家擁有**。
 *
 * ── fieldLayout:block ──
 * 在 `<Field orientation="horizontal">` 內,control area auto `items-start` +
 * padding-top 公式對齊第一個 item 的 label 第一行(見 field.spec.md)。
 *
 * ── 用法範例 ──
 *   <CheckboxGroup>
 *     <Checkbox label="待處理" defaultChecked />
 *     <Checkbox label="進行中" defaultChecked />
 *     <Checkbox label="已完成" />
 *   </CheckboxGroup>
 *
 *   <CheckboxGroup orientation="horizontal">
 *     <Checkbox label="Email" />
 *     <Checkbox label="Push" />
 *     <Checkbox label="SMS" />
 *   </CheckboxGroup>
 */

export interface CheckboxGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 排列方向。
   * - `vertical`(預設):多選項目堆疊,row 間距由 SelectionItem 擁有(外層 0 gap)
   * - `horizontal`:選項並排,gap-4 分隔(短 label 場景,如「Email / Push / SMS」)
   */
  orientation?: 'vertical' | 'horizontal'
}

// Module-level 常數(2026-04-22 D3 perf audit):provider value 無狀態,hoist 避免 render 重建
const CHECKBOX_GROUP_CTX_VALUE = { inGroup: true } as const

const CheckboxGroup = React.forwardRef<HTMLDivElement, CheckboxGroupProps>(
  ({ className, orientation = 'vertical', ...props }, ref) => (
    <CheckboxGroupContext.Provider value={CHECKBOX_GROUP_CTX_VALUE}>
      <div
        ref={ref}
        role="group"
        className={cn(
          // 垂直 CheckboxGroup:zero gap(間距由 SelectionItem py 獨家擁有,見 docblock canonical)
          // 水平:短 label 並排需水平 gap-4(label 沒有 py 擴散,需要顯式 gap)
          orientation === 'vertical' ? 'grid' : 'flex flex-wrap gap-4',
          className
        )}
        {...props}
      />
    </CheckboxGroupContext.Provider>
  )
)
CheckboxGroup.displayName = 'CheckboxGroup'
// Field layout declaration:block primitive(多項堆疊)——進入 <Field> 時
// control area 自動切 items-start + padding-top 公式。對齊 RadioGroup 做法。
;(CheckboxGroup as unknown as { fieldLayout: 'block' }).fieldLayout = 'block'

export { CheckboxGroup }
