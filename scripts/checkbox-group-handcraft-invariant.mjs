#!/usr/bin/env node
// checkbox-group-handcraft-invariant — 防「手刻容器包多個 option Checkbox」復發
//
// @gate-contract
//   保證: packages/design-system/src 的 .tsx 裡,每一個直接包兩個以上「帶可見 label 的 <Checkbox>」(或兩個以上 raw <label><input type="checkbox">)的 <div> 都在 <CheckboxGroup> 裡;唯一的例外是逐行豁免,而豁免必須引得出 spec 原文(檔:行 + 該行真的有的「引文」),且底下真的有它要放行的那一處
//   紅: 把任一處 <CheckboxGroup> 換回手刻 <div className="flex flex-col">、拿掉一個有效豁免、豁免沒寫出處 / 出處那一行沒有那段引文 / 出處檔不存在、或豁免底下已經沒有手刻組(過期標記)→ 指名「檔:行 + 原因」並 exit 1;以真實檔注入的兩面在 scripts/test-checkbox-group-handcraft-invariant.mjs
//   綠: 全部合規時 exit 0,印出掃描檔數與每一筆豁免的檔:行;判定是純文字比對、不讀時間也不讀網路,同一棵樹重跑結果相同;--selftest 的判定表兩面都有(該抓的抓到、不該抓的放行)
//
// 不變式(2026-06-15;user 連抓 popover/sheet/coachmark/checkbox.principles 漏網):
//   一組「邏輯相關的選項 Checkbox」(filter / 權限 / 通知偏好 / 檢閱器的開關列)必須用
//   <CheckboxGroup>,不可手刻 <div grid|flex|space-y-N> + 多個 <Checkbox>。
//   CheckboxGroup 自帶 zero-gap canonical(間距 = SelectionItem py,與 RadioGroup SSOT 共用,
//   checkbox.spec.md「Canonical 鐵律:零外部 gap」/ checkbox-group.tsx)。手刻 space-y-N / gap-N 破壞此 SSOT。
//
// 判法是語法上的代理,不是語意:「兩個 Checkbox 在同一個容器」判不出「是不是同一組選項」(M37)。
//   彼此不相干、各自獨立的勾選框(checkbox.spec.md「單一同意」:服務條款、訂閱行銷各是一個)不是一組,
//   不該包 CheckboxGroup —— 這種情況用逐行豁免,不改判法:
//     {/* @checkbox-group-handcraft-ok: <相對本檔的路徑>.spec.md:<行>「<該行原文的一段>」<一句理由> */}
//     <div className="…">        ← 豁免只管正下方這一行(或同一行、寫在 <div 前面)
//   出處會被核對:檔要存在、那一行要真的含「」裡的字。spec 改動讓行號跑掉 → 本閘紅、請更新行號
//   (出處對不上的豁免等於沒寫出處)。豁免底下沒有手刻組 → 過期標記,也紅。
//
// 零誤判判別:
//   - 只抓有「可見 label=」的 Checkbox(= 選項組);只有 aria-label= 的(狀態展示
//     off/on/indeterminate/disabled,如 checkbox.stories 狀態行)不算選項組 → 不誤判。
//   - 也抓 raw <label><input type="checkbox">選項</label> ×2(popover anatomy 類);
//     bare <input checked onChange>(story dev knob)不匹配。
//   - 不再排除 checkbox 路徑檔(2026-06-15 修:原排除害 checkbox.principles 漏掃)。
//   - 容器與選項之間、選項與選項之間夾 JSX 註解照抓(2026-11-20 修:selection-item.anatomy 檢閱器
//     的開關列前面有一行註解,舊 regex 要求 <div> 後面緊接 <Checkbox,因此漏掃)。
//   - 容器 class 只要含 grid / flex / space-y-N 就算(2026-11-20 修:原本只認 flex-col / flex-wrap,
//     水平手刻列 `flex gap-4` 漏掃)。
//   - 「在不在 CheckboxGroup 裡」看結構:前面有沒有還沒關掉的 <CheckboxGroup(2026-11-20 修:原本看
//     前 200 字有沒有出現 'CheckboxGroup' 這個字 —— 兄弟範例的 </CheckboxGroup> 剛好落在 200 字內,
//     checkbox.anatomy「水平排列」那一則因此被放過)。註解裡提到的「<CheckboxGroup>」先遮掉、不算標籤。
//   已知盲點:選項包在自訂元件裡(例:`const Toggle = (…) => <Checkbox label … />`,再 <Toggle> ×N)
//   語法上看不到 <Checkbox,本閘抓不到,靠 review。

import { readFileSync, existsSync, globSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
export const MARKER = '@checkbox-group-handcraft-ok'

// 可夾在容器開頭與選項之間、選項與選項之間的 JSX 註解
const CMT = String.raw`(?:\{\/\*[\s\S]*?\*\/\}\s*)*`
// 可見 label= 的 Checkbox(排除 aria-label=:用 negative lookbehind 擋 `-label`)
const ITEM = String.raw`<Checkbox\b(?:(?!\/>)[\s\S]){0,400}?(?<!-)label=(?:(?!\/>)[\s\S]){0,400}?\/>\s*`
const DS_GROUP = new RegExp(String.raw`<div className="[^"]*(?:\bgrid\b|\bflex\b|space-y-[0-9])[^"]*">\s*` + CMT + String.raw`(?:` + ITEM + CMT + String.raw`){2,}`, 'g')
// raw <label><input type=checkbox>text</label> ×2(option group,非 bare dev knob)
const RAW_GROUP = /(?:<label[^>]*>\s*<input[^>]*type="checkbox"[^>]*\/?>[^<]*<\/label>\s*){2,}/g
// 豁免的出處:<路徑>.spec.md:<行>「<引文>」
const CITE = /([^\s「」:]+\.spec\.md):(\d+)\s*「([^」]+)」/

/** 註解換成等長空白(位置不變):註解裡提到的「<CheckboxGroup>」不是真的標籤,不能算進開合 */
const maskComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, (s) => ' '.repeat(s.length))

/** idx 之前是否還有沒關掉的 <CheckboxGroup(結構判定,不看字數範圍);masked = maskComments(src) */
function insideCheckboxGroup(masked, idx) {
  const before = masked.slice(0, idx)
  const opens = (before.match(/<CheckboxGroup\b/g) || []).length
  const closes = (before.match(/<\/CheckboxGroup>/g) || []).length
  return opens > closes
}

/** 0-based 行號 i 起往上,讀「只有 JSX 註解」的那一段;回傳 { text, startLine } 或 null */
function commentBlockEndingAt(lines, i) {
  if (i < 0 || !/\*\/\}\s*$/.test(lines[i])) return null
  for (let j = i; j >= 0; j--) {
    const k = lines[j].indexOf('{/*')
    if (k >= 0) {
      if (lines[j].slice(0, k).trim() !== '') return null // 註解前面還有程式碼 → 不是「只有註解的一行」
      return { text: lines.slice(j, i + 1).join('\n'), startLine: j }
    }
  }
  return null
}

/**
 * 找某一處命中的豁免:同一行 <div 前面的 JSX 註解,或正上方「只有 JSX 註解」的那一段。
 * 回傳 { line(1-based,標記所在行), text } 或 null。
 */
function exemptionFor(lines, lineIdx, col) {
  const prefix = lines[lineIdx].slice(0, col)
  if (/^\s*\{\/\*[\s\S]*\*\/\}\s*$/.test(prefix) && prefix.includes(MARKER)) return { line: lineIdx + 1, text: prefix }
  const block = commentBlockEndingAt(lines, lineIdx - 1)
  if (block && block.text.includes(MARKER)) {
    const off = block.text.slice(0, block.text.indexOf(MARKER)).split('\n').length - 1
    return { line: block.startLine + off + 1, text: block.text }
  }
  return null
}

/** 核對豁免的出處;readSpec(absPath) 回檔案內容或 null */
function verifyCitation(text, file, readSpec) {
  const after = text.slice(text.indexOf(MARKER) + MARKER.length)
  if (!/^[:：]/.test(after)) return `豁免標記後面要接「:」再寫出處(${MARKER}: <檔>.spec.md:<行>「<引文>」)`
  const m = after.match(CITE)
  if (!m) return `豁免沒寫出處(要寫 <相對本檔的路徑>.spec.md:<行>「<該行原文的一段>」)`
  const [, rel, lineNo, quote] = m
  const abs = path.resolve(ROOT, path.dirname(file), rel)
  if (!abs.startsWith(ROOT + path.sep)) return `出處 ${rel} 跑出 repo 外`
  const spec = readSpec(abs)
  if (spec == null) return `出處 ${rel} 不存在(相對 ${path.dirname(file)})`
  const specLine = spec.split('\n')[Number(lineNo) - 1]
  if (specLine == null) return `出處 ${rel}:${lineNo} 超出檔案行數`
  if (!specLine.includes(quote)) return `出處 ${rel}:${lineNo} 那一行沒有「${quote}」(行號跑掉了?請改成現在那段原文所在的行)`
  return null
}

const defaultReadSpec = (abs) => (existsSync(abs) ? readFileSync(abs, 'utf8') : null)

/**
 * 掃一個原始檔。回傳 { violations: [{ line, why }], exemptions: [{ line, cite }] }。
 * file = 相對 repo 根目錄的路徑(用來解析豁免出處的相對路徑);readSpec 可注入(selftest 用)。
 */
export function checkSource(src, { file = 'packages/design-system/src/inline.tsx', readSpec = defaultReadSpec } = {}) {
  const lines = src.split('\n')
  const lineOf = (idx) => src.slice(0, idx).split('\n').length
  const violations = []
  const exemptions = []
  const usedMarkers = new Set()
  const hits = []
  const masked = maskComments(src)
  for (const m of src.matchAll(DS_GROUP)) if (!insideCheckboxGroup(masked, m.index)) hits.push(m.index)
  for (const m of src.matchAll(RAW_GROUP)) hits.push(m.index)
  for (const idx of hits) {
    const line = lineOf(idx)
    const col = idx - (src.lastIndexOf('\n', idx - 1) + 1)
    const ex = exemptionFor(lines, line - 1, col)
    if (!ex) { violations.push({ line, why: '手刻容器包多個 option Checkbox → 用 <CheckboxGroup>(zero-gap canonical,與 RadioGroup 間距 SSOT)' }); continue }
    usedMarkers.add(ex.line)
    const bad = verifyCitation(ex.text, file, readSpec)
    if (bad) violations.push({ line: ex.line, why: bad })
    else exemptions.push({ line, cite: ex.text.slice(ex.text.indexOf(MARKER)).replace(/\s*\*\/\}\s*$/, '').replace(/\s+/g, ' ').slice(0, 160) })
  }
  // 過期標記:有寫豁免、底下卻沒有它放行的手刻組
  lines.forEach((l, i) => {
    if (l.includes(MARKER) && !usedMarkers.has(i + 1)) violations.push({ line: i + 1, why: '豁免標記底下(正下方一行)沒有手刻選項組 —— 過期標記,刪掉或移到該放行的那一行正上方' })
  })
  violations.sort((a, b) => a.line - b.line)
  return { violations, exemptions }
}

function selftest() {
  const F = 'packages/design-system/src/components/Demo/demo.stories.tsx'
  const SPEC = path.resolve(ROOT, 'packages/design-system/src/components/Checkbox/checkbox.spec.md')
  const readSpec = (abs) => (abs === SPEC ? '# Checkbox\n- **單一同意**：服務條款、隱私政策\n' : null)
  const OK = '{/* @checkbox-group-handcraft-ok: ../Checkbox/checkbox.spec.md:2「單一同意」兩個各自獨立的同意 */}'
  const two = '<Checkbox label="a" />\n<Checkbox label="b" />'
  const c = [
    { n: 'space-y-2 包 2 個 label Checkbox = 該抓', src: '<div className="space-y-2"><Checkbox label="a" /><Checkbox label="b" /></div>', e: 1 },
    { n: 'CheckboxGroup 包 = 合格', src: '<CheckboxGroup><Checkbox label="a" /><Checkbox label="b" /></CheckboxGroup>', e: 0 },
    { n: '狀態展示(aria-label,flex gap-4)= 不抓', src: '<div className="flex items-center gap-4"><Checkbox aria-label="off" /><Checkbox aria-label="on" /></div>', e: 0 },
    { n: '單一 Checkbox = 不抓', src: '<div className="space-y-2"><Checkbox label="a" /></div>', e: 0 },
    { n: 'raw input option group ×2 = 該抓', src: '<label className="x"><input type="checkbox"/> A</label><label className="x"><input type="checkbox"/> B</label>', e: 1 },
    { n: 'bare dev knob input = 不抓', src: '<input type="checkbox" checked={v} onChange={f} />', e: 0 },
    { n: '容器後面先夾一行 JSX 註解 = 照抓(selection-item.anatomy 的形狀)', src: '<div className="flex flex-col gap-2">\n{/* 說明 */}\n' + two + '\n</div>', e: 1 },
    { n: '水平手刻列 flex gap-4 = 該抓(checkbox.anatomy「水平排列」的形狀)', src: '<div className="flex gap-4 border p-2">\n' + two + '\n</div>', e: 1 },
    { n: '兄弟範例的 </CheckboxGroup> 落在前 200 字內 = 照抓(舊判法的漏洞)', src: '<CheckboxGroup><Checkbox label="x" /></CheckboxGroup>\n<div className="flex gap-4">\n' + two + '\n</div>', e: 1 },
    { n: '<CheckboxGroup> 裡面再一層 div = 不抓', src: '<CheckboxGroup>\n<div className="grid grid-cols-2">\n' + two + '\n</div>\n</CheckboxGroup>', e: 0 },
    { n: '註解裡提到「<CheckboxGroup>」不算開標籤 = 照抓', src: '{/* 直式群組 = <CheckboxGroup>(說明) */}\n<div className="flex flex-col">\n' + two + '\n</div>', e: 1 },
    { n: '豁免在正上方、出處對得上 = 放行', src: OK + '\n<div className="flex flex-col gap-4">\n' + two + '\n</div>', e: 0 },
    { n: '豁免寫在同一行 <div 前面 = 放行', src: OK + '<div className="flex flex-col gap-4">\n' + two + '\n</div>', e: 0 },
    { n: '多行註解的第一行是豁免、最後一行在正上方 = 放行', src: '{/* @checkbox-group-handcraft-ok: ../Checkbox/checkbox.spec.md:2「單一同意」\n   兩個各自獨立的同意 */}\n<div className="flex flex-col gap-4">\n' + two + '\n</div>', e: 0 },
    { n: '豁免沒寫出處 = 紅', src: '{/* @checkbox-group-handcraft-ok: 這兩個不是一組 */}\n<div className="flex flex-col gap-4">\n' + two + '\n</div>', e: 1 },
    { n: '豁免沒有「:」= 紅', src: '{/* @checkbox-group-handcraft-ok ../Checkbox/checkbox.spec.md:2「單一同意」 */}\n<div className="flex flex-col gap-4">\n' + two + '\n</div>', e: 1 },
    { n: '出處那一行沒有引文(行號跑掉)= 紅', src: '{/* @checkbox-group-handcraft-ok: ../Checkbox/checkbox.spec.md:1「單一同意」 */}\n<div className="flex flex-col gap-4">\n' + two + '\n</div>', e: 1 },
    { n: '出處檔不存在 = 紅', src: '{/* @checkbox-group-handcraft-ok: ../Nope/nope.spec.md:2「單一同意」 */}\n<div className="flex flex-col gap-4">\n' + two + '\n</div>', e: 1 },
    { n: '豁免與 <div 之間隔一行程式碼 = 不放行,且標記過期(2 筆)', src: OK + '\n<span>中間一行</span>\n<div className="flex flex-col gap-4">\n' + two + '\n</div>', e: 2 },
    { n: '底下沒有手刻組的豁免 = 過期標記,紅', src: OK + '\n<CheckboxGroup>\n' + two + '\n</CheckboxGroup>', e: 1 },
  ]
  let ok = true
  for (const t of c) {
    const got = checkSource(t.src, { file: F, readSpec }).violations.length
    const pass = got === t.e
    console.log(`  ${pass ? '✓' : '✗'} ${t.n}(預期 ${t.e},實得 ${got})`)
    if (!pass) ok = false
  }
  return ok
}

if (process.argv.includes('--selftest')) {
  console.log('checkbox-group-handcraft selftest:')
  process.exit(selftest() ? 0 : 1)
}

const files = globSync('packages/design-system/src/**/*.tsx', { cwd: ROOT }).sort()
const v = []
const ex = []
for (const rel of files) {
  const { violations, exemptions } = checkSource(readFileSync(path.join(ROOT, rel), 'utf8'), { file: rel })
  for (const x of violations) v.push(`  - ${rel}:${x.line} ${x.why}`)
  for (const x of exemptions) ex.push(`  - ${rel}:${x.line} ${x.cite}`)
}
if (v.length) { console.error('❌ 手刻 checkbox option-group:'); console.error(v.join('\n')); process.exit(1) }
console.log(`✓ checkbox-group-handcraft:${files.length} 檔,0 個手刻選項組;逐行豁免 ${ex.length} 筆${ex.length ? ':\n' + ex.join('\n') : ''}`)
