#!/usr/bin/env node

// Test-only HTTPS client for the system trust-store probe in scripts/test-verified-exact-npm-runtime.mjs.
// It reproduces the two TLS clients of the locked setup chain against a local server whose certificate is
// signed by a probe CA: `default` is Node's default trust (the locked npm child; the caller decides whether
// `--use-system-ca` is on the node argv), `anchors` is the in-process registry download, which passes
// verifiedRegistryTrustAnchors() as `ca`. It prints exactly one line: `STATUS <code>` or `ERROR <code>`.

import https from 'node:https'
import { verifiedRegistryTrustAnchors } from '../lib/verified-exact-npm-runtime.mjs'

const [port, mode] = process.argv.slice(2)
if (!/^\d+$/.test(port || '') || !['default', 'anchors'].includes(mode)) {
  console.log('ERROR usage: system-trust-probe-client.mjs <port> <default|anchors>')
  process.exit(2)
}
const ca = mode === 'anchors' ? verifiedRegistryTrustAnchors() : undefined
https.get({ host: '127.0.0.1', port: Number(port), path: '/', ...(ca ? { ca } : {}) }, (response) => {
  response.resume()
  response.on('end', () => console.log(`STATUS ${response.statusCode}`))
}).on('error', (error) => {
  console.log(`ERROR ${error.code || error.message}`)
  process.exitCode = 3
})
