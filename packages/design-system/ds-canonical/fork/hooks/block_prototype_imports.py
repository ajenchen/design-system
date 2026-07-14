#!/usr/bin/env python3
import json
import os
import re
import sys
import time

# Per-hook fire logging(enables /knowledge-prune D2 dead-hook detection)
# Resolve project root from this script's location(stable; cwd may be anywhere
# depending on how Claude Code invokes the hook)to avoid stray .claude/ trees.
try:
    _project_root = os.environ.get('CLAUDE_PROJECT_DIR') or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    _log_dir = os.path.join(_project_root, '.claude', 'logs')
    os.makedirs(_log_dir, exist_ok=True)
    with open(os.path.join(_log_dir, 'hook-fires-per-hook.jsonl'), 'a') as _f:
        _f.write(json.dumps({'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'hook': os.path.basename(__file__)}) + '\n')
except Exception:
    pass

EXPLORATION_PREFIX = "src/explorations/"
SRC_PREFIX = "src/"

# Project root for absolute→relative path normalization(real Edit/Write events
# carry absolute file_path;prefix 比對必先轉 project-root 相對,否則 hook 永不 fire)。
PROJECT_ROOT = os.environ.get('CLAUDE_PROJECT_DIR') or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def to_project_relative(path):
    if os.path.isabs(path):
        return os.path.relpath(path, PROJECT_ROOT)
    return path

def load_event():
    try:
        return json.load(sys.stdin)
    except Exception:
        return None

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
    if not path.startswith(SRC_PREFIX):
        return False
    if path.startswith(EXPLORATION_PREFIX):
        return False
    if not (path.endswith(".ts") or path.endswith(".tsx")):
        return False
    return True

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
    if not event:
        sys.exit(0)

    tool_input = event.get("tool_input", {})
    touched_paths = collect_file_paths(tool_input)

    offenders = []

    for path in touched_paths:
        rel_path = to_project_relative(path)
        if not should_check(rel_path):
            continue
        abs_path = path if os.path.isabs(path) else os.path.join(PROJECT_ROOT, path)
        if not os.path.exists(abs_path):
            continue

        try:
            with open(abs_path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception:
            continue

        if contains_exploration_import(content):
            offenders.append(rel_path)

    if offenders:
        lines = [
            "Blocked: 正式程式碼不得 import src/explorations/ 內的檔案。"
        ]
        lines.extend(f"- {p}" for p in offenders)
        print("\n".join(lines))
        sys.exit(2)

    sys.exit(0)

if __name__ == "__main__":
    main()