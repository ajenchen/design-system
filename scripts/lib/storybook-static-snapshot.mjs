// ═══════════════════════════════════════════════════════════════════════════
// 凍結受測建置:把 storybook-static 複製成本次執行獨佔的快照
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼有這個**(2026-09-24,本機誤紅一次):
// `data-table-invariants.mjs` 在 :156 `waitForSelector` 逾時 30 秒,重跑就綠。實際經過:
// 另一個 agent 在**同一份工作樹**跑 `npm run build-storybook`(10:24:00 起,10:26:13 建完),
// Storybook 8 的 build 第一步就是把輸出目錄整個刪掉再重寫
// (node_modules/@storybook/core/dist/core-server/index.js「Cleaning outputDir」→ rm recursive),
// 前 ~70 秒 iframe.html 與 assets/ 都不存在。閘的第一次導覽用的是舊檔、成功;第二次導覽時目錄
// 已被清空 → 資源 404 → story 永遠不渲染 → 30 秒後被當成「表格沒有列」。重跑之所以綠,只是因為
// 那時對方剛好建完了。
//
// 這是 M37:閘開頭的 stale-build 守衛驗的是「那一刻的那份建置」,之後每次導覽讀的卻是
// 「路徑 storybook-static 底下當下剛好有的東西」—— 把「路徑」當成「建置身分」。
//
// 正解:守衛通過之後,把那份建置複製到只有本次執行讀得到的暫存目錄,後續一律從快照供檔。
// 身分標記用既有的 build-info.json(scripts/gen-build-info.mjs):它是 `npm run build-storybook`
// **最後**寫的檔、內含 builtAt 毫秒時間戳,而重建的第一步會把它刪掉 —— 所以
//   「複製前後都存在且逐位元組相同」⇔「複製期間沒有任何重建開始或結束」。
// 不存在 = 目前沒有完整的建置(正在重建或從沒建完),以**儀器失效**的名義紅,不指控被測物。
//
// **第二道:建置完整性(2026-09-25)**。上面那道只證明「複製期間沒人重建」,證明不了「建完之後檔還是
// 當時那些檔」—— 同一天本機的 storybook-static 被雲端同步弄壞:一批 chunk 變成 0 位元組、另外冒出
// `<name> 2.js` 衝突副本,而 build-info.json 完好如初。標記「存在且沒變」被當成「建置完整」(M37 同一種代理)。
// 所以 gen-build-info.mjs 在建置最後把**每個檔的相對路徑與位元組數**寫進 build-info.json 的 `manifest`
// (再加整份清單的 sha256),這裡對**複製出來的快照**逐檔核對:
//   清單裡的檔不見了 / 大小不同 → 以儀器失效拒絕,點名前幾個檔(「這不是被測元件的失敗」);
//   清單外多出來的檔(衝突副本、部署時另寫的 deployment.json)→ 不影響量測,只記一筆說明;
//   舊建置沒有 manifest → 印一行警告照常放行(CI 每次都重建,這個分支只會出現在本機舊產物上)。
// 注意:本檔會交付給 consumer(scripts/build-fork-governance.mjs),不得 import 本 repo 限定的模組;
// 「儀器失效」的標記字 INSTRUMENT-FAIL 與 scripts/lib/launch-browser.mjs 相同(test-storybook-static-snapshot 斷言)。

import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export class StorybookBuildNotStableError extends Error {}

const MARKER = 'build-info.json'
const SNAPSHOT_PREFIX = 'storybook-static-snapshot-'
const INSTRUMENT_FAIL = 'INSTRUMENT-FAIL'
// 建置不完整時訊息裡最多點名幾個檔(其餘只給數量)
const MAX_NAMED_FILES = 8
// 正常結束、丟例外都會在 exit 時刪快照;只有被 SIGKILL / 逾時強制中止的那一次會留下(每份約 16MB)。
// 下一次建快照時順手清掉「超過這個年紀」的殘留 —— 年紀取得夠長,不會刪到別人正在用的那份
// (最慢的全 story 掃描約 6 分鐘,這裡給 6 小時)。清不掉就算了,不影響本次量測。
const STALE_SNAPSHOT_AGE_MS = 6 * 60 * 60 * 1000

export function sweepStaleSnapshots({ root = tmpdir(), now = Date.now(), maxAgeMs = STALE_SNAPSHOT_AGE_MS } = {}) {
  const removed = []
  let entries = []
  try { entries = readdirSync(root) } catch { return removed }
  for (const name of entries) {
    if (!name.startsWith(SNAPSHOT_PREFIX)) continue
    const dir = join(root, name)
    try {
      if (now - statSync(dir).mtimeMs <= maxAgeMs) continue
      rmSync(dir, { recursive: true, force: true })
      removed.push(dir)
    } catch { /* 別人剛好在刪,或沒權限 —— 不影響本次 */ }
  }
  return removed
}

// ─── 檔案清單(寫:gen-build-info.mjs;讀:snapshotStorybookStatic)──────────────

/** 建置目錄裡每個一般檔的 [相對路徑('/' 分隔), 位元組數],依路徑排序;不含根目錄的 build-info.json 本身。 */
function listBuildFiles(dir) {
  const out = []
  const walk = (rel) => {
    for (const name of readdirSync(join(dir, rel))) {
      const relPath = rel ? `${rel}/${name}` : name
      if (relPath === MARKER) continue
      const info = lstatSync(join(dir, relPath))
      if (info.isDirectory()) walk(relPath)
      else if (info.isFile()) out.push([relPath, info.size])
    }
  }
  walk('')
  return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

const manifestDigest = (files) => createHash('sha256').update(JSON.stringify(files)).digest('hex')

/**
 * 算出建置目錄的檔案清單:`{ version, algorithm, fileCount, totalBytes, sha256, files: { 相對路徑: 位元組數 } }`。
 * sha256 = 整份 files(依路徑排序後的 JSON)的雜湊 —— 同一份建置恆得同一個值,可直接比較兩份建置是否逐檔同大小。
 */
export function buildFileManifest(dir) {
  const entries = listBuildFiles(dir)
  const files = Object.fromEntries(entries)
  return {
    version: 1,
    algorithm: 'sha256',
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, [, size]) => sum + size, 0),
    sha256: manifestDigest(files),
    files,
  }
}

/**
 * **刻意**改動建置之後(例:meta-test 往建好的 CSS 注入違規)重簽 build-info.json 的檔案清單,
 * 否則快照的完整性核對會先以儀器失效拒絕 —— 那個紅不是「偵測到違規」。回傳原本的 build-info.json 原文,
 * 呼叫端還原建置時一併寫回。
 */
export function resignBuildManifest(dir) {
  const markerPath = join(dir, MARKER)
  const original = readFileSync(markerPath, 'utf8')
  writeFileSync(markerPath, JSON.stringify({ ...JSON.parse(original), manifest: buildFileManifest(dir) }, null, 2))
  return original
}

/**
 * 用 build-info.json 的 manifest 核對一個目錄(snapshotStorybookStatic 對快照呼叫;也可單獨用)。
 * @returns {{ status: 'verified', fileCount: number, extras: string[] } | { status: 'no-manifest' }}
 * @throws {StorybookBuildNotStableError} 清單本身不一致、或有檔缺少 / 大小不符
 */
export function verifyBuildManifest(dir, manifest) {
  if (manifest == null) return { status: 'no-manifest' }
  const files = manifest.files
  if (!files || typeof files !== 'object' || Array.isArray(files) || manifestDigest(files) !== manifest.sha256) {
    throw new StorybookBuildNotStableError(
      `${INSTRUMENT_FAIL}: build-info.json 的檔案清單本身不一致(sha256 對不上或格式錯)—— 無法證明這是一份完整的建置。` +
      '這不是被測元件的失敗;重新跑 `npm run build-storybook`。',
    )
  }
  const bad = []
  for (const [relPath, size] of Object.entries(files)) {
    let actual = null
    try { const info = lstatSync(join(dir, relPath)); if (info.isFile()) actual = info.size } catch { /* 不存在 */ }
    if (actual === null) bad.push(`${relPath}(不見了)`)
    else if (actual !== size) bad.push(`${relPath}(${actual} 位元組,建置時 ${size})`)
  }
  if (bad.length) {
    const named = bad.slice(0, MAX_NAMED_FILES).join('、')
    throw new StorybookBuildNotStableError(
      `${INSTRUMENT_FAIL}: 建置不完整:${bad.length} / ${Object.keys(files).length} 個檔缺少或大小與建置時不同 —— ${named}` +
      `${bad.length > MAX_NAMED_FILES ? ` …另 ${bad.length - MAX_NAMED_FILES} 個` : ''}。` +
      '建完之後有東西截斷或刪了檔(雲端同步衝突、別人清目錄)。這不是被測元件的失敗;重新跑 `npm run build-storybook`。',
    )
  }
  const listed = new Set(Object.keys(files))
  const extras = listBuildFiles(dir).map(([relPath]) => relPath).filter((relPath) => !listed.has(relPath))
  return { status: 'verified', fileCount: listed.size, extras }
}

// ─── 快照 ───────────────────────────────────────────────────────────────────

// `copy` 只給測試注入(在複製途中改動標記,確定性地走到「複製期間被重建」那一枝);正式呼叫一律用預設。
// `log` 只給測試注入(收集警告 / 說明);正式呼叫印到 stderr。
export function snapshotStorybookStatic(staticDir, {
  copy = (from, to) => cpSync(from, to, { recursive: true }),
  log = (line) => console.error(line),
} = {}) {
  const markerPath = join(staticDir, MARKER)
  const readMarker = () => (existsSync(markerPath) ? readFileSync(markerPath, 'utf8') : null)
  const before = readMarker()
  if (before === null) {
    throw new StorybookBuildNotStableError(
      `${INSTRUMENT_FAIL}: ${markerPath} 不存在 —— storybook-static 不是一份完整的建置(正在重建,或上次沒建完)。` +
      '這不是被測元件的失敗;等建置完成(或跑 `npm run build-storybook`)再執行。',
    )
  }
  sweepStaleSnapshots()
  const dir = mkdtempSync(join(tmpdir(), SNAPSHOT_PREFIX))
  try {
    copy(staticDir, dir)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw new StorybookBuildNotStableError(`${INSTRUMENT_FAIL}: 複製 storybook-static 失敗(複製期間目錄被改動?):${error.message}`)
  }
  const after = readMarker()
  const copied = existsSync(join(dir, MARKER)) ? readFileSync(join(dir, MARKER), 'utf8') : null
  if (after !== before || copied !== before) {
    rmSync(dir, { recursive: true, force: true })
    throw new StorybookBuildNotStableError(
      `${INSTRUMENT_FAIL}: 複製期間 storybook-static 被重建(build-info.json 前後不一致)—— 快照不是單一建置。這不是被測元件的失敗。`,
    )
  }
  let buildInfo
  let integrity
  try {
    buildInfo = JSON.parse(before)
    // 核對的是**快照**(之後供檔的就是它),不是活目錄
    integrity = verifyBuildManifest(dir, buildInfo.manifest)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    if (error instanceof StorybookBuildNotStableError) throw error
    throw new StorybookBuildNotStableError(`${INSTRUMENT_FAIL}: 讀不懂 ${markerPath}(${error.message})—— 無法確認建置身分。這不是被測元件的失敗。`)
  }
  if (integrity.status === 'no-manifest') {
    log(`⚠️  ${markerPath} 沒有檔案清單(舊版建置):這次不核對建置完整性;重新 npm run build-storybook 即會補上。`)
  } else if (integrity.extras.length) {
    log(`· 建置快照:${integrity.fileCount} 個檔逐一核對大小相符;另有 ${integrity.extras.length} 個檔不在清單裡(例:${integrity.extras.slice(0, 3).join('、')})—— 不是這次建置的產物(雲端同步衝突副本等),已忽略。`)
  }
  let disposed = false
  return Object.freeze({
    dir,
    buildInfo,
    /** { status: 'verified', fileCount, extras } 或 { status: 'no-manifest' } */
    integrity: Object.freeze(integrity),
    dispose() {
      if (disposed) return
      disposed = true
      rmSync(dir, { recursive: true, force: true })
    },
  })
}
