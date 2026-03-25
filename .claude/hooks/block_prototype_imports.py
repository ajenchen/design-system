#!/usr/bin/env python3
import json
import os
import re
import sys

EXPLORATION_PREFIX = "src/explorations/"
SRC_PREFIX = "src/"

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
        if not should_check(path):
            continue
        if not os.path.exists(path):
            continue

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception:
            continue

        if contains_exploration_import(content):
            offenders.append(path)

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