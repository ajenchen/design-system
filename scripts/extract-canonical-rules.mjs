#!/usr/bin/env node
// Extract mechanizable rules from canonical sources + cross-check against
// audit coverage. Detects rules that exist in canonical text but lack
// mechanical detector in audit-content-quality.mjs.
//
// Auto-run on Stop event by hooks/stop_rule_coverage_audit.sh — when new
// rule appears in canonical without matching audit category → inject warn.
//
// Sources scanned:
//   - provider registry 宣告的 shared instruction entry(目前為 AGENTS.md)
//   - canonical skill root 下 story-writing/references/
// Generated provider homes are deliberately not authority inputs.
//
// Heuristic:rule has「禁止 X」/「必須 Y」/「不該 Z」/「Must / Required / Forbidden」
// → check if audit-content-quality.mjs 含 detection pattern matching keyword。

import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const ROOT = resolve(process.env.GOVERNANCE_PROJECT_DIR || process.cwd());
const CORPUS_ROOT = resolve(process.env.GOVERNANCE_CORPUS_ROOT || ROOT);
const REGISTRY_FILE = resolve(
  CORPUS_ROOT,
  process.env.GOVERNANCE_PROVIDER_REGISTRY || 'packages/governance/canonical/providers.json',
);

const repositoryPath = (value, label) => {
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.split(/[\\/]/).some((part) => part === '..' || part === '.')) {
    throw new Error(`${label} is not a safe repository-relative path`);
  }
  return value.replaceAll('\\', '/');
};

if (!existsSync(REGISTRY_FILE)) throw new Error(`canonical provider registry missing:${REGISTRY_FILE}`);
const registry = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8'));
const canonicalSkillRoot = repositoryPath(registry.canonical?.roots?.skills, 'canonical skill root');
const sharedInstructionEntries = [...new Set((registry.providers || [])
  .map((provider) => provider.sharedInstructionEntry)
  .filter(Boolean)
  .map((entry) => repositoryPath(entry, 'shared instruction entry')))];
if (sharedInstructionEntries.length === 0) throw new Error('canonical provider registry has no shared instruction entry');

const source = (base, file) => ({
  file: resolve(base, file),
  label: relative(ROOT, resolve(base, file)).replaceAll('\\', '/'),
});
const SOURCES = [
  ...sharedInstructionEntries.map((entry) => source(ROOT, entry)),
  source(CORPUS_ROOT, `${canonicalSkillRoot}/story-writing/references/category-templates.md`),
  source(CORPUS_ROOT, `${canonicalSkillRoot}/story-writing/references/anatomy-standard.md`),
  source(CORPUS_ROOT, `${canonicalSkillRoot}/story-writing/references/example-selection.md`),
];

const AUDIT_FILE = resolve(ROOT, 'scripts/audit-content-quality.mjs');

// Rule extraction patterns
const RULE_PATTERNS = [
  { re: /❌\s*禁止[:：]?\s*([^\n。.]{8,80})/g, type: 'forbidden' },
  { re: /必[須有]\s*([^\n。.]{8,80})/g, type: 'required' },
  { re: /不[該可]\s*([^\n。.]{8,80})/g, type: 'forbidden' },
  { re: /禁止\s+([^\n。.]{8,80})/g, type: 'forbidden' },
  { re: /\bMust\s+(?:not\s+)?([^\n.]{8,80})/g, type: 'required' },
  { re: /\bForbidden[:\s]+([^\n.]{8,80})/g, type: 'forbidden' },
];

const rules = [];
for (const src of SOURCES) {
  if (!existsSync(src.file)) continue;
  const content = readFileSync(src.file, 'utf-8');
  // Skip code blocks
  const stripped = content.replace(/```[\s\S]*?```/g, '');
  for (const { re, type } of RULE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const rule = m[1].trim();
      if (rule.length < 5) continue;
      // Find line number
      const upTo = stripped.slice(0, m.index);
      const line = upTo.split('\n').length;
      rules.push({ source: src.label, line, type, rule: rule.slice(0, 80) });
    }
  }
}

// Read audit script for keyword coverage
const auditContent = existsSync(AUDIT_FILE) ? readFileSync(AUDIT_FILE, 'utf-8') : '';
const auditKeywords = new Set();
// Extract obvious keywords audit looks for
const auditKwPatterns = [
  /['"`]([A-Z][a-zA-Z]{2,})['"`]/g,           // PascalCase identifiers
  /\\\b([\u4e00-\u9fa5]{2,8})\\\b/g,           // Chinese keywords in regex
  /['"]([\u4e00-\u9fa5]{2,15})['"]/g,         // Chinese in strings
];
for (const re of auditKwPatterns) {
  let m;
  while ((m = re.exec(auditContent)) !== null) {
    auditKeywords.add(m[1]);
  }
}

// Heuristic gap: rule mentions a keyword that audit doesn't reference
const KEYWORDS_TO_TRACK = [
  '佔位符', '抽象代號', '極端', '視覺符號', 'Lorem', 'Option', 'foo', 'bar',
  '中英夾雜', '夾雜', 'placeholder',
  '編號', '序號', 'numbering',
  'LinkTo', '對照', '見',
  'Default', 'AllVariants', 'AllSizes',
  'WhenToUse', 'WhenNotToUse', 'ContentGuidelines',
  'Vs', 'sibling',
  '空 render', '空白', 'empty',
  'ASCII', 'box drawing',
  'Hover me', 'Click me',
];

const gaps = [];
for (const rule of rules) {
  // Skip duplicates(same exact rule text already reported)
  if (gaps.some(g => g.rule === rule.rule)) continue;
  // Find keywords in this rule
  const ruleKws = KEYWORDS_TO_TRACK.filter(kw =>
    rule.rule.toLowerCase().includes(kw.toLowerCase())
  );
  if (ruleKws.length === 0) continue;
  // Check if any of these keywords have detector in audit
  const covered = ruleKws.some(kw =>
    auditContent.toLowerCase().includes(kw.toLowerCase())
  );
  if (!covered) {
    gaps.push({ ...rule, keywords: ruleKws });
  }
}

console.log(`\n=== Canonical rule coverage analysis ===\n`);
console.log(`Sources scanned: ${SOURCES.length}`);
console.log(`Rules extracted: ${rules.length}`);
console.log(`Audit keyword coverage gaps: ${gaps.length}`);

if (gaps.length > 0) {
  console.log(`\n[GAPS] Rules with keywords NOT detected by audit:`);
  gaps.slice(0, 15).forEach(g => {
    console.log(`  • ${g.source.split('/').pop()}:${g.line} [${g.type}] "${g.rule}"`);
    console.log(`    keywords missing: [${g.keywords.join(', ')}]`);
  });
  process.exit(1);
} else {
  console.log(`\n✅ All extracted rule keywords covered by audit-content-quality.mjs`);
  process.exit(0);
}
