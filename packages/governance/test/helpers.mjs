import { access, chmod, cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { compareUtf8Bytes } from '../src/canonical-order.mjs'
import { inventoryTree } from '../src/common.mjs'
import { buildProviderHookGroupLaunchArgv } from '../../../scripts/lib/provider-hook-output-transport.mjs'

export async function write(root, path, body, mode = 0o644) {
  const target = resolve(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, body)
  await chmod(target, mode)
}

export async function makeRepository() {
  const root = await mkdtemp(resolve(tmpdir(), 'qijenchen-governance-fixture-'))
  const authorityRoot = resolve(import.meta.dirname, '../../..')
  const providerRegistry = JSON.parse(await readFile(
    resolve(authorityRoot, 'packages/governance/canonical/providers.json'),
    'utf8',
  ))
  const hookCommand = (providerId) => buildProviderHookGroupLaunchArgv({
    provider: providerRegistry.providers.find((provider) => provider.id === providerId),
    event: 'PreToolUse',
    groupIndex: 0,
  }).join(' ')
  const projected = (sourcePath, body, provider) => {
    const marker = `<!-- _generated: scripts/gen-codex-adapter.mjs; source: ${sourcePath}; provider: ${provider}; do not edit this adapter view. -->\n`
    const frontmatter = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)
    return frontmatter ? frontmatter[0] + '\n' + marker + body.slice(frontmatter[0].length) : marker + body
  }
  const auditSkill = '---\nname: design-system-audit\n---\n\n# Design system audit\n'
  const sharedSkill = '---\nname: shared-tool\n---\n\n# Shared tool\n'
  const sourceFiles = {
    'AGENTS.md': '# Fixture agent bootstrap\n',
    'CLAUDE.md': '@AGENTS.md\n\n# Claude adapter\n',
    'packages/design-system/ds-canonical/adapters/claude-root-instructions.md': '# Claude adapter\n',
    '.claude/settings.json': `${JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: hookCommand('claude') }] }] } })}\n`,
    '.codex/hooks.json': `${JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: hookCommand('codex') }] }] } })}\n`,
    'infra/governance/providers/compatibility-matrix.json': '{"schemaVersion":1,"providers":{}}\n',
    'infra/governance/providers/certifications.json': '{"$schema":"../schemas/provider-surface-certification.schema.json","schemaVersion":2,"certifications":[]}\n',
    'packages/design-system/ds-canonical/hooks/governance_control_plane.sh': '#!/bin/bash\nexit 0\n',
    'packages/design-system/ds-canonical/hooks/registrations.json': '{"schemaVersion":1,"hooks":{}}\n',
    'packages/design-system/ds-canonical/hooks/registrations.schema.json': '{"type":"object"}\n',
    'packages/design-system/ds-canonical/rules/meta-patterns.md': '# Fixture meta patterns\n',
    'packages/design-system/ds-canonical/references/ssot-index.md': '# Fixture references\n',
    'packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md': auditSkill,
    'packages/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md': '# Fixture rubric\n',
    'packages/design-system/ds-canonical/skills/shared-tool/SKILL.md': sharedSkill,
    'packages/design-system/ds-canonical/skills/shared-tool/scripts/run.mjs': '#!/usr/bin/env node\n',
    '.claude/skills/design-system-audit/SKILL.md': projected('packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md', auditSkill, 'claude'),
    '.claude/skills/design-system-audit/references/audit-prompts.md': '# Fixture rubric\n',
    '.claude/skills/shared-tool/SKILL.md': projected('packages/design-system/ds-canonical/skills/shared-tool/SKILL.md', sharedSkill, 'claude'),
    '.claude/skills/shared-tool/scripts/run.mjs': '#!/usr/bin/env node\n',
    '.agents/skills/design-system-audit/SKILL.md': projected('packages/design-system/ds-canonical/skills/design-system-audit/SKILL.md', auditSkill, 'codex'),
    '.agents/skills/design-system-audit/references/audit-prompts.md': '# Fixture rubric\n',
    '.agents/skills/shared-tool/SKILL.md': projected('packages/design-system/ds-canonical/skills/shared-tool/SKILL.md', sharedSkill, 'codex'),
    '.agents/skills/shared-tool/scripts/run.mjs': '#!/usr/bin/env node\n',
    'packages/governance/README.md': '# Governance fixture\n',
    'scripts/provider-skill-semantics.json': '{"schemaVersion":2,"policy":{},"skills":[]}\n',
    'scripts/schemas/provider-skill-semantics.schema.json': '{"type":"object"}\n',
    'scripts/gen-codex-adapter.mjs': `export function projectSharedSkillMarkdown(content, sourceRel, provider) {\n  const marker = \`<!-- _generated: scripts/gen-codex-adapter.mjs; source: \${sourceRel}; provider: \${provider}; do not edit this adapter view. -->\\n\`\n  const frontmatter = content.match(/^---\\r?\\n[\\s\\S]*?\\r?\\n---\\r?\\n/)\n  return frontmatter ? frontmatter[0] + '\\n' + marker + content.slice(frontmatter[0].length) : marker + content\n}\n`,
    'scripts/run-provider-hook.mjs': '#!/usr/bin/env node\nprocess.exit(0)\n',
  }
  for (const [path, body] of Object.entries(sourceFiles)) {
    await write(root, path, body, path.endsWith('/run.mjs') || path.endsWith('run-provider-hook.mjs') || path.endsWith('.sh') ? 0o755 : 0o644)
  }

  // Keep the intentionally small, mutable fixture bodies above, but materialize every other
  // required source from the canonical manifest automatically. This makes a manifest extension
  // fail because its real source is missing, not because each unrelated snapshot test forgot to
  // grow a second hard-coded source inventory.
  const manifest = JSON.parse(await readFile(resolve(import.meta.dirname, '../canonical/manifest.json'), 'utf8'))
  for (const source of manifest.sources.filter((item) => item.required)) {
    const relativePath = source.path.replace(/\/$/, '')
    const destination = resolve(root, relativePath)
    try {
      await access(destination)
      continue
    } catch {}
    const authority = resolve(authorityRoot, relativePath)
    await access(authority)
    await mkdir(dirname(destination), { recursive: true })
    await cp(authority, destination, { recursive: true, preserveTimestamps: false })
  }
  const canonicalSkillRoot = resolve(root, 'packages/design-system/ds-canonical/skills')
  const authoritySkillRoot = resolve(authorityRoot, 'packages/design-system/ds-canonical/skills')
  const boundSkillNames = new Set(
    providerRegistry.providers.flatMap(provider => Object.keys(provider.adapter?.skillBindings ?? {})),
  )
  for (const skillName of boundSkillNames) {
    const destination = resolve(canonicalSkillRoot, skillName)
    try {
      await access(destination)
      continue
    } catch {}
    await cp(
      resolve(authoritySkillRoot, skillName),
      destination,
      { recursive: true, preserveTimestamps: false },
    )
  }
  const canonicalSkills = (await readdir(canonicalSkillRoot, { withFileTypes: true }))
    .filter(item => item.isDirectory())
    .map(item => item.name)
    .sort()
  for (const provider of providerRegistry.providers.filter(item => item.adapter?.generate && item.adapter?.skillView?.directory)) {
    const providerSkillRoot = resolve(root, provider.adapter.skillView.directory)
    await rm(providerSkillRoot, { recursive: true, force: true })
    await mkdir(providerSkillRoot, { recursive: true })
    for (const skillName of canonicalSkills) {
      const source = resolve(canonicalSkillRoot, skillName)
      const destination = resolve(providerSkillRoot, skillName)
      await cp(source, destination, { recursive: true, preserveTimestamps: false })
      const skillPath = `packages/design-system/ds-canonical/skills/${skillName}/SKILL.md`
      const canonicalMarkdown = await readFile(resolve(source, 'SKILL.md'), 'utf8')
      await write(
        root,
        `${provider.adapter.skillView.directory}/${skillName}/SKILL.md`,
        projected(skillPath, canonicalMarkdown, provider.id),
      )
    }
  }
  return root
}

export async function cleanup(root) {
  await rm(root, { recursive: true, force: true })
}

export async function repositoryMetadata(root) {
  const inventory = await inventoryTree(root)
  const metadata = []
  async function visit(directory, prefix = '') {
    const children = await readdir(directory, { withFileTypes: true })
    children.sort((a, b) => compareUtf8Bytes(a.name, b.name))
    for (const child of children) {
      const path = prefix ? `${prefix}/${child.name}` : child.name
      const absolute = resolve(directory, child.name)
      const details = await stat(absolute, { bigint: true })
      metadata.push({ path, mtimeNs: details.mtimeNs.toString(), ctimeNs: details.ctimeNs.toString() })
      if (child.isDirectory()) await visit(absolute, path)
    }
  }
  await visit(root)
  return JSON.stringify({ inventory, metadata })
}

export async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}
