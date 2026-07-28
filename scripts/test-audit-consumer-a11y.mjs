#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runConsumerA11yAudit, startStaticServer } from './audit-consumer-a11y.mjs'

const SELF = fileURLToPath(import.meta.url)
const CHILD_FLAG = '--fixture-child'
const VALID_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Consumer accessibility fixture</title>
  </head>
  <body>
    <main>
      <h1>Workspace settings</h1>
      <button type="button">Save settings</button>
    </main>
  </body>
</html>
`
const BUTTON_NAME_VIOLATION = VALID_PAGE.replace('>Save settings</button>', '></button>')

async function runFixtureChild(appsDir) {
  return runConsumerA11yAudit({
    appsDir,
    auditOptions: { settleMs: 0 },
  })
}

function runFixture(appsDir) {
  return spawnSync(process.execPath, ['--', SELF, CHILD_FLAG, appsDir], {
    encoding: 'utf8',
    env: process.env,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  })
}

async function runMetaTest() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'consumer-a11y-meta-'))
  const appsDir = join(fixtureRoot, 'apps')
  const pagePath = join(appsDir, 'workspace', 'dist', 'index.html')

  try {
    mkdirSync(join(appsDir, 'workspace', 'dist'), { recursive: true })
    writeFileSync(pagePath, VALID_PAGE)

    const quietLogger = { log() {}, error() {} }
    const startupFailure = await runConsumerA11yAudit({
      appsDir,
      logger: quietLogger,
      startServer: async () => { throw new Error('fixture startup failure') },
      auditUrl: async () => [],
    })
    assert.equal(startupFailure, 1, 'server startup failure must block instead of auditing another process')

    let stopped = false
    const auditFailure = await runConsumerA11yAudit({
      appsDir,
      logger: quietLogger,
      startServer: async () => ({
        origin: 'http://127.0.0.1:49151',
        async stop() {
          await new Promise(resolve => setTimeout(resolve, 10))
          stopped = true
        },
      }),
      auditUrl: async () => { throw new Error('fixture transport failure') },
    })
    assert.equal(auditFailure, 1, 'audit transport failure must block')
    assert.equal(stopped, true, 'owned server shutdown must be awaited after audit failure')

    for (const [label, malformedAxeResult] of [
      ['missing violations array', {}],
      ['malformed violation nodes', [{ id: 'color-contrast', description: 'fixture violation', nodes: 'not-an-array' }]],
      ['malformed node shape', [{ id: 'color-contrast', description: 'fixture violation', nodes: [{}] }]],
    ]) {
      let malformedStopped = false
      const malformedStatus = await runConsumerA11yAudit({
        appsDir,
        logger: quietLogger,
        startServer: async () => ({
          origin: 'http://127.0.0.1:49152',
          async stop() {
            await new Promise(resolve => setTimeout(resolve, 5))
            malformedStopped = true
          },
        }),
        auditUrl: async () => malformedAxeResult,
      })
      assert.equal(malformedStatus, 1, `${label} must fail closed instead of being interpreted as zero violations`)
      assert.equal(malformedStopped, true, `${label} path must await owned server shutdown`)
    }

    const firstDist = join(fixtureRoot, 'first-dist')
    const secondDist = join(fixtureRoot, 'second-dist')
    mkdirSync(firstDist)
    mkdirSync(secondDist)
    writeFileSync(join(firstDist, 'index.html'), '<!doctype html><title>first-owned-server</title>')
    writeFileSync(join(secondDist, 'index.html'), '<!doctype html><title>second-owned-server</title>')
    const [firstServer, secondServer] = await Promise.all([
      startStaticServer({ distPath: firstDist }),
      startStaticServer({ distPath: secondDist }),
    ])
    try {
      assert.match(firstServer.origin, /^http:\/\/127\.0\.0\.1:\d+$/)
      assert.match(secondServer.origin, /^http:\/\/127\.0\.0\.1:\d+$/)
      assert.notEqual(firstServer.origin, secondServer.origin, 'concurrent audits must own distinct ephemeral ports')
      assert.match(await (await fetch(firstServer.origin)).text(), /first-owned-server/)
      assert.match(await (await fetch(secondServer.origin)).text(), /second-owned-server/)
    } finally {
      await Promise.all([firstServer.stop(), secondServer.stop()])
    }

    const original = readFileSync(pagePath)
    rmSync(pagePath)
    try {
      assert.equal(
        await runConsumerA11yAudit({ appsDir, logger: quietLogger, auditUrl: async () => [] }),
        1,
        'an empty/missing dist index must block before a directory listing can be audited',
      )
    } finally {
      writeFileSync(pagePath, original)
    }

    const baseline = runFixture(appsDir)
    assert.ifError(baseline.error)
    assert.equal(
      baseline.status,
      0,
      `valid closed fixture must pass\nstdout:\n${baseline.stdout}\nstderr:\n${baseline.stderr}`,
    )

    const originalPage = readFileSync(pagePath)
    try {
      writeFileSync(pagePath, BUTTON_NAME_VIOLATION)
      const mutated = runFixture(appsDir)
      assert.ifError(mutated.error)
      assert.equal(mutated.status, 1, 'a real unnamed-button WCAG violation must exit nonzero')
      assert.match(
        `${mutated.stdout}\n${mutated.stderr}`,
        /button-name/,
        'the failure must come from the real axe button-name rule',
      )
    } finally {
      writeFileSync(pagePath, originalPage)
    }

    assert.deepEqual(readFileSync(pagePath), originalPage, 'fixture bytes must be restored before the final probe')
    const restored = runFixture(appsDir)
    assert.ifError(restored.error)
    assert.equal(
      restored.status,
      0,
      `restored fixture must pass\nstdout:\n${restored.stdout}\nstderr:\n${restored.stderr}`,
    )
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }

  console.log('✅ consumer a11y paired mutation: owned loopback server + build integrity + real axe violation fail closed')
}

if (process.argv[2] === CHILD_FLAG) {
  process.exitCode = await runFixtureChild(process.argv[3])
} else {
  await runMetaTest()
}
