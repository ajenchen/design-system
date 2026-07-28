// basic-auth.ts — FREE 密碼保護(Netlify Edge Function,所有方案含 free-tier 可用)。
//
// 為什麼用 Edge Function 而非 Netlify 內建:
//   Netlify Dashboard 的「Password protection」與 `_headers` 的 Basic-Auth header **都是 Pro 專屬**
//   ($20/mo,官方 docs + support forum 2026-06-05 證實)。free-tier 要密碼 → 用 Edge Function
//   自己實作 HTTP Basic Auth(讀 Authorization → 比對 → 回 401)。Edge Functions 免費方案可用
//   (額度依方案,低流量內部 Storybook 綽綽有餘),且 `.netlify.app` 預設網址直接生效、無需自訂網域。
//   (注:官方限制頁載明 `_headers` 的 basic-auth header 不會套用到 edge function,故必在此自己做。)
//   Netlify 官方有記載此 edge-function 密碼 gate pattern(非野路子):
//   docs.netlify.com/prompt-templates/netlify/password-protect-a-page/(env var gate 範例,© 2026 Netlify)。
//
// 政策 fail-closed-v1:**未設或設錯 STORYBOOK_BASIC_AUTH = 503 鎖站**,不再靜默公開。
//   舊版「未設 env var = pass-through 公開」讓一個漏設定就把內部 Storybook 整站裸奔;
//   fail-closed 之後漏設定的症狀是明確的 503「Authentication service unavailable.」,
//   fork user 依 docs/01-first-time-setup 設好 env var 即恢復。憑證格式錯誤同樣 503
//   (寧可鎖住也不用壞規則放行)。`npm run setup:netlify` 會驗證本檔 sha256 未被改壞。
//
// 怎麼啟用(fork user,30 秒,免費):
//   Netlify → Site configuration → Environment variables → Add a variable
//     Key:   STORYBOOK_BASIC_AUTH
//     Value: your_user:your_password          (多組帳密空格分隔:"alice:pw1 bob:pw2")
//   下次 deploy → 站台跳瀏覽器原生帳密彈窗。密碼只存 Netlify env var,不進 public repo。
//
// netlify.toml 已 wire:[[edge_functions]] path="/*" function="basic-auth"
//
// 進階(要更好體驗才升級,非必須):Pro Password Protection($20/mo,美化密碼頁 / 只擋 deploy preview
//   放行 production)OR Cloudflare Access(免費 50 user 真 SSO,需自訂網域 + proxy)。

export const STORYBOOK_ACCESS_POLICY = 'fail-closed-v1'
export const STORYBOOK_AUTH_MISCONFIGURED_STATUS = 503
export const STORYBOOK_AUTH_REQUIRED_STATUS = 401

// 憑證組數與長度上限:內部 Storybook 的合理規模;超出視為設定錯誤(fail-closed),
// 同時擋掉把巨型字串塞進 env var / Authorization header 的濫用。
const MAX_CREDENTIAL_ENTRIES = 32
const MAX_CREDENTIAL_ENTRY_LENGTH = 1024
const MAX_AUTHORIZATION_HEADER_LENGTH = 2048
// 控制字元(含 NUL)出現在憑證或解碼結果裡一律拒絕
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/

const misconfigured = (): Response =>
  new Response('Authentication service unavailable.', {
    status: STORYBOOK_AUTH_MISCONFIGURED_STATUS,
    headers: { 'cache-control': 'no-store' },
  })

const challenge = (): Response =>
  new Response('Authentication required.', {
    status: STORYBOOK_AUTH_REQUIRED_STATUS,
    headers: {
      'cache-control': 'no-store',
      'www-authenticate': 'Basic realm="Storybook", charset="UTF-8"',
    },
  })

// 每一組必須是 user:pass、兩段皆非空、無控制字元、長度封頂。任何一組壞 = 整份設定壞(503)。
function parseConfiguredCredentials(rawCredentials: unknown): Set<string> | null {
  if (typeof rawCredentials !== 'string') return null
  const trimmed = rawCredentials.trim()
  if (!trimmed) return null
  const entries = trimmed.split(/\s+/)
  if (entries.length > MAX_CREDENTIAL_ENTRIES) return null
  const allowed = new Set<string>()
  for (const entry of entries) {
    if (entry.length > MAX_CREDENTIAL_ENTRY_LENGTH) return null
    if (CONTROL_CHARACTERS.test(entry)) return null
    const separator = entry.indexOf(':')
    // user 非空 + pass 非空(pass 內容可再含冒號:只切第一個)
    if (separator <= 0 || separator === entry.length - 1) return null
    allowed.add(entry)
  }
  return allowed
}

// Authorization: Basic <base64(user:pass)>;scheme 大小寫不敏感。
// base64 壞 / 非 UTF-8 / 無冒號 / 超長 → null(交給 401)。
function decodeAuthorization(header: string): string | null {
  if (!header || header.length > MAX_AUTHORIZATION_HEADER_LENGTH) return null
  const separator = header.indexOf(' ')
  if (separator <= 0 || header.slice(0, separator).toLowerCase() !== 'basic') return null
  const encoded = header.slice(separator + 1).trim()
  if (!encoded) return null
  try {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (CONTROL_CHARACTERS.test(decoded) || !decoded.includes(':')) return null
    return decoded
  } catch {
    return null
  }
}

// 核心強制器(pure,edge entrypoint 與 governance 測試共用):
// 設定壞 → 503(絕不 challenge、絕不放行);設定好 → 帳密精確命中才放行,否則 401。
export function enforceStorybookBasicAuth(request: Request, rawCredentials: unknown): Response | undefined {
  const allowed = parseConfiguredCredentials(rawCredentials)
  if (!allowed) return misconfigured()
  const decoded = decodeAuthorization(request.headers.get('authorization') ?? '')
  if (decoded !== null && allowed.has(decoded)) return undefined
  return challenge()
}

// Edge entrypoint:env 讀不到(未設 / 平台拒讀)一律 503 —— fail-closed。
export default function basicAuth(request: Request): Response | undefined {
  let rawCredentials: unknown
  try {
    rawCredentials = (globalThis as { Deno?: { env: { get(name: string): string | undefined } } })
      .Deno?.env.get('STORYBOOK_BASIC_AUTH')
  } catch {
    return misconfigured()
  }
  return enforceStorybookBasicAuth(request, rawCredentials)
}
