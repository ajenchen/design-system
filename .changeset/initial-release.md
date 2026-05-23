---
"@qijenchen/design-system": minor
"@qijenchen/storybook-config": minor
---

Initial release(v0.1.0):

**@qijenchen/design-system**
- 62 components(Accordion / Alert / AppShell / Avatar / Button / Calendar / Carousel / Chart / Checkbox / Chip / Combobox / DataTable / DatePicker / Dialog / DropdownMenu / Field / FileViewer / Notice / NumberInput / Pagination / PeoplePicker / Popover / Progress / Radio / ScrollArea / SegmentedControl / Select / SelectMenu / Sheet / Sidebar / Slider / Steps / Switch / Tabs / TimePicker / Tooltip / TreeView / 等)
- 6 patterns(action-bar / element-anatomy / header-canonical / horizontal-overflow / overlay-surface / resize-handle)
- 10 token categories(color / typography / uiSize / layoutSpace / radius / opacity / elevation / motion / density / spacing)
- 4 hooks(use-controllable / use-is-narrow-viewport / use-is-touch-device / use-overflow-items)
- Vite library build:ESM + d.ts + per-component preserveModules
- Full TypeScript strict mode + 0 audit findings
- Aligned with Material UI / Polaris / Carbon / Ant / Atlassian world-class DS canonical

**@qijenchen/storybook-config**
- Shared addons preset(essentials / a11y / docs / links / html)
- Shared preview(globalTypes: theme / density + TooltipProvider wrap + storySort)
- Consumer dogfood via `import { sharedAddons, sharedFramework } from '@qijenchen/storybook-config/preset'`
