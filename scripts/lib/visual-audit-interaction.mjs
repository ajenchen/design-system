const INTERACTION_KEYS = new Set(['action', 'selector'])
const SUPPORTED_ACTIONS = new Set(['hover'])
const POINTER_PROOF_KEY = '__visualAuditTrustedPointerProof__'
const POINTER_CLEANUP_KEY = '__visualAuditTrustedPointerCleanup__'

function fail(message) {
  throw new Error(`visual interaction contract:${message}`)
}

/** Validate and canonicalize one optional scenario interaction from visual-assertions.json. */
export function normalizeVisualInteraction(interaction, label = 'scenario.interaction') {
  if (interaction === undefined) return undefined
  if (
    interaction === null
    || typeof interaction !== 'object'
    || Array.isArray(interaction)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(interaction))
  ) {
    fail(`${label} must be a plain object`)
  }

  const keys = Object.keys(interaction)
  const unknown = keys.filter((key) => !INTERACTION_KEYS.has(key))
  const missing = [...INTERACTION_KEYS].filter((key) => !Object.hasOwn(interaction, key))
  if (unknown.length || missing.length || keys.length !== INTERACTION_KEYS.size) {
    fail(
      `${label} must have exactly action + selector`
      + `${unknown.length ? `; unknown=${unknown.join(',')}` : ''}`
      + `${missing.length ? `; missing=${missing.join(',')}` : ''}`,
    )
  }

  if (typeof interaction.action !== 'string' || !SUPPORTED_ACTIONS.has(interaction.action)) {
    fail(`${label}.action must be exactly "hover"`)
  }
  if (
    typeof interaction.selector !== 'string'
    || interaction.selector.length === 0
    || interaction.selector !== interaction.selector.trim()
    || /[\0\r\n]/.test(interaction.selector)
  ) {
    fail(`${label}.selector must be one non-empty trimmed single-line CSS selector`)
  }

  return Object.freeze({
    action: interaction.action,
    selector: interaction.selector,
  })
}

/**
 * Execute one validated interaction through Playwright's real pointer path.
 * The target must be unique and the browser must confirm the CSS :hover state.
 */
export async function executeVisualInteraction(
  page,
  interaction,
  { settleMs = 250, timeoutMs = 5_000 } = {},
) {
  const canonical = normalizeVisualInteraction(interaction)
  if (!canonical) return null
  if (!page || typeof page.locator !== 'function' || typeof page.waitForTimeout !== 'function') {
    fail('a Playwright page is required')
  }
  if (!Number.isInteger(settleMs) || settleMs < 0 || settleMs > 5_000) {
    fail('settleMs must be an integer between 0 and 5000')
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    fail('timeoutMs must be an integer between 1 and 30000')
  }

  let locator
  let matched
  try {
    locator = page.locator(canonical.selector)
    matched = await locator.count()
  } catch (error) {
    fail(`invalid selector "${canonical.selector}":${error.message}`)
  }
  if (matched !== 1) {
    fail(`selector "${canonical.selector}" must match exactly 1 target; matched ${matched}`)
  }

  await page.evaluate(
    ({ proofKey, cleanupKey }) => {
      globalThis[cleanupKey]?.()
      delete globalThis[proofKey]
      const recordTrustedPointer = (event) => {
        if (!event.isTrusted) return
        globalThis[proofKey] = {
          clientX: event.clientX,
          clientY: event.clientY,
          isTrusted: event.isTrusted,
          pointerType: event.pointerType,
        }
      }
      globalThis.addEventListener('pointermove', recordTrustedPointer, { capture: true })
      globalThis[cleanupKey] = () => {
        globalThis.removeEventListener('pointermove', recordTrustedPointer, { capture: true })
        delete globalThis[cleanupKey]
      }
    },
    { proofKey: POINTER_PROOF_KEY, cleanupKey: POINTER_CLEANUP_KEY },
  )

  let pointerProof
  try {
    await locator.hover({ timeout: timeoutMs })
    await page.waitForTimeout(settleMs)
    pointerProof = await locator.evaluate(
      (element, proofKey) => {
        const proof = globalThis[proofKey]
        if (!proof) return null
        const hit = document.elementFromPoint(proof.clientX, proof.clientY)
        return {
          isTrusted: proof.isTrusted === true,
          pointerType: proof.pointerType,
          targetHit: hit === element || element.contains(hit),
          hitTarget: hit === element ? 'target' : (element.contains(hit) ? 'descendant' : 'outside'),
        }
      },
      POINTER_PROOF_KEY,
    )
  } catch (error) {
    fail(`hover failed for "${canonical.selector}":${error.message}`)
  } finally {
    await page.evaluate(
      ({ proofKey, cleanupKey }) => {
        globalThis[cleanupKey]?.()
        delete globalThis[proofKey]
      },
      { proofKey: POINTER_PROOF_KEY, cleanupKey: POINTER_CLEANUP_KEY },
    ).catch(() => {})
  }

  // Chromium paints :hover correctly but does not expose it through Element.matches(':hover')
  // in headless mode. A trusted pointermove whose hit-tested node is the target/descendant is
  // the browser-level proof; synthetic userEvent.hover() produces isTrusted=false.
  const hoverVerified = Boolean(
    pointerProof?.isTrusted
    && pointerProof.pointerType === 'mouse'
    && pointerProof.targetHit,
  )
  if (!hoverVerified) {
    fail(`Playwright did not leave a trusted mouse pointer on "${canonical.selector}"`)
  }

  return Object.freeze({
    action: canonical.action,
    selector: canonical.selector,
    matched,
    hoverVerified,
    verification: 'trusted-pointer-hit',
    hitTarget: pointerProof.hitTarget,
    settleMs,
  })
}
