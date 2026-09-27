#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: semantic.css 裡每一個 `-hover` token 都跟它的靜止底(與 `-active`,若有)組成一條階梯,兩個主題各驗一次:
 *         同一條階梯的狀態兩兩相異;中性階梯單調遞增、而且 hover 恰好是靜止底的下一階;切換鈕的「未按下 / 已按下」兩條階梯彼此不撞
 *   紅: --selftest 以合成 CSS 注入 2026-09-07 的真實 bug(--neutral-selected-hover 撞 --neutral-hover)、hover 與按壓同值、
 *       新 token 的 hover 等於自己的靜止底、新 token 跳階(n3 → n5)、新 token 反向(越滑越淺),五種都必須指名紅
 *   綠: 現行 semantic.css 必須綠且至少讀到 10 條階梯(讀不到 = 解析器壞了,以儀器失效紅,不讀成通過);
 *        合成的正確階梯(含新 token 下一階)必須綠;純讀檔,重複跑結果相同
 */
// ═══════════════════════════════════════════════════════════════════════════
// 互動階梯不變條件 —— 「不同的互動狀態不得長得一樣,而且 hover 是自己靜止底的下一階」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`tokens/color/color.spec.md`「Selected state family」段的階梯表 + 階梯表旁的「Hover 換色配對總則」。
//
// 為什麼需要:2026-09-07 實測抓到 `--neutral-selected-hover` 與 `--neutral-hover`
// **指向同一個色階**(neutral-1)。後果是切換鈕**按下與未按下,在滑鼠懸停時像素完全相同**
// (`variant='text'` 連文字色都一樣,兩態都是 foreground)——「這顆開著沒」的訊號
// 在 hover 當下整個消失。而且這種撞法在單看任何一個 token 定義時都是隱形的,
// 只有把整條階梯排在一起才看得出來。
//
// **2026-09-25 擴大到所有 `-hover` token**:第一版只讀 `--neutral*` 開頭、而且兩條階梯是寫死的 ——
// 之後新增的配對 token(例:`--surface-hover` / `--secondary-hover`)這支閘看不到,
// 跳階、反向、撞到自己的靜止底都不會紅。現在階梯從 semantic.css 現讀:每個 `--X-hover` 的靜止底 =
//   `--X` 有定義 → `--X`;淺色值是 `var(--color-X-5)` → `--color-X-6`(色相 hover = step-5);都不是 → 透明(第 0 階)。
// 按壓 = `--X-active`(有定義才算)。
//
// 規則:
//   (L1) 同一條階梯內兩兩相異(靜止 / hover / 按壓)。
//   (L2) 中性階梯(黑白透明度或不透明灰階)單調遞增:靜止 < hover < 按壓 —— 違反 = 「越用力顏色越淺」。
//   (L3) 中性階梯的 hover = 靜止底的**下一階**(color.spec.md「Hover 換色配對總則」)。
//   (L4) 切換鈕同一顆鈕的兩條階梯(未按下 = 透明底家族、已按下 = --neutral-selected 家族)跨階梯也不得撞,
//        唯一例外:「已按下·靜止」與「未按下·按壓」(兩者不會同時出現在同一顆鈕上)。
//   色相家族(--primary / --error / --blue… 等)的 hover 與按壓方向由 color.spec.md「互動狀態推導」公式定
//   (淺色 hover 5、按壓 7;深色對調),不套 L2/L3,只驗 L1。
//   其他跨階梯的同值只**列出**不擋:值相同但語意不同是允許的(color.spec.md「不得因為目前同值就合併」)。
//
// 用色階序號比,不用最終色值:序號是設計意圖,色值只是它的投影
// (深淺兩個主題的 alpha 不同,但序號一致)。
//
// Run: `node scripts/interaction-ladder-invariant.mjs`(`--selftest` 跑正反例)

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEMANTIC = fileURLToPath(new URL('../packages/design-system/src/tokens/color/semantic.css', import.meta.url))
const PRIMITIVES = fileURLToPath(new URL('../packages/design-system/src/tokens/color/primitives.css', import.meta.url))
const STEP_NAMES = ['rest', 'hover', '按壓']

// ── 讀檔 ────────────────────────────────────────────────────────────────────

/** 取出某個選擇器區塊的 `--name: value;`(淺色 = `:root, [data-theme]`,深色 = `[data-theme="dark"]`) */
function readBlock(css, selector) {
  const out = new Map()
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const start = stripped.indexOf(`${selector} {`)
  if (start < 0) return out
  let depth = 0, i = stripped.indexOf('{', start), end = i
  for (; end < stripped.length; end++) {
    if (stripped[end] === '{') depth++
    else if (stripped[end] === '}' && --depth === 0) break
  }
  for (const m of stripped.slice(i + 1, end).matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim())
  return out
}

/** 兩個主題的 alpha 階梯(`--_naN`,百分比)—— 用來把 `--black-aNN` / `--white-aNN` 換回階梯序號 */
function readAlphaSteps(primitivesCss) {
  const read = (block) => {
    const steps = new Map()
    for (const [k, v] of block) { const m = k.match(/^--_na(\d)$/); if (m) steps.set(Number.parseFloat(v), Number(m[1])) }
    return steps
  }
  return { light: read(readBlock(primitivesCss, ':root, [data-theme]')), dark: read(readBlock(primitivesCss, '[data-theme="dark"]')) }
}

/**
 * 把一個 token 在某主題下解析成 { scale, step }。scale:'neutral'(該主題的中性階梯)/ 'inverse'(反相階梯)/ `hue:<名>`。
 * 解析不了回 null(例:color-mix)。
 */
export function makeResolver(semanticCss, primitivesCss) {
  const light = readBlock(semanticCss, ':root, [data-theme]')
  const dark = readBlock(semanticCss, '[data-theme="dark"]')
  const alpha = readAlphaSteps(primitivesCss)
  const resolveIn = (mode, token, seen = new Set()) => {
    if (seen.has(token)) return null
    seen.add(token)
    const raw = (mode === 'dark' && dark.has(token)) ? dark.get(token) : light.get(token)
    const direct = token.match(/^--color-neutral-(\d)(-opaque)?$/)
    if (direct) return { scale: 'neutral', step: Number(direct[1]), opaque: !!direct[2] }
    if (token === '--color-white') return mode === 'light' ? { scale: 'neutral', step: 0 } : null
    const bw = token.match(/^--(black|white)-a(\d\d)$/)
    if (bw) {
      const pct = Number(bw[2])
      const own = mode === 'light' ? 'black' : 'white'
      const table = bw[1] === own ? alpha[mode] : alpha[mode === 'light' ? 'dark' : 'light']
      return table.has(pct) ? { scale: bw[1] === own ? 'neutral' : 'inverse', step: table.get(pct) } : null
    }
    const hue = token.match(/^--color-([a-z-]+?)-(\d+)$/)
    if (hue) return { scale: `hue:${hue[1]}`, step: Number(hue[2]) }
    if (!raw) return null
    const v = raw.match(/^var\((--[A-Za-z0-9_-]+)\)$/)
    return v ? resolveIn(mode, v[1], seen) : null
  }
  return { light, dark, resolveIn }
}

/** 每個 `--X-hover` → 一條階梯 { name, rest, hover, active? } */
export function readLadders(semanticCss, primitivesCss) {
  const r = makeResolver(semanticCss, primitivesCss)
  const ladders = []
  for (const [token, value] of r.light) {
    const m = token.match(/^--(.+)-hover$/)
    if (!m) continue
    const stem = m[1]
    let rest
    if (r.light.has(`--${stem}`)) rest = `--${stem}`
    else if (value === `var(--color-${stem}-5)`) rest = `--color-${stem}-6`
    else rest = '(透明)'
    ladders.push({ name: stem, rest, hover: token, active: r.light.has(`--${stem}-active`) ? `--${stem}-active` : null })
  }
  return { ladders, resolver: r }
}

// ── 判定 ────────────────────────────────────────────────────────────────────

const isNeutralScale = (s) => s === 'neutral' || s === 'inverse'

export function checkLadders({ ladders, resolver }) {
  const problems = []
  const notes = []
  const resolved = { light: new Map(), dark: new Map() }
  for (const mode of ['light', 'dark']) {
    for (const L of ladders) {
      const tokens = [L.rest, L.hover, L.active].filter(Boolean)
      const vals = tokens.map((t) => (t === '(透明)' ? { scale: null, step: 0 } : resolver.resolveIn(mode, t)))
      const scale = vals.find((v) => v && v.scale)?.scale ?? null
      if (vals[0] && vals[0].scale === null) vals[0] = { scale, step: 0 }          // 透明 = 同一條階梯的第 0 階
      resolved[mode].set(L.name, { tokens, vals })
      const fmt = (i) => `${STEP_NAMES[i]}=${vals[i] ? `${vals[i].scale}-${vals[i].step}` : '?'}(${tokens[i]})`
      if (vals.some((v) => !v)) { notes.push(`[${mode}] ${L.name} 階梯有值解析不了,只驗得到的部分:${tokens.map((_, i) => fmt(i)).join(' → ')}`) }
      // (L1) 同一條階梯兩兩相異
      for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
        if (vals[i] && vals[j] && vals[i].scale === vals[j].scale && vals[i].step === vals[j].step) {
          problems.push(`[${mode}] ${L.name} 階梯:${fmt(i)} 與 ${fmt(j)} 同一階 —— 這兩個狀態畫面上分不出來`)
        }
      }
      if (!vals.every((v) => v && v.scale === scale) || !isNeutralScale(scale)) continue
      // (L2) 中性階梯單調遞增
      for (let i = 1; i < vals.length; i++) {
        if (vals[i].step <= vals[i - 1].step) problems.push(`[${mode}] ${L.name} 階梯不是遞增:${fmt(i - 1)} → ${fmt(i)}(越用力顏色越淺 / 沒變)`)
      }
      // (L3) hover = 靜止底的下一階
      if (vals[1].step !== vals[0].step + 1 && vals[1].step > vals[0].step) {
        problems.push(`[${mode}] ${L.name} 階梯跳階:${fmt(0)} → ${fmt(1)}(hover 必須是靜止底的下一階,color.spec.md「Hover 換色配對總則」)`)
      }
    }
    // (L4) 切換鈕的兩條階梯(同一顆鈕的兩個狀態)跨階梯不得撞
    const un = resolved[mode].get('neutral'), on = resolved[mode].get('neutral-selected')
    if (!un || !on) { problems.push(`[${mode}] 找不到切換鈕的兩條階梯(--neutral-hover / --neutral-selected-hover)—— 階梯表被改名或解析器壞了`); continue }
    const flat = [...un.vals.map((v, i) => ({ label: `未按下·${STEP_NAMES[i]}`, token: un.tokens[i], v })), ...on.vals.map((v, i) => ({ label: `已按下·${STEP_NAMES[i]}`, token: on.tokens[i], v }))]
    for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i], b = flat[j]
      if (a.label.slice(0, 3) === b.label.slice(0, 3)) continue                      // 同一條階梯已由 L1 管
      // 「已按下·rest」與「未按下·按壓」同值是可接受的:兩者不會在同一瞬間並存於同一顆鈕。
      if ([a.label, b.label].sort().join(' vs ') === '已按下·rest vs 未按下·按壓') continue
      if (a.v && b.v && a.v.step === b.v.step && a.v.scale === b.v.scale) {
        problems.push(`[${mode}] ${a.label}(${a.token})與 ${b.label}(${b.token})指向同一階 ${a.v.scale}-${a.v.step} —— 切換鈕這兩個狀態畫面上分不出來`)
      }
    }
    // 其他跨階梯同值:只列出(不同語意允許同值)。只看中性階梯 —— 色相家族的同值是
    // 刻意的別名(--primary / --info / --blue 同指 blue),列出來只是雜訊
    const seen = new Map()
    for (const [, { tokens, vals }] of resolved[mode]) vals.forEach((v, i) => {
      if (!v || !isNeutralScale(v.scale) || (i === 0 && tokens[0] === '(透明)')) return
      const k = `${v.scale}-${v.step}${v.opaque ? '(不透明)' : ''}`
      if (!seen.has(k)) seen.set(k, [])
      seen.get(k).push(`${tokens[i]}`)
    })
    for (const [k, list] of seen) {
      const uniq = [...new Set(list)]
      if (uniq.length > 1) notes.push(`[${mode}] 同值(提示,不擋):${k} ← ${uniq.join(' / ')}`)
    }
  }
  return { problems, notes, resolved }
}

// ── selftest ────────────────────────────────────────────────────────────────

function selftest() {
  const primitives = readFileSync(PRIMITIVES, 'utf8')
  const real = readFileSync(SEMANTIC, 'utf8')
  // 只改淺色區塊裡的一行(`:root, [data-theme]` 那一段),其餘照抄現行 semantic.css
  const inject = (line, replacement) => {
    const at = real.indexOf(line)
    if (at < 0) throw new Error(`selftest 注入錨點不見了:${line}`)
    return real.slice(0, at) + replacement + real.slice(at + line.length)
  }
  const addToLight = (extra) => inject(':root, [data-theme] {', `:root, [data-theme] {\n${extra}\n`)
  const cases = [
    { n: '現行 semantic.css', css: real, bad: false },
    { n: '2026-09-07 的實際 bug(selected-hover 撞 hover)', css: inject('--neutral-selected-hover:   var(--color-neutral-3);', '--neutral-selected-hover:   var(--color-neutral-1);'), bad: true, must: /neutral-selected/ },
    { n: 'hover 與按壓同值', css: inject('--neutral-selected-active:  var(--color-neutral-4);', '--neutral-selected-active:  var(--color-neutral-3);'), bad: true, must: /同一階/ },
    { n: '新 token 的 hover 等於自己的靜止底', css: addToLight('  --chip-fill: var(--color-neutral-3);\n  --chip-fill-hover: var(--color-neutral-3);'), bad: true, must: /chip-fill/ },
    { n: '新 token 跳階(n3 → n5)', css: addToLight('  --chip-fill: var(--color-neutral-3);\n  --chip-fill-hover: var(--color-neutral-5);'), bad: true, must: /跳階/ },
    { n: '新 token 反向(越滑越淺)', css: addToLight('  --chip-fill: var(--color-neutral-3);\n  --chip-fill-hover: var(--color-neutral-2);'), bad: true, must: /不是遞增/ },
    { n: '新 token 下一階(n3 → n4,與 --divider 同值只提示)', css: addToLight('  --chip-fill: var(--color-neutral-3);\n  --chip-fill-hover: var(--color-neutral-4);'), bad: false },
  ]
  let ok = true
  for (const c of cases) {
    const { problems } = checkLadders(readLadders(c.css, primitives))
    const got = problems.length > 0
    const named = !c.must || problems.some((p) => c.must.test(p))
    const pass = got === c.bad && named
    if (!pass) ok = false
    console.log(`${pass ? '✓' : '✗'} selftest「${c.n}」預期${c.bad ? '紅' : '綠'},實得${got ? '紅' : '綠'}${c.must && got && !named ? `(但沒指名 ${c.must})` : ''}`)
    if (!pass) problems.forEach((p) => console.log(`    ${p}`))
  }
  console.log(ok ? `✓ selftest ${cases.length}/${cases.length} 通過` : '✗ selftest 失敗')
  return ok
}

// ── main ────────────────────────────────────────────────────────────────────

function main() {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  const model = readLadders(readFileSync(SEMANTIC, 'utf8'), readFileSync(PRIMITIVES, 'utf8'))
  // 沒讀到東西 ≠ 沒有問題(M37):解析器或檔案結構壞了,不能讀成通過
  if (model.ladders.length < 10) {
    console.error(`INSTRUMENT-FAIL:只從 semantic.css 讀到 ${model.ladders.length} 條 -hover 階梯(預期至少 10)—— 量具沒拿到資料,不能讀成通過`)
    process.exit(1)
  }
  const { problems, notes, resolved } = checkLadders(model)
  if (problems.length) {
    console.error('✗ 互動階梯有問題(SSOT:tokens/color/color.spec.md「Selected state family」階梯表 + 「Hover 換色配對總則」):')
    problems.forEach((p) => console.error('    ' + p))
    process.exit(1)
  }
  console.log(`✓ ${model.ladders.length} 條 -hover 階梯,兩個主題都兩兩相異;中性階梯單調遞增且 hover 為下一階;切換鈕兩條階梯處處不撞`)
  for (const mode of ['light', 'dark']) {
    const fmt = (name) => {
      const r = resolved[mode].get(name)
      return r ? r.vals.map((v, i) => `${r.tokens[i]}=${v ? `${v.scale}-${v.step}` : '?'}`).join(' → ') : '(無)'
    }
    console.log(`  [${mode}] 未按下  ${fmt('neutral')}`)
    console.log(`  [${mode}] 已按下  ${fmt('neutral-selected')}`)
  }
  notes.forEach((n) => console.log('  · ' + n))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
