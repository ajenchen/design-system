import { Tag } from '@qijenchen/design-system'
import { BRANCHES } from '../data/mock'

export function SettingsPage() {
  return (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-loose)] space-y-8">
      <section>
        <h2 className="text-h5 font-semibold mb-4">分店管理</h2>
        <div className="grid gap-3">
          {BRANCHES.map(branch => (
            <div key={branch.id} className="rounded-lg border border-divider bg-surface px-[var(--layout-space-loose)] py-[var(--layout-space-loose)]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-body font-medium">{branch.name}</span>
                <Tag color="neutral" size="sm">容量 {branch.capacity} 份/日</Tag>
              </div>
              <div className="flex flex-wrap gap-2">
                {branch.equipment.map(eq => (
                  <span key={eq} className="text-caption bg-surface-subtle border border-divider rounded px-2 py-0.5">{eq}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-h5 font-semibold mb-4">生產規則</h2>
        <div className="rounded-lg border border-divider overflow-hidden">
          {[
            { rule: '每日最大派工量', value: '2,000 份' },
            { rule: '履歷缺失時', value: '阻擋派工' },
            { rule: '缺料警示門檻', value: '低於安全庫存 20%' },
            { rule: '自動分配分店', value: '依照設備 + 產能' },
          ].map((item, i, arr) => (
            <div key={item.rule} className={`flex items-center justify-between px-[var(--layout-space-loose)] py-3 ${i < arr.length - 1 ? 'border-b border-divider' : ''}`}>
              <span className="text-body text-fg-secondary">{item.rule}</span>
              <span className="text-body font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
