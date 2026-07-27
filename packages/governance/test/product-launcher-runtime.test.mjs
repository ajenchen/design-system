import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { chmodSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import test from 'node:test'
import { providerHookOutputContract } from '../../../scripts/lib/provider-hook-output-transport.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const launcherRoot = resolve(repoRoot, 'packages/design-system/ds-canonical/templates/product-launchers')
const registry = JSON.parse(await readFile(resolve(repoRoot, 'packages/governance/canonical/providers.json'), 'utf8'))

async function productFixture(t) {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), 'provider-product-launcher-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const localHooks = resolve(root, '.governance-hooks')
  const fork = resolve(root, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  await mkdir(localHooks, { recursive: true })
  await mkdir(resolve(fork, 'hooks'), { recursive: true })
  await mkdir(resolve(root, 'governance'), { recursive: true })
  await mkdir(resolve(root, 'apps/demo/src'), { recursive: true })
  assert.equal(spawnSync('git', ['-C', root, 'init', '-q']).status, 0)
  for (const [name, source = resolve(launcherRoot, name)] of [
    ['normalize-provider-event.mjs'],
    ['product-hook-dispatch-runtime.mjs'],
    ['canonical-order.mjs', resolve(repoRoot, 'packages/governance/src/canonical-order.mjs')],
    ['provider-hook-normalization.mjs', resolve(repoRoot, 'packages/governance/src/provider-hook-normalization.mjs')],
    ['format-provider-hook-output.mjs'],
    ['provider-hook-output-transport.mjs', resolve(repoRoot, 'scripts/lib/provider-hook-output-transport.mjs')],
    ['fork-governance-dispatcher.sh'],
    ['inject_fork_governance_preamble.sh'],
  ]) {
    await cp(source, resolve(localHooks, name))
    chmodSync(resolve(localHooks, name), 0o755)
  }
  await writeFile(resolve(root, 'AGENTS.md'), '# Shared governance\n')
  await writeFile(
    resolve(root, 'apps/demo/src/Existing.tsx'),
    'export const Existing = () => <ChromeHeader mode="old" />\n',
  )
  await writeFile(resolve(root, 'governance/lock.json'), '{"schemaVersion":1}\n')
  await writeFile(resolve(root, 'node_modules/@qijenchen/design-system/package.json'), '{"name":"@qijenchen/design-system"}\n')
  const gate = `#!/bin/bash
set -uo pipefail
while IFS= read -r payload_environment_name; do
  case "$payload_environment_name" in
    GOVERNANCE_TOOL_INPUT|*_TOOL_INPUT)
      echo "provider payload environment leaked into product hook:$payload_environment_name" >&2
      exit 73
      ;;
  esac
done < <(compgen -e)
if [ "$PATH" != ${JSON.stringify(providerHookOutputContract.executablePath)} ]; then
  echo "GOVERNANCE_INTEGRITY:product hook executable PATH is not controlled" >&2
  exit 70
fi
while IFS= read -r runtime_environment_name; do
  case "$runtime_environment_name" in
    GIT_*|BASH_ENV|ENV|NODE_OPTIONS|NODE_PATH|PYTHONHOME|PYTHONPATH|PYTHONSTARTUP|PYTHONINSPECT)
      echo "GOVERNANCE_INTEGRITY:hostile runtime environment leaked into product hook:$runtime_environment_name" >&2
      exit 70
      ;;
  esac
done < <(compgen -e)
input=$(cat)
manifest_path="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)/../manifest.json"
expected_adapter=$(jq -ce --arg provider "\${GOVERNANCE_PROVIDER:-}" '.providerAdapters[$provider]' "$manifest_path" 2>/dev/null) || {
  echo "GOVERNANCE_INTEGRITY:authenticated provider adapter is unavailable" >&2
  exit 70
}
supplied_adapter=$(printf '%s' "\${GOVERNANCE_PROVIDER_ADAPTER_JSON:-}" | jq -ce '.' 2>/dev/null) || {
  echo "GOVERNANCE_INTEGRITY:provider adapter environment is unavailable" >&2
  exit 70
}
if [ "$supplied_adapter" != "$expected_adapter" ]; then
  echo "GOVERNANCE_INTEGRITY:provider adapter environment differs from authenticated manifest" >&2
  exit 70
fi
if [ "\${GOVERNANCE_WRITE_STATE_TRUST:-}" != "unavailable" ]; then
  echo "GOVERNANCE_INTEGRITY:event-v1 hook received proposed-state trust" >&2
  exit 70
fi
if printf '%s' "$input" | jq -e 'has("governance_write_state") or (.tool_input | has("governance_write_state")) or has("governance_fake") or (.tool_input | has("governance_fake"))' >/dev/null; then
  echo "GOVERNANCE_INTEGRITY:untrusted governance field reached event-v1 hook" >&2
  exit 70
fi
if [ -n "\${GOVERNANCE_TRANSCRIPT_PATH:-}" ] || [ "\${GOVERNANCE_TRANSCRIPT_TRUST:-}" != "unavailable" ]; then
  echo "GOVERNANCE_INTEGRITY:event-v1 hook received unverified transcript trust" >&2
  exit 70
fi
if [ "$(printf '%s' "$input" | jq -r '.transcript_path // "missing"')" != "" ]; then
  echo "GOVERNANCE_INTEGRITY:untrusted transcript_path reached event-v1 hook" >&2
  exit 70
fi
if [ "$(printf '%s' "$input" | jq '[paths(scalars) as $path | select($path[-1] == "transcript_path")] | length')" != "1" ]; then
  echo "GOVERNANCE_INTEGRITY:nested untrusted transcript_path reached event-v1 hook" >&2
  exit 70
fi
if printf '%s' "$input" | jq -e '
  select(.operation == "write")
  | has("command") or has("patch") or has("diff")
    or (.tool_input | has("command") or has("patch") or has("diff"))
' >/dev/null; then
  echo "GOVERNANCE_INTEGRITY:provider write transport body reached event hook" >&2
  exit 70
fi
if [ -n "\${GOVERNANCE_TEST_BATCH_ORDER_LOG:-}" ]; then
  printf '%s\\n' "\${#input}" >> "$GOVERNANCE_TEST_BATCH_ORDER_LOG"
fi
if [ "\${GOVERNANCE_TELEMETRY_OPT_IN:-0}" = "1" ]; then
  mkdir -p "$GOVERNANCE_STATE_DIR"
  printf 'observed\\n' >> "$GOVERNANCE_STATE_DIR/fixture-telemetry.log"
fi
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')
content=$(printf '%s' "$input" | jq -r '
  .tool_input.new_string
  // .tool_input.content
  // ([.tool_input.edits[]? | .new_string // .content // ""] | join("\\n"))
  // ""
')
event=$(printf '%s' "$input" | jq -r '.hook_event_name // .event // ""')
if [[ "$content" == *INTEGRITY* ]]; then
  echo "GOVERNANCE_INTEGRITY:fixture child integrity failure" >&2
  exit 70
fi
if [[ "$content" == *UNDEFINED* ]]; then
  exit 1
fi
if [[ "$content" == *MALFORMED* ]]; then
  printf 'not-a-neutral-envelope'
  exit 0
fi
if [[ "$content" == *OVERFLOW* ]]; then
  python3 -c 'import sys; sys.stdout.write("x" * (1024 * 1024 + 1))'
  exit 0
fi
if [[ "$content" == *INVALID_UTF8* ]]; then
  printf '\\377'
  exit 0
fi
if [ "$event" = "Stop" ]; then
  jq -nc '{governanceDecision:"block",reason:"portable stop"}'
  exit 0
fi
if [[ "$file" == */apps/demo/src/Bad.tsx ]] && [[ "$content" == *VIOLATION* ]]; then
  echo "later-file violation:$file" >&2
  exit 2
fi
if [[ "$content" == *WARN* ]]; then
  jq -nc '{governanceContext:{hookEventName:"PostToolUse",message:"portable warning"}}'
fi
exit 0
`
  await writeFile(resolve(fork, 'hooks/gate.sh'), gate)
  chmodSync(resolve(fork, 'hooks/gate.sh'), 0o755)
  const proposedGate = `#!/bin/bash
set -uo pipefail
input=$(cat)
if [ "\${GOVERNANCE_WRITE_STATE_TRUST:-}" != "runner-v1" ]; then
  echo "GOVERNANCE_INTEGRITY:proposed-text hook lacks runner trust" >&2
  exit 70
fi
if [ -n "\${GOVERNANCE_TRANSCRIPT_PATH:-}" ] || [ "\${GOVERNANCE_TRANSCRIPT_TRUST:-}" != "unavailable" ]; then
  echo "GOVERNANCE_INTEGRITY:proposed-text hook received unverified transcript trust" >&2
  exit 70
fi
if ! printf '%s' "$input" | jq -e '
  .governance_write_state == .tool_input.governance_write_state
  and (.governance_write_state.schemaVersion == 1)
  and (.governance_write_state.path | type == "string")
  and (.governance_write_state.kind == "text" or .governance_write_state.kind == "deleted")
  and (has("governance_fake") | not)
  and (.tool_input | has("governance_fake") | not)
' >/dev/null; then
  echo "GOVERNANCE_INTEGRITY:trusted proposed state is missing, malformed, or spoofable" >&2
  exit 70
fi
kind=$(printf '%s' "$input" | jq -r '.governance_write_state.kind')
content=$(printf '%s' "$input" | jq -r '.governance_write_state.content // ""')
if [ "$kind" = "text" ] && [[ "$content" == *ChromeHeader* ]] && [[ "$content" == *'withTabs={false}'* ]]; then
  echo "proposed full-state violation" >&2
  exit 2
fi
exit 0
`
  await writeFile(resolve(fork, 'hooks/proposed-gate.sh'), proposedGate)
  chmodSync(resolve(fork, 'hooks/proposed-gate.sh'), 0o755)
  const diagnosticGate = `#!/bin/bash
set -uo pipefail
input=$(cat)
if [ -n "\${GOVERNANCE_TRANSCRIPT_PATH:-}" ] || [ "\${GOVERNANCE_TRANSCRIPT_TRUST:-}" != "unavailable" ] || [ "$(printf '%s' "$input" | jq -r '.transcript_path // "missing"')" != "" ] || [ "$(printf '%s' "$input" | jq '[paths(scalars) as $path | select($path[-1] == "transcript_path")] | length')" != "1" ]; then
  echo "GOVERNANCE_INTEGRITY:diagnostic hook received unverified transcript trust" >&2
  exit 70
fi
prompt=$(printf '%s' "$input" | jq -r '.prompt // ""')
if [ "$prompt" = "RAW_STDOUT" ]; then
  printf 'forbidden raw diagnostic output'
elif [ "$prompt" = "DIAGNOSTIC_ERROR" ]; then
  echo "diagnostic child failed" >&2
  exit 2
elif [ "$prompt" = "INTEGRITY_MARKER" ]; then
  echo "GOVERNANCE_INTEGRITY:diagnostic child claimed integrity" >&2
else
  echo "diagnostic notice" >&2
fi
`
  await writeFile(resolve(fork, 'hooks/diagnostic-gate.sh'), diagnosticGate)
  chmodSync(resolve(fork, 'hooks/diagnostic-gate.sh'), 0o755)
  await writeFile(resolve(fork, 'hooks/python-sibling.txt'), 'authenticated python sibling\n')
  const pythonGate = `import json
import os
import sys

hook_path = os.path.realpath(__file__)
corpus_root = os.path.realpath(os.environ.get("GOVERNANCE_CORPUS_ROOT", ""))
expected_hook_path = os.path.join(corpus_root, "hooks", "python-gate.py")
if (
    not os.path.isabs(__file__)
    or hook_path != __file__
    or hook_path != expected_hook_path
    or sys.argv != [__file__]
):
    print("GOVERNANCE_INTEGRITY:python authenticated snapshot metadata mismatch", file=sys.stderr)
    raise SystemExit(70)
with open(os.path.join(os.path.dirname(__file__), "python-sibling.txt"), encoding="utf-8") as sibling:
    if sibling.read() != "authenticated python sibling\\n":
        print("GOVERNANCE_INTEGRITY:python authenticated sibling mismatch", file=sys.stderr)
        raise SystemExit(70)
if os.environ.get("GOVERNANCE_TEST_STATE"):
    with open(os.environ["GOVERNANCE_TEST_STATE"], "a", encoding="utf-8") as log:
        log.write(f"hook={hook_path}\\nroot={corpus_root}\\n")
payload = json.load(sys.stdin)
tool_input = payload.get("tool_input", {})
content = tool_input.get("new_string") or tool_input.get("content") or "\\n".join(
    edit.get("new_string", "") for edit in tool_input.get("edits", []) if isinstance(edit, dict)
)
if "PYTHON_VIOLATION" in content:
    print("python hook executed", file=sys.stderr)
    raise SystemExit(2)
`
  await writeFile(resolve(fork, 'hooks/python-gate.py'), pythonGate)
  chmodSync(resolve(fork, 'hooks/python-gate.py'), 0o755)
  const bashSibling = `#!/bin/bash
verify_authenticated_sibling() {
  local sibling_path
  sibling_path="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)/$(basename "\${BASH_SOURCE[0]}")"
  [ "\${BASH_SOURCE[0]}" = "$sibling_path" ] || {
    echo "GOVERNANCE_INTEGRITY:bash sibling BASH_SOURCE is not exact absolute snapshot path" >&2
    return 70
  }
  printf 'sibling=%s\\n' "$sibling_path" >> "$GOVERNANCE_TEST_STATE"
}
`
  await writeFile(resolve(fork, 'hooks/bash-sibling.sh'), bashSibling)
  chmodSync(resolve(fork, 'hooks/bash-sibling.sh'), 0o755)
  const bashPathGate = `#!/bin/bash
set -uo pipefail
main_path="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd -P)/$(basename "\${BASH_SOURCE[0]}")"
if [ "$0" != "$main_path" ] || [ "\${BASH_SOURCE[0]}" != "$main_path" ]; then
  echo "GOVERNANCE_INTEGRITY:bash main path metadata mismatch" >&2
  exit 70
fi
source "$(dirname "$main_path")/bash-sibling.sh" || exit $?
verify_authenticated_sibling || exit $?
printf 'main=%s\\nroot=%s\\n' "$main_path" "$GOVERNANCE_CORPUS_ROOT" >> "$GOVERNANCE_TEST_STATE"
cat >/dev/null
`
  await writeFile(resolve(fork, 'hooks/bash-path-gate.sh'), bashPathGate)
  chmodSync(resolve(fork, 'hooks/bash-path-gate.sh'), 0o755)
  const orderedContextGate = (id) => `#!/bin/bash
set -uo pipefail
input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')
name=$(basename "$file")
printf '${id}:%s\\n' "$name" >> "$GOVERNANCE_TEST_STATE"
jq -nc --arg message '${id}:'"$name" '{governanceContext:{hookEventName:"PostToolUse",message:$message}}'
`
  for (const id of ['first', 'second']) {
    await writeFile(resolve(fork, `hooks/context-${id}.sh`), orderedContextGate(id))
    chmodSync(resolve(fork, `hooks/context-${id}.sh`), 0o755)
  }
  const policyFirstGate = `#!/bin/bash
set -uo pipefail
input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')
name=$(basename "$file")
printf 'policy:%s\\n' "$name" >> "$GOVERNANCE_TEST_STATE"
if [ "$name" = "One.tsx" ]; then
  echo "first policy block" >&2
  exit 2
fi
`
  await writeFile(resolve(fork, 'hooks/policy-first.sh'), policyFirstGate)
  chmodSync(resolve(fork, 'hooks/policy-first.sh'), 0o755)
  const laterSideEffectGate = `#!/bin/bash
set -uo pipefail
input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')
printf 'later:%s\\n' "$(basename "$file")" >> "$GOVERNANCE_TEST_STATE"
`
  await writeFile(resolve(fork, 'hooks/later-side-effect.sh'), laterSideEffectGate)
  chmodSync(resolve(fork, 'hooks/later-side-effect.sh'), 0o755)
  const stopGate = (id, reason) => `#!/bin/bash
set -uo pipefail
cat >/dev/null
printf 'stop:${id}\\n' >> "$GOVERNANCE_TEST_STATE"
jq -nc --arg reason '${reason}' '{governanceDecision:"block",reason:$reason}'
`
  for (const [id, reason] of [['first', 'first stop'], ['later', 'later stop']]) {
    await writeFile(resolve(fork, `hooks/stop-${id}.sh`), stopGate(id, reason))
    chmodSync(resolve(fork, `hooks/stop-${id}.sh`), 0o755)
  }
  const signalGate = `#!/bin/bash
set -uo pipefail
cat >/dev/null
trap '' TERM
(
  trap '' TERM
  while :; do sleep 1; done
) &
descendant=$!
printf '%s\\n%s\\n' "$GOVERNANCE_CORPUS_ROOT" "$descendant" > "$GOVERNANCE_TEST_STATE"
wait "$descendant"
`
  await writeFile(resolve(fork, 'hooks/signal-gate.sh'), signalGate)
  chmodSync(resolve(fork, 'hooks/signal-gate.sh'), 0o755)
  const aggregateContextGate = `#!/bin/bash
set -uo pipefail
cat >/dev/null
/usr/bin/python3 - <<'PY'
import json
print(json.dumps({"governanceContext":{"hookEventName":"PostToolUse","message":"x" * (900 * 1024)}}, separators=(",", ":")))
PY
`
  await writeFile(resolve(fork, 'hooks/aggregate-context.sh'), aggregateContextGate)
  chmodSync(resolve(fork, 'hooks/aggregate-context.sh'), 0o755)
  const orphanTreeGate = `#!/bin/bash
set -uo pipefail
cat >/dev/null
(
  trap '' TERM
  exec >/dev/null 2>&1
  while :; do sleep 1; done
) &
printf '%s\\n' "$!" > "$GOVERNANCE_TEST_STATE"
`
  await writeFile(resolve(fork, 'hooks/orphan-tree.sh'), orphanTreeGate)
  chmodSync(resolve(fork, 'hooks/orphan-tree.sh'), 0o755)
  const snapshotMutationDeniedGate = `#!/bin/bash
set -uo pipefail
cat >/dev/null
root="$GOVERNANCE_CORPUS_ROOT"
target="$root/hooks/bash-sibling.sh"
before=$(cat "$target")
if printf 'poison\\n' 2>/dev/null >> "$target"; then
  echo "GOVERNANCE_INTEGRITY:snapshot file accepted an in-place write" >&2
  exit 70
fi
if rm "$target" 2>/dev/null; then
  echo "GOVERNANCE_INTEGRITY:snapshot directory accepted an unlink" >&2
  exit 70
fi
if mkdir "$root/unsigned" 2>/dev/null; then
  echo "GOVERNANCE_INTEGRITY:snapshot root accepted an unsigned child" >&2
  exit 70
fi
after=$(cat "$target")
[ "$before" = "$after" ] || {
  echo "GOVERNANCE_INTEGRITY:snapshot bytes changed during denial probe" >&2
  exit 70
}
printf '%s\\n' "$root" > "$GOVERNANCE_TEST_STATE"
`
  await writeFile(resolve(fork, 'hooks/snapshot-mutation-denied.sh'), snapshotMutationDeniedGate)
  chmodSync(resolve(fork, 'hooks/snapshot-mutation-denied.sh'), 0o755)
  const snapshotTamperGate = `#!/bin/bash
set -uo pipefail
cat >/dev/null
root="$GOVERNANCE_CORPUS_ROOT"
printf '%s\\n' "$root" > "$GOVERNANCE_TEST_STATE"
chmod 0700 "$root/hooks/bash-sibling.sh"
printf 'authenticated bytes replaced after launch\\n' > "$root/hooks/bash-sibling.sh"
`
  await writeFile(resolve(fork, 'hooks/snapshot-tamper.sh'), snapshotTamperGate)
  chmodSync(resolve(fork, 'hooks/snapshot-tamper.sh'), 0o755)
  await cp(
    resolve(repoRoot, 'scripts/fork-hook-overrides/check_fork_product_quality.sh'),
    resolve(fork, 'hooks/check_fork_product_quality.sh'),
  )
  chmodSync(resolve(fork, 'hooks/check_fork_product_quality.sh'), 0o755)

  const providerAdapters = Object.fromEntries(registry.providers.filter((item) => ['claude', 'codex'].includes(item.id)).map((provider) => [provider.id, {
    blockingExitCode: provider.blockingExitCode,
    environmentMap: provider.adapter.environmentMap,
    normalization: provider.normalization,
    contextOutputTransport: provider.runtime.contextOutputTransport,
    stopDecisionTransport: provider.runtime.stopDecisionTransport,
  }]))
  providerAdapters.future = {
    blockingExitCode: 23,
    environmentMap: { GOVERNANCE_TOOL_INPUT: 'FUTURE_TOOL_INPUT' },
    normalization: {
      eventFields: ['kind'], toolFields: ['verb'], pathFields: ['target'], pathArrayFields: ['batch'], writeTools: ['mutate'],
      eventAliases: { beforewrite: 'PreToolUse', afterwrite: 'PostToolUse', stop: 'Stop' },
      toolAliases: { mutate: 'Write', stop: 'Stop' },
      writeTransports: [{
        id: 'future-write-v1',
        rawTools: ['mutate'],
        engine: 'full-file-v1',
        payloadFields: ['target', 'text'],
      }],
    },
    contextOutputTransport: 'stderr', stopDecisionTransport: 'blocking-exit',
  }
  await writeFile(resolve(fork, 'manifest.json'), `${JSON.stringify({
    providerAdapters,
    hooks: {
      PreToolUse: [{
        file: 'hooks/proposed-gate.sh',
        matcher: 'Edit|Write|MultiEdit',
        runtime: 'bash',
        outputMode: 'blocking',
        inputContract: 'proposed-text-v1',
        transcriptRequirement: 'none',
      }, {
        file: 'hooks/check_fork_product_quality.sh',
        matcher: 'Edit|Write|MultiEdit',
        runtime: 'bash',
        outputMode: 'governance-context',
        inputContract: 'event-v1',
        transcriptRequirement: 'none',
      }],
      PostToolUse: [{
        file: 'hooks/gate.sh',
        matcher: 'Edit|Write|MultiEdit',
        runtime: 'bash',
        outputMode: 'governance-context-or-block',
        inputContract: 'event-v1',
        transcriptRequirement: 'optional',
      }, {
        file: 'hooks/python-gate.py',
        matcher: 'Edit|Write|MultiEdit',
        runtime: 'python3',
        outputMode: 'blocking',
        inputContract: 'event-v1',
        transcriptRequirement: 'none',
      }],
      Stop: [{
        file: 'hooks/gate.sh',
        matcher: '',
        runtime: 'bash',
        outputMode: 'governance-decision',
        inputContract: 'event-v1',
        transcriptRequirement: 'none',
      }],
      UserPromptSubmit: [{
        file: 'hooks/diagnostic-gate.sh',
        matcher: '',
        runtime: 'bash',
        outputMode: 'diagnostic',
        inputContract: 'event-v1',
        transcriptRequirement: 'none',
      }],
    },
    consumer: {
      commonInstruction: {
        schemaVersion: 1,
        artifact: 'common/instruction.md',
        destination: 'AGENTS.md',
        materializerId: 'shared-instruction-v1',
      },
    },
  }, null, 2)}\n`)
  const lockFiles = [
    'hooks/aggregate-context.sh',
    'hooks/bash-path-gate.sh',
    'hooks/bash-sibling.sh',
    'hooks/check_fork_product_quality.sh',
    'hooks/context-first.sh',
    'hooks/context-second.sh',
    'hooks/diagnostic-gate.sh',
    'hooks/gate.sh',
    'hooks/later-side-effect.sh',
    'hooks/orphan-tree.sh',
    'hooks/policy-first.sh',
    'hooks/proposed-gate.sh',
    'hooks/python-gate.py',
    'hooks/python-sibling.txt',
    'hooks/signal-gate.sh',
    'hooks/snapshot-mutation-denied.sh',
    'hooks/snapshot-tamper.sh',
    'hooks/stop-first.sh',
    'hooks/stop-later.sh',
    'manifest.json',
  ]
  await writeFile(resolve(fork, 'governance.lock'), `${JSON.stringify({
    schemaVersion: 1,
    kind: 'fork-governance-corpus-lock',
    hashAlgorithm: 'sha256',
    entries: await Promise.all(lockFiles.map(async (file) => ({
      file,
      sha256: createHash('sha256').update(await readFile(resolve(fork, file))).digest('hex'),
    }))),
  }, null, 2)}\n`)
  return { root, localHooks }
}

async function updateFixtureManifest(root, mutate) {
  const fork = resolve(root, 'node_modules/@qijenchen/design-system/ds-canonical/fork')
  const manifestPath = resolve(fork, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  mutate(manifest)
  const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`
  await writeFile(manifestPath, manifestBody)
  const lockPath = resolve(fork, 'governance.lock')
  const lock = JSON.parse(await readFile(lockPath, 'utf8'))
  const manifestEntry = lock.entries.find((entry) => entry.file === 'manifest.json')
  assert.ok(manifestEntry, 'fixture lock must authenticate manifest.json')
  manifestEntry.sha256 = createHash('sha256').update(manifestBody).digest('hex')
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
}

async function setFixtureEventHooks(root, event, descriptors) {
  await updateFixtureManifest(root, (manifest) => {
    manifest.hooks[event] = descriptors
  })
}

function twoPathPayload(provider) {
  if (provider === 'codex') {
    return {
      event: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          '*** Add File: apps/demo/src/One.tsx',
          '+export const One = 1',
          '*** Add File: apps/demo/src/Two.tsx',
          '+export const Two = 2',
          '*** End Patch',
        ].join('\n'),
      },
    }
  }
  return {
    hook_event_name: 'PostToolUse',
    tool_name: 'MultiEdit',
    tool_input: {
      edits: [
        { file_path: 'apps/demo/src/One.tsx', new_string: 'export const One = 1\n' },
        { file_path: 'apps/demo/src/Two.tsx', new_string: 'export const Two = 2\n' },
      ],
    },
  }
}

async function waitForText(path, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    try {
      const body = await readFile(path, 'utf8')
      if (body.trim()) return body
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await new Promise((accept) => setTimeout(accept, 20))
  }
  throw new Error(`timed out waiting for ${path}`)
}

async function waitForProcessExit(pid, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if (error.code === 'ESRCH') return
      throw error
    }
    await new Promise((accept) => setTimeout(accept, 20))
  }
  throw new Error(`process ${pid} remained alive`)
}

function run(root, localHooks, launcher, provider, payload, extraEnv = {}) {
  const environment = { ...process.env, GOVERNANCE_PROJECT_DIR: root, GOVERNANCE_PROVIDER: provider, GOVERNANCE_READ_ONLY: '1', ...extraEnv }
  for (const [name, value] of Object.entries(environment)) if (value === null) delete environment[name]
  const result = spawnSync('/bin/bash', ['--', resolve(localHooks, launcher)], {
    cwd: root,
    env: environment,
    input: `${JSON.stringify(payload)}\n`,
    encoding: 'utf8',
  })
  return result
}

function runRaw(root, localHooks, launcher, provider, input, extraEnv = {}) {
  const environment = { ...process.env, GOVERNANCE_PROJECT_DIR: root, GOVERNANCE_PROVIDER: provider, GOVERNANCE_READ_ONLY: '1', ...extraEnv }
  for (const [name, value] of Object.entries(environment)) if (value === null) delete environment[name]
  return spawnSync('/bin/bash', ['--', resolve(localHooks, launcher)], {
    cwd: root,
    env: environment,
    input,
    encoding: 'buffer',
  })
}

test('product dispatcher has relative/absolute parity and cannot hide a later-file violation', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const relative = { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'apps/demo/src/Bad.tsx', new_string: 'VIOLATION' } }
  const absolute = structuredClone(relative)
  absolute.tool_input.file_path = resolve(root, 'apps/demo/src/Bad.tsx')
  const multi = {
    hook_event_name: 'PostToolUse', tool_name: 'MultiEdit',
    tool_input: { edits: [{ file_path: 'README.md', new_string: 'benign' }, { file_path: 'apps/demo/src/Bad.tsx', new_string: 'VIOLATION' }] },
  }
  const isolated = {
    hook_event_name: 'PostToolUse', tool_name: 'MultiEdit',
    tool_input: { edits: [{ file_path: 'apps/demo/src/Bad.tsx', new_string: 'benign' }, { file_path: 'README.md', new_string: 'VIOLATION' }] },
  }
  for (const provider of ['claude', 'codex']) {
    for (const [label, payload, expected] of [
      ['relative', relative, 2],
      ['absolute', absolute, 2],
      ['multi', multi, 2],
      ['isolated', isolated, 0],
    ]) {
      const result = run(root, localHooks, 'fork-governance-dispatcher.sh', provider, payload)
      assert.equal(result.status, expected, `${provider}:${label}:${result.stderr}`)
    }
    for (const outside of ['../outside.tsx', resolve(root, '../outside-absolute.tsx')]) {
      const escaped = structuredClone(relative)
      escaped.tool_input.file_path = outside
      const result = run(root, localHooks, 'fork-governance-dispatcher.sh', provider, escaped)
      assert.equal(result.status, 70)
      assert.match(result.stderr, /GOVERNANCE_INTEGRITY:/)
      assert.match(result.stderr, /changed path escapes repository root/)
    }
  }
})

test('product dispatcher telemetry is explicit and confined to target Git runtime', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const payload = { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'README.md', new_string: 'benign' } }
  const ordinary = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', payload, { GOVERNANCE_READ_ONLY: null, GOVERNANCE_TELEMETRY_OPT_IN: null, GOVERNANCE_STATE_DIR: null })
  const ci = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', payload, { GOVERNANCE_TELEMETRY_OPT_IN: '1' })
  assert.equal(ordinary.status, 0, ordinary.stderr)
  assert.equal(ci.status, 0, ci.stderr)
  await assert.rejects(readFile(resolve(root, '.git/governance-runtime/fixture-telemetry.log'), 'utf8'))
  await assert.rejects(readFile(resolve(root, '.claude/logs/fixture-telemetry.log'), 'utf8'))

  const redirected = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', payload, {
    GOVERNANCE_READ_ONLY: null,
    GOVERNANCE_TELEMETRY_OPT_IN: '1',
    GOVERNANCE_STATE_DIR: resolve(root, '.claude/logs'),
  })
  assert.equal(redirected.status, 70)
  assert.match(redirected.stderr, /GOVERNANCE_INTEGRITY:STATE_DIR_OUTSIDE_RUNTIME_ROOT/)

  const opted = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', payload, {
    GOVERNANCE_READ_ONLY: null,
    GOVERNANCE_TELEMETRY_OPT_IN: '1',
    GOVERNANCE_STATE_DIR: null,
  })
  assert.equal(opted.status, 0, opted.stderr)
  assert.match(await readFile(resolve(root, '.git/governance-runtime/fixture-telemetry.log'), 'utf8'), /observed/)
  await assert.rejects(readFile(resolve(root, '.claude/logs/fixture-telemetry.log'), 'utf8'))
})

test('product dispatcher rejects runtime symlink escapes without touching external targets', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const outside = await mkdtemp(resolve(tmpdir(), 'provider-product-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const sentinel = resolve(outside, 'sentinel.txt')
  await writeFile(sentinel, 'unchanged\n')
  const payload = { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'README.md', new_string: 'benign' } }
  const runtimeRoot = resolve(await realpath(resolve(root, '.git')), 'governance-runtime')

  await symlink(outside, runtimeRoot, 'dir')
  const defaultRedirect = run(root, localHooks, 'fork-governance-dispatcher.sh', 'codex', payload, {
    GOVERNANCE_READ_ONLY: null,
    GOVERNANCE_TELEMETRY_OPT_IN: '1',
  })
  assert.equal(defaultRedirect.status, 70)
  assert.match(defaultRedirect.stderr, /GOVERNANCE_INTEGRITY:RUNTIME_PATH_SYMLINK_OR_ESCAPE/)
  assert.equal(await readFile(sentinel, 'utf8'), 'unchanged\n')
  await assert.rejects(readFile(resolve(outside, 'fixture-telemetry.log'), 'utf8'))

  await rm(runtimeRoot)
  await mkdir(runtimeRoot)
  await symlink(outside, resolve(runtimeRoot, 'nested'), 'dir')
  const nestedRedirect = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', payload, {
    GOVERNANCE_READ_ONLY: null,
    GOVERNANCE_TELEMETRY_OPT_IN: '1',
    GOVERNANCE_STATE_DIR: resolve(runtimeRoot, 'nested'),
  })
  assert.equal(nestedRedirect.status, 70)
  assert.match(nestedRedirect.stderr, /GOVERNANCE_INTEGRITY:STATE_DIR_SYMLINK_OR_ESCAPE/)
  assert.equal(await readFile(sentinel, 'utf8'), 'unchanged\n')
  await assert.rejects(readFile(resolve(outside, 'fixture-telemetry.log'), 'utf8'))
})

test('product context and SessionStart use each provider declared native transport', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const warning = { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'apps/demo/src/Warn.tsx', new_string: 'WARN' } }
  const claude = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', warning)
  const codex = run(root, localHooks, 'fork-governance-dispatcher.sh', 'codex', warning)
  assert.deepEqual(JSON.parse(claude.stdout), {
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'portable warning' },
  })
  assert.deepEqual(JSON.parse(codex.stdout), { systemMessage: 'portable warning' })

  const claudeStart = run(root, localHooks, 'inject_fork_governance_preamble.sh', 'claude', { hook_event_name: 'SessionStart' })
  const codexStart = run(root, localHooks, 'inject_fork_governance_preamble.sh', 'codex', { event: 'SessionStart' })
  assert.equal(claudeStart.status, 0, claudeStart.stderr)
  assert.equal(codexStart.status, 0, codexStart.stderr)
  assert.equal(claudeStart.stderr, '')
  assert.equal(codexStart.stderr, '')
  const claudeStartOutput = JSON.parse(claudeStart.stdout)
  const codexStartOutput = JSON.parse(codexStart.stdout)
  assert.deepEqual(Object.keys(claudeStartOutput), ['hookSpecificOutput'])
  assert.deepEqual(Object.keys(claudeStartOutput.hookSpecificOutput).sort(), ['additionalContext', 'hookEventName'])
  assert.match(claudeStartOutput.hookSpecificOutput.additionalContext, /committed AGENTS\.md/)
  assert.deepEqual(Object.keys(codexStartOutput), ['systemMessage'])
  assert.match(codexStartOutput.systemMessage, /committed AGENTS\.md/)

  const stop = { hook_event_name: 'Stop', tool_name: 'Stop', tool_input: {} }
  const claudeStop = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', stop)
  const codexStop = run(root, localHooks, 'fork-governance-dispatcher.sh', 'codex', stop)
  assert.equal(claudeStop.status, 0, claudeStop.stderr)
  assert.equal(codexStop.status, 0, codexStop.stderr)
  assert.deepEqual(JSON.parse(claudeStop.stdout), { decision: 'block', reason: 'portable stop' })
  assert.deepEqual(JSON.parse(codexStop.stdout), { continue: false, stopReason: 'portable stop' })
})

test('product runtime executes Bash and Python from a cleaned authenticated corpus snapshot with sibling semantics', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const bashLog = resolve(root, '.git/bash-snapshot-paths.log')
  await setFixtureEventHooks(root, 'PostToolUse', [{
    file: 'hooks/bash-path-gate.sh',
    matcher: '',
    runtime: 'bash',
    outputMode: 'blocking',
    inputContract: 'event-v1',
    transcriptRequirement: 'none',
  }])
  const bash = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'README.md', new_string: 'clean' },
  }, { GOVERNANCE_TEST_STATE: bashLog })
  assert.equal(bash.status, 0, bash.stderr)
  const bashPaths = Object.fromEntries(
    (await readFile(bashLog, 'utf8')).trim().split('\n').map((line) => line.split(/=(.*)/s).slice(0, 2)),
  )
  assert.equal(isAbsolute(bashPaths.main), true)
  assert.equal(bashPaths.main, resolve(bashPaths.root, 'hooks/bash-path-gate.sh'))
  assert.equal(bashPaths.sibling, resolve(bashPaths.root, 'hooks/bash-sibling.sh'))
  assert.notEqual(bashPaths.root, resolve(root, 'node_modules/@qijenchen/design-system/ds-canonical/fork'))
  await assert.rejects(lstat(bashPaths.root), /ENOENT/)

  await setFixtureEventHooks(root, 'PostToolUse', [{
    file: 'hooks/python-gate.py',
    matcher: '',
    runtime: 'python3',
    outputMode: 'blocking',
    inputContract: 'event-v1',
    transcriptRequirement: 'none',
  }])
  for (const provider of ['claude', 'codex']) {
    const pythonLog = resolve(root, `.git/python-snapshot-paths-${provider}.log`)
    const result = run(root, localHooks, 'fork-governance-dispatcher.sh', provider, {
      ...(provider === 'codex' ? { event: 'PostToolUse' } : { hook_event_name: 'PostToolUse' }),
      tool_name: provider === 'codex' ? 'apply_patch' : 'Write',
      tool_input: provider === 'codex'
        ? {
            command: [
              '*** Begin Patch',
              '*** Add File: README.md',
              '+PYTHON_VIOLATION',
              '*** End Patch',
            ].join('\n'),
          }
        : { file_path: 'README.md', content: 'PYTHON_VIOLATION' },
    }, { GOVERNANCE_TEST_STATE: pythonLog })
    assert.equal(result.status, 2, `${provider}:${result.stderr}`)
    assert.match(result.stderr, /python hook executed/)
    const pythonPaths = Object.fromEntries(
      (await readFile(pythonLog, 'utf8')).trim().split('\n').map((line) => line.split(/=(.*)/s).slice(0, 2)),
    )
    assert.equal(isAbsolute(pythonPaths.hook), true)
    assert.equal(pythonPaths.hook, resolve(pythonPaths.root, 'hooks/python-gate.py'))
    assert.notEqual(pythonPaths.root, resolve(root, 'node_modules/@qijenchen/design-system/ds-canonical/fork'))
    await assert.rejects(lstat(pythonPaths.root), /ENOENT/)
  }
})

test('product runtime terminates its active hook tree and removes the private snapshot on SIGTERM', async (t) => {
  const { root, localHooks } = await productFixture(t)
  await setFixtureEventHooks(root, 'PostToolUse', [{
    file: 'hooks/signal-gate.sh',
    matcher: '',
    runtime: 'bash',
    outputMode: 'blocking',
    inputContract: 'event-v1',
    transcriptRequirement: 'none',
  }])
  const readyLog = resolve(root, '.git/signal-snapshot-ready.log')
  const child = spawn('bash', ['--', resolve(localHooks, 'fork-governance-dispatcher.sh')], {
    cwd: root,
    env: {
      ...process.env,
      GOVERNANCE_PROJECT_DIR: root,
      GOVERNANCE_PROVIDER: 'claude',
      GOVERNANCE_READ_ONLY: '1',
      GOVERNANCE_TEST_STATE: readyLog,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  })
  const stderr = []
  child.stderr.on('data', (chunk) => stderr.push(chunk))
  const completion = new Promise((accept) => {
    child.once('close', (status, signal) => accept({ signal, status }))
  })
  child.stdin.end(`${JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'README.md', content: 'clean' },
  })}\n`)
  const [snapshotRoot, descendantText] = (await waitForText(readyLog)).trim().split('\n')
  const descendantPid = Number(descendantText)
  assert.equal(isAbsolute(snapshotRoot), true)
  assert.equal(Number.isSafeInteger(descendantPid), true)
  child.kill('SIGTERM')
  const completed = await completion
  assert.deepEqual(completed, { signal: null, status: 143 }, Buffer.concat(stderr).toString('utf8'))
  await assert.rejects(lstat(snapshotRoot), /ENOENT/)
  await waitForProcessExit(descendantPid)
})

test('product runtime seals the private corpus, detects same-UID tamper, and still removes it', async (t) => {
  const denied = await productFixture(t)
  await setFixtureEventHooks(denied.root, 'PostToolUse', [{
    file: 'hooks/snapshot-mutation-denied.sh',
    matcher: '',
    runtime: 'bash',
    outputMode: 'blocking',
    inputContract: 'event-v1',
    transcriptRequirement: 'none',
  }])
  const deniedLog = resolve(denied.root, '.git/snapshot-denied.log')
  const deniedResult = run(
    denied.root,
    denied.localHooks,
    'fork-governance-dispatcher.sh',
    'claude',
    { hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: {} },
    { GOVERNANCE_TEST_STATE: deniedLog },
  )
  assert.equal(deniedResult.status, 0, deniedResult.stderr)
  const deniedRoot = (await readFile(deniedLog, 'utf8')).trim()
  assert.equal(isAbsolute(deniedRoot), true)
  await assert.rejects(lstat(deniedRoot), /ENOENT/)

  const tampered = await productFixture(t)
  await setFixtureEventHooks(tampered.root, 'PostToolUse', [{
    file: 'hooks/snapshot-tamper.sh',
    matcher: '',
    runtime: 'bash',
    outputMode: 'blocking',
    inputContract: 'event-v1',
    transcriptRequirement: 'none',
  }])
  const tamperLog = resolve(tampered.root, '.git/snapshot-tamper.log')
  const tamperResult = run(
    tampered.root,
    tampered.localHooks,
    'fork-governance-dispatcher.sh',
    'claude',
    { hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: {} },
    { GOVERNANCE_TEST_STATE: tamperLog },
  )
  assert.equal(tamperResult.status, 70)
  assert.match(tamperResult.stderr, /authenticated snapshot entry is unsafe|changed after materialization/)
  const tamperedRoot = (await readFile(tamperLog, 'utf8')).trim()
  assert.equal(isAbsolute(tamperedRoot), true)
  await assert.rejects(lstat(tamperedRoot), /ENOENT/)
})

test('product overall deadline terminates the complete hook tree and removes its private snapshot', async (t) => {
  const { root, localHooks } = await productFixture(t)
  await setFixtureEventHooks(root, 'PostToolUse', [{
    file: 'hooks/signal-gate.sh',
    matcher: '',
    runtime: 'bash',
    outputMode: 'blocking',
    inputContract: 'event-v1',
    transcriptRequirement: 'none',
  }])
  const readyLog = resolve(root, '.git/deadline-snapshot-ready.log')
  const child = spawn('/bin/bash', [
    '--',
    resolve(localHooks, 'fork-governance-dispatcher.sh'),
  ], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      GOVERNANCE_PRODUCT_TEST_SHORT_BATCH_RUNTIME: '1',
      GOVERNANCE_PROJECT_DIR: root,
      GOVERNANCE_PROVIDER: 'claude',
      GOVERNANCE_READ_ONLY: '1',
      GOVERNANCE_TEST_STATE: readyLog,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  })
  const stderr = []
  child.stderr.on('data', (chunk) => stderr.push(chunk))
  const completion = new Promise((accept) => {
    child.once('close', (status, signal) => accept({ signal, status }))
  })
  child.stdin.end(`${JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'README.md', content: 'clean' },
  })}\n`)
  const [snapshotRoot, descendantText] = (await waitForText(readyLog)).trim().split('\n')
  const descendantPid = Number(descendantText)
  const completed = await completion
  assert.deepEqual(completed, { signal: null, status: 70 }, Buffer.concat(stderr).toString('utf8'))
  assert.match(Buffer.concat(stderr).toString('utf8'), /product hook batch exceeded 750ms/)
  await assert.rejects(lstat(snapshotRoot), /ENOENT/)
  await waitForProcessExit(descendantPid)
})

test('product runtime flushes large native output and reaps a redirected-stdio descendant after child close', async (t) => {
  const { root, localHooks } = await productFixture(t)
  await setFixtureEventHooks(root, 'PostToolUse', [{
    file: 'hooks/aggregate-context.sh',
    matcher: '',
    runtime: 'bash',
    outputMode: 'governance-context',
    inputContract: 'event-v1',
    transcriptRequirement: 'none',
  }])
  const large = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'README.md', content: 'clean' },
  })
  assert.equal(large.status, 0, large.stderr)
  assert.equal(JSON.parse(large.stdout).hookSpecificOutput.additionalContext.length, 900 * 1024)

  await setFixtureEventHooks(root, 'PostToolUse', [{
    file: 'hooks/orphan-tree.sh',
    matcher: '',
    runtime: 'bash',
    outputMode: 'blocking',
    inputContract: 'event-v1',
    transcriptRequirement: 'none',
  }])
  const orphanLog = resolve(root, '.git/orphan-tree.pid')
  const orphan = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Read',
    tool_input: {},
  }, { GOVERNANCE_TEST_STATE: orphanLog })
  assert.equal(orphan.status, 0, orphan.stderr)
  await waitForProcessExit(Number((await readFile(orphanLog, 'utf8')).trim()))
})

test('product runtime rejects a lock without its manifest and cannot read an unlocked sibling from the original corpus', async (t) => {
  const missingManifest = await productFixture(t)
  const missingManifestFork = resolve(
    missingManifest.root,
    'node_modules/@qijenchen/design-system/ds-canonical/fork',
  )
  const missingManifestLockPath = resolve(missingManifestFork, 'governance.lock')
  const missingManifestLock = JSON.parse(await readFile(missingManifestLockPath, 'utf8'))
  missingManifestLock.entries = missingManifestLock.entries.filter((entry) => entry.file !== 'manifest.json')
  await writeFile(missingManifestLockPath, `${JSON.stringify(missingManifestLock, null, 2)}\n`)
  const rejectedManifest = run(
    missingManifest.root,
    missingManifest.localHooks,
    'fork-governance-dispatcher.sh',
    'claude',
    { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'clean' } },
  )
  assert.equal(rejectedManifest.status, 70)
  assert.match(rejectedManifest.stderr, /authenticated fork manifest is unavailable or invalid/)

  const unlockedSibling = await productFixture(t)
  await setFixtureEventHooks(unlockedSibling.root, 'PostToolUse', [{
    file: 'hooks/bash-path-gate.sh',
    matcher: '',
    runtime: 'bash',
    outputMode: 'blocking',
    inputContract: 'event-v1',
    transcriptRequirement: 'none',
  }])
  const unlockedFork = resolve(
    unlockedSibling.root,
    'node_modules/@qijenchen/design-system/ds-canonical/fork',
  )
  const unlockedLockPath = resolve(unlockedFork, 'governance.lock')
  const unlockedLock = JSON.parse(await readFile(unlockedLockPath, 'utf8'))
  unlockedLock.entries = unlockedLock.entries.filter((entry) => entry.file !== 'hooks/bash-sibling.sh')
  await writeFile(unlockedLockPath, `${JSON.stringify(unlockedLock, null, 2)}\n`)
  assert.match(await readFile(resolve(unlockedFork, 'hooks/bash-sibling.sh'), 'utf8'), /verify_authenticated_sibling/)
  const rejectedSibling = run(
    unlockedSibling.root,
    unlockedSibling.localHooks,
    'fork-governance-dispatcher.sh',
    'claude',
    { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'clean' } },
    { GOVERNANCE_TEST_STATE: resolve(unlockedSibling.root, '.git/unlocked-sibling.log') },
  )
  assert.equal(rejectedSibling.status, 70)
  assert.match(rejectedSibling.stderr, /bash-sibling\.sh|PROVIDER_HOOK_CHILD_RESULT_INTEGRITY_FAILURE/)
})

test('product runtime rejects neutral fanout and aggregate-output limits before dispatch amplification', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const descriptor = (file = 'hooks/gate.sh', outputMode = 'blocking', inputContract = 'event-v1') => ({
    file,
    matcher: '',
    runtime: 'bash',
    outputMode,
    inputContract,
    transcriptRequirement: 'none',
  })
  const editsPayload = (count) => ({
    hook_event_name: 'PostToolUse',
    tool_name: 'MultiEdit',
    tool_input: {
      edits: Array.from({ length: count }, (_, index) => ({
        file_path: `apps/demo/src/Limit-${index}.tsx`,
        new_string: `export const Limit${index} = ${index}\n`,
      })),
    },
  })

  await setFixtureEventHooks(root, 'PostToolUse', Array.from({ length: 65 }, () => descriptor()))
  const descriptors = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Read',
    tool_input: {},
  })
  assert.equal(descriptors.status, 70)
  assert.match(descriptors.stderr, /descriptor count exceeds 64/)

  await setFixtureEventHooks(root, 'PostToolUse', [descriptor()])
  const changedFiles = run(
    root,
    localHooks,
    'fork-governance-dispatcher.sh',
    'claude',
    editsPayload(257),
  )
  assert.equal(changedFiles.status, 70)
  assert.match(changedFiles.stderr, /changed-file count exceeds 256/)

  await setFixtureEventHooks(root, 'PostToolUse', Array.from({ length: 5 }, () => descriptor()))
  const invocations = run(
    root,
    localHooks,
    'fork-governance-dispatcher.sh',
    'claude',
    editsPayload(256),
  )
  assert.equal(invocations.status, 70)
  assert.match(invocations.stderr, /invocation count exceeds 1024/)

  await setFixtureEventHooks(root, 'PreToolUse', [
    descriptor('hooks/proposed-gate.sh', 'blocking', 'proposed-text-v1'),
  ])
  for (const name of ['Large-A.tsx', 'Large-B.tsx']) {
    await writeFile(
      resolve(root, `apps/demo/src/${name}`),
      `A${'x'.repeat(9 * 1024 * 1024 - 1)}`,
    )
  }
  const proposed = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', {
    hook_event_name: 'PreToolUse',
    tool_name: 'MultiEdit',
    tool_input: {
      edits: ['Large-A.tsx', 'Large-B.tsx'].map((name) => ({
        file_path: `apps/demo/src/${name}`,
        old_string: 'A',
        new_string: 'B',
      })),
    },
  })
  assert.equal(proposed.status, 70)
  assert.match(
    proposed.stderr,
    /GOVERNANCE_INTEGRITY:AGGREGATE_TEXT_TOO_LARGE:provider proposed state blocked:AGGREGATE_TEXT_TOO_LARGE:materialized text states exceed 7340032 remaining bytes:apps\/demo\/src\/Large-B\.tsx/,
  )

  await setFixtureEventHooks(root, 'PostToolUse', [
    descriptor('hooks/aggregate-context.sh', 'governance-context'),
  ])
  const aggregate = run(
    root,
    localHooks,
    'fork-governance-dispatcher.sh',
    'claude',
    editsPayload(10),
  )
  assert.equal(aggregate.status, 70)
  assert.match(aggregate.stderr, /aggregate child output exceeds 8388608 bytes/)
  assert.equal(aggregate.stdout, '')
})

test('product runtime preserves descriptor-to-file context order and short-circuits the first policy block', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const descriptor = (file, outputMode) => ({
    file: `hooks/${file}`,
    matcher: '',
    runtime: 'bash',
    outputMode,
    inputContract: 'event-v1',
    transcriptRequirement: 'none',
  })
  await setFixtureEventHooks(root, 'PostToolUse', [
    descriptor('context-first.sh', 'governance-context'),
    descriptor('context-second.sh', 'governance-context'),
  ])
  const orderLog = resolve(root, '.git/descriptor-order.log')
  for (const provider of ['claude', 'codex']) {
    await writeFile(orderLog, '')
    const result = run(
      root,
      localHooks,
      'fork-governance-dispatcher.sh',
      provider,
      twoPathPayload(provider),
      { GOVERNANCE_TEST_STATE: orderLog },
    )
    assert.equal(result.status, 0, `${provider}:${result.stderr}`)
    assert.deepEqual(
      (await readFile(orderLog, 'utf8')).trim().split('\n'),
      ['first:One.tsx', 'first:Two.tsx', 'second:One.tsx', 'second:Two.tsx'],
    )
    const native = JSON.parse(result.stdout)
    const message = provider === 'claude'
      ? native.hookSpecificOutput.additionalContext
      : native.systemMessage
    assert.equal(message, 'first:One.tsx\n\nfirst:Two.tsx\n\nsecond:One.tsx\n\nsecond:Two.tsx')
  }

  await setFixtureEventHooks(root, 'PostToolUse', [
    descriptor('policy-first.sh', 'blocking'),
    descriptor('later-side-effect.sh', 'blocking'),
  ])
  for (const provider of ['claude', 'codex']) {
    await writeFile(orderLog, '')
    const result = run(
      root,
      localHooks,
      'fork-governance-dispatcher.sh',
      provider,
      twoPathPayload(provider),
      { GOVERNANCE_TEST_STATE: orderLog },
    )
    assert.equal(result.status, 2, `${provider}:${result.stderr}`)
    assert.match(result.stderr, /first policy block/)
    assert.deepEqual((await readFile(orderLog, 'utf8')).trim().split('\n'), ['policy:One.tsx'])
  }
})

test('product runtime short-circuits the first Stop decision and honors a future provider blocking code', async (t) => {
  const { root, localHooks } = await productFixture(t)
  await setFixtureEventHooks(root, 'Stop', [
    {
      file: 'hooks/stop-first.sh',
      matcher: '',
      runtime: 'bash',
      outputMode: 'governance-decision',
      inputContract: 'event-v1',
      transcriptRequirement: 'none',
    },
    {
      file: 'hooks/stop-later.sh',
      matcher: '',
      runtime: 'bash',
      outputMode: 'governance-decision',
      inputContract: 'event-v1',
      transcriptRequirement: 'none',
    },
  ])
  const orderLog = resolve(root, '.git/stop-order.log')
  for (const provider of ['claude', 'codex']) {
    await writeFile(orderLog, '')
    const payload = provider === 'claude'
      ? { hook_event_name: 'Stop', tool_name: 'Stop', tool_input: {} }
      : { event: 'Stop', tool_name: 'Stop', tool_input: {} }
    const result = run(
      root,
      localHooks,
      'fork-governance-dispatcher.sh',
      provider,
      payload,
      { GOVERNANCE_TEST_STATE: orderLog },
    )
    assert.equal(result.status, 0, `${provider}:${result.stderr}`)
    assert.deepEqual((await readFile(orderLog, 'utf8')).trim().split('\n'), ['stop:first'])
    assert.deepEqual(
      JSON.parse(result.stdout),
      provider === 'claude'
        ? { decision: 'block', reason: 'first stop' }
        : { continue: false, stopReason: 'first stop' },
    )
  }

  await writeFile(orderLog, '')
  const future = run(
    root,
    localHooks,
    'fork-governance-dispatcher.sh',
    'future',
    { kind: 'stop', verb: 'stop' },
    { GOVERNANCE_TEST_STATE: orderLog },
  )
  assert.equal(future.status, 23, future.stderr)
  assert.equal(future.stdout, '')
  assert.match(future.stderr, /first stop/)
  assert.deepEqual((await readFile(orderLog, 'utf8')).trim().split('\n'), ['stop:first'])

  await updateFixtureManifest(root, (manifest) => {
    manifest.providerAdapters.future.blockingExitCode = 0
  })
  await writeFile(orderLog, '')
  const invalidAdapter = run(
    root,
    localHooks,
    'fork-governance-dispatcher.sh',
    'future',
    { kind: 'stop', verb: 'stop' },
    { GOVERNANCE_TEST_STATE: orderLog },
  )
  assert.equal(invalidAdapter.status, 70)
  assert.match(invalidAdapter.stderr, /invalid blockingExitCode/)
  assert.equal(await readFile(orderLog, 'utf8'), '')

  await updateFixtureManifest(root, (manifest) => {
    manifest.providerAdapters.future.blockingExitCode = 70
  })
  const integrityCollision = run(
    root,
    localHooks,
    'fork-governance-dispatcher.sh',
    'future',
    { kind: 'stop', verb: 'stop' },
    { GOVERNANCE_TEST_STATE: orderLog },
  )
  assert.equal(integrityCollision.status, 70)
  assert.match(integrityCollision.stderr, /invalid blockingExitCode/)
  assert.equal(await readFile(orderLog, 'utf8'), '')
})

test('product launchers carry large payloads only on stdin and scrub aliases before their first child', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const payload = {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'README.md', new_string: 'x'.repeat(512 * 1024) },
  }
  for (const [provider, providerPayload] of [
    ['claude', payload],
    ['codex', payload],
    ['future', {
      kind: 'afterwrite',
      verb: 'mutate',
      target: 'README.md',
      text: 'x'.repeat(512 * 1024),
    }],
  ]) {
    const result = run(root, localHooks, 'fork-governance-dispatcher.sh', provider, providerPayload, {
      GOVERNANCE_TOOL_INPUT: 'stale-neutral',
      CLAUDE_TOOL_INPUT: 'stale-claude',
      FUTURE_TOOL_INPUT: 'stale-future',
      UNREGISTERED_TOOL_INPUT: 'stale-unregistered',
    })
    assert.equal(result.status, 0, result.stderr)
  }

  const sharedMulti = {
    hook_event_name: 'PostToolUse',
    tool_name: 'MultiEdit',
    tool_input: {
      changed_paths: [
        ...Array.from({ length: 9 }, (_, index) => `src/Shared-${index}.tsx`),
        'apps/demo/src/Bad.tsx',
      ],
      new_string: `VIOLATION:${'x'.repeat(128 * 1024)}`,
    },
  }
  for (const provider of ['claude', 'codex']) {
    const result = run(root, localHooks, 'fork-governance-dispatcher.sh', provider, sharedMulti)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /later-file violation/)
    assert.doesNotMatch(result.stderr, /ENOBUFS|Argument list too long/)
  }

  const bashEnvironment = resolve(root, 'inject-large-payload-environment.sh')
  const poisonedPath = resolve(root, 'poisoned-path')
  await mkdir(poisonedPath)
  for (const command of ['node', 'git', 'jq', 'python3']) {
    const poison = resolve(poisonedPath, command)
    await writeFile(poison, '#!/bin/sh\nexit 91\n')
    chmodSync(poison, 0o755)
  }
  await writeFile(bashEnvironment, [
    'if [ -z "${GOVERNANCE_PAYLOAD_ENV_INJECTED:-}" ]; then',
    '  export GOVERNANCE_PAYLOAD_ENV_INJECTED=1',
    "  printf -v CLAUDE_TOOL_INPUT '%*s' 4194304 ''",
    '  export CLAUDE_TOOL_INPUT',
    'fi',
    '',
  ].join('\n'))
  const afterLaunch = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'README.md', new_string: 'benign' },
  }, {
    PATH: poisonedPath,
    GIT_DIR: '/spoofed/git-dir',
    GIT_WORK_TREE: '/spoofed/git-work-tree',
    GIT_CONFIG_SYSTEM: '/spoofed/git-system-config',
    GIT_CONFIG_GLOBAL: '/spoofed/git-global-config',
    GIT_CONFIG_COUNT: '1',
    PYTHONSTARTUP: '/spoofed/python-startup.py',
    PYTHONINSPECT: '1',
    BASH_ENV: bashEnvironment,
  })
  assert.equal(afterLaunch.status, 0, afterLaunch.stderr)

  const sessionStart = run(
    root,
    localHooks,
    'inject_fork_governance_preamble.sh',
    'codex',
    { event: 'SessionStart' },
    {
      PATH: poisonedPath,
      GIT_DIR: '/spoofed/git-dir',
      GIT_WORK_TREE: '/spoofed/git-work-tree',
      GIT_CONFIG_SYSTEM: '/spoofed/git-system-config',
      GIT_CONFIG_GLOBAL: '/spoofed/git-global-config',
      GIT_CONFIG_COUNT: '1',
      PYTHONSTARTUP: '/spoofed/python-startup.py',
      PYTHONINSPECT: '1',
      BASH_ENV: bashEnvironment,
    },
  )
  assert.equal(sessionStart.status, 0, sessionStart.stderr)
  assert.deepEqual(Object.keys(JSON.parse(sessionStart.stdout)), ['systemMessage'])
})

test('product dispatcher materializes exact trusted proposed state for Claude, Codex, and future providers', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const proposedViolation = 'export const Existing = () => <ChromeHeader withTabs={false} />\n'
  const cases = [
    ['claude-write', 'claude', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      governance_write_state: { schemaVersion: 1, path: 'spoof.tsx', kind: 'text', content: 'safe' },
      governance_fake: 'top-level-spoof',
      tool_input: {
        file_path: 'apps/demo/src/ClaudeWrite.tsx',
        content: proposedViolation,
        governance_write_state: { schemaVersion: 1, path: 'spoof.tsx', kind: 'text', content: 'safe' },
        governance_fake: 'nested-spoof',
      },
    }],
    ['claude-first-edit', 'claude', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: 'apps/demo/src/Existing.tsx',
        old_string: 'mode="old"',
        new_string: 'withTabs={false}',
      },
    }],
    ['codex-apply-patch', 'codex', {
      event: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          '*** Update File: apps/demo/src/Existing.tsx',
          '@@',
          '-export const Existing = () => <ChromeHeader mode="old" />',
          '+export const Existing = () => <ChromeHeader withTabs={false} />',
          '*** End Patch',
        ].join('\n'),
      },
    }],
    ['future-write', 'future', {
      kind: 'beforewrite',
      verb: 'mutate',
      target: 'apps/demo/src/FutureWrite.tsx',
      text: proposedViolation,
    }],
  ]
  for (const [label, provider, payload] of cases) {
    const result = run(root, localHooks, 'fork-governance-dispatcher.sh', provider, payload)
    assert.equal(result.status, provider === 'future' ? 23 : 2, `${label}:${result.stderr}`)
    assert.match(result.stderr, /proposed full-state violation/, label)
  }

  const cleanCases = [
    ['claude', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {
        file_path: 'apps/demo/src/Existing.tsx',
        old_string: 'mode="old"',
        new_string: 'mode="new"',
      },
    }],
    ['codex', {
      event: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        command: [
          '*** Begin Patch',
          '*** Update File: apps/demo/src/Existing.tsx',
          '@@',
          '-export const Existing = () => <ChromeHeader mode="old" />',
          '+export const Existing = () => <ChromeHeader mode="new" />',
          '*** End Patch',
        ].join('\n'),
      },
    }],
    ['future', {
      kind: 'beforewrite',
      verb: 'mutate',
      target: 'apps/demo/src/FutureClean.tsx',
      text: 'export const FutureClean = () => null\n',
    }],
  ]
  for (const [provider, payload] of cleanCases) {
    const clean = run(root, localHooks, 'fork-governance-dispatcher.sh', provider, payload)
    assert.equal(clean.status, 0, `${provider}:${clean.stderr}`)
    if (provider === 'future') assert.match(clean.stderr, /DS 產品開發提示/)
    else assert.equal(clean.stderr, '', provider)
  }
  assert.equal(
    await readFile(resolve(root, 'apps/demo/src/Existing.tsx'), 'utf8'),
    'export const Existing = () => <ChromeHeader mode="old" />\n',
    'proposed materialization must never write the checkout',
  )
})

test('product dispatcher distinguishes policy denial from child integrity failure', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const payload = (content) => ({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    governance_write_state: { schemaVersion: 1, path: 'spoof', kind: 'text', content: 'spoof' },
    governance_fake: 'spoof',
    tool_input: {
      file_path: 'apps/demo/src/Bad.tsx',
      new_string: content,
      governance_write_state: { schemaVersion: 1, path: 'spoof', kind: 'text', content: 'spoof' },
      governance_fake: 'spoof',
    },
  })

  const policy = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', payload('VIOLATION'))
  assert.equal(policy.status, 2, policy.stderr)
  assert.match(policy.stderr, /later-file violation/)

  for (const content of ['INTEGRITY', 'UNDEFINED', 'MALFORMED', 'OVERFLOW', 'INVALID_UTF8']) {
    const result = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', payload(content))
    assert.equal(result.status, 70, `${content}:${result.stderr}`)
    assert.match(result.stderr, /GOVERNANCE_INTEGRITY:/, content)
  }
})

test('product runtime bounds and strictly decodes provider input and forbids diagnostic raw stdout', async (t) => {
  const { root, localHooks } = await productFixture(t)
  for (const [label, raw] of [
    ['invalid UTF-8', Buffer.from([0xff])],
    ['malformed JSON', Buffer.from('{"hook_event_name":')],
  ]) {
    const result = runRaw(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', raw)
    assert.equal(result.status, 70, `${label}:${result.stderr.toString('utf8')}`)
    assert.match(result.stderr.toString('utf8'), /GOVERNANCE_INTEGRITY:/, label)
  }

  const cleanDiagnostic = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', {
    hook_event_name: 'UserPromptSubmit',
    prompt: 'clean',
    transcript_path: '/attacker/transcript.jsonl',
    tool_input: {
      transcript_path: '/attacker/nested-transcript.jsonl',
      metadata: { transcript_path: '/attacker/deep-transcript.jsonl' },
    },
  })
  assert.equal(cleanDiagnostic.status, 0, cleanDiagnostic.stderr)
  assert.match(cleanDiagnostic.stderr, /diagnostic notice/)
  for (const prompt of ['RAW_STDOUT', 'DIAGNOSTIC_ERROR', 'INTEGRITY_MARKER']) {
    const result = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', {
      hook_event_name: 'UserPromptSubmit',
      prompt,
    })
    assert.equal(result.status, 70, `${prompt}:${result.stderr}`)
    assert.match(result.stderr, /GOVERNANCE_INTEGRITY:/)
  }
})

test('product runtime strips one large provider patch before 100 path-local dispatches', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const body = `export const Linear = ${JSON.stringify('x'.repeat(1024))}`
  const measure = async (count, { largeEnvelope = false } = {}) => {
    const log = resolve(root, `.git/linear-dispatch-bytes-${count}.log`)
    const command = [
      '*** Begin Patch',
      ...Array.from({ length: count }, (_, index) => [
        `*** Add File: apps/demo/src/Linear-${index}.tsx`,
        `+${body}`,
      ]).flat(),
      '*** End Patch',
    ].join('\n')
    const result = run(root, localHooks, 'fork-governance-dispatcher.sh', 'codex', {
      event: 'PostToolUse',
      tool_name: 'apply_patch',
      transcript_path: '/attacker/transcript.jsonl',
      irrelevant_metadata: largeEnvelope ? 'top-level-irrelevant'.repeat(8192) : '',
      tool_input: {
        command,
        irrelevant_metadata: largeEnvelope ? 'nested-irrelevant'.repeat(8192) : '',
      },
    }, {
      GOVERNANCE_TEST_BATCH_ORDER_LOG: log,
      GOVERNANCE_TRANSCRIPT_PATH: '/attacker/environment-transcript.jsonl',
      GOVERNANCE_TRANSCRIPT_TRUST: 'attacker',
    })
    assert.equal(result.status, 0, result.stderr)
    const logBody = await readFile(log, 'utf8')
    const sizes = logBody.trim().split('\n').map(Number)
    assert.equal(sizes.length, count, JSON.stringify(logBody.slice(0, 500)))
    assert.equal(sizes.every((size) => Number.isInteger(size) && size > 0), true)
    return {
      command,
      sizes,
      total: sizes.reduce((sum, size) => sum + size, 0),
    }
  }

  const pathLocal25 = await measure(25)
  const pathLocal100 = await measure(100, { largeEnvelope: true })
  const command100Bytes = Buffer.byteLength(pathLocal100.command)
  const allChildSizes = [...pathLocal25.sizes, ...pathLocal100.sizes]
  assert.equal(
    allChildSizes.every((size) => size < command100Bytes),
    true,
    `${Math.max(...allChildSizes)} max child payload must remain below the ${command100Bytes}-byte provider patch`,
  )
  assert.equal(
    pathLocal100.total < pathLocal25.total * 5,
    true,
    `${pathLocal100.total} bytes for 100 paths must scale linearly from ${pathLocal25.total} bytes for 25 paths`,
  )
  await assert.rejects(readFile(resolve(root, 'apps/demo/src/Linear-0.tsx')), /ENOENT/)
})

test('product hook execution rejects a symlinked hook parent and the retired temp-marker poison is inert', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const poisonRoot = await realpath(await mkdtemp(resolve(tmpdir(), 'product-marker-poison-')))
  const hookOutside = await realpath(await mkdtemp(resolve(tmpdir(), 'product-hook-parent-')))
  t.after(() => rm(poisonRoot, { recursive: true, force: true }))
  t.after(() => rm(hookOutside, { recursive: true, force: true }))
  const sentinel = resolve(poisonRoot, 'sentinel.txt')
  await writeFile(sentinel, 'unchanged\n')
  await symlink(sentinel, resolve(poisonRoot, '.ds-fork-quality-hinted-poison'), 'file')

  const clean = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: {
      file_path: 'apps/demo/src/Poison.tsx',
      content: 'export const Poison = () => null\n',
    },
  }, {
    TMPDIR: poisonRoot,
    GOVERNANCE_SESSION_ID: 'poison',
  })
  assert.equal(clean.status, 0, clean.stderr)
  assert.equal(await readFile(sentinel, 'utf8'), 'unchanged\n')

  const forkHooks = resolve(root, 'node_modules/@qijenchen/design-system/ds-canonical/fork/hooks')
  await cp(resolve(forkHooks, 'gate.sh'), resolve(hookOutside, 'gate.sh'))
  await cp(resolve(forkHooks, 'proposed-gate.sh'), resolve(hookOutside, 'proposed-gate.sh'))
  await cp(resolve(forkHooks, 'diagnostic-gate.sh'), resolve(hookOutside, 'diagnostic-gate.sh'))
  await cp(resolve(forkHooks, 'check_fork_product_quality.sh'), resolve(hookOutside, 'check_fork_product_quality.sh'))
  await rm(forkHooks, { recursive: true })
  await symlink(hookOutside, forkHooks, 'dir')
  const rejected = run(root, localHooks, 'fork-governance-dispatcher.sh', 'claude', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'README.md', new_string: 'benign' },
  })
  assert.equal(rejected.status, 70, rejected.stderr)
  assert.match(rejected.stderr, /corpus entry .* crosses a symbolic link/)
  assert.equal(await readFile(sentinel, 'utf8'), 'unchanged\n')
})

test('product dispatcher onboards a future provider through manifest normalization data only', async (t) => {
  const { root, localHooks } = await productFixture(t)
  const payload = {
    kind: 'afterwrite', verb: 'mutate',
    batch: [{ path: 'README.md', text: 'benign' }, { path: 'apps/demo/src/Bad.tsx', text: 'VIOLATION' }],
  }
  const result = run(root, localHooks, 'fork-governance-dispatcher.sh', 'future', payload)
  assert.equal(result.status, 23)
  assert.match(result.stderr, /later-file violation/)
})
