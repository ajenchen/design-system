#!/usr/bin/env node
/**
 * 把「這份 storybook 是從哪個 commit build 出來的」寫進產物(2026-09-11)。
 *
 * 為什麼:2026-09-11 user 回報「預覽還是很卡」,查出來那份 Netlify 預覽**落後兩個 commit**
 * (`tag` chunk 裡量測快取的 `loadingdone` 出現 0 次)—— 他看的根本不是我修過的東西,而我當時
 * 沒有任何機械方法可以確認。chunk 檔名的 hash 不能當身分:同一份原始碼在不同環境 build 出來的
 * hash 不一樣(本機 `data-table-BIu-rWB0.js` vs 預覽 `data-table-ut_k40x6.js`)。
 *
 * 所以在產物裡放一個 `build-info.json`,`scripts/verify-preview-head.mjs` 用它一句話回答
 * 「線上那份是不是我這個 commit」。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const sha = process.env.GITHUB_SHA
  ?? (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim() } catch { return null } })()
// 版本 SSOT 在 DS 套件,不是 repo root(root 是 0.0.0 的 workspace 容器)
const version = (() => { try { return JSON.parse(readFileSync(join(REPO, 'packages/design-system/package.json'), 'utf8')).version ?? null } catch { return null } })()
const out = join(REPO, 'storybook-static', 'build-info.json')
writeFileSync(out, JSON.stringify({ commit: sha, version, builtAt: new Date().toISOString() }, null, 2))
console.log(`✓ build-info.json:commit=${sha?.slice(0, 8) ?? '(無)'} version=${version ?? '(無)'}`)
