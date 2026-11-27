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
  local mode="$1" payload="${2:-}" candidates="${3:-}" root="${4:-}" registry mask_lib
  registry="$(governance_micro_geometry_registry_file)" || return 1
  # JSX 結構解析前的註解遮罩只用 _comment_mask.sh 那一份實作(不在這裡另寫正規式)
  mask_lib="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_comment_mask.sh"
  [ -f "$mask_lib" ] && [ -r "$mask_lib" ] && [ ! -L "$mask_lib" ] || return 1
  python3 - "$mode" "$registry" "$root" "$mask_lib" 3<<<"$payload" 4<<<"$candidates" <<'PY'
import json
import os
import re
import stat
import subprocess
import sys

mode, registry_path, scan_root, mask_lib = sys.argv[1:5]
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
    "title_block",
    "nearby_line_limit",
    "rationale",
    "rationale_path",
    "spec_registered_patterns",
}
if not isinstance(policy, dict) or set(policy) != expected_keys:
    raise ValueError("canonical micro-geometry policy is invalid")

# 規格登記的寫法(2026-11-27,上游判定 H2 + H3 + H4):規格明文叫產品寫的固定間距組合(檔案清單、頁面列表列、
# 浮層清單外框),每筆 = 完整 class 組合 + 鄰近必須出現的 DS 元件 / 結構 + 出處 spec 行號。只有整組對得上才放行,
# 同一行混入別的 magic 不放行;反例(沒 FileItem 的 flex-col gap-2、沒頭像或 Item 零件的 gap-3 px-4 py-3、
# 不在浮層主體裡的 py-2 清單)照擋。
# 2026-11-27(H32):另登記規則 5 的 gap-4(不同組欄位並排)與 Item 零件組的一列(gap-2);新增兩個條件 ——
# utilities_none(同一行不得有,例:flex-col 排除直排)、direct_children_all + direct_children_min(這一行那個元素的
# 直屬子元素全是清單裡的元件、至少 N 個;用下方的 JSX 結構解析,不靠鄰近 16 行裡數到幾個)。
SPEC_PATTERN_KEYS = {
    "id", "utilities", "utilities_any", "utilities_none", "magic_tokens_exact", "magic_tokens_subset", "nearby_all",
    "nearby_components", "nearby_min", "same_line_any", "ancestor_any", "ancestor_line_limit",
    "direct_children_all", "direct_children_min", "source",
}
SPEC_PATTERN_INT_KEYS = {"nearby_min": 8, "ancestor_line_limit": 64, "direct_children_min": 8}
spec_patterns = policy["spec_registered_patterns"]
if not isinstance(spec_patterns, list) or not spec_patterns:
    raise ValueError("canonical micro-geometry spec patterns are invalid")
for pattern in spec_patterns:
    if (
        not isinstance(pattern, dict)
        or set(pattern) - SPEC_PATTERN_KEYS
        or not {"id", "utilities", "source"} <= set(pattern)
        or ("magic_tokens_exact" in pattern) == ("magic_tokens_subset" in pattern)
        or ("nearby_components" in pattern) != ("nearby_min" in pattern)
        or ("ancestor_any" in pattern) != ("ancestor_line_limit" in pattern)
        or ("direct_children_all" in pattern) != ("direct_children_min" in pattern)
    ):
        raise ValueError("canonical micro-geometry spec pattern shape is invalid")
    for key in SPEC_PATTERN_KEYS - {"id", "source"} - set(SPEC_PATTERN_INT_KEYS):
        if key in pattern and (
            not isinstance(pattern[key], list) or not pattern[key]
            or any(not isinstance(item, str) or not item for item in pattern[key])
        ):
            raise ValueError(f"canonical micro-geometry spec pattern list is invalid:{pattern.get('id')}:{key}")
    for key, upper in SPEC_PATTERN_INT_KEYS.items():
        if key in pattern and (not isinstance(pattern[key], int) or not 1 <= pattern[key] <= upper):
            raise ValueError(f"canonical micro-geometry spec pattern bound is invalid:{pattern.get('id')}:{key}")
    if not isinstance(pattern["source"], str) or not pattern["source"]:
        raise ValueError("canonical micro-geometry spec pattern source is invalid")

array_keys = expected_keys - {"assist_chip_row", "title_block", "nearby_line_limit", "rationale", "rationale_path", "spec_registered_patterns"}
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

# layoutSpace.spec.md 規則 3「標題塊」(2026-11-27,H26):標題字列 → 它標示的有框內容 = 8 的三種寫法。
title_block = policy["title_block"]
TITLE_BLOCK_LIST_KEYS = {
    "spacing_utilities", "heading_elements", "heading_utilities", "heading_row_button_variants",
    "heading_row_text_elements", "heading_row_wrappers", "bordered_components", "bordered_utilities",
    "bordered_roles", "bordered_region_values", "option_group_components", "option_group_roles",
}
TITLE_BLOCK_STR_KEYS = {"heading_row_button_component", "rationale", "rationale_path"}
if not isinstance(title_block, dict) or set(title_block) != TITLE_BLOCK_LIST_KEYS | TITLE_BLOCK_STR_KEYS:
    raise ValueError("canonical micro-geometry title_block is invalid")
for key in TITLE_BLOCK_LIST_KEYS:
    value = title_block[key]
    if (
        not isinstance(value, list) or not value or len(value) != len(set(value))
        or any(not isinstance(item, str) or not item for item in value)
    ):
        raise ValueError(f"canonical micro-geometry title_block list is invalid:{key}")
for key in TITLE_BLOCK_STR_KEYS:
    if not isinstance(title_block[key], str) or not title_block[key]:
        raise ValueError(f"canonical micro-geometry title_block field is invalid:{key}")
# 8 只有一個值:三種寫法都必須是同一個刻度(gap-2 / mt-2 / mb-2),不得藉這一格放寬成別的數字
if {re.sub(r"^[a-z]+-", "", u) for u in title_block["spacing_utilities"]} != {"2"} or not all(
    re.fullmatch(r"(?:gap|mt|mb)-2", u) for u in title_block["spacing_utilities"]
):
    raise ValueError("canonical micro-geometry title_block spacing must be gap-2 / mt-2 / mb-2 only")

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


def has_open_ancestor(lines, index, names, limit):
    """往上看 limit 行內,最近一個 <Name 開標籤之後沒有對應的 </Name> = 本行在它底下。"""
    text = "\n".join(lines[max(0, index - limit):index])
    for name in names:
        opens = [m.end() for m in re.finditer(rf"<(?:DS\.)?{re.escape(name)}\b", text)]
        if opens and not re.search(rf"</(?:DS\.)?{re.escape(name)}>", text[opens[-1]:]):
            return True
    return False


# ── JSX 結構(2026-11-27,H26 標題塊 + H32 Item 零件列):需要「直屬子元素 / 上下兄弟」的判定才用。
# 只做有界的標籤樹:註解先換成等長空白(呼叫 _comment_mask.sh 的 governance_mask_comments —— 全庫唯一一份遮罩,
# 先跳過字串再認註解;這裡只為了不把註解裡的 <h3> 當成標籤);
# `<名字` 前一個字是識別字元(useState<string> / Promise<void> 這類型別參數)不算標籤;屬性裡的 {…} 與引號照層數跳過
# (`=>` 的 > 不會被當成標籤結尾)。解析不出來的地方一律當成「沒有這個結構」= 不放行,不會因此多放。
_TAG_RE = re.compile(r"<(/?)([A-Za-z][\w.]*)?")
_tree_cache = {}


def _mask_comments(text):
    done = subprocess.run(
        ["bash", "-c", 'source "$1" && governance_mask_comments', "comment-mask", mask_lib],
        input=text, capture_output=True, text=True, encoding="utf-8",
    )
    if done.returncode != 0 or done.stdout.count("\n") != text.count("\n"):
        raise ValueError("comment mask failed or changed the line count")
    return done.stdout


def _scan_tag_end(text, pos):
    """從屬性區開頭找標籤的 `>`(跳過 {…} 與引號);回傳 (> 的位置, 是否自閉合);找不到回傳 (None, False)。"""
    depth, quote, i = 0, None, pos
    while i < len(text):
        ch = text[i]
        if quote:
            if ch == quote:
                quote = None
        elif ch in "'\"`" and depth == 0:
            quote = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth = max(0, depth - 1)
        elif ch == ">" and depth == 0:
            return i, text[i - 1] == "/"
        i += 1
    return None, False


def jsx_tree(lines):
    key = id(lines)
    if key in _tree_cache and _tree_cache[key][0] is lines:
        return _tree_cache[key][1]
    text = _mask_comments("\n".join(lines))
    line_starts = [0]
    for m in re.finditer("\n", text):
        line_starts.append(m.end())

    def line_of(offset):
        lo, hi = 0, len(line_starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if line_starts[mid] <= offset:
                lo = mid
            else:
                hi = mid - 1
        return lo

    # cursor / brace:父元素內文裡、子元素之間那幾段字的 { } 層數 —— 子元素寫在 {…} 運算式裡(條件或 .map( 產生)時 in_expr = True
    root = {"name": None, "attrs": "", "children": [], "parent": None, "open_lines": (-1, -1), "end_line": len(lines), "cursor": 0, "brace": 0}
    stack = [root]
    pos = 0
    while True:
        m = _TAG_RE.search(text, pos)
        if not m:
            break
        start = m.start()
        prev = text[start - 1] if start > 0 else ""
        closing, name = m.group(1) == "/", m.group(2) or ""
        if not closing and prev and re.match(r"[\w$)\].]", prev):
            pos = m.end()
            continue
        end, self_closing = _scan_tag_end(text, m.end())
        if end is None:
            break
        parent = stack[-1]
        segment = text[parent["cursor"]:start]
        parent["brace"] = max(0, parent["brace"] + segment.count("{") - segment.count("}"))
        parent["cursor"] = start
        if closing:
            for depth in range(len(stack) - 1, 0, -1):
                if stack[depth]["name"] == name:
                    for node in stack[depth:]:
                        node["end_line"] = line_of(end)
                    del stack[depth:]
                    stack[-1]["cursor"] = end + 1
                    break
        else:
            node = {
                "name": name, "attrs": text[m.end():end], "children": [], "parent": parent,
                "open_lines": (line_of(start), line_of(end)), "start_line": line_of(start), "end_line": line_of(end),
                "in_expr": parent["brace"] > 0, "cursor": end + 1, "brace": 0,
            }
            parent["children"].append(node)
            if self_closing:
                parent["cursor"] = end + 1
            else:
                stack.append(node)
        pos = end + 1
    _tree_cache.clear()
    _tree_cache[key] = (lines, root)
    return root


def nodes_at_line(lines, index, utilities):
    """這一行落在哪些元素的開標籤裡、而且那個開標籤自己帶著這幾個 utility(className 可以寫在 `<DataTable` 的下一行;
    同一行有好幾個開標籤時只算真的帶這個寫死間距的那幾個)。"""
    found = []
    todo = list(jsx_tree(lines)["children"])
    while todo:
        node = todo.pop()
        first, last = node["open_lines"]
        if first <= index <= last and all(has_utility(node["attrs"], u) for u in utilities):
            found.append(node)
        todo.extend(node["children"])
    return found


def node_has_tag_in(node, names):
    todo = list(node["children"])
    while todo:
        child = todo.pop()
        if child["name"] in names:
            return True
        todo.extend(child["children"])
    return False


def iter_subtree(node):
    todo = list(node["children"])
    while todo:
        child = todo.pop()
        yield child
        todo.extend(child["children"])


def is_heading_node(node):
    return node["name"] in title_block["heading_elements"] or has_any_utility(node["attrs"], title_block["heading_utilities"])


_TEXT_BUTTON_RE = re.compile(
    rf"\bvariant\s*=\s*\{{?\s*['\"](?:{'|'.join(re.escape(v) for v in title_block['heading_row_button_variants'])})['\"]"
)


def is_heading_row_extra(node):
    """標題列裡標題以外准放的東西(白名單):無框 / 連結樣式的 Button、<a>,或只包這些的 span / Tooltip 外層。"""
    if node["name"] == title_block["heading_row_button_component"]:
        return bool(_TEXT_BUTTON_RE.search(node["attrs"]))
    if node["name"] in title_block["heading_row_text_elements"]:
        return not is_bordered_self(node)
    if node["name"] in title_block["heading_row_wrappers"]:
        return not is_bordered_self(node) and all(is_heading_row_extra(kid) for kid in node["children"])
    return False


def is_heading_row(node):
    """這一列算「字」(規則 3「標題塊」,白名單):它本身是標題;或它的直屬子元素剛好一個標題,
    其餘全是 is_heading_row_extra 准放的東西。段落、清單、輸入控件、Chip、有框按鈕或任何沒列到的元素 → 不算。"""
    if is_heading_node(node):
        return True
    if is_bordered_self(node):
        return False
    kids = node["children"]
    headings = [kid for kid in kids if is_heading_node(kid)]
    return len(headings) == 1 and all(kid in headings or is_heading_row_extra(kid) for kid in kids)


def is_bordered_self(node):
    attrs = node["attrs"]
    return (
        node["name"] in title_block["bordered_components"]
        or has_any_utility(attrs, title_block["bordered_utilities"])
        or any(re.search(rf"\brole\s*=\s*['\"]{re.escape(role)}['\"]", attrs) for role in title_block["bordered_roles"])
        or any(re.search(rf"\bdata-layout-region\s*=\s*['\"]{re.escape(v)}['\"]", attrs) for v in title_block["bordered_region_values"])
    )


def is_bordered_node(node):
    """有框內容只看元素本身(規格列舉):DataTable / 搜尋列 / 工具列 / 自帶 border / bounded 邊緣標記;
    或選項卡群組 —— 元素本身宣告是一組選項(RadioGroup / CheckboxGroup / role=radiogroup|group),而且直屬子元素每一張都自帶 border。
    不從「第一個子元素有框」推:容器只是包著有框的東西,本身不是那一個有框內容。"""
    if is_bordered_self(node):
        return True
    is_group = node["name"] in title_block["option_group_components"] or any(
        re.search(rf"\brole\s*=\s*['\"]{re.escape(role)}['\"]", node["attrs"]) for role in title_block["option_group_roles"]
    )
    kids = node["children"]
    return is_group and bool(kids) and all(has_any_utility(kid["attrs"], title_block["bordered_utilities"]) for kid in kids)


def matches_title_block(lines, index, tokens):
    """規則 3「標題塊」三種寫法之一 → True;其餘(缺標題、底下不是有框內容、數字不是 8、多帶別的寫死間距)→ False。
    同一行有好幾個元素帶同一個寫死間距時,每一個都要是標題塊才放行。"""
    token_set = set(tokens)
    if len(token_set) != 1 or not token_set <= set(title_block["spacing_utilities"]):
        return False
    (utility,) = token_set
    nodes = nodes_at_line(lines, index, [utility])
    return bool(nodes) and all(title_block_node_ok(node, utility) for node in nodes)


def title_block_node_ok(node, utility):
    attrs = node["attrs"]
    if not re.search(r"\bclass(?:Name)?\s*=", attrs):
        return False
    siblings = node["parent"]["children"] if node["parent"] else []
    at = next((i for i, s in enumerate(siblings) if s is node), -1)
    # 一對一:寫在 {…} 裡(條件 / .map( 產生好幾個)的元素不算這一塊的成員
    if utility == "gap-2":
        kids = node["children"]
        return (
            has_utility(attrs, "flex") and has_utility(attrs, "flex-col")
            and len(kids) == 2 and not any(kid["in_expr"] for kid in kids)
            and is_heading_row(kids[0]) and is_bordered_node(kids[1])
            and kids[1]["start_line"] - kids[0]["end_line"] <= nearby_limit
        )
    if node["in_expr"] or at < 0:
        return False
    if utility == "mb-2":
        if not is_heading_row(node) or at + 1 >= len(siblings):
            return False
        nxt = siblings[at + 1]
        # 同一段距離只由一邊給:下一個兄弟再帶 mt-2 = 疊成 16
        return (
            not nxt["in_expr"] and not has_utility(nxt["attrs"], "mt-2") and is_bordered_node(nxt)
            and nxt["start_line"] - node["end_line"] <= nearby_limit
        )
    if utility == "mt-2":
        if not is_bordered_node(node) or at == 0:
            return False
        prev = siblings[at - 1]
        return (
            not prev["in_expr"] and not has_utility(prev["attrs"], "mb-2") and is_heading_row(prev)
            and node["start_line"] - prev["end_line"] <= nearby_limit
        )
    return False


def matches_spec_registered_pattern(lines, index, line, tokens):
    if not re.search(r"\bclass(?:Name)?\s*=", line):
        return False
    token_set = set(tokens)
    window = nearby_window(lines, index)
    for pattern in spec_patterns:
        if not all(has_utility(line, utility) for utility in pattern["utilities"]):
            continue
        if "utilities_any" in pattern and not has_any_utility(line, pattern["utilities_any"]):
            continue
        if "utilities_none" in pattern and has_any_utility(line, pattern["utilities_none"]):
            continue
        if "magic_tokens_exact" in pattern and token_set != set(pattern["magic_tokens_exact"]):
            continue
        if "magic_tokens_subset" in pattern and not token_set <= set(pattern["magic_tokens_subset"]):
            continue
        if "same_line_any" in pattern and not any(re.search(rx, line) for rx in pattern["same_line_any"]):
            continue
        if "nearby_all" in pattern and not all(needle in window for needle in pattern["nearby_all"]):
            continue
        if "nearby_components" in pattern:
            found = sum(
                len(re.findall(rf"<{re.escape(component)}\b", window))
                for component in pattern["nearby_components"]
            )
            if found < pattern["nearby_min"]:
                continue
        if "ancestor_any" in pattern and not has_open_ancestor(
            lines, index, pattern["ancestor_any"], pattern["ancestor_line_limit"]
        ):
            continue
        if "direct_children_all" in pattern:
            owners = nodes_at_line(lines, index, list(token_set))
            if not owners or any(
                len(owner["children"]) < pattern["direct_children_min"]
                or any(kid["name"] not in pattern["direct_children_all"] for kid in owner["children"])
                for owner in owners
            ):
                continue
        return True
    return False


def is_canonical_micro_line(lines, index):
    if index < 0 or index >= len(lines):
        return False
    line = lines[index]
    tokens = magic_token_re.findall(line)
    if not tokens:
        return False
    if matches_spec_registered_pattern(lines, index, line, tokens):
        return True
    if matches_title_block(lines, index, tokens):
        return True
    if any(token not in allowed_gaps for token in tokens):
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
