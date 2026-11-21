// 「LinkInput 可清除」閘(scripts/link-input-clear-invariant.mjs)C10 的測試夾具 —— 閘自己掛載的頁面,不是 story。
// 由 scripts/lib/storybook-css-fixture.mjs 用 esbuild 打包、配同一份 storybook 建置的 CSS 在本機靜態頁開。
//
// 為什麼不是 story:C10 量的是使用端的 `onBlur` 什麼時候被呼叫(link-input.spec.md「可清除(clearable)」焦點段:輸入框 ↔ × 之間移動不呼叫、
// 從 × 離開欄位才呼叫一次,事件的 currentTarget / target 是輸入框)。要量就得有一個接了 onBlur、把每次呼叫記下來的使用端;
// 展示頁的「可清除」範例沒有接 onBlur,也不該為了量在讀者看的範例裡放計數器。
// 每次 onBlur 被呼叫,把「currentTarget 標籤 / target 標籤」記進 `data-blur-log`(空白分隔,閘讀它);欄位後面一顆按鈕當「欄位外」的 tab stop。
// 夾具自己的版面用行內樣式:這個檔不在 Tailwind 的 @source 範圍裡,寫 class 不會產生樣式;DS 元件的樣式來自元件本身。
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@/design-system/components/Button/button'
import { LinkInput } from '@/design-system/components/LinkInput/link-input'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'

function Fixture() {
  const [value, setValue] = React.useState('https://www.figma.com/design/checkout-flow')
  const [log, setLog] = React.useState<string[]>([])
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // 在 handler 裡同步讀(React 的合成事件 handler 回傳後 currentTarget 會被清掉)
    const entry = `${e.currentTarget?.tagName ?? '-'}/${e.target?.tagName ?? '-'}`
    setLog((prev) => [...prev, entry])
  }
  return (
    <div data-lic-fixture="" data-blur-log={log.join(' ')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, width: 360, padding: 24 }}>
      <div style={{ width: '100%' }}>
        <LinkInput clearable value={value} onChange={setValue} onBlur={onBlur} aria-label="設計稿連結" />
      </div>
      <Button size="sm">下一個欄位</Button>
    </div>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('link-input-clear fixture:找不到 #fixture-root')
// 與 Storybook 預覽同一層包裝(packages/storybook-config/preview.tsx sharedDecorators:TooltipProvider + 畫布底色 / 字色);不開 StrictMode(同其他夾具)
createRoot(root).render(
  <TooltipProvider delayDuration={500} skipDelayDuration={300}>
    <div style={{ backgroundColor: 'var(--canvas)', color: 'var(--foreground)' }}>
      <Fixture />
    </div>
  </TooltipProvider>,
)
