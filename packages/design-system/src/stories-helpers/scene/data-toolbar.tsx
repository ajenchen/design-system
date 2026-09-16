import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 資料工具列 —— 整頁示範用的「左搜尋 / 右操作」零件(2026-09-16)。
 *
 * SSOT:`patterns/action-bar/action-bar.spec.md`「七、空間不足時的降級 → 搜尋框」。
 * 四支整頁示範(DataTable WithBulkActions / Roadmap、AppShell 主側欄+分頁、AgentPanel URL 註冊表)原本各抄一份同樣的 markup,
 * 搜尋框外層 `flex-1 max-w-sm` 沒有明確下限 —— 瀏覽器排版預設「格子不得比自己的內容窄」
 * (CSS Flexbox §4.5 automatic minimum size,https://www.w3.org/TR/css-flexbox-1/#min-size-auto),
 * 而原生 `<input>` 內建約 20 字元寬,整顆搜尋框卡在 204px 縮不下去;工具列又不換行、不裁切,所以空間不夠時整列往右溢出,
 * 主按鈕右緣跑出表格(user 2026-09-16:「搜尋框在視窗小的情況會把新增任務按鈕往右推出去,導致按鈕右側無法與 table 右側對齊」)。
 *
 * 這裡把幾何定一次,四支示範都消費它:
 * - 搜尋框是列裡**唯一可壓縮**的項目:上限 `max-w-sm`(384px),下限 `min-w-40`(160px = sm 欄位的放大鏡 + 內距 50px + 約 7.8 個
 *   14px 中文字;示範裡最長的提示字「搜尋商品 / SKU」整顆需 146px,四句都放得下)。**值由消費端(示範)自己定,不建 token** ——
 *   `tokens/README.md`「新增 token 的 criteria」:消費者只算 DS 元件與產品端程式,只有 stories / 範例重複不構成建 token 的理由。
 *   世界級同樣不為此發 token:Carbon 表格工具列的搜尋收合時吃通用版面尺寸 `layout.size('height')`、展開時 `inline-size: 100%`
 *   (https://github.com/carbon-design-system/carbon/blob/main/packages/styles/scss/components/data-table/action/_data-table-action.scss);
 *   Polaris 只有通用寬度刻度 `width-0…width-3200`(https://github.com/Shopify/polaris/blob/main/polaris-tokens/src/themes/base/width.ts);
 *   MUI Data Grid 的快速篩選沒有任何寬度 token(https://github.com/mui/mui-x/blob/master/packages/x-data-grid/src/components/quickFilter/QuickFilter.tsx)。
 * - 操作群 `shrink-0`,永不被壓縮;整列 `min-w-0`;搜尋框 ↔ 操作群間距 = `--layout-space-loose`(並列元素主間距,`layoutSpace.spec.md`;
 *   user 2026-09-16 裁示「至少要間隔 loose space token」),操作群內部鈕距維持 `gap-2`(action-bar.spec.md 分隔線段)。
 * - 空間連下限都放不下時(操作鈕很多的列在約 400px 以下)本零件**不**收合搜尋框 —— 世界級的「收成放大鏡、點了展開」是另一個互動,
 *   尚未採用(user 2026-09-16:「目前先做到縮到下限即可」);操作鈕的收合規則見 action-bar.spec.md 七。
 *
 * 機械閘:`scripts/action-bar-toolbar-invariant.mjs`(五個寬度 × 四支示範:列不溢出、最後一顆按鈕右緣 = 內容右緣、搜尋框 ≥ 下限)。
 */
export interface DataToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 左側搜尋欄位(`<Input size="sm" startIcon={Search} …/>`);業務層 search,與 filter / sort 同區(action-bar.spec.md「Search 的角色判斷」) */
  search: React.ReactNode
  /** 右側操作群(Button / Popover 觸發鈕),排序依 action-bar.spec.md */
  children?: React.ReactNode
}

export function DataToolbar({ search, children, className, ...rest }: DataToolbarProps) {
  return (
    <div
      // 搜尋框 ↔ 操作群 = --layout-space-loose(並列元素的主間距,layoutSpace.spec.md 規則 3;user 2026-09-16:「新增任務按鈕和搜尋框至少要間隔 loose space token」);
      // 操作群內部鈕與鈕之間仍是 gap-2(action-bar.spec.md 第五節:「水平間距 = 自身兩端各 4px 於 gap-2 容器」)。
      className={cn('flex min-w-0 items-center justify-between gap-[var(--layout-space-loose)] px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]', className)}
      {...rest}
    >
      <div data-toolbar-search className="min-w-40 max-w-sm flex-1">
        {search}
      </div>
      <div data-toolbar-actions className="flex shrink-0 items-center gap-2">
        {children}
      </div>
    </div>
  )
}
