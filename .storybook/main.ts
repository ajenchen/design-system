import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  // 1. 確保路徑能掃描到你所有的 stories 檔案
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  
  addons: [
    "@storybook/addon-essentials", // 核心：包含 Controls, Actions, Viewport 等
    "@storybook/addon-a11y",         // 無障礙檢查 (對設計系統很重要)
    "@storybook/addon-docs",         // 自動生成文件
  ],

  framework: {
    name: "@storybook/react-vite",
    options: {
      // 這裡可以保持空白，Vite 會自動處理你的 design-system 目錄
    },
  },

  docs: {
    autodocs: "tag", // 支援在 .stories.tsx 中使用 tags: ["autodocs"]
  },

  // 2. 如果你的 Token 檔案很大，這能幫助 Vite 預熱
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
};

export default config;