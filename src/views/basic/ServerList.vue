<script setup>
import { ref, onMounted } from 'vue'
import { apiPost } from '@/api.js'
import { useMobile } from '@/composables/useMobile.js'

/* ================= 移动端适配 ================= */
const { isMobile } = useMobile()

/* ================= 函数启动的服务器列表 ================= */
const servers = ref([])

const loading = ref(false)
const loadFailed = ref(false)
const closingAddr = ref('')

/* ================= 编辑弹窗 ================= */
const editVisible = ref(false)
const saving = ref(false)
const editForm = ref(defaultEditForm())

function defaultEditForm() {
  return {
    addr: '',
    cors: true,
    tls: false,
    cert_file: '',
    key_file: '',
    frp_open: false,
    frp_server_addr: '',
    frp_token: '',
    frp_debug: false,
  }
}

/* ================= 初始化加载 ================= */
async function loadConfig() {
  loading.value = true
  loadFailed.value = false

  try {
    const res = await apiPost({ type: 'get_func_servers' })
    servers.value = (res.servers || []).map((s) => ({
      addr: s.addr || '',
      core: Boolean(s.core),
      cors: s.cors !== false,
      tls: Boolean(s.tls),
      cert_file: s.cert_file || '',
      key_file: s.key_file || '',
      frp_open: Boolean(s.frp_open),
      frp_server_addr: s.frp_server_addr || '',
      frp_token: s.frp_token || '',
      frp_debug: Boolean(s.frp_debug),
    }))
  } catch (e) {
    console.error('获取服务器列表失败:', e)
    loadFailed.value = true
    ElMessage.error('获取服务器列表失败')
  } finally {
    loading.value = false
  }
}

/* ================= 编辑 ================= */
function openEditServer(s) {
  editForm.value = {
    addr: s.addr,
    cors: s.cors,
    tls: s.tls,
    cert_file: s.cert_file,
    key_file: s.key_file,
    frp_open: s.frp_open,
    frp_server_addr: s.frp_server_addr,
    frp_token: s.frp_token,
    frp_debug: s.frp_debug,
  }
  editVisible.value = true
}

async function saveDialogServer() {
  saving.value = true
  try {
    await apiPost({
      type: 'save_func_server',
      data: {
        addr: editForm.value.addr,
        cors: editForm.value.cors,
        tls: editForm.value.tls,
        cert_file: editForm.value.cert_file,
        key_file: editForm.value.key_file,
        frp_open: editForm.value.frp_open,
        frp_server_addr: editForm.value.frp_server_addr,
        frp_token: editForm.value.frp_token,
        frp_debug: editForm.value.frp_debug,
      },
    })
    ElMessage.success('服务器已更新，立即生效')
    editVisible.value = false
    await loadConfig()
  } catch (e) {
    console.error('保存服务器失败:', e)
    ElMessage.error(e?.message || '保存服务器失败')
  } finally {
    saving.value = false
  }
}

/* ================= 关闭 ================= */
async function closeServer(s) {
  closingAddr.value = s.addr
  try {
    await apiPost({ type: 'close_func_server', data: { addr: s.addr } })
    ElMessage.success('服务器已关闭')
    await loadConfig()
  } catch (e) {
    console.error('关闭服务器失败:', e)
    ElMessage.error(e?.message || '关闭服务器失败')
  } finally {
    closingAddr.value = ''
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="page">
    <ElAlert type="info" :closable="false" show-icon class="server-hint">
      <template #title>
        函数服务器需在启动词库 <code>start.n</code> 中配置：调用 <code>$创建服务器$</code> 创建后调用 <code>$变量.启动$</code> 启动。本页仅用于查看与编辑运行中的服务器。
      </template>
    </ElAlert>

    <div class="server-list">
      <div v-loading="loading">
        <div v-if="servers.length === 0" class="empty-hint">
          暂无正在监听的服务器，可在词库中用 <code>$创建服务器 &lt;端口地址&gt; &lt;词库数据&gt;$</code> 创建后调用 <code>$变量.启动$</code> 启动
        </div>
        <div v-for="s in servers" :key="s.addr" class="server-item">
          <div class="server-info">
            <div class="server-addr">
              {{ s.addr || '未设置监听地址' }}
              <ElTag v-if="s.core" type="danger" size="small">核心</ElTag>
              <ElTag v-if="s.tls" type="success" size="small">HTTPS</ElTag>
              <ElTag v-if="s.frp_open" type="warning" size="small">BeerFrp</ElTag>
              <ElTag v-if="s.cors" type="info" size="small">CORS</ElTag>
            </div>
          </div>
          <div class="server-actions">
            <ElButton size="small" @click="openEditServer(s)">编辑</ElButton>
            <ElButton size="small" type="danger" :loading="closingAddr === s.addr" @click="closeServer(s)">
              关闭
            </ElButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 服务器编辑弹窗 -->
    <ElDialog
      v-model="editVisible"
      title="编辑服务器"
      :width="isMobile ? '92%' : '640px'"
      destroy-on-close
    >
      <ElForm :model="editForm" label-position="top">
        <ElFormItem label="监听地址">
          <ElInput v-model="editForm.addr" disabled />
          <div class="form-hint">
            端口地址在词库中创建时指定，如需改端口请重新调用 $创建服务器$ 函数
          </div>
        </ElFormItem>

        <ElFormItem label="跨域开关">
          <ElSwitch v-model="editForm.cors" inline-prompt active-text="开启" inactive-text="关闭" />
        </ElFormItem>

        <div class="section-title">HTTPS</div>

        <ElFormItem label="启用 HTTPS">
          <ElSwitch v-model="editForm.tls" inline-prompt active-text="开启" inactive-text="关闭" />
          <div class="form-hint">开启后使用证书加密传输，保存后立即重启监听生效</div>
        </ElFormItem>

        <ElFormItem label="证书文件路径">
          <ElInput
            v-model="editForm.cert_file"
            placeholder="private/https/cert.pem"
            :disabled="!editForm.tls"
          />
          <div class="form-hint">相对 private/https 或绝对路径</div>
        </ElFormItem>

        <ElFormItem label="密钥文件路径">
          <ElInput
            v-model="editForm.key_file"
            placeholder="private/https/key.pem"
            :disabled="!editForm.tls"
          />
        </ElFormItem>

        <div class="section-title">BeerFrp 穿透</div>

        <ElFormItem label="启用 BeerFrp">
          <ElSwitch v-model="editForm.frp_open" inline-prompt active-text="开启" inactive-text="关闭" />
          <div class="form-hint">开启后通过 WebSocket 连接 BeerWebFrp 服务端，断线自动重连</div>
        </ElFormItem>

        <ElFormItem label="服务端地址">
          <ElInput v-model="editForm.frp_server_addr" placeholder="wss://frp.example.com" />
          <div class="form-hint">BeerWebFrp 服务端 WebSocket 地址（ws/wss）</div>
        </ElFormItem>

        <ElFormItem label="密钥">
          <ElInput v-model="editForm.frp_token" placeholder="你的密钥" show-password />
        </ElFormItem>

        <ElFormItem label="调试日志">
          <ElSwitch v-model="editForm.frp_debug" inline-prompt active-text="开启" inactive-text="关闭" />
        </ElFormItem>

      </ElForm>

      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="saveDialogServer">确定</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
}

.server-hint {
  margin-bottom: 16px;
}

.server-hint code {
  padding: 1px 5px;
  background: var(--el-fill-color);
  border-radius: 4px;
  font-size: 12px;
}

.empty-hint {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.empty-hint code {
  padding: 1px 5px;
  background: var(--el-fill-color);
  border-radius: 4px;
  font-size: 12px;
}

.server-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  margin-bottom: 10px;
  transition: border-color 0.2s;
}

.server-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.server-info {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.server-addr {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.server-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  margin: 16px 0 12px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
  background: var(--el-fill-color);
  border-radius: 6px;
}

.form-hint {
  margin-top: 4px;
  flex-basis: 100%;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .server-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .server-actions {
    width: 100%;
  }
}
</style>
