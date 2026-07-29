// Release publish 冪等探針(WF-NODE-DYNAMIC-CODE 合規:workflow 只准呼叫
// committed 靜態 CLI,不准 node -p/-e inline code)。
// 比對本地 tarball 與 registry 上同名同版的 dist.integrity:
//   stdout `absent`    — 該版未發,caller 應 publish
//   stdout `identical` — 該版已發且位元組完全一致,caller 應 skip(冪等 rerun)
//   同版但位元組不同   — stderr + exit 1(fail-closed;npm 版本不可覆蓋發布)
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function arg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) fail(`missing required argument ${name}`)
  return process.argv[index + 1]
}

function tarEntry(archive, entryName) {
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const name = header.subarray(0, 100).toString('utf8').replace(/\0[\s\S]*$/, '')
    const size = Number.parseInt(header.subarray(124, 136).toString('utf8').replace(/\0[\s\S]*$/, '').trim(), 8)
    if (!Number.isFinite(size) || size < 0) fail(`invalid tar entry size for ${name || '<unnamed>'}`)
    if (name === entryName) return archive.subarray(offset + 512, offset + 512 + size)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return fail(`tar entry ${entryName} not found`)
}

const tarballPath = arg('--tarball')
const version = arg('--version')
const tarball = readFileSync(tarballPath)
let manifest
try {
  manifest = JSON.parse(tarEntry(gunzipSync(tarball), 'package/package.json').toString('utf8'))
} catch (error) {
  fail(`unreadable release tarball ${tarballPath}: ${error.message}`)
}
const name = manifest.name
if (typeof name !== 'string' || !/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) {
  fail(`invalid package name in ${tarballPath}`)
}
const localIntegrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`

const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}/${encodeURIComponent(version)}`)
if (response.status === 404) {
  process.stdout.write('absent\n')
  process.exit(0)
}
if (!response.ok) fail(`registry probe failed for ${name}@${version}: HTTP ${response.status}`)
const body = await response.json()
const publishedIntegrity = body && body.dist ? body.dist.integrity : undefined
if (publishedIntegrity === localIntegrity) {
  process.stdout.write('identical\n')
  process.exit(0)
}
fail(`registry already holds ${name}@${version} with DIFFERENT bytes: refusing to continue`)
