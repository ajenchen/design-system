// @internal — boolean 值展示符號 SSOT(view / readonly 態);consumer 用 Checkbox / Switch 不直用。
// ── 消費的 SSOT ──
// - lucide-react Check / X(DS icon canonical:成功/勾 = Check、關閉/否 = X,見 ui-development.md「Icon canonical」)
// - components/Field/field-context.ts(FieldSize 型別 → icon 尺寸對齊 value 文字)
// - tokens/color:text-foreground(展示值中性色,同 readonly value / 空值 canonical)
//
// 世界級對照(M22,2026-07-09 本 session 查證):read-only boolean 顯示 = 勾/叉 icon,中性色(非紅綠):
//   MUI X DataGrid boolean cell = Check / Close(X)icon,中性色(非 red/green;true = foreground.muted、false = foreground.disabled)(來源:https://github.com/mui/mui-x/blob/7d387072c89002693bd423eef0b3ab6db87837f9/packages/x-data-grid/src/material/index.tsx#L799-L800 https://github.com/mui/mui-x/blob/7d387072c89002693bd423eef0b3ab6db87837f9/packages/x-data-grid/src/components/containers/GridRootStyles.ts#L702-L707)
//   Refine(Ant)BooleanField https://refine.dev/docs/ui-integrations/ant-design/components/fields/boolean-field/ = 勾 / 叉
//   React-admin BooleanField https://marmelab.com/react-admin/BooleanField.html = TrueIcon / FalseIcon(預設 勾 / 叉)
// 為何中性色不用紅叉綠勾:false = 「否」值本身,非「錯誤 / 被拒」;error / warning 是另一條 error token 通道,
// 不靠此 glyph 表達。true/false 同色是本 DS 的選擇(React-admin 預設兩者同色;MUI X 是兩階中性灰)。(來源:https://github.com/mui/mui-x/blob/7d387072c89002693bd423eef0b3ab6db87837f9/packages/x-data-grid/src/material/index.tsx#L799-L800 https://github.com/mui/mui-x/blob/7d387072c89002693bd423eef0b3ab6db87837f9/packages/x-data-grid/src/components/containers/GridRootStyles.ts#L702-L707)
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldSize } from '@/design-system/components/Field/field-context'

// icon 尺寸對齊 value 文字(fieldDisplayTextClass:sm/md → text-body 14px、lg → text-body-lg 16px)。
const booleanIconSize: Record<FieldSize, string> = {
  sm: 'size-3.5', // 14px
  md: 'size-3.5', // 14px
  lg: 'size-4', //   16px
}

/**
 * BooleanValueIcon — boolean 值的展示符號(true = Check 勾 / false = X 叉),中性 `text-foreground` 色。
 * Checkbox / Switch 的 view + readonly 態、DataTable boolean cell(經 Checkbox)全消費此 SSOT。
 */
export function BooleanValueIcon({
  checked,
  size = 'md',
  className,
}: {
  checked: boolean
  size?: FieldSize
  className?: string
}) {
  const Icon = checked ? Check : X
  return <Icon aria-hidden className={cn(booleanIconSize[size], 'text-foreground', className)} />
}
