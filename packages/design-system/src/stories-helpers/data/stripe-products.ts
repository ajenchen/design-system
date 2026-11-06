import { createColumnHelper } from '@tanstack/react-table'
import '@/design-system/components/DataTable/column-types' // ColumnMeta declaration merging(meta.type / align / width)

/**
 * Story 範例用的寬欄位商品表(2026-10-27 收成一份):ScrollArea 設計規格頁與設計原則頁的水平捲動示範原本各抄一份逐字相同的
 * 資料與欄位定義(scripts/story-helper-duplication-baseline.json 的 STRIPE_PRODUCTS / PRODUCT_COLUMNS 兩組)。
 * 欄寬加總刻意超過一般容器寬,示範「捲動由外層 ScrollArea 擁有、DataTable 不啟內部捲軸」。
 * 2026-10-28(稽核 L094):原本把 Stripe 自己的服務(新創設立、詐欺偵測、碳移除)當成有庫存的商品、毛利空值用全形「—」;
 * 改成商家在 Stripe 後台上架的實體商品(有庫存、毛利都有值)。展示頁同一則情境也用這一份。
 */
export type StripeProduct = {
  sku: string; name: string; category: string; stock: number
  price: string; margin: string; channel: string; status: string
}

export const STRIPE_PRODUCTS: StripeProduct[] = [
  { sku: 'KB-104', name: 'Keychron K8 機械鍵盤', category: 'Keyboards', stock: 128, price: '$89.00', margin: '42%', channel: 'Online', status: 'Active' },
  { sku: 'MS-301', name: 'Logitech MX Master 3S 滑鼠', category: 'Mice', stock: 256, price: '$99.00', margin: '38%', channel: 'Online', status: 'Active' },
  { sku: 'MN-270', name: 'Dell U2723QE 27 吋 4K 螢幕', category: 'Monitors', stock: 64, price: '$579.00', margin: '21%', channel: 'Retail', status: 'Active' },
  { sku: 'HB-107', name: 'Anker 7 合 1 USB-C 集線器', category: 'Accessories', stock: 32, price: '$45.00', margin: '55%', channel: 'Online', status: 'Active' },
  { sku: 'DK-400', name: 'CalDigit TS4 擴充基座', category: 'Docks', stock: 16, price: '$399.00', margin: '28%', channel: 'Retail', status: 'Pre-order' },
  { sku: 'WC-920', name: 'Logitech C920 網路攝影機', category: 'Webcams', stock: 8, price: '$69.00', margin: '35%', channel: 'Online', status: 'Active' },
]

/** 上架狀態:DataTable 的 select 欄 + Tag 顯示(column-types.ts `display: 'tag'`;稽核 M090:原本展示頁手刻圓點 + inline 色) */
export const PRODUCT_STATUS_OPTIONS = [
  { value: 'Active', label: 'Active', tagVariant: 'green' },
  { value: 'Pre-order', label: 'Pre-order', tagVariant: 'blue' },
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
  productCol.accessor('status', { header: 'Status', meta: { type: 'select', options: PRODUCT_STATUS_OPTIONS, display: 'tag', width: 110 } }),
]
