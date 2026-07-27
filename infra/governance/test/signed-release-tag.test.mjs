import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertVerifiedReleaseTag,
  resolveVerifiedReleaseTag,
  validateVerifiedReleaseTagSnapshot,
} from '../lib/signed-release-tag.mjs'

const repository = 'acme/design-system'
const tag = 'v1.2.3-beta.4'
const tagObjectSha = 'a'.repeat(40)
const commit = 'b'.repeat(40)
const reference = { ref: `refs/tags/${tag}`, object: { type: 'tag', sha: tagObjectSha } }
const tagObject = {
  sha: tagObjectSha,
  tag,
  object: { type: 'commit', sha: commit },
  verification: {
    verified: true,
    reason: 'valid',
    signature: '-----BEGIN PGP SIGNATURE-----fixture',
    payload: `object ${commit}\ntype commit\ntag ${tag}`,
    verified_at: '2026-07-20T00:00:00Z',
  },
}

test('binds exact ref, annotated tag object, name, direct commit, and GitHub verification', async () => {
  const paths = []
  const identity = await resolveVerifiedReleaseTag({
    repository,
    tag,
    requestJson: async path => {
      paths.push(path)
      if (path.includes('/git/ref/tags/')) return structuredClone(reference)
      if (path.endsWith(tagObjectSha)) return structuredClone(tagObject)
      throw new Error(`unexpected path: ${path}`)
    },
  })
  assert.deepEqual(paths, [
    `/repos/${repository}/git/ref/tags/${tag}`,
    `/repos/${repository}/git/tags/${tagObjectSha}`,
    `/repos/${repository}/git/ref/tags/${tag}`,
  ])
  assert.deepEqual(identity, {
    ref: `refs/tags/${tag}`,
    tag,
    tagObject: tagObjectSha,
    commit,
    verification: { verified: true, reason: 'valid', verifiedAt: '2026-07-20T00:00:00Z' },
  })
  assert.equal(assertVerifiedReleaseTag({ identity, expectedCommit: commit, expectedTagObject: tagObjectSha }), identity)
})

for (const [label, referenceValue, tagObjectValue, pattern] of [
  ['lightweight tag', { ...reference, object: { type: 'commit', sha: commit } }, tagObject, /annotated tag object/],
  ['wrong exact ref', { ...reference, ref: 'refs/tags/v9.9.9' }, tagObject, /wrong tag ref/],
  ['wrong tag object', reference, { ...tagObject, sha: 'c'.repeat(40) }, /does not match the exact ref object/],
  ['wrong tag name', reference, { ...tagObject, tag: 'v9.9.9' }, /tag name mismatch/],
  ['nested tag target', reference, { ...tagObject, object: { type: 'tag', sha: commit } }, /directly target a commit/],
  ['unsigned tag', reference, { ...tagObject, verification: { verified: false, reason: 'unsigned', signature: null, payload: null, verified_at: null } }, /did not verify.*unsigned/],
  ['bad signature', reference, { ...tagObject, verification: { ...tagObject.verification, verified: false, reason: 'invalid' } }, /did not verify.*invalid/],
  ['unknown key', reference, { ...tagObject, verification: { ...tagObject.verification, verified: false, reason: 'unknown_key' } }, /did not verify.*unknown_key/],
  ['missing signed payload', reference, { ...tagObject, verification: { ...tagObject.verification, payload: null } }, /missing the signed payload/],
]) {
  test(`rejects ${label}`, () => {
    assert.throws(() => validateVerifiedReleaseTagSnapshot({
      repository,
      tag,
      reference: structuredClone(referenceValue),
      tagObject: structuredClone(tagObjectValue),
    }), pattern)
  })
}

test('rejects either a moved commit or a substituted signed tag object', () => {
  const identity = validateVerifiedReleaseTagSnapshot({ repository, tag, reference, tagObject })
  assert.throws(
    () => assertVerifiedReleaseTag({ identity, expectedCommit: 'd'.repeat(40), expectedTagObject: tagObjectSha }),
    /remote tag moved/,
  )
  assert.throws(
    () => assertVerifiedReleaseTag({ identity, expectedCommit: commit, expectedTagObject: 'e'.repeat(40) }),
    /annotated tag object changed/,
  )
})

test('rejects a tag ref that changes during the two-read verification window', async () => {
  let refReads = 0
  await assert.rejects(resolveVerifiedReleaseTag({
    repository,
    tag,
    requestJson: async path => {
      if (path.includes('/git/ref/tags/')) {
        refReads += 1
        return refReads === 1
          ? structuredClone(reference)
          : { ...structuredClone(reference), object: { type: 'tag', sha: 'f'.repeat(40) } }
      }
      return structuredClone(tagObject)
    },
  }), /changed while.*verified/)
})
