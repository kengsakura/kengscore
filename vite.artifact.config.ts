import { defineConfig, mergeConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import base from './vite.config'

/**
 * build สำหรับหน้าตัวอย่าง (Artifact บน claude.ai): โหมดสาธิตอย่างเดียว
 * ใช้ผ่าน `npm run build:artifact` (ดู scripts/build-artifact.mjs)
 */
export default mergeConfig(
  { ...base, build: { ...base.build, rollupOptions: {} } },
  defineConfig({
    base: './',
    define: { 'import.meta.env.VITE_ARTIFACT': JSON.stringify('1') },
    resolve: {
      alias: [{ find: /^\.\/fonts$/, replacement: fileURLToPath(new URL('./src/fonts.artifact.ts', import.meta.url)) }],
    },
    build: {
      outDir: 'dist-artifact',
      emptyOutDir: true,
      cssCodeSplit: false,
      modulePreload: false,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: 'app.js',
          assetFileNames: (info) => (info.names?.[0]?.endsWith('.css') ? 'app.css' : 'assets/[name]-[hash][extname]'),
        },
      },
    },
  }),
)
