#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 重拍後的每一張 curated baseline 與參考 commit 在**同一個渲染器**下的差異都有名字(identical / within-budget /
 *        approved-change-candidate + commit / suspicious / unmapped / new-scenario / missing-new),沒有一張可以默默被接受。
 *   紅: --selftest 在 200×200 的合成圖上驗門檻兩面:201 個差異像素(> 0.5%)必判 content-change、199 個必判 within-budget;
 *       尺寸不同必判 dimension-mismatch;story title → 元件目錄的對應五格(精確 / 最長前綴 / 對不到回 null)任一格錯即 throw。
 *       正式跑時 suspicious / unmapped / missing-new 出現即 exit 1。(真實資料的對照組 2026-09-22 手動跑過:複製 curated
 *       一份 = 124 張 identical、塗黑一張 = 只指名那一張;那不在 selftest 裡,以免 PR 閘扛 124 張 PNG 的比對。)
 *   綠: 分類比的是 pixelmatch 的差異像素數 —— 同一份 old/new 逐張恆同,不是抽籤;selftest 的相同圖必判 identical,
 *       門檻邊界兩側各驗一次,重複跑結果相同。
 *
 * 視覺 baseline 重拍的歸因報告 —— 「新拍的圖」不等於「對的圖」。
 *
 * 2026-09-22 立。背景:curated baseline 停在 7/28(beta.93 時代),之後 51 個版本都沒重拍;週跑從 8/12 起
 * 連紅六週,而紅的是 runner 字型漂移不是產品。重拍之後,每一張新舊差異都必須**有名字**。
 *
 * **前兩版的教訓(同日)**:先用「16×16 格四成」再用「3×3 侵蝕」想從像素形態分辨「同一段字、不同光柵器」
 * 與「內容真的變了」—— 兩者都在真實資料上失敗:不同光柵器下 CJK 字的**每個像素**都變,差異圖裡整個字形實心,
 * 任何像素形態學都分不開。**能證明「內容沒變」的只有一種辦法:把舊內容也放到同一個釘死的渲染器上重拍**,
 * 同光柵器下字緣噪音歸零,剩下的差異全是真的內容變動。所以本腳本比的是:
 *
 *   old = 參考 commit(預設 8/5 最後一次週跑綠的那個,那天 CI 證明 baseline 與內容相符)在**同一個容器**重拍的圖
 *   new = HEAD 在同一個容器重拍的圖
 *
 * 分類(門檻沿用 visual-audit 的 0.5%,不另訂):
 *   identical                 0 差異像素
 *   within-budget             有差異但 ≤ 0.5%(同渲染器下的殘餘噪音,例如動畫時序)
 *   approved-change-candidate > 0.5%,且該元件源碼在 since-ref..HEAD 有 commit → 附 commit,給人看圖拍板
 *   suspicious                > 0.5%,但該元件源碼沒改(共用層可能改了)→ 先查出原因,查不出不接受
 *   unmapped                  story id 對不到元件目錄 → 列出來,不得默默歸類
 *   new-scenario / missing-new 參考沒有這張 / 新圖缺
 *
 * 用法:node scripts/visual-baseline-diff-report.mjs --old-dir <參考重拍目錄> --since-ref <參考 commit> --out <dir>
 *      [--new-dir <dir>] [--selftest]
 *   沒給 --old-dir 時退回 git <old-ref>(預設 HEAD)的 curated 圖 —— 只適合「同渲染器」的情況(例如重拍後驗證穩定性)。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { runClosedGit } from '../packages/governance/src/closed-tool-execution.mjs'

// 用 fileURLToPath,不用 URL.pathname:本 repo 路徑含中文,pathname 會留著百分號編碼(2026-09-22 實測 ENOENT)
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const CURATED = 'infra/governance/baseline/visual/curated'
const ARGS = process.argv.slice(2)
const arg = (flag, fallback = null) => { const i = ARGS.indexOf(flag); return i >= 0 ? ARGS[i + 1] : fallback }
const SELFTEST = ARGS.includes('--selftest')
const OLD_REF = arg('--old-ref', 'HEAD')
const OUT = arg('--out', join(ROOT, '.git/governance-runtime/evidence/visual/baseline-diff'))
const NEW_DIR = arg('--new-dir', null)
const OLD_DIR = arg('--old-dir', null)
const SINCE_REF = arg('--since-ref', null)
const PIXEL_DIFF_PCT_BUDGET = 0.5 // 與 scripts/visual-audit.mjs 同一個門檻,不另訂
const PIXELMATCH_THRESHOLD = 0.1

// 2026-09-23 run #294:裸 git 在 Playwright 容器裡撞「dubious ownership」—— actions/checkout 把 safe.directory 寫進
// **暫時的** HOME,後面的步驟看不到;closed git 已把「呼叫端指名的 cwd」列成 safe.directory(closed-tool-execution.mjs),
// 走同一條路就不必在 workflow 裡補 git config。
const closedGit = (args, output) => {
  const result = runClosedGit(args, { cwd: ROOT, output, maxOutputBytes: 64 * 1024 * 1024, timeoutMs: 30_000 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed(exit ${String(result.status)}):${String(result.stderr || '').trim().split('\n')[0]}`)
  return result.stdout
}
const git = (args) => closedGit(args, 'capture')
const gitBuffer = (args) => closedGit(args, 'buffer')

/** 純函式:兩張同尺寸 PNG 的差異比例與分類(不含 git,好測)。同渲染器前提下,> 門檻 = 內容變了。 */
export function classifyDiff(oldPng, newPng, budget = PIXEL_DIFF_PCT_BUDGET) {
  if (oldPng.width !== newPng.width || oldPng.height !== newPng.height) {
    return { pct: null, diffPixels: null, verdict: 'dimension-mismatch', diff: null }
  }
  const { width, height } = oldPng
  const diff = new PNG({ width, height })
  const diffPixels = pixelmatch(oldPng.data, newPng.data, diff.data, width, height, { threshold: PIXELMATCH_THRESHOLD })
  const pct = Number(((diffPixels / (width * height)) * 100).toFixed(3))
  if (diffPixels === 0) return { pct: 0, diffPixels: 0, verdict: 'identical', diff }
  return { pct, diffPixels, verdict: pct > budget ? 'content-change' : 'within-budget', diff }
}

/**
 * story id → 元件目錄:掃所有 *.stories.tsx 的 `title:`,slug 化後建表(Storybook 的 id 就是 title 的 slug)。
 * 第一版用 id 的第二段猜目錄,`patterns-item-anatomy` 對不到 `patterns/element-anatomy` → 4 張 unmapped。
 * 對不到一律回 null,由呼叫端列成 unmapped;**不得猜**。
 */
export function slugifyStoryTitle(title) {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
}
export function buildStoryTitleIndex(storyFiles) {
  const index = new Map()
  for (const { path, source } of storyFiles) {
    const m = /title:\s*['"`]([^'"`]+)['"`]/u.exec(source)
    if (!m) continue
    const dir = path.replace(/\/[^/]+\.stories\.tsx$/u, '')
    index.set(slugifyStoryTitle(m[1]), dir)
  }
  return index
}
export function componentDirForStoryId(id, index) {
  const base = id.split('--')[0]
  // 最長前綴優先(title slug 可能包含子標題)
  let best = null
  for (const [slug, dir] of index) if (base === slug || base.startsWith(`${slug}-`)) if (!best || slug.length > best[0].length) best = [slug, dir]
  return best ? best[1] : null
}
function collectStoryFiles(rootDir) {
  const out = []
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.stories\.tsx$/.test(e.name)) out.push({ path: p.slice(ROOT.length + 1), source: readFileSync(p, 'utf8') }) } }
  walk(rootDir)
  return out
}

function selftest() {
  const mk = (paint) => { const p = new PNG({ width: 200, height: 200 }); p.data.fill(255); paint?.(p); return p }
  const ink = (p, x, y) => { const i = (y * 200 + x) * 4; p.data[i] = p.data[i + 1] = p.data[i + 2] = 0 }
  const base = mk()
  // 門檻兩面:0.5% of 40000 = 200 像素。199 → within-budget;201 → content-change
  const under = mk((p) => { for (let k = 0; k < 199; k++) ink(p, k % 200, (k / 200 | 0) + 10) })
  const over = mk((p) => { for (let k = 0; k < 201; k++) ink(p, k % 200, (k / 200 | 0) + 10) })
  const u = classifyDiff(base, under), o = classifyDiff(base, over)
  if (u.verdict !== 'within-budget' || u.pct > 0.5) throw new Error(`selftest:199 像素應 within-budget,得到 ${u.verdict} ${u.pct}%`)
  if (o.verdict !== 'content-change' || o.pct <= 0.5) throw new Error(`selftest:201 像素應 content-change,得到 ${o.verdict} ${o.pct}%`)
  if (classifyDiff(base, mk()).verdict !== 'identical') throw new Error('selftest:相同圖應判 identical')
  if (classifyDiff(base, new PNG({ width: 10, height: 10 })).verdict !== 'dimension-mismatch') throw new Error('selftest:尺寸不同應判 mismatch')
  // title → 目錄:精確、最長前綴、對不到回 null
  const index = buildStoryTitleIndex([
    { path: 'packages/design-system/src/components/FileViewer/file-viewer.stories.tsx', source: "export default { title: 'Design System/Components/FileViewer/展示' }" },
    { path: 'packages/design-system/src/patterns/element-anatomy/item-anatomy.stories.tsx', source: "const meta = { title: 'Design System/Patterns/Item Anatomy' }" },
    { path: 'packages/design-system/src/components/Select/select.stories.tsx', source: "title: 'Design System/Components/Select/展示'" },
    { path: 'packages/design-system/src/internal/SelectMenu/select-menu.stories.tsx', source: "title: 'Design System/Internal/SelectMenu/展示'" },
  ])
  const cases = [
    ['design-system-components-fileviewer-展示--open-snapshot', 'packages/design-system/src/components/FileViewer'],
    ['design-system-patterns-item-anatomy--inline-action-hover-state', 'packages/design-system/src/patterns/element-anatomy'],
    ['design-system-components-select-展示--modes', 'packages/design-system/src/components/Select'],
    ['design-system-components-selectmenu-展示--x', null],
    ['design-system-components-doesnotexist-展示--x', null],
  ]
  for (const [id, want] of cases) { const got = componentDirForStoryId(id, index); if (got !== want) throw new Error(`selftest:${id} 應對到 ${want},得到 ${got}`) }
  console.log('✓ visual-baseline-diff-report selftest:門檻兩面(199/201 像素) / identical / mismatch / title 對應五面')
}

function main() {
  if (SELFTEST) { selftest(); return }
  const scenarios = JSON.parse(readFileSync(join(ROOT, 'scripts/visual-assertions.json'), 'utf8')).scenarios || []
  const index = buildStoryTitleIndex(collectStoryFiles(join(ROOT, 'packages/design-system/src')))
  mkdirSync(OUT, { recursive: true })
  const oldDir = mkdtempSync(join(tmpdir(), 'baseline-old-'))
  const rows = []
  for (const scenario of scenarios) {
    const rel = `${CURATED}/${scenario.file}`
    const newPath = NEW_DIR ? join(NEW_DIR, scenario.file) : join(ROOT, rel)
    let oldBuf = null
    if (OLD_DIR) { const p = join(OLD_DIR, scenario.file); if (existsSync(p)) oldBuf = readFileSync(p) }
    else { try { oldBuf = gitBuffer(['show', `${OLD_REF}:${rel}`]) } catch { /* 舊圖不存在 */ } }
    if (!oldBuf) { rows.push({ file: scenario.file, id: scenario.id, verdict: 'new-scenario', note: `${OLD_DIR || OLD_REF} 沒有這張` }); continue }
    if (!existsSync(newPath)) { rows.push({ file: scenario.file, id: scenario.id, verdict: 'missing-new', note: '工作區沒有新圖(重拍失敗?)' }); continue }
    const oldPng = PNG.sync.read(oldBuf), newPng = PNG.sync.read(readFileSync(newPath))
    const c = classifyDiff(oldPng, newPng)
    const dir = componentDirForStoryId(scenario.id, index)
    // 歸因區間:給了 --since-ref 就用 ref..HEAD(精確);沒給就退回舊圖 blob 的最後 commit 日期
    const baselineDate = SINCE_REF ? null : (git(['log', '-1', '--format=%ad', '--date=short', OLD_REF, '--', rel]).trim() || null)
    const range = SINCE_REF ? [`${SINCE_REF}..HEAD`] : (baselineDate ? [`--since=${baselineDate}`] : [])
    const componentCommits = dir ? git(['log', '--oneline', ...range, '--', dir]).trim().split('\n').filter(Boolean) : []
    const sharedCommits = git(['log', '--oneline', ...range, '--', 'packages/design-system/src/tokens', 'packages/design-system/src/patterns', 'packages/design-system/src/lib', 'packages/design-system/src/stories-helpers']).trim().split('\n').filter(Boolean)
    let verdict = c.verdict
    if (c.verdict === 'content-change') verdict = !dir ? 'unmapped' : componentCommits.length ? 'approved-change-candidate' : 'suspicious'
    if (c.diff && c.verdict !== 'identical') writeFileSync(join(OUT, `${scenario.file.replace(/\.png$/, '')}.diff.png`), PNG.sync.write(c.diff))
    rows.push({ file: scenario.file, id: scenario.id, verdict, pct: c.pct, componentDir: dir, sinceRef: SINCE_REF, baselineDate, componentCommits: componentCommits.slice(0, 8), sharedLayerCommits: sharedCommits.slice(0, 8) })
  }
  const counts = rows.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] || 0) + 1; return acc }, {})
  const report = { generatedAt: new Date().toISOString(), oldSource: OLD_DIR || OLD_REF, sinceRef: SINCE_REF, budgetPct: PIXEL_DIFF_PCT_BUDGET, counts, scenarios: rows }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  const md = ['# 視覺 baseline 重拍歸因(同渲染器:參考 commit 重拍 vs HEAD 重拍)', '', `舊圖來源:\`${OLD_DIR || OLD_REF}\`;歸因區間:\`${SINCE_REF ? SINCE_REF + '..HEAD' : '依舊圖日期'}\`;門檻 ${PIXEL_DIFF_PCT_BUDGET}%;統計:${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' / ')}`, '',
    '| 分類 | 圖 | 差異% | 元件 | 元件 commit(區間內) | 共用層 commit(區間內) |', '|---|---|---|---|---|---|',
    ...rows.filter((r) => r.verdict !== 'identical').sort((a, b) => (b.pct || 0) - (a.pct || 0)).map((r) =>
      `| ${r.verdict} | ${r.file} | ${r.pct ?? '-'} | ${r.componentDir || '(對不到)'} | ${(r.componentCommits || []).length ? r.componentCommits.map((c) => `\`${c.slice(0, 8)}\``).join(' ') : '(無)'} | ${(r.sharedLayerCommits || []).length ? r.sharedLayerCommits.map((c) => `\`${c.slice(0, 8)}\``).join(' ') : '(無)'} |`)]
  writeFileSync(join(OUT, 'summary.md'), md.join('\n') + '\n')
  console.log(`✓ 歸因報告:${JSON.stringify(counts)} → ${OUT}/summary.md`)
  // 檔頭寫「正式跑時 suspicious / unmapped / missing-new 出現即 exit 1」,但 2026-09-23 之前這裡只印警告、結束碼永遠 0 ——
  // 註解裡的斷言程式沒執行(M37)。現在真的紅;new-scenario(參考樹沒有這則 story = HEAD 新增的場景)是正常演進,只提示。
  if (counts.suspicious || counts.unmapped || counts['dimension-mismatch'] || counts['missing-new']) {
    console.log('✗ 有 suspicious / unmapped / dimension-mismatch / missing-new —— 這些不得直接接受,先查出原因(exit 1)')
    process.exitCode = 1
  }
  if (counts['new-scenario']) console.log(`ⓘ ${counts['new-scenario']} 張是 HEAD 新增、參考樹沒有的場景(new-scenario):沒有同渲染器對照,接受前用 story 本身判斷`)
}

main()
