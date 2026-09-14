/**
 * 效能診斷面板 —— **只在網址帶 `?perfdebug` 時出現**,其餘 render 出 null,零成本。
 *
 * ## v2(2026-09-14)修掉 v1 的兩個缺陷
 *
 * v1 從 user 機器拿回:移動間隔中位 245ms / 最久 3012ms,但出幀間隔中位 33ms / 最久 38ms。
 * 這組矛盾看似指向「主執行緒沒忙,卻收不到輸入」,但 v1 有兩個缺陷讓它不能採信:
 *
 * **(a) 兩組數字的時間窗不同。** v1 各自留最近 240 筆:出幀那組涵蓋最近約 8 秒(user 停下來
 * 看面板 = 閒置),移動那組涵蓋 user 在動的那段。等於拿閒置時的流暢度去比移動時的延遲。
 * v2 改成**只統計「最近 150ms 內有移動過」的那些幀**,兩組數字回到同一個時間窗。
 *
 * **(b) 面板自己在量自己。** v1 每次 pointermove 都呼叫 `elementFromPoint`,那會強制重算版面;
 * 在沒有 GPU 加速的機器上這可能就是延遲的一大部分。v2 改用 `e.target.closest()`(事件自帶,
 * 不碰版面),並且**每 2 秒交替開關一次刻意的 elementFromPoint**,把「有/沒有額外強制版面」
 * 兩組數字並列 —— 若兩者差很多,那 245ms 就是面板造成的,不是元件。
 *
 * **(c) 直接證據:`getCoalescedEvents()`。** 瀏覽器把幾發原始移動合併成一發送進來,這個數字
 * 直接說明主執行緒有沒有塞車 —— 合併很多 = 真的忙;合併很少但間隔大 = 使用者本來就沒在動。
 * v1 沒有這個,所以分不出「瀏覽器餓死我」和「使用者手停著」。
 *
 * 面板只讀不寫,不碰 DataTable 任何狀態。
 */
import * as React from 'react'

const stat = (a: number[]) => {
  if (!a.length) return { med: 0, max: 0, n: 0 }
  const s = [...a].sort((x, y) => x - y)
  return { med: Math.round(s[Math.floor(s.length / 2)]), max: Math.round(s[s.length - 1]), n: a.length }
}
const keep = (a: number[], n = 300) => { if (a.length > n) a.splice(0, a.length - n) }

export function PerfDebugOverlay() {
  const on = typeof location !== 'undefined' && location.search.includes('perfdebug')
  const [text, setText] = React.useState('量測中 —— 請在表格上**連續**來回移動滑鼠 5 秒以上,期間不要停')

  React.useEffect(() => {
    if (!on) return
    // 只在「正在移動」的期間統計,兩組數字才在同一個時間窗裡
    const MOVING_WINDOW = 150
    let lastMoveAt = 0

    const gapPlain: number[] = []   // 沒有額外強制版面的那半段
    const gapForced: number[] = []  // 面板刻意多做一次 elementFromPoint 的那半段
    const coalesced: number[] = []
    const dist: number[] = []
    const hoverLat: number[] = []
    const rafMoving: number[] = []
    const rafIdle: number[] = []

    let lastMove = 0
    let lastX = NaN, lastY = NaN
    let lastRow: string | null = null
    let pendingSince = 0
    let forcePhase = false // 每 2 秒交替

    const onMove = (e: PointerEvent) => {
      const t = performance.now()
      if (lastMove) {
        const g = t - lastMove
        ;(forcePhase ? gapForced : gapPlain).push(g)
      }
      lastMove = t
      lastMoveAt = t
      const c = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents().length : 1
      coalesced.push(c)
      if (Number.isFinite(lastX)) dist.push(Math.hypot(e.clientX - lastX, e.clientY - lastY))
      lastX = e.clientX; lastY = e.clientY

      // 事件自帶 target,不碰版面
      const row = (e.target as Element | null)?.closest?.('[data-row-index]')?.getAttribute('data-row-index') ?? null
      if (row !== lastRow) { lastRow = row; pendingSince = t }
      // 對照用:刻意多做一次強制版面的那半段
      if (forcePhase) document.elementFromPoint(e.clientX, e.clientY)
    }
    document.addEventListener('pointermove', onMove, { passive: true })

    const mo = new MutationObserver(() => {
      if (!pendingSince) return
      hoverLat.push(performance.now() - pendingSince)
      pendingSince = 0
    })
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-hovered'] })

    let lastRaf = 0, raf = 0
    const tick = (t: number) => {
      if (lastRaf) (t - lastMoveAt < MOVING_WINDOW ? rafMoving : rafIdle).push(t - lastRaf)
      lastRaf = t
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const phase = setInterval(() => { forcePhase = !forcePhase }, 2000)

    const timer = setInterval(() => {
      for (const a of [gapPlain, gapForced, coalesced, dist, hoverLat, rafMoving, rafIdle]) keep(a)
      const gp = stat(gapPlain), gf = stat(gapForced), h = stat(hoverLat)
      const rm = stat(rafMoving), ri = stat(rafIdle)
      const c = stat(coalesced), d = stat(dist)
      const gl = (document.createElement('canvas').getContext('webgl') as WebGLRenderingContext | null)
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
      const gpu = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).slice(0, 44) : '(取不到)'
      setText([
        `【移動中】出幀間隔  中位 ${rm.med}ms 最久 ${rm.max}ms (${rm.n})`,
        `【閒置時】出幀間隔  中位 ${ri.med}ms 最久 ${ri.max}ms (${ri.n})`,
        `收到移動間隔`,
        `  面板不碰版面      中位 ${gp.med}ms 最久 ${gp.max}ms (${gp.n})`,
        `  面板多做強制版面  中位 ${gf.med}ms 最久 ${gf.max}ms (${gf.n})`,
        `瀏覽器合併掉幾發    中位 ${c.med} 最多 ${c.max}`,
        `兩次之間游標移了    中位 ${d.med}px 最多 ${d.max}px`,
        `換列 → 變色        中位 ${h.med}ms 最久 ${h.max}ms (${h.n})`,
        `縮放 ${devicePixelRatio}× 視窗 ${innerWidth}×${innerHeight} 核心 ${navigator.hardwareConcurrency ?? '?'}`,
        `顯示晶片 ${gpu}`,
      ].join('\n'))
    }, 500)

    return () => {
      document.removeEventListener('pointermove', onMove)
      mo.disconnect(); cancelAnimationFrame(raf); clearInterval(timer); clearInterval(phase)
    }
  }, [on])

  if (!on) return null
  return (
    <div
      style={{
        position: 'fixed', right: 12, bottom: 12, zIndex: 99999,
        background: 'rgba(0,0,0,.88)', color: '#fff', padding: '10px 12px',
        font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        borderRadius: 8, whiteSpace: 'pre', pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  )
}
