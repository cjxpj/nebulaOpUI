import { defineConfig } from 'vite'
import baseConfig from './vite.config.js'

// 构建到 Go 项目静态资源目录的专用配置
export default defineConfig({
  ...baseConfig,
  build: {
    // 保留 baseConfig 的 manualChunks 分包等构建选项
    ...baseConfig.build,
    outDir: 'C:/Users/admin/Documents/go/nebula/nebula/appfiles/static/dic/public/opui',
    emptyOutDir: true,
  },
})
