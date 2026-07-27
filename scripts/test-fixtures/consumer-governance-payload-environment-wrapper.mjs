import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'

process.env.GOVERNANCE_TOOL_INPUT = 'n'.repeat(4 * 1024 * 1024)
process.env.CLAUDE_TOOL_INPUT = 'c'.repeat(4 * 1024 * 1024)
process.env.UNREGISTERED_TOOL_INPUT = 'u'.repeat(4 * 1024 * 1024)
process.env.GOVERNANCE_PROVIDER = 'attacker'
process.env.GOVERNANCE_SELF_PROVIDER = 'attacker'
process.env.GOVERNANCE_WRITE_STATE_TRUST = 'attacker'
process.env.GOVERNANCE_TRANSCRIPT_TRUST = 'attacker'
process.env.GOVERNANCE_TRANSCRIPT_PATH = '/attacker/transcript'
process.env.GOVERNANCE_RUNTIME_ROOT = '/attacker/runtime'
process.env.GOVERNANCE_STATE_DIR = '/attacker/state'
process.env.GOVERNANCE_TELEMETRY_OPT_IN = '1'
process.env.NODE_OPTIONS = '--require=/definitely-not-a-real-governance-module.cjs'
process.env.BASH_ENV = '/definitely-not-a-real-governance-profile.sh'

const transientReplayTimeout = process.argv.includes('--test-transient-replay-timeout')
const persistentReplayTimeout = process.argv.includes('--test-persistent-replay-timeout')
const liveHookSwapAfterSnapshot = process.argv.includes('--test-live-hook-swap-after-snapshot')
const liveSourceSwapAfterCapture = process.argv.includes('--test-live-source-swap-after-capture')
const replayTimeoutInjectionLimit = transientReplayTimeout ? 1 : persistentReplayTimeout ? 2 : 0
let replayTimeoutInjectionCount = 0
let liveSwapInjected = false
if (replayTimeoutInjectionLimit > 0 || liveHookSwapAfterSnapshot || liveSourceSwapAfterCapture) {
  const nativeSpawnSync = childProcess.spawnSync
  childProcess.spawnSync = (command, args, options) => {
    const isReplayChild = (
      options?.timeout === 30000
      && options?.encoding === null
      && Array.isArray(args)
      && args.length === 1
      && /[/\\]hooks[/\\]/.test(String(args[0]))
    )
    if (!isReplayChild) return nativeSpawnSync(command, args, options)
    if (!liveSwapInjected && liveHookSwapAfterSnapshot) {
      const suffix = String(args[0]).split(/[/\\]fork[/\\]/).at(-1)
      const liveHook = resolve(
        'node_modules/@qijenchen/design-system/ds-canonical/fork',
        suffix,
      )
      writeFileSync(process.env.TEST_LIVE_SWAP_RECORD, JSON.stringify({
        path: liveHook,
        body: readFileSync(liveHook).toString('base64'),
      }))
      writeFileSync(
        liveHook,
        '#!/usr/bin/env bash\nprintf "LIVE_HOOK_SWAP_EXECUTED\\n" >&2\nexit 70\n',
      )
      liveSwapInjected = true
    } else if (!liveSwapInjected && liveSourceSwapAfterCapture) {
      const payload = JSON.parse(Buffer.from(options.input).toString('utf8'))
      const liveSource = payload?.tool_input?.file_path
      writeFileSync(process.env.TEST_LIVE_SWAP_RECORD, JSON.stringify({
        path: liveSource,
        body: readFileSync(liveSource).toString('base64'),
      }))
      writeFileSync(liveSource, Buffer.concat([
        readFileSync(liveSource),
        Buffer.from('\n// LIVE_SOURCE_SWAP_AFTER_CAPTURE\n'),
      ]))
      liveSwapInjected = true
    }
    if (replayTimeoutInjectionCount < replayTimeoutInjectionLimit) {
      replayTimeoutInjectionCount += 1
      if (replayTimeoutInjectionCount === replayTimeoutInjectionLimit) {
        process.stderr.write(
          transientReplayTimeout
            ? 'TEST_TRANSIENT_REPLAY_TIMEOUT_INJECTED\n'
            : `TEST_PERSISTENT_REPLAY_TIMEOUT_INJECTED=${replayTimeoutInjectionCount}\n`,
        )
      }
      const error = Object.assign(new Error('synthetic transient replay timeout'), {
        code: 'ETIMEDOUT',
      })
      return {
        error,
        output: [null, Buffer.alloc(0), Buffer.alloc(0)],
        pid: 0,
        signal: 'SIGKILL',
        status: null,
        stderr: Buffer.alloc(0),
        stdout: Buffer.alloc(0),
      }
    }
    return nativeSpawnSync(command, args, options)
  }
  syncBuiltinESMExports()
}

await import(pathToFileURL(resolve(
  'node_modules/@qijenchen/design-system/ds-canonical/fork/consumer/governance-check.mjs',
)).href)
