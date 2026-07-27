#!/usr/bin/env node
// test-sync-atomicity.mjs — settings.json 原子寫入(tmp + rename)契約的機械證明
//
// SUT = scripts/refresh-fork-launchers.mjs 的 refreshLaunchers()。它把 fork 的
// .claude/settings.json 用「寫 tmp → renameSync 覆蓋」原子替換(§15 atomic 契約,
// 檔內註解:「中斷不會留半寫 settings(settings 壞 = 整個 .claude 靜默失效)」)。
// 本測試機械證明該原子性,分兩層(對齊 M32「pixel/DOM/機械 primary」):
//
//   Layer A — 靜態源碼斷言(deterministic gate):讀 refresh-fork-launchers.mjs 源碼,
//     斷言 writer 走 write-to-temp-then-rename,且「絕不」對 settingsPath 直接原地
//     writeFileSync(那才是會留半寫檔的 non-atomic 寫法)。tmp 寫入必在 rename 之前。
//
//   Layer B — 功能性斷言(runtime):
//     B1 單跑一次 → 產出 valid parseable JSON;第二次重跑 byte-identical(idempotent)。
//     B2 併發:對同一個 fixture spawn 兩個 child process 同時跑 production
//         atomic replacement primitive(真並行),
//         事後 target settings.json 必為 valid JSON(絕非半寫/截斷)且 byte-equal 於
//         單跑乾淨版(deterministic → 併發結果 == 單次乾淨產出)。跑 N 輪增加重疊機率。
//     B3 連續讀者觀測:預先種一份 valid settings.json,再對它 spawn 多個並行 writer,
//         parent 在旁緊迴圈重複讀 target,每次「讀得到」的快照都必 parse 成 valid JSON
//         —— 直接觀測 rename 的原子性(讀者永遠拿到完整舊 inode 或完整新 inode,
//         絕不會拿到半寫內容)。
//
// 用法:node scripts/test-sync-atomicity.mjs   (PASS → exit 0;任一斷言 fail → exit 1)
// 副作用:fixtures 全在 os.tmpdir() 底下,repo tree 零污染;finally 清乾淨。

import { cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { buildCorpus } from './build-fork-governance.mjs'
import {
  atomicReplaceRepositoryFile,
  authorizeDisposableProviderRefreshTransaction,
  refreshLaunchers,
  validateInstalledForkCorpus,
  validateInstalledProviderTransition,
} from './refresh-fork-launchers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SELF = fileURLToPath(import.meta.url)
const IS_FIXTURE_RUN = process.argv[2] === '--fixture-run'
const ROOT = join(__dirname, '..')
const SCRIPT = join(__dirname, 'refresh-fork-launchers.mjs')
const PACKAGE_MANIFEST = join(ROOT, 'packages/design-system/package.json')
const UTILITY_REGISTRY = join(ROOT, 'packages/design-system/src/tokens/utility-registry.json')

const BASE = IS_FIXTURE_RUN ? null : realpathSync(mkdtempSync(join(tmpdir(), 'ds-sync-atomicity-fixture-')))
const REF = BASE && join(BASE, 'ref')
const CONC = BASE && join(BASE, 'conc')
const OBS = BASE && join(BASE, 'obs')
const HARDLINK_COMMON = BASE && join(BASE, 'hardlink-common')
const HARDLINK_PRIMITIVE = BASE && join(BASE, 'hardlink-primitive')
const HARDLINK_OUTSIDE = BASE && join(BASE, 'outside-sentinels')
const FRESH_CORPUS = BASE && join(BASE, 'authenticated-corpus')
const FRESH_TEMPLATE = BASE && join(BASE, 'generated-template')
const SETTINGS_REL = '.claude/settings.json'
const PRODUCT_SCRIPT_NAME = 'fixture:product-owned'
const PRODUCT_SCRIPT_COMMAND = 'node scripts/product-owned-fixture.mjs'
const PRODUCT_COLLISION_SCRIPTS = Object.freeze({
  build: 'node scripts/product-build.mjs',
  dev: 'node scripts/product-dev.mjs',
  typecheck: 'node scripts/product-typecheck.mjs',
})

let fail = 0
const log = []
function check(cond, okMsg, failMsg) {
  if (cond) { log.push(`  ✅ ${okMsg}`) }
  else { log.push(`  ❌ ${failMsg}`); fail++ }
  return cond
}

// ── fixture:完整、已驗證的 installed fork corpus。refreshLaunchers 不接受只剩 launcher
//    的偽 package；即使本測試聚焦 settings.json 原子性，仍必須先走完 BOM →
//    corpus lock → manifest → provider lifecycle 與 durable transaction capability 信任鏈。──
let freshCorpusReady = false
function ensureFreshCorpus() {
  if (freshCorpusReady) return
  buildCorpus({ outDir: FRESH_CORPUS, templateRoot: FRESH_TEMPLATE })
  freshCorpusReady = true
}

function buildFixture(dir, { seedSettings = null, installCorpus = true } = {}) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  let executionRuntime = null
  if (installCorpus) {
    ensureFreshCorpus()
    const corpusManifest = JSON.parse(readFileSync(join(FRESH_CORPUS, 'manifest.json'), 'utf8'))
    executionRuntime = corpusManifest?.consumer?.executionRuntime
    if (
      !/^\d+\.\d+\.\d+$/.test(executionRuntime?.minimumNodeVersion || '')
      || !/^\d+\.\d+\.\d+$/.test(executionRuntime?.exactNpmVersion || '')
    ) throw new Error('authenticated corpus fixture lacks an exact consumer execution runtime')
  }
  const packageManifest = {
    name: 'sync-atomicity-product-fixture',
    version: '0.0.0',
    private: true,
    scripts: {
      [PRODUCT_SCRIPT_NAME]: PRODUCT_SCRIPT_COMMAND,
      ...PRODUCT_COLLISION_SCRIPTS,
      'governance:check': 'node scripts/stale-governance-check.mjs',
    },
    ...(executionRuntime ? {
      devDependencies: { npm: executionRuntime.exactNpmVersion },
      engines: { node: `>=${executionRuntime.minimumNodeVersion}` },
    } : {}),
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(packageManifest, null, 2) + '\n')
  if (executionRuntime) {
    const authorityNpmLock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'))?.packages?.['node_modules/npm']
    if (
      authorityNpmLock?.version !== executionRuntime.exactNpmVersion
      || authorityNpmLock?.resolved !== `https://registry.npmjs.org/npm/-/npm-${executionRuntime.exactNpmVersion}.tgz`
      || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(authorityNpmLock?.integrity || '')
    ) throw new Error('authority npm lock fixture differs from the authenticated consumer execution runtime')
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
      name: packageManifest.name,
      version: packageManifest.version,
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name: packageManifest.name,
          version: packageManifest.version,
          devDependencies: packageManifest.devDependencies,
          engines: packageManifest.engines,
        },
        'node_modules/npm': {
          version: authorityNpmLock.version,
          resolved: authorityNpmLock.resolved,
          integrity: authorityNpmLock.integrity,
          dev: true,
          bin: { npm: 'bin/npm-cli.js' },
        },
      },
    }, null, 2) + '\n')
  }
  if (installCorpus) {
    const packageRoot = join(dir, 'node_modules/@qijenchen/design-system')
    mkdirSync(packageRoot, { recursive: true })
    cpSync(PACKAGE_MANIFEST, join(packageRoot, 'package.json'))
    cpSync(FRESH_CORPUS, join(packageRoot, 'ds-canonical/fork'), { recursive: true })
    mkdirSync(join(packageRoot, 'src/tokens'), { recursive: true })
    cpSync(UTILITY_REGISTRY, join(packageRoot, 'src/tokens/utility-registry.json'))
  }
  mkdirSync(join(dir, '.claude'), { recursive: true })
  if (seedSettings != null) writeFileSync(join(dir, SETTINGS_REL), seedSettings)
}

function authorizedRefresh(projectDir) {
  const verifiedCorpus = validateInstalledForkCorpus(projectDir)
  const providerTransition = validateInstalledProviderTransition(verifiedCorpus, verifiedCorpus)
  const transactionCapability = authorizeDisposableProviderRefreshTransaction({
    projectDir,
    verifiedCorpus,
    providerTransition,
  })
  return refreshLaunchers(projectDir, { verifiedCorpus, providerTransition, transactionCapability })
}

// spawn 一個 child，只跑 refreshLaunchers 實際使用的 production atomic writer。
function spawnRun(cwd, content) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(content).toString('base64')
    const c = spawn(process.execPath, ['--', SELF, '--fixture-run', encoded], { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    c.stderr.on('data', (d) => { err += d })
    c.on('close', (code) => resolve({ code, err }))
    c.on('error', (e) => resolve({ code: 127, err: String(e) }))
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // ══ Layer A — 靜態源碼斷言 ══
  log.push('── Layer A:靜態源碼斷言(write-to-temp-then-rename,禁原地直寫)──')
  const src = readFileSync(SCRIPT, 'utf8')
  const declTmp = /const\s+tmpPath\s*=\s*`\$\{target\}\.tmp-\$\{process\.pid\}-\$\{randomUUID\(\)\}`/.test(src)
  const opensTmp = /openSync\(\s*tmpPath\s*,\s*['"]wx['"]/.test(src)
  const writesTmp = /writeFileSync\(\s*descriptor\b/.test(src)
  const flushesTmp = /fsyncSync\(\s*descriptor\s*\)/.test(src)
  const renamesTmp = /renameSync\(\s*tmpPath\s*,\s*target\s*\)/.test(src)
  const importsRename = /import\s*\{[^}]*\brenameSync\b[^}]*\}\s*from\s*['"]node:fs['"]/.test(src)
  // 關鍵反向斷言:絕不對 settingsPath 直接原地 writeFileSync(那是會留半寫檔的 non-atomic 寫)
  const noInPlaceWrite = !/writeFileSync\(\s*settingsPath\b/.test(src)
  const settingsUsesPrimitive = /atomicReplaceRepositoryFile\(\s*projectDir\s*,\s*settingsPath\b/.test(src)
  // 順序:tmp 寫入必在 rename 之前
  const iWrite = src.search(/writeFileSync\(\s*descriptor\b/)
  const iRename = src.search(/renameSync\(\s*tmpPath\s*,\s*target\s*\)/)
  const orderOk = iWrite >= 0 && iRename >= 0 && iWrite < iRename

  check(declTmp, '宣告同目錄、attempt-unique temp 路徑', '找不到 randomized same-directory temp 路徑宣告 → 非安全 tmp+rename')
  check(opensTmp, '以 exclusive-create 開啟 same-directory temp', '未以 wx 獨佔建立 temp 檔')
  check(writesTmp, '只透過新建 temp descriptor 寫入', '未寫入 temp descriptor')
  check(flushesTmp, 'rename 前 fsync temp 內容', '未 fsync temp 內容')
  check(renamesTmp, 'renameSync(tmpPath, target) 原子替換', '缺 renameSync(tmp→target)')
  check(importsRename, "從 node:fs import renameSync", '未 import renameSync')
  check(noInPlaceWrite, '絕無對 settingsPath 直接原地 writeFileSync(no partial in-place write)',
    '偵測到對 settingsPath 直接原地寫 → 會留半寫檔 = 違反原子契約')
  check(settingsUsesPrimitive, 'settings writer 調用同一個可併發驗證的原子替換 primitive',
    'settings writer 未調用 atomicReplaceRepositoryFile')
  check(orderOk, '寫 temp 在 rename 之前(順序正確)', 'temp 寫入未先於 rename')

  // ══ Layer B1 — 單跑 valid JSON + idempotent ══
  log.push('── Layer B1:單跑產出 valid JSON + 第二次重跑 byte-identical ──')
  buildFixture(REF)
  const refCorpus = validateInstalledForkCorpus(REF)
  const requiredScripts = refCorpus.bom.payload.requiredScripts
  const r1 = authorizedRefresh(REF)
  check(r1.settingsMerged === true, 'refreshLaunchers 回報 settingsMerged=true', `settingsMerged=${r1.settingsMerged}(未寫 settings?skipped=${r1.skipped})`)
  const refreshedPackageText = readFileSync(join(REF, 'package.json'), 'utf8')
  const refreshedPackage = JSON.parse(refreshedPackageText)
  check(refreshedPackage.scripts?.[PRODUCT_SCRIPT_NAME] === PRODUCT_SCRIPT_COMMAND,
    '同步後保留產品自有 package script',
    '同步覆蓋或刪除了產品自有 package script')
  const overwrittenProductScripts = Object.entries(PRODUCT_COLLISION_SCRIPTS)
    .filter(([name, command]) => refreshedPackage.scripts?.[name] !== command)
    .map(([name]) => name)
  check(overwrittenProductScripts.length === 0,
    '同步後保留產品所有的 build/dev/typecheck 命令',
    `同步越界覆寫產品 package scripts:${overwrittenProductScripts.join(',')}`)
  const missingRequiredScripts = Object.entries(requiredScripts)
    .filter(([name, command]) => refreshedPackage.scripts?.[name] !== command)
    .map(([name]) => name)
  check(missingRequiredScripts.length === 0,
    `同步後已安裝或更新 BOM 認證的 ${Object.keys(requiredScripts).length} 個治理 package scripts`,
    `同步後 BOM package scripts 缺失或不符:${missingRequiredScripts.join(',')}`)
  const refText = existsSync(join(REF, SETTINGS_REL)) ? readFileSync(join(REF, SETTINGS_REL), 'utf8') : ''
  let refParsed = false
  try { JSON.parse(refText); refParsed = true } catch {}
  check(refParsed, '單跑產出為 valid parseable JSON', 'single-run 產出非法 JSON')
  authorizedRefresh(REF)
  const refText2 = readFileSync(join(REF, SETTINGS_REL), 'utf8')
  check(refText2 === refText, '第二次重跑 settings.json byte-identical(idempotent)', '重跑產出不一致(非冪等)')
  check(readFileSync(join(REF, 'package.json'), 'utf8') === refreshedPackageText,
    '第二次重跑 package.json byte-identical(idempotent)',
    '重跑後 package.json 不一致(非冪等)')

  // ══ Layer B1.5 — 既有 target hardlink 不得變成對 repository 外 inode 的原地覆寫 ══
  log.push('── Layer B1.5:hardlink target 以新 inode 原子替換,外部 sentinel 不變 ──')
  mkdirSync(HARDLINK_OUTSIDE, { recursive: true })

  mkdirSync(join(HARDLINK_PRIMITIVE, '.claude'), { recursive: true })
  const primitiveSentinel = join(HARDLINK_OUTSIDE, 'primitive-sentinel.json')
  const primitiveTarget = join(HARDLINK_PRIMITIVE, SETTINGS_REL)
  writeFileSync(primitiveSentinel, '{"outside":"preserve"}\n')
  linkSync(primitiveSentinel, primitiveTarget)
  const primitiveBefore = lstatSync(primitiveSentinel)
  atomicReplaceRepositoryFile(HARDLINK_PRIMITIVE, primitiveTarget, '{"replacement":true}\n', {
    mode: 0o640,
    label: 'hardlink-safe atomic primitive fixture',
  })
  const primitiveAfter = lstatSync(primitiveTarget)
  check(readFileSync(primitiveSentinel, 'utf8') === '{"outside":"preserve"}\n',
    '原子寫入 primitive 不修改 repository 外 hardlink sentinel',
    '原子寫入 primitive 沿 hardlink inode 覆寫了外部 sentinel')
  check(readFileSync(primitiveTarget, 'utf8') === '{"replacement":true}\n'
      && (primitiveAfter.dev !== primitiveBefore.dev || primitiveAfter.ino !== primitiveBefore.ino),
    'primitive target 已用全新 inode 替換',
    'primitive target 未原子換成全新 inode')

  buildFixture(HARDLINK_COMMON)
  const verifiedHardlinkCorpus = validateInstalledForkCorpus(HARDLINK_COMMON)
  const common = verifiedHardlinkCorpus.manifest.consumer.commonInstruction
  const commonTarget = join(HARDLINK_COMMON, common.destination)
  const commonSentinel = join(HARDLINK_OUTSIDE, 'common-instruction-sentinel.md')
  mkdirSync(dirname(commonTarget), { recursive: true })
  writeFileSync(commonSentinel, '# outside sentinel\n')
  linkSync(commonSentinel, commonTarget)
  const commonBefore = lstatSync(commonSentinel)
  authorizedRefresh(HARDLINK_COMMON)
  const commonAfter = lstatSync(commonTarget)
  check(readFileSync(commonSentinel, 'utf8') === '# outside sentinel\n',
    'refresh common instruction 不修改 repository 外 hardlink sentinel',
    'refresh common instruction 沿 hardlink inode 覆寫了外部 sentinel')
  check(readFileSync(commonTarget).equals(readFileSync(join(verifiedHardlinkCorpus.forkRoot, common.artifact)))
      && (commonAfter.dev !== commonBefore.dev || commonAfter.ino !== commonBefore.ino),
    'refresh common instruction 以 authenticated corpus 的全新 inode 替換',
    'refresh common instruction 未安全替換 hardlink target')

  // ══ Layer B2 — 併發:兩 child process 同時寫同一 target ══
  log.push('── Layer B2:併發雙寫(spawn ×2)→ target 恆 valid JSON 且 == 單跑乾淨版 ──')
  const ROUNDS = 30
  let concValidJSON = 0, concEqualsRef = 0, childNonZero = 0, corruptSample = '', childFailureSample = ''
  for (let i = 0; i < ROUNDS; i++) {
    buildFixture(CONC, { installCorpus: false })
    const [a, b] = await Promise.all([spawnRun(CONC, refText), spawnRun(CONC, refText)])
    if (a.code !== 0) { childNonZero++; if (!childFailureSample) childFailureSample = a.err.trim().slice(0, 600) }
    if (b.code !== 0) { childNonZero++; if (!childFailureSample) childFailureSample = b.err.trim().slice(0, 600) }
    const txt = readFileSync(join(CONC, SETTINGS_REL), 'utf8')
    let ok = false
    try { JSON.parse(txt); ok = true } catch { corruptSample = txt.slice(0, 80) }
    if (ok) concValidJSON++
    if (txt === refText) concEqualsRef++
  }
  check(concValidJSON === ROUNDS, `併發 ${ROUNDS} 輪:target 每輪皆 valid JSON(絕無半寫/截斷)`,
    `併發出現非法 JSON(${ROUNDS - concValidJSON}/${ROUNDS} 輪),樣本頭:${JSON.stringify(corruptSample)}`)
  check(concEqualsRef === ROUNDS, `併發 ${ROUNDS} 輪:target 每輪 byte-equal 單跑乾淨版(deterministic)`,
    `併發結果與單跑乾淨版不符(${ROUNDS - concEqualsRef}/${ROUNDS} 輪)`)
  check(childNonZero === 0, `併發 ${ROUNDS * 2} 個原子 writer 全部成功`,
    `併發 writer 有 ${childNonZero}/${ROUNDS * 2} 個失敗;首筆:${childFailureSample}`)
  log.push(`  ℹ️  併發 child 非零退出 ${childNonZero}/${ROUNDS * 2}${childFailureSample ? `;首筆:${childFailureSample}` : ''}`)

  // ══ Layer B3 — 連續讀者觀測 rename 原子性 ══
  log.push('── Layer B3:連續讀者觀測 — writer 猛寫時,每次讀到的快照皆 valid JSON ──')
  buildFixture(OBS, { seedSettings: JSON.stringify({ seeded: true, hooks: {} }, null, 2) + '\n', installCorpus: false })
  let reads = 0, badReads = 0, badReadSample = ''
  let writersDone = false
  const readerLoop = (async () => {
    while (!writersDone) {
      try {
        const t = readFileSync(join(OBS, SETTINGS_REL), 'utf8')
        reads++
        try { JSON.parse(t) } catch { badReads++; if (!badReadSample) badReadSample = t.slice(0, 80) }
      } catch { /* ENOENT during swap window is impossible for rename, but tolerate */ }
      // 不 await sleep 讓讀盡量密;偶爾讓出 event loop
      if (reads % 50 === 0) await sleep(0)
    }
  })()
  // 三波、每波 3 個並行 writer,增加與讀者的重疊
  for (let wave = 0; wave < 3; wave++) {
    await Promise.all([spawnRun(OBS, refText), spawnRun(OBS, refText), spawnRun(OBS, refText)])
  }
  writersDone = true
  await readerLoop
  check(reads > 0, `讀者實際讀到 ${reads} 次快照`, '讀者一次都沒讀到(觀測無效)')
  check(badReads === 0, `連續 ${reads} 次讀取全為 valid JSON(觀測到 rename 的原子替換)`,
    `讀到 ${badReads} 次半寫/非法 JSON,樣本頭:${JSON.stringify(badReadSample)}`)
  const finalObs = readFileSync(join(OBS, SETTINGS_REL), 'utf8')
  let finalOk = false
  try { JSON.parse(finalObs); finalOk = true } catch {}
  check(finalOk, '讀者結束後 target 為 valid JSON', '最終 target 非法 JSON')

  // ── 收尾 ──
  console.log('=== settings.json 原子寫入(tmp + rename)契約測試 ===')
  console.log(`SUT: scripts/refresh-fork-launchers.mjs → refreshLaunchers() atomic settings write`)
  console.log(log.join('\n'))
  console.log(`\n${fail === 0
    ? '✅ SYNC-ATOMICITY PASS — 靜態 tmp+rename 契約成立 + 併發/連讀恆 valid JSON'
    : `❌ ${fail} 項 fail(見上)`}`)
  return fail === 0 ? 0 : 1
}

if (IS_FIXTURE_RUN) {
  try {
    const encoded = process.argv[3] || ''
    const content = Buffer.from(encoded, 'base64')
    if (!encoded || content.toString('base64') !== encoded) throw new Error('atomicity fixture content is not canonical base64')
    atomicReplaceRepositoryFile(process.cwd(), join(process.cwd(), SETTINGS_REL), content, {
      mode: 0o600,
      label: 'settings atomicity fixture',
    })
    process.exitCode = 0
  } catch (error) {
    console.error(error && error.stack ? error.stack : error)
    process.exitCode = 1
  }
} else {
  let exitCode = 1
  try {
    exitCode = await main()
  } catch (e) {
    console.error('❌ test-sync-atomicity 執行異常:', e && e.stack ? e.stack : e)
    exitCode = 1
  } finally {
    // repo pristine:fixtures 全在 tmpdir,清乾淨(不影響 repo tree)
    try { if (BASE && existsSync(BASE)) rmSync(BASE, { recursive: true, force: true }) } catch {}
  }
  process.exitCode = exitCode
}
