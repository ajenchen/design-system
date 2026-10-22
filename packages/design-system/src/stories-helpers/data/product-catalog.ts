/**
 * Story 範例用的商品目錄 —— 表格類範例要「大量、真實、每次一樣」的資料時,一律從這裡拿(虛擬捲動、排序、分頁示範)。
 *
 * 單一住所(2026-10-20 獨立複核 R1b-T7):原本 DataTable 的展示頁、設計原則頁、設計規格頁各寫一支產生器,
 * 兩種命名法(「品名 (Pro)」與「品名 — Black (Lot 1)」),其中設計原則頁與設計規格頁那兩份逐字相同 ——
 * 同一個用途三份實作,改一處另外兩處就漂(M17)。品名池沿用展示頁原本那一份(真實品名 × 規格版本,
 * story-rules.md「範例必真實業務場景」;不寫 `Product 0001` 這類佔位名)。
 *
 * 確定性:不用 Math.random / Date.now —— 同一份建置每次載入、每次截圖都是同一份資料
 * (scripts/story-determinism-invariant.mjs)。價格用固定的乘法同餘散開,看起來不規則但每次相同。
 */

export const PRODUCT_CATEGORIES = ['Electronics', 'Furniture', 'Food', 'Lifestyle'] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

/** 真實商品名池(品名 × 規格版本組合,避免 "Product item N" 佔位符) */
export const PRODUCT_NAMES: Record<ProductCategory, readonly string[]> = {
  Electronics: ['Wireless Bluetooth Headphones', 'USB-C 7-in-1 Hub', 'Mechanical Keyboard', '4K Webcam', 'Portable SSD 1TB', '65W GaN Charger', 'Noise-Cancelling Earbuds', 'Ergonomic Wireless Mouse'],
  Furniture: ['Ergonomic Office Chair', 'Standing Desk Converter', '5-Tier Bookshelf', 'Storage Cabinet', '3-Seat Fabric Sofa', 'Bedside Table', 'Coat Rack Stand', 'Adjustable Monitor Arm'],
  Food: ['Organic Green Tea 100 Bags', 'Single-Origin Coffee Beans', 'Mixed Nuts Gift Box', 'Dark Chocolate Bar', 'Rolled Oats 1kg', 'Manuka Honey Jar', 'Herbal Tea Sampler', 'Cold-Pressed Olive Oil'],
  Lifestyle: ['Stainless Steel Water Bottle', 'Scented Candle Set', 'Cordless Vacuum Cleaner', 'HEPA Air Purifier', 'Leather Notebook A5', 'Non-Slip Yoga Mat', 'Aroma Diffuser', 'Weighted Blanket'],
}
export const PRODUCT_EDITIONS = ['Standard', 'Pro', 'Lite', 'Max', 'Mini', '2-Pack', 'Bundle', 'Refill'] as const
export const PRODUCT_STOCKS = ['In stock', 'Low stock', 'Out of stock', 'Pre-order'] as const

export interface CatalogItem {
  /** 第幾筆(從 0 起);consumer 要再對應自己的欄位(賣家、上架與否)時用 */
  index: number
  sku: string
  name: string
  category: ProductCategory
  stock: (typeof PRODUCT_STOCKS)[number]
  updatedAt: string
  price: number
}

/**
 * 產生 count 筆商品。categories 只取某幾類時傳入(例:表格的 select 選項只有其中三類)—— 類別依序輪流,
 * 品名依 index 在該類的名池裡輪流、每輪完一次換下一個規格版本。
 */
export function productCatalog(count: number, { categories = PRODUCT_CATEGORIES }: { categories?: readonly ProductCategory[] } = {}): CatalogItem[] {
  return Array.from({ length: count }, (_, i) => {
    const category = categories[i % categories.length]
    const names = PRODUCT_NAMES[category]
    const baseName = names[i % names.length]
    const edition = PRODUCT_EDITIONS[Math.floor(i / names.length) % PRODUCT_EDITIONS.length]
    return {
      index: i,
      sku: `PRD-${String(i + 1).padStart(4, '0')}`,
      name: `${baseName} (${edition})`,
      category,
      stock: PRODUCT_STOCKS[i % PRODUCT_STOCKS.length],
      updatedAt: `2025/03/${String(1 + (i % 28)).padStart(2, '0')}`,
      price: 100 + ((i * 7919) % 9900),
    }
  })
}
