#!/usr/bin/env node
/**
 * 不變式:**浮層底部那條 footer 的左右內距,必須跟它正上方那疊東西的左右內距對齊。**
 *
 * owner:`packages/design-system/src/patterns/overlay-surface/overlay-surface.spec.md`
 * 「`SurfaceFooter` 的左右內距要對齊誰」。
 *
 * 為什麼不是「一律 16」也不是「選單一律 12」:同一顆 `SurfaceFooter` 會被裝進兩種殼 ——
 *   - 有 chrome 的浮層(Dialog / Sheet / Popover):上面是 `SurfaceBody`,body 走 `--layout-space-loose`
 *     → footer 也走 loose,兩邊同一顆 token,密度改了一起改。
 *   - 沒有 header 的選單(SelectMenu / Combobox / 多選下拉):上面是一排列,列走 `--item-px`
 *     → footer 也得走 `--item-px`。裸選單解出 12、被 Command 根設成 loose 時解出 16,自動跟著。
 * 兩種情形的**規則是同一條**(對齊正上方那疊東西),解出來的數字不同而已。
 * 2026-09-17 錨:全選 footer 一開始沿用 `px-loose`,在沒有 header 的下拉裡按鈕左緣 33、列前緣 29,差 4px。
 *
 * 量的是**像素**(content-box 左緣),不是 class 字串(M32)。全 story 掃,不抽樣。
 * 對照組 `--selftest`:把每個 footer 的左內距多推 7px,這支必須紅;抓到 = exit 0,沒抓到 = exit 1。
 *
 * **順帶擋一件事:story 整則渲不出來**。這支本來就要逐一開啟全部 story,所以順手檢查有沒有 story 掉進
 * Storybook 的錯誤畫面(`.sb-show-errordisplay`)。為什麼放這裡而不是新開一支:專門做這件事的
 * `scripts/storybook-smoke-test.mjs` 檔頭寫著「Hook 進 ci.yml verify job」,但 2026-09-18 實測
 * `grep -rn storybook-smoke .github/workflows package.json` = **0 筆 —— 它從來沒有被 CI 叫過**。
 * 而再跑一次全 1035 支的掃描等於把 CI 時間加倍。錨(同日):新加的蓋板 story 用了需要 SidebarProvider 的
 * demo helper,`tsc -b`、`build:lib`、`build-storybook` 三關全綠,story 卻整則渲不出來(runtime 才炸)。
 *
 * **沒量到 = 儀器失效(exit 1,訊息標「儀器失效」),不是通過**(2026-09-25,M37):每則 story 經 lib/launch-browser.mjs 的 openStory
 * (全部瀏覽器閘共用的唯一實作)開啟 —— 等 Storybook 回報渲染完成(含 play)、通過 render-health、版面連續靜止
 * SETTLE_FRAMES 個影格,才量 footer。取代原本的 domcontentloaded + 等根節點有子元素(等不到還 `.catch` 吞掉)+ 固定睡
 * 140ms。原本任何一則載入失敗只印一行「! id」、記進「載入失敗 N 支」,**然後照樣 exit 0** —— 那幾則的 footer 從沒量過,
 * 卻算在「掃描 1042 支(不抽樣)」裡。現在分兩類:
 *   - story 自己渲染拋錯(Storybook 錯誤頁、沒有任何同源 404)→ 照舊算「整則渲不出來」(本閘的產品判定,exit 1);
 *   - 其他一切沒量到(同源 404 / 等不到渲染完成 / 空畫面 / 頁面例外 / 版面不靜止 / 量測本身丟例外)→ 儀器失效,
 *     逐則點名、附同源 404 帳本,exit 1(三種模式都是;--selftest 不得把它算成「抓到了」)。
 *     不用 exit 2:lib/gate-selftest-meta.mjs 把 exit 2 讀成「起不了環境 → 略過」,用 2 等於讓 meta-test 把沒量到吞掉。
 *
 * Run: `node scripts/overlay-footer-gutter-invariant.mjs [--survey] [--build=dir] [--lanes=4]`
 *      `--survey` 只印清單不判定(盤點用)。
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
// 「渲不出來」那條也要有對照組(M32):把錯誤畫面塞進 DOM,偵測器必須抓到。
const SELFTEST_CRASH = process.argv.includes('--selftest-crash')
const SURVEY = process.argv.includes('--survey')
const LANES = Number(arg('lanes', '4'))
const LIMIT = Number(arg('limit', '0'))
const TOLERANCE_PX = 1
// 開 story 後要求版面連續靜止幾個影格才量 footer 左緣(量的是幾何,要等排版與進場動畫跑完)
const SETTLE_FRAMES = 10

if (!existsSync(join(BUILD, 'index.json'))) {
  console.error(`✗ 找不到 ${join(BUILD, 'index.json')} —— 先跑 npm run build-storybook`)
  process.exit(2)
}
const index = JSON.parse(readFileSync(join(BUILD, 'index.json'), 'utf8'))
let stories = Object.values(index.entries || index.stories).filter((e) => e.type !== 'docs').map((e) => ({ id: e.id, name: e.name }))
if (LIMIT) stories = stories.slice(0, LIMIT)

/** 量每一個可見的 surface-footer,以及它正上方那疊東西的前緣。 */
const PROBE = () => {
  const r1 = (n) => Math.round(n * 10) / 10
  /** content-box 左緣 = border-box 左 + border + padding(兩層結構再吃內層 padding)。 */
  const contentLeft = (el, dive = false) => {
    const cs = getComputedStyle(el)
    let x = el.getBoundingClientRect().left + parseFloat(cs.borderLeftWidth || '0') + parseFloat(cs.paddingLeft || '0')
    if (dive) {
      const inner = el.firstElementChild
      if (inner) {
        const ics = getComputedStyle(inner)
        x += parseFloat(ics.borderLeftWidth || '0') + parseFloat(ics.paddingLeft || '0')
      }
    }
    return x
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
  }
  const ROW_SEL = '[role="option"], [cmdk-item], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'
  const out = []
  for (const footer of document.querySelectorAll('[data-slot="surface-footer"]')) {
    if (!visible(footer)) continue
    // 殼 = 往上找到第一個「自己畫了底或框」的祖先(浮層面板 / 對話框 / 選單根)
    let shell = footer.parentElement
    for (let i = 0; i < 6 && shell; i += 1) {
      const cs = getComputedStyle(shell)
      if (shell.hasAttribute('cmdk-root') || shell.getAttribute('role') === 'dialog'
        || cs.borderTopWidth !== '0px' || (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)')) break
      shell = shell.parentElement
    }
    shell = shell || footer.parentElement
    const shellBox = shell.getBoundingClientRect()
    // ── 參照 = 這個浮層裡「有左緣可以對齊」的內容 ──────────────────────────────
    // 挑選順序是**視覺上誰定義了這個浮層的內容左緣**,不是 DOM 順序:
    //   body > 滿寬的列 > 日曆格 > header。
    // 「滿寬的列」要真的滿寬(≥ 殼內寬 60%):TimePicker 的時 / 分欄也是 role=option,
    // 但它是 79px 寬、數字置中的欄,拿它的左緣去對 footer 沒有意義
    //(2026-09-18 第一版就是這樣把 DatePicker 量出 −236px 的假紅)。
    const body = [...shell.querySelectorAll('[data-slot="surface-body"]')].filter(visible)[0]
    const header = [...shell.querySelectorAll('[data-slot="surface-header"]')].filter(visible)[0]
    const wideRows = [...shell.querySelectorAll(ROW_SEL)].filter((r) => visible(r) && r.getBoundingClientRect().width >= shellBox.width * 0.6)
    const cell = [...shell.querySelectorAll('table [role="gridcell"], table td')].filter(visible)[0]
    let refKind = null, refLeft = null
    // 列排在 body 前面:list-as-region 的浮層會把 body 的 chrome padding 撤掉(px-0)、改由列自己帶 gutter
    //(`overlay-surface.spec.md`「List-as-region in overlay body」)。那種殼裡「內容左緣」是列定義的,
    // 拿 body 的 content-box 去比會差一整個 gutter(2026-09-18 實測 Popover 展示差 16px = 假紅)。
    if (wideRows.length) { refKind = '列'; refLeft = contentLeft(wideRows[0], true) }
    else if (body) { refKind = 'body'; refLeft = contentLeft(body) }
    else if (cell) { refKind = '日曆格'; refLeft = cell.getBoundingClientRect().left }
    else if (header) { refKind = 'header'; refLeft = contentLeft(header) }
    const pad = parseFloat(getComputedStyle(footer).paddingLeft || '0')
    // 沒有可對齊對象時(欄位置中、格線置中的挑選面板)至少要用既有 layout token,不得寫死數字
    const loose = parseFloat(getComputedStyle(footer).getPropertyValue('--layout-space-loose') || '0')
    const tight = parseFloat(getComputedStyle(footer).getPropertyValue('--layout-space-tight') || '0')
    const itemPx = parseFloat(getComputedStyle(footer).getPropertyValue('--item-px') || '0')
      || parseFloat(getComputedStyle(footer).getPropertyValue('--field-px') || '0') * (String(getComputedStyle(footer).getPropertyValue('--field-px')).includes('rem') ? 16 : 1)
    out.push({
      refKind,
      footerLeft: r1(contentLeft(footer)),
      refLeft: refLeft == null ? null : r1(refLeft),
      delta: refLeft == null ? null : r1(contentLeft(footer) - refLeft),
      footerPad: r1(pad),
      canonicalPads: [r1(loose), r1(tight), r1(itemPx)],
      padIsToken: [loose, tight, itemPx].some((v) => Math.abs(v - pad) <= 0.5),
      density: (footer.closest('[data-density]') || document.documentElement).getAttribute('data-density') || 'md',
      layoutSpaceLock: (footer.closest('[data-layout-space]') || document.documentElement).getAttribute('data-layout-space') || '(未鎖)',
      shell: shell.hasAttribute('cmdk-root') ? 'cmdk' : (shell.getAttribute('role') === 'dialog' ? 'dialog' : 'panel'),
      rows: wideRows.length,
    })
  }
  return out
}

/** 對照組:把每個 footer 的左內距多推 7px。 */
const SHIFT = () => {
  const list = [...document.querySelectorAll('[data-slot="surface-footer"]')]
  for (const f of list) f.style.paddingLeft = `${parseFloat(getComputedStyle(f).paddingLeft) + 7}px`
  return list.length
}

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const bad = []
const survey = []
let scanned = 0, footersChecked = 0, noRef = 0
const crashed = []
/** 儀器失效:沒量到的 story(不是產品判定)。 */
const instrumentFailures = []
let cursor = 0
const browsers = []
try {
  const lane = async () => {
    const browser = await launchBrowser()
    browsers.push(browser)
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    for (;;) {
      if ((SELFTEST && bad.length > 0) || (SELFTEST_CRASH && crashed.length > 0)) break
      const idx = cursor++
      if (idx >= stories.length) break
      const s = stories[idx]
      scanned += 1
      try {
        try {
          await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`, {
            settleFrames: SETTLE_FRAMES, notFound: server.notFound, navigationTimeoutMs: 30_000, timeoutMs: 30_000,
          })
        } catch (error) {
          if (!(error instanceof StoryRenderInstrumentError)) throw error
          // story 自己渲染拋錯(錯誤頁、而且沒有任何**同源**檔案缺檔 / 載入失敗)= 本閘順帶擋的「整則渲不出來」;其餘都是沒量到。
          // 只看同源:跨網域的遠端頭像圖(i.pravatar.cc)在沙箱裡本來就載不到,不能讓它把真的渲染崩潰改判成儀器失效。
          const sameOriginFailures = error.failedRequests.filter((request) => /^(?:\d{3} )?\//.test(request))
          const selfCrash = (error.kind === 'storybook-error' || error.kind === 'render-errored') && sameOriginFailures.length === 0
          if (selfCrash) crashed.push({ story: s.id, name: s.name, 訊息: error.storybookError || error.reason })
          else instrumentFailures.push({ story: s.id, detail: error.detail })
          continue
        }
        if (SELFTEST_CRASH) {
          await page.evaluate(() => {
            const d = document.createElement('div')
            d.className = 'sb-show-errordisplay'
            d.innerHTML = '<div id="error-message">對照組:假裝這則 story 炸了</div>'
            document.body.appendChild(d)
          })
        }
        const crash = await page.evaluate(() => {
          const err = document.querySelector('.sb-show-errordisplay')
          if (!err) return null
          return (document.querySelector('#error-message')?.textContent || err.textContent || '').trim().slice(0, 200)
        })
        if (crash) { crashed.push({ story: s.id, name: s.name, 訊息: crash }); continue }
        const collect = async (how) => {
          if (SELFTEST) { await page.evaluate(SHIFT); await page.waitForTimeout(30) }
          const found = await page.evaluate(PROBE)
          for (const f of found) {
            footersChecked += 1
            survey.push({ story: s.id, name: s.name, how, ...f })
            if (f.refKind === null) {
              // 沒有可對齊對象(欄位置中的挑選面板):至少不准自己挑一個數字
              noRef += 1
              if (!f.padIsToken) {
                bad.push({ story: s.id, name: s.name, how, 問題: `footer 左內距 ${f.footerPad}px 不是任何既有 layout token(loose/tight/item-px = ${f.canonicalPads.join('/')})`, 細節: f })
              }
              continue
            }
            if (Math.abs(f.delta) > TOLERANCE_PX) {
              bad.push({ story: s.id, name: s.name, how, 問題: `footer 左緣沒對齊上方的「${f.refKind}」(差 ${f.delta}px)`, 細節: f })
            }
          }
        }
        await collect('載入即見')
        // 需要點開才看得到的:下拉選單 / 日期時間選擇器
        const triggers = page.locator('[role="combobox"]')
        const n = Math.min(await triggers.count(), 6)
        for (let i = 0; i < n; i += 1) {
          await triggers.nth(i).click({ timeout: 3_000 }).catch(() => null)
          await page.waitForTimeout(260) // 點開之後:等下拉 / 浮層的開啟動畫跑完再量 footer
          await collect(`點開第 ${i + 1} 個下拉`)
          await page.keyboard.press('Escape').catch(() => null)
          await page.waitForTimeout(80) // 等關閉動畫跑完,不擋下一個觸發點
        }
      } catch (error) {
        // 量測途中丟例外 = 這則沒量完 → 儀器失效(原本只記一行、照樣 exit 0)
        instrumentFailures.push({ story: s.id, detail: `量測途中丟例外:${String(error?.message || error).split('\n')[0]}` })
      }
      if (scanned % 250 === 0) console.error(`… ${scanned}/${stories.length} 支掃完`)
      if ((SELFTEST && bad.length > 0) || (SELFTEST_CRASH && crashed.length > 0)) { console.error(`… 對照組在第 ${scanned} 支就抓到了,提早收工`); break }
    }
    await page.close(); await browser.close()
  }
  await Promise.all(Array.from({ length: Math.max(1, LANES) }, () => lane()))
} finally {
  for (const b of browsers) await b.close().catch(() => null)
  // `stop()` 才是這個 helper 的 API —— 先前寫 `server.close?.()`,那個名字不存在,可選鏈讓它靜靜地什麼都沒做,
  // 監聽中的 server 就一直把事件迴圈撐著:CI 上印完「✓ 通過」之後空轉 13 分鐘,直到 job 撞 25 分上限被砍(2026-09-18)。
  await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 3_000).unref?.())]).catch(() => null)
}

console.log(`\n掃描 ${scanned} 支 story(不抽樣),儀器失效(沒量到)${instrumentFailures.length} 支`)
console.log(`量到可見的 footer:${footersChecked} 個(其中 ${noRef} 個上方沒有可對齊的東西,略過)`)
console.log(`整則渲不出來的 story:${crashed.length} 支`)

// 儀器失效:逐則點名 + 同源 404 帳本。任何模式下都 exit 1 —— 沒量到的 story 不得被讀成「footer 都對齊」或「對照組抓到了」
const reportInstrumentFailures = () => {
  if (!instrumentFailures.length) return false
  console.error(`\n✗ 儀器失效:${instrumentFailures.length} 支 story 沒量到 —— 這不是產品裁決,但這一趟不能算通過:`)
  for (const f of instrumentFailures.slice(0, 40)) console.error(`  - ${f.story}:${f.detail}`)
  if (instrumentFailures.length > 40) console.error(`  …另外 ${instrumentFailures.length - 40} 支`)
  const missing = [...new Set(server.notFound)]
  if (missing.length) console.error(`  同源 404 帳本:${missing.join(', ')}`)
  return true
}

if (SURVEY) {
  const byKey = new Map()
  for (const r of survey) {
    const key = `${r.story.split('--')[0]} | ${r.shell} | 對齊「${r.refKind}」 | footer 內距 ${r.footerPad} | 差 ${r.delta} | layout-space ${r.layoutSpaceLock}`
    byKey.set(key, (byKey.get(key) || 0) + 1)
  }
  console.log('\n── 盤點(元件 | 殼 | 參照 | footer 左內距 | 差) ──')
  for (const [k, v] of [...byKey.entries()].sort()) console.log(`  ${v}×  ${k}`)
  process.exit(reportInstrumentFailures() ? 1 : 0)
}
if (reportInstrumentFailures()) process.exit(1)

if (SELFTEST_CRASH) {
  const ok = crashed.length > 0
  console.log(ok ? `✓ selftest-crash:把錯誤畫面塞進 DOM 之後抓到 ${crashed.length} 支 —— 偵測器會紅` : '✗ selftest-crash:塞了錯誤畫面卻沒抓到 —— 偵測器無效')
  process.exit(ok ? 0 : 1)
}
if (SELFTEST) {
  const ok = bad.length > 0
  console.log(ok ? `✓ selftest:把 footer 左內距推 7px 之後,這支抓到 ${bad.length} 筆 —— 量具會紅` : '✗ selftest:推歪了卻沒抓到 —— 量具無效')
  process.exit(ok ? 0 : 1)
}
// 空綠地板:一個 footer 都沒量到 = 這支什麼都沒驗(M32)
if (footersChecked === 0) {
  console.error('✗ 一個 footer 都沒量到 —— 探針或 build 壞了,不是通過')
  process.exit(1)
}
if (crashed.length) {
  console.error(`\n✗ ${crashed.length} 支 story 整則渲不出來(掉進 Storybook 錯誤畫面):`)
  for (const c of crashed) console.error(`  - ${c.story}(${c.name}):${c.訊息}`)
  process.exit(1)
}
if (bad.length) {
  console.error(`\n✗ ${bad.length} 筆 footer 左緣沒對齊上方內容:`)
  for (const b of bad.slice(0, 30)) console.error(`  - ${b.story}(${b.how}):${b.問題} ${JSON.stringify(b.細節)}`)
  if (bad.length > 30) console.error(`  …另外 ${bad.length - 30} 筆`)
  process.exit(1)
}
console.log('✓ 全部 footer 的左緣都對齊它上方那疊東西')
// 明確結束:不靠事件迴圈自己排空(同 select-all-footer-invariant.mjs 結尾)。
process.exit(0)
