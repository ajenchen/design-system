// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import React from 'react'
import LinkTo from '@storybook/addon-links/react'
import type { Meta, StoryObj } from '@storybook/react'
import { LinkInput } from './link-input'
import { Input } from '@/design-system/components/Input/input'

const meta: Meta = {
  title: 'Design System/Components/LinkInput/設計原則',
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

// ── 定位與分界 ─────────────────────────────────────────────────────────────

// ── UsageGuidance — 整合何時用 / 何時不用 / vs 近親(Polaris/Material/Ant 共識)
// 合併自舊 WhenToUse / VsInputRule(2026-04-26 v3 canonical)

export const UsageGuidance: Story = {
  name: '使用指引',
  render: () => {
    const [website, setWebsite] = React.useState('https://github.com')
    const [slug, setSlug] = React.useState('my-design-system')
    return (
    <div className="flex flex-col gap-12">
      {/* 何時用 — 原 WhenToUse */}
      <div className="prose prose-sm max-w-prose">
      <p>適合 LinkInput 的真實業務場景(點擊跳轉「展示」頁範例):</p>
      <ul className="space-y-1">
        <li>
          <LinkTo kind="Design System/Components/LinkInput/展示" name="空值"><span className="text-primary hover:underline font-medium cursor-pointer">空值</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/LinkInput/展示" name="Blur 驗證"><span className="text-primary hover:underline font-medium cursor-pointer">Blur 驗證</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/LinkInput/展示" name="尺寸"><span className="text-primary hover:underline font-medium cursor-pointer">尺寸</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/LinkInput/展示" name="三種模式"><span className="text-primary hover:underline font-medium cursor-pointer">三種模式</span></LinkTo>
        </li>
        <li>
          <LinkTo kind="Design System/Components/LinkInput/展示" name="Display"><span className="text-primary hover:underline font-medium cursor-pointer">Display</span></LinkTo>
        </li>
      </ul>
      <p className="text-fg-muted mt-3">判斷不確定時:對照 spec.md「何時用 / 何時不用」段;若仍不符,改用近親元件(見 <code>Vs*Rule</code> stories)。</p>
    </div>

      {/* vs 近親 — 原 VsInputRule */}
      <div>
        <Rule
          title="LinkInput — 有合法 URL 時變藍色連結，點擊開啟新分頁"
          note="個人資料的 website、文件參考連結、專案 repo URL 等場景。儲存後使用者可直接點擊連結開啟,不需要 copy + paste。右側 Pencil 才是編輯入口,點 value 永遠是開連結"
        >
          <div>
            <Label>✅ 個人資料：Website（儲存後可直接點擊開啟）</Label>
            <LinkInput value={website} onChange={setWebsite} />
          </div>
        </Rule>

        <Rule
          title="❌ 用 LinkInput 存非 URL 的字串"
          note="slug / 代號 / email / 內部 route 路徑沒有 protocol(http/https),LinkInput 的 blur 驗證會 false reject。用 Input 搭配適合的驗證"
        >
          <div>
            <Label>✅ 專案 slug 用 Input（純字串,不是 URL）</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div>
            <Label warn>❌ 錯用：把 slug 塞進 LinkInput</Label>
            <LinkInput value="my-design-system" onChange={() => {}} />
            <Label warn>↑ blur 後會出現 error 邊框,因為「my-design-system」不是合法 URL</Label>
          </div>
        </Rule>
      </div>
    </div>
    )
  },
}

// ── 兩種顯示狀態 ───────────────────────────────────────────────────────────

export const DisplayStateRule: Story = {
  name: '兩種狀態：link display / input edit',
  render: () => (
    <div>
      <Rule
        title="有合法 URL 且未編輯 → 藍色連結 + Pencil"
        note="主要顯示狀態。使用者一眼看到可點擊的連結,想改才按 Pencil。對照 Notion / Linear 的 URL field——value 展示為 link,編輯是次要動作"
      >
        <LinkInput value="https://react.dev/reference" onChange={() => {}} />
        <Label>↑ 可直接點文字開啟,Pencil 進入編輯</Label>
      </Rule>

      <Rule
        title="空值、編輯中、格式錯誤 → input 外觀"
        note="這三種場景沒有「可點擊的連結」可以展示,退回 input 形式接受輸入"
      >
        <div>
          <Label>✅ 空值：直接顯示輸入框,不需要先按 Pencil</Label>
          <LinkInput value="" onChange={() => {}} />
        </div>
      </Rule>

      <Rule
        title="❌ 點 value 進入編輯（而不是開連結）"
        note="LinkInput 跟 Input 的核心互動差異就在這——點 value 永遠是開連結。若使用者預期點 value 進入編輯,那該用 Input 不用 LinkInput"
      >
        <Label warn>（設計規則）點連結 = 開啟連結,編輯 = 按 Pencil。兩者動作路徑分離</Label>
      </Rule>
    </div>
  ),
}

// ── 驗證 ────────────────────────────────────────────────────────────────

export const ValidationRule: Story = {
  name: '驗證時機：blur，不即時',
  render: () => {
    const [url, setUrl] = React.useState('')
    return (
      <div>
        <Rule
          title="blur 時驗證，不在打字過程中"
          note="使用者還在輸入時就抱怨「格式錯」= 打擾體驗。blur(離開欄位 / 按 Enter)才檢查。開始重新編輯時清除 error,讓使用者無壓力重試。對齊 Field 系統的共用驗證規則"
        >
          <LinkInput value={url} onChange={setUrl} placeholder="輸入 URL（需含 https://）" />
          <Label>↑ 試試輸入「github.com」(無 protocol),按 Tab 離開會出現 error。重新 focus 自動清除 error</Label>
        </Rule>

        <Rule
          title="Enter 等同 blur，Escape 取消"
          note="鍵盤操作慣例:Enter 提交(觸發 blur 驗證)、Escape 回復原值。跟瀏覽器 form / 原生 input 行為一致"
        >
          <Label>Enter → 提交觸發驗證 · Escape → 回復原值不觸發驗證</Label>
        </Rule>
      </div>
    )
  },
}

// ── 空值 ──────────────────────────────────────────────────────────────

export const EmptyRule: Story = {
  name: '空值呈現',
  render: () => (
    <div>
      <Rule
        title="edit 空值 → input 外觀（可直接輸入）"
        note="沒有連結可以開,沒必要先按 Pencil。直接 input + placeholder 提示格式"
      >
        <LinkInput value="" onChange={() => {}} placeholder="https://" />
      </Rule>

      <Rule
        title="readonly 空值 → 顯示 empty placeholder（—）"
        note="table cell / 個人資料展示頁,沒填 website 時以 em-dash 表達「未填」,跟其他 Field readonly 空值呈現一致"
      >
        <LinkInput mode="readonly" value={null} />
      </Rule>
    </div>
  ),
}
