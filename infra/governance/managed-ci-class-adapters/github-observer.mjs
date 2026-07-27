#!/usr/bin/env node
import { verifyClassReadback } from './lib/verify-class-readback.mjs'
try { verifyClassReadback('github-observer', 'canonical-readonly-github-observation-v1') } catch (error) { console.error(error.message); process.exitCode = 1 }
