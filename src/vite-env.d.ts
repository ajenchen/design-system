/// <reference types="vite/client" />

// CSS 模組型別宣告
declare module '*.css' {
  const content: Record<string, string>
  export default content
}
