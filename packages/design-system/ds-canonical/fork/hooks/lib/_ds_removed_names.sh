#!/bin/bash
# _ds_removed_names.sh —— 「DS 曾刪除或改名、目前不存在的名字」判定(helper,由 check_consumer_code_quality.sh source;
# 底線開頭 = 不是獨立 hook、不註冊 event,不算 hook 數)。
#
# 擋什麼:消費端的程式(apps/<app>/src 或 src 底下的 .ts / .tsx / .js / .jsx / .mjs / .cjs / .css)與文件(docs/**/*.md、
# governance/overlay.md)寫出 DS 曾刪除或改名的名字 —— 出口名、CSS 變數、@utility class、元件參數(`<元件 … 參數=`)、子路徑。
# 訊息附新名、做法與規格段落(都來自變更帳本)。
#
# 為什麼(2026-11-16,user 2026-11-15:「主要其實也是讓要更新的消費者，通常會是 AI ，可以很清楚明確知道新版增刪改了什麼可以避免breaking change ，
# 也可以更有效率更準確地直接符合新的ds的規範和原則」):typecheck 只看得到 TS 介面;CSS 變數、class、文件裡的舊名它看不到,
# AI 憑訓練資料或舊筆記寫出舊名時也要當場被擋並被告知新名。
#
# 名單只來自 runner 驗過的 corpus,不讀消費端可改的 node_modules(信任邊界同 utility-registry):
#   - DS 作者 repo:corpus 裡的變更帳本 packages/design-system/ds-changes.json,由唯一實作 tools/changes/ledger.mjs
#     (removedNamesDocument)當場投影;
#   - fork:scripts/build-fork-governance.mjs 把同一支投影預先寫成 corpus 的 references/ds-removed-names.json,
#     並用 applyTransform 把下面 governance_ds_removed_names_document 的兩行改寫成讀那個檔(fork 不帶帳本工具)。
# 「目前不存在」由帳本判:之後沒有同名的 behavior 條目、to 不是它自己。
#
# 不擋(decoy):註解;「…」『…』引文;出口名與參數只比程式本體(字串裡的引文不算),CSS 變數與 class 在字串裡也算(那就是用法);
# 程式檔沒有 import @qijenchen/design-system 時不比出口名(別人的同名函式)。

# 名單 JSON 印到 stdout。讀不到 / 不安全 → 非 0(呼叫端判儀器失效,不當成「沒有舊名」)。
governance_ds_removed_names_document() {
  local CORPUS_ROOT="$1"
  local source="$CORPUS_ROOT/references/ds-removed-names.json"
  if [ -L "$source" ] || [ ! -f "$source" ] || [ ! -r "$source" ]; then
    printf 'GOVERNANCE_INTEGRITY: removed-names source is unavailable or unsafe:%s\n' "$source" >&2
    return 70
  fi
  cat "$source"
}

# 用法:governance_ds_removed_names_scan <檔案絕對路徑> <code|doc> <corpus root>
# 有舊名 → 報告印到 stdout、回 2;沒有 → 回 0;名單或檔案讀不到 → 回 70。
governance_ds_removed_names_scan() {
  local file_path="$1" kind="$2" corpus_root="$3" document
  document=$(governance_ds_removed_names_document "$corpus_root") || return 70
  DS_REMOVED_NAMES_DOCUMENT="$document" python3 - "$file_path" "$kind" <<'PY'
import json, os, re, sys

file_path, kind = sys.argv[1], sys.argv[2]
try:
    doc = json.loads(os.environ['DS_REMOVED_NAMES_DOCUMENT'])
    names = doc['names']
    assert doc.get('schemaVersion') == 1 and isinstance(names, list)
    assert all(isinstance(n, dict) and n.get('kind') in ('export', 'token', 'class', 'prop', 'subpath') and isinstance(n.get('name'), str) and n['name'] for n in names)
except Exception as error:  # 名單壞了 = 儀器失效,不當成「沒有舊名」
    print(f'GOVERNANCE_INTEGRITY: removed-names list is invalid: {error}', file=sys.stderr)
    sys.exit(70)
try:
    text = open(file_path, encoding='utf-8').read()
except Exception as error:
    print(f'GOVERNANCE_INTEGRITY: removed-names target unreadable: {error}', file=sys.stderr)
    sys.exit(70)

def blank(segment):
    return re.sub(r'[^\n]', ' ', segment)

def strip_script(source):
    """註解換成空白(行數不變);回 (保留字串的本體, 字串也換成空白的本體)。"""
    body, bare, i, n = [], [], 0, len(source)
    while i < n:
        if source.startswith('//', i):
            j = source.find('\n', i); j = n if j < 0 else j
            body.append(blank(source[i:j])); bare.append(blank(source[i:j])); i = j
        elif source.startswith('/*', i):
            j = source.find('*/', i + 2); j = n if j < 0 else j + 2
            body.append(blank(source[i:j])); bare.append(blank(source[i:j])); i = j
        elif source[i] in '"\'`':
            quote, j = source[i], i + 1
            while j < n and source[j] != quote:
                if source[j] == '\\':
                    j += 2
                    continue
                if quote != '`' and source[j] == '\n':
                    break
                j += 1
            j = min(j + 1, n)
            body.append(source[i:j]); bare.append(blank(source[i:j])); i = j
        else:
            body.append(source[i]); bare.append(source[i]); i += 1
    return ''.join(body), ''.join(bare)

quoted = re.compile(r'「[^」]*」|『[^』]*』')
if kind == 'doc':
    body = re.sub(r'<!--.*?-->', lambda m: blank(m.group(0)), text, flags=re.S)
    bare = body = quoted.sub(lambda m: blank(m.group(0)), body)
elif file_path.endswith('.css'):
    body = bare = re.sub(r'/\*.*?\*/', lambda m: blank(m.group(0)), text, flags=re.S)
else:
    body, bare = strip_script(text)
    body = quoted.sub(lambda m: blank(m.group(0)), body)
is_css = file_path.endswith('.css')
imports_ds = bool(re.search(r'''(?:from|import|require\()\s*['"]@qijenchen/design-system(?:/[^'"]*)?['"]''', text))

hits = []
for entry in names:
    name, k = entry['name'], entry['kind']
    if k == 'export':
        if is_css or (kind == 'code' and not imports_ds):
            continue
        pattern, source = r'(?<![\w$.])' + re.escape(name) + r'(?![\w$])', bare if kind == 'code' else body
    elif k == 'token':
        pattern, source = r'(?<![\w-])' + re.escape(name) + r'(?![\w-])', body
    elif k == 'class':
        if kind == 'doc':
            continue
        pattern, source = r'(?<![\w-])' + re.escape(name) + r'(?![\w-])', body
    elif k == 'subpath':
        pattern, source = re.escape(name) + r'(?![\w/-])', body
    else:  # prop:`<元件 … 參數` 才算(同名參數在別的元件合法)
        if is_css or not isinstance(entry.get('component'), str):
            continue
        pattern = r'<' + re.escape(entry['component']) + r'(?![\w$.])[^<>]*?(?<![\w$.-])' + re.escape(name) + r'(?=\s*=|\s|/?>)'
        source = bare if kind == 'code' else body
    for match in re.finditer(pattern, source):
        line = source.count('\n', 0, match.start()) + 1
        hits.append((line, entry))

if not hits:
    sys.exit(0)
hits.sort(key=lambda hit: hit[0])
print('GOV-DS-REMOVED-NAMES-001: DS 已移除 / 改名的名字(名單來源:@qijenchen/design-system 的 ds-changes.json)')
print(f'  File: {file_path}')
for line, entry in hits[:20]:
    label = f"<{entry['component']} {entry['name']}>" if entry['kind'] == 'prop' else entry['name']
    to = f" → 改用 {entry['to']}" if entry.get('to') else ''
    spec = entry.get('spec') or ''
    ref = re.match(r'^([^「」\s]+)「([^「」]+)」$', spec)
    spec_text = f"node_modules/@qijenchen/design-system/{ref.group(1)}「{ref.group(2)}」" if ref else spec
    print(f"  - :{line} {label}({entry['kind']},{entry.get('since', '?')} 起{('改名' if entry.get('to') else '移除')}){to}")
    print(f"      做法:{entry.get('do', '')}")
    print(f"      規格:{spec_text}(條目 {entry.get('id', '?')})")
if len(hits) > 20:
    print(f'  …還有 {len(hits) - 20} 處')
print('  升版請跑 `npx qijenchen-ds-codemod upgrade`(自動改帶 fix 的條目並列出其餘);規則一律以套件裡的規格為準。')
sys.exit(2)
PY
}
