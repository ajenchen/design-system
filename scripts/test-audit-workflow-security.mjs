#!/usr/bin/env node
// Canonical meta-test discovery entrypoint for audit-workflow-security.mjs.
// The complete mutation matrix remains owned by test-workflow-security.mjs;
// importing it here makes the gate visible to the generic test-<gate> harness
// without duplicating either fixtures or assertions.
import './test-workflow-security.mjs'
