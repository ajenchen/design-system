/**
 * Dialog 並存契約夾具的掛載(三支閘共用的唯一實作):dialog-coexistence / dialog-coexist-scroll-lock / layer-order E2。
 *
 * 為什麼不是 story:2026-09-11 user「Dialog的並存範例給我刪掉」(登記簿 A33,稽核 H02 指出上次只把它改成 test-only)。
 * 夾具原始碼 = scripts/test-fixtures/dialog-coexistence/fixture.tsx;每次跑閘都從原始碼重新打包(esbuild,瀏覽器 IIFE),
 * 所以量到的是**這次 checkout 的元件原始碼**。樣式取**正在服務的那一份** storybook 建置的 preview CSS(同 readServedStorybookIndex
 * 的理由:頁面與清單 / 樣式必須出自同一份建置),在暫存目錄的本機靜態站開(lib/a11y-static-server.mjs,不另寫伺服器)。
 * 打包失敗 / 找不到 CSS → 丟 FixtureInstrumentError,由閘照「儀器失效」印出(不是產品裁決、也不是通過)。
 */
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './a11y-static-server.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ESBUILD = path.join(ROOT, 'node_modules', '.bin', 'esbuild')
export const COEXIST_FIXTURE_SOURCE = 'scripts/test-fixtures/dialog-coexistence/fixture.tsx'
/** 夾具頁面的路徑(相對於夾具伺服器的根) */
export const COEXIST_FIXTURE_PAGE = 'index.html'

export class FixtureInstrumentError extends Error {}

/** 找出建置裡 Storybook 預覽的全域 CSS(Tailwind + DS token;沒有 url() 相依)—— 正好一份,否則儀器失效 */
export function previewCssOf(staticRoot) {
  const assets = path.join(staticRoot, 'assets')
  if (!existsSync(assets)) throw new FixtureInstrumentError(`並存夾具:建置裡沒有 assets/(${staticRoot})`)
  const css = readdirSync(assets).filter((f) => /^preview-[\w-]+\.css$/.test(f))
  if (css.length !== 1) throw new FixtureInstrumentError(`並存夾具:建置裡的 preview-*.css 有 ${css.length} 份(要正好 1 份):${css.join(', ') || '無'}`)
  return path.join(assets, css[0])
}

/**
 * 打包夾具、起本機靜態站。
 * @param {string} staticRoot 正在服務的 storybook 建置根目錄(閘的主伺服器的 servedRoot)
 * @returns {Promise<{ url: string, notFound: string[], stop: () => Promise<void> }>}
 */
export async function startDialogCoexistenceFixture(staticRoot) {
  if (!existsSync(ESBUILD)) throw new FixtureInstrumentError(`並存夾具:找不到 esbuild(${ESBUILD};先 npm ci)`)
  const css = previewCssOf(staticRoot)
  const dir = mkdtempSync(path.join(tmpdir(), 'dialog-coexistence-fixture-'))
  if (!dir || !existsSync(dir)) throw new FixtureInstrumentError('並存夾具:暫存目錄建立失敗')
  const cleanup = () => rmSync(dir, { recursive: true, force: true })
  try {
    const build = spawnSync(ESBUILD, [
      path.join(ROOT, COEXIST_FIXTURE_SOURCE), '--bundle', '--platform=browser', '--format=iife', '--jsx=automatic',
      `--tsconfig=${path.join(ROOT, 'tsconfig.app.json')}`, '--loader:.css=empty', '--log-level=warning',
      '--define:process.env.NODE_ENV="production"', `--outfile=${path.join(dir, 'fixture.js')}`,
    ], { cwd: ROOT, encoding: 'utf8' })
    if (build.status !== 0) throw new FixtureInstrumentError(`並存夾具:esbuild 打包失敗\n${build.stderr || build.error?.message || ''}`)
    copyFileSync(css, path.join(dir, 'preview.css'))
    // 同 Storybook 預覽:主題 / 密度寫在 <html>(storybook-config preview 的 decorator 用 effect 寫上同兩個屬性)
    writeFileSync(path.join(dir, COEXIST_FIXTURE_PAGE), [
      '<!doctype html>',
      '<html lang="zh-Hant" data-theme="light" data-density="md">',
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dialog 並存夾具</title>',
      '<link rel="stylesheet" href="./preview.css"></head>',
      '<body><div id="fixture-root"></div><script src="./fixture.js"></script></body>',
      '</html>',
      '',
    ].join('\n'))
    const server = await startA11yStaticServer({ rootDirectory: dir, defaultFile: COEXIST_FIXTURE_PAGE, snapshot: false })
    let stopped = false
    return {
      url: `${server.origin}/${COEXIST_FIXTURE_PAGE}`,
      notFound: server.notFound,
      stop: async () => { if (stopped) return; stopped = true; await server.stop(); cleanup() },
    }
  } catch (error) {
    cleanup()
    throw error
  }
}
