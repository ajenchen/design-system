#!/usr/bin/env node
// Focused shape tests for verifiedProvenanceStatement against the REAL npm 11.19
// `audit signatures --json` output ({invalid, missing} only — no verified array)
// plus the canonical-registry attestation readback route. This is the exact
// surface whose untested hypothesized shape blocked every consumer sync-all
// upgrade at GOV-SUPPLY-002 (2026-08-05, WM beta.110 hop).
import assert from 'node:assert/strict'
import test from 'node:test'
import { verifiedProvenanceStatement, PROVENANCE_TYPE } from './verify-upgrade-provenance.mjs'

const expected = { name: '@qijenchen/design-system', version: '0.1.0-beta.110' }
const provenancePayload = Buffer.from(JSON.stringify({
  _type: 'https://in-toto.io/Statement/v1',
  predicateType: PROVENANCE_TYPE,
  subject: [{ name: 'pkg:npm/%40qijenchen/design-system@0.1.0-beta.110' }],
  predicate: {},
})).toString('base64')
const publishPayload = Buffer.from(JSON.stringify({
  _type: 'https://in-toto.io/Statement/v1',
  predicateType: 'https://github.com/npm/attestation/tree/main/specs/publish/v0.1',
  subject: [{ name: 'pkg:npm/%40qijenchen/design-system@0.1.0-beta.110' }],
  predicate: {},
})).toString('base64')
const readback = (attestations) => ({ registry: 'https://registry.npmjs.org/', attestations })
const bundles = [
  { predicateType: 'https://github.com/npm/attestation/tree/main/specs/publish/v0.1', bundle: { dsseEnvelope: { payload: publishPayload, payloadType: 'application/vnd.in-toto+json', signatures: [{ sig: 'x' }] }, verificationMaterial: { x509CertificateChain: {} } } },
  { predicateType: PROVENANCE_TYPE, bundle: { dsseEnvelope: { payload: provenancePayload, payloadType: 'application/vnd.in-toto+json', signatures: [{ sig: 'x' }] }, verificationMaterial: { x509CertificateChain: {} } } },
]
const cleanAudit = { invalid: [], missing: [] }

test('real npm 11.19 signature-audit shape plus registry attestation readback yields exactly one SLSA statement', () => {
  const statement = verifiedProvenanceStatement(cleanAudit, expected, readback(bundles))
  assert.equal(statement.predicateType, PROVENANCE_TYPE)
  assert.equal(statement.subject[0].name, 'pkg:npm/%40qijenchen/design-system@0.1.0-beta.110')
})

test('failure sets, foreign registry, empty and duplicated attestations all fail closed', () => {
  assert.throws(
    () => verifiedProvenanceStatement({ invalid: [{}], missing: [] }, expected, readback(bundles)),
    /invalid or missing registry evidence/,
  )
  assert.throws(
    () => verifiedProvenanceStatement({ invalid: [], missing: [{}] }, expected, readback(bundles)),
    /invalid or missing registry evidence/,
  )
  assert.throws(
    () => verifiedProvenanceStatement({}, expected, readback(bundles)),
    /invalid closed result shape/,
  )
  assert.throws(
    () => verifiedProvenanceStatement(cleanAudit, expected, { registry: 'https://example.com/', attestations: bundles }),
    /non-canonical registry/,
  )
  assert.throws(
    () => verifiedProvenanceStatement(cleanAudit, expected, readback([])),
    /no attestation bundles/,
  )
  assert.throws(
    () => verifiedProvenanceStatement(cleanAudit, expected, readback(undefined)),
    /no attestation bundles/,
  )
  const secondProvenance = Buffer.from(JSON.stringify({
    _type: 'https://in-toto.io/Statement/v1',
    predicateType: PROVENANCE_TYPE,
    subject: [{ name: 'pkg:npm/%40qijenchen/design-system@0.1.0-beta.111' }],
    predicate: {},
  })).toString('base64')
  assert.throws(
    () => verifiedProvenanceStatement(cleanAudit, expected, readback([...bundles, { predicateType: PROVENANCE_TYPE, bundle: { dsseEnvelope: { payload: secondProvenance, payloadType: 'application/vnd.in-toto+json', signatures: [{ sig: 'y' }] }, verificationMaterial: { x509CertificateChain: {} } } }])),
    /exactly one verified SLSA provenance statement/,
  )
  assert.throws(
    () => verifiedProvenanceStatement(cleanAudit, expected, readback([bundles[0]])),
    /exactly one verified SLSA provenance statement/,
  )
})
