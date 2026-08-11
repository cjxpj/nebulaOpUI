import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import viteCompression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig({
  base: './',

  plugins: [
    vue(),
    vueDevTools(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    // 生成 .gz / .br 压缩产物，服务端开启对应编码后可大幅降低传输体积
    viteCompression({ algorithm: 'gzip', threshold: 10240 }),
    viteCompression({ algorithm: 'brotliCompress', threshold: 10240 }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 绕过 monaco-editor 0.56+ exports 字段对 esm/vs 子路径的限制
      'monaco-editor/esm/vs': fileURLToPath(
        new URL('./node_modules/monaco-editor/esm/vs', import.meta.url)
      ),
    },
  },
  build: {
    // element-plus / vue 按需分包，充分利用浏览器缓存；
    // monaco 随词库调试页动态加载，不强制分包（避免 vite 的 __vitePreload 运行时被归入大 chunk 导致首屏预加载）
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('element-plus') || id.includes('@element-plus')) return 'element-plus'
          if (id.includes('/node_modules/vue/') || id.includes('/node_modules/@vue/')) return 'vue'
        },
      },
    },
    // 分包后的 chunk 可能超过默认 500KB 警告阈值，按需加载不影响首屏
    chunkSizeWarningLimit: 2500,
  },
})
