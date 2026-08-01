#!/usr/bin/env node
// Canonical static data operations used by check_audit_post_report_validator.sh.
// Every command preserves the legacy hook fallback/output contract while keeping
// JavaScript source out of shell arguments.

import { readFileSync } from 'node:fs'

const [command, ...args] = process.argv.slice(2)

function exactArgs(count) {
  if (args.length !== count) process.exit(2)
  return args
}

function expectedDimensions() {
  const [matrixPath] = exactArgs(1)
  try {
    const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'))
    if (!Number.isSafeInteger(matrix.expected_dims) || matrix.expected_dims < 1) {
      throw new Error('invalid expected_dims')
    }
    console.log(matrix.expected_dims)
  } catch {
    console.log(91)
  }
}

function missingJudgmentPrompts() {
  const [matrixPath, promptsPath] = exactArgs(2)
  try {
    const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'))
    const judgment = Object.entries(matrix.coverage_by_dim)
      .filter(([, value]) => value.tier === 'PURE-JUDGMENT')
      .map(([key]) => +key)
    const prompts = readFileSync(promptsPath, 'utf8')
    const present = new Set(
      [...prompts.matchAll(/^##\s+(\d+)\./gm)].map((match) => +match[1]),
    )
    console.log(judgment.filter((dimension) => !present.has(dimension)).join(','))
  } catch {
    console.log('')
  }
}

function pureJudgmentCount() {
  const [matrixPath] = exactArgs(1)
  try {
    const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'))
    if (!matrix.coverage_by_dim || typeof matrix.coverage_by_dim !== 'object') {
      throw new Error('invalid coverage_by_dim')
    }
    console.log(
      Object.values(matrix.coverage_by_dim)
        .filter((value) => value.tier === 'PURE-JUDGMENT')
        .length,
    )
  } catch {
    console.log(23)
  }
}

function missingDecisionEvidence() {
  const [reportPath, peerProvider, peerDisplayName, reviewMode] = exactArgs(4)
  try {
    const text = readFileSync(reportPath, 'utf8')
    const marker = text.search(/待你拍板|拍板清單/)
    if (marker < 0) {
      console.log('')
      return
    }
    const lines = text.slice(marker).split('\n')
    const heading = /^\s*(?:\d+[.、)]|#{2,}\s*決策)/
    const blocks = []
    let current = null
    for (const line of lines) {
      if (heading.test(line)) {
        if (current !== null) blocks.push(current)
        current = line
      } else if (current !== null) {
        current += `\n${line}`
      }
    }
    if (current !== null) blocks.push(current)
    const requirements = [
      ['SSOT-check', (block) => /SSOT|既有拍板/.test(block)],
      ['世界級cite', (block) => /世界級|https?:\/\//.test(block)],
      ['design-fit', (block) => /設計語言|設計原則|design-fit/.test(block)],
    ]
    if (reviewMode === 'required') {
      requirements.splice(2, 0, ['peer-verdict', (block) => {
        const terms = [
          peerProvider,
          peerDisplayName,
          'independent peer',
          'peer verdict',
          '獨立審查',
          '辯論共識',
        ].filter(Boolean).map((value) => value.toLocaleLowerCase())
        const normalized = block.toLocaleLowerCase()
        return terms.some((term) => normalized.includes(term))
      }])
    } else if (!['waived', 'not-required'].includes(reviewMode)) {
      process.exit(2)
    }
    const missing = []
    blocks.forEach((block, index) => {
      const absent = requirements
        .filter(([, matches]) => !matches(block))
        .map(([name]) => name)
      if (absent.length) missing.push(`決策${index + 1} 缺[${absent.join('/')}]`)
    })
    console.log(missing.join(';'))
  } catch {
    console.log('')
  }
}

if (command === 'expected-dimensions') expectedDimensions()
else if (command === 'missing-judgment-prompts') missingJudgmentPrompts()
else if (command === 'pure-judgment-count') pureJudgmentCount()
else if (command === 'missing-decision-evidence') missingDecisionEvidence()
else process.exit(2)
