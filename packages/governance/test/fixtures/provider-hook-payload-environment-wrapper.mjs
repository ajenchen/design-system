process.env.GOVERNANCE_TOOL_INPUT = 'n'.repeat(4 * 1024 * 1024)
process.env.CLAUDE_TOOL_INPUT = 'c'.repeat(4 * 1024 * 1024)
process.argv.push('--provider', 'claude', '--event', 'PreToolUse', '--group', '0')
await import('../../../../scripts/run-provider-hook.mjs')
