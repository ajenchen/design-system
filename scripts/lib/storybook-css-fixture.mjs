/**
 * 閘自己掛載的夾具頁(不是 story)的**唯一**實作:從原始碼打包一支 `fixture.tsx`、配「正在服務的那一份」storybook 建置的
 * preview CSS,在暫存目錄的本機靜態站開。
 *
 * 2026-11-13 自 lib/dialog-coexistence-fixture.mjs 抽出(內容照搬,只把「哪一支夾具」變成參數):第二個使用者是
 * field-open-border-invariant(欄位外面包一層浮層當觸發點的邊界場景 —— DS 沒有這種用法的 story;要不要列為禁止,規格目前沒有寫,寫成 story 等於拿它當範例示範)。
 * 兩支夾具各寫一份打包 / 掛載會是同一件事的兩個住所(M17),所以收成這一支;dialog-coexistence-fixture.mjs 改成呼叫這裡。
 *
 * 量到的是什麼(兩半各自的來源要分清楚):
 *   · 元件行為 = **這次 checkout 的元件原始碼**(每次跑閘都重新打包,esbuild 瀏覽器 IIFE);
 *   · 樣式 = **傳進來的那一份建置**的 preview CSS(頁面與樣式必須出自同一份建置,同 readServedStorybookIndex 的理由)。
 * 夾具檔不在 Tailwind 的 @source 範圍裡:夾具自己的版面用行內樣式,DS 元件的樣式來自元件本身。
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
/** 夾具頁面的路徑(相對於夾具伺服器的根) */
export const FIXTURE_PAGE = 'index.html'
/** 夾具頁裡 React 掛載點的 id(fixture.tsx 用它找根節點) */
export const FIXTURE_ROOT_ID = 'fixture-root'

export class FixtureInstrumentError extends Error {}

/** 找出建置裡 Storybook 預覽的全域 CSS(Tailwind + DS token;沒有 url() 相依)—— 正好一份,否則儀器失效 */
export function previewCssOf(staticRoot, label = '夾具') {
  const assets = path.join(staticRoot, 'assets')
  if (!existsSync(assets)) throw new FixtureInstrumentError(`${label}:建置裡沒有 assets/(${staticRoot})`)
  const css = readdirSync(assets).filter((f) => /^preview-[\w-]+\.css$/.test(f))
  if (css.length !== 1) throw new FixtureInstrumentError(`${label}:建置裡的 preview-*.css 有 ${css.length} 份(要正好 1 份):${css.join(', ') || '無'}`)
  return path.join(assets, css[0])
}

/**
 * 打包夾具、起本機靜態站。
 * @param {string} staticRoot 正在服務的 storybook 建置根目錄(閘的主伺服器的 servedRoot)
 * @param {{ source: string, label: string, title: string }} fixture
 *   source = 夾具原始碼(相對 repo 根);label = 錯誤訊息的開頭(例「並存夾具」);title = 頁面 <title>
 * @returns {Promise<{ url: string, notFound: string[], stop: () => Promise<void> }>}
 */
export async function startStorybookCssFixture(staticRoot, { source, label, title } = {}) {
  for (const [name, value] of [['source', source], ['label', label], ['title', title]]) {
    if (typeof value !== 'string' || !value) throw new TypeError(`startStorybookCssFixture:${name} 必須是非空字串`)
  }
  if (!existsSync(path.join(ROOT, source))) throw new FixtureInstrumentError(`${label}:找不到夾具原始碼 ${source}`)
  if (!existsSync(ESBUILD)) throw new FixtureInstrumentError(`${label}:找不到 esbuild(${ESBUILD};先 npm ci)`)
  const css = previewCssOf(staticRoot, label)
  const dir = mkdtempSync(path.join(tmpdir(), 'storybook-css-fixture-'))
  if (!dir || !existsSync(dir)) throw new FixtureInstrumentError(`${label}:暫存目錄建立失敗`)
  const cleanup = () => rmSync(dir, { recursive: true, force: true })
  try {
    const build = spawnSync(ESBUILD, [
      path.join(ROOT, source), '--bundle', '--platform=browser', '--format=iife', '--jsx=automatic',
      `--tsconfig=${path.join(ROOT, 'tsconfig.app.json')}`, '--loader:.css=empty', '--log-level=warning',
      '--define:process.env.NODE_ENV="production"', `--outfile=${path.join(dir, 'fixture.js')}`,
    ], { cwd: ROOT, encoding: 'utf8' })
    if (build.status !== 0) throw new FixtureInstrumentError(`${label}:esbuild 打包失敗\n${build.stderr || build.error?.message || ''}`)
    copyFileSync(css, path.join(dir, 'preview.css'))
    // 同 Storybook 預覽:主題 / 密度寫在 <html>(storybook-config preview 的 decorator 用 effect 寫上同兩個屬性)
    writeFileSync(path.join(dir, FIXTURE_PAGE), [
      '<!doctype html>',
      '<html lang="zh-Hant" data-theme="light" data-density="md">',
      `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>`,
      '<link rel="stylesheet" href="./preview.css"></head>',
      `<body><div id="${FIXTURE_ROOT_ID}"></div><script src="./fixture.js"></script></body>`,
      '</html>',
      '',
    ].join('\n'))
    const server = await startA11yStaticServer({ rootDirectory: dir, defaultFile: FIXTURE_PAGE, snapshot: false })
    let stopped = false
    return {
      url: `${server.origin}/${FIXTURE_PAGE}`,
      notFound: server.notFound,
      stop: async () => { if (stopped) return; stopped = true; await server.stop(); cleanup() },
    }
  } catch (error) {
    cleanup()
    throw error
  }
}
