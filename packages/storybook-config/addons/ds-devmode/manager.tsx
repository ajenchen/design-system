import React from 'react'
import { addons, types, useChannel } from '@storybook/manager-api'
import { IconButton } from '@storybook/components'
import { ADDON_ID, PANEL_ID, TOOL_ID, EVENTS, type DevmodeMode } from './constants'
import { DsDevmodePanel } from './Panel'

const ToolbarButton: React.FC = () => {
  const [mode, setMode] = React.useState<DevmodeMode>('off')
  const emit = useChannel({
    [EVENTS.TOGGLE]: (m: DevmodeMode) => setMode(m),
  })
  const next: DevmodeMode = mode === 'off' ? 'live' : 'off'
  const active = mode !== 'off'
  return (
    <IconButton
      key={TOOL_ID}
      title={active ? 'Disable DS Devmode (Alt+I)' : 'Enable DS Devmode (Alt+I)'}
      active={active}
      onClick={() => emit(EVENTS.TOGGLE, next)}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="7" r="1.2" fill="currentColor" />
      </svg>
    </IconButton>
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
