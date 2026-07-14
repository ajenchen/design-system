// @story-trait-rationale: hasVariants/hasInteractiveStates 的 canonical core stories(AllVariants / States)
//   集中在 anatomy.stories.tsx 的 ColorMatrix + StateBehavior(Inspector 互動);本 showcase
//   提供真實業務 scenario(部署 / 系統警示)而非 trait grid 重複展示。
import type { Meta } from '@storybook/react'
import { RefreshCw, Share2, X as XIcon } from 'lucide-react'
import { Alert } from './alert'
import { Button } from '@/design-system/components/Button/button'
import { ButtonDivider } from '@/design-system/components/Button/button-group'
import type { NoticeVariant } from '@/design-system/components/Notice/notice'

const meta: Meta = {
  title: 'Design System/Components/Alert/展示',
  parameters: { layout: 'padded' },
}
export default meta

const ALL: NoticeVariant[] = ['neutral', 'info', 'warning', 'error', 'success']
// 真實情境的 title(「人」test:遮 variant 標籤也看得懂)
const L: Record<string, string> = {
  neutral: '已切換至離線模式',
  info: 'v2.4 已發佈',
  warning: '免費額度剩 3 天',
  error: '付款失敗',
  success: '部署完成',
}
// description 用簡潔的輔助資訊(非 variant 名稱)
const D: Record<string, string> = {
  neutral: '變更會在重新連線後同步',
  info: '查看更新日誌了解新功能',
  warning: '升級方案以避免服務中斷',
  error: '請檢查卡號或改用其他付款方式',
  success: 'v2.4.1 已上線到 production',
}

const actionBtn = <Button variant="tertiary" size="xs">查看詳情</Button>

// 2026-07-14 audit Dim 28(story 拆分原則):原 Subtle/Solid × SingleLine/WithDescription
// 四 story 依 appearance variant 拆細 = 「≥2 variants 拆細」反 pattern(該合對照 grid);
// 合併為單行 / 含說明兩 story,各以 subtle vs solid 並排對照(appearance trait grid 本體
// 由 anatomy ColorMatrix owns)。
export const SingleLine = {
  name: '單行（低調 vs 實心對照）',
  render: () => (
    <div className="grid grid-cols-2 gap-6 max-w-5xl">
      {(['subtle', 'solid'] as const).map((appearance) => (
        <div key={appearance} className="flex flex-col gap-3">
          <span className="text-caption text-fg-muted font-medium">
            {appearance === 'subtle' ? 'Subtle — 頁面內嵌預設(淺底 + 邊框)' : 'Solid — 高強調(飽和底色)'}
          </span>
          {ALL.map((v) => <Alert key={v} variant={v} appearance={appearance} title={L[v]} endContent={actionBtn} />)}
        </div>
      ))}
    </div>
  ),
}

export const WithDescription = {
  name: '含說明文字（低調 vs 實心對照）',
  render: () => (
    <div className="grid grid-cols-2 gap-6 max-w-5xl">
      {(['subtle', 'solid'] as const).map((appearance) => (
        <div key={appearance} className="flex flex-col gap-3">
          <span className="text-caption text-fg-muted font-medium">
            {appearance === 'subtle' ? 'Subtle — 頁面內嵌預設(淺底 + 邊框)' : 'Solid — 高強調(飽和底色)'}
          </span>
          {ALL.map((v) => <Alert key={v} variant={v} appearance={appearance} title={L[v]} description={D[v]} endContent={actionBtn} />)}
        </div>
      ))}
    </div>
  ),
}

export const CornerActionGroup = {
  name: '右上角操作群組',
  render: () => (
    <div className="flex flex-col gap-4 max-w-lg">
      <span className="text-caption text-fg-muted">
        Alert 右上角是操作按鈕群組。關閉鈕左側可以並排重新整理、分享等額外按鈕,中間用分隔線分群,全部用同一種最小尺寸的純圖示按鈕。
        Alert 本身只內建單一關閉鈕,要放多個角落按鈕時由使用端自己組合呈現。
      </span>

      <div className="relative">
        <Alert
          variant="warning"
          appearance="subtle"
          title="部署管線偵測到新的 commit"
          description="點「重新整理」同步最新狀態,或忽略此訊息繼續目前作業。"
          dismissible={false}
        />
        {/* @story-trait-rationale: scenario showcase 沒 AllVariants/States,trait grid 在 anatomy */}
        <div className="absolute top-3 right-4 flex items-center gap-2">
          {/* 角落操作群組:全部用最小尺寸按鈕(同尺寸才一致),
              ButtonDivider 自帶 mx-1(左右各 4px)當分隔間距(對齊 button-group 主檔)*/}
          <Button iconOnly size="xs" variant="text" startIcon={RefreshCw} aria-label="重新整理" />
          <Button iconOnly size="xs" variant="text" startIcon={Share2} aria-label="分享連結" />
          <ButtonDivider />
          <Button iconOnly dismiss size="xs" startIcon={XIcon} aria-label="關閉通知" />
        </div>
      </div>

      <span className="text-caption text-fg-muted">
        ✅ 右上角這排(重新整理、分享、關閉)全用同一種最小尺寸的純圖示按鈕,並用分隔線分成兩群,保持同一列視覺一致。
        ❌ 不要一群用純圖示按鈕、另一群用列內動作,會不整齊。
      </span>
    </div>
  ),
}

export const Fixed = {
  name: '固定顯示',
  render: () => (
    <div className="flex flex-col gap-6">
      <span className="text-caption text-fg-muted">固定在 header 底下,無圓角,full-width。</span>

      <div className="flex flex-col gap-1">
        <span className="text-caption text-fg-muted font-medium">Subtle Fixed</span>
        <div className="border border-divider rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-surface border-b border-divider">
            <span className="text-body font-medium">專案設定</span>
          </div>
          {ALL.map((v) => <Alert key={v} variant={v} appearance="subtle" placement="fixed" title={L[v]} />)}
          <div className="p-4 text-fg-muted text-caption">調整此專案的權限與通知偏好。變更會立刻套用到所有成員。</div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption text-fg-muted font-medium">Solid Fixed</span>
        <div className="border border-divider rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-surface border-b border-divider">
            <span className="text-body font-medium">專案設定</span>
          </div>
          {ALL.map((v) => <Alert key={v} variant={v} appearance="solid" placement="fixed" title={L[v]} />)}
          <div className="p-4 text-fg-muted text-caption">調整此專案的權限與通知偏好。變更會立刻套用到所有成員。</div>
        </div>
      </div>
    </div>
  ),
}

