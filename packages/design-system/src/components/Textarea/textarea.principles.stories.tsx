// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Textarea } from './textarea'
import { Input } from '@/design-system/components/Input/input'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { ExampleCaption, ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'

const meta: Meta = {
  title: 'Design System/Components/Textarea/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-md' })

// ── 定位與分界 ───────────────────────────────────────────────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsInputRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [comment, setComment] = React.useState('')
    const [title, setTitle] = React.useState('')
    return (
    <TutorialPage>
      <UsageSection kind="when">
        <p>多行、長文字的輸入:評論、描述、備註、bio、issue 內容;內容可能有換行或段落,使用者要邊寫邊看到全部。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Components/Textarea/展示" name="基本用法">Issue 回報、評論留言等多行輸入(基本用法)</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/Textarea/展示" name="在 Field 內">表單內的專案說明、備註欄位(在 Field 內)</StoryLink>
          </li>
        </TutorialList>
        <TutorialRule
          title="Textarea — 多行自由輸入(可能有換行、段落)"
          note="評論、描述、備註、bio、issue content 等場景:內容可能多行,使用者需要看到全貌邊寫邊 review。Enter 在 Textarea 裡是換行,不是 submit"
        >
          <ExampleGroup>
            <ExampleCaption>✅ GitHub issue 留言框</ExampleCaption>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="描述這個問題的發生步驟、預期行為、實際行為..."
              aria-label="Issue 留言"
              rows={4}
            />
          </ExampleGroup>
        </TutorialRule>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 單行內容(標題 / 姓名 / URL)用 Textarea"
          note="單行內容使用者預期 Enter 提交 form,Textarea 的 Enter 是換行會破壞預期。使用 Input,鍵盤行為對齊 form submit"
        >
          <ExampleGroup>
            <ExampleCaption>✅ 專案標題用 Input(單行,Enter 提交)</ExampleCaption>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="輸入專案名稱"
              aria-label="專案名稱"
            />
          </ExampleGroup>
          <ExampleGroup>
            <ExampleCaption warn>❌ 錯用:把單行標題做成 Textarea</ExampleCaption>
            <Textarea rows={1} placeholder="輸入專案名稱" aria-label="專案名稱（Textarea 誤用）" />
            <ExampleCaption warn>↑ 使用者按 Enter 會換行,無法提交 form</ExampleCaption>
          </ExampleGroup>
        </TutorialRule>
        <TutorialList>
          <li>數字 → NumberInput</li>
          <li>富文本 / 所見即所得編輯 → 專用的富文本編輯器:Textarea 是純文字</li>
          <li>搜尋(即使內容可能很長)→ Input 或可搜尋的下拉:搜尋慣例是單行 + 即時回饋</li>
          <li>程式碼編輯 → 專用的程式碼編輯器:Textarea 沒有語法上色與自動完成</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialList>
          <li><strong>Input</strong> —— 單行(姓名、標題、網址、搜尋),按 Enter 送出表單;Textarea 的 Enter 是換行</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
    )
  },
}


// ── Resize 行為 ───────────────────────────────────────────────────────

export const ResizeRule: Story = {
  name: '縮放只允許垂直,不允許水平',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="vertical resize — 使用者可拖下邊緣加高，但寬度固定"
        note="寬度固定保證 form 佈局不被破壞——一個 Textarea 突然變寬會推擠旁邊的 field。高度使用者可自由控制(長內容拉高比較好看)"
      >
        <Textarea
          defaultValue="拖拉右下角可以垂直 resize 這個 textarea。試試看 ↓"
          rows={3}
          aria-label="可垂直縮放的留言"
        />
        <ExampleCaption>↑ 對照 Slack message box、GitHub comment box 的行為</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 啟用 resize-x 或 resize: both"
        note="Textarea 橫向撐開會破壞 form 佈局、影響旁邊欄位。世界級 DS 都只開 vertical。TS 型別擋不了 className 覆蓋,但設計上禁止"
      >
        <ExampleCaption warn>(設計規則)不覆寫 resize-y 成 resize-x / resize-both</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── Readonly 保留邊框 ───────────────────────────────────────────────────

export const ReadonlyRule: Story = {
  name: '唯讀模式用底色標示閱讀區（不同於 Input）',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Textarea readonly 保留 padding，用底色標示閱讀區"
        note="多行內容需要明確的閱讀區域邊界——多行文字若直接攤平會跟周圍純文字區融合,讀者無法辨識「這是一個 field 的內容」還是「文章一部分」。所以 readonly 時填上 bg-readonly 底色並保留內距,圈出一塊可辨識的閱讀區。Input readonly 因為是單行,可以做得更緊湊"
      >
        <Textarea
          mode="readonly"
          defaultValue={'這是已送出的留言,現在呈現在 readonly 狀態。\n\n多行內容需要明確的閱讀區域邊界,所以 readonly 時保留內距並填上 bg-readonly 底色,圈出一塊閱讀區。'}
          rows={4}
          aria-label="已送出的留言（唯讀）"
        />
        <ExampleCaption>↑ 對照 Slack 已編輯留言 / Notion 嵌入文字塊的 readonly 呈現</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="對比:Input readonly(無邊框、緊湊)"
        note="單行內容跟文字段落視覺可分,移除邊框不會混淆。兩者的 readonly 策略差異源自「單行 vs 多行」的閱讀需求"
      >
        <Input
          mode="readonly"
          value="已送出的單行 URL:https://github.com/user/repo"
          onChange={() => {}}
          aria-label="已送出的網址（唯讀）"
        />
      </TutorialRule>
    </TutorialPage>
  ),
}

// ── Icon / endAction 禁止 ────────────────────────────────────────────

export const NoIconRule: Story = {
  name: '框內不放圖示 / endAction',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="Textarea 不支援 startIcon / endAction"
        note="Textarea 是多行閱讀區,icon 放在框內會跟多行文字位置衝突(icon 是跟第一行對齊還是 center?)。世界級 DS(Material / Chakra / Ant)textarea 都不放內嵌 icon。需要 icon 請放 Textarea 外部(例如 Field 的標題 FieldLabel 旁)"
      >
        <ExampleCaption warn>(型別設計)TextareaProps 不接受 startIcon / endAction,設計上就擋住</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="需要 action button → 放 Field 外(Textarea 下方或旁邊)"
        note="例如 comment box 的「送出」按鈕放 Textarea 下方,不塞進框內"
      >
        <div className="flex flex-col gap-[var(--layout-space-bottom)]">
          <Textarea placeholder="留下你的評論..." rows={3} aria-label="評論" />
          {/* 送出列沒有標題 → 靠左(action-bar.spec.md:109;2026-10-20 XF-01:原本 justify-end 靠右) */}
          <ButtonGroup>
            <Button variant="primary" size="sm">送出</Button>
          </ButtonGroup>
        </div>
        <ExampleCaption>↑ 按鈕在 Textarea 下方,不塞進框內</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}
