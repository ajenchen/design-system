import { useState } from 'react'
import { Button, Input } from '@qijenchen/design-system'
import { Plus, Search } from 'lucide-react'
import { ORDERS } from '../data/mock'
import { OrderStatusBadge } from '../components/StatusBadge'
import type { PageId } from '../App'
import type { OrderStatus } from '../data/mock'

const STATUS_FILTERS: (OrderStatus | 'All')[] = ['All', 'Draft', 'Recipe Parsing', 'Ready For Dispatch', 'Dispatched', 'Completed']

export function OrderListPage({ onNavigate }: { onNavigate: (id: PageId, orderId?: string) => void }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'All'>('All')

  const filtered = ORDERS.filter(o => {
    const matchSearch = o.customer.includes(search) || o.id.includes(search)
    const matchStatus = statusFilter === 'All' || o.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-loose)] space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h5 font-semibold">訂單列表</h2>
        <Button variant="primary" size="sm" startIcon={Plus} onClick={() => onNavigate('create-order')}>
          建立訂單
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary pointer-events-none" />
          <Input
            placeholder="搜尋客戶或訂單編號"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={[
                'px-3 py-1 rounded-full text-caption border transition-colors',
                statusFilter === s
                  ? 'bg-fg text-bg border-fg'
                  : 'bg-surface border-divider text-fg-secondary hover:border-fg-secondary',
              ].join(' ')}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-divider overflow-hidden">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-divider bg-surface-subtle">
              {['訂單編號', '客戶', '出餐日期', '數量', '菜單內容', '狀態', '操作'].map(h => (
                <th key={h} className="text-left px-[var(--layout-space-loose)] py-2 text-caption text-fg-secondary font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((order, i) => (
              <tr key={order.id} className={i < filtered.length - 1 ? 'border-b border-divider hover:bg-surface-subtle' : 'hover:bg-surface-subtle'}>
                <td className="px-[var(--layout-space-loose)] py-3 font-mono text-caption whitespace-nowrap">{order.id}</td>
                <td className="px-[var(--layout-space-loose)] py-3 whitespace-nowrap">{order.customer}</td>
                <td className="px-[var(--layout-space-loose)] py-3 text-fg-secondary whitespace-nowrap">{order.deliveryDate}</td>
                <td className="px-[var(--layout-space-loose)] py-3 whitespace-nowrap">{order.quantity} 份</td>
                <td className="px-[var(--layout-space-loose)] py-3 text-fg-secondary max-w-[200px] truncate">{order.menuContent}</td>
                <td className="px-[var(--layout-space-loose)] py-3 whitespace-nowrap"><OrderStatusBadge status={order.status} /></td>
                <td className="px-[var(--layout-space-loose)] py-3 whitespace-nowrap">
                  {order.status === 'Ready For Dispatch' && (
                    <Button variant="secondary" size="sm" onClick={() => onNavigate('dispatch')}>派工</Button>
                  )}
                  {(order.status === 'Recipe Parsing' || order.status === 'Draft') && (
                    <Button variant="secondary" size="sm" onClick={() => onNavigate('recipe', order.id)}>查看 Recipe</Button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-[var(--layout-space-loose)] py-8 text-center text-fg-secondary">
                  無符合條件的訂單
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
