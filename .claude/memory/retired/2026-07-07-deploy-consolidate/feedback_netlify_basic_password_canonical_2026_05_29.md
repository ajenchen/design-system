---
name: Netlify 密碼控管 canonical(免費 = Edge Function Basic Auth)+ Claude Code 直連是雲端主路徑(2026-05-29 / 2026-06-05 二修)
description: 免費密碼 = Netlify Edge Function 自做 Basic Auth(STORYBOOK_BASIC_AUTH env var,template 內建,Netlify 官方 prompt-template 有記載);Dashboard Password 與 _headers Basic-Auth 都是 Pro $20/mo;Netlify Identity 未 deprecated(2026-02 撤回)但是 full login 系統不適合 simple gate;Claude Code 直連 fork repo 是 user 雲端主路徑
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# Netlify 密碼控管真相 + 雲端主路徑(2026-05-29 codify;2026-06-05 二修,官方 docs 多源 + 對抗稽核三證)

## Rule 1 — Netlify 免費密碼 = Edge Function Basic Auth(Dashboard / _headers 都是 Pro)

**正解(2026-06-05 親自 WebFetch 官方 docs + 對抗稽核 refute 三證,逐源 fetched_ok)**:

| 方法 | 方案 | 來源(已親驗) |
|---|---|---|
| **Edge Function 自做 Basic Auth** | **免費**(free-tier 含) | Netlify **官方** prompt-template 有記載:`docs.netlify.com/prompt-templates/netlify/password-protect-a-page/`(env var gate 範例,© 2026 Netlify,無方案限制) |
| Dashboard「Password protection」開關 | **Pro $20/mo** | `docs.netlify.com/manage/security/secure-access-to-sites/password-protection/`「available on all Pro plans」+ staff(answers.netlify.com/t/.../110487)「You'll need a Pro plan」 |
| `_headers` / netlify.toml `Basic-Auth` header | **Pro $20/mo,且不套用到 edge function** | `docs.netlify.com/.../basic-authentication-with-custom-http-headers/`「available on all Pro and Enterprise plans」+ `docs.netlify.com/build/edge-functions/limits/`「Custom Headers, including basic authentication headers, will not apply to edge functions」 |

**本 template 已內建(免費機制)**:
- `template/ds-product-template/netlify/edge-functions/basic-auth.ts` — 讀 `Authorization` header → 比對 Netlify env var `STORYBOOK_BASIC_AUTH`(格式 `user:pass`,多組空格分隔)→ 缺/錯回 401 + `WWW-Authenticate`(瀏覽器原生帳密彈窗);未設 env var = pass-through(站台公開)。
- `netlify.toml` 已 wire `[[edge_functions]]` path="/*" function="basic-auth"。
- 舊 `scripts/inject-basic-auth.mjs`(build-time 寫 `_headers`)**已刪** — 前提錯(`_headers` 是 Pro),且根本沒被打包進 fork repo。

**fork user 設定(30 秒,免費)**:Netlify → Site configuration → Environment variables → 加 `STORYBOOK_BASIC_AUTH` = `user:password` → 下次 deploy 跳帳密彈窗。`npm run setup:netlify` 自動跑 CLI install + login + site 建 + 連 repo,**最後印 dashboard URL + 教 user 設這個 env var**(Netlify CLI 不提供 edge-function Basic Auth 的 one-shot 設定,但機制全在 repo,user 只設 1 個 env var)。

**free-tier edge function 額度**:1,000,000 invocations/月(`netlify.com/blog/introducing-netlify-free-plan`),**硬上限非超額計費**——超了該月停站到下月、不會被扣錢。內部 Storybook 流量遠不到此。edge function 在 CDN edge 攔請求,`.netlify.app` 預設網址直接生效、無需自訂網域。

**Netlify Identity 真相(2026-06-05 更正前期錯誤)**:**未 deprecated**——2025-02 公告 deprecate,但 **2026-02-19 官方撤回**(`netlify.com/blog/auth0-extension-identity-changes`「will continue as a supported authentication option ... no required migrations」),free-tier 可用。但 Identity 是**完整 signup/login 系統**(要自己接 login UI widget),**不是「全站一鍵密碼」**——對「Storybook 上個簡單密碼」是 overkill,故我們不用它(用 edge function)。**禁** 再寫「Identity 已 deprecated」(錯)。

**其他免費選項(完整盤點,給 user 選擇)**:Cloudflare Access(免費 ≤50 user 真 SSO,但需自訂網域 DNS 走 Cloudflare proxy,**不保護裸 `.netlify.app`**)/ StatiCrypt(build 時加密 HTML,client 端解密,obscurity 級非伺服器強制)/ Netlify Functions DIY(同 edge 精神,functions 層)。

**Anti-pattern(永久禁,2026-06-05)**:寫 setup script / README / CLAUDE.md / audit dim **禁再寫**:「`_headers` Basic-Auth 免費」「Dashboard Basic Password 免費 / free-tier 唯一可用」「Basic Password Protection 是 free-tier 唯一可用」「Netlify Identity 已 deprecated」「`inject-basic-auth.mjs` / build-time 寫 `_headers`」(機制已刪)。免費正解只有一句:**Edge Function 自做 Basic Auth(`STORYBOOK_BASIC_AUTH` env var,template 內建)**。

## Rule 2 — 雲端主路徑 = Claude Code 直連 sandbox(不是 Codespaces)

**User 工作流 verbatim 2026-05-29**:「我們的工作流程就是用 claude code 直接連去 repo 進行各種增刪改,然後要可以部署出來讓人驗證,驗證完成之後再推去 main」

**真實雲端路徑**:Claude Code(claude.ai/code OR 桌面 OR VS Code ext)直接連 user 的 GitHub fork repo;Claude clone 進 ephemeral sandbox,governance hooks + skills + npm + git ops 全在 sandbox 跑,寫完 commit/push 回 GitHub。**不需 Codespaces 也不需本地 IDE**。Codespaces 是 fallback(`template/ds-product-template/.devcontainer/` 已 ship,Path 2)。Setup script 必 `npx -y netlify-cli` fallback(global install 在鎖權限環境 EACCES)。

## Rule 3 — Codex exec mode 大 brief 死局(SSOT 詳 `feedback_codex_exec_transport_canonical.md` Rule 3)

精要:拆 N 個 single-axis focused brief 並行 + `model_reasoning_effort=low` + bypass flag;**禁** 6-軸 mega brief + xhigh(plan turn 燒光 budget 沒 verdict)。

## Rule 4 — 兩個 repo 都全雲端可操作 = clone-on-demand

**User directive(2026-05-29 verbatim)**:「這兩個 repo 也都要能夠支援全雲端操作」。`gh` token(`ajenchen`,scope `repo`+`workflow`)→ 任一 repo 都 `git clone` 進當前環境 edit/commit/push;各 repo 自帶 `netlify.toml` + workflows,push 對的 remote 就觸發各自部署。**被問能否操作某 ecosystem repo → 預設 YES, clone-on-demand**,禁把「當下沒 checkout」當能力邊界。

## How to apply

- 被問 Netlify 密碼 / fork user 設密碼 → 免費 = Edge Function Basic Auth(`STORYBOOK_BASIC_AUTH`),Dashboard + `_headers` 都是 Pro $20/mo;Identity 未 deprecated 但不適合 simple gate
- 寫 fork-template setup script / README / CLAUDE.md / audit dim 62 → 全部 edge-function canonical,套用 Rule 1 Anti-pattern 禁用詞
- 被問「能操作 X repo 嗎」→ 答 clone-on-demand YES + 各 repo 自帶部署設定
- 推 user 雲端路徑首推 Claude Code 直連 sandbox(Path 1),Codespaces 是 Path 2 fallback
- Codex collab 寫 brief:拆 single-axis focused brief + low reasoning + bypass flag

## 錨例

- 2026-05-26 我寫 setup-netlify-access.mjs 用 `netlify api provisionSiteIdentity` — Identity provision API 在新 site 不穩定(技術問題,跟 Identity 是否 deprecated 無關)
- 2026-05-29 我兩度搞錯免費密碼:先說 `_headers` 免費(錯,Pro)、又說 Dashboard Basic Password free-tier 唯一可用(錯,Pro);還誤信 Identity deprecated(錯,2026-02 撤回)
- 2026-06-05 user「仔細查查研究」verify-harder → 7 路平行 WebFetch 官方 docs + 4 路對抗 refute 三證:免費正解 = Edge Function Basic Auth(官方 prompt-template 有記載);Dashboard + `_headers` 都 Pro $20/mo;`_headers` 不套用到 edge function
- 2026-06-05 對抗稽核抓到「password 修沒貫徹到 memory SSOT + audit dim 62」——template 文件改對了但 governance canonical(此檔 + dim 62)殘留舊 Basic-Password 機制 = M10「改一處看三處」漏 governance 層
