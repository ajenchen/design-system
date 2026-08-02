#!/usr/bin/env node
// Periodic content-quality audit for Storybook stories.
// Catches drift that write-time hooks miss — runs across ALL files, not single edit.
//
// Modes:
//   --check : report violations(exit 1 if any)
//   --fix   : auto-fix mechanical drift(numbering),report content-judgement issues
//
// Detects:
//   1. Anatomy stories with extras lacking number prefix(violates anatomy-standard.md)
//   2. Principles cross-references in plain text without LinkTo(對照X頁 / 見X / 跳X)
//   3. Auto-generated stub patterns(`<X> 場景` CamelCase split without real content)
//   4. Missing `name:` zh-CN on stories(showcase / principles)
//
// Usage from Stop hook: `node scripts/audit-content-quality.mjs --check` (silent if OK, warn if drift).

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import ts from 'typescript';

// Storybook also exposes token and pattern stories; a content gate limited to
// components would let reader-visible drift ship through those two IA branches.
const STORIES_DIR = 'packages/design-system/src';
const fix = process.argv.includes('--fix');

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (p.endsWith('.stories.tsx')) yield p;
  }
}

const markdownEmphasisPattern = /\*\*[^*\s](?:(?!\*\*)[\s\S])*?\*\*/g;

function propertyName(node) {
  if (!node.name) return null;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

function isDocsDescriptionMarkdown(node) {
  const ancestorProperties = [];
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isPropertyAssignment(parent)) ancestorProperties.push(propertyName(parent));
  }
  return ancestorProperties.some(name => name === 'component' || name === 'story')
    && ancestorProperties.includes('description')
    && ancestorProperties.includes('docs');
}

function findLiteralMarkdownEmphasis(file, content) {
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const samples = new Set();
  const addSample = value => {
    for (const match of value.matchAll(markdownEmphasisPattern)) {
      samples.add(match[0].replace(/\s+/g, ' ').trim().slice(0, 100));
    }
  };
  const visit = node => {
    if (ts.isJsxElement(node)) {
      let directTextSegment = '';
      const flushDirectText = () => {
        addSample(directTextSegment);
        directTextSegment = '';
      };
      for (const child of node.children) {
        if (ts.isJsxText(child)) {
          directTextSegment += child.text;
        } else if (
          ts.isJsxExpression(child)
          && child.expression
          && (
            ts.isIdentifier(child.expression)
            || ts.isStringLiteral(child.expression)
            || ts.isNoSubstitutionTemplateLiteral(child.expression)
            || ts.isTemplateExpression(child.expression)
          )
        ) {
          directTextSegment += child.expression.getText(sourceFile);
        } else {
          flushDirectText();
        }
      }
      flushDirectText();
    } else if (ts.isJsxText(node)) {
      addSample(node.text);
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && !isDocsDescriptionMarkdown(node)
    ) {
      addSample(node.text);
    } else if (ts.isTemplateExpression(node) && !isDocsDescriptionMarkdown(node)) {
      addSample(node.getText(sourceFile));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...samples];
}

const anatomyCanonicalDisplayNames = Object.freeze({
  Overview: '元件總覽',
  Inspector: '元件檢閱器',
  ColorMatrix: '色彩對照表',
  SizeMatrix: '尺寸對照表',
  StateBehavior: '狀態行為',
  Accessibility: '無障礙與鍵盤',
});

function unwrapExpression(node) {
  let current = node;
  while (
    current
    && (
      ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isSatisfiesExpression(current)
    )
  ) {
    current = current.expression;
  }
  return current;
}

function exportedStoryDefinitions(sourceFile) {
  const stories = new Map();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement)
      || !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const initializer = unwrapExpression(declaration.initializer);
      let displayName = null;
      if (initializer && ts.isObjectLiteralExpression(initializer)) {
        const nameProperty = initializer.properties.find(property =>
          ts.isPropertyAssignment(property) && propertyName(property) === 'name'
        );
        const nameInitializer = nameProperty && unwrapExpression(nameProperty.initializer);
        if (
          nameInitializer
          && (ts.isStringLiteral(nameInitializer) || ts.isNoSubstitutionTemplateLiteral(nameInitializer))
        ) displayName = nameInitializer.text;
      }
      stories.set(declaration.name.text, { displayName });
    }
  }
  return stories;
}

function anatomyRationaleHeader(content) {
  const firstImport = content.search(/^import\s/m);
  const header = content.slice(0, firstImport < 0 ? content.length : firstImport);
  const marker = header.indexOf('@anatomy-rationale:');
  return marker < 0 ? '' : header.slice(marker);
}

function hasScopedAnatomyRationale(rationaleHeader, section) {
  const sectionIndex = rationaleHeader.indexOf(section);
  if (sectionIndex < 0) return false;
  const afterSection = rationaleHeader.slice(sectionIndex);
  const separators = ['—', ' covered by ', ' represented as ', ' 集中在 ', ' 以 '];
  const separator = separators
    .map(value => ({ value, index: afterSection.indexOf(value) }))
    .filter(candidate => candidate.index >= 0)
    .sort((a, b) => a.index - b.index)[0];
  if (!separator) return false;
  const reason = afterSection
    .slice(separator.index + separator.value.length)
    .replace(/^[/\s*]+/gm, '')
    .trim();
  return reason.length >= 8;
}

const violations = {
  numbering: [],          // anatomy stories 不該有序號(2026-04-26 起 deprecated)
  nonAnatomyNumbering: [], // showcase/principles 不該有 numbering
  linkTo: [],
  stub: [],
  missingName: [],
  placeholderContent: [],  // Option A/B/C / Lorem / 抽象代號
  emptyStory: [],          // story render returns empty
  englishPlaceholder: [],  // 中文 stories 內 hardcoded English placeholder
  // === New(2026-04-26 rules-derived audit gap fix)===
  anatomyCanonicalName: [], // anatomy 6-canonical export / 中文顯示名 / omission rationale 漂移
  anatomyNumberingGap: [],  // anatomy 編號跳號(6 後面是 8)
  showcaseRepresentative: [], // showcase 缺任何 reader-facing representative story
  perSizeSplit: [],         // hasSizes 卻拆 Small/Medium/Large(該 AllSizes grid)
  principlesCore: [],       // principles 缺完整 integrated 或 split decision core
  asciiArt: [],             // 視覺符號(│─└┤ box drawing / ASCII arrow flow)
  // === 「人話」 proxies(2026-04-26 補)===
  noRealBrand: [],          // showcase story render 缺真實業務 brand reference
  thinDescription: [],      // parameters.docs.description.{component,story} stub / 太短 / 缺
  abstractName: [],         // story name 抽象代號(無描述性)
  literalMarkdownEmphasis: [], // JSX canvas 會原樣顯示 **星號**,不是 Markdown renderer
};
let autoFixed = 0;

for (const file of walk(STORIES_DIR)) {
  const isAnatomy = file.endsWith('.anatomy.stories.tsx');
  const isPrinciples = file.endsWith('.principles.stories.tsx');
  let content = readFileSync(file, 'utf-8');
  let modified = false;
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const exportedStories = exportedStoryDefinitions(sourceFile);

  // === Check 1: Anatomy numbering — DEPRECATED 2026-04-26 ===
  // user 反饋:序號(`'1. 元件總覽'` 等)無價值且容易跳號。改成 anatomy story name
  // 一律不加序號(`'元件總覽'` 等)。--fix 自動 strip 已有序號;--check report violation。
  if (isAnatomy) {
    const lines = content.split('\n');
    let stripped = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/(name:\s*['"])(\d+)\.\s*([^'"]+)(['"])/);
      if (m) {
        if (fix) {
          lines[i] = lines[i].replace(/(name:\s*['"])(\d+)\.\s*/, '$1');
          stripped = true;
          autoFixed++;
        } else {
          violations.numbering.push({ file: basename(file), name: `${m[2]}. ${m[3]}` });
        }
      }
    }
    if (stripped) { content = lines.join('\n'); modified = true; }
  }

  // === Check 2: Cross-reference plain text without LinkTo(only principles)===
  if (isPrinciples) {
    const linkToImported = /from\s+['"]@storybook\/addon-links/.test(content);
    const refPatterns = [
      /對照「展示」頁/g,
      /對照展示頁/g,
      /見「展示」/g,
      /見\s*Vs\*Rule/g,
      /跳到展示頁/g,
    ];
    let refCount = 0;
    for (const re of refPatterns) {
      const m = content.match(re);
      if (m) refCount += m.length;
    }
    if (refCount > 0 && !linkToImported) {
      violations.linkTo.push({ file: basename(file), refs: refCount });
    }
  }

  // === Check 3: Auto-generated stub pattern detection(showcase / principles)===
  // Signature: list items with CamelCase split format like「Foo Bar 場景」
  const stubPattern = /<li>\s*<strong>([A-Z]\w+)<\/strong>\s*—\s*\1\s*場景/g;
  const stubs = [...content.matchAll(stubPattern)];
  if (stubs.length > 0) {
    violations.stub.push({ file: basename(file), count: stubs.length });
  }

  // === Check 4a: Numbering in non-anatomy(violation — only anatomy uses numbering)===
  if (!isAnatomy) {
    const numberedNames = [...content.matchAll(/name:\s*['"](\d+\.\s*[^'"]+)['"]/g)];
    if (numberedNames.length > 0) {
      violations.nonAnatomyNumbering.push({
        file: basename(file),
        names: numberedNames.slice(0, 5).map(m => m[1])
      });
    }
  }

  // === Check 4b: Placeholder / abstract content(forbidden per CLAUDE.md `# Story`)===
  // Strip comments first(/* */ + // + leading * lines)to avoid false positives
  // when rules are *referenced* in comments.
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, '')        // /* ... */
    .replace(/^\s*\*.*$/gm, '')              // leading * (jsdoc)
    .replace(/\/\/.*$/gm, '');               // // line comments

  // === Check 4e: JSX canvas 中的 literal Markdown emphasis ===
  // Storybook canvas renders JSX text/attributes as plain text. Writing
  // `<Desc>這是**重點**</Desc>` or `note="這是**重點**"` leaks the asterisks
  // to readers; use React markup(<strong>)or concise plain text instead.
  const markdownEmphasisSamples = findLiteralMarkdownEmphasis(file, content);
  if (markdownEmphasisSamples.length > 0) {
    violations.literalMarkdownEmphasis.push({
      file: basename(file),
      count: markdownEmphasisSamples.length,
      samples: markdownEmphasisSamples.slice(0, 3),
    });
  }

  const forbiddenPatterns = [
    { re: /Option\s+[A-Z](?:\s|<|"|')/g, label: 'Option A/B/C' },
    { re: /Variant\s+[A-Z](?:\s|<|"|')/g, label: 'Variant X' },
    { re: /\bLorem ipsum/gi, label: 'Lorem ipsum' },
    { re: /\bfoo\s*bar\b/gi, label: 'foo bar' },
    { re: /按鈕[一二三四五]/g, label: '按鈕一/二/三' },
  ];
  for (const { re, label } of forbiddenPatterns) {
    const matches = stripped.match(re);
    if (matches && matches.length > 0) {
      violations.placeholderContent.push({ file: basename(file), label, count: matches.length });
    }
  }

  // === Check 4d: English placeholder text in JSX(中文 DS 內英文 demo text)===
  // 偵測 JSX 內的 hardcoded English UI text(只 1-3 個英文單字 + space):
  //   `>Hover me<` / `>Click me<` / `>Test 123<` / `>Submit<`(等)
  // 若 file 含 ≥ 1 中文字符(說明本是中文 stories),且 JSX 內出現此 pattern → flag
  if (!isAnatomy || file.endsWith('.anatomy.stories.tsx')) {
    const hasChinese = /[\u4e00-\u9fa5]/.test(stripped);
    if (hasChinese) {
      // JSX text node pattern: `>{2-3 short English words}<`
      // Match e.g. "Hover me", "Click me", "Test 123", "Try it"
      const englishJsxPattern = />\s*((?:Hover|Click|Try|Press|Submit|Cancel|Save|OK|Close|Open|Toggle|Tap)\s+(?:me|here|now|it|this|that)|(?:Hello|Hi)\s+world|Test\s+\d+|Lorem\s+\w+)\s*</gi;
      const placeholders = [...stripped.matchAll(englishJsxPattern)];
      if (placeholders.length > 0) {
        violations.englishPlaceholder.push({
          file: basename(file),
          samples: placeholders.slice(0, 3).map(m => m[1])
        });
      }
    }
  }

  // === Check 4c: Empty story render(無 visible JSX)===
  if (!isAnatomy) {
    const renderEmpty = /render:\s*\(\s*\)\s*=>\s*\(\s*<\s*(div|>)\s*\/>\s*\)/g;
    if (renderEmpty.test(content)) {
      violations.emptyStory.push({ file: basename(file) });
    }
  }

  // === Check 5a: Anatomy 6-canonical export + exact reader-facing names ===
  // Present sections require the exact canonical `name:`. A genuinely N/A section
  // must be named in the file-header @anatomy-rationale block with a non-empty reason;
  // a broad file-level marker never exempts unrelated sections.
  if (isAnatomy) {
    const rationaleHeader = anatomyRationaleHeader(content);
    for (const [exportName, expectedDisplayName] of Object.entries(anatomyCanonicalDisplayNames)) {
      const story = exportedStories.get(exportName);
      if (story) {
        if (story.displayName !== expectedDisplayName) {
          violations.anatomyCanonicalName.push({
            file: basename(file),
            issue: `${exportName} name=${JSON.stringify(story.displayName)}; expected ${JSON.stringify(expectedDisplayName)}`,
          });
        }
      } else if (exportName === 'Overview' || !hasScopedAnatomyRationale(rationaleHeader, exportName)) {
        violations.anatomyCanonicalName.push({
          file: basename(file),
          issue: exportName === 'Overview'
            ? 'missing required Overview export'
            : `missing ${exportName} without scoped @anatomy-rationale reason`,
        });
      }
    }
  }

  // === Check 5b: Anatomy numbering gap(全範圍 sequential 1→N,不允 N/A skip)===
  // 2026-04-26 改:user 反饋「跳號難看」— 之前允 1-5 canonical skip 已撤,
  // 改全 sequential。N/A section 用 @anatomy-rationale 註解 + 不開 export(自然不佔號)。
  if (isAnatomy) {
    const lines = content.split('\n');
    const nums = [];
    for (const line of lines) {
      const m = line.match(/name:\s*['"](\d+)\./);
      if (m) nums.push(parseInt(m[1]));
    }
    if (nums.length >= 2) {
      const uniqueSorted = [...new Set(nums)].sort((a, b) => a - b);
      for (let i = 1; i < uniqueSorted.length; i++) {
        if (uniqueSorted[i] !== uniqueSorted[i-1] + 1) {
          violations.anatomyNumberingGap.push({
            file: basename(file),
            gap: `${uniqueSorted[i-1]} → ${uniqueSorted[i]}`
          });
          break;
        }
      }
    }
  }

  // === Check 5c: Showcase 缺 stories ===
  // Per category-templates.md L29: universal Default 必有 — but scenario-driven
  // components(Calendar/Chart/Carousel)的 first scenario 即 Default。實際只需 ≥ 1 export。
  if (!isAnatomy && !file.endsWith('.principles.stories.tsx')) {
    const exportMatches = [...content.matchAll(/^export const ([A-Z]\w+)/gm)].map(m => m[1]);
    if (exportMatches.length === 0) {
      violations.showcaseRepresentative.push({ file: basename(file) });
    }
  }

  // === Check 5d: Per-size split anti-pattern(hasSizes → AllSizes 不該拆)===
  // Per category-templates.md L38: ❌ 禁止 per-size 拆 `Small`+`Medium`+`Large`
  if (!isAnatomy) {
    const exportMatches = [...content.matchAll(/^export const ([A-Z]\w+)/gm)].map(m => m[1]);
    const sizesSplit = exportMatches.filter(e => /^(Small|Medium|Large|SizeSm|SizeMd|SizeLg|XSmall|XLarge)$/.test(e));
    if (sizesSplit.length >= 2) {
      violations.perSizeSplit.push({
        file: basename(file),
        sizes: sizesSplit
      });
    }
  }

  // === Check 5e: Principles decision guidance ===
  // ONE complete integrated `UsageGuidance` is sufficient. Split style needs at
  // least two distinct decision dimensions; arbitrary extra stories do not earn
  // compliance merely by increasing the export count.
  if (file.endsWith('.principles.stories.tsx')) {
    const exportMatches = [...content.matchAll(/^export const ([A-Z]\w+)/gm)].map(m => m[1]);
    const hasIntegrated = exportMatches.includes('UsageGuidance');
    const decisionDimensions = new Set();
    for (const exportName of exportMatches) {
      if (exportName === 'WhenToUse' || exportName === 'WhatItIs' || exportName === 'UsageScenarioRule') decisionDimensions.add('when-to-use');
      if (exportName === 'WhenNotToUse' || /^(Forbidden|Donts|Pitfalls|Prohibitions|NonGoals|VisualDonts)/.test(exportName)) decisionDimensions.add('when-not-to-use');
      if (/^Vs[A-Z]/.test(exportName) || /[A-Z][a-z]+Vs[A-Z]/.test(exportName)) decisionDimensions.add('sibling-boundary');
      if (exportName === 'ContentGuidelines') decisionDimensions.add('content-guidelines');
    }
    const valid = hasIntegrated || decisionDimensions.size >= 2;
    if (!valid && exportMatches.length > 0) {
      violations.principlesCore.push({
        file: basename(file),
        coreCount: decisionDimensions.size,
        exports: exportMatches
      });
    }
  }

  // === Check 5f: ASCII art / box drawing in JSX ===
  // 偵測 ≥ 2 個連續 box-drawing chars(真 ASCII art)而非單個 dash/divider 文字裝飾
  const noCodeBlocks = stripped.replace(/`[^`]*`/g, '').replace(/\{[\s\S]*?\}/g, '');
  // Real ASCII art:連 2+ box drawing chars(╔══╗ / ─── 連續 / │ │ 框)
  const realArt = /[│┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬═║]{2,}/;
  if (realArt.test(noCodeBlocks)) {
    violations.asciiArt.push({
      file: basename(file),
      sample: (noCodeBlocks.match(/[^\n]{0,30}[│┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬═║]{2,}[^\n]{0,30}/) || [''])[0].trim().slice(0, 60)
    });
  }

  // === Check 5g: noRealBrand check DROPPED ===
  // 原規則檢查 scenario stories 缺 brand,但太多 false positive(視覺軸 demo
  // 如 Badge Dot / Avatar Shapes 不該需要 brand)。改靠 abstractName 為更精準
  // proxy(description 化命名 = 人話 / camelCase identifier copy = 抽象)。

  // === Check 5h: 「人話」proxy — Autodocs 導讀缺漏 / 太薄 / stub ===
  // Reader-facing Autodocs owner 必有 component 導讀：先說這個單元解決什麼，再說何時使用。
  // 機械層能可靠驗「存在 + 非 stub + 最低資訊量」；語意品質仍由 Storybook content audit 判斷。
  if (!isAnatomy) {
    const metaEnd = content.indexOf('export default');
    const metaSource = metaEnd >= 0 ? content.slice(0, metaEnd) : content;
    const hasAutodocs = /tags:\s*\[[^\]]*['"]autodocs['"]/.test(metaSource);
    const quotedDesc = content.match(/description:\s*\{[\s\S]{0,400}component:\s*(['"])([^'"\n]+)\1/);
    const templateDesc = content.match(/description:\s*\{[\s\S]{0,400}component:\s*`([\s\S]*?)(?<!\\)`/);
    const desc = quotedDesc?.[2] ?? templateDesc?.[1];
    if (hasAutodocs && desc === undefined) {
      violations.thinDescription.push({
        file: basename(file),
        where: 'component',
        desc: '[missing Autodocs component description]',
      });
    } else if (desc !== undefined) {
      // Stub indicators:< 15 chars,純英技術詞,只 component name
      const readableDesc = desc.replace(/[`*_#>-]/g, '').trim();
      if (readableDesc.length < 15 || /^\s*(TODO|WIP|FIXME)/i.test(readableDesc)) {
        violations.thinDescription.push({
          file: basename(file),
          where: 'component',
          desc: readableDesc.slice(0, 40),
        });
      }
    }
  }

  // === Check 5i: 「人話」proxy — story name 抽象代號 ===
  // name 是純 PascalCase identifier copy(沒中文 + 沒空格 + ≥ 2 連續大寫詞)
  // e.g. `name: 'MultiStepTour'`(直接 copy export id)vs `name: '多步驟導覽'`
  if (!isAnatomy && !file.endsWith('.principles.stories.tsx')) {
    const names = [...content.matchAll(/name:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    const abstractNames = names.filter(n =>
      // No Chinese, no space, looks like CamelCase identifier
      !/[\u4e00-\u9fa5]/.test(n) && !/\s/.test(n) && /^[A-Z][a-z]+[A-Z]/.test(n)
    );
    if (abstractNames.length > 0) {
      violations.abstractName.push({
        file: basename(file),
        names: abstractNames.slice(0, 4),
      });
    }
  }

  // === Check 6: Missing `name:` zh-CN(showcase + principles)===
  if (!isAnatomy) {
    const exportMatches = [...content.matchAll(/^export const ([A-Z]\w+)(?:\s*:\s*Story)?\s*=\s*\{/gm)];
    let missingNames = 0;
    for (const m of exportMatches) {
      // Check if this export has a name: 跟在後面 ~10 lines 內
      const startIdx = m.index;
      const slice = content.slice(startIdx, startIdx + 800);
      if (!/name:\s*['"]/.test(slice)) {
        missingNames++;
      }
    }
    if (missingNames > 0) {
      violations.missingName.push({ file: basename(file), count: missingNames });
    }
  }

  if (modified) writeFileSync(file, content);
}

const totalViolations = Object.values(violations).reduce((s, arr) => s + arr.length, 0);

console.log('=== Content quality audit ===\n');
console.log(`Mode: ${fix ? 'fix' : 'check'}`);
if (autoFixed > 0) console.log(`Auto-fixed: ${autoFixed} numbering drift`);

if (violations.numbering.length > 0) {
  console.log(`\n[P1] Anatomy stories 不該有序號(2026-04-26 deprecated): ${violations.numbering.length}`);
  console.log(`  跑 --fix 自動 strip 序號`);
  violations.numbering.slice(0, 10).forEach(v => console.log(`  • ${v.file}: "${v.name}"`));
}

if (violations.nonAnatomyNumbering.length > 0) {
  console.log(`\n[P0] Stories with numbering(序號全 deprecated 2026-04-26): ${violations.nonAnatomyNumbering.length} files`);
  violations.nonAnatomyNumbering.slice(0, 10).forEach(v => console.log(`  • ${v.file}: ${v.names.join(', ')}`));
}

if (violations.placeholderContent.length > 0) {
  console.log(`\n[P0] Placeholder / abstract content(forbidden per CLAUDE.md # Story): ${violations.placeholderContent.length}`);
  violations.placeholderContent.slice(0, 10).forEach(v => console.log(`  • ${v.file}: ${v.count}× "${v.label}"`));
}

if (violations.emptyStory.length > 0) {
  console.log(`\n[P0] Empty story render: ${violations.emptyStory.length}`);
  violations.emptyStory.slice(0, 10).forEach(v => console.log(`  • ${v.file}`));
}

if (violations.englishPlaceholder.length > 0) {
  console.log(`\n[P0] English placeholder in 中文 stories: ${violations.englishPlaceholder.length} files`);
  violations.englishPlaceholder.slice(0, 10).forEach(v =>
    console.log(`  • ${v.file}: ${v.samples.map(s => `"${s}"`).join(', ')}`)
  );
}

if (violations.anatomyCanonicalName.length > 0) {
  console.log(`\n[P0] Anatomy canonical names violation: ${violations.anatomyCanonicalName.length}`);
  violations.anatomyCanonicalName.slice(0, 10).forEach(v => console.log(`  • ${v.file}: ${v.issue}`));
}

if (violations.anatomyNumberingGap.length > 0) {
  console.log(`\n[P1] Anatomy numbering gap: ${violations.anatomyNumberingGap.length}`);
  violations.anatomyNumberingGap.slice(0, 10).forEach(v => console.log(`  • ${v.file}: ${v.gap}`));
}

if (violations.showcaseRepresentative.length > 0) {
  console.log(`\n[P1] Showcase missing a representative reader-facing story: ${violations.showcaseRepresentative.length}`);
  violations.showcaseRepresentative.slice(0, 10).forEach(v => console.log(`  • ${v.file}`));
}

if (violations.perSizeSplit.length > 0) {
  console.log(`\n[P0] Per-size split anti-pattern(should AllSizes grid): ${violations.perSizeSplit.length}`);
  violations.perSizeSplit.slice(0, 10).forEach(v => console.log(`  • ${v.file}: [${v.sizes.join(', ')}]`));
}

if (violations.principlesCore.length > 0) {
  console.log(`\n[P0] Principles missing integrated UsageGuidance or ≥2 split decision dimensions: ${violations.principlesCore.length}`);
  violations.principlesCore.slice(0, 10).forEach(v => console.log(`  • ${v.file}: decision dimensions=${v.coreCount}/2 exports=[${v.exports.join(', ')}]`));
}

if (violations.asciiArt.length > 0) {
  console.log(`\n[P0] ASCII art / box-drawing chars in JSX: ${violations.asciiArt.length}`);
  violations.asciiArt.slice(0, 10).forEach(v => console.log(`  • ${v.file}: "${v.sample}"`));
}

if (violations.noRealBrand.length > 0) {
  console.log(`\n[P1] Showcase scenarios 缺真實業務 brand(human-readable proxy): ${violations.noRealBrand.length}`);
  violations.noRealBrand.slice(0, 10).forEach(v => console.log(`  • ${v.file}: ${v.missingBrand.length}/${v.total} stories no brand: [${v.missingBrand.join(', ')}]`));
}

if (violations.thinDescription.length > 0) {
  console.log(`\n[P1] Autodocs component description missing / thin / stub: ${violations.thinDescription.length}`);
  violations.thinDescription.slice(0, 10).forEach(v => console.log(`  • ${v.file}: "${v.desc}..."`));
}

if (violations.abstractName.length > 0) {
  console.log(`\n[P1] Story name 抽象代號(直接 copy identifier): ${violations.abstractName.length}`);
  violations.abstractName.slice(0, 10).forEach(v => console.log(`  • ${v.file}: [${v.names.join(', ')}]`));
}

if (violations.literalMarkdownEmphasis.length > 0) {
  console.log(`\n[P1] Literal Markdown emphasis visible in JSX canvas: ${violations.literalMarkdownEmphasis.length} files`);
  violations.literalMarkdownEmphasis.slice(0, 10).forEach(v =>
    console.log(`  • ${v.file}: ${v.count}× ${v.samples.map(s => `"${s}"`).join(', ')}`)
  );
}

if (violations.linkTo.length > 0) {
  console.log(`\n[P1] Cross-ref plain text(should use LinkTo): ${violations.linkTo.length} files`);
  violations.linkTo.slice(0, 10).forEach(v => console.log(`  • ${v.file}: ${v.refs} refs`));
}

if (violations.stub.length > 0) {
  console.log(`\n[P0] Auto-generated stub pattern(non-human content): ${violations.stub.length} files`);
  violations.stub.slice(0, 10).forEach(v => console.log(`  • ${v.file}: ${v.count} stubs`));
}

if (violations.missingName.length > 0) {
  console.log(`\n[P1] Missing zh-CN name: ${violations.missingName.length} files`);
  violations.missingName.slice(0, 10).forEach(v => console.log(`  • ${v.file}: ${v.count} stories`));
}

if (totalViolations === 0) {
  console.log('\n✅ No content drift detected');
  process.exit(0);
} else {
  console.log(`\n⚠️  Total: ${totalViolations} violation(s)${fix ? ` (${autoFixed} auto-fixed)` : ''}`);
  process.exit(fix ? 0 : 1);
}
