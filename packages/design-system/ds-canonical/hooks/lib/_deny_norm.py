#!/usr/bin/env python3
# _deny_norm.py —— deny 正規化的唯一一份(BP-INFRA2 第 3 條;BLUEPRINT §b2「同一判斷的第二份」、process-audit 根因 6)
#
# 內容:把一則 Bash 指令拆成子指令,展開同一則裡定義的函式 / 變數、sh -c / bash -c / eval 的內層,
#   還原 git -C / -c / --git-dir 等、env 前綴、絕對路徑、反斜線之後,逐條比對 claude-settings-base.json 的 permissions.deny;
#   以及「同一個動作」的鍵(git switch -c/-C 視同 checkout -b/-B,-q 不計)。
#   下面「── deny 規則比對」到 action_keys 為止,原是 ledger.v2.py 第 184–436 行逐位元組搬過來的。
# 出處:交接 scripts/bin/deny-norm.py(sha256 624e6472…)由 PROC-H 原樣搬進 repo(該 commit 只搬不改);
#   之後只在這裡改。2026-11-21 PROC-H 補的兩處(RV-BPI2-DENY-ALIAS,判定表 P07 / P08):
#   (1) `git -c alias.<名>=<值> <名> …` —— 用 -c 臨時定義別名繞過子指令名;還原時把別名換回原值(`!` 開頭 = shell 指令)。
#   (2) 指令名寫成指令替換:`$(command -v git)`、`` `which git` ``、`$(type -p git)` —— 先換回名字再拆子指令。
#   已知看不到的(照實列):寫在 ~/.gitconfig 或同一則裡 `git config alias.x …` 定義的別名、函式回傳的指令名。
# 使用者(都讀這一份,不准再抄):
#   - packages/design-system/ds-canonical/hooks/check_bash_command_shape.sh(PreToolUse Bash):呼叫本檔的 `hook` 子指令。
#   - packages/design-system/ds-canonical/hooks/check_solo_workflow.sh R1:呼叫 `check` 子指令拿正規化後的子指令。
#   - 交接的流程工具(ledger 的「換寫法」判定)若要用,讀 repo 這一份(rules/work-process.md:流程與工具住在 repo)。
# 判定表(唯一一份):packages/design-system/ds-canonical/hooks/tests/fixtures/deny-norm/cases.json;
#   hook 測試 test_check_bash_command_shape.sh 經 `selftest --via both` 跑它。
#
# 用法(Bash 第一行先 emulate sh):
#   python3 -I _deny_norm.py check --deny-file <claude-settings-base.json> < 指令文字
#       → JSON {literal:[…], normalized:[…], canon:[[原子指令, 正規化後]…], actions:[…]};結束碼 0
#   python3 -I _deny_norm.py hook --deny-file <claude-settings-base.json> < hook 事件 JSON({tool_name, tool_input:{command}})
#       → 照原樣或正規化後命中 deny:stdout 一行 JSON {decision:"block", rules:[…], normalized:[…]}、結束碼 2;
#         沒命中:{decision:"allow"}、結束碼 0;事件讀不懂 / deny 檔讀不到:結束碼 3(儀器失效;hook 端照 fail-open 規則處理並通知)
#   python3 -I _deny_norm.py selftest [--cases <cases.json>] [--deny-file <…>] [--via lib|hook|both]
#       → 判定表每一格跑一次(lib = 直接呼叫函式,hook = 經 `hook` 子指令的 stdin/stdout,both = 兩個介面都跑、結果要一樣);
#         印 DENY-NORM SELFTEST OK|RED;結束碼 0 / 1;判定表或 deny 檔讀不到 = 2。
#   --deny-file 沒給:判定表檔頭 denyFile(相對 repo 根目錄),讀不到 = 2。
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# 本檔住 packages/design-system/ds-canonical/hooks/lib/;repo 根目錄往上 5 層。
REPO_ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..', '..'))
CASES_DEFAULT = os.path.normpath(os.path.join(HERE, '..', 'tests', 'fixtures', 'deny-norm', 'cases.json'))


# ── deny 規則比對:拿子指令逐條比對 claude-settings-base.json 的 permissions.deny ──────────────
def load_deny(path):
    d = json.load(open(path, encoding='utf-8'))
    rules = []
    for r in d.get('permissions', {}).get('deny', []):
        m = re.match(r'^(\w+)\((.*)\)$', r)
        if not m:
            continue
        tool, pat = m.group(1), m.group(2)
        rx = re.compile('^' + '.*'.join(re.escape(p) for p in pat.split('*')) + '$', re.S)
        rules.append({'rule': r, 'tool': tool, 'pattern': pat, 'rx': rx})
    return rules


def split_subcommands(cmd):
    """未加引號的 ; && || | & 換行 ( ) ` 當分隔;heredoc 內文與 # 註解略過。只求逐條比對,不求完整 shell 語法。"""
    subs, cur, i, n = [], [], 0, len(cmd)
    q = None
    pending_heredoc = []
    while i < n:
        c = cmd[i]
        if q:
            cur.append(c)
            if c == '\\' and q == '"' and i + 1 < n:
                cur.append(cmd[i + 1]); i += 2; continue
            if c == q:
                q = None
            i += 1
            continue
        if c in ('"', "'"):
            q = c; cur.append(c); i += 1; continue
        if c == '\\' and i + 1 < n:
            cur.append(c); cur.append(cmd[i + 1]); i += 2; continue
        if c == '#' and (not cur or cur[-1] in ' \t'):
            while i < n and cmd[i] != '\n':
                i += 1
            continue
        if cmd.startswith('<<', i) and not cmd.startswith('<<<', i):
            m = re.match(r'<<-?\s*([\'"]?)([A-Za-z_][\w]*)\1', cmd[i:])
            if m:
                pending_heredoc.append(m.group(2))
                cur.append(m.group(0)); i += len(m.group(0)); continue
        two = cmd[i:i + 2]
        if two in ('&&', '||'):
            subs.append(''.join(cur)); cur = []; i += 2; continue
        if c in ';|&()`\n':
            subs.append(''.join(cur)); cur = []
            if c == '\n' and pending_heredoc:
                # 跳過 heredoc 內文直到結束字(逐個)
                j = i + 1
                for delim in pending_heredoc:
                    while j < n:
                        k = cmd.find('\n', j)
                        line = cmd[j:k if k != -1 else n]
                        j = (k + 1) if k != -1 else n
                        if line.strip() == delim:
                            break
                pending_heredoc = []
                i = j
                continue
            i += 1
            continue
        cur.append(c)
        i += 1
    subs.append(''.join(cur))
    out = []
    for s in subs:
        s = s.strip().lstrip('!{').strip()
        if s.endswith('$'):
            s = s[:-1].strip()
        if s and s not in ('then', 'do', 'done', 'fi', 'else', '}', 'esac'):
            out.append(s)
    return out


ENV_PREFIX = re.compile(r'^(?:[A-Za-z_]\w*=(?:"[^"]*"|\'[^\']*\'|\S*)\s+)+')
WRAPPER = re.compile(r'^(?:env(?:\s+-\S+)*|command|exec|nohup|time|builtin|xargs(?:\s+-\S+)*|then|do|else)\s+')
GIT_OPT = re.compile(r'^git\s+(?:(?:-C|-c|--git-dir|--work-tree|--namespace)\s+(?:"[^"]*"|\'[^\']*\'|\S+)|(?:--git-dir|--work-tree|--namespace)=\S+|--no-pager|-P|--literal-pathspecs|--no-optional-locks)\s+')
SHELL_C = re.compile(r'^(?:sh|bash|zsh|dash|ksh)(?:\s+-[A-Za-z]+)*\s+-[A-Za-z]*c[A-Za-z]*\s+(.+)$', re.S)
FUNC_DEF = re.compile(r'(?:^|(?<=[\n;&|{(]))\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\s*\)\s*\{\s+(.*?);?\s*\}(?=[ \t]*(?:$|[\n;&|)]))', re.S | re.M)
VAR_DEF = re.compile(r'(?:^|(?<=[\n;&|])|(?<=\s))(?:export\s+)?([A-Za-z_]\w*)=(?:"((?:[^"\\]|\\.)*)"|\'([^\']*)\'|([^\s;&|"\']*))', re.M)
# `git -c alias.co=checkout co …`:-c 臨時定義的別名(值可帶引號;`!` 開頭 = 交給 shell 跑的指令)。
GIT_ALIAS = re.compile(r'''^git\s+-c\s+(?:"alias\.([\w.-]+)=([^"]*)"|'alias\.([\w.-]+)=([^']*)'|alias\.([\w.-]+)=(\S+))\s+''')
# 指令名寫成指令替換:$(command -v git) / `which git` / $(type -p git) / $(whence -p git) —— 換回名字。
CMD_SUBST_NAME = re.compile(
    r'''"?\$\(\s*(?:command\s+-[vV]|which|type\s+-[pP]|whence(?:\s+-p)?)\s+([\w./-]+)\s*\)"?'''
    r'''|`\s*(?:command\s+-[vV]|which|type\s+-[pP]|whence(?:\s+-p)?)\s+([\w./-]+)\s*`''')


def unquote(s):
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in '"\'':
        return s[1:-1]
    return s


def collect_defs(cmd):
    """同一則指令裡定義的函式與變數(函式包裝 `g() { git -C "$R" "$@"; }; g checkout …`、變數包裝 `G="git -C $R"; $G checkout …`)。"""
    funcs, vars_ = {}, {}
    for m in FUNC_DEF.finditer(cmd or ''):
        funcs[m.group(1)] = m.group(2)
    for m in VAR_DEF.finditer(cmd or ''):
        v = m.group(2) if m.group(2) is not None else (m.group(3) if m.group(3) is not None else m.group(4))
        vars_[m.group(1)] = v or ''
    return funcs, vars_


def expand_sub(sub, defs, depth=0):
    """回展開後的子指令清單:首字是本則定義的函式 → 函式本體($@ 換成實參);首字是 $VAR → 變數值。"""
    funcs, vars_ = defs
    s = ENV_PREFIX.sub('', sub.strip())
    if depth > 4 or not s:
        return [sub]
    parts = s.split(None, 1)
    first, rest = parts[0], (parts[1] if len(parts) > 1 else '')
    m = re.match(r'^"?\$\{?([A-Za-z_]\w*)\}?"?$', first)
    if m and m.group(1) in vars_ and vars_[m.group(1)].strip():
        return expand_sub(vars_[m.group(1)] + (' ' + rest if rest else ''), defs, depth + 1)
    if first in funcs:
        out = []
        for b in split_subcommands(funcs[first]):
            b2 = re.sub(r'"\$@"|\$@|"\$\*"|\$\*', lambda _m: rest, b)
            out.extend(expand_sub(b2, defs, depth + 1))
        return out or [sub]
    return [sub]


def normalize_sub(s):
    prev = None
    aliases = {}
    rounds = 0
    while prev != s and rounds < 20:  # 別名互相指(a=b、b=a)時靠輪數上限停下
        rounds += 1
        prev = s
        s = ENV_PREFIX.sub('', s)
        s = WRAPPER.sub('', s)
        # 首字的絕對路徑(/usr/bin/git)、反斜線(\git)、引號("git")
        m = re.match(r'^(\S+)(.*)$', s, re.S)
        if m:
            w = m.group(1)
            w2 = unquote(w.lstrip('\\'))
            if '/' in w2 and not w2.endswith('/') and re.match(r'^[\w./-]+$', w2):
                w2 = w2.rsplit('/', 1)[1]
            s = w2 + m.group(2)
        while GIT_OPT.match(s):
            am = GIT_ALIAS.match(s)
            if am:
                name = am.group(1) or am.group(3) or am.group(5)
                aliases[name] = am.group(2) if am.group(1) else (am.group(4) if am.group(3) else am.group(6))
            s = GIT_OPT.sub('git ', s, count=1)
        if aliases:
            gm = re.match(r'^git\s+(\S+)(.*)$', s, re.S)
            if gm and gm.group(1) in aliases:
                val = aliases[gm.group(1)].strip()
                s = (val[1:] if val.startswith('!') else 'git ' + val) + gm.group(2)
    return s.strip()


def canon_subs(cmd, depth=0, defs=None):
    """回 [(raw_sub, normalized)]:展開本則的函式 / 變數、sh -c / bash -c / eval 的內層,再正規化。"""
    out = []
    if not cmd or depth > 3:
        return out
    cmd = CMD_SUBST_NAME.sub(lambda m: m.group(1) or m.group(2), cmd)
    defs = defs or collect_defs(cmd)
    for raw in split_subcommands(cmd):
        for ex in expand_sub(raw, defs):
            n = normalize_sub(ex)
            m = SHELL_C.match(n)
            if m:
                inner = m.group(1).strip()
                qm = re.match(r'^(["\'])(.*?)\1', inner, re.S)
                inner = qm.group(2) if qm else inner
                out.extend((raw, x) for _, x in canon_subs(inner, depth + 1, defs))
                continue
            if n.startswith('eval '):
                out.extend((raw, x) for _, x in canon_subs(unquote(n[5:]), depth + 1, defs))
                continue
            out.append((raw, n))
    return out


def deny_hits(tool, cmd, rules):
    """回 (literal, normalized):literal = 子指令照原樣命中;normalized = 展開 / 還原成一般寫法後才命中(= 換寫法躲過拼法比對)。"""
    lit, norm = [], []
    if not cmd:
        return lit, norm
    if tool == 'Bash':
        seen = set()
        for sub in split_subcommands(cmd):
            for r in rules:
                if r['tool'] == 'Bash' and r['rx'].match(sub):
                    lit.append({'sub': sub, 'rule': r['rule']})
                    seen.add((sub, r['rule']))
        for raw, n in canon_subs(cmd):
            for r in rules:
                if r['tool'] != 'Bash' or (raw, r['rule']) in seen:
                    continue
                if r['rx'].match(n):
                    norm.append({'sub': raw, 'normalized': n, 'rule': r['rule']})
                    seen.add((raw, r['rule']))
    else:
        for r in rules:
            if r['tool'] == tool and r['rx'].match(os.path.expanduser(cmd)):
                lit.append({'sub': cmd, 'rule': r['rule']})
    return lit, norm


# ── 「同一個動作」比對(所有擋法共用)────────────────────────────────────────
TRIVIAL = {'cd', 'echo', 'printf', 'true', 'false', 'set', 'export', 'emulate', 'cat', 'ls', 'test', '[', 'exit', ':', 'wc', 'head',
           'tail', 'grep', 'date', 'pwd', 'sort', 'uniq', 'tr', 'cut', 'basename', 'dirname', 'which', 'type', 'mkdir', 'readlink',
           'stat', 'return', 'local', 'unset', 'shift', 'read'}


def action_key(n):
    w = [unquote(x) for x in n.split()]
    if not w:
        return ''
    if w[0] == 'git' and len(w) > 1 and w[1] == 'switch':
        rest = w[2:]
        mapped = ['git', 'checkout']
        for x in rest:
            mapped.append({'-c': '-b', '--create': '-b', '-C': '-B', '--force-create': '-B'}.get(x, x))
        w = mapped
    w = [x for x in w if x not in ('-q', '--quiet')]
    return ' '.join(w)


READONLY_GIT = {'status', 'log', 'rev-parse', 'diff', 'show', 'ls-files', 'ls-tree', 'cat-file', 'merge-base', 'describe', 'rev-list', 'blame',
                'shortlog', 'for-each-ref', 'grep', 'count-objects', 'var', 'check-ignore', 'reflog', 'name-rev', 'show-ref', 'version', 'help'}
READONLY_CMDS = {'uptime', 'sysctl', 'ps', 'df', 'du', 'file', 'shasum', 'sha256sum', 'sha1sum', 'md5', 'cmp', 'diff', 'jq', 'nl', 'od', 'xxd',
                 'hexdump', 'printenv', 'id', 'whoami', 'hostname', 'sw_vers', 'uname', 'less', 'more', 'column', 'awk', 'realpath', 'seq'}


def is_readonly(n):
    w = n.split()
    if not w:
        return True
    f = w[0]
    if f in TRIVIAL or f in READONLY_CMDS:
        return True
    if f == 'sed':
        return ' -i' not in n
    if f == 'find':
        return not re.search(r'\s-(?:delete|exec|execdir|ok)\b', n)
    if f == 'git' and len(w) > 1:
        sub = w[1]
        if sub in READONLY_GIT:
            return True
        if sub == 'config':
            return any(x in w for x in ('--get', '--list', '-l', '--get-all'))
        if sub == 'branch':
            return len(w) == 2 or w[2] in ('--show-current', '-a', '-r', '--list', '-v', '-vv', '--contains', '--merged')
    return False


def action_keys(cmd, significant=False):
    """子指令的「動作」集合(展開 / 正規化後;-q 不計、switch -c/-C 視同 checkout -b/-B)。
    瑣碎指令(cd / echo …)、`2>&1` 拆出來的片段一律不算;significant=True 再拿掉唯讀指令(git status、git log …)。"""
    keys = set()
    for raw, n in canon_subs(cmd):
        first = n.split()[0] if n.split() else ''
        if not first or first in TRIVIAL or re.match(r'^[A-Za-z_]\w*=|^[\d<>]', first):
            continue
        if first == 'sed' and ' -i' not in n:
            continue
        if significant and is_readonly(n):
            continue
        keys.add(action_key(n))
    return keys




# ── 介面(本檔新增;判定都在上面那段)──────────────────────────────────────────

def check(cmd, rules):
    lit, norm = deny_hits('Bash', cmd, rules)
    return {'literal': lit, 'normalized': norm, 'canon': [[r, n] for r, n in canon_subs(cmd)], 'actions': sorted(action_keys(cmd))}


def hook_decide(event, rules):
    """PROC-H hook 的判定:回 (結束碼, 輸出 dict)。只看 Bash;照原樣或正規化後命中任一條 deny → block。"""
    if not isinstance(event, dict):
        return 3, {'decision': 'instrument', 'why': '事件不是 JSON 物件'}
    if event.get('tool_name') != 'Bash':
        return 0, {'decision': 'allow', 'why': '不是 Bash'}
    cmd = (event.get('tool_input') or {}).get('command')
    if not isinstance(cmd, str):
        return 3, {'decision': 'instrument', 'why': 'tool_input.command 不是字串'}
    lit, norm = deny_hits('Bash', cmd, rules)
    if lit or norm:
        return 2, {'decision': 'block', 'rules': sorted({h['rule'] for h in lit + norm}),
                   'literal': [h['sub'] for h in lit], 'normalized': [h.get('normalized') for h in norm]}
    return 0, {'decision': 'allow'}


def default_deny_file(table):
    return os.path.join(REPO_ROOT, table['denyFile'])


def run_cases(table, rules, via, deny_file):
    """回 (失敗清單, 格數)。每格 {id, cmd, lit:[規則], norm:[規則], actions?:[…]};hook 介面另驗 decision。"""
    fails = []
    for c in table['cases']:
        want_lit, want_norm = sorted(c.get('lit', [])), sorted(c.get('norm', []))
        got = {}
        if via in ('lib', 'both'):
            lit, norm = deny_hits('Bash', c['cmd'], rules)
            got['lib'] = (sorted({h['rule'] for h in lit}), sorted({h['rule'] for h in norm}))
            if got['lib'] != (want_lit, want_norm):
                fails.append('%s lib:lit=%s norm=%s(要 %s / %s)' % (c['id'], got['lib'][0], got['lib'][1], want_lit, want_norm))
            if 'actions' in c and sorted(action_keys(c['cmd'])) != sorted(c['actions']):
                fails.append('%s actions:%s(要 %s)' % (c['id'], sorted(action_keys(c['cmd'])), sorted(c['actions'])))
        if via in ('hook', 'both'):
            ev = json.dumps({'tool_name': 'Bash', 'tool_input': {'command': c['cmd']}}, ensure_ascii=False)
            r = subprocess.run([sys.executable, '-I', os.path.abspath(__file__), 'hook', '--deny-file', deny_file],
                               input=ev, capture_output=True, text=True)
            try:
                out = json.loads(r.stdout.strip().splitlines()[-1])
            except (ValueError, IndexError):
                fails.append('%s hook:輸出讀不懂(rc=%d)%s' % (c['id'], r.returncode, r.stderr[:120]))
                continue
            want_block = bool(want_lit or want_norm)
            want_rc = 2 if want_block else 0
            if r.returncode != want_rc or (out.get('decision') == 'block') != want_block:
                fails.append('%s hook:rc=%d decision=%s(要 rc=%d)' % (c['id'], r.returncode, out.get('decision'), want_rc))
            elif want_block and sorted(out.get('rules', [])) != sorted(set(want_lit + want_norm)):
                fails.append('%s hook:rules=%s(要 %s)' % (c['id'], out.get('rules'), sorted(set(want_lit + want_norm))))
    return fails, len(table['cases'])


def main(argv):
    if not argv or argv[0] not in ('check', 'hook', 'selftest'):
        sys.stderr.write('usage: deny-norm.py check|hook|selftest [--deny-file F] [--cases F] [--via lib|hook|both]\n')
        return 2
    sub, rest = argv[0], argv[1:]
    opt = {}
    i = 0
    while i < len(rest):
        if rest[i].startswith('--') and i + 1 < len(rest):
            opt[rest[i][2:]] = rest[i + 1]
            i += 2
        else:
            sys.stderr.write('deny-norm:看不懂的參數 %s\n' % rest[i])
            return 2
    bad_rc = 3 if sub == 'hook' else 2
    try:
        table = None
        if sub == 'selftest' or not opt.get('deny-file'):
            table = json.load(open(opt.get('cases') or CASES_DEFAULT, encoding='utf-8'))
        deny_file = opt.get('deny-file') or default_deny_file(table)
        rules = load_deny(deny_file)
        if not any(r['tool'] == 'Bash' for r in rules):
            raise ValueError('deny 檔讀到 0 條 Bash 規則:%s' % deny_file)
        if sub == 'selftest' and table.get('denySha256'):
            import hashlib
            got = hashlib.sha256(open(deny_file, 'rb').read()).hexdigest()
            if got != table['denySha256']:
                raise ValueError('deny 檔 sha256 %s… ≠ 判定表記的 %s…(期望值只對那一份 deny 清單成立;改 deny 清單要同時改判定表)'
                                 % (got[:12], table['denySha256'][:12]))
    except Exception as e:  # noqa: BLE001 —— 讀不到判定表 / deny 檔 = 儀器失效,不讀成「沒命中」
        sys.stderr.write('DENY-NORM INSTRUMENT %s\n' % e)
        if sub == 'hook':
            print(json.dumps({'decision': 'instrument', 'why': str(e)[:200]}, ensure_ascii=False))
        return bad_rc
    if sub == 'check':
        print(json.dumps(check(sys.stdin.read(), rules), ensure_ascii=False))
        return 0
    if sub == 'hook':
        try:
            ev = json.loads(sys.stdin.read())
        except ValueError as e:
            print(json.dumps({'decision': 'instrument', 'why': '事件 JSON 讀不懂:%s' % e}, ensure_ascii=False))
            return 3
        rc, out = hook_decide(ev, rules)
        print(json.dumps(out, ensure_ascii=False))
        return rc
    via = opt.get('via', 'both')
    fails, n = run_cases(table, rules, via, deny_file)
    for f in fails:
        print('  BAD ' + f)
    print('DENY-NORM SELFTEST %s 判定表 %d 格(via=%s,deny=%s)' % ('RED' if fails else 'OK', n, via, os.path.basename(deny_file)))
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
