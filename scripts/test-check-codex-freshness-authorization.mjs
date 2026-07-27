import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '..')
const script = resolve(import.meta.dirname, 'check-codex-freshness.mjs')

test('Codex freshness probe cannot call a model without an explicit bounded execution-intent flag', () => {
  const isolatedHome = mkdtempSync(resolve(tmpdir(), 'codex-freshness-home-'))
  try {
    const result = spawnSync(process.execPath, ['--', script, '--probe'], {
      cwd: repoRoot,
      env: { ...process.env, HOME: isolatedHome },
      encoding: 'utf8',
    })
    assert.equal(result.status, 2)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /--allow-model/)
  } finally {
    rmSync(isolatedHome, { recursive: true, force: true })
  }
})

test('Codex freshness binds execution to the canonical toolchain lock and treats registry latest as advisory', () => {
  const source = readFileSync(script, 'utf8')
  assert.match(source, /infra\/governance\/providers\/provider-cli-toolchain\.json/)
  assert.match(source, /installed !== locked/)
  assert.match(source, /registry latest[^\n]*輪替|canonical lock 仍為/)
  assert.doesNotMatch(source, /execSync|npm view @openai\/codex/)
  assert.match(source, /spawnSync\(CODEX_SHIM,[\s\S]*shell: false/)
})
