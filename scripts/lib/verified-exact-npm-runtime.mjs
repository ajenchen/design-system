#!/usr/bin/env node

// Repository-independent npm bootstrap trust boundary.
//
// The committed lock selects one canonical npm tarball and SHA-512 digest. This module downloads
// those bytes with Node's HTTPS stack, verifies the compressed archive before parsing it, accepts
// only a deliberately small ustar subset, and extracts regular files into a fresh disposable root.
// Neither PATH npm nor node_modules/npm is consulted. Callers must keep the returned runtime alive
// only for the operation and invoke cleanup in a finally block.

import { createHash, timingSafeEqual } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { request as httpRequest } from 'node:http'
import { request } from 'node:https'
import { isIP } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import tls from 'node:tls'
import { gunzipSync } from 'node:zlib'

const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org'
const EXACT_STABLE_VERSION = /^\d+\.\d+\.\d+$/
const SHA512_INTEGRITY = /^sha512-([A-Za-z0-9+/]+={0,2})$/
const TAR_BLOCK_SIZE = 512
const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 5_000
const MAX_ARCHIVE_PATH_BYTES = 256
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const NPM_RUNTIME_OVERLAY_ALIAS = 'npm-runtime-brace-expansion-patch'
const NPM_RUNTIME_OVERLAY_SPEC = 'npm:brace-expansion@5.0.12'
const NPM_RUNTIME_OVERLAY_PACKAGE = 'brace-expansion'
const NPM_RUNTIME_OVERLAY_VERSION = '5.0.12'
const NPM_RUNTIME_OVERLAY_REPLACED_VERSION = '5.0.7'
const NPM_RUNTIME_OVERLAY_TARGET = 'node_modules/brace-expansion'
const NPM_RUNTIME_OVERLAY_CONSUMER = 'node_modules/minimatch'
const NPM_RUNTIME_OVERLAY_CONSUMER_VERSION = '10.2.5'
const NPM_RUNTIME_OVERLAY_CONSUMER_RANGE = '^5.0.5'
const NPM_RUNTIME_SECONDARY_OVERLAY_ALIAS = 'npm-runtime-tar-patch'
const NPM_RUNTIME_SECONDARY_OVERLAY_SPEC = 'npm:tar@7.5.22'
const NPM_RUNTIME_SECONDARY_OVERLAY_PACKAGE = 'tar'
const NPM_RUNTIME_SECONDARY_OVERLAY_VERSION = '7.5.22'
const NPM_RUNTIME_SECONDARY_OVERLAY_REPLACED_VERSION = '7.5.19'
const NPM_RUNTIME_SECONDARY_OVERLAY_TARGET = 'node_modules/tar'
// 2026-09-30:歷史上認證過、現已被取代的主修補層版本。只給「渲染用參考樹」用(vulnerabilityPolicy =
// report-render-only-reference:無憑證、用完即丟,只為建一份 Storybook 當比較基準)。那棵樹是舊 commit,
// package.json 釘的是它當時的修補層;候選的治理程式若只認現行版本,修補層一升版(5.0.9 → 5.0.12),
// DataTable 比值 job 的 main 參考樹與視覺回歸重拍的「上一個已發布版」參考樹就結構性地裝不起來(PR #169 首跑)。
// 一般安裝、發版安裝、consumer 同步一律只接受現行版本;下載白名單與 lock 完整性檢查照舊。
const NPM_RUNTIME_OVERLAY_HISTORICAL_VERSIONS = Object.freeze(['5.0.9'])
const overlaySpecFor = (version) => `npm:${NPM_RUNTIME_OVERLAY_PACKAGE}@${version}`

const invariant = (condition, message) => {
  if (!condition) throw new Error(`GOV-NPM-RUNTIME-001:${message}`)
}

// ── TLS 信任錨(2026-11-26,P0:下游 Claude Code 雲端 `setup:all` 必定 SELF_SIGNED_CERT_IN_CHAIN)──────────────
// 鎖定安裝把 NODE_EXTRA_CA_CERTS / SSL_CERT_FILE / SSL_CERT_DIR / NODE_OPTIONS 當成不可信而剝除
//(governance-dependency-bootstrap.mjs 的 HOSTILE_NAME),Node 預設又只信內建的 Mozilla CA bundle;
// 於是只要 TLS 被重新簽(Claude Code 雲端的出站代理、多數企業代理),即使代理 CA 已裝進主機的系統憑證庫,
// 鎖定 npm 也不可能連上 registry。要保證的性質:整條鎖定鏈信任「內建 bundle + 主機系統憑證庫」這一組錨,
// 而且這組錨**不取自任何環境變數**(威脅模型不變:環境變數不可信,主機的 Node / TLS 視為可信)。
//   · 系統憑證庫各平台讀什麼(Node 官方文件 --use-system-ca 段,https://nodejs.org/docs/latest-v22.x/api/cli.html#--use-system-ca):
//     - Linux 與其他 Unix:Node 連結的 OpenSSL 所認的預設憑證檔(通常 /etc/ssl/cert.pem)與目錄(通常 /etc/ssl/certs;
//       官方 Linux 執行檔 OPENSSLDIR = /etc/ssl),首次載入後快取。文件原文:「If the overriding OpenSSL environment variables
//      (typically `SSL_CERT_FILE` and `SSL_CERT_DIR` ...) are set, the specified paths will be used to load certificates
//       instead.」—— 所以讀系統庫的那支行程,環境裡不得有它們(見下兩點)。
//     - macOS:Default 與 System 鑰匙圈裡標為 Always Trust(「When using this certificate」或「SSL」)的憑證。
//     - Windows:Local Machine(certlm.msc)的 Trusted Root Certification Authorities / Trusted People / Enterprise Trust
//       各子庫,與 Current User(certmgr.msc)的 Trusted Root Certification Authorities 等。本 repo 不支援 native Windows
//      (README「Native Windows is unsupported」,請用 WSL2 或 dev container),這一行只為交代完整的平台行為。
//   · 子行程(鎖定 npm):以 `--use-system-ca` 啟動,環境已剝除(SSL_CERT_FILE / SSL_CERT_DIR / NODE_EXTRA_CA_CERTS 都不在)。
//     Node 官方文件(doc/api/cli.md,v22.x):added v23.8.0 / v22.15.0;v23.9.0 起支援 Windows / macOS 以外平台
//    (nodejs/node#57009,22.15.0 一併帶入,CHANGELOG_V22.md 22.15.0 段);「Node.js uses the trusted CA certificates present
//     in the system store along with the `--use-bundled-ca` option and the `NODE_EXTRA_CA_CERTS` environment variable.」
//     —— 是**加上**系統庫,不取代內建 bundle;句中的 NODE_EXTRA_CA_CERTS 在子行程環境裡已剝除,所以實際是 bundle + 系統庫。
//     出處另見 https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V22.md#22.15.0
//   · 本行程(下載 npm tarball 與修補層):明確傳 `ca` = 內建 bundle + 系統庫。本行程的環境**沒有剝除**(它就是剝除者),
//     而 Linux 上 'system' 會跟著 SSL_CERT_FILE / SSL_CERT_DIR 走、Node 讀過一次就快取 —— 所以系統庫**不在本行程讀**,
//     改由一支環境清空(env = {})的同版 Node 子行程讀 `tls.getCACertificates('system')` 後回傳
//    (readSystemTrustAnchorsWithoutEnvironment;API added v23.10.0 / v22.15.0,文件:「This can be used to get the
//     certificates from the system when --use-system-ca is not enabled」,
//     https://nodejs.org/docs/latest-v22.x/api/tls.html#tlsgetcacertificatestype)。'bundled' 是編進 Node 的,不受環境影響,
//     在本行程讀。不用 'default',因為它含 NODE_EXTRA_CA_CERTS(環境變數)。父子兩端因此是同一組錨,兩端都不受 CA 環境變數影響。
//     下載內容的完整性邊界照舊是 committed lock 的 SHA-512,TLS 錨只決定連不連得上。
//   · 同一個入口也給 Playwright 的瀏覽器下載(scripts/ensure-playwright-browsers.mjs):它的 CLI 以 child_process.fork()
//     開下載子行程、不帶 options,依 Node 文件 fork 的 execArgv 預設 = process.execArgv,`--use-system-ca` 會傳下去
//    (https://nodejs.org/docs/latest-v22.x/api/child_process.html#child_processforkmodulepath-args-options)。
//   · 兩個能力同時具備的 Node:22.15.0+ 的 22.x、23.10.0+ 的 23.x、24 以上。契約最低版(22.13.0)到 22.14.x 沒有它們,
//     那一段照舊只信內建 bundle(與修前相同,遇到重新簽的 TLS 仍連不上)。**不抬高契約最低版**:consumer 的
//     package.json 與 lock 的 engines 必須逐字等於 `>=minimumNodeVersion`(fork/consumer/governance-check.mjs GOV-RUNTIME-001、
//     refresh-fork-launchers.mjs、setup-governance.mjs),而沒有任何升級程式會改寫 consumer 的 engines;抬高 = 每個既有
//     consumer 升級後 sync-all / setup:all / governance:check 一起紅。要在重新簽 TLS 的主機用,文件寫明 Node 22.15.0+。
// 呼叫端一律經 verifiedNpmNodeArgv() / verifiedNodeTrustArgs() 組 argv,不得自己拼 `[cli, ...args]`(同一條規則只住一處)。
export const VERIFIED_NODE_TLS_TRUST_ARGS = Object.freeze(['--use-system-ca'])
const SYSTEM_TRUST_STORE_FLOORS = Object.freeze({ 22: Object.freeze([15, 0]), 23: Object.freeze([10, 0]) })
const SYSTEM_TRUST_ANCHOR_READER = "import { getCACertificates } from 'node:tls'\nprocess.stdout.write(JSON.stringify(getCACertificates('system')))\n"

/** 純函式:這個 Node 版本能不能讀主機系統憑證庫(`--use-system-ca` 三平台 + `tls.getCACertificates`)。 */
export function nodeReadsSystemTrustStore(nodeVersion = process.versions.node) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(nodeVersion))
  if (!match) return false
  const [major, minor, patch] = match.slice(1).map(Number)
  if (major >= 24) return true
  const floor = SYSTEM_TRUST_STORE_FLOORS[major]
  if (!floor) return false
  return minor > floor[0] || (minor === floor[0] && patch >= floor[1])
}

export function verifiedNodeTrustArgs(nodeVersion = process.versions.node) {
  return nodeReadsSystemTrustStore(nodeVersion) ? [...VERIFIED_NODE_TLS_TRUST_ARGS] : []
}

/** 鎖定 npm 子行程的 node argv;子行程一律是 process.execPath(與本行程同一支 Node),所以以本行程版本判定。 */
export function verifiedNpmNodeArgv(cli, args = [], { nodeVersion = process.versions.node } = {}) {
  invariant(typeof cli === 'string' && cli.length > 0, 'verified npm CLI path is missing')
  invariant(Array.isArray(args) && args.every((value) => typeof value === 'string'), 'verified npm argv must be an array of strings')
  return [...verifiedNodeTrustArgs(nodeVersion), cli, ...args]
}

/**
 * 主機系統憑證庫,由一支環境清空的同版 Node 子行程讀出(Linux 的 SSL_CERT_FILE / SSL_CERT_DIR 因此不可能混進來;
 * 子行程也不繼承本行程的 execArgv)。回傳 PEM 陣列;讀不到一律 fail closed。
 */
export function readSystemTrustAnchorsWithoutEnvironment({ runner = spawnSync, execPath = process.execPath } = {}) {
  const result = runner(execPath, ['--input-type=module', '--eval', SYSTEM_TRUST_ANCHOR_READER], {
    env: {},
    shell: false,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  })
  invariant(!result?.error && result?.status === 0, `system trust store read failed:${result?.error?.message || result?.signal || result?.status}`)
  let anchors
  try {
    anchors = JSON.parse(String(result.stdout || ''))
  } catch {
    invariant(false, 'system trust store read returned invalid JSON')
  }
  invariant(Array.isArray(anchors) && anchors.every((pem) => typeof pem === 'string' && pem.includes('-----BEGIN CERTIFICATE-----')), 'system trust store read returned non-PEM data')
  return anchors
}

let cachedSystemTrustAnchors
function cachedSystemTrustAnchorsWithoutEnvironment() {
  cachedSystemTrustAnchors ??= Object.freeze(readSystemTrustAnchorsWithoutEnvironment())
  return cachedSystemTrustAnchors
}

/** 本行程下載用的 `ca`;Node 讀不到系統庫時回 undefined(沿用 Node 預設,與修前相同)。 */
export function verifiedRegistryTrustAnchors({
  tlsModule = tls,
  nodeVersion = process.versions.node,
  readSystemAnchors = cachedSystemTrustAnchorsWithoutEnvironment,
} = {}) {
  if (!nodeReadsSystemTrustStore(nodeVersion)) return undefined
  invariant(typeof tlsModule?.getCACertificates === 'function', 'tls.getCACertificates is unavailable on a Node.js release that should provide it')
  const bundled = tlsModule.getCACertificates('bundled')
  const system = readSystemAnchors()
  invariant(Array.isArray(bundled) && bundled.length > 0 && Array.isArray(system), 'Node.js TLS trust anchors are unavailable')
  return Object.freeze([...new Set([...bundled, ...system])])
}

// ── 代理轉送(2026-11-26,下游 Claude Code 雲端 setup:all:npm ci 成功後 audit signatures → ENOTFOUND tuf-repo-cdn.sigstore.dev)──
// 雲端 VM 的對外流量只能經安全代理(HTTPS_PROXY 有設、網址不帶帳密;NO_PROXY 含 registry.npmjs.org,registry 可直接解析,
// sigstore 不行)。鎖定安裝鏈原本把所有代理變數當成不可信剝除(governance-dependency-bootstrap.mjs 的 HOSTILE_NAME),
// 於是 registry 以外的主機在那種主機上一律解析不到。要保證的性質(M37,判斷的是性質本身,不是變數名):
//   「代理網址不帶帳密」→ 只用來路由,不新增任何信任錨(TLS 仍只信內建 bundle + 系統憑證庫,見上一段);
//   帶帳密 / 無法解析 / scheme 不是 http(s) → 照舊剝除,並印一行原因(只印原因與變數名,不印值)。
// 判定只住這一支純函式;鎖定 npm 子行程的環境(sanitizeGovernanceBootstrapEnvironment)與本行程的下載(downloadCanonicalRegistryTarball)
// 都呼叫它,兩端對同一個主機做同一個路由決定。
//   · npm 怎麼讀代理(npm 11.19.0 內建原始碼,node_modules/npm/node_modules/…):
//     - @npmcli/agent 4.0.2 lib/proxy.js:13-21 把 process.env 的鍵**轉小寫**後收 https_proxy / http_proxy / proxy / no_proxy
//      (大小寫並存時誰贏取決於 process.env 列舉順序,不可預期);:64-75 沒有傳入 proxy / noProxy 選項時,https 目標只讀 https_proxy、
//       noProxy 讀 no_proxy;:37-62 NO_PROXY 是「逗號分隔、以 . 切段、由右往左逐段相等」的後綴比對(不認 `*`、不看埠)。
//     - npm-registry-fetch lib/index.js:123-124 傳 `proxy: opts.httpsProxy || opts.proxy`、`noProxy: opts.noProxy`;
//       https-proxy 預設 null、noproxy 預設 ''(@npmcli/config lib/definitions/definitions.js:972-982、:1574-1591),所以回落到環境變數。
//     - audit signatures 的 TUF 下載:npm lib/utils/verify-signatures.js:37-41 呼叫 initTUF 只傳 cachePath / retry / timeout,
//       tuf-js 4.1.0 dist/fetcher.js:67-75 以 make-fetch-happen 抓、不傳代理;make-fetch-happen 15.0.6 lib/remote.js:40
//       getAgent(url, options) → 同一支 proxy.js 回落到環境變數。**npmrc 的 https-proxy 到不了 TUF 這條路**,所以只用環境變數,不寫 npmrc
//      (兩個來源只會漂移)。
//   · 大小寫衝突:照 curl 慣例(先讀小寫 https_proxy / no_proxy,沒有才讀大寫;curl 為安全不讀大寫 HTTP_PROXY,這裡本來就不轉送 http_proxy)。
//     npm 本身沒有定義的先後,所以轉送時只留一個名字(HTTPS_PROXY / NO_PROXY),子行程不會再看到兩個互相衝突的值。
//   · 其他代理名(ALL_PROXY / HTTP_PROXY / proxy / NOPROXY,與上述任何大小寫混寫的變體)一律剝除:@npmcli/agent 不分大小寫讀,
//     剝除也必須不分大小寫,否則 `Https_Proxy` 會繞過這支判定直接進 npm。
export const GOVERNANCE_FORWARDED_PROXY_NAME = 'HTTPS_PROXY'
export const GOVERNANCE_FORWARDED_NO_PROXY_NAME = 'NO_PROXY'
const GOVERNANCE_PROXY_FAMILY = new Set(['https_proxy', 'http_proxy', 'proxy', 'all_proxy', 'no_proxy', 'noproxy'])
export const GOVERNANCE_PROXY_DROP_REASONS = Object.freeze({
  credentials: '帶帳密',
  unparseable: '無法解析',
  'unsupported-scheme': 'scheme 不支援',
})

/** 純函式:這個環境變數名是不是代理設定(不分大小寫;@npmcli/agent proxy.js:15-21 就是不分大小寫讀的)。 */
export function isGovernanceProxyFamilyName(name) {
  return typeof name === 'string' && GOVERNANCE_PROXY_FAMILY.has(name.toLowerCase())
}

function firstNonEmpty(environment, names) {
  for (const name of names) {
    const value = environment?.[name]
    if (typeof value === 'string' && value.trim() !== '') return Object.freeze({ name, value: value.trim() })
  }
  return null
}

function caseConflict(environment, lower, upper) {
  const a = environment?.[lower]
  const b = environment?.[upper]
  return typeof a === 'string' && a.trim() !== '' && typeof b === 'string' && b.trim() !== '' && a.trim() !== b.trim()
}

/**
 * 純函式(判定表在 scripts/test-verified-exact-npm-runtime.mjs):從環境決定鎖定安裝鏈要轉送的代理設定。
 * 回傳 `forwarded`(要放進子行程環境的鍵值,只會有 HTTPS_PROXY / NO_PROXY)、`proxy`(路由用,不含值以外的祕密)、
 * `noProxy`、`notices`(要印的原因;不含值)。
 */
export function resolveGovernanceProxyForwarding(environment = process.env) {
  const notices = []
  if (caseConflict(environment, 'https_proxy', 'HTTPS_PROXY')) notices.push(Object.freeze({ kind: 'case-conflict', chosen: 'https_proxy', ignored: 'HTTPS_PROXY' }))
  if (caseConflict(environment, 'no_proxy', 'NO_PROXY')) notices.push(Object.freeze({ kind: 'case-conflict', chosen: 'no_proxy', ignored: 'NO_PROXY' }))
  const candidate = firstNonEmpty(environment, ['https_proxy', 'HTTPS_PROXY'])
  const result = (proxy, reason) => {
    if (reason) notices.push(Object.freeze({ kind: 'dropped', name: candidate.name, reason, label: GOVERNANCE_PROXY_DROP_REASONS[reason] }))
    let noProxy = null
    if (proxy) {
      const noProxyCandidate = firstNonEmpty(environment, ['no_proxy', 'NO_PROXY'])
      if (noProxyCandidate) {
        // 含控制字元(U+0000–U+001F、U+007F)的 NO_PROXY 不轉送;逐字元比字元碼,不用控制字元正規式(免 lint 豁免)
        if ([...noProxyCandidate.value].some((ch) => { const code = ch.charCodeAt(0); return code < 0x20 || code === 0x7f })) {
          notices.push(Object.freeze({ kind: 'dropped', name: noProxyCandidate.name, reason: 'unparseable', label: GOVERNANCE_PROXY_DROP_REASONS.unparseable }))
        } else {
          noProxy = Object.freeze({ source: noProxyCandidate.name, value: noProxyCandidate.value })
        }
      }
      notices.push(Object.freeze({ kind: 'forwarded', name: candidate.name, scheme: proxy.protocol, noProxySource: noProxy?.source || null }))
    }
    const forwarded = {}
    if (proxy) forwarded[GOVERNANCE_FORWARDED_PROXY_NAME] = proxy.origin
    if (noProxy) forwarded[GOVERNANCE_FORWARDED_NO_PROXY_NAME] = noProxy.value
    return Object.freeze({
      forwarded: Object.freeze(forwarded),
      proxy,
      noProxy: noProxy?.value ?? null,
      notices: Object.freeze(notices),
    })
  }
  if (!candidate) return result(null, null)
  let parsed
  try {
    parsed = new URL(candidate.value)
  } catch {
    return result(null, 'unparseable')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return result(null, 'unsupported-scheme')
  if (parsed.username !== '' || parsed.password !== '') return result(null, 'credentials')
  if (!parsed.hostname) return result(null, 'unparseable')
  return result(Object.freeze({
    source: candidate.name,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)),
    origin: parsed.origin,
  }), null)
}

/** 純函式:把 notices 變成要印的行(只印變數名、原因、scheme、有無;不印任何值)。 */
export function formatGovernanceProxyNotices(forwarding) {
  return (forwarding?.notices || []).map((notice) => {
    if (notice.kind === 'case-conflict') {
      return `ℹ️  GOV-PROXY-FORWARD:${notice.chosen} 與 ${notice.ignored} 同時存在且不同,照 curl 慣例取小寫 ${notice.chosen}(${notice.ignored} 不轉送)`
    }
    if (notice.kind === 'dropped') {
      return `ℹ️  GOV-PROXY-FORWARD:${notice.name} ${notice.label},鎖定安裝鏈不轉送(照舊剝除)`
    }
    return `ℹ️  GOV-PROXY-FORWARD:鎖定安裝鏈轉送 ${GOVERNANCE_FORWARDED_PROXY_NAME}(來源 ${notice.name},scheme=${notice.scheme},帳密=無)`
      + `、${GOVERNANCE_FORWARDED_NO_PROXY_NAME}=${notice.noProxySource ? `有(來源 ${notice.noProxySource})` : '無'};只用來路由,TLS 仍只信內建 + 系統憑證庫`
  })
}

const reportedProxyNotices = new Set()
/** 每個行程同一行只印一次(剝除在一次 setup 裡會被呼叫好幾次);印到 stderr,stdout 保持機器通道。 */
export function reportGovernanceProxyNoticesOnce(forwarding, report = (line) => console.error(line)) {
  for (const line of formatGovernanceProxyNotices(forwarding)) {
    if (reportedProxyNotices.has(line)) continue
    reportedProxyNotices.add(line)
    report(line)
  }
}

/**
 * 純函式:NO_PROXY 命中。**逐字照 @npmcli/agent 4.0.2 lib/proxy.js:37-62**(鎖定 npm 子行程就是用它判定),
 * 讓本行程的下載與子行程的 npm 對同一個主機做同一個決定:逗號分隔、去空白、以 . 切段後由右往左逐段相等;
 * 不認 `*`、不看埠;IPv6 主機名照 WHATWG URL 帶中括號比對。
 */
export function matchesGovernanceNoProxy(hostname, noProxy) {
  const entries = typeof noProxy === 'string'
    ? noProxy.split(',').map((entry) => entry.trim()).filter(Boolean)
    : []
  if (!entries.length) return false
  const hostSegments = String(hostname).split('.').reverse()
  return entries.some((entry) => {
    const segments = entry.split('.').filter(Boolean).reverse()
    if (!segments.length) return false
    for (let index = 0; index < segments.length; index += 1) {
      if (hostSegments[index] !== segments[index]) return false
    }
    return true
  })
}

/** 純函式:這個目標網址在這個環境下走直連或經代理 CONNECT。 */
export function resolveGovernanceProxyRoute(targetUrl, environment = process.env) {
  const target = new URL(targetUrl)
  const forwarding = resolveGovernanceProxyForwarding(environment)
  if (!forwarding.proxy) return Object.freeze({ mode: 'direct', reason: 'no-forwarded-proxy', forwarding })
  if (matchesGovernanceNoProxy(target.hostname, forwarding.noProxy)) return Object.freeze({ mode: 'direct', reason: 'no-proxy-match', forwarding })
  return Object.freeze({ mode: 'connect', proxy: forwarding.proxy, forwarding })
}

function unbracketHost(hostname) {
  return String(hostname).replace(/^\[(.*)\]$/, '$1')
}

/**
 * 經不帶帳密的代理開 HTTP CONNECT 隧道,再在隧道上以**同一組 ca** 做 TLS(憑證主機名照目標驗)。
 * 代理只拿到加密後的位元組,不新增任何信任錨;代理本身是 https: 時,連代理的 TLS 也用同一組 ca。
 */
export function openGovernanceProxyTunnel({
  proxy,
  host,
  port = 443,
  ca,
  timeoutMs = 30_000,
  label = 'canonical registry',
} = {}) {
  invariant(proxy && (proxy.protocol === 'http:' || proxy.protocol === 'https:') && proxy.hostname, `${label} proxy route is invalid`)
  invariant(typeof host === 'string' && host.length > 0 && Number.isInteger(port) && port > 0 && port < 65_536, `${label} tunnel target is invalid`)
  const targetHost = unbracketHost(host)
  const authority = isIP(targetHost) === 6 ? `[${targetHost}]:${port}` : `${targetHost}:${port}`
  const proxyHost = unbracketHost(proxy.hostname)
  const connectRequest = proxy.protocol === 'https:' ? request : httpRequest
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    let tunnelSocket = null
    let secureSocket = null
    let handle = null
    // 任何失敗都把隧道、TLS 與 CONNECT 請求一起收掉,不留開著的 socket 或計時器(失敗必須立刻變成 reject,不得掛著)。
    const fail = (error) => {
      if (settled) return
      settled = true
      secureSocket?.destroy()
      tunnelSocket?.destroy()
      handle?.destroy()
      rejectPromise(error instanceof Error ? error : new Error(String(error)))
    }
    handle = connectRequest({
      host: proxyHost,
      port: proxy.port,
      method: 'CONNECT',
      path: authority,
      headers: { Host: authority },
      agent: false,
      ...(proxy.protocol === 'https:' ? { ...(ca ? { ca } : {}), ...(isIP(proxyHost) ? {} : { servername: proxyHost }) } : {}),
    })
    handle.setTimeout(timeoutMs, () => handle.destroy(new Error(`GOV-NPM-RUNTIME-001:${label} download timed out(proxy CONNECT)`)))
    handle.on('error', fail)
    handle.on('connect', (response, socket, head) => {
      tunnelSocket = socket
      if (response.statusCode !== 200) {
        fail(new Error(`GOV-NPM-RUNTIME-001:${label} proxy CONNECT returned HTTP ${response.statusCode}`))
        return
      }
      if (head?.length) socket.unshift(head)
      const secure = secureSocket = tls.connect({
        socket,
        host: targetHost,
        ...(isIP(targetHost) ? {} : { servername: targetHost }),
        ...(ca ? { ca } : {}),
        ALPNProtocols: ['http/1.1'],
      })
      secure.once('secureConnect', () => {
        if (settled) { secure.destroy(); return }
        settled = true
        handle.setTimeout(0)
        resolvePromise(secure)
      })
      secure.once('error', fail)
    })
    handle.end()
  })
}

function regularUnaliasedFile(path, label) {
  try {
    const absolute = resolve(path)
    const info = lstatSync(absolute)
    invariant(
      info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(absolute) === absolute,
      `${label} must be one regular file with no link ancestry`,
    )
    return absolute
  } catch (error) {
    if (String(error?.message || '').startsWith('GOV-NPM-RUNTIME-001:')) throw error
    throw new Error(`GOV-NPM-RUNTIME-001:${label} is missing or unreadable:${error?.message || error}`)
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(regularUnaliasedFile(path, label), 'utf8'))
  } catch (error) {
    if (String(error?.message || '').startsWith('GOV-NPM-RUNTIME-001:')) throw error
    throw new Error(`GOV-NPM-RUNTIME-001:${label} is invalid JSON:${error?.message || error}`)
  }
}

function integrityBytes(integrity) {
  const match = String(integrity || '').match(SHA512_INTEGRITY)
  invariant(match, 'npm lock artifact is missing canonical SHA-512 integrity')
  const bytes = Buffer.from(match[1], 'base64')
  invariant(bytes.length === 64 && bytes.toString('base64') === match[1], 'npm lock SHA-512 integrity is not canonical base64')
  return bytes
}

function npmRuntimeOverlayIdentity(value) {
  return createHash('sha256').update(JSON.stringify({
    schemaVersion: 1,
    kind: 'verified-npm-runtime-security-overlay',
    npmVersion: value.npmVersion,
    alias: value.alias,
    package: value.package,
    version: value.version,
    resolved: value.resolved,
    integrity: value.integrity,
    target: value.target,
    replacedVersion: value.replacedVersion,
    consumer: value.consumer,
    consumerVersion: value.consumerVersion,
    consumerDependencyRange: value.consumerDependencyRange,
    secondaryAlias: value.secondaryAlias,
    secondaryPackage: value.secondaryPackage,
    secondaryVersion: value.secondaryVersion,
    secondaryResolved: value.secondaryResolved,
    secondaryIntegrity: value.secondaryIntegrity,
    secondaryTarget: value.secondaryTarget,
    secondaryReplacedVersion: value.secondaryReplacedVersion,
  })).digest('hex')
}

export function resolveExactNpmArtifact(repositoryRoot) {
  const root = realpathSync(resolve(repositoryRoot))
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'repository root must be one real directory')
  const manifest = readJson(join(root, 'package.json'), 'package.json')
  const lock = readJson(join(root, 'package-lock.json'), 'package-lock.json')
  invariant(lock.lockfileVersion === 3 && lock.packages && typeof lock.packages === 'object' && !Array.isArray(lock.packages), 'package-lock.json must use lockfileVersion 3')
  const lockedRoot = lock.packages['']
  invariant(lockedRoot && typeof lockedRoot === 'object' && !Array.isArray(lockedRoot), 'package-lock.json root record is missing')
  const declarations = [
    ['dependencies', manifest?.dependencies?.npm, lockedRoot?.dependencies?.npm],
    ['devDependencies', manifest?.devDependencies?.npm, lockedRoot?.devDependencies?.npm],
  ].filter(([, declared]) => declared !== undefined)
  invariant(declarations.length === 1, 'npm must be pinned in exactly one dependency bucket')
  const [bucket, version, lockedVersion] = declarations[0]
  invariant(EXACT_STABLE_VERSION.test(version || ''), `${bucket}.npm must pin one exact stable version`)
  invariant(lockedVersion === version, `package-lock.json root ${bucket}.npm differs from package.json`)
  const entry = lock.packages['node_modules/npm']
  const resolved = `${NPM_REGISTRY_ORIGIN}/npm/-/npm-${version}.tgz`
  invariant(entry?.link !== true && entry?.version === version, 'package-lock.json npm artifact is missing or not exact')
  invariant(entry.resolved === resolved, 'package-lock.json npm artifact is not the canonical registry tarball')
  integrityBytes(entry.integrity)
  invariant(entry.bin?.npm === 'bin/npm-cli.js', 'package-lock.json npm artifact does not bind bin/npm-cli.js')
  return Object.freeze({ integrity: entry.integrity, resolved, version })
}

export function resolveExactNpmRuntimeContract(repositoryRoot, { historicalOverlay = false } = {}) {
  const root = realpathSync(resolve(repositoryRoot))
  const npmArtifact = resolveExactNpmArtifact(root)
  invariant(npmArtifact.version === '11.19.0', 'npm security overlay is not certified for this exact npm version')
  const manifest = readJson(join(root, 'package.json'), 'package.json')
  const lock = readJson(join(root, 'package-lock.json'), 'package-lock.json')
  const declaredOverlaySpec = manifest?.devDependencies?.[NPM_RUNTIME_OVERLAY_ALIAS]
  const overlayVersion = declaredOverlaySpec === NPM_RUNTIME_OVERLAY_SPEC
    ? NPM_RUNTIME_OVERLAY_VERSION
    : (historicalOverlay && NPM_RUNTIME_OVERLAY_HISTORICAL_VERSIONS.find((version) => declaredOverlaySpec === overlaySpecFor(version))) || null
  const overlaySpec = overlayVersion ? overlaySpecFor(overlayVersion) : NPM_RUNTIME_OVERLAY_SPEC
  invariant(
    manifest?.devDependencies?.[NPM_RUNTIME_OVERLAY_ALIAS] === overlaySpec
      && manifest?.devDependencies?.[NPM_RUNTIME_SECONDARY_OVERLAY_ALIAS] === NPM_RUNTIME_SECONDARY_OVERLAY_SPEC
      && manifest?.dependencies?.[NPM_RUNTIME_OVERLAY_ALIAS] === undefined
      && manifest?.dependencies?.[NPM_RUNTIME_SECONDARY_OVERLAY_ALIAS] === undefined,
    `package.json must pin the exact dev-only npm security overlay aliases`,
  )
  const lockedRoot = lock.packages?.['']
  invariant(
    lockedRoot?.devDependencies?.[NPM_RUNTIME_OVERLAY_ALIAS] === overlaySpec
      && lockedRoot?.devDependencies?.[NPM_RUNTIME_SECONDARY_OVERLAY_ALIAS] === NPM_RUNTIME_SECONDARY_OVERLAY_SPEC
      && lockedRoot?.dependencies?.[NPM_RUNTIME_OVERLAY_ALIAS] === undefined
      && lockedRoot?.dependencies?.[NPM_RUNTIME_SECONDARY_OVERLAY_ALIAS] === undefined,
    `package-lock.json root must pin the exact dev-only npm security overlay aliases`,
  )
  const entry = lock.packages?.[`node_modules/${NPM_RUNTIME_OVERLAY_ALIAS}`]
  const resolved = `${NPM_REGISTRY_ORIGIN}/${NPM_RUNTIME_OVERLAY_PACKAGE}/-/${NPM_RUNTIME_OVERLAY_PACKAGE}-${overlayVersion}.tgz`
  invariant(
    entry?.link !== true
      && entry?.name === NPM_RUNTIME_OVERLAY_PACKAGE
      && entry?.version === overlayVersion
      && entry?.resolved === resolved,
    'package-lock.json npm security overlay artifact is missing or not the canonical registry tarball',
  )
  integrityBytes(entry.integrity)
  const secondaryEntry = lock.packages?.[`node_modules/${NPM_RUNTIME_SECONDARY_OVERLAY_ALIAS}`]
  const secondaryResolved = `${NPM_REGISTRY_ORIGIN}/${NPM_RUNTIME_SECONDARY_OVERLAY_PACKAGE}/-/${NPM_RUNTIME_SECONDARY_OVERLAY_PACKAGE}-${NPM_RUNTIME_SECONDARY_OVERLAY_VERSION}.tgz`
  invariant(
    secondaryEntry?.link !== true
      && secondaryEntry?.name === NPM_RUNTIME_SECONDARY_OVERLAY_PACKAGE
      && secondaryEntry?.version === NPM_RUNTIME_SECONDARY_OVERLAY_VERSION
      && secondaryEntry?.resolved === secondaryResolved,
    'package-lock.json secondary npm security overlay artifact is missing or not the canonical registry tarball',
  )
  integrityBytes(secondaryEntry.integrity)
  const securityOverlay = {
    alias: NPM_RUNTIME_OVERLAY_ALIAS,
    package: NPM_RUNTIME_OVERLAY_PACKAGE,
    version: overlayVersion,
    resolved,
    integrity: entry.integrity,
    npmVersion: npmArtifact.version,
    target: NPM_RUNTIME_OVERLAY_TARGET,
    replacedVersion: NPM_RUNTIME_OVERLAY_REPLACED_VERSION,
    consumer: NPM_RUNTIME_OVERLAY_CONSUMER,
    consumerVersion: NPM_RUNTIME_OVERLAY_CONSUMER_VERSION,
    consumerDependencyRange: NPM_RUNTIME_OVERLAY_CONSUMER_RANGE,
    secondaryAlias: NPM_RUNTIME_SECONDARY_OVERLAY_ALIAS,
    secondaryPackage: NPM_RUNTIME_SECONDARY_OVERLAY_PACKAGE,
    secondaryVersion: NPM_RUNTIME_SECONDARY_OVERLAY_VERSION,
    secondaryResolved,
    secondaryIntegrity: secondaryEntry.integrity,
    secondaryTarget: NPM_RUNTIME_SECONDARY_OVERLAY_TARGET,
    secondaryReplacedVersion: NPM_RUNTIME_SECONDARY_OVERLAY_REPLACED_VERSION,
  }
  securityOverlay.identityDigest = npmRuntimeOverlayIdentity(securityOverlay)
  return Object.freeze({
    ...npmArtifact,
    securityOverlay: Object.freeze(securityOverlay),
  })
}

async function downloadCanonicalRegistryTarball(url, {
  label,
  pathPattern,
  timeoutMs = 30_000,
  trustAnchors = verifiedRegistryTrustAnchors,
  environment = process.env,
  openTunnel = openGovernanceProxyTunnel,
} = {}) {
  const target = new URL(url)
  invariant(
    target.protocol === 'https:'
      && target.origin === NPM_REGISTRY_ORIGIN
      && !target.username
      && !target.password
      && !target.port
      && !target.search
      && !target.hash
      && pathPattern.test(target.pathname),
    `${label} tarball URL is outside the canonical registry contract`,
  )
  const ca = trustAnchors()
  // 路由與鎖定 npm 子行程同一支判定(resolveGovernanceProxyRoute):主機在 NO_PROXY → 直連;否則經不帶帳密的代理 CONNECT,
  // 隧道上的 TLS 仍以同一組 ca 驗 registry 的憑證。完整性邊界照舊是 lock 的 SHA-512。
  const route = resolveGovernanceProxyRoute(target.href, environment)
  const tunnel = route.mode === 'connect'
    ? await openTunnel({ proxy: route.proxy, host: target.hostname, port: 443, ca, timeoutMs, label })
    : null
  return await new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      tunnel?.destroy()
      rejectPromise(error instanceof Error ? error : new Error(String(error)))
    }
    const requestHandle = request(target, {
      method: 'GET',
      ...(ca ? { ca } : {}),
      ...(tunnel ? { createConnection: () => tunnel } : {}),
      headers: {
        Accept: 'application/octet-stream',
        'Accept-Encoding': 'identity',
        'User-Agent': 'qijenchen-verified-npm-runtime/1',
      },
    }, (response) => {
      const status = response.statusCode || 0
      if (status !== 200) {
        response.resume()
        fail(new Error(`GOV-NPM-RUNTIME-001:${label} download returned HTTP ${status}; redirects are forbidden`))
        return
      }
      const contentEncoding = String(response.headers['content-encoding'] || 'identity').toLowerCase()
      if (contentEncoding !== 'identity') {
        response.resume()
        fail(new Error(`GOV-NPM-RUNTIME-001:${label} download used unexpected content encoding:${contentEncoding}`))
        return
      }
      const contentLength = Number(response.headers['content-length'] || 0)
      if (contentLength && (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > MAX_COMPRESSED_BYTES)) {
        response.resume()
        fail(new Error(`GOV-NPM-RUNTIME-001:${label} download length exceeds the closed archive budget`))
        return
      }
      const chunks = []
      let length = 0
      response.on('data', (chunk) => {
        length += chunk.length
        if (length > MAX_COMPRESSED_BYTES) {
          response.destroy(new Error(`GOV-NPM-RUNTIME-001:${label} download exceeded the closed archive budget`))
          return
        }
        chunks.push(chunk)
      })
      response.on('error', fail)
      response.on('end', () => {
        if (settled) return
        if (contentLength && length !== contentLength) {
          fail(new Error(`GOV-NPM-RUNTIME-001:${label} download length differs from Content-Length`))
          return
        }
        if (length === 0) {
          fail(new Error(`GOV-NPM-RUNTIME-001:${label} download is empty`))
          return
        }
        settled = true
        resolvePromise(Buffer.concat(chunks, length))
      })
    })
    requestHandle.setTimeout(timeoutMs, () => requestHandle.destroy(new Error(`GOV-NPM-RUNTIME-001:${label} download timed out`)))
    requestHandle.on('error', fail)
    requestHandle.end()
  })
}

// 2026-09-29(ab9a4e1a 那一輪:governance control plane job 在任何閘之前死在「canonical npm download timed out」,
// PAT 沒有 actions:write 不能重跑;與 09-24 `npm audit` 的 ECONNRESET 同一族)。只對**暫時性傳輸失敗**重試 ——
// 逾時、連線被重設／拒絕、DNS 暫時失敗、socket hang up、上游 502/503/504 —— 上限 3 次、退避 2s/4s;
// 契約失敗(非 canonical origin / 重導向 / 內容編碼 / 超出封閉預算 / 長度不符 / 空檔)一律不重試,用盡仍 fail closed、
// 訊息帶 attempts。下載回來的位元組仍走原本的 SHA-512 / lock digest 驗證,重試不放寬任何完整性檢查。
// 判定抽成純函式 `isTransientRegistryDownloadFailure`,測試兩面對照(該重試的、不該重試的)。
export const NPM_RUNTIME_DOWNLOAD_RETRY_LIMIT = 3
export const NPM_RUNTIME_DOWNLOAD_BACKOFF_MS = 2_000
const TRANSIENT_DOWNLOAD_REASON = /download timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE|socket hang up|download returned HTTP 50[234]\b/i
const CONTRACT_DOWNLOAD_REASON = /outside the canonical registry contract|unexpected content encoding|closed archive budget|differs from Content-Length|download is empty/i
export function isTransientRegistryDownloadFailure(error) {
  const text = String(error?.message || '')
  return TRANSIENT_DOWNLOAD_REASON.test(text) && !CONTRACT_DOWNLOAD_REASON.test(text)
}

export async function downloadWithTransientRetry(attempt, {
  label = 'canonical registry',
  retryLimit = NPM_RUNTIME_DOWNLOAD_RETRY_LIMIT,
  backoffMs = NPM_RUNTIME_DOWNLOAD_BACKOFF_MS,
  sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
  report = (line) => console.error(line),
} = {}) {
  invariant(typeof attempt === 'function', `${label} download attempt must be a function`)
  invariant(Number.isInteger(retryLimit) && retryLimit >= 1, `${label} download retry limit must be a positive integer`)
  for (let attemptNumber = 1; ; attemptNumber += 1) {
    try {
      return await attempt(attemptNumber)
    } catch (error) {
      if (!isTransientRegistryDownloadFailure(error)) throw error
      if (attemptNumber >= retryLimit) {
        throw new Error(`${String(error?.message || error)}(after ${attemptNumber} attempts)`)
      }
      const wait = backoffMs * attemptNumber
      report(`⚠️  GOV-NPM-RUNTIME-001:${label} download transient failure(attempt ${attemptNumber}/${retryLimit}),retrying in ${wait}ms:${String(error?.message || error).slice(0, 240)}`)
      await sleep(wait)
    }
  }
}

export async function downloadCanonicalNpmTarball(url, { timeoutMs = 30_000, retryLimit, backoffMs, sleep, report, environment, openTunnel } = {}) {
  return downloadWithTransientRetry(() => downloadCanonicalRegistryTarball(url, {
    label: 'canonical npm',
    pathPattern: /^\/npm\/-\/npm-\d+\.\d+\.\d+\.tgz$/,
    timeoutMs,
    ...(environment === undefined ? {} : { environment }),
    ...(openTunnel === undefined ? {} : { openTunnel }),
  }), { label: 'canonical npm', retryLimit, backoffMs, sleep, report })
}

export async function downloadCanonicalNpmSecurityOverlayTarball(url, { timeoutMs = 30_000, retryLimit, backoffMs, sleep, report, environment, openTunnel } = {}) {
  return downloadWithTransientRetry(() => downloadCanonicalRegistryTarball(url, {
    label: 'canonical npm security overlay',
    pathPattern: /^\/(?:brace-expansion\/-\/brace-expansion-5\.0\.(?:12|9)|tar\/-\/tar-7\.5\.22)\.tgz$/,
    timeoutMs,
    ...(environment === undefined ? {} : { environment }),
    ...(openTunnel === undefined ? {} : { openTunnel }),
  }), { label: 'canonical npm security overlay', retryLimit, backoffMs, sleep, report })
}

function decodeTarField(header, offset, length, label) {
  const field = header.subarray(offset, offset + length)
  const terminator = field.indexOf(0)
  const bytes = terminator === -1 ? field : field.subarray(0, terminator)
  if (terminator !== -1) invariant(field.subarray(terminator).every((byte) => byte === 0), `${label} has nonzero bytes after NUL`)
  let value
  try { value = textDecoder.decode(bytes) } catch { throw new Error(`GOV-NPM-RUNTIME-001:${label} is not valid UTF-8`) }
  invariant(!/[\u0000-\u001f\u007f]/u.test(value), `${label} contains control characters`)
  return value
}

function parseTarOctal(header, offset, length, label, { allowEmpty = false } = {}) {
  const raw = header.subarray(offset, offset + length).toString('ascii').replace(/[\0 ]+$/u, '').replace(/^ +/u, '')
  if (!raw && allowEmpty) return 0
  invariant(/^[0-7]+$/.test(raw), `${label} is not canonical octal`)
  const value = Number.parseInt(raw, 8)
  invariant(Number.isSafeInteger(value) && value >= 0, `${label} exceeds the safe integer range`)
  return value
}

function portablePathKey(value) {
  return value.split('/').map((segment) => segment.normalize('NFC').toLocaleLowerCase('en-US').normalize('NFC')).join('/')
}

function canonicalArchivePath(value, label) {
  invariant(value.length > 0 && Buffer.byteLength(value) <= MAX_ARCHIVE_PATH_BYTES, `${label} exceeds the closed path budget`)
  invariant(!value.startsWith('/') && !value.includes('\\') && !value.includes('//'), `${label} is not a portable relative path`)
  const parts = value.split('/')
  invariant(parts.every((part) => part && part !== '.' && part !== '..'), `${label} contains traversal segments`)
  invariant(parts[0] === 'package' && parts.length > 1, `${label} must live below the package/ archive root`)
  return value
}

function parseClosedUstar(tarBytes) {
  invariant(Buffer.isBuffer(tarBytes) && tarBytes.length >= TAR_BLOCK_SIZE * 2 && tarBytes.length % TAR_BLOCK_SIZE === 0, 'decompressed npm archive is not block-aligned ustar')
  invariant(tarBytes.length <= MAX_UNCOMPRESSED_BYTES, 'decompressed npm archive exceeds the closed size budget')
  const entries = []
  const paths = new Map()
  let offset = 0
  let endOffset = -1
  while (offset + TAR_BLOCK_SIZE <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + TAR_BLOCK_SIZE)
    if (header.every((byte) => byte === 0)) {
      endOffset = offset
      break
    }
    invariant(entries.length < MAX_ARCHIVE_ENTRIES, 'npm archive exceeds the closed entry budget')
    invariant(header.subarray(257, 263).equals(Buffer.from('ustar\0')) && header.subarray(263, 265).equals(Buffer.from('00')), 'npm archive uses an unsupported tar format')
    const recordedChecksum = parseTarOctal(header, 148, 8, 'tar header checksum')
    let computedChecksum = 0
    for (let index = 0; index < TAR_BLOCK_SIZE; index += 1) computedChecksum += index >= 148 && index < 156 ? 0x20 : header[index]
    invariant(recordedChecksum === computedChecksum, 'npm archive tar header checksum mismatch')
    const name = decodeTarField(header, 0, 100, 'tar entry name')
    const prefix = decodeTarField(header, 345, 155, 'tar entry prefix')
    const path = canonicalArchivePath(prefix ? `${prefix}/${name}` : name, 'tar entry path')
    const key = portablePathKey(path)
    invariant(!paths.has(key), `npm archive contains duplicate or portable-alias paths:${paths.get(key) || path}:${path}`)
    const typeByte = header[156]
    const type = typeByte === 0 || typeByte === 0x30 ? 'file' : null
    // The canonical npm archive contains only regular files. Rejecting directory records as well
    // as links, devices, and metadata extensions keeps extraction to one closed write primitive.
    invariant(type !== null, `npm archive contains unsupported directory/link/special/PAX entry type:${String.fromCharCode(typeByte || 0)}`)
    const mode = parseTarOctal(header, 100, 8, `tar mode ${path}`)
    invariant(mode === 0o644 || mode === 0o755, `npm archive entry has unsupported mode:${path}:${mode.toString(8)}`)
    const size = parseTarOctal(header, 124, 12, `tar size ${path}`, { allowEmpty: true })
    invariant(size <= MAX_FILE_BYTES, `npm archive file exceeds the closed per-file budget:${path}`)
    const dataStart = offset + TAR_BLOCK_SIZE
    const paddedSize = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE
    const nextOffset = dataStart + paddedSize
    invariant(nextOffset <= tarBytes.length, `npm archive entry exceeds archive bounds:${path}`)
    const padding = tarBytes.subarray(dataStart + size, nextOffset)
    invariant(padding.every((byte) => byte === 0), `npm archive entry has nonzero padding:${path}`)
    const parentParts = path.split('/')
    for (let index = 1; index < parentParts.length; index += 1) {
      const parentKey = portablePathKey(parentParts.slice(0, index).join('/'))
      invariant(paths.get(parentKey)?.type !== 'file', `npm archive file is an ancestor of another entry:${path}`)
    }
    for (const existingKey of paths.keys()) {
      invariant(!existingKey.startsWith(`${key}/`), `npm archive file is an ancestor of another entry:${path}`)
    }
    paths.set(key, { path, type })
    entries.push({ content: tarBytes.subarray(dataStart, dataStart + size), mode, path, type })
    offset = nextOffset
  }
  invariant(endOffset >= 0 && tarBytes.length - endOffset >= TAR_BLOCK_SIZE * 2, 'npm archive lacks the two-block end marker')
  invariant(tarBytes.subarray(endOffset).every((byte) => byte === 0), 'npm archive has data after its end marker')
  invariant(entries.length > 0, 'npm archive contains no files')
  return entries
}

function extractClosedArchive(entries, extractionRoot) {
  const root = realpathSync(resolve(extractionRoot))
  invariant(lstatSync(root).isDirectory(), 'disposable extraction root must be a real directory')
  for (const entry of entries) {
    const target = join(root, ...entry.path.split('/'))
    const parent = dirname(target)
    mkdirSync(parent, { recursive: true, mode: 0o755 })
    const realParent = realpathSync(parent)
    invariant(realParent.startsWith(`${root}${sep}`) || realParent === root, `npm extraction parent escaped disposable root:${entry.path}`)
    const descriptor = openSync(target, 'wx', entry.mode)
    try { writeFileSync(descriptor, entry.content) } finally { closeSync(descriptor) }
    chmodSync(target, entry.mode)
  }
  return join(root, 'package')
}

function probeCli(cli, expectedVersion, { cwd, env, runner }) {
  const isolatedEnv = Object.fromEntries(Object.entries(env || {}).filter(([name]) => !/^(?:NODE_OPTIONS|NODE_PATH)$/i.test(name)))
  const result = runner(process.execPath, [cli, '--version'], {
    cwd,
    env: isolatedEnv,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(result?.status === 0, `verified npm CLI version probe failed with exit ${result?.status}`)
  invariant(String(result.stdout || '').trim() === expectedVersion, `verified npm CLI reports ${String(result.stdout || '').trim() || '<empty>'}, expected ${expectedVersion}`)
}

function regularTreeDigest(rootPath) {
  const root = realpathSync(resolve(rootPath))
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'npm security overlay tree root must be one real directory')
  const records = []
  const walk = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = join(directory, entry.name)
      const info = lstatSync(absolute)
      invariant(!entry.isSymbolicLink() && !info.isSymbolicLink(), `npm security overlay tree contains a symlink:${relative}`)
      if (entry.isDirectory()) {
        invariant(info.isDirectory() && realpathSync(absolute) === absolute, `npm security overlay tree contains an aliased directory:${relative}`)
        walk(absolute, relative)
        continue
      }
      invariant(
        entry.isFile() && info.isFile() && info.nlink === 1 && realpathSync(absolute) === absolute,
        `npm security overlay tree contains an unsafe file:${relative}`,
      )
      const bytes = readFileSync(absolute)
      records.push({
        path: relative,
        mode: info.mode & 0o777,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })
    }
  }
  walk(root)
  invariant(records.length > 0, 'npm security overlay tree is empty')
  return createHash('sha256').update(JSON.stringify(records)).digest('hex')
}

function probeNpmRuntimeSecurityOverlay(packageRoot, { env, runner }) {
  const isolatedEnv = Object.fromEntries(Object.entries(env || {}).filter(([name]) => !/^(?:NODE_OPTIONS|NODE_PATH)$/i.test(name)))
  const compatibilityProbe = `
const dependencyRoot = '.' + '/node_modules/'
const brace = require(dependencyRoot + 'brace-expansion')
const minimatchModule = require(dependencyRoot + 'minimatch')
const minimatch = minimatchModule.minimatch || minimatchModule
const tar = require(dependencyRoot + 'tar/package.json')
if (typeof brace.expand !== 'function') process.exit(41)
if (JSON.stringify(brace.expand('{a,b}')) !== JSON.stringify(['a','b'])) process.exit(42)
if (typeof minimatch !== 'function' || !minimatch('a', '{a,b}')) process.exit(43)
if (tar.name !== 'tar' || tar.version !== '7.5.22') process.exit(44)
`
  const result = runner(process.execPath, ['--eval', compatibilityProbe], {
    cwd: packageRoot,
    env: isolatedEnv,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(result?.status === 0, `npm security overlay compatibility probe failed with exit ${String(result?.status)}`)
}

function overlayPatchTreeDigest(records) {
  return createHash('sha256').update(JSON.stringify(records.map(({ target, treeDigest }) => ({ target, treeDigest })))).digest('hex')
}

function applyNpmRuntimeSecurityPatch({
  packageRoot,
  stagingParent,
  patch,
  tarballBytes,
}) {
  const expectedIntegrity = integrityBytes(patch.integrity)
  invariant(Buffer.isBuffer(tarballBytes) && tarballBytes.length > 0 && tarballBytes.length <= MAX_COMPRESSED_BYTES, `npm security overlay ${patch.package} tarball bytes exceed the closed compressed budget`)
  const actualIntegrity = createHash('sha512').update(tarballBytes).digest()
  invariant(timingSafeEqual(actualIntegrity, expectedIntegrity), `npm security overlay ${patch.package} tarball SHA-512 differs from the committed lock`)
  let tarBytes
  try { tarBytes = gunzipSync(tarballBytes, { maxOutputLength: MAX_UNCOMPRESSED_BYTES }) } catch (error) {
    throw new Error(`GOV-NPM-RUNTIME-001:npm security overlay ${patch.package} tarball is not a bounded canonical gzip archive:${error?.message || error}`)
  }
  const entries = parseClosedUstar(tarBytes)
  const target = resolve(packageRoot, ...patch.target.split('/'))
  const targetInfo = lstatSync(target)
  invariant(
    targetInfo.isDirectory() && !targetInfo.isSymbolicLink() && realpathSync(target) === target,
    `npm security overlay ${patch.package} target must be one real extracted directory`,
  )
  const replacedManifest = readJson(join(target, 'package.json'), `npm security overlay ${patch.package} replaced package manifest`)
  invariant(
    replacedManifest.name === patch.package && replacedManifest.version === patch.replacedVersion,
    `npm security overlay ${patch.package} replaced package identity differs from the certified contract`,
  )
  if (patch.consumer) {
    const consumer = resolve(packageRoot, ...patch.consumer.split('/'))
    const consumerManifest = readJson(join(consumer, 'package.json'), `npm security overlay ${patch.package} consumer manifest`)
    invariant(
      consumerManifest.name === patch.consumerName
        && consumerManifest.version === patch.consumerVersion
        && consumerManifest.dependencies?.[patch.package] === patch.consumerDependencyRange,
      `npm security overlay ${patch.package} consumer identity or dependency range differs from the certified contract`,
    )
  }
  const staging = realpathSync(mkdtempSync(join(realpathSync(resolve(stagingParent)), `.verified-npm-security-overlay-${patch.package}-`)))
  chmodSync(staging, 0o700)
  const replacement = extractClosedArchive(entries, staging)
  const replacementManifest = readJson(join(replacement, 'package.json'), `npm security overlay ${patch.package} replacement package manifest`)
  invariant(
    replacementManifest.name === patch.package && replacementManifest.version === patch.version,
    `npm security overlay ${patch.package} replacement package identity differs from the committed lock`,
  )
  rmSync(target, { recursive: true, force: false })
  renameSync(replacement, target)
  rmSync(staging, { recursive: true, force: false })
  const appliedManifest = readJson(join(target, 'package.json'), `applied npm security overlay ${patch.package} package manifest`)
  invariant(
    appliedManifest.name === patch.package && appliedManifest.version === patch.version,
    `applied npm security overlay ${patch.package} identity differs after atomic replacement`,
  )
  return Object.freeze({
    alias: patch.alias,
    package: patch.package,
    version: patch.version,
    integrity: patch.integrity,
    target: patch.target,
    replacedVersion: patch.replacedVersion,
    treeDigest: regularTreeDigest(target),
  })
}

function applyNpmRuntimeSecurityOverlay({
  packageRoot,
  stagingParent,
  securityOverlay,
  tarballBytes,
  secondaryTarballBytes,
  env,
  runner,
}) {
  invariant(
    securityOverlay
      && securityOverlay.identityDigest === npmRuntimeOverlayIdentity(securityOverlay)
      && securityOverlay.package === NPM_RUNTIME_OVERLAY_PACKAGE
      && (securityOverlay.version === NPM_RUNTIME_OVERLAY_VERSION || NPM_RUNTIME_OVERLAY_HISTORICAL_VERSIONS.includes(securityOverlay.version))
      && securityOverlay.target === NPM_RUNTIME_OVERLAY_TARGET
      && securityOverlay.replacedVersion === NPM_RUNTIME_OVERLAY_REPLACED_VERSION
      && securityOverlay.consumer === NPM_RUNTIME_OVERLAY_CONSUMER
      && securityOverlay.consumerVersion === NPM_RUNTIME_OVERLAY_CONSUMER_VERSION
      && securityOverlay.consumerDependencyRange === NPM_RUNTIME_OVERLAY_CONSUMER_RANGE
      && securityOverlay.secondaryAlias === NPM_RUNTIME_SECONDARY_OVERLAY_ALIAS
      && securityOverlay.secondaryPackage === NPM_RUNTIME_SECONDARY_OVERLAY_PACKAGE
      && securityOverlay.secondaryVersion === NPM_RUNTIME_SECONDARY_OVERLAY_VERSION
      && securityOverlay.secondaryTarget === NPM_RUNTIME_SECONDARY_OVERLAY_TARGET
      && securityOverlay.secondaryReplacedVersion === NPM_RUNTIME_SECONDARY_OVERLAY_REPLACED_VERSION,
    'npm security overlay contract is invalid',
  )
  const primary = applyNpmRuntimeSecurityPatch({
    packageRoot,
    stagingParent,
    patch: {
      alias: securityOverlay.alias,
      package: securityOverlay.package,
      version: securityOverlay.version,
      integrity: securityOverlay.integrity,
      target: securityOverlay.target,
      replacedVersion: securityOverlay.replacedVersion,
      consumer: securityOverlay.consumer,
      consumerName: 'minimatch',
      consumerVersion: securityOverlay.consumerVersion,
      consumerDependencyRange: securityOverlay.consumerDependencyRange,
    },
    tarballBytes,
  })
  const secondary = applyNpmRuntimeSecurityPatch({
    packageRoot,
    stagingParent,
    patch: {
      alias: securityOverlay.secondaryAlias,
      package: securityOverlay.secondaryPackage,
      version: securityOverlay.secondaryVersion,
      integrity: securityOverlay.secondaryIntegrity,
      target: securityOverlay.secondaryTarget,
      replacedVersion: securityOverlay.secondaryReplacedVersion,
    },
    tarballBytes: secondaryTarballBytes,
  })
  probeNpmRuntimeSecurityOverlay(packageRoot, { env, runner })
  const treeDigest = overlayPatchTreeDigest([primary, secondary])
  return Object.freeze({
    schemaVersion: 1,
    kind: 'verified-npm-runtime-security-overlay-receipt',
    status: 'applied',
    identityDigest: securityOverlay.identityDigest,
    npmVersion: securityOverlay.npmVersion,
    package: securityOverlay.package,
    version: securityOverlay.version,
    integrity: securityOverlay.integrity,
    target: securityOverlay.target,
    replacedVersion: securityOverlay.replacedVersion,
    consumer: securityOverlay.consumer,
    consumerVersion: securityOverlay.consumerVersion,
    secondaryAlias: securityOverlay.secondaryAlias,
    secondaryPackage: securityOverlay.secondaryPackage,
    secondaryVersion: securityOverlay.secondaryVersion,
    secondaryIntegrity: securityOverlay.secondaryIntegrity,
    secondaryTarget: securityOverlay.secondaryTarget,
    secondaryReplacedVersion: securityOverlay.secondaryReplacedVersion,
    secondaryTreeDigest: secondary.treeDigest,
    treeDigest,
  })
}

function verifyAppliedNpmRuntimeSecurityOverlay({
  packageRoot,
  securityOverlay,
  expectedTreeDigest,
  env,
  runner,
}) {
  const packageManifest = readJson(join(packageRoot, 'package.json'), 'installed npm package manifest')
  invariant(
    packageManifest.name === 'npm' && packageManifest.version === securityOverlay.npmVersion,
    'installed npm package identity differs from the overlay contract',
  )
  const target = resolve(packageRoot, ...securityOverlay.target.split('/'))
  const targetManifest = readJson(join(target, 'package.json'), 'installed npm security overlay package manifest')
  invariant(
    targetManifest.name === securityOverlay.package && targetManifest.version === securityOverlay.version,
    'installed npm security overlay package is missing, stale, or substituted',
  )
  const consumerManifest = readJson(
    join(packageRoot, ...securityOverlay.consumer.split('/'), 'package.json'),
    'installed npm security overlay consumer manifest',
  )
  invariant(
    consumerManifest.name === 'minimatch'
      && consumerManifest.version === securityOverlay.consumerVersion
      && consumerManifest.dependencies?.[securityOverlay.package] === securityOverlay.consumerDependencyRange,
    'installed npm security overlay consumer identity or dependency range drifted',
  )
  const secondaryTarget = resolve(packageRoot, ...securityOverlay.secondaryTarget.split('/'))
  const secondaryManifest = readJson(join(secondaryTarget, 'package.json'), 'installed secondary npm security overlay package manifest')
  invariant(
    secondaryManifest.name === securityOverlay.secondaryPackage
      && secondaryManifest.version === securityOverlay.secondaryVersion,
    'installed secondary npm security overlay package is missing, stale, or substituted',
  )
  const primaryTreeDigest = regularTreeDigest(target)
  const secondaryTreeDigest = regularTreeDigest(secondaryTarget)
  const treeDigest = overlayPatchTreeDigest([
    { target: securityOverlay.target, treeDigest: primaryTreeDigest },
    { target: securityOverlay.secondaryTarget, treeDigest: secondaryTreeDigest },
  ])
  invariant(treeDigest === expectedTreeDigest, 'installed npm security overlay tree differs from the verified runtime overlay')
  probeNpmRuntimeSecurityOverlay(packageRoot, { env, runner })
  return Object.freeze({
    schemaVersion: 1,
    kind: 'verified-installed-npm-security-overlay-receipt',
    status: 'verified',
    identityDigest: securityOverlay.identityDigest,
    npmVersion: securityOverlay.npmVersion,
    package: securityOverlay.package,
    version: securityOverlay.version,
    integrity: securityOverlay.integrity,
    target: securityOverlay.target,
    secondaryAlias: securityOverlay.secondaryAlias,
    secondaryPackage: securityOverlay.secondaryPackage,
    secondaryVersion: securityOverlay.secondaryVersion,
    secondaryIntegrity: securityOverlay.secondaryIntegrity,
    secondaryTarget: securityOverlay.secondaryTarget,
    secondaryTreeDigest,
    treeDigest,
  })
}

function verifyInstalledNpmAuditClosure(repositoryRoot, securityOverlay) {
  const root = realpathSync(resolve(repositoryRoot))
  const expected = [
    [`node_modules/npm/${securityOverlay.target}`, securityOverlay.package, securityOverlay.version, null],
    [`node_modules/npm/${securityOverlay.consumer}`, 'minimatch', securityOverlay.consumerVersion, [securityOverlay.package, securityOverlay.consumerDependencyRange]],
    [`node_modules/npm/${securityOverlay.secondaryTarget}`, securityOverlay.secondaryPackage, securityOverlay.secondaryVersion, null],
    [`node_modules/${securityOverlay.alias}`, securityOverlay.package, securityOverlay.version, null],
    [`node_modules/${securityOverlay.secondaryAlias}`, securityOverlay.secondaryPackage, securityOverlay.secondaryVersion, null],
  ]
  const records = expected.map(([relative, name, version, dependency]) => {
    const manifest = readJson(join(root, relative, 'package.json'), `installed npm audit-closure manifest ${relative}`)
    invariant(
      manifest.name === name
        && manifest.version === version
        && (!dependency || manifest.dependencies?.[dependency[0]] === dependency[1]),
      `installed npm audit-closure package drifted:${relative}`,
    )
    return {
      path: relative,
      name,
      version,
      dependency: dependency ? { name: dependency[0], range: dependency[1] } : null,
    }
  })
  return Object.freeze({
    records: Object.freeze(records.map((record) => Object.freeze(record))),
    digest: createHash('sha256').update(JSON.stringify(records)).digest('hex'),
  })
}

export function materializeVerifiedExactNpmRuntime({
  artifact,
  tarballBytes,
  securityOverlayTarballBytes,
  secondarySecurityOverlayTarballBytes,
  parentDirectory = tmpdir(),
  env = process.env,
  runner = spawnSync,
} = {}) {
  invariant(artifact && typeof artifact === 'object' && !Array.isArray(artifact), 'verified npm artifact contract is missing')
  invariant(EXACT_STABLE_VERSION.test(artifact.version || ''), 'verified npm artifact version is invalid')
  invariant(artifact.resolved === `${NPM_REGISTRY_ORIGIN}/npm/-/npm-${artifact.version}.tgz`, 'verified npm artifact URL/version binding is invalid')
  const expectedIntegrity = integrityBytes(artifact.integrity)
  invariant(Buffer.isBuffer(tarballBytes) && tarballBytes.length > 0 && tarballBytes.length <= MAX_COMPRESSED_BYTES, 'npm tarball bytes exceed the closed compressed budget')
  const actualIntegrity = createHash('sha512').update(tarballBytes).digest()
  invariant(timingSafeEqual(actualIntegrity, expectedIntegrity), 'npm tarball SHA-512 differs from the committed lock')
  let tarBytes
  try { tarBytes = gunzipSync(tarballBytes, { maxOutputLength: MAX_UNCOMPRESSED_BYTES }) } catch (error) {
    throw new Error(`GOV-NPM-RUNTIME-001:npm tarball is not a bounded canonical gzip archive:${error?.message || error}`)
  }
  const entries = parseClosedUstar(tarBytes)
  const parent = realpathSync(resolve(parentDirectory))
  const root = realpathSync(mkdtempSync(join(parent, 'verified-exact-npm-')))
  chmodSync(root, 0o700)
  let keep = false
  try {
    const packageRoot = extractClosedArchive(entries, root)
    const packageManifest = readJson(join(packageRoot, 'package.json'), 'verified npm package manifest')
    invariant(packageManifest.name === 'npm' && packageManifest.version === artifact.version, 'verified npm package identity differs from the committed lock')
    invariant(packageManifest.bin?.npm === 'bin/npm-cli.js', 'verified npm package does not bind bin/npm-cli.js')
    const securityOverlay = artifact.securityOverlay
      ? applyNpmRuntimeSecurityOverlay({
          packageRoot,
          stagingParent: root,
          securityOverlay: artifact.securityOverlay,
          tarballBytes: securityOverlayTarballBytes,
          secondaryTarballBytes: secondarySecurityOverlayTarballBytes,
          env,
          runner,
        })
      : null
    invariant(
      artifact.securityOverlay
        ? securityOverlay?.status === 'applied'
        : securityOverlay === null
          && securityOverlayTarballBytes === undefined
          && secondarySecurityOverlayTarballBytes === undefined,
      'npm security overlay materialization state differs from the runtime contract',
    )
    const cli = regularUnaliasedFile(join(packageRoot, 'bin/npm-cli.js'), 'verified npm CLI')
    invariant((lstatSync(cli).mode & 0o111) !== 0, 'verified npm CLI is not executable')
    probeCli(cli, artifact.version, { cwd: packageRoot, env, runner })
    keep = true
    let live = true
    const runtime = {
      artifact: Object.freeze({ ...artifact }),
      cli,
      packageRoot,
      root,
      securityOverlay,
      toolchain: Object.freeze({ node: process.version, npm: artifact.version }),
      applyInstalledSecurityOverlay(repositoryRoot) {
        invariant(securityOverlay?.status === 'applied', 'verified runtime has no applied npm security overlay')
        const repository = realpathSync(resolve(repositoryRoot))
        const packageRoot = resolve(repository, 'node_modules/npm')
        const installedManifest = readJson(join(packageRoot, 'package.json'), 'installed npm package manifest')
        invariant(
          installedManifest.name === 'npm' && installedManifest.version === artifact.version,
          'installed npm package identity differs from the verified runtime',
        )
        const receipt = applyNpmRuntimeSecurityOverlay({
          packageRoot,
          stagingParent: resolve(packageRoot, 'node_modules'),
          securityOverlay: artifact.securityOverlay,
          tarballBytes: securityOverlayTarballBytes,
          secondaryTarballBytes: secondarySecurityOverlayTarballBytes,
          env,
          runner,
        })
        invariant(receipt.treeDigest === securityOverlay.treeDigest, 'installed npm security overlay tree differs from the verified runtime overlay')
        const installedReceipt = verifyAppliedNpmRuntimeSecurityOverlay({
          packageRoot,
          securityOverlay: artifact.securityOverlay,
          expectedTreeDigest: securityOverlay.treeDigest,
          env,
          runner,
        })
        const auditClosure = verifyInstalledNpmAuditClosure(repository, artifact.securityOverlay)
        return Object.freeze({
          ...installedReceipt,
          auditClosureDigest: auditClosure.digest,
          auditClosure: auditClosure.records,
        })
      },
      verifyInstalledSecurityOverlay(repositoryRoot) {
        invariant(securityOverlay?.status === 'applied', 'verified runtime has no applied npm security overlay')
        const repository = realpathSync(resolve(repositoryRoot))
        const installedReceipt = verifyAppliedNpmRuntimeSecurityOverlay({
          packageRoot: resolve(repository, 'node_modules/npm'),
          securityOverlay: artifact.securityOverlay,
          expectedTreeDigest: securityOverlay.treeDigest,
          env,
          runner,
        })
        const auditClosure = verifyInstalledNpmAuditClosure(repository, artifact.securityOverlay)
        return Object.freeze({
          ...installedReceipt,
          auditClosureDigest: auditClosure.digest,
          auditClosure: auditClosure.records,
        })
      },
      cleanup() {
        if (!live) return
        live = false
        rmSync(root, { recursive: true, force: true })
      },
    }
    return Object.freeze(runtime)
  } finally {
    if (!keep) rmSync(root, { recursive: true, force: true })
  }
}

export async function prepareVerifiedExactNpmRuntime({
  repositoryRoot,
  parentDirectory = tmpdir(),
  download = downloadCanonicalNpmTarball,
  downloadSecurityOverlay = downloadCanonicalNpmSecurityOverlayTarball,
  env = process.env,
  runner = spawnSync,
  historicalOverlay = false,
} = {}) {
  const artifact = resolveExactNpmRuntimeContract(repositoryRoot, { historicalOverlay })
  // 下載與之後的鎖定 npm 子行程用同一份環境決定代理路由(resolveGovernanceProxyRoute);原因只印一次。
  reportGovernanceProxyNoticesOnce(resolveGovernanceProxyForwarding(env))
  const tarballBytes = await download(artifact.resolved, { environment: env })
  const securityOverlayTarballBytes = await downloadSecurityOverlay(artifact.securityOverlay.resolved, { environment: env })
  const secondarySecurityOverlayTarballBytes = await downloadSecurityOverlay(artifact.securityOverlay.secondaryResolved, { environment: env })
  return materializeVerifiedExactNpmRuntime({
    artifact,
    tarballBytes,
    securityOverlayTarballBytes,
    secondarySecurityOverlayTarballBytes,
    parentDirectory,
    env,
    runner,
  })
}

export function assertVerifiedExactNpmRuntimeCapability(runtime, expectedContract) {
  invariant(
    runtime?.cli
      && runtime?.artifact?.version === expectedContract?.version
      && runtime?.artifact?.resolved === expectedContract?.resolved
      && runtime?.artifact?.integrity === expectedContract?.integrity
      && runtime?.toolchain?.npm === expectedContract?.version,
    'verified exact npm runtime capability differs from the committed artifact',
  )
  const expectedOverlay = expectedContract?.securityOverlay
  invariant(
    expectedOverlay
      && runtime?.artifact?.securityOverlay?.identityDigest === expectedOverlay.identityDigest
      && runtime?.securityOverlay?.status === 'applied'
      && runtime?.securityOverlay?.identityDigest === expectedOverlay.identityDigest
      && runtime?.securityOverlay?.integrity === expectedOverlay.integrity
      && runtime?.securityOverlay?.target === expectedOverlay.target
      && runtime?.securityOverlay?.version === expectedOverlay.version
      && runtime?.securityOverlay?.secondaryIntegrity === expectedOverlay.secondaryIntegrity
      && runtime?.securityOverlay?.secondaryTarget === expectedOverlay.secondaryTarget
      && runtime?.securityOverlay?.secondaryVersion === expectedOverlay.secondaryVersion,
    'verified exact npm runtime security overlay is missing, stale, or substituted',
  )
  return true
}
