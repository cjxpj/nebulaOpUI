<script setup>
import { ref } from 'vue'
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage, ElDialog } from 'element-plus'
import { config } from '@/config.js'

/* ================= 数据 ================= */
const form = ref({
  text: '',
})

const encrypting = ref(false)
const dialogVisible = ref(false)
const encryptedText = ref('')

/* ================= 加密 ================= */
async function encryptText() {
  if (!form.value.text.trim()) {
    ElMessage.warning('请输入需要加密的文本')
    return
  }

  encrypting.value = true
  try {
    const res = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'encrypt_dic',
        data: {
          text: form.value.text,
        },
      }),
    })

    if (!res.ok) {
      throw new Error('request failed')
    }

    const data = await res.json()
    encryptedText.value = data.text || ''
    dialogVisible.value = true
  } catch {
    ElMessage.error('加密失败')
  } finally {
    encrypting.value = false
  }
}

/* ================= 复制 ================= */
async function copyText() {
  try {
    await navigator.clipboard.writeText(encryptedText.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">加密词库</h2>
      <p class="page-subtitle">文本加密为词库格式</p>
    </div>

    <div class="panel-card">
      <ElForm :model="form">
        <ElFormItem label="原始文本">
          <ElInput v-model="form.text" type="textarea" :rows="6" placeholder="请输入需要加密的文本" />
        </ElFormItem>

        <ElFormItem>
          <div class="form-actions">
            <ElButton type="primary" :loading="encrypting" @click="encryptText"> 加密 </ElButton>
          </div>
        </ElFormItem>
      </ElForm>
    </div>

    <!-- 加密结果弹窗 -->
    <ElDialog v-model="dialogVisible" title="加密结果" width="600px">
      <div class="result-box">
        <ElButton class="copy-btn" size="small" text @click="copyText"> 复制 </ElButton>

        <ElInput v-model="encryptedText" type="textarea" :rows="8" readonly />
      </div>
    </ElDialog>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  max-width: 720px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.3px;
}

.page-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.panel-card {
  padding: 28px 32px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  transition: border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.form-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

/* 结果区域 */
.result-box {
  position: relative;
}

/* 右上角复制按钮 */
.copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
}

@media (max-width: 768px) {
  .panel-card {
    padding: 20px 16px;
  }

  .page-title {
    font-size: 18px;
  }
}
</style>
