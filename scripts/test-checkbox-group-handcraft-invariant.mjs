#!/usr/bin/env node
// meta-test for checkbox-group-handcraft-invariant — 注入「手刻容器包多個 option Checkbox」→ gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
// gate 掃 packages/design-system/src/**/*.tsx,偵測 <div grid/flex/space-y-N>{2+ <Checkbox label= />}(不在 CheckboxGroup 裡)。
// 注入目標選非 checkbox 檔(Badge),前面沒有還沒關掉的 <CheckboxGroup(否則 gate 視為在群組裡 → 假綠)。
// 豁免(@checkbox-group-handcraft-ok)兩面都用真實檔驗:出處對得上 → 綠;沒寫出處 / 出處那一行沒有引文 → 紅;
// repo 裡每一筆現有豁免拿掉 → 必紅且指名該檔(證明每一筆豁免都真的在放行東西)。
//
// 2026-11-21 起由 ci.yml verify-static 直呼(knowledge-prune WP-21b),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: checkbox-group-handcraft-invariant.mjs 在該紅的時候會紅、該放行的時候放行 —— 在 components/Badge/badge.tsx 末尾注入手刻 <div className="space-y-2"> 包兩個帶 label 的 <Checkbox />,閘必須 exit 非 0 且指名該檔;同一處上方加出處對得上的豁免必須放行並列進豁免清單;豁免沒寫出處、出處行號對不上引文都必須紅;repo 裡現有的每一筆豁免拿掉都必須紅且指名該檔;注入前與還原後閘都必須 exit 0
//   紅: 現況就紅(repo 已有真違規)、checkbox.spec.md 找不到「單一同意」(豁免夾具沒有出處可引)、注入後閘沒紅或沒指名該檔、有效豁免沒放行、壞豁免沒紅、拿掉現有豁免後沒紅、或還原後不綠 → 印出是哪一步並 exit 1
//   綠: 每一步都照預期時 exit 0;badge.tsx 與每支被拿掉豁免的檔都在 finally 寫回原文,豁免出處的行號從 checkbox.spec.md 現場算(不寫死),不讀時間,重複跑結果相同
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, globSync } from 'node:fs'

const GATE = 'scripts/checkbox-group-handcraft-invariant.mjs'
const MARKER = '@checkbox-group-handcraft-ok'
const run = () => {
  const r = spawnSync(process.execPath, ['--', GATE], { stdio: 'pipe', encoding: 'utf8' })
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` }
}
let ok = true
const check = (cond, pass, fail) => { if (cond) console.log(`✓ ${pass}`); else { console.error(`✗ ${fail}`); ok = false } }

// 1) 現況必 PASS
const base = run()
if (base.code !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 已有真實違規)\n' + base.out); process.exit(1) }
console.log('✓ baseline PASS(0 個手刻選項組)')

// 豁免出處:引文所在的行號從 spec 現場算,不寫死(spec 改動讓行號跑掉時 meta-test 不跟著腐爛)
const SPEC = 'packages/design-system/src/components/Checkbox/checkbox.spec.md'
const specLines = readFileSync(SPEC, 'utf8').split('\n')
const quoteLine = specLines.findIndex((l) => l.includes('**單一同意**')) + 1
if (quoteLine < 1) { console.error(`✗ ${SPEC} 找不到「**單一同意**」—— 豁免兩面的夾具沒有出處可引`); process.exit(1) }
const wrongLine = specLines.findIndex((l, i) => i + 1 !== quoteLine && !l.includes('單一同意')) + 1

// 2) 注入違規 → 必 FAIL → 還原
//    真實違規 = 手刻 <div space-y-2> 包 2 個帶可見 label 的 <Checkbox />(gate DS_GROUP regex 直命中)。
const target = 'packages/design-system/src/components/Badge/badge.tsx'
const orig = readFileSync(target, 'utf8')
const group = '<div className="space-y-2"><Checkbox label="meta-test-inject-a" /><Checkbox label="meta-test-inject-b" /></div>\n'
const inject = (above) => orig + '\n// meta-test-injected handcraft checkbox option-group (temporary)\n' + (above ? above + '\n' : '') + group
try {
  writeFileSync(target, inject(''))
  let r = run()
  check(r.code !== 0 && r.out.includes(target), `注入違規被抓且指名 ${target}(exit ${r.code})`, `注入手刻 option-group 後 gate 未 FAIL 或沒指名該檔(detection 失效)\n${r.out}`)

  // 3) 豁免的兩面
  writeFileSync(target, inject(`{/* ${MARKER}: ../Checkbox/checkbox.spec.md:${quoteLine}「單一同意」meta-test 夾具 */}`))
  r = run()
  check(r.code === 0 && r.out.includes(`${target}:`), `出處對得上的豁免 → 放行,且列在豁免清單(exit ${r.code})`, `出處對得上的豁免應放行並列出,實得 exit ${r.code}\n${r.out}`)

  writeFileSync(target, inject(`{/* ${MARKER}: 這兩個不是一組 */}`))
  r = run()
  check(r.code !== 0 && r.out.includes('沒寫出處'), `豁免沒寫出處 → 紅(exit ${r.code})`, `豁免沒寫出處應紅並說明,實得 exit ${r.code}\n${r.out}`)

  writeFileSync(target, inject(`{/* ${MARKER}: ../Checkbox/checkbox.spec.md:${wrongLine}「單一同意」meta-test 夾具 */}`))
  r = run()
  check(r.code !== 0 && r.out.includes('那一行沒有'), `出處行號對不上引文 → 紅(exit ${r.code})`, `出處行號對不上應紅並說明,實得 exit ${r.code}\n${r.out}`)
} finally {
  writeFileSync(target, orig)
}

// 4) repo 裡現有的每一筆豁免:拿掉 → 必紅且指名該檔 → 還原
const exempted = globSync('packages/design-system/src/**/*.tsx').filter((f) => readFileSync(f, 'utf8').includes(MARKER)).sort()
console.log(`  現有豁免所在檔:${exempted.length} 支`)
for (const f of exempted) {
  const src = readFileSync(f, 'utf8')
  try {
    writeFileSync(f, src.split('\n').filter((l) => !l.includes(MARKER)).join('\n'))
    const r = run()
    check(r.code !== 0 && r.out.includes(`${f}:`), `拿掉 ${f} 的豁免 → 紅且指名該檔(exit ${r.code})`, `拿掉 ${f} 的豁免後 gate 沒紅或沒指名(豁免沒有在放行任何東西?)\n${r.out}`)
  } finally {
    writeFileSync(f, src)
  }
}

// 5) 還原後必 PASS
if (run().code !== 0) { console.error('✗ 還原後應 PASS(還原不完整)'); process.exit(1) }
console.log('✓ 還原後 PASS')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
