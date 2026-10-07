#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: root barrel 產生器對 tokens / hooks / lib 這些 `export *` 來源同樣遵守 @internal —— 符號層 @internal 不進 root、
 *         檔頭模組層 @internal 的模組整個不進 root、貼著第一個 statement 的 JSDoc 只算那一個符號、`//` 行文與行中提到不算,
 *         components / patterns 具名區塊的既有排除不退步,產生後 `--check` 恆等、改壞即紅。
 *   紅: 九格判定表任一格不成立 → 指名那一格並 exit 1。對照組:`--generator <舊版產生器>` 跑 2026-10-07 之前的版本,
 *         符號層 / 模組層 / 每個出口都標 / 貼身 JSDoc 四格必紅(舊版對 `export *` 來源一律整包輸出)。
 *   綠: 現行產生器九格全過。純靜態合成夾具(暫存目錄),不讀真 repo 的元件,同一份產生器重複跑結果恆等。
 *
 * ── 為什麼有這支 ──
 * 2026-07-18 決策3「標 @internal 的符號不進 root front-door」只在 components / patterns 的具名區塊執行;tokens / hooks / lib
 * 走 `export *`,標了 @internal 的照樣從 npm 套件 root 對外(2026-10-07 稽核抓到:tokens/motion/closed-end-state.ts 的
 * holdClosedEndState,與既有同病的 lib/focus-after-trigger.ts、lib/roving-list-keyboard.ts 整個模組)。
 * CI 的「產生器產物與來源同步」只驗 index.ts 等於產生器輸出 —— 產生器本身的規則錯了,那道閘照樣綠;本支驗的是規則。
 *
 * 用法: node scripts/test-gen-design-system-barrel.mjs [--generator <產生器路徑>]
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const genArg = process.argv.indexOf('--generator')
const GENERATOR = genArg > 0 ? resolve(process.argv[genArg + 1]) : join(ROOT, 'scripts/gen-design-system-barrel.mjs')

// ── 合成夾具:形狀照真實案例(closed-end-state 的符號層、roving-list-keyboard 的模組層檔頭)──
const FIXTURE = {
  'components/Widget/widget.tsx': [
    '/**',
    ' * Widget —— 測試用公開元件。',
    ' */',
    'export const Widget = () => null',
    '/** @internal 私有 context */',
    'export const WidgetContext = 1',
    'export type WidgetProps = { label: string }',
  ].join('\n'),
  'components/Widget/index.ts': "export * from './widget'\n",
  'tokens/plain.ts': 'export const PLAIN_TOKEN = 1\n',
  'tokens/motion/mixed.ts': [
    '/** 開合動畫:公開的組合字串 */',
    "export const mixedMotion = 'animate-in'",
    '',
    '/** @internal 只給同目錄的開合動畫 SSOT 組字串用 */',
    "export const hiddenPiece = 'fill-mode-forwards'",
    "export type MixedKind = 'open' | 'closed'",
  ].join('\n'),
  'tokens/motion/only-internal.ts': [
    '/**',
    ' * 檔頭說明(沒有標籤)。',
    ' */',
    '',
    '/** @internal 唯一的出口 */',
    "export const onlyInternal = 'x'",
  ].join('\n'),
  'hooks/use-thing.ts': 'export function useThing() { return 1 }\n',
  'lib/internal-module.ts': [
    '/**',
    ' * @internal — 整個模組是 DS 內部實作(形狀同 lib/roving-list-keyboard.ts 的檔頭)。',
    ' */',
    '',
    '// ═══ 判定 ═══',
    '',
    '/** 普通文件 */',
    'export function helperA() { return 1 }',
    'export type HelperB = string',
  ].join('\n'),
  'lib/first-attached.ts': [
    '/** @internal 只有這一個符號(貼著第一個 statement,不是檔頭) */',
    'export const attachedInternal = 1',
    'export const attachedPublic = 2',
  ].join('\n'),
  'lib/prose.ts': [
    '// 說明:兄弟模組的 helperA 是 @internal,這裡只是用 // 行文提到它',
    'export function proseHelper() { return 1 }',
  ].join('\n'),
  'lib/plain-header.ts': [
    '/**',
    ' * 一般檔頭 —— 行中提到 @internal 這個字,但不在標籤位置。',
    ' */',
    '',
    'export const plainHeaderValue = 1',
  ].join('\n'),
}

const dir = mkdtempSync(join(tmpdir(), 'gen-barrel-selftest-'))
if (!dir || !dir.includes('gen-barrel-selftest-')) { console.error('✗ 暫存目錄建立失敗'); process.exit(1) }
const SRC = join(dir, 'packages/design-system/src')
for (const sub of ['components', 'patterns', 'tokens', 'hooks', 'lib']) mkdirSync(join(SRC, sub), { recursive: true })
for (const [rel, body] of Object.entries(FIXTURE)) {
  mkdirSync(dirname(join(SRC, rel)), { recursive: true })
  writeFileSync(join(SRC, rel), body.endsWith('\n') ? body : `${body}\n`)
}

const gen = (...args) => spawnSync(process.execPath, [GENERATOR, ...args], { cwd: dir, encoding: 'utf8' })
const first = gen()
let ok = true
const results = []
const ck = (name, pass, detail = '') => { results.push([name, pass, detail]); if (!pass) ok = false }

if (first.status !== 0) {
  ck('產生器在夾具上跑得起來', false, (first.stderr || first.stdout).trim().slice(0, 400))
} else {
  const out = readFileSync(join(SRC, 'index.ts'), 'utf8')
  const code = out.split('\n').filter((l) => !l.trimStart().startsWith('//'))
  const exported = (name) => code.some((l) => new RegExp(`\\b${name}\\b`).test(l))
  const has = (line) => code.includes(line)
  const fromSpec = (spec) => code.some((l) => l.endsWith(`from '${spec}'`))
  // 名字從 root 出去 = 具名出口裡有它,或它所在的模組整包 `export *`
  const leaks = (name, spec) => exported(name) || has(`export * from '${spec}'`)

  ck('C1 tokens 符號層 @internal 不進 root,同檔公開的照出',
    !leaks('hiddenPiece', './tokens/motion/mixed') && has("export { mixedMotion } from './tokens/motion/mixed'") && has("export type { MixedKind } from './tokens/motion/mixed'"),
    `hiddenPiece 從 root 出去=${leaks('hiddenPiece', './tokens/motion/mixed')}`)
  ck('C2 每個出口都標 @internal 的模組整個不進 root(形狀同 closed-end-state.ts)',
    !fromSpec('./tokens/motion/only-internal'), `onlyInternal 從 root 出去=${fromSpec('./tokens/motion/only-internal')}`)
  ck('C3 檔頭模組層 @internal 的 lib 模組整個不進 root(形狀同 roving-list-keyboard.ts)',
    !fromSpec('./lib/internal-module') && !exported('helperA'), `helperA 從 root 出去=${fromSpec('./lib/internal-module') || exported('helperA')}`)
  ck('C4 貼著第一個 statement 的 @internal 只算那一個符號,不擴大成整個模組',
    !leaks('attachedInternal', './lib/first-attached') && has("export { attachedPublic } from './lib/first-attached'"),
    `attachedInternal 從 root 出去=${leaks('attachedInternal', './lib/first-attached')} attachedPublic 具名出口=${has("export { attachedPublic } from './lib/first-attached'")}`)
  ck('C5 `//` 行文提到 @internal 不算(不誤殺)', has("export * from './lib/prose'"))
  ck('C6 JSDoc 行中提到 @internal、不在標籤位置不算(不誤殺)', has("export * from './lib/plain-header'"))
  ck('C7 沒有 @internal 的 tokens / hooks 模組照舊 `export *`', has("export * from './tokens/plain'") && has("export * from './hooks/use-thing'"))
  ck('C8 components 具名區塊的既有排除不退步(公開照出、@internal 排除)',
    has('  Widget,') && !exported('WidgetContext') && has('  WidgetProps,'))
  const check1 = gen('--check')
  appendFileSync(join(SRC, 'index.ts'), "export * from './lib/internal-module'\n")
  const check2 = gen('--check')
  ck('C9 產生後 `--check` 恆等;手動把 @internal 模組加回 index.ts 後 `--check` 紅',
    check1.status === 0 && check2.status !== 0, `產生後=${check1.status} 改壞後=${check2.status}`)
}
rmSync(dir, { recursive: true, force: true })

for (const [name, pass, detail] of results) console.log(`${pass ? '✓' : '✗'} ${name}${!pass && detail ? `  —— ${detail}` : ''}`)
console.log(ok ? `✅ gen-design-system-barrel @internal 判定表 PASS(${GENERATOR.replace(`${ROOT}/`, '')})` : `❌ gen-design-system-barrel @internal 判定表 FAIL(${GENERATOR.replace(`${ROOT}/`, '')})`)
process.exit(ok ? 0 : 1)
