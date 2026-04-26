#!/usr/bin/env node
// Migrate spec.md frontmatter to include `traits:` array based on tsx cva structure.
// Idempotent: skips files already with `traits:` field.
//
// Inference rules:
//   hasVariants    — cva has `variant` key with ≥2 values
//   hasSizes       — cva has `size` key with ≥2 values
//   hasInteractiveStates — tsx contains hover:/focus:/disabled: classes
//   isOverlay      — tsx imports Radix Portal / Dialog / Popover / Sheet / Tooltip
//   isInputLike    — name matches Input/Textarea/Combobox/Select/NumberInput/PeoplePicker/LinkInput/DatePicker/TimePicker
//   isSelectionMulti — name matches Checkbox/RadioGroup
//   isSelectionSingle — name matches Switch
//   isMatrixHeavy  — name matches Avatar/Skeleton/Badge/Slider/Rating/CircularProgress/AspectRatio
//   isStructural   — name matches DataTable/Steps/Tabs/Accordion/Sidebar/Field/TreeView/Carousel/Chart/Empty/DescriptionList/Breadcrumb
//   isInternal     — title in stories.tsx starts with 'Design System/Internal/'

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const COMPONENTS_DIR = 'src/design-system/components';

const inputLike = new Set(['Input', 'Textarea', 'Combobox', 'Select', 'NumberInput', 'PeoplePicker', 'LinkInput', 'DatePicker', 'TimePicker', 'SelectMenu']);
const selectionMulti = new Set(['Checkbox', 'RadioGroup']);
const selectionSingle = new Set(['Switch']);
const matrixHeavy = new Set(['Avatar', 'Skeleton', 'Badge', 'Slider', 'Rating', 'CircularProgress', 'AspectRatio']);
const structural = new Set(['DataTable', 'Steps', 'Tabs', 'Accordion', 'Sidebar', 'Field', 'TreeView', 'Carousel', 'Chart', 'Empty', 'DescriptionList', 'Breadcrumb', 'SelectionControl']);
const overlayHints = ['DialogPrimitive', 'PopoverPrimitive', 'SheetPrimitive', 'TooltipPrimitive', 'HoverCardPrimitive', 'DropdownMenuPrimitive', 'createPortal', 'data-radix-portal'];

function inferTraits(name, tsxContent, storiesContent) {
  const traits = [];

  // hasVariants — cva variant key with ≥2 values
  const variantMatch = tsxContent.match(/variant:\s*\{([^}]*)\}/s);
  if (variantMatch) {
    const variantKeys = (variantMatch[1].match(/\b\w+:\s*[\[\{"']/g) || []).length;
    if (variantKeys >= 2) traits.push('hasVariants');
  }

  // hasSizes — cva size key with ≥2 values
  const sizeMatch = tsxContent.match(/size:\s*\{([^}]*)\}/s);
  if (sizeMatch) {
    const sizeKeys = (sizeMatch[1].match(/\b\w+:\s*[\[\{"']/g) || []).length;
    if (sizeKeys >= 2) traits.push('hasSizes');
  }

  // hasInteractiveStates — tsx contains state utility classes
  if (/(hover:|focus:|focus-visible:|disabled:|data-\[disabled|aria-disabled)/.test(tsxContent)) {
    traits.push('hasInteractiveStates');
  }

  // isOverlay
  if (overlayHints.some(h => tsxContent.includes(h))) {
    traits.push('isOverlay');
  }

  // Name-based traits
  if (inputLike.has(name)) traits.push('isInputLike');
  if (selectionMulti.has(name)) traits.push('isSelectionMulti');
  if (selectionSingle.has(name)) traits.push('isSelectionSingle');
  if (matrixHeavy.has(name)) traits.push('isMatrixHeavy');
  if (structural.has(name)) traits.push('isStructural');

  // isInternal — stories.tsx title starts with Internal/
  if (storiesContent && /title:\s*['"]Design System\/Internal\//.test(storiesContent)) {
    traits.push('isInternal');
  }

  return traits;
}

function findStoryFile(dir) {
  const files = readdirSync(dir);
  return files.find(f => f.endsWith('.stories.tsx') && !f.includes('anatomy') && !f.includes('principles'));
}

function findSpecFile(dir) {
  const files = readdirSync(dir);
  return files.find(f => f.endsWith('.spec.md'));
}

function findTsxFile(dir, name) {
  const files = readdirSync(dir);
  return files.find(f => f.endsWith('.tsx') && !f.includes('.stories.') && !f.includes('.test.'));
}

function migrateSpec(specPath, traits) {
  const content = readFileSync(specPath, 'utf-8');

  // Already has traits field? skip
  if (/^traits:/m.test(content.split('\n').slice(0, 20).join('\n'))) {
    return { status: 'skip', reason: 'already has traits' };
  }

  const traitsBlock = `traits:\n${traits.map(t => `  - ${t}`).join('\n')}\n`;

  // Has frontmatter? insert before closing ---
  if (content.startsWith('---\n')) {
    const closingIdx = content.indexOf('\n---\n', 4);
    if (closingIdx > 0) {
      const newContent = content.slice(0, closingIdx + 1) + traitsBlock + content.slice(closingIdx + 1);
      writeFileSync(specPath, newContent);
      return { status: 'updated', traits };
    }
  }

  // No frontmatter — prepend new one
  const componentName = basename(specPath, '.spec.md');
  const newFrontmatter = `---\ncomponent: ${componentName}\n${traitsBlock}---\n\n`;
  writeFileSync(specPath, newFrontmatter + content);
  return { status: 'created', traits };
}

const dirs = readdirSync(COMPONENTS_DIR).filter(d => statSync(join(COMPONENTS_DIR, d)).isDirectory());
const results = { updated: [], created: [], skipped: [], error: [] };

for (const name of dirs) {
  const dir = join(COMPONENTS_DIR, name);
  try {
    const specFile = findSpecFile(dir);
    if (!specFile) { results.error.push({ name, reason: 'no spec.md' }); continue; }

    const specPath = join(dir, specFile);
    const tsxFile = findTsxFile(dir, name);
    const storyFile = findStoryFile(dir);

    const tsxContent = tsxFile ? readFileSync(join(dir, tsxFile), 'utf-8') : '';
    const storyContent = storyFile ? readFileSync(join(dir, storyFile), 'utf-8') : '';

    const traits = inferTraits(name, tsxContent, storyContent);
    if (traits.length === 0) {
      results.skipped.push({ name, reason: 'no inferable traits' });
      continue;
    }

    const result = migrateSpec(specPath, traits);
    if (result.status === 'updated') results.updated.push({ name, traits });
    else if (result.status === 'created') results.created.push({ name, traits });
    else results.skipped.push({ name, reason: result.reason });
  } catch (e) {
    results.error.push({ name, reason: e.message });
  }
}

console.log('=== Trait migration results ===');
console.log(`Updated frontmatter: ${results.updated.length}`);
results.updated.forEach(r => console.log(`  ✓ ${r.name}: [${r.traits.join(', ')}]`));
console.log(`\nCreated frontmatter: ${results.created.length}`);
results.created.forEach(r => console.log(`  + ${r.name}: [${r.traits.join(', ')}]`));
console.log(`\nSkipped: ${results.skipped.length}`);
results.skipped.forEach(r => console.log(`  - ${r.name}: ${r.reason}`));
if (results.error.length) {
  console.log(`\nErrors: ${results.error.length}`);
  results.error.forEach(r => console.log(`  ✗ ${r.name}: ${r.reason}`));
}
