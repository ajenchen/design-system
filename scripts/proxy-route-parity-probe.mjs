#!/usr/bin/env node

// 雲端等價環境的代理對照組(2026-11-26)。
//
// 下游 Claude Code 雲端跑 `npm run setup:all`:鎖定安裝 `npm ci` 成功後,`audit signatures` 要從 tuf-repo-cdn.sigstore.dev
// 抓 TUF 中繼資料,而那台 VM 的對外流量只能經安全代理(HTTPS_PROXY 有設、網址不帶帳密;registry 在 NO_PROXY、可直接解析;
// sigstore 不經代理就解析不到)。鎖定安裝鏈原本把代理變數全部剝除 → 88 秒後 ENOTFOUND、exit 1。修法:只轉送不帶帳密的
// HTTPS_PROXY / NO_PROXY(判定:scripts/lib/verified-exact-npm-runtime.mjs 的 resolveGovernanceProxyForwarding)。
//
// 這支腳本在 Linux CI runner 上造出同樣的條件並跑兩面(.github/workflows/ci.yml「Cloud portability gates」):
//   --serve   在 127.0.0.1 起一個不帶帳密的 HTTP CONNECT 代理(只收 CONNECT、只放行 443),每次 CONNECT 寫一行 JSON 紀錄。
//             代理跑在一般的 mount namespace,用 runner 正常的名稱解析連出。
//   --arm=forward|control|flags-only
//             由 workflow 以 `sudo unshare --mount` 開一個只有這支行程看得到的 mount namespace,把 /etc/nsswitch.conf 換成
//             `hosts: files`、/etc/hosts 只多釘 registry.npmjs.org —— 於是在這個 namespace 裡 sigstore 直連必定解析不到,
//             registry 照樣可以直連(與雲端同形),runner 本身的設定一個位元都不動(namespace 隨行程結束消失)。
//             接著跑**鎖定安裝鏈本身**的 audit signatures:createIsolatedGovernanceNpmEnvironment → prepareVerifiedExactNpmRuntime
//             → verifiedNpmNodeArgv(cli, ['audit', 'signatures', …]),新的 HOME(TUF 快取是空的,一定要上網抓)。
//               forward:HTTPS_PROXY = 不帶帳密的代理 → 必須 exit 0,而且代理紀錄裡有 CONNECT tuf-repo-cdn.sigstore.dev:443。
//               control:同樣條件,代理網址帶帳密(照規則不轉送)→ 必須失敗且輸出有 ENOTFOUND,代理紀錄裡不得多出 sigstore。
//               flags-only:環境變數不給代理,改給 npm 旗標 --https-proxy=<同一個不帶帳密的代理> --noproxy=<同值>(= npmrc 的
//                 https-proxy / noproxy)→ 必須 ENOTFOUND sigstore。這是 2026-11-26 雲端實測 E2 的事實:npm 的 https-proxy 設定
//                 到不了 sigstore TUF 的下載(npm lib/utils/verify-signatures.js initTUF 不傳代理,tuf-js 的 fetcher 只靠環境變數),
//                 所以轉送只能走環境變數。這一臂把它釘成回歸測試:哪天 npm 開始把設定傳給 TUF,這一臂會紅,屆時再重新判斷做法。
//             兩臂之前先驗前提(namespace 裡 sigstore 直連解析不到、registry 解析得到);前提不成立 = 儀器失效(exit 2),不算綠。
//   --selftest
//             本機可跑的部分:判定(帶帳密 / 無法解析 / scheme 不支援 / 轉送)、代理轉發(經代理 CONNECT 到本機的 HTTP 伺服器)、
//             代理拒絕非 CONNECT 與非白名單埠、兩臂判定函式的判定表(該紅的格子必紅)。
//
// 結果判定抽成純函式 evaluateProxyParityArm,--selftest 帶判定表跑。代理只轉送位元組,不終止 TLS、不看內容,不新增任何信任。

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { appendFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer, request as httpRequest } from 'node:http'
import { connect as netConnect } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createIsolatedGovernanceNpmEnvironment,
  GOVERNANCE_DEPENDENCY_REGISTRY,
  sanitizeGovernanceBootstrapEnvironment,
} from './lib/governance-dependency-bootstrap.mjs'
import {
  formatGovernanceProxyNotices,
  prepareVerifiedExactNpmRuntime,
  resolveGovernanceProxyForwarding,
  resolveGovernanceProxyRoute,
  verifiedNpmNodeArgv,
} from './lib/verified-exact-npm-runtime.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SIGSTORE_TUF_HOST = 'tuf-repo-cdn.sigstore.dev'
export const REGISTRY_HOST = 'registry.npmjs.org'
// 與雲端實測同形:NO_PROXY 有設且含 registry。
export const PARITY_NO_PROXY = `localhost,127.0.0.1,${REGISTRY_HOST}`
const AUDIT_TIMEOUT_MS = 10 * 60 * 1_000

function fail(message, code = 1) {
  const error = new Error(message)
  error.exitCode = code
  throw error
}

function readConnectRecords(path) {
  let text = ''
  try { text = readFileSync(path, 'utf8') } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

/**
 * 不帶帳密的 HTTP CONNECT 代理。只收 CONNECT、只放行 allowPorts、只綁 127.0.0.1;每次 CONNECT 呼叫 onRecord。
 * 代理用本行程的一般名稱解析連出(net.connect)。
 */
export function startConnectProxy({ port = 0, allowPorts = [443], onRecord = () => {} } = {}) {
  const sockets = new Set()
  const server = createHttpServer((request, response) => {
    onRecord({ method: request.method, target: request.url, status: 405 })
    response.writeHead(405, { Connection: 'close' })
    response.end()
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  server.on('connect', (request, clientSocket, head) => {
    const match = /^(\[[0-9a-fA-F:.]+\]|[^:[\]]+):(\d{1,5})$/.exec(String(request.url || ''))
    const host = match?.[1]?.replace(/^\[(.*)\]$/, '$1')
    const targetPort = Number(match?.[2])
    if (!match || !allowPorts.includes(targetPort)) {
      onRecord({ method: 'CONNECT', target: request.url, status: 403 })
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    const upstream = netConnect({ host, port: targetPort }, () => {
      onRecord({ method: 'CONNECT', target: request.url, host, port: targetPort, status: 200 })
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head?.length) upstream.write(head)
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
    })
    upstream.on('error', (error) => {
      onRecord({ method: 'CONNECT', target: request.url, host, port: targetPort, status: 502, error: error.code || error.message })
      if (clientSocket.writable) clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
    })
    clientSocket.on('error', () => upstream.destroy())
    clientSocket.on('close', () => upstream.destroy())
    upstream.on('close', () => clientSocket.destroy())
  })
  return new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(port, '127.0.0.1', () => {
      resolvePromise({
        port: server.address().port,
        close: () => new Promise((done) => {
          for (const socket of sockets) socket.destroy()
          server.close(() => done())
        }),
      })
    })
  })
}

/** 經代理 CONNECT 到 host:port,在隧道上送一個純 HTTP GET(selftest 用;不經 TLS)。 */
export function fetchThroughConnectProxy({ proxyPort, host, port, path = '/' }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const handle = httpRequest({ host: '127.0.0.1', port: proxyPort, method: 'CONNECT', path: `${host}:${port}`, agent: false })
    handle.setTimeout(10_000, () => handle.destroy(new Error('proxy CONNECT timed out')))
    handle.on('error', rejectPromise)
    handle.on('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy()
        resolvePromise({ status: response.statusCode, body: null })
        return
      }
      const inner = httpRequest({ host, port, path, createConnection: () => socket })
      // 隧道建好但代理不轉送位元組時,必須在有限時間內失敗,不得掛住(弄壞轉發的對照組實測過會掛)。
      inner.setTimeout(10_000, () => inner.destroy(new Error('tunnel response timed out')))
      inner.on('error', rejectPromise)
      inner.on('response', (innerResponse) => {
        let body = ''
        innerResponse.setEncoding('utf8')
        innerResponse.on('data', (chunk) => { body += chunk })
        innerResponse.on('end', () => resolvePromise({ status: innerResponse.statusCode, body }))
      })
      inner.end()
    })
    handle.end()
  })
}

/**
 * 純函式:一臂的結果是否符合預期。
 *   forward:exit 0 + 這一臂期間代理有 CONNECT sigstore:443 成功。
 *   control:exit ≠ 0 + 輸出有 ENOTFOUND 與 sigstore 主機名 + 這一臂期間代理沒有任何 sigstore CONNECT + 印了「帶帳密」原因。
 */
export function evaluateProxyParityArm({ arm, status, output, connectRecords }) {
  const text = String(output || '')
  const sigstoreConnects = (connectRecords || []).filter((record) => record?.method === 'CONNECT' && record?.host === SIGSTORE_TUF_HOST)
  if (arm === 'forward') {
    if (status !== 0) return { ok: false, reason: `forward arm: audit signatures exited ${String(status)}` }
    if (!sigstoreConnects.some((record) => record.status === 200 && record.port === 443)) {
      return { ok: false, reason: `forward arm: proxy log has no successful CONNECT ${SIGSTORE_TUF_HOST}:443` }
    }
    return { ok: true, reason: 'forward arm: audit signatures succeeded through the credential-free proxy' }
  }
  if (arm === 'control' || arm === 'flags-only') {
    if (status === 0) return { ok: false, reason: `${arm} arm: audit signatures succeeded although no proxy reaches the environment` }
    if (!/ENOTFOUND/.test(text) || !text.includes(SIGSTORE_TUF_HOST)) {
      return { ok: false, reason: `${arm} arm: failure is not ENOTFOUND ${SIGSTORE_TUF_HOST}` }
    }
    if (sigstoreConnects.length > 0) return { ok: false, reason: `${arm} arm: the proxy saw a sigstore CONNECT although no proxy reaches the environment` }
    if (arm === 'control') {
      if (!/GOV-PROXY-FORWARD:(?:HTTPS_PROXY|https_proxy) 帶帳密/.test(text)) {
        return { ok: false, reason: 'control arm: the 帶帳密 reason line is missing' }
      }
      return { ok: true, reason: 'control arm: credentialed proxy stripped, sigstore ENOTFOUND as in the cloud before the fix' }
    }
    if (!/--https-proxy=/.test(text)) return { ok: false, reason: 'flags-only arm: the npm --https-proxy flag was not passed' }
    return { ok: true, reason: 'flags-only arm: npm https-proxy / noproxy settings do not reach the sigstore TUF fetch (cloud E2), so forwarding must use the environment' }
  }
  return { ok: false, reason: `unknown arm:${String(arm)}` }
}

async function preconditions() {
  const failures = []
  try {
    await lookup(SIGSTORE_TUF_HOST)
    failures.push(`${SIGSTORE_TUF_HOST} still resolves directly inside the namespace`)
  } catch (error) {
    if (error?.code !== 'ENOTFOUND') failures.push(`${SIGSTORE_TUF_HOST} direct lookup failed with ${error?.code || error?.message}, not ENOTFOUND`)
  }
  try { await lookup(REGISTRY_HOST) } catch (error) {
    failures.push(`${REGISTRY_HOST} does not resolve inside the namespace:${error?.code || error?.message}`)
  }
  return failures
}

export const PARITY_ARMS = Object.freeze(['forward', 'control', 'flags-only'])

async function runArm({ arm, proxyPort, log, root }) {
  if (!PARITY_ARMS.includes(arm)) fail(`unknown arm:${arm}`, 2)
  if (!Number.isInteger(proxyPort) || proxyPort <= 0) fail('--proxy-port is required', 2)
  const failed = await preconditions()
  if (failed.length) fail(`INSTRUMENT-FAIL:${failed.join('; ')}`, 2)
  const home = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'proxy-route-parity-home-')))
  const credentialFree = `http://127.0.0.1:${proxyPort}`
  const baseEnvironment = {
    PATH: process.env.PATH || '/usr/bin:/bin',
    HOME: home,
    ...(arm === 'forward' ? { HTTPS_PROXY: credentialFree, NO_PROXY: PARITY_NO_PROXY } : {}),
    ...(arm === 'control' ? { HTTPS_PROXY: `http://parity-probe:not-a-secret@127.0.0.1:${proxyPort}`, NO_PROXY: PARITY_NO_PROXY } : {}),
  }
  // forward / control 只靠環境變數;flags-only 只靠 npm 旗標(與 npmrc 的 https-proxy / noproxy 同一組設定)。
  const flagArgs = arm === 'flags-only' ? [`--https-proxy=${credentialFree}`, `--noproxy=${PARITY_NO_PROXY}`] : []
  // 預期失敗的兩臂不重試:ENOTFOUND 是確定的結果,npm 預設重試 2 次、退避 10s / 60s(雲端實測 88 秒)只會拉長 CI;
  // initTUF 的 retry 就是 fetch-retries(npm lib/utils/verify-signatures.js:37-41)。轉送臂照預設。
  const retryArgs = arm === 'forward' ? [] : ['--fetch-retries=0']
  const npmArgs = ['audit', 'signatures', `--registry=${GOVERNANCE_DEPENDENCY_REGISTRY}`, ...flagArgs, ...retryArgs]
  const before = readConnectRecords(log).length
  const lines = []
  const capture = (line) => { lines.push(line); console.error(line) }
  capture(`npm ${npmArgs.join(' ')}`)
  // 「帶帳密」原因行必須是**鎖定鏈自己印的**(sanitizeGovernanceBootstrapEnvironment → reportGovernanceProxyNoticesOnce 印到
  // stderr),不是這支探針自己算一次再印(那樣的判定只會自我應驗)。所以建環境與準備 npm 的期間把 console.error 接進輸出。
  const consoleError = console.error
  console.error = (...parts) => { lines.push(parts.join(' ')); consoleError(...parts) }
  let isolated = null
  let runtime = null
  try {
    try {
      isolated = createIsolatedGovernanceNpmEnvironment(baseEnvironment)
      runtime = await prepareVerifiedExactNpmRuntime({ repositoryRoot: root, env: isolated.env })
    } finally {
      console.error = consoleError
    }
    if (arm !== 'flags-only') {
      // 轉送臂真的只走環境變數:鎖定鏈的 npmrc 仍只有那四行,argv 沒有代理旗標。
      const userConfig = readFileSync(isolated.env.NPM_CONFIG_USERCONFIG, 'utf8')
      if (/proxy/i.test(userConfig) || npmArgs.some((argument) => /proxy/i.test(argument))) fail('INSTRUMENT-FAIL:the environment arm leaked a proxy into npmrc / argv', 2)
    } else if (Object.keys(isolated.env).some((name) => /proxy/i.test(name))) {
      fail('INSTRUMENT-FAIL:the flags-only arm leaked a proxy variable into the environment', 2)
    }
    const result = spawnSync(process.execPath, verifiedNpmNodeArgv(runtime.cli, npmArgs), {
      cwd: root,
      env: isolated.env,
      encoding: 'utf8',
      shell: false,
      timeout: AUDIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    })
    const output = `${lines.join('\n')}\n${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`
    process.stderr.write(`${result.stdout || ''}${result.stderr || ''}`)
    const records = readConnectRecords(log).slice(before)
    const hosts = [...new Set(records.filter((record) => record.method === 'CONNECT').map((record) => `${record.target}=${record.status}`))].sort()
    console.error(`proxy CONNECT targets during ${arm} arm:${hosts.length ? hosts.join(', ') : '(none)'}`)
    const verdict = evaluateProxyParityArm({ arm, status: result.status, output, connectRecords: records })
    if (!verdict.ok) fail(verdict.reason)
    console.log(`✅ ${verdict.reason}`)
  } finally {
    try { runtime?.cleanup?.() } finally {
      isolated?.cleanup()
      rmSync(home, { recursive: true, force: true })
    }
  }
}

async function serve({ portFile, log }) {
  if (!portFile || !log) fail('--serve requires --port-file and --log', 2)
  writeFileSync(log, '')
  const proxy = await startConnectProxy({ onRecord: (record) => appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`) })
  writeFileSync(portFile, String(proxy.port))
  console.error(`proxy listening on 127.0.0.1:${proxy.port}`)
  const stop = () => proxy.close().then(() => process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

export async function selftest() {
  // 1. 判定:帶帳密 / 無法解析 / scheme 不支援 → 不轉送;不帶帳密 → 只轉送 HTTPS_PROXY / NO_PROXY。
  const rows = [
    [{ HTTPS_PROXY: 'http://127.0.0.1:3128', NO_PROXY: PARITY_NO_PROXY }, { HTTPS_PROXY: 'http://127.0.0.1:3128', NO_PROXY: PARITY_NO_PROXY }, null],
    [{ HTTPS_PROXY: 'http://user:pass@127.0.0.1:3128', NO_PROXY: PARITY_NO_PROXY }, {}, 'credentials'],
    [{ HTTPS_PROXY: '127.0.0.1:3128' }, {}, 'unparseable'],
    [{ HTTPS_PROXY: 'socks5://127.0.0.1:1080' }, {}, 'unsupported-scheme'],
    [{ HTTP_PROXY: 'http://127.0.0.1:3128', ALL_PROXY: 'http://127.0.0.1:3128' }, {}, null],
  ]
  for (const [environment, expected, reason] of rows) {
    const forwarding = resolveGovernanceProxyForwarding(environment)
    assert.deepEqual({ ...forwarding.forwarded }, expected)
    const dropped = forwarding.notices.find((notice) => notice.kind === 'dropped')
    assert.equal(dropped?.reason ?? null, reason)
    assert.deepEqual(
      Object.keys(sanitizeGovernanceBootstrapEnvironment({ PATH: '/bin', ...environment }, { report: () => {} })).sort(),
      ['PATH', ...Object.keys(expected)].sort(),
    )
    for (const line of formatGovernanceProxyNotices(forwarding)) assert.doesNotMatch(line, /user|pass|127\.0\.0\.1|3128/, 'notices must not print values')
  }
  // 2. 路由:registry 在 NO_PROXY → 直連;sigstore 不在 → 經代理。
  const cloud = { HTTPS_PROXY: 'http://127.0.0.1:3128', NO_PROXY: PARITY_NO_PROXY }
  assert.equal(resolveGovernanceProxyRoute(`https://${REGISTRY_HOST}/npm/-/npm-11.19.0.tgz`, cloud).mode, 'direct')
  assert.equal(resolveGovernanceProxyRoute(`https://${SIGSTORE_TUF_HOST}/timestamp.json`, cloud).mode, 'connect')

  // 3. 代理轉發:經代理 CONNECT 到本機 HTTP 伺服器拿得到內容;代理紀錄有這次 CONNECT。
  const target = createHttpServer((_request, response) => response.end('parity-ok'))
  await new Promise((done) => target.listen(0, '127.0.0.1', done))
  const targetPort = target.address().port
  const records = []
  const proxy = await startConnectProxy({ allowPorts: [targetPort], onRecord: (record) => records.push(record) })
  const strict = await startConnectProxy({ allowPorts: [443], onRecord: () => {} })
  try {
    const forwarded = await fetchThroughConnectProxy({ proxyPort: proxy.port, host: '127.0.0.1', port: targetPort })
    assert.deepEqual(forwarded, { status: 200, body: 'parity-ok' })
    assert.ok(records.some((record) => record.method === 'CONNECT' && record.host === '127.0.0.1' && record.port === targetPort && record.status === 200))
    // 對照:同一個目標經「只放行 443」的代理 → 403,拿不到內容(弄壞轉發 = 紅)。
    const refused = await fetchThroughConnectProxy({ proxyPort: strict.port, host: '127.0.0.1', port: targetPort })
    assert.equal(refused.status, 403)
    assert.equal(refused.body, null)
    // 代理不是一般的 HTTP 轉發器:非 CONNECT 一律 405。
    const plain = await new Promise((done, reject) => {
      const handle = httpRequest({ host: '127.0.0.1', port: proxy.port, path: `http://127.0.0.1:${targetPort}/`, agent: false }, (response) => { response.resume(); done(response.statusCode) })
      handle.on('error', reject)
      handle.end()
    })
    assert.equal(plain, 405)
  } finally {
    await proxy.close()
    await strict.close()
    await new Promise((done) => target.close(done))
  }

  // 4. 三臂判定的判定表:該紅的格子必紅(弄壞會紅)。
  const sigstoreOk = [{ method: 'CONNECT', host: SIGSTORE_TUF_HOST, port: 443, status: 200 }]
  const controlOutput = `ℹ️  GOV-PROXY-FORWARD:HTTPS_PROXY 帶帳密,鎖定安裝鏈不轉送(照舊剝除)\nnpm error request to https://${SIGSTORE_TUF_HOST}/10.root.json failed, reason: getaddrinfo ENOTFOUND ${SIGSTORE_TUF_HOST}`
  const table = [
    [{ arm: 'forward', status: 0, output: '', connectRecords: sigstoreOk }, true],
    [{ arm: 'forward', status: 0, output: '', connectRecords: [] }, false],
    [{ arm: 'forward', status: 1, output: '', connectRecords: sigstoreOk }, false],
    [{ arm: 'forward', status: 0, output: '', connectRecords: [{ ...sigstoreOk[0], status: 502 }] }, false],
    [{ arm: 'control', status: 1, output: controlOutput, connectRecords: [] }, true],
    [{ arm: 'control', status: 0, output: controlOutput, connectRecords: [] }, false],
    [{ arm: 'control', status: 1, output: controlOutput, connectRecords: sigstoreOk }, false],
    [{ arm: 'control', status: 1, output: 'npm error ECONNREFUSED', connectRecords: [] }, false],
    [{ arm: 'control', status: 1, output: controlOutput.replace('帶帳密', ''), connectRecords: [] }, false],
    [{ arm: 'flags-only', status: 1, output: `npm audit signatures --https-proxy=http://127.0.0.1:1 --noproxy=x\ngetaddrinfo ENOTFOUND ${SIGSTORE_TUF_HOST}`, connectRecords: [] }, true],
    [{ arm: 'flags-only', status: 0, output: '--https-proxy=http://127.0.0.1:1', connectRecords: sigstoreOk }, false],
    [{ arm: 'flags-only', status: 1, output: `--https-proxy=http://127.0.0.1:1 ENOTFOUND ${SIGSTORE_TUF_HOST}`, connectRecords: sigstoreOk }, false],
    [{ arm: 'flags-only', status: 1, output: `ENOTFOUND ${SIGSTORE_TUF_HOST}`, connectRecords: [] }, false],
    [{ arm: 'other', status: 0, output: '', connectRecords: sigstoreOk }, false],
  ]
  for (const [input, expected] of table) assert.equal(evaluateProxyParityArm(input).ok, expected, JSON.stringify(input))
  console.log(`✅ proxy-route-parity-probe selftest:判定 ${rows.length} 列、路由 2 列、代理轉發與兩個拒絕對照、三臂判定表 ${table.length} 列`)
}

function parseArguments(argv) {
  const options = {}
  for (const argument of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argument)
    if (!match) fail(`unknown argument:${argument}`, 2)
    options[match[1]] = match[2] ?? true
  }
  return options
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.selftest) {
      await selftest()
    } else if (options.serve) {
      await serve({ portFile: options['port-file'], log: options.log })
    } else if (options.arm) {
      await runArm({ arm: options.arm, proxyPort: Number(options['proxy-port']), log: options.log, root: options.root ? realpathSync(resolve(options.root)) : ROOT })
    } else {
      fail('usage: proxy-route-parity-probe.mjs --selftest | --serve --port-file=<f> --log=<f> | --arm=forward|control|flags-only --proxy-port=<n> --log=<f> [--root=<dir>]', 2)
    }
  } catch (error) {
    console.error(`❌ proxy-route-parity-probe:${error?.message || error}`)
    process.exit(error?.exitCode || 1)
  }
}
