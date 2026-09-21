// ═══════════════════════════════════════════════════════════════════════════
// 列 hover 反應延遲閘的「判定政策」(純函式,供對照表驗)
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼抽出來**(2026-09-20,main 因此紅了一次):
// 原本的判定是 `lost = 樣本數 - 量到數字的樣本數`,也就是**只要沒量到就算產品沒變色**。
// 但 `took = NaN` 只代表「1.5 秒內沒抓到變色的那張幀」,有兩種完全不同的成因:
//
//   (a) 有幀可看,每一張都沒變色  → 產品真的卡住,**這是真訊號**
//       (2026-09-12 CI 抓到的 3 次屬於這類,是真 bug)
//   (b) hover 之後串流**一張幀都沒送** → 儀器看不到
//       (2026-09-20 那次:送幀間隔最大 1461ms,而門檻正好 1500ms)
//
// 舊判定把兩者混為一談 ——「沒觀察到」被當成「沒發生」。那次 main 紅的時候,
// 同一份內容在分支上剛跑綠、前 11 次 CI 也全綠,而失敗訊息卻在指控產品。
// 閘自己的檔頭寫著「lost 與串流間隔無關」—— 那是**註解裡的斷言,程式沒有任何地方在執行它**。
//
// 現在分開:(a) 照舊紅;(b) 不得指控產品,但也**不准默默放行** ——
// 被吃掉太多樣本時這一輪證明不了任何事,要以**儀器失效**(starved)的名義紅。

/** 串流全盲會吃掉樣本;剩太少就證明不了任何事。 */
export const MIN_USABLE_SAMPLES = 5

/**
 * 這一次取樣是不是「串流全盲」——hover 之後**一張幀都沒送**。
 *
 * **2026-09-21 從閘裡抽出來的理由**:判定表把 `blindness` 當**輸入**餵進來,
 * 所以永遠測不到算這個值的那一行。把它硬寫成 `true`,2026-09-12 抓到的那個真 bug
 * 會從紅變綠而所有測試照樣全過 —— 這正是本 session 反覆踩到的同一條
 *(「吃參數的純函式,參數邊界就是測試的天然盲點」)。
 */
export function isStreamBlind({ hit, framesAfter }) {
  return !hit && framesAfter === 0
}

/**
 * 這一次取樣的數字是不是**解析度受限**——命中的就是 hover 之後的第一張幀,
 * 而那張幀本身就晚於上限。
 *
 * 那代表變色在第一張幀**之前**就完成了,量到的其實是**截圖串流的送幀間隔**,
 * 真值只知道「≤ 這個數字」。拿它去指控列變慢 = 拿儀器的空窗當產品的反應時間
 *(2026-09-20 main 誤紅那次,送幀間隔最大 1461ms)。
 * 既有的 `firstGap` / `resolutionBound` 早就算出來了,但**只拿去印**,沒有參與判定。
 */
export function isResolutionBound({ hit, firstFrameIsHit, firstGap, assertMax }) {
  return Boolean(hit) && Boolean(firstFrameIsHit) && Number.isFinite(firstGap) && firstGap > assertMax
}

/**
 * 把逐次樣本分成三類。**判定與印出都必須用這一支** —— 各自數一遍就是兩份實作,必然漂移(M17)。
 * @returns {{ok:number[], lost:number, blind:number}}
 */
export function classifySamples({ samples = [], blindness = [], unresolved = [] } = {}) {
  // 解析度受限的樣本有數字,但那個數字是串流空窗不是列的反應時間 —— 不能拿去判產品快慢。
  const ok = samples.filter((x, i) => Number.isFinite(x) && unresolved[i] !== true)
  const bounded = samples.filter((x, i) => Number.isFinite(x) && unresolved[i] === true).length
  const blind = samples.filter((x, i) => !Number.isFinite(x) && blindness[i] === true).length
  return { ok, blind, bounded, lost: samples.length - ok.length - bounded - blind }
}

/**
 * @param {object} input
 * @param {number[]} input.samples    每次取樣量到的毫秒數;沒量到 = NaN
 * @param {boolean[]} input.blindness 與 samples 同序:該次 hover 之後串流是否「一張幀都沒到」
 * @param {number} input.assertMedian 中位數上限
 * @param {number} input.assertMax    單次上限
 * @param {boolean[]} input.unresolved 與 samples 同序:該次量到的數字是否只是串流空窗的上界
 * @returns {{verdict:'pass'|'lost'|'median'|'max'|'starved', usable:number, lost:number, blind:number, bounded:number, median:number, max:number}}
 */
export function hoverVerdict({ samples = [], blindness = [], unresolved = [], assertMedian, assertMax } = {}) {
  const { ok, blind, bounded, lost } = classifySamples({ samples, blindness, unresolved })
  const sorted = ok.slice().sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5))] : NaN
  const max = sorted.length ? sorted[sorted.length - 1] : NaN
  const base = { usable: ok.length, lost, blind, bounded, median, max }

  // 真訊號優先:有幀可看卻沒變色,比任何毫秒數都嚴重。
  if (lost > 0) return { verdict: 'lost', ...base }
  // 其次才是「這一輪到底量到東西沒有」。
  if (ok.length < MIN_USABLE_SAMPLES) return { verdict: 'starved', ...base }
  if (median > assertMedian) return { verdict: 'median', ...base }
  if (max > assertMax) return { verdict: 'max', ...base }
  return { verdict: 'pass', ...base }
}
