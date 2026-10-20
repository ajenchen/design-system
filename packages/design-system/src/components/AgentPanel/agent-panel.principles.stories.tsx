// 設計原則層:使用指引(固定三段)+ 決策卡出題守則(內容準則)+ 動態規則 —— 2026-10-20 前三者擠在使用指引裡(T4)
import type { Meta, StoryObj } from '@storybook/react'
import { TutorialPage, UsageSection, TutorialList } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/AgentPanel/設計原則',
  parameters: { layout: 'padded' },
}
export default meta

export const UsageGuidance: StoryObj = {
  name: '使用指引',
  render: () => (
    <TutorialPage className="max-w-2xl">
      <UsageSection kind="when">
        <TutorialList>
          <li>產品頁右側需要常駐、可開合的智慧代理對話(任務助理、資料問答、批次操作代理)。</li>
          <li>代理需要人類拍板時(AgentDecisionCard)、回顧歷史對話時(歷史浮層)。</li>
          <li>頁面需要全域入口喚起代理(AgentFab,含有新訊招喚)。</li>
        </TutorialList>
      </UsageSection>
      <UsageSection kind="whenNot">
        <TutorialList>
          <li>單次確認 / 破壞性確認 → Dialog(要擋住畫面讓人決定,不是代理協作)。</li>
          <li>靜態說明 / 導覽提示 → Coachmark / Tooltip(沒有對話來回)。</li>
          <li>全螢幕沉浸式的對話產品 → 產品自建頁面(面板是側欄輔助,不是主畫面)。</li>
          <li>一般表單輸入 → Field 家族(AgentPromptInput 是代理專用的複合輸入盒,不是通用欄位)。</li>
        </TutorialList>
      </UsageSection>
      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Sheet</strong> —— 只有外觀像:面板和主畫面同時可操作(並排或浮層),Sheet 是蓋住主畫面的浮層;面板不得改用 Sheet 承載。</li>
          <li><strong>Dialog</strong> —— 需要人停下來單次確認用 Dialog;代理需要人拍板、而且要留在對話脈絡裡,用面板裡的決策卡(AgentDecisionCard)。</li>
          <li><strong>Chip / Tag(附件)</strong> —— 訊息裡的附件 = Chip(點了開啟,按鈕語意);輸入中的附件 = Tag(可移除),兩者不互換。</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const ContentGuidelines: StoryObj = {
  name: '決策卡出題守則',
  render: () => (
    <TutorialPage className="max-w-2xl">
      <TutorialList>
        <li>1–3 題,每題必須真的改變代理下一步;能一題就不問兩題,禁「計畫可以嗎?」類空問。</li>
        <li>一題一步:一次只顯示一題,兩題以上才顯示「n / N」;第一題左鈕=跳過(用預設繼續),第二題起左鈕=上一題(答案保留、不可跳題);右鈕=下一題,末步=送出。</li>
        <li>題目=完整問句、以「?」結尾、句內點名決策對象(「公告要用哪種語氣?」);禁「確定嗎?」。</li>
        <li>2–4 個具名選項:標籤單行、≤10 字、無句尾標點、同題平行結構,說「選了會怎樣」;每項附一行差異描述,比同一個維度。</li>
        <li>「其他」由元件附加、永遠最後、常駐輸入格;代理不得自列「其他」;文字為空不得前進。</li>
        <li>單選必預選推薦解且排第一,「(建議)」由元件標;不可逆/安全/法律/稱謂類題用 noDefault 不預選,把後果寫進描述。</li>
        <li>單選為預設;答案本質可複選才 multiSelect,複選題選項不得互斥、不預選。</li>
        <li>跳過=用預設繼續(非取消);header × 恆為跳過,第一題另有跳過鈕;無 Esc、無外點關閉。</li>
        <li>題與題互不依賴;要分支就下一回合另開一張卡。題目與選項必是真實業務情境,禁 Option A/B/C。</li>
      </TutorialList>
    </TutorialPage>
  ),
}

export const MotionRule: StoryObj = {
  name: '動態規則',
  render: () => (
    <TutorialPage className="max-w-2xl">
      <TutorialList>
        <li>標誌三態(靜止=待機 / 招喚 / 思考)只有一份定義(AgentLogo),不另立一套本體動態語言。</li>
        <li>呼吸包絡全家族共用:一息 3 秒,35% 吸頂、85% 回落、之後靜止空拍;呼出去的波 90% 才散盡。吸氣變亮、呼氣變暗,本體不變淡。</li>
        <li>標誌配色全部取自自家色階(藍 blue-3→7、紫 purple-3→7、陰影 purple-8、提亮 blue-2、波 blue-5→indigo-5→purple-5),機械腳本每次比對;入口鈕邊框與光圈只從 AgentLogo 的 AGENT_BRAND(blue-4 / purple-4)取色。</li>
        <li>思考:靜止起步半圈時間加速到 0.75 秒一圈(快檔上緣,不慌不懶),一直思考就不停;離開思考才減速、落回正位再淡入下一狀態。</li>
        <li>入口鈕的標誌 = <b>面板裡那個代理當下的狀態</b>(<code>logoState</code>,與面板標題列同名 prop):代理在回覆時即使面板關著、入口鈕也在轉,回覆完轉招喚態提醒回來看。</li>
        <li>入口鈕只有「家」(右下角 40 圓鈕)與「貼邊」(右緣中線以下 28 半圓,只有高度可調)兩種位置;拖 40 圓鈕時右緣帶(寬 36、從視窗中線到家上方一個 loose)亮出 drop-target 半透明藍底 + 三邊虛線框(貼右緣那側不畫),進帶預覽就貼在右緣、放開落定,帶外放開飛回家;兩種形態點一下都直接開面板;位置由產品端受控保存。</li>
        <li>每次進入狀態都從靜止起跑第一口氣;標誌本體與入口鈕光圈同一拍掛上、同相。</li>
        <li>常駐 loop 遵 prefers-reduced-motion 全停,一律回靜止。</li>
      </TutorialList>
    </TutorialPage>
  ),
}
