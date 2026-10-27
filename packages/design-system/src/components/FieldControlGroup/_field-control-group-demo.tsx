// FieldControlGroup 範例共用的「搜尋框 + 搜尋按鈕」(`_` 前綴 = 示範用的私有 helper,不進 index;同 Calendar/_calendar-demo.tsx)。
// 按「搜尋」(或在輸入框按 Enter)真的用關鍵字篩商品名、把結果列在下方;沒有符合的寫「沒有符合的商品」。
// 依據:F-S2 user 09-08「一堆按鈕都無法正常反應」(登記簿 UD-A16)—— 原本這顆「搜尋」按了沒反應。
import * as React from 'react'
import { Search } from 'lucide-react'
import { FieldControlGroup } from './field-control-group'
import { Input } from '@/design-system/components/Input/input'
import { Button } from '@/design-system/components/Button/button'
import { PRODUCT_NAMES } from '@/design-system/stories-helpers/data/product-catalog'

const ALL_PRODUCTS = Object.values(PRODUCT_NAMES).flat()

export function ProductSearchDemo({ placeholder = '搜尋商品或關鍵字' }: { placeholder?: string }) {
  const [q, setQ] = React.useState('')
  const [results, setResults] = React.useState<string[] | null>(null)
  const run = () => {
    const key = q.trim().toLowerCase()
    setResults(key ? ALL_PRODUCTS.filter((name) => name.toLowerCase().includes(key)) : [])
  }
  return (
    <div className="flex flex-col gap-[var(--layout-space-tight)]">
      <FieldControlGroup block>
        <Input
          className="!flex-1 !min-w-0"
          startIcon={Search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') run() }}
          placeholder={placeholder}
          aria-label="搜尋商品"
        />
        <Button variant="primary" onClick={run}>搜尋</Button>
      </FieldControlGroup>
      {results && (
        <p className="text-caption text-fg-secondary">
          {results.length ? `找到 ${results.length} 筆:${results.slice(0, 5).join('、')}${results.length > 5 ? '…' : ''}` : '沒有符合的商品'}
        </p>
      )}
    </div>
  )
}
