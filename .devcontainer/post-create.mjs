#!/usr/bin/env node

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runWorkspacePostCreate } from '../scripts/lib/workspace-post-create.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
runWorkspacePostCreate({ root })
