/** @jsxRuntime classic */
// classic JSX(React.createElement)而非 react/jsx-runtime:manager addon 在 consumer(非 monorepo)
// Storybook build 中,`react` 被 externalize 到 manager 自身 React,但 `react/jsx-runtime` 會解析到
// 專案另一份 React → 元素 $$typeof 不符 → Minified React error #31 整個故事檢視空白。
// classic JSX 用已 externalize 的 React.createElement → 單一 React。(2026-05-29 fix:fork template 故事檢視空白 root cause)
import React from 'react'
import { addons, types, useChannel } from 'storybook/manager-api'
// 9.0 起 `@storybook/components` 併進 `storybook/internal/components`(MIGRATION.md「Dropped support for legacy packages」第二張表)。
// 10.1 起 IconButton 棄用、Button 的 `active` 棄用,開關型按鈕改用 ToggleButton(`pressed` → role=switch + aria-checked;
// MIGRATION.md「IconButton is deprecated」「Deprecated: active」)。
import { ToggleButton } from 'storybook/internal/components'
import { ADDON_ID, PANEL_ID, TOOL_ID, EVENTS, type DevmodeMode } from './constants'
import { DsDevmodePanel } from './Panel'

// `test-only` is a visibility role, not a Storybook removal tag: keep probes in
// index.json/direct URLs for automation while omitting them from reader navigation.
// 8.6 另有同名內建 tag(excludeFromSidebar + excludeFromDocsStories)兜著;10.0 移除了 x-only 內建 tag
//(MIGRATION.md「Removed x-only builtin tags」),側欄只靠這個 filter、docs 頁只靠 preview.tsx 的 docs.stories.filter。
addons.setConfig({
  sidebar: {
    filters: {
      testOnly: item => !item.tags?.includes('test-only'),
    },
  },
})

const ToolbarButton: React.FC = () => {
  const [mode, setMode] = React.useState<DevmodeMode>('off')
  const emit = useChannel({
    [EVENTS.TOGGLE]: (m: DevmodeMode) => setMode(m),
  })
  const next: DevmodeMode = mode === 'off' ? 'live' : 'off'
  const active = mode !== 'off'
  return (
    <ToggleButton
      key={TOOL_ID}
      variant="ghost"
      padding="small"
      pressed={active}
      ariaLabel="DS Devmode"
      tooltip={active ? 'Disable DS Devmode (Alt+I)' : 'Enable DS Devmode (Alt+I)'}
      onClick={() => emit(EVENTS.TOGGLE, next)}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="7" r="1.2" fill="currentColor" />
      </svg>
    </ToggleButton>
  )
}

addons.register(ADDON_ID, () => {
  addons.add(TOOL_ID, {
    type: types.TOOL,
    title: 'DS Devmode',
    match: ({ viewMode }) => viewMode === 'story',
    render: () => <ToolbarButton />,
  })

  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: 'DS Devmode',
    match: ({ viewMode }) => viewMode === 'story',
    render: ({ active }) => <DsDevmodePanel active={!!active} />,
  })
})
