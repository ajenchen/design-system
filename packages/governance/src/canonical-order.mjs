import { Buffer } from 'node:buffer'

// Zero-I/O ordering primitive shared by authority, package, generated adapter, fork, and
// product-template runtimes. Canonical artifacts preserve code points exactly and compare
// their UTF-8 bytes; host locale collation and implicit Unicode normalization are forbidden.
export function compareUtf8Bytes(left, right) {
  return Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'))
}
