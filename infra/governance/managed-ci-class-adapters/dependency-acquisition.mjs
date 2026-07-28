#!/usr/bin/env node
import { verifyClassReadback } from './lib/verify-class-readback.mjs'
try { verifyClassReadback('dependency-acquisition', 'fresh-npm-ci-content-addressed-bundle-v1') } catch (error) { console.error(error.message); process.exitCode = 1 }
