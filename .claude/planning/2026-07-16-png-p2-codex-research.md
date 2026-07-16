# PNG P2.1 — Codex surface 研究報告(2026-07-16,官方文件 + live 實測)

**方法**:每一宣稱 = 官方文件 verbatim(WebFetch 當日)**或** live 實測(codex-cli **0.144.5**,`node_modules/.bin/codex`,本 repo 已在 `~/.codex/config.toml` 標 `trust_level = "trusted"`)。摘要式 fetch 有 summarizer 幻覺風險 → 關鍵宣稱全部二次 verbatim re-fetch 或 live 驗(M26);一處 summarizer 假宣稱已抓出並丟棄(見 Q4)。

**官方站點**:`https://developers.openai.com/codex` → **308 permanent redirect** → `https://learn.chatgpt.com/docs`。文件路徑家族 = `https://learn.chatgpt.com/codex/...`(部分頁 `/docs/...` alias 也通)。

---

## Q1 Skills — **支援 repo-level discovery,live PASS**

**官方文件說**(https://learn.chatgpt.com/codex/build-skills):
- Discovery 四層:「Codex reads skills from repository, user, admin, and system locations」= `$CWD/.agents/skills` + `$REPO_ROOT/.agents/skills`(repo 層)/ `$HOME/.agents/skills`(user)/ `/etc/codex/skills`(admin)+ OpenAI bundled system skills。
- 格式:`<dir>/SKILL.md` + frontmatter 必填 `name` / `description`;可選 `scripts/`、`references/`、`assets/`、`agents/openai.yaml`。**與 Claude Code SKILL.md 同構**。
- 觸發:顯式 `$skill-name` / `/skills`;隱式靠 description 匹配。
- 與 AGENTS.md **無**直接關係(獨立機制)。
- 可用面:ChatGPT desktop app / Codex CLI / IDE extension(cloud 未明文)。

**Live 實測**(probe B,fixture `.agents/skills/png-probe/SKILL.md` at repo root):
- codex exec 列 skills → **`design-system:png-probe` 出現** = repo-level discovery 生效。
- Namespace 前綴 `design-system:` 來自 **git remote repo 名**(`ajenchen/design-system.git`),非 package.json name(實為 `ui-playground`)、非目錄名(`my-project`)。
- 同列 bundled(imagegen / openai-docs / skill-creator…)+ plugin skills(browser / computer-use…)。
- 隱式觸發與 `$invoke` 未實測(discovery 已證,invocation 留 P2.2 需要時再測)。

**對 PNG**:**Certified-equivalent 路徑成立(local CLI)**。P2.2 可生成 `.agents/skills/`(如 second-opinion driver skill),格式與 Claude skills 同構 → 投影器可從 `.claude/skills/` 轉換。

## Q2 Hooks — **支援 repo-level `.codex/hooks.json`,可 block,live PASS;但有獨立 hook-trust 閘**

**官方文件說**(https://learn.chatgpt.com/codex/hooks + config-reference):
- 位置:「Codex discovers hooks next to active config layers」= `~/.codex/hooks.json` / `~/.codex/config.toml` `[hooks]` / **`<repo>/.codex/hooks.json`** / `<repo>/.codex/config.toml`。
- **10 events**(config-reference verbatim):`PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `Stop`。schema 與 Claude Code hooks **同構**(matcher + hooks[] + type:command;`Bash` / `Edit|Write` / `mcp__*` matcher)。目前僅 command handler(「prompt and agent hook handlers are parsed but skipped」)。
- **Block 能力**:PreToolUse 回 `"permissionDecision": "deny"` 或「exit code 2 and write the blocking reason to stderr」;PermissionRequest `"behavior": "deny"`;PostToolUse / UserPromptSubmit `"decision": "block"`。
- **Trust 雙閘**:(1)「Project-local hooks load only when the project `.codex/` layer is trusted」(2)**per-hook hash trust**:「Before a non-managed command hook can run, Codex requires you to review and trust the exact hook definition」「Codex records trust against the hook's current hash, so new or changed hooks are marked for review and skipped until trusted」— TUI `/hooks` 審核;或 `codex exec --dangerously-bypass-hook-trust`(「Run enabled hooks without requiring persisted hook trust for this invocation」)。
- 開關:default on;`[features] hooks = false` 關(`codex features list` 實測 `hooks stable true`)。
- Cloud / IDE 可用性:**未明文**。

**Live 實測**(probe B/C,fixture `.codex/hooks.json` + `.codex/hooks/png-probe-deny.sh`):
- **無 hook-trust 時 silently skipped**(probe B:SessionStart 無 marker、PreToolUse 無 stdin log、指令未被擋)— 非互動 exec 不會提示,**靜默跳過** = fail-open 陷阱。
- 加 `--dangerously-bypass-hook-trust`(probe C):**SessionStart fired**(marker 寫入)+ **PreToolUse fired 且 exit 2 成功 block**,codex 回報原文「Command blocked by PreToolUse hook: PNG-PROBE-DENY: blocked by repo-level .codex hook」。
- stdin payload 實錄(Claude-compatible):`{"session_id","turn_id","transcript_path","cwd","hook_event_name":"PreToolUse","model":"gpt-5.6-sol","permission_mode":"bypassPermissions","tool_name":"Bash","tool_input":{"command":"echo PNG_PROBE_MAGIC"},"tool_use_id"}`。

**對 PNG**:**Certified-equivalent 路徑成立(local CLI)但帶條件**:自動化(codex-run-guarded)須 (a) 加 `--dangerously-bypass-hook-trust`(user 已 authorize bypass-sandbox 前例,此 flag 需 user 拍板)或 (b) user 在 TUI `/hooks` 一次性 trust(hash-bound,hook 檔一改就要重 trust → 生成器每次 regen 都會 invalidate)。**hook 靜默跳過 = 不可作信任邊界**(對齊 ADR-3:blocking 由 preflight/CI 兜底,hooks 是加速器)。

## Q3 Project config — **支援 repo `.codex/config.toml`(trusted 才載)**

**官方文件說**(https://learn.chatgpt.com/codex/config-file/config-advanced + config-reference):
- 「Codex reads project-scoped overrides from `.codex/config.toml` files inside your repo」;沿目錄層級全部載入,**closest wins**(同 key 近者勝)。
- Trust:`projects.<path>.trust_level = "trusted"|"untrusted"`;「Untrusted projects skip project-scoped `.codex/` layers, including project-local config, hooks, and rules」;user/system 層照常載。
- 敏感 key **禁 project-level override**:`openai_base_url`、`model_provider`、`model_providers`、credential 類 — 只能 user-level。
- 本 repo 現況:已 trusted(`~/.codex/config.toml` L49-50,live 查證)。

**Bonus — Rules(execpolicy)**(https://learn.chatgpt.com/codex/agent-configuration/rules):
- `<repo>/.codex/rules/*.rules`(trusted 才載)+ `~/.codex/rules/default.rules`;**Starlark** `prefix_rule(pattern, decision = allow|prompt|forbidden, justification, match/not_match)`;多 rule 命中取最嚴(`forbidden` > `prompt` > `allow`);「Use rules to control which commands Codex can run outside the sandbox」。
- Live 佐證:`codex exec --ignore-rules` flag 存在(「Do not load user or project execpolicy `.rules` files」)。fixture 未實測(rules 管 sandbox 外命令核准;我們 exec 走 bypass-sandbox,行為交互未定 → 留待需要時測)。

**對 PNG**:repo 可帶 `.codex/config.toml` + `.codex/rules/`,P2.2 生成器可用;**前提 = consumer 把 repo 標 trusted**(setup 文件必寫;fork/template 的 cli-init doctor 可驗 `codex doctor` config loaded)。

## Q4 Cloud / IDE — **cloud 只有 AGENTS.md 有明文;其餘 Uncertified**

**官方文件說**:
- Cloud(https://learn.chatgpt.com/codex/environments/cloud-environment)verbatim 全掃:**唯一** repo-config 明文 =「If your repo includes `AGENTS.md`, the agent uses it to find project-specific lint and test commands」;`.codex` / hooks / rules / skills / `.agents` / config.toml **全部 not mentioned**。另:setup scripts 與 agent 分 session(`export` 不延續,要寫 `~/.bashrc` 或 env settings)。
- ⚠️ 誠實記錄:第一次摘要式 fetch 曾回「cloud 載 .codex/config.toml + hooks + rules + .agents/skills」— **verbatim re-fetch 證實為 summarizer 幻覺,已丟棄**。此為「摘要 fetch 不可直接入帳」的 M26 實錘案例。
- IDE(https://learn.chatgpt.com/codex/ide):頁面未明文列 repo-level config 載入清單;skills 文件宣稱 IDE extension 可用 skills;hooks 的 IDE 可用性未明文。Rules 文件宣稱「Rules function across Codex CLI, IDE extensions, and cloud environments」(單頁宣稱,未交叉驗)。

**對 PNG**:**Codex cloud / IDE = Uncertified**(除 cloud AGENTS.md 一項有官方明文,可標 documented-but-untested)。對齊 ADR-5 三態:只有實測證據能升級;P4.4 排程 cloud clean-room 後再議。

## Q5 AGENTS.md 進階 — **discovery chain + override 語意明確(官方),root 載入 live PASS**

**官方文件說**(https://learn.chatgpt.com/codex/agent-configuration/agents-md;`/docs/agent-configuration/agents-md` alias 同內容):
- Chain:(1) global `~/.codex/AGENTS.override.md` → fallback `~/.codex/AGENTS.md`(取第一個非空)(2) git root 往 cwd 逐層走,每層取一個:`AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames`(3) root→下串接,**近者後讀 = 覆蓋先前指引**。
- `AGENTS.override.md` = 「a temporary global override without deleting the base file」;任一層都優先於同層 AGENTS.md;刪除即回復。
- Cap:`project_doc_max_bytes` 預設 **32 KiB**(超過即停止累加);空檔 skip;fallback 檔名可設(如 `TEAM_GUIDE.md`)。

**Live 實測**(probe A):codex exec 於本 repo,問「session 載入哪些專案級 instructions 檔」→ 答**只有** `<repo>/AGENTS.md`(`~/.codex/AGENTS.md` 不存在故無 global 層;`.claude/rules` / CLAUDE.md 不在 codex chain — 符合預期,rules 靠 AGENTS.md Rule Index 指路)。

**對 PNG**:P1 架構(AGENTS.md canonical + Rule Index 指路)**已 live 驗證成立**。Nested per-package AGENTS.md 可日後用於 monorepo 分區指引(closest-wins);`AGENTS.override.md` 勿入 repo(語意 = 暫時性覆蓋)。

---

## Certified Surface Registry 素材(P2.5 直接消費)

| Surface | 狀態 | 證據 |
|---|---|---|
| Codex CLI local — AGENTS.md discovery | **Certified-equivalent** | probe A(/tmp/png-p2-probe-a-out.txt)+ 官方 agents-md 頁 |
| Codex CLI local — repo skills `.agents/skills/` | **Certified-equivalent** | probe B(`design-system:png-probe` 列出)+ build-skills 頁 |
| Codex CLI local — repo hooks `.codex/hooks.json`(含 exit-2 block) | **Certified-equivalent(條件:hook-trust — TUI `/hooks` 一次 trust 或 exec 加 `--dangerously-bypass-hook-trust`)** | probe C(SessionStart marker + PreToolUse block 原文)+ hooks 頁 |
| Codex CLI local — repo `.codex/config.toml` / `.codex/rules/` | documented + flag 佐證,fixture 未測 | config-advanced / rules 頁 + `--ignore-rules` flag |
| Codex cloud — AGENTS.md | documented-but-untested | cloud-environment 頁 verbatim |
| Codex cloud — hooks / rules / skills / config | **Uncertified**(官方無明文) | cloud-environment 頁 verbatim 全掃 not-mentioned |
| Codex IDE — 全部 | **Uncertified**(skills/rules 有單頁宣稱,未測) | ide / build-skills / rules 頁 |

## 實測 artifacts + 注意事項

- Probe 產物:`/tmp/png-p2-probe-{a,b,c}{-out.txt,.log,.md}`、`/tmp/png-p2-sessionstart-fired.txt`、`/tmp/png-p2-pretooluse-input.jsonl`。
- Probe fixtures(`.codex/hooks.json` + `.codex/hooks/png-probe-deny.sh` + `.agents/skills/png-probe/SKILL.md`)曾被背景 codex driver 的 commit `f0df0151` 順手掃入 → 已以 pathspec-limited commit 移除(P2.2 將生成正式版,generated banner + digest)。
- 本 repo Claude-side hook `check_codex_brief_invariants.sh` 會攔非稽核用途的裸 `codex exec` 呼叫;discovery probe 類非稽核 brief 需 `// @codex-brief-invariant-skip: <rationale>` escape(本次已用,rationale = capability probe 非稽核)。
- codex exec 非互動模式對 untrusted hooks = **靜默跳過**(無 warning 於 exec 輸出)— PNG 任何「hooks 已生效」宣稱必配 marker-file 實測,禁只看 config 存在。

## URL 全列

1. https://developers.openai.com/codex(308 → learn.chatgpt.com/docs)
2. https://learn.chatgpt.com/docs(導航索引)
3. https://learn.chatgpt.com/codex/agent-configuration/agents-md(+ `/docs/agent-configuration/agents-md` alias)
4. https://learn.chatgpt.com/codex/hooks
5. https://learn.chatgpt.com/codex/build-skills
6. https://learn.chatgpt.com/codex/config-file/config-advanced
7. https://learn.chatgpt.com/codex/config-file/config-reference
8. https://learn.chatgpt.com/codex/agent-configuration/rules
9. https://learn.chatgpt.com/codex/cloud
10. https://learn.chatgpt.com/codex/environments/cloud-environment
11. https://learn.chatgpt.com/codex/ide
