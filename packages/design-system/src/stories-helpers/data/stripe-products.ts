import { createColumnHelper } from '@tanstack/react-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging(meta.type / align / width)

/**
 * Story 範例用的寬欄位商品表(2026-10-27 收成一份):ScrollArea 設計規格頁與設計原則頁的水平捲動示範原本各抄一份逐字相同的
 * 資料與欄位定義(scripts/story-helper-duplication-baseline.json 的 STRIPE_PRODUCTS / PRODUCT_COLUMNS 兩組)。
 * 欄寬加總刻意超過一般容器寬,示範「捲動由外層 ScrollArea 擁有、DataTable 不啟內部捲軸」。
 */
export type StripeProduct = {
  sku: string; name: string; category: string; stock: number
  price: string; margin: string; channel: string; status: string
}

export const STRIPE_PRODUCTS: StripeProduct[] = [
  { sku: 'PRO-001', name: 'Stripe Atlas 新創設立方案', category: 'Incorporation', stock: 128, price: '$500.00', margin: '42%', channel: 'Direct', status: 'Active' },
  { sku: 'PRO-002', name: 'Stripe Radar 詐欺偵測加購', category: 'Add-on', stock: 256, price: '$0.05/tx', margin: '78%', channel: 'Direct', status: 'Active' },
  { sku: 'PRO-003', name: 'Stripe Tax 自動稅額計算', category: 'Compliance', stock: 64, price: '$0.50/tx', margin: '65%', channel: 'Partner', status: 'Active' },
  { sku: 'PRO-004', name: 'Stripe Connect 分潤平台帳號', category: 'Platform', stock: 32, price: '$2/acct', margin: '55%', channel: 'Direct', status: 'Beta' },
  { sku: 'PRO-005', name: 'Stripe Issuing 實體卡發行', category: 'Cards', stock: 16, price: '$3/card', margin: '38%', channel: 'Partner', status: 'Active' },
  { sku: 'PRO-006', name: 'Stripe Climate 碳移除貢獻', category: 'Sustainability', stock: 8, price: '1% gross', margin: '—', channel: 'Direct', status: 'Active' },
]

const productCol = createColumnHelper<StripeProduct>()

export const PRODUCT_COLUMNS = [
  productCol.accessor('sku', { header: 'SKU', meta: { type: 'string', width: 100 } }),
  productCol.accessor('name', { header: 'Product', meta: { type: 'string', width: 240 } }),
  productCol.accessor('category', { header: 'Category', meta: { type: 'string', width: 130 } }),
  productCol.accessor('stock', { header: 'Stock', meta: { type: 'number', width: 90 } }),
  productCol.accessor('price', { header: 'Price', meta: { type: 'string', align: 'right', width: 110 } }),
  productCol.accessor('margin', { header: 'Margin', meta: { type: 'string', align: 'right', width: 90 } }),
  productCol.accessor('channel', { header: 'Channel', meta: { type: 'string', width: 100 } }),
  productCol.accessor('status', { header: 'Status', meta: { type: 'string', width: 110 } }),
]
