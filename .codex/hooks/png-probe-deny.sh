#!/bin/bash
input=$(cat)
echo "$input" >> /tmp/png-p2-pretooluse-input.jsonl
if echo "$input" | grep -q "PNG_PROBE_MAGIC"; then
  echo "PNG-PROBE-DENY: blocked by repo-level .codex hook" >&2
  exit 2
fi
exit 0
