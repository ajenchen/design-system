// category-matrix.ts — Storybook 分類治理 typed SSOT wrapper(2026-06-05 RFC P1)。
//
// 單一來源(SSOT):每個 DS 單元屬哪 category + 每 category 該守什麼 storybook 規矩。
// 資料在 category-matrix.json(governance .mjs 腳本直接讀);本檔提供 typed 介面 + 決策樹 resolver
// 給 runtime 消費者(storybook-config sidebar order / 未來 docs 產生器)。改規矩只改 .json。
//
// 對應 RFC governance/planning/2026-06-05-storybook-category-taxonomy-rfc.md §10-11。

import matrixData from './category-matrix.json'

export type Category = 'token' | 'component' | 'pattern' | 'internal' | 'template'

export interface CategoryRule {
  goal: string
  titlePrefix: string
  titleParts: number | string
  visibility: 'public' | 'filtered' | 'consumer'
  sidebarOrder: number
  requiredStories: string
  renderDemo: string
  autodocs: boolean
  anatomyDiagram: string
  propsApiTable: boolean
  stateComboMatrix: string
  a11yTabTest: string
  visualRegression: string
  usageDoDont: string
  codeSnippet: string
  responsiveRtlDensity: string
  contentUxWriting: string
  openSnapshotCoverable: string
  traitShape: boolean | string
  classification: string
  rootBarrel: string
  universalGuard: boolean
}

export const CATEGORY_MATRIX = matrixData.categories as Record<Category, CategoryRule>

// 決策樹 resolver:由 folder path + frontmatter.isInternal 機械判 category。
// 對應 json._decisionTree;token/template 先判(folder 強訊號),再 isInternal,再 patterns/components。
export function resolveCategory(opts: { path: string; isInternal?: boolean }): Category {
  const p = opts.path.replace(/\\/g, '/')
  if (p.includes('/tokens/')) return 'token'
  if (p.includes('/apps/')) return 'template'
  if (opts.isInternal) return 'internal'
  if (p.includes('/components/Internal/')) return 'internal'
  if (p.includes('/patterns/')) return 'pattern'
  if (p.includes('/components/')) return 'component'
  return 'internal'
}

export function ruleFor(opts: { path: string; isInternal?: boolean }): CategoryRule {
  return CATEGORY_MATRIX[resolveCategory(opts)]
}
