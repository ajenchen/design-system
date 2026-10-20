// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { LinkInput } from './link-input'
import { Input } from '@/design-system/components/Input/input'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/LinkInput/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-md' })

// ── 定位與分界 ─────────────────────────────────────────────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsInputRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [website, setWebsite] = React.useState('https://github.com')
    const [slug, setSlug] = React.useState('my-design-system')
    return (
    <TutorialPage>
      <UsageSection kind="when">
        <p>要儲存的完整外部網址,而且儲存後使用者會想直接點開:個人網站、文件連結、專案 repo、社群連結;需要網址格式驗證(離開欄位時檢查)。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Components/LinkInput/展示" name="空值">空值</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/LinkInput/展示" name="失焦驗證">Blur 驗證</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/LinkInput/展示" name="尺寸">尺寸</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/LinkInput/展示" name="四模式">四模式</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/LinkInput/展示" name="檢視樣式">展示樣式</StoryLink>
          </li>
        </TutorialList>
        <TutorialRule
          title="LinkInput — 有合法 URL 時變藍色連結，點擊開啟新分頁"
          note="個人資料的 website、文件參考連結、專案 repo URL 等場景。儲存後使用者可直接點擊連結開啟,不需要 copy + paste。點網址文字永遠是開連結;要改就按右側 Pencil,或點欄位裡文字以外的空白處"
        >
          <ExampleGroup>
            <ExampleCaption>✅ 個人資料：Website（儲存後可直接點擊開啟）</ExampleCaption>
            <LinkInput value={website} onChange={setWebsite} aria-label="Website" />
          </ExampleGroup>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 用 LinkInput 存非 URL 的字串"
          note="slug / 代號 / email / 內部 route 路徑沒有 protocol(http/https),LinkInput 的 blur 驗證會 false reject。用 Input 搭配適合的驗證"
        >
          <ExampleGroup>
            <ExampleCaption>✅ 專案 slug 用 Input（純字串,不是 URL）</ExampleCaption>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="專案 slug" />
          </ExampleGroup>
          <ExampleGroup>
            <ExampleCaption warn>❌ 錯用：把 slug 塞進 LinkInput</ExampleCaption>
            <LinkInput value="my-design-system" onChange={() => {}} aria-label="專案 slug（LinkInput 誤用）" />
            <ExampleCaption warn>↑ blur 後會出現 error 邊框,因為「my-design-system」不是合法 URL</ExampleCaption>
          </ExampleGroup>
        </TutorialRule>
        <TutorialList>
          <li>Email 地址 → Input(<code>type="email"</code>):Email 不是網址</li>
          <li>產品內部的路由路徑 → Input:不是完整網址,格式驗證會誤判</li>
          <li>Markdown 連結(顯示文字 + 網址)→ 自訂編輯器:LinkInput 只處理網址本身</li>
          <li>多個網址的清單 → 多個 LinkInput 或自訂清單:一個 LinkInput 一次一個網址</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Input</strong> —— 一般文字;值不是「存完要點開的完整網址」就用 Input</li>
          <li><strong>LinkInput</strong> —— 外觀同 Input,但有合法網址時顯示成藍色連結,點網址是開啟、不是進入編輯(要改按右側鉛筆)</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
    )
  },
}


// ── 兩種顯示狀態 ───────────────────────────────────────────────────────────

export const DisplayStateRule: Story = {
  name: '兩種狀態:連結顯示 / 輸入框編輯',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="有合法 URL 且未編輯 → 藍色連結 + Pencil"
        note="主要顯示狀態。使用者一眼看到可點擊的連結,想改才按 Pencil(或點欄位空白處)。對照 Notion 的 URL 屬性——點網址開啟、不進入編輯,編輯另有按鈕(https://www.notion.com/releases/2021-09-08)"
      >
        <LinkInput value="https://react.dev/reference" onChange={() => {}} aria-label="參考連結" />
        <ExampleCaption>↑ 點網址文字開啟;Pencil 或欄位裡文字以外的空白處進入編輯</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="空值、編輯中、格式錯誤 → input 外觀"
        note="這三種場景沒有「可點擊的連結」可以展示,退回 input 形式接受輸入"
      >
        <ExampleGroup>
          <ExampleCaption>✅ 空值：直接顯示輸入框,不需要先按 Pencil</ExampleCaption>
          <LinkInput value="" onChange={() => {}} aria-label="Website" />
        </ExampleGroup>
      </TutorialRule>

      <TutorialRule
        title="❌ 點 value 進入編輯（而不是開連結）"
        note="LinkInput 跟 Input 的核心互動差異就在這——點 value 永遠是開連結。若使用者預期點 value 進入編輯,那該用 Input 不用 LinkInput"
      >
        <ExampleCaption warn>（設計規則）點網址文字 = 開啟連結,編輯 = 按 Pencil 或點欄位空白處。兩者動作路徑分離</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── 驗證 ────────────────────────────────────────────────────────────────

export const ValidationRule: Story = {
  name: '驗證時機:失焦,不即時',
  render: () => {
    const [url, setUrl] = React.useState('')
    return (
      <TutorialPage>
        <TutorialRule
          title="blur 時驗證，不在打字過程中"
          note="使用者還在輸入時就抱怨「格式錯」= 打擾體驗。blur(離開欄位 / 按 Enter)才檢查。開始打字時清除 error,讓使用者無壓力重試。對齊 Field 系統的共用驗證規則"
        >
          <LinkInput value={url} onChange={setUrl} placeholder="輸入 URL（需含 https://）" aria-label="Website" />
          <ExampleCaption>↑ 試試輸入「github.com」(無 protocol),按 Tab 離開會出現 error。開始打字自動清除 error</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="Enter 等同 blur，Escape 取消"
          note="鍵盤操作慣例:Enter 提交(觸發 blur 驗證)、Escape 回復原值。跟瀏覽器 form / 原生 input 行為一致"
        >
          <ExampleCaption>Enter → 提交觸發驗證 · Escape → 回復原值不觸發驗證</ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}

// ── 空值 ──────────────────────────────────────────────────────────────

export const EmptyRule: Story = {
  name: '空值呈現',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="edit 空值 → input 外觀（可直接輸入）"
        note="沒有連結可以開,沒必要先按 Pencil。直接 input + placeholder 提示格式"
      >
        <LinkInput value="" onChange={() => {}} placeholder="https://" aria-label="Website" />
      </TutorialRule>

      <TutorialRule
        title="readonly 空值 → 顯示半形連字號（-）"
        note="table cell / 個人資料展示頁,沒填 website 時以半形連字號 - 表達「未填」,跟其他 Field readonly 空值呈現一致"
      >
        <LinkInput mode="readonly" value={null} />
      </TutorialRule>
    </TutorialPage>
  ),
}
