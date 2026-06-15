// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { X } from 'lucide-react'
import { FileUpload } from './file-upload'
import { FileItem } from '@/design-system/components/FileItem/file-item'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'

const meta: Meta = {
  title: 'Design System/Components/FileUpload/設計原則',
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj

// ── Helpers (inline, follow button.principles.stories.tsx) ────────────────────

const Rule = ({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) => (
  <div className="mb-14">
    <h3 className="text-body font-bold text-foreground mb-1">{title}</h3>
    {note && (
      <p className="text-caption text-fg-muted mb-5 max-w-[720px] leading-relaxed">{note}</p>
    )}
    <div className="flex flex-col gap-3 max-w-lg">{children}</div>
  </div>
)

const Label = ({ children, warn }: { children: React.ReactNode; warn?: boolean }) => (
  <p
    className={`text-footnote leading-normal ${
      warn ? 'text-error font-medium' : 'text-fg-muted'
    }`}
  >
    {children}
  </p>
)

const noop = () => {}

// ── Stories ───────────────────────────────────────────────────────────────────

// ── WhenToUse — 何時使用 FileUpload ──────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / WhenNotToUse / DropzoneVsButtonRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 FileUpload 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/FileUpload/展示" name="單檔上傳"><span className="text-primary hover:underline font-medium cursor-pointer">履歷 / 大頭貼等單檔上傳</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/FileUpload/展示" name="批次上傳"><span className="text-primary hover:underline font-medium cursor-pointer">相簿照片 / 多檔附件批次上傳</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/FileUpload/展示" name="內建 files 屬性"><span className="text-primary hover:underline font-medium cursor-pointer">上傳後直接顯示進度清單(內建 files 屬性)</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/FileUpload/展示" name="自訂內容"><span className="text-primary hover:underline font-medium cursor-pointer">品牌化上傳區 — 自訂 dropzone 內容</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* 何時不用 / 替代元件 — 原 WhenNotToUse */}
      <div>
      <Rule
        title="❌ 不移除 dashed border(改成 solid)"
        note="dashed 是世界級 dropzone 共識(Ant / Polaris / GitHub / Figma 皆然),視覺語意是「暫時、可放下」。solid border 暗示「永久邊界」,使用者會猶豫是否能拖入。"
      >
        <Label warn>⚠️ dashed border 是 affordance,不是裝飾——不可換成 solid</Label>
      </Rule>

      <Rule
        title="❌ 不加 scale / shadow 等裝飾性 drag-over 信號"
        note="drag-over 只用邊框顏色(border-primary,底維持 surface 不變 bg)傳達狀態。加 scale 會讓區塊在拖放瞬間晃動、使用者滑鼠與 drop target 錯位;加 shadow 和元件 elevation 體系衝突。"
      >
        <div className="flex flex-col gap-2">
          <div className="border-2 border-dashed border-primary bg-surface rounded-md px-6 py-10 text-center text-caption text-fg-muted">
            ✓ 僅改邊框顏色(dashed primary,底維持 surface)
          </div>
          <div className="border-2 border-dashed border-primary bg-surface rounded-md px-6 py-10 text-center text-caption text-fg-muted scale-105 shadow-[var(--elevation-200)]">
            ✗ scale + shadow — 視覺噪音,與 elevation 系統衝突
          </div>
        </div>
        <Label warn>⚠️ state 信號只走 color,不走 motion / elevation</Label>
      </Rule>

      <Rule
        title="❌ 不用 FileUpload 做非檔案觸發"
        note="「點擊開啟浮層」是 Popover / Dialog 的職責,不是 FileUpload。FileUpload = 檔案專用,避免 semantic 錯位。"
      >
        <Label warn>⚠️ 需要點擊開浮層 → 改用 Popover / Dialog,不要把 FileUpload 客製成選單</Label>
      </Rule>
    </div>

      {/* vs 近親 — DropzoneVsButtonRule — 原 DropzoneVsButtonRule */}
      <div>
      <Rule
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
      </Rule>

      <Rule
        title='✅ 表單內 inline field — 用 FileUpload variant="button"'
        note="form 裡和其他 field 並列時,大 dropzone 會破壞欄位節奏;variant=&quot;button&quot; 與 dropzone 共用同一套上傳邏輯(hidden input / accept / maxSize / onReject)。對照:Jira issue 附件按鈕、Stripe 發票上傳欄位——小按鈕不喧賓奪主。"
      >
        <div className="flex flex-col gap-3 w-full">
          <Field>
            <FieldLabel>申請人姓名</FieldLabel>
            <Input placeholder="王小明" />
          </Field>
          <Field>
            <FieldLabel>申請人身分證</FieldLabel>
            <div className="flex items-center gap-2">
              <Input className="flex-1" placeholder="A123456789" />
              <FileUpload variant="button" buttonLabel="附上照片" accept="image/*" onUpload={noop} />
            </div>
          </Field>
        </div>
        <Label>↑ 「附上照片」= FileUpload variant="button"——與 dropzone 同上傳邏輯,只是觸發外觀緊湊化</Label>
      </Rule>

      <Rule
        title="❌ form 裡塞大 dropzone"
        note="上下欄位高度落差太大,使用者視覺節奏被打斷——這是 form field 不該出現的體積。"
      >
        <Label warn>⚠️ form 內 inline 上傳欄位,不要用大 dropzone(改 variant="button")</Label>
      </Rule>
    </div>
    </div>
  ),
}

export const MultipleRule: Story = {
  name: '多選',
  render: () => (
    <div>
      <Rule
        title="單檔(預設)— 頭像 / 履歷 / 封面照"
        note="每個欄位只收一份檔案時用預設 multiple=false。世界級對照:LinkedIn 履歷上傳、Instagram 大頭貼、Notion page cover——使用者心智模型是「這個位置放一個檔案」。"
      >
        <FileUpload
          accept=".pdf,.doc,.docx"
          maxSize={5_000_000}
          title="上傳履歷"
          description="PDF / Word,最大 5 MB"
          onUpload={noop}
        />
        <Label>↑ 多拖幾個只取第一個,符合 Ant Upload.Dragger / Polaris DropZone 慣例</Label>
      </Rule>

      <Rule
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
      </Rule>

      <Rule
        title="❌ 不把 multiple 當 default"
        note="單檔場景(履歷 / 大頭貼 / 封面圖)才是 80% 的使用情境。預設多檔會讓 consumer 忘記限制、後端收到多份後再截斷,UX 破裂。"
      >
        <Label warn>
          ⚠️ 以為「multiple 比較彈性」就預設開,實際反而讓單檔情境出 bug。明確 opt-in 才正確
        </Label>
      </Rule>
    </div>
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
      <div>
        <Rule
          title="✅ FileUpload 觸發 + FileItem 顯示"
          note="FileUpload 只負責「拖放偵測 + 觸發選檔」,已上傳檔案清單由 consumer 用 FileItem map 渲染——兩個元件各司其職,職責清楚。這正是 Notion / Slack / Figma 的附件 flow 做法。"
        >
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
        </Rule>

        <Rule
          title="❌ 不在 FileUpload 裡自己重刻 FileItem primitives"
          note="2026-04-24 設計準則更新:DS 提供 dual path — FileUpload 可 own list via `files` prop(內部 compose `<FileItem>`);OR consumer 自組 `{files.map(f => <FileItem ... />)}`。禁止的是「自畫 status icon / thumbnail / progress bar / row layout 等 FileItem primitives 視覺規格」。世界級(Material / Ant / Carbon)都 own list composing 自家 FileItem primitive。"
        >
          <Label warn>⚠️ 要顯示清單 → 傳 `files` prop(DS built-in)OR 自組 FileItem map;但不要自己重畫 FileItem 內部結構</Label>
        </Rule>
      </div>
    )
  },
}

export const ErrorFeedbackRule: Story = {
  name: '檔案類型 + 最大尺寸 + 拒絕回呼 三配套',
  render: () => {
    const [errors, setErrors] = React.useState<string[]>([])
    return (
      <div>
        <Rule
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
            <div className="rounded-md border border-error bg-error-subtle px-3 py-2 text-caption text-error-text">
              {errors.map((msg, i) => (
                <div key={i}>{msg}</div>
              ))}
            </div>
          )}
        </Rule>

        <Rule
          title="❌ 設了 accept / maxSize 卻不接 onReject"
          note="使用者拖入不合格檔案後畫面毫無反應,會反覆嘗試最後放棄——這是沉默失敗,比明白拒絕還傷 UX。"
        >
          <Label warn>
            ⚠️ 檔案限制必定配錯誤提示。onReject → Toast / 欄位下的 error message
          </Label>
        </Rule>
      </div>
    )
  },
}

