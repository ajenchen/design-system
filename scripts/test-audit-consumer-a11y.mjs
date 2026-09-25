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

// 真實 consumer app 的形狀(Vite + React build):index.html 只有空的 #root,內容全靠 bundle 掛上。
// 這是「bundle 404 / bundle 載入後什麼都沒掛 → 空白頁 → axe 0 違規 → 舊版印 ✅ All apps pass、exit 0」
// 那個錨例的最小重現(2026-09-25,M37:沒量到被讀成沒發生)。
const SPA_BUNDLE_PATH = '/assets/index-3f9a1c.js'
const SPA_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Workspace settings</title>
    <script type="module" src="${SPA_BUNDLE_PATH}"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`
const SPA_BUNDLE = `document.getElementById('root').innerHTML =
  '<main><h1>Workspace settings</h1><button type="button">Save settings</button></main>'
`
// bundle 載得到、也執行了,但什麼都沒掛上(例:路由沒對到、render 被條件擋掉)
const SPA_BUNDLE_MOUNTS_NOTHING = 'export {}\n'

async function runFixtureChild(appsDir) {
  return runConsumerA11yAudit({ appsDir })
}

function runFixture(appsDir) {
  return spawnSync(process.execPath, ['--', SELF, CHILD_FLAG, appsDir], {
    encoding: 'utf8',
    env: process.env,
    // 上限,不是判據:儀器失效的案例要等滿「根節點出現內容」的上限(15s)才判,慢的 runner 上一次約 25–40s;
    // 被這個上限砍掉會變成 status=null 的誤紅(M32 第四問:機器慢的時候還會綠嗎)。
    timeout: 120_000,
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
      assert.doesNotMatch(
        `${mutated.stdout}\n${mutated.stderr}`,
        /INSTRUMENT-FAIL/,
        'a measured WCAG violation is a product verdict, not an instrument failure',
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

    // ── 空白 app / bundle 缺檔:必須是「儀器失效」的紅,絕不是「0 個違規 → 通過」(兩面對照)──
    const spaAppsDir = join(fixtureRoot, 'spa-apps')
    const spaDist = join(spaAppsDir, 'billing', 'dist')
    const spaBundle = join(spaDist, ...SPA_BUNDLE_PATH.split('/').filter(Boolean))
    mkdirSync(join(spaDist, 'assets'), { recursive: true })
    writeFileSync(join(spaDist, 'index.html'), SPA_SHELL)
    writeFileSync(spaBundle, SPA_BUNDLE)

    const spaIntact = runFixture(spaAppsDir)
    assert.ifError(spaIntact.error)
    assert.equal(
      spaIntact.status,
      0,
      `a bundle-rendered app must pass once its root has content\nstdout:\n${spaIntact.stdout}\nstderr:\n${spaIntact.stderr}`,
    )
    assert.match(spaIntact.stdout, /All apps pass WCAG 2 A \+ AA/)

    const assertInstrumentFailure = (run, label, reason) => {
      const text = `${run.stdout}\n${run.stderr}`
      assert.ifError(run.error)
      assert.equal(run.status, 1, `${label} must exit nonzero\n${text}`)
      assert.match(text, /\bINSTRUMENT-FAIL\b/, `${label} must be reported as an instrument failure (not measured), not as a product verdict\n${text}`)
      assert.match(text, /billing/, `${label} must name the app that was not measured\n${text}`)
      assert.match(text, reason, `${label} must say why the page was not measured\n${text}`)
      assert.doesNotMatch(text, /All apps pass|0 WCAG violations/, `${label} must never be read as zero violations\n${text}`)
      assert.doesNotMatch(text, /have a11y issues/, `${label} must not accuse the product of a11y issues it was never measured for\n${text}`)
    }

    rmSync(spaBundle)
    try {
      assertInstrumentFailure(
        runFixture(spaAppsDir),
        'a missing bundle (dist/assets 404, empty #root)',
        new RegExp(`404 ${SPA_BUNDLE_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      )
    } finally {
      writeFileSync(spaBundle, SPA_BUNDLE)
    }

    writeFileSync(spaBundle, SPA_BUNDLE_MOUNTS_NOTHING)
    try {
      assertInstrumentFailure(runFixture(spaAppsDir), 'a bundle that mounts nothing (blank app)', /empty document root/)
    } finally {
      writeFileSync(spaBundle, SPA_BUNDLE)
    }

    const spaRestored = runFixture(spaAppsDir)
    assert.ifError(spaRestored.error)
    assert.equal(
      spaRestored.status,
      0,
      `restored bundle-rendered app must pass\nstdout:\n${spaRestored.stdout}\nstderr:\n${spaRestored.stderr}`,
    )
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }

  console.log('✅ consumer a11y paired mutation: owned loopback server + build integrity + real axe violation fail closed + blank app / missing bundle = INSTRUMENT-FAIL')
}

if (process.argv[2] === CHILD_FLAG) {
  process.exitCode = await runFixtureChild(process.argv[3])
} else {
  await runMetaTest()
}
