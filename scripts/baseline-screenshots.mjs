#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')))
const STATIC = args.static || join(ROOT, 'storybook-static')
const OUT = args.out || join(ROOT, '.claude/snapshots/baseline-948a4bc')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
const port = Number(args.port || 6033)
await new Promise(r => server.listen(port, r))

const browser = await chromium.launch({ headless: true })

const STORIES = [
  'design-system-components-datatable-展示--inline-edit-interactive',
  'design-system-components-datatable-展示--inline-edit',
  'design-system-components-datatable-展示--column-types',
  'design-system-components-datatable-展示--row-auto-height',
  'design-system-components-datatable-展示--all-sizes',
  'design-system-components-datatable-展示--row-actions',
  'design-system-components-datatable-展示--virtual-scroll',
  'design-system-components-datatable-展示--row-drag-with-virtualization',
]

for (const id of STORIES) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })
  try {
    await page.goto(`http://localhost:${port}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForSelector('[role="row"][data-row-index], [role="cell"]', { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(OUT, `${id.split('--')[1]}.png`), fullPage: false })
    console.log(`✓ ${id.split('--')[1]}`)
  } catch (e) {
    console.log(`✗ ${id.split('--')[1]}: ${e.message.slice(0, 60)}`)
  }
  await page.close()
}

await browser.close()
server.close()
