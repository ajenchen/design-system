#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 中性互動階梯不變條件 —— 「不同的互動狀態不得長得一樣」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`tokens/color/color.spec.md`「Selected state family」段的階梯表。
//
// 為什麼需要:2026-09-07 實測抓到 `--neutral-selected-hover` 與 `--neutral-hover`
// **指向同一個色階**(neutral-1)。後果是切換鈕**按下與未按下,在滑鼠懸停時像素完全相同**
// (`variant='text'` 連文字色都一樣,兩態都是 foreground)——「這顆開著沒」的訊號
// 在 hover 當下整個消失。而且這種撞法在單看任何一個 token 定義時都是隱形的,
// 只有把整條階梯排在一起才看得出來。
//
// 兩條:
//   (L1) 五個狀態值必須**兩兩相異**(同一條階梯內不得有兩個狀態長一樣)
//   (L2) 每條階梯必須**單調遞增**(rest < hover < 按壓)——
//        違反的話「越用力顏色越淺」,跟使用者的直覺相反。
//
// 用色階序號比,不用最終色值:序號是設計意圖,色值只是它的投影
// (深淺兩個主題的 alpha 不同,但序號一致)。
//
// Run: `node scripts/interaction-ladder-invariant.mjs`(`--selftest` 跑正反例)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CSS = fileURLToPath(new URL('../packages/design-system/src/tokens/color/semantic.css', import.meta.url))

/** 兩條階梯:未按下、已按下。值是 semantic token 名。 */
const LADDERS = {
  '未按下': ['(透明)', '--neutral-hover', '--neutral-active'],
  '已按下': ['--neutral-selected', '--neutral-selected-hover', '--neutral-selected-active'],
}
const STEP_NAMES = ['rest', 'hover', '按壓']

/** 從 semantic.css 讀出每個 token 指向第幾階(`var(--color-neutral-N)` 的 N)。 */
export function readLadderSteps(css) {
  const out = {}
  for (const m of css.matchAll(/^\s*(--neutral[\w-]*):\s*var\(--color-neutral-(\d)\);/gm)) out[m[1]] = Number(m[2])
  return out
}

export function checkLadders(steps) {
  const problems = []
  for (const [name, tokens] of Object.entries(LADDERS)) {
    const vals = tokens.map((t) => (t === '(透明)' ? 0 : steps[t]))
    tokens.forEach((t, i) => {
      if (t !== '(透明)' && steps[t] === undefined) problems.push(`${name} 階梯的 ${t} 在 semantic.css 找不到(或不是指向 --color-neutral-N)`)
    })
    // L2 單調遞增
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] !== undefined && vals[i - 1] !== undefined && vals[i] <= vals[i - 1]) {
        problems.push(`${name} 階梯不是遞增:${STEP_NAMES[i - 1]}=${vals[i - 1]} → ${STEP_NAMES[i]}=${vals[i]}(${tokens[i]})`)
      }
    }
  }
  // L1 兩兩相異(跨階梯也要看:未按下 hover 與已按下 hover 撞就是 2026-09-07 那個 bug)
  const flat = []
  for (const [name, tokens] of Object.entries(LADDERS))
    tokens.forEach((t, i) => { if (t !== '(透明)') flat.push({ label: `${name}·${STEP_NAMES[i]}`, token: t, step: steps[t] }) })
  for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
    // 「已按下·rest」與「未按下·按壓」同值是可接受的:兩者不會在同一瞬間並存於同一顆鈕。
    const pair = [flat[i].label, flat[j].label].sort().join(' vs ')
    if (pair === '已按下·rest vs 未按下·按壓') continue
    if (flat[i].step !== undefined && flat[i].step === flat[j].step) {
      problems.push(`${flat[i].label}(${flat[i].token})與 ${flat[j].label}(${flat[j].token})指向同一階 neutral-${flat[i].step} —— 這兩個狀態畫面上分不出來`)
    }
  }
  return problems
}

if (process.argv.includes('--selftest')) {
  const good = { '--neutral-hover': 1, '--neutral-active': 2, '--neutral-selected': 2, '--neutral-selected-hover': 3, '--neutral-selected-active': 4 }
  const cases = [
    { n: '正確階梯', steps: good, bad: false },
    { n: '2026-09-07 的實際 bug(selected-hover 撞 hover)', steps: { ...good, '--neutral-selected-hover': 1 }, bad: true },
    { n: 'hover 與按壓同值', steps: { ...good, '--neutral-selected-active': 3 }, bad: true },
    { n: '已按下階梯反向(hover 比 rest 淺)', steps: { ...good, '--neutral-selected-hover': 1, '--neutral-selected-active': 4 }, bad: true },
  ]
  let ok = true
  for (const c of cases) {
    const got = checkLadders(c.steps).length > 0
    if (got !== c.bad) { console.error(`✗ selftest「${c.n}」預期 ${c.bad} 實得 ${got}`); ok = false }
  }
  console.log(ok ? `✓ selftest ${cases.length}/${cases.length} 通過` : '✗ selftest 失敗')
  process.exit(ok ? 0 : 1)
}

const steps = readLadderSteps(readFileSync(CSS, 'utf8'))
const problems = checkLadders(steps)
if (problems.length) {
  console.error('✗ 中性互動階梯有問題(SSOT:tokens/color/color.spec.md「Selected state family」):')
  problems.forEach((p) => console.error('    ' + p))
  process.exit(1)
}
const fmt = (t) => `${t}=neutral-${steps[t]}`
console.log('✓ 互動階梯單調且處處不撞')
console.log(`    未按下  透明 → ${fmt('--neutral-hover')} → ${fmt('--neutral-active')}`)
console.log(`    已按下  ${fmt('--neutral-selected')} → ${fmt('--neutral-selected-hover')} → ${fmt('--neutral-selected-active')}`)
