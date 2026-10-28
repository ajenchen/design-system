// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { X } from 'lucide-react'
import { FileUpload } from './file-upload'
import { FileItem } from '@/design-system/components/FileItem/file-item'
import { Button } from '@/design-system/components/Button/button'
import { Alert } from '@/design-system/components/Alert/alert'
import { Field, FieldGroup, FieldLabel } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { TutorialPage, UsageSection, TutorialList, StoryLink, createTutorialRule } from '@/design-system/stories-helpers/examples/tutorial-page'
import { ExampleCaption } from '@/design-system/stories-helpers/examples/example-captions'

const meta: Meta = {
  title: 'Design System/Components/FileUpload/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj


const TutorialRule = createTutorialRule({ examples: true, examplesClassName: 'max-w-lg' })

const noop = () => {}

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 FileUpload ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse / DropzoneVsButtonRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <TutorialPage>
      <UsageSection kind="when">
        <p>上傳檔案的入口:單檔(頭像、PDF 履歷)、批次(相簿、多個附件、批次匯入);圖片與檔案這類「拖進來」有價值的情境,滑鼠與觸控都能用。上傳後以 FileItem 清單列出。</p>
        <TutorialList>
          <li>
            <StoryLink kind="Design System/Components/FileUpload/展示" name="單檔上傳">履歷 / 大頭貼等單檔上傳</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/FileUpload/展示" name="批次上傳">相簿照片 / 多檔附件批次上傳</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/FileUpload/展示" name="內建 files 屬性">上傳後直接顯示進度清單(內建 files 屬性)</StoryLink>
          </li>
          <li>
            <StoryLink kind="Design System/Components/FileUpload/展示" name="自訂內容">品牌化上傳區 — 自訂 dropzone 內容</StoryLink>
          </li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="whenNot">
        <TutorialRule
          title="❌ 不用 FileUpload 做非檔案觸發"
          note="「點擊開啟浮層」是 Popover / Dialog 的職責,不是 FileUpload。FileUpload = 檔案專用,避免 semantic 錯位。"
        >
          <ExampleCaption warn>❌ 需要點擊開浮層 → 改用 Popover / Dialog,不要把 FileUpload 客製成選單</ExampleCaption>
        </TutorialRule>

        <TutorialRule
          title="❌ form 裡塞大 dropzone"
          note="上下欄位高度落差太大,使用者視覺節奏被打斷——這是 form field 不該出現的體積。"
        >
          <ExampleCaption warn>❌ form 內 inline 上傳欄位,不要用大 dropzone(改 variant="button")</ExampleCaption>
        </TutorialRule>
        <TutorialList>
          <li>純文字輸入(沒有檔案)→ Input / Textarea</li>
          <li>只需要點擊選檔、拖放沒有加分 → <code>variant="button"</code>:大拖放區只在「拖進來有價值」時才划算</li>
          <li>大量並列的上傳欄位(例如 10 個頭像)→ FileItem 搭配行內上傳按鈕:拖放區太大,不適合密集並列</li>
        </TutorialList>
      </UsageSection>

      <UsageSection kind="siblings">
        <TutorialRule
          title="✅ 獨立上傳頁 / 主要動作 — 用 FileUpload dropzone"
          note="拖放有價值(圖片、批次檔案、主要互動)且有足夠空間時才划算。對照:Figma 首頁 Import、Dropbox 上傳頁、Gmail compose 的附件區。"
        >
          <FileUpload
            multiple
            accept="image/*"
            title="匯入設計檔案"
            description="拖曳或點擊選取"
            onUpload={noop}
          />
        </TutorialRule>

        <TutorialRule
          title='✅ 表單內 inline field — 用 FileUpload variant="button"'
          note="form 裡和其他 field 並列時,大 dropzone 會破壞欄位節奏;variant=&quot;button&quot; 與 dropzone 共用同一套上傳邏輯(hidden input / accept / maxSize / onReject)。對照:Jira issue 附件按鈕、Stripe 發票上傳欄位——小按鈕不喧賓奪主。"
        >
          <FieldGroup className="w-full">
            <Field>
              <FieldLabel>申請人姓名</FieldLabel>
              <Input placeholder="王小明" />
            </Field>
            <Field>
              <FieldLabel>申請人身分證</FieldLabel>
              <div className="flex items-center gap-[var(--layout-space-tight)]">
                <Input className="flex-1" placeholder="A123456789" />
                <FileUpload variant="button" buttonLabel="附上照片" accept="image/*" onUpload={noop} />
              </div>
            </Field>
          </FieldGroup>
          <ExampleCaption>↑ 「附上照片」= FileUpload variant="button"——與 dropzone 同上傳邏輯,只是觸發外觀緊湊化</ExampleCaption>
        </TutorialRule>
        <TutorialList>
          <li><strong>FileItem</strong> —— 清單裡的一個檔案(狀態、進度、操作);FileUpload 是上傳入口,裡面的清單由 FileItem 組成</li>
        </TutorialList>
      </UsageSection>
    </TutorialPage>
  ),
}

export const DropzoneVisualRule: Story = {
  name: '拖放區外觀',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="❌ 不移除 dashed border(改成 solid)"
        note="dashed 是世界級 dropzone 共識(Ant / Polaris / GitHub / Figma 皆然),視覺語意是「暫時、可放下」。solid border 暗示「永久邊界」,使用者會猶豫是否能拖入。"
      >
        <ExampleCaption warn>❌ dashed border 是 affordance,不是裝飾——不可換成 solid</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="❌ 不加 scale / shadow 等裝飾性 drag-over 信號"
        note="drag-over 只用邊框顏色(border-primary-hover,底維持 surface 不變 bg)傳達狀態。加 scale 會讓區塊在拖放瞬間晃動、使用者滑鼠與 drop target 錯位;加 shadow 和元件 elevation 體系衝突。"
      >
        <div className="flex flex-col gap-[var(--layout-space-loose)]">
          <div className="border-2 border-dashed border-primary-hover bg-surface rounded-md p-[var(--layout-space-loose)] text-center text-caption text-fg-muted">
            ✅ 僅改邊框顏色(dashed primary-hover,底維持 surface)
          </div>
          <div className="border-2 border-dashed border-primary-hover bg-surface rounded-md p-[var(--layout-space-loose)] text-center text-caption text-fg-muted scale-105 shadow-[var(--elevation-200)]">
            ❌ scale + shadow — 視覺噪音,與 elevation 系統衝突
          </div>
        </div>
        <ExampleCaption warn>❌ state 信號只走 color,不走 motion / elevation</ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const MultipleRule: Story = {
  name: '多選',
  render: () => (
    <TutorialPage>
      <TutorialRule
        title="單檔(預設)— 頭像 / 履歷 / 封面照"
        note="每個欄位只收一份檔案時用預設 multiple=false。世界級對照:LinkedIn 履歷上傳、Instagram 大頭貼、Notion page cover——使用者心智模型是「這個位置放一個檔案」。"
      >
        <FileUpload
          accept="image/png,image/jpeg"
          maxSize={2_000_000}
          title="上傳大頭貼"
          description="PNG / JPG,最大 2 MB"
          onUpload={noop}
        />
        <ExampleCaption>↑ 多拖幾個只取第一個,符合 Ant Upload.Dragger / Polaris DropZone 慣例</ExampleCaption>
      </TutorialRule>

      <TutorialRule
        title="multiple — 相簿 / 附件 / 批次匯入"
        note="一次要收多份檔案時才 opt-in。世界級對照:Google Photos 匯入、Slack message 附件、Figma import assets——使用者預期「一次拖一批進來」。"
      >
        <FileUpload
          multiple
          accept="image/*"
          title="批次上傳照片"
          description="JPG / PNG / GIF,單檔最大 10 MB"
          maxSize={10_000_000}
          onUpload={noop}
        />
      </TutorialRule>

      <TutorialRule
        title="❌ 不把 multiple 當 default"
        note="單檔場景(履歷 / 大頭貼 / 封面圖)才是 80% 的使用情境。預設多檔會讓 consumer 忘記限制、後端收到多份後再截斷,UX 破裂。"
      >
        <ExampleCaption warn>
          ❌ 以為「multiple 比較彈性」就預設開,實際反而讓單檔情境出 bug。明確 opt-in 才正確
        </ExampleCaption>
      </TutorialRule>
    </TutorialPage>
  ),
}

export const DivisionOfLaborRule: Story = {
  name: '與 FileItem 的職責分工',
  render: () => {
    const [files, setFiles] = React.useState([
      { name: 'Q1-planning.pdf', description: '2.3 MB' },
      { name: 'design-review.docx', description: '540 KB' },
    ])
    return (
      <TutorialPage>
        <TutorialRule
          title="✅ FileUpload 觸發 + FileItem 顯示"
          note="本範例走 consumer 自組清單:FileUpload 負責拖放偵測 + 觸發選檔,已上傳清單由 consumer 用 FileItem map 渲染。DS 同時支援第二條路——把清單交給 FileUpload 的 files prop 內建渲染(見下一則規則);兩條路都合法,差別只在觸發與清單狀態由誰持有,重點是都不重畫 FileItem 內部視覺。這正是 Notion / Slack / Figma 的附件 flow 做法。"
        >
          {/* @layout-space-magic-ok: FileUpload → consumer 自組的 compact FileItem 清單 4px,與內建 files 清單同值(file-upload.tsx fileListClassName compact 模式 gap 4px / mt 4px;file-item.spec.md:264 List wrapper canonical) */}
          <div className="flex flex-col gap-1">
            <FileUpload
              multiple
              title="加入附件"
              description="任何檔案類型"
              onUpload={(accepted) =>
                setFiles((prev) => [
                  ...prev,
                  ...accepted.map((f) => ({
                    name: f.name,
                    description: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
                  })),
                ])
              }
            />
            {files.length > 0 && (
              // @layout-space-magic-ok: compact FileItem 清單列距 4px(file-item.spec.md:264 List wrapper canonical;layoutSpace.spec.md:113 同範疇 spec-own)
              <div className="flex flex-col gap-1">
                {files.map((f, i) => (
                  <FileItem
                    key={`${f.name}-${i}`}
                    mode="compact"
                    name={f.name}
                    actions={
                      <Button
                        variant="text"
                        size="xs"
                        iconOnly
                        startIcon={X}
                        aria-label={`移除 ${f.name}`}
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      />
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </TutorialRule>

        <TutorialRule
          title="❌ 不在 FileUpload 裡自己重刻 FileItem primitives"
          note="DS 提供兩條清單管理路徑:一是把清單交給 FileUpload 的 files prop,由它內部組合 FileItem 渲染;二是 consumer 自己用 files.map 逐項渲染 FileItem。兩條路都合法,真正禁止的是「自己重畫 FileItem 的內部視覺規格」——狀態圖示、縮圖比例、進度條、列排版都屬 FileItem 的 SSOT。世界級(Material / Ant / Carbon)也都是自己擁有清單、組合自家的 FileItem primitive,不另刻一套。"
        >
          <ExampleCaption warn>❌ 要顯示清單 → 傳 <code>files</code> prop(內建)或自組 FileItem map;但不要自己重畫 FileItem 內部結構</ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}

export const ErrorFeedbackRule: Story = {
  name: '檔案類型 + 最大尺寸 + 拒絕回呼 三配套',
  render: () => {
    const [errors, setErrors] = React.useState<string[]>([])
    return (
      <TutorialPage>
        <TutorialRule
          title="✅ 設 accept / maxSize 就一定要接 onReject"
          note="accept / maxSize 擋下的檔案 FileUpload 靜默忽略,不會自動提示使用者。consumer 必須接 onReject 並顯示 Toast / Alert——否則使用者拖了檔案什麼都沒發生,會以為是 bug。"
        >
          <FileUpload
            accept=".pdf,.doc,.docx"
            maxSize={2_000_000}
            title="上傳履歷(PDF / Word,最大 2 MB)"
            description="試試拖入 JPG 或大於 2 MB 的檔案"
            onUpload={() => setErrors([])}
            onReject={(files, reason) => {
              setErrors(
                files.map((f) =>
                  reason === 'size'
                    ? `「${f.name}」超過 2 MB 上限`
                    : `「${f.name}」格式不支援(需 PDF / Word)`,
                ),
              )
            }}
          />
          {errors.length > 0 && (
            <Alert
              variant="error"
              appearance="subtle"
              title="以下檔案無法上傳"
              description={errors.map((msg, i) => (
                <span key={i} className="block">{msg}</span>
              ))}
            />
          )}
        </TutorialRule>

        <TutorialRule
          title="❌ 設了 accept / maxSize 卻不接 onReject"
          note="使用者拖入不合格檔案後畫面毫無反應,會反覆嘗試最後放棄——這是沉默失敗,比明白拒絕還傷 UX。"
        >
          <ExampleCaption warn>
            ❌ 檔案限制必定配錯誤提示。onReject → Toast / 欄位下的 error message
          </ExampleCaption>
        </TutorialRule>
      </TutorialPage>
    )
  },
}

