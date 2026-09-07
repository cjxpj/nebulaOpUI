import { ref } from 'vue'

// QQ 列表「沙箱测试」注入的实例信息（跨组件传递到独立沙箱测试页面）
export const sandboxInject = ref(null)

export function injectSandboxInstance(inst) {
  sandboxInject.value = inst
}
