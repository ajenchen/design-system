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
 * 把逐次樣本分成三類。**判定與印出都必須用這一支** —— 各自數一遍就是兩份實作,必然漂移(M17)。
 * @returns {{ok:number[], lost:number, blind:number}}
 */
export function classifySamples({ samples = [], blindness = [] } = {}) {
  const ok = samples.filter((x) => Number.isFinite(x))
  const blind = samples.filter((x, i) => !Number.isFinite(x) && blindness[i] === true).length
  return { ok, blind, lost: samples.length - ok.length - blind }
}

/**
 * @param {object} input
 * @param {number[]} input.samples    每次取樣量到的毫秒數;沒量到 = NaN
 * @param {boolean[]} input.blindness 與 samples 同序:該次 hover 之後串流是否「一張幀都沒到」
 * @param {number} input.assertMedian 中位數上限
 * @param {number} input.assertMax    單次上限
 * @returns {{verdict:'pass'|'lost'|'median'|'max'|'starved', usable:number, lost:number, blind:number, median:number, max:number}}
 */
export function hoverVerdict({ samples = [], blindness = [], assertMedian, assertMax } = {}) {
  const { ok, blind, lost } = classifySamples({ samples, blindness })
  const sorted = ok.slice().sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5))] : NaN
  const max = sorted.length ? sorted[sorted.length - 1] : NaN
  const base = { usable: ok.length, lost, blind, median, max }

  // 真訊號優先:有幀可看卻沒變色,比任何毫秒數都嚴重。
  if (lost > 0) return { verdict: 'lost', ...base }
  // 其次才是「這一輪到底量到東西沒有」。
  if (ok.length < MIN_USABLE_SAMPLES) return { verdict: 'starved', ...base }
  if (median > assertMedian) return { verdict: 'median', ...base }
  if (max > assertMax) return { verdict: 'max', ...base }
  return { verdict: 'pass', ...base }
}
