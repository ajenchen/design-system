// @anatomy-rationale:
//   ColorMatrix / StateBehavior / Inspector N/A —— InfoTooltip 沒有 variant / color prop,顏色只有一組、狀態只有平常 / 滑過 / 聚焦三種
//   (平常 fg-muted、滑過 fg-secondary、聚焦用全域焦點框,info-tooltip.spec.md「長相與互動」),寫在 Overview 的狀態表裡就夠;
//   沒有可調的視覺參數給 Inspector。
//   本檔保留 Overview + SizeMatrix + Accessibility 三則。
import type { Meta, StoryObj } from '@storybook/react-vite'
import { InfoTooltip } from './info-tooltip'
import { H3, Desc, Td, Th } from '@/design-system/stories-helpers/anatomy/anatomy-utils'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'

const meta: Meta = {
  title: 'Design System/Components/InfoTooltip/設計規格',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

export const Overview: Story = {
  name: '元件總覽',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>Anatomy</H3>
        <Desc>一顆 <code>{'<button type="button">'}</code> 包 ⓘ 圖示,外面是 Tooltip。滑過或 Tab 聚焦時出說明;點下去不做事,所以游標是一般箭頭、不上底色。讀屏名稱就是說明文字。</Desc>
        <span className="inline-flex items-center gap-1">
          <span className="text-body text-foreground">帳單寄送 Email</span>
          <InfoTooltip info="每月帳單與付款收據會寄到這個信箱" />
        </span>
      </div>

      <div>
        <H3>Props 速查</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Prop</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              <tr><Td mono>info</Td><Td mono>string</Td><Td mono>—(必填)</Td><Td>說明文字:Tooltip 顯示的那一句,同時是讀屏名稱(同 FieldLabel 的 info);空字串時不要放這顆</Td></tr>
              <tr><Td mono>size</Td><Td mono>{"'sm' | 'md' | 'lg'"}</Td><Td mono>容器傳下來的列尺寸;沒有 = md</Td><Td>圖示照 icon tier:sm / md 16、lg 20。預設就好;覺得不夠大再自己傳</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>狀態</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>狀態</Th><Th>圖示色</Th><Th>底色</Th><Th>游標</Th></tr></thead>
            <tbody>
              <tr><Td>平常</Td><Td mono>fg-muted</Td><Td>無</Td><Td mono>cursor-default</Td></tr>
              <tr><Td>滑過</Td><Td mono>fg-secondary</Td><Td>無</Td><Td mono>cursor-default</Td></tr>
              <tr><Td>鍵盤聚焦</Td><Td mono>fg-muted</Td><Td>無(全域焦點框)</Td><Td>—</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// 尺寸對照:數值讀 ICON_SIZE(tokens/uiSize/icon-size.ts),表格不另寫一份數字
export const SizeMatrix: Story = {
  name: '尺寸對照表',
  render: () => (
    <div>
      <H3>尺寸</H3>
      <Desc>預設 md(16);放在會傳列尺寸的容器裡(Sidebar、選單 / 指令面板的內容區)跟著那個尺寸;欄位標籤裡固定 md。lg 是使用端自選:覺得不夠大再自己傳。密度不改大小。</Desc>
      <div className="overflow-x-auto">
        <table className="text-caption border-collapse">
          <thead><tr><Th>size</Th><Th>圖示</Th><Th>用在</Th><Th>範例</Th></tr></thead>
          <tbody>
            <tr>
              <Td mono>sm</Td><Td mono>{ICON_SIZE.sm}px</Td><Td>容器傳下來 sm 時(自動)</Td>
              <Td><span className="inline-flex items-center gap-1 text-body">已封存<InfoTooltip size="sm" info="封存的任務可以在封存區找回" /></span></Td>
            </tr>
            <tr>
              <Td mono>md</Td><Td mono>{ICON_SIZE.md}px</Td><Td>預設;欄位標籤裡固定這一檔</Td>
              <Td><span className="inline-flex items-center gap-1 text-body">付款方式<InfoTooltip info="信用卡到期前 30 天會寄信提醒更新" /></span></Td>
            </tr>
            <tr>
              <Td mono>lg</Td><Td mono>{ICON_SIZE.lg}px</Td><Td>容器傳下來 lg 時(自動);其他地方是使用端自選</Td>
              <Td><span className="inline-flex items-center gap-1 text-body-lg font-medium">帳單資訊<InfoTooltip size="lg" info="每月 1 號結算上個月的用量" /></span></Td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ),
}

export const Accessibility: Story = {
  name: '無障礙與鍵盤',
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="text-caption border-collapse">
          <thead><tr><Th>項目</Th><Th>行為</Th></tr></thead>
          <tbody>
            <tr><Td>元素</Td><Td>{'<button type="button">'},Tab 走得到</Td></tr>
            <tr><Td>聚焦</Td><Td>聚焦時開說明(Tooltip「A11y 預設」);Esc 收起</Td></tr>
            <tr><Td>讀屏名稱</Td><Td>aria-label = 說明文字;圖示 aria-hidden</Td></tr>
            <tr><Td>點擊</Td><Td>不做事(只會收起說明)</Td></tr>
            <tr><Td>{'放在 <label> 裡'}</Td><Td>不行:HTML 不准 {'<label>'} 裡再放按鈕,放在標籤外(FieldLabel 的做法)</Td></tr>
          </tbody>
        </table>
      </div>
    </div>
  ),
}
