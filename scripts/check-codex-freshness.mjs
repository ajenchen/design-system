#!/usr/bin/env node
/**
 * check-codex-freshness.mjs — Codex local adapter freshness diagnostic.
 *
 * Provider-neutral review/deep-audit authority lives in the provider registry,
 * model-release registry and review binding. This adapter-specific diagnostic
 * is not a universal Claude/future-provider gate and never runs without explicit bounded intent.
 *
 * 2026-07-10 user directive 兩波:
 *   (1)「怎麼確保每次都能即時自動叫 codex 用最新的,不用我提醒?」— 錨例:裝 0.134.0 vs
 *       npm latest 0.144.1(落後 10 版)+ config pin model="gpt-5.5"(鎖舊)。
 *   (2)「最高算力也不見得永遠是 xhigh 吧?你有辦法自動自主總是調整到最強嗎?」— 錨例:
 *       codex source enum(codex-rs/protocol/src/openai_models.rs)已有 max/ultra 高於 xhigh,
 *       且最高可用檔會隨伺服器/帳號改變，只能在執行期以明示 bounded intent 量測。
 *
 * 機制(三道,fail-closed):
 *   1. CLI 版本:installed 必須等於 canonical provider toolchain lock。Registry latest 只是輪替建議，
 *      不得繞過 review/certification 自動成為執行 authority。
 *   2. model pin:config.toml 含 `model =` → exit 1(pin 鎖舊;CLI default 隨版本跟最新 model)
 *   3. effort = 探測出的最高檔:effort 檔位是否可用由伺服器/帳號在執行期決定(source:
 *      supported_reasoning_levels 為 runtime 資料),靜態查不到 → 只有 **`--probe --allow-model`**
 *      的明示 bounded execution intent 才由高往低實測。結果以 atomic config update +
 *      provider-neutral Git runtime evidence 留存。平時 check 絕不呼叫模型；CLI 換版或
 *      pin 漂移只 fail-closed 要求重新明示本次 probe intent，不是第二次 human engineering approval。
 *      注意:effort **預設是 medium**(enum #[default])→ 「刪 effort pin」= 降檔,pin 必須存在
 *      且 = 探測 top。
 *
 * 檔位階梯 SSOT:openai_models.rs enum 宣告順序(低→高):
 *   none < minimal < low < medium < high < xhigh < max < ultra
 *   出現階梯外的新名字(enum Custom)→ exit 1 要求更新本階梯(半自動:偵測全自動,新名排序需一次確認)。
 *
 * 用法:
 *   node scripts/check-codex-freshness.mjs            # check(1+2+3 cache 對照)
 *   node scripts/check-codex-freshness.mjs --probe --allow-model  # 明示本次 probe intent + atomic config/evidence
 *   node scripts/check-codex-freshness.mjs --offline  # 跳過 npm view(只查 pin + cache)
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import os from 'node:os'
import { isContainedPath } from './lib/canonical-path-containment.mjs'
import { prepareRuntimeEvidenceFile, resolveRuntimeEvidencePath } from './lib/governance-runtime-evidence.mjs'

const CLI_ARGS = process.argv.slice(2)
const ALLOWED_ARGS = new Set(['--probe', '--allow-model', '--offline'])
const PROBE = CLI_ARGS.includes('--probe')
const ALLOW_MODEL = CLI_ARGS.includes('--allow-model')
const OFFLINE = CLI_ARGS.includes('--offline')
const ROOT = process.cwd()
const EXPLICIT_CODEX_HOME = Object.prototype.hasOwnProperty.call(process.env, 'CODEX_HOME')
  ? process.env.CODEX_HOME
  : undefined
const CODEX_HOME = EXPLICIT_CODEX_HOME === undefined
  ? path.resolve(os.homedir(), '.codex')
  : typeof EXPLICIT_CODEX_HOME === 'string' && path.isAbsolute(EXPLICIT_CODEX_HOME)
    ? path.resolve(EXPLICIT_CODEX_HOME)
    : null
const CFG = CODEX_HOME === null ? null : path.resolve(CODEX_HOME, 'config.toml')
const CACHE_OPTIONS = { repoRoot: ROOT, relativePath: 'provider-probes/codex-effort-probe.json' }
const TOOLCHAIN_MANIFEST = path.join(ROOT, 'infra/governance/providers/provider-cli-toolchain.json')
const CODEX_SHIM = path.join(ROOT, 'node_modules/.bin/codex')

if (CLI_ARGS.some((argument) => !ALLOWED_ARGS.has(argument))
  || new Set(CLI_ARGS).size !== CLI_ARGS.length
  || (ALLOW_MODEL && !PROBE)) {
  console.error('用法: node scripts/check-codex-freshness.mjs [--offline] [--probe --allow-model]')
  process.exit(2)
}
if (PROBE && !ALLOW_MODEL) {
  console.error('❌ --probe 會呼叫真實模型並可能改寫本機 Codex config；必須以 --allow-model 明示本次 bounded execution intent')
  process.exit(2)
}
const CACHE = resolveRuntimeEvidencePath(CACHE_OPTIONS)

// SSOT:codex-rs/protocol/src/openai_models.rs enum ReasoningEffort 宣告順序(2026-07-10 snapshot)
const LADDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
const PROBE_FLOOR = 'high' // 探測只走 high 以上(以下無意義)
const EVIDENCE_SCHEMA_VERSION = 1
const EVIDENCE_KEYS = ['schemaVersion', 'cliVersion', 'top', 'resolvedModel', 'probedAt', 'configSha256']
const PROBE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
const RESOLVED_MODEL_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._:/-]{0,127}$/
const FORBIDDEN_CONFIG_KEYS = new Set(['model', 'model_provider', 'profile'])

const errors = []

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function decodeBasicTomlToken(source, start) {
  let escaped = false
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character !== '"') continue
    const raw = source.slice(start, index + 1)
    const normalized = raw.replace(/\\U([0-9A-Fa-f]{8})/g, (_match, codePoint) => {
      const value = Number.parseInt(codePoint, 16)
      if (!Number.isInteger(value) || value > 0x10ffff) throw new Error('invalid TOML Unicode key escape')
      return String.fromCodePoint(value)
    })
    try {
      return { value: JSON.parse(normalized), end: index + 1 }
    } catch {
      throw new Error('invalid TOML quoted key')
    }
  }
  throw new Error('unterminated TOML quoted key')
}

function decodeLiteralTomlToken(source, start) {
  const end = source.indexOf("'", start + 1)
  if (end < 0) throw new Error('unterminated TOML literal key')
  return { value: source.slice(start + 1, end), end: end + 1 }
}

function parseTomlKeySegment(source, start) {
  if (source[start] === '"') return decodeBasicTomlToken(source, start)
  if (source[start] === "'") return decodeLiteralTomlToken(source, start)
  const match = source.slice(start).match(/^[A-Za-z0-9_-]+/)
  if (!match) return null
  return { value: match[0], end: start + match[0].length }
}

function parseTomlAssignment(line, lineNumber) {
  let cursor = 0
  while (/\s/.test(line[cursor] ?? '')) cursor += 1
  if (cursor >= line.length || line[cursor] === '#' || line[cursor] === '[') return null
  const keys = []
  while (cursor < line.length) {
    const token = parseTomlKeySegment(line, cursor)
    if (!token) return null
    keys.push(token.value)
    cursor = token.end
    while (/\s/.test(line[cursor] ?? '')) cursor += 1
    if (line[cursor] !== '.') break
    cursor += 1
    while (/\s/.test(line[cursor] ?? '')) cursor += 1
  }
  if (line[cursor] !== '=') return null
  return { keys, value: line.slice(cursor + 1), lineNumber, source: line.trim() }
}

function parseTomlStringValue(source, label) {
  let cursor = 0
  while (/\s/.test(source[cursor] ?? '')) cursor += 1
  const token = source[cursor] === '"'
    ? decodeBasicTomlToken(source, cursor)
    : source[cursor] === "'"
      ? decodeLiteralTomlToken(source, cursor)
      : null
  if (!token) throw new Error(`${label} must be a quoted TOML string`)
  const remainder = source.slice(token.end).trimStart()
  if (remainder && !remainder.startsWith('#')) throw new Error(`${label} has trailing TOML content`)
  return token.value
}

function inspectConfigAuthority() {
  if (EXPLICIT_CODEX_HOME !== undefined
    && (typeof EXPLICIT_CODEX_HOME !== 'string' || !EXPLICIT_CODEX_HOME
      || EXPLICIT_CODEX_HOME.includes('\0') || /\p{Cc}/u.test(EXPLICIT_CODEX_HOME)
      || !path.isAbsolute(EXPLICIT_CODEX_HOME))) {
    throw new Error('CODEX_HOME must be a non-empty absolute safe path')
  }
  if (!CODEX_HOME || !CFG || !isContainedPath(CODEX_HOME, CFG)) {
    throw new Error('config.toml escapes the Codex config authority')
  }
  let authorityInfo
  let configInfo
  try {
    authorityInfo = fs.lstatSync(CODEX_HOME)
  } catch (error) {
    throw new Error(`Codex config authority is unavailable:${error.code ?? error.message}`)
  }
  if (!authorityInfo.isDirectory() || authorityInfo.isSymbolicLink()) {
    throw new Error('Codex config authority must be a real non-symlink directory')
  }
  let physicalAuthority
  try {
    physicalAuthority = fs.realpathSync(CODEX_HOME)
  } catch (error) {
    throw new Error(`Codex config authority cannot be resolved:${error.message}`)
  }
  if (physicalAuthority !== CODEX_HOME) {
    throw new Error('Codex config authority crosses a symbolic-link or non-canonical path')
  }
  try {
    configInfo = fs.lstatSync(CFG)
  } catch (error) {
    throw new Error(`config.toml is unavailable:${error.code ?? error.message}`)
  }
  if (!configInfo.isFile() || configInfo.isSymbolicLink() || configInfo.nlink !== 1) {
    throw new Error('config.toml must be one regular non-symlink, non-hard-linked file')
  }
  const physicalConfig = fs.realpathSync(CFG)
  if (physicalConfig !== CFG || !isContainedPath(physicalAuthority, physicalConfig)) {
    throw new Error('config.toml is not physically contained by the Codex config authority')
  }
  const bytes = fs.readFileSync(CFG)
  const assignments = bytes.toString('utf8').split('\n').map((line, index) => {
    try {
      return parseTomlAssignment(line, index + 1)
    } catch (error) {
      throw new Error(`config.toml line ${index + 1}:${error.message}`)
    }
  }).filter(Boolean)
  const forbidden = assignments.filter((assignment) => assignment.keys.some((key) => FORBIDDEN_CONFIG_KEYS.has(key)))
  const effortAssignments = assignments.filter((assignment) => assignment.keys.at(-1) === 'model_reasoning_effort')
  if (effortAssignments.length > 1) throw new Error('config.toml has duplicate model_reasoning_effort assignments')
  let effort = null
  if (effortAssignments.length === 1) {
    effort = parseTomlStringValue(
      effortAssignments[0].value,
      `config.toml line ${effortAssignments[0].lineNumber} model_reasoning_effort`,
    )
  }
  return {
    bytes,
    configSha256: sha256(bytes),
    effort,
    forbidden,
  }
}

function lockedCodexVersion() {
  const info = fs.lstatSync(TOOLCHAIN_MANIFEST)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || fs.realpathSync(TOOLCHAIN_MANIFEST) !== TOOLCHAIN_MANIFEST) {
    throw new Error('canonical provider CLI manifest is unsafe')
  }
  const manifest = JSON.parse(fs.readFileSync(TOOLCHAIN_MANIFEST, 'utf8'))
  const tool = manifest.tools?.find((entry) => entry.providerId === 'codex')
  if (!tool || !/^\d+\.\d+\.\d+$/.test(tool.version)) throw new Error('canonical Codex toolchain version is missing')
  return tool.version
}

function installedVersion() {
  const result = spawnSync(CODEX_SHIM, ['--version'], {
    cwd: ROOT,
    env: process.env,
    shell: false,
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`controlled codex --version exited ${String(result.status)}`)
  return `${result.stdout || ''}\n${result.stderr || ''}`.trim().replace(/^codex-cli\s+/, '')
}

function registryLatestVersion() {
  return new Promise((resolveLatest, rejectLatest) => {
    const request = https.get('https://registry.npmjs.org/@openai%2Fcodex/latest', {
      headers: { accept: 'application/json', 'user-agent': 'qijenchen-governance-codex-rotation-check/1' },
      timeout: 15_000,
    }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) throw new Error(`registry status ${String(response.statusCode)}`)
          const version = JSON.parse(body).version
          if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('registry latest version is invalid')
          resolveLatest(version)
        } catch (error) { rejectLatest(error) }
      })
    })
    request.on('timeout', () => request.destroy(new Error('registry latest request timed out')))
    request.on('error', rejectLatest)
  })
}

function writeEffortPin(tier, expectedConfigSha256) {
  const before = inspectConfigAuthority()
  if (before.configSha256 !== expectedConfigSha256) {
    throw new Error('config.toml changed after preflight; refusing mutation')
  }
  const info = fs.lstatSync(CFG)
  const lines = before.bytes.toString('utf8').split('\n')
  const parsed = lines.map((line, index) => parseTomlAssignment(line, index + 1))
  const idx = parsed.findIndex((assignment) => assignment?.keys.at(-1) === 'model_reasoning_effort')
  const newLine = `model_reasoning_effort = "${tier}"`
  if (idx >= 0) lines[idx] = newLine
  else lines.unshift(newLine)
  const suffix = `${process.pid}-${Date.now()}`
  const backup = `${CFG}.governance-backup-${suffix}`
  const temporary = `${CFG}.governance-tmp-${suffix}`
  fs.copyFileSync(CFG, backup, fs.constants.COPYFILE_EXCL)
  try {
    fs.writeFileSync(temporary, lines.join('\n'), { flag: 'wx', mode: info.mode & 0o777 })
    const file = fs.openSync(temporary, 'r')
    try { fs.fsyncSync(file) } finally { fs.closeSync(file) }
    fs.renameSync(temporary, CFG)
    try {
      const directory = fs.openSync(path.dirname(CFG), 'r')
      try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
    } catch {}
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }) } catch {}
    throw new Error(`atomic config update failed; original backup retained at ${backup}:${error.message}`)
  }
  const after = inspectConfigAuthority()
  if (after.effort !== tier) throw new Error('atomic config update did not produce the requested effort pin')
  return { backup, configSha256: after.configSha256 }
}

function writeProbeCache(value) {
  const target = prepareRuntimeEvidenceFile(CACHE_OPTIONS)
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  const file = fs.openSync(temporary, 'r')
  try { fs.fsyncSync(file) } finally { fs.closeSync(file) }
  fs.renameSync(temporary, target)
}

let lastResolvedModel = null
function probeTier(tier) {
  // 1 行 prompt 實測;成功 = exit 0 且 last-message trim 後精確等於 OK。
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-effort-probe-'))
  const output = path.join(probeRoot, 'last-message.txt')
  try {
    const out = spawnSync(CODEX_SHIM, [
      'exec', '--skip-git-repo-check', '-c', `model_reasoning_effort=${tier}`,
      '--output-last-message', output,
    ], {
      cwd: ROOT,
      env: process.env,
      shell: false,
      input: 'Reply with exactly: OK',
      encoding: 'utf8',
      timeout: 150000,
    })
    const modelHeaders = [...`${out.stdout}\n${out.stderr}`.matchAll(/^model:\s*(\S+)\s*$/gm)]
    if (out.status !== 0) return false
    try {
      if (fs.readFileSync(output, 'utf8').trim() !== 'OK') return false
      if (modelHeaders.length !== 1 || !RESOLVED_MODEL_PATTERN.test(modelHeaders[0][1])) return false
      lastResolvedModel = modelHeaders[0][1]
      return true
    } catch { return false }
  } finally {
    fs.rmSync(probeRoot, { recursive: true, force: true })
  }
}

function validateProbeEvidence(cache, { installed, pin, configSha256, now = Date.now() }) {
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) {
    throw new Error('probe evidence must be a JSON object')
  }
  const keys = Object.keys(cache).sort()
  const expectedKeys = [...EVIDENCE_KEYS].sort()
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`probe evidence keys must be exactly ${EVIDENCE_KEYS.join(', ')}`)
  }
  if (cache.schemaVersion !== EVIDENCE_SCHEMA_VERSION) throw new Error('probe evidence schemaVersion is unsupported')
  if (typeof cache.cliVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(cache.cliVersion)) {
    throw new Error('probe evidence cliVersion is invalid')
  }
  if (!LADDER.slice(LADDER.indexOf(PROBE_FLOOR)).includes(cache.top)) {
    throw new Error('probe evidence top is outside the governed probe ladder')
  }
  if (typeof cache.resolvedModel !== 'string' || !RESOLVED_MODEL_PATTERN.test(cache.resolvedModel)) {
    throw new Error('probe evidence resolvedModel is missing or invalid')
  }
  if (typeof cache.configSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(cache.configSha256)) {
    throw new Error('probe evidence configSha256 is invalid')
  }
  if (typeof cache.probedAt !== 'string') throw new Error('probe evidence probedAt is invalid')
  const probedAt = Date.parse(cache.probedAt)
  if (!Number.isFinite(probedAt) || new Date(probedAt).toISOString() !== cache.probedAt) {
    throw new Error('probe evidence probedAt must be an exact ISO timestamp')
  }
  if (probedAt - now > MAX_FUTURE_SKEW_MS) throw new Error('probe evidence timestamp is too far in the future')
  if (now - probedAt > PROBE_TTL_MS) throw new Error('probe evidence has expired; a fresh explicit probe intent is required')
  if (installed && cache.cliVersion !== installed) {
    throw new Error(`CLI 換版(cache ${cache.cliVersion} → 現裝 ${installed})可能開新檔位 → 以明示 bounded intent 重跑 --probe --allow-model`)
  }
  if (pin !== cache.top) {
    throw new Error(`effort pin "${pin}" != 探測 top "${cache.top}" → 以明示 bounded intent 重跑 --probe --allow-model 或依證據修 pin`)
  }
  if (cache.configSha256 !== configSha256) {
    throw new Error('config.toml bytes drift from the probe-bound config digest → 以明示 bounded intent 重跑 --probe --allow-model')
  }
  return cache
}

// ── 0) config authority / provider selection preflight ──
let configState = null
let pin = null
let hasForbiddenSelection = false
try {
  configState = inspectConfigAuthority()
  pin = configState.effort
  if (configState.forbidden.length > 0) {
    hasForbiddenSelection = true
    for (const assignment of configState.forbidden) {
      errors.push(`config.toml 禁止 provider/model/profile selection(line ${assignment.lineNumber}:${assignment.source})`)
    }
  } else {
    console.log('✅ 無 model/model_provider/profile pin(CLI default 自動跟最新)')
  }
  if (pin && !LADDER.includes(pin)) {
    errors.push(`effort pin "${pin}" 不在已知階梯(codex 出了新檔位?)→ 更新本 script LADDER(對照 openai_models.rs enum 順序)後以明示 bounded intent 重跑 --probe --allow-model`)
  }
} catch (error) {
  errors.push(`Codex config authority 不安全:${error.message}`)
}

// ── 1) CLI freshness ──
let installed = null
let toolchainAligned = false
try {
  const locked = lockedCodexVersion()
  installed = installedVersion()
  if (installed !== locked) {
    errors.push(`codex CLI 漂移:installed ${installed} != canonical lock ${locked} → 執行 npm run setup:provider-cli`)
  } else {
    toolchainAligned = true
    console.log(`✅ codex CLI ${installed} = canonical provider toolchain lock`)
  }
  if (!OFFLINE) {
    try {
      const latest = await registryLatestVersion()
      if (locked !== latest) console.log(`ℹ️  registry latest 為 ${latest}；canonical lock 仍為 ${locked}。請另開受審輪替 + 重新 certification，不自動替換。`)
      else console.log(`✅ canonical Codex lock ${locked} = registry latest`)
    } catch (error) {
      console.log(`ℹ️  無法讀取 registry latest(不影響 canonical lock 驗證):${error.message}`)
    }
  }
} catch (e) {
  errors.push(`codex CLI 不可用:${e.message.split('\n')[0]}`)
}

// ── 2) effort = 探測 top ──
if (PROBE) {
  if (!configState || !toolchainAligned || hasForbiddenSelection || errors.length > 0) {
    errors.push('refusing model probe/config/cache mutation until config authority, CLI lock, provider selection, and effort preflight are clean')
  } else {
    console.log('… 由高往低實測 effort 檔位(每檔 1 行 prompt)')
    const candidates = LADDER.slice(LADDER.indexOf(PROBE_FLOOR)).reverse()
    let top = null
    let probePreflightFailed = false
    lastResolvedModel = null
    for (const tier of candidates) {
      try {
        const beforeTier = inspectConfigAuthority()
        if (beforeTier.configSha256 !== configState.configSha256) {
          throw new Error('config.toml changed after the initial probe preflight')
        }
      } catch (error) {
        errors.push(`refusing ${tier} model probe because config authority changed:${error.message}`)
        probePreflightFailed = true
        break
      }
      process.stdout.write(`   probe ${tier} … `)
      if (probeTier(tier)) { console.log('✅ 可用'); top = tier; break }
      console.log('✗')
    }
    if (!top && !probePreflightFailed) errors.push('連 high 都探不到可用檔位 — codex auth / 網路問題,人工查')
    else {
      try {
        let boundConfigSha256
        if (pin !== top) {
          const updated = writeEffortPin(top, configState.configSha256)
          boundConfigSha256 = updated.configSha256
          console.log(`✅ config pin atomic 改為最高可用檔:${pin ?? '(無)'} → ${top}(可復原備份:${updated.backup})`)
        } else {
          const afterProbe = inspectConfigAuthority()
          if (afterProbe.configSha256 !== configState.configSha256) {
            throw new Error('config.toml changed during the model probe; refusing evidence mutation')
          }
          boundConfigSha256 = afterProbe.configSha256
          console.log(`✅ pin 已是最高可用檔 ${top}`)
        }
        writeProbeCache({
          schemaVersion: EVIDENCE_SCHEMA_VERSION,
          cliVersion: installed,
          top,
          resolvedModel: lastResolvedModel,
          probedAt: new Date().toISOString(),
          configSha256: boundConfigSha256,
        })
        console.log(`✅ 實際解析 model:${lastResolvedModel}(unpin 後 CLI default;B.0 報告必 relay 此值)`)
      } catch (error) {
        errors.push(`probe 後 atomic config/evidence mutation 失敗:${error.message}`)
      }
    }
  }
} else {
  // check mode:cache 必存在、schema/time/config/CLI/pin 全部綁定。
  if (!fs.existsSync(CACHE)) {
    errors.push('effort 探測 evidence 不存在 → 以明示 bounded intent 跑 node scripts/check-codex-freshness.mjs --probe --allow-model')
  } else if (configState) {
    try {
      const rawCache = fs.readFileSync(CACHE, 'utf8')
      const parsedCache = JSON.parse(rawCache)
      if (rawCache !== `${JSON.stringify(parsedCache, null, 2)}\n`) {
        throw new Error('probe evidence must use the canonical JSON encoding (duplicates/reordered fields are forbidden)')
      }
      const cache = validateProbeEvidence(parsedCache, {
        installed,
        pin,
        configSha256: configState.configSha256,
      })
      console.log(`✅ effort pin = 未過期探測最高可用檔 ${cache.top}(CLI ${cache.cliVersion};model ${cache.resolvedModel})`)
    } catch (error) {
      errors.push(`effort 探測 evidence 無效:${error.message}`)
    }
  }
}

if (errors.length) {
  console.error('\n❌ codex freshness 違規:')
  errors.forEach((e) => console.error(`  - ${e}`))
  process.exit(1)
}
process.exit(0)
