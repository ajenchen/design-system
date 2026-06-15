// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// @anatomy-rationale:
//   SizeMatrix N/A — Toast 消費 Notice primitive,固定 md tier(text-body 14px、
//     px-4 py-3、icon 16px),不提供 size prop——通知是跨 density 一致的訊息
//     載體(對齊 Polaris / Material / Sonner 共識)。Toast 本身無尺寸決策,
//     由 sonner Provider 控制 viewport position 與 stacking。
import type { Meta, StoryObj } from '@storybook/react'
import { toast, Toaster } from './toast'
import { Button } from '@/design-system/components/Button/button'
import { H3, Desc, Td, Th, TokenCell } from '@/design-system/stories-helpers/anatomy/anatomy-utils'

const meta: Meta = {
  title: 'Design System/Components/Toast/設計規格',
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
        <Desc>Toast 基於 sonner(浮動管理) + 消費 Notice primitive(layout + icon + theme 策略,與 Alert 共用)。透過 `toast()` 函式觸發,不是 JSX 元件。</Desc>
        <div className="flex gap-3 flex-wrap">
          <Button variant="tertiary" onClick={() => toast({ variant: 'success', title: '已儲存', description: '變更已同步至雲端' })}>
            觸發 success toast
          </Button>
          <Button variant="tertiary" onClick={() => toast({ variant: 'error', title: '操作失敗', description: '請檢查網路連線後重試' })}>
            觸發 error toast
          </Button>
          <Button variant="tertiary" onClick={() => toast({
            variant: 'success',
            title: '已刪除',
            description: '訊息已移至封存',
            action: { label: '復原', onClick: () => toast({ variant: 'info', title: '已復原' }) },
          })}>觸發 action toast</Button>
        </div>
      </div>
      <Toaster />

      <div>
        <H3>ToastOptions(toast 函式參數)</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Field</Th><Th>Type</Th><Th>Default</Th><Th>說明</Th></tr></thead>
            <tbody>
              {[
                ['variant', "'neutral' | 'success' | 'info' | 'warning' | 'error'", "'neutral'", '語意 + 色彩'],
                ['title', 'string', '必填', '主要訊息'],
                ['description', 'string', '—', '補充說明,自然換行'],
                ['action', '{ label: string; onClick: () => void }', '—', 'tertiary xs 按鈕(Undo pattern)'],
                ['duration', 'number', '4000', '自動關閉時間(ms)'],
              ].map(([p, t, d, desc]) => (
                <tr key={p}><Td mono>{p}</Td><Td mono>{t}</Td><Td mono>{d}</Td><Td>{desc}</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

// ── Inspector ─────────────────────────────────────────────────────────────

interface InspectorArgs {
  variant: 'neutral' | 'success' | 'info' | 'warning' | 'error'
  title: string
  description: string
  duration: number
  withAction: boolean
}

export const Inspector: Story = {
  name: '元件檢閱器',
  parameters: {
    docs: {
      description: {
        story:
          '右側 Controls 切 ToastOptions 即時觸發,取代 Figma inspect。Toast 不是 JSX 元件而是 `toast()` 函式呼叫——點「觸發 toast」依 args 在右下角跳出對應通知;切 `variant` 看 5 種色彩 + inverse theme 切換,切 `withAction` 加上「復原」CTA。',
      },
    },
  },
  args: {
    variant: 'success',
    title: '已刪除 3 則訊息',
    description: '訊息已移至「已刪除」資料夾',
    duration: 4000,
    withAction: true,
  },
  argTypes: {
    variant: {
      control: 'radio',
      options: ['neutral', 'success', 'info', 'warning', 'error'],
      description: 'neutral / success = inverse theme / info / error = dark / warning = light',
    },
    title: { control: 'text', description: '主要訊息' },
    description: { control: 'text', description: '補充說明,自然換行' },
    duration: {
      control: { type: 'range', min: 2000, max: 10000, step: 1000 },
      description: '自動關閉時間(ms),action toast 建議加長至 6000',
    },
    withAction: { control: 'boolean', description: '附 undo action button(樂觀 UI 反悔窗口)' },
  },
  render: (args) => {
    const { variant, title, description, duration, withAction } = args as InspectorArgs
    return (
      <div className="flex flex-col gap-3">
        <Button
          variant="tertiary"
          onClick={() =>
            toast({
              variant,
              title,
              description,
              duration,
              action: withAction
                ? {
                    label: '復原',
                    onClick: () => toast({ variant: 'info', title: '已復原', duration: 2000 }),
                  }
                : undefined,
            })
          }
        >
          觸發 toast
        </Button>
        <p className="text-footnote text-fg-muted">
          toast 會在右下角跳出(由 Provider 層的 Toaster 決定位置)。連續點擊觸發多個 toast 觀察堆疊。
        </p>
        <Toaster />
      </div>
    )
  },
}

export const ContainerArchitecture: Story = {
  name: '容器 三層架構',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>為什麼分三層</H3>
        <Desc>
          Toast 的 container 結構是**刻意三層**——解決陰影 token 在 light / dark
          mode 不同強度的問題(dark 25% black,light 4% black)。若陰影跟
          `data-theme="dark"` 在同一層,light 頁面上的 dark toast 會有過重陰影。
        </Desc>
      </div>

      <div>
        <H3>三層結構</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Layer</Th><Th>Class</Th><Th>作用</Th></tr></thead>
            <tbody>
              <tr><Td>1. Shadow wrapper</Td><Td mono>rounded-lg + elevation-200</Td><Td>永遠在頁面 theme 解析,陰影用頁面 theme 的輕陰影</Td></tr>
              <tr><Td>2. Bg layer</Td><Td mono>bg-&#123;color&#125;</Td><Td>有色相 variant 在頁面 theme 解析</Td></tr>
              <tr><Td>3. Theme layer</Td><Td mono>data-theme + text-foreground</Td><Td>content token 在此 re-resolve(讓 Icon/Text 切到 inverse theme)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
}

export const ColorMatrix: Story = {
  name: '色彩對照表',
  render: () => (
    <div className="flex flex-col gap-6">
      <div>
        <H3>跟 Alert 共用同一套 variant × theme</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Variant</Th><Th>Bg</Th><Th>data-theme</Th><Th>視覺</Th></tr></thead>
            <tbody>
              <tr><Td mono>neutral</Td><Td><TokenCell token="--surface-raised" display="bg-surface-raised(同層翻轉)" /></Td><Td mono>{'{inverse}'}</Td><Td>light 頁→暗底 / dark 頁→亮底</Td></tr>
              <tr><Td mono>success</Td><Td><TokenCell token="--surface-raised" display="bg-surface-raised(同層翻轉)" /></Td><Td mono>{'{inverse}'}</Td><Td>同上 + 綠色 icon</Td></tr>
              <tr><Td mono>info</Td><Td><TokenCell token="--info" display="bg-info(outer)" /></Td><Td mono>"dark"(inner)</Td><Td>藍底白字</Td></tr>
              <tr><Td mono>warning</Td><Td><TokenCell token="--warning" display="bg-warning(outer)" /></Td><Td mono>"light"(inner)</Td><Td>黃底深字</Td></tr>
              <tr><Td mono>error</Td><Td><TokenCell token="--error" display="bg-error(outer)" /></Td><Td mono>"dark"(inner)</Td><Td>橘底白字</Td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-footnote text-fg-muted mt-3">neutral/success 的 bg + data-theme 在同一層,因為 `bg-surface-raised` 需要跟 data-theme 一起翻轉。</p>
      </div>

      <div>
        <H3>觸發各 variant 比較</H3>
        <div className="flex flex-wrap gap-2">
          {([
            { variant: 'neutral', label: 'neutral', title: '已複製到剪貼簿', description: '連結已加入剪貼簿' },
            { variant: 'info', label: 'info', title: '有新版本可用', description: '重新整理即可套用更新' },
            { variant: 'success', label: 'success', title: '訂單已寄送', description: '預計 3 個工作天送達' },
            { variant: 'warning', label: 'warning', title: '連線不穩', description: '部分變更可能尚未同步' },
            { variant: 'error', label: 'error', title: '匯入失敗', description: '檔案格式不符,請改用 CSV' },
          ] as const).map(({ variant, label, title, description }) => (
            <Button key={variant} variant="tertiary" size="sm" onClick={() => toast({ variant, title, description })}>
              {label}
            </Button>
          ))}
        </div>
        <Toaster />
      </div>
    </div>
  ),
}

export const StateBehavior: Story = {
  name: '狀態行為',
  render: () => (
    <div className="flex flex-col gap-10">
      <div>
        <H3>生命週期四階段</H3>
        <Desc>
          {'Toast 的行為由 sonner 管理,具體數值來自 Provider 層 `Sonner` 設定(詳見 `main.tsx` 的 `<Toaster />` props)。'}
        </Desc>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>階段</Th><Th>觸發</Th><Th>行為</Th><Th>Token / 數值</Th></tr></thead>
            <tbody>
              <tr><Td mono>進場</Td><Td mono>toast()</Td><Td>從右下滑入 + fade-in + stacking shift</Td><Td mono>~400ms(sonner 內建)</Td></tr>
              <tr><Td mono>自動關閉</Td><Td>`duration` 到期</Td><Td>fade-out + 向右滑出</Td><Td mono>duration ?? 4000ms</Td></tr>
              <tr><Td mono>手動 dismiss</Td><Td>X button / 向右滑動</Td><Td>立即 fade-out + 滑出</Td><Td mono>滑動 ≥ 45px 或速度夠快(velocity {'>'} 0.11)</Td></tr>
              <tr><Td mono>Pause on hover</Td><Td>Hover 任一 toast</Td><Td>倒數暫停;離開後 resume</Td><Td mono>sonner 預設開啟</Td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <H3>Stacking — 多個 toast 堆疊</H3>
        <Desc>
          連續觸發多個 toast 時,sonner 自動堆疊(最新的在上,舊的往下縮到後層)。預設最多同時顯示 3 則,
          超過的會直接隱藏(不顯示「+N」計數)。Hover 任一 toast 時展開全部,離開後收合。
        </Desc>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="tertiary"
            onClick={() => {
              toast({ variant: 'info', title: '開始同步工作區', description: '剛剛觸發,最上層' })
              setTimeout(() => toast({ variant: 'success', title: '設計稿已上傳', description: '1 秒後,推下前一則' }), 1000)
              setTimeout(() => toast({ variant: 'warning', title: '網路速度偏慢', description: '2 秒後,繼續往下堆疊' }), 2000)
              setTimeout(() => toast({ variant: 'error', title: '部分檔案上傳逾時', description: '3 秒後,最底層' }), 3000)
            }}
          >
            連續觸發 4 個 toast(觀察堆疊)
          </Button>
        </div>
        <p className="text-footnote text-fg-muted mt-3">
          觸發後在 viewport 右下角觀察:新 toast 推下舊 toast。Hover 任一 toast → 全部展開。
        </p>
      </div>

      <div>
        <H3>Swipe to dismiss — 觸控 / 滑鼠拖曳關閉</H3>
        <Desc>
          Toast 支援向右滑動關閉(mobile 友善)。拖曳超過 45px(或滑動速度夠快)→ 鬆開觸發關閉;
          未達門檻 → 彈回原位。
        </Desc>
        <Button
          variant="tertiary"
          onClick={() => toast({ variant: 'info', title: '試著向右拖我', description: '向右拖超過 45px 會被關掉' })}
        >
          觸發可滑動關閉的 toast
        </Button>
      </div>

      <div>
        <H3>Action toast(Undo pattern)</H3>
        <Desc>
          提供 `action` prop 時 toast 含 undo CTA。點 action button 執行 callback + 關閉 toast。
          搭配「樂觀 UI」pattern:操作立即完成,給使用者短窗口反悔,避免 modal 確認的摩擦。
        </Desc>
        <Button
          variant="tertiary"
          onClick={() => toast({
            variant: 'success',
            title: '已刪除 3 則訊息',
            description: '訊息已移至「已刪除」',
            action: {
              label: '復原',
              onClick: () => toast({ variant: 'info', title: '已復原' }),
            },
            duration: 6000,
          })}
        >
          觸發含 Undo action 的 toast
        </Button>
        <p className="text-footnote text-fg-muted mt-3">
          Action toast 通常 `duration` 加長至 6000ms,給使用者足夠時間反悔(預設 4000ms 較短)。
        </p>
      </div>

      <div>
        <H3>a11y 與 role</H3>
        <div className="overflow-x-auto">
          <table className="text-caption border-collapse">
            <thead><tr><Th>Variant</Th><Th>role</Th><Th>aria-live</Th><Th>理由</Th></tr></thead>
            <tbody>
              <tr><Td mono>neutral / info / success</Td><Td mono>status</Td><Td mono>polite</Td><Td>不打斷使用者當前任務</Td></tr>
              <tr><Td mono>warning / error</Td><Td mono>alert</Td><Td mono>assertive</Td><Td>需立即注意(操作失敗 / 系統警告)</Td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <Toaster />
    </div>
  ),
}

// ── Accessibility ─────────────────────────────────────────────────────────
// 2026-05-17 ship per audit Dim 13(story-rules.md 6-canonical 含 Accessibility)
export const Accessibility = {
  name: '無障礙',
  render: () => (
    <div className="max-w-3xl text-body text-fg-secondary">
      <h3 className="text-h5 text-foreground mb-2">無障礙設計</h3>
      <p className="whitespace-pre-line">{"詳 `toast.spec.md` 「A11y 預設」段。摘要:\n\n-   預設  （success / info / neutral）： role=\"status\"  +  aria-live=\"polite\" ——screen reader 在空閒時讀出，不中斷使用者\n-   error / warning 升級  ： role=\"alert\"  +  aria-live=\"assertive\" ——立即中斷朗讀通知使用者\n-   由本 DS 在 outer wrapper 上依 variant 設 role / aria-live  ：非 sonner 內建（sonner runtime 本身 0 個 role,只有外層 <section> 容器固定 aria-live=polite），consumer 無需額外處理\n-   關閉按鈕  ：畫面上可見的 X 由 Notice 渲染（<Button dismiss> 自帶 aria-label='關閉通知'），非 sonner 內建 close 鈕；若 consumer 自訂 action,務必為自訂互動元素提供  aria-label "}</p>
    </div>
  ),
}
