// Authority-side compatibility adapter. The implementation SSOT is shipped by
// @qijenchen/governance; consumer projections materialize that implementation
// byte-for-byte at this path so the same callers work outside this monorepo.
export * from '../../packages/governance/src/closed-tool-execution.mjs'
