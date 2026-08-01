const EMPTY_CSS_PLACEHOLDER_LINE = /^\/\* empty css[\t ]*\*\/$/gm

export function normalizeViteEmptyCssPlaceholders(code) {
  if (typeof code !== 'string') throw new TypeError('Vite chunk code must be a string')
  return code.replace(EMPTY_CSS_PLACEHOLDER_LINE, '/* empty css */')
}

export function deterministicViteOutputPlugin() {
  return {
    name: 'qijenchen-deterministic-vite-output',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue
          output.code = normalizeViteEmptyCssPlaceholders(output.code)
        }
      },
    },
  }
}
