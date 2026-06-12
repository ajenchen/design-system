import { useState } from 'react'
import { Button, Checkbox, Separator, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@qijenchen/design-system'
import { AlertTriangle, ShoppingCart, Send, XCircle } from 'lucide-react'
import { DISPATCH_ITEMS, WORK_ORDERS } from '../data/mock'
import { CheckStatusBadge } from '../components/StatusBadge'
import type { PageId } from '../App'
import type { DispatchItem } from '../data/mock'

function overallStatus(item: DispatchItem): 'normal' | 'warning' | 'error' {
  if (item.ingredientCheck === 'error' || item.historyCheck === 'error' || item.capacityCheck === 'error') return 'error'
  if (item.ingredientCheck === 'warning' || item.historyCheck === 'warning' || item.capacityCheck === 'warning') return 'warning'
  return 'normal'
}

export function DispatchPage({ onNavigate }: { onNavigate: (id: PageId) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(DISPATCH_ITEMS.map(d => d.id)))
  const [dispatched, setDispatched] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function toggleItem(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectedItems = DISPATCH_ITEMS.filter(d => selected.has(d.id))
  const hasError = selectedItems.some(d => overallStatus(d) === 'error')
  const hasWarning = selectedItems.some(d => overallStatus(d) === 'warning')

  if (dispatched) {
    return (
      <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-loose)]">
        <div className="max-w-lg mx-auto text-center py-16 space-y-4">
          <div className="text-h4 font-semibold">✓ 派工成功</div>
          <p className="text-body text-fg-secondary">已建立 {WORK_ORDERS.length} 張分店工單。</p>
          <div className="rounded-lg border border-divider divide-y divide-divider text-left">
            {WORK_ORDERS.map(wo => (
              <div key={wo.id} className="px-[var(--layout-space-loose)] py-3 flex justify-between text-body">
                <span className="font-medium">{wo.branch}</span>
                <span className="text-fg-secondary">{wo.items.reduce((s, i) => s + i.quantity, 0)} 份</span>
                <CheckStatusBadge status="warning" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-center mt-6">
            <Button variant="secondary" onClick={() => onNavigate('orders')}>返回訂單</Button>
            <Button variant="primary" onClick={() => onNavigate('dashboard')}>查看 Dashboard</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-loose)] space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h5 font-semibold">派工購物車</h2>
        <div className="flex items-center gap-2 text-caption text-fg-secondary">
          <ShoppingCart size={14} />
          已選 {selected.size} / {DISPATCH_ITEMS.length} 道菜品
        </div>
      </div>

      {(hasError || hasWarning) && (
        <div className="flex items-center gap-3 rounded-lg border border-divider px-[var(--layout-space-loose)] py-3">
          <AlertTriangle size={16} className="text-fg-secondary shrink-0" />
          <span className="text-body">
            {hasError ? '有菜品存在異常，建議確認後再送出。' : '有菜品需注意，確認無誤後可繼續派工。'}
          </span>
        </div>
      )}

      <div className="rounded-lg border border-divider overflow-hidden">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-divider bg-surface-subtle">
              <th className="px-3 py-2 w-10"></th>
              {['菜品', '數量', '建議分店', '缺料', '履歷', '產能', '整體'].map(h => (
                <th key={h} className="text-left px-[var(--layout-space-loose)] py-2 text-caption text-fg-secondary font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DISPATCH_ITEMS.map((item, i) => (
              <tr key={item.id} className={[
                i < DISPATCH_ITEMS.length - 1 ? 'border-b border-divider' : '',
                !selected.has(item.id) ? 'opacity-50' : '',
              ].join(' ')}>
                <td className="px-3 py-3 text-center">
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={() => toggleItem(item.id)}
                  />
                </td>
                <td className="px-[var(--layout-space-loose)] py-3 whitespace-nowrap">
                  <div className="font-medium">{item.dishName}</div>
                  <div className="text-caption text-fg-secondary font-mono">{item.dishCode}</div>
                </td>
                <td className="px-[var(--layout-space-loose)] py-3 whitespace-nowrap">{item.quantity} 份</td>
                <td className="px-[var(--layout-space-loose)] py-3 whitespace-nowrap">{item.suggestedBranch}</td>
                <td className="px-[var(--layout-space-loose)] py-3"><CheckStatusBadge status={item.ingredientCheck} /></td>
                <td className="px-[var(--layout-space-loose)] py-3"><CheckStatusBadge status={item.historyCheck} /></td>
                <td className="px-[var(--layout-space-loose)] py-3"><CheckStatusBadge status={item.capacityCheck} /></td>
                <td className="px-[var(--layout-space-loose)] py-3"><CheckStatusBadge status={overallStatus(item)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Separator />

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => onNavigate('recipe')}>返回履歷檢查</Button>
        <Button
          variant="primary"
          startIcon={Send}
          disabled={selected.size === 0}
          onClick={() => setConfirmOpen(true)}
        >
          送出派工（{selected.size} 道）
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認送出派工</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2 text-body">
            <p>即將建立 {selectedItems.length} 道菜品的派工單。</p>
            {hasError && (
              <div className="flex items-center gap-2 text-fg-secondary">
                <XCircle size={14} />
                <span>{selectedItems.filter(d => overallStatus(d) === 'error').length} 道菜品有異常，確定繼續？</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button variant="primary" onClick={() => { setConfirmOpen(false); setDispatched(true) }}>確認派工</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
