// The model-broker deep-audit execution layer retired on 2026-08-04 (baton §8.3):
// its certification machinery never certified any peer and every real audit run
// used the waived self-review route. This standalone entry preserves the canonical
// fail-closed contract for every retired transport — including the
// providers.json codex-collab review-class binding — without invoking any model:
// a required independent-review claim stays REVIEW-BLOCKED until a certified peer
// exists, and the receipt records which entrypoint was asked, when, and why.
export async function runRetiredModelEntrypoint(name, argv = process.argv.slice(2), options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('runner options must be an object')
  }
  process.stderr.write(`${name} is retired; the model-broker execution layer was removed 2026-08-04 and no model is invoked.\n`)
  return Object.freeze({
    schemaVersion: 1,
    kind: 'retired-model-entrypoint-result',
    entrypoint: String(name),
    status: 'REVIEW-BLOCKED',
    reasonCode: 'MODEL_BROKER_EXECUTION_RETIRED',
    reason: 'The model-broker deep-audit execution layer retired 2026-08-04; independent-review claims stay REVIEW-BLOCKED until a certified peer exists (waived self-review remains the standard route).',
    executionAuthorized: false,
    argv: Object.freeze([...argv].map(String)),
  })
}

export function printRetiredModelResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
