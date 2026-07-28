#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=${BASH_SOURCE[0]%/*}
if [ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ]; then SCRIPT_DIR=.; fi
SCRIPT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR" && pwd -P)
exec node -- "$SCRIPT_DIR/consumer-governance-proposed-replay.mjs"
