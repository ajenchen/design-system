#!/usr/bin/env node
import assert from 'node:assert/strict'
import { posix, win32 } from 'node:path'
import { isContainedPath } from './lib/canonical-path-containment.mjs'

for (const [pathApi, root, child, sibling, absoluteEscape] of [
  [posix, '/repo/hooks', '/repo/hooks/check.sh', '/repo/hooks-evil/check.sh', '/etc/passwd'],
  [win32, 'C:\\repo\\hooks', 'C:\\repo\\hooks\\check.cmd', 'C:\\repo\\hooks-evil\\check.cmd', 'D:\\escape\\check.cmd'],
]) {
  assert.equal(isContainedPath(root, child, { pathApi }), true)
  assert.equal(isContainedPath(root, root, { pathApi }), false)
  assert.equal(isContainedPath(root, root, { pathApi, allowRoot: true }), true)
  assert.equal(isContainedPath(root, sibling, { pathApi }), false)
  assert.equal(isContainedPath(root, absoluteEscape, { pathApi }), false)
  assert.equal(isContainedPath(root, pathApi.resolve(root, '..', 'escape'), { pathApi }), false)
}

console.log('✓ canonical path containment accepts real descendants and rejects root/sibling/drive escapes under POSIX and Windows semantics')
