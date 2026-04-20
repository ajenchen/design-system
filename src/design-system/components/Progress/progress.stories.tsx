import type { Meta, StoryObj } from '@storybook/react'
import { Paperclip, FileText, Table as TableIcon } from 'lucide-react'
import { Progress } from './progress'

const meta: Meta<typeof Progress> = {
  title: 'Design System/Components/Progress/展示',
  component: Progress,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '量化進度（determinate progress）視覺 primitive。0–100% 已知進度、單向推進、可預期終點。未知進度用 Spinner。',
      },
    },
  },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    status: { control: 'select', options: ['primary', 'success', 'error'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    affix: { control: 'select', options: [undefined, 'value', 'status-icon'] },
  },
}
export default meta
type Story = StoryObj<typeof Progress>

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-body font-bold text-foreground mb-2">{children}</h3>
)
const SectionDesc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{children}</p>
)

// ── Default(基本範例) ──────────────────────────────────────────────────

export const Default: Story = {
  args: { value: 45, status: 'inProgress', size: 'md', affix: 'value' },
  render: (args) => (
    <div className="w-[360px]">
      <Progress {...args} />
    </div>
  ),
}

// ── 真實情境 1: 檔案上傳(Dropbox / Google Drive 模式) ────────────────────

export const FileUpload: Story = {
  name: '檔案上傳進度',
  render: () => (
    <div className="flex flex-col gap-4 w-[460px]">
      <SectionTitle>檔案上傳列表(Google Drive / Dropbox 模式)</SectionTitle>
      <SectionDesc>
        每個檔案一條 Progress。上傳中用 primary + 百分比;完成變 success + 勾;失敗變 error + 叉。不再另加一條「總進度」bar。
      </SectionDesc>
      <div className="flex flex-col gap-3 border border-border rounded-md p-4 bg-surface">
        {/* Uploading */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-body">
            <Paperclip size={16} className="text-fg-muted shrink-0" />
            <span className="flex-1 truncate">Q1_財報分析.xlsx</span>
            <span className="text-caption text-fg-muted tabular-nums">1.2 / 2.8 MB</span>
          </div>
          <Progress value={42} status="inProgress" size="md" affix="value" />
        </div>
        {/* Completed */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-body">
            <Paperclip size={16} className="text-fg-muted shrink-0" />
            <span className="flex-1 truncate">產品需求文件.pdf</span>
            <span className="text-caption text-fg-muted tabular-nums">4.1 MB</span>
          </div>
          <Progress value={100} status="success" size="md" affix="status-icon" />
        </div>
        {/* Error */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-body">
            <Paperclip size={16} className="text-fg-muted shrink-0" />
            <span className="flex-1 truncate">設計稿_v3.fig</span>
            <span className="text-caption text-error tabular-nums">網路中斷</span>
          </div>
          <Progress value={68} status="error" size="md" affix="status-icon" />
        </div>
      </div>
    </div>
  ),
}

// ── 真實情境 2: 批次任務(Linear / Jira bulk action) ────────────────────

export const BatchTask: Story = {
  name: '批次任務進度',
  render: () => (
    <div className="flex flex-col gap-4 w-[460px]">
      <SectionTitle>CSV 匯入進度(Linear bulk import / Airtable 匯入)</SectionTitle>
      <SectionDesc>
        匯入 1,250 筆客戶資料。單一 prominent 進度條使用 lg,因為使用者會盯著整個流程完成。
      </SectionDesc>
      <div className="flex flex-col gap-3 border border-border rounded-md p-5 bg-surface">
        <div className="flex items-center gap-2">
          <TableIcon size={18} className="text-primary shrink-0" />
          <span className="text-body-lg font-medium flex-1">匯入客戶名單</span>
          <span className="text-caption text-fg-muted tabular-nums">812 / 1,250 筆</span>
        </div>
        <Progress value={65} status="inProgress" size="lg" affix="value" />
        <p className="text-footnote text-fg-muted">
          處理中,請勿關閉此視窗。預計剩餘 28 秒。
        </p>
      </div>
    </div>
  ),
}

// ── 真實情境 3: DataTable cell inline 進度 ─────────────────────────────

export const InlineTableCell: Story = {
  name: 'DataTable cell 內進度',
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
          Table cell 內顯示比例用 size=sm(2px),不搶走主要欄位的閱讀重量。value affix 讓使用者快速讀數字。
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
                    <Progress value={r.quota} status={r.status} size="sm" affix="value" />
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

// ── Size 對照(sm / md / lg 在真實情境) ──────────────────────────────

export const SizeComparison: Story = {
  name: 'Size 情境對照',
  render: () => (
    <div className="flex flex-col gap-8 w-[460px]">
      <div>
        <SectionTitle>sm(2px)— Table cell 輕量指標</SectionTitle>
        <SectionDesc>密集列表內的附屬資訊,不搶走文字行高。</SectionDesc>
        <div className="flex items-center gap-3 py-2 border-t border-b border-divider">
          <span className="text-body flex-1">使用率</span>
          <div className="w-[180px]">
            <Progress value={72} size="sm" affix="value" />
          </div>
        </div>
      </div>
      <div>
        <SectionTitle>md(4px,預設)— 一般用途</SectionTitle>
        <SectionDesc>上傳列表、表單 wizard、FileItem rich mode 的預設高度。</SectionDesc>
        <Progress value={58} size="md" affix="value" />
      </div>
      <div>
        <SectionTitle>lg(6px)— Prominent card 主要進度</SectionTitle>
        <SectionDesc>匯入流程 / onboarding 等使用者正在盯著看的情境。</SectionDesc>
        <Progress value={33} size="lg" affix="value" />
      </div>
    </div>
  ),
}
