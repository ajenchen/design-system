import { Button, Separator } from '@qijenchen/design-system'
import { AlertTriangle, CheckCircle2, Clock, Truck } from 'lucide-react'
import { DASHBOARD_STATS, ORDERS } from '../data/mock'
import { OrderStatusBadge } from '../components/StatusBadge'
import type { PageId } from '../App'

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.FC<any>; color: string }) {
  return (
    <div className="rounded-lg border border-divider bg-surface p-[var(--layout-space-loose)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-caption text-fg-secondary">{label}</span>
        <Icon size={16} className={color} />
      </div>
      <div className="text-h2 font-semibold">{value}</div>
    </div>
  )
}

export function DashboardPage({ onNavigate }: { onNavigate: (id: PageId) => void }) {
  const recentOrders = ORDERS.slice(0, 4)

  return (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-loose)] space-y-6">
      <section>
        <h2 className="text-h5 font-semibold mb-3">今日概覽</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="今日訂單" value={DASHBOARD_STATS.todayOrders} icon={Clock} color="text-fg-secondary" />
          <StatCard label="待派工" value={DASHBOARD_STATS.pendingDispatch} icon={Truck} color="text-fg-secondary" />
          <StatCard label="已派工" value={DASHBOARD_STATS.dispatched} icon={CheckCircle2} color="text-fg-secondary" />
          <StatCard label="已完成" value={DASHBOARD_STATS.completed} icon={CheckCircle2} color="text-fg-secondary" />
        </div>
      </section>

      <Separator />

      {(DASHBOARD_STATS.missingHistory > 0 || DASHBOARD_STATS.dispatchAnomalies > 0) && (
        <section>
          <h2 className="text-h5 font-semibold mb-3">異常通知</h2>
          <div className="space-y-2">
            {DASHBOARD_STATS.missingHistory > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-divider bg-surface px-[var(--layout-space-loose)] py-3">
                <AlertTriangle size={16} className="text-fg-secondary shrink-0" />
                <span className="text-body flex-1">履歷缺失：{DASHBOARD_STATS.missingHistory} 道菜品尚未取得完整履歷</span>
                <Button variant="secondary" size="sm" onClick={() => onNavigate('recipe')}>查看</Button>
              </div>
            )}
            {DASHBOARD_STATS.dispatchAnomalies > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-divider bg-surface px-[var(--layout-space-loose)] py-3">
                <AlertTriangle size={16} className="text-fg-secondary shrink-0" />
                <span className="text-body flex-1">派工異常：{DASHBOARD_STATS.dispatchAnomalies} 筆派工有異常狀況</span>
                <Button variant="secondary" size="sm" onClick={() => onNavigate('dispatch')}>查看</Button>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-h5 font-semibold mb-3">各分店工單</h2>
        <div className="grid grid-cols-3 gap-3">
          {DASHBOARD_STATS.branchWorkOrders.map(b => (
            <div key={b.branch} className="rounded-lg border border-divider bg-surface p-[var(--layout-space-loose)]">
              <div className="text-body font-medium mb-1">{b.branch}</div>
              <div className="text-caption text-fg-secondary">工單 {b.count} 張 · 派工 {b.quantity} 份</div>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-h5 font-semibold">最近訂單</h2>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('orders')}>查看全部</Button>
        </div>
        <div className="rounded-lg border border-divider overflow-hidden">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-divider bg-surface-subtle">
                {['訂單編號', '客戶', '出餐日期', '數量', '狀態'].map(h => (
                  <th key={h} className="text-left px-[var(--layout-space-loose)] py-2 text-caption text-fg-secondary font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order, i) => (
                <tr key={order.id} className={i < recentOrders.length - 1 ? 'border-b border-divider' : ''}>
                  <td className="px-[var(--layout-space-loose)] py-3 font-mono text-caption">{order.id}</td>
                  <td className="px-[var(--layout-space-loose)] py-3">{order.customer}</td>
                  <td className="px-[var(--layout-space-loose)] py-3 text-fg-secondary">{order.deliveryDate}</td>
                  <td className="px-[var(--layout-space-loose)] py-3">{order.quantity} 份</td>
                  <td className="px-[var(--layout-space-loose)] py-3"><OrderStatusBadge status={order.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
