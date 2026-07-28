import { invariant } from './common.mjs'

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const RELEASE_TAG = /^v\d+\.\d+\.\d+(?:-(?:beta|next|rc)\.\d+)?$/
const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/

function verifiedAt(value) {
  invariant(typeof value === 'string', 'GitHub tag verification timestamp is missing')
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value), 'GitHub tag verification timestamp is invalid')
  return value
}

function objectId(value, label) {
  invariant(OBJECT_ID.test(value || ''), `${label} is not a full Git object ID`)
  return value
}

export function validateVerifiedReleaseTagSnapshot({ repository, tag, reference, tagObject }) {
  invariant(REPOSITORY.test(repository || ''), `invalid repository: ${repository}`)
  invariant(RELEASE_TAG.test(tag || ''), `invalid release tag: ${tag}`)
  const ref = `refs/tags/${tag}`
  invariant(reference && typeof reference === 'object' && !Array.isArray(reference), 'GitHub tag ref response is invalid')
  invariant(reference.ref === ref, `GitHub returned the wrong tag ref: ${reference.ref || '<missing>'}`)
  invariant(reference.object?.type === 'tag', 'release ref must point to an annotated tag object; lightweight tags are forbidden')
  const tagObjectSha = objectId(reference.object.sha, 'GitHub tag ref object')

  invariant(tagObject && typeof tagObject === 'object' && !Array.isArray(tagObject), 'GitHub annotated tag response is invalid')
  invariant(tagObject.sha === tagObjectSha, 'GitHub annotated tag object does not match the exact ref object')
  invariant(tagObject.tag === tag, `GitHub annotated tag name mismatch: ${tagObject.tag || '<missing>'}`)
  invariant(tagObject.object?.type === 'commit', `release tag must directly target a commit, got ${tagObject.object?.type || '<missing>'}`)
  const commit = objectId(tagObject.object.sha, 'GitHub annotated tag target commit')
  const verification = tagObject.verification
  invariant(verification && typeof verification === 'object' && !Array.isArray(verification), 'GitHub annotated tag signature verification is missing')
  invariant(verification.verified === true, `GitHub did not verify the annotated tag signature: ${verification.reason || 'unknown'}`)
  invariant(verification.reason === 'valid', `GitHub annotated tag signature reason is not valid: ${verification.reason || 'unknown'}`)
  invariant(typeof verification.signature === 'string' && verification.signature.length > 0, 'GitHub verified tag response is missing the signature')
  invariant(typeof verification.payload === 'string' && verification.payload.length > 0, 'GitHub verified tag response is missing the signed payload')

  return {
    ref,
    tag,
    tagObject: tagObjectSha,
    commit,
    verification: {
      verified: true,
      reason: 'valid',
      verifiedAt: verifiedAt(verification.verified_at),
    },
  }
}

export async function resolveVerifiedReleaseTag({ repository, tag, requestJson }) {
  invariant(typeof requestJson === 'function', 'GitHub tag request function is required')
  invariant(REPOSITORY.test(repository || ''), `invalid repository: ${repository}`)
  invariant(RELEASE_TAG.test(tag || ''), `invalid release tag: ${tag}`)
  const encodedTag = tag.split('/').map(encodeURIComponent).join('/')
  const reference = await requestJson(`/repos/${repository}/git/ref/tags/${encodedTag}`)
  invariant(reference?.object?.type === 'tag', 'release ref must point to an annotated tag object; lightweight tags are forbidden')
  const tagObjectSha = objectId(reference.object.sha, 'GitHub tag ref object')
  const tagObject = await requestJson(`/repos/${repository}/git/tags/${tagObjectSha}`)
  const confirmedReference = await requestJson(`/repos/${repository}/git/ref/tags/${encodedTag}`)
  invariant(confirmedReference?.ref === reference.ref
    && confirmedReference?.object?.type === 'tag'
    && confirmedReference.object.sha === tagObjectSha,
  'release tag ref changed while its annotated signature was being verified')
  return validateVerifiedReleaseTagSnapshot({ repository, tag, reference: confirmedReference, tagObject })
}

export function assertVerifiedReleaseTag({ identity, expectedCommit, expectedTagObject = null }) {
  invariant(identity && typeof identity === 'object' && !Array.isArray(identity), 'verified release tag identity is required')
  objectId(identity.commit, 'verified release tag commit')
  objectId(expectedCommit, 'expected release commit')
  invariant(identity.commit === expectedCommit, `remote tag moved: ${identity.tag} targets ${identity.commit}, expected ${expectedCommit}`)
  if (expectedTagObject !== null) {
    objectId(identity.tagObject, 'verified release tag object')
    objectId(expectedTagObject, 'expected release tag object')
    invariant(identity.tagObject === expectedTagObject, `remote annotated tag object changed: ${identity.tag} is ${identity.tagObject}, expected ${expectedTagObject}`)
  }
  invariant(identity.verification?.verified === true && identity.verification?.reason === 'valid', 'release tag identity is not backed by a GitHub-verified signature')
  return identity
}
