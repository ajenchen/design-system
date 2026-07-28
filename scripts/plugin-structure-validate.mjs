#!/usr/bin/env node
// plugin-structure-validate.mjs — Phase 5 Claude plugin structure E2E check
//
// Validates plugin distribution structure(per Anthropic plugin spec)before publish:
//   1. .claude-plugin/marketplace.json schema(name, plugins[])
//   2. .claude-plugin/plugin.json schema(name, version, description)
//   3. skills/ + commands/ symlinks resolve to actual .claude/{skills,commands}
//   4. hooks/hooks.json + hooks/scripts/ symlink resolve
//   5. hooks.json paths use ${CLAUDE_PLUGIN_ROOT}(consumer can install via /plugin marketplace add)
//
// Fail = block release(plugin broken for consumer install)。

import { readFileSync, existsSync, lstatSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildClaudePluginHookView, buildProviderHookView } from './gen-codex-adapter.mjs'
import { checkProviderRuntimeValidator } from './gen-provider-runtime-validator.mjs'
import { validateClaudePluginAliases } from './lib/plugin-alias-contract.mjs'

const REPO_ROOT = process.cwd()
const errors = []

function check(name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`)
    errors.push({ name, error: e.message })
  }
}

// 1. marketplace.json schema
check('marketplace.json exists + valid JSON + schema', () => {
  const mp = JSON.parse(readFileSync(join(REPO_ROOT, '.claude-plugin/marketplace.json'), 'utf8'))
  if (!mp.name) throw new Error('marketplace.json missing `name`')
  if (!Array.isArray(mp.plugins) || mp.plugins.length === 0) throw new Error('marketplace.json `plugins` empty')
  const ds = mp.plugins.find((p) => p.name === 'design-system')
  if (!ds) throw new Error('design-system plugin not in marketplace.json')
  if (!ds.version) throw new Error('design-system plugin version missing')
})

// 2. plugin.json schema(欄位「存在」+「型別」雙驗)
//    型別對齊官方 schema(code.claude.com/docs/en/plugins-reference):
//    repository/homepage = STRING(非 npm package.json 的 {type,url} 物件);author = OBJECT{name}。
//    2026-06-04 加 type 驗證 per consumer install fail anchor:repository 寫成 npm 物件 → Claude Code
//    Zod「expected string, received object」裝不起來,而舊 check 只驗存在沒驗型別 → P0 漏出貨。
check('plugin.json exists + valid JSON + schema(field type-checked)', () => {
  const p = JSON.parse(readFileSync(join(REPO_ROOT, '.claude-plugin/plugin.json'), 'utf8'))
  if (!p.name) throw new Error('plugin.json missing name')
  if (!p.version) throw new Error('plugin.json missing version')
  if (!p.description) throw new Error('plugin.json missing description')
  // repository:官方 schema = STRING(URL)。npm package.json 容許 {type,url} 物件,但 Claude Code plugin 不容許。
  if (p.repository !== undefined && typeof p.repository !== 'string') {
    throw new Error(`plugin.json repository 必須是 string(URL),目前是 ${Array.isArray(p.repository) ? 'array' : typeof p.repository}。官方 schema 要 "https://github.com/<org>/<repo>";npm 的 {type,url} 物件寫法會讓 consumer install 失敗(Zod「expected string, received object」)`)
  }
  // homepage:官方 schema = STRING(URL)
  if (p.homepage !== undefined && typeof p.homepage !== 'string') {
    throw new Error(`plugin.json homepage 必須是 string(URL),目前是 ${typeof p.homepage}`)
  }
  // author:官方 schema = OBJECT { name, email?, url? };若提供必含 name
  if (p.author !== undefined) {
    if (typeof p.author !== 'object' || Array.isArray(p.author)) throw new Error(`plugin.json author 必須是 object { name, email?, url? },目前是 ${typeof p.author}`)
    if (!p.author.name || typeof p.author.name !== 'string') throw new Error('plugin.json author.name 缺失或非 string')
  }
})

// 3. Plugin aliases are part of the executable distribution contract. A copied
// directory, retargeted/dangling link, or indirect symlink chain is drift.
check('skills/, commands/, and hooks/scripts aliases are exact and no-symlink-at-destination', () => {
  validateClaudePluginAliases(REPO_ROOT)
})

// 4. hooks structure
check('hooks/hooks.json + self-contained runner/canonical corpus structure', () => {
  const hooksJsonPath = join(REPO_ROOT, 'hooks/hooks.json')
  if (!existsSync(hooksJsonPath)) throw new Error('hooks/hooks.json not found')
  const hooks = JSON.parse(readFileSync(hooksJsonPath, 'utf8'))
  if (!hooks.hooks) throw new Error('hooks/hooks.json missing `hooks` key')
  const runner = join(REPO_ROOT, 'scripts/run-provider-hook.mjs')
  const canonicalOrder = join(REPO_ROOT, 'packages/governance/src/canonical-order.mjs')
  const normalizer = join(REPO_ROOT, 'packages/governance/src/provider-hook-normalization.mjs')
  const runtimeContract = join(REPO_ROOT, 'scripts/lib/provider-runtime-contract.mjs')
  const runtimeValidation = join(REPO_ROOT, 'scripts/lib/provider-runtime-validation.mjs')
  const hookRoot = join(REPO_ROOT, 'packages/design-system/ds-canonical/hooks')
  for (const [path, label] of [[runner, 'plugin runner'], [canonicalOrder, 'canonical UTF-8 ordering primitive'], [normalizer, 'provider hook normalizer'], [runtimeContract, 'runtime contract'], [runtimeValidation, 'runtime validation facade']]) {
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`${label} must be a regular no-symlink corpus file`)
  }
  if (!existsSync(hookRoot) || !lstatSync(hookRoot).isDirectory() || lstatSync(hookRoot).isSymbolicLink()) throw new Error('canonical hook corpus must be a regular directory')
  const expectedHooks = new Set(buildClaudePluginHookView().projected.map((item) => item.hook).filter((name) => /\.(?:sh|py|mjs)$/.test(name)))
  for (const name of expectedHooks) {
    const path = join(hookRoot, name)
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`canonical plugin hook is missing/unsafe:${name}`)
  }
  const runtimeValidator = checkProviderRuntimeValidator()
  if (!runtimeValidator.ok) throw new Error(`standalone schema validator drift:${runtimeValidator.kind}`)
})

// 5. hooks.json paths reference CLAUDE_PLUGIN_ROOT
check('hooks.json paths use ${CLAUDE_PLUGIN_ROOT}', () => {
  const hooks = JSON.parse(readFileSync(join(REPO_ROOT, 'hooks/hooks.json'), 'utf8'))
  const cmdStr = JSON.stringify(hooks)
  if (!cmdStr.includes('${CLAUDE_PLUGIN_ROOT}')) {
    throw new Error('hooks.json commands should reference ${CLAUDE_PLUGIN_ROOT}(per Anthropic plugin spec)')
  }
})

check('hooks.json is the exact exec-form projection of canonical registrations', () => {
  const actual = JSON.parse(readFileSync(join(REPO_ROOT, 'hooks/hooks.json'), 'utf8'))
  const expected = buildClaudePluginHookView().config
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('plugin hook view drift: run the provider adapter generator; manual hook inventories are forbidden')
  }
  for (const groups of Object.values(actual.hooks)) {
    for (const group of groups) for (const hook of group.hooks || []) {
      if (typeof hook.command !== 'string' || !Array.isArray(hook.args)) throw new Error('plugin hook command must use exec form(command + args)')
      // The byte-exact comparison above binds every argument to the canonical
      // shared launch builder. Claude plugin hooks must enter through its
      // absolute env-scrub boundary; direct node/bash launches would bypass it.
      if (hook.command !== '/usr/bin/env') throw new Error(`plugin hook executable is not the canonical env boundary:${hook.command}`)
      if (hook.args.some((arg) => typeof arg !== 'string')) throw new Error('plugin hook args must be inert strings')
    }
  }
})

// 5.5 Plugin projection ↔ repository Claude projection hook-set sync.
// Both expectations are built directly from canonical registrations + provider registry. Reading
// `.claude/settings.json` here would make a generated adapter view the comparison authority and let
// colluding drift pass. Provider paths remain delivery details only.
check('plugin hook projection ↔ canonical Claude adapter projection hook-set sync', () => {
  const EXEMPT = new Set([
    // 目前無 intentional asymmetry;未來若有 plugin-only / dev-only hook,列此 + 一行理由
  ])
  const pluginConfig = buildClaudePluginHookView().config
  const claudeConfig = buildProviderHookView({ providerId: 'claude' }).config
  const extractConfigScripts = (config) => {
    const set = new Set()
    const hooks = config.hooks || config
    for (const groups of Object.values(hooks)) {
      for (const group of groups) for (const hook of group.hooks || []) {
        const match = JSON.stringify(hook).match(/([a-zA-Z0-9_-]+\.sh)/)
        if (match && !EXEMPT.has(match[1])) set.add(match[1])
      }
    }
    return set
  }
  const plugin = extractConfigScripts(pluginConfig)
  const settings = extractConfigScripts(claudeConfig)
  const onlyPlugin = [...plugin].filter((x) => !settings.has(x)).sort()
  const onlySettings = [...settings].filter((x) => !plugin.has(x)).sort()
  if (onlyPlugin.length || onlySettings.length) {
    throw new Error(
      `hook-set drift(plugin ${plugin.size} vs dev ${settings.size}):\n` +
      (onlyPlugin.length ? `  只在 plugin hooks.json(dev settings.json 漏)：${onlyPlugin.join(', ')}\n` : '') +
      (onlySettings.length ? `  只在 dev settings.json(plugin hooks.json 漏 → fork user 拿不到)：${onlySettings.join(', ')}\n` : '') +
      `  修:更新 canonical registrations/provider projection；或 intentional → 加進本 check EXEMPT + 理由。`
    )
  }
})

// 6. Version sync(plugin.json vs marketplace.json vs released packages)
check('Version sync across 6 release surfaces', () => {
  const dsPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/design-system/package.json'), 'utf8'))
  const sbPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/storybook-config/package.json'), 'utf8'))
  const governancePkg = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/governance/package.json'), 'utf8'))
  const plugin = JSON.parse(readFileSync(join(REPO_ROOT, '.claude-plugin/plugin.json'), 'utf8'))
  const mp = JSON.parse(readFileSync(join(REPO_ROOT, '.claude-plugin/marketplace.json'), 'utf8'))
  const dsPlugin = mp.plugins.find((p) => p.name === 'design-system')

  const versions = {
    'design-system pkg': dsPkg.version,
    'storybook-config pkg': sbPkg.version,
    'governance pkg': governancePkg.version,
    'plugin.json': plugin.version,
    'marketplace.metadata': mp.metadata?.version,
    'marketplace.plugin': dsPlugin?.version,
  }
  const unique = new Set(Object.values(versions))
  if (unique.size !== 1) {
    throw new Error(`release-surface version drift: ${JSON.stringify(versions, null, 2)}`)
  }
})

console.log('')
if (errors.length > 0) {
  console.error(`❌ Plugin structure validation FAILED(${errors.length} errors)`)
  process.exit(1)
}
console.log('✅ Plugin structure valid — consumer can install via /plugin marketplace add github:ajenchen/design-system')
