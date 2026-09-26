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
 *
 * **檔案清單(2026-09-25)**:另寫 `manifest` —— 建置裡每個檔的相對路徑與位元組數,加整份清單的 sha256。
 * 理由:build-info.json「存在且沒變」只證明「沒人正在重建」,證明不了「檔還是建完時那些檔」;同一天本機的
 * storybook-static 被雲端同步截成 0 位元組的 chunk,標記卻完好。瀏覽器閘的快照
 *(scripts/lib/storybook-static-snapshot.mjs)據此逐檔核對,缺檔 / 大小不符以「儀器失效」拒絕。
 * 清單的格式與核對是同一支 lib 的兩半(buildFileManifest / verifyBuildManifest),不在這裡另寫一份。
 * 本檔是 `npm run build-storybook` 的**最後一步**:清單必須在所有會寫進輸出目錄的步驟之後才算。
 *
 *   node scripts/gen-build-info.mjs               # 寫 storybook-static/build-info.json
 *   node scripts/gen-build-info.mjs --dir=<建置>   # 寫別的建置目錄(測試 / 參考建置用)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFileManifest } from './lib/storybook-static-snapshot.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const dirArg = process.argv.find((a) => a.startsWith('--dir='))?.slice('--dir='.length)
const OUT_DIR = dirArg ? resolve(dirArg) : join(REPO, 'storybook-static')
const sha = process.env.GITHUB_SHA
  ?? (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim() } catch { return null } })()
// 版本 SSOT 在 DS 套件,不是 repo root(root 是 0.0.0 的 workspace 容器)
const version = (() => { try { return JSON.parse(readFileSync(join(REPO, 'packages/design-system/package.json'), 'utf8')).version ?? null } catch { return null } })()
const manifest = buildFileManifest(OUT_DIR)
const out = join(OUT_DIR, 'build-info.json')
writeFileSync(out, JSON.stringify({ commit: sha, version, builtAt: new Date().toISOString(), manifest }, null, 2))
console.log(`✓ build-info.json:commit=${sha?.slice(0, 8) ?? '(無)'} version=${version ?? '(無)'} 檔案清單=${manifest.fileCount} 檔 / ${manifest.totalBytes} 位元組 / sha256 ${manifest.sha256.slice(0, 12)}`)
