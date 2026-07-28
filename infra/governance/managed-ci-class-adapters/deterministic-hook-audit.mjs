#!/usr/bin/env node
import { verifyClassReadback } from './lib/verify-class-readback.mjs'
try { verifyClassReadback('deterministic-hook-audit', 'deterministic-and-hook-full-coverage-v1') } catch (error) { console.error(error.message); process.exitCode = 1 }
