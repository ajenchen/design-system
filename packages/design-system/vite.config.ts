// 2026-05-22 Phase 1 team-distribution-roadmap:Vite library build for @qijenchen/design-system
// Per Decision A2(user 2026-05-22「照你建議做啊 我要世界級的」):vite build --lib(復用既有 Vite)
//
// Output:dist/index.{js,mjs,cjs} + dist/index.d.ts(via tsc emit separately, see tsconfig.json declaration:true)
// Consumer:`import { Button } from '@qijenchen/design-system'` 走 barrel,or subpath per package.json exports
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Internal package imports(specific-first per Vite alias ordering)
      { find: /^@\/design-system\/(.*)$/, replacement: path.resolve(__dirname, 'src/$1') },
      // Internal lib(cn utility etc.)— 2026-05-22 Phase 1.5 moved from root src/lib into package
      { find: /^@\/lib\/(.*)$/, replacement: path.resolve(__dirname, 'src/lib/$1') },
    ],
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    sourcemap: true,
    minify: false, // 保留可讀 source,便於 consumer debug
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        /^@radix-ui\//,
        /^@dnd-kit\//,
        '@tanstack/react-table',
        '@tanstack/react-virtual',
        'class-variance-authority',
        'clsx',
        'cmdk',
        'date-fns',
        'embla-carousel-react',
        'lucide-react',
        'next-themes',
        'react-day-picker',
        'react-zoom-pan-pinch',
        'recharts',
        'sonner',
        'tailwind-merge',
        'tailwindcss',
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
})
