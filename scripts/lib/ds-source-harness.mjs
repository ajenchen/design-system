// ═══════════════════════════════════════════════════════════════════════════
// DS 原始碼 harness 的共用打包(2026-10-01)
// ═══════════════════════════════════════════════════════════════════════════
//
// 「測原始碼本身、不測 story」的閘(form-validation-contract / escape-and-focus-contract)把 DS 的 .ts / .tsx **原始碼**連同一頁
// 最小 harness 用 esbuild 打成單一 IIFE、塞進空白頁跑 —— 測到的永遠是原始碼(不會因為忘了 build:lib 測到舊的),也不需要 storybook。
// 兩支閘原本各打一份,收成這一支:
//   · `root`:要量的**整棵**原始碼。預設本 repo;`--root=<dir>` 可指到 `git archive` 出來的基準樹 —— 這就是「修改前紅、修改後綠」的
//     天然對照組(M32「儀器要先有對照組」)。基準樹不需要裝 node_modules:套件一律用本 repo 的(esbuild `nodePaths`)。
//   · `mutate(path, src)`:selftest 的根因突變可以落在**任何一個** DS 檔(不只 hook);每個突變必須剛好紅它負責的那幾列。
//   · 路徑別名(`@/design-system/*` / `@/lib/*`)讀那棵樹自己的 `packages/design-system/tsconfig.json`。
//   · CSS / 字型用 empty loader、圖用 dataurl:harness 只量 DOM、值與焦點,不量長相。
//   · 要量長相的列(例:可聚焦的停用與原生停用滑過 / 按住同色)另用 `compileDsCss` 把**同一棵樹**的 DS 樣式用 tailwindcss 原始碼編出來、
//     注入頁面(2026-10-07)—— 一樣不經 build:lib / storybook,`--root=` 指到基準樹時量的是基準樹自己的樣式。
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { compile } from 'tailwindcss'
import { settleAfterInteraction, waitForFocusStable } from './launch-browser.mjs'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 等證據的天花板(不是「已發生」的代理):超過就是儀器失效 */
export const WAIT_CAP_MS = 10_000
/** 讀焦點前焦點要連續幾個影格不動 */
export const FOCUS_FRAMES = 6

/**
 * 真鍵盤 / 真滑鼠的最小驅動:每個動作之後等版面連續靜止(settleAfterInteraction,全庫同一個預設影格數),
 * 讀焦點之前等焦點連續不動;等不到 = 儀器失效(M37:沒量到 ≠ 沒發生)。
 */
export function makeDriver(page) {
  const settle = async () => {
    const r = await settleAfterInteraction(page, { capMs: WAIT_CAP_MS })
    if (!r.ok) throw new InstrumentError(`版面 ${WAIT_CAP_MS}ms 內等不到靜止`)
  }
  const focusStable = async () => {
    const r = await waitForFocusStable(page, { frames: FOCUS_FRAMES, capMs: WAIT_CAP_MS })
    if (!r.ok) throw new InstrumentError(`焦點 ${WAIT_CAP_MS}ms 內一直在跳`)
  }
  // 找不到 / 按不到元素是儀器失效(不是產品裁決,也不是通過):把 Playwright 的逾時換成 InstrumentError,報告帶標記
  const guard = async (what, run) => {
    try { await run() } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError') throw new InstrumentError(`${what}(Playwright 逾時)`)
      throw error
    }
  }
  return {
    settle,
    focusStable,
    click: async (selector) => { await guard(`按不到 ${selector}`, () => page.click(selector, { timeout: WAIT_CAP_MS })); await settle(); await focusStable() },
    type: async (text) => { await page.keyboard.type(text); await settle() },
    press: async (key) => { await page.keyboard.press(key); await settle(); await focusStable() },
    focus: async (selector) => { await guard(`找不到要聚焦的 ${selector}`, () => page.focus(selector, { timeout: WAIT_CAP_MS })); await settle(); await focusStable() },
    clearFocused: async () => { await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace'); await settle() },
    /** 等某個條件成立(頁面端函式字串);等不到 = 儀器失效 */
    waitFor: async (fn, label) => {
      await page.waitForFunction(fn, null, { timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError(`${WAIT_CAP_MS}ms 內等不到:${label}`) })
      await settle()
    },
  }
}

/** `--root=<dir>`:要量的整棵原始碼(相對 cwd);沒給 = 本 repo。 */
export function resolveSourceRoot(argv = process.argv) {
  const override = argv.find((a) => a.startsWith('--root='))?.slice('--root='.length)
  return override ? resolve(process.cwd(), override) : REPO_ROOT
}

/** 在這棵樹裡,DS 原始碼的目錄。 */
export const dsSourceDir = (root) => resolve(root, 'packages/design-system/src')

/**
 * @param {{ root: string, harness: string, harnessName: string, mutate?: (path: string, src: string) => string }} options
 *   harness 的 import 以 DS 原始碼目錄為 resolveDir:寫 `@/design-system/components/...` 或 `./components/...` 都可以。
 * @returns {Promise<string>} 打包好的 IIFE 原始碼
 */
export async function bundleDsHarness({ root, harness, harnessName, mutate }) {
  const srcDir = dsSourceDir(root)
  const result = await build({
    stdin: { contents: harness, loader: 'tsx', resolveDir: srcDir, sourcefile: harnessName },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    absWorkingDir: root,
    tsconfig: resolve(root, 'packages/design-system/tsconfig.json'),
    nodePaths: [resolve(REPO_ROOT, 'node_modules')],
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.css': 'empty', '.woff': 'empty', '.woff2': 'empty', '.svg': 'dataurl', '.png': 'dataurl' },
    plugins: [{
      name: 'ds-source-under-test',
      setup(b) {
        // 只接 DS 原始碼(node_modules 走 esbuild 預設);突變在這裡套,錨點找不到由呼叫端的 replaceOnce 丟儀器失效
        b.onLoad({ filter: /\.(tsx|ts)$/ }, (args) => {
          if (!args.path.startsWith(srcDir + sep) || args.path.includes(`${sep}node_modules${sep}`)) return null
          const src = readFileSync(args.path, 'utf8')
          return { contents: mutate ? mutate(args.path, src) : src, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: dirname(args.path) }
        })
      },
    }],
  })
  return result.outputFiles[0].text
}

export class InstrumentError extends Error {}

/** 樹裡所有 .ts / .tsx(略過 node_modules) */
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(p, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(p)
  }
  return out
}

/** 套件的樣式入口(`@import "tailwindcss"` / `"tw-animate-css"`):一律用本 repo 安裝的套件(同 bundleDsHarness 的 nodePaths;基準樹不必裝 node_modules)。 */
function stylePackageEntry(id) {
  const dir = resolve(REPO_ROOT, 'node_modules', id)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const style = pkg.exports?.['.']?.style ?? pkg.style
  if (!style) throw new InstrumentError(`樣式套件 ${id} 找不到 style 入口`)
  return resolve(dir, style)
}

/**
 * 把這棵樹的 DS 樣式(`packages/design-system/src/styles/tokens.css` = consumer 的唯一樣式入口)用 tailwindcss 原始碼編成 CSS 字串。
 * 候選 class = 樹裡所有 .ts / .tsx 以空白與引號切開的字詞(tailwindcss 只為認得的 class 產出規則,其餘略過)+ `extraSources`(harness 原始碼)。
 * 量具可信度由各閘的突變證明(會紅的突變 = 那幾條 class 真的有編進來);這裡不做 lightningcss 壓平 —— Chromium 原生支援巢狀,
 * 選擇器的權重與產出順序和 build:lib 相同(`:is()` 取最高權重)。
 */
export async function compileDsCss({ root, extraSources = [] }) {
  const srcDir = dsSourceDir(root)
  const candidates = new Set()
  const take = (text) => { for (const token of text.split(/[\s"'`]+/)) if (token) candidates.add(token) }
  for (const file of sourceFiles(srcDir)) take(readFileSync(file, 'utf8'))
  for (const text of extraSources) take(text)
  const loadStylesheet = async (id, base) => {
    const path = id.startsWith('.') || id.startsWith('/') ? resolve(base, id) : stylePackageEntry(id)
    return { path, base: dirname(path), content: readFileSync(path, 'utf8') }
  }
  const compiler = await compile('@import "tailwindcss" source(none);\n@import "./tokens.css";\n', { base: join(srcDir, 'styles'), loadStylesheet })
  return compiler.build([...candidates])
}

/** 突變錨點必須剛好命中一次:命中 0 次 = 原始碼改了、突變沒套上(儀器失效,不得讓「沒突變」看起來像「突變也綠」)。 */
export function replaceOnce(src, pattern, replacement) {
  const hits = src.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))?.length ?? 0
  if (hits !== 1) throw new InstrumentError(`突變錨點命中 ${hits} 次(應為 1):${pattern} —— 原始碼改了,selftest 的突變要跟著改`)
  return src.replace(pattern, replacement)
}

/** 把「哪個檔 + 怎麼改」組成 bundleDsHarness 用的 mutate(檔名相對 DS 原始碼目錄)。 */
export function mutantFor(root, file, apply) {
  const target = resolve(dsSourceDir(root), file)
  let applied = false
  const mutate = (path, src) => {
    if (path !== target) return src
    applied = true
    return apply(src)
  }
  mutate.assertApplied = () => { if (!applied) throw new InstrumentError(`突變目標 ${file} 沒被打包進 harness —— 突變沒套上`) }
  return mutate
}

/** 寫入空白頁、塞 bundle、等 harness 掛好(選擇器)。頁面例外收進陣列由呼叫端判儀器失效。 */
export async function mountHarness(page, code, readySelector, { capMs = 10_000 } = {}) {
  const pageErrors = []
  const onError = (e) => pageErrors.push(String(e?.message || e))
  page.on('pageerror', onError)
  await page.goto('about:blank')
  await page.setContent('<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>')
  await page.addScriptTag({ content: code })
  await page.waitForSelector(readySelector, { timeout: capMs })
    .catch(() => { throw new InstrumentError(`harness 沒有渲染出來${pageErrors.length ? `(頁面例外:${pageErrors[0]})` : ''}`) })
  return { pageErrors, dispose: () => page.off('pageerror', onError) }
}
