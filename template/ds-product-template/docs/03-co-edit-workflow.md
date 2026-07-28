# Co-Edit Workflow

Team 內多人 PR-based 共編,規範 + tooling。

## Branch + PR flow

```
# 1. Pull latest main
git checkout main && git pull

# 2. Branch
git checkout -b feat/<your-feature-name>

# 3. Edit + commit + push
git add . && git commit -m "feat(<scope>): <description>"
git push -u origin feat/<your-feature-name>

# 4. Open PR via GitHub UI(或 gh CLI:gh-pr-create)
```

## CI 自動跑(每 PR / push)

- `audit.yml`:hooks-off governance hard gate + tsc + lint:imports + build all apps + a11y
- `sync-design-system.yml`:只接受 exact release version；read-only runner 獨立重建後，`governance-upgrade` environment-gated Governance Writer App 只取得 contents/PR 與完整 snapshot 更新 `.github/workflows/**` 所必需的 workflows write，並建立 deterministic PR。它觸發的 candidate runs 全部是 non-authoritative；明確 repository dispatch 重新載入 protected-default validation，再由獨立 check-only Governance Check App 發布 required verdict。不直推 main、不 review/approve/merge、不解析 dist-tag；repository Actions 預設維持 read-only 且 create/approve PR 設定維持關閉
- Storybook deploy 走 `netlify.toml` Git integration auto-build,不需 workflow file

## Code review(CODEOWNERS)

`.github/CODEOWNERS`:
```
* @ajenchen   # ← fork user 第 1 件事:改成自己 GitHub username(或 team handle)
```

**Fork user 必跑**:
```bash
sed -i '' 's/@ajenchen/@<your-github-username>/g' .github/CODEOWNERS
```

加 team member 後改 per-app owner:
```
/apps/order-dashboard/ @wendy @teammate2
```

## Conflict resolution

```
# 同步 main(上 PR 前必跑)
git checkout main && git pull
git checkout feat/<your-branch>
git rebase main  # 或 git merge main

# 解 conflict(編輯 file → git add → git rebase --continue)
git push --force-with-lease
```

## 禁忌

- **禁** 改 `node_modules/@qijenchen/design-system/`(直接改 node_modules 是 antipattern)
- **禁** import DS internal paths(`/src/...` / `/dist/...`)— hook 攔
- **禁** force-push/direct-push main(branch ruleset 必須攔)

## Next

→ `docs/04-ds-upgrade.md` DS 升級 + codemod
