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
        <h3 className="text-body-lg font-medium">產題守則(AgentDecisionCard;完整版見 agent-panel.spec.md §8)</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-secondary">
          <li>1–3 題,每題必須真的改變代理下一步;能一題就不問兩題,禁「計畫可以嗎?」類空問。</li>
          <li>一題一步:一次只顯示一題,兩題以上才顯示「n / N」;末步才「送出」,其餘「下一題」;不設上一題。</li>
          <li>題目=完整問句、以「?」結尾、句內點名決策對象(「公告要用哪種語氣?」);禁「確定嗎?」。</li>
          <li>2–4 個具名選項:標籤單行、≤10 字、無句尾標點、同題平行結構,說「選了會怎樣」;每項附一行差異描述,比同一個維度。</li>
          <li>「其他」由元件附加、永遠最後、常駐輸入格;代理不得自列「其他」;文字為空不得前進。</li>
          <li>單選必預選推薦解且排第一,「(建議)」由元件標;不可逆/安全/法律/稱謂類題用 noDefault 不預選,把後果寫進描述。</li>
          <li>單選為預設;答案本質可複選才 multiSelect,複選題選項不得互斥、不預選。</li>
          <li>跳過=用預設繼續(非取消);跳過鈕與 × 同一行為;只有這兩個出口,無 Esc、無外點關閉。</li>
          <li>題與題互不依賴;要分支就下一回合另開一張卡。題目與選項必是真實業務情境,禁 Option A/B/C。</li>
        </ul>
      </section>
      <section>
        <h3 className="text-body-lg font-medium">動態紀律</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-secondary">
          <li>標誌三態(靜止=待機/招喚/思考)定義唯一住所=agent-panel.spec.md AgentLogo 節;禁另立本體語言。</li>
          <li>呼吸包絡全家族共用:一息 3 秒,35% 吸頂、85% 回落、之後靜止空拍;呼出去的波 90% 才散盡。吸氣變亮、呼氣變暗,本體不變淡。</li>
          <li>標誌配色全部取自自家色階(藍 blue-3→7、紫 purple-3→7、陰影 purple-8、提亮 blue-2、波 blue-5→indigo-5→purple-5),機械腳本每次比對;入口鈕邊框與光圈只從 AgentLogo 的 AGENT_BRAND(blue-4 / purple-4)取色。</li>
          <li>思考:靜止起步 0.3 秒加速到 600°/s 等速,一直思考就不停;離開思考才減速、落回正位再淡入下一狀態。</li>
          <li>入口鈕可拖到左右邊收起成小鈕(方案 C):只貼左右、放開吸最近邊、點就開面板、拖回中段回右下角;位置由產品端受控保存。</li>
          <li>每次進入狀態都從靜止起跑第一口氣;標誌本體與入口鈕光圈同一拍掛上、同相。</li>
          <li>常駐 loop 遵 prefers-reduced-motion 全停,一律回靜止。</li>
        </ul>
      </section>
    </article>
  ),
}
