// inventoryTree 遇到巢狀 .git 必須直接點名(WP-04 / SI-4 後半)。
//
// 之前的行為(38649f5a 實測):
//   - 空的 .git/ 目錄 → 沒有任何檔案進清單,摘要不變,governance:check 照樣 PASS(完全靜默);
//   - 裡面有檔案的 .git/ → 只報三條 GOV-SNAPSHOT-001「Generated file content differs」,
//     點名的是 governance/generated/* 與 control-plane.lock.json,從頭到尾沒有提到那個 .git。
// 這正是 AGENTS.md 失敗記憶索引「hook 測試直跑留 fixture .git/ 進 corpus」那一列的症狀。
//
// 本檔的對照組:
//   紅面 — .git 目錄(有內容 / 空的)、.git 檔(worktree / submodule 指標)、放在清單根目錄、
//          經 checkRepository / generateRepository 整條路徑,都必須 throw 且訊息含該路徑;
//   綠面 — 正常樹的結果與修改前的實作逐位元組相同(摘要是用 38649f5a 的原始 inventoryTree 算出來釘死的);
//          把殘留移除後 checkRepository 回到 PASS;excludes 明列才放行。
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { digest, inventoryTree, treeDigest } from '../src/common.mjs'
import { checkRepository, generateRepository } from '../src/snapshot.mjs'
import { cleanup, makeRepository } from './helpers.mjs'

const NORMAL_TREE = [
  ['.github/workflows/ci.yml', 'name: ci\n', 0o644],
  ['.gitignore', 'node_modules/\n', 0o644],
  ['AGENTS.md', '# Fixture bootstrap\n', 0o644],
  ['B-upper.md', 'upper case sorts before lower case in UTF-8 byte order\n', 0o644],
  ['a-lower.md', 'lower\n', 0o644],
  ['hooks/.gitkeep', '', 0o644],
  ['hooks/check_story_invariants.sh', '#!/bin/bash\nexit 0\n', 0o755],
  ['hooks/tests/test_check_story_invariants.sh', '#!/bin/bash\nexit 0\n', 0o755],
  ['skills/knowledge-prune/SKILL.md', '---\nname: knowledge-prune\n---\n', 0o644],
  ['skills/knowledge-prune/references/prune-dimensions.md', '# 修剪維度\n', 0o644],
]

// 由 38649f5a 的原始 inventoryTree 對上面這棵樹算出(不是由本次修改後的實作算的)。
// 只要正常路徑的位元組有任何變動(排序、mode、hash、size、欄位),這兩個值就會不同。
const GOLDEN_TREE_DIGEST = 'sha256:dcefc25adc930bfe4681801c849abcf38958a32febd22dbf5ed1464da321b83d'
const GOLDEN_ENTRIES_DIGEST = 'sha256:11b2e6021365073ead78f68d0caf23aa0a727b57bd16084f82f35e3f2f18cd6e'

async function put(root, path, body, mode = 0o644) {
  const target = resolve(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, body)
  await chmod(target, mode)
}

async function normalTree(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'qijenchen-inventory-nested-git-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const [path, body, mode] of NORMAL_TREE) await put(root, path, body, mode)
  await mkdir(resolve(root, 'empty-directory'), { recursive: true })
  return root
}

function namesNestedGit(root, rel) {
  const absolute = resolve(root, rel)
  return (error) => {
    assert.ok(error instanceof Error, 'must reject with an Error')
    assert.ok(error.message.startsWith('nested .git inside governance inventory root: '), `message prefix: ${error.message}`)
    assert.ok(error.message.includes(absolute), `message must name ${absolute}: ${error.message}`)
    assert.ok(error.message.includes(`entry ${rel})`), `message must carry the root-relative entry ${rel}: ${error.message}`)
    assert.ok(error.message.includes('npm run hooks:test'), `message must point at the safe runner: ${error.message}`)
    return true
  }
}

test('綠面:正常樹與修改前的實作逐位元組相同(.gitignore / .gitkeep / .github 不被誤判)', async (t) => {
  const root = await normalTree(t)
  const entries = await inventoryTree(root)
  assert.deepEqual(entries.map((entry) => entry.path), NORMAL_TREE.map(([path]) => path))
  assert.equal(treeDigest(entries), GOLDEN_TREE_DIGEST)
  assert.equal(digest(entries), GOLDEN_ENTRIES_DIGEST)
})

test('紅面:有內容的巢狀 .git 目錄直接點名路徑', async (t) => {
  const root = await normalTree(t)
  await put(root, 'hooks/tests/fixture-repo/.git/HEAD', 'ref: refs/heads/main\n')
  await assert.rejects(inventoryTree(root), namesNestedGit(root, 'hooks/tests/fixture-repo/.git'))
})

test('紅面:空的 .git 目錄也點名(修改前這種情況完全靜默)', async (t) => {
  const root = await normalTree(t)
  await mkdir(resolve(root, 'hooks/.git'), { recursive: true })
  await assert.rejects(inventoryTree(root), namesNestedGit(root, 'hooks/.git'))
})

test('紅面:.git 是檔案(worktree / submodule 指標)一樣點名', async (t) => {
  const root = await normalTree(t)
  await put(root, 'skills/knowledge-prune/.git', 'gitdir: ../../.git/worktrees/knowledge-prune\n')
  await assert.rejects(inventoryTree(root), namesNestedGit(root, 'skills/knowledge-prune/.git'))
})

test('紅面:.git 直接放在清單根目錄也點名', async (t) => {
  const root = await normalTree(t)
  await put(root, '.git/HEAD', 'ref: refs/heads/main\n')
  await assert.rejects(inventoryTree(root), namesNestedGit(root, '.git'))
})

test('excludes 明列才放行;沒列到那個 .git 的 excludes 照樣擋', async (t) => {
  const root = await normalTree(t)
  await put(root, 'vendor/upstream/.git/HEAD', 'ref: refs/heads/main\n')
  await put(root, 'vendor/upstream/README.md', '# upstream\n')

  // 同樣的 excludes 寫法、但指向別處 → 仍在違規情境,必須擋
  await assert.rejects(
    inventoryTree(root, { excludes: ['vendor/other'] }),
    namesNestedGit(root, 'vendor/upstream/.git'),
  )

  // 明列那個 .git → 放行,而且它不會出現在清單裡
  const admitted = await inventoryTree(root, { excludes: ['vendor/upstream/.git'] })
  assert.equal(admitted.some((entry) => entry.path.split('/').includes('.git')), false)
  assert.equal(admitted.some((entry) => entry.path === 'vendor/upstream/README.md'), true)

  // 整個上層子樹被排除 → 連同裡面的 .git 一起不看
  const parentExcluded = await inventoryTree(root, { excludes: ['vendor'] })
  assert.equal(parentExcluded.some((entry) => entry.path.startsWith('vendor/')), false)
})

test('整條 check / generate 路徑:canonical hooks 來源裡的殘留 .git 被點名,移除後回到 PASS', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  assert.equal((await generateRepository({ repoRoot })).outcome, 'PASS')

  const residue = 'packages/design-system/ds-canonical/hooks/tests/fixture-repo/.git'
  await put(repoRoot, `${residue}/HEAD`, 'ref: refs/heads/main\n')
  const inventoryRoot = resolve(repoRoot, 'packages/design-system/ds-canonical/hooks')
  await assert.rejects(checkRepository({ repoRoot }), namesNestedGit(inventoryRoot, 'tests/fixture-repo/.git'))
  // generate 也不得把殘留烤進 lock
  await assert.rejects(generateRepository({ repoRoot }), namesNestedGit(inventoryRoot, 'tests/fixture-repo/.git'))

  await rm(resolve(repoRoot, residue), { recursive: true, force: true })
  assert.equal((await checkRepository({ repoRoot })).outcome, 'PASS')
})
