// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Textarea } from './textarea'
import { Input } from '@/design-system/components/Input/input'

const meta: Meta = {
  title: 'Design System/Components/Textarea/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers ───────────────────────────────────────────────────────────────────

const Rule = ({
  title, note, children,
}: {
  title: string; note?: string; children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>}
    <div className="flex flex-col gap-3 max-w-md">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p className={`text-footnote leading-normal ${warn ? 'text-error font-medium' : 'text-fg-muted'}`}>{children}</p>
)

// ── 定位與分界 ───────────────────────────────────────────────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsInputRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [comment, setComment] = React.useState('')
    const [title, setTitle] = React.useState('')
    return (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 Textarea 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/Textarea/展示" name="基本用法"><span className="text-primary hover:underline font-medium cursor-pointer">Issue 回報、評論留言等多行輸入(基本用法)</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/Textarea/展示" name="在 Field 內"><span className="text-primary hover:underline font-medium cursor-pointer">表單內的專案說明、備註欄位(在 Field 內)</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-secondary mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,見下方與 Input 的分界示範。</p>
    </div>

      {/* vs 近親 — 原 VsInputRule */}
      <div>
        <Rule
          title="Textarea — 多行自由輸入(可能有換行、段落)"
          note="評論、描述、備註、bio、issue content 等場景:內容可能多行,使用者需要看到全貌邊寫邊 review。Enter 在 Textarea 裡是換行,不是 submit"
        >
          <div>
            <Label>✅ GitHub issue 留言框</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="描述這個問題的發生步驟、預期行為、實際行為..."
              rows={4}
            />
          </div>
        </Rule>

        <Rule
          title="❌ 單行內容(標題 / 姓名 / URL)用 Textarea"
          note="單行內容使用者預期 Enter 提交 form,Textarea 的 Enter 是換行會破壞預期。使用 Input,鍵盤行為對齊 form submit"
        >
          <div>
            <Label>✅ 專案標題用 Input(單行,Enter 提交)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="輸入專案名稱"
            />
          </div>
          <div>
            <Label warn>❌ 錯用:把單行標題做成 Textarea</Label>
            <Textarea rows={1} placeholder="輸入專案名稱" />
            <Label warn>↑ 使用者按 Enter 會換行,無法提交 form</Label>
          </div>
        </Rule>
      </div>
    </div>
    )
  },
}

// ── Resize 行為 ───────────────────────────────────────────────────────

export const ResizeRule: Story = {
  name: '縮放只允許垂直,不允許水平',
  render: () => (
    <div>
      <Rule
        title="vertical resize — 使用者可拖下邊緣加高，但寬度固定"
        note="寬度固定保證 form 佈局不被破壞——一個 Textarea 突然變寬會推擠旁邊的 field。高度使用者可自由控制(長內容拉高比較好看)"
      >
        <Textarea defaultValue="拖拉右下角可以垂直 resize 這個 textarea。試試看 ↓" rows={3} />
        <Label>↑ 對照 Slack message box、GitHub comment box 的行為</Label>
      </Rule>

      <Rule
        title="❌ 啟用 resize-x 或 resize: both"
        note="Textarea 橫向撐開會破壞 form 佈局、影響旁邊欄位。世界級 DS 都只開 vertical。TS 型別擋不了 className 覆蓋,但設計上禁止"
      >
        <Label warn>(設計規則)不覆寫 resize-y 成 resize-x / resize-both</Label>
      </Rule>
    </div>
  ),
}

// ── Readonly 保留邊框 ───────────────────────────────────────────────────

export const ReadonlyRule: Story = {
  name: '唯讀模式用底色標示閱讀區（不同於 Input）',
  render: () => (
    <div>
      <Rule
        title="Textarea readonly 保留 padding，用底色標示閱讀區"
        note="多行內容需要明確的閱讀區域邊界——多行文字若直接攤平會跟周圍純文字區融合,讀者無法辨識「這是一個 field 的內容」還是「文章一部分」。所以 readonly 時填上 bg-readonly 底色並保留內距,圈出一塊可辨識的閱讀區。Input readonly 因為是單行,可以做得更緊湊"
      >
        <Textarea mode="readonly" defaultValue={'這是已送出的留言,現在呈現在 readonly 狀態。\n\n多行內容需要明確的閱讀區域邊界,所以 readonly 時保留內距並填上 bg-readonly 底色,圈出一塊閱讀區。'} rows={4} />
        <Label>↑ 對照 Slack 已編輯留言 / Notion 嵌入文字塊的 readonly 呈現</Label>
      </Rule>

      <Rule
        title="對比:Input readonly(無邊框、緊湊)"
        note="單行內容跟文字段落視覺可分,移除邊框不會混淆。兩者的 readonly 策略差異源自「單行 vs 多行」的閱讀需求"
      >
        <Input mode="readonly" value="已送出的單行 URL:https://github.com/user/repo" onChange={() => {}} />
      </Rule>
    </div>
  ),
}

// ── Icon / endAction 禁止 ────────────────────────────────────────────

export const NoIconRule: Story = {
  name: '框內不放圖示 / endAction',
  render: () => (
    <div>
      <Rule
        title="Textarea 不支援 startIcon / endAction"
        note="Textarea 是多行閱讀區,icon 放在框內會跟多行文字位置衝突(icon 是跟第一行對齊還是 center?)。世界級 DS(Material / Chakra / Ant)textarea 都不放內嵌 icon。需要 icon 請放 Field 外(例如 Field 的 startIcon 或標題旁)"
      >
        <Label warn>(型別設計)TextareaProps 不接受 startIcon / endAction,設計上就擋住</Label>
      </Rule>

      <Rule
        title="需要 action button → 放 Field 外(Textarea 下方或旁邊)"
        note="例如 comment box 的「送出」按鈕放 Textarea 下方,不塞進框內"
      >
        <div className="flex flex-col gap-2">
          <Textarea placeholder="留下你的評論..." rows={3} />
          <div className="flex justify-end">
            <button className="px-4 py-2 text-body bg-primary text-inverse-fg rounded-md">送出</button>
          </div>
        </div>
        <Label>↑ 按鈕在 Textarea 下方,不塞進框內</Label>
      </Rule>
    </div>
  ),
}
