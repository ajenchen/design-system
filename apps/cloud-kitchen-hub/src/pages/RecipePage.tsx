import { useState } from 'react'
import { Button, Separator, Steps, StepItem, StepLabel, StepDescription } from '@qijenchen/design-system'
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { RECIPES, ORDERS } from '../data/mock'
import { HistoryStatusBadge } from '../components/StatusBadge'
import type { PageId } from '../App'
import type { RecipeItem } from '../data/mock'

function RecipeCard({ recipe }: { recipe: RecipeItem }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-lg border border-divider bg-surface overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-[var(--layout-space-loose)] py-3 hover:bg-surface-subtle"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="text-caption text-fg-secondary border border-divider rounded px-2 py-0.5">{recipe.type}</span>
          <span className="text-body font-medium">{recipe.name}</span>
          <span className="text-caption text-fg-secondary font-mono">{recipe.code}</span>
        </div>
        <div className="flex items-center gap-3">
          <HistoryStatusBadge status={recipe.historyStatus} />
          {expanded ? <ChevronUp size={16} className="text-fg-secondary" /> : <ChevronDown size={16} className="text-fg-secondary" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-divider px-[var(--layout-space-loose)] py-[var(--layout-space-loose)] space-y-4">
          <div className="grid grid-cols-3 gap-4 text-body">
            <div>
              <div className="text-caption text-fg-secondary mb-1">設備</div>
              <div>{recipe.equipment}</div>
            </div>
            <div>
              <div className="text-caption text-fg-secondary mb-1">工時</div>
              <div>{recipe.laborMinutes} 分鐘</div>
            </div>
            <div>
              <div className="text-caption text-fg-secondary mb-1">烹調方式</div>
              <div>{recipe.cookingMethod}</div>
            </div>
          </div>

          <div>
            <div className="text-caption text-fg-secondary mb-2">食材清單</div>
            <div className="space-y-1">
              {recipe.ingredients.map(ing => (
                <div key={ing.name} className="flex items-center justify-between text-body py-1 border-b border-divider last:border-0">
                  <span>{ing.name}</span>
                  <span className="text-fg-secondary">{ing.grams}g</span>
                </div>
              ))}
            </div>
          </div>

          {recipe.historyStatus === 'Missing' && (
            <div className="flex items-center gap-3 rounded-lg border border-divider px-[var(--layout-space-loose)] py-3">
              <AlertTriangle size={16} className="text-fg-secondary shrink-0" />
              <span className="text-body">此菜品尚未取得完整履歷，請聯絡供應商補充。</span>
              <Button variant="secondary" size="sm" className="ml-auto shrink-0">取得履歷</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const PARSE_STEPS = [
  { value: 'receive', label: '接收訂單', description: '菜單文字輸入完成' },
  { value: 'parse', label: '解析菜單', description: '識別主菜與配菜' },
  { value: 'recipe', label: '建立 Recipe', description: '對應標準菜品代碼' },
  { value: 'history', label: '履歷檢查', description: '確認食材履歷完整性' },
]

export function RecipePage({ orderId, onNavigate }: { orderId: string | null; onNavigate: (id: PageId) => void }) {
  const order = orderId ? ORDERS.find(o => o.id === orderId) : ORDERS[0]
  const allComplete = RECIPES.every(r => r.historyStatus === 'Complete')
  const missingCount = RECIPES.filter(r => r.historyStatus === 'Missing').length

  return (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-loose)] space-y-6">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h5 font-semibold">菜單解析進度</h2>
          {order && (
            <span className="text-caption text-fg-secondary">訂單 {order.id} · {order.customer}</span>
          )}
        </div>
        <Steps
          orientation="horizontal"
          value="history"
          completedValues={['receive', 'parse', 'recipe']}
        >
          {PARSE_STEPS.map(s => (
            <StepItem key={s.value} value={s.value}>
              <StepLabel>{s.label}</StepLabel>
              <StepDescription>{s.description}</StepDescription>
            </StepItem>
          ))}
        </Steps>
      </section>

      <Separator />

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h5 font-semibold">Recipe Preview & 履歷檢查</h2>
          <div className="flex items-center gap-2 text-caption text-fg-secondary">
            {allComplete ? (
              <><CheckCircle2 size={14} />全部履歷完整</>
            ) : (
              <><AlertTriangle size={14} />{missingCount} 道菜品履歷缺失</>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {RECIPES.map(r => <RecipeCard key={r.code} recipe={r} />)}
        </div>
      </section>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => onNavigate('orders')}>返回訂單</Button>
        <Button
          variant="primary"
          disabled={!allComplete}
          onClick={() => onNavigate('dispatch')}
        >
          {allComplete ? '前往派工' : `等待 ${missingCount} 筆履歷補齊`}
        </Button>
      </div>
    </div>
  )
}
