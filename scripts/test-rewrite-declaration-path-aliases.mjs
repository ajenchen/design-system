#!/usr/bin/env node
// rewrite-declaration-path-aliases.mjs(build:dts 第二步,2026-10-07 取代 tsc-alias)的行為與紅燈對照組。
// 每個 fixture 都用 TypeScript 真的編譯一次,再對 tsc 的實際產出做改寫,不手寫假的 .d.ts。
// 紅燈案例一律同時驗「整批不寫入」:同一批裡本來可以改寫的檔案也必須原封不動。
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import {
  DeclarationPathAliasError,
  rewriteDeclarationPathAliases,
} from '../packages/design-system/rewrite-declaration-path-aliases.mjs'

const BASE_OPTIONS = {
  rootDir: './src',
  outDir: './dist',
  declaration: true,
  emitDeclarationOnly: true,
  module: 'ESNext',
  moduleResolution: 'bundler',
  target: 'ES2020',
  strict: true,
  skipLibCheck: true,
  baseUrl: '.',
}
const BASE_PATHS = { '@/fixture/*': ['./src/*'], '@/shared/*': ['./src/shared/*'] }

const SOURCES = {
  'src/shared/format.ts': [
    'export interface Money { amount: number; currency: string }',
    'export function formatMoney(value: Money): string { return `${value.amount} ${value.currency}` }',
    '',
  ].join('\n'),
  'src/components/Invoice/invoice.ts': [
    "import type { Money } from '@/fixture/shared/format'",
    "export { formatMoney } from '@/shared/format'",
    '/**',
    ' * 發票明細列。用法:',
    ' * ```ts',
    " * import { formatMoney } from '@/fixture/shared/format'",
    ' * ```',
    ' */',
    'export interface InvoiceLine {',
    '  total: Money',
    "  tax: import('@/shared/format').Money",
    '}',
    "declare module '@/fixture/shared/format' {",
    '  interface Money { note?: string }',
    '}',
    '',
  ].join('\n'),
  'src/index.ts': "export type { InvoiceLine } from '@/fixture/components/Invoice/invoice'\n",
}

function writeConfig(root, paths = BASE_PATHS, { exclude, compilerOptions = {} } = {}) {
  const config = { compilerOptions: { ...BASE_OPTIONS, ...compilerOptions, paths }, include: ['src'], ...(exclude ? { exclude } : {}) }
  writeFileSync(join(root, 'tsconfig.json'), `${JSON.stringify(config, null, 2)}\n`)
}

// 建一個真的專案並用 TypeScript 編譯出宣告檔(等同 `tsc -p tsconfig.json`)。
function emittedFixture({ paths = BASE_PATHS, extraSources = {}, exclude, compilerOptions } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'declaration-path-aliases-'))
  for (const [file, text] of Object.entries({ ...SOURCES, ...extraSources })) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  writeConfig(root, paths, { exclude, compilerOptions })
  const parsed = ts.getParsedCommandLineOfConfigFile(join(root, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...program.emit().diagnostics]
  assert.deepEqual(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [], 'fixture must compile cleanly')
  return root
}

const read = (root, file) => readFileSync(join(root, file), 'utf8')

// consumer 視角:沒有任何 paths 設定,只拿 dist 的宣告檔編譯,必須零錯誤。
function consumerDiagnostics(root, files) {
  const consumer = ts.createProgram({
    rootNames: files.map((file) => join(root, file)),
    options: { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, types: [] },
  })
  return ts.getPreEmitDiagnostics(consumer).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
}
const INVOICE = 'dist/components/Invoice/invoice.d.ts'
const INDEX = 'dist/index.d.ts'

function assertRejectsWithoutWriting(root, pattern, { files = [INVOICE, INDEX] } = {}) {
  const before = Object.fromEntries(files.map((file) => [file, read(root, file)]))
  assert.throws(
    () => rewriteDeclarationPathAliases({ project: join(root, 'tsconfig.json') }),
    (error) => error instanceof DeclarationPathAliasError && error.violations.some((line) => pattern.test(line)),
  )
  for (const file of files) assert.equal(read(root, file), before[file], `${file} must not be written when the batch fails`)
}

test('rewrites code specifiers, import() types, declare module and JSDoc examples to output-relative paths', () => {
  const root = emittedFixture()
  try {
    const before = read(root, INVOICE)
    assert.match(before, /'@\/fixture\/shared\/format'/)
    const result = rewriteDeclarationPathAliases({ project: join(root, 'tsconfig.json') })
    const after = read(root, INVOICE)
    assert.match(after, /import type \{ Money \} from '\.\.\/\.\.\/shared\/format'/)
    assert.match(after, /export \{ formatMoney \} from '\.\.\/\.\.\/shared\/format'/)
    assert.match(after, /import\('\.\.\/\.\.\/shared\/format'\)\.Money/)
    assert.match(after, /declare module '\.\.\/\.\.\/shared\/format'/)
    assert.match(after, / \* import \{ formatMoney \} from '\.\.\/\.\.\/shared\/format'/)
    assert.equal(read(root, INDEX), "export type { InvoiceLine } from './components/Invoice/invoice';\n")
    assert.doesNotMatch(after, /@\/(?:fixture|shared)\//)
    assert.equal(result.rewriteCount, 6)
    assert.equal(result.commentRewriteCount, 1)
    assert.equal(result.rewrittenFiles.length, 2)

    assert.deepEqual(consumerDiagnostics(root, [INDEX, INVOICE]), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('with fallback substitutions, the target TypeScript actually resolved decides the output path', () => {
  // `@/shared/*` 先試 shared-v2(只有 currency),找不到 format 才退到 shared —— 與 tsc 解析同一順序。
  const root = emittedFixture({
    paths: { ...BASE_PATHS, '@/shared/*': ['./src/shared-v2/*', './src/shared/*'] },
    extraSources: {
      'src/shared-v2/currency.ts': "export type CurrencyCode = 'TWD' | 'USD' | 'JPY'\n",
      'src/components/Receipt/receipt.ts': [
        "import type { CurrencyCode } from '@/shared/currency'",
        "import type { Money } from '@/shared/format'",
        'export interface Receipt { currency: CurrencyCode; paid: Money }',
        '',
      ].join('\n'),
    },
  })
  try {
    rewriteDeclarationPathAliases({ project: join(root, 'tsconfig.json') })
    const receipt = read(root, 'dist/components/Receipt/receipt.d.ts')
    assert.match(receipt, /from '\.\.\/\.\.\/shared-v2\/currency'/)
    assert.match(receipt, /from '\.\.\/\.\.\/shared\/format'/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('when one target is nested inside an earlier one, the substitution TypeScript resolved first decides the path', () => {
  // `@/money/*` 先試 src/、再試 src/shared/。format 只在 shared → 必須寫成 shared/format;
  // rates 兩處都有 → TypeScript 取第一個(src/rates),不是「第一個包含該檔的資料夾」也不是較深的那個。
  const root = emittedFixture({
    paths: { ...BASE_PATHS, '@/money/*': ['./src/*', './src/shared/*'] },
    extraSources: {
      'src/rates.ts': 'export interface ExchangeRate { from: string; to: string; rate: number }\n',
      'src/shared/rates.ts': 'export interface LegacyRate { value: number }\n',
      'src/components/Payout/payout.ts': [
        "import type { Money } from '@/money/format'",
        "import type { ExchangeRate } from '@/money/rates'",
        'export interface Payout { gross: Money; rate: ExchangeRate }',
        '',
      ].join('\n'),
    },
  })
  try {
    rewriteDeclarationPathAliases({ project: join(root, 'tsconfig.json') })
    const payout = read(root, 'dist/components/Payout/payout.d.ts')
    assert.match(payout, /import type \{ Money \} from '\.\.\/\.\.\/shared\/format'/)
    assert.match(payout, /import type \{ ExchangeRate \} from '\.\.\/\.\.\/rates'/)
    assert.deepEqual(consumerDiagnostics(root, ['dist/components/Payout/payout.d.ts']), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a file excluded by tsconfig but imported by a compiled file is rewritten (tsc still emits its declaration)', () => {
  // 與 DS 的 `exclude: **/stories-helpers/**` 同形:exclude 只決定起點,被 import 的檔照樣編進程式、照樣有宣告。
  const root = emittedFixture({
    exclude: ['**/stories-helpers/**'],
    extraSources: {
      'src/stories-helpers/invoice-fixture.ts': [
        "import type { Money } from '@/shared/format'",
        'export interface InvoiceFixture { sample: Money }',
        '',
      ].join('\n'),
      'src/components/Invoice/invoice-preview.ts': [
        "import type { InvoiceFixture } from '@/fixture/stories-helpers/invoice-fixture'",
        'export interface InvoicePreviewProps { fixture: InvoiceFixture }',
        '',
      ].join('\n'),
    },
  })
  try {
    const preview = 'dist/components/Invoice/invoice-preview.d.ts'
    const fixture = 'dist/stories-helpers/invoice-fixture.d.ts'
    assert.match(read(root, fixture), /'@\/shared\/format'/, 'tsc must have emitted the excluded-but-imported file')
    rewriteDeclarationPathAliases({ project: join(root, 'tsconfig.json') })
    assert.match(read(root, preview), /from '\.\.\/\.\.\/stories-helpers\/invoice-fixture'/)
    assert.match(read(root, fixture), /from '\.\.\/shared\/format'/)
    assert.deepEqual(consumerDiagnostics(root, [preview, fixture]), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('aliases to a CSS asset, a JSON module or a file outside the compiled program turn red with the actual reason', () => {
  const root = emittedFixture({
    exclude: ['**/legacy/**'],
    compilerOptions: { resolveJsonModule: true },
    extraSources: {
      'src/components/Invoice/invoice.css': '.invoice { display: grid }\n',
      'src/components/Invoice/invoice-theme.ts': "import '@/fixture/components/Invoice/invoice.css'\nexport const INVOICE_THEME = 'light'\n",
      'src/data/currencies.json': '{ "TWD": "新台幣", "USD": "美元" }\n',
      'src/components/Invoice/currency-list.ts': "import currencies from '@/fixture/data/currencies.json'\nexport type CurrencyList = typeof currencies\n",
      'src/legacy/old-invoice.ts': 'export interface OldInvoice { id: string }\n',
      'src/components/Invoice/migration.ts': [
        '/**',
        " * 舊版用法:import type { OldInvoice } from '@/fixture/legacy/old-invoice'",
        ' */',
        'export interface InvoiceMigration { version: 2 }',
        '',
      ].join('\n'),
    },
  })
  try {
    const files = [INVOICE, INDEX, 'dist/components/Invoice/invoice-theme.d.ts', 'dist/components/Invoice/currency-list.d.ts', 'dist/components/Invoice/migration.d.ts']
    const before = Object.fromEntries(files.map((file) => [file, read(root, file)]))
    assert.throws(
      () => rewriteDeclarationPathAliases({ project: join(root, 'tsconfig.json') }),
      (error) => error instanceof DeclarationPathAliasError
        && error.violations.length === 3
        && error.violations.some((line) => /invoice-theme\.d\.ts:1 import\/export "@\/fixture\/components\/Invoice\/invoice\.css": .*points at components\/Invoice\/invoice\.css, a file TypeScript does not resolve as a module/.test(line))
        && error.violations.some((line) => /currency-list\.d\.ts:1 import\/export "@\/fixture\/data\/currencies\.json": resolves to data\/currencies\.json, for which tsc emits no declaration \(\.json module\)/.test(line))
        && error.violations.some((line) => /migration\.d\.ts:2 comment "@\/fixture\/legacy\/old-invoice": resolves to legacy\/old-invoice\.ts, which is not part of the program tsc compiled/.test(line)),
    )
    for (const file of files) assert.equal(read(root, file), before[file], `${file} must not be written when the batch fails`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a second run is a no-op and check mode accepts rewritten output but rejects raw tsc output', () => {
  const root = emittedFixture()
  try {
    assert.throws(
      () => rewriteDeclarationPathAliases({ project: join(root, 'tsconfig.json'), write: false }),
      (error) => error instanceof DeclarationPathAliasError && error.violations.some((line) => /still contains path aliases \(check mode\)/.test(line)),
    )
    rewriteDeclarationPathAliases({ project: join(root, 'tsconfig.json') })
    const once = read(root, INVOICE)
    assert.equal(rewriteDeclarationPathAliases({ project: join(root, 'tsconfig.json') }).rewriteCount, 0)
    assert.equal(read(root, INVOICE), once)
    assert.equal(rewriteDeclarationPathAliases({ project: join(root, 'tsconfig.json'), write: false }).rewriteCount, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a deliberately broken mapping turns red and writes nothing', () => {
  const root = emittedFixture()
  try {
    writeConfig(root, { ...BASE_PATHS, '@/fixture/*': ['./src-renamed/*'] })
    assertRejectsWithoutWriting(root, /"@\/fixture\/\*" → "\.\/src-renamed\/\*" points at a missing directory/)
    writeConfig(root, { ...BASE_PATHS, '@/fixture/*': ['./src/components/*'] })
    assertRejectsWithoutWriting(root, /path alias "@\/fixture\/\*" cannot be resolved/)
    writeConfig(root, { ...BASE_PATHS, '@/fixture/*': ['./*'] })
    assertRejectsWithoutWriting(root, /is outside rootDir/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unresolvable alias in code or in a JSDoc example turns red and writes nothing', () => {
  const root = emittedFixture()
  try {
    const original = read(root, INVOICE)
    writeFileSync(join(root, INVOICE), `import type { Refund } from '@/fixture/billing/refund';\n${original}`)
    assertRejectsWithoutWriting(root, /invoice\.d\.ts:1 import\/export "@\/fixture\/billing\/refund": path alias "@\/fixture\/\*" cannot be resolved/)
    writeFileSync(join(root, INVOICE), `/** 範例:import { Refund } from '@/fixture/billing/refund' */\n${original}`)
    assertRejectsWithoutWriting(root, /invoice\.d\.ts:1 comment "@\/fixture\/billing\/refund": path alias "@\/fixture\/\*" cannot be resolved \(aliases in comments are rewritten too and must resolve/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('typo aliases, baseUrl-style bare specifiers and aliased triple-slash references turn red', () => {
  const root = emittedFixture()
  try {
    const original = read(root, INVOICE)
    writeFileSync(join(root, INVOICE), `export type Typo = import('@/fixtrue/shared/format').Money;\n${original}`)
    assertRejectsWithoutWriting(root, /looks like a path alias but matches no tsconfig paths pattern/)
    writeFileSync(join(root, INVOICE), `import type { Money as Raw } from 'src/shared/format';\n${original}`)
    assertRejectsWithoutWriting(root, /bare specifier resolves into the source tree via baseUrl \(shared\/format\.ts\)/)
    writeFileSync(join(root, INVOICE), `/// <reference path="@/fixture/shared/format.d.ts" />\n${original}`)
    assertRejectsWithoutWriting(root, /path aliases are not applied to triple-slash references/)
    writeFileSync(join(root, INVOICE), `import type { Money as Escaped } from '@/fixture/shared/form\\u0061t';\n${original}`)
    assertRejectsWithoutWriting(root, /module specifier with escapes cannot be rewritten verbatim/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('unsupported paths forms and missing tsc output are rejected before any rewrite', () => {
  const root = emittedFixture()
  try {
    writeConfig(root, { ...BASE_PATHS, '@/money': ['./src/shared/format.ts'] })
    assertRejectsWithoutWriting(root, /unsupported paths key "@\/money"/)
    writeConfig(root, { ...BASE_PATHS, '@/shared/*': ['./src/shared/*.ts'] })
    assertRejectsWithoutWriting(root, /unsupported paths substitution "@\/shared\/\*" → "\.\/src\/shared\/\*\.ts"/)
    writeConfig(root)
    rmSync(join(root, 'dist/shared/format.d.ts'))
    assertRejectsWithoutWriting(root, /declaration output\(s\) missing \(run tsc -p first\)/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the built design-system declarations contain no path alias (check mode against the real dist)', () => {
  const result = rewriteDeclarationPathAliases({ project: 'packages/design-system/tsconfig.json', write: false })
  assert.ok(result.declarationFiles > 0, 'the real dist must contain declaration files (run build:lib first)')
  assert.equal(result.rewriteCount, 0)
})
