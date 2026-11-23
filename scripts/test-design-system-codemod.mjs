#!/usr/bin/env node
// 消費端升版指令(packages/design-system/tools/codemods)的對照組。
// 每種 fix op(rename-prop / rename-export / rename-token)一組:合成「已裝的 DS 套件」(型別 + 帳本)與用舊寫法的消費端,
// 改寫前 typecheck 必紅、改寫後必綠;歧義一組:擋下的檔逐位元不動、其他檔照改;讀不到帳本 / 版本 = 儀器失效。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { PNG } from 'pngjs'
import { extract as extractTar } from '../node_modules/npm/node_modules/tar/dist/esm/index.js'
import {
  CodemodInstrumentError,
  UPGRADE_STAMP_FILE,
  applyCodemodProposal,
  buildRules,
  checkCodemodProposal,
  planCodemod,
  readInstalledLedger,
  resolveFromVersion,
  upgradeConsumer,
  watchList,
} from '../packages/design-system/tools/codemods/index.mjs'
import { compareVersions, entriesBetween } from '../packages/design-system/tools/changes/ledger.mjs'
import { runCodemodCli } from '../packages/design-system/tools/codemods/cli.mjs'
import {
  applyAtomicOperations,
  compareUtf8Bytes,
  sha256,
  stableStringify,
} from '../packages/design-system/tools/shared/safe-filesystem.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NPM_CLI = join(REPO_ROOT, 'node_modules/npm/bin/npm-cli.js')
const DS_DIR = 'node_modules/@qijenchen/design-system'
const SPEC = 'src/components/X/x.spec.md「做法」'

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'design-system-codemod-'))
  for (const [path, body] of Object.entries(files)) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, body)
  }
  return root
}

const JSX_GLOBAL = 'declare global { namespace JSX { interface Element { readonly __el?: true } interface IntrinsicElements { [name: string]: unknown } } }\nexport {}\n'

/** 合成「已裝的 DS」:型別(index.d.ts)+ 帳本;version 9.9.2,帳本兩節 9.9.1 / 9.9.2 */
function installedPackage(typesDts, sections) {
  const ledger = { $comment: 'fixture', releases: sections }
  return {
    [`${DS_DIR}/package.json`]: JSON.stringify({ name: '@qijenchen/design-system', version: '9.9.2', types: 'index.d.ts' }),
    [`${DS_DIR}/index.d.ts`]: typesDts,
    [`${DS_DIR}/ds-changes.json`]: JSON.stringify(ledger),
    'src/jsx.d.ts': JSX_GLOBAL,
  }
}
const entry = (version, slug, o) => ({ id: `${version}/${slug}`, do: '照新規格改。', spec: SPEC, ...o })

function typecheck(root) {
  const files = []
  const walk = (dir) => { for (const name of readdirSync(join(root, dir))) { const rel = `${dir}/${name}`; if (lstatSync(join(root, rel)).isDirectory()) walk(rel); else if (/\.tsx?$/.test(name)) files.push(join(root, rel)) } }
  walk('src')
  const program = ts.createProgram(files, {
    strict: true, noEmit: true, jsx: ts.JsxEmit.Preserve, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022, types: [], skipLibCheck: true, baseUrl: root,
  })
  return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
}
const installedAt = (root) => readInstalledLedger(join(root, DS_DIR))
// 合成夾具不是 git repo:改寫前的「未 commit 就拒跑」檢查另有一組 git 夾具的測試,這裡明給 force
const run = (root, extra = {}) => upgradeConsumer({ repoRoot: root, sourceRoots: ['src'], from: '9.9.0', installed: installedAt(root), force: true, ...extra })
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Codemod Fixture', '-c', 'user.email=codemod@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe', encoding: 'utf8' })

test('rename-prop:舊參數 typecheck 紅 → upgrade 改名並照值對照改值 → 綠,第二次跑零改動', () => {
  const root = fixture({
    ...installedPackage(`export declare function DataTable(props: { maxHeight?: number | 'none' | '100%' }): JSX.Element
export declare function Button(props: { width?: 'fill' | 'hug'; children?: unknown }): JSX.Element
export declare function Rating(props: { size?: 'sm' | 'md' }): JSX.Element
`, {
      '9.9.1': { changes: [
        entry('9.9.1', 'rating-xs', { surface: 'prop', target: 'RatingProps.size', change: 'narrowed', fix: { op: 'rename-prop', components: ['Rating'], from: 'size', to: 'size', values: { xs: 'sm' } } }),
      ] },
      '9.9.2': { changes: [
        entry('9.9.2', 'height', { surface: 'prop', target: 'DataTableProps.height', change: 'renamed', to: 'DataTableProps.maxHeight', fix: { op: 'rename-prop', components: ['DataTable'], from: 'height', to: 'maxHeight', values: { auto: 'none', '100%': '100%' }, pxToNumber: true } }),
        entry('9.9.2', 'fullWidth', { surface: 'prop', target: 'ButtonProps.fullWidth', change: 'renamed', to: 'ButtonProps.width', fix: { op: 'rename-prop', components: ['Button'], from: 'fullWidth', to: 'width', values: { true: 'fill', false: 'hug' } } }),
      ] },
    }),
    'src/app.tsx': `import { Button, DataTable, Rating as Stars } from '@qijenchen/design-system'
export const A = () => <DataTable height="auto" />
export const B = () => <DataTable height="400px" />
export const C = () => <DataTable height={"100%"} />
export const D = () => <Button fullWidth>送出</Button>
export const E = () => <Button fullWidth={false}>取消</Button>
export const F = () => <Stars size="xs" />
export const G = () => <Stars size="md" />
`,
  })
  assert.ok(typecheck(root).length >= 6, `改寫前必紅:${typecheck(root).join(' | ')}`)
  const { proposal, applied } = run(root)
  assert.equal(applied, true)
  assert.equal(proposal.blockers.length, 0)
  const after = readFileSync(join(root, 'src/app.tsx'), 'utf8')
  for (const needle of ['<DataTable maxHeight="none" />', '<DataTable maxHeight={400} />', '<DataTable maxHeight="100%" />', '<Button width="fill">', '<Button width="hug">', '<Stars size="sm" />', '<Stars size="md" />']) assert.ok(after.includes(needle), `改寫後應含 ${needle}:\n${after}`)
  assert.deepEqual(typecheck(root), [], '改寫後必綠')
  assert.equal(checkCodemodProposal({ repoRoot: root, proposal }).state, 'applied')
  const second = run(root)
  assert.equal(second.proposal.files.length, 0, '第二次跑零改動(冪等)')
})

test('rename-export:沒別名的 import 連同檔內引用一起改、別名 import 只改來源名、namespace 存取改屬性名 → typecheck 紅 → 綠', () => {
  const root = fixture({
    ...installedPackage(`export declare function evaluateTree(tree: unknown, row: unknown): boolean
export declare const ui: { evaluateTree: typeof evaluateTree }
`, {
      '9.9.2': { changes: [entry('9.9.2', 'match', { surface: 'export', target: 'legacyMatch', change: 'renamed', to: 'evaluateTree', fix: { op: 'rename-export', from: 'legacyMatch', to: 'evaluateTree' } })] },
    }),
    'src/direct.ts': `import { legacyMatch } from '@qijenchen/design-system'\nexport const ok = legacyMatch({}, {}) && [legacyMatch].length > 0\n`,
    'src/alias.ts': `import { legacyMatch as match } from '@qijenchen/design-system'\nexport const ok = match({}, {})\n`,
    'src/namespace.ts': `import * as DS from '@qijenchen/design-system'\nexport const ok = DS.legacyMatch({}, {})\n`,
  })
  assert.ok(typecheck(root).length >= 3, `改寫前必紅:${typecheck(root).join(' | ')}`)
  run(root)
  assert.equal(readFileSync(join(root, 'src/direct.ts'), 'utf8'), `import { evaluateTree } from '@qijenchen/design-system'\nexport const ok = evaluateTree({}, {}) && [evaluateTree].length > 0\n`)
  assert.match(readFileSync(join(root, 'src/alias.ts'), 'utf8'), /import \{ evaluateTree as match \}/)
  assert.match(readFileSync(join(root, 'src/namespace.ts'), 'utf8'), /DS\.evaluateTree\(/)
  assert.deepEqual(typecheck(root), [], '改寫後必綠')
})

test('rename-token:同一節的改名同時生效不串接(sm→md、xs→sm)、CSS 與 class 一起改 → typecheck 紅 → 綠', () => {
  const root = fixture({
    ...installedPackage(`export type RadiusToken = '--radius-sm' | '--radius-md'
export declare function cssVar(name: RadiusToken): string
`, {
      '9.9.2': { changes: [
        entry('9.9.2', 'radius-xs', { surface: 'token', target: '--radius-xs', change: 'renamed', to: '--radius-sm', fix: { op: 'rename-token', from: '--radius-xs', to: '--radius-sm', classes: { prefixes: ['rounded', 'rounded-t'], from: 'xs', to: 'sm' } } }),
        entry('9.9.2', 'radius-sm', { surface: 'token', target: '--radius-sm', change: 'behavior', fix: { op: 'rename-token', from: '--radius-sm', to: '--radius-md', classes: { prefixes: ['rounded', 'rounded-t'], from: 'sm', to: 'md' } } }),
      ] },
    }),
    'src/tokens.ts': `import { cssVar } from '@qijenchen/design-system'\nexport const small = cssVar('--radius-xs')\nexport const old4 = cssVar('--radius-sm')\nexport const cls = 'rounded-xs hover:rounded-t-sm rounded-sm-ish'\n`,
    'src/app.css': '.a { border-radius: var(--radius-xs); }\n.b { border-radius: var(--radius-sm); }\n',
  })
  // 改寫前:'--radius-xs' 不在型別允許集合 → 紅
  assert.ok(typecheck(root).length >= 1, `改寫前必紅:${typecheck(root).join(' | ')}`)
  run(root)
  assert.equal(readFileSync(join(root, 'src/tokens.ts'), 'utf8'), `import { cssVar } from '@qijenchen/design-system'\nexport const small = cssVar('--radius-sm')\nexport const old4 = cssVar('--radius-md')\nexport const cls = 'rounded-sm hover:rounded-t-md rounded-sm-ish'\n`)
  assert.equal(readFileSync(join(root, 'src/app.css'), 'utf8'), '.a { border-radius: var(--radius-sm); }\n.b { border-radius: var(--radius-md); }\n')
  assert.deepEqual(typecheck(root), [], '改寫後必綠')
})

test('歧義擋下不改:動態值、新舊參數並存、新名字已存在 → 那幾個檔逐位元不動並列在報告;其他檔照改', () => {
  const root = fixture({
    ...installedPackage(`export declare function DataTable(props: { maxHeight?: number | 'none' }): JSX.Element
export declare function evaluateTree(): boolean
`, {
      '9.9.2': { changes: [
        entry('9.9.2', 'height', { surface: 'prop', target: 'DataTableProps.height', change: 'renamed', to: 'DataTableProps.maxHeight', fix: { op: 'rename-prop', components: ['DataTable'], from: 'height', to: 'maxHeight', values: { auto: 'none' }, pxToNumber: true } }),
        entry('9.9.2', 'match', { surface: 'export', target: 'legacyMatch', change: 'renamed', to: 'evaluateTree', fix: { op: 'rename-export', from: 'legacyMatch', to: 'evaluateTree' } }),
      ] },
    }),
    'src/dynamic.tsx': `import { DataTable } from '@qijenchen/design-system'\nexport const A = ({ h }: { h: string }) => <DataTable height={h} />\n`,
    'src/both.tsx': `import { DataTable } from '@qijenchen/design-system'\nexport const A = () => <DataTable height="auto" maxHeight={3} />\n`,
    'src/unmapped.tsx': `import { DataTable } from '@qijenchen/design-system'\nexport const A = () => <DataTable height="50vh" />\n`,
    'src/clash.ts': `import { legacyMatch } from '@qijenchen/design-system'\nconst evaluateTree = 1\nexport const ok = legacyMatch() && evaluateTree\n`,
    'src/clean.tsx': `import { DataTable } from '@qijenchen/design-system'\nexport const A = () => <DataTable height="auto" />\n`,
  })
  const before = Object.fromEntries(['dynamic.tsx', 'both.tsx', 'unmapped.tsx', 'clash.ts'].map((f) => [f, readFileSync(join(root, 'src', f))]))
  const { proposal, report } = run(root)
  assert.deepEqual([...new Set(proposal.blockers.map((b) => b.path))].sort(), ['src/both.tsx', 'src/clash.ts', 'src/dynamic.tsx', 'src/unmapped.tsx'])
  for (const [f, bytes] of Object.entries(before)) assert.deepEqual(readFileSync(join(root, 'src', f)), bytes, `${f} 有歧義,必須逐位元不動`)
  assert.equal(readFileSync(join(root, 'src/clean.tsx'), 'utf8'), `import { DataTable } from '@qijenchen/design-system'\nexport const A = () => <DataTable maxHeight="none" />\n`)
  assert.match(report, /## 擋下沒改\(有歧義,\d+ 處/)
  assert.match(report, /src\/dynamic\.tsx:2/)
})

test('跨節串接(A→B、B→C ⇒ A→C)、勘誤蓋過舊條目的 fix、剩下的條目列出 檔:行 / 做法 / 規格', () => {
  const root = fixture({
    ...installedPackage(`export declare function Tag(props: { removeAriaLabel?: string; tone?: 'a' }): JSX.Element
export declare function DialogContent(props: { width?: number }): JSX.Element
`, {
      '9.9.1': { changes: [
        entry('9.9.1', 'dismiss', { surface: 'prop', target: 'TagProps.dismissLabel', change: 'renamed', to: 'TagProps.closeLabel', fix: { op: 'rename-prop', components: ['Tag'], from: 'dismissLabel', to: 'closeLabel' } }),
        entry('9.9.1', 'typo', { surface: 'prop', target: 'TagProps.color', change: 'renamed', to: 'TagProps.tone', fix: { op: 'rename-prop', components: ['Tag'], from: 'color', to: 'toneTypo' } }),
      ] },
      '9.9.2': {
        changes: [
          entry('9.9.2', 'close', { surface: 'prop', target: 'TagProps.closeLabel', change: 'renamed', to: 'TagProps.removeAriaLabel', fix: { op: 'rename-prop', components: ['Tag'], from: 'closeLabel', to: 'removeAriaLabel' } }),
          entry('9.9.2', 'dialog-width', { surface: 'default', target: 'DialogContent.width', change: 'behavior', do: '沒傳 width 的對話框預設寬變了。', spec: SPEC }),
        ],
        errata: [{ supersedes: '9.9.1/typo', fix: { op: 'rename-prop', components: ['Tag'], from: 'color', to: 'tone' } }],
      },
    }),
    'src/app.tsx': `import { Tag, DialogContent } from '@qijenchen/design-system'\nexport const A = () => <Tag dismissLabel="x" color="a" />\nexport const B = () => <DialogContent />\n`,
  })
  assert.ok(typecheck(root).length >= 1, `改寫前必紅:${typecheck(root).join(' | ')}`)
  const { report } = run(root)
  assert.equal(readFileSync(join(root, 'src/app.tsx'), 'utf8'), `import { Tag, DialogContent } from '@qijenchen/design-system'\nexport const A = () => <Tag removeAriaLabel="x" tone="a" />\nexport const B = () => <DialogContent />\n`)
  assert.deepEqual(typecheck(root), [])
  // Dialog 的 default 條目:沒傳 width 的使用處要列出(檔:行),附做法與 node_modules 裡的規格段落
  assert.match(report, /### `9\.9\.2\/dialog-width` 行為 `DialogContent\.width`/)
  assert.match(report, /- `src\/app\.tsx`:3 —— <DialogContent>\(沒傳 width\)/)
  assert.match(report, /規格:node_modules\/@qijenchen\/design-system\/src\/components\/X\/x\.spec\.md「做法」/)
  assert.match(report, /勘誤已套用:`9\.9\.1\/typo`\(9\.9\.2\)/)
})

test('儀器失效:讀不到帳本 / 版本不是 semver / 讀不出升版前的版本,一律丟 CodemodInstrumentError(不當成沒有要改的)', () => {
  const root = fixture({ ...installedPackage('export {}\n', { '9.9.2': { changes: [] } }), 'src/a.ts': 'export const a = 1\n' })
  unlinkSync(join(root, DS_DIR, 'ds-changes.json'))
  assert.throws(() => readInstalledLedger(join(root, DS_DIR)), CodemodInstrumentError)
  const bad = fixture({ [`${DS_DIR}/package.json`]: JSON.stringify({ name: '@qijenchen/design-system', version: 'latest' }), [`${DS_DIR}/ds-changes.json`]: '{"releases":{}}' })
  assert.throws(() => readInstalledLedger(join(bad, DS_DIR)), CodemodInstrumentError)
  const noGit = () => null
  assert.throws(() => resolveFromVersion({ repoRoot: root, installed: '9.9.2', readGit: noGit }), CodemodInstrumentError)
  const headSays = (v) => (_, args) => (args[1] === 'HEAD:package.json' ? JSON.stringify({ dependencies: { '@qijenchen/design-system': v } }) : JSON.stringify({ dependencies: { '@qijenchen/design-system': '9.9.0' } }))
  assert.equal(resolveFromVersion({ repoRoot: root, installed: '9.9.2', readGit: headSays('9.9.1') }), '9.9.1', '沒給 --from:讀 HEAD 宣告的舊版')
  assert.equal(resolveFromVersion({ repoRoot: root, installed: '9.9.2', readGit: headSays('9.9.2') }), '9.9.2', 'HEAD 已經是新版 = 這次升版已 commit,不再往 main 找舊版(否則重套)')
  assert.throws(() => resolveFromVersion({ repoRoot: root, from: '9.9.3', installed: '9.9.2' }), CodemodInstrumentError)
})

test('proposal digest、規劃後被動過的檔、mode 改變、symbolic link、交易鎖都擋下', () => {
  const pkg = installedPackage('export declare function Input(props: { width?: "hug" }): JSX.Element\n', {
    '9.9.2': { changes: [entry('9.9.2', 'auto', { surface: 'prop', target: 'InputProps.autoWidth', change: 'renamed', to: 'InputProps.width', fix: { op: 'rename-prop', components: ['Input'], from: 'autoWidth', to: 'width', values: { true: 'hug' } } })] },
  })
  const source = `import { Input } from '@qijenchen/design-system'\nexport const A = () => <Input autoWidth />\n`
  const root = fixture({ ...pkg, 'src/a.tsx': source })
  const plan = () => planCodemod({ repoRoot: root, sourceRoots: ['src'], from: '9.9.0', installed: installedAt(root) })
  const proposal = plan()
  const forged = structuredClone(proposal)
  forged.files[0].edits[0].to = 'forged'
  assert.throws(() => checkCodemodProposal({ repoRoot: root, proposal: forged }), /digest is invalid/)
  writeFileSync(join(root, 'src/a.tsx'), `${source}// concurrent\n`)
  assert.throws(() => applyCodemodProposal({ repoRoot: root, proposal, expectedProposalDigest: proposal.proposalDigest }), /neither the before nor after image/)
  writeFileSync(join(root, 'src/a.tsx'), source)
  writeFileSync(join(root, 'src/new.ts'), 'export const rogue = true\n')
  assert.throws(() => checkCodemodProposal({ repoRoot: root, proposal }), /gained, lost, or renamed/)
  unlinkSync(join(root, 'src/new.ts'))
  chmodSync(join(root, 'src/a.tsx'), 0o700)
  assert.throws(() => applyCodemodProposal({ repoRoot: root, proposal, expectedProposalDigest: proposal.proposalDigest }), /mode changed/)
  chmodSync(join(root, 'src/a.tsx'), proposal.inventory[0].mode)
  writeFileSync(join(root, '.qijenchen-ds-codemod.lock'), 'first-writer\n')
  assert.throws(() => applyCodemodProposal({ repoRoot: root, proposal, expectedProposalDigest: proposal.proposalDigest }), /another tool transaction is active/)
  assert.equal(readFileSync(join(root, 'src/a.tsx'), 'utf8'), source)
  unlinkSync(join(root, '.qijenchen-ds-codemod.lock'))
  assert.equal(applyCodemodProposal({ repoRoot: root, proposal, expectedProposalDigest: proposal.proposalDigest }).state, 'applied')
  const outside = fixture({ 'outside.ts': 'export const outside = true\n' })
  symlinkSync(outside, join(root, 'src/poison'))
  assert.throws(() => plan(), /symbolic link/)
})

test('路徑與 digest 用 UTF-8 位元組排序,不受 Intl 地區設定影響', () => {
  const pkg = installedPackage('export declare function Input(props: { width?: "hug" }): JSX.Element\n', {
    '9.9.2': { changes: [entry('9.9.2', 'auto', { surface: 'prop', target: 'InputProps.autoWidth', change: 'renamed', to: 'InputProps.width', fix: { op: 'rename-prop', components: ['Input'], from: 'autoWidth', to: 'width', values: { true: 'hug' } } })] },
  })
  const body = `import { Input } from '@qijenchen/design-system'\nexport const A = () => <Input autoWidth />\n`
  const root = fixture({ ...pkg, 'src/ä-input.tsx': body, 'src/z-input.tsx': body })
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, 'localeCompare')
  const plans = ['en-US', 'sv-SE'].map((locale) => {
    const collator = new Intl.Collator(locale)
    Object.defineProperty(String.prototype, 'localeCompare', { ...descriptor, value(other) { return collator.compare(String(this), String(other)) } })
    try { return planCodemod({ repoRoot: root, sourceRoots: ['src'], from: '9.9.0', installed: installedAt(root) }) } finally { Object.defineProperty(String.prototype, 'localeCompare', descriptor) }
  })
  assert.equal(plans[0].proposalDigest, plans[1].proposalDigest)
  assert.deepEqual(plans[0].files.map((r) => r.path), ['src/ä-input.tsx', 'src/z-input.tsx'].sort(compareUtf8Bytes))
  assert.deepEqual(Object.keys(JSON.parse(stableStringify({ 'ä-key': true, 'z-key': true }))), ['z-key', 'ä-key'])
})

test('CLI:upgrade 印 markdown 報告、讀不到帳本 exit 2(儀器失效)', () => {
  const root = fixture({
    ...installedPackage('export declare function Input(props: { width?: "hug" }): JSX.Element\n', {
      '9.9.2': { changes: [entry('9.9.2', 'auto', { surface: 'prop', target: 'InputProps.autoWidth', change: 'renamed', to: 'InputProps.width', fix: { op: 'rename-prop', components: ['Input'], from: 'autoWidth', to: 'width', values: { true: 'hug' } } })] },
    }),
    'src/a.tsx': `import { Input } from '@qijenchen/design-system'\nexport const A = () => <Input autoWidth />\n`,
  })
  const chunks = []
  const write = process.stdout.write
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true }
  try {
    assert.equal(runCodemodCli(['upgrade', '--root', root, '--source', 'src', '--from', '9.9.0', '--force'], { installed: installedAt(root) }), 0)
  } finally { process.stdout.write = write }
  assert.match(chunks.join(''), /# DS 升版:9\.9\.0 → 9\.9\.2/)
  assert.match(readFileSync(join(root, 'src/a.tsx'), 'utf8'), /<Input width="hug" \/>/)
})

test('同一次執行所有改名一次對照(xs→sm 與 sm→md 不連鎖);未 commit 就拒跑,跑兩次 = 跑一次;commit 後 HEAD 已是新版 → 零改動,硬給舊 --from 也擋', () => {
  const radius = { prefixes: ['rounded'] }
  const root = fixture({
    ...installedPackage('export {}\n', {
      '9.9.2': { changes: [
        entry('9.9.2', 'radius-xs', { surface: 'token', target: '--radius-xs', change: 'renamed', to: '--radius-sm', fix: { op: 'rename-token', from: '--radius-xs', to: '--radius-sm', classes: { ...radius, from: 'xs', to: 'sm' } } }),
        entry('9.9.2', 'radius-sm', { surface: 'token', target: '--radius-sm', change: 'default', fix: { op: 'rename-token', from: '--radius-sm', to: '--radius-md', classes: { ...radius, from: 'sm', to: 'md' } } }),
      ] },
    }),
    'package.json': JSON.stringify({ dependencies: { '@qijenchen/design-system': '9.9.0' } }),
    'src/app.css': '.chip { border-radius: var(--radius-xs); }\n.card { border-radius: var(--radius-sm); }\n',
    'src/app.tsx': "export const cls = 'rounded-xs rounded-sm'\n",
  })
  git(root, 'init', '--quiet')
  writeFileSync(join(root, '.gitignore'), 'node_modules\n')
  git(root, 'add', '-A')
  git(root, 'commit', '--quiet', '-m', 'consumer at 9.9.0')
  // sync-all 先改版號(package.json 未 commit 不擋)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@qijenchen/design-system': '9.9.2' } }))
  const upgrade = (extra = {}) => upgradeConsumer({ repoRoot: root, sourceRoots: ['src'], installed: installedAt(root), ...extra })
  const first = upgrade()
  assert.equal(first.proposal.from, '9.9.0', 'from 讀 HEAD 宣告的舊版')
  const once = { css: readFileSync(join(root, 'src/app.css'), 'utf8'), tsx: readFileSync(join(root, 'src/app.tsx'), 'utf8') }
  assert.equal(once.css, '.chip { border-radius: var(--radius-sm); }\n.card { border-radius: var(--radius-md); }\n', '同時替換:xs → sm、sm → md,不連鎖')
  assert.equal(once.tsx, "export const cls = 'rounded-sm rounded-md'\n")
  assert.throws(() => upgrade(), /uncommitted changes in the source roots/, '第二次跑:範圍內有未 commit 的改動 → 擋')
  assert.deepEqual({ css: readFileSync(join(root, 'src/app.css'), 'utf8'), tsx: readFileSync(join(root, 'src/app.tsx'), 'utf8') }, once, '跑兩次 = 跑一次')
  git(root, 'add', '-A')
  git(root, 'commit', '--quiet', '-m', 'upgrade to 9.9.2')
  const after = upgrade()
  assert.equal(after.proposal.entries.length, 0, 'commit 後 HEAD 已宣告 9.9.2 → 沒有要改的')
  assert.equal(after.proposal.files.length, 0)
  assert.throws(() => upgrade({ from: '9.9.0' }), /already declares/, '硬給舊 --from 會重套已 commit 的改名 → 擋')
  assert.deepEqual({ css: readFileSync(join(root, 'src/app.css'), 'utf8'), tsx: readFileSync(join(root, 'src/app.tsx'), 'utf8') }, once)
})

test('重跑三種順序:只跑一次照常跑;跑完只 commit src(版號還沒 commit)再跑 → 戳記擋;跑完什麼都不 commit 再跑 → 擋;戳記在 .git 底下不會被 commit', () => {
  const radius = { prefixes: ['rounded'] }
  const make = () => {
    const root = fixture({
      ...installedPackage('export {}\n', {
        '9.9.2': { changes: [
          entry('9.9.2', 'radius-xs', { surface: 'token', target: '--radius-xs', change: 'renamed', to: '--radius-sm', fix: { op: 'rename-token', from: '--radius-xs', to: '--radius-sm', classes: { ...radius, from: 'xs', to: 'sm' } } }),
          entry('9.9.2', 'radius-sm', { surface: 'token', target: '--radius-sm', change: 'default', fix: { op: 'rename-token', from: '--radius-sm', to: '--radius-md', classes: { ...radius, from: 'sm', to: 'md' } } }),
        ] },
      }),
      'package.json': JSON.stringify({ dependencies: { '@qijenchen/design-system': '9.9.0' } }),
      'src/app.css': '.chip { border-radius: var(--radius-xs); }\n',
    })
    writeFileSync(join(root, '.gitignore'), 'node_modules\n')
    git(root, 'init', '--quiet'); git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'consumer at 9.9.0')
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@qijenchen/design-system': '9.9.2' } }))
    const upgrade = (extra = {}) => upgradeConsumer({ repoRoot: root, sourceRoots: ['src'], installed: installedAt(root), ...extra })
    const css = () => readFileSync(join(root, 'src/app.css'), 'utf8')
    return { root, upgrade, css }
  }
  const once = '.chip { border-radius: var(--radius-sm); }\n'
  // (1) 只跑一次
  const a = make()
  const first = a.upgrade()
  assert.equal(first.proposal.from, '9.9.0')
  assert.equal(first.applied, true)
  assert.equal(first.stamped, true, '套用成功 → .git 底下留戳記')
  assert.equal(a.css(), once)
  const stamp = JSON.parse(readFileSync(join(a.root, '.git', UPGRADE_STAMP_FILE), 'utf8'))
  assert.deepEqual(stamp.runs, [{ from: '9.9.0', to: '9.9.2', sourceRoots: ['src'], files: ['src/app.css'] }])
  assert.doesNotMatch(git(a.root, 'status', '--porcelain=v1', '--untracked-files=all'), new RegExp(UPGRADE_STAMP_FILE), '戳記不在工作樹,不會被 commit')
  // (2) 跑完只 commit src、版號還沒 commit → HEAD 仍宣告 9.9.0、src 乾淨,只有戳記擋得住
  git(a.root, 'add', 'src'); git(a.root, 'commit', '--quiet', '-m', 'codemod')
  assert.throws(() => a.upgrade(), /already ran over src/, '同一組 9.9.0 → 9.9.2 再跑 → 擋')
  assert.equal(a.css(), once, '被擋 = 檔案沒動(xs 改成的 sm 沒有再變 md)')
  const forced = a.upgrade({ force: true })
  assert.equal(forced.proposal.from, '9.9.0', '--force 照跑(使用者明說要重套)')
  // (3) 跑完什麼都不 commit 再跑
  const b = make()
  b.upgrade()
  assert.throws(() => b.upgrade(), /uncommitted changes in the source roots|already ran over/, '什麼都沒 commit 再跑 → 擋')
  assert.equal(b.css(), once)
  // 不是 git repo(--force):拿不到 .git → 不留戳記,報告寫明不要再跑
  const c = fixture({
    ...installedPackage('export {}\n', { '9.9.2': { changes: [entry('9.9.2', 'radius-xs', { surface: 'token', target: '--radius-xs', change: 'renamed', to: '--radius-sm', fix: { op: 'rename-token', from: '--radius-xs', to: '--radius-sm' } })] } }),
    'src/app.css': '.chip { border-radius: var(--radius-xs); }\n',
  })
  const loose = run(c)
  assert.equal(loose.stamped, false)
  assert.match(loose.report, /沒有留下重跑戳記/)
})

test('帳本裡同一個參數被兩條以上規則碰到的每一組(改名的舊名 / 新名、沒有 fix 的條目)× 每種寫法:不當機、沒有內部錯誤、報告照出', () => {
  const ledgerPath = join(REPO_ROOT, 'packages/design-system/ds-changes.json')
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  const to = Object.keys(ledger.releases).sort(compareVersions).at(-1)
  const selected = entriesBetween(ledger, { from: '0.0.0', to })
  const rules = buildRules(selected)
  const watch = watchList(selected)
  const touches = new Map()
  const touch = (component, prop, label) => { const key = `${component}\0${prop}`; if (!touches.has(key)) touches.set(key, []); touches.get(key).push(label) }
  for (const rule of rules.props.values()) {
    touch(rule.component, rule.from, `規則 ${rule.ids.join('+')} 的舊名`)
    if (rule.to !== rule.from) touch(rule.component, rule.to, `規則 ${rule.ids.join('+')} 的新名`)
  }
  for (const w of watch.components) touch(w.component, w.prop, `條目 ${w.entry.id}`)
  const collisions = [...touches].filter(([, list]) => list.length >= 2).map(([key, list]) => ({ component: key.split('\0')[0], prop: key.split('\0')[1], list }))
  assert.ok(collisions.some((c) => c.component === 'Input' && c.prop === 'width'), `帳本列舉要包含審查抓到的 Input.width × autoWidth,實得 ${collisions.map((c) => `${c.component}.${c.prop}`).join(', ')}`)
  const literal = (key) => (key === 'true' || key === 'false' ? `{${key}}` : /^-?\d+(?:\.\d+)?$/.test(key) ? `{${key}}` : JSON.stringify(key))
  const files = {
    [`${DS_DIR}/package.json`]: JSON.stringify({ name: '@qijenchen/design-system', version: to }),
    [`${DS_DIR}/ds-changes.json`]: JSON.stringify(ledger),
  }
  collisions.forEach(({ component, prop }, index) => {
    const related = [...rules.props.values()].filter((r) => r.component === component && (r.from === prop || r.to === prop))
    const names = [...new Set([prop, ...related.flatMap((r) => [r.from, r.to])])]
    const values = new Set(['', '={true}', '={false}', '="x"', '={1}', '={dyn}'])
    for (const r of related) for (const key of Object.keys(r.values ?? {})) values.add(`=${literal(key)}`)
    const elements = [`<${component} {...rest} />`, `<${component} ${names.join(' ')} />`]
    for (const name of names) for (const value of values) elements.push(`<${component} ${name}${value} />`)
    files[`src/collision-${index}.tsx`] = `import { ${component} } from '@qijenchen/design-system'\nexport const C = ({ dyn, rest }: any) => <>\n${elements.map((e) => `  ${e}`).join('\n')}\n</>\n`
  })
  const root = fixture(files)
  const { proposal, report } = upgradeConsumer({ repoRoot: root, sourceRoots: ['src'], from: '0.0.0', installed: installedAt(root), dryRun: true })
  const internal = proposal.blockers.filter((b) => b.rule === 'codemod-internal-error')
  assert.deepEqual(internal, [], `${collisions.length} 組碰撞(${collisions.map((c) => `${c.component}.${c.prop}:${c.list.join(' / ')}`).join(';')})裡不准有任何一條規則丟錯`)
  assert.match(report, /## 條目一覽/)
})

test('任何一條規則丟錯:只有那個檔擋下(codemod-internal-error)、其他檔照改、報告照出,整次執行不當掉', () => {
  const root = fixture({
    ...installedPackage(`export declare function Button(props: { width?: 'fill' | 'hug'; children?: unknown }): JSX.Element\n`, {
      '9.9.2': { changes: [entry('9.9.2', 'fullWidth', { surface: 'prop', target: 'ButtonProps.fullWidth', change: 'renamed', to: 'ButtonProps.width', fix: { op: 'rename-prop', components: ['Button'], from: 'fullWidth', to: 'width', values: { true: 'fill', false: null } } })] },
    }),
    'src/a.tsx': `import { Button } from '@qijenchen/design-system'\nexport const A = () => <Button fullWidth="boom">x</Button>\n`,
    'src/b.tsx': `import { Button } from '@qijenchen/design-system'\nexport const B = () => <Button fullWidth>y</Button>\n`,
  })
  const installed = installedAt(root)
  // 注入規則實作的錯:值對照裡放一個序列化會丟錯的值(BigInt),模擬某條規則在某種寫法上出 bug
  installed.ledger.releases['9.9.2'].changes[0].fix.values.boom = 10n
  const before = readFileSync(join(root, 'src/a.tsx'), 'utf8')
  const { proposal, report } = upgradeConsumer({ repoRoot: root, sourceRoots: ['src'], from: '9.9.0', installed, force: true })
  assert.deepEqual(proposal.blockers.map((b) => [b.path, b.rule]), [['src/a.tsx', 'codemod-internal-error']])
  assert.equal(readFileSync(join(root, 'src/a.tsx'), 'utf8'), before, '出錯的檔逐位元不動')
  assert.match(readFileSync(join(root, 'src/b.tsx'), 'utf8'), /<Button width="fill">y<\/Button>/, '其他檔照改')
  assert.match(report, /src\/a\.tsx/)
  assert.match(report, /判斷時出錯/)
})

test('fullWidth={false} 直接拿掉(直排 ButtonGroup 裡仍撐滿);fullWidth 與 {true} 照對照改;動態值擋下', () => {
  const root = fixture({
    ...installedPackage(`export declare function Button(props: { width?: 'fill' | 'hug'; children?: unknown }): JSX.Element
export declare function ButtonGroup(props: { orientation?: 'vertical'; children?: unknown }): JSX.Element
`, {
      '9.9.2': { changes: [entry('9.9.2', 'fullWidth', { surface: 'prop', target: 'ButtonProps.fullWidth', change: 'renamed', to: 'ButtonProps.width', fix: { op: 'rename-prop', components: ['Button'], from: 'fullWidth', to: 'width', values: { true: 'fill', false: null } } })] },
    }),
    'src/app.tsx': `import { Button, ButtonGroup } from '@qijenchen/design-system'
export const A = () => <ButtonGroup orientation="vertical"><Button fullWidth={false}>取消</Button><Button fullWidth>送出</Button><Button fullWidth={true}>好</Button></ButtonGroup>
`,
    'src/dynamic.tsx': `import { Button } from '@qijenchen/design-system'\nexport const B = ({ wide }: { wide: boolean }) => <Button fullWidth={wide}>x</Button>\n`,
  })
  const { proposal } = run(root)
  assert.equal(readFileSync(join(root, 'src/app.tsx'), 'utf8'), `import { Button, ButtonGroup } from '@qijenchen/design-system'
export const A = () => <ButtonGroup orientation="vertical"><Button>取消</Button><Button width="fill">送出</Button><Button width="fill">好</Button></ButtonGroup>
`)
  assert.deepEqual(proposal.blockers.map((b) => b.path), ['src/dynamic.tsx'])
  assert.deepEqual(typecheck(root).filter((m) => !/fullWidth/.test(m)), [])
})

test('報告列出範圍內每一條的狀態:已改 N 處 / 0 處 / 可能經由 spread 帶入 / 要人工處理 / 只能人工查', () => {
  const root = fixture({
    ...installedPackage(`export declare function Button(props: { width?: 'fill' | 'hug' }): JSX.Element
export declare function DialogContent(props: { width?: number }): JSX.Element
export declare function useShell(): { layout: string }
`, {
      '9.9.2': { changes: [
        entry('9.9.2', 'fullWidth', { surface: 'prop', target: 'ButtonProps.fullWidth', change: 'renamed', to: 'ButtonProps.width', fix: { op: 'rename-prop', components: ['Button'], from: 'fullWidth', to: 'width', values: { true: 'fill', false: null } } }),
        entry('9.9.2', 'maxWidth', { surface: 'prop', target: 'DialogContentProps.maxWidth', change: 'renamed', to: 'DialogContentProps.width', fix: { op: 'rename-prop', components: ['DialogContent'], from: 'maxWidth', to: 'width', pxToNumber: true } }),
        entry('9.9.2', 'isMobile', { surface: 'type', target: 'ShellContextValue.isMobile', change: 'removed' }),
        entry('9.9.2', 'gone', { surface: 'export', target: 'goneHelper', change: 'removed' }),
      ] },
    }),
    'src/app.tsx': `import { Button, useShell } from '@qijenchen/design-system'
const p = { fullWidth: true }
export const A = () => <><Button fullWidth>a</Button><Button {...p}>b</Button></>
export const B = () => useShell().layout
`,
  })
  const { report } = run(root)
  assert.match(report, /## 條目一覽\(4 條,每一條都列\)/)
  assert.match(report, /`9\.9\.2\/fullWidth` 改名 `ButtonProps\.fullWidth` → `ButtonProps\.width`:已自動改 1 處;可能經由 spread 帶入 1 處\(要確認\)/)
  assert.match(report, /`9\.9\.2\/maxWidth` 改名 `DialogContentProps\.maxWidth` → `DialogContentProps\.width`:0 處\(掃描範圍內沒用到\)/)
  assert.match(report, /`9\.9\.2\/isMobile` 移除 `ShellContextValue\.isMobile`:這類只能人工查/)
  assert.match(report, /`9\.9\.2\/gone` 移除 `goneHelper`:0 處/)
  assert.match(report, /- `src\/app\.tsx`:3 —— <Button \{\.\.\.spread\}> 可能帶著舊參數 fullWidth,要確認/)
  assert.match(report, /依序跑 typecheck、lint:imports、governance:check、build/)
})

test('shared multi-file writer rolls back exact before-images after a mid-publication failure', () => {
  const root = fixture({ 'a.ts': 'before-a\n', 'b.ts': 'before-b\n' })
  const beforeA = Buffer.from('before-a\n')
  const beforeB = Buffer.from('before-b\n')
  const afterA = Buffer.from('after-a\n')
  const afterB = Buffer.from('after-b\n')
  assert.throws(() => applyAtomicOperations({
    root,
    fail: (message) => { throw new Error(message) },
    lockName: '.fixture.lock',
    operations: [
      { action: 'replace', path: 'a.ts', beforeSha256: sha256(beforeA), beforeMode: 0o644, afterSha256: sha256(afterA), afterBytes: afterA, mode: 0o644 },
      { action: 'replace', path: 'b.ts', beforeSha256: sha256(beforeB), beforeMode: 0o644, afterSha256: sha256(afterB), afterBytes: afterB, mode: 0o644 },
    ],
    afterOperation: ({ index }) => { if (index === 0) throw new Error('fixture publication failure') },
  }), /fixture publication failure/)
  assert.equal(readFileSync(join(root, 'a.ts'), 'utf8'), 'before-a\n')
  assert.equal(readFileSync(join(root, 'b.ts'), 'utf8'), 'before-b\n')
})

test('post-commit backup or lock cleanup failures never roll applied targets back', () => {
  for (const fault of ['backup-cleanup', 'lock-release']) {
    const root = fixture({ 'a.ts': 'before-a\n' })
    const before = Buffer.from('before-a\n')
    const after = Buffer.from('after-a\n')
    const mode = lstatSync(join(root, 'a.ts')).mode & 0o777
    assert.throws(() => applyAtomicOperations({
      root,
      fail: (message) => { throw new Error(message) },
      lockName: '.fixture.lock',
      operations: [
        { action: 'replace', path: 'a.ts', beforeSha256: sha256(before), beforeMode: mode, afterSha256: sha256(after), afterBytes: after, mode },
      ],
      ...(fault === 'backup-cleanup'
        ? { beforeBackupCleanup: () => { throw new Error('injected backup cleanup failure') } }
        : { beforeLockRelease: () => { throw new Error('injected lock release failure') } }),
    }), /atomic transaction committed but (?:before-image cleanup|lock release) failed/)
    assert.deepEqual(readFileSync(join(root, 'a.ts')), after)
    assert.equal(lstatSync(join(root, 'a.ts')).mode & 0o777, mode)
    assert.equal(readFileSync(join(root, '.fixture.lock'), 'utf8').trim(), String(process.pid))
    const backups = readdirSync(root).filter((name) => name.startsWith('.qijenchen-before-'))
    assert.equal(backups.length, fault === 'backup-cleanup' ? 1 : 0)
    unlinkSync(join(root, '.fixture.lock'))
  }
})

test('packed npm archive ships the ledger and both CLIs; upgrade runs against the real ledger in an isolated fixture', () => {
  const staging = mkdtempSync(join(tmpdir(), 'design-system-packed-cli-'))
  const packed = JSON.parse(execFileSync(process.execPath, ['--', NPM_CLI, 'pack', './packages/design-system', '--json', '--pack-destination', staging], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
  }))[0]
  assert.ok(packed.files.some((file) => file.path === 'ds-changes.json'), 'npm 包必須帶 ds-changes.json')
  const packageRoot = join(staging, 'runtime/node_modules/@qijenchen/design-system')
  mkdirSync(packageRoot, { recursive: true })
  extractTar({ file: join(staging, packed.filename), cwd: packageRoot, strip: 1, sync: true })
  const runtimeModules = join(staging, 'runtime/node_modules')
  cpSync(join(REPO_ROOT, 'node_modules/typescript'), join(runtimeModules, 'typescript'), { recursive: true })
  cpSync(join(REPO_ROOT, 'node_modules/pngjs'), join(runtimeModules, 'pngjs'), { recursive: true })
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies.typescript, '5.9.3')
  assert.equal(manifest.dependencies.pngjs, '7.0.0')
  assert.equal(manifest.bin['qijenchen-ds-codemod'], './tools/codemods/cli.mjs')
  assert.equal(manifest.bin['qijenchen-ds-visual-baseline'], './tools/visual-baseline/cli.mjs')
  assert.equal(manifest.exports['./ds-changes.json'], './ds-changes.json')

  const consumer = join(staging, 'runtime/consumer')
  mkdirSync(join(consumer, 'src'), { recursive: true })
  const binRoot = join(consumer, 'node_modules/.bin')
  mkdirSync(binRoot, { recursive: true })
  for (const [name, path] of Object.entries(manifest.bin)) {
    symlinkSync(relative(binRoot, join(packageRoot, path)), join(binRoot, name))
  }
  // 真實帳本:0.1.0-beta.146 節的 Rating size="xs" → "sm"(rename-prop 值對照)
  writeFileSync(join(consumer, 'src/app.tsx'), `import { Rating } from '@qijenchen/design-system'\nexport const App = () => <Rating size="xs" />\n`)
  const report = execFileSync(process.execPath, ['--', NPM_CLI, 'exec', '--offline', '--', 'qijenchen-ds-codemod', 'upgrade', '--root', consumer, '--source', 'src', '--from', '0.1.0-beta.145', '--force', '--report', 'upgrade.md'], {
    cwd: consumer,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: join(staging, 'no-ambient-node-path'), npm_config_ignore_scripts: 'true' },
    stdio: 'pipe',
  })
  assert.match(report, /# DS 升版:0\.1\.0-beta\.145 → /)
  assert.match(readFileSync(join(consumer, 'src/app.tsx'), 'utf8'), /<Rating size="sm" \/>/)
  assert.match(readFileSync(join(consumer, 'upgrade.md'), 'utf8'), /0\.1\.0-beta\.148\/useIsNarrowViewport/)

  const image = new PNG({ width: 1, height: 1 })
  image.data.set([10, 20, 30, 255])
  mkdirSync(join(consumer, 'candidate'))
  mkdirSync(join(consumer, 'baseline'))
  writeFileSync(join(consumer, 'candidate/image.png'), PNG.sync.write(image))
  image.data.set([30, 20, 10, 255])
  writeFileSync(join(consumer, 'baseline/image.png'), PNG.sync.write(image))
  writeFileSync(join(consumer, 'statements.json'), `${JSON.stringify({ 'image.png': 'Changed the reviewed foreground and contrast.' })}\n`)
  execFileSync('git', ['init', '--quiet'], { cwd: consumer, stdio: 'pipe' })
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/qijenchen-fixtures/packed-cli.git'], { cwd: consumer, stdio: 'pipe' })
  execFileSync('git', ['add', '--', 'src', 'candidate', 'baseline', 'statements.json'], { cwd: consumer, stdio: 'pipe' })
  execFileSync('git', ['-c', 'user.name=Packed CLI Fixture', '-c', 'user.email=packed-cli@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'packed cli base'], { cwd: consumer, stdio: 'pipe' })
  execFileSync(process.execPath, ['--', NPM_CLI, 'exec', '--offline', '--', 'qijenchen-ds-visual-baseline', 'plan', '--root', consumer, '--author', 'clean-room-author', '--candidate', 'candidate', '--baseline', 'baseline', '--statements', 'statements.json', '--output', 'visual.json'], {
    cwd: consumer,
    env: { ...process.env, NODE_PATH: join(staging, 'no-ambient-node-path'), npm_config_ignore_scripts: 'true' },
    stdio: 'pipe',
  })
  const visual = JSON.parse(readFileSync(join(consumer, 'visual.json'), 'utf8'))
  assert.equal(visual.pngParserVersion, 'pngjs@7.0.0')
  assert.equal(visual.reviewTrust.status, 'not-activated')
  assert.throws(() => execFileSync(process.execPath, ['--', NPM_CLI, 'exec', '--offline', '--', 'qijenchen-ds-visual-baseline', 'check', '--root', consumer, '--proposal', 'visual.json'], {
    cwd: consumer,
    env: { ...process.env, NODE_PATH: join(staging, 'no-ambient-node-path'), npm_config_ignore_scripts: 'true' },
    stdio: 'pipe',
  }), (error) => {
    assert.equal(error.status, 1)
    assert.match(error.stderr.toString('utf8'), /pending visual changes require --review/)
    return true
  })
})
