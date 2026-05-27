import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export const managerEntries = (entry: string[] = []) => [...entry, require.resolve('./manager.tsx')]
export const previewAnnotations = (entry: string[] = []) => [...entry, require.resolve('./preview.ts')]
