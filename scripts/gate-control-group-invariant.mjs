#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 進 required CI 的每一支閘,都明確宣告了它保證什麼、以及紅綠兩側的對照組怎麼做
 *   紅: 把任一支閘的 @gate-contract 宣告刪掉(或只留紅那一側)→ 本閘必須指名該檔並紅
 *   綠: 宣告齊全時必須綠;selftest 以合成腳本雙向驗(齊全→放行、缺任一鍵→抓出來),不靠關鍵字猜
 *
 * ── 為什麼有這支 ──
 *
 * 2026-09-20 盤點:44 支 required CI 的閘裡,只有 1 支有雙向對照組,18 支只有「壞了會紅」,
 * 25 支兩邊都沒有。**「沒壞要綠」那一半在整個閘體系裡幾乎不存在。**
 *
 * 那一半正是同一天三次誤報的所在:DataTable 的 branch-vs-main 比值閘在**零執行期改動**的
 * commit 上連紅三次(幀距單趟最大:同一份建置量到 215 與 311,散布 ±45%;長工合計:main
 * 自己 849–1552,1.83×),而門檻是 1.25×。**噪音比門檻寬時,紅燈和綠燈都不帶資訊。**
 * 既有的 M32「儀器要先有對照組」只寫了「弄壞它會紅嗎」,從來沒要求過反面。
 *
 * 更根本的是:今天所有問題是同一個形狀 —— **用一個「當時剛好成立的觀察值」代替它真正要
 * 保證的事,然後再也沒人問這個觀察值還代表不代表那件事**(同意閘用 commit SHA 代替「user 同意
 * 這份工作」;必過 check 用名字代替「consumer 驗證過」;出處判定用 job 名代替「誰產生了它」)。
 * 逼每支閘**用人話寫下它保證什麼**,就是逼作者當場發現自己用的是代理。
 *
 * ── 為什麼是棘輪而不是一次全要求 ──
 *
 * 43/44 不合規,一次要求等於一面紅牆:沒人評估得了落點,最後只會被整支關掉。
 * 所以鎖 baseline:**新增或新接進 CI 的閘必須合規**,既有的逐步補、數字只准往下。
 * 與 `gate-reachability-invariant.mjs` 同一套作法。
 *
 * 用法: node scripts/gate-control-group-invariant.mjs [--selftest] [--update-baseline]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE = join(ROOT, 'scripts/gate-control-group-baseline.json')
const SELF = 'scripts/gate-control-group-invariant.mjs'

/** 宣告格式:三個鍵都必須有、且不是敷衍的空話。 */
const REQUIRED_KEYS = Object.freeze(['保證', '紅', '綠'])
const MIN_LEN = 12

/**
 * 從腳本原始碼取出 @gate-contract 宣告。
 * 刻意只認**明確宣告**,不從行文關鍵字猜 —— 用關鍵字猜就又是一個代理,正是本閘要消滅的東西。
 */
export function readGateContract(source) {
  const start = source.indexOf('@gate-contract')
  if (start < 0) return { ok: false, reason: '沒有 @gate-contract 宣告' }
  const block = source.slice(start, start + 2000)
  const missing = []
  const thin = []
  for (const key of REQUIRED_KEYS) {
    const m = block.match(new RegExp(`${key}\\s*[:：]\\s*(.+)`))
    if (!m) { missing.push(key); continue }
    if (m[1].trim().length < MIN_LEN) thin.push(key)
  }
  if (missing.length) return { ok: false, reason: `宣告缺少:${missing.join('、')}` }
  if (thin.length) return { ok: false, reason: `宣告過短(像敷衍):${thin.join('、')}` }
  return { ok: true }
}

/** required CI 實際呼叫到的閘 → 腳本路徑。沿用「誰呼叫它」而不是「檔名像閘」。 */
function gatesInRequiredCi() {
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts || {}
  const out = new Map()
  // (a) 經 npm script 呼叫
  for (const name of new Set([...ci.matchAll(/npm run (test:[a-z0-9-]+)/g)].map((m) => m[1]))) {
    for (const m of `${pkg[name] || ''}`.matchAll(/scripts\/[A-Za-z0-9._-]+\.mjs/g)) {
      if (existsSync(join(ROOT, m[0]))) out.set(m[0], name)
    }
  }
  // (b) **在 ci.yml 裡直接 `node scripts/xxx.mjs` 呼叫**。
  // 漏掉這條的話會放過主角:今天三次誤報的 data-table-fast-scroll.mjs 就是這樣被呼叫的,
  // 只認 npm script 等於量具自己有盲點 —— 而那正是本閘要消滅的東西。
  for (const m of ci.matchAll(/node (scripts\/[A-Za-z0-9._-]+\.mjs)/g)) {
    if (existsSync(join(ROOT, m[1]))) out.set(m[1], 'ci.yml 直接呼叫')
  }
  return out
}

function selftest() {
  const compliant = `/**\n * @gate-contract\n *   保證: 這裡寫一句夠長的人話說明它保證什麼東西\n *   紅: 把被保證的東西弄壞一次,它必須指名該處並紅\n *   綠: 沒弄壞時必須綠,而且重複跑不會抽籤\n */`
  const cases = [
    ['宣告齊全 → 放行', compliant, true],
    ['完全沒有宣告 → 抓出來', '// 一支普通的閘,沒有任何宣告\n', false],
    ['只有「紅」那一半 → 抓出來(今天三次誤報就在缺的那半)',
      `/**\n * @gate-contract\n *   保證: 這裡寫一句夠長的人話說明它保證什麼東西\n *   紅: 把被保證的東西弄壞一次,它必須指名該處並紅\n */`, false],
    ['缺「保證」→ 抓出來(不寫保證什麼,就不會發現自己用的是代理)',
      `/**\n * @gate-contract\n *   紅: 把被保證的東西弄壞一次,它必須指名該處並紅\n *   綠: 沒弄壞時必須綠,而且重複跑不會抽籤\n */`, false],
    ['宣告在但敷衍(過短)→ 抓出來', `/**\n * @gate-contract\n *   保證: 有\n *   紅: 會紅\n *   綠: 會綠\n */`, false],
  ]
  let ok = true
  for (const [why, source, expectPass] of cases) {
    const got = readGateContract(source).ok
    const pass = got === expectPass
    if (!pass) ok = false
    console.log(`${pass ? '✓' : '✗'} 對照組:${why}(預期${expectPass ? '放行' : '抓出來'},實得${got ? '放行' : '抓出來'})`)
  }
  return ok
}

function main() {
  const gates = gatesInRequiredCi()
  const missing = []
  for (const [path, npmScript] of gates) {
    if (path === SELF) continue
    const verdict = readGateContract(readFileSync(join(ROOT, path), 'utf8'))
    if (!verdict.ok) missing.push({ path, npmScript, reason: verdict.reason })
  }

  if (process.argv.includes('--update-baseline')) {
    writeFileSync(BASELINE, `${JSON.stringify({
      note: '進 required CI 但尚未宣告 @gate-contract 的閘。棘輪:新增的立刻紅,既有的逐步補,數字只准往下。',
      generatedBy: SELF,
      count: missing.length,
      gates: missing.map((m) => m.path).sort(),
    }, null, 2)}\n`)
    console.log(`已記錄 baseline:${missing.length} 支尚未宣告`)
    return
  }

  if (process.argv.includes('--selftest')) { process.exitCode = selftest() ? 0 : 1; return }

  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).gates || [] : []
  const known = new Set(baseline)
  const added = missing.filter((m) => !known.has(m.path))
  const fixed = baseline.filter((p) => !missing.some((m) => m.path === p))

  console.log(`required CI 呼叫到 ${gates.size} 支閘;已宣告 @gate-contract:${gates.size - missing.length} 支`)
  console.log(`尚未宣告:${missing.length} 支(baseline ${baseline.length})`)
  if (fixed.length) console.log(`✓ 這次補上了 ${fixed.length} 支:${fixed.join(', ')}(記得跑 --update-baseline 收緊棘輪)`)

  if (added.length) {
    console.error(`\n✗ ${added.length} 支新的閘沒有 @gate-contract 宣告:\n`)
    for (const m of added) console.error(`  ${m.path}(${m.npmScript}）—— ${m.reason}`)
    console.error('\n每支進 required CI 的閘都要寫清楚三件事,缺一不可:')
    console.error('  保證: 它到底保證什麼(人話一句;寫不出來,通常代表你用的是代理而不是那件事本身)')
    console.error('  紅:   把那件事弄壞一次,它必須指名該處並紅')
    console.error('  綠:   沒弄壞時必須綠 —— 而且要說明怎麼確認不是抽籤(重複跑 / 用聚合量而非尾端統計)')
    process.exitCode = 1; return
  }

  if (!selftest()) {
    console.error('\n✗ 對照組沒過 —— 這支量具現在的綠燈不算證據')
    process.exitCode = 1; return
  }
  console.log('✓ 沒有新增未宣告的閘,且對照組雙向都會動')
}

// 被 import 當模組時不得有副作用 —— 判定表要 import readGateContract
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
