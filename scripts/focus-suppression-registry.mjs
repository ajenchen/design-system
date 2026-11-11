#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 焦點抑制必須表態 —— 每一處 `outline-none` 都要說清楚「誰來畫」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`ds-canonical/references/focus-canonical.md`「問題一之二:框由誰畫」
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
// 現在規則有 A / B / C / E 四類 + 六步判斷程序,這支閘做三件事:
//   (1) 每一處抑制都要有 `@focus-suppress <類別> — <說明>;承擔者:<誰>` 的註解
//   (2) A / B / C / E 類**必須寫出承擔者**(寫不出來就代表它其實不屬於那一類)
//   (3) **宣告的類別要對得上證據** —— 判斷程序的每一步都指定了「要去看哪個東西」,
//       宣告了某一類,那個東西就必須在同一個檔案裡找得到。
//       只驗「有標記」的話標錯類別一樣過關,等於把判斷責任又丟回讀者身上。
//
// 類別(完整定義見 SSOT):
//   A 虛擬游標／程式游標(aria-activedescendant 容器、cmdk data-selected、Radix data-highlighted;框由元件畫在游標項上)/
//   B 插入點控件(input 文字類 / textarea / contenteditable;唯一不畫框的例外)/ C 祖先或自己這圈邊框轉色 /
//   E 浮層程式落點 / N 不適用(不可操作,問題一已答完)
//
//   **D 類已於 2026-09-09 退役**(原「選單未選中項用 hover 同色底當游標」)。那條是 AI 從 Radix / cmdk /
//   shadcn 慣例推導的,不是 user 的決定;user 2026-09-09 拍板「都要畫框、不上底色」後,選單列的游標就是框,
//   沒有東西可以再用 D 表態。寫 `@focus-suppress D` 一律紅。
//
// Run: `node scripts/focus-suppression-registry.mjs`(`--selftest` 跑正反例)

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../packages/design-system/src', import.meta.url))
const VALID = new Set(['A', 'B', 'C', 'E', 'N'])
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
 * 承擔者指標:讓「承擔者」從一句話變成**可驗證的指標** —— 承擔者搬家或被刪,這裡就會紅。兩種寫法:
 *   `檔名.tsx#宣告名` / `檔名.tsx#宣告名.鍵` —— 指**宣告**(const / function / class;`.鍵` = 那個物件字面量裡的那一項)。
 *       檢查的是那個宣告(或那一項)**剝掉註解後的程式**真的掛畫框的 class。**跨檔一律用這種。**
 *   `檔名.tsx:行號` —— 只准指**同一個檔**(那一行前後 3 行,同樣剝掉註解後檢查)。
 *
 * **為什麼跨檔不准寫行號**(2026-11-11):data-table.tsx 的 A 類標記寫「承擔者:data-table-interaction-layer.tsx:379」。
 * 4bc1b6e9 在 interaction-layer 的 379 行**上方**加了 4 行(滑過外框的註解),承擔者 `CELL_RING_STYLES.selected` 一字未改、
 * 只是被推到 383 行 —— 閘就在**另一個檔**(data-table.tsx)紅,改 interaction-layer 的人看不出因果,下一位代理還誤判成「基底本來就紅」。
 * 行號是承擔者身分的代理(M37):它只在寫下的那一刻剛好等於承擔者。同一次盤點(M10)8 個行號指標有 4 個已經過期 ——
 * 其中 3 個從沒被驗過(同檔另有證據就短路,指標只是旁白),過期了也零訊號。所以下面兩條一起改:
 *   (1) 跨檔指標必須指宣告名(不受別人在上方加行影響,宣告被刪 / 改名 / 不再掛 class 才紅);
 *   (2) 標記裡寫出來的**每一個**指標都驗,不只是被拿來當證據的那一個(`pointerProblems`)。
 * 同檔行號仍可用:會讓它過期的編輯就在同一個檔,紅燈指著的正是改的人手上那一檔。
 * 檢查一律剝掉註解:2026-11-11 前不剝,`field-wrapper.tsx:66` 前後 3 行裡只有一句**註解**提到 focus-within:!border-primary,照樣過。
 *
 * `text` 必須是**從標記本身起算**的文字(呼叫端傳 `window.slice(m.index)`):傳整個回看視窗會撿到標記上方無關註解裡的
 * 指標(例:「參考 x.tsx:8 的做法」),讓承擔者只寫一句話的標記憑別人的指標過關(2026-09-27,A 類原本就切、C 類沒切)。
 * 先在本次掃描的檔案集合裡找(selftest 用合成檔就驗得到綠側),再退到真實原始碼樹。
 */
const POINTER = /([\w.-]+\.tsx?)(?::(\d+)|#([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?)/g
/** 「有畫焦點指示」的程式寫法 = A 類的 focus-ring-inset ∪ C 類的邊框轉色 / ::before 框圖層(用來驗「旁白指標」) */
const DRAWS = /focus-ring-inset|focus-within:|:has\(|has-\[|focus-visible:!?border-/
let realTree = null
const pointersIn = (text) => [...text.matchAll(POINTER)].map((p) => ({ raw: p[0], file: p[1], line: p[2] && Number(p[2]), name: p[3], key: p[4] }))
const isFile = (path, file) => path === file || path.endsWith('/' + file)
/** 指標指到的那幾行程式(已剝註解);找不到檔 / 宣告 / 那一項 → null */
function resolvePointer(p, files) {
  const pool = files.some((f) => isFile(f.path, p.file)) ? files : (realTree ??= load(ROOT))
  const target = pool.find((f) => isFile(f.path, p.file))
  if (!target) return null
  const code = stripComments(target.src).split('\n')
  if (p.line) return code.slice(Math.max(0, p.line - 4), p.line + 3)
  const decl = code.findIndex((l) => new RegExp(`\\b(?:const|let|var|function|class)\\s+${p.name}\\b`).test(l))
  if (decl < 0) return null
  // 頂層宣告到第一個頂格的 `}` / `)` / `]` 為止(本庫元件檔一律兩格縮排,頂層宣告的結尾就是頂格收尾)
  let end = code.findIndex((l, i) => i > decl && /^[}\])]/.test(l))
  if (end < 0) end = code.length - 1
  const body = code.slice(decl, end + 1)
  if (!p.key) return body
  const k = body.findIndex((l) => new RegExp(`^\\s*['"]?${p.key}['"]?\\s*:`).test(l))
  if (k < 0) return null
  const indent = body[k].match(/^\s*/)[0].length
  // 那一項 = 鍵那一行,到下一個縮排不深於它的非空行之前(多行的值也收進來)
  let stop = body.findIndex((l, i) => i > k && l.trim() && l.match(/^\s*/)[0].length <= indent)
  if (stop < 0) stop = body.length
  return body.slice(k, stop)
}
/** 標記裡有沒有一個指標,指到的程式真的掛 `re`(A / C 類拿它當證據) */
function carrierDraws(text, re, files = []) {
  return pointersIn(text).some((p) => resolvePointer(p, files)?.some((l) => re.test(l)))
}
/** 標記裡寫出來的每一個指標都要成立:跨檔不准寫行號、指得到、而且指到的程式真的有畫 */
function pointerProblems(text, selfPath, files = []) {
  const out = []
  // 只寫行號、沒寫檔名(例:「見上方 :398」)= 驗不到的指標,而且一樣會過期(inline-edit 那一個 2026-11-11 時已差 6 行)
  for (const bare of text.matchAll(/(?<![\w.]):(\d{2,})\b/g)) out.push(`承擔者指標 \`${bare[0]}\` 沒寫檔名,驗不到;改寫成 \`檔名.tsx:行號\`(同檔)或 \`檔名.tsx#宣告名\``)
  for (const p of pointersIn(text)) {
    if (p.line && !isFile(selfPath, p.file)) {
      out.push(`承擔者指標 \`${p.raw}\` 跨檔卻寫行號 —— 對方檔案上方一加行就失效(而紅燈會出現在這一檔);改寫成 \`${p.file}#宣告名\``)
      continue
    }
    const lines = resolvePointer(p, files)
    if (!lines) out.push(`承擔者指標 \`${p.raw}\` 指不到東西(檔案 / 宣告 / 那一項不存在)`)
    else if (!lines.some((l) => DRAWS.test(l))) out.push(`承擔者指標 \`${p.raw}\` 指到的程式沒有畫框(剝掉註解後沒有 focus-ring-inset / focus-within: / :has( / focus-visible:border-)`)
  }
  return out
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
      const m = nearest(window, /@focus-suppress\s+([A-Z])\b/)
      const trimmed = line.trim()
      if (!m) { problems.push({ path, line: i + 1, why: '沒有 @focus-suppress 標記', text: trimmed.slice(0, 80) }); return }
      if (!VALID.has(m[1])) {
        problems.push({ path, line: i + 1, text: trimmed.slice(0, 80),
          why: m[1] === 'D' ? 'D 類(底色當游標)已於 2026-09-09 退役 —— 選單列的鍵盤游標一律畫框,把底色換成 focus-ring-inset' : `類別 ${m[1]} 不在 A / B / C / E / N` })
        return
      }
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
        // A 類 2026-09-09 起含「函式庫管理游標」的項目(cmdk data-selected / Radix data-highlighted):
        // 瀏覽器的 :focus-visible 看不到那個游標,所以框由元件自己畫 —— 同檔**必須**真的有 focus-ring-inset,
        // 否則就是「抑制了瀏覽器的框、自己又沒畫」= 舊 D 類換個字母回流。
        // 2026-09-26 補第二種證據:**程式游標由別檔畫框**(DataTable 試算表模式:游標是元件 state `selectedCellId`,
        // 框由 data-table-interaction-layer.tsx 的 SelectionRing 掛 `focus-ring-inset`)。SSOT 的 A 類實例欄本來就列了
        // 「DataTable 根」,但這裡的證據只認三種游標來源寫法 —— 規格寬、閘窄(M7 子規則 M34)。
        // 第二種證據一樣不接受「抑制了又沒畫」:承擔者必須寫成指標(別檔 = `檔名.tsx#宣告名[.鍵]`),而指到的程式要真的掛 `focus-ring-inset`,
        // 承擔者被刪 / 改名就紅(同 C 類的 carrierDraws)。只看這個標記自己之後的文字,不會撿到上方別段註解裡的檔名。
        A: { ok: () => (/aria-activedescendant|data-\[highlighted\]|data-\[selected=true\]/.test(src) && /focus-ring-inset/.test(src))
                    || carrierDraws(window.slice(m.index), /focus-ring-inset/, files),
             need: '同檔要找得到游標來源(`aria-activedescendant` / `data-[highlighted]` / `data-[selected=true]`)**而且**要找得到元件自己畫的 `focus-ring-inset`(A 類 = 框畫在游標項上,不是不畫);或承擔者寫成指標(別檔 `檔名.tsx#宣告名[.鍵]`、同檔可 `檔名.tsx:行號`),而指到的程式真的掛 `focus-ring-inset`(程式游標由別檔畫框)' },
        // 判準是標籤名。class 若寫在共用 style 常數裡(cva / xxxStyles),標籤不在附近,
        // 這時改看「本檔到底渲染什麼標籤」—— 那個常數只服務那個標籤。
        B: { ok: () => /<(input|textarea)\b|\.Input\b|<(Input|Textarea)\b/.test(openTag)
                    || (/\bcva\(|const \w+(Styles|Variants)\s*=/.test(openTag) && /<(input|textarea)\b/.test(src)),
             need: '往上 40 行要找得到 `<input>` / `<textarea>`(B 類的判準是標籤名);若寫在共用 style 常數裡,本檔要真的渲染該標籤' },
        // 2026-09-26 補第三種承擔者:**自己的 `::before` 框圖層**(FileUpload 清單列:列底貼著 FileItem 的進度條時,框改畫在
        // 列自己的 ::before、進度條那段挖空 —— focus-canonical「框怎麼畫」框圖層列)。它仍是「自己這圈」,只是畫在 ::before 上,
        // 所以元素本身要抑制全域外描邊。證據照 carrierPointsAt 的嚴格形狀:承擔者寫成 `檔名.tsx:行號`,那一行(±3)真的掛
        // `focus-visible:before:focus-ring-inset`;承擔者搬家或被刪就紅。只寫「自己的 ::before」一句話不算(驗不到)。
        // 2026-09-27:與 A 類一樣從標記位置起算(`window.slice(m.index)`)—— 原本吃整個回看視窗,會撿到標記上方無關註解裡的檔名:行號。
        C: { ok: () => /focus-within:|:has\(|has-\[/.test(src) || carrierDraws(window.slice(m.index), /focus-within:|:has\(|has-\[|focus-visible:border-|focus-visible:before:focus-ring-inset/, files),
             need: '同檔要找得到 `focus-within:` / `:has(…)` 畫框,或承擔者要寫出真的有畫框的那個指標(別檔 `檔名.tsx#宣告名[.鍵]`、同檔可 `檔名.tsx:行號`;自己的 ::before 框圖層 = 那一行掛 `focus-visible:before:focus-ring-inset`)' },
        E: { ok: () => /Primitive\.Content|PopoverPrimitive|DialogPrimitive|HoverCardPrimitive|DropdownMenuPrimitive/.test(src), need: '同檔要找得到 Radix 的 Content 殼(E 類講的就是那個浮層殼)' },
      }[m[1]]
      if (evidence && !evidence.ok()) {
        problems.push({ path, line: i + 1, why: `宣告了 ${m[1]} 類,但${evidence.need}`, text: trimmed.slice(0, 80) })
        return
      }
      // 證據過了,標記裡**寫出來的**每一個指標仍要成立 —— 同檔另有證據時指標只是旁白,2026-11-11 前從沒被驗過,
      // 盤點時 8 個裡 3 個這種旁白指標已經過期(field-wrapper.tsx:66 ×2、inline-edit 的 :398)
      const stale = pointerProblems(window.slice(m.index), path, files)
      if (stale.length) {
        for (const why of stale) problems.push({ path, line: i + 1, why, text: trimmed.slice(0, 80) })
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
  // 合成的「別檔畫框」承擔者:框在第 8 行(±3 行的窗只蓋 5–11 行;指第 1 行就找不到)
  const RING = { path: 'ring.tsx', src: "const a = 1\n2\n3\n4\n5\n6\n7\nconst r = showRing && 'focus-ring-inset'\n" }
  const BEFORE_RING = { path: 'before-ring.tsx', src: "const a = 1\n2\n3\n4\n5\n6\n7\nconst r = 'focus-visible:before:focus-ring-inset'\n" }
  // 宣告名指標的合成承擔者(形狀照 data-table-interaction-layer.tsx 的 CELL_RING_STYLES)
  const RING_DECL_SRC = "const CELL_RING_STYLES = {\n  hover:    { width: 1, zIndex: 1 },\n  selected: { className: 'focus-ring-inset', zIndex: 2 },\n}\n"
  const RING_DECL = { path: 'ring-decl.tsx', src: RING_DECL_SRC }
  const RING_DECL_SHIFTED = { path: 'ring-decl.tsx', src: '// 新加的說明一\n// 新加的說明二\n// 新加的說明三\n// 新加的說明四\n' + RING_DECL_SRC }
  const RING_COMMENT_ONLY = { path: 'ring-comment.tsx', src: "const CELL_RING_STYLES = {\n  selected: { zIndex: 2 }, // 以前是 'focus-ring-inset'\n}\n" }
  const FW = { path: 'fw.tsx', src: "function fieldPlainChrome() {\n  return 'border border-border'\n}\nfunction fieldChrome() {\n  return 'focus-within:!border-primary'\n}\n" }
  const cases = [
    { n: '有標記有承擔者', src: "<input\n// @focus-suppress B — 文字輸入;承擔者:caret\ncn('outline-none')", bad: false },
    { n: '沒有標記', src: "cn('outline-none')", bad: true },
    { n: '有標記但沒寫承擔者', src: "<input\n// @focus-suppress B — Field\ncn('outline-none')", bad: true },
    { n: 'N 類不需要承擔者', src: "// @focus-suppress N — 不可操作\ncn('outline-none')", bad: false },
    { n: 'A 類但同檔沒有游標來源', src: "// @focus-suppress A — x;承擔者:y\ncn('outline-none')", bad: true },
    { n: 'A 類且同檔有 aria-activedescendant + 自畫的框', src: "const a = 'aria-activedescendant'\nconst r = showRing && 'focus-ring-inset'\n// @focus-suppress A — x;承擔者:y\ncn('outline-none')", bad: false },
    { n: 'A 類有 aria-activedescendant 但同檔沒有 focus-ring-inset(抑制了又沒畫)', src: "const a = 'aria-activedescendant'\n// @focus-suppress A — x;承擔者:y\ncn('outline-none')", bad: true },
    { n: 'A 類 Radix 游標 + 自畫的框', src: "const c = 'data-[highlighted]:focus-ring-inset'\n// @focus-suppress A — x;承擔者:y\ncn('outline-none')", bad: false },
    { n: 'A 類程式游標:承擔者寫成檔名:行號,但那個檔不存在(抑制了又指不出誰畫)', src: "// @focus-suppress A — x;承擔者:no-such-file.tsx:12\ncn('outline-none')", bad: true },
    { n: 'A 類程式游標:承擔者只寫一句話、沒有檔名:行號(驗不到)', src: "// @focus-suppress A — x;承擔者:格上的框\ncn('outline-none')", bad: true },
    // 綠側(2026-09-27 補;2026-11-11 改成宣告名):新形狀的正確寫法必須過,不然閘只證明了「會紅」、沒證明「該綠時綠」
    { n: 'A 類程式游標:承擔者寫成 檔名.tsx#宣告名.鍵,那一項真的掛 focus-ring-inset → 綠', src: "// @focus-suppress A — 程式游標由別檔畫框;承擔者:ring-decl.tsx#CELL_RING_STYLES.selected\ncn('outline-none')", extra: [RING_DECL], bad: false },
    // 2026-11-11 本次事故的形狀:承擔者一字未改,只是對方檔案上方多了 4 行 —— 宣告名照樣綠,行號那條(下一列)才是會誤紅的寫法
    { n: '對方檔案上方加了 4 行(4bc1b6e9 的形狀),宣告名指標照樣綠', src: "// @focus-suppress A — x;承擔者:ring-decl.tsx#CELL_RING_STYLES.selected\ncn('outline-none')", extra: [RING_DECL_SHIFTED], bad: false },
    { n: 'A 類程式游標:跨檔寫行號 → 紅(即使那一行此刻真的掛 focus-ring-inset;對方上方一加行就失效)', src: "// @focus-suppress A — 程式游標由別檔畫框;承擔者:ring.tsx:8\ncn('outline-none')", extra: [RING], bad: true },
    { n: 'A 類:宣告名指到的那一項沒有畫框(hover 那一項)→ 紅', src: "// @focus-suppress A — x;承擔者:ring-decl.tsx#CELL_RING_STYLES.hover\ncn('outline-none')", extra: [RING_DECL], bad: true },
    { n: 'A 類:宣告名不存在(改名 / 刪掉)→ 紅', src: "// @focus-suppress A — x;承擔者:ring-decl.tsx#CELL_RING_STYLE.selected\ncn('outline-none')", extra: [RING_DECL], bad: true },
    { n: 'A 類:宣告裡只有**註解**提到 focus-ring-inset → 紅(剝註解後檢查)', src: "// @focus-suppress A — x;承擔者:ring-comment.tsx#CELL_RING_STYLES.selected\ncn('outline-none')", extra: [RING_COMMENT_ONLY], bad: true },
    { n: 'A 類:同檔寫行號、那一行真的畫 → 綠', src: "const r = showRing && 'focus-ring-inset'\n// @focus-suppress A — x;承擔者:t.tsx:1\ncn('outline-none')", bad: false },
    { n: 'A 類:同檔行號指的那一行(±3)沒有 focus-ring-inset → 紅', src: "const r = 1\n2\n3\n4\n5\n6\nconst q = 'focus-ring-inset'\n// @focus-suppress A — x;承擔者:t.tsx:1\ncn('outline-none')", bad: true },
    { n: 'A 類:標記上方無關註解提到 ring.tsx:8(真的有畫框),標記自己的承擔者只是一句話 → 紅(從標記起算,不撿上方的)', src: "// 參考 ring.tsx:8 的做法\n// @focus-suppress A — x;承擔者:格上的框\ncn('outline-none')", extra: [RING], bad: true },
    { n: 'A 類 Radix 游標但只上底色沒畫框(舊 D 換字母回流)', src: "const c = 'data-[highlighted]:bg-neutral-hover'\n// @focus-suppress A — x;承擔者:y\ncn('outline-none')", bad: true },
    { n: 'D 類已退役', src: "const c = 'data-[highlighted]:bg-neutral-hover'\n// @focus-suppress D — 選單未選中項;承擔者:hover 同色底\ncn('outline-none')", bad: true },
    { n: 'B 類但不在 input/textarea 上', src: "<div\n// @focus-suppress B — x;承擔者:caret\ncn('outline-none')", bad: true },
    { n: 'B 類且在 textarea 上', src: "<textarea\n// @focus-suppress B — x;承擔者:caret\ncn('outline-none')", bad: false },
    { n: 'C 類但同檔沒有祖先畫框', src: "// @focus-suppress C — x;承擔者:y\ncn('outline-none')", bad: true },
    { n: 'C 類且同檔有 :has 畫框', src: "const w = '[&:has(button:focus-visible)]:border-primary'\n// @focus-suppress C — x;承擔者:y\ncn('outline-none')", bad: false },
    { n: 'C 類框圖層:承擔者只寫一句話、沒有檔名:行號(驗不到)', src: "const r = 'focus-visible:before:focus-ring-inset'\n// @focus-suppress C — 自己的 ::before;承擔者:自己的 ::before\ncn('focus-visible:outline-none')", bad: true },
    { n: 'C 類框圖層:承擔者寫成檔名:行號,但那個檔不存在', src: "// @focus-suppress C — 自己的 ::before;承擔者:no-such-file.tsx:12\ncn('focus-visible:outline-none')", bad: true },
    // 綠側(2026-09-27 補)+ 修正 C 類吃整個回看視窗的對照組
    { n: 'C 類框圖層:同檔寫 檔名.tsx:行號,那一行真的掛 focus-visible:before:focus-ring-inset → 綠(FileUpload 的形狀)', src: "const r = 'focus-visible:before:focus-ring-inset'\n// @focus-suppress C — 自己的 ::before;承擔者:t.tsx:1\ncn('focus-visible:outline-none')", bad: false },
    { n: 'C 類框圖層:同檔行號指的那一行只有**註解**提到畫框 → 紅(剝註解後檢查)', src: "// 'focus-visible:before:focus-ring-inset'\n// @focus-suppress C — 自己的 ::before;承擔者:t.tsx:1\ncn('focus-visible:outline-none')", bad: true },
    { n: 'C 類框圖層:跨檔寫行號 → 紅(即使那一行此刻真的有畫)', src: "// @focus-suppress C — 自己的 ::before;承擔者:before-ring.tsx:8\ncn('focus-visible:outline-none')", extra: [BEFORE_RING], bad: true },
    // 旁白指標(2026-11-11):同檔另有證據(focus-within:)時,指標以前根本不驗 —— field-wrapper.tsx:66 就是這樣過期的
    { n: 'C 類:同檔有 focus-within(證據過),但旁白指標跨檔寫行號 → 紅', src: "const w = 'focus-within:!border-primary'\n// @focus-suppress C — x;承擔者:自己(fw.tsx:2)\ncn('focus-visible:outline-none')", extra: [FW], bad: true },
    { n: 'C 類:同檔有 focus-within(證據過),旁白指標指的宣告沒有畫框 → 紅', src: "const w = 'focus-within:!border-primary'\n// @focus-suppress C — x;承擔者:自己(fw.tsx#fieldPlainChrome)\ncn('focus-visible:outline-none')", extra: [FW], bad: true },
    { n: 'C 類:同檔有 focus-within(證據過),旁白指標指的宣告真的畫框 → 綠', src: "const w = 'focus-within:!border-primary'\n// @focus-suppress C — x;承擔者:自己(fw.tsx#fieldChrome)\ncn('focus-visible:outline-none')", extra: [FW], bad: false },
    { n: 'C 類:旁白指標只寫行號沒寫檔名(「見上方 :398」)→ 紅', src: "const w = '[&:has(button:focus-visible)]:border-primary'\n// @focus-suppress C — x;承擔者:外層 div(見上方 :398)\ncn('focus-visible:outline-none')", bad: true },
    { n: 'C 類:標記上方無關註解提到 before-ring.tsx:8(真的有畫框),標記自己的承擔者只是一句話 → 紅(2026-09-27 前吃整個回看視窗會撿到上方那個而綠)', src: "// 參考 before-ring.tsx:8 的做法\n// @focus-suppress C — 自己的 ::before;承擔者:自己的 ::before\ncn('focus-visible:outline-none')", extra: [BEFORE_RING], bad: true },
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
    const got = scan([{ path: 't.tsx', src: c.src }, ...(c.extra ?? [])]).length > 0
    if (got !== c.bad) { console.error(`✗ selftest「${c.n}」預期 ${c.bad} 實得 ${got}`); ok = false }
  }
  console.log(ok ? `✓ selftest ${cases.length}/${cases.length} 通過` : '✗ selftest 失敗')
  process.exit(ok ? 0 : 1)
}

const problems = scan(load(ROOT))
if (problems.length) {
  console.error('✗ 下列焦點抑制沒有表態(SSOT:focus-canonical「問題一之二」):')
  console.error('  每一處都要在前 8 行內寫 `@focus-suppress <A|B|C|E|N> — <說明>;承擔者:<誰>`。')
  console.error('  先跑那份文件的六步判斷程序;走到第 6 步就代表**要畫**,不是加標記。')
  problems.forEach((p) => console.error(`    ${p.path}:${p.line}  ${p.why}\n         ${p.text}`))
  process.exit(1)
}
console.log('✓ 每一處焦點抑制都表明了類別與承擔者')
