import type { Meta, StoryObj } from '@storybook/react'
import { FileText, Table as TableIcon } from 'lucide-react'
import { ProgressBar } from './progress-bar'

const meta: Meta<typeof ProgressBar> = {
  title: 'Design System/Components/ProgressBar/展示',
  component: ProgressBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '量化 linear 進度(determinate progress)視覺 primitive。0–100% 已知進度、單向推進、可預期終點。未知進度或 inline 小空間改用 CircularProgress。',
      },
    },
  },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    status: { control: 'select', options: ['inProgress', 'success', 'error'] },
    affix: { control: 'select', options: [undefined, 'value', 'status-icon'] },
  },
}
export default meta
type Story = StoryObj<typeof ProgressBar>

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-body font-bold text-foreground mb-2">{children}</h3>
)
const SectionDesc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{children}</p>
)

// ── Default(基本範例) ──────────────────────────────────────────────────

export const Default: Story = {
  args: { value: 45, status: 'inProgress', affix: 'value' },
  render: (args) => (
    <div className="w-[360px]">
      <ProgressBar {...args} aria-label="進度 45%" />
    </div>
  ),
}

// ── 真實情境 1: 批次任務(Linear / Jira bulk action) ────────────────────
//
// ⚠️ 檔案上傳列表請改看 FileItem stories — ProgressBar 不是檔案上傳的 canonical
// consumer-facing primitive(見 spec「與 FileItem 的分界」)。

export const BatchTask: Story = {
  name: '批次任務進度',
  render: () => (
    <div className="flex flex-col gap-4 w-[460px]">
      <SectionTitle>CSV 匯入進度(Linear bulk import / Airtable 匯入)</SectionTitle>
      <SectionDesc>
        匯入 1,250 筆客戶資料。單一 prominent 進度條,使用者會盯著整個流程完成。
      </SectionDesc>
      <div className="flex flex-col gap-3 border border-border rounded-md p-5 bg-surface">
        <div className="flex items-center gap-2">
          <TableIcon size={18} className="text-primary shrink-0" />
          <span className="text-body-lg font-medium flex-1">匯入客戶名單</span>
          <span className="text-caption text-fg-muted tabular-nums">812 / 1,250 筆</span>
        </div>
        <ProgressBar value={65} status="inProgress" affix="value" />
        <p className="text-footnote text-fg-muted">
          處理中,請勿關閉此視窗。預計剩餘 28 秒。
        </p>
      </div>
    </div>
  ),
}

// ── 真實情境 3: DataTable cell inline 進度 ─────────────────────────────

export const InlineTableCell: Story = {
  name: 'DataTable 儲存格內進度',
  render: () => {
    const rows = [
      { name: 'Acme Corp 專案', quota: 45, status: 'inProgress' as const },
      { name: 'Globex 整合', quota: 78, status: 'inProgress' as const },
      { name: 'Initech 改版', quota: 100, status: 'success' as const },
      { name: 'Umbrella 導入', quota: 12, status: 'inProgress' as const },
      { name: 'Wonka 客製化', quota: 95, status: 'error' as const },
    ]
    return (
      <div className="flex flex-col gap-4 w-[560px]">
        <SectionTitle>配額使用率(DataTable inline)</SectionTitle>
        <SectionDesc>
          Table cell 內顯示配額使用率(4px 細線不搶走主要欄位的閱讀重量)。value affix 讓使用者快速讀數字。
        </SectionDesc>
        <div className="border border-border rounded-md overflow-hidden bg-surface">
          <table className="w-full text-body">
            <thead className="bg-muted text-caption text-fg-secondary">
              <tr>
                <th className="text-left px-4 py-2 font-medium">專案</th>
                <th className="text-left px-4 py-2 font-medium w-[240px]">配額使用率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-divider">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-fg-muted shrink-0" />
                      {r.name}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar value={r.quota} status={r.status} affix="value" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  },
}

