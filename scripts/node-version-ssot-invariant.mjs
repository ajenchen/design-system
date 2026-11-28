#!/usr/bin/env node
/**
 * Node 版本唯一出處閘(2026-11-28,0.1.0-beta.153,TRACKER R96)
 *
 * ## 保證的性質(逐字)
 *
 * 設計系統 repo 與產品範本裡,每一處「決定要用哪一版 Node」的設定,用的都是 `.node-version` 那一版;
 * 正本只有 repo 根的 `.node-version` 一份,範本的 `.node-version` 是它逐位元組相同的出貨副本。
 *
 * ## 為什麼需要
 *
 * workspace 2026-11-28 回報:範本 CI 寫 24.14.0、dev container 映像是 Node 22、Netlify 寫 "22"、
 * Claude Code 雲端容器預設 22.23.5 —— 同一個值各寫各的,沒有一處是正本。DS repo 自己也一樣(workflow 裡 50 處字面 24.14.0)。
 *
 * ## 判準(每一格都有 --selftest 對照組)
 *
 * N1 `.node-version` 是確切版號 `X.Y.Z` 加換行(不准 `24`、`lts/*` 這類會漂的寫法)。
 * N2 `template/ds-product-template/.node-version` 與根的逐位元組相同。
 * N3 兩邊 `.github/workflows/*.yml` 的每一個 actions/setup-node 步驟:不寫 `node-version`(setup-node 兩個都給時用它、
 *    正本就被蓋掉),只寫 `node-version-file: [<簽出路徑>/].node-version`,而且同一個 job 裡它前面有對應路徑的 checkout;
 *    那個 checkout 若是稀疏簽出,清單要含 `.node-version`(否則檔案不在、setup-node 失敗)。
 * N4 兩份 dev container 的 `image` 必須是下面 MEASURED_DEVCONTAINER_IMAGES 量過的映像,且量到的 Node = 正本。
 *    映像以 digest 釘死(內容不可變),但 Node 版本不在映像名稱裡,所以「這個 digest 裡是哪一版 Node」要量:
 *    `node scripts/node-version-ssot-invariant.mjs --measure-image <image@sha256:…>`(讀 registry 的映像設定 NODE_VERSION,
 *    linux/amd64 與 linux/arm64 都要相同;只讀、不在 CI 跑)。換映像 = 量完把結果加進表。
 * N5 兩份 netlify.toml 不寫 `NODE_VERSION`(Netlify 讀 base 目錄的 `.node-version`);根與範本都不准再有 `.nvmrc` / `.tool-versions`。
 * N6 兩份 package.json 的 `engines.node` 是消費者範圍 `>=X.Y.Z`,必須涵蓋正本(X.Y.Z ≤ 正本)。
 * N7 範本 README 的 Claude Code 雲端 Setup script 讀 `.node-version`,不寫死版號。
 *
 *   node scripts/node-version-ssot-invariant.mjs [--selftest] [--measure-image <ref>]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
export const CANONICAL_PATH = '.node-version'
export const TEMPLATE_ROOT = 'template/ds-product-template'
const WORKFLOW_DIRS = ['.github/workflows', `${TEMPLATE_ROOT}/.github/workflows`]
const DEVCONTAINERS = ['.devcontainer/devcontainer.json', `${TEMPLATE_ROOT}/.devcontainer/devcontainer.json`]
const NETLIFY = ['netlify.toml', `${TEMPLATE_ROOT}/netlify.toml`]
const PACKAGES = ['package.json', `${TEMPLATE_ROOT}/package.json`]
const SECOND_SOURCES = ['.nvmrc', '.tool-versions', `${TEMPLATE_ROOT}/.nvmrc`, `${TEMPLATE_ROOT}/.tool-versions`]
const README = `${TEMPLATE_ROOT}/README.md`

// 量過的映像 → 映像設定裡的 NODE_VERSION(2026-11-28 以 --measure-image 讀 mcr.microsoft.com:amd64 / arm64 都是 24.14.0)。
// 同一系列的鄰近版:4.0.8-24 = 24.13.0、4.0.10-24 = 24.15.0、1-22(換掉前那個 digest)= 22.16.0。
export const MEASURED_DEVCONTAINER_IMAGES = Object.freeze({
  'mcr.microsoft.com/devcontainers/javascript-node:4.0.9-24@sha256:21f15d367bfc5ceadabb9989be48029cba1e6bd80da323405232614a267a9c45': '24.14.0',
})

const EXACT = /^(\d+)\.(\d+)\.(\d+)$/
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
  for (const path of [CANONICAL_PATH, `${TEMPLATE_ROOT}/${CANONICAL_PATH}`, ...DEVCONTAINERS, ...NETLIFY, ...PACKAGES, ...SECOND_SOURCES, README]) read(path)
  for (const dir of WORKFLOW_DIRS) {
    for (const name of readdirSync(join(root, dir)).filter((f) => /\.ya?ml$/.test(f)).sort()) read(`${dir}/${name}`)
  }
  return files
}

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
    steps.forEach((step, index) => {
      if (!String(step?.uses ?? '').startsWith('actions/setup-node@')) return
      const where = `${path} jobs.${jobId} 第 ${index + 1} 步(setup-node)`
      const options = step.with ?? {}
      if (Object.hasOwn(options, 'node-version')) violations.push(`N3 ${where}: 寫了 node-version(${options['node-version']});只准 node-version-file 讀 .node-version`)
      const file = options['node-version-file']
      const match = typeof file === 'string' ? /^(?:(.+)\/)?\.node-version$/.exec(file) : null
      if (!match) {
        violations.push(`N3 ${where}: node-version-file 必須是 [<簽出路徑>/].node-version(現在是 ${JSON.stringify(file)})`)
        return
      }
      const wanted = match[1] ?? ''
      const checkout = steps.slice(0, index)
        .filter((s) => String(s?.uses ?? '').startsWith('actions/checkout@') && String(s?.with?.path ?? '').replace(/\/$/, '') === wanted)
        .at(-1)
      if (!checkout) {
        violations.push(`N3 ${where}: 前面沒有簽出到「${wanted || '工作目錄根'}」的 checkout,${file} 不存在`)
        return
      }
      const sparse = checkout.with?.['sparse-checkout']
      if (sparse !== undefined && !String(sparse).split('\n').map((line) => line.trim()).includes(CANONICAL_PATH)) {
        violations.push(`N3 ${where}: 對應的 checkout 是稀疏簽出、清單沒有 .node-version`)
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
  const templateCopy = files.get(`${TEMPLATE_ROOT}/${CANONICAL_PATH}`)
  if (templateCopy !== canonicalText) violations.push(`N2 ${TEMPLATE_ROOT}/${CANONICAL_PATH}: 必須與根的 ${CANONICAL_PATH} 逐位元組相同(現在是 ${JSON.stringify(templateCopy ?? null)})`)

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
    else if (/^[ \t]*NODE_VERSION[ \t]*=/m.test(text)) violations.push(`N5 ${path}: 寫了 NODE_VERSION;Netlify 改讀 base 目錄的 .node-version`)
  }
  for (const path of SECOND_SOURCES) if (files.has(path)) violations.push(`N5 ${path}: 第二份 Node 版本出處,刪掉、只留 .node-version`)

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

  const readme = files.get(README) ?? ''
  const setupScript = [...readme.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).find((body) => body.includes('Claude Code Setup script'))
  if (!setupScript) violations.push(`N7 ${README}: 找不到 Claude Code Setup script 的 bash 區塊(儀器失效)`)
  else {
    if (!setupScript.includes(CANONICAL_PATH)) violations.push(`N7 ${README}: Setup script 沒有讀 .node-version`)
    if (setupScript.includes(canonical)) violations.push(`N7 ${README}: Setup script 寫死了版號 ${canonical},要讀 .node-version`)
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
    ['N2', '範本副本漂到別版', (f) => f.set(`${TEMPLATE_ROOT}/${CANONICAL_PATH}`, '24.15.0\n')],
    ['N3', 'CI 改回字面 node-version', (f) => {
      const path = firstWith('.github/workflows/ci.yml', 'node-version-file: .node-version')
      f.set(path, f.get(path).replace('node-version-file: .node-version', "node-version: '24.14.0'"))
    }],
    ['N3', 'node-version 與 node-version-file 並存', (f) => {
      const path = firstWith(`${TEMPLATE_ROOT}/.github/workflows/audit.yml`, 'node-version-file: .node-version')
      f.set(path, f.get(path).replace('node-version-file: .node-version', "node-version-file: .node-version\n          node-version: '22'"))
    }],
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
      f.set(`${TEMPLATE_ROOT}/${CANONICAL_PATH}`, '24.15.0\n')
    }],
    ['N5', 'netlify.toml 寫回 NODE_VERSION', (f) => f.set(NETLIFY[1], `${f.get(NETLIFY[1])}\n[build.environment]\n  NODE_VERSION = "22"\n`)],
    ['N5', '多一份 .nvmrc', (f) => f.set(`${TEMPLATE_ROOT}/.nvmrc`, '24.14.0\n')],
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
    ['N7', 'Setup script 寫死版號', (f) => f.set(README, f.get(README).replace('# Claude Code Setup script', `# Claude Code Setup script (node ${f.get(CANONICAL_PATH).trim()})`))],
  ]
  for (const [id, name, mutate] of cases) {
    const files = new Map(base)
    mutate(files)
    const hits = checkNodeVersionSsot(files)
    const named = hits.filter((line) => line.startsWith(`${id} `))
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
