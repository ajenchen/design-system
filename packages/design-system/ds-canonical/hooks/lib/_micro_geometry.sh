#!/bin/bash
# Shared structural classifier for layoutSpace's mechanically provable fixed micro geometry.
#
# Policy data lives in utility-registry.json. This helper owns the bounded parser used by both the
# layout magic-number gate and the escape-marker ceiling so those gates cannot disagree about
# whether `gap-1` / `gap-2` is an active bypass.

governance_micro_geometry_registry_file() {
  local corpus registry
  corpus="$(governance_corpus_root)" || return 1
  if [ -f "$corpus/packages/design-system/src/tokens/utility-registry.json" ]; then
    registry="$corpus/packages/design-system/src/tokens/utility-registry.json"
  else
    registry="$corpus/references/utility-registry.json"
  fi
  [ -f "$registry" ] && [ -r "$registry" ] && [ ! -L "$registry" ] || return 1
  printf '%s\n' "$registry"
}

governance_micro_geometry_scan() {
  local mode="$1" payload="${2:-}" candidates="${3:-}" root="${4:-}" registry
  registry="$(governance_micro_geometry_registry_file)" || return 1
  python3 - "$mode" "$registry" "$root" 3<<<"$payload" 4<<<"$candidates" <<'PY'
import json
import os
import re
import stat
import sys

mode, registry_path, scan_root = sys.argv[1:4]
payload = os.fdopen(3, encoding="utf-8").read()
candidates = os.fdopen(4, encoding="utf-8").read()

with open(registry_path, encoding="utf-8") as source:
    registry = json.load(source)

if (
    not isinstance(registry, dict)
    or registry.get("schemaVersion") != 1
    or registry.get("_meta", {}).get("owner")
       != "packages/design-system/src/tokens/utility-registry.json"
):
    raise ValueError("utility registry identity is invalid")

policy = registry.get("spacing", {}).get("canonical_micro_geometry")
expected_keys = {
    "gap_utilities",
    "alignment_utilities",
    "inline_display_utilities",
    "phrasing_elements",
    "list_container_elements",
    "list_item_elements",
    "list_roles",
    "control_roles",
    "field_group_elements",
    "field_group_roles",
    "field_control_elements",
    "assist_chip_row",
    "nearby_line_limit",
    "rationale",
    "rationale_path",
}
if not isinstance(policy, dict) or set(policy) != expected_keys:
    raise ValueError("canonical micro-geometry policy is invalid")

array_keys = expected_keys - {"assist_chip_row", "nearby_line_limit", "rationale", "rationale_path"}
for key in array_keys:
    value = policy[key]
    if (
        not isinstance(value, list)
        or not value
        or len(value) != len(set(value))
        or any(not isinstance(item, str) or not item for item in value)
    ):
        raise ValueError(f"canonical micro-geometry list is invalid:{key}")
if not isinstance(policy["nearby_line_limit"], int) or not 1 <= policy["nearby_line_limit"] <= 32:
    raise ValueError("canonical micro-geometry nearby bound is invalid")
if any(not isinstance(policy[key], str) or not policy[key] for key in ("rationale", "rationale_path")):
    raise ValueError("canonical micro-geometry rationale is invalid")

# chip.spec.md「一排 assist chip(訊息附件以外)」:the only wrapping row lane. Its gap must be a
# subset of the registry gap utilities, so this lane can never widen what counts as micro geometry.
chip_row = policy["assist_chip_row"]
chip_row_keys = {"gap_utilities", "wrap_utilities", "item_component", "item_variant", "rationale", "rationale_path"}
if not isinstance(chip_row, dict) or set(chip_row) != chip_row_keys:
    raise ValueError("canonical micro-geometry assist_chip_row is invalid")
for key in ("gap_utilities", "wrap_utilities"):
    value = chip_row[key]
    if (
        not isinstance(value, list)
        or not value
        or len(value) != len(set(value))
        or any(not isinstance(item, str) or not item for item in value)
    ):
        raise ValueError(f"canonical micro-geometry assist_chip_row list is invalid:{key}")
if not set(chip_row["gap_utilities"]) <= set(policy["gap_utilities"]):
    raise ValueError("canonical micro-geometry assist_chip_row gap is outside gap_utilities")
for key in ("item_component", "item_variant", "rationale", "rationale_path"):
    if not isinstance(chip_row[key], str) or not chip_row[key]:
        raise ValueError(f"canonical micro-geometry assist_chip_row field is invalid:{key}")
if not re.fullmatch(r"[A-Z][A-Za-z0-9]*", chip_row["item_component"]) or not re.fullmatch(
    r"[a-z][a-z0-9-]*", chip_row["item_variant"]
):
    raise ValueError("canonical micro-geometry assist_chip_row item identity is invalid")

allowed_gaps = set(policy["gap_utilities"])
alignments = set(policy["alignment_utilities"])
inline_displays = set(policy["inline_display_utilities"])
phrasing_elements = set(policy["phrasing_elements"])
list_containers = set(policy["list_container_elements"])
list_items = set(policy["list_item_elements"])
list_roles = set(policy["list_roles"])
control_roles = set(policy["control_roles"])
field_groups = set(policy["field_group_elements"])
field_group_roles = set(policy["field_group_roles"])
field_controls = set(policy["field_control_elements"])
chip_row_gaps = set(chip_row["gap_utilities"])
chip_row_wraps = set(chip_row["wrap_utilities"])
chip_open_re = re.compile(rf"<{re.escape(chip_row['item_component'])}\b")
# The variant attribute must belong to the same opening tag:`[^<]` stops at the next element, so a
# sibling component's variant cannot be borrowed (arrow functions `=>` inside props are allowed).
chip_variant_re = re.compile(
    rf"<{re.escape(chip_row['item_component'])}\b[^<]*?\bvariant\s*=\s*\{{?\s*['\"]"
    rf"{re.escape(chip_row['item_variant'])}['\"]"
)
nearby_limit = policy["nearby_line_limit"]

# This is the exact family recognized by check_layout_space_magic_numbers.sh. Classification is
# intentionally stricter than detection:every magic token on the candidate line must be one of
# the registry-owned gap utilities, so `gap-2 p-4` cannot hide its macro padding.
magic_token_re = re.compile(
    r"(?<![A-Za-z0-9_])(?:"
    r"(?:p|px|py|pt|pb|pl|pr|ps|pe|gap|space-x|space-y|m|mx|my|mt|mb|ml|mr|ms|me)-"
    r"(?:0\.5|[1-9][0-9]?(?:\.[0-9])?)"
    r"|(?:p|px|py|pt|pb|pl|pr|ps|pe|gap|m|mx|my|mt|mb|ml|mr|ms|me)-"
    r"\[[0-9]+(?:\.[0-9]+)?px\]"
    r"|w-\[[0-9]+(?:\.[0-9]+)?px\]"
    r"|grid-(?:cols|rows)-\[[^\]]*[0-9]+px[^\]]*\]"
    r")(?![A-Za-z0-9_.-])"
)
marker_re = re.compile(
    r"@(?:[a-z][a-z-]*-allow|benchmark-unverified(?:-blanket)?|template-customized|"
    r"anatomy-exempt(?:-next)?|overlay-open-skip|layout-space-magic-ok|"
    r"propose-cite-skip|story-(?:trait|split)-rationale)"
)


def has_utility(line, utility):
    return re.search(
        rf"(?<![A-Za-z0-9_-]){re.escape(utility)}(?![A-Za-z0-9_.-])",
        line,
    ) is not None


def has_any_utility(line, utilities):
    return any(has_utility(line, utility) for utility in utilities)


def has_open_element(line, elements):
    return any(re.search(rf"<{re.escape(element)}\b", line) for element in elements)


def phrasing_owner_has_geometry(line):
    """Require the phrasing element itself to own the geometry-bearing class attribute."""
    for match in re.finditer(r"<([A-Za-z][A-Za-z0-9.]*)\b([^<>]*)>", line):
        tag, attributes = match.groups()
        if tag not in phrasing_elements or not re.search(r"\bclass(?:Name)?\s*=", attributes):
            continue
        if (
            has_utility(attributes, "flex")
            and has_any_utility(attributes, alignments)
            and has_any_utility(attributes, allowed_gaps)
        ):
            return True
    return False


def has_role(line, roles):
    return any(
        re.search(rf"\brole\s*=\s*['\"]{re.escape(role)}['\"]", line)
        for role in roles
    )


def nearby_window(lines, index):
    return "\n".join(lines[index:index + nearby_limit + 1])


def is_canonical_micro_line(lines, index):
    if index < 0 or index >= len(lines):
        return False
    line = lines[index]
    tokens = magic_token_re.findall(line)
    if not tokens or any(token not in allowed_gaps for token in tokens):
        return False
    # A quoted class assignment or JSX class attribute is required. Prose mentioning gap-1/2 is
    # not executable structural evidence.
    if not re.search(r"\bclass(?:Name)?\s*=|\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*['\"`]", line):
        return False

    aligned = has_any_utility(line, alignments)
    flex = has_utility(line, "flex")
    flex_col = has_utility(line, "flex-col")

    # Inline item/Button anatomy. `span` remains acceptable when Tailwind's block-level `flex`
    # utility is used because the HTML owner is still a bounded phrasing wrapper.
    if aligned and (
        has_any_utility(line, inline_displays)
        or phrasing_owner_has_geometry(line)
    ):
        return True

    # Compact toolbars are the explicit Button xs micro-control context.
    if aligned and flex and has_role(line, control_roles):
        return True

    window = nearby_window(lines, index)

    # A semantic list container must own actual nearby list items (or a map that materializes one),
    # preventing a generic `div.flex-col.gap-2` macro stack from entering through this lane.
    if flex_col and (
        has_open_element(line, list_containers)
        or has_role(line, {role for role in list_roles if role == "list"})
    ):
        item_elements = sum(
            len(re.findall(rf"<{re.escape(element)}\b", window)) for element in list_items
        )
        item_roles = sum(
            len(re.findall(rf"\brole\s*=\s*['\"]{re.escape(role)}['\"]", window))
            for role in list_roles if role == "listitem"
        )
        if item_elements + item_roles >= 2 or (
            ".map(" in window and item_elements + item_roles >= 1
        ):
            return True

    # chip.spec.md「一排 assist chip(訊息附件以外)」:a wrapping row of assist chips is a semantic
    # list (ul/ol that also declares role="list", one li per chip) at the AgentMessage attachment
    # gap. Every condition is required: the lane's own gap only, flex + wrap and not a column, the
    # list element and the explicit list role on the same line, nearby li items, and every Chip
    # inside the list being the assist variant. A hand-made div row never reaches this lane.
    if (
        set(tokens) <= chip_row_gaps
        and flex
        and not flex_col
        and has_any_utility(line, chip_row_wraps)
        and has_open_element(line, list_containers)
        and has_role(line, {role for role in list_roles if role == "list"})
    ):
        # Bound the evidence to this list:stop at its first closing list tag inside the window.
        closing = re.search(
            "|".join(rf"</{re.escape(element)}\s*>" for element in sorted(list_containers)),
            window,
        )
        segment = window[:closing.start()] if closing else window
        item_elements = sum(
            len(re.findall(rf"<{re.escape(element)}\b", segment)) for element in list_items
        )
        chips = len(chip_open_re.findall(segment))
        assist_chips = len(chip_variant_re.findall(segment))
        mapped = ".map(" in segment
        if (
            chips >= 1
            and chips == assist_chips
            and item_elements >= 1
            and (mapped or (item_elements >= 2 and assist_chips >= 2))
        ):
            return True

    # A semantic list row owns its internal item gap; cross-axis alignment is mandatory.
    if aligned and flex and (
        has_open_element(line, list_items)
        or has_role(line, {role for role in list_roles if role == "listitem"})
    ):
        return True

    # layoutSpace rule 5:only gap-2, horizontal grouped fields, and at least two nearby field
    # controls. A normal div containing unrelated sections/cards cannot satisfy this lane.
    if set(tokens) == {"gap-2"} and flex and not flex_col and (
        has_open_element(line, field_groups) or has_role(line, field_group_roles)
    ):
        field_wrappers = sum(
            len(re.findall(rf"<{re.escape(element)}\b", window))
            for element in field_controls if element == "Field"
        )
        direct_controls = sum(
            len(re.findall(rf"<{re.escape(element)}\b", window))
            for element in field_controls if element != "Field"
        )
        if field_wrappers >= 2 or (field_wrappers == 0 and direct_controls >= 2):
            return True

    return False


def countable_markers(content):
    lines = content.splitlines()
    result = []
    for index, line in enumerate(lines):
        for marker in marker_re.findall(line):
            if marker == "@layout-space-magic-ok" and (
                is_canonical_micro_line(lines, index)
                or is_canonical_micro_line(lines, index + 1)
            ):
                continue
            result.append(marker)
    return result


if mode == "filter-layout-candidates":
    lines = payload.splitlines()
    for candidate in candidates.splitlines():
        if not candidate:
            continue
        match = re.match(r"([0-9]+):(.*)", candidate, re.DOTALL)
        if not match:
            raise ValueError("layout candidate lacks a line number")
        index = int(match.group(1)) - 1
        if not is_canonical_micro_line(lines, index):
            print(candidate)
elif mode == "content-markers":
    print("\n".join(countable_markers(payload)))
elif mode == "repo-markers":
    root = os.path.abspath(scan_root)
    root_stat = os.lstat(root)
    if not stat.S_ISDIR(root_stat.st_mode) or stat.S_ISLNK(root_stat.st_mode):
        raise ValueError("repository marker root is unsafe")
    output = []
    # 規範位置的建置輸出只在 app 根(apps/<name>)的直接子資料夾略過;清單正本 scripts/lib/consumer-output-roots.mjs
    #(hook 端寫成字面值,逐字相同由 scripts/test-setup-governance.mjs 守;2026-11-27 上游判定 B4)。
    # root 是 apps/<name> 時 app 根 = root;root 是 apps/ 時 app 根 = root 的每個子資料夾。
    output_names = ('node_modules', 'dist', 'build', 'coverage', 'storybook-static', '.next', '.turbo', '.cache', '.vite')
    app_depth = 0 if os.path.basename(os.path.dirname(root)) == "apps" else 1
    for current, dirs, files in os.walk(root, followlinks=False):
        depth = 0 if current == root else len(os.path.relpath(current, root).split(os.sep))
        dirs[:] = sorted(
            name for name in dirs
            if not os.path.islink(os.path.join(current, name))
            and not (depth == app_depth and name in output_names)
        )
        for name in sorted(files):
            if not name.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(current, name)
            entry = os.lstat(path)
            if not stat.S_ISREG(entry.st_mode) or stat.S_ISLNK(entry.st_mode):
                continue
            with open(path, encoding="utf-8", errors="strict") as source:
                output.extend(countable_markers(source.read()))
    print("\n".join(output))
else:
    raise ValueError(f"unknown micro-geometry scan mode:{mode}")
PY
}

governance_filter_canonical_micro_geometry() {
  governance_micro_geometry_scan filter-layout-candidates "$1" "$2"
}

governance_countable_escape_markers() {
  governance_micro_geometry_scan content-markers "$1"
}

governance_countable_repository_escape_markers() {
  governance_micro_geometry_scan repo-markers "" "" "$1"
}
