/* DataTable 現場量測 — 貼進 DevTools Console,然後用你平常的力道捲那張表 10 秒。
   量的是「你看到什麼」:每一幀中央捲動區有多少比例沒有真資料(空白或骨架),以及主執行緒卡多久。
   兩個網址各跑一次,把兩份 __RESULT 貼回來。 */
(() => {
  const c = document.querySelector('[data-datatable-hscroll]')
  if (!c) return '✗ 找不到表格。請確認網址是 .../iframe.html?id=design-system-components-datatable-展示--roadmap-all-in-one&viewMode=story'
  const DUR = 10000
  const S = { long: [], gaps: [], missing: [], shell: [], rows: [], ahead: [], last: 0, t0: performance.now(), scrolled: 0, startTop: c.scrollTop }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) S.long.push(Math.round(e.duration)) }).observe({ entryTypes: ['longtask'] }) } catch {}
  // 兩種「看不到資料」的機制都要算,否則對兩邊不公平:
  //  (1) DOM 就缺:列還沒掛、或掛的是骨架 → rAF 取樣直接看得到。
  //  (2) DOM 是滿的,但**合成器跑在主執行緒前面**:畫面已經捲過去了,主執行緒還停在上一次 commit 的位置。
  //      這種白 rAF 看不到(每次 rAF 時 DOM 都是自洽的),只能從「兩個主幀之間捲了多遠」對「上一幀已渲染的範圍」推算。
  //      main 走 flushSync 同步重繪,DOM 幾乎永遠是滿的,它的白全部是這一種 —— 少算就會誤判成 main 比較好。
  let prevTop = c.scrollTop, prevRange = null
  const sample = () => {
    const box = c.getBoundingClientRect()
    const rows = [...c.querySelectorAll('[role="row"]')]
    let covered = 0, shellPx = 0, n = 0
    for (const r of rows) {
      const b = r.getBoundingClientRect()
      const top = Math.max(b.top, box.top), bot = Math.min(b.bottom, box.bottom)
      if (bot <= top) continue
      n++
      covered += bot - top
      if (r.hasAttribute('data-row-shell')) shellPx += bot - top
      else {
        // 真列但格子沒內容也算沒資料
        const cells = [...r.children]
        const empty = cells.length && cells.every((x) => !x.textContent.trim() && !x.querySelector('img,svg,input,button'))
        if (empty) shellPx += bot - top
      }
    }
    const h = box.height || 1
    S.missing.push(Math.round(Math.max(0, h - covered) / h * 100))
    S.shell.push(Math.round(shellPx / h * 100))
    S.rows.push(n)
    // 合成器超前造成的白:把上一幀已渲染的範圍,依這一幀捲動的位移往回推,看還剩多少落在視窗內
    const top = c.scrollTop, delta = top - prevTop
    let first = Infinity, last = -Infinity
    for (const r of rows) { const b2 = r.getBoundingClientRect(); first = Math.min(first, b2.top - box.top); last = Math.max(last, b2.bottom - box.top) }
    if (prevRange && Number.isFinite(delta)) {
      const lo = Math.max(0, prevRange[0] - delta), hi = Math.min(h, prevRange[1] - delta)
      S.ahead.push(Math.round((1 - Math.max(0, hi - lo) / h) * 100))
    } else S.ahead.push(0)
    prevRange = Number.isFinite(first) && Number.isFinite(last) ? [first, last] : null
    prevTop = top
  }
  const pct = (a) => { const x = [...a].sort((p, q) => p - q); return x.length ? { p50: x[Math.floor(x.length / 2)], p95: x[Math.floor(x.length * 0.95)], max: x[x.length - 1] } : null }
  const tick = (t) => {
    if (S.last) S.gaps.push(Math.round(t - S.last))
    S.last = t
    sample()
    if (performance.now() - S.t0 < DUR) requestAnimationFrame(tick)
    else {
      S.scrolled = Math.abs(c.scrollTop - S.startTop)
      const noData = S.missing.map((m, i) => Math.min(100, m + S.shell[i] + S.ahead[i]))
      // **必須用時間加權,不能數幀**:兩邊的幀率不一樣(掉幀多的那邊取樣本來就少),
      // 數「壞掉的幀數」會直接偏袒掉幀比較嚴重的那一版。這裡把每一幀乘上它自己的幀距。
      let noDataMs = 0, totalMs = 0, weighted = 0
      for (let i = 1; i < noData.length; i++) {
        const dt = S.gaps[i - 1] ?? 16
        totalMs += dt
        weighted += (noData[i] / 100) * dt
        if (noData[i] > 10) noDataMs += dt
      }
      const r = {
        網址: location.href.slice(0, 120),
        裝置: { dpr: devicePixelRatio, 視窗: [innerWidth, innerHeight], 表格高: Math.round(c.getBoundingClientRect().height), 核心數: navigator.hardwareConcurrency, 記憶體GB: navigator.deviceMemory ?? null },
        錄了幾秒: +( (performance.now() - S.t0) / 1000).toFixed(1), 取樣幀數: S.gaps.length + 1, 總共捲了px: Math.round(S.scrolled),
        '沒有資料的畫面比例%': pct(noData), '其中骨架%': pct(S.shell), '其中DOM就缺%': pct(S.missing), '其中合成器超前%': pct(S.ahead),
        '沒有資料的時間ms(>10%)': Math.round(noDataMs),
        '沒有資料的時間佔比%': totalMs ? +(noDataMs / totalMs * 100).toFixed(1) : 0,
        '面積×時間(越小越好)': Math.round(weighted),
        '沒有資料的幀數(>10%,僅供參考,幀率不同不可直接比)': noData.filter((v) => v > 10).length,
        幀距ms: pct(S.gaps), '掉幀數(>50ms)': S.gaps.filter((v) => v > 50).length,
        長工: { 個數: S.long.length, 最長ms: S.long.length ? Math.max(...S.long) : 0, 合計ms: S.long.reduce((a, b) => a + b, 0) },
        視窗內列數: pct(S.rows),
      }
      window.__RESULT = r
      console.log('%c量完了 — 把下面整段複製貼回給我', 'font-weight:bold;font-size:14px')
      console.log(JSON.stringify(r, null, 2))
    }
  }
  requestAnimationFrame(tick)
  return `✓ 開始錄 ${DUR / 1000} 秒 — 現在請用你平常的力道連續捲這張表。時間到會自動把結果印出來(也存在 window.__RESULT)。`
})()
