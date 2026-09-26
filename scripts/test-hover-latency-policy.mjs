#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 列 hover 閘分得出「產品沒變色」與「儀器看不到」—— 前者必紅,後者不得指控產品
 *   紅: 有幀可看卻沒變色 → lost;可用樣本太少 → starved;中位數/單次超標 → median/max
 *   綠: 串流全盲吃掉幾個樣本、但其餘樣本都快 → pass(2026-09-20 main 就是被這格誤紅)
 *
 * 判定表的數字**全部來自真實 CI job log**,逐筆註明 commit —— 已知該紅的必須紅、該綠的必須綠。
 * 作法對齊既有的 scripts/test-fast-scroll-gate-policy.mjs。
 *
 *   node scripts/test-hover-latency-policy.mjs
 */
import { readFileSync } from 'node:fs'
import { countCallSites } from './lib/gate-reachability.mjs'
import { classifySamples, hoverVerdict, isBlindSample, isResolutionBound, isStreamBlind, MIN_USABLE_SAMPLES } from './lib/hover-latency-policy.mjs'

const MED = 60
const MAX = 600
const nan = Number.NaN
// [名稱, 逐次樣本, 逐次是否「串流全盲」, 期望判定]
const CASES = [
  ['717e405b main 捲動後 hover(送幀間隔最大 1461ms;本次誤紅的那格)',
    [29, 20, 25, nan, 17, 21, nan, 16, 20, nan], [0,0,0,1,0,0,1,0,0,1], 'pass'],
  ['717e405b main 靜止 hover(含一個 437ms 離群,仍在天花板內)',
    [19, 19, 17, 23, 17, 28, 41, 35, 20, 437], [0,0,0,0,0,0,0,0,0,0], 'pass'],
  ['b4a61c40 分支 捲動後 hover(同一份內容,CI 綠)',
    [17, 18, 25, 27, 20, 15, 26, 17], [0,0,0,0,0,0,0,0], 'pass'],
  ['2026-09-12 真 bug:有幀可看卻整整 1.5s 沒變色(必須仍然紅)',
    [19, 20, nan, 18, nan, 21, nan, 17, 19, 20], [0,0,0,0,0,0,0,0,0,0], 'lost'],
  ['381c7ec4 PR #161 第三輪 捲動後 hover(靜置期送幀間隔最大 1490ms;三次沒變色全在停頓裡 → 全盲,其餘 7 個 pass)',
    [23, 20, 24, nan, 21, 21, nan, 19, 16, nan], [0,0,0,1,0,0,1,0,0,1], 'pass'],
  ['混合:一格真沒變色 + 兩格全盲 → 真訊號優先',
    [19, nan, 20, nan, 18, 21, 17, 19], [0,1,0,0,0,0,0,0], 'lost'],
  ['串流幾乎全盲:可用樣本不足 → 儀器失效,不得默默放行',
    [19, nan, nan, nan, nan, nan, nan, 20], [0,1,1,1,1,1,1,0], 'starved'],
  ['中位數越線 1ms(必須紅)',
    [61, 61, 61, 61, 61, 61], [0,0,0,0,0,0], 'median'],
  ['中位數剛好等於門檻(不得紅)',
    [60, 60, 60, 60, 60, 60], [0,0,0,0,0,0], 'pass'],
  ['單次天花板超過 1ms(必須紅)',
    [19, 20, 18, 21, 17, 601], [0,0,0,0,0,0], 'max'],
  ['單次剛好等於天花板(不得紅)',
    [19, 20, 18, 21, 17, 600], [0,0,0,0,0,0], 'pass'],
]

let fail = 0
for (const [name, samples, blindFlags, want] of CASES) {
  const r = hoverVerdict({ samples, blindness: blindFlags.map(Boolean), assertMedian: MED, assertMax: MAX })
  const ok = r.verdict === want
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} ${want.padEnd(8)} 實得 ${r.verdict.padEnd(8)} (可用 ${r.usable} / 沒變色 ${r.lost} / 全盲 ${r.blind}) ${name}`)
}

// 對照:把「全盲」的資訊拿掉(等於退回舊判定)→ 第一格必須變成誤紅。
// 不會紅的對照組是零證據。
const regressed = hoverVerdict({
  samples: CASES[0][1], blindness: CASES[0][1].map(() => false), assertMedian: MED, assertMax: MAX,
})
const proves = regressed.verdict === 'lost'
console.log(`${proves ? '✓' : '✗'} 對照組:拿掉「全盲」資訊 → 第一格回到舊判定的誤紅(得 ${regressed.verdict})`)
if (!proves) fail++

// 印出的數字與判定用的數字必須同源:閘的 report() 與 hoverVerdict() 都走 classifySamples,
// 各自數一遍就是兩份實作(M17)。這一格就是防它再被拆回去。
for (const [name, samples, blindFlags] of CASES) {
  const c = classifySamples({ samples, blindness: blindFlags.map(Boolean) })
  const v = hoverVerdict({ samples, blindness: blindFlags.map(Boolean), assertMedian: MED, assertMax: MAX })
  const same = c.ok.length === v.usable && c.lost === v.lost && c.blind === v.blind
  if (!same) { console.log(`✗ 同源檢查:${name} 的分類與判定不一致`); fail++ }
}
console.log('✓ 分類與判定同源(report 與 verdict 都走 classifySamples)')

// ── 旗標本身怎麼算出來的(2026-09-21 補)──────────────────────────────────────
// 先前 blindness 只是判定表的**輸入**,所以「算它的那一行」永遠測不到 ——
// 把它硬寫成 true,2026-09-12 抓到的真 bug 會從紅變綠而所有測試照樣全過。
for (const [name, input, want, why] of [
  ['命中就不是全盲', { hit: {}, framesAfter: 0 }, false, '抓到變色的幀 = 有看到,不可能是全盲'],
  ['沒命中但有幀可看 = 真訊號', { hit: null, framesAfter: 7 }, false, '2026-09-12 的真 bug 屬於這一類,必須照樣紅'],
  ['沒命中且零幀 = 儀器看不到', { hit: null, framesAfter: 0 }, true, '2026-09-20 main 誤紅那次'],
  // 2026-09-23:有幀,但串流在視窗裡停頓 —— 停頓期間主執行緒同在停,hover 沒被處理不是列沒變色
  ['沒命中、首幀晚到 1490ms = 串流停頓,看不到', { hit: null, framesAfter: 5, firstGap: 1490, maxGap: 20 }, true, 'PR #161 第三輪:靜置期送幀間隔最大 1490ms(門檻 1500)'],
  ['沒命中、幀距中途停頓 1231ms = 看不到', { hit: null, framesAfter: 12, firstGap: 17, maxGap: 1231 }, true, 'PR #159 第一輪:1231ms'],
  ['沒命中、幀距最大 355ms(綠燈輪的正常抖動)= 真訊號', { hit: null, framesAfter: 40, firstGap: 17, maxGap: 355 }, false, '綠燈輪靜置期抖動實測 341 / 355ms,不得被當成停頓'],
  ['命中即使有停頓也不是全盲', { hit: {}, framesAfter: 3, firstGap: 900, maxGap: 900 }, false, '有看到變色就是有看到'],
  ['沒命中、沒有幀距資訊(舊呼叫端)= 真訊號', { hit: null, framesAfter: 7 }, false, '缺資訊時不得放寬:預設仍是 lost'],
]) {
  const got = isStreamBlind(input)
  if (got !== want) { console.log(`✗ isStreamBlind:${name} 應為 ${want} 實得 ${got}(${why})`); fail++ }
  else console.log(`✓ isStreamBlind:${name}`)
}

// 取樣點的所有權(2026-09-25,C12①):取樣點被蓋住 = 看不到,不論有沒有命中;有證明屬於列時退回串流判定
for (const [name, input, want, why] of [
  ['取樣點被把手蓋住、沒命中 = 看不到', { owned: false, hit: null, framesAfter: 7, firstGap: 20, maxGap: 20 }, true, '2026-09-25 本機:捲動後左面板 4/4 列的舊取樣點被 BUTTON[拖曳重排此列] 蓋住'],
  ['取樣點被蓋住、卻「命中」= 仍是看不到', { owned: false, hit: {}, framesAfter: 3 }, true, '命中的可能正是把手淡入造成的變化(量到的是把手,不是列)'],
  ['取樣點屬於列、沒命中、有幀 = 真訊號', { owned: true, hit: null, framesAfter: 7 }, false, '2026-09-12 真 bug 那一類必須照樣紅'],
  ['取樣點屬於列、零幀 = 串流全盲', { owned: true, hit: null, framesAfter: 0 }, true, '與 isStreamBlind 同一條'],
  ['取樣點屬於列、命中 = 看得到', { owned: true, hit: {}, framesAfter: 2 }, false, '正常樣本'],
]) {
  const got = isBlindSample(input)
  if (got !== want) { console.log(`✗ isBlindSample:${name} 應為 ${want} 實得 ${got}(${why})`); fail++ }
  else console.log(`✓ isBlindSample:${name}`)
}
{
  let threw = false
  try { isBlindSample({ hit: null, framesAfter: 7 }) } catch { threw = true }
  if (!threw) { console.log('✗ isBlindSample:沒給 owned 應丟例外(沒量就是沒量,不得當成屬於)'); fail++ }
  else console.log('✓ isBlindSample:沒給 owned 丟例外(沒量不得當成屬於)')
}

for (const [name, input, want, why] of [
  ['沒命中就談不上上界', { hit: null, firstFrameIsHit: false, firstGap: 3000, assertMax: MAX }, false, 'NaN 樣本走 blind/lost 那條路'],
  ['命中的不是第一張幀 → 量到的是真的反應時間', { hit: {}, firstFrameIsHit: false, firstGap: 1461, assertMax: MAX }, false, '中間有幀可看,數字有意義'],
  ['命中第一張幀但它沒遲到 → 數字有意義', { hit: {}, firstFrameIsHit: true, firstGap: 40, assertMax: MAX }, false, '40ms 的空窗不足以解釋超標'],
  ['命中第一張幀且它本身就超標 → 只是上界', { hit: {}, firstFrameIsHit: true, firstGap: 1461, assertMax: MAX }, true, '2026-09-20 CI 實測的送幀間隔'],
  ['沒有首幀延遲數字時不得亂猜', { hit: {}, firstFrameIsHit: true, firstGap: NaN, assertMax: MAX }, false, 'NaN 不可比大小'],
]) {
  const got = isResolutionBound(input)
  if (got !== want) { console.log(`✗ isResolutionBound:${name} 應為 ${want} 實得 ${got}(${why})`); fail++ }
  else console.log(`✓ isResolutionBound:${name}`)
}

// 解析度受限的樣本必須被排除在「產品快慢」之外,但不得因此默默放行
{
  // 五個正常樣本(中位 40ms < 門檻 60、最大 55ms < 天花板 600)+ 一個串流空窗造成的 1461ms
  const samples = [30, 35, 40, 1461, 55, 45]
  const unresolved = [false, false, false, true, false, false]
  const kept = hoverVerdict({ samples, unresolved, assertMedian: MED, assertMax: MAX })
  if (kept.verdict !== 'pass' || kept.bounded !== 1 || kept.usable !== 5) {
    console.log(`✗ 解析度受限樣本應被排除且其餘判 pass,實得 ${JSON.stringify(kept)}`); fail++
  } else console.log('✓ 串流空窗的 1461ms 不再被當成列變慢(排除後其餘 5 個樣本判 pass)')

  // 對照組:同一批數字若**不**標成受限,就會以 max 超標紅 —— 證明這條真的在改變結果
  const naive = hoverVerdict({ samples, assertMedian: MED, assertMax: MAX })
  if (naive.verdict !== 'max') { console.log(`✗ 對照組:不標受限時應以 max 紅,實得 ${naive.verdict}`); fail++ }
  else console.log('✓ 對照組:不標受限時同一批數字會紅(這條旗標真的在改變判定,不是裝飾)')

  // 受限樣本太多 → 可用樣本不足 → 以**儀器失效**紅,不得默默放行
  const starved = hoverVerdict({ samples, unresolved: samples.map(() => true), assertMedian: MED, assertMax: MAX })
  if (starved.verdict !== 'starved') { console.log(`✗ 全部受限時應判 starved,實得 ${starved.verdict}`); fail++ }
  else console.log('✓ 全部受限 = 這一輪證明不了任何事,以儀器失效紅(不是靜默放行)')
}

// 執行面:閘必須真的用這兩支算旗標,不得在閘裡留第二份寫法
{
  const gateSrc = readFileSync(new URL('./data-table-hover-latency.mjs', import.meta.url), 'utf8')
  for (const sym of ['isBlindSample', 'isResolutionBound']) {
    const n = countCallSites(gateSrc, sym)
    if (n < 1) { console.log(`✗ 可達性:閘沒有呼叫 ${sym}`); fail++ }
    else console.log(`✓ 可達性:${sym} 有 ${n} 個呼叫點`)
  }
  if (/blindness\.push\((?!isBlindSample\()/.test(gateSrc)) { console.log('✗ 閘裡還留著第二份 blindness 寫法(每一筆都必須走 isBlindSample)'); fail++ }
  else console.log('✓ 閘裡沒有第二份 blindness 寫法(單一住所)')
}

// 閘的執行面必須真的消費這兩支,否則測得再漂亮也沒用(今天抓了一整天的那條)
// 可達性只數**呼叫點**:`includes('hoverVerdict(')` 會被 import 與註解命中,
// 把整段判定換掉照樣綠(2026-09-21 對抗稽核實測抓到)。共用 lib/gate-reachability.mjs。
const gate = readFileSync(new URL('./data-table-hover-latency.mjs', import.meta.url), 'utf8')
for (const [sym, why] of [['classifySamples', 'report() 必須用共用分類'], ['hoverVerdict', '判定必須走政策模組']]) {
  const n = countCallSites(gate, sym)
  if (n < 1) { console.log(`✗ 可達性:data-table-hover-latency.mjs 的 import/註解之外沒有 ${sym} 呼叫點 —— ${why}`); fail++ }
  else console.log(`✓ 可達性:${sym} 有 ${n} 個呼叫點(不含 import 與註解)`)
}

console.log(`\nMIN_USABLE_SAMPLES = ${MIN_USABLE_SAMPLES}`)
console.log(fail ? `✗ ${fail} 項不符` : '✅ hover 判定政策 PASS(真實 CI 數字判定表 + 對照組)')
process.exit(fail ? 1 : 0)
