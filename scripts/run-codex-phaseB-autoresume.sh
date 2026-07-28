#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/run-codex-phaseB.mjs "$@"
