import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, Archive, Tag as TagIcon, MoveRight, Download } from 'lucide-react'
import { BulkActionBar } from './bulk-action-bar'
import { Button } from '@/design-system/components/Button/button'
import { Alert } from '@/design-system/components/Alert/alert'

const meta: Meta<typeof BulkActionBar> = {
  title: 'Design System/Components/BulkActionBar/展示',
  component: BulkActionBar,
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof BulkActionBar>

// 真實業務 scenario:Email inbox 多選後的批次操作
export const Default: Story = {
  name: '基本',
  render: () => {
    const [selection, setSelection] = useState<string[]>(['mail-1', 'mail-2', 'mail-3'])
    return (
      <BulkActionBar
        selection={selection}
        onClear={() => setSelection([])}
        actions={
          <>
            <Button variant="tertiary" size="md" startIcon={Archive}>封存</Button>
            <Button variant="tertiary" size="md" startIcon={TagIcon}>加標籤</Button>
            <Button variant="tertiary" size="md" startIcon={MoveRight}>移動</Button>
            <Button variant="tertiary" size="md" startIcon={Trash2}>刪除</Button>
          </>
        }
      />
    )
  },
}

// @story-trait-rationale: WithFilterHidden(selection=3 + hiddenByFilter=2)retired 2026-07-17 per audit Dim 24 —
//   principles.stories.tsx HintBannerRule 第三 Rule 已用同情境(selection 3 + hiddenByFilter=2)且多教「filter hidden
//   inline 進 count 區、不開 hint banner」規則;展示版無新增約束(earn-existence 2-test 雙 NO)→ retire。
//   hiddenByFilter inline 呈現 canonical home = principles HintBannerRule。

// Hint banner via Alert primitive(擴 dataset 提示)— 對齊 ref 圖
// hint banner 唯一 trigger condition:本頁全選 + 還有 dataset 沒選到
export const WithExtendDatasetHint: Story = {
  name: '提示擴選整個資料集',
  render: () => {
    const TOTAL = 5370
    const VISIBLE = 50
    const [selection, setSelection] = useState<string[]>(
      Array.from({ length: VISIBLE }, (_, i) => `file-${i}`)
    )
    const [allSelected, setAllSelected] = useState(false)
    // **NEW fix(2026-05-04)**:Alert 必跟著 selection.length 一起 hide,否則「清除選取項目」
    // 後 selection=0 但 Alert 仍 render → 怪 state「已選取本頁全部 0 個」
    return (
      <div className="flex flex-col">
        {selection.length > 0 && (
        <Alert
          variant="info"
          placement="fixed"
          dismissible={false}
          title={
            allSelected ? (
              <>
                已選取全部 {TOTAL} 個項目。{' '}
                <button
                  type="button"
                  onClick={() => { setSelection([]); setAllSelected(false) }}
                  className="text-primary hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  清除選取項目
                </button>
              </>
            ) : (
              <>
                已選取本頁全部 {selection.length} 個。{' '}
                <button
                  type="button"
                  onClick={() => setAllSelected(true)}
                  className="text-primary hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  點此選取全部 {TOTAL} 個項目
                </button>
              </>
            )
          }
        />
        )}
        {/* 2026-05-13 fix(user 抓 Alert「已選 5370」但 BulkActionBar 顯「已選 50」):
            allSelected 時 totalSelected={TOTAL} 同步 count = 5370,標準 extend-dataset 慣用組合 */}
        <BulkActionBar
          selection={selection}
          totalSelected={allSelected ? TOTAL : undefined}
          onClear={() => { setSelection([]); setAllSelected(false) }}
          actions={
            <>
              <Button variant="tertiary" size="md" startIcon={Download}>下載</Button>
              <Button variant="tertiary" size="md" startIcon={Trash2}>刪除</Button>
            </>
          }
        />
      </div>
    )
  },
}

// 空 selection:回傳 null,不佔 layout
export const EmptySelectionHidden: Story = {
  name: '無選取時自動藏',
  render: () => (
    <div className="text-caption text-fg-muted">
      selection=[] → BulkActionBar 回傳 null,<strong>不佔 layout</strong>(對齊禁止事項 #3)
      <div className="mt-3 border border-dashed border-border-muted p-3">
        <BulkActionBar selection={[]} actions={<Button variant="tertiary" size="md">Action</Button>} />
        ↑ 這裡 BulkActionBar 完全不渲染
      </div>
    </div>
  ),
}
