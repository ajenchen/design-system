import type { ColumnDef } from '@tanstack/react-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging(meta.type / prefix)

/**
 * Story 範例用的訂單表(2026-10-27 收成一份):DataTable 展示頁「分頁」與 AgentPanel 入口鈕遮擋樣張原本各抄一份逐字相同的
 * 欄位定義(scripts/story-helper-duplication-baseline.json 的 orderColumns 組),資料列也是同一支產生器(只差一組括號)。
 * 128 筆 = 電商後台真實規模;確定性產生(不用 Math.random,scripts/story-determinism-invariant.mjs)。
 */
export type OrderRow = { id: string; orderNo: string; customer: string; amount: number; placedAt: string }

export const ORDER_ROWS: OrderRow[] = Array.from({ length: 128 }, (_, i) => ({
  id: `order-${i + 1}`,
  orderNo: `SO-2026-${String(1001 + i)}`,
  customer: ['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Stark Industries', 'Wayne Enterprises'][i % 6],
  amount: 1200 + ((i * 137) % 8800),
  placedAt: `2026-0${(i % 6) + 1}-${String((i % 27) + 1).padStart(2, '0')}`,
}))

export const orderColumns: ColumnDef<OrderRow>[] = [
  { accessorKey: 'orderNo', header: '訂單編號' },
  { accessorKey: 'customer', header: '客戶' },
  { accessorKey: 'amount', header: '金額', meta: { type: 'currency', prefix: '$' } },
  { accessorKey: 'placedAt', header: '成立日期' },
]
