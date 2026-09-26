const CRITICAL_RESOURCE_TYPES = new Set(['document', 'script', 'stylesheet'])
const DEFAULT_ROOT_SELECTORS = ['#storybook-root', '#root']
const DEFAULT_DOCUMENT_ROOT_SELECTORS = ['#root', '#__next', '#__nuxt', 'main', 'body']
const DEFAULT_PORTAL_SELECTORS = [
  'body > [data-radix-portal]',
  'body > [data-sonner-toaster]',
  'body > [role="dialog"]',
  'body > [role="menu"]',
  'body > [role="listbox"]',
]

function fail(message) {
  throw new Error(`render health:${message}`)
}

function resourceFailure(response) {
  const status = response.status()
  const request = response.request()
  const type = request.resourceType()
  if (status < 400 || !CRITICAL_RESOURCE_TYPES.has(type)) return null
  return `${type} ${status} ${response.url()}`
}

/**
 * Install before navigation so a Storybook preview cannot turn a failed JS/CSS load into an
 * empty-canvas false green. The returned assertion also rejects page exceptions and an empty
 * story root, while allowing a genuinely portal-only story.
 */
export function createRenderHealthMonitor(page, { mode = 'storybook' } = {}) {
  if (!page || typeof page.on !== 'function' || typeof page.evaluate !== 'function' || typeof page.waitForFunction !== 'function') {
    fail('a Playwright page is required')
  }
  if (mode !== 'storybook' && mode !== 'document') fail(`unsupported mode:${mode}`)
  const rootSelectors = mode === 'storybook' ? DEFAULT_ROOT_SELECTORS : DEFAULT_DOCUMENT_ROOT_SELECTORS

  const criticalFailures = []
  const pageErrors = []
  const onResponse = (response) => {
    const failure = resourceFailure(response)
    if (failure) criticalFailures.push(failure)
  }
  const onRequestFailed = (request) => {
    const type = request.resourceType()
    if (!CRITICAL_RESOURCE_TYPES.has(type)) return
    criticalFailures.push(`${type} request failed ${request.url()}:${request.failure()?.errorText ?? 'unknown error'}`)
  }
  const onPageError = (error) => pageErrors.push(error?.message ?? String(error))

  page.on('response', onResponse)
  page.on('requestfailed', onRequestFailed)
  page.on('pageerror', onPageError)

  let disposed = false
  return Object.freeze({
    async assertHealthy({ label = 'story', timeoutMs = 5_000 } = {}) {
      if (disposed) fail('monitor was already disposed')
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
        fail('timeoutMs must be an integer between 1 and 30000')
      }

      if (mode === 'storybook') {
        const storybookError = (await page.evaluate(() => document.querySelector('#error-message')?.textContent ?? ''))?.trim()
        if (storybookError) fail(`${label}:Storybook error display:${storybookError.slice(0, 300)}`)
      }

      try {
        await page.waitForFunction(
          ({ rootSelectors, portalSelectors }) => {
            const infrastructureTags = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'])
            const meaningful = (element) => Array.from(element.childNodes).some((node) => {
              if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent?.trim())
              if (node.nodeType !== Node.ELEMENT_NODE) return false
              return !infrastructureTags.has(node.tagName)
            })
            const root = rootSelectors.map((selector) => document.querySelector(selector)).find(Boolean)
            if (root && meaningful(root)) return true
            return portalSelectors.some((selector) => {
              const portal = document.querySelector(selector)
              return portal ? meaningful(portal) : false
            })
          },
          { rootSelectors, portalSelectors: DEFAULT_PORTAL_SELECTORS },
          { timeout: timeoutMs },
        )
      } catch {
        const detail = criticalFailures.length
          ? `; critical resource failures=${criticalFailures.slice(0, 5).join(' | ')}`
          : ''
        fail(`${label}:${mode === 'storybook' ? 'empty story root' : 'empty document root'}${detail}`)
      }

      if (criticalFailures.length) {
        fail(`${label}:critical resource failures=${criticalFailures.slice(0, 5).join(' | ')}`)
      }
      if (pageErrors.length) fail(`${label}:page exceptions=${pageErrors.slice(0, 5).join(' | ')}`)
      return Object.freeze({ root: 'rendered', criticalFailures: 0, pageErrors: 0 })
    },
    dispose() {
      if (disposed) return
      disposed = true
      page.off('response', onResponse)
      page.off('requestfailed', onRequestFailed)
      page.off('pageerror', onPageError)
    },
  })
}

export function createStorybookRenderHealthMonitor(page) {
  return createRenderHealthMonitor(page, { mode: 'storybook' })
}
