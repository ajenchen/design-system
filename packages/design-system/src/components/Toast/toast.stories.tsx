import { useState } from 'react'
import type { Meta } from '@storybook/react'
import { fn } from '@storybook/test'
import type { NoticeVariant } from '@/design-system/components/Notice/notice'
import { Button } from '@/design-system/components/Button/button'
import { ButtonGroup } from '@/design-system/components/Button/button-group'
import { ExampleGroup } from '@/design-system/stories-helpers/examples/example-captions'
import { Toaster, toast, ToastSurface } from './toast'

const meta: Meta = {
  title: 'Design System/Components/Toast/展示',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { description: { component: '在操作完成後短暫顯示非阻斷回饋，由 Toaster 統一管理位置與佇列。適用儲存成功、背景工作完成等可自行消退的訊息；需持續閱讀或操作時用 Alert。' } },
  },
}
export default meta

// 2026-07-04 audit:補 'info'(NoticeVariant 5 值,原漏 → 靜態雙 theme 對照未涵蓋全 variant)
// 2026-07-14 Dim 68 修:原 warning =「訂閱 7 天後停用 + 續訂 CTA」= 持久帳務狀態 + 強制 CTA,
// 違反 toast.spec.md「持久性系統狀態（方案過期、帳戶未驗證）」那一列(→ Alert)+「❌ 不把需要 user action 的內容放 Toast」。改為短暫操作回饋(匯入部分完成)+ 非必要「查看」後手。
// 2026-10-28(D10 乙 / toast.spec.md 禁止事項第 4 條改寫):動作鈕只放非必要後手 —— 復原、重試、查看;複製類一律 neutral、不帶動作(複製到剪貼簿沒有東西可以復原)。
const VARIANTS: NoticeVariant[] = ['neutral', 'info', 'success', 'warning', 'error']
const LABELS: Record<string, string> = {
  neutral: '檔案已複製到剪貼簿',
  info: '新版本 v2.4 可用',
  success: '專案已儲存',
  warning: '匯入部分完成',
  error: '無法連線伺服器',
}
const ACTIONS: Record<string, string | undefined> = {
  neutral: undefined,
  info: '查看更新',
  success: '查看',
  warning: '查看',
  error: '重試',
}
const DESCRIPTIONS: Record<string, string> = {
  neutral: '「Q3 營收報表.xlsx」已加入剪貼簿',
  info: '重新整理頁面即可套用新功能',
  success: '變更已同步到所有成員',
  warning: '120 筆已匯入,3 筆格式錯誤被略過',
  error: '請檢查網路後再試一次',
}

/**
 * 靜態 Toast 對照 —— 直接用 toast() 同一份視覺殼(ToastSurface,toast.tsx),不再手抄三層結構
 * (2026-10-28 前手抄一份,少畫了右上 ×;稽核 M081)。pageTheme 決定 neutral / success 的反轉主題(模擬淺 / 深色頁)。
 * × 與動作鈕都有作用:按了就收起這一則;「查看 / 查看更新 / 重試」在範例裡沒有去處,記到 Storybook Actions 面板。
 */
function StaticToast({ variant, title, description, pageTheme }: {
  variant: NoticeVariant; title: string; description?: string; pageTheme: 'light' | 'dark'
}) {
  const [shown, setShown] = useState(true)
  if (!shown) return null
  const label = ACTIONS[variant]
  return (
    <div className="w-[360px]">
      <ToastSurface
        variant={variant}
        title={title}
        description={description}
        action={label ? { label, onClick: fn().mockName(`${title}:${label}`) } : undefined}
        onDismiss={() => setShown(false)}
        inverseTheme={pageTheme === 'light' ? 'dark' : 'light'}
      />
    </div>
  )
}

function modeLabel(variant: NoticeVariant, pageTheme: 'light' | 'dark') {
  if (variant === 'warning') return 'light'
  if (variant === 'neutral' || variant === 'success') return pageTheme === 'light' ? 'dark' : 'light'
  return 'dark'
}

export const WithDescription = {
  name: '有標題與描述',
  render: () => (
    // 間距(layoutSpace.spec.md 規則 3):淺深兩欄並列 = loose;欄標 → 它的示範框 = tight(ExampleGroup);
    // 框內五個變體並列 = loose;列標 ↔ 它標的那一則 Toast = tight;示範框內距見下方標記(陰影留白)
    // 每一欄的示範框自己鎖主題(data-theme + text-foreground,同 alert.tsx「data-theme 必須搭配 text-foreground」):不論頁面是淺是深,
    // 左欄永遠畫淺色頁上的 Toast、右欄永遠畫深色頁上的 Toast;欄標在框外、跟著頁面主題(頁面上看得清楚)。
    // 2026-10-20 前只有右欄整組(連欄標)設 dark、左欄沒鎖:淺色頁上「dark mode」欄標白字白底 1:1,深色頁上「light mode」欄整欄是深底
    // (獨立驗證 OV-03)。
    <div className="flex gap-[var(--layout-space-loose)]">
      <ExampleGroup>
        <span className="text-caption text-fg-secondary font-medium">light mode</span>
        {/* @layout-space-magic-ok: 示範框內距 32px 是範例原值(與已發布版同值,F-S8),給樣本 Toast 的陰影留白(elevation-200 模糊半徑 32px,primitives.css);規格沒寫這個值(放行章 (d)) */}
        <div data-theme="light" className="flex flex-col gap-[var(--layout-space-loose)] p-8 rounded-lg bg-canvas text-foreground border border-divider">
          {VARIANTS.map((v) => (
            <div key={v} className="flex items-center gap-[var(--layout-space-tight)]">
              <span className="text-caption text-fg-secondary w-24 shrink-0">套 {modeLabel(v, 'light')} theme</span>
              <StaticToast variant={v} title={LABELS[v]} description={DESCRIPTIONS[v]} pageTheme="light" />
            </div>
          ))}
        </div>
      </ExampleGroup>
      <ExampleGroup>
        <span className="text-caption text-fg-secondary font-medium">dark mode</span>
        {/* @layout-space-magic-ok: 示範框內距 32px 是範例原值(與已發布版同值,F-S8),給樣本 Toast 的陰影留白(elevation-200 模糊半徑 32px,primitives.css);規格沒寫這個值(放行章 (d)) */}
        <div data-theme="dark" className="flex flex-col gap-[var(--layout-space-loose)] p-8 rounded-lg bg-canvas text-foreground border border-divider">
          {VARIANTS.map((v) => (
            <div key={v} className="flex items-center gap-[var(--layout-space-tight)]">
              <span className="text-caption text-fg-secondary w-24 shrink-0">套 {modeLabel(v, 'dark')} theme</span>
              <StaticToast variant={v} title={LABELS[v]} description={DESCRIPTIONS[v]} pageTheme="dark" />
            </div>
          ))}
        </div>
      </ExampleGroup>
    </div>
  ),
}

// 每顆觸發鈕寫使用者真的會按的動作;Toast 的動作鈕都有反應:「查看」在範例裡沒有去處 → 記到 Storybook Actions 面板,
// 「重試」= 再連一次、成功跳 Toast(2026-10-28 前四個動作都接空函式,觸發鈕還叫「斷線示範」;複製那則拿掉「復原」—— D10 乙)
export const Interactive = {
  name: '點擊觸發通知',
  render: () => (
    <ExampleGroup>
      <span className="text-caption text-fg-muted">點按鈕觸發 Toast</span>
      <ButtonGroup>
        <Button variant="tertiary" onClick={() => toast({ title: '檔案已複製到剪貼簿' })}>複製檔案</Button>
        <Button variant="tertiary" onClick={() => toast({ variant: 'success', title: '專案已儲存', description: '變更已同步到所有成員', action: { label: '查看', onClick: fn().mockName('查看專案') } })}>儲存專案</Button>
        <Button variant="tertiary" onClick={() => toast({ variant: 'warning', title: '匯入部分完成', description: '120 筆已匯入,3 筆格式錯誤被略過', action: { label: '查看', onClick: fn().mockName('查看匯入結果') } })}>匯入資料</Button>
        <Button variant="tertiary" onClick={() => toast({ variant: 'error', title: '無法連線伺服器', description: '請檢查網路後再試一次', action: { label: '重試', onClick: () => toast({ variant: 'success', title: '已重新連線' }) } })}>同步資料</Button>
      </ButtonGroup>
      <Toaster />
    </ExampleGroup>
  ),
}

// 朗讀區域互動 —— 只給閘看(test-only):Sonner 寫死的 polite 視覺區塊與 DS 自己的兩個朗讀區,連續相同訊息也要每次播報。
// 讀者看的無障礙說明在設計規格頁「無障礙與鍵盤」。
export const LiveRegionContract = {
  name: '朗讀區域互動',
  tags: ['test-only'],
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button
        data-testid="toast-live-neutral"
        onClick={() => toast({
          variant: 'neutral',
          title: '相同通知',
          description: '連續觸發仍必須播報',
          action: { label: '復原', onClick: () => {} },
          duration: 60000,
        })}
      >
        neutral
      </Button>
      <Button data-testid="toast-live-info" onClick={() => toast({ variant: 'info', title: '資訊通知', duration: 60000 })}>info</Button>
      <Button data-testid="toast-live-success" onClick={() => toast({ variant: 'success', title: '成功通知', duration: 60000 })}>success</Button>
      <Button data-testid="toast-live-warning" onClick={() => toast({ variant: 'warning', title: '警告通知', duration: 60000 })}>warning</Button>
      <Button data-testid="toast-live-error" onClick={() => toast({ variant: 'error', title: '錯誤通知', duration: 60000 })}>error</Button>
      <Toaster />
    </div>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const { expect, userEvent, waitFor, within } = await import('@storybook/test')
    const canvas = within(canvasElement)
    const sonnerRegion = canvasElement.querySelector<HTMLElement>('section[aria-live="polite"]')
    const politeRegion = canvasElement.querySelector<HTMLElement>('[data-toast-live-region="polite"]')
    const assertiveRegion = canvasElement.querySelector<HTMLElement>('[data-toast-live-region="assertive"]')

    await expect(sonnerRegion).not.toBeNull()
    await expect(politeRegion).not.toBeNull()
    await expect(assertiveRegion).not.toBeNull()
    if (!sonnerRegion || !politeRegion || !assertiveRegion) return

    // Sonner viewport and both DS announcers must be siblings; neither DS region may be nested in
    // Sonner's hard-coded polite region.
    await expect(politeRegion.parentElement).toBe(sonnerRegion.parentElement)
    await expect(assertiveRegion.parentElement).toBe(sonnerRegion.parentElement)
    await expect(sonnerRegion.contains(politeRegion)).toBe(false)
    await expect(sonnerRegion.contains(assertiveRegion)).toBe(false)
    await expect(politeRegion).toHaveAttribute('role', 'status')
    await expect(politeRegion).toHaveAttribute('aria-live', 'polite')
    await expect(assertiveRegion).toHaveAttribute('role', 'alert')
    await expect(assertiveRegion).toHaveAttribute('aria-live', 'assertive')

    const MutationObserverCtor = canvasElement.ownerDocument.defaultView?.MutationObserver
    if (!MutationObserverCtor) throw new Error('MutationObserver is required for the Toast live-region contract')
    let politeChildMutations = 0
    const observer = new MutationObserverCtor((records) => {
      politeChildMutations += records.filter((record) => record.type === 'childList').length
    })
    observer.observe(politeRegion, { childList: true })

    await userEvent.click(canvas.getByTestId('toast-live-neutral'))
    await waitFor(() => expect(politeRegion).toHaveTextContent('相同通知。連續觸發仍必須播報'))
    const firstSequence = politeRegion.dataset.announcementSequence
    const mutationsAfterFirstTrigger = politeChildMutations

    const visualContent = await waitFor(() => {
      const node = canvasElement.querySelector<HTMLElement>('[data-toast-visual-content]')
      expect(node).not.toBeNull()
      return node
    })
    await expect(visualContent).toHaveAttribute('role', 'group')
    await expect(visualContent).toHaveAttribute('aria-live', 'off')
    await expect(visualContent?.closest('[aria-hidden="true"]')).toBeNull()
    const visualToast = visualContent?.closest<HTMLElement>('[data-sonner-toast]')
    await expect(visualToast).toHaveAttribute('tabindex', '0')
    await expect(visualContent?.querySelector('[aria-label="關閉通知"]')).not.toBeNull()
    await expect(visualContent?.textContent).toContain('復原')
    // There may be aria-live="off" visual groups, but no active nested live region.
    await expect(sonnerRegion.querySelector('[aria-live="polite"], [aria-live="assertive"]')).toBeNull()

    await userEvent.click(canvas.getByTestId('toast-live-neutral'))
    await waitFor(() => expect(politeRegion.dataset.announcementSequence).not.toBe(firstSequence))
    await waitFor(() => expect(politeChildMutations).toBeGreaterThan(mutationsAfterFirstTrigger))

    for (const [testId, message] of [
      ['toast-live-info', '資訊通知'],
      ['toast-live-success', '成功通知'],
    ] as const) {
      await userEvent.click(canvas.getByTestId(testId))
      await waitFor(() => expect(politeRegion).toHaveTextContent(message))
    }
    await expect(assertiveRegion).toBeEmptyDOMElement()

    for (const [testId, message] of [
      ['toast-live-warning', '警告通知'],
      ['toast-live-error', '錯誤通知'],
    ] as const) {
      await userEvent.click(canvas.getByTestId(testId))
      await waitFor(() => expect(assertiveRegion).toHaveTextContent(message))
    }

    observer.disconnect()
  },
}
