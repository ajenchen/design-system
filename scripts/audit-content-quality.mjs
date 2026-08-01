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
  anatomyCanonicalName: [], // anatomy 5-canonical(Overview/Inspector/ColorMatrix/SizeMatrix/StateBehavior)缺 / 名字錯
  anatomyNumberingGap: [],  // anatomy 編號跳號(6 後面是 8)
  showcaseDefault: [],      // showcase 缺 Default OR AllVariants
  perSizeSplit: [],         // hasSizes 卻拆 Small/Medium/Large(該 AllSizes grid)
  principlesCore: [],       // principles 缺 ≥ 2 universal core(periodic verify)
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

  // === Check 5a: Anatomy canonical names(2026-04-26 rules-derived)===
  // Per anatomy-standard.md L25-33: anatomy MUST use canonical export names
  if (isAnatomy) {
    const exportMatches = [...content.matchAll(/^export const ([A-Z]\w+)/gm)].map(m => m[1]);
    const canonicalNames = new Set(['Overview', 'Inspector', 'ColorMatrix', 'SizeMatrix', 'StateBehavior', 'Accessibility']);
    // At minimum need Overview;non-canonical names allowed(extras)but core 5 should be present
    const hasOverview = exportMatches.includes('Overview');
    if (!hasOverview && exportMatches.length > 0) {
      violations.anatomyCanonicalName.push({
        file: basename(file),
        issue: 'missing Overview canonical export'
      });
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
      violations.showcaseDefault.push({ file: basename(file), firstStory: '(empty)' });
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

  // === Check 5e: Principles ≥ 1 decision story(v3 integrated 2026-04-26)===
  // 對齊 Polaris/Material/Ant:ONE integrated `UsageGuidance` 已足夠
  // 接受 (a) UsageGuidance 單一 OR (b) legacy WhenToUse/WhenNotToUse/Vs*Rule ≥ 1
  // OR (c) 任 ≥ 2 exports total
  if (file.endsWith('.principles.stories.tsx')) {
    const exportMatches = [...content.matchAll(/^export const ([A-Z]\w+)/gm)].map(m => m[1]);
    const hasIntegrated = exportMatches.includes('UsageGuidance');
    const hasLegacy = exportMatches.some(e =>
      e === 'WhenToUse' || e === 'WhenNotToUse' || e === 'WhatItIs' || e === 'UsageScenarioRule' ||
      /^Vs[A-Z]/.test(e) || /[A-Z][a-z]+Vs[A-Z]/.test(e) ||
      /^(Forbidden|Donts|Pitfalls|Prohibitions|NonGoals|VisualDonts)/.test(e)
    );
    const valid = hasIntegrated || hasLegacy || exportMatches.length >= 2;
    if (!valid && exportMatches.length > 0) {
      violations.principlesCore.push({
        file: basename(file),
        coreCount: exportMatches.length,
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

if (violations.showcaseDefault.length > 0) {
  console.log(`\n[P1] Showcase missing Default/AllVariants: ${violations.showcaseDefault.length}`);
  violations.showcaseDefault.slice(0, 10).forEach(v => console.log(`  • ${v.file}: first=${v.firstStory}`));
}

if (violations.perSizeSplit.length > 0) {
  console.log(`\n[P0] Per-size split anti-pattern(should AllSizes grid): ${violations.perSizeSplit.length}`);
  violations.perSizeSplit.slice(0, 10).forEach(v => console.log(`  • ${v.file}: [${v.sizes.join(', ')}]`));
}

if (violations.principlesCore.length > 0) {
  console.log(`\n[P0] Principles missing ≥ 2 universal core: ${violations.principlesCore.length}`);
  violations.principlesCore.slice(0, 10).forEach(v => console.log(`  • ${v.file}: core=${v.coreCount}/2 exports=[${v.exports.join(', ')}]`));
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
