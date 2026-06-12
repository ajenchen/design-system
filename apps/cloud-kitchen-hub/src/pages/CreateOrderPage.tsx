import { useState } from 'react'
import { Button, Field, FieldLabel, FieldDescription, Input, Textarea, Select } from '@qijenchen/design-system'
import { ArrowLeft, ChevronRight } from 'lucide-react'

const CUSTOMER_OPTIONS = [
  '台積電員工餐廳',
  '聯發科技股份有限公司',
  '緯創資通股份有限公司',
  '友達光電股份有限公司',
  '台灣大哥大股份有限公司',
].map(c => ({ value: c, label: c }))

export function CreateOrderPage({ onBack }: { onBack: () => void }) {
  const [customer, setCustomer] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [quantity, setQuantity] = useState('')
  const [menuContent, setMenuContent] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-loose)]">
        <div className="max-w-lg mx-auto text-center py-16 space-y-4">
          <div className="text-h4 font-semibold text-success">✓ 訂單建立成功</div>
          <p className="text-body text-fg-secondary">
            訂單已建立，系統正在解析菜單並建立 Recipe 任務。
          </p>
          <div className="flex gap-3 justify-center mt-6">
            <Button variant="secondary" onClick={onBack}>返回訂單列表</Button>
            <Button variant="primary" endIcon={ChevronRight}>查看 Recipe 解析</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-[var(--layout-space-loose)] py-[var(--layout-space-loose)]">
      <div className="max-w-lg">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-caption text-fg-secondary hover:text-fg mb-6"
        >
          <ArrowLeft size={14} />返回訂單列表
        </button>

        <h2 className="text-h5 font-semibold mb-6">建立訂單</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field required>
            <FieldLabel>客戶</FieldLabel>
            <Select
              value={customer}
              onChange={setCustomer}
              placeholder="選擇客戶"
              options={CUSTOMER_OPTIONS}
            />
          </Field>

          <Field required>
            <FieldLabel>出餐日期</FieldLabel>
            <Input
              type="date"
              value={deliveryDate}
              onChange={e => setDeliveryDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          </Field>

          <Field required>
            <FieldLabel>數量（份）</FieldLabel>
            <Input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="例：500"
              min="1"
            />
          </Field>

          <Field required>
            <FieldLabel>菜單內容</FieldLabel>
            <FieldDescription>輸入便當名稱，系統將自動解析為標準菜品</FieldDescription>
            <Textarea
              value={menuContent}
              onChange={e => setMenuContent(e.target.value)}
              placeholder="例：香煎鯖魚便當、炸豬排便當"
              rows={4}
            />
          </Field>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onBack}>取消</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!customer || !deliveryDate || !quantity || !menuContent}
            >
              儲存並解析菜單
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
