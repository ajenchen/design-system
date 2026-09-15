#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AgentPanel × DismissableLayer 負向鐵律
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`components/AgentPanel/agent-panel.spec.md`「Esc 與關閉語意」的負向鐵律段。
//
// 為什麼值得一支閘:這是本家族唯一的**單向門**,而且是**靜默**失效。
// 一旦面板殼被包進 Radix 的 DismissableLayer(或任何自帶 dismiss 的 Radix primitive),
//   - `dismissable-layer.tsx:59-61` 只把 Esc 送給疊最上層 → 面板會在剛好是最上層時被 Esc 關掉,
//     與 spec「Esc 永遠不關面板」直接相反;
//   - 同時吃到 `disableOutsidePointerEvents`(外點關閉)與焦點 trap,
//     面板從常駐 app UI 變成暫時性浮層。
// 兩者都不會有任何錯誤訊息,只會「有一天它自己關掉了」。
//
// 掃描對象只限**面板殼自己**(AgentPanel 容器 / FAB 的面板分支)。
// 面板**內部**開浮層是合法的 —— spec 第一列就是「關那個最內層的浮層」,
// 所以 DropdownMenu / Popover / Tooltip 出現在檔案裡不算違規,
// 違規的是把它們套在**面板根節點**上。

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 路徑含中文 → 必須 fileURLToPath,`.pathname` 會留下百分號編碼
const DIR = fileURLToPath(new URL('../packages/design-system/src/components/AgentPanel', import.meta.url))

/** 自帶 dismiss 行為的 Radix content primitive(套在根節點上就會改變面板語意) */
const DISMISSING = [
  'DismissableLayer',
  'PopoverPrimitive.Content', 'DropdownMenuPrimitive.Content',
  'DialogPrimitive.Content', 'HoverCardPrimitive.Content',
  'PopoverContent', 'DropdownMenuContent', 'DialogContent', 'SheetContent',
]

/** 面板殼的根節點:這幾個 forwardRef 元件回傳的最外層 JSX */
const SHELL_COMPONENTS = ['AgentPanel', 'AgentPanelRoot']

export function scanAgentPanelShell(files) {
  const violations = []
  for (const { path, src } of files) {
    const lines = src.split('\n')
    // 找面板殼元件的宣告位置
    for (const shell of SHELL_COMPONENTS) {
      const declRe = new RegExp(`(const|function)\\s+${shell}\\b`)
      const start = lines.findIndex(l => declRe.test(l))
      if (start === -1) continue
      // 從宣告往下找它 return 的第一個 JSX 開標籤
      for (let i = start; i < Math.min(start + 400, lines.length); i++) {
        const m = lines[i].match(/^\s*(?:return\s*\(?\s*)?<([A-Za-z_][\w.]*)/)
        if (!m) continue
        if (!/return|^\s*</.test(lines[i])) continue
        const tag = m[1]
        if (DISMISSING.some(d => tag === d || tag.endsWith('.' + d))) {
          violations.push({ path, line: i + 1, shell, tag })
        }
        break
      }
    }
    // 第二層:任何直接 import DismissableLayer 進本目錄都要人看一眼
    lines.forEach((l, i) => {
      if (/from ['"]@radix-ui\/react-dismissable-layer['"]/.test(l)) {
        violations.push({ path, line: i + 1, shell: '(import)', tag: 'react-dismissable-layer' })
      }
    })
  }
  return violations
}

function load(dir) {
  return readdirSync(dir)
    .filter(n => n.endsWith('.tsx') && !n.includes('.stories.'))
    .map(n => ({ path: `AgentPanel/${n}`, src: readFileSync(join(dir, n), 'utf8') }))
}

if (process.argv.includes('--selftest')) {
  const cases = [
    { name: '乾淨的面板殼', src: 'const AgentPanel = React.forwardRef((p, r) => {\n  return (\n    <aside ref={r}>\n', bad: false },
    { name: '面板殼被包進 DismissableLayer', src: 'const AgentPanel = React.forwardRef((p, r) => {\n  return (\n    <DismissableLayer>\n', bad: true },
    { name: '面板殼是 Popover.Content', src: 'function AgentPanel() {\n  return <PopoverPrimitive.Content>\n', bad: true },
    { name: '面板內部用 DropdownMenu(合法)', src: 'const AgentPanel = () => {\n  return (\n    <aside>\n      <DropdownMenuContent />\n', bad: false },
    { name: '直接 import dismissable-layer', src: "import { DismissableLayer } from '@radix-ui/react-dismissable-layer'\nconst AgentPanel = () => <aside/>", bad: true },
  ]
  let ok = true
  for (const c of cases) {
    const got = scanAgentPanelShell([{ path: 't.tsx', src: c.src }]).length > 0
    if (got !== c.bad) { console.error(`✗ selftest「${c.name}」預期 ${c.bad} 實得 ${got}`); ok = false }
  }
  console.log(ok ? `✓ selftest ${cases.length}/${cases.length} 通過` : '✗ selftest 失敗')
  process.exit(ok ? 0 : 1)
}

const v = scanAgentPanelShell(load(DIR))
if (v.length) {
  console.error('✗ AgentPanel 的面板殼進入了自帶 dismiss 的 Radix 疊 —— 這會靜默推翻 spec 的 Esc 語意:')
  console.error('  面板會在剛好是最上層時被 Esc 關掉,並吃到外點關閉與焦點 trap。')
  console.error('  SSOT:components/AgentPanel/agent-panel.spec.md「Esc 與關閉語意」負向鐵律段')
  v.forEach(x => console.error(`    ${x.path}:${x.line}  ${x.shell} → <${x.tag}>`))
  process.exit(1)
}
console.log('✓ AgentPanel 面板殼不在任何 dismiss 疊內,Esc 語意成立')
