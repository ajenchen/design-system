// Dialog 寬度檔位閘(scripts/dialog-width-invariant.mjs)的測試夾具 —— 閘自己掛載的頁面,不是 story。
// 由 scripts/lib/storybook-css-fixture.mjs 用 esbuild 從原始碼打包、配同一份 storybook 建置的 CSS 在本機靜態頁開,
// 量到的是「這次 checkout 的 dialog.tsx + 那份建置的樣式」。
//
// 為什麼不是 story:要量的是任意寬度參數 × 任意舞台尺寸的幾何(檔位、數字、舊名、兩個同時傳、600 寬的 portalContainer 舞台),
// 寫成 story 等於拿「同時傳 width 與 maxWidth」「寫數字寬」這些 DS 規格叫人不要做的寫法當範例(dialog.spec.md「寬度檔位」)。
// 一次只掛一個對話框,參數走網址:
//   ?w=sm|md|lg|xl|<px>    DialogContent width(不給 = 不傳,吃預設)
//   ?mw=<px>|<CSS 長度>      DialogContent maxWidth(已停用的舊名)
//   ?h=fill|hug            DialogContent height(預設 hug)
//   ?stage=<寬>x<高>         有給 = 傳 portalContainer 給一個帶 transform 的舞台(左 120、上 80 的位置),量「以所在區塊計算」
// 夾具自己的版面用行內樣式:這個檔不在 Tailwind 的 @source 範圍裡,寫 class 不會產生樣式;DS 元件的樣式來自元件本身。
import { useState, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/design-system/components/Dialog/dialog'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'

type DialogWidth = ComponentProps<typeof DialogContent>['width']
const params = new URLSearchParams(window.location.search)
const lengthParam = (raw: string | null) => (raw == null ? undefined : /^\d+$/.test(raw) ? Number(raw) : raw)
const width = lengthParam(params.get('w')) as DialogWidth
const maxWidth = lengthParam(params.get('mw'))
const height = params.get('h') === 'fill' ? 'fill' : 'hug'
const stageParam = params.get('stage')
const [stageW, stageH] = stageParam ? stageParam.split('x').map(Number) : [0, 0]
/** 舞台在視窗裡的位置:不貼齊視窗左上,四邊留白「以舞台算」與「以視窗算」才分得開(閘量舞台自己的外框,不讀這個值) */
const STAGE_OFFSET = { left: 120, top: 80 }

function TestDialog({ container }: { container?: HTMLElement }) {
  return (
    <Dialog open>
      <DialogContent id="dw-dialog" width={width} maxWidth={maxWidth} height={height} portalContainer={container} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>匯入預覽</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p style={{ margin: 0 }}>寬度檔位夾具:量外框寬、與所在區塊四邊的距離、填滿模式的高。</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function Fixture() {
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  if (!stageParam) return <TestDialog />
  return (
    <div style={{ position: 'relative', height: '100svh' }}>
      <div
        ref={setStage}
        id="dw-stage"
        style={{ position: 'absolute', left: STAGE_OFFSET.left, top: STAGE_OFFSET.top, width: stageW, height: stageH, overflow: 'hidden', transform: 'translateZ(0)', outline: '1px dashed var(--divider)' }}
      />
      {stage && <TestDialog container={stage} />}
    </div>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('dialog-width fixture:找不到 #fixture-root')
// 與 Storybook 預覽同一層包裝(TooltipProvider + 畫布底色 / 字色);不開 StrictMode(同 dialog-coexistence 夾具)
createRoot(root).render(
  <TooltipProvider delayDuration={500} skipDelayDuration={300}>
    <div style={{ backgroundColor: 'var(--canvas)', color: 'var(--foreground)' }}>
      <Fixture />
    </div>
  </TooltipProvider>,
)
