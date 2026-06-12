import { Tag } from '@qijenchen/design-system'
import type { OrderStatus } from '../data/mock'

// Tag color: neutral | blue | green | red | orange | yellow | purple | ...
// OrderStatus → Tag color mapping (categorical, not semantic state tokens)
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { color: 'neutral' | 'blue' | 'green' | 'orange' | 'purple' }> = {
    'Draft':              { color: 'neutral' },
    'Recipe Parsing':     { color: 'blue' },
    'Ready For Dispatch': { color: 'orange' },
    'Dispatched':         { color: 'purple' },
    'Completed':          { color: 'green' },
  }
  return <Tag color={map[status].color} size="sm">{status}</Tag>
}

export function CheckStatusBadge({ status }: { status: 'normal' | 'warning' | 'error' }) {
  if (status === 'normal')  return <Tag color="green" size="sm">正常</Tag>
  if (status === 'warning') return <Tag color="orange" size="sm">注意</Tag>
  return <Tag color="red" size="sm">異常</Tag>
}

export function HistoryStatusBadge({ status }: { status: 'Complete' | 'Missing' }) {
  return <Tag color={status === 'Complete' ? 'green' : 'red'} size="sm">
    {status === 'Complete' ? '履歷完整' : '履歷缺失'}
  </Tag>
}
