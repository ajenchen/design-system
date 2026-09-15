/**
 * 效能診斷面板 —— **只在網址帶 `?perfdebug` 時出現**,其餘 render 出 null,零成本。
 *
 * **2026-09-15 結案:** user 機器上的 hover 33ms 已用 Long Animation Frames 歸因到 `*.netlify.app` 被注入的
 * `thin-client-min.js`(見 `data-table.tsx` 的「2026-09-15 結案」docblock);下方 v2 / v3 的消融假設(成本在樣式/繪製/光柵)
 * 已被推翻。要再量請先用 `scripts/user-probe/loaf-attribution.js` 歸因,別直接拿本面板的 A/B/C 模式消融。
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
 * ## v3(2026-09-14)把消融實驗搬到 user 的機器上
 *
 * v2 從 user 機器拿回的關鍵三筆:移動中出幀 **121ms**(閒置時 33ms)、「面板碰/不碰版面」
 * 兩組幾乎一樣(211 vs 188ms → **不是面板在量自己**)、兩次事件之間游標移了 **182px**
 * (→ 使用者真的在連續移動,瀏覽器要等游標跑過四五列才送得出一次事件)。
 * 也就是:**滑鼠一動,主執行緒就真的忙 120-200ms**,而本機量到的 JS 只要 1ms ——
 * 成本在樣式/繪製/光柵那一段,那正是本機環境(軟體光柵)量不準的地方。
 *
 * 所以 v3 讓面板**每 4 秒自動切換一種模式並分別統計**,一次讀數就能指出是哪一層:
 *   A 正常
 *   B 關掉列 hover 底色(`[data-hovered]` 的背景改透明)—— 若 B 明顯變快 = 成本在 hover 重繪
 *   C 關掉未掛載區的骨架底(`[data-row-shell-band]` 隱藏)—— 若 C 明顯變快 = 成本在那層貼圖
 * 只動視覺覆寫,不碰任何狀態或事件路徑;拿掉網址參數就完全不存在。
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

    let gpu = '(取不到)'
    try {
      const gl = document.createElement('canvas').getContext('webgl') as WebGLRenderingContext | null
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
      if (gl && dbg) gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).slice(0, 44)
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch { /* 取不到就算了,不值得為它冒任何風險 */ }

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

    let panelMoveMs = 0, panelMoves = 0, panelTickMs = 0, panelTicks = 0
    const onMove = (e: PointerEvent) => {
      const t0 = performance.now()
      const t = t0
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
      panelMoveMs += performance.now() - t0; panelMoves++
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
      if (lastRaf) {
        const g = t - lastRaf
        if (t - lastMoveAt < MOVING_WINDOW) { rafMoving.push(g); perMode[mode].push(g) } else rafIdle.push(g)
      }
      lastRaf = t
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const phase = setInterval(() => { forcePhase = !forcePhase }, 2000)

    // ── 模式輪播:每 4 秒換一種,各自統計「移動中出幀間隔」 ──
    // 消融四組。B/C 在 user 機器上量過:關掉反而更慢(53 / 79 / 144ms,且 C 只有 20 筆)——
    // 因果上不成立,代表那是雜訊,兩者都不是元兇。所以換成更有針對性的組合:
    //   D 關掉「hover 才出現的行內動作鈕」(data-table.tsx:3629 的 group-hover:inline-flex)——
    //     它一出現就改變同列的版面,是 hover 期間唯一會動到版面的東西。
    //   E 全關(底色 + 動作鈕 + 骨架底),當作上界:E 若還是慢,成本就不在這些視覺效果裡。
    const OFF_BG = '[data-hovered]{background-color:transparent !important}'
    const OFF_ACT = '[class*="group-hover:inline-flex"]{display:none !important}'
    const OFF_BAND = '[data-row-shell-band]{display:none !important}'
    const MODES = [
      { key: 'A 正常', css: '' },
      { key: 'B 關底色', css: OFF_BG },
      { key: 'D 關動作鈕', css: OFF_ACT },
      { key: 'E 全關', css: `${OFF_BG}${OFF_ACT}${OFF_BAND}` },
    ]
    const perMode: number[][] = MODES.map(() => [])
    let mode = 0
    const styleEl = document.createElement('style')
    document.head.appendChild(styleEl)
    const applyMode = () => { styleEl.textContent = MODES[mode].css }
    applyMode()
    const rot = setInterval(() => { mode = (mode + 1) % MODES.length; applyMode() }, 4000)

    const timer = setInterval(() => {
      const tick0 = performance.now()
      for (const a of [gapPlain, gapForced, coalesced, dist, hoverLat, rafMoving, rafIdle, ...perMode]) keep(a)
      const gp = stat(gapPlain), gf = stat(gapForced), h = stat(hoverLat)
      const rm = stat(rafMoving), ri = stat(rafIdle)
      const c = stat(coalesced), d = stat(dist)
      // **顯示晶片只讀一次。** v3 之前寫在這個 500ms 的 interval 裡,等於每半秒新建一個
      // WebGL context —— 在 SwiftShader(軟體 GL)上那一下要幾十到上百毫秒,
      // 於是「閒置時最久 270ms」「合併掉最多 11 發」這些數字有一大部分是面板自己造成的。
      // (2026-09-14 user 第二次回報時抓到:我先前的「碰不碰版面」A/B 測錯了自己的成本,
      //  兩組都在付這筆錢,所以看起來沒差。)
      setText([
        `【移動中】出幀間隔  中位 ${rm.med}ms 最久 ${rm.max}ms (${rm.n})`,
        `【閒置時】出幀間隔  中位 ${ri.med}ms 最久 ${ri.max}ms (${ri.n})`,
        `收到移動間隔`,
        `  面板不碰版面      中位 ${gp.med}ms 最久 ${gp.max}ms (${gp.n})`,
        `  面板多做強制版面  中位 ${gf.med}ms 最久 ${gf.max}ms (${gf.n})`,
        `瀏覽器合併掉幾發    中位 ${c.med} 最多 ${c.max}`,
        `兩次之間游標移了    中位 ${d.med}px 最多 ${d.max}px`,
        `換列 → 變色        中位 ${h.med}ms 最久 ${h.max}ms (${h.n})`,
        `── 移動中出幀,分模式(每 4 秒自動輪播)──`,
        ...MODES.map((m, i) => { const st = stat(perMode[i]); return `  ${m.key.padEnd(14)} 中位 ${st.med}ms 最久 ${st.max}ms (${st.n})` }),
        `縮放 ${devicePixelRatio}× 視窗 ${innerWidth}×${innerHeight} 核心 ${navigator.hardwareConcurrency ?? '?'}`,
        `顯示晶片 ${gpu}`,
        `面板自身耗時 每次移動 ${panelMoves ? (panelMoveMs / panelMoves).toFixed(2) : 0}ms、每次更新 ${panelTicks ? (panelTickMs / panelTicks).toFixed(1) : 0}ms`,
      ].join('\n'))
      panelTickMs += performance.now() - tick0; panelTicks++
    }, 1000)

    return () => {
      document.removeEventListener('pointermove', onMove)
      mo.disconnect(); cancelAnimationFrame(raf); clearInterval(timer); clearInterval(phase); clearInterval(rot)
      styleEl.remove()
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
