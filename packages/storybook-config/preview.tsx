// Shared Storybook preview config(2026-05-22 Phase 2 team-distribution-roadmap)
// Consumer product workspace use:`.storybook/preview.tsx` import { sharedPreview } from '@qijenchen/storybook-config'
// DS repo dogfood:`.storybook/preview.tsx` 直接 import 此 default export

import type { Preview } from '@storybook/react'
import React, { useEffect } from 'react'
// 2026-05-26 fix:改 import 已 published npm package(consumer node_modules layout works),
// 不再 relative path `../design-system/src/...`(monorepo-only path,published 後 consumer 看不到)
import { TooltipProvider } from '@qijenchen/design-system'

export const sharedGlobalTypes = {
  theme: {
    name: '主題',
    description: '全域顯示主題',
    defaultValue: 'light',
    toolbar: {
      icon: 'circlehollow',
      items: [
        { value: 'light', icon: 'sun', title: '淺色' },
        { value: 'dark', icon: 'moon', title: '深色' },
      ],
      showName: true,
    },
  },
  density: {
    name: '介面密度',
    description: '全域元件尺寸與版面留白密度',
    defaultValue: 'md',
    toolbar: {
      icon: 'component',
      items: [
        { value: 'md', title: '標準（md）' },
        { value: 'lg', title: '寬鬆（lg）' },
      ],
      showName: true,
    },
  },
}

export const sharedParameters = {
  docs: {
    // Technical probes stay addressable by direct URL and remain in the story
    // index for a11y/interaction runners, but do not teach readers in Autodocs.
    stories: {
      filter: (story: { tags?: string[] }) => !story.tags?.includes('test-only'),
    },
    // Storybook 8.6 docs 生命週期競態(2026-09-10 user:「剛進 storybook 時,點進範例裡,很常會出現此時不應該出現的選單在左上角」):
    // `CsfDocsRender.renderToElement` 先 `await` DocsRenderer chunk、`DocsRenderer.render` 再 `await` @mdx-js/react chunk,
    // 兩段 await 之後都不再檢查這次 render 是否已被 teardown(core preview-api index.js:4985-5000;teardownRender 要等第一段
    // await 之後才掛上,所以 teardown 當下根本沒東西可取消)。第一次進站 chunk 沒快取(DocsRenderer 888 KB),user 在 Docs 頁
    // 還在載入時點進 story → docs 在 `#storybook-docs[hidden]` 裡渲染成殭屍:裡面所有預設開啟的浮層 portal 到 body、錨點
    // 0×0,被定位到視窗左上角 (0, 8) 還搶走焦點,直到 reload 才消失(AgentPanel「歷史浮層開啟」快照就是 user 看到的那個)。
    // 守衛:render 前後都看 View 是否已把 docs 容器藏起來(`showStory()` 給 `#storybook-docs` 加 `hidden`,index.js:5533-5534;
    // `prepareForDocs()` 會在任何 docs render 之前同步拿掉它,所以守衛不會誤殺正常 docs)。閘:`scripts/storybook-docs-race-invariant.mjs`。
    renderer: async () => {
      const { DocsRenderer } = await import('@storybook/addon-docs')
      const renderer = new DocsRenderer()
      const render = renderer.render
      renderer.render = async (context, docsParameter, element) => {
        if (element.hasAttribute('hidden')) return
        await render(context, docsParameter, element)
        if (element.hasAttribute('hidden')) renderer.unmount(element)
      }
      return renderer
    },
  },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/i,
    },
  },
  backgrounds: { disable: true },
  options: {
    storySort: {
      order: [
        'Design System',
        [
          'Tokens',
          'Components', ['*', ['展示', '設計規格', '設計原則']],
          'Patterns',
          'Internal', ['*', ['展示', '設計規格', '設計原則']],
          'Internal Patterns',
          '*',
        ],
        'Apps',
        '*',
      ],
    },
  },
}

// ── 示範收尾:示範 = 滑鼠使用者(2026-09-23 user 裁示)──
// Chromium 只把「真正的指標點擊」記成滑鼠聚焦;示範用的合成點擊(userEvent.click / element.click)不算,之後元件自己把焦點
// 搬進浮層(Radix FocusScope / react-day-picker autoFocus / DS dialog.tsx),瀏覽器就把它判成 :focus-visible、畫出鍵盤框
//(chromium selector_checker.cc `!last_focus_from_mouse || had_keyboard_event`;document.cc 忽略 FocusType::kScript)。
// user 原話:「我不要用滑鼠看範例結果直接就看到鍵盤焦點,我當下明明就沒有用鍵盤操作」。
// 每支 story 渲染(含 play)完成後:焦點若被判成鍵盤焦點、而且真的畫出 outline,就放掉;只放掉「畫得出線」的 ——
// 容器(outline none)與文字輸入框(插入點)不動,焦點行為照舊。要示範焦點的 story(滑鼠移過 / 鍵盤聚焦、焦點鎖、
// 焦點接力)用 `parameters.demoFocus = 'keep'` 宣告;閘 `scripts/story-demo-focus-invariant.mjs` 讀 `<html data-demo-focus>`
// 逐支驗。規則 owner:ds-canonical/rules/story-rules.md「示範 = 滑鼠使用者」。
export type DemoFocus = 'mouse' | 'keep'
const demoFocusOf = (parameters: Record<string, unknown> | undefined): DemoFocus =>
  parameters?.demoFocus === 'keep' ? 'keep' : 'mouse'
const releaseIfPaintedKeyboardFocus = (el: Element | null) => {
  if (!(el instanceof HTMLElement) || el === document.body) return
  if (!el.matches(':focus-visible')) return
  const style = getComputedStyle(el)
  const painted = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
  if (painted) el.blur()
}
// 渲染完之後還會有程式把焦點搬來搬去(Radix 選單關閉後把焦點還給觸發鈕、Dialog 量完內文後聚焦捲動區 ——
// 2026-09-23 全掃抓到 dialog long-content / list-body / tabs state-contract 三支在收尾之後才出現框)。
// 「使用者還沒碰過鍵盤」這段時間裡,任何被判成鍵盤焦點又畫得出線的聚焦都只能是程式搬的 → 一律放掉;
// 第一次真正的按鍵或指標按下就停止(之後的焦點是使用者自己的)。每支 story 重新掛一次,前一支的監聽先拆。
let stopWatching: (() => void) | null = null
const watchScriptFocusUntilUserInput = () => {
  stopWatching?.()
  const onFocusIn = (event: FocusEvent) => releaseIfPaintedKeyboardFocus(event.target as Element | null)
  const stop = () => {
    document.removeEventListener('focusin', onFocusIn, true)
    document.removeEventListener('keydown', stop, true)
    document.removeEventListener('pointerdown', stop, true)
    document.removeEventListener('mousedown', stop, true)
    if (stopWatching === stop) stopWatching = null
  }
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('keydown', stop, true)
  document.addEventListener('pointerdown', stop, true)
  document.addEventListener('mousedown', stop, true)
  stopWatching = stop
}
// 示範收尾只給「人在 Storybook 介面裡看」的情境:直接開 iframe.html 的是儀器(閘用 page.focus() 量焦點框、
// 沒有人在按鍵),收尾若照做會把它們量的焦點放掉 —— 2026-09-23 第一版全域開啟,datepicker-range-preview 閘的
// 鍵盤段當場紅(程式聚焦被放掉、方向鍵落在 body)。判準:在管理介面的 iframe 裡(window.parent !== window)才開;
// 儀器要看「user 看到的畫面」時自己帶 `?demoFocus=on`(visual-audit 拍基準圖、story-demo-focus 閘),`off` 強制關。
const demoFocusEnabled = () => {
  const param = new URLSearchParams(window.location.search).get('demoFocus')
  if (param === 'on') return true
  if (param === 'off') return false
  return window.parent !== window
}
export function settleDemoFocus(mode: DemoFocus) {
  if (!demoFocusEnabled()) { document.documentElement.dataset.demoFocus = 'instrument'; stopWatching?.(); return }
  document.documentElement.dataset.demoFocus = mode
  if (mode === 'keep') { stopWatching?.(); return }
  releaseIfPaintedKeyboardFocus(document.activeElement)
  watchScriptFocusUntilUserInput()
}
// 掛載時的 autoFocus 走 effect(Radix FocusScope / DayButton),等一幀再多一個 tick 才量,否則量到還沒聚焦的狀態
const afterNextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
export const sharedAfterEach: Preview['experimental_afterEach'] = [
  async ({ parameters }) => {
    await afterNextFrame()
    settleDemoFocus(demoFocusOf(parameters as Record<string, unknown>))
  },
]

export const sharedDecorators: Preview['decorators'] = [
  (Story, context) => {
    const theme = (context.globals.theme ?? 'light') as string
    const density = (context.globals.density ?? 'md') as string

    useEffect(() => {
      document.documentElement.setAttribute('data-theme', theme)
      document.documentElement.setAttribute('data-density', density)
    }, [theme, density])

    // 示範收尾的第二道(同一支函式):decorator 的 effect 在子樹 effect 之後跑,涵蓋沒有 play 的掛載即 autoFocus;
    // afterEach 涵蓋 play 之後。兩邊都呼叫同一支 settleDemoFocus,重複無害。
    useEffect(() => {
      let cancelled = false
      afterNextFrame().then(() => { if (!cancelled) settleDemoFocus(demoFocusOf(context.parameters)) })
      return () => { cancelled = true }
    }, [context.id, context.parameters])

    // Fullscreen layout 跳過 padding trick:position:fixed 元件相對 viewport,跟 padding 衝突
    const isFullscreen = context.parameters?.layout === 'fullscreen'
    const wrapperStyle: React.CSSProperties = isFullscreen
      ? { backgroundColor: 'var(--canvas)', color: 'var(--foreground)' }
      : {
          backgroundColor: 'var(--canvas)',
          color: 'var(--foreground)',
          margin: '-1rem',
          padding: '1rem',
        }

    return (
      <TooltipProvider delayDuration={500} skipDelayDuration={300}>
        <div style={wrapperStyle}>
          <Story />
        </div>
      </TooltipProvider>
    )
  },
]

const preview: Preview = {
  globalTypes: sharedGlobalTypes,
  parameters: sharedParameters,
  decorators: sharedDecorators,
  experimental_afterEach: sharedAfterEach,
}

export default preview
