import type { Meta, StoryObj } from '@storybook/react'
import { LinkDisplay } from './link-display'

const meta: Meta<typeof LinkDisplay> = {
  title: 'Design System/Components/Fields/LinkField',
  component: LinkDisplay,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: '連結顯示元件，自動從 URL 提取 hostname，支援自訂顯示文字。用於 DataTable cell。',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof LinkDisplay>

/* ── 基本用法 ── */
export const Basic: Story = {
  name: '基本用法',
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-28">自動 hostname</span>
        <LinkDisplay value="https://www.example.com/path/to/page" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-28">自訂 label</span>
        <LinkDisplay value="https://github.com/user/repo" label="GitHub Repo" />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-28">null</span>
        <LinkDisplay value={null} />
      </div>
      <div className="flex items-center gap-3">
        <span className="text-caption text-fg-muted w-28">無效 URL</span>
        <LinkDisplay value="not-a-url" />
      </div>
    </div>
  ),
}

/* ── 截斷 ── */
export const Truncation: Story = {
  name: '截斷',
  render: () => (
    <div className="w-48 overflow-hidden">
      <LinkDisplay value="https://very-long-subdomain.example.com/extremely/long/path/that/should/truncate" />
      <p className="text-caption text-fg-muted mt-2">容器寬度有限時文字自動截斷</p>
    </div>
  ),
}
