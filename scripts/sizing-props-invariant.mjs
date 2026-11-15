#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 尺寸參數只有一套名字(`ds-canonical/references/props-naming.md`「尺寸參數」,user 2026-11-11「尺寸:甲」)——
 *         撐滿 / 跟內容只叫 `width="fill"` / `width="hug"`,`size` 只當檔位,欄位家族不漏 HTML 原生 width / height,
 *         DS 自己不再用已停用的舊名。
 *   紅: R1 公開元件的 *Props 新增撐滿 / 跟內容的同義名(fullWidth / block / autoWidth …),或既有舊名沒標 @deprecated;
 *       R2 DS 自己的 JSX(元件 / 範例 / 模板 / 閘夾具)用已停用的舊名(<Button fullWidth> / <FieldControlGroup block> /
 *          <Input autoWidth> / <FieldGroup horizontalLabelWidth> / <DataTable height>);
 *       R3 *Props 的 `size` 收數字或任意字串(= 拿 size 當長度),不在正方形媒體例外清單;
 *       R4 *Props 繼承 InputHTMLAttributes 卻沒把原生 `width` / `height` Omit 掉。
 *       → 指名 file:line 與修法,exit 1。`--selftest` 用合成原始碼證明四條各自會紅、合規寫法不誤報。
 *   綠: 四條 0 筆。純語法掃描(TypeScript createSourceFile,不做型別推論),同一份 worktree 恆等,沒有取樣。
 *   註: 2026-11-15 新寫(audit-r7 INV-24:「沒有任何一份 SSOT 規定尺寸類 prop 怎麼命名,所以各元件各自照外部某一家取名」)。
 *        DialogContent `autoHeight` 的 JSX 用法歸 `overlay-story-contract-invariant.mjs` S3 管,本閘的 R2 不重複報。
 */
// sizing-props-invariant.mjs — 尺寸參數命名閘
//
// 為什麼要有:2026-11-11 全面稽核(audit-r7「尺寸類 prop」)量到「撐滿」有 3 個名字(width='fill' / fullWidth / block)、
// 「跟內容」4 種寫法、Input 系列型別會過但沒作用的原生 width、DataTable `height` 實為上限。根因是 fill / hug 在 2026-07 成為
// canonical 之後沒有閘,舊名照外部各家長出來(MUI / Polaris 的 fullWidth、Ant 的 block)。改名本身(2026-11-15)只修了現況,
// 這支擋的是「下一個元件又照某一家取名」。
//
// 判準住 props-naming.md「尺寸參數」;本檔只放機器要用的清單。

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { isDirectRun } from './lib/direct-run.mjs'

const ROOT = process.cwd()

/** 撐滿 / 跟內容的同義名(外部各家的名字)。新元件一個都不准加。 */
export const SIZING_MODE_ALIASES = new Set([
  'fullWidth', 'fullHeight', 'block', 'autoWidth', 'autoHeight', 'fluid', 'stretch',
  'shouldFitContainer', 'fitContainer', 'isFullWidth', 'fillWidth', 'fillHeight', 'hugContent',
])

/**
 * 已停用、保留一個版本的舊名(`Props名.prop名` → 新名)。只有這幾個准許出現在 *Props 裡,而且必須標 @deprecated。
 * 下一個版本移除舊名時,連同這裡一起刪 —— 清單只准變短。
 */
export const DEPRECATED_ALIASES = new Map([
  ['ButtonProps.fullWidth', 'width="fill"'],
  ['SegmentedControlProps.fullWidth', 'width="fill"'],
  ['FieldControlGroupProps.block', 'width="fill"'],
  ['InputProps.autoWidth', 'width="hug"'],
  ['DialogContentProps.autoHeight', 'height="hug"'],
  ['FieldGroupProps.horizontalLabelWidth', 'labelWidth'],
  ['DataTableProps.height', 'maxHeight'],
])

/** R2:DS 自己的 JSX 不得再用的舊寫法(元件名 → 屬性名 → 新寫法)。DialogContent autoHeight 歸 overlay-story-contract S3。 */
export const DEPRECATED_JSX = [
  { tag: /^(Button|CarouselNext|CarouselPrevious|SidebarTrigger|SegmentedControl)$/, attr: 'fullWidth', fix: 'width="fill"' },
  { tag: /^FieldControlGroup$/, attr: 'block', fix: 'width="fill"' },
  { tag: /^(Input|SidebarInput)$/, attr: 'autoWidth', fix: 'width="hug"' },
  { tag: /^FieldGroup$/, attr: 'horizontalLabelWidth', fix: 'labelWidth' },
  { tag: /^DataTable$/, attr: 'height', fix: 'maxHeight(height="auto" → maxHeight="none"、"400px" → {400}、"100%" → "100%")' },
]

/** R3:`size` 是邊長 px 的例外(正方形媒體;props-naming.md「尺寸參數」第 4 條)。清單只准變短。 */
export const SIZE_AS_LENGTH_EXCEPTIONS = new Set(['AvatarProps', 'CircularProgressProps', 'AgentLogoProps'])

// ── 掃描範圍 ────────────────────────────────────────────────────────────────────
const PROPS_DIRS = ['packages/design-system/src/components', 'packages/design-system/src/patterns']
const JSX_DIRS = [
  'packages/design-system/src',
  'packages/design-system/ds-canonical/templates',
  'apps',
  'scripts/test-fixtures',
]
const SKIP_DIR = new Set(['node_modules', 'dist', 'storybook-static', '__selftest__'])

function walk(dir, acc, accept) {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return acc
  for (const name of readdirSync(abs)) {
    if (name.startsWith('.') || SKIP_DIR.has(name)) continue
    const rel = join(dir, name)
    const st = statSync(join(ROOT, rel))
    if (st.isDirectory()) walk(rel, acc, accept)
    else if (accept(name)) acc.push(rel.split(sep).join('/'))
  }
  return acc
}

const isPropsSource = (name) => /\.tsx?$/.test(name) && !/\.(stories|test|spec)\.tsx?$/.test(name) && !name.startsWith('_') && !name.endsWith('.d.ts')

function parse(path, text) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
const hasDeprecatedTag = (node) => ts.getJSDocTags(node).some((t) => t.tagName.getText() === 'deprecated')
const memberName = (m) => (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)) ? m.name.text : null)

/** R1 / R3 / R4:掃一個檔案裡的 *Props 宣告。 */
export function checkPropsSource(path, text) {
  const hits = []
  const sf = parse(path, text)
  const visit = (node) => {
    let propsName = null
    let members = null
    if (ts.isInterfaceDeclaration(node) && /Props$/.test(node.name.text)) {
      propsName = node.name.text
      members = node.members
      // R4:繼承 InputHTMLAttributes 必須 Omit 原生 width / height
      for (const clause of node.heritageClauses ?? []) {
        for (const t of clause.types) {
          const txt = t.getText(sf)
          if (!/InputHTMLAttributes</.test(txt)) continue
          const omitted = /^(React\.)?Omit</.test(txt) ? [...txt.matchAll(/'([^']+)'/g)].map((m) => m[1]) : []
          const missing = ['width', 'height'].filter((k) => !omitted.includes(k))
          if (missing.length) hits.push({ rule: 'R4', path, line: lineOf(sf, t), found: `${propsName} extends ${txt.replace(/\s+/g, ' ').slice(0, 90)}`, fix: `把原生 ${missing.join(' / ')} 一起 Omit(<input type="text"> 的這兩個屬性沒有作用,寫了不報錯也不生效);寬度改走 DS 的 width 軸(FieldWidth)` })
        }
      }
    } else if (ts.isTypeAliasDeclaration(node) && /Props$/.test(node.name.text) && ts.isTypeLiteralNode(node.type)) {
      propsName = node.name.text
      members = node.type.members
    }
    if (propsName && members) {
      for (const m of members) {
        if (!ts.isPropertySignature(m)) continue
        const name = memberName(m)
        if (!name) continue
        const key = `${propsName}.${name}`
        // R1:撐滿 / 跟內容的同義名
        if (SIZING_MODE_ALIASES.has(name) || DEPRECATED_ALIASES.has(key)) {
          if (!DEPRECATED_ALIASES.has(key)) {
            hits.push({ rule: 'R1', path, line: lineOf(sf, m), found: key, fix: '撐滿 / 跟內容只准用 width="fill" / width="hug"(props-naming.md「尺寸參數」第 1 條);不得新增同義名' })
          } else if (!hasDeprecatedTag(m)) {
            hits.push({ rule: 'R1', path, line: lineOf(sf, m), found: key, fix: `舊名必須標 @deprecated(改用 ${DEPRECATED_ALIASES.get(key)});保留一個版本、行為不變` })
          }
        }
        // R3:size 只當檔位
        if (name === 'size' && m.type && !SIZE_AS_LENGTH_EXCEPTIONS.has(propsName)) {
          const t = m.type.getText(sf)
          if (/\bnumber\b/.test(t) || /(^|[|\s])string\b/.test(t)) {
            hits.push({ rule: 'R3', path, line: lineOf(sf, m), found: `${key}: ${t}`, fix: 'size 只當 sm / md / lg 檔位;長度用 width / height(數字 = px)。正方形媒體邊長是唯一例外(props-naming.md「尺寸參數」第 4 條)' })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

/** R2:掃一個檔案裡的 JSX 屬性。 */
export function checkJsxSource(path, text) {
  const hits = []
  if (!path.endsWith('.tsx')) return hits
  const sf = parse(path, text)
  const visit = (node) => {
    if (ts.isJsxAttribute(node)) {
      const attr = node.name.getText(sf)
      const el = node.parent.parent
      const tag = el.tagName ? el.tagName.getText(sf) : ''
      for (const rule of DEPRECATED_JSX) {
        if (rule.attr === attr && rule.tag.test(tag)) {
          hits.push({ rule: 'R2', path, line: lineOf(sf, node), found: `<${tag} ${node.getText(sf).replace(/\s+/g, ' ').slice(0, 60)}>`, fix: `已停用的舊名,改 ${rule.fix}(props-naming.md「尺寸參數」第 5 條:DS 自己的程式、範例、規格不得再用舊名)` })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

function scanRepo() {
  const hits = []
  let propsFiles = 0
  let jsxFiles = 0
  for (const dir of PROPS_DIRS) {
    for (const f of walk(dir, [], isPropsSource)) {
      propsFiles++
      hits.push(...checkPropsSource(f, readFileSync(join(ROOT, f), 'utf8')))
    }
  }
  for (const dir of JSX_DIRS) {
    for (const f of walk(dir, [], (n) => n.endsWith('.tsx'))) {
      jsxFiles++
      hits.push(...checkJsxSource(f, readFileSync(join(ROOT, f), 'utf8')))
    }
  }
  return { hits, propsFiles, jsxFiles }
}

// ── selftest:合成原始碼,四條各自會紅、合規寫法不誤報 ─────────────────────────────────────
function selftest() {
  const problems = []
  const expect = (cond, msg) => { if (!cond) problems.push(msg) }
  const rules = (hits) => hits.map((h) => h.rule).sort().join(',')

  // R1:新元件加 fullWidth(沒在舊名清單)→ 紅
  expect(rules(checkPropsSource('x/card.tsx', 'export interface CardProps { fullWidth?: boolean }')) === 'R1', 'R1:新元件的 fullWidth 應紅')
  // R1:block 也是同義名
  expect(rules(checkPropsSource('x/toolbar.tsx', 'interface ToolbarProps { block?: boolean }')) === 'R1', 'R1:新元件的 block 應紅')
  // R1:清單內的舊名但沒標 @deprecated → 紅
  expect(rules(checkPropsSource('x/button.tsx', 'export interface ButtonProps { fullWidth?: boolean }')) === 'R1', 'R1:舊名沒標 @deprecated 應紅')
  // R1 合規:清單內的舊名 + @deprecated → 綠;新名 width → 綠
  expect(checkPropsSource('x/button.tsx', 'export interface ButtonProps {\n  width?: SizingMode\n  /** @deprecated 改用 width="fill" */\n  fullWidth?: boolean\n}').length === 0, 'R1:清單內舊名標了 @deprecated 不應紅')
  // 不是 *Props 的型別不管(內部 context、常數表)
  expect(checkPropsSource('x/item.tsx', 'interface RowCtx { block?: boolean }\nconst t = { block: { sm: 32 } }').length === 0, 'R1:非 *Props 不應紅')
  // R2:舊寫法 JSX → 紅;新寫法 → 綠
  expect(rules(checkJsxSource('x/a.stories.tsx', 'const a = <Button fullWidth>送出</Button>')) === 'R2', 'R2:<Button fullWidth> 應紅')
  expect(rules(checkJsxSource('x/a.stories.tsx', 'const a = <FieldControlGroup block><Input /></FieldControlGroup>')) === 'R2', 'R2:<FieldControlGroup block> 應紅')
  expect(rules(checkJsxSource('x/a.stories.tsx', 'const a = <DataTable columns={c} data={d} height="auto" />')) === 'R2', 'R2:<DataTable height> 應紅')
  expect(rules(checkJsxSource('x/a.stories.tsx', 'const a = <FieldGroup horizontalLabelWidth="120px" />')) === 'R2', 'R2:<FieldGroup horizontalLabelWidth> 應紅')
  expect(checkJsxSource('x/a.stories.tsx', 'const a = <><Button width="fill" /><DataTable maxHeight="none" /><DialogContent height="hug" /><svg height="16" /><img height={40} /></>').length === 0, 'R2:新寫法與 svg / img / DialogContent 的 height 不應紅')
  // R3:size 收數字 → 紅;檔位 → 綠;例外清單 → 綠
  expect(rules(checkPropsSource('x/chip.tsx', 'export interface ChipProps { size?: number }')) === 'R3', 'R3:size: number 應紅')
  expect(rules(checkPropsSource('x/chip.tsx', "export interface ChipProps { size?: 'sm' | 'md' | string }")) === 'R3', 'R3:size 收任意字串應紅')
  expect(checkPropsSource('x/chip.tsx', "export interface ChipProps { size?: 'sm' | 'md' | 'lg'; pageSize?: number }").length === 0, 'R3:檔位與複合字 pageSize 不應紅')
  expect(checkPropsSource('x/avatar.tsx', "export interface AvatarProps { size?: number | 'fill' }").length === 0, 'R3:Avatar 例外不應紅')
  // R4:繼承 InputHTMLAttributes 沒 Omit width / height → 紅;Omit 了 → 綠
  expect(rules(checkPropsSource('x/input.tsx', "export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {}")) === 'R4', 'R4:沒 Omit 原生 width / height 應紅')
  expect(rules(checkPropsSource('x/input.tsx', 'export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}')) === 'R4', 'R4:直接繼承也應紅')
  expect(checkPropsSource('x/input.tsx', "export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'width' | 'height'> {}").length === 0, 'R4:Omit 了 width / height 不應紅')

  if (problems.length) {
    console.error(`✗ sizing-props selftest:${problems.length} 格不符`)
    for (const p of problems) console.error(`   - ${p}`)
    process.exit(1)
  }
  console.log('✓ sizing-props selftest:R1 新同義名 / 舊名缺 @deprecated、R2 舊寫法 JSX、R3 size 當長度、R4 漏原生 width / height 各自會紅;合規寫法、非 *Props、svg / img 的 height、正方形媒體例外不誤報')
}

// 被 import 時(例:拿檢查函式對舊版原始碼做對照)只匯出函式、不跑;判準唯一實作 lib/direct-run.mjs(經符號連結叫也認得)
if (!isDirectRun(import.meta.url)) {
  // imported — no-op
} else if (process.argv.includes('--selftest')) {
  selftest()
} else {
  const { hits, propsFiles, jsxFiles } = scanRepo()
  if (propsFiles === 0 || jsxFiles === 0) {
    console.error(`✗ sizing-props-invariant:掃到 0 個檔(props ${propsFiles} / jsx ${jsxFiles})—— 掃描範圍壞了,不是乾淨(請在 repo 根目錄執行)`)
    process.exit(2)
  }
  if (hits.length) {
    console.error(`❌ sizing-props-invariant FAIL(${hits.length}):`)
    for (const h of hits) console.error(`   - ${h.rule} ${h.path}:${h.line} ${h.found}\n       → ${h.fix}`)
    console.error('   SSOT:packages/design-system/ds-canonical/references/props-naming.md「尺寸參數」')
    process.exit(1)
  }
  console.log(`✓ sizing-props-invariant:R1–R4 0 筆(*Props 掃 ${propsFiles} 檔、JSX 掃 ${jsxFiles} 檔;舊名清單 ${DEPRECATED_ALIASES.size} 個,全部標 @deprecated)`)
}
