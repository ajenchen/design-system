#!/usr/bin/env node
// Canonical static validator for registry-resolved provider CLI marker arrays.
// Hook shells pass JSON as data; executable JavaScript must remain committed here.

const [mode, encoded, ...extra] = process.argv.slice(2)
if (extra.length !== 0 || !['peer-invocation', 'discovery'].includes(mode)) process.exit(2)

const value = JSON.parse(encoded)
const valid = Array.isArray(value)
  && value.length > 0
  && (
    mode === 'peer-invocation'
      ? value.every((item) => (
          typeof item === 'string'
          && /^(?:[a-z][a-z0-9-]*|--?[a-z][a-z0-9-]*)$/.test(item)
        ))
      : value.every((item) => typeof item === 'string' && item.length > 0)
  )
if (!valid) process.exit(2)

process.stdout.write(
  value.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
)
