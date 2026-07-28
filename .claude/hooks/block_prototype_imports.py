#!/usr/bin/env python3
import json
import hashlib
import os
import re
import subprocess
import sys
import tempfile
import time

def integrity_failure(message):
    print(f"GOVERNANCE_INTEGRITY: {message}", file=sys.stderr)
    raise SystemExit(70)


def resolve_project_root():
    configured = os.environ.get('GOVERNANCE_PROJECT_DIR')
    if configured and os.path.isdir(configured):
        return os.path.realpath(os.path.abspath(configured))
    try:
        return subprocess.check_output(
            ['git', '-C', os.path.dirname(os.path.abspath(__file__)), 'rev-parse', '--show-toplevel'],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        # The caller classifies this as an integrity fault before path-scoped enforcement runs.
        return ''

PROJECT_ROOT = resolve_project_root()

def governance_runtime_state_dir():
    """Return the trusted provider-neutral state directory, or None.

    Telemetry is opt-in and may only live below the repository's governance
    runtime root.  This mirrors _log-fire.sh without assuming a Claude or Codex
    discovery directory.
    """
    if os.environ.get('GOVERNANCE_TELEMETRY_OPT_IN', '0') != '1':
        return None
    if os.environ.get('GOVERNANCE_READ_ONLY', '0') == '1':
        return None
    if not PROJECT_ROOT or not os.path.isdir(PROJECT_ROOT):
        return None

    try:
        git_dir = subprocess.check_output(
            ['git', '-C', PROJECT_ROOT, 'rev-parse', '--absolute-git-dir'],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        root_hash = hashlib.sha256(PROJECT_ROOT.encode()).hexdigest()[:16]
        runtime_parent = os.path.realpath(
            os.path.abspath(os.environ.get('TMPDIR') or tempfile.gettempdir())
        )
        allowed_root = os.path.join(runtime_parent, 'governance-runtime', root_hash)
    else:
        runtime_parent = os.path.realpath(os.path.abspath(git_dir))
        allowed_root = os.path.join(runtime_parent, 'governance-runtime')

    def safe_runtime_path(root, candidate):
        root = os.path.abspath(root)
        target = os.path.abspath(candidate)
        try:
            if os.path.commonpath([root, target]) != root:
                return None
        except ValueError:
            return None
        cursor = root
        if os.path.lexists(cursor) and os.path.islink(cursor):
            return None
        relative = os.path.relpath(target, root)
        if relative != '.':
            for segment in relative.split(os.sep):
                cursor = os.path.join(cursor, segment)
                if not os.path.lexists(cursor):
                    break
                if os.path.islink(cursor):
                    return None
        return target

    runtime_root = safe_runtime_path(
        runtime_parent,
        os.environ.get('GOVERNANCE_RUNTIME_ROOT', allowed_root),
    )
    if runtime_root != allowed_root:
        return None

    state_dir = safe_runtime_path(
        runtime_root,
        os.environ.get('GOVERNANCE_STATE_DIR', runtime_root),
    )
    if state_dir is None:
        return None
    return state_dir


# Per-hook fire logging (enables provider-neutral dead-hook detection). It is
# disabled by default and never recreates a provider discovery directory.
try:
    _log_dir = governance_runtime_state_dir()
    if not _log_dir:
        raise RuntimeError('governance telemetry is disabled or untrusted')
    os.makedirs(_log_dir, exist_ok=True)
    with open(os.path.join(_log_dir, 'hook-fires-per-hook.jsonl'), 'a') as _f:
        _f.write(json.dumps({'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'hook': os.path.basename(__file__)}) + '\n')
except Exception:
    pass

# Project root for absolute→relative path normalization (real Edit/Write events carry absolute
# file_path; prefix matching must use the same explicit/git-resolved root as enforcement).

def to_project_relative(path):
    if os.path.isabs(path) and PROJECT_ROOT:
        return os.path.relpath(os.path.realpath(path), PROJECT_ROOT)
    return path

def load_event():
    try:
        event = json.load(sys.stdin)
    except Exception as error:
        integrity_failure(f"prototype import hook input could not be parsed:{error.__class__.__name__}")
    if not isinstance(event, dict):
        integrity_failure("prototype import hook input must be an object")
    if "tool_name" in event and not isinstance(event["tool_name"], str):
        integrity_failure("prototype import hook tool_name must be a string")
    tool_input = event.get("tool_input", {})
    if not isinstance(tool_input, dict):
        integrity_failure("prototype import hook tool_input must be an object")
    for key in ("file_path",):
        if key in tool_input and not isinstance(tool_input[key], str):
            integrity_failure(f"prototype import hook {key} must be a string")
    for key in ("edits", "files"):
        values = tool_input.get(key)
        if values is None:
            continue
        if not isinstance(values, list):
            integrity_failure(f"prototype import hook {key} must be an array")
        for item in values:
            if not isinstance(item, dict):
                integrity_failure(f"prototype import hook {key} entries must be objects")
            if "file_path" in item and not isinstance(item["file_path"], str):
                integrity_failure(f"prototype import hook {key}.file_path must be a string")
    return event

def collect_file_paths(tool_input):
    paths = []

    if not isinstance(tool_input, dict):
        return paths

    file_path = tool_input.get("file_path")
    if isinstance(file_path, str):
        paths.append(file_path)

    edits = tool_input.get("edits")
    if isinstance(edits, list):
        for item in edits:
            if isinstance(item, dict):
                p = item.get("file_path")
                if isinstance(p, str):
                    paths.append(p)

    files = tool_input.get("files")
    if isinstance(files, list):
        for item in files:
            if isinstance(item, dict):
                p = item.get("file_path")
                if isinstance(p, str):
                    paths.append(p)

    return list(dict.fromkeys(paths))

def should_check(path):
    normalized = path.replace("\\", "/").removeprefix("./")
    if normalized.startswith("../") or normalized.startswith("/"):
        return False
    if normalized.startswith("src/"):
        source_relative = normalized[len("src/"):]
    else:
        match = re.match(r"^apps/[^/]+/src/(.+)$", normalized)
        if not match:
            return False
        source_relative = match.group(1)
    if source_relative.startswith("explorations/"):
        return False
    return normalized.endswith((".ts", ".tsx"))

def contains_exploration_import(content):
    patterns = [
        r'from\s+[\'"].*src/explorations/.*[\'"]',
        r'from\s+[\'"].*explorations/.*[\'"]',
        r'import\s+[\'"].*src/explorations/.*[\'"]',
        r'import\s+[\'"].*explorations/.*[\'"]'
    ]
    return any(re.search(p, content) for p in patterns)

def main():
    event = load_event()
    if not PROJECT_ROOT or not os.path.isdir(PROJECT_ROOT):
        integrity_failure("prototype import hook project root could not be resolved")

    tool_input = event.get("tool_input", {})
    touched_paths = collect_file_paths(tool_input)

    offenders = []

    for path in touched_paths:
        rel_path = to_project_relative(path)
        if not should_check(rel_path):
            continue
        abs_path = path if os.path.isabs(path) else os.path.join(PROJECT_ROOT, path)
        if not os.path.lexists(abs_path):
            integrity_failure(f"prototype import target is missing:{rel_path}")
        if os.path.islink(abs_path) or not os.path.isfile(abs_path):
            integrity_failure(f"prototype import target is unsafe:{rel_path}")

        try:
            with open(abs_path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as error:
            integrity_failure(
                f"prototype import target could not be read:{rel_path}:{error.__class__.__name__}"
            )

        if contains_exploration_import(content):
            offenders.append(rel_path)

    if offenders:
        lines = [
            "Blocked: 正式程式碼不得 import src/explorations/ 內的檔案。"
        ]
        lines.extend(f"- {p}" for p in offenders)
        print("\n".join(lines), file=sys.stderr)
        sys.exit(2)

    sys.exit(0)

if __name__ == "__main__":
    main()
