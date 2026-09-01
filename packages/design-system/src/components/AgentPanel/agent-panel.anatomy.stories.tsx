// 設計規格層:結構解剖 + 幾何規格(輪距/內距/尺寸);動態行為見展示層。
import type { Meta, StoryObj } from '@storybook/react'
import {
  AgentPanel,
  AgentPanelHeader,
  AgentConversation,
  AgentMessage,
  AgentToolbar,
  AgentPromptInput,
} from './agent-panel'
import { AgentLogo } from './agent-logo'

const meta: Meta<typeof AgentPanel> = {
  title: 'Design System/Components/AgentPanel/設計規格',
  component: AgentPanel,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AgentPanel>

/** Overview:三段 anatomy(Header / Conversation flex-1 / PromptInput)+ 左緣分隔線。 */
export const Overview: Story = {
  render: () => (
    <div className="flex h-dvh justify-end bg-surface-sunken">
      <AgentPanel>
        <AgentPanelHeader title="智慧代理" onNewConversation={() => {}} onClose={() => {}} />
        <AgentConversation>
          <AgentMessage role="user">我方氣泡:bg-secondary、圓角 4、內距 8/12、寬 ≤85%、靠右。</AgentMessage>
          <AgentMessage
            role="agent"
            toolbar={<AgentToolbar pinned onCopy={() => {}} onLike={() => {}} onDislike={() => {}} />}
          >
            代理回覆:無氣泡、全寬、text-body;輪距 40 = 8+24(工具列)+8,工具列絕對定位於輪距內。
          </AgentMessage>
        </AgentConversation>
        <AgentPromptInput
          value=""
          onValueChange={() => {}}
          attachments={[{ id: 'a', label: '附件列 Tag md,間距 4' }]}
        />
      </AgentPanel>
    </div>
  ),
}

/** 標誌尺寸階:16/24(簡化)vs 32/48(完整)— 光學校正分檔。 */
export const LogoSizeLadder: Story = {
  render: () => (
    <div className="flex items-end gap-8 p-12">
      {[16, 24, 32, 48].map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <AgentLogo state="still" size={size} label={`${size}px`} />
          <span className="text-caption text-fg-muted">
            {size}
            {size <= 24 ? '(簡化)' : '(完整)'}
          </span>
        </div>
      ))}
    </div>
  ),
}
