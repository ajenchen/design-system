import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  inspectNetlifyManualSetup,
  NETLIFY_CLI_INSTALLATION_BLOCKER,
  NETLIFY_MANUAL_REQUIRED_EXIT_CODE,
  renderNetlifyManualSetup,
  STORYBOOK_BASIC_AUTH_SOURCE_SHA256,
} from './setup-netlify-access.mjs'
import basicAuth, {
  enforceStorybookBasicAuth,
  STORYBOOK_ACCESS_POLICY,
  STORYBOOK_AUTH_MISCONFIGURED_STATUS,
  STORYBOOK_AUTH_REQUIRED_STATUS,
} from '../template/ds-product-template/netlify/edge-functions/basic-auth.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(ROOT, 'scripts/setup-netlify-access.mjs')
const TEMPLATE = join(ROOT, 'template/ds-product-template')
const EDGE_FUNCTION_SOURCE = readFileSync(
  join(TEMPLATE, 'netlify/edge-functions/basic-auth.ts'),
  'utf8',
)

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function fixture(t, { complete = true } = {}) {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'netlify-manual-setup-test-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  write(join(root, 'package.json'), '{"name":"manual-netlify-fixture","private":true}\n')
  if (complete) {
    write(join(root, 'netlify.toml'), '[build]\n  command = "npm run build"\n  publish = "dist"\n\n[[edge_functions]]\n  path = "/*"\n  function = "basic-auth"\n')
    write(join(root, 'netlify/edge-functions/basic-auth.ts'), EDGE_FUNCTION_SOURCE)
  }
  return root
}

function snapshot(root) {
  const entries = []
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const info = lstatSync(path)
      const key = relative(root, path)
      if (info.isSymbolicLink()) entries.push([key, 'symlink', readlinkSync(path)])
      else if (info.isDirectory()) {
        entries.push([key, 'directory'])
        visit(path)
      } else entries.push([key, 'file', info.mode & 0o777, readFileSync(path).toString('base64')])
    }
  }
  visit(root)
  return entries
}

function request(authorization = '') {
  const headers = authorization ? { authorization } : undefined
  return new Request('https://storybook.example.test/', { headers })
}

function basic(value, scheme = 'Basic') {
  return `${scheme} ${Buffer.from(value, 'utf8').toString('base64')}`
}

test('edge auth policy is explicitly versioned and fail-closed constants are stable', () => {
  assert.equal(STORYBOOK_ACCESS_POLICY, 'fail-closed-v1')
  assert.equal(STORYBOOK_AUTH_MISCONFIGURED_STATUS, 503)
  assert.equal(STORYBOOK_AUTH_REQUIRED_STATUS, 401)
  assert.equal(createHash('sha256').update(EDGE_FUNCTION_SOURCE).digest('hex'), STORYBOOK_BASIC_AUTH_SOURCE_SHA256)
})

test('missing or malformed credential configuration returns 503 and never challenges or passes through', async () => {
  const malformedConfigurations = [
    undefined,
    '',
    '   ',
    'alice',
    ':password',
    'alice:',
    'alice:password malformed-entry',
    'alice:password bob:',
    'alice:pass\u0000word',
    Array.from({ length: 33 }, (_, index) => `user${index}:password`).join(' '),
    `alice:${'x'.repeat(4096)}`,
  ]
  for (const configuration of malformedConfigurations) {
    const response = enforceStorybookBasicAuth(request(), configuration)
    assert.ok(response instanceof Response, `configuration ${JSON.stringify(configuration)} passed through`)
    assert.equal(response.status, STORYBOOK_AUTH_MISCONFIGURED_STATUS)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.has('www-authenticate'), false)
    assert.equal(await response.text(), 'Authentication service unavailable.')
  }
})

test('valid configuration returns 401 for missing, malformed, oversized, or invalid authorization', async () => {
  const invalidHeaders = [
    '',
    'Bearer token',
    'Basic !!!',
    'Basic /w==',
    'Basic',
    basic('alice:wrong'),
    basic('unknown:password'),
    `Basic ${'A'.repeat(2050)}`,
  ]
  for (const header of invalidHeaders) {
    const response = enforceStorybookBasicAuth(request(header), 'alice:password bob:secret')
    assert.ok(response instanceof Response, `authorization ${JSON.stringify(header)} passed through`)
    assert.equal(response.status, STORYBOOK_AUTH_REQUIRED_STATUS)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('www-authenticate'), 'Basic realm="Storybook", charset="UTF-8"')
    assert.equal(await response.text(), 'Authentication required.')
  }
})

test('only an exact configured credential passes through', () => {
  assert.equal(enforceStorybookBasicAuth(request(basic('alice:password')), 'alice:password'), undefined)
  assert.equal(
    enforceStorybookBasicAuth(request(basic('bob:secret:with-colon', 'basic')), 'alice:password bob:secret:with-colon'),
    undefined,
  )
  assert.equal(enforceStorybookBasicAuth(request(basic('測試者:正確密碼')), '測試者:正確密碼'), undefined)
})

test('default edge entrypoint reads the env and converts missing or denied access into 503', () => {
  const previous = globalThis.Deno
  let rawCredentials = 'alice:password'
  let denied = false
  globalThis.Deno = {
    env: {
      get() {
        if (denied) throw new Error('permission denied')
        return rawCredentials
      },
    },
  }
  try {
    assert.equal(basicAuth(request(basic('alice:password'))), undefined)
    rawCredentials = undefined
    const missing = basicAuth(request())
    assert.ok(missing instanceof Response)
    assert.equal(missing.status, STORYBOOK_AUTH_MISCONFIGURED_STATUS)
    denied = true
    const inaccessible = basicAuth(request())
    assert.ok(inaccessible instanceof Response)
    assert.equal(inaccessible.status, STORYBOOK_AUTH_MISCONFIGURED_STATUS)
  } finally {
    if (previous === undefined) delete globalThis.Deno
    else globalThis.Deno = previous
  }
})

test('blocker is explicit, closed, and requires zero high findings before re-enable', () => {
  assert.deepEqual(Object.keys(NETLIFY_CLI_INSTALLATION_BLOCKER).sort(), [
    'assessedAt',
    'assessedPackage',
    'code',
    'decision',
    'highSeverityFindings',
    'reenableCriteria',
    'schemaVersion',
    'setupComplete',
    'status',
  ])
  assert.equal(NETLIFY_CLI_INSTALLATION_BLOCKER.code, 'NETLIFY-CLI-AUTO-INSTALL-BLOCKED-001')
  assert.equal(NETLIFY_CLI_INSTALLATION_BLOCKER.assessedPackage, 'netlify-cli@26.2.0')
  assert.equal(NETLIFY_CLI_INSTALLATION_BLOCKER.highSeverityFindings, 5)
  assert.equal(NETLIFY_CLI_INSTALLATION_BLOCKER.decision, 'dashboard-manual-only')
  assert.equal(NETLIFY_CLI_INSTALLATION_BLOCKER.setupComplete, false)
  assert.equal(NETLIFY_CLI_INSTALLATION_BLOCKER.reenableCriteria.some(value => value.includes('zero high-severity')), true)
})

test('manual diagnostic is read-only and recognizes the complete template wiring', (t) => {
  const root = fixture(t)
  write(join(root, '.netlify/state.json'), '{"siteSlug":"safe-preview"}\n')
  write(join(root, '.netlify/deploy-meta.json'), '{"siteName":"safe-preview","siteUrl":"https://safe-preview.netlify.app","adminUrl":"https://app.netlify.com/projects/safe-preview"}\n')
  const before = snapshot(root)
  const diagnostic = inspectNetlifyManualSetup(root)
  assert.deepEqual(snapshot(root), before)
  assert.equal(diagnostic.status, 'manual-required')
  assert.equal(diagnostic.setupComplete, false)
  assert.equal(diagnostic.exitCode, NETLIFY_MANUAL_REQUIRED_EXIT_CODE)
  assert.deepEqual(diagnostic.automatedCommandsExecuted, [])
  assert.deepEqual(diagnostic.checks, {
    basicAuthEdgeFunctionPresent: true,
    basicAuthFailClosed: true,
    edgeFunctionWired: true,
    netlifyConfigurationPresent: true,
    packageManifestPresent: true,
  })
  assert.deepEqual(diagnostic.accessControl, {
    policyVersion: 'fail-closed-v1',
    misconfiguredStatus: 503,
    unauthenticatedStatus: 401,
    credentialConfigurationVerified: false,
    liveReadbackVerified: false,
    sharingAllowed: false,
  })
  assert.deepEqual(diagnostic.issues, [])
  assert.equal(diagnostic.discoveredSite.siteName, 'safe-preview')
  assert.equal(diagnostic.discoveredSite.siteUrl, 'https://safe-preview.netlify.app')
  assert.equal(diagnostic.discoveredSite.projectUrl, 'https://app.netlify.com/projects/safe-preview')
  const output = renderNetlifyManualSetup(diagnostic)
  assert.match(output, /NETLIFY-CLI-AUTO-INSTALL-BLOCKED-001/)
  assert.match(output, /Import an existing project/)
  assert.match(output, /STORYBOOK_BASIC_AUTH/)
  assert.match(output, /Branch deploys: All/)
  assert.match(output, /live readback/)
  assert.match(output, /回 503/)
  assert.match(output, /MANUAL ACTION REQUIRED/)
})

test('comments cannot masquerade as active edge-function wiring', (t) => {
  const root = fixture(t, { complete: false })
  write(join(root, 'netlify.toml'), '[build]\n  publish = "dist"\n# [[edge_functions]] path="/*" function="basic-auth"\n')
  const diagnostic = inspectNetlifyManualSetup(root)
  assert.equal(diagnostic.checks.netlifyConfigurationPresent, true)
  assert.equal(diagnostic.checks.edgeFunctionWired, false)
  assert.equal(diagnostic.checks.basicAuthEdgeFunctionPresent, false)
  assert.equal(diagnostic.checks.basicAuthFailClosed, false)
  assert.doesNotMatch(renderNetlifyManualSetup(diagnostic), /Key: STORYBOOK_BASIC_AUTH/)
  assert.match(renderNetlifyManualSetup(diagnostic), /not claim|\u4e0d可宣稱/)
})

test('edge wiring requires one exact all-path basic-auth declaration with no exclusions', (t) => {
  for (const [label, toml] of [
    ['wrong path', '[build]\n\n[[edge_functions]]\npath = "/private-only"\nfunction = "basic-auth"\n'],
    ['split tables', '[build]\n\n[[edge_functions]]\npath = "/*"\nfunction = "other"\n\n[[edge_functions]]\npath = "/private-only"\nfunction = "basic-auth"\n'],
    ['excluded path', '[build]\n\n[[edge_functions]]\npath = "/*"\nfunction = "basic-auth"\nexcludedPath = "/public/*"\n'],
    ['duplicate declaration', '[build]\n\n[[edge_functions]]\npath = "/*"\nfunction = "basic-auth"\n\n[[edge_functions]]\npath = "/*"\nfunction = "basic-auth"\n'],
    ['header restriction', '[build]\n\n[[edge_functions]]\npath = "/*"\nfunction = "basic-auth"\n\n[edge_functions.header]\nx-protected = true\n'],
    ['comment-only tuple', '[build]\n\n[[edge_functions]]\nfunction = "other"\n# path = "/*"\n# function = "basic-auth"\n'],
  ]) {
    const root = fixture(t)
    write(join(root, 'netlify.toml'), toml)
    const diagnostic = inspectNetlifyManualSetup(root)
    assert.equal(diagnostic.checks.edgeFunctionWired, false, label)
    assert.equal(diagnostic.accessControl.sharingAllowed, false, label)
    assert.doesNotMatch(renderNetlifyManualSetup(diagnostic), /Key: STORYBOOK_BASIC_AUTH/, label)
  }
})

test('manual diagnostic rejects the previous missing-secret pass-through implementation', (t) => {
  const root = fixture(t)
  write(
    join(root, 'netlify/edge-functions/basic-auth.ts'),
    "export default function basicAuth() {\n  const creds = Deno.env.get('STORYBOOK_BASIC_AUTH')\n  if (!creds) return\n  return new Response('Authentication required.', { status: 401 })\n}\n",
  )
  const diagnostic = inspectNetlifyManualSetup(root)
  assert.equal(diagnostic.checks.basicAuthEdgeFunctionPresent, true)
  assert.equal(diagnostic.checks.basicAuthFailClosed, false)
  assert.equal(diagnostic.accessControl.policyVersion, '')
  assert.equal(diagnostic.accessControl.sharingAllowed, false)
  assert.match(diagnostic.issues.join('\n'), /does not implement fail-closed-v1/)
  assert.doesNotMatch(renderNetlifyManualSetup(diagnostic), /Key: STORYBOOK_BASIC_AUTH/)
})

test('comments and dead code cannot counterfeit the reviewed edge-function bytes', (t) => {
  const root = fixture(t)
  write(
    join(root, 'netlify/edge-functions/basic-auth.ts'),
    `// export const STORYBOOK_ACCESS_POLICY = 'fail-closed-v1'
// export const STORYBOOK_AUTH_MISCONFIGURED_STATUS = 503
// export const STORYBOOK_AUTH_REQUIRED_STATUS = 401
// Deno.env.get('STORYBOOK_BASIC_AUTH')
// if (!allowed) return unavailableResponse()
export default function basicAuth() {
  return undefined
}
`,
  )
  const diagnostic = inspectNetlifyManualSetup(root)
  assert.equal(diagnostic.checks.basicAuthEdgeFunctionPresent, true)
  assert.equal(diagnostic.checks.basicAuthFailClosed, false)
  assert.equal(diagnostic.accessControl.sharingAllowed, false)
  assert.match(diagnostic.issues.join('\n'), /does not implement fail-closed-v1/)
})

test('CLI entrypoint returns structured manual-required diagnostics with exit 2', () => {
  const result = spawnSync(process.execPath, ['--', SCRIPT, '--check', '--json'], {
    cwd: TEMPLATE,
    encoding: 'utf8',
    shell: false,
    timeout: 10_000,
  })
  assert.equal(result.status, NETLIFY_MANUAL_REQUIRED_EXIT_CODE, result.stderr)
  assert.equal(result.stderr, '')
  const diagnostic = JSON.parse(result.stdout)
  assert.equal(diagnostic.kind, 'netlify-manual-setup-diagnostic')
  assert.equal(diagnostic.status, 'manual-required')
  assert.equal(diagnostic.setupComplete, false)
  assert.deepEqual(diagnostic.automatedCommandsExecuted, [])
  assert.equal(diagnostic.checks.netlifyConfigurationPresent, true)
  assert.equal(diagnostic.checks.edgeFunctionWired, true)
  assert.equal(diagnostic.checks.basicAuthEdgeFunctionPresent, true)
  assert.equal(diagnostic.checks.basicAuthFailClosed, true)
  assert.equal(diagnostic.accessControl.sharingAllowed, false)

  const help = spawnSync(process.execPath, ['--', SCRIPT, '--help'], { cwd: TEMPLATE, encoding: 'utf8', shell: false, timeout: 10_000 })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /never installs or invokes Netlify CLI/)

  const invalid = spawnSync(process.execPath, ['--', SCRIPT, '--execute'], { cwd: TEMPLATE, encoding: 'utf8', shell: false, timeout: 10_000 })
  assert.equal(invalid.status, 64)
  assert.match(invalid.stderr, /unsupported or duplicate argument/)
})

test('unsafe local metadata and symlinked authority fail closed', (t) => {
  const root = fixture(t)
  write(join(root, '.netlify/deploy-meta.json'), '{"siteName":"unsafe/name","siteUrl":"https://attacker.invalid/path","adminUrl":"https://attacker.invalid/"}\n')
  const diagnostic = inspectNetlifyManualSetup(root)
  assert.deepEqual(diagnostic.discoveredSite, { projectUrl: '', siteName: '', siteUrl: '' })

  const linkedRoot = fixture(t, { complete: false })
  const external = join(linkedRoot, 'outside.toml')
  write(external, '[build]\n')
  symlinkSync(external, join(linkedRoot, 'netlify.toml'))
  assert.throws(() => inspectNetlifyManualSetup(linkedRoot), /netlify\.toml must be one regular no-link file/)
})

test('active setup surfaces contain no mutable Netlify CLI acquisition route or stale auto-setup claim', () => {
  const files = [
    '.devcontainer/onboard-banner.sh',
    'governance/memory/reference_deploy_targets.md',
    'packages/design-system/ds-canonical/references/scenario-definition.md',
    'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md',
    'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md',
    'scripts/deploy-url.mjs',
    'scripts/setup-netlify-access.mjs',
    'template/ds-product-template/.devcontainer/onboard-banner.sh',
    'template/ds-product-template/.gitignore',
    'template/ds-product-template/.storybook/manager-head.html',
    'template/ds-product-template/README.md',
    'template/ds-product-template/docs/01-first-time-setup.md',
    'template/ds-product-template/docs/02-create-new-product.md',
  ]
  const forbidden = [
    /npm\s+(?:install|i)\s+-g[^\n]*netlify-cli/i,
    /npx\s+(?:-y|--yes)[^\n]*netlify-cli/i,
    /CLI install \+ login \+ site/i,
    /auto-creates site/i,
  ]
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), 'utf8')
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${file} retains ${pattern}`)
  }

  for (const file of [
    'governance/memory/reference_deploy_targets.md',
    'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md',
    'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md',
  ]) {
    const source = readFileSync(join(ROOT, file), 'utf8')
    assert.match(source, /NETLIFY-CLI-AUTO-INSTALL-BLOCKED-001/, `${file} lost the blocker identity`)
    assert.match(source, /netlify-cli@26\.2\.0/, `${file} lost the assessed exact version`)
    assert.match(source, /5 high(?:-severity)?/, `${file} lost the high-severity finding count`)
  }

  const executable = readFileSync(SCRIPT, 'utf8')
  for (const pattern of [
    /node:child_process/,
    /\bexec(?:File|Sync)?\s*\(/,
    /\bspawn(?:Sync)?\s*\(/,
    /\bnetlify\s+(?:login|init|link|sites:create|api)\b/,
  ]) assert.doesNotMatch(executable, pattern)
})

test('active Netlify guidance contains no missing-secret public pass-through or collapsed 401 claim', () => {
  const files = [
    'governance/memory/reference_deploy_targets.md',
    'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md',
    'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md',
    'template/ds-product-template/.env.example',
    'template/ds-product-template/.storybook/manager-head.html',
    'template/ds-product-template/docs/02-create-new-product.md',
    'template/ds-product-template/netlify.toml',
    'template/ds-product-template/netlify/edge-functions/basic-auth.ts',
  ]
  for (const file of files) {
    const source = readFileSync(join(ROOT, file), 'utf8')
    assert.doesNotMatch(source, /未設[^\n]*=\s*(?:站台)?公開/, `${file} retains missing-secret pass-through guidance`)
    assert.doesNotMatch(source, /缺\/錯回\s*401/, `${file} collapses misconfiguration into an auth challenge`)
  }
})
