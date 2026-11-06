// Dialog 並存契約(`persistentElements`)的測試夾具 —— 閘自己掛載的頁面,不是 story。
// 2026-09-11 user「Dialog的並存範例給我刪掉」(登記簿 A33):展示範例與 test-only 的 CoexistencePoc story 都刪掉;能力本身沒有退役
// (dialog.spec.md「並存(persistentElements)」),它的機械斷言需要一個掛載目標,所以場景縮到剛好夠閘用的最小 DOM,
// 由 scripts/lib/dialog-coexistence-fixture.mjs 用 esbuild 打包、配同一份 storybook 建置的 CSS 在本機靜態頁開。
// 讀它的閘:dialog-coexistence(B 並存路徑 / G 幾何)、dialog-coexist-scroll-lock(捲動鎖)、layer-order(E2 本體 z-40)。
// 夾具自己的版面用行內樣式:這個檔不在 Tailwind 的 @source 範圍裡,寫 class 不會產生樣式;DS 元件的樣式來自元件本身。
import { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/design-system/components/Dialog/dialog'
import { Button } from '@/design-system/components/Button/button'
import { Field, FieldLabel } from '@/design-system/components/Field/field'
import { Input } from '@/design-system/components/Input/input'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'

function Fixture() {
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const asideRef = useRef<HTMLElement | null>(null)
  const keep = useCallback(() => [asideRef.current].filter((el): el is HTMLElement => !!el), [])
  const [open, setOpen] = useState(true)
  const [inside, setInside] = useState('')
  const [aside, setAside] = useState('')
  return (
    <div style={{ display: 'flex', height: '100svh' }}>
      <div
        ref={setStage}
        id="coexist-stage"
        style={{ position: 'relative', display: 'flex', minWidth: 0, flex: '1 1 0%', flexDirection: 'column', gap: 8, overflow: 'hidden', padding: 16, transform: 'translateZ(0)' }}
      >
        <Button id="coexist-background-btn" variant="primary" onClick={() => setOpen(true)}>開啟</Button>
        {stage && (
          <Dialog open={open} onOpenChange={setOpen} persistentElements={keep}>
            <DialogContent maxWidth={480} height="hug" portalContainer={stage}>
              <DialogHeader>
                <DialogTitle>任務 #4821</DialogTitle>
                <DialogDescription>並存契約夾具</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Field id="coexist-inside-input">
                  <FieldLabel>留言</FieldLabel>
                  <Input value={inside} onChange={(e) => setInside(e.target.value)} />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button id="coexist-inside-btn" variant="primary" disabled={!inside.trim()} onClick={() => setOpen(false)}>儲存</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <aside
        ref={asideRef}
        id="coexist-aside"
        aria-label="評論"
        style={{ display: 'flex', width: 300, flexShrink: 0, flexDirection: 'column', gap: 'var(--layout-space-loose)', borderLeft: '1px solid var(--divider)', background: 'var(--surface)', padding: 'var(--layout-space-loose)' }}
      >
        <Field id="coexist-aside-input">
          <FieldLabel>新增評論</FieldLabel>
          <Input value={aside} onChange={(e) => setAside(e.target.value)} />
        </Field>
        <div><Button id="coexist-aside-btn" variant="primary" disabled={!aside.trim()} onClick={() => setAside('')}>送出</Button></div>
      </aside>
    </div>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('dialog-coexistence fixture:找不到 #fixture-root')
// 與 Storybook 預覽同一層包裝(packages/storybook-config/preview.tsx sharedDecorators:TooltipProvider + 畫布底色 / 字色;fullscreen 不加內距;
// Storybook 預設不開 StrictMode,這裡也不開 —— 效果跑兩次會讓焦點 / inert 的套用時序跟 story 不同)
createRoot(root).render(
  <TooltipProvider delayDuration={500} skipDelayDuration={300}>
    <div style={{ backgroundColor: 'var(--canvas)', color: 'var(--foreground)' }}>
      <Fixture />
    </div>
  </TooltipProvider>,
)
