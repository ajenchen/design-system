#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  annotateForkSkill,
  buildCorpus,
  collectForkGovernanceDrift,
  validateProductRoleSkillMarkdown,
} from './build-fork-governance.mjs'
import { PROVIDER_REGISTRY } from './gen-codex-adapter.mjs'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const makeRoot = () => realpathSync(mkdtempSync(join(tmpdir(), 'build-fork-filesystem-')))
const compatibilityProviderId = PROVIDER_REGISTRY.canonical.compatibilityProjections.legacyClaudeInstruction.providerId
const compatibilityInstruction = PROVIDER_REGISTRY.providers.find((provider) => provider.id === compatibilityProviderId).instructionEntry

{
  const projected = annotateForkSkill(`---
name: product-role-regression
---

- full canonical hook: \`packages/design-system/ds-canonical/hooks/lib/_code_quality.sh\`
- transformed hook: \`node_modules/@qijenchen/design-system/ds-canonical/hooks/check_story_invariants.sh\`
- provider hook: \`.claude/hooks/retired/2026-06/check_old_rule.sh\`
- local hook: \`lib/_token_hygiene.sh\`
- short retired directory: \`hooks/retired/\`
- world-class source: https://polaris.shopify.com/tokens/space
- consumer bootstrap: \`npm run setup:governance\`
- DS-author build: \`npm run build:lib -- --check\`
- DS-author release: \`npm run release:preflight\`
`)
  assert.match(projected, /Product-role projection/)
  assert.match(projected, /https:\/\/polaris\.shopify\.com\/tokens\/space/)
  assert.match(projected, /`npm run setup:governance`/)
  assert.match(projected, /`npm run build`/)
  assert.match(projected, /`npm run governance:check and rely on protected product CI`/)
  assert.doesNotMatch(projected, /(?:packages|node_modules)\/[^\n]*ds-canonical\/hooks\/|\.claude\/hooks\/|`hooks\/retired\/`|lib\/_token_hygiene\.sh/)
  assert.deepEqual(validateProductRoleSkillMarkdown(projected), [])

  assert.match(
    validateProductRoleSkillMarkdown('- malformed `inline code\n').join('\n'),
    /unbalanced inline-code delimiter/,
  )
  assert.match(
    validateProductRoleSkillMarkdown('- npm publish\n').join('\n'),
    /DS-author release command/,
  )
}

for (const attack of ['output-root', 'skill-target', 'instruction-target']) {
  const root = makeRoot()
  const output = join(root, 'fork')
  const template = join(root, 'template')
  const external = realpathSync(mkdtempSync(join(tmpdir(), 'build-fork-external-')))
  const externalSentinel = join(external, 'DO-NOT-MUTATE.txt')
  writeFileSync(externalSentinel, 'external-untouched\n')
  try {
    if (attack === 'output-root') {
      symlinkSync(external, output)
    } else {
      mkdirSync(output, { recursive: true })
      writeFileSync(join(output, 'PREEXISTING.txt'), 'output-untouched\n')
      if (attack === 'skill-target') {
        mkdirSync(join(template, '.agents'), { recursive: true })
        symlinkSync(external, join(template, '.agents/skills'))
      } else {
        mkdirSync(template, { recursive: true })
        symlinkSync(externalSentinel, join(template, compatibilityInstruction))
      }
    }
    assert.throws(() => buildCorpus({ outDir: output, templateRoot: template }), /symbolic link|symlink/)
    assert.equal(readFileSync(externalSentinel, 'utf8'), 'external-untouched\n')
    if (attack !== 'output-root') assert.equal(readFileSync(join(output, 'PREEXISTING.txt'), 'utf8'), 'output-untouched\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(external, { recursive: true, force: true })
  }
}

{
  const root = makeRoot()
  try {
    const output = join(root, 'fork')
    const template = join(root, 'template')
    mkdirSync(template, { recursive: true })
    writeFileSync(join(template, compatibilityInstruction), 'tampered generated view\n')
    const built = buildCorpus({ outDir: output, templateRoot: template })
    const surface = built.manifest.providerSurfaces[compatibilityProviderId]
    const canonical = readFileSync(join(output, surface.instructionArtifact))
    assert.equal(readFileSync(join(template, surface.instructionDestination)).equals(canonical), true)
    assert.equal(readFileSync(join(output, built.manifest.consumer.claudeMd)).equals(canonical), true)
    const lockByFile = new Map(built.lockEntries.map((entry) => [entry.file, entry]))
    for (const [file, source] of [
      ['references/story-baseline-registry.json', 'packages/design-system/ds-canonical/references/story-baseline-registry.json'],
      ['references/story-baseline-registry.schema.json', 'packages/design-system/ds-canonical/references/story-baseline-registry.schema.json'],
      ['references/utility-registry.json', 'packages/design-system/src/tokens/utility-registry.json'],
      ['references/utility-registry.schema.json', 'packages/design-system/src/tokens/utility-registry.schema.json'],
    ]) {
      assert.equal(lockByFile.get(file)?.source, source, `${file} must retain canonical SSOT provenance`)
      assert.equal(
        readFileSync(join(output, file)).equals(readFileSync(join(REPOSITORY_ROOT, source))),
        true,
        `${file} must be a byte-exact locked projection`,
      )
    }
    const opacityHook = readFileSync(join(output, 'hooks/check_opacity_token_usage.sh'), 'utf8')
    assert.match(opacityHook, /\$CORPUS_ROOT\/references\/utility-registry\.json/)
    assert.doesNotMatch(opacityHook, /\$CORPUS_ROOT\/node_modules\//)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

{
  const root = makeRoot()
  try {
    const expectedOut = join(root, 'expected-fork')
    const expectedTemplate = join(root, 'expected-template')
    const actualOut = join(root, 'actual-fork')
    const actualTemplate = join(root, 'actual-template')
    const expected = buildCorpus({ outDir: expectedOut, templateRoot: expectedTemplate })
    buildCorpus({ outDir: actualOut, templateRoot: actualTemplate })
    const drift = () => collectForkGovernanceDrift({
      manifest: expected.manifest,
      actualOut,
      expectedOut,
      actualTemplate,
      expectedTemplate,
    })
    const schemaPath = 'schemas/provider-cli-toolchain.schema.json'
    const actualSchema = join(actualTemplate, schemaPath)
    const expectedSchema = join(expectedTemplate, schemaPath)

    assert.deepEqual(drift(), [], 'two independent temp builds must have no generated-output drift')
    rmSync(actualSchema)
    assert.ok(
      drift().includes(`template/${schemaPath}: missing`),
      'deleting a generated template schema must fail the exact --check drift predicate',
    )
    writeFileSync(actualSchema, readFileSync(expectedSchema))
    writeFileSync(actualSchema, Buffer.concat([readFileSync(actualSchema), Buffer.from('\npoison\n')]))
    assert.ok(
      drift().includes(`template/${schemaPath}: content`),
      'tampering with a generated template schema must fail the exact --check drift predicate',
    )
  } finally { rmSync(root, { recursive: true, force: true }) }
}

console.log('✓ fork build blocks unsafe filesystem aliases, restores product instructions, and detects deleted/tampered template schemas')
