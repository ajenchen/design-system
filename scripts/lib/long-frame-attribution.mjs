/**
 * 長工歸因(2026-10-14,總帳 R1d):**長工裡的時間花在哪段程式碼**,分支 / main 並排印。
 *
 * 為什麼要有(M32(h)「先歸因再消融」):DataTable 快速捲動閘的長工合計比值紅了兩次(38346602 gesture 5.96×、
 * 289bce76 mouse 1.70×),而閘只印得出「合計幾毫秒」—— 看不出多出來的時間是在我們的元件、React、瀏覽器的
 * 版面 / 繪製,還是儀器自己。沒有歸因就只能猜,猜完再去消融產品程式碼是倒過來做。
 *
 * 量具:瀏覽器的 Long Animation Frames API(`PerformanceObserver` type `long-animation-frame`,超過 50ms 的影格,
 * 每個影格附 `scripts[]`:進入點的 invokerType / invoker / sourceURL / sourceFunctionName / duration /
 * forcedStyleAndLayoutDuration;另有 renderStart / styleAndLayoutStart)。它只記**進入點**(例:虛擬捲動的 scroll
 * 監聽、React 排程的 MessagePort.onmessage),不記進入點底下呼叫了誰 —— 所以這裡給的是「哪一類工作、從哪個檔進來」,
 * 不是函式層的 profile(要函式層用閘的 `--profile=<dir>`,那會另跑一趟、有取樣成本)。
 *
 * 一個影格的時間拆成(互不重疊,加總 = 影格長度):
 *   script   進入點的 JS 時間,扣掉它逼出的樣式 / 版面(key = 檔 + 進入點)
 *   forced   進入點裡被 JS 逼出的同步樣式 / 版面(forcedStyleAndLayoutDuration;key = 檔)
 *   render   影格的渲染階段(styleAndLayoutStart → 影格結束)扣掉該階段裡的 JS(ResizeObserver 等)= 瀏覽器自己的樣式 / 版面 / 繪製
 *   other    剩下的:沒有被列為進入點的工作(瀏覽器內部的輸入分派、GC、解碼,以及 < 5ms 不列的小 script)
 * 量測樁(閘自己用 page.evaluate 打進去的取樣迴圈,sourceURL 是空的)單獨一格,不混進產品程式碼。
 *
 * **涵蓋率要照實印(`longTaskCoverage`)**:瀏覽器不保證每個 long task 都有對應的長影格。本機 roadmap story 實測
 * (CPU×2):gesture 長影格合計 ≈ long task 合計(±5%);mouse 有截圖串流時 7 個長影格蓋住 8 個 long task,關掉截圖串流後
 * 12 個 long task 只有前 6 個有長影格(事後再開 buffered 觀測器也拿不到 —— 是瀏覽器沒產生,不是沒送到)。沒被蓋住的 long task
 * 時間歸不到檔,所以表頭一律印「long task 合計裡有多少落在長影格內」,讀表的人才知道這張表解釋了多少。
 */

/**
 * 頁內每個影格的序列化形狀(閘的 INIT 在頁內做,頁內程式不能 import,所以欄位名寫在這裡當契約):
 *   { s: startTime, d: duration, b: blockingDuration, r: renderStart, l: styleAndLayoutStart,
 *     sc: [{ t: invokerType, i: invoker, u: sourceURL, f: sourceFunctionName, s: startTime, d: duration, fl: forcedStyleAndLayoutDuration }] }
 */

// Vite 的內容雜湊是 8 碼 [A-Za-z0-9_-];具名 chunk(data-table / overflow-tag-list / tag …)去掉雜湊才對得起來
// (兩份建置內容不同 → 雜湊不同)。泛用 chunk(index-* / chunk-*)名字不帶資訊,但內容相同時兩份建置雜湊也相同,
// 所以**保留雜湊**當 key —— 對得起來,又不會把幾十個不相干的 index-*.js 併成一格。
const HASHED = /^(.*)-[A-Za-z0-9_-]{8}\.js$/
const GENERIC = /^(index|chunk-[A-Z0-9]+)$/

/** sourceURL → 歸因用的檔名 key。空字串 = 量測樁 / eval(沒有來源檔)。 */
export function chunkKey(sourceURL) {
  if (!sourceURL) return '(量測樁 / 無來源檔)'
  let path = sourceURL
  try { path = new URL(sourceURL).pathname } catch { /* 不是網址就照原字串 */ }
  const base = path.split('/').pop() || path
  const m = HASHED.exec(base)
  if (!m) return base
  return GENERIC.test(m[1]) ? base : `${m[1]}.js`
}

/** 進入點的標籤:事件監聽只留「元素.事件」(id / class 每次渲染可能不同),其餘照瀏覽器給的字串。 */
export function invokerKey(type, invoker) {
  const inv = String(invoker || '')
  if (type === 'event-listener') {
    const tag = inv.split(/[#.]/)[0]
    const ev = inv.split('.').pop()
    return `${tag}.${ev}`
  }
  if (type === 'classic-script' || type === 'module-script') return type
  return inv || type || '?'
}

/**
 * 一趟的長影格 → 各格毫秒數。`windowStart` 之前結束的影格不算(與閘的 long task 視窗同一個起點)。
 * @returns {{ frames: number, totalMs: number, blockingMs: number, buckets: Record<string, { kind: string, ms: number }> }}
 */
export function attributeLongFrames(loafs, { windowStart = -Infinity } = {}) {
  const buckets = {}
  const add = (key, kind, ms) => {
    if (!(ms > 0)) return
    const k = `${kind}|${key}`
    buckets[k] = { kind, key, ms: (buckets[k]?.ms ?? 0) + ms }
  }
  let frames = 0, totalMs = 0, blockingMs = 0
  for (const f of loafs || []) {
    if (!(f.s + f.d >= windowStart)) continue
    frames++; totalMs += f.d; blockingMs += f.b || 0
    const end = f.s + f.d
    const styleStart = f.l > 0 ? f.l : end
    let scriptsMs = 0, scriptsInRender = 0
    for (const x of f.sc || []) {
      const forced = Math.max(0, Math.min(x.fl || 0, x.d))
      const file = chunkKey(x.u)
      const who = x.u ? `${file} ← ${invokerKey(x.t, x.i)}` : file
      add(who, 'script', x.d - forced)
      add(file, 'forced', forced)
      scriptsMs += x.d
      if (x.s >= styleStart) scriptsInRender += x.d
    }
    const renderMs = Math.max(0, end - styleStart - scriptsInRender)
    add('樣式 / 版面 / 繪製(瀏覽器,非 JS)', 'render', renderMs)
    add('沒列為進入點的工作(輸入分派、GC、解碼、< 5ms 的小 script)', 'other', Math.max(0, f.d - scriptsMs - renderMs))
  }
  return { frames, totalMs, blockingMs, buckets }
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}

/**
 * 多個 build 的歸因並排:每格 = 該 build 各趟的**中位數**(沒出現的趟算 0)。
 * 排序 = 各 build 中位數的最大值,由大到小;取前 `top` 格,其餘併成「其他」。
 * @param {Record<string, Array<ReturnType<typeof attributeLongFrames>>>} byBuild
 * @returns {{ labels: string[], head: Record<string, { frames: number, totalMs: number, blockingMs: number }>, rows: Array<{ kind: string, key: string, ms: Record<string, number> }> }}
 */
export function compareAttribution(byBuild, { top = 8 } = {}) {
  const labels = Object.keys(byBuild)
  const head = Object.fromEntries(labels.map((b) => {
    const trips = byBuild[b]
    return [b, { frames: median(trips.map((t) => t.frames)), totalMs: median(trips.map((t) => t.totalMs)), blockingMs: median(trips.map((t) => t.blockingMs)) }]
  }))
  const keys = new Map()
  for (const b of labels) for (const t of byBuild[b]) for (const [k, v] of Object.entries(t.buckets)) keys.set(k, { kind: v.kind, key: v.key })
  const all = [...keys.entries()].map(([k, meta]) => ({
    ...meta,
    ms: Object.fromEntries(labels.map((b) => [b, median(byBuild[b].map((t) => t.buckets[k]?.ms ?? 0))])),
  }))
  all.sort((a, b) => Math.max(...Object.values(b.ms)) - Math.max(...Object.values(a.ms)))
  const rows = all.slice(0, top)
  const rest = all.slice(top)
  if (rest.length) rows.push({ kind: 'rest', key: `其餘 ${rest.length} 格`, ms: Object.fromEntries(labels.map((b) => [b, rest.reduce((s, r) => s + r.ms[b], 0)])) })
  return { labels, head, rows }
}

/**
 * 泛用 chunk(index-*.js)名字不帶資訊,印的時候附上**檔案裡有哪些套件的授權標頭**當線索(例:React 的
 * scheduler / react-dom、TanStack 的 table-core)。只說「這個檔裡有什麼」,不宣稱進入點屬於哪一個套件 ——
 * 同一個檔可能打包好幾個套件,而沒有授權標頭的套件(例:virtual-core)不會出現在清單裡。
 */
export function licenseHint(text) {
  const names = []
  const re = /\/\*\*?([\s\S]{0,600}?)\*\//g
  let m
  while ((m = re.exec(String(text || '')))) {
    const body = m[1]
    if (!/@license/.test(body)) continue
    const lines = body.split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).filter(Boolean)
    const lic = lines.find((l) => l.startsWith('@license')) || ''
    const after = lic.replace(/^@license\s*/, '')
    // 「@license React」下一行是檔名(scheduler.production.min.js);「@license MIT」要看標頭第一行(table-core);其餘取套件名
    const name = /^(MIT|ISC|Apache|BSD)/i.test(after) ? lines[0] : /^React$/.test(after) ? (lines[lines.indexOf(lic) + 1] || 'React').replace(/\.production\.min\.js$/, '') : after.split(/\s+/)[0]
    if (name && !name.startsWith('@license') && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * long task 合計裡,有多少毫秒落在長影格 [s, s + d] 內。長影格先取聯集再算重疊 —— 瀏覽器給的長影格照理不會重疊,
 * 但這是比例的分子,重疊一次就會把同一段算兩次、把涵蓋率灌高(2026-10-14 覆核:原本只在最後把合計截到 long task 合計 ——
 * 某一段被算兩次、另一段沒被蓋到時,兩者會抵成 100%;而且那道截斷拿掉,測試照樣全綠)。每個 long task 落在聯集裡的部分不會超過它自己的長度。
 * @returns {{ longMs: number, coveredMs: number }}
 */
export function longTaskCoverage(longs, loafs) {
  const union = []
  for (const [x, y] of (loafs || []).map((f) => [f.s, f.s + f.d]).sort((u, v) => u[0] - v[0])) {
    const last = union[union.length - 1]
    if (last && x <= last[1]) last[1] = Math.max(last[1], y)
    else union.push([x, y])
  }
  let longMs = 0, coveredMs = 0
  for (const l of longs || []) {
    const a = l.start, b = l.start + l.dur
    longMs += l.dur
    for (const [x, y] of union) coveredMs += Math.max(0, Math.min(b, y) - Math.max(a, x))
  }
  return { longMs, coveredMs }
}

/**
 * 長影格裡的 CPU 取樣(`--attribution=cpu` 才有):Long Animation Frames 只記**進入點**,捲動時幾乎所有工作都從
 * 虛擬捲動的 scroll 監聽或 React 排程進來,看不出底下是哪個元件。CDP 取樣 profile 補上「長影格期間,CPU 自身時間落在哪個檔」。
 * `anchorMs` = Profiler.start 回來之後立刻讀的 performance.now()(profile 時鐘與頁面時鐘的對齊點;誤差 ≈ 一次 CDP 往返,
 * 對 ≥ 50ms 的影格可忽略)。只算落在某個視窗 [s, s + d] 裡的樣本;閘傳入「長影格 ∪ long task」,所以沒有長影格的 long task 也歸得到檔。
 * @returns {{ sampledMs: number, inFramesMs: number, byFile: Record<string, number> }}
 */
export function cpuInLongFrames(profile, anchorMs, loafs) {
  const out = { sampledMs: 0, inFramesMs: 0, byFile: {} }
  if (!profile || !Array.isArray(profile.samples) || !Number.isFinite(anchorMs)) return out
  const frames = (loafs || []).map((f) => [f.s, f.s + f.d]).sort((a, b) => a[0] - b[0])
  const byId = new Map((profile.nodes || []).map((n) => [n.id, n]))
  let t = profile.startTime
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = profile.timeDeltas?.[i] ?? 0
    t += dt
    const ms = dt / 1000
    out.sampledMs += ms
    const at = anchorMs + (t - profile.startTime) / 1000
    if (!frames.some(([a, b]) => at >= a && at <= b)) continue
    out.inFramesMs += ms
    const cf = byId.get(profile.samples[i])?.callFrame
    const fn = cf?.functionName || ''
    const key = cf?.url ? chunkKey(cf.url) : /^\(.*\)$/.test(fn) ? `(V8 ${fn})` : `(原生 / 內建)${fn ? ' ' + fn : ''}`
    out.byFile[key] = (out.byFile[key] ?? 0) + ms
  }
  return out
}
