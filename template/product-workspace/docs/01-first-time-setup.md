# 01 — First-time setup

Day 0 上工流程(~15 min)。

## Pre-requisite

- macOS / Linux(Windows WSL 也行)
- Node 20+
- npm 7+(workspaces 支援)
- Claude Code CLI(`npm install -g @anthropic-ai/claude-code` or download from claude.ai/code)
- GitHub CLI(`gh`)— optional but recommended

## Steps

### 1. Clone

```bash
git clone github.com/qijenchen/product-workspace
cd product-workspace
```

### 2. Install(自動拉 DS + Storybook config + Claude plugin)

```bash
npm install
```

預期 output:
- `@qijenchen/design-system` + `@qijenchen/storybook-config` from npm
- 35 sub-deps(@radix-ui / @dnd-kit / lucide-react / ... 全 auto)
- `peerDependencies`:react / react-dom / tailwindcss already 在 root

### 3. Add DS marketplace + install plugin

Per Anthropic Claude Code plugin spec(`code.claude.com/docs/en/plugins`):

```bash
claude                                                  # 啟動 session

# 一次性 setup(per workspace,只跑一次)
/plugin marketplace add github:qijenchen/design-system  # add marketplace catalog
/plugin install design-system@qijenchen-ds              # install plugin from catalog
```

之後 session 自動 detect plugin,load skills + hooks + rules + CLAUDE.md instructions。

更新時:
```bash
/plugin marketplace update    # refresh catalog
/plugin update design-system  # bump to new version(per plugin.json `version` field)
```

驗證:
```
你:列出可用 skills
Claude:design-system-audit / visual-audit / new-component / ...(全列)
```

### 4. Storybook 確認看得到 DS 元件

```bash
npm run storybook
# http://localhost:6006
```

看到「Design System / Components / Button / 展示」表示 dogfood path 通了。

### 5. Build 確認 toolchain

```bash
npm run audit:all     # tsc + content + code quality
npm run build         # build 全 apps
npm run build-storybook
```

全綠 = ready to ship product。

## Common issue

- **claude detect 不到 plugin**:check `.claude/settings.json` 存在 + `enabledPlugins` 條目正確
- **npm install 拉不到 @qijenchen/...**:check 你 npm 已 login + `.npmrc` 設 internal registry(若用 GitHub Packages 或 Verdaccio)
- **Storybook 看不到元件**:check `node_modules/@qijenchen/design-system/dist/` 存在 + `.storybook/main.ts` glob 正確
- **TypeScript path 找不到**:check `tsconfig.json` paths 沒覆寫 npm resolver

→ [05-troubleshooting.md](05-troubleshooting.md) 完整排查
