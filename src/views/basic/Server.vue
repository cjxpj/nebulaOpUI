<script setup>
import { ref, onMounted } from 'vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= 全局共享配置 ================= */
const globalForm = ref({
  debug: false,
  temp_cleanup_interval: 60,
  dic_cache: false,
})

const loading = ref(false)
const loadFailed = ref(false)

/* ================= 开机自启开关 ================= */
const autostart = ref(false)
const togglingAutostart = ref(false)

/* ================= 初始化加载 ================= */
async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const [globalData, autostartData] = await Promise.all([
      apiPost({ type: 'get_global_config' }),
      apiPost({ type: 'get_autostart' }),
    ])

    globalForm.value = {
      debug: Boolean(globalData.debug),
      temp_cleanup_interval: globalData.temp_cleanup_interval ?? 60,
      dic_cache: Boolean(globalData.dic_cache),
    }

    autostart.value = Boolean(autostartData.enabled)
  } catch (e) {
    console.error('获取配置失败:', e)
    loadFailed.value = true
    ElMessage.error('获取配置失败')
  } finally {
    loading.value = false
  }
}

/* ================= 实时持久化全局配置 ================= */
async function onGlobalChange() {
  if (loadFailed.value) return

  try {
    await apiPost({
      type: 'save_global_config',
      data: {
        debug: globalForm.value.debug,
        temp_cleanup_interval: Number(globalForm.value.temp_cleanup_interval),
        dic_cache: globalForm.value.dic_cache,
      },
    })
    ElMessage.success('全局配置已更新')
  } catch (e) {
    console.error('保存全局配置失败:', e)
    ElMessage.error(e?.message || '保存全局配置失败')
  }
}

/* ================= 开机自启开关 ================= */
async function toggleAutoStart(val) {
  togglingAutostart.value = true
  try {
    const res = val
      ? await apiPost({ type: 'set_autostart' })
      : await apiPost({ type: 'cancel_autostart' })

    if (res.status === 'error') {
      throw new Error(res.error || '操作失败')
    }

    ElMessage.success(val ? '已开启开机自启' : '已关闭开机自启')
  } catch (e) {
    autostart.value = !val
    ElMessage.error(e?.message || '操作失败')
  } finally {
    togglingAutostart.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="page">
    <ElForm :model="globalForm" v-loading="loading" :label-position="isMobile ? 'top' : 'right'" class="global-form">
        <ElFormItem label="调试开关">
          <ElSwitch
            v-model="globalForm.debug"
            :disabled="loadFailed"
            inline-prompt
            active-text="开启"
            inactive-text="关闭"
            @change="onGlobalChange"
          />
          <div class="form-hint">
            开启后打印词库缓存及服务器调试信息，方便排查问题
          </div>
        </ElFormItem>

        <ElFormItem label="临时读写清理周期">
          <ElInput
            v-model="globalForm.temp_cleanup_interval"
            placeholder="60"
            :disabled="loadFailed"
            @change="onGlobalChange"
          >
            <template #suffix>秒</template>
          </ElInput>
          <div class="form-hint">
            临时读写数据（线程变量等）的清理周期，对所有服务器生效
          </div>
        </ElFormItem>

        <ElFormItem label="词库编译缓存">
          <ElSwitch
            v-model="globalForm.dic_cache"
            :disabled="loadFailed"
            inline-prompt
            active-text="开启"
            inactive-text="关闭"
            @change="onGlobalChange"
          />
          <div class="form-hint">
            开启后将词库编译结果缓存到 private/.dic_cache 加速加载，默认关闭
          </div>
        </ElFormItem>

        <ElFormItem label="开机自启">
          <ElSwitch
            v-model="autostart"
            :loading="togglingAutostart"
            :disabled="loadFailed || loading"
            inline-prompt
            active-text="已开启"
            inactive-text="已关闭"
            @change="toggleAutoStart"
          />
          <div class="form-hint">
            开启后，系统启动时将自动运行 Nebula 服务（Windows: 注册表，Linux: systemd，macOS: launchd）
          </div>
        </ElFormItem>
      </ElForm>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

.global-form {
  margin-top: 4px;
}

.form-hint {
  margin-top: 4px;
  flex-basis: 100%;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
