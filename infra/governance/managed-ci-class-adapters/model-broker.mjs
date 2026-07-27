#!/usr/bin/env node
import { verifyClassReadback } from './lib/verify-class-readback.mjs'
try { verifyClassReadback('model-broker', 'content-only-signed-shard-model-exchange-v1') } catch (error) { console.error(error.message); process.exitCode = 1 }
