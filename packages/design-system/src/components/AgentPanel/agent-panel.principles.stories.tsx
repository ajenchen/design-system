// 設計原則層:何時用/何時不用 + 手足分界(單篇 UsageGuidance 即足,per story-rules)。
import type { Meta, StoryObj } from '@storybook/react'

const meta: Meta = {
  title: 'Design System/Components/AgentPanel/設計原則',
  parameters: { layout: 'padded' },
}
export default meta

export const UsageGuidance: StoryObj = {
  name: '使用指引',
  render: () => (
    <article className="max-w-2xl space-y-6 text-body text-foreground">
      <section>
        <h3 className="text-body-lg font-medium">何時用</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-secondary">
          <li>產品頁右側需要常駐可開合的智慧代理對話(任務助理、資料問答、批次操作代理)。</li>
          <li>代理需要人類拍板時(AgentDecisionCard)、回顧歷史對話時(歷史浮層)。</li>
          <li>頁面需要全域入口喚起代理(AgentFab,含有新訊招喚)。</li>
        </ul>
      </section>
      <section>
        <h3 className="text-body-lg font-medium">何時不用(手足分界)</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-secondary">
          <li>單次確認/破壞性確認 → Dialog(阻擋語意屬 modal,非代理協作卡)。</li>
          <li>靜態說明/導覽提示 → Coachmark / Tooltip(無對話回合)。</li>
          <li>一般表單輸入 → Field 家族(AgentPromptInput 是代理複合輸入盒,非通用欄位)。</li>
          <li>訊息內附件=Chip assist(按鈕語意);輸入中附件=Tag(可移除)——兩者不可互換。</li>
        </ul>
      </section>
      <section>
        <h3 className="text-body-lg font-medium">動態紀律</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-secondary">
          <li>標誌三態(靜止=待機/招喚/思考)定義唯一住所=agent-panel.spec.md AgentLogo 節;禁另立本體語言。</li>
          <li>常駐 loop 遵 prefers-reduced-motion 全停,一律回靜止。</li>
        </ul>
      </section>
    </article>
  ),
}
