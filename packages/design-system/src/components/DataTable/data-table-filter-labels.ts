// @internal — DataTableFilterPanel chrome/operator/value-picker labels shared by
// panel orchestration, row/group rendering, and value-picker dispatch.

import type { DATE_RELATIVE_GROUPS, DATE_RELATIVE_OPTIONS } from './filter-operators'

type RelativeDateGroupKey = (typeof DATE_RELATIVE_GROUPS)[number]['key']
type RelativeDateValue = (typeof DATE_RELATIVE_OPTIONS)[number]['value']

export interface DataTableFilterPanelLabels {
  title: string
  resetToDefault: string
  close: string
  where: string
  and: string
  or: string
  conjunctionAriaLabel: string
  fieldPlaceholder: string
  fieldAriaLabel: string
  operatorPlaceholder: string
  operatorAriaLabel: string
  valuePlaceholder: string
  numberPlaceholder: string
  relativeDatePlaceholder: string
  singleSelectPlaceholder: string
  multiSelectPlaceholder: string
  multiSelectEmptyText: string
  peoplePlaceholder: string
  peopleSearchPlaceholder: string
  peopleSearchAriaLabel: string
  peopleEmptyText: string
  filterValueAriaLabel: (columnLabel?: string) => string
  deleteCondition: string
  addFilter: string
  addGroup: string
  addNestedFilter: string
  removeEmptyGroup: string
  /**
   * Operator key → visible label override. Missing keys fall back to
   * `OPERATOR_REGISTRY` labels, preserving the registry as the default SSOT.
   */
  operatorLabels: Partial<Record<string, string>>
  /** Relative-date group/value overrides; missing keys retain registry defaults. */
  relativeDateGroupLabels: Partial<Record<RelativeDateGroupKey, string>>
  relativeDateOptionLabels: Partial<Record<RelativeDateValue, string>>
}

// code-quality-allow: dead-export — public i18n defaults, re-exported by panel.
export const DATA_TABLE_FILTER_PANEL_DEFAULT_LABELS: DataTableFilterPanelLabels = {
  title: '篩選',
  resetToDefault: '恢復預設',
  close: '關閉',
  where: 'Where',
  and: 'And',
  or: 'Or',
  conjunctionAriaLabel: '連接詞 — 同 group 共用',
  fieldPlaceholder: '選擇欄位',
  fieldAriaLabel: '篩選欄位',
  operatorPlaceholder: '運算子',
  operatorAriaLabel: '篩選運算子',
  valuePlaceholder: '輸入值…',
  numberPlaceholder: '輸入數字…',
  relativeDatePlaceholder: '選擇相對日期',
  singleSelectPlaceholder: '選擇值',
  multiSelectPlaceholder: '選擇值…',
  multiSelectEmptyText: '沒有符合的值',
  peoplePlaceholder: '選擇人員',
  peopleSearchPlaceholder: '搜尋人員…',
  peopleSearchAriaLabel: '搜尋篩選人員',
  peopleEmptyText: '沒有符合的人員',
  filterValueAriaLabel: (columnLabel) => columnLabel ? `${columnLabel} 篩選值` : '篩選值',
  deleteCondition: '刪除',
  addFilter: '加篩選',
  addGroup: '加入篩選器',
  addNestedFilter: '加入巢狀篩選',
  removeEmptyGroup: '移除空群組',
  operatorLabels: {},
  relativeDateGroupLabels: {},
  relativeDateOptionLabels: {},
}

export function resolveDataTableFilterPanelLabels(
  overrides?: Partial<DataTableFilterPanelLabels>,
): DataTableFilterPanelLabels {
  return {
    ...DATA_TABLE_FILTER_PANEL_DEFAULT_LABELS,
    ...overrides,
    operatorLabels: {
      ...DATA_TABLE_FILTER_PANEL_DEFAULT_LABELS.operatorLabels,
      ...overrides?.operatorLabels,
    },
    relativeDateGroupLabels: {
      ...DATA_TABLE_FILTER_PANEL_DEFAULT_LABELS.relativeDateGroupLabels,
      ...overrides?.relativeDateGroupLabels,
    },
    relativeDateOptionLabels: {
      ...DATA_TABLE_FILTER_PANEL_DEFAULT_LABELS.relativeDateOptionLabels,
      ...overrides?.relativeDateOptionLabels,
    },
  }
}
