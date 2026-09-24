#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 任何宣告 composite 角色(grid/listbox/tree/tablist/menu/menubar/radiogroup/treegrid)的檔案,同檔案裡拿得出方向鍵或焦點管理的證據;拿不出來就是對輔助科技的空頭承諾
 *   紅: 把某個檔案的 keydown / roving / aria-activedescendant 證據拿掉(或新增一個只寫角色、不接鍵盤的檔案)→ 本閘必須指名該檔與該角色並紅
 *   綠: 每個宣告都有證據、或帶逐行 escape 註解時必須綠;selftest 以合成原始碼雙向驗,不看真檔
 *
 * ── 為什麼有這支 ──
 *
 * 2026-09-24:`Calendar` 宣告 `role="grid"` + `role="row"` + `role="gridcell"`,**整檔零 keydown**,
 * 而且每一顆日期鈕都是 `tabIndex={0}` —— 一個月 35 格就是幾十個 Tab 停靠點,與 grid 的
 * 「單一停靠點 + 方向鍵」正好相反。螢幕閱讀器會宣告「表格,可用方向鍵瀏覽」,使用者按下去沒反應。
 * 同一輪還掃出 10 個 story 容器寫 `role="listbox"` 卻沒有任何焦點管理 —— 示範程式碼是消費者會照抄的。
 *
 * 規則本身寫在 `ds-canonical/references/keyboard-model-canonical.md`(WAI-ARIA 1.2 `composite` 逐字:
 * "Authors SHOULD ensure that a composite widget exists as a single navigation stop ... provide a
 * separate navigation mechanism")。但**寫完那條鐵律的當下,它零強制面** —— 而本 repo 的 M36(b'')
 * 記過同一件事:同一條規則的兩個子款,有 hook 的那款沒再犯,沒 hook 的那款犯了兩次。
 * 所以這支閘存在的理由就是:規則重犯代表缺的是強制面,不是再寫一遍散文。
 *
 * ── 判準刻意保守 ──
 *
 * 只問「同一個檔案裡有沒有鍵盤/焦點管理的證據」,不試圖判斷那套鍵盤寫得對不對 ——
 * 後者需要讀語意,做成正則就會變成另一個代理。寧可漏抓也不要誤抓:
 * 誤抓會讓人加 escape 敷衍,漏抓至少不會訓練人繞過它。
 *
 * 用法: node scripts/composite-role-keyboard-invariant.mjs [--selftest]
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** WAI-ARIA 1.2 的 composite 家族 + APG「Developing a Keyboard Interface」列出需要 managing focus 的 pattern。 */
const COMPOSITE_ROLES = Object.freeze([
  'grid', 'listbox', 'tree', 'tablist', 'menu', 'menubar', 'radiogroup', 'treegrid',
])

/**
 * 角色宣告的三種寫法都要認:`role="listbox"`、`role='listbox'`、`role={...'listbox'...}`。
 * 只認雙引號會漏 —— 2026-09-24 第一次盤點就是這樣漏掉一個 story 容器的預設值寫法。
 */
const ROLE_RE = new RegExp(
  `role\\s*[=:]\\s*(?:["'\`]\\s*(${COMPOSITE_ROLES.join('|')})\\s*["'\`]|\\{[^}]*["'\`](${COMPOSITE_ROLES.join('|')})["'\`][^}]*\\})`,
  'g',
)

/** 鍵盤/焦點管理存在的證據。任一命中即算有人負責。 */
const EVIDENCE_RE = /onKeyDown|addEventListener\(\s*['"`]keydown|aria-activedescendant|RovingFocus|useRovingTabIndex|tabIndex\s*=\s*\{?\s*-1|KeyboardEvent/

/** 逐行 escape:同一行或上一行寫明理由。 */
const ESCAPE_RE = /@composite-role-allow/

/**
 * 把註解與 `<code>` 說明文字拿掉,但**保留字元數**(用空格填回去),
 * 讓行號與引號奇偶性都不會位移。
 *
 * 為什麼需要這一步:本閘第一版對真檔報出 9 筆,**其中 7 筆是誤抓** ——
 * 那些 `role="listbox"` 全在 JSDoc、`//` 註解、或 `<code>role="grid"</code>` 這種文件展示裡。
 * 本檔檔頭自己寫了「寧可漏抓不要誤抓」,第一版就違反了 ——
 * 誤抓會讓人加 escape 敲衍,比漏抓更貴。下方 selftest 把這 7 種形狀收成對照組。
 */
export function stripNonCode(source) {
  let out = source
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  out = out.replace(/\/\*[\s\S]*?\*\//g, blank)          // 區塊註解 + JSDoc
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)))  // 行註解(不誤殺 http://)
  out = out.replace(/<code>[\s\S]*?<\/code>/g, blank)     // 文件展示的程式碼片段
  return out
}

/** 該位置是不是落在字串裡面(= 不是真的 JSX 屬性)。 */
function insideString(source, index) {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1
  const prefixOnLine = source.slice(lineStart, index)
  const odd = (ch) => (prefixOnLine.match(new RegExp(`(?<!\\\\)\\${ch}`, 'g')) || []).length % 2 === 1
  // 真的 `role="x"`:`role=` 本身在自己的引號**之前**,所以同行前置引號數是偶數。
  // 寫在 `note="... role='menu' ..."` 這種屬性字串裡的,前置雙引號數是奇數。
  if (odd('"') || odd("'")) return true
  // 模板字串會跨行,改看全文的反引號奇偶性。
  const backticks = (source.slice(0, index).match(/(?<!\\)`/g) || []).length
  return backticks % 2 === 1
}

/**
 * 純判定。輸入是 {path, source} 陣列,輸出是拿不出證據的宣告。
 * 刻意逐檔判、不逐行判 —— composite 的鍵盤通常寫在容器,角色寫在別處,逐行會全部誤抓。
 */
export function findEmptyCompositePromises(files) {
  const problems = []
  for (const { path, source: raw } of files) {
    const source = stripNonCode(raw)
    const lines = raw.split('\n')
    const hasEvidence = EVIDENCE_RE.test(source)
    ROLE_RE.lastIndex = 0
    let m
    while ((m = ROLE_RE.exec(source)) !== null) {
      if (insideString(source, m.index)) continue
      const role = m[1] || m[2]
      const lineIndex = source.slice(0, m.index).split('\n').length - 1
      const nearby = [lines[lineIndex - 1] ?? '', lines[lineIndex] ?? ''].join('\n')
      if (ESCAPE_RE.test(nearby)) continue
      if (hasEvidence) continue
      problems.push({ path, role, line: lineIndex + 1 })
    }
  }
  return problems
}

function trackedSourceFiles() {
  const out = execFileSync('git', ['ls-files', 'packages/design-system/src'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n')
    .filter((p) => /\.(tsx|ts)$/.test(p))
    .map((p) => ({ path: p, source: readFileSync(join(ROOT, p), 'utf8') }))
}

function selftest() {
  const bad = `
    export const Frame = ({ children }) => (
      <div role="listbox" className="x">{children}</div>
    )
  `
  const good = `
    export const Frame = ({ children }) => (
      <div role="listbox" onKeyDown={handleKeyDown} aria-activedescendant={activeId}>{children}</div>
    )
  `
  const escaped = `
    // @composite-role-allow: Radix 自己接管鍵盤,見 node_modules/@radix-ui/react-menu
    <div role="menu">{children}</div>
  `
  const braced = `
    const Frame = ({ role = 'listbox' }) => <div role={role}>{children}</div>
  `
  // 下面四種是第一版對真檔誤抓的形狀(7 筆誤報全落在這四類)。它們是綠側對照組:
  // 拿掉防誤抓那一段,這四格會立刻變紅 —— 這就是「該紅會紅」的反面驗證。
  const inJsDoc = `
    /**
     * 容器用 Command 而不是裸 MenuItem：Command 自帶方向鍵與 role="listbox"。
     */
    export const Demo = () => <div className="x" />
  `
  const inLineComment = `
    // 2026-09-24 從 role="listbox" 改成 role="group"
    export const Demo = () => <div className="x" />
  `
  const inCodeTag = `
    export const Doc = () => (
      <li><code>role="grid"</code> on day grid root</li>
    )
  `
  const inAttributeString = `
    export const Doc = () => (
      <Bad note="一排 MenuItem 塞進 Popover 會失去 menu 語意（role='menu' 缺失）" />
    )
  `
  const cases = [
    ['只寫角色、沒有任何鍵盤證據 → 必須紅', bad, 1],
    ['同檔有 onKeyDown / activedescendant → 必須綠', good, 0],
    ['帶逐行 escape 註解 → 必須綠', escaped, 0],
    ['寫成 role={role} 的預設值形式 → 仍要抓到(只認雙引號會漏)', braced, 1],
    ['寫在 JSDoc 說明裡 → 不得誤抓', inJsDoc, 0],
    ['寫在 // 註解裡 → 不得誤抓', inLineComment, 0],
    ['寫在 <code> 文件展示裡 → 不得誤抓', inCodeTag, 0],
    ['寫在另一個屬性的字串裡 → 不得誤抓', inAttributeString, 0],
  ]
  let failed = 0
  for (const [name, source, expected] of cases) {
    const got = findEmptyCompositePromises([{ path: 'synthetic.tsx', source }])
    if (got.length === expected) {
      console.log(`  ✓ ${name}`)
    } else {
      failed += 1
      console.error(`  ✗ ${name} — 實得 ${got.length} 筆(預期 ${expected}): ${JSON.stringify(got)}`)
    }
  }
  if (failed) {
    console.error(`\nselftest 失敗 ${failed} 格`)
    process.exit(1)
  }
  console.log('\nselftest 全過(綠側與紅側都驗到)')
}

if (process.argv.includes('--selftest')) {
  selftest()
} else {
  const files = trackedSourceFiles()
  const problems = findEmptyCompositePromises(files)
  if (!problems.length) {
    console.log(`composite 角色鍵盤承諾: ${files.length} 個檔全部拿得出證據或已明文 escape`)
    process.exit(0)
  }
  console.error('🚨 宣告了 composite 角色,但同檔案拿不出方向鍵/焦點管理的證據 —— 這是對輔助科技的空頭承諾:\n')
  for (const p of problems) console.error(`  ${p.path}:${p.line}  role="${p.role}"`)
  console.error('\n兩條路二選一(規則 → ds-canonical/references/keyboard-model-canonical.md):')
  console.error('  (a) 補實作:單一 Tab 停靠點 + 方向鍵(roving tabindex 或 aria-activedescendant)')
  console.error('  (b) 拿掉角色改成結構角色(group / presentation)—— 記得連同子元素的 option/treeitem 一起拿掉,否則留下孤兒')
  console.error('真的有第三方接管鍵盤時,在該行或上一行寫 `@composite-role-allow: <理由>`。')
  process.exit(1)
}
