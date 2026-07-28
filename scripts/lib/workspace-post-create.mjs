import { execFileSync } from 'node:child_process'
import { lstatSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

function invariant(condition, message) {
  if (!condition) throw new Error(`GOV-WORKSPACE-SETUP-001:${message}`)
}

function regularScript(root, path) {
  const absolute = join(root, path)
  const info = lstatSync(absolute)
  invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(absolute) === absolute, `workspace setup script is unsafe:${path}`)
  return path
}

export function runWorkspacePostCreate({
  root: requestedRoot,
  runner = execFileSync,
  environment = process.env,
} = {}) {
  const root = realpathSync(resolve(requestedRoot))
  const workspaceSetup = regularScript(root, 'scripts/setup-workspace.mjs')
  const banner = regularScript(root, '.devcontainer/onboard-banner.sh')
  const steps = [
    ['jq prerequisite', 'jq', ['--version']],
    ['complete provider-neutral workspace setup', process.execPath, [workspaceSetup]],
    ['onboarding banner', 'bash', [banner]],
  ]
  for (const [label, command, args] of steps) {
    console.log(`\n[post-create] ${label}`)
    runner(command, args, {
      cwd: root,
      env: environment,
      shell: false,
      stdio: 'inherit',
      timeout: 6 * 60 * 60 * 1_000,
      windowsHide: true,
    })
  }
  return { root, steps: steps.map(([label]) => label) }
}
