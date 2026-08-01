---
name: Deploy targets + URL auto-detection + Netlify 密碼 + provider-neutral 雲端路徑(2026-07-23 transport consolidation)
description: Storybook Pages + Netlify per-branch preview canonical + deploy URL 3-strategy 自動推導 + per-user override;Netlify 免費密碼 = Edge Function Basic Auth(STORYBOOK_BASIC_AUTH);Git-connected certified sandbox + clone-on-demand
type: reference
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# Deploy targets + URL auto-detection

## ⚠️ 永久 runtime/transport self-awareness(2026-07-23 provider-neutral consolidation)

**Task／deliverable 明確要求跨 provider independent review 時**，以 `packages/governance/canonical/providers.json`、`packages/governance/src/provider-review-binding.mjs` 的 `resolveProviderReviewBinding` 與 target-bound certification/readback 解析 current runtime、獨立 peer、transport 與隔離條件。不得從 provider 專屬環境變數、個人家目錄或工作區字串猜測地端／雲端；registry 未宣告、peer 不獨立、transport 不可用或證據不足時，只有 required-review claim 標 `REVIEW-BLOCKED`，不得阻擋一般工程、deep audit 或 standard release。
歷史 Codex CLI、GitHub mention 與 bypass 指令已移至 `governance/archive/memory-retired/`，只作 non-authority provenance，禁止當 current runbook。
**User 原話**(2026-05-15):「你應該每次在和 codex 協作前都會自己主動自動知道自己在地端還是雲端然後進而知道該以何種工作流程工作,對嗎」

## ⚠️ 永久 anti-pattern:檢查部署看 Netlify 不看 GitHub Pages

**User 訊息含「Netlify / deploy 沒更新 / 沒部署」**:❌ 絕禁 `gh api …/deployments`(GitHub Pages 只看 main)、❌ 絕禁結論「沒 merge main 所以沒 deploy」;✅ 必檢查 Netlify per-branch preview(任何 branch push 都自動 deploy)。
**歷史 user 原話（2026-05-15；只保留 Netlify-vs-Pages target 辨識教訓，git trigger 已由 2026-07-20 Standing Authorization supersede）**：「所有你做的編輯都會直接部署到 netlify,直到我驗證確認才會叫你 push 到 main(GitHub page)…你現在不應該去檢查 GitHub page 是否是最新,而是應該檢查 netlify 是否是最新才對吧?」現行 git authority 只讀 `feedback_solo_dev_workflow.md` 與 `AGENTS.md#Git solo-work canonical`，不得從本引文恢復 user push／merge trigger。
犯錯 anchor:2026-05-15 連 3 次查 Pages SHA 下錯結論。

## Deploy URL 自動推導(hook `inject_deploy_url_after_push.sh` v4,2026-05-27 user verbatim「不管 repo 都自動推導」)

**3-strategy(依序,first non-empty)**:
1. Netlify CLI-linked:`.netlify/state.json` siteSlug(`scripts/deploy-url.mjs`)
2. Netlify dashboard-link(`netlify.toml` 無 state.json):試 `<repo>.netlify.app` → `<owner>-<repo>.netlify.app`(Import 預設,~80% fork user)→ 讀 provider-neutral per-user override(`GOVERNANCE_DEPLOY_TARGETS_FILE` > `${XDG_CONFIG_HOME:-$HOME/.config}/qijenchen-governance/deploy-targets.json`,override 永遠 win);**必 curl HEAD 200 + content sniff Storybook hallmark**(sb-manager / sb-addons)防 squat false-positive(anchor:design-system.netlify.app 200 但是別人的 squat)。`~/.claude/local/deploy-targets.json` 只保留 Claude adapter 的 legacy compatibility fallback，其他 provider 不得讀，且不是 SSOT。
3. GitHub Pages(workflow 含 deploy-pages / gh-pages):推 `<owner>.github.io/<repo>/`,只在 main push fire

**Per-user override 為何必要**:Netlify site name user 自選不可推導(user `qijenchen` ≠ GitHub owner `ajenchen`;repo rename 後 subdomain 不跟);無 token 不能 query API。override 檔 gitignored per-machine。

**Known verified URLs(this user)**:
| Repo | Netlify | GH Pages |
|---|---|---|
| ajenchen/design-system | https://ajenchen-design-system.netlify.app ✅ | https://ajenchen.github.io/design-system/ ✅ |
| ajenchen/ds-product-template | https://qijenchen.netlify.app ✅ | — |

## 部署管道

- **Netlify per-branch preview** = optional asynchronous evidence(branch push 自動)，不是 standard release hard gate；產品／UI／UX SSOT 真取捨可由 user 檢視後決策，但純工程 release 不等待 preview；**Netlify production** = main(storybook)
- **GitHub Pages production** = main push → ci.yml deploy-storybook job(2026-05-08 補;netlify.toml command = build-storybook,publish storybook-static)
- Solo-work 對齊:agent push working branch → PR → required CI + conversations resolved → protected merge → publish → exact release readback → exact-version consumer propagation/readback；由 `npm run release:auto` 依 Standing Authorization 續跑。preview／canary／attestation 只可作 non-blocking optional assurance，不得重返標準 five-step blocking graph，也不再等 chat「push」keyword。

## Anti-pattern(永久 ban,deploy URL)

- ❌ 提供 URL 不 curl verify(2026-05-27 v2 false-claim squat anchor)/ ❌ 只試 `<repo>.netlify.app` 不試 `<owner>-<repo>` / ❌ hardcode site name 進 committed file / ❌ 推導不出時 silent skip(必 explicit warn)/ ❌「應該是 X」不驗證(curl = mechanical ground-truth,per `feedback_ai_ground_truth_unreliable_mechanical_primary.md`)

# Netlify 密碼控管 + 雲端主路徑(2026-05-29 codify;2026-06-05 二修,官方 docs 多源 + 對抗稽核三證)

## Rule 1 — Netlify 免費密碼 = Edge Function Basic Auth(Dashboard / _headers 都是 Pro)

**正解(2026-06-05 親自 WebFetch 官方 docs + 對抗稽核 refute 三證,逐源 fetched_ok)**:

| 方法 | 方案 | 來源(已親驗) |
|---|---|---|
| **Edge Function 自做 Basic Auth** | **免費**(free-tier 含) | Netlify **官方** prompt-template 有記載:`docs.netlify.com/prompt-templates/netlify/password-protect-a-page/`(env var gate 範例,© 2026 Netlify,無方案限制) |
| Dashboard「Password protection」開關 | **Pro $20/mo** | `docs.netlify.com/manage/security/secure-access-to-sites/password-protection/`「available on all Pro plans」+ staff(answers.netlify.com/t/.../110487)「You'll need a Pro plan」 |
| `_headers` / netlify.toml `Basic-Auth` header | **Pro $20/mo,且不套用到 edge function** | `docs.netlify.com/.../basic-authentication-with-custom-http-headers/`「available on all Pro and Enterprise plans」+ `docs.netlify.com/build/edge-functions/limits/`「Custom Headers, including basic authentication headers, will not apply to edge functions」 |

**本 template 已內建(免費機制)**:
- `template/ds-product-template/netlify/edge-functions/basic-auth.ts` — 讀 `Authorization` header → 比對 Netlify env var `STORYBOOK_BASIC_AUTH`(格式 `user:pass`,多組空格分隔；帳號／密碼皆不可空白或含空格)。未設／格式錯誤回 503 fail closed；設定有效但帳密缺失／錯誤回 401 + `WWW-Authenticate`(瀏覽器原生帳密彈窗)；只有正確帳密才 pass-through 到 Storybook。
- `netlify.toml` 已 wire `[[edge_functions]]` path="/*" function="basic-auth"。
- 舊 `scripts/inject-basic-auth.mjs`(build-time 寫 `_headers`)**已刪** — 前提錯(`_headers` 是 Pro),且根本沒被打包進 fork repo。

**fork user 設定(最短安全路徑)**:`npm run setup:netlify` 只做唯讀診斷，以 `NETLIFY-CLI-AUTO-INSTALL-BLOCKED-001` 明示封鎖 CLI 安裝／執行，並列出 Dashboard 流程後 exit 2，不可被 automation 誤認為 setup 已完成。Fork user 在 Netlify Dashboard 選 **Add new project → Import an existing project → GitHub** 連目前 repo，再到 Project configuration → Environment variables 加 `STORYBOOK_BASIC_AUTH` = `user:password`，下次 deploy 即由 template 內建 Edge Function 跳帳密彈窗。帳密只存 Netlify，不進 Git。

**Netlify CLI 供應鏈 blocker(2026-07-22)**:已審查 `netlify-cli@26.2.0` lock audit 仍有 **5 high-severity findings**，因此禁止全域安裝、自動下載 runner、預裝 CLI 自動呼叫，也禁宣稱安全。只有新候選版同時滿足 exact version + immutable lock + canonical registry integrity + scripts disabled + signature verification + **0 high** + 直接 regression tests + reviewed propagation，才能經 PR 解除 blocker。在此之前 Dashboard/manual 是地端、Codespaces 與其他 cloud agent 的唯一受支援 setup 路徑。

**free-tier edge function 額度**:1,000,000 invocations/月(`netlify.com/blog/introducing-netlify-free-plan`),**硬上限非超額計費**——超了該月停站到下月、不會被扣錢。內部 Storybook 流量遠不到此。edge function 在 CDN edge 攔請求,`.netlify.app` 預設網址直接生效、無需自訂網域。

**Netlify Identity 真相(2026-06-05 更正前期錯誤)**:**未 deprecated**——2025-02 公告 deprecate,但 **2026-02-19 官方撤回**(`netlify.com/blog/auth0-extension-identity-changes`「will continue as a supported authentication option ... no required migrations」),free-tier 可用。但 Identity 是**完整 signup/login 系統**(要自己接 login UI widget),**不是「全站一鍵密碼」**——對「Storybook 上個簡單密碼」是 overkill,故我們不用它(用 edge function)。**禁** 再寫「Identity 已 deprecated」(錯)。

**其他免費選項(完整盤點,給 user 選擇)**:Cloudflare Access(免費 ≤50 user 真 SSO,但需自訂網域 DNS 走 Cloudflare proxy,**不保護裸 `.netlify.app`**)/ StatiCrypt(build 時加密 HTML,client 端解密,obscurity 級非伺服器強制)/ Netlify Functions DIY(同 edge 精神,functions 層)。

**Anti-pattern(永久禁,2026-06-05)**:寫 setup script / README / CLAUDE.md(provider-specific adapter) / audit dim **禁再寫**:「`_headers` Basic-Auth 免費」「Dashboard Basic Password 免費 / free-tier 唯一可用」「Basic Password Protection 是 free-tier 唯一可用」「Netlify Identity 已 deprecated」「`inject-basic-auth.mjs` / build-time 寫 `_headers`」(機制已刪)。免費正解只有一句:**Edge Function 自做 Basic Auth(`STORYBOOK_BASIC_AUTH` env var,template 內建)**。

## Rule 2 — 雲端主路徑 = Git-connected certified sandbox(不是綁死單一 provider)

**User 工作流 verbatim 2026-05-29**:「我們的工作流程就是用 claude code 直接連去 repo 進行各種增刪改,然後要可以部署出來讓人驗證,驗證完成之後再推去 main」

**現行雲端路徑**:任何已在 compatibility matrix 對該 target 取得 target-bound certification 的 provider，透過使用者授權的 GitHub integration 連 fork repo，clone 到 ephemeral sandbox，執行同一份 canonical Harness/consumer hard gate，再把變更送回 GitHub。native hooks/skills 只提供早期回饋，不可取代 protected GitHub gate、immutable evidence 與 readback。**不需 Codespaces 也不需本地 IDE**；Codespaces 是 portable fallback(`template/ds-product-template/.devcontainer/`)。未認證的新 provider 先走 registry/profile/schema/fixture/certification onboarding，不能沿用另一 provider 的認證。

## Rule 3 — Model 工作負載必 bounded、content-addressed、fail closed

Task／deliverable 明確要求 independent review 時，跨 provider audit 由 canonical deep-audit/independent-review workflow 將完整 inventory 切成 content-addressed bounded shards，保留 author/peer/model/version/coverage/evidence，最後交給 closed reducer。provider adapter 只能依 registry 綁定 transport/model profile，不得把個人 CLI config、dangerous bypass flag 或退役 wrapper 當 SSOT。任一 shard 缺失、超時、quota/auth/error、模型身分不符或 reducer 證據不完整，都必須讓 required-review claim fail closed，禁止把空輸出當 0 findings。未要求或 exact run 已由 user waiver 時，primary 仍須完成同一 NO-SAMPLE scope、deterministic hard gates 與 receipt；缺 peer 不得阻擋一般工程、deep audit 或 standard release，也不得冒充已做 review。

## Rule 4 — 兩個 repo 都全雲端可操作 = clone-on-demand

**User directive(2026-05-29 verbatim)**:「這兩個 repo 也都要能夠支援全雲端操作」。任何環境都可在授權範圍內 clone-on-demand；各 repo 自帶 `netlify.toml` + workflows，對正確 remote 的已授權變更會觸發各自部署。不得把「當下沒 checkout」誤當能力邊界，也不得把某台機器的帳號/token/scope 寫成跨環境 authority。

## How to apply(密碼 / 雲端)

- 被問 Netlify 密碼 / fork user 設密碼 → 免費 = Edge Function Basic Auth(`STORYBOOK_BASIC_AUTH`),Dashboard + `_headers` 都是 Pro $20/mo;Identity 未 deprecated 但不適合 simple gate
- 寫 fork-template setup script / README / CLAUDE.md(provider-specific adapter) / audit dim 62 → 全部 edge-function canonical,套用 Rule 1 Anti-pattern 禁用詞
- 被問「能操作 X repo 嗎」→ 先確認該 target/provider 的 certification 與授權，再走 clone-on-demand；首選已認證的 Git-connected sandbox，Codespaces 是 portable fallback

## 錨例(密碼)

- 2026-05-26 我寫 setup-netlify-access.mjs 用 `netlify api provisionSiteIdentity` — Identity provision API 在新 site 不穩定(技術問題,跟 Identity 是否 deprecated 無關)
- 2026-05-29 我兩度搞錯免費密碼:先說 `_headers` 免費(錯,Pro)、又說 Dashboard Basic Password free-tier 唯一可用(錯,Pro);還誤信 Identity deprecated(錯,2026-02 撤回)
- 2026-06-05 user「仔細查查研究」verify-harder → 7 路平行 WebFetch 官方 docs + 4 路對抗 refute 三證(結論見 Rule 1 表);對抗稽核同時抓到「password 修沒貫徹到 memory SSOT + audit dim 62」= M10「改一處看三處」漏 governance 層
