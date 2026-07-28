#!/usr/bin/env node
/**
 * Fail-closed governance tamper ratchet.
 *
 * R1 binds every executable top-level release-preflight run() call by exact
 * source identity and also binds the exact non-gate preflight scaffold. Every gate-ledger
 * transition (addition, deletion, substitution, or reordering) and every
 * runner/scaffold mutation requires a lineage-recorded baseline update. The
 * marker is audit metadata, not approval; external authorization is enforced
 * separately by the protected-base privileged-change protocol when activated.
 *
 * R2 validates every time-boxed
 *   @waiver(owner:<x> expiry:<YYYY-MM-DD> reason:<non-empty>)
 * in authoritative repository source. The scanner is PATH-independent, uses
 * no-follow stable reads, rejects opaque text and link/special-file tricks, and
 * re-reads the complete file/directory inventory before returning success.
 *
 * Usage:
 *   node scripts/check-governance-tamper.mjs --check [--root <repo>]
 *   node scripts/check-governance-tamper.mjs --update-baseline [--root <repo>]
 */
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import { inflateSync } from 'node:zlib'
import ts from 'typescript'

function usage(message) {
  if (message) console.error(message)
  console.error('usage: check-governance-tamper.mjs (--check | --update-baseline) [--root <repo>]')
  process.exit(2)
}

function parseArguments(argv) {
  let root = null
  let check = false
  let update = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') {
      if (check) usage('duplicate --check')
      check = true
    } else if (argument === '--update-baseline') {
      if (update) usage('duplicate --update-baseline')
      update = true
    } else if (argument === '--root') {
      if (root !== null) usage('duplicate --root')
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) usage('--root requires a repository path')
      root = value
      index += 1
    } else {
      usage(`unknown argument:${argument}`)
    }
  }
  if (check === update) usage('choose exactly one of --check or --update-baseline')
  return { check, update, root }
}

const ARGUMENTS = parseArguments(process.argv.slice(2))
const ROOT = fs.realpathSync(path.resolve(ARGUMENTS.root || process.cwd()))
const RELEASE_PREFLIGHT_RELATIVE = 'scripts/release-preflight.mjs'
const BASELINE_RELATIVE = 'packages/design-system/ds-canonical/references/preflight-gate-baseline.json'
const RELEASE_PREFLIGHT = path.join(ROOT, RELEASE_PREFLIGHT_RELATIVE)
const BASELINE = path.join(ROOT, BASELINE_RELATIVE)
const errors = []
const WAIVER_MARKER = '@waiver('
const MAX_WAIVER_BODY_CHARACTERS = 4096
const MAX_SCANNED_FILE_BYTES = 64n * 1024n * 1024n
const MAX_SCANNED_TOTAL_BYTES = 512n * 1024n * 1024n
const MAX_SCANNED_ENTRIES = 100_000
const MAX_PNG_DECODED_BYTES = 128n * 1024n * 1024n
const MAX_PNG_TOTAL_DECODED_BYTES = 640n * 1024n * 1024n
const MAX_PNG_CHUNKS = 100_000
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const APPROVED_PNG_PREFIX = 'infra/governance/baseline/visual/'
const SHA256 = /^[0-9a-f]{64}$/
const PNG_TOTAL_BUDGET_EXCEEDED = Symbol('png-total-budget-exceeded')
const TRANSITION_NOTE = 'Transition markers are immutable audit metadata only; they do not authenticate a reviewer or grant approval. When external trust is activated, authorization is enforced separately by the protected-base privileged-change verifier against a valid commit-bound privileged-change authorization. Every behavior change requires one header marker @preflight-transition(from-revision:<old revision> from:<old behavior digest> to:<new behavior digest> audit-ref:<change reference> reason:<why>).'
const NO_FOLLOW = fs.constants.O_NOFOLLOW
if (!Number.isInteger(NO_FOLLOW)) {
  throw new Error('O_NOFOLLOW is required; use macOS, Linux, WSL2, or the supported devcontainer')
}

// Exact non-authoritative projection/runtime roots. Their dedicated byte-for-byte
// drift gates remain responsible for these views.
const EXCLUDED_REPOSITORY_PATHS = new Set([
  '.DS_Store',
  '.agents',
  '.claude',
  '.codex',
  '.git',
  '.playwright-mcp',
  'commands',
  'dist',
  'generated',
  'governance/planning',
  'hooks/scripts',
  'scripts/check-governance-tamper.mjs',
  'scripts/test-check-governance-tamper.mjs',
  'skills',
  'snapshots',
  'snapshots-baseline',
  'snapshots-devmode',
  'storybook-static',
  'storybook-static-baseline',
  'tmp',
])

const compareUtf8Bytes = (left, right) =>
  Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'))

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function repositoryRelative(absolute) {
  return path.relative(ROOT, absolute).split(path.sep).join('/').normalize('NFC')
}

function sameStableIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function sameOwnershipIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
}

function sameDirectoryOwnershipIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
}

function stableIdentity(info) {
  return Object.freeze({
    dev: info.dev,
    ino: info.ino,
    mode: info.mode,
    nlink: info.nlink,
    size: info.size,
    mtimeNs: info.mtimeNs,
    ctimeNs: info.ctimeNs,
  })
}

function ownershipIdentity(info) {
  return Object.freeze({
    dev: info.dev,
    ino: info.ino,
    mode: info.mode,
    nlink: info.nlink,
  })
}

function directoryOwnershipIdentity(info) {
  return Object.freeze({
    dev: info.dev,
    ino: info.ino,
    mode: info.mode,
  })
}

function assertUniqueRegularFile(info, relativePath) {
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1n) {
    throw new Error(`source must be a unique regular file:${relativePath}`)
  }
}

function lstatOrNull(absolute) {
  try {
    return fs.lstatSync(absolute, { bigint: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function readStableRegularFile(
  absolute,
  relativePath = repositoryRelative(absolute),
  { maxBytes = MAX_SCANNED_FILE_BYTES } = {},
) {
  const before = fs.lstatSync(absolute, { bigint: true })
  assertUniqueRegularFile(before, relativePath)
  if (fs.realpathSync(absolute) !== absolute) {
    throw new Error(`source path crosses a symbolic link:${relativePath}`)
  }
  const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | NO_FOLLOW)
  try {
    const opened = fs.fstatSync(descriptor, { bigint: true })
    assertUniqueRegularFile(opened, relativePath)
    if (!sameStableIdentity(before, opened)) {
      throw new Error(`source changed before stable read:${relativePath}`)
    }
    if (opened.size > maxBytes) {
      throw new Error(`source exceeds ${maxBytes} byte stable-read limit:${relativePath}`)
    }
    const expectedSize = Number(opened.size)
    const bytes = Buffer.alloc(expectedSize)
    let offset = 0
    while (offset < expectedSize) {
      const count = fs.readSync(descriptor, bytes, offset, expectedSize - offset, offset)
      if (count === 0) break
      offset += count
    }
    const eofProbe = Buffer.alloc(1)
    const bytesBeyondBound = fs.readSync(descriptor, eofProbe, 0, 1, expectedSize)
    const after = fs.fstatSync(descriptor, { bigint: true })
    const pathAfter = fs.lstatSync(absolute, { bigint: true })
    assertUniqueRegularFile(pathAfter, relativePath)
    if (
      offset !== expectedSize
      || bytesBeyondBound !== 0
      || !sameStableIdentity(opened, after)
      || !sameStableIdentity(opened, pathAfter)
      || fs.realpathSync(absolute) !== absolute
    ) {
      throw new Error(`source changed during stable read:${relativePath}`)
    }
    return Object.freeze({
      bytes,
      snapshot: Object.freeze({
        absolute,
        relativePath,
        identity: stableIdentity(opened),
        sha256: sha256(bytes),
      }),
    })
  } finally {
    fs.closeSync(descriptor)
  }
}

function verifyFileSnapshot(snapshot) {
  const current = readStableRegularFile(snapshot.absolute, snapshot.relativePath)
  if (
    !sameStableIdentity(snapshot.identity, current.snapshot.identity)
    || snapshot.sha256 !== current.snapshot.sha256
  ) {
    throw new Error(`source changed after first pass:${snapshot.relativePath}`)
  }
}

function decodeText(bytes, relativePath) {
  if (bytes.length >= UTF8_BOM.length && bytes.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
    throw new Error(`text source must be UTF-8 BOM-free:${relativePath}`)
  }
  if (bytes.includes(0)) throw new Error(`text source must be NUL-free UTF-8:${relativePath}`)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`text source must be NUL-free UTF-8:${relativePath}`)
  }
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let value = 0; value < 256; value += 1) {
    let crc = value
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    table[value] = crc >>> 0
  }
  return table
})()

function crc32Range(bytes, start, end) {
  let crc = 0xffffffff
  for (let index = start; index < end; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function isAsciiLetter(byte) {
  return (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a)
}

function pngPassExtent(fullExtent, start, step) {
  if (fullExtent <= start) return 0
  return Math.floor((fullExtent - start + step - 1) / step)
}

function pngDecodedLayout(width, height, bitDepth, colorType, interlace) {
  const channels = new Map([
    [0, 1],
    [2, 3],
    [3, 1],
    [4, 2],
    [6, 4],
  ]).get(colorType)
  if (!channels) return null
  const passes = interlace === 0
    ? [{ width, height }]
    : [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ].map(([startX, startY, stepX, stepY]) => ({
        width: pngPassExtent(width, startX, stepX),
        height: pngPassExtent(height, startY, stepY),
      }))
  let decodedBytes = 0n
  const layout = []
  for (const pass of passes) {
    if (pass.width === 0 || pass.height === 0) continue
    const rowBytes = (
      (BigInt(pass.width) * BigInt(channels) * BigInt(bitDepth)) + 7n
    ) / 8n
    const passBytes = (rowBytes + 1n) * BigInt(pass.height)
    decodedBytes += passBytes
    if (decodedBytes > MAX_PNG_DECODED_BYTES || rowBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null
    }
    layout.push(Object.freeze({
      height: pass.height,
      rowBytes: Number(rowBytes),
      width: pass.width,
    }))
  }
  return Object.freeze({
    decodedBytes: Number(decodedBytes),
    passes: Object.freeze(layout),
  })
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left
  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

function isStructurallyValidPng(
  bytes,
  { remainingDecodedBytes = MAX_PNG_TOTAL_DECODED_BYTES } = {},
) {
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return false
  let offset = 8
  let chunkIndex = 0
  let width = null
  let height = null
  let bitDepth = null
  let colorType = null
  let interlace = null
  let paletteEntries = null
  let seenPlte = false
  let seenIdat = false
  let endedIdat = false
  let seenIend = false
  const idatChunks = []
  while (offset < bytes.length) {
    if (chunkIndex >= MAX_PNG_CHUNKS) return false
    if (seenIend || offset + 12 > bytes.length) return false
    const length = bytes.readUInt32BE(offset)
    if (length > 0x7fffffff) return false
    const typeStart = offset + 4
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + 4
    if (dataEnd < dataStart || chunkEnd > bytes.length) return false
    const typeBytes = bytes.subarray(typeStart, typeStart + 4)
    if (![...typeBytes].every(isAsciiLetter) || !(typeBytes[2] >= 0x41 && typeBytes[2] <= 0x5a)) return false
    const type = typeBytes.toString('ascii')
    if (crc32Range(bytes, typeStart, dataEnd) !== bytes.readUInt32BE(dataEnd)) return false

    if (chunkIndex === 0) {
      if (type !== 'IHDR' || length !== 13) return false
      width = bytes.readUInt32BE(dataStart)
      height = bytes.readUInt32BE(dataStart + 4)
      bitDepth = bytes[dataStart + 8]
      colorType = bytes[dataStart + 9]
      interlace = bytes[dataStart + 12]
      const allowedDepths = {
        0: new Set([1, 2, 4, 8, 16]),
        2: new Set([8, 16]),
        3: new Set([1, 2, 4, 8]),
        4: new Set([8, 16]),
        6: new Set([8, 16]),
      }
      if (
        width === 0
        || width > 0x7fffffff
        || height === 0
        || height > 0x7fffffff
        || !allowedDepths[colorType]?.has(bitDepth)
        || bytes[dataStart + 10] !== 0
        || bytes[dataStart + 11] !== 0
        || ![0, 1].includes(interlace)
      ) return false
    } else if (type === 'IHDR') {
      return false
    } else if (type === 'PLTE') {
      if (seenPlte || seenIdat || length === 0 || length % 3 !== 0 || length > 768 || [0, 4].includes(colorType)) return false
      paletteEntries = length / 3
      if (colorType === 3 && paletteEntries > (2 ** bitDepth)) return false
      seenPlte = true
    } else if (type === 'IDAT') {
      if (endedIdat || (colorType === 3 && !seenPlte)) return false
      seenIdat = true
      idatChunks.push(bytes.subarray(dataStart, dataEnd))
    } else {
      if (seenIdat) endedIdat = true
      if (type === 'IEND') {
        if (!seenIdat || length !== 0) return false
        seenIend = true
      } else if (typeBytes[0] >= 0x41 && typeBytes[0] <= 0x5a) {
        return false
      }
    }
    offset = chunkEnd
    chunkIndex += 1
  }
  if (
    !seenIend
    || offset !== bytes.length
    || width === null
    || height === null
    || bitDepth === null
    || interlace === null
    || (colorType === 3 && paletteEntries === null)
  ) return false

  const layout = pngDecodedLayout(width, height, bitDepth, colorType, interlace)
  if (!layout) return false
  const decodedBytes = BigInt(layout.decodedBytes)
  if (decodedBytes > remainingDecodedBytes) return PNG_TOTAL_BUDGET_EXCEEDED
  let decoded
  try {
    const compressed = Buffer.concat(idatChunks)
    const inflated = inflateSync(compressed, {
      info: true,
      maxOutputLength: layout.decodedBytes,
    })
    if (inflated.engine.bytesWritten !== compressed.length) return false
    decoded = inflated.buffer
  } catch {
    return false
  }
  if (decoded.length !== layout.decodedBytes) return false
  let packedPaletteByteIsValid = null
  let paletteIndicesPerByte = null
  let paletteMask = null
  if (colorType === 3) {
    paletteIndicesPerByte = 8 / bitDepth
    paletteMask = (2 ** bitDepth) - 1
    packedPaletteByteIsValid = new Uint8Array(256)
    for (let byte = 0; byte < 256; byte += 1) {
      let valid = true
      for (let sample = 0; sample < paletteIndicesPerByte; sample += 1) {
        const shift = 8 - (bitDepth * (sample + 1))
        if (((byte >>> shift) & paletteMask) >= paletteEntries) {
          valid = false
          break
        }
      }
      packedPaletteByteIsValid[byte] = valid ? 1 : 0
    }
  }
  let decodedOffset = 0
  for (const pass of layout.passes) {
    let previousRowStart = null
    for (let row = 0; row < pass.height; row += 1) {
      const filter = decoded[decodedOffset]
      if (filter > 4) return false
      const rowStart = decodedOffset + 1
      if (colorType === 3 && filter !== 0) {
        for (let index = 0; index < pass.rowBytes; index += 1) {
          const left = index === 0 ? 0 : decoded[rowStart + index - 1]
          const above = previousRowStart === null ? 0 : decoded[previousRowStart + index]
          const upperLeft = index === 0 || previousRowStart === null
            ? 0
            : decoded[previousRowStart + index - 1]
          let predictor = 0
          if (filter === 1) predictor = left
          else if (filter === 2) predictor = above
          else if (filter === 3) predictor = Math.floor((left + above) / 2)
          else if (filter === 4) predictor = paethPredictor(left, above, upperLeft)
          decoded[rowStart + index] = (decoded[rowStart + index] + predictor) & 0xff
        }
      }
      if (colorType === 3) {
        const fullBytes = Math.floor(pass.width / paletteIndicesPerByte)
        for (let index = 0; index < fullBytes; index += 1) {
          if (packedPaletteByteIsValid[decoded[rowStart + index]] !== 1) return false
        }
        const remainingIndices = pass.width % paletteIndicesPerByte
        if (remainingIndices > 0) {
          const packed = decoded[rowStart + fullBytes]
          for (let sample = 0; sample < remainingIndices; sample += 1) {
            const shift = 8 - (bitDepth * (sample + 1))
            if (((packed >>> shift) & paletteMask) >= paletteEntries) return false
          }
        }
      }
      previousRowStart = rowStart
      decodedOffset = rowStart + pass.rowBytes
    }
  }
  return decodedOffset === decoded.length ? decodedBytes : false
}

function collectTextWaivers(text, relativePath) {
  const found = []
  let body = ''
  let inWaiver = false
  let line = 1
  let markerIndex = 0
  let markerLine = 1
  let previousWasCarriageReturn = false
  for (const character of text) {
    const lineTerminator =
      character === '\r' || character === '\n' || character === '\u2028' || character === '\u2029'
    if (inWaiver) {
      if (character === ')') {
        found.push({ body, at: `${relativePath}:${markerLine}`, incomplete: false })
        body = ''
        inWaiver = false
      } else if (lineTerminator) {
        found.push({ body, at: `${relativePath}:${markerLine}`, incomplete: true })
        body = ''
        inWaiver = false
      } else {
        body += character
        if (body.length > MAX_WAIVER_BODY_CHARACTERS) {
          throw new Error(`waiver exceeds ${MAX_WAIVER_BODY_CHARACTERS} character limit:${relativePath}:${markerLine}`)
        }
      }
    } else if (character === WAIVER_MARKER[markerIndex]) {
      if (markerIndex === 0) markerLine = line
      markerIndex += 1
      if (markerIndex === WAIVER_MARKER.length) {
        markerIndex = 0
        inWaiver = true
      }
    } else {
      markerIndex = character === WAIVER_MARKER[0] ? 1 : 0
      if (markerIndex === 1) markerLine = line
    }
    if (lineTerminator) {
      if (!(character === '\n' && previousWasCarriageReturn)) line += 1
      markerIndex = 0
    }
    previousWasCarriageReturn = character === '\r'
  }
  if (inWaiver) found.push({ body, at: `${relativePath}:${markerLine}`, incomplete: true })
  return found
}

function namesSnapshot(
  absolute,
  relativeDirectory,
  transientFiles,
  observedTransientFiles,
  remainingEntries,
) {
  const rawNames = []
  const directory = fs.opendirSync(absolute)
  try {
    while (true) {
      const entry = directory.readSync()
      if (entry === null) break
      rawNames.push(entry.name)
      if (rawNames.length > remainingEntries) {
        throw new Error(`repository source exceeds ${MAX_SCANNED_ENTRIES} entry scan limit`)
      }
    }
  } finally {
    directory.closeSync()
  }
  rawNames.sort(compareUtf8Bytes)
  const normalizedNames = new Map()
  for (const name of rawNames) {
    const normalizedName = name.normalize('NFC')
    const previous = normalizedNames.get(normalizedName)
    if (previous !== undefined && previous !== name) {
      throw new Error(`Unicode-normalized path collision:${relativeDirectory || '.'}/${previous}|${name}`)
    }
    normalizedNames.set(normalizedName, name)
  }
  const names = []
  for (const name of rawNames) {
    const child = path.join(absolute, name)
    const relativePath = repositoryRelative(child)
    const expectedTransientIdentity = transientFiles.get(relativePath)
    if (expectedTransientIdentity) {
      const current = fs.lstatSync(child, { bigint: true })
      assertUniqueRegularFile(current, relativePath)
      if (!sameOwnershipIdentity(expectedTransientIdentity, ownershipIdentity(current))) {
        throw new Error(`owned transient path changed during scan:${relativePath}`)
      }
      observedTransientFiles.add(relativePath)
      continue
    }
    names.push(name)
  }
  return Object.freeze({
    names,
    rawCount: rawNames.length,
    sha256: sha256(Buffer.from(JSON.stringify(names), 'utf8')),
  })
}

function manifestIdentity(identity, { stable = true, directory = false } = {}) {
  const values = [
    identity.dev,
    identity.ino,
    identity.mode,
  ]
  if (!directory) values.push(identity.nlink)
  if (stable) values.push(identity.size, identity.mtimeNs, identity.ctimeNs)
  return values.map(value => value.toString())
}

function repositoryManifest(files, directories) {
  return Object.freeze({
    directories: directories.map(directory => [
      directory.relativeDirectory,
      // APFS changes a directory's nlink for regular child entries. Names are
      // bound separately; dev/ino/mode provide portable directory ownership.
      ...manifestIdentity(directory.identity, { stable: false, directory: true }),
      directory.namesSha256,
    ]),
    files: files.map(file => [
      file.relativePath,
      ...manifestIdentity(file.identity),
      file.sha256,
    ]),
  })
}

function firstManifestDifference(previous, current) {
  for (const section of ['directories', 'files']) {
    const limit = Math.max(previous[section].length, current[section].length)
    for (let index = 0; index < limit; index += 1) {
      if (JSON.stringify(previous[section][index]) !== JSON.stringify(current[section][index])) {
        const before = previous[section][index]?.[0] ?? '<missing>'
        const after = current[section][index]?.[0] ?? '<missing>'
        return `${section}[${index}]:${before} -> ${after}`
          + ` (${JSON.stringify(previous[section][index])} != ${JSON.stringify(current[section][index])})`
      }
    }
  }
  return 'digest-only mismatch'
}

function collectRepositoryWaivers({ transientFiles = new Map() } = {}) {
  const waivers = []
  const files = []
  const directories = []
  const observedTransientFiles = new Set()
  let totalBytes = 0n
  let totalPngDecodedBytes = 0n
  let entryCount = 1
  function walk(absolute) {
    const relativeDirectory = repositoryRelative(absolute)
    const before = fs.lstatSync(absolute, { bigint: true })
    if (before.isSymbolicLink() || !before.isDirectory()) {
      throw new Error(`scan path must be a real directory:${relativeDirectory || '.'}`)
    }
    if (fs.realpathSync(absolute) !== absolute) {
      throw new Error(`scan path crosses a symbolic link:${relativeDirectory || '.'}`)
    }
    const inventory = namesSnapshot(
      absolute,
      relativeDirectory,
      transientFiles,
      observedTransientFiles,
      MAX_SCANNED_ENTRIES - entryCount,
    )
    entryCount += inventory.rawCount
    if (entryCount > MAX_SCANNED_ENTRIES) {
      throw new Error(`repository source exceeds ${MAX_SCANNED_ENTRIES} entry scan limit`)
    }
    directories.push(Object.freeze({
      absolute,
      relativeDirectory,
      identity: stableIdentity(before),
      namesSha256: inventory.sha256,
    }))

    for (const name of inventory.names) {
      const child = path.join(absolute, name)
      const relativePath = repositoryRelative(child)
      // Installed dependencies are immutable lock/runtime inputs, not waiver authority.
      if (name === 'node_modules' || EXCLUDED_REPOSITORY_PATHS.has(relativePath)) continue
      const entry = fs.lstatSync(child, { bigint: true })
      // Tracked in-repo symlinks (git mode 120000, e.g. packages/design-system/scripts →
      // ../../scripts) are legitimate layout aliases; their target content is already
      // scanned once at its real path, so scanning through the link would only duplicate
      // or loop. Skip links instead of failing the whole waiver scan.
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        walk(child)
        continue
      }
      if (!entry.isFile()) throw new Error(`unsupported filesystem entry:${relativePath}`)
      if (entry.size > MAX_SCANNED_FILE_BYTES) {
        throw new Error(`source exceeds ${MAX_SCANNED_FILE_BYTES} byte per-file scan limit:${relativePath}`)
      }
      const remainingBytes = MAX_SCANNED_TOTAL_BYTES - totalBytes
      if (entry.size > remainingBytes) {
        throw new Error(`repository source exceeds ${MAX_SCANNED_TOTAL_BYTES} byte aggregate scan limit`)
      }
      const result = readStableRegularFile(child, relativePath, {
        maxBytes: remainingBytes < MAX_SCANNED_FILE_BYTES
          ? remainingBytes
          : MAX_SCANNED_FILE_BYTES,
      })
      totalBytes += result.snapshot.identity.size
      files.push(result.snapshot)
      const hasPngSignature = result.bytes.subarray(0, 8).equals(PNG_SIGNATURE)
      const isApprovedPng = path.extname(relativePath).toLowerCase() === '.png'
        && relativePath.startsWith(APPROVED_PNG_PREFIX)
      if (isApprovedPng) {
        const pngResult = isStructurallyValidPng(result.bytes, {
          remainingDecodedBytes: MAX_PNG_TOTAL_DECODED_BYTES - totalPngDecodedBytes,
        })
        if (pngResult === PNG_TOTAL_BUDGET_EXCEEDED) {
          throw new Error(
            `repository PNG decoded data exceeds ${MAX_PNG_TOTAL_DECODED_BYTES} byte aggregate limit:${relativePath}`,
          )
        }
        if (pngResult === false) throw new Error(`malformed PNG source:${relativePath}`)
        totalPngDecodedBytes += pngResult
      } else if (hasPngSignature) {
        throw new Error(`opaque PNG source is forbidden outside ${APPROVED_PNG_PREFIX}:${relativePath}`)
      } else {
        waivers.push(...collectTextWaivers(decodeText(result.bytes, relativePath), relativePath))
      }
    }
    const after = fs.lstatSync(absolute, { bigint: true })
    if (!sameStableIdentity(before, after)) {
      throw new Error(`scan directory changed during first traversal:${relativeDirectory || '.'}`)
    }
  }
  walk(ROOT)
  for (const relativePath of transientFiles.keys()) {
    if (!observedTransientFiles.has(relativePath)) {
      throw new Error(`owned transient path disappeared during scan:${relativePath}`)
    }
  }
  const manifest = repositoryManifest(files, directories)
  return Object.freeze({
    waivers,
    files,
    directories,
    totalBytes,
    entryCount,
    manifest,
    manifestSha256: sha256(Buffer.from(JSON.stringify(manifest), 'utf8')),
  })
}

function verifyRepositorySnapshot(snapshot, options = {}) {
  const current = collectRepositoryWaivers(options)
  if (snapshot.manifestSha256 !== current.manifestSha256) {
    throw new Error(
      `repository manifest changed between consecutive full snapshots:`
      + firstManifestDifference(snapshot.manifest, current.manifest),
    )
  }
  return current
}

function isIdentifier(node, text) {
  return ts.isIdentifier(node) && node.text === text
}

function isStringLiteral(node, text = null) {
  return ts.isStringLiteral(node) && (text === null || node.text === text)
}

function isExactPropertyObject(node, propertyName, initializerPredicate) {
  if (!ts.isObjectLiteralExpression(node) || node.properties.length !== 1) return false
  const [property] = node.properties
  return ts.isPropertyAssignment(property)
    && isIdentifier(property.name, propertyName)
    && initializerPredicate(property.initializer)
}

function isPlaywrightPlatformCommand(node) {
  if (!ts.isConditionalExpression(node)) return false
  const condition = node.condition
  return ts.isBinaryExpression(condition)
    && condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    && ts.isPropertyAccessExpression(condition.left)
    && isIdentifier(condition.left.expression, 'process')
    && isIdentifier(condition.left.name, 'platform')
    && isStringLiteral(condition.right, 'linux')
    && isStringLiteral(node.whenTrue)
    && isStringLiteral(node.whenFalse)
}

function isTemplateCwd(node) {
  return ts.isCallExpression(node)
    && isIdentifier(node.expression, 'join')
    && node.arguments.length === 2
    && isIdentifier(node.arguments[0], 'ROOT')
    && isStringLiteral(node.arguments[1], 'apps/template')
}

function assertSafeGateCall(call) {
  if (![2, 3].includes(call.arguments.length) || !ts.isStringLiteral(call.arguments[0])) {
    throw new Error('every top-level run() gate requires exactly 2 or 3 closed arguments and a string-literal label')
  }
  if (!validGateLabel(call.arguments[0].text)) {
    throw new Error('release preflight gate labels must be non-empty, bounded, and control-free')
  }
  const command = call.arguments[1]
  const safeCommand = ts.isStringLiteral(command)
    || isPlaywrightPlatformCommand(command)
    || isExactPropertyObject(
      command,
      'kind',
      initializer => isStringLiteral(initializer, 'storybook-smoke-shards'),
    )
  if (!safeCommand) {
    throw new Error(`release preflight gate command is outside the closed AST grammar:${call.arguments[0].text}`)
  }
  if (call.arguments.length === 3) {
    const options = call.arguments[2]
    const safeOptions = isExactPropertyObject(
      options,
      'authority',
      initializer => isStringLiteral(initializer, 'github-read'),
    ) || isExactPropertyObject(options, 'cwd', isTemplateCwd)
    if (!safeOptions) {
      throw new Error(`release preflight gate options are outside the closed AST grammar:${call.arguments[0].text}`)
    }
  }
}

function exactScaffoldIdentity(source, excludedRanges) {
  const ordered = [...excludedRanges].sort((left, right) => left.start - right.start)
  let offset = 0
  const parts = []
  for (const range of ordered) {
    if (
      !Number.isSafeInteger(range.start)
      || !Number.isSafeInteger(range.end)
      || range.start < offset
      || range.end < range.start
      || range.end > source.length
    ) {
      throw new Error('release preflight identity contains an invalid or overlapping source range')
    }
    parts.push(source.slice(offset, range.start))
    if (range.kind === 'gate') parts.push('\u0000RELEASE-PREFLIGHT-GATE\u0000')
    offset = range.end
  }
  parts.push(source.slice(offset))
  return sha256(Buffer.from(parts.join(''), 'utf8'))
}

function releasePreflightIdentity(bytes) {
  const source = decodeText(bytes, RELEASE_PREFLIGHT_RELATIVE)
  const sourceFile = ts.createSourceFile(
    RELEASE_PREFLIGHT_RELATIVE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  )
  if (sourceFile.parseDiagnostics.length > 0) {
    const first = sourceFile.parseDiagnostics[0]
    throw new Error(`release preflight parse failed:${ts.flattenDiagnosticMessageText(first.messageText, ' ')}`)
  }
  let runDeclarationCount = 0
  function assertRunIdentifierClosure(node) {
    if (isIdentifier(node, 'run')) {
      const parent = node.parent
      const isDeclaration = ts.isFunctionDeclaration(parent)
        && parent.name === node
        && parent.parent === sourceFile
      const isDirectGate = ts.isCallExpression(parent)
        && parent.expression === node
        && ts.isExpressionStatement(parent.parent)
        && parent.parent.parent === sourceFile
      if (isDeclaration) runDeclarationCount += 1
      else if (!isDirectGate) {
        throw new Error('the run identifier may only name the top-level runner or a direct top-level gate call')
      }
    }
    ts.forEachChild(node, assertRunIdentifierClosure)
  }
  assertRunIdentifierClosure(sourceFile)
  if (runDeclarationCount !== 1) {
    throw new Error('release preflight requires exactly one top-level run function declaration')
  }
  const markers = transitionMarkers(source, sourceFile)
  const gates = []
  const excludedRanges = markers.map(marker => ({
    start: marker.range.start,
    end: marker.range.end,
    kind: 'transition',
  }))
  for (const statement of sourceFile.statements) {
    const expression = ts.isExpressionStatement(statement) ? statement.expression : null
    const isGate = expression
      && ts.isCallExpression(expression)
      && ts.isIdentifier(expression.expression)
      && expression.expression.text === 'run'
    if (!isGate) {
      continue
    }
    assertSafeGateCall(expression)
    const label = expression.arguments[0].text
    const start = statement.getStart(sourceFile)
    const end = statement.end
    const semanticSha256 = sha256(Buffer.from(source.slice(start, end), 'utf8'))
    gates.push(Object.freeze({ label, semanticSha256 }))
    excludedRanges.push({ start, end, kind: 'gate' })
  }
  if (gates.length === 0) throw new Error('release preflight contains no executable top-level run() gates')
  if (new Set(gates.map(({ label }) => label)).size !== gates.length) {
    throw new Error('release preflight gate labels must be unique')
  }
  if (new Set(gates.map(({ semanticSha256 }) => semanticSha256)).size !== gates.length) {
    throw new Error('release preflight gate semantic identities must be unique')
  }
  const gateDigest = sha256(Buffer.from(JSON.stringify(gates), 'utf8'))
  const scaffoldSha256 = exactScaffoldIdentity(source, excludedRanges)
  return Object.freeze({
    source,
    markers,
    gates: Object.freeze(gates),
    gateDigest,
    scaffoldSha256,
  })
}

function behaviorDigest({ gateDigest, scaffoldSha256 }) {
  return sha256(Buffer.from(JSON.stringify({ gateDigest, scaffoldSha256 }), 'utf8'))
}

function exactKeys(value, keys) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
}

function exactKeyOrder(value, keys) {
  return exactKeys(value, keys)
    && JSON.stringify(Object.keys(value)) === JSON.stringify(keys)
}

function validCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function containsControlOrFormat(value) {
  return /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)
}

function validGateLabel(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 512
    && Buffer.byteLength(value, 'utf8') <= 1024
    && !containsControlOrFormat(value)
}

function assertNoDuplicateJsonKeys(sourceFile) {
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Set()
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) {
          throw new Error('baseline JSON object syntax is invalid')
        }
        if (seen.has(property.name.text)) {
          throw new Error(`baseline contains duplicate JSON key:${property.name.text}`)
        }
        seen.add(property.name.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function validTransitionEvidence(transition, revision, behavior) {
  if (revision === 1) return transition === null
  if (!exactKeyOrder(transition, [
    'fromRevision',
    'fromBehaviorDigest',
    'toBehaviorDigest',
    'auditRef',
    'reason',
  ])) return false
  return Number.isSafeInteger(transition.fromRevision)
    && transition.fromRevision === revision - 1
    && SHA256.test(transition.fromBehaviorDigest)
    && SHA256.test(transition.toBehaviorDigest)
    && transition.toBehaviorDigest === behavior
    && typeof transition.auditRef === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,127}$/.test(transition.auditRef)
    && typeof transition.reason === 'string'
    && transition.reason.length >= 1
    && transition.reason.length <= 512
    && transition.reason === transition.reason.trim()
    && !/[()]/.test(transition.reason)
    && !containsControlOrFormat(transition.reason)
}

function parseBaseline(bytes) {
  const text = decodeText(bytes, BASELINE_RELATIVE)
  const jsonSource = ts.parseJsonText(BASELINE_RELATIVE, text)
  if (jsonSource.parseDiagnostics.length > 0) {
    const first = jsonSource.parseDiagnostics[0]
    throw new Error(`baseline JSON parse failed:${ts.flattenDiagnosticMessageText(first.messageText, ' ')}`)
  }
  assertNoDuplicateJsonKeys(jsonSource)
  const document = JSON.parse(text)
  const canonicalBytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8')
  if (!bytes.equals(canonicalBytes)) {
    throw new Error('baseline JSON bytes are not canonical')
  }
  const keys = [
    'schemaVersion',
    'kind',
    'revision',
    'gateCount',
    'gateDigest',
    'scaffoldSha256',
    'behaviorDigest',
    'gates',
    'transition',
    'updated',
    'note',
  ]
  if (!exactKeyOrder(document, keys)) throw new Error('baseline has an invalid closed schema/key order')
  if (document.schemaVersion !== 4 || document.kind !== 'release-preflight-gate-ratchet') {
    throw new Error('baseline identity is invalid')
  }
  if (!Number.isSafeInteger(document.revision) || document.revision < 1) {
    throw new Error('baseline revision is invalid')
  }
  if (
    !Number.isInteger(document.gateCount)
    || document.gateCount < 1
    || !Array.isArray(document.gates)
    || document.gates.length !== document.gateCount
  ) throw new Error('baseline gateCount/gates are invalid')
  for (const gate of document.gates) {
    if (
      !exactKeyOrder(gate, ['label', 'semanticSha256'])
      || !validGateLabel(gate.label)
      || !SHA256.test(gate.semanticSha256)
    ) throw new Error('baseline gate identity is invalid')
  }
  if (
    new Set(document.gates.map(({ label }) => label)).size !== document.gates.length
    || new Set(document.gates.map(({ semanticSha256 }) => semanticSha256)).size !== document.gates.length
  ) throw new Error('baseline contains duplicate gate identities')
  const expectedGateDigest = sha256(Buffer.from(JSON.stringify(document.gates), 'utf8'))
  if (
    document.gateDigest !== expectedGateDigest
    || !SHA256.test(document.scaffoldSha256)
    || document.behaviorDigest !== behaviorDigest(document)
  ) {
    throw new Error('baseline aggregate/scaffold identity is invalid')
  }
  if (
    !validTransitionEvidence(document.transition, document.revision, document.behaviorDigest)
    || !validCalendarDate(document.updated)
    || document.note !== TRANSITION_NOTE
  ) {
    throw new Error('baseline review metadata is invalid')
  }
  return Object.freeze(document)
}

function ratchetErrors(current, baseline) {
  const findings = []
  if (
    current.gates.length !== baseline.gateCount
    || current.gateDigest !== baseline.gateDigest
    || JSON.stringify(current.gates) !== JSON.stringify(baseline.gates)
  ) {
    findings.push('R1: release-preflight ordered gate ledger changed — lineage-recorded baseline transition required')
  }
  if (current.scaffoldSha256 !== baseline.scaffoldSha256) {
    findings.push('R1: release-preflight non-gate scaffold changed — lineage-recorded baseline transition required')
  }
  return findings
}

function transitionEvidenceErrors(current, baseline) {
  if (baseline.revision === 1) {
    return current.markers.length === 0
      ? []
      : ['R1: revision-1 release-preflight must not contain a transition marker']
  }
  if (
    current.markers.length !== 1
    || JSON.stringify(transitionEvidence(current.markers[0])) !== JSON.stringify(baseline.transition)
  ) {
    return ['R1: release-preflight transition marker does not match persisted baseline lineage']
  }
  return []
}

function transitionMarkers(source, parsedSourceFile = null) {
  const sourceFile = parsedSourceFile ?? ts.createSourceFile(
    RELEASE_PREFLIGHT_RELATIVE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  )
  const headerEnd = sourceFile.statements[0]?.getStart(sourceFile) ?? source.length
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    source.slice(0, headerEnd),
  )
  const markers = []
  while (true) {
    const token = scanner.scan()
    if (token === ts.SyntaxKind.EndOfFileToken) break
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia) continue
    const comment = scanner.getTokenText()
    if (!comment.includes('@preflight-transition(')) continue
    const match = /^\/\/ @preflight-transition\(from-revision:([1-9]\d*) from:([0-9a-f]{64}) to:([0-9a-f]{64}) audit-ref:([A-Za-z0-9][A-Za-z0-9._:/#-]{0,127}) reason:([^()\r\n\u2028\u2029]{1,512})\)$/.exec(comment)
    if (!match) throw new Error('preflight transition marker has an invalid closed comment grammar')
    const revision = Number(match[1])
    const reason = match[5].trim()
    if (
      !Number.isSafeInteger(revision)
      || reason === ''
      || reason !== match[5]
      || containsControlOrFormat(reason)
    ) {
      throw new Error('preflight transition revision/reason must be safe, trimmed, non-empty, and control-free')
    }
    const tokenStart = scanner.getTokenPos()
    const tokenEnd = scanner.getTextPos()
    let lineStart = tokenStart
    while (
      lineStart > 0
      && !['\r', '\n', '\u2028', '\u2029'].includes(source[lineStart - 1])
    ) lineStart -= 1
    if (!/^[\t ]*$/.test(source.slice(lineStart, tokenStart))) {
      throw new Error('preflight transition marker must be the only content on its header line')
    }
    let lineEnd = tokenEnd
    if (source[lineEnd] === '\r' && source[lineEnd + 1] === '\n') lineEnd += 2
    else if (['\r', '\n', '\u2028', '\u2029'].includes(source[lineEnd])) lineEnd += 1
    markers.push(Object.freeze({
      revision,
      from: match[2],
      to: match[3],
      auditRef: match[4],
      reason,
      range: Object.freeze({ start: lineStart, end: lineEnd }),
    }))
  }
  return Object.freeze(markers)
}

function transitionEvidence(marker) {
  return marker === null
    ? null
    : {
        fromRevision: marker.revision,
        fromBehaviorDigest: marker.from,
        toBehaviorDigest: marker.to,
        auditRef: marker.auditRef,
        reason: marker.reason,
      }
}

function baselineDocument(current, previous = null, marker = null) {
  const revision = (previous?.revision ?? 0) + 1
  if (!Number.isSafeInteger(revision)) throw new Error('baseline revision cannot advance safely')
  return {
    schemaVersion: 4,
    kind: 'release-preflight-gate-ratchet',
    revision,
    gateCount: current.gates.length,
    gateDigest: current.gateDigest,
    scaffoldSha256: current.scaffoldSha256,
    behaviorDigest: behaviorDigest(current),
    gates: current.gates,
    transition: transitionEvidence(marker),
    updated: new Date().toISOString().slice(0, 10),
    note: TRANSITION_NOTE,
  }
}

function assertBaselineStillCurrent(previous) {
  if (previous === null) {
    if (lstatOrNull(BASELINE) !== null) throw new Error('baseline appeared during update')
    return
  }
  verifyFileSnapshot(previous.snapshot)
}

function assertParentDirectoryOwned(directory, descriptor, expected) {
  const descriptorInfo = fs.fstatSync(descriptor, { bigint: true })
  const pathInfo = fs.lstatSync(directory, { bigint: true })
  if (
    !descriptorInfo.isDirectory()
    || pathInfo.isSymbolicLink()
    || !pathInfo.isDirectory()
    || !sameDirectoryOwnershipIdentity(expected, directoryOwnershipIdentity(descriptorInfo))
    || !sameDirectoryOwnershipIdentity(expected, directoryOwnershipIdentity(pathInfo))
    || fs.realpathSync(directory) !== directory
  ) {
    throw new Error('baseline parent directory ownership changed')
  }
}

function assertOwnedOpenFile(absolute, descriptor, expected, label) {
  const descriptorInfo = fs.fstatSync(descriptor, { bigint: true })
  const pathInfo = fs.lstatSync(absolute, { bigint: true })
  assertUniqueRegularFile(descriptorInfo, label)
  assertUniqueRegularFile(pathInfo, label)
  if (
    !sameStableIdentity(expected, descriptorInfo)
    || !sameStableIdentity(expected, pathInfo)
    || fs.realpathSync(absolute) !== absolute
  ) {
    throw new Error(`${label} ownership/content changed`)
  }
}

function readOpenDescriptor(descriptor, expectedBytes, label) {
  const before = fs.fstatSync(descriptor, { bigint: true })
  if (before.size !== BigInt(expectedBytes.length)) {
    throw new Error(`${label} descriptor size mismatch`)
  }
  const bytes = Buffer.alloc(expectedBytes.length)
  let offset = 0
  while (offset < bytes.length) {
    const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset)
    if (count === 0) break
    offset += count
  }
  const eofProbe = Buffer.alloc(1)
  const bytesBeyondExpected = fs.readSync(descriptor, eofProbe, 0, 1, expectedBytes.length)
  const after = fs.fstatSync(descriptor, { bigint: true })
  if (
    offset !== expectedBytes.length
    || bytesBeyondExpected !== 0
    || !bytes.equals(expectedBytes)
    || !sameStableIdentity(before, after)
  ) {
    throw new Error(`${label} descriptor readback mismatch`)
  }
}

function unlinkOwnedPath(
  absolute,
  expected,
  label,
  parentDescriptor,
  directory,
  parentOwnership,
  { required = true } = {},
) {
  const current = lstatOrNull(absolute)
  if (current === null) {
    if (required) throw new Error(`${label} disappeared before owned cleanup`)
    return false
  }
  if (!sameOwnershipIdentity(expected, ownershipIdentity(current))) {
    throw new Error(`${label} was replaced; foreign path preserved`)
  }
  assertParentDirectoryOwned(directory, parentDescriptor, parentOwnership)
  fs.unlinkSync(absolute)
  fs.fsyncSync(parentDescriptor)
  return true
}

function writeBaselineAtomically(bytes, previous, preflightSnapshot, repositorySnapshot) {
  const directory = path.dirname(BASELINE)
  const directoryInfo = fs.lstatSync(directory, { bigint: true })
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory() || fs.realpathSync(directory) !== directory) {
    throw new Error('baseline parent must be a real directory')
  }
  const lock = `${BASELINE}.lock`
  const temporary = `${BASELINE}.${process.pid}.${randomUUID()}.tmp`
  const lockRelative = repositoryRelative(lock)
  const temporaryRelative = repositoryRelative(temporary)
  let parentDescriptor = null
  let lockDescriptor = null
  let temporaryDescriptor = null
  let parentOwnership = null
  let lockCleanupOwnership = null
  let lockIdentity = null
  let temporaryCleanupOwnership = null
  let temporaryIdentity = null
  let temporaryPublished = false
  let initialBaselineLinked = false
  let operationError = null
  const cleanupErrors = []
  try {
    parentDescriptor = fs.openSync(directory, fs.constants.O_RDONLY | NO_FOLLOW)
    parentOwnership = directoryOwnershipIdentity(fs.fstatSync(parentDescriptor, { bigint: true }))
    assertParentDirectoryOwned(directory, parentDescriptor, parentOwnership)

    lockDescriptor = fs.openSync(
      lock,
      fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | NO_FOLLOW,
      0o600,
    )
    const openedLock = fs.fstatSync(lockDescriptor, { bigint: true })
    assertUniqueRegularFile(openedLock, 'baseline update lock')
    lockCleanupOwnership = ownershipIdentity(openedLock)
    fs.writeFileSync(lockDescriptor, `${process.pid}\n`)
    fs.fsyncSync(lockDescriptor)
    lockIdentity = stableIdentity(fs.fstatSync(lockDescriptor, { bigint: true }))
    assertOwnedOpenFile(lock, lockDescriptor, lockIdentity, 'baseline update lock')

    const lockTransient = new Map([[lockRelative, ownershipIdentity(lockIdentity)]])
    verifyFileSnapshot(preflightSnapshot)
    assertBaselineStillCurrent(previous)
    verifyRepositorySnapshot(repositorySnapshot, { transientFiles: lockTransient })

    temporaryDescriptor = fs.openSync(
      temporary,
      fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | NO_FOLLOW,
      0o644,
    )
    const openedTemporary = fs.fstatSync(temporaryDescriptor, { bigint: true })
    assertUniqueRegularFile(openedTemporary, 'baseline update temporary')
    temporaryCleanupOwnership = ownershipIdentity(openedTemporary)
    fs.writeFileSync(temporaryDescriptor, bytes)
    fs.fsyncSync(temporaryDescriptor)
    temporaryIdentity = stableIdentity(fs.fstatSync(temporaryDescriptor, { bigint: true }))
    assertOwnedOpenFile(temporary, temporaryDescriptor, temporaryIdentity, 'baseline update temporary')
    readOpenDescriptor(temporaryDescriptor, bytes, 'baseline update temporary')

    const ownedTransients = new Map([
      [lockRelative, ownershipIdentity(lockIdentity)],
      [temporaryRelative, ownershipIdentity(temporaryIdentity)],
    ])
    assertParentDirectoryOwned(directory, parentDescriptor, parentOwnership)
    assertOwnedOpenFile(lock, lockDescriptor, lockIdentity, 'baseline update lock')
    assertOwnedOpenFile(temporary, temporaryDescriptor, temporaryIdentity, 'baseline update temporary')
    verifyRepositorySnapshot(repositorySnapshot, { transientFiles: ownedTransients })
    verifyFileSnapshot(preflightSnapshot)
    assertBaselineStillCurrent(previous)
    assertParentDirectoryOwned(directory, parentDescriptor, parentOwnership)
    assertOwnedOpenFile(lock, lockDescriptor, lockIdentity, 'baseline update lock')
    assertOwnedOpenFile(temporary, temporaryDescriptor, temporaryIdentity, 'baseline update temporary')
    readOpenDescriptor(temporaryDescriptor, bytes, 'baseline update temporary')

    // All cooperative governance writers must honor this lock. Consecutive
    // whole-repository snapshots close ordinary late-writer windows, but Node's
    // portable filesystem API cannot provide a hostile-writer snapshot/CAS for
    // replacement of an existing pathname.
    if (previous === null) {
      fs.linkSync(temporary, BASELINE)
      initialBaselineLinked = true
      const linkedDescriptor = fs.fstatSync(temporaryDescriptor, { bigint: true })
      const linkedTemporary = fs.lstatSync(temporary, { bigint: true })
      const linkedBaseline = fs.lstatSync(BASELINE, { bigint: true })
      if (
        linkedDescriptor.nlink !== 2n
        || !sameOwnershipIdentity(ownershipIdentity(linkedDescriptor), ownershipIdentity(linkedTemporary))
        || !sameOwnershipIdentity(ownershipIdentity(linkedDescriptor), ownershipIdentity(linkedBaseline))
      ) {
        throw new Error('new baseline no-replace publication identity mismatch')
      }
      fs.unlinkSync(temporary)
      temporaryPublished = true
      initialBaselineLinked = false
    } else {
      fs.renameSync(temporary, BASELINE)
      temporaryPublished = true
    }
    const publishedDescriptor = fs.fstatSync(temporaryDescriptor, { bigint: true })
    const publishedPath = fs.lstatSync(BASELINE, { bigint: true })
    assertUniqueRegularFile(publishedDescriptor, BASELINE_RELATIVE)
    assertUniqueRegularFile(publishedPath, BASELINE_RELATIVE)
    if (!sameOwnershipIdentity(ownershipIdentity(publishedDescriptor), ownershipIdentity(publishedPath))) {
      throw new Error('published baseline no longer maps to the temporary descriptor')
    }
    fs.fsyncSync(parentDescriptor)
    const readback = readStableRegularFile(BASELINE, BASELINE_RELATIVE)
    const finalDescriptor = fs.fstatSync(temporaryDescriptor, { bigint: true })
    if (
      !readback.bytes.equals(bytes)
      || !sameOwnershipIdentity(ownershipIdentity(finalDescriptor), ownershipIdentity(readback.snapshot.identity))
    ) {
      throw new Error('baseline atomic identity/byte readback mismatch')
    }
    assertParentDirectoryOwned(directory, parentDescriptor, parentOwnership)
    assertOwnedOpenFile(lock, lockDescriptor, lockIdentity, 'baseline update lock')
  } catch (error) {
    operationError = error
  } finally {
    if (temporaryDescriptor !== null) {
      if (initialBaselineLinked) {
        try {
          const descriptorInfo = fs.fstatSync(temporaryDescriptor, { bigint: true })
          const baselineInfo = fs.lstatSync(BASELINE, { bigint: true })
          if (!sameOwnershipIdentity(
            ownershipIdentity(descriptorInfo),
            ownershipIdentity(baselineInfo),
          )) {
            throw new Error('partial new baseline was replaced; foreign target preserved')
          }
          assertParentDirectoryOwned(directory, parentDescriptor, parentOwnership)
          fs.unlinkSync(BASELINE)
          fs.fsyncSync(parentDescriptor)
          initialBaselineLinked = false
          temporaryIdentity = stableIdentity(fs.fstatSync(temporaryDescriptor, { bigint: true }))
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
      if (!temporaryPublished && temporaryCleanupOwnership) {
        try {
          unlinkOwnedPath(
            temporary,
            temporaryCleanupOwnership,
            'baseline update temporary',
            parentDescriptor,
            directory,
            parentOwnership,
          )
        } catch (error) {
          cleanupErrors.push(error)
        }
      } else if (temporaryPublished && lstatOrNull(temporary) !== null) {
        cleanupErrors.push(new Error('foreign replacement at published temporary path was preserved'))
      }
      try {
        fs.closeSync(temporaryDescriptor)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (lockDescriptor !== null) {
      if (lockCleanupOwnership) {
        try {
          unlinkOwnedPath(
            lock,
            lockCleanupOwnership,
            'baseline update lock',
            parentDescriptor,
            directory,
            parentOwnership,
          )
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
      try {
        fs.closeSync(lockDescriptor)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (parentDescriptor !== null) {
      try {
        fs.closeSync(parentDescriptor)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
  }
  if (operationError && cleanupErrors.length > 0) {
    throw new AggregateError([operationError, ...cleanupErrors], operationError.message)
  }
  if (operationError) throw operationError
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'baseline update cleanup failed closed')
  }
}

let preflightRead
let currentPreflight
let previousBaseline = null
try {
  preflightRead = readStableRegularFile(RELEASE_PREFLIGHT, RELEASE_PREFLIGHT_RELATIVE)
  currentPreflight = releasePreflightIdentity(preflightRead.bytes)
} catch (error) {
  errors.push(`R1: release-preflight read/parse failed:${String(error.message).split('\n')[0]}`)
}

if (lstatOrNull(BASELINE) !== null) {
  try {
    previousBaseline = readStableRegularFile(BASELINE, BASELINE_RELATIVE)
    previousBaseline = Object.freeze({
      ...previousBaseline,
      document: parseBaseline(previousBaseline.bytes),
    })
  } catch (error) {
    errors.push(`R1: baseline read/parse failed:${String(error.message).split('\n')[0]}`)
  }
} else {
  errors.push(
    `R1: canonical baseline does not exist and runtime initialization is forbidden:${BASELINE_RELATIVE}`,
  )
}

if (ARGUMENTS.check && currentPreflight && previousBaseline?.document) {
  errors.push(...ratchetErrors(currentPreflight, previousBaseline.document))
  errors.push(...transitionEvidenceErrors(currentPreflight, previousBaseline.document))
}

let repositorySnapshot = null
let waivers = []
try {
  repositorySnapshot = collectRepositoryWaivers()
  waivers = repositorySnapshot.waivers
} catch (error) {
  errors.push(`R2: waiver scan failed:${String(error.message).split('\n')[0]}`)
}

const today = new Date().toISOString().slice(0, 10)
for (const waiver of waivers) {
  const fields = /^owner:([^\s()]+)\s+expiry:(\d{4}-\d{2}-\d{2})\s+reason:(\S(?:.*\S)?)$/.exec(waiver.body)
  const expiry = fields?.[2]
  if (waiver.incomplete || !fields || !validCalendarDate(expiry)) {
    errors.push(`R2: waiver format invalid (exact owner/expiry/reason and calendar date required):${waiver.at}`)
  } else if (expiry < today) {
    errors.push(`R2: waiver expired(${expiry}):${waiver.at}`)
  }
}

try {
  if (preflightRead) verifyFileSnapshot(preflightRead.snapshot)
  if (previousBaseline) verifyFileSnapshot(previousBaseline.snapshot)
  if (repositorySnapshot) repositorySnapshot = verifyRepositorySnapshot(repositorySnapshot)
} catch (error) {
  errors.push(`stable readback failed:${String(error.message).split('\n')[0]}`)
}

if (errors.length > 0) {
  console.error('❌ governance-tamper gate FAIL:')
  for (const error of errors) console.error(`   - ${error}`)
  process.exit(1)
}

if (ARGUMENTS.update) {
  if (!currentPreflight) throw new Error('release-preflight identity is unavailable')
  let acceptedMarker = null
  if (previousBaseline?.document) {
    const from = previousBaseline.document.behaviorDigest
    const to = behaviorDigest(currentPreflight)
    if (from === to) {
      console.error('❌ baseline already matches release-preflight behavior; update is unnecessary')
      process.exit(1)
    }
    const markers = currentPreflight.markers
    const matches = markers.filter(marker =>
      marker.revision === previousBaseline.document.revision
      && marker.from === from
      && marker.to === to)
    if (markers.length !== 1 || matches.length !== 1) {
      console.error('❌ baseline update requires exactly one transition-bound header comment:')
      console.error(
        `   // @preflight-transition(from-revision:${previousBaseline.document.revision}`
        + ` from:${from} to:${to} audit-ref:change-123 reason:reviewed-transition)`,
      )
      process.exit(1)
    }
    acceptedMarker = matches[0]
  }
  const document = baselineDocument(
    currentPreflight,
    previousBaseline?.document ?? null,
    acceptedMarker,
  )
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8')
  parseBaseline(bytes)
  writeBaselineAtomically(
    bytes,
    previousBaseline,
    preflightRead.snapshot,
    repositorySnapshot,
  )
  console.log(`✅ baseline updated atomically:${currentPreflight.gates.length} exact-source gate identities`)
  process.exit(0)
}

console.log(
  `✅ governance-tamper gate PASS(preflight ${currentPreflight.gates.length} exact-source gates;`
  + ` scaffold ${currentPreflight.scaffoldSha256.slice(0, 12)};`
  + ` time-boxed waivers ${waivers.length} all valid; consecutive full-manifest readback)`,
)
