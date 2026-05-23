# 05 — Troubleshooting

常見問題排查清單。按發生階段排序。

## Install 階段

### `npm install` 拉不到 `@qijenchen/design-system`

```
npm error 404 Not Found - GET https://registry.npmjs.org/@qijenchen/design-system
```

**Cause**:
- 該 package 還沒 publish OR npm 沒 login OR `.npmrc` 沒設 internal registry

**Fix**:
- 確認 DS owner 已 publish:`npm view @qijenchen/design-system`
- npm login:`npm login` 或 `npm login --registry=https://npm.qijenchen.internal`
- `.npmrc` 設 scope registry:
  ```
  @qijenchen:registry=https://npm.pkg.github.com  # GitHub Packages
  //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
  ```

### Peer dependency warning

```
npm warn config production Use `--omit=dev` instead.
npm warn EBADENGINE Unsupported engine
```

通常忽略 OK。但若 `peerDependencies` 衝突(react 18 vs 19 等)→ 對齊 `@qijenchen/design-system` 的 peer range。

## Claude session 階段

### Claude 沒 detect plugin

```
Claude:I don't see any custom skills or hooks loaded
```

**Cause**:`.claude/settings.json` 沒寫對 OR plugin 沒 publish

**Fix**:
- 改透過 CLI(per Anthropic plugin spec 2026,enabledPlugins settings.json 機制已 deprecated):
  ```bash
  claude  # start session
  /plugin marketplace add github:qijenchen/design-system
  /plugin install design-system@qijenchen-ds
  /plugin marketplace update  # later refresh
  ```
- 確認 marketplace URL set 在 user-level `~/.claude/settings.json` 或 GitHub 存取 token 有效

### Hook fire 報 false positive

通常是 path migration 漏更新。檢查:
```bash
grep "src/design-system" .claude/  # workspace 內不該有
```

If found,issue DS repo 修(對應 hook script)。

## Build / dev 階段

### `import { X } from '@qijenchen/design-system'` 報 missing

```
Cannot find module '@qijenchen/design-system' or its corresponding type declarations.
```

**Cause**:
- `npm install` 沒跑成功 OR `node_modules/@qijenchen/design-system/dist/index.d.ts` 不存在

**Fix**:
- `rm -rf node_modules package-lock.json && npm install`
- 確認 package 真有 dist:`ls node_modules/@qijenchen/design-system/dist/`

### Tailwind class 不認得 DS token

```
Class `bg-surface` not found
```

**Cause**:`@qijenchen/design-system/styles/globals.css` 沒 import

**Fix**:
- root `src/main.tsx` 或 `src/globals.css`:
  ```css
  @import "@qijenchen/design-system/styles/globals.css";
  ```

### Storybook 看不到 DS 元件

**Cause**:`.storybook/main.ts` stories glob 不對

**Fix**:
- 你的 app stories:`stories: ['../apps/**/*.stories.@(tsx)']`
- DS-internal stories(看 DS demos)不該由 consumer storybook 載入

## CI / Deploy 階段

### Renovate PR 不開

**Cause**:
- Renovate app 沒 install 到 GitHub repo / org
- `renovate.json` syntax error

**Fix**:
- GitHub Marketplace 加 Renovate app to org `qijenchen`
- `npx --package renovate -- renovate-config-validator` 驗 config

### `audit.yml` workflow 紅

依紅燈 step debug:
- tsc fail → 看 PR diff `@qijenchen/design-system` 升 major 嗎?跑 codemod
- content-quality fail → consumer 通常 N/A,加 `continue-on-error: true`(已在 audit.yml)
- build fail → check 新版 DS API 改動(看 changelog)

### Deploy preview 不出

**Cause**:VERCEL_TOKEN 沒設 OR matrix `apps/*` glob 抓不到

**Fix**:
- GitHub repo Settings → Secrets → 加 VERCEL_TOKEN
- check `apps/` 真有 product folder(`_template/` 已排除)

## 一般

### 「我能不能改 DS?」

❌ **不能**(per `03-co-edit-workflow.md`)
- DS repo 是 owner 個人 maintain,team 不在 collaborator list
- node_modules read-only,改了下次 install 覆蓋
- 要 component 改動 → 開 issue 給 DS repo owner

### 「我想加自己的元件」

✅ 寫在 `apps/<your-app>/src/components/` 完全 OK。
- 別污染 `packages/shared-utils/` 除非 ≥2 apps 真要用
- 若 patterns 反覆出現 → 提 DS owner 評估收進 DS

## 還是不行?

開 issue 在 `qijenchen/product-workspace`(team 互助)或 ping team-leads。
