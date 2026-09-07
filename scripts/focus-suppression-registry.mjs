#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 焦點抑制必須表態 —— 每一處 `outline-none` 都要說清楚「誰來畫」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`ds-canonical/references/focus-canonical.md`「問題一之二:什麼情況明確不用畫框」
//
// **為什麼需要這支閘**(user 2026-09-07 問:「確認所有 ds 內容都有按此原則沒有偏移?」):
// 這條規則在 2026-09-07 之前只有一句抽象的例外 ——「指示器畫在別的元素上,必須指得出承擔者」——
// 沒有列舉、沒有判斷程序。結果是每次遇到都重新推導一次,而且**推導完不會留下痕跡**:
// 下一個人看到 `outline-none` 只能重新猜它是刻意的還是忘了。
// 實際後果是 2026-09-07 一天內抓到三處「其實是漏掉」:
//   steps.tsx(三條 focus-visible outline 從寫下起沒畫過)、
//   chart.tsx(圖表可 Tab 但焦點被抑制)、
//   slider.tsx(把手根本不可 Tab —— WCAG 2.1.1 Level A)。
//
// 現在規則有 A–E 五類 + 七步判斷程序,這支閘做三件事:
//   (1) 每一處抑制都要有 `@focus-suppress <類別> — <說明>;承擔者:<誰>` 的註解
//   (2) A–E 類**必須寫出承擔者**(寫不出來就代表它其實不屬於那一類)
//   (3) **宣告的類別要對得上證據** —— 判斷程序的每一步都指定了「要去看哪個東西」,
//       宣告了某一類,那個東西就必須在同一個檔案裡找得到。
//       只驗「有標記」的話標錯類別一樣過關,等於把判斷責任又丟回讀者身上。
//
// 類別(完整定義見 SSOT):
//   A 虛擬游標 / B Field 家族輸入控件 / C 隱形整列觸發器 / D 選單未選中項 /
//   E 浮層程式落點 / N 不適用(不可操作,問題一已答完)
//
// Run: `node scripts/focus-suppression-registry.mjs`(`--selftest` 跑正反例)

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../packages/design-system/src', import.meta.url))
const VALID = new Set(['A', 'B', 'C', 'D', 'E', 'N'])
/** 往上找幾行標記(有些抑制點的註解會分行寫) */
const LOOKBACK = 8

/** 只算「真的會抑制焦點框」的寫法,不算註解裡提到這幾個字 */
const SUPPRESS = /\boutline-none\b|\boutline-0\b|\boutline-hidden\b/

/**
 * 把註解從原始碼剝掉,再判斷有沒有抑制。
 *
 * 三種都要剝,少一種就會誤判(2026-09-07 實際踩到後兩種):
 *   `// …`            行尾註解
 *   `/* … *\/`        區塊註解(含寫在同一行尾巴的)
 *   `{/* … *\/}`      JSX 註解
 * 例如 `field.tsx` 有一句「本區塊無 outline-none」、`inline-edit.tsx` 有一句
 * 「只需 outline-none 消瀏覽器預設外框」—— 兩句都是在**說明**,不是在抑制。
 */
/**
 * 承擔者若寫成 `檔名.tsx:行號`,就真的去那個檔案那一行(前後 3 行)確認畫框存在。
 * 這讓「承擔者」從一句話變成**可驗證的指標** —— 承擔者搬家或被刪,這裡就會紅。
 */
function carrierPointsAt(window, re) {
  const m = window.match(/([\w.-]+\.tsx?):(\d+)/)
  if (!m) return false
  const n = Number(m[2])
  return load(ROOT).some((f) => f.path.endsWith('/' + m[1])
    && f.src.split('\n').slice(Math.max(0, n - 4), n + 3).some((l) => re.test(l)))
}

/**
 * 回看視窗裡可能有**不只一個**標記(兩處抑制相距 8 行以內就會)。
 * 一律取**最靠近**這一行的那個 —— 取第一個的話,後面那處會讀到前面那處的
 * 類別與承擔者,標錯類別就被遮住了。(2026-09-08 由對抗測試抓到)
 */
function nearest(window, re) {
  const all = [...window.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))]
  return all.length ? all[all.length - 1] : null
}

function stripComments(text) {
  return text
    // 跨行註解要**保留換行數**,否則剝完之後行號會錯位,
    // 報出來的位置就會指到別的地方(2026-09-07 第一版就是這樣,錯報 27 處)。
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (m) => ' '.repeat(m.length))
}

export function scan(files) {
  const problems = []
  const shared = []
  for (const { path, src } of files) {
    const stripped = stripComments(src).split('\n')
    const lines = src.split('\n')
    lines.forEach((line, i) => {
      const code = stripped[i] ?? ''
      if (!SUPPRESS.test(code)) return
      // 標記本身寫在註解裡,所以回看要用**原文**不是剝過的
      const window = lines.slice(Math.max(0, i - LOOKBACK), i).join('\n')
      const m = nearest(window, /@focus-suppress\s+([A-EN])\b/)
      const trimmed = line.trim()
      if (!m) { problems.push({ path, line: i + 1, why: '沒有 @focus-suppress 標記', text: trimmed.slice(0, 80) }); return }
      if (!VALID.has(m[1])) { problems.push({ path, line: i + 1, why: `類別 ${m[1]} 不在 A–E / N`, text: trimmed.slice(0, 80) }); return }
      if (m[1] !== 'N' && !/承擔者[::]/.test(window.slice(m.index))) {
        problems.push({ path, line: i + 1, why: `類別 ${m[1]} 必須寫出承擔者是誰(寫不出來就代表它不屬於那一類)`, text: trimmed.slice(0, 80) })
        return
      }
      // **不只檢查有沒有寫,也檢查寫得對不對。**
      // 判斷程序的每一步都指定了「要去看哪個東西」(SSOT「判斷程序」表),
      // 所以宣告了某一類,那個東西就必須在同一個檔案裡找得到。
      // 只驗「有標記」的話,標錯類別一樣過關 —— 那等於把判斷責任又丟回讀者身上。
      // B 類的判準是「元素種類」,所以往上找這個 class 屬於哪個標籤;
      // 其餘類別的判準是「同檔找得到那個東西」。
      const openTag = lines.slice(Math.max(0, i - 40), i + 1).join('\n')
      const evidence = {
        A: { ok: () => /aria-activedescendant/.test(src), need: '同檔要找得到 `aria-activedescendant`(A 類的判準就是它)' },
        // 判準是標籤名。class 若寫在共用 style 常數裡(cva / xxxStyles),標籤不在附近,
        // 這時改看「本檔到底渲染什麼標籤」—— 那個常數只服務那個標籤。
        B: { ok: () => /<(input|textarea)\b|\.Input\b|<(Input|Textarea)\b/.test(openTag)
                    || (/\bcva\(|const \w+(Styles|Variants)\s*=/.test(openTag) && /<(input|textarea)\b/.test(src)),
             need: '往上 40 行要找得到 `<input>` / `<textarea>`(B 類的判準是標籤名);若寫在共用 style 常數裡,本檔要真的渲染該標籤' },
        C: { ok: () => /focus-within:|:has\(|has-\[/.test(src) || carrierPointsAt(window, /focus-within:|:has\(|has-\[|focus-visible:border-/),
             need: '同檔要找得到 `focus-within:` / `:has(…)` 畫框,或承擔者要寫出真的有畫框的那個 `檔名.tsx:行號`' },
        D: { ok: () => /bg-neutral-hover|data-\[highlighted\]|data-\[selected/.test(src), need: '同檔要找得到選單項的 `bg-neutral-hover` 底色游標' },
        E: { ok: () => /Primitive\.Content|PopoverPrimitive|DialogPrimitive|HoverCardPrimitive|DropdownMenuPrimitive/.test(src), need: '同檔要找得到 Radix 的 Content 殼(E 類講的就是那個浮層殼)' },
      }[m[1]]
      if (evidence && !evidence.ok()) {
        problems.push({ path, line: i + 1, why: `宣告了 ${m[1]} 類,但${evidence.need}`, text: trimmed.slice(0, 80) })
        return
      }
      if (m[1] === 'C') {
        const carrier = nearest(window, /承擔者[::]([^\n]*)/)
        if (carrier) shared.push({ path, line: i + 1, key: path + '|' + carrier[1].trim(), trimmed, after: lines.slice(i, i + 8).join('\n') })
      }
    })
  }
  // **一個承擔者被兩個以上 tab stop 共用時,它分不出焦點在哪一顆。**
  // 那圈邊框只會說「焦點在這個欄位裡」,不會說「在起日還是迄日」——
  // 於是每一顆都必須另有自己的區分指示。
  // 錨:DatePicker range 的起訖兩顆(2026-09-08)。本元件自己早有一條主色底線
  // (對照 Ant Design RangePicker 的 -active-bar),但被 `open &&` 擋住,
  // 面板關著用 Tab 移動時兩顆長得一模一樣。
  const groups = new Map()
  for (const c of shared) groups.set(c.key, [...(groups.get(c.key) ?? []), c])
  for (const [, members] of groups) {
    if (members.length < 2) continue
    for (const c of members) {
      // outline-none 是抑制,不算指示;要有另一個 focus-visible 樣式
      const distinguishing = /focus-visible:(?!outline-none)[\w[\]-]+/.test(c.after)
      if (!distinguishing) {
        problems.push({ path: c.path, line: c.line, text: c.trimmed.slice(0, 80),
          why: `同一個承擔者被 ${members.length} 個 tab stop 共用,那圈指示分不出焦點在哪一顆;每一顆要有自己的 focus-visible 區分樣式` })
      }
    }
  }
  return problems
}

function load(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) load(p, out)
    else if (n.endsWith('.tsx') && !n.includes('.stories.')) out.push({ path: p.replace(ROOT, 'src'), src: readFileSync(p, 'utf8') })
  }
  return out
}

if (process.argv.includes('--selftest')) {
  const cases = [
    { n: '有標記有承擔者', src: "<input\n// @focus-suppress B — 文字輸入;承擔者:caret\ncn('outline-none')", bad: false },
    { n: '沒有標記', src: "cn('outline-none')", bad: true },
    { n: '有標記但沒寫承擔者', src: "<input\n// @focus-suppress B — Field\ncn('outline-none')", bad: true },
    { n: 'N 類不需要承擔者', src: "// @focus-suppress N — 不可操作\ncn('outline-none')", bad: false },
    { n: 'A 類但同檔沒有 aria-activedescendant', src: "// @focus-suppress A — x;承擔者:y\ncn('outline-none')", bad: true },
    { n: 'A 類且同檔有 aria-activedescendant', src: "const a = 'aria-activedescendant'\n// @focus-suppress A — x;承擔者:y\ncn('outline-none')", bad: false },
    { n: 'B 類但不在 input/textarea 上', src: "<div\n// @focus-suppress B — x;承擔者:caret\ncn('outline-none')", bad: true },
    { n: 'B 類且在 textarea 上', src: "<textarea\n// @focus-suppress B — x;承擔者:caret\ncn('outline-none')", bad: false },
    { n: 'C 類但同檔沒有祖先畫框', src: "// @focus-suppress C — x;承擔者:y\ncn('outline-none')", bad: true },
    { n: 'C 類且同檔有 :has 畫框', src: "const w = '[&:has(button:focus-visible)]:border-primary'\n// @focus-suppress C — x;承擔者:y\ncn('outline-none')", bad: false },
    { n: 'E 類但同檔沒有 Radix Content 殼', src: "// @focus-suppress E — x;承擔者:y\ncn('outline-none')", bad: true },
    { n: '無效類別', src: "// @focus-suppress Z — 亂寫;承擔者:誰\ncn('outline-none')", bad: true },
    { n: '行尾註解裡提到不算', src: "// 原本這裡有 outline-none,已刪", bad: false },
    { n: '區塊註解裡提到不算', src: "/* 本區塊無 outline-none */", bad: false },
    { n: 'JSX 註解裡提到不算', src: "{/* 只需 outline-none 消預設外框 */}", bad: false },
    { n: '同行尾巴的區塊註解不算', src: 'className="x"  /* 本區塊無 outline-none */', bad: false },
    { n: '跨行註解不得讓行號錯位', src: "/* 第一行\n第二行\n第三行 */\n<input\n// @focus-suppress B — x;承擔者:y\ncn('outline-none')", bad: false },
    { n: '兩個 tab stop 共用承擔者但沒有區分樣式', src: "const w = 'focus-within:!border-primary'\n"
        + "// @focus-suppress C — 起;承擔者:欄位邊框\ncn('focus-visible:outline-none')\n"
        + "// @focus-suppress C — 迄;承擔者:欄位邊框\ncn('focus-visible:outline-none')", bad: true },
    { n: '兩個 tab stop 共用承擔者且各有底線區分', src: "const w = 'focus-within:!border-primary'\n"
        + "// @focus-suppress C — 起;承擔者:欄位邊框\ncn('focus-visible:outline-none focus-visible:underline')\n"
        + "// @focus-suppress C — 迄;承擔者:欄位邊框\ncn('focus-visible:outline-none focus-visible:underline')", bad: false },
    { n: '承擔者不同就不算共用', src: "const w = 'focus-within:!border-primary'\n"
        + "// @focus-suppress C — 甲;承擔者:甲的框\ncn('focus-visible:outline-none')\n"
        + "// @focus-suppress C — 乙;承擔者:乙的框\ncn('focus-visible:outline-none')", bad: false },
    { n: '沒有抑制的一般程式碼', src: "cn('rounded-md bg-surface')", bad: false },
    { n: '標記離太遠(超過回看範圍)', src: "<input\n// @focus-suppress B — x;承擔者:y\n1\n2\n3\n4\n5\n6\n7\n8\n9\ncn('outline-none')", bad: true },
  ]
  let ok = true
  for (const c of cases) {
    const got = scan([{ path: 't.tsx', src: c.src }]).length > 0
    if (got !== c.bad) { console.error(`✗ selftest「${c.n}」預期 ${c.bad} 實得 ${got}`); ok = false }
  }
  console.log(ok ? `✓ selftest ${cases.length}/${cases.length} 通過` : '✗ selftest 失敗')
  process.exit(ok ? 0 : 1)
}

const problems = scan(load(ROOT))
if (problems.length) {
  console.error('✗ 下列焦點抑制沒有表態(SSOT:focus-canonical「問題一之二」):')
  console.error('  每一處都要在前 8 行內寫 `@focus-suppress <A-E|N> — <說明>;承擔者:<誰>`。')
  console.error('  先跑那份文件的七步判斷程序;走到第 7 步就代表**要畫**,不是加標記。')
  problems.forEach((p) => console.error(`    ${p.path}:${p.line}  ${p.why}\n         ${p.text}`))
  process.exit(1)
}
console.log('✓ 每一處焦點抑制都表明了類別與承擔者')
