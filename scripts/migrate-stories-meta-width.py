#!/usr/bin/env python3
"""Migrate DataTable stories: root size: NUMBER → meta.width: NUMBER

Patterns handled (only inside col.accessor / col.display call blocks):
  size: 240, ... meta: { type: 'X' }       → meta: { type: 'X', width: 240 }
  size: 100, minSize: 80, ... meta: { ... } → meta: { ..., width: 100, minWidth: 80 }

Skips lines without `accessor` keyword (preserves Field / Button `size: 'md'` etc).
"""
import re
import sys
from pathlib import Path

PATH = Path('src/design-system/components/DataTable/data-table.stories.tsx')
text = PATH.read_text()
original = text

# Match: { ... size: NUMBER, ... meta: { CONTENT } ... }  inside accessor call
# Strategy: find lines containing `accessor` AND `size: NUMBER`, transform line-by-line
#
# More robust: regex over multi-line column def block.
# Format A (single-line): col.accessor('id', { header: 'X', size: 240, [minSize: 80,] meta: { type: 'X' [, ...]} }),
# Format B (multi-line):  col.accessor('id', {\n  header: 'X',\n  size: 240,\n  [minSize: 80,]\n  meta: { ... },\n})

# Approach: regex match the whole `{ ... size: NUMBER ... meta: { ... } ... }` block,
# pull out size + minSize + maxSize + meta content,
# rebuild as `{ ... meta: { content, width: N, [minWidth: N, maxWidth: N] } ... }`

# Pattern matches: `size: NUMBER` or `, size: NUMBER` or `\n  size: NUMBER,` etc.
SIZE_RE = re.compile(r"(\s*,?\s*)size:\s*(\d+),?")
MINSIZE_RE = re.compile(r"(\s*,?\s*)minSize:\s*(\d+),?")
MAXSIZE_RE = re.compile(r"(\s*,?\s*)maxSize:\s*(\d+),?")
META_RE = re.compile(r"meta:\s*\{([^{}]*)\}")

def transform_block(block_text):
    """Transform a single column def object body { ... }"""
    size_match = SIZE_RE.search(block_text)
    if not size_match:
        return block_text
    size_value = size_match.group(2)

    min_match = MINSIZE_RE.search(block_text)
    max_match = MAXSIZE_RE.search(block_text)

    meta_match = META_RE.search(block_text)
    if not meta_match:
        # No meta: skip(don't migrate without target meta)
        return block_text
    meta_content = meta_match.group(1).strip()

    # Build new meta inserting width / minWidth / maxWidth
    new_props = [f"width: {size_value}"]
    if min_match:
        new_props.append(f"minWidth: {min_match.group(2)}")
    if max_match:
        new_props.append(f"maxWidth: {max_match.group(2)}")

    if meta_content.endswith(','):
        meta_content = meta_content[:-1].strip()

    # If meta content already had props, append; else just new props
    if meta_content:
        new_meta_content = f"{meta_content}, {', '.join(new_props)}"
    else:
        new_meta_content = ', '.join(new_props)

    new_meta = f"meta: {{ {new_meta_content} }}"

    # Remove size / minSize / maxSize lines
    block_text = SIZE_RE.sub('', block_text, count=1)
    if min_match:
        block_text = MINSIZE_RE.sub('', block_text, count=1)
    if max_match:
        block_text = MAXSIZE_RE.sub('', block_text, count=1)

    # Replace meta with new version
    block_text = META_RE.sub(new_meta, block_text, count=1)

    # Cleanup double commas / leading commas / orphan commas
    block_text = re.sub(r',\s*,', ',', block_text)
    block_text = re.sub(r"\{\s*,\s*", '{ ', block_text)
    block_text = re.sub(r",\s*\}", ' }', block_text)

    return block_text


# Match each `col.accessor('id', { ... }),` or similar — both single-line and multi-line.
# Use regex with balanced-brace approach (simple state machine since regex can't do balanced).
def find_accessor_blocks(text):
    """Yield (start, end, block_text) for each `accessor.../display.../{ ... }` argument."""
    for m in re.finditer(r"\.(accessor|display|group)\(", text):
        # Find matching outer parenthesis of the call
        # First arg might be a string literal, then comma, then { ... }
        start_paren = m.end() - 1
        depth = 1
        i = m.end()
        while i < len(text) and depth > 0:
            c = text[i]
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
            if depth == 0:
                break
            i += 1
        if depth != 0:
            continue
        call_args = text[m.end():i]
        # Find the column-def object {…} inside call_args
        # It's typically the last argument
        brace_start = call_args.find('{')
        if brace_start == -1:
            continue
        depth_b = 1
        j = brace_start + 1
        while j < len(call_args) and depth_b > 0:
            c = call_args[j]
            if c == '{':
                depth_b += 1
            elif c == '}':
                depth_b -= 1
            if depth_b == 0:
                break
            j += 1
        if depth_b != 0:
            continue
        block_start = m.end() + brace_start
        block_end = m.end() + j + 1
        yield block_start, block_end, text[block_start:block_end]

# Iterate from end to start to avoid offset shift on replacements
blocks = list(find_accessor_blocks(text))
for start, end, block in reversed(blocks):
    new_block = transform_block(block)
    if new_block != block:
        text = text[:start] + new_block + text[end:]

if text != original:
    PATH.write_text(text)
    print(f"Migrated. Changed {len(text) - len(original)} chars.")
else:
    print("No changes.")
