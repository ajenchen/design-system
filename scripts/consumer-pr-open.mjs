#!/usr/bin/env node
// 2026-08-11 governed consumer PR open(anti-self-lock SSOT 配套;與 consumer-pr-merge.mjs 成對)。
// 使用:node scripts/consumer-pr-open.mjs <owner/repo> <head-branch> <base-branch> <title> [body]
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const [repository, head, base, title, body = ''] = process.argv.slice(2)
if (!repository || !head || !base || !title) {
  console.error('usage: consumer-pr-open.mjs <owner/repo> <head> <base> <title> [body]')
  process.exit(2)
}
const token = readFileSync(join(homedir(), '.config', 'qijenchen-governance', 'github-token'), 'utf8').trim()
const args = ['-sS', '-X', 'POST', '-H', `Authorization: Bearer ${token}`,
  '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: consumer-pr-open',
  '-H', 'Content-Type: application/json',
  '-d', JSON.stringify({ title, head, base, body }),
  `https://api.github.com/repos/${repository}/pulls`]
const result = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
if (result.error) throw result.error
const response = JSON.parse(result.stdout || 'null')
if (!response?.number) { console.error('PR create failed:', JSON.stringify(response).slice(0, 300)); process.exit(1) }
console.log(`#${response.number} ${response.html_url}`)
