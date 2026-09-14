/**
 * 效能診斷面板 —— **只在網址帶 `?perfdebug` 時出現**,其餘情況 render 出 null,零成本。
 *
 * 為什麼需要它:2026-09-14,user 在自己的慢機器上持續回報「hover 完全跟不上滑鼠游標」,
 * 而我在本機用四種量法、CPU×1 到 ×20 全掃,分支每一項都等於或優於 main,**一次都重現不出來**。
 * 差異只可能在環境(本機是 `--single-process` 無 GPU process 的軟體合成、無頭、假 DPI),
 * 所以要拿到 user 那台機器上的真實數字,而不是繼續在這裡量。
 *
 * 它只讀不寫:三個 passive listener + 一個 MutationObserver + 一個 rAF,不碰 DataTable 任何狀態。
 * 數字含意:
 *   收到移動間隔  瀏覽器多久送一次 pointermove 進來。主執行緒忙時會合併,這個變大 = 高亮凍住。
 *   換列→變色    游標跨到新的一列之後,多久 `data-hovered` 才換過去(同步改 DOM,正常應 <2ms)。
 *   畫面出幀間隔  rAF 間隔,反映實際流暢度。
 */
import * as React from 'react'

type Stat = { med: number; max: number }
const stat = (a: number[]): Stat => {
  if (!a.length) return { med: 0, max: 0 }
  const s = [...a].sort((x, y) => x - y)
  return { med: Math.round(s[Math.floor(s.length / 2)]), max: Math.round(s[s.length - 1]) }
}

export function PerfDebugOverlay() {
  const on = typeof location !== 'undefined' && location.search.includes('perfdebug')
  const [text, setText] = React.useState('量測中…把滑鼠在表格上來回移動幾秒')

  React.useEffect(() => {
    if (!on) return
    const moveGaps: number[] = []
    const hoverLat: number[] = []
    const rafGaps: number[] = []
    let lastMove = 0
    let lastRowUnder: string | null = null
    let pendingSince = 0

    const onMove = (e: PointerEvent) => {
      const t = performance.now()
      if (lastMove) moveGaps.push(t - lastMove)
      lastMove = t
      const row = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)
        ?.closest('[data-row-index]')?.getAttribute('data-row-index') ?? null
      if (row !== lastRowUnder) { lastRowUnder = row; pendingSince = t }
    }
    document.addEventListener('pointermove', onMove, { passive: true })

    const mo = new MutationObserver(() => {
      if (!pendingSince) return
      hoverLat.push(performance.now() - pendingSince)
      pendingSince = 0
    })
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-hovered'] })

    let lastRaf = 0
    let raf = 0
    const tick = (t: number) => { if (lastRaf) rafGaps.push(t - lastRaf); lastRaf = t; raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)

    const keep = (a: number[]) => { if (a.length > 240) a.splice(0, a.length - 240) }
    const timer = setInterval(() => {
      keep(moveGaps); keep(hoverLat); keep(rafGaps)
      const m = stat(moveGaps), h = stat(hoverLat), r = stat(rafGaps)
      const gl = (document.createElement('canvas').getContext('webgl') as WebGLRenderingContext | null)
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
      const gpu = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).slice(0, 46) : '(取不到)'
      setText([
        `收到移動間隔  中位 ${m.med}ms  最久 ${m.max}ms   (${moveGaps.length} 筆)`,
        `換列 → 變色   中位 ${h.med}ms  最久 ${h.max}ms   (${hoverLat.length} 筆)`,
        `畫面出幀間隔  中位 ${r.med}ms  最久 ${r.max}ms`,
        `螢幕縮放 ${devicePixelRatio}×  視窗 ${innerWidth}×${innerHeight}  核心 ${navigator.hardwareConcurrency ?? '?'}`,
        `顯示晶片 ${gpu}`,
        `(面板自己每次移動會呼叫一次 elementFromPoint,本身也吃一點效能;拿掉網址參數就完全不存在)`,
      ].join('\n'))
    }, 500)

    return () => {
      document.removeEventListener('pointermove', onMove)
      mo.disconnect(); cancelAnimationFrame(raf); clearInterval(timer)
    }
  }, [on])

  if (!on) return null
  return (
    <div
      style={{
        position: 'fixed', right: 12, bottom: 12, zIndex: 99999,
        background: 'rgba(0,0,0,.86)', color: '#fff', padding: '10px 12px',
        font: '12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace',
        borderRadius: 8, whiteSpace: 'pre', pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  )
}
