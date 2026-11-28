#!/usr/bin/env node
/**
 * Node 版本唯一出處閘(2026-11-28,0.1.0-beta.153,TRACKER R96)
 *
 * @gate-contract
 *   保證: 設計系統 repo 與產品範本裡,每一處決定用哪一版 Node 的設定(CI 的 setup-node、dev container 映像、Netlify、
 *         engines、雲端 Setup script)都等於 .node-version 那一版(產品端讀它的受管副本 scripts/.node-version);雲端 Setup script
 *         只有 README 一份短的、真正的安裝邏輯只在受管的 scripts/cloud-setup.sh,而且兩者都不寫死版號
 *   紅: --selftest 在記憶體裡各注入一種漂移(正本只寫主版號、產品副本不同、workflow 改回字面版號 / 讀錯檔 / 刪掉 setup-node、
 *       稀疏簽出漏檔、映像換回 Node 22、Netlify 寫回 NODE_VERSION 或拿掉指向 scripts/.node-version 的說明、多一份 .nvmrc 或範本根 .node-version、
 *       engines 不涵蓋、README 短腳本寫死版號 / 不執行受管腳本 / 變長、受管腳本寫死版號 / 拿掉 SHA-256 驗證、別的 .md 再放一份 Setup script),
 *       每一種都必須紅且指名那一格
 *   綠: 現行原始碼(selftest 基準)必須綠 —— 同一趟先判現行檔案、零違規才往下注入;讀不到 workflow 或範本 .md 時以儀器失效紅,不當通過
 *
 * ## 保證的性質(逐字)
 *
 * 設計系統 repo 與產品範本裡,每一處「決定要用哪一版 Node」的設定,用的都是 `.node-version` 那一版。
 * 正本是 DS 根的 `.node-version`(DS 自己的 workflow / dev container / Netlify 讀它);產品端讀受管的 `scripts/.node-version`,
 * 它是正本逐位元組相同的出貨副本。產品端不放在 repo 根:產品升級時執行的是上一版的 sync-all,受管檔只能落在它的
 * TRANSACTION_PATHS(`scripts/` 等)內,根目錄 `.node-version` 會讓整筆升級以 GOV-UPGRADE-008 中止
 * (test-verify-upgrade-evidence.mjs 守「每個受管檔都在現行與上一個已發布版的交易允許路徑內」)。
 *
 * ## 為什麼需要
 *
 * workspace 2026-11-28 回報:範本 CI 寫 24.14.0、dev container 映像是 Node 22、Netlify 寫 "22"、
 * Claude Code 雲端容器預設 22.23.5 —— 同一個值各寫各的,沒有一處是正本。DS repo 自己也一樣(workflow 裡 50 處字面 24.14.0)。
 *
 * ## 判準(每一格都有 --selftest 對照組)
 *
 * N1 `.node-version` 是確切版號 `X.Y.Z` 加換行(不准 `24`、`lts/*` 這類會漂的寫法)。
 * N2 產品端受管副本 `scripts/.node-version` 與根的逐位元組相同。
 * N3 兩邊 `.github/workflows/*.yml` 的每一個 actions/setup-node 步驟:不寫 `node-version`(setup-node 兩個都給時用它、
 *    正本就被蓋掉),只寫 `node-version-file`,DS workflow 指 `[<簽出路徑>/].node-version`、範本 workflow 指
 *    `[<簽出路徑>/]scripts/.node-version`,而且同一個 job 裡它前面有對應路徑的 checkout;
 *    那個 checkout 若是稀疏簽出,清單要含那個檔(否則檔案不在、setup-node 失敗)。
 *    另一面:job 裡任何會跑 node / npm / npx 的步驟,前面都必須有這樣的 setup-node —— 否則整個刪掉 setup-node
 *    (用 runner / 容器預設的 Node)反而沒有東西可判(2026-11-28 規格核對抓到;同時抓到 mirror workflow 在 setup-node 前就用 node 讀版號)。
 * N4 兩份 dev container 的 `image` 必須是下面 MEASURED_DEVCONTAINER_IMAGES 量過的映像,且量到的 Node = 正本。
 *    映像以 digest 釘死(內容不可變),但 Node 版本不在映像名稱裡,所以「這個 digest 裡是哪一版 Node」要量:
 *    `node scripts/node-version-ssot-invariant.mjs --measure-image <image@sha256:…>`(讀 registry 的映像設定 NODE_VERSION,
 *    linux/amd64 與 linux/arm64 都要相同;只讀、不在 CI 跑)。換映像 = 量完把結果加進表。
 * N5 兩份 netlify.toml 不寫 `NODE_VERSION`:DS 的 Netlify 讀 base 目錄(repo 根)的 `.node-version`;產品端升級送不進根目錄受管檔,
 *    所以範本 netlify.toml 改寫「在 Netlify UI 設站台環境變數 NODE_VERSION = scripts/.node-version 的值」並指名 scripts/.node-version
 *    (說明不准消失)。根與範本都不准有 `.nvmrc` / `.tool-versions`,範本根也不准有 `.node-version`(升級不會更新它 = 會漂的第二份)。
 * N6 兩份 package.json 的 `engines.node` 是消費者範圍 `>=X.Y.Z`,必須涵蓋正本(X.Y.Z ≤ 正本)。
 * N7 範本 README 的雲端 Setup script 恰好一個 bash 區塊、而且是短版:指令只有 1 行、最後一個指令是 `exec bash scripts/cloud-setup.sh`
 *    (獨立一行或接在 `||` / `&&` / `;` 後;判的是「最後交給受管腳本」這件事,不是那一行的形狀)、不寫死版號
 *    (2026-11-28 user:「那麼長？本來很短欸？」「雲端環境設定的指令到底最短可以多短？」)。安裝邏輯只在受管的 `scripts/cloud-setup.sh`:讀 `scripts/.node-version`、
 *    不寫死版號、對 SHASUMS256.txt 驗 SHA-256、最後 `exec npm run setup:all`。範本其他 .md 不准再放 Setup script 的 bash 區塊
 *    (README 是唯一出處,其他檔只指過去)。
 *
 *   node scripts/node-version-ssot-invariant.mjs [--selftest] [--measure-image <ref>]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
export const CANONICAL_PATH = '.node-version'
// 產品端受管副本(產品 repo 裡的路徑;在 DS 也是同一條路徑)。
export const PRODUCT_COPY = 'scripts/.node-version'
export const TEMPLATE_ROOT = 'template/ds-product-template'
const WORKFLOW_DIRS = ['.github/workflows', `${TEMPLATE_ROOT}/.github/workflows`]
// 每邊 workflow 的 setup-node 該讀哪個檔(相對於 checkout 根)
const expectedVersionFile = (workflowPath) => (workflowPath.startsWith(`${TEMPLATE_ROOT}/`) ? PRODUCT_COPY : CANONICAL_PATH)
const DEVCONTAINERS = ['.devcontainer/devcontainer.json', `${TEMPLATE_ROOT}/.devcontainer/devcontainer.json`]
const NETLIFY = ['netlify.toml', `${TEMPLATE_ROOT}/netlify.toml`]
const PACKAGES = ['package.json', `${TEMPLATE_ROOT}/package.json`]
const SECOND_SOURCES = ['.nvmrc', '.tool-versions', `${TEMPLATE_ROOT}/.nvmrc`, `${TEMPLATE_ROOT}/.tool-versions`, `${TEMPLATE_ROOT}/.node-version`]
const README = `${TEMPLATE_ROOT}/README.md`
export const CLOUD_SETUP = 'scripts/cloud-setup.sh'
const MAX_SETUP_SCRIPT_COMMANDS = 1

// 量過的映像 → 映像設定裡的 NODE_VERSION(2026-11-28 以 --measure-image 讀 mcr.microsoft.com:amd64 / arm64 都是 24.14.0)。
// 同一系列的鄰近版:4.0.8-24 = 24.13.0、4.0.10-24 = 24.15.0、1-22(換掉前那個 digest)= 22.16.0。
export const MEASURED_DEVCONTAINER_IMAGES = Object.freeze({
  'mcr.microsoft.com/devcontainers/javascript-node:4.0.9-24@sha256:21f15d367bfc5ceadabb9989be48029cba1e6bd80da323405232614a267a9c45': '24.14.0',
})

const EXACT = /^(\d+)\.(\d+)\.(\d+)$/
// 指令位置上的 node / npm / npx(不吃 node_modules、node-version 這類字)
const RUNS_NODE = /(^|[\s;&|(`'"])(node|npm|npx)(?=[\s)'"`;]|$)/m
const compareSemver = (a, b) => {
  const [x, y] = [EXACT.exec(a), EXACT.exec(b)]
  for (let i = 1; i <= 3; i += 1) {
    const d = Number(x[i]) - Number(y[i])
    if (d) return d
  }
  return 0
}

export function loadFiles(root = REPO) {
  const files = new Map()
  const read = (path) => {
    const abs = join(root, path)
    if (existsSync(abs)) files.set(path, readFileSync(abs, 'utf8'))
  }
  for (const path of [CANONICAL_PATH, PRODUCT_COPY, ...DEVCONTAINERS, ...NETLIFY, ...PACKAGES, ...SECOND_SOURCES, README, CLOUD_SETUP]) read(path)
  for (const dir of WORKFLOW_DIRS) {
    for (const name of readdirSync(join(root, dir)).filter((f) => /\.ya?ml$/.test(f)).sort()) read(`${dir}/${name}`)
  }
  for (const entry of readdirSync(join(root, TEMPLATE_ROOT), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const rel = `${join(entry.parentPath ?? entry.path, entry.name).slice(join(root, TEMPLATE_ROOT).length + 1)}`
    if (rel.split('/').includes('node_modules')) continue
    read(`${TEMPLATE_ROOT}/${rel}`)
  }
  return files
}

// 雲端 Setup script 的 bash 區塊(README 以外出現 = 第二份說明)
const SETUP_SCRIPT_BLOCK = /```(?:bash|sh|shell)\n([\s\S]*?)```/g
const setupScriptBlocks = (text) => [...String(text ?? '').matchAll(SETUP_SCRIPT_BLOCK)]
  .map((m) => m[1]).filter((body) => /Setup script|REPO_DIR=|cloud-setup\.sh/.test(body))
const commandLines = (body) => body.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))

function checkWorkflow(path, text, violations) {
  let doc
  try {
    doc = loadYaml(text)
  } catch (error) {
    violations.push(`N3 ${path}: YAML 讀不了(${error.message.split('\n')[0]})`)
    return
  }
  for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
    const steps = job?.steps ?? []
    // 會跑 node / npm / npx 的步驟,前面必須有 setup-node(否則用的是 runner 或容器預設的 Node,正本管不到;
    // 2026-11-28 核對者抓到:只檢查「有 setup-node 的步驟寫對」時,整個刪掉 setup-node 反而綠)。
    const firstSetupNode = steps.findIndex((s) => String(s?.uses ?? '').startsWith('actions/setup-node@'))
    steps.forEach((step, index) => {
      if (typeof step?.run !== 'string') return
      const commands = step.run.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
      if (!RUNS_NODE.test(commands)) return
      if (firstSetupNode === -1 || firstSetupNode > index) {
        violations.push(`N3 ${path} jobs.${jobId} 第 ${index + 1} 步(${step.name ?? 'run'}):跑 node / npm / npx,但前面沒有讀 .node-version 的 setup-node`)
      }
    })
    steps.forEach((step, index) => {
      if (!String(step?.uses ?? '').startsWith('actions/setup-node@')) return
      const where = `${path} jobs.${jobId} 第 ${index + 1} 步(setup-node)`
      const options = step.with ?? {}
      const expected = expectedVersionFile(path)
      if (Object.hasOwn(options, 'node-version')) violations.push(`N3 ${where}: 寫了 node-version(${options['node-version']});只准 node-version-file 讀 ${expected}`)
      const file = options['node-version-file']
      const wanted = typeof file !== 'string' ? null
        : file === expected ? ''
          : file.endsWith(`/${expected}`) ? file.slice(0, -(expected.length + 1)) : null
      if (wanted === null) {
        violations.push(`N3 ${where}: node-version-file 必須是 [<簽出路徑>/]${expected}(現在是 ${JSON.stringify(file)})`)
        return
      }
      const checkout = steps.slice(0, index)
        .filter((s) => String(s?.uses ?? '').startsWith('actions/checkout@') && String(s?.with?.path ?? '').replace(/\/$/, '') === wanted)
        .at(-1)
      if (!checkout) {
        violations.push(`N3 ${where}: 前面沒有簽出到「${wanted || '工作目錄根'}」的 checkout,${file} 不存在`)
        return
      }
      const sparse = checkout.with?.['sparse-checkout']
      if (sparse !== undefined && !String(sparse).split('\n').map((line) => line.trim()).includes(expected)) {
        violations.push(`N3 ${where}: 對應的 checkout 是稀疏簽出、清單沒有 ${expected}`)
      }
    })
  }
}

export function checkNodeVersionSsot(files) {
  const violations = []
  const canonicalText = files.get(CANONICAL_PATH)
  const canonical = canonicalText?.endsWith('\n') ? canonicalText.slice(0, -1) : null
  if (!canonical || !EXACT.test(canonical)) {
    violations.push(`N1 ${CANONICAL_PATH}: 必須是確切版號 X.Y.Z 加一個換行(現在是 ${JSON.stringify(canonicalText ?? null)})`)
    return violations
  }
  const productCopy = files.get(PRODUCT_COPY)
  if (productCopy !== canonicalText) violations.push(`N2 ${PRODUCT_COPY}: 產品端受管副本必須與根的 ${CANONICAL_PATH} 逐位元組相同(現在是 ${JSON.stringify(productCopy ?? null)})`)

  const workflows = [...files.keys()].filter((path) => WORKFLOW_DIRS.some((dir) => path.startsWith(`${dir}/`)))
  if (!workflows.some((path) => path.startsWith(`${TEMPLATE_ROOT}/`)) || !workflows.some((path) => path.startsWith('.github/'))) {
    violations.push('N3 讀不到兩邊的 workflow(儀器失效,不是通過)')
  }
  for (const path of workflows) checkWorkflow(path, files.get(path), violations)

  for (const path of DEVCONTAINERS) {
    let image
    try {
      image = JSON.parse(files.get(path) ?? 'null')?.image
    } catch {
      image = undefined
    }
    const measured = MEASURED_DEVCONTAINER_IMAGES[image]
    if (!measured) violations.push(`N4 ${path}: image ${JSON.stringify(image ?? null)} 沒有量過(用 --measure-image 量完加進 MEASURED_DEVCONTAINER_IMAGES)`)
    else if (measured !== canonical) violations.push(`N4 ${path}: image 裡是 Node ${measured},正本是 ${canonical}`)
  }

  for (const path of NETLIFY) {
    const text = files.get(path)
    if (text === undefined) violations.push(`N5 ${path}: 讀不到(儀器失效)`)
    else if (/^[ \t]*NODE_VERSION[ \t]*=/m.test(text)) violations.push(`N5 ${path}: 寫了 NODE_VERSION;Node 版本只在 .node-version(產品端 ${PRODUCT_COPY})`)
    else if (path.startsWith(`${TEMPLATE_ROOT}/`) && !(text.includes(PRODUCT_COPY) && /NODE_VERSION/.test(text))) {
      violations.push(`N5 ${path}: 少了「在 Netlify UI 設站台環境變數 NODE_VERSION = ${PRODUCT_COPY} 的值」的說明(產品端唯一能釘 Netlify 的做法)`)
    }
  }
  for (const path of SECOND_SOURCES) if (files.has(path)) violations.push(`N5 ${path}: 第二份 Node 版本出處,刪掉(DS 只留根 .node-version、產品端只留 ${PRODUCT_COPY})`)

  for (const path of PACKAGES) {
    let range
    try {
      range = JSON.parse(files.get(path) ?? 'null')?.engines?.node
    } catch {
      range = undefined
    }
    const floor = /^>=\s*(\d+\.\d+\.\d+)$/.exec(String(range ?? ''))
    if (!floor) violations.push(`N6 ${path}: engines.node 必須是 >=X.Y.Z(現在是 ${JSON.stringify(range ?? null)})`)
    else if (compareSemver(floor[1], canonical) > 0) violations.push(`N6 ${path}: engines.node ${range} 不涵蓋正本 ${canonical}`)
  }

  const readmeBlocks = setupScriptBlocks(files.get(README))
  if (readmeBlocks.length !== 1) violations.push(`N7 ${README}: Setup script 的 bash 區塊要恰好一個(找到 ${readmeBlocks.length} 個${readmeBlocks.length ? '' : ',儀器失效'})`)
  else {
    const [setupScript] = readmeBlocks
    const commands = commandLines(setupScript)
    if (commands.length > MAX_SETUP_SCRIPT_COMMANDS) violations.push(`N7 ${README}: Setup script 有 ${commands.length} 行指令,短版最多 ${MAX_SETUP_SCRIPT_COMMANDS} 行;安裝邏輯放受管的 ${CLOUD_SETUP}`)
    const handsOff = new RegExp(`(?:^|\\|\\||&&|;)\\s*exec bash ${CLOUD_SETUP.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`)
    if (!handsOff.test(commands.at(-1) ?? '')) violations.push(`N7 ${README}: Setup script 沒有 exec bash ${CLOUD_SETUP} 當最後一個指令(獨立一行或接在 || 後)`)
    if (setupScript.includes(canonical)) violations.push(`N7 ${README}: Setup script 寫死了版號 ${canonical},版本只在 .node-version`)
  }
  const cloudSetup = files.get(CLOUD_SETUP)
  if (cloudSetup === undefined) violations.push(`N7 ${CLOUD_SETUP}: 讀不到(受管的雲端 Setup 實作不見了)`)
  else {
    if (!/<\s*scripts\/\.node-version\b/.test(cloudSetup)) violations.push(`N7 ${CLOUD_SETUP}: 沒有從 ${PRODUCT_COPY} 讀版本`)
    if (cloudSetup.includes(canonical)) violations.push(`N7 ${CLOUD_SETUP}: 寫死了版號 ${canonical},要讀 ${PRODUCT_COPY}`)
    if (!cloudSetup.includes('SHASUMS256.txt') || !/sha256sum --check/.test(cloudSetup)) violations.push(`N7 ${CLOUD_SETUP}: 沒有對 SHASUMS256.txt 驗 SHA-256`)
    if (!/\nexec npm run setup:all\n?$/.test(cloudSetup)) violations.push(`N7 ${CLOUD_SETUP}: 最後一行必須是 exec npm run setup:all(回傳它的結束碼)`)
  }
  const docs = [...files.keys()].filter((path) => path.startsWith(`${TEMPLATE_ROOT}/`) && path.endsWith('.md') && path !== README)
  if (!docs.length) violations.push(`N7 讀不到 ${TEMPLATE_ROOT} 的其他 .md(儀器失效,不是通過)`)
  for (const path of docs) {
    if (setupScriptBlocks(files.get(path)).length) violations.push(`N7 ${path}: 有 Setup script 的 bash 區塊;唯一出處是 README「Local, cloud, and container setup」,這裡只准指過去`)
  }
  return violations
}

function selftest() {
  const base = loadFiles()
  const baseline = checkNodeVersionSsot(base)
  let failed = baseline.length ? [`現行原始碼(selftest 基準)不綠:\n  ${baseline.join('\n  ')}`] : []
  const firstWith = (path, needle) => {
    if (!base.get(path)?.includes(needle)) throw new Error(`selftest 前提不成立:${path} 沒有 ${needle}`)
    return path
  }
  const cases = [
    ['N1', '正本只寫主版號', (f) => f.set(CANONICAL_PATH, '24\n')],
    ['N1', '正本沒有結尾換行', (f) => f.set(CANONICAL_PATH, f.get(CANONICAL_PATH).trimEnd())],
    ['N2', '產品副本漂到別版', (f) => f.set(PRODUCT_COPY, '24.15.0\n')],
    ['N3', 'CI 改回字面 node-version', (f) => {
      const path = firstWith('.github/workflows/ci.yml', 'node-version-file: .node-version')
      f.set(path, f.get(path).replace('node-version-file: .node-version', "node-version: '24.14.0'"))
    }],
    ['N3', 'node-version 與 node-version-file 並存', (f) => {
      const path = firstWith(`${TEMPLATE_ROOT}/.github/workflows/audit.yml`, `node-version-file: ${PRODUCT_COPY}`)
      f.set(path, f.get(path).replace(`node-version-file: ${PRODUCT_COPY}`, `node-version-file: ${PRODUCT_COPY}\n          node-version: '22'`))
    }, '寫了 node-version'],
    ['N3', '範本 workflow 讀根目錄 .node-version(產品 repo 沒有這個檔)', (f) => {
      const path = firstWith(`${TEMPLATE_ROOT}/.github/workflows/sync-design-system.yml`, `node-version-file: ${PRODUCT_COPY}`)
      f.set(path, f.get(path).replace(`node-version-file: ${PRODUCT_COPY}`, 'node-version-file: .node-version'))
    }, `node-version-file 必須是 [<簽出路徑>/]${PRODUCT_COPY}`],
    ['N3', '稀疏簽出漏 .node-version', (f) => {
      const path = firstWith('.github/workflows/visual-regression.yml', '            .node-version\n')
      f.set(path, f.get(path).replace('            .node-version\n', ''))
    }],
    ['N3', '指向不存在的簽出路徑', (f) => {
      const path = firstWith('.github/workflows/governance-anchor.yml', 'node-version-file: trusted/.node-version')
      f.set(path, f.get(path).replace('node-version-file: trusted/.node-version', 'node-version-file: elsewhere/.node-version'))
    }],
    ['N4', 'dev container 換回 Node 22 映像', (f) => {
      const path = DEVCONTAINERS[1]
      f.set(path, f.get(path).replace(/"image": "[^"]+"/, '"image": "mcr.microsoft.com/devcontainers/javascript-node:1-22@sha256:0d29e5fdc64f8397cd502223e0c4679f1e60877ca0fd2db4f2e2e0028e4271af"'))
    }],
    ['N4', '正本升版、映像沒跟著換', (f) => {
      f.set(CANONICAL_PATH, '24.15.0\n')
      f.set(PRODUCT_COPY, '24.15.0\n')
    }],
    ['N5', 'netlify.toml 寫回 NODE_VERSION', (f) => f.set(NETLIFY[1], `${f.get(NETLIFY[1])}\n[build.environment]\n  NODE_VERSION = "22"\n`)],
    ['N5', '範本 netlify.toml 拿掉「在 Netlify UI 設 NODE_VERSION」的說明', (f) => {
      const path = firstWith(NETLIFY[1], PRODUCT_COPY)
      f.set(path, f.get(path).split('\n').filter((line) => !line.includes(PRODUCT_COPY) && !line.includes('NODE_VERSION')).join('\n'))
    }, '少了'],
    ['N5', '多一份 .nvmrc', (f) => f.set(`${TEMPLATE_ROOT}/.nvmrc`, '24.14.0\n')],
    ['N5', '範本根再放一份 .node-version(升級不會更新它)', (f) => f.set(`${TEMPLATE_ROOT}/.node-version`, '24.14.0\n')],
    ['N6', 'engines 下限高過正本', (f) => {
      const pkg = JSON.parse(f.get(PACKAGES[1]))
      pkg.engines.node = '>=24.15.0'
      f.set(PACKAGES[1], JSON.stringify(pkg, null, 2))
    }],
    ['N6', 'engines 不是 >=X.Y.Z', (f) => {
      const pkg = JSON.parse(f.get(PACKAGES[0]))
      pkg.engines.node = '22 || 24'
      f.set(PACKAGES[0], JSON.stringify(pkg, null, 2))
    }],
    ['N7', 'README 短腳本寫死版號', (f) => {
      const needle = firstWith(README, `exec bash ${CLOUD_SETUP}`) && `exec bash ${CLOUD_SETUP}`
      f.set(README, f.get(README).replace(needle, `${needle}  # Node ${f.get(CANONICAL_PATH).trim()}`).replace(`${needle}  # Node`, `${needle}\n  # Node`))
    }, '寫死了版號'],
    ['N7', 'README 短腳本不執行受管腳本', (f) => {
      const needle = firstWith(README, `exec bash ${CLOUD_SETUP}`) && `exec bash ${CLOUD_SETUP}`
      f.set(README, f.get(README).replace(needle, 'exec npm run setup:all'))
    }, `沒有 exec bash ${CLOUD_SETUP}`],
    ['N7', 'README 短腳本交給受管腳本之後又接別的指令(不是最後一個)', (f) => {
      const needle = firstWith(README, `exec bash ${CLOUD_SETUP}`) && `exec bash ${CLOUD_SETUP}`
      f.set(README, f.get(README).replace(needle, `${needle}; echo done`))
    }, `沒有 exec bash ${CLOUD_SETUP}`],
    ['N7', 'README 短腳本塞回安裝邏輯(變長)', (f) => {
      const needle = firstWith(README, `exec bash ${CLOUD_SETUP}`) && `exec bash ${CLOUD_SETUP}`
      f.set(README, f.get(README).replace(needle, `NODE_VERSION="$(cat .node-version)"\n  curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"\n  ${needle}`))
    }, '短版最多'],
    ['N7', '受管腳本寫死版號(不讀 .node-version)', (f) => {
      const path = firstWith(CLOUD_SETUP, '< scripts/.node-version)')
      f.set(path, f.get(path).replace(/NODE_VERSION="\$\(tr -d[^\n]*< scripts\/\.node-version\)"/, `NODE_VERSION="${f.get(CANONICAL_PATH).trim()}"`))
    }, '寫死了版號'],
    ['N7', '受管腳本拿掉 SHA-256 驗證', (f) => {
      const path = firstWith(CLOUD_SETUP, 'sha256sum --check')
      f.set(path, f.get(path).replace(/sha256sum --check[^\n]*/, 'true); then'))
    }, 'SHA-256'],
    ['N7', '受管腳本不再回傳 setup:all 的結束碼', (f) => {
      const path = firstWith(CLOUD_SETUP, '\nexec npm run setup:all')
      f.set(path, f.get(path).replace('\nexec npm run setup:all', '\nnpm run setup:all || true'))
    }, 'exec npm run setup:all'],
    ['N3', '刪掉範本 audit.yml 的 setup-node(job 照樣跑 npm)', (f) => {
      const path = `${TEMPLATE_ROOT}/.github/workflows/audit.yml`
      const before = f.get(path)
      const after = before.replace(/\n {6}- uses: actions\/setup-node@[^\n]*\n(?: {8}[^\n]*\n)+/, '\n')
      if (after === before) throw new Error(`selftest 前提不成立:${path} 找不到 setup-node 步驟`)
      f.set(path, after)
    }],
    ['N7', 'README 以外再放一份 Setup script(docs/01 舊版)', (f) => {
      const path = `${TEMPLATE_ROOT}/docs/01-first-time-setup.md`
      if (!f.has(path)) throw new Error(`selftest 前提不成立:讀不到 ${path}`)
      f.set(path, `${f.get(path)}\n  \`\`\`bash\n  #!/bin/bash\n  # Claude Code Setup script (shared Default environment): runs setup:all only for <repository-folder>\n  REPO_DIR="<repository-folder>"\n  exec npm run setup:all\n  \`\`\`\n`)
    }, '只准指過去'],
  ]
  // 第 4 欄(選填)= 該紅的那一句必須含的字:同一格有兩條規則時,證明紅的是被注入的那一條,不是旁邊那條。
  for (const [id, name, mutate, expect] of cases) {
    const files = new Map(base)
    mutate(files)
    const hits = checkNodeVersionSsot(files)
    const named = hits.filter((line) => line.startsWith(`${id} `) && (!expect || line.includes(expect)))
    console.log(`${named.length ? 'RED ok ' : 'MISSED '} ${id} ${name}${named.length ? `:${named[0]}` : ''}`)
    if (!named.length) failed.push(`${id} ${name}:該紅沒紅(${hits.join(' | ') || '零違規'})`)
  }
  console.log(`baseline: ${baseline.length ? 'RED' : 'GREEN'}(現行原始碼(selftest 基準)`)
  if (failed.length) {
    console.error(`node-version-ssot --selftest FAIL\n  ${failed.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`node-version-ssot --selftest PASS(${cases.length} 格紅面各自指名、基準綠)`)
}

async function measureImage(ref) {
  // 只讀:匿名讀 registry 的 manifest 與映像設定。沙箱內需 NODE_USE_ENV_PROXY=1 才會走代理。
  const m = /^([^/]+)\/(.+?)(?::[^@]+)?@(sha256:[a-f0-9]{64})$/.exec(ref)
  if (!m) throw new Error('--measure-image 要給 <registry>/<repo>:<tag>@sha256:<digest>')
  const [, registry, repo, digest] = m
  const accept = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json'
  const get = async (path, json = true) => {
    const res = await fetch(`https://${registry}/v2/${repo}/${path}`, { headers: { accept } })
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    return json ? res.json() : res
  }
  const index = await get(`manifests/${digest}`)
  const versions = new Set()
  for (const entry of index.manifests ?? []) {
    if (entry.platform?.os !== 'linux' || !['amd64', 'arm64'].includes(entry.platform.architecture)) continue
    const manifest = await get(`manifests/${entry.digest}`)
    const config = await get(`blobs/${manifest.config.digest}`)
    const env = (config.config?.Env ?? []).find((line) => line.startsWith('NODE_VERSION='))
    console.log(`${entry.platform.architecture}: ${env ?? '(沒有 NODE_VERSION)'}`)
    versions.add(env)
  }
  if (versions.size !== 1) throw new Error('amd64 / arm64 的 Node 版本不一致或讀不到')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const measureAt = process.argv.indexOf('--measure-image')
  if (measureAt !== -1) {
    await measureImage(process.argv[measureAt + 1])
  } else if (process.argv.includes('--selftest')) {
    selftest()
  } else {
    const violations = checkNodeVersionSsot(loadFiles())
    if (violations.length) {
      console.error(`node-version-ssot FAIL(${violations.length})\n  ${violations.join('\n  ')}`)
      process.exit(1)
    }
    console.log(`node-version-ssot PASS:正本 ${CANONICAL_PATH} = ${readFileSync(join(REPO, CANONICAL_PATH), 'utf8').trim()};workflow / dev container / Netlify / engines / Setup script 都對齊`)
  }
}
