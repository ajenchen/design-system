#!/usr/bin/env bash
# Compatibility entrypoint only. It plans build-tier work unless --execute and
# the required capability flags are passed explicitly.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/run-deterministic-deep-audit.mjs --profile=build "$@"
