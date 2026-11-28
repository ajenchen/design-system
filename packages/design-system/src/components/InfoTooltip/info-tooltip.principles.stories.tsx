import type { Meta, StoryObj } from '@storybook/react-vite'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/InfoTooltip/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

const TutorialRule = createTutorialRule({ examples: true })

// 使用指引 —— 何時用 / 何時不用 / 近親分界(內容對齊 info-tooltip.spec.md「何時用」「何時不用」,不另寫一套)
export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>標題或數值旁要補一句說明、平常不想佔畫面時:滑過或 Tab 聚焦才出現,點下去不做事。</p>
        <TutorialList>
          <li><StoryLink kind="Design System/Components/InfoTooltip/展示" name="區塊標題旁">區塊標題旁</StoryLink></li>
          <li><StoryLink kind="Design System/Components/InfoTooltip/展示" name="設定區塊標題旁">設定區塊標題旁</StoryLink></li>
          <li><StoryLink kind="Design System/Components/InfoTooltip/展示" name="數值標籤旁">數值標籤旁</StoryLink></li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 欄位標籤旁不要自己放"
          note={<>用 <code>{'<FieldLabel info="…">'}</code>,它裡面就是這個元件;見{' '}
            <StoryLink kind="Design System/Components/Field/展示" name="標籤旁的說明圖示">Field 展示 → 標籤旁的說明圖示</StoryLink></>}
        />
        <TutorialRule
          title="❌ 說明超過一句、要放連結,或不看就會出錯"
          note="Tooltip 只放一句、不可互動;長的說明寫在欄位說明或頁面文字,重要的資訊直接寫在畫面上,不藏在滑過裡。"
        />
        <TutorialRule
          title="❌ 按下去要做事"
          note="開說明文件、展開面板這類會做事的,用 Button iconOnly;這顆點了不做事,所以游標是一般箭頭、不上底色。"
        />
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Tooltip</strong> —— 給已經存在的控件加提示(例:圖示按鈕的名稱);InfoTooltip 是「本身就是一顆 ⓘ」的那種</li>
          <li><strong>Button iconOnly</strong> —— 按下去會做事的圖示鈕,內建名稱提示;滑過有底色、手形</li>
          <li><strong>HoverCard</strong> —— 要放多行、連結或可互動內容時</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}
