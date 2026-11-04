// 假 GitHub,給 release-workflow.test.mjs 驗 curlGitHubParallel(scripts/release-orchestrator.mjs)用。
//
// 必須是**另一個行程**:curlGitHubParallel 用 spawnSync 跑 curl,同一個行程的事件迴圈在那段時間整個停住,
// 伺服器若跟測試同一個行程就永遠回不了。測試端以字面路徑啟動本檔(harness 來源政策:node 的腳本運算元要可靜態審查)。
//
// 路由(每個回應都把「被問的路徑」與收到的 Authorization 原樣帶回,測試據此驗「第 i 個回應真的是第 i 個路徑的」):
//   /slow/<毫秒>/…   延遲這麼久才回 200 —— 讓完成順序與送出順序不同(curl 印 -w 的順序是完成順序)
//   /status/<碼>/…   回那個狀態碼
//   /drop/…          不回任何東西就把連線切掉(curl 記為 HTTP 000 = 連線層失敗)
//   其餘             立刻回 200
// 啟動後印一行 port;stdin 一關閉就結束(測試結束不留孤兒行程)。
import { createServer } from 'node:http'

const server = createServer((request, response) => {
  const path = request.url || '/'
  const reply = code => {
    response.writeHead(code, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ path, authorization: request.headers.authorization || null }))
  }
  if (path.startsWith('/drop/')) {
    request.socket.destroy()
    return
  }
  const slow = /^\/slow\/(\d+)\//.exec(path)
  if (slow) {
    setTimeout(() => reply(200), Number(slow[1]))
    return
  }
  const status = /^\/status\/(\d{3})\//.exec(path)
  reply(status ? Number(status[1]) : 200)
})

server.listen(0, '127.0.0.1', () => process.stdout.write(`${server.address().port}\n`))
process.stdin.on('end', () => {
  server.closeAllConnections?.()
  server.close(() => process.exit(0))
})
process.stdin.resume()
