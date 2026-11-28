#!/bin/bash
# Cloud setup for Claude Code on the web and Codex Cloud (README "Local, cloud, and container setup"
# holds the only description and the environment's few-line Setup script that runs this file).
# Installs the exact Node.js in .node-version from the official nodejs.org release, verified against
# the release's SHASUMS256.txt, then runs `npm run setup:all` with it and returns that exit status.
# Any failure exits non-zero. Managed file: delivered by `npm run sync-all`; do not edit by hand.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
NODE_VERSION="$(tr -d '[:space:]' 2>/dev/null < .node-version)"
if ! [[ "$NODE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "cloud-setup: $(pwd)/.node-version must hold one exact X.Y.Z version" >&2
  exit 1
fi
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64 | arm64) NODE_ARCH=arm64 ;;
  *) echo "cloud-setup: no official Node.js build for $(uname -m)" >&2; exit 1 ;;
esac
NODE_ROOT="${CLOUD_SETUP_NODE_ROOT:-/opt}"
LINK_DIR="${CLOUD_SETUP_LINK_DIR:-/usr/local/bin}"
NODE_HOME="$NODE_ROOT/node-v$NODE_VERSION"
NODE_TARBALL="node-v$NODE_VERSION-linux-$NODE_ARCH.tar.gz"
if [ "$("$NODE_HOME/bin/node" --version 2>/dev/null)" != "v$NODE_VERSION" ]; then
  work="$(mktemp -d)" && [ -n "$work" ] || { echo "cloud-setup: mktemp failed" >&2; exit 1; }
  url="https://nodejs.org/dist/v$NODE_VERSION"
  if ! curl -fsSL --retry 3 -o "$work/SHASUMS256.txt" "$url/SHASUMS256.txt" ||
    ! curl -fsSL --retry 3 -o "$work/$NODE_TARBALL" "$url/$NODE_TARBALL"; then
    echo "cloud-setup: cannot download Node.js v$NODE_VERSION from nodejs.org" >&2
    exit 1
  fi
  if ! (cd "$work" && grep -E "^[0-9a-f]{64}  $NODE_TARBALL\$" SHASUMS256.txt | sha256sum --check --strict --status -); then
    echo "cloud-setup: $NODE_TARBALL does not match the release SHASUMS256.txt" >&2
    exit 1
  fi
  rm -rf "$NODE_HOME.partial" && mkdir -p "$NODE_HOME.partial" &&
    tar -xzf "$work/$NODE_TARBALL" -C "$NODE_HOME.partial" --strip-components=1 &&
    rm -rf "$NODE_HOME" && mv "$NODE_HOME.partial" "$NODE_HOME" ||
    { echo "cloud-setup: cannot install Node.js into $NODE_HOME" >&2; exit 1; }
  rm -rf "$work"
fi
for tool in node npm npx; do ln -sfn "$NODE_HOME/bin/$tool" "$LINK_DIR/$tool" || exit 1; done
export PATH="$NODE_HOME/bin:$PATH"
echo "cloud-setup: Node.js $(node --version) from $NODE_HOME"
exec npm run setup:all
