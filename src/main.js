import { createApp } from 'vue'
import App from './App.vue'

// element-plus 样式由 unplugin-vue-components / unplugin-auto-import 按需注入
import 'element-plus/theme-chalk/dark/css-vars.css'

const app = createApp(App)

app.mount('#app')
