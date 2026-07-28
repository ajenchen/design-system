#!/usr/bin/env bash
# Compatibility entrypoint only. The JSON plan is the sole dimension/argv SSOT.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/run-deterministic-deep-audit.mjs --profile=local "$@"
