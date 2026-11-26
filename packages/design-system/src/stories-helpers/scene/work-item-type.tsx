import * as React from 'react'
import { BookOpen, Bug, CheckSquare, CircleCheck, CircleDashed, Clock, Zap, type LucideIcon } from 'lucide-react'
import { CAT_SOLID, type CategoricalHue } from '@/design-system/tokens/categorical-color'

/**
 * 工作項類型方塊與示範清單 —— 範例共用(2026-11-26,workspace F 組 F4-2)。
 *
 * 類型方塊 = 類別色實心底 + glyph(`CAT_SOLID` token pair,字色由 token 決定),放在選單列 / 選項的 `startContent`
 * (`components/Menu/menu-item.spec.md`「startContent」:節點尺寸 = `ICON_SIZE[size]`,sm / md = 16px → `size-4`)。
 * 原本只住在 `components/Menu/menu-item.stories.tsx`(WithStartContent);Select / Combobox / DropdownMenu 的「工作項類型選擇」範例
 * 也要用,同一個方塊第四處出現 → 抽到這裡(Rule-of-3)。
 * **方塊各 size 的邊長、圖案大小、圓角、筆畫待 C5 定案**(workspace F 組 F4-1);這裡沿用 menu-item 範例原值,不是規格。
 */
export function TypeBadge({ hue, glyph: Glyph }: { hue: CategoricalHue; glyph: LucideIcon }) {
  return (
    <span aria-hidden className={`inline-flex size-4 shrink-0 items-center justify-center rounded-md ${CAT_SOLID[hue]}`}>
      <Glyph className="size-3" strokeWidth={2.5} />
    </span>
  )
}

/** 工作項類型(專案管理工具建立 / 變更工作項時選的那一欄) */
export const WORK_ITEM_TYPES: ReadonlyArray<{ value: string; label: string; hue: CategoricalHue; glyph: LucideIcon; description: string }> = [
  { value: 'task', label: 'Task', hue: 'indigo', glyph: CheckSquare, description: '一般待辦工作' },
  { value: 'bug', label: 'Bug', hue: 'red', glyph: Bug, description: '產品行為與預期不符' },
  { value: 'story', label: 'Story', hue: 'green', glyph: BookOpen, description: '從使用者角度描述的需求' },
  { value: 'epic', label: 'Epic', hue: 'purple', glyph: Zap, description: '跨多個 Story 的大型目標' },
]

/** 工作項狀態(圖示帶語意色:完成 = success) */
export const WORK_ITEM_STATUSES: ReadonlyArray<{ value: string; label: string; icon: LucideIcon; iconClassName?: string }> = [
  { value: 'todo', label: '待處理', icon: CircleDashed },
  { value: 'in_progress', label: '進行中', icon: Clock, iconClassName: 'text-info' },
  { value: 'done', label: '已完成', icon: CircleCheck, iconClassName: 'text-success' },
]

/** 類型 → 選項前綴節點 */
export const workItemTypeBadge = (value: string): React.ReactNode => {
  const t = WORK_ITEM_TYPES.find((x) => x.value === value)
  return t ? <TypeBadge hue={t.hue} glyph={t.glyph} /> : null
}
