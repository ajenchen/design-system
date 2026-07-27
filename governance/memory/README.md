# Provider-neutral memory SSOT

## 用途

本資料夾 `governance/memory/` 是唯一可審查、可攜、跨 provider 的 memory SSOT。Claude 的
`~/.claude/projects/<cwd-hash>/memory/` 只是可刪除重建的 discovery cache，不是 authority。

## 單向 materialize(避免 split-brain)

先在本目錄修改並經 Git review，再執行 `npm run sync-memory` 將內容單向刷新到 Claude home。
`node scripts/sync-memory.mjs --check` 是 read-only drift probe；`--reverse` 會 fail closed。
`node scripts/validate-memory-contract.mjs` 會驗 index 與 top-level Markdown exact inventory、20-entry/
100-line 上限、active planning pointer、regular-file/no-symlink 與高可信 secret 形狀；任何 orphan、漏檔或重複連結都失敗。

## 注意

- Memory 內容若含 secrets / 個人敏感資料,**不該** commit 到 repo(尤其 public repo)
- 若未來新增 memory file 且包含 secret,加 `.gitignore` 排除 + 改用 reference pointer
